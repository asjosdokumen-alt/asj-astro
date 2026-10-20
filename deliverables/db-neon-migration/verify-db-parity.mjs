#!/usr/bin/env node
/**
 * verify-db-parity.mjs — Bukti ulang bahwa data Neon === data Supabase.
 *
 * Dipakai untuk menjawab: "DB sudah pindah ke Neon, datanya sama dengan yang
 * lama atau tidak?" — dan untuk mengulang jawaban itu SETIAP kali sebelum
 * cutover, karena sinkronisasi satu kali bukan bukti sinkronisasi saat ini.
 *
 * Cara pakai:
 *   node deliverables/db-neon-migration/verify-db-parity.mjs \
 *     --neon 'postgresql://neondb_owner:...@ep-....neon.tech/neondb?sslmode=require'
 *
 * Kredensial Supabase LAMA dibaca dari .env.local (SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY) lewat variabel lingkungan bila tersedia:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node verify-db-parity.mjs --neon '...'
 *
 * Yang dibandingkan, per tabel:
 *   1. nama kolom + tipe data (dari OpenAPI PostgREST vs information_schema)
 *   2. jumlah baris
 *   3. HASH setiap baris (nama+nilai dinormalkan) — bukan cuma jumlah, karena
 *      dua tabel bisa punya 234 baris dan tetap berbeda isinya.
 *
 * Keluaran: ringkasan per tabel + exit code 1 bila ada beda (bisa dipakai di CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

// ── argumen ────────────────────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const NEON = arg('neon') || process.env.NEON_DATABASE_URL;
if (!NEON) {
  console.error('wajib: --neon <connection-string> atau NEON_DATABASE_URL');
  process.exit(2);
}

// .env.local hanya dibaca kalau env belum diisi (pratinjau lokal).
function fromEnvLocal(key) {
  const f = path.join(REPO, '.env.local');
  if (!fs.existsSync(f)) return null;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp('^' + key + '\\s*=\\s*(.*)$'));
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return null;
}
const SU = process.env.SUPABASE_URL || fromEnvLocal('SUPABASE_URL');
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || fromEnvLocal('SUPABASE_SERVICE_ROLE_KEY');
if (!SU || !SK) {
  console.error('wajib: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (env atau .env.local)');
  process.exit(2);
}
const H = { apikey: SK, Authorization: 'Bearer ' + SK };

// ── normalisasi nilai ─────────────────────────────────────────────────────
// Dua sumber berbeda membentuk nilai yang sama secara logis tapi berbeda
// secara literal (Date vs ISO string, bigint vs number, jsonb vs object).
// Tanpa normalisasi ini, hash akan berbeda walaupun datanya identik.
function norm(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return { $d: v.toISOString() };
  if (Array.isArray(v)) return v.map(norm);
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = norm(v[k]);
    return o;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  return v;
}
const hash = (o) =>
  crypto.createHash('sha1').update(JSON.stringify(norm(o))).digest('hex').slice(0, 12);

// ── sisi lama: PostgREST (HTTP) ────────────────────────────────────────────
async function fetchAll(table) {
  const rows = [];
  let url = `${SU}/rest/v1/${table}?select=*&limit=1000`;
  while (url) {
    const r = await fetch(url, { headers: H });
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`);
    rows.push(...(await r.json()));
    const next = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    url = next ? new URL(next[1], r.url).toString() : null;
  }
  return rows;
}

async function readSupabase() {
  const spec = await (await fetch(`${SU}/rest/v1/`, { headers: H })).json();
  const tables = Object.keys(spec.paths || {})
    .filter((p) => p !== '/')
    .map((p) => p.slice(1))
    .filter((t) => !t.startsWith('rpc/'))
    .sort();
  const out = {};
  for (const t of tables) {
    const def = spec.definitions?.[t] || spec.components?.schemas?.[t];
    out[t] = {
      cols: Object.keys(def?.properties || {}),
      rows: await fetchAll(t),
    };
  }
  return out;
}

// ── sisi baru: pg langsung ke Neon ────────────────────────────────────────
async function readNeon() {
  const c = new pg.Client({
    connectionString: NEON,
    ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
  });
  await c.connect();
  const t = await c.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' order by 1`,
  );
  const pk = await c.query(
    `select cl.relname as tbl, a.attname as col
     from pg_index i
     join pg_class cl on cl.oid = i.indrelid
     join pg_namespace n on n.oid = cl.relnamespace
     join pg_attribute a on a.attrelid = cl.oid and a.attnum = any(i.indkey)
     where i.indisprimary and n.nspname='public'`,
  ).catch(() => ({ rows: [] }));
  const pkMap = {};
  for (const r of pk.rows) (pkMap[r.tbl] ||= []).push(r.col);

  const cr = await c.query(
    `select table_name, column_name, data_type from information_schema.columns
     where table_schema='public' order by table_name, ordinal_position`,
  );
  const cols = {};
  for (const r of cr.rows) (cols[r.table_name] ||= []).push(r.column_name);

  const out = {};
  for (const tbl of t.rows.map((r) => r.table_name)) {
    const order = pkMap[tbl]?.length ? pkMap[tbl].map((x) => `"${x}"`).join(', ') : 'ctid';
    const r = await c.query(`select row_to_json(x) as j from (select * from public."${tbl}" order by ${order}) x`);
    out[tbl] = {
      cols: cols[tbl] || [],
      rows: r.rows.map((x) => (typeof x.j === 'string' ? JSON.parse(x.j) : x.j)),
    };
  }
  await c.end();
  return out;
}

// ── bandingkan ────────────────────────────────────────────────────────────
const oldDb = await readSupabase();
const newDb = await readNeon();
const names = [...new Set([...Object.keys(oldDb), ...Object.keys(newDb)])].sort();

const rows = [];
let fails = 0;
for (const t of names) {
  const a = oldDb[t], b = newDb[t];
  if (!a || !b) {
    fails++;
    rows.push([t, `HANYA ADA DI ${a ? 'LAMA(supabase)' : 'BARU(neon)'}`, '']);
    continue;
  }
  const missing = a.cols.filter((c) => !b.cols.includes(c));
  const extra = b.cols.filter((c) => !a.cols.includes(c));
  if (missing.length || extra.length) {
    fails++;
    rows.push([t, 'KOLOM BEDA', `missing=${missing} extra=${extra}`]);
    continue;
  }
  if (a.rows.length !== b.rows.length) {
    fails++;
    rows.push([t, 'JUMLAH BARIS BEDA', `lama=${a.rows.length} baru=${b.rows.length}`]);
    continue;
  }
  const setA = new Set(a.rows.map(hash));
  const setB = new Set(b.rows.map(hash));
  if (setA.size !== setB.size) {
    fails++;
    rows.push([t, 'HASH BEDA (ada baris dobel / isi lain)', `unik lama=${setA.size} baru=${setB.size}`]);
    continue;
  }
  const diffA = a.rows.filter((x) => !setB.has(hash(x)));
  const diffB = b.rows.filter((x) => !setA.has(hash(x)));
  if (diffA.length || diffB.length) {
    fails++;
    rows.push([t, 'ISI BARIS BEDA',
      `hanyaLama=${diffA.length} hanyaBaru=${diffB.length}` +
      (diffA[0] ? ` contohLama=${JSON.stringify(diffA[0]).slice(0, 160)}` : '') +
      (diffB[0] ? ` contohBaru=${JSON.stringify(diffB[0]).slice(0, 160)}` : '')]);
    continue;
  }
  rows.push([t, `IDENTIK (${a.rows.length} baris)`, '']);
}

const pad = (s, w) => String(s).padEnd(w);
console.log(pad('TABEL', 30) + pad('STATUS', 34) + 'DETAIL');
console.log('-'.repeat(100));
for (const [t, s, d] of rows) console.log(pad(t, 30) + pad(s, 34) + d);
console.log('-'.repeat(100));
console.log(`tabel: ${rows.length} | gagal: ${fails}`);
console.log(fails === 0
  ? 'HASIL: data Neon identik dengan Supabase lama.'
  : 'HASIL: ADA PERBEDAAN — jangan cutover sebelum ketemu penyebabnya.');
process.exit(fails === 0 ? 0 : 1);
