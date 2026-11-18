import { useEffect, useState } from 'react';
import type { DataStore, PlannedPurchase, Trip } from '../types';
import { describeError } from '../lib/supabase';
import { Trips } from './Trips';
import { BuyList } from './BuyList';
import type { Toast } from './ui';

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
