#!/usr/bin/env node
/**
 * verify-rls.mjs — Phase D gate: the public anon key must not read a table.
 *
 * WHY THIS EXISTS
 *   `PUBLIC_SUPABASE_ANON_KEY` is shipped to the browser. It is not a secret, so
 *   the only thing between it and the data is Row Level Security plus the table
 *   GRANTs. On 2026-09-12 an audit found that arrangement was half-built:
 *
 *     · 5 of 25 tables had RLS switched OFF — job_queue (which is where session
 *       tokens used to live), rate_counters (resetting it defeats rate limiting),
 *       idempotency_keys, dependency_calls, schema_migrations;
 *     · all 25 tables granted anon and authenticated the full DML set, including
 *       TRUNCATE;
 *     · fcm_tokens carried a policy named "Service role full access" that was
 *       actually created TO PUBLIC with USING (true).
 *
 *   migrations/012_rls_lockdown.sql closes that. This gate keeps it closed —
 *   a new table created without RLS would otherwise reopen the hole silently,
 *   which is exactly how the five above got there.
 *
 * TWO MODES, AND WHY THE WEAKER ONE IS NOT ALLOWED TO LOOK LIKE A PASS
 *   DEFINITIVE (SUPABASE_DB_URL or DATABASE_URL present)
 *     Reads the catalog: `relrowsecurity` for every table in `public`, the
 *     privileges held by anon/authenticated, and whether any policy is granted
 *     to a public role with a true qualifier. Decisive, read-only, no writes.
 *
 *   PROBE (no database URL — the CI deploy environment only has the anon and
 *   service keys)
 *     Asks PostgREST, with the *anon* key, for one row from every exposed table.
 *     A row coming back is a proven leak and fails the build. No row coming back
 *     proves nothing about an empty table, so this mode reports DEGRADED rather
 *     than claiming the invariant holds. A check that reports success when it
 *     could not see anything is worse than no check.
 *
 * USAGE
 *   node scripts/ci/verify-rls.mjs
 *   node scripts/ci/verify-rls.mjs --warn-only
 *   node scripts/ci/verify-rls.mjs --json report.json
 *
 * ENV
 *   SUPABASE_URL                     required
 *   SUPABASE_DB_URL | DATABASE_URL   enables the definitive mode
 *   SUPABASE_ANON_KEY                required for the probe mode
 *
 * EXIT CODES
 *   0  invariant holds (definitive), or probe found no leak (possibly degraded)
 *   1  invariant violated — a leak was proven
 *   2  configuration error — nothing could be checked at all
 */

import { writeFileSync } from 'node:fs';
import { applyEnvFiles, initDbEnv } from '../lib/load-env.mjs';

