# Backend Architecture — Scalability & Reliability Design

> **Scope:** ASJ Portal v2 (Astro + Preact + Supabase on Netlify Functions)
> **Companion to:** `docs/BACKEND_ARCHITECTURE_2026-09-01.md` (target design), `docs/DB_PERFORMANCE_AUDIT.md` (measured data-layer numbers)
> **Purpose:** Define how the backend absorbs increasing load and stays stable under burst traffic.

---

## 0. Executive summary

**This system does not have a throughput problem. It has a burst-absorption and a finish-the-refactor problem.**

Measured reality from the existing audits:

| Fact | Value |
|---|---|
| Whole database | 14 MB |
| `database_candidate` rows | 225 |
| Slowest SQL query in production | 1.8 ms |
| Median network round-trip to Supabase | 39.2 ms (p95 69.2 ms) |
| Deployed function bundles | 19.4 MB across 28 entry points, 28 of them ~690 KB and byte-identical (pre-Phase A) |
| Postgres connection budget | ~60 (Supabase free/Pro), owned by PostgREST/Supavisor — **not** multiplied by function instances |

Three conclusions follow directly:

1. **The database is never the bottleneck.** 14 MB fits in shared buffers permanently.
2. **Latency is dominated by network round-trips, not compute.** So the winning move is *fewer, larger, cached* requests — never more network hops.
3. **The binding constraint on horizontal scale is not connection arithmetic.** An earlier revision of this document claimed `instances × pool_size ≤ 60` capped the fleet at roughly 7 instances. **That was wrong** and is corrected in §3.6 and §8.2: the function runtime never opens a Postgres connection, so instance count is not multiplied into the connection budget at all. What replaces it is a throughput ceiling at PostgREST, and it is far away.

### The five things that actually cost reliability today

| # | Defect | Impact |
|---|---|---|
| S1 | **Every entry point inlined the full action router** — `handlers.ts` statically imported `surfaces/index`, and Netlify does no code splitting, so all 15 surfaces + 14 contexts landed in each of 28 bundles | ~690 KB each, 19.4 MB deployed. **Fixed in Phase A → 9.9 MB** (`docs/PHASE_A_LEGACY_ENDPOINT_RETIREMENT.md`) |
| S2 | **No function concurrency cap — and no way to configure one** | Netlify exposes no such setting, so a burst cannot be bounded at the platform. **Addressed in Phase B** by per-instance admission control, priority classes and load shedding (`kernel/admission.ts`). The fleet-wide weight is carried by the shared rate limiter and DB-side `statement_timeout` |
| S3 | **Metrics flush to `console.log` only — no external sink, no alerts** | Incidents are still archaeology; breakers open silently |
| S4 | **No load-shedding / priority classes** | Admin bulk operations and public traffic compete for the same capacity. **Fixed in Phase B** — P0–P3 in `kernel/admission.ts` |
| S5 | **12 catch-all entry points remain** at 693.6 KB each (8,323 KB = 83% of current total); 11 are deletable (`bridge-links.js` must stay) | Aliases prepared; deletion gated on deploy verification |

### Design principles

1. **Absorb before you scale.** The cheapest request is the one that never reaches a function. CDN first, always.
2. **Bound everything.** Every dependency gets a timeout, every retry gets jitter, every concurrency gets a cap. Unbounded = unreliable.
3. **Fail in a defined direction.** Every failure mode has a written-down degradation behaviour. "500" is never a design.
4. **Prefer eventual consistency on reads, strong consistency on writes.** Stale is survivable; lost is not.
5. **Scale by removing shared mutable state, not by adding servers.** Stateless functions scale for free; shared state is what breaks.

---

## 1. Load model & capacity envelope

Traffic to a recruitment portal is **bursty, asymmetric, and event-driven**. Designing for a uniform req/s figure would be wrong.

| Load event | Shape | Dominant cost | Absorbed by |
|---|---|---|---|
| Job announcement published | Read spike, 10–100× baseline, minutes | CDN cache misses | L0 CDN (`s-maxage=60`) |
| Intake batch — many candidates apply at once | Write + upload burst | Postgres connections, Storage | Idempotency + `job_queue` |
| Admin WhatsApp blast to hundreds | Async fan-out, long tail | Fonnte rate limits | `job_queue`, background function |
| AI CV parsing batch | 3–25 s per item, long-running | Function concurrency | Background function (15 min) |
| Admin CRUD during an event | Steady, latency-sensitive | Competes with the above | Priority class + bulkhead |

### The capacity envelope

```
Netlify function limits (verified against the configuration docs, 2026-09-11)
  synchronous      60 s     (hard, platform, NOT configurable)
  scheduled        30 s     (hard, platform)
  background       15 min   (hard, platform)

  Per-function configurable keys: region, memory.  That is all.
  There is NO concurrency key, NO provisioned concurrency, NO rate limit.
  `vcpu` exists but is set in code, not config.

  ⚠️ Earlier revisions of this document said the synchronous limit was 10 s.
     It is 60 s. Several code comments and two gate documents repeated the
     stale figure and were corrected in Phase B. The wrong number mattered:
     it made the per-dependency budgets look tight when they are in fact
     conservative, and it hid the fact that nothing bounded a request's
     *duration* short of the platform ceiling.

Database concurrency — CORRECTED
  ❌ Wrong (pre-Phase B):  postgres_connections = instances × pool_size
                          Budget 60, pool 8  →  ceiling 7 instances

  ✅ Right:                the runtime opens NO Postgres connection.
                          Every function DB call is HTTPS to PostgREST
                          (`<project>.supabase.co/rest/v1/...`). PostgREST
                          holds its own pool; Supavisor multiplexes it onto
                          Postgres. Instance count does not appear in the
                          arithmetic at all.

  The real DB-side ceiling is a throughput one:
     max concurrent PostgREST queries  ≈ pool_size            (~60)
     throughput                        ≈ pool_size / avg_query_duration
                                       ≈ 60 / ~10 ms  ≈ 6,000 q/s
  Which is orders of magnitude above this workload. The database is not the
  constraint, and the "~7 instance ceiling" never existed.
```

**What this means for scale.** Because there is no platform concurrency cap and no connection arithmetic, **nothing external bounds the fleet**. Netlify answers load by starting more instances, and it will keep doing so. The only bounds available are ones we impose ourselves, and they bound *occupancy* rather than instance count:

| Bound | Mechanism | Scope |
|---|---|---|
| Request duration | `kernel/deadline.ts` (12 s default) | per request |
| Per-dependency concurrency | `kernel/resilience.ts` bulkhead (8/dependency) | per instance |
| Per-tier in-flight work | `kernel/admission.ts` caps + priority classes | per instance |
| Request rate per identity/IP | `kernel/rate-limit.ts` (Postgres-backed) | **fleet-wide** |
| Query duration at the DB | `migrations/011_statement_timeout.sql` (role-level, 3 s) | **fleet-wide** |
| Work deferral | `job_queue` + background functions | **fleet-wide** |

Only the last three are fleet-wide. The first three are per-instance, which means they limit how badly one instance degrades — they do not cap the fleet. This distinction is the single most important thing to understand about this design, and it is why the rate limiter, the DB-side timeout, and the queue carry the real weight.

### Design implications

