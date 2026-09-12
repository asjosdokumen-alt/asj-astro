# Phase C — Make It Visible

**Date:** 2026-09-11
**Scope:** Phase C of `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §11 (items 11–14)
**Predecessor:** `docs/PHASE_B_LOAD_BOUNDING.md`
**Status:** Implementation complete. Item 11 (external APM) ships as an optional webhook sink — see §2 for why that is a deliberate choice and not a shortcut.

**Phase C gate, restated:** *an injected PostgREST failure produces an alert within 2 minutes, and the health endpoint explains it.*
- "an alert within 2 minutes" → §4 (alerts + runbooks), fired off the §3 sink.
- "the health endpoint explains it" → §3 (`GET /health`). The runbook for the PostgREST alert walks through exactly this endpoint, so the gate is a scripted procedure rather than a claim. See §6 for the drill.

---

## 1. The problem Phase C actually had to solve

Phase B ended with a system that bounds its own load correctly and can tell you nothing about whether it is doing so. That is a bad combination: every bound Phase B added is a decision point (shed here, defer there, open this breaker), and none of those decisions were observable. An operator could not distinguish "quiet because healthy" from "quiet because everything is being shed".

§7 already had the diagnosis written down: *"The gap is not instrumentation — it is the sink and the response."* That is right, and the three deliverables follow it directly:

| Roadmap item | What was missing | What Phase C added |
|---|---|---|
| 11. Ship metrics to an APM sink | metrics went to `console.log` and stopped | `_lib/metrics-sink.ts` — fire-and-forget webhook |
| 12. Health endpoint | only `ping`, which reports nothing | `netlify/functions/health.js` + `_lib/health.ts` |
| 13. Alerts with runbooks | no alerting rules anywhere | §4 of this document |
| 14. SLOs + error budgets | targets existed in prose only | §5 of this document |

---

## 2. Item 11 — the sink, and why it is a webhook

**Decision (owner-selected, 2026-09-11): a Netlify-hosted webhook receiver, not a third-party APM.**

The alternatives were a hosted APM (Datadog/Better Stack/etc.) or an OTLP collector. Both were rejected for the same reason §12 of the architecture doc gives for most additions: *the cost must be justified by a failure it prevents.* A third-party APM means another account, another secret, another vendor in the critical path, and — the deciding factor — another quota to exhaust. The existing signals are already good enough to page on. What they lacked was a destination.

So the sink is a plain `POST` of the already-flushed metrics payload to a URL you control. Properties:

- **Gated on an env var.** With no `METRICS_SINK_URL` the export is a no-op. A missing sink **must not** be able to break a request, and this is how that is guaranteed rather than hoped for.
- **Fire-and-forget, always.** It never throws into the caller and never blocks the response. The wrapper's `finally` block calls `flushMetrics()` after the response is already determined; making that block able to fail would turn a metrics problem into a user-visible error.
- **Reuses the flushed payload.** `flushMetrics()` now *returns* what it emitted, so the sink receives the exact same object the log line carries. There is no second serializer to drift.
- **Bounded.** The POST has a timeout budget and is skipped entirely when the request deadline has almost expired — a metric export must never become the reason a request misses its deadline.

**What this does not do.** It does not aggregate, alert, or retain. Whatever URL you point it at is responsible for that. The reference receiver in §4.3 is deliberately the smallest thing that can work: receive, evaluate the alert rules, notify.

---

## 3. Item 12 — the health endpoint

### 3.1 Why a new entry point and not an action on `bridge-links`

Two reasons, one of them security:

1. **Blast radius.** `bridge-links` bundles all 15 surfaces and 14 contexts (~1.5 MB). A probe that fires every minute must not depend on the entire application being loadable.
2. **Reachability.** An action registered in `surfaces/index.ts` is answerable by *every* entry point that reaches the router. Gating it would then depend on the gate holding everywhere, forever. `health.js` is a bespoke entry point (like `ping`, `ingest`, `share-data`), reachable from exactly one URL.

This is why `getHealth` is deliberately **absent** from `surfaces/index.ts` even though the handler exists in `contexts/diagnostics`. The omission *is* the access control, and it is commented as such at the point of omission so that a future reader does not "fix" it.

### 3.2 The auth model — fail closed

| Request | Response |
|---|---|
| `GET /health` (no header) | `200` liveness — `{status, timestamp, detail}` and nothing else |
| `GET /health?detail=1` or `POST /health`, no `HEALTH_TOKEN` configured | **`503`** — `reason: "HEALTH_TOKEN not configured"` |
| detail request, token set, no/invalid token | `401` — `reason: "missing or invalid token"` |
| detail request, malformed `Authorization` (no `Bearer` scheme) | `401` — distinct reason string |
| detail request, valid token, report `ok`/`degraded` | `200` + full report |
| detail request, valid token, report `down` | **`503`** + full report |

Three decisions worth stating explicitly, because each is the opposite of the naive implementation:

- **Unconfigured fails closed.** A missing secret makes the endpoint return 503, not 200-with-everything. An unconfigured secret must never degrade silently into a public endpoint that enumerates dependencies, queue depth, and upstream error strings.
- **A wrong token is never downgraded.** Falling back to the liveness body would make a monitor with a mistyped token look healthy forever while the detailed probe it was meant to run never happens.
- **A malformed header is a caller error, not an anonymous request.** Same failure mode as above, one step earlier. Without this check, `Authorization: <token>` (no `Bearer `) silently receives the public response. This was found by a test, not by inspection — see §3.4.

`503` on `down` means an uptime monitor that does not parse JSON is still correct.

### 3.3 What it reports

```jsonc
{
  "status": "ok" | "degraded" | "down",
  "reasons": ["..."],              // never leave the reader to infer why
  "levels": ["warn", "fail"],
  "timestamp": "...",
  "instance": {                    // this ONE instance — a sample, not a census
    "dependencies": [              // every configured dep, healthy or not
      { "name": "postgrest", "breaker": {"state":"closed","failures":0,"openForMs":0},
        "inflight": 0, "maxConcurrent": 8, "threshold": 5, "windowMs": 30000, "coolDownMs": 15000 }
    ],
    "breakersOpen": 0,
    "bulkheadSaturated": false,
    "admission": { "inflight": {}, "inflightTotal": 0, "caps": {}, "totalCap": 28,
                   "postgrestEwmaMs": 0 },
    "metricsPending": false
  },
  "shared": {                      // database-derived — GLOBAL, not per-instance
    "postgrest": { "reachable": true, "latencyMs": 41, "state": "closed" },
    "jobQueue": { "reachable": true, "depth": 0, "dead": 0 }
  },
  "thresholds": { "breakerOpenMs": 120000, "queueDepth": 100, ... }
}
```

Two design points that matter more than the shape:

**Healthy dependencies are listed, not omitted.** The obvious implementation iterates the breaker's internal `records` map — which only contains dependencies that have *failed at least once*. That version reports the unhealthy dependencies and silently omits every healthy one, which is the opposite of what an on-call engineer needs. Both `snapshot()` methods therefore seed their key set from `DEPENDENCY_CONFIGS`. This is the load-bearing assertion in `health-snapshot.test.ts`, and it is a genuine trap: the naive version looks correct and passes a casual read.

**The doc admits what it cannot see.** Netlify is stateless and runs many instances; there is no fleet-wide registry and no instance-count API. So `instance.*` is a sample of one, and only `shared.*` is global. **"Breaker closed on this instance" does not prove the fleet is healthy** — a breaker only opens on an instance that actually saw the failures. This is precisely why metrics must reach a sink (§2) rather than being read back from here, and it is written into the module header so nobody has to rediscover it during an incident.

### 3.4 What the tests are actually for

`_lib/kernel/health.test.ts` (11 tests) covers report assembly — including the enumeration regression above and the escalation to `down` when a breaker has been open past the 2-minute threshold.

`_lib/kernel/health-entrypoint.test.ts` (19 tests) covers the gate, and is organised around the three ways an access check usually fails:
1. fails open when unconfigured,
2. downgrades a wrong credential to the public response,
3. compares in variable time.

It is written that way because **the risk here is not a wrong number, it is a wrong access decision.** The malformed-header bug in §3.2 was found by this suite, not by reading the code — which is the argument for the suite's existence.

One testing note, because it cost real time and will recur: the entry point is CommonJS inside a `"type": "module"` package, so it is evaluated in a `vm` context. Its `await import('./_lib/health')` **cannot** be mocked through a context property — scoped `import` is always the syntax-level form, and Node refuses the vm callback without `--experimental-vm-modules`. The loader therefore rewrites that single dynamic import to `require` before evaluating, which is faithful because Netlify bundles the function as one CommonJS file with no code splitting. The rewrite is asserted, so it fails loudly rather than silently skipping the detail path.

---

## 4. Item 13 — alerts, with the runbook that resolves each

### 4.1 The rules

Thresholds are §7.2, unchanged — they were already justified there. What Phase C adds is that each one now names the **query** that resolves it, not just the condition that fires it.

| # | Alert | Condition | Severity |
|---|---|---|---|
| A1 | Latency | p95 per action > 800 ms for 5 min | warn |
| A2 | Traffic | req/s down −80 % vs 7-day baseline | page |
| A3 | Errors | error rate > 2 % for 5 min | page |
| A4 | Queue depth | `job_queue` runnable depth > 100 | warn |
| A5 | Breaker open | any breaker open > 2 min | page |
| A6 | Dead letters | any arrival in `status='dead'` | page |
| A7 | DB unreachable | `shared.postgrest.reachable === false` | page |

A2 and A3 are the two that fire *after* users are affected. A4–A7 fire *before*. Configure all of them; if only some can be configured, configure A4–A7 first — that is the entire point of the §7.2 note "alert on saturation, not just errors".

### 4.2 The runbooks

Each ends at the health endpoint, because that endpoint was built to answer exactly these questions.

**A5 — breaker open > 2 min**
```
curl -s -H "Authorization: Bearer $HEALTH_TOKEN" \
  "https://<site>/.netlify/functions/health?detail=1" | jq '.instance.dependencies[] | select(.breaker.state != "closed")'
