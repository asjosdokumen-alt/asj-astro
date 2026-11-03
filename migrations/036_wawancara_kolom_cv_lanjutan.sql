-- 036_wawancara_kolom_cv_lanjutan.sql
--
-- Menautkan sisa kolom CV ke soal wawancara, supaya SEMUA kolom wawancara di
-- modul CV AI punya pasangan soal — bukan hanya 8 yang sudah ada.
--
-- KENAPA
--   Pemilik 2026-11-03: *"bila edit wawancara cv ai berubah bila edit cv ai
--   wawancara ikut berubah kan tertaut bukan menangin salah 1, begitu juga kolom
--   kolom di wawancara cv ai yg lain sama lah"*.
--
--   Mekanismenya sudah ada: soal ber-`kolom_cv` MEMBACA dari kolom CV dan
--   MENULIS ke kolom CV (`_lib/wawancara/bank.ts`), jadi kolom itu satu-satunya
--   penyimpanan dan tidak ada nilai yang "kalah". Yang belum: empat kolom belum
--   punya soal, sehingga kolom itu hanya bisa diisi dari sisi CV dan tidak
--   pernah muncul sebagai pertanyaan latihan.
--
-- YANG DIPETAKAN (dan alasannya)
--   ms-119 将来の夢がありますか        -> keinginan_pribadi
--           "target pribadi" di CV; pertanyaannya memang tentang cita-cita.
--   ms-115 給料はいくら欲しいですか     -> harapan_gaji_yen
--           HARAPAN gaji, bukan gaji sekarang (ms-039 「給料はいくらですか」 tetap
--           TIDAK dipetakan: itu gaji yang sedang diterima, konsep berbeda).
--           Kolom ini tidak punya pasangan `_jp`.
--   ms-094 どうして………をやりたいですか -> alasan_memilih_bidang
--           Pertanyaannya generik (ada bagian kosong yang diisi bidangnya),
--           jadi aman untuk semua bidang. SENGAJA bukan ms-098
--           「どうして飲食料品製造業を選びましたか」 — itu khusus industri makanan,
--           dan memetakannya akan menaruh "kenapa memilih industri makanan" di
--           kolom alasan seorang perawat.
--
-- YANG SENGAJA TIDAK DIPETAKAN
--   motivasi_ke_jepang — tidak ada soal yang bertanya "kenapa mau ke Jepang".
--   ms-092 「あなたが日本へ行く目的は何ですか」 sudah memetakan `tujuan_ke_jepang`,
--   dan satu soal hanya bisa menulis SATU kolom (`kolom_cv` tunggal). Menambah
--   pemetaan banyak-ke-banyak berarti mengubah skema untuk keuntungan yang tidak
--   jelas; lebih baik dibiarkan terlihat daripada dipaksa dengan soal yang salah.

UPDATE public.wawancara_soal
   SET kolom_cv = 'keinginan_pribadi', kolom_cv_jp = 'keinginan_pribadi_jp'
 WHERE kode = 'ms-119';

UPDATE public.wawancara_soal
   SET kolom_cv = 'harapan_gaji_yen', kolom_cv_jp = NULL
 WHERE kode = 'ms-115';

UPDATE public.wawancara_soal
   SET kolom_cv = 'alasan_memilih_bidang', kolom_cv_jp = 'alasan_memilih_bidang_jp'
 WHERE kode = 'ms-094';

COMMENT ON COLUMN public.wawancara_soal.kolom_cv IS
  'Kolom CV yang dibaca DAN ditulis untuk soal ini. Satu soal = satu kolom; kolom itu satu-satunya penyimpanan, jadi edit di CV atau di wawancara sama-sama terlihat di kedua tempat.';
