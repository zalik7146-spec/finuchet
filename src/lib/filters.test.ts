import { expect, test } from 'vitest';
import { awaitingReceipt, recentFirst } from './filters';
import { exp } from './test-helpers';

test('recentFirst сортирует по времени добавления, а не по дате документа', () => {
  const a = exp({ id: 'a', date: '2026-11-20', createdAt: 1 });
  const b = exp({ id: 'b', date: '2026-10-01', createdAt: 2 });
  expect(recentFirst([a, b]).map((e) => e.id)).toEqual(['b', 'a']);
});

test('recentFirst не меняет исходный массив', () => {
  const list = [exp({ id: 'a', createdAt: 1 }), exp({ id: 'b', createdAt: 2 })];
  recentFirst(list);
  expect(list.map((e) => e.id)).toEqual(['a', 'b']);
});

test('awaitingReceipt: только неполученные покупки, по убыванию срока ожидания', () => {
  const list = [
    exp({ id: 'service', isPurchase: false, receivedAt: null, date: '2026-11-01' }),
    exp({ id: 'got', isPurchase: true, receivedAt: 1, date: '2026-11-01' }),
    exp({ id: 'new', isPurchase: true, receivedAt: null, date: '2026-11-15' }),
    exp({ id: 'old', isPurchase: true, receivedAt: null, date: '2026-11-03' }),
  ];
  expect(awaitingReceipt(list, '2026-11-17').map((x) => [x.expense.id, x.waitingDays])).toEqual([
    ['old', 14],
    ['new', 2],
  ]);
});

test('awaitingReceipt: документ с датой в будущем ждёт 0 дней', () => {
  expect(awaitingReceipt([exp({ isPurchase: true, receivedAt: null, date: '2026-11-20' })], '2026-11-17')[0].waitingDays).toBe(0);
});
