import { expect, test } from 'vitest';
import type { ExpenseLine, Product } from '../types';
import { priceImpacts, priceInsight, pricePoints, productSummaries, type PricePoint } from './prices';
import { exp } from './test-helpers';

const line = (over: Partial<ExpenseLine>): ExpenseLine => ({
  id: 'l',
  expenseId: 'e1',
  position: 0,
  rawName: 'Мука',
  productId: 'flour',
  docQuantity: 10,
  docUnit: 'меш',
  baseQuantity: 500,
  lineTotal: 13750,
  ...over,
});

const pt = (over: Partial<PricePoint>): PricePoint => ({
  expenseId: 'old',
  productId: 'flour',
  vendor: 'Мельница №1',
  date: '2026-11-03',
  documentNumber: '512',
  unitPrice: 27.5,
  ...over,
});

test('pricePoints: цена за базовую единицу с поставщиком и документом расхода', () => {
  const points = pricePoints([line({})], [exp({ id: 'e1', vendor: 'Мельница №1', date: '2026-11-03', documentNumber: '512' })]);
  expect(points).toEqual([{ ...pt({ expenseId: 'e1' }), quantity: 500, totalCents: 1375000 }]);
});

test('pricePoints: строки без товара и без количества не дают точек', () => {
  const e = [exp({ id: 'e1' })];
  expect(pricePoints([line({ productId: null }), line({ baseQuantity: null }), line({ baseQuantity: 0 })], e)).toEqual([]);
});

test('pricePoints: строка удалённого расхода не даёт точки', () => {
  expect(pricePoints([line({ expenseId: 'gone' })], [exp({ id: 'e1' })])).toEqual([]);
});

test('дороже прошлой закупки: 29 ₽/кг против 27,50 ₽/кг — +5,45%', () => {
  const r = priceInsight('flour', 29, '2026-11-12', [pt({})]);
  expect(r.last?.expenseId).toBe('old');
  expect(r.deltaPct).toBeCloseTo(5.4545, 3);
});

test('точки редактируемого расхода не учитываются', () => {
  const r = priceInsight('flour', 29, '2026-11-12', [pt({ expenseId: 'self', date: '2026-11-01' })], 'self');
  expect(r).toEqual({ last: null, best90: null, deltaPct: null });
});

test('закупка с более поздней или той же датой документа не становится прошлой', () => {
  const r = priceInsight('flour', 29, '2026-11-12', [pt({ date: '2026-11-20' }), pt({ expenseId: 'same', date: '2026-11-12' })]);
  expect(r.last).toBeNull();
});

test('прошлая — самая поздняя из более ранних', () => {
  const r = priceInsight('flour', 29, '2026-11-12', [pt({ expenseId: 'a', date: '2026-10-01', unitPrice: 26 }), pt({ expenseId: 'b', date: '2026-11-03', unitPrice: 27.5 })]);
  expect(r.last?.expenseId).toBe('b');
});

test('лучшая за 90 дней показывается, только если ниже текущей', () => {
  const pts = [pt({ expenseId: 'cheap', date: '2026-09-12', unitPrice: 26.9 }), pt({})];
  expect(priceInsight('flour', 29, '2026-11-12', pts).best90?.expenseId).toBe('cheap');
  expect(priceInsight('flour', 25, '2026-11-12', pts).best90).toBeNull();
});

test('лучшая за 90 дней не берёт закупки старше 90 дней', () => {
  const pts = [pt({ expenseId: 'ancient', date: '2026-07-01', unitPrice: 20 }), pt({})];
  expect(priceInsight('flour', 29, '2026-11-12', pts).best90?.expenseId).toBe('old');
});

test('другой товар не участвует', () => {
  expect(priceInsight('sugar', 77, '2026-11-12', [pt({})]).last).toBeNull();
});

const product = (id: string, name = id): Product => ({ id, name, unit: 'кг', aliases: [], createdAt: 0 });

test('productSummaries: количество и сумма — только в периоде', () => {
  const expenses = [exp({ id: 'oct', date: '2026-10-10' }), exp({ id: 'nov', date: '2026-11-10' })];
  const lines = [line({ id: 'a', expenseId: 'oct', baseQuantity: 100, lineTotal: 2600 }), line({ id: 'b', expenseId: 'nov', baseQuantity: 500, lineTotal: 14500 })];
  const [s] = productSummaries([product('flour')], pricePoints(lines, expenses), lines, expenses, '2026-11-01', '2026-11-30');
  expect(s.boughtQuantity).toBe(500);
  expect(s.boughtTotal).toBe(14500);
});

