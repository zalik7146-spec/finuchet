import type { Worksheet } from 'exceljs';
import type { Category, Expense, Filter } from '../types';
import { periodLabel, periodRange, sumAmounts, timeline, totalsByCategory } from './filters';
import { CONFIDENCE_LABEL, SOURCE_LABEL, formatBucket, todayIso } from './format';

const RUB = '#,##0.00 "₽"';
const REGISTRY = 'Детальный реестр';

function styleHeader(ws: Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle' };
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function styleTotal(ws: Worksheet, rowNumber: number) {
  const row = ws.getRow(rowNumber);
  row.font = { bold: true };
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: { style: 'thin', color: { argb: 'FF0F172A' } } };
  });
}

function autoWidth(ws: Worksheet, moneyCols: number[]) {
  ws.columns.forEach((col, i) => {
    let max = 8;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      let len: number;
      if (v instanceof Date) len = 10;
      else if (typeof v === 'number') len = moneyCols.includes(i + 1) ? v.toFixed(2).length + 6 : String(v).length;
      else if (v && typeof v === 'object' && 'result' in v) len = moneyCols.includes(i + 1) ? Number(v.result ?? 0).toFixed(2).length + 6 : 10;
      else len = String(v ?? '').length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 60);
  });
}

const isoToUtcDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Формирует .xlsx строго по переданной (уже отфильтрованной) выборке и скачивает его. */
export async function downloadExcel(expenses: Expense[], categories: Category[], filter: Filter): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ФинУчет ИИ';
  wb.created = new Date();

  const n = expenses.length;
  const firstRow = 2;
  const lastRow = n + 1;
  const total = sumAmounts(expenses);

  // Листы создаются в порядке вкладок: сводка, реестр, динамика
  const summary = wb.addWorksheet('Сводка по направлениям');
  const registry = wb.addWorksheet(REGISTRY);
  const dynamics = wb.addWorksheet('Динамика по периодам');

  // --- Детальный реестр ---
  registry.addRow(['Дата', 'Контрагент', 'Назначение', '№ документа', 'Направление', 'Сумма', 'Источник', 'Уверенность ИИ']);
  const sorted = [...expenses].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  for (const e of sorted) {
    registry.addRow([
      isoToUtcDate(e.date),
      e.vendor,
      e.description,
      e.documentNumber,
      e.categoryName,
      e.amount,
      SOURCE_LABEL[e.sourceType],
      e.sourceType === 'manual' ? '—' : CONFIDENCE_LABEL[e.aiConfidence],
    ]);
  }
  const regTotal = registry.addRow(['Итого', '', '', '', '', { formula: `SUM(F${firstRow}:F${lastRow})`, result: total }]);
  registry.getColumn(1).numFmt = 'dd.mm.yyyy';
  registry.getColumn(1).alignment = { horizontal: 'left' };
  registry.getColumn(6).numFmt = RUB;
  registry.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
  styleHeader(registry);
  styleTotal(registry, regTotal.number);
  registry.autoFilter = { from: 'A1', to: `H${lastRow}` };
  autoWidth(registry, [6]);

  // --- Сводка по направлениям ---
  summary.addRow(['Направление', 'Заявок', 'Сумма', 'Доля', 'Лимит в месяц']);
  const totals = totalsByCategory(expenses, categories);
  const budgets = new Map(categories.map((c) => [c.id, c.monthlyBudget]));
  const catRange = `'${REGISTRY}'!$E$${firstRow}:$E$${lastRow}`;
  const sumRange = `'${REGISTRY}'!$F$${firstRow}:$F$${lastRow}`;
  const sumTotalRow = totals.length + 2;
  totals.forEach((t, i) => {
    const r = i + 2;
    summary.addRow([
      t.name,
      { formula: `COUNTIF(${catRange},A${r})`, result: t.count },
      { formula: `SUMIF(${catRange},A${r},${sumRange})`, result: t.total },
      { formula: `IF(C$${sumTotalRow}=0,0,C${r}/C$${sumTotalRow})`, result: t.share },
      budgets.get(t.id) ?? null,
    ]);
  });
  summary.addRow([
    'Итого',
    { formula: `SUM(B2:B${sumTotalRow - 1})`, result: n },
    { formula: `SUM(C2:C${sumTotalRow - 1})`, result: total },
    { formula: `SUM(D2:D${sumTotalRow - 1})`, result: n ? 1 : 0 },
  ]);
  summary.getColumn(3).numFmt = RUB;
  summary.getColumn(4).numFmt = '0.0%';
  summary.getColumn(5).numFmt = RUB;
  styleHeader(summary);
  styleTotal(summary, sumTotalRow);
  summary.addRow([]);
  const note = summary.addRow([`Период: ${periodLabel(filter)} · сформировано ${todayIso().split('-').reverse().join('.')}`]);
  note.font = { italic: true, color: { argb: 'FF64748B' } };
  autoWidth(summary, [3, 5]);
  summary.getColumn(1).width = Math.max(28, Math.min(summary.getColumn(1).width ?? 28, 40));

  // --- Динамика по периодам ---
  const { granularity, buckets } = timeline(expenses, filter);
  dynamics.addRow([granularity === 'day' ? 'День' : 'Месяц', 'Заявок', 'Сумма']);
  for (const b of buckets) {
    dynamics.addRow([granularity === 'day' ? isoToUtcDate(b.key) : formatBucket(b.key), b.count, b.total]);
  }
  const dynLast = buckets.length + 1;
  const dynTotal = dynamics.addRow([
    'Итого',
    { formula: `SUM(B2:B${dynLast})`, result: n },
    { formula: `SUM(C2:C${dynLast})`, result: total },
  ]);
  if (granularity === 'day') dynamics.getColumn(1).numFmt = 'dd.mm.yyyy';
  dynamics.getColumn(1).alignment = { horizontal: 'left' };
  dynamics.getColumn(3).numFmt = RUB;
  styleHeader(dynamics);
  styleTotal(dynamics, dynTotal.number);
  autoWidth(dynamics, [3]);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const { from, to } = periodRange(filter);
  const suffix = from || to ? `${from || 'начало'}_${to || 'сегодня'}` : 'все-время';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finuchet_${suffix}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
