/**
 * kernel/request-helpers.ts — Shared request utilities
 *
 * Extracted from netlify-wrapper.ts and netlify-wrapper-surface.ts to
 * eliminate duplication of CORS, client IP extraction, and session token
 * parsing. Both wrappers import from here instead of defining their own copies.
 */

import { env } from '../env';

// ── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  env('APP_ORIGIN') || '',
  env('SITE_URL') || '',
  'https://asjportal.netlify.app',
  'http://localhost:4321',
].filter(Boolean);

export function getCorsOrigin(origin?: string): string {
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0] || '*';
}

/** Standard CORS headers for all API responses. */
export function corsHeaders(requestOrigin: string): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    // Without this, browser JS cannot read Retry-After off a 429/503 response
    // (CORS hides non-safelisted response headers). The client would then have
    // to guess a backoff, which is how retry storms start.
    'Access-Control-Expose-Headers': 'Retry-After',
  };
}

/**
 * Derive backpressure headers from a dispatcher outcome.
 *
 * - `Retry-After` is emitted whenever the outcome carries a numeric
 *   `retryAfter` — currently rate limiting (429) and load shedding (503).
 *   Without it a 503 is just a slower way of telling the client to retry
 *   immediately, which is precisely the behaviour that sustains an overload.
 * - `Cache-Control: no-store` on shed responses, so a transient overload is
 *   never written into a cache and replayed after the pressure has passed.
 *
 * Pure and defensive: any outcome shape yields at least the base headers.
 */
export function backpressureHeaders(
  base: Record<string, string>,
  out: unknown,
): Record<string, string> {
  const headers = { ...base };
  if (!out || typeof out !== 'object') return headers;
  const rec = out as Record<string, unknown>;

  const retryAfter = typeof rec.retryAfter === 'number' ? rec.retryAfter : undefined;
  if (retryAfter !== undefined && retryAfter > 0) {
    headers['Retry-After'] = String(Math.ceil(retryAfter));
  }
  if (rec.overloaded) {
    headers['Cache-Control'] = 'no-store';
  }
  return headers;
}

// ── Client IP ───────────────────────────────────────────────────────────────

/** Extract client IP from standard proxy/Netlify headers. */
export function clientIp(event: { headers?: Record<string, string> }): string | null {
  const h = (event && event.headers) || {};
  // Order matters: this value becomes the RATE-LIMIT KEY
  // (`netlify-wrapper.ts:88` → `ip: clientIp(event)`), so any header the caller
  // can set is a caller choosing its own bucket.
  //
  // 1. Netlify derives this one from the connection itself. It cannot be forged
  //    by the request, so it wins whenever it exists.
  const nf = h['x-nf-client-connection-ip'];
  if (nf && String(nf).trim()) return String(nf).trim();
  // 2. `x-forwarded-for` is a LIST that each proxy APPENDS to: the left-most
  //    entry is whatever the client sent, the right-most is the last hop that
  //    actually saw the connection. Reading `[0]` (until 2026-10-29) meant
  //    `X-Forwarded-For: 1.2.3.4` bought a fresh bucket per request — measured
  //    in `_lib/rate-limit.test.ts`, which fails on the old behaviour.
  const fwd = h['x-forwarded-for'];
  if (fwd) {
    const hops = String(fwd)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return h['client-ip'] || h['x-real-ip'] || null;
}

// ── Session Token ───────────────────────────────────────────────────────────

/**
 * Extract session token from request.
 *
 * Priority: body.sessionToken → header Authorization → query string.
 */
export function sessionTokenFrom(
  event: { headers?: Record<string, string>; queryStringParameters?: Record<string, string> },
  body: Record<string, unknown>,
): string | undefined {
  if (body && body.sessionToken) return String(body.sessionToken);
  const h = (event && event.headers) || {};
  const auth = h.authorization || h.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(auth).trim());
  if (m) return m[1];
  const q = (event && event.queryStringParameters) || {};
  return q.sessionToken || undefined;
}
