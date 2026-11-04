-- 044_kolom_cv_tambahan_dan_jenjang.sql
--
-- Tiga hal yang diminta pemilik 2026-11-04, semuanya soal "supaya semua kolom
-- template CV bisa terisi".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EMPAT KOLOM CV YANG BELUM ADA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Template `rirekisho-detail` punya empat sel yang tidak punya sumber data sama
-- sekali, sehingga CV tercetak dengan lubang:
--
--   D15 集団生活経験    (pengalaman hidup berkelompok/asrama)
--   F15 料理           (bisa memasak sendiri)
--   A17 個人収入        (penghasilan sekarang)
--   I34 家族の賛否      (keluarga setuju berangkat ke Jepang)
--
-- Ditambahkan ke `master_database_candidate` SAJA, tidak ke
-- `database_candidate`. Alasannya: `database_candidate` hanya memuat 17 kolom CV
-- yang DIDUPLIKASI (migrasi 040/041 menghabiskan banyak usaha menyelaraskan
-- salinan itu, dan trigger cermin menjaganya). Menambah empat kolom duplikat
-- baru berarti memperlebar masalah yang baru saja ditutup. Sumber kebenaran data
-- CV adalah `master` — semua renderer membaca dari sana.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EMPAT PERTANYAAN WAWANCARA YANG MENGISI KOLOM ITU
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Untuk soal yang punya `kolom_cv`, KOLOM CV ADALAH SATU-SATUNYA PENYIMPANAN
-- (lihat `_lib/wawancara/bank.ts`): jawabannya langsung ditulis ke kolom itu.
-- Jadi menambah baris di `wawancara_soal` cukup — tidak perlu mengubah form AI
-- CV, karena daftar pertanyaannya dibaca dari tabel ini.
--
-- `kolom_cv_jp` dibiarkan NULL untuk keempatnya: jawabannya angka atau ya/tidak,
-- dan tidak ada template yang mencetak versi Jepangnya.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 3. JENJANG PENDIDIKAN YANG BERCAMPUR BAHASA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Terukur sebelum migrasi ini: `pendidikan_N_tingkat` berisi `SMA/SMK` (65
-- baris), `SD` (18), `SMP` (22), `SMK` (6), `SMA` (4), `S1` (6) — DAN nilai
-- berbahasa Jepang: `小学校`, `中学校`, `高校`. Yang Jepang itu tidak akan cocok
-- dengan dropdown mana pun, jadi barisnya tampak kosong saat diedit.
--
-- `SMA/SMK` SENGAJA TIDAK DIPECAH di sini: satu nilai gabungan tidak menyimpan
-- informasi mana SMA mana SMK, dan menebaknya berarti menulis data palsu ke
-- 65 CV. Nilai itu dibiarkan sampai diisi ulang lewat form.

-- ── 1. Kolom baru ──────────────────────────────────────────────────────────
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS kelompok_tinggal text,
  ADD COLUMN IF NOT EXISTS bisa_memasak     text,
  ADD COLUMN IF NOT EXISTS penghasilan      text,
  ADD COLUMN IF NOT EXISTS restu_keluarga   text;

COMMENT ON COLUMN public.master_database_candidate.kelompok_tinggal IS
  '集団生活経験 — pernah tinggal berkelompok/asrama (ya/tidak)';
COMMENT ON COLUMN public.master_database_candidate.bisa_memasak IS
  '料理 — bisa memasak sendiri (ya/tidak)';
COMMENT ON COLUMN public.master_database_candidate.penghasilan IS
  '個人収入 — penghasilan sekarang per bulan';
COMMENT ON COLUMN public.master_database_candidate.restu_keluarga IS
  '家族の賛否 — keluarga setuju berangkat ke Jepang (ya/tidak)';

-- ── 2. Pertanyaan wawancara ────────────────────────────────────────────────
-- `ON CONFLICT (kode) DO NOTHING` supaya migrasi ini aman dijalankan dua kali
-- dan tidak menimpa teks soal yang mungkin sudah disunting admin.
INSERT INTO public.wawancara_soal
  (kode, tahap, urutan, jp, romaji, arti, kolom_cv, kolom_cv_jp, aktif)
VALUES
  ('ms-178', 'Kehidupan Sehari-hari & Kebiasaan', 19,
   '寮やグループでの生活はできますか。',
   'Ryou ya guruupu de no seikatsu wa dekimasu ka.',
   'Apakah bisa tinggal berkelompok / di asrama?',
   'kelompok_tinggal', NULL, true),
  ('ms-179', 'Ibadah & Makanan', 13,
   '自分で料理を作れますか。',
   'Jibun de ryouri o tsukuremasu ka.',
   'Apakah bisa memasak sendiri?',
   'bisa_memasak', NULL, true),
  ('ms-180', 'Keluarga & Latar Belakang', 19,
   '今の収入はいくらですか。',
   'Ima no shuunyuu wa ikura desu ka.',
   'Berapa penghasilan Anda sekarang?',
   'penghasilan', NULL, true),
  ('ms-181', 'Keluarga & Latar Belakang', 20,
   '家族は日本へ行くことに賛成していますか。',
   'Kazoku wa Nihon e iku koto ni sansei shiteimasu ka.',
   'Apakah keluarga setuju Anda berangkat ke Jepang?',
   'restu_keluarga', NULL, true)
ON CONFLICT (kode) DO NOTHING;

-- ── 3. Normalisasi jenjang berbahasa Jepang ────────────────────────────────
-- Hanya nilai JEPANG yang diubah. `SMA/SMK` dan nilai lain tidak disentuh.
DO $$
DECLARE
  i int;
  pasangan text[][] := ARRAY[
    ['小学校', 'SD'],
    ['中学校', 'SMP'],
    ['高校',   'SMA/SMK'],
    ['高等学校','SMA/SMK']
  ];
  p text[];
BEGIN
  FOR i IN 1..3 LOOP
    FOREACH p SLICE 1 IN ARRAY pasangan LOOP
      EXECUTE format(
        'UPDATE public.master_database_candidate SET pendidikan_%s_tingkat = $1 WHERE pendidikan_%s_tingkat = $2',
        i, i
      ) USING p[2], p[1];
    END LOOP;
  END LOOP;
END $$;
