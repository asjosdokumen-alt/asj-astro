#!/usr/bin/env node
/**
 * migrate-storage-cloudinary.mjs — pindahkan dokumen dari Supabase Storage ke
 * Cloudinary DENGAN NAMA BERKAS YANG JELAS, lalu tulis ulang URL di DB.
 *
 * Permintaan pemilik 2026-11-03: *"rapikan penamaan file nya sehingga jelas.
 * contoh agus khoci_ktp, agus khoci_kk dst, agus khoci cvtg600asj … jadi ketika
 * upload file yg sama bisa menimpa file yg lama"* + *"silahkan gapapa kamu yg
 * unggah"*.
 *
 * NAMA
 *   `master/<NAMA KANDIDAT>/<berkas apa pun>` → `<nama_kandidat>_<jenis>`.
 *   Jenis diambil dari KOLOM DB yang merujuk berkas itu (`ktp_url` → `ktp`),
 *   bukan dari nama berkas lama — nama lama justru yang berantakan
 *   (`PHOTOFILE_1786149859846.jpg`, `1. ALFIAN ARTIN SAPUTRA _CV.xlsx`).
 *   Kode lowongan (`TG609ASJ`) diambil dari nama berkas lama bila ada, jadi CV
 *   menjadi `<nama>_cv<kode>` seperti contoh pemilik.
 *
 *   Hanya objek yang DIRUJUK DB yang dimigrasi. Terukur: 756 berkas di bucket,
 *   355 dirujuk, 401 yatim (versi lama yang sudah tidak dipakai) — yatim tidak
 *   ikut, karena memindahkannya hanya memindahkan sampah.
 *
 * ⚠️ SOAL "MENIMPA" — BATASAN YANG TIDAK BISA DILEWATI DARI SINI
 *   Unggahan di sini UNSIGNED (preset `asjportal`), dan Cloudinary MENOLAK
 *   parameter `overwrite` untuk unggahan unsigned:
 *     "Overwrite parameter is not allowed when using unsigned upload."
 *   Terukur 2026-11-03. Artinya: mengunggah ulang dengan public_id yang sama
 *   TIDAK mengganti isi — Cloudinary mengembalikan aset LAMA (terukur: unggahan
 *   kedua 28 694 B dijawab 200 dengan 7 217 B milik aset pertama).
 *   Supaya "unggah file sama menimpa yang lama" benar-benar berlaku, satu dari
 *   dua ini harus dilakukan pemilik di dashboard Cloudinary:
 *     (a) Settings → Upload → preset `asjportal` → aktifkan **Overwrite**; atau
 *     (b) isi API secret, lalu aplikasi memakai unggahan bertanda tangan.
 *   Sampai itu dilakukan, nama tetap rapi dan deterministik, tetapi penimpaan
 *   TIDAK terjadi. Skrip ini tidak berpura-pura sebaliknya.
 *
 * KOMPRESI
 *   Batas Free plan = 10 MB/berkas (terukur). Berkas yang melebihi itu dipadatkan
 *   lebih dulu: gambar di dalam xlsx diturunkan resolusinya (bukan diubah
 *   formatnya, jadi struktur OOXML tidak disentuh). Terukur pada CV 11,6 MB:
 *   satu PNG 3000×4496 sebesar 11,59 MB → 1600 px = 3,56 MB.
 *
 * PEMAKAIAN
 *   node scripts/migrate-storage-cloudinary.mjs                    # rencana
 *   node scripts/migrate-storage-cloudinary.mjs --apply            # unggah
 *   node scripts/migrate-storage-cloudinary.mjs --apply --limit 20
 *   node scripts/migrate-storage-cloudinary.mjs --rewrite-db --confirm-rewrite
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Client } from 'pg';
import JSZip from 'jszip';
import sharp from 'sharp';

const B = process.env.STORAGE_SUPABASE_URL;
const K = process.env.STORAGE_SUPABASE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'asj-files';
const CLOUD = process.env.PUBLIC_CLOUDINARY_CLOUD_NAME || 'ybzzbw9i';
const PRESET = process.env.PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'asjportal';
const PREFIX = `${B}/storage/v1/object/public/${BUCKET}/`;

/* Peta disimpan DI LUAR repo: isinya URL dokumen pribadi kandidat. */
const MAP_FILE =
  process.env.STORAGE_MIGRATION_MAP ||
  'C:/Users/k89/AppData/Local/Temp/asjfix/storage-migration-map.json';

