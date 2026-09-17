#!/usr/bin/env node
/**
 * verify-validation-coverage.mjs — is input validated at the handler edge?
 *
 * WHY THIS EXISTS
 *   On 2026-09-16 three documents described edge validation as universal:
 *
 *     docs/ARCHITECTURE.md          "✅ Zod validation at API edge"
 *     docs/ENGINEERING_PLAYBOOK.md  "Already the pattern; keep it"
 *     docs/CODE_REVIEW_CHECKLIST.md "All input validated by a Zod schema at
 *                                    the handler edge"
 *
 *   Measured, none of that was true. `validatePayload()` had exactly 7 call
 *   sites, ALL of them in surfaces/auth.ts, against 81 routed actions. The
 *   `jobs` surface was the worst of it: four actions read an argument as
 *   `unknown` and handed it straight to a PostgREST body whose column is TEXT.
 *
 *   The defect was not the missing schemas — it was that a documented claim
 *   about coverage had no way to be measured, so it drifted for weeks and every
 *   reader of those documents was misled. This gate is the measuring instrument.
 *
 * WHAT IT MEASURES
 *   For every action in the MUTATING set (the second allow-list, in
 *   `_lib/handlers.ts` — the repo's own declaration of which actions write),
 *   does the payload get validated on the way in? It resolves the action's
 *   surface entry, follows the `handle*` identifiers that entry calls, and asks
 *   whether any of those bodies validates the payload.
 *
 *   TWO VALIDATION MECHANISMS COUNT, and the second exists for a measured
 *   reason rather than a stylistic one:
 *
 *     validatePayload()  zod-based (`_lib/kernel/validate.ts`). Preferred, but
 *                        zod costs ~67 KB in an entry point's bundle, so it is
 *                        only affordable where it is already paid for.
 *     guardPayload()     dependency-free (`_lib/kernel/guard.ts`). Used in the
 *                        narrow entries, which have an 8 KB growth floor under
 *                        `bundle:size`.
 *
 *   Measured 2026-09-16: importing `validate.ts` into `contexts/jobs` and
 *   `contexts/applications` added ~67 KB to EIGHT entry points and pushed
 *   `files.js` over the 600 KB hard ceiling. The guard split costs ~5 KB.
 *   A gate that only recognised zod would therefore have pushed the next
 *   contributor back into a regression it cannot see.
 *
 *   Read-only actions are out of scope on purpose: the risk this gate is about
 *   is unvalidated input reaching a WRITE.
 *
 * WHY A RATCHET AND NOT A HARD RULE
 *   Demanding a schema for all ~34 mutating actions in one commit is how a
 *   standard gets abandoned — the same reasoning `lint-ratchet` and
 *   `typecheck-ratchet` already encode in this repo. So the unvalidated set is
 *   frozen in `.ci/validation-baseline.json` and may only SHRINK:
 *
 *     - a new mutating action with no edge validation      -> FAIL
 *     - a baseline entry that is now validated             -> FAIL (tighten it)
 *     - a baseline entry that is no longer a mutating action -> FAIL (stale)
 *
 *   That last pair is what stops the baseline from becoming a lie of its own:
 *   coverage improvements must be recorded, not left as dead weight.
 *
 * EXIT CODES
 *   0  coverage is at or above the baseline
 *   1  drift (new unvalidated write, or a stale baseline)
 *   2  tooling error — a parse that would otherwise pass VACUOUSLY
 *
 * USAGE
 *   node scripts/ci/verify-validation-coverage.mjs
 *   node scripts/ci/verify-validation-coverage.mjs --update-baseline
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FN = path.join(ROOT, 'netlify/functions');
const SURFACES = path.join(FN, 'surfaces');
const HANDLERS = path.join(FN, '_lib/handlers.ts');
const BASELINE = path.join(ROOT, '.ci/validation-baseline.json');

const UPDATE = process.argv.includes('--update-baseline');

/** Read a file, normalising CRLF so no pattern below has to care. */
function read(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

// ── 1 · Which actions write? ────────────────────────────────────────────────
// `_lib/handlers.ts` holds the MUTATING set. It is hand-maintained, which is
// exactly why reading it here is useful: an action added there without a schema
// is the defect this gate is for.
if (!fs.existsSync(HANDLERS)) {
  console.error(`validation-coverage — TOOLING ERROR: ${HANDLERS} not found`);
  process.exit(2);
}
const handlersSrc = read(HANDLERS);
const mutatingBlock = /const MUTATING = new Set\(\[([\s\S]*?)\]\)/.exec(handlersSrc);
if (!mutatingBlock) {
  console.error('validation-coverage — TOOLING ERROR: cannot locate the MUTATING set in _lib/handlers.ts.');
  console.error('  If it was renamed or restructured, update this gate — do not let it pass vacuously.');
  process.exit(2);
}
const mutating = new Set([...mutatingBlock[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]));

// ── 2 · Handler bodies, so a surface entry can be followed one hop ──────────
// Every top-level `export ... function NAME` / `export const NAME =` starts a
// chunk that runs to the next top-level export.
const bodies = new Map();
for (const file of walk(FN)) {
  for (const chunk of read(file).split(/\n(?=export )/)) {
    const m = /^export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z0-9_]+)/.exec(chunk);
    if (m && !bodies.has(m[1])) bodies.set(m[1], chunk);
  }
}

