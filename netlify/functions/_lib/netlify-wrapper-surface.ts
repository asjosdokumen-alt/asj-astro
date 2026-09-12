/**
 * netlify-wrapper-surface.ts — Factory for surface-specific Netlify functions
 *
 * Instead of one monolithic bridge-links.js handling every action in the router,
 * each surface gets its own entry point. This enables:
 *   - Concurrent scaling: Netlify routes auth requests to auth.js,
 *     public requests to get-app-data.js, etc.
 *   - Smaller cold starts: each function only loads its surface module.
 *   - Independent retries: a failing AI surface doesn't block auth.
 *
 * Usage in netlify/functions/auth.js:
 *   const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
 *   exports.handler = makeSurfaceHandler(['checkAdminMaster', 'loginKandidat', ...]);
 */

import { randomUUID } from 'node:crypto';
import { log, runWithContext } from './kernel/log';
import type { LogContext } from './kernel/log';
import { metrics } from './kernel/metrics';
import { exportMetrics } from './metrics-sink';
import { clientIp, sessionTokenFrom, corsHeaders, backpressureHeaders } from './kernel/request-helpers';
import { codeToStatus } from './kernel/errors';
import { DEFAULT_DEADLINE_MS, deadlineFrom } from './kernel/deadline';

// ── Outcome → HTTP status ─────────────────────────────────────────────────────────────────────────
/**
 * Map a dispatcher outcome to its HTTP status. Outcomes are plain objects:
 * success responses carry no status; AppError rejections serialize (via
 * toErrorResponse) as { success:false, code }; legacy failures carry only a
 * message; rate-limit responses carry rateLimited:true. Precedence:
 * rateLimited (429) > code (codeToStatus in kernel/errors) > message-only (400)
 * > 200. Exported for direct unit coverage of the precedence policy.
 */
export function outcomeStatusCode(out: unknown): number {
  if (!out || typeof out !== 'object') return 200;
  const rec = out as Record<string, unknown>;
  if (rec.rateLimited) return 429;
  if (rec.success === false) {
    if (typeof rec.code === 'string') return codeToStatus(rec.code);
    if (rec.message) return 400;
  }
  return 200;
}

// ── Surface handler factory ─────────────────────────────────────────────────

/**
 * Create a Netlify handler bound to ONE surface's action map.
 *
 * BUNDLE-SIZE CONTRACT (read this before changing the signature)
 * -------------------------------------------------------------
 * Netlify bundles each function as a single CommonJS file with NO code
 * splitting, so any module reachable from the entry point's static graph is
 * inlined — including dynamic `import()`s. Reaching for the shared router
 * (`surfaces/registry`) therefore pulled all 15 surfaces and 14 contexts into
 * every entry point: ~690 KB each, 19.4 MB deployed.
 *
 * So the action map is passed IN, and the entry point statically requires
 * only its own surface module:
 *
 *   // auth.js
 *   const { makeSurfaceHandler } = require('./_lib/netlify-wrapper-surface');
 *   const { AUTH_ACTIONS } = require('./surfaces/auth');
 *   exports.handler = makeSurfaceHandler(AUTH_ACTIONS, ['loginKandidat', ...]);
 *
 * The allow-list is still useful: it rejects out-of-surface actions with 404
 * before any handler is resolved, instead of falling through to the monolith.
 *
 * AN ENTRY POINT MAY HOST MORE THAN ONE SURFACE
 * ---------------------------------------------
 * A few actions are routed by clients to an entry point that does not own
 * them in the router (e.g. `getJobStatus` is served by /notify and /ai-chat
 * but owned by the ai surface; `simpanBiodataLengkap` is served by /files but
 * owned by master). Pass an ARRAY of maps to cover those without reaching for
 * the full router — still far narrower than all 15 surfaces.
 *
 *   exports.handler = makeSurfaceHandler([NOTIFY_ACTIONS, AI_ACTIONS], [...]);
 *
 * @param actionsMap      One surface's action table, or an array of tables.
 * @param allowedActions  Action names this entry point accepts.
 */
