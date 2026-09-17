-- =============================================================================
-- 2026-09-17 — Migration 013: separate BIODATA approval from APPLICATION status
-- -----------------------------------------------------------------------------
-- WHY
--   The candidate dashboard shows one approval per mail row. Until now there was
--   exactly ONE admin approval path in the whole codebase, and it did not look
--   at what it was approving:
--
--     handleApproveForm
--       └─ handleFormStatus(idx, 'LULUS')            applications/service.ts:108
--            └─ syncCandidateDariForm(f, 'LULUS')    applications/service.ts:47
--                 └─ UPDATE database_candidate SET status_kandidat = 'LULUS'
--
--   `database_asj_form` holds two different kinds of row:
--
--     (a) a real JOB APPLICATION   -> code_job = 'KODE-JOB'
--     (b) a BIODATA / DOCUMENT update -> code_job is empty, and the row's
--         feedback_berkas carries a marker: '[BIODATA] …' (written by
--         syncBiodataKeMail) or '[UPLOAD <LABEL>]' (syncFormMailDariUpload).
--
--   Both kinds reach the same approval path, so approving a candidate's passport
--   scan wrote status_kandidat = 'LULUS' — the dashboard announced "Telah
--   disetujui admin" as though a job application had been accepted, and the
--   stage machine itself is driven off status_kandidat.
--
--   The fix is to give the biodata half its own column. `status_kandidat` stays
--   the APPLICATION verdict and remains written only by the application path;
--   `status_biodata` records the DOCUMENT verdict. One column cannot hold two
--   independent verdicts, which is why this is a schema change and not a
--   formatting change.
--
-- STATES
--   BELUM       no document package submitted yet (default; also the value for
--               every pre-existing row — see BACKFILL below)
--   MENUNGGU    the candidate submitted something; an admin has not looked yet
--   DISETUJUI   an admin approved it
--   REVISI      an admin sent it back
--
--   Deliberately NOT 'LULUS'. The whole defect is one word meaning two things;
--   reusing it here would recreate it.
--
-- ONLY THE ADMIN WRITES THIS
--   The candidate's own submission may move BELUM -> MENUNGGU (that is what
--   "submitted" means). Only an admin approval moves it to DISETUJUI, and only
--   an admin rejection moves it to REVISI. The backend enforces that with
--   requireAdmin(); this migration adds a database-level guard so a bug in the
--   handler cannot silently ship a self-approval. See section 3.
--
-- HOW TO APPLY
--   Supabase → SQL Editor → paste this whole file → Run. Every statement is
--   idempotent: ADD COLUMN IF NOT EXISTS, the constraint is dropped before it is
--   added, and the backfill only touches rows that are still at the default.
--   Safe to run twice.
--
-- SAFE BEFORE THE CODE DEPLOYS
--   A column nobody reads changes nothing. Applying this migration first, then
--   deploying the code, is the correct order — the reverse ships a write to a
--   column that does not exist yet, which PostgREST rejects with PGRST204 and
--   the handler would drop silently.
-- =============================================================================

-- ── 1. The column ───────────────────────────────────────────────────────────
-- NOT NULL with a DEFAULT, so the 100% of existing rows get a defined value
-- without a separate UPDATE pass over the table.
ALTER TABLE public.database_candidate
  ADD COLUMN IF NOT EXISTS status_biodata TEXT NOT NULL DEFAULT 'BELUM';

COMMENT ON COLUMN public.database_candidate.status_biodata IS
  'Biodata/document approval, owned by the admin. BELUM | MENUNGGU | DISETUJUI | REVISI. '
  'Intentionally separate from status_kandidat, which is the JOB APPLICATION verdict: '
  'approving a passport scan must not read as "application accepted".';

-- ── 2. The allowed-value constraint ─────────────────────────────────────────
-- Dropped first so the file is re-runnable: ADD CONSTRAINT has no IF NOT EXISTS
-- in PostgreSQL, and a plain re-run would abort the whole migration.
--
-- NOT VALID is deliberately NOT used. The table is small enough for a full scan
-- at migration time, and a constraint that is not validated is one the planner
-- may ignore — a guard that the database does not actually enforce is worse than
-- no guard, because it is believed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'database_candidate_status_biodata_check'
      AND conrelid = 'public.database_candidate'::regclass
  ) THEN
    ALTER TABLE public.database_candidate
      DROP CONSTRAINT database_candidate_status_biodata_check;
  END IF;
END $$;

ALTER TABLE public.database_candidate
  ADD CONSTRAINT database_candidate_status_biodata_check
  CHECK (status_biodata IN ('BELUM', 'MENUNGGU', 'DISETUJUI', 'REVISI'));

