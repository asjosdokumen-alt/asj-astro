-- 026_session_revocations.sql — a kill switch for stateless sessions.
--
-- WHY THIS EXISTS
--   Tokens are HMAC-signed and carry no server state (`_lib/session.ts`), so a
--   stolen refresh token was valid for its full 7 days with NO way to kill it:
--   `logout` returned `{success:true}` and did nothing, and a password change
--   left every issued token alive. Measured 2026-10-29: the refresh token is
--   renewed silently 60 s before expiry (`apiClient.ts`), so the blast radius
--   of one leaked token was the full 7-day window with no victim-visible signal.
--
-- DESIGN: revocation by SUBJECT, compared against the token's `iat`.
--   `subject` is `admin:<name>` or `kandidat:<wa>`, both taken from the SIGNED
--   token payload — never from a request field, so a caller cannot choose whose
--   session it kills.
--
--   A token is rejected when `iat < revoked_at` (strictly older). Strict
--   inequality is deliberate: a user who logs out and immediately logs back in
--   within the same second must keep the NEW token, so equal timestamps are
--   allowed. The cost is a sub-second window in which a token issued in the
--   very same second as the revocation survives — accepted, because the
--   alternative silently kills a legitimate fresh login 24 h later.
--
-- WHY A TABLE AND NOT A COLUMN
--   Admins live only in env (`PIN_<NAME>` / `ASJ_ADMINS`), with no row anywhere
--   (`contexts/identity/service.ts` explains why). A column on
--   `database_candidate` would cover candidates and nobody else; a keyed table
--   covers both with one rule.
--
-- FAIL-OPEN READ, DELIBERATELY
--   The reader treats "table missing" and "DB unreachable" as "not revoked"
--   (`repository.getSessionRevokedAt` returns null). This migration MUST be
--   applied before the code ships (repo rule: migration first, deploy second),
--   but if it is not, the failure mode is "revocation does not work yet", not
--   "every session on the site dies". A kill switch that bricks all logins
--   during a DB blip is a worse outage than the one it prevents.
--
-- APPLIED TO NEON: 2026-10-29, in one transaction, verified before COMMIT.

CREATE TABLE IF NOT EXISTS public.session_revocations (
  subject    text        PRIMARY KEY,
  revoked_at timestamptz NOT NULL DEFAULT now()
);

-- Same posture as every other table here: RLS on, no policy, so only the
-- service role (BYPASSRLS) can read or write it. `verify:rls` enforces the
-- first half of that for every public table.
ALTER TABLE public.session_revocations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.session_revocations IS
  'Per-subject revocation epoch. A token is refused when its iat < revoked_at. Written by logout and password change; read only on refresh.';
COMMENT ON COLUMN public.session_revocations.subject IS
  'admin:<name> or kandidat:<wa>, taken from the signed token payload.';
