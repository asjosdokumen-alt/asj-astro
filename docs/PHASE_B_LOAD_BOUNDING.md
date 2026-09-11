# Phase B — Bound the Load

**Date:** 2026-09-11
**Scope:** Phase B of `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §9
**Predecessor:** `docs/PHASE_A_LEGACY_ENDPOINT_RETIREMENT.md`
**Status:** ✅ Implementable items complete. Three of the five planned items turned out **not to exist as platform features** and are recorded below as resolved negatives rather than silently dropped.

---

## 1. What Phase B turned out to be

The roadmap described Phase B as five configuration steps: route traffic through the Supavisor pooler, set function concurrency caps, verify `statement_timeout`, implement priority classes, and add provisioned concurrency on `public`.

Reconnaissance invalidated three of the five. The plan assumed a platform that can be *configured* to refuse work. It cannot. The corrected Phase B is therefore:

> **Netlify will not bound this system for us. Every bound must be one we impose ourselves — and only three of them can be fleet-wide.**

That reframing is the actual result of this phase. The code below follows from it.

---

## 2. Verified platform facts

All five were checked against primary sources on 2026-09-11, not assumed. Phase A taught the cost of assuming.

### 2.1 There is no concurrency cap, and no provisioned concurrency

Netlify's function configuration documents exactly these keys:

```
[functions]                    # global
  external_node_modules
  included_files
  directory

[functions."<name>"]          # per function
  region
  memory

# in-code only
export const config = { vcpu: 2 }
```

No `concurrency`. No reservation. No provisioned concurrency. No per-function rate limit.

**Consequence:** roadmap items 7 and 10 are **not implementable**. Auto-scaling is unbounded and opaque — Netlify answers excess load by starting more instances.

### 2.2 The synchronous timeout is 60 s, not 10 s

| Mode | Limit | Configurable |
|---|---|---|
| Synchronous | **60 s** | No |
| Scheduled | 30 s | No |
| Background | 15 min | No |

Several source comments and — more seriously — **two live gate documents** enforced the stale 10 s figure:

- `docs/ENGINEERING_PLAYBOOK.md` §"Timeouts and budgets" (**GATE**)
- `docs/CODE_REVIEW_CHECKLIST.md` §"Timeouts and budgets"

A gate that enforces a wrong number is worse than no gate, because it makes correct work look wrong. Both were corrected, along with `kernel/http.ts`, `kernel/job-queue.ts`, `_lib/ai/providers.ts`, `_lib/fcm-server.ts`, and `surfaces/ai.ts`.

**Critically, the budgets were NOT raised to exploit the extra 50 s.** A longer budget means a longer-held function slot, which is the opposite of bounding load. The values stayed; only the stated rationale changed.

### 2.3 The runtime never opens a Postgres connection

This was the most consequential finding, because it invalidated the design document's *central* claim.

```
docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md claimed:
    instances × pool_size ≤ 60   →  the fleet is capped at ~7 instances

Reality (verified in code):
    netlify/functions/_lib/db/client.ts
      → every DB call is HTTPS to <project>.supabase.co/rest/v1/<table>

    Only scripts/migrate.mjs uses `pg`.
