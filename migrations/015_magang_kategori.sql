-- =============================================================================
-- 2026-09-25 — Migration 015: the "Magang" (internship) job category
-- -----------------------------------------------------------------------------
-- WHY
--   The owner asked for a NEW job category, "Magang", alongside the existing
--   categories (which are DATA, not a code enum). Categories are rendered from
--   `sys_config` rows with `config_type = 'list_kategori'` — the add-job form
--   (src/components/admin/TabTambah.tsx) and the DB-job editor
--   (TabDbJob.tsx / AdminJobEditModal.tsx) build their <select> from that list.
--   So making "Magang" SELECTABLE is a data insert, not a code change.
--
--   Separately, a Magang job gets a NEW job-code prefix `GJ<N>ASJ`
--   (Tokutei Ginou stays `TG<N>ASJ`) — that part is code and lives in
--   contexts/jobs/repository.ts. This migration does NOT touch numbering.
--
-- WHAT IS UNKNOWABLE FROM THIS REPO
--   There is no `CREATE TABLE job_database` anywhere under migrations/ — only
--   indices and RLS (001–014). The table predates this repo, and the generated
--   schema (netlify/functions/_lib/db/schema.generated.ts) is derived from the
--   PostgREST OpenAPI document, which does NOT surface CHECK constraints. So we
--   CANNOT tell from here whether `job_database.kategori` carries a CHECK that
--   enumerates the allowed categories.
--
--   The owner asked for a DEFENSIVE migration for exactly that reason: it must
--   be SAFE WHETHER OR NOT such a constraint exists, and must NOT fail if there
--   is nothing to drop.
--
-- THE DEFENSIVE STRATEGY
--   1. If a CHECK constraint on `job_database.kategori` exists, drop it. A
--      genuine enum CHECK would otherwise reject the new 'Magang' value. We
--      discover it by introspecting pg_constraint, so "no constraint" is a
--      harmless no-op rather than an error.
--   2. Insert the 'Magang' sys_config row idempotently (only when absent), so a
--      second run does not duplicate it.
--   3. Assert the resulting state, so a half-applied migration cannot commit.
--
--   NOTE ON DROPPING A CHECK vs. RELAXING IT
--   We drop the constraint rather than DROP-then-ADD a wider one, because we do
--   NOT know its exact predicate from the repo. Re-adding a guessed predicate
--   could silently forbid a value that was previously legal (e.g. a category the
--   owner uses but that never appears in the data we can see). Dropping turns a
--   possible "enum" into a free-text column, which is what "categories are data"
--   already implies. If the owner later confirms a constraint and its full
--   value set, a follow-up migration can re-add it with 'Magang' included.
--
-- HOW TO APPLY
--   Supabase → SQL Editor → paste this whole file → Run. Idempotent: the
--   constraint drop is guarded by an existence check, the insert is guarded by
--   NOT EXISTS, and the assertions are read-only. Safe to run twice.
-- =============================================================================

BEGIN;

-- ── 1. Relax any CHECK constraint that enumerates allowed kategori values ────
-- Discovered dynamically: `conrelid = job_database` and the constraint's
-- expression mentions the `kategori` column. Dropping by name (which we cannot
-- know) is impossible, so we read pg_get_constraintdef and match on the column.
--
-- SAFE WHEN NOTHING EXISTS: the loop simply finds no rows and does nothing.
DO $$
DECLARE
  c RECORD;
  dropped INTEGER := 0;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.job_database'::regclass
      AND contype = 'c'                       -- CHECK constraints only
      AND pg_get_constraintdef(oid) ILIKE '%kategori%'
  LOOP
    EXECUTE format('ALTER TABLE public.job_database DROP CONSTRAINT %I', c.conname);
    dropped := dropped + 1;
    RAISE NOTICE '015: dropped CHECK constraint % on job_database (enumerated kategori)', c.conname;
  END LOOP;

  IF dropped = 0 THEN
    RAISE NOTICE '015: no CHECK constraint on job_database.kategori — nothing to drop (expected on the live DB)';
  END IF;
END $$;

-- ── 2. Insert the "Magang" category row, idempotently ───────────────────────
-- sys_config shape (from schema.generated.ts): id, config_type, config_value,
-- deskripsi, is_active, created_at. `id` is a text PK; generate a stable value.
-- NOT EXISTS on (config_type = 'list_kategori' AND config_value = 'Magang') is
-- what makes a second run a no-op — a plain INSERT would duplicate the row and
-- the admin form would show "Magang" twice.
INSERT INTO public.sys_config (id, config_type, config_value, deskripsi, is_active)
SELECT
  'cfg-list_kategori-magang',
  'list_kategori',
  'Magang',
  'Kategori lowongan magang (kode loker GJ<N>ASJ, lamaran khusus siswa VIP)',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.sys_config
  WHERE config_type = 'list_kategori'
    AND config_value = 'Magang'
);

-- ── 3. Assert the result — a half-applied migration must not commit ─────────
DO $$
DECLARE
  n INTEGER;
  still_has_check BOOLEAN;
BEGIN
  -- The Magang row must exist exactly once.
  SELECT count(*) INTO n
  FROM public.sys_config
  WHERE config_type = 'list_kategori' AND config_value = 'Magang';
  IF n <> 1 THEN
    RAISE EXCEPTION '015: expected exactly 1 list_kategori=Magang row, found %', n;
  END IF;

  -- No CHECK constraint on kategori may remain: if one does, inserting a Magang
  -- job would fail at write time and the category would be selectable but
  -- unusable — the worst of both.
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.job_database'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kategori%'
  ) INTO still_has_check;
  IF still_has_check THEN
    RAISE EXCEPTION '015: a CHECK constraint on job_database.kategori survived the drop';
  END IF;

  RAISE NOTICE 'Migration 015 applied — list_kategori=Magang present (once), no kategori CHECK remains.';
END $$;

COMMIT;

-- PostgREST resolves config rows at request time, but the schema cache matters
-- if a constraint drop changed the table shape. Notify so the new state is seen
-- on the next request rather than after a restart.
NOTIFY pgrst, 'reload schema';
