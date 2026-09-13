/**
 * otlp.test.ts — the OTLP translation (Phase C item 11, Grafana Cloud).
 *
 * This module is pure, so unlike the sink tests these call the code directly and
 * assert on its output. That is deliberate: the risky part of shipping metrics to
 * a third party is not the network call (the sink already owns that, and its
 * tests cover it) — it is the MAPPING. A mapping that is wrong in a plausible way
 * produces a dashboard that looks fine and answers the wrong question.
 *
 * The two mapping decisions most likely to be "corrected" into a bug later, and
 * therefore the ones pinned hardest here:
 *
 *   1. TEMPORALITY. The kernel clears its collections on every flush, so each
 *      payload is a DELTA. Marking it CUMULATIVE would make every counter appear
 *      to reset to zero on every invocation, and a rate() over that under-counts.
 *   2. CARDINALITY. Labels are an ALLOW-LIST. `rate_limit.hit` carries a
 *      caller-supplied `key`, which is unbounded; forwarding it would create one
 *      time series per distinct caller.
 */
import { describe, it, expect } from 'vitest';
import {
  otlpMetricsUrl,
  otlpPlaceholderWarning,
  parseMetricKey,
  toOtlpMetrics,
} from '../otlp';
import type { MetricsPayload } from './metrics';

const PAYLOAD: MetricsPayload = {
  counters: {
    'handler.invoke.action=getAppData': 3,
    'dependency.call.dep=postgrest.outcome=error': 1,
  },
  histograms: {
    'handler.latency.action=getAppData': { count: 3, avg: 120, p50: 110, p95: 240, max: 260 },
  },
  gauges: { 'sweep.duration_ms': 812 },
};

// A fixed clock so timestamps are assertions rather than noise.
const NOW = 1_760_000_000_000; // 2025-10-09T08:53:20Z
const NOW_NS = '1760000000000000000';

interface DataPoint {
  asInt?: string;
  asDouble?: number;
  timeUnixNano: string;
  attributes: { key: string; value: { stringValue: string } }[];
}
interface Metric {
  name: string;
  unit?: string;
  sum?: { aggregationTemporality: number; isMonotonic: boolean; dataPoints: DataPoint[] };
  gauge?: { dataPoints: DataPoint[] };
}

/** Pull the metric list out of the OTLP envelope without casting in each test. */
function metricsOf(body: unknown): Metric[] {
  const b = body as {
    resourceMetrics: { scopeMetrics: { metrics: Metric[] }[] }[];
  };
  return b.resourceMetrics[0].scopeMetrics[0].metrics;
}

function attrsOf(dp: DataPoint): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of dp.attributes) out[a.key] = a.value.stringValue;
  return out;
}

describe('parseMetricKey', () => {
  it('splits the base name from a single label', () => {
    expect(parseMetricKey('handler.invoke.action=ping')).toEqual({
      name: 'handler.invoke',
      labels: { action: 'ping' },
    });
  });

  it('keeps a dotted base name intact and reads several labels', () => {
    // The split point is the first `.segment=` boundary, NOT the first dot —
    // `dependency.call` is one name, not a name plus a label.
    expect(parseMetricKey('dependency.call.dep=postgrest.outcome=error')).toEqual({
      name: 'dependency.call',
      labels: { dep: 'postgrest', outcome: 'error' },
    });
  });

  it('returns no labels for a bare name', () => {
    expect(parseMetricKey('sweep.processed')).toEqual({ name: 'sweep.processed', labels: {} });
  });

  it('does not split a label VALUE that contains dots', () => {
    // A plain split('.') would turn this value into three bogus labels. The
    // lookahead only breaks where a new `key=` actually starts.
    expect(parseMetricKey('rate_limit.hit.action=chat.key=1.2.3.4')).toEqual({
      name: 'rate_limit.hit',
      labels: { action: 'chat', key: '1.2.3.4' },
    });
  });
});

