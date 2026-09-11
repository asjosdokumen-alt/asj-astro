# Phase A — Function Bundle Reduction & Legacy Endpoint Retirement

> **Status:** core fix complete and verified · 2026-09-11
> **Result:** deployed function code **19,403.5 KB → 9,891.6 KB (−49%)**
> **Remaining:** 12 catch-all entry points (8,275 KB) await deploy verification before deletion
> **Companion:** `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §8.3, §11

---

## 1. What Phase A turned out to be

The original plan assumed the repository held **24 redundant legacy bundles** sitting
alongside 15 new narrow surfaces, and that deleting them would bring deployed code
under 1 MB.

**That premise was wrong**, and measuring first is what caught it:

| Assumption | Measured reality |
|---|---|
| 24 legacy `.js` files are fat duplicates of the new surfaces | The 29 `.js` files **are** the deployment entry points; `surfaces/*.ts` are the handler registries they dispatch into |
| Deleting them is the fix | Deleting them would break every endpoint |
| Bundles are ~331 KB | **~690 KB each**, 19.4 MB total — the problem had grown |
| `.netlify-built/` is tracked in git | Already gitignored and untracked |
| `runMigration` is reachable from a POST body | Already removed from the registry; only a dead 690 KB entry point remained |

The real defect was one line.

---

## 2. Root cause

```
netlify/functions/_lib/handlers.ts:7
    import { getSurfaceHandler } from '../surfaces/index';
```

`surfaces/index.ts` contains the action router — a map of 82 actions whose values are
`() => import('./<surface>')` for all 15 surfaces.

**Netlify bundles each function as a single CommonJS file with no code splitting.**
esbuild therefore *inlines* every dynamic `import()` into the one output file. Verified
directly: bundling `auth.js` emitted **exactly 1 output file**, and the result contained
master-data, AI, ingestion, notifications, scheduling and documents code — all six probes
`PRESENT`.

So because `handlers.ts` was in every entry point's static graph, **every entry point
shipped all 15 surfaces and all 14 contexts.** `ping` was the sole exception (0.3 KB) only
because it never touches the dispatcher.

The allow-list in `makeSurfaceHandler([...])` was a *routing guard*, not a bundle
optimisation — it rejected actions early but still pulled the whole router in.

---

## 3. The fix

The resolver is now **injected by the entry point** instead of imported by the dispatcher.

| File | Change |
|---|---|
| `_lib/handlers.ts` | Removed the static router import. Added `SurfaceResolver`, threaded through `handleAction`'s `meta.resolve`. Absent resolver ⇒ `NOT_IMPLEMENTED` (fails loudly, never silently loads everything). |
| `_lib/netlify-wrapper-surface.ts` | `makeSurfaceHandler(actionsMap, allowedActions)` — accepts one action map **or an array**, and injects a narrow resolver. Removed its `import('../surfaces/index')`. |
| `_lib/netlify-wrapper.ts` | The catch-all now **owns** the router and passes `resolve: getSurfaceHandler`. Documented as the only place allowed to be large. |
| 13 narrow entry points | Statically require only their own surface map. |

### An entry point may host more than one surface

A cross-check against the router found two actions routed by clients to entry points that
do not own them:

| Action | Client routes to | Router owner |
|---|---|---|
| `getJobStatus` | `/notify` | `surfaces/ai` |
| `simpanBiodataLengkap` | `/files` | `surfaces/master` |

Binding naively to a single surface would have silently broken both — the wrapper would
have let them through the allow-list and then returned `NOT_IMPLEMENTED`. Both entry
points now compose the maps they need, so **wire behaviour is unchanged**:

```js
exports.handler = makeSurfaceHandler([NOTIFY_ACTIONS, AI_ACTIONS], [...]);
```

This is what `scripts/ci/surface-binding.mjs` exists to catch.

---

## 4. Measured results

```
                          before      after
  entry points                29         28
  deployed code        19,403.5 KB  9,891.6 KB    −49%
  narrow surfaces       28 × ~690 KB  13 entries
  largest narrow            696.9 KB  539.9 KB (files.js)
```

Per-surface improvement:

| Entry point | Before | After |
|---|---|---|
| `ai-chat.js` | 696.9 KB | **110.8 KB** |
| `auth.js` | 696.8 KB | **139.5 KB** |
| `notify.js` | 696.7 KB | **115.4 KB** |
| `master-data.js` | 696.7 KB | **93.8 KB** |
| `mail.js` | 696.7 KB | **85.0 KB** |
| `candidates.js` | 696.7 KB | **67.1 KB** |
| `schedule.js` | 696.7 KB | **63.9 KB** |
| `jobs.js` | 696.7 KB | **62.8 KB** |
| `public.js` | 696.6 KB | **59.2 KB** |
| `get-app-data.js` | 689.6 KB | **59.2 KB** |
| `register.js` | 696.7 KB | **58.0 KB** |
| `config.js` | 696.7 KB | **57.6 KB** |
| `files.js` | 696.8 KB | 539.9 KB |

`get-app-data.js` mattered most: it is the **hottest path in the system** (public job
board reads) and was shipping the full router.

Also done in this phase:

- **`run-migration.js` deleted** (690 KB). The action was already gone from the registry;
  the entry point was dead weight. The admin UI button that called it
  (`src/components/admin/TabConfig.tsx`) was still live and would have started 404-ing —
  it now points admins at `npm run migrate:status` / `migrate:up`, the safe path.
- **Two CI gates added** and wired into `ci:quality` / `ci:predeploy`.

---

## 5. CI gates

| Command | What it enforces |
|---|---|
| `npm run bundle:size` | Reproduces Netlify's esbuild bundling locally. Fails if a **non-catch-all** entry exceeds 600 KB, or the total exceeds budget, or any entry regressed >5% against `bundle-size-baseline.json`. |
| `npm run bundle:baseline` | Re-captures the ratchet baseline. |
| `npm run verify:binding` | Every allow-listed action must be resolvable by the maps the entry point declares. Catches the silent-`NOT_IMPLEMENTED` class of bug. |
| `npm run verify:aliases` | Probes deployed aliases (see §6). |

**Why 600 KB and not 150 KB:** a narrow entry point that accidentally reaches the router
measures ~690 KB. So 600 KB catches precisely that regression — the one the gate exists to
prevent — while leaving headroom for legitimately heavy surfaces. `files.js` (539.9 KB) is
the heaviest: the docs surface bundles the ZIP writer (`archiver` plus **four** copies of
`readable-stream`, ~130 KB) and the master-data context. A future split of the ZIP action
into its own entry point would bring it to roughly 410 KB; deferred as low value against
the items in §6.

---

## 6. Remaining work — retiring the 12 catch-alls

These 12 entry points are byte-for-byte the same handler as `bridge-links`
(`exports.handler = makeHandler()`, no allow-list). They have **zero references** in
`src/`, `scripts/`, `e2e/` and `public/`. They exist only for deployed QR codes,
bookmarks and keep-alive workflows.

```
admin-ai-context.js  ai-form-submit.js  apply.js           bridge-links.js
drive-links.js       rincian-presets.js  save-ai-cv.js     save-master.js
schedule-reminders.js submit-apply.js    submit-siswa-baru.js  whatsapp.js
```

**Cost: 12 × 689.6 KB = 8,275 KB — 84% of the remaining total.**

### Why they were not deleted in this phase

Deleting them requires the aliases in `netlify.toml` to actually resolve, and that could
not be verified without a real deploy. The blast radius is user-facing: a broken alias
means a deployed QR code fails for a real applicant.

There is a subtle trap here, confirmed against the Netlify docs:

> *"By default, you can't shadow a URL that actually exists within the site... you can
> append an exclamation mark to the rule: `/app/* /app/index.html 200!`"*

A deployed function **counts as existing content**. So an alias written without
`force = true` silently does nothing while the function file is present — the function
keeps answering, the alias *looks* correct, and the failure only surfaces at the moment
you delete the file. All aliases in `netlify.toml` therefore carry `force = true`.

### Retirement sequence

```bash
# 1. Deploy the current config (aliases are already in netlify.toml with force=true).
#    The rules now shadow the functions below.

# 2. VERIFY — do not skip. This is the gate.
BASE_URL=https://your-site.netlify.app npm run verify:aliases

#    Expect: every alias resolves, with a note that deletion is safe.
#    A 404 means the rule did not resolve — do NOT proceed.

# 3. Delete the 11 alias files (bridge-links.js STAYS — it is the fallback target):
cd netlify/functions
git rm admin-ai-context.js ai-form-submit.js apply.js drive-links.js \
       rincian-presets.js save-ai-cv.js save-master.js schedule-reminders.js \
       submit-apply.js submit-siswa-baru.js whatsapp.js

# 4. Re-baseline and re-verify.
npm run bundle:baseline && npm run bundle:size && npm run verify:binding
```

**Expected after step 3:** total ≈ **2,306 KB** (a further −77%), made up of
`bridge-links` 690 KB + 13 narrow ≈ 1,512 KB + 3 bespoke ≈ 104 KB.

**Rollback:** every step is a git revert. The aliases stay in `netlify.toml` permanently —
they are the compatibility layer for old clients.

### Honest revision of the original target

The original gate was *"deployed function code < 1 MB"*. That assumed 24 redundant bundles
to delete. With 28 legitimate entry points and one necessary catch-all, the achievable
floor is **~2.3 MB**, not 1 MB — and reaching it requires deleting the catch-all, which
would remove the 404-fallback safety net that makes narrowing safe in the first place.

---

## 7. Verification performed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | **865 passed** / 102 files |
| `npm run verify:binding` | pass — 13 narrow, 12 catch-all, 3 bespoke |
| `npm run bundle:size` | pass — baseline captured |
| `netlify-wrapper-surface.test.ts` | updated to mirror the new wiring; fails if anyone reverts `ai-chat.js` to the router call |
| `indexer` census tests | refreshed (js 29→28, mjs 12→15, total 332→336) |

Two of the three indexer failures observed during this work were **pre-existing** drift
from uncommitted work in the tree (isolated by restoring `run-migration.js` and re-running).
The third was the unstaged deletion and resolved on `git add`.
