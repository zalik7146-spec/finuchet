import type { Category, DataStore, Expense, ExpenseLine, ExpenseLineInput, Product } from '../types';
import { DEFAULT_CATEGORIES } from './defaults';
import { pairKey } from './duplicates';

const KEY = 'finuchet-demo-v1';

interface State {
  categories: Category[];
  expenses: Expense[];
  dismissals: string[];
  products: Product[];
  lines: ExpenseLine[];
  seeded: boolean;
}

/** Дополняет сохранённое состояние полями, появившимися в новых версиях. */
function normalize(raw: Partial<State>): State {
  return {
    categories: raw.categories ?? [],
    // Записи, сохранённые до появления статуса покупки, получают значения по умолчанию
    expenses: (raw.expenses ?? []).map((e: Partial<Expense>) => ({
      ...(e as Expense),
      isPurchase: e.isPurchase ?? false,
      receivedAt: e.receivedAt ?? null,
      receivedByEmail: e.receivedByEmail ?? '',
    })),
    dismissals: raw.dismissals ?? [],
    products: raw.products ?? [],
    lines: raw.lines ?? [],
    seeded: raw.seeded ?? false,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<State>);
  } catch {
    // повреждённые данные — начинаем заново
  }
  return normalize({});
}

const uid = () => crypto.randomUUID();

/** Подписчики одного среза состояния. */
function channel<T>(read: (s: State) => T) {
  const subs = new Set<(v: T) => void>();
  return {
    add(cb: (v: T) => void, s: State) {
      subs.add(cb);
      cb(read(s));
      return () => {
        subs.delete(cb);
      };
    },
    emit(s: State) {
      const v = read(s);
      subs.forEach((cb) => cb(v));
    },
  };
}

/** Хранилище демо-режима: данные живут только в этом браузере. */
export function createLocalStore(): DataStore {
  let state = load();
  const categories = channel((s) => s.categories);
  const expenses = channel((s) => s.expenses);
  const dismissals = channel((s) => new Set(s.dismissals));
  const products = channel((s) => s.products);
  const lines = channel((s) => s.lines);
  const all = [categories, expenses, dismissals, products, lines];

  const toLines = (expenseId: string, input: ExpenseLineInput[]): ExpenseLine[] =>
    input.map((l) => ({ ...l, id: uid(), expenseId }));
  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const commit = (next: State) => {
    state = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      throw new Error('Не удалось сохранить данные в браузере: хранилище переполнено или недоступно.');
    }
    all.forEach((c) => c.emit(state));
  };

  return {
    async init() {
      if (state.seeded) return;
      const now = Date.now();
      commit({
        ...state,
        seeded: true,
        categories: DEFAULT_CATEGORIES.map((c, i) => ({
          ...c,
          monthlyBudget: null,
          isDefault: true,
          createdAt: now + i,
        })),
      });
    },
    subscribeCategories: (cb) => categories.add(cb, state),
    subscribeExpenses: (cb) => expenses.add(cb, state),
    subscribeDismissals: (cb) => dismissals.add(cb, state),
    subscribeProducts: (cb) => products.add(cb, state),
    subscribeLines: (cb) => lines.add(cb, state),
    async addExpenses(items) {
      const now = Date.now();
      const created = items.map(({ lines: l, ...it }, i) => ({
        expense: { ...it, id: uid(), receivedAt: null, receivedByEmail: '', createdAt: now + i, updatedAt: now + i },
        lines: l ?? [],
      }));
      commit({
        ...state,
        expenses: [...state.expenses, ...created.map((c) => c.expense)],
        lines: [...state.lines, ...created.flatMap((c) => toLines(c.expense.id, c.lines))],
      });
    },
    async updateExpense(id, { lines: l, ...patch }) {
      commit({
        ...state,
        expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e)),
        lines: l === undefined ? state.lines : [...state.lines.filter((x) => x.expenseId !== id), ...toLines(id, l)],
      });
    },
    async deleteExpense(id) {
      commit({
        ...state,
        expenses: state.expenses.filter((e) => e.id !== id),
        lines: state.lines.filter((x) => x.expenseId !== id),
        dismissals: state.dismissals.filter((k) => !k.split('|').includes(id)),
      });
    },
    async addCategory(data) {
      commit({
        ...state,
        categories: [...state.categories, { ...data, id: uid(), isDefault: false, createdAt: Date.now() }],
      });
    },
    async updateCategory(id, patch) {
      commit({
        ...state,
        categories: state.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        expenses:
          patch.name === undefined
            ? state.expenses
            : state.expenses.map((e) => (e.categoryId === id ? { ...e, categoryName: patch.name! } : e)),
      });
    },
    async deleteCategory(id) {
      commit({ ...state, categories: state.categories.filter((c) => c.id !== id) });
    },
    async setReceived(id, received) {
      const patch = received ? { receivedAt: Date.now(), receivedByEmail: 'демо-режим' } : { receivedAt: null, receivedByEmail: '' };
      commit({ ...state, expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    },
    async addProduct(p) {
      if (state.products.some((x) => sameName(x.name, p.name))) throw new Error('Товар с таким названием уже есть.');
      const product: Product = { id: uid(), name: p.name.trim(), unit: p.unit, aliases: p.aliases ?? [], createdAt: Date.now() };
      commit({ ...state, products: [...state.products, product] });
      return product;
    },
    async updateProduct(id, patch) {
      if (patch.name !== undefined && state.products.some((x) => x.id !== id && sameName(x.name, patch.name!))) {
        throw new Error('Товар с таким названием уже есть.');
      }
      commit({ ...state, products: state.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    },
    async deleteProduct(id) {
      const used = state.lines.filter((l) => l.productId === id).length;
      if (used) throw new Error(`Товар используется в позициях (${used}) — объедините его с другим товаром вместо удаления.`);
      commit({ ...state, products: state.products.filter((p) => p.id !== id) });
    },
    async mergeProducts(fromId, intoId) {
      if (fromId === intoId) throw new Error('Нельзя объединить товар сам с собой.');
      const from = state.products.find((p) => p.id === fromId);
      if (!from) throw new Error('Товар не найден.');
      commit({
        ...state,
        lines: state.lines.map((l) => (l.productId === fromId ? { ...l, productId: intoId } : l)),
        products: state.products
          .filter((p) => p.id !== fromId)
          .map((p) =>
            p.id === intoId
              ? { ...p, aliases: [...new Set([...p.aliases, ...from.aliases, from.name])].filter((a) => !sameName(a, p.name)) }
              : p,
          ),
      });
    },
    async dismissDuplicate(a, b) {
      const key = pairKey(a, b);
      if (!state.dismissals.includes(key)) commit({ ...state, dismissals: [...state.dismissals, key] });
    },
  };
}
