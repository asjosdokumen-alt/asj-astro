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
  return execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8', cwd: ROOT })
    .split(/\r?\n/)
    .filter(Boolean)
    .map(toPosix)
    .filter(includePath)
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

  it('counts match the measured profile (design §1, +test-supabase-auth.mjs + CJS entries)', () => {
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
    expect(count('ts')).toBe(220); // +2 uploadBerkas.ts/.test.ts 2026-09-08 (storage kandidat/<wa> UI)
    // 78 -> 79 (2026-09-13, owner-approved item 2):
    // src/components/ui/AiUnavailableBanner.tsx.
    expect(count('tsx')).toBe(79); // 46 at design time; modal/component test suites added since
    expect(count('astro')).toBe(12);
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
    expect(count('mjs')).toBe(27); // 11 at design time; e2e + scripts/ci gates added since
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
    // router action has no narrow home. 18 -> 19.
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
    expect(files.length).toBe(362); // 248 at design time; +4 Phase B kernel files, +5 CI gates/loader
  });

  it('emits NTFS-safe lookup keys (lowercased) with original casing preserved', () => {
    for (const f of run()) {
      expect(f.lookupPath).toBe(f.path.toLowerCase());
      expect(f.lookupPath).toBe(f.lookupPath.toLowerCase());
    }
  });
});