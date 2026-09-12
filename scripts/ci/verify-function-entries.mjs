#!/usr/bin/env node
/**
 * verify-function-entries.mjs — catch the deploy-killer class of mistake
 *
 * WHY THIS GATE EXISTS
 * --------------------
 * Netlify scans `netlify/functions/` **FLAT at the root**: every `.js`/`.ts` file
 * sitting directly in that directory becomes a deployable function. That has two
 * consequences, and both have already caused real damage in this repo:
 *
 *   1. **A test file at the root kills the deploy.** `share-data.test.ts` lived
 *      there and imported `vitest` — a *devDependency*, and `netlify.toml` sets
 *      `NODE_ENV=production`, so devDeps are not installed at build time. The
 *      result was `Could not resolve "vitest"` and **three dead deploys** before
 *      anyone found it. It was moved to `e2e/` on 2026-09-11.
 *
 *   2. **A nested module that looks like an entry point becomes a public
 *      endpoint.** Subdirectories ARE scanned too (recursively); `_lib/` and
 *      `contexts/` are only safe because their top level contains no files.
 *      `surfaces/` has flat `.ts` files, so it deploys 15 functions that all
 *      answer 502 — ~3.6 MB of dead weight.
 *
 * Neither is visible to `ci:quality` as it was: `verify:io`, `bundle:size`,
 * `verify:binding` and 960 tests were all green while deploys were dead. This
 * gate closes that hole by asserting the *shape* of the directory, which is the
 * only thing Netlify actually keys on.
 *
 * USAGE
 *   node scripts/ci/verify-function-entries.mjs
 *   node scripts/ci/verify-function-entries.mjs --list   list resolved entries
 *
 * EXIT CODES  0 pass · 1 fail
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FN = join(ROOT, 'netlify/functions');

const violations = [];
const notes = [];

/** Files at the functions ROOT are deployed as entry points. */
function rootEntries() {
  return readdirSync(FN)
    .filter((n) => /\.(js|ts|mjs|cjs)$/.test(n))
    .sort();
}

const entries = rootEntries();

// ─── Check 1: no test file at the functions root ─────────────────────────────
// This is the exact mistake that killed three deploys.
const rootTests = entries.filter((n) => /\.test\.(ts|js|tsx)$/.test(n));
if (rootTests.length) {
  violations.push(
    `test file(s) at the functions ROOT: ${rootTests.join(', ')} — Netlify deploys ` +
      `these as functions, and a devDependency import (vitest) makes the whole build ` +
      `fail under NODE_ENV=production. Move to e2e/ or a subdirectory.`,
  );
} else {
  notes.push('no .test.* at the functions root');
}

// ─── Check 2: a root test's imports must not include a devDependency ─────────
// Belt-and-braces: if someone adds one in a subdirectory that IS scanned, we
// still want to know. Only checks files that would actually be bundled.
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const prodDeps = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
]);
const devOnly = new Set([
  ...Object.keys(pkg.devDependencies ?? {}),
  // Node builtins and the platform's own runtime are always available.
  'node:fs', 'node:path', 'node:url', 'node:crypto', 'node:vm', 'node:child_process',
]);

function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/(?:import[^'"]*from\s*|require\()\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (spec.startsWith('.') || spec.startsWith('node:')) continue;
    const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    out.add(pkgName);
  }
  return out;
}

const devImportsInEntries = [];
for (const name of entries) {
  const full = join(FN, name);
  if (!statSync(full).isFile()) continue;
  for (const dep of importsOf(full)) {
    if (devOnly.has(dep) && !prodDeps.has(dep)) {
      devImportsInEntries.push(`${name} imports devDependency "${dep}"`);
    }
  }
}
if (devImportsInEntries.length) {
  violations.push(
    `entry point(s) import a devDependency — fatal under NODE_ENV=production:\n      ` +
      devImportsInEntries.join('\n      '),
  );
} else {
  notes.push('no entry point imports a devDependency');
}

// ─── Check 3: no .test.* anywhere under the functions tree ───────────────────
// Tests belong in e2e/ or a subdirectory that is not deployed. Root-level
// .test.* is the fatal case (check 1); this is the wider net.
//
// NOTE on what is and is NOT deployed (corrected TWICE on 2026-09-12).
// The rule is neither "direct children only" nor "recursive". It is: a DIRECT
// subdirectory of the functions root is deployed as a function when it contains
// an entry file named `index.*` or `<dirname>.*`. Therefore:
//   surfaces/index.ts              -> DEPLOYED  (confirmed in the zisi manifest)
//   surfaces/registry.ts           -> not deployed (not `index`, not `surfaces`)
//   _lib/health.ts                 -> not deployed (not `index`, not `_lib`)
//   contexts/<name>/index.ts       -> not deployed (two levels deep)
//   contexts/*/service.ts          -> not deployed (not `index`)
// The original claim here — "direct children only" — produced correct production
// probes (_lib/health, _lib/metrics-sink, /service all 404) but the WRONG reason,
// and it wrongly concluded that `surfaces/` is not deployed at all.
//
// SECOND CORRECTION, same day. This block used to claim surfaces/ deploys
// "~15 functions" and that it is "not a deploy risk". Both were wrong:
//   * `zipFunctions` + the manifest it emits shows exactly ONE surfaces function
//     (the other 14 flat files are not entries), and
//   * that one function was `"bundler":"esbuild","runtimeAPIVersion":1` —
//     Lambda COMPATIBILITY MODE, where the 4 KB environment ceiling still
//     applies. So a single dead function was keeping the deploy-killer alive for
//     the whole site even after all 21 real entries had migrated to
//     `runtimeAPIVersion: 2`.
// Fix: `surfaces/index.ts` -> `surfaces/registry.ts`, which drops it from the
// deploy entirely. Check 3b below now asserts the rule instead of documenting it,
// so this cannot come back silently.
//
// Lesson: a gate that infers deployment from a naming convention must verify that
// convention against the bundler's own output — not against a comment.
const KNOWN_DEBT_DIRS = {};