```
Read `openForMs`: a just-opened breaker and a ten-minute-old one are the same `state` and very different incidents. Then read `shared.postgrest` — if the open breaker is `postgrest` and `shared.postgrest.reachable` is `false`, the cause is the database, not the app.
- `postgrest` → go to A7.
- `gemini` / `fonnte` / `fcm` → an upstream is down. Confirm with the `shared`/log evidence. **Do not look for `ai_unavailable` — that code does not exist** (`docs/PHASE_E_DEGRADATION_MATRIX.md`: only 4 of the 7 §6.5 rows are real). What actually happens: the Gemini path has a `gemini` breaker and returns user-facing Indonesian text when the key is missing; Fonnte **broadcasts** are enqueued up front, and a **single message** is enqueued on a *transient* failure (job type `wa.send`, retried by the 2-minute sweep) — a 4xx still fails immediately; FCM is logged and dropped. **No user-facing action is required** while the matrix holds — the alert is informational, and the escalation trigger is `openForMs` growing past ~15 min.
- Nothing looks wrong → the breaker is in `half-open` and probing. Wait one cooldown (15–60 s by dependency) and re-read; do not reset it by hand. `git grep 'breaker.reset'` shows it is test-only.

**A7 — PostgREST unreachable**
```
curl -s -o /dev/null -w '%{http_code}\n' "$SUPABASE_URL/rest/v1/job_queue?select=id&limit=0" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```
- `401`/`403` → the key. Run `npm run verify:env:validate`; it checks resolved values *by shape and role*, not just presence, which is what caught the placeholder `SUPABASE_URL` on 2026-09-11.
- `404` → the URL lost its project ref. Same check.
- timeout / connection refused → the database or pooler. Supabase status page first, then `migrations/011_statement_timeout.sql` to confirm the role settings still apply.
- `200` from curl but the health probe fails → the probe runs *inside* the function runtime. Compare the function's resolved env with the CLI's: `npm run verify:env:resolve`.

**A4 — queue depth > 100**
```
curl -s "$SUPABASE_URL/rest/v1/job_queue?select=type,status&status=in.(pending,failed)" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Prefer: count=exact" -I | grep -i content-range
```
Then group by `type` — a depth made of one job type is a stuck worker, not load. Check whether `sweep-queue` is running at all (`netlify.toml` → `[functions."sweep-queue"] schedule = "*/2 * * * *"`; scheduled functions only fire on **published** deploys). If `failed` dominates, read `last_error` on those rows.

**A6 — dead letters**
A dead job is committed work that will never complete without a human. Do not delete the row:
```
SELECT id, type, attempts, last_error, payload->'createdBy'
FROM job_queue WHERE status = 'dead' ORDER BY created_at DESC;
```
Fix the cause, then reset the row to `status='failed', attempts=0` so the sweep retries it. Investigate before resetting — a job that dead-letters twice is a bug, not bad luck.

**A2 — traffic −80 %**
Almost always a *good* explanation, and the job is to rule those out before paging anyone. Check: a deploy in progress, a CDN purge, or a shift in traffic mix. Only after those are excluded does this indicate a real outage that is failing so early it never emits an error.

**A1 / A3** — read `instance.admission.postgrestEwmaMs`. Above 400 ms the admission controller is already applying pressure and above 800 ms it is shedding. If the EWMA is high and `admission.inflightTotal` is near `totalCap`, this is genuine saturation and the correct action is to look at *which* action is slow (per-action p95), not to raise the caps. Raising `ADMISSION_MAX_INFLIGHT*` under saturation makes it worse.

### 4.3 The reference receiver

The sink URL is yours to choose. If you want the smallest thing that satisfies the Phase C gate, a second Netlify function in the same site works and needs no third-party account: `POST` the payload into it, evaluate the rules above, and notify on the transitions. Keep it a *separate* function from `health.js` so that a broken receiver cannot take down the health probe.

**State has to live somewhere.** Alert evaluation is stateful (a 5-minute window, a 7-day baseline), and functions are stateless. This is the one piece of Phase C that is genuinely not trivial, and it is the reason the sink is fire-and-forget rather than fire-and-await-success: the receiving end is allowed to be lossy and simple.

---

## 5. Item 14 — SLOs and error budgets

§7.3's table, now with the metric that measures each one and where it comes from. This column did not exist before, which is why the table could not be acted on.

| SLO | Target | Error budget | Measured by |
|---|---|---|---|
| Public job board availability | 99.5 %/month | ~3.6 h/month | A2/A7 — CDN hit rate + reachability |
| Application submit success (excl. client error) | 99.9 % | ~43 min/month | A3, filtered to `submitApply`/`submitFormPelamar` |
| Admin CRUD p95 | < 400 ms | — | A1, filtered to admin actions |
| Public read p95 (CDN hit) | < 100 ms | — | A1 + CDN cache-hit ratio |
| Job queue delivery within 15 min | 99 % | — | `job_queue` `created_at` → `completed_at` |
| Dead-letter arrivals | 0/day | any arrival pages | A6 |

**Error budget policy.** A budget is only useful if exhausting it changes behaviour. The rule:

- **< 50 % consumed** — ship normally.
- **50–100 % consumed** — no new work that increases occupancy. Reliability fixes only.
- **100 % consumed** — freeze feature work on the affected path. The next change to it is a reliability fix, chosen from this document's §4.

The affected *path*, not the whole system: burning the application-submit budget restricts `files.js` and its contexts, not admin CRUD.

**On the two latency SLOs.** They have no error budget because they are not availability targets — they have no "acceptable failure rate". They are the thresholds at which A1 fires, which is equivalent and simpler.

---

## 6. The gate, as a procedure

Phase C's gate is not a document, it is a thing you run. To verify:

1. **Inject the failure.** Confirm `HEALTH_TOKEN` and `METRICS_SINK_URL` are set on the site, then point the DB at an unreachable host, or block egress to `<project>.supabase.co`. (The chaos suite in §6.7/Phase E automates this; until then, do it by hand.)
2. **Watch the sink.** Within 2 minutes (`sweep-queue` runs every 2 min, so this is the tightest realistic loop) A5 and/or A7 should transition to firing. If they do not, the sink is the problem — check it is configured, since its absence is a deliberate no-op.
3. **Ask the health endpoint why.**
   ```
   curl -s -H "Authorization: Bearer $HEALTH_TOKEN" \
     "https://<site>/.netlify/functions/health?detail=1" | jq '{status, reasons, pg: .shared.postgrest}'
   ```
   Expect `status: "down"`, a `reasons` entry naming PostgREST and the actual error, `shared.postgrest.reachable: false`, and an HTTP **503**.
4. **Confirm the degradation held.** The public board should serve stale from CDN; writes should return 503 with `Retry-After` and the idempotency key intact. If either fails, that is a §6.5 finding, not a monitoring finding — file it there.

Step 3 is the whole point. Before Phase C, step 2 was impossible and step 3 had no answer.

---

## 7. Files

| File | Change |
|---|---|
| `netlify/functions/_lib/health.ts` | **new** — report assembly, thresholds, DB probes |
| `netlify/functions/health.js` | **new** — bespoke entry point, fail-closed gate |
| `netlify/functions/_lib/metrics-sink.ts` | **new** — the item-11 exporter, gated on `METRICS_SINK_URL` |
| `netlify/functions/_lib/kernel/resilience.ts` | `snapshot()`/`openCount()` on breaker, `snapshot()` on bulkhead |
| `netlify/functions/_lib/kernel/metrics.ts` | extracted `metricsSnapshot()`, `metricsEmpty()`; `MetricsPayload` type; `flushMetrics()` returns its payload |
| `netlify/functions/_lib/kernel/log.ts` | `LogContext` exported; `flushedMetrics` carries the payload to the sink |
| `netlify/functions/_lib/handlers.ts` | parks the flushed payload on the request context |
| `netlify/functions/_lib/netlify-wrapper{,-surface}.ts` | export metrics after the response is built, un-awaited |
| `netlify/functions/sweep-queue.ts` | exports its own sweep metrics (no wrapper to do it) |
| `netlify/functions/_lib/kernel/health*.test.ts`, `metrics-{sink,pipeline}.test.ts` | **new** — 66 tests |
| `netlify/functions/contexts/diagnostics/service.ts` | `handleGetHealth` (admin-guarded, defence in depth) |
| `netlify/functions/surfaces/index.ts` | comment recording *why* `getHealth` is absent |
| `netlify/functions/_lib/env.ts` | `HEALTH_TOKEN`, `METRICS_SINK_*` whitelisted |
| `scripts/ci/verify-env.mjs` | all three documented as optional (both features degrade safely) |

---

## 8. What Phase C does not claim

- **It does not give fleet-wide visibility.** One instance answers `/health`. Only the sink aggregates.
- **The sink does not aggregate, alert, or retain.** That is the receiver's job, and the receiver is intentionally not built here.
- **A2's 7-day baseline needs history.** Until the sink has been running for a week, that alert cannot fire correctly. Expect it to be noisy or silent at first — that is not a bug in the rule.
- **The gate has not been executed against production yet.** §6 is the procedure, and it needs `HEALTH_TOKEN` and `METRICS_SINK_URL` deployed first. Until it is run, Phase C is implemented but unverified — and Phase E (§6.7) is where it becomes a standing claim rather than a one-time check.
