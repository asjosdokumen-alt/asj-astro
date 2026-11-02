-- 035_pekerjaan_urutan_kronologis.sql
--
-- Tabel yang MENJAMIN `urutan` kronologis, bukan pemanggil.
--
-- KENAPA
--   `034` menulis `urutan` dari posisi array (`WITH ORDINALITY`) dan
--   mendokumentasikan "urutan array = urutan simpan". Itu bergantung pada
--   pemanggil: `_lib/db/pekerjaan.ts` memang mengurutkan lebih dulu, tetapi
--   kontrak yang hanya dijaga pemanggil akan jebol begitu ada jalur kedua.
--   Dibuktikan 2026-11-03: memanggil RPC dengan array tak berurut menulis
--   `urutan` 1..5 sesuai POSISI (PT LIMA 2030 di urutan 1), bukan tahun.
--
--   Karena pembaca (`buildMasterNested` -> rirekisho) mempercayai `urutan`
--   sebagai kronologi, urutan yang salah di sini langsung tercetak salah.
--
-- APA
--   Urutkan di dalam fungsi memakai aturan yang SAMA dengan
--   `normalizePekerjaan`: tahun 4 digit dari `tahun_masuk` (semua digit diambil,
--   jadi `2024-07` -> 202407 dan `Juli 2015` -> 2015), yang tanpa tahun di
--   akhir, dan posisi array hanya sebagai pemutus seri.
--
--   Ini GUARD, bukan sumber aturan kedua: nilai yang masuk sudah dinormalkan
--   pemanggil (`masuk` sudah dipilih, duplikat sudah dibuang). Fungsi ini hanya
--   memastikan `urutan` tidak pernah menyimpang dari kronologi.

CREATE OR REPLACE FUNCTION public.replace_candidate_pekerjaan(
  p_id_kandidat TEXT,
  p_rows JSONB
)
RETURNS INTEGER AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF p_id_kandidat IS NULL OR btrim(p_id_kandidat) = '' THEN
    RAISE EXCEPTION 'replace_candidate_pekerjaan: id_kandidat kosong';
  END IF;

  DELETE FROM public.candidate_pekerjaan WHERE id_kandidat = p_id_kandidat;

  INSERT INTO public.candidate_pekerjaan
    (id_kandidat, urutan, perusahaan, perusahaan_jp, jabatan, jabatan_jp,
     tahun_masuk, tahun_keluar, gaji, jenis, bidang, catatan)
  SELECT p_id_kandidat,
         x.rn::INT,
         btrim(x.j->>'perusahaan'),
         NULLIF(btrim(coalesce(x.j->>'perusahaan_jp', '')), ''),
         NULLIF(btrim(coalesce(x.j->>'jabatan', '')), ''),
         NULLIF(btrim(coalesce(x.j->>'jabatan_jp', '')), ''),
         NULLIF(btrim(coalesce(x.j->>'tahun_masuk', '')), ''),
         NULLIF(btrim(coalesce(x.j->>'tahun_keluar', '')), ''),
         NULLIF(btrim(coalesce(x.j->>'gaji', '')), ''),
         NULLIF(btrim(coalesce(x.j->>'jenis', '')), ''),
         NULLIF(btrim(coalesce(x.j->>'bidang', '')), ''),
         NULLIF(btrim(coalesce(x.j->>'catatan', '')), '')
  FROM (
    SELECT e.j,
           row_number() OVER (
             ORDER BY NULLIF(regexp_replace(coalesce(e.j->>'tahun_masuk', ''), '[^0-9]', '', 'g'), '')::int NULLS LAST,
                      e.ord
           ) AS rn
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) WITH ORDINALITY AS e(j, ord)
    WHERE btrim(coalesce(e.j->>'perusahaan', '')) <> ''
  ) x
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;

COMMENT ON FUNCTION public.replace_candidate_pekerjaan(TEXT, JSONB) IS
  'Ganti SELURUH riwayat kerja satu kandidat dalam satu transaksi. `urutan` SELALU kronologis (tahun dari tahun_masuk; tanpa tahun di akhir), bukan posisi array. Baris tanpa nama perusahaan dilewati.';
