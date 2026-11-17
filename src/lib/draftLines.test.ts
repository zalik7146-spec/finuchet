import { expect, test } from 'vitest';
import type { DraftLine, Product } from '../types';
import { aliasUpdates, draftLinesToInput, lineUnitPrice, newProductsToCreate, validateLine } from './draftLines';

const flour: Product = { id: 'p1', name: 'Мука пшеничная в/с', unit: 'кг', aliases: [], createdAt: 0 };
const dl = (over: Partial<DraftLine>): DraftLine => ({
  key: 'k',
  rawName: 'Мука в/с мешок 50 кг',
  productId: null,
  notGoods: false,
  docQuantity: '10',
  docUnit: 'меш',
  baseQuantity: '500',
  lineTotal: '14 500,00',
  ...over,
});

test('цена за единицу считается по базовому количеству', () => {
  expect(lineUnitPrice(dl({ productId: 'p1' }))).toBe(29);
});

test('без количества цены нет', () => {
  expect(lineUnitPrice(dl({ baseQuantity: '' }))).toBeNull();
  expect(lineUnitPrice(dl({ baseQuantity: '0' }))).toBeNull();
});

test('строка товара без товара и без нового названия — ошибка', () => {
  expect(validateLine(dl({}))).toBe('Выберите товар или отметьте «Не товар»');
});

test('строка товара без количества — ошибка', () => {
  expect(validateLine(dl({ productId: 'p1', baseQuantity: '' }))).toBe('Укажите количество в единицах товара');
});

test('«не товар» без количества — допустимо', () => {
  expect(validateLine(dl({ notGoods: true, baseQuantity: '' }))).toBeNull();
});

test('новые товары: без повторов и без уже существующих', () => {
  const lines = [
    dl({ newProduct: { name: 'Сахар-песок', unit: 'кг' } }),
    dl({ newProduct: { name: ' сахар-песок ', unit: 'кг' } }),
    dl({ newProduct: { name: 'мука пшеничная в/с', unit: 'кг' } }),
  ];
  expect(newProductsToCreate([lines], [flour])).toEqual([{ name: 'Сахар-песок', unit: 'кг' }]);
});

test('позиции для сохранения: новый товар получает id по названию, «не товар» — null', () => {
  const ids = new Map([['сахар-песок', 'p2']]);
  const input = draftLinesToInput(
    [
      dl({ newProduct: { name: 'Сахар-песок', unit: 'кг' }, lineTotal: '15 400' }),
      dl({ rawName: 'Доставка', notGoods: true, baseQuantity: '', docQuantity: '', lineTotal: '2 200' }),
    ],
    ids,
  );
  expect(input).toEqual([
    { position: 0, rawName: 'Мука в/с мешок 50 кг', productId: 'p2', docQuantity: 10, docUnit: 'меш', baseQuantity: 500, lineTotal: 15400 },
    { position: 1, rawName: 'Доставка', productId: null, docQuantity: null, docUnit: 'меш', baseQuantity: null, lineTotal: 2200 },
  ]);
});

test('алиасы: название из документа добавляется к товару один раз', () => {
  const input = [{ position: 0, rawName: 'Мука хлебопек. высш. сорт', productId: 'p1', docQuantity: 1, docUnit: '', baseQuantity: 50, lineTotal: 1 }];
  expect(aliasUpdates([input, input], [flour])).toEqual(new Map([['p1', ['Мука хлебопек. высш. сорт']]]));
});

test('алиасы: совпадающее с названием товара не добавляется', () => {
  const input = [{ position: 0, rawName: 'мука пшеничная в/с', productId: 'p1', docQuantity: 1, docUnit: '', baseQuantity: 50, lineTotal: 1 }];
  expect(aliasUpdates([input], [flour]).size).toBe(0);
});
