-- 038_selaraskan_ai_data_json.sql
--
-- Menyelaraskan `ai_data_json.identitas.*` dengan KOLOM untuk field identitas
-- yang kolomnya terisi.
--
-- KENAPA
--   Pemilik 2026-11-03: *"profil vs cv ai vs edit vs apalah modul sering kok data
--   muncul tenggelam"*. Akarnya sudah diperbaiki di kode (klien kini mengikuti
--   aturan server: KOLOM MENANG, AI hanya mengisi yang kosong). Tapi
--   PENYIMPANANNYA masih dua salinan yang berbeda — terukur:
--
--     alamat_lengkap      45 dari 48 baris berbeda
--     tgl_lahir           25 dari 50
--     status_pernikahan   12 dari 48
--     no_wa                9 dari 58
--     agama                5 dari 49
--     golongan_darah       4 dari 47
--     nama_lengkap         3 dari 58
--
--   Kolom menyimpan versi yang benar (alamat lengkap ber-kode pos); JSON
--   menyimpan hasil ekstraksi lama. Selama keduanya berbeda, siapa pun yang
--   membaca JSON LANGSUNG akan melihat versi lama — dan itulah bentuk "data
--   tenggelam" yang dikeluhkan.
--
-- ATURAN
--   • Hanya field yang KOLOMNYA TERISI yang ditimpa ke JSON. Kolom kosong
--     dibiarkan: JSON justru cadangan untuk kolom kosong, jadi mengosongkannya
--     akan menghapus satu-satunya nilai yang tersisa.
--   • Idempoten — menjalankan ulang tidak mengubah apa pun lagi.
--   • `ai_data_json` bertipe TEXT yang memuat JSON, jadi dicor ke jsonb lalu
--     dikembalikan ke text.
--
-- CADANGAN: 58 baris `ai_data_json` disalin ke berkas JSON di luar repo sebelum
-- migrasi ini dijalankan.

UPDATE public.master_database_candidate m
   SET ai_data_json = (
         jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       m.ai_data_json::jsonb,
                       '{identitas,alamat}',
                       to_jsonb(COALESCE(NULLIF(btrim(m.alamat_lengkap), ''), m.ai_data_json::jsonb->'identitas'->>'alamat')),
                       true
                     ),
                     '{identitas,nama_lengkap}',
                     to_jsonb(COALESCE(NULLIF(btrim(m.nama_lengkap), ''), m.ai_data_json::jsonb->'identitas'->>'nama_lengkap')),
                     true
                   ),
                   '{identitas,tgl_lahir}',
                   to_jsonb(COALESCE(NULLIF(btrim(m.tgl_lahir::text), ''), m.ai_data_json::jsonb->'identitas'->>'tgl_lahir')),
                   true
                 ),
                 '{identitas,agama}',
                 to_jsonb(COALESCE(NULLIF(btrim(m.agama), ''), m.ai_data_json::jsonb->'identitas'->>'agama')),
                 true
               ),
               '{identitas,golongan_darah}',
               to_jsonb(COALESCE(NULLIF(btrim(m.golongan_darah), ''), m.ai_data_json::jsonb->'identitas'->>'golongan_darah')),
               true
             ),
             '{identitas,status_nikah}',
             to_jsonb(COALESCE(NULLIF(btrim(m.status_pernikahan), ''), m.ai_data_json::jsonb->'identitas'->>'status_nikah')),
             true
           ),
           '{identitas,hp}',
           to_jsonb(COALESCE(NULLIF(btrim(m.no_wa), ''), m.ai_data_json::jsonb->'identitas'->>'hp')),
           true
         )
       )::text
 WHERE m.ai_data_json IS NOT NULL
   AND m.ai_data_json <> '-'
   AND m.ai_data_json LIKE '{%';
