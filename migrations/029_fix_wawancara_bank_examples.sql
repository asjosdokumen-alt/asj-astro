-- =============================================================================
-- 2026-10-31 — Migration 029: perbaikan 6 contoh jawaban bank wawancara
-- -----------------------------------------------------------------------------
-- MASALAH YANG DIKUNCI
--   `wawancara_soal.jawaban_*` bukan hiasan: kalau siswa belum mengisi
--   jawabannya sendiri di Bank Soal, kolom inilah yang dipakai sebagai ACUAN
--   PENILAIAN (lihat `acuanUntuk` di SimulasiMensetsu.tsx). Contoh jawaban yang
--   salah karena itu bukan cacat kosmetik — ia langsung menurunkan nilai siswa
--   yang menjawab dengan benar, karena bigram acuannya tidak ada di ucapannya.
--
--   Enam baris diperbaiki di sini, semuanya hasil pemeriksaan manual atas bank
--   177 soal. Yang penting: TIDAK ADA pertanyaan yang diubah. Yang salah adalah
--   contoh jawabannya (dan tiga terjemahannya), bukan soalnya.
--
-- KENAPA MIGRASI BARU, BUKAN MENYUNTING 021
--   021 sudah tercatat di `schema_migrations` dengan checksum-nya. Menyunting
--   berkas itu akan membuat `node scripts/migrate.mjs status` melaporkan drift
--   dan `up` menolak jalan — persis yang seharusnya terjadi. Migrasi yang sudah
--   dijalankan adalah riwayat, bukan draf.
--
-- NILAI LAMA DICATAT DI SINI SUPAYA BISA DIBALIK
--   Tiap blok menyebut nilai sebelumnya. Kalau perbaikan ini ternyata salah,
--   rollback-nya adalah UPDATE dengan nilai lama itu — bukan menebak.
--
-- SIFAT: aditif & idempoten. UPDATE … WHERE kode = … tidak menyentuh baris lain,
-- dan menjalankannya dua kali menghasilkan keadaan yang sama.
-- =============================================================================

BEGIN;

-- ── ms-003 · tanggal lahir ───────────────────────────────────────────────────
-- MASALAH: jawabannya berbunyi "tahun… bulan… tanggal…" TANPA ANGKA
--   (せんきゅうひゃくきゅうじゅうねんがつにちです), dan terjemahannya masih
--   memuat placeholder [Bulan] [Tanggal] 19[Tahun] yang tidak pernah diisi.
--   Siswa yang meniru contoh ini akan menjawab pertanyaan "kapan tanggal
--   lahir Anda" tanpa menyebut tanggal.
-- LAMA: jp = せんきゅうひゃくきゅうじゅうねんがつにちです。
--       romaji = sen kyuuhyaku kyuujuu nen gatsu nichi desu.
--       arti = Tanggal lahir saya adalah [Bulan] [Tanggal], 19[Tahun].
UPDATE public.wawancara_soal SET
  jawaban_jp     = 'せんきゅうひゃくきゅうじゅうはちねん、ごがつ、にじゅうさんにちです。',
  jawaban_romaji = 'sen kyuuhyaku kyuujuu hachi nen, gogatsu, nijuu sannichi desu.',
  jawaban_arti   = 'Tanggal lahir saya 23 Mei 1998 — ganti dengan tanggal lahir Anda sendiri.',
  updated_at     = now()
WHERE kode = 'ms-003';

-- ── ms-063 · sertifikat JLPT / JFT ──────────────────────────────────────────
-- MASALAH: ditanya "apakah Anda punya JLPT atau JFT?", jawabannya "supaya lulus
--   tes saya belajar tiap hari" — tidak menjawab punya atau tidak. Pertanyaan
--   tertutup (ya/tidak) dijawab dengan rencana belajar.
-- LAMA: jp = はい、日本語のテストに合格するために、毎日漢字や会話の勉強をしています。
--       romaji = hai, nihongo no tesuto ni goukaku suru tame ni, mainichi kanji ya kaiwa no benkyou o shite imasu.
--       arti = Ya, untuk lulus tes bahasa Jepang, setiap hari saya belajar kanji dan percakapan.
UPDATE public.wawancara_soal SET
  jawaban_jp     = 'いいえ、まだ持っていません。今、JFTベーシックに合格するために毎日勉強しています。',
  jawaban_romaji = 'iie, mada motte imasen. ima, JFT beeshikku ni goukaku suru tame ni mainichi benkyou shite imasu.',
  jawaban_arti   = 'Belum, saya belum memilikinya. Sekarang saya belajar setiap hari untuk lulus JFT-Basic.',
  updated_at     = now()
