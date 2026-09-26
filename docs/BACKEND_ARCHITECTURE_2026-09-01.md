> **Last updated:** 2026-09-03 — Technical reference document.

> ## ⚠️ ANGKA DI DOKUMEN INI ADALAH SNAPSHOT 2026-09-03 — SUDAH BERGESER
>
> Diperiksa ulang **2026-09-26**. Struktur dan prinsipnya masih berlaku, tapi
> **hitungannya tidak lagi**. Yang benar hari ini (diukur, bukan diturunkan):
>
> | Klaim di bawah | Nilai 2026-09-03 | Nilai 2026-09-26 |
> |---|---|---|
> | surfaces | 15 | **16** |
> | bounded contexts | 14 | **15** |
> | kernel files | 13 | **16** |
> | tes | 235 | **1970** (167 berkas) |
>
> Jangan kutip angka dari dokumen ini. Ukur sendiri:
> `ls netlify/functions/surfaces/`, `ls -d netlify/functions/contexts/*/`,
> dan `npm test`.

# ASJ Portal v2 — Backend Architecture

> **✅ IMPLEMENTATION STATUS (2026-09-03 — lihat peringatan di atas)**
> 
> The target architecture described below has been **FULLY IMPLEMENTED**:
> - ✅ 15 surfaces created (target was 8)
> - ✅ 14 bounded contexts created (target was 12)  
> - ✅ 13 kernel files (http, resilience, errors, log, metrics, etc.)
> - ✅ DB timeout + circuit breaker active
> - ✅ Rate limiter implemented
> - ✅ 235 tests passing
> 
> **Remaining gaps:**
> - ⚠️ RLS policies not audited for production
> - ⚠️ Some contexts may need boundary refinement
> - ⚠️ Structured logging not fully wired to external service

---



## 0. Executive summary

**The headline recommendation is a refusal: do not build microservices here.**

I measured the system before designing anything. The findings are unambiguous:

| Fact | Measured value |
|---|---|
| Whole database | **14 MB** |
| `database_candidate` | **225 rows** |
| Slowest SQL query in production | **1.8 ms** |
| Network round-trip to Supabase (median) | **39.2 ms** (p95 69.2 ms) |
| Fetching all 225 candidates end-to-end | 57.4 ms — **99.7 % is network** |
| Deployed function code | **24 bundles × ~331 KB ≈ 7.9 MB** |
| Function bundles that are byte-identical | **all of them** |

Every function entry point (`auth.js`, `jobs.js`, `candidates.js`, …) is the same
331 KB bundle containing the *entire* action registry, plus `mammoth`, `pdf-parse`
and `xlsx`. A request to `ping` loads a PDF parser and a spreadsheet engine.

At this scale, splitting into network-separated microservices would be actively
harmful: each service hop costs a round-trip, and round-trips are 99.7 % of your
latency budget. You would be paying the only cost you have, twelve times over.

**So the target is a modular monolith with hard-enforced internal boundaries,
deployed as 8 narrow serverless surfaces instead of 24 identical fat ones.**
Boundaries are enforced by the type system and a dependency-cruiser gate, not by
HTTP. When a boundary genuinely needs to become a network hop, the seam already
exists — that day is not today, and §11 defines the numeric trigger for it.

The four things actually costing you reliability and speed, in order:

1. **No timeout or retry on the database transport.** One hung PostgREST call
   consumes the entire 10 s Netlify budget. Only Gemini, downloads and FCM have
   timeouts; the DB — the dependency you call most — has none.
2. **24 identical 331 KB bundles.** Cold starts pay for code the endpoint never
   executes.
3. **State that pretends to be shared.** The rate limiter and cache are in-process
   `Map`s. Netlify runs many concurrent instances, so the rate limiter is
   trivially bypassable and the cache hit rate is `1 / instanceCount`.
4. **Runtime schema guessing.** `findTable()` tries 10 table names; WA lookups
   probe 7 column aliases of which 6 do not exist. You pay 2–3 failed HTTP
   round-trips (~78 ms) to discover a schema that has been stable for months.

---

## 1. Current state — how requests actually flow

```
Browser
  └─ src/lib/apiClient.ts   (1 of 24 endpoints, POST { action, payload, sessionToken })
       └─ netlify/functions/<name>.js        ← 24 entry points, identical 331 KB bundle
            └─ _lib/netlify-wrapper.ts       (CORS *, IP extract, token from 3 places)
                 └─ _lib/handlers.ts         (ping short-circuit → rate limit → dispatch)
                      └─ _lib/action-registry.ts   ← 74 actions, ONE flat table
                           └─ actions-*.ts / ai/*.ts     ← everything imports everything
                                └─ db/client.ts   (raw fetch, no timeout, no retry)
                                     └─ PostgREST (service-role key, RLS bypassed)
                                     └─ Storage / Gemini / Fonnte / FCM / Cloudinary
```

### What is genuinely good — keep it

- **The single dispatcher** (`handlers.ts:123`) is the correct pattern. One choke
  point for auth, rate limiting, logging and error shaping. No raw stack traces
  reach clients. This survives the refactor unchanged.
- **`action-registry.ts` as the single contract table** with a contract test. The
  pattern is right; the *scope* of the table is wrong (74 unrelated actions in one
  namespace).
- **`shared/wa-rules.ts`** — one normalisation point shared by client and server.
  This is exactly right and is the seed of the shared kernel (§3.1).
- **`session.ts`** — HMAC-SHA256 with `timingSafeEqual` and a length pre-check,
  and (already fixed) it *throws* in production rather than falling back to the
  committed literal. Token design is sound.
- **The repo split** `db/` (query) vs `actions/` (handler) is half a layered
  architecture. Finish it.

### The defects that shape the target design

