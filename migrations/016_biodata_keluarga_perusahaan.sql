-- =============================================================================
-- 2026-10-11 — Migration 016: the seven biodata fields the form already offers
-- -----------------------------------------------------------------------------
-- WHY THIS EXISTS
--   The admin "Pusat Pemberkasan" modal (src/components/admin/PemberkasanModal.tsx)
--   renders 18 biodata inputs. The backend handler simpanBiodataLengkap maps the
--   incoming flat payload onto columns through ONE table,
--   `BIO_LENGKAP_MASTER_COLS`, and that table holds 11 pairs. The loop skips
--   every key it has no pair for — with no error, no warning, and no change to
--   its `{ success: true }` reply. So an admin could type into these seven:
--
--     ttl_ayah          candidate.bio_father_dob
--     nama_ibu          candidate.bio_mother
--     ttl_ibu           candidate.bio_mother_dob
--     nama_shacou       candidate.bio_shacou
--     telp_perusahaan   ui.company_phone
--     web_perusahaan    candidate.bio_comp_web
--     alamat_perusahaan candidate.bio_company_address
--
--   press Simpan, be told "berhasil", and have nothing stored anywhere. That is
--   the same silent-drop class this repo keeps paying for, one level down.
--
--   These fields were dropped ON PURPOSE when master_database_candidate was
--   restructured to its JP layout: the family block only ever got
--   `keluarga_1_nama`, and members 2+ carry `*_hubungan_jp` only. There was
--   simply no column to put them in. The comment recording that decision is
--   still in contexts/master-data/service.ts — this migration is what finally
--   makes it obsolete.
--
-- WHY COLUMNS AND NOT "HIDE THE INPUTS"
--   Hiding them was the interim measure (kept in the previous commit): it stops
--   the false promise but also stops the data. The owner asked for the columns.
--
-- NAMING — DERIVED FROM THE TABLE, NOT INVENTED
--   master_database_candidate already organises repeated rows by NUMBER and by
--   MEANING-GROUP rather than by legacy flat names:
--
--     family      keluarga_1_nama, keluarga_1_usia, keluarga_1_hubungan [_jp],
--                 keluarga_1_pekerjaan [_jp]
--     work        pekerjaan_1_nama_perusahaan, pekerjaan_1_jabatan [_jp],
--                 pekerjaan_1_tahun_masuk, pekerjaan_1_tahun_keluar
--
--   The seven new columns follow that same shape. `ayah` and `ibu` are BOTH
--   family members, so the father keeps the existing slot 1 and the mother takes
--   slot 2 — the parent/child direction is kept in the NEW parent_* columns
--   rather than overloading `keluarga_2_hubungan_jp`, which means "this
--   candidate's relation to family member 2" and is written by the CV template
--   engine.
--
--   The company block gets `perusahaan_1_*` rather than being folded into
--   `pekerjaan_1_*`: `pekerjaan_1_nama_perusahaan` is the candidate's OWN past
--   employer in the rirekisho work history. `nama_shacou` / `telp_perusahaan`
--   are the hiring/placement company the candidate is being sent to. Those are
--   different things and merging them would write one over the other.
--
-- WHAT IS DELIBERATELY *NOT* DONE
--   No column is added to `database_candidate`. `BIO_LENGKAP_CAND_SYNC` (the
--   master -> candidate projection) keeps its 5 pairs; widening it would move
--   this data into a second table with its own RLS and its own readers, which is
--   a product decision, not a consequence of adding storage.
--
--   No CHECK constraint, no NOT NULL. These are optional free-text biodata
--   fields that legitimately have no value; a constraint here would only create
--   a new way for a save to fail.
--
-- SAFE BEFORE THE CODE DEPLOYS
--   A column nobody reads changes nothing. Apply this migration FIRST, then
--   deploy the code that writes it. The reverse order ships a PATCH naming
--   columns that do not exist yet, PostgREST answers 400 PGRST204, and — because
--   the whole row is rejected, not just the unknown keys — the ENTIRE biodata
--   save fails. That is why the code change and this file are in the same
--   commit but must not be applied in the same order.
--
-- HOW TO APPLY
--   npm run migrate:up          (runner: scripts/migrate.mjs, one transaction)
--   …or Supabase -> SQL Editor -> paste -> Run. Idempotent either way:
--   ADD COLUMN IF NOT EXISTS, and the assertions are read-only. Safe to run twice.
-- =============================================================================

