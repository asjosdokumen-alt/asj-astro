/**
 * metrics-receiver.test.ts — the Phase C reference receiver
 *
 * These tests exist because the receiver's whole value is in behaviour that a
 * casual read gets wrong:
 *
 *   - it must NOT accept anonymous writes (fail-closed, like /health)
 *   - it must alert on a dead-letter arrival, which is the one signal that means
 *     "committed work will never complete"
 *   - it must NOT alert on a healthy payload — a receiver that cries wolf is
 *     worse than no receiver, because it trains the operator to ignore it
 *   - it must parse the kernel's `.label=value` key format correctly, which is
 *     the single most likely place for a silent bug: a parse that drops labels
 *     still "finds" counters and would appear to work
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
// The entry point now exports a Netlify-modern default (Request -> Response)
// wrapped around the legacy Lambda-shaped handler by _lib/netlify-adapter.ts.
// The adapter is deliberately DUAL-MODE, so calling it with the plain event
// objects below still returns { statusCode, body } — which is what these
// assertions are written against, and why only this import line changed.
import handler from '../metrics-receiver';

const TOKEN = 'test-receiver-token';

/**
 * The adapted handler returns `Response | LegacyOutcome`, and a `Response`
 * carries no `statusCode`, so every assertion on `.statusCode` / `.body`
 * needs a narrowing step. This throws instead of silently passing when the
 * handler returns something unexpected — a test that accepts "no response"
 * as "no problem" is worse than no test.
 */
async function invoke(event: unknown): Promise<{ statusCode: number; body: string }> {
  const res = await handler(event as any, {} as any);
  if (!res || typeof res === 'object' === false || !('statusCode' in res)) {
    throw new Error(`handler returned no response object: ${JSON.stringify(res)}`);
  }
  return { statusCode: (res as any).statusCode, body: String((res as any).body ?? '') };
}

function evt(body: unknown, auth: string | null = `Bearer ${TOKEN}`): unknown {
  return {
    httpMethod: 'POST',
    headers: auth ? { authorization: auth } : {},
    body: JSON.stringify(body),
  };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.METRICS_RECEIVER_TOKEN = TOKEN;
  delete process.env.METRICS_NOTIFY_URL; // notify() no-ops and logs instead
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('metrics-receiver — auth (fail closed)', () => {
  it('refuses when METRICS_RECEIVER_TOKEN is unconfigured', async () => {
    delete process.env.METRICS_RECEIVER_TOKEN;
    const res = await invoke(evt({ counters: {}, histograms: {}, gauges: {} }));
    expect(res.statusCode).toBe(503);
    expect(String(res.body)).toContain('not configured');
  });

  it('rejects a wrong token with 401', async () => {
    const res = await invoke(evt({ counters: {} }, 'Bearer nope'));
    expect(res.statusCode).toBe(401);
  });

  it('rejects a missing Authorization header with 401', async () => {
    const res = await invoke(evt({ counters: {} }, ''));
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed Authorization value (no Bearer scheme)', async () => {
    const res = await invoke(evt({ counters: {} }, TOKEN));
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-POST with 405', async () => {
    const res = await invoke({ httpMethod: 'GET', headers: {}, body: null } as any);
    expect(res.statusCode).toBe(405);
  });

  it('rejects invalid JSON with 400 once authenticated', async () => {
    const res = await invoke({ httpMethod: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: '{not json' } as any);
    expect(res.statusCode).toBe(400);
  });
});

describe('metrics-receiver — rule evaluation', () => {
  it('does NOT fire on a healthy payload', async () => {
    const res = await invoke(evt({
        counters: {
          'handler.invoke.action=getAppData': 5,
          'dependency.call.dep=postgrest.outcome=success': 5,
        },
        histograms: {},
        gauges: { 'sweep.duration_ms': 400 },
      }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(String(res.body)).firedCount).toBe(0);
  });

  it('fires A6 on a dead-letter / sweep failure', async () => {
    const res = await invoke(evt({ counters: { 'sweep.failed': 1 }, histograms: {}, gauges: {} }));
    expect(JSON.parse(String(res.body)).firedCount).toBeGreaterThan(0);
  });

  it('fires A3 on a handler error burst and names the offending action', async () => {
    // 12 DISTINCT keys (the `code` label differs), which also exercises
    // `sumByBase` aggregating across label combinations rather than reading one
    // exact key. The kernel produces this shape when several error codes occur.
    const counters: Record<string, number> = {};
    for (let i = 0; i < 12; i++) counters[`handler.error.action=getAppData.code=E${i}`] = 1;
    const res = await invoke(evt({ counters, histograms: {}, gauges: {} }));
    const body = JSON.parse(String(res.body));
    expect(body.firedCount).toBeGreaterThan(0);
  });

  it('parses the kernel .label=value key format — a labeled counter is not missed', async () => {
    // This is the silent-bug guard. `sweep.failed` carries no labels, but
    // `dependency.call.*` does. If parseKey dropped labels, `depFailures` would
    // silently return 0 and A5-adjacent alerting would never fire.
    //
    // NOTE: the kernel already aggregates per invocation (`increment` does
    // `counters.set(key, prev + 1)`), so ONE key with a high count is the
    // realistic shape — not 15 distinct keys. An earlier version of this test
    // wrote `counters[key] = 1` inside a loop and therefore asserted on a count
    // of 1 while appearing to build up 15.
    const counters = { 'dependency.call.dep=postgrest.outcome=timeout': 15 };
    const res = await invoke(evt({ counters, histograms: {}, gauges: {} }));
    expect(JSON.parse(String(res.body)).firedCount).toBeGreaterThan(0);
  });

  it('does not count successful dependency calls as failures', async () => {
    // One key with a high count — the realistic shape, since the kernel
    // aggregates per invocation. Successful outcomes must never be counted, or
    // a busy healthy system would page constantly.
    const counters = { 'dependency.call.dep=postgrest.outcome=success': 50 };
    const res = await invoke(evt({ counters, histograms: {}, gauges: {} }));
    expect(JSON.parse(String(res.body)).firedCount).toBe(0);
  });

  it('suppresses a re-notification inside the renotify window', async () => {
    const payload = { counters: { 'sweep.failed': 1 }, histograms: {}, gauges: {} };
    const first = await invoke(evt(payload));
    const second = await invoke(evt(payload));
    expect(JSON.parse(String(first.body)).firedCount).toBeGreaterThan(0);
    // Same condition, immediately again — the operator must not be spammed.
    expect(JSON.parse(String(second.body)).firedCount).toBe(0);
  });

  it('returns 200 even when rules fired (an alert is not a rejection)', async () => {
    const res = await invoke(evt({ counters: { 'sweep.failed': 3 }, histograms: {}, gauges: {} }));
    expect(res.statusCode).toBe(200);
  });
});
