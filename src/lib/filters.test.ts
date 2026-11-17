import { expect, test } from 'vitest';
import { recentFirst } from './filters';
import { exp } from './test-helpers';

test('recentFirst сортирует по времени добавления, а не по дате документа', () => {
  const a = exp({ id: 'a', date: '2026-11-20', createdAt: 1 });
  const b = exp({ id: 'b', date: '2026-10-01', createdAt: 2 });
  expect(recentFirst([a, b]).map((e) => e.id)).toEqual(['b', 'a']);
});

test('recentFirst не меняет исходный массив', () => {
  const list = [exp({ id: 'a', createdAt: 1 }), exp({ id: 'b', createdAt: 2 })];
  recentFirst(list);
  expect(list.map((e) => e.id)).toEqual(['a', 'b']);
});