describe('toOtlpMetrics — temporality and shape', () => {
  it('ships counters as a DELTA, monotonic sum', () => {
    const { body } = toOtlpMetrics(PAYLOAD, { nowMs: NOW });
    const m = metricsOf(body).find((x) => x.name === 'handler_invoke')!;
    expect(m.sum).toBeDefined();
    // 1 = AGGREGATION_TEMPORALITY_DELTA. The kernel clears its maps on every
    // flush, so claiming CUMULATIVE would report a reset on every invocation.
    expect(m.sum!.aggregationTemporality).toBe(1);
    expect(m.sum!.isMonotonic).toBe(true);
    expect(m.sum!.dataPoints[0].asInt).toBe('3');
  });

  it('encodes int64 fields as strings, as proto3 JSON requires', () => {
    const { body } = toOtlpMetrics(PAYLOAD, { nowMs: NOW });
    const dp = metricsOf(body).find((x) => x.name === 'handler_invoke')!.sum!.dataPoints[0];
    expect(typeof dp.asInt).toBe('string');
    expect(typeof dp.timeUnixNano).toBe('string');
  });

  it('converts the timestamp to nanoseconds as an exact integer string', () => {
    const { body } = toOtlpMetrics(PAYLOAD, { nowMs: NOW });
    const dp = metricsOf(body).find((x) => x.name === 'handler_invoke')!.sum!.dataPoints[0];
    // proto3 JSON requires int64 as a string, and the value must be nanoseconds.
    expect(dp.timeUnixNano).toBe(NOW_NS);
  });

  it('stays exact past the point a double multiply stops working', () => {
    // Why this test exists, and why it uses an absurd date: the obvious
    // `ms * 1e6` is string-identical to the exact value for EVERY epoch-ms this
    // system will see until roughly 2049 — verified by scanning 4000 consecutive
    // values, zero divergences. So a test on a realistic clock cannot tell the
    // two implementations apart, and an earlier version of this test therefore
    // passed against the bug it claimed to catch.
    //
    // The implementation uses BigInt to be exact by construction rather than by
    // a coincidence that expires. This value is past where the coincidence
    // holds: the double loses the digits entirely and renders as
    // "2.305843009213693e+21". Asserting the naive form fails here is what makes
    // the test able to fail at all.
    const far = 2_305_843_009_213_693;
    expect(String(far * 1e6)).not.toBe('2305843009213693000000');

    const { body } = toOtlpMetrics(PAYLOAD, { nowMs: far });
    const dp = metricsOf(body).find((x) => x.name === 'handler_invoke')!.sum!.dataPoints[0];
    expect(dp.timeUnixNano).toBe('2305843009213693000000');
  });

  it('ships gauges as gauges, as doubles', () => {
    const { body } = toOtlpMetrics(PAYLOAD, { nowMs: NOW });
    const m = metricsOf(body).find((x) => x.name === 'sweep_duration_ms')!;
    expect(m.gauge!.dataPoints[0].asDouble).toBe(812);
    expect(m.sum).toBeUndefined();
  });

  it('ships a histogram count as a rate-able delta sum and the percentiles as gauges', () => {
    const { body } = toOtlpMetrics(PAYLOAD, { nowMs: NOW });
    const all = metricsOf(body);
    const names = all.map((m) => m.name).sort();

    expect(names).toContain('handler_latency_count');
    expect(names).toContain('handler_latency_p95');
    expect(names).toContain('handler_latency_avg');
    expect(names).toContain('handler_latency_p50');
    expect(names).toContain('handler_latency_max');

    const count = all.find((m) => m.name === 'handler_latency_count')!;
    expect(count.sum!.aggregationTemporality).toBe(1);
    expect(count.sum!.dataPoints[0].asInt).toBe('3');

    const p95 = all.find((m) => m.name === 'handler_latency_p95')!;
    expect(p95.gauge!.dataPoints[0].asDouble).toBe(240);
    expect(p95.unit).toBe('ms');
  });

  it('sanitises names into something a Prometheus store accepts', () => {
    const { body } = toOtlpMetrics(PAYLOAD, { nowMs: NOW });
    for (const m of metricsOf(body)) {
      // Dots are not legal in a Prometheus metric name. OTel collectors
      // sanitise on ingest; doing it here makes the series name predictable
      // from this repo instead of depending on the receiver.
      expect(m.name).toMatch(/^[a-zA-Z_:][a-zA-Z0-9_:]*$/);
    }
  });

  it('labels each data point with its parsed labels', () => {
    const { body } = toOtlpMetrics(PAYLOAD, { nowMs: NOW });
    const dp = metricsOf(body).find((x) => x.name === 'dependency_call')!.sum!.dataPoints[0];
    expect(attrsOf(dp)).toEqual({ dep: 'postgrest', outcome: 'error' });
  });

  it('names the service and the environment in the resource', () => {
    const { body } = toOtlpMetrics(PAYLOAD, {
      nowMs: NOW,
      serviceName: 'asj-portal',
      environment: 'production',
    });
    const b = body as { resourceMetrics: { resource: { attributes: { key: string; value: { stringValue: string } }[] } }[] };
    const attrs: Record<string, string> = {};
    for (const a of b.resourceMetrics[0].resource.attributes) attrs[a.key] = a.value.stringValue;
    expect(attrs['service.name']).toBe('asj-portal');
    expect(attrs['deployment.environment']).toBe('production');
  });

  it('omits the environment attribute when it is not known', () => {
    const { body } = toOtlpMetrics(PAYLOAD, { nowMs: NOW });
    const b = body as { resourceMetrics: { resource: { attributes: { key: string }[] } }[] };
    const keys = b.resourceMetrics[0].resource.attributes.map((a) => a.key);
    expect(keys).toEqual(['service.name']);
  });
});

