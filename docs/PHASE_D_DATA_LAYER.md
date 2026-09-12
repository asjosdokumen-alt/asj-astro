> **Last updated:** 2026-09-12 — Phase D (harden the data layer). Status: **items 15–18 done**; the `select=*` gate is closed and RLS is locked down, both enforced by CI gates rather than by this document.

# Phase D — Hardening the data layer

Source of the phase: `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §11.

**Gate as written:** *zero `select=*` in the codebase; RLS blocks a cross-candidate read.*

Both halves are now met and both are enforced by a gate rather than by a document.
This file records what was measured, what changed, and what is still open.

---

## 1. What was actually true before

Everything below was measured against production on 2026-09-12, not inferred from
reading code. Two probes were used: the PostgREST OpenAPI document (service-role
key) and the public anon key over HTTPS.

### 1.1 `select=*` — 36 literal sites, plus implicit ones

`grep` found 36 `select: '*'` literals across `netlify/functions/`. It did **not**
find the implicit ones: PostgREST treats a missing `select` as `*`, and several
"fallback" paths omitted it entirely (`db/master.ts`, `db/forms.ts`,
`db/candidates.ts`, `db/jobs.ts`). So the real count was higher than 36.

The fallback pattern was the dangerous part:

```ts
try { light = await select(MASTER_LIGHT_COLS, q) } catch { /* projection rejected */ }
try { full  = await select(undefined, q) }           catch { /* give up */ }
```

A projection that names a column PostgREST does not have returns HTTP 400. The
second line then re-ran the query with **no projection at all** — i.e. the full
169-column row. A typo in a projection therefore did not fail; it silently
restored the exact read the projection existed to prevent. Nothing in the logs
said so.

### 1.2 The schema contract was a claim, not a contract

`db/schema.generated.ts` existed but was **hand-written from the dashboard** on
2026-09-01. Nothing checked it. `validateSchema()` returned `{ ok: true }`
unconditionally. There was no generator and no drift check — the file's own
header said "A CI check (future) will validate against the live schema".

Checked against the live schema, the four curated projections happened to be
valid. The file's own comments were not: `CAND_MAP_COLS` claimed to omit
`password_kandidat`, `catatan_internal` and `catatan_external` while listing all
three, and a second, drifted copy of `CAND_MAP_COLS` lived in
`db/candidates.ts`.

### 1.3 RLS was the only control, and on five tables it was off

The anon key is `PUBLIC_SUPABASE_ANON_KEY` — it ships to the browser. It is not a
secret, so RLS plus the table GRANTs are the whole of the protection.

| table | RLS | policies | anon could read |
|---|---|---|---|
| `database_candidate` | on | `candidate_own_wa` | 0 rows — correct |
| `master_database_candidate` | on | `master_own_wa` | 0 rows — correct |
| `database_asj_form` | on | `form_own_wa` | 0 rows — correct |
| `fcm_tokens` | on | *"Service role full access"* | **open** |
| `dependency_calls` | **off** | — | **open** |
| `idempotency_keys` | **off** | — | **open** |
| `job_queue` | **off** | — | **open** |
| `rate_counters` | **off** | — | **open** |
| `schema_migrations` | **off** | — | **open** |
| 16 further tables | on | none | denied — correct |

Proven live with the anon key, before the fix:

```
rate_counters        HTTP 206  */5     ← 5 rows
schema_migrations    HTTP 206  */11    ← 11 rows
dependency_calls     HTTP 206  */7     ← 7 rows
```

And **every one of the 25 tables** granted anon and `authenticated` the full DML
set — `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`.

Concretely, anyone with the published key could:

- read every queued job payload in `job_queue` — where session tokens used to
  live (`010_scrub_job_queue_session_token.sql` was written for exactly that);
- read **and rewrite** `rate_counters`, i.e. clear their own rate limit. The SLO
  table claims *"Rate-limit bypass: not possible (maintain)"*; on these tables it
  was possible;
- read and rewrite circuit-breaker state in `dependency_calls`;
- read and forge idempotency results in `idempotency_keys`;
- read the migration ledger;
- read every FCM device token. Its policy is named *"Service role full access"*
  but was created `TO PUBLIC` with `USING (true)` — PostgreSQL stores that as a
  null qual, so it matches every row and every role. `service_role` bypasses RLS
  anyway, so the policy only ever widened access.

### 1.4 Two columns the code names do not exist

Found while building the contract, confirmed against production:

| What the code does | Reality |
|---|---|
| `_lib/db/shareTokens.ts` filters `config_type=share_token` then reads and writes `config_key` | `sys_config` has **no `config_key` column** (`42703`). The lazy-mint path POSTs `config_key`, gets 400, catches, and returns `null` — so `ensureShareTokenForJob()` can never mint a token |
| `contexts/identity/repository.ts` reads `admin_credentials` | The table is **not exposed** (`PGRST205`). Both helpers answer 404 and are swallowed, so they always return `null` / `[]` |

Neither is a Phase D item, and both change behaviour if "fixed", so they are
recorded here rather than patched. See §5.

### 1.5 One dead query builder

`db/misc.ts` exported `queryPaged()`, a generic paged reader whose only
projection was `select: '*'`. Nothing called it. Deleted.

---

## 2. What changed

### 2.1 `schema.generated.ts` is now generated — and gated

| | |
|---|---|
| Generator | `scripts/ci/gen-schema.mjs` — reads the PostgREST OpenAPI document (Swagger 2.0, so the row shapes are under `definitions`, **not** `components.schemas`, which is always empty) |
| Drift gate | `npm run verify:schema` → exit 1 when the committed file no longer matches the live schema |
| Wired into | `ci:predeploy` / `ci:predeploy:local` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, which the deploy workflow already has) |

The file now contains:

- `SCHEMA_FINGERPRINT` — sha256 over `table:col,col,…` for all 25 tables, sorted;
- `TABLE_COLUMNS` — the contract itself, stored as one line per table
  (`<table>:<col>,<col>,…`) and parsed once at module load;
- `TableName` — a generated union of the 25 table names;
- named table constants (`TABLE_CANDIDATE`, …) emitted **only while the table is
  exposed**, so a dropped table cannot leave a stale constant compiling;
- the WA column per table, **derived** from the live column list rather than
  declared (`CANDIDATE_WA_COL = 'no_wa'` because that is the only alias the table
  has);
- `columnsOf`, `hasColumn`, `allColumns`, `project`.

**Why a string and not an object literal:** the module is bundled into all 19
entry points. The literal form (quoted key, quoted column, comma, indent — per
column) cost ~4 KB more per bundle for identical information.

**Regenerate after any schema change:** `npm run db:schema`, review the diff,
commit it. `verify:schema` fails the deploy if you forget.

### 2.2 Every read is projected, at two layers

**Layer 1 — runtime, airtight.** `supabaseJson()` resolves every GET through the
generated contract:

```ts
function resolveSelect(table, requested) {
  const known = columnsOf(table);
  if (!known || known.length === 0) return requested === undefined ? undefined : String(requested);
  if (requested === undefined || requested === null || requested === '' || String(requested) === '*') {
    return allColumns(table);       // ← never sends a wildcard
  }
  return String(requested);
}
```

A missing `select` and `select=*` both become an explicit column list. A read of a
table that is **not** in the contract is passed through untouched, because there
is nothing truthful to project it with. RPC paths (`rpc/…`) are unaffected.

**Layer 2 — static gate.** `npm run verify:projections`
(`scripts/ci/verify-projections.mjs`) fails the build on any `select: '*'` or
`select: "*"` literal under `netlify/functions/`, comments excluded. It reports
`file:line` and points at the replacement. Wired into `ci:quality` and the CI
`functions-tree` job, so it runs on every push with no secrets.

**Layer 3 — offline correctness.** `_lib/db/projections.ts` holds every named
projection, each stored once with the table it belongs to:

```ts
CAND_MAP_COLS: { table: 'database_candidate', columns: 'id,id_kandidat,…' }
```

`projections.test.ts` asserts, for every entry, that the table is exposed and that
every column exists on it. A typo is a red test with a column name, not a silent
full-table read at 3 a.m. No network, no database.

The gate result on this commit:

```
NO WILDCARD PROJECTIONS  175 files scanned under netlify/functions/
SCHEMA IN SYNC  netlify/functions/_lib/db/schema.generated.ts · 25 tables · sha256:c027ef1e05d5
```

**Fallbacks now retry with a projection instead of without one.** The
`try light → catch → try nothing` pattern is gone from `db/master.ts`,
`db/forms.ts`, `db/candidates.ts` and `db/jobs.ts`. Where a fallback genuinely
needs the whole row it uses `allColumns('<table>')` — still an explicit, checked
list.

### 2.3 Three genuine bugs fixed on the way

| Bug | Fix |
|---|---|
| `findTable()` probed up to 9 table names over HTTP to discover something the schema already states | It now consults `columnsOf()`. A name that is not exposed is skipped without a request |
| `tablesFromSchema()` returned RPC paths as if they were tables | Filters `rpc/…` |
| `columnsFromSchema()` read `components.schemas`, which PostgREST never populates, so it **always returned `[]`** — the adaptive table discovery in `contexts/catalog/repository.ts` could never match anything | Reads `definitions` (Swagger 2.0), with `components.schemas` as an OpenAPI-3 fallback |
| `findFormsByWa` / `findFormsByWaList` tried `or=(no_wa.eq.X,wa.eq.X)` first — `wa` does not exist, so it was **two guaranteed 400s (~78 ms at the measured 39 ms RTT) before the working query ran** (audit P0-1) | Removed; `no_wa` is the only WA column this schema has |
| `queryPaged()` — dead, wildcard-only | Deleted |

### 2.4 RLS lockdown — `migrations/012_rls_lockdown.sql`

1. `ENABLE ROW LEVEL SECURITY` on the five tables that had it off. With RLS on
   and no policy, PostgreSQL denies every row to every role except those with
   `BYPASSRLS` — the same fail-closed default the other 16 tables already rely on.
2. Dropped the `fcm_tokens` policy that was granted to `PUBLIC` with `USING (true)`.
3. `REVOKE ALL` from `anon` and `authenticated` on every public table **except**
   the three candidate-facing ones, which keep their `own_wa`-bounded
   SELECT/INSERT/UPDATE/DELETE.
4. `REVOKE TRUNCATE, REFERENCES, TRIGGER` on those three as well — no PostgREST
   request can exercise any of them, and `TRUNCATE` would empty the table.
5. `ALTER DEFAULT PRIVILEGES … REVOKE ALL ON TABLES` so the next `CREATE TABLE`
   does not re-open the hole. This is how the five tables got there.
6. Self-verifying: a `DO` block `RAISE EXCEPTION`s if any public table still has
   RLS off or any `TRUNCATE` grant remains, so a half-applied lockdown rolls back
   instead of committing.
7. `NOTIFY pgrst, 'reload schema'` — PostgREST caches the ACL it resolved at
   startup.

**Why this is safe for the application.** The frontend never queries PostgREST
directly. Verified by search, not assumption: the only `.from(` in `src/` is a doc
comment, the built bundle's Supabase client is used solely for `/auth/v1/`, and
uploads go through server-minted signed URLs. All table access is server-side via
Netlify Functions with `SUPABASE_SERVICE_ROLE_KEY`, which is `rolbypassrls = true`
and keeps its own grants.

One lesson from running it: `ALTER DEFAULT PRIVILEGES FOR ROLE <other>` is a hard
`permission denied` when the other role is `supabase_admin`, and inside the
migration transaction that aborts everything. Each role is now attempted in its
own sub-block; failures are reported, not raised.

### 2.5 The RLS gate — `scripts/ci/verify-rls.mjs`

Two modes, deliberately distinguishable:

- **Definitive** (when `SUPABASE_DB_URL` / `DATABASE_URL` is resolvable): reads
  the catalog — `relrowsecurity` for every table in `public`, the privileges held
  by `anon`/`authenticated`, and any policy granted to a public role with a true
  qualifier. Read-only, decisive.
- **Probe** (the CI deploy environment only holds the anon and service keys):
  asks PostgREST, as anon, for one row from every exposed table. **A row coming
  back is a proven leak and fails the build.** No row coming back proves nothing
  about an empty table, so this mode reports `DEGRADED` and says so rather than
  claiming the invariant holds.

That distinction matters: a check that reports success when it could not actually
see anything is worse than no check (`scripts/ci/verify-migrations.mjs` makes the
same argument for unverified RPCs).

---

## 3. Verification

### Before (2026-09-12, prior to `012`)

```
RLS GATE FAILED — the public anon key can still reach data it should not.
  LEAK   anon read a row from rate_counters
  LEAK   anon read a row from dependency_calls
  LEAK   anon read a row from schema_migrations
```

plus, in the definitive mode, 23 further findings: five tables with RLS off, a
`USING (true)` policy granted to `PUBLIC`, and `TRUNCATE` held by anon on all 25.

### After

```
RLS GATE OK
  mode   : definitive (database catalog, 25 tables)
  anon   : reachable tables — database_asj_form, database_candidate, master_database_candidate
  OK     every public table has RLS on; no TRUNCATE grant; no USING (true) to PUBLIC
```

Live anon probe — every internal table now answers `401 / 42501 permission denied`:

```
anon  job_queue            401 {"code":"42501", …}
anon  rate_counters        401 {"code":"42501", …}
anon  schema_migrations    401 {"code":"42501", …}
anon  database_candidate   200 []           ← own_wa policy still bounds it
```

Service role unaffected:

```
svc   database_candidate   206  0-0/226
svc   sys_config           206  0-0/158
svc   job_database         206  0-0/158
```

Production end-to-end, after the migration:

```
SMOKE TEST PASSED (1/1 checks)           https://asjastro.netlify.app
health            200  {"status":"ok","detail":"gated"}
public getAppData 200  success=true  jobs=1  first=TG591ASJ
```

`npm run ci:quality` — typecheck ratchet 0 errors, boundary, binding, entries,
I/O boundary, projections, bundle ratchet, **112 files / 998 tests**, indexer
gate. All green.

---

## 4. Trade-offs and things worth knowing

**Bundle size went up ~8.7 KB per entry point.** The schema contract is now
imported by `db/client.ts`, which every function depends on. Total deployed
function code moved 2,580 KB → 2,656 KB. `scripts/ci/bundle-size-baseline.json`
was re-recorded deliberately.

This is the one place where the change is a cost, so it is worth being explicit
about the alternative. The expensive part is the 169-column
`master_database_candidate` list (~2.6 KB). It is unavoidable while any code path
reads a whole master row: `fetchMasterByWa()` returns `MasterRawRow` to
`master-data/service.ts` (`buildMasterNested`) and `_lib/ai/cv.ts`, which read
across the whole row, so narrowing it is not safe. The options were:

1. ship the contract (chosen) — ~8.7 KB per function, gate enforced in CI;
2. a per-table module split so the bundler includes only referenced tables
   (~1–2 KB per function), at the cost of making `resolveSelect()` — which takes a
   runtime table name — no longer generic;
3. keep `select=*` at the two whole-row master call sites behind a documented
   allow-list in the gate.

Option 3 is the cheapest and is what a reviewer might reasonably prefer, because
an explicit 169-column list is **also** ~2.6 KB of URL on every such request —
strictly worse than `select=*` at the wire level, and the only thing it buys is
auditability. It was not chosen because the phase gate says *zero* `select=*`, and
weakening a stated gate unilaterally is not this change's call to make. **If the
owner prefers, option 3 is a small, well-understood edit** — `verify-projections.mjs`
already reports `file:line`, so an allow-list is a few lines.

**`allColumns('<table>')` still reads every column.** That is intentional: the
gate is about *knowing* the column set, not about shrinking it. Where a row is
genuinely needed whole, `allColumns()` names it, the drift gate checks it, and
the source says so. Narrow projections (`MASTER_LIGHT_COLS`, `FORM_LIGHT_COLS`,
`CAND_LIGHT_COLS`) remain the default for list endpoints.

**Item 17 (keyset pagination) is done where it is structurally right, and
measured-and-deferred where it is not.**

What was built — `_lib/db/pagination.ts`:

- `fetchPageKeyset(table, select, { key, limit, cursor, direction, query })` and
  `fetchAllKeyset(table, select, { key, batchSize, maxRows })`.
- It asks for `key > <last seen>` instead of `Range: start-end` (OFFSET/LIMIT),
  so an insert between two pages cannot shift the window. The old reader would
  have re-returned one row and dropped another, silently — the failure mode that
  appears exactly when the table outgrows one page, which is when the function
  was supposed to start working.
- It requests `limit + 1` rows and discards the extra, so a full page does not
  need a second request to learn it was not the last. The old reader always paid
  one extra round-trip (the audit measured ~39 ms per call).
- `batchSize` is capped at 999, because above that the `+1` look-ahead would be
  truncated by PostgREST's default `db-max-rows = 1000` and the walk would stop
  early.
- A cursor that does not advance is a thrown error, not an infinite loop against
  the database.

Wired into `fetchPagedAll` (`_lib/db/candidates.ts`), the only caller, with
`key: 'id'` — the only column on `database_candidate` that is unique, NOT NULL and
totally ordered (bigint; verified: 226 rows, 226 distinct ids, 0 nulls).
`supabasePaged()` and its `PagedResult` typedef are deleted — it had no other
caller, and its `Prefer: count=exact` was only there to terminate the loop that
the `+1` look-ahead now handles for free.

Verified against production with `batchSize: 100`, which forces the loop to page:

```
requests      : 3
rows returned : 226
distinct ids  : 226
ids sorted asc: true
first / last  : 1 / 586
projection ok : 10 cols (exactly CAND_LIGHT_COLS)
```

`pagination.test.ts` locks the contract down: no `Range`, no offset, `+1`
look-ahead, `gt.`/`lt.` filters, caller filters preserved, the 999 cap, a
self-terminating short page, a 1200-row walk in batches of 500 (the exactly-full
middle page must not be mistaken for the last), and the non-advancing-cursor
error.

**Why the remaining list endpoints are capped, not paged.** Measured row counts
on 2026-09-12:

| table | rows | table | rows |
|---|---|---|---|
| `master_database_candidate` | 228 | `ai_form_submissions` | 27 |
| `database_candidate` | 226 | `database_asj_form` | 21 |
| `sys_config` | 158 | `rincian_presets` | 13 |
| `user_sessions` | 53 | `pemberkasan_checklist` | 8 |
| `fcm_tokens` | 36 | everything else | ≤ 7 |

The caps in play are 500 and 1000. **Nothing is within an order of magnitude of
any of them**, so paging the schedule / task / WA-template / form / master list
reads would add code and risk for zero behavioural difference. The trigger for
extending keyset paging to them is the same one the architecture doc uses for new
indexes: a table crossing the page size. When that happens, `fetchPageKeyset` is
already there and the change is mechanical.

One thing deliberately **not** changed: several capped reads have no `order`
clause, so at the cap they would return an arbitrary subset. Adding an `order`
would change the row order those endpoints return, and for the index-based admin
actions (`rowIndex` positions in the mail tab) a different order is a different
behaviour. That is a decision to make with the frontend in view, not a drive-by
edit. It is recorded here as an open item.

---

## 5. Open items handed over

Status as of 2026-09-13. Two of the three original defects needed correcting
before they could be acted on — the original notes understated both.

| # | Item | Status |
|---|---|---|
| 1 | `sys_config` has no `config_key` column, so `ensureShareTokenForJob()` can never mint a share token (feature B06) | **Open — needs a product decision.** Probed: 0 rows of `config_type='share_token'`, so no token was ever minted. The endpoint is live (`netlify/functions/share-data.js`, wired by the A15 parity fix) and **fails closed** — `handleShareData` answers "Link share belum diaktifkan" when no token exists, so candidate dossiers are **not** exposed today. Making minting work would activate a public, CORS-`*`, unauthenticated endpoint that serves a job's candidate dossiers |
| 2 | `admin_credentials` — `findAdminByName` / `findAdmins` always return empty | ✅ **Fixed 2026-09-13 (item 5).** The table still does not exist in the catalog, so `findAdminByName` remains empty — but personal admin login no longer depends on it. `checkAdminPersonal` (`contexts/identity/service.ts`) now uses the legacy **three-tier** order: env `PIN_<NAME>` → env `ASJ_ADMINS="Name:pin,…"` → the DB table as an optional third tier. Tiers 1–2 are constant-time (`timingSafeEqual`) and need no network, so login survives a database outage. All four names the UI offers (`SACHOU`, `AYOK`, `KHOLIS`, `KHOCI`) have `PIN_*` vars |
| 3 | `getActiveSchedules()` destructures `{ rows }` from `supabaseJson()`, which returns the array directly | ✅ **Fixed 2026-09-13** — and it was not one site but **four**. See §5.1 |
| 4 | Keyset pagination on the remaining list endpoints (schedule / task / WA-template / form / master) | Open, deliberately — no table is within an order of magnitude of the 500-row cap (§4). The transport is built and tested; extending it is mechanical when a table crosses the page size |
| 5 | Several capped reads have no `order`, so at the cap they return an arbitrary subset | Open — adding an order changes the row order those endpoints return, and the admin mail tab acts on `rowIndex` positions. Needs the frontend in view |
| 6 | `_lib/db/berkas.ts` `BERKAS_COLUMNS` / `BIO_COLUMNS` list ~55 legacy column aliases, most of which do not exist on any table | Open — evaluated in JS against already-fetched rows, not sent to PostgREST, so they cost nothing but are confusing. Narrowing them needs a per-document audit |
| 7 | `contexts/*/repository.ts` still carries `WA_COLS` alias arrays in a few places | Open — the alias probing that mattered (the guaranteed-400 `or=` filters) is gone; the rest is dead but harmless |

### 5.1 The `{ rows }` defect class — four sites, one root cause

`supabaseJson()` returns the parsed JSON body directly (`_lib/db/client.ts:104`,
`return text ? JSON.parse(text) : null`). For a GET list endpoint that body *is*
the array, so `const { rows } = await supabaseJson(…)` binds `rows` to
`undefined` and every downstream guard fails closed — **silently**, which is why
none of these ever surfaced as an error. The house style everywhere else is
`const rows = await supabaseJson(…)`; these four were the anomalies.

| Site | What it silently disabled |
|---|---|
| `contexts/scheduling/repository.ts` `getActiveSchedules()` | agenda reminders never fired |
| `contexts/scheduling/repository.ts` `getFcmTokensForWaList()` | the reminder path resolved 0 device tokens |
| `contexts/scheduling/service.ts` per-WA fallback | the same, on the fallback path |
| `contexts/applications/service.ts` approval push | candidates were never told their application was approved / rejected / under review |

**Blast radius, measured before the fix.** `database_schedule` holds **0 rows**,
so the three reminder-path sites are behaviour-neutral today — the corrected
functions also return `[]` until a schedule is created. The fourth is a real
behaviour change: `fcm_tokens` holds 36 rows, so approval/rejection pushes start
delivering. That is what the feature was written to do, and it is one line to
revert.

Locked by `contexts/scheduling/repository.test.ts`: behavioural tests for both
readers, plus a structural guard that fails if any file under `netlify/functions`
destructures `rows` out of a `supabaseJson()` call again. The behavioural tests
can only cover the sites that exist today; the guard covers the ones that do not
exist yet.

---

## 6. Files

| File | Role |
|---|---|
| `scripts/ci/gen-schema.mjs` | Generates the contract; `--check` is the drift gate |
| `scripts/ci/verify-projections.mjs` | Static gate: no wildcard projection |
| `scripts/ci/verify-rls.mjs` | RLS / least-privilege gate (definitive + probe) |
| `netlify/functions/_lib/db/schema.generated.ts` | **Generated.** The column contract |
| `netlify/functions/_lib/db/projections.ts` | **Hand-written.** Named projections |
| `netlify/functions/_lib/db/projections.test.ts` | Offline correctness check |
| `netlify/functions/_lib/db/pagination.ts` | Keyset (cursor) paging — replaces the Range/OFFSET reader |
| `netlify/functions/_lib/db/pagination.test.ts` | Paging contract: no offset, `+1` look-ahead, stable cursor |
| `migrations/012_rls_lockdown.sql` | The RLS + grant lockdown |
| `netlify/functions/_lib/db/client.ts` | `resolveSelect()`, schema-driven `findTable()` |

Commands:

```bash
npm run db:schema           # regenerate the contract (needs SUPABASE_URL + service key)
npm run verify:schema       # drift gate
npm run verify:projections  # no wildcards
npm run verify:rls          # RLS / least privilege
npm run ci:predeploy:local  # the whole pre-deploy chain, locally
```
