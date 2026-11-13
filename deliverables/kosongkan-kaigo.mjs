/**
 * kosongkan-kaigo.mjs — bikin aset template KOSONG dari CV contoh Herlina.
 *
 * Sumber: `F:/template/HERLINA MEY REYGITA CAHYANI_CV.xlsx` (layout klien
 * "CV KAIGO HYOGO 履歴書 - 特定技能 2026").
 *
 * Yang dilakukan, berurutan:
 *   1. Kosongkan SEL DATA (label & style dibiarkan) — daftar di DATA_CELLS.
 *   2. Buang baris 45..996 dan sel kolom O..Z: style-nya borderId=0 (tanpa
 *      garis), jadi yang hilang hanya area kosong ber-gridline.
 *   3. Ganti nama sheet + judul di docProps (nama kandidat = PII).
 *   4. Bangun ulang sharedStrings: hanya string yang MASIH dirujuk, dengan
 *      indeks di-remap di kedua sheet. Tanpa ini nama/alamat/keluarga
 *      kandidat tetap tertinggal di dalam berkas.
 *   5. Ganti foto dengan PNG 1x1 transparan dan `descr` dengan "Pas Foto".
 *   6. Tulis `src/lib/cv-template-factory/templates/kaigo-hyogo.b64.ts`.
 *
 * Jalankan: node deliverables/kosongkan-kaigo.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const SRC = 'F:/template/HERLINA MEY REYGITA CAHYANI_CV.xlsx';
const OUT_TS = 'src/lib/cv-template-factory/templates/kaigo-hyogo.b64.ts';
const SHEET_NAME = '履歴書';
const LAST_ROW = 44;
const LAST_COL = 14; // N

/** Sel yang diisi orang, bukan label. Semua dikosongkan (style dipertahankan). */
const DATA_CELLS = [
  'M2',
  'B3', 'B4', 'B5', 'E5', 'H5', 'K5',
  'B6', 'F6', 'F7', 'H6', 'K6',
  /* 🔴 `B8`, BUKAN `C8`: merge-nya `B8:C8`, dan Excel hanya membaca nilai di
     sel ANCHOR (kiri-atas). Menulis ke `C8` menghasilkan sel yang tampak kosong
     saat dibuka — terbukti dari perbandingan 2026-11-13. */
  'B8', 'E8', 'H8', 'K8',
  'B9', 'B11', 'B13', 'I13', 'C14',
  ...['A', 'B', 'C', 'K'].flatMap((c) => [17, 18, 19, 20].map((r) => `${c}${r}`)),
  ...['A', 'B', 'C', 'J', 'K'].flatMap((c) => [23, 24, 25, 26].map((r) => `${c}${r}`)),
  ...['A', 'C', 'J'].flatMap((c) => [29, 30, 31].map((r) => `${c}${r}`)),
  ...['A', 'B', 'C', 'G', 'H'].flatMap((c) => [34, 35, 36, 37, 38, 39, 40].map((r) => `${c}${r}`)),
  'A42',
];

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const colNum = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const zip = await JSZip.loadAsync(readFileSync(SRC));

/* ── 1. sheet1: kosongkan sel, buang baris/kolom sisa ─────────────────────── */
let sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');

let cleared = 0;
for (const addr of DATA_CELLS) {
  const re = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(sheet);
  if (!m) {
    console.log(`  ⚠ sel ${addr} tidak ada di template`);
    continue;
  }
  const attrs = m[1].replace(/\s+t="[^"]*"/, '');
  sheet = sheet.slice(0, m.index) + `<c r="${addr}"${attrs}/>` + sheet.slice(m.index + m[0].length);
  cleared++;
}

// baris 45..996 dibuang seluruhnya
let rowsDropped = 0;
sheet = sheet.replace(/<row[^>]*r="(\d+)"[^>]*>[\s\S]*?<\/row>/g, (whole, r) => {
  if (Number(r) > LAST_ROW) {
    rowsDropped++;
    return '';
  }
  return whole;
});

// sel kolom O..Z dibuang (style 53/54/95/96: borderId=0)
let cellsDropped = 0;
sheet = sheet.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (whole, col, row, attrs) => {
  if (colNum(col) <= LAST_COL) return whole;
  cellsDropped++;
  return '';
});

sheet = sheet.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:N${LAST_ROW}"/>`);
sheet = sheet.replace(/spans="\d+:\d+"/g, 'spans="1:14"');

