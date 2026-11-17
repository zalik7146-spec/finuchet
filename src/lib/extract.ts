import type { Category, Confidence, Draft, SourceType } from '../types';
import { amountToInput, todayIso } from './format';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', XLSX_MIME];

/** .xlsx иногда приходит без MIME-типа — узнаём по расширению. */
export const isXlsx = (file: File) => file.type === XLSX_MIME || /\.xlsx$/i.test(file.name);

export function validateFile(file: File): string | null {
  if (/\.xls$/i.test(file.name)) return 'Старый формат .xls не поддерживается. Сохраните файл как .xlsx.';
  if (!ACCEPTED_MIME.includes(file.type) && !isXlsx(file)) return 'Неподдерживаемый формат. Загрузите PDF, JPG, PNG, WEBP или XLSX.';
  if (file.size > MAX_FILE_BYTES) return 'Файл больше 15 МБ.';
  if (file.size === 0) return 'Файл пустой.';
  return null;
}

export const newKey = () => crypto.randomUUID();

export function emptyDraft(categoryId: string, sourceType: SourceType = 'manual', sourceFileName = ''): Draft {
  return {
    key: newKey(),
    date: todayIso(),
    amount: '',
    vendor: '',
    description: '',
    documentNumber: '',
    categoryId,
    sourceType,
    sourceFileName,
    aiConfidence: 'high',
    isPurchase: false,
  };
}

interface ExtractedItem {
  vendor: string;
  date: string;
  amount: number;
  description: string;
  documentNumber: string;
  categoryId: string;
  confidence: Confidence;
}

export async function extractExpenses(
  input: { file?: File; text?: string },
  categories: Category[],
  accessToken?: string | null,
): Promise<Draft[]> {
  const body = new FormData();
  if (input.file) body.append('file', input.file);
  if (input.text) body.append('text', input.text);
  body.append('categories', JSON.stringify(categories.map((c) => ({ id: c.id, name: c.name }))));

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch('/api/expenses/extract', {
      method: 'POST',
      body,
      signal: abort.signal,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
  } catch {
    throw new Error(
      abort.signal.aborted
        ? 'Распознавание заняло слишком много времени. Попробуйте ещё раз.'
        : 'Нет связи с сервером распознавания. Проверьте подключение.',
    );
  } finally {
    clearTimeout(timer);
  }

  let data: { items?: ExtractedItem[]; message?: string } = {};
  try {
    data = await res.json();
  } catch {
    // тело не JSON — обработаем по статусу ниже
  }
  if (!res.ok) throw new Error(data.message || `Ошибка распознавания (код ${res.status}).`);

  const sourceType: SourceType = !input.file ? 'text' : isXlsx(input.file) ? 'excel' : input.file.type === 'application/pdf' ? 'pdf' : 'image';
  return (data.items ?? []).map((it) => ({
    key: newKey(),
    date: it.date,
    amount: amountToInput(it.amount),
    vendor: it.vendor,
    description: it.description,
    documentNumber: it.documentNumber,
    categoryId: it.categoryId,
    sourceType,
    sourceFileName: input.file?.name.slice(0, 200) ?? '',
    aiConfidence: it.confidence,
    isPurchase: false,
  }));
}
