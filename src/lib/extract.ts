import type { BaseUnit, Category, Confidence, Draft, DraftLine, Product, SourceType } from '../types';
import { amountToInput, todayIso } from './format';
import { quantityToInput } from './draftLines';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', XLSX_MIME];

/** .xlsx иногда приходит без MIME-типа — узнаём по расширению. */
export const isXlsx = (file: File) => file.type === XLSX_MIME || /\.xlsx$/i.test(file.name);

export function validateFile(file: File): string | null {
  if (file.name.startsWith('~$')) {
    return 'Это временный файл, который Excel создаёт, пока документ открыт. Выберите сам документ — без «~$» в начале имени.';
  }
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
    lines: [],
  };
}

/** Пустая строка позиции для ручного добавления. */
export function emptyLine(): DraftLine {
  return { key: newKey(), rawName: '', productId: null, notGoods: false, docQuantity: '', docUnit: '', baseQuantity: '', lineTotal: '' };
}

interface ExtractedLine {
  rawName: string;
  docQuantity: number | null;
  docUnit: string;
  baseQuantity: number | null;
  lineTotal: number;
  productId: string | null;
  notGoods: boolean;
  suggestedName: string;
  suggestedUnit: BaseUnit | '';
}

function toDraftLine(l: ExtractedLine): DraftLine {
  return {
    key: newKey(),
    rawName: l.rawName,
    productId: l.productId,
    notGoods: l.notGoods,
    newProduct: !l.notGoods && !l.productId && l.suggestedName ? { name: l.suggestedName, unit: l.suggestedUnit || 'шт' } : undefined,
    docQuantity: quantityToInput(l.docQuantity),
    docUnit: l.docUnit,
    baseQuantity: quantityToInput(l.baseQuantity),
    lineTotal: amountToInput(l.lineTotal),
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
  lines?: ExtractedLine[];
}

export async function extractExpenses(
  input: { file?: File; text?: string },
  categories: Category[],
  products: Product[],
  accessToken?: string | null,
): Promise<Draft[]> {
  const body = new FormData();
  if (input.file) body.append('file', input.file);
  if (input.text) body.append('text', input.text);
  body.append('categories', JSON.stringify(categories.map((c) => ({ id: c.id, name: c.name }))));
  body.append('products', JSON.stringify(products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, aliases: p.aliases.slice(0, 3) }))));

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
    // Покупка товара — если среди строк есть товар
    isPurchase: (it.lines ?? []).some((l) => !l.notGoods),
    lines: (it.lines ?? []).map(toDraftLine),
  }));
}