/* ── 2. nama sheet & judul dokumen (nama kandidat = PII) ──────────────────── */
let workbook = await zip.file('xl/workbook.xml').async('string');
workbook = workbook.replace(/(<sheet\b[^>]*?\bname=")[^"]*(")/, `$1${SHEET_NAME}$2`);

let app = await zip.file('docProps/app.xml').async('string');
app = app.replace(/<vt:lpstr>[^<]*<\/vt:lpstr>/g, (tag) => (tag.includes('Referensi') ? tag : `<vt:lpstr>${SHEET_NAME}</vt:lpstr>`));

/* ── 3. sharedStrings: sisakan yang masih dirujuk, remap indeks ───────────── */
const ssXml = await zip.file('xl/sharedStrings.xml').async('string');
const siBlocks = [...ssXml.matchAll(/<si>[\s\S]*?<\/si>/g)].map((m) => m[0]);

let sheet2 = await zip.file('xl/worksheets/sheet2.xml').async('string');

/** Indeks shared-string yang masih dipakai, urut kemunculan pertama. */
function usedIndexes(xml) {
  return [...xml.matchAll(/<c r="[A-Z]+\d+"[^>]*\bt="s"[^>]*>\s*<v>(\d+)<\/v>/g)].map((m) => Number(m[1]));
}
const used = [];
const seen = new Set();
for (const idx of [...usedIndexes(sheet), ...usedIndexes(sheet2)]) {
  if (!seen.has(idx)) {
    seen.add(idx);
    used.push(idx);
  }
}
const remap = new Map(used.map((oldIdx, newIdx) => [oldIdx, newIdx]));
const rewriteS = (xml) =>
  xml.replace(/(<c r="[A-Z]+\d+"[^>]*\bt="s"[^>]*>\s*<v>)(\d+)(<\/v>)/g, (_m, a, n, b) => `${a}${remap.get(Number(n)) ?? 0}${b}`);
sheet = rewriteS(sheet);
sheet2 = rewriteS(sheet2);

const newShared = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${used.length}" uniqueCount="${used.length}">${used.map((i) => siBlocks[i]).join('')}</sst>`;

/* ── 4. foto: PNG 1x1 transparan, descr netral ────────────────────────────── */
let drawing = await zip.file('xl/drawings/drawing1.xml').async('string');
drawing = drawing.replace(/descr="[^"]*"/, 'descr="Pas Foto"');

/* ── 5. tulis ulang paket ─────────────────────────────────────────────────── */
zip.file('xl/worksheets/sheet1.xml', sheet);
zip.file('xl/worksheets/sheet2.xml', sheet2);
zip.file('xl/workbook.xml', workbook);
zip.file('docProps/app.xml', app);
zip.file('xl/sharedStrings.xml', newShared);
zip.file('xl/drawings/drawing1.xml', drawing);
zip.file('xl/media/image1.png', PNG_1PX);

const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

console.log(`sel dikosongkan : ${cleared}/${DATA_CELLS.length}`);
console.log(`baris dibuang  : ${rowsDropped} · sel kolom O..Z dibuang: ${cellsDropped}`);
console.log(`sharedStrings   : ${siBlocks.length} → ${used.length}`);
console.log(`ukuran          : ${readFileSync(SRC).length} → ${out.length} byte`);

const b64 = out.toString('base64');
const ts = `/**
 * kaigo-hyogo.b64.ts — template KOSONG form "CV Kaigo Hyogo 履歴書 (特定技能 2026)".
 *
 * ASAL: \`F:/template/HERLINA MEY REYGITA CAHYANI_CV.xlsx\` — CV contoh yang diisi
 * tangan untuk kandidat ASJ00191. Yang dipakai hanya LAYOUT-nya; seluruh isi
 * data dikosongkan oleh \`deliverables/kosongkan-kaigo.mjs\`, foto diganti PNG
 * 1x1 transparan, dan \`sharedStrings\` dibangun ulang supaya nama, alamat,
 * nomor HP, serta nama keluarga kandidat TIDAK tertinggal di dalam berkas.
 *
 * JANGAN diganti dengan berkas contoh langsung: itu mengirim PII kandidat lain
 * ke setiap orang yang mengunduh CV. Tes \`kaigo-hyogo.test.ts\` memeriksanya
 * dengan membuka zip, bukan dengan percaya pada skrip generator.
 *
 * Layout: A1:N44, 88 merge, pas foto di M3:N10. Tab sheet bernama 履歴書.
 */
export const KAIGO_HYOGO_BASE64 = '${b64}';
`;
writeFileSync(OUT_TS, ts);
console.log(`ditulis         : ${OUT_TS} (${ts.length} byte)`);
