import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { finalConfidence, type Confidence } from './server/confidence';
import { xlsxToText } from './server/xlsx';
import { linesMismatch, sanitizeLines } from './server/lines';
import { shortenVendor } from './server/vendor';

try {
  process.loadEnvFile();
} catch {
  // .env необязателен
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.argv.includes('--prod');
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.1-flash-lite,gemini-flash-lite-latest')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const MODELS = [...new Set([MODEL, ...FALLBACK_MODELS])];
// Скан или многостраничный PDF модель может читать полминуты, поэтому основной модели — больше времени.
// Общий бюджет меньше 90 секунд, которые ждёт браузер, чтобы пользователь получил внятную ошибку, а не обрыв.
const PRIMARY_TIMEOUT_MS = 40_000;
const FALLBACK_TIMEOUT_MS = 25_000;
const TOTAL_BUDGET_MS = 82_000;
const MIN_ATTEMPT_MS = 8_000; // меньше этого запасной модели давать бессмысленно
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Некоторые браузеры отдают .xlsx как application/octet-stream — тогда смотрим на расширение. */
function fileKind(file: Express.Multer.File): 'inline' | 'xlsx' | 'xls' | 'bad' {
  const name = file.originalname.toLowerCase();
  const generic = !file.mimetype || file.mimetype === 'application/octet-stream';
  if (file.mimetype === XLSX_MIME || (generic && name.endsWith('.xlsx'))) return 'xlsx';
  if (file.mimetype === 'application/vnd.ms-excel' || name.endsWith('.xls')) return 'xls';
  return ALLOWED_MIME.has(file.mimetype) ? 'inline' : 'bad';
}

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

interface ProductRef {
  id: string;
  name: string;
  unit: string;
  aliases: string[];
}

/** Справочник товаров из запроса. Передаём модели только нужное, чтобы не замедлять распознавание. */
function parseProducts(raw: unknown): ProductRef[] {
  let list: unknown;
  try {
    list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    list = null;
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((p): p is ProductRef => !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.unit === 'string')
    .slice(0, 2000)
    .map((p) => ({
      id: p.id.slice(0, 80),
      name: p.name.slice(0, 120),
      unit: p.unit.slice(0, 5),
      aliases: Array.isArray(p.aliases) ? p.aliases.filter((a): a is string => typeof a === 'string').slice(0, 3).map((a) => a.slice(0, 120)) : [],
    }));
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Source = 'file' | 'xlsx' | 'text';

function buildPrompt(categories: CategoryRef[], products: ProductRef[], text: string, source: Source): string {
  const what =
    source === 'file'
      ? 'приложенного документа (счёт, чек, накладная)'
      : source === 'xlsx'
        ? 'Excel-счёта, приведённого ниже как текст (строки таблицы, ячейки через табуляцию)'
        : 'текстовой заметки';
  return [
    `Ты — помощник бухгалтера. Извлеки бизнес-расходы из ${what}.`,
    'Правила:',
    '- Каждый отдельный документ, чек или платёж — отдельный элемент items. Один счёт с несколькими позициями — это один расход с итоговой суммой к оплате (с НДС), кратко перечисли позиции в description.',
    '- amount — итоговая сумма в российских рублях, число больше нуля, с копейками.',
    `- date — дата документа в формате YYYY-MM-DD. Сегодня ${todayIso()}; если год не указан, выбери ближайшую прошедшую дату. Если даты нет вовсе — сегодняшняя.`,
    '- vendor — контрагент (поставщик, продавец). Если неизвестен — пустая строка.',
    '- documentNumber — номер счёта, чека или накладной; если нет — пустая строка.',
    '- description — краткое назначение платежа на русском, до 200 символов.',
    '- categoryId — строго один из id направлений из списка ниже, наиболее подходящий по смыслу.',
    '- confidence — high только если сумма, дата и контрагент прочитаны однозначно, без догадок; medium, если хоть что-то пришлось додумывать или выбирать из нескольких вариантов; low, если документ неразборчив или сумма сомнительна. Не ставь high по умолчанию.',
    '- Если расходов нет, верни пустой список items.',
    '',
    'Позиции (lines) — каждая строка товаров или услуг документа:',
    '- rawName — название строки как в документе.',
    '- docQuantity и docUnit — количество и единица как в документе (например 10 и «меш»); если не указаны — 0 и пустая строка.',
    '- lineTotal — сумма строки С НДС. Если в документе цены без НДС, а НДС указан итогом, добавь НДС к строке по её ставке (если ставка указана у строки), иначе пропорционально сумме строки; тогда confidence не выше medium.',
    '- Сумма lineTotal по всем строкам должна совпадать с amount.',
    '- notGoods — true для услуг, доставки, работ, аренды, возвратной тары: такие строки не привязываются к товарам.',
    '- productId — id товара из справочника ниже, если это тот же товар (с учётом сокращений, сорта, фасовки и других названий); иначе пустая строка.',
    '- baseQuantity — количество в базовой единице товара: для товара из справочника — в его единице; для нового — в suggestedUnit. Пример: 10 мешков по 50 кг для товара в кг → 500. Если пересчитать нельзя — 0.',
    '- suggestedName и suggestedUnit — только для товара, которого нет в справочнике: короткое общее название без поставщика и фасовки (например «Мука пшеничная в/с») и единица из списка: кг, л, шт, м, уп. Иначе пустые строки.',
    '',
    'Направления расходов:',
    ...categories.map((c) => `- id: ${c.id} — ${c.name}`),
    '',
    products.length ? 'Справочник товаров (id — название, единица; другие названия):' : 'Справочник товаров пуст — для всех товаров предлагай новые.',
    ...products.map((p) => `- id: ${p.id} — ${p.name}, ${p.unit}${p.aliases.length ? `; ${p.aliases.join('; ')}` : ''}`),
    ...(text ? ['', source === 'xlsx' ? 'Содержимое Excel-счёта:' : 'Текст пользователя:', text] : []),
  ].join('\n');
}

function sanitizeItems(raw: unknown, categories: CategoryRef[], productIds: Set<string>) {
  const ids = new Set(categories.map((c) => c.id));
  const fallback = categories.find((c) => c.name === 'Прочее')?.id ?? categories[categories.length - 1].id;
  const items = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return items
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const amount = Math.round(Number(o.amount) * 100) / 100;
      const date = str(o.date, 10);
      const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
      const vendor = str(o.vendor, 120);
      const raw = str(o.confidence, 10);
      const modelConfidence: Confidence = raw === 'high' || raw === 'medium' ? raw : 'low';
      const lines = sanitizeLines(o.lines, productIds);
      return {
        lines,
        vendor: shortenVendor(vendor),
        date: dateValid ? date : todayIso(),
        amount,
        description: str(o.description, 500),
        documentNumber: str(o.documentNumber, 60),
        categoryId: ids.has(str(o.categoryId, 80)) ? str(o.categoryId, 80) : fallback,
        confidence: finalConfidence(modelConfidence, {
          vendorEmpty: !vendor,
          dateDefaulted: !dateValid,
          linesMismatch: linesMismatch(lines, amount),
          unclearNewProduct: lines.some((l) => !l.notGoods && !l.productId && (!l.suggestedUnit || l.baseQuantity === null)),
        }),
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
    let text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 20_000) : '';
    const categories = parseCategories(req.body?.categories);
    const products = parseProducts(req.body?.products);

    if (!file && !text) throw new HttpError(400, 'empty', 'Загрузите файл или введите текст расхода.');
    const kind = file ? fileKind(file) : null;
    if (kind === 'xls') throw new HttpError(415, 'old_excel', 'Старый формат .xls не поддерживается. Сохраните файл как .xlsx и загрузите снова.');
    if (kind === 'bad') throw new HttpError(415, 'bad_type', 'Поддерживаются только PDF, JPG, PNG, WEBP и XLSX.');
    if (file && kind === 'xlsx') {
      try {
        text = await xlsxToText(file.buffer);
      } catch (err) {
        if ((err as Error).message === 'empty') throw new HttpError(400, 'empty_excel', 'В таблице нет данных.');
        throw new HttpError(400, 'bad_excel', 'Не удалось прочитать Excel-файл. Проверьте, что он открывается в Excel.');
      }
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
    if (file && kind === 'inline') parts.push({ inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } });
    parts.push({ text: buildPrompt(categories, products, text, kind === 'inline' ? 'file' : kind === 'xlsx' ? 'xlsx' : 'text') });

    const responseSchema = {
      type: Type.OBJECT,
      required: ['items'],
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['vendor', 'date', 'amount', 'description', 'documentNumber', 'categoryId', 'confidence', 'lines'],
            properties: {
              vendor: { type: Type.STRING },
              date: { type: Type.STRING, description: 'YYYY-MM-DD' },
              amount: { type: Type.NUMBER },
              description: { type: Type.STRING },
              documentNumber: { type: Type.STRING },
              categoryId: { type: Type.STRING, enum: categories.map((c) => c.id) },
              confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ['rawName', 'docQuantity', 'docUnit', 'lineTotal', 'notGoods', 'productId', 'baseQuantity', 'suggestedName', 'suggestedUnit'],
                  properties: {
                    rawName: { type: Type.STRING },
                    docQuantity: { type: Type.NUMBER },
                    docUnit: { type: Type.STRING },
                    lineTotal: { type: Type.NUMBER },
                    notGoods: { type: Type.BOOLEAN },
                    productId: { type: Type.STRING },
                    baseQuantity: { type: Type.NUMBER },
                    suggestedName: { type: Type.STRING },
                    suggestedUnit: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      },
    };

    // Каждый запрос начинается с основной модели; если она перегружена, исчерпала квоту или молчит,
    // пробуем запасные, пока не кончится общий бюджет времени.
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    let responseText: string | undefined;
    let sawTimeout = false;
    let allQuota = true;
    for (const [i, model] of MODELS.entries()) {
      const remaining = deadline - Date.now();
      if (i > 0 && remaining < MIN_ATTEMPT_MS) break;
      const abort = new AbortController();
      const started = Date.now();
      const timer = setTimeout(() => abort.abort(), Math.min(i === 0 ? PRIMARY_TIMEOUT_MS : FALLBACK_TIMEOUT_MS, remaining));
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: { abortSignal: abort.signal, temperature: 0, responseMimeType: 'application/json', responseSchema },
        });
        responseText = response.text;
        console.log(`[extract] ${model}: ответ за ${Date.now() - started} мс${i > 0 ? ' (запасная модель)' : ''}`);
        break;
      } catch (err) {
        const timedOut = abort.signal.aborted;
        const status = (err as { status?: number })?.status;
        sawTimeout ||= timedOut;
        allQuota &&= status === 429;
        console.error(
          `[extract] ${model}:`,
          timedOut ? `нет ответа за ${Date.now() - started} мс` : `ошибка ${status ?? ''} ${String((err as Error)?.message).slice(0, 300)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    }

    if (responseText === undefined) {
      if (allQuota) {
        throw new HttpError(429, 'quota', 'Исчерпан лимит запросов к ИИ. Попробуйте позже или добавьте расход вручную.');
      }
      if (sawTimeout) {
        throw new HttpError(504, 'timeout', 'ИИ сейчас перегружен и не ответил вовремя. Попробуйте ещё раз через минуту или добавьте расход вручную.');
      }
      throw new HttpError(502, 'ai_error', 'Сервис распознавания вернул ошибку. Попробуйте ещё раз позже.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText ?? '');
    } catch {
      throw new HttpError(502, 'bad_json', 'ИИ вернул ответ в неожиданном формате. Попробуйте ещё раз.');
    }

    res.json({ items: sanitizeItems(parsed, categories, new Set(products.map((p) => p.id))) });
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
