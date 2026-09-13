> **Last updated:** 2026-09-03 — Technical reference document.

# CI/CD Pipeline

Automated build, test and deployment for **ASJ Portal v2** (Astro 5 + Preact + Netlify Functions).

This replaces the previous manual workflow (`npm run build` → zip → `curl` to the Netlify API),
which had no tests, no rollback path, and no record of what was actually deployed.

---

## 1. Architecture at a glance

```
                          ┌─────────────────────────────────────────┐
   push / PR              │  ci.yml                                 │
   ──────────────────────▶│  ┌───────────┬───────────┬───────────┐  │
                          │  │ typecheck │ boundary  │  audit    │  │  parallel
                          │  └───────────┴───────────┴───────────┘  │
                          │  ┌───────────────┬───────────────────┐  │
                          │  │ test-frontend │ test-backend 1/3  │  │  parallel
                          │  │               │ test-backend 2/3  │  │
                          │  │               │ test-backend 3/3  │  │
                          │  └───────────────┴───────────────────┘  │
                          │         └──▶ build (_build.yml)         │
                          │                │                        │
                          │                ▼                        │
                          │    artifact dist-<sha> + sha256         │
                          │                │                        │
                          │         ┌──────┴───────┐                │
                          │         ▼              ▼                │
                          │      smoke          e2e                 │
                          └─────────────────────────────────────────┘

   push to develop        ┌─────────────────────────────────────────┐
   ──────────────────────▶│ deploy-staging.yml                      │
                          │  build → verify env → verify DB         │
                          │        → netlify (alias) → smoke        │
                          │        → notify                         │
                          └─────────────────────────────────────────┘

   tag v* / release       ┌─────────────────────────────────────────┐
   ──────────────────────▶│ deploy-production.yml                   │
                          │  build → ⏸ APPROVAL → verify env        │
                          │        → verify DB → netlify --prod     │
                          │        → smoke                          │
                          │        → auto-rollback on failure       │
                          │        → notify                         │
                          └─────────────────────────────────────────┘

   manual                 ┌─────────────────────────────────────────┐
   ──────────────────────▶│ rollback.yml  (restore a prior deploy)  │
                          └─────────────────────────────────────────┘
```

**Design rule: one canonical build.** All three pipelines call the reusable
`_build.yml`, so there is exactly one versioned definition of "how this app is built".

---

## 2. Files

| Path | Purpose |
|---|---|
| `.github/workflows/ci.yml` | PR/push verification: static analysis, tests, build, smoke, E2E |
| `.github/workflows/_build.yml` | Reusable canonical build → versioned artifact |
| `.github/workflows/deploy-staging.yml` | Auto-deploy `develop` to a staging alias |
| `.github/workflows/deploy-production.yml` | Gated production deploy with auto-rollback |
| `.github/workflows/rollback.yml` | Manual restore of a previous deploy |
| `.github/workflows/_notify.yml` | Reusable Slack + job-summary notifications |
| `.github/actions/setup-node-env/` | Composite action: Node from `.nvmrc` + cached `npm ci` |
| `scripts/ci/verify-env.mjs` | Fail-fast env-var gate (never prints values) |
| `scripts/ci/verify-migrations.mjs` | Pre-deploy **database contract** gate (see §3.9) |
| `scripts/ci/smoke-test.mjs` | Post-deploy health check — drives rollback |
| `scripts/ci/typecheck-ratchet.mjs` | Debt-aware typecheck gate |
| `scripts/ci/netlify-rollback.mjs` | Restore a previous Netlify deploy |
| `.ci/tsc-baseline.json` | Recorded type-error debt (487 errors, 53 files) |
| `.ci/db-contract.json` | Tables + RPC functions the code requires to be present |

---

## 3. Pipeline stages

### 3.1 Source control integration

CI runs on every push and pull request to `main` and `develop`. Recommended
branch protection (see §5) makes the CI jobs **required status checks**, so a red
pipeline physically cannot be merged.

