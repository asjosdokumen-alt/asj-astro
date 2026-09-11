/**
 * health-entrypoint.test.ts — the gate on the /health entry point.
 *
 * This file exists because the risk here is not a wrong number; it is a wrong
 * ACCESS DECISION. The endpoint reports dependency names, queue depth, upstream
 * error strings, and timings — a good map for someone probing the system. So the
 * tests below are written around the three ways an access check usually fails:
 *
 *   1. It fails OPEN when unconfigured (no secret => serve everything).
 *   2. It downgrades a WRONG credential to the public response, so a typo in a
 *      monitor's token looks like success forever.
 *   3. It compares with a variable-time equality, which leaks the secret
 *      prefix through timing.
 *
 * ── HOW THE HANDLER IS LOADED, AND WHY IT IS LOADED THIS WAY ─────────────────
 * Two obstacles, and the second one is subtle enough to be worth writing down:
 *
 *   1. `package.json` has `"type": "module"`, so `require()` of the entry point
 *      fails with "require is not defined in ES module scope", and a real
 *      `import()` fails the other way because the entry point is CommonJS. So
 *      the source is read and evaluated in a vm context with a CJS shim — the
 *      technique e2e/share-data.test.ts already uses.
 *
 *   2. The detail path calls `await import('./_lib/health')`. In a vm context
 *      that expression is ALWAYS the syntax-level dynamic import — a context
 *      property named `import` does not shadow it (verified) — and Node refuses
 *      to supply its callback unless the process runs with
 *      `--experimental-vm-modules`. Rather than make this suite depend on a
 *      Node flag, the context defines `require`, and the loader REWRITES the
 *      entry's one dynamic import into a `require` call before evaluating.
 *      That is faithful, not a hack: Netlify bundles the function as a single
 *      CommonJS file with no code splitting, so `import('./_lib/health')` and
 *      `require('./_lib/health')` reach the same inlined module at runtime. The
 *      rewrite is asserted below, so it cannot silently stop matching.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ENTRY = join(process.cwd(), 'netlify/functions/health.js');
const SRC = readFileSync(ENTRY, 'utf8');
const realRequire = createRequire(ENTRY);

/** The one dynamic import in the entry point, rewritten to the CJS equivalent. */
const REWRITE_FROM = "await import('./_lib/health')";
const REWRITE_TO = "await require('./_lib/health')";

const { mockBuild, mockLog } = vi.hoisted(() => ({
  mockBuild: vi.fn(),
  mockLog: vi.fn(),
}));

