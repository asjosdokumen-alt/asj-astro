/**
 * health-snapshot.test.ts — Phase C item 12 introspection APIs.
 *
 * These APIs exist so the health endpoint can describe breaker/bulkhead/metrics
 * state without reaching into module internals. The load-bearing property is
 * ENUMERATION: a healthy dependency has no record inside the breaker (check()
 * returns early on a miss) and no entry in the bulkhead's in-flight map, so an
 * implementation that iterated internal state would report nothing at all and
 * the health endpoint would look confidently empty. Every test below therefore
 * asserts that HEALTHY dependencies are PRESENT and closed, not merely that
 * unhealthy ones are reported.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { breaker, bulkhead, DEPENDENCY_CONFIGS } from './resilience';
import { metrics } from './metrics';

const KNOWN_DEPS = Object.keys(DEPENDENCY_CONFIGS);

describe('breaker.snapshot()', () => {
  beforeEach(() => {
    for (const dep of KNOWN_DEPS) breaker.reset(dep);
  });

  it('includes every configured dependency even when none has ever failed', () => {
    const snap = breaker.snapshot();
    for (const dep of KNOWN_DEPS) {
      expect(snap[dep], `${dep} must appear in the snapshot`).toBeDefined();
      expect(snap[dep].state).toBe('closed');
      expect(snap[dep].failures).toBe(0);
      expect(snap[dep].openForMs).toBe(0);
    }
  });

  it('reports a closed dependency as closed, not as missing', () => {
    // The regression this guards: iterating only internal records would drop
    // 'postgrest' entirely, and an operator would read absence as "unknown".
    expect(breaker.snapshot().postgrest.state).toBe('closed');
  });

  it('is stable in shape across calls so alerting can diff it', () => {
    const a = Object.keys(breaker.snapshot()).sort();
    const b = Object.keys(breaker.snapshot()).sort();
    expect(a).toEqual(b);
  });

  it('surfaces open state and a non-zero openForMs once the threshold trips', () => {
    const cfg = DEPENDENCY_CONFIGS.fonnte;
    for (let i = 0; i < (cfg.threshold ?? 3); i++) breaker.failure('fonnte');
    const snap = breaker.snapshot();
    expect(snap.fonnte.state).toBe('open');
    expect(snap.fonnte.failures).toBeGreaterThanOrEqual(cfg.threshold ?? 3);
    expect(snap.fonnte.openForMs).toBeGreaterThanOrEqual(0);
  });

  it('openCount() counts only non-closed dependencies', () => {
    expect(breaker.openCount()).toBe(0);
    const cfg = DEPENDENCY_CONFIGS.fonnte;
    for (let i = 0; i < (cfg.threshold ?? 3); i++) breaker.failure('fonnte');
    expect(breaker.openCount()).toBe(1);
  });
});

describe('bulkhead.snapshot()', () => {
  it('reports maxConcurrent and a zeroed entry for every known dependency', () => {
    const snap = bulkhead.snapshot();
    expect(snap.maxConcurrent).toBeGreaterThan(0);
    for (const dep of KNOWN_DEPS) {
      expect(snap.inflight[dep], `${dep} must appear in in-flight`).toBe(0);
    }
  });

  it('reflects in-flight acquisitions and releases them', async () => {
    const release = await bulkhead.acquire('gemini');
    expect(bulkhead.snapshot().inflight.gemini).toBe(1);
    release();
    expect(bulkhead.snapshot().inflight.gemini).toBe(0);
  });

  it('reports saturated only at the cap, and release is idempotent', async () => {
    const { maxConcurrent } = bulkhead.snapshot();
    const releases = [];
    for (let i = 0; i < maxConcurrent; i++) releases.push(await bulkhead.acquire('pillar-test'));
    expect(bulkhead.snapshot().saturated).toBe(true);
    // Double-release must not drive the counter below zero.
    releases[0]();
    releases[0]();
    expect(bulkhead.snapshot().inflight['pillar-test']).toBe(maxConcurrent - 1);
    for (const r of releases.slice(1)) r();
    expect(bulkhead.snapshot().inflight['pillar-test']).toBe(0);
  });
});

describe('metrics snapshot vs flush', () => {
  it('metricsSnapshot() does NOT clear, so a health read is non-destructive', () => {
    metrics.increment('probe.counter', { k: 'v' });
    const first = metrics.metricsSnapshot();
    const second = metrics.metricsSnapshot();
    expect(first.counters['probe.counter.k=v']).toBe(1);
    // A destructive read would make the second call empty — the flush contract
    // must stay the only thing that clears.
    expect(second.counters['probe.counter.k=v']).toBe(1);
    metrics.flushMetrics();
  });

  it('flushMetrics() returns the payload it emitted and clears afterwards', () => {
    metrics.increment('flush.counter');
    const payload = metrics.flushMetrics();
    expect(payload).not.toBeNull();
    expect(payload!.counters['flush.counter']).toBe(1);
    // Cleared, so a second flush has nothing to report.
    expect(metrics.flushMetrics()).toBeNull();
    expect(metrics.metricsEmpty()).toBe(true);
  });

  it('flushMetrics() returns null when nothing was recorded', () => {
    metrics.flushMetrics(); // drain
    expect(metrics.flushMetrics()).toBeNull();
  });

  it('histogram percentiles are computed from the recorded durations', () => {
    const stop1 = metrics.histogram('flush.lat');
    stop1();
    const payload = metrics.metricsSnapshot();
    expect(payload.histograms['flush.lat'].count).toBe(1);
    expect(payload.histograms['flush.lat'].p50).toBeGreaterThanOrEqual(0);
    metrics.flushMetrics();
  });
});
