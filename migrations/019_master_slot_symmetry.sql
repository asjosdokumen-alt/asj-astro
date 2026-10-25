-- =============================================================================
-- 2026-10-25 — Migration 019: kolom slot SIMETRIS, kolom mati dibuang
-- -----------------------------------------------------------------------------
-- MASALAH YANG DIKUNCI
--   `master_database_candidate` menyimpan baris berulang (pendidikan 5,
--   pekerjaan 3, keluarga 5) sebagai kolom bernomor. Keluarga kolom itu TIDAK
--   lengkap, dan kelengkapannya tidak merata antar-nomor:
--
--     pendidikan_3_jurusan_id     ADA      (10 baris)
--     pendidikan_{1,2,4,5}_jurusan_id   TIDAK ADA
--     pekerjaan_1_gaji            ADA      (8 baris)
--     pekerjaan_{2,3}_gaji        TIDAK ADA
--     keluarga_1_*                LENGKAP
--     keluarga_{2..5}_nama/usia/pekerjaan/hubungan   TIDAK ADA
--     keluarga_{1..5}_gaji        TIDAK ADA
--
--   Akibatnya nyata, bukan teoretis:
--     1. CV AI mengumpulkan jurusan untuk SETIAP baris pendidikan, tetapi
--        `buildRiwayatSlots` menulis `pendidikan_N_jurusan_id`; untuk N≠3
--        nilainya dibuang oleh `MASTER_COLUMN_MISSING` supaya PostgREST tidak
--        menjawab 400 (PGRST204 membatalkan SELURUH baris). Jadi jurusan
--        sekolah ke-1, ke-2, ke-4, dan ke-5 hanya hidup di `ai_data_json`.
--     2. Keluarga baris 2–5 tidak punya kolom sama sekali. Form menerima lima
--        anggota keluarga; tabel hanya bisa menyimpan satu secara penuh.
--     3. Nama sekolah / jurusan / perusahaan / jabatan versi KANJI sudah
--        dikumpulkan form dan kolomnya sudah ada, tetapi tidak pernah ditulis
--        (lihat migrasi ini bagian "penulis", commit berikutnya).
--
--   Selama kolomnya tidak simetris, satu CV hanya bisa dibaca utuh dengan
--   menggabungkan kolom + `ai_data_json`. Itu pekerjaan gabung di SETIAP
--   pembaca (panel admin, ekspor, kueri SQL) — bukan indeks yang kurang.
--
-- YANG DITAMBAH (aditif, aman untuk kode lama)
--   * slot yang hilang, mengikuti pola nama yang SUDAH ada di tabel
--   * kolom kenalan Indonesia (`kenalan_di_jepang_pekerjaan/usia/alamat`):
--     `e2e/ai-cv-column-coverage.test.ts` sudah mencatatnya sebagai CELAH
--     SKEMA, dan migrasi inilah yang menutupnya — bukan memetakan paksa ke
--     kolom `_jp` (usia bukan teks terjemahan).
--   * `bidangssw2`: Form Master punya DUA lisensi SSW (`lisensi`, `lisensi2`),
--     `MASTER_COLUMN_MAP` hanya memetakan yang pertama. Yang kedua selama ini
--     diketik, dikirim, lalu dibuang tanpa pesan.
--
-- YANG DIBUANG (terukur: 0 baris berisi ATAU 0 referensi kode)
--   * `religion` — duplikat Inggris dari `agama`. Satu baris berisi
--     (`id=40`, AGUS KHOCI: religion "ISLAM", agama "Islam"); fakta yang sama.
--     Nilainya disalin ke `agama` lebih dulu kalau `agama` kosong, lalu kolomnya
--     dibuang. Delapan referensi `religion` di kode semuanya KOMENTAR yang
--     menjelaskan bahwa kolom ini duplikat.
--   * `alasan_memilih_bidang_jp_1` — sufiks `_1` nyasar; kolom yang benar
--     (`alasan_memilih_bidang_jp`) ada dan dipakai. 0 baris, 0 referensi.
--   * `kenalan_di_jepang_usia_jp` — usia adalah angka; versi "terjemahan JP"
--     dari angka tidak punya arti. 0 baris, 0 referensi.
--
--   SENGAJA TIDAK DIBUANG walau terlihat mati (punya data, hanya tidak dibaca):
--     `lamakerjadiharapkan` (9 baris), `riwayatpendidikan` (34),
--     `riwayat_pekerjaan_json` (8), `riwayat_keluarga_json` (10).
--     Membuangnya = menghapus data pemilik. Kandidat untuk expand/contract,
--     bukan untuk DROP di migrasi ini.
--
-- INDEX — HANYA DUPLIKAT MURNI
--   Detektor di `scripts/db-baseline.mjs` membandingkan `indkey` saja, jadi ia
--   melaporkan 6 pasang redundan. Tiga di antaranya SALAH: index parsial dengan
--   predikat berbeda bukan duplikat.
--
--     idx_schedule_status_aktif  (id) WHERE status_jadwal='AKTIF'   <- BUKAN dup
--     idx_job_queue_completed    (created_at) WHERE status='done'   <- BUKAN dup
--     idx_dependency_calls_ts_dep (ts,dep) vs (ts) WHERE outcome<>'ok' <- BUKAN dup
--
--   Yang benar-benar identik (kunci sama, tanpa predikat, melawan UNIQUE):
--     idx_schedule_id_jadwal  = database_schedule_id_jadwal_key (id_jadwal)
--     idx_tugas_id_tugas      = database_tugas_id_tugas_key (id_tugas)
--     idx_sessions_token      = user_sessions_session_token_key (session_token)
--
-- CATATAN PERFORMA (diukur 2026-10-25, `scripts/db-baseline.mjs`)
--   DB 12 MB, 226 kandidat. SEMUA query aplikasi selesai < 0,2 ms
--   (Q1 seluruh kandidat 0,098 ms; Q2 halaman 1000 baris 0,160 ms). Jadi
--   indeks BUKAN penyebab lambat di skala ini, dan migrasi ini tidak menambah
--   indeks baru — ia hanya berhenti membayar biaya tulis untuk duplikat.
--   Yang memperlambat tarikan data adalah jumlah round-trip jaringan dan
--   pekerjaan menggabung kolom + `ai_data_json`. Simetrisitas kolom di atas
--   itulah yang mengurangi pekerjaan gabung itu.
-- =============================================================================

