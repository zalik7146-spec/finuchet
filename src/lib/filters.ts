import type { Category, Expense, Filter, PeriodPreset } from '../types';
import { formatDate, toIso } from './format';
import { normalizeVendor } from './duplicates';

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  thisMonth: 'Текущий месяц',
  lastMonth: 'Прошлый месяц',
  quarter: 'Квартал',
  year: 'Год',
  all: 'Всё время',
  custom: 'Диапазон',
};

/** Границы периода включительно; пустая строка — без ограничения. */
export function periodRange(f: Pick<Filter, 'preset' | 'from' | 'to'>, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (f.preset) {
    case 'thisMonth':
      return { from: toIso(new Date(y, m, 1)), to: toIso(new Date(y, m + 1, 0)) };
    case 'lastMonth':
      return { from: toIso(new Date(y, m - 1, 1)), to: toIso(new Date(y, m, 0)) };
    case 'quarter': {
      const q = Math.floor(m / 3) * 3;
      return { from: toIso(new Date(y, q, 1)), to: toIso(new Date(y, q + 3, 0)) };
    }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'all':
      return { from: '', to: '' };
    case 'custom':
      return { from: f.from, to: f.to };
  }
}

export function periodLabel(f: Filter): string {
  const { from, to } = periodRange(f);
  if (!from && !to) return 'Всё время';
  if (from && to) return `${formatDate(from)} — ${formatDate(to)}`;
  return from ? `с ${formatDate(from)}` : `по ${formatDate(to)}`;
}

