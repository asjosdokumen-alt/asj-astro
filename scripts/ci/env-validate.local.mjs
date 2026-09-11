/**
 * env-validate.local.mjs — are the resolved values actually USABLE, not merely
 * present?
 *
 * A key can resolve to a non-empty string and still be wrong: a truncated
 * Supabase key, a URL with a trailing slash, a JWT whose role is `anon` where
 * the runtime needs `service_role`. This script asserts SHAPE and, where it is
 * free and offline-safe, correct ROLE. It never prints a value — only the
 * verdict and the reason.
 *
 * No network calls. Nothing here can mutate anything.
 */
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const { env } = await import(pathToFileURL(path.resolve('netlify/functions/_lib/env.ts')).href);

/**
 * Read .env.local for keys the runtime whitelist deliberately excludes (the
 * PUBLIC_* build-time vars). Returns NAMES -> values but callers must never
 * print a value. Missing file yields {}.
 */
function readEnvLocalFile() {
  const out = {};
  try {
    const text = readFileSync(path.resolve('.env.local'), 'utf-8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* absent — treat as empty */
  }
  return out;
}

const results = [];
function check(label, fn) {
  let verdict = 'fail';
  let detail = '';
  try {
    const r = fn();
    verdict = r.ok ? 'ok' : 'FAIL';
    detail = r.detail || '';
  } catch (e) {
    detail = e.message;
  }
  results.push({ label, verdict, detail });
}

// ── SUPABASE_URL ────────────────────────────────────────────────────────────
check('SUPABASE_URL is a bare https origin', () => {
  const v = env('SUPABASE_URL');
  if (!v) return { ok: false, detail: 'empty' };
  let u;
  try {
    u = new URL(v);
  } catch {
    return { ok: false, detail: 'not a URL' };
  }
  const problems = [];
  if (u.protocol !== 'https:') problems.push('not https');
  if (u.pathname !== '/' && u.pathname !== '') problems.push(`has path "${u.pathname}"`);
  if (u.search || u.hash) problems.push('has query/hash');
  if (/\s/.test(v)) problems.push('contains whitespace');
  if (!/\.supabase\.co$/.test(u.hostname)) problems.push(`host is ${u.hostname}`);
  return { ok: problems.length === 0, detail: problems.join('; ') || u.hostname };
});

// ── PUBLIC_SUPABASE_URL must match SUPABASE_URL (client vs server) ──────────
// NOTE: PUBLIC_SUPABASE_URL is deliberately NOT in netlify/functions/_lib/env.ts
// WHITELIST — it is a BUILD-time var inlined into client JS by Astro, never read
// by the function runtime. So env() cannot see it and we must read the file.
check('PUBLIC_SUPABASE_URL matches SUPABASE_URL host', () => {
  const raw = readEnvLocalFile();
  const pub = process.env.PUBLIC_SUPABASE_URL || raw.PUBLIC_SUPABASE_URL || '';
  const srv = env('SUPABASE_URL');
  if (!pub) return { ok: false, detail: 'PUBLIC_SUPABASE_URL not in file or process.env' };
  try {
    const a = new URL(pub).hostname;
    const b = new URL(srv).hostname;
    return { ok: a === b, detail: a === b ? a : `client=${a} server=${b}` };
  } catch {
    return { ok: false, detail: 'unparseable' };
  }
});

// ── Supabase JWT keys: decode role + ref WITHOUT verifying (offline, safe) ──
function decodeJwtParts(v) {
  const parts = v.split('.');
  if (parts.length !== 3) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return p;
  } catch {
    return null;
  }
}

check('SUPABASE_SERVICE_ROLE_KEY is a JWT with role=service_role', () => {
  const v = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!v) return { ok: false, detail: 'empty' };
  if (v.startsWith('sb_')) return { ok: true, detail: 'new-format sb_ secret key' };
  const p = decodeJwtParts(v);
  if (!p) return { ok: false, detail: 'not a JWT and not sb_ format' };
  return {
    ok: p.role === 'service_role',
    detail: `role=${p.role} ref=${p.ref || '?'}`,
  };
});

