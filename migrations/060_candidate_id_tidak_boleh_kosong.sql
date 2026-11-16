-- 060_candidate_id_tidak_boleh_kosong.sql
--
-- Mengisi nomor kandidat yang hilang, lalu memaksa kolomnya tidak pernah kosong.
--
-- KENAPA
--   Pendaftaran mandiri (`surfaces/auth.ts` → `registerKandidat`) menyimpan baris
--   `database_candidate` TANPA `id_kandidat`. Tidak ada satu pun error: pembaca
--   `_lib/db/candidates.ts:52` memakai `pick(row, ['id_kandidat', 'id', …])`,
--   jadi kolom ID Kandidat di tabel admin menampilkan `id` numerik — "632" —
--   angka yang terlihat sah dan karena itu tidak ada yang memeriksanya.
--
--   TERUKUR 2026-11-14 di produksi sebelum perbaikan:
--     · 2 baris tanpa id_kandidat (2026-11-05 dan 2026-11-14)
--     · keduanya punya password (jalur daftar), tanpa NIK/foto/job
--     · 263 baris lain terisi, seluruhnya berformat ASJ#####
--     · tidak ada satu pun baris ber-ID non-ASJ
--   Kedua baris itu juga tidak punya kembaran di `master_database_candidate`,
--   jadi tidak ada ID lain yang harus direkonsiliasi — cukup satu nomor baru
--   per baris.
--
-- KENAPA DI DATABASE, BUKAN HANYA DI KODE
--   Perbaikan di `registerKandidat` menutup jalur yang diketahui hari ini. Ia
--   tidak menutup jalur KETIGA yang belum ada — dan cacat ini justru lahir
--   karena satu jalur dari dua jalur tulis melewatkan kolomnya. Trigger di sini
--   membuat keadaan "kandidat tanpa nomor" mustahil disimpan, siapa pun
--   penulisnya: kode aplikasi, SQL manual, atau impor.
--
--   Konsekuensi yang disengaja: INSERT yang melewatkan `id_kandidat` TIDAK
--   gagal — ia mendapat nomor. Baris yang nomornya sudah ada tidak berubah,
--   jadi kode yang mengalokasikan lebih dulu (`applications/service.ts:122`)
--   tetap memakai nomornya sendiri.
--
-- AMAN DITERAPKAN SEBELUM ATAU SESUDAH DEPLOY
--   Trigger mengisi nilai yang hilang, jadi kode LAMA (yang belum mengirim
--   `id_kandidat`) tetap berhasil setelah migrasi ini. Ini kebalikan dari
--   urutan biasa "migrasi dulu, kode kemudian" — di sini tidak ada kolom baru
--   yang dibaca kode, hanya invariant yang ditegakkan.

-- ── 1. Isi nomor yang hilang ────────────────────────────────────────────────
-- Urut `id` supaya hasilnya deterministik dan bisa direproduksi di lingkungan
-- lain (nomor yang diberikan = urutan baris, bukan urutan acak planner).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.database_candidate
    WHERE id_kandidat IS NULL OR btrim(id_kandidat) = ''
    ORDER BY id
  LOOP
    UPDATE public.database_candidate
    SET id_kandidat = 'ASJ' || lpad(nextval('public.candidate_id_seq')::text, 5, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

-- ── 2. Trigger: nomor kosong diisi saat ditulis ─────────────────────────────
CREATE OR REPLACE FUNCTION public.isi_id_kandidat() RETURNS trigger AS $$
BEGIN
  IF NEW.id_kandidat IS NULL OR btrim(NEW.id_kandidat) = '' THEN
    NEW.id_kandidat := 'ASJ' || lpad(nextval('public.candidate_id_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_isi_id_kandidat ON public.database_candidate;
CREATE TRIGGER trg_isi_id_kandidat
  BEFORE INSERT OR UPDATE ON public.database_candidate
  FOR EACH ROW EXECUTE FUNCTION public.isi_id_kandidat();

-- ── 3. Invariant: kolomnya tidak boleh kosong sama sekali ───────────────────
-- Trigger di atas sudah menjamin ini untuk setiap tulisan; constraint membuat
-- jaminannya berlaku juga bila trigger suatu saat dilepas atau dinonaktifkan.
ALTER TABLE public.database_candidate
  DROP CONSTRAINT IF EXISTS database_candidate_id_kandidat_isi;
ALTER TABLE public.database_candidate
  ADD CONSTRAINT database_candidate_id_kandidat_isi
  CHECK (id_kandidat IS NOT NULL AND btrim(id_kandidat) <> '');
