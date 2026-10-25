-- =============================================================================
-- 2026-10-25 — Migration 020: backfill identitas dua arah (HANYA ISI KOSONG)
-- -----------------------------------------------------------------------------
-- KENAPA
--   Migrasi 019 membuat kolomnya simetris. Kode-nya (commit f2d5c80) sekarang
--   menyalin identitas di setiap simpan. Tapi 226 baris yang SUDAH ada tetap
--   tidak sinkron, dan pemilik melihatnya sebagai "CV Mini kosong padahal CV AI
--   lengkap". Diukur 2026-10-25 pada pasangan baris yang punya WA sama:
--
--     kolom            master punya, kandidat kosong   kandidat punya, master kosong
--     tb                            42                            42
--     bb                            44                            34
--     usia                          29                             0
--     nik                            7                            39
--     email                          9                             0
--     tempat_lahir                   1                            23
--     alamat_lengkap                 1                             0
--     no_paspor/no_pasport          10                             0
--
-- ATURAN: HANYA MENGISI YANG KOSONG. Tidak pernah menimpa.
--   Nilai yang BERBEDA di dua sisi sengaja DIBIARKAN, karena tidak ada cara
--   otomatis tahu mana yang benar — dan untuk satu kolom buktinya kuat bahwa
--   menimpa akan MERUSAK:
--
--     gender: 85 baris berbeda. `database_candidate` memakai `PRIA`/`WANITA`/`P`,
--             `master_database_candidate` memakai `LAKI-LAKI`/`PEREMPUAN`. Menyalin
--             master → kandidat akan mengubah enum yang dibaca layar, dan
--             menyalin kandidat → master akan mengotori nilai kanonik.
--
--   Jadi backfill ini menambah informasi, tidak pernah menghapus atau mengganti.
--   Kalau pemilik ingin konflik itu diputuskan, itu keputusan DATA (butuh mata
--   manusia), bukan sesuatu yang boleh ditebak migrasi.
--
-- CATATAN: `pendidikan` TIDAK ikut — lihat aturan 3 di
-- `netlify/functions/_lib/db/identity-sync.ts` (baris kandidat menyimpan tiga
-- bentuk sekaligus, termasuk JSON).
-- =============================================================================

-- ── 1. master → kandidat (baris operasional yang dibaca panel & CV Mini) ────
UPDATE public.database_candidate d
   SET tb             = COALESCE(NULLIF(btrim(d.tb), ''), m.tb),
       bb             = COALESCE(NULLIF(btrim(d.bb), ''), m.bb),
       usia           = COALESCE(NULLIF(btrim(d.usia), ''), m.usia),
       gender         = COALESCE(NULLIF(btrim(d.gender), ''), m.gender),
       nik            = COALESCE(NULLIF(btrim(d.nik), ''), m.nik),
       email          = COALESCE(NULLIF(btrim(d.email), ''), m.email),
       tempat_lahir   = COALESCE(NULLIF(btrim(d.tempat_lahir), ''), m.tempat_lahir),
       alamat_lengkap = COALESCE(NULLIF(btrim(d.alamat_lengkap), ''), m.alamat_lengkap),
       no_pasport     = COALESCE(NULLIF(btrim(d.no_pasport), ''), m.no_paspor)
  FROM public.master_database_candidate m
 WHERE d.no_wa = m.no_wa
   AND (   (NULLIF(btrim(d.tb), '') IS NULL             AND NULLIF(btrim(m.tb), '') IS NOT NULL)
        OR (NULLIF(btrim(d.bb), '') IS NULL             AND NULLIF(btrim(m.bb), '') IS NOT NULL)
        OR (NULLIF(btrim(d.usia), '') IS NULL           AND NULLIF(btrim(m.usia), '') IS NOT NULL)
        OR (NULLIF(btrim(d.gender), '') IS NULL         AND NULLIF(btrim(m.gender), '') IS NOT NULL)
        OR (NULLIF(btrim(d.nik), '') IS NULL            AND NULLIF(btrim(m.nik), '') IS NOT NULL)
        OR (NULLIF(btrim(d.email), '') IS NULL          AND NULLIF(btrim(m.email), '') IS NOT NULL)
        OR (NULLIF(btrim(d.tempat_lahir), '') IS NULL   AND NULLIF(btrim(m.tempat_lahir), '') IS NOT NULL)
        OR (NULLIF(btrim(d.alamat_lengkap), '') IS NULL AND NULLIF(btrim(m.alamat_lengkap), '') IS NOT NULL)
        OR (NULLIF(btrim(d.no_pasport), '') IS NULL     AND NULLIF(btrim(m.no_paspor), '') IS NOT NULL) );

-- ── 2. kandidat → master (nilai yang HANYA ada di baris operasional) ────────
--     Urutannya sesudah langkah 1 dengan sengaja: langkah 1 hanya mengisi kolom
--     kandidat yang KOSONG, jadi ia tidak bisa menciptakan konflik baru di sini.
UPDATE public.master_database_candidate m
   SET tb             = COALESCE(NULLIF(btrim(m.tb), ''), d.tb),
       bb             = COALESCE(NULLIF(btrim(m.bb), ''), d.bb),
       usia           = COALESCE(NULLIF(btrim(m.usia), ''), d.usia),
       nik            = COALESCE(NULLIF(btrim(m.nik), ''), d.nik),
       email          = COALESCE(NULLIF(btrim(m.email), ''), d.email),
       tempat_lahir   = COALESCE(NULLIF(btrim(m.tempat_lahir), ''), d.tempat_lahir),
       alamat_lengkap = COALESCE(NULLIF(btrim(m.alamat_lengkap), ''), d.alamat_lengkap),
       no_paspor      = COALESCE(NULLIF(btrim(m.no_paspor), ''), d.no_pasport),
       updated_at     = now()
  FROM public.database_candidate d
 WHERE d.no_wa = m.no_wa
   AND (   (NULLIF(btrim(m.tb), '') IS NULL             AND NULLIF(btrim(d.tb), '') IS NOT NULL)
        OR (NULLIF(btrim(m.bb), '') IS NULL             AND NULLIF(btrim(d.bb), '') IS NOT NULL)
        OR (NULLIF(btrim(m.usia), '') IS NULL           AND NULLIF(btrim(d.usia), '') IS NOT NULL)
        OR (NULLIF(btrim(m.nik), '') IS NULL            AND NULLIF(btrim(d.nik), '') IS NOT NULL)
        OR (NULLIF(btrim(m.email), '') IS NULL          AND NULLIF(btrim(d.email), '') IS NOT NULL)
        OR (NULLIF(btrim(m.tempat_lahir), '') IS NULL   AND NULLIF(btrim(d.tempat_lahir), '') IS NOT NULL)
        OR (NULLIF(btrim(m.alamat_lengkap), '') IS NULL AND NULLIF(btrim(d.alamat_lengkap), '') IS NOT NULL)
        OR (NULLIF(btrim(m.no_paspor), '') IS NULL      AND NULLIF(btrim(d.no_pasport), '') IS NOT NULL) );

-- `gender` sengaja TIDAK disalin kandidat → master: dua tabel memakai enum
-- berbeda (PRIA/WANITA vs LAKI-LAKI/PEREMPUAN), dan 85 baris memang berbeda.
-- Menyalinnya akan mengotori nilai kanonik master.

ANALYZE public.database_candidate;
