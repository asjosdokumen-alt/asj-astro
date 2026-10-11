/**
 * TESTS: setiap kolom biodata yang ditulis `simpanBiodataLengkap` harus ADA di
 * skema — dan kolom itu harus benar-benar dibuat oleh migrasi 016.
 *
 * KENAPA INI TES, BUKAN PEMERIKSAAN RUNTIME
 *   `BIO_LENGKAP_MASTER_COLS` (`contexts/master-data/service.ts`) memetakan nama
 *   kunci payload legacy (ttl_ayah, nama_shacou, …) ke kolom asli tabel. Loop
 *   `buildBioPatch` MELEWATI kunci tanpa pasangan tanpa error, dan handler tetap
 *   membalas `{ success: true }` — jadi field tanpa kolom hilang diam-diam.
 *   Itu persis bug yang migration 016 tutup.
 *
 *   Sebelum 2026-10-11, tujuh field berada di kondisi itu. Yang lebih buruk:
 *   kalau nama kolomnya SALAH (bukan tidak ada pasangan), PostgREST menolak
 *   SELURUH baris (400 PGRST204) — satu typo mematikan semua field, termasuk
 *   yang sehat. Kedua mode kegagalan itu tidak menghasilkan error yang terbaca.
 *
 * TANPA DB, TANPA JARINGAN
 *   Kedua sisi pembanding adalah berkas yang ter-commit:
 *   `schema.generated.ts` (turunan PostgREST, dijaga `verify:schema`) dan file
 *   migrasi. `verify:schema` adalah gate terpisah yang menjaga skema itu sendiri
 *   tetap jujur terhadap database hidup — di sini yang diuji adalah kode vs
 *   kontrak, bukan kontrak vs database.
 *
 * KENAPA DI `e2e/` — DAN INI DUA LANGKAH, BUKAN SATU
 *   Tier counter beku `indexer` menghitung berkas `.ts` di bawah
 *   `netlify/functions`, jadi tes `.ts` yang duduk di sana menggeser angka yang
 *   HANYA boleh di-baseline ulang team-lead (terukur: 292 -> 293 ts, 535 -> 536
 *   berkas). Tier `e2e/` hanya menghitung mjs/cjs/js, jadi `.ts` di sini tidak
 *   terlihat.
 *   Langkah kedua yang mudah terlewat: `vitest.config.ts` menjalankan seluruh
 *   `e2e/` di project FRONTEND (jsdom) kecuali didaftarkan di `exclude`-nya.
 *   Tanpa pendaftaran itu suite ini berjalan di lingkungan yang salah — dan yang
 *   lebih berbahaya, ia bisa LULUS di sana sambil terhitung dua kali. Karena itu
 *   berkas ini terdaftar di `exclude` yang sama.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { TABLE_COLUMNS } from '../netlify/functions/_lib/db/schema.generated';
import { BIO_LENGKAP_MASTER_COLS } from '../netlify/functions/contexts/master-data/service';

const MASTER = 'master_database_candidate';
const masterColumns = TABLE_COLUMNS[MASTER] as readonly string[] | undefined;

/** Kolom yang ditambahkan migration 016 — satu-satunya sumber kebenarannya. */
const MIGRATION_FILE = '016_biodata_keluarga_perusahaan.sql';

const mapping = BIO_LENGKAP_MASTER_COLS as ReadonlyArray<readonly [string, string]>;

describe('BIO_LENGKAP_MASTER_COLS — kunci payload → kolom master', () => {
  it('tabel master ada di skema', () => {
    expect(masterColumns).toBeDefined();
  });

  it('setiap kolom tujuan ADA di master_database_candidate', () => {
    // Kalau ini merah, `simpanBiodataLengkap` akan mengirim PATCH dengan kolom
    // yang tidak ada, PostgREST menjawab 400 PGRST204, dan SELURUH baris
    // biodata gagal tersimpan — bukan hanya field yang salah.
    const unknown = mapping.map(([, to]) => to).filter((c) => !masterColumns?.includes(c));
    expect(unknown, `kolom tak dikenal di ${MASTER}: ${unknown.join(', ')}`).toEqual([]);
  });

  it('tidak ada kolom tujuan yang dipakai dua kali', () => {
    // Dua kunci payload menulis ke kolom yang sama berarti salah satunya
    // menimpa yang lain, tanpa error apa pun.
    const targets = mapping.map(([, to]) => to);
    const dupes = targets.filter((c, i) => targets.indexOf(c) !== i);
    expect(dupes, `kolom tujuan ganda: ${dupes.join(', ')}`).toEqual([]);
  });

  it('tidak ada nama kolom LEGACY yang bocor sebagai kolom tujuan', () => {
    // Kunci payload sengaja memakai nama legacy; kolom tabel memakai format JP.
    // Kalau nama legacy ikut terkirim sebagai kolom, PATCH-nya ditolak PostgREST
    // dan seluruh simpan gagal.
    const legacy = ['nama_ayah', 'nama_ibu', 'ttl_ayah', 'ttl_ibu', 'nama_shacou', 'telp_perusahaan', 'web_perusahaan', 'alamat_perusahaan'];
    const leaked = mapping.map(([, to]) => to).filter((c) => legacy.includes(c));
    expect(leaked, `nama legacy bocor sebagai kolom: ${leaked.join(', ')}`).toEqual([]);
  });
});

describe('migration 016 — kolom yang dipakai kode memang dibuat olehnya', () => {
  // `process.cwd()` (root repo), bukan `__dirname`: suite backend berjalan dari
  // root, dan jalur relatif `__dirname` di sini menunjuk ke luar repo
  // (`F:\migrations\…`). Konvensi yang sama dipakai action-registry.test.ts
  // dan metrics-receiver.test.ts.
  const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8');

  it('tujuh kolom baru dibuat dengan ADD COLUMN IF NOT EXISTS (idempotent)', () => {
    const added = [...sql.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    expect(added).toHaveLength(7);
    expect(new Set(added).size).toBe(7);
  });

  it('setiap kolom yang dipakai kode dari migration 016 benar-benar dibuat', () => {
    // Inilah ikatan migrasi↔kode: kalau seseorang menghapus satu ADD COLUMN
    // dari migrasi, atau mengganti nama kolom di kode, tes ini merah.
    const added = new Set([...sql.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((m) => m[1]));
    const NEW_FIELDS = ['ttl_ayah', 'nama_ibu', 'ttl_ibu', 'nama_shacou', 'telp_perusahaan', 'web_perusahaan', 'alamat_perusahaan'];
    const fromMapping = new Map(mapping);
    const missing = NEW_FIELDS
      .map((f) => fromMapping.get(f))
      .filter((c): c is string => Boolean(c))
      .filter((c) => !added.has(c));
    expect(missing, `dipakai kode tapi tidak dibuat migrasi: ${missing.join(', ')}`).toEqual([]);
  });
});
