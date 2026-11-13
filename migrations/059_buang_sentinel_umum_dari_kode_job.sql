-- 059_buang_sentinel_umum_dari_kode_job.sql
--
-- Mengosongkan sentinel 'UMUM' di kolom kode job.
--
-- KENAPA
--   `InputManualModal` dulu mengirim `loker.trim() || 'UMUM'`. 'UMUM' BUKAN
--   kategori: kode job yang sah hanya `TG<n>ASJ` (Tokutei Ginou) dan `GJ<n>ASJ`
--   (Magang) — lihat `JOB_CODE_PREFIX` di contexts/jobs/repository.ts. Jalur
--   input-nya sudah diperbaiki (yang kosong dikirim kosong), tetapi baris LAMA
--   masih menyimpan sentinel itu.
--
--   Terukur 2026-11-13 di produksi (Neon ep-bold-sunset):
--     · database_candidate.id_loker_pilihan = 'UMUM'  -> 93 baris
--     · database_asj_form.code_job          = 'UMUM'  ->  2 baris
--     · 20 baris pertama yang diperiksa: SEMUANYA 0 lamaran asli (tidak punya
--       satu pun baris `database_asj_form` dengan kode job sungguhan).
--
--   Akibatnya tabel Pelamar menampilkan "Job Dilamar: UMUM" untuk kandidat yang
--   sebenarnya cuma mengunggah biodata/dokumen, dan `buildCandidateCountMap`
--   (TabDbJob) menghitung "UMUM" sebagai lowongan yang tidak pernah ada.
--   Pemilik 2026-11-13: *"umum ini maksutnya apa, apa ga mending kosong saja,
--   kecuali emang pernah lamar job code"*.
--
-- BENTUK
--   Nilai dikosongkan (''), BUKAN dihapus barisnya: kandidatnya tetap ada, dan
--   kolomnya memang bertipe teks dengan default kosong. Additive-safe: tidak ada
--   perubahan skema, tidak ada kolom baru.
--
-- CATATAN
--   Kalau suatu saat 'UMUM' benar-benar dipakai sebagai kategori, migrasi ini
--   yang harus diubah lebih dulu — sentinel tidak boleh lahir lagi dari form
--   (`InputManualModal` sudah dijaga validasinya).

DO $$
DECLARE
  n_kandidat int;
  n_lamaran  int;
BEGIN
  UPDATE public.database_candidate
     SET id_loker_pilihan = ''
   WHERE upper(trim(id_loker_pilihan)) = 'UMUM';
  GET DIAGNOSTICS n_kandidat = ROW_COUNT;

  UPDATE public.database_asj_form
     SET code_job = ''
   WHERE upper(trim(code_job)) = 'UMUM';
  GET DIAGNOSTICS n_lamaran = ROW_COUNT;

  RAISE NOTICE 'sentinel UMUM dibersihkan: % kandidat, % baris lamaran', n_kandidat, n_lamaran;

  IF EXISTS (SELECT 1 FROM public.database_candidate WHERE upper(trim(id_loker_pilihan)) = 'UMUM')
     OR EXISTS (SELECT 1 FROM public.database_asj_form WHERE upper(trim(code_job)) = 'UMUM') THEN
    RAISE EXCEPTION 'Masih ada sisa UMUM setelah pembersihan';
  END IF;
END $$;