const MAX_BYTES = 10 * 1024 * 1024;
const TARGET_IMG_WIDTH = 1600;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

/** Kolom DB → jenis berkas yang enak dibaca. */
const JENIS = {
  ktp_url: 'ktp',
  kk_url: 'kk',
  akte_url: 'akte',
  sd_url: 'sd',
  smp_url: 'smp',
  sma_url: 'sma',
  univ_url: 'univ',
  ijazah_sd_url: 'sd',
  ijazah_smp_url: 'smp',
  ijazah_sma_url: 'sma',
  pasport_url: 'pasport',
  mcu_url: 'mcu',
  kontrak_url: 'kontrak',
  cert_url: 'cert',
  foto2_url: 'foto2',
  ijinortu_url: 'ijinortu',
  cpmi_url: 'cpmi',
  kawin_url: 'kawin',
  sehat_url: 'sehat',
  bpjs_url: 'bpjs',
  psikotes_url: 'psikotes',
  pas_photo: 'pasphoto',
  jft_url: 'jft',
  jft: 'jft',
  ssw_url: 'ssw',
  ssw: 'ssw',
  file_cv: 'cv',
};

const slug = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const unescapeRel = (u) => decodeURIComponent(u.slice(PREFIX.length));

/**
 * Padatkan xlsx yang melebihi batas.
 * @returns {Promise<{buf: Buffer, dari: number, jadi: number} | null>}
 */
async function padatkanXlsx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const media = Object.keys(zip.files).filter((n) => /^xl\/media\/.*\.(png|jpe?g)$/i.test(n));
  if (!media.length) return null;

  let berubah = false;
  for (const nama of media) {
    const isi = await zip.file(nama).async('nodebuffer');
    if (isi.length < 1.5 * 1024 * 1024) continue;
    const meta = await sharp(isi).metadata();
    if (!meta.width || meta.width <= TARGET_IMG_WIDTH) continue;
    const kecil = await sharp(isi).resize({ width: TARGET_IMG_WIDTH }).png({ compressionLevel: 9 }).toBuffer();
    zip.file(nama, kecil);
    berubah = true;
  }
  if (!berubah) return null;
  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  return out.length < buf.length ? { buf: out, dari: buf.length, jadi: out.length } : null;
}

