import { useMemo, useState } from 'react';
import type { ProductSummary } from '../lib/prices';
import { formatDate, formatRub } from '../lib/format';

type SortKey = 'name' | 'change' | 'total';

const fmtQty = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

/** Справочник товаров: последняя цена, её изменение, сколько куплено за период. */
export function Products({
  summaries,
  periodLabel,
  initialSort = 'name',
  onOpen,
}: {
  summaries: ProductSummary[];
  periodLabel: string;
  initialSort?: SortKey;
  onOpen: (productId: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? summaries.filter((s) => s.product.name.toLowerCase().includes(q) || s.product.aliases.some((a) => a.toLowerCase().includes(q)))
      : summaries;
    return [...filtered].sort((a, b) => {
      if (sort === 'change') return (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity);
      if (sort === 'total') return b.boughtTotal - a.boughtTotal;
      return a.product.name.localeCompare(b.product.name, 'ru');
    });
  }, [summaries, sort, query]);

  const th = (label: string, key: SortKey, cls = '') => (
    <th className={`px-4 py-2 font-semibold ${cls}`} aria-sort={sort === key ? 'descending' : undefined}>
      <button className={`hover:text-ink ${sort === key ? 'text-ink' : ''}`} onClick={() => setSort(key)}>
        {label}
        {sort === key ? ' ↓' : ''}
      </button>
    </th>
  );

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">Товары</h2>
          <p className="text-xs text-slate-500">Цены за единицу с НДС · куплено за период: {periodLabel}</p>
        </div>
        <input type="search" className="field !w-56" placeholder="Поиск товара" aria-label="Поиск товара" value={query} onChange={(e) => setQuery(e.target.value)} />
      </header>

      {summaries.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">
          Справочник пока пуст. Товары появятся, когда вы сохраните первый счёт с позициями.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-slate-500">
                {th('Товар', 'name')}
                <th className="px-4 py-2 text-right font-semibold">Последняя цена</th>
                <th className="px-4 py-2 font-semibold">Поставщик · дата</th>
                {th('Изменение', 'change', 'text-right')}
                {th('Куплено за период', 'total', 'text-right')}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product: p, last, changePct, boughtQuantity, boughtTotal }) => (
                <tr key={p.id} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-slate-50/60" onClick={() => onOpen(p.id)}>
                  <td className="px-4 py-2.5">
                    <button className="text-left font-medium hover:underline" onClick={() => onOpen(p.id)}>
                      {p.name}
                    </button>
                    <span className="text-slate-400"> · {p.unit}</span>
                  </td>
                  <td className="num px-4 py-2.5 text-right whitespace-nowrap">{last ? `${formatRub(last.unitPrice)}/${p.unit}` : '—'}</td>
                  <td className="px-4 py-2.5 text-[13px] text-slate-600">
                    {last ? (
                      <>
                        {last.vendor} · <span className="num">{formatDate(last.date)}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td
                    className={`num px-4 py-2.5 text-right whitespace-nowrap ${
                      changePct === null ? 'text-slate-400' : changePct > 1 ? 'text-warn' : changePct < -1 ? 'text-ok' : 'text-slate-600'
                    }`}
                  >
                    {changePct === null ? '—' : `${changePct > 0 ? '+' : ''}${changePct.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`}
                  </td>
                  <td className="num px-4 py-2.5 text-right whitespace-nowrap">
                    {boughtTotal > 0 ? (
                      <>
                        {fmtQty(boughtQuantity)} {p.unit} · {formatRub(boughtTotal)}
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
