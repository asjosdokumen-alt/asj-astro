/**
 * kosongkan-tg.mjs — bikin aset template KOSONG untuk "CV TG" (template ke-7).
 *
 * Sumber: `D:/6. DEVIANA AMANDA PUTRI_CV.xlsx` — berkas yang diisi pemilik
 * secara MANUAL. Berkas kosongnya (`D:/TG 2026.07.02.xlsx`) tidak dipakai
 * sebagai basis karena ia TIDAK punya bagian drawing: pas foto kandidat
 * di-anchor di kolom BP, dan tanpa drawing/rels/media tidak ada tempat untuk
 * menaruh foto sama sekali.
 *
 * Yang dilakukan, berurutan:
 *   1. Kosongkan SEL DATA baris 4 (B4:BO4, kecuali H4 yang berisi rumus umur).
 *   2. Bangun ulang sharedStrings: hanya string yang MASIH dirujuk. Tanpa ini
 *      nama, alamat, nomor HP, dan esai kandidat tetap tertinggal di dalam
 *      berkas yang diunduh orang lain.
 *   3. Ganti foto dengan PNG 1x1 transparan dan `descr` menjadi "Pas Foto".
 *   4. Bersihkan docProps (creator/lastModifiedBy) — nama orang, bukan metadata.
 *   5. Tulis `src/lib/cv-template-factory/templates/tg.b64.ts`.
 *
 * Jalankan: node deliverables/kosongkan-tg.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const SRC = 'D:/6. DEVIANA AMANDA PUTRI_CV.xlsx';
const OUT_TS = 'src/lib/cv-template-factory/templates/tg.b64.ts';

/** Kolom B..BO (66 kolom). H4 dikecualikan: rumus DATEDIF umur. */
const colName = (n) => {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
const DATA_CELLS = [];
for (let c = 2; c <= 67; c++) {
  const addr = `${colName(c)}4`;
  if (addr === 'H4') continue; // rumus umur, dibiarkan
  DATA_CELLS.push(addr);
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const zip = await JSZip.loadAsync(readFileSync(SRC));

/* ── 1. Kosongkan sel data (style dipertahankan) ──────────────────────────── */
const SHEET = 'xl/worksheets/sheet2.xml';
let sheet = await zip.file(SHEET).async('string');
let cleared = 0;
let missing = [];
for (const addr of DATA_CELLS) {
  const re = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(sheet);
  if (!m) {
    missing.push(addr);
    continue;
  }
  const attrs = m[1].replace(/\s+t="[^"]*"/g, '');
  sheet = sheet.slice(0, m.index) + `<c r="${addr}"${attrs}/>` + sheet.slice(m.index + m[0].length);
  cleared++;
}
zip.file(SHEET, sheet);

/* ── 2. Bangun ulang sharedStrings ────────────────────────────────────────── */
const SS = 'xl/sharedStrings.xml';
const ssXml = await zip.file(SS).async('string');
const items = [...ssXml.matchAll(/<si>[\s\S]*?<\/si>/g)].map((m) => m[0]);

const sheets = ['xl/worksheets/sheet1.xml', SHEET];
const texts = {};
for (const p of sheets) texts[p] = await zip.file(p).async('string');

const used = new Set();
for (const p of sheets) {
  for (const m of texts[p].matchAll(/<c\b[^>]*\bt="s"[^>]*>\s*<v>(\d+)<\/v>/g)) used.add(Number(m[1]));
}
const order = [...used].sort((a, b) => a - b);
const remap = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));

for (const p of sheets) {
  texts[p] = texts[p].replace(
    /(<c\b[^>]*\bt="s"[^>]*>\s*<v>)(\d+)(<\/v>)/g,
    (_m, a, n, b) => `${a}${remap.get(Number(n))}${b}`,
  );
  zip.file(p, texts[p]);
}

const newItems = order.map((i) => items[i]);
zip.file(
  SS,
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${newItems.length}" uniqueCount="${newItems.length}">` +
    newItems.join('') +
    `</sst>`,
);

/* ── 3. Foto: PNG 1x1 + descr netral ──────────────────────────────────────── */
zip.file('xl/media/image1.png', PNG_1PX);
const DRAW = 'xl/drawings/drawing1.xml';
let draw = await zip.file(DRAW).async('string');
draw = draw.replace(/descr="[^"]*"/, 'descr="Pas Foto"');
zip.file(DRAW, draw);

/* ── 4. docProps ──────────────────────────────────────────────────────────── */
for (const p of ['docProps/core.xml', 'docProps/app.xml']) {
  const f = zip.file(p);
  if (!f) continue;
  let xml = await f.async('string');
  xml = xml.replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator>ASJ</dc:creator>');
  xml = xml.replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>ASJ</cp:lastModifiedBy>');
  xml = xml.replace(/<dc:title>[^<]*<\/dc:title>/, '<dc:title>CV</dc:title>');
  zip.file(p, xml);
}

/* ── 5. Tulis aset ────────────────────────────────────────────────────────── */
const b64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
const bytes = Buffer.from(b64, 'base64');
writeFileSync(
  OUT_TS,
  `/**\n * tg.b64.ts — template "CV TG" (ke-7), KOSONG.\n *\n` +
    ` * Dibuat \`deliverables/kosongkan-tg.mjs\` dari CV contoh yang diisi pemilik\n` +
    ` * manual (\`D:/6. DEVIANA AMANDA PUTRI_CV.xlsx\`). Seluruh nilai baris 4\n` +
    ` * dikosongkan, foto diganti PNG 1x1, sharedStrings dibangun ulang, dan\n` +
    ` * docProps dibersihkan — tidak ada satu pun data kandidat di dalam aset ini.\n` +
    ` *\n * Jangan disunting tangan. Ukuran: ${bytes.length} byte.\n */\n` +
    `export const TG_BASE64 =\n  '${b64}';\n`,
);

console.log(`[tg] cells cleared      : ${cleared}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
console.log(`[tg] sharedStrings      : ${items.length} -> ${newItems.length}`);
console.log(`[tg] aset               : ${OUT_TS} (${bytes.length} byte)`);
