import { expect, test } from 'vitest';
import { shortenVendor } from './vendor';

test('полная ОПФ сокращается, кавычки становятся ёлочками', () => {
  expect(shortenVendor('Общество с ограниченной ответственностью "СОФИЯ"')).toBe('ООО «СОФИЯ»');
});

test('ИП, АО, ПАО, ЗАО', () => {
  expect(shortenVendor('Индивидуальный предприниматель Петров И.И.')).toBe('ИП Петров И.И.');
  expect(shortenVendor('Акционерное общество «Мельница»')).toBe('АО «Мельница»');
  expect(shortenVendor('публичное акционерное общество "Сбербанк"')).toBe('ПАО «Сбербанк»');
  expect(shortenVendor('Закрытое акционерное общество "Агро"')).toBe('ЗАО «Агро»');
});

test('уже короткое название не меняется', () => {
  expect(shortenVendor('ООО «Комус»')).toBe('ООО «Комус»');
  expect(shortenVendor('Яндекс Доставка')).toBe('Яндекс Доставка');
});
