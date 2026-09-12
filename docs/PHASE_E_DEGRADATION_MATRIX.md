> **Last updated:** 2026-09-13 — Phase E (test the claims). Status: item 19 (chaos suite) done for the rows that are testable in-process; item 21 (idempotency replay) done; items 20 and 22 are **not runnable as written** — reasons below. The **documentation half of row 3 is now resolved**: the three documents that promised `ai_unavailable` state what actually happens instead (§2, Row 3).

# Phase E — the degradation matrix, verified or not

Source of the phase: `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §11.

**Gate as written:** *the degradation matrix in §6.5 is verified behaviour, not a document.*

This file is the result. Every row of §6.5 is checked against the code, and the
rows that hold are asserted by `netlify/functions/_lib/chaos.test.ts`. Three of the
seven rows do not describe what the system does.

---

## 1. How the claims were tested

`_lib/chaos.test.ts` injects failures at `globalThis.fetch` — the outermost
boundary, below every layer that matters. Nothing above it is mocked, so the real
`kernel/http.ts` (deadline clamp, circuit breaker, bulkhead, dependency logging),
the real db client, the real context, the real surface and the real wrapper all
run. Mocking at `supabaseJson` or at the surface would test the mock, not the
wiring.

That single seam also covers the two raw-`fetch` sites deliberately outside
`kernel/http.ts` (`_lib/ai/providers.ts`, `_lib/fcm-server.ts` — both allow-listed
with a justification in `scripts/ci/io-boundary.mjs`), so one stub exercises the
database, AI and push paths.

Each test calls `vi.resetModules()` first. The circuit breakers, admission
counters, bulkheads and response cache are module-level singletons; without a
reset, one test's induced outage would change the next test's behaviour and the
suite would pass or fail by ordering.

---

## 2. The matrix, row by row

| §6.5 Failure | Claimed behaviour | Verdict | Evidence |
|---|---|---|---|
| DB down — public catalog | Serve last-known-good from CDN (`stale-if-error=86400`) | ✅ **holds** | `chaos.test.ts` · `PUBLIC_CACHE_HEADERS` |
| DB down — writes | 503 + idempotency key retained so the client can safely replay | ✅ **holds** (closed 2026-09-13) | `chaos.test.ts` |
| Gemini down | `ai_unavailable`; AI tabs show a banner | ❌ **does not exist** | `chaos.test.ts` |
| Fonnte down | Enqueue to `job_queue`, return 202 | ⚠️ **both paths enqueue; the status is not 202** | code |
| FCM down | Log and drop | ✅ **holds** | `chaos.test.ts` |
| Storage down | DB row written, upload retried; document shows "pending" | ⚠️ **retry is client-side only** | code |
| Pooler saturated | Shed P2/P3 to queue, serve stale for P1 | ⚠️ **sheds, but nothing is queued** | `chaos.test.ts` + code |

### Row 1 — DB down, public catalog ✅

The origin answers. `handleGetAppData` catches everything and returns the built-in
dataset rather than propagating the failure, so the board renders during a total
database outage instead of showing an error. What turns that into "last-known-good"
for a visitor is the CDN: `Cache-Control: public, s-maxage=60,
stale-while-revalidate=86400, stale-if-error=86400`.

The test also asserts that a Supabase URL was actually requested and failed, so it
cannot pass against a code path that never touched the network. A green test that
proved nothing would be worse than no test.

**Nuance worth keeping:** the origin serves *demo* data, not the previous response.
"Last-known-good" is entirely the CDN's doing. If the CDN entry expires during a
long outage, visitors see the demo dataset.

### Row 2 — DB down, writes ✅ **(closed 2026-09-13)**

The claim is `503 + Retry-After`, so a client knows to retry.

**What used to happen** — recorded because the shape of the mistake is reusable:

```
surface throws (PostgREST unreachable)
  → toErrorResponse → { success: false, code: 'INTERNAL_ERROR' }
  → codeToStatus('INTERNAL_ERROR') → 500
  → toJSON() sets retryAfter only when the code is retryable; INTERNAL_ERROR is not
  → backpressureHeaders adds Cache-Control: no-store only when out.overloaded
