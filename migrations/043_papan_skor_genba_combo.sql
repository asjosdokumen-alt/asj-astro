-- 043_papan_skor_genba_combo.sql
--
-- Memperluas daftar game yang sah: `arcade` dipecah menjadi `genba` dan `combo`.
--
-- KENAPA
--   `/arcade` berisi DUA permainan dengan skala skor yang sama sekali berbeda:
--   Genba memberi 100 poin per perintah yang benar dan berakhir setelah tiga
--   kesalahan (skor realistis 0–2 000), sedangkan Combo memberi `50 × kombo`
--   per kartu dan berjalan tanpa akhir (skor realistis 0–50 000+). Menaruh
--   keduanya di satu papan berarti papan Genba SELALU didominasi pemain Combo,
--   dan siswa yang benar-benar unggul di Genba tidak pernah terlihat. Papan
--   peringkat yang tidak bisa memenangkan siapa pun berhenti dipakai.
--
--   `detail.mode` di aplikasi TIDAK cukup: papan peringkat memfilter di SQL,
--   dan memfilter lewat `detail->>'mode'` berarti indeks `game` tidak terpakai.
--
-- Migrasi 042 sudah diterapkan, jadi constraint-nya diperluas di sini — bukan
-- dengan mengedit 042 (checksum ledger akan menolak).
--
-- URUTAN PENTING: baris lama dipetakan SEBELUM constraint baru dipasang.
-- Kalau dibalik, `ADD CONSTRAINT` gagal lebih dulu pada database yang masih
-- menyimpan `arcade`, dan pesan errornya menunjuk baris data — bukan urutan
-- migrasinya.

ALTER TABLE public.game_scores
  DROP CONSTRAINT IF EXISTS game_scores_game_sah;

-- Baris lama (kalau ada) dipetakan ke `genba`: satu-satunya papan yang punya
-- akhir ronde, jadi skor `arcade` yang sudah tersimpan hampir pasti berasal dari
-- sana. Tidak ada baris seperti itu saat migrasi ini ditulis, tapi pengaman ini
-- murah dan membuat migrasi ini aman di database lain.
UPDATE public.game_scores SET game = 'genba' WHERE game = 'arcade';

ALTER TABLE public.game_scores
  ADD CONSTRAINT game_scores_game_sah
  CHECK (game IN ('kotoba', 'genba', 'combo', 'matematika'));
