/**
 * scripts/lib/load-env.mjs — load .env files for Node scripts
 *
 * WHY THIS EXISTS
 * ---------------
 * scripts/migrate.mjs and scripts/db-baseline.mjs read the connection string
 * from process.env (`SUPABASE_DB_URL` / `DATABASE_URL`). But this repo has no
 * dotenv, and .env.local names the key `Direct_Connection_DB`. So neither
 * script could reach the database locally at all — `npm run migrate:status`
 * failed with "SUPABASE_DB_URL is not set" even though the credential was
 * sitting right there in .env.local under a different name.
 *
 * This module closes that gap: it loads the local env files and maps the
 * names this repo actually uses onto the names the scripts expect.
 *
 * DELIBERATELY SEPARATE FROM netlify/functions/_lib/env.ts
 * --------------------------------------------------------
 * That module serves the FUNCTION RUNTIME and reads through a strict
 * whitelist. The database credential must NOT be added to that whitelist:
 * Phase B established that the runtime never opens a Postgres connection
 * (all access is PostgREST over HTTPS), so putting a direct DB credential
 * in reach of function code would be a security regression for no benefit.
 *
 * Scripts run on a developer machine or in CI. They are the only place a
 * direct connection belongs. Hence two loaders with two different policies.
 *
 * PRECEDENCE
 * ----------
 *   process.env  >  .env.local  >  .env.lokal  >  .env
 *
 * process.env always wins, so CI secrets and `VAR=x npm run …` overrides are
 * never clobbered by a stale local file.
 *
 * SECRETS
 * -------
 * Values are never logged. `describeDbTarget()` exists so callers can print
 * a useful diagnostic (host/port/database) without the password.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root — resolved from this file, so it works regardless of cwd. */
const ROOT = resolve(HERE, '..', '..');

/** Searched in order; the first file to define a key wins. */
const ENV_FILES = ['.env.local', '.env.lokal', '.env'];

/**
 * Names that may hold the direct Postgres connection string, mapped onto the
 * canonical name. `Direct_Connection_DB` is the one this repo's .env.local
 * actually uses; the rest are defensive.
 *
 * NOTE ON LOOKUP: the repo's actual key is `Direct_Connection_DB` (mixed case).
 * An earlier version of this file listed only the uppercase form and therefore
 * never resolved it — the entry-point scripts worked only because .env.local
 * happens to also carry a keyless duplicate. Lookup is now case-insensitive
 * (see `lookupEnv`) so the name's casing can never matter again.
 */
const DB_URL_ALIASES = [
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'DIRECT_CONNECTION_DB',
  'SUPABASE_DIRECT_URL',
  'POSTGRES_URL',
];

/**
 * Supavisor pooler region. Project ref `bimqyugdhiuxcqltjjnt` resolves on the
 * ap-southeast-1 pooler; the `db.<ref>.supabase.co` direct host does NOT
 * resolve at all (ENOTFOUND) from IPv4-only networks, which is the norm on
 * developer machines and CI runners alike.
 *
 * Overridable via SUPABASE_POOLER_REGION for other environments.
 */
const DEFAULT_POOLER_REGION = 'ap-southeast-1';
const POOLER_PORT = '6543';
const DIRECT_PORT = '5432';

/**
 * Parse a KEY=value line. Returns null for anything that is not a plain
 * assignment — notably the loose secret lines in .env.local that have no key
 * at all (they must never be picked up as if they were variables).
 */
function parseAssignment(line) {
  const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (!m) return null;
  let value = m[2].trim();
  // Strip a single layer of matching quotes. `#` is NOT treated as a comment
  // marker: these files contain URLs with fragments and base64 padding.
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value.endsWith(first)) {
      value = value.slice(1, -1);
    }
  }
  return { key: m[1], value };
}

/** Read one env file into a flat map. Missing/unreadable files yield {}. */
function readEnvFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const parsed = parseAssignment(line);
      if (!parsed) continue;
      // First definition wins within the file.
      if (!(parsed.key in out)) out[parsed.key] = parsed.value;
    }
  } catch {
    /* file absent or unreadable — treat as empty */
  }
  return out;
}

