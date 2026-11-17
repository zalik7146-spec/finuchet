import { expect, test } from 'vitest';
import type { ExpenseLine, Product } from '../types';
import { buildPositionsRows } from './excel';
import { exp } from './test-helpers';

const flour: Product = { id: 'p1', name: 'Мука в/с', unit: 'кг', aliases: [], createdAt: 0 };
const line = (over: Partial<ExpenseLine>): ExpenseLine => ({
  id: 'l', expenseId: 'e1', position: 0, rawName: 'Мука мешок 50 кг', productId: 'p1', docQuantity: 10, docUnit: 'меш', baseQuantity: 500, lineTotal: 14500, ...over,
});

test('расход без позиций не даёт строк', () => {
  expect(buildPositionsRows([exp({ id: 'e1' })], [], [flour])).toEqual([]);
});

test('строка товара: дата, поставщик, документ, товар, количество, единица, сумма, цена', () => {
  const rows = buildPositionsRows([exp({ id: 'e1', vendor: 'Мельница', documentNumber: '512', date: '2026-11-03' })], [line({})], [flour]);
  expect(rows).toEqual([[new Date(Date.UTC(2026, 10, 3)), 'Мельница', '512', 'Мука в/с', 'Мука мешок 50 кг', 500, 'кг', 14500, 29]]);
});

test('«не товар» — пустые товар, количество и цена', () => {
  const rows = buildPositionsRows([exp({ id: 'e1', date: '2026-11-03' })], [line({ rawName: 'Доставка', productId: null, baseQuantity: null, lineTotal: 1200 })], [flour]);
  expect(rows[0].slice(3)).toEqual(['', 'Доставка', '', '', 1200, '']);
});

test('позиции расходов вне выборки не попадают', () => {
  expect(buildPositionsRows([exp({ id: 'e1' })], [line({ expenseId: 'other' })], [flour])).toEqual([]);
});