| # | Defect | Evidence | Architectural consequence |
|---|---|---|---|
| D1 | No timeout/retry on DB transport | `db/client.ts:40`, `:114` — bare `fetch()` | Any hung query eats the whole 10 s budget → §6 |
| D2 | 24 identical fat bundles | `.netlify-built/*` all ~331 KB | Cold start dominates → §4 |
| D3 | In-process rate limiter & cache | `rate-limit.ts:19`, `cache.ts:8` | Bypassable, near-zero hit rate → §7, §8 |
| D4 | Runtime schema guessing | `db/candidates.ts:70-84`, `:172-211` | 2–3 wasted round-trips/request → §5.2 |
| D5 | Full-table load then JS slice | `fetchPagedAll` + `dedupeKandidatRaw` | O(N) per request, grows unbounded → §5.4 |
| D6 | Service-role key for all ~74 actions | `db/client.ts:21` | RLS bypassed; every bug is a full-DB bug → §5.3 |
| D7 | Long work inside the request path | `actions-wa.ts:180` sleeps per message | Bulk send cannot exceed ~3 messages before 10 s timeout → §6.4 |
| D8 | `actions-master.ts` = 1,267 lines | god module | Blocks parallel work → §3 |
| D9 | No structured logs, no metrics, no tracing | `console.error` only | Blind in production → §10 |

---

## 2. Target architecture at a glance

```
                         ┌──────────────────────────────┐
   Browser / PWA ───────▶│  Netlify CDN  (L0 cache)     │  s-maxage + stale-while-revalidate
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │  Edge / routing layer        │  ─ auth check on /admin
                         │  (netlify.toml redirects)    │  ─ /api/* alias for legacy names
                         └──────────────┬───────────────┘
                                        │
        ┌───────────┬───────────┬───────┴────┬───────────┬───────────┬──────────┐
        ▼           ▼           ▼            ▼           ▼           ▼          ▼
    ┌───────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌───────┐
    │public │  │  auth  │  │  api   │  │   ai   │  │  docs  │  │ notify │  │ cron  │
    │ ~60KB │  │ ~50KB  │  │ ~120KB │  │ ~90KB  │  │ ~180KB │  │ ~60KB  │  │ ~60KB │
    └───┬───┘  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘  └───┬───┘
        │          │           │            │           │           │           │
        └──────────┴───────────┴─────┬──────┴───────────┴───────────┘           │
                                     │                                          │
                    ┌────────────────▼──────────────────┐                        │
                    │        Shared Kernel (in-process) │                        │
                    │  http · retry · breaker · cache   │                        │
                    │  errors · log · metrics · rules   │                        │
                    └────────────────┬──────────────────┘                        │
                                     │                                          │
              ┌──────────────────────▼───────────────────┐    ┌─────────────────▼────┐
              │  Domain contexts (typed, isolated)       │    │  job_queue (Supabase)│
              │  identity · registry · applications      │◀──▶│  at-least-once work  │
              │  documents · master · scheduling         │    │  + retries + DLQ     │
              │  catalog · configuration                 │    └──────────────────────┘
              └──────────────────────┬───────────────────┘
                                     │  repositories only, via ports
              ┌──────────────────────▼───────────────────┐
              │  Supabase: PostgREST (pooled) · Storage   │
              │  External: Gemini · Fonnte · FCM · CDN    │
              └──────────────────────────────────────────┘
```

**Eight deployment surfaces, not twenty-four.** Each imports only the contexts it
needs:

| Surface | Contexts | Heavy deps | Latency profile | Cache |
|---|---|---|---|---|
| `public` | catalog, share | none | < 100 ms, read-only | CDN 60 s + SWR 24 h |
| `auth` | identity | `bcryptjs` | < 300 ms (bcrypt) | none |
| `api` | registry, applications, master, scheduling, configuration, registration | `xlsx` | < 400 ms | in-process, per-key |
| `ai` | ai-orchestration | none (fetch) | 3–25 s → **background** | none |
| `docs` | documents | none | < 500 ms | none |
| `ingest` | ingestion | `mammoth`, `pdf-parse` | 5–60 s → **background** | none |
| `notify` | notifications | none | per-message → **queued** | none |
| `cron` | scheduling (reminders) | none | scheduled | none |

`ai`, `ingest` and `notify` become **Netlify Background Functions** (15 min budget)
rather than synchronous ones. This alone fixes D7.

---

## 3. Service decomposition

### 3.1 The shared kernel

Things that every context may use and that must never depend on a context.
Small, boring, heavily tested.

```
_lib/kernel/
  http.ts        undici Agent (keep-alive, pool), timeouts, JSON helpers
  resilience.ts  retry + jitter, circuit breaker, bulkhead, timeout budgets
  errors.ts      AppError taxonomy → { code, httpStatus, retryable }
  log.ts         structured JSON logger, request-id propagation
  metrics.ts     counters/histograms flushed per invocation
  cache.ts       L1 in-process LRU + L2 CDN helpers, per-key invalidation
  auth.ts        verifyToken / requireRole / isOwnerOrAdmin (moved from actions-auth)
  validate.ts    zod helper: parseOrThrow<T>(schema, payload)
  rules/         wa-rules.ts, status.ts, gender.ts   ← promoted from shared/
```

`shared/wa-rules.ts` moves under the kernel and is re-exported to the client —
one source of truth, as it is today.

### 3.2 Bounded contexts and their boundaries

Twelve contexts. Each owns its tables; **no context queries another context's
tables directly** — it goes through the owner's exported interface.

