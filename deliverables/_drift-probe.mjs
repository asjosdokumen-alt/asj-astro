/**
 * Probe drift master ↔ salinan. BACA-SAJA.
 *
 *   node deliverables/_drift-probe.mjs [file-env]
 *
 * Default `env-kunci/PRODUCTION.env` (Neon). `.env` di root menunjuk proyek
 * Supabase LAMA dan ledger-nya berhenti di 016 — jangan dipakai untuk mengukur.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'env-kunci/PRODUCTION.env';
const env = {};
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('kredensial tidak lengkap di', file);
  process.exit(2);
}
console.log('DB:', new URL(url).host);

const H = { apikey: key, Authorization: 'Bearer ' + key };
const get = async (path) => {
  const r = await fetch(url + '/rest/v1/' + path, { headers: H });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
const norm = (v) => (v === null || v === undefined ? '' : String(v).trim().replace(/^-$/, ''));
const digits = (v) => norm(v).replace(/\D/g, '');

const PAIRS = [
  ['nama_lengkap', 'nama_lengkap'],
  ['nik', 'nik'],
  ['gender', 'gender'],
  ['usia', 'usia'],
  ['tb', 'tb'],
  ['bb', 'bb'],
  ['email', 'email'],
  ['tempat_lahir', 'tempat_lahir'],
  ['tgl_lahir', 'tgl_lahir'],
  ['alamat_lengkap', 'alamat_lengkap'],
  ['no_paspor', 'no_pasport'],
  ['jft_url', 'jft'],
  ['ssw_url', 'ssw'],
  ['pas_photo', 'pas_photo'],
  ['file_cv', 'file_cv'],
  ['folder_url', 'folder_url'],
];

const mCols = PAIRS.map(([a]) => a).join(',');
const cCols = PAIRS.map(([, b]) => b).join(',');
const master = await get(`master_database_candidate?select=no_wa,id_kandidat,${mCols}&limit=2000`);
const cand = await get(`database_candidate?select=no_wa,id_kandidat,${cCols}&limit=2000`);

const byWa = new Map();
for (const r of cand) byWa.set(digits(r.no_wa), r);
const byId = new Map();
for (const r of cand) if (norm(r.id_kandidat)) byId.set(norm(r.id_kandidat), r);

const drift = {};
let noPair = 0;
let total = 0;
const contoh = [];
for (const r of master) {
  const d = byWa.get(digits(r.no_wa)) || byId.get(norm(r.id_kandidat));
  if (!d) {
    noPair++;
    continue;
  }
  const beda = [];
  for (const [a, b] of PAIRS) {
    if (norm(r[a]) !== norm(d[b])) {
      drift[a] = (drift[a] || 0) + 1;
      total++;
      beda.push([a, norm(r[a]), norm(d[b])]);
    }
  }
  if (beda.length >= 3 && contoh.length < 3) contoh.push({ id: r.id_kandidat, beda });
}

const dupWa = [...byWa.entries()].filter(([, r]) => !r).length;
console.log('master', master.length, '· candidate', cand.length);
console.log('master tanpa pasangan:', noPair, '· WA ganda di candidate:', dupWa);
console.log('drift:', JSON.stringify(drift));
console.log('TOTAL sel:', total);
for (const c of contoh) {
  console.log(' contoh', c.id, JSON.stringify(c.beda.map(([k, a, b]) => `${k}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`)));
}
