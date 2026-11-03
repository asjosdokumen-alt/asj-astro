-- 041_cermin_master_ke_database_candidate.sql
--
-- JAMINAN: setiap tulisan ke `master_database_candidate` langsung dicerminkan ke
-- 17 kolom CV yang DIDUPLIKASI di `database_candidate`, dalam transaksi yang sama.
--
-- KENAPA TRIGGER, BUKAN VIEW
--   Pemilik 2026-11-03: *"kedepannya bisa uniq mau edit di manapun buka di modal
--   apapun datanya sama"*.
--
--   Mengubah `database_candidate` menjadi VIEW akan memaksa SEMUA penulisan ke
--   17 kolom itu ditolak (view read-only tanpa INSTEAD OF trigger), dan ada 5
--   titik tulis di `contexts/documents` + pembacaan di `contexts/identity` yang
--   harus diubah serentak. Itu perubahan besar dengan risiko memutus alur
--   pendaftaran — padahal masalahnya lebih sempit: SALINAN tidak ikut berubah
--   ketika master berubah.
--
--   Trigger ini menutup tepat celah itu: sumber kebenaran tetap master, dan
--   salinan tidak bisa tertinggal. Penulisan langsung ke salinan (jalur dokumen)
--   tetap sah dan tetap ditulis ke master oleh jalur yang sama, jadi keduanya
--   bertemu di nilai yang sama.
--
-- ATURAN
--   • Hanya kolom yang nilainya di master TIDAK KOSONG yang dicerminkan. Nilai
--     yang hanya ada di salinan (unggahan lama) tidak dihapus.
--   • Pemetaan nama berbeda untuk dua kolom: `jft_url`→`jft`, `ssw_url`→`ssw`.
--   • `no_wa` adalah kunci penggabung, tidak dicerminkan.
--   • SECURITY DEFINER + search_path tetap: trigger berjalan sebagai pemilik
--     fungsi supaya tidak bergantung pada peran pemanggil.
--
-- Sebelum migrasi ini, migrasi 040 sudah menyelaraskan data yang terlanjur
-- menyimpang (361 sel di 15 kolom) — trigger menjaga agar tidak terulang.

CREATE OR REPLACE FUNCTION public.cermin_master_ke_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.database_candidate d
     SET alamat_lengkap = COALESCE(NULLIF(btrim(NEW.alamat_lengkap), ''), d.alamat_lengkap),
         bb             = COALESCE(NULLIF(btrim(NEW.bb::text), ''), d.bb),
         email          = COALESCE(NULLIF(btrim(NEW.email), ''), d.email),
         file_cv        = COALESCE(NULLIF(btrim(NEW.file_cv), ''), d.file_cv),
         folder_url     = COALESCE(NULLIF(btrim(NEW.folder_url), ''), d.folder_url),
         gender         = COALESCE(NULLIF(btrim(NEW.gender), ''), d.gender),
         id_kandidat    = COALESCE(NULLIF(btrim(NEW.id_kandidat), ''), d.id_kandidat),
         jft            = COALESCE(NULLIF(btrim(NEW.jft_url), ''), d.jft),
         nama_lengkap   = COALESCE(NULLIF(btrim(NEW.nama_lengkap), ''), d.nama_lengkap),
         nik            = COALESCE(NULLIF(btrim(NEW.nik), ''), d.nik),
         pas_photo      = COALESCE(NULLIF(btrim(NEW.pas_photo), ''), d.pas_photo),
         ssw            = COALESCE(NULLIF(btrim(NEW.ssw_url), ''), d.ssw),
         tb             = COALESCE(NULLIF(btrim(NEW.tb::text), ''), d.tb),
         tempat_lahir   = COALESCE(NULLIF(btrim(NEW.tempat_lahir), ''), d.tempat_lahir),
         tgl_lahir      = COALESCE(NULLIF(btrim(NEW.tgl_lahir::text), ''), d.tgl_lahir),
         usia           = COALESCE(NULLIF(btrim(NEW.usia::text), ''), d.usia)
   WHERE d.no_wa = NEW.no_wa;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cermin_master_ke_candidate ON public.master_database_candidate;
CREATE TRIGGER trg_cermin_master_ke_candidate
  AFTER INSERT OR UPDATE ON public.master_database_candidate
  FOR EACH ROW
  EXECUTE FUNCTION public.cermin_master_ke_candidate();
