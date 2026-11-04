-- 042_kelas_dan_papan_skor.sql
--
-- DUA HAL, satu alasan: pemilik 2026-11-04 meminta (a) kelas siswa masuk ke DB
-- dan (b) papan peringkat game yang bisa dilihat admin.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. `kelas` sebagai KOLOM, bukan hanya tag di catatan
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sampai sekarang kelas hanya hidup sebagai teks `[KELAS K]` di dalam
-- `catatan_internal`, dan `mapCandidate()` mengekstraknya dengan regex. Itu
-- bekerja, tapi tiga hal menyakitkan:
--
--   • Daftar kelas tidak bisa di-query. "Siapa saja kelas K?" hanya bisa
--     dijawab dengan menarik SEMUA baris lalu memfilter di aplikasi.
--   • Satu salah ketik di memo admin (mis. `[KELAS  k]` atau `[KELAS K ]`)
--     diam-diam menghapus siswa dari kelasnya — dan gerbang VIP ikut tertutup.
--   • Memo admin adalah tempat menulis catatan bebas; menyimpan data
--     terstruktur di dalamnya membuat setiap perubahan catatan berisiko
--     merusak keanggotaan kelas.
--
-- Kolom ini TIDAK menghapus mekanisme lama. `mapCandidate()` membaca kolom
-- lebih dulu dan JATUH KE TAG bila kolom kosong — jadi 39 kandidat yang sudah
-- punya tag tetap bekerja tanpa disentuh, dan tidak ada satu pun yang kehilangan
-- akses saat migrasi ini berjalan.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. `game_scores` — papan peringkat
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sebelum ini, skor ketiga game (kotoba, arcade, matematika) hanya ada di
-- `localStorage` per perangkat. Artinya: siswa yang bermain di HP teman, atau
-- setelah membersihkan data peramban, kehilangan rekornya — dan TIDAK ADA cara
-- bagi pengajar untuk melihat siapa yang benar-benar berlatih.
--
-- Bentuknya RIWAYAT, bukan satu baris per siswa: papan peringkat mengambil
-- skor TERTINGGI per (no_wa, game), sedangkan riwayatnya berguna untuk melihat
-- perkembangan. Satu baris per siswa akan menghapus informasi itu selamanya.
--
-- `kelas` disimpan sebagai SALINAN saat skor dikirim, bukan dibaca ulang lewat
-- join. KENAPA: siswa naik kelas seiring waktu, dan papan peringkat kelas K
-- tahun ini harus tetap menampilkan K — bukan kelas barunya. Menyalin di sini
-- adalah denormalisasi yang disengaja, bukan kelalaian.

-- ── 1. Kolom kelas ─────────────────────────────────────────────────────────
ALTER TABLE public.database_candidate
  ADD COLUMN IF NOT EXISTS kelas text;

ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS kelas text;

-- Indeks: papan peringkat & daftar per kelas difilter per kelas.
CREATE INDEX IF NOT EXISTS database_candidate_kelas_idx
  ON public.database_candidate (kelas)
  WHERE kelas IS NOT NULL AND kelas <> '';

-- ── 2. Papan peringkat ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_scores (
  id           bigserial PRIMARY KEY,
  no_wa        text        NOT NULL,
  nama         text        NOT NULL DEFAULT '',
  -- Disalin saat kirim; lihat komentar di atas.
  kelas        text        NOT NULL DEFAULT '',
  game         text        NOT NULL,
  skor         integer     NOT NULL,
  -- Rincian bebas per game (mis. jumlah benar/salah, level, durasi ronde).
  detail       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dibuat_pada  timestamptz NOT NULL DEFAULT now(),
  -- Nama game ditutup di sini, bukan di aplikasi: nilai asing di kolom ini akan
  -- membuat papan peringkat menampilkan grup kosong tanpa error apa pun.
  CONSTRAINT game_scores_game_sah CHECK (game IN ('kotoba', 'arcade', 'matematika')),
  CONSTRAINT game_scores_skor_sah CHECK (skor >= 0)
);

-- Papan peringkat: per game, skor tertinggi dulu.
CREATE INDEX IF NOT EXISTS game_scores_papan_idx
  ON public.game_scores (game, skor DESC, dibuat_pada DESC);

-- "Riwayat saya" + pengambilan skor terbaik per siswa.
CREATE INDEX IF NOT EXISTS game_scores_wa_idx
  ON public.game_scores (no_wa, game, skor DESC);

-- RLS ON tanpa policy = hanya `asj_service` (BYPASSRLS) yang bisa membaca.
-- Pola yang sama dengan 26 tabel lain di repo ini. Skor adalah data siswa;
-- anon key tidak boleh melihatnya sama sekali.
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;
