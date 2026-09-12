#!/usr/bin/env node
/**
 * verify-env.mjs — Fail-fast environment variable gate.
 *
 * WHY THIS EXISTS
 *   A deploy that starts with a missing secret fails halfway: the static site
 *   uploads, the functions break, and users get a half-working release. Catching
 *   that BEFORE we touch Netlify costs 5 seconds instead of 5 minutes plus a
 *   rollback.
 *
 * SECURITY
 *   This script never prints, logs, or exports variable VALUES — only names and
 *   presence. That keeps the CI log safe to share and prevents accidental secret
 *   leakage through build output.
 *
 * USAGE
 *   node scripts/ci/verify-env.mjs --profile build
 *   node scripts/ci/verify-env.mjs --profile production --strict
 *   REQUIRED_EXTRA="MY_VAR,OTHER" node scripts/ci/verify-env.mjs --profile staging
 *
 * ENV
 *   REQUIRED_EXTRA   Comma-separated extra variables required for this run.
 *   ALLOW_PLACEHOLDER  Set to "1" to accept placeholder values (local dev only).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { applyEnvFiles } from '../lib/load-env.mjs';

const PROFILES = {
  // Needed to produce a byte-reproducible static build. PUBLIC_* values are
  // inlined into client JS at build time, so a missing one ships a broken bundle.
  build: {
    required: ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'],
    optional: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY'],
  },
  // Server-side function runtime (Netlify Functions).
  functions: {
    required: [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SESSION_SECRET',
    ],
    optional: [
      'GEMINI_API_KEY',
      'XAI_API_KEY',
      'FONNTE_TOKEN',
      'CLOUDINARY_URL',
      'CLOUDINARY_UPLOAD_URL',
      'SUPABASE_STORAGE_BUCKET',
      'NETLIFY_SITE_URL',
      'ADMIN_MASTER_PIN',
      // Phase C item 12: gates the full /health report. Optional because the
      // endpoint FAILS CLOSED without it — a deploy with no HEALTH_TOKEN is
      // safe (health detail returns 503), just less observable.
      'HEALTH_TOKEN',
      // Phase C item 11: the metrics sink. Optional by design — with no URL the
      // export is a no-op rather than an error, so monitoring can be turned off
      // without making the deploy fail.
      'METRICS_SINK_URL',
      'METRICS_SINK_TOKEN',
    ],
  },
  staging: {
    required: [
      'PUBLIC_SUPABASE_URL',
      'PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SESSION_SECRET',
      'NETLIFY_AUTH_TOKEN',
      'NETLIFY_SITE_ID',
    ],
    optional: ['SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY'],
  },
  production: {
    required: [
      'PUBLIC_SUPABASE_URL',
      'PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SESSION_SECRET',
      'NETLIFY_AUTH_TOKEN',
      'NETLIFY_SITE_ID',
    ],
    // These are listed so the 4 KB budget check can SEE them. A variable that is
    // omitted from the profile is invisible to the budget arithmetic, and the
    // largest single consumer here (FIREBASE_SERVICE_ACCOUNT, ~2.4 KB) was
    // missing from every profile — which is how a 4096 B overflow went
    // unnoticed until the deploy died at function creation on 2026-09-12.
    // Anything the dashboard injects that is large enough to matter belongs here.
    optional: [
      'GEMINI_API_KEY',
      'XAI_API_KEY',
      'FONNTE_TOKEN',
      'CLOUDINARY_URL',
      'FIREBASE_SERVICE_ACCOUNT',
      'CLOUDINARY_UPLOAD_URL',
      'ALLOWED_DOCUMENT_HOSTS',
      'NETLIFY_SITE_URL',
      'ADMIN_MASTER_PIN',
      'PIN_MASTER',
      'PIN_KHOCI',
      'PIN_SACHOU',
      'PIN_AYOK',
      'PIN_KHOLIS',
      'SUPABASE_STORAGE_BUCKET',
      'HEALTH_TOKEN',
      'METRICS_SINK_URL',
      'METRICS_SINK_TOKEN',
      'METRICS_RECEIVER_TOKEN',
      'METRICS_NOTIFY_URL',
    ],
  },
};

// Values that look "set" but are template junk. Catching these stops a deploy
// that would technically succeed while pointing at a non-existent Supabase project.
const PLACEHOLDER_PATTERNS = [
  /^your[-_]/i,
  /YOUR_PROJECT_REF/i,
  /^changeme$/i,
  /^todo$/i,
  /^xxx+$/i,
  /^undefined$/i,
  /^\$\{\{.*\}\}$/, // unexpanded GitHub Actions expression
];

// ── The 4 KB Lambda env ceiling (LEGACY MODE ONLY) ───────────────────────────
//
// AWS Lambda compatibility mode injects the WHOLE environment into EVERY
// function, and caps it at 4096 bytes per function. Exceeding it does not warn —
// the deploy dies at function creation, AFTER a fully successful build.
//
// As of 2026-09-12 this site is on the modern Netlify Functions runtime, where
// Netlify states the limit "no longer applies". The check is kept as a
// diagnostic (and for anyone still on the legacy runtime), not as a blocker.
//
//   Failed to create function: invalid parameter for function creation:
//   Your environment variables exceed the 4KB limit imposed by AWS Lambda.
//   → 21× "Failed to upload file" → HTTP 400
//
// That happened on 2026-09-12 with 25 variables totalling ~4275 B, of which a
// single value (the Firebase service account JSON) was ~2402 B — 59 % of the
// budget. See docs/HANDOFF_4KB_ENV_LIMIT.md.
//
// This check is a PROXY: it sums key+value for the vars that are present in
// THIS process, so it only sees what has been exported. Under CI it sees the
// profile's variables; locally it usually sees almost nothing. It is therefore
// reported as a warning by default and only enforced with --budget-strict. That
// is deliberate — a gate that silently did nothing would be worse than no gate,
// so it always reports the number it computed and whether it is trustworthy.
const LAMBDA_ENV_LIMIT = 4096;
const BUDGET_WARN_RATIO = 0.85; // warn from 3482 B upward

function envBudget(required, optional) {
  const names = [...new Set([...required, ...optional])];
  const rows = [];
  let total = 0;
  let known = 0;

  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') continue;
    const bytes = name.length + 1 + Buffer.byteLength(String(raw), 'utf8');
    total += bytes;
    known++;
    rows.push({ name, bytes });
  }

  rows.sort((a, b) => b.bytes - a.bytes);
  return { rows, total, known, names: names.length };
}

function parseArgs(argv) {
  const args = { profile: 'build', strict: false, budget: false, budgetStrict: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile' || argv[i] === '-p') args.profile = argv[++i];
    else if (argv[i] === '--strict') args.strict = true;
    else if (argv[i] === '--list') args.list = true;
    else if (argv[i] === '--budget') args.budget = true;
    else if (argv[i] === '--budget-strict') {
      args.budget = true;
      args.budgetStrict = true;
    }
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.list) {
    console.log('Available profiles:', Object.keys(PROFILES).join(', '));
    for (const [name, p] of Object.entries(PROFILES)) {
      console.log(`\n[${name}] required (${p.required.length}):`);
      for (const v of p.required) console.log(`  - ${v}`);
      if (p.optional?.length) {
        console.log(`  optional (${p.optional.length}):`);
        for (const v of p.optional) console.log(`  - ${v}`);
      }
    }
    process.exit(0);
  }

  const profile = PROFILES[args.profile];
  if (!profile) {
    console.error(`Unknown profile "${args.profile}".`);
    console.error(`Available: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(2);
  }

  // Populate missing values from .env.local / .env.lokal / .env. process.env
  // always wins (applyEnvFiles never overwrites), so CI — which supplies these
  // from the GitHub Environment and has no such files in the checkout — behaves
  // exactly as before. Without this the gate could only ever run in CI: locally
  // it reported 0/8 present while the values sat in .env.local, which is how
  // `ci:predeploy` came to be unrunnable on a dev machine.
  //
  // Note the CI-only deploy credentials (NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID)
  // are deliberately absent from the env files, so `--profile production
  // --strict` still fails locally — correctly.
  applyEnvFiles();

  const extra = (process.env.REQUIRED_EXTRA || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const required = [...new Set([...profile.required, ...extra])];
  const optional = profile.optional || [];
  const allowPlaceholder = process.env.ALLOW_PLACEHOLDER === '1';

  console.log(`Environment gate — profile "${args.profile}"${args.strict ? ' (strict)' : ''}`);
  console.log('-'.repeat(56));

  const missing = [];
  const placeholder = [];
  const missingOptional = [];

  for (const name of required) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
      missing.push(name);
      console.log(`  MISSING     ${name}  (required)`);
      continue;
    }
    if (!allowPlaceholder && PLACEHOLDER_PATTERNS.some((re) => re.test(raw.trim()))) {
      placeholder.push(name);
      console.log(`  PLACEHOLDER ${name}  (required — looks like a template value)`);
      continue;
    }
    console.log(`  OK          ${name}  (${raw.length} chars, value hidden)`);
  }

  for (const name of optional) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
      missingOptional.push(name);
      console.log(`  absent      ${name}  (optional)`);
    } else {
      console.log(`  OK          ${name}  (${raw.length} chars, value hidden)`);
    }
  }

  console.log('-'.repeat(56));
  console.log(
    `required: ${required.length - missing.length - placeholder.length}/${required.length} present` +
      `  |  optional: ${optional.length - missingOptional.length}/${optional.length} present`
  );

  if (missingOptional.length) {
    console.log(
      `\nNote — optional vars not set: ${missingOptional.join(', ')}.\n` +
        `Features depending on them will be disabled at runtime.`
    );
    if (args.strict) {
      console.error('\nStrict mode: optional variables are treated as required.');
      process.exit(1);
    }
  }

  if (missing.length || placeholder.length) {
    console.error('\nENV GATE FAILED');
    if (missing.length) {
      console.error(`  Missing required variables: ${missing.join(', ')}`);
      console.error('  Add them to the matching GitHub Environment (Settings > Environments).');
    }
    if (placeholder.length) {
      console.error(`  Placeholder values detected: ${placeholder.join(', ')}`);
      console.error('  These are template defaults, not real credentials.');
    }
    process.exit(1);
  }

  // ── 4 KB Lambda env budget ─────────────────────────────────────────────────
  // Runs after the presence checks so a clean profile is summarised first.
  if (args.budget) {
    const { rows, total, known, names } = envBudget(required, optional);
    console.log('\nLambda env budget');
    console.log('-'.repeat(56));
    console.log(`  counted : ${known}/${names} variables visible to this process`);
    console.log(`  used    : ${total} B of ${LAMBDA_ENV_LIMIT} B  (${((total / LAMBDA_ENV_LIMIT) * 100).toFixed(1)}%)`);
    console.log(`  headroom: ${LAMBDA_ENV_LIMIT - total} B`);

    const top = rows.slice(0, 5);
    if (top.length) {
      console.log('  largest :');
      for (const r of top) {
        console.log(`      ${String(r.bytes).padStart(6)} B  ${r.name}`);
      }
    }

    // Under-reporting is the normal case outside CI. Say so out loud rather
    // than letting a small number imply there is plenty of room.
    if (known < names) {
      console.log(
        `\n  NOTE: ${names - known} variable(s) are not exported here, so this total is a\n` +
          '  LOWER BOUND, not the real payload. To measure the true figure against the\n' +
          '  deployed site, use `netlify env:list` (see HANDOFF.md for a ready snippet).'
      );
    }

    // 2026-09-12: this site now runs on the modern Netlify Functions runtime,
    // where the 4 KB ceiling does NOT apply — it is a Lambda compatibility mode
    // limit only. So this is informational by default, and fails only under
    // --budget-strict (kept for anyone still on the legacy runtime).
    //
    // This also makes the code match the comment above, which already said
    // "reported as a warning by default and only enforced with --budget-strict"
    // while the code exited unconditionally. The number is still worth printing:
    // a sudden jump means a credential was added to the environment.
    if (total > LAMBDA_ENV_LIMIT) {
      console.error(
        `\nENV BUDGET EXCEEDED — ${total} B > ${LAMBDA_ENV_LIMIT} B.\n` +
          '  Only a problem in Lambda compatibility mode; the limit is gone on the\n' +
          '  current runtime, so this will NOT fail the deploy.\n' +
          '  See docs/RENCANA_KELUAR_DARI_LAMBDA_MODE.md.' +
          (args.budgetStrict ? '' : '\n  (informational — pass --budget-strict to enforce)')
      );
      if (args.budgetStrict) process.exit(1);
    }

    if (total >= LAMBDA_ENV_LIMIT * BUDGET_WARN_RATIO) {
      console.error(
        `\nENV BUDGET WARNING — ${total} B is ≥ ${(BUDGET_WARN_RATIO * 100).toFixed(0)} % of the ` +
          `${LAMBDA_ENV_LIMIT} B limit.\n  Adding a few more variables will break the deploy.`
      );
      if (args.budgetStrict) process.exit(1);
    } else {
      console.log('  budget  : OK');
    }
  }

  console.log('\nENV GATE PASSED');
}

// Run only when executed directly, so the budget arithmetic can be unit-tested
// by importing this module. Without the guard, importing it would run the whole
// gate and call process.exit() inside the test process.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main();
}

export { envBudget, PROFILES, LAMBDA_ENV_LIMIT, BUDGET_WARN_RATIO };