| Context | Owns (tables) | Public interface | Replaces |
|---|---|---|---|
| **identity** | `admin_credentials`, sessions | `loginAdmin`, `loginKandidat`, `register`, `refresh`, `verify(token)` | `actions-auth.ts` |
| **catalog** | `job_database`, `sys_config` (read) | `getPublicBundle()`, `getJobByCode()` | `actions-public.ts` |
| **registry** | `database_candidate`, `master_database_candidate` (lifecycle) | `getPage(cursor)`, `getByWa()`, `updateStage()`, `nextCandidateId()` | `actions-candidate.ts`, part of `actions-master.ts` |
| **applications** | `database_asj_form` | `submit()`, `review()`, `approve()`, `reject()`, `listByWa()` | `actions-mail.ts`, `actions-register.ts` |
| **documents** | Storage buckets, `berkas` | `signUpload()`, `signDownload()`, `listFolder()`, `zipJob()` | `actions-upload.ts`, `actions-download.ts` |
| **master-data** | `master_database_candidate` (169 cols) | `getDraft()`, `submit()`, `update()` | rest of `actions-master.ts` |
| **ai-orchestration** | prompt/result cache | `chat()`, `classify()`, `interview()`, `buildCv()` | `ai/*.ts` |
| **notifications** | `fcm_tokens`, `wa_templates`, delivery log | `sendWa()`, `sendPush()`, `broadcast()` | `actions-wa.ts`, `fcm-server.ts` |
| **scheduling** | `jadwal`, `tugas` | `upsert()`, `remove()`, `dueReminders()` | `actions-schedule.ts` |
| **configuration** | `sys_config` (write), presets | `update()`, `getPresets()` | `actions-config.ts` |
| **registration** | `pendaftaran`, bridge tokens | `list()`, `submit()`, `mintBridge()` | `actions-register.ts` |
| **ingestion** | parse results | `parseDocument()` | `actions-ingest.ts` |

**Boundary rules, enforced by `dependency-cruiser` in CI:**

```
kernel        → (nothing)
contexts/*    → kernel, shared rules           ✅
contexts/*    → other contexts                 ❌  (must go through the owner's interface)
contexts/*    → db/client.ts, fetch()          ❌  (must use kernel/http + own repository)
surfaces/*    → any context's public interface  ✅
surfaces/*    → another surface                 ❌
```

The third rule is the one that matters. Today `actions-*.ts` call
`supabaseJson('GET', 'database_candidate', …)` from six different files. After the
refactor only `contexts/registry/repository.ts` may name that table.

### 3.3 Cross-context interaction rules

Three mechanisms, chosen by consistency requirement:

| Mechanism | Use when | Example |
|---|---|---|
| **Direct interface call (in-process)** | Caller needs the result to proceed; same consistency boundary | `applications.approve()` calls `registry.getByWa()` to attach the candidate |
| **Domain event (in-process, fire-and-forget)** | Side effect that must not fail the caller | `registry.updateStage()` emits `CandidateStageChanged` → `notifications` enqueues a WA |
| **Queued job (durable, in Supabase)** | Work exceeding ~2 s, or requiring retry/at-least-once | `notify.broadcast()`, `ingest.parseDocument()`, reminder sweep |

Events are typed and dispatched synchronously in-process today. The dispatcher
signature is deliberately identical to what a future SNS/EventBridge publish
would use, so promoting an event to a network hop is a one-file change.

```ts
// kernel/events.ts
export type DomainEvent =
  | { type: 'candidate.stageChanged'; wa: string; from: string; to: string; at: string }
  | { type: 'application.approved';   wa: string; jobCode: string; at: string }
  | { type: 'document.uploaded';      wa: string; kind: string; path: string; at: string };

export function emit(e: DomainEvent): void {
  for (const h of handlers[e.type] ?? []) {
    // never let a side effect fail the caller
    void Promise.resolve()
      .then(() => h(e))
      .catch((err) => log.error('event.handler.failed', { type: e.type, err: String(err) }));
  }
}
```

**Rule:** an event handler may never throw into its emitter, and may never assume
it runs before the response is returned.

---

## 4. Communication patterns

### 4.1 Client → server

Today: 24 endpoints × `POST { action, payload, sessionToken }`.

**Target: 8 endpoints, same envelope.** The envelope does not change, so
`apiClient.ts` keeps working with a one-line routing table.

```ts
// src/lib/apiClient.ts
const SURFACE: Record<string, string> = {
  getAppData: 'public', getMonthlyReport: 'public', shareData: 'public',
  checkAdminMaster: 'auth', loginKandidat: 'auth', refreshAdminSession: 'auth',
  processAIChat: 'ai',  processAiInterview: 'ai',  parseDokumenBiodata: 'ai',
  processUploadDoc: 'ingest',
  kirimTawaranMassal: 'notify', kirimSatuPesanFonnte: 'notify',
  getUploadUrls: 'docs', downloadJobDocs: 'docs',
};
const endpointFor = (action: string) =>
  `/.netlify/functions/${SURFACE[action] ?? 'api'}`;
```

Unmapped actions default to `api` — so the migration is incremental and an
omission is a *miss*, never a 404.

**Long-running actions return `202` + a job id.** The client polls
`GET /api/jobs/:id` or receives a push. This is what makes bulk WA sending and AI
document parsing work at all (D7).

### 4.2 Compatibility aliases

24 endpoint names are referenced from `src/`, deployed QR codes and the
keep-alive workflow. Keep them working via redirects:

```toml
# netlify.toml
[[redirects]]
  from = "/.netlify/functions/candidates"
  to   = "/.netlify/functions/api"
  status = 200
# …one per retired endpoint
```

Cheap, zero-risk, and lets you delete the alias only after logs show zero traffic
for 30 days.

### 4.3 Server → dependencies

All external I/O goes through kernel ports. No `fetch()` outside `kernel/http.ts`.

| Dependency | Sync budget | Retry | Breaker threshold | Degradation |
|---|---|---|---|---|
| PostgREST (read) | 2 s | 2, jitter | 5 fail / 30 s | serve stale cache (public) / 503 (writes) |
| PostgREST (write) | 3 s | **0** on non-idempotent | 5 fail / 30 s | 503 + idempotency key retained |
| Supabase Storage | 5 s | 2, jitter | 5 fail / 60 s | fail the upload, keep the DB row |
| Gemini | 25 s (bg) | 3, jitter | 3 fail / 60 s | return `ai_unavailable`, never block |
| Fonnte | 5 s | 3, jitter, respect 429 | 3 fail / 60 s | queue and retry; never fail the caller |
| FCM | 5 s | 2 | 10 fail / 60 s | drop; push is best-effort |