-- Transaksi TIDAK dibuka di sini: `scripts/migrate.mjs` sudah membungkus tiap
-- migrasi dengan BEGIN/COMMIT sendiri, dan BEGIN bersarang membuat COMMIT di
-- dalam file ini menutup transaksi runner lebih awal (itu yang pernah membuat
-- 017 kehilangan wrapper-nya).

-- ── 1. Slot pendidikan: jurusan untuk semua nomor ───────────────────────────
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS pendidikan_1_jurusan_id text,
  ADD COLUMN IF NOT EXISTS pendidikan_2_jurusan_id text,
  ADD COLUMN IF NOT EXISTS pendidikan_4_jurusan_id text,
  ADD COLUMN IF NOT EXISTS pendidikan_5_jurusan_id text;

-- ── 2. Slot pekerjaan: gaji untuk semua nomor ──────────────────────────────
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS pekerjaan_2_gaji text,
  ADD COLUMN IF NOT EXISTS pekerjaan_3_gaji text;

-- ── 3. Slot keluarga: lengkapi baris 2–5 + gaji semua baris ────────────────
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS keluarga_2_hubungan text,
  ADD COLUMN IF NOT EXISTS keluarga_3_hubungan text,
  ADD COLUMN IF NOT EXISTS keluarga_4_hubungan text,
  ADD COLUMN IF NOT EXISTS keluarga_5_hubungan text,
  ADD COLUMN IF NOT EXISTS keluarga_3_nama text,
  ADD COLUMN IF NOT EXISTS keluarga_4_nama text,
  ADD COLUMN IF NOT EXISTS keluarga_5_nama text,
  ADD COLUMN IF NOT EXISTS keluarga_2_usia text,
  ADD COLUMN IF NOT EXISTS keluarga_3_usia text,
  ADD COLUMN IF NOT EXISTS keluarga_4_usia text,
  ADD COLUMN IF NOT EXISTS keluarga_5_usia text,
  ADD COLUMN IF NOT EXISTS keluarga_2_pekerjaan text,
  ADD COLUMN IF NOT EXISTS keluarga_3_pekerjaan text,
  ADD COLUMN IF NOT EXISTS keluarga_4_pekerjaan text,
  ADD COLUMN IF NOT EXISTS keluarga_5_pekerjaan text,
  ADD COLUMN IF NOT EXISTS keluarga_1_gaji text,
  ADD COLUMN IF NOT EXISTS keluarga_2_gaji text,
  ADD COLUMN IF NOT EXISTS keluarga_3_gaji text,
  ADD COLUMN IF NOT EXISTS keluarga_4_gaji text,
  ADD COLUMN IF NOT EXISTS keluarga_5_gaji text;