| Implication | Action |
|---|---|
| Reads are cheap and cacheable | Push them to the edge; never let a cached read touch Postgres |
| Writes are the scarce path | Make them idempotent so they can be safely retried or queued |
| Long work must not hold a slot | Move AI/ingest/WA to background functions + `job_queue` |
| Bursts must be shaped, not absorbed | Priority classes + load shedding + shared rate limits |

---

## 2. Service decomposition

### 2.1 Current state — a half-applied refactor

The repository currently contains **both topologies at once**:

```
netlify/functions/
├── surfaces/            15 files  ✅ target entry points (index.ts 220 LOC, others 11–79 LOC)
├── contexts/            14 dirs   ✅ bounded contexts, service.ts + repository.ts + index.ts
├── _lib/kernel/         13 files  ✅ http, resilience, errors, log, metrics, cache,
│                                     rate-limit, validate, events, db, job-queue,
│                                     optimistic, request-helpers
├── *.js                 29 files  ❌ legacy fat entry points, still deployed
└── sweep-queue.ts                 ✅ scheduled worker (*/2 * * * *)
```

This is the **highest-priority item in the whole design**, because it is the difference between the refactor's benefits being realised and being merely present in the repository.

### 2.2 Why the target is a modular monolith, not microservices

This was correctly decided in the 2026-09-01 audit and the reasoning still holds, but it is worth restating precisely because it is the most commonly mis-applied decision in this domain:

> At this scale, **round-trips are 99.7 % of the latency budget**. Splitting into network-separated services means paying the only cost you actually have, once per hop.

Microservices buy: independent deploy cadence, independent scaling, technology heterogeneity, fault isolation across teams.
Microservices cost: one network round-trip per call, distributed transactions, distributed tracing, operational surface.

With 225 rows and 14 MB, you need **none** of the benefits and would pay **all** of the costs. The correct target is a **modular monolith with enforced internal boundaries, deployed as narrow serverless surfaces** — which is exactly what `surfaces/` + `contexts/` + `_lib/kernel/` already is.

### 2.3 The three layers

| Layer | Contents | Dependency rule |
|---|---|---|
| **Surfaces** (`surfaces/*.ts`) | 15 entry points, thin registries | May import any context's public interface. May **not** import another surface. |
| **Contexts** (`contexts/*/`) | 14 bounded contexts, each owning its tables | May import the kernel. May **not** import another context — must go through the owner's exported interface. |
| **Kernel** (`_lib/kernel/*`) | http, resilience, errors, log, metrics, cache, rate-limit, validate, events, job-queue, optimistic | Depends on **nothing** internal. |

Boundary enforcement is via `dependency-cruiser` (`npm run depcruise`) plus the custom indexer gate (`npm run boundary`, `npm run idx:gate`). This is the mechanism that keeps a modular monolith from decaying into a distributed ball of mud *without* paying for the network.

### 2.4 The 14 contexts

| Context | Owns | Public interface |
|---|---|---|
| `identity` | `admin_credentials`, sessions | `loginAdmin`, `loginKandidat`, `verify` |
| `catalog` | `job_database`, `sys_config` (read) | `getPublicBundle`, `getJobByCode` |
| `registry` | `database_candidate` lifecycle | `getPage`, `getByWa`, `updateStage` |
| `applications` | `database_asj_form` | `submit`, `review`, `approve`, `reject` |
| `documents` | Storage buckets, `berkas` | `signUpload`, `signDownload`, `zipJob` |
| `master-data` | `master_database_candidate` | `getDraft`, `submit`, `update` |
| `ai-orchestration` | prompt/result cache | `chat`, `classify`, `interview`, `buildCv` |
| `notifications` | `fcm_tokens`, `wa_templates` | `sendWa`, `sendPush`, `broadcast` |
| `scheduling` | `jadwal`, `tugas` | `upsert`, `remove`, `dueReminders` |
| `configuration` | `sys_config` (write), presets | `update`, `getPresets` |
| `registration` | `pendaftaran`, bridge tokens | `list`, `submit`, `mintBridge` |
| `ingestion` | parse results | `parseDocument` |
| `jobs` | `job_queue` | `enqueue`, `claim`, `complete`, `fail` |
| `diagnostics` | health/readiness | `health`, `readiness` |

### 2.5 Cross-context interaction — three mechanisms

Chosen by consistency requirement, not by preference:

| Mechanism | Use when | Consistency | Example |
|---|---|---|---|
| **Direct interface call** | Caller needs the result to proceed | Strong, same transaction boundary | `applications.approve()` → `registry.getByWa()` |
| **Domain event** (in-process, fire-and-forget) | Side effect must not fail the caller | Eventual | `registry.updateStage()` → emit `CandidateStageChanged` |
| **Queued job** (durable, `job_queue`) | Work > ~2 s, or needs at-least-once retry | Eventual, durable | `notifications.broadcast()`, `ingestion.parseDocument()` |

The event dispatcher signature in `kernel/events.ts` is deliberately identical to a future message-broker publish. Promoting an event from in-process to a network hop is then a one-file change — which is how you get microservice *optionality* without microservice *cost*.

### 2.6 Decomposition triggers — when to revisit

| Trigger | Threshold | Then |
|---|---|---|
| A context needs a different runtime (e.g. long-lived Python for ML) | — | Extract that context to its own service |
| A context needs independent deploy cadence | > 1 deploy/day diverging from main | Extract |
| A single surface exceeds 250 KB bundle | bundle analysis in CI | Split the surface, not the context |
| Sustained > 500 req/s on one surface | Netlify analytics | Move that surface to a long-lived container |
| Team grows beyond ~8 engineers in one repo | — | Extract the contexts with the highest change-coupling |

**Do not extract before a trigger fires.** A network boundary is a permanent tax.

---

## 3. Data layer strategy

### 3.1 Layered access

```
handler  →  service (business rules)  →  repository (SQL/PostgREST)  →  kernel/http
```

Only files named `repository.ts` may name a table. Services receive typed interfaces, not rows. Handlers never see column names. This is what makes the boundary rule enforceable rather than aspirational.

### 3.2 Least-privilege database clients

The current default is a single service-role client for all actions, which bypasses RLS. That makes every bug a full-database bug. The target is three factories selected per request:

| Client | Key | Use |
|---|---|---|
| `anonClient()` | anon | public catalog, share views |
| `userClient(token)` | user JWT | **default for candidate-scoped access** — RLS applies |
| `serviceClient()` | service role | allow-listed operations only, each logged with a reason |

```ts
const SERVICE_ROLE_ALLOWLIST = new Set([
  'registry.nextCandidateId',   // cross-table MAX
  'documents.signUpload',       // Storage signing
  'configuration.migrate',
]);
```

With RLS enabled and a `no_wa = current_wa()` policy on the candidate tables, an IDOR bug becomes "blocked by the database" rather than "full table read". That is defence in depth, and it is the cheapest availability win available: a leaked query cannot cascade into a data-loss incident.

### 3.3 Schema contract, not schema guessing

Replace runtime table/column probing with a generated, committed contract:

```ts
// _lib/db/schema.generated.ts
export const SCHEMA_VERSION = '2026-09-01';
export const CANDIDATE_TABLE = 'database_candidate';
export const CANDIDATE_WA_COLUMN = 'no_wa';
```