> **Degradation column verified 2026-09-13** (`docs/PHASE_E_DEGRADATION_MATRIX.md`).
> Two entries have since been brought in line with their row: a **PostgREST
> write** failure now answers **503 + `Retry-After: 5`**, not 500, and **Gemini**
> now raises the real **`AI_UNAVAILABLE`** code (503) that this table always
> promised. One entry still does not describe the code: **Fonnte** enqueues on
> both paths but never emits 202. Storage and FCM match the code.

Note the asymmetry: **reads retry, non-idempotent writes do not.** Retrying a
create without an idempotency key is how you get duplicate candidates.

---

## 5. Data layer

### 5.1 Layered access — the rule that fixes D6

```
handler  →  service (business rules)  →  repository (SQL/PostgREST)  →  kernel/http
```

Only files named `repository.ts` may name a table. Services receive typed
interfaces, not rows. Handlers never see column names.

### 5.2 Kill runtime schema discovery (D4)

Replace guessing with a **generated, versioned schema contract**.

```ts
// db/schema.generated.ts   ← produced by scripts/gen-schema.mjs, committed
export const SCHEMA_VERSION = '2026-09-01';
export const CANDIDATE_TABLE = 'database_candidate';
export const CANDIDATE_WA_COLUMN = 'no_wa';      // the only one that exists
```

A CI job regenerates it from the live DB and fails the build on drift. The 10-name
`CAND_TABLES` probe and the 7-alias WA probe disappear; `no_wa` is used directly.

**Gain (measured basis, 39.2 ms RTT): −2 round-trips ≈ −78 ms per candidate
lookup, −78 ms per master lookup.** Nothing else in this document has a better
effort-to-payoff ratio. Ship it first.

### 5.3 Least-privilege database clients

Three client factories, selected per request — not one global service-role client:

| Client | Key | Use |
|---|---|---|
| `anonClient()` | anon | public catalog, share view |
| `userClient(token)` | user JWT | **default for all candidate-scoped reads/writes** — RLS applies |
| `serviceClient()` | service role | allow-listed operations only, each logged with reason |

```ts
// kernel/db.ts
const SERVICE_ROLE_ALLOWLIST = new Set([
  'registry.nextCandidateId',   // needs cross-table MAX
  'documents.signUpload',       // Storage signing
  'configuration.migrate',
]);
export function clientFor(op: string, token?: string) {
  if (SERVICE_ROLE_ALLOWLIST.has(op)) {
    log.warn('service_role.used', { op });
    return serviceClient();
  }
  return token ? userClient(token) : anonClient();
}
```

Then enable RLS on `database_candidate`, `master_database_candidate` and
`database_asj_form` with a policy of `no_wa = current_wa()`. This turns the IDOR
class of bugs (`CODE_REVIEW.md` C5) from "full DB read" into "blocked by the
database" — defence in depth, which is the point of least privilege.

### 5.4 Query shapes

| Change | Why |
|---|---|
| **Keyset pagination** on `(updated_at DESC, id DESC)` instead of offset-over-a-full-load | `fetchPagedAll` + `.slice()` is O(N) per page and O(N) memory; it breaks past ~10 k rows |
| **Delete `dedupeKandidatRaw`** | `no_wa` has a UNIQUE constraint — 0 duplicates exist. It is O(N) work that provably never fires |
| **Stop the extra page fetch** in `fetchPagedAll` when `rows.length < pageSize` | −1 round-trip ≈ −39 ms per list load, for free |
| **Always project columns**; delete every `select=*` fallback | master table is 169 cols / 1.14 KB per row |
| **Per-request memoisation** (DataLoader pattern) for `getByWa` | collapses repeated lookups within one request to one query |
| **Stable projection contracts** (`CAND_MAP_COLS` etc.) verified against generated schema | prevents the fallback-to-`*` regression from returning |

### 5.5 Write path

- **Idempotency key** on every mutating action. `Idempotency-Key` header →
  `idempotency_keys(id, result, expires_at)`. Replays return the stored result
  instead of double-writing. This is the prerequisite for ever retrying a write.
- **Optimistic concurrency** via `updated_at` (If-Match). Prevents the
  last-write-wins clobber that a 1,267-line god module makes easy.
- **Allocation without races**: `nextCandidateId()` currently reads MAX across two
  tables then inserts — a classic TOCTOU. Move to a Postgres sequence
  (`candidate_id_seq`) and format `ASJ` + `lpad(n,5,'0')`. Atomic, no retry loop.
- **Upsert with `on_conflict`** is already used and correct; keep it.

### 5.6 Migrations

`netlify/migrations/` currently holds loose `.sql` files with no ordering
guarantee, and `runMigration` is an *HTTP endpoint* — an unauthenticated-ish
remote schema mutation trigger. Replace with:

- Forward-only, timestamped, **checksummed** migrations applied by
  `scripts/migrate.mjs` in CI.
- A `schema_migrations` table recording version + checksum + applied_at.
- **Delete the `runMigration` action from the registry.** Schema changes must
  never be reachable from a POST body.

---

## 6. Fault tolerance

### 6.1 Timeout budgets

Every layer has a budget strictly smaller than its caller's. Enforced in
`kernel/http.ts`, not by convention.

```
Netlify function limit        10 s  (synchronous)  /  15 min (background)
  ├─ total downstream budget   8 s
  │   ├─ PostgREST read        2 s
  │   ├─ PostgREST write       3 s
  │   ├─ Storage               5 s
  │   └─ Fonnte / FCM          5 s
  └─ reserve for response      2 s
```

