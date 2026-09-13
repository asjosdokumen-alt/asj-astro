import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { parseArgs, judge, bestOf, probe } from '../../../scripts/ci/cold-start-gate.mjs';

// ── Why this file exists ──────────────────────────────────────────────────────
//
// docs/BACKEND_TODO.md #29 (cold-start latency) sat open for weeks labelled
// owner-side, on the premise that it could not be measured from here. It could:
// scripts/ci/cold-start-gate.mjs measures TTFB with fetch(). What was actually
// missing was the gate, not the measurement.
//
// A latency gate has one specific way to be useless, and it is not "too strict":
// a gate whose threshold comparison is inverted, or whose budget is ignored,
// PASSES a site that takes thirty seconds to answer and reads as healthy
// forever. Nobody notices, because the failure mode of this gate is silence.
// So both directions are pinned below, and the boundary is tested exactly.

describe('cold-start verdict', () => {
  it('passes a reading at or under budget', () => {
    expect(judge(500, 3000).verdict).toBe('pass');
    expect(judge(2999, 3000).verdict).toBe('pass');
  });

  it('PASSES exactly at the budget — the boundary is inclusive', () => {
    // Off-by-one here is the classic defect in a threshold gate. The budget is
    // a ceiling, so a reading of exactly 3000ms against a 3000ms budget is
    // within it. An exclusive comparison would fail a compliant site.
    expect(judge(3000, 3000).verdict).toBe('pass');
  });

  it('FAILS one millisecond over the budget', () => {
    // The other half of the boundary. If this ever stops failing, the gate is
    // decorative: `best <= budget` has been inverted or the margin widened.
    expect(judge(3001, 3000).verdict).toBe('over');
    expect(judge(3001, 3000).reason).toMatch(/over|>/);
  });

  it('FAILS a genuinely slow reading, not just a marginal one', () => {
    // The whole point: a site answering in 30s must not pass a 3s budget.
    expect(judge(30000, 3000).verdict).toBe('over');
    expect(judge(12000, 3000).verdict).toBe('over');
  });

  it('reports an unreachable path as an error, never as a pass', () => {
    // Conflating "could not connect" with "fast" is the worst possible outcome
    // for a latency gate: it would score an outage as excellent latency.
    expect(judge(null, 3000).verdict).toBe('error');
    expect(judge(undefined, 3000).verdict).toBe('error');
    expect(judge(NaN, 3000).verdict).toBe('error');
    expect(judge(Infinity, 3000).verdict).toBe('error');
  });

  it('every verdict over a wide sweep of readings is one of the three states', () => {
    // Guards against a judge() that returns undefined for some input, which
    // would fall through every `=== 'over'` check in main() and pass silently.
    for (const ms of [0, 1, 100, 999, 1000, 2999, 3000, 3001, 5000, 60000]) {
      const { verdict } = judge(ms, 3000);
      expect(['pass', 'over'], `reading ${ms}ms must yield a real verdict`).toContain(verdict);
    }
  });
});

describe('cold-start sampling', () => {
  it('takes the best sample, so runner noise cannot manufacture a failure', () => {
    // The stated design: fail only when even the FASTEST sample breached the
    // budget. A slow first sample followed by a fast one must pass.
    expect(bestOf([2500, 800, 900])).toBe(800);
    expect(judge(bestOf([2500, 800, 900]), 3000).verdict).toBe('pass');
  });

  it('ignores failed samples when reducing', () => {
    expect(bestOf([null, 850, null])).toBe(850);
    expect(bestOf([null, null])).toBeNull();
  });

  it('is not fooled by an empty sample set', () => {
    expect(bestOf([])).toBeNull();
  });

  it('fails when EVERY sample is over budget', () => {
    // The complement of the best-of rule: if no sample was fast, the path is
    // genuinely slow and the gate must say so.
    expect(judge(bestOf([9000, 8000, 8500]), 3000).verdict).toBe('over');
  });
});

