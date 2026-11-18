import type { Expense, ExpenseLine, Product } from '../types';

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

export interface PurchasePrice extends PricePoint {
  quantity: number;
  totalCents: number;
}

/** Одна средневзвешенная цена товара на документ. Неполную партию нельзя оценить целиком. */
export function pricePoints(lines: ExpenseLine[], expenses: Expense[]): PurchasePrice[] {
  type Batch = { quantityMillis: number; totalCents: number; complete: boolean };
  const batches = new Map<string, Map<string, Batch>>();
  for (const line of lines) {
    if (!line.productId) continue;
    const products = batches.get(line.expenseId) ?? new Map<string, Batch>();
    const batch = products.get(line.productId) ?? { quantityMillis: 0, totalCents: 0, complete: true };
    if (line.baseQuantity && Number.isFinite(line.baseQuantity) && line.baseQuantity > 0 && Number.isFinite(line.lineTotal) && line.lineTotal >= 0) {
      batch.quantityMillis += Math.round(line.baseQuantity * 1000);
      batch.totalCents += Math.round(line.lineTotal * 100);
    } else {
      batch.complete = false;
    }
    products.set(line.productId, batch);
    batches.set(line.expenseId, products);
  }
  const result: PurchasePrice[] = [];
  const ordered = [...expenses].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const expense of ordered) {
    for (const [productId, batch] of batches.get(expense.id) ?? []) {
      if (!batch.complete || !batch.quantityMillis) continue;
      const quantity = batch.quantityMillis / 1000;
      result.push({
        expenseId: expense.id, date: expense.date, documentNumber: expense.documentNumber, vendor: expense.vendor,
        productId, quantity, totalCents: batch.totalCents, unitPrice: batch.totalCents / 100 / quantity,
      });
    }
  }
  return result;
}

export interface PriceImpact {
  product: Product;
  current: PurchasePrice;
  previous: PurchasePrice;
  amount: number;
  percent: number | null;
}

/** Цены передаются в порядке документов. Для всех счетов одного дня база — последний счёт более ранней даты. */
export function priceImpacts(points: PurchasePrice[], products: Product[], currentIds: Set<string>): PriceImpact[] {
  const catalog = new Map(products.map((p) => [p.id, p]));
  const latest = new Map<string, PurchasePrice>();
  const earlier = new Map<string, PurchasePrice>();
  const result: PriceImpact[] = [];
  for (const current of points) {
    const last = latest.get(current.productId);
    if (last && last.date < current.date) earlier.set(current.productId, last);
    latest.set(current.productId, current);
    const previous = earlier.get(current.productId);
    const product = catalog.get(current.productId);
    if (!previous || !product || !currentIds.has(current.expenseId)) continue;
    const difference = current.unitPrice - previous.unitPrice;
    // Считаем в копейках и тысячных единицы, чтобы результат в половину копейки округлялся симметрично.
    const priorQuantity = BigInt(Math.round(previous.quantity * 1000));
    const currentQuantity = BigInt(Math.round(current.quantity * 1000));
    const numerator = BigInt(current.totalCents) * priorQuantity - BigInt(previous.totalCents) * currentQuantity;
    const magnitude = numerator < 0n ? -numerator : numerator;
    const cents = (2n * magnitude + priorQuantity) / (2n * priorQuantity);
    result.push({
      product, current, previous,
      amount: Number(numerator < 0n ? -cents : cents) / 100,
      percent: previous.unitPrice > 0 ? difference / previous.unitPrice * 100 : null,
    });
  }
  return result.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || b.current.date.localeCompare(a.current.date));
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
  const last = earlier.reduce((a, b) => (b.date >= a.date ? b : a));
  const recent = earlier.filter((p) => now - parse(p.date) <= 90 * DAY);
  const cheapest = recent.length ? recent.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a)) : null;
  return {
    last,
    best90: cheapest && cheapest.unitPrice < unitPrice ? cheapest : null,
    deltaPct: last.unitPrice > 0 ? ((unitPrice - last.unitPrice) / last.unitPrice) * 100 : null,
  };
}

export interface ProductSummary {
  product: Product;
  last: PricePoint | null;
  /** Предыдущая закупка — для «было → стало». */
  prev: PricePoint | null;
  /** Последняя цена к предыдущей закупке, %. */
  changePct: number | null;
  /** Куплено за период в базовой единице товара. */
  boughtQuantity: number;
  boughtTotal: number;
}

/** Сводка по справочнику: последняя цена, её изменение и объём закупок за период (пустые границы — без ограничения). */
export function productSummaries(
  products: Product[],
  points: PricePoint[],
  lines: ExpenseLine[],
  expenses: Expense[],
  from: string,
  to: string,
): ProductSummary[] {
  const dateById = new Map(expenses.map((e) => [e.id, e.date]));
  const byProduct = new Map<string, PricePoint[]>();
  // «Последняя» и «предыдущая» цены — на конец периода: более поздние закупки в прошлый период не попадают
  for (const point of points) {
    if (to && point.date > to) continue;
    const history = byProduct.get(point.productId) ?? [];
    history.push(point);
    byProduct.set(point.productId, history);
  }
  const bought = new Map<string, { q: number; t: number }>();
  for (const l of lines) {
    const date = dateById.get(l.expenseId);
    if (!l.productId || !date || (from && date < from) || (to && date > to)) continue;
    const b = bought.get(l.productId) ?? { q: 0, t: 0 };
    b.q += l.baseQuantity ?? 0;
    b.t += l.lineTotal;
    bought.set(l.productId, b);
  }
  return products.map((product) => {
    const history = [...(byProduct.get(product.id) ?? [])].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
    const last = history.at(-1) ?? null;
    const prev = last ? history.filter((point) => point.date < last.date).at(-1) ?? null : null;
    const b = bought.get(product.id) ?? { q: 0, t: 0 };
    return {
      product,
      last,
      prev,
      changePct: last && prev && prev.unitPrice > 0 ? ((last.unitPrice - prev.unitPrice) / prev.unitPrice) * 100 : null,
      boughtQuantity: Math.round(b.q * 1000) / 1000,
      boughtTotal: Math.round(b.t * 100) / 100,
    };
  });
}