```ts
// kernel/http.ts
import { Agent } from 'undici';
const POOL = new Agent({
  connections: 8,
  keepAliveTimeout: 30_000,
  connectTimeout: 5_000,
  headersTimeout: 5_000,
  bodyTimeout: 8_000,
});

export async function request(url: string, init: RequestInit & { budgetMs: number }) {
  const { budgetMs, ...rest } = init;
  const deadline = AbortSignal.timeout(budgetMs);
  try {
    const res = await fetch(url, { ...rest, dispatcher: POOL, signal: deadline });
    if (!res.ok) throw new HttpError(res.status, await res.text());
    return res;
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new AppError('UPSTREAM_TIMEOUT', { retryable: true });
    throw e;
  }
}
```

Keep-alive also removes a TLS handshake from every call, which at 39 ms RTT is a
direct latency win on top of the reliability win.

### 6.2 Retry

```ts
// kernel/resilience.ts
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
export async function withRetry<T>(fn: () => Promise<T>, o: RetryOpts): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      const canRetry =
        o.idempotent !== false &&
        attempt < o.attempts &&
        (e instanceof AppError ? e.retryable : isTransientNetworkError(e));
      if (!canRetry) throw e;
      const backoff = Math.min(o.base * 2 ** attempt, o.max);
      await sleep(backoff / 2 + Math.random() * (backoff / 2));   // full jitter
    }
  }
}
```

Full jitter matters: without it, a Fonnte outage makes every concurrent instance
retry in lockstep and you re-create the thundering herd during recovery.

### 6.3 Circuit breaker + bulkhead

Per dependency, per instance — in-process state is *acceptable here* because a
breaker only needs to fail fast locally; it does not need global agreement.

```ts
// closed → open after N consecutive failures in window
// open   → all calls fail immediately for coolDownMs (no upstream load)
// half-open → 1 probe; success closes, failure re-opens
const BREAKERS = {
  postgrest: { threshold: 5, windowMs: 30_000, coolDownMs: 15_000 },
  gemini:    { threshold: 3, windowMs: 60_000, coolDownMs: 30_000 },
  fonnte:    { threshold: 3, windowMs: 60_000, coolDownMs: 60_000 },
};
// bulkhead: at most 8 concurrent in-flight calls per dependency per instance
```

When open, the breaker returns a typed `DependencyUnavailable` — never a raw
network error — so the handler can degrade deliberately.

### 6.4 Graceful degradation matrix

| Failure | Behaviour |
|---|---|
| DB down, public catalog | serve last-known-good from CDN (stale-if-error, 24 h) |
| DB down, writes | 503 + idempotency key retained so the client can safely replay |
| Gemini down | `ai_unavailable`; AI tabs show a banner; everything else works |
| Fonnte down | enqueue to `job_queue`, return 202; delivered on retry |
| FCM down | log + drop; push is strictly best-effort, never blocks |
| Storage down | DB row written, upload retried; document list shows "pending" |

> **Verified 2026-09-13** (`docs/PHASE_E_DEGRADATION_MATRIX.md`): of these six
> rows, four match the code (DB-down public catalog, DB-down writes, Gemini, FCM)
> and two do not (Fonnte, Storage — with the caveat that the Storage retry is
> **client-side**, so a closed tab has none). See §6.5 above.

**No dependency failure may take down an unrelated feature.** Today a Gemini
timeout can fail an admin CRUD action because they share a bundle and a try/catch.

### 6.5 Durable async work

```sql
create table job_queue (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,          -- 'wa.broadcast' | 'ai.parse' | 'reminder.sweep'
  payload       jsonb not null,
  idempotency_key text unique,
  status        text not null default 'pending',   -- pending|running|done|failed|dead
  attempts      int  not null default 0,
  max_attempts  int  not null default 5,
  run_after     timestamptz not null default now(),
  locked_until  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);
create index on job_queue (status, run_after) where status in ('pending','failed');
```

Claim with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` so concurrent
cron invocations cannot double-process. After `max_attempts` the row moves to
`status='dead'` and alerts — a dead-letter queue you can actually query.

This is what replaces Kafka at your scale: the same at-least-once delivery,
retry and DLQ semantics, on infrastructure you already pay for.

---

## 7. Rate limiting and abuse control

The current `Map`-based limiter is bypassable by distributing requests across
instances, and it silently under-counts. Move counters to the database — one
round-trip, and it is the shared state you already have.

```sql
create table rate_counters (
  bucket text primary key,      -- 'login:203.0.113.9'
  window_start timestamptz not null,
  count int not null default 0,
  fails int not null default 0,
  locked_until timestamptz
);
-- atomic increment, returns the new count; resets the window when expired
create function rate_check(key text, lim int, win_ms int,
                           lock_after int, lock_ms int)
