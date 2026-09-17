#!/usr/bin/env node
/**
 * validation-coverage-patcher.mjs — applies one named mutation for the battery.
 *
 * WHY A FILE AND NOT `node -e`
 *   The house rule (see verify-projections.mutations.sh): a mutation passed
 *   through shell + Node escaping silently fails to match, and a mutation that
 *   applied to nothing still produces a verdict — the worst possible outcome,
 *   because a surviving mutant then reads as a hole in the gate.
 *
 * WHY THE MUTATIONS LIVE HERE AND NOT IN THE BATTERY
 *   So the `find` strings never cross a shell boundary, and so each one can
 *   assert it matched EXACTLY ONCE before writing.
 *
 * EOL
 *   Files under netlify/functions are CRLF in the working tree
 *   (core.autocrlf=true; .gitattributes pins only *.mjs/*.cjs). Patterns below
 *   are written LF and translated to the target's own EOL, or they would never
 *   match — the "CRLF x battery = silent killer" trap.
 *
 * USAGE
 *   node scripts/ci/validation-coverage-patcher.mjs <mutation-name>
 *   node scripts/ci/validation-coverage-patcher.mjs --list
 *   exit 0 applied · exit 3 pattern not found / not unique
 */

import fs from 'node:fs';

const MUTATIONS = {
  // D1 — the core rule: a write loses its edge validation.
  'drop-validation': {
    file: 'netlify/functions/contexts/jobs/service.ts',
    find: "const [code] = guardPayload(payload, [text('Kode loker', 64)]) as [string];",
    replace: 'const [code] = (payload || []) as [string];',
  },
  // D2 — a new mutating action appears with no schema anywhere on its path.
  // `getAppData` is chosen deliberately: it already HAS a surface entry and no
  // validation, so it exercises the NEW-DEBT rule (exit 1) rather than the
  // "cannot resolve this action" tooling guard (exit 2). Using an invented name
  // here would look like the same case while testing the other branch.
  'add-unvalidated-mutating': {
    file: 'netlify/functions/_lib/handlers.ts',
    find: "    // Config\n    'updateSysConfig',",
    replace: "    // Config\n    'updateSysConfig',\n    // battery fixture: declared as a write, no schema on its path\n    'getAppData',",
  },
  // V2 — a mutating action this gate cannot resolve must be a TOOLING ERROR
  // (exit 2), not a silent pass. A gate that cannot judge must say so.
  'add-unresolvable-mutating': {
    file: 'netlify/functions/_lib/handlers.ts',
    find: "    // Config\n    'updateSysConfig',",
    replace: "    // Config\n    'updateSysConfig',\n    // battery fixture: no surface entry anywhere\n    'zzBatteryUnresolvable',",
  },
  // D3 — the baseline goes stale in the "we improved" direction.
  'baseline-stale': {
    file: '.ci/validation-baseline.json',
    find: '"approveForm",',
    replace: '"approveForm",\n    "hapusJobData",',
  },
  // D4 — the baseline names something that is not a mutating action at all.
  'baseline-vanished': {
    file: '.ci/validation-baseline.json',
    find: '"approveForm",',
    replace: '"approveForm",\n    "getAppData",',
  },
  // V1 — the vacuous-pass guard: an empty MUTATING set must be refused (exit 2),
  // never reported as a green verdict over zero actions.
  'empty-mutating': {
    file: 'netlify/functions/_lib/handlers.ts',
    find: 'const MUTATING = new Set([',
    replace: 'const MUTATING = new Set([]); const ZZ_UNUSED = new Set([',
  },
};

const name = process.argv[2];
if (!name || name === '--list') {
  for (const k of Object.keys(MUTATIONS)) console.log(k);
  process.exit(name ? 0 : 2);
}

const m = MUTATIONS[name];
if (!m) {
  console.error(`unknown mutation: ${name}`);
  process.exit(2);
}
if (!fs.existsSync(m.file)) {
  console.error(`target missing: ${m.file}`);
  process.exit(3);
}

const src = fs.readFileSync(m.file, 'utf8');
const crlf = src.includes('\r\n');
const eol = (t) => (crlf ? t.replace(/\r?\n/g, '\r\n') : t);
const find = eol(m.find);
const replace = eol(m.replace);

const hits = src.split(find).length - 1;
if (hits !== 1) {
  console.error(`pattern matched ${hits} time(s) in ${m.file} — refusing to write`);
  process.exit(3);
}

fs.writeFileSync(m.file, src.split(find).join(replace));
console.log(`applied ${name} to ${m.file}`);
