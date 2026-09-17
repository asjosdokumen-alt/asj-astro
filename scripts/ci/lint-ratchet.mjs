#!/usr/bin/env node
/**
 * lint-ratchet.mjs — Debt-aware lint gate ("ratchet").
 *
 * WHY NOT JUST RUN `biome check` AND FAIL ON ANY DIAGNOSTIC?
 *   The tree carries 2,723 pre-existing diagnostics from a long JS->TS migration
 *   and a period with no linter at all (see docs/CODE_REVIEW_AUDIT.md, G-01).
 *   Failing on all of them means the gate is red from commit one — and a
 *   permanently red gate is one the team learns to ignore, then deletes. That is
 *   strictly worse than having no linter, because it also burns the credibility
 *   of the gates that DO work.
 *
 *   A ratchet enforces the rule that actually matters:
 *     **no new lint diagnostics may be introduced.**
 *   Debt can only go down. As diagnostics get fixed, `--update-baseline` lowers
 *   the bar and the ratchet stops it creeping back up.
 *
 *   This is deliberately the same shape as scripts/ci/typecheck-ratchet.mjs, so
 *   there is one ratchet idiom in this repo rather than two.
 *
 * FAILURE CONDITIONS (everything else is reported but non-blocking)
 *   1. Total diagnostic count increased vs. the baseline.
 *   2. A file with NO diagnostics in the baseline now has some (new debt surface).
 *
 *   Line numbers are deliberately NOT part of the fingerprint — they shift on
 *   every unrelated edit and would make the gate flaky.
 *
 *   New *rule categories* are reported but do not fail. A category can appear
 *   because a rule was enabled in biome.json, which is a configuration decision,
 *   not a defect. It is printed so the reviewer can decide.
 *
 * USAGE
 *   node scripts/ci/lint-ratchet.mjs                       # enforce
 *   node scripts/ci/lint-ratchet.mjs --update-baseline     # re-record
 *   node scripts/ci/lint-ratchet.mjs --baseline <path>
 *   node scripts/ci/lint-ratchet.mjs --json
 *
 * EXIT CODES
 *   0 pass (or baseline written)   1 ratchet regression   2 tooling error
 */

import fs from 'node:fs';
import path from 'node:path';
import { runBiomeCheck } from './lib/biome-run.mjs';

const DEFAULT_BASELINE = '.ci/biome-baseline.json';

function parseArgs(argv) {
  const args = { update: false, baseline: DEFAULT_BASELINE, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--update-baseline') args.update = true;
    else if (argv[i] === '--baseline') args.baseline = argv[++i];
    else if (argv[i] === '--json') args.json = true;
  }
  return args;
}

function summarise(diagnostics) {
  const byFile = {};
  const byRule = {};
  for (const d of diagnostics) {
    byFile[d.file] = (byFile[d.file] || 0) + 1;
    byRule[d.category] = (byRule[d.category] || 0) + 1;
  }
  const desc = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
  return {
    total: diagnostics.length,
    generatedAt: new Date().toISOString(),
    byFile: desc(byFile),
    byRule: desc(byRule),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  let result;
  try {
    result = runBiomeCheck(['.']);
  } catch (err) {
    console.error(`LINT RATCHET — TOOLING ERROR\n  ${err.message}`);
    process.exit(2);
  }

  // A malformed biome.json makes every rule vanish, which would look exactly
  // like a perfectly clean tree. Fail loudly instead of going green by breaking.
  if (result.configErrors.length) {
    console.error('LINT RATCHET — TOOLING ERROR: biome.json is not valid');
    for (const e of result.configErrors) console.error(`  - ${e.message}`);
    console.error('\nThe ratchet cannot measure anything until the config parses.');
    process.exit(2);
  }

  const current = summarise(result.diagnostics);
  const baselinePath = path.resolve(args.baseline);

  if (args.update) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Baseline written to ${args.baseline}`);
    console.log(`  total diagnostics recorded: ${current.total}`);
    console.log(`  files affected: ${Object.keys(current.byFile).length}`);
    console.log(`  distinct rules: ${Object.keys(current.byRule).length}`);
    if (args.json) console.log(JSON.stringify(current));
    process.exit(0);
  }

  if (!fs.existsSync(baselinePath)) {
    console.error(`Baseline not found at ${baselinePath}.`);
    console.error('Create it with: node scripts/ci/lint-ratchet.mjs --update-baseline');
    process.exit(2);
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  console.log('Lint ratchet (biome)');
  console.log('-'.repeat(56));
  console.log(`  baseline : ${baseline.total} diagnostics (${baseline.generatedAt})`);
  console.log(`  current  : ${current.total} diagnostics`);
  console.log('');

  const failures = [];

  if (current.total > baseline.total) {
    failures.push(
      `Diagnostic count increased: ${baseline.total} -> ${current.total} (+${current.total - baseline.total})`
    );
  }

  const newFiles = Object.keys(current.byFile).filter((f) => !(f in baseline.byFile));
  if (newFiles.length) {
    const detail = newFiles.map((f) => `${f} (${current.byFile[f]})`).join(', ');
    failures.push(`Lint diagnostics appeared in previously clean file(s): ${detail}`);
  }

  // Informational only.
  const improved = [];
  const regressed = [];
  for (const [file, count] of Object.entries(current.byFile)) {
    const before = baseline.byFile[file] || 0;
    if (before && count > before) regressed.push(`${file}: ${before} -> ${count}`);
    else if (before && count < before) improved.push(`${file}: ${before} -> ${count}`);
  }

  if (improved.length) {
    console.log(`Improvements (${improved.length} file(s)):`);
    for (const line of improved.slice(0, 10)) console.log(`  - ${line}`);
    if (improved.length > 10) console.log(`  ...and ${improved.length - 10} more`);
    console.log('');
  }
  if (regressed.length) {
    console.log(`Files with more diagnostics than baseline (${regressed.length}):`);
    for (const line of regressed.slice(0, 10)) console.log(`  ! ${line}`);
    if (regressed.length > 10) console.log(`  ...and ${regressed.length - 10} more`);
    console.log('');
  }

  const newRules = Object.keys(current.byRule).filter((r) => !(r in baseline.byRule));
  if (newRules.length) {
    console.log(`Note — rule categories not present in the baseline: ${newRules.join(', ')}`);
    console.log('');
  }

  console.log('Top rule categories:');
  for (const [rule, count] of Object.entries(current.byRule).slice(0, 8)) {
    console.log(`  ${String(count).padStart(5)}  ${rule}`);
  }
  console.log('-'.repeat(56));

  if (failures.length) {
    console.error('LINT RATCHET FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('');
    console.error('Fix the new diagnostics. To see them with context:');
    console.error('  npx biome check .');
    console.error('If you deliberately reduced debt, re-record the baseline:');
    console.error('  node scripts/ci/lint-ratchet.mjs --update-baseline');
    process.exit(1);
  }

  const delta = baseline.total - current.total;
  console.log(
    delta > 0
      ? `LINT RATCHET PASSED — debt reduced by ${delta}. Re-baseline to lock it in.`
      : 'LINT RATCHET PASSED — no new lint diagnostics.'
  );
  if (args.json) console.log(JSON.stringify(current));
}

main();
