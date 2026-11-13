// Probe sekali pakai: peta sel lengkap (alamat, merge, style, isi) + geometri
// baris/kolom + anchor gambar, untuk satu berkas .xlsx.
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const path = process.argv[2];
const zip = await JSZip.loadAsync(readFileSync(path));

const ssXml = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml').async('string') : '';
const strings = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('').replace(/&amp;/g, '&').replace(/&#10;/g, '\\n'),
);

const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
const merges = [...sheet.matchAll(/<mergeCell ref="([^"]*)"/g)].map((m) => m[1]);
const mergeOf = (addr) => merges.find((r) => {
  const [a, b] = r.split(':');
  const parse = (x) => x.match(/^([A-Z]+)(\d+)$/).slice(1);
  const [c1, r1] = parse(a);
  const [c2, r2] = parse(b);
  const [cc, rr] = parse(addr);
  const n = (s) => [...s].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
  return n(cc) >= n(c1) && n(cc) <= n(c2) && +rr >= +r1 && +rr <= +r2;
}) || '';

const rows = [...sheet.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)];
console.log('DIM', (sheet.match(/<dimension ref="([^"]*)"/) || [])[1], '| merges', merges.length, '| rows', rows.length);

console.log('\n=== ROW GEOMETRY 1..44 ===');
for (const [, attrs, body] of rows) {
  const r = /r="(\d+)"/.exec(attrs)?.[1];
  if (!r || +r > 44) continue;
  const ht = /ht="([\d.]+)"/.exec(attrs)?.[1] ?? '(default)';
  const cells = [...body.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)];
  const parts = cells.map(([, ref, at, inner]) => {
    const st = /s="(\d+)"/.exec(at)?.[1];
    const t = /t="([^"]*)"/.exec(at)?.[1];
    let val = '';
    if (inner) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      const is = /<is>([\s\S]*?)<\/is>/.exec(inner);
      if (t === 's' && v) val = strings[+v[1]] ?? '';
      else if (is) val = [...is[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
      else if (v) val = v[1];
    }
    return `${ref}[s${st}]${val ? '=' + JSON.stringify(val).slice(0, 40) : ''}${mergeOf(ref) ? '∈' + mergeOf(ref) : ''}`;
  });
  console.log(`r${r} ht=${ht}: ${parts.join(' ')}`);
}

console.log('\n=== DRAWING ===');
const dFile = zip.file('xl/drawings/drawing1.xml');
if (dFile) {
  const d = await dFile.async('string');
  const blocks = d.split(/<xdr:(oneCellAnchor|twoCellAnchor)>/).slice(1);
  for (let i = 0; i < blocks.length; i += 2) {
    const kind = blocks[i];
    const b = blocks[i + 1];
    const from = /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(b)?.[1].replace(/<[^>]+>/g, ',');
    const ext = /<xdr:ext cx="(\d+)" cy="(\d+)"/.exec(b);
    const emb = /r:embed="([^"]+)"/.exec(b)?.[1];
    const name = /name="([^"]*)"/.exec(b)?.[1];
    const descr = /descr="([^"]*)"/.exec(b)?.[1];
    console.log(`- ${kind} from${from} ext=${ext ? ext[1] + 'x' + ext[2] : '-'} embed=${emb ?? '-'} name=${name ?? '-'} descr=${descr ?? '-'}`);
  }
  const relsFile = zip.file('xl/drawings/_rels/drawing1.xml.rels');
  if (relsFile) console.log('RELS', await relsFile.async('string'));
} else {
  console.log('(tidak ada drawing)');
}
console.log('\nPARTS:', Object.keys(zip.files).filter((n) => !zip.files[n].dir).join(' '));