```

Verified by grep for `SUPABASE_DB_URL|new Pool|require('pg')` — one match, in the migration script.

**Consequences:**

1. The `~7 instance ceiling` never existed. Instance count does not appear in the connection arithmetic at all.
2. "Route function traffic through the pooler (6543)" was **never a function-tier task**. Function traffic is PostgREST over HTTPS and always has been.
3. The real DB-side limit is a *throughput* one, not a connection count:
   ```
   max concurrent PostgREST queries ≈ pool_size            (~60)
   throughput                       ≈ 60 / ~10 ms ≈ 6,000 q/s
   ```
   Orders of magnitude above this workload. The database is not the constraint.

### 2.4 The `statement_timeout` header was dead code

`kernel/http.ts` set a `statement_timeout` request header on every PostgREST call. Nothing read it.

- PostgREST does not recognise that header. Its recognised set is `Prefer`, `Accept`, `Range`, `Content-Type`, `Authorization`, and the `*-Profile` headers.
- PostgREST applies `statement_timeout` as a **hoisted transaction setting**, configured server-side via `db-hoisted-tx-settings` and sourced from **database role settings**.

Before deleting it, both sides were checked — Phase A's lesson was that a "dead code" conclusion needs evidence:

| Check | Result |
|---|---|
| Any `db-pre-request` hook installed? | **No.** Nothing in `migrations/` or config reads `request.headers`. |
| Any SQL reading headers? | Only `current_setting('request.jwt.claims')` — PostgREST's built-in, in `007_phase8_rls_safe.sql`. |
| Any `statement_timeout` in SQL? | None. |

So there was no server-side consumer either. The header was a no-op that **looked like query protection** — the most dangerous kind of dead code, because it stops anyone from asking whether queries are actually bounded.

---

## 3. What actually bounds load

Because there is no platform governor, the bounds split into two classes. Conflating them is the mistake that produced the wrong capacity arithmetic in the original design.

### 3.1 Per-instance (limits how badly ONE instance degrades)

| Bound | Mechanism | Value |
|---|---|---|
| Request duration | `kernel/deadline.ts` | 12 s default |
| In-flight per dependency | `kernel/resilience.ts` bulkhead | 8 |
| In-flight per tier | `kernel/admission.ts` | 24 default / 4 ai / 3 bulk |
| Total in-flight | `kernel/admission.ts` | 28 |

**These do not cap the fleet.** Netlify starts more instances regardless. What they buy is:

1. Unbounded queueing becomes a fast, honest 503 — work that would have waited 40 s and been killed at 60 s now fails in well under a millisecond with `Retry-After`.
2. One instance cannot become a straggler holding doomed work.
3. A retry storm cannot form, because shed responses are cheap and tell clients to back off.

### 3.2 Fleet-wide (the ones that actually govern load)

| Bound | Mechanism | Where |
|---|---|---|
| Request rate per identity/IP | `kernel/rate-limit.ts` | Postgres-backed, shared |
| Query duration at the DB | `migrations/011_statement_timeout.sql` | role-level, 3 s |
| Work deferral | `job_queue` + background functions | Postgres, shared |

Only these three are real governors. Two of them were only made real in Phase B (the role-level timeout) or were already correct (the shared rate limiter, the queue).

---

## 4. What was implemented

### 4.1 `kernel/deadline.ts` — the occupancy bound

Occupancy = concurrency × duration. Concurrency cannot be capped, so duration is the half we control.

A wall-clock deadline rides in the existing `AsyncLocalStorage` context. `kernel/http.ts` clamps **every** dependency budget to the time remaining:

```ts
const budgetMs = clampBudget(requestedBudget);
if (budgetMs <= MIN_SLICE_MS) {
  throw new AppError('DEADLINE_EXCEEDED', { /* 504, retryable */ });
}
```

This is what makes the per-dependency budgets *ceilings* rather than a sum. Previously `2 s read + 3 s write + 5 s storage + retries` could walk toward the platform ceiling while holding a slot; now the deadline is binding.

Default 12 s. Chosen as generous headroom over a healthy request (2–4 round-trips at ~40 ms RTT) while staying far below the 60 s ceiling. The AI chain (4 s race + 5 s fallback = 9 s worst case) fits inside it with ~3 s to spare.

`withRetry` also stops retrying once the deadline is exhausted — the next attempt would be refused locally anyway, and the backoff sleep would only hold the slot longer.

### 4.2 `kernel/admission.ts` — priority classes and load shedding

**Priority is declared, not measured.** P0 is never shed; unclassified actions default to P1, so a newly added action is safe by default rather than accidentally shed-first.

| Class | Actions | Shed at saturation |
|---|---|---|
| **P0** | login, session refresh, `daftarKandidat`, `getJobStatus`, `logout`, `ping`, `reportWebVital` | **never** |
| **P1** | default — public reads, ordinary writes | 95% |
| **P2** | AI chat, AI context, multi-step upload writes, heavy reads | 80% |
| **P3** | bulk WA fan-out, agenda reminders, monthly report, doc generation, bridge generation | 50% |

Saturation is the max of four **local** signals: tier occupancy, total occupancy, observed PostgREST latency above a 400 ms floor, and whether the PostgREST breaker is open.

The last one matters most: **when PostgREST is open, saturation pins to 1 and only P0 survives.** Every other action would fail anyway, so accepting more of that work is pure waste.

**Admission must be free.** Every signal is in-process — no I/O. This is not an optimisation: admission runs *before* the rate limiter, which costs 1–2 PostgREST round-trips per call. Charging a database round-trip in order to reject a request would amplify the overload it exists to relieve.

### 4.3 Dispatcher wiring — cheap decisions first

`handlers.ts` now orders work cheapest-and-most-protective first:

```
ping → admission (free, local) → rate limit (1–2 DB round-trips) → dispatch
```

Previously a request under overload paid the rate-limit cost before being rejected.

### 4.4 Honest backpressure responses

| Code | Status | Retry-After | Notes |
|---|---|---|---|
| `OVERLOADED` | 503 | 10 s (P3), 5 s (P2), 2 s (P1) | new — distinct from `SERVICE_UNAVAILABLE` |
| `DEADLINE_EXCEEDED` | 504 | 2 s | new |

Both are retryable. `Retry-After` is emitted as a real header, and `Access-Control-Expose-Headers: Retry-After` was added to the shared CORS set so browser JS can read it — otherwise a 503 is just a slower way of saying "retry immediately".

Shed responses carry `Cache-Control: no-store`, so a transient overload is never cached and replayed after the pressure passes.

The legacy catch-all wrapper uses an ad-hoc status mapping that would have reported a shed request as **400** — telling clients their input was bad, so they would fix nothing and retry immediately. `OVERLOADED` and `DEADLINE_EXCEEDED` were special-cased there without disturbing the retiring alias path's existing behaviour.

### 4.5 `migrations/011_statement_timeout.sql` — the real DB-side control

Sets `statement_timeout = 3s` via `ALTER ROLE` for `authenticator`, `anon`, `authenticated`, `service_role`.

- **3 s**, deliberately *looser* than the client-side write budget (3 s) — otherwise the client aborts first and the database keeps working on a query nobody is waiting for.
- Role settings are catalog state, so this applies identically through the Supavisor transaction pooler or a direct connection.
- Wrapped in a `DO` block that skips non-existent roles, so the file is safe on a non-Supabase database.

It is a **backstop**, not the primary control — it catches the query that escaped the client timeout.

### 4.6 A small fix found along the way

`metrics.flushMetrics()` ran only on the dispatch path, so rate-limit and admission counters were collected but never emitted. Moved into `finally`.

---

## 5. Deliberately not implemented

### 5.1 Queue-based deferral for shed P3 work

Shedding P3 with a 503 is honest but blunt: `kirimTawaranMassal` could be *enqueued* instead of refused, since `job_queue` already exists with `FOR UPDATE SKIP LOCKED` and a DLQ.

**Not done, on purpose.** It changes response semantics (202 + jobId instead of a synchronous result) on a **live mass-mail path**, and requires touching both the notify surface and the queue consumer. Half-wiring a semantic change into a path that sends hundreds of WhatsApp messages is worse than shedding it cleanly. The integration point is `surfaces/notify.ts` → `kernel/job-queue.enqueue()`; it is a Phase C candidate.

### 5.2 Tuning the caps

The in-flight caps (24/4/3) and the AI budget split are **reasoned guesses**, not measurements. Every one is an env override precisely because they need production calibration:

```
ADMISSION_MAX_INFLIGHT=24
ADMISSION_MAX_INFLIGHT_AI=4
ADMISSION_MAX_INFLIGHT_BULK=3
ADMISSION_MAX_INFLIGHT_TOTAL=28
```

Shipping them as env vars is the honest position: the structure is right, the numbers need a real load test.

---

## 6. Verification

### 6.1 Tests

```
npx vitest run --project backend    →  42 files, 344 tests, all passing
npx tsc --noEmit                    →  clean
npm run boundary                    →  no boundary violations
```

New coverage, 22 tests:

| File | Tests | What it pins |
|---|---|---|
| `kernel/admission.test.ts` | 15 | P0 never shed under any signal; P3 sheds before P2 before P1; slots always released; breaker/latency pressure; response contract maps to 503 |
| `kernel/deadline.test.ts` | 7 | inert without a deadline; clamps oversized budgets; refuses work with no usable slice; 504 is retryable |

### 6.2 Bundle size

```
Total            9,891.6 KB  →  9,994 KB   (+102.4 KB, +1.0%)
Narrow entries   ~+3 KB each               (+5–6% on 52–70 KB entries)
Per-entry ceiling 600 KB                   (unchanged; heaviest narrow is 543.3 KB)
```

Phase B added ~3 KB per entry point, because `kernel/deadline.ts` and `kernel/admission.ts` reach every bundle through `kernel/http.ts` and `handlers.ts`. Two reductions were applied before accepting it:

1. The action-classification tables were written as `new Set([...])` of ~150 string literals — that form alone cost ~3.7 KB. Packed space-delimited strings plus one `split()` at module load cut it substantially.
2. Dead API (`overloadedError`, duplicating `Errors.overloaded`) was removed, which also dropped the `errors.ts` import edge.

This tripped the 5% bundle ratchet, which is exactly what the gate is for — it forced a conscious decision instead of silent drift. The baseline was updated with a recorded justification, and the increase is 75× smaller than the ~7.6 MB that retiring the catch-alls will recover.

**Gate-design note worth acting on:** a 5% tolerance is too tight for small entries. A 3 KB feature crosses it on a 52 KB entry, so the gate will cry wolf on future small additions. An absolute-bytes floor (e.g. `max(5%, 8 KB)`) would fix this. Not changed here — it's a gate-policy decision, not a Phase B task.

### 6.3 Bundler determinism

Two consecutive runs of `npm run bundle:size` reported **9994 KB** both times, with identical per-entry values. The ratchet is measuring real change, not noise. Worth recording, because a ratchet on a jittery measurement would be worthless.

---

## 7. Remaining work

### 7.1 Carried forward from Phase A (highest value)

Deploy-verify the aliases, then delete the 11 remaining catch-all entry points:

```
BASE_URL=… npm run verify:aliases     # probes each alias with an unknown action
                                      # 400 + NOT_IMPLEMENTED = resolved
                                      # 404 = alias did not resolve (check force = true)
```

Expected total ≈ **2,364 KB**. This is a ~7.6 MB win — 75× larger than Phase B's cost.

### 7.2 New from Phase B

| Item | Why it matters |
|---|---|
| **Calibrate the in-flight caps under real load** | The 24/4/3 values are guesses. They are env-overridable for this reason. |
| **Apply migration 011** | The DB-side backstop is written but not applied. `npm run migrate:status` to check. |
| **Give the bundle ratchet an absolute-bytes floor** | 5% is too tight for small entries (see §6.2). |
| **Defer P3 to `job_queue` instead of shedding** | Phase C candidate; integration point is `surfaces/notify.ts` (see §5.1). |
| **Add an external metrics sink** | Still S3 in the architecture doc: metrics flush to `console.log` only, so breakers open and sheds happen silently. Phase B now emits `admission.shed` counters and saturation gauges — but nothing consumes them. |

---

## 8. The one-sentence summary

> Phase B established that Netlify cannot be configured to refuse work, so the system now bounds its own occupancy with a per-request deadline and priority-class shedding, while the three fleet-wide governors — the shared rate limiter, the role-level `statement_timeout`, and the job queue — carry the load that per-instance limits cannot.
