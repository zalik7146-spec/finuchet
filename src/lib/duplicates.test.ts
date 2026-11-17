import { expect, test } from 'vitest';
import { findDuplicatePairs, findMatchesFor, isDuplicate, normalizeVendor, pairKey } from './duplicates';
import { exp } from './test-helpers';

const d = (vendor: string, amount: number, date: string, documentNumber: string) => ({ vendor, amount, date, documentNumber });

test('normalizeVendor убирает ОПФ, кавычки и регистр', () => {
  expect(normalizeVendor('ООО «Комус»')).toBe('комус');
  expect(normalizeVendor(' ИП  Петров ')).toBe('петров');
  expect(normalizeVendor('АО "Мельница №1"')).toBe('мельница №1');
});

test('одинаковый номер у одного контрагента — дубль, даже при разной сумме', () =>
  expect(isDuplicate(d('ООО «Комус»', 100, '2026-11-01', '5531'), d('комус', 120, '2026-11-03', '5531'))).toBe(true));

test('разные номера при одинаковой сумме и дате — не дубль', () =>
  expect(isDuplicate(d('Комус', 100, '2026-11-01', '1'), d('Комус', 100, '2026-11-01', '2'))).toBe(false));

test('без номера: контрагент + сумма + дата', () =>
  expect(isDuplicate(d('ИП Петров', 4500, '2026-11-14', ''), d('Петров', 4500, '2026-11-14', '128'))).toBe(true));

test('без номера и с другой суммой — не дубль', () =>
  expect(isDuplicate(d('Петров', 4500, '2026-11-14', ''), d('Петров', 4600, '2026-11-14', ''))).toBe(false));

test('пустой контрагент никогда не дубль', () =>
  expect(isDuplicate(d('', 4500, '2026-11-14', ''), d('', 4500, '2026-11-14', ''))).toBe(false));

test('findMatchesFor не находит сам расход при редактировании', () => {
  const e1 = exp({ id: 'a', documentNumber: '5' });
  expect(findMatchesFor(e1, [e1], e1.id)).toEqual([]);
});

test('findMatchesFor находит сохранённый дубль', () => {
  const saved = exp({ id: 'a', documentNumber: '5' });
  expect(findMatchesFor({ vendor: 'ООО Комус', amount: 1, date: '2026-01-01', documentNumber: '5' }, [saved])).toEqual([saved]);
});

test('pairKey не зависит от порядка', () => expect(pairKey('b', 'a')).toBe(pairKey('a', 'b')));

test('findDuplicatePairs возвращает пару один раз', () => {
  const a = exp({ id: 'a', documentNumber: '5' });
  const b = exp({ id: 'b', documentNumber: '5' });
  expect(findDuplicatePairs([a, b], new Set()).map(([x, y]) => [x.id, y.id])).toEqual([['a', 'b']]);
});

test('отклонённая пара не возвращается', () => {
  const a = exp({ id: 'a', documentNumber: '5' });
  const b = exp({ id: 'b', documentNumber: '5' });
  expect(findDuplicatePairs([a, b], new Set([pairKey('a', 'b')]))).toEqual([]);
});
