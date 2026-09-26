/**
 * build.test.ts — full pipeline (Phases 0-4) over the real repo.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, type BuildResult, type ParseReuseCache } from './build.js';
import { dumpDoc } from './dump.js';

const ROOT = process.cwd().replace(/\\/g, '/');

let cached: BuildResult | null = null;
function built(): BuildResult {
  return (cached ??= buildIndex(ROOT));
}

describe('full build', () => {
  it('indexes the measured inventory', () => {
    const r = built();
    // Phase B (2026-09-11): +4 files — kernel/deadline.ts, kernel/admission.ts
    // and their test files. ts 198 -> 202, total 336 -> 340.
    // 2026-09-11 (later): +2 more — scripts/ci/io-boundary.mjs and
    // scripts/lib/load-env.mjs. total 340 -> 342, then 342 -> 341 on
    // 2026-09-11 when e2e/share-data.test.ts moved out of netlify/functions/
    // (Netlify bundled it as a deployable function → `vitest` unresolvable),
    // then 341 -> 344 when the local env-audit trio landed under scripts/ci/.
    // 344 -> 333 when the 11 catch-all stubs were deleted (measured: 334 —
    // the "333" above was one low, see the same note in discover.test.ts).
    // 334 -> 341 (2026-09-11/12, Phase C items 11 + 12): +6 ts (the health and
    // metrics-sink modules plus their four test files) and +1 js
    // (netlify/functions/health.js). Verified by diffing the indexed list
    // against `git ls-files` at HEAD — exactly 7 new paths, 0 removed.
    // 341 -> 344 (2026-09-12, PWA work): +3 mjs — build-sw-manifest.mjs,
    // build-pwa-icons.mjs, scripts/ci/verify-pwa.mjs. Verified with the real
    // discoverFiles() call path (ts 208, tsx 78, astro 12, mjs 23, cjs 5, js 18).
    // 344 -> 347 (2026-09-12, Phase C receiver + gates): +2 ts
    // (metrics-receiver.ts, _lib/metrics-receiver.test.ts) and +1 mjs
    // (scripts/ci/verify-function-entries.mjs).
    // 347 -> 349 (2026-09-12, Lambda compatibility mode migration): +2 ts —
    // _lib/netlify-adapter.ts (the single Request->event / outcome->Response
    // conversion point) and _lib/verify-env-budget.test.ts (the 4 KB env budget
    // arithmetic). ts 210 -> 212; tsx/astro/mjs/cjs/js unchanged.
    // 349 -> 351 (2026-09-12, backend reachability fixes): +1 ts
    // (contexts/diagnostics/service.test.ts — locks the reportWebVital payload
    // contract) and +1 js (netlify/functions/diagnostics.js — the narrow entry
    // point that ends getAppConfig/reportWebVital's dependence on the
    // bridge-links catch-all). ts 212 -> 213, js 18 -> 19.
    // 351 -> 356 (2026-09-12, Phase D data layer): +2 ts
    // (_lib/db/projections.ts, _lib/db/projections.test.ts) and +3 mjs
    // (scripts/ci/gen-schema.mjs, verify-projections.mjs, verify-rls.mjs).
    // ts 213 -> 215, mjs 24 -> 27, everything else unchanged.
    // 356 -> 358 (2026-09-12, Phase D item 17): +2 ts
    // (_lib/db/pagination.ts, _lib/db/pagination.test.ts). ts 215 -> 217.
    // 358 -> 360 (2026-09-13, Phase D follow-up + Phase E): +2 ts —
    // _lib/chaos.test.ts (the §6.5/§6.7 degradation suite) and
    // contexts/scheduling/repository.test.ts (the `{ rows }` destructuring
    // guard). ts 217 -> 219.
    // 360 -> 362 (2026-09-13, owner-approved items 1 & 5): +2 ts —
    // contexts/identity/admin-personal.test.ts (the three-tier admin login) and
    // contexts/notifications/wa-single-durability.test.ts (row 4 of the matrix).
    // ts 219 -> 221.
    // 362 -> 363 (2026-09-13, owner-approved item 2): +1 tsx —
    // src/components/ui/AiUnavailableBanner.tsx (the banner the three AI
    // surfaces render on AI_UNAVAILABLE). tsx 78 -> 79; ts unchanged.
    // 363 -> 362 (2026-09-13, B06 share-token removal): -1 ts —
    // _lib/db/shareTokens.ts, deleted along with the gate it served (the share
    // link is public by job code again, as legacy). ts 221 -> 220; tsx stays 79.
    // 362 -> 363 (2026-09-13, BACKEND_TODO #8): +1 ts — the agenda-reminder cron
    // agenda-reminders.ts (the `config.schedule` trigger that
    // never existed). ts
    // 220 -> 221. No tsx/astro/mjs change. (The test file is not in the indexer inventory.)
    // 363 -> 376 (2026-09-13, evening). Measured against the tree, because the
    // previous literal had gone STALE BY 11 and `npm test` was red on main for
    // the commits that added the files (see the count('ts') note in
    // discover.test.ts for the list and the reason it slipped past). Only 2 of
    // the 13 new files are from this session (_lib/otlp.ts + its test).
    // The old breakdown comment was also internally inconsistent — it summed to
    // 364, not 363 — so the breakdown below is re-measured, not re-derived.
    // 376 -> 377 (2026-09-13, later): +1 ts — _lib/smoke-test-health.test.ts,
    // which pins the rollback gate's PASS/WARN/FAIL classification (BACKEND_TODO
    // #31). ts 233 -> 234. No tsx/astro/mjs change.
    // 377 -> 378 (2026-09-13, latest): +1 mjs — scripts/ci/check-md-tables.mjs,
    // the markdown table structure gate wired into ci:quality. mjs 27 -> 28.
    // Measured against the tree with the real discoverFiles() path. (The Python
    // prototype named in the first draft was deleted; it never entered the
    // indexer inventory because .py is not indexed.)
    // 378 -> 380 (2026-09-13, latest): +1 mjs (scripts/ci/cold-start-gate.mjs)
    // and +1 ts (netlify/functions/_lib/cold-start-gate.test.ts) — the cold-start
    // latency gate and its test (BACKEND_TODO #29). Its companion
    // cold-start-gate.mutations.sh is NOT counted: .sh is not an indexed extension.
    // 380 -> 381 (2026-09-13, latest): +1 ts — src/store/theme.test.ts, which
    // pins the banner/theme coupling fixed this session (the unconditional
    // bannerStore.set() in the theme subscriber made setBanner() a no-op).
    // ts 235 -> 236. No tsx/astro/mjs change.
    // 381 -> 382 (2026-09-13, later): +1 ts — _lib/otlp.test.ts, pinning the two
    // pre-flight checks that stop a malformed OTLP endpoint from failing
    // silently. ts 236 -> 237. No tsx/astro/mjs change.
    // 382 -> 383 (2026-09-14): +1 mjs — scripts/ui-audit.mjs, the browser
    // measurement audit added alongside docs/UI_DESIGN_REVIEW.md. mjs 29 -> 30.
    // No ts/tsx/astro/cjs/js change. Verified by removing the file from the tree
    // and re-measuring (29), not by assuming the delta.
    // 383 -> 385 (2026-09-14): +2 ts — src/lib/aiCvDraft.ts (nested→flat CV draft
    // bridge) and its test, added with the P2 admin CV-AI panel. ts 237 -> 239.
    // No tsx/astro/mjs/cjs/js change. Same +2 as discover.test.ts.
    // 385 -> 388 (2026-09-14): +2 ts (src/lib/vip.ts — the VIP/KELAS gate
    // predicate + the AI CV redirect helper — and its test) and +1 tsx
    // (src/components/candidate/CandidateDash.test.tsx, the §6 gate/badge suite).
    // ts 239 -> 241, tsx 80 -> 81. Same +3 as discover.test.ts.
    // 388 -> 390 (2026-09-14): +2 ts — src/lib/opsi-form.ts (the ID/JP dropdown
    // lists wired into MasterFullForm) and opsi-form.test.ts. ts 241 -> 243.
    // No tsx/astro/mjs/cjs/js change. Same +2 as discover.test.ts.
    // 390 -> 404 (2026-09-14, UI review round 2): +1 tsx (src/components/
    // App.header.test.tsx, the header-collision guard) and +13 mjs of drift that
    // predates that session. Proven independent: with the session's changes and
    // the new test file removed from the tree, the count still read 403.
    // Recomputed from the per-language ground truth, not from a delta guess —
    // 243 ts + 82 tsx + 12 astro + 43 mjs + 5 cjs + 19 js = 404 — because the
    // first reading (a +11 ts drift) was wrong and this sum is what disproved it.
    //
    // CORRECTION (2026-09-14, round 3): that +13 mjs "drift" was not drift — it
    // was scratch files. `discover.ts` counts dotfiles, so every `.tmp-*.mjs`
    // left in the repo root during measurement inflated the inventory. Measured
    // on a clean tree: 391 files, mjs 30. So the only genuine addition over 390
    // is this round's App.header.test.tsx. The lesson (and the guard) is written
    // up in discover.test.ts; see the "no scratch files are being counted" test.
    // RE-BASELINED 2026-09-15 (mutation-battery round). 402 -> 405: +3 mjs,
    // the ship-with-the-battery helper scripts added while proving the gates
    // can fail (scripts/ci/{alias-gate-patcher,projections-gate-patcher,
    // pwa-mutate}.mjs). Nothing else moved.
    //
    // The breakdown below is quoted from discover.test.ts, which measures the
    // same tree the same way. It previously read "245 ts + 83 tsx" here while
    // discover.test.ts said "244 ts + 84 tsx" — the two totals agreed at 402,
    // so this was prose drift rather than a counting disagreement, but it is
    // the kind of drift that makes the next reader distrust both files.
    //   246 ts + 84 tsx + 12 astro + 44 mjs + 5 cjs + 19 js = 410
    // 405 -> 406 (2026-09-16): +1 mjs — `scripts/ci/run-batteries.mjs`, the
    // mutation-battery runner. It is the only file the indexer counts among the
    // 14 added since the 41-mjs baseline in 257c104, and discover.test.ts moves
    // by exactly the same +1. The six counts still sum to the total, which is
    // the check the earlier corrections in this comment introduced.
    // The earlier pair of corrections in the comment above still applies — the
    // 404 reading was scratch files, and 391 was the clean value at THAT time.
    // The +11 before this round is ordinary accumulation: the CI-gate rounds
    // added scripts/ci/*.mjs + lib/biome-run.mjs (8), opsi-form.ts + its test
    // (2), App.header.test.tsx (1).
    // 406 -> 410 (2026-09-16): +4 — netlify/functions/contexts/
    // service-input-validation.test.ts and _lib/kernel/guard.ts (2 ts) plus
    // scripts/ci/{verify-validation-coverage,validation-coverage-patcher}.mjs
    // (2 mjs): the edge-validation gate, its battery patcher, the dependency-free
    // guards and their test. The .mutations.sh companion is .sh and does not
    // count, and .ci/validation-baseline.json is .json. (The guards are zod-free
    // because a zod import here added ~67 KB to eight entry points and pushed
    // files.js over the 600 KB ceiling — see _lib/kernel/guard.ts.)
    // 410 -> 412 (2026-09-16): +2 mjs — `e2e/test-drawer.mjs` and
    // `e2e/test-labels.mjs`, the drawer-contract and label-association guards.
    // MEASURED, not inferred from whatever the failing assertion happened to
    // print: ts/tsx/astro/cjs/js are ALL unchanged (246/84/12/5/19) and only mjs
    // moved, 44 -> 46. `git ls-files` lists four mjs added since HEAD, and the
    // two scripts/ci ones are already inside the +4 above — so the +2 here is
    // these two e2e guards and nothing else. Two files move, not three: this
    // fileCount plus count(mjs) and files.length in discover.test.ts.
    // 412 -> 413 (2026-09-16, same day): +1 tsx — `TabTambah.test.tsx`, added
    // because the label/control rework in that component (10 `for=`/`id=` pairs,
    // 3 checkbox groups -> <fieldset>+<legend>, 2 misused <label>s -> <div>) had
    // NO test at all, so the restructuring was compiled but unverified. Measured:
    // tsx 84 -> 85 and nothing else moves, so the six counts still sum to the
    // total. Same three assertions move again (this fileCount, count(tsx) and
    // files.length in discover.test.ts).
    // 413 -> 414 (2026-09-16, same day): +1 tsx — `InputManualModal.test.tsx`.
    // Same reason as the file above it: that modal's 14 `noLabelWithoutControl`
    // diagnostics were paid down (13 `for=`/`id=` pairs, 1 group label ->
    // <fieldset>+<legend>), and `TabPelamar.test.tsx` mocks the modal to `null`,
    // so NOTHING had ever rendered it. tsx 85 -> 86; nothing else moves.
    // 414 -> 415 (2026-09-16, same day): +1 ts —
    // netlify/functions/_lib/db/settings-limit.test.ts. Regression guard for the
    // OTHER call site of the findTable() limit=1 bug jobs-limit.test.ts already
    // covers: findSettings()/findAnnouncements() inherited the default, so the
    // whole config table read back as ONE row and every dropdown key but one was
    // absent. Nothing else moves.
    // 415 -> 414 (2026-09-17): net -1, and BOTH halves are deliberate.
    //   +1 astro — `src/pages/404.astro`. The site had no 404 page at all, so an
    //     unknown URL fell through to Netlify's default page.
    //   -2 mjs  — `e2e/test-admin.mjs` + `e2e/test-supabase-auth.mjs`, deleted.
    //     Both were orphaned (no workflow, no npm script) and neither was safe to
    //     wire: the first cannot pass without an admin session it never creates,
    //     the second calls auth/v1/signup with a random phone on every run and so
    //     creates real users in the production Supabase project.
    // Measured with a real discover run, not derived: 247 + 86 + 13 + 44 + 5 + 19
    // = 414. The identical two deltas are recorded in discover.test.ts, which is
    // the cross-check that these are the same files and not a third change.
    // 414 -> 415 (2026-09-17, later): +1 ts —
    // src/store/adminStore.fetchMail.test.ts, the transport + post-write-freshness
    // guard for taking adminStore.fetchMailFromAPI off its hand-rolled fetch.
    // +1 only; nothing was removed to make room. Measured with a real discover
    // run, not derived: 248 + 86 + 13 + 44 + 5 + 19 = 415, and the same run
    // cross-checked against `git ls-files --cached --others --exclude-standard`
    // filtered by includePath() — also 415. The identical +1 is recorded in
    // discover.test.ts (count('ts')), which is the cross-check that these are the
    // same file and not a second change.
    // 415 -> 416 (2026-09-17, later): +1 mjs —
    // scripts/ci/verify-workflows.mjs, the gate for the workflow files as GitHub
    // reads them. Measured with a real discover run, not derived:
    // 248 + 86 + 13 + 45 + 5 + 19 = 416, and the same run cross-checked against
    // `git ls-files --cached --others --exclude-standard` filtered by includePath()
    // — also 416. The identical +1 is recorded in discover.test.ts (count('mjs')),
    // which is the cross-check that these are the same file.
    // 416 -> 417 (2026-09-17, later): +1 tsx —
    // src/components/CekSiswaModal.test.tsx, the transport + session-status guard
    // for the CekSiswaModal conversion. That file had NO test at all before, so the
    // conversion would otherwise have been unverified at the wire. Measured with a
    // real discover run: 248 + 87 + 13 + 45 + 5 + 19 = 417, cross-checked against
    // `git ls-files --cached --others --exclude-standard` filtered by includePath()
    // — also 417. The identical +1 is recorded in discover.test.ts (count('tsx')).
    // 417 -> 425 (2026-09-17, dashboard Stage 1): +8. MEASURED with a real
    // discover run: 250 + 87 + 13 + 51 + 5 + 19 = 425. The +2 ts is
    // src/lib/profileProgress.ts and its test; the +6 mjs are the e2e
    // measurement probes. My first attempt at these numbers was 429 with
    // mjs=54/js=20 — WRONG, because I derived them from a shell `git ls-files`
    // count instead of from includePath(). `indexer/src/count-indexed.test.ts`
    // exists so this can be read off rather than guessed. This assertion must
    // stay in lockstep with `files.length` in discover.test.ts — they are two
    // views of one number, and the checksum test there is what proves the six
    // per-language counts really sum to it.
    // 425 -> 426 (2026-09-18): +1 ts. The "+8 to 425" entry above was DERIVED
    // from a base that was already stale, and this is the phantom it hid:
    // netlify/functions/_lib/db/candidates.test.ts was added after e354e35 and
    // its +1 was never recorded, so HEAD has been asserting 415 while its own
    // tree measures 416. Verified by extracting HEAD and running a real discover
    // over it (ts=248, tsx=86, astro=12, mjs=46, cjs=5, js=19 = 416) and by
    // `git diff --diff-filter=AD --name-status e354e35 HEAD -- '*.ts'`, which
    // names that one path. Side note, same class: the chain above narrates
    // mjs=45 at the 417 step while HEAD asserts 46 — the endpoint (51) is
    // measured and correct, the intermediate is not. MEASURED 2026-09-18:
    // 251 + 87 + 13 + 51 + 5 + 19 = 426.
    // 426 -> 427 (2026-09-18): +1 mjs — scripts/ci/with-timeout.mjs, the
    // wall-clock watchdog that gives a run a maximum duration and kills the
    // process tree past it. `includePath()` counts scripts/** as mjs/cjs/js, so
    // a new gate script is a counted file; that is why the ratchet moves for
    // tooling rather than for product code. Measured 2026-09-18:
    // 251 + 87 + 13 + 52 + 5 + 19 = 427. Same three assertions move together —
    // this fileCount, count('mjs') and files.length in discover.test.ts.
    // 427 -> 428 (2026-09-18): +1 ts — netlify/functions/contexts/ingestion/
    // service.test.ts, the suite that pins the xlsx READ path after xlsx was
    // re-pinned to the vendor's patched build (docs/CICD.md). Measured 2026-09-18
    // with `indexer/src/count-indexed.test.ts`:
    // 252 + 87 + 13 + 52 + 5 + 19 = 428. The same three assertions move together
    // again — this fileCount, count('ts') and files.length in discover.test.ts.
    // 428 -> 430 (2026-09-18, same day): +2 ts — the two wire-payload contract
    // suites, netlify/functions/surfaces/auth.wire-payload.test.ts (5154c15) and
    // netlify/functions/_lib/ai/chat.payload-contract.test.ts (e6e5f13). Both
    // commits added their suite and bumped none of the three assertions, so the
    // ratchet was red at HEAD from that moment. See the set-difference
    // cross-check at count('ts') in discover.test.ts.
    // MEASURED 2026-09-18 after the bump: 254 + 87 + 13 + 52 + 5 + 19 = 430.
    // 430 -> 431 (2026-09-18, later): +1 mjs — scripts/ci/fetch-boundary.mjs, the
    // fetch-boundary gate (no raw fetch() bypassing apiClient in src/). Measured
    // unit is exactly 1: the other five buckets are unchanged. Its .sh battery is
    // not counted (includePath() takes mjs/cjs/js under scripts/). Same three
    // assertions move together again — this fileCount, count('mjs') and
    // files.length in discover.test.ts.
    // MEASURED after the bump: 254 + 87 + 13 + 51 + 5 + 19 = 429.
    // 2026-09-18 (orphan cleanup): -2 mjs — e2e/verify-progress-live.mjs and
    // e2e/verify-stage1.mjs deleted, neither ever wired to a workflow or npm
    // script. MEASURED with indexer/src/count-indexed.test.ts, not derived:
    // 254 + 87 + 13 + 51 + 5 + 19 = 429, and the other five buckets are
    // unchanged, so this is two deletions and not a shifted tree.
    //
    // CORRECTION (2026-09-19): the `mjs = 51` above was never true. Measured
    // against `git ls-tree -r HEAD` with the same includePath() rules, HEAD
    // holds 52 mjs, so fileCount at HEAD was 430 — this assertion was already
    // red before this session, exactly the "the frozen numbers were simply
    // never updated" case the discover.test.ts note describes. Verified by set
    // difference: the mjs set at HEAD and in the working tree are identical.
    //
    // 429/430 -> 432 (2026-09-19): +2 ts — src/lib/aiCvPairs.ts and its suite
    // aiCvPairs.test.ts (see count('ts') in discover.test.ts). MEASURED:
    // 256 + 87 + 13 + 52 + 5 + 19 = 432.
    //
    // 432 -> 434 (2026-09-19, same day): +2 ts — src/lib/cvRows.ts and its
    // suite cvRows.test.ts, which hold the school-level ordering rules the AI
    // CV form now enforces. MEASURED, not arithmetic-on-trust: this file went
    // red at 434/258 before the numbers below were touched, and the delta is
    // +2 in both, matching the two files added. (The three assertions in this
    // ratchet move together — fileCount here, count('ts') and files.length in
    // discover.test.ts — so all three were updated in one commit.)
    // 434 -> 436 (2026-09-19, same day): +2 ts — src/lib/cvPeriod.ts and its
    // suite, the month+year period rules. Same evidence: red at 436/260 first.
    // 436 -> 437 (2026-09-19, later the same day): +1 mjs — scripts/memory-archive.mjs,
    // the memory budget/rotation gate. Observed red at 437 before the number was
    // touched, and the delta is +1 in the total and +1 in mjs only, matching the
    // one counted file this commit adds (its sibling is a .sh, which includePath
    // never counts). Same three assertions as always — this fileCount, count('mjs')
    // and files.length in discover.test.ts.
    // 437 -> 442 (2026-09-19, landing page L0/L1): +2 ts +3 astro — the
    // publicSections module and its suite, plus Section/SectionTitle/Card. Same
    // three assertions as always: this fileCount, count('ts') and count('astro')
    // in discover.test.ts, and files.length there. MEASURED with
    // indexer/src/count-indexed.test.ts after the change rather than derived:
    // 262 ts + 87 tsx + 16 astro + 53 mjs + 5 cjs + 19 js = 442.
    // 442 -> 443 (2026-09-19, landing page L2): +1 astro — the closing CTA band.
    // MEASURED: 262 ts + 87 tsx + 17 astro + 53 mjs + 5 cjs + 19 js = 443.
    // 443 -> 450 (2026-09-19, landing page L3): +2 ts +4 tsx -3 astro —
    // companyProfile.ts and accentClass.ts; the four list primitives as `.tsx`; and
    // the three `.astro` primitives they replaced, because iterating inside an
    // `.astro` template is reported as an unresolved global by this indexer (see the
    // count('astro') note in discover.test.ts). Same three assertions as always: this
    // fileCount, count('ts')/count('tsx')/count('astro') in discover.test.ts, and
    // files.length there. MEASURED with indexer/src/count-indexed.test.ts:
    // 265 ts + 91 tsx + 18 astro + 53 mjs + 5 cjs + 19 js = 450.
    // 450 -> 451 (2026-09-19, landing page L4): +1 astro — SiteNav.astro, the desktop
    // section navigation. Same three assertions as always: this fileCount,
    // count('astro') in discover.test.ts, and files.length there. MEASURED with
    // indexer/src/count-indexed.test.ts: 265 ts + 91 tsx + 18 astro + 53 mjs + 5 cjs + 19 js = 451.
    // 451 -> 452 (2026-09-19, landing page L3): +1 tsx — PersonGrid.tsx, the team
    // grid. Same reason as the L4 bump above: the primitive iterates, and iterating
    // inside an `.astro` template is reported as an unresolved global by this
    // indexer. MEASURED with indexer/src/count-indexed.test.ts:
    // 265 ts + 92 tsx + 18 astro + 53 mjs + 5 cjs + 19 js = 452.
    // 452 -> 458 (2026-09-19, landing page R4 + R2 and the evidence tooling):
    // +1 tsx — JobMiniList.tsx, the R2 mini list (a primitive again, because
    // iterating inside an `.astro` template is reported as an unresolved global
    // by this indexer); +1 ts — JobMiniList.test.ts; +1 ts — src/lib/i18n-jp.ts
    // is pre-existing, so the third ts is NOT traced to a single file and is
    // left as measured rather than guessed; +3 mjs — e2e/shot-landing.mjs,
    // e2e/measure-mini-rows.mjs and e2e/measure-hero.mjs, the screenshot and
    // tap-target evidence tools.
    // MEASURED: 266 ts + 93 tsx + 18 astro + 57 mjs + 5 cjs + 19 js = 458.
    //
    // 458 -> 462 (2026-09-19, hero stat-strip fix): +4 mjs, and this one is pure
    // arithmetic with no mystery in it — e2e/measure-hero-stats.mjs,
    // measure-hero-contrast.mjs, measure-hero-eyebrow.mjs and measure-marquee.mjs,
    // the evidence tools written to test the three visual defects claimed after
    // reviewing the screenshots. count('mjs') in discover.test.ts and
    // files.length there moved by the same +4, which is the cross-check.
    //
    // CORRECTION to the note that used to sit here: it said a temporary probe
    // under indexer/src/ would be counted by this walker and "inflate the very
    // ratchet it measures". That is FALSE, and it was disproved rather than
    // argued — `includePath()` (indexer/src/util.ts) allowlists DIRECTORIES
    // (src/, netlify/functions/, shared/, scripts/, e2e/, repo root) and
    // `indexer/` is not one of them, so nothing there is ever discovered. Proof:
    // dropping indexer/src/zz-tmp-proof.ts into the tree left the scratch-file
    // guard GREEN. Measurements taken with such a probe were therefore sound.
    // MEASURED: 266 ts + 93 tsx + 18 astro + 61 mjs + 5 cjs + 19 js = 462.
    //
    // 462 -> 464 (2026-09-19, the SiteNav gate): +2 mjs — e2e/test-site-nav.mjs
    // and e2e/measure-site-nav.mjs. Not arithmetic-on-trust: the two assertions
    // failed at exactly +2 (464 vs 462 here, 63 vs 61 in discover.test.ts) before
    // the numbers below were updated, and both moved by the same amount, which is
    // the cross-check. The gate exists because SiteNav.astro is ~170 lines of
    // load-bearing behaviour that had ZERO e2e coverage.
    // MEASURED: 266 ts + 93 tsx + 18 astro + 63 mjs + 5 cjs + 19 js = 464.
    //
    // 464 -> 468 (2026-09-19, the #galeri section): +4 — src/lib/gallery.ts and
    // its test (+2 ts), src/components/public/GalleryGrid.tsx (+1 tsx), and
    // e2e/measure-galeri.mjs (+1 mjs). NOT taken on trust: the three assertions
    // failed at exactly these deltas first (468 vs 464 here; 268 vs 266 and 94 vs
    // 93 in discover.test.ts), and the predicted sum
    // 268 + 94 + 18 + 64 + 5 + 19 = 468 matched the measured 468, which is the
    // check that nothing else slipped in alongside them.
    // MEASURED: 268 ts + 94 tsx + 18 astro + 64 mjs + 5 cjs + 19 js = 468.
    //
    // 468 -> 469 (2026-09-19, the Aa-chan mascot): +1 — `src/components/ui/Mascot.tsx`.
    // No stylesheet is counted here (CSS is not one of the six buckets), so
    // `motion.css` moving does not appear in this number even though it changed in
    // the same commit. NOT taken on trust: `discover.test.ts` failed first at
    // `expected 95 to be 94`, the predicted sum 268 + 95 + 18 + 64 + 5 + 19 = 469
    // matched the measured 469, and a temporary probe that listed all 95 discovered
    // `.tsx` paths confirmed `Mascot.tsx` was the only addition.
    // MEASURED: 268 ts + 95 tsx + 18 astro + 64 mjs + 5 cjs + 19 js = 469.
    //
    // 469 -> 471 (2026-09-20, the Aa-chan evidence tools): +2 mjs —
    // `e2e/measure-mascot.mjs` and `e2e/shot-mascot.mjs`. Same +2 as `count('mjs')`
    // and `files.length` in discover.test.ts, so all three counters still agree;
    // MEASURED: 268 ts + 95 tsx + 18 astro + 66 mjs + 5 cjs + 19 js = 471.
    // CORRECTION (2026-09-20, the R11 pass): 474 was read off the WORKING TREE
    // and is WRONG for HEAD. This assertion and the four in discover.test.ts
    // froze together from the same dirty tree, which made them look mutually
    // corroborating while all five were wrong in the same direction — see the
    // count('ts') note in discover.test.ts for the failure class.
    //
    // MEASURED at HEAD with a temporary probe inside a detached worktree at
    // HEAD, not derived and not counted by hand: fileCount = 419, which equals
    // r.files.length (asserted on the next line) and equals the language sum
    // 249 + 86 + 14 + 47 + 5 + 19 = 420 minus one file the walker defers.
    // That one-file difference is a pre-existing property of buildIndex()'s
    // population, not something this pass introduced; the two assertions that
    // actually gate it are this one and the equality below.
    // 419 -> 422 (2026-09-20, later the same session): +3 — the three modules
    // the R11 pass found absent from HEAD while my Button adoption imported
    // them: src/components/public/Section.astro, src/components/public/Card.astro
    // and src/lib/companyProfile.ts. Same three files that removed the last two
    // `resolve.test.ts` failures; this assertion and the four in
    // discover.test.ts then moved by the measured amounts (ts +1, astro +2).
    // 422 -> 476 (2026-09-20, the backlog commit): +54 files. This is the same
    // +54 as `files.length` in discover.test.ts, and the two MUST stay equal —
    // the assertion on the next line is that equality, which is why they are two
    // views of one number and never derived from each other.
    // MEASURED with a probe inside the tree the tests run on: fileCount = 476 =
    // files.length, with the language buckets summing 269 + 95 + 19 + 69 + 5 + 19
    // = 476. The R11 pass's two-number caveat is over: HEAD and the working tree
    // now hold one set.
    // 485 -> 486 (2026-09-20, the i18n keys pass): +1, and the ONLY file this
    // pass added was `indexer/src/zz-probe.test.ts` — a throwaway probe used to
    // MEASURE the astro bucket instead of deriving it (R1a). It was deleted
    // before the pass ended. The attribution below is what the deletion
    // OBSERVED, not what was assumed: after the probe was gone the number stayed
    // at 486, so the +1 is NOT the probe and the probe's transient contribution
    // was offset by a file removed in the same pass. A number that does not move
    // when its supposed cause is removed has not been attributed.
    // The real composition, from `count-indexed.test.ts` after the pass:
    // 271 ts + 98 tsx + 21 astro + 72 mjs + 5 cjs + 19 js = 486.
    // The astro bucket is the interesting one and it needed its own proof: the
    // set difference of `.astro` paths between HEAD and the working tree is
    // EMPTY, so `count('astro')`'s old value of 20 was a STALE BASELINE, not a
    // change this pass made — see the note on it in discover.test.ts.
    // 486 -> 487 (2026-09-20, same pass, LATE): +1 for
    // `e2e/measure-theme-landing.mjs`, the browser tool written to prove the
    // light default actually renders and to catch the hero-contrast defect below
    // it. This is R15 §3h's corollary in action: adding a file MID-TASK re-shifts
    // counts already measured earlier in that task, so this number was taken
    // again at the END with count-indexed.test.ts rather than carried forward.
    // 487 -> 488 (2026-09-20, later the same day): +1 for
    // `e2e/test-theme-gradients.mjs`, the browser gate written after comparing
    // the running preview against the design mockup. It measures whether the
    // light-mode shim actually REACHES a computed gradient value — the defect it
    // guards was a shim rule that existed and did not match, so a source-text
    // check would have asserted the wrong thing.
    //
    // ATTRIBUTION, since a moving count must be explained by NAME and not by
    // arithmetic: exactly ONE tracked file was added since the previous
    // measurement (`git diff --name-status`) — that gate, +1 mjs. A second
    // `.mjs` written in the same task (`e2e/shot-compare.mjs`, an evidence-only
    // screenshot tool) was DELETED rather than counted, so it contributes 0 and
    // the net is +1, not +2. It had already been rejected once by the lint
    // ratchet for the same reason: an evidence tool that nothing depends on is
    // not worth a frozen-inventory slot.
    // 488 -> 490 (2026-09-20, mascot slice): +2, in TWO buckets — which is the
    // point. The slice ships `src/components/public/PrincessMascot.astro`
    // (renders the 3D-sourced mascot as a static picture, +1 astro) AND
    // `src/components/public/PrincessMascot.test.ts` (its gate, +1 ts). My
    // first pass bumped only the astro bucket and wrote "+1", because I read
    // the slice as an `.astro` addition and forgot its test file is indexed
    // like any other `.ts` under src/. A count attributed to ONE cause while
    // the change has TWO is exactly the failure R15 exists to catch, so the
    // correction is recorded here rather than silently applied.
    // MEASURED final state for 2026-09-21 (contact slice + the HistoryTimeline
    // and ContactForm extractions): 276 ts + 101 tsx + 22 astro + 75 mjs + 5 cjs
    // + 20 js = 499. The +8 over 491 decomposes as:
    //   +1 js   netlify/functions/kontak.js          — new narrow entry point
    //   +2 ts   contexts/contact/repository.ts and contexts/contact/service.ts
    //   +1 ts   contexts/contact/index.ts            — the new context barrel
    //   +3 tsx  HistoryTimeline.tsx, HistoryTimeline.test.tsx, ContactForm.tsx
    //   +3 ts   the earlier-session test files committed in the same commit:
    //           _lib/ai/chat.payload-contract.test.ts, _lib/db/candidates.test.ts,
    //           contexts/ingestion/service.test.ts
    // and that is 10, not 8 — because TWO of those three foreign files are
    // `.test.ts` and ONE is a different suffix, which is the bucket note below.
    // ── THE BUCKET NOTE, because this is exactly where the first version of
    //    this comment went wrong. The SUFFIX decides the bucket, not the role:
    //       .test.ts -> ts        .test.tsx -> tsx
    //    The first version derived `99 tsx` from "one component = +1" and was
    //    wrong twice over: HistoryTimeline.test.tsx is a tsx file, and so is the
    //    third foreign suite. The measured tsx value is 101, and it was read off
    //    `count-indexed.test.ts` rather than reasoned about. Writing the number
    //    down before measuring is what produced the error; the tool is what
    //    caught it, which is why it exists.
    // The sum is the measured fact; the per-file list above is the explanation,
    // kept per file so the next reader can re-derive rather than trust it.
    // MEASURED, not derived: `count-indexed.test.ts` prints the buckets.
    // 503 -> 501 (2026-09-24, company-profile reframe): -3 files — the three
    // `#loker-ringkas` files deleted from `/` (`JobMiniList.tsx` -1 tsx,
    // `JobMiniList.test.ts` -1 ts, `e2e/measure-mini-rows.mjs` -1 mjs). Same
    // three deltas as count('ts')/count('tsx')/count('mjs') and files.length in
    // discover.test.ts.
    // NOTE the literal here was 503 while the tree already measured 504 — this
    // assertion had been ONE BEHIND (its trailing sum counted tsx as 102 when
    // discover.test.ts and the tool both read 103). It is a stale baseline, not
    // this session's drift; the reframe re-anchors it to the MEASURED value, so
    // this and discover.test.ts's files.length now both read 501.
    // MEASURED with count-indexed.test.ts, NOT derived: 276 + 102 + 22 + 75 + 6
    // + 20 = 501.
    // 501 -> 499 (2026-09-24, company-profile reframe): -2 files — the princess
    // mascot's `PrincessMascot.astro` (-1 astro) and `PrincessMascot.test.ts`
    // (-1 ts). Same two deltas as count('astro')/count('ts') and files.length in
    // discover.test.ts. MEASURED, not derived: 275 + 102 + 21 + 75 + 6 + 20 =
    // 499.
    // 499 -> 498 (2026-09-24, company-profile reframe): -1 file —
    // `src/components/ui/Mascot.tsx` (-1 tsx), deleted once its last three
    // consumers (`404.astro`, `LoginModal.tsx`, `StepGuide.tsx`) were rewired to
    // sprite icons. Same single delta as count('tsx') and files.length in
    // discover.test.ts. The 20 `public/mascot/*` renders deleted in the same
    // commit are images and move no bucket. MEASURED with count-indexed.test.ts,
    // NOT derived: 275 + 101 + 21 + 75 + 6 + 20 = 498.
    // 498 -> 495 (2026-09-24, company-profile reframe): -3 files — the mascot's
    // gate and its two evidence tools (`e2e/test-mascot-motion.mjs`,
    // `e2e/measure-mascot.mjs`, `e2e/shot-mascot.mjs`). Same -3 as count('mjs')
    // and files.length in discover.test.ts; the battery `.sh` deleted with them
    // is outside every bucket. MEASURED with count-indexed.test.ts, NOT derived:
    // 275 + 101 + 21 + 72 + 6 + 20 = 495.
    expect(r.stats.fileCount).toBe(499); // 276 ts + 102 tsx + 22 astro + 75 mjs + 6 cjs + 20 js = 501, MEASURED with count-indexed.test.ts. 499 -> 500 (2026-09-21): +1 for ContactForm.test.tsx, the suite the island should have shipped with. It lands in the tsx bucket because the SUFFIX decides the bucket and `.test.tsx` ends in `.tsx`. 500 -> 503 (2026-09-22): +1 ts for indexer/src/count-indexed.test.ts (the measurement tool), +1 mjs for scripts/ci/verify-workflows.mjs, +1 cjs for scripts/ci/kf-mutate.cjs — three files this session's gate work added. The three bucket deltas are each exactly +1, which is what attributes them; `tsx` stayed at 102. Re-measured at the END with count-indexed.test.ts rather than reasoned about. -3 (2026-09-25): the band below the hero on `/` was deleted by owner ruling, taking SiteNav.astro (-1 astro) plus its e2e gate and evidence tool (-2 mjs). The three counters that describe the tree — this one, `count('astro')`/`count('mjs')` and `files.length` in discover.test.ts — all moved by exactly the same -3, and the two buckets that lost files moved by exactly -1 and -2. MEASURED at the END with count-indexed.test.ts: 277 ts + 101 tsx + 20 astro + 70 mjs + 6 cjs + 20 js = 494. +3 (2026-09-26): the "Papan Tugas Tim" board and the Agenda card left the admin dashboard header for two sidebar tabs — TabTugas.tsx (+1 tsx), TabAgenda.tsx (+1 tsx) and store/adminTasks.ts (+1 ts). Same +3 as `count('ts')`/`count('tsx')`/`files.length` in discover.test.ts, which is the cross-check. MEASURED at the END with count-indexed.test.ts: 279 ts + 104 tsx + 20 astro + 70 mjs + 6 cjs + 20 js = 499.
    expect(r.stats.fileCount).toBe(r.files.length);
  });

  it('produces a symbol population in the Phase-4 envelope (9k+)', () => {
    // Phase 4's parse upgrades (destructured params, catch params, for-loop
    // declarations, import bindings) pushed the population to ~9.3k.
    const r = built();
    expect(r.stats.symbolCount).toBeGreaterThanOrEqual(8500);
    // was 10500; 11906 measured 2026-09-05; 13025 measured 2026-09-11 after the
    // Phase A CI gates landed in scripts/ci/; 13688 measured the same day after
    // the 11 catch-all stubs were removed and Phase C's health module and its
    // tests landed. The envelope tracks the tree; it is a canary against a
    // silent parse collapse, not a budget. 14250 measured 2026-09-12 after the
    // functions migration; the envelope keeps the same ~500-symbol headroom the
    // previous one used. 14763 measured 2026-09-13 after the owner-approved
    // items 1 & 5 added two test suites (contexts/identity/admin-personal,
    // contexts/notifications/wa-single-durability): 14750 -> 15250 keeps the
    // same ~500-symbol headroom. 15459 measured 2026-09-13 (evening), after the
    // stale-ratchet batch of 13 files landed: 15250 -> 16000 keeps that headroom.
    // 16084 measured 2026-09-14 after the §6 VIP work (src/lib/vip.ts + its test,
    // CandidateDash.test.tsx, AiCvForm guard, TabPelamar badge): 16000 -> 16500.
    // 16575 measured 2026-09-14 (UI review round 2), which blew the 16500 ceiling
    // and is itself the finding: the extra ~490 symbols are NOT from that
    // session's work (it added one small component test and two comment blocks).
    // They ride in on the 13 `mjs` files the count ratchet above had stopped
    // tracking — see the reconciliation note there. Ceiling raised to 17050 to
    // keep the same ~500 headroom. If a future bump is needed without a matching
    // file-count bump, suspect a parse change, not new code.
    //
    // CORRECTION (2026-09-14, round 3): there was no 13-file population. Those
    // were scratch files, so the ~490 "extra" symbols were never real either.
    // Re-measured on a clean tree: 16399. That is +1 file's worth of symbols
    // over the pre-round-2 figure, consistent with the single new component test.
    // Ceiling set to 16900, preserving the ~500 headroom the envelope uses.
    // NOTE: 16500 was the LAST correct ceiling; 17050 was a bump chasing a
    // phantom. If this ever needs raising without a matching fileCount bump,
    // suspect a parse change (or a stray scratch file) rather than new code.
    // RE-BASELINED 2026-09-15 (review round): 17317 measured after the same
    // +11-file accumulation described above. 17317 + ~500 = 17900, keeping the
    // envelope's established headroom. Per the standing instruction in this
    // comment, a future bump with NO matching fileCount bump means a parse
    // change (or a stray scratch file), not new code.
    // 17900 -> 18400 (2026-09-16): measured 17922 after `TabTambah.test.tsx`
    // landed. Worth recording WHY the bump is large relative to the +1 file: the
    // previous ceiling was sitting essentially ON the previous measurement, i.e.
    // with none of the ~500 headroom this envelope is supposed to keep — so a
    // single new test file was enough to trip it. The convention is
    // measured + ~500, so 18400. The file-count bump above is the matching
    // evidence that this is new code and not a parse change.
    // 18400 -> 18900 (2026-09-17, later): measured 18415 after
    // `scripts/ci/verify-workflows.mjs` landed — the gate for the workflow files
    // as GitHub reads them. The fileCount bump above is the matching evidence
    // that this is new code and not a parse change: +1 mjs, and the +15 symbols
    // are that file's exported helpers and their comments. Per the standing
    // instruction in this block, a future bump with NO matching fileCount bump
    // means a parse change (or a stray scratch file), not new code.
    // 18900 -> 19500 (2026-09-18): measured 18974 on this tree. The matching
    // fileCount evidence is the same +2 ts as above (the auth wire-payload and
    // AI chat payload-contract suites), so this is new code, not a parse change
    // or a stray scratch file. The bump is larger than the +2 files alone
    // because the ceiling had gone stale across several landed fixes; per the
    // convention this envelope keeps, 18974 + ~500 = 19500. Note it was already
    // 74 OVER the old 18900 — the prior measurement (18415) predates those fixes.
    //
    // 19500 -> 20100 (2026-09-19): measured 19575 on this tree, following the
    // measured + ~500 convention. The matching fileCount evidence is the +4 ts
    // above (cvRows.ts/.test.ts and cvPeriod.ts/.test.ts, the AI CV ordering and
    // period rules). But the bump deserves the same scrutiny every previous
    // entry in this block got, and the honest finding is that the CEILING WAS
    // ALREADY EXHAUSTED, not that those four files are large:
    //
    //   measured in a detached worktree at 8b7a824 (before any of this work):
    //     432 files, 19463 symbols   ->  only 37 below the 19500 ceiling
    //   measured on this tree:
    //     436 files, 19575 symbols
    //
    // So the four new files account for 112 symbols (19575 - 19463), and the
    // ceiling tripped because it had 37 of headroom instead of the ~500 the
    // convention calls for. This is the third time this block has recorded the
    // same shape of staleness — a ceiling set to "measured + 500" while the
    // measurement it used was already old. The +4 fileCount bump is the
    // matching evidence that this is new code and not a parse change; per the
    // standing instruction above, a future bump with NO matching fileCount bump
    // means a parse change (or a stray scratch file), not new code.
    //
    // 20100 -> 20900 (2026-09-19, landing page R4 + R2 and the evidence tooling):
    // measured 20384 on this tree, following the measured + ~500 convention
    // (20384 + 500 = 20884, rounded up to 20900).
    // The matching fileCount evidence is the 452 -> 458 bump above (+1 tsx
    // JobMiniList.tsx, +1 ts JobMiniList.test.ts, +3 mjs evidence tools, plus one
    // ts left as measured rather than guessed). Honest note: 20384 was 284 OVER
    // the old 20100 ceiling, so as with every previous entry in this block the
    // trip is at least partly staleness of the previous measurement, not purely
    // the size of the new files. I did NOT measure the pre-change symbol count on
    // this tree, so I am not claiming how much of the 284 is new code. Per the
    // standing instruction above, a future bump with NO matching fileCount bump
    // means a parse change (or a stray scratch file), not new code.
    // 20900 -> 21500 (2026-09-20, the backlog commit): measured 20939 on this
    // tree, following the measured + ~500 convention (20939 + 500 = 21439,
    // rounded up to 21500).
    // The matching fileCount evidence is the 422 -> 476 bump above (+54 files),
    // which is what tells us this is new code and not a parse change — the
    // standing instruction in this block.
    // Honest note, same shape as every previous entry: 20939 is 39 OVER the old
    // 20900 ceiling, so the trip is at least partly staleness rather than purely
    // the size of the new files. The +54 files account for it being only just
    // over: the landing-page and evidence-tool batch that was uncommitted during
    // the R11 pass is now in the index, and 39 symbols over a 54-file addition is
    // a very small per-file average (tools and tests, not dense code).
    // A future bump with NO matching fileCount bump means a parse change (or a
    // stray scratch file), not new code.
    // 21500 -> 22100 (2026-09-21, L8.4): measured 21531 on this tree, following
    // the measured + ~500 convention (21531 + 500 = 22031, rounded up to 22100).
    //
    // THE STANDING INSTRUCTION IS SATISFIED DIFFERENTLY HERE, and that is worth
    // stating rather than glossing. Every prior bump in this block came with a
    // fileCount bump, and fileCount is what distinguished new code from a parse
    // change. This one has NO fileCount movement — it is still 491 — because the
    // change adds symbols INSIDE an existing file. So the fileCount cross-check
    // cannot carry the attribution this time, and the third possibility the
    // instruction names (a stray scratch file) had to be ruled out another way.
    //
    // Measured, not argued: with `e2e/test-landing.mjs` reset to the previous
    // revision the CLI reports 21510 symbols; at this revision it reports 21531.
    // The delta is +21, and it is traced to specific declarations rather than
    // inferred from a diff size: HERO_STATS_EXPECTED, its 3 object literals, the
    // `wantStats` destructured parameter, the statLabels/heroStats/leaf/tile/
    // valueEl bindings in the page.evaluate callback, the new test callback and
    // its inner problems/foundTiles/actual bindings. Nothing here is a scratch
    // file: the indexer is .gitignore-aware and `.tmp-*` is ignored, which was
    // verified by leaving three `.tmp-*` logs in the tree during the measurement
    // and observing the count unchanged.
    //
    // Honest note, same shape as every previous entry: 21531 is 31 OVER the old
    // 21500 ceiling, and 21510 was ALREADY 10 over before this change. So the
    // trip is mostly staleness of the previous measurement (10 of the 31), not
    // this change. The remaining 21 is a real addition of ~21 symbols across
    // ~115 added lines of gate code — a small per-line average, consistent with
    // assertions and object literals rather than dense logic.
    expect(r.stats.symbolCount).toBeLessThanOrEqual(22100);
    expect(r.stats.symbolCount).toBe(r.symbols.length);
  });

  it('reports occurrences, unresolved, and stage timings', () => {
    const r = built();
    expect(r.stats.referenceCount).toBeGreaterThan(20000); // bound references
    // Unresolved bucket (Phase 4): lib globals are tagged lib-not-loaded and
    // the lib tier graduates the whole bucket to libRefs — the residual is
    // exactly zero (CJS module-wrapper vars + the Astro global graduate via
    // canonical framework entries); global-unknowns are zero (the five genuine
    // dangling refs got fixed, §13).
    // Two known indexer gaps, both TEST-FILE-ONLY as of 2026-09-05:
    //   (a) shorthand property assignments that reference lib globals —
    //       `{ console, process }` in the share-data handler test (moved
    //       2026-09-11 from netlify/functions/share-data.test.ts to
    //       e2e/share-data.test.ts — same file, same lines 44-45; it left the
    //       functions dir because Netlify bundled it as a deployable function
    //       and died on `Could not resolve "vitest"`)
    //   (b) ambient lib types used in test doubles — RequestInit (x3) and
    //       CanvasRenderingContext2D in *.test.tsx mocks
    // The production guarantee therefore stays strict (zero): no unresolved
    // reference may originate outside a test file. Collapse this back to
    // `unresolvedRefs.length === 0` once the indexer closes both gaps.
    const pathOf = (u: { fileIdx: number }) => r.files[u.fileIdx].path;
    const isTestFile = (u: { fileIdx: number }) => /\.test\.(ts|tsx)$/.test(pathOf(u));
    const siteOf = (u: { fileIdx: number; range: { startLine: number }; name: string }) =>
      `${pathOf(u)}:${u.range.startLine} ${u.name}`;
    const prodLib = r.unresolvedRefs.filter((u) => u.reason === 'lib-not-loaded' && !isTestFile(u));
    const prodGenuine = r.unresolvedRefs.filter((u) => u.reason === 'global-unknown' && !isTestFile(u));
    expect(prodLib.map(siteOf)).toEqual([]);
    expect(r.libRefs.length).toBeGreaterThan(1000);
    expect(r.stats.libRefCount).toBe(r.libRefs.length);
    expect(prodGenuine.map(siteOf)).toEqual([]);
    // unresolvedCount additionally includes the graph-level unresolveds from
    // the resolve stage: bound.unresolved.length + graph.unresolved.length
    // (build.ts:219).
    //
    // CORRECTION (2026-09-20, the R11 pass): the literal "+ 2" below was a
    // hardcoded stand-in for graph.unresolved.length and it had gone stale.
    // The assertion is not really about the number 2 — it is the invariant that
    // unresolvedCount accounts for BOTH buckets — so it is now written against
    // graph.unresolved.length directly. That makes the assertion express what
    // it means instead of freezing a count that silently drifts.
    //
    // MEASURED at HEAD by probe: bound.unresolved = 26, graph.unresolved = 5,
    // unresolvedCount = 31. The 5 graph unresolveds, in full, are:
    //   module-not-found:./Section.astro          <- from ClosingBand.astro
    //   module-not-found:./Card.astro             <- from ClosingBand.astro
    //   module-not-found:../../lib/companyProfile <- from LayananSection.astro
    //   remote-specifier:firebase-app-compat.js   <- fcm.ts (the known pair)
    //   remote-specifier:firebase-messaging-compat.js
    // The three module-not-found entries are THIS SESSION'S OWN DANGLE and are
    // an R11a defect the pass caught: my Button adoption edited ClosingBand.astro
    // and LayananSection.astro to import Section.astro / Card.astro /
    // companyProfile, but those three modules are not in HEAD, so at HEAD the
    // imports resolve to nothing. They resolve on my working tree, which is
    // exactly why the local run stayed green and HEAD did not.
    // THE LESSON, and the reason this is worth the space: a gate anchored to a
    // dirty tree does not merely report a wrong NUMBER, it can hide a real
    // dependency defect — here, files that are imported but never committed.
    expect(r.stats.unresolvedCount).toBe(r.unresolvedRefs.length + r.graph.unresolved.length);
    // 26 -> 28 (2026-09-20, the backlog commit): +2 bound-tier unresolveds, both
    // from the newly committed files. Probe-measured = 28.
    //
    // AND NOTE WHAT DID *NOT* MOVE: graph.unresolved is back to exactly 2 — the
    // known fcm.ts remote pair — because the three `module-not-found` entries
    // this pass found (Section.astro, Card.astro, lib/companyProfile) were fixed
    // by committing those modules in 86d215e and are still resolved here. That is
    // the check that the R11 fix was real rather than papered over: the count went
    // 5 -> 2 and stayed there once the imports had something to point at.
    // 28 -> 30 (2026-09-20, the JapanTexture band): +2 bound-tier unresolveds,
    // both `RegExpMatchArray` in `JapanTexture.test.ts` — the TS lib global the
    // indexer cannot bind, exactly like the 3 already in `button.test.ts`. They
    // are the same accepted category, not a new defect class; probe-measured.
    //
    // 30 -> 32 (2026-09-20, the StepGuide slice): +2 bound-tier unresolveds, and
    // it is worth writing down HOW this was attributed rather than assumed. The
    // number moved after three new files and a BaseLayout edit, so the harmless
    // explanation ("a couple more globals") and the dangerous one ("my `.astro`
    // script added template-component refs") look identical from the count alone.
    // Measured instead: a probe filtered unresolvedRefs for every file this slice
    // touched and found ZERO, and `graph.unresolved` stayed at exactly 2. Then a
    // detached worktree at HEAD was measured for comparison — 30 refs, with
    // `RegExpMatchArray` at 5 — against 7 in the working tree. The two new ones
    // are on lines 39 and 156 of `StepGuide.test.ts`, the same TS lib global as
    // the 4 already accepted here. So: same category, no new class.
    //
    // ⚠ AND NOTE WHAT THIS PASS ACTUALLY CAUGHT. This number once read 30 while
    // `graph.unresolved` read **4**, not 2 — because `JapanTexture.astro` used a
    // generic type annotation in its frontmatter, and the indexer parses
    // angle-bracket syntax as component tags. That is why the BaseLayout reveal
    // script added by this slice carries NO capitalised tag names, in its code
    // OR its comments; the check above is the evidence, not the intention.
    // 32 -> 31 (2026-09-24, company-profile reframe): -1 bound-tier unresolved —
    // `ReadonlySet` on `src/components/ui/Mascot.tsx:142`, the ONLY occurrence of
    // that TS lib global in the whole tree, deleted with the component in Task 4
    // (d265a42). It is the same accepted category as the `RegExpMatchArray`
    // entries above (a lib global the indexer cannot bind), not a new class.
    // ATTRIBUTION, measured not assumed: `graph.unresolved` below still reads
    // exactly 2, so nothing became module-not-found — the delta is a binding,
    // and a whole-tree grep for `ReadonlySet` before the deletion returned that
    // one line. MEASURED with the same build this assertion runs.
    expect(r.unresolvedRefs.length).toBe(31); // bound-tier unresolveds, probe-measured
    expect(r.graph.unresolved.length).toBe(2); // the two remote firebase URLs in fcm.ts, and nothing else
    expect(r.stats.stageMs.discover).toBeGreaterThan(0);
    expect(r.stats.stageMs.parse).toBeGreaterThan(0);
    expect(r.stats.stageMs.resolve).toBeGreaterThan(0);
  });

  it('respects the full-build budget (< 3 s standalone, vitest JIT overhead accounted)', () => {
    // Standalone `idx build` measures ~1 s (measured 2026-09-03); under vitest the
    // same stages take ~3.5 s because the TS sources run through vite's transform.
    //
    // 2026-09-14: this assertion was a periodic false alarm. It measures WALL
    // CLOCK, so when the full suite runs its projects in parallel the indexer
    // shares the CPU and the same code that takes 1650 ms alone reports 5600 ms
    // — a red gate that says "the build got slower" when nothing did. It passed
    // 13/13 standalone and failed only in the combined run. A timing canary that
    // fires under load cannot be trusted, and one that is ignored is worse than
    // none, so the wall-clock bound is now secondary.
    //
    // What this test is ACTUALLY for: catching a silent complexity regression —
    // e.g. an O(n²) resolve step. That shows up as time growing faster than the
    // WORK, so the primary assertion is now a per-file budget (load-independent),
    // and the total is kept as a much looser backstop for the pathological case
    // where the whole machine is saturated.
    const s = built().stats.stageMs;
    const stats = built().stats;
    const total = s.discover + s.parse + s.resolve;
    const msPerFile = total / stats.fileCount;

    // ~11 ms/file measured for the 404-file tree under vitest (≈4 ms standalone).
    // The bound is deliberately loose: it is a shape check, not a speed check.
    expect(msPerFile).toBeLessThan(40);
    // Backstop only — never the signal. Keep it far enough above the observed
    // 5.6 s worst case that CPU contention alone cannot trip it.
    expect(total).toBeLessThan(20000);
  });

  it('is deterministic across builds', () => {
    const a = built();
    const b = buildIndex(ROOT);
    expect(b.files.map((f) => f.path)).toEqual(a.files.map((f) => f.path));
    expect(b.symbols.map((s) => s.id)).toEqual(a.symbols.map((s) => s.id));
    expect(b.stats.symbolCount).toBe(a.stats.symbolCount);
    expect(b.stats.referenceCount).toBe(a.stats.referenceCount);
  });

  it('every file node carries the three hashes and a line index', () => {
    for (const f of built().files) {
      expect(f.hash).toMatch(/^[0-9a-f]{32}$/);
      expect(f.declHash).toMatch(/^[0-9a-f]{32}$/);
      expect(f.exportHash).toMatch(/^[0-9a-f]{32}$/);
      expect(f.lineIndex.length).toBeGreaterThan(0);
    }
  });

  it('poisoned files retain their inventory record', () => {
    const r = built();
    for (const f of r.files) {
      if (f.poisoned) {
        expect(f.poisoned.error).toBeTruthy();
      }
    }
  });
  it('astro template tags resolve through frontmatter imports into Renders module edges (row 8)', () => {
    const r = built();
    const renders = r.graph.edges.filter((e) => e.type === 13 && typeof e.to === 'number');
    expect(renders.length).toBeGreaterThan(0); // 12 astro files render imported components
    const fileIdx = (rel: string): number => r.files.find((f) => f.path === rel)?.idx ?? -1;
    const layout = fileIdx('src/layouts/BaseLayout.astro');
    const footer = fileIdx('src/components/Footer.astro');
    expect(layout).toBeGreaterThanOrEqual(0);
    const layoutRenders = renders.filter((e) => e.from === layout);
    // BaseLayout renders BottomNav/Footer/Toast — each a distinct target file.
    expect(layoutRenders.some((e) => e.to === footer)).toBe(true);
    // specifier carries the tag: <Footer> resolves to the Footer.astro module.
    expect(layoutRenders.some((e) => e.specifier === '<Footer>')).toBe(true);
    // Every real astro template tag is bound by a frontmatter import: no
    // template-component unresolveds on this tree (a tag without an import
    // would be an Astro compile error).
    expect(r.graph.unresolved.filter((u) => u.reason === 'template-component')).toHaveLength(0);
    // deterministic: same render set across builds
    const again = buildIndex(ROOT);
    const renders2 = again.graph.edges.filter((e) => e.type === 13 && typeof e.to === 'number');
    expect(renders2.length).toBe(renders.length);
  });

  it('Astro.glob expansion: zero usage on this tree (row-8 remainder)', () => {
    // No real astro frontmatter calls Astro.glob today, so the expansion
    // adds zero AstroGlob edges and zero astro-glob-no-match unresolveds —
    // the feature is fixture-covered (astroGlob.test.ts), and this guards the
    // real tree against accidental drift.
    const r = built();
    expect(r.graph.edges.filter((e) => e.type === 15 && typeof e.to === 'number')).toHaveLength(0);
    expect(r.graph.unresolved.filter((u) => u.reason === 'astro-glob-no-match')).toHaveLength(0);
  });

});

describe('§6.2 incremental engine — per-file parse reuse (fixture tree)', () => {
  // Three files with cross-file imports (a → b, a → c) so bind/resolve have
  // real work; deep tier off — the watch generation profile §6.2 targets.
  function makeTree(root: string): void {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n', 'utf8');
    writeFileSync(join(root, 'src/a.ts'), "import { greet } from './b';\nimport { tag } from './c';\nexport function run(): string { return greet() + tag; }\n", 'utf8');
    writeFileSync(join(root, 'src/b.ts'), "export function greet(): string { return 'hi'; }\n", 'utf8');
    writeFileSync(join(root, 'src/c.ts'), "export const tag = '!';\n", 'utf8');
  }

  // Content-deterministic whole-document equality: a warm (cache-carrying)
  // build must produce byte-identical output to a cold build of the same tree.
  const coldDoc = (root: string): string => JSON.stringify(dumpDoc(buildIndex(root, { deep: false })));

  it('a warmed cache reuses every unchanged file and reproduces the cold document exactly', () => {
    const root = mkdtempSync(join(tmpdir(), 'idx62-reuse-'));
    makeTree(root);
    const cold = coldDoc(root);
    const cache: ParseReuseCache = new Map();
    const warm1 = buildIndex(root, { deep: false, parseCache: cache }); // fills the cache
    expect(warm1.stats.parseReusedFiles).toBe(0); // nothing to reuse on a cold session
    expect(JSON.stringify(dumpDoc(warm1))).toBe(cold);
    const warm2 = buildIndex(root, { deep: false, parseCache: cache });
    expect(warm2.stats.parseReusedFiles).toBe(3); // every file skipped Stage 2
    expect(JSON.stringify(dumpDoc(warm2))).toBe(cold);
    // Zero-copy sharing across generations stays safe: a third reuse of the
    // very same parse arrays still reproduces the cold document.
    const warm3 = buildIndex(root, { deep: false, parseCache: cache });
    expect(warm3.stats.parseReusedFiles).toBe(3);
    expect(JSON.stringify(dumpDoc(warm3))).toBe(cold);
  });

  it('a single-file body edit re-parses only that file; output equals a cold build', () => {
    const root = mkdtempSync(join(tmpdir(), 'idx62-edit-'));
    makeTree(root);
    const cache: ParseReuseCache = new Map();
    buildIndex(root, { deep: false, parseCache: cache });
    const before = coldDoc(root);
    // Body-only edit: declHash/exportHash change only if the signature/export
    // table does — either way the file must reparse; a.ts and c.ts must not.
    writeFileSync(join(root, 'src/b.ts'), "export function greet(): string { return 'hello there'; }\n", 'utf8');
    const incremental = buildIndex(root, { deep: false, parseCache: cache });
    expect(incremental.stats.parseReusedFiles).toBe(2);
    expect(JSON.stringify(dumpDoc(incremental))).toBe(coldDoc(root)); // == cold build of the edited tree
    expect(JSON.stringify(dumpDoc(incremental))).not.toBe(before); // the edit did land
  });

  it('an identical-content rewrite (editor swap noise) reuses every file', () => {
    const root = mkdtempSync(join(tmpdir(), 'idx62-noise-'));
    makeTree(root);
    const cache: ParseReuseCache = new Map();
    buildIndex(root, { deep: false, parseCache: cache });
    const before = coldDoc(root);
    writeFileSync(join(root, 'src/b.ts'), "export function greet(): string { return 'hi'; }\n", 'utf8'); // same bytes
    const again = buildIndex(root, { deep: false, parseCache: cache });
    expect(again.stats.parseReusedFiles).toBe(3); // hash unchanged → nothing re-parses
    // The only observable difference is the file's mtime (a rewrite bumps it) —
    // drift detection (fileDrift) is hash-based, so content-wise this is a no-op.
    const norm = (doc: { files: Array<{ mtime: number }> }): unknown => {
      for (const f of doc.files) f.mtime = 0;
      return doc;
    };
    expect(norm(dumpDoc(again))).toEqual(norm(JSON.parse(before)));
  });

  it('a file deletion shifts later ordinals and falls back to a full reparse, still identical', () => {
    const root = mkdtempSync(join(tmpdir(), 'idx62-del-'));
    makeTree(root);
    const cache: ParseReuseCache = new Map();
    buildIndex(root, { deep: false, parseCache: cache });
    rmSync(join(root, 'src/a.ts'));
    // b.ts and c.ts keep their content but their fileIdx shifts down by one,
    // so their cached keys (fileIdx-packed) are invalid — reuse must refuse
    // and reparse, never serve stale keys.
    const incremental = buildIndex(root, { deep: false, parseCache: cache });
    expect(incremental.stats.parseReusedFiles).toBe(0);
    expect(JSON.stringify(dumpDoc(incremental))).toBe(coldDoc(root));
    expect(incremental.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/c.ts']);
  });
});
