/**
 * projections.test.ts — every projection must name columns the database has.
 *
 * WHY THIS IS A TEST AND NOT A RUNTIME CHECK
 *   `supabaseJson()` resolves projections through `schema.generated.ts`, so a
 *   column that does not exist would be a 400 at runtime — inside a `catch`
 *   that treats "projection rejected" as "retry without a projection". That is
 *   how a typo in a projection silently restores a full-table read instead of
 *   failing. Checking here makes it a red test with a file and a column name,
 *   before anything reaches a database.
 *
 *   No network and no database: both sides of the comparison are committed
 *   files. `npm run verify:schema` is the separate gate that keeps
 *   `schema.generated.ts` itself honest against the live database.
 */
import { describe, it, expect } from 'vitest';
import { TABLE_COLUMNS, SCHEMA_FINGERPRINT } from './schema.generated';
import { PROJECTIONS, type ProjectionName } from './projections';

const names = Object.keys(PROJECTIONS) as ProjectionName[];

describe('db/projections', () => {
  it('declares at least one projection', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it('has a schema fingerprint to validate against', () => {
    expect(SCHEMA_FINGERPRINT).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  for (const name of names) {
    const entry = PROJECTIONS[name] as { table: string; columns: string };
    const { table } = entry;
    const columns = entry.columns.split(',');

    it(`${name}: table "${table}" is exposed`, () => {
      expect(Object.keys(TABLE_COLUMNS)).toContain(table);
    });

    it(`${name}: every column exists on ${table}`, () => {
      const known = TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] as readonly string[];
      const unknown = columns.filter((c) => !known.includes(c));
      expect(unknown, `unknown column(s) in ${name}: ${unknown.join(', ')}`).toEqual([]);
    });

    it(`${name}: no duplicate columns`, () => {
      const dupes = columns.filter((c, i) => columns.indexOf(c) !== i);
      expect(dupes).toEqual([]);
    });

    it(`${name}: no wildcard`, () => {
      expect(columns).not.toContain('*');
      expect(columns.length).toBeGreaterThan(0);
    });
  }
});
