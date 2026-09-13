/**
 * jobs-limit.test.ts — the public board must not truncate to one row.
 *
 * Regression guard for a real production bug (found 2026-09-13):
 * `findJobs()` called `findTable([...])` without a limit, inheriting
 * `findTable`'s default of `limit = 1`. That default exists because findTable
 * was built to probe *whether a table exists* — but findJobs() needs the ROWS.
 *
 * Effect: the Astro public board served 1 job while the database held 158 and
 * the legacy site returned 159. The owner reported it as
 * "data juga cuma masuk 1 doank".
 *
 * Why a structural test rather than a fixture test: the bug was not in the
 * mapping, it was in an argument that was simply never passed. The only place
 * that failure is visible without a live database is the call signature, so we
 * assert on the source text — and we assert the constant is non-trivial, so a
 * future "fix" cannot silently set it to 1 again.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const JOBS = join(ROOT, 'netlify', 'functions', '_lib', 'db', 'jobs.ts');
const REPO = join(
  ROOT,
  'netlify',
  'functions',
  'contexts',
  'catalog',
  'repository.ts',
);
const CLIENT = join(ROOT, 'netlify', 'functions', '_lib', 'db', 'client.ts');

describe('public job board — row limit', () => {
  it('findTable still defaults to 1 (its probe semantics must not change silently)', () => {
    const src = readFileSync(CLIENT, 'utf-8');
    expect(src).toMatch(/async function findTable\(candidates: string\[\], limit = 1\)/);
  });

  it('findJobs passes an explicit limit', () => {
    const src = readFileSync(JOBS, 'utf-8');
    // The call must span past the array literal and supply a second argument.
    const m = src.match(
      /async function findJobs\(\)\s*\{\s*return findTable\(\s*\[[\s\S]*?\],\s*([A-Za-z_][\w]*)\s*,?\s*\);/,
    );
    expect(
      m,
      'findJobs() must pass an explicit limit as findTable\'s 2nd argument; ' +
        'omitting it silently caps the public board at 1 job.',
    ).toBeTruthy();
  });

  it('the limit is a named constant, not a bare literal', () => {
    const src = readFileSync(JOBS, 'utf-8');
    expect(src).toMatch(/const JOB_BOARD_LIMIT = \d+;/);
  });

  it('the limit is large enough for the real board (>= 100)', () => {
    const src = readFileSync(JOBS, 'utf-8');
    const n = Number(src.match(/const JOB_BOARD_LIMIT = (\d+);/)?.[1]);
    expect(n).toBeGreaterThanOrEqual(100);
  });

  it('the schema-detection fallback also passes the limit', () => {
    const src = readFileSync(REPO, 'utf-8');
    expect(
      /await findTable\(\[name\], JOB_BOARD_LIMIT\)/.test(src),
      'repository.ts fallback must pass JOB_BOARD_LIMIT too — otherwise it ' +
        'truncates the board whenever the primary table probe misses.',
    ).toBe(true);
  });

  it('repository.ts imports the shared constant (single source of truth)', () => {
    const src = readFileSync(REPO, 'utf-8');
    expect(src).toMatch(/import \{[^}]*JOB_BOARD_LIMIT[^}]*\} from '\.\.\/\.\.\/_lib\/db\/jobs'/);
  });
});
