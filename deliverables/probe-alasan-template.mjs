/**
 * Probe sekali pakai: cari label 退職理由 / 退職 di kelima aset template.
 *
 * Alasan: audit 2026-11-12 mencatat "0 kemunculan 退職理由 di 4 aset yang
 * berhasil didekode (jipa tanpa sharedStrings, detail gagal didekode)". Sebelum
 * memutuskan renderer mana yang mencetak `pekerjaan[].alasan`, aset yang GAGAL
 * didekode itu harus diperiksa — kalau labelnya ada di sana, keputusannya jelas.
 */
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const DIR = 'src/lib/cv-template-factory/templates/';
const FILES = ['rirekisho-xlsx', 'rirekisho-firma', 'kinki', 'jipa', 'rirekisho-detail'];
const NEEDLES = ['退職理由', '退職', '理由'];

for (const name of FILES) {
  const src = readFileSync(`${DIR}${name}.b64.ts`, 'utf8');
  /* Dua bentuk: array string (`[ "…", "…" ]`) dan konkatenasi (`'…' + '…'`).
     Yang kedua dipakai `rirekisho-detail`, dan itulah yang GAGAL didekode pada
     audit 2026-11-12 — justru aset yang paling perlu diperiksa. */
  const arr = src.match(/(?:export const [A-Z0-9_]+ =\s*)?\[([\s\S]*?)\]/);
  const b64 = arr
    ? [...arr[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]).join('')
    : [...src.slice(src.indexOf('_BASE64')).matchAll(/'([^']*)'/g)]
        .map((x) => x[1])
        .filter((s) => /^[A-Za-z0-9+/=]+$/.test(s))
        .join('');
  if (b64.length < 200) { console.log(`${name}: base64 terlalu pendek (${b64.length})`); continue; }
  const buf = Buffer.from(b64, 'base64');
  let zip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (e) {
    console.log(`${name}: BUKAN zip (${String(e).slice(0, 80)}) — ${buf.length} byte, head=${buf.subarray(0, 4).toString('hex')}`);
    continue;
  }
  const entries = Object.keys(zip.files).filter((f) => f.endsWith('.xml') || f.endsWith('.rels'));
  const hits = [];
  for (const path of entries) {
    const text = await zip.file(path).async('string');
    for (const needle of NEEDLES) {
      let at = text.indexOf(needle);
      while (at !== -1) {
        hits.push(`${path} · ${needle} · …${text.slice(Math.max(0, at - 60), at + 40).replace(/\s+/g, ' ')}…`);
        at = text.indexOf(needle, at + needle.length);
        if (hits.length > 40) break;
      }
    }
  }
  console.log(`\n=== ${name} · ${entries.length} xml · ${hits.length} kemunculan`);
  for (const h of hits.slice(0, 12)) console.log('   ' + h);
}
