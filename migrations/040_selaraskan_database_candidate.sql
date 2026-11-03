-- 040_selaraskan_database_candidate.sql
--
-- Menyelaraskan kolom CV yang DIDUPLIKASI di `database_candidate` dengan
-- `master_database_candidate` (master = sumber kebenaran).
--
-- KENAPA
--   Pemilik 2026-11-03: *"benerin itinya semua uniq db sehingga nanti edit
--   dimanapun hasil 1 gak beda beda tiap buka modal beda beda"*.
--
--   `database_candidate` bukan duplikat murni: ia punya 14 kolom yang TIDAK ada
--   di master (status_kandidat, tahapan_seleksi, password_*, catatan_*, …) —
--   itu sah dan harus tetap di sana. Yang bermasalah adalah **17 kolom CV yang
--   disalin**, dan salinannya sudah menyimpang. Terukur pada 260 baris yang
--   cocok `no_wa`:
--
--     jft 95 · ssw 89 · nik 39 · folder_url 36 · gender 26 · pas_photo 19
--     tgl_lahir 14 · tb 11 · bb 10 · tempat_lahir 8 · usia 7 · file_cv 2
--     id_kandidat 2 · nama_lengkap 2 · alamat_lengkap 1
--     ── total 361 sel di 15 kolom
--
--   Itu sebabnya dua modal bisa menampilkan nilai berbeda untuk orang yang sama:
--   satu membaca master, satu membaca salinan.
--
-- ATURAN
--   • Master MENANG. Kolom master yang KOSONG tidak menimpa salinan — nilai yang
--     hanya ada di salinan (mis. unggahan lama lewat jalur dokumen) tetap utuh
--     sampai master diisi.
--   • `no_wa` dilewati: itu kunci penggabung, bukan data.
--   • Idempoten.
--
-- CATATAN: ini menyelaraskan DATA. Jaminan agar tidak menyimpang LAGI adalah
-- satu jalur tulis (master) — pekerjaan kode berikutnya, bukan migrasi ini.

DO $$
DECLARE
  kolom text[] := ARRAY[
    'alamat_lengkap','bb','email','file_cv','folder_url','gender','id_kandidat',
    'jft','nama_lengkap','nik','pas_photo','ssw','tb','tempat_lahir','tgl_lahir','usia'
  ];
  k text;
  n integer;
  total integer := 0;
BEGIN
  FOREACH k IN ARRAY kolom LOOP
    EXECUTE format($f$
      UPDATE public.database_candidate d
         SET %1$I = m.%1$I
        FROM public.master_database_candidate m
       WHERE m.no_wa = d.no_wa
         AND COALESCE(btrim(m.%1$I::text), '') <> ''
         AND COALESCE(btrim(m.%1$I::text), '') <> COALESCE(btrim(d.%1$I::text), '')
    $f$, k);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    IF n > 0 THEN
      RAISE NOTICE 'selaras %: % baris', k, n;
    END IF;
  END LOOP;
  RAISE NOTICE 'total baris diselaraskan: %', total;
END $$;
