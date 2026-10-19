import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeSurfaceHandler, outcomeStatusCode } from './netlify-wrapper-surface';
import { backpressureHeaders, corsHeaders } from './kernel/request-helpers';
import { shedResponse } from './kernel/admission';
import { AI_ACTIONS } from '../surfaces/ai';

// Unit: the outcome -> status precedence policy (single owner of the mapping
// table stays in kernel/errors.ts codeToStatus; this pins the wrapper policy).
describe('outcomeStatusCode - wrapper error-status precedence', () => {
  it('rateLimited wins regardless of code/message', () => {
    expect(outcomeStatusCode({ success: false, rateLimited: true, retryAfter: 30 })).toBe(429);
    expect(outcomeStatusCode({ success: false, code: 'VALIDATION_FAILED', rateLimited: true })).toBe(429);
  });

  it('AppError-serialized rejections map by code (400/404/429/5xx), not blanket 200', () => {
    expect(outcomeStatusCode({ success: false, error: 'x', code: 'VALIDATION_FAILED' })).toBe(400);
    expect(outcomeStatusCode({ success: false, error: 'x', code: 'NOT_FOUND' })).toBe(404);
    expect(outcomeStatusCode({ success: false, error: 'x', code: 'RATE_LIMITED' })).toBe(429);
    expect(outcomeStatusCode({ success: false, error: 'x', code: 'INTERNAL_ERROR' })).toBe(500);
    expect(outcomeStatusCode({ success: false, error: 'x', code: 'SERVICE_UNAVAILABLE' })).toBe(503);
    expect(outcomeStatusCode({ success: false, error: 'x', code: 'WHATEVER' })).toBe(500);
  });

  it('legacy message-only failures keep 400; success and empty stay 200', () => {
    expect(outcomeStatusCode({ success: false, message: 'Fungsi belum diimplementasi' })).toBe(400);
    expect(outcomeStatusCode({ success: true, status: 'not_found' })).toBe(200);
    expect(outcomeStatusCode(undefined)).toBe(200);
    expect(outcomeStatusCode(null)).toBe(200);
  });

  // Phase B: backpressure outcomes must not be reported as client input errors.
  // A shed request arriving as 400 tells the client to fix its payload, so it
  // fixes nothing and retries immediately — the behaviour that sustains an
  // overload. 503/504 tell it to back off, which is the point of shedding.
  it('load-shedding and deadline outcomes map to 503/504, never 400', () => {
    const shed = shedResponse(10);
    expect(outcomeStatusCode(shed)).toBe(503);
    expect(outcomeStatusCode({ success: false, error: 'x', code: 'OVERLOADED' })).toBe(503);
    expect(outcomeStatusCode({ success: false, error: 'x', code: 'DEADLINE_EXCEEDED' })).toBe(504);
    // Guard the specific regression: the 400 fallback fires on
    // `success:false` + `message`, so what routes a shed response to 503 is
    // the presence of `code` (or `overloaded`). That field is load-bearing.
    expect(shed.code).toBe('OVERLOADED');
    expect(shed.error).toBeTruthy();
    expect(shed.overloaded).toBe(true);
    expect(outcomeStatusCode(shed)).not.toBe(400);
  });
});

// Phase B: the headers that make backpressure actionable. A 503 without
// Retry-After is just a slower way of saying "retry now".
describe('backpressureHeaders', () => {
  const base = { 'Content-Type': 'application/json; charset=utf-8' };

  it('emits Retry-After whenever the outcome carries a numeric retryAfter', () => {
    expect(backpressureHeaders(base, { retryAfter: 10 })['Retry-After']).toBe('10');
    // Fractional seconds round up: telling a client to retry sooner than the
    // server intended defeats the backoff.
    expect(backpressureHeaders(base, { retryAfter: 2.1 })['Retry-After']).toBe('3');
    expect(backpressureHeaders(base, { rateLimited: true, retryAfter: 30 })['Retry-After']).toBe('30');
  });

  it('marks shed responses no-store so an overload is never cached and replayed', () => {
    const h = backpressureHeaders(base, shedResponse(5));
    expect(h['Cache-Control']).toBe('no-store');
    expect(h['Retry-After']).toBe('5');
  });

  it('omits both headers for ordinary outcomes and non-objects', () => {
    for (const out of [{ success: true }, { success: false, code: 'NOT_FOUND' }, undefined, null, 42]) {
      const h = backpressureHeaders(base, out);
      expect(h['Retry-After']).toBeUndefined();
      expect(h['Cache-Control']).toBeUndefined();
      expect(h['Content-Type']).toBe(base['Content-Type']);
    }
  });

  it('ignores a non-numeric or non-positive retryAfter rather than emitting a bad header', () => {
    expect(backpressureHeaders(base, { retryAfter: 'soon' })['Retry-After']).toBeUndefined();
    expect(backpressureHeaders(base, { retryAfter: 0 })['Retry-After']).toBeUndefined();
    expect(backpressureHeaders(base, { retryAfter: -5 })['Retry-After']).toBeUndefined();
  });

  it('exposes Retry-After to browser JS via CORS', () => {
    // Without Access-Control-Expose-Headers the browser hides Retry-After from
    // fetch(), so client-side backoff cannot read the hint the server sent.
    expect(corsHeaders('http://localhost:4321')['Access-Control-Expose-Headers']).toBe('Retry-After');
  });
});