Concurrency is scoped per branch with `cancel-in-progress: true` for CI — pushing
twice quickly cancels the stale run. Deploy workflows use
`cancel-in-progress: false`, because cancelling a deploy half-way through is far
worse than letting a queued one wait.

### 3.2 Build automation

`_build.yml` pins every input:

- Node from **`.nvmrc`** (currently 22) — never "latest"
- Dependencies from **`package-lock.json`** via `npm ci` — never re-resolved
- Netlify CLI pinned via `NETLIFY_CLI_VERSION` env in each deploy workflow

`PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` are inlined into client JS at
build time, so `verify-env.mjs --profile build` gates the build: a missing value
fails in ~5 seconds instead of shipping a bundle that calls `undefined`.

### 3.3 Test execution

| Job | Scope |
|---|---|
| `test-frontend` | Vitest `frontend` project — jsdom, Preact components + stores + Zod schemas |
| `test-backend` | Vitest `backend` project — sharded 1/3, 2/3, 3/3 across parallel runners |
| `boundary` | dependency-cruiser layering rules (`kernel` ↔ `contexts` ↔ `surfaces`) |
| `typecheck` | Ratchet — blocks *new* type errors |
| `audit` | `npm audit --omit=dev` (report-only until the tree is clean) |
| `smoke` | Serves the built artifact and asserts it responds with expected markers |
| `e2e` | Playwright — public flow against the built artifact |

Sharding uses `fail-fast: false` so one red shard cannot hide failures in others.

### 3.4 Artifact management

Each build uploads `dist-<git-sha>` containing `dist/` plus a `build-manifest.json`:

```json
{
  "sha": "…", "ref": "…", "runId": "…",
  "node": "v22.22.2", "npm": "10.9.7",
  "builtAt": "2026-09-01T12:00:00Z",
  "fileCount": 34, "sha256": "…"
}
```

`sha256` is a hash over every emitted file. Deploy jobs recompute it and **abort on
mismatch**, proving the bytes that were tested are the bytes being shipped.
Retention: 14 days for CI, 90 days for production builds.

### 3.5 Deployment

Staging and production both deploy a pre-built directory:

```bash
netlify deploy --dir=dist --functions=netlify/functions [--prod] [--alias=staging]
```

Production requires the `production` GitHub Environment. Approval happens there,
**before** anything ships — not after.

### 3.6 Rollback

Two layers:

1. **Automatic** — before publishing, the deploy job records the deploy currently
   serving production. If the post-deploy smoke test fails, `netlify-rollback.mjs`
   restores it immediately.
2. **Manual** — `rollback.yml` (`workflow_dispatch`) restores either a specific
   deploy id or the newest previous ready one. `--dry-run` shows the target first.

Rollback re-publishes an existing deploy rather than rebuilding from an old
commit: it is faster, and a rebuild of an old commit can itself be broken.

#### What the smoke test actually checks

Two checks, and they answer different questions:

| Check | Question it answers | Can it fail? |
|---|---|---|
| `--expect "Lowongan Loker"` | Did the built HTML survive the pipeline? | Only if the build is corrupt — the page is **prerendered**, so the CDN keeps serving the marker even with the database down |
| `--health /.netlify/functions/health?detail=1` | Is the data layer behind the deploy working? | Yes — this is the check that reflects real availability |

The health probe was added on 2026-09-13. Before it, the gate was **marker-only**,
which meant a deploy that broke PostgREST sailed through and never triggered a
rollback: the static HTML was still served from the edge. See
`docs/BACKEND_TODO.md` #31.

**The probe never rolls production back for its own configuration**, which is the
whole reason it is safe to enable:

| Response | Verdict | Why |
|---|---|---|
| `200` / `204` | **PASS** | Real verdict obtained |
| `503 HEALTH_TOKEN not configured` | **WARN** | The site is fail-closed by design and the monitor cannot authenticate — not a property of this release |
| `401` (with or without a token) | **WARN** | Credential drift: the site is serving, the monitor's secret is stale. Rolling back does not rotate a secret |
| Any other non-2xx (`500`, `502`, `503`, `504`, …) | **FAIL** | The endpoint reported a dependency down — this triggers the rollback flow |

