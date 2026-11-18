import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppUser, BaseUnit, Category, DataStore, Expense, ExpenseInput, ExpenseLine, ExpenseLineInput, PlannedPurchase, Product, Trip } from '../types';
import { DEFAULT_CATEGORIES } from './defaults';
import { pairKey } from './duplicates';
import { withClientIds } from './cloudRows';
import { TRIP_CONFLICT } from './planner';

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
  const where = `${msg} ${(e as { details?: string })?.details ?? ''}`;
  if (err.code === '23503' && where.includes('expense_items_product_id_fkey')) {
    return 'Товар используется в позициях — объедините его с другим товаром вместо удаления.';
  }
  if (err.code === '23503') return 'Направление используется в заявках. Сначала перенесите их в другое направление.';
  if (err.code === '23505' && where.includes('products_name_unique')) return 'Товар с таким названием уже есть.';
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
  is_purchase: boolean;
  received_at: string | null;
  received_by_email: string;
  created_at: string;
  updated_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  unit: BaseUnit;
  aliases: string[];
  created_at: string;
}

interface LineRow {
  id: string;
  expense_id: string;
  position: number;
  raw_name: string;
  product_id: string | null;
  doc_quantity: number | string | null;
  doc_unit: string;
  base_quantity: number | string | null;
  line_total: number | string;
}

const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  name: r.name,
  unit: r.unit,
  aliases: r.aliases ?? [],
  createdAt: Date.parse(r.created_at),
});

const numOrNull = (v: number | string | null) => (v === null ? null : Number(v));

const toLine = (r: LineRow): ExpenseLine => ({
  id: r.id,
  expenseId: r.expense_id,
  position: r.position,
  rawName: r.raw_name,
  productId: r.product_id,
  docQuantity: numOrNull(r.doc_quantity),
  docUnit: r.doc_unit,
  baseQuantity: numOrNull(r.base_quantity),
  lineTotal: Number(r.line_total),
});

const toLineRow = (l: ExpenseLineInput, position: number) => ({
  position,
  raw_name: l.rawName,
  product_id: l.productId,
  doc_quantity: l.docQuantity,
  doc_unit: l.docUnit,
  base_quantity: l.baseQuantity,
  line_total: l.lineTotal,
});

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
  isPurchase: r.is_purchase,
  receivedAt: r.received_at ? Date.parse(r.received_at) : null,
  receivedByEmail: r.received_by_email,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
});

const EXPENSE_COLUMNS: Record<Exclude<keyof ExpenseInput, 'lines'>, string> = {
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
  isPurchase: 'is_purchase',
};

const toExpenseRow = ({ lines: _lines, ...e }: Partial<ExpenseInput>) =>
  Object.fromEntries(Object.entries(e).map(([k, v]) => [EXPENSE_COLUMNS[k as Exclude<keyof ExpenseInput, 'lines'>], v]));

const PAGE = 1000;

interface Feed<T> {
  subscribe(cb: (items: T) => void, onError: (e: unknown) => void): () => void;
  reload(): Promise<void>;
}

