/**
 * metrics-pipeline.test.ts — the wiring, end to end.
 *
 * The unit tests next door prove the sink behaves; these prove the sink is
 * actually REACHED with a real payload. That distinction matters here more than
 * usual, because the pipeline crosses three modules through a field on the
 * AsyncLocalStorage context:
 *
 *   handlers.handleAction
 *     → metrics.flushMetrics()   (clears the collections, returns the payload)
 *     → ctx.flushedMetrics = ... (parked on the ALS context)
 *   netlify-wrapper-surface
 *     → exportMetrics(ctx.flushedMetrics)
 *
 * Every hop is easy to break in a way that silently exports nothing: a detached
 * `void` promise, a context written to a copy, a flush that clears before the
 * read. None of those fail a test that only inspects the sink in isolation, and
 * none of them would be visible in production either — the metrics would simply
 * stop arriving. So each hop is asserted directly.
 *
 * The ALS hand-off is the fragile one and gets its own test with no HTTP at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runWithContext, asyncLocalStorage, type LogContext } from './log';
import { metrics } from './metrics';
import { flushMetrics } from './metrics';
import { exportMetrics } from '../metrics-sink';

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

describe('flush → context hand-off', () => {
  it('flushMetrics returns the payload AND clears it in the same call', () => {
    metrics.increment('probe.counter');
    const flushed = flushMetrics();
    expect(flushed).not.toBeNull();
    expect(flushed!.counters['probe.counter']).toBe(1);

    // The reason the payload must be carried rather than re-read: a second read
    // sees nothing at all.
    expect(flushMetrics()).toBeNull();
    expect(metrics.metricsEmpty()).toBe(true);
  });

  it('returns null when nothing was recorded, so the sink is not called at all', () => {
    expect(metrics.metricsEmpty()).toBe(true);
    expect(flushMetrics()).toBeNull();
  });

  it('parks the payload on the ALS context so a wrapper can read it afterwards', () => {
    const ctx: LogContext = { requestId: 'r1' };
    let observed: unknown;

    runWithContext(ctx, () => {
      metrics.increment('handler.invoke.action=ping');
      const flushed = flushMetrics();
      if (flushed) ctx.flushedMetrics = flushed;
      // Read back through the store, the way a wrapper on the same async scope
      // would — not through the outer `ctx` reference.
      observed = asyncLocalStorage.getStore()?.flushedMetrics;
    });

    expect(observed).toBeDefined();
    expect((observed as { counters: Record<string, number> }).counters['handler.invoke.action=ping']).toBe(1);
  });

  it('survives an awaited boundary, so a wrapper reading after `await` still sees it', async () => {
    // handleAction is async and the wrapper awaits it. If the store were lost
    // across that boundary the export would silently become a no-op in
    // production and this test would be the only thing that noticed.
    const ctx: LogContext = { requestId: 'r2' };

    const observed = await runWithContext(ctx, async () => {
      metrics.increment('handler.invoke.action=ping');
      await Promise.resolve();
      const flushed = flushMetrics();
      if (flushed) ctx.flushedMetrics = flushed;
      await new Promise((r) => setTimeout(r, 0));
      return asyncLocalStorage.getStore()?.flushedMetrics;
    });

    expect(observed).toBeDefined();
    expect((observed as { counters: Record<string, number> }).counters['handler.invoke.action=ping']).toBe(1);
  });

  it('does not leak one invocation\'s payload into the next', () => {
    const first: LogContext = { requestId: 'a' };
    const second: LogContext = { requestId: 'b' };

    runWithContext(first, () => {
      metrics.increment('one');
      const f = flushMetrics();
      if (f) first.flushedMetrics = f;
    });
    runWithContext(second, () => {
      // Nothing recorded in this invocation → no payload → sink not called.
      const f = flushMetrics();
      if (f) second.flushedMetrics = f;
    });

    expect(first.flushedMetrics?.counters.one).toBe(1);
    expect(second.flushedMetrics).toBeUndefined();
  });
});

describe('the export actually receives the flushed payload', () => {
  beforeEach(() => {
    process.env.METRICS_SINK_URL = 'https://sink.example.test/metrics';
    delete process.env.METRICS_SINK_TOKEN;
  });
  afterEach(restore);

  it('sends exactly what flushMetrics returned, unchanged', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    const ctx: LogContext = { requestId: 'r3' };
    await runWithContext(ctx, async () => {
      metrics.increment('handler.invoke.action=ping');
      metrics.gauge('admission.inflight', 2);
      const flushed = flushMetrics();
      if (flushed) ctx.flushedMetrics = flushed;
      await exportMetrics(ctx.flushedMetrics ?? null);
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    // Same object the log line carried — the whole reason flushMetrics returns
    // rather than the sink re-reading module state.
    expect(sent.counters['handler.invoke.action=ping']).toBe(1);
    expect(sent.gauges['admission.inflight']).toBe(2);
    spy.mockRestore();
  });

  it('sends nothing when the invocation recorded nothing', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');

    const ctx: LogContext = { requestId: 'r4' };
    await runWithContext(ctx, async () => {
      const flushed = flushMetrics(); // null — nothing recorded
      if (flushed) ctx.flushedMetrics = flushed;
      await exportMetrics(ctx.flushedMetrics ?? null);
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
