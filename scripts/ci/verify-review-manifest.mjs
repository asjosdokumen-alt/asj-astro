#!/usr/bin/env node
/**
 * verify-review-manifest.mjs — the gate that keeps the review standard honest.
 *
 * WHY THIS EXISTS
 *   On 2026-09-15 the review checklist's Tier 0 opened with:
 *
 *     - [ ] `lint` — no new violations
 *
 *   There was no `lint` script in package.json and no ESLint, Prettier or Biome
 *   config anywhere in the repository. The first checkbox of the review standard
 *   could not be run, and nobody had noticed — because nothing checked the
 *   standard against the repo. The same drift had already produced seven gates
 *   that were referenced by zero workflows.
 *
 *   This gate makes that class of defect impossible to reintroduce silently. It
 *   is deliberately a gate about gates: the review standard is a deliverable, and
 *   a deliverable with no test rots.
 *
 * CHECKS
 *   C1  every `script` in review-manifest.json exists in package.json
 *   C2  every non-null `provenBy` battery exists on disk
 *   C2b every `provenBy` battery is TRACKED BY GIT, not merely present. A
 *       battery that was never `git add`ed proves nothing to anyone but its
 *       author: CI checks the repository out, so the file is absent there.
 *   C2c every gate's OWN IMPLEMENTATION is tracked too — the file its npm script
 *       invokes. C2b covers the proof and this covers the thing being proved,
 *       and the gap between them shipped: `verify:workflows` had a tracked
 *       battery and an implementation that was absent from HEAD, so a fresh
 *       checkout could not start the gate at all while the manifest looked
 *       complete. Gitignored paths (generated `indexer/dist/**`, `node_modules`)
 *       are exempt, because their absence from a checkout is correct.
 *   C3  every blocking gate is actually invoked somewhere (`runs` non-empty)
 *   C4  every gate named in the machine-checked Tier-0 block of
 *       docs/CODE_REVIEW_CHECKLIST.md exists in package.json
 *   C5  every `npm run <name>` in the review documents names a real script
 *   C6  every `runs` entry naming a workflow is TRUE — the workflow file exists,
 *       defines that job, and invokes that script inside it
 *   C7  every gate carries a usable `battery` classification (`ci`/`infra`/
 *       `none`), a gate promising a battery cites one, and a battery classified
 *       `ci` does not reference live infrastructure on a non-comment line
 *   C8  every `*.mutations.sh` in `scripts/ci/` and `e2e/` is ACCOUNTED FOR —
 *       cited as a gate's `provenBy`, or declared in `testBatteries` with the
 *       `proves` field naming what it proves. C2c closed this gap for gate
 *       implementations; C8 closes it for the proofs. The hole it closes was
 *       real and open for a day: `e2e/test-public.mutations.sh` was written,
 *       tracked, and wired to nothing, while the manifest said of its gate
 *       "NO BATTERY EXISTS ... this guard is a hypothesis, not evidence". Every
 *       check in this file passed, because they all look at cited batteries
 *       only. An uncited battery is not the absence of a battery; it is a
 *       battery whose verdict nobody will ever read.
 *
 *   C1 and C4 are the ones that would have caught the phantom `lint` gate.
 *   C3 is the one that would have caught the seven orphan gates.
 *   C6 is the one that catches a manifest which CLAIMS coverage it does not have
 *   (see the note at C6 for the 2026-09-15 incident that motivated it).
 *   C7 is the one that keeps `verify:batteries` honest: it is the field the
 *   runner reads, so a wrong value silently moves a battery out of the run that
 *   would have proven it.
 *   C8 is the one that catches the reverse of C2 — not a claim without an
 *   artifact, but an artifact without a claim.
 *
 * REPORTED, NOT ENFORCED
 *   How many blocking gates have no mutation battery (`provenBy: null`). A gate
 *   that has never been observed failing is a hypothesis, not a proof. The count
 *   is printed on every run so it stays visible; it does not fail the build,
 *   because demanding a battery for all 24 gates at once is how a standard gets
 *   abandoned. It should trend to zero.
 *
 *   The percentage printed below that count is labelled "existence, not
 *   effectiveness", and the wording is deliberate. It answers "does a battery
 *   exist for this gate", NOT "does the battery still apply its mutation" and
 *   NOT "has anything run it". The previous wording — "proven able to fail
 *   22/22 (100%)" — read as continuous proof while meaning only that files were
 *   present, and that is the sentence this whole class of decay hid behind.
 *
 * USAGE
 *   node scripts/ci/verify-review-manifest.mjs
 *   node scripts/ci/verify-review-manifest.mjs --json
 *
 * EXIT CODES
 *   0 pass   1 manifest/standard drift   2 tooling error
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const MANIFEST = 'scripts/ci/review-manifest.json';
const PKG = 'package.json';
const CHECKLIST = 'docs/CODE_REVIEW_CHECKLIST.md';

const BEGIN_MARK = '<!-- BEGIN TIER0 GATES';
const END_MARK = '<!-- END TIER0 GATES -->';

// Documents that are allowed to name gates — and therefore must not name a gate
// that does not exist.
const GATE_NAMING_DOCS = [
  '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/CODE_REVIEW_CHECKLIST.md',
  'docs/CODE_REVIEW_STANDARD.md',
  'docs/CODE_REVIEW_PROCESS.md',
];

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Is `file` tracked by git?
 *
 * Returns true when git is unavailable or the path is not inside a work tree,
 * so the check degrades to C2's on-disk test rather than failing a build for a
 * reason that has nothing to do with the manifest. The failure it exists to
 * catch is specific: a battery written, cited as `provenBy`, and never added.
 */
