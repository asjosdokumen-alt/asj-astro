# Pre-Launch Remediation — Round 2 (asj-astro)

**Date**: 2026-10-05
**Scenario**: Pre-launch remediation — security fixes + QA coverage, applied and verified
**Members**: security-officer (OWASP/STRIDE) · qa-lead (QA + release)
**Lead**: team-lead (independent verification + implementation of two lead-owned fixes)
**Predecessors**: `pre-launch-check-2026-10-04.md` (round 1 audit + its Remediation Log)

---

## 📌 TL;DR

- **All five items assigned this round are fixed, each proven by mutation.** Plus two lead-owned fixes and one gate repair.
- **Five commits landed**: `95be980` · `657e790` · `30f2329` · `29749c6` · `6bf307b`. **Ten commits total this session; none pushed.**
- **Suite: `3 failed | 180 passed (183)` files · `3 failed | 2194 passed (2197)` tests** (was `3 failed | 178 passed (181)`). The only reds are the three documented `spawnSync EBUSY` artifacts — **zero genuine failures remain**.
- **I caught two defects in the round-2 work** (a frozen-counter break I caused by under-briefing, and an over-narrow upload allowlist). **The officer then caught me being wrong about the second one** — measured evidence showed the apply flow uses Cloudinary, not the server path. The widening was still right; the attribution in this report is corrected.
- **New structural finding**: **CI never runs the `indexer` test project at all**, so the frozen counters and `memory:check` are enforced **locally only**.

---

## 🎯 Verdict Card

| Item | Value |
|------|-------|
| Go / No-Go | 🟡 **Conditional Go** — code side is clean; publish still blocked on billing |
| Commits this round | 5 (10 for the session) |
| Pushed | **0** — `main` is never pushed (R19) |
| Gates | `tsc` 0 error · `lint-ratchet` PASSED (debt −29) · `verify:fetch-boundary` exit 0 · **`review:gate` 7/7 PASSED** · `verify:workflows` · `verify:review-manifest` |
| Suite | `3 failed | 180 passed (183)` · `3 failed | 2194 passed (2197)` · 336.93 s |
| Remaining blockers | 🔴 Netlify credit (billing) — unchanged from round 1 |

---

## 1. Member Conclusions

### 🛡️ security-officer — 5 fixes, all mutation-proven
- **Core judgement**: all five assigned findings closed; two of them needed a **product judgement**, not a code change.
- **#5 (unauthenticated AI endpoint)** — concluded **public by design** on evidence: `surfaces/ai.ts:28` deliberately drops the token, `SiswaBaruForm.tsx:196` posts with `requireAuth:false`, and `SiswaBaruForm.test.tsx:104` asserts it. So no auth was added; the endpoint was split into `PUBLIC_AI_ACTIONS` with an IP-only bucket at the **same** limits, making the exposure explicit without weakening the throttle.
- **#13 (upload allowlist)** — built a single server-side list with a gate at **both** layers (`handleGetUploadUrls` before signing, `uploadBase64` before any storage call), removed `svg` from the MIME map, and **refused to invent a `maxBytes`** parameter because Supabase's sign API does not accept one — documenting that the bucket's own `file_size_limit` is the only size bound.
- **#4** put the anonymous PII prefill in an IP bucket without adding a session requirement (which would break the public prefill contract). **#22** corrected the false "single source of truth" comment. **#25** replaced a `!==` token compare with a length-guarded `timingSafeEqual`.

### ✅ qa-lead — 4 gaps closed, plus a root-cause finding
- **Core judgement**: the coverage gaps are closed and the indexer flake is **not** merely a timeout.
- **Decisive measurement**: run together under parallel file execution, `build.test.ts` ("is deterministic across builds") and `validate.test.ts` (disagreeBoundNoCompiler 5 vs 0) **fail**; run alone, both **pass** (37.1 s / 45.5 s). That is cross-suite interference, which no timeout can fix — so the suites are now serialized (`fileParallelism: false`) and the cap raised to 180 s (~3× the worst isolated measurement).
- **Counter discipline**: placed both new test files in `e2e/` precisely because a `.ts` under `src/**` or `netlify/functions/**` would move a frozen counter — and reported the one transient counter reading it saw rather than re-baselining it.

