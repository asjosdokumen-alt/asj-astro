#!/usr/bin/env node
/**
 * verify-migrations.mjs — Pre-deploy database contract gate.
 *
 * WHY THIS EXISTS
 *   The application ships independently of the database. Code that assumes a
 *   missing table or RPC function does NOT throw — PostgREST answers 200 with an
 *   empty result, the UI renders blank, and nothing in the logs says why.
 *
 *   Concretely, on 2026-09-01 this gate caught the following: the TypeScript
 *   fixes for the B5 (job claim) and B6 (rate limit) race conditions call the
 *   RPCs claim_next_job / rate_limit_check / rate_limit_fail. Those functions
 *   had never been created in production, so both call sites caught the error
 *   and silently degraded — the job queue processed nothing, and rate limiting
 *   fell back to per-instance memory, i.e. the vulnerability the fix was written
 *   to close was still live. The migration files sat untracked in git with no
 *   runner. This script turns that class of failure into a red pipeline.
 *
 * HOW IT VERIFIES — and why it refuses to guess
 *   Definitive method: read PostgREST's OpenAPI document, which lists every
 *   exposed table and RPC path. One request, read-only, no side effects.
 *   Supabase restricts that endpoint to the service-role key; the anon key gets
 *   401 "Only the `service_role` API key can be used for this endpoint".
 *
 *   There is NO reliable side-effect-free way to confirm a volatile RPC exists
 *   without OpenAPI. Probing by POSTing to /rpc/<name> cannot distinguish a real
 *   function from a fake one (a malformed body yields an identical 400 for both),
 *   and calling one for real would execute it — POSTing to claim_next_job would
 *   claim a genuine job. So without the service-role key, RPCs are reported as
 *   UNVERIFIED, never as present.
 *
 *   A check that reports success when it could not actually see anything is
 *   worse than no check at all. Unverified required objects therefore FAIL.
 *
 * USAGE
 *   node scripts/ci/verify-migrations.mjs
 *   node scripts/ci/verify-migrations.mjs --warn-only      # report, never block
 *   node scripts/ci/verify-migrations.mjs --json report.json
 *
 * ENV
 *   SUPABASE_URL                 required
 *   SUPABASE_SERVICE_ROLE_KEY    required for a definitive check (server-side
 *                                secret; safe in GitHub Environment secrets)
 *   SUPABASE_ANON_KEY            fallback — verifies tables only, RPCs unverified
 *
 * EXIT CODES
 *   0  contract satisfied and fully verified
 *   1  required object missing, or could not be verified -> DO NOT DEPLOY
 *   2  configuration error (missing URL/key, unreachable, unreadable contract)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyEnvFiles } from '../lib/load-env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(HERE, '..', '..', '.ci', 'db-contract.json');

/** PostgREST's unambiguous "this object is not exposed" code. */
const PGRST_NOT_FOUND = 'PGRST205';

function parseArgs(argv) {
  const args = { warnOnly: false, json: '', timeout: 20000, retries: 3, backoff: 1000, contract: '' };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--warn-only': args.warnOnly = true; break;
      case '--json': args.json = argv[++i]; break;
      case '--timeout': args.timeout = Number(argv[++i]); break;
      case '--retries': args.retries = Number(argv[++i]); break;
      case '--backoff': args.backoff = Number(argv[++i]); break;
      case '--contract': args.contract = argv[++i]; break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, { method = 'GET', headers = {}, body, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { 'user-agent': 'asj-ci-dbcontract/1.0', ...headers },
      body,
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await res.text();
    return { ok: true, status: res.status, text, ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      error: err.name === 'AbortError' ? `timeout after ${timeout}ms` : err.message,
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(fn, retries, backoff) {
  let last;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const r = await fn();
    if (r.ok) return r;
    last = r;
    if (attempt < retries) await sleep(backoff * Math.pow(2, attempt - 1));
  }
  return last;
}

/**
 * Read the OpenAPI document. Returns { paths:Set<string>, degraded:boolean, info }.
 * `paths` is null when OpenAPI is not usable with the credential we hold.
 */
async function fetchOpenApiPaths(base, key, args) {
  const r = await withRetry(
    () =>
      request(`${base}/rest/v1/`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/openapi+json',
        },
        timeout: args.timeout,
      }),
    args.retries,
    args.backoff
  );

  if (!r.ok) return { paths: null, degraded: true, info: { detail: r.error } };
  if (r.status === 200) {
    try {
      const spec = JSON.parse(r.text);
      if (spec && typeof spec.paths === 'object' && spec.paths !== null) {
        const paths = new Set(Object.keys(spec.paths).map((p) => (p.startsWith('/') ? p : `/${p}`)));
        return { paths, degraded: false, info: { detail: `${paths.size} paths in ${r.ms}ms` } };
      }
    } catch {
      return { paths: null, degraded: true, info: { detail: 'OpenAPI response was not valid JSON' } };
    }
  }
  if (r.status === 401 || r.status === 403) {
    return {
      paths: null,
      degraded: true,
      info: { detail: `HTTP ${r.status} — OpenAPI requires the service_role key. ${r.text.slice(0, 160)}` },
    };
  }
  return { paths: null, degraded: true, info: { detail: `HTTP ${r.status} ${r.text.slice(0, 120)}` } };
}

