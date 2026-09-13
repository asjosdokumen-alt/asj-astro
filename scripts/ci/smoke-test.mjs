#!/usr/bin/env node
/**
 * smoke-test.mjs — Post-deploy health check used as the rollback gate.
 *
 * WHY THIS EXISTS
 *   A deploy returning HTTP 200 from a CDN edge proves nothing about whether the
 *   built app actually works. This script exercises the deployed URL the way a
 *   real visitor would: fetch the document, assert key markers survived the
 *   build/minify pipeline, and optionally probe an API endpoint.
 *
 *   The exit code is what drives automatic rollback. Keep the checks here
 *   cheap, deterministic, and free of credentials — a flaky smoke test causes
 *   more incidents than it prevents.
 *
 * WHY THE DOCUMENT CHECK IS NOT ENOUGH (added 2026-09-13)
 *   The document here is a PRERENDERED static page. Its bytes are served
 *   straight from the CDN, so the marker assertion still passes while the data
 *   layer behind it is dead — PostgREST unreachable, job queue backed up,
 *   breakers open. That is exactly the failure Phase C was built to see, and it
 *   sailed through this gate for weeks because no workflow passed --health.
 *
 *   Hence the health probe below, which is the only check in this file that can
 *   distinguish "the CDN is up" from "the app works". Two rules keep it honest:
 *
 *     • A health response that is NOT a real verdict is a WARNING, never a pass
 *       and never a rollback trigger. `503 HEALTH_TOKEN not configured` means
 *       the probe could not authenticate (a staging/CI site with no secret set,
 *       or a deployment whose env is not wired). Failing the pipeline there
 *       would roll production back for a reason that has nothing to do with the
 *       release — the exact flakiness this file's header warns about.
 *
 *     • A health response that IS a real verdict is obeyed. Any other non-2xx
 *       (notably 5xx from a dependency check) fails the run and triggers the
 *       rollback flow in deploy-production.yml.
 *
 * USAGE
 *   node scripts/ci/smoke-test.mjs --url https://example.netlify.app
 *   node scripts/ci/smoke-test.mjs --url https://x.app --expect "ASJ" --expect "Portal"
 *   node scripts/ci/smoke-test.mjs --url https://x.app --health /.netlify/functions/health
 *   HEALTH_TOKEN=… node scripts/ci/smoke-test.mjs --url https://x.app --health /.netlify/functions/health
 *
 *   --health-token   Bearer token for the health probe. Falls back to the
 *                    HEALTH_TOKEN environment variable, which is how CI supplies
 *                    it (never on the command line — argv is visible in `ps` and
 *                    in the workflow log).
 *   --retries        attempts before giving up (default 3)
 *   --timeout        per-request timeout in ms (default 15000)
 *   --backoff        base delay in ms, doubled each retry (default 2000)
 */