function isTracked(file) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', file], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch (err) {
    // status 1 = "not tracked"; anything else = git absent/unusable -> not our call
    if (err && err.status === 1) return false;
    return true;
  }
}

/**
 * Every file an npm script invokes that carries a source extension.
 *
 * Deliberately syntactic: the goal is to find the files a gate RUNS, not to
 * understand shell semantics. Flags are skipped, and only tokens ending in a
 * known source/script extension are considered — so `biome check .` yields
 * nothing, and `node scripts/ci/x.mjs --flag` yields `scripts/ci/x.mjs`.
 */
function invokedFiles(command) {
  const out = new Set();
  for (const raw of String(command).split(/\s+/)) {
    const tok = raw.replace(/^["']|["']$/g, '');
    if (!tok || tok.startsWith('-')) continue;
    if (!/\.(mjs|cjs|js|ts|tsx|sh)$/.test(tok)) continue;
    out.add(tok);
  }
  return [...out];
}

/**
 * True when git ignores the path. A GITIGNORED file being absent from a checkout
 * is correct, not a defect — `indexer/dist/**` is generated by `idx:build` and
 * `node_modules/**` is installed — so those are exempt from the tracking
 * requirement in C2c. Without this exemption the check would demand that
 * generated output be committed.
 */
function isIgnored(file) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', file], { stdio: 'ignore' });
    return true; // exit 0 = ignored
  } catch {
    return false; // exit 1 = not ignored; anything else, treat as "not ignored"
  }
}

/** Extract gate names from the machine-checked block in the checklist. */
function tier0GatesFromChecklist() {
  if (!fs.existsSync(CHECKLIST)) return { found: false, names: [] };
  const text = fs.readFileSync(CHECKLIST, 'utf8');
  const start = text.indexOf(BEGIN_MARK);
  const end = text.indexOf(END_MARK);
  if (start === -1 || end === -1 || end < start) return { found: false, names: [] };
  const block = text.slice(start, end);
  const names = [];
  for (const raw of block.split(/\r?\n/)) {
    // Strip list markers, backticks and any trailing prose; keep the first token.
    const m = /^\s*(?:[-*]\s*)?`?([A-Za-z][A-Za-z0-9:_-]*)`?/.exec(raw);
    if (!m) continue;
    const name = m[1];
    if (name === 'text' || name === 'bash' || name === 'sh') continue;
    names.push(name);
  }
  return { found: true, names };
}

/** Every `npm run <name>` in the given documents. */
function npmRunRefs() {
  const refs = [];
  for (const doc of GATE_NAMING_DOCS) {
    if (!fs.existsSync(doc)) continue;
    const text = fs.readFileSync(doc, 'utf8');
    const re = /npm run ([A-Za-z][A-Za-z0-9:_-]*)/g;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) refs.push({ doc, name: m[1] });
  }
  return refs;
}

