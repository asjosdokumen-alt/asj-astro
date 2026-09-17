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
 * ── ADDED 2026-09-13: AN OTLP EXPORT TO GRAFANA CLOUD ───────────────────────
 * The owner later supplied Grafana Cloud credentials, which answers a different
 * question than the one above. The webhook was chosen to satisfy the §6 gate
 * with no third party; a webhook cannot, however, hold history, evaluate a rule
 * over a window, or draw a graph — and "the cost must be justified by a failure
 * it prevents" is satisfied here by A1–A7, which cannot fire at all without a
 * backend that remembers.
 *
 * So the two coexist as INDEPENDENT destinations, and neither is required:
 * `METRICS_SINK_URL` keeps the repo's own payload contract, and
 * `GRAFANA_CLOUD_OTLP_ENDPOINT` adds an OTLP one. The three rules above are
 * unchanged and apply to both — in particular the export still cannot delay a
 * response, because the wrappers `void` it after the response object exists.
 *
 * ── THE THREE RULES THIS MUST NOT BREAK ─────────────────────────────────────
 *   1. ABSENT ⇒ NO-OP. With neither destination configured this module does
 *      nothing at all. A missing sink must never be able to fail a request.
 *      (Only ONE of the two has to be set for an export to happen; the rule is
 *      about "nothing configured", not about `METRICS_SINK_URL` specifically.)
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
import { otlpEndpointProblem, otlpMetricsUrl, otlpPlaceholderWarning, toOtlpMetrics } from './otlp';

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
 * Grafana Cloud's OTLP gateway base URL, or '' when the OTLP export is off.
 *
 * A SECOND, INDEPENDENT DESTINATION — not a replacement
 * -----------------------------------------------------
 * `METRICS_SINK_URL` sends the repo's own payload to a receiver you control
 * (`netlify/functions/metrics-receiver.ts`, or a Discord webhook). Grafana Cloud
 * speaks OTLP and nothing else, so it needs its own exporter and its own config.
 * Both may be set at once: the custom sink is what satisfies the §6 gate locally
 * today, and OTLP is what makes the signals visible over time. Either alone is a
 * valid configuration, and neither may be able to break a request.
 */
function otlpEndpoint(): string {
  return (process.env.GRAFANA_CLOUD_OTLP_ENDPOINT || '').trim();
}

/**
 * The `Authorization` header for the OTLP gateway, verbatim.
 *
 * Grafana Cloud issues this as a pre-built `Basic <base64(instanceID:token)>`
 * header, so it is forwarded as-is rather than re-assembled from an id and a
 * token — one fewer place for the two halves to disagree.
 */
function otlpAuthHeader(): string {
  return (process.env.GRAFANA_CLOUD_BASIC_AUTH_HEADER || '').trim();
}

/** `deployment.environment` for the OTLP resource. Netlify sets `CONTEXT`. */
function deploymentEnvironment(): string {
  return (process.env.CONTEXT || '').trim();
}

/**
 * Warn at most once per process per event.
 *
 * A per-invocation warning would make a deliberate configuration choice look
 * like a malfunction, and would flood the very log stream the sink feeds. Same
 * reasoning as `warnedUnconfigured` below.
 */
const warned = new Set<string>();
function warnOnce(event: string, detail: Record<string, unknown>): void {
  if (warned.has(event)) return;
  warned.add(event);
  log.warn(event, detail);
}

/**
 * The one raw `fetch()` in this file, and the only one the I/O boundary gate
 * allow-lists here (`scripts/ci/io-boundary.mjs`). Both destinations go through
 * it so that allow-list does not have to grow: it is documented as a set that
 * "may only shrink", and adding a second call site to send the same metrics
 * somewhere else would not survive that rule's intent.
 *
 * Never throws (rule 2) and never outlives SINK_TIMEOUT_MS. `name` is the log
 * event prefix, so each destination reports under its own name.
 */
async function postJson(
  url: string,
  name: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SINK_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      // The payload goes through unchanged. There is no second serializer:
      // flushMetrics() returns exactly the object it logged, so the sink and
      // the log line cannot drift. The OTLP body is likewise built once, in
      // otlp.ts, from that same object.
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Rule 2: a failed export is a warn, never a throw. The response the user
      // received is already correct and unrelated.
      log.warn(name + '.rejected', {
        status: res.status,
        durationMs: Date.now() - startedAt,
      });
      return;
    }
    log.debug(name + '.sent', { durationMs: Date.now() - startedAt });
  } catch (e) {
    // Timeout or network failure. Covers AbortError explicitly because that is
    // the expected outcome of a slow receiver, not an anomaly.
    const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
    log.warn(name + '.failed', {
      reason: aborted ? 'timeout' : 'network',
      durationMs: Date.now() - startedAt,
      err: String((e as Error)?.message ?? e).slice(0, 160),
    });
  } finally {
    clearTimeout(timer);
  }
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
  const otlp = otlpEndpoint();

  if (!url && !otlp) {
    // Rule 1. Logged exactly once per process: a per-invocation warning would
    // make an intentionally-unconfigured sink look like a malfunction and
    // flood the log stream it is supposed to feed.
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      log.info('metrics.sink.disabled', {
        reason: 'neither METRICS_SINK_URL nor GRAFANA_CLOUD_OTLP_ENDPOINT is set — metrics are logged only',
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

  // Both destinations are fired together rather than in sequence: they are
  // independent, the caller does not await either, and running them serially
  // would hold the instance for the SUM of two timeouts instead of the max.
  const jobs: Promise<void>[] = [];

  if (url) {
    const token = sinkToken();
    jobs.push(
      postJson(
        url,
        'metrics.sink',
        {
          'Content-Type': 'application/json',
          // No Authorization header at all when no token is configured, rather
          // than an empty bearer — an empty bearer is a malformed credential and
          // some receivers 401 on it.
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        payload,
      ),
    );
  }

  if (otlp) {
    const header = otlpAuthHeader();
    // Checked before sending, because a placeholder pasted verbatim produces a
    // 401 that is indistinguishable from a revoked key. Naming it here turns a
    // silent misconfiguration into a sentence.
    //
    // The endpoint gets the same treatment for the mirror-image reason: a
    // malformed URL throws inside fetch() and logs nothing at all, so a bad
    // endpoint is quieter than a bad credential — and therefore more likely to
    // be discovered as "the dashboard is empty" weeks later.
    const problem = otlpPlaceholderWarning(header) ?? otlpEndpointProblem(otlp);
    if (problem) {
      warnOnce('metrics.otlp.misconfigured', { reason: problem });
    } else {
      const { body, droppedLabels } = toOtlpMetrics(payload, {
        environment: deploymentEnvironment(),
      });
      // The cardinality guard in otlp.ts drops labels it cannot bound. Dropping
      // is correct, but it must not be invisible — that is how a silently
      // missing dimension gets discovered during an incident instead of now.
      if (droppedLabels.length) {
        warnOnce('metrics.otlp.labels_dropped', {
          labels: droppedLabels,
          reason: 'not in the shipped allow-list — see _lib/otlp.ts',
        });
      }
      jobs.push(
        postJson(
          otlpMetricsUrl(otlp),
          'metrics.otlp',
          { 'Content-Type': 'application/json', Authorization: header },
          body,
        ),
      );
    }
  }

  await Promise.all(jobs);
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