/**
 * Case-insensitive lookup across process.env then the env files.
 *
 * Why this is not just `obj[name]`: the repo's own key is
 * `Direct_Connection_DB`. Matching on exact casing is a latent trap — it
 * "works" only until someone renames the key with a different capitalisation,
 * and it fails silently (falls through to "not configured") rather than
 * loudly. Normalising to lowercase makes casing irrelevant on both sides.
 *
 * process.env wins over files, preserving the documented precedence.
 */
function lookupEnv(name, fileEnv) {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(process.env)) {
    if (v && k.toLowerCase() === want) return v;
  }
  for (const [k, v] of Object.entries(fileEnv)) {
    if (v && k.toLowerCase() === want) return v;
  }
  return '';
}

/**
 * Derive the Supavisor (transaction-mode) pooler URL for a direct Supabase URL.
 *
 * The direct form `db.<ref>.supabase.co:5432` is frequently unreachable: it is
 * IPv6-only on many projects and has no A record for IPv4-only networks. The
 * pooler form is the one that actually works in practice, and it is also the
 * form the runtime topology expects (short HTTPS/PostgREST transactions map
 * cleanly onto transaction-mode pooling).
 *
 *   postgresql://postgres:PASS@db.<ref>.supabase.co:5432/postgres
 *     -> postgresql://postgres.<ref>:PASS@aws-0-<region>.pooler.supabase.com:6543/postgres
 *
 * Returns '' when the input is not a recognisable Supabase direct URL.
 */
function derivePoolerUrl(directUrl, ref, region = DEFAULT_POOLER_REGION) {
  if (!directUrl || !ref) return '';
  let u;
  try {
    u = new URL(directUrl);
  } catch {
    return '';
  }
  // Only rewrite the known direct host shape; leave anything else untouched.
  if (!u.hostname.startsWith('db.') || !u.hostname.endsWith('.supabase.co')) return '';

  const user = u.username.includes('.') ? u.username : `${u.username}.${ref}`;
  const out = new URL(`postgresql://${user}:${u.password}@aws-0-${region}.pooler.supabase.com:${POOLER_PORT}${u.pathname}`);
  for (const [k, v] of u.searchParams) out.searchParams.set(k, v);
  return out.toString();
}

let cached = null;

/** Load and merge the env files. Memoised. */
export function loadEnvFiles() {
  if (cached) return cached;
  const merged = {};
  for (const name of ENV_FILES) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    for (const [k, v] of Object.entries(readEnvFile(path))) {
      if (!(k in merged)) merged[k] = v;
    }
  }
  cached = merged;
  return merged;
}

/**
 * Populate process.env from the env files, without overriding anything already
 * set. Returns the list of key NAMES that were added (never values).
 */
export function applyEnvFiles() {
  const fileEnv = loadEnvFiles();
  const added = [];
  for (const [k, v] of Object.entries(fileEnv)) {
    if (v === '') continue;
    if (process.env[k] !== undefined && process.env[k] !== '') continue;
    process.env[k] = v;
    added.push(k);
  }
  return added;
}

/**
 * Resolve the Postgres connection string that actually works.
 *
 * Two things make this non-obvious, and both were live bugs:
 *
 *  1. CASING. The repo's key is `Direct_Connection_DB`, mixed case. An exact
 *     `obj[name]` lookup therefore never matched it. Lookup is now
 *     case-insensitive via `lookupEnv`.
 *
 *  2. REACHABILITY. That key's value points at `db.<ref>.supabase.co:5432`,
 *     which has no A record — `getaddrinfo ENOTFOUND` on any IPv4-only host.
 *     Resolving the name "successfully" and handing it to pg just moves the
 *     failure one step later and makes it look like a network fault. So a
 *     direct-host URL is upgraded to the Supavisor pooler before it is
 *     returned, because the pooler is the form that actually connects.
 *
 * Precedence: process.env (CI / explicit override) > env files. A caller who
 * sets SUPABASE_DB_URL explicitly gets exactly that, pooler or not — we do not
 * second-guess an intentional override, but we do resolve its cases.
 *
 * Returns '' when nothing usable is configured.
 */
export function resolveDbUrl() {
  const fileEnv = loadEnvFiles();
  const region = lookupEnv('SUPABASE_POOLER_REGION', fileEnv) || DEFAULT_POOLER_REGION;

  for (const name of DB_URL_ALIASES) {
    const v = lookupEnv(name, fileEnv);
    if (!v) continue;
    // An explicit pooler URL, or any non-Supabase host, is returned as-is.
    // A direct Supabase host is upgraded because it does not resolve.
    return upgradeDirectToPooler(v, fileEnv, region) || v;
  }
  return '';
}

