type LineOf<T extends { lines?: unknown[] }> = NonNullable<T['lines']>[number];

/**
 * Присваивает расходам id на клиенте и привязывает к ним позиции по этим id.
 * Так позиции не зависят от порядка, в котором база вернёт вставленные строки.
 */
export function withClientIds<T extends { lines?: unknown[] }>(
  items: T[],
  newId: () => string = () => crypto.randomUUID(),
): { expenses: Array<T & { id: string }>; lines: Array<{ expenseId: string; line: LineOf<T> }> } {
  const expenses = items.map((it) => ({ ...it, id: newId() }));
  const lines = expenses.flatMap((e) => ((e.lines ?? []) as LineOf<T>[]).map((line) => ({ expenseId: e.id, line })));
  return { expenses, lines };
}
