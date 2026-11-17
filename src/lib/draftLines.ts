import type { BaseUnit, DraftLine, ExpenseLine, ExpenseLineInput, Product } from '../types';
import { parseAmount } from './format';

const key = (s: string) => s.trim().toLowerCase();

/** «500», «1 000,5» → число; пусто или не число → null. */
export function parseQuantity(s: string): number | null {
  const cleaned = s.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? n : null;
}

export const quantityToInput = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));

/** Цена за единицу товара с НДС; null, если количество не задано. */
export function lineUnitPrice(l: DraftLine): number | null {
  const qty = parseQuantity(l.baseQuantity);
  const total = parseAmount(l.lineTotal);
  if (qty === null || !(total >= 0)) return null;
  return Math.round((total / qty) * 10_000) / 10_000;
}

export function validateLine(l: DraftLine): string | null {
  if (!l.rawName.trim()) return 'Укажите название позиции';
  if (!(parseAmount(l.lineTotal) >= 0)) return 'Укажите сумму позиции';
  if (l.notGoods) return null;
  if (!l.productId && !l.newProduct?.name.trim()) return 'Выберите товар или отметьте «Не товар»';
  if (parseQuantity(l.baseQuantity) === null) return 'Укажите количество в единицах товара';
  return null;
}

/** Новые товары из всех черновиков пакета: без повторов (без учёта регистра) и без тех, что уже есть в справочнике. */
export function newProductsToCreate(lineGroups: DraftLine[][], products: Product[]): Array<{ name: string; unit: BaseUnit }> {
  const known = new Set(products.map((p) => key(p.name)));
  const out = new Map<string, { name: string; unit: BaseUnit }>();
  for (const l of lineGroups.flat()) {
    if (l.notGoods || l.productId || !l.newProduct) continue;
    const name = l.newProduct.name.trim();
    if (!name || known.has(key(name)) || out.has(key(name))) continue;
    out.set(key(name), { name, unit: l.newProduct.unit });
  }
  return [...out.values()];
}

/** Строки черновика → позиции для сохранения. idByName — id товаров по названию в нижнем регистре. */
export function draftLinesToInput(lines: DraftLine[], idByName: Map<string, string>): ExpenseLineInput[] {
  return lines.map((l, position) => {
    const productId = l.notGoods ? null : (l.productId ?? (l.newProduct ? (idByName.get(key(l.newProduct.name)) ?? null) : null));
    return {
      position,
      rawName: l.rawName.trim(),
      productId,
      docQuantity: parseQuantity(l.docQuantity),
      docUnit: l.docUnit.trim(),
      baseQuantity: parseQuantity(l.baseQuantity),
      lineTotal: parseAmount(l.lineTotal),
    };
  });
}

/** Названия из документов, которых ещё нет среди алиасов товара: так ИИ быстрее узнаёт товар в следующий раз. */
export function aliasUpdates(inputs: ExpenseLineInput[][], products: Product[]): Map<string, string[]> {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = new Map<string, string[]>();
  for (const l of inputs.flat()) {
    const p = l.productId ? byId.get(l.productId) : undefined;
    if (!p) continue;
    const current = out.get(p.id) ?? [];
    const taken = new Set([key(p.name), ...p.aliases.map(key), ...current.map(key)]);
    if (taken.has(key(l.rawName)) || p.aliases.length + current.length >= 50) continue;
    out.set(p.id, [...current, l.rawName.trim()]);
  }
  return out;
}

/** Сохранённая позиция → строка черновика (при открытии расхода на редактирование). */
export function lineToDraft(l: ExpenseLine): DraftLine {
  return {
    key: crypto.randomUUID(),
    rawName: l.rawName,
    productId: l.productId,
    notGoods: l.productId === null,
    docQuantity: quantityToInput(l.docQuantity),
    docUnit: l.docUnit,
    baseQuantity: quantityToInput(l.baseQuantity),
    lineTotal: l.lineTotal.toFixed(2).replace('.', ','),
  };
}
