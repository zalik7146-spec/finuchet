import { useId, type ReactNode } from 'react';
import { BASE_UNITS, type BaseUnit, type DraftLine, type Product } from '../types';
import { emptyLine } from '../lib/extract';
import { lineUnitPrice, validateLine } from '../lib/draftLines';
import { formatRub, parseAmount } from '../lib/format';

const key = (s: string) => s.trim().toLowerCase();

/** Таблица позиций документа на экране проверки: привязка к справочнику, количество, сумма, цена за единицу. */
export function LinesEditor({
  lines,
  products,
  amount,
  showErrors,
  onChange,
  renderHint,
}: {
  lines: DraftLine[];
  products: Product[];
  /** Итог документа — для проверки, что позиции сходятся. */
  amount: number;
  showErrors: boolean;
  onChange: (lines: DraftLine[]) => void;
  /** Подсказка под строкой (сравнение цен, задача 7). */
  renderHint?: (line: DraftLine, product: Product | null) => ReactNode;
}) {
  const listId = useId();
  const byId = new Map(products.map((p) => [p.id, p]));
  const byName = new Map(products.map((p) => [key(p.name), p]));

  const patch = (k: string, p: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === k ? { ...l, ...p } : l)));
  const remove = (k: string) => onChange(lines.filter((l) => l.key !== k));

  /** Ввод в поле «Товар»: точное совпадение — товар из справочника, иначе новый товар с этим названием. */
  const setProductText = (l: DraftLine, text: string) => {
    const found = byName.get(key(text));
    if (found) patch(l.key, { productId: found.id, newProduct: undefined, notGoods: false });
    else patch(l.key, { productId: null, notGoods: false, newProduct: { name: text, unit: l.newProduct?.unit ?? 'кг' } });
  };

  const sum = lines.reduce((s, l) => s + (parseAmount(l.lineTotal) || 0), 0);
  const mismatch = lines.length > 0 && amount > 0 && Math.abs(sum - amount) > 1;

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500">Позиции документа</span>
        {lines.length > 0 && (
          <span className="num text-xs text-slate-500">
            Σ {formatRub(sum)}
          </span>
        )}
      </div>

      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-2.5 py-1.5 font-semibold">Позиция в документе</th>
                <th className="w-[30%] px-2.5 py-1.5 font-semibold">Товар</th>
                <th className="w-32 px-2.5 py-1.5 font-semibold">Кол-во</th>
                <th className="w-32 px-2.5 py-1.5 text-right font-semibold">Сумма с НДС</th>
                <th className="w-28 px-2.5 py-1.5 text-right font-semibold">Цена/ед.</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const product = l.productId ? (byId.get(l.productId) ?? null) : null;
                const unit: BaseUnit | null = product?.unit ?? l.newProduct?.unit ?? null;
                const price = l.notGoods ? null : lineUnitPrice(l);
                const error = showErrors ? validateLine(l) : null;
                const hint = renderHint?.(l, product);
                return (
                  <tr key={l.key} className="border-b border-line align-top last:border-b-0">
                    <td className="px-2.5 py-2">
                      <input
                        className="field !h-8"
                        value={l.rawName}
                        maxLength={300}
                        aria-label="Позиция в документе"
                        onChange={(e) => patch(l.key, { rawName: e.target.value })}
                      />
                      {(l.docQuantity || l.docUnit) && (
                        <div className="num mt-1 text-xs text-slate-400">
                          в документе: {l.docQuantity} {l.docUnit}
                        </div>
                      )}
                      {error && <div className="mt-1 text-xs text-bad">{error}</div>}
                      {hint}
                    </td>
                    <td className="px-2.5 py-2">
                      {l.notGoods ? (
                        <div className="flex h-8 items-center gap-3 text-[13px] text-slate-500">
                          Не товар
                          <button className="link" onClick={() => patch(l.key, { notGoods: false })}>
                            Привязать
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            className="field !h-8"
                            list={listId}
                            placeholder="Найти или ввести новый"
                            aria-label="Товар из справочника"
                            data-state={error === 'Выберите товар или отметьте «Не товар»' ? 'bad' : undefined}
                            value={product?.name ?? l.newProduct?.name ?? ''}
                            onChange={(e) => setProductText(l, e.target.value)}
                          />
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            {product ? (
                              <span className="text-slate-500">из справочника · {product.unit}</span>
                            ) : l.newProduct?.name.trim() ? (
                              <span className="flex items-center gap-1.5 text-slate-500">
                                <span className="font-semibold text-accent">новый товар</span> · ед.
                                <select
                                  className="rounded border border-line bg-white px-1 py-0.5 text-xs"
                                  value={l.newProduct.unit}
                                  aria-label="Единица нового товара"
                                  onChange={(e) => patch(l.key, { newProduct: { name: l.newProduct!.name, unit: e.target.value as BaseUnit } })}
                                >
                                  {BASE_UNITS.map((u) => (
                                    <option key={u}>{u}</option>
                                  ))}
                                </select>
                              </span>
                            ) : null}
                            <button className="link !text-xs" onClick={() => patch(l.key, { notGoods: true, productId: null, newProduct: undefined })}>
                              Не товар
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      {l.notGoods ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            className="field num !h-8 text-right"
                            inputMode="decimal"
                            aria-label="Количество в единицах товара"
                            value={l.baseQuantity}
                            onChange={(e) => patch(l.key, { baseQuantity: e.target.value })}
                          />
                          <span className="w-6 shrink-0 text-xs text-slate-500">{unit ?? ''}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      <input
                        className="field num !h-8 text-right"
                        inputMode="decimal"
                        aria-label="Сумма позиции с НДС"
                        value={l.lineTotal}
                        onChange={(e) => patch(l.key, { lineTotal: e.target.value })}
                      />
                    </td>
                    <td className="num px-2.5 py-2 text-right text-[13px] whitespace-nowrap">
                      {price !== null && unit ? (
                        <span className="leading-8">
                          {formatRub(price)}/{unit}
                        </span>
                      ) : (
                        <span className="leading-8 text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <button className="link link-danger leading-8" aria-label="Удалить позицию" onClick={() => remove(l.key)}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id={listId}>
            {products.map((p) => (
              <option key={p.id} value={p.name}>
                {p.aliases.slice(0, 3).join(' · ')}
              </option>
            ))}
          </datalist>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <button className="link" onClick={() => onChange([...lines, emptyLine()])}>
          + Добавить позицию
        </button>
        {mismatch && (
          <span className="text-warn">
            Позиции не сходятся с итогом на <span className="num font-semibold">{formatRub(Math.abs(sum - amount))}</span>
          </span>
        )}
      </div>
    </div>
  );
}
