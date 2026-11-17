import { useState } from 'react';
import type { Expense } from '../types';
import { formatDate, formatRub } from '../lib/format';
import { ExpenseView } from './ExpenseView';

/** Список подозрительных пар над реестром: открыть, удалить одну из записей или отметить «Не дубль». */
export function Duplicates({
  pairs,
  onDelete,
  onDismiss,
}: {
  pairs: Array<[Expense, Expense]>;
  onDelete: (e: Expense) => void;
  onDismiss: (a: Expense, b: Expense) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Expense | null>(null);
  if (!pairs.length) return null;

  const line = (e: Expense) => (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 text-sm">
      <span className="num w-24 shrink-0 text-[13px] text-slate-600">{formatDate(e.date)}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{e.vendor}</span>
        <span className="text-slate-500">
          {e.documentNumber && ` · № ${e.documentNumber}`} · добавлен {new Date(e.createdAt).toLocaleDateString('ru-RU')}
        </span>
      </span>
      <span className="num shrink-0 font-medium">{formatRub(e.amount)}</span>
      <span className="flex shrink-0 gap-3">
        <button className="link" onClick={() => setViewing(e)}>
          Открыть
        </button>
        <button className="link link-danger" onClick={() => onDelete(e)}>
          Удалить
        </button>
      </span>
    </div>
  );

  return (
    <section className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm">
          <span className="font-bold text-warn">Возможные дубли: {pairs.length}</span>
          <span className="text-slate-500"> · одинаковый номер документа или одинаковые контрагент, сумма и дата</span>
        </span>
        <span className="link shrink-0">{open ? 'Свернуть' : 'Проверить'}</span>
      </button>
      {open && (
        <ul>
          {pairs.map(([a, b]) => (
            <li key={`${a.id}|${b.id}`} className="border-t border-line px-4 py-2">
              {line(a)}
              {line(b)}
              <div className="pt-1 pb-1.5">
                <button className="link" onClick={() => onDismiss(a, b)}>
                  Не дубль — больше не показывать
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {viewing && <ExpenseView expense={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
