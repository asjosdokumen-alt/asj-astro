-- 048_asesmen_tes.sql
--
-- DUA TES MANDIRI UNTUK SISWA: MBTI dan Tes Mata Pra-MCU (Ishihara + Landolt C).
--
-- KENAPA TABEL BARU, BUKAN KOLOM DI `master_database_candidate`
-- ---------------------------------------------------------------
-- Tabel master punya 169 kolom dan setiap kolom baru menambah berat SETIAP
-- pembacaan kandidat (baris ~1,14 KB). Tes ini menghasilkan struktur
-- bersarang (40 jawaban MBTI, 14 plate Ishihara, dua visus) yang tidak akan
-- pernah dipakai jalur lain — menaruhnya di master berarti membayar berat itu
-- di dashboard, papan pelamar, dan CV, padahal hanya dua halaman yang membaca.
--
-- KENAPA `unique (no_wa, jenis)`
-- ------------------------------
-- Pemilik 2026-11-06: *"tes nya hanya sekali tiap siswa"*. Aturan itu
-- ditegakkan DATABASE, bukan hanya tombol yang disembunyikan di klien:
-- kiriman kedua ditolak constraint, bukan diam-diam menimpa hasil pertama.
-- Satu siswa = satu baris per jenis tes, selamanya.
--
-- KENAPA `nama`/`kelas` DISALIN
-- ------------------------------
-- Alasannya sama dengan `game_scores` (042): siswa naik kelas seiring waktu,
-- dan hasil tes kelas K tahun ini harus tetap terbaca sebagai K. Nilainya
-- diambil dari DB saat menyimpan, BUKAN dari klien.
--
-- KENAPA `ringkasan` TERPISAH DARI `hasil`
-- ----------------------------------------
-- Tab admin menampilkan daftar (nama, jenis, ringkasan, tanggal). Kalau
-- ringkasan hanya ada di dalam JSON, setiap render daftar harus mengurai JSON
-- tiap baris — dan daftar yang tidak bisa dibaca tanpa mengurai adalah daftar
-- yang akan diurai di klien, bukan di SQL.

CREATE TABLE IF NOT EXISTS public.candidate_assessments (
  id           bigserial PRIMARY KEY,
  no_wa        text        NOT NULL,
  nama         text        NOT NULL DEFAULT '',
  kelas        text        NOT NULL DEFAULT '',
  jenis        text        NOT NULL,
  -- Satu baris teks untuk daftar admin, mis. "INTJ · E 72/I 28 · …" atau
  -- "NORMAL · OD 1.0 / OS 0.7".
  ringkasan    text        NOT NULL DEFAULT '',
  -- Rincian lengkap per jenis tes. Bentuknya bebas, tetapi yang ditulis hanya
  -- apa yang dikirim klien setelah divalidasi service.
  hasil        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dibuat_pada  timestamptz NOT NULL DEFAULT now(),
  -- Nama tes ditutup di sini: nilai asing akan membuat tab admin menampilkan
  -- kelompok kosong tanpa satu pun error.
  CONSTRAINT candidate_assessments_jenis_sah CHECK (jenis IN ('mbti', 'mata')),
  -- "Sekali seumur hidup" — lihat komentar di atas.
  CONSTRAINT candidate_assessments_sekali UNIQUE (no_wa, jenis)
);

-- Daftar admin: terbaru dulu, dan per jenis untuk tab.
CREATE INDEX IF NOT EXISTS candidate_assessments_jenis_idx
  ON public.candidate_assessments (jenis, dibuat_pada DESC);

-- RLS ON tanpa policy = hanya `asj_service` (BYPASSRLS) yang bisa membaca.
-- Pola yang sama dengan 27 tabel lain. Hasil tes adalah data pribadi siswa;
-- anon key tidak boleh melihatnya sama sekali.
ALTER TABLE public.candidate_assessments ENABLE ROW LEVEL SECURITY;
