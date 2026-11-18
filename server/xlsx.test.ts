import ExcelJS from 'exceljs';
import JSZip from 'jszip';
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

test('защищённый паролем или старый .xls (контейнер CFB) — понятная причина', async () => {
  const cfb = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(600)]);
  await expect(xlsxToText(cfb)).rejects.toThrow('protected_or_xls');
});

test('веб-страница или XML под видом Excel — понятная причина', async () => {
  await expect(xlsxToText(Buffer.from('<html><body><table><tr><td>1</td></tr></table></body></html>'))).rejects.toThrow('not_xlsx');
  await expect(xlsxToText(Buffer.from('<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"/>'))).rejects.toThrow('not_xlsx');
});

test('временный файл Excel (~$) и прочий мусор — не таблица', async () => {
  await expect(xlsxToText(Buffer.from('\x06Lenovo   ', 'latin1'))).rejects.toThrow('not_xlsx');
});

test('картинка в нестандартном формате (выгрузка 1С) не мешает прочитать таблицу', async () => {
  const zip = await JSZip.loadAsync(await book((wb) => wb.addWorksheet('Счёт').addRow(['Мука', 10])));
  // Рисунок без префикса xdr: — так пишет 1С; exceljs на нём падает с «reading 'anchors'»
  zip.file('xl/drawings/drawing1.xml', '<?xml version="1.0"?><wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><twoCellAnchor/></wsDr>');
  zip.file('xl/drawings/_rels/drawing1.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>');
  zip.file('xl/media/image1.png', Buffer.from('89504e47', 'hex'));
  // Лист ссылается на рисунок, как в настоящем счёте
  const sheet = (await zip.file('xl/worksheets/sheet1.xml')!.async('string')).replace('</worksheet>', '<drawing r:id="rIdPic"/></worksheet>');
  zip.file('xl/worksheets/sheet1.xml', sheet);
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdPic" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  expect(await xlsxToText(buf)).toContain('Мука\t10');
});