describe('cold-start argument parsing', () => {
  it('reads the base URL from the environment', () => {
    expect(parseArgs([], { COLD_START_URL: 'https://from-env.test' }).url).toBe('https://from-env.test');
  });

  it('defaults the budget to the 3s target from BACKEND_TODO #29', () => {
    expect(parseArgs([], {}).budget).toBe(3000);
  });

  it('is report-only unless --enforce is passed', () => {
    // This is the safety property. If --enforce ever became the default, a
    // noisy CI runner could start failing the pipeline on latency alone.
    expect(parseArgs([], {}).enforce).toBe(false);
    expect(parseArgs(['--enforce'], {}).enforce).toBe(true);
  });

  it('falls back to a representative cold path set when none is given', () => {
    const args = parseArgs([], {});
    expect(args.paths.length).toBeGreaterThan(0);
    // The functions probed must be ones that actually exist in the site.
    expect(args.paths.every((p) => p.startsWith('/.netlify/functions/'))).toBe(true);
  });

  it('accepts repeated --path flags', () => {
    const args = parseArgs(['--path', '/a', '--path', '/b'], {});
    expect(args.paths).toEqual(['/a', '/b']);
  });

  it('parses --budget and --samples as numbers', () => {
    const args = parseArgs(['--budget', '1500', '--samples', '5'], {});
    expect(args.budget).toBe(1500);
    expect(args.samples).toBe(5);
  });
});

// ── The probe must actually measure something ─────────────────────────────────
//
// Every assertion above is pure arithmetic. That is deliberate — the decision is
// testable without a socket — but it means the suite can be perfectly green
// while probe() returns a constant, and the gate would then measure nothing at
// all. These tests use a real local server with a controlled delay.
describe('cold-start probe', () => {
  const serveDelayed = (delayMs: number, status = 200): Promise<{ server: Server; port: number }> =>
    new Promise((resolve) => {
      const server = createServer((_req, res) => {
        setTimeout(() => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        }, delayMs);
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
          throw new Error('expected a bound TCP address');
        }
        resolve({ server, port: address.port });
      });
    });

  it('reports a TTFB that reflects a real server delay', async () => {
    const { server, port } = await serveDelayed(250);
    try {
      const r = await probe(`http://127.0.0.1:${port}/`, 5000);
      expect(r.ok).toBe(true);
      // Generous lower bound: we are proving the clock is real, not exact.
      expect(r.ms).toBeGreaterThanOrEqual(200);
    } finally {
      server.close();
    }
  });

  it('is fast on a server with no delay — the gate is not trivially red', async () => {
    const { server, port } = await serveDelayed(0);
    try {
      const r = await probe(`http://127.0.0.1:${port}/`, 5000);
      expect(r.ok).toBe(true);
      expect(judge(r.ms, 3000).verdict).toBe('pass');
    } finally {
      server.close();
    }
  });

  it('treats a slow server as over budget', async () => {
    // End-to-end proof that a genuinely slow response reaches the 'over'
    // verdict through the real network path, not just through judge().
    const { server, port } = await serveDelayed(600);
    try {
      const r = await probe(`http://127.0.0.1:${port}/`, 5000);
      expect(r.ok).toBe(true);
      expect(judge(r.ms, 300).verdict).toBe('over');
    } finally {
      server.close();
    }
  });

  it('reports an unreachable host as a failure, not a fast pass', async () => {
    // Port 1 is reserved and never listening.
    const r = await probe('http://127.0.0.1:1/', 2000);
    expect(r.ok).toBe(false);
    expect(judge(r.ms, 3000).verdict).toBe('error');
  });

  it('honours the timeout', async () => {
    const { server, port } = await serveDelayed(3000);
    try {
      const r = await probe(`http://127.0.0.1:${port}/`, 300);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/timeout/i);
    } finally {
      server.close();
    }
  });
});

// ── The gate must be reachable from the real pipeline ─────────────────────────
//
// A gate that only runs when someone remembers to type it is not a gate. These
// assertions check the wiring exists, in the same spirit as the smoke-test
// suite's workflow check.
describe('cold-start gate wiring', () => {
  it('is exposed as an npm script', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts['cold:start']).toBeTruthy();
  });

  it('runs in report-only mode inside ci:quality', () => {
    // No --enforce: the local quality gate must not go red on latency noise.
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts['ci:quality']).toContain('cold:start');
    expect(pkg.scripts['cold:start']).not.toContain('--enforce');
  });
});
