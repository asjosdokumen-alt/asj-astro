#!/usr/bin/env node
/**
 * verify-aliases.mjs — Local gate: exactly ONE entry point may use the full router.
 *
 * WHY THIS EXISTS (and why it replaced a network probe)
 * -----------------------------------------------------
 * This script used to POST to the 11 legacy catch-all paths on a live site and
 * assert they answered 200, treating a 200 as proof the path was still needed.
 * That reasoning was backwards, and a real probe proved it:
 *
 *   POST /.netlify/functions/apply     {"action":"getAppData"} -> 200, real rows
 *   POST /.netlify/functions/whatsapp  {"action":"getAppData"} -> 200, real rows
 *
 * A 200 there did not mean "this path has a legitimate dependent". It meant the
 * file was `exports.handler = makeHandler()` — the FULL router with no
 * allow-list — so it answered EVERY action, including actions owned by surfaces
 * it had no business serving. Each of those "109-byte stubs" bundled to
 * ~1,508 KB, because makeHandler statically imports surfaces/registry, which pulls
 * in all 15 surfaces and 14 contexts. 11 stubs x ~1.5 MB = ~16.6 MB of the
 * ~21 MB deployed, all of it an unaudited public entry point that bypassed the
 * per-surface boundary.
 *
 * So the gate was checking the wrong thing: "does it answer?" is always yes for
 * a catch-all. The invariant worth enforcing is structural, and it is testable
 * offline with no network and no Netlify API calls:
 *
 *     ONLY bridge-links.js MAY CALL makeHandler().
 *
 * Every other file under netlify/functions/ must use makeSurfaceHandler with an
 * explicit allow-list. That keeps each deployed function narrow (it can only
 * reach the modules its own surface needs) and keeps the boundary honest.
 *
 * The legacy paths are now gone. Nothing in src/, scripts/, e2e/ or public/
 * ever referenced them — the aliases that were supposed to serve old QR codes
 * were rejected by Netlify at parse time ("path" field must not start with
 * "/.netlify"), so those URLs never worked through the alias layer anyway.
 *
 * USAGE
 *   node scripts/ci/verify-aliases.mjs
 *
 * EXIT CODES
 *   0  invariant holds
 *   1  a violation was found
 *   2  configuration problem (cannot scan the functions directory)
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FUNCTIONS_DIR = join(ROOT, 'netlify', 'functions');

/** The one entry point allowed to reach surfaces/registry via makeHandler(). */
const FULL_ROUTER_ALLOWED = new Set(['bridge-links.js']);

/** Root-level files that Netlify bundles as deployable functions. */
function entryPoints() {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(js|ts|mjs|cjs)$/.test(e.name))
    .map((e) => e.name);
}

function main() {
  if (!existsSync(FUNCTIONS_DIR)) {
    console.error(`verify-aliases: ${relative(ROOT, FUNCTIONS_DIR)} not found.`);
    process.exit(2);
  }

  const entries = entryPoints();
  if (entries.length === 0) {
    console.error('verify-aliases: no entry points found — refusing to pass vacuously.');
    process.exit(2);
  }

  const violations = [];
  let surfaceWrapped = 0;
  let fullRouter = 0;

  for (const name of entries) {
    const full = join(FUNCTIONS_DIR, name);
    const src = readFileSync(full, 'utf8');

    const usesFullRouter = /\bmakeHandler\s*\(/.test(src) && !/\bmakeSurfaceHandler\b/.test(src);
    const usesSurface = /\bmakeSurfaceHandler\b/.test(src);

    if (usesFullRouter && !FULL_ROUTER_ALLOWED.has(name)) {
      violations.push(
        `${name}: calls makeHandler() (full router). Only bridge-links.js may. ` +
          `Use makeSurfaceHandler(<ACTIONS>, [...]) from _lib/netlify-wrapper-surface.`,
      );
    }
    if (usesFullRouter) fullRouter++;
    if (usesSurface) surfaceWrapped++;
  }

  // The fallback must still exist — apiEndpoint.ts routes unknown actions to it.
  if (!existsSync(join(FUNCTIONS_DIR, 'bridge-links.js'))) {
    violations.push(
      'bridge-links.js is missing. It is the documented 404 fallback target ' +
        '(src/lib/apiEndpoint.ts FALLBACK) and must stay.',
    );
  }

  console.log('');
  console.log(`  scanned ${entries.length} entry point(s) in netlify/functions/`);
  console.log(`    ${surfaceWrapped} via makeSurfaceHandler (narrow, allow-listed)`);
  console.log(`    ${fullRouter} via makeHandler (full router)`);
  console.log('');

  if (violations.length) {
    console.error('  INVARIANT VIOLATED.');
    for (const v of violations) console.error(`    - ${v}`);
    console.error('');
    console.error('  A makeHandler() entry point is a catch-all: it answers every action');
    console.error('  with no allow-list and inlines all 15 surfaces + 14 contexts (~1.5 MB).');
    console.error('');
    process.exit(1);
  }

  console.log('  OK — bridge-links.js is the only full-router entry point.');
  console.log('');
  console.log('  Context: the 11 legacy catch-all stubs (apply, whatsapp, drive-links,');
  console.log('  admin-ai-context, ai-form-submit, rincian-presets, save-ai-cv,');
  console.log('  save-master, schedule-reminders, submit-apply, submit-siswa-baru) were');
  console.log('  deleted 2026-09-11. They had zero references in src/, scripts/, e2e/ and');
  console.log('  public/, served no working alias, and each was an unrestricted public');
  console.log('  monolith. Reclaiming them cut ~16.6 MB of deployed bundles.');
  console.log('');
}

main();