export function makeSurfaceHandler(
  actionsMap:
    | Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>>
    | Array<Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>>>,
  allowedActions: string[],
) {
  const allowedSet = new Set(allowedActions);
  const maps = Array.isArray(actionsMap) ? actionsMap : [actionsMap];

  if (maps.length === 0 || maps.some((m) => !m || typeof m !== 'object')) {
    // Fail at import time, not per-request: a surface with no map would
    // otherwise answer every call with NOT_IMPLEMENTED, which looks like a
    // business error rather than a wiring mistake.
    throw new TypeError(
      'makeSurfaceHandler: actionsMap is required. Pass the surface module\'s ' +
        "exported *_ACTIONS map (e.g. require('./surfaces/auth').AUTH_ACTIONS), " +
        'or an array of maps.',
    );
  }

  /** Narrow resolver: only the maps this entry point declared. Never reaches surfaces/registry. */
  const resolve = async (action: string) => {
    for (const m of maps) {
      const h = m[action];
      if (h) return h;
    }
    return null;
  };

  return async (event: { body?: string; headers?: Record<string, string>; queryStringParameters?: Record<string, string> }) => {
    // S10 fix: Add request size limit (10MB max)
    const MAX_BODY_SIZE = 10 * 1024 * 1024;
    if (event.body && event.body.length > MAX_BODY_SIZE) {
      return {
        statusCode: 413,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          success: false,
          message: 'Request body too large (max 10MB)',
        }),
      };
    }

    let body: Record<string, any> = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch { /* body non-JSON */ }

    if (!body.action) {
      const q = (event && event.queryStringParameters) || {};
      body.action = body.action || q.action || undefined;
      if (body.action) {
        // P19 fix: Parse query-string payload from string to array.
        // Without this, payload[0] yields the first character, not the first argument.
        const raw = body.payload || body.args || q.payload || undefined;
        if (typeof raw === 'string') {
          try { body.payload = JSON.parse(raw); } catch { body.payload = [raw]; }
        } else {
          body.payload = raw;
        }
      }
    }

    // Fast rejection: this surface doesn't handle this action
    if (body.action && !allowedSet.has(body.action) && body.action !== 'ping') {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          success: false,
          message: `Action '${body.action}' not handled by this surface.`,
        }),
      };
    }

    // Idempotency key
    const idempotencyKey = (event && event.headers)
      ? (event.headers['idempotency-key'] || event.headers['Idempotency-Key'] || undefined)
      : undefined;

    // Distributed tracing
    const traceparent = (event && event.headers)
      ? (event.headers['traceparent'] || event.headers['Traceparent'] || undefined)
      : undefined;
    // LOW fix: Use randomUUID() for clear, collision-free request IDs.
    const requestId = randomUUID();

    // Phase B: bound occupancy. Every dependency call made during this request
    // is clamped to whatever remains of this deadline (see kernel/http.ts), so
    // no single request can hold a function slot for the platform's full 60 s
    // ceiling while its per-dependency budgets quietly sum.
    const deadlineAt = deadlineFrom(Date.now(), DEFAULT_DEADLINE_MS);

    // NOTE: no `import('../surfaces/registry')` here — that is the whole point of
    // the injected resolver. Only bridge-links (the catch-all) owns the router.
    const { handleAction } = await import('./handlers');

    // Phase C item 11: read the payload the dispatcher parks on the context.
    // Captured here rather than at export time because handleAction clears the
    // metrics collections in its `finally`, so there is exactly one moment at
    // which this value exists.
    const reqContext: LogContext = {
      requestId,
      action: body.action,
      idempotencyKey,
      traceparent,
      deadlineAt,
    };

    let out: unknown;
    try {
      out = await runWithContext(reqContext, () =>
        handleAction(body.action ?? 'ping', body.payload || body.args, sessionTokenFrom(event, body) ?? '', {
          ip: clientIp(event) ?? undefined,
          resolve,
        }),
      );
    } catch (e: unknown) {
      // P37 fix: jangan bocorkan detail error internal ke klien — log saja.
      log.error('surface-wrapper.error', { err: e instanceof Error ? e.message : String(e) });
      out = { success: false, message: 'Terjadi kesalahan saat memproses permintaan.' };
    }

    const requestOrigin = event?.headers?.origin || event?.headers?.Origin || '';
    const baseHeaders = corsHeaders(requestOrigin);

    const rec = out as Record<string, unknown>;
    if (out && typeof out === 'object' && typeof rec.statusCode === 'number' && rec.body !== undefined) {
      return { statusCode: rec.statusCode as number, headers: baseHeaders, body: String(rec.body) };
    }
    // P18 fix: Return proper HTTP status for error responses instead of 200.
    // AppError-serialized rejections map through codeToStatus (kernel/errors);
    // message-only failures keep the legacy 400; rate-limited stays 429; a shed
    // request carries code OVERLOADED and maps to 503.
    const statusCode = outcomeStatusCode(out);
    const response = {
      statusCode,
      headers: backpressureHeaders(baseHeaders, out),
      body: JSON.stringify(out),
    };

    // Phase C item 11: ship this invocation's metrics to the external sink.
    //
    // HERE, and not inside metrics.flushMetrics(): the flush already happened in
    // the dispatcher's `finally`, and it cleared the collections, so the payload
    // had to be carried forward rather than re-read. It is also deliberately not
    // awaited — the response is complete and the export must not add latency to
    // it. exportMetrics() never rejects, so a floating promise cannot surface as
    // an unhandled rejection.
    void exportMetrics(reqContext.flushedMetrics ?? null);

    return response;
  };
}

export { makeSurfaceHandler as makeHandler };