// ── 3 · Surface entry text per action ───────────────────────────────────────
// An entry ends at the next 2-space-indented key — the same block-detection
// trick verify-review-manifest.mjs uses for workflow jobs.
const entryFor = new Map();
for (const file of fs.readdirSync(SURFACES).filter((f) => f.endsWith('.ts') && f !== 'registry.ts')) {
  const src = read(path.join(SURFACES, file));
  const lines = src.split('\n');
  const keyRe = /^ {2}([A-Za-z0-9_]+):/;
  const endRe = /^ {2}[A-Za-z0-9_]+:/;
  for (let i = 0; i < lines.length; i++) {
    const m = keyRe.exec(lines[i]);
    if (!m) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (endRe.test(lines[j])) { end = j; break; }
    }
    // Only the first surface to claim an action wins; the router makes the
    // ownership explicit and verify:binding already proves it is unique.
    if (!entryFor.has(m[1])) entryFor.set(m[1], lines.slice(i, end).join('\n'));
  }
}

// ── 4 · Does this action's path validate? ───────────────────────────────────
// Both mechanisms count — see the header. Recognising only zod would send the
// next contributor back into the bundle regression this split exists to avoid.
const VALIDATION_TOKENS = ['validatePayload(', 'guardPayload('];
const validatesOn = (source) => VALIDATION_TOKENS.some((t) => source.includes(t));

function validates(action) {
  const entry = entryFor.get(action);
  if (!entry) return { known: false, validated: false };
  if (validatesOn(entry)) return { known: true, validated: true };
  for (const id of new Set([...entry.matchAll(/\b(handle[A-Za-z0-9_]+)\b/g)].map((m) => m[1]))) {
    const body = bodies.get(id);
    if (body && validatesOn(body)) return { known: true, validated: true };
  }
  return { known: true, validated: false };
}

const measured = { validated: [], unvalidated: [], unresolved: [] };
for (const action of [...mutating].sort()) {
  const r = validates(action);
  if (!r.known) measured.unresolved.push(action);
  else if (r.validated) measured.validated.push(action);
  else measured.unvalidated.push(action);
}

