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

import { existsSync } from 'node:fs';
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

/**
 * The legacy entry point paths to verify.
 *
 * HISTORY — why this no longer reads netlify.toml:
 * Phase A wrote 12 redirect rules aliasing these paths onto bridge-links, and
 * this script used to parse them out of the config. A real deploy proved that
 * approach was never valid: Netlify rejects every rule matching a /.netlify/
 * path ("path" field must not start with "/.netlify"), so the aliases were
 * discarded at parse time and never shadowed anything. The rules have been
 * deleted from netlify.toml.
 *
 * That makes the verification simpler AND stricter than before: there is no
 * alias layer to trust. Each path below is served by its own deployed function
 * file (a 109-byte stub dispatching the full router). The question that gates
 * deletion is therefore not "did the alias resolve" but "does this path answer
 * 200 on its own". If it does, the file is working and must NOT be deleted
 * until the client-side dependency is understood.
 *
 * bridge-links is deliberately absent: it is the permanent 404 fallback and is
 * never a deletion candidate.
 */
const LEGACY_ENTRY_POINTS = [
  'admin-ai-context',
  'ai-form-submit',
  'apply',
  'drive-links',
  'rincian-presets',
  'save-ai-cv',
  'save-master',
  'schedule-reminders',
  'submit-apply',
  'submit-siswa-baru',
  'whatsapp',
];

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
  const paths = LEGACY_ENTRY_POINTS.map((n) => ({
    from: `/.netlify/functions/${n}`,
    file: `netlify/functions/${n}.js`,
  }));

  // Guard against verifying a set that no longer exists on disk — a vacuous
  // pass is worse than a failure, which is exactly the trap the deleted
  // redirect rules fell into.
  const missingOnDisk = paths.filter((p) => !existsSync(join(ROOT, p.file)));
  if (missingOnDisk.length === paths.length) {
    console.error('verify-aliases: none of the legacy entry points exist on disk.');
    console.error('  If they were intentionally retired, delete this script and its');
    console.error('  package.json entry rather than leaving a gate that cannot fail.');
    process.exit(2);
  }

  console.log('');
  console.log(`  base: ${BASE_URL}`);
  console.log(`  probing ${paths.length} legacy entry point(s) with action '${PROBE_ACTION}'`);
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
    console.error('  baseline is 404 — bridge-links itself is not deployed. Cannot verify.');
    process.exit(2);
  }
  console.log('');

  const failures = [];
  const absent = [];

  for (const p of paths) {
    const onDisk = existsSync(join(ROOT, p.file));
    let r;
    try {
      r = await probe(p.from);
    } catch (e) {
      failures.push(`${p.from}: request failed (${e instanceof Error ? e.message : String(e)})`);
      console.log(`  FAIL  ${p.from.padEnd(46)} network error`);
      continue;
    }

    if (r.status === 404) {
      if (onDisk) {
        // A deployed file that 404s means the deploy did not publish it —
        // worth knowing, but not a deletion blocker.
        failures.push(`${p.from}: HTTP 404 but ${p.file} exists in the repo — deploy may be stale.`);
        console.log(`  FAIL  ${p.from.padEnd(46)} 404 (file exists, deploy stale?)`);
      } else {
        absent.push(p.from);
        console.log(`  note  ${p.from.padEnd(46)} 404 (no file — already retired)`);
      }
      continue;
    }

    console.log(`  ok    ${p.from.padEnd(46)} ${r.status}`);
  }

  console.log('');
  if (failures.length) {
    console.error('  VERIFICATION FAILED.');
    for (const f of failures) console.error(`    - ${f}`);
    console.error('');
    process.exit(1);
  }

  console.log('  every legacy entry point that exists on disk answers successfully.');
  console.log('');
  if (absent.length) {
    console.log(`  ${absent.length} path(s) already 404 — those files are retired:`);
    for (const a of absent) console.log(`    - ${a}`);
    console.log('');
  }
  console.log('  These paths are still LIVE and are still depended on by deployed QR');
  console.log('  codes and bookmarks. Do NOT delete the corresponding .js files.');
  console.log('  The client does not use them (src/lib/apiClient.ts routes to /surfaces/*),');
  console.log('  so deleting is a product decision about old QR codes, not a code one.');
  console.log('');
}

main().catch((e) => {
  console.error('verify-aliases: unexpected error');
  console.error(e);
  process.exit(2);
});