Exit codes: `0` on pass and on warnings-only, `1` on failure. The classification
lives in `classifyHealth()` in `scripts/ci/smoke-test.mjs` — pure, so the
rollback decision is unit-tested (`netlify/functions/_lib/smoke-test-health.test.ts`)
and mutation-verified.

CI's own smoke job (`ci.yml`) deliberately does **not** pass `--health`: it serves
the artifact with `astro preview`, which has no function runtime, so the probe
would 404 against a perfectly good build.

#### Wiring the health probe

`deploy-production.yml`, `deploy-staging.yml` and `rollback.yml` pass
`HEALTH_TOKEN: ${{ secrets.HEALTH_TOKEN }}` through the step environment — never
on the command line, where `ps` and the workflow log would expose it. With the
secret unset the probe reports a warning and the pipeline still goes green, so a
site without the secret cannot be rolled back for a reason unrelated to the
release.

### 3.7 Environment variable management

Secrets live in **GitHub Environments**, not in the repo and not in `netlify.toml`.

| Variable | Where | Why |
|---|---|---|
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | Repository **variables** | Public by design — already visible in the shipped bundle |
| `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` | Environment **secrets** | Server-side only |
| `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` | Environment **secrets** | Deploy credentials |
| `HEALTH_TOKEN` | Environment **secret** | Lets the post-deploy smoke test authenticate against `/.netlify/functions/health`. Must be the **same value as the Netlify site's** `HEALTH_TOKEN`, or the probe reports credential drift (a warning, not a rollback) |
| `SLACK_WEBHOOK_URL` | Repository secret (optional) | Notifications |

`verify-env.mjs` checks presence before every deploy and **rejects placeholder
values** (`your-*`, `YOUR_PROJECT_REF`, unexpanded `${{ … }}`), so a misconfigured
environment fails before publishing. It prints variable *names and lengths only* —
never values.

### 3.8 Notifications

`_notify.yml` is called by:

| Event | Trigger |
|---|---|
| CI failure on `main`/`develop` | `if: failure() && event == push` |
| Staging deploy | success or failure |
| Production deploy | success / **rollback** / failure |

Slack is optional — with no `SLACK_WEBHOOK_URL` the job writes a GitHub job summary
and exits 0. Notifications can never fail the pipeline.

### 3.9 Database contract gate

**The problem this solves.** The database is migrated by hand, independently of the
code. When the code runs ahead of the schema, nothing throws — PostgREST answers
`200` with an empty result, the UI renders blank, and there is no error anywhere.
This pipeline would otherwise happily deploy that combination.

The contract lives in `.ci/db-contract.json`: every table and RPC function the code
requires, marked `required` or `optional`, each with a note on the impact of it
being absent. `scripts/ci/verify-migrations.mjs` checks the target database against
it before anything is published, and fails the deploy on a mismatch.

**How it verifies — and what it refuses to guess.** It reads PostgREST's OpenAPI
document, which lists every exposed table and RPC path: one read-only request, no
side effects. Supabase restricts that endpoint to the **service-role** key, so
`SUPABASE_SERVICE_ROLE_KEY` is required for a definitive check.

There is no safe way to confirm a volatile RPC exists without it. Probing by
POSTing to `/rpc/<name>` cannot tell a real function from a fake one (a malformed
body produces an identical HTTP 400 for both), and genuinely calling one would
*execute* it — POSTing to `claim_next_job` would claim a real job. So without the
service-role key the script reports RPCs as **unverified, never as present**, and
unverified required objects **fail the build**. A check that reports success when
it could not see anything is worse than no check at all.

| Exit | Meaning |
|---|---|
| `0` | Contract satisfied and fully verified |
| `1` | A required object is missing, or could not be verified — **do not deploy** |
| `2` | Configuration error: no URL/key, database unreachable, or nothing verifiable |

Escaping it in an emergency: tick **skip-db-gate** on a manual dispatch. This is
only available on `workflow_dispatch`, so the normal tag/release path is always
gated.

