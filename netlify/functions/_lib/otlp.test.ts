import { describe, expect, it } from 'vitest';
import { otlpEndpointProblem, otlpMetricsUrl, otlpPlaceholderWarning } from './otlp';

/**
 * otlp.test.ts — the exporter's two pre-flight checks.
 *
 * These exist because both failures are silent at runtime. A bad credential
 * yields a 401 that looks like a revoked key; a bad endpoint throws inside
 * fetch() and logs nothing. Either way the sink reports success and the Grafana
 * dashboard simply stays empty — the worst possible failure mode, because there
 * is no signal pointing at configuration as the cause.
 */
describe('otlpPlaceholderWarning (credential)', () => {
  it('accepts a real Basic header', () => {
    expect(otlpPlaceholderWarning('Basic MTgyODE1MzpnbGNfZXlKdklqb2k=')).toBeNull();
  });

  it('rejects an empty header', () => {
    expect(otlpPlaceholderWarning('')).toMatch(/empty/);
    expect(otlpPlaceholderWarning('   ')).toMatch(/empty/);
  });

  it('rejects a header without the Basic prefix', () => {
    expect(otlpPlaceholderWarning('MTgyODE1MzpnbGNfZXlKdklqb2k=')).toMatch(/must start with/);
  });

  it('rejects the literal base64(...) placeholder', () => {
    expect(otlpPlaceholderWarning('Basic base64(<instanceID>:<api key>)')).toMatch(/placeholder/);
  });
});

describe('otlpEndpointProblem (URL)', () => {
  const GOOD = 'https://otlp-gateway-prod-ap-southeast-2.grafana.net/otlp';

  it('accepts a bare https URL', () => {
    expect(otlpEndpointProblem(GOOD)).toBeNull();
  });

  it('accepts a trailing slash (otlpMetricsUrl strips it)', () => {
    expect(otlpEndpointProblem(GOOD + '/')).toBeNull();
    expect(otlpMetricsUrl(GOOD + '///')).toBe(GOOD + '/v1/metrics');
  });

  it('rejects an empty endpoint', () => {
    expect(otlpEndpointProblem('')).toMatch(/empty/);
  });

  /**
   * The regression that motivated this function. On 2026-09-13 the production
   * env var held a Markdown link copied out of the setup doc:
   *   [https://…/otlp](https://…/otlp)
   * otlpMetricsUrl() appended /v1/metrics, new URL() threw, and every export
   * died without a log line — so the owner's question was "why is there no
   * graph?" rather than "what is wrong with my config?".
   */
  it('rejects a URL pasted from Markdown — the 2026-09-13 production outage', () => {
    const pasted = `[${GOOD}](${GOOD})`;
    expect(otlpEndpointProblem(pasted)).toMatch(/Markdown link syntax/);
    // And prove the value really is unusable, not merely unusual: this is the
    // exact string that made new URL() throw in production.
    expect(() => new URL(otlpMetricsUrl(pasted))).toThrow();
  });

  it('rejects embedded whitespace', () => {
    expect(otlpEndpointProblem(GOOD + ' ' + GOOD)).toMatch(/whitespace/);
  });

  it('rejects a non-http scheme', () => {
    expect(otlpEndpointProblem('otlp-gateway.grafana.net/otlp')).toMatch(/http/);
  });

  it('rejects a value that is not a URL at all', () => {
    expect(otlpEndpointProblem('https://exa mple.com')).toMatch(/whitespace|parseable/);
  });
});

describe('otlpMetricsUrl', () => {
  it('appends the OTLP metrics path and collapses trailing slashes', () => {
    expect(otlpMetricsUrl('https://x.example/otlp')).toBe('https://x.example/otlp/v1/metrics');
    expect(otlpMetricsUrl('https://x.example/otlp/')).toBe('https://x.example/otlp/v1/metrics');
  });
});
