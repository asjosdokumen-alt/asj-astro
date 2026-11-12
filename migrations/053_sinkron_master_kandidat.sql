-- 053_sinkron_master_kandidat.sql
--
-- Memperbaiki SUMBER dari 311 sel yang menyimpang antara
-- `master_database_candidate` dan `database_candidate`, lalu menyelaraskan
-- datanya sekali.
--
-- KENAPA (terukur 2026-11-12, baca-saja ke produksi)
-- -------------------------------------------------------------------------
--   tb 56 · bb 57 · usia 39 · folder_url 36 · tempat_lahir 29 · tgl_lahir 26
--   pas_photo 14 · jft_url 9 · ssw_url 9 · email 9 · gender 9 · nik 7
--   alamat_lengkap 4 · no_paspor 3 · nama_lengkap 2 · file_cv 2
--   ── total 311 sel di 16 kolom
--
-- Migrasi 040 dan 045 SUDAH menyelaraskan data ini. Ia kembali menyimpang,
-- jadi penyebabnya masih hidup. Tiga cacat trigger 041:
--
--  1. `COALESCE(NULLIF(NEW.x,''), d.x)` — master yang DIKOSONGKAN tidak pernah
--     mengosongkan salinan. Admin menghapus TB di Form Master, modal tetap
--     menampilkan angka lama sementara CV mencetak kosong. (Migrasi 045 sendiri
--     sudah mencatat ini sebagai penyebab 70 sel, tetapi hanya datanya yang
--     ditambal.)
--  2. Tidak ada cabang untuk baris salinan yang BELUM ADA. `INSERT` master
--     sebelum baris kandidat dibuat ⇒ `UPDATE … WHERE no_wa = NEW.no_wa`
--     mengenai 0 baris, tanpa error. Terukur pada ASJ00104: master berisi
--     tb/bb/usia, salinan kosong.
--  3. Menggabung dengan `no_wa` MENTAH. Aplikasi menormalkan (`628…` ↔ `0…`),
--     trigger tidak. ASJ00222: master `622342782945`, salinan `62822342945` —
--     satu digit `8` hilang di master, dan salinannya beku permanen.
--
-- Selain itu trigger tidak menaikkan `updated_at` salinan, sehingga urutan
-- daftar admin dan delta sync tidak melihat perubahan yang datang dari master.
--
-- ATURAN BARU (satu aturan, bukan tiga)
-- -------------------------------------------------------------------------
--  • Yang dicerminkan hanya kolom yang MEMANG BERUBAH di tulisan ini
--    (`IS DISTINCT FROM OLD`). Jadi:
--      - mengosongkan kolom di master ⇒ salinan ikut kosong  (cacat 1 hilang)
--      - tulisan yang tidak menyentuh kolom itu ⇒ salinan TIDAK disentuh,
--        sehingga nilai yang hanya ada di salinan tidak ikut terhapus.
--  • `nama_lengkap` dan `id_kandidat` tidak pernah dikosongkan: keduanya
--    identitas baris, dan mengosongkannya merusak tampilan tanpa memberi tahu.
--  • Penggabung: `id_kandidat` bila ada, kalau tidak `no_wa` yang dinormalkan.
--  • `updated_at` salinan dinaikkan.
--
-- IDEMPOTEN: dijalankan dua kali, perintah kedua menemukan 0 sel yang berbeda
-- dan 0 baris yang perlu digabung ulang.