function parseArgs(argv) {
  const args = { warnOnly: false, json: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--warn-only') args.warnOnly = true;
    else if (argv[i] === '--json') args.json = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

/**
 * Tables the browser is allowed to reach with the anon key, and why.
 * `database_candidate`, `master_database_candidate` and `database_asj_form`
 * carry `own_wa` policies that filter every row against the `wa` claim of the
 * caller's JWT. With no JWT that claim is absent, so anon matches nothing —
 * verified, not assumed. They are listed here so that "readable by anon" and
 * "returns a row to anon" are not confused: the probe still requires 0 rows.
 */
const CANDIDATE_FACING = new Set([
  'database_candidate',
  'master_database_candidate',
  'database_asj_form',
]);

async function definitive(args) {
  const pg = (await import('pg')).default;
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const problems = [];
  try {
    const tables = (
      await client.query(
        `select c.relname as name, c.relrowsecurity as rls
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'
          order by c.relname`,
      )
    ).rows;

    if (tables.length === 0) {
      return { mode: 'definitive', ok: false, fatal: 'no tables found in schema public' };
    }
    for (const t of tables) {
      if (!t.rls) problems.push(`RLS is disabled on public.${t.name}`);
    }

    const truncate = (
      await client.query(
        `select table_name, grantee
           from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee in ('anon', 'authenticated')
            and privilege_type = 'TRUNCATE'
          order by table_name, grantee`,
      )
    ).rows;
    for (const g of truncate) {
      problems.push(`anon/authenticated hold TRUNCATE on public.${g.table_name}`);
    }

    const broad = (
      await client.query(
        `select p.polname as policy, c.relname as tbl, p.polcmd as cmd
           from pg_policy p
           join pg_class c on c.oid = p.polrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and p.polqual is null
            and p.polroles = array[0::oid]
          order by c.relname, p.polname`,
      )
    ).rows;
    for (const p of broad) {
      problems.push(`policy "${p.policy}" on public.${p.tbl} is granted to PUBLIC with USING (true)`);
    }

    const reachable = (
      await client.query(
        `select g.table_name, string_agg(g.privilege_type, ',' order by g.privilege_type) as privs
           from information_schema.role_table_grants g
          where g.table_schema = 'public' and g.grantee = 'anon'
          group by g.table_name
          order by g.table_name`,
      )
    ).rows;
    const unexpected = reachable.filter((r) => !CANDIDATE_FACING.has(r.table_name));
    for (const r of unexpected) {
      problems.push(`anon still holds [${r.privs}] on public.${r.table_name}`);
    }

    return {
      mode: 'definitive',
      ok: problems.length === 0,
      tables: tables.length,
      anonReachable: reachable.map((r) => r.table_name),
      problems,
    };
  } finally {
    await client.end();
  }
}

/** Ask PostgREST, as anon, for one row from every table the service key can see. */
async function probe(base, serviceKey, anonKey) {
  const specRes = await fetch(`${base}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/openapi+json' },
  });
  if (!specRes.ok) {
    return { mode: 'probe', ok: false, fatal: `cannot read the schema (HTTP ${specRes.status})` };
  }
  const spec = await specRes.json();
  const tables = Object.keys(spec.paths || {})
    .filter((p) => !p.startsWith('/rpc/'))
    .map((p) => p.replace(/^\//, ''))
    .filter(Boolean);

  const leaks = [];
  const unknown = [];
  for (const table of tables) {
    const res = await fetch(`${base}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (res.status !== 200 && res.status !== 206) continue;
    let body;
    try {
      body = await res.json();
    } catch {
      unknown.push(`${table}: HTTP ${res.status} with an unreadable body`);
      continue;
    }
    if (Array.isArray(body) && body.length > 0) leaks.push(table);
  }

  return { mode: 'probe', ok: leaks.length === 0, tables: tables.length, leaks, unknown };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/ci/verify-rls.mjs [--warn-only] [--json <file>]

Verifies that the public anon key cannot read the database.
Definitive when SUPABASE_DB_URL/DATABASE_URL is set, otherwise a row-level probe.`);
    return process.exit(0);
  }

  // initDbEnv composes SUPABASE_DB_URL/DATABASE_URL from the pooler settings in
  // .env.local (the repo stores SUPABASE_DB_PASSWORD, not a full URL), so it has
  // to run before the mode decision or a machine that CAN do the decisive check
  // silently falls back to the probe.
  const { ok: hasDb } = initDbEnv();
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!base) {
    console.error('CONFIG ERROR  SUPABASE_URL is not set. Failing closed — nothing was checked.');
    return process.exit(2);
  }

  console.log('RLS / least-privilege gate');
  console.log('-'.repeat(56));

  let result;
  if (hasDb && (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL)) {
    try {
      result = await definitive(args);
    } catch (err) {
      console.error(`  CONFIG ERROR  catalog read failed: ${err.message}`);
      return process.exit(2);
    }
  } else if (anonKey && serviceKey) {
    try {
      result = await probe(base, serviceKey, anonKey);
    } catch (err) {
      console.error(`  CONFIG ERROR  probe failed: ${err.message}`);
      return process.exit(2);
    }
  } else {
    console.error('  CONFIG ERROR  need SUPABASE_DB_URL (definitive) or SUPABASE_ANON_KEY +');
    console.error('  SUPABASE_SERVICE_ROLE_KEY (probe). Failing closed — nothing was checked.');
    return process.exit(2);
  }

  if (args.json) writeFileSync(args.json, JSON.stringify({ target: base, ...result }, null, 2));

  if (result.fatal) {
    console.error(`  UNVERIFIABLE  ${result.fatal}`);
    console.error('  Refusing to report a pass from a check that never ran.');
    return process.exit(2);
  }

  if (result.mode === 'definitive') {
    console.log(`  mode   : definitive (database catalog, ${result.tables} tables)`);
    console.log(`  anon   : reachable tables — ${result.anonReachable.join(', ') || '(none)'}`);
    if (result.ok) {
      console.log('  OK     every public table has RLS on; no TRUNCATE grant; no USING (true) to PUBLIC');
      console.log(args.warnOnly ? 'RLS GATE OK (warn-only mode)' : 'RLS GATE OK');
      return process.exit(0);
    }
    console.log('');
    for (const p of result.problems) console.log(`  FAIL   ${p}`);
  } else {
    console.log(`  mode   : probe (anon key, ${result.tables} tables) — DEGRADED`);
    console.log('  note   : a probe can prove a leak but cannot prove the absence of one on an');
    console.log('           empty table. Set SUPABASE_DB_URL for the definitive catalog check.');
    if (result.leaks && result.leaks.length) {
      console.log('');
      for (const t of result.leaks) console.log(`  LEAK   anon read a row from ${t}`);
    } else {
      console.log('  OK     anon read 0 rows from every exposed table (no leak observed)');
      console.log(args.warnOnly ? 'RLS PROBE CLEAN (degraded, warn-only)' : 'RLS PROBE CLEAN (degraded)');
      return process.exit(0);
    }
  }

  if (args.warnOnly) {
    console.log('\nRLS GATE VIOLATED — warn-only mode, NOT blocking');
    return process.exit(0);
  }
  console.error('\nRLS GATE FAILED — the public anon key can still reach data it should not.');
  return process.exit(1);
}

main().catch((err) => {
  console.error('verify-rls crashed:', err);
  process.exit(2);
});
