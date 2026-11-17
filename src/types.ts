export type Confidence = 'high' | 'medium' | 'low';
export type SourceType = 'pdf' | 'image' | 'text' | 'excel' | 'manual';

export type BaseUnit = 'кг' | 'л' | 'шт' | 'м' | 'уп';
export const BASE_UNITS: BaseUnit[] = ['кг', 'л', 'шт', 'м', 'уп'];

/** Товар из справочника: все закупки сравниваются в его базовой единице. */
export interface Product {
  id: string;
  name: string;
  unit: BaseUnit;
  aliases: string[];
  createdAt: number;
}

/** Строка документа. productId === null — «не товар» (услуга, доставка). */
export interface ExpenseLine {
  id: string;
  expenseId: string;
  position: number;
  rawName: string;
  productId: string | null;
  docQuantity: number | null;
  docUnit: string;
  baseQuantity: number | null;
  lineTotal: number;
}

export type ExpenseLineInput = Omit<ExpenseLine, 'id' | 'expenseId'>;

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
  /** Покупка товара: ждём поставку, по факту отмечаем «Получено». */
  isPurchase: boolean;
  /** Позиции документа; при updateExpense заменяют прежние целиком. Не передано — позиции не трогаются. */
  lines?: ExpenseLineInput[];
}

export interface Expense extends ExpenseInput {
  receivedAt: number | null;
  receivedByEmail: string;
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
  isPurchase: boolean;
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
  /** Ключи пар pairKey(a, b), отмеченных «Не дубль». */
  subscribeDismissals(cb: (keys: Set<string>) => void, onError: (e: unknown) => void): () => void;
  dismissDuplicate(a: string, b: string): Promise<void>;
  /** Ставит или снимает отметку «Получено» (дата и почта текущего пользователя). */
  setReceived(id: string, received: boolean): Promise<void>;
  subscribeProducts(cb: (items: Product[]) => void, onError: (e: unknown) => void): () => void;
  subscribeLines(cb: (items: ExpenseLine[]) => void, onError: (e: unknown) => void): () => void;
  addProduct(p: { name: string; unit: BaseUnit; aliases?: string[] }): Promise<Product>;
  updateProduct(id: string, patch: { name?: string; unit?: BaseUnit; aliases?: string[] }): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  /** Переносит позиции и алиасы товара fromId в intoId и удаляет fromId. */
  mergeProducts(fromId: string, intoId: string): Promise<void>;
}
