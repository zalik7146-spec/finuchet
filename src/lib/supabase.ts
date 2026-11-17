import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppUser, Category, DataStore, Expense, ExpenseInput } from '../types';
import { DEFAULT_CATEGORIES } from './defaults';

/** Убирает пробелы, переносы строк и кавычки, которые легко захватить при вставке значения в панель хостинга. */
const clean = (v: unknown) =>
  typeof v === 'string'
    ? v
        .trim()
        .replace(/^["']+|["']+$/g, '')
        .trim()
    : '';

const url = clean(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
// В ключе не бывает пробельных символов: перенос строки посреди ключа — след неудачной вставки
const key = clean(import.meta.env.VITE_SUPABASE_KEY).replace(/\s+/g, '');

/** Понятное описание ошибки в настройках; null, если всё в порядке. */
export const configError: string | null = (() => {
  if (!url || !key) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    return 'VITE_SUPABASE_URL должен выглядеть как https://xxxx.supabase.co — без пробелов и лишнего текста.';
  }
  if (!/^[!-~]+$/.test(key)) {
    return 'VITE_SUPABASE_KEY содержит нелатинские символы. Скопируйте ключ заново — только сам ключ, одной строкой.';
  }
  return null;
})();

/** Без ключей Supabase приложение работает в демо-режиме. */
export const cloudEnabled = Boolean(url && key);
/** Кнопка Google показывается, только когда провайдер настроен в Supabase. */
export const googleEnabled = cloudEnabled && import.meta.env.VITE_AUTH_GOOGLE === 'true';

const client: SupabaseClient | null = cloudEnabled && !configError ? createClient(url, key) : null;

export function watchAuth(cb: (user: AppUser | null) => void): () => void {
  if (!client) return () => {};
  let lastUid: string | null | undefined;
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    const u = session?.user ?? null;
    // Обновление токена не должно пересоздавать хранилище
    if (lastUid === (u?.id ?? null)) return;
    lastUid = u?.id ?? null;
    cb(
      u
        ? {
            uid: u.id,
            name: (u.user_metadata?.full_name as string | undefined) ?? u.email ?? 'Пользователь',
            email: u.email ?? '',
          }
        : null,
    );
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithGoogle(): Promise<void> {
  if (!client) throw new Error('Облако не настроено.');
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  if (error) throw error;
}

/** Отправляет на почту одноразовую ссылку для входа. */
export async function signInWithEmail(email: string): Promise<void> {
  if (!client) throw new Error('Облако не настроено.');
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
}

/** Токен текущей сессии — им подписываются запросы к серверу распознавания. */
export async function getAccessToken(): Promise<string | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Вход выполнен, но почты нет в списке участников реестра. */
export class NoAccessError extends Error {
  constructor() {
    super('Этой почты нет в списке участников.');
  }
}

export interface Member {
  email: string;
  addedAt: number;
}

export async function listMembers(): Promise<Member[]> {
  if (!client) return [];
  const { data, error } = await client.from('members').select('email, added_at').order('added_at');
  if (error) throw error;
  return data.map((r) => ({ email: r.email as string, addedAt: Date.parse(r.added_at as string) }));
}

export async function addMember(email: string): Promise<void> {
  if (!client) return;
  const { error } = await client.from('members').insert({ email: email.trim().toLowerCase() });
  if (error) throw error;
}

export async function removeMember(email: string): Promise<void> {
  if (!client) return;
  const { error } = await client.from('members').delete().eq('email', email);
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/** Превращает ошибки Supabase и сети в понятные сообщения. */
export function describeError(e: unknown): string {
  const err = (e ?? {}) as { code?: string; status?: number; message?: string; name?: string };
  const msg = err.message ?? '';
  if (err.code === '42501' || err.code === 'PGRST301') return 'Нет доступа к данным. Войдите в аккаунт заново.';
  if (err.code === '23503') return 'Направление используется в заявках. Сначала перенесите их в другое направление.';
  if (err.code === '23505') return 'Такая запись уже существует.';
  if (err.code === '23514' || err.code === '22P02' || err.code === '23502') return 'Данные не прошли проверку. Проверьте заполнение полей.';
  if (err.code === 'over_email_send_rate_limit' || err.status === 429) return 'Слишком много попыток. Подождите минуту и повторите.';
  if (err.code === 'email_address_invalid' || err.code === 'validation_failed') return 'Проверьте адрес электронной почты.';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Нет связи с облаком. Проверьте подключение к интернету.';
  if (err.code === 'PGRST205' || err.code === '42P01') return 'В базе нет нужных таблиц. Примените supabase/schema.sql.';
  return msg || 'Неизвестная ошибка. Попробуйте ещё раз.';
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  monthly_budget: number | null;
  is_default: boolean;
  created_at: string;
}

interface ExpenseRow {
  id: string;
  date: string;
  amount: number;
  currency: 'RUB';
  category_id: string;
  category_name: string;
  vendor: string;
  description: string;
  document_number: string;
  source_type: Expense['sourceType'];
  source_file_name: string;
  ai_confidence: Expense['aiConfidence'];
  created_at: string;
  updated_at: string;
}

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  color: r.color,
  monthlyBudget: r.monthly_budget === null ? null : Number(r.monthly_budget),
  isDefault: r.is_default,
  createdAt: Date.parse(r.created_at),
});

const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  date: r.date,
  amount: Number(r.amount),
  currency: r.currency,
  categoryId: r.category_id,
  categoryName: r.category_name,
  vendor: r.vendor,
  description: r.description,
  documentNumber: r.document_number,
  sourceType: r.source_type,
  sourceFileName: r.source_file_name,
  aiConfidence: r.ai_confidence,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
});