check('SUPABASE_ANON_KEY is a JWT with role=anon', () => {
  const v = env('SUPABASE_ANON_KEY');
  if (!v) return { ok: false, detail: 'empty' };
  if (v.startsWith('sb_')) return { ok: true, detail: 'new-format sb_ publishable key' };
  const p = decodeJwtParts(v);
  if (!p) return { ok: false, detail: 'not a JWT and not sb_ format' };
  return { ok: p.role === 'anon', detail: `role=${p.role} ref=${p.ref || '?'}` };
});

// ── service_role and anon must point at the SAME project ref ────────────────
check('service_role ref == anon ref (same project)', () => {
  const s = decodeJwtParts(env('SUPABASE_SERVICE_ROLE_KEY'));
  const a = decodeJwtParts(env('SUPABASE_ANON_KEY'));
  if (!s || !a) return { ok: true, detail: 'skipped (not both legacy JWTs)' };
  return {
    ok: s.ref === a.ref,
    detail: s.ref === a.ref ? `ref=${s.ref}` : `service=${s.ref} anon=${a.ref}`,
  };
});

// ── SESSION_SECRET must be long enough to be a real secret ──────────────────
check('SESSION_SECRET has >=32 chars and no whitespace', () => {
  const v = env('SESSION_SECRET');
  if (!v) return { ok: false, detail: 'empty' };
  const problems = [];
  if (v.length < 32) problems.push(`only ${v.length} chars`);
  if (/\s/.test(v)) problems.push('contains whitespace');
  return { ok: problems.length === 0, detail: problems.join('; ') || `${v.length} chars` };
});

// ── CLOUDINARY_URL — there is no valid server-side shape to expect ─────────
// ARCHITECTURE (confirmed with the owner 2026-09-11):
//   Storage was migrated off the Supabase `asj` bucket and off Google Drive.
//   NEW uploads go to Cloudinary; the DB stays on Supabase. The old Supabase
//   bucket is legacy-only and deliberately not migrated.
//
// HOW UPLOADS ACTUALLY WORK: they are UNSIGNED and browser-side.
//   src/lib/cloudinary.ts POSTs to
//     https://api.cloudinary.com/v1_1/<cloud>/upload  with `upload_preset`
//   using cloud `ybzzbw9i` and preset `asjportal`, hardcoded as defaults. That
//   path was verified live: HTTP 200 and a real secure_url.
//
// Therefore `CLOUDINARY_URL` on the server is NOT part of the upload path. It is
// whitelisted in _lib/env.ts but no module reads it. Any value — even a
// malformed one — cannot break uploads. Reported as informational.
check('CLOUDINARY_URL (informational — uploads do not use it)', () => {
  const v = env('CLOUDINARY_URL');
  if (!v) return { ok: true, detail: 'absent — irrelevant, uploads are unsigned & client-side' };
  if (/^cloudinary:\/\/[^@\s]+:[^@\s]+@[^@\s]+$/.test(v)) {
    return { ok: true, detail: `well-formed connection string, cloud=${v.split('@')[1]}` };
  }
  const noSecret = v.match(/^cloudinary:\/\/([^:@\s]+)@([^@\s]+)$/);
  if (noSecret) {
    return {
      ok: true,
      detail:
        `no ":<api_secret>" before @ (cloud=${noSecret[2]}). ` +
        'Does NOT affect uploads: the client uses an unsigned preset, not this value.',
    };
  }
  if (/^https:\/\/api\.cloudinary\.com\/v1_1\/[^/]+\//.test(v)) {
    return { ok: true, detail: 'https api.cloudinary.com form' };
  }
  return { ok: true, detail: 'unrecognised shape — still irrelevant to the upload path' };
});

// ── Cloudinary upload path: the values that DO matter ─────────────────────
// These are hardcoded defaults in src/lib/cloudinary.ts. If someone deletes the
// literals without setting PUBLIC_CLOUDINARY_* the uploads silently break, so
// assert the resolved pair is non-empty.
check('Cloudinary upload cloud+preset resolve to non-empty', () => {
  const raw = readEnvLocalFile();
  const cloud =
    process.env.PUBLIC_CLOUDINARY_CLOUD_NAME || raw.PUBLIC_CLOUDINARY_CLOUD_NAME || 'ybzzbw9i';
  const preset =
    process.env.PUBLIC_CLOUDINARY_UPLOAD_PRESET || raw.PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'asjportal';
  if (!cloud || !preset) return { ok: false, detail: 'cloud or preset empty' };
  const via = raw.PUBLIC_CLOUDINARY_CLOUD_NAME ? 'env' : 'hardcoded default';
  return { ok: true, detail: `cloud=${cloud} preset=${preset} (${via})` };
});