> **First run against production (2026-09-01) caught a live incident.**
> All 13 tables exist, but `claim_next_job`, `rate_limit_check`, `rate_limit_fail`
> and `reclaim_stuck_jobs` did **not** — the migrations
> `netlify/functions/migrations/001_atomic_rate_limit.sql` and
> `002_atomic_job_claim.sql` were never applied (and were untracked in git, with no
> runner). Because both call sites `catch` and degrade:
> - `kernel/job-queue.ts` → `claimJob()` returns `null`, so the async job system
>   processes **nothing**, silently.
> - `kernel/rate-limit.ts` → falls back to in-memory buckets, which on Netlify are
>   per-instance and therefore bypassable — the B6 login/OTP vulnerability the
>   migration was written to close is still live.
>
> **Apply those two migrations before the next production deploy.** See §6.8.

---

## 4. Setup

### 4.1 Repository variables (Settings → Secrets and variables → Actions → Variables)

```
PUBLIC_SUPABASE_URL          https://<ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY     <anon key>
SUPABASE_URL                 https://<ref>.supabase.co
PRODUCTION_URL               https://<your site>.netlify.app
```

### 4.2 Environment secrets (Settings → Environments)

Create `staging` and `production`. On `production`, enable **Required reviewers**.

```
NETLIFY_AUTH_TOKEN
NETLIFY_SITE_ID
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` is not optional in practice. Without it the database
contract gate (§3.9) cannot verify RPC functions and will fail the deploy.
It is a server-side secret and is safe here — it is never exposed to the browser.

Optional, for notifications: `SLACK_WEBHOOK_URL` (repository secret).

`NETLIFY_SITE_ID` is the API id, not the site name. Find it under
Netlify → Site configuration → Site details → **Site ID**.

### 4.3 Branch protection (Settings → Branches → `main`)

- Require a pull request before merging
- Require status checks to pass: `typecheck`, `boundary`, `test-frontend`,
  `test-backend (1/3)`, `(2/3)`, `(3/3)`, `Build artifact`, `Smoke test artifact`
- Require branches to be up to date before merging
- Require conversation resolution

Apply the same checks to `develop`, minus the reviewer requirement.

---

## 5. Running it

| Action | How |
|---|---|
| Deploy staging | Push to `develop`, or **Run workflow** on `Deploy · Staging` |
| Deploy production | Push a `v*` tag, publish a Release, or **Run workflow** (type `deploy` to confirm) |
| Roll back | **Run workflow** on `Rollback` — choose environment, optional deploy id |
| Preview a rollback | Same, with **dry-run** checked |

### Local equivalents

```bash
npm run ci:quality                    # ratchet + boundary + full test suite
npm run verify:md                     # markdown table structure (docs/**)
npm run cold:start -- --url https://asjastro.netlify.app   # cold-start latency, report-only
npm run test:frontend                 # jsdom suite
npm run test:backend -- --shard=1/3   # one shard, as CI runs it
npm run verify:env -- --profile build # env gate
npm run verify:db                     # database contract gate (needs SUPABASE_*)
npm run verify:db:warn                # same, reports without failing
npm run smoke -- --url http://localhost:4321 --expect "ASJ Portal"
npm run typecheck:baseline            # re-record type-debt baseline
```

`verify:md` (part of `ci:quality`) checks that every markdown table row has the same
number of cells as its header, and that no code span in a table cell contains a raw
`|` (it must be `\|`). Both rules exist because of real defects found by hand: a stray
closing backtick silently collapsed a 4-column row to 2 in `docs/BACKEND_TODO.md`, and
an unescaped `||` added two phantom cells to a row in `docs/PARITY_CHECKLIST.md`. A
stray pipe never errors — the row just renders misaligned. The checker's own mutation
battery lives at `scripts/ci/check-md-tables.mutations.sh` (5 mutations, all must be
killed; run it from the repo root after changing the checker).

