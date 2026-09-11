#!/usr/bin/env node
/**
 * migrate.mjs — Database migration runner.
 *
 * WHY THIS EXISTS
 *   Migrations used to be applied by hand, from two competing directories, with
 *   no record of what had run. That produced exactly the failure the pipeline is
 *   meant to prevent: code shipped that depended on SQL which was never applied,
 *   and because PostgREST answers 200 with an empty result, nothing complained.
 *
 *   This runner makes the schema a versioned, checked artefact:
 *     • one canonical directory, applied in filename order
 *     • a ledger table recording what ran, when, and the checksum of what ran
 *     • a checksum mismatch on an already-applied migration is a hard error
 *     • each migration runs in its own transaction, so a failure rolls back
 *     • a transaction-scoped advisory lock stops two deploys racing
 *
 * COMMANDS
 *   status                 show applied / pending / drifted migrations
 *   up                     apply every pending migration, in order
 *   baseline --to NNN      record migrations up to NNN as already applied,
 *                          WITHOUT running them (for adopting this ledger on a
 *                          database that predates it)
 *
 * OPTIONS
 *   --dry-run     print what would happen, change nothing
 *   --json FILE   write a machine-readable report
 *   --dir PATH    migrations directory (default: migrations/)
 *
 * ENV
 *   SUPABASE_DB_URL   (or DATABASE_URL) Postgres connection string.
 *                     Supabase pooler: host aws-0-<region>.pooler.supabase.com,
 *                     port 6543, user postgres.<project-ref>.
 *                     The value is never printed.
 *
 * EXIT CODES
 *   0  success (nothing to do counts as success)
 *   1  a migration failed, or an applied migration's file was modified
 *   2  configuration error: no connection string, unreachable, bad directory
 *
 * NOTE ON ROLLBACK
 *   This runner never reverses a migration. Deploy rollback restores the previous
 *   Netlify deploy, not the schema. Write migrations to be additive and
 *   backward-compatible (expand/contract) so old and new code both work.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { hostname, userInfo } from 'node:os';

import pg from 'pg';
import { initDbEnv, describeDbTarget, failNoDbUrl } from './lib/load-env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = resolve(HERE, '..', 'migrations');

const LOCK_KEY_SALT = 0x6d67; // "mg" — namespaces our lock away from other users

function parseArgs(argv) {
  const args = {
    command: argv[0] && !argv[0].startsWith('-') ? argv[0] : 'status',
    dir: DEFAULT_DIR,
    to: '',
    only: '',
    dryRun: false,
    json: '',
  };
  for (let i = argv[0] && !argv[0].startsWith('-') ? 1 : 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--dir': args.dir = resolve(argv[++i]); break;
      case '--to': args.to = argv[++i]; break;
      case '--only': args.only = argv[++i]; break;
      case '--dry-run': args.dryRun = true; break;
      case '--json': args.json = argv[++i]; break;
      case '--help':
      case '-h': args.help = true; break;
    }
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/migrate.mjs <status|up|baseline> [options]

  status                      show applied / pending / drifted
  up                          apply pending migrations in order
  baseline --to NNN           mark <= NNN as applied without running them

Options:
  --dry-run        print the plan, change nothing
  --json FILE      write a report
  --dir PATH       migrations directory (default migrations/)

Requires SUPABASE_DB_URL (or DATABASE_URL) in the environment.`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const shortSum = (s) => sha256(s).slice(0, 12);

/** Numeric prefix ("008") sorts lexically, which is what applies order. */
function parseVersion(filename) {
  const m = /^(\d+)[_-]/.exec(filename);
  return m ? m[1] : null;
}

