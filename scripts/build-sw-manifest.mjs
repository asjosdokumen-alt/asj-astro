#!/usr/bin/env node
/**
 * build-sw-manifest.mjs — Generate the service-worker precache manifest
 *
 * Why this exists
 * ---------------
 * `public/sw.js` used to precache only 5 shell URLs (`/`, `/index.html`,
 * `/candidate/`, ...). Every hashed asset in `/_astro/*` was therefore only
 * cached opportunistically, on second visit, by the stale-while-revalidate
 * handler. Result: the app was not actually installable-offline — a fresh
 * install that went offline could render the HTML shell but nothing else.
 *
 * This script runs AFTER `astro build` and rewrites the `PRECACHE` list
 * inside `dist/sw.js` with the real, hashed build output.
 *
 * Design decisions
 * ----------------
 * - We deliberately EXCLUDE the heavy lazy chunks (`xlsx`, `pdf-parse`). They
 *   are imported on demand by `_lib/template-loader.ts`; precaching them would
 *   add ~890 KB to the install payload for code most sessions never run.
 * - Fonts (`inter-*.woff2/.woff`) ARE included: they are small, needed for
 *   first paint, and would otherwise cause a FOUT offline.
 * - We include the HTML entry points that actually exist in `dist/`, read from
 *   disk — never a hard-coded list, so adding a page needs no edit here.
 * - The cache VERSION is derived from the build's asset hashes. Same content
 *   ⇒ same version ⇒ no pointless cache churn.
 *
 * Usage:  node scripts/build-sw-manifest.mjs
 * Wired into: package.json "build" (see postbuild note).
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const DIST = 'dist';
const SW = join(DIST, 'sw.js');

/** Lazy chunks that must NOT be precached (see header comment). */
const LAZY_EXCLUDE = [/^pdf-parse\./, /^xlsx\./];

/** Assets we never precache, by name pattern. */
const ASSET_INCLUDE = /\.(js|css|woff2?|svg|webp|png|ico)$/;

function fail(msg) {
  console.error(`[sw-manifest] ERROR: ${msg}`);
  process.exit(1);
}

if (!existsSync(DIST)) fail(`${DIST}/ not found — run "astro build" first.`);
if (!existsSync(SW)) fail(`${DIST}/sw.js not found — is public/sw.js present?`);

// ─── 1. Collect hashed assets from dist/_astro ───────────────────────────────
const astroDir = join(DIST, '_astro');
const assets = [];
if (existsSync(astroDir)) {
  for (const name of readdirSync(astroDir)) {
    if (!ASSET_INCLUDE.test(name)) continue;
    if (LAZY_EXCLUDE.some((re) => re.test(name))) continue;
    const full = join(astroDir, name);
    if (!statSync(full).isFile()) continue;
    assets.push({ url: '/_astro/' + name, size: statSync(full).size });
  }
}
assets.sort((a, b) => a.url.localeCompare(b.url));

// ─── 2. Collect HTML entry points that really exist ──────────────────────────
const pages = [];
function walkHtml(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkHtml(full);
    } else if (name.endsWith('.html')) {
      // `path.relative` yields backslashes on Windows; URLs must use `/`.
      const rel = relative(DIST, full).split(/[\\/]/).join('/');
      pages.push('/' + rel);
    }
  }
}
walkHtml(DIST);
pages.sort();

// ─── 3. Always-on shell routes (directory URLs Netlify serves) ───────────────
const SHELL = ['/', '/candidate/', '/admin/', '/public/'];

// ─── 4. Dedupe + build final list ────────────────────────────────────────────
const precache = [...new Set([...SHELL, ...pages, ...assets.map((a) => a.url)])].sort();

// ─── 5. Version from content hash of the manifest + asset sizes ──────────────
const h = createHash('sha256');
for (const a of assets) h.update(`${a.url}:${a.size}\n`);
for (const p of pages) h.update(`${p}\n`);
const VERSION = `asj-astro-${h.digest('hex').slice(0, 12)}`;

const totalBytes = assets.reduce((n, a) => n + a.size, 0);

// ─── 6. Rewrite sw.js: replace the VERSION + SHELL/PRECACHE block ────────────
let src = readFileSync(SW, 'utf8');

// Replace the VERSION constant. Matches both `asj-astro-v5-1788149736` and an
// already-generated `asj-astro-<hex>` so the script is idempotent.
// NB: `[^']*` never spans a newline, so no `\r` handling is needed here.
const versionRe = /const VERSION = '[^']*';/;
if (!versionRe.test(src)) fail('could not find "const VERSION = ..." in sw.js');
src = src.replace(versionRe, `const VERSION = '${VERSION}';`);

// Replace the precache array. The source ships a block delimited by markers so
// this rewrite is unambiguous; fall back to the legacy SHELL literal.
//
// IMPORTANT: this repo is developed on Windows, so the checked-in file has
// CRLF endings while the POSIX-authored literals below do not. Every pattern
// here must tolerate `\r?\n` — matching a bare `\n` silently fails on Windows
// and was the cause of the first "could not find PRECACHE block" failure.
const listBody = precache.map((u) => `  ${JSON.stringify(u)},`).join('\n');

const marked = /(\/\/ PRECACHE_START\r?\n)([\s\S]*?)(\/\/ PRECACHE_END)/;
const legacy = /const SHELL = \[[\s\S]*?\];/;

// The marker block spans the array *body only* — the `const PRECACHE = [` line
// lives OUTSIDE it so the markers stay valid on re-runs. (An earlier version
// swallowed the declaration, producing syntactically valid-looking output that
// was in fact `const VERSION = '...';\n  "/foo",\n  ...` — a syntax error.)
function replaceBody(text, body) {
  return text.replace(marked, (_m, open, _old, close) => `${open}${body}\n${close}`);
}

if (marked.test(src)) {
  src = replaceBody(src, listBody);
} else if (legacy.test(src)) {
  src = src.replace(
    legacy,
    `const PRECACHE = [\n// PRECACHE_START\n${listBody}\n// PRECACHE_END\n];`,
  );
} else {
  fail('could not find PRECACHE block or legacy SHELL array in sw.js');
}

writeFileSync(SW, src, 'utf8');

// ─── 7. Report ───────────────────────────────────────────────────────────────
console.log(`[sw-manifest] version   : ${VERSION}`);
console.log(`[sw-manifest] precache  : ${precache.length} URLs`);
console.log(`[sw-manifest]   pages   : ${pages.length}`);
console.log(`[sw-manifest]   assets  : ${assets.length} (${(totalBytes / 1024).toFixed(1)} KB)`);
if (assets.length === 0) {
  console.warn('[sw-manifest] WARNING: 0 hashed assets found — precache may be incomplete.');
}
