import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppUser, Category, DataStore, Draft, Expense, ExpenseInput, Filter } from './types';
import { NoAccessError, cloudEnabled, createCloudStore, describeError, getAccessToken, signOut, watchAuth } from './lib/supabase';
import { createLocalStore } from './lib/localStore';
import { emptyDraft, extractExpenses, newKey } from './lib/extract';
import { applyFilter, periodLabel } from './lib/filters';
import { amountToInput, parseAmount } from './lib/format';
import { Capture } from './components/Capture';
import { Categories } from './components/Categories';
import { Dashboard } from './components/Dashboard';
import { FilterBar } from './components/FilterBar';
import { Login } from './components/Login';
import { Members } from './components/Members';
import { Registry } from './components/Registry';
import { ReviewDialog, ReviewSkeleton } from './components/ReviewDialog';
import { Confirm, Toasts, type Toast } from './components/ui';

type View = 'dashboard' | 'registry' | 'categories' | 'members';
const VIEWS: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Обзор' },
  { id: 'registry', label: 'Реестр заявок' },
  { id: 'categories', label: 'Направления' },
  ...(cloudEnabled ? [{ id: 'members' as const, label: 'Участники' }] : []),
];

const DEMO_USER: AppUser = { uid: 'demo', name: 'Демо-режим', email: 'данные хранятся в этом браузере' };

type Review = { state: 'loading'; source: string; token: number } | { state: 'ready'; mode: 'new' | 'edit'; drafts: Draft[] };