const testsInTree = [];
function walkTests(dir, rel = '') {
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, dirent.name);
    const relPath = rel ? `${rel}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      if (dirent.name === 'node_modules') continue;
      walkTests(full, relPath);
    } else if (/\.test\.(ts|js|tsx)$/.test(dirent.name)) {
      testsInTree.push(relPath);
    }
  }
}
walkTests(FN);

const dangerousTests = testsInTree.filter((p) => !p.includes('/'));
if (dangerousTests.length) {
  violations.push(
    `test file(s) at the DEPLOYED level: ${dangerousTests.join(', ')} — these are direct ` +
      `children of the functions directory and WILL be bundled as entry points.`,
  );
} else {
  notes.push(`${testsInTree.length} test file(s) under the functions tree, all in non-deployed subdirs`);
}

const debtNames = Object.keys(KNOWN_DEBT_DIRS);
if (debtNames.length) notes.push(`known debt dirs (not deploy risks): ${debtNames.join(', ')}`);

// ─── Check 3b: no direct subdirectory deploys as a function ──────────────────
// The deploy rule, verified against the zisi manifest rather than a comment: a
// DIRECT subdirectory of the functions root becomes a function when it contains
// an entry file named `index.*` or `<dirname>.*`. Such a function carries no
// handler of ours — `surfaces/index.ts` proved it — so Netlify falls back to
// Lambda compatibility mode, where the 4 KB env ceiling still applies. One such
// directory is enough to kill the whole deploy, so assert the absence instead of
// trusting the naming convention to stay correct.
const SUBDIR_ENTRY_RE = /\.(js|ts|mjs|cjs)$/;
const subdirEntries = [];
for (const dirent of readdirSync(FN, { withFileTypes: true })) {
  if (!dirent.isDirectory() || dirent.name === 'node_modules') continue;
  const dir = dirent.name;
  for (const f of readdirSync(join(FN, dir))) {
    if (!SUBDIR_ENTRY_RE.test(f) || /\.test\.(ts|js|tsx)$/.test(f)) continue;
    const stem = f.replace(SUBDIR_ENTRY_RE, '');
    if (stem === 'index' || stem === dir) subdirEntries.push(`${dir}/${f}`);
  }
}
if (subdirEntries.length) {
  violations.push(
    `subdirectory file(s) would deploy as functions with no handler -> Lambda ` +
      `compatibility mode -> the 4 KB env ceiling applies to the whole deploy: ` +
      `${subdirEntries.join(', ')}. Rename so the file is neither 'index.*' nor '<dirname>.*'.`,
  );
} else {
  notes.push('no direct subdirectory deploys as a function (no Lambda-compat entries)');
}

// ─── Check 4: each root entry exports a handler ──────────────────────────────
// A root file with no `handler` export is still deployed and still 404/502s.
const noHandler = [];
for (const name of entries) {
  const full = join(FN, name);
  const src = readFileSync(full, 'utf8');
  // Two shapes are accepted, because the platform accepts two:
  //   legacy — `exports.handler = ...`   (Lambda compatibility mode)
  //   modern — `export default ...`      (the current Netlify Functions runtime)
  //
  // This site migrated to the modern runtime on 2026-09-12. The reason was not
  // style: Lambda compatibility mode caps the total environment at 4 KB per
  // function, and this repo's env set was 4275 B — the deploy died at function
  // creation AFTER a successful build. See docs/RENCANA_KELUAR_DARI_LAMBDA_MODE.md.
  //
  // The legacy pattern is still accepted on purpose, so the migration can be
  // reversed one file at a time if something goes wrong in production.
  const hasHandler =
    /exports\.handler\s*=/.test(src) ||
    /export\s+default\b/.test(src) ||
    /export\s+(?:const|async function|function)\s+handler\b/.test(src) ||
    /export\s*\{[^}]*\bhandler\b[^}]*\}/.test(src);
  if (!hasHandler) noHandler.push(name);
}
if (noHandler.length) {
  violations.push(
    `root entry point(s) do not export a handler: ${noHandler.join(', ')} — ` +
      `Netlify will deploy them and every invocation answers 502 HandlerNotFound.`,
  );
} else {
  notes.push(`all ${entries.length} root entries export a handler`);
}

// ─── Report ──────────────────────────────────────────────────────────────────
if (process.argv.includes('--list')) {
  console.log(`root entry points (${entries.length}):`);
  for (const e of entries) console.log(`  ${e}`);
  console.log('\nsubdirectories:');
  for (const d of readdirSync(FN, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = join(FN, d.name);
    const flat = readdirSync(dir).filter((n) => /\.(js|ts)$/.test(n));
    const nested = readdirSync(dir).filter((n) => {
      try { return statSync(join(dir, n)).isDirectory(); } catch { return false; }
    });
    console.log(
      `  ${d.name}/ — ${flat.length} flat file(s), ${nested.length} nested dir(s)` +
        (flat.length ? '   <-- deployed as functions' : '   (safe: no flat files)'),
    );
  }
  console.log('');
}

console.log(`[function-entries] root entries: ${entries.length}`);
for (const n of notes) console.log(`  ok   ${n}`);
if (violations.length) {
  console.log('[function-entries] violations:');
  for (const v of violations) console.log(`  FAIL ${v}`);
  console.error(`\n[function-entries] FAILED — ${violations.length} violation(s).`);
  process.exit(1);
}
console.log(`\n[function-entries] OK — the functions tree matches what Netlify will deploy.`);
