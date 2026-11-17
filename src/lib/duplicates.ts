import type { Expense } from '../types';

export type DupFields = Pick<Expense, 'vendor' | 'amount' | 'date' | 'documentNumber'>;

const LEGAL_FORMS = /^(ооо|оао|зао|пао|ао|ип|нао)\s+/;

/** Название контрагента для сравнения: без регистра, кавычек и организационно-правовой формы. */
export function normalizeVendor(s: string): string {
  return s
    .toLowerCase()
    .replace(/[«»"'“”„]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEGAL_FORMS, '')
    .trim();
}

const normalizeNumber = (s: string) => s.toLowerCase().replace(/[\s№#]/g, '');

/**
 * Дубль: тот же контрагент и тот же непустой номер документа;
 * либо, если номера нет хотя бы у одного, — тот же контрагент, сумма и дата.
 */
export function isDuplicate(a: DupFields, b: DupFields): boolean {
  const va = normalizeVendor(a.vendor);
  if (!va || va !== normalizeVendor(b.vendor)) return false;
  const na = normalizeNumber(a.documentNumber);
  const nb = normalizeNumber(b.documentNumber);
  if (na && nb) return na === nb;
  return Math.round(a.amount * 100) === Math.round(b.amount * 100) && a.date === b.date;
}

export function findMatchesFor(d: DupFields, expenses: Expense[], excludeExpenseId?: string): Expense[] {
  return expenses.filter((e) => e.id !== excludeExpenseId && isDuplicate(d, e));
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function findDuplicatePairs(expenses: Expense[], dismissed: Set<string>): Array<[Expense, Expense]> {
  // Группируем по контрагенту, чтобы не сравнивать всё со всем
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    const v = normalizeVendor(e.vendor);
    if (!v) continue;
    groups.set(v, [...(groups.get(v) ?? []), e]);
  }
  const pairs: Array<[Expense, Expense]> = [];
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = list[i].id < list[j].id ? [list[i], list[j]] : [list[j], list[i]];
        if (isDuplicate(a, b) && !dismissed.has(pairKey(a.id, b.id))) pairs.push([a, b]);
      }
    }
  }
  return pairs;
}
