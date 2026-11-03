-- 037_wawancara_perbaiki_soal.sql
--
-- Empat soal yang TIDAK BISA DIPAKAI atau salah tata bahasa. Ditemukan dengan
-- menyapu seluruh 177 soal (pola: placeholder, partikel dobel, kata tak baku,
-- partikel hilang), bukan dengan membaca sekilas.
--
-- KENAPA DIPERBAIKI, BUKAN DIHAPUS
--   `wawancara_jawaban` dikunci (wa, soal_kode). Menghapus soal berarti jawaban
--   siswa yang sudah tersimpan menggantung tanpa pertanyaan. Teks soal boleh
--   berubah — kodenya tetap.

-- 1) ms-094 — PLACEHOLDER
--    「どうして………をやりたいですか？」 tidak bisa dijawab: yang muncul di layar
--    adalah tiga titik. Isinya "motivasi memilih pekerjaan", jadi versi yang
--    bisa diucapkan: 「この仕事をやりたい」.
UPDATE public.wawancara_soal SET
  jp     = 'どうしてこの仕事をやりたいですか？',
  romaji = 'doushite kono shigoto o yaritai desuka?',
  arti   = 'Mengapa Anda ingin melakukan pekerjaan ini?'
WHERE kode = 'ms-094';

-- 2) ms-120 — KALIMAT TIDAK LENGKAP
--    「なんで建てたいか？」 kehilangan objeknya: "kenapa ingin membangun" apa?
--    Tetangganya (no. 17 「将来の夢がありますか」, no. 19 "10 tahun lalu pulang")
--    menunjukkan konteks impian membangun rumah — hal yang lazim ditanyakan
--    pewawancara Jepang ke kandidat. Arti lamanya pun sudah menulis "(rumah/…)".
UPDATE public.wawancara_soal SET
  jp     = 'なんで家を建てたいですか？',
  romaji = 'nande ie o tatetai desuka?',
  arti   = 'Kenapa Anda ingin membangun rumah?'
WHERE kode = 'ms-120';

-- 3) ms-121 — KATA TIDAK BAKU
--    「またじゃ、」 bukan bahasa Jepang: また (lagi) + じゃ (partikel) tidak
--    pernah berdampingan. Yang dimaksud adalah sambungan "jadi/kalau begitu"
--    = それでは. Sekalian もう一回 -> もう一度 (bentuk yang dipakai wawancara).
UPDATE public.wawancara_soal SET
  jp     = 'それでは、日本に行って10年間働いて、もう一度日本へ行きたいですか？',
  romaji = 'soredewa, nihon ni itte juunenkan hataraite, mou ichido nihon e ikitai desuka?',
  arti   = 'Jadi, setelah bekerja 10 tahun di Jepang, apakah Anda ingin pergi ke Jepang sekali lagi?'
WHERE kode = 'ms-121';

-- 4) ms-129 — PARTIKEL HILANG
--    「アニメございますか」 tidak gramatikal; アニメ butuh は (atau が) sebelum
--    ございます. 「はございますか」 adalah bentuk sopan yang benar untuk
--    menanyakan keberadaan.
UPDATE public.wawancara_soal SET
  jp     = 'にほんのすきなアニメはございますか。だれがすきですか。',
  romaji = 'nihon no sukina anime wa gozaimasu ka. dare ga suki desu ka.',
  arti   = 'Apakah ada anime Jepang yang Anda sukai? Siapa yang Anda sukai?'
WHERE kode = 'ms-129';

-- Penjaga isi: soal aktif tidak boleh memuat placeholder atau kata tak baku.
-- Dijalankan di sini supaya migrasi GAGAL kalau ada yang lolos, bukan supaya
-- diam-diam diterima.
DO $$
DECLARE
  n INTEGER;
BEGIN
  SELECT count(*) INTO n
    FROM public.wawancara_soal
   WHERE aktif AND (jp LIKE '%…%' OR jp LIKE '%またじゃ%');
  IF n > 0 THEN
    RAISE EXCEPTION 'Masih ada % soal dengan placeholder/kata tak baku', n;
  END IF;
END $$;
