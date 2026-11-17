import { useMemo, useState } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { BASE_UNITS, type BaseUnit, type Product } from '../types';
import type { PricePoint } from '../lib/prices';
import { PALETTE } from '../lib/defaults';
import { formatDate, formatRub } from '../lib/format';
import { Confirm, Label, Modal } from './ui';

const DAY = 86_400_000;
const toTime = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Карточка товара: график цены за единицу, закупки, правка, объединение и удаление. */
export function ProductCard({
  product,
  products,
  points,
  onOpenExpense,
  onSave,
  onMerge,
  onDelete,
  onClose,
}: {
  product: Product;
  products: Product[];
  points: PricePoint[];
  onOpenExpense: (expenseId: string) => void;
  onSave: (patch: { name: string; unit: BaseUnit; aliases: string[] }) => Promise<boolean>;
  onMerge: (intoId: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}) {
  const history = useMemo(
    () => points.filter((p) => p.productId === product.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [points, product.id],
  );
  const vendors = useMemo(() => [...new Set(history.map((p) => p.vendor))], [history]);
  const series = vendors.map((v, i) => ({
    vendor: v,
    color: PALETTE[i % PALETTE.length],
    data: history.filter((p) => p.vendor === v).map((p) => ({ ...p, t: toTime(p.date) })),
  }));

  const [name, setName] = useState(product.name);
  const [unit, setUnit] = useState<BaseUnit>(product.unit);
  const [aliases, setAliases] = useState(product.aliases.join('\n'));
  const [mergeInto, setMergeInto] = useState('');
  const [confirm, setConfirm] = useState<'merge' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = name !== product.name || unit !== product.unit || aliases !== product.aliases.join('\n');
  const target = products.find((p) => p.id === mergeInto);

  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (await fn()) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={product.name} subtitle={`Цена за ${product.unit} с НДС · закупок: ${history.length}`} onClose={onClose}>
      <div className="px-5 py-4">
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Закупок этого товара пока нет.</p>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E8F0" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={[(min: number) => min - 3 * DAY, (max: number) => max + 3 * DAY]}
                    tickFormatter={(t: number) => new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
                    tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
                  />
                  <YAxis
                    dataKey="unitPrice"
                    type="number"
                    domain={['auto', 'auto']}
                    width={64}
                    tickFormatter={(v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                    tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
                  />
                  <ZAxis range={[70, 70]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as PricePoint;
                      return (
                        <div className="card px-3 py-2 text-xs">
                          <div className="num font-semibold">
                            {formatRub(p.unitPrice)}/{product.unit}
                          </div>
                          <div className="text-slate-600">{p.vendor}</div>
                          <div className="num text-slate-500">
                            {formatDate(p.date)}
                            {p.documentNumber && ` · № ${p.documentNumber}`}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {series.map((s) => (
                    <Scatter key={s.vendor} name={s.vendor} data={s.data} fill={s.color} isAnimationActive={false} onClick={(d) => onOpenExpense((d as unknown as PricePoint).expenseId)} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {series.map((s) => (
                <li key={s.vendor} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.vendor}
                </li>
              ))}
            </ul>

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-slate-500">
                  <th className="py-1.5 font-semibold">Дата</th>
                  <th className="py-1.5 font-semibold">Поставщик · документ</th>
                  <th className="py-1.5 text-right font-semibold">Цена/{product.unit}</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {history.map((p, i) => (
                  <tr key={`${p.expenseId}-${i}`} className="border-b border-line last:border-b-0">
                    <td className="num py-1.5 text-[13px] text-slate-600">{formatDate(p.date)}</td>
                    <td className="py-1.5">
                      {p.vendor}
                      {p.documentNumber && <span className="text-slate-500"> · № {p.documentNumber}</span>}
                    </td>
                    <td className="num py-1.5 text-right">{formatRub(p.unitPrice)}</td>
                    <td className="py-1.5 text-right">
                      <button className="link" onClick={() => onOpenExpense(p.expenseId)}>
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        <h3 className="text-sm font-bold">Товар в справочнике</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px]">
          <Label text="Название">
            <input className="field" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Label>
          <Label text="Единица">
            <select className="field" value={unit} onChange={(e) => setUnit(e.target.value as BaseUnit)}>
              {BASE_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Label>
          <Label text="Другие названия (по одному в строке) — помогают ИИ узнавать товар" className="sm:col-span-2">
            <textarea className="field" rows={3} value={aliases} onChange={(e) => setAliases(e.target.value)} />
          </Label>
        </div>
        {unit !== product.unit && history.length > 0 && (
          <p className="mt-2 text-[13px] text-warn">
            Смена единицы не пересчитывает прошлые закупки: их количество останется в «{product.unit}».
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <button
            className="btn btn-primary"
            disabled={!dirty || !name.trim() || busy}
            onClick={() =>
              act(() =>
                onSave({
                  name: name.trim(),
                  unit,
                  aliases: [...new Set(aliases.split('\n').map((a) => a.trim()).filter(Boolean))].slice(0, 50),
                }),
              )
            }
          >
            Сохранить
          </button>
        </div>
      </div>

      <div className="border-t border-line px-5 py-4">
        <h3 className="text-sm font-bold">Объединить с другим товаром</h3>
        <p className="mt-1 text-[13px] text-slate-500">Если это один и тот же товар, заведённый дважды: закупки перейдут к выбранному, этот товар удалится.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select className="field min-w-0 flex-1 basis-60" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} aria-label="Товар, с которым объединить">
            <option value="">— выберите товар —</option>
            {products
              .filter((p) => p.id !== product.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </option>
              ))}
          </select>
          <button className="btn" disabled={!target || busy} onClick={() => setConfirm('merge')}>
            Объединить
          </button>
        </div>
        {target && target.unit !== product.unit && (
          <p className="mt-2 text-[13px] text-warn">
            Единицы разные ({product.unit} и {target.unit}) — цены за единицу после объединения будут несопоставимы.
          </p>
        )}
        <div className="mt-4 text-right">
          {history.length ? (
            <span className="text-[13px] text-slate-400">Товар с закупками нельзя удалить — только объединить с другим.</span>
          ) : (
            <button className="link link-danger" disabled={busy} onClick={() => setConfirm('delete')}>
              Удалить товар
            </button>
          )}
        </div>
      </div>

      {confirm === 'merge' && target && (
        <Confirm
          title="Объединить товары?"
          text={`Закупки «${product.name}» перейдут к «${target.name}», а «${product.name}» будет удалён.`}
          confirmLabel="Объединить"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void act(() => onMerge(target.id));
          }}
        />
      )}
      {confirm === 'delete' && (
        <Confirm
          title="Удалить товар?"
          text={`«${product.name}» будет удалён из справочника.`}
          confirmLabel="Удалить"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void act(onDelete);
          }}
        />
      )}
    </Modal>
  );
}
