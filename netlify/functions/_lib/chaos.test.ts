/**
 * chaos.test.ts — Phase E item 19: the degradation matrix as behaviour.
 *
 * WHY THIS FILE EXISTS
 *   `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §6.5 states, as fact, what
 *   happens when each dependency fails. Nothing executed those claims. Phase E's
 *   gate is precisely that the matrix becomes "verified behaviour, not a
 *   document", so each row below is either asserted here or reported as
 *   unverified in `docs/PHASE_E_DEGRADATION_MATRIX.md`.
 *
 * WHERE THE FAILURE IS INJECTED, AND WHY THERE
 *   At `globalThis.fetch` — the outermost boundary, below every layer that
 *   matters. Nothing above it is mocked: the real `kernel/http.ts` (deadline
 *   clamp, circuit breaker, bulkhead, dependency logging), the real db client
 *   (projection resolution, error wrapping), the real context, the real surface
 *   and the real wrapper all run. Mocking at `supabaseJson` or at the surface
 *   would test the mock, not the wiring.
 *
 *   It also catches the two raw-`fetch` sites that deliberately sit outside
 *   `kernel/http.ts` (allow-listed in `scripts/ci/io-boundary.mjs`), so a single
 *   stub covers database, AI and push paths.
 *
 * ISOLATION
 *   `vi.resetModules()` per test. The circuit breakers, the admission counters,
 *   the bulkheads and the response cache are module-level singletons; without a
 *   reset, one test's induced outage would change the next test's behaviour and
 *   the suite would pass or fail by ordering.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `hasBackend()` gates the real code path on these. Without them every call
// short-circuits to demo data and the suite would prove nothing.
process.env.SUPABASE_URL = 'https://chaos-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chaos-test-key';
process.env.GEMINI_API_KEY = 'chaos-test-gemini-key';

type Route = { match: RegExp; reply: (url: string, init: any) => Response };
let routes: Route[] = [];
let fetchLog: string[] = [];

/** PostgREST's answer for "no rows" — the default for anything not routed. */
const emptyRows = () =>
  new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });

function installFetch() {
  vi.stubGlobal('fetch', async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : (input && input.url) || input);
    fetchLog.push(url);
    for (const r of routes) if (r.match.test(url)) return r.reply(url, init);
    return emptyRows();
  });
}

/** Every database call fails the way an unreachable host does. */
const dbDown: Route = {
  match: /supabase/,
  reply: () => {
    throw new TypeError('fetch failed');
  },
};

