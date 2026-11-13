// Bandingkan sel-per-sel: CV contoh (berkas klien) vs hasil generate dari DB.
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const A = process.argv[2]; // asli
const B = process.argv[3]; // hasil generate

async function baca(path) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const ssXml = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml').async('string') : '';
  const strings = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('').replace(/&amp;/g, '&').replace(/&#10;/g, '\n'),
  );
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const cells = new Map();
  for (const [, ref, at, inner] of sheet.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const t = /t="([^"]*)"/.exec(at)?.[1];
    let val = '';
    if (inner) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      const is = /<is>([\s\S]*?)<\/is>/.exec(inner);
      if (t === 's' && v) val = strings[+v[1]] ?? '';
      else if (is) val = [...is[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
      else if (v) val = v[1];
    }
    cells.set(ref, val.replace(/\r/g, '').trim());
  }
  return {
    cells,
    merges: [...sheet.matchAll(/<mergeCell ref="([^"]*)"/g)].map((m) => m[1]).sort(),
    heights: Object.fromEntries([...sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*ht="([\d.]+)"/g)].map((m) => [m[1], m[2]])),
    cols: [...sheet.matchAll(/<col [^>]*min="(\d+)"[^>]*max="(\d+)"[^>]*width="([\d.]+)"/g)].map((m) => `${m[1]}-${m[2]}:${(+m[3]).toFixed(2)}`).join(' '),
    page: /<pageSetup[^>]*>/.exec(sheet)?.[0] ?? '',
  };
}

const a = await baca(A);
const b = await baca(B);

console.log('=== GEOMETRI ===');
console.log('merge   :', a.merges.length, 'vs', b.merges.length, JSON.stringify(a.merges) === JSON.stringify(b.merges) ? 'IDENTIK' : 'BEDA');
console.log('tinggi  :', JSON.stringify(a.heights) === JSON.stringify(b.heights) ? 'IDENTIK' : 'BEDA');
console.log('kolom   :', a.cols === b.cols ? 'IDENTIK' : `BEDA\n  asli ${a.cols}\n  gen  ${b.cols}`);
console.log('pageSetup:', a.page === b.page ? 'IDENTIK' : `BEDA ${a.page} vs ${b.page}`);

const addrs = [...new Set([...a.cells.keys(), ...b.cells.keys()])].sort((x, y) => {
  const p = (s) => [/[A-Z]+/.exec(s)[0], +/\d+/.exec(s)[0]];
  const [c1, r1] = p(x);
  const [c2, r2] = p(y);
  return r1 - r2 || c1.length - c2.length || c1.localeCompare(c2);
});

const sama = [];
const beda = [];
const hanyaAsli = [];
const hanyaGen = [];
for (const addr of addrs) {
  const va = a.cells.get(addr) ?? '';
  const vb = b.cells.get(addr) ?? '';
  if (va === vb) {
    if (va) sama.push(`${addr}=${JSON.stringify(va).slice(0, 60)}`);
  } else if (va && vb) beda.push({ addr, va, vb });
  else if (va) hanyaAsli.push({ addr, va });
  else hanyaGen.push({ addr, vb });
}

console.log(`\n=== SEL BERISI SAMA (${sama.length}) ===`);
console.log(sama.join(' | '));

console.log(`\n=== BEDA NILAI (${beda.length}) ===`);
for (const { addr, va, vb } of beda) console.log(`${addr.padEnd(4)} asli=${JSON.stringify(va).slice(0, 70)}\n     gen =${JSON.stringify(vb).slice(0, 70)}`);

console.log(`\n=== HANYA DI ASLI (${hanyaAsli.length}) ===`);
for (const { addr, va } of hanyaAsli) console.log(`${addr.padEnd(4)} ${JSON.stringify(va).slice(0, 80)}`);

console.log(`\n=== HANYA DI HASIL GENERATE (${hanyaGen.length}) ===`);
for (const { addr, vb } of hanyaGen) console.log(`${addr.padEnd(4)} ${JSON.stringify(vb).slice(0, 80)}`);
