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

/** Редактируемая строка документа на экране проверки. Числа — строками, как их вводит пользователь. */
export interface DraftLine {
  key: string;
  rawName: string;
  productId: string | null;
  notGoods: boolean;
  /** Товар, которого ещё нет в справочнике: будет создан при сохранении. */
  newProduct?: { name: string; unit: BaseUnit };
  docQuantity: string;
  docUnit: string;
  baseQuantity: string;
  lineTotal: string;
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
  /** Пользователь сам ставил или снимал «Покупка товара» — больше не переключаем автоматически. */
  purchaseTouched?: boolean;
  lines: DraftLine[];
  /** Позиции меняли на экране проверки — только тогда у сохранённого расхода они перезаписываются. */
  linesDirty?: boolean;
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

export interface PlannedPurchaseInput {
  title: string;
  group: string;
  tags: string[];
  dueDate: string | null;
}

export interface PlannedPurchase extends PlannedPurchaseInput {
  id: string;
  ordered: boolean;
}

export interface PurchaseComment {
  id: string;
  purchaseId: string;
  body: string;
  author: string;
  createdAt: number;
}

export interface TripStop {
  id: string;
  place: string;
  address: string;
  details: string;
}

export interface TripInput {
  title: string;
  date: string | null;
  stops: TripStop[];
}

export interface Trip extends TripInput {
  id: string;
  revision: string;
}

export interface DataStore {
  subscribePlannedPurchases(cb: (items: PlannedPurchase[]) => void, onError: (e: unknown) => void): () => void;
  subscribeTrips(cb: (items: Trip[]) => void, onError: (e: unknown) => void): () => void;
  addPlannedPurchase(input: PlannedPurchaseInput): Promise<void>;
  updatePlannedPurchase(id: string, patch: Partial<Omit<PlannedPurchase, 'id'>>): Promise<void>;
  deletePlannedPurchase(id: string): Promise<void>;
  subscribePurchaseComments(purchaseId: string, cb: (items: PurchaseComment[]) => void, onError: (error: unknown) => void): () => void;
  addPurchaseComment(purchaseId: string, body: string): Promise<PurchaseComment>;
  saveTrip(input: TripInput, existing?: Pick<Trip, 'id' | 'revision'>): Promise<void>;
  deleteTrip(trip: Pick<Trip, 'id' | 'revision'>): Promise<void>;
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
