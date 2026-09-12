/**
 * db/pagination.ts — keyset (cursor) pagination.
 *
 * WHY THIS REPLACES RANGE/OFFSET PAGING
 *   `supabasePaged` paged with the `Range: start-end` header, which PostgREST
 *   translates to OFFSET/LIMIT. That is unstable under concurrent writes: a row
 *   inserted between two page reads shifts every later row by one, so the next
 *   page re-returns a row it already sent and the row after that is never sent
 *   at all. Nothing errors — the list is just quietly wrong. With 226 candidates
 *   and a 1000-row page the whole table is one request, so this never fired; the
 *   function exists precisely so the list keeps working when that stops being
 *   true, and that is exactly when the bug would have appeared.
 *
 *   Keyset pagination asks for `key > <last seen>` instead of "skip N rows". It
 *   is stable under inserts, needs no total count, and costs the same at page 1
 *   and page 50 — the database walks the index from the cursor instead of
 *   counting rows it is about to discard.
 *
 * WHY IT ASKS FOR `limit + 1` ROWS
 *   To know whether another page exists, a keyset reader normally has to ask
 *   once more and receive an empty result — one wasted round-trip per full page
 *   (the audit measured ~39 ms per call). Requesting one extra row answers the
 *   same question inside the page already being fetched, so a full page never
 *   costs a second request.
 *
 *   That is why `batchSize` is capped: PostgREST's default `db-max-rows` is 1000,
 *   so the `+1` probe only stays meaningful while `batchSize <= 999`.
 */

import { supabaseJson } from './client';

export interface KeysetQuery {
  /** Unique, NOT NULL, totally-ordered column — `id` on every table here. */
  key: string;
  /** Rows per request. Must stay <= 999 so the `+1` probe fits under PostgREST's cap. */
  batchSize?: number;
  direction?: 'asc' | 'desc';
  /** Extra filters, applied to every request. */
  query?: Record<string, string | number>;
  /** Safety ceiling: stop after this many rows even if the table is larger. */
  maxRows?: number;
}

/** PostgREST's default row ceiling. The `+1` probe is only meaningful below it. */
const MAX_BATCH = 999;
const DEFAULT_BATCH = 500;

function assertBatch(batchSize: number) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`fetchAllKeyset(): batchSize must be a positive integer, got ${batchSize}`);
  }
  if (batchSize > MAX_BATCH) {
    throw new Error(
      `fetchAllKeyset(): batchSize ${batchSize} exceeds ${MAX_BATCH} — the +1 look-ahead ` +
        `would be truncated by PostgREST's db-max-rows and the loop would stop early.`,
    );
  }
}

export interface KeysetPage<T> {
  rows: T[];
  /** Pass back as `cursor` to get the next page. `null` means this was the last. */
  nextCursor: string | null;
}

/**
 * One page of a keyset walk.
 *
 * `cursor` is the value of `key` in the last row the caller already has. Omit it
 * for the first page.
 */
export async function fetchPageKeyset<T = Record<string, unknown>>(
  table: string,
  select: string,
  opts: { key: string; limit: number; cursor?: string | number | null } & Omit<KeysetQuery, 'key' | 'batchSize' | 'maxRows'>,
): Promise<KeysetPage<T>> {
  const { key, limit, cursor = null, direction = 'asc', query = {} } = opts;
  assertBatch(limit);

  const params: Record<string, string | number> = {
    ...query,
    select,
    order: `${key}.${direction}`,
    // One extra row, discarded below, answers "is there more?" without a
    // second request.
    limit: String(limit + 1),
  };
  if (cursor !== null && cursor !== undefined && String(cursor) !== '') {
    params[key] = `${direction === 'desc' ? 'lt' : 'gt'}.${String(cursor)}`;
  }

  const raw = await supabaseJson('GET', table, { query: params });
  const fetched = (Array.isArray(raw) ? raw : []) as T[];
  const hasMore = fetched.length > limit;
  const rows = hasMore ? fetched.slice(0, limit) : fetched;
  const last = rows.length ? (rows[rows.length - 1] as Record<string, unknown>)[key] : undefined;
  const nextCursor = hasMore && last !== undefined && last !== null ? String(last) : null;

  return { rows, nextCursor };
}

/**
 * Walk every row of `table`, in `key` order, one keyset page at a time.
 *
 * Ordering is by the key, which is NOT the order callers usually want to display
 * — the previous implementation sorted in JS after loading everything, and that
 * is still where presentation ordering belongs. What changes here is only how the
 * rows are *transported*: stably, and without a count.
 */
export async function fetchAllKeyset<T = Record<string, unknown>>(
  table: string,
  select: string,
  opts: KeysetQuery,
): Promise<T[]> {
  const { key, batchSize = DEFAULT_BATCH, direction = 'asc', query = {}, maxRows = 100_000 } = opts;
  assertBatch(batchSize);

  const all: T[] = [];
  let cursor: string | number | null = null;

  for (;;) {
    // Annotated explicitly: `cursor` is fed back from `page.nextCursor`, so
    // leaving the type to inference makes the two depend on each other.
    const page: KeysetPage<T> = await fetchPageKeyset<T>(table, select, {
      key,
      limit: batchSize,
      cursor,
      direction,
      query,
    });
    all.push(...page.rows);

    if (page.nextCursor === null) break;
    // A cursor that does not advance would loop forever against a table whose
    // key column is not unique — the one precondition this module cannot check
    // for itself. Stop rather than spin.
    if (page.nextCursor === String(cursor)) {
      throw new Error(
        `fetchAllKeyset(): cursor stopped advancing on ${table}.${key} at ${page.nextCursor} — ` +
          `is ${key} unique and NOT NULL?`,
      );
    }
    if (all.length >= maxRows) break;
    cursor = page.nextCursor;
  }

  return all;
}