const EXPENSE_COLUMNS: Record<keyof ExpenseInput, string> = {
  date: 'date',
  amount: 'amount',
  currency: 'currency',
  categoryId: 'category_id',
  categoryName: 'category_name',
  vendor: 'vendor',
  description: 'description',
  documentNumber: 'document_number',
  sourceType: 'source_type',
  sourceFileName: 'source_file_name',
  aiConfidence: 'ai_confidence',
};

const toExpenseRow = (e: Partial<ExpenseInput>) =>
  Object.fromEntries(Object.entries(e).map(([k, v]) => [EXPENSE_COLUMNS[k as keyof ExpenseInput], v]));

const PAGE = 1000;

/** Хранилище Supabase: один общий реестр, доступ — участникам из таблицы members (политики RLS в supabase/schema.sql). */
export function createCloudStore(uid: string): DataStore {
  if (!client) throw new Error('Облако не настроено.');
  const sb = client;
  const catSubs = new Set<{ cb: (c: Category[]) => void; onError: (e: unknown) => void }>();
  const expSubs = new Set<{ cb: (e: Expense[]) => void; onError: (e: unknown) => void }>();
  let channel: ReturnType<SupabaseClient['channel']> | null = null;

  const loadCategories = async () => {
    const { data, error } = await sb.from('categories').select('*').order('created_at');
    if (error) return catSubs.forEach((s) => s.onError(error));
    const items = (data as CategoryRow[]).map(toCategory);
    catSubs.forEach((s) => s.cb(items));
  };

  const loadExpenses = async () => {
    const rows: ExpenseRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from('expenses').select('*').order('created_at').order('id').range(from, from + PAGE - 1);
      if (error) return expSubs.forEach((s) => s.onError(error));
      rows.push(...(data as ExpenseRow[]));
      if (data.length < PAGE) break;
    }
    const items = rows.map(toExpense);
    expSubs.forEach((s) => s.cb(items));
  };

  /** Изменения с других устройств приходят по каналу реального времени. */
  const ensureChannel = () => {
    if (channel) return;
    channel = sb
      .channel(`ledger-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => void loadCategories())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => void loadExpenses())
      .subscribe();
  };
  const releaseChannel = () => {
    if (channel && catSubs.size === 0 && expSubs.size === 0) {
      void sb.removeChannel(channel);
      channel = null;
    }
  };

  const check = <T extends { error: unknown }>(res: T): T => {
    if (res.error) throw res.error;
    return res;
  };

  return {
    async init() {
      // Не участник видит пустой список members — политики RLS не отдают ему ни одной строки
      const membership = await sb.from('members').select('email').limit(1);
      if (membership.error) throw membership.error;
      if (!membership.data.length) throw new NoAccessError();
      // Фиксированные id + ignoreDuplicates: повторный вход и вход с двух устройств не создают дубликаты
      const { count, error } = await sb.from('categories').select('id', { count: 'exact', head: true });
      if (error) throw error;
      if (count) return;
      check(
        await sb.from('categories').upsert(
          DEFAULT_CATEGORIES.map((c, i) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            is_default: true,
            created_at: new Date(Date.now() + i).toISOString(),
          })),
          { onConflict: 'id', ignoreDuplicates: true },
        ),
      );
    },
    subscribeCategories(cb, onError) {
      const sub = { cb, onError };
      catSubs.add(sub);
      ensureChannel();
      void loadCategories();
      return () => {
        catSubs.delete(sub);
        releaseChannel();
      };
    },
    subscribeExpenses(cb, onError) {
      const sub = { cb, onError };
      expSubs.add(sub);
      ensureChannel();
      void loadExpenses();
      return () => {
        expSubs.delete(sub);
        releaseChannel();
      };
    },
    async addExpenses(items) {
      check(await sb.from('expenses').insert(items.map(toExpenseRow)));
      await loadExpenses();
    },
    async updateExpense(id, patch) {
      check(await sb.from('expenses').update(toExpenseRow(patch)).eq('id', id));
      await loadExpenses();
    },
    async deleteExpense(id) {
      check(await sb.from('expenses').delete().eq('id', id));
      await loadExpenses();
    },
    async addCategory(data) {
      check(
        await sb.from('categories').insert({
          id: crypto.randomUUID(),
          name: data.name,
          color: data.color,
          monthly_budget: data.monthlyBudget,
        }),
      );
      await loadCategories();
    },
    async updateCategory(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.color !== undefined) row.color = patch.color;
      if (patch.monthlyBudget !== undefined) row.monthly_budget = patch.monthlyBudget;
      check(await sb.from('categories').update(row).eq('id', id));
      if (patch.name !== undefined) {
        check(await sb.from('expenses').update({ category_name: patch.name }).eq('category_id', id));
        await loadExpenses();
      }
      await loadCategories();
    },
    async deleteCategory(id) {
      check(await sb.from('categories').delete().eq('id', id));
      await loadCategories();
    },
  };
}
