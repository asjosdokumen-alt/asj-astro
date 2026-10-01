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
  const key = metricKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

/**
 * Build the metric key for a name + labels.
 *
 * ONE source for counters AND histograms. They used to differ: `increment`
 * appended labels into the key, while `metricsSnapshot` grouped histograms by
 * NAME ALONE and discarded the labels. So the keys that are actually
 * DOCUMENTED never appeared in the payload —
 * `handler.latency.action=getAppData` (`docs/PHASE_C_SINK_SETUP.md:29`, and the
 * shape `otlp.test.ts` converts) and `dependency.call.latency{dep}`
 * (`metrics-receiver.ts:30`) — even though every caller passes those labels.
 * Two formatters for one convention is how they drifted; hence one function.
 */
function metricKey(name: string, labels?: Record<string, string>): string {
  if (!labels) return name;
  const parts = Object.entries(labels).map(([k, v]) => `${k}=${v}`);
  return parts.length ? name + '.' + parts.join('.') : name;
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
 * Record a duration that was ALREADY measured.
 *
 * `histogram()` STARTS a timer and only records when the returned stop function
 * is called. `recordDependencyCall()` already receives `durationMs`, so calling
 * `histogram()` there started a second timer, threw the stop function away, and
 * therefore recorded **no sample at all** — while `durationMs` survived only in
 * the log line. Any caller that already knows the duration needs this, not
 * `histogram()`.
 */
export function observe(name: string, durationMs: number, labels?: Record<string, string>): void {
  histograms.push({ name, durationMs: Math.round(durationMs), labels });
}

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
  return () => observe(name, performance.now() - start, labels);
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
 * The shape of one flush payload.
 *
 * Named and exported because three places need to agree on it: the flusher that
 * produces it, the request context that carries it to the sink, and the sink
 * itself. It lives HERE rather than in metrics-sink.ts so that kernel/log.ts can
 * type the context field without importing the sink — the sink imports log, and
 * a reverse import would be a cycle.
 */
export interface MetricsPayload {
  counters: Record<string, number>;
  histograms: Record<string, { count: number; avg: number; p50: number; p95: number; max: number }>;
  gauges: Record<string, number>;
}

/**
 * Build the flush payload WITHOUT clearing state.
 *
 * Extracted so the health endpoint (Phase C item 12) can read the same shape
 * the sink receives, and so flushMetrics() has exactly one serialization path.
 * Two independent formatters would drift, and the health view would then stop
 * describing what is actually shipped.
 */
export function metricsSnapshot(): MetricsPayload {
  const counterObj: Record<string, number> = {};
  for (const [k, v] of counters) counterObj[k] = v;

  const histogramObj: Record<string, { count: number; avg: number; p50: number; p95: number; max: number }> = {};
  const byName = new Map<string, number[]>();
  for (const h of histograms) {
    // Label ikut masuk kunci — konvensi yang sama dengan `increment`. Tanpa ini
    // `dependency.call.latency{dep}` dan `handler.latency{action}` mustahil
    // dibedakan, padahal keduanya didokumentasikan sebagai per-dependency /
    // per-aksi.
    const key = metricKey(h.name, h.labels);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(h.durationMs);
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
 *
 * THE SINK IS NOT CALLED FROM HERE
 * --------------------------------
 * §7.4 item 1 says to ship this payload to an external sink, and the obvious
 * place would be right here. It is deliberately NOT done here, for two reasons:
 *
 *   1. ORDER. This runs in the dispatcher's `finally`, after the response is
 *      determined. An `await` here would delay the response for a metric —
 *      exactly backwards. The sink export is fired from the request wrapper
 *      AFTER the response object exists, so a slow sink cannot add latency to
 *      a user-visible request.
 *   2. COUPLING. Every entry point imports metrics.ts; only the wrappers need
 *      to know a sink exists. Keeping the network call out of the kernel's
 *      hottest module also keeps this file dependency-free, which is what makes
 *      it safe to import from anywhere.
 *
 * See _lib/metrics-sink.ts for the exporter.
 */
export function flushMetrics(): MetricsPayload | null {
  if (metricsEmpty()) return null;

  const payload = metricsSnapshot();

  // Spread into a fresh literal rather than passing `payload` directly: the
  // logger's field parameter is an index-signature record, and a named interface
  // has no implicit index signature. Spreading is also the clearer intent here —
  // the payload's three keys are being emitted as top-level log fields, not
  // nested under a `payload` key.
  log.info('metrics.flush', { ...payload });

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
  // `observe`, BUKAN `histogram`: durasinya sudah diukur pemanggil dan
  // diserahkan ke sini. `histogram()` memulai timer BARU dan hanya mencatat
  // kalau stop-nya dipanggil — stop itu dulu dibuang, sehingga
  // `dependency.call.latency` tidak pernah menerima satu sampel pun dan tidak
  // ada dependency yang punya p50/p95.
  observe('dependency.call.latency', durationMs, { dep });

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
  observe,
  gauge,
  flushMetrics,
  metricsSnapshot,
  metricsEmpty,
  recordDependencyCall,
  recordHandlerStart,
  recordError,
  recordRateLimit,
};
