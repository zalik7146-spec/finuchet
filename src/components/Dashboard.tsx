import { useId, useMemo, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IconPie, IconTrendUp, IconTruck, IconWallet } from './icons';
import type { Category, Expense, Filter } from '../types';
import { sumAmounts, timelineByCategory, totalsByCategory, totalsByVendor } from '../lib/filters';
import type { ProductSummary } from '../lib/prices';
import { formatBucket, formatRub, formatRubShort } from '../lib/format';

const pctText = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

/** Мини-график под числом в карточке показателя. */
function Sparkline({ values }: { values: number[] }) {
  const id = useId();
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="-mx-4 -mb-3.5 mt-2 h-11" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke="#2563EB" strokeWidth={1.5} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Бейдж изменения к прошлому периоду: рост расходов — нейтральный, это не обязательно плохо. */
function DeltaBadge({ pct, title }: { pct: number; title: string }) {
  const arrow = pct > 0.05 ? '▲' : pct < -0.05 ? '▼' : '=';
  return (
    <span className="num shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700" title={title}>
      {arrow} {Math.abs(pct).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%
    </span>
  );
}

function Kpi({
  icon,
  label,
  value,
  badge,
  hint,
  spark,
  mono = true,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  /** Справа от подписи — например, изменение к прошлому периоду. */
  badge?: ReactNode;
  hint?: ReactNode;
  spark?: number[];
  mono?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-slate-500">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-accent">{icon}</span>
          <span className="truncate">{label}</span>
        </span>
        {badge}
      </div>
      <div className={`mt-2.5 truncate text-[22px] leading-8 font-semibold tracking-tight ${mono ? 'num' : ''}`} title={value}>
        {value}
      </div>
      {hint && <div className="truncate text-[13px] text-slate-500">{hint}</div>}
      {spark && <Sparkline values={spark} />}
    </>
  );
  const cls = 'card flex flex-col overflow-hidden px-4 py-3.5 text-left';
  return onClick ? (
    <button className={`${cls} group hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-accent`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <h2 className="text-sm font-bold">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      {children}
    </section>
  );
}

function Empty({ text = 'Нет расходов за выбранный период' }: { text?: string }) {
  return <div className="flex h-40 items-center justify-center text-center text-sm text-slate-400">{text}</div>;
}

/** Дашборд закупщика: расходы к прошлому периоду, закупки в пути, рост цен, поставщики и направления. */
export function Dashboard({
  expenses,
  previousTotal,
  categories,
  filter,
  awaiting,
  summaries,
  onToggleCategory,
  onOpenAwaiting,
  onOpenPriceGrowth,
  onOpenProduct,
}: {
  /** Отфильтрованная выборка. */
  expenses: Expense[];
  /** Сумма за предыдущий такой же период; null — сравнивать не с чем. */
  previousTotal: number | null;
  categories: Category[];
  filter: Filter;
  awaiting: { count: number; total: number };
  /** Сводка по товарам за текущий период. */
  summaries: ProductSummary[];
  onToggleCategory: (id: string) => void;
  onOpenAwaiting: () => void;
  onOpenPriceGrowth: () => void;
  onOpenProduct: (productId: string) => void;
}) {
  const total = useMemo(() => sumAmounts(expenses), [expenses]);
  const byCat = useMemo(() => totalsByCategory(expenses, categories), [expenses, categories]);
  const byVendor = useMemo(() => totalsByVendor(expenses, 10), [expenses]);
  const { buckets, granularity } = useMemo(() => timelineByCategory(expenses, filter), [expenses, filter]);
  const chart = useMemo(() => buckets.map((b) => ({ ...b, label: formatBucket(b.key) })), [buckets]);
  const risen = useMemo(
    () => summaries.filter((s) => s.boughtTotal > 0 && s.changePct !== null && s.changePct > 1).sort((a, b) => b.changePct! - a.changePct!),
    [summaries],
  );
  const catById = new Map(categories.map((c) => [c.id, c]));
  const stackIds = byCat.map((c) => c.id);
  const count = expenses.length;
  const top = byCat[0];
  const delta = previousTotal ? ((total - previousTotal) / previousTotal) * 100 : null;
  const vendorMax = byVendor[0]?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<IconWallet />}
          label="Расходы за период"
          value={formatRub(total)}
          badge={delta !== null ? <DeltaBadge pct={delta} title="К тому же сроку прошлого периода" /> : undefined}
          hint={
            <>
              {count} {count % 10 === 1 && count % 100 !== 11 ? 'заявка' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'заявки' : 'заявок'}
              {previousTotal === null ? '' : delta === null ? ' · в прошлом периоде расходов не было' : ' · к прошлому периоду'}
            </>
          }
          spark={buckets.map((b) => b.total)}
        />
        <Kpi
          icon={<IconTruck />}
          label="Закупки в пути"
          value={formatRub(awaiting.total)}
          hint={awaiting.count ? `${awaiting.count} ожидают получения` : 'всё получено'}
          onClick={onOpenAwaiting}
        />
        <Kpi
          icon={<IconTrendUp />}
          label="Подорожало"
          value={
            risen.length === 0
              ? 'Цены не росли'
              : `${risen.length} ${risen.length % 10 === 1 && risen.length % 100 !== 11 ? 'товар' : [2, 3, 4].includes(risen.length % 10) && ![12, 13, 14].includes(risen.length % 100) ? 'товара' : 'товаров'}`
          }
          hint={risen.length ? `сильнее всего: ${risen[0].product.name} +${risen[0].changePct!.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%` : 'к предыдущей закупке'}
          mono={false}
          onClick={onOpenPriceGrowth}
        />
        <Kpi
          icon={<IconPie />}
          label="Топ-направление"
          value={top?.name ?? '—'}
          hint={top ? `${formatRub(top.total)} · ${(top.share * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%` : undefined}
          mono={false}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="Расходы по времени" subtitle={`${granularity === 'day' ? 'По дням' : 'По месяцам'}, ₽ · цвет — направление`} className="xl:col-span-3">
          {count === 0 ? (
            <Empty />
          ) : (
            <>
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
                        const p = payload[0].payload as { label: string; total: number } & Record<string, number>;
                        const parts = stackIds.filter((id) => p[id]).map((id) => ({ id, value: p[id] }));
                        return (
                          <div className="card px-3 py-2 text-xs">
                            <div className="num text-slate-500">{p.label}</div>
                            <div className="num mt-0.5 text-sm font-semibold">{formatRub(p.total)}</div>
                            {parts.map((x) => (
                              <div key={x.id} className="mt-0.5 flex items-center justify-between gap-4">
                                <span className="flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-sm" style={{ background: catById.get(x.id)?.color ?? '#94A3B8' }} />
                                  {catById.get(x.id)?.name ?? 'Удалённое направление'}
                                </span>
                                <span className="num">{formatRub(x.value)}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    {stackIds.map((id, i) => (
                      <Bar
                        key={id}
                        dataKey={id}
                        stackId="spend"
                        fill={catById.get(id)?.color ?? '#94A3B8'}
                        radius={i === stackIds.length - 1 ? [3, 3, 0, 0] : undefined}
                        maxBarSize={36}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {byCat.map((c) => {
                  const on = filter.categoryIds.includes(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        className={`flex items-center gap-1.5 hover:text-ink ${on ? 'font-semibold text-ink' : 'text-slate-600'}`}
                        aria-pressed={on}
                        onClick={() => onToggleCategory(c.id)}
                      >
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                        {c.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Доли по направлениям" subtitle="Нажмите на направление, чтобы отфильтровать данные" className="xl:col-span-2">
          {count === 0 ? (
            <Empty />
          ) : (
            <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start xl:flex-col xl:items-center 2xl:flex-row 2xl:items-start">
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCat}
                      dataKey="total"
                      nameKey="name"
                      innerRadius="68%"
                      outerRadius="100%"
                      paddingAngle={byCat.length > 1 ? 1.5 : 0}
                      stroke="none"
                      isAnimationActive={false}
                      onClick={(d) => onToggleCategory((d as unknown as { id: string }).id)}
                    >
                      {byCat.map((c) => (
                        <Cell
                          key={c.id}
                          fill={c.color}
                          className="cursor-pointer outline-none"
                          opacity={filter.categoryIds.length && !filter.categoryIds.includes(c.id) ? 0.35 : 1}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs text-slate-500">всего</span>
                  <span className="num text-[15px] font-semibold">{formatRubShort(total)} ₽</span>
                </div>
              </div>
              <ul className="flex w-full min-w-0 flex-1 flex-col">
              {byCat.map((c) => {
                const on = filter.categoryIds.includes(c.id);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onToggleCategory(c.id)}
                      aria-pressed={on}
                      className={`flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-accent ${on ? 'bg-slate-100' : ''}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                        <span className="truncate font-medium" title={c.name}>
                          {c.name}
                        </span>
                      </span>
                      <span className="num shrink-0 text-[13px]">
                        {(c.share * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%
                        <span className="ml-2 text-slate-400">{formatRubShort(c.total)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Топ-10 поставщиков" subtitle="По сумме за период">
          {byVendor.length === 0 ? (
            <Empty />
          ) : (
            <ul className="mt-3 flex flex-col gap-2.5">
              {byVendor.map((v) => (
                <li key={v.vendor}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{v.vendor}</span>
                    <span className="num shrink-0 text-[13px]">
                      {formatRub(v.total)} <span className="text-slate-400">· {v.count}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-accent" style={{ width: `${vendorMax ? Math.max((v.total / vendorMax) * 100, 1) : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Рост цен" subtitle="Товары, купленные за период дороже предыдущей закупки">
          {risen.length === 0 ? (
            <Empty text={summaries.length ? 'За период цены не росли' : 'Появится, когда в счетах будут позиции с товарами'} />
          ) : (
            <ul className="mt-3 flex flex-col">
              {risen.slice(0, 5).map((s) => (
                <li key={s.product.id}>
                  <button className="flex w-full items-baseline justify-between gap-3 rounded px-2 py-2 text-left text-sm hover:bg-slate-50" onClick={() => onOpenProduct(s.product.id)}>
                    <span className="min-w-0 truncate font-medium">{s.product.name}</span>
                    <span className="num shrink-0 text-[13px] text-slate-600">
                      {formatRub(s.prev!.unitPrice)} → {formatRub(s.last!.unitPrice)}/{s.product.unit}{' '}
                      <span className="font-semibold text-warn">{pctText(s.changePct!)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {risen.length > 5 && (
                <li className="px-2 pt-1">
                  <button className="link" onClick={onOpenPriceGrowth}>
                    Все {risen.length}
                  </button>
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
