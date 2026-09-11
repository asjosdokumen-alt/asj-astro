/**
 * env-resolve.local.mjs — does the ACTUAL runtime loader resolve every key it
 * needs, from .env.local, as it exists on disk?
 *
 * scripts/ci/env-audit.local.mjs checks for literal `KEY=` lines. That is only
 * half the story: netlify/functions/_lib/env.ts also accepts aliases
 * (Service Role Key -> SUPABASE_SERVICE_ROLE_KEY) and pasted Netlify table rows
 * (| Production | value |). So a key can be "missing" by name and still resolve
 * at runtime. This script imports the real module and asks it directly.
 *
 * SAFETY: prints only KEY NAMES plus a yes/no and the value LENGTH. Never a
 * value, never a prefix, never a suffix.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const modPath = path.resolve('netlify/functions/_lib/env.ts');

// The loader is TypeScript; run it through the same transform the app uses.
const { env, debugFileEnvKeys } = await import(pathToFileURL(modPath).href);

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'SESSION_SECRET',
];

const IMPORTANT = [
  'FONNTE_TOKEN',
  'CLOUDINARY_URL',
  'GEMINI_API_KEY',
  'XAI_API_KEY',
  'GROQ_API_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'SUPABASE_JWT_SECRET',
  'ADMIN_MASTER_PIN',
  'ADMIN_NUMBERS',
  'FIREBASE_SERVICE_ACCOUNT',
];

function check(names, label) {
  console.log(`\n${label}`);
  let ok = 0;
  for (const n of names) {
    let v = '';
    try {
      v = env(n) || '';
    } catch (e) {
      console.log(`  ERROR     ${n}  (${e.message})`);
      continue;
    }
    const resolved = v.length > 0;
    if (resolved) ok++;
    const from = process.env[n] ? 'process.env' : 'file';
    console.log(
      `  ${resolved ? 'RESOLVED ' : 'EMPTY    '} ${n.padEnd(26)} ` +
        (resolved ? `len=${String(v.length).padStart(4)} via ${from}` : ''),
    );
  }
  console.log(`  -> ${ok}/${names.length}`);
  return { ok, total: names.length };
}

console.log('env-resolve — asking the REAL runtime loader (netlify/functions/_lib/env.ts)');
console.log(`file keys the loader managed to parse: ${debugFileEnvKeys().length}`);

const a = check(REQUIRED, 'REQUIRED for the function runtime');
const b = check(IMPORTANT, 'FEATURE keys (empty = that feature is disabled)');

// Sanity: the loader must not be silently picking up unrelated secrets.
const parsed = debugFileEnvKeys();
console.log(`\nloader parsed these keys from the file: ${parsed.join(', ') || '(none)'}`);

const pass = a.ok === a.total;
console.log(`\nRESULT: ${pass ? 'runtime-critical keys all resolve' : 'RUNTIME-CRITICAL KEYS MISSING'}`);
process.exit(pass ? 0 : 1);
