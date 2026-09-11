/**
 * kernel/metrics.ts — Counters and histograms per invocation
 *
 * §10.2: The four signals per surface — latency, traffic, errors, saturation.
 *
 * Metrics are collected in-process during a single invocation and flushed
 * at the end (after the response is sent). This avoids network overhead
 * on every metric point while still giving per-invocation granularity.
 *
 * Usage:
 *   import { metrics } from './kernel/metrics';
 *   metrics.increment('db.query', { table: 'candidates' });
 *   const end = metrics.histogram('db.query.latency');
 *   // ... do work ...
 *   end(); // records duration
 *
 * At flush time, metrics are logged as structured JSON via kernel/log.ts
 * and optionally written to the dependency_calls table.
 */

import { log } from './log';

// ── Counters ─────────────────────────────────────────────────────────────────
// Monotonically increasing counts, tagged by labels.

const counters = new Map<string, number>();

/**
 * Increment a named counter. Creates it if it doesn't exist.
 * Labels are appended as `.key=value` to the counter name for structured logging.
 */
export function increment(name: string, labels?: Record<string, string>): void {
  const key = labels ? name + '.' + Object.entries(labels).map(([k, v]) => `${k}=${v}`).join('.') : name;
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

// ── Histograms ───────────────────────────────────────────────────────────────
// Duration measurements for latency tracking.

interface HistogramEntry {
  name: string;
  durationMs: number;
  labels?: Record<string, string>;
}

const histograms: HistogramEntry[] = [];

/**
 * Start a histogram timer. Returns a stop function that records the duration.
 *
 * @example
 *   const stop = metrics.histogram('handler.latency', { action: 'ping' });
 *   await handleRequest();
 *   stop(); // records elapsed time
 */
export function histogram(name: string, labels?: Record<string, string>): () => void {
  const start = performance.now();
  return () => {
    const durationMs = Math.round(performance.now() - start);
    histograms.push({ name, durationMs, labels });
  };
}

// ── Gauges ───────────────────────────────────────────────────────────────────
// Point-in-time values (e.g., in-flight request count, queue depth).

const gauges = new Map<string, number>();

/**
 * Set a gauge to a specific value.
 */
export function gauge(name: string, value: number, labels?: Record<string, string>): void {
  const key = labels ? name + '.' + Object.entries(labels).map(([k, v]) => `${k}=${v}`).join('.') : name;
  gauges.set(key, value);
}

// ── Flush ────────────────────────────────────────────────────────────────────

/**
 * Build the flush payload WITHOUT clearing state.
 *
 * Extracted so the health endpoint (Phase C item 12) can read the same shape
 * the sink receives, and so flushMetrics() has exactly one serialization path.
 * Two independent formatters would drift, and the health view would then stop
 * describing what is actually shipped.
 */
export function metricsSnapshot(): {
  counters: Record<string, number>;
  histograms: Record<string, { count: number; avg: number; p50: number; p95: number; max: number }>;
  gauges: Record<string, number>;
} {
  const counterObj: Record<string, number> = {};
  for (const [k, v] of counters) counterObj[k] = v;

  const histogramObj: Record<string, { count: number; avg: number; p50: number; p95: number; max: number }> = {};
  const byName = new Map<string, number[]>();
  for (const h of histograms) {
    if (!byName.has(h.name)) byName.set(h.name, []);
    byName.get(h.name)!.push(h.durationMs);
  }
  for (const [name, durations] of byName) {
    durations.sort((a, b) => a - b);
    const count = durations.length;
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / count);
    const p50 = durations[Math.floor(count * 0.5)];
    const p95 = durations[Math.floor(count * 0.95)];
    const max = durations[count - 1];
    histogramObj[name] = { count, avg, p50, p95, max };
  }

  const gaugeObj: Record<string, number> = {};
  for (const [k, v] of gauges) gaugeObj[k] = v;

  return { counters: counterObj, histograms: histogramObj, gauges: gaugeObj };
}

/** True when nothing has been recorded in this invocation (flush would no-op). */
export function metricsEmpty(): boolean {
  return counters.size === 0 && histograms.length === 0 && gauges.size === 0;
}

/**
 * Flush all collected metrics as a structured log line.
 * Called once at the end of each invocation (by the dispatcher).
 *
 * Returns the flushed payload (or null when there was nothing to report) so the
 * caller can forward it to the external sink without re-serializing. Returning
 * it rather than re-reading module state matters: this function CLEARS the
 * collections, so a caller that tried to read afterwards would see nothing.
 */
export function flushMetrics(): {
  counters: Record<string, number>;
  histograms: Record<string, { count: number; avg: number; p50: number; p95: number; max: number }>;
  gauges: Record<string, number>;
} | null {
  if (metricsEmpty()) return null;

  const payload = metricsSnapshot();

  log.info('metrics.flush', payload);

  // Clear for next invocation
  counters.clear();
  histograms.length = 0;
  gauges.clear();

  return payload;
}

// ── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Record a dependency call (external HTTP, DB, etc.) with timing and outcome.
 * This feeds both the metrics system and the dependency_calls table.
 */
export function recordDependencyCall(
  dep: string,
  action: string,
  budgetMs: number,
  durationMs: number,
  outcome: 'success' | 'error' | 'timeout',
  attempts: number = 1,
  breakerState: string = 'closed',
): void {
  increment('dependency.call', { dep, outcome });
  histogram('dependency.call.latency', { dep });

  // Also log to dependency_calls table via structured log
  log.info('dependency.call', {
    dep,
    action,
    budget_ms: budgetMs,
    duration_ms: durationMs,
    outcome,
    attempts,
    breaker_state: breakerState,
  });
}

/**
 * Record a handler invocation with timing.
 */
export function recordHandlerStart(action: string): () => void {
  increment('handler.invoke', { action });
  return histogram('handler.latency', { action });
}

/**
 * Record an error.
 */
export function recordError(action: string, errorCode: string): void {
  increment('handler.error', { action, code: errorCode });
}

/**
 * Record rate limit hit.
 */
export function recordRateLimit(action: string, key: string): void {
  increment('rate_limit.hit', { action, key });
}

export const metrics = {
  increment,
  histogram,
  gauge,
  flushMetrics,
  metricsSnapshot,
  metricsEmpty,
  recordDependencyCall,
  recordHandlerStart,
  recordError,
  recordRateLimit,
};
