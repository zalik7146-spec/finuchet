export type Confidence = 'high' | 'medium' | 'low';
export type SourceType = 'pdf' | 'image' | 'text' | 'manual';

export interface Category {
  id: string;
  name: string;
  color: string;
  monthlyBudget: number | null;
  isDefault: boolean;
  createdAt: number;
}

export interface ExpenseInput {
  date: string; // YYYY-MM-DD
  amount: number;
  currency: 'RUB';
  categoryId: string;
  categoryName: string;
  vendor: string;
  description: string;
  documentNumber: string;
  sourceType: SourceType;
  sourceFileName: string;
  aiConfidence: Confidence;
}

export interface Expense extends ExpenseInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}

/** Редактируемый черновик на экране проверки. */
export interface Draft {
  key: string;
  id?: string; // задан при редактировании существующей записи
  date: string;
  amount: string;
  vendor: string;
  description: string;
  documentNumber: string;
  categoryId: string;
  sourceType: SourceType;
  sourceFileName: string;
  aiConfidence: Confidence;
}

export type PeriodPreset = 'thisMonth' | 'lastMonth' | 'quarter' | 'year' | 'all' | 'custom';

export interface Filter {
  preset: PeriodPreset;
  from: string;
  to: string;
  categoryIds: string[];
  search: string;
}

export interface AppUser {
  uid: string;
  name: string;
  email: string;
}

export interface DataStore {
  /** Создаёт базовые направления при первом входе. */
  init(): Promise<void>;
  subscribeCategories(cb: (items: Category[]) => void, onError: (e: unknown) => void): () => void;
  subscribeExpenses(cb: (items: Expense[]) => void, onError: (e: unknown) => void): () => void;
  addExpenses(items: ExpenseInput[]): Promise<void>;
  updateExpense(id: string, patch: Partial<ExpenseInput>): Promise<void>;
  deleteExpense(id: string): Promise<void>;
  addCategory(data: { name: string; color: string; monthlyBudget: number | null }): Promise<void>;
  /** При переименовании обновляет и денормализованное название в расходах. */
  updateCategory(id: string, patch: { name?: string; color?: string; monthlyBudget?: number | null }): Promise<void>;
  deleteCategory(id: string): Promise<void>;
}
