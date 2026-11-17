import type { Category, Expense, Filter, PeriodPreset } from '../types';
import { formatDate, toIso } from './format';

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
