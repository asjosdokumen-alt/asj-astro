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
    expect(count('ts')).toBe(208); // +2 uploadBerkas.ts/.test.ts 2026-09-08 (storage kandidat/<wa> UI)
    expect(count('tsx')).toBe(78); // 46 at design time; modal/component test suites added since
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
    expect(count('mjs')).toBe(23); // 11 at design time; e2e + scripts/ci gates added since
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
    expect(count('js')).toBe(18);
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
    expect(files.length).toBe(344); // 248 at design time; +4 Phase B kernel files, +5 CI gates/loader
  });

  it('emits NTFS-safe lookup keys (lowercased) with original casing preserved', () => {
    for (const f of run()) {
      expect(f.lookupPath).toBe(f.path.toLowerCase());
      expect(f.lookupPath).toBe(f.lookupPath.toLowerCase());
    }
  });
});