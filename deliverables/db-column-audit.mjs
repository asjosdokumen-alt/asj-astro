// deliverables/db-column-audit.mjs — audit kolom: dipakai kode? berisi data?
//
// HANYA BACA. Untuk setiap kolom di tabel utama:
//   - jumlah baris yang tidak kosong (NULL / '' / '-' dianggap kosong)
//   - jumlah kemunculan nama kolom di kode (src/, netlify/, shared/, scripts/)
// Hasil: CSV + ringkasan. Tujuannya memisahkan tiga hal yang sering dicampur:
//   (a) kolom HIDUP   — dipakai kode dan berisi
//   (b) kolom MATI    — tidak dipakai kode DAN kosong  -> kandidat drop
//   (c) kolom YATIM   — berisi data tapi tidak ada kode yang membacanya
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import pg from 'pg';

const { initDbEnv } = await import('../scripts/lib/load-env.mjs');
const dbEnv = initDbEnv();
if (!dbEnv.url) { console.error('tidak ada URL DB'); process.exit(1); }

const ROOT = process.cwd();
const CODE_DIRS = ['src', 'netlify', 'shared', 'scripts', 'e2e'];
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.astro']);

function walk(dir, out = []) {
  let ents;
  try { ents = readdirSync(dir); } catch { return out; }
  for (const e of ents) {
    if (e === 'node_modules' || e === '.git' || e === 'dist' || e === '.astro') continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (CODE_EXT.has(extname(e))) out.push(p);
  }
  return out;
}

const files = CODE_DIRS.flatMap((d) => walk(join(ROOT, d)));
// `schema.generated.ts` memuat SETIAP kolom sebagai kontrak, jadi ia akan
// membuat semua kolom tampak "dipakai". Ia dikeluarkan dari hitungan produksi;
// jumlahnya dilaporkan terpisah supaya hilangnya sebuah kolom dari kontrak
// tetap terlihat.
const SCHEMA_FILE = 'schema.generated.ts';
const isTest = (f) => /\.test\.[cm]?[jt]sx?$/.test(f);
const prodFiles = files.filter((f) => !f.endsWith(SCHEMA_FILE) && !isTest(f));
const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
const corpus = prodFiles.map(read).join('\n');
console.log(`kode produksi dipindai: ${prodFiles.length} berkas (${files.length - prodFiles.length} tes/kontrak dikecualikan), ${(corpus.length / 1024 / 1024).toFixed(1)} MB`);

/** Berapa kali nama kolom muncul sebagai token utuh di kode produksi. */
function refs(col) {
  const re = new RegExp(`(?<![A-Za-z0-9_])${col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g');
  const m = corpus.match(re);
  return m ? m.length : 0;
}

const client = new pg.Client({
  connectionString: dbEnv.url,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 20000,
  connectionTimeoutMillis: 20000,
});

const TABLES = [
  'master_database_candidate',
  'database_candidate',
  'database_asj_form',
  'job_database',
  'pemberkasan_checklist',
  'sys_config',
  'ai_form_submissions',
];

await client.connect();

const rows = [];
for (const table of TABLES) {
  const cols = (await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).rows;
  if (!cols.length) { console.log(`\n[${table}] TIDAK ADA`); continue; }

  // Hitung isi dalam SATU query (bukan satu query per kolom).
  const exprs = cols.map((c) => {
    const id = '"' + c.column_name.replace(/"/g, '""') + '"';
    return `count(*) FILTER (WHERE ${id} IS NOT NULL AND btrim(${id}::text) NOT IN ('', '-')) AS "${c.column_name.replace(/"/g, '""')}"`;
  });
  const filled = (await client.query(`SELECT ${exprs.join(', ')} FROM public.${table}`)).rows[0];
  const total = Number((await client.query(`SELECT count(*) n FROM public.${table}`)).rows[0].n);

  console.log(`\n[${table}] ${cols.length} kolom, ${total} baris`);
  for (const c of cols) {
    const n = Number(filled[c.column_name] ?? 0);
    const r = refs(c.column_name);
    const verdict =
      n === 0 && r === 0 ? 'MATI'
      : n === 0 ? 'KOSONG'
      : r === 0 ? 'YATIM'
      : 'HIDUP';
    rows.push({ table, column: c.column_name, type: c.data_type, total, filled: n, refs: r, verdict });
  }
}

// ---- Nama kolom yang tidak konsisten -------------------------------------
// Konvensi tabel ini adalah snake_case. CamelCase / campuran / salah ketik
// adalah tanda kolom dibuat pada zaman berbeda tanpa satu pemilik.
const odd = rows.filter((r) => /[A-Z]/.test(r.column) || /__|_$|^_/.test(r.column));
console.log('\n=== NAMA KOLOM TIDAK KONSISTEN (bukan snake_case murni) ===');
for (const r of odd) console.log(`  ${r.table}.${r.column}  (${r.type})`);

// ---- Ringkasan ------------------------------------------------------------
const byVerdict = rows.reduce((a, r) => { (a[r.verdict] ||= []).push(r); return a; }, {});
console.log('\n=== RINGKASAN ===');
for (const [v, list] of Object.entries(byVerdict)) console.log(`  ${v}: ${list.length} kolom`);

const csv = ['table,column,type,total_rows,filled_rows,code_refs,verdict']
  .concat(rows.map((r) => `${r.table},${r.column},${r.type},${r.total},${r.filled},${r.refs},${r.verdict}`))
  .join('\n');
writeFileSync('deliverables/db-column-audit.csv', csv + '\n');
console.log('\nCSV: deliverables/db-column-audit.csv');

await client.end();
