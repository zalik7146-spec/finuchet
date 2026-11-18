import { Fragment, useId, type ReactNode } from 'react';
import { BASE_UNITS, type BaseUnit, type DraftLine, type Product } from '../types';
import { emptyLine } from '../lib/extract';
import { lineUnitPrice, lineWarning, packingWarning, validateLine } from '../lib/draftLines';
import { formatRub, parseAmount } from '../lib/format';

const key = (s: string) => s.trim().toLowerCase();

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Таблица позиций документа на экране проверки: привязка к справочнику, количество, сумма, цена за единицу. */
export function LinesEditor({
  lines,
  products,
  amount,
  amountFieldId,
  showErrors,
  onChange,
  renderHint,
  countPriceRises,
}: {
  lines: DraftLine[];
  products: Product[];
  /** Итог документа — для проверки, что позиции сходятся. */
  amount: number;
  amountFieldId: string;
  showErrors: boolean;
  onChange: (lines: DraftLine[]) => void;
  /** Подсказка под строкой (сравнение цен). */
  renderHint?: (line: DraftLine, product: Product | null) => ReactNode;
  /** Сколько позиций дороже прошлой закупки. */
  countPriceRises?: (lines: DraftLine[]) => number;
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
  const diff = Math.abs(sum - amount);
  const newCount = lines.filter((l) => !l.notGoods && !l.productId && l.newProduct?.name.trim()).length;
  const issues = lines.flatMap((line, i) => {
    const invalid = validateLine(line);
    const missing = lineWarning(line);
    const packing = packingWarning(line, byId.get(line.productId ?? '')?.unit ?? line.newProduct?.unit);
    const messages = [];
    if (invalid) messages.push({ field: line.rawName.trim() ? 'lineTotal' : 'rawName', text: invalid });
    if (missing) messages.push({ field: line.productId || line.newProduct?.name.trim() ? 'baseQuantity' : 'product', text: missing });
    if (packing) messages.push({ field: 'baseQuantity', text: packing });
    return messages.map((issue) => ({ ...issue, target: `${line.key}-${issue.field}`, number: i + 1, name: line.rawName }));
  });
  const rises = countPriceRises?.(lines) ?? 0;

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
        <span className="font-semibold text-ink">Позиции</span>
        {lines.length > 0 ? (
          <span className="text-slate-500">
            {lines.length} {plural(lines.length, 'позиция', 'позиции', 'позиций')}
            {newCount > 0 && (
              <>
                {' · '}
                <span className="text-accent">
                  {newCount} {plural(newCount, 'новый товар', 'новых товара', 'новых товаров')}
                </span>
              </>
            )}
            {rises > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-warn">
                  {rises} дороже прошлой закупки
                </span>
              </>
            )}
            {' · '}
            {amount > 0 && diff > 1 ? (
              <button className="font-semibold text-warn underline" onClick={() => document.getElementById(amountFieldId)?.focus()}>
                не сходится с итогом на <span className="num">{formatRub(diff)}</span>
              </button>
            ) : amount > 0 ? (
              <span className="text-ok">сходится с итогом</span>
            ) : 'укажите итог документа'}
          </span>
        ) : (
          <span className="text-slate-400">нет — расход сохранится без позиций</span>
        )}
      </div>

      {issues.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px]">
          <h3 className="font-semibold text-warn">Проверьте позиции</h3>
          <ul className="mt-1 space-y-1">
            {issues.map((issue) => <li key={issue.target}>
              <button className="text-left text-slate-700 hover:underline" onClick={() => {
                const field = document.getElementById(issue.target);
                field?.focus();
                field?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}>
                <strong>Строка {issue.number}</strong>{issue.name && ` · ${issue.name}`} — {issue.text}
              </button>
            </li>)}
          </ul>
        </div>
      )}
      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[860px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-[30%]" />
              <col className="w-36" />
              <col className="w-36" />
              <col className="w-32" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-1.5 font-semibold">Позиция в документе</th>
                <th className="px-3 py-1.5 font-semibold">Товар из справочника</th>
                <th className="px-3 py-1.5 text-right font-semibold">Кол-во</th>
                <th className="px-3 py-1.5 text-right font-semibold">Сумма с НДС</th>
                <th className="px-3 py-1.5 text-right font-semibold">Цена/ед.</th>
                <th />
              </tr>
            </thead>
            {lines.map((l) => {
              const product = l.productId ? (byId.get(l.productId) ?? null) : null;
              const unit: BaseUnit | null = product?.unit ?? l.newProduct?.unit ?? null;
              const price = l.notGoods ? null : lineUnitPrice(l);
              const error = showErrors ? validateLine(l) : null;
              const warning = lineWarning(l);
              const hint = renderHint?.(l, product);
              const docInfo = l.docQuantity || l.docUnit ? `в документе: ${l.docQuantity} ${l.docUnit}`.trim() : '';
              return (
                <tbody key={l.key} className="border-b border-line last:border-b-0 hover:bg-slate-50/50">
                  <tr>
                    <td className="px-3 pt-2">
                      <input
                        className="field !h-8"
                        value={l.rawName}
                        maxLength={300}
                        title={l.rawName}
                        id={`${l.key}-rawName`}
                        aria-label="Позиция в документе"
                        data-state={error ? 'bad' : undefined}
                        onChange={(e) => patch(l.key, { rawName: e.target.value })}
                      />
                    </td>
                    <td className="px-3 pt-2">
                      {l.notGoods ? (
                        <div className="flex h-8 items-center text-[13px] text-slate-400">не товар · не участвует в ценах</div>
                      ) : (
                        <input
                          className="field !h-8"
                          list={listId}
                          placeholder="Найти или ввести новый"
                          id={`${l.key}-product`}
                          aria-label="Товар из справочника"
                          data-state={warning && !product && !l.newProduct?.name.trim() ? 'warn' : undefined}
                          value={product?.name ?? l.newProduct?.name ?? ''}
                          onChange={(e) => setProductText(l, e.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-3 pt-2">
                      {l.notGoods ? (
                        <div className="flex h-8 items-center justify-end text-xs text-slate-400">—</div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            className="field num !h-8 text-right"
                            inputMode="decimal"
                            id={`${l.key}-baseQuantity`}
                            aria-label="Количество в единицах товара"
                            data-state={warning && (product || l.newProduct) ? 'warn' : undefined}
                            value={l.baseQuantity}
                            onChange={(e) => patch(l.key, { baseQuantity: e.target.value })}
                          />
                          <span className="w-5 shrink-0 text-xs text-slate-500">{unit ?? ''}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 pt-2">
                      <input
                        className="field num !h-8 text-right"
                        inputMode="decimal"
                        id={`${l.key}-lineTotal`}
                        aria-label="Сумма позиции с НДС"
                        value={l.lineTotal}
                        onChange={(e) => patch(l.key, { lineTotal: e.target.value })}
                      />
                    </td>
                    <td className="num px-3 pt-2 text-right text-[13px] whitespace-nowrap">
                      <span className="leading-8">{price !== null && unit ? `${formatRub(price)}/${unit}` : <span className="text-slate-400">—</span>}</span>
                    </td>
                    <td className="pt-2 pr-2 text-center">
                      <button
                        className="h-8 w-8 rounded text-base leading-8 text-slate-400 hover:bg-red-50 hover:text-bad"
                        aria-label="Удалить позицию"
                        title="Удалить позицию"
                        onClick={() => remove(l.key)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  <tr className="text-xs">
                    <td className="truncate px-3 pt-1 pb-2 text-slate-400">
                      {error ? <span className="text-bad">{error}</span> : warning ? <span className="text-warn">{warning}</span> : <span className="num">{docInfo}</span>}
                    </td>
                    <td className="px-3 pt-1 pb-2" colSpan={4}>
                      <span className="flex flex-wrap items-center gap-x-2 text-slate-500">
                        {l.notGoods ? (
                          <button className="link !text-xs" onClick={() => patch(l.key, { notGoods: false })}>
                            Привязать к товару
                          </button>
                        ) : (
                          <>
                            {product ? (
                              <span>из справочника · {product.unit}</span>
                            ) : l.newProduct?.name.trim() ? (
                              <span className="flex items-center gap-1.5">
                                <span className="font-semibold text-accent">новый товар</span> · ед.
                                <select
                                  className="rounded border border-line bg-white px-1 text-xs"
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
                            {(product || l.newProduct?.name.trim()) && <span className="text-slate-300">·</span>}
                            <button className="link !text-xs !font-normal !text-slate-500 hover:!text-accent" onClick={() => patch(l.key, { notGoods: true, productId: null, newProduct: undefined })}>
                              не товар
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                    <td />
                  </tr>
                  {hint && (
                    <tr>
                      <td colSpan={6} className="px-3 pb-2.5">
                        {hint}
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
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

      <button className="link mt-2 !text-[13px]" onClick={() => onChange([...lines, emptyLine()])}>
        + Добавить позицию
      </button>
    </div>
  );
}