### 🔧 team-lead — 2 fixes, 1 gate repair, 2 corrections issued
- **#27 (lead)**: found that the build-dependent suites **never execute in CI**. `src/lib/swOffline.test.ts` and `src/lib/serverMime.test.ts` gate their real assertions behind `describe.skipIf(!hasBuild)`, and `test-frontend`/`test-backend` have no `needs:` and run before the build. Added a step to the `smoke` job (the only job holding the artifact) — the same doctrine the repo already applied to `verify:pwa` at `ci.yml:358-367`.
- **#20 (lead)**: `_lib/ai/cv.ts:559` was the only bare `catch (e) {}` in the file; added the sibling's rationale.
- **Gate repair (lead)**: `review:gate` R7 was red on `memory:check` — **my own doing**, from adding a section to `MEMORY.md` (4953 B > 4096 B budget). Fixed the prescribed way: moved the longest items into `MEMORY_DETAIL.md` and left pointers, now 3862 B.
- **Correction 1 (issued)**: the officer's new `storage-upload.test.ts` sat under `netlify/functions/`, a counted tier, and turned `discover.test.ts` red with `expected 294 to be 293`. Merged into the existing `storage.test.ts`.
- **Correction 2 (issued, and then I was corrected myself)**: I claimed the allowlist broke the candidate apply flow. **The officer measured and refuted it** — `ApplyFullForm.tsx:9,280` uploads via `uploadToCloudinary`, and the only `getUploadUrls` callers are `PemberkasanModal.tsx:389` and `CandidateDash.tsx:785`, all inside the original set. I verified this independently and confirm the officer is right. The widening still mattered for a **different** caller: `AdminAiCopilot.tsx:203` does `readAsDataURL` → base64 → `uploadBase64`, and its `accept` offers `.csv,.txt`.

---

## 2. Round-2 Fixes (all verified)

| # | Finding | Fix | Proof |
|---|---------|-----|-------|
| 13 | Upload type/size gap 🟠 | `_lib/storage.ts` allowlist (17 types) + gate at `handleGetUploadUrls` and `uploadBase64`; `svg` removed from the MIME map | gate disabled → svg/html/js/exe sign and `uploadBase64` returns a URL; restored → refused |
| 4 | Anonymous PII enumeration 🟠 | `_lib/handlers.ts` IP bucket `prefill:<ip>` 20/min | bucket removed → `expected [] to have a length of 1 but got +0` |
| 5 | Unauthenticated AI endpoint 🟠 | concluded public by design → `PUBLIC_AI_ACTIONS` + IP-only `siswaAi:<ip>` at identical limits | old grouping restored → the `siswaAi` bucket is absent |
| 14 | Contact handler untested 🟡 | `e2e/contact-service.test.ts` (16 tests) | `RATE_MAX 5→99` → 1 red; `HONEYPOT_SLOT 4→2` → 10 reds |
| 15 | `uploadGuard` untested 🟡 | `e2e/uploadGuard.test.ts` (13 tests) | `>`→`>=` → 3 reds; default `5`→`10` MB → 1 red; format check off → 6 reds |
| 16 | Indexer suites flake 🟡 | `testTimeout` 60 s→180 s **and** `fileParallelism:false`; inline timeouts raised to match | together-under-parallelism fails; serialized → 5 files / 50 tests pass (125 s) |
| 20 | Bare `catch (e) {}` 🟢 | `_lib/ai/cv.ts:559` | comment only; no behaviour change |
| 22 | Comment drift 🟢 | `_lib/db/client.ts:10-14` | now names both copies + the parity test |
| 25 | Non-constant-time compare 🟢 | `metrics-receiver.ts` `safeEqual` | reverting to `!==` fails the source-inspection test |
| 26 | Honeypot coupling unpinned 🟢 | assertion on the field-order ↔ `HONEYPOT_SLOT` mapping | `HONEYPOT_SLOT 4→2` kills it |
| 27 | Build-dependent suites never ran in CI 🟠 | new step in the `smoke` job | 19 tests pass with `dist/` present; `verify:workflows` green |

