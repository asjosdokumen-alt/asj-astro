-- Migration: alokasi id kandidat lewat fungsi yang benar-benar bisa dipanggil
--
-- KENAPA
--   `netlify/functions/_lib/candidate-helpers.ts` memanggil
--   `GET /rest/v1/rpc/nextval?seqname=candidate_id_seq` sejak Phase 5, dengan
--   komentar yang menyatakan alokasi id sudah atomik. Migrasi yang memperkenalkan
--   urutannya (006_phase5_async_scale.sql) membuat **hanya sequence**-nya:
--   tidak ada fungsi `nextval` di schema yang diekspos PostgREST, dan
--   `pg_catalog.nextval` tidak bisa dijangkau sebagai `rpc/nextval`. Jadi setiap
--   panggilan dijawab 404 PGRST202, `.catch(() => null)` menelannya, dan
--   alokasi jatuh ke `MAX(id_kandidat) + 1` — TOCTOU yang justru ingin dihapus
--   oleh sequence itu. Kegagalannya tidak terlihat karena fallback hampir selalu
--   berhasil: dua pengiriman bersamaan membaca MAX yang sama dan yang kedua
--   kalah di unique index (kejadian nyata yang sudah tercatat di kode:
--   ASJ00226 di master vs max 225 di database_candidate).
--
--   Migrasi ini membuat panggilan yang dimaksud menjadi nyata.
--
-- KEAMANAN
--   · `SECURITY DEFINER` supaya role API tidak perlu USAGE pada sequence.
--   · Hanya `candidate_id_seq` yang dilayani. Tanpa batas ini, endpoint publik
--     `rpc/nextval` menjadi alat untuk memajukan sequence APA PUN di database —
--     termasuk sequence milik tabel lain.
--   · `search_path` dipaku dan pemanggilan ditulis `pg_catalog.nextval` supaya
--     fungsi lain di schema `public` tidak bisa membajaknya.
--
-- URUTAN DEPLOY: migrasi ini DULU, kode menyusul. Kode lama tetap benar tanpa
-- migrasi ini (ia memakai fallback), tapi race-nya baru tertutup setelah ini
-- diterapkan — dan fallback itu sekarang mencatat `candidate-id.sequence-
-- unavailable` supaya keadaannya kelihatan di log, bukan senyap.

CREATE SEQUENCE IF NOT EXISTS candidate_id_seq START WITH 10001;

CREATE OR REPLACE FUNCTION public.nextval(seqname TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF seqname IS NULL OR seqname NOT IN ('candidate_id_seq', 'public.candidate_id_seq') THEN
    RAISE EXCEPTION 'nextval(): sequence % tidak diizinkan', seqname
      USING ERRCODE = '42501';
  END IF;
  RETURN pg_catalog.nextval('public.candidate_id_seq'::regclass);
END;
$$;

REVOKE ALL ON FUNCTION public.nextval(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nextval(TEXT) TO anon, authenticated, service_role;