export default function App() {
  const [user, setUser] = useState<AppUser | null>(cloudEnabled ? null : DEMO_USER);
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>({ preset: 'thisMonth', from: '', to: '', categoryIds: [], search: '' });
  const [review, setReview] = useState<Review | null>(null);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [catToDelete, setCatToDelete] = useState<Category | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const extractToken = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (kind: Toast['kind'], text: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, kind, text }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 3500);
    },
    [dismiss],
  );
  const fail = useCallback((e: unknown) => notify('error', describeError(e)), [notify]);

  useEffect(() => {
    if (!cloudEnabled) return;
    return watchAuth((u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  const store: DataStore | null = useMemo(
    () => (user ? (cloudEnabled ? createCloudStore(user.uid) : createLocalStore()) : null),
    [user],
  );

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    let unsubs: Array<() => void> = [];
    setLoading(true);
    setNoAccess(false);
    setCategories([]);
    setExpenses([]);
    store
      .init()
      .then(
        () => true,
        (e) => {
          if (cancelled) return false;
          if (e instanceof NoAccessError) setNoAccess(true);
          else fail(e);
          return !(e instanceof NoAccessError);
        },
      )
      .then((proceed) => {
        if (cancelled || !proceed) return;
        unsubs = [
          store.subscribeCategories((c) => setCategories([...c].sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name, 'ru'))), fail),
          store.subscribeExpenses((e) => {
            setExpenses(e);
            setLoading(false);
          }, (e) => {
            setLoading(false);
            fail(e);
          }),
        ];
      });
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [store, fail]);

  // Единый срез: от него работают KPI, графики, таблица и экспорт в Excel
  const filteredExpenses = useMemo(() => applyFilter(expenses, filter), [expenses, filter]);

  const run = async (action: () => Promise<void>, okText?: string) => {
    try {
      await action();
      if (okText) notify('ok', okText);
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const recognize = async (input: { file?: File; text?: string }) => {
    const token = ++extractToken.current;
    setReview({ state: 'loading', source: input.file?.name ?? 'текстовая заметка', token });
    try {
      const drafts = await extractExpenses(input, categories, await getAccessToken());
      if (extractToken.current !== token) return; // пользователь закрыл окно
      setReview({ state: 'ready', mode: 'new', drafts });
    } catch (e) {
      if (extractToken.current !== token) return;
      setReview(null);
      fail(e);
    }
  };

  const closeReview = useCallback(() => {
    extractToken.current++;
    setReview(null);
  }, []);

  const toInput = (d: Draft): ExpenseInput => ({
    date: d.date,
    amount: parseAmount(d.amount),
    currency: 'RUB',
    categoryId: d.categoryId,
    categoryName: categories.find((c) => c.id === d.categoryId)?.name ?? '',
    vendor: d.vendor.trim(),
    description: d.description.trim(),
    documentNumber: d.documentNumber.trim(),
    sourceType: d.sourceType,
    sourceFileName: d.sourceFileName,
    aiConfidence: d.aiConfidence,
  });

  const saveDrafts = async (drafts: Draft[]) => {
    if (!store) return;
    const editing = drafts.length === 1 && drafts[0].id;
    const ok = await run(
      () => (editing ? store.updateExpense(drafts[0].id!, toInput(drafts[0])) : store.addExpenses(drafts.map(toInput))),
      editing ? 'Изменения сохранены.' : drafts.length === 1 ? 'Расход сохранён в базу.' : `Сохранено расходов: ${drafts.length}.`,
    );
    if (ok) setReview(null);
  };

  const openExpense = (e: Expense) =>
    setReview({
      state: 'ready',
      mode: 'edit',
      drafts: [
        {
          key: newKey(),
          id: e.id,
          date: e.date,
          amount: amountToInput(e.amount),
          vendor: e.vendor,
          description: e.description,
          documentNumber: e.documentNumber,
          categoryId: e.categoryId,
          sourceType: e.sourceType,
          sourceFileName: e.sourceFileName,
          aiConfidence: e.aiConfidence,
        },
      ],
    });

  const changeCategory = (e: Expense, categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat || !store) return;
    run(() => store.updateExpense(e.id, { categoryId: cat.id, categoryName: cat.name }), `Направление изменено: ${cat.name}.`);
  };

  const toggleCategory = (id: string) =>
    setFilter((f) => ({ ...f, categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((x) => x !== id) : [...f.categoryIds, id] }));

  const saveCategory = async (data: { id?: string; name: string; color: string; monthlyBudget: number | null }) => {
    if (!store) return false;
    const { id, ...rest } = data;
    return run(() => (id ? store.updateCategory(id, rest) : store.addCategory(rest)), id ? 'Направление обновлено.' : 'Направление добавлено.');
  };

  const requestDeleteCategory = (c: Category) => {
    const used = expenses.filter((e) => e.categoryId === c.id).length;
    if (used > 0) return notify('error', `В направлении «${c.name}» ${used} заяв. Сначала перенесите их в другое направление.`);
    if (categories.length <= 1) return notify('error', 'Нельзя удалить последнее направление.');
    setCatToDelete(c);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const { downloadExcel } = await import('./lib/excel');
      await downloadExcel(filteredExpenses, categories, filter);
      notify('ok', `Отчёт сформирован: ${filteredExpenses.length} заяв. за период «${periodLabel(filter)}».`);
    } catch (e) {
      console.error(e);
      notify('error', 'Не удалось сформировать Excel-файл.');
    } finally {
      setExporting(false);
    }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="skeleton h-10 w-56" aria-label="Загрузка" />
      </div>
    );
  }
  if (!user) return <Login />;
  if (noAccess) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <div className="card w-full max-w-sm p-8">
          <div className="text-lg font-bold">ФинУчет ИИ</div>
          <h1 className="mt-6 text-xl font-bold">Нет доступа к реестру</h1>
          <p className="mt-3 text-sm text-slate-500">
            Вы вошли как <span className="font-semibold text-ink">{user.email}</span>, но этой почты нет в списке участников. Попросите коллегу добавить её в разделе «Участники».
          </p>
          <button className="btn mt-6 w-full" onClick={() => signOut().catch(fail)}>
            Выйти и войти под другой почтой
          </button>
        </div>
      </main>
    );
  }

  const title = VIEWS.find((v) => v.id === view)!.label;
  const isEmpty = !loading && expenses.length === 0;
  const busy = review?.state === 'loading';
  const capture = (
    <Capture
      busy={busy || !categories.length}
      onFile={(file) => recognize({ file })}
      onText={(text) => recognize({ text })}
      onManual={() => setReview({ state: 'ready', mode: 'new', drafts: [emptyDraft(categories[0]?.id ?? '')] })}
      onInvalid={(m) => notify('error', m)}
    />
  );
  const registryProps = {
    categories,
    loading,
    onChangeCategory: changeCategory,
    onOpen: openExpense,
    onDelete: setToDelete,
  };

  return (
    <div className="flex min-h-full">
      {navOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setNavOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-line bg-white transition-transform lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-14 items-center border-b border-line px-5 text-[15px] font-bold">ФинУчет ИИ</div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Разделы">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              aria-current={view === v.id ? 'page' : undefined}
              onClick={() => {
                setView(v.id);
                setNavOpen(false);
              }}
              className={`h-9 rounded-md px-3 text-left text-sm font-semibold ${view === v.id ? 'bg-slate-100 text-ink' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <div className="truncate text-sm font-semibold">{user.name}</div>
          <div className="truncate text-xs text-slate-500">{user.email}</div>
          {cloudEnabled && (
            <button className="link mt-2" onClick={() => signOut().catch(fail)}>
              Выйти
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
          <button className="btn !px-2.5 lg:hidden" onClick={() => setNavOpen(true)} aria-label="Открыть меню">
            ☰
          </button>
          <div className="min-w-0 flex-1 truncate text-sm">
            <span className="hidden text-slate-400 sm:inline">ФинУчет ИИ / </span>
            <span className="font-bold">{title}</span>
            {(view === 'dashboard' || view === 'registry') && <span className="num ml-2 hidden text-xs text-slate-500 md:inline">{periodLabel(filter)}</span>}
          </div>
          <button
            className="btn btn-primary"
            onClick={exportExcel}
            disabled={exporting || filteredExpenses.length === 0}
            title={filteredExpenses.length === 0 ? 'Нет данных в текущей выборке' : 'Отчёт по текущему фильтру'}
          >
            {exporting ? 'Формируем…' : 'Скачать Excel'}
          </button>
        </header>

        <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 p-4 sm:p-6">
          {!cloudEnabled && (
            <p className="text-[13px] text-slate-500">
              <span className="font-semibold text-warn">Демо-режим.</span> Вход и облачная синхронизация включатся после добавления ключей Supabase в файл .env.
            </p>
          )}

          {view === 'members' ? (
            <Members currentEmail={user.email} onNotify={notify} />
          ) : view === 'categories' ? (
            <Categories categories={categories} expenses={expenses} onSave={saveCategory} onDelete={requestDeleteCategory} />
          ) : (
            <>
              {view === 'dashboard' && capture}
              {isEmpty ? (
                <section className="card px-6 py-14 text-center">
                  <h2 className="text-lg font-bold">Загрузите первый чек</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                    Перетащите PDF-счёт или фото чека в зону загрузки либо опишите расход текстом. После проверки он появится в реестре и на графиках.
                  </p>
                  {view === 'registry' && (
                    <button className="btn mt-5" onClick={() => setView('dashboard')}>
                      Перейти к загрузке
                    </button>
                  )}
                </section>
              ) : (
                <>
                  <FilterBar filter={filter} categories={categories} onChange={setFilter} />
                  {view === 'dashboard' ? (
                    <>
                      {loading ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="skeleton h-[84px]" />
                          ))}
                        </div>
                      ) : (
                        <Dashboard expenses={filteredExpenses} categories={categories} filter={filter} onToggleCategory={toggleCategory} />
                      )}
                      <Registry {...registryProps} expenses={filteredExpenses} limit={8} onShowAll={() => setView('registry')} />
                    </>
                  ) : (
                    <Registry {...registryProps} expenses={filteredExpenses} />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {review?.state === 'loading' && <ReviewSkeleton source={review.source} onClose={closeReview} />}
      {review?.state === 'ready' && (
        <ReviewDialog key={review.drafts[0]?.key ?? 'empty'} mode={review.mode} initial={review.drafts} categories={categories} onSave={saveDrafts} onClose={closeReview} />
      )}

      {toDelete && (
        <Confirm
          title="Удалить расход?"
          text={`«${toDelete.vendor}» на сумму ${toDelete.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽ будет удалён из базы без возможности восстановления.`}
          confirmLabel="Удалить"
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const id = toDelete.id;
            setToDelete(null);
            if (store) run(() => store.deleteExpense(id), 'Расход удалён.');
          }}
        />
      )}
      {catToDelete && (
        <Confirm
          title="Удалить направление?"
          text={`Направление «${catToDelete.name}» будет удалено.`}
          confirmLabel="Удалить"
          onCancel={() => setCatToDelete(null)}
          onConfirm={() => {
            const id = catToDelete.id;
            setCatToDelete(null);
            setFilter((f) => ({ ...f, categoryIds: f.categoryIds.filter((x) => x !== id) }));
            if (store) run(() => store.deleteCategory(id), 'Направление удалено.');
          }}
        />
      )}

      <Toasts items={toasts} onDismiss={dismiss} />
    </div>
  );
}
