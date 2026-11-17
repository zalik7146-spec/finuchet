import { expect, test } from 'vitest';
import type { ExpenseLine } from '../types';
import { priceInsight, pricePoints, type PricePoint } from './prices';
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
  expect(points).toEqual([pt({ expenseId: 'e1' })]);
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
