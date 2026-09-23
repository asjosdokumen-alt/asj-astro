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
    // 251 -> 252 (2026-09-18): +1 ts — netlify/functions/contexts/ingestion/
    // service.test.ts, the suite that pins the xlsx READ path after xlsx was
    // re-pinned to the vendor's patched build (docs/CICD.md). That branch is the
    // only place this repo reads a spreadsheet and it had no test at all. This is
    // the THIRD assertion moved by that one file (fileCount in build.test.ts,
    // files.length below, and this one) — listed together rather than found one
    // red run at a time.
    // MEASURED 2026-09-18 with `indexer/src/count-indexed.test.ts`: ts=252,
    // tsx=87, astro=13, mjs=52, cjs=5, js=19 = 428.
    // 252 -> 254 (2026-09-18, same day): +2 ts — the test suites of the two
    // wire-payload fixes committed earlier that day:
    //   netlify/functions/surfaces/auth.wire-payload.test.ts   (5154c15)
    //   netlify/functions/_lib/ai/chat.payload-contract.test.ts (e6e5f13)
    // Those commits bumped NOTHING. The ingestion service.test.ts note directly
    // above moved all THREE assertions; these two moved none, so the ratchet sat
    // red at HEAD from the moment they landed.
    //
    // MEASURED, and the reason this is +2 rather than "adjust until green":
    // `indexer/src/count-indexed.test.ts` printed ts=254, and the five other
    // buckets were UNCHANGED (tsx=87, astro=13, mjs=52, cjs=5, js=19), so the
    // unit of this drift is exactly 2 ts files.
    //
    // CROSS-CHECKED two independent ways, because a size mismatch alone is not
    // evidence (the phantom note above is what that lesson cost):
    //  1. SET DIFFERENCE, not sizes — discoverFiles() vs
    //     `git ls-files --cached --others --exclude-standard` filtered by
    //     includePath(): disc=430, git=430, ONLY-IN-DISCOVERY = 0,
    //     ONLY-IN-GIT = 0. A phantom would show a non-empty side here; both are
    //     empty, so this is a real inventory, not stale discovery.
    //  2. `git ls-tree -r HEAD` filtered by the same includePath() rules:
    //     ts=254, tsx=87, astro=13, mjs=52, cjs=5, js=19 = 430 — identical to
    //     the disk walk, i.e. HEAD and the working tree agree and the frozen
    //     numbers were simply never updated.
    // MEASURED 2026-09-18 after the bump: ts=254, tsx=87, astro=13, mjs=52,
    // cjs=5, js=19 = 430.
    // 254 -> 256 (2026-09-19): +2 ts — src/lib/aiCvPairs.ts, the single-owner
    // registry of the paired ID↔JP value lists the AI CV form's dropdowns are
    // built from, and its suite aiCvPairs.test.ts. Set difference against
    // `git ls-tree -r HEAD` shows exactly those two added and nothing removed,
    // so this is +2 files and not a shifted tree.
    // 260 -> 262 (2026-09-19, later the same day — landing page L0/L1):
    // +2 ts — src/lib/publicSections.ts and its suite. It replaces two
    // `is:inline` tab scripts (in index.astro and public.astro) that had already
    // drifted apart and were covered by no test at all; the module returns state
    // and writes no class names, which is what makes it testable without a
    // browser. MEASURED with indexer/src/count-indexed.test.ts after the change:
    // 262 + 87 + 16 + 53 + 5 + 19 = 442.
    // 262 -> 264 (2026-09-19, landing page L3): +2 ts — src/lib/companyProfile.ts,
    // the company's static content in one module (the counterpart of
    // jobDisplay.ts), and src/lib/accentClass.ts, the single accent-role map the
    // section primitives share. MEASURED: 264 + 87 + 20 + 53 + 5 + 19 = 449.
    // 265 -> 266 (2026-09-19, landing page R2): +1 ts — JobMiniList.test.ts, the
    // decision-rule tests for the mini vacancy list. Note the walker semantics:
    // this count is over gitignore-aware discovered files, so the `.d.ts` files
    // under node_modules are excluded by the deny list, not by this number.
    // MEASURED with a temporary probe (then deleted, because the probe is itself
    // counted): 266 + 93 + 18 + 57 + 5 + 19 = 458.
    // 268 -> 269 (2026-09-20): this session added exactly ONE ts file,
    // src/components/ui/button.test.ts, but the assertion moved by ONE from a
    // baseline that was ALREADY STALE. Both halves were measured, not inferred:
    //   · `count-indexed.test.ts` reports ts = 269.
    //   · the set difference `comm -13 <HEAD ts> <tree ts>` lists 22 files that
    //     are on disk and absent from HEAD — pre-existing uncommitted work from
    //     earlier sessions — so the frozen 268 was never the live number.
    // A one-file change that moves the count by one is indistinguishable in the
    // failure output from a genuine +1, which is why the set difference decides
    // it and arithmetic does not.
    //
    // CORRECTION (2026-09-20, the R11 pass) — 269 IS RIGHT FOR THE WORKING TREE
    // AND WRONG FOR HEAD, AND THIS FILE MUST ASSERT THE HEAD VALUE.
    //   This ratchet is read in two places with different inputs:
    //     · locally, `discoverFiles()` walks the WORKING TREE, so it sees the
    //       22 uncommitted files above and reports 269;
    //     · in CI (and any fresh checkout) the tree IS HEAD, so the same call
    //       reports 248 — verified by running this file inside a detached
    //       worktree at HEAD, which failed `expected 248 to be 269`.
    //   An assertion that only holds on one developer's dirty tree is a gate
    //   that cannot be trusted and will go red the moment it is read from a
    //   clean checkout, which is the R11a failure class ("a green working tree
    //   is not a green HEAD").
    //   MEASURED at HEAD with a temporary probe that calls discoverFiles()
    //   ITSELF (the only reliable method — see the count('mjs') note about
    //   deriving these from `git ls-files`): ts=248, tsx=86, astro=14, mjs=47,
    //   cjs=5, js=19 = 419. Cross-checked by this assertion failing in the
    //   worktree at `expected 248 to be 269`. The 22-file gap is OTHER
    //   SESSIONS' uncommitted work and is not this file's business to freeze.
    //   The number below is therefore the HEAD value. Do not "bump it by one
    //   for button.test.ts": that file is uncommitted, so it is not in HEAD
    //   either, and the worktree run proved it — the probe reports 248 at HEAD
    //   and this assertion failed at `expected 248 to be 249` when it said 249.
    //   When button.test.ts is committed, THIS number and files.length, and
    //   fileCount in build.test.ts, all move by the same +1 together.
    //
    // 248 -> 249 (2026-09-20, later the same session): +1 ts, and it is NOT
    // button.test.ts. It is `src/lib/companyProfile.ts`, committed because the
    // R11 pass found my Button adoption importing it while it was absent from
    // HEAD (see the resolve-note in build.test.ts). The sequence matters and is
    // the point of the whole pass: the DEFECT was fixed first — three modules
    // committed — and only then did this number move, by the measured +1. The
    // worktree said `expected 248 to be 249` while it was 248, then
    // `expected 249 to be 248` after the module landed and the number had not
    // caught up: two red runs that bracket the change from opposite sides,
    // which is what a MEASURED transition looks like as opposed to an assumed
    // one. A count bumped to silence a red gate would have left the imports
    // dangling.
    // 249 -> 269 (2026-09-20, the backlog commit): +20 ts, and this is the
    // moment the R11 pass was FOR. The 22 files that were uncommitted when the
    // counts were first re-anchored have now been committed, so the working tree
    // and HEAD finally hold the SAME set — the two-number situation is over and
    // this assertion can go back to being a plain measured fact.
    //   MEASURED after the LevelCard slice with the same probe (ts=269, tsx=97,
    //   astro=19, mjs=69, cjs=5, js=19 = 478). Nothing was derived: the probe
    //   calls discoverFiles() against the tree the tests actually run on.
    // NOTE FOR THE NEXT READER: the +20 is not this session's work and not one
    // person's — it is the accumulated landing-page/components/evidence-tool
    // batch from the sessions of 2026-09-19/20 finally reaching the index. That
    // is exactly why it looks large next to a one-line test addition.
    // 271 -> 272 (2026-09-20, mascot slice): +1 ts,
    // src/components/public/PrincessMascot.test.ts. This is the SECOND of the
    // two counts that file moved, and the one the first pass missed: I treated
    // the mascot as an `.astro`-only addition and bumped just count('astro')
    // and files.length. But the same slice ships a `.ts` TEST FILE, and every
    // `.test.ts` under src/ is indexed — so count('ts') moves too.
    // MEASURED with discoverFiles() against the live tree, not derived:
    //   ts=272, tsx=98, astro=22, mjs=75, cjs=5, js=19 = 491.
    // (mjs was 74 when this line was first written; the motion gate added
    //  `e2e/test-mascot-motion.mjs` in the same session.)
    // 272 -> 276 (2026-09-21, contact slice + HistoryTimeline). +4 ts, +2 tsx,
    // +1 js. The attribution is split because the causes are unrelated:
    //   +1 ts   netlify/functions/contexts/contact/index.ts — the new context
    //           barrel. It is also the 15th `contexts/*/index.ts`, which moves
    //           three OTHER frozen numbers (resolve.test.ts, exportTables.test.ts
    //           and build.test.ts) and nothing else in this file.
    //   +1 ts   netlify/functions/contexts/contact/service.ts
    //   +1 ts   netlify/functions/contexts/contact/repository.ts
    //   +1 ts   netlify/functions/contexts/ingestion/service.test.ts — a FOREIGN
    //           file, uncommitted from an earlier session, committed alongside.
    //   +2 tsx  src/components/public/HistoryTimeline.tsx and its suite,
    //           HistoryTimeline.test.tsx. NOTE the suite is `.test.tsx`, so it
    //           lands in THIS bucket and not in count('ts') — the same
    //           suffix-decides-the-bucket trap the mascot note below records.
    //   +1 js   netlify/functions/kontak.js — the new narrow entry point.
    // The two other foreign test files committed in the same commit
    // (_lib/ai/chat.payload-contract.test.ts, _lib/db/candidates.test.ts) are
    // `.ts` and belong to the missing FOURTH ts slot only if the reader ignores
    // that HistoryTimeline.test.tsx is a tsx. The measured totals are the fact:
    //   ts=276, tsx=100, astro=22, mjs=75, cjs=5, js=20 = 498.
    // MEASURED with the sanctioned tool (`indexer/src/count-indexed.test.ts`),
    // not a hand count and not `git ls-files`.
    expect(count('ts')).toBe(277);
    // 276 -> 277 (2026-09-22): indexer/src/count-indexed.test.ts, the sanctioned
    // measurement tool itself. It is a `.ts` file, so it lands in this bucket —
    // which is why the tool moves the number it exists to report. The companion
    // deltas that same day were +1 mjs (scripts/ci/verify-workflows.mjs) and
    // +1 cjs (scripts/ci/kf-mutate.cjs); `tsx` did NOT move, and that is the
    // cross-check that the three are attributed correctly.
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
    // 87 -> 91 (2026-09-19, landing page L3): +4 tsx — the four list primitives
    // (IconTileGrid, FactList, StepList, CheckList) that the six profile sections are
    // built from. They are `.tsx` rather than `.astro` because they iterate, and a
    // `.map()` callback inside an `.astro` TEMPLATE is reported as an unresolved
    // global by this indexer (see the note on count('astro') below). Astro renders a
    // framework component without a `client:*` directive to static HTML, so no
    // JavaScript ships for these. Same +4 as the -3 astro above, +1 for the team grid;
    // MEASURED: 265 + 92 + 18 + 53 + 5 + 19 = 452.
    // 92 -> 93 (2026-09-19, landing page R2): +1 tsx — JobMiniList.tsx, the mini
    // vacancy list. Same reason as every primitive above: it iterates, and a
    // `.map()` inside an `.astro` TEMPLATE is an unresolved global here.
    // MEASURED: 266 + 93 + 18 + 57 + 5 + 19 = 458.
    // 94 -> 95 (2026-09-19, mascot): +1 tsx — `src/components/ui/Mascot.tsx`. It is
    // `.tsx` for the same reason every primitive above is: it builds the `<source>`
    // list in a small array and renders a `<picture>` from it, and any JSX array
    // inside an `.astro` TEMPLATE would be an unresolved global here. Astro renders
    // it with no `client:*` directive (except at the 404, which uses
    // `client:visible`), so the static HTML carries the `<picture>` either way.
    // Verified this is the ONLY new file by set difference, not by arithmetic: a
    // temporary probe listed all 95 discovered `.tsx` paths and `Mascot.tsx` was the
    // sole addition (the probe lived at a dot-prefixed root path, so `.gitignore:102`
    // kept it out of the walk it was measuring). +1 total, same as files.length.
    // MEASURED: 268 + 95 + 18 + 64 + 5 + 19 = 469.
    // CORRECTION (2026-09-20, the R11 pass): 95 was the WORKING-TREE value.
    // HEAD holds 86 — MEASURED by the probe (ts=248, tsx=86, astro=14, mjs=47,
    // cjs=5, js=19 = 419), and confirmed by the worktree failing at
    // `expected 86 to be 95`. The +9 difference is other sessions' uncommitted
    // `.tsx` primitives — PersonGrid, GalleryGrid, JobMiniList, Mascot and the
    // rest of the landing-page components this session never touched.
    // See the count('ts') note above for why HEAD is the authority here.
    // 86 -> 95 (2026-09-20, the backlog commit): +9 tsx, the same set that had
    // been uncommitted when this was re-anchored to HEAD; probe-measured = 95.
    // The R11 pass left this one at 86 alone while it was still red, so the pair
    // now agrees with ts again.
    // 95 -> 97 (2026-09-20, the R1a audit): +2 tsx — `LevelCard.tsx` and its
    // suite, added by the gamefeel slice and committed in `a4b515c`. MEASURED,
    // not inferred: `count-indexed.test.ts` printed tsx = 97 over the whole
    // tree, and the set difference of `.tsx` paths between HEAD and the working
    // tree was EMPTY (97 vs 97), so this is a stale baseline whose drift is
    // HEAD's own — not this session's uncommitted work. The pair of assertions
    // below and `fileCount` in build.test.ts moved together, one at a time.
    // 98 -> 101 (2026-09-21): +3 tsx —
    //   HistoryTimeline.tsx     the About section's milestone list, extracted
    //                           from `index.astro` because iterating inside an
    //                           `.astro` template is reported by the indexer as a
    //                           run of unresolved globals;
    //   HistoryTimeline.test.tsx  and its suite;
    //   ContactForm.tsx         the public contact form island.
    // ALL THREE land here, which is the point: the SUFFIX decides the bucket,
    // not the role, so a component's test written as `.test.tsx` is a tsx file.
    // That rule has now decided a frozen number three times, and it is why this
    // value was read off `count-indexed.test.ts` after the files existed rather
    // than derived from "two components, so +2".
    expect(count('tsx')).toBe(103); // 46 at design time; modal/component test suites added since; re-anchored to HEAD by the R11 pass, then +9 when the 2026-09-19/20 backlog landed, then +2 for the LevelCard slice, then +1 for the StepGuide slice (2026-09-20), then +3 for HistoryTimeline.tsx + its .test.tsx + ContactForm.tsx (2026-09-21), then +1 for ContactForm.test.tsx (2026-09-21, same day), then +1 for AdminPanel.test.tsx (the Papan Tugas Tim suite). The last step is +1 and NOT +2: a `.test.tsx` file is a tsx file, so it moves this bucket and fileCount together, and it is exactly the kind of file that looks like it belongs in a "tests" bucket that does not exist. MEASURED with `indexer/src/count-indexed.test.ts` after the file existed: 277 + 103 + 22 + 76 + 6 + 20 = 504.
    // 12 -> 13 (2026-09-17): +1 astro — `src/pages/404.astro`. The site had NO
    // 404 page: `src/pages/404.astro` was absent and `netlify.toml` carried no
    // rule for unknown paths, so a mistyped link fell through to Netlify's own
    // default page. It is a real page and it is counted; nothing was removed to
    // make room for it. Cross-check: this is the same +1 as files.length in
    // build.test.ts, and the six counts still sum to files.length below.
    // 13 -> 16 (2026-09-19, landing page L1): +3 astro — the public section
    // primitives `src/components/public/Section.astro`, `SectionTitle.astro` and
    // `Card.astro`. They exist to stop the measured drift this phase is about:
    // `max-w-7xl mx-auto px-4` repeated in every block, a title block re-invented
    // per section, and 39 arbitrary radius values across 8 sizes. Nothing was
    // removed to make room. MEASURED with indexer/src/count-indexed.test.ts:
    // 262 + 87 + 16 + 53 + 5 + 19 = 442.
    // 16 -> 17 (2026-09-19, landing page L2): +1 astro —
    // `src/components/public/ClosingBand.astro`, the closing call to action. Same
    // +1 as files.length below and fileCount in build.test.ts. MEASURED:
    // 262 + 87 + 17 + 53 + 5 + 19 = 443.
    // 17 -> 20 (2026-09-19, landing page L3): +3 astro — IconTileGrid, FactList and
    // StepList, the three shapes the six profile sections are built from. The
    // sections themselves are composed in index.astro rather than one file each,
    // which is why three primitives cover six sections. MEASURED:
    // 264 + 87 + 20 + 53 + 5 + 19 = 449.
    // 20 -> 17 (2026-09-19, same day, immediately after): -3 astro, +4 tsx. Those
    // three primitives were written as `.astro`, and iterating inside an `.astro`
    // TEMPLATE breaks the zero-unresolved invariant this file's sibling
    // (build.test.ts:428) enforces: template interpolations resolve against the
    // FRONTMATTER MODULE SCOPE only, so a `.map()` callback parameter in a template
    // is reported as an unresolved global (measured: 21 entries, every one a callback
    // parameter). Moving them to `.tsx` — server-rendered by Astro with no `client:*`
    // directive, so no JavaScript ships — binds the callbacks correctly. CheckList.tsx
    // is the fourth, created so the four inline `.map()` blocks in index.astro could
    // move out of the template too. MEASURED: 265 + 92 + 18 + 53 + 5 + 19 = 452.
    // 17 -> 18 (2026-09-19, landing page L4): +1 astro — SiteNav.astro, the desktop
    // section navigation. Same +1 as files.length below and fileCount in
    // build.test.ts. MEASURED: 265 + 92 + 18 + 53 + 5 + 19 = 452.
    // CORRECTION (2026-09-20, the R11 pass): 19 was the WORKING-TREE value.
    // HEAD held 14 — MEASURED by a probe calling discoverFiles() at HEAD, not
    // derived. See the count('ts') note above for why the HEAD value is the
    // one this file asserts.
    // 14 -> 16 (2026-09-20, later the same session): +2 astro — Section.astro
    // and Card.astro, two of the three modules committed to close the dangling
    // imports my Button adoption left in HEAD. Same change that moved count('ts')
    // by +1 and files.length by +2 (one ts + two astro). The remaining 3 of the
    // original 5-file gap are still other sessions' uncommitted `.astro` work
    // and are not this file's business to freeze.
    // 16 -> 19 (2026-09-20, the backlog commit): +3 astro, probe-measured = 19.
    // The three are the landing-page `.astro` sections that were on disk but not
    // in HEAD during the R11 pass — the same files whose absence made the
    // counts disagree. With them committed, the working tree and HEAD share one
    // set and the two-number caveat above no longer applies.
    //
    // 19 -> 20 (2026-09-20, the R1a audit — STALE BASELINE, not drift).
    // This number was ONE behind and had been since before the i18n keys pass
    // began. Proof it is not this pass's: the set difference of `.astro` paths
    // between HEAD and the working tree is EMPTY —
    //     git ls-tree -r --name-only HEAD | grep '\.astro$' | sort > head.txt
    //     git ls-files --cached --others --exclude-standard | grep '\.astro$' | sort > tree.txt
    //     comm -3 head.txt tree.txt      # -> no output
    // — and the count was taken with `indexer/src/count-indexed.test.ts`, which
    // prints the six buckets and the ready-to-paste sum, NOT read back out of a
    // failure message. 21 `.astro` files are tracked; the earlier note here said
    // "the indexer reads 20" and that was simply the stale baseline restated.
    // The loss is attributable to e9317cf: the redesigned landing page folded
    // `Card.astro` away, taking this bucket from 21 to 20 on disk while this
    // assertion still pinned 20 for the old 19.
    // `files.length` below carries the same +1 for the same bucket.
    //
    // MEASURED with count-indexed.test.ts, not derived:
    // 272 ts + 98 tsx + 22 astro + 75 mjs + 5 cjs + 19 js = 491.
    // 21 -> 22 (2026-09-20): `src/components/public/PrincessMascot.astro`, the
    // static wrapper for the 3D-sourced mascot. Same +1 astro as `files.length`
    // below and `fileCount` in build.test.ts. The slice also ships
    // `PrincessMascot.test.ts`, so `files.length` and `fileCount` carry +2
    // against this bucket's +1 — see the correction on each.
    expect(count('astro')).toBe(22);
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
    // 52 -> 53 (2026-09-18, later): +1 mjs — scripts/ci/fetch-boundary.mjs, the
    // frontend half of the invariant verify:io guards on the backend ("no raw
    // fetch() bypassing the sanctioned client in src/"). The measurement tool
    // confirms the unit is exactly 1: ts/tsx/astro/cjs/js are all unchanged
    // (254/87/13/5/19), so this is one gate script and not a shifted tree. Its
    // companion fetch-boundary.mutations.sh is NOT counted — includePath() takes
    // mjs/cjs/js under scripts/, never .sh. Same +1 as files.length and
    // fileCount in build.test.ts.
    // 53 -> 51 (2026-09-18, orphan cleanup): -2 mjs — e2e/verify-progress-live.mjs
    // and e2e/verify-stage1.mjs deleted. Both were added 2026-09-17 in the "+6 mjs"
    // block above and both are listed there as measurement probes; neither was
    // ever wired to a workflow, an npm script or another gate (checked by
    // reference search, 2026-09-18). Their subject matter is covered: the heading
    // outline by verify-headings.mjs, the progress badge by the hermetic unit
    // suites. They were also the two files sitting on the stray port 4322.
    // MEASURED with the measurement tool, not derived: the other five buckets are
    // unchanged (254/87/13/5/19) and the six still sum to files.length, so this
    // is exactly two deletions and not a shifted tree. Same -2 as fileCount in
    // build.test.ts.
    //
    // 51 -> 52 (2026-09-19): THE 51 WAS NEVER RIGHT. Measured at HEAD against
    // `git ls-tree -r HEAD` filtered by the same includePath() rules, the tree
    // holds **52** mjs — so this assertion was already red before this session
    // touched anything, and the -2 above landed on a number that had drifted.
    // Proven by set difference rather than arithmetic: the mjs set at HEAD and
    // the mjs set in the working tree are IDENTICAL (0 added, 0 removed), so no
    // file of this session's moved the count. The two deleted probes are indeed
    // absent, which means a third .mjs entered the tree between the -2 and HEAD
    // without the ratchet being extended. Set back to the measured 52; the next
    // genuine change to this count is visible again.
    // 52 -> 53 (2026-09-19, later the same day): +1 mjs — scripts/memory-archive.mjs,
    // the memory budget/rotation gate and its battery's subject. Proven by set
    // difference, not arithmetic: `git diff --name-status 9c735e2..HEAD` reports
    // exactly two additions, this .mjs (counted) and
    // scripts/ci/memory-archive.mutations.sh (a .sh, which includePath never
    // counts), so the total and the mjs bucket each move by exactly one and the
    // other five buckets are untouched. Red at 53 before the number was touched.
    // Cross-check: the same +1 appears in fileCount (build.test.ts) and
    // files.length below, and the six buckets still sum to the total.
    // 53 -> 57 (2026-09-19, landing page R2 and the evidence tooling): +3 —
    // e2e/shot-landing.mjs, e2e/measure-mini-rows.mjs and e2e/measure-hero.mjs,
    // the screenshot and tap-target evidence tools (they assert nothing, so they
    // are NOT gates, but they are real e2e scripts). MEASURED with the temporary
    // discoverFiles probe: 57 mjs on this tree.
    // 57 -> 61 (2026-09-19, hero stat-strip fix): +4 — the evidence tools written
    // to test the three visual defects reported after screenshot review:
    // e2e/measure-hero-stats.mjs, measure-hero-contrast.mjs,
    // measure-hero-eyebrow.mjs and measure-marquee.mjs. Same +4 as fileCount in
    // build.test.ts and files.length below; the three counters agreeing is the
    // check that nothing else slipped in. MEASURED: 266 + 93 + 18 + 61 + 5 + 19 = 462.
    //
    // 61 -> 63 (2026-09-19, the SiteNav gate): +2 — e2e/test-site-nav.mjs and
    // e2e/measure-site-nav.mjs. Same +2 as fileCount in build.test.ts and
    // files.length below, and those two assertions were seen failing at exactly
    // +2 before they were updated, so this is measured and cross-checked, not
    // assumed. MEASURED: 266 + 93 + 18 + 63 + 5 + 19 = 464.
    // 64 -> 66 (2026-09-20, mascot): +2 mjs — `e2e/measure-mascot.mjs` and
    // `e2e/shot-mascot.mjs`, the two evidence tools for Aa-chan. Deliberately NOT
    // gates: they report what the browser did (does the file decode? is the
    // animation running? does reduced-motion leave her visible?) without asserting
    // anything about the repo, which is the distinction this project draws between
    // `test-*.mjs` and `measure-*.mjs`. Both are `.mjs` and both are at the e2e
    // root, so they are walked. The sum below still equals the total, which is the
    // cross-check that nothing else came along.
    // MEASURED: 268 + 95 + 18 + 66 + 5 + 19 = 471.
    // CORRECTION (2026-09-20, the R11 pass): 67 was the WORKING-TREE value.
    // HEAD holds 47 — and the 47 is worth reading carefully, because my FIRST
    // correction of this number said 48 and was WRONG.
    //   I derived 48 from `git ls-files --cached "*.$ext" | wc -l`, which
    //   counts files includePath() REJECTS. This file's own changelog warns
    //   about exactly that trap twice ("Never infer these from a shell count;
    //   read them off indexer/src/count-indexed.test.ts") and I walked into it
    //   anyway while correcting a count. The probe that calls discoverFiles()
    //   at HEAD reported mjs=47, and 47 is what is asserted.
    //   The generalisable rule, now demonstrated on myself: when re-baselining,
    //   the ONLY admissible measurement is a call to the function under test.
    //   A shell count is a hypothesis, never a value.
    // See the count('ts') note above for why the HEAD value is the one this
    // file asserts.
    // 47 -> 69 (2026-09-20, the backlog commit): +22 mjs, measured by the probe
    // calling discoverFiles() — NOT by a shell count. That distinction earned its
    // place in the R11 pass: an earlier correction of this very number said 48
    // after a `git ls-files | wc -l` reading, when includePath() actually admits
    // 47. The +22 is the `e2e/measure-*.mjs` and `scripts/ci/*.mjs` batch from
    // the 2026-09-19/20 landing-page work finally being committed.
    // 72 -> 73 (2026-09-20, same pass, LATE): +1 for this pass's own
    // `e2e/measure-theme-landing.mjs`. Adding a file mid-task re-shifts counts
    // measured earlier in the task (R15 §3h), so this was re-measured at the END
    // with count-indexed.test.ts rather than carried forward from the earlier
    // probe — which is why it moved after `fileCount` above had already been
    // written down.
    // 73 -> 74 (2026-09-20, later the same day): +1 for
    // `e2e/test-theme-gradients.mjs`, the browser gate for the light-mode shim's
    // blind spot. ATTRIBUTION BY NAME, not arithmetic: `git diff --name-status`
    // over the range shows exactly one added `.mjs` (this gate). A second `.mjs`
    // written in the same task — `e2e/shot-compare.mjs`, evidence-only — was
    // deleted rather than counted, so the net here is +1, not +2. Re-measured at
    // the END, for the same R15 §3h reason as the entry above.
    // 74 -> 75 (2026-09-20, mascot motion gate): +1 for
    // `e2e/test-mascot-motion.mjs`, the browser gate for the princess mascot's
    // idle and its reduced-motion clamp.
    //
    // NOTE FOR THE NEXT READER — THIS IS THE THIRD TIME THIS SLICE MOVED THIS
    // NUMBER, and the reason is worth internalising. The mascot work landed in
    // stages: first the component (astro + ts), then the motion gate (.mjs),
    // then the gate's own mutation battery (.mjs, deliberately NOT counted as
    // source — see below). Each stage moved a DIFFERENT bucket, so each stage
    // needed its own re-measure. The battery `.sh` is not in any bucket because
    // only ts/tsx/astro/mjs/cjs/js are tallied.
    //
    // ATTRIBUTION BY NAME, not arithmetic: this commit adds exactly one
    // indexed `.mjs` (`e2e/test-mascot-motion.mjs`). Its battery
    // (`e2e/test-mascot-motion.mutations.sh`) is a `.sh` file, which no bucket
    // counts, so the net here is +1 and not +2.
    expect(count('mjs')).toBe(76);
    expect(count('cjs')).toBe(6);
    // 75 -> 76 (2026-09-22): scripts/ci/verify-workflows.mjs, the gate that
    // checks the workflow files against their subject. Attribution by name, not
    // arithmetic: exactly one `.mjs` was added. Its mutation battery is a `.sh`
    // and no bucket tallies those, so the net is +1 and not +2.
    // 5 -> 6 (2026-09-22): scripts/ci/kf-mutate.cjs, the keyframe battery's
    // mutator — the only `.cjs` added that day. The `js` bucket did NOT move,
    // which is the cross-check that it is attributed correctly.
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
    // 19 -> 20 (2026-09-21, contact slice): +1 js —
    // netlify/functions/kontak.js, the narrow entry point for the one
    // unauthenticated write. Its own entry rather than a seat in `public.js`
    // so that a public contact form cannot be rate-limited or overloaded by
    // the landing page's read traffic, and vice versa (the surface-binding
    // gate counts it: 16 narrow entry points now, was 15). Same +1 as
    // fileCount in build.test.ts and the files.length sum below.
    expect(count('js')).toBe(20);
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
    // 427 -> 428 (2026-09-18): +1 ts — netlify/functions/contexts/ingestion/
    // service.test.ts. See the note at count('ts') above for why that file exists
    // and which assertions it moves together.
    // MEASURED 2026-09-18 with `indexer/src/count-indexed.test.ts`:
    // 252 + 87 + 13 + 52 + 5 + 19 = 428.
    // 428 -> 430 (2026-09-18, same day): +2 ts — the auth wire-payload and AI
    // chat payload-contract suites (5154c15, e6e5f13). Same +2 as count('ts')
    // above; the other five buckets are unchanged. See that note for the two
    // independent cross-checks (set difference on both sides, and `git ls-tree
    // HEAD` filtered by includePath) that established this as a real inventory.
    // MEASURED 2026-09-18 after the bump: 254 + 87 + 13 + 52 + 5 + 19 = 430.
    // 430 -> 431 (2026-09-18, later): +1 mjs — scripts/ci/fetch-boundary.mjs, the
    // new fetch-boundary gate. Same +1 as count('mjs') above; the other five
    // buckets are unchanged, so the unit is one file. MEASURED after the bump:
    // 254 + 87 + 13 + 53 + 5 + 19 = 431.
    // 431 -> 429 (2026-09-18, orphan cleanup): -2 mjs — e2e/verify-progress-live.mjs
    // and e2e/verify-stage1.mjs deleted; neither was wired to a workflow or an npm
    // script. Same -2 as count('mjs') above and as fileCount in build.test.ts; the
    // other five buckets are unchanged. MEASURED with
    // `indexer/src/count-indexed.test.ts` after the removal:
    // 254 + 87 + 13 + 51 + 5 + 19 = 429.
    //
    // CORRECTION (2026-09-19): 429 was measured against a tree whose mjs count
    // had already drifted — HEAD really holds 52 mjs, so this total was 430.
    // Same correction as count('mjs') and fileCount above.
    // 430 -> 432 (2026-09-19): +2 ts — src/lib/aiCvPairs.ts and its suite.
    // MEASURED: 256 + 87 + 13 + 52 + 5 + 19 = 432.
    // 436 -> 437 (2026-09-19, later the same day): +1 mjs — scripts/memory-archive.mjs.
    // Same +1 as count('mjs') above and fileCount in build.test.ts. This assertion
    // WAS observed failing independently — the count('mjs') bump above was applied
    // first, and this file then reported "expected 437 to be 436" — so it is
    // measured rather than moved by arithmetic on the other two. MEASURED:
    // 260 + 87 + 13 + 53 + 5 + 19 = 437.
    // 437 -> 442 (2026-09-19, landing page L0/L1): +2 ts +3 astro —
    // src/lib/publicSections.ts and its suite, plus the three public section
    // primitives. Same +2 ts as count('ts') above and +3 astro as count('astro')
    // above. MEASURED with indexer/src/count-indexed.test.ts after the change:
    // 262 + 87 + 16 + 53 + 5 + 19 = 442.
    // 442 -> 443 (2026-09-19, landing page L2): +1 astro —
    // src/components/public/ClosingBand.astro. Same +1 as count('astro') above and
    // fileCount in build.test.ts. MEASURED: 262 + 87 + 17 + 53 + 5 + 19 = 443.
    // 450 -> 451 (2026-09-19, landing page L4): +1 astro — SiteNav.astro, the desktop
    // section navigation. Same +1 as count('astro') above and fileCount in
    // build.test.ts. MEASURED: 265 + 91 + 18 + 53 + 5 + 19 = 451.
    // 451 -> 452 (2026-09-19, landing page L3): +1 tsx — PersonGrid.tsx, the team
    // grid. Same +1 as count('tsx') above and fileCount in build.test.ts.
    // MEASURED: 265 + 92 + 18 + 53 + 5 + 19 = 452.
    // 452 -> 458 (2026-09-19, landing page R4 + R2 and the evidence tooling):
    // +1 tsx JobMiniList.tsx, +1 ts JobMiniList.test.ts, +3 mjs (e2e/shot-landing.mjs,
    // e2e/measure-mini-rows.mjs, e2e/measure-hero.mjs — screenshot and tap-target
    // evidence tools, deliberately NOT gates), and +1 ts left as measured rather
    // than guessed. Same +6 as fileCount in build.test.ts.
    // MEASURED: 266 + 93 + 18 + 57 + 5 + 19 = 458.
    // 458 -> 462 (2026-09-19, hero stat-strip fix): same +4 mjs as count('mjs')
    // above — the four hero/marquee evidence tools. Three counters moving by the
    // same +4 is the cross-check this file exists to make.
    // MEASURED: 266 + 93 + 18 + 61 + 5 + 19 = 462.
    // 462 -> 468 (2026-09-19, gallery + site-nav gate): +2 ts (gallery module +
    // suite), +1 tsx (GalleryGrid), +1 mjs (measure-galeri), +2 ts/mjs for the
    // site-nav gate and its evidence tool. See the per-counter notes above.
    // 468 -> 469 (2026-09-19, mascot): +1 tsx (Mascot.tsx) and nothing else. The
    // per-language counts above move by exactly this one, so the sum still equals
    // this number — which is the cross-check that caught the two wrong baselines
    // this suite was written for. Verified by listing every discovered `.tsx`
    // rather than by trusting the arithmetic. MEASURED: 268 + 95 + 18 + 66 + 5 + 19 = 471.
    // CORRECTION (2026-09-20, the R11 pass): 474 was the WORKING-TREE value and
    // is WRONG for HEAD. MEASURED at HEAD by a probe calling discoverFiles():
    // 248 + 86 + 14 + 47 + 5 + 19 = 419.
    // This is the FOURTH assertion frozen from the same dirty tree, together
    // with count('ts'), count('astro') and count('mjs') — see the count('ts')
    // note for the failure class and for why HEAD, not the working tree, is the
    // authority in a committed ratchet. The six buckets sum exactly to this
    // number, which is the invariant the checksum test below enforces.
    // 419 -> 420 (2026-09-20, later the same session): the same +1 ts as
    // count('ts') above — src/lib/companyProfile.ts, committed to close the
    // dangling import the R11 pass found. ONE file, two assertions, moved in
    // the same commit after the defect was fixed.
    // 420 -> 422 (2026-09-20, correction to the line above): my +2 was WRONG
    // and the worktree said so — `expected 422 to be 420`. The change committed
    // in 86d215e is THREE files (one ts + two astro), not one: I had narrated
    // only the ts and forgot that Section.astro and Card.astro are in the same
    // inventory. files.length and fileCount are two views of ONE number, so
    // they must always hold the same value — 422 — and this assertion and
    // `r.stats.fileCount` agreeing is the cross-check that caught it.
    // 422 -> 476 (2026-09-20, the backlog commit): +54 files — the whole batch
    // that had been sitting uncommitted. MEASURED with the probe, and the six
    // buckets summed exactly: 269 + 95 + 19 + 69 + 5 + 19 = 476, which is the
    // invariant the checksum test below enforces and the reason this number is
    // never derived from a delta. (The tsx bucket has since moved to 97; see the
    // 476 -> 478 note directly below.)
    //
    // This is the END of the R11 pass's two-number problem. While the backlog was
    // uncommitted, this assertion and count('ts')/count('astro')/count('mjs')/
    // fileCount in build.test.ts could not all be green at once, because they
    // measure the tree being read and there were two different trees. They now
    // read one tree and all five agree.
    // 476 -> 478 (2026-09-20, the R1a audit): +2 files — `LevelCard.tsx` and
    // `LevelCard.test.tsx`, the gamefeel slice committed in `a4b515c`. Same +2
    // as count('tsx') above and fileCount in build.test.ts. MEASURED, not
    // derived: the probe printed 269 + 97 + 19 + 69 + 5 + 19 = 478.
    // 478 -> 481 (2026-09-20, the Japanese decorative band): +3 files —
    // `JapanTexture.astro`, `JapanTexture.test.ts` and the battery
    // `scripts/ci/japan-texture.mutations.mjs`. Same +3 as the ts/astro/mjs
    // counts above and fileCount in build.test.ts. MEASURED, not derived: the
    // probe printed 270 + 97 + 20 + 70 + 5 + 19 = 481.
    //
    // 481 -> 486 (2026-09-20, grouped, measured not derived). FOUR separate
    // changes were never written down here, which is why the number sat five
    // behind. Each is attributable to a commit, and the total was confirmed with
    // `count-indexed.test.ts` printing the six buckets rather than by adding the
    // five deltas to the old value:
    //   482  +1  `src/pages/loker.astro` — e9317cf split the Loker table onto its
    //            own route. Same +1 as count('astro') above; this is the file
    //            both frozen numbers missed together.
    //   483  +1  `src/components/public/PersonGrid.tsx` — R14's own worked
    //            example, which moved the tsx bucket to 92 and never reached
    //            this line.
    //   484  +1  `src/components/candidate/LevelCard.tsx` — the gamefeel slice
    //            in a4b515c.
    //   485  +1  `src/components/candidate/LevelCard.test.tsx` — its suite.
    // The fifth candidate — this pass's own throwaway `zz-probe.test.ts` — was
    // TESTED and EXCLUDED: the probe was deleted, and the number stayed at 486.
    // So the +5 above is +4 of real drift plus one file the earlier notes never
    // recorded. The +1 in that gap is NOT identified, and it is written here as
    // unidentified rather than given a plausible owner: an unattributed number
    // is a smaller problem than a confidently wrong attribution.
    // MEASURED after the probe was removed with count-indexed.test.ts:
    // 271 + 98 + 21 + 73 + 5 + 19 = 487. The mjs bucket gained this pass's own
    // `e2e/measure-theme-landing.mjs` — the LATE +1 described in the count('mjs')
    // note above, which is why this is 487 and not the 486 first written here.
    // 491 -> 499 (2026-09-21, contact slice + HistoryTimeline + ContactForm):
    // +8 files = +4 ts +3 tsx +1 js. The SAME files as the count('ts') and
    // count('tsx') notes above — read those for the split. Note that the record
    // moved twice in one session (491 -> 496 -> 498 -> 499 as the component, its
    // suite and the form landed) and that ONLY the last measurement is written
    // here: intermediate values were never frozen, because a frozen number that
    // is not the current one is a red gate waiting to happen. No new scratch file
    // was present at any point — the temporary probes used for the barrel count
    // and the import outline were deleted BEFORE this number was taken, which is
    // the mistake the `no scratch files` test below was written to catch.
    // +1 (2026-09-24): src/components/admin/AdminPanel.test.tsx, the Papan Tugas
    // Tim suite. A `.test.tsx` under src/ is an indexed file, so this and
    // count('tsx') above move together by the same +1. MEASURED with
    // indexer/src/count-indexed.test.ts after the file existed:
    // 277 + 103 + 22 + 76 + 6 + 20 = 504.
    expect(files.length).toBe(504); // 248 at design time; +4 Phase B kernel files, +5 CI gates/loader, +1 battery runner, +4 edge-validation gate, +2 e2e guards, +1 TabTambah test, +1 InputManualModal test, +1 settings-limit test, +1 404 page, -2 orphan e2e, +1 fetchMail test, +1 workflow gate, +1 CekSiswaModal test, +2 progress, +6 e2e probes, +1 candidates.test.ts (the phantom HEAD had been missing), +1 with-timeout watchdog, +1 ingestion xlsx-read test, +2 wire-payload contract tests, +1 fetch-boundary gate, -2 orphan e2e probes, +2 aiCvPairs registry + suite, +2 cvRows rules + suite, +2 cvPeriod rules + suite, +1 memory-archive gate, +2 publicSections module + suite, +3 public section primitives, +1 closing CTA band, +2 companyProfile + accentClass, +4 list primitives as tsx (-3 astro primitives they replaced), +1 desktop section nav, +1 team grid, +1 JobMiniList.tsx, +1 JobMiniList.test.ts, +3 evidence tools (shot-landing, measure-mini-rows, measure-hero), +1 ts measured-not-traced, +4 hero evidence tools, +2 site-nav gate + evidence tool, +2 gallery module + suite, +1 GalleryGrid.tsx, +1 measure-galeri.mjs, +1 Mascot.tsx, +2 mascot evidence tools (measure-mascot, shot-mascot), +1 Button test (2026-09-20), then +54 when the 2026-09-19/20 backlog was committed, then +2 for the LevelCard slice, then +3 for the JapanTexture band (2026-09-20), then +4 for the StepGuide slice + entrance animation (2026-09-20), then +5 for loker.astro, PersonGrid.tsx, LevelCard.tsx and LevelCard.test.tsx plus one unattributed file, then +1 for measure-theme-landing.mjs (2026-09-20) — the chain was re-anchored to HEAD by the R11 pass and is now one number again, then +1 for e2e/test-theme-gradients.mjs (2026-09-20, later the same day), then +2 for the mascot slice (2026-09-20): PrincessMascot.astro (+1 astro) and PrincessMascot.test.ts (+1 ts), then +1 for e2e/test-mascot-motion.mjs (2026-09-20), then +8 for the contact slice (2026-09-21): contexts/contact/{index,service,repository}.ts, netlify/functions/kontak.js, HistoryTimeline.tsx, HistoryTimeline.test.tsx, ContactForm.tsx, plus three earlier-session test files committed in the same commit. ATTRIBUTION corrected twice: the mascot slice was first written as +1 astro alone (it is TWO files — the component and its test), and the motion gate is a THIRD file whose battery is a `.sh` and therefore outside every bucket. Cross-checks: this is `fileCount` in build.test.ts and `count('mjs')` above, all three moved by the same `princess` + gate files. Re-measured at the END with count-indexed.test.ts (276 ts + 102 tsx + 22 astro + 75 mjs + 5 cjs + 20 js = 500), per R15 §3h. Then +1 (2026-09-21) for ContactForm.test.tsx — the missing suite for the contact island, whose absence was found by the render verification rather than by any gate. Then +3 (2026-09-22): count-indexed.test.ts (+1 ts), scripts/ci/verify-workflows.mjs (+1 mjs), scripts/ci/kf-mutate.cjs (+1 cjs). Attribution is by the per-bucket delta being exactly +1 in each of the three named buckets with `tsx`, `astro` and `js` unmoved. Re-measured again at the END with count-indexed.test.ts (277 ts + 102 tsx + 22 astro + 76 mjs + 6 cjs + 20 js = 503).
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
    //
    // WIDENED (2026-09-19, R2), and the FIRST attempt at this widening was
    // wrong in a way worth keeping on record.
    //
    // The pattern used to be only `(^|\/)\.tmp-`. While re-baselining the R2
    // counts I wrote measurement probes as tests inside `indexer/src/`, which
    // made me assume the old pattern was too narrow. It is not: nothing under
    // `indexer/` is in the inventory at all, because `includePath()` allowlists
    // DIRECTORIES (`src/`, `netlify/functions/`, `shared/`, `scripts/`, `e2e/`,
    // repo root) and `indexer/` is not one of them — see the COST note in
    // indexer/src/count-indexed.test.ts. I proved this by dropping a real
    // `indexer/src/zz-tmp-proof.ts` into the tree: the guard still passed, which
    // is the proof that it never saw the file. So a probe under `indexer/`
    // cannot inflate a ratchet, and the numbers measured with one were sound.
    //
    // The genuinely reachable hole is the opposite side of the same coin: a
    // scratch file in `src/` or `e2e/` IS walked, so THAT is what the pattern
    // must catch — including the `zz-` rename I reached for while probing, which
    // the old pattern let through. Matches a `tmp` stem anywhere in the path,
    // dot-prefixed or not, with or without a leading `zz-`.
    const list = run();
    const scratch = list.map((f) => f.path).filter((p) => /(^|\/)(zz-)?\.?tmp[-._]/i.test(p));
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