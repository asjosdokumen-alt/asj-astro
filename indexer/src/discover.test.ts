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
    expect(count('ts')).toBe(202); // +2 uploadBerkas.ts/.test.ts 2026-09-08 (storage kandidat/<wa> UI)
    expect(count('tsx')).toBe(78); // 46 at design time; modal/component test suites added since
    expect(count('astro')).toBe(12);
    // 2026-09-11: the Phase A/B CI gates landed — bundle-size.mjs,
    // surface-binding.mjs, verify-aliases.mjs, scripts/lib/load-env.mjs, and
    // io-boundary.mjs — none of which were reflected here at the time.
    // 15 -> 17.
    expect(count('mjs')).toBe(17); // 11 at design time; e2e + scripts/ci gates added since
    expect(count('cjs')).toBe(5);
    // Phase A (2026-09-11): netlify/functions/run-migration.js deleted — the
    // action was already removed from the registry, so the entry point was a
    // dead 690 KB catch-all. 29 -> 28.
    expect(count('js')).toBe(28);
    expect(files.length).toBe(342); // 248 at design time; +4 Phase B kernel files, +5 CI gates/loader
  });

  it('emits NTFS-safe lookup keys (lowercased) with original casing preserved', () => {
    for (const f of run()) {
      expect(f.lookupPath).toBe(f.path.toLowerCase());
      expect(f.lookupPath).toBe(f.lookupPath.toLowerCase());
    }
  });
});