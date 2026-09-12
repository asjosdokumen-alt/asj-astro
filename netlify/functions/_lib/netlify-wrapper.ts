import { randomUUID } from 'node:crypto';
import { handleAction } from './handlers';
import { runWithContext } from './kernel/log';
import type { LogContext } from './kernel/log';
import { exportMetrics } from './metrics-sink';
import { clientIp, sessionTokenFrom, corsHeaders, backpressureHeaders } from './kernel/request-helpers';
import { DEFAULT_DEADLINE_MS, deadlineFrom } from './kernel/deadline';
// netlify-wrapper.js — factory handler Netlify standar.
//
// Setiap file di netlify/functions/<nama>.js hanyalah:
//   export default adapt(makeHandler());
// dan seluruh logika dipusatkan di _lib/handlers.js (dispatch per action).
//
// ── BUNDLE-SIZE CONTRACT ────────────────────────────────────────────────────
// This wrapper statically imports the FULL action router (surfaces/registry), so
// every entry point built on it pays for all 15 surfaces + 14 contexts
// (~690 KB). That is deliberate but must stay confined here: this file is for
// the catch-all/fallback path only (bridge-links).
//
// Narrow, high-traffic surfaces MUST use makeSurfaceHandler(<ACTIONS>, [...])
// from './netlify-wrapper-surface' instead, which injects a single-surface
// resolver and never reaches surfaces/registry.
//
// Adding makeHandler() to a new file re-creates the 690 KB problem. Don't.
//
// NOTE: the router file is `surfaces/registry.ts`, NOT `surfaces/index.ts`. It
// must never be renamed to `index.*` — Netlify deploys `<subdir>/index.*` as a
// function, and a handler-less function forces Lambda compatibility mode, where
// the 4 KB env ceiling still applies. See check 3b in
// scripts/ci/verify-function-entries.mjs.
import { getSurfaceHandler } from '../surfaces/registry';

function makeHandler() {
  return async (event: any) => {
    // P36 fix: batas ukuran body (sama seperti surface wrapper) — wrapper
    // legacy ini menerima semua 80+ aksi termasuk CRUD admin.
    const MAX_BODY_SIZE = 10 * 1024 * 1024;
    if (event.body && event.body.length > MAX_BODY_SIZE) {
      return {
        statusCode: 413,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ success: false, message: 'Request body too large (max 10MB)' }),
      };
    }
    let body: Record<string, any> = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      /* body non-JSON -> action kosong */
    }
    // Keep-alive via GET (curl ?action=ping) — action boleh datang dari query
    // string kalau body kosong (mis. GitHub Actions keep-alive).
    if (!body.action) {
      const q = (event && event.queryStringParameters) || {};
      body.action = body.action || q.action || undefined;
      if (body.action) {
        body.payload = body.payload || body.args || q.payload || undefined;
      }
    }
    // Phase 5: extract Idempotency-Key header for mutation dedup
    const idempotencyKey = (event && event.headers)
      ? (event.headers['idempotency-key'] || event.headers['Idempotency-Key'] || undefined)
      : undefined;

    // Phase 7: extract traceparent for distributed tracing (§10.3)
    const traceparent = (event && event.headers)
      ? (event.headers['traceparent'] || event.headers['Traceparent'] || undefined)
      : undefined;
    const requestId = randomUUID();
    // Phase B: same occupancy bound as the surface wrapper — see there for why.
    const deadlineAt = deadlineFrom(Date.now(), DEFAULT_DEADLINE_MS);

    // Phase C item 11: the dispatcher parks the flushed metrics payload here so
    // it can reach the external sink after the response is built. See
    // kernel/log.ts LogContext.flushedMetrics for why it rides on the context.
    const reqContext: LogContext = {
      requestId,
      action: body.action,
      idempotencyKey,
      traceparent,
      deadlineAt,
    };

    let out;
    try {
      out = await runWithContext(reqContext, () =>
        handleAction(body.action, body.payload || body.args, sessionTokenFrom(event, body) as string, {
          ip: clientIp(event) ?? undefined,
          // The catch-all is the one place the full router is reachable.
          resolve: getSurfaceHandler,
        }),
      );
    } catch (e: unknown) {
      // P37 fix: jangan bocorkan detail error internal (body PostgREST /
      // upstream) ke klien — log di server saja.
      console.error('[wrapper] error:', e);
      out = { success: false, message: 'Terjadi kesalahan saat memproses permintaan.' };
    }
    const requestOrigin = (event && event.headers)
      ? (event.headers.origin || event.headers.Origin || '')
      : '';
    const baseHeaders = corsHeaders(requestOrigin);
    // Respons RAW dari handler (action 'ping': { statusCode: 200, body: 'pong' })
    // diteruskan apa adanya — tanpa JSON.stringify, tanpa bungkus tambahan.
    if (
      out &&
      typeof out === 'object' &&
      typeof out.statusCode === 'number' &&
      out.body !== undefined
    ) {
      return {
        statusCode: out.statusCode,
        headers: baseHeaders,
        body: String(out.body),
      };
    }
    const rec = (out || {}) as Record<string, unknown>;
    // Legacy status mapping, preserved as-is for the retiring alias path so old
    // deployed clients keep behaving. The new backpressure codes are the only
    // addition: reporting a shed request (503) or an expired deadline (504) as
    // a 400 would tell clients their input was bad, so they would fix nothing
    // and retry immediately — the behaviour that sustains an overload.
    const statusCode = rec.rateLimited
      ? 429
      : rec.code === 'OVERLOADED'
        ? 503
        : rec.code === 'DEADLINE_EXCEEDED'
          ? 504
          : rec.success === false
            ? 400
            : 200;
    const response = {
      statusCode,
      headers: backpressureHeaders(baseHeaders, out),
      body: JSON.stringify(out),
    };
    // Phase C item 11: ship this invocation's metrics, after the response is
    // fixed and without awaiting it. See netlify-wrapper-surface.ts for the
    // full reasoning; the two wrappers must behave identically or the metrics
    // would depend on which URL a client happened to hit.
    void exportMetrics(reqContext.flushedMetrics ?? null);
    return response;
  };
}
export { makeHandler };
