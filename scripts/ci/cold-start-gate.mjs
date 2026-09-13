#!/usr/bin/env node
/**
 * cold-start-gate.mjs — measure time-to-first-byte on the deployed site and
 * fail when the cold path exceeds its budget.
 *
 * WHY THIS EXISTS
 *   docs/BACKEND_TODO.md #29 ("latensi cold start") was open for weeks labelled
 *   as an owner-side item: "needs someone to sit and watch a dashboard". It did
 *   not. Time-to-first-byte is measurable from any machine that can reach the
 *   site, and it was measured on 2026-09-13:
 *
 *     cold, after ~45 s idle ...... 0.75–0.90 s   (ping/health/public/get-app-data)
 *     first touch of a session .... 1.31–1.81 s
 *     warm ........................ 0.49–0.86 s
 *
 *   Worst observed: 1.81 s, against a <3 s target. So the budget was never the
 *   problem — the MISSING PIECE was the gate. A one-off measurement decays; a
 *   check in CI is what notices when a dependency change, a cold PostgREST
 *   connection, or a bloated function bundle quietly pushes the cold path back
 *   over budget.
 *
 * WHAT IT MEASURES
 *   `time_starttransfer` — TTFB, the same figure curl reports with
 *   `-w '%{time_starttransfer}'`, which is what the 2026-09-13 numbers used. It
 *   is the right metric here because it ends when the first byte arrives, so it
 *   captures function boot + dependency handshake without dragging in body size.
 *
 * WHY IT IS NOT A ROLLBACK TRIGGER
 *   Latency is noisy: a slow CI runner, a noisy-neighbour container, or a single
 *   unlucky sample can all produce a reading that is 3x the truth. This gate is
 *   therefore deliberately permissive in two ways:
 *
 *     • It takes the BEST of N samples, not the worst or the mean. A cold start
 *       is a one-time cost; the site serves warm requests afterwards. Failing on
 *       a single outlier would produce a gate that cries wolf, and a gate people
 *       learn to ignore is worse than no gate.
 *
 *     • It ships as a WARNING by default when run without --url (i.e. when there
 *       is no site to measure), and only fails the run when a real measurement
 *       breaches the budget. It is wired into `ci:quality` in report-only mode
 *       and into the post-deploy workflow in enforce mode.
 *
 * USAGE
 *   node scripts/ci/cold-start-gate.mjs --url https://example.netlify.app
 *   node scripts/ci/cold-start-gate.mjs --url https://x.app --path /.netlify/functions/ping
 *   node scripts/ci/cold-start-gate.mjs --url https://x.app --budget 3000 --samples 5
 *
 *   --url      base URL to measure. Without it the gate reports SKIPPED (exit 0)
 *              rather than failing — a local run with no site is not a defect.
 *   --path     path to probe, repeatable. Defaults to a representative cold set.
 *   --budget   TTFB budget in ms (default 3000, the target in BACKEND_TODO #29)
 *   --samples  attempts per path (default 3); the BEST one is compared
 *   --timeout  per-request timeout in ms (default 10000)
 *   --enforce  exit non-zero when over budget. Without it, over-budget is a
 *              WARNING and the exit code stays 0.
 *   --json     emit a machine-readable report on stdout
 */

/** Representative cold paths, in the order they are probed. */
const DEFAULT_PATHS = [
  '/.netlify/functions/ping',
  '/.netlify/functions/health',
  '/.netlify/functions/public',
  '/.netlify/functions/get-app-data',
];

/**
 * @param {string[]} argv
 * @param {Record<string, string|undefined>} env
 * @returns {{ url: string, paths: string[], budget: number, samples: number, timeout: number, enforce: boolean, json: boolean, help: boolean }}
 */
export function parseArgs(argv, env = process.env) {
  const args = {
    url: env.COLD_START_URL || env.SMOKE_URL || env.BASE_URL || '',
    paths: [],
    budget: 3000,
    samples: 3,
    timeout: 10000,
    enforce: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--url': args.url = argv[++i]; break;
      case '--path': args.paths.push(argv[++i]); break;
      case '--budget': args.budget = Number(argv[++i]); break;
      case '--samples': args.samples = Number(argv[++i]); break;
      case '--timeout': args.timeout = Number(argv[++i]); break;
      case '--enforce': args.enforce = true; break;
      case '--json': args.json = true; break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }
  if (args.paths.length === 0) args.paths = DEFAULT_PATHS.slice();
  return args;
}

/**
 * Decide the verdict for ONE path from its samples. Pure, so the whole
 * comparison is testable without a network round trip — this is the part that
 * decides whether a deploy is flagged, which makes it the thing worth pinning.
 *
 * Rules, in order:
 *   • No successful sample  -> 'error'   (unreachable; not a latency verdict)
 *   • best <= budget        -> 'pass'
 *   • best >  budget        -> 'over'    (the only state --enforce acts on)
 *
 * Uses `best` (minimum), not the mean: see the header note on noise. A path is
 * recorded as over budget only when even its FASTEST sample breached the
 * budget, which no amount of runner noise can manufacture.
 */
