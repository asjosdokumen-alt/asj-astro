-- 057_alasan_berhenti_pekerjaan.sql
--
-- Menambah ALASAN BERHENTI per baris riwayat kerja.
--
-- KENAPA
--   Form Master sudah merender input "Alasan Berhenti" (`master.kerja_alasan`)
--   sejak lama, dan Form CV AI menyimpan nilainya di state `JobRow.alasan` —
--   tetapi TIDAK ADA kolomnya, dan tidak satu pun jalur simpan mengirimnya.
--   Jadi jawaban kandidat hilang tanpa error (pemilik 2026-11-12: *"Alasan
--   Berhenti emang belum ada tapi bakal kepake bisa ada template cv yg
--   membutuhkannya"*).
--
--   Tidak ada renderer yang mencetaknya SEKARANG. Kolom ini disiapkan supaya
--   template yang membutuhkannya (model CV lama) bisa membaca datanya, bukan
--   menebak dari `catatan`.
--
-- BENTUK
--   Teks bebas per slot, sama seperti `pekerjaan_N_catatan`: nilai Indonesia
--   apa adanya, renderer yang menerjemahkan bila perlu. Additive + nullable,
--   aman untuk kode lama.
--
-- CATATAN
--   `candidate_pekerjaan` (tabel anak) TIDAK ikut ditambah kolom, sama seperti
--   `kota` (056): nilainya hidup di kolom slot dan dibaca balik lewat
--   pencocokan `pekerjaan_N_nama_perusahaan`.

DO $$
DECLARE
  i int;
BEGIN
  FOR i IN 1..3 LOOP
    EXECUTE format(
      'ALTER TABLE public.master_database_candidate ADD COLUMN IF NOT EXISTS pekerjaan_%s_alasan text',
      i
    );
  END LOOP;
END $$;
