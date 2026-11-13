-- 058_pekerjaan_jp_keluarga_2_5.sql
--
-- Melengkapi PASANGAN JEPANG untuk pekerjaan anggota keluarga (4 kolom).
--
-- KENAPA
--   Migrasi 022 memberi `keluarga_1_pekerjaan_jp`, tetapi baris 2–5 tidak
--   pernah mendapatkannya. Padahal:
--     • `buildMasterNested` MEMBACA `keluarga_N_pekerjaan_jp` untuk SEMUA N
--       (service.ts, blok `keluarga`), dan
--     • KINKI MENCETAK 家族の職業 untuk kelima baris (`F…` di `buildValues`,
--       `jpTerm(pekerjaan_jp || pekerjaan)`), dan
--     • CV AI MENGUMPULKAN `keluarga[i].pekerjaan_jp` untuk setiap baris
--       (`FamRow` di `AiCvForm`).
--   Untuk baris 2–5 tidak ada kolom tujuan, jadi kanji yang diketik kandidat
--   dibuang tanpa pesan dan selnya jatuh ke teks Indonesia. Terukur 2026-11-13
--   oleh gerbang `e2e/form-column-parity.test.ts` (arah template → form):
--   `keluarga[].pekerjaan_jp` satu-satunya field yang dibaca template tanpa
--   kolom yang bisa ditulis form.
--
-- BENTUK
--   Teks bebas, sama seperti `keluarga_1_pekerjaan_jp`: nilai kanji apa adanya,
--   renderer memilih sisi mana yang dicetak. Additive + nullable, aman untuk
--   kode lama (baris yang belum punya nilai tetap kosong, bukan `NULL` yang
--   mengubah tampilan).
--
-- CATATAN
--   Slot ini ditulis `buildRiwayatSlots` dari payload `keluarga[].pekerjaan_jp`
--   — jalur yang sama dengan `hubungan_jp` dan `katakana` (046).

DO $$
DECLARE
  i int;
BEGIN
  FOR i IN 2..5 LOOP
    EXECUTE format(
      'ALTER TABLE public.master_database_candidate ADD COLUMN IF NOT EXISTS keluarga_%s_pekerjaan_jp text',
      i
    );
  END LOOP;
END $$;
