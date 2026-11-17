import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

try {
  process.loadEnvFile();
} catch {
  // .env необязателен
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.argv.includes('--prod');
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-4-hydrogen';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.5-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const MODELS = [...new Set([MODEL, ...FALLBACK_MODELS])];
const TRY_TIMEOUT_MS = 20_000; // на каждую модель, кроме последней
const LAST_TIMEOUT_MS = 45_000;
const COOLDOWN_MS = 10 * 60_000; // сколько не трогать модель после сбоя
const cooldown = new Map<string, number>();
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

interface CategoryRef {
  id: string;
  name: string;
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

function parseCategories(raw: unknown): CategoryRef[] {
  let list: unknown;
  try {
    list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    list = null;
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((c): c is CategoryRef => !!c && typeof c.id === 'string' && typeof c.name === 'string')
    .slice(0, 100)
    .map((c) => ({ id: c.id.slice(0, 80), name: c.name.slice(0, 80) }));
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildPrompt(categories: CategoryRef[], text: string, hasFile: boolean): string {
  return [
    'Ты — помощник бухгалтера. Извлеки бизнес-расходы из ' +
      (hasFile ? 'приложенного документа (счёт, чек, накладная)' : 'текстовой заметки') +
      '.',
    'Правила:',
    '- Каждый отдельный документ, чек или платёж — отдельный элемент items. Один счёт с несколькими позициями — это один расход с итоговой суммой к оплате (с НДС), позиции перечисли в description.',
    '- amount — итоговая сумма в российских рублях, число больше нуля, с копейками.',
    `- date — дата документа в формате YYYY-MM-DD. Сегодня ${todayIso()}; если год не указан, выбери ближайшую прошедшую дату. Если даты нет вовсе — сегодняшняя.`,
    '- vendor — контрагент (поставщик, продавец). Если неизвестен — пустая строка.',
    '- documentNumber — номер счёта, чека или накладной; если нет — пустая строка.',
    '- description — краткое назначение платежа на русском, до 200 символов.',
    '- categoryId — строго один из id направлений из списка ниже, наиболее подходящий по смыслу.',
    '- confidence — high, если все поля читаются однозначно; medium, если что-то пришлось додумывать; low, если документ неразборчив или сумма сомнительна.',
    '- Если расходов нет, верни пустой список items.',
    '',
    'Направления расходов:',
    ...categories.map((c) => `- id: ${c.id} — ${c.name}`),
    ...(text ? ['', 'Текст пользователя:', text] : []),
  ].join('\n');
}

function sanitizeItems(raw: unknown, categories: CategoryRef[]) {
  const ids = new Set(categories.map((c) => c.id));
  const fallback = categories.find((c) => c.name === 'Прочее')?.id ?? categories[categories.length - 1].id;
  const items = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return items
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const amount = Math.round(Number(o.amount) * 100) / 100;
      const date = str(o.date, 10);
      const confidence = str(o.confidence, 10);
      return {
        vendor: str(o.vendor, 120),
        date: /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : todayIso(),
        amount,
        description: str(o.description, 500),
        documentNumber: str(o.documentNumber, 60),
        categoryId: ids.has(str(o.categoryId, 80)) ? str(o.categoryId, 80) : fallback,
        confidence: confidence === 'high' || confidence === 'medium' ? confidence : 'low',
      };
    })
    .filter((it) => Number.isFinite(it.amount) && it.amount > 0)
    .slice(0, 50);
}

// --- Проверка входа: распознаванием пользуются только участники реестра ---
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const AUTH_CACHE_MS = 5 * 60_000;
const authCache = new Map<string, number>();

async function requireMember(req: Request, _res: Response, next: NextFunction) {
  // Демо-режим (облако не настроено): приложение локальное, входа нет
  if (!SUPABASE_URL || !SUPABASE_KEY) return next();
  try {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new HttpError(401, 'unauthorized', 'Войдите в аккаунт, чтобы распознавать документы.');
    const now = Date.now();
    if ((authCache.get(token) ?? 0) > now) return next();
    // Запрос идёт от имени пользователя: политики RLS отдают строки members только участникам,
    // а недействительный токен база отклоняет сама
    const r = await fetch(`${SUPABASE_URL}/rest/v1/members?select=email&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 401 || r.status === 403) throw new HttpError(401, 'unauthorized', 'Сессия истекла. Войдите заново.');
    if (!r.ok) throw new HttpError(502, 'auth_unavailable', 'Не удалось проверить вход. Попробуйте ещё раз.');
    const rows = (await r.json()) as unknown[];
    if (!rows.length) throw new HttpError(403, 'forbidden', 'У этой почты нет доступа к реестру.');
    if (authCache.size > 500) authCache.clear();
    authCache.set(token, now + AUTH_CACHE_MS);
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(502, 'auth_unavailable', 'Не удалось проверить вход. Попробуйте ещё раз.'));
  }
}

app.post('/api/expenses/extract', requireMember, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 20_000) : '';
    const categories = parseCategories(req.body?.categories);

    if (!file && !text) throw new HttpError(400, 'empty', 'Загрузите файл или введите текст расхода.');
    if (file && !ALLOWED_MIME.has(file.mimetype)) {
      throw new HttpError(415, 'bad_type', 'Поддерживаются только PDF, JPG, PNG и WEBP.');
    }
    if (!categories.length) throw new HttpError(400, 'no_categories', 'Не передан список направлений расходов.');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpError(
        503,
        'no_key',
        'Распознавание не настроено: на сервере не задан GEMINI_API_KEY. Расход можно добавить вручную.',
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const parts: Array<Record<string, unknown>> = [];
    if (file) parts.push({ inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } });
    parts.push({ text: buildPrompt(categories, text, !!file) });

    const responseSchema = {
      type: Type.OBJECT,
      required: ['items'],
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['vendor', 'date', 'amount', 'description', 'documentNumber', 'categoryId', 'confidence'],
            properties: {
              vendor: { type: Type.STRING },
              date: { type: Type.STRING, description: 'YYYY-MM-DD' },
              amount: { type: Type.NUMBER },
              description: { type: Type.STRING },
              documentNumber: { type: Type.STRING },
              categoryId: { type: Type.STRING, enum: categories.map((c) => c.id) },
              confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
            },
          },
        },
      },
    };

    // Основная модель может быть перегружена или недоступна по квоте — тогда пробуем запасные.
    // Модель, которая только что дала сбой, пропускаем на время COOLDOWN_MS.
    const now = Date.now();
    const candidates = MODELS.filter((m, i) => i === MODELS.length - 1 || (cooldown.get(m) ?? 0) < now);
    let responseText: string | undefined;
    for (const [i, model] of candidates.entries()) {
      const isLast = i === candidates.length - 1;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), isLast ? LAST_TIMEOUT_MS : TRY_TIMEOUT_MS);
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: { abortSignal: abort.signal, temperature: 0, responseMimeType: 'application/json', responseSchema },
        });
        responseText = response.text;
        if (model !== MODEL) console.log(`[extract] ответила запасная модель ${model}`);
        break;
      } catch (err) {
        const timedOut = abort.signal.aborted;
        const status = (err as { status?: number })?.status;
        console.error(`[extract] ${model}:`, timedOut ? 'нет ответа вовремя' : `ошибка ${status ?? ''} ${String((err as Error)?.message).slice(0, 300)}`);
        cooldown.set(model, Date.now() + COOLDOWN_MS);
        if (!isLast) continue;
        if (timedOut) {
          throw new HttpError(504, 'timeout', 'ИИ не ответил вовремя. Попробуйте ещё раз или добавьте расход вручную.');
        }
        if (status === 429) {
          throw new HttpError(429, 'quota', 'Исчерпан лимит запросов к ИИ. Попробуйте позже или добавьте расход вручную.');
        }
        throw new HttpError(502, 'ai_error', 'Сервис распознавания вернул ошибку. Попробуйте ещё раз позже.');
      } finally {
        clearTimeout(timer);
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText ?? '');
    } catch {
      throw new HttpError(502, 'bad_json', 'ИИ вернул ответ в неожиданном формате. Попробуйте ещё раз.');
    }

    res.json({ items: sanitizeItems(parsed, categories) });
  } catch (err) {
    next(err);
  }
});

app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res
      .status(tooLarge ? 413 : 400)
      .json({ code: tooLarge ? 'too_large' : 'bad_upload', message: tooLarge ? 'Файл больше 15 МБ.' : 'Не удалось принять файл.' });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  console.error('[api] Unexpected error:', err);
  res.status(500).json({ code: 'internal', message: 'Внутренняя ошибка сервера.' });
});

if (isProd) {
  const dist = path.join(__dirname, 'dist');
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(PORT, () => {
  console.log(`ФинУчет ИИ: http://localhost:${PORT} (${isProd ? 'production' : 'dev'}, модели: ${MODELS.join(' → ')})`);
  if (!process.env.GEMINI_API_KEY) console.log('GEMINI_API_KEY не задан — распознавание отключено, доступен ручной ввод.');
});
