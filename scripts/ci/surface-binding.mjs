#!/usr/bin/env node
/**
 * surface-binding.mjs — Entry point ⇄ surface binding gate (Phase A).
 *
 * WHY THIS EXISTS
 *   After Phase A, each netlify/functions/*.js entry point declares exactly
 *   which surface action maps it can resolve:
 *
 *     exports.handler = makeSurfaceHandler([NOTIFY_ACTIONS, AI_ACTIONS], [
 *       'simpanWaTemplate', ..., 'getJobStatus',
 *     ]);
 *
 *   Two failure modes are silent at runtime and only surface in production:
 *
 *     1. An allow-listed action is NOT in any declared map. The wrapper lets it
 *        through the allow-list check, the resolver returns null, and the caller
 *        gets a generic NOT_IMPLEMENTED — which reads like a business error, not
 *        a wiring bug.
 *     2. A declared map is not actually needed (dead import) — pure bundle
 *        weight, which is the thing Phase A exists to remove.
 *
 *   This gate makes both loud at build time. It caught two real breakages when
 *   the narrow binding was first introduced (getJobStatus routed to /notify but
 *   owned by the ai surface; simpanBiodataLengkap routed to /files but owned by
 *   master).
 *
 * SOURCE OF TRUTH
 *   surfaces/index.ts (the router) is authoritative for which surface owns an
 *   action. The router is also what bridge-links still dispatches through, so
 *   binding drift shows up here before it shows up as a 404.
 *
 * USAGE
 *   node scripts/ci/surface-binding.mjs
 *
 * EXIT CODES
 *   0  all bindings consistent
 *   1  binding violation
 *   2  parse error (file shape changed — update this script)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FN = join(ROOT, 'netlify/functions');

// ── 1. Router: action -> owning surface ─────────────────────────────────────
const routerSrc = readFileSync(join(FN, 'surfaces/index.ts'), 'utf8');
const router = {};
const pairRe = /^\s*([A-Za-z0-9_]+)\s*:\s*\(\)\s*=>\s*import\(['"]\.\/([^'"]+)['"]\)/gm;
let m;
while ((m = pairRe.exec(routerSrc))) router[m[1]] = m[2];

// ── 2. Surface module -> exported map name ──────────────────────────────────
// e.g. surfaces/notify.ts exports NOTIFY_ACTIONS.
const surfaceToMap = {};
for (const f of readdirSync(join(FN, 'surfaces'))) {
  if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
  const name = f.replace(/\.ts$/, '');
  const src = readFileSync(join(FN, 'surfaces', f), 'utf8');
  const em = src.match(/export const ([A-Z0-9_]+_ACTIONS)\b/);
  if (em) surfaceToMap[name] = em[1];
}

// ── 3. Entry points that use the narrow wrapper ─────────────────────────────
const entries = readdirSync(FN).filter((f) => f.endsWith('.js'));
const violations = [];
const notes = [];

for (const entry of entries) {
  const src = readFileSync(join(FN, entry), 'utf8');
  if (!src.includes('makeSurfaceHandler')) continue;

  const callRe = /makeSurfaceHandler\(\s*(\[[^\]]*\]|[A-Z0-9_]+_ACTIONS)\s*,\s*\[([\s\S]*?)\]\s*\)/;
  const call = src.match(callRe);
  if (!call) {
    violations.push(`${entry}: could not parse makeSurfaceHandler(...) — shape changed?`);
    continue;
  }

  const mapExpr = call[1].trim();
  const mapNames = mapExpr
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Resolve map constant -> surface module (via the require lines in the entry).
  const declaredSurfaces = [];
  for (const mapName of mapNames) {
    const reqRe = new RegExp(`const\\s*\\{\\s*${mapName}\\s*\\}\\s*=\\s*require\\(['"]\\./surfaces/([^'"]+)['"]\\)`);
    const rm = src.match(reqRe);
    if (!rm) {
      violations.push(`${entry}: declares ${mapName} but never requires it from ./surfaces/*`);
      continue;
    }
    declaredSurfaces.push(rm[1]);
  }

  const owned = new Set();
  for (const s of declaredSurfaces) {
    for (const [action, owner] of Object.entries(router)) {
      if (owner === s) owned.add(action);
    }
  }

  const allowed = call[2]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

  const unresolvable = allowed.filter((a) => !owned.has(a));

  for (const a of unresolvable) {
    const realOwner = router[a];
    violations.push(
      `${entry}: allow-lists '${a}' but its maps (${declaredSurfaces.join(', ') || 'none'}) ` +
        `do not own it${realOwner ? ` — router says surfaces/${realOwner}` : ' (not in router at all)'}`,
    );
  }

  // Dead-map note: declared but contributes no allow-listed action.
  for (const s of declaredSurfaces) {
    const used = allowed.some((a) => router[a] === s);
    if (!used) notes.push(`${entry}: declares surfaces/${s} but no allow-listed action uses it (dead weight)`);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
// Match the actual call site, not a mention in prose — several entries explain
// in a comment that they USED to be `makeHandler()`, which a bare substring
// test would misclassify as a catch-all.
const isNarrow = (src) => /exports\.handler\s*=\s*makeSurfaceHandler\(/.test(src);
const isCatchAll = (src) => /exports\.handler\s*=\s*makeHandler\(/.test(src);

const narrow = entries.filter((f) => isNarrow(readFileSync(join(FN, f), 'utf8')));
const catchAll = entries.filter((f) => isCatchAll(readFileSync(join(FN, f), 'utf8')));
const bespoke = entries.filter((f) => {
  const s = readFileSync(join(FN, f), 'utf8');
  return !isNarrow(s) && !isCatchAll(s);
});

console.log('');
console.log(`  router: ${Object.keys(router).length} actions across ${new Set(Object.values(router)).size} surfaces`);
console.log(`  narrow entry points   : ${narrow.length}  ${narrow.length ? '(' + narrow.join(', ') + ')' : ''}`);
console.log(`  catch-all entry points: ${catchAll.length}  ${catchAll.length ? '(' + catchAll.join(', ') + ')' : ''}`);
console.log(`  bespoke entry points  : ${bespoke.length}  ${bespoke.length ? '(' + bespoke.join(', ') + ')' : ''}`);
console.log('');

if (notes.length) {
  for (const n of notes) console.log(`  note: ${n}`);
  console.log('');
}

if (violations.length) {
  console.error('  SURFACE BINDING GATE FAILED');
  for (const v of violations) console.error(`    - ${v}`);
  console.error('');
  console.error('  Fix: add the owning surface map to the entry point\'s makeSurfaceHandler([...]),');
  console.error('       or remove the action from the allow-list and re-point the client.');
  console.error('');
  process.exit(1);
}

console.log('  surface binding gate: pass');
console.log('');