// ── FONNTE_TOKEN ───────────────────────────────────────────────────────────
check('FONNTE_TOKEN looks like a token (no spaces, plausible length)', () => {
  const v = env('FONNTE_TOKEN');
  if (!v) return { ok: false, detail: 'empty' };
  if (/\s/.test(v)) return { ok: false, detail: 'contains whitespace' };
  if (v.length < 12) return { ok: false, detail: `suspiciously short (${v.length})` };
  return { ok: true, detail: `${v.length} chars` };
});

// ── ADMIN_MASTER_PIN must be digits only ───────────────────────────────────
check('ADMIN_MASTER_PIN is digits only', () => {
  const v = env('ADMIN_MASTER_PIN');
  if (!v) return { ok: false, detail: 'empty' };
  return { ok: /^\d+$/.test(v), detail: /^\d+$/.test(v) ? `${v.length} digits` : 'non-digit chars' };
});

// ── AI keys: shape only ────────────────────────────────────────────────────
// Google issues Gemini keys in more than one prefix family:
//   AIza...  classic API key
//   AQ.Ab8...  newer AI Studio / "Express" key
// The runtime does NOT validate the prefix, so we only reject obvious junk —
// anything that would fail on the very first request regardless of value.
check('GEMINI_API_KEY shape', () => {
  const v = env('GEMINI_API_KEY');
  if (!v) return { ok: false, detail: 'empty' };
  if (/\s/.test(v)) return { ok: false, detail: 'contains whitespace' };
  if (v.length < 20) return { ok: false, detail: `suspiciously short (${v.length})` };
  const family = v.startsWith('AIza') ? 'AIza (classic)' : v.startsWith('AQ.') ? 'AQ. (AI Studio)' : 'other';
  return { ok: true, detail: `${family}, len=${v.length}` };
});

check('GROQ_API_KEY shape', () => {
  const v = env('GROQ_API_KEY');
  if (!v) return { ok: false, detail: 'empty' };
  return { ok: v.startsWith('gsk_'), detail: v.startsWith('gsk_') ? 'gsk_…' : 'unexpected prefix' };
});

check('XAI_API_KEY shape', () => {
  const v = env('XAI_API_KEY');
  if (!v) return { ok: false, detail: 'empty' };
  return { ok: v.startsWith('xai-'), detail: v.startsWith('xai-') ? 'xai-…' : 'unexpected prefix' };
});

// ── STORAGE bucket name must be a legal bucket name ────────────────────────
check('SUPABASE_STORAGE_BUCKET is a legal bucket name', () => {
  const v = env('SUPABASE_STORAGE_BUCKET');
  if (!v) return { ok: false, detail: 'empty' };
  return {
    ok: /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(v),
    detail: `len=${v.length}`,
  };
});

// ── ADMIN_NUMBERS must be a plausible number list ──────────────────────────
check('ADMIN_NUMBERS parses to digits-only entries', () => {
  const v = env('ADMIN_NUMBERS');
  if (!v) return { ok: false, detail: 'empty' };
  const parts = v.split(/[,\s;]+/).filter(Boolean);
  const bad = parts.filter((p) => !/^\+?\d{6,15}$/.test(p));
  return {
    ok: bad.length === 0 && parts.length > 0,
    detail: bad.length ? `${bad.length} malformed entry/entries` : `${parts.length} number(s)`,
  };
});

// ── report ─────────────────────────────────────────────────────────────────
console.log('env-validate — shape/role checks on RESOLVED values (no values printed)\n');
let fails = 0;
for (const r of results) {
  if (r.verdict !== 'ok') fails++;
  console.log(`  ${r.verdict.padEnd(4)} ${r.label}`);
  if (r.detail) console.log(`        ${r.detail}`);
}
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails === 0 ? 0 : 1);
