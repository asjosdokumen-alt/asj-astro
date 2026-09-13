/**
 * metrics-sink.test.ts — Phase C item 11.
 *
 * The risk with a metrics exporter is not that it sends the wrong number; it is
 * that it BREAKS THE REQUEST IT IS WATCHING. Every test here is about one of the
 * three rules in the module header:
 *
 *   1. Absent URL ⇒ a true no-op (no fetch at all, not a failed one).
 *   2. Never throws into the caller (the caller is a `finally` block that has
 *      already produced a response).
 *   3. Never blocks or delays — skipped near the deadline, bounded by a timeout.
 *
 * Rule 1 is the one most likely to be "fixed" into a bug later: a well-meaning
 * change that makes a missing sink warn, retry, or throw would turn an
 * intentionally-disabled feature into a production incident.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exportMetrics, sweepMetrics } from '../metrics-sink';
import type { MetricsPayload } from '../metrics-sink';

const PAYLOAD: MetricsPayload = {
  counters: { 'handler.invoke.action=ping': 1 },
  histograms: { 'handler.latency': { count: 1, avg: 4, p50: 4, p95: 4, max: 4 } },
  gauges: { 'admission.inflight': 0 },
};

const ORIG = {
  url: process.env.METRICS_SINK_URL,
  token: process.env.METRICS_SINK_TOKEN,
  otlp: process.env.GRAFANA_CLOUD_OTLP_ENDPOINT,
  otlpAuth: process.env.GRAFANA_CLOUD_BASIC_AUTH_HEADER,
};

function restore() {
  if (ORIG.url === undefined) delete process.env.METRICS_SINK_URL;
  else process.env.METRICS_SINK_URL = ORIG.url;
  if (ORIG.token === undefined) delete process.env.METRICS_SINK_TOKEN;
  else process.env.METRICS_SINK_TOKEN = ORIG.token;
  if (ORIG.otlp === undefined) delete process.env.GRAFANA_CLOUD_OTLP_ENDPOINT;
  else process.env.GRAFANA_CLOUD_OTLP_ENDPOINT = ORIG.otlp;
  if (ORIG.otlpAuth === undefined) delete process.env.GRAFANA_CLOUD_BASIC_AUTH_HEADER;
  else process.env.GRAFANA_CLOUD_BASIC_AUTH_HEADER = ORIG.otlpAuth;
}

/**
 * Clear BOTH destinations.
 *
 * "Unconfigured" now means "neither destination is set", so a test that only
 * deletes METRICS_SINK_URL would pass on a machine that happens to have the
 * Grafana variables exported — a green suite that proves nothing. Every rule-1
 * test clears both.
 */
function clearBoth() {
  delete process.env.METRICS_SINK_URL;
  delete process.env.METRICS_SINK_TOKEN;
  delete process.env.GRAFANA_CLOUD_OTLP_ENDPOINT;
  delete process.env.GRAFANA_CLOUD_BASIC_AUTH_HEADER;
}

