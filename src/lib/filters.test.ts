import { expect, test } from 'vitest';
import type { Filter } from '../types';
import { awaitingReceipt, previousPeriod, recentFirst, timeline, timelineByCategory, totalsByVendor } from './filters';
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

const f = (preset: Filter['preset'], from = '', to = ''): Filter => ({ preset, from, to, categoryIds: [], search: '' });

test('previousPeriod: текущий месяц 17 ноября → 1–17 октября (столько же дней)', () => {
  expect(previousPeriod(f('thisMonth'), new Date(2026, 10, 17))).toEqual({ from: '2026-10-01', to: '2026-10-17' });
});

test('previousPeriod: 31 марта → прошлый месяц обрезается по его концу', () => {
  expect(previousPeriod(f('thisMonth'), new Date(2026, 2, 31))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
});

test('previousPeriod: прошлый месяц уже закончился → сравнивается целиком', () => {
  expect(previousPeriod(f('lastMonth'), new Date(2026, 10, 17))).toEqual({ from: '2026-09-01', to: '2026-09-30' });
});

test('previousPeriod: год на 17 ноября → прошлый год по 17 ноября', () => {
  expect(previousPeriod(f('year'), new Date(2026, 10, 17))).toEqual({ from: '2025-01-01', to: '2025-11-17' });
});

test('previousPeriod: квартал 17 ноября → июль–17 августа (столько же дней от начала)', () => {
  expect(previousPeriod(f('quarter'), new Date(2026, 10, 17))).toEqual({ from: '2026-07-01', to: '2026-08-17' });
});

test('previousPeriod: произвольный диапазон → такой же длины перед ним', () => {
  expect(previousPeriod(f('custom', '2026-11-11', '2026-11-20'))).toEqual({ from: '2026-11-01', to: '2026-11-10' });
});

test('previousPeriod: всё время → null', () => {
  expect(previousPeriod(f('all'))).toBeNull();
});

test('totalsByVendor объединяет написания контрагента и показывает первое', () => {
  const list = [exp({ id: 'a', vendor: 'ООО «Комус»', amount: 100 }), exp({ id: 'b', vendor: 'Комус', amount: 50 }), exp({ id: 'c', vendor: 'Софтлайн', amount: 120 })];
  expect(totalsByVendor(list, 10)).toEqual([
    { vendor: 'ООО «Комус»', total: 150, count: 2 },
    { vendor: 'Софтлайн', total: 120, count: 1 },
  ]);
});

test('totalsByVendor ограничивает число строк', () => {
  const list = [exp({ id: 'a', vendor: 'А', amount: 3 }), exp({ id: 'b', vendor: 'Б', amount: 2 }), exp({ id: 'c', vendor: 'В', amount: 1 })];
  expect(totalsByVendor(list, 2).map((v) => v.vendor)).toEqual(['А', 'Б']);
});

test('timelineByCategory раскладывает суммы по направлениям внутри дня', () => {
  const list = [exp({ id: 'a', date: '2026-11-02', categoryId: 'x', amount: 10 }), exp({ id: 'b', date: '2026-11-02', categoryId: 'y', amount: 5 })];
  const { buckets } = timelineByCategory(list, f('custom', '2026-11-01', '2026-11-03'));
  expect(buckets.find((b) => b.key === '2026-11-02')).toMatchObject({ x: 10, y: 5, total: 15 });
  expect(buckets).toHaveLength(3);
});

test('timeline текущего месяца заканчивается сегодня, а не концом месяца', () => {
  const { buckets } = timeline([exp({ date: '2026-11-05' })], f('thisMonth'), new Date(2026, 10, 17));
  expect(buckets.at(-1)?.key).toBe('2026-11-17');
  expect(buckets).toHaveLength(17);
});

test('timeline показывает и расходы с датой документа позже сегодняшней', () => {
  const { buckets } = timeline([exp({ date: '2026-11-26' })], f('thisMonth'), new Date(2026, 10, 17));
  expect(buckets.at(-1)?.key).toBe('2026-11-26');
});

test('timeline прошлого месяца — весь месяц', () => {
  const { buckets } = timeline([exp({ date: '2026-10-05' })], f('lastMonth'), new Date(2026, 10, 17));
  expect(buckets.at(-1)?.key).toBe('2026-10-31');
});