A CI job regenerates it from the live database and **fails the build on drift**. This eliminates 2–3 wasted round-trips per lookup (~78 ms at 39.2 ms RTT) — the best effort-to-payoff ratio in the entire design.

### 3.4 Query shapes

| Rule | Rationale |
|---|---|
| **Keyset pagination** on `(updated_at DESC, id DESC)` | Offset-over-full-load is O(N) per page and breaks past ~10k rows |
| **Always project columns** — no `select=*` | The master table is 169 columns / ~1.14 KB per row |
| **Per-request memoisation** (DataLoader pattern) for `getByWa` | Collapses repeated lookups within one request into one query |
| **Stop paging when `rows.length < pageSize`** | −1 round-trip (~39 ms) per list load, for free |
| **No client-side dedupe** | `no_wa` is UNIQUE — the dedupe pass is provably dead work |

### 3.5 Write path

| Mechanism | Purpose |
|---|---|
| **Idempotency keys** (`idempotency_keys`, migration 006) | Makes retry safe; prerequisite for ever retrying a write |
| **Optimistic concurrency** via `updated_at` (If-Match) | Prevents last-write-wins clobber |
| **Postgres sequence** for candidate IDs (`candidate_id_seq`) | Removes the MAX+1 TOCTOU race |
| **`upsert` with `on_conflict`** | Already correct — keep |

### 3.6 Connection management — corrected in Phase B

This section previously claimed to "govern horizontal scale" via `instances × 8 ≤ 60`. **That was wrong.** Verified in Phase B against the actual code:

```
❌ What this section used to say:
     functions → Postgres direct (:5432), instances × 8 connections,
     capped at ~7 instances. Therefore route through Supavisor :6543.

✅ What the code actually does:
     the function runtime opens NO Postgres connection at all.

       netlify/functions/_lib/db/client.ts
         → every call is HTTPS to <project>.supabase.co/rest/v1/<table>

       Only scripts/migrate.mjs uses `pg` (direct, via SUPABASE_DB_URL).

     PostgREST owns the Postgres pool; Supavisor multiplexes it. Function
     instance count never enters the arithmetic.
```

**Consequence: "route function traffic through the pooler (6543)" was never a function-tier task.** Function traffic is HTTP to PostgREST and always has been. The pooler is relevant only to the *migration* connection (`scripts/migrate.mjs`), which is a single short-lived client.

Corrected requirements:

1. **Nothing to route for function traffic.** All runtime DB access is PostgREST over HTTPS. Verified: the only `pg` consumer in the repo is `scripts/migrate.mjs`.
2. **Keep PostgREST transactions short.** Transaction-mode pooling holds a server connection for the transaction's duration, and a long query occupies 1/N of database capacity. The app's lever for this is query duration, not connection count.
3. **Server-side `statement_timeout` — was dead code, now real.** The old note said "`kernel/http.ts` sets `statement_timeout` per request as a header; confirm it is honoured." **It was not honoured.** PostgREST does not read that header; it applies `statement_timeout` as a hoisted transaction setting sourced from database role settings. The header line has been deleted from `kernel/http.ts` and replaced by `migrations/011_statement_timeout.sql`, which sets 3 s via `ALTER ROLE` for `anon` / `authenticated` / `service_role` / `authenticator`. It is a backstop — the client-side request deadline fires first.
4. **`undici` keep-alive is an HTTP pool, not a Postgres pool.** `connections: 8` + `keepAliveTimeout` tunes reuse of TLS connections to Supabase's edge. Useful, but it is not a database connection budget and does not need to sum to 60.
5. **There is no way to cap function concurrency.** Netlify exposes no such setting. The replacement is per-instance admission control (`kernel/admission.ts`), which bounds occupancy on one instance — explicitly *not* a fleet cap. See §8.2.

### 3.7 Migrations

Replace loose `.sql` files and the HTTP-reachable `runMigration` action with:

- Forward-only, timestamped, **checksummed** migrations applied by `scripts/migrate.mjs` in CI.
- A `schema_migrations` table recording version + checksum + applied_at.
- **Delete the `runMigration` action from the registry.** Schema changes must never be reachable from a POST body.

---

## 4. Caching mechanisms

### 4.1 Four tiers

| Tier | Where | What | TTL | Invalidation |
|---|---|---|---|---|
| **L0** | Netlify CDN | `public` surface responses, `/_astro/*` | 60 s + `stale-while-revalidate=86400` | tag purge on config/job change |
| **L1** | In-process LRU (`kernel/cache.ts`) | per-request hot reads, dropdowns | 60 s | per-key, generation counter |
| **L2** | Browser `sessionStorage` | today's SWR-lite cache | 30 s, serve-stale on error | blanket on mutation |
| **L3** | Postgres (`cache_entries`) | expensive aggregates (monthly report) | 5 min | write-through on mutation |

### 4.2 The highest-leverage mechanism: CDN as shared cache

```ts
// surfaces/public.ts — already implemented
'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=86400, stale-if-error=86400'
```

`stale-if-error=86400` means **a full Supabase outage degrades the public job board to "slightly stale" instead of "error page."** That single header is worth more to availability than any index tuning or replica in this codebase.

Critically, this is the *only* genuinely shared cache in the system, and it is free, globally distributed, and fronted by 300+ PoPs. A single-region Redis would be strictly worse for this read path.

### 4.3 Invalidation strategy

| Concern | Mechanism | Staleness bound |
|---|---|---|
| Config / job changes | **Generation counter** — keys become `public-base:v${gen}:${mode}` | TTL (60 s) across instances |
| Single key | `cache.invalidate(key)` | Immediate, local instance |
| Prefix | `cache.invalidatePrefix(prefix)` | Immediate, local instance |
| Negative results | `cache.setNegative(key)` | 10 s |

**Known limitation, stated deliberately:** `bumpGeneration()` only invalidates the *current process's* L1. Across instances, old-generation entries expire naturally via TTL. This is an **availability-over-consistency** choice with a bounded, documented staleness window of 60 s. It should not be "fixed" with cross-instance coordination — that would add a shared dependency to solve a problem whose worst case is a 60-second-old dropdown.

### 4.4 Thundering-herd protection

Two mechanisms, both present in `kernel/cache.ts`:

- **In-flight deduplication** — when N concurrent callers miss the same key, one executes; the rest await its promise.
- **Full-jitter backoff** — retries are spread across a random interval, so recovery from an outage does not arrive as a synchronised wave.

These matter most exactly when the system is already degraded, which is when naive caching designs fail hardest.

### 4.5 What not to add

| Not now | Why | Reopen when |
|---|---|---|
| Redis / Memcached | The CDN is a globally shared cache you already have; single-region Redis is worse for the public read path | Sub-second invalidation of per-user data, or > 100k cache ops/min |
| Service worker offline cache expansion | Complexity without a demonstrated need | Measured offline usage |

---

## 5. Load balancing & traffic management

This is the area the prior architecture document did not address, and it is where the design is most incomplete.

### 5.1 What "load balancing" means here

Netlify's edge network already performs L4/L7 distribution across PoPs and instances — you do not configure it, and you cannot improve it. **The load balancing you control is elsewhere**, in five places:

| # | Mechanism | What it balances | Status |
|---|---|---|---|
| 1 | **CDN cache** | Request volume → near zero origin load | ✅ implemented |
| 2 | **Per-instance admission control** | In-flight work → bounded *instance* occupancy | ✅ Phase B (`kernel/admission.ts`). ⚠️ Per-instance only — Netlify offers no concurrency cap, so this is not a fleet limit |
| 3 | **Bulkhead (8/dependency)** | In-flight work → per-dependency isolation | ✅ implemented |
| 4 | **Supavisor pooler** | PostgREST → Postgres connections | ✅ N/A for functions (all access is PostgREST). Applies to `scripts/migrate.mjs` only |
| 5 | **Priority classes + load shedding** | Competing workloads → defined winners | ✅ Phase B — P0–P3 in `kernel/admission.ts` |

### 5.2 The funnel

```
All traffic
  └─ L0 CDN ............................. ~95% served, 0 functions invoked
      └─ Rate limit (shared, Postgres) ... fleet-wide, per identity/IP
          └─ Admission control (P0–P3) ... sheds per instance, cheap & local
              └─ Bulkhead (8 / dependency)  bounds in-flight per dependency
                  └─ Request deadline (12 s)  bounds how long a slot is held
                      └─ PostgREST ........... owns the Postgres pool
                          └─ Postgres ........ 14 MB, 1.8 ms worst query
```

