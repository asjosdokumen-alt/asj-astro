/**
 * discover.test.ts — Phase 0 exit criteria:
 *  - inventory matches `git ls-files` filtered by the include rules (§2.1),
 *  - deterministic across runs,
 *  - generated/secret paths excluded.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discoverFiles, parseGitignore } from './discover.js';
import { includePath, toPosix, type Lang } from './util.js';

const ROOT = process.cwd().replace(/\\/g, '/');

function run() {
  return discoverFiles({ rootDir: ROOT, matcher: parseGitignore(requireGitignore()) });
}

function requireGitignore(): string {
  return readFileSync(`${ROOT}/.gitignore`, 'utf8');
}

function gitLsFiles(): string[] {
  // Tracked + untracked-non-ignored: the inventory covers the whole working
  // tree, so a new-but-uncommitted source file (e.g. archiver.d.ts) stays in
  // sync with discovery until it is committed.
  //
  // The deleted-file filter is REQUIRED, and its absence was a real bug (found
  // 2026-09-17). `--cached` lists files that are still in the INDEX but no
  // longer on disk — deleted with the filesystem but not yet `git add`ed.
  // discoverFiles() walks the working tree and correctly omits them, so the two
  // sides disagreed by exactly those paths (e2e/test-admin.mjs and
  // e2e/test-supabase-auth.mjs, both ` D` in `git status`). Discovery was RIGHT
  // and this helper was WRONG.
  //
  // `git ls-files --deleted` is NOT an additive flag you can append to the line
  // below: it is a SEPARATE query, and appending it UNIONS the deleted set into
  // the output — measured 625 -> 627, the wrong direction. The deleted paths are
  // obtained on their own and SUBTRACTED. Verified empirically: bare
  // `git ls-files --deleted` returns exactly the two paths, while
  // `git ls-files -t -c` tags them `H` (cached), not `D` — so the tag column is
  // NOT the signal, and two of my earlier attempts to read it were wrong.
  //
  // The failure mode is worth naming: it looked like inventory drift — the kind
  // this ratchet exists to catch — and the tempting "fix" was to add 2 to the
  // counts. That would have baked a phantom into the baseline. What separated
  // them was printing the SET DIFFERENCE rather than the sizes: `onlyGit` had
  // the two names and `onlyDisc` was empty, proving the walker saw everything
  // git did and skipped only paths git wrongly kept.
  const deleted = new Set(
    execSync('git ls-files --deleted', { encoding: 'utf8', cwd: ROOT })
      .split(/\r?\n/)
      .filter(Boolean)
      .map(toPosix),
  );

  return execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8', cwd: ROOT })
    .split(/\r?\n/)
    .filter(Boolean)
    .map(toPosix)
    .filter(includePath)
    .filter((rel) => !deleted.has(rel))
    .sort();
}

describe('gitignore matcher', () => {
  const m = parseGitignore(
    [
      'node_modules/',
      '*.log',
      '!keep.log',
      'netlify/functions/.netlify-built/',
      '.env.*',
      'dist/',
      '# comment',
      '',
    ].join('\n'),
  );

  it('handles unanchored dir patterns at any depth', () => {
    expect(m.ignores('node_modules', true)).toBe(true);
    expect(m.ignores('src/x/node_modules', true)).toBe(true);
    expect(m.ignores('dist', true)).toBe(true);
    expect(m.ignores('a/dist', true)).toBe(true);
  });

  it('handles unanchored file globs', () => {
    expect(m.ignores('a.log', false)).toBe(true);
    expect(m.ignores('sub/b.log', false)).toBe(true);
    expect(m.ignores('src/.env.local', false)).toBe(true);
  });

  it('honors negation (last match wins)', () => {
    expect(m.ignores('keep.log', false)).toBe(false);
  });

  it('anchors patterns containing a separator', () => {
    expect(m.ignores('netlify/functions/.netlify-built', true)).toBe(true);
    expect(m.ignores('other/.netlify-built', true)).toBe(false);
  });

  it('does not ignore ordinary sources', () => {
    expect(m.ignores('src/lib/main.ts', false)).toBe(false);
    expect(m.ignores('netlify/functions/contexts/x/service.ts', false)).toBe(false);
  });
});

describe('discover', () => {
  it('inventory matches git ls-files (Phase 0 exit criterion)', () => {
    expect(run().map((f) => f.path).sort()).toEqual(gitLsFiles());
  });

  it('is deterministic across runs', () => {
    expect(run().map((f) => `${f.path}|${f.hash}`)).toEqual(run().map((f) => `${f.path}|${f.hash}`));
  });

  it('excludes generated and secret paths', () => {
    const paths = run().map((f) => f.path).join('\n');
    expect(paths).not.toMatch(/node_modules/);
    expect(paths).not.toMatch(/\.netlify-built/);
    expect(paths).not.toMatch(/\.env/);
    expect(paths).not.toMatch(/(^|\/)dist\//);
    expect(paths).not.toMatch(/\.workbuddy-ai|\.agents|\.freebuff/);
    expect(paths).not.toMatch(/^\.git\//);
  });

  it('counts match the measured profile (design §1, + CJS entries)', () => {
    const files = run();
    const count = (lang: Lang) => files.filter((f) => f.lang === lang).length;
    // Phase B (2026-09-11): kernel/deadline.ts + kernel/admission.ts and their
    // test files. 198 -> 202.
    // 2026-09-11 (later): share-data.test.ts moved OUT of netlify/functions/
    // into e2e/ — Netlify scanned it as a deployable function and the deploy
    // died on `Could not resolve "vitest"`. Still tracked (same path counted
    // once), but it is no longer a netlify/* file. 202 -> 201 for this gate
    // because the netlify tree shrank by one while the e2e tree grew by one —
    // the totals below are what moved.
    // Phase C item 12 (2026-09-11): +3 ts — _lib/health.ts, health.test.ts and
    // health-entrypoint.test.ts. (An earlier draft of this note said +4 and
    // named a health-snapshot.test.ts, which was never added; the snapshot
    // assertions live in health.test.ts.)
    // 201 -> 204.
    // Phase C item 11 (2026-09-11): +3 ts — _lib/metrics-sink.ts and its two
    // test files (metrics-sink.test.ts, metrics-pipeline.test.ts). 204 -> 207.
    // 2026-09-12: 207 -> 208 as part of the same uncommitted Phase C body of
    // work; verified by extension count over the indexed tree (ts 208, tsx 78,
    // astro 12, mjs 20, cjs 5, js 18 = 341).
    // 2026-09-12 (PWA work): +3 mjs — scripts/build-sw-manifest.mjs,
    // scripts/build-pwa-icons.mjs and scripts/ci/verify-pwa.mjs. ts/tsx/astro/
    // cjs/js are unchanged. 341 -> 344 (mjs 20 -> 23). Measured with the real
    // `discoverFiles({rootDir, matcher: parseGitignore(...)})` call path, not
    // by hand — the two disagree whenever a source root is added.
    // 2026-09-12 (Phase C receiver): +2 ts — netlify/functions/metrics-receiver.ts
    // and _lib/metrics-receiver.test.ts, the reference receiver for the item-11
    // sink. 344 -> 346 (ts 208 -> 210). The test lives in _lib/ on purpose: a
    // .test.ts at the functions ROOT is deployed as a function and killed three
    // deploys via an unresolvable devDependency import (see verify:entries).
    // 2026-09-12 (Lambda compatibility mode migration): +2 ts —
    // netlify/functions/_lib/netlify-adapter.ts and _lib/verify-env-budget.test.ts.
    // 346 -> 348 (ts 210 -> 212); tsx/astro/mjs/cjs/js unchanged, total 349.
    // 2026-09-12 (backend reachability fixes): +1 ts —
    // netlify/functions/contexts/diagnostics/service.test.ts, which locks the
    // reportWebVital payload contract (the handler used to read payload.name
    // while clients send [metric], so every report was silently rejected).
    // ts 212 -> 213. See also the js note below for the matching entry point.
    // 2026-09-12 (Phase D, data layer): +2 ts — _lib/db/projections.ts (every
    // column projection, stored once) and _lib/db/projections.test.ts (checks
    // each one against the generated schema contract). ts 213 -> 215.
    // Phase D item 17 (keyset pagination): +2 ts — _lib/db/pagination.ts and
    // pagination.test.ts, replacing the Range/OFFSET reader. ts 215 -> 217.
    // Phase D follow-up + Phase E (2026-09-13): +2 ts — _lib/chaos.test.ts (the
    // degradation suite) and contexts/scheduling/repository.test.ts (the
    // `{ rows }` destructuring guard). ts 217 -> 219.
    // Owner-approved items 1 & 5 (2026-09-13): +2 ts —
    // contexts/identity/admin-personal.test.ts and
    // contexts/notifications/wa-single-durability.test.ts. ts 219 -> 221.
    // 221 -> 220 (2026-09-13, B06 share-token removal): -1 ts —
    // _lib/db/shareTokens.ts, deleted with the gate it served.
    // 220 -> 221 (2026-09-13, BACKEND_TODO #8): +1 ts — agenda-reminders.ts (the
    // cron trigger for the agenda reminders). The guard test is not part of the
    // indexer inventory.
    // 221 -> 233 (2026-09-13, evening). Measured, not derived: the tree holds 233
    // and this ratchet had gone STALE BY 9, so `npm test` — and with it
    // `ci:quality` — was RED on main for several commits before this. It was
    // found by running the whole suite, which includes the `indexer` project;
    // running only `--project frontend` / `--project backend` does NOT cover this
    // file, which is exactly how it slipped past earlier sessions.
    //   Only 2 of the 11 new files are this session's (_lib/otlp.ts and
    //   _lib/kernel/otlp.test.ts — the Grafana OTLP export). The other 9 were
    //   already on disk and unrecorded:
    //     _lib/db/jobs-limit.test.ts                        (job-board 1-row bug, cb7c3ad)
    //     src/lib/jobDisplay.ts + jobDisplay.test.ts        (i18n job values, da4b72d)
    //     src/lib/candidateExport.ts + .test.ts + .xlsx.test.ts   (#11 Excel export)
    //     src/lib/berkasCatalog.test.ts                     (#10 extension guard)
    //     src/lib/swOffline.test.ts                         (#18 PWA offline)
    //     contexts/applications/service-bulk-delete.test.ts (#15 bulk delete)
    // Note the previous literal (222) was itself 1 above the 221 the comments
    // above sum to, so the true drift was 9 from the literal / 10 from the
    // arithmetic. The measured value is what matters: 233.
    // 233 -> 234 (2026-09-13, later): +1 ts — _lib/smoke-test-health.test.ts,
    // which pins the rollback gate's classification (BACKEND_TODO #31).
    // 234 -> 235 (2026-09-13, latest): +1 ts — _lib/cold-start-gate.test.ts,
    // which pins the cold-start latency gate (BACKEND_TODO #29). The gate's
    // companion .mjs is counted below; its .mutations.sh is deliberately NOT
    // counted (not a tracked code extension).
    // 235 -> 236 (2026-09-13, latest): +1 ts — src/store/theme.test.ts, pinning
    // the banner/theme coupling fix (setBanner() was a no-op because the theme
    // subscriber called bannerStore.set() unconditionally).
    // 237 -> 239 (2026-09-14): +2 ts — src/lib/aiCvDraft.ts (the nested→flat CV
    // draft bridge with multi-path tolerant reads) and its test, added with the
    // P2 admin CV-AI panel (docs/UI_DESIGN_REVIEW.md §5). Same +2 as build.test.ts.
    // 239 -> 241 (2026-09-14): +2 ts — src/lib/vip.ts (VIP/KELAS gate predicate +
    // AI CV redirect helper) and its test, added with the §6 VIP work.
    // 241 -> 243 (2026-09-14): +2 ts — src/lib/opsi-form.ts (the single owner of
    // the ID/JP dropdown lists: occupations, school majors, cities, family
    // relations) and its test, wired into MasterFullForm. The test locks the
    // parts that are invisible in the UI: legacy value parity (uppercase family
    // relations), no duplicate option values, and the sentinel round-trip
    // (choosing "Lainnya" must persist the typed text, never `__LAINNYA__`).
    // 243 -> 254 was my first reading of the drift and it was WRONG: `ts` was
    // already correct. Measured the real counts by instrumenting this very
    // assertion rather than counting files by hand — the hand count disagreed
    // because it included `dist/`, which the matcher excludes. Ground truth:
    // ts 243, tsx 82, astro 12, mjs 43, cjs 5, js 19. So the drift was
    // entirely in `mjs` (30 -> 43), not spread across three languages.
    // Re-baselined to the measured tree. See the note on count('mjs').
    // ── RE-BASELINED 2026-09-15 (review round) ───────────────────────────
    // Measured through discoverFiles() itself, NOT by hand (a hand count
    // disagrees because it includes `dist/`, which the matcher excludes):
    //
    //   TOTAL 402  |  ts 244  tsx 84  astro 12  mjs 38  cjs 5  js 19
    //
    //   ── RE-BASELINED AGAIN 2026-09-15 (mutation-battery round) ──────────
    //   TOTAL 402 -> 405  |  mjs 38 -> 41  (+3), everything else unchanged.
    //
    //   mjs  +3  the three ship-with-the-battery helper scripts added while
    //            proving the gates can fail:
    //              scripts/ci/alias-gate-patcher.mjs
    //              scripts/ci/projections-gate-patcher.mjs
    //              scripts/ci/pwa-mutate.mjs
    //            (their .mutations.sh companions are .sh and do not count.)
    //
    //   This is the exact drift this comment block warns about two paragraphs
    //   up — "every gate-adding session extends scripts/ci/ and forgets this
    //   file, so the gate goes red" — and it happened again, to the session
    //   that was reading the warning. Caught by running the FULL suite, not
    //   `--project frontend`: the indexer project is the only one that covers
    //   this file, which is how the previous two drifts slipped through.
    //
    //   Measured, not derived. Cross-check:
    //     git ls-files --cached --others --exclude-standard | grep -c '\.mjs$'
    //   -> 42, of which astro.config.mjs is excluded by includePath(), leaving
    //   41. Scoping the diff to this session's own commits showed exactly three
    //   added .mjs files, so the +3 is accounted for in full and nothing scratch
    //   is being counted.
    //
    // and `sum === total` — asserted at the bottom of this file — still holds,
    // so nothing scratch is being counted. What moved, and why:
    //
    //   ts  243 -> 244   +1  src/lib/opsi-form.TEST.ts. The source file itself was
    //                        already counted in the 243. The file landed
    //                        (the 241 -> 243 note above describes it) but this
    //                        number was never updated to match.
    //   tsx  82 -> 83    +1  App.header.test.tsx. The note below records it as
    //                        "81 -> 82" while the value here still said 82, so
    //                        the note and the number had already disagreed.
    //   mjs  30 -> 38    +8  the CI-gate rounds (docs UI review §20-§26):
    //                        scripts/ci/review-gate.mjs, lint-ratchet.mjs,
    //                        verify-review-manifest.mjs, scripts/ci/lib/
    //                        biome-run.mjs. (The .mutations.sh companions are
    //                        .sh and do not count.)
    //
    // WHY THIS KEEPS HAPPENING, AND THE RULE THAT FOLLOWS
    //   Every gate-adding session extends scripts/ci/ and forgets this file, so
    //   the gate goes red; a gate everyone knows is red stops being read, which
    //   is how the same counts drifted twice before without anyone noticing for
    //   a whole session. The sum check at the bottom is the part that actually
    //   catches the dangerous failure mode (a scratch file inflating a count).
    //   Treat a mismatch here as "measure, then decide" — never "bump until
    //   green". Re-measure with:
    //     discoverFiles({ rootDir, matcher: parseGitignore(.gitignore) })
    //   then confirm the per-language counts still sum to list.length.
    //
    // Cross-checked against the index at re-baseline time:
    //   git ls-files --cached --others --exclude-standard | grep -c '\.mjs$'
    //   -> 39, of which astro.config.mjs is excluded by includePath(), leaving
    //      38. That accounts for the +8.
    // 406 -> 410 (2026-09-16): +4 — netlify/functions/contexts/
    // service-input-validation.test.ts and _lib/kernel/guard.ts (2 ts) plus
    // scripts/ci/{verify-validation-coverage,validation-coverage-patcher}.mjs
    // (2 mjs): the edge-validation gate, its battery patcher, the dependency-free
    // guards and their test. The .mutations.sh companion is .sh and does not
    // count, and .ci/validation-baseline.json is .json. (The guards are zod-free
    // because a zod import here added ~67 KB to eight entry points and pushed
    // files.js over the 600 KB ceiling — see _lib/kernel/guard.ts.)
    // Measured, not derived: 247 + 84 + 12 + 44 + 5 + 19 = 411.
    // 246 -> 247 (2026-09-16, same day): +1 ts —
    // netlify/functions/_lib/db/settings-limit.test.ts, the regression guard for
    // findSettings()/findAnnouncements() inheriting findTable()'s limit=1 default.
    // 247 -> 248 (2026-09-17, later): +1 ts —
    // src/store/adminStore.fetchMail.test.ts, the transport + post-write-freshness
    // guard for taking adminStore.fetchMailFromAPI off its hand-rolled fetch.
    // Measured: tsx/astro/mjs/cjs/js are all unchanged, so the six counts still
    // sum to files.length (415) in build.test.ts. Cross-checked against
    // `git ls-files --cached --others --exclude-standard` filtered by
    // includePath() — also 415, i.e. discovery and git still agree.
    // 248 -> 250 (2026-09-17, dashboard Stage 1): +2 ts —
    // src/lib/profileProgress.ts (the derived CV Mini/Master progress that
    // replaced the never-sent `kandidatData.cv*Progress` contract) and its
    // 17-test suite src/lib/profileProgress.test.ts. Both are src/ sources, so
    // fileCount in build.test.ts and files.length / count('ts') here move
    // together by the SAME +2.
    // THE PHANTOM — found 2026-09-18, and the reason this ratchet was RED at
    // HEAD without anyone noticing. The "247" the chain above derives from was
    // itself stale: netlify/functions/_lib/db/candidates.test.ts was added after
    // e354e35 (the commit that set 247) and the count was never bumped.
    // Measured, by extracting HEAD (`git archive HEAD | tar -x`) and running
    // discoverFiles() over it: ts=248, tsx=86, astro=12, mjs=46, cjs=5, js=19
    // = 416, while HEAD asserted 415. Identity of the one file:
    //   git diff --diff-filter=AD --name-status e354e35 HEAD -- '*.ts'
    // returns exactly that one path once indexer/, docs/, e2e/ and
    // vitest.config.ts are filtered out — none of which includePath() counts
    // (it counts src/, netlify/functions/, shared/, scripts/, e2e/ and the repo
    // root only). So the entries above were DERIVED from a stale base, not
    // measured: 247 + 3 new = 250, but the tree was at 248 + 3 = 251.
    // MEASURED 2026-09-18 with `indexer/src/count-indexed.test.ts` (which calls
    // discoverFiles itself): ts=251, tsx=87, astro=13, mjs=51, cjs=5, js=19.
    expect(count('ts')).toBe(251);
    // 78 -> 79 (2026-09-13, owner-approved item 2):
    // src/components/ui/AiUnavailableBanner.tsx.
    // 79 -> 78 (2026-09-13): -1 tsx, src/components/ESignatureModal.tsx deleted.
    // NOT part of the #8 cron work — this deletion came from the parallel
    // frontend session editing src/components/admin/*.tsx in the same tree.
    // 78 -> 80 (2026-09-13, BACKEND_TODO #12): +2 tsx — RejectMailModal.tsx (the
    // reject-reason composer that replaced a `window.confirm` carrying a
    // hardcoded reason) and its test. Part of the same stale-ratchet batch the
    // count('ts') note above describes.
    // 80 -> 81 (2026-09-14): +1 tsx — src/components/candidate/CandidateDash.test.tsx,
    // the §6 gate/badge suite (AI CV button gate, ASJ logo badge, PERFECT ASJ STUDENT).
    // 81 -> 82 (2026-09-14, UI review round 2): +1 tsx — src/components/App.header.test.tsx,
    // which pins the header-title/menu-button collision class (docs/UI_DESIGN_REVIEW.md §11.1)
    // and the drawer close-button hitbox (§11.3). jsdom has no layout engine, so the test
    // asserts the structural contract (min-w-0 + truncate + a mobile max-w cap) that makes
    // the overlap impossible; the measured Playwright check stays the source of truth.
    // 2026-09-15 (review round): +1 tsx — src/components/ui/
    // overlay-contract.test.tsx, the guard for the §25 leftovers. The number
    // must include it because the ratchet counts the TREE, and a test that
    // guards a defect has to exist before it can guard anything. Measured 83
    // with this file absent, 84 with it present; 84 is the shipped value.
    // 2026-09-15 (review round): 83 -> 84. +1 tsx — src/components/ui/
    // overlay-contract.test.tsx, the guard for the §25 leftovers (the two
    // modals the earlier round left without dialog semantics). Measured 83
    // with that file absent and 84 with it present; 84 is the shipped value,
    // because the ratchet counts the TREE and a guard has to exist before it
    // can guard anything.
    // 2026-09-15 (review round): 83 -> 84. +1 tsx — src/components/ui/
    // overlay-contract.test.tsx, the guard for the §25 leftovers (the two
    // modals the earlier round left without dialog semantics). Measured 83
    // with that file absent and 84 with it present; 84 is the shipped value,
    // because the ratchet counts the TREE and a guard has to exist before it
    // can guard anything.
    // 84 -> 85 (2026-09-16): `TabTambah.test.tsx`, the new test for the admin
    // form's label/control rework. Measured; ts/mjs/cjs/js are all unchanged.
    // 85 -> 86 (2026-09-16): `InputManualModal.test.tsx`. Measured; ts/mjs/cjs/js
    // are all unchanged, so the six counts still sum to files.length below.
    // 86 -> 87 (2026-09-17, later): +1 tsx — src/components/CekSiswaModal.test.tsx,
    // the guard for the CekSiswaModal conversion (that file had no test before, so
    // the conversion would have been unverified at the wire). Measured: the other
    // five counts are unchanged, so the six still sum to files.length in
    // build.test.ts.
    expect(count('tsx')).toBe(87); // 46 at design time; modal/component test suites added since
    // 12 -> 13 (2026-09-17): +1 astro — `src/pages/404.astro`. The site had NO
    // 404 page: `src/pages/404.astro` was absent and `netlify.toml` carried no
    // rule for unknown paths, so a mistyped link fell through to Netlify's own
    // default page. It is a real page and it is counted; nothing was removed to
    // make room for it. Cross-check: this is the same +1 as files.length in
    // build.test.ts, and the six counts still sum to files.length below.
    expect(count('astro')).toBe(13);
    // 2026-09-11: the Phase A/B CI gates landed — bundle-size.mjs,
    // surface-binding.mjs, verify-aliases.mjs, scripts/lib/load-env.mjs, and
    // io-boundary.mjs — none of which were reflected here at the time.
    // 15 -> 17.
    // 2026-09-11 (later): the local env-audit trio —
    // scripts/ci/env-audit.local.mjs, env-resolve.local.mjs, env-validate.local.mjs.
    // 17 -> 20.
    // 2026-09-12 (PWA work): the SW-manifest generator, the icon rasteriser and
    // the PWA integrity gate. 20 -> 23.
    // 2026-09-12 (later): the functions-entry gate. 23 -> 24.
    // 2026-09-12 (Phase D, data layer): +3 mjs — scripts/ci/gen-schema.mjs
    // (generates the schema contract from the live database), plus the two new
    // gates verify-projections.mjs and verify-rls.mjs. 24 -> 27.
    // 2026-09-13 (latest): +1 mjs — scripts/ci/check-md-tables.mjs, the markdown
    // table structure gate (wired into ci:quality). 27 -> 28.
    // 2026-09-13 (later still): +1 mjs — scripts/ci/cold-start-gate.mjs, the
    // cold-start latency gate (BACKEND_TODO #29). 28 -> 29.
    // 2026-09-14: +1 mjs — scripts/ui-audit.mjs, the browser-measurement audit
    // that proved the six missing component classes (.input/.label/...) were
    // undefined rather than merely theme-blind. 29 -> 30. The companion
    // docs/UI_DESIGN_REVIEW.md does NOT move this count: .md is not indexed.
    // expected 30, measured 43 (2026-09-14, UI review round 2) — a +13 drift
    // that predates the session which found it. Proven independent of that
    // session's work: with every source change and its new test file removed
    // from the tree, the count still read 43, and `git ls-tree -r HEAD` already
    // held the extra files — so the drift sat inside the committed tree, not in
    // an uncommitted edit. Several prior sessions added scripts/ci gates and
    // e2e helpers without extending this ratchet, which left the gate red and
    // therefore ignored. Re-baselined to the measured tree so the next genuine
    // change to this count is visible again.
    //
    // CORRECTION (2026-09-14, round 3) — THE +13 WAS NEVER REAL.
    // It was my own scratch files. `discover.ts` does NOT skip dotfiles, so
    // every `.tmp-*.mjs` written into the repo root during measurement was
    // counted. The round-2 "re-baseline to 43" therefore froze a number that
    // included ~13 temporary scripts, and the proof I used ("`git ls-tree -r
    // HEAD` already held them") was misread: `ls-tree` lists WHAT is committed,
    // not WHETHER the matcher counts it, so it could not have detected this.
    //
    // Measured on a genuinely clean tree (no scratch files anywhere):
    //   TOTAL 391  |  ts 243  tsx 82  astro 12  mjs 30  cjs 5  js 19
    // and the six counts sum to 391 exactly — the check that made the earlier
    // hand-arithmetic fail visible. 30 is also the value the previous session
    // reasoned its way to from the changelog, which corroborates it.
    // Back to 30, and `sum === total` is asserted below so this class of error
    // cannot hide again.
    // 38 -> 41 (2026-09-15, mutation-battery round): +3 mjs — the three
    // ship-with-the-battery patcher/mutator helper scripts. See the
    // RE-BASELINED AGAIN block above.
    // 41 -> 42 (2026-09-16): +1 mjs — `scripts/ci/run-batteries.mjs`, the
    // runner that executes the mutation batteries. Measured rather than assumed:
    // the 41 was set in 257c104, and of the 14 files added since, this is the
    // ONLY one the indexer counts (includePath takes mjs/cjs/js under scripts/**
    // and e2e/**; the other 13 are .sh/.md). The same file is the +1 in
    // build.test.ts fileCount, which is the cross-check that it is one file and
    // not two. Every other language count is unchanged.
    // 44 -> 46 (2026-09-16): +2 mjs — `e2e/test-drawer.mjs` and
    // `e2e/test-labels.mjs`, the two e2e guards added by the drawer and label
    // rounds. Measured with a real discover run rather than inferred: every other
    // language count is unchanged, and the six counts still sum to files.length,
    // which is the cross-check that this is the same +2 as files.length below.
    // 46 -> 44 (2026-09-17): -2 mjs — `e2e/test-admin.mjs` and
    // `e2e/test-supabase-auth.mjs` DELETED, not wired up. Both were orphans (no
    // workflow and no npm script invoked either), and neither could be wired
    // safely. test-admin cannot pass at all: it drives the admin panel without
    // ever establishing the admin session `/admin` is gated behind, and its
    // assertions are pinned to data that has since changed ("dropdown has 24
    // options"). test-supabase-auth is worse than useless in CI — it calls
    // `auth/v1/signup` with a RANDOM phone on every run, so it creates real auth
    // users in the production Supabase project and accumulates them, while its
    // assertions accept 200 OR 400 and therefore assert almost nothing; its
    // default port is also 4322 while every other gate uses 4321. Their useful
    // surface is covered by the hermetic gates and the unit suites. Measured
    // with a real discover run: the other five counts are unchanged and the six
    // still sum to files.length.
    // 44 -> 45 (2026-09-17, later): +1 mjs — scripts/ci/verify-workflows.mjs, the
    // gate that reads the workflow files the way GitHub does. Its companion
    // verify-workflows.mutations.sh does NOT move this count: `.sh` is not an
    // indexed language, which is why the CI-gate additions have always moved
    // `mjs` by fewer than the number of files they added.
    // 45 -> 51 (2026-09-17, dashboard Stage 1 + the earlier same-day session):
    // +6 mjs — the e2e measurement/verification probes. Each exists to make a
    // claim FALSIFIABLE (before/after numbers) rather than to be a gate:
    //   e2e/measure-riwayat-card.mjs        (content-visibility collapse)
    //   e2e/measure-bottomnav-clearance.mjs (nav overlap in px)
    //   e2e/measure-bottomnav-tap.mjs       (hit-test ownership)
    //   e2e/shot-bottomnav-occlusion.mjs    (visual evidence)
    //   e2e/verify-progress-live.mjs        (0% / 100% / PERFECT badge)
    //   e2e/verify-stage1.mjs               (heading outline)
    // MEASURED — and my first guess was 54. It was wrong, because I derived it
    // from `git ls-files | grep '\.mjs$'`, which counts files includePath()
    // REJECTS. Never infer these from a shell count; read them off
    // `indexer/src/count-indexed.test.ts`, which calls discoverFiles() itself.
    // 51 -> 52 (2026-09-18): +1 mjs — scripts/ci/with-timeout.mjs. Measured, not
    // derived; see the note in build.test.ts.
    expect(count('mjs')).toBe(52); // 11 at design time; e2e + scripts/ci gates added since
    expect(count('cjs')).toBe(5);
    // Phase A (2026-09-11): netlify/functions/run-migration.js deleted — the
    // action was already removed from the registry, so the entry point was a
    // dead 690 KB catch-all. 29 -> 28.
    // Phase A carry-forward (2026-09-11): the 11 remaining catch-all stubs
    // (admin-ai-context, ai-form-submit, apply, drive-links, rincian-presets,
    // save-ai-cv, save-master, schedule-reminders, submit-apply,
    // submit-siswa-baru, whatsapp) deleted: zero code references, no working
    // alias, and each was an unrestricted full-router entry point at ~1.5 MB.
    // bridge-links.js stays as the single documented fallback. 28 -> 17.
    // Phase C item 12 (2026-09-11): +1 — health.js. The first NEW entry point
    // since the retirement, and deliberately a bespoke one (no
    // makeSurfaceHandler): it must not appear in the narrow list, because its
    // action is not registered in the router. 17 -> 18.
    // 2026-09-12 (backend reachability fixes): +1 — diagnostics.js, the narrow
    // entry point for getAppConfig/reportWebVital. Until it existed, both
    // actions were reachable only through the bridge-links catch-all; the
    // surface-binding gate's reachability rule now fails the build if any
    // router action has no narrow home. 18 -> 19. Reconciled 2026-09-14:
    // measured 19, unchanged — the drift lived only in `mjs`.
    // 19 stays 19 after the Stage 1 work: MEASURED, not assumed. I had first
    // written 20 here by pattern-matching on the +2 ts, and that was wrong —
    // `.js` did not move at all. The checksum test below is what caught it:
    // 250+87+13+51+5+19 = 425, which is files.length. If this number were 20
    // the six would sum to 426 and the integrity test would fail loudly.
    expect(count('js')).toBe(19);
    // 342 -> 341 (2026-09-11): share-data.test.ts left netlify/functions/ for
    // e2e/ — the file still exists, but see the count('ts') note above.
    // 341 -> 344: the three env-audit scripts under scripts/ci.
    // 344 -> 333: the 11 deleted catch-all stubs above.
    // NOTE: the "333" figure above was itself one low — measured against the
    // tree it was 334 (the 11-stub deletion took 344 -> 334). Left in place
    // because it is the number the following deltas were written against; the
    // arithmetic below is stated from the measured value instead.
    // 334 -> 341 (2026-09-11/12, Phase C items 11 + 12): +6 ts
    // (_lib/health.ts, _lib/metrics-sink.ts, and the four new test files
    // health.test.ts, health-entrypoint.test.ts, metrics-sink.test.ts,
    // metrics-pipeline.test.ts) and +1 js (netlify/functions/health.js).
    // Verified by diffing the indexed file list against `git ls-files` at HEAD:
    // exactly 7 paths are new, and no path was removed or renamed.
    // 341 -> 344 (2026-09-12, PWA work): +3 mjs (build-sw-manifest.mjs,
    // build-pwa-icons.mjs, verify-pwa.mjs). No other extension moved.
    // 344 -> 347 (2026-09-12, Phase C receiver + gates): +2 ts
    // (metrics-receiver.ts, _lib/metrics-receiver.test.ts) and +1 mjs
    // (scripts/ci/verify-function-entries.mjs).
    // 347 -> 349 (2026-09-12, Lambda compatibility mode migration): +2 ts,
    // netlify/functions/_lib/netlify-adapter.ts and _lib/verify-env-budget.test.ts.
    // 349 -> 351 (2026-09-12, backend reachability fixes): +1 ts
    // (contexts/diagnostics/service.test.ts) and +1 js
    // (netlify/functions/diagnostics.js).
    // 351 -> 356 (2026-09-12, Phase D data layer): +2 ts and +3 mjs — see the
    // per-extension notes above, which are what actually moved.
    // 356 -> 358 (2026-09-12, Phase D item 17): +2 ts (keyset pagination).
    // 358 -> 360 (2026-09-13, Phase D follow-up + Phase E): +2 ts — see the
    // per-extension notes above.
    // 360 -> 362 (2026-09-13, owner-approved items 1 & 5): +2 ts — see the
    // per-extension notes above.
    // 362 -> 363 (2026-09-13, owner-approved item 2): +1 tsx — see above.
    // 363 -> 362 (2026-09-13, B06 share-token removal): -1 ts — see above.
    // 362 -> 364 (2026-09-13, BACKEND_TODO #8): +2 ts — see above.
    // 364 -> 376 (2026-09-13, evening): +13 files — 11 ts + 2 tsx, the same batch
    // the per-extension notes above list. Measured against the tree, because this
    // assertion had gone stale and was red on main. (The previous literal, 363,
    // was itself 1 below the 364 its own comments above reach.)
    // 376 -> 377 (2026-09-13, later): +1 ts — _lib/smoke-test-health.test.ts. The
    // same +1 as build.test.ts; the indexer inventory counts files on DISK, so
    // adding any test file moves this number.
    // 377 -> 378 (2026-09-13, latest): +1 mjs — scripts/ci/check-md-tables.mjs.
    // 378 -> 380 (2026-09-13, latest): +2 — scripts/ci/cold-start-gate.mjs and
    // _lib/cold-start-gate.test.ts (BACKEND_TODO #29). The companion
    // cold-start-gate.mutations.sh is NOT in the inventory: the indexer tracks
    // code extensions only, and .sh is not one.
    // 380 -> 381 (2026-09-13, latest): +1 ts — src/store/theme.test.ts. Same +1
    // as build.test.ts; the inventory counts files on DISK, not git-tracked ones.
    // 381 -> 382 (2026-09-13, later): +1 ts — _lib/otlp.test.ts. Same +1 as
    // build.test.ts. (Reminder: temp .mjs probe files dropped in the repo root
    // are picked up too — two of them once made this read 384.)
    // 382 -> 383 (2026-09-14): +1 mjs — scripts/ui-audit.mjs. Same +1 as
    // build.test.ts; see the count('mjs') note above.
    // 383 -> 385 (2026-09-14): +2 ts — src/lib/aiCvDraft.ts + .test.ts, the same
    // +2 as build.test.ts (P2 admin CV-AI panel). The inventory counts files on
    // DISK, not git-tracked ones.
    // 385 -> 388 (2026-09-14): +3 — src/lib/vip.ts + vip.test.ts (ts) and
    // src/components/candidate/CandidateDash.test.tsx (tsx), the §6 VIP work.
    // 388 -> 390 (2026-09-14): +2 ts — src/lib/opsi-form.ts + opsi-form.test.ts
    // (dropdown lists and their suite). The inventory counts files on DISK, not
    // git-tracked ones, so an untracked new file still moves this number.
    // 390 -> 404 (2026-09-14, UI review round 2): reconciled to the measured
    // tree. The +14 is NOT one session's work: it is +13 of `mjs` drift that
    // predates this session, plus +1 tsx from the new App.header.test.tsx.
    // Proven by removing every change of this session from the tree and
    // re-measuring — the count still read 403 — and by `git ls-tree -r HEAD`,
    // which already contained the extra files. The per-language counts above
    // sum to exactly this number (243+82+12+43+5+19), which is the check that
    // caught the first, wrong reading of the drift.
    //
    // CORRECTION (2026-09-14, round 3): 404 was wrong by exactly the number of
    // scratch files in the root. The line 333 reminder above ALREADY documented
    // this trap ("temp .mjs probe files dropped in the repo root are picked up
    // too — two of them once made this read 384") and it happened again anyway,
    // at ten times the size. Measured on a clean tree: 391. The +1 over 390 is
    // this session's App.header.test.tsx, and nothing else.
    //
    // The generalisable rule, now asserted rather than trusted: ALWAYS delete
    // `.tmp-*` scratch files BEFORE reading or writing any ratchet number, and
    // check that the six per-language counts sum to `files.length`. Both the
    // 404 and the 43 survived review because nothing enforced that invariant.
    // RE-BASELINED 2026-09-15 (review round). 391 -> 402, and it is not a
    // guess: the six per-language counts asserted directly above sum to it
    // exactly —
    //   247 ts + 84 tsx + 12 astro + 44 mjs + 5 cjs + 19 js = 411
    // which is the invariant this very comment demands. The +11 over 391 is
    // the CI-gate rounds (8 mjs incl. scripts/ci/lib/biome-run.mjs),
    // src/lib/opsi-form.ts + its test (2), and App.header.test.tsx (1).
    // The +3 over 402 is the 2026-09-15 mutation-battery round — the three
    // ship-with-the-battery .mjs helpers; see the RE-BASELINED AGAIN block
    // above count('ts').
    //
    // Also folded in: `overlay-contract.test.tsx` (+1 tsx) from this round.
    // Measured with the file absent = 83 tsx / 401 total; present = 84 / 402.
    // 406 is the shipped value because the ratchet counts the TREE.
    // 405 -> 406 (2026-09-16): +1 — `scripts/ci/run-batteries.mjs`, the
    // mutation-battery runner. Measured: the 41-mjs / 405 baseline was set in
    // 257c104, and of the 14 files added since, this is the ONLY one the indexer
    // counts. Three assertions move by the same +1 (fileCount in build.test.ts,
    // count(mjs) and files.length here) -- one file, not three.
    // 410 -> 412 (2026-09-16): the two e2e guards above. This is the THIRD
    // assertion moved by one +2 — fileCount in build.test.ts, count(mjs) here,
    // and this one. One change to the tree, three places, which is why they are
    // listed together rather than discovered one failing run at a time.
    // 412 -> 413 (2026-09-16): `TabTambah.test.tsx`. Third assertion moved by
    // the same +1 — fileCount in build.test.ts, count(tsx) here, and this one.
    // 413 -> 414 (2026-09-16): `InputManualModal.test.tsx`. Third assertion moved
    // by the same +1 — fileCount in build.test.ts, count(tsx) here, and this one.
    // 414 -> 415 (2026-09-16, same day): settings-limit.test.ts. Third assertion
    // moved by the same +1 — fileCount in build.test.ts, count(ts) here, and this
    // one.
    // 415 -> 414 (2026-09-17): net -1, and this is the THIRD assertion moved by
    // it — fileCount in build.test.ts, and count(astro)/count(mjs) here. The
    // halves: +1 astro (`src/pages/404.astro`, the page the site never had) and
    // -2 mjs (`e2e/test-admin.mjs` + `e2e/test-supabase-auth.mjs`, deleted as
    // orphans that could not be wired safely). Listed together rather than
    // discovered one failing run at a time, which is the point of this comment
    // block. Measured with a real discover run: 247 + 86 + 13 + 44 + 5 + 19.
    // 414 -> 415 (2026-09-17, later): +1 ts —
    // src/store/adminStore.fetchMail.test.ts, the transport + post-write-freshness
    // guard for taking adminStore.fetchMailFromAPI off its hand-rolled fetch. This
    // is the THIRD assertion moved by the same +1 — fileCount in build.test.ts,
    // count(ts) here, and this one. Measured with a real discover run, not derived:
    // 248 + 86 + 13 + 44 + 5 + 19 = 415, cross-checked against
    // `git ls-files --cached --others --exclude-standard` filtered by includePath()
    // — also 415, so discovery and git still agree.
    // 415 -> 416 (2026-09-17, later): +1 mjs —
    // scripts/ci/verify-workflows.mjs, the gate for the workflow files as GitHub
    // reads them. This is the THIRD assertion moved by the same +1 — fileCount in
    // build.test.ts, count('mjs') above, and this one. Measured with a real
    // discover run: 248 + 86 + 13 + 45 + 5 + 19 = 416, cross-checked against
    // `git ls-files --cached --others --exclude-standard` filtered by includePath()
    // — also 416.
    // 416 -> 417 (2026-09-17, later): +1 tsx — src/components/CekSiswaModal.test.tsx.
    // This is the THIRD assertion moved by the same +1 — fileCount in build.test.ts,
    // count('tsx') above, and this one. Measured with a real discover run:
    // 248 + 87 + 13 + 45 + 5 + 19 = 417, cross-checked against
    // `git ls-files --cached --others --exclude-standard` filtered by includePath()
    // — also 417.
    // 417 -> 425 (2026-09-17, dashboard Stage 1): +8 — +2 ts
    // (src/lib/profileProgress.ts + its test) and +6 e2e .mjs probes.
    // MEASURED with a real discover run: 250 + 87 + 13 + 51 + 5 + 19 = 425.
    // The checksum test below is the authority — if the six per-language
    // counts do not sum to THIS value, one of them above is wrong.
    // 425 -> 426 (2026-09-18): +1 ts — and this is the FOURTH assertion moved by
    // the same +1 (fileCount in build.test.ts, count('ts') above, this one, and
    // the checksum below). The "+8 to 425" above was DERIVED from a base that was
    // already stale, which is what hid the phantom: `candidates.test.ts` landed
    // after e354e35 and its +1 was never recorded, so HEAD has been asserting 415
    // while its own tree measures 416. Verified by extracting HEAD and running a
    // real discover over it (ts=248, tsx=86, astro=12, mjs=46, cjs=5, js=19 = 416)
    // and by `git diff --diff-filter=AD --name-status e354e35 HEAD -- '*.ts'`,
    // which names exactly that one path. MEASURED 2026-09-18:
    // 251 + 87 + 13 + 51 + 5 + 19 = 426.
    // 426 -> 427 (2026-09-18): +1 mjs — scripts/ci/with-timeout.mjs, the
    // wall-clock watchdog for runs that can hang. This is the THIRD assertion
    // moved by that one file (fileCount in build.test.ts, count('mjs') above,
    // and this one) — listed together rather than found one red run at a time.
    // MEASURED 2026-09-18: 251 + 87 + 13 + 52 + 5 + 19 = 427.
    expect(files.length).toBe(427); // 248 at design time; +4 Phase B kernel files, +5 CI gates/loader, +1 battery runner, +4 edge-validation gate, +2 e2e guards, +1 TabTambah test, +1 InputManualModal test, +1 settings-limit test, +1 404 page, -2 orphan e2e, +1 fetchMail test, +1 workflow gate, +1 CekSiswaModal test, +2 progress, +6 e2e probes, +1 candidates.test.ts (the phantom HEAD had been missing), +1 with-timeout watchdog
  });

  it('no scratch files are being counted, and the per-language counts sum to the total', () => {
    // THE CHECK THAT WOULD HAVE CAUGHT TWO WRONG BASELINES.
    //
    // `discover.ts` does not skip dotfiles, so any `.tmp-*.mjs` written into the
    // repo root while measuring is counted as if it were project code. That is
    // how `mjs` was frozen at 43 (real value: 30) and the total at 404 (real
    // value: 391) — twice, in two different sessions, despite the reminder at
    // the `files.length` note. Verifying the sum is what makes the error
    // self-evident: a baseline read while scratch files are lying around will
    // still sum correctly, but a baseline that does NOT sum reveals that
    // something is being counted that the author did not account for.
    //
    // If this fails, the fix is to delete the offending files and re-measure —
    // NOT to update the numbers to match.
    const list = run();
    const scratch = list.map((f) => f.path).filter((p) => /(^|\/)\.tmp-/.test(p));
    expect(scratch).toEqual([]);

    const perLang = ['ts', 'tsx', 'astro', 'mjs', 'cjs', 'js'] as const;
    const sum = perLang.reduce(
      (acc, ext) => acc + list.filter((f) => f.path.endsWith(`.${ext}`)).length,
      0,
    );
    expect(sum).toBe(list.length);
  });

  it('emits NTFS-safe lookup keys (lowercased) with original casing preserved', () => {
    for (const f of run()) {
      expect(f.lookupPath).toBe(f.path.toLowerCase());
      expect(f.lookupPath).toBe(f.lookupPath.toLowerCase());
    }
  });
});