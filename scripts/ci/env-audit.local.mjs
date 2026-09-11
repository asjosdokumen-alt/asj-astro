/**
 * env-audit.local.mjs — read-only audit of .env.local against the profiles in
 * scripts/ci/verify-env.mjs.
 *
 * WHY THIS EXISTS: verify-env.mjs reads ONLY process.env, which is correct for
 * GitHub Actions (where secrets are injected) but useless locally — running it
 * against .env.local reports "0/8 present" and looks like a catastrophe when
 * nothing is actually wrong. This script answers the local question instead:
 * "which names does .env.local define, and which does the runtime still need?"
 *
 * SAFETY: never prints a value, never prints a prefix of a value, never diffs
 * contents. Only names and booleans leave this process.
 */
import { readFileSync, existsSync } from 'node:fs';

const ENV_FILE = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : '.env.local';

// Names used by the deployed runtime but NOT covered by verify-env.mjs's
// profiles — these are the ones that silently disable a feature when missing.
const RUNTIME_EXTRA = [
  'FONNTE_TOKEN',
  'CLOUDINARY_URL',
  'GEMINI_API_KEY',
  'XAI_API_KEY',
  'GROQ_API_KEY',
  'FIREBASE_SERVICE_TOKEN',
  'SUPABASE_STORAGE_BUCKET',
  'SUPABASE_JWT_SECRET',
  'ADMIN_MASTER_PIN',
  'ADMIN_NUMBERS',
];

const REQUIRED_PRODUCTION = [
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
  'NETLIFY_AUTH_TOKEN',
  'NETLIFY_SITE_ID',
];

const REQUIRED_BUILD = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'];

if (!existsSync(ENV_FILE)) {
  console.error(`env-audit: ${ENV_FILE} not found`);
  process.exit(2);
}

const text = readFileSync(ENV_FILE, 'utf-8');
const defined = new Map(); // name -> { empty: bool }
const bareValueLines = [];

for (const [i, raw] of text.split(/\r?\n/).entries()) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) {
    defined.set(m[1], { empty: m[2].trim().length === 0, line: i + 1 });
  } else {
    // A line with content but no `KEY=` — a stray value. These are the ones a
    // naive redactor misses and they are how secrets end up in terminal logs.
    bareValueLines.push(i + 1);
  }
}

function report(title, names, hard) {
  console.log(`\n${title}`);
  let ok = 0;
  for (const n of names) {
    const d = defined.get(n);
    if (d && !d.empty) {
      ok++;
      console.log(`  OK        ${n}`);
    } else if (d && d.empty) {
      console.log(`  EMPTY     ${n}   (line ${d.line} — defined but has no value)`);
    } else {
      console.log(`  ${hard ? 'MISSING  ' : 'absent   '} ${n}`);
    }
  }
  const total = names.length;
  console.log(`  -> ${ok}/${total} ${ok === total ? 'complete' : 'NOT complete'}`);
  return ok === total;
}

console.log(`env-audit — ${ENV_FILE}`);
console.log(`${defined.size} key(s) defined`);

const a = report('BUILD (PUBLIC_* are inlined into client JS at build time)', REQUIRED_BUILD, true);
const b = report('FUNCTIONS (server runtime — a missing one is a runtime 5xx)', REQUIRED_PRODUCTION, true);
const c = report('RUNTIME EXTRAS (absent = feature silently disabled)', RUNTIME_EXTRA, false);

if (bareValueLines.length) {
  console.log(`\n! ${bareValueLines.length} line(s) contain a value with no "KEY=" prefix:`);
  console.log(`  lines ${bareValueLines.join(', ')}`);
  console.log('  These are unreachable by any KEY lookup AND leak on any line dump.');
  console.log('  Give them a KEY= name or delete them.');
}

// Names defined but not part of any known profile — flag so nothing hides.
const known = new Set([...REQUIRED_PRODUCTION, ...REQUIRED_BUILD, ...RUNTIME_EXTRA]);
const unknown = [...defined.keys()].filter((k) => !known.has(k));
if (unknown.length) {
  console.log(`\nOTHER keys present (not in any known profile): ${unknown.join(', ')}`);
}

console.log(`\nRESULT: ${a && b ? 'required names all present' : 'REQUIRED NAMES MISSING'}`);
process.exit(a && b ? 0 : 1);
