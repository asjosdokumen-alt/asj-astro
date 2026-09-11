-- =============================================================================
-- 2026-09-11 — Enforce statement_timeout at the database role level
-- =============================================================================
-- WHY
--   Phase B ("bound the load"). kernel/http.ts used to attach a
--   `statement_timeout` request header to every PostgREST call:
--
--     if (dep === 'postgrest') headers.set('statement_timeout', isRead ? '2000' : '3000');
--
--   Nothing ever read it. PostgREST does not recognise that header — its
--   recognised set is Prefer, Accept, Range, Content-Type, Authorization and
--   the *-Profile headers. PostgREST applies statement_timeout as a *hoisted
--   transaction setting*, configured server-side via `db-hoisted-tx-settings`
--   and sourced from the database ROLE the request executes as. Unknown
--   headers are ignored, so the line was a no-op that looked like protection.
--
--   Checked before removing it: this project installs no `db-pre-request`
--   hook, and nothing in migrations/ or netlify.toml reads request.headers
--   (the only current_setting reads are PostgREST's built-in
--   `request.jwt.claims` in 007_phase8_rls_safe.sql). So there was no
--   server-side consumer either. The header has been deleted from http.ts;
--   this migration installs the mechanism that actually works.
--
-- WHY 3s
--   The client-side budgets in kernel/http.ts are 2s for a PostgREST read and
--   3s for a write. The server-side limit must be LOOSER than the client-side
--   budget, otherwise the client aborts first and the database keeps working
--   on a query nobody is waiting for — the opposite of what we want.
--
--   So 3s, matching the write budget: both reads and writes fail at the client
--   boundary first, and this setting only ever catches the query that escaped
--   the client timeout entirely (a pooled connection reused by another path, an
--   RPC that ignores the abort signal, a runaway recursive CTE).
--
--   This is a BACKSTOP, not the primary control. The primary controls are the
--   per-request deadline (kernel/deadline.ts), the per-dependency bulkhead
--   (kernel/resilience.ts) and the shared rate limiter (kernel/rate-limit.ts).
--
-- NOTE ON THE POOLER
--   Role settings are catalog state, not session state, so this applies
--   identically whether traffic arrives via the Supavisor transaction pooler
--   (port 6543) or a direct connection (5432). Nothing here depends on pooling
--   mode, and this migration can run through either.
--
-- NOTE ON ROLE CHOICE
--   `authenticator` is the login role PostgREST connects as; it then SET ROLEs
--   into anon / authenticated / service_role. All four are set so the limit
--   holds across the login hop and the effective role.
--
-- IDEMPOTENCE
--   ALTER ROLE ... SET is a declarative catalog write — re-running sets the
--   same value and changes nothing. The DO block skips roles that do not exist
--   rather than failing, so the file is safe on a non-Supabase database too.
--   Re-running this file does not reset the checksum ledger entry, but the
--   value it writes is identical, so drift is impossible.
--
-- REVERSIBILITY
--   ALTER ROLE authenticator  RESET statement_timeout;
--   ALTER ROLE anon           RESET statement_timeout;
--   ALTER ROLE authenticated  RESET statement_timeout;
--   ALTER ROLE service_role   RESET statement_timeout;
--
-- VERIFY AFTER APPLYING
--   SELECT rolname, rolconfig FROM pg_roles
--    WHERE rolname IN ('authenticator','anon','authenticated','service_role');
--   Expect statement_timeout=3s in each non-null rolconfig.
-- =============================================================================

DO $$
DECLARE
  r       text;
  targets text[] := ARRAY['authenticator', 'anon', 'authenticated', 'service_role'];
BEGIN
  FOREACH r IN ARRAY targets LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER ROLE %I SET statement_timeout = %L', r, '3s');
      RAISE NOTICE 'statement_timeout=3s applied to role %', r;
    ELSE
      RAISE NOTICE 'role % does not exist on this database, skipped', r;
    END IF;
  END LOOP;
END $$;
