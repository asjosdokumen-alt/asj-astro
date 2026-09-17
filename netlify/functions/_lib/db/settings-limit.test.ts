/**
 * settings-limit.test.ts — the config table must not truncate to one row.
 *
 * THE SAME BUG AS jobs-limit.test.ts, IN THE OTHER CALL SITE.
 *
 * `findTable()` defaults to `limit = 1` because it was built to answer *does
 * this table exist?*. Its sibling `findJobs()` was fixed on 2026-09-13 after the
 * owner reported "data juga cuma masuk 1 doank" — but `findSettings()` and
 * `findAnnouncements()` inherited the same default and were never revisited.
 *
 * MEASURED 2026-09-16 against the live database. sys_config holds 158 rows
 * across 11 config_type values. Read with limit=1, the single row returned was
 *
 *     id=bd43a55a-63a3-4c0c-84c2-c4c0d8bbfbde  config_type="tsk"  value="TSK VIBE"
 *
 * so `loadPublicBase()` built `dropdowns = { tsk: ["TSK VIBE"] }`. Every other
 * key — tahapan, kategori, gender, lokasi, syarat — was ABSENT rather than
 * empty, and the add-job form renders its selects from those keys. The owner
 * reported it as "ga ada drop downnya" (there is no dropdown).
 *
 * SECOND EDGE, WORSE THAN THE DISPLAY ONE. `replaceConfigItems()` in
 * contexts/configuration finds the rows to DELETE through findSettings(). With
 * one row visible it deleted at most one row and then inserted the whole list
 * back, so editing any list duplicated its entries. Measured signature in
 * production data: `tsk` holds 36 rows but only 35 distinct values, with
 * "TSK MAHER" present twice.
 *
 * Why a structural test rather than a fixture test: as with findJobs(), the bug
 * was not in the mapping — it was an argument that was simply never passed, and
 * the only place that is visible without a live database is the call signature.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MISC = join(ROOT, 'netlify', 'functions', '_lib', 'db', 'misc.ts');
const CLIENT = join(ROOT, 'netlify', 'functions', '_lib', 'db', 'client.ts');
const CONFIG_REPO = join(
  ROOT,
  'netlify',
  'functions',
  'contexts',
  'configuration',
  'repository.ts',
);

/**
 * Extract one function's body by brace matching.
 *
 * WHY NOT A REGEX OVER THE WHOLE FILE. The first version of this guard used
 * `/findSettings\(\)[\s\S]*?findTable\(...\)/`, and the mutation battery killed
 * it: `[\s\S]*?` is not scoped to the function, so when findSettings() lost its
 * limit the pattern simply walked forward and matched the limit belonging to
 * findAnnouncements() instead — capturing "SETTINGS_ROW_LIMIT" and reporting a
 * pass over a body that no longer passed anything. A guard whose scope is
 * "somewhere later in this file" cannot see a per-function regression; that is
 * the aggregate-hides-a-dead-unit failure mode, and the battery found it.
 *
 * So each assertion is scoped to the exact body it is about.
 */
function bodyOf(src: string, signature: string): string {
  const start = src.indexOf(signature);
  expect(start, `could not find "${signature}" in the source`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces after "${signature}"`);
}

describe('settings table — row limit', () => {
  it('findTable still defaults to 1 (its probe semantics must not change silently)', () => {
    const src = readFileSync(CLIENT, 'utf-8');
    expect(src).toMatch(/async function findTable\(candidates: string\[\], limit = 1\)/);
  });

  it('findSettings passes an explicit limit', () => {
    const body = bodyOf(readFileSync(MISC, 'utf-8'), 'async function findSettings(');
    const m = body.match(/return findTable\(\s*\[[\s\S]*?\],\s*([A-Za-z_][\w]*)\s*,?\s*\)/);
    expect(
      m,
      "findSettings() must pass an explicit limit as findTable's 2nd argument; " +
        'omitting it silently caps the whole config table at 1 row, which empties ' +
        'every dropdown on the add-job form.',
    ).toBeTruthy();
  });

  it('findAnnouncements passes an explicit limit', () => {
    const body = bodyOf(readFileSync(MISC, 'utf-8'), 'async function findAnnouncements(');
    const m = body.match(/return findTable\(\s*\[[\s\S]*?\],\s*([A-Za-z_][\w]*)\s*,?\s*\)/);
    expect(
      m,
      'findAnnouncements() must pass an explicit limit too — it has the same ' +
        'shape and the same defect.',
    ).toBeTruthy();
  });

  it('the limit is a named constant, not a bare literal', () => {
    const src = readFileSync(MISC, 'utf-8');
    expect(src).toMatch(/const SETTINGS_ROW_LIMIT = \d+;/);
  });

  it('the limit is large enough for the real table (>= 158 rows, so >= 200)', () => {
    const src = readFileSync(MISC, 'utf-8');
    const n = Number(src.match(/const SETTINGS_ROW_LIMIT = (\d+);/)?.[1]);
    expect(n).toBeGreaterThanOrEqual(200);
  });

  it('the delete path inherits the fix (it reads rows to delete through findSettings)', () => {
    const src = readFileSync(CONFIG_REPO, 'utf-8');
    // Assert the dependency is real: if this call ever stops going through
    // findSettings(), the comment above and the duplication analysis both go
    // stale, so the link is pinned rather than assumed.
    expect(
      /replaceConfigItems[\s\S]*?await findSettings\(\)/.test(src),
      'configuration/repository.ts must still resolve its rows through ' +
        'findSettings(); the delete-then-insert duplication bug is fixed by ' +
        'findSettings() returning every row, and only that.',
    ).toBe(true);
  });
});
