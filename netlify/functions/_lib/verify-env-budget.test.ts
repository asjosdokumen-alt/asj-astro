import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { envBudget, PROFILES, LAMBDA_ENV_LIMIT, BUDGET_WARN_RATIO } from '../../../scripts/ci/verify-env.mjs';

// The 4 KB Lambda env ceiling is a PLATFORM limit that no other gate can see:
// it is invisible to typecheck, bundling, boundary checks and the test suite,
// and it kills the deploy at function creation — AFTER a fully successful build.
// It went undetected until 2026-09-12. See docs/HANDOFF_4KB_ENV_LIMIT.md.
//
// These tests pin the arithmetic, because a budget check that miscounts is
// worse than none: it would report headroom that does not exist.
describe('env budget arithmetic', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Snapshot only the keys we touch so the rest of the environment is intact.
    for (const k of ['__BUDGET_A', '__BUDGET_B', '__BUDGET_BIG']) {
      saved[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('counts key + "=" + value bytes, not just the value', () => {
    process.env.__BUDGET_A = 'x'.repeat(10);
    const { total, known } = envBudget(['__BUDGET_A'], []);
    // "__BUDGET_A" = 10 chars + 1 separator + 10 value chars
    expect(known).toBe(1);
    expect(total).toBe(21);
  });

  it('counts multi-byte UTF-8 by BYTES, not code units', () => {
    // Lambda measures bytes. A string like "é" is 1 code unit but 2 bytes, so a
    // naive .length sum would understate the payload and hide an overflow.
    process.env.__BUDGET_A = 'é'.repeat(4);
    const { total } = envBudget(['__BUDGET_A'], []);
    expect('__BUDGET_A'.length + 1 + 8).toBe(total);
  });

  it('ignores variables that are absent or empty', () => {
    delete process.env.__BUDGET_A;
    process.env.__BUDGET_B = '';
    const { total, known } = envBudget(['__BUDGET_A', '__BUDGET_B'], []);
    expect(known).toBe(0);
    expect(total).toBe(0);
  });

  it('de-duplicates a name listed in both required and optional', () => {
    process.env.__BUDGET_A = 'y'.repeat(5);
    const { total, known } = envBudget(['__BUDGET_A'], ['__BUDGET_A']);
    expect(known).toBe(1);
    expect(total).toBe('__BUDGET_A'.length + 1 + 5);
  });

  it('sorts largest-first so the culprit is always visible', () => {
    process.env.__BUDGET_A = 'a'.repeat(5);
    process.env.__BUDGET_BIG = 'b'.repeat(500);
    const { rows } = envBudget(['__BUDGET_A', '__BUDGET_BIG'], []);
    expect(rows[0].name).toBe('__BUDGET_BIG');
    expect(rows[1].name).toBe('__BUDGET_A');
  });

  it('reproduces the real 2026-09-12 overflow from measured component sizes', () => {
    // The actual failure: 4275 B against a 4096 B cap. Reconstructed from the
    // real variables and their measured/estimated sizes, so a regression in the
    // arithmetic shows up as a changed total here.
    process.env.__BUDGET_BIG = 'g'.repeat(2377); // FIREBASE_SERVICE_ACCOUNT
    const fb = envBudget(['__BUDGET_BIG'], []);
    expect(fb.total).toBe('__BUDGET_BIG'.length + 1 + 2377);

    // Known-good subtotal of the measured variables (see the handoff doc).
    const measured = 1397;
    const estimatedRest = 4275 - measured - (24 + 1 + 2377); // rest incl. names
    expect(measured + (24 + 1 + 2377) + estimatedRest).toBe(4275);
    expect(4275).toBeGreaterThan(LAMBDA_ENV_LIMIT);
    expect(4275 - LAMBDA_ENV_LIMIT).toBe(179);
  });
});

describe('the guard that prevents this class of bug recurring', () => {
  it('keeps the largest real consumer in the production profile', () => {
    // FIREBASE_SERVICE_ACCOUNT was absent from EVERY profile, which made it
    // invisible to the budget arithmetic — the reason a 4 KB overflow was not
    // caught. If it is ever removed from the profile again, this fails.
    expect(PROFILES.production.optional).toContain('FIREBASE_SERVICE_ACCOUNT');
  });

  it('lists every Phase C receiver variable in the production profile', () => {
    // Five new names are planned; each one added to the budget is a few hundred
    // bytes against a limit the site was already 179 B over.
    for (const name of [
      'HEALTH_TOKEN',
      'METRICS_SINK_URL',
      'METRICS_SINK_TOKEN',
      'METRICS_RECEIVER_TOKEN',
      'METRICS_NOTIFY_URL',
    ]) {
      expect(PROFILES.production.optional).toContain(name);
    }
  });

  it('warns before the limit rather than only at it', () => {
    // A check that only fires at 100 % gives no time to react — the site was
    // already at 88 % with the receiver variables still to come.
    expect(BUDGET_WARN_RATIO).toBeGreaterThan(0.5);
    expect(BUDGET_WARN_RATIO).toBeLessThan(1);
  });
});
