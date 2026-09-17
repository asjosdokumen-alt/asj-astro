// projections-gate-patcher.mjs — replace exactly one occurrence in the
// projections gate.
//
// Ship-with-the-battery helper, NOT scratch space. Named without a `.tmp-`
// prefix on purpose: `.gitignore` line 81 is a catch-all (`.tmp-*`) and would
// exclude it, so a fresh checkout would abort with MODULE_NOT_FOUND. That is
// the same class of latent CI failure as an untracked baseline file.
//
// WHY A FILE AT ALL
// -----------------
// Called by verify-projections.mutations.sh with (oldPattern, newPattern) as
// argv. The inline `node -e '...'` form was tried first in the aliases battery
// and the mutation silently applied to nothing: the patterns contain
// backslashes (`\s`, `\1`) nested inside a quoted shell argument inside a Node
// program, and the escaping collapsed. The battery then reported a verdict on a
// mutation that never landed. Code on disk has no shell in the way.
//
// EXIT CODES
//   0  applied
//   2  bad usage
//   3  the pattern did not appear exactly once — the battery aborts rather than
//      report a verdict on a mutation that never landed.

import fs from 'node:fs';

const TARGET = 'scripts/ci/verify-projections.mjs';
const [oldPattern, newPattern] = process.argv.slice(2);

if (!oldPattern || newPattern === undefined) {
  console.error('usage: node scripts/ci/projections-gate-patcher.mjs <old> <new>');
  process.exit(2);
}

const src = fs.readFileSync(TARGET, 'utf8');
const hits = src.split(oldPattern).length - 1;
if (hits !== 1) {
  console.error(`GATE MUTATION DID NOT APPLY (hits=${hits}): ${JSON.stringify(oldPattern)}`);
  process.exit(3);
}
fs.writeFileSync(TARGET, src.replace(oldPattern, newPattern));
