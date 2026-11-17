import ExcelJS from 'exceljs';
import { expect, test } from 'vitest';
import { xlsxToText } from './xlsx';

async function book(fill: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  fill(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('формула превращается в значение, а не в текст формулы', async () => {
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('Счёт');
    ws.addRow(['Товар', 'Кол-во', 'Цена', 'Сумма']);
    ws.addRow(['Мука в/с', 10, 1450, { formula: 'B2*C2', result: 14500 }]);
  });
  const text = await xlsxToText(buf);
  expect(text).toContain('Мука в/с\t10\t1450\t14500');
  expect(text).not.toContain('B2*C2');
});

test('несколько листов — у каждого свой заголовок', async () => {
  const buf = await book((wb) => {
    wb.addWorksheet('Счёт').addRow(['a']);
    wb.addWorksheet('Спецификация').addRow(['b']);
  });
  const text = await xlsxToText(buf);
  expect(text).toContain('# Лист: Счёт');
  expect(text).toContain('# Лист: Спецификация');
});

test('объединённые ячейки не повторяют значение в строке', async () => {
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('Счёт');
    ws.getCell('A1').value = 'ООО Мельница';
    ws.mergeCells('A1:D1');
  });
  const text = await xlsxToText(buf);
  expect(text.match(/ООО Мельница/g)).toHaveLength(1);
});

test('даты выводятся как ДД.ММ.ГГГГ', async () => {
  const buf = await book((wb) => {
    wb.addWorksheet('Счёт').addRow(['Дата', new Date(Date.UTC(2026, 10, 14))]);
  });
  expect(await xlsxToText(buf)).toContain('Дата\t14.11.2026');
});

test('пустые строки пропускаются', async () => {
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('Счёт');
    ws.getCell('A1').value = 'x';
    ws.getCell('A5').value = 'y';
  });
  expect(await xlsxToText(buf)).toBe('# Лист: Счёт\nx\ny');
});

test('пустая книга бросает empty', async () => {
  const buf = await book((wb) => {
    wb.addWorksheet('Пусто');
  });
  await expect(xlsxToText(buf)).rejects.toThrow('empty');
});

test('обрезка по maxRows', async () => {
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('Счёт');
    for (let i = 1; i <= 10; i++) ws.addRow([`строка ${i}`]);
  });
  const text = await xlsxToText(buf, { maxRows: 3, maxChars: 100_000 });
  expect(text).toContain('строка 3');
  expect(text).not.toContain('строка 4');
});