returns table (allowed boolean, retry_after int, locked boolean)
language plpgsql as $$ … $$;
```

| Scope | Limit | Notes |
|---|---|---|
| admin login | 5 / min / IP + lock 5 min after 10 fails | as today, now shared |
| candidate login | 10 / min / IP | as today |
| AI | 10 / min / identity, 60 / min / IP | as today |
| Fonnte | 2 / min / admin | as today |
| admin CRUD | 120 / min | as today |
| **anonymous write** | **20 / min / IP** | new — covers the unauthenticated endpoints in `CODE_REVIEW.md` C3/C4 |
| **`getUploadUrls`** | **10 / min / session** | new — the endpoint currently has no auth at all |

Cost: one lightweight write per request. At 39 ms RTT on a path that already
makes 2–5 DB calls, this is acceptable — and correctness beats the last 40 ms.

---

## 8. Caching

Four tiers. Note what is *not* here: Redis.

| Tier | Where | What | TTL | Invalidation |
|---|---|---|---|---|
| **L0** | Netlify CDN | `public` surface responses, `/_astro/*` | 60 s + `stale-while-revalidate=86400` | tag purge on `sys_config` / job change |
| **L1** | Browser `sessionStorage` | today's SWR-lite cache | 30 s, serve-stale on error | blanket on mutation (already implemented) |
| **L2** | In-process LRU | per-request hot reads, dropdowns | 60 s | **per-key**, not `cacheClear()` |
| **L3** | Postgres (`cache_entries`) | expensive aggregates (monthly report) | 5 min | write-through on mutation |

**Why no Redis:** you need a *shared, low-churn* cache for a handful of keys.
The CDN is already globally shared, free, and fronted by 300+ PoPs — it strictly
dominates a single-region Redis for the public read path, which is your only
high-traffic path. §11 gives the trigger for revisiting.

**The CDN-as-shared-cache pattern** is the single highest-leverage change here:

```ts
// surfaces/public.ts
return new Response(JSON.stringify(data), {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=86400, stale-if-error=86400',
    'CDN-Cache-Control': 'public, s-maxage=60',
    'Vary': 'Accept-Encoding',
  },
});
```

`stale-if-error=86400` means a full Supabase outage degrades the public job board
to "slightly stale" instead of "error page". That is worth more than any index
tuning in this codebase.

### Cache invalidation

Today `cacheClear()` wipes all 50 entries on any mutation — a global flush that
throws away the 90 % that did not change. Replace with a **generation counter**:

```sql
alter table sys_config add column cache_gen bigint default 0;
-- on any config/job write: update sys_config set cache_gen = cache_gen + 1
```

Cache keys become `public-base:v${gen}:${mode}`. Old generations expire naturally;
no cross-instance coordination needed, no thundering herd on flush.

**Also: negative caching.** Cache "candidate not found" for 10 s. Repeated lookups
for a non-existent WA currently hit the DB every time — an easy DoS vector.

---

## 9. Horizontal scaling

Serverless already scales horizontally by default. The real question is what
*stops* it from scaling. Four constraints, in order of when they will bite:

### 9.1 Statelessness (bite: now)

Anything in process memory is wrong the moment instance count > 1.

| State | Today | Target |
|---|---|---|
| Rate-limit counters | in-process `Map` | Postgres `rate_counters` |
| Session | stateless HMAC ✅ | keep — already correct |
| Public data cache | in-process `Map` | CDN (L0) |
| DB connections | new TLS per call | undici pool, keep-alive |
| Job progress | none | `job_queue` |

After this, any function can be replicated to N instances with no coordination.

### 9.2 Connection pool arithmetic (bite: soon)

Supabase caps Postgres connections (~60 on free/Pro tiers) fronted by Supavisor.
**Functions must connect through the pooler, not directly.**

```
max_connections_used = instances × pool.connections
                     = instances × 8
```

With a 60-connection budget, 8 per instance supports ~7 concurrent instances.
Guidance:

- Point functions at the **Supavisor transaction-mode pooler** (port 6543),
  not the direct connection (5432).
- Set `connections: 8` per instance and cap Netlify function concurrency.
- Set a `statement_timeout` of 5 s server-side so a runaway query cannot pin a
  connection.

### 9.3 Cold starts (bite: now)

| Surface | Today | Target | Lever |
|---|---|---|---|
| `public` | 331 KB | ~60 KB | own registry slice; no `mammoth`/`pdf-parse`/`xlsx` |
| `auth` | 331 KB | ~50 KB | only bcrypt + identity context |
| `api` | 331 KB | ~120 KB | no AI, no ingestion |
| `ingest` | 331 KB | ~180 KB | heavy parsers here only |

Two mechanisms: (a) per-surface registries so tree-shaking actually removes code,
(b) lazy `import()` for rarely used heavy paths. Plus provisioned concurrency on
`public` — it is the only surface where cold start is user-visible.

### 9.4 Data growth (bite: never, at current trajectory)

The DB is 14 MB and grows by ~230 candidates/year. It will fit in shared buffers
for the foreseeable future. **Do not build read replicas, sharding or
partitioning.** Thresholds that would change this answer:

| Trigger | Threshold | Then |
|---|---|---|
| DB exceeds 2 GB / working set exceeds RAM | measure quarterly | read replica for admin analytics |
| `database_candidate` exceeds 100 k rows | `select count(*)` | mandatory keyset pagination everywhere (already planned) |
| Sustained > 500 req/s | Netlify analytics | consider a long-lived container for the `api` surface |
| Write contention on one candidate row | lock wait metrics | optimistic concurrency + conflict UI |

---

## 10. Observability

You are currently blind: `console.error` with string concatenation, no request
ids, no metrics, no tracing. Every incident is archaeology.

### 10.1 Structured logs

```ts
// kernel/log.ts
export function log(level, event, fields) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level, event,
    requestId: REQUEST_ID.get(),   // AsyncLocalStorage
    surface: SURFACE.get(),
    action: ACTION.get(),
    wa: hashWa(fields.wa),         // PII: hash, never log raw
    ...fields,
  }));
}
```

Rules: **never log `no_wa`, `nik`, `no_pasport`, tokens, or file contents.**
Log a stable hash for correlation. This is a hard requirement — the current
handlers already log `{ action, error }` and any future field addition will leak
PII unless the logger enforces it centrally.

### 10.2 The four signals, per surface

| Signal | Metric | Alert |
|---|---|---|
| Latency | p50 / p95 / p99 per action | p95 > 800 ms for 5 min |
| Traffic | req/s per action | −80 % vs 7-day baseline |
| Errors | rate by `error.code` | > 2 % for 5 min |
| Saturation | breaker-open count, `job_queue` depth | queue depth > 100 |

### 10.3 Distributed tracing

Propagate a `traceparent` from the browser through `apiClient` into the function
and attach it to every downstream call. Emit spans for: function invocation, each
PostgREST call, each external call. Without this you cannot tell "slow DB" from
"slow Gemini" from "cold start" — and those have completely different fixes.

### 10.4 Dependency call log

One table, sampled, is enough:

```sql
create table dependency_calls (
  ts timestamptz default now(),
  dep text, action text, budget_ms int, duration_ms int,
  outcome text, attempts int, breaker_state text
);
```

This is how you discover that the 39 ms RTT you measured locally is 200 ms from
Netlify's region — the open question `DB_PERFORMANCE_AUDIT.md` §"Yang Belum Saya
Ukur" flagged, and the number that determines whether §5.2 saves 78 ms or 400 ms.

---

## 11. What NOT to build

Explicitly rejected, with the condition that would reopen each:

| Don't build | Why not | Reopen when |
|---|---|---|
| **Microservices** (network-split) | Every hop costs a round-trip; round-trips are 99.7 % of your latency. You would multiply your only real cost | A context needs independent deploy cadence or a different runtime — not before |
| **Kubernetes / ECS / VM cluster** | Serverless already scales to zero and to your peak. 14 MB of data, ~230 writes/year | Sustained > 500 req/s, or functions hitting cost/limit ceilings |
| **Kafka / RabbitMQ / SQS** | `job_queue` in Postgres gives the same at-least-once + retry + DLQ at zero marginal cost | > 10 k jobs/day or multi-consumer fan-out |
| **Redis / Memcached** | The CDN is a globally shared cache you already have; a single-region Redis is strictly worse for the public read path | Sub-second invalidation of per-user cached data, or > 100 k cache ops/min |
| **Event sourcing / CQRS** | 225 rows. The audit already withdrew the materialized-view recommendation on measured evidence | Audit requirements demanding full history — and even then, prefer an append-only log table |
| **GraphQL** | One client (your own SPA), a known fixed action set. Adds a resolver layer and N+1 risk for no benefit | Third-party API consumers |
| **Read replicas / sharding / partitioning** | 14 MB, 100 % cache hit, 0 dead tuples | DB > 2 GB or working set > RAM |
| **New database indexes** | 20 existing indexes are never used; the planner correctly chooses seq scan on 225 rows | Rows > 100 k on any scanned table |
| **Separate database per service** | Would force cross-service joins over the network — the exact cost you cannot afford | Never at this scale |

---

## 12. Migration path

**Strangler fig.** The wire contract (`{ action, payload, sessionToken }`) never
changes, so `apiClient.ts` is untouched until the very last phase. Each phase is
independently shippable, independently revertible, and ends with a measurement.

### Phase 0 — Safety net (0.5 day) · do this first

Nothing else is safe until these exist.

1. Delete `src/types/api.ts` → restores type checking across `src/` (50 errors
   currently suppress semantic analysis of the entire frontend).
2. Add `netlify/functions/**` to `vitest.config.ts` `include` — 13 of 15 suites
   are silently excluded today; 4 of them fail.
3. Delete or repair `action-registry.test.ts` (reads a `js/` dir that no longer
   exists).
4. `git rm --cached netlify/functions/.netlify-built/` + gitignore (167 k lines of
   committed build output).
5. **Write the characterisation tests** for the 6 highest-traffic actions
   (golden-response tests against a staging Supabase project). This is the
   regression net that makes phases 1–5 safe.

**Gate:** `npx tsc --noEmit` clean, `npx vitest run` ≥ 96 tests green.

### Phase 1 — Stop the bleeding on the hot path (1–2 days)

All in `kernel/`, no behaviour change.

1. `kernel/http.ts`: undici Agent + `AbortSignal.timeout` on the PostgREST
   transport (**fixes D1**).
2. Generated `db/schema.generated.ts`; replace `findTable()` probes and the 7-alias
   WA probes with direct `no_wa` (**fixes D4**, −78 ms/lookup).
3. Delete `dedupeKandidatRaw` (provably a no-op under a UNIQUE constraint).
4. `fetchPagedAll`: stop after a short page (**−39 ms/list load**).
5. Update `vitest.config.ts`, fix the 4 phone-validation failures.

**Gate:** p95 `getAppData` and `getCandidatesPage` measured before/after via
`scripts/db-baseline.mjs`. Expect −150 to −200 ms.

### Phase 2 — Cross-cutting kernel (3–4 days)

1. `kernel/errors.ts`, `log.ts` (structured, PII-hashed), `metrics.ts`.
2. `kernel/resilience.ts`: retry + jitter, circuit breaker, bulkhead. Wire into
   the one dispatcher in `handlers.ts`.
3. Rate limiter → Postgres `rate_counters` (**fixes D3**).
4. Cache: per-key invalidation + generation counter; delete `cacheClear()`.
5. Zod validation at the handler boundary — start with the 4 IDOR endpoints from
   `CODE_REVIEW.md` C5, then the rest.

**Gate:** chaos test — point the breaker at a deliberately failing endpoint,
confirm degradation (not 500s) and recovery.

### Phase 3 — Vertical slice: extract one context (2–3 days)

Pick `identity` (smallest, best-tested, cleanest boundary).

1. Create `contexts/identity/{service,repository,index}.ts`.
2. Move `actions-auth.ts` logic in; delete the old file.
3. Add `dependency-cruiser` with the §3.2 rules; **fail CI on violation.**
4. Create `surfaces/auth.ts` with a narrow registry (9 actions).
5. Add the `netlify.toml` alias; delete the 4 old entry points after 30 days of
   zero traffic.

**Gate:** `auth` bundle < 60 KB; all auth E2E tests green; CI boundary check green.

### Phase 4 — Remaining contexts (1–2 weeks)

Order by dependency weight, not by size:

```
documents  →  catalog  →  registry  →  applications  →  master-data
          →  scheduling  →  configuration  →  registration  →  notifications
```

`ai-orchestration` last — it is the most entangled and is changing fastest.

**Gate per context:** bundle size target met, boundary check green, no behavioural
diff in the characterisation tests from Phase 0.

### Phase 5 — Async and scale-out (1 week)

1. `job_queue` table + claim-with-`SKIP LOCKED` worker.
2. Convert `ai`, `ingest`, `notify` to **background functions**; long actions
   return `202` + job id (**fixes D7**).
3. `nextCandidateId` → Postgres sequence.
4. Idempotency keys on all mutations.
5. CDN cache headers on `public`; provisioned concurrency.
6. Observability: tracing, `dependency_calls`, the four dashboards.

**Gate:** load test at 10× projected peak; confirm breakers open under injected
failure and the system degrades rather than 500s.

### Rollback

Every phase ships behind the unchanged wire contract, so rollback is a git
revert. The only stateful steps are migrations — all written to be
additive-only (new tables/columns, never destructive), so a revert never
requires data recovery.

---

## 13. Target SLOs

| Metric | Today (measured/estimated) | Target |
|---|---|---|
| `getAppData` p95 (warm) | ~250 ms | **< 150 ms** |
| `getAppData` p95 (cold) | ~1.5 s | **< 600 ms** |
| Candidate lookup p95 | ~160 ms (3 round-trips) | **< 60 ms** (1 round-trip) |
| Function bundle (avg) | 331 KB | **< 120 KB** |
| Deployed function code | 7.9 MB | **< 1 MB** |
| Rate-limit bypass | trivial (per-instance) | **not possible** |
| Cache hit rate (public) | 1 / instances | **> 95 %** at the CDN |
| DB timeout coverage | 0 % | **100 %** |
| Retry coverage (idempotent) | 0 % | **100 %** |
| PII in logs | unenforced | **0** (logger-enforced) |
| Availability (public board during DB outage) | 0 % | **> 99 %** (stale-if-error) |

---

## 14. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Phase 0 characterisation tests are skipped → regressions surface in production | **High** | Do not start Phase 1 without them. Non-negotiable |
| Boundary rules too strict, teams route around them | Medium | Escape hatch: an explicit, reviewed `// @boundary-exception: <reason>` comment counted in CI |
| Postgres rate-limit table becomes a hot spot | Low | One indexed row per bucket; at your traffic this is < 100 writes/min. Revisit above 1 k req/s |
| Background functions mask failures from users | Medium | Job status endpoint + push notification; alert on `dead` rows |
| Over-engineering — this document is long and the system is small | **Medium** | Phases 0–1 are ~2 days and capture most of the value. If you stop after Phase 2, you have fixed the real problems |
| Under-engineering on security — RLS stays off | Medium | Treat `CODE_REVIEW.md` C3–C6 as blocking prerequisites to Phase 4 |

---

## 15. Immediate next actions

Ordered, all under one day each:

1. **Phase 0 items 1–4** — restore type checking, un-silence 13 test suites,
   untrack 167 k lines of build output.
2. **`kernel/http.ts`** — keep-alive + timeout on the PostgREST transport.
   Highest reliability gain per line of code in the entire codebase.
3. **Generate `db/schema.generated.ts`** and delete the column-alias probing.
   −78 ms per lookup for a few hours of work.
4. **Set `SESSION_SECRET` in Netlify** and confirm `session.ts` throws without it
   (already fixed in code — verify the env var is actually set in prod).
5. **`CODE_REVIEW.md` C3–C6** — the three unauthenticated endpoints and the four
   IDOR sites. These are live data-exposure bugs and outrank any refactor.
6. **Measure RTT from a Netlify function to Supabase** (log timings in
   `db/client.ts`). The one number this document's priorities are most sensitive to.

---

## Appendix A — File map: today → target

```
netlify/functions/
├── _lib/
│   ├── handlers.ts                 → kernel/dispatch.ts          (moved, slimmed)
│   ├── action-registry.ts          → surfaces/*/registry.ts      (split by surface)
│   ├── netlify-wrapper.ts          → kernel/surface.ts           (CORS fixed, typed)
│   ├── session.ts                  → kernel/auth/session.ts      (unchanged)
│   ├── cache.ts                    → kernel/cache.ts             (per-key + gen)
│   ├── rate-limit.ts               → kernel/rate-limit.ts        (Postgres-backed)
│   ├── env.ts                      → kernel/env.ts               (fail-fast)
│   ├── storage.ts                  → contexts/documents/storage.ts
│   ├── fcm-server.ts               → contexts/notifications/fcm.ts
│   ├── actions-auth.ts             → contexts/identity/
│   ├── actions-public.ts           → contexts/catalog/
│   ├── actions-candidate.ts        → contexts/registry/
│   ├── actions-master.ts (1267)    → contexts/master-data/ + registry/
│   ├── actions-mail.ts             → contexts/applications/
│   ├── actions-upload.ts           → contexts/documents/
│   ├── actions-download.ts         → contexts/documents/
│   ├── actions-schedule.ts         → contexts/scheduling/
│   ├── actions-config.ts           → contexts/configuration/
│   ├── actions-register.ts         → contexts/registration/ + applications/
│   ├── actions-wa.ts               → contexts/notifications/
│   ├── actions-ingest.ts           → contexts/ingestion/
│   ├── ai/{chat,cv,classify}.ts    → contexts/ai-orchestration/
│   └── db/*.ts                     → contexts/*/repository.ts    (one owner per table)
└── *.js (24 entry points)          → 8 surfaces + netlify.toml aliases
```

## Appendix B — Related documents

| Document | Scope |
|---|---|
| `CODE_REVIEW.md` | Security findings C1–C6, H1–H12, M1–M15 |
| `docs/DB_PERFORMANCE_AUDIT.md` | Measured data-layer numbers; P0–P3 recommendations |
| `docs/db-optimization-2026-09-01.md` | Optimisations already applied 2026-09-01 |
| `docs/ARCHITECTURE.md` | Frontend architecture |
| `netlify/migrations/2026-09-01-*.sql` | Index cleanup + supporting indexes |