async function refsDariDb(c) {
  const cols = (
    await c.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND data_type IN ('text','character varying')`,
    )
  ).rows;
  const out = [];
  for (const { table_name, column_name } of cols) {
    let rows;
    try {
      rows = (
        await c.query(
          `SELECT "${column_name}" AS url FROM "${table_name}" WHERE "${column_name}" LIKE '%supabase.co/storage%'`,
        )
      ).rows;
    } catch {
      continue;
    }
    for (const r of rows) {
      /* Satu sel bisa memuat BEBERAPA URL, atau URL yang tersembunyi di dalam
         JSON (`ai_data_json`, `sys_config.config_value`). Mencocokkan seluruh
         nilai sel sebagai satu URL melewatkan keduanya — terukur: template CV
         dan satu foto kandidat tidak ikut termigrasi karena itu. */
      const teks = String(r.url ?? '');
      const ketemu = teks.match(/https?:\/\/[^\s"'\\]+/g) || [];
      for (const u of ketemu) {
        if (u.includes('/storage/v1/object/public/')) out.push({ tabel: table_name, kolom: column_name, url: u });
      }
    }
  }
  return out;
}

/** rel → { nama, jenis } */
function bangunNama(refs) {
  const peta = new Map();
  for (const it of refs) {
    if (!it.url.startsWith(PREFIX)) continue;
    const rel = unescapeRel(it.url);
    const bagian = rel.split('/');
    if (bagian[0] !== 'master') {
      /* Folder lain (cv-templates, assets, siswa_baru) tidak punya nama
         kandidat; namanya diturunkan dari path-nya sendiri. */
      const nama = slug(rel.replace(/\.[a-z0-9]+$/i, ''));
      if (nama && !peta.has(rel)) peta.set(rel, { nama, jenis: bagian[0] });
      continue;
    }
    if (bagian.length < 3) continue;
    const kandidat = slug(bagian[1]);
    const jenis = JENIS[it.kolom] || slug(it.kolom.replace(/_url$/, ''));
    const kode = /(TG\d+ASJ)/i.exec(bagian[bagian.length - 1])?.[1]?.toLowerCase() || '';
    const nama = jenis === 'cv' && kode ? `${kandidat}_cv${kode}` : `${kandidat}_${jenis}`;
    if (!peta.has(rel)) peta.set(rel, { nama, jenis });
  }
  // Tabrakan nama (dua berkas berbeda, kandidat+jenis sama) diberi akhiran angka.
  const dipakai = new Map();
  for (const [, v] of peta) {
    const n = dipakai.get(v.nama) || 0;
    dipakai.set(v.nama, n + 1);
    if (n > 0) v.nama = `${v.nama}_${n + 1}`;
  }
  return peta;
}

async function main() {
  if (!B || !K) {
    console.error('STORAGE_SUPABASE_URL / STORAGE_SUPABASE_KEY kosong.');
    process.exit(1);
  }
  const c = new Client({
    connectionString: process.env.Direct_Connection_DB,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  if (has('--rewrite-db')) {
    await rewriteDb(c);
    await c.end();
    return;
  }

  const refs = await refsDariDb(c);
  const nama = bangunNama(refs);
  console.log(`sel ber-URL Supabase: ${refs.length} · objek unik dirujuk: ${nama.size}`);

  const daftar = [...nama.entries()].map(([rel, v]) => ({ rel, ...v }));
  console.log('\ncontoh nama baru:');
  for (const d of daftar.slice(0, 8)) console.log(`   ${d.rel}\n      -> ${d.nama}`);

  if (!has('--apply')) {
    await c.end();
    console.log('\n(dry-run) tidak ada yang diunggah. Tambahkan --apply.');
    return;
  }

  const map = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {};
  const limit = Number(val('--limit') || 0);
  const todo = (limit ? daftar.slice(0, limit) : daftar).filter((d) => !map[d.rel]);
  console.log(`\nakan diunggah: ${todo.length} (sudah ada: ${Object.keys(map).length})`);

  let n = 0;
  const gagal = [];
  for (const d of todo) {
    const src = PREFIX + d.rel.split('/').map(encodeURIComponent).join('/');
    try {
      const r = await fetch(src);
      if (!r.ok) throw new Error(`unduh ${r.status}`);
      let buf = Buffer.from(await r.arrayBuffer());
      const mime = r.headers.get('content-type') || 'application/octet-stream';

      let dipadatkan = null;
      if (buf.length > MAX_BYTES && /sheet|excel/i.test(mime)) {
        dipadatkan = await padatkanXlsx(buf);
        if (dipadatkan) buf = dipadatkan.buf;
      }
      if (buf.length > MAX_BYTES) {
        throw new Error(`tetap ${(buf.length / 1048576).toFixed(1)} MB setelah dipadatkan`);
      }

      const fd = new FormData();
      fd.append('upload_preset', PRESET);
      fd.append('public_id', d.nama);
      const ekst = (d.rel.split('.').pop() || 'bin').toLowerCase();
      fd.append('file', new Blob([buf], { type: mime }), `${d.nama}.${ekst}`);
      const up = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`, {
        method: 'POST',
        body: fd,
      });
      const j = await up.json().catch(() => ({}));
      if (!up.ok || !j.secure_url) throw new Error(`unggah ${up.status} ${j?.error?.message || ''}`);

      map[d.rel] = {
        url: j.secure_url,
        public_id: j.public_id,
        bytes: buf.length,
        mime,
        dipadatkan_dari: dipadatkan?.dari ?? null,
      };
      n++;
      if (n % 20 === 0) {
        writeFileSync(MAP_FILE, JSON.stringify(map, null, 1));
        console.log(`   ${n}/${todo.length} …`);
      }
    } catch (e) {
      gagal.push({ rel: d.rel, err: String(e.message || e) });
    }
  }
  writeFileSync(MAP_FILE, JSON.stringify(map, null, 1));
  console.log(`\nselesai: ${n} terunggah, ${gagal.length} gagal`);
  for (const g of gagal) console.log(`  GAGAL ${g.rel} — ${g.err}`);
  console.log(`peta: ${MAP_FILE}`);
  console.log('DB belum disentuh. Jalankan --rewrite-db --confirm-rewrite.');
  await c.end();
}

