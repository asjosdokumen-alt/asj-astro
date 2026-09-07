/**
 * netlify-wrapper-surface.ts — Factory for surface-specific Netlify functions
 *
 * Instead of one monolithic bridge-links.js handling all 82+ actions,
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
import { metrics } from './kernel/metrics';
import { clientIp, sessionTokenFrom, corsHeaders } from './kernel/request-helpers';
import { codeToStatus } from './kernel/errors';

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
 * Create a Netlify handler that only accepts actions from a specific surface.
 * Unknown actions return 404 instead of falling through to the monolith.
 *
 * @param allowedActions - The action names this surface handles.
 *                         Used for fast rejection before dynamic import.
 */
export function makeSurfaceHandler(allowedActions: string[]) {
  const allowedSet = new Set(allowedActions);

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

    // Import the lazy surface loader
    const { getSurfaceHandler } = await import('../surfaces/index');
    const { handleAction } = await import('./handlers');

    let out: unknown;
    try {
      out = await runWithContext({ requestId, action: body.action, idempotencyKey, traceparent }, () =>
        handleAction(body.action ?? 'ping', body.payload || body.args, sessionTokenFrom(event, body) ?? '', {
          ip: clientIp(event) ?? undefined,
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
    // message-only failures keep the legacy 400; rate-limited stays 429.
    const statusCode = outcomeStatusCode(out);
    return { statusCode, headers: baseHeaders, body: JSON.stringify(out) };
  };
}

export { makeSurfaceHandler as makeHandler };