// ── 5 · Vacuous-pass guard ──────────────────────────────────────────────────
// A green line printed over zero actions is the failure mode this whole class
// of gate is prone to (see verify-projections.mutations.sh case V1). Refuse.
if (mutating.size === 0 || entryFor.size === 0 || bodies.size === 0) {
  console.error('validation-coverage — TOOLING ERROR: parsed an empty input.');
  console.error(`  mutating=${mutating.size} surfaces=${entryFor.size} bodies=${bodies.size}`);
  console.error('  A pass here would be a verdict on no evidence. Refusing.');
  process.exit(2);
}
if (measured.unresolved.length) {
  console.error('validation-coverage — TOOLING ERROR: mutating action(s) with no surface entry found:');
  console.error(`  ${measured.unresolved.join(', ')}`);
  console.error('  This gate cannot judge an action it cannot resolve. Fix the resolution.');
  process.exit(2);
}

// ── 6 · Compare against the baseline ────────────────────────────────────────
let baseline = { unvalidated: [] };
if (fs.existsSync(BASELINE)) {
  try {
    baseline = JSON.parse(read(BASELINE));
  } catch (err) {
    console.error(`validation-coverage — TOOLING ERROR: ${BASELINE} is not valid JSON: ${err.message}`);
    process.exit(2);
  }
}
const known = new Set(baseline.unvalidated || []);

const total = mutating.size;
const pct = Math.round((measured.validated.length / total) * 100);

console.log('Validation coverage at the handler edge');
console.log('-'.repeat(64));
console.log(`  mutating actions (from _lib/handlers.ts) : ${total}`);
console.log(`  validated at the edge                    : ${measured.validated.length}  (${pct}%)`);
console.log(`  not validated, frozen in the baseline    : ${measured.unvalidated.length}`);
console.log('');
console.log(`  validated : ${measured.validated.join(', ') || '(none)'}`);
console.log('');

if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        $comment: [
          'Actions that write but are NOT validated at the handler edge.',
          'This list may only SHRINK. scripts/ci/verify-validation-coverage.mjs fails',
          'when a new unvalidated write appears, and also when an entry here has since',
          'been validated (so the record cannot drift out of date in either direction).',
          'Regenerate with: npm run verify:validation -- --update-baseline',
        ],
        measuredAt: new Date().toISOString().slice(0, 10),
        totalMutating: total,
        validated: measured.validated.length,
        unvalidated: measured.unvalidated,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`baseline written: ${path.relative(ROOT, BASELINE)}`);
  process.exit(0);
}

const failures = [];
const newDebt = measured.unvalidated.filter((a) => !known.has(a));
if (newDebt.length) {
  failures.push(
    `new mutating action(s) with no edge validation: ${newDebt.join(', ')}. ` +
      'Validate after the auth guard: `validatePayload()` with a schema in ' +
      '_lib/kernel/validate.ts (zod, ~67 KB — only where the entry already pays it) ' +
      'or `guardPayload()` from _lib/kernel/guard.ts (dependency-free, for narrow ' +
      'entries). If the handler genuinely validates its own input, record the ' +
      'decision in .ci/validation-baseline.json in the same commit.',
  );
}
const fixed = measured.validated.filter((a) => known.has(a));
if (fixed.length) {
  failures.push(
    `baseline is STALE — these are now validated and must be removed from it: ${fixed.join(', ')}. ` +
      'Run: npm run verify:validation -- --update-baseline',
  );
}
const vanished = [...known].filter((a) => !mutating.has(a));
if (vanished.length) {
  failures.push(
    `baseline names action(s) that are no longer in the MUTATING set: ${vanished.join(', ')}. ` +
      'Either the action was removed (drop the entry) or it stopped writing (drop the entry).',
  );
}

console.log('-'.repeat(64));
if (failures.length) {
  console.error('VALIDATION COVERAGE GATE FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  console.error('The unvalidated set may only shrink. See .ci/validation-baseline.json.');
  process.exit(1);
}
console.log(
  `VALIDATION COVERAGE GATE PASSED — ${measured.validated.length}/${total} mutating actions ` +
    'validated at the edge, no new unvalidated write, baseline in sync.',
);
