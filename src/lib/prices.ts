import type { Expense, ExpenseLine } from '../types';

export interface PricePoint {
  expenseId: string;
  productId: string;
  vendor: string;
  date: string;
  documentNumber: string;
  /** Цена за базовую единицу товара с НДС. */
  unitPrice: number;
}

const DAY = 86_400_000;
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Закупки по товарам: только строки с товаром и количеством > 0, у существующих расходов. */
export function pricePoints(lines: ExpenseLine[], expenses: Expense[]): PricePoint[] {
  const byId = new Map(expenses.map((e) => [e.id, e]));
  const out: PricePoint[] = [];
  for (const l of lines) {
    const e = byId.get(l.expenseId);
    if (!e || !l.productId || !l.baseQuantity || l.baseQuantity <= 0) continue;
    out.push({
      expenseId: e.id,
      productId: l.productId,
      vendor: e.vendor,
      date: e.date,
      documentNumber: e.documentNumber,
      unitPrice: Math.round((l.lineTotal / l.baseQuantity) * 10_000) / 10_000,
    });
  }
  return out;
}

export interface PriceInsight {
  /** Последняя закупка этого товара с датой документа строго раньше текущей. */
  last: PricePoint | null;
  /** Самая низкая цена за 90 дней до даты документа — только если ниже текущей. */
  best90: PricePoint | null;
  /** Изменение к прошлой закупке, %. */
  deltaPct: number | null;
}

export function priceInsight(productId: string, unitPrice: number, date: string, points: PricePoint[], excludeExpenseId?: string): PriceInsight {
  const now = parse(date);
  const earlier = points.filter((p) => p.productId === productId && p.expenseId !== excludeExpenseId && p.date < date);
  if (!earlier.length) return { last: null, best90: null, deltaPct: null };
  const last = earlier.reduce((a, b) => (b.date > a.date ? b : a));
  const recent = earlier.filter((p) => now - parse(p.date) <= 90 * DAY);
  const cheapest = recent.length ? recent.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a)) : null;
  return {
    last,
    best90: cheapest && cheapest.unitPrice < unitPrice ? cheapest : null,
    deltaPct: last.unitPrice > 0 ? ((unitPrice - last.unitPrice) / last.unitPrice) * 100 : null,
  };
}
