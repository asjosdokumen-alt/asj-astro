-- 033_rls_backup_tables.sql
--
-- KENAPA
--   `verify:rls` (2026-11-03) menemukan dua tabel backup dengan RLS MATI:
--     public._backup_alamat_20261029      (salinan alamat_lengkap + alamat_jp)
--     public._backup_hubungan_20261029
--   Keduanya dibuat manual (di luar sistem migrasi) sebagai jaring aman sebelum
--   operasi data, lalu ditinggalkan. Isinya data pribadi: alamat KTP dan
--   hubungan keluarga. Tanpa RLS, kunci anon bisa membacanya — gate menandai
--   "the public anon key can still reach data it should not".
--
--   Postur tabel lain di repo ini: RLS aktif TANPA policy, sehingga hanya
--   service role (BYPASSRLS) yang bisa membacanya. Itu yang dipasang di sini.
--
--   Dibungkus `IF EXISTS`: kedua tabel TIDAK dikelola migrasi, jadi di
--   lingkungan yang dibangun dari nol tabelnya memang tidak ada dan migrasi ini
--   harus tetap lolos.

DO $$
BEGIN
  IF to_regclass('public._backup_alamat_20261029') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public._backup_alamat_20261029 ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public._backup_hubungan_20261029') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public._backup_hubungan_20261029 ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
