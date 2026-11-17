export type BaseUnit = 'кг' | 'л' | 'шт' | 'м' | 'уп';
const UNITS = new Set<string>(['кг', 'л', 'шт', 'м', 'уп']);

export interface SanitizedLine {
  rawName: string;
  docQuantity: number | null;
  docUnit: string;
  baseQuantity: number | null;
  /** Сумма строки с НДС. */
  lineTotal: number;
  productId: string | null;
  notGoods: boolean;
  suggestedName: string;
  suggestedUnit: BaseUnit | '';
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const positive = (v: unknown, digits: number) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

/** Проверяет строки документа из ответа модели: выдуманные id товаров, нулевые количества и мусор отбрасываются. */
export function sanitizeLines(raw: unknown, productIds: Set<string>): SanitizedLine[] {
  if (!Array.isArray(raw)) return [];
  const out: SanitizedLine[] = [];
  for (const item of raw.slice(0, 200)) {
    const o = (item ?? {}) as Record<string, unknown>;
    const rawName = str(o.rawName, 300);
    const lineTotal = Math.round(Number(o.lineTotal) * 100) / 100;
    if (!rawName || !Number.isFinite(lineTotal) || lineTotal < 0) continue;
    const notGoods = o.notGoods === true;
    const id = str(o.productId, 80);
    const unit = str(o.suggestedUnit, 5);
    out.push({
      rawName,
      docQuantity: positive(o.docQuantity, 3),
      docUnit: str(o.docUnit, 20),
      baseQuantity: positive(o.baseQuantity, 3),
      lineTotal,
      productId: !notGoods && productIds.has(id) ? id : null,
      notGoods,
      suggestedName: notGoods ? '' : str(o.suggestedName, 120),
      suggestedUnit: !notGoods && UNITS.has(unit) ? (unit as BaseUnit) : '',
    });
  }
  return out;
}

/** Сумма строк расходится с итогом документа больше чем на 1 ₽. */
export function linesMismatch(lines: SanitizedLine[], amount: number): boolean {
  if (!lines.length) return false;
  const sum = lines.reduce((s, l) => s + l.lineTotal, 0);
  return Math.abs(sum - amount) > 1;
}