```

So a database outage produced **500, no `Retry-After`, no `no-store`, and a
non-retryable classification** — the opposite of the documented retry contract.

**What happens now.** `db/client.ts` classifies every PostgREST transport failure
and translates the ones that mean "the database is not there" into
`AppError('SERVICE_UNAVAILABLE')`:

| Failure | Outage? | Why |
|---|---|---|
| `TimeoutError` (socket opened, nothing came back) | yes | the host is unresponsive |
| bare `TypeError` from `fetch` (DNS/TLS/refused) | yes | the request never completed |
| HTTP 5xx (pooler or PostgREST unhealthy) | yes | the dependency is broken, not the request |
| HTTP 4xx (bad column, missing table, constraint) | **no** | a working database gave a real answer; a retry would fail identically |

`SERVICE_UNAVAILABLE` is now **retryable** and carries `Retry-After: 5`. The
breaker's own `SERVICE_UNAVAILABLE` keeps its explicit `retryable: false` — an
open breaker means "stop calling me", which is a different statement.

The hard part was not the classification but the **38 catch blocks** that do
`{ success: false, error: safeError(...) }`: they turn the error into a string,
and a string has no code, so `outcomeStatusCode` would still answer 400. Rather
than rewrite 38 call sites, the outage fact rides on the request context
(`LogContext.dbOutage`, written by `db/client.ts`, read by the surface wrapper) —
the same mechanism `flushedMetrics` already uses — and the wrapper upgrades a
failure to **503 + Retry-After + no-store**. A request that *succeeded* while the
database blipped keeps its 200.

The other half of the row already held: the idempotency key is retained, because
it is stored only on success. A client that replays with the same key re-runs the
action exactly once — see §3.

### Row 3 — Gemini down ❌

**`ai_unavailable` does not exist anywhere in the repository.** The string appears
only in three documents (`SCALABILITY_RELIABILITY_ARCHITECTURE.md`,
`BACKEND_ARCHITECTURE_2026-09-01.md`, `PHASE_C_OBSERVABILITY.md`), including the
runbook that tells an on-call engineer to expect it.

There is no `AI_UNAVAILABLE` error code, no branch that returns it, and nothing in
the frontend that renders a banner for it. `codeToStatus('AI_UNAVAILABLE')` falls
through to the unknown-code default, **500**. The AI path has a circuit breaker
named `gemini` and returns user-facing Indonesian text when the key is missing —
neither is the documented contract.

The second half of the row does hold, and is asserted: **an unrelated feature is
unaffected while the AI provider is down**. That is the invariant §6.5 exists to
protect.

The test asserts `codeToStatus('AI_UNAVAILABLE') === 500` deliberately: if someone
adds the code, the test fails and this file has to be updated.

**Resolved on the documentation side (2026-09-13).** All three documents now state
what actually happens rather than promising the code — the two architecture
documents carry a verification note on their degradation tables, and
`PHASE_C_OBSERVABILITY.md` A5 (the on-call runbook) says explicitly *"Do not look
for `ai_unavailable` — that code does not exist"*. No behaviour changed. The
**implementation** half is still open and is a product decision: adding the code
and a banner is small, but it changes what every AI-touching client does during an
outage, so it belongs with the owner rather than in a documentation pass.

### Row 4 — Fonnte down ⚠️

`enqueue()` is called from two places: `surfaces/notify.ts` for `wa.broadcast`,
and — since 2026-09-13 — `contexts/notifications/service.ts` for `wa.send`.

- **`kirimTawaranMassal` (broadcast)** — enqueued, but **up front, not on failure**.
  The job is queued whether or not Fonnte is reachable, which is arguably better
  than the documented behaviour; it just is not what the row says.
- **`kirimSatuPesanFonnte` (single message)** — **fixed 2026-09-13.** A *transient*
  failure (no HTTP status, 429, any 5xx) is parked in `job_queue` as a `wa.send`
  job and the caller gets the job id; the 2-minute sweep retries it up to
  `max_attempts` (5). A *permanent* failure (4xx — a bad number, a rejected
  token) still returns the error, because a retry would fail identically.
  `sweep-queue.ts` runs the job with `{ internal: true }`, which deliberately
  throws instead of returning a failure object: a returned failure would be read
  as success and mark the message delivered. Delivery is **at-least-once** — the
  same guarantee the broadcast path already gives. Pinned by
  `contexts/notifications/wa-single-durability.test.ts`.
- **202** — the wrapper never emits 202. `outcomeStatusCode()` maps to 429 / a
  code-derived status / 400 / 200, and nothing else. Both enqueue paths therefore
  answer **200 with `{ status: 'accepted', jobId }`**; the row's "return 202" is
  the part that remains untrue.

### Row 5 — FCM down ✅

`sendPushNotification` wraps the send in `try/catch` and returns `false`;
`sendMulticast` uses `Promise.allSettled` and never rejects. A push failure cannot
propagate into a caller that is halfway through writing the row it was notifying
about.

One thing the row does not mention, checked because it would have been a real bug:
`sendMulticast` returns `invalidTokens`, and a failed send marks the token invalid.
**No caller consumes that value** — all five call sites `await` and discard the
result — so an FCM outage cannot purge the token table. If a caller ever starts
acting on `invalidTokens`, that becomes a data-loss path under exactly this
failure, and the distinction between "token invalid" and "FCM down" has to be made
first.

### Row 6 — Storage down ⚠️

- **Server-side** (`_lib/storage.ts`): throws on a non-2xx response. **No retry.**
- **Browser-side** (`src/lib/uploadBerkas.ts`): `maxRetries = 3`, and it uploads to
  a server-minted signed URL.

So "upload retried" is true, but the retry lives in the client, not the backend —
which matters, because a client that closes the tab has no retry. "DB row written"
and "document shows pending" are decided by the caller and the frontend
respectively, not by the storage layer.

### Row 7 — Pooler saturated ⚠️

**Shedding works and is tested.** Priority classification, tier saturation, the
PostgREST-breaker signal, and the `503 + Retry-After + no-store` response shape are
all covered by `admission.test.ts` and re-asserted through the wrapper in
`chaos.test.ts`.

**Nothing is enqueued when a request is shed.** The shed response tells the client
to come back; it does not put the work in `job_queue`. For a read that is correct.
For a write it means a saturated instance converts a write into a client-side
retry rather than deferred work — which is defensible given the client already
holds the idempotency key, but it is not "shed P2/P3 to queue".

"Serve stale for P1" is only true for the public board, via the CDN headers in row
1. Interactive P1 paths have no stale cache to serve from.

---

## 3. §6.7 chaos suite — what runs, what does not

| §6.7 Test | Status |
|---|---|
| Inject PostgREST failure | ✅ `chaos.test.ts` — public board survives; the write path's real status recorded |
| Inject Gemini timeout | ✅ `chaos.test.ts` — unrelated feature unaffected; the `ai_unavailable` gap asserted |
| Replay a write with the same idempotency key | ✅ `chaos.test.ts` — handler runs once, result replayed; plus a guard that a *different* key does run it again |
| Kill the queue worker mid-job | ❌ **not in CI** — see below |
| Saturate the pool | ❌ **not runnable as written** — see below |

### Kill the queue worker mid-job — why it is not in CI

The assertion is "job re-claimed after `locked_until`; no duplicate side effect".
Testing it needs a real row in `job_queue` with a `locked_until` in the past, then a
call to `reclaim_stuck_jobs`. `job_queue` is the **production queue** — the
`sweep-queue` cron reads the same table, so a test row is not a fixture, it is a
job that a real worker may claim and execute. The test is therefore a scripted
drill against a disposable environment, not a CI test.

What *is* verified without that: `kernel/job-queue.test.ts` covers ownership and
redaction; the atomic claim is `FOR UPDATE SKIP LOCKED` inside the
`claim_next_job` RPC (migration 009), which cannot double-claim by construction;
`scripts/ci/verify-migrations.mjs` fails the deploy if that function is missing,
which is how the original silent degradation was caught.

### Saturate the pool — why it is not runnable as written

Phase B already recorded this: **the platform does not let us cap concurrency**, so
"fill the pool, then observe P2/P3 shedding" has no lever to pull. The achievable
substitutes are asserted instead: priority classes, the PostgREST-latency and
breaker-driven saturation signals, per-tier accounting, and the shed response
contract (`admission.test.ts`, `chaos.test.ts`).

---

## 4. Phase E items 20 and 22

**Item 20 — load test at 10× projected peak.** Not run, and deliberately:

- Against **production**, a 10× load test is exactly the event Phase B exists to
  bound. Running it would test the load shedding by causing the incident the
  shedding was built to survive, on a site with real candidates and real admins.
- Against **localhost**, the numbers would be meaningless: `astro preview` is a
  single Node process with no CDN, no Netlify function isolation, no Supavisor
  pooler and no network RTT to `ap-southeast-1`. The measured RTT is 99.7 % of the
  latency this system has (`DB_PERFORMANCE_AUDIT.md`), and it is absent locally.

The honest prerequisite is a **separate staging deployment** — `deploy-staging.yml`
already exists — pointed at a **separate Supabase project**. Neither exists today.

**Item 22 — pooler failover drill.** Supavisor's shared pooler has no
operator-triggerable failover. The nearest real drill is: point a staging
deployment at the direct connection (`:5432`) instead of the pooler and confirm the
system degrades rather than breaks. Same staging prerequisite.

---

## 5. What to do about the three false rows

Ordered by what actually hurts a user. All three were **approved by the owner on
2026-09-13** and are being closed in order.

| # | Fix | Status |
|---|---|---|
| 1 | **Row 4, single-message Fonnte.** A Fonnte outage silently loses a WhatsApp message | ✅ **Done 2026-09-13.** `enqueue('wa.send', …)` in the `catch` of `handleKirimSatuPesanFonnte`, mirroring `wa.broadcast`; transient failures only, and the worker throws so the queue owns the retry. See §3 Row 4 |
| 2 | **Row 2, DB-down write status.** Map a PostgREST failure to `SERVICE_UNAVAILABLE` (503, retryable, with `Retry-After`) so clients retry instead of giving up | ✅ **Done 2026-09-13.** `db/client.ts` classifies the failure, `LogContext.dbOutage` carries it past the 38 catch blocks, the wrapper answers 503 + Retry-After + no-store. Behavioural: clients that retry on 503 now retry during a DB outage — accepted by the owner |
| 3 | **Row 3, `ai_unavailable`.** Either implement the code and the banner, or correct the three documents that promise it | Documents corrected 2026-09-13; the **implementation** half is approved 2026-09-13 |

Row 3 was the most misleading of the three: an on-call engineer following
`PHASE_C_OBSERVABILITY.md` would look for a signal that could not exist.

---

## 6. Files

| File | Role |
|---|---|
| `netlify/functions/_lib/chaos.test.ts` | The executable part of §6.5 and §6.7 |
| `netlify/functions/_lib/kernel/admission.test.ts` | Priority classes, shedding, degradation signals |
| `netlify/functions/_lib/kernel/resilience.test.ts` | Retry, breaker, bulkhead primitives |
| `netlify/functions/_lib/kernel/deadline.test.ts` | The occupancy bound |
| `netlify/functions/_lib/kernel/job-queue.test.ts` | Ownership + redaction on the queue |
| `netlify/functions/contexts/notifications/wa-single-durability.test.ts` | Row 4 — the transient/permanent split and the enqueue-on-failure path |

Run it:

```bash
npx vitest run --project backend netlify/functions/_lib/chaos.test.ts
```
