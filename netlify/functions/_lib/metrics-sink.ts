/**
 * metrics-sink.ts — ship the flushed metrics payload to an external receiver
 * (Phase C item 11)
 *
 * WHY THIS EXISTS
 * ---------------
 * §7.1 of the architecture doc names the gap precisely: the signals were already
 * being collected and then dropped into a log stream nobody watches. Counters,
 * histograms and gauges were computed per invocation, serialized as one
 * `metrics.flush` log line, and forgotten. §7.4 item 1 is "ship metrics to an
 * external sink. Without this, every item below is decoration."
 *
 * This module is that sink.
 *
 * ── WHY A WEBHOOK AND NOT AN APM SDK ────────────────────────────────────────
 * Owner-selected 2026-09-11. A third-party APM was rejected for the reason §12
 * gives for most additions: the cost must be justified by a failure it prevents.
 * An APM means another account, another secret, another vendor in the request
 * path, and another quota to exhaust. The existing signals are good enough to
 * page on; what they lacked was a destination. A `POST` to a URL you control has
 * none of those costs.
 *
 * ── THE THREE RULES THIS MUST NOT BREAK ─────────────────────────────────────
 *   1. ABSENT ⇒ NO-OP. With no METRICS_SINK_URL this module does nothing at
 *      all. A missing sink must never be able to fail a request.
 *   2. NEVER THROW INTO THE CALLER. Every failure path is caught and logged.
 *      The caller is a `finally` block that has already produced a response.
 *   3. NEVER DELAY THE RESPONSE. The export is never awaited by the request
 *      wrapper, and it skips entirely when the request deadline is nearly spent.
 *      The response object is already built by then.
 *
 * ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
 * It does not aggregate, alert, or retain. That is the receiver's job, and it is
 * deliberately out of scope here — see docs/PHASE_C_OBSERVABILITY.md §4.3.
 */

import { log } from './kernel/log';
import { remainingMs } from './kernel/deadline';
import type { MetricsPayload } from './kernel/metrics';

export type { MetricsPayload };

/**
 * How long the export may take.
 *
 * Short on purpose. This is a monitoring side-channel: a slow receiver must be
 * dropped, not waited for. The value also has to stay well under the request
 * deadline's tail so the "don't start what you can't finish" guard below is not
 * doing all the work.
 */
const SINK_TIMEOUT_MS = 2_000;

/**
 * Don't start an export this close to the deadline.
 *
 * A fire-and-forget call still holds a socket and a microtask chain. If the
 * request is already out of time, opening one to report that the request is out
 * of time is pure overhead — and on Netlify the instance is about to be frozen
 * anyway, so the export would be cut off mid-flight and produce a truncated
 * payload at the receiver.
 */
const MIN_REMAINING_MS = 500;

let warnedUnconfigured = false;

/** The configured receiver URL, or '' when the sink is disabled. */
function sinkUrl(): string {
  return (process.env.METRICS_SINK_URL || '').trim();
}

/** Bearer token for the receiver, optional — some receivers need none. */
function sinkToken(): string {
  return (process.env.METRICS_SINK_TOKEN || '').trim();
}

/**
 * Ship one invocation's metrics payload.
 *
 * Returns a promise that RESOLVES (never rejects) so a caller may `await` it in
 * a test or `void` it in production. Awaiting in a request path is the thing
 * rule 3 forbids — but making the function itself awaitable is what allows the
 * behaviour to be tested at all.
 */
export async function exportMetrics(payload: MetricsPayload | null): Promise<void> {
  const url = sinkUrl();

  if (!url) {
    // Rule 1. Logged exactly once per process: a per-invocation warning would
    // make an intentionally-unconfigured sink look like a malfunction and
    // flood the log stream it is supposed to feed.
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      log.info('metrics.sink.disabled', {
        reason: 'METRICS_SINK_URL not set — metrics are logged only',
      });
    }
    return;
  }

  if (!payload) return;

  // Rule 3, second guard: don't open a socket we cannot finish.
  if (remainingMs() <= MIN_REMAINING_MS) {
    log.debug('metrics.sink.skipped', { reason: 'deadline', remainingMs: Math.round(remainingMs()) });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SINK_TIMEOUT_MS);
  const startedAt = Date.now();
  const token = sinkToken();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header at all when no token is configured, rather
        // than an empty bearer — an empty bearer is a malformed credential and
        // some receivers 401 on it.
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      // The payload goes through unchanged. There is no second serializer:
      // flushMetrics() returns exactly the object it logged, so the sink and
      // the log line cannot drift.
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Rule 2: a failed export is a warn, never a throw. The response the user
      // received is already correct and unrelated.
      log.warn('metrics.sink.rejected', {
        status: res.status,
        durationMs: Date.now() - startedAt,
      });
      return;
    }
    log.debug('metrics.sink.sent', { durationMs: Date.now() - startedAt });
  } catch (e) {
    // Timeout or network failure. Covers AbortError explicitly because that is
    // the expected outcome of a slow receiver, not an anomaly.
    const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
    log.warn('metrics.sink.failed', {
      reason: aborted ? 'timeout' : 'network',
      durationMs: Date.now() - startedAt,
      err: String((e as Error)?.message ?? e).slice(0, 160),
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ship a bare liveness signal for a cron run.
 *
 * `sweep-queue` never goes through the request wrappers, so without this the
 * one component whose liveness you most want to confirm (if the sweep stops, the
 * queue silently fills) would export nothing at all. Counters here are named
 * with the same `sweep.*` prefix the structured logs already use, so a receiver
 * can key on one convention for both.
 */
export function sweepMetrics(fields: {
  processed: number;
  failed: number;
  cleaned: number;
  durationMs: number;
}): MetricsPayload {
  return {
    counters: {
      'sweep.processed': fields.processed,
      'sweep.failed': fields.failed,
      'sweep.cleaned': fields.cleaned,
    },
    histograms: {},
    gauges: { 'sweep.duration_ms': fields.durationMs },
  };
}