function main() {
  const failures = [];

  if (!fs.existsSync(MANIFEST)) {
    console.error(`MANIFEST GATE — TOOLING ERROR: ${MANIFEST} not found`);
    process.exit(2);
  }

  let manifest;
  let pkg;
  try {
    manifest = readJson(MANIFEST);
    pkg = readJson(PKG);
  } catch (err) {
    console.error(`MANIFEST GATE — TOOLING ERROR: ${err.message}`);
    process.exit(2);
  }

  const scripts = pkg.scripts || {};
  const gates = manifest.gates || [];

  console.log('Review manifest gate');
  console.log('-'.repeat(60));
  console.log(`  manifest : ${MANIFEST} (measured ${manifest.measuredAt || 'unknown'})`);
  console.log(`  gates    : ${gates.length}`);
  console.log('');

  // ── C1 ─────────────────────────────────────────────────────────────────────
  const missingScripts = gates.filter((g) => !(g.script in scripts)).map((g) => g.script);
  if (missingScripts.length) {
    failures.push(
      `C1 — gate(s) named in the manifest do not exist in package.json: ${missingScripts.join(', ')}`
    );
  }

  // ── C2 ─────────────────────────────────────────────────────────────────────
  // Existence on disk is necessary but NOT sufficient, and the gap is the same
  // one that motivated C6. `provenBy` is a claim about what a FRESH CHECKOUT
  // contains: CI checks the repository out, so a battery that was never
  // `git add`ed is present on the author's machine and absent for everyone
  // else. Measured 2026-09-15: all three of smoke/verify-db/verify-schema's
  // batteries existed on disk, were cited here and in the manifest, and were
  // untracked — so this check passed while the claim was false for every
  // reader of the repo. `fs.existsSync` alone cannot see that; only git can.
  const missingBatteries = gates
    .filter((g) => g.provenBy && !fs.existsSync(g.provenBy))
    .map((g) => `${g.script} -> ${g.provenBy}`);
  if (missingBatteries.length) {
    failures.push(`C2 — provenBy battery missing on disk: ${missingBatteries.join(', ')}`);
  }

  const untrackedBatteries = gates
    .filter((g) => g.provenBy && fs.existsSync(g.provenBy))
    .filter((g) => !isTracked(g.provenBy))
    .map((g) => `${g.script} -> ${g.provenBy}`);
  if (untrackedBatteries.length) {
    failures.push(
      `C2b — provenBy battery exists here but is NOT tracked by git ` +
        `(invisible to a fresh checkout, so the proof does not ship): ${untrackedBatteries.join(', ')}`
    );
  }

  // ── C2c ────────────────────────────────────────────────────────────────────
  // C2b checks that a gate's BATTERY is tracked. It never checked the gate's own
  // IMPLEMENTATION, and that gap shipped. Measured 2026-09-18: package.json
  // invoked `verify:workflows`, its battery WAS tracked so C2b was satisfied —
  // and HEAD did not contain scripts/ci/verify-workflows.mjs at all, so a fresh
  // checkout died at "Cannot find module" before the gate judged anything. A gate
  // that cannot start is not a gate; it is a green cell in a checklist.
  //
  // Only files that EXIST on disk are judged. A MISSING implementation is a
  // different failure with a different cause (a build step that has not run
  // yet), and judging it here would false-positive on `indexer/dist/...` in a
  // fresh checkout — which is the same reason gitignored paths are exempt.
  const untrackedImplementations = [];
  for (const g of gates) {
    const cmd = scripts[g.script];
    if (!cmd) continue; // C1 already reported this one
    for (const file of invokedFiles(cmd)) {
      if (!fs.existsSync(file)) continue;
      if (isIgnored(file)) continue;
      if (!isTracked(file)) untrackedImplementations.push(`${g.script} -> ${file}`);
    }
  }
  if (untrackedImplementations.length) {
    failures.push(
      `C2c — a gate's own implementation exists here but is NOT tracked by git ` +
        `(a fresh checkout cannot run the gate at all): ${untrackedImplementations.join(', ')}`
    );
  }

  // ── C3 ─────────────────────────────────────────────────────────────────────
  const unwired = gates
    .filter((g) => g.blocking && (!Array.isArray(g.runs) || g.runs.length === 0))
    .map((g) => g.script);
  if (unwired.length) {
    failures.push(
      `C3 — blocking gate(s) that nothing invokes: ${unwired.join(', ')} (a gate that does not run is worse than no gate)`
    );
  }

  // ── C4 ─────────────────────────────────────────────────────────────────────
  const tier0 = tier0GatesFromChecklist();
  if (!tier0.found) {
    failures.push(
      `C4 — ${CHECKLIST} has no machine-checked Tier-0 block. Add one delimited by ` +
        `"${BEGIN_MARK}" and "${END_MARK}". Without it the checklist can name a gate that does not exist, ` +
        'which is exactly how the phantom `lint` gate survived.'
    );
  } else {
    const phantom = tier0.names.filter((n) => !(n in scripts));
    if (phantom.length) {
      failures.push(
        `C4 — the review checklist names Tier-0 gate(s) that do not exist: ${phantom.join(', ')}`
      );
    }
  }

  // ── C5 ─────────────────────────────────────────────────────────────────────
  const badRefs = npmRunRefs().filter((r) => !(r.name in scripts));
  if (badRefs.length) {
    const detail = [...new Set(badRefs.map((r) => `${r.name} (${r.doc})`))].join(', ');
    failures.push(`C5 — review documents reference non-existent scripts: ${detail}`);
  }

  // ── C6 ─────────────────────────────────────────────────────────────────────
  // Every `runs` entry naming a workflow must be TRUE: the workflow file must
  // exist, define that job, and actually invoke that script inside it.
  //
  // WHY THIS IS ENFORCED AND NOT MERELY REPORTED
  //   `runs` is hand-maintained prose. On 2026-09-15 that bit us: six gates were
  //   added to ci.yml, the manifest was updated to say so, and three of the edits
  //   claimed `ci.yml#quality-gates` for gates that had been described but not
  //   actually added — the manifest asserted coverage that did not exist. The old
  //   `inNoWorkflow` check could not catch it: it only asks whether ANY entry
  //   contains ".yml", so a fabricated entry passes it. That is the same class of
  //   defect this whole gate exists to prevent, one level down.
  //
  //   So the claim is now verified at the source. A gate that is claimed to run in
  //   a workflow, but is not in that workflow's text, fails the build.
  const WORKFLOW_DIR = '.github/workflows';
  const workflowCache = new Map();
  const readWorkflow = (name) => {
    if (!workflowCache.has(name)) {
      const p = `${WORKFLOW_DIR}/${name}`;
      workflowCache.set(name, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
    }
    return workflowCache.get(name);
  };

  /**
   * Extract one job's block from a workflow file, so the "does this job run the
   * gate?" question is answered against THAT JOB and not the whole file.
   *
   * WHY THIS EXISTS — the first version of C6 searched the entire file for
   * `npm run <gate>`, and a mutation test caught the hole immediately: claiming
   * `ci.yml#classes` for a gate that actually runs in `ci.yml#quality-gates`
   * PASSED, because the string appears somewhere in ci.yml. That is a tautology
   * dressed as a check — it verified "this gate runs somewhere in this file",
   * which is not the claim being made. Claims are per-job, so the check must be
   * per-job. A job block ends at the next line indented two spaces followed by a
   * key, or at end of file.
   */
  function jobBlock(text, job) {
    const lines = text.split(/\r?\n/);
    // Two spaces is the YAML indentation of a job key under `jobs:`. Written as a
    // quantifier rather than two literal spaces so the count is unambiguous.
    const startRe = new RegExp(`^ {2}${job}:\\s*$`);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (startRe.test(lines[i])) {
        start = i;
        break;
      }
    }
    if (start === -1) return null;
    // A job block ends at the next line indented two spaces followed by a key.
    const endRe = /^ {2}[A-Za-z0-9_-]+:\s*$/;
    for (let i = start + 1; i < lines.length; i++) {
      if (endRe.test(lines[i])) return lines.slice(start, i).join('\n');
    }
    return lines.slice(start).join('\n');
  }

  const falseClaims = [];
  for (const g of gates) {
    for (const run of g.runs || []) {
      if (!run.includes('.yml')) continue; // npm composites are not workflows
      const [file, job] = run.split('#');
      const text = readWorkflow(file);
      if (text === null) {
        falseClaims.push(`${g.script} -> ${run} (no such workflow file)`);
        continue;
      }
      if (!job) {
        // A whole-file claim is still a claim: the script must appear somewhere.
        if (!text.includes(`npm run ${g.script}`)) {
          falseClaims.push(`${g.script} -> ${run} (script is not invoked in ${file})`);
        }
        continue;
      }
      const block = jobBlock(text, job);
      if (block === null) {
        falseClaims.push(`${g.script} -> ${run} (no job "${job}" in ${file})`);
        continue;
      }
      if (!block.includes(`npm run ${g.script}`)) {
        falseClaims.push(
          `${g.script} -> ${run} (job "${job}" does not invoke it; it is not enough that ${file} does)`
        );
      }
    }
  }
  if (falseClaims.length) {
    failures.push(
      `C6 — manifest claims workflow coverage that does not exist: ${falseClaims.join('; ')}. ` +
        'Either add the step to the workflow, or correct the claim.'
    );
  }

  // ── C7 ─────────────────────────────────────────────────────────────────────
  // Every gate must carry a `battery` classification, and the classification
  // must be TRUE — because `run-batteries.mjs` reads this field to decide which
  // batteries to execute. A wrong classification is not a cosmetic problem: it
  // moves a battery either into a run it cannot survive, or out of the run that
  // would have proven it, and both failures are silent.
  //
  // WHY THIS CHECK EXISTS AT ALL
  //   Before it, the manifest printed
  //
  //     proven able to fail : 22/22 (100%)
  //
  //   and that number was true in a sense that proves nothing. Every one of
  //   those batteries was real, committed and had once been observed failing —
  //   and NOTHING RAN THEM. `grep -c 'mutations\.sh' .github/workflows/*.yml`
  //   returned a single hit, and that hit is a COMMENT, not a `run:`. So the
  //   percentage meant "a battery exists", never "the battery still works".
  //   The distinction is not pedantic: a battery that silently stops applying
  //   its mutation is INDISTINGUISHABLE from a gate that cannot see the defect,
  //   and `check-md-tables.mutations.sh` had already rotted that way before this
  //   runner existed.
  //
  // So the check enforces the shape the runner depends on, in three parts:
  //
  //   1. the field is present and is one of the three known kinds;
  //   2. `battery:"ci"` and `battery:"infra"` both REQUIRE a `provenBy` —
  //      a classification that promises a battery and supplies none is the
  //      phantom-gate defect one level down;
  //   3. a `battery:"ci"` battery must not reference live infrastructure. This
  //      is the part that can actually catch a mistake rather than a typo: the
  //      runner executes the `ci` set in a bare container with no database, no
  //      server and no credentials, so a battery mislabelled `ci` while it
  //      needs Postgres takes the whole job down — and the natural "fix" under
  //      time pressure is to delete the battery, not to reclassify it.
  //
  // The infrastructure markers are matched against NON-COMMENT lines only.
  // Every battery's header discusses the very things it must not depend on
  // ("this needs a live server", "reads SUPABASE_URL"), so a plain substring
  // search would fail every honest battery and be switched off the first time
  // it fired. A comment saying what a battery avoids is not a dependency.
  const BATTERY_KINDS = new Set(['ci', 'infra', 'none']);
  const INFRA_MARKERS = [
    /start_server/,
    /\.env\.local|\.env\.lokal/,
    /SUPABASE_DB_URL|SUPABASE_URL|SERVICE_ROLE/,
    /embedded-postgres|initdb/,
  ];
  const missingKind = gates.filter((g) => !BATTERY_KINDS.has(g.battery)).map((g) => g.script);
  if (missingKind.length) {
    failures.push(
      `C7 — gate(s) with no usable battery classification: ${missingKind.join(', ')} ` +
        `(expected one of ${[...BATTERY_KINDS].join('/')}; run-batteries.mjs reads this field)`
    );
  }
  const promisedNoBattery = gates
    .filter((g) => (g.battery === 'ci' || g.battery === 'infra') && !g.provenBy)
    .map((g) => g.script);
  if (promisedNoBattery.length) {
    failures.push(
      `C7 — gate(s) classified as having a battery but citing none: ${promisedNoBattery.join(', ')}`
    );
  }
  const mislabelled = [];
  for (const g of gates) {
    if (g.battery !== 'ci' || !g.provenBy || !fs.existsSync(g.provenBy)) continue;
    const lines = fs.readFileSync(g.provenBy, 'utf8').split(/\r?\n/);
    for (const [i, line] of lines.entries()) {
      const code = line.replace(/^\s*#.*$/, ''); // a full-line comment declares no dependency
      if (!code.trim()) continue;
      if (INFRA_MARKERS.some((re) => re.test(code))) {
        mislabelled.push(`${g.script} -> ${g.provenBy}:${i + 1}`);
        break;
      }
    }
  }
  if (mislabelled.length) {
    failures.push(
      `C7 — battery/batteries classified "ci" but referencing live infrastructure: ` +
        `${mislabelled.join(', ')}. The hermetic set runs with no database, server or ` +
        'credentials; reclassify as "infra" rather than deleting the battery.'
    );
  }

  // ── C8 ─────────────────────────────────────────────────────────────────────
  // Every `*.mutations.sh` in the two battery directories must be ACCOUNTED FOR:
  // either a gate cites it as its `provenBy`, or `testBatteries` declares it and
  // says what it proves.
  //
  // WHY THIS EXISTS — the hole it closes was open for a day and nobody saw it.
  // `e2e/test-public.mutations.sh` was written, complete and `git add`ed, and
  // wired to NOTHING. The manifest went on saying `provenBy: null` and
  // "NO BATTERY EXISTS, and that is recorded rather than assumed away — so this
  // guard is a hypothesis, not evidence". Every word of that was false and every
  // check in this file passed, because C2/C2b/C2c only ever look at the
  // batteries that ARE cited. An uncited battery is not "no battery": it is a
  // battery whose verdict no one will ever read.
  //
  // The asymmetry is what made it invisible. The manifest is checked against
  // reality in one direction — every claim it makes must be true — and never in
  // the other: every artifact on disk must be claimed. C2c closed that gap for
  // gate IMPLEMENTATIONS; this closes it for the proofs.
  //
  // `testBatteries` is not a second-class list. Some batteries prove a vitest
  // file rather than a gate — `src/lib/profileProgress.test.ts` and
  // `netlify/functions/_lib/db/settings-limit.test.ts` — and for those there is
  // no npm script for `provenBy` to name. Declaring them keeps the accounting
  // complete instead of leaving them to be rediscovered as orphans.
  //
  // Three failure modes, not one:
  //   1. an on-disk battery that nothing accounts for  (the case that happened)
  //   2. a declared battery that is not on disk        (a claim with no artifact)
  //   3. a battery in BOTH lists                       (two accounts of one thing,
  //      which is how the two drift apart and one of them goes stale)
  const testBatteries = manifest.testBatteries || [];
  const citedBatteries = new Set(gates.map((g) => g.provenBy).filter(Boolean));
  const declaredBatteries = new Set(testBatteries.map((t) => t.script));
  const BATTERY_DIRS = ['scripts/ci', 'e2e'];
  const onDiskBatteries = [];
  for (const dir of BATTERY_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.mutations.sh')) onDiskBatteries.push(`${dir}/${name}`);
    }
  }
  const unaccounted = onDiskBatteries.filter(
    (p) => !citedBatteries.has(p) && !declaredBatteries.has(p)
  );
  if (unaccounted.length) {
    failures.push(
      `C8 — battery file(s) on disk that nothing accounts for: ${unaccounted.join(', ')}. ` +
        'A battery no gate cites is a proof nobody reads: cite it as a `provenBy`, or ' +
        'declare it in `testBatteries` with the `proves` field naming what it proves.'
    );
  }
  const missingDeclared = [...declaredBatteries].filter((p) => !fs.existsSync(p));
  if (missingDeclared.length) {
    failures.push(
      `C8 — testBatteries names file(s) that do not exist: ${missingDeclared.join(', ')}`
    );
  }
  const doubleAccounted = [...declaredBatteries].filter((p) => citedBatteries.has(p));
  if (doubleAccounted.length) {
    failures.push(
      `C8 — battery/batteries listed in BOTH testBatteries and a gate's provenBy: ` +
        `${doubleAccounted.join(', ')}. Two accounts of one battery drift apart; keep one.`
    );
  }
  const provesMissing = testBatteries
    .filter((t) => !t.proves || !fs.existsSync(t.proves))
    .map((t) => t.script);
  if (provesMissing.length) {
    failures.push(
      `C8 — testBatteries entry/entries whose \`proves\` target does not exist: ` +
        `${provesMissing.join(', ')}. A battery aimed at a deleted file still runs and ` +
        'still passes; it just proves nothing.'
    );
  }

  // ── Reported, not enforced ─────────────────────────────────────────────────
  const blocking = gates.filter((g) => g.blocking);
  const unproven = blocking.filter((g) => !g.provenBy);
  const inNoWorkflow = gates.filter(
    (g) => g.blocking && Array.isArray(g.runs) && !g.runs.some((r) => r.includes('.yml'))
  );

  const hermetic = gates.filter((g) => g.battery === 'ci');
  const infra = gates.filter((g) => g.battery === 'infra');
  const noBattery = gates.filter((g) => g.battery === 'none');

  console.log(`Blocking gates: ${blocking.length}`);
  // ── The percentage, stated so it cannot be misread ─────────────────────────
  // It answers exactly one question: does a battery EXIST for this gate? It
  // does NOT say the battery still applies its mutation, and it does NOT say
  // anything ran. The line below the percentage carries the part that matters,
  // because "100%" next to "proven" is the sentence that hid this whole class
  // of decay for as long as it did.
  console.log(
    `  a battery EXISTS for: ${blocking.length - unproven.length}/${blocking.length} ` +
      `(${blocking.length ? Math.round(((blocking.length - unproven.length) / blocking.length) * 100) : 0}%) ` +
      '<- existence, not effectiveness'
  );
  console.log(`  no battery (hypothesis, not proof): ${unproven.length}`);
  if (unproven.length) {
    console.log(`    ${unproven.map((g) => g.script).join(', ')}`);
  }
  console.log('');
  // Battery classification — what the runner will actually do with these.
  console.log(`Battery classification (drives \`verify:batteries\`):`);
  console.log(`  ci    (hermetic, RUN in CI)      : ${hermetic.length}`);
  console.log(`  infra (needs live infra, NOT run): ${infra.length}`);
  console.log(`    ${infra.map((g) => g.script).join(', ')}`);
  console.log(`  none  (no battery exists)        : ${noBattery.length}`);
  console.log('');
  // The honest remainder: what `verify:batteries` cannot prove no matter how
  // green it goes. Printed on every run so a green battery job is never read as
  // "every gate is continuously proven".
  console.log(
    `  A green \`verify:batteries\` run proves the ${hermetic.length} hermetic batteries still ` +
      'discriminate.'
  );
  console.log(
    `  It says nothing about the ${infra.length + noBattery.length} gate(s) above, and it does ` +
      'not measure coverage.'
  );
  console.log('');
  console.log(`Blocking gates CI never runs: ${inNoWorkflow.length}`);
  if (inNoWorkflow.length) {
    console.log(`    ${inNoWorkflow.map((g) => g.script).join(', ')}`);
  }
  console.log(`Tier-0 gates declared in the checklist: ${tier0.names.length}`);
  console.log('-'.repeat(60));

  if (failures.length) {
    console.error('REVIEW MANIFEST GATE FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('');
    console.error('Fix the drift: either the manifest/document is wrong, or the repo is.');
    console.error(`  manifest: ${MANIFEST}`);
    console.error(`  scripts : ${PKG}`);
    process.exit(1);
  }

  console.log('REVIEW MANIFEST GATE PASSED — every named gate exists, is run somewhere,');
  console.log('and the review documents name no gate that does not exist.');
  if (JSON_OUT) {
    console.log(
      JSON.stringify({ gates: gates.length, blocking: blocking.length, unproven: unproven.length })
    );
  }
}

main();
