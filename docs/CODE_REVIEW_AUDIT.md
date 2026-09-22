# Code Review Audit — 2026-09-15

What this repository's code-review mechanism actually was, measured rather than
assumed. Every number below was produced by a command run on 2026-09-15; the
command is given so it can be re-run and disputed.

This audit exists because the repo already had a review standard, a PR template,
CODEOWNERS and six workflows — and code quality was still inconsistent. The
reason was not a missing document. It was that several named gates did not exist,
and the ones that did had no enforcement point on the path that actually ships.

---

## Method

```bash
git shortlog -sne --all                     # who reviews
git ls-remote newrepo refs/heads/main       # what is already published
git rev-list --count a5f9549..HEAD          # unreviewed backlog
npx biome check . --reporter=json           # existing lint debt
grep -rl "npm run <gate>" .github/workflows # where each gate runs
npm audit --omit=dev --audit-level=high     # production advisories
```

---

## Findings

### A-01 · There is no second reviewer, and the process assumes one 🔴

```
208  khoci280  <khoci280@gmail.com>
138  khoci921  <khoci921@users.noreply.github.com>
  1  khoci921-hub <khoci921@gmail.com>
```

One person, under three identities. Every path in `.github/CODEOWNERS` points at a
single handle (`@khoci280-arch`).

The written process says "no self-merge to `main`", "rotate reviewers", and
"require review from Code Owners". None of those can execute with one human.
Branch protection requiring a code-owner review would either block every merge or
be permanently self-approved, which is worse: it would look like review while
being a rubber stamp.

**Consequence.** Every rule in the standard that depends on a second person is
decoration. The mechanism has to work with one reviewer or not at all.

---

### A-02 · The review gate is on a path that does not ship production 🔴

`.github/workflows/deploy-production.yml` triggers on `tags: ['v*']`, a published
release, or a manual dispatch. Nothing in this repository creates a `v*` tag.

Meanwhile the site is git-linked to Netlify: `netlify.toml` carries a `[build]`
block (`command = "npm run build"`), and `.netlify/state.json` holds
`siteId: be40978f-aeab-42b7-a549-d9556e4f15de`.

So there are two deploy paths. The one that runs — push to `main` → Netlify git
integration — passes through none of the gates in the deploy workflow:
`verify:env --strict`, `verify:db` (the database contract check), artifact
integrity by SHA-256, rollback-target capture, and the post-deploy smoke test all
live only on the tag path.

**Consequence.** "CI green required" is not an enforceable statement here. The
only place a gate can bite is before the push.

---

### A-03 · `lint` was a Tier-0 gate that did not exist 🔴

`docs/CODE_REVIEW_CHECKLIST.md` opened with:

```
- [ ] `lint` — no new violations
```

and `.github/PULL_REQUEST_TEMPLATE.md` listed `lint` among the gates to confirm.
Measured: no `lint` script in `package.json`, and no ESLint, Prettier, Biome,
Oxlint, dprint or EditorConfig file anywhere in the repository.

**Consequence.** The first checkbox of the review standard could not be run by
anyone, and nothing detected that. `docs/ENGINEERING_PLAYBOOK.md` §W3 had already
recorded "zero automated style enforcement" — the finding was known and the
checklist kept naming the gate anyway.

---

### A-04 · The coverage checkbox could not fail 🟠

The checklist required "Diff coverage at or above threshold". Measured:
`vitest.config.ts` has no `coverage` block, no threshold, and no CI job runs
`test:coverage`. The threshold was never defined, so the checkbox was
unfalsifiable.

---

### A-05 · Nine blocking gates are invoked by no workflow 🟠

For each gate, how many files under `.github/workflows/` invoke it:

| Gate | Workflows |
|---|---|
| `typecheck:indexer` | 0 |
| `verify:md` | 0 |
| `verify:aliases` | 0 |
| `verify:projections` | 0 |
| `verify:rls` | 0 |
| `verify:schema` | 0 |
| `verify:pwa` | 0 |
| `depcruise` | 0 |
| `ci:quality` / `ci:predeploy` (the composite scripts) | 0 |

`ci:quality` and `ci:predeploy` are the local composites. Because no workflow
calls them, everything they alone contain — including `verify:md`,
`verify:projections` and `typecheck:indexer` — never runs in CI. `ci.yml`
re-implements the same idea as separate jobs, so there are two definitions of
"quality" and they have already drifted.

`verify:aliases` is the sharpest case: a working gate asserting that exactly one
entry point may use the full router, with a documented history of 11 unaudited
public entry points it was written to catch, and nothing running it.

---

### A-06 · The indexer test project never runs in CI 🟠

`vitest.config.ts` defines three projects: `frontend`, `backend`, `indexer`.
`ci.yml` runs `npm run test:frontend` and `npm run test:backend` (sharded 3 ways).
Neither selects `--project indexer`. `ci:quality` runs bare `npm run test`, which
does include it — and `ci:quality` is referenced by no workflow.

