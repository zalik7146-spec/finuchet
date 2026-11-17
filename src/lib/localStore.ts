import type { Category, DataStore, Expense } from '../types';
import { DEFAULT_CATEGORIES } from './defaults';

const KEY = 'finuchet-demo-v1';

interface State {
  categories: Category[];
  expenses: Expense[];
  seeded: boolean;
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // повреждённые данные — начинаем заново
  }
  return { categories: [], expenses: [], seeded: false };
}

const uid = () => crypto.randomUUID();

/** Хранилище демо-режима: данные живут только в этом браузере. */
export function createLocalStore(): DataStore {
  let state = load();
  const catSubs = new Set<(c: Category[]) => void>();
  const expSubs = new Set<(e: Expense[]) => void>();

  const commit = (next: State) => {
    state = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      throw new Error('Не удалось сохранить данные в браузере: хранилище переполнено или недоступно.');
    }
    catSubs.forEach((cb) => cb(state.categories));
    expSubs.forEach((cb) => cb(state.expenses));
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
    subscribeCategories(cb) {
      catSubs.add(cb);
      cb(state.categories);
      return () => catSubs.delete(cb);
    },
    subscribeExpenses(cb) {
      expSubs.add(cb);
      cb(state.expenses);
      return () => expSubs.delete(cb);
    },
    async addExpenses(items) {
      const now = Date.now();
      commit({
        ...state,
        expenses: [...state.expenses, ...items.map((it) => ({ ...it, id: uid(), createdAt: now, updatedAt: now }))],
      });
    },
    async updateExpense(id, patch) {
      commit({
        ...state,
        expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e)),
      });
    },
    async deleteExpense(id) {
      commit({ ...state, expenses: state.expenses.filter((e) => e.id !== id) });
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
  };
}