-- ── 3. Only the admin may APPROVE or REJECT ─────────────────────────────────
-- WHY A TRIGGER AND NOT JUST requireAdmin()
--   requireAdmin() lives in the handler. If a future handler forgets it — or a
--   new surface (a public form, a bridge, a migration script) writes this column
--   directly — the column becomes candidate-writable and "approved by admin"
--   stops meaning anything. This is the same reasoning as 012's RLS work: the
--   database should not depend on every caller remembering.
--
--   The rule is asymmetric on purpose:
--     * a candidate MAY set MENUNGGU (or reset to BELUM) — that is submitting
--     * a candidate MAY NOT set DISETUJUI or REVISI — that is judging
--     * an admin may set anything
--
--   `request.jwt.claims` is the PostgREST JWT payload — the SAME source of truth
--   migration 007 already uses for `->>'wa'`. Server-side writes go through the
--   service role, whose claim is `service_role`, and are therefore unaffected.
--
-- WHY NOT SECURITY DEFINER  (measured, not assumed)
--   The first draft of this function was SECURITY DEFINER and asked
--   `current_user IN ('service_role','postgres')` as a second opinion. That
--   question cannot be answered from inside a SECURITY DEFINER function:
--   PostgreSQL sets `current_user` to the function OWNER, not the caller. A probe
--   on this project measured
--
--     set role authenticated;  select public.__peek();
--       -> actor=authenticated | current_user=postgres | session_user=postgres
--
--   i.e. BOTH current_user and session_user read `postgres` while the effective
--   role was `authenticated`. So the clause was always FALSE, the AND-chain was
--   always FALSE, and the guard never raised — it was decorative. It also cost a
--   second bug on its own: it read `current_setting('request.jwt.claim.role')`
--   (singular, dotted) but PostgREST publishes `request.jwt.claims` (plural, one
--   JSON object), so `actor` silently defaulted to 'service_role' and the
--   `actor NOT IN (...)` half was FALSE too. Either defect alone disabled it.
--
--   The trigger therefore runs with INVOKER rights and asks ONE question, of ONE
--   setting, that PostgREST sets from the verified JWT and that `SET ROLE`
--   cannot forge. It has no fallback: a missing or unreadable claim is denied,
--   because a guard that fails open is not a guard.
CREATE OR REPLACE FUNCTION public.enforce_status_biodata_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  claims TEXT := current_setting('request.jwt.claims', true);
  actor  TEXT;
BEGIN
  -- The verdict values an admin owns. Everything else is the candidate's side.
  IF NEW.status_biodata IN ('DISETUJUI', 'REVISI')
     AND OLD.status_biodata IS DISTINCT FROM NEW.status_biodata
  THEN
    -- No claims setting at all is the dangerous case, not the safe one: it means
    -- an unnamed caller. FAIL CLOSED.
    IF claims IS NULL OR claims = '' THEN
      RAISE EXCEPTION
        'status_biodata may only be set to % by an admin (no verified role claim)',
        NEW.status_biodata
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    actor := claims::json->>'role';

    IF actor IS NULL OR actor NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
      RAISE EXCEPTION
        'status_biodata may only be set to % by an admin (actor: %)',
        NEW.status_biodata, COALESCE(actor, '<none>')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_status_biodata_admin_only() IS
  'Fail-closed guard: DISETUJUI/REVISI on status_biodata may only be written by the '
  'service role (i.e. a requireAdmin()-guarded handler). Created by migration 013.';

DROP TRIGGER IF EXISTS trg_status_biodata_admin_only ON public.database_candidate;
CREATE TRIGGER trg_status_biodata_admin_only
  BEFORE UPDATE OF status_biodata ON public.database_candidate
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_status_biodata_admin_only();

