-- =============================================================================
-- 2026-11-01 — Migration 030: penjaga bentuk baris `wawancara_jawaban`
-- -----------------------------------------------------------------------------
-- MASALAH YANG DIKUNCI
--   Sampai hari ini satu-satunya penjaga panjang jawaban ada di KODE
--   (`BATAS_FIELD` di `_lib/wawancara/bank.ts`). Kolomnya sendiri `text` tanpa
--   batas, jadi setiap jalur tulis baru — aksi baru, skrip pembersihan, SQL
--   manual, atau satu `PATCH` yang lolos dari kode — bisa menaruh apa pun di
--   sini. Untuk 8 soal ber-`kolom_cv` nilai itu ikut ditulis ke
--   `master_database_candidate`, yaitu kolom yang DICETAK ke 履歴書 dan dikirim
--   ke perusahaan. Penjaga yang hanya hidup di satu berkas TypeScript bukan
--   penjaga; ia hanya kebiasaan.
--
--   `sumber` juga tidak dijaga: komentarnya berbunyi `'siswa' | 'ai'` tetapi
--   tidak ada yang menolak nilai lain. Nilai aneh di sana membuat asal-usul
--   jawaban tidak bisa dipercaya saat menelusuri "ini tulisan siswa atau
--   terjemahan model?".
--
-- NILAI YANG DIPAKAI
--   2000 karakter = `BATAS_FIELD` di `bank.ts`. Kalau angka di kode berubah,
--   migrasi baru harus mengubah constraint ini juga — komentar di kedua sisi
--   menyebut satu sama lain supaya tidak diam-diam berbeda.
--   Diukur sebelum menulis migrasi ini (2026-11-01): baris terpanjang di tabel
--   = jp 39 / romaji 108 / arti 130 karakter, dan `sumber` hanya berisi
--   'siswa' (6) dan 'ai' (8). Jadi tidak ada baris lama yang ditolak.
--
-- SIFAT: idempoten. `drop constraint if exists` sebelum `add` membuat migrasi
-- ini bisa dijalankan ulang tanpa galat "constraint already exists".
-- =============================================================================

BEGIN;

ALTER TABLE public.wawancara_jawaban
  DROP CONSTRAINT IF EXISTS wawancara_jawaban_panjang,
  DROP CONSTRAINT IF EXISTS wawancara_jawaban_sumber;

ALTER TABLE public.wawancara_jawaban
  ADD CONSTRAINT wawancara_jawaban_panjang CHECK (
    char_length(jp) <= 2000
    AND char_length(romaji) <= 2000
    AND char_length(arti) <= 2000
  ),
  ADD CONSTRAINT wawancara_jawaban_sumber CHECK (sumber IN ('siswa', 'ai'));

COMMENT ON CONSTRAINT wawancara_jawaban_panjang ON public.wawancara_jawaban IS
  'Cermin BATAS_FIELD (_lib/wawancara/bank.ts). Ubah keduanya bersama, lewat migrasi baru.';
COMMENT ON CONSTRAINT wawancara_jawaban_sumber ON public.wawancara_jawaban IS
  'Asal jawaban: tulisan siswa sendiri, atau hasil terjemahan model.';

COMMIT;