interface Res {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function loadHandler(): (e: unknown) => Promise<Res> {
  if (!SRC.includes(REWRITE_FROM)) {
    // Fail loudly rather than silently exercising a path that never reaches the
    // report builder. If the entry's import syntax changes, fix the rewrite.
    throw new Error(
      `health-entrypoint.test: entry no longer contains ${REWRITE_FROM}. ` +
        'Update REWRITE_FROM/REWRITE_TO so the detail path is still reached.',
    );
  }
  const patched = SRC.split(REWRITE_FROM).join(REWRITE_TO);
  const moduleObj = { exports: {} as Record<string, unknown> };
  const ctx = vm.createContext({
    module: moduleObj,
    exports: moduleObj.exports,
    // Live process object, not a copy — env mutations in the test must be
    // visible to the handler, or we would only ever test one branch.
    process,
    console,
    setTimeout,
    clearTimeout,
    URL,
    require: (id: string) => {
      if (id === './_lib/health') {
        return { buildHealthReport: mockBuild, logHealthReport: mockLog };
      }
      // Node built-ins are real requires — only the module under test's own
      // dependency is stubbed. Refusing them would fail on node:crypto before
      // any assertion ran.
      if (id.startsWith('node:')) return realRequire(id);
      throw new Error('unexpected require: ' + id);
    },
  });
  new vm.Script(patched, { filename: ENTRY }).runInContext(ctx);
  return (moduleObj.exports as { handler: (e: unknown) => Promise<Res> }).handler;
}

function event(over: Record<string, unknown> = {}) {
  return { httpMethod: 'GET', headers: {}, queryStringParameters: {}, ...over };
}

const HEALTHY_REPORT = {
  status: 'ok' as const,
  reasons: ['all dependencies healthy'],
  levels: [] as string[],
  timestamp: new Date().toISOString(),
  instance: { dependencies: [{ name: 'postgrest' }], breakersOpen: 0 },
  shared: { postgrest: { reachable: true }, jobQueue: { depth: 0 } },
  thresholds: { queueDepth: 100 },
};

const ORIGINAL = process.env.HEALTH_TOKEN;

describe('/health entry point — auth model', () => {
  beforeEach(() => {
    delete process.env.HEALTH_TOKEN;
    mockBuild.mockReset();
    mockLog.mockReset();
    mockBuild.mockResolvedValue(HEALTHY_REPORT);
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.HEALTH_TOKEN;
    else process.env.HEALTH_TOKEN = ORIGINAL;
  });

  // ── 1. Liveness stays open, and leaks nothing ─────────────────────────────
  it('answers an unauthenticated bare GET with 200 liveness only', async () => {
    const res = await loadHandler()(event());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    // The whole point of the split: no internals on the public path.
    expect(body.instance).toBeUndefined();
    expect(body.shared).toBeUndefined();
    expect(body.dependencies).toBeUndefined();
    // And it must not have touched the report builder at all.
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('never caches a health read, so a stale "ok" cannot mask an outage', async () => {
    const res = await loadHandler()(event());
    expect(res.headers['Cache-Control']).toContain('no-store');
  });

  it('reports whether detail is gated without revealing the token', async () => {
    process.env.HEALTH_TOKEN = 'x'.repeat(40);
    let res = await loadHandler()(event());
    expect(JSON.parse(res.body).detail).toBe('gated');

    delete process.env.HEALTH_TOKEN;
    res = await loadHandler()(event());
    expect(JSON.parse(res.body).detail).toBe('unconfigured');
    expect(res.body).not.toContain('x'.repeat(40));
  });

  // ── 2. FAIL CLOSED when unconfigured ──────────────────────────────────────
  it('returns 503 — not 200 — for a detail request when HEALTH_TOKEN is unset', async () => {
    const res = await loadHandler()(event({ httpMethod: 'POST' }));
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.reason).toBe('HEALTH_TOKEN not configured');
    // Still no internals, and the report was never built.
    expect(body.instance).toBeUndefined();
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('distinguishes a configuration failure from a caller failure', async () => {
    const unconfigured = JSON.parse((await loadHandler()(event({ httpMethod: 'POST' }))).body);
    expect(unconfigured.reason).toBe('HEALTH_TOKEN not configured');

    process.env.HEALTH_TOKEN = 'correct-horse';
    const wrong = JSON.parse((await loadHandler()(event({ httpMethod: 'POST' }))).body);
    expect(wrong.reason).toBe('missing or invalid token');
    expect(unconfigured.reason).not.toBe(wrong.reason);
  });

  it('rejects a detail request with no token even when one is configured', async () => {
    process.env.HEALTH_TOKEN = 'sekrit';
    const body = JSON.parse(
      (await loadHandler()(event({ queryStringParameters: { detail: '1' } }))).body,
    );
    expect(body.reason).toBe('missing or invalid token');
    expect(mockBuild).not.toHaveBeenCalled();
  });

  // ── 3. A WRONG credential is 401, never a silent downgrade ────────────────
  it('rejects a wrong token with 401 rather than serving the liveness body', async () => {
    process.env.HEALTH_TOKEN = 'correct-horse';
    const res = await loadHandler()(event({ headers: { authorization: 'Bearer wrong-horse' } }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).success).toBe(false);
  });

  it('rejects a token of the correct length but wrong content (no length shortcut)', async () => {
    process.env.HEALTH_TOKEN = 'a'.repeat(32);
    const res = await loadHandler()(event({ headers: { authorization: 'Bearer ' + 'b'.repeat(32) } }));
    expect(res.statusCode).toBe(401);
  });

  it('rejects a correct-prefix token — the comparison is not a prefix match', async () => {
    process.env.HEALTH_TOKEN = 'abcdefghijklmnop';
    const res = await loadHandler()(event({ headers: { authorization: 'Bearer abcdefgh' } }));
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token that CONTAINS the secret (no substring match)', async () => {
    process.env.HEALTH_TOKEN = 'sekrit';
    const res = await loadHandler()(event({ headers: { authorization: 'Bearer xxsekretyy' } }));
    expect(res.statusCode).toBe(401);
  });

  it('accepts a case-insensitive Bearer scheme but not a missing one', async () => {
    process.env.HEALTH_TOKEN = 'sekrit';
    const ok = await loadHandler()(event({ headers: { authorization: 'bearer sekrit' } }));
    expect(ok.statusCode).toBe(200);

    const raw = await loadHandler()(event({ headers: { authorization: 'sekrit' } }));
    expect(raw.statusCode).toBe(401);
  });

  it('does not echo the supplied token back in the rejection body', async () => {
    process.env.HEALTH_TOKEN = 'correct-horse';
    const res = await loadHandler()(
      event({ headers: { authorization: 'Bearer leak-me-please' } }),
    );
    expect(res.body).not.toContain('leak-me-please');
  });

  // ── 4. The detail path serves the report when authenticated ───────────────
  it('serves the full report on `?detail=1` with a valid token', async () => {
    process.env.HEALTH_TOKEN = 'sekrit';
    const res = await loadHandler()(
      event({ queryStringParameters: { detail: '1' }, headers: { authorization: 'Bearer sekrit' } }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.instance).toBeDefined();
    expect(body.thresholds.queueDepth).toBe(100);
    expect(mockBuild).toHaveBeenCalledWith({ includeShared: true });
    expect(mockLog).toHaveBeenCalledTimes(1);
  });

  it('serves the report on a POST body too', async () => {
    process.env.HEALTH_TOKEN = 'sekrit';
    const res = await loadHandler()(
      event({ httpMethod: 'POST', headers: { authorization: 'Bearer sekrit' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(mockBuild).toHaveBeenCalledTimes(1);
  });

  it('maps a `down` status to 503 so an unparsing uptime monitor is still correct', async () => {
    process.env.HEALTH_TOKEN = 'sekrit';
    mockBuild.mockResolvedValue({ ...HEALTHY_REPORT, status: 'down', levels: ['fail'] });
    const res = await loadHandler()(
      event({ queryStringParameters: { detail: '1' }, headers: { authorization: 'Bearer sekrit' } }),
    );
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).status).toBe('down');
  });

  it('keeps `degraded` at 200 — work is still being served', async () => {
    process.env.HEALTH_TOKEN = 'sekrit';
    mockBuild.mockResolvedValue({ ...HEALTHY_REPORT, status: 'degraded', levels: ['warn'] });
    const res = await loadHandler()(
      event({ queryStringParameters: { detail: '1' }, headers: { authorization: 'Bearer sekrit' } }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('returns 503 without leaking the exception when the report builder throws', async () => {
    process.env.HEALTH_TOKEN = 'sekrit';
    mockBuild.mockRejectedValue(new Error('postgrest exploded: secret detail'));
    const res = await loadHandler()(
      event({ queryStringParameters: { detail: '1' }, headers: { authorization: 'Bearer sekrit' } }),
    );
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('postgrest exploded');
    expect(JSON.parse(res.body).reason).toBe('report-failed');
  });
});

describe('health.js source — structural assertions', () => {
  it('reads the token from process.env, not the file-backed env loader', () => {
    // The entry point must work before the application env loader is reachable;
    // reading HEALTH_TOKEN through _lib/env would couple the gate to a module
    // the liveness path does not need.
    expect(SRC).toContain('process.env.HEALTH_TOKEN');
    expect(SRC).not.toContain("require('./_lib/env')");
  });

  it('does not register its own surface — the action is reached via control.ts', () => {
    // Guards the access-control decision: registering getHealth in the router
    // would re-open it on bridge-links.
    expect(SRC).not.toContain('makeSurfaceHandler');
  });
});
