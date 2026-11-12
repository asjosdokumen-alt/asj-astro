-- 056_kota_pendidikan_pekerjaan.sql
--
-- Menambah KOTA untuk riwayat pendidikan & pekerjaan.
--
-- KENAPA
--   Form KINKI mencetak kolom 地域 (kota) di blok 学歴 dan 職歴, dan CV AI sudah
--   menanyakannya lewat dropdown — tetapi dropdown itu hanya berisi PROVINSI
--   (pemilik 2026-11-12: *"dropdownnya provinsi semua yg alamat kota sekolah"*).
--   Akibatnya kolom 地域 di CV hasil generate selalu kosong, dan pemilik
--   mengisinya manual: `ポのロゴ` (Ponorogo), `バンジャルネガラ`, `プルバリンガ`.
--
--   Kolomnya tidak pernah ada di `master_database_candidate`, jadi bukan sekadar
--   pemetaan yang lupa — datanya memang tidak punya tempat.
--
-- BENTUK
--   Teks bebas, sama seperti `pendidikan_N_jurusan_id` dan `pekerjaan_N_bidang`:
--   nilai Indonesia ("PONOROGO") dan renderer yang menerjemahkan ke bentuk
--   Jepang lewat kamus yang sudah ada (`jpTerm`). Additive + nullable, aman
--   untuk kode lama.

DO $$
DECLARE
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    EXECUTE format(
      'ALTER TABLE public.master_database_candidate ADD COLUMN IF NOT EXISTS pendidikan_%s_kota text',
      i
    );
  END LOOP;
  FOR i IN 1..3 LOOP
    EXECUTE format(
      'ALTER TABLE public.master_database_candidate ADD COLUMN IF NOT EXISTS pekerjaan_%s_kota text',
      i
    );
  END LOOP;
END $$;