WHERE kode = 'ms-063';

-- ── ms-107 · hal di luar pekerjaan ──────────────────────────────────────────
-- MASALAH: terjemahan pertanyaannya salah. 仕事以外のこと = "hal-hal di luar
--   pekerjaan", bukan "hal yang tidak terduga". Pertanyaan yang salah terjemahan
--   membuat siswa menyiapkan jawaban untuk pertanyaan yang tidak ditanyakan.
-- LAMA: arti = Jika pergi ke Jepang, apakah ingin melakukan hal yang tidak terduga/di luar dugaan?
UPDATE public.wawancara_soal SET
  arti       = 'Jika pergi ke Jepang, apakah Anda juga ingin melakukan hal-hal di luar pekerjaan?',
  updated_at = now()
WHERE kode = 'ms-107';

-- ── ms-130 · atlet favorit ──────────────────────────────────────────────────
-- MASALAH: nama di katakana dan nama di terjemahan adalah DUA ORANG BERBEDA
--   (アルナ・サワト・プレタ vs "Arhan Pratama"), dan kalimat alasannya memakai
--   きょうてきに (強敵 = "lawan kuat") yang tidak nyambung dengan "berjuang
--   gigih". Contoh yang menyebut nama keliru akan dihafalkan apa adanya.
-- LAMA: jp = サッカーのアルナ・サワト・プレタせんしゅがすきです。きょうてきにがんばっているからです。
--       romaji = sakkaa no aruna sawato pureta senshu ga suki desu. kyouteki ni ganbatte iru kara desu.
--       arti = Saya menyukai pemain sepak bola Arhan Pratama. Karena dia berjuang dengan gigih.
UPDATE public.wawancara_soal SET
  jawaban_jp     = 'サッカーのアルハン・プラタマせんしゅがすきです。チームのために一生懸命がんばっているからです。',
  jawaban_romaji = 'sakkaa no aruhan puratama senshu ga suki desu. chiimu no tame ni isshoukenmei ganbatte iru kara desu.',
  jawaban_arti   = 'Saya menyukai pemain sepak bola Arhan Pratama. Karena dia berjuang keras untuk timnya.',
  updated_at     = now()
WHERE kode = 'ms-130';

-- ── ms-159 · puasa ──────────────────────────────────────────────────────────
-- MASALAH: 毎年 (maitoshi) berarti "setiap TAHUN", terjemahannya menulis
--   "setiap hari". Untuk pertanyaan tentang puasa, salah ini mengubah makna
--   jawabannya: puasa tahunan (Ramadan) vs puasa harian.
-- LAMA: arti = Ya, karena saya sudah mengalaminya setiap hari, kondisi tubuh saya tidak masalah.
UPDATE public.wawancara_soal SET
  jawaban_arti = 'Ya, karena saya sudah mengalaminya setiap tahun, kondisi tubuh saya tidak masalah.',
  updated_at   = now()
WHERE kode = 'ms-159';

-- ── ms-164 · makanan Jepang ─────────────────────────────────────────────────
-- MASALAH: romaji jawabannya berakhir "arimasuka" — bentuk TANYA di dalam
--   kalimat pernyataan. Siswa yang membaca romaji ini akan mengucapkan jawaban
--   sebagai pertanyaan balik ke pewawancara.
-- LAMA: romaji = hai, indonesia no nihon ryouriten de raamen ya sushi o tabeta koto ga arimasuka. totemo oishikatta desu.
UPDATE public.wawancara_soal SET
  jawaban_romaji = 'hai, indonesia no nihon ryouriten de raamen ya sushi o tabeta koto ga arimasu. totemo oishikatta desu.',
  updated_at     = now()
WHERE kode = 'ms-164';

COMMIT;
