-- 034_replace_candidate_pekerjaan.sql
--
-- Penulisan riwayat kerja yang ATOMIK.
--
-- KENAPA FUNGSI, BUKAN DUA PERMINTAAN REST
--   Mengganti daftar berarti "hapus yang lama, tulis yang baru". Kalau itu
--   dilakukan lewat PostgREST, dua permintaan itu tidak satu transaksi: bila
--   INSERT gagal setelah DELETE berhasil, riwayat kandidat HILANG dan tidak ada
--   yang bisa mengembalikannya.
--
--   Urutan juga tidak bisa diselesaikan dengan upsert per slot: menukar slot 1
--   dan 2 akan bentrok dengan UNIQUE INDEX duplikat saat baris lama masih ada.
--   DELETE + INSERT di dalam SATU fungsi menyelesaikan keduanya sekaligus.
--
-- URUTAN DEPLOY
--   Migrasi ini DULU. PostgREST perlu menyegarkan schema cache sebelum
--   `rpc/replace_candidate_pekerjaan` bisa dipanggil (di Neon, `NOTIFY pgrst`
--   TIDAK bekerja — cache disegarkan Neon sendiri, terukur ~15 menit). Kode
--   pemanggil punya fallback ke kolom `pekerjaan_1..3` selama RPC belum ada,
--   jadi deploy kode tidak perlu menunggu.
--
-- KEAMANAN
--   SECURITY INVOKER (bawaan): RLS tetap berlaku untuk pemanggil. Yang
--   memanggil adalah service role (BYPASSRLS), sama seperti penulis master
--   lainnya. `search_path` dipaku supaya fungsi lain di schema `public` tidak
--   bisa membajak `candidate_pekerjaan`.

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
         e.ord::INT,
         btrim(e.j->>'perusahaan'),
         NULLIF(btrim(coalesce(e.j->>'perusahaan_jp', '')), ''),
         NULLIF(btrim(coalesce(e.j->>'jabatan', '')), ''),
         NULLIF(btrim(coalesce(e.j->>'jabatan_jp', '')), ''),
         NULLIF(btrim(coalesce(e.j->>'tahun_masuk', '')), ''),
         NULLIF(btrim(coalesce(e.j->>'tahun_keluar', '')), ''),
         NULLIF(btrim(coalesce(e.j->>'gaji', '')), ''),
         NULLIF(btrim(coalesce(e.j->>'jenis', '')), ''),
         NULLIF(btrim(coalesce(e.j->>'bidang', '')), ''),
         NULLIF(btrim(coalesce(e.j->>'catatan', '')), '')
  FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) WITH ORDINALITY AS e(j, ord)
  WHERE btrim(coalesce(e.j->>'perusahaan', '')) <> ''
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;

GRANT EXECUTE ON FUNCTION public.replace_candidate_pekerjaan(TEXT, JSONB) TO anon;

COMMENT ON FUNCTION public.replace_candidate_pekerjaan(TEXT, JSONB) IS
  'Ganti SELURUH riwayat kerja satu kandidat dalam satu transaksi. Urutan array = urutan simpan. Baris tanpa nama perusahaan dilewati.';