beforeEach(() => {
  routes = [];
  fetchLog = [];
  installFetch();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── §6.5 row 1 — DB down, public catalog ─────────────────────────────────────

describe('§6.5 · DB down — public catalog', () => {
  it('still answers, with fallback data, instead of propagating the failure', async () => {
    routes = [dbDown];
    const { PUBLIC_ACTIONS } = await import('../surfaces/public.js');

    const out = (await PUBLIC_ACTIONS.getAppData(['public'])) as Record<string, any>;

    // The claim is "serve last-known-good" — the origin's job is to answer at
    // all. It answers with the built-in dataset (demoGetAppData), and the CDN
    // layer is what turns that into last-known-good for the visitor.
    expect(out).toBeTruthy();
    expect(out.success).not.toBe(false);
    expect(Array.isArray(out.jobs)).toBe(true);
  });

  it('the database really was unreachable — the test is not passing vacuously', async () => {
    routes = [dbDown];
    const { PUBLIC_ACTIONS } = await import('../surfaces/public.js');

    await PUBLIC_ACTIONS.getAppData(['public']);

    // Proof the stub fired: at least one call went to the Supabase host and
    // failed. A green test against a code path that never touched the network
    // would be worse than no test.
    expect(fetchLog.some((u) => u.includes('supabase'))).toBe(true);
  });

  it('carries stale-if-error, which is what keeps the board up at the CDN', async () => {
    const { PUBLIC_CACHE_HEADERS } = await import('../surfaces/public.js');
    expect(PUBLIC_CACHE_HEADERS['Cache-Control']).toContain('stale-if-error=86400');
    expect(PUBLIC_CACHE_HEADERS['Cache-Control']).toContain('stale-while-revalidate=86400');
  });
});

// ── §6.5 row 2 — DB down, writes ─────────────────────────────────────────────

describe('§6.5 · DB down — writes', () => {
  // This block used to RECORD the gap: a database failure came out as an
  // INTERNAL_ERROR AppError → 500, with no Retry-After and a non-retryable
  // classification, so a client following §6.5's "503 + Retry-After" contract
  // would not retry at all. Closed 2026-09-13 (owner-approved item 3).

  it('an unreachable database raises SERVICE_UNAVAILABLE and marks the request', async () => {
    routes = [dbDown];
    const { supabaseJson } = await import('./db/client');
    const { runWithContext } = await import('./kernel/log');

    const ctx: Record<string, unknown> = { requestId: 'chaos-db-down' };
    let thrown: any = null;
    await runWithContext(ctx as never, async () => {
      try {
        await supabaseJson('POST', 'database_schedule', { body: { status_jadwal: 'AKTIF' } });
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown?.code).toBe('SERVICE_UNAVAILABLE');
    expect(thrown?.httpStatus).toBe(503);
    // Retryable, because an unreachable dependency is transient by definition.
    expect(thrown?.retryable).toBe(true);
    // The fact outlives the service's catch block — that is the whole point of
    // carrying it on the request context.
    expect(ctx.dbOutage).toBe(true);
    // Proof the stub fired: the real db client really did try the network.
    expect(fetchLog.some((u) => u.includes('supabase'))).toBe(true);
  });

  it('a 4xx from PostgREST is NOT an outage — it is a real answer from a working DB', async () => {
    routes = [
      { match: /supabase/, reply: () => new Response('{"message":"bad column"}', { status: 400 }) },
    ];
    const { supabaseJson } = await import('./db/client');
    const { runWithContext } = await import('./kernel/log');

    const ctx: Record<string, unknown> = { requestId: 'chaos-db-400' };
    let thrown: any = null;
    await runWithContext(ctx as never, async () => {
      try {
        await supabaseJson('GET', 'database_schedule');
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeTruthy();
    expect(thrown?.code).not.toBe('SERVICE_UNAVAILABLE');
    // Retrying a bad column would fail identically, so it must not be reported
    // as an outage — nor should the request be marked.
    expect(ctx.dbOutage).toBeUndefined();
  });

  it('the wrapper turns that failure into 503 + Retry-After + no-store', async () => {
    const { applyDbOutage } = await import('./netlify-wrapper-surface');

    // Exactly what a service returns: a friendly string with no code, because
    // 38 catch blocks do `{ success: false, error: safeError(...) }`.
    const failure = { success: false, error: 'Gagal simpan jadwal. Terjadi kesalahan…' };
    const adjusted = applyDbOutage(failure, 400, {}, true);

    expect(adjusted.statusCode).toBe(503);
    expect(adjusted.headers['Retry-After']).toBe('5');
    expect(adjusted.headers['Cache-Control']).toBe('no-store');
  });

  it('a request that SUCCEEDED keeps its 200 even if the database blipped', async () => {
    const { applyDbOutage } = await import('./netlify-wrapper-surface');
    const ok = applyDbOutage({ success: true, data: [] }, 200, {}, true);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['Retry-After']).toBeUndefined();
    expect(ok.headers['Cache-Control']).toBeUndefined();
  });

  it('a shed request still gets 503 + Retry-After + no-store, through the wrapper', async () => {
    const { outcomeStatusCode } = await import('./netlify-wrapper-surface');
    const { backpressureHeaders } = await import('./kernel/request-helpers');
    const { shedResponse } = await import('./kernel/admission');

    const shed = shedResponse(7);
    expect(outcomeStatusCode(shed)).toBe(503);
    const headers = backpressureHeaders({}, shed);
    expect(headers['Retry-After']).toBe('7');
    expect(headers['Cache-Control']).toBe('no-store');
  });
});

// ── §6.5 row 3 — Gemini down ─────────────────────────────────────────────────

describe('§6.5 · Gemini down', () => {
  it('`ai_unavailable` is not part of the error taxonomy', async () => {
    const { codeToStatus } = await import('./kernel/errors');

    // §6.5 promises "ai_unavailable returned; AI tabs show a banner". No such
    // code exists in the codebase, so it falls through to the unknown-code
    // default — 500. Asserted here so the gap cannot be forgotten: if someone
    // adds the code, this test fails and the matrix gets updated.
    expect(codeToStatus('AI_UNAVAILABLE')).toBe(500);
    expect(codeToStatus('ai_unavailable')).toBe(500);
  });

  it('an unrelated feature is unaffected while the AI provider is down', async () => {
    routes = [
      { match: /generativelanguage/, reply: () => { throw new TypeError('fetch failed'); } },
    ];
    const { handleAction } = await import('./handlers');

    // "No dependency failure may take down an unrelated feature" — the core
    // invariant. A CRUD action that never touches Gemini still completes.
    const out = (await handleAction('getJobStatus', [], '', {
      resolve: async () => async () => ({ success: true, untouched: true }),
    })) as Record<string, unknown>;

    expect(out.success).toBe(true);
    expect(out.untouched).toBe(true);
    expect(fetchLog.some((u) => u.includes('generativelanguage'))).toBe(false);
  });
});

// ── §6.5 row 5 — FCM down ────────────────────────────────────────────────────

describe('§6.5 · FCM down', () => {
  it('never throws — a failed push resolves, so in-app data is unaffected', async () => {
    routes = [
      { match: /fcm\.googleapis|googleapis\.com/, reply: () => { throw new TypeError('fetch failed'); } },
    ];
    const { sendPushNotification } = await import('./fcm-server');

    const ok = await sendPushNotification('device-token', 'Judul', 'Isi');

    // "Log and drop." A push failure must not reject into a caller that is
    // halfway through writing the row it was notifying about.
    expect(ok).toBe(false);
  });
});

// ── §6.7 chaos test 5 — idempotency replay ───────────────────────────────────

/**
 * A minimal, faithful idempotency table: rows keyed by the key the caller
 * actually asked for. Returning a stored row regardless of the requested key
 * would make the "different key" guard below pass for the wrong reason — which
 * is exactly what happened on the first run of this suite.
 */
function idempotencyRoutes() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    routes: [
      {
        // Both the lookup and the store hit the same path, so the method is
        // what distinguishes them — matching on the URL alone sent the POST
        // down the read branch and stored nothing.
        match: /idempotency_keys/,
        reply: (url: string, init: any) => {
          const method = String(init?.method || 'GET').toUpperCase();
          if (method === 'GET') {
            const requested = new URL(url).searchParams.get('key') ?? '';
            const key = requested.replace(/^eq\./, '');
            const hit = rows.get(key);
            return new Response(JSON.stringify(hit ? [hit] : []), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          const row = JSON.parse(String(init.body));
          rows.set(String(row.key), row);
          return new Response(null, { status: 201 });
        },
      },
    ],
  };
}

describe('§6.7 · replay a write with the same idempotency key', () => {
  it('runs the handler exactly once and replays the stored result', async () => {
    const store = idempotencyRoutes();
    routes = store.routes;

    const { handleAction } = await import('./handlers');
    const { runWithContext } = await import('./kernel/log');

    let runs = 0;
    const handler = async () => {
      runs += 1;
      return { success: true, created: 'ASJ00999', attempt: runs };
    };
    const meta = { resolve: async () => handler };
    const ctx = { requestId: 'chaos', action: 'reviewForm', idempotencyKey: 'key-abc' };

    const first = await runWithContext(ctx, () => handleAction('reviewForm', [], '', meta));
    const second = await runWithContext(ctx, () => handleAction('reviewForm', [], '', meta));

    // The invariant: a retry after a timeout must not create a second row.
    expect(runs).toBe(1);
    expect(second).toEqual(first);
    expect(second).toEqual({ success: true, created: 'ASJ00999', attempt: 1 });
    expect(store.rows.size).toBe(1);
  });

  it('a different key does run the handler again', async () => {
    const store = idempotencyRoutes();
    routes = store.routes;

    const { handleAction } = await import('./handlers');
    const { runWithContext } = await import('./kernel/log');

    let runs = 0;
    const handler = async () => ({ success: true, attempt: ++runs });
    const meta = { resolve: async () => handler };

    await runWithContext(
      { requestId: 'a', action: 'reviewForm', idempotencyKey: 'k1' },
      () => handleAction('reviewForm', [], '', meta),
    );
    await runWithContext(
      { requestId: 'b', action: 'reviewForm', idempotencyKey: 'k2' },
      () => handleAction('reviewForm', [], '', meta),
    );

    // Guards against the first test passing because idempotency is broken in
    // the "always replays" direction.
    expect(runs).toBe(2);
    expect(store.rows.size).toBe(2);
  });
});