14 test files under `indexer/` are therefore never executed by CI.

---

### A-07 · Two competing layering checkers, one of them wired 🟡

`npm run boundary` (indexer-driven) and `npm run depcruise`
(dependency-cruiser, with `.dependency-cruiser.cjs`) both assert layering rules.
Only `boundary` runs anywhere. Two implementations of one invariant means a rule
added to one is not enforced by the other, and it is not obvious which is
authoritative.

---

### A-08 · The review documents had drifted from the repo 🟡

Measured in `.github/PULL_REQUEST_TEMPLATE.md`:

- Two links to `docs/ENGINEERING-QUALITY-PLAYBOOK.md`, **which does not exist**.
  The file is `docs/ENGINEERING_PLAYBOOK.md`.
- Section references `§5.2`, `§4.1`, `§3` — that playbook has no `§`-numbered
  sections. It uses `W1…W10`, `Part 1…5`, and tiers.
- Tier 1 stated the latency budget as "the 10 s function budget", while
  `docs/CODE_REVIEW_CHECKLIST.md` and `kernel/deadline.ts` both say **12 s**
  (`DEFAULT_DEADLINE_MS = 12_000`). The two documents contradicted each other.

A reviewer following the template's threat-model section was sent to a file that
does not exist.

---

### A-09 · 25 commits, 19,947 changed lines, reviewed by nobody 🟠

```
remote newrepo/main : a5f9549
local  main         : f6d0c12
commits ahead       : 25
files changed       : 74
changed lines       : 19,947
```

This is the backlog the first `review:gate` run reports. It is also the clearest
statement of the problem: the process that was supposed to catch defects was not
running, and this is what accumulated while it was not.

---

### A-10 · Only 4 of 21 blocking gates had ever been shown to fail 🟠 → 8/21 by end of day

A gate that has never been observed failing is a hypothesis, not a proof. Before
this audit, three gates in the repo had a mutation battery:
`verify:classes`, `check-md-tables`, `cold-start-gate` (the last is report-only).

`scripts/ci/review-manifest.json` now records this per gate, and
`npm run verify:review-manifest` reports it on every run:

```
Blocking gates: 21
  proven able to fail : 4/21 (19%)     <- as measured when this audit was written
  no battery (hypothesis, not proof): 17
```

**Four more gates were proven the same day.** Each battery covers every failure
path its gate has, not just the obvious one: **23 mutations killed, 0 survived,
4 deliberate green cases.**

```
Blocking gates: 21
  proven able to fail : 8/21 (38%)
  no battery (hypothesis, not proof): 13
```

Three of the five batteries found real defects. That is the point of writing them —
a battery that only ever confirms the gate was already working has not earned its
runtime.

| Gate | Battery | What it found |
|---|---|---|
| `verify:entries` | 6 killed / 0 survived | nothing — all four checks fire, including the Lambda-compat subdirectory shape |
| `verify:io` | 5 killed / 0 survived | **the wrapper guard could never fail**: `includes('fetch(')` was satisfied by the file's own comments, so a moved implementation stayed green |
| `verify:binding` | 7 killed / 0 survived | **exit 2 was documented but unreachable**: every parse failure fell through to exit 1, so a stale gate looked like a binding regression |
| `typecheck:ratchet` | 5 killed / 0 survived | nothing — both failure conditions and the exit-2 tooling path fire |
| `verify:fetch-boundary` | 7 killed / 0 survived / 1 ok-green | **the client guard was slack on its first run**: it asked whether ANY `fetch` remained in `apiClient.ts`, but the client has two sites, so renaming one left the allow-list entry's `max: 2` with nothing holding it and half the implementation could move undetected. The guard now compares against the bound. Same battery also confirmed the comment-skip is load-bearing — `src/lib/apiEndpoint.ts:9` is a doc comment containing `fetch(getEndpoint('loginKandidat'), { ... })`, and counting it would flag documentation as a bypass |

All three defects were fixed rather than filed, each in the same commit as the
battery that found it. `verify:fetch-boundary` is the third battery to find a real
defect on its first run, which is the expected rate for a check that has never been
attacked.

---

### A-11 · The production dependency tree is not clean, and the audit gate is parked 🟡

`npm audit --omit=dev --audit-level=high` reports **13 vulnerabilities (12 high,
1 critical)** in the production tree, including `xlsx`.

`ci.yml`'s `audit` job is `continue-on-error: true` with the comment *"Flip to
false once the production dependency tree is clean."* The playbook's own Phase 0
item 6 asked for a named owner and a date; neither was ever assigned.

**Consequence.** The condition for flipping the gate cannot currently be met
without replacing `xlsx` (the npm-published `xlsx` is unmaintained; the upstream
publisher ships elsewhere). The honest options are to replace it, or to record
that this advisory is accepted and stop implying the job is a gate.

---

### A-12 · The RLS gate is on no shipping path 🔴

