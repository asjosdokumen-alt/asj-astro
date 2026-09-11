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
    optional: ['GEMINI_API_KEY', 'XAI_API_KEY', 'FONNTE_TOKEN', 'CLOUDINARY_URL'],
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

function parseArgs(argv) {
  const args = { profile: 'build', strict: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile' || argv[i] === '-p') args.profile = argv[++i];
    else if (argv[i] === '--strict') args.strict = true;
    else if (argv[i] === '--list') args.list = true;
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

  console.log('\nENV GATE PASSED');
}

main();
