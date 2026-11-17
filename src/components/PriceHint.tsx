import type { BaseUnit } from '../types';
import type { PriceInsight, PricePoint } from '../lib/prices';
import { formatDate, formatRub } from '../lib/format';

const RISE_THRESHOLD_PCT = 1;

function Point({ p, unit, onOpen }: { p: PricePoint; unit: BaseUnit; onOpen: (expenseId: string) => void }) {
  return (
    <>
      <span className="num">
        {formatRub(p.unitPrice)}/{unit}
      </span>{' '}
      · {p.vendor} · <span className="num">{formatDate(p.date)}</span>
      {p.documentNumber && (
        <>
          {' '}
          · счёт <span className="num">{p.documentNumber}</span>
        </>
      )}{' '}
      <button className="link !text-xs" onClick={() => onOpen(p.expenseId)}>
        Открыть
      </button>
    </>
  );
}

/** «В прошлый раз дешевле» под строкой счёта на экране проверки. */
export function PriceHint({ insight, unit, onOpen }: { insight: PriceInsight; unit: BaseUnit; onOpen: (expenseId: string) => void }) {
  const { last, best90, deltaPct } = insight;
  if (!last) return null;
  const pct = deltaPct ?? 0;
  const rose = pct > RISE_THRESHOLD_PCT;
  const pctText = `${Math.abs(pct).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
  return (
    <div className="mt-1.5 space-y-0.5 text-xs leading-5 text-slate-600" role="note">
      <div>
        <span className={rose ? 'font-semibold text-warn' : pct < -RISE_THRESHOLD_PCT ? 'font-semibold text-ok' : 'font-semibold'}>
          {rose ? `дороже на ${pctText}` : pct < -RISE_THRESHOLD_PCT ? `дешевле на ${pctText}` : 'цена как раньше'}
        </span>
        : в прошлый раз <Point p={last} unit={unit} onOpen={onOpen} />
      </div>
      {best90 && best90.expenseId !== last.expenseId && (
        <div>
          лучшая за 90 дней: <Point p={best90} unit={unit} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}
