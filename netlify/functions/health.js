/**
 * health.js — dependency-health endpoint (Phase C item 12)
 *
 *   GET  /.netlify/functions/health            → liveness (no secret, no DB)
 *   POST /.netlify/functions/health            → full report (secret required)
 *   GET  /.netlify/functions/health?detail=1   → full report (secret required)
 *
 * WHY A SEPARATE ENTRY POINT AND NOT AN ACTION ON bridge-links
 * -----------------------------------------------------------
 * Two reasons, one of them security:
 *
 *   1. Blast radius. bridge-links pulls in all 15 surfaces and 14 contexts
 *      (~1.5 MB bundled). A monitoring probe that fires every minute should not
 *      pay for — or depend on — the entire application being healthy enough to
 *      load. This function needs `_lib/health` and nothing else.
 *
 *   2. Reachability. An action registered in surfaces/registry is answerable by
 *      every entry point that reaches the router. Gating it would then depend on
 *      the gate holding everywhere, forever. Here the action is reachable from
 *      exactly one URL, and the wiring is a few lines the reader can audit.
 *
 * ── AUTH MODEL: FAIL CLOSED ──────────────────────────────────────────────────
 * The full report is gated behind HEALTH_TOKEN. If HEALTH_TOKEN is unset the
 * detailed path returns 503, NOT 200. That is the deliberate choice: an
 * unconfigured secret must not silently degrade into a public endpoint that
 * enumerates your dependencies, queue depth, and upstream error strings.
 *
 * Because it fails closed, a missing token makes the endpoint look broken to a
 * monitor — which is the correct signal. Look at the 503's `reason` field:
 *   'HEALTH_TOKEN not configured'  → configuration problem
 *   'missing or invalid token'     → caller problem
 *
 * ── WHY GET IS SPLIT ─────────────────────────────────────────────────────────
 * `GET` with no token stays open as a liveness probe (200 `{status:'ok'}` with
 * no internals). Uptime monitors and load balancers need an unauthenticated
 * 200/503 signal, and Netlify's own checks cannot send a secret. The liveness
 * path touches no database and leaks only that the function is deployed.
 *
 * A wrong `Authorization` header is always 401, never silently downgraded to
 * the liveness response — otherwise a mis-set token would look like success.
 *
 * ── SHAPE ────────────────────────────────────────────────────────────────────
 * The body below is a plain Lambda-shaped handler wrapped in `adapt()` from
 * `_lib/netlify-adapter.ts`, which is what Netlify Functions modern requires
 * (`export default`, Request → Response). The handler still receives `event`,
 * because the auth logic and its tests are written against it and there is
 * nothing to gain from rewriting them. See that file for the full reasoning.
 */

import { randomUUID } from 'node:crypto';
import { adapt } from './_lib/netlify-adapter.js';

/** Constant-time comparison, so token validation does not leak length/prefix. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(event) {
  const m = String(rawAuthHeader(event)).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/** The raw Authorization header, or '' when absent. */
function rawAuthHeader(event) {
  const h = (event && event.headers) || {};
  return h.authorization || h.Authorization || '';
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Never cache a health read: a CDN or client holding a stale "ok" is
      // exactly the failure this endpoint exists to detect.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
    body: JSON.stringify(body),
  };
}

async function handler(event) {
  const method = ((event && event.httpMethod) || 'GET').toUpperCase();
  const q = (event && event.queryStringParameters) || {};
  const wantsDetail = method === 'POST' || q.detail === '1' || q.detail === 'true';
  const authHeader = rawAuthHeader(event);
  const token = bearer(event);

  // A malformed Authorization header is a CALLER ERROR, not an anonymous
  // request. Treating it as anonymous would quietly serve the public liveness
  // response to a monitor whose header is subtly wrong — a wrong scheme, a
  // missing space, a stray character — which reads as "healthy" forever while
  // the detailed probe it was supposed to run never happens. Same reasoning as
  // "a wrong token is never downgraded".
  if (authHeader && !token) {
    console.warn('[health] rejected: malformed Authorization header', {
      requestId: randomUUID(),
    });
    return json(401, {
      success: false,
      error: 'Unauthorized.',
      reason: 'malformed Authorization header (expected "Bearer <token>")',
    });
  }

  // ── Liveness: no token, no database, no internals ─────────────────────────
  if (!wantsDetail && !token) {
    return json(200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      // Distinguishes "alive" from "reportable" without authentication.
      detail: process.env.HEALTH_TOKEN ? 'gated' : 'unconfigured',
    });
  }

  const requestId = randomUUID();

  // ── Fail closed on an unconfigured secret ─────────────────────────────────
  const expected = process.env.HEALTH_TOKEN;
  if (!expected) {
    console.error('[health] HEALTH_TOKEN is not set — refusing to serve the full report', {
      requestId,
    });
    return json(503, {
      success: false,
      error: 'Health detail is disabled: HEALTH_TOKEN is not configured.',
      reason: 'HEALTH_TOKEN not configured',
      requestId,
    });
  }

  if (!token || !safeEqual(token, expected)) {
    // Logged without the supplied value — a wrong token may be a typo of a real
    // secret, and this message goes to a shared log stream.
    console.warn('[health] rejected: invalid token', { requestId, supplied: token ? 'present' : 'absent' });
    return json(401, {
      success: false,
      error: 'Unauthorized.',
      reason: 'missing or invalid token',
      requestId,
    });
  }

  // ── Full report ───────────────────────────────────────────────────────────
  // Imported lazily so the liveness path never even loads the health module's
  // dependency graph (breakers, db client, deadline). Netlify inlines the graph
  // regardless, but keeping the import at the use site makes the split visible
  // to a reader and to any future bundler.
  const { buildHealthReport, logHealthReport } = await import('./_lib/health.js');
  try {
    const report = await buildHealthReport({ includeShared: true });
    logHealthReport(report);
    // 503 on 'down' so a plain uptime monitor can consume the detailed URL and
    // still be correct without parsing the body. 'degraded' stays 200: work is
    // still being served, and paging on it would be noise.
    return json(report.status === 'down' ? 503 : 200, { success: true, requestId, ...report });
  } catch (e) {
    // PR4 (playbook §3.3 "never leak"): internal detail stays in the log.
    console.error('[health] report failed:', e instanceof Error ? e.message : String(e));
    return json(503, {
      success: false,
      error: 'Health report could not be produced.',
      reason: 'report-failed',
      requestId,
    });
  }
}

export default adapt(handler);
