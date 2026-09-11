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
};

function restore() {
  if (ORIG.url === undefined) delete process.env.METRICS_SINK_URL;
  else process.env.METRICS_SINK_URL = ORIG.url;
  if (ORIG.token === undefined) delete process.env.METRICS_SINK_TOKEN;
  else process.env.METRICS_SINK_TOKEN = ORIG.token;
}

describe('exportMetrics — rule 1: absent configuration is a no-op', () => {
  beforeEach(() => {
    delete process.env.METRICS_SINK_URL;
    delete process.env.METRICS_SINK_TOKEN;
  });
  afterEach(restore);

  it('does not call fetch at all when METRICS_SINK_URL is unset', async () => {
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
    process.env.METRICS_SINK_URL = 'https://example.invalid/sink';
    delete process.env.METRICS_SINK_TOKEN;
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
    process.env.METRICS_SINK_URL = 'https://sink.example.test/metrics';
    delete process.env.METRICS_SINK_TOKEN;
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