/**
 * If `url` is a Supabase direct-host URL, return its pooler equivalent.
 * Otherwise return '' so the caller can fall back to the original.
 */
function upgradeDirectToPooler(url, fileEnv, region) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  if (!u.hostname.startsWith('db.') || !u.hostname.endsWith('.supabase.co')) return '';
  const ref = extractRef(u.hostname)
    || extractRef(lookupEnv('SUPABASE_URL', fileEnv))
    || extractRef(lookupEnv('PUBLIC_SUPABASE_URL', fileEnv));
  return derivePoolerUrl(url, ref, region);
}

let cachedRef = null;
let cachedRefFor = null;
/**
 * Pull the project ref out of a Supabase URL or bare hostname
 * (`https://<ref>.supabase.co` / `db.<ref>.supabase.co` -> `<ref>`).
 */
function extractRef(input) {
  if (!input) return '';
  if (cachedRef && cachedRefFor === input) return cachedRef;
  let host = input;
  if (/^https?:\/\//.test(input)) {
    try {
      host = new URL(input).hostname;
    } catch {
      return '';
    }
  }
  const parts = host.split('.');
  // `db.<ref>.supabase.co` -> parts[1]; `<ref>.supabase.co` -> parts[0].
  const ref = parts[0] === 'db' ? parts[1] : parts[0];
  if (!ref || !/^[a-z0-9]+$/i.test(ref)) return '';
  cachedRef = ref;
  cachedRefFor = input;
  return ref;
}

/**
 * Load env files and guarantee both canonical names point at the resolved
 * connection string. Safe to call repeatedly.
 *
 *   const ok = initDbEnv();
 *   if (!ok) { … }   // prints its own CONFIG ERROR
 */
export function initDbEnv() {
  const added = applyEnvFiles();
  const url = resolveDbUrl();
  if (url) {
    // db-baseline.mjs reads DATABASE_URL; migrate.mjs prefers SUPABASE_DB_URL.
    if (!process.env.SUPABASE_DB_URL) process.env.SUPABASE_DB_URL = url;
    if (!process.env.DATABASE_URL) process.env.DATABASE_URL = url;
  }
  return { ok: !!url, added, url };
}

/**
 * Safe description of a connection target for diagnostics. Never includes the
 * password or the full query string.
 */
export function describeDbTarget(url) {
  if (!url) return '(tidak ada connection string)';
  try {
    const u = new URL(url);
    const pooled = u.port === POOLER_PORT;
    return [
      `${u.hostname}:${u.port || '(default)'}`,
      `db=${u.pathname.replace(/^\//, '') || 'postgres'}`,
      `user=${u.username || '(none)'}`,
      pooled ? 'mode=pooler(transaction)' : 'mode=direct',
      u.password ? 'password=set' : 'password=MISSING',
    ].join('  ');
  } catch {
    return '(connection string tidak bisa diparse)';
  }
}

/** True when the resolved URL is the reachable Supavisor pooler form. */
export function isPooledUrl(url) {
  try {
    return new URL(url).port === POOLER_PORT;
  } catch {
    return false;
  }
}

/**
 * Print a one-line CONFIG ERROR and exit(2). Kept here so migrate.mjs and
 * db-baseline.mjs fail identically and tell the user exactly what to add.
 */
export function failNoDbUrl(scriptName) {
  console.error(`  CONFIG ERROR  ${scriptName}: connection string Postgres tidak ditemukan.`);
  console.error('');
  console.error('  Set salah satu dari ini:');
  console.error('    - process.env.SUPABASE_DB_URL   (atau DATABASE_URL) — CI / GitHub secret');
  console.error('    - .env.local  Direct_Connection_DB=<url>          — pengembangan lokal');
  console.error('');
  console.error('  File yang dibaca: ' + ENV_FILES.join(', ') + '  (di ' + ROOT + ')');
  console.error('  Nilai tidak pernah dicetak.');
  return process.exit(2);
}

export { ROOT as REPO_ROOT, ENV_FILES };
