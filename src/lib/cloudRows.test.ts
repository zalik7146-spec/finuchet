import { expect, test } from 'vitest';
import { withClientIds } from './cloudRows';

test('позиции привязываются к расходу по сгенерированному id, а не по порядку ответа', () => {
  let n = 0;
  const { expenses, lines } = withClientIds(
    [
      { lines: [{ position: 0, rawName: 'a' }] },
      { lines: [] },
      { lines: [{ position: 0, rawName: 'b' }, { position: 1, rawName: 'c' }] },
    ],
    () => `id-${++n}`,
  );
  expect(expenses.map((e) => e.id)).toEqual(['id-1', 'id-2', 'id-3']);
  expect(lines.map((l) => [l.expenseId, l.line.rawName])).toEqual([
    ['id-1', 'a'],
    ['id-3', 'b'],
    ['id-3', 'c'],
  ]);
});