/**
 * Per-table fallback probe. Reliable: a limit=0 read returns 200 when the table
 * is exposed and 404/PGRST205 when it is not. Never mutates.
 */
async function probeTable(base, key, table, args) {
  const r = await withRetry(
    () =>
      request(`${base}/rest/v1/${encodeURIComponent(table)}?select=*&limit=0`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
        timeout: args.timeout,
      }),
    args.retries,
    args.backoff
  );
  if (!r.ok) return { state: 'unknown', detail: r.error };
  if (r.status === 200) return { state: 'present', detail: `HTTP 200 in ${r.ms}ms` };
  if (r.status === 404) {
    const missing = r.text.includes(PGRST_NOT_FOUND) || r.text.length < 400;
    return { state: missing ? 'missing' : 'unknown', detail: `HTTP 404 ${r.text.slice(0, 120)}` };
  }
  // RLS can answer 401/403 for a table that does exist — do not call that missing.
  return { state: 'unknown', detail: `HTTP ${r.status} ${r.text.slice(0, 120)}` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`Usage: node scripts/ci/verify-migrations.mjs [--warn-only] [--json <file>]

Checks the target Supabase database against .ci/db-contract.json before deploy.
Requires SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY for full verification.`);
    return process.exit(0);
  }

  // Populate SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY from
  // .env.local / .env.lokal / .env when the caller has not already set them.
  // process.env always wins (applyEnvFiles never overwrites), so CI — which
  // supplies these from the GitHub Environment — is unaffected.
  //
  // This gate previously read process.env only, so it failed closed with
  // "SUPABASE_URL is not set" on a machine where the value was sitting in
  // .env.local the whole time. migrate.mjs and db-baseline.mjs already load the
  // files; this was the odd one out, and it made the pre-deploy contract check
  // unrunnable outside CI.
  applyEnvFiles();

  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  console.log('Database contract gate');
  console.log('-'.repeat(56));

  if (!base) {
    console.error('  CONFIG ERROR  SUPABASE_URL is not set. Failing closed — nothing was checked.');
    return process.exit(2);
  }
  const key = serviceKey || anonKey;
  if (!key) {
    console.error('  CONFIG ERROR  neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is set.');
    console.error('  Failing closed — nothing was checked.');
    return process.exit(2);
  }

  // Never echo a key. Show only which one, and its length.
  const keyLabel = serviceKey ? 'service_role' : 'anon (degraded: cannot verify RPC)';
  console.log(`  target : ${base}`);
  console.log(`  auth   : ${keyLabel} key, ${key.length} chars (value never printed)`);

  let contract;
  try {
    contract = JSON.parse(readFileSync(args.contract || CONTRACT_PATH, 'utf8'));
  } catch (err) {
    console.error(`  CONFIG ERROR  cannot read db contract: ${err.message}`);
    return process.exit(2);
  }

  const tables = contract.tables || {};
  const rpcs = contract.rpc || {};

  const openapi = await fetchOpenApiPaths(base, key, args);
  const definitive = openapi.paths instanceof Set;
  console.log(
    `  method : ${definitive ? `OpenAPI document (${openapi.info.detail})` : `degraded — ${openapi.info.detail}`}`
  );
  console.log('-'.repeat(56));

  const results = [];

  for (const [name, meta] of Object.entries(tables)) {
    let state;
    let detail;
    if (definitive) {
      const present = openapi.paths.has(`/${name}`);
      state = present ? 'present' : 'missing';
      detail = present ? 'exposed' : 'absent from OpenAPI paths';
    } else {
      const p = await probeTable(base, key, name, args);
      state = p.state;
      detail = p.detail;
    }
    results.push({ kind: 'table', name, severity: meta.severity || 'required', state, detail, note: meta.note });
  }

  for (const [name, meta] of Object.entries(rpcs)) {
    // Without OpenAPI there is no safe way to confirm a volatile function exists,
    // so we report unverified rather than guessing "present".
    const state = definitive ? (openapi.paths.has(`/rpc/${name}`) ? 'present' : 'missing') : 'unknown';
    const detail = definitive
      ? state === 'present'
        ? 'exposed'
        : 'absent from OpenAPI paths'
      : 'unverified — needs SUPABASE_SERVICE_ROLE_KEY';
    results.push({
      kind: 'rpc',
      name,
      severity: meta.severity || 'required',
      state,
      detail,
      note: meta.note,
      migration: meta.migration,
    });
  }

  for (const r of results) {
    const label = `${r.kind === 'rpc' ? 'fn  ' : 'tbl '} ${r.name}`.padEnd(28);
    if (r.state === 'present') console.log(`  OK    ${label} ${r.severity}`);
    else if (r.state === 'missing') console.log(`  MISS  ${label} ${r.severity}  ${r.detail}`);
    else console.log(`  ???   ${label} ${r.severity}  ${r.detail}`);
  }

  const missingRequired = results.filter((r) => r.state === 'missing' && r.severity === 'required');
  const missingOptional = results.filter((r) => r.state === 'missing' && r.severity === 'optional');
  const unknownRequired = results.filter((r) => r.state === 'unknown' && r.severity === 'required');
  const unknownOptional = results.filter((r) => r.state === 'unknown' && r.severity === 'optional');
  const verified = results.filter((r) => r.state === 'present');

  console.log('-'.repeat(56));
  console.log(
    `  tables ${Object.keys(tables).length} · rpc ${Object.keys(rpcs).length} · ` +
      `missing ${missingRequired.length} required / ${missingOptional.length} optional · ` +
      `unverified ${unknownRequired.length} required / ${unknownOptional.length} optional`
  );

  // Total blindness means the check never ran. Never let that look like a pass.
  if (verified.length === 0) {
    console.error('');
    console.error('  UNVERIFIABLE — not a single object could be confirmed present.');
    console.error('  The database may be unreachable, the URL wrong, or the key rejected.');
    console.error('  Refusing to deploy on the strength of a check that never ran.');
    console.error('  Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the GitHub Environment.');
    return process.exit(2);
  }

  if (missingRequired.length) {
    console.log('');
    console.log('  The database is NOT migrated to match this commit. Apply before deploying:');
    for (const r of missingRequired) {
      console.log(`    ${r.name}`);
      if (r.migration) console.log(`        migration: ${r.migration}`);
      if (r.note) console.log(`        impact   : ${r.note}`);
    }
  }

  if (unknownRequired.length) {
    console.log('');
    console.log('  Required objects that could NOT be verified (treated as failure):');
    for (const r of unknownRequired) console.log(`    ${r.name}: ${r.detail}`);
    console.log('  Set SUPABASE_SERVICE_ROLE_KEY in the GitHub Environment to verify them.');
  }

  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ target: base, definitive, results }, null, 2));
    console.log(`\n  report written to ${args.json}`);
  }

  if (missingRequired.length || unknownRequired.length) {
    if (args.warnOnly) {
      console.log('DATABASE CONTRACT VIOLATED — warn-only mode, NOT blocking');
      return process.exit(0);
    }
    console.error('DATABASE CONTRACT FAILED — deploy blocked.');
    console.error('  Deploying would ship code that silently degrades against missing tables/functions.');
    return process.exit(1);
  }

  console.log(args.warnOnly ? 'DATABASE CONTRACT OK (warn-only mode)' : 'DATABASE CONTRACT OK');
  return process.exit(0);
}

main().catch((err) => {
  console.error('verify-migrations crashed:', err);
  process.exit(1);
});
