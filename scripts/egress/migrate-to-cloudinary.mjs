/**
 * migrate-to-cloudinary.mjs — pindahkan objek Supabase Storage ke Cloudinary.
 *
 * KENAPA
 * ------
 * Objek publik di bucket `asj-files` dilayani `Cache-Control: no-cache`, jadi
 * setiap kali admin/kandidat MELIHAT sebuah berkas, byte-nya keluar dari kuota
 * egress Supabase lagi. Cloudinary mengirim `immutable, max-age=2592000` untuk
 * aset yang sama (diukur 2026-10-19), jadi tampilan kedua dan seterusnya gratis.
 *
 * Ini pekerjaan DATA, bukan kode: `resolveFileUrl()` sudah mendahulukan URL
 * https apa pun, dan allow-list Cloudinary sudah ada. Tidak ada perubahan
 * kontrak yang dibutuhkan — asal kolomnya berisi URL Cloudinary yang sah.
 *
 * CARA PAKAI
 * ----------
 *   node scripts/egress/migrate-to-cloudinary.mjs                    # dry-run (default)
 *   node scripts/egress/migrate-to-cloudinary.mjs --scope jobs
 *   node scripts/egress/migrate-to-cloudinary.mjs --apply --scope jobs --limit 1
 *
 * Dry-run TIDAK menulis apa pun: ia hanya menghitung sel, objek unik, dan byte.
 *
 * ⚠ DUA HAL YANG HARUS DISADARI SEBELUM `--apply`
 *   1. PII. `master_database_candidate`/`database_candidate` berisi KTP, KK,
 *      ijazah, CV, dan pas foto kandidat. Memindahkannya ke CDN pihak ketiga
 *      adalah keputusan pemilik, bukan keputusan teknis. Hari ini objek itu
 *      SUDAH publik di Supabase (URL tak-terka), jadi yang berubah adalah
 *      pemrosesnya — tapi tetap keputusan yang harus disebut.
 *   2. KUALITAS GAMBAR. Cloudinary dapat menerapkan format/kualitas otomatis
 *      pada pengiriman. Untuk pamflet berisi teks kecil, itu bisa terlihat.
 *      Jalankan `--limit 1`, buka hasilnya, bandingkan, baru lanjutkan.
 *
 * Setiap perubahan dicatat ke `deliverables/egress/migration-log-<tanggal>.json`
 * (kolom, kunci baris, path lama, URL baru, byte) — itu jalan pulangnya.
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { basename, extname } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const APPLY = flag('apply');
const SCOPE = opt('scope', 'all');
const LIMIT = Number(opt('limit', '0')) || 0;
/** `--only <substring>` — jalankan pada satu objek tertentu (untuk uji rasa). */
const ONLY = opt('only', '');

const env = readFileSync('F:/astro/.env', 'utf8');
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const SUPABASE = pick('SUPABASE_URL');
const KEY = pick('SUPABASE_SERVICE_ROLE_KEY');
const BUCKET = pick('SUPABASE_STORAGE_BUCKET') || 'asj-files';
const CLOUD = pick('PUBLIC_CLOUDINARY_CLOUD_NAME') || 'ybzzbw9i';
const PRESET = pick('PUBLIC_CLOUDINARY_UPLOAD_PRESET') || 'asjportal';
const STORAGE_MARK = `/storage/v1/object/public/${BUCKET}/`;

if (!SUPABASE || !KEY) { console.error('SUPABASE_URL / SERVICE_ROLE_KEY tidak ada di .env'); process.exit(1); }

/** Tabel + kolom yang menyimpan URL Storage. PK dipakai untuk PATCH satu baris. */
const TARGETS = [
  { table: 'job_database', pk: 'code_job', scope: 'jobs', cols: ['link_pamflet', 'format_cv'] },
  { table: 'database_candidate', pk: 'id', scope: 'candidates', cols: ['pas_photo', 'file_cv', 'jft', 'ssw'] },
  { table: 'master_database_candidate', pk: 'id', scope: 'candidates', cols: ['pas_photo', 'file_cv', 'jft_url', 'ssw_url', 'ktp_url', 'kk_url', 'ijazah_sd_url', 'ijazah_smp_url', 'ijazah_sma_url'] },
  { table: 'pemberkasan_checklist', pk: 'id', scope: 'candidates', cols: ['ktp_url', 'kk_url', 'pasport_url', 'sma_url', 'kontrak_url'] },
];

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

async function getRows(t) {
  const r = await fetch(`${SUPABASE}/rest/v1/${t}?select=*`, { headers: H });
  if (!r.ok) throw new Error(`${t} select → HTTP ${r.status}`);
  return r.json();
}

function pathOf(url) {
  const i = url.indexOf(STORAGE_MARK);
  return i < 0 ? null : url.slice(i + STORAGE_MARK.length);
}

