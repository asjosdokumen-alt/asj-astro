/**
 * otlp.ts — translate one flushed MetricsPayload into OTLP/HTTP metrics JSON
 *
 * WHY THIS EXISTS
 * ---------------
 * `_lib/metrics-sink.ts` posts the payload to a URL you control, in the repo's
 * own shape. That contract works for a receiver you write (see
 * `netlify/functions/metrics-receiver.ts`), but it does NOT work for a
 * third-party backend: Grafana Cloud's OTLP gateway wants OTLP, not our JSON.
 *
 * So this module is the adapter, and it is deliberately PURE — no env reads, no
 * `fetch`, no logging. All of that stays in the sink, which owns the single
 * sanctioned raw-`fetch` call site (`scripts/ci/io-boundary.mjs` allow-lists
 * exactly one call there and the list "may only shrink"). Keeping the
 * translation pure also means it is tested by calling it, with no stubbing.
 *
 * ── WHY METRICS AND NOT LOGS ────────────────────────────────────────────────
 * OTLP can carry this payload as logs (one record per flush) or as metrics. It
 * is sent as METRICS because that is what the Phase C gate needs: §6 requires
 * "an injected PostgREST failure produces an alert within 2 minutes", and the
 * alert rules A1–A7 are threshold rules over windows. A metrics backend
 * evaluates those natively; a log store needs LogQL to fake them. Volume also
 * favours metrics — one data point per flush aggregates server-side, where one
 * log line per flush is retained as-is.
 *
 * ── MEASURED 2026-09-13: THE GATEWAY REJECTS DELTA ──────────────────────────
 * The first version of this module shipped every counter as a `sum` with DELTA
 * temporality, on the reasoning that `flushMetrics()` clears its maps each
 * invocation so each payload IS one interval. That reasoning is sound OTLP and
 * was still WRONG here, because the receiving gateway does not accept it:
 *
 *   POST …/otlp/v1/metrics  (delta sum)  -> 400
 *     "otlp parse error: invalid temporality and type combination"
 *   POST …/otlp/v1/metrics  (cumulative) -> 200
 *   POST …/otlp/v1/metrics  (gauge)      -> 200
 *
 * All four delta/cumulative x monotonic combinations were probed; only the two
 * cumulative ones and gauges are accepted. A gauge-only smoke test passed and
 * hid this for a while — which is the lesson: test the ACTUAL payload, not a
 * convenient one.
 *
 * ── WHY COUNTS SHIP AS GAUGES, NOT CUMULATIVE SUMS ──────────────────────────
 * Cumulative is accepted, so it is tempting. It is still the wrong shape for
 * this data, and the reason is worth writing down because "use a counter" is
 * the reflex answer:
 *
 * Our counters are per-invocation and cannot be made cumulative — the producer
 * is an ephemeral function instance with no memory between invocations, so the
 * only honest value it can report is "N events happened in this invocation".
 * Sending that as a CUMULATIVE sum makes the backend see a counter that resets
 * on every sample. Prometheus tolerates resets, but a reset contributes only
 * the NEW value, so interleaved instances under-count. Worked example, five
 * consecutive samples 3, 1, 5, 2, 4 from a shared series:
 *
 *   observed increase = 3->1(reset,+1) +1->5(+4) +5->2(reset,+2) +2->4(+2) = 9
 *   actual events                                                          = 15
 *
 * A gauge carrying the same numbers gives the exact answer under
 * `sum_over_time()`, because summing the sample values over a window IS the
 * total for that window. So:
 *
 *   counters  -> gauge;  query with `sum_over_time(handler_error[5m])`
 *   NOT `rate()` — a gauge is not a counter and rate() over one is meaningless.
 *
 * That is the one place this adapter asks the reader to write a different query
 * than habit suggests, so it is stated in the setup doc as well.
 *
 * ── THE CARDINALITY GUARD (read this before adding a label) ─────────────────
 * The kernel appends labels into the metric KEY as `.key=value`
 * (`kernel/metrics.ts` `increment()`). Shipping every one of those as a
 * Prometheus label is how a metrics bill explodes, and the kernel already emits
 * one that is unbounded:
 *
 *   recordRateLimit(action, key)  →  rate_limit.hit.action=…​.key=<client id>
 *
 * `key` is a caller-supplied identifier. As a label it has no upper bound, so
 * it would create one time series per distinct caller, forever. `SHIPPED_LABELS`
 * is therefore an ALLOW-LIST, not a deny-list: a label that is not named here is
 * dropped rather than forwarded. A deny-list would make the safe answer depend
 * on someone remembering to update it, and the failure mode of forgetting is
 * silent and expensive — the exact shape of bug this repo keeps finding.
 *
 * Dropping is not silent, though: `toOtlpMetrics()` reports what it dropped so
 * the caller can log it once. See `droppedLabels`.
 */

