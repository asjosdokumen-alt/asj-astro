// Bandingkan geometri baris/kolom/print antara berkas asli dan hasil generate.
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

async function geo(path) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const rows = Object.fromEntries(
    [...sheet.matchAll(/<row[^>]*r="(\d+)"([^>]*)>/g)].map((m) => [
      m[1],
      { ht: /ht="([\d.]+)"/.exec(m[2])?.[1] ?? null, custom: /customHeight="1"/.test(m[2]) },
    ]),
  );
  return {
    rows,
    cols: [...sheet.matchAll(/<col [^>]*\/>/g)].map((m) => m[0]),
    pageSetup: /<pageSetup[^>]*>/.exec(sheet)?.[0],
    printOptions: /<printOptions[^>]*>/.exec(sheet)?.[0],
    margins: /<pageMargins[^>]*>/.exec(sheet)?.[0],
    sheetView: /<sheetView[^>]*>/.exec(sheet)?.[0],
    merges: [...sheet.matchAll(/<mergeCell ref="([^"]*)"/g)].map((m) => m[1]),
  };
}

const a = await geo(process.argv[2]);
const b = await geo(process.argv[3]);

const beda = [];
for (const r of Object.keys(a.rows)) {
  if (+r > 44) continue;
  if (JSON.stringify(a.rows[r]) !== JSON.stringify(b.rows[r])) beda.push(`r${r} asli=${JSON.stringify(a.rows[r])} gen=${JSON.stringify(b.rows[r])}`);
}
console.log('tinggi baris 1..44 :', beda.length ? 'BEDA\n  ' + beda.join('\n  ') : 'IDENTIK');
console.log('baris di gen       :', Object.keys(b.rows).length, '(asli', Object.keys(a.rows).length + ')');
console.log('kolom              :', JSON.stringify(a.cols) === JSON.stringify(b.cols) ? 'IDENTIK' : 'BEDA');
console.log('pageSetup          :', a.pageSetup === b.pageSetup ? 'IDENTIK' : `${a.pageSetup} vs ${b.pageSetup}`);
console.log('printOptions       :', a.printOptions === b.printOptions ? 'IDENTIK' : `${a.printOptions} vs ${b.printOptions}`);
console.log('margins            :', a.margins === b.margins ? 'IDENTIK' : 'BEDA');
console.log('sheetView          :', a.sheetView === b.sheetView ? 'IDENTIK' : `${a.sheetView} vs ${b.sheetView}`);
console.log('merge (urutan)     :', JSON.stringify(a.merges) === JSON.stringify(b.merges) ? 'IDENTIK' : 'BEDA');
