import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { classifyHealth, healthHeaders, parseArgs, checkUrl } from '../../../scripts/ci/smoke-test.mjs';

// ── The document check must still be able to fail ─────────────────────────────
//
// Mutation testing on 2026-09-13 found this suite green while checkUrl() had
// been edited to return `{ pass: true }` for any status. Nothing covered it: the
// tests exercised the health probe, and took the marker assertion in the
// document check for granted. That is the same "test that cannot fail" defect
// the mutation harness was built to catch, so it gets a real test.
describe('smoke-test document check', () => {
  const serve = (status: number, body: string): Promise<{ server: Server; port: number }> =>
    new Promise((resolve) => {
      const server = createServer((_req, res) => {
        res.writeHead(status, { 'content-type': 'text/html' });
        res.end(body);
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
          throw new Error('expected a bound TCP address');
        }
        resolve({ server, port: address.port });
      });
    });

  const args = { retries: 1, timeout: 5000, backoff: 10, insecure: false };

  it('passes when the marker is present', async () => {
    const { server, port } = await serve(200, '<html>Lowongan Loker</html>');
    try {
      const r = await checkUrl('document', `http://127.0.0.1:${port}`, args, ['Lowongan Loker']);
      expect(r.pass).toBe(true);
    } finally {
      server.close();
    }
  });

  it('FAILS when the marker is missing, even on HTTP 200', async () => {
    // This is the whole reason the health probe exists: the document can be a
    // perfectly healthy 200 and still prove nothing about the app.
    const { server, port } = await serve(200, '<html>maintenance</html>');
    try {
      const r = await checkUrl('document', `http://127.0.0.1:${port}`, args, ['Lowongan Loker']);
      expect(r.pass).toBe(false);
      expect(r.reason).toMatch(/missing marker/i);
    } finally {
      server.close();
    }
  });

  it('FAILS on a non-200 status', async () => {
    const { server, port } = await serve(500, 'Lowongan Loker');
    try {
      const r = await checkUrl('document', `http://127.0.0.1:${port}`, args, ['Lowongan Loker']);
      expect(r.pass).toBe(false);
    } finally {
      server.close();
    }
  });

  it('FAILS when the server is unreachable', async () => {
    // Port 1 is reserved and never listening.
    const r = await checkUrl('document', 'http://127.0.0.1:1', args, ['Lowongan Loker']);
    expect(r.pass).toBe(false);
  });
});

// ── Why this file exists ──────────────────────────────────────────────────────
//
// The health probe inside the smoke test decides whether an automatic rollback
// fires in production (deploy-production.yml → netlify-rollback.mjs). Two ways
// to get that wrong, and both are worse than having no probe at all:
//
//   • Too strict — a site whose HEALTH_TOKEN is not wired in answers 503, the
//     probe is read as "production is broken", and a healthy release is rolled
//     back for a reason that has nothing to do with it. A flaky gate burns the
//     rollback button's credibility, which is the only thing that makes it
//     useful.
//
//   • Too lenient — a real dependency failure is downgraded to a warning, the
//     pipeline stays green, and the very outage Phase C was built to detect
//     ships unnoticed. That was the state of the world for weeks: the marker
//     assertion passed while PostgREST could have been dead, because the marker
//     lives in a prerendered page served straight from the CDN.
//
// Hence classifyHealth() is pure: the whole decision is testable without a
// socket, and the tests below pin BOTH failure modes.
describe('smoke-test health classification', () => {
  it('passes on a real, positive verdict', () => {
    expect(classifyHealth(200, '{"status":"ok"}', true).verdict).toBe('pass');
    expect(classifyHealth(200, '{"status":"degraded"}', true).verdict).toBe('pass');
    // 204 is an accepted answer for a liveness endpoint with no body.
    expect(classifyHealth(204, '', false).verdict).toBe('pass');
  });

  it('downgrades 503-unconfigured to a warning, never a failure', () => {
    // This is the exact body netlify/functions/health.ts returns when
    // process.env.HEALTH_TOKEN is absent — verbatim from the endpoint.
    const body = JSON.stringify({
      success: false,
      error: 'Health detail is disabled: HEALTH_TOKEN is not configured.',
      reason: 'HEALTH_TOKEN not configured',
    });
    const { verdict, reason } = classifyHealth(503, body, false);
    expect(verdict).toBe('warn');
    expect(reason).toMatch(/not configured/i);
  });

  it('downgrades a rejected token to a warning — credential drift is not a site outage', () => {
    const body = '{"success":false,"error":"Unauthorized.","reason":"missing or invalid token"}';
    // A token WAS supplied and the site said no: the site is serving, the
    // monitor's secret is stale. Rolling back would not fix a rotated secret.
    expect(classifyHealth(401, body, true).verdict).toBe('warn');
  });

  it('downgrades an unauthenticated 401 to a warning', () => {
    expect(classifyHealth(401, '{"reason":"missing or invalid token"}', false).verdict).toBe('warn');
  });

  it('FAILS a real negative verdict — the whole point of the probe', () => {
    // A 5xx that is NOT the fail-closed "unconfigured" answer is the endpoint
    // reporting that a dependency is down. This must reach the exit code, or
    // the automatic rollback in deploy-production.yml never fires.
    expect(classifyHealth(503, '{"status":"down"}', true).verdict).toBe('fail');
    expect(classifyHealth(500, '{"error":"boom"}', true).verdict).toBe('fail');
    expect(classifyHealth(502, '', true).verdict).toBe('fail');
  });

  it('does not mistake an unrelated 503 for the fail-closed answer', () => {
    // Guard against a substring match that is too loose: the downgrade must key
    // on the health endpoint's own wording, not on any 503 that happens to
    // mention a token.
    expect(classifyHealth(503, '{"error":"upstream timeout"}', true).verdict).toBe('fail');
    expect(classifyHealth(503, '{"error":"token bucket exhausted"}', true).verdict).toBe('fail');
  });

  it('every non-2xx that is not explicitly excused fails', () => {
    for (const status of [500, 502, 503, 504, 400, 403, 404]) {
      const { verdict } = classifyHealth(status, '{}', true);
      expect(verdict, `HTTP ${status} must not be silently excused`).toBe('fail');
    }
  });
});