import type { MetricsPayload } from './kernel/metrics';

/**
 * Label keys that may become Prometheus labels. Every one of these is bounded by
 * construction: the set of actions, the set of kernel dependencies, the three
 * outcomes, and the error-code vocabulary. Anything else is dropped.
 */
const SHIPPED_LABELS = new Set(['action', 'dep', 'outcome', 'code']);

export interface OtlpConversion {
  /** The OTLP/HTTP JSON body, ready to `JSON.stringify`. */
  body: unknown;
  /** Label keys seen in the payload but NOT shipped — for one warning, not per sample. */
  droppedLabels: string[];
}

export interface OtlpOptions {
  /** Flush time, epoch ms. Injected so tests are deterministic. */
  nowMs?: number;
  serviceName?: string;
  environment?: string;
}

/** A metric name that survives the trip into a Prometheus-compatible store. */
function metricName(raw: string): string {
  // Prometheus allows [a-zA-Z_:][a-zA-Z0-9_:]*. OTel collectors sanitize dots to
  // underscores on ingest, so doing it here means the series name is predictable
  // from this file instead of depending on the receiver's rules. It is
  // idempotent, so a backend that sanitizes again changes nothing.
  const s = raw.replace(/[^a-zA-Z0-9_:]/g, '_');
  return /^[a-zA-Z_:]/.test(s) ? s : '_' + s;
}

/** A label name that is legal in Prometheus. */
function labelName(raw: string): string {
  const s = raw.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_]/.test(s) ? s : '_' + s;
}

/**
 * Split a kernel metric key into its base name and its labels.
 *
 * The kernel builds `name` + `.key=value` for each label, joined by `.`. The
 * base name itself contains dots (`handler.invoke`), so the split point is the
 * first `.segment=` boundary, not the first dot.
 *
 * Splitting the label region is done with a lookahead rather than a plain
 * `split('.')` because a label VALUE may legally contain dots (a hashed client
 * id, an IP). `rate_limit.hit.key=1.2.3.4` must not become three labels.
 */