function loadMigrations(dir) {
  if (!existsSync(dir)) {
    throw new Error(`migrations directory not found: ${dir}`);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error(`no .sql files in ${dir}`);

  const seen = new Map();
  return files.map((file) => {
    const version = parseVersion(file);
    if (!version) {
      throw new Error(`"${file}" has no numeric prefix — migrations must be named NNN_name.sql so order is unambiguous`);
    }
    if (seen.has(version)) {
      throw new Error(`duplicate migration version ${version}: "${seen.get(version)}" and "${file}"`);
    }
    seen.set(version, file);
    const sql = readFileSync(join(dir, file), 'utf8');
    return { version, file, sql, checksum: sha256(sql), bytes: Buffer.byteLength(sql) };
  });
}

/**
 * Supabase's pooler occasionally rejects a valid password transiently, so
 * connecting is retried. A deploy must not fail because of one bad handshake.
 */
async function connect(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const client = new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 20000,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      try { await client.end(); } catch {}
      if (attempt < 4) await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr;
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version      TEXT PRIMARY KEY,
      name         TEXT        NOT NULL,
      checksum     TEXT        NOT NULL,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by   TEXT,
      execution_ms INTEGER
    );
  `);
}

const sleepSafe = (ms) => sleep(ms);

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    return process.exit(0);
  }
  if (!['status', 'up', 'baseline'].includes(args.command)) {
    console.error(`Unknown command "${args.command}".`);
    usage();
    return process.exit(2);
  }

  // Load .env.local / .env.lokal and map Direct_Connection_DB onto the
  // canonical name, so local runs work without exporting anything by hand.
  // process.env still wins, so CI secrets are never clobbered.
  const dbEnv = initDbEnv();
  const url = dbEnv.url;
  if (!url) {
    failNoDbUrl('migrate');
  }

  // Safe, password-free description of the target. Computed once and reused:
  // it is printed to the console AND written into the --json report, so the
  // report is self-describing (which host ran this) without ever carrying the
  // credential. Passing `host` to writeReport() below would otherwise be a
  // ReferenceError — the three call sites referenced a name that was never
  // declared, and no test exercised the --json path to catch it.
  const host = describeDbTarget(url);

  let migrations;
  try {
    migrations = loadMigrations(args.dir);
  } catch (err) {
    console.error(`  CONFIG ERROR  ${err.message}`);
    return process.exit(2);
  }

  const who = process.env.GITHUB_ACTOR || safeUser();

  console.log(`Migration runner — ${args.command}`);
  console.log('-'.repeat(64));
  // Never print the URL: it contains the password.
  // Show the target without the password, and say whether it is the direct
  // host or the transaction pooler — the two behave differently and it is the
  // first thing worth knowing when a migration misbehaves.
  console.log(`  target     : ${host}`);
  console.log(`  directory  : ${args.dir}`);
  console.log(`  as         : ${who}`);
  if (dbEnv.added.length) console.log(`  env files  : ${dbEnv.added.length} key(s) loaded`);
  if (args.dryRun) console.log(`  DRY RUN    : no changes will be committed`);
  console.log('-'.repeat(64));

  let client;
  try {
    client = await connect(url);
  } catch (err) {
    console.error(`  CONFIG ERROR  cannot connect: ${err.message.split('\n')[0]}`);
    console.error('  If the host is db.<ref>.supabase.co:5432 and the network is');
    console.error('  IPv4-only, the direct host may be unreachable — use the Supavisor');
    console.error('  pooler instead (aws-0-<region>.pooler.supabase.com:6543).');
    return process.exit(2);
  }

  try {
    await ensureLedger(client);
    const { rows } = await client.query(
      'SELECT version, name, checksum, applied_at, applied_by, execution_ms FROM schema_migrations'
    );
    const applied = new Map(rows.map((r) => [r.version, r]));

    const report = [];
    for (const m of migrations) {
      const rec = applied.get(m.version);
      let state;
      if (!rec) state = 'pending';
      else if (rec.checksum !== m.checksum) state = 'drifted';
      else state = 'applied';
      report.push({
        ...m,
        state,
        // Keep the ledger's checksum separately from the file's, or the drift
        // message compares the file against itself and prints two equal hashes.
        ledgerChecksum: rec?.checksum || null,
        appliedAt: rec?.applied_at || null,
        appliedBy: rec?.applied_by || null,
      });
    }

    // ── status ────────────────────────────────────────────────────────────────
    if (args.command === 'status') {
      for (const r of report) {
        const tag =
          r.state === 'applied' ? 'APPLIED' : r.state === 'pending' ? 'PENDING' : 'DRIFT  ';
        const extra =
          r.state === 'applied'
            ? `${new Date(r.appliedAt).toISOString().slice(0, 19)}Z by ${r.appliedBy || '?'}`
            : r.state === 'pending'
              ? `${r.bytes} bytes, ${shortSum(r.sql)}`
              : `file changed since it was applied (applied ${String(r.ledgerChecksum || '').slice(0, 12)} != on disk ${shortSum(r.sql)})`;
        console.log(`  ${tag}  ${r.file.padEnd(34)} ${extra}`);
      }
      const pending = report.filter((r) => r.state === 'pending');
      const drifted = report.filter((r) => r.state === 'drifted');
      console.log('-'.repeat(64));
      console.log(
        `  ${report.length} migrations · ${report.length - pending.length - drifted.length} applied · ${pending.length} pending · ${drifted.length} drifted`
      );

      if (args.json) writeReport(args.json, host, report);

      if (drifted.length) {
        console.error('');
        console.error('  DRIFT DETECTED — an applied migration was modified after the fact.');
        console.error('  Never edit a migration that has run; add a new one instead.');
        return process.exit(1);
      }
      if (pending.length) console.log(`\n  Run "npm run migrate:up" to apply ${pending.length} pending migration(s).`);
      return process.exit(0);
    }

    // ── baseline ──────────────────────────────────────────────────────────────
    if (args.command === 'baseline') {
      if (!args.to && !args.only) {
        console.error('  baseline requires --to NNN (mark all up to NNN) or --only NNN.');
        return process.exit(2);
      }
      const targets = args.only
        ? report.filter((r) => r.version === args.only)
        : report.filter((r) => r.version <= args.to);

      if (targets.length === 0) {
        console.error(`  No migration matches ${args.only ? '--only ' + args.only : '--to ' + args.to}.`);
        return process.exit(2);
      }
      console.log(`  Recording ${targets.length} migration(s) as already applied (NOT executed):`);
      for (const t of targets) {
        if (t.state === 'applied') {
          console.log(`    skip   ${t.file} (already in ledger)`);
          continue;
        }
        if (!args.dryRun) {
          await client.query(
            `INSERT INTO schema_migrations (version, name, checksum, applied_by, execution_ms)
             VALUES ($1,$2,$3,$4,0)
             ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum`,
            [t.version, t.file, t.checksum, `${who} (baseline)`]
          );
        }
        console.log(`    ${args.dryRun ? 'would mark' : 'marked   '} ${t.file}`);
      }
      console.log('-'.repeat(64));
      console.log(args.dryRun ? '  DRY RUN — nothing written' : '  Baseline recorded. Run "status" to confirm.');
      return process.exit(0);
    }

    // ── up ────────────────────────────────────────────────────────────────────
    const drifted = report.filter((r) => r.state === 'drifted');
    if (drifted.length) {
      console.error('  DRIFT DETECTED — refusing to apply anything until it is resolved:');
      for (const d of drifted) console.error(`    ${d.file}`);
      console.error('  Never edit a migration that has already run. Add a new migration instead.');
      return process.exit(1);
    }

    const pending = report.filter((r) => r.state === 'pending');
    if (pending.length === 0) {
      console.log('  Nothing to apply — database is up to date.');
      if (args.json) writeReport(args.json, host, report);
      return process.exit(0);
    }

    console.log(`  Applying ${pending.length} migration(s):\n`);
    for (const m of pending) {
      const concurrent = /CONCURRENTLY/i.test(m.sql);
      const started = Date.now();

      if (args.dryRun) {
        console.log(`    would apply  ${m.file}  (${m.bytes} bytes${concurrent ? ', CONCURRENTLY — not transactional' : ''})`);
        continue;
      }

      try {
        if (concurrent) {
          // CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction block.
          console.log(`    applying     ${m.file}  (CONCURRENTLY — cannot be rolled back)`);
          await client.query(m.sql);
        } else {
          await client.query('BEGIN');
          // Transaction-scoped lock: safe under Supabase's transaction-mode pooler
          // and prevents two concurrent deploys applying the same migration twice.
          await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY_SALT]);
          // Re-check inside the lock so a competing run cannot double-apply.
          const { rows: r } = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [m.version]);
          if (r.length === 0) {
            await client.query(m.sql);
            await client.query(
              `INSERT INTO schema_migrations (version, name, checksum, applied_by, execution_ms)
               VALUES ($1,$2,$3,$4,$5)`,
              [m.version, m.file, m.checksum, who, 0]
            );
          }
          await client.query('COMMIT');
        }

        const { rows: r2 } = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [m.version]);
        if (r2.length === 0) {
          await client.query(
            `INSERT INTO schema_migrations (version, name, checksum, applied_by, execution_ms)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (version) DO NOTHING`,
            [m.version, m.file, m.checksum, who, Date.now() - started]
          );
        }
        console.log(`    applied      ${m.file}  (${Date.now() - started}ms)`);
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error('');
        console.error(`    FAILED       ${m.file}`);
        console.error(`                ${String(err.message).split('\n')[0]}`);
        console.error('');
        console.error('  The transaction was rolled back. Earlier migrations in this run are kept.');
        console.error('  Fix the migration and re-run — already-applied ones are skipped.');
        return process.exit(1);
      }
    }

    console.log('-'.repeat(64));
    console.log(args.dryRun ? '  DRY RUN — nothing applied' : `  Applied ${pending.length} migration(s).`);

    if (args.json) writeReport(args.json, host, report);
    return process.exit(0);
  } finally {
    try { await client.end(); } catch {}
  }
}

function safeUser() {
  try { return userInfo().username; } catch { return hostname(); }
}

function writeReport(file, host, report) {
  writeFileSync(
    file,
    JSON.stringify(
      { host, at: new Date().toISOString(), migrations: report.map(({ sql, ...r }) => r) },
      null,
      2
    )
  );
  console.log(`\n  report written to ${file}`);
}

main().catch((err) => {
  console.error('migrate.mjs crashed:', err);
  process.exit(1);
});
