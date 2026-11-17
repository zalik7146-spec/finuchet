import type { Category, Expense } from '../types';
import { sumAmounts } from '../lib/filters';
import { SOURCE_LABEL, formatDate, formatRub } from '../lib/format';

export function Registry({
  expenses,
  categories,
  limit,
  loading,
  onChangeCategory,
  onOpen,
  onDelete,
  onShowAll,
}: {
  expenses: Expense[];
  categories: Category[];
  limit?: number;
  loading?: boolean;
  onChangeCategory: (e: Expense, categoryId: string) => void;
  onOpen: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onShowAll?: () => void;
}) {
  const rows = limit ? expenses.slice(0, limit) : expenses;

  return (
    <section className="card overflow-hidden">
      <header className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-bold">{limit ? 'Последние операции' : 'Реестр заявок'}</h2>
        <span className="num text-xs text-slate-500">
          {expenses.length} шт. · {formatRub(sumAmounts(expenses))}
        </span>
      </header>

      {loading ? (
        <div className="flex flex-col gap-3 p-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-6 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">Нет операций, подходящих под фильтр</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold text-slate-500">
                <th className="w-28 px-4 py-2 font-semibold">Дата</th>
                <th className="px-4 py-2 font-semibold">Контрагент · назначение</th>
                <th className="w-56 px-4 py-2 font-semibold">Направление</th>
                <th className="w-40 px-4 py-2 text-right font-semibold">Сумма</th>
                <th className="w-36 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-b-0 hover:bg-slate-50/60">
                  <td className="num px-4 py-2.5 align-top text-[13px] text-slate-600">{formatDate(e.date)}</td>
                  <td className="max-w-0 px-4 py-2.5 align-top">
                    <div className="truncate font-medium">{e.vendor}</div>
                    <div className="truncate text-[13px] text-slate-500">
                      {[e.description, e.documentNumber && `№ ${e.documentNumber}`, SOURCE_LABEL[e.sourceType]].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <select
                      aria-label={`Направление: ${e.vendor}`}
                      className="h-8 w-full cursor-pointer rounded border border-transparent bg-transparent px-1 text-sm hover:border-line focus:border-accent focus:outline-none"
                      value={categories.some((c) => c.id === e.categoryId) ? e.categoryId : ''}
                      onChange={(ev) => onChangeCategory(e, ev.target.value)}
                    >
                      {!categories.some((c) => c.id === e.categoryId) && <option value="">{e.categoryName} (удалено)</option>}
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num px-4 py-2.5 text-right align-top font-medium whitespace-nowrap">{formatRub(e.amount)}</td>
                  <td className="px-4 py-2.5 text-right align-top whitespace-nowrap">
                    <button className="link mr-3" onClick={() => onOpen(e)}>
                      Детали
                    </button>
                    <button className="link link-danger" onClick={() => onDelete(e)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {limit && expenses.length > limit && onShowAll && (
        <footer className="border-t border-line px-4 py-2.5">
          <button className="link" onClick={onShowAll}>
            Показать все {expenses.length}
          </button>
        </footer>
      )}
    </section>
  );
}
