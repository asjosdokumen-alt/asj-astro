#!/usr/bin/env node
/**
 * gen-schema.mjs — generate `netlify/functions/_lib/db/schema.generated.ts`
 * from the LIVE PostgREST schema, and gate the committed copy against drift.
 *
 * WHY THIS EXISTS
 *   `schema.generated.ts` was written by hand on 2026-09-01 from the Supabase
 *   dashboard. Nothing checked it against the database, so it is a claim, not a
 *   contract. That matters because the code treats it as authoritative:
 *   `fetchMasterLightByWa()` tries `MASTER_LIGHT_COLS` first and silently falls
 *   back to an unfiltered scan when the projection is rejected. A single
 *   misspelled column in a hand-written projection therefore does not fail —
 *   it silently restores the full-table read the projection was added to remove.
 *
 *   A generated file plus a drift gate turns that silent failure into a red
 *   pipeline: the columns the code may name are exactly the columns PostgREST
 *   exposes, and any change to that set must be committed deliberately.
 *
 * WHY POSTGREST'S OPENAPI DOCUMENT AND NOT THE DASHBOARD
 *   It is the same document the runtime resolves column names against, it is
 *   read-only, and it is reachable with the service-role key the pre-deploy
 *   pipeline already holds. Reading it once costs a single request.
 *
 * USAGE
 *   node scripts/ci/gen-schema.mjs             # write the file
 *   node scripts/ci/gen-schema.mjs --check     # exit 1 if the committed file drifted
 *   node scripts/ci/gen-schema.mjs --json f    # dump the raw table → columns map
 *   node scripts/ci/gen-schema.mjs --stdout    # print, write nothing
 *
 * ENV
 *   SUPABASE_URL                 required
 *   SUPABASE_SERVICE_ROLE_KEY    required (the OpenAPI document is service-role only)
 *
 * EXIT CODES
 *   0  in sync (or written successfully)
 *   1  drift detected (--check)
 *   2  configuration error — missing URL/key, unreachable, unreadable document
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { applyEnvFiles } from '../lib/load-env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const TARGET = join(REPO, 'netlify', 'functions', '_lib', 'db', 'schema.generated.ts');

const GENERATED_HEADER = 'AUTO-GENERATED — DO NOT EDIT BY HAND.';

function parseArgs(argv) {
  const args = { check: false, json: '', stdout: false, timeout: 20000, retries: 3 };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--check': args.check = true; break;
      case '--stdout': args.stdout = true; break;
      case '--json': args.json = argv[++i]; break;
      case '--timeout': args.timeout = Number(argv[++i]); break;
      case '--retries': args.retries = Number(argv[++i]); break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch the OpenAPI document. PostgREST answers Swagger 2.0 with the table
 * shapes under `definitions` — `components.schemas` is empty, which is the
 * trap: reading the wrong key yields zero tables and looks like a valid,
 * empty schema.
 */
async function fetchSchema(base, key, args) {
  let lastErr = '';
  for (let attempt = 1; attempt <= args.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeout);
    try {
      const res = await fetch(`${base}/rest/v1/`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/openapi+json',
        },
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = `HTTP ${res.status} ${text.slice(0, 160)}`;
      } else {
        const spec = JSON.parse(text);
        const defs = spec.definitions || spec.components?.schemas || {};
        const tables = {};
        for (const [name, def] of Object.entries(defs)) {
          const props = def && def.properties;
          if (!props) continue;
          tables[name] = Object.keys(props);
        }
        if (Object.keys(tables).length === 0) {
          lastErr = 'OpenAPI document exposed zero tables — refusing to write an empty contract';
        } else {
          return tables;
        }
      }
    } catch (err) {
      lastErr = err.name === 'AbortError' ? `timeout after ${args.timeout}ms` : err.message;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < args.retries) await sleep(500 * 2 ** (attempt - 1));
  }
  throw new Error(lastErr);
}

/** Canonical fingerprint: sorted table names, each with its columns in the
 *  order PostgREST reports them. Column order is part of the contract because
 *  projections are written as ordered strings. */
