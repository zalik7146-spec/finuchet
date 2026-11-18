import { useEffect, useState, type FormEvent } from 'react';
import type { DataStore, PlannedPurchase, Trip } from '../types';
import { describeError } from '../lib/supabase';
import { Trips } from './Trips';
import { Confirm, type Toast } from './ui';

export interface PlannerActions {
  run: (action: () => Promise<void>, okText?: string) => Promise<boolean>;
  notify: (kind: Toast['kind'], text: string) => void;
}

export function Planner({ store, run, notify }: PlannerActions & { store: DataStore }) {
  const [tab, setTab] = useState<'buy' | 'trips'>('buy');
  const [purchases, setPurchases] = useState<PlannedPurchase[] | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const onError = (error: unknown) => {
      const code = (error as { code?: string } | null)?.code;
      setError(code === 'PGRST205' || code === '42P01'
        ? 'Для планирования нужно применить миграцию Supabase из README.'
        : describeError(error));
    };
    const unsubscribe = tab === 'buy'
      ? store.subscribePlannedPurchases((items) => {
        setPurchases(items);
        setError('');
      }, onError)
      : store.subscribeTrips((items) => {
        setTrips(items);
        setError('');
      }, onError);
    return unsubscribe;
  }, [store, tab, attempt]);

  function openTab(next: typeof tab) {
    if (next === tab) return;
    setError('');
    setTab(next);
  }

  const loading = (tab === 'buy' ? purchases : trips) === null;

  return (
    <section className="w-full max-w-4xl space-y-4" aria-label="Планирование">
      <div className="inline-flex gap-0.5 rounded-md border border-line bg-white p-0.5" role="group" aria-label="Списки планирования">
        <button aria-pressed={tab === 'buy'} onClick={() => openTab('buy')}
          className={`h-8 rounded px-3 text-sm font-semibold ${tab === 'buy' ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          Купить
        </button>
        <button aria-pressed={tab === 'trips'} onClick={() => openTab('trips')}
          className={`h-8 rounded px-3 text-sm font-semibold ${tab === 'trips' ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          Рейсы
        </button>
      </div>
      {error && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-bad" role="alert">{error}</p>
          <button className="btn" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Повторить</button>
        </div>
      )}
      {loading && !error && <div className="skeleton h-24" role="status" aria-label="Загрузка списка" />}
      {tab === 'buy' && purchases && <BuyList items={purchases} store={store} run={run} />}
      {tab === 'trips' && trips && <Trips items={trips} store={store} run={run} notify={notify} />}
    </section>
  );
}

function BuyList({ items, store, run }: Pick<PlannerActions, 'run'> & { items: PlannedPurchase[]; store: DataStore }) {
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<PlannedPurchase | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(action: () => Promise<void>, onSaved?: () => void) {
    setBusy(true);
    try {
      if (await run(action)) onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && title.trim()) void submit(() => store.addPlannedPurchase(title.trim()), () => setTitle(''));
  }

  const groups = [
    { ordered: false, label: 'К заказу', items: items.filter((item) => !item.ordered) },
    { ordered: true, label: 'Заказано', items: items.filter((item) => item.ordered) },
  ];

  return (
    <div className="card divide-y divide-line">
      <form onSubmit={add} className="flex flex-col gap-2 p-4 sm:flex-row">
        <input className="field min-w-0 flex-1" aria-label="Что нужно купить?" placeholder="Что нужно купить?" maxLength={200}
          value={title} onChange={(event) => setTitle(event.target.value)} readOnly={busy} />
        <button className="btn btn-primary" disabled={busy || !title.trim()}>Добавить</button>
      </form>
      {groups.map((group) => (
        <section key={group.label} className="p-4">
          <h2 className="mb-2 text-sm font-bold">{group.label} <span className="num ml-1 text-slate-500">{group.items.length}</span></h2>
          {!group.items.length && <p className="text-sm text-slate-500">{group.ordered ? 'Здесь появятся отмеченные покупки.' : 'Список покупок пуст.'}</p>}
          <ul className="divide-y divide-line">
            {group.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-2 sm:flex-nowrap">
                <input type="checkbox" className="size-5 shrink-0 accent-accent"
                  aria-label={`Заказано: ${item.title}`}
                  checked={item.ordered} disabled={busy} onChange={(event) => {
                    const ordered = event.target.checked;
                    void submit(() => store.updatePlannedPurchase(item.id, { ordered }));
                  }} />
                {editing?.id === item.id ? (
                  <form className="flex min-w-0 flex-1 flex-wrap items-center gap-2" onSubmit={(event) => {
                    event.preventDefault();
                    if (!busy && editing.title.trim()) void submit(
                      () => store.updatePlannedPurchase(item.id, { title: editing.title.trim() }),
                      () => setEditing(null),
                    );
                  }}>
                    <input className="field min-w-32 flex-1" aria-label="Название покупки" maxLength={200} autoFocus
                      value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} readOnly={busy} />
                    <button className="btn" disabled={busy || !editing.title.trim()}>Сохранить</button>
                    <button type="button" className="link" disabled={busy} onClick={() => setEditing(null)}>Отмена</button>
                  </form>
                ) : (
                  <>
                    <span className={`min-w-0 flex-1 text-sm wrap-break-word ${item.ordered ? 'text-slate-500 line-through' : ''}`}>{item.title}</span>
                    <div className="ml-auto flex shrink-0 gap-3">
                      <button className="link" aria-label={`Изменить покупку: ${item.title}`} disabled={busy} onClick={() => setEditing(item)}>Изменить</button>
                      <button className="link text-bad" aria-label={`Удалить покупку: ${item.title}`} disabled={busy} onClick={() => setDeleting(item)}>Удалить</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {deleting && <Confirm title="Удалить покупку?" text={deleting.title} confirmLabel="Удалить"
        onCancel={() => setDeleting(null)} onConfirm={() => {
          setDeleting(null);
          void submit(() => store.deletePlannedPurchase(deleting.id));
        }} />}
    </div>
  );
}