export function parseMetricKey(key: string): { name: string; labels: Record<string, string> } {
  const segments = key.split('.');
  const firstLabel = segments.findIndex((s) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(s));
  if (firstLabel === -1) return { name: key, labels: {} };

  const name = segments.slice(0, firstLabel).join('.');
  const labelRegion = segments.slice(firstLabel).join('.');
  const labels: Record<string, string> = {};
  for (const pair of labelRegion.split(/\.(?=[A-Za-z_][A-Za-z0-9_]*=)/)) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    labels[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return { name, labels };
}

/** OTLP timestamps are int64 nanoseconds, encoded as a STRING in proto3 JSON. */
function toUnixNano(ms: number): string {
  // BigInt, so the conversion is exact BY CONSTRUCTION rather than by luck.
  //
  // Measured 2026-09-13, because the first draft of this comment asserted the
  // opposite and was wrong: `String(ms * 1e6)` — the obvious form — is in fact
  // string-identical to the exact value for every epoch-ms this system will see.
  // The exact product stays a multiple of the double's spacing (256 ns at
  // 1.7e18), so the rounding never lands on a different decimal — a scan of
  // every ms in [1.76e12, 1.76e12 + 4000) found zero divergences, and none
  // appears before roughly the year 2049. So the naive form is NOT a live bug.
  //
  // It is still not worth depending on: the property expires on a date nobody
  // will remember, it fails silently, and no test on a realistic clock can see
  // it. Exactness costs one BigInt.
  return (BigInt(Math.round(ms)) * 1_000_000n).toString();
}

interface Attribute {
  key: string;
  value: { stringValue: string };
}

function attributes(labels: Record<string, string>): Attribute[] {
  return Object.keys(labels)
    .sort()
    .map((k) => ({ key: labelName(k), value: { stringValue: labels[k] } }));
}

/**
 * Convert one flushed payload into an OTLP/HTTP metrics request body.
 *
 * Mapping, and why each choice. Read the header section first: DELTA is rejected
 * by the gateway, and cumulative would under-count, so counts are gauges.
 *
 * | Payload            | OTLP                                     | Reason |
 * |---|---|---|
 * | `counters`         | `gauge`                                   | The kernel resets its collections every flush, so the only honest value is "N events in this invocation". A delta `sum` is the textbook shape for that and is REJECTED by the gateway (400); a cumulative `sum` is accepted but under-counts, because the backend then sees a counter resetting on every sample and a reset contributes only the new value. A gauge is exact under `sum_over_time()`. |
 * | `gauges`           | `gauge`                                   | Point-in-time values (`sweep.duration_ms`) — unchanged. |
 * | `histograms[*].count` | `gauge`                                | A count of observations in this invocation: same reasoning as `counters`. |
 * | `histograms[*].avg/p50/p95/max` | `gauge`, name suffixed `_avg`/`_p50`/`_p95`/`_max` | The payload carries pre-computed percentiles, not explicit bucket counts, so an OTLP `histogram` (which requires `bucketCounts` + `explicitBounds`) cannot represent it without inventing a distribution. A suffixed gauge is the honest shape, and it matches the Prometheus convention a Grafana user already expects (`handler_latency_p95 > 500`). |
 *
 * So every data point this adapter emits is a gauge, and the whole request is
 * accepted by the gateway. That uniformity is deliberate: it removes the one
 * thing that was silently wrong.
 */
export function toOtlpMetrics(payload: MetricsPayload, opts: OtlpOptions = {}): OtlpConversion {
  const nowMs = opts.nowMs ?? Date.now();
  const timeUnixNano = toUnixNano(nowMs);
  const dropped = new Set<string>();
  const metrics: unknown[] = [];

  for (const [key, value] of Object.entries(payload.counters)) {
    const { name, labels } = parseMetricKey(key);
    for (const k of Object.keys(labels)) if (!SHIPPED_LABELS.has(k)) dropped.add(k);
    metrics.push({
      name: metricName(name),
      unit: '1',
      gauge: {
        dataPoints: [
          { asDouble: value, timeUnixNano, attributes: attributes(pick(labels)) },
        ],
      },
    });
  }

  for (const [key, value] of Object.entries(payload.gauges)) {
    const { name, labels } = parseMetricKey(key);
    for (const k of Object.keys(labels)) if (!SHIPPED_LABELS.has(k)) dropped.add(k);
    metrics.push({
      name: metricName(name),
      unit: '1',
      gauge: {
        dataPoints: [{ asDouble: value, timeUnixNano, attributes: attributes(pick(labels)) }],
      },
    });
  }

  for (const [key, stats] of Object.entries(payload.histograms)) {
    const { name, labels } = parseMetricKey(key);
    for (const k of Object.keys(labels)) if (!SHIPPED_LABELS.has(k)) dropped.add(k);
    const attrs = attributes(pick(labels));
    const base = metricName(name);

    // count → gauge, same reasoning as `counters`: observations in THIS
    // invocation. Query it with sum_over_time(), not rate().
    metrics.push({
      name: base + '_count',
      unit: '1',
      gauge: {
        dataPoints: [{ asDouble: stats.count, timeUnixNano, attributes: attrs }],
      },
    });

    // avg/p50/p95/max → gauges. No `stat` label: the suffix carries it, which
    // keeps each percentile its own series with a stable name.
    for (const stat of ['avg', 'p50', 'p95', 'max'] as const) {
      metrics.push({
        name: base + '_' + stat,
        unit: 'ms',
        gauge: {
          dataPoints: [{ asDouble: stats[stat], timeUnixNano, attributes: attrs }],
        },
      });
    }
  }

  const body = {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: opts.serviceName || 'asj-portal' } },
            ...(opts.environment
              ? [{ key: 'deployment.environment', value: { stringValue: opts.environment } }]
              : []),
          ],
        },
        scopeMetrics: [
          {
            scope: { name: 'asj-portal.kernel', version: '1' },
            metrics,
          },
        ],
      },
    ],
  };

  return { body, droppedLabels: [...dropped].sort() };
}

/** Keep only the labels the allow-list permits. */
function pick(labels: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) if (SHIPPED_LABELS.has(k)) out[k] = v;
  return out;
}

/**
 * Build the OTLP/HTTP metrics URL from the gateway base.
 *
 * Grafana Cloud's base already ends in `/otlp`
 * (`https://otlp-gateway-prod-ap-southeast-2.grafana.net/otlp`) and the signal
 * path is appended to it. Trailing slashes are tolerated because a copy-paste
 * from a browser usually brings one.
 */
export function otlpMetricsUrl(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '') + '/v1/metrics';
}

/**
 * Detect a credential that is still the documentation placeholder.
 *
 * The owner-facing instructions hand over the header in the form
 * `Basic base64(<instanceID>:<api key>)`. Pasting that literally is the most
 * likely way to misconfigure this, and the resulting 401 looks exactly like a
 * revoked key — so it is worth naming. Returns a human reason, or null when the
 * header looks real.
 */
export function otlpPlaceholderWarning(header: string): string | null {
  const h = header.trim();
  if (!h) return 'GRAFANA_CLOUD_BASIC_AUTH_HEADER is empty';
  if (!/^Basic\s+\S+/i.test(h)) {
    return 'GRAFANA_CLOUD_BASIC_AUTH_HEADER must start with "Basic " followed by the base64 value';
  }
  if (/base64\s*\(/i.test(h)) {
    return 'the value still contains "base64(...)" — it is the placeholder, not a real credential';
  }
  return null;
}
