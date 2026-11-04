-- 047_pasangan_jp_lengkap.sql
--
-- Prinsip pemilik (2026-11-05): "saya maunya semua ada id dan jp-nya di DB.
-- Template kadang butuh kanji saja, kadang ID-JP, kadang ID saja — yang
-- penting DB lengkap; template tinggal memilih."
--
-- Jadi kolom ini TIDAK ditambahkan karena satu template memerlukannya
-- sekarang, melainkan supaya datanya ada ketika template memintanya. Yang
-- ditambahkan hanya field TEKS yang dicetak di sel berlabel Jepang:
--
--   pekerjaan_N_jenis    (雇用形態)  x3 slot
--   pekerjaan_N_bidang   (業種)      x3 slot
--   pekerjaan_N_catatan  (備考)      x3 slot
--   bahasa_lain          (言語)
--   level_bahasa_jepang  (日本語レベル)
--   level_bahasa_inggris (英語レベル)
--   sertifikat_lain      (資格)
--   catatan_cv           (備考)
--   kontak_darurat_nama  (緊急連絡先・氏名 — nama orang, jadi katakana)
--
-- TIDAK ditambahkan, dengan alasan:
--   • field ya/tidak (kacamata, tato, merokok, visa_jepang, kelompok_tinggal,
--     bisa_memasak, restu_keluarga, …) — dicetak sebagai 有/無 oleh renderer,
--     kolom `_jp` hanya akan menduplikasi satu bit;
--   • angka & tanggal (tb, bb, usia, tahun, gaji) — tidak punya bentuk Jepang;
--   • URL, id, status internal, dan kolom `*_json`;
--   • `perusahaan_1_*` (nama shacou, telp, web, alamat) — data perusahaan,
--     bukan data kandidat; kalau nanti dicetak, tambahkan saat itu.

ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS pekerjaan_1_jenis_jp    text,
  ADD COLUMN IF NOT EXISTS pekerjaan_1_bidang_jp   text,
  ADD COLUMN IF NOT EXISTS pekerjaan_1_catatan_jp  text,
  ADD COLUMN IF NOT EXISTS pekerjaan_2_jenis_jp    text,
  ADD COLUMN IF NOT EXISTS pekerjaan_2_bidang_jp   text,
  ADD COLUMN IF NOT EXISTS pekerjaan_2_catatan_jp  text,
  ADD COLUMN IF NOT EXISTS pekerjaan_3_jenis_jp    text,
  ADD COLUMN IF NOT EXISTS pekerjaan_3_bidang_jp   text,
  ADD COLUMN IF NOT EXISTS pekerjaan_3_catatan_jp  text,
  ADD COLUMN IF NOT EXISTS bahasa_lain_jp          text,
  ADD COLUMN IF NOT EXISTS level_bahasa_jepang_jp  text,
  ADD COLUMN IF NOT EXISTS level_bahasa_inggris_jp text,
  ADD COLUMN IF NOT EXISTS sertifikat_lain_jp      text,
  ADD COLUMN IF NOT EXISTS catatan_cv_jp           text,
  ADD COLUMN IF NOT EXISTS kontak_darurat_nama_jp  text;

COMMENT ON COLUMN public.master_database_candidate.pekerjaan_1_jenis_jp IS
  '雇用形態 (versi Jepang) — diisi tombol Terjemahkan / CV AI';
COMMENT ON COLUMN public.master_database_candidate.catatan_cv_jp IS
  '備考 (versi Jepang) — diisi tombol Terjemahkan / CV AI';
COMMENT ON COLUMN public.master_database_candidate.kontak_darurat_nama_jp IS
  '緊急連絡先の氏名 (katakana) — diisi tombol Terjemahkan / CV AI';