async function rewriteDb(c) {
  if (!has('--confirm-rewrite')) {
    console.error('Tambahkan --confirm-rewrite: langkah ini mengubah data produksi.');
    process.exit(1);
  }
  if (!existsSync(MAP_FILE)) {
    console.error(`Peta tidak ada: ${MAP_FILE}`);
    process.exit(1);
  }
  const map = JSON.parse(readFileSync(MAP_FILE, 'utf8'));

  /**
   * Cocokkan lewat REL, bukan lewat pencocokan string URL.
   *
   * URL lama tersimpan dalam dua bentuk: sebagian ber-`%20`, sebagian ber-spasi
   * asli (tergantung jalur yang membuatnya). `replace()` SQL dengan satu bentuk
   * akan melewatkan bentuk yang lain — dan sel yang terlewat tetap menunjuk
   * Supabase, jadi "bersih dari Supabase" tidak tercapai. Di sini tiap URL di
   * dalam sel diurai, di-decode, dicari rel-nya di peta, lalu diganti.
   */
  const URL_RE = /https?:\/\/[^\s"'\\]+/g;

  const pks = new Map();
  for (const r of (
    await c.query(
      `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'`,
    )
  ).rows) {
    if (!pks.has(r.table_name)) pks.set(r.table_name, []);
    pks.get(r.table_name).push(r.column_name);
  }

  const cols = (
    await c.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND data_type IN ('text','character varchar','character varying')`,
    )
  ).rows;

  await c.query('BEGIN');
  let sel = 0;
  let urlDiganti = 0;
  /* Cadangan SEBELUM menulis: satu berkas JSON berisi (tabel, kunci, kolom, nilai
     lama). 656 sel cukup kecil untuk disimpan utuh, dan tanpa ini kesalahan
     penggantian tidak bisa dibatalkan — `replace` tidak punya undo. */
  const backup = [];
  for (const { table_name, column_name } of cols) {
    const pk = pks.get(table_name);
    if (!pk?.length) continue;
    let rows;
    try {
      rows = (
        await c.query(
          `SELECT ${pk.map((k) => `"${k}"`).join(', ')}, "${column_name}" AS v
             FROM "${table_name}" WHERE "${column_name}" LIKE '%supabase.co/storage%'`,
        )
      ).rows;
    } catch {
      continue;
    }
    for (const row of rows) {
      const teks = String(row.v ?? '');
      let baru = teks;
      for (const u of teks.match(URL_RE) || []) {
        if (!u.startsWith(PREFIX)) continue;
        let rel;
        try {
          rel = decodeURIComponent(u.slice(PREFIX.length));
        } catch {
          continue;
        }
        const hit = map[rel];
        if (hit) {
          baru = baru.split(u).join(hit.url);
          urlDiganti++;
        }
      }
      if (baru !== teks) {
        backup.push({ tabel: table_name, kolom: column_name, kunci: pk.map((k) => row[k]), lama: teks });
        const where = pk.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ');
        await c.query(`UPDATE "${table_name}" SET "${column_name}" = $${pk.length + 1} WHERE ${where}`, [
          ...pk.map((k) => row[k]),
          baru,
        ]);
        sel++;
      }
    }
  }
  await c.query('COMMIT');
  /* DIGABUNG, bukan ditimpa. Jalan pertama pernah menulis 649 sel lalu jalan
     kedua menimpanya dengan 2 sel — cadangan yang justru menghapus dirinya
     sendiri. Sekarang entri lama dipertahankan. */
  const backupFile = `${MAP_FILE.replace(/\.json$/, '')}-backup.json`;
  const lama = existsSync(backupFile) ? JSON.parse(readFileSync(backupFile, 'utf8')) : [];
  writeFileSync(backupFile, JSON.stringify([...lama, ...backup], null, 1));
  console.log(`sel diperbarui: ${sel} · URL diganti: ${urlDiganti}`);
  console.log(`cadangan nilai lama: ${backupFile} (${backup.length} sel)`);

  const sisa = await c.query(
    `SELECT count(*)::int n FROM master_database_candidate WHERE file_cv LIKE '%supabase.co/storage%'`,
  );
  console.log(`sisa URL Supabase di master.file_cv: ${sisa.rows[0].n}`);
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
