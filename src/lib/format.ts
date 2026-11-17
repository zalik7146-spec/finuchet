import type { Confidence, SourceType } from '../types';

const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShort = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

export const formatRub = (n: number) => `${money.format(n)} ₽`;
export const formatRubShort = (n: number) => moneyShort.format(n);

/** YYYY-MM-DD → ДД.ММ.ГГГГ */
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIso(new Date());

export const isValidIsoDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

/** «4 500,50» → 4500.5; NaN, если не число. */
export const parseAmount = (s: string) => {
  const cleaned = s.replace(/[\s ₽]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return Math.round(Number(cleaned) * 100) / 100;
};

export const amountToInput = (n: number) => n.toFixed(2).replace('.', ',');

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'высокая',
  medium: 'средняя',
  low: 'низкая',
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  pdf: 'PDF',
  image: 'Скан',
  text: 'Текст',
  manual: 'Вручную',
};

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/** «2026-11» → «ноя 2026», «2026-11-14» → «14.11» */
export const formatBucket = (key: string) => {
  const p = key.split('-');
  return p.length === 2 ? `${MONTHS[Number(p[1]) - 1]} ${p[0]}` : `${p[2]}.${p[1]}`;
};
