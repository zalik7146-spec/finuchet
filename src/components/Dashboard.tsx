import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Category, Expense, Filter } from '../types';
import { sumAmounts, timeline, totalsByCategory } from '../lib/filters';
import { formatBucket, formatRub, formatRubShort } from '../lib/format';

function Kpi({ label, value, hint, mono = true }: { label: string; value: string; hint?: string; mono?: boolean }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1.5 truncate text-xl font-semibold ${mono ? 'num' : ''}`} title={value}>
        {value}
      </div>
      {hint && <div className="num mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Dashboard({
  expenses,
  categories,
  filter,
  onToggleCategory,
}: {
  expenses: Expense[];
  categories: Category[];
  filter: Filter;
  onToggleCategory: (id: string) => void;
}) {
  const total = useMemo(() => sumAmounts(expenses), [expenses]);
  const byCat = useMemo(() => totalsByCategory(expenses, categories), [expenses, categories]);
  const { buckets, granularity } = useMemo(() => timeline(expenses, filter), [expenses, filter]);
  const chart = useMemo(() => buckets.map((b) => ({ ...b, label: formatBucket(b.key) })), [buckets]);
  const count = expenses.length;
  const top = byCat[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Общая сумма" value={formatRub(total)} />
        <Kpi label="Количество заявок" value={String(count)} />
        <Kpi label="Топ-направление" value={top?.name ?? '—'} hint={top ? `${formatRub(top.total)} · ${(top.share * 100).toFixed(1)}%` : undefined} mono={false} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="card p-4 xl:col-span-3">
          <h2 className="text-sm font-bold">Динамика расходов</h2>
          <p className="text-xs text-slate-500">{granularity === 'day' ? 'По дням' : 'По месяцам'}, ₽</p>
          {count === 0 ? (
            <Empty />
          ) : (
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatRubShort(v)} />
                  <Tooltip
                    cursor={{ fill: '#F1F5F9' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { label: string; total: number; count: number };
                      return (
                        <div className="card px-3 py-2 text-xs">
                          <div className="num text-slate-500">{p.label}</div>
                          <div className="num mt-0.5 text-sm font-semibold">{formatRub(p.total)}</div>
                          <div className="text-slate-500">Заявок: {p.count}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="total" fill="#2563EB" radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card p-4 xl:col-span-2">
          <h2 className="text-sm font-bold">Доли по направлениям</h2>
          <p className="text-xs text-slate-500">Нажмите на направление, чтобы отфильтровать данные</p>
          {count === 0 ? (
            <Empty />
          ) : (
            <ul className="mt-3 flex flex-col">
              {byCat.map((c) => {
                const on = filter.categoryIds.includes(c.id);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onToggleCategory(c.id)}
                      aria-pressed={on}
                      className={`w-full rounded px-2 py-2 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-accent ${on ? 'bg-slate-100' : ''}`}
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                          <span className="truncate font-medium">{c.name}</span>
                        </span>
                        <span className="num shrink-0 text-[13px]">
                          {formatRub(c.total)} <span className="text-slate-400">· {(c.share * 100).toFixed(1)}%</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.max(c.share * 100, 1)}%`, background: c.color }} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Empty() {
  return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Нет расходов за выбранный период</div>;
}
