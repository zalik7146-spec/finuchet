import ExcelJS from 'exceljs';

const pad = (n: number) => String(n).padStart(2, '0');
const formatDate = (d: Date) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;

/** Значение ячейки как текст: результат формулы, дата ДД.ММ.ГГГГ, текст из форматированных фрагментов. */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatDate(v);
  if (typeof v === 'object') {
    if ('result' in v) {
      const r = v.result;
      if (r instanceof Date) return formatDate(r);
      return r === undefined || r === null || typeof r === 'object' ? '' : String(r);
    }
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
  }
  return String(v).replace(/[\t\r\n]+/g, ' ');
}

/**
 * Excel-счёт → текст для модели: каждый лист с заголовком, строки через перевод строки, ячейки через табуляцию.
 * Gemini не принимает .xlsx напрямую, поэтому таблицу отдаём как текст.
 */
export async function xlsxToText(buf: Buffer, limits = { maxRows: 2000, maxChars: 200_000 }): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out: string[] = [];
  let rows = 0;
  let chars = 0;

  sheets: for (const ws of wb.worksheets) {
    const lines: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (rows >= limits.maxRows || chars >= limits.maxChars) return;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        // У объединённых ячеек значение хранится только в главной — остальные пропускаем
        cells.push(cell.isMerged && cell.master !== cell ? '' : cellText(cell).trim());
      });
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (!cells.some(Boolean)) return;
      const line = cells.join('\t');
      lines.push(line);
      rows += 1;
      chars += line.length + 1;
    });
    if (lines.length) out.push(`# Лист: ${ws.name}`, ...lines);
    if (rows >= limits.maxRows || chars >= limits.maxChars) break sheets;
  }

  if (!rows) throw new Error('empty');
  return out.join('\n').slice(0, limits.maxChars);
}
