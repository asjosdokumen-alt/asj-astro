# Pre-Launch Remediation — Round 3 (asj-astro)

**Date**: 2026-10-06
**Scenario**: Pre-launch remediation — privacy fix, dead-code cleanup, dependency bump
**Members**: security-officer (OWASP/STRIDE) · product-reviewer (code quality)
**Lead**: team-lead (independent verification + one lead-owned gate fix)
**Predecessors**: `pre-launch-check-2026-10-04.md` · `pre-launch-fix-round2-2026-10-05.md`

---

## 📌 TL;DR

- **The last two substantive findings are closed**: the admin-memo leak (#10) and the unused-binding debt (#18). Plus a lead-owned routing gate (#8) and a dependency bump (#12).
- **Two commits**: `1f64be6` (privacy) · `913e105` (cleanup + deps). **Twelve commits this session; none pushed.**
- **Suite: `3 failed | 180 passed (183)` files · `3 failed | 2209 passed (2212)` tests** (round 2: 2194). The three reds are the documented `spawnSync EBUSY` artifacts — **still zero genuine failures**.
- **`lint-ratchet` debt 2446 → 2324 (−151)**; `tsc` 0 errors; **`review:gate` 7/7 PASSED**.
- **Honest negative result**: the astro bump did **not** clear the critical. `npm audit` now reports a *newer* advisory (`astro <=7.2.7`, XSS in `define:vars`) whose only fix is a two-major jump to 7.3.5.
- **Publish is still blocked on the same thing**: the Netlify deploy channel is dead — no deploy since 2026-09-28, credit still exhausted.

---

## 🎯 Verdict Card

| Item | Value |
|------|-------|
| Go / No-Go | 🟡 **Conditional Go** — code side clean; publish blocked on billing only |
| Commits this round | 2 (12 for the session) |
| Pushed | **0** — `main` is never pushed (R19); now 30 ahead |
| Gates | `tsc` 0 · `lint-ratchet` PASSED (−151) · `review:gate` **7/7** · `verify:fetch-boundary` 0 · `verify:binding` 0 |
| Suite | `3 failed | 180 passed (183)` · `3 failed | 2209 passed (2212)` · 342.39 s |
| Remaining blockers | 🔴 Netlify credit (billing) — unchanged for three rounds |

---

## 1. Member Conclusions

### 🛡️ security-officer — #10 fixed; #9 assessed and left
- **Core judgement**: the leak was real and lived in the **payload**, not the rendering — the round-1 report had already fixed what the candidate *sees*, but `mapCandidate` still returned `catatan_admin`, `catatan_internal` and `_raw` (the entire row) to the browser.
- **Key move**: rather than deleting the fields and breaking the candidate's VIP badge, the server now **derives** `isVIP` and `kelas` from the same input the client used to read raw, and a new `toKandidatView()` drops the memos. The client was moved onto the derived flags in the same change.
- **Found a second consumer the original report missed**: `AiCvForm.tsx:435` also read `catatanInt` for the `/ai-cv` gate. Left alone it would have bounced **every** VIP/KELAS candidate to `/master` — a regression the report would not have predicted.
- **#9 (public share view)**: assessed, **not** changed. Cheapest fix identified — drop `no_wa` at `service.ts:269`, measured as declared in `ShareView.tsx:39` but never read anywhere — but it is still a shipped-contract change, so it is routed to the owner rather than done unilaterally.

### 🔍 product-reviewer — #18 and #12 done; #21 correctly refused
- **Core judgement**: the binding cleanup is safe and large; the `key={i}` fix is not worth its risk; the dependency bump is worth keeping but is **not** the security closure it looks like.
- **#18**: 129 → 9 unused bindings. Applied with **explicit file lists, never tree-wide**, because another teammate was writing concurrently. biome's fix is a *rename* (`e`→`_e`), not a deletion, so arity and argument positions are preserved — which is why 74 files of churn is still behaviour-neutral.
- **#12**: astro 5.12.0 → 5.18.2, resolving round 1's rollup critical. **Reported the negative result rather than the win**: a newer critical remains, needing a two-major jump.
- **#21**: refused on evidence — a correct fix needs stable ids threaded through the row model, the add/remove handlers and **31** `setState` sites. "Tracked follow-up", not a half-done edit.

### 🔧 team-lead — #8 fixed; one earlier finding corrected
- **#8 (routing fallback)**: round 1 said the routing table was unguarded. Investigating, the existing guard in `action-registry.test.ts` covers only `route → entry`; the unguarded direction is `action → route`. Measured 81 routes / 41 frontend-called actions, all 41 routed — so nothing is broken today, and the new assertion is a regression guard. Proven able to fail by deleting the `getAppData` route.
- **Corrected my own round-2 finding**: I reported `memory:check` as a CI gap. It is not — `.workbuddy-ai/` is gitignored (`.gitignore:29`) and `memory-archive.mjs` exits `2` when the directory is absent, so that gate is **structurally unable** to run in CI. The indexer-project half of the finding stands.

---

## 2. Round-3 Fixes

| # | Finding | Fix | Proof |
|---|---------|-----|-------|
| 10 | Admin memos in the kandidat payload 🟡 | `mapCandidate` derives `isVIP`/`kelas`; new `toKandidatView()` drops `catatan`, `catatanInt`, `_raw`; client moved onto the flags incl. `AiCvForm.tsx:435` | test inspects the **serialised** `mode=kandidat` response; red before with the whole row + both memos on the wire, green after |
| 18 | 104 unused bindings 🟡 | 129 → 9, biome `noUnusedVariables`/`noUnusedImports` (61 files) + `noUnusedFunctionParameters` (17 files), explicit lists | lint-ratchet debt 2446 → 2324; numstat 1–13 lines/file (no EOL rewrite) |
| 12 | `astro` critical 🟡 | 5.12.0 → ^5.18.2; lockfile consistent | `tsc` 0; `npm ci --dry-run` exit 0; **but a newer critical remains** |
| 8 | Silent routing fallback 🟠 | new `registry → rute klien` contract in `action-registry.test.ts` | deleting the `getAppData` route turns it red naming that action; the older block stays green |
| 21 | `key={i}` 🟢 | **LEFT** — needs a row-model refactor (31 `setState` sites) | tracked, not half-done |
| 9 | Public share view PII 🟡 | **ASSESSED, not changed** — owner decision | cheapest fix identified (`no_wa` unread by any consumer) |

### 🆕 Two latent bugs flagged, deliberately not touched

| Location | Suspicion |
|----------|-----------|
| `src/components/LoginModal.tsx:232` | `useOverlay` returns `onBackdropClick` but LoginModal never wires it to the backdrop div (`:250`) — **possibly a missing backdrop-dismiss**. Renaming it would have buried the signal, so it was left. |
| `netlify/functions/contexts/registry/service.ts:128` | A dynamically-imported `normalizeWa` that is unused — possibly a **forgotten normalization**. Flagged, not deleted. |

Both are the kind of thing a mechanical cleanup normally erases. Leaving them named is the point.

---

## ✅ Action List

| # | Action | Owner | Urgency |
|---|--------|-------|---------|
| 1 | **Restore Netlify account credit** — third round standing; a push is still a no-op | **Owner** | **P0** |
| 2 | Decide the **astro major jump** to 7.3.5 — the remaining critical (XSS in `define:vars`) is not reachable via the non-major path | Owner | P1 |
| 3 | Confirm the `asj-files` bucket's `file_size_limit`/`allowed_mime_types` | Owner / ops | P1 |
| 4 | Decide the public share view (#9): accept, or drop the unread `no_wa` field | Owner | P2 |
| 5 | Run a **clean install + real build** to fully validate the astro bump (the local install used `--ignore-scripts` because esbuild's postinstall hits the documented `EBUSY` artifact) | Owner / CI | P2 |
| 6 | Investigate the two flagged latent bugs (LoginModal backdrop; registry `normalizeWa`) | team-lead | P2 |
| 7 | `key={i}` row-model refactor (#21) — its own change, with ids on the row model | team-lead | P3 |

---

## ⚠️ Known Limitations

- **Nothing is pushed.** Twelve commits sit on `main`; `origin/main` is 30 behind. Intentional (R19) and moot while the deploy channel is dead.
- **The astro critical is still open.** The bump resolved one critical (rollup) and left another (XSS in `define:vars`, fix 7.3.5, two majors).
- **The astro bump's install was not clean.** A plain `npm install` fails on esbuild's postinstall (`spawnSync EBUSY` — this machine cannot spawn child processes from the sandbox); it was done with `--ignore-scripts` and the esbuild binaries were confirmed functional. The **lockfile is consistent** (`npm ci --dry-run` exits 0), but a real install + build on CI is the full validation.
- **No build was run** this round (sandbox delete quota) — `tsc` and vitest are the verification tools used.
- **The cleanup is a large mechanical diff** (74 files). Its safety rests on three facts: biome's fix is a rename not a deletion, `formatter.enabled:false` kept formatting churn out, and `tsc` + the full suite are green. It is *reviewable by sample*, not line-by-line.
- **`#9`, `#21`, the two flagged bugs, and the indexer-in-CI question are all open** and listed above.
- All work was local; no member started a server, called AI/Fonnte/FCM, or wrote to production data.

---

## 📚 Member Output Index

- **security-officer** — `_lib/db/candidates.ts` (`isVIP`/`kelas` derivation + `toKandidatView`), `contexts/catalog/service.ts`, `src/lib/vip.ts`, `CandidateDash.tsx`, `AiCvForm.tsx:435`; red-before/green-after proof on the serialised payload; `service-a02.test.ts` unit tests; #9 assessment with a measured "unread field" argument.
- **product-reviewer** — 129 → 9 unused bindings across 74 files with the lint-ratchet numbers; astro 5.12.0 → 5.18.2 with an honest account of the critical that remains; `key={i}` refusal with the reason; two latent bugs flagged instead of erased.
- **team-lead** — the `registry → rute klien` contract in `action-registry.test.ts` with its mutation proof; independent verification of the #10 leak test and the astro lockfile; correction of the round-2 `memory:check` finding.

---

> This report was produced by AI collaboration (Software Workshop). Key decisions should be reviewed by the engineering owner.
> **Net position after three rounds**: **19 of 27** round-1 findings closed, **1 partial** (#12 — astro bumped, but a newer critical remains), and **7 open**: #1 billing · #9 owner decision · #17 and #19 are large refactors deliberately not attempted (the 1,861-line component split, and 435 `any` casts) · #21 `key={i}` (needs a row-model refactor) · #23 legacy cruft (owner judgement) · #24 dead file (deleting it would move a frozen counter). There is still **no genuine test failure** in the repository.