`verify:rls` exists to keep `migrations/012_rls_lockdown.sql` closed. The public
anon key is shipped to the browser, so RLS plus the table GRANTs are the only
things standing between it and the data.

Measured 2026-09-15:

- It is invoked **only** from `ci:predeploy` and `ci:predeploy:local` (npm scripts).
- **No workflow references `ci:predeploy`** — `grep -rn "verify:rls" .github/workflows/` returns nothing.
- **No workflow supplies `SUPABASE_DB_URL` or `DATABASE_URL`**, so the decisive
  catalog mode could not run in CI even if the gate were wired in.

So on the path that actually publishes production, this invariant is checked by
nothing. The gate is unproven as well, but the shipping-path gap is the more
serious of the two: an unproven gate that never runs protects nothing at all, and
it fails silently — the deploy is green.

**Why there is no battery for it here.** Every path without credentials exits 2.
The only local substitute is stubbing `pg`/PostgREST, which would prove the
verdict logic while leaving the SQL — the actual check — untested. Certifying the
wrong half would convert a visible gap into an invisible one, so it is left open
on purpose. The fix is a disposable Postgres in CI.

---

## Gap register

| ID | Gap | State |
|---|---|---|
| G-01 | `lint` named as a Tier-0 gate with no linter in the repo | **Closed** — Biome 2.5.13 + `lint-ratchet` |
| G-02 | Review documents could name gates that do not exist | **Closed** — `verify:review-manifest` C1/C4/C5 |
| G-03 | Coverage is required by the checklist and measured by nothing | **Open** — `test:coverage` runs, no threshold, no job |
| G-04 | No enforcement point on the path that publishes production | **Mitigated** — `npm run review:gate` is local; CI still not wired (see A-05) |
| G-05 | 13 of 21 blocking gates have no mutation battery | **Open** — counted on every manifest run (was 17 before four were proven on 2026-09-15) |
| G-06 | 9 blocking gates are run by no workflow | **Open** — recorded in the manifest's `runs` field |
| G-07 | The 14-file `indexer` test project is not run by CI | **Open** |
| G-08 | The checklist requires "exported symbols are actually consumed" with no gate for it | **Open** — a dead-code tool would close it |
| G-09 | `npm audit` is `continue-on-error` with no owner, on a tree with 13 advisories | **Open** — see A-11 |
| G-10 | `verify:rls` is on no shipping path, and its decisive mode needs a DB URL no workflow supplies | **Open** — see A-12 |

Gaps G-03 and G-05 through G-09 are deliberately left open rather than papered
over. A register that is all green on the day it is written is a register nobody
maintains.

---

## What changed in this session

| Change | Where |
|---|---|
| Biome adopted; 2,716 pre-existing diagnostics frozen, new ones blocked | `biome.json`, `.ci/biome-baseline.json`, `scripts/ci/lint-ratchet.mjs` |
| Lint ratchet proven able to fail (5 killed, 0 survived) | `scripts/ci/lint-ratchet.mutations.sh` |
| Local pre-push review gate: secret scan, size budget, risk attestation, env declaration, migration rollback, lint-on-added-lines, Tier-0 gates | `scripts/ci/review-gate.mjs` |
| Review gate proven able to fail (9 killed, 0 survived) | `scripts/ci/review-gate.mutations.sh` |
| Machine-readable gate inventory; the gate that keeps the standard honest | `scripts/ci/review-manifest.json`, `scripts/ci/verify-review-manifest.mjs` |
| Manifest gate proven able to fail (7 killed, 0 survived) | `scripts/ci/verify-review-manifest.mutations.sh` |
| Deploy-shape gate proven able to fail (6 killed, 0 survived) | `scripts/ci/verify-function-entries.mutations.sh` |
| IO boundary gate proven able to fail (5 killed, 0 survived); wrapper guard made falsifiable | `scripts/ci/io-boundary.mutations.sh`, `scripts/ci/io-boundary.mjs` |
| Binding gate proven able to fail (7 killed, 0 survived); documented exit 2 implemented | `scripts/ci/surface-binding.mutations.sh`, `scripts/ci/surface-binding.mjs` |
| Typecheck ratchet proven able to fail (5 killed, 0 survived) | `scripts/ci/typecheck-ratchet.mutations.sh` |
| Phantom `lint` removed; coverage claim made honest; 12 s corrected | `docs/CODE_REVIEW_CHECKLIST.md` |
| Broken links, invented section refs and the 10 s/12 s contradiction fixed | `.github/PULL_REQUEST_TEMPLATE.md` |
| Stale claims W3/W4/W5/W9 marked superseded with current state | `docs/ENGINEERING_PLAYBOOK.md` |
| Standard, process and checklist documents | `docs/CODE_REVIEW_*.md` |

Verified after every change: `npm run lint-ratchet`, `npm run verify:review-manifest`
and all six mutation batteries exit 0, and every file the batteries touch is
restored byte-identically.