function fingerprint(tables) {
  const canonical = Object.keys(tables)
    .sort()
    .map((t) => `${t}:${tables[t].join(',')}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Named table constants the codebase imports. Kept here, not in a hand-written
 * file, so that a table that disappears from the database also disappears from
 * the emitted constants — a stale `TABLE_X = 'gone'` would otherwise keep
 * compiling while every query against it 404s.
 */
const WELL_KNOWN_TABLES = {
  TABLE_CANDIDATE: 'database_candidate',
  TABLE_MASTER: 'master_database_candidate',
  TABLE_FORM: 'database_asj_form',
  TABLE_JOB: 'job_database',
  TABLE_FCM: 'fcm_tokens',
  TABLE_SCHEDULE: 'database_schedule',
  TABLE_TASK: 'database_tugas',
  TABLE_CONFIG: 'sys_config',
  TABLE_SESSION: 'user_sessions',
  TABLE_RINCIAN: 'rincian_presets',
  TABLE_AI_SUBMISSION: 'ai_form_submissions',
};

/** The WA column is derived, not declared: first alias the table actually has. */
const WA_ALIASES = ['no_wa', 'wa', 'whatsapp'];
const WELL_KNOWN_WA = {
  CANDIDATE_WA_COL: 'database_candidate',
  MASTER_WA_COL: 'master_database_candidate',
  FORM_WA_COL: 'database_asj_form',
  FCM_WA_COL: 'fcm_tokens',
};

function render(tables, sha) {
  const names = Object.keys(tables).sort();
  const lines = [];
  lines.push('/**');
  lines.push(` * db/schema.generated.ts — ${GENERATED_HEADER}`);
  lines.push(' *');
  lines.push(' * Source  : PostgREST OpenAPI document of the live database');
  lines.push(` * Digest  : sha256:${sha}`);
  lines.push(` * Tables  : ${names.length}`);
  lines.push(' *');
  lines.push(' * Regenerate : npm run db:schema');
  lines.push(' * Verify     : npm run verify:schema   (pre-deploy; needs SUPABASE_URL +');
  lines.push(' *                                        SUPABASE_SERVICE_ROLE_KEY)');
  lines.push(' *');
  lines.push(' * The column lists below are the ONLY column names this codebase may put in a');
  lines.push(' * `select=` projection. Naming anything else makes PostgREST answer 400, and');
  lines.push(' * the surrounding code falls back to a full-table read — silently undoing the');
  lines.push(' * projection it was asked to use. That is why this file is generated rather');
  lines.push(' * than curated, and why drift is a build failure.');
  lines.push(' */');
  lines.push('');
  lines.push('/** sha256 over `table:col,col,…` for every table, sorted by table name. */');
  lines.push(`export const SCHEMA_FINGERPRINT = 'sha256:${sha}' as const;`);
  lines.push('');
  lines.push('/**');
  lines.push(' * The contract, one line per table: `<table>:<col>,<col>,…`.');
  lines.push(' *');
  lines.push(' * Stored as a string rather than an object literal on purpose: this module is');
  lines.push(' * bundled into every one of the 19 entry points, and the literal form (quoted');
  lines.push(' * key, quoted column, comma, indent — per column) cost ~4 KB more per bundle');
  lines.push(' * for exactly the same information. Parsed once, at module load.');
  lines.push(' */');
  lines.push('const SCHEMA_LINES = `');
  for (const t of names) {
    lines.push(`${t}:${tables[t].join(',')}`);
  }
  lines.push('`;');
  lines.push('');
  lines.push('/** Table name → column names, in PostgREST order. */');
  lines.push('export const TABLE_COLUMNS: Record<string, readonly string[]> = Object.freeze(');
  lines.push('  Object.fromEntries(');
  lines.push("    SCHEMA_LINES.trim().split('\\n').map((line) => {");
  lines.push("      const i = line.indexOf(':');");
  lines.push("      return [line.slice(0, i), Object.freeze(line.slice(i + 1).split(','))];");
  lines.push('    }),');
  lines.push('  ),');
  lines.push(');');
  lines.push('');
  lines.push('/** Every table this database exposes over PostgREST. */');
  lines.push('export type TableName =');
  for (const t of names) {
    lines.push(`  | ${JSON.stringify(t)}`);
  }
  lines.push('  ;');
  lines.push('');

  // ── Named table constants ──────────────────────────────────────────────────
  const emittedTables = Object.entries(WELL_KNOWN_TABLES).filter(([, t]) => tables[t]);
  const droppedTables = Object.entries(WELL_KNOWN_TABLES).filter(([, t]) => !tables[t]);
  lines.push('/** Named table constants, emitted only while the table is exposed. */');
  if (emittedTables.length === 0) {
    lines.push('// (none of the well-known tables are currently exposed)');
  }
  for (const [name, table] of emittedTables) {
    lines.push(`export const ${name} = ${JSON.stringify(table)} as const;`);
  }
  if (droppedTables.length > 0) {
    lines.push('// Not exposed by the database, so deliberately not emitted:');
    for (const [name, table] of droppedTables) {
      lines.push(`//   ${name} (${table})`);
    }
  }
  lines.push('');

  // ── WA columns ─────────────────────────────────────────────────────────────
  lines.push('/**');
  lines.push(' * The WA column per table. Derived from the live column list — the codebase');
  lines.push(' * used to probe seven aliases per table, six of which do not exist, paying a');
  lines.push(' * failed round-trip each time.');
  lines.push(' */');
  for (const [name, table] of Object.entries(WELL_KNOWN_WA)) {
    const cols = tables[table];
    if (!cols) {
      lines.push(`// ${name}: ${table} is not exposed`);
      continue;
    }
    const wa = WA_ALIASES.find((a) => cols.includes(a));
    if (!wa) {
      lines.push(`// ${name}: ${table} has none of ${WA_ALIASES.join(', ')}`);
      continue;
    }
    lines.push(`export const ${name} = ${JSON.stringify(wa)} as const;`);
  }
  lines.push('');

  lines.push('/** Column names for `table`, or undefined when the table is not exposed. */');
  lines.push('export function columnsOf(table: string): readonly string[] | undefined {');
  lines.push('  return TABLE_COLUMNS[table];');
  lines.push('}');
  lines.push('');
  lines.push('/** True when `table` is exposed and has a column named `column`. */');
  lines.push('export function hasColumn(table: string, column: string): boolean {');
  lines.push('  const cols = columnsOf(table);');
  lines.push('  return !!cols && cols.includes(column);');
  lines.push('}');
  lines.push('');
  lines.push('/**');
  lines.push(' * Build a PostgREST `select=` value from an explicit column list.');
  lines.push(' *');
  lines.push(' * Throws when a name is not in the live schema: a projection that names a');
  lines.push(' * column PostgREST does not have is not a smaller read, it is a failed');
  lines.push(' * request that the caller then retries unfiltered. Failing here is the point.');
  lines.push(' */');
  lines.push('export function project(table: string, columns: readonly string[]): string {');
  lines.push('  const known = columnsOf(table);');
  lines.push('  if (!known) throw new Error(`project(): unknown table ${table}`);');
  lines.push('  for (const c of columns) {');
  lines.push('    if (!known.includes(c)) {');
  lines.push('      throw new Error(`project(): ${table} has no column ${c}`);');
  lines.push('    }');
  lines.push('  }');
  lines.push("  return columns.join(',');");
  lines.push('}');
  lines.push('');
  lines.push('/** Every column of `table` — for reads that genuinely need the whole row.');
  lines.push(' *  It is still an explicit list, so it stays checkable; list endpoints should');
  lines.push(' *  prefer a named projection from ./projections.ts. */');
  lines.push('export function allColumns(table: string): string {');
  lines.push('  const known = columnsOf(table);');
  lines.push('  if (!known) throw new Error(`allColumns(): unknown table ${table}`);');
  lines.push("  return known.join(',');");
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/ci/gen-schema.mjs [--check] [--stdout] [--json <file>]

Regenerates netlify/functions/_lib/db/schema.generated.ts from the live database.`);
    return process.exit(0);
  }

  applyEnvFiles();
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base) {
    console.error('CONFIG ERROR  SUPABASE_URL is not set. Failing closed — nothing was checked.');
    return process.exit(2);
  }
  if (!key) {
    console.error('CONFIG ERROR  SUPABASE_SERVICE_ROLE_KEY is not set (OpenAPI is service-role only).');
    return process.exit(2);
  }

  let tables;
  try {
    tables = await fetchSchema(base, key, args);
  } catch (err) {
    console.error(`CONFIG ERROR  could not read the schema: ${err.message}`);
    return process.exit(2);
  }

  const sha = fingerprint(tables);
  const rendered = render(tables, sha);

  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ fingerprint: sha, tables }, null, 2));
  }
  if (args.stdout) {
    process.stdout.write(rendered);
    return process.exit(0);
  }

  const rel = relative(REPO, TARGET).replace(/\\/g, '/');
  let current = '';
  try {
    current = readFileSync(TARGET, 'utf8');
  } catch {
    current = '';
  }

  if (args.check) {
    if (current === rendered) {
      console.log(`SCHEMA IN SYNC  ${rel} · ${Object.keys(tables).length} tables · sha256:${sha.slice(0, 12)}`);
      return process.exit(0);
    }
    console.error(`SCHEMA DRIFTED  ${rel}`);
    console.error(`  live digest     : sha256:${sha.slice(0, 12)}`);
    const committed = /Digest\s*:\s*sha256:([0-9a-f]+)/.exec(current);
    console.error(
      `  committed digest: ${committed ? 'sha256:' + committed[1].slice(0, 12) : 'absent or unreadable'}`,
    );
    console.error('  The database changed and the contract was not regenerated.');
    console.error('  Run `npm run db:schema`, review the diff, and commit it.');
    return process.exit(1);
  }

  if (current === rendered) {
    console.log(`SCHEMA UNCHANGED  ${rel} · ${Object.keys(tables).length} tables`);
    return process.exit(0);
  }
  writeFileSync(TARGET, rendered);
  console.log(`SCHEMA WRITTEN  ${rel} · ${Object.keys(tables).length} tables · sha256:${sha.slice(0, 12)}`);
  return process.exit(0);
}

main().catch((err) => {
  console.error('gen-schema crashed:', err);
  process.exit(2);
});
