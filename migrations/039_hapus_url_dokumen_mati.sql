-- 039_hapus_url_dokumen_mati.sql
--
-- Menghapus rujukan ke 6 dokumen yang OBJEKNYA TIDAK ADA di Storage.
--
-- KENAPA DIHAPUS (keputusan pemilik 2026-11-03: *"6 URL dokumen hapus saja yg
-- emang rusak"*)
--   Keenam URL ini menunjuk objek yang tidak pernah berhasil diunggah. Folder
--   `master/UJI_FIX2_3968/` dan `master/TEST_DEDUP_MAIL/` KOSONG di bucket
--   (diperiksa lewat Storage list API), dan `master/AGUS_KHOCI/KTP.jpg` tidak
--   ada. Selama rujukannya tinggal, pratinjau dokumen berakhir di HTTP 400 —
--   dan itu terlihat seperti "preview rusak", padahal berkasnya memang tidak
--   pernah ada.
--
--   Menghapus rujukan TIDAK menghilangkan data lain: kolomnya kembali kosong,
--   sama seperti kandidat yang belum mengunggah dokumen itu. Kalau berkasnya
--   nanti diunggah ulang, kolomnya terisi lagi dengan URL yang benar.
--
-- Semuanya baris UJI (`UJI_FIX2_3968`, `TEST_DEDUP_MAIL`, `AGUS_KHOCI`).

UPDATE public.pemberkasan_checklist
   SET pasport_url = NULL
 WHERE id = 6
   AND pasport_url = 'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/master/UJI_FIX2_3968/PASPORT_UJI%20FIX2%203968_1786447786521.pdf';

UPDATE public.pemberkasan_checklist
   SET kontrak_url = NULL
 WHERE id = 6
   AND kontrak_url = 'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/master/UJI_FIX2_3968/KONTRAK_KERJA_UJI%20FIX2%203968_1786447797795.pdf';

UPDATE public.pemberkasan_checklist
   SET ktp_url = NULL
 WHERE id = 6
   AND ktp_url = 'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/master/UJI_FIX2_3968/KTP_UJI%20FIX2%203968_1786447786031.jpg';

UPDATE public.pemberkasan_checklist
   SET kk_url = NULL
 WHERE id = 16
   AND kk_url = 'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/master/TEST_DEDUP_MAIL/KARTU_KELUARGA.jpg';

UPDATE public.pemberkasan_checklist
   SET ktp_url = NULL
 WHERE id = 16
   AND ktp_url = 'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/master/TEST_DEDUP_MAIL/KTP.jpg';

UPDATE public.master_database_candidate
   SET ktp_url = NULL
 WHERE id = 40
   AND ktp_url = 'https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/master/AGUS_KHOCI/KTP.jpg';

-- Penjaga: tidak boleh ada lagi rujukan ke Supabase Storage.
DO $$
DECLARE
  n INTEGER := 0;
  r RECORD;
  hit INTEGER;
BEGIN
  FOR r IN
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type IN ('text', 'character varying')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE %I LIKE %L', r.table_name, r.column_name, '%supabase.co/storage%'
    ) INTO hit;
    n := n + hit;
  END LOOP;
  IF n > 0 THEN
    RAISE EXCEPTION 'Masih ada % sel yang menunjuk Supabase Storage', n;
  END IF;
END $$;