-- ── 1. The seven columns ────────────────────────────────────────────────────
-- `IF NOT EXISTS` on each, so a re-run is a no-op instead of an abort. All TEXT
-- and nullable: these are optional free-text biodata values.

-- Family: the father's birth place/date.
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS keluarga_1_ttl TEXT;

-- Family: the mother. Slot 2 is hers; slot 1 stays the father's (keluarga_1_nama
-- is already what `nama_ayah` maps onto, and it is also written by the CV
-- template engine from family row 1).
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS keluarga_2_nama TEXT;
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS keluarga_2_ttl TEXT;

-- Placement / hiring company the candidate is being sent to. Kept distinct from
-- pekerjaan_1_* (the candidate's own work history).
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS perusahaan_1_nama_shacou TEXT;
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS perusahaan_1_telp TEXT;
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS perusahaan_1_web TEXT;
ALTER TABLE public.master_database_candidate
  ADD COLUMN IF NOT EXISTS perusahaan_1_alamat TEXT;

COMMENT ON COLUMN public.master_database_candidate.keluarga_1_ttl IS
  'Father: place and date of birth (one free-text field, as the form collects it). '
  'Payload key ttl_ayah.';
COMMENT ON COLUMN public.master_database_candidate.keluarga_2_nama IS
  'Mother: name. Payload key nama_ibu. Slot 2 is the mother — slot 1 is the father '
  '(keluarga_1_nama, written from payload key nama_ayah).';
COMMENT ON COLUMN public.master_database_candidate.keluarga_2_ttl IS
  'Mother: place and date of birth (one free-text field). Payload key ttl_ibu.';
COMMENT ON COLUMN public.master_database_candidate.perusahaan_1_nama_shacou IS
  'Placement/hiring company (shachou = company president). Payload key nama_shacou. '
  'NOT pekerjaan_1_nama_perusahaan, which is the candidate''s own former employer.';
COMMENT ON COLUMN public.master_database_candidate.perusahaan_1_telp IS
  'Placement company phone. Payload key telp_perusahaan.';
COMMENT ON COLUMN public.master_database_candidate.perusahaan_1_web IS
  'Placement company website. Payload key web_perusahaan.';
COMMENT ON COLUMN public.master_database_candidate.perusahaan_1_alamat IS
  'Placement company address. Payload key alamat_perusahaan.';

-- ── 2. Assertion ────────────────────────────────────────────────────────────
-- A half-applied or silently-renamed migration must not commit. Everything below
-- is a read; nothing here changes state.
DO $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
  c TEXT;
  col_type TEXT;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'keluarga_1_ttl',
    'keluarga_2_nama',
    'keluarga_2_ttl',
    'perusahaan_1_nama_shacou',
    'perusahaan_1_telp',
    'perusahaan_1_web',
    'perusahaan_1_alamat'
  ] LOOP
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_database_candidate'
      AND column_name = c;

    IF col_type IS NULL THEN
      missing := missing || c;
    ELSIF col_type <> 'text' THEN
      RAISE EXCEPTION '016: %.% has type %, expected text',
        'master_database_candidate', c, col_type;
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION '016: column(s) not created on public.master_database_candidate: %',
      array_to_string(missing, ', ');
  END IF;

  -- CANARY: the two columns that must NOT have been merged into the wrong block.
  -- If someone later "tidies" pekerjaan_1_* and perusahaan_1_* together, the
  -- candidate's own work history and the placement company become one field and
  -- silently overwrite each other. Fail here instead.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_database_candidate'
      AND column_name = 'perusahaan_1_nama_perusahaan'
  ) THEN
    RAISE EXCEPTION
      '016: perusahaan_1_nama_perusahaan exists — the placement company has been '
      'merged into the candidate''s work-history block. They are different things; '
      'see the header of this migration.';
  END IF;

  RAISE NOTICE 'Migration 016 applied — 7 biodata columns present on master_database_candidate.';
END $$;
