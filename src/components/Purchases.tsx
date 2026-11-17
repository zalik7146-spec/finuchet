import { useMemo, useState } from 'react';
import type { Expense } from '../types';
import { awaitingReceipt, round2 } from '../lib/filters';
import { formatDate, formatRub } from '../lib/format';
import { ExpenseView } from './ExpenseView';

const LONG_WAIT_DAYS = 14;

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Раздел «Закупки»: что оплачено или заказано, но ещё не пришло. */
export function Purchases({ expenses, onReceived }: { expenses: Expense[]; onReceived: (e: Expense) => void }) {
  const waiting = useMemo(() => awaitingReceipt(expenses), [expenses]);
  const total = round2(waiting.reduce((s, w) => s + w.expense.amount, 0));
  const [viewing, setViewing] = useState<Expense | null>(null);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-bold">Ожидают получения</h2>
        <span className="num text-xs text-slate-500">
          {waiting.length} {plural(waiting.length, 'покупка', 'покупки', 'покупок')} · {formatRub(total)}
        </span>
      </header>

      {waiting.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">
          Всё получено. Чтобы отслеживать поставку, отметьте у расхода «Покупка товара».
        </div>
      ) : (
        <ul>
          {waiting.map(({ expense: e, waitingDays }) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
              <span className="num w-24 shrink-0 text-[13px] text-slate-600">{formatDate(e.date)}</span>
              <button className="min-w-0 flex-1 basis-56 truncate text-left hover:underline" onClick={() => setViewing(e)}>
                <span className="font-medium">{e.vendor}</span>
                {e.description && <span className="text-slate-500"> · {e.description}</span>}
              </button>
              <span className="num shrink-0 font-medium">{formatRub(e.amount)}</span>
              <span className={`num w-28 shrink-0 text-right text-[13px] ${waitingDays > LONG_WAIT_DAYS ? 'font-semibold text-warn' : 'text-slate-500'}`}>
                ждём {waitingDays} {plural(waitingDays, 'день', 'дня', 'дней')}
              </span>
              <button className="btn !h-8 shrink-0" onClick={() => onReceived(e)}>
                Получено
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewing && <ExpenseView expense={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
