# Pre-Launch Readiness Check — ASJ Portal (asj-astro)

**Date**: 2026-10-04
**Scenario**: Pre-launch readiness — code review + security audit + QA testing
**Members**: code-reviewer (product review) · security-officer (OWASP 2021 + STRIDE) · qa-lead (QA + release readiness)
**Subject**: `F:/astro` · branch `main` @ **18 commits ahead of `origin/main`**, never pushed · working tree **18 modified + 7 untracked**
**Predecessor**: `pre-launch-check-2026-10-02.md` — this report supersedes it; carried-forward items are marked ⏳

---

## 📌 TL;DR (Executive Summary)

- **Overall: 🔴 No-Go to publish today** — but the blocker is **not** code quality. It is the billing state of the deploy channel.
- **Blockers: 2 🔴** (deploy channel dead; one gate red) + **6 🟠** conditions.
- **The decisive fact (re-verified this session)**: `netlify api listSiteDeploys` shows the last successful build is `742e9561b` @ **2026-09-24T10:41Z**. Every push since — **7 consecutive** — returned `state:error, "Skipped due to account credit usage exceeded"`. **Pushing publishes nothing.**
- **All three members independently reached "Conditional Go" on their own scope** — no auth bypass, no committed secrets, no SQL/PostgREST injection, no functional bug in launch paths. The code is in good shape.
- **The one finding that can silently corrupt data**: WA normalization exists in **3 copies** and the client/server copies have **diverged** — a Japanese mobile normalizes to a different identity on each side, so one human can become two candidate rows. (Verified by team-lead, §2 #6.)
- **The one finding that is a live exploit**: `submitApply` is reachable anonymously and writes to `database_candidate` / `master_database_candidate` with **no owner check** — the session token is dropped at the surface layer. (Verified by team-lead, §2 #3.)
- **Next step**: fix the two P0 code defects → commit the 18-file backlog as one batch → **but first restore Netlify credit**, or the push is a no-op.

---

## 🎯 Verdict Card

| Item | Value |
|------|-------|
| Go / No-Go | 🔴 **No-Go** (cannot publish today) · 🟡 **Conditional Go** on code quality |
| Severity distribution | 🔴 2 / 🟠 6 / 🟡 11 / 🟢 6 |
| Blockers | 2 (both release/process, not code quality) |
| Conditions to publish | 6 🟠 |
| Can an engineer unblock alone? | ❌ No — blocked on Netlify billing (owner decision) |
| Measured test baseline | `9 failed | 172 passed (181)` files · `9 failed | 2133 passed (2142)` tests · 284.71 s · EXIT=1 — **of the 9 reds, 1 is genuine, 8 are environment/load artifacts** |
| Code gates | `tsc` 0 error (×2 configs) · `lint-ratchet` PASSED (−21) · `review:gate --base=HEAD` 7/7 · **`verify:fetch-boundary` FAILED (exit 1)** |

### 🚧 Blocker List (must clear before any publish)

| # | Blocker | Evidence | Owner |
|---|---------|----------|-------|
| B1 | Deploy channel dead — Netlify account credit exhausted | 7 consecutive `skipped` deploys; last `ready` = `742e9561b` (2026-09-24) | **Owner (billing)** |
| B2 | `verify:fetch-boundary` red — CI fails on push | `node scripts/ci/fetch-boundary.mjs` → **REAL EXIT=1**; `rirekisho-xlsx.ts:273` raw `fetch()` not allow-listed; CI runs it at `ci.yml:110` and `:372` | team-lead |

### ↩️ Rollback Plan

| Path | Availability | Note |
|------|--------------|------|
| Netlify deploy-level "restore previous deploy" | ✅ Only viable path today | Does **not** trigger a build, so unaffected by credit exhaustion |
| `scripts/ci/netlify-rollback.mjs` + `.github/workflows/rollback.yml` | ✅ Exists | Owner-executable |
| `git revert` + push | ❌ Ineffective today | Push is skipped too |

**Rollback is currently moot**: the live site is ~181 commits behind HEAD and the deploy channel is dead, so there is no "previous new version" to fall back to. Rollback becomes meaningful again only after credit is restored — and each push then costs one deploy.

---

## 1. Member Conclusions

### 🔍 Code Reviewer (quality / anti-patterns / maintainability)
- **Core judgement**: 🟡 **Conditional Go**. Code health is above average for a repo this size — 159 test files, a layered backend, real CI gates, and unusually honest comments. **No launch-blocking quality defect.** Findings: 🟠2 🟡5 🟢4.
- **Key recommendation**: the only finding that can produce a **wrong runtime result** is the WA-normalization drift (3 copies, client and server diverged). Everything else is maintainability debt: `AiCvForm.tsx` at 1,861 lines / 26 `useState`; 104 biome-fixable unused bindings; 435 `any` casts bypassing the declared row types; and `getEndpoint()` silently falling back to `bridge-links` for unknown actions.
- Measured: biome raw 733 errors / 573 warnings (almost all baselined — the *new* signal is the unused-binding cluster and WA drift).

### 🛡️ Security Officer (OWASP 2021 + STRIDE)
- **Core judgement**: 🟡 **Conditional Go**. **No auth bypass, no SQL/PostgREST injection, no committed secret** (full git-history scan). Findings: 🟠3 🟡4 🟢3.
- **Key recommendation**: three exploitable holes on **public endpoints** must close before launch — an anonymous cross-candidate write (`submitApply`), an unauthenticated + unthrottled PII lookup (`getExistingCandidateJsonByWa`), and an unauthenticated AI endpoint (`handleProcessSiswaAIChat`).
- Verified secure: HMAC-SHA256 sessions with mandatory `exp` + `timingSafeEqual`; `SESSION_SECRET` required in prod with no password fallback; PostgREST queries URL-encoded via `URLSearchParams` (no filter injection); action-API CORS never returns `*`; migration 012 closes the anon-key RLS read holes; `.env*` and `netlify/functions/secrets/*` gitignored and **never** committed to history.
- Secret-handling note: a live Firebase service-account private key exists on disk at `netlify/functions/secrets/firebase-service-account.json` — gitignored (`.gitignore:136`), never committed. Contents were **not** read. Recommend rotation if the working tree was ever shared.

### ✅ QA Lead (functional / edge cases / error handling / regression)
- **Core judgement**: 🟡 **Conditional Go**. Functional correctness is solid; error handling is unusually strong (typed `AppError` taxonomy, `toErrorResponse`/`safeError` never leak internals, rate-limit + admission control, idempotency keys). Findings: 🟠1 🟡4 🟢4.
- **Key recommendation**: exactly **one** genuine deterministic red exists (`e2e/candidates-lookup-stub.test.ts:63`) — not a product bug, but a permanently-red test that masks future reds. De-flake the 5 indexer real-tree suites so CI is green at launch.
- Measured: full suite `9 failed | 172 passed (181)` files / `9 failed | 2133 passed (2142)` tests / 284.71 s. Escalated re-run of the 9 reds: `4 failed | 5 passed` — attribution: **5** indexer suites timed out at 60 s but **passed escalated** (load artifacts); **3** (`discover`, `boundary`, `fcm-server`) fail with `spawnSync EBUSY` and persist escalated (Windows spawn file-lock, matches documented baseline); **1** (`candidates-lookup-stub`) is real.
- Positive regression evidence: the uncommitted launch diff is low-risk (44 px touch-target polish, `shadow-2xl` removal, one TS type fix); all 5 modified components have tests; new i18n key `admin.tt_chat_wa` exists in **both** `i18n.ts` and `i18n-jp.ts`; no `.only`; only 3 conditional skips.

---

## 2. Consolidated Findings (de-duplicated, severity-ordered)

| # | Sev | Category | Location | Problem | Remediation | Source |
|---|-----|----------|----------|---------|-------------|--------|
| 1 | 🔴 | Release | Netlify site `be40978f…` | 7 consecutive deploys `skipped: account credit usage exceeded`. Last `ready` = `742e9561b` (2026-09-24). **Push publishes nothing.** | Restore credit. Do **not** work around with `netlify deploy --prod --dir=dist` — `.env.local` holds a placeholder Supabase URL and would point production at a fake backend | qa-lead + team-lead ⏳ |
| 2 | 🔴 | Gate | `src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts:273` | Un-allow-listed raw `fetch()`. `verify:fetch-boundary` **REAL EXIT=1**. CI runs it at `ci.yml:110` and `:372` ⇒ pipeline red on push | Add a `max: 1` allow-list entry with rationale (target is an external image URL, not a function — same shape as the existing `UploadBerkas`→Cloudinary entry). **Do not** loosen the regex | qa-lead + team-lead ⏳ |
| 3 | 🟠 | Security A01 (BOLA) | `netlify/functions/surfaces/docs.ts:21` + `contexts/documents/service.ts:499-549` | `submitApply` is mapped as `(payload, sessionToken) => handleSubmitApply(payload)` — **the session token is dropped**. So `isOwnerOrAdmin(undefined, wa)` at `:487` is always false (dead guard), and the `else` branch at `:499-501` runs `upsertFormRow(body)` unguarded while the `database_candidate` (`:502-524`) and `master_database_candidate` (`:525-549`) PATCHes sit **outside** the guard entirely. An anonymous caller knowing a phone number can overwrite that candidate's `pas_photo`/`jft`/`ssw`/`file_cv` and inject a fake application | Pass the token through at `docs.ts:21`; require a verified session and scope `wa` to it (copy the pattern at `:914-926`), or gate the candidate/master writes behind `isOwnerOrAdmin` | security-officer + **team-lead verified** |
| 4 | 🟠 | Security A01 | `contexts/documents/service.ts:572-586` (exposed by `files.js:19`) | `handleGetExistingCandidateJsonByWa` has **no session check** and returns a prefill payload for any guessed number; it is in **no** rate-limit group (`_lib/handlers.ts:101-131`) ⇒ zero throttle. Enables PII enumeration | Require session + owner/admin; add to a rate-limit group | security-officer |
| 5 | 🟠 | Security A01/A04 | `_lib/ai/chat.ts:479` (via `surfaces/ai.ts`) | `handleProcessSiswaAIChat` runs with **no token**, unlike its sibling `handleProcessAIChat` which enforces a session at `:213-216` ⇒ anonymous Gemini quota burn (only a per-IP limit mitigates) | Require a session; align with `handleProcessAIChat` | security-officer |
| 6 | 🟠 | Correctness / drift | `shared/wa-rules.ts:31-33,51,54-61` vs `netlify/functions/shared/wa-rules.ts:31-33,53,56-58`; `src/lib/schemas.ts:26-49` | WA normalization exists in **3** copies and the two `wa-rules.ts` copies have **diverged**: `080…` → `62` (client `:31-32`) vs `81` (server `:31-33`); `81`+`6/7…` → falls through to `62` (client `:51`) vs kept as `81` (server `:53`); bare `81`+non-mobile → length-conditional (client `:54-61`) vs always `62` (server `:56-58`). The server's own comment (`:51-52`) says *"sebelumnya salah arah ke 62"* — the server was fixed, the client copy was not. `src/lib/schemas.ts:19-24` claims client rules "= backend exactly" — **false**. Signature drift too: `unknown` vs `string` | Collapse to ONE module; add a parity test running both impls over ID + JP fixtures | code-reviewer + **team-lead verified** |
| 7 | 🟠 | Test integrity | `e2e/candidates-lookup-stub.test.ts:63` | Genuine deterministic red (`expected 0 to be greater than 0`), reproduces in isolation **and** escalated. The `vi.doMock('…/_lib/db/candidates')` override at `:45-51` never reaches the `contexts/documents/repository` import at `:54`, so the fallback that emits `candidates.lookup-unavailable` is never exercised. The stub itself does log (`db/candidates.ts:129`; test #2 passes) ⇒ **no product regression**, but a permanently-red test masks future reds | Fix the mock wiring, or quarantine with a tracked TODO | qa-lead + **team-lead verified** |
| 8 | 🟠 | Maintainability / test-gap | `src/lib/apiEndpoint.ts:135-140`; `src/store/userStore.ts` (270 lines); `authReactive.ts` (124) | `getEndpoint` silently returns `bridge-links` for any unknown action. `action-registry.test.ts` guards the *registry* but **not** this routing table, so a registered action missing from `SURFACE_ENDPOINTS` silently hits the catch-all — exactly what the file's own comment (`:97-101`) says happened to `parseDokumenBiodata`. Core auth/session stores have **no test file** | Fail loudly on unknown action + assert every registry action has an explicit endpoint; add unit tests for the stores | code-reviewer |
| 9 | 🟡 | Security A01/A03 | `contexts/catalog/service.ts:146,269`; `share-data.js:43` | `handleShareData` returns candidate name + `no_wa` phone + photos/docs for any job code, with `Access-Control-Allow-Origin: *`. Job codes are enumerable (documented trade-off) | Re-add a per-job share token, or drop `no_wa` from the payload | security-officer ⏳ |
| 10 | 🟡 | Security A01 | `_lib/db/candidates.ts:64,66` → `contexts/catalog/service.ts:79,84` | Internal admin memos still ship to the candidate client. Rendering is fixed (`CandidateDash.tsx:296-319` reads only `catatanExt`), but `mapCandidate` still returns `catatan`(=catatan_admin) and `catatanInt`(=catatan_internal), and kandidat-mode `getAppData` returns the whole mapped row. **The known leak class is fixed in rendering, not in the payload** | Project `catatan_admin`/`catatan_internal` (and `nik`/`no_pasport`/`email`/`alamat`) out of the kandidat-mode response | security-officer |
| 11 | 🟡 | Security A05 | `netlify.toml` | Only cache headers; no CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, or `Referrer-Policy` | Add `[[headers]] for="/*"` | security-officer |
| 12 | 🟡 | Security A06 | `package.json` | `npm audit`: **22 advisories (1 critical, 21 high)**. Direct: `astro` 5.12.0 (critical rollup; fix 5.18.2, non-major), `@astrojs/netlify` 6.6.5 (high). **Caveat**: `astro.config.mjs:24-25` has `output:'server'`+`adapter:netlify()` **commented out** ⇒ static build, so most SSR advisories (middleware bypass, server-island XSS, Host-header SSRF, AVIF RCE) are not runtime-reachable. Audit severity overstates deploy risk | Bump `astro` ≥ 5.18.2 (non-major); the adapter is unused | security-officer |
| 13 | 🟡 *(pending bucket check)* | Edge-case / upload | `contexts/documents/service.ts:191-223` (`handleGetUploadUrls`), `:203-211`; `_lib/storage.ts:137-153` (`uploadBase64`), `:60`; `_lib/netlify-wrapper-surface.ts:147-154` | **Two orthogonal gaps on signed uploads, neither verifiable from the repo.** (a) **Type**: `ext` is sanitised only to `[a-z0-9]` (`:198-201`) with no allowlist; `uploadBase64` derives MIME from the filename and accepts any extension (`svg` is in its MIME map at `:60`). (b) **Size**: the sign call at `:203-211` passes only `{"expiresIn":120}` — no `maxBytes`. The 10 MB `MAX_BODY_SIZE` guard (`netlify-wrapper-surface.ts:147-154`) bounds only the JSON request **to** the function; it does **not** bound the file, because the client then PUTs the object **directly** to the Supabase signed URL, bypassing the function entirely. So the only possible bound is the bucket's own global file-size limit. Auth and folder confinement (`kandidat/<wa>/`; `..`-stripped admin folder) **are** correct | Add a server-side ext/MIME allowlist (pdf/jpg/png/webp/docx/xlsx) + a size bound on the sign call; **ops must confirm the bucket's `file_size_limit`/`allowed_mime_types`** — both gaps collapse to 🟢 if the bucket enforces them | security-officer + qa-lead (reconciled) |
| 14 | 🟡 | Coverage-gap | `contexts/contact/service.ts` (whole file) | The **only** unauthenticated write (`kirimPesanKontak`) has no server-side test — only the client `ContactForm.test.tsx` covers field order. Its own comment flags a silent high-impact failure (honeypot slot drift ⇒ every honest submission discarded as a bot) | Add a service-level test for honeypot slot, rate-limit, insert-failure, notify-failure | qa-lead |
| 15 | 🟡 | Coverage-gap | `src/lib/uploadGuard.ts:31` | `validateFile` has **zero** test references, yet it gates every upload client-side | Unit-test accept/size/ext edge cases | qa-lead |
| 16 | 🟡 | Test-infra | `indexer/src/{build,exportTables,resolve,tier2,validate}.test.ts` | Real-tree suites run at the edge of their 60 s timeout (escalated: `validate` 61.9 s, `build` 51.7 s). Under full-suite parallelism they exceed it and flake ⇒ CI will flake at launch | Raise timeout / serialize (dev-tool gates, not shipped code) | qa-lead |
| 17 | 🟡 | Maintainability | `src/components/forms/AiCvForm.tsx` (1,861 lines, **26 `useState`**, 0 `useMemo`); `MasterFullForm.tsx` (968/22); `CandidateDash.tsx` (992); `App.tsx` (844) | Chat pane + CV preview + upload + auth orchestration in one component; no memoization. Highest-churn maintainability risk | Split `AiCvForm` into chat / CV-form panes | code-reviewer |
| 18 | 🟡 | Dead-code | `_lib/ai/cv.ts` (13 unused, e.g. `:252 :343 :513 :628`), `chat.ts` (8), `master-data/service.ts` (4), `documents/service.ts` (4); **104 unused bindings** across ~24 files | 59 unused vars + 26 unused imports + 19 unused params; all biome-**FIXABLE** | Run biome safe autofix; eyeball `cv.ts`'s 13 — may be intended-but-forgotten logic, not noise | code-reviewer |
| 19 | 🟡 | Type-safety | 435 `any` + 82 non-null assertions; e.g. `ListKandidatModal.tsx:72` `(allCandidates as any[])` | Casts bypass the declared `Kandidat` interface (`adminStore.ts:14`) | Replace `any` in the data path with the existing row types | code-reviewer |
| 20 | 🟢 | Error-handling | `_lib/ai/cv.ts:559` `catch (e) {}` | The only bare empty catch; every sibling carries an explanatory comment | Add the same one-line rationale | code-reviewer |
| 21 | 🟢 | Anti-pattern | `AiCvForm.tsx:1147,1180,1222` `key={i}` | Index-as-key on add/remove-able `RepeaterRow`s | Key by row identity | code-reviewer |
| 22 | 🟢 | Comment drift | `_lib/db/client.ts:10-11` | Says "satu sumber kebenaran: shared/wa-rules.js" — false (two copies) and cites legacy `js/04_auth.js` | Fix once WA is collapsed | code-reviewer |
| 23 | 🟢 | Hygiene | root `Laporan*.txt`, `preview-index.html`, `test_excel_template.cjs`, `cv-selector-candidate.png` | Legacy cruft tracked in the repo root | Archive/remove | code-reviewer |
| 24 | 🟢 | Dead-code | `src/lib/supabase-server.ts` | 0 importers anywhere, 0 tests | Remove or ignore | qa-lead |
| 25 | 🟢 | Cryptography | `metrics-receiver.ts:303` | Bearer token compared with `!==` (not constant-time), inconsistent with `health.js:54-60`. Low risk (rate-limited) | `timingSafeEqual` | security-officer |
| 26 | 🟢 | Robustness (security-adjacent) | `contexts/contact/service.ts:64-65,97` | The contact honeypot is bound to `HONEYPOT_SLOT = 4`. The file's own comment (`:60-62`) warns that if the guard list is reordered, the honeypot reads the visitor's **subject** and *every honest submission is discarded as a bot while suspicious ones pass*. Correct today (named constant + assertion) but **no test pins the coupling** | Add a test asserting the field-name ↔ slot mapping | security-officer |
| 27 | 🟢 | Regression | `src/lib/swOffline.test.ts:49,161`, `src/lib/serverMime.test.ts:121` | `describe.skipIf(!hasBuild)` — SW offline-navigation + server-MIME are **untested pre-build** (by design; they need `dist/`) | Ensure the build-time gate runs them | qa-lead |

> **Not a finding, by design** — recorded so it is not "fixed": the `catatanExt` vs `catatan_admin` split is deliberate (#10 is about the *payload*, not the rendering); the 3 `EBUSY` reds are Windows spawn artifacts and are green in CI; `RirekishoBuilder`'s 10 px type is print output, not the 11 px UI floor; the empty "Kata Alumni" grid is deliberate (no invented testimonials, §8).

---

## ✅ Action List

| # | Action | Owner | Urgency | Notes |
|---|--------|-------|---------|-------|
| 1 | **Restore Netlify account credit** (or confirm an alternative publish path). Until then every push is a no-op and liveness checks cannot detect it (the frozen host still returns 200) | **Owner** | **P0** | B1 |
| 2 | **Fix the `submitApply` BOLA**: pass `sessionToken` through at `surfaces/docs.ts:21`, then require a verified session and scope `wa` to it in `contexts/documents/service.ts` (guard the `:499-501` insert and the `:502-549` candidate/master PATCHes) | team-lead | **P0** | #3 — live anonymous write |
| 3 | **Fix `verify:fetch-boundary`**: add a `max: 1` allow-list entry for `rirekisho-xlsx.ts` with rationale in `scripts/ci/fetch-boundary.mjs`. Do not loosen the regex | team-lead | **P0** | B2 |
| 4 | **Unify WA normalization** into one module (`shared/wa-rules.ts`, `netlify/functions/shared/wa-rules.ts`, `src/lib/schemas.ts`, `UndanganKelasModal.tsx:5`, `client.ts:10`) + add an ID/JP parity test | team-lead | **P0** | #6 — silent data corruption |
| 5 | Gate + rate-limit `getExistingCandidateJsonByWa` (`documents/service.ts:572`; add to `handlers.ts:101-131` groups) | team-lead | P1 | #4 |
| 6 | Auth-gate `handleProcessSiswaAIChat` (`_lib/ai/chat.ts:479`) | team-lead | P1 | #5 |
| 7 | Strip `catatan_admin`/`catatan_internal` (+ `nik`/`no_pasport`/`email`/`alamat`) from the kandidat-mode `getAppData` payload (`catalog/service.ts:79-84`) | team-lead | P1 | #10 |
| 8 | **Commit the 18-file backlog as ONE batch** — `indexer/src/{bind,boundary,build,discover}.test.ts`, `netlify/functions/_lib/fcm-server.test.ts`, `src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts`, `scripts/ci/shim-coverage.{mjs,mutations.sh}`, plus the rest. Pushing only the commits publishes a tree whose own indexer suite is red | team-lead | P1 | ⏳ |
| 9 | Fix or quarantine the `candidates-lookup-stub` red so the suite has a trustworthy signal | team-lead | P1 | #7 |
| 10 | Security headers in `netlify.toml` + bump `astro` ≥ 5.18.2 | team-lead | P2 | #11, #12 |
| 11 | De-flake the 5 indexer real-tree suites (timeout / serialize) | team-lead | P2 | #16 |
| 12 | Server-side upload ext/MIME allowlist + size bound on the sign call; **ops: confirm the `asj-files` bucket's `file_size_limit`/`allowed_mime_types`**; server-side `contact` handler test; `uploadGuard`/`userStore` tests | team-lead + ops | P2 | #13, #14, #15, #26 |
| 13 | Decide on the two standing PII trade-offs (public share view; anonymous prefill) — explicit risk acceptance on paper, or re-add token / private bucket | **Owner** | P2 | ⏳ |

---

## ⚠️ Known Limitations / Not Covered

- **No live Supabase was reached.** RLS policy correctness is asserted from migrations 007/012 only — re-confirm against production. The three security findings above are all reproducible from source, but their *live* exploitability depends on the deployed RLS state.
- **`npm audit` severity overstates deploy risk.** Because `astro.config.mjs:24-25` has the SSR adapter commented out, the build is static; most Astro SSR advisories are not runtime-reachable. The `astro` bump is still recommended (non-major).
- **Environment artifacts, not defects** — do not "fix": 3 suites fail with `spawnSync node.exe/cmd.exe/git EBUSY` (this machine cannot create child processes from a vitest worker; green in CI), and 5 indexer suites time out at 60 s under full-suite parallelism but pass escalated. No `SAFE_DELETE_BULK_CONFIRM_REQUIRED` fired this session.
- **Not covered this session**: `verify:batteries` (120 min), Playwright e2e, `bundle:size`, `cold:start`, `idx:gate`, a real production deploy + smoke, Cloudinary preset signing status, Netlify env-var (`SESSION_SECRET`/`HEALTH_TOKEN`/`METRICS_RECEIVER_TOKEN`) presence, and **the `asj-files` bucket's own `file_size_limit`/`allowed_mime_types`** — the last determines whether finding #13 is 🟡 or 🟢 and is the single highest-value ops check outstanding.
- **Not measured**: no build was run (deliberately, to preserve the delete quota and keep the suite reachable in-session).
- **Secret note**: a live Firebase service-account key sits on disk at `netlify/functions/secrets/firebase-service-account.json`; it is gitignored and was never committed. Contents were not read. Rotate if the working tree was ever shared (given the prior "credential destroyed by a test" incident).
- **Pre-existing worktree**: `F:/tmp/astro-r11` @ `5371c0b` (not produced by this session).
- All three members worked **read-only**: no edits, no commits, no pushes, no servers started, no AI/Fonnte/FCM calls.

---

## 📚 Member Output Index

- **code-reviewer (product review)** — framework: `review` skill (7 sub-reviewers). Scope: `src/`, `netlify/functions/`, `shared/`. Measured biome raw counts directly (`biome lint`, read-only) and derived the unused-binding cluster and WA drift. **Verdict: 🟡 Conditional Go.**
- **security-officer (OWASP 2021 + STRIDE)** — OWASP Top 10 per-class conclusions + STRIDE trust boundaries; full git-history secret scan (no findings); `npm audit` (22 advisories, with a reachability caveat). **Verdict: 🟡 Conditional Go.** Plus two reconciliation addenda: the upload-allowlist analysis (auth/folder confinement correct; type-confusion 🟢) and the honeypot `HONEYPOT_SLOT` fragility note.
- **qa-lead (QA + release readiness)** — full-suite baseline (284.71 s) + escalated re-run of the 9 reds for attribution; coverage-gap analysis over launch paths; `qa` skill issue taxonomy. **Verdict: 🟡 Conditional Go.** Plus an addendum: no server-side **size** cap on signed uploads (unbounded storage-quota abuse) — reconciled with security-officer into finding #13.
- **team-lead (orchestrator)** — independent verification of the top finding in each area: reproduced the `submitApply` token-drop at `surfaces/docs.ts:21` and the unguarded PATCHes at `documents/service.ts:499-549`; diffed the two `wa-rules.ts` copies line by line; read `candidates-lookup-stub.test.ts` in full; re-verified the deploy history via `netlify api listSiteDeploys` and the `fetch-boundary` exit code (real exit 1, not the `tail`-masked 0).

---

> This report was produced by AI collaboration (Software Workshop). Key decisions should be reviewed by the engineering owner.
> **The three members agree**: the code is releasable; the publish channel is not.

---

## 🔧 Post-Report Remediation Log (2026-10-04)

Applied after the report above, on the owner's instruction to fix what can be fixed and commit each fix. **Five commits, each independently verified.** Nothing pushed — `main` is still never pushed (R19).

| Commit | Fix | Finding | Proof |
|--------|-----|---------|-------|
| `907c69d` | `verify:fetch-boundary` allow-list entry for the rirekisho photo fetch | #2 🔴 | gate **exit 1 → exit 0** (7 files / 7 allow-listed) |
| `63b4016` | WA normalization unified; `normalizeWaInput` delegates instead of being a 3rd copy | #6 🟠 | 22-fixture parity test added; mutation of the client copy **killed** it; restore byte-identical (sha256) |
| `e4a8e46` | `submitApply` candidate/master writes gated behind `isOwnerOrAdmin` | #3 🟠 | new test fails pre-fix with `expected [ 'database_candidate' ] to not include 'database_candidate'` |
| `ba07fba` | `candidates-lookup-stub` test was vacuous — `vi.doMock` never bound | #7 🟠 | mutation of the fallback **killed** it; restore byte-identical (sha256) |
| `742c536` | Security response headers in `netlify.toml` | #11 🟡 | TOML parsed (smol-toml), 3 `[[headers]]` blocks, 5 new values |

**Gate state after the fixes**: `tsc` 0 error (checked at every commit) · `lint-ratchet` PASSED (debt −28) · `verify:fetch-boundary` **exit 0** — the last red CI gate is now green.

### What was deliberately NOT fixed, and why

| Finding | Why it was left alone |
|---------|----------------------|
| #4 anon PII enumeration (`getExistingCandidateJsonByWa`) | Needs a **rate-limit-group** decision, not a code edit. Adding a session requirement would break the public prefill contract the apply form depends on. Owner decision. |
| #5 unauthenticated AI endpoint (`handleProcessSiswaAIChat`) | `processSiswaAIChat` may be intentionally public for the `/siswa-baru` flow; changing it without confirming intent would break that flow. Owner decision. |
| #10 `catatan_admin`/`catatan_internal` in the kandidat payload | **Not a mechanical strip.** `CandidateDash.tsx:250` reads raw `catatanInt` (and `catatan` as fallback) to derive VIP/class state, so removing them from the payload breaks the dashboard. The client must switch to the server-derived `isSiswaASJ` flag **in the same change**. |
| #12 `astro` ≥ 5.18.2 | Dependency bump — needs a lockfile update and a build to verify. Deferred rather than rushed. |
| #18 104 unused bindings | `biome check --write` is a large mechanical diff across ~24 files; it deserves its own commit and review, not a rider on a security batch. |
| #1 Netlify credit | Billing, not a code fix. |

### ⚠️ The commits are local only

All five sit on `main` and are **not pushed**. That is intentional (R19 — every push costs a deploy), and it is also moot while B1 stands: the deploy channel is still dead, so a push would publish nothing.

### Still open before launch

B1 (Netlify credit) · B2 is now **fixed** · #4, #5, #8 (rate limiting on public writes) · #9, #10 (PII payloads) · the pending 12-file backlog is still uncommitted.