-- ── 4. Backfill ─────────────────────────────────────────────────────────────
-- WHY THE BACKFILL IS DELIBERATELY CONSERVATIVE
--   It is tempting to infer MENUNGGU/DISETUJUI from the mail rows that already
--   exist: a LULUS row whose code_job is empty, or whose feedback_berkas
--   contains '[BIODATA]'/'[UPLOAD ', was approved as a document package, so it
--   "should" be DISETUJUI.
--
--   That inference is NOT made here, on purpose. Those LULUS rows are exactly
--   the defect: the only thing they record is that someone clicked approve while
--   that row was selected. An UPLOAD row is created by the candidate's own
--   upload, and is not proof that an admin ever reviewed it. Writing DISETUJUI
--   into a column that then reads "Telah disetujui admin" on the dashboard would
--   manufacture an approval that never happened — the same class of silent
--   falsehood this migration exists to remove, just in the other direction.
--
--   So every existing row stays BELUM, which is true of the column's history:
--   it has never recorded anything. Candidates whose documents genuinely were
--   reviewed already have the admin's own answer elsewhere (the mail row's
--   status and keterangan), and the dashboard shows that. If the owner wants
--   those historical verdicts carried into the new column, that is a separate,
--   reviewed, one-off script against a named list — not a heuristic in a
--   migration.
--
--   The DEFAULT on ADD COLUMN already set every existing row to BELUM, so there
--   is nothing to execute here. A statement is included anyway, guarded, so the
--   intent is explicit and so a later re-run of this file is still a no-op:
UPDATE public.database_candidate
SET status_biodata = 'BELUM'
WHERE status_biodata IS NULL;

-- ── 5. Assert the result — a half-applied migration must not commit ─────────
DO $$
DECLARE
  col_type TEXT;
  col_nullable TEXT;
  has_check BOOLEAN;
  has_trigger BOOLEAN;
  bad_values BIGINT;
  fn_secdef BOOLEAN;
  fn_body TEXT;
BEGIN
  SELECT data_type, is_nullable INTO col_type, col_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'database_candidate'
    AND column_name = 'status_biodata';

  IF col_type IS NULL THEN
    RAISE EXCEPTION 'status_biodata was not created on public.database_candidate';
  END IF;
  IF col_type <> 'text' THEN
    RAISE EXCEPTION 'status_biodata has type %, expected text', col_type;
  END IF;
  IF col_nullable <> 'NO' THEN
    RAISE EXCEPTION 'status_biodata is nullable; the four states have no NULL case';
  END IF;

  -- CANARY: the guard must stay INVOKER-rights. Re-adding SECURITY DEFINER
  -- silently disables it (current_user becomes the owner), so fail loudly here
  -- rather than shipping a decorative guard a second time.
  SELECT prosecdef INTO fn_secdef
  FROM pg_proc
  WHERE proname = 'enforce_status_biodata_admin_only';
  IF fn_secdef IS NULL THEN
    RAISE EXCEPTION 'the guard function enforce_status_biodata_admin_only is missing';
  END IF;
  IF fn_secdef THEN
    RAISE EXCEPTION
      'enforce_status_biodata_admin_only is SECURITY DEFINER: current_user '
      'inside it is the owner, so the guard cannot see the caller and will never '
      'block. Drop SECURITY DEFINER. (Measured: current_user=postgres even under '
      'set role authenticated.)';
  END IF;

  -- CANARY: the claim setting must be the PLURAL object PostgREST publishes.
  -- The singular `request.jwt.claim.role` does not exist, so reading it makes
  -- `actor` default to the most privileged role instead of the actual one.
  SELECT prosrc INTO fn_body
  FROM pg_proc
  WHERE proname = 'enforce_status_biodata_admin_only';
  IF fn_body LIKE '%request.jwt.claim.role%' THEN
    RAISE EXCEPTION
      'the guard reads request.jwt.claim.role (singular). PostgREST publishes '
      'request.jwt.claims (plural, one JSON object); the singular name is always '
      'NULL, which made actor default to service_role and disabled the guard.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'database_candidate_status_biodata_check'
      AND conrelid = 'public.database_candidate'::regclass
  ) INTO has_check;
  IF NOT has_check THEN
    RAISE EXCEPTION 'the allowed-value constraint on status_biodata is missing';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_status_biodata_admin_only'
      AND tgrelid = 'public.database_candidate'::regclass
      AND NOT tgisinternal
  ) INTO has_trigger;
  IF NOT has_trigger THEN
    RAISE EXCEPTION 'the admin-only trigger on status_biodata is missing';
  END IF;

  SELECT count(*) INTO bad_values
  FROM public.database_candidate
  WHERE status_biodata NOT IN ('BELUM', 'MENUNGGU', 'DISETUJUI', 'REVISI');
  IF bad_values > 0 THEN
    RAISE EXCEPTION '% row(s) carry a status_biodata outside the four allowed states', bad_values;
  END IF;

  RAISE NOTICE
    'Migration 013 applied — status_biodata exists (NOT NULL DEFAULT BELUM), constraint + admin-only trigger verified (invoker rights, claims-based).';
END $$;

-- PostgREST caches the column set it resolved at startup. Without this the new
-- column is invisible to INSERT/UPDATE/SELECT until the next restart, and the
-- code that writes it would get PGRST204 for hours.
NOTIFY pgrst, 'reload schema';
