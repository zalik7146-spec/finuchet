import type { Expense } from '../types';

/** Фабрика расхода для тестов: все поля по умолчанию, переопределяются частично. */
export function exp(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    date: '2026-11-01',
    amount: 100,
    currency: 'RUB',
    categoryId: 'c1',
    categoryName: 'Прочее',
    vendor: 'Комус',
    description: '',
    documentNumber: '',
    sourceType: 'manual',
    sourceFileName: '',
    aiConfidence: 'high',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}
