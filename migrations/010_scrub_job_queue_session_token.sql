-- =============================================================================
-- 2026-09-08 — One-time scrub: remove legacy sessionToken from job_queue payload
-- =============================================================================
-- WHY
--   Review K3 (Backend API Layer audit) + ENGINEERING-QUALITY-PLAYBOOK.md
--   §3.2.4 / Day 1–30 item 3: legacy enqueue paths stored the caller's
--   sessionToken INSIDE the job payload. job_queue rows are readable by
--   workers through the claim_next_job RPC (and the payload is exposed to
--   anyone who can poll getJobStatus with a guessed jobId), so a stored
--   admin token is a takeover credential at rest.
--
--   The code fix (2026-09-08) already: (a) stops writing the token at
--   enqueue (surfaces/notify.ts), (b) verifies ownership in
--   handleGetJobStatus, and (c) never returns the payload or last_error.
--   None of that erases what past rows already stored — this migration is
--   the one-time cleanup of that data.
--
-- WHAT IS REMOVED (and nothing else)
--   payload->'payload'->'sessionToken'   token nested inside the args object
--   payload->'sessionToken'              token at the payload top level
--   Both locations were read by legacy workers (see the type assertion in
--   sweep-queue.ts); the current worker passes internal=true with NO token,
--   so nothing downstream depends on either key.
--
-- WHAT SURVIVES UNTOUCHED
--   payload.createdBy        ownership check for getJobStatus
--   payload.payload          worker args
--   payload.result           per-recipient broadcast summary (A06 parity)
--
-- NOTE ON LEGACY 'ai.interview' ROWS
--   Pre-2026-09-04 rows of that type relied on the stored token; after this
--   scrub they fail kandidat auth and are marked done by the sweep. They
--   were not safely runnable anyway, and delete-or-implement is scheduled
--   in the playbook (Days 61–90, item 15).
--
-- IDEMPOTENCE
--   jsonb #- deletes a missing key as a no-op, so re-running — or running
--   on a database that never had legacy rows — changes nothing. The final
--   DO block hard-fails the migration if any of the documented locations
--   still hold the key, so this file can never "pass" while the material
--   remains (same philosophy as scripts/ci/verify-migrations.mjs).
-- =============================================================================

WITH scrubbed AS (
  UPDATE job_queue
  SET payload = (payload #- '{payload,sessionToken}') #- '{sessionToken}'
  WHERE payload ? 'sessionToken'
     OR (payload ? 'payload' AND (payload #> '{payload}') ? 'sessionToken')
  RETURNING 1
)
SELECT count(*) AS rows_scrubbed FROM scrubbed;

-- Guard: the documented locations must be clean after the UPDATE above.
-- Runs in the same transaction as the scrub — a failure rolls both back.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM job_queue
    WHERE payload ? 'sessionToken'
       OR (payload ? 'payload' AND (payload #> '{payload}') ? 'sessionToken')
  ) THEN
    RAISE EXCEPTION 'job_queue scrub failed: sessionToken still present in job payload';
  END IF;
END;
$$;