`cold:start` (part of `ci:quality`) measures time-to-first-byte on the deployed site
and compares the **best of N samples** against a **3000 ms** budget. It closes
`BACKEND_TODO.md` #29, which had sat open labelled owner-side on the premise that it
needed someone watching a dashboard — it only ever needed `curl`. Two design choices
are load-bearing and should not be "simplified":

- **Best of N, not worst or mean.** Cold start is a one-time cost; the site serves warm
  requests afterwards. Using the worst sample would let ordinary runner noise fail the
  build, and a gate people learn to ignore is worse than no gate.
- **Report-only by default.** `--enforce` is opt-in, and `deploy-production.yml` runs it
  without it, because that job also drives the automatic rollback. Latency is a trend to
  watch, not a binary that justifies rolling back a healthy release. An unreachable path
  is reported as `error` and is deliberately **not** counted as over budget — detecting
  an outage is the smoke test's job.

Its mutation battery is `scripts/ci/cold-start-gate.mutations.sh` (7 mutations — inverted
comparison, ignored budget, worst-of, unreachable-as-pass, widened budget, `--enforce`
by default, constant probe — all must be killed; run from the repo root). A latency gate
fails *silently*, so an unseen red is the only evidence that it works at all.

To check the database contract locally:

```bash
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service-role key>   # required for RPC checks
npm run verify:db
```

---

## 6. Known debt and honest caveats

These are real constraints, not hypotheticals. They are recorded so nobody
rediscovers them the hard way.

1. **487 TypeScript errors across 53 files** (baseline in `.ci/tsc-baseline.json`).
   Blocking on all of them would leave CI permanently red, so `typecheck` uses a
   **ratchet**: it fails only when the count increases or a previously clean file
   gains errors. Fix errors → run `npm run typecheck:baseline` → the bar drops and
   cannot rise again. Pay this down to zero, then the gate becomes a plain `tsc`.

2. **`pool: 'threads'` is mandatory in `vitest.config.ts`.** With Vitest 4's default
   `forks` pool on Windows, every test passes but the runner never exits — the
   process hangs indefinitely after printing results. `pool` is **not** inherited by
   `projects`, so it is repeated in each project block. See the comment in the config.

3. **`npm audit` is report-only** (`continue-on-error: true`). Flip it to blocking
   once the production dependency tree is clean.

4. ~~**`.env.example` contains a real-looking admin PIN**~~ **FIXED 2026-09-01.**
   The keys were renamed to `PIN_MASTER`, `PIN_SACHOU`, … and the `123456` value
   replaced with a placeholder. If `123456` was ever a live PIN, **rotate it** —
   assume nothing about whether it reached production.

5. **`dependency-cruiser` is in `package-lock.json` but not installed locally**
   (no `depcruise` binary in `node_modules/.bin`). `npm ci` in CI installs it, so
   the `boundary` job works there; locally `npm run boundary` fails until you run
   `npm ci`.

6. **Deploy workflows rebuild instead of reusing CI's artifact.** The build is
   fully reproducible, so this is safe; it keeps each workflow self-contained
   rather than coupling them through cross-run artifact plumbing. The `sha256`
   integrity check still guards the bytes.

7. **Netlify function environment variables** must also exist in the Netlify site
   settings — GitHub Actions injects them for its own steps, but Netlify Functions
   read from Netlify's runtime, not from the CI runner.

8. **Migrations are manual, and that is the biggest remaining risk.** There is no
   migration runner in the repo and two competing conventions: dated files in
   `netlify/migrations/` and numbered ones in `netlify/functions/migrations/`.
   The contract gate (§3.9) now *detects* drift but cannot fix it. As of
   2026-09-01 production is missing the four RPC functions behind the B5/B6 fixes.
   Apply `netlify/functions/migrations/001_atomic_rate_limit.sql` and
   `002_atomic_job_claim.sql`, then re-run `npm run verify:db` to confirm.
   After applying, reload the PostgREST schema cache if functions still do not
   appear — Supabase caches it, and a missing reload looks identical to a missing
   function.

9. **The contract is only as good as its maintenance.** Add an entry to
   `.ci/db-contract.json` in the same commit that adds code depending on it, or
   the gate will pass while the code breaks.