describe('exportMetrics — rule 1: absent configuration is a no-op', () => {
  beforeEach(clearBoth);
  afterEach(restore);

  it('does not call fetch at all when neither destination is set', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await exportMetrics(PAYLOAD);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('resolves successfully rather than rejecting when unconfigured', async () => {
    // A rejection here would be an unhandled promise rejection in production,
    // since the wrappers use `void exportMetrics(...)`.
    await expect(exportMetrics(PAYLOAD)).resolves.toBeUndefined();
  });

  it('does not send anything when the payload is null, even if configured', async () => {
    process.env.METRICS_SINK_URL = 'https://example.invalid/sink';
    const spy = vi.spyOn(globalThis, 'fetch');
    await exportMetrics(null);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('treats a whitespace-only URL as unconfigured', async () => {
    process.env.METRICS_SINK_URL = '   ';
    const spy = vi.spyOn(globalThis, 'fetch');
    await exportMetrics(PAYLOAD);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('exportMetrics — rule 2: never throws into the caller', () => {
  beforeEach(() => {
    clearBoth();
    process.env.METRICS_SINK_URL = 'https://example.invalid/sink';
  });
  afterEach(restore);

  it('swallows a network rejection', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(exportMetrics(PAYLOAD)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('swallows an abort (a slow receiver)', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(err);
    await expect(exportMetrics(PAYLOAD)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('swallows a non-2xx response without throwing', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(exportMetrics(PAYLOAD)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('swallows a receiver that returns 401 (a wrong token)', async () => {
    process.env.METRICS_SINK_TOKEN = 'bad';
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(exportMetrics(PAYLOAD)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('exportMetrics — the request it builds', () => {
  beforeEach(() => {
    clearBoth();
    process.env.METRICS_SINK_URL = 'https://sink.example.test/metrics';
  });
  afterEach(restore);

  it('POSTs the payload JSON unchanged — no second serializer', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await exportMetrics(PAYLOAD);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sink.example.test/metrics');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(PAYLOAD);
    spy.mockRestore();
  });

  it('omits the Authorization header entirely when no token is set', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await exportMetrics(PAYLOAD);
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    // An EMPTY bearer is a malformed credential and some receivers 401 on it,
    // so the header must be absent rather than empty.
    expect(headers.Authorization).toBeUndefined();
    spy.mockRestore();
  });

  it('sends a Bearer token when one is configured', async () => {
    process.env.METRICS_SINK_TOKEN = 'shh';
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await exportMetrics(PAYLOAD);
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer shh');
    spy.mockRestore();
  });

  it('passes an abort signal so a hung receiver cannot hold the socket', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await exportMetrics(PAYLOAD);
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeDefined();
    spy.mockRestore();
  });
});

describe('exportMetrics — rule 3: bounded, never delaying', () => {
  beforeEach(() => {
    clearBoth();
    process.env.METRICS_SINK_URL = 'https://example.invalid/sink';
  });
  afterEach(restore);

  it('skips the export entirely when the request deadline has nearly expired', async () => {
    // Set a deadline 100 ms away — under MIN_REMAINING_MS. Importing the
    // deadline module directly is what the sink reads, so the guard is exercised
    // without mocking internals.
    const { runWithContext } = await import('../kernel/log');
    const spy = vi.spyOn(globalThis, 'fetch');

    await runWithContext(
      { requestId: 'test', deadlineAt: Date.now() + 100 },
      () => exportMetrics(PAYLOAD),
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('still exports when there is plenty of time left', async () => {
    const { runWithContext } = await import('../kernel/log');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await runWithContext(
      { requestId: 'test', deadlineAt: Date.now() + 10_000 },
      () => exportMetrics(PAYLOAD),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('exports outside a request context (no deadline set)', async () => {
    // remainingMs() is Infinity with no deadline, so the guard must not treat
    // "no context" as "no time". This is the sweep-queue path.
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await exportMetrics(PAYLOAD);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('exportMetrics — the OTLP destination (Grafana Cloud)', () => {
  beforeEach(() => {
    clearBoth();
    process.env.GRAFANA_CLOUD_OTLP_ENDPOINT =
      'https://otlp-gateway-prod-ap-southeast-2.grafana.net/otlp';
    process.env.GRAFANA_CLOUD_BASIC_AUTH_HEADER = 'Basic MTgyODE1MzphYmNkZWY=';
  });
  afterEach(restore);

  it('exports over OTLP even when no METRICS_SINK_URL is set', async () => {
    // The two destinations are independent: OTLP alone is a valid config.
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await exportMetrics(PAYLOAD);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://otlp-gateway-prod-ap-southeast-2.grafana.net/otlp/v1/metrics');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Basic MTgyODE1MzphYmNkZWY=');
    spy.mockRestore();
  });

  it('sends an OTLP body, not the repo payload shape', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await exportMetrics(PAYLOAD);
    const body = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    // The receiver wants OTLP, so the payload is translated — this is the one
    // place a second serializer is correct, and it is a pure function in otlp.ts.
    expect(body.resourceMetrics).toBeDefined();
    expect(body.counters).toBeUndefined();
    spy.mockRestore();
  });

  it('fires both destinations when both are configured', async () => {
    process.env.METRICS_SINK_URL = 'https://sink.example.test/metrics';
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await exportMetrics(PAYLOAD);
    const urls = spy.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      'https://sink.example.test/metrics',
      'https://otlp-gateway-prod-ap-southeast-2.grafana.net/otlp/v1/metrics',
    ]);
    spy.mockRestore();
  });

  it('REFUSES to send when the credential is still the placeholder', async () => {
    // Sending it would produce a 401 indistinguishable from a revoked key. The
    // guard turns a silent misconfiguration into one clear log line instead.
    process.env.GRAFANA_CLOUD_BASIC_AUTH_HEADER = 'Basic base64(1828153:<grafana.com API Key>)';
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(exportMetrics(PAYLOAD)).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('still delivers to the sink when only the OTLP credential is broken', async () => {
    // One misconfigured destination must not take the other one down with it.
    process.env.METRICS_SINK_URL = 'https://sink.example.test/metrics';
    process.env.GRAFANA_CLOUD_BASIC_AUTH_HEADER = 'Basic base64(1824999:<key>)';
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await exportMetrics(PAYLOAD);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['https://sink.example.test/metrics']);
    spy.mockRestore();
  });

  it('swallows an OTLP failure without throwing', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'));
    await expect(exportMetrics(PAYLOAD)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('swallows an OTLP 401 without throwing', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(exportMetrics(PAYLOAD)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('applies the deadline guard to the OTLP export too', async () => {
    const { runWithContext } = await import('../kernel/log');
    const spy = vi.spyOn(globalThis, 'fetch');
    await runWithContext(
      { requestId: 'test', deadlineAt: Date.now() + 100 },
      () => exportMetrics(PAYLOAD),
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not send when the endpoint is whitespace only', async () => {
    process.env.GRAFANA_CLOUD_OTLP_ENDPOINT = '   ';
    const spy = vi.spyOn(globalThis, 'fetch');
    await exportMetrics(PAYLOAD);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('sweepMetrics', () => {
  it('names counters with the sweep.* prefix the logs already use', () => {
    const p = sweepMetrics({ processed: 3, failed: 1, cleaned: 12, durationMs: 850 });
    // One convention for both the log stream and the sink, so a receiver can
    // key on the prefix regardless of which one reached it.
    expect(p.counters['sweep.processed']).toBe(3);
    expect(p.counters['sweep.failed']).toBe(1);
    expect(p.counters['sweep.cleaned']).toBe(12);
    expect(p.gauges['sweep.duration_ms']).toBe(850);
  });

  it('produces a payload the sink accepts', () => {
    const p = sweepMetrics({ processed: 0, failed: 0, cleaned: 0, durationMs: 0 });
    expect(Object.keys(p).sort()).toEqual(['counters', 'gauges', 'histograms']);
  });
});
