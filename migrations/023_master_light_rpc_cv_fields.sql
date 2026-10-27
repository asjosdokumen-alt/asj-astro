-- Migration: 023 — `master_light` membawa `pas_photo` + `pendidikan_N_tingkat`
--
-- APA YANG DIPERBAIKI
--   Migrasi 018 memaku daftar kolom `master_light` di dalam SQL. Sejak itu
--   `MASTER_LIGHT_COLS` (proyeksi TS) tumbuh enam kolom — `pas_photo` dan
--   `pendidikan_1..5_tingkat` — dan RPC-nya TIDAK ikut. Akibatnya jalur RPC
--   mengembalikan baris tanpa enam kunci itu, dan `buildBioFromMaster()`
--   menyalin kekosongan itu ke dossier profil:
--
--     terukur 2026-10-25 (ASJ00126): `pas_photo` berisi URL Cloudinary,
--     `bio.foto` tetap ''.
--
--   `netlify/functions/_lib/db/berkas.ts` menambalnya dengan SATU KUERI
--   TAMBAHAN ke seluruh tabel (500 baris, `no_wa,pas_photo,pendidikan_*`) di
--   setiap muat halaman berkas. Tambalan itu bekerja, tapi ia (a) menambah satu
--   roundtrip PostgREST di jalur terpanas panel admin, dan (b) menelan
--   kegagalannya sendiri (`catch {}`), jadi kalau kueri itu gagal foto dan
--   jenjang pendidikan hilang tanpa satu pun pesan.
--
--   Berkas ini menutup sebabnya, bukan tambalannya: RPC mengembalikan kolom
--   yang SAMA dengan `MASTER_LIGHT_COLS`, sehingga tambalan di `berkas.ts`
--   berhenti berjalan dengan sendirinya (kodenya memeriksa keberadaan kunci
--   `pas_photo` sebelum menambal — lihat komentar di sana).
--
-- KONTRAK (dipaku oleh e2e/master-light-rpc.test.ts, yang kini membaca migrasi
-- TERAKHIR yang mendefinisikan `master_light`, bukan nomor berkas yang tetap)
--   • urutan kolom = urutan `MASTER_LIGHT_COLS`, lalu empat `ai_*`. Urutan itu
--     bukan selera: `RETURNS TABLE` dan daftar `SELECT` dipasangkan POSISIONAL
--     oleh Postgres, jadi "isi sama, urutan beda" tetap salah.
--   • `LIMIT 500`, `STABLE`, `PARALLEL SAFE`, `SECURITY INVOKER` — tidak
--     berubah dari 018. TIDAK ada `GRANT EXECUTE … TO anon`.
--
-- URUTAN DEPLOY
--   Migrasi ini DULU, kode kemudian. `berkas.ts` sengaja masih membawa
--   tambalannya dan hanya melewatinya kalau RPC sudah membawa `pas_photo` —
--   jadi urutan terbalik pun tidak merusak apa pun, hanya tidak berefek.
--
-- ⚠ DROP DULU, BUKAN `CREATE OR REPLACE` SAJA.
--   Menambah kolom mengubah TIPE HASIL, dan Postgres menolak
--   `CREATE OR REPLACE FUNCTION` yang mengubah return type:
--     ERROR: cannot change return type of existing function
--     HINT:  Use DROP FUNCTION master_light(text[]) first.
--   `scripts/migrate.mjs` menjalankan tiap migrasi di dalam SATU transaksi, jadi
--   jendela "fungsi belum ada" tidak pernah terlihat oleh pembaca lain dan
--   kegagalan apa pun setelah DROP akan mengembalikan versi lama.
--   Tidak ada GRANT yang perlu dipasang ulang: runtime memakai service role,
--   yang otomatis punya EXECUTE.

DROP FUNCTION IF EXISTS public.master_light(text[]);

CREATE FUNCTION public.master_light(wa_list text[])
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
  pas_photo text,
  pendidikan_1_tingkat text,
  pendidikan_2_tingkat text,
  pendidikan_3_tingkat text,
  pendidikan_4_tingkat text,
  pendidikan_5_tingkat text,
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
    m.pas_photo,
    m.pendidikan_1_tingkat,
    m.pendidikan_2_tingkat,
    m.pendidikan_3_tingkat,
    m.pendidikan_4_tingkat,
    m.pendidikan_5_tingkat,
    -- Cast `::jsonb` di dalam SQL adalah inti perbaikan 018: PostgREST tidak
    -- bisa melakukannya di dalam `select` (400 PGRST100), dan `->>` menjawab
    -- null (bukan error) untuk baris yang tidak punya sub-objek itu.
    (m.ai_data_json::jsonb -> 'identitas' ->> 'gender') AS ai_gender,
    (m.ai_data_json::jsonb -> 'identitas' ->> 'umur')   AS ai_umur,
    (m.ai_data_json::jsonb -> 'identitas' ->> 'tb')     AS ai_tb,
    (m.ai_data_json::jsonb -> 'identitas' ->> 'bb')     AS ai_bb
  FROM public.master_database_candidate m
  WHERE m.no_wa = ANY (wa_list)
  LIMIT 500;
$$;