**The earlier version of this funnel was wrong.** It placed a "function concurrency cap" at stage 2 and the pooler at stage 4, and concluded that an uncapped stage 2 would turn stage 4 into a stampede. There is no stage-2 cap to configure, and stage 4 never receives function connections. The corrected funnel puts the two *fleet-wide* governors first (shared rate limit) and last (PostgREST's own pool), with the per-instance bounds in between — which is the honest ordering, because per-instance bounds only limit how badly one instance degrades.

### 5.3 Concurrency caps — not a platform feature

The previous version of this section showed an illustrative `netlify.toml` with `[functions."public"] concurrency = 40`. **No such key exists.** Verified against Netlify's configuration docs (2026-09-11), the documented keys are:

```
[functions]                      # global
  external_node_modules
  included_files
  directory

[functions."<name>"]            # per function
  region
  memory

# in-code only
export const config = { vcpu: 2 }
```

There is no `concurrency`, no reservation, and no provisioned concurrency. So the old rule — `surface_concurrency × pool_connections ≤ pooler_budget` — was arithmetic over two variables that do not exist.

What replaced it (`kernel/admission.ts`):

| Tier | In-flight cap / instance | Env override | Rationale |
|---|---|---|---|
| `default` | 24 | `ADMISSION_MAX_INFLIGHT` | short I/O-bound round-trips |
| `ai` | 4 | `ADMISSION_MAX_INFLIGHT_AI` | holds external sockets + memory for seconds |
| `bulk` | 3 | `ADMISSION_MAX_INFLIGHT_BULK` | long sequential fan-out loop |
| total | 28 | `ADMISSION_MAX_INFLIGHT_TOTAL` | one tier cannot consume the instance |

Shed thresholds by priority: P0 never; P1 at 95% saturation; P2 at 80%; P3 at 50%. Saturation is the max of four local signals — tier occupancy, total occupancy, observed PostgREST latency above a 400 ms floor, and whether the PostgREST breaker is open. When PostgREST is open, saturation pins to 1 and only P0 survives, because every other action would fail anyway.

**These caps are guesses until production calibrates them**, which is why every one is an env override. They are the numbers most likely to need tuning after the first real load test.

### 5.4 Priority classes and load shedding

When capacity is scarce, the system must decide *who loses*. Without an explicit decision, it is decided randomly — which usually means an admin's bulk operation degrades a candidate's application submission.

| Class | Workloads | Under saturation |
|---|---|---|
| **P0 — Critical** | Auth, application submit, document upload | Never shed. Rate-limited per identity only. |
| **P1 — Interactive** | Admin CRUD, candidate dashboard reads | Shed last. Serve stale from cache where possible. |
| **P2 — Deferrable** | WhatsApp blast, push notifications, reminders | **Shed to `job_queue` immediately.** Return 202. |
| **P3 — Best-effort** | AI CV parsing, analytics, report generation | **Shed first.** Return 202 with a job id. |

Implementation: a saturation signal (breaker-open count + `job_queue` depth + in-flight bulkhead counts) checked at the dispatcher. Above threshold, P2/P3 actions are enqueued instead of executed inline.

This is the mechanism that converts "the system fell over during the intake batch" into "notifications arrived 20 minutes late."

### 5.5 Rate limiting

Already implemented and — importantly — **already moved off in-process `Map`s to Postgres** (`rate_counters`, `rate_limit_check()` atomic function, migration 008). That fix matters because in-process counters are bypassable by distributing requests across instances, and silently under-count in proportion to instance count.

| Scope | Limit |
|---|---|
| admin login | 5/min/IP, lockout 5 min after 10 fails |
| candidate login | 10/min/IP |
| AI | 10/min/identity, 60/min/IP |
| Fonnte | 2/min/admin |
| admin CRUD | 120/min |
| anonymous write | 20/min/IP |
| `getUploadUrls` | 10/min/session |

Cost: one lightweight write per request. On a path that already makes 2–5 database calls, this is acceptable — correctness beats the last 40 ms.

### 5.6 Compatibility aliases

Retiring the 29 legacy entry points must not break existing clients (deployed QR codes, keep-alive workflows, the `src/lib/apiClient.ts` routing table):

```toml
[[redirects]]
  from   = "/.netlify/functions/candidates"
  to     = "/.netlify/functions/api"
  status = 200
```

Cheap, zero-risk, and each alias can be deleted after 30 days of zero traffic in the logs.

---

## 6. Fault tolerance & circuit breaking

### 6.1 Timeout budgets

Every layer's budget is strictly smaller than its caller's, enforced in `kernel/http.ts` rather than by convention.

```
Netlify synchronous limit       60 s   (platform ceiling — NOT a budget)
  │
  │  Phase B: the ceiling is not the constraint. A request may not spend it,
  │  because occupancy = concurrency × duration, and there is no platform
  │  concurrency cap. So the binding limit is a deadline we impose:
  │
  └─ REQUEST DEADLINE             12 s   kernel/deadline.ts
      │  Every call below is additionally clamped to whatever remains of
      │  the deadline, so these are ceilings and cannot sum past it.
      │
      ├─ total downstream budget  8 s
      │   ├─ PostgREST read       2 s
      │   ├─ PostgREST write      3 s
      │   ├─ Storage              5 s
      │   └─ Fonnte / FCM         5 s
      └─ reserve for response     2 s

  AI chain (kernel/ai/providers.ts): 4 s race + 5 s fallback = 9 s worst case,
  which fits inside the 12 s deadline with ~3 s for rate limiting + assembly.

Netlify background limit        15 min   ← for AI, ingest, WA fan-out
```

**Note the direction of the fix.** The budgets above were *not* raised to exploit the 60 s ceiling. Doing so would mean holding a function slot 6× longer under load — the opposite of bounding load. They stay conservative on purpose, and the deadline is what makes them binding.

`AbortSignal.timeout()` plus an `undici` Agent with keep-alive: the keep-alive removes a TLS handshake from every call, which at 39.2 ms RTT is a direct latency win on top of the reliability win.

### 6.2 Retry policy — asymmetric by design

| Operation | Retry | Rationale |
|---|---|---|
| PostgREST read | 2 attempts, full jitter | Idempotent, safe |
| PostgREST write | **0** unless an idempotency key is present | Retrying a create without a key is how you get duplicate candidates |
| Storage | 2 attempts | Idempotent by path |
| Gemini | 3 attempts (background only) | Safe, slow |
| Fonnte | 3 attempts, respect 429 | Never fail the caller — queue instead |
| FCM | 2 attempts | Push is best-effort |

The default in `kernel/resilience.ts` is `idempotent: false` — writes must **opt in** to retry. That is the correct safe direction.

**Full jitter is not optional.** Without it, a Fonnte outage makes every concurrent instance retry in lockstep and you re-create the thundering herd during recovery.

### 6.3 Circuit breaker

Three states, per dependency, in-process (a breaker only needs to fail fast *locally*; it does not need global agreement):

| Dependency | Threshold | Window | Cooldown |
|---|---|---|---|
| `postgrest` | 5 failures | 30 s | 15 s |
| `gemini` | 3 failures | 60 s | 30 s |
| `fonnte` | 3 failures | 60 s | 60 s |
| `storage` | 5 failures | 60 s | 15 s |
| `fcm` | 10 failures | 60 s | 15 s |

**Design requirement:** when open, the breaker must return a **typed `DependencyUnavailable`** — never a raw network error — so the handler can degrade deliberately rather than crash.

### 6.4 Bulkhead

At most 8 concurrent in-flight calls per dependency per instance. This is what prevents one slow dependency (typically Gemini at 3–25 s) from consuming the function's entire capacity and starving unrelated work.

### 6.5 Graceful degradation matrix

**No dependency failure may take down an unrelated feature.** This is the core reliability invariant.

| Failure | Behaviour | User impact |
|---|---|---|
| DB down — public catalog | Serve last-known-good from CDN (`stale-if-error=86400`) | Listings slightly stale |
| DB down — writes | 503 + idempotency key retained so the client can safely replay | Retry works |
| Gemini down | `ai_unavailable`; AI tabs show a banner | AI features off, everything else works |
| Fonnte down | Enqueue to `job_queue`, return 202 | Messages arrive late |
| FCM down | Log and drop | No push; in-app data unaffected |
| Storage down | DB row written, upload retried; document shows "pending" | Upload delayed |
| Pooler saturated | Shed P2/P3 to queue, serve stale for P1 | Interactive paths stay up |

> **Verified 2026-09-13 — only 3 of these 7 rows describe exactly what the system
> does.** The matrix was tested against the code by `_lib/chaos.test.ts`; the
> row-by-row verdict and evidence are in **`docs/PHASE_E_DEGRADATION_MATRIX.md`**.
> Two of the original divergences were closed on 2026-09-13 (DB-down writes, and
> single-message Fonnte). What still diverges:
>
> - **Gemini down** — `ai_unavailable` does not exist. No such error code, no
>   branch that returns it, no banner. Only the second half of the row holds: an
>   unrelated feature is unaffected.
> - **DB down — writes** — **fixed 2026-09-13.** `db/client.ts` classifies a
>   PostgREST transport failure (timeout, network error, HTTP 5xx) as
>   `SERVICE_UNAVAILABLE`, which is now retryable and carries `Retry-After: 5`.
>   The fact is parked on `LogContext.dbOutage` so it survives the 38 service
>   catch blocks that turn the error into a string, and the surface wrapper
>   answers **503 + Retry-After + no-store**. A 4xx is NOT treated as an outage:
>   it is a real answer from a working database. The idempotency half of the row
>   already held.
> - **Fonnte down** — `wa.broadcast` is enqueued up front rather than on failure.
>   Since 2026-09-13 a single-message send (`kirimSatuPesanFonnte`) also enqueues
>   (`wa.send`) — but only on a *transient* failure (no status / 429 / 5xx), and
>   the retry is the 2-minute sweep, up to `max_attempts`. A 4xx still fails
>   immediately. The wrapper never emits **202**: both paths answer 200 with
>   `{ status: 'accepted', jobId }`.
>
> Two further nuances: "serve last-known-good" for the public catalog is the
> CDN's doing — the origin serves its built-in demo dataset, not the previous
> response; and "shed P2/P3 **to queue**" sheds without queuing (correct for a
> read, a client-side retry for a write).

### 6.6 Durable async work

`job_queue` (migration 005) with atomic claim via `FOR UPDATE SKIP LOCKED` (migration 009):

```
status: pending | running | done | failed | dead
claim:  UPDATE job_queue SET status='running', locked_until=now()+interval
        WHERE id IN (SELECT id FROM job_queue
                     WHERE status IN ('pending','failed') AND run_after <= now()
                     ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT n)
```

Concurrent cron invocations cannot double-process. After `max_attempts` the row moves to `status='dead'` and alerts — a dead-letter queue you can actually query.

**This is what replaces Kafka at this scale:** the same at-least-once delivery, retry, and DLQ semantics, on infrastructure already paid for. Kafka becomes justified above roughly 10k jobs/day or when a second independent consumer appears.

### 6.7 Chaos testing

Reliability claims that are not tested are not claims. Required tests:

| Test | Assertion |
|---|---|
| Inject PostgREST failure | Breaker opens; public board serves stale; writes return 503 with idempotency key |
| Inject Gemini timeout | `ai_unavailable` returned; admin CRUD unaffected |
| Saturate the pool | P2/P3 shed to queue; P0/P1 latency stays within SLO |
| Kill the queue worker mid-job | Job re-claimed after `locked_until`; no duplicate side effect |
| Replay a write with the same idempotency key | Exactly one row created |

> **Run status 2026-09-13.** The PostgREST, Gemini-timeout and idempotency-replay
> rows are implemented in `netlify/functions/_lib/chaos.test.ts` (10 tests, green)
> — the suite injects failures at `globalThis.fetch`, so the real kernel, client,
> context, surface and wrapper all run.
>
> Two are **not** in CI, for reasons rather than oversight. **"Saturate the pool"
> is not runnable as written**: the platform does not let us cap concurrency
> (recorded in Phase B), so the achievable substitutes are asserted instead —
> priority classes, the breaker-driven saturation signals, per-tier accounting
> and the shed-response contract. **"Kill the queue worker mid-job"** needs a real
> row in `job_queue`, which is the *production* queue the `sweep-queue` cron
> reads: a test row is a job a real worker may claim, so it is a scripted drill
> against a disposable environment, not a CI test.

---

## 7. Monitoring & observability

### 7.1 Current state

| Component | Status |
|---|---|
| Structured JSON logger with request-id (`AsyncLocalStorage`) | ✅ `kernel/log.ts` |
| Trace propagation (`traceparent`) into downstream calls | ✅ `kernel/http.ts` |
| Counters / histograms / gauges, flushed per invocation | ✅ `kernel/metrics.ts` |
| Dependency call log (`dependency_calls`, migration 006) | ✅ sampled, fire-and-forget |
| **External metric sink (APM)** | ❌ metrics go to `console.log` only |
| **Alerting rules** | ❌ none |
| **SLOs with error budgets** | ❌ none |
| **Dependency-health endpoint** | ❌ only `ping` |

**The gap is not instrumentation — it is the sink and the response.** You are collecting the right signals and then dropping them into a log stream nobody watches.

### 7.2 The four signals, per surface

| Signal | Metric | Alert |
|---|---|---|
| **Latency** | p50 / p95 / p99 per action | p95 > 800 ms for 5 min |
| **Traffic** | req/s per action | −80 % vs 7-day baseline |
| **Errors** | rate by `error.code` | > 2 % for 5 min |
| **Saturation** | breaker-open count, `job_queue` depth, bulkhead in-flight | queue depth > 100, any breaker open > 2 min |

### 7.3 SLOs

| SLO | Target | Error budget |
|---|---|---|
| Public job board availability | 99.5 % monthly | ~3.6 h/month |
| Application submit success (excl. client error) | 99.9 % | ~43 min/month |
| Admin CRUD p95 latency | < 400 ms | — |
| Public read p95 (CDN hit) | < 100 ms | — |
| Job queue delivery within 15 min | 99 % | — |
| Dead-letter arrivals | 0/day | any arrival pages |

### 7.4 What to build

1. **Ship metrics to an external sink.** Emit the per-invocation `metrics.flush` payload (or OTLP) to an APM. Without this, every item below is decoration.
2. **Alert on saturation, not just errors.** Breaker-open and queue-depth alerts fire *before* users notice; error-rate alerts fire after.
3. **Expose breaker and queue state.** Extend `contexts/diagnostics` with a health endpoint reporting per-dependency breaker state, queue depth, and pool saturation. This is the endpoint an on-call engineer actually wants.
4. **Trace the full path.** `traceparent` propagation exists; it needs a collector to be useful. Without it you cannot distinguish "slow DB" from "slow Gemini" from "cold start" — and those have entirely different fixes.
5. **Runbooks.** One per alert, with the specific query or command that resolves it.

### 7.5 Logging rules

**Never log `no_wa`, `nik`, `no_passport`, tokens, or file contents.** Log a stable hash for correlation. This must be enforced *centrally in the logger*, not by reviewer discipline — any future field addition will leak PII otherwise.

---

## 8. Horizontal scaling

### 8.1 Statelessness

Anything in process memory is wrong the moment instance count exceeds 1.

| State | Status | Target |
|---|---|---|
| Rate-limit counters | ✅ Postgres `rate_counters` | keep |
| Session | ✅ stateless HMAC | keep |
| Public data cache | ✅ CDN (L0) | keep |
| DB connections | ✅ HTTP keep-alive to PostgREST (no Postgres connection held) | pooler applies to `scripts/migrate.mjs` only |
| Job progress | ✅ `job_queue` | keep |
| Cache generation counter | ⚠️ per-instance | documented TTL bound (§4.3) |

After this, any function can be replicated to N instances with no coordination. That is the definition of horizontally scalable.

### 8.2 Occupancy arithmetic — corrected

The original arithmetic here was `instances × 8 ≤ 60`, which assumed each function instance holds 8 Postgres connections. It does not hold any (§3.6). Replaced in Phase B with what actually bounds load:

```
❌ Withdrawn:  instances × 8  ≤  60  →  ~7 instances

✅ Per-instance (limits how badly ONE instance degrades — not a fleet cap)
     request duration        ≤ 12 s   kernel/deadline.ts
     in-flight per dependency ≤ 8      kernel/resilience.ts bulkhead
     in-flight per tier      ≤ 24 / 4 / 3   kernel/admission.ts
                                          (default / ai / bulk)
     total in-flight         ≤ 28     kernel/admission.ts

✅ Fleet-wide (the ones that actually govern load)
     requests per identity/IP  → kernel/rate-limit.ts (Postgres-backed,
                                 shared across instances)
     query duration at the DB  → migrations/011 (role-level, 3 s)
     work deferral             → job_queue + background functions
```

**Why the distinction matters.** Netlify has no concurrency cap, so per-instance limits cannot prevent the fleet from growing — they only prevent one instance from becoming a straggler that gets killed at 60 s holding doomed work. Anyone reading a per-instance number as a fleet cap will draw the wrong capacity conclusion. The three fleet-wide rows are the real governors, and two of them were only made real in Phase B.

Actions (all completed in Phase B unless noted):

- ~~Route function traffic through the Supavisor pooler (6543).~~ **Not applicable** — function traffic is PostgREST over HTTPS. Relevant only to `scripts/migrate.mjs`.
- ~~Cap function concurrency.~~ **Not a platform feature.** Replaced by per-instance admission control.
- ✅ Bound request duration with a wall-clock deadline (`kernel/deadline.ts`).
- ✅ Install server-side `statement_timeout` via `ALTER ROLE` (migration 011, 3 s) — the request-header approach never worked.
- ✅ Shed by priority class rather than absorbing the burst (`kernel/admission.ts`).
- Keep transactions short — a long query monopolises 1/N of PostgREST's pool.
- (Open) Deploy-verify the aliases, then retire the 12 catch-all entry points — the single largest remaining bundle win (see `docs/PHASE_A_LEGACY_ENDPOINT_RETIREMENT.md`).

### 8.3 Cold starts

**Measured after Phase B** (`npm run bundle:size`):

| Entry point | Before | Now |
|---|---|---|
| `public.js` | 696.6 KB | 62.9 KB |
| `auth.js` | 696.8 KB | 142.9 KB |
| `ai-chat.js` | 696.9 KB | 114.5 KB |
| `files.js` | 696.8 KB | 543.3 KB (heaviest — bundles the ZIP writer) |
| 12 catch-all entry points | 689.6 KB each | 693.6 KB each — **8,323 KB, 83% of the total** |
| **Total** | **19,403.5 KB** | **9,994 KB** |

Phase B added ~3 KB to each narrow entry point (`kernel/deadline.ts` +
`kernel/admission.ts` reach every bundle through `kernel/http.ts` and `handlers.ts`).
That is a deliberate, measured trade: it tripped the 5% bundle ratchet, the baseline was
updated with this note, and the absolute cost is trivial against the 600 KB per-entry
ceiling. Note the ratchet's 5% tolerance is tight for small entries — a ~3 KB feature
crosses it on a 52 KB entry, so the gate will cry wolf on future small additions until
the tolerance gets an absolute-bytes floor.

Three levers, in order of value:

1. **Never let a narrow entry point reach the router.** Netlify does not code-split, so any
   module in the static graph — including a dynamic `import()` — is inlined. This was the
   whole 19.4 MB problem; see `docs/PHASE_A_LEGACY_ENDPOINT_RETIREMENT.md`.
2. **Retire the 12 catch-all aliases** once their redirects are verified. Target ≈ 2.3 MB.
3. **Provisioned concurrency on `public`** — the only surface where cold start is
   user-visible, and now only 59 KB.

Enforced by `npm run bundle:size` (per-entry ceiling with a declared-catch-all exemption,
plus a ratchet baseline) and `npm run verify:binding`.

**Reaching the floor requires deleting `bridge-links`, which would remove the 404-fallback
safety net.** That net is what makes narrowing any entry point safe — `apiClient.ts` retries
through `bridge-links` on a 404 — so the catch-all should be kept and paid for.

### 8.4 Data growth

The database is 14 MB and grows by roughly 230 candidates/year. It will fit in shared buffers for the foreseeable future.

**Do not build read replicas, sharding, or partitioning.** The triggers that would change this answer:

| Trigger | Threshold | Then |
|---|---|---|
| DB exceeds 2 GB / working set exceeds RAM | measure quarterly | read replica for admin analytics |
| One table exceeds 100k rows | `select count(*)` | mandatory keyset pagination everywhere |
| Sustained > 500 req/s | Netlify analytics | long-lived container for the `api` surface |
| Write contention on one row | lock-wait metrics | optimistic concurrency + conflict UI |

---

## 9. Consistency vs availability

### 9.1 The decision is per operation, not per system

| Operation class | Choice | Why | Mechanism |
|---|---|---|---|
| Public job board read | **Availability** | 60 s stale is harmless; an error page is not | CDN `stale-if-error=86400` |
| Candidate / admin read | **Consistency** | An admin must see the record they just saved | Bypass cache when a session token is present |
| Application submit / stage change | **Consistency + idempotency** | Duplicate candidates are worse than a 503 | `idempotency_keys`, `candidate_id_seq` |
| WhatsApp / push / AI parse | **Availability** | 30 s late is fine; blocking the caller is not | `job_queue`, at-least-once |

**Unifying rule: be consistent on the write path, available on the read and side-effect paths.**

### 9.2 PACELC framing

| Scenario | Choice | Trade accepted |
|---|---|---|
| **P**artition — public read | Availability | Stale listings |
| **P**artition — write | Consistency | 503, safely replayable |
| **E**lse (normal) — read | Latency | Bounded staleness (60 s) |
| **E**lse — write | Consistency | Slightly higher latency (no cache) |

The system is **PA/EL** for reads and **PC/EC** for writes. That asymmetry is intentional and should be documented as an invariant, not discovered during an incident.

### 9.3 The one dangerous case

**Cache key collision on private data.** `surfaces/public.ts` correctly caches `getAppData` only when *no* session token is present. This must remain an enforced invariant: the failure mode is serving one user's data to another — a data breach, not a performance regression. There should be a test that asserts a token-bearing request is never served a cached response.

---

## 10. How each component contributes

| Component | Contribution to reliability | Contribution to scalability |
|---|---|---|
| **CDN cache (L0)** | Serves stale during origin outage → public board survives a full DB failure | Decouples read volume from origin capacity entirely |
| **Function surfaces** | Fault isolation — a Gemini failure cannot fail an admin CRUD action | Independent scaling and cold-start profile per workload |
| **Shared kernel** | One enforcement point for timeout, retry, breaker, bulkhead — no request can bypass protection | One place to tune concurrency and budgets as load grows |
| **Bounded contexts** | Blast-radius containment; a defect in one context cannot corrupt another's data | Parallel team work without coordination; clean extraction seams |
| **Layered repositories** | Least-privilege clients; RLS as defence in depth | Query shape control; prevents O(N) patterns from regressing in |
| **Schema contract** | Removes failed-round-trip failure modes | Removes 2–3 round-trips per lookup |
| **Per-instance admission control** | Sheds non-essential work before it consumes a slot; P0 is never shed | Converts unbounded queueing into fast, honest 503s with Retry-After |
| **Request deadline** | No request can hold a slot for the platform's 60 s ceiling | Bounds occupancy, which is the only half of `concurrency × duration` we control |
| **DB-side `statement_timeout`** | Backstop for a query that escaped the client timeout | Role-level (migration 011) — the request-header approach never worked |
| **Timeout budgets** | One hung dependency cannot consume the whole request budget | Bounds worst-case latency under load |
| **Retry + full jitter** | Transient failures self-heal | Prevents recovery-time thundering herd |
| **Circuit breaker** | Fails fast; no wasted capacity on a dead dependency | Sheds load automatically when a dependency degrades |
| **Bulkhead** | One slow dependency cannot starve the function | Caps per-dependency resource consumption |
| **Rate limiting (Postgres)** | Blocks abuse and credential stuffing across all instances | Protects shared capacity from any single actor |
| **Priority classes** | Guarantees critical paths survive saturation | Load shedding instead of collapse |
| **`job_queue` + DLQ** | At-least-once delivery; nothing is silently lost | Absorbs arbitrary async bursts; workers scale independently |
| **Idempotency keys** | Makes retry safe; prevents duplicate writes | Allows aggressive client retry without corruption |
| **Optimistic concurrency** | Prevents lost updates | Enables concurrent writers on the same record |
| **Structured logging + trace ids** | Incident diagnosis in minutes, not archaeology | Correlate behaviour across instances |
| **Metrics + dependency_calls** | Detect degradation before users report it | Capacity planning from real data |
| **Breaker/queue health endpoint** | On-call sees the actual constraint | Saturation signal drives load shedding |
| **Background functions** | Long work cannot time out a user request | Async work scales on a separate axis from request traffic |
| **Compatibility aliases** | Zero-downtime retirement of legacy endpoints | Removes cold-start cost without breaking clients |

---

## 11. Roadmap

Ordered by value-per-unit-effort. Each phase is independently shippable and independently revertible.

### Phase A — Close the refactor ✅ core complete
**Done** (see `docs/PHASE_A_LEGACY_ENDPOINT_RETIREMENT.md`):
1. **Root cause fixed** — `handlers.ts` no longer statically imports the router; the
   resolver is injected per entry point. 13 entry points narrowed. **19,403.5 → 9,891.6 KB (−49%)**
   (now 9,994 KB after Phase B — see §8.3).
2. `run-migration.js` deleted; the dead admin UI button removed.
3. `netlify.toml` aliases added for the 12 catch-alls **with `force = true`** — without it
   Netlify will not shadow a deployed function, and the alias silently does nothing.
4. Gates added: `bundle:size` (with ratchet baseline) and `verify:binding`.

**Remaining — gated on deploy verification:**
5. `BASE_URL=… npm run verify:aliases` → then delete the 11 alias entry points.
   Expected ≈ **2,364 KB**.

**Gate (revised):** no non-catch-all entry over 600 KB; total ratchets down. The original
"< 1 MB" figure assumed 24 redundant bundles that did not exist — the achievable floor with
28 legitimate entry points and one necessary catch-all is ~2.3 MB.

### Phase B — Bound the load

Reconnaissance changed three of these five items. Recorded as resolved, not silently dropped —
see `docs/PHASE_B_LOAD_BOUNDING.md` for the evidence behind each.

6. ~~Confirm function traffic routes through Supavisor :6543.~~ **Not applicable.** The
   function runtime opens no Postgres connection; all DB access is PostgREST over HTTPS.
   The pooler concerns `scripts/migrate.mjs` only.
7. ~~Set function concurrency caps per §5.3.~~ **Not a platform feature.** Netlify exposes
   no `concurrency` key and no provisioned concurrency. Replaced by per-instance admission
   control with priority classes (`kernel/admission.ts`).
8. **`statement_timeout` — verified, and the answer was negative.** It was never honoured:
   PostgREST does not read that header. The dead line was deleted from `kernel/http.ts` and
   replaced by `migrations/011_statement_timeout.sql` (`ALTER ROLE`, 3 s), which is the only
   mechanism that works.
9. ✅ **Priority classes + load shedding implemented** — P0–P3, per-tier caps, I/O-free
   saturation estimate, shed with 503 + `Retry-After`, wired into the dispatcher *before* the
   rate limiter so shedding is free.
10. ~~Provisioned concurrency on `public`.~~ **Not a platform feature.** The equivalent
    protection for the public read path is the L0 CDN cache with `stale-if-error=86400`,
    which already keeps the job board alive through a full database outage.

**Added during Phase B (not in the original plan):**
11. ✅ **Per-request deadline** (`kernel/deadline.ts`, 12 s). This is the only duration bound
    available given there is no concurrency cap, and it is what makes the per-dependency
    budgets binding rather than additive.
12. ✅ **Corrected the 60 s vs 10 s error** across source comments and two live gate documents
    (`ENGINEERING_PLAYBOOK.md`, `CODE_REVIEW_CHECKLIST.md`) that were enforcing the wrong number.

**Gate (revised):** with the platform unable to cap concurrency, the original "saturate the pool"
chaos test is not runnable as written. The achievable gate is: (a) P0 actions are never shed
under any saturation signal, (b) shed responses are 503 + `Retry-After` + `no-store`, never 400,
(c) no request exceeds the deadline by more than one dependency budget, (d) the bundle-size
ratchet holds. Items (a)–(c) are covered by `kernel/admission.test.ts` and
`kernel/deadline.test.ts`; (d) by `npm run bundle:size`.

### Phase C — Make it visible
11. Ship metrics to an external APM sink.
12. Extend `contexts/diagnostics` with a breaker/queue/pool health endpoint.
13. Configure the alerts in §7.2 with runbooks.
14. Publish the SLOs in §7.3 and start tracking error budgets.

**Gate:** an injected PostgREST failure produces an alert within 2 minutes, and the health endpoint explains it.

### Phase D — Harden the data layer

15. ✅ Generated `schema.generated.ts` + CI drift check (`npm run verify:schema`).
16. ✅ Least-privilege client factories + RLS on candidate tables
    (`migrations/012_rls_lockdown.sql`, `npm run verify:rls`).
17. ✅ Keyset pagination — `_lib/db/pagination.ts` replaces the Range/OFFSET reader
    (`supabasePaged` deleted); used by `fetchPagedAll`, tested in
    `pagination.test.ts`, verified against production. The remaining capped list
    reads are left capped on measured evidence (largest table is 228 rows against
    a 500-row cap) — see `docs/PHASE_D_DATA_LAYER.md` §4 for the trigger.
18. ✅ Checksummed migrations; delete the loose `.sql` files (`scripts/migrate.mjs`,
    one canonical `migrations/` directory, 12 files, 0 drifted).

**Gate:** zero `select=*` in the codebase (`npm run verify:projections`); RLS blocks
a cross-candidate read (`npm run verify:rls`). Both met and enforced.

**Full record: `docs/PHASE_D_DATA_LAYER.md`** — measurements before/after, the five
tables whose RLS was switched off, the `USING (true)` policy that was granted to
`PUBLIC`, the columns the code names that do not exist, and the one trade-off
(~8.7 KB per bundle for the schema contract).

### Phase E — Test the claims
19. Chaos suite from §6.7 in CI.
20. Load test at 10× projected peak.
21. Idempotency replay test.
22. Pooler failover drill.

**Gate:** the degradation matrix in §6.5 is verified behaviour, not a document.

---

## 12. Anti-recommendations

Explicitly rejected, each with the condition that would reopen it.

| Don't build | Why not | Reopen when |
|---|---|---|
| **Microservices** | Round-trips are 99.7 % of latency; you would multiply your only real cost | A context needs independent deploy cadence or a different runtime |
| **Kubernetes / ECS / VM cluster** | Serverless already scales to zero and to peak; 14 MB of data | Sustained > 500 req/s, or platform cost/limit ceilings |
| **Kafka / RabbitMQ / SQS** | `job_queue` gives the same at-least-once + retry + DLQ at zero marginal cost | > 10k jobs/day, or multi-consumer fan-out |
| **Redis / Memcached** | The CDN is a shared cache you already have; single-region Redis is worse for the public read path | Sub-second invalidation of per-user data |
| **Event sourcing / CQRS** | 225 rows. The prior audit withdrew this on measured evidence | Audit requirements demanding full history |
| **GraphQL** | One first-party client, fixed action set. Adds a resolver layer and N+1 risk | Third-party API consumers |
| **Read replicas / sharding** | 14 MB, 0 dead tuples | DB > 2 GB or working set > RAM |
| **New database indexes** | Existing indexes are unused; the planner correctly seq-scans 225 rows | Rows > 100k on a scanned table |
| **Separate database per service** | Forces cross-service joins over the network — the exact cost you cannot afford | Never at this scale |
| **Multi-region active-active** | Single-region Supabase; 14 MB; users concentrated in one geography | Measured latency from a second region, or a contractual RTO |

---

## 13. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Legacy endpoints never retired — both topologies persist indefinitely | **High** | High | Phase A is a hard prerequisite; track bundle size in CI as a ratchet |
| Burst exhausts the 60-connection pool before caps are set | Medium | **High** | Phase B before any marketing push or intake batch |
| Metrics stay in `console.log`; breakers open silently | **High** | Medium | Phase C item 11 is a single integration; do it early |
| Saturation is invisible → no load shedding | Medium | High | Health endpoint + queue-depth alert |
| Idempotency keys not applied to every mutation | Medium | Medium | CI test asserting every mutating action has a key |
| Over-engineering — this document is long and the system is small | Medium | Medium | Phases A–B capture most of the value; stopping after C is legitimate |
| RLS left unaudited | Medium | High | Phase D; treat as blocking before scale work |
| Cache key collision leaks private data | Low | **Critical** | Invariant test; enforce in `surfaces/public.ts` |

---

## 14. Appendix — Target SLOs

| Metric | Current | Target |
|---|---|---|
| `getAppData` p95 (warm) | ~250 ms | < 150 ms |
| `getAppData` p95 (cold) | ~1.5 s | < 600 ms |
| Candidate lookup p95 | ~160 ms (3 round-trips) | < 60 ms (1 round-trip) |
| Heaviest narrow bundle | 696.9 KB | **< 150 KB** (currently 539.9 KB — `files.js`, ZIP writer) |
| Deployed function code | 19,403.5 KB | **9,994 KB** now → **~2,364 KB** after alias retirement |
| Shed responses under saturation | none (unbounded queueing) | 503 + `Retry-After` + `no-store`, P0 never shed |
| Longest a request can hold a slot | 60 s (platform ceiling) | 12 s (request deadline) |
| Public cache hit rate | 1 / instance | > 95 % at CDN |
| DB timeout coverage | 100 % | 100 % (maintain) |
| Rate-limit bypass | not possible | not possible (maintain) |
| Availability — public board during DB outage | > 99 % | > 99 % (maintain) |
| Availability — application submit | — | 99.9 % |
| Dead-letter arrivals | — | 0/day |
| PII in logs | unenforced | 0 (logger-enforced) |
