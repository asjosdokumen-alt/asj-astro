-- =============================================================================
-- 2026-11-07 — Migration 050: buang kolom mati `status_biodata`
--                             + luruskan `job_database.tahapan = 'CANCEL'`
-- -----------------------------------------------------------------------------
-- KEPUTUSAN PEMILIK, 2026-11-07: "hapus kolomnya" dan "kosongkan tahapnya".
-- Keduanya dicatat sebagai utang di `deliverables/utang-teknis-2026-11-07.md`
-- (§5 dan §6) dan baru dikerjakan setelah pemilik memutuskan.
--
-- ── 1. status_biodata ───────────────────────────────────────────────────────
-- WHY IT GOES
--   Migrasi 013 (2026-09-17) menambahkan kolom ini untuk memisahkan vonis
--   DOKUMEN dari vonis LAMARAN. Gagasannya benar, tetapi kolomnya tidak pernah
--   dipakai: terukur 2026-11-07 lewat PostgREST,
--
--     database_candidate: 261 baris · status_biodata = 'BELUM' pada 261 baris
--
--   dan satu-satunya rujukan di kode adalah sebuah KOMENTAR. Vonis dokumen
--   sekarang hidup di baris Mail (`database_asj_form.feedback_berkas` +
--   `alasan_tolak`, migrasi 049) — tempat kandidat benar-benar melihatnya.
--
--   Kolom yang namanya menjanjikan status tetapi tidak pernah diisi lebih buruk
--   daripada tidak ada: ia membuat skema tampak memiliki jawaban yang tidak
--   dimilikinya, dan mengundang kode baru menulis ke sana.
--
-- WHY THE TRIGGER AND FUNCTION GO TOO
--   `enforce_status_biodata_admin_only()` hanya menjaga kolom ini. Membiarkannya
--   berarti meninggalkan fungsi yang mereferensikan kolom yang sudah tidak ada —
--   dan setiap penulisan ke `database_candidate` akan gagal dengan 42703.
--
-- GUARD: THE COLUMN MUST STILL BE EMPTY
--   Kalau ternyata ada baris yang berisi nilai lain (DISETUJUI/REVISI/MENUNGGU),
--   migrasi ini BERHENTI, bukan menghapus bukti. Pada 2026-11-07 tidak ada.
--
-- ── 2. job_database.tahapan = 'CANCEL' ──────────────────────────────────────
-- WHY
--   Satu baris menyimpan STATUS di kolom TAHAP:
--
--     code_job = 'TG502ASJ' · TSK KANAYAMA · Kaigo · Fukuoka
--     status   = 'CLOSE' · tahapan = 'CANCEL' · kuota = 0
--
--   Lowongan yang dibatalkan memang tidak punya tahap. Faktanya sudah tersimpan
--   di `status` ('CLOSE'); 'CANCEL' di `tahapan` hanya salinan yang salah kolom.
--
-- WHY NULL, NOT ''
--   Diukur 2026-11-07: 64 baris lain sudah memakai NULL untuk "belum ada tahap",
--   nol baris memakai string kosong. Menulis '' akan menciptakan konvensi KEDUA
--   untuk keadaan yang sama — persis jenis ambiguitas yang sedang dibereskan.
--
--   `updated_at` sengaja TIDAK disentuh: ini perbaikan data, bukan aktivitas
--   bisnis (aturan yang sama dengan normalisasi status 2026-11-07).
--
-- HOW TO APPLY
--   `npm run migrate:up` (ledger + checksum) — bukan tempel manual, karena
--   kolom yang di-drop harus hilang dari `schema.generated.ts` juga:
--   jalankan `npm run db:schema` setelahnya, lalu `npm run verify:schema`.
--
-- SAFE BEFORE THE CODE DEPLOYS
--   Tidak ada kode yang membaca/menulis kedua kolom ini (diverifikasi dengan
--   grep atas `src/` dan `netlify/`, 2026-11-07), jadi urutan migrasi-dulu
--   adalah urutan yang benar: kode lama tetap jalan tanpa kolom itu.
-- =============================================================================

-- ── 1. status_biodata ───────────────────────────────────────────────────────

-- Berhenti kalau kolomnya ternyata berisi sesuatu. `to_regclass` dipakai supaya
-- blok ini juga aman di database yang belum pernah menjalankan migrasi 013.
DO $$
DECLARE
  jumlah_terisi bigint;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'database_candidate'
       AND column_name  = 'status_biodata'
  ) THEN
    EXECUTE $q$
      SELECT count(*) FROM public.database_candidate
       WHERE status_biodata IS DISTINCT FROM 'BELUM'
    $q$ INTO jumlah_terisi;

    IF jumlah_terisi > 0 THEN
      RAISE EXCEPTION
        'status_biodata berisi % baris selain BELUM — migrasi 050 dihentikan. '
        'Pindahkan dulu nilainya ke baris Mail (feedback_berkas/alasan_tolak), '
        'lalu jalankan ulang.', jumlah_terisi;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_status_biodata_admin_only ON public.database_candidate;
DROP FUNCTION IF EXISTS public.enforce_status_biodata_admin_only();

-- CHECK constraint `database_candidate_status_biodata_check` ikut terhapus
-- bersama kolomnya — tidak perlu DROP CONSTRAINT terpisah.
ALTER TABLE public.database_candidate
  DROP COLUMN IF EXISTS status_biodata;

-- ── 2. job_database.tahapan ─────────────────────────────────────────────────

UPDATE public.job_database
   SET tahapan = NULL
 WHERE tahapan = 'CANCEL';
