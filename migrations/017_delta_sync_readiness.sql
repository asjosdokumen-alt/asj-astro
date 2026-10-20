-- =============================================================================
-- 2026-10-20 — Kesiapan delta-sync (Neon; migrasi ke-17)
-- -----------------------------------------------------------------------------
-- LATAR BELAKANG TERUKUR (bukan perkiraan):
--   Sengaja "ambil yang berubah saja" butuh dua hal: (a) kolom waktu yang
--   BENAR-BENAR diperbarui saat baris diubah, (b) index yang melayaninya.
--   Diukur langsung atas DB live 2026-10-20:
--     * master_database_candidate  → ADA updated_at, TIDAK ADA index-nya.
--       Query delta `WHERE updated_at > ?` karena itu seq scan (masih murah
--       di 234 baris, tapi ini janji arsitektur, bukan angka hari ini).
--     * database_asj_form          → ADA updated_at, TIDAK ADA index-nya.
--     * job_database               → TIDAK ADA kolom waktu SAMA SEKALI.
--       17 kolom: code_job … dokumen_share. Akibatnya urutan job dihitung di
--       JS dari angka pada kode (tercatat 2026-10-09: `order=code_job.desc`
--       adalah urutan STRING — 'TG99ASJ' > 'TG100ASJ'). Delta-sync job
--       MUSTAHIL sebelum kolom ini ada.
--     * database_candidate         → updated_at + index `idx_cand_updated_at`
--       SUDAH ada (migrasi 001). Tidak disentuh.
--
-- APA YANG DILAKUKAN:
--   1. job_database.updated_at (default now()) + trigger BEFORE UPDATE.
--   2. Tiga index updated_at yang hilang (job, master, form).
--
-- CATATAN PENTING UNTUK DELTA PERTAMA:
--   Semua 159 job akan terlihat "baru" pada delta pertama (kolom baru =
--   satu nilai untuk semua baris lama). Itu memang maksudnya: tarikan pertama
--   tetap penuh, yang hilang adalah PENGULANGAN. Jangan kaget.
--
-- KEAMANAN & IDEMPOTENSI:
--   * Semua statement idempoten (IF NOT EXISTS / CREATE OR REPLACE).
--   * Index memakai CREATE INDEX biasa, BUKAN CONCURRENTLY: runner menjalankan
--     tiap migrasi dalam SATU transaksi, dan CREATE INDEX CONCURRENTLY tidak
--     boleh berada di dalam transaction block. Tabelnya 234/51/159 baris —
--     pembuatan index di sini diukur milidetik, dan DROP INDEX hanya
--     mengunci sekejap (catatan migrasi 002).
--   * Tidak ada perubahan kontrak tulis/read: tidak satu pun call site
--     menulis atau membaca `updated_at` dari job_database hari ini. Trigger
--     menjaga kolomnya; kode aplikasi tidak perlu tahu.
-- =============================================================================

-- 1) job_database: kolom waktu yang hilang ----------------------------------
--    ADD COLUMN dengan DEFAULT pada PG 11+ tidak me-rewrite tabel (metadata
--    only); 159 baris membuatnya trivial memang.
ALTER TABLE job_database
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2) Fungsi + trigger: setiap UPDATE menyegarkan updated_at ------------------
--    Ditulis ulang di sini (bukan mengandalkan `update_modified_column` yang
--    sudah ada di DB tapi TIDAK terpasang di tabel mana pun) supaya migrasi
--    ini mandiri dan terbaca sebagai satu kesatuan.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_set_updated_at ON job_database;
CREATE TRIGGER trg_job_set_updated_at
  BEFORE UPDATE ON job_database
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 3) Index delta yang hilang -------------------------------------------------
--    Bentuk (updated_at) biasa, bukan DESC: query delta memfilternya
--    (`updated_at > ?`) dan urutannya naik — satu index melayani keduanya.
--    database_candidate sudah punya `idx_cand_updated_at` (DESC) dari
--    migrasi 001; DESC juga melayani filter, jadi tidak diduplikasi.
CREATE INDEX IF NOT EXISTS idx_job_updated_at
  ON job_database (updated_at);

CREATE INDEX IF NOT EXISTS idx_master_updated_at
  ON master_database_candidate (updated_at);

CREATE INDEX IF NOT EXISTS idx_form_updated_at
  ON database_asj_form (updated_at);