-- ── 1. Normalisasi WA yang dipakai bersama trigger & rekonsiliasi ───────────
-- `0…` → `62…` (Indonesia). Bentuk lain dibiarkan: menebak lebih berbahaya
-- daripada tidak mencocokkan — baris yang tidak cocok akan terlihat sebagai
-- selisih, bukan sebagai nilai yang salah.
CREATE OR REPLACE FUNCTION public.asj_norm_wa(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN d = '' THEN ''
           WHEN d LIKE '0%' THEN '62' || substr(d, 2)
           ELSE d
         END
    FROM (SELECT regexp_replace(coalesce(raw, ''), '\D', '', 'g') AS d) s
$$;

-- Tidak dipakai aplikasi; hanya trigger & migrasi. Jangan diekspos sebagai RPC.
REVOKE ALL ON FUNCTION public.asj_norm_wa(text) FROM PUBLIC;

-- ── 2. Perbaiki kunci gabung yang rusak ─────────────────────────────────────
-- `id_kandidat` adalah identifier yang lebih kuat daripada nomor telepon. Kalau
-- keduanya menunjuk orang yang sama tetapi WA-nya berbeda, WA salinan yang
-- dipakai — dengan syarat belum ada baris master lain yang memakainya (ada
-- UNIQUE index pada no_wa).
UPDATE public.master_database_candidate m
   SET no_wa = d.no_wa
  FROM public.database_candidate d
 WHERE m.id_kandidat IS NOT NULL
   AND m.id_kandidat = d.id_kandidat
   AND public.asj_norm_wa(m.no_wa) <> public.asj_norm_wa(d.no_wa)
   AND NOT EXISTS (
         SELECT 1
           FROM public.master_database_candidate x
          WHERE public.asj_norm_wa(x.no_wa) = public.asj_norm_wa(d.no_wa)
       );

-- ── 3. Selaraskan data: salinan → master (hanya yang kosong di master) ──────
-- Arah ini DULU, supaya nilai yang selama ini hanya hidup di salinan (unggahan
-- lama, edit admin sebelum jalur tulis-balik ada) tidak terhapus oleh aturan
-- "master menang" di langkah 4.
DO $$
DECLARE
  pasangan text[][] := ARRAY[
    ['nama_lengkap','nama_lengkap'], ['nik','nik'], ['gender','gender'],
    ['usia','usia'], ['tb','tb'], ['bb','bb'], ['email','email'],
    ['tempat_lahir','tempat_lahir'], ['tgl_lahir','tgl_lahir'],
    ['alamat_lengkap','alamat_lengkap'], ['no_paspor','no_pasport'],
    ['id_kandidat','id_kandidat']
  ];
  i int;
  n int;
  total int := 0;
BEGIN
  FOR i IN 1..array_length(pasangan, 1) LOOP
    EXECUTE format($f$
      UPDATE public.master_database_candidate m
         SET %1$I = NULLIF(btrim(d.%2$I), '')
        FROM public.database_candidate d
       WHERE public.asj_norm_wa(m.no_wa) = public.asj_norm_wa(d.no_wa)
         AND NULLIF(btrim(m.%1$I), '') IS NULL
         AND NULLIF(btrim(d.%2$I), '') IS NOT NULL
    $f$, pasangan[i][1], pasangan[i][2]);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  RAISE NOTICE '053 langkah 3: % sel master diisi dari salinan', total;
END $$;

-- ── 4. Selaraskan data: master → salinan (master menang) ────────────────────
DO $$
DECLARE
  pasangan text[][] := ARRAY[
    ['nama_lengkap','nama_lengkap'], ['nik','nik'], ['gender','gender'],
    ['usia','usia'], ['tb','tb'], ['bb','bb'], ['email','email'],
    ['tempat_lahir','tempat_lahir'], ['tgl_lahir','tgl_lahir'],
    ['alamat_lengkap','alamat_lengkap'], ['no_paspor','no_pasport'],
    ['jft_url','jft'], ['ssw_url','ssw'], ['pas_photo','pas_photo'],
    ['file_cv','file_cv'], ['folder_url','folder_url'],
    ['id_kandidat','id_kandidat']
  ];
  i int;
  n int;
  total int := 0;
BEGIN
  FOR i IN 1..array_length(pasangan, 1) LOOP
    EXECUTE format($f$
      UPDATE public.database_candidate d
         SET %2$I = NULLIF(btrim(m.%1$I), '')
        FROM public.master_database_candidate m
       WHERE public.asj_norm_wa(d.no_wa) = public.asj_norm_wa(m.no_wa)
         AND NULLIF(btrim(m.%1$I), '') IS NOT NULL
         AND d.%2$I IS DISTINCT FROM NULLIF(btrim(m.%1$I), '')
    $f$, pasangan[i][1], pasangan[i][2]);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  RAISE NOTICE '053 langkah 4: % sel salinan diselaraskan dari master', total;
END $$;

-- ── 5. Trigger baru ─────────────────────────────────────────────────────────
-- `SECURITY DEFINER` + `search_path` tetap: trigger berjalan sebagai pemilik
-- fungsi, tidak bergantung pada peran pemanggil.
CREATE OR REPLACE FUNCTION public.cermin_master_ke_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    /* Baris master baru: cerminkan seluruh kolom. Kalau baris salinan belum
       ada, UPDATE mengenai 0 baris — dan itu memang satu-satunya hal yang
       boleh terjadi di sini: membuat baris `database_candidate` butuh
       password & status pendaftaran, bukan urusan trigger. */
    UPDATE public.database_candidate d
       SET alamat_lengkap = NULLIF(btrim(NEW.alamat_lengkap), ''),
           bb             = NULLIF(btrim(NEW.bb), ''),
           email          = NULLIF(btrim(NEW.email), ''),
           file_cv        = NULLIF(btrim(NEW.file_cv), ''),
           folder_url     = NULLIF(btrim(NEW.folder_url), ''),
           gender         = NULLIF(btrim(NEW.gender), ''),
           id_kandidat    = COALESCE(NULLIF(btrim(NEW.id_kandidat), ''), d.id_kandidat),
           jft            = NULLIF(btrim(NEW.jft_url), ''),
           nama_lengkap   = COALESCE(NULLIF(btrim(NEW.nama_lengkap), ''), d.nama_lengkap),
           nik            = NULLIF(btrim(NEW.nik), ''),
           pas_photo      = NULLIF(btrim(NEW.pas_photo), ''),
           ssw            = NULLIF(btrim(NEW.ssw_url), ''),
           tb             = NULLIF(btrim(NEW.tb), ''),
           tempat_lahir   = NULLIF(btrim(NEW.tempat_lahir), ''),
           tgl_lahir      = NULLIF(btrim(NEW.tgl_lahir), ''),
           usia           = NULLIF(btrim(NEW.usia), ''),
           updated_at     = now()
     WHERE public.asj_norm_wa(d.no_wa) = public.asj_norm_wa(NEW.no_wa)
        OR (NEW.id_kandidat IS NOT NULL AND d.id_kandidat = NEW.id_kandidat);
    RETURN NEW;
  END IF;

  /* UPDATE: hanya kolom yang BERUBAH. Inilah yang membuat "hapus di master"
     benar-benar menghapus di salinan, tanpa membuat tulisan yang tidak
     menyentuh sebuah kolom ikut mengosongkannya. */
  UPDATE public.database_candidate d
     SET alamat_lengkap = CASE WHEN NEW.alamat_lengkap IS DISTINCT FROM OLD.alamat_lengkap
                               THEN NULLIF(btrim(NEW.alamat_lengkap), '') ELSE d.alamat_lengkap END,
         bb             = CASE WHEN NEW.bb IS DISTINCT FROM OLD.bb
                               THEN NULLIF(btrim(NEW.bb), '') ELSE d.bb END,
         email          = CASE WHEN NEW.email IS DISTINCT FROM OLD.email
                               THEN NULLIF(btrim(NEW.email), '') ELSE d.email END,
         file_cv        = CASE WHEN NEW.file_cv IS DISTINCT FROM OLD.file_cv
                               THEN NULLIF(btrim(NEW.file_cv), '') ELSE d.file_cv END,
         folder_url     = CASE WHEN NEW.folder_url IS DISTINCT FROM OLD.folder_url
                               THEN NULLIF(btrim(NEW.folder_url), '') ELSE d.folder_url END,
         gender         = CASE WHEN NEW.gender IS DISTINCT FROM OLD.gender
                               THEN NULLIF(btrim(NEW.gender), '') ELSE d.gender END,
         id_kandidat    = COALESCE(NULLIF(btrim(NEW.id_kandidat), ''), d.id_kandidat),
         jft            = CASE WHEN NEW.jft_url IS DISTINCT FROM OLD.jft_url
                               THEN NULLIF(btrim(NEW.jft_url), '') ELSE d.jft END,
         nama_lengkap   = COALESCE(NULLIF(btrim(NEW.nama_lengkap), ''), d.nama_lengkap),
         nik            = CASE WHEN NEW.nik IS DISTINCT FROM OLD.nik
                               THEN NULLIF(btrim(NEW.nik), '') ELSE d.nik END,
         pas_photo      = CASE WHEN NEW.pas_photo IS DISTINCT FROM OLD.pas_photo
                               THEN NULLIF(btrim(NEW.pas_photo), '') ELSE d.pas_photo END,
         ssw            = CASE WHEN NEW.ssw_url IS DISTINCT FROM OLD.ssw_url
                               THEN NULLIF(btrim(NEW.ssw_url), '') ELSE d.ssw END,
         tb             = CASE WHEN NEW.tb IS DISTINCT FROM OLD.tb
                               THEN NULLIF(btrim(NEW.tb), '') ELSE d.tb END,
         tempat_lahir   = CASE WHEN NEW.tempat_lahir IS DISTINCT FROM OLD.tempat_lahir
                               THEN NULLIF(btrim(NEW.tempat_lahir), '') ELSE d.tempat_lahir END,
         tgl_lahir      = CASE WHEN NEW.tgl_lahir IS DISTINCT FROM OLD.tgl_lahir
                               THEN NULLIF(btrim(NEW.tgl_lahir), '') ELSE d.tgl_lahir END,
         usia           = CASE WHEN NEW.usia IS DISTINCT FROM OLD.usia
                               THEN NULLIF(btrim(NEW.usia), '') ELSE d.usia END,
         updated_at     = now()
   WHERE public.asj_norm_wa(d.no_wa) = public.asj_norm_wa(NEW.no_wa)
      OR (NEW.id_kandidat IS NOT NULL AND d.id_kandidat = NEW.id_kandidat);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cermin_master_ke_candidate ON public.master_database_candidate;
CREATE TRIGGER trg_cermin_master_ke_candidate
  AFTER INSERT OR UPDATE ON public.master_database_candidate
  FOR EACH ROW
  EXECUTE FUNCTION public.cermin_master_ke_candidate();