test('productSummaries: изменение — по двум последним закупкам', () => {
  const expenses = [exp({ id: 'oct', date: '2026-10-10' }), exp({ id: 'nov', date: '2026-11-10' })];
  const lines = [line({ id: 'a', expenseId: 'oct', baseQuantity: 100, lineTotal: 2600 }), line({ id: 'b', expenseId: 'nov', baseQuantity: 500, lineTotal: 14500 })];
  const [s] = productSummaries([product('flour')], pricePoints(lines, expenses), lines, expenses, '', '');
  expect(s.last?.unitPrice).toBe(29);
  expect(s.changePct).toBeCloseTo(11.538, 2);
});

test('productSummaries: последняя цена — не позже конца периода', () => {
  const expenses = [exp({ id: 'oct', date: '2026-10-10' }), exp({ id: 'nov', date: '2026-11-10' })];
  const lines = [line({ id: 'a', expenseId: 'oct', baseQuantity: 100, lineTotal: 2600 }), line({ id: 'b', expenseId: 'nov', baseQuantity: 500, lineTotal: 14500 })];
  const [s] = productSummaries([product('flour')], pricePoints(lines, expenses), lines, expenses, '2026-10-01', '2026-10-31');
  expect(s.last?.expenseId).toBe('oct');
  expect(s.changePct).toBeNull();
});

test('productSummaries: товар без закупок', () => {
  const [s] = productSummaries([product('salt')], [], [], [], '', '');
  expect(s).toMatchObject({ last: null, changePct: null, boughtQuantity: 0, boughtTotal: 0 });
});

test('влияние цен по документам: взвешенная цена, прошлый месяц, рост и снижение на текущем объёме', () => {
  const expenses = [exp({ id: 'old', date: '2026-10-31' }), exp({ id: 'nov' }), exp({ id: 'next', date: '2026-11-04' })];
  const points = pricePoints([
    line({ expenseId: 'nov', baseQuantity: 20, lineTotal: 1800 }),
    line({ expenseId: 'old', baseQuantity: 10, lineTotal: 900 }),
    line({ expenseId: 'nov', baseQuantity: 60, lineTotal: 7800 }),
    line({ expenseId: 'next', baseQuantity: 100, lineTotal: 8000 }),
  ], expenses.reverse());
  const impacts = priceImpacts(points, [product('flour')], new Set(['nov', 'next']));
  expect(impacts.map((p) => [p.previous.expenseId, p.current.expenseId, p.current.quantity, p.amount])).toEqual([
    ['nov', 'next', 100, -4000], ['old', 'nov', 80, 2400],
  ]);
  expect(impacts[1].percent).toBeCloseTo(33.3333);
});

test('нулевая цена, счета одного дня и неполная партия', () => {
  const expenses = [exp({ id: 'a' }), exp({ id: 'b' }), exp({ id: 'bad', date: '2026-11-02' }), exp({ id: 'next', date: '2026-11-03' })];
  const points = pricePoints([
    ...expenses.map((e) => line({ expenseId: e.id, lineTotal: e.id === 'b' ? 0 : 250 })),
    line({ expenseId: 'bad', baseQuantity: null }),
  ], expenses);
  expect(points.map((p) => p.expenseId)).toEqual(['a', 'b', 'next']);
  const impacts = priceImpacts(points, [product('flour')], new Set(expenses.map((e) => e.id)));
  expect(impacts).toHaveLength(1);
  expect(impacts[0]).toMatchObject({ previous: { expenseId: 'b' }, current: { expenseId: 'next' }, amount: 250, percent: null });
});

test('одинаковые цены дают нулевой эффект, один документ не даёт сравнения', () => {
  const points = pricePoints([line({ expenseId: 'a' }), line({ expenseId: 'b' })], [exp({ id: 'a' }), exp({ id: 'b', date: '2026-11-02' })]);
  expect(priceImpacts(points, [product('flour')], new Set(['a']))).toEqual([]);
  expect(priceImpacts(points, [product('flour')], new Set(['b']))[0].amount).toBe(0);
});

test('эффект ровно в половину копейки округляется симметрично', () => {
  const expenses = [exp({ id: 'old' }), exp({ id: 'new', date: '2026-11-02' })];
  for (const [currentTotal, expected] of [[1.01, 0.01], [1, -0.01]]) {
    const points = pricePoints([
      line({ expenseId: 'old', baseQuantity: 2, lineTotal: 2.01 }),
      line({ expenseId: 'new', baseQuantity: 1, lineTotal: currentTotal }),
    ], expenses);
    expect(priceImpacts(points, [product('flour')], new Set(['new']))[0].amount).toBe(expected);
  }
});