export function applyFilter(expenses: Expense[], f: Filter): Expense[] {
  const { from, to } = periodRange(f);
  const q = f.search.trim().toLowerCase();
  const cats = new Set(f.categoryIds);
  return expenses
    .filter((e) => {
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      if (cats.size && !cats.has(e.categoryId)) return false;
      if (q && !`${e.vendor} ${e.description} ${e.documentNumber}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

/** Покупки, которые ещё не получены; сверху — те, что ждём дольше всего (от даты документа). */
export function awaitingReceipt(expenses: Expense[], today = toIso(new Date())): Array<{ expense: Expense; waitingDays: number }> {
  const t = parse(today).getTime();
  return expenses
    .filter((e) => e.isPurchase && e.receivedAt === null)
    .map((expense) => ({ expense, waitingDays: Math.max(0, Math.round((t - parse(expense.date).getTime()) / DAY)) }))
    .sort((a, b) => b.waitingDays - a.waitingDays);
}

/** Последние добавленные в программу — сверху, независимо от даты документа. */
export function recentFirst(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => b.createdAt - a.createdAt);
}

export interface CategoryTotal {
  id: string;
  name: string;
  color: string;
  total: number;
  count: number;
  share: number;
}

export function totalsByCategory(expenses: Expense[], categories: Category[]): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const acc = new Map<string, CategoryTotal>();
  let sum = 0;
  for (const e of expenses) {
    sum += e.amount;
    const cat = byId.get(e.categoryId);
    const row = acc.get(e.categoryId) ?? {
      id: e.categoryId,
      name: cat?.name ?? e.categoryName,
      color: cat?.color ?? '#94A3B8',
      total: 0,
      count: 0,
      share: 0,
    };
    row.total += e.amount;
    row.count += 1;
    acc.set(e.categoryId, row);
  }
  return [...acc.values()]
    .map((r) => ({ ...r, total: round2(r.total), share: sum ? r.total / sum : 0 }))
    .sort((a, b) => b.total - a.total);
}

export interface Bucket {
  key: string; // YYYY-MM-DD или YYYY-MM
  total: number;
  count: number;
}

const DAY = 86_400_000;
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Динамика: по дням для периодов до 62 дней, иначе по месяцам. Пустые интервалы заполняются нулями. */
export function timeline(expenses: Expense[], f: Filter): { granularity: 'day' | 'month'; buckets: Bucket[] } {
  if (!expenses.length) return { granularity: 'day', buckets: [] };
  const range = periodRange(f);
  const dates = expenses.map((e) => e.date).sort();
  const from = range.from || dates[0];
  const to = range.to || dates[dates.length - 1];
  const start = parse(from);
  const end = parse(to);
  const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  const granularity = days <= 62 ? 'day' : 'month';

  const map = new Map<string, Bucket>();
  if (granularity === 'day') {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      map.set(toIso(d), { key: toIso(d), total: 0, count: 0 });
    }
  } else {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      const key = toIso(d).slice(0, 7);
      map.set(key, { key, total: 0, count: 0 });
    }
  }
  for (const e of expenses) {
    const key = granularity === 'day' ? e.date : e.date.slice(0, 7);
    const b = map.get(key);
    if (b) {
      b.total = round2(b.total + e.amount);
      b.count += 1;
    }
  }
  return { granularity, buckets: [...map.values()] };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const sumAmounts = (expenses: Expense[]) => round2(expenses.reduce((s, e) => s + e.amount, 0));

const MONTHS_SHIFT: Partial<Record<PeriodPreset, number>> = { thisMonth: 1, lastMonth: 1, quarter: 3, year: 12 };

/** Предыдущий период той же длины — для сравнения «к прошлому периоду». Для «Всё время» сравнивать не с чем. */
export function previousPeriod(f: Filter, now = new Date()): { from: string; to: string } | null {
  const { from, to } = periodRange(f, now);
  if (!from || !to) return null;
  const shift = MONTHS_SHIFT[f.preset];
  if (shift) {
    const [y, m] = from.split('-').map(Number);
    const prevFrom = new Date(y, m - 1 - shift, 1);
    const prevEnd = new Date(y, m - 1, 0);
    // Период ещё идёт (текущий месяц, квартал, год) — сравниваем с тем же числом дней от начала прошлого
    const today = toIso(now);
    if (today >= from && today <= to) {
      const elapsed = Math.round((parse(today).getTime() - parse(from).getTime()) / DAY);
      const cut = new Date(prevFrom.getFullYear(), prevFrom.getMonth(), prevFrom.getDate() + elapsed);
      return { from: toIso(prevFrom), to: toIso(cut < prevEnd ? cut : prevEnd) };
    }
    return { from: toIso(prevFrom), to: toIso(prevEnd) };
  }
  const start = parse(from);
  const days = Math.round((parse(to).getTime() - start.getTime()) / DAY) + 1;
  const prevTo = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
  const prevFrom = new Date(prevTo.getFullYear(), prevTo.getMonth(), prevTo.getDate() - (days - 1));
  return { from: toIso(prevFrom), to: toIso(prevTo) };
}

/** Сумма расходов в границах дат включительно. */
export function sumInRange(expenses: Expense[], range: { from: string; to: string }): number {
  return round2(expenses.reduce((s, e) => (e.date >= range.from && e.date <= range.to ? s + e.amount : s), 0));
}

/** Топ поставщиков: написания одного контрагента («ООО Комус», «Комус») объединяются, показывается первое встреченное. */
export function totalsByVendor(expenses: Expense[], limit: number): Array<{ vendor: string; total: number; count: number }> {
  const acc = new Map<string, { vendor: string; total: number; count: number }>();
  for (const e of expenses) {
    const k = normalizeVendor(e.vendor) || e.vendor;
    const row = acc.get(k) ?? { vendor: e.vendor, total: 0, count: 0 };
    row.total = round2(row.total + e.amount);
    row.count += 1;
    acc.set(k, row);
  }
  return [...acc.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export type CategoryBucket = { key: string; total: number } & Record<string, number | string>;

/** Динамика с разбивкой по направлениям: в каждой корзине — сумма по каждому categoryId и общий итог. */
export function timelineByCategory(expenses: Expense[], f: Filter): { granularity: 'day' | 'month'; buckets: CategoryBucket[] } {
  const { granularity, buckets } = timeline(expenses, f);
  const map = new Map<string, CategoryBucket>(buckets.map((b) => [b.key, { key: b.key, total: b.total }]));
  for (const e of expenses) {
    const b = map.get(granularity === 'day' ? e.date : e.date.slice(0, 7));
    if (b) b[e.categoryId] = round2(((b[e.categoryId] as number | undefined) ?? 0) + e.amount);
  }
  return { granularity, buckets: [...map.values()] };
}
