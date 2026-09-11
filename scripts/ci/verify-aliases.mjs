#!/usr/bin/env node
/**
 * verify-aliases.mjs — Prove the legacy function aliases actually resolve.
 *
 * WHY THIS EXISTS
 *   Phase A aliases the legacy catch-all entry points to bridge-links with
 *   `force = true`. That flag is load-bearing: Netlify does NOT shadow existing
 *   content by default, and a deployed function counts as existing content. So
 *   a redirect WITHOUT force silently does nothing — and because the function
 *   still answers, the alias *looks* like it works right up until you delete the
 *   function file, at which point the truth comes out in production.
 *
 *   This script tests the alias itself, before anything is deleted, so the
 *   "deploy → verify → delete" sequence can be followed safely.
 *
 * HOW IT PROBES
 *   Sends a deliberately unknown action. The dispatcher answers NOT_IMPLEMENTED
 *   (HTTP 400) for anything it cannot route, while an unresolved path returns
 *   404. So:
 *     400 + NOT_IMPLEMENTED  => alias resolved, dispatcher reached
 *     404                    => alias did NOT resolve (missing force=true?)
 *   The probe is side-effect free: an unknown action cannot mutate anything.
 *
 * USAGE
 *   BASE_URL=https://your-site.netlify.app node scripts/ci/verify-aliases.mjs
 *   BASE_URL=http://localhost:8888 node scripts/ci/verify-aliases.mjs
 *
 * EXIT CODES
 *   0  every alias resolves
 *   1  at least one alias failed
 *   2  configuration / connectivity problem
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
if (!BASE_URL) {
  console.error('verify-aliases: BASE_URL is required (e.g. BASE_URL=https://site.netlify.app)');
  process.exit(2);
}

const PROBE_ACTION = '__alias_probe__';
const TIMEOUT_MS = 15_000;

/** Pull `from` paths out of the force=true alias block in netlify.toml. */
function aliasesFromConfig() {
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  const blocks = toml.split('[[redirects]]').slice(1);
  const aliases = [];
  for (const b of blocks) {
    const from = b.match(/from\s*=\s*"([^"]+)"/)?.[1];
    const to = b.match(/to\s*=\s*"([^"]+)"/)?.[1];
    const forced = /force\s*=\s*true/.test(b);
    if (!from || !to) continue;
    if (!from.startsWith('/.netlify/functions/')) continue;
    aliases.push({ from, to, forced });
  }
  return aliases;
}

async function probe(path) {
  const url = BASE_URL + path;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: PROBE_ACTION, payload: [], sessionToken: '' }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, json, body: text.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const aliases = aliasesFromConfig();
  if (aliases.length === 0) {
    console.error('verify-aliases: no /.netlify/functions/ aliases found in netlify.toml');
    process.exit(2);
  }

  console.log('');
  console.log(`  base: ${BASE_URL}`);
  console.log(`  probing ${aliases.length} alias(es) with action '${PROBE_ACTION}'`);
  console.log('');

  // Establish the expected shape from the canonical catch-all.
  const canonicalPath = '/.netlify/functions/bridge-links';
  let baseline;
  try {
    baseline = await probe(canonicalPath);
  } catch (e) {
    console.error(`  cannot reach ${canonicalPath}: ${e instanceof Error ? e.message : String(e)}`);
    console.error('  Is the site deployed and BASE_URL correct?');
    process.exit(2);
  }
  console.log(`  baseline ${canonicalPath} -> HTTP ${baseline.status}`);
  if (baseline.status === 404) {
    console.error('  baseline is 404 — bridge-links itself is not deployed. Cannot verify aliases.');
    process.exit(2);
  }
  console.log('');

  const failures = [];
  for (const a of aliases) {
    let r;
    try {
      r = await probe(a.from);
    } catch (e) {
      failures.push(`${a.from}: request failed (${e instanceof Error ? e.message : String(e)})`);
      console.log(`  FAIL  ${a.from.padEnd(46)} network error`);
      continue;
    }

    if (r.status === 404) {
      failures.push(
        `${a.from}: HTTP 404 — alias did not resolve. ` +
          (a.forced
            ? 'Rule has force=true, so check the deploy actually published this netlify.toml.'
            : 'Rule is MISSING force=true, so it cannot shadow the function.'),
      );
      console.log(`  FAIL  ${a.from.padEnd(46)} 404 (not resolved)`);
      continue;
    }

    if (r.status !== baseline.status) {
      failures.push(
        `${a.from}: HTTP ${r.status} but bridge-links returns ${baseline.status} — ` +
          'alias is resolving to something other than the catch-all.',
      );
      console.log(`  WARN  ${a.from.padEnd(46)} ${r.status} (baseline ${baseline.status})`);
      continue;
    }

    console.log(`  ok    ${a.from.padEnd(46)} ${r.status}`);
  }

  console.log('');
  if (failures.length) {
    console.error('  ALIAS VERIFICATION FAILED — do NOT delete the legacy function files yet.');
    for (const f of failures) console.error(`    - ${f}`);
    console.error('');
    process.exit(1);
  }

  console.log('  all aliases resolve.');
  console.log('  Safe to delete the corresponding netlify/functions/*.js files in the next deploy.');
  console.log('');
}

main().catch((e) => {
  console.error('verify-aliases: unexpected error');
  console.error(e);
  process.exit(2);
});