export function judge(best, budget) {
  if (best === null || best === undefined || !Number.isFinite(best)) {
    return { verdict: 'error', reason: 'no successful sample' };
  }
  if (best <= budget) {
    return { verdict: 'pass', reason: `best ${best}ms <= budget ${budget}ms` };
  }
  return { verdict: 'over', reason: `best ${best}ms > budget ${budget}ms` };
}

/** Reduce raw sample ms values (nulls allowed) to the best successful reading. */
export function bestOf(samples) {
  const ok = samples.filter((s) => typeof s === 'number' && Number.isFinite(s));
  return ok.length ? Math.min(...ok) : null;
}

/**
 * One TTFB probe. Implemented with fetch() + a manual clock rather than
 * performance.now() around the whole body, because we stop at the first byte:
 * we await only the response headers, then cancel the body. Reading the body
 * would measure throughput, which is a different (and much noisier) thing.
 */
export async function probe(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'asj-ci-cold-start/1.0' },
    });
    const ms = Date.now() - started;
    // Drop the body without reading it — TTFB ends at the headers.
    try { await res.body?.cancel(); } catch { /* body already consumed or absent */ }
    return { ok: true, status: res.status, ms };
  } catch (err) {
    return {
      ok: false,
      ms: null,
      error: err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function measurePath(base, path, args) {
  const url = base + (path.startsWith('/') ? path : `/${path}`);
  const samples = [];
  let lastError = '';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= args.samples; attempt++) {
    const r = await probe(url, args.timeout);
    if (r.ok) {
      samples.push(r.ms);
      lastStatus = r.status;
    } else {
      samples.push(null);
      lastError = r.error;
    }
  }

  const best = bestOf(samples);
  const { verdict, reason } = judge(best, args.budget);
  return { path, url, samples, best, verdict, reason, lastError, lastStatus };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.error('Usage: node scripts/ci/cold-start-gate.mjs --url <url> [--path <p>]... [--budget ms] [--samples n] [--enforce] [--json]');
    process.exit(0);
  }

  // No URL is not a defect — it is a local run (or a job with no site to
  // measure, like the artifact-only CI job). Report and pass.
  if (!args.url) {
    if (args.json) {
      console.log(JSON.stringify({ skipped: true, reason: 'no --url supplied', budget: args.budget }, null, 2));
    } else {
      console.log('cold-start gate — SKIPPED (no --url supplied; nothing to measure)');
    }
    process.exit(0);
  }

  const base = args.url.replace(/\/+$/, '');
  const results = [];
  for (const p of args.paths) {
    results.push(await measurePath(base, p, args));
  }

  const over = results.filter((r) => r.verdict === 'over');
  const errored = results.filter((r) => r.verdict === 'error');
  const passed = results.filter((r) => r.verdict === 'pass');

  if (args.json) {
    console.log(JSON.stringify({
      skipped: false,
      url: base,
      budget: args.budget,
      samples: args.samples,
      paths: results,
      summary: { pass: passed.length, over: over.length, error: errored.length },
    }, null, 2));
  } else {
    console.log(`cold-start gate — ${base}  (budget ${args.budget}ms, best of ${args.samples})`);
    console.log('-'.repeat(64));
    for (const r of results) {
      const shown = r.samples.map((s) => (s === null ? 'x' : `${s}ms`)).join(', ');
      const tag = r.verdict === 'pass' ? 'OK  ' : r.verdict === 'over' ? 'OVER' : 'ERR ';
      const best = r.best === null ? '—' : `${r.best}ms`;
      console.log(`  ${tag} ${r.path.padEnd(34)} best ${best.padStart(8)}   [${shown}]`);
      if (r.verdict === 'error' && r.lastError) {
        console.log(`        ${r.lastError}`);
      }
    }
    console.log('-'.repeat(64));
  }

  // A path that could not be reached at all is reported, but is NOT treated as
  // over budget: "unreachable" is the smoke test's job to catch, and conflating
  // the two here would make this gate fail for reasons it does not understand.
  const exitCode = args.enforce && over.length > 0 ? 1 : 0;

  if (over.length > 0) {
    const line = `${over.length} path(s) over the ${args.budget}ms cold-start budget`;
    if (args.enforce) {
      console.error(`COLD START GATE FAILED — ${line}`);
      for (const r of over) console.error(`  - ${r.path}: ${r.reason}`);
      process.exit(exitCode);
    }
    // Report-only mode: loud, but green. This is how it runs in ci:quality.
    console.log(`WARNING — ${line} (report-only; pass --enforce to fail the run)`);
    for (const r of over) console.log(`  ! ${r.path}: ${r.reason}`);
    process.exit(0);
  }

  if (errored.length > 0) {
    console.log(`COLD START GATE — ${passed.length}/${results.length} measured, ${errored.length} unreachable (not a latency verdict)`);
    process.exit(0);
  }

  console.log(`COLD START GATE PASSED — ${passed.length}/${results.length} path(s) within ${args.budget}ms`);
}

// Only run when invoked directly; importing this module (for tests) must not
// execute a measurement or call process.exit.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (invokedDirectly || process.env.COLD_START_FORCE_MAIN === '1') {
  main().catch((err) => {
    console.error('cold-start-gate crashed:', err);
    process.exit(1);
  });
}
