#!/usr/bin/env node
/**
 * migrate-storage-cloudinary.mjs — pindahkan objek Supabase Storage ke Cloudinary.
 *
 * KENAPA
 *   Pemilik 2026-11-03: *"db semua neon kalau bisa bersih dari superbase saja.
 *   sedangkan file upload yg sudah di bucket superbase bisa kah di migrasi …
 *   biar hilang semua superbase"*. DB sudah Neon; yang tersisa hanya Storage.
 *
 * URUTAN YANG AMAN (dan kenapa urutannya begini)
 *   1. `--dry-run`  (DEFAULT) hitung rencana: berapa berkas, mana yang terlalu
 *                   besar, mana yang objeknya sudah hilang. Tidak menulis apa pun.
 *   2. `--apply`    unggah ke Cloudinary dan catat pemetaan lama→baru ke
 *                   `storage-migration-map.json`. DB BELUM disentuh.
 *   3. `--rewrite-db`  tulis ulang URL di DB memakai peta itu, dalam SATU
 *                   transaksi. Dijalankan hanya setelah (2) selesai.
 *   4. Pemilik memverifikasi situs, BARU bucket Supabase dihapus — langkah itu
 *                   TIDAK dilakukan skrip ini, dan memang tidak boleh otomatis.
 *
 * BATASAN TERUKUR (2026-11-03)
 *   • Paket Cloudinary = Free. Batas 10 MB/berkas (10 485 760 B). Terukur: 3
 *     berkas 11,6 MB DITOLAK ("File size too large"), jadi skrip menandainya
 *     GAGAL dan melaporkannya — bukan diam-diam dilewati.
 *   • `CLOUDINARY_URL` di mesin ini TIDAK memuat API secret, jadi hanya unggah
 *     unsigned yang mungkin. Konsekuensinya: berkas uji TIDAK bisa dihapus lewat
 *     Admin API dari sini. Karena itu skrip tidak pernah mengunggah ulang berkas
 *     yang sudah ada di peta (idempoten), dan `--apply` bisa diulang.
 *   • Preset `asjportal` memaksa folder `DOKUMENASJ`.
 *
 * PUBLIC_ID
 *   Path lama dibersihkan jadi `[a-z0-9_-]` per segmen. Ini BUKAN kosmetik:
 *   nama berkas ber-spasi menghasilkan URL `%20` yang dijawab Supabase dengan
 *   HTTP 400 — terukur 5 dari 17 URL dokumen di `pemberkasan_checklist` mati
 *   karena itu. Cloudinary menerima spasi, tapi kita tetap membersihkannya
 *   supaya kelas bug yang sama tidak kembali.
 *
 * PEMAKAIAN
 *   node scripts/migrate-storage-cloudinary.mjs                # rencana saja
 *   node scripts/migrate-storage-cloudinary.mjs --apply
 *   node scripts/migrate-storage-cloudinary.mjs --apply --limit 20
 *   node scripts/migrate-storage-cloudinary.mjs --rewrite-db --confirm-rewrite
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Client } from 'pg';

const B = process.env.STORAGE_SUPABASE_URL;
const K = process.env.STORAGE_SUPABASE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'asj-files';
const CLOUD = process.env.PUBLIC_CLOUDINARY_CLOUD_NAME || 'ybzzbw9i';
const PRESET = process.env.PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'asjportal';
const MAP_FILE = 'storage-migration-map.json';

const MAX_BYTES = 10 * 1024 * 1024; // Free plan, terukur
const TOP = ['assets/', 'cv-templates/', 'jobs/', 'master/', 'siswa_baru/'];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APPLY = has('--apply');
const REWRITE = has('--rewrite-db');
const LIMIT = Number(val('--limit') || 0);

if (!B || !K) {
  console.error('STORAGE_SUPABASE_URL / STORAGE_SUPABASE_KEY kosong — jalankan dengan env dimuat.');
  process.exit(1);
}

/** Path → public_id yang aman dan stabil. */
function publicId(rel) {
  return rel
    .split('/')
    .map((seg) =>
      seg
        .replace(/\.[^.]*$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || '_',
    )
    .join('/');
}

async function list(prefix) {
  const r = await fetch(`${B}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!r.ok) throw new Error(`list ${prefix} → ${r.status}`);
  return r.json();
}

async function walk(prefix, depth, out) {
  if (depth > 4) return;
  for (const it of await list(prefix)) {
    if (it.metadata?.mimetype) {
      out.push({ rel: prefix + it.name, size: Number(it.metadata.size || 0), mime: it.metadata.mimetype });
    } else {
      await walk(`${prefix}${it.name}/`, depth + 1, out);
    }
  }
}

async function main() {
  if (REWRITE) return rewriteDb();

  const files = [];
  for (const t of TOP) await walk(t, 0, files);

  const tooBig = files.filter((f) => f.size > MAX_BYTES);
  const ok = files.filter((f) => f.size <= MAX_BYTES);
  const totalMb = files.reduce((s, f) => s + f.size, 0) / 1048576;

  console.log(`berkas: ${files.length} · ${totalMb.toFixed(1)} MB`);
  console.log(`  dapat dimigrasi : ${ok.length}`);
  console.log(`  TERLALU BESAR   : ${tooBig.length} (>10 MB, batas Free plan)`);
  for (const f of tooBig) console.log(`     ${(f.size / 1048576).toFixed(1)} MB  ${f.rel}`);

  if (!APPLY) {
    console.log('\n(dry-run) tidak ada yang diunggah. Tambahkan --apply untuk menjalankan.');
    return;
  }

  const map = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {};
  const todo = (LIMIT ? ok.slice(0, LIMIT) : ok).filter((f) => !map[f.rel]);
  console.log(`\nakan diunggah: ${todo.length} (sudah ada di peta: ${Object.keys(map).length})`);

  let done = 0;
  const gagal = [];
  for (const f of todo) {
    const src = `${B}/storage/v1/object/public/${BUCKET}/${f.rel.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const r = await fetch(src);
      if (!r.ok) throw new Error(`unduh ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const fd = new FormData();
      fd.append('upload_preset', PRESET);
      fd.append('public_id', publicId(f.rel));
      fd.append(
        'file',
        new Blob([buf], { type: f.mime || 'application/octet-stream' }),
        f.rel.split('/').pop(),
      );
      const up = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`, {
        method: 'POST',
        body: fd,
      });
      const j = await up.json().catch(() => ({}));
      if (!up.ok || !j.secure_url) throw new Error(`unggah ${up.status} ${j?.error?.message || ''}`);
      map[f.rel] = { url: j.secure_url, public_id: j.public_id, bytes: buf.length, mime: f.mime };
      done++;
      if (done % 25 === 0) {
        writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
        console.log(`  ${done}/${todo.length} …`);
      }
    } catch (e) {
      gagal.push({ rel: f.rel, err: String(e.message || e) });
    }
  }
  writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
  console.log(`\nselesai: ${done} terunggah, ${gagal.length} gagal, peta: ${MAP_FILE}`);
  for (const g of gagal) console.log(`  GAGAL ${g.rel} — ${g.err}`);
  console.log('\nDB BELUM disentuh. Jalankan --rewrite-db --confirm-rewrite setelah memeriksa peta.');
}

/**
 * Tulis ulang URL di DB memakai peta.
 *
 * Satu transaksi, dan setiap kolom hanya disentuh kalau memang memuat URL lama:
 * `UPDATE … WHERE col LIKE '%supabase.co/storage%'`. `ai_data_json` ikut, karena
 * 11 baris menyimpan URL dokumen di dalam JSON.
 */
async function rewriteDb() {
  if (!has('--confirm-rewrite')) {
    console.error('Tambahkan --confirm-rewrite: langkah ini mengubah data produksi.');
    process.exit(1);
  }
  if (!existsSync(MAP_FILE)) {
    console.error(`Peta tidak ada: ${MAP_FILE}. Jalankan --apply dulu.`);
    process.exit(1);
  }
  const map = JSON.parse(readFileSync(MAP_FILE, 'utf8'));
  const pairs = Object.entries(map).map(([rel, v]) => ({
    lama: `${B}/storage/v1/object/public/${BUCKET}/${rel.split('/').map(encodeURIComponent).join('/')}`,
    baru: v.url,
  }));
  console.log(`pasangan URL: ${pairs.length}`);

  const c = new Client({ connectionString: process.env.Direct_Connection_DB, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const cols = (
    await c.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND data_type IN ('text','character varying')`,
    )
  ).rows;

  await c.query('BEGIN');
  let total = 0;
  for (const { table_name, column_name } of cols) {
    for (const p of pairs) {
      try {
        const r = await c.query(
          `UPDATE "${table_name}" SET "${column_name}" = replace("${column_name}", $1, $2)
            WHERE "${column_name}" LIKE '%supabase.co/storage%'`,
          [p.lama, p.baru],
        );
        total += r.rowCount;
      } catch {
        /* kolom bukan teks yang bisa di-update — lewati */
      }
    }
  }
  await c.query('COMMIT');
  console.log(`sel selesai diperbarui: ${total}`);
  const sisa = await c.query(
    `SELECT count(*)::int n FROM "master_database_candidate" WHERE file_cv LIKE '%supabase.co/storage%'`,
  );
  console.log(`sisa URL Supabase di master.file_cv: ${sisa.rows[0].n}`);
  await c.end();
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
