import { describe, expect, it } from 'vitest';
import type { PlannedPurchase } from '../types';
import { groupPurchases, inPurchaseView, purchaseLabels } from './purchasePlanner';

const purchase = (input: Partial<PlannedPurchase> = {}): PlannedPurchase => ({
  id: 'p1', title: 'Купить тару', group: '', tags: [], dueDate: null, ordered: false, ...input,
});

describe('списки покупок', () => {
  const today = '2026-11-18';

  it('оставляет просроченные покупки в списке «Сегодня», а заказанные в архиве', () => {
    expect(inPurchaseView(purchase({ dueDate: '2026-11-17' }), 'today', today)).toBe(true);
    expect(inPurchaseView(purchase({ dueDate: today }), 'today', today)).toBe(true);
    expect(inPurchaseView(purchase({ dueDate: '2026-11-19' }), 'today', today)).toBe(false);
    expect(inPurchaseView(purchase({ dueDate: '2026-11-19' }), 'upcoming', today)).toBe(true);
    expect(inPurchaseView(purchase(), 'undated', today)).toBe(true);
    expect(inPurchaseView(purchase({ dueDate: today, ordered: true }), 'today', today)).toBe(false);
    expect(inPurchaseView(purchase({ ordered: true }), 'ordered', today)).toBe(true);
  });

  it('собирает группу без учёта регистра и оставляет покупки без группы внизу', () => {
    const ungrouped = purchase({ id: 'a' });
    const first = purchase({ id: 'b', group: 'Упаковка' });
    const second = purchase({ id: 'c', group: 'упаковка' });
    expect(groupPurchases([ungrouped, first, second])).toEqual([
      ['упаковка', { label: 'Упаковка', items: [first, second] }],
      ['', { label: '', items: [ungrouped] }],
    ]);
  });

  it('убирает пустые и повторные метки, сохраняя написание первой', () => {
    expect(purchaseLabels([' Срочно ', '', 'срочно', ' Самовывоз '])).toEqual(['Срочно', 'Самовывоз']);
  });
});