// Integration: real surface chain - allow-list extracted verbatim from the
// shipped ai-chat.js entry, real wrapper -> dispatcher -> kernel.
//
// Phase A: the entry point now passes its OWN action map so the bundle never
// reaches the full router (see docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md
// §8.3). This test mirrors that wiring exactly — if someone reverts ai-chat.js
// to the router-based call, this fails.
const src = readFileSync(join(__dirname, '..', 'ai-chat.js'), 'utf8');
const m = src.match(/makeSurfaceHandler\(\s*AI_ACTIONS\s*,\s*\[\s*([\s\S]*?)\s*\]\)/);
if (!m) throw new Error('makeSurfaceHandler(AI_ACTIONS, [...]) not found in ai-chat.js');
const allowed = m[1].split(',').map((x: string) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
const handler = makeSurfaceHandler(AI_ACTIONS, allowed);

describe('surface wrapper - AppError rejections carry their HTTP status (regression)', () => {
  it('getJobStatus with an empty payload: VALIDATION_FAILED arrives as HTTP 400, not 200', async () => {
    const res = await handler({ body: JSON.stringify({ action: 'getJobStatus', payload: [] }) });
    expect(res.statusCode).toBe(400);
    const out = JSON.parse(res.body);
    expect(out.success).toBe(false);
    expect(out.code).toBe('VALIDATION_FAILED');
  });

  it('unknown actions still 404 on this surface (allow-list intact)', async () => {
    const res = await handler({ body: JSON.stringify({ action: 'definitelyNotAnAction', payload: [] }) });
    expect(res.statusCode).toBe(404);
  });
});

/* ── L0 (CDN) — the header must reach the WIRE, not just exist as a constant ──
 *
 * `surfaces/public.ts` carried PUBLIC_CACHE_HEADERS since Phase 5 and
 * `chaos.test.ts` asserted its TEXT — which stayed green while nothing applied
 * it. Measured 2026-10-19 on production: two identical public reads, both
 * `Cache-Status: "Netlify Edge"; fwd=miss`, both `Cache-Control: no-cache`.
 * So these cases assert the RESPONSE OBJECT the platform actually receives.
 *
 * The stub action map keeps this a unit test: no Supabase, no catalog.
 */
const CACHE_POLICY = {
  cacheControl: (action: string, sessionToken?: string) =>
    action === 'getAppData' && !sessionToken ? 'public, s-maxage=60, stale-while-revalidate=86400' : null,
};
const cachedHandler = makeSurfaceHandler(
  {
    getAppData: async () => ({ success: true, jobs: [] }),
    failSomething: async () => ({ success: false, message: 'gagal' }),
  },
  ['getAppData', 'failSomething'],
  CACHE_POLICY,
);

describe('surface wrapper - L0 cache headers reach the response', () => {
  it('anonymous getAppData is labelled cacheable, with Vary: Origin', async () => {
    const res = await cachedHandler({ body: JSON.stringify({ action: 'getAppData', payload: ['public'] }) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toContain('s-maxage=60');
    expect(res.headers['CDN-Cache-Control']).toContain('s-maxage=60');
    // corsHeaders echoes an allow-listed Origin; without Vary a shared cache can
    // serve one origin's ACAO to another and the browser blocks the response.
    expect(res.headers.Vary).toContain('Origin');
  });

  it('a session token switches caching OFF, including a token in the query string', async () => {
    const byBody = await cachedHandler({
      body: JSON.stringify({ action: 'getAppData', payload: ['public'], sessionToken: 'tok' }),
    });
    expect(byBody.headers['Cache-Control']).toBeUndefined();

    // sessionTokenFrom() also reads `q.sessionToken`; a GET must not become
    // cacheable just because the token travelled in the URL.
    const byQuery = await cachedHandler({
      body: JSON.stringify({ action: 'getAppData', payload: ['public'] }),
      queryStringParameters: { sessionToken: 'tok' },
    });
    expect(byQuery.headers['Cache-Control']).toBeUndefined();
  });

  it('failures are never cached, even when the policy would allow the action', async () => {
    const res = await cachedHandler({ body: JSON.stringify({ action: 'failSomething', payload: [] }) });
    expect(res.statusCode).toBe(400);
    expect(res.headers['Cache-Control']).toBeUndefined();
  });

  it('a surface without a policy keeps the platform default (no cache header)', async () => {
    const res = await handler({ body: JSON.stringify({ action: 'definitelyNotAnAction', payload: [] }) });
    expect(res.headers['Cache-Control']).toBeUndefined();
  });

  /* END-TO-END WIRING, not the constant again.
   *
   * The two cases above prove the WRAPPER applies a policy. They would both stay
   * green if `get-app-data.js` stopped passing one — which is precisely the
   * failure this session found (a declared strategy, a green test on its text,
   * and no header on the wire for months). So this drives the REAL entry point
   * with a real Request, the way Netlify does: query string in, Response out.
   *
   * No Supabase is contacted: without credentials `handleGetAppData` returns the
   * demo payload, which is enough — the header decision happens in the wrapper. */
  it('entry point get-app-data: an anonymous GET really carries the cache header', async () => {
    const { default: entry } = await import('../get-app-data.js');
    const req = new Request(
      'https://asjastro.netlify.app/.netlify/functions/get-app-data?action=getAppData&payload=' +
        encodeURIComponent(JSON.stringify(['public'])),
      { method: 'GET' },
    );
    const res = await (entry as (r: Request) => Promise<Response>)(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control') || '').toContain('s-maxage=60');
    expect(res.headers.get('vary') || '').toContain('Origin');
  });
});
