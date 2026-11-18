import type { PlannedPurchase } from '../types';

export const PURCHASE_VIEWS = [
  ['active', 'К заказу'],
  ['today', 'Сегодня'],
  ['upcoming', 'Предстоящие'],
  ['undated', 'Без даты'],
  ['ordered', 'Заказано'],
] as const;

export type PurchaseView = typeof PURCHASE_VIEWS[number][0];

export const purchaseKey = (label: string) => label.trim().toLocaleLowerCase('ru');

export function purchaseLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  return labels.map((label) => label.trim()).filter((label) => {
    const key = purchaseKey(label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function inPurchaseView(item: PlannedPurchase, view: PurchaseView, today: string): boolean {
  if (view === 'ordered') return item.ordered;
  if (item.ordered) return false;
  switch (view) {
    case 'today': return item.dueDate !== null && item.dueDate <= today;
    case 'upcoming': return item.dueDate !== null && item.dueDate > today;
    case 'undated': return item.dueDate === null;
    default: return true;
  }
}

export function groupPurchases(items: PlannedPurchase[]) {
  const groups = new Map<string, { label: string; items: PlannedPurchase[] }>();
  for (const item of items) {
    const key = purchaseKey(item.group);
    let group = groups.get(key);
    if (!group) {
      group = { label: item.group, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups].sort(([a], [b]) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, 'ru', { numeric: true });
  });
}
