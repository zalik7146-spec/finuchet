import type { Category, DataStore, Expense } from '../types';
import { DEFAULT_CATEGORIES } from './defaults';
import { pairKey } from './duplicates';

const KEY = 'finuchet-demo-v1';

interface State {
  categories: Category[];
  expenses: Expense[];
  dismissals: string[];
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
  const all = [categories, expenses, dismissals];

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
    async addExpenses(items) {
      const now = Date.now();
      commit({
        ...state,
        expenses: [
          ...state.expenses,
          ...items.map((it, i) => ({ ...it, id: uid(), receivedAt: null, receivedByEmail: '', createdAt: now + i, updatedAt: now + i })),
        ],
      });
    },
    async updateExpense(id, patch) {
      commit({
        ...state,
        expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e)),
      });
    },
    async deleteExpense(id) {
      commit({
        ...state,
        expenses: state.expenses.filter((e) => e.id !== id),
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
    async dismissDuplicate(a, b) {
      const key = pairKey(a, b);
      if (!state.dismissals.includes(key)) commit({ ...state, dismissals: [...state.dismissals, key] });
    },
  };
}
