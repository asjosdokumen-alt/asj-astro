#!/usr/bin/env node
/**
 * bundle-size.mjs — Per-entry-point bundle size gate (Phase A).
 *
 * WHY THIS EXISTS
 *   Netlify bundles every file in netlify/functions/ with esbuild as a separate
 *   entry point. If an entry point's static import graph reaches the whole
 *   action registry, then every request — including `ping` — pays to download
 *   and parse code it will never execute. That cost lands on cold start, which
 *   is the only latency a user actually notices.
 *
 *   This script reproduces Netlify's bundling locally (same bundler, same
 *   options) so the cost is visible in CI instead of in production.
 *
 * WHAT IT MEASURES
 *   For each netlify/functions/*.js entry point: minified bundle bytes.
 *   Reports the total deployed code size and flags any entry over budget.
 *
 * RATCHET MODE
 *   With --update-baseline, writes scripts/ci/bundle-size-baseline.json.
 *   Without it, fails if any entry grew more than --tolerance (default 5%)
 *   above its baseline, or exceeds --max-entry KB. This is what stops the
 *   refactor from silently regressing.
 *
 * USAGE
 *   node scripts/ci/bundle-size.mjs
 *   node scripts/ci/bundle-size.mjs --update-baseline
 *   node scripts/ci/bundle-size.mjs --json > report.json
 *
 * EXIT CODES
 *   0  within budget
 *   1  budget exceeded or ratchet regressed
 *   2  bundling error
 */

import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FN_DIR = join(ROOT, 'netlify/functions');
const BASELINE_PATH = join(HERE, 'bundle-size-baseline.json');

const args = process.argv.slice(2);
const UPDATE_BASELINE = args.includes('--update-baseline');
const JSON_OUT = args.includes('--json');
const EXPLAIN = args.find((a) => a.startsWith('--why'));
const EXPLAIN_ENTRY = EXPLAIN && EXPLAIN.includes('=') ? EXPLAIN.split('=')[1] : null;
// Per-entry ceiling: 600 KB.
// Derived, not guessed. A narrow entry point that accidentally reaches the
// router measures ~690 KB, because Netlify inlines all 15 surfaces and 14
// contexts into it. So 600 KB catches exactly that regression — the one this
// gate exists to prevent — while leaving headroom for legitimately heavy
// surfaces. files.js (539.9 KB) is the current heaviest: it hosts the docs
// surface, which bundles the ZIP writer (archiver + four readable-stream
// copies) and the master-data context.
const MAX_ENTRY_KB = numArg('--max-entry', 600);
// Coarse ceiling at the measured total. The ratchet baseline below is what
// actually holds the line. Target once the 12 legacy catch-alls are retired is
// ~2 MB — see docs/PHASE_A_LEGACY_ENDPOINT_RETIREMENT.md.
const MAX_TOTAL_KB = numArg('--max-total', 10240);
const TOLERANCE = numArg('--tolerance', 0.05);

function numArg(flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1 || i === args.length - 1) return fallback;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

