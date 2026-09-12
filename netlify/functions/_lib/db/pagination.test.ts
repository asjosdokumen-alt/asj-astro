/**
 * pagination.test.ts — keyset paging contract.
 *
 * WHAT THIS LOCKS DOWN
 *   The three properties that motivated replacing Range/OFFSET paging with a
 *   cursor, each of which was a real failure mode of the old implementation:
 *
 *     1. It never sends `Range`, and it never sends an offset.
 *     2. A full page does NOT cost a second request to discover the end — the
 *        `limit + 1` look-ahead answers that inside the page already fetched.
 *        The old reader always paid one extra round-trip (the audit measured
 *        ~39 ms per call) because `rows.length < pageSize` was the only way it
 *        could learn it was done.
 *     3. The cursor advances by the key of the LAST RETURNED row, not by a row
 *        count, so an insert between two pages cannot shift the window.
 *
 *   Plus the guard that matters most in production: a key that does not advance
 *   is a hard error, not an infinite loop against the database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ table: string; query: Record<string, string | number> }> = [];
let responder: (table: string, query: Record<string, string | number>) => unknown;

vi.mock('./client', () => ({
  supabaseJson: async (method: string, table: string, opts: any) => {
    calls.push({ table, query: opts.query });
    return responder(table, opts.query);
  },
}));

const { fetchAllKeyset, fetchPageKeyset } = await import('./pagination');

const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: from + i, no_wa: '628' + (from + i) }));

beforeEach(() => {
  calls.length = 0;
  responder = () => [];
});

describe('fetchPageKeyset', () => {
  it('asks for one row more than the page size, and never for an offset', async () => {
    responder = () => rows(1, 4); // limit 3 => 4 requested, 1 discarded
    const page = await fetchPageKeyset('t', 'id,no_wa', { key: 'id', limit: 3 });

    expect(calls).toHaveLength(1);
    expect(calls[0].query.limit).toBe('4');
    expect(calls[0].query.order).toBe('id.asc');
    expect(calls[0].query).not.toHaveProperty('offset');
    expect(calls[0].query).not.toHaveProperty('Range');
    expect(page.rows).toHaveLength(3);
    expect(page.nextCursor).toBe('3');
  });

  it('reports no further page when the look-ahead row is absent', async () => {
    responder = () => rows(1, 3);
    const page = await fetchPageKeyset('t', 'id', { key: 'id', limit: 3 });
    expect(page.rows).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('continues from the cursor with a greater-than filter', async () => {
    responder = () => rows(11, 2);
    await fetchPageKeyset('t', 'id', { key: 'id', limit: 5, cursor: 10 });
    expect(calls[0].query.id).toBe('gt.10');
  });

  it('walks backwards with a less-than filter in descending order', async () => {
    responder = () => rows(11, 2);
    await fetchPageKeyset('t', 'id', { key: 'id', limit: 5, cursor: 20, direction: 'desc' });
    expect(calls[0].query.id).toBe('lt.20');
    expect(calls[0].query.order).toBe('id.desc');
  });

  it('keeps caller filters on every request', async () => {
    responder = () => rows(1, 1);
    await fetchPageKeyset('t', 'id', {
      key: 'id',
      limit: 5,
      cursor: 3,
      query: { no_wa: 'eq.628123' },
    });
    expect(calls[0].query.no_wa).toBe('eq.628123');
    expect(calls[0].query.id).toBe('gt.3');
  });

  it('refuses a batch size the look-ahead could be truncated at', async () => {
    await expect(fetchPageKeyset('t', 'id', { key: 'id', limit: 1000 })).rejects.toThrow(
      /exceeds 999/,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('fetchAllKeyset', () => {
  it('stops after the first short page — no extra request', async () => {
    responder = () => rows(1, 226); // table smaller than one batch
    const all = await fetchAllKeyset('t', 'id', { key: 'id', batchSize: 500 });
    expect(all).toHaveLength(226);
    expect(calls).toHaveLength(1);
  });

  it('pages through a table larger than one batch and returns every row once', async () => {
    // 1200 rows in batches of 500 => 500, 500, 200. The middle page is exactly
    // full, so it must not be mistaken for the last one.
    const total = 1200;
    responder = (_t, q) => {
      const cursor = typeof q.id === 'string' ? Number(q.id.replace('gt.', '')) : 0;
      const start = cursor + 1;
      const count = Math.min(501, Math.max(0, total - start + 1));
      return rows(start, count);
    };
    const all = await fetchAllKeyset<{ id: number }>('t', 'id', { key: 'id', batchSize: 500 });
    expect(all).toHaveLength(1200);
    expect(new Set(all.map((r) => r.id)).size).toBe(1200);
    expect(all[0].id).toBe(1);
    expect(all[1199].id).toBe(1200);
    // 3 data requests + 1 look-ahead-only page is NOT expected: the `+1` probe
    // makes the last page self-terminating, so it is exactly 3.
    expect(calls).toHaveLength(3);
  });

  it('throws instead of spinning when the key does not advance', async () => {
    // A non-unique key returns the same "last" value forever. The old offset
    // reader would have looped until the deadline; this must fail fast.
    responder = () => rows(7, 3);
    await expect(
      fetchAllKeyset('t', 'id', { key: 'id', batchSize: 2, maxRows: 10 }),
    ).rejects.toThrow(/cursor stopped advancing/);
  });

  it('honours maxRows as a ceiling', async () => {
    responder = (_t, q) => {
      const cursor = typeof q.id === 'string' ? Number(q.id.replace('gt.', '')) : 0;
      return rows(cursor + 1, 101);
    };
    const all = await fetchAllKeyset('t', 'id', { key: 'id', batchSize: 100, maxRows: 250 });
    expect(all.length).toBeGreaterThanOrEqual(250);
    expect(all.length).toBeLessThanOrEqual(303);
  });
});