async function download(path) {
  const r = await fetch(`${SUPABASE}/storage/v1/object/${BUCKET}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`download ${path} → HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function upload(bytes, path) {
  const ext = extname(path).toLowerCase();
  const kind = IMAGE_EXT.has(ext) ? 'image' : 'raw';
  const form = new FormData();
  form.append('file', new Blob([bytes]), basename(path));
  form.append('upload_preset', PRESET);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${kind}/upload`, { method: 'POST', body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.secure_url) throw new Error(`upload ${path} → HTTP ${r.status} ${JSON.stringify(j.error || j).slice(0, 160)}`);
  return j.secure_url;
}

async function patch(t, pk, id, col, value) {
  const r = await fetch(`${SUPABASE}/rest/v1/${t}?${pk}=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ [col]: value }),
  });
  if (!r.ok) throw new Error(`patch ${t}.${col} → HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  return Array.isArray(j) ? j.length : 0;
}

// ── Fase 1: inventaris ───────────────────────────────────────────────────────
const cells = [];
for (const t of TARGETS) {
  if (SCOPE !== 'all' && t.scope !== SCOPE) continue;
  const rows = await getRows(t.table);
  for (const row of rows) {
    for (const col of t.cols) {
      const v = row[col];
      if (typeof v !== 'string' || !v.includes(STORAGE_MARK)) continue;
      cells.push({ table: t.table, pk: t.pk, id: row[t.pk], col, url: v, path: pathOf(v) });
    }
  }
}

const byPath = new Map();
for (const c of cells) {
  if (!c.path) continue;
  if (ONLY && !c.path.includes(ONLY)) continue;
  if (!byPath.has(c.path)) byPath.set(c.path, []);
  byPath.get(c.path).push(c);
}

console.log(`mode      : ${APPLY ? 'APPLY (menulis ke produksi)' : 'DRY-RUN (tidak menulis apa pun)'}`);
console.log(`scope     : ${SCOPE}${LIMIT ? ` · limit ${LIMIT} objek` : ''}`);
const inScope = [...byPath.values()].flat();
console.log(`sel       : ${inScope.length} di ${new Set(inScope.map((c) => c.table)).size} tabel`);
console.log(`objek unik: ${byPath.size}`);

let totalBytes = 0;
const sizes = [];
for (const [p] of byPath) {
  try {
    const r = await fetch(`${SUPABASE}/storage/v1/object/${BUCKET}/${p}`, { method: 'HEAD', headers: H });
    const n = Number(r.headers.get('content-length') || 0);
    totalBytes += n;
    sizes.push({ p, n });
  } catch { /* biarkan 0 */ }
}
console.log(`ukuran    : ${(totalBytes / 1024 / 1024).toFixed(1)} MB total, rata-rata ${(totalBytes / Math.max(1, byPath.size) / 1024).toFixed(0)} KB`);
console.log('\n10 objek terbesar (path saja, tanpa isi):');
for (const s of sizes.sort((a, b) => b.n - a.n).slice(0, 10)) {
  console.log(`  ${(s.n / 1024).toFixed(0).padStart(7)} KB  ${s.p.slice(0, 84)}`);
}

if (!APPLY) {
  console.log('\nTidak ada yang diubah. Tambahkan --apply untuk menjalankannya.');
  process.exit(0);
}

// ── Fase 2: migrasi ──────────────────────────────────────────────────────────
const stamp = new Date().toISOString().slice(0, 10);
mkdirSync('deliverables/egress', { recursive: true });
const logFile = `deliverables/egress/migration-log-${stamp}.json`;
// Berkas log = NDJSON murni: satu baris = satu perubahan. Tidak ada header.

const done = new Map(); // path → url Cloudinary
let changed = 0;
let failed = 0;
let budget = LIMIT || Number.MAX_SAFE_INTEGER;

for (const [p, list] of byPath) {
  if (budget <= 0) break;
  budget--;
  try {
    const bytes = await download(p);
    const url = await upload(bytes, p);
    done.set(p, url);
    for (const c of list) {
      const n = await patch(c.table, c.pk, c.id, c.col, url);
      changed += n;
      appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), table: c.table, pk: c.pk, id: c.id, col: c.col, path: p, url, bytes: bytes.length })}\n`);
    }
    console.log(`ok  ${(bytes.length / 1024).toFixed(0).padStart(7)} KB  ${p.slice(0, 70)} → ${list.length} sel`);
  } catch (e) {
    failed++;
    console.log(`ERR ${p.slice(0, 70)} :: ${String(e.message).slice(0, 140)}`);
  }
}

console.log(`\nsel diubah: ${changed} · gagal: ${failed} · log: ${logFile}`);