/** Entry points Netlify will deploy: top-level .js files, excluding _lib/. */
function entryPoints() {
  return readdirSync(FN_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.js'))
    .map((d) => d.name)
    .sort();
}

/** Bundle one entry point the way Netlify does, return minified byte length. */
async function measure(entry) {
  const result = await build({
    entryPoints: [join(FN_DIR, entry)],
    bundle: true,
    minify: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
    // .ts first so `require('./_lib/netlify-wrapper')` resolves to the TS source,
    // matching how the repo is written.
    resolveExtensions: ['.ts', '.js', '.mjs', '.json'],
    // Bundled by Netlify from node_modules; keep them external so we measure
    // OUR code growth, not third-party drift.
    external: [],
    metafile: true,
  });
  const bytes = result.outputFiles.reduce((n, f) => n + f.contents.length, 0);
  // Largest input in the graph — tells you WHY a bundle is big.
  const inputs = Object.entries(result.metafile.outputs)
    .flatMap(([, o]) => Object.entries(o.inputs))
    .reduce((acc, [p, v]) => {
      acc[p] = (acc[p] ?? 0) + v.bytesInOutput;
      return acc;
    }, {});
  const top = Object.entries(inputs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([p, b]) => ({ path: p.replace(/^.*netlify\/functions\//, ''), kb: Math.round(b / 1024) }));
  return { bytes, top };
}

async function main() {
  const entries = entryPoints();
  if (entries.length === 0) {
    console.error('bundle-size: no entry points found in netlify/functions');
    process.exit(2);
  }

  const results = [];
  for (const entry of entries) {
    try {
      const { bytes, top } = await measure(entry);
      results.push({ entry, bytes, kb: +(bytes / 1024).toFixed(1), top });
    } catch (err) {
      console.error(`bundle-size: failed to bundle ${entry}`);
      console.error(String(err).split('\n').slice(0, 6).join('\n'));
      process.exit(2);
    }
  }

  const totalBytes = results.reduce((n, r) => n + r.bytes, 0);
  const totalKb = +(totalBytes / 1024).toFixed(1);
  const largest = results.reduce((a, b) => (b.bytes > a.bytes ? b : a));

  if (JSON_OUT) {
    console.log(JSON.stringify({ totalKb, count: results.length, results }, null, 2));
    return;
  }

  console.log('');
  console.log(`  entry point                          minified`);
  console.log(`  ${'-'.repeat(52)}`);
  for (const r of results) {
    const flag = r.kb > MAX_ENTRY_KB ? '  OVER' : '';
    console.log(`  ${r.entry.padEnd(34)} ${String(r.kb + ' KB').padStart(10)}${flag}`);
  }
  console.log(`  ${'-'.repeat(52)}`);
  console.log(`  ${'TOTAL'.padEnd(34)} ${String(totalKb + ' KB').padStart(10)}  (${results.length} entry points)`);
  console.log('');
  // `--why[=entry]` explains where the weight comes from. Without it, only the
  // largest entry's top modules are shown — enough to spot a regression.
  const explainTarget = EXPLAIN
    ? EXPLAIN_ENTRY
      ? results.find((r) => r.entry === EXPLAIN_ENTRY || r.entry.startsWith(EXPLAIN_ENTRY))
      : largest
    : largest;
  if (explainTarget) {
    const depth = EXPLAIN ? explainTarget.top.length : 3;
    console.log(`  heaviest modules in ${explainTarget.entry} (${explainTarget.kb} KB):`);
    for (const t of explainTarget.top.slice(0, depth)) {
      console.log(`     ${String(t.kb + ' KB').padStart(8)}  ${t.path}`);
    }
  }
  console.log('');

  const failures = [];

  // ── Catch-all exemption ──────────────────────────────────────────────────
  // bridge-links (and any entry still using makeHandler()) legitimately owns the
  // full action router, so it is expected to be large. It is exempt from the
  // per-entry budget — but never from the total, and it is always reported, so
  // its cost stays visible instead of becoming invisible.
  //
  // The invariant this encodes: an entry point may only be large if it is a
  // DECLARED catch-all. Everything else must stay narrow.
  const isCatchAll = (entry) => {
    try {
      return /exports\.handler\s*=\s*makeHandler\(/.test(readFileSync(join(FN_DIR, entry), 'utf8'));
    } catch {
      return false;
    }
  };

  const overBudget = results.filter((r) => r.kb > MAX_ENTRY_KB);
  const overEntry = overBudget.filter((r) => !isCatchAll(r.entry));
  const exempt = overBudget.filter((r) => isCatchAll(r.entry));

  if (exempt.length) {
    console.log(`  exempt (declared catch-all): ${exempt.map((r) => `${r.entry} ${r.kb} KB`).join(', ')}`);
    console.log('');
  }

  if (overEntry.length) {
    failures.push(
      `${overEntry.length} non-catch-all entry point(s) exceed ${MAX_ENTRY_KB} KB: ` +
        overEntry.map((r) => `${r.entry} (${r.kb} KB)`).join(', ') +
        '\n      Narrow entry points must use makeSurfaceHandler(<MAP>, [...]) so they do not reach the router.',
    );
  }
  if (totalKb > MAX_TOTAL_KB) {
    failures.push(
      `total deployed code ${totalKb} KB exceeds ${MAX_TOTAL_KB} KB` +
        `\n      Largest contributors: ${results
          .slice()
          .sort((a, b) => b.kb - a.kb)
          .slice(0, 5)
          .map((r) => `${r.entry} ${r.kb} KB`)
          .join(', ')}`,
    );
  }

  // Ratchet check
  if (UPDATE_BASELINE) {
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          totalKb,
          count: results.length,
          entries: Object.fromEntries(results.map((r) => [r.entry, r.kb])),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`  baseline written: ${BASELINE_PATH.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
    console.log('');
  } else if (existsSync(BASELINE_PATH)) {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    const regressed = [];
    for (const r of results) {
      const was = baseline.entries?.[r.entry];
      if (typeof was !== 'number') continue;
      if (r.kb > was * (1 + TOLERANCE)) {
        regressed.push(`${r.entry}: ${was} KB -> ${r.kb} KB (+${(((r.kb - was) / was) * 100).toFixed(0)}%)`);
      }
    }
    if (regressed.length) {
      failures.push(`bundle size regressed beyond ${(TOLERANCE * 100).toFixed(0)}%:\n      ` + regressed.join('\n      '));
    }
  }

  if (failures.length) {
    console.error('  BUNDLE SIZE GATE FAILED');
    for (const f of failures) console.error(`    - ${f}`);
    console.error('');
    process.exit(1);
  }

  console.log('  bundle size gate: pass');
  console.log('');
}

main().catch((err) => {
  console.error('bundle-size: unexpected error');
  console.error(err);
  process.exit(2);
});
