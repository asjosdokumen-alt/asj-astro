/**
 * env-audit.local.mjs — read-only audit of .env.local against the profiles in
 * scripts/ci/verify-env.mjs, plus a SAFE one-shot bootstrap of that file.
 *
 * WHY THE AUDIT EXISTS: verify-env.mjs reads ONLY process.env, which is correct
 * for GitHub Actions (where secrets are injected) but useless locally — running
 * it against .env.local reports "0/8 present" and looks like a catastrophe when
 * nothing is actually wrong. This script answers the local question instead:
 * "which names does .env.local define, and which does the runtime still need?"
 *
 * WHY `--bootstrap` EXISTS: every new machine repeated the same manual copy of
 * `.env.example` → `.env.local`. The command does that copy ONCE, refuses to
 * overwrite an existing file (a developer's real credentials must never be
 * replaced by placeholders), and then runs the audit on the result. It never
 * prints a value, and it does not pretend a placeholder is a usable secret —
 * `verify:env:local:all` still fails on shape until real values are filled in.
 *
 * SAFETY: never prints a value or a prefix of one. Only names and booleans
 * leave this process. The helper functions are exported so the bootstrap can
 * be tested without touching disk (they are also importable without executing
 * the audit — see the direct-invocation guard at the bottom).
 */
import { readFileSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Parse env-file text into names + the two failure shapes this repo keeps seeing. */
export function parseEnvDefinitions(text) {
  const defined = new Map(); // name -> { empty, line }
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
  return { defined, bareValueLines };
}

/**
 * Decide and perform a local env bootstrap. Injected fs functions make every
 * branch testable without creating files; the defaults touch only .env.local.
 * `exists` is checked on the TEMPLATE FIRST so a missing template can never
 * produce an empty target.
 */
/**
 * @param {{
 *   templatePath?: string,
 *   targetPath?: string,
 *   exists?: (p: string) => boolean,
 *   copy?: (from: string, to: string) => void,
 *   chmod?: (p: string, mode: number) => void,
 * }} [opts]
 */
export function bootstrapEnvFile({
  templatePath = '.env.example',
  targetPath = '.env.local',
  exists = existsSync,
  copy = copyFileSync,
  chmod = chmodSync,
} = {}) {
  if (!exists(templatePath)) return { status: 'template-missing', templatePath, targetPath };
  if (exists(targetPath)) return { status: 'exists', templatePath, targetPath };
  copy(templatePath, targetPath);
  // Best effort: Windows ignores the POSIX mode, macOS/Linux honour it.
  try {
    chmod(targetPath, 0o600);
  } catch {
    /* the copy succeeded; a mode warning must not undo provisioning */
  }
  return { status: 'created', templatePath, targetPath };
}

function report(title, names, hard, defined) {
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

function main() {
  if (process.argv.includes('--bootstrap')) {
    const result = bootstrapEnvFile();
    if (result.status === 'template-missing') {
      console.error(`env-bootstrap: template ${result.templatePath} not found — nothing was created.`);
      process.exit(2);
    }
    if (result.status === 'created') {
      console.log(`env-bootstrap: ${result.targetPath} created from ${result.templatePath} (placeholders, not secrets).`);
      console.log('env-bootstrap: fill the real values, then run `npm run verify:env:local:all`.');
    } else {
      console.log(`env-bootstrap: ${result.targetPath} already exists — left untouched.`);
    }
  }

  const ENV_FILE = process.argv.includes('--file')
    ? process.argv[process.argv.indexOf('--file') + 1]
    : '.env.local';

  if (!existsSync(ENV_FILE)) {
    console.error(`env-audit: ${ENV_FILE} not found (try \`npm run env:bootstrap\`)`);
    process.exit(2);
  }

  const text = readFileSync(ENV_FILE, 'utf-8');
  const { defined, bareValueLines } = parseEnvDefinitions(text);

  console.log(`env-audit — ${ENV_FILE}`);
  console.log(`${defined.size} key(s) defined`);

  const a = report('BUILD (PUBLIC_* are inlined into client JS at build time)', REQUIRED_BUILD, true, defined);
  const b = report('FUNCTIONS (server runtime — a missing one is a runtime 5xx)', REQUIRED_PRODUCTION, true, defined);
  const _c = report('RUNTIME EXTRAS (absent = feature silently disabled)', RUNTIME_EXTRA, false, defined);

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
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
