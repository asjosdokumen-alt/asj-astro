#!/usr/bin/env node
/**
 * verify-pwa.mjs — PWA integrity gate
 *
 * Guards three things that have silently regressed before:
 *
 *   1. `dist/sw.js` parses and its PRECACHE list is non-trivial. A generator
 *      bug once emitted `const VERSION = '...';\n  "/foo",` (syntax error) and
 *      would have shipped a dead service worker.
 *   2. Every manifest icon `src` exists under `public/` (or `dist/`). The
 *      manifest previously pointed at an external Supabase Storage URL, so an
 *      unreachable bucket meant no icon and an un-installable PWA.
 *   3. `BaseLayout.astro` references only local icon paths — no remote `icon`
 *      or `apple-touch-icon` hrefs.
 *
 * Run after `astro build`:  node scripts/ci/verify-pwa.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const failures = [];
const notes = [];

function check(cond, msg) {
  if (cond) notes.push(`  ok   ${msg}`);
  else failures.push(`  FAIL ${msg}`);
}

// ─── 1. Service worker ───────────────────────────────────────────────────────
const SW_DIST = 'dist/sw.js';
if (!existsSync(SW_DIST)) {
  failures.push('  FAIL dist/sw.js missing — run `npm run build` first');
} else {
  const sw = readFileSync(SW_DIST, 'utf8');

  // Parseable as a script? (no DOM/eval; `node --check` equivalent via Function)
  let parseError = null;
  try {
    // eslint-disable-next-line no-new-func
    new Function(sw);
  } catch (e) {
    parseError = e.message;
  }
  check(!parseError, `dist/sw.js is syntactically valid${parseError ? ` (${parseError})` : ''}`);

  const m = sw.match(/const PRECACHE = \[([\s\S]*?)\r?\n\];/);
  check(!!m, 'dist/sw.js declares a PRECACHE array');

  if (m) {
    const urls = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    check(urls.length >= 20, `PRECACHE has ${urls.length} entries (>= 20)`);
    check(
      urls.some((u) => u.startsWith('/_astro/')),
      'PRECACHE includes hashed /_astro assets',
    );
    check(
      urls.some((u) => u.endsWith('.html') || u.endsWith('/')),
      'PRECACHE includes HTML entry points',
    );
    const bs = String.fromCharCode(92);
    const badSep = urls.filter((u) => u.includes(bs));
    check(badSep.length === 0, `no Windows backslash paths in PRECACHE (${badSep.length} found)`);
    check(
      !urls.some((u) => /\/pdf-parse\.|\/xlsx\./.test(u)),
      'lazy-only chunks (pdf-parse, xlsx) are NOT precached',
    );
  }

  const v = sw.match(/const VERSION = '([^']+)'/);
  check(!!v, 'dist/sw.js declares a VERSION');
  if (v) {
    check(
      v[1] !== 'asj-astro-dev',
      `VERSION was rewritten at build time (got "${v[1]}")`,
    );
  }
}

// ─── 2. Manifest icons resolve locally ───────────────────────────────────────
const MANIFEST = 'public/manifest.webmanifest';
if (!existsSync(MANIFEST)) {
  failures.push('  FAIL public/manifest.webmanifest missing');
} else {
  let mf = null;
  try {
    mf = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    notes.push('  ok   manifest is valid JSON');
  } catch (e) {
    failures.push(`  FAIL manifest is not valid JSON: ${e.message}`);
  }

  if (mf) {
    check(Array.isArray(mf.icons) && mf.icons.length > 0, 'manifest declares icons');

    const remote = [];
    const missing = [];
    for (const icon of mf.icons ?? []) {
      if (/^https?:\/\//i.test(icon.src)) {
        remote.push(icon.src);
        continue;
      }
      // Icons live in public/ and are copied verbatim to dist/.
      const candidates = [join('public', icon.src), join('dist', icon.src)];
      if (!candidates.some((p) => existsSync(p))) missing.push(icon.src);
    }
    check(remote.length === 0, `no remote icon URLs in manifest (${remote.length} found)`);
    check(missing.length === 0, `all manifest icons exist on disk (${missing.join(', ')})`);

    const sizes = new Set((mf.icons ?? []).map((i) => i.sizes));
    check(sizes.has('192x192'), 'manifest ships a 192x192 icon');
    check(sizes.has('512x512'), 'manifest ships a 512x512 icon');
    check(
      (mf.icons ?? []).some((i) => i.purpose === 'maskable'),
      'manifest ships a maskable icon',
    );
    check(!!mf.start_url, 'manifest declares start_url');
    check(!!mf.display, 'manifest declares display');
  }
}

// ─── 3. Layout references only local icons ───────────────────────────────────
const LAYOUT = 'src/layouts/BaseLayout.astro';
if (!existsSync(LAYOUT)) {
  failures.push('  FAIL src/layouts/BaseLayout.astro missing');
} else {
  const lay = readFileSync(LAYOUT, 'utf8');
  const remoteHref = [...lay.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*href="(https?:\/\/[^"]+)"/g)];
  check(
    remoteHref.length === 0,
    `BaseLayout uses only local icon hrefs (${remoteHref.length} remote found)`,
  );

  const apple = lay.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/);
  if (apple && !/^https?:/i.test(apple[1])) {
    const p = join('public', apple[1]);
    check(existsSync(p), `apple-touch-icon target exists (${apple[1]})`);
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────
console.log('[verify-pwa] checks:');
for (const n of notes) console.log(n);
if (failures.length) {
  console.log('[verify-pwa] failures:');
  for (const f of failures) console.log(f);
  console.error(`\n[verify-pwa] FAILED — ${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\n[verify-pwa] OK — ${notes.length} checks passed.`);
