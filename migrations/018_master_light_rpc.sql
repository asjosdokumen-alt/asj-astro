-- Migration: 018 — RPC `master_light(wa_list text[])`
--
-- APA YANG DIPERBAIKI
--   Empat field identitas (gender/usia/tb/bb) di jalur "biodata" SENYAP menjadi
--   null. Kolom `master_database_candidate.ai_data_json` bertipe **`text`**
--   (dua tabel lain — `ai_form_submissions`, `database_asj_form` — sudah jsonb),
--   sementara proyeksi `MASTER_LIGHT_COLS` meminta sub-objeknya lewat JSON-path
--   PostgREST:
--
--     ai_gender:ai_data_json->identitas->gender
--
--   PostgREST tidak bisa men-cast `text` di dalam `select` (diuji: menulis
--   `::jsonb` eksplisit dijawab 400 PGRST100), dan jawaban untuk bentuk di atas
--   adalah **HTTP 200 dengan nilai `null`** — bukan error. Di lapisan SQL pun
--   operasinya tidak ada: `select ai_data_json -> 'identitas'` pada kolom text
--   gagal dengan "operator does not exist: text -> unknown". Jadi baris yang
--   MEMANG punya `{"identitas":{"gender":"Laki-laki","umur":"19"}}` terbaca
--   kosong, dan `buildBioFromMaster()` menyalin kekosongan itu ke dossier
--   profil, prefill form, dan unduhan biodata.
--
-- TERUKUR 2026-10-20 atas DB Neon langsung (pg, bukan REST):
--   • information_schema: `ai_data_json` = `text` (234 baris).
--   • 56 dari 234 baris punya `identitas.gender` DAN `identitas.umur` yang
--     seharusnya terbaca; `tb`/`bb` 0 baris (jadi dua alias itu memang selalu
--     null — RPC-nya tetap ada supaya bentuknya tunggal, bukan dua).
--   • SEMUA 234 nilai berhasil di-cast `::jsonb` (0 teks invalid, 0 teks yang
--     tidak berbentuk JSON) — cast di dalam SQL aman untuk data yang ADA, dan
--     `->>` mengembalikan null, bukan error, untuk baris tanpa sub-objek itu.
--   • `no_wa` punya UNIQUE INDEX (`master_database_candidate_no_wa_key`), jadi
--     `= ANY (wa_list)` ter-index — biaya RPC sama dengan `in.(...)` PostgREST.
--
-- KENAPA OPSI A (RPC), BUKAN B ATAU C — sudah diputuskan pemilik 2026-10-20
--   A. RPC dengan cast `::jsonb` di dalam SQL  ← berkas ini
--   B. Kolom generated `ai_identitas jsonb`  — cadangan kalau nanti butuh index
--      atas path JSON-nya.
--   C. `ALTER COLUMN ai_data_json TYPE jsonb` — PALING BERBAHAYA: 8+ call site
--      menulis `JSON.stringify(...)` dan membaca `typeof raw === 'string'`
--      (contexts/master-data/service.ts, contexts/ingestion/service.ts,
--      _lib/ai/cv.ts). Mengubah tipe kolom membuat data bisa tersimpan sebagai
--      JSON-string dan pembaca lama jadi buta.
--   A paling tidak invasif: kontrak tulis/read TIDAK berubah, yang berubah hanya
--   satu pembacaan — dan itu bisa diuji.
--
-- KONTRAK (juga dipaku oleh e2e/master-light-rpc.test.ts):
--   • argumen `wa_list text[]` — daftar WA yang SUDAH dinormalisasi
--     (`normalizeWa`), sama seperti argumen `no_wa=in.(...)` sebelumnya.
--   • hasil: 24 kolom ringan yang sama seperti MASTER_LIGHT_COLS (tanpa
--     empat alias JSON-path), PLUS empat field `ai_gender/ai_umur/ai_tb/ai_bb`
--     yang kini benar-benar terisi.
--   • `LIMIT 500` — batas yang sama dengan proyeksi PostgREST sebelumnya.
--   • `STABLE` dan `PARALLEL SAFE`: hanya membaca satu tabel.
--
-- KEAMANAN — TIDAK ada `GRANT EXECUTE ... TO anon` (beda dari 009, yang
-- memang dikonsumsi worker):
--   • fungsi ini dibaca data pribadi kandidat, dan RLS `master_own_wa`
--     (migrasi 012) sudah membuat anon membaca 0 baris dari tabel ini.
--   • runtime memanggilnya dengan SERVICE role key, yang otomatis punya
--     EXECUTE. Memberi anon hak eksekusi akan menambah permukaan PII tanpa
--     satu pun pemanggil yang membutuhkannya.
--   • Fungsi ini SECURITY INVOKER (default) — ia TIDAK mem-bypass RLS.

CREATE OR REPLACE FUNCTION public.master_light(wa_list text[])
RETURNS TABLE (
  id bigint,
  id_kandidat text,
  nama_lengkap text,
  no_wa text,
  kk_url text,
  ijazah_sd_url text,
  ijazah_smp_url text,
  ijazah_sma_url text,
  univ_url text,
  ktp_url text,
  email text,
  tempat_lahir text,
  tgl_lahir text,
  alamat_lengkap text,
  no_coe text,
  exp_pasport text,
  no_paspor text,
  kota_terbit_pasport text,
  tgl_terbit_pasport text,
  keluarga_1_nama text,
  pekerjaan_1_nama_perusahaan text,
  gender text,
  usia text,
  tb text,
  bb text,
  ai_gender text,
  ai_umur text,
  ai_tb text,
  ai_bb text
)
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT
    m.id::bigint,
    m.id_kandidat,
    m.nama_lengkap,
    m.no_wa,
    m.kk_url,
    m.ijazah_sd_url,
    m.ijazah_smp_url,
    m.ijazah_sma_url,
    m.univ_url,
    m.ktp_url,
    m.email,
    m.tempat_lahir,
    m.tgl_lahir,
    m.alamat_lengkap,
    m.no_coe,
    m.exp_pasport,
    m.no_paspor,
    m.kota_terbit_pasport,
    m.tgl_terbit_pasport,
    m.keluarga_1_nama,
    m.pekerjaan_1_nama_perusahaan,
    m.gender,
    m.usia,
    m.tb,
    m.bb,
    -- INI perbaikannya: cast `::jsonb` di dalam SQL. PostgREST tidak bisa
    -- melakukannya di dalam `select` (400 PGRST100), dan `->>` mengembalikan
    -- null untuk baris yang tidak punya sub-objek — bukan error.
    (m.ai_data_json::jsonb -> 'identitas' ->> 'gender') AS ai_gender,
    (m.ai_data_json::jsonb -> 'identitas' ->> 'umur')   AS ai_umur,
    (m.ai_data_json::jsonb -> 'identitas' ->> 'tb')     AS ai_tb,
    (m.ai_data_json::jsonb -> 'identitas' ->> 'bb')     AS ai_bb
  FROM public.master_database_candidate m
  WHERE m.no_wa = ANY (wa_list)
  LIMIT 500;
$$;
