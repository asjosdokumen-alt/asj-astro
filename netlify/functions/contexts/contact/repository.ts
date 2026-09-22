/**
 * contexts/contact/repository.ts — Database access for inbound contact messages
 *
 * Owns: database_asj_kontak
 *
 * All DB access goes through kernel/http → supabaseJson, like every other
 * repository in this tree.
 */
import { supabaseJson } from '../../_lib/db/client';
import { normalizeWa } from '../../_lib/db/client';

/**
 * Re-export `normalizeWa` so the service never reaches into `_lib/db/client`
 * itself.
 *
 * This is not style. `.dependency-cruiser.cjs` rule `contexts-no-raw-db` forbids
 * `contexts/**` → `_lib/db/client.ts`, and the oracle test in
 * `indexer/src/boundary.test.ts` RUNS the real dependency-cruiser binary against
 * this tree and fails on any warning. Every other context routes its db helpers
 * through its own repository for exactly this reason (see
 * contexts/applications/repository.ts:62). The rule is what keeps the db access
 * layer swappable and the context boundaries honest — importing the client
 * directly here would have been a one-line convenience that quietly opted this
 * context out of both.
 */
export { normalizeWa };

/** Insert one contact message. Returns nothing — the caller reports success generically. */
export async function insertPesanKontak(row: Record<string, unknown>): Promise<void> {
  await supabaseJson('POST', 'database_asj_kontak', {
    body: row,
    headers: { Prefer: 'return=minimal' },
  });
}

/**
 * How many messages has this number already sent since `sinceIso`?
 *
 * WHY THIS EXISTS RATHER THAN ONLY AN IN-MEMORY LIMITER. A serverless function
 * has no shared memory: every cold start gets a fresh counter, so an in-memory
 * limiter alone resets under exactly the load it is meant to bound. Counting
 * the rows the sender already created is the only limit that survives that.
 *
 * Bounded by `LIMIT` on purpose. We only need to know whether the sender has
 * crossed a small threshold, so the query asks for at most that many rows —
 * a flood does not pull the flood back just to measure it. `Number` guards the
 * shape because a PostgREST error body is not an array.
 */
const RATE_WINDOW_LIMIT = 20;

export async function countPesanSejak(wa: string, sinceIso: string): Promise<number> {
  const rows = await supabaseJson('GET', 'database_asj_kontak', {
    query: {
      select: 'id',
      no_wa: `eq.${wa}`,
      created_at: `gte.${sinceIso}`,
      limit: RATE_WINDOW_LIMIT,
    },
  });
  return Array.isArray(rows) ? rows.length : 0;
}
