# Pre-Launch Remediation — Round 4 (asj-astro)

**Date**: 2026-10-07
**Scenario**: Pre-launch remediation — remaining defects and polish, plus the first real build
**Members**: investigator (debug / root cause) · product-reviewer (code quality)
**Lead**: team-lead (recon, independent verification, build validation)
**Predecessors**: `pre-launch-check-2026-10-04.md` · `pre-launch-fix-round2-2026-10-05.md` · `pre-launch-fix-round3-2026-10-06.md`

---

## 📌 TL;DR

- **A real user-facing bug is fixed**: clicking the LoginModal backdrop did nothing, while every other modal in the app closes.
- **`key={i}` is properly fixed** (#21) with stable row ids and two behavioural proofs — the round-3 refusal is now paid off rather than deferred again.
- **The build finally ran and passed.** `EXIT=0`, 11 pages, SW manifest regenerated. This is the first real build covering the astro 5.12.0 → 5.18.2 bump *and* the 74-file binding cleanup — until now they had only ever been through `tsc` and vitest.
- **Two commits**: `8769445` (UI) · `d3c823b` (refactor). **Fourteen commits this session; none pushed.**
- **Suite: `3 failed | 180 passed (183)` · `3 failed | 2212 passed (2215)`** — still zero genuine failures.
- **Publish is still blocked on the same single thing**: the Netlify deploy channel, dead since 2026-09-28.

---

## 🎯 Verdict Card

| Item | Value |
|------|-------|
| Go / No-Go | 🟢 **Go on code** · 🔴 **No-Go on publish** (billing only) |
| Commits this round | 2 (14 for the session) |
| Pushed | **0** — `main` is never pushed (R19); now 32 ahead |
| Build | ✅ **exit 0** · 11 pages · SW manifest `asj-astro-440aa6a65a63` · 88 precache URLs |
| Gates | `tsc` 0 · `lint-ratchet` PASSED (**2475 → 2307, −168**) · `review:gate` **7/7** · `verify:fetch-boundary` 0 |
| Suite | `3 failed \| 180 passed (183)` · `3 failed \| 2212 passed (2215)` · 325.71 s |
| Remaining blocker | 🔴 Netlify credit (billing) — unchanged across all four rounds |

---

## 1. Member Conclusions

### 🔧 investigator — one real bug fixed, one suspected bug disproved
- **Core judgement**: of the two defects round 3 left named, **one was real and one was not** — and saying so plainly is the valuable part.
- **LoginModal backdrop — real, fixed.** Confirmed the root cause independently, then proved the fix behaviourally: the new test clicks the inner panel (asserts `onClose` is *not* called), then the shell (asserts it *is*). Red before, green after. They also re-audited all 24 `onBackdropClick` sites and confirmed my grep-based suspicion about three other modals was a **false positive** — `RirekishoBuilder`, `UndanganKelasModal` and `PamfletModal` wire it through the `h()` props object, which a JSX-shaped pattern misses.
- **`registry/service.ts:128` — disproved, not fixed.** Round 3 flagged the unused dynamic `normalizeWa` import as *possibly* a forgotten normalization. `git log -S` shows it was **already unused at introduction** (commit `51d5b64`) — dead at birth, not broken later. And all three consumers of `data.wa` normalize internally (`candidate-helpers.ts:38`, `applications/service.ts:376`, `forms.ts:100`), so the omission is harmless. Verdict: a leftover import, not an omission.
- **New observation, not fixed**: the `emit` payload carries an un-normalized WA. Harmless today (the only consumer logs a masked string) but a future WA-keyed handler would trip on it.

### 🔍 product-reviewer — the refusal from round 3 paid off
- **Core judgement**: the `key={i}` fix was worth doing properly, and the data-path `any` cleanup was worth doing *narrowly*.
- **#21**: stable ids on the row model, minted from a module-level counter — never index-derived. Two proofs that fail with `key={i}`: **DOM-node identity after the sort reorder** (with index keys a row's input holds another row's value) and **per-row internal state** (a month picked before a year is left behind). They also corrected the brief: there is no AI-load path for these rows.
- **#19**: 18 casts removed, all of them bypassing a *declared* type. They explicitly declined to invent types for genuinely dynamic payloads (vendor globals, Supabase rows, the registry `Proxy`) and reported what remains as a number rather than a shrug.
- **Scope discipline**: left the two `key={i}` on the append-only chat/suggestion lists alone, with the reason — index keys are *correct* there, since nothing reorders or removes.

### 🔧 team-lead
- **Recon** established the state and that the deploy channel is still dead.
- **Root-caused the LoginModal bug** before briefing (destructure-without-use; `useOverlay` attaches only a keydown listener), and pre-screened the other three candidates so the brief carried real evidence rather than a guess.
- **Ran the build** — the largest outstanding risk, and the one thing no member could close.

---

## 2. Round-4 Fixes

| # | Finding | Fix | Proof |
|---|---------|-----|-------|
| — | LoginModal backdrop did nothing (flagged round 3) | one line: `onClick={onBackdropClick}` on the container div | behavioural test red before (`expected "vi.fn()" to be called 1 times, but got 0 times`) → green after; 16/16 |
| 21 | `key={i}` on add/remove-able rows 🟢 | `id` on `EduRow`/`JobRow`/`FamRow`; `EMPTY_*` → `new*Row()` factories with a monotonic counter; 3 keys switched | two proofs go red with `key={i}`: DOM-node identity after sort, and per-row state (`expected '' to be '02'`) |
| 19 | data-path `any` casts 🟡 | 18 removed, only where a declared type existed | 435 → 417 · `as any` 67 → 51 · non-test `as any` 43 → 27 |
| — | `registry/service.ts:128` suspected omission | **disproved** — dead at birth; left for the lead to decide | `git log -S`; all 3 consumers normalize internally |

### 🏗️ The build — the finding that mattered most

Round 3 closed with an explicit caveat: the astro bump and the 74-file cleanup had **never been built**, only typechecked and unit-tested. That is exactly the kind of gap that surfaces at the worst possible moment, so round 4 closed it:

```
[build] 11 page(s) built in 29.89s
[build] Complete!
[sw-manifest] version: asj-astro-440aa6a65a63 · precache 88 URLs
EXIT=0
```

`dist/` was backed up beforehand (a failed build leaves it partial, and two suites read it) — it did not need restoring. **The astro bump is now validated end-to-end**, not just at the type level.

---

## ✅ Action List

| # | Action | Owner | Urgency |
|---|--------|-------|---------|
| 1 | **Restore Netlify account credit** — fourth round standing; a push is still a no-op | **Owner** | **P0** |
| 2 | Decide the **astro major jump** to 7.3.5 — the remaining critical (XSS in `define:vars`) is not reachable via the non-major path | Owner | P1 |
| 3 | Confirm the `asj-files` bucket's `file_size_limit`/`allowed_mime_types` | Owner / ops | P1 |
| 4 | Decide the public share view (#9): accept, or drop the unread `no_wa` field | Owner | P2 |
| 5 | Run a **clean install** (`npm ci`) to fully close the astro bump — the local install used `--ignore-scripts` because esbuild's postinstall hits the documented `EBUSY` artifact | Owner / CI | P2 |
| 6 | Decide the `registry/service.ts:128` import (now proven dead) and the `emit` un-normalized WA the investigator flagged | team-lead | P3 |
| 7 | #17 (split the 1,861-line `AiCvForm`) and #23 (legacy cruft at the repo root) remain — both need an owner call on scope | Owner | P3 |

---

## ⚠️ Known Limitations

- **Nothing is pushed.** Fourteen commits sit on `main`; `origin/main` is 32 behind. Intentional (R19) and moot while the deploy channel is dead.
- **The astro critical is still open.** Round 3's bump resolved one critical (rollup) and left a newer one (XSS in `define:vars`, fix 7.3.5, two majors).
- **The install is not fully clean.** A plain `npm install` cannot run here (esbuild postinstall, `spawnSync EBUSY`); it was done with `--ignore-scripts`. The lockfile is consistent and the build passes, but a `npm ci` on CI remains the last word.
- **The `#19` number is scoped, not total.** 435 → 417; the remaining casts are mostly honest dynamic payloads, and "18 removed" is not "the `any` problem is solved".
- **The `emit` un-normalized WA is a flagged latent issue**, not fixed.
- **The registry `normalizeWa` import is still present** — proven dead, removal deliberately left to the lead rather than done silently.
- All work was local; no member started a server, called AI/Fonnte/FCM, or wrote to production data.

---

## 📚 Member Output Index

- **investigator** — `LoginModal.tsx:250` one-line fix plus a behavioural test in the existing `LoginModal.test.tsx`; the full 24-site `onBackdropClick` audit that cleared three false positives; the `git log -S` + consumer analysis that disproved the round-3 `normalizeWa` suspicion.
- **product-reviewer** — the `id`-on-row-model refactor across `AiCvForm.tsx` with two red/green proofs; 18 data-path `any` removals across `ListKandidatModal`, `TabDbJob`, `TabKelola`, `kernel/events.ts`, `chat.ts`, `AdminAiCopilot`; the explicit list of casts left as honest.
- **team-lead** — recon and deploy-channel check; the pre-brief root cause of the LoginModal bug; the build validation with `dist/` backed up; independent verification of both members' headline claims.

---

> This report was produced by AI collaboration (Software Workshop). Key decisions should be reviewed by the engineering owner.
> **Net position after four rounds**: **20 of 27** round-1 findings closed, **2 partial** (#12 astro — bumped and now build-validated, but a newer critical remains; #19 — 435 → 417 `any` casts, not solved), **5 open** (#1 billing · #9 and #23 owner decisions · #17 scope decision · #24 a dead file that cannot be deleted without moving a frozen counter). There is still **no genuine test failure** in the repository, and the tree now **builds**.
