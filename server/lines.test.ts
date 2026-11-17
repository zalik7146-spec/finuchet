import { expect, test } from 'vitest';
import { linesMismatch, sanitizeLines } from './lines';

const ids = new Set(['p-flour']);
const line = (over: Record<string, unknown>) => ({
  rawName: 'Мука в/с мешок 50 кг',
  docQuantity: 10,
  docUnit: 'меш',
  baseQuantity: 500,
  lineTotal: 13750,
  productId: 'p-flour',
  notGoods: false,
  suggestedName: '',
  suggestedUnit: '',
  ...over,
});

test('известный товар сохраняется', () => {
  expect(sanitizeLines([line({})], ids)[0]).toMatchObject({ productId: 'p-flour', baseQuantity: 500, lineTotal: 13750 });
});

test('неизвестный productId становится null, предложение нового товара сохраняется', () => {
  const [l] = sanitizeLines([line({ productId: 'выдуманный', suggestedName: 'Мука пшеничная в/с', suggestedUnit: 'кг' })], ids);
  expect(l.productId).toBeNull();
  expect(l.suggestedName).toBe('Мука пшеничная в/с');
  expect(l.suggestedUnit).toBe('кг');
});

test('недопустимая единица предложения отбрасывается', () => {
  expect(sanitizeLines([line({ productId: '', suggestedName: 'X', suggestedUnit: 'мешок' })], ids)[0].suggestedUnit).toBe('');
});

test('baseQuantity <= 0 становится null', () => {
  expect(sanitizeLines([line({ baseQuantity: 0 })], ids)[0].baseQuantity).toBeNull();
  expect(sanitizeLines([line({ baseQuantity: -3 })], ids)[0].baseQuantity).toBeNull();
});

test('отрицательная сумма отбрасывает строку', () => {
  expect(sanitizeLines([line({ lineTotal: -10 })], ids)).toEqual([]);
});

test('строка без названия отбрасывается', () => {
  expect(sanitizeLines([line({ rawName: '  ' })], ids)).toEqual([]);
});

test('«не товар» не привязывается к справочнику', () => {
  const [l] = sanitizeLines([line({ rawName: 'Доставка', notGoods: true })], ids);
  expect(l.notGoods).toBe(true);
  expect(l.productId).toBeNull();
});

test('мусор вместо массива — пустой список', () => {
  expect(sanitizeLines('нет', ids)).toEqual([]);
});

test('linesMismatch: расхождение 1,50 ₽ — да, 0,40 ₽ — нет', () => {
  const ls = sanitizeLines([line({ lineTotal: 13750 }), line({ rawName: 'Доставка', lineTotal: 1200, notGoods: true })], ids);
  expect(linesMismatch(ls, 14951.5)).toBe(true);
  expect(linesMismatch(ls, 14950.4)).toBe(false);
});

test('linesMismatch: без строк — нет расхождения', () => {
  expect(linesMismatch([], 100)).toBe(false);
});
