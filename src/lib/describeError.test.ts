import { expect, test } from 'vitest';
import { describeError } from './supabase';

test('удаление товара, который используется в позициях, объясняется понятно', () => {
  const e = { code: '23503', message: 'update or delete on table "products" violates foreign key constraint "expense_items_product_id_fkey" on table "expense_items"', details: 'Key is still referenced from table "expense_items".' };
  expect(describeError(e)).toBe('Товар используется в позициях — объедините его с другим товаром вместо удаления.');
});

test('повтор названия товара объясняется понятно', () => {
  const e = { code: '23505', message: 'duplicate key value violates unique constraint "products_name_unique"' };
  expect(describeError(e)).toBe('Товар с таким названием уже есть.');
});

test('удаление направления с заявками — прежнее сообщение', () => {
  const e = { code: '23503', message: 'violates foreign key constraint "expenses_category_id_fkey"' };
  expect(describeError(e)).toBe('Направление используется в заявках. Сначала перенесите их в другое направление.');
});
