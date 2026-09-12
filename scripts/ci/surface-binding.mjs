#!/usr/bin/env node
/**
 * surface-binding.mjs — Entry point ⇄ surface binding gate (Phase A).
 *
 * WHY THIS EXISTS
 *   After Phase A, each netlify/functions/*.js entry point declares exactly
 *   which surface action maps it can resolve:
 *
 *     export default adapt(makeSurfaceHandler([NOTIFY_ACTIONS, AI_ACTIONS], [
 *       'simpanWaTemplate', ..., 'getJobStatus',
 *     ]));
 *
 *   (The `adapt(...)` wrapper is from the 2026-09-12 migration to the modern
 *   Netlify runtime; the legacy `exports.handler =` form is still accepted.)
 *
 *   Three failure modes are silent at runtime and only surface in production:
 *
 *     1. An allow-listed action is NOT in any declared map. The wrapper lets it
 *        through the allow-list check, the resolver returns null, and the caller
 *        gets a generic NOT_IMPLEMENTED — which reads like a business error, not
 *        a wiring bug.
 *     2. A declared map is not actually needed (dead import) — pure bundle
 *        weight, which is the thing Phase A exists to remove.
 *     3. A routed action is in NO entry's allow-list, so it is reachable only
 *        through the bridge-links catch-all. apiClient's 404 retry makes this
 *        WORK, which is precisely why it is never noticed. Added 2026-09-12
 *        after finding four live instances (see section 4).
 *
 *   This gate makes all three loud at build time. It caught two real breakages
 *   when the narrow binding was first introduced (getJobStatus routed to /notify
 *   but owned by the ai surface; simpanBiodataLengkap routed to /files but owned
 *   by master).
 *
 * SOURCE OF TRUTH
 *   surfaces/registry.ts (the router) is authoritative for which surface owns an
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
// NOTE: this file is deliberately NOT named index.ts. Netlify deploys
// `<subdir>/index.*` (and `<subdir>/<subdir>.*`) as a function, so an
// `index.ts` here would ship the whole router as a Lambda-compatibility-mode
// function with no handler — which keeps the 4 KB env ceiling alive for the
// entire deploy. Renaming it to `registry.ts` removes it from the deploy.
const routerSrc = readFileSync(join(FN, 'surfaces/registry.ts'), 'utf8');
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
// action -> [entry, ...] for every NARROW entry that allow-lists it.
// Built here so section 4 can answer "is this action reachable without the
// catch-all?" from the same parse that section 3 already does.
const narrowAllowed = new Map();

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

  // Resolve map constant -> surface module (via the import lines in the entry).
  //
  // Two shapes are accepted, because the repo has two: the legacy CommonJS
  // `const { X } = require(...)` and the ESM `import { X } from ...` that the
  // 2026-09-12 migration to the modern Netlify runtime introduced. Only the
  // binding syntax changed — what this gate checks is identical either way.
  const declaredSurfaces = [];
  for (const mapName of mapNames) {
    const reqRe = new RegExp(
      `const\\s*\\{\\s*${mapName}\\s*\\}\\s*=\\s*require\\(['"]\\./surfaces/([^'"]+)['"]\\)` +
        `|import\\s*\\{\\s*${mapName}\\s*\\}\\s*from\\s*['"]\\./surfaces/([^'"]+?)(?:\\.js)?['"]`,
    );
    const rm = src.match(reqRe);
    if (!rm) {
      violations.push(`${entry}: declares ${mapName} but never imports it from ./surfaces/*`);
      continue;
    }
    declaredSurfaces.push(rm[1] ?? rm[2]);
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

  // Record for the reachability rule (section 4).
  for (const a of allowed) {
    if (!narrowAllowed.has(a)) narrowAllowed.set(a, []);
    narrowAllowed.get(a).push(entry);
  }

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

// ── 4. Reachability: every routed action needs a NARROW home ────────────────
//
// THE RULE
//   An action that is in the router but in NO entry's allow-list is reachable
//   only through bridge-links — the single catch-all, which ships the full
//   action router (all 15 surfaces + 14 contexts).
//
// WHY THIS IS A FAILURE AND NOT A NOTE
//   It does not look broken. src/lib/apiClient.ts retries a 404 onto the
//   catch-all, which answers, so the feature WORKS — just on the heaviest
//   function in the repo, behind a wasted round-trip, with a dependency that
//   nothing declares. That is why it survives review, and why it needs a gate.
//
//   Four real instances were found this way on 2026-09-12, all of them live:
//     parseDokumenBiodata        real feature, absent from apiEndpoint.ts, so it
//                                fell to FALLBACK on every call
//     getShareTokenForJob        routed to /jobs but missing from jobs.js's
//                                allow-list → 404 → silent retry each open
//                                (the action itself was retired 2026-09-13:
//                                the share link is public by job code again)
//     getAppConfig               surfaces/diagnostics.ts had no entry point
//     reportWebVital             same — and called on every page view by the
//                                deployed legacy client
//
// EXEMPTIONS
//   An action may be exempted only for a DELIBERATE routing decision, never
//   because it has not been got to yet. Each entry must carry its reason.
const REACHABILITY_EXEMPT = new Map([
  // (empty — every routed action currently has a narrow home)
  //
  // Note: getHealth needs no entry here. It is absent from the router on
  // purpose (see surfaces/registry.ts) and is served by health.js behind a shared
  // secret, so it can never appear in the orphan list.
]);

const orphaned = Object.keys(router).filter(
  (a) => !narrowAllowed.has(a) && !REACHABILITY_EXEMPT.has(a),
);

for (const a of orphaned) {
  violations.push(
    `router action '${a}' (surfaces/${router[a]}) is in NO entry point's allow-list — ` +
      `reachable only via the bridge-links catch-all. Add it to the owning entry ` +
      `(netlify/functions/*.js) and to src/lib/apiEndpoint.ts, or exempt it with a reason.`,
  );
}

// Duplicate homes: two entries allow-listing the same action. Sometimes
// deliberate (getJobStatus is polled on both /ai-chat and /notify), sometimes
// rot (an entry left behind after a rename). Reported, never failed — the
// decision is human.
for (const [a, homes] of narrowAllowed) {
  if (homes.length > 1) {
    notes.push(`'${a}' is allow-listed by ${homes.length} entries (${homes.join(', ')}) — deliberate?`);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
// Match the actual call site, not a mention in prose — several entries explain
// in a comment that they USED to be `makeHandler()`, which a bare substring
// test would misclassify as a catch-all.
// Both module shapes are recognised: the legacy `exports.handler =` assignment
// and the modern `export default adapt(...)` wrapper. Without the second form
// every entry point would be misreported as "bespoke", which would quietly
// turn this gate into a no-op — the exact failure mode it exists to prevent.
const isNarrow = (src) =>
  /export\s+default\s+adapt\(\s*makeSurfaceHandler\(/.test(src) ||
  /exports\.handler\s*=\s*makeSurfaceHandler\(/.test(src);
const isCatchAll = (src) =>
  /export\s+default\s+adapt\(\s*makeHandler\(/.test(src) ||
  /exports\.handler\s*=\s*makeHandler\(/.test(src);

const narrow = entries.filter((f) => isNarrow(readFileSync(join(FN, f), 'utf8')));
const catchAll = entries.filter((f) => isCatchAll(readFileSync(join(FN, f), 'utf8')));
const bespoke = entries.filter((f) => {
  const s = readFileSync(join(FN, f), 'utf8');
  return !isNarrow(s) && !isCatchAll(s);
});

console.log('');
console.log(`  router: ${Object.keys(router).length} actions across ${new Set(Object.values(router)).size} surfaces`);
console.log(
  `  routed via narrow entry: ${Object.keys(router).length - orphaned.length}` +
    ` / ${Object.keys(router).length}` +
    (orphaned.length ? `  (${orphaned.length} orphaned -> catch-all only)` : '  (none orphaned)'),
);
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