describe('smoke-test argument parsing', () => {
  it('reads the health token from the environment, not only from argv', () => {
    // CI passes it via `env:` so it never lands in the process table or the
    // workflow log. If the env fallback regresses, the probe silently becomes
    // unauthenticated and every production deploy prints a warning instead of a
    // verdict — exactly the blind spot this change was meant to close.
    const fromEnv = parseArgs(['--url', 'https://x.test'], { HEALTH_TOKEN: 'from-env' });
    expect(fromEnv.healthToken).toBe('from-env');
  });

  it('lets --health-token win over the environment', () => {
    const args = parseArgs(['--url', 'https://x.test', '--health-token', 'explicit'], { HEALTH_TOKEN: 'from-env' });
    expect(args.healthToken).toBe('explicit');
  });

  it('defaults to no token rather than a placeholder', () => {
    const args = parseArgs(['--url', 'https://x.test'], {});
    expect(args.healthToken).toBe('');
  });

  it('still accepts repeated --expect markers', () => {
    const args = parseArgs(['--url', 'https://x.test', '--expect', 'ASJ', '--expect', 'Portal'], {});
    expect(args.expect).toEqual(['ASJ', 'Portal']);
  });
});

// classifyHealth() excusing a rejected token is only meaningful if the probe
// actually SENDS one. Without this, the suite can be perfectly green while the
// request goes out unauthenticated and every deployment reports "correctly
// unauthenticated" forever — a monitor that cannot authenticate looks the same
// as a monitor that is not configured.
describe('smoke-test health request headers', () => {
  it('sends the token as a Bearer credential', () => {
    expect(healthHeaders('abc123')).toEqual({ authorization: 'Bearer abc123' });
  });

  it('sends no authorization header when there is no token', () => {
    // Must be absent rather than empty: an empty `authorization: Bearer ` is a
    // MALFORMED header, which netlify/functions/health.ts answers with a 401
    // that reads as "credential drift" instead of "no monitor configured".
    expect(healthHeaders('')).toEqual({});
    expect(healthHeaders(undefined)).toEqual({});
    expect(Object.keys(healthHeaders(''))).not.toContain('authorization');
  });

  it('the token from parseArgs reaches the header unchanged', () => {
    const args = parseArgs(['--url', 'https://x.test'], { HEALTH_TOKEN: 'tok-from-env' });
    expect(healthHeaders(args.healthToken)).toEqual({ authorization: 'Bearer tok-from-env' });
  });
});

// The document check is the only thing that runs when no --health flag is
// given, and the reason it cannot detect a dead data layer is worth pinning in
// a test rather than a comment: the marker it asserts lives in a prerendered
// page. If the app ever moves to SSR and the marker stops being static, this
// test should be revisited — the reasoning above would no longer hold.
describe('the reason the health probe exists', () => {
  it('deployment workflows pass --health, so the gate is not marker-only', () => {
    const files = [
      '.github/workflows/deploy-production.yml',
      '.github/workflows/deploy-staging.yml',
      '.github/workflows/rollback.yml',
    ];
    for (const f of files) {
      const src = readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
      expect(src, `${f} must probe the health endpoint`).toContain('--health');
    }
  });

  it('the local CI smoke job does NOT probe health — no functions run there', () => {
    // ci.yml serves the built artifact with `astro preview`, which serves static
    // files only. A health probe there would hit a 404 and fail the pipeline for
    // a completely legitimate artifact.
    const src = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const smokeStep = src.slice(src.indexOf('Serve artifact and smoke test'));
    const line = smokeStep.slice(0, smokeStep.indexOf('\n\n'));
    expect(line).not.toContain('--health');
  });
});
