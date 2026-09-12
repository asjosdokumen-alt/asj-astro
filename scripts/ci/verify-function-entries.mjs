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
// NOTE on what is and is NOT deployed (verified against production 2026-09-12):
// Netlify deploys **direct children of the `directory` only**. `_lib/` (28 flat
// files), `contexts/` (13) and `shared/` (1) are NOT deployed — probing their
// basenames on production returns 404 for every one. An earlier version of this
// gate assumed the scan was recursive and flagged all three; that premise was
// wrong and the gate was corrected rather than the directories.
//
// The one directory that IS a real problem is `surfaces/`: it is not referenced
// as an entry point by anything, and bundling it as a catch-all costs ~1.5 MB
// (see the "never reach surfaces/index" rule). It is tracked as known debt.
const KNOWN_DEBT_DIRS = {
  surfaces:
    'not deployed as functions, but bundled by bridge-links.js via surfaces/index ' +
    '(~1.5 MB). Retiring it is a Phase A follow-up, tracked — not a deploy risk.',
};

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

notes.push(`known debt dirs (not deploy risks): ${Object.keys(KNOWN_DEBT_DIRS).join(', ')}`);

// ─── Check 4: each root entry exports a handler ──────────────────────────────
// A root file with no `handler` export is still deployed and still 404/502s.
const noHandler = [];
for (const name of entries) {
  const full = join(FN, name);
  const src = readFileSync(full, 'utf8');
  const hasHandler =
    /exports\.handler\s*=/.test(src) ||
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
