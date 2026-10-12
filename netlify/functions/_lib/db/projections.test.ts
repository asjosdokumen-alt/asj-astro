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

/**
 * Satu token proyeksi → `{ alias, base, path }`.
 *
 * PostgREST mengizinkan JSON-path dengan alias —
 * `ai_gender:ai_data_json->identitas->gender` — dan `MASTER_LIGHT_COLS` memakainya
 * untuk mengambil HANYA sub-objek kecil `ai_data_json.identitas` (seluruh kolom
 * JSON-nya akan membengkakkan payload halaman daftar).
 *
 * Yang bisa — dan HARUS — diperiksa terhadap skema adalah KOLOM DASARNYA. Path di
 * dalam JSON bukan kolom; memeriksanya sebagai kolom justru melaporkan kolom sah
 * sebagai "tidak dikenal". Kontrol positif di bawah menjaga agar token JSON-path
 * benar-benar terurai alih-alih lolos sebagai kolom kosong.
 */
function parseToken(token: string): { alias: string; base: string; path: string } {
  const colon = token.indexOf(':');
  const alias = colon === -1 ? '' : token.slice(0, colon);
  const expr = colon === -1 ? token : token.slice(colon + 1);
  const arrow = expr.indexOf('->');
  return {
    alias,
    base: arrow === -1 ? expr : expr.slice(0, arrow),
    path: arrow === -1 ? '' : expr.slice(arrow),
  };
}

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
    const parsed = columns.map(parseToken);

    it(`${name}: table "${table}" is exposed`, () => {
      expect(Object.keys(TABLE_COLUMNS)).toContain(table);
    });

    it(`${name}: every column exists on ${table}`, () => {
      const known = TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] as readonly string[];
      const unknown = parsed.filter((p) => !known.includes(p.base)).map((p) => p.base);
      expect(unknown, `unknown column(s) in ${name}: ${unknown.join(', ')}`).toEqual([]);
      // Kontrol positif: setiap token ber-`->` harus terurai menjadi base + path.
      // Kalau `parseToken` rusak dan mengembalikan base kosong, pemeriksaan di
      // atas gagal — tapi asersi ini yang mengatakan SEBABNYA.
      expect(
        parsed.filter((p) => p.path).length,
        `${name}: JSON-path tokens parsed`,
      ).toBe(columns.filter((c) => c.includes('->')).length);
    });

    it(`${name}: no duplicate output names`, () => {
      // Nama keluaran = alias (kalau ada), kalau tidak token-nya sendiri. Dua
      // JSON-path pada kolom dasar yang SAMA tidak bentrok selama aliasnya beda.
      const keys = parsed.map((p) => p.alias || p.base);
      expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
    });

    it(`${name}: no wildcard`, () => {
      expect(parsed.map((p) => p.base)).not.toContain('*');
      expect(columns.length).toBeGreaterThan(0);
    });
  }
});
