// Buka hasil generate dengan exceljs — proksi "berkas ini sah dibuka Excel",
// sekaligus mencetak sel-sel kunci untuk diperiksa mata.
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(readFileSync(process.argv[2]));
const ws = wb.worksheets[0];
console.log('sheet', ws.name, '· rows', ws.rowCount, '· cols', ws.columnCount);

const teks = (v) => (v && typeof v === 'object' && v.richText ? v.richText.map((x) => x.text).join('') : v);
for (const addr of [
  'A1', 'M1', 'M2', 'B3', 'B4', 'B5', 'E5', 'H5', 'K5', 'B6', 'B8', 'B9', 'B11', 'B13',
  'A17', 'B17', 'C17', 'K17', 'A18', 'K19',
  'A23', 'B23', 'C23', 'J23', 'K23',
  'A29', 'C29', 'J29', 'C30', 'J30',
  'A34', 'B34', 'C34', 'G34', 'H34', 'A36',
  'A42',
]) {
  console.log(' ', addr.padEnd(4), JSON.stringify(teks(ws.getCell(addr).value)));
}
