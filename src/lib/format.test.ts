import { expect, test } from 'vitest';
import { displayFileName } from './format';

test('служебное имя файла (uuid) скрывается', () => {
  expect(displayFileName('9c09d0e9-200d-4c44-a2ff-ac5cde0b0d60.jpg')).toBe('');
  expect(displayFileName('3f2a9b7c1d4e5f60.pdf')).toBe('');
});

test('человеческое имя файла остаётся', () => {
  expect(displayFileName('schet-512.xlsx')).toBe('schet-512.xlsx');
  expect(displayFileName('Счёт Мельница ноябрь.pdf')).toBe('Счёт Мельница ноябрь.pdf');
  expect(displayFileName('')).toBe('');
});