/** Хранилище Supabase: один общий реестр, доступ — участникам из таблицы members (политики RLS в supabase/schema.sql). */
export function createCloudStore(uid: string): DataStore {
  if (!client) throw new Error('Облако не настроено.');
  const sb = client;
  let channel: ReturnType<SupabaseClient['channel']> | null = null;
  const feeds: Array<{ table: string; feed: Feed<unknown>; size: () => number }> = [];

  /** Загружает таблицу целиком (постранично) и раздаёт результат подписчикам; изменения с других устройств — через realtime. */
  function tableFeed<R, T>(table: string, order: string[], map: (rows: R[]) => T): Feed<T> {
    const subs = new Set<{ cb: (v: T) => void; onError: (e: unknown) => void }>();
    let latestRequest = 0;
    const reload = async () => {
      if (!subs.size) return;
      const request = ++latestRequest;
      const rows: R[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = sb.from(table).select('*');
        for (const col of order) q = q.order(col);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (request !== latestRequest) return;
        if (error) return subs.forEach((s) => s.onError(error));
        rows.push(...(data as R[]));
        if (data.length < PAGE) break;
      }
      const value = map(rows);
      subs.forEach((s) => s.cb(value));
    };
    const feed: Feed<T> = {
      reload,
      subscribe(cb, onError) {
        const sub = { cb, onError };
        subs.add(sub);
        ensureChannel();
        void reload();
        return () => {
          subs.delete(sub);
          releaseChannel();
        };
      },
    };
    feeds.push({ table, feed: feed as Feed<unknown>, size: () => subs.size });
    return feed;
  }

  const ensureChannel = () => {
    if (channel) return;
    let ch = sb.channel(`ledger-${uid}`);
    for (const f of feeds) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: f.table }, () => void f.feed.reload());
    }
    channel = ch.subscribe();
  };
  const releaseChannel = () => {
    if (channel && feeds.every((f) => f.size() === 0)) {
      void sb.removeChannel(channel);
      channel = null;
    }
  };

  const categoriesFeed = tableFeed<CategoryRow, Category[]>('categories', ['created_at'], (rows) => rows.map(toCategory));
  const expensesFeed = tableFeed<ExpenseRow, Expense[]>('expenses', ['created_at', 'id'], (rows) => rows.map(toExpense));
  const dismissalsFeed = tableFeed<{ expense_a: string; expense_b: string }, Set<string>>(
    'duplicate_dismissals',
    ['expense_a', 'expense_b'],
    (rows) => new Set(rows.map((r) => pairKey(r.expense_a, r.expense_b))),
  );
  const productsFeed = tableFeed<ProductRow, Product[]>('products', ['name'], (rows) => rows.map(toProduct));
  const linesFeed = tableFeed<LineRow, ExpenseLine[]>('expense_items', ['expense_id', 'position', 'id'], (rows) => rows.map(toLine));
  const plannedPurchasesFeed = tableFeed<PlannedPurchase, PlannedPurchase[]>('planned_purchases', ['created_at', 'id'], (rows) => rows.reverse());
  const tripsFeed = tableFeed<Trip, Trip[]>('pickup_trips', ['created_at', 'id'], (rows) => rows.reverse());
  const loadCategories = categoriesFeed.reload;
  const loadExpenses = expensesFeed.reload;

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
    subscribeCategories: categoriesFeed.subscribe,
    subscribeExpenses: expensesFeed.subscribe,
    subscribeDismissals: dismissalsFeed.subscribe,
    subscribeProducts: productsFeed.subscribe,
    subscribeLines: linesFeed.subscribe,
    subscribePlannedPurchases: plannedPurchasesFeed.subscribe,
    subscribeTrips: tripsFeed.subscribe,
    async addPlannedPurchase(title) {
      check(await sb.from('planned_purchases').insert({ title }));
      await plannedPurchasesFeed.reload();
    },
    async updatePlannedPurchase(id, patch) {
      check(await sb.from('planned_purchases').update(patch).eq('id', id).select('id').single());
      await plannedPurchasesFeed.reload();
    },
    async deletePlannedPurchase(id) {
      check(await sb.from('planned_purchases').delete().eq('id', id));
      await plannedPurchasesFeed.reload();
    },
    async saveTrip(input, existing) {
      if (existing) {
        const { data } = check(await sb.from('pickup_trips')
          .update({ ...input, revision: crypto.randomUUID() })
          .eq('id', existing.id).eq('revision', existing.revision).select('id').maybeSingle());
        if (!data) {
          await tripsFeed.reload();
          throw new Error(TRIP_CONFLICT);
        }
      } else {
        check(await sb.from('pickup_trips').insert(input));
      }
      await tripsFeed.reload();
    },
    async deleteTrip(trip) {
      const { data } = check(await sb.from('pickup_trips').delete()
        .eq('id', trip.id).eq('revision', trip.revision).select('id').maybeSingle());
      await tripsFeed.reload();
      if (!data) throw new Error(TRIP_CONFLICT);
    },
    async addExpenses(items) {
      const { expenses: withIds, lines: linked } = withClientIds(items);
      const ids = withIds.map((e) => e.id);
      check(await sb.from('expenses').insert(withIds.map(({ id, ...it }) => ({ id, ...toExpenseRow(it) }))));
      const rows = linked.map(({ expenseId, line }) => ({ ...toLineRow(line, line.position), expense_id: expenseId }));
      if (rows.length) {
        const res = await sb.from('expense_items').insert(rows);
        if (res.error) {
          // Расход без позиций хуже, чем понятная ошибка: откатываем вставку
          await sb.from('expenses').delete().in('id', ids);
          throw res.error;
        }
        await linesFeed.reload();
      }
      await loadExpenses();
    },
    async updateExpense(id, patch) {
      check(await sb.from('expenses').update(toExpenseRow(patch)).eq('id', id));
      if (patch.lines !== undefined) {
        check(await sb.rpc('replace_expense_items', { target_expense: id, lines: patch.lines.map((l, pos) => toLineRow(l, pos)) }));
        await linesFeed.reload();
      }
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
    async setReceived(id, received) {
      const { data } = await sb.auth.getSession();
      check(
        await sb
          .from('expenses')
          .update(
            received
              ? { received_at: new Date().toISOString(), received_by_email: data.session?.user.email ?? '' }
              : { received_at: null, received_by_email: '' },
          )
          .eq('id', id),
      );
      await loadExpenses();
    },
    async addProduct(p) {
      const { data } = check(
        await sb
          .from('products')
          .insert({ name: p.name.trim(), unit: p.unit, aliases: p.aliases ?? [] })
          .select('*')
          .single(),
      );
      await productsFeed.reload();
      return toProduct(data as ProductRow);
    },
    async updateProduct(id, patch) {
      check(await sb.from('products').update({ ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) }).eq('id', id));
      await productsFeed.reload();
    },
    async deleteProduct(id) {
      check(await sb.from('products').delete().eq('id', id));
      await productsFeed.reload();
    },
    async mergeProducts(fromId, intoId) {
      check(await sb.rpc('merge_products', { from_id: fromId, into_id: intoId }));
      await Promise.all([productsFeed.reload(), linesFeed.reload()]);
    },
    async dismissDuplicate(a, b) {
      const [expense_a, expense_b] = a < b ? [a, b] : [b, a];
      check(await sb.from('duplicate_dismissals').upsert({ expense_a, expense_b }, { ignoreDuplicates: true }));
      await dismissalsFeed.reload();
    },
  };
}