-- ── 4. Kenalan di Jepang: tiga kolom versi Indonesia ───────────────────────
--     Ditutupnya celah ini membuat `AI_TO_MASTER_COLUMNS.kenalan_jepang`
--     boleh memetakan ketiganya, dan allow-list `NO_COLUMN_BY_DESIGN` di
--     e2e/ai-cv-column-coverage.test.ts menyusut (tesnya akan menuntut).
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS kenalan_di_jepang_pekerjaan text,
  ADD COLUMN IF NOT EXISTS kenalan_di_jepang_usia text,
  ADD COLUMN IF NOT EXISTS kenalan_di_jepang_alamat text;

-- ── 5. Lisensi SSW kedua ───────────────────────────────────────────────────
--     `bidangssw` adalah lisensi pertama (MASTER_COLUMN_MAP: lisensi →
--     bidangssw). Nama `bidangssw2` mengikuti pola itu, bukan `ssw2`, karena
--     `ssw` sudah punya arti lain di tabel ini (status/sertifikat).
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS bidangssw2 text;

-- ── 6. religion → agama, lalu buang kolomnya ───────────────────────────────
UPDATE public.master_database_candidate
   SET agama = religion
 WHERE (agama IS NULL OR btrim(agama) = '')
   AND religion IS NOT NULL AND btrim(religion) <> '';

ALTER TABLE public.master_database_candidate DROP COLUMN IF EXISTS religion;

-- ── 7. Dua kolom tanpa isi dan tanpa pembaca ───────────────────────────────
ALTER TABLE public.master_database_candidate DROP COLUMN IF EXISTS alasan_memilih_bidang_jp_1;
ALTER TABLE public.master_database_candidate DROP COLUMN IF EXISTS kenalan_di_jepang_usia_jp;

-- ── 8. Tiga index duplikat murni (predikat sama: tidak ada) ────────────────
--     Dijaga IF EXISTS supaya migrasi ini tetap bisa dijalankan di salinan
--     yang index-nya sudah pernah dibersihkan manual.
DROP INDEX IF EXISTS public.idx_schedule_id_jadwal;
DROP INDEX IF EXISTS public.idx_tugas_id_tugas;
DROP INDEX IF EXISTS public.idx_sessions_token;

-- ── 9. Statistik segar ─────────────────────────────────────────────────────
--     `database_candidate` punya 66 dead tuple (22,6%) dan TIDAK PERNAH
--     di-autovacuum; planner memakai estimasi yang dibuat sebelum kolom baru.
ANALYZE public.master_database_candidate;
