-- =============================================================================
-- 2026-09-12 — Phase D: close the RLS gap on the internal tables
-- =============================================================================
-- WHY
--   Phase D's gate is "zero select=* in the codebase; RLS blocks a
--   cross-candidate read". The second half had never been audited. Measured
--   against production on 2026-09-12 with the *anon* key — the one shipped to
--   the browser as PUBLIC_SUPABASE_ANON_KEY — the picture was:
--
--     table                     RLS   policies   anon read
--     database_candidate        on    candidate_own_wa     0 rows  (correct)
--     master_database_candidate on    master_own_wa        0 rows  (correct)
--     database_asj_form         on    form_own_wa          0 rows  (correct)
--     fcm_tokens                on    "Service role full access"  OPEN
--     dependency_calls          OFF   —                    OPEN
--     idempotency_keys          OFF   —                    OPEN
--     job_queue                 OFF   —                    OPEN
--     rate_counters             OFF   —                    OPEN
--     schema_migrations         OFF   —                    OPEN
--     16 further tables         on    none                 denied  (correct)
--
--   and every one of the 25 tables carried a FULL DML grant to anon and
--   authenticated (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
--   TRIGGER). RLS was the only thing standing between the public anon key and
--   the data, and on five tables it was switched off.
--
--   Concretely, with the published anon key anyone could:
--     · read every queued job payload in `job_queue` — which is where session
--       tokens used to live (see 010_scrub_job_queue_session_token.sql);
--     · read and rewrite `rate_counters`, i.e. reset their own rate limit. The
--       SLO table in docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md claims
--       "Rate-limit bypass: not possible (maintain)". On these tables it was;
--     · read the migration ledger (`schema_migrations`);
--     · read and rewrite circuit-breaker state (`dependency_calls`);
--     · read and forge idempotency results (`idempotency_keys`);
--     · read every FCM device token (`fcm_tokens`) — its policy is named
--       "Service role full access" but was created TO PUBLIC with USING (true),
--       which in PostgreSQL is stored as a null qual and matches every row.
--
--   None of this required a leaked secret. The key is in the client bundle.
--
-- WHY THIS IS SAFE FOR THE APPLICATION
--   The frontend never queries PostgREST directly. Verified by search, not by
--   assumption: the only `.from(` in src/ is a doc comment, the built bundle's
--   supabase client is used solely for /auth/v1/, and uploads go through
--   server-minted signed URLs. All table access is server-side through
--   Netlify Functions using SUPABASE_SERVICE_ROLE_KEY, which is
--   `rolbypassrls = true` and keeps its own grants — so it is unaffected by
--   everything below.
--
--   The three candidate-facing tables keep their grants on purpose. Their
--   own_wa policies are the intended row filter for a logged-in candidate
--   reading their own row, they measure correctly (0 rows for anon), and
--   revoking them is a behavioural change that deserves its own decision.
--   What IS removed from them is the set of capabilities no HTTP client ever
--   needs: TRUNCATE, REFERENCES and TRIGGER.
--
-- IDEMPOTENCE
--   Every statement is safe to run twice: ENABLE ROW LEVEL SECURITY and
--   REVOKE are both idempotent, the policy drop is guarded by IF EXISTS, and
--   the assertions at the end only read catalog state.
-- =============================================================================

-- ── 1. Turn RLS on where it was off ──────────────────────────────────────────
-- With RLS enabled and no policy, PostgreSQL denies every row to every role
-- except those with BYPASSRLS. That is the fail-closed default the other 16
-- tables already rely on, and it is the correct posture for tables that are
-- only ever touched by the service role.
ALTER TABLE IF EXISTS public.dependency_calls  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.idempotency_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_queue         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rate_counters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- ── 2. Drop the policy that was granted to everyone ─────────────────────────
-- `USING (true)` on a FOR ALL policy, granted to PUBLIC, named as if it were
-- service-role-only. service_role bypasses RLS entirely, so this policy has no
-- legitimate purpose: it only ever widened access.
DROP POLICY IF EXISTS "Service role full access" ON public.fcm_tokens;

-- ── 3. Take back the table privileges anon / authenticated never used ───────
-- Revoking a privilege does not remove a policy, and it does not touch the
-- service role. It removes the second half of the "RLS is the only control"
-- arrangement: if a future migration forgets ENABLE ROW LEVEL SECURITY on a new
-- table, the missing GRANT still denies the anon key.
DO $$
DECLARE
  keep text[] := ARRAY['database_candidate', 'master_database_candidate', 'database_asj_form'];
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT (c.relname = ANY (keep))
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.relname);
  END LOOP;
END $$;

-- On the three candidate-facing tables, keep SELECT/INSERT/UPDATE/DELETE (the
-- own_wa policy bounds them) and drop the three capabilities no PostgREST
-- request can exercise: TRUNCATE would empty the table, REFERENCES lets a
-- caller create foreign keys against it, TRIGGER lets a caller attach a trigger.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.database_candidate        FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.master_database_candidate FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.database_asj_form         FROM anon, authenticated;

-- ── 4. Do not re-grant automatically on the next CREATE TABLE ───────────────
-- Supabase's bootstrap grants ALL on new public tables to anon/authenticated.
-- Without this, the hole reopens the first time a migration adds a table —
-- which is precisely how the five tables above ended up unprotected.
--
-- Two details learned by running it:
--   · `pg_default_acl` lists entries owned by roles this connection cannot act
--     as (supabase_admin). `ALTER DEFAULT PRIVILEGES FOR ROLE <other>` is a hard
--     "permission denied", and inside the migration transaction that aborts the
--     whole migration. Each role is therefore attempted in its own sub-block and
--     a failure is reported, not raised.
--   · What actually matters going forward is the role that RUNS migrations,
--     because default privileges apply to objects that role creates. That one is
--     always permitted, so it is done explicitly first.
DO $$
DECLARE
  r record;
  changed int := 0;
  skipped text[] := ARRAY[]::text[];
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  changed := changed + 1;

  FOR r IN
    SELECT DISTINCT pg_get_userbyid(d.defaclrole) AS grantor
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
  LOOP
    IF r.grantor = current_user THEN
      CONTINUE; -- already handled above
    END IF;
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated',
        r.grantor
      );
      changed := changed + 1;
    EXCEPTION
      WHEN insufficient_privilege THEN
        skipped := skipped || r.grantor;
    END;
  END LOOP;

  RAISE NOTICE 'default privileges revoked for % role(s); skipped (not ours to change): %',
    changed, coalesce(array_to_string(skipped, ', '), '(none)');
END $$;

-- ── 5. Assert the result — a half-applied lockdown must not commit ──────────
DO $$
DECLARE
  still_open text;
  still_granted text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO still_open
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;

  IF still_open IS NOT NULL THEN
    RAISE EXCEPTION 'RLS is still disabled on: %', still_open;
  END IF;

  SELECT string_agg(DISTINCT g.table_name, ', ' ORDER BY g.table_name)
    INTO still_granted
  FROM information_schema.role_table_grants g
  WHERE g.table_schema = 'public'
    AND g.grantee IN ('anon', 'authenticated')
    AND g.privilege_type = 'TRUNCATE';

  IF still_granted IS NOT NULL THEN
    RAISE EXCEPTION 'anon/authenticated can still TRUNCATE: %', still_granted;
  END IF;

  RAISE NOTICE 'Phase D RLS lockdown applied — every public table has RLS on, no TRUNCATE grant remains.';
END $$;

-- PostgREST caches the privileges it resolved at startup. Without this it keeps
-- answering with the old ACL until the next restart.
NOTIFY pgrst, 'reload schema';
