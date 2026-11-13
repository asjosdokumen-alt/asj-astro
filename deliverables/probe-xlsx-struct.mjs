// Probe sekali pakai: baca struktur .xlsx (merge, dimensi, isi sel) untuk
// menentukan apakah berkas ini layout BARU atau sama dengan template yang ada.
// Jalankan: node deliverables/probe-xlsx-struct.mjs "<path>"
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const path = process.argv[2];
const zip = await JSZip.loadAsync(readFileSync(path));

const names = Object.keys(zip.files).filter((n) => /^xl\/(workbook|worksheets|sharedStrings|styles)/.test(n));
console.log('=== ENTRI ===');
console.log(names.join('\n'));

const wb = await zip.file('xl/workbook.xml').async('string');
const sheets = [...wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g)].map((m) => ({ name: m[1], rid: m[2] }));
console.log('\n=== SHEET ===', JSON.stringify(sheets));

const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
const relMap = {};
for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"/g)) relMap[m[1]] = m[2];
console.log('=== RELS ===', JSON.stringify(relMap));

// shared strings
const ssXml = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml').async('string') : '';
const shared = [];
for (const si of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  const txt = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('');
  shared.push(txt.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

const sheetFile = 'xl/' + (relMap[sheets[0].rid] || 'worksheets/sheet1.xml').replace(/^\//, '');
const xml = await zip.file(sheetFile).async('string');

const dim = xml.match(/<dimension ref="([^"]*)"/);
console.log('\n=== DIMENSION ===', dim ? dim[1] : 'none');

const merges = [...xml.matchAll(/<mergeCell ref="([^"]*)"/g)].map((m) => m[1]);
console.log('\n=== MERGES ===', merges.length);
console.log(merges.join(' '));

const cols = [...xml.matchAll(/<col [^>]*\/>/g)].map((m) => m[0]);
console.log('\n=== COLS ===', cols.length);
console.log(cols.join('\n'));

const rows = [...xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
console.log('\n=== ROWS ===', rows.length);

function decode(ref, body) {
  const t = body.match(/<c [^>]*t="([^"]*)"/);
  const v = body.match(/<v>([\s\S]*?)<\/v>/);
  const is = body.match(/<is>([\s\S]*?)<\/is>/);
  let val = '';
  if (t && t[1] === 's' && v) val = shared[Number(v[1])] ?? '';
  else if (t && t[1] === 'inlineStr' && is) val = [...is[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
  else if (v) val = v[1];
  const f = body.match(/<f[^>]*>([\s\S]*?)<\/f>/);
  const s = body.match(/<c [^>]*s="(\d+)"/);
  return { ref, val: val.trim(), formula: f ? f[1] : null, style: s ? s[1] : null };
}

console.log('\n=== ISI SEL (non-kosong) ===');
for (const [, r, body] of rows) {
  const cells = [...body.matchAll(/<c r="([A-Z]+\d+)"([\s\S]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)];
  const line = [];
  for (const c of cells) {
    const d = decode(c[1], c[0]);
    if (d.val || d.formula) line.push(`${d.ref}=${JSON.stringify(d.val)}${d.formula ? `{=${d.formula}}` : ''}[s${d.style}]`);
  }
  if (line.length) console.log(`r${r}: ` + line.join(' | '));
}
