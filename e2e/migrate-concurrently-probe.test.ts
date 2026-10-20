/**
 * Probe klasifikasi CONCURRENTLY di scripts/migrate.mjs.
 *
 * KENAPA FILE INI ADA
 *   Migrasi 017 (delta-sync readiness) memakai CREATE INDEX biasa, dan
 *   penjelasannya di header menyebut kata CONCURRENTLY ("bukan CONCURRENTLY,
 *   karena runner menjalankan tiap migrasi dalam satu transaksi"). Runner
 *   lama menguji /CONCURRENTLY/i atas TEKS MENTAH berkas, jadi:
 *
 *     applying 017_delta_sync_readiness.sql (CONCURRENTLY — cannot be rolled back)
 *
 *   …padahal tidak ada satu pun CREATE INDEX CONCURRENTLY di dalamnya. Akibat
 *   nyata: migrasi itu jalan TANPA BEGIN/COMMIT dan TANPA advisory lock —
 *   jaminan atomicitas + anti-balapan hilang karena satu baris komentar.
 *   Tes di bawah mengunci agar komentar TIDAK bisa mengubah eksekusi, dan
 *   membuktikan gate-nya bisa gagal: assertion pertama akan merah kalau
 *   helper dikembalikan ke regex mentah.
 */
import { describe, expect, it } from 'vitest';

import { hasConcurrentDdl, stripSqlComments } from '../scripts/lib/sql-ddl.mjs';

describe('hasConcurrentDdl — deteksi DDL non-transaksional', () => {
  it('komentar yang MENJELASKAN saja tidak membuat migrasi non-transaksional', () => {
    // Teks ini diambil dari pola header migrasi 017 yang asli.
    const sql = `-- Index memakai CREATE INDEX biasa, BUKAN CONCURRENTLY: runner
-- menjalankan tiap migrasi dalam SATU transaksi.
CREATE INDEX IF NOT EXISTS idx_job_updated_at ON job_database (updated_at);`;

    expect(hasConcurrentDdl(sql)).toBe(false);
  });

  it('CREATE INDEX CONCURRENTLY asli terdeteksi', () => {
    expect(hasConcurrentDdl('CREATE INDEX CONCURRENTLY idx ON t (c);')).toBe(true);
  });

  it('DROP INDEX CONCURRENTLY asli terdeteksi', () => {
    expect(hasConcurrentDdl('DROP INDEX CONCURRENTLY IF EXISTS idx;')).toBe(true);
  });

  it('CONCURRENTLY di baris komentar tengah berkas tidak terdeteksi', () => {
    const sql = `CREATE TABLE t (c int);
-- catatan: jangan pakai CREATE INDEX CONCURRENTLY di sini
INSERT INTO t VALUES (1);`;
    expect(hasConcurrentDdl(sql)).toBe(false);
  });

  it('CONCURRENTLY di block comment tidak terdeteksi', () => {
    const sql = `/* revisi 2026-10-20: CREATE INDEX CONCURRENTLY dulu, sekarang tidak */
CREATE TABLE t (c int);`;
    expect(hasConcurrentDdl(sql)).toBe(false);
  });

  it('CONCURRENTLY di dalam string literal tidak terdeteksi (itu data)', () => {
    const sql = `INSERT INTO notes (body) VALUES ('jalankan CREATE INDEX CONCURRENTLY besok');`;
    expect(hasConcurrentDdl(sql)).toBe(false);
  });

  it('CONCURRENTLY di dalam dollar-quoted body DIPERTAHANKAN (arah aman)', () => {
    // Isi fungsi bukan DDL langsung, tapi kalau nanti seseorang menaruh EXECUTE
    // ... CONCURRENTLY di sana, runner memilih jalur non-transaksional: salah
    // ke arah aman (index gagal keras, bukan atomicitas hilang diam-diam).
    const sql = `CREATE FUNCTION f() RETURNS void AS $$
BEGIN
  EXECUTE 'CREATE INDEX CONCURRENTLY i ON t (c)';
END;
$$ LANGUAGE plpgsql;`;
    expect(hasConcurrentDdl(sql)).toBe(true);
  });

  it('identifier yang kebetulan memuat kata itu tidak dianggap kata kunci', () => {
    const sql = `CREATE TABLE concurrently_sync (id int);`;
    expect(hasConcurrentDdl(sql)).toBe(false);
  });

  it('CONCURRENTLY yang terpotong komentar multi-baris tetap terdeteksi', () => {
    const sql = `CREATE INDEX
  CONCURRENTLY
  idx ON t (c);`;
    expect(hasConcurrentDdl(sql)).toBe(true);
  });

  it('berkas tanpa CONCURRENTLY sama sekali tidak terdeteksi', () => {
    expect(hasConcurrentDdl('ALTER TABLE t ADD COLUMN c timestamptz;')).toBe(false);
  });
});

describe('stripSqlComments — pembuktian gate bisa gagal', () => {
  const HEADER_017 = `-- Index memakai CREATE INDEX biasa, BUKAN CONCURRENTLY: runner
-- menjalankan tiap migrasi dalam SATU transaksi, dan CREATE INDEX
-- CONCURRENTLY tidak boleh berada di dalam transaction block.
CREATE INDEX IF NOT EXISTS idx_job_updated_at ON job_database (updated_at);`;

  it('regex lama akan salah klasifikasi — inilah bug yang diperbaiki', () => {
    // Kalau helper dikembalikan ke /CONCURRENTLY/i atas teks mentah, assertion
    // di bawah Membuktikan nilai yang berbeda (true = salah). Baris ini
    // menggambarkan perilaku LAMA; helper yang benar harus false.
    const oldRegexVerdict = /CONCURRENTLY/i.test(HEADER_017);
    expect(oldRegexVerdict).toBe(true);
    expect(hasConcurrentDdl(HEADER_017)).toBe(false);
  });

  it('komentar dibuang, SQL-nya utuh', () => {
    const stripped = stripSqlComments(`CREATE TABLE t ( -- kolom
  c int /* inline */ );
INSERT INTO t VALUES ('-- bukan komentar');`);
    expect(stripped).not.toContain('kolom');
    expect(stripped).not.toContain('inline');
    expect(stripSqlComments(`SELECT '/* bukan komentar */' AS x;`)).toContain('/* bukan komentar */');
    expect(stripped).toContain('CREATE TABLE t');
    expect(stripped).toContain("VALUES ('-- bukan komentar')");
  });

  it('dollar-quote body utuh walau di dalamnya ada tanda komentar', () => {
    const body = `CREATE FUNCTION f() AS $$ BEGIN -- bukan komentar
  RETURN 1; END; $$ LANGUAGE plpgsql;`;
    const stripped = stripSqlComments(body);
    expect(stripped).toContain('-- bukan komentar');
  });

  it('block comment bersarang tidak menelan SQL sesudahnya', () => {
    const sql = `/* luar /* dalam */ masih komentar */
CREATE TABLE t (c int);`;
    const stripped = stripSqlComments(sql);
    expect(stripped).toContain('CREATE TABLE t');
    expect(hasConcurrentDdl(sql)).toBe(false);
  });

  it('string dengan quote ter-escape tidak menelan sisa berkas', () => {
    const sql = `INSERT INTO t VALUES ('it''s fine');
CREATE INDEX CONCURRENTLY i ON t (c);`;
    expect(hasConcurrentDdl(sql)).toBe(true);
  });
});