### 🆕 New finding: CI does not run the indexer project

`ci.yml` runs `test:frontend` (`:162`) and `test:backend` (`:178`) — **neither includes the `indexer` project** — plus `idx:gate` (`:116`), which is `impact-gate.mjs`, not the vitest suites. So:

- the **frozen inventory counters** (`indexer/src/{discover,build}.test.ts`) are enforced **locally only**;
- `memory:check` is likewise never run in CI — `verify:review-manifest` itself reports *"Blocking gates CI never runs: 1 — memory:check"*;
- the QA lead's serialization cost therefore lands on local runs only, which is why it is affordable.

**Not fixed** — adding an indexer job is a CI cost decision for the owner, not a code fix.

---

## ✅ Action List

| # | Action | Owner | Urgency |
|---|--------|-------|---------|
| 1 | **Restore Netlify account credit** — nothing publishes until then, and a push is a no-op | **Owner** | **P0** |
| 2 | Decide whether to add an **indexer test job** to CI, so the frozen counters and `memory:check` stop being local-only | Owner | P1 |
| 3 | Confirm the `asj-files` bucket's `file_size_limit` / `allowed_mime_types` — still the only size/type bound for direct-to-signed-URL uploads | Owner / ops | P1 |
| 4 | Rate-limit + decide on the public share view and the `catatan_admin` kandidat payload (needs a client+server change together) | team-lead | P1 |
| 5 | Bump `astro` ≥ 5.18.2; clean up the 104 unused bindings as its own commit | team-lead | P2 |
| 6 | Push the 10 local commits **only after** credit is restored — each push costs a deploy | Owner | P2 |

---

## ⚠️ Known Limitations

- **Nothing is pushed.** Ten commits sit on `main`; `origin/main` is 28 behind. Intentional (R19) and moot while the deploy channel is dead.
- **The upload size bound is unverified.** The allowlist closes *type*; *size* still depends on a bucket setting that cannot be read from the repo.
- **`fileParallelism: false` serializes the whole indexer project** (15 files), not just the five real-tree suites — vitest has no per-file cross-file serialization. Slower, correct; local-only cost.
- **The interference channel is not root-caused.** Both suites call `buildIndex(ROOT)` and `validate.ts:553` writes a shared `indexer/validate-report.json`. Serialization is empirical, not explained.
- **`#25` timing-safety is asserted structurally** (source inspection), not measured — constant-time behaviour is not observable from a unit test.
- **The `#5` and `#4` changes are behaviour-neutral by design** (identical limits / no new auth). They make the exposure explicit and tunable; they do not tighten it.
- **Not covered**: a real deploy + smoke, `verify:batteries` (120 min), Playwright e2e, live Supabase RLS, Cloudinary preset signing.
- All work was **local**; no member started a server, called AI/Fonnte/FCM, or wrote to production data.

---

## 📚 Member Output Index

- **security-officer** — 5 findings fixed across `_lib/storage.ts`, `contexts/documents/service.ts`, `_lib/handlers.ts`, `surfaces/ai.ts`, `_lib/db/client.ts`, `metrics-receiver.ts`; red/green mutation cycles for each; plus one measured **refutation** of the lead's premise (Cloudinary vs server storage).
- **qa-lead** — 4 gaps closed via `e2e/contact-service.test.ts` (16), `e2e/uploadGuard.test.ts` (13), `vitest.config.ts`, `indexer/src/{tier2,validate}.test.ts`; mutation proofs and byte-identical restores; the cross-suite-interference measurement.
- **team-lead** — `ci.yml` (build-dependent suites + duplicate banner), `_lib/ai/cv.ts`; frozen-counter and allowlist corrections; `memory:check` repair; independent verification of both members' headline claims.

---

> This report was produced by AI collaboration (Software Workshop). Key decisions should be reviewed by the engineering owner.
> **Net position**: the code side of launch is now clean — zero genuine test failures, all gates green. The only thing still standing between this and a launch is the Netlify bill.
