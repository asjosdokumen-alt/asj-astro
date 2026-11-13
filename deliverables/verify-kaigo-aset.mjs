// Verifikasi aset template kosong: tidak ada PII, geometri utuh, bisa dibuka.
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

const b64 = /'([A-Za-z0-9+/=]+)'/.exec(readFileSync('src/lib/cv-template-factory/templates/kaigo-hyogo.b64.ts', 'utf8'))[1];
const buf = Buffer.from(b64, 'base64');
const zip = await JSZip.loadAsync(buf);

const parts = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
console.log('PARTS', parts.join(' '));

let pii = 0;
for (const p of parts) {
  const bytes = await zip.file(p).async('uint8array');
  const text = Buffer.from(bytes).toString('latin1');
  for (const needle of ['HERLINA', 'Herlina', 'KARYONO', 'TUKINI', 'ILHAM', '6283135594507', 'GANDUKEPUH', 'DUKUH', '350215605060001', 'herlinareygita']) {
    if (text.includes(needle)) {
      console.log(`  ❌ PII "${needle}" di ${p}`);
      pii++;
    }
  }
}
console.log(pii === 0 ? 'PII: bersih' : `PII: ${pii} temuan`);

const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
console.log('DIM', /<dimension ref="([^"]*)"/.exec(sheet)?.[1], '| merges', (sheet.match(/<mergeCell /g) || []).length, '| rows', (sheet.match(/<row /g) || []).length);
console.log('SHEET NAME', /<sheet[^>]*name="([^"]*)"/.exec(await zip.file('xl/workbook.xml').async('string'))?.[1]);
console.log('DRAWING descr', /descr="([^"]*)"/.exec(await zip.file('xl/drawings/drawing1.xml').async('string'))?.[1]);

const png = await zip.file('xl/media/image1.png').async('uint8array');
console.log('PHOTO bytes', png.length, 'IHDR', png[16], png[17], png[18], png[19], 'x', png[20], png[21], png[22], png[23]);

// buka dengan exceljs — proksi "berkas ini sah"
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);
const ws = wb.worksheets[0];
console.log('EXCELJS ok · sheet', ws.name, '· rowCount', ws.rowCount, '· colCount', ws.columnCount);
for (const addr of ['A1', 'A4', 'B4', 'B5', 'C17', 'K19', 'A29', 'C29', 'A34', 'B34', 'A42', 'A44']) {
  console.log(`  ${addr} = ${JSON.stringify(ws.getCell(addr).value)}`);
}