export function parseArgs(argv, env = process.env) {
  const args = {
    url: env.SMOKE_URL || env.BASE_URL || '',
    expect: [],
    health: '',
    healthToken: env.HEALTH_TOKEN || '',
    retries: 3,
    timeout: 15000,
    backoff: 2000,
    insecure: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--url': args.url = argv[++i]; break;
      case '--expect': args.expect.push(argv[++i]); break;
      case '--health': args.health = argv[++i]; break;
      case '--health-token': args.healthToken = argv[++i]; break;
      case '--retries': args.retries = Number(argv[++i]); break;
      case '--timeout': args.timeout = Number(argv[++i]); break;
      case '--backoff': args.backoff = Number(argv[++i]); break;
      case '--insecure': args.insecure = true; break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url, timeoutMs, insecure, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'asj-ci-smoke/1.0', ...headers },
      ...(insecure ? { tls: { rejectUnauthorized: false } } : {}),
    });
    const body = await res.text();
    return { ok: true, status: res.status, body, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err.message, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkUrl(label, url, args, expect, wantStatus = 200) {
  let lastErr = '';
  for (let attempt = 1; attempt <= args.retries; attempt++) {
    const r = await fetchOnce(url, args.timeout, args.insecure);
    if (r.ok && r.status === wantStatus) {
      const missing = expect.filter((m) => !r.body.includes(m));
      if (missing.length === 0) {
        console.log(`  PASS  ${label} — ${r.status} in ${r.ms}ms (${r.body.length} bytes)`);
        if (expect.length) console.log(`        markers found: ${expect.join(', ')}`);
        return { pass: true };
      }
      lastErr = `HTTP ${r.status} but missing marker(s): ${missing.join(', ')}`;
    } else if (r.ok) {
      lastErr = `expected HTTP ${wantStatus}, got ${r.status}`;
    } else {
      lastErr = r.error;
    }
    if (attempt < args.retries) {
      const wait = args.backoff * Math.pow(2, attempt - 1);
      console.log(`  WARN  ${label} — attempt ${attempt}/${args.retries} failed (${lastErr}); retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  console.error(`  FAIL  ${label} — ${lastErr}`);
  return { pass: false, reason: lastErr };
}

/**
 * Classify a health probe response. Pure, so the decision can be tested without
 * a network round trip — this is the part that decides whether production is
 * rolled back, which makes it the one thing in here worth pinning.
 *
 *   'pass'    — the health endpoint returned a real, positive verdict
 *   'warn'    — the probe could not obtain a verdict; do NOT fail the pipeline
 *   'fail'    — the endpoint answered with a real, negative verdict
 */
export function classifyHealth(status, body, tokenSupplied) {
  if (status === 200 || status === 204) return { verdict: 'pass' };

  // Fail-closed by design: with no HEALTH_TOKEN on the site, the endpoint
  // refuses to serve the detailed report. The deploy is safe — it just cannot
  // be observed from here yet.
  if (status === 503 && /HEALTH_TOKEN is not configured/i.test(body)) {
    return {
      verdict: 'warn',
      reason: 'HEALTH_TOKEN is not configured on this site — the probe cannot authenticate, so no verdict was obtained',
    };
  }

  // 401 with a token supplied means the secret is present but WRONG (rotated,
  // or the GitHub secret and the site's env have drifted). That is a broken
  // monitor, not a broken site — report loudly, but do not roll back.
  if (status === 401 && tokenSupplied) {
    return {
      verdict: 'warn',
      reason: 'the supplied token was rejected — monitor credential drift (the site is serving, but the probe is not authenticated)',
    };
  }

  // A 401 WITHOUT a token is the expected answer when we deliberately probe an
  // unauthenticated liveness path; treat it as a warning for the same reason.
  if (status === 401) {
    return {
      verdict: 'warn',
      reason: 'unauthenticated health request (no token supplied) — supply HEALTH_TOKEN for a real verdict',
    };
  }

  return { verdict: 'fail', reason: `HTTP ${status}` };
}

/**
 * Build the request headers for the health probe. Exported because the
 * `tokenSupplied` argument above is only meaningful if the token actually
 * reaches the wire — a classify() that correctly excuses a rejected token is
 * useless if the probe never sends one, and the probe would then look
 * "correctly unauthenticated" forever. Keeping this next to classify() makes
 * that coupling testable.
 */
export function healthHeaders(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function checkHealth(base, args) {
  const healthUrl = base + (args.health.startsWith('/') ? args.health : `/${args.health}`);
  const headers = healthHeaders(args.healthToken);

  // The health report itself probes the database, so it is slower than a static
  // fetch and a cold function adds a start-up penalty. Retry like the document
  // check rather than failing on one slow sample.
  let last = '';
  for (let attempt = 1; attempt <= args.retries; attempt++) {
    const r = await fetchOnce(healthUrl, args.timeout, args.insecure, headers);
    if (r.ok) {
      const { verdict, reason } = classifyHealth(r.status, r.body, Boolean(args.healthToken));
      if (verdict === 'pass') {
        console.log(`  PASS  health endpoint — ${r.status} in ${r.ms}ms`);
        const status = extractStatus(r.body);
        if (status) console.log(`        reports status: ${status}`);
        return { pass: true };
      }
      if (verdict === 'warn') {
        console.log(`  WARN  health endpoint — ${r.status}: ${reason}`);
        return { pass: true, warned: true, reason };
      }
      last = reason;
    } else {
      last = r.error;
    }
    if (attempt < args.retries) {
      const wait = args.backoff * Math.pow(2, attempt - 1);
      console.log(`  WARN  health endpoint — attempt ${attempt}/${args.retries} failed (${last}); retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  console.error(`  FAIL  health endpoint — ${last}`);
  return { pass: false, reason: last };
}

function extractStatus(body) {
  try {
    const j = JSON.parse(body);
    return typeof j?.status === 'string' ? j.status : '';
  } catch {
    return '';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.url) {
    console.error('Usage: node scripts/ci/smoke-test.mjs --url <url> [--expect <text>] [--health <path>] [--health-token <token>]');
    process.exit(args.help ? 0 : 2);
  }

  const base = args.url.replace(/\/+$/, '');
  console.log(`Smoke test — ${base}`);
  console.log('-'.repeat(56));

  const results = [];
  results.push(await checkUrl('document', base, args, args.expect, 200));

  if (args.health) {
    results.push(await checkHealth(base, args));
  }

  console.log('-'.repeat(56));
  const failed = results.filter((r) => !r.pass);
  const warned = results.filter((r) => r.pass && r.warned);
  if (failed.length) {
    console.error(`SMOKE TEST FAILED (${failed.length}/${results.length} checks)`);
    for (const f of failed) console.error(`  - ${f.reason}`);
    process.exit(1);
  }
  if (warned.length) {
    console.log(`SMOKE TEST PASSED WITH WARNINGS (${results.length - warned.length}/${results.length} checks verified)`);
    for (const w of warned) console.log(`  ! ${w.reason}`);
    return;
  }
  console.log(`SMOKE TEST PASSED (${results.length}/${results.length} checks)`);
}

// Only run when invoked directly; importing this module (for tests) must not
// execute a smoke test or call process.exit.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (invokedDirectly || process.env.SMOKE_TEST_FORCE_MAIN === '1') {
  main().catch((err) => {
    console.error('smoke-test crashed:', err);
    process.exit(1);
  });
}