describe('toOtlpMetrics — the cardinality guard', () => {
  it('drops a label that is not on the allow-list, and says so', () => {
    const payload: MetricsPayload = {
      counters: { 'rate_limit.hit.action=chat.key=1.2.3.4': 5 },
      histograms: {},
      gauges: {},
    };
    const { body, droppedLabels } = toOtlpMetrics(payload, { nowMs: NOW });

    // `key` is a caller-supplied identifier with no upper bound: as a label it
    // is one time series per caller, forever.
    expect(droppedLabels).toEqual(['key']);

    const dp = metricsOf(body).find((x) => x.name === 'rate_limit_hit')!.sum!.dataPoints[0];
    expect(attrsOf(dp)).toEqual({ action: 'chat' });
  });

  it('keeps the metric itself when a label is dropped', () => {
    const payload: MetricsPayload = {
      counters: { 'rate_limit.hit.action=chat.key=1.2.3.4': 5 },
      histograms: {},
      gauges: {},
    };
    const { body } = toOtlpMetrics(payload, { nowMs: NOW });
    // Dropping the dimension must not drop the signal — "we are being rate
    // limited, per action" is exactly the alertable fact.
    expect(metricsOf(body).map((m) => m.name)).toEqual(['rate_limit_hit']);
  });

  it('reports nothing dropped for the labels the kernel actually uses in bulk', () => {
    const { droppedLabels } = toOtlpMetrics(PAYLOAD, { nowMs: NOW });
    expect(droppedLabels).toEqual([]);
  });
});

describe('otlpMetricsUrl', () => {
  it('appends the signal path to the gateway base', () => {
    expect(otlpMetricsUrl('https://otlp-gateway-prod-ap-southeast-2.grafana.net/otlp')).toBe(
      'https://otlp-gateway-prod-ap-southeast-2.grafana.net/otlp/v1/metrics',
    );
  });

  it('tolerates a trailing slash from a copy-paste', () => {
    expect(otlpMetricsUrl('https://gw.example.test/otlp/')).toBe(
      'https://gw.example.test/otlp/v1/metrics',
    );
  });

  it('tolerates surrounding whitespace', () => {
    expect(otlpMetricsUrl('  https://gw.example.test/otlp  ')).toBe(
      'https://gw.example.test/otlp/v1/metrics',
    );
  });
});

describe('otlpPlaceholderWarning', () => {
  it('flags the documentation placeholder', () => {
    // The form the credentials are handed over in. Pasting it literally yields a
    // 401 that is indistinguishable from a revoked key, so it is worth naming.
    const w = otlpPlaceholderWarning('Basic base64(1828153:<grafana.com API Key>)');
    expect(w).toMatch(/placeholder/i);
  });

  it('flags a missing Basic scheme', () => {
    expect(otlpPlaceholderWarning('YWJjOmRlZg==')).toMatch(/must start with "Basic/);
  });

  it('flags an empty header', () => {
    expect(otlpPlaceholderWarning('')).toMatch(/empty/);
  });

  it('accepts a real-looking header', () => {
    expect(otlpPlaceholderWarning('Basic MTgyODE1MzphYmNkZWY=')).toBeNull();
  });

  it('is case-insensitive about the scheme', () => {
    expect(otlpPlaceholderWarning('basic MTgyODE1MzphYmNkZWY=')).toBeNull();
  });
});
