# Pre-Launch Remediation — Round 5 (asj-astro)

**Date**: 2026-10-07
**Scenario**: Pre-launch remediation — binding tail, dead-file removal, frozen-counter re-baseline
**Members**: product-reviewer (code quality)
**Lead**: team-lead (recon, the counter re-baseline, independent verification)
**Predecessors**: `pre-launch-check-2026-10-04.md` · `pre-launch-fix-round{2,3,4}-*.md`

---

## 📌 TL;DR

- **The most important outcome this round is a defect the repo caught in itself.** One of the "unused binding" removals was **wrong** — it was a load-bearing test fixture — and `indexer/src/parse.test.ts` went red and said so.
- **The dead file is gone** (owner-approved), and the frozen counters were re-baselined **by measurement**, not by bumping numbers until the suite went green.
- **Two commits**: `59bdf0a` (binding tail) · `a5226bd` (dead file + counters). **Sixteen commits this session; none pushed.**
- **Suite back to its clean baseline**: `3 failed | 180 passed (183)` · `3 failed | 2212 passed (2215)` — only the three documented `EBUSY` artifacts.
- **Owner decisions taken**: astro major jump **deferred**; dead file **deleted**; the share-page PII question (#9) **still open**.
- **Publish still blocked on the same thing**: the Netlify deploy channel, dead since 2026-09-28.

---

## 🎯 Verdict Card

| Item | Value |
|------|-------|
| Go / No-Go | 🟢 **Go on code** · 🔴 **No-Go on publish** (billing only) |
| Commits this round | 2 (16 for the session) |
| Pushed | **0** — `main` is never pushed (R19); now 34 ahead |
| Gates | `tsc` 0 · `lint-ratchet` PASSED (**2475 → 2302, −175**) · `review:gate` **7/7** · `verify:fetch-boundary` 0 · `memory:check` 0 |
| Suite | `3 failed \| 180 passed (183)` · `3 failed \| 2212 passed (2215)` |
| Frozen counters | re-baselined: `files.length` **536 → 535**, `ts` **293 → 292** (measured) |
| Remaining blocker | 🔴 Netlify credit (billing) — unchanged across all five rounds |

---

## 1. Member Conclusions

### 🔍 product-reviewer — 5 resolved, 2 verified intentional, 1 wrong
- **Core judgement**: the binding tail was worth finishing, but the value was in the two sites they *refused* to touch — and one they should not have touched.
- **Resolved (5)**: the dead `normalizeWa` import (already proven dead in round 4 by `git log -S`), an unused parameter, an unused variable, an unreferenced `interface CounterRow`, and an unreferenced local `mapForm`.
- **Verified and left (2)**: `surfaces/docs.ts:21 sessionToken` — confirmed intentional by reading the guard (the endpoint is deliberately public, and the handler keeps the guard shaped so it works if a token is ever passed); and `surfaces/ai.ts:21 BACKGROUND_ACTIONS` — a documented empty placeholder, which they additionally showed was **never referenced even at introduction**.
- **Wrong (1)**: the `mapForm` removal. See §2.

### 🔧 team-lead
- **Recon** and the deploy-channel check; the counter re-baseline (a team-lead-only operation) done by measurement with the repo's own tool; independent verification of every claim, including the one that failed.

---

## 2. The finding that matters: the gate caught a bad removal

`contexts/catalog/repository.ts:32` held `const mapForm = _mapForm;`. Biome reports it as `noUnusedVariables`, and no runtime code reads it — so it was removed as part of the cleanup. The suite went from 3 failures to 4:

```
FAIL indexer/src/parse.test.ts > real-file outlines >
     catalog/repository.ts — aliased re-export `_mapForm as mapForm`
```

`parse.test.ts:37-47` pins **that exact file** as its real-world example of *"aliased re-export shadowed by a local const"*:

```js
const alias = p.exports.find((e) => e.exportName === 'mapForm');
expect(alias).toMatchObject({ localName: '_mapForm', kind: 'named' });
const local = p.symbols.find((s) => s.name === 'mapForm');
expect(local?.kind).toBe(SymbolKind.Constant); // `const mapForm = _mapForm`
```

The line is a **fixture**, not dead code — the parser needs a real subject to be tested against. It was restored, and now carries a `DO NOT DELETE` comment naming the test and the date, so the next cleanup pass cannot repeat this.

**This is the second round in a row** where a binding that *looked* unused was not:

| Round | Site | What it actually was |
|-------|------|----------------------|
| 4 | `LoginModal.tsx:232 onBackdropClick` | a real user-facing bug — the backdrop click did nothing |
| 5 | `catalog/repository.ts:32 mapForm` | a load-bearing test fixture |

The durable lesson: **"biome says unused" is a signal to investigate, not an instruction to delete.** Two of the last three removals needed a human decision, and the one that didn't was caught by a gate within one suite run — which is the system working as designed.

---

## 3. Frozen-counter re-baseline (team-lead only)

Deleting a `.ts` under `src/` moves the frozen inventory counters, which only the team lead may re-baseline. Done **by measurement**, using the repo's own tool, rather than by adjusting numbers until the suite passed:

```
node node_modules/vitest/vitest.mjs run indexer/src/count-indexed.test.ts --project indexer
  BEFORE: files.length = 536, ts = 293
  AFTER:  files.length = 535, ts = 292
```

Per-bucket delta: `ts` moved by exactly `−1` while `tsx`/`astro`/`mjs`/`cjs`/`js` did **not** move. Three assertions now agree on that same `−1` — `count('ts')` and `files.length` in `discover.test.ts`, and `fileCount` in `build.test.ts` — which is what *attributes* the change instead of absorbing it. Each carries a dated history entry in the file's established style.

---

## ✅ Action List

| # | Action | Owner | Urgency |
|---|--------|-------|---------|
| 1 | **Restore Netlify account credit** — fifth round standing; a push is still a no-op | **Owner** | **P0** |
| 2 | Decide the share-page phone number (#9) — the last open code question; drop `no_wa` or accept it | Owner | P1 |
| 3 | Confirm the `asj-files` bucket's `file_size_limit`/`allowed_mime_types` | Owner / ops | P1 |
| 4 | Astro major jump to 7.3.5 — **deferred by decision**; revisit as its own change with a full regression pass | Owner | P2 |
| 5 | Run a clean `npm ci` + build to close the astro bump's `--ignore-scripts` caveat | Owner / CI | P2 |
| 6 | `@supabase/ssr` is now an unused dependency (the deleted file was its only importer) — remove it as its own change with lockfile churn | team-lead | P3 |
| 7 | #17 (split the 1,861-line `AiCvForm`) and #23 (legacy cruft at the repo root) remain — both need an owner scope call | Owner | P3 |

---

## ⚠️ Known Limitations

- **Nothing is pushed.** Sixteen commits sit on `main`; `origin/main` is 34 behind. Intentional (R19) and moot while the deploy channel is dead.
- **The astro critical is still open** — deferred by decision, and not reachable in the current static build.
- **`@supabase/ssr` is now an unused dependency**, deliberately left rather than removed in the same commit as a file delete.
- **The cleanup is a mechanical diff.** Its safety rests on `tsc`, the full suite and the gates — and this round is a reminder that mechanical safety is not the same as semantic safety: the suite caught what reasoning missed.
- All work was local; no member started a server, called AI/Fonnte/FCM, or wrote to production data.

---

## 📚 Member Output Index

- **product-reviewer** — 5 binding resolutions across `registry/service.ts`, `catalog/service.ts`, `_lib/kernel/rate-limit.ts` and `catalog/repository.ts`; the two verified-intentional confirmations with their evidence; and the `mapForm` removal that the suite rejected.
- **team-lead** — recon and deploy check; the owner-question round; the measured counter re-baseline with per-bucket attribution; the `mapForm` restoration with a guard comment; independent verification of every claim.

---

> This report was produced by AI collaboration (Software Workshop). Key decisions should be reviewed by the engineering owner.
> **Net position after five rounds**: **21 of 27** round-1 findings closed, **2 partial** (#12 astro — deferred by decision; #19 — 435 → 417 `any` casts), **4 open** (#1 billing · #9 share-page PII · #17 scope · #23 scope). `#24` (the dead file) is now **closed**. There is still **no genuine test failure** in the repository, and the tree **builds**.
