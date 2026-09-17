#!/usr/bin/env node
/**
 * run-batteries.mjs — actually EXECUTE the mutation batteries that are declared
 * hermetic, so `proven able to fail` stops being a stored claim.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * Measured 2026-09-15: the review manifest printed
 *
 *     proven able to fail 22/22 (100%)
 *
 * and every one of those batteries was real, committed and green — but NOTHING
 * RAN THEM. `grep -c 'mutations\.sh' .github/workflows/*.yml` returned a single
 * hit, and that hit is a COMMENT in ci.yml line 68, not a `run:`. No npm script
 * invoked them either; `review-gate.mjs` mentions one only to put it on the
 * skip list. So the number meant "was once observed to fail", never "still
 * does".
 *
 * That gap has a known decay mode, and it was not hypothetical — it had ALREADY
 * happened. `check-md-tables.mutations.sh` reported a SURVIVED mutation on the
 * first run of this runner: its mutation A anchored on prose inside a
 * BACKEND_TODO.md row that a later edit had rewritten, so its Python
 * `str.replace()` matched nothing, wrote the file back unchanged, and the gate
 * correctly stayed green. A dead mutation is INDISTINGUISHABLE from a hole in
 * the gate, and a battery nobody runs cannot tell you which you have.
 *
 * A gate that is proven once and never re-proven is a hypothesis with good
 * paperwork.
 *
 * ── WHAT IT RUNS, AND WHY ONLY THAT ─────────────────────────────────────────
 * The set is NOT hand-listed here. It is read from `review-manifest.json`, where
 * every gate carries a `battery` field:
 *
 *     "ci"     hermetic — no credentials, no server, no database. Runs here.
 *     "infra"  needs a live Postgres / the Supabase transport / a real HTTP
 *              server to be meaningful. Deliberately NOT run here.
 *     "none"   no battery exists.
 *
 * Reading the classification from the manifest rather than repeating it is the
 * point: a list typed into this file would drift from the manifest the moment
 * someone reclassifies a battery, and the drift would be invisible.
 *
 * Cost was MEASURED before choosing the shape of this runner, not guessed:
 * the 17 hermetic batteries take roughly 5-7 minutes in total on a warm tree,
 * with `boundary` (~53 s), `test` and `idx:gate` (~38 s) dominating. That is why
 * this is its own CI job with its own timeout rather than extra steps bolted
 * onto `quality-gates`.
 *
 * ── WHAT IT DOES NOT CLAIM ──────────────────────────────────────────────────
 * Running a battery proves the battery still discriminates and the gate can
 * still fail. It does NOT prove the gate is complete, and it does not make the
 * 6 `infra` batteries any less unproven. The summary says so explicitly instead
 * of printing a single flattering percentage.
 *
 * USAGE
 *   node scripts/ci/run-batteries.mjs              # all hermetic
 *   node scripts/ci/run-batteries.mjs --only=a,b   # a subset, by gate script
 *   node scripts/ci/run-batteries.mjs --list       # print the set, run nothing
 *
 * EXIT CODES
 *   0 every battery ran and reported no hole
 *   1 at least one battery reported SURVIVED / UNEXPECTED, or failed to run
 *   2 tooling error (manifest unreadable, battery file missing or untracked)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MANIFEST = path.join(ROOT, 'scripts/ci/review-manifest.json');

/**
 * The run lock, in one place because it is referenced from two functions that
 * must agree: `sweepScratch()` exempts it, and `main()` takes it. A name that
 * matched `.tmp-*` and was spelled differently in those two places would either
 * sweep the live lock or leave a stale one behind, and both fail silently.
 */
const LOCK_NAME = '.tmp-battery-run.lock';
const LOCK = path.join(ROOT, LOCK_NAME);

/**
 * Where the batteries' shared delete helper records a transient unlink failure.
 *
 * ── WHY THE RUNNER OWNS THIS PATH ───────────────────────────────────────────
 * `scripts/ci/lib/rm-retry.sh` retries a delete that failed for a reason which
 * disappears on its own, and records the errno each time it had to. Measured
 * 2026-09-16, in-run, at a battery's clean-up site:
 *
 *     07:52:38 pwd=/f/astro mutsrc=src/__tsmut.ts \
 *              realpath=/f/astro/src/__tsmut.ts rc=1 exists=YES
 *
 * `rm -f` returned 1 with the path correct and the file still present, while
 * the same path deletes with rc=0 outside a run. One such file left behind is
 * enough to poison the NEXT battery, and eleven gates went red on a tree whose
 * gates were all fine.
 *
 * ── WHY IT IS NOT INSIDE THE REPOSITORY ─────────────────────────────────────
 * A file written during a battery is an untracked file, i.e. a LEAK to
 * `sweepLeaks()`, and a `.tmp-*` name would be deleted mid-run by
 * `sweepScratch()`. Either would make the log describe the wrong run. The OS
 * temp directory is outside both rules, so the log survives the sweep that
 * exists to catch the very debris this file is about.
 *
 * ── WHY AN INHERITED PATH WINS ──────────────────────────────────────────────
 * A nested run (`verify:batteries` drives this runner) must not write its
 * batteries' retries to a second file the outermost run never prints. Inheriting
 * the parent's path keeps one run's whole story in one place.
 */
const RM_RETRY_LOG =
  process.env.RM_RETRY_LOG || path.join(os.tmpdir(), `asj-rm-retry-${process.pid}.log`);
/** True when this process chose the path, i.e. it is the outermost run. */
const RM_RETRY_LOG_OWNED = !process.env.RM_RETRY_LOG;

const args = process.argv.slice(2);
const LIST_ONLY = args.includes('--list');
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;

/** Is the path tracked by git? A battery that never shipped proves nothing. */
function isTracked(rel) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch (err) {
    if (err && err.status === 1) return false;
    return true; // git absent/unusable -> not our call, consistent with C2b
  }
}

/**
 * Every currently-untracked path, as a Set. Used to detect what a battery LEAKS.
 *
 * ── WHY THE RUNNER HAS TO DO THIS ───────────────────────────────────────────
 * Measured 2026-09-15, on the first full run: 10 of the 18 hermetic batteries
 * failed — and `verify:io` was among them, even though it passes cleanly when
 * run on its own (5 killed / 0 survived, exit 0). The cause was not the gate.
 * A diagnostic that ran each battery in order and counted untracked files before
 * and after showed the real shape:
 *
 *     exit=1  survived=1  leaked=2   io-boundary.mutations.sh
 *     exit=1  survived=3  leaked=5   verify-projections.mutations.sh
 *     exit=1  survived=4  leaked=6   verify-aliases.mutations.sh
 *     exit=0  survived=0  leaked=0   check-md-tables.mutations.sh
 *
 * The batteries that failed are the batteries that LEAK fixture files
 * (`zz-battery-*`, `__iomut-*`, `__lintmut-*`, `src/__tsmut.ts`) and never clean
 * them up. Each battery assumes it starts on the clean tree a developer has when
 * running one battery by hand. Chained in a single working tree, battery N's
 * leftover fixtures are seen by battery N+1 as source it must analyse — so a
 * leak is reported against the wrong battery entirely, and one leak cascades
 * into a wall of false failures.
 *
 * This is the same trap the repo already records elsewhere: a battery only
 * restores `$TARGET`, so mutations outside it are residue, and a tree that is
 * already dirty before a run cannot prove anything.
 *
 * So the runner snapshots the untracked set before each battery and removes any
 * NEW file afterwards. The leak is then ATTRIBUTED to the battery that produced
 * it (reported, and it fails that battery's verdict) instead of poisoning its
 * neighbours. Cleaning is limited to files that appeared during that battery's
 * run: nothing that existed beforehand is ever touched, and tracked files are
 * never touched at all.
 *
 * ── LIMIT OF THIS DETECTOR (measured, not assumed) ──────────────────────────
 * `git status --porcelain` honours `.gitignore`, and `.gitignore:81` ignores
 * `.tmp-*` wholesale — so a battery that leaks a `.tmp-*` path is INVISIBLE to
 * this function. That is not a flaw to patch here; it is the reason
 * `sweepScratch()` above exists and why it must sweep by the ignore rule rather
 * than by a name pattern. The two functions cover disjoint halves of the same
 * problem:
 *
 *     sweepScratch()  -> `.tmp-*`    (ignored, so git cannot see it)
 *     sweepLeaks()    -> everything else that is untracked (git can see it)
 *
 * A fixture named `zz-battery-*`, `__iomut-*` or `src/__tsmut.ts` is NOT ignored,
 * so it is caught here. A backup named `.tmp-projmfut` is caught there. Neither
 * function alone is sufficient, and the earlier version of this comment claimed
 * one was.
 */
function untrackedSet() {
  const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const set = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.startsWith('?? ')) continue;
    set.add(line.slice(3).trim());
  }
  return set;
}

/**
 * Remove battery scratch state (`.tmp-*`) left by an earlier run.
 *
 * ── WHY THIS IS NEEDED, AND HOW IT WAS FOUND ────────────────────────────────
 * These paths are each battery's private backup store: `backup_all` copies the
 * files it is about to mutate into `.tmp-<name>/`, and `restore_one` puts them
 * back by copying FROM that directory. Two consequences follow, and both were
 * measured on 2026-09-15:
 *
 *   1. An INTERRUPTED battery leaves its scratch directory behind. The next run
 *      of that battery then restores from a store that describes an older tree.
 *   2. Worse, a battery that ABORTS on a red baseline exits before `backup_all`,
 *      so `restore_one` finds a stale backup from a previous run — or none —
 *      while its own `cleanup` still deletes its fixture. Depending on the
 *      order, a fixture is either resurrected or reported as a leak it did not
 *      cause.
 *
 * The observable symptom was `lint-ratchet` aborting with "BASELINE RED" in 2
 * seconds whenever it followed another battery, while passing alone: a stale
 * `src/lib/__lintmut.ts` made the lint gate count 2713 against a baseline of
 * 2712. That number is not a property of the gate — it was debris.
 *
 * ── WHY THE FIRST VERSION OF THIS FUNCTION WAS WRONG ────────────────────────
 * It swept `/^\.tmp-.*mut$/` — "looks like a battery backup dir". Measured
 * 2026-09-15 against the names the batteries ACTUALLY use, that pattern missed
 * six of them:
 *
 *     .tmp-projmfut      <- verify-projections (a typo for `projmut`)
 *     .tmp-bundlemfut    <- bundle-size        (ditto)
 *     .tmp-pwamfut       <- verify-pwa         (ditto)
 *     .tmp-tsmut-bak     <- typecheck-ratchet  (a SUFFIX, not a `mut` ending)
 *     .tmp-tsc-indexer-narrow.json, .tmp-runbat   (not backups at all)
 *
 * So the sweep was a no-op for exactly the batteries that leaked most, and the
 * `gate.orig` inside `.tmp-projmfut` survived to poison every later battery.
 * A guess at a naming convention is not a sweep.
 *
 * ── WHAT IT DOES NOW, AND WHY THAT IS THE RIGHT INVARIANT ───────────────────
 * `.gitignore:81` already declares `.tmp-*` as throwaway. That is the ONLY
 * property this function needs: anything matching `.tmp-*` at the repo root is
 * scratch by the repository's own definition, whether or not the battery that
 * made it spelled the name the way the runner guessed. It is swept on that
 * basis — no naming convention, no typo list to maintain.
 *
 * Tracked files are never touched: `.tmp-*` is ignored wholesale, so a tracked
 * path cannot match. Removal is best-effort (a file that is a symlink, a read-
 * only dir, or already gone must not abort the battery run).
 */
function sweepScratch() {
  const removed = [];
  let names;
  try {
    names = fs.readdirSync(ROOT);
  } catch {
    return removed; // unreadable root is reported by the preflight, not here
  }
  for (const name of names) {
    if (!name.startsWith('.tmp-')) continue;
    // The runner's own lock lives at `.tmp-battery-run.lock` and matches the
    // prefix above. Sweeping it would delete the lock of the run that is holding
    // it — the sweep would disarm the very guard that stops two runs from
    // sharing the tree. Exempted by exact name, not by pattern, so a future
    // battery cannot be excluded by accident.
    if (name === LOCK_NAME) continue;
    const abs = path.join(ROOT, name);
    if (removeWithRetry(abs, name)) removed.push(name);
  }
  return removed;
}

/**
 * Fixture name prefixes the batteries use, read from the batteries themselves.
 *
 * ── WHY A PRE-RUN FIXTURE SWEEP IS NOT REDUNDANT WITH sweepLeaks() ──────────
 * `sweepLeaks()` only removes files that appeared DURING a battery's run, which
 * is the right answer for attributing a leak — and the wrong answer entirely for
 * a run that STARTS on a dirty tree. Measured 2026-09-15, on a run whose
 * predecessor had been killed: the tree began holding 22 fixture files
 * (`netlify/functions/zz-battery-*`, `__iomut-*`, `__lintmut-*`,
 * `indexer/src/zz-battery-typecheck.ts`, `src/__tsmut.ts`, `src/zz-battery-*`),
 * `sweepLeaks()` saw every one as pre-existing and reported
 * "leaked fixture(s) from : 0 battery/batteries" — technically true and
 * completely misleading — and eleven batteries then measured a tree full of a
 * dead run's debris. `typecheck:indexer`'s "the gate is still red after the
 * planted file was removed" was not a gate defect: the planted file WAS still
 * there, from the previous run.
 *
 * So the tree is swept of recognised fixtures BEFORE the run starts, and the
 * sweep is reported, because a run that needed it is a run that inherited
 * someone else's mess and its verdicts deserve that context.
 *
 * ── WHY THE PATTERN IS A SHAPE, NOT A LIST OF STEMS ─────────────────────────
 * The first version derived "prefixes" by scanning the batteries for quoted
 * strings matching `(zz-battery|__iomut|__lintmut|__tsmut)[\w-]*`. It looked
 * principled and it did not work. Measured on the real battery set, it produced
 * the stems `__tsmut-gone`, `zz-battery-`, `zz-battery-sub`,
 * `zz-battery-test-planted` — and MISSED `__iomut` and `__lintmut` entirely,
 * because those appear in `F_RAW="$FN/__iomut-rawfetch.ts"` only as a path with
 * an interpolation prefix that the pattern consumed. So `src/__tsmut.ts` and
 * `netlify/functions/__iomut-clean.ts` did not match anything, were never
 * swept, and the run after them failed for their reasons.
 *
 * The fix is to stop deriving individual names and describe the SHAPE the
 * batteries universally use, which is documented in their own headers: every
 * fixture basename starts with `zz-battery`, `__iomut`, `__lintmut`, `__tsmut`
 * or `__lintmutdir`. A basename is matched, not a path, so a fixture may live in
 * any directory. `zz-battery-` is matched as `zz-battery` + a separator so that
 * a real file like `zz-batterykeeper.ts` is not swept.
 *
 * Only names that are ALSO untracked are removed: a tracked file can never be a
 * fixture, so it can never be swept, whatever it is called.
 */
const FIXTURE_BASENAME = /^(zz-battery|__iomut|__lintmutdir|__lintmut|__tsmut)(?=[-.]|$)/;

/**
 * Sweeps that gave up, with the error each one returned.
 *
 * ── WHY A FAILED SWEEP MUST BE A FINDING AND NOT A SHRUG ────────────────────
 * Every sweep here used to be a bare `try {} catch { /* best effort *\/ }`, and
 * that is how the worst failure in this runner stayed invisible for four full
 * runs. Measured 2026-09-16: during a run, deleting `.tmp-mdmut`,
 * `.tmp-classmut` and `zz-battery-leak-probe.tmp` fails, and the SAME paths
 * delete cleanly once the run is over. The sweeps could not say so, the next
 * battery measured a tree holding the previous one's debris, and eleven gates
 * were reported broken on a tree whose gates were all fine.
 *
 * A sweep that cannot delete is not "best effort" -- it is the runner failing at
 * the one job that makes its verdicts attributable. It is collected here and
 * printed with the error, because "the sweep failed" and "there was nothing to
 * sweep" must never look the same.
 */
const sweepFailures = [];

/** Sleep without spinning: no async here, the runner is synchronous by design. */
function sleepBriefly(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * `fs.rmSync` with retries. Returns true when the path is gone.
 *
 * The battery-side helper (scripts/ci/lib/rm-retry.sh) retries the same way and
 * for the same measurement; this is the runner's own copy, because the runner
 * must be able to clean up after a battery that could not.
 */
function removeWithRetry(abs, label, attempts = 5, napMs = 500) {
  for (let i = 1; i <= attempts; i++) {
    try {
      fs.rmSync(abs, { recursive: true, force: true });
      return true;
    } catch (err) {
      if (i === attempts) {
        sweepFailures.push({
          path: label,
          attempts,
          err: err?.code ? `${err.code} ${err.message}` : String(err?.message || err),
        });
        return false;
      }
      sleepBriefly(napMs);
    }
  }
  return false;
}

function sweepFixtures() {
  const untracked = untrackedSet();
  const removed = [];
  for (const rel of untracked) {
    const base = rel.split('/').pop();
    if (!FIXTURE_BASENAME.test(base)) continue;
    if (removeWithRetry(path.join(ROOT, rel), rel)) removed.push(rel);
  }
  return removed;
}
function sweepLeaks(before) {
  const after = untrackedSet();
  const leaked = [...after].filter((f) => !before.has(f));
  const removed = [];
  for (const rel of leaked) {
    const abs = path.join(ROOT, rel);
    // A leaked entry may be a directory (some batteries create one to test the
    // Lambda-compat shape). Only remove it when it is untracked, which the
    // untrackedSet() filter already guarantees.
    if (removeWithRetry(abs, rel)) removed.push(rel);
  }
  return removed;
}

/**
 * Every TRACKED file that differs from its committed content, as a Set.
 *
 * ── WHY THIS IS THE MOST IMPORTANT CHECK IN THE FILE ────────────────────────
 * `sweepLeaks()` catches a battery that leaves a NEW file behind. It cannot
 * catch the far worse failure: a battery that leaves a LIVE MUTATION inside a
 * tracked gate it was testing. That is not debris, it is the gate itself, now
 * broken — and the runner would sail past it, attribute the next batteries'
 * failures to the wrong gates, and report a wall of false findings.
 *
 * Measured 2026-09-15, and this is exactly what happened. One full run ended
 * with `scripts/ci/verify-projections.mjs` still holding mutation S2:
 *
 *     -  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
 *     +  return src;
 *
 * The battery's own `cleanup` was supposed to undo that. It did not — because
 * its `$BAK` (`.tmp-projmfut`) was NOT swept by the runner's first, pattern-
 * guessing `sweepScratch()`, so the stale `gate.orig` inside it was already a
 * mutant and every "restore" faithfully reinstalled the mutant. One un-swept
 * scratch directory silently corrupted a gate and produced eleven failures
 * against gates that were fine.
 *
 * A run that cannot notice a modified tracked file cannot certify anything, so
 * this is checked around EVERY battery, and a change is a hard, attributed
 * failure — not a warning. The tree must be clean of tracked edits before the
 * battery starts (else its result is uninterpretable) and after it finishes
 * (else its restore is broken).
 *
 * Untracked files are handled separately by `sweepLeaks()`, and `.tmp-*` by
 * `sweepScratch()`; git's `.gitignore` keeps those three sets disjoint.
 */
function trackedDirty() {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const set = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line || line.startsWith('?? ')) continue;
      // Format: XY<space>path ; take everything after the 2-char status + space.
      set.add(line.slice(3).trim());
    }
    return set;
  } catch {
    return new Set(); // git unusable -> the preflight's job, not this function's
  }
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (err) {
    console.error(`BATTERY RUNNER — TOOLING ERROR: cannot read manifest: ${err.message}`);
    process.exit(2);
  }

  const hermetic = manifest.gates.filter((g) => g.battery === 'ci');
  const infra = manifest.gates.filter((g) => g.battery === 'infra');
  const none = manifest.gates.filter((g) => g.battery === 'none');

  if (!hermetic.length) {
    console.error('BATTERY RUNNER — TOOLING ERROR: no gate is classified battery="ci".');
    console.error('Either the manifest lost its annotations, or the field was renamed.');
    process.exit(2);
  }

  const selected = ONLY ? hermetic.filter((g) => ONLY.has(g.script)) : hermetic;

  // ── Only one mutation run may hold the tree at a time ───────────────────────
  // This is not defensive hygiene; it is the single mistake that cost the most
  // time on 2026-09-15, and it produced findings that were completely wrong.
  //
  // A battery works by REPLACING a gate with a defective version, running it,
  // and putting the original back. Two runs in one working tree therefore
  // interleave their mutations on the same files: run A swaps
  // `verify-aliases.mjs` out, run B runs it, and B measures a mutant it did not
  // install — then reports the gate as broken. Measured, while two runs were
  // live at once:
  //
  //   * `typecheck-ratchet` alone reported "tsc now reports 2" where the
  //     pristine tree reports 1, and two equivalent cases flapped to
  //     UNEXPECTED — the tree it measured belonged to the other run;
  //   * `.tmp-mdmut`, `.tmp-runbat` and `.tmp-bundlemfut` appeared during a
  //     battery that never touches those files;
  //   * `docs/PARITY_CHECKLIST.md` was mutated by the OTHER run mid-measurement.
  //
  // Every one of those looked like a real defect, and each cost a long
  // investigation. A lock turns "silently wrong numbers" into "refuse to start",
  // which is the only acceptable direction for a harness whose entire output is
  // a verdict.
  //
  // ── NESTED RUNS ARE ALLOWED, AND MUST BE ───────────────────────────────────
  // `run-batteries.mutations.sh` — the battery that proves THIS runner can fail
  // — runs the runner. Refusing it would break the very proof that the lock is
  // part of, and the first version did exactly that: R1 and R2, which assert the
  // runner exits 1 for a bad battery, instead observed exit 2 (the lock refusal)
  // and reported SURVIVED. A guard that breaks its own test is worse than no
  // guard, because it fails in the direction that looks like a finding.
  //
  // The child is identified by an environment token that only this process sets,
  // so it cannot be forged by a shell that merely happens to be nested. A nested
  // run is NOT given the lock and does NOT release it — the outermost run owns
  // the tree for the whole duration, which is the correct ownership model: a
  // battery may drive the runner, but only one tree is ever under mutation.
  //
  // Stale-lock policy: the lock records a pid. If that pid is gone the run it
  // described is over (killed, crashed, or timed out), so the lock is stale and
  // is reclaimed with a printed note. Reclaiming on any age test alone would
  // deadlock a long legitimate run past its timeout.
  // ── Is this run NESTED inside another one? ─────────────────────────────────
  // Two independent signals, and both are needed:
  //
  //   * the environment token, set by a runner on the batteries it spawns. This
  //     covers the normal case: a runner drives `verify:batteries`, which drives
  //     the runner.
  //   * a lock held by a LIVE foreign process. This covers the case the token
  //     cannot: a developer running `bash scripts/ci/run-batteries.mutations.sh`
  //     by hand. That battery drives the runner, but no runner spawned the
  //     battery, so no token is set — and the nested runner then swept
  //     `.tmp-runbat/` out from under the battery that was testing it, producing
  //     five bogus SURVIVED lines. Measured with `bash -x`:
  //
  //       + mkdir -p .tmp-runbat
  //       + cp check-md-tables.mutations.sh .tmp-runbat/probe.sh      <- ok
  //       + node scripts/ci/run-batteries.mjs --only=verify:md        <- swept it
  //       + restore
  //       cp: cannot stat '.tmp-runbat/probe.sh': No such file or directory
  //
  // The lock is the authoritative statement "a run is already holding this
  // tree", whoever asked for it, so it is read before anything else and
  // `NESTED` follows from it. Deriving nesting from the lock rather than from
  // who set a variable is what makes the manual invocation behave the same as
  // the CI one — and a harness that behaves differently when run by hand is a
  // harness whose green lights mean nothing locally.
  //
  // A nested run does NOT take the lock and does NOT release it: the outermost
  // run owns the tree for the whole duration. A battery may drive the runner,
  // but only one tree is ever under mutation.
  const heldByOther = () => {
    let held = null;
    try {
      held = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    } catch {
      /* absent or unreadable: no lock, or a torn write from a killed run */
    }
    if (!held || !Number.isInteger(held.pid) || held.pid === process.pid) return null;
    try {
      process.kill(held.pid, 0); // signal 0: existence check, no signal sent
      return held;
    } catch (err) {
      // EPERM means it exists but is not ours to signal -> still alive.
      return err && err.code === 'EPERM' ? held : null;
    }
  };

  const foreignHolder = LIST_ONLY ? null : heldByOther();
  // The env token alone means "a runner spawned me": legitimate nesting, e.g.
  // `verify:batteries` driving this runner. A live foreign lock WITHOUT the
  // token means someone else started a run against the same tree — that is the
  // accidental two-run case the lock exists to stop, and it must refuse.
  const SPAWNED = process.env.BATTERY_RUN_NESTED === '1';
  if (SPAWNED && foreignHolder) {
    console.log(`  note: NESTED run inside pid ${foreignHolder.pid}; not sweeping scratch or`);
    console.log('        fixtures, which belong to that run.');
    console.log('');
  }
  if (!LIST_ONLY && !SPAWNED && foreignHolder) {
    console.error('BATTERY RUNNER — TOOLING ERROR: another battery run is already active.');
    console.error(`  pid      : ${foreignHolder.pid}`);
    console.error(`  started  : ${foreignHolder.started || '(unrecorded)'}`);
    console.error(`  only     : ${foreignHolder.only || 'all hermetic'}`);
    console.error('');
    console.error('Two runs in one working tree interleave their mutations on the same');
    console.error('files, so both report defects that do not exist. Wait for it to finish, or');
    console.error('stop it, then delete the lock if it was killed:');
    console.error(`  rm -f ${path.relative(ROOT, LOCK)}`);
    process.exit(2);
  }
  const NESTED = SPAWNED;
  if (!LIST_ONLY && !NESTED) {
    // A lock file left by a process that is gone is stale, and `heldByOther()`
    // has already classified it as such by returning null for it. Say so, since
    // a silently reclaimed lock hides the fact that an earlier run died.
    let stalePid = null;
    try {
      const prev = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
      if (prev && Number.isInteger(prev.pid) && prev.pid !== process.pid) stalePid = prev.pid;
    } catch {
      /* absent or torn: nothing to reclaim */
    }
    if (stalePid !== null) {
      console.log(`  note: reclaiming a STALE lock from pid ${stalePid} (that process is gone).`);
      console.log('        An earlier run died without releasing it; its mutations may still be');
      console.log('        in the tree, and the dirty-gate pre-flight below is what catches that.');
      console.log('');
    }
    try {
      fs.writeFileSync(
        LOCK,
        JSON.stringify(
          { pid: process.pid, started: new Date().toISOString(), only: ONLY ? [...ONLY].join(',') : null },
          null,
          2
        )
      );
      // Best-effort release on every exit path, including a thrown error or a
      // signal. `process.on('exit')` runs for normal termination and for
      // uncaught exceptions; SIGINT/SIGTERM set an exit code so the lock does
      // not survive a Ctrl-C.
      const release = () => {
        try {
          const cur = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
          if (cur.pid === process.pid) fs.rmSync(LOCK, { force: true });
        } catch {
          /* already gone */
        }
      };
      process.on('exit', release);
      for (const sig of ['SIGINT', 'SIGTERM']) {
        process.on(sig, () => {
          release();
          process.exitCode = 130;
        });
      }
    } catch (err) {
      console.error(`BATTERY RUNNER — TOOLING ERROR: cannot take the run lock: ${err.message}`);
      process.exit(2);
    }
  }

  // Cleared only by the run that owns the path: a nested run inherits it, and
  // wiping it there would delete the parent's findings from earlier batteries.
  if (RM_RETRY_LOG_OWNED) {
    try {
      fs.rmSync(RM_RETRY_LOG, { force: true });
    } catch {
      /* nothing to clear */
    }
  }

  console.log('Mutation battery runner');
  console.log('-'.repeat(64));
  console.log(`  manifest  : scripts/ci/review-manifest.json`);
  console.log(`  hermetic  : ${hermetic.length} gate(s)  <- run here`);
  console.log(`  infra     : ${infra.length} gate(s)  <- NOT run here (needs live infra)`);
  console.log(`  none      : ${none.length} gate(s)  <- no battery exists`);
  if (infra.length) console.log(`    skip: ${infra.map((g) => g.script).join(', ')}`);
  if (none.length) console.log(`    none: ${none.map((g) => g.script).join(', ')}`);
  console.log('');

  if (LIST_ONLY) {
    for (const g of selected) console.log(`  ${g.script.padEnd(24)} -> ${g.provenBy}`);
    console.log(`\n${selected.length} battery/batteries would run.`);
    return;
  }

  // Pre-flight: the file must exist AND be tracked. "On disk" is not "in the
  // checkout", and the whole point of running these in CI is the checkout.
  const preflight = [];
  for (const g of selected) {
    if (!g.provenBy) {
      preflight.push(`${g.script}: classified battery="ci" but has no provenBy battery`);
      continue;
    }
    const abs = path.join(ROOT, g.provenBy);
    if (!fs.existsSync(abs)) {
      preflight.push(`${g.script}: ${g.provenBy} does not exist on disk`);
      continue;
    }
    if (!isTracked(g.provenBy)) {
      preflight.push(`${g.script}: ${g.provenBy} is NOT tracked by git (absent in CI's checkout)`);
    }
  }
  if (preflight.length) {
    console.error('BATTERY RUNNER — TOOLING ERROR: the hermetic set is not runnable:');
    for (const p of preflight) console.error(`  - ${p}`);
    console.error('');
    console.error('Fix the manifest or the repository. A battery that cannot run is not a proof.');
    process.exit(2);
  }

  // A battery mutates a gate and then restores it. That only proves anything if
  // the gate was unmutated to begin with — the repo's own rule: "a tree that is
  // already dirty before a run cannot prove anything". A tracked edit inside a
  // battery's BLAST RADIUS is either a live mutation from an interrupted run or
  // someone's work-in-progress on the very gate under test; either way the
  // verdicts below would be about the wrong bytes, so it is a tooling error and
  // not a battery failure.
  //
  // ── WHY THE RADIUS IS A PREDICATE AND NOT "ANY DIRTY FILE" ───────────────
  // The first version refused on ANY tracked edit, and was immediately useless:
  // on this repository it aborted on `docs/UI_DESIGN_REVIEW.md` and
  // `indexer/validate-report.json`, which belong to another session's work and
  // which no gate battery reads or writes. A check that blocks every run for a
  // reason unrelated to the question being asked gets disabled, so it has to
  // name the real blast radius instead of the whole tree.
  //
  // Measured from the batteries themselves: every `GATE=` resolves under
  // `scripts/ci/` or `indexer/scripts/`, and the only other tracked files they
  // edit are the batteries and the manifest — all of which live under
  // `scripts/ci/`. So `scripts/ci/**` is the radius. It is stated as a prefix
  // rather than a file list because a list would drift the moment a battery is
  // added, and the drift would be silent.
  //
  // `indexer/scripts/impact-gate.mjs` is inside the radius logically but not
  // literally; `typecheck-indexer.mutations.sh` edits it, and it is covered by
  // the WIDENED check below (any dirty file whose path appears as a GATE in a
  // battery is caught) — see `dirtyGatesOnly`.
  // ── The blast radius, measured rather than assumed ─────────────────────────
  // `scripts/ci/**` holds every `GATE=` the batteries resolve, plus the batteries
  // and the manifest themselves. `.ci/**` holds the RATCHET BASELINES
  // (`tsc-baseline.json`, `biome-baseline.json`) — frozen reference data that the
  // gates compare against and that `--update-baseline` rewrites.
  //
  // `.ci/` was MISSING from the first version of this list, and that is exactly
  // the kind of omission this check exists to prevent: a battery that leaves a
  // baseline rewritten changes the standard every later ratchet gate is measured
  // against, and the change is a one-line JSON diff in a tracked file that no
  // `untracked` check can see. `typecheck-ratchet` and `lint-ratchet` both read
  // from here, so a corrupted baseline makes them fail — or, worse, PASS —
  // for reasons that have nothing to do with the mutation under test.
  //
  // Prefixes, not a file list: a list drifts silently the moment a baseline is
  // added, which is the failure mode being guarded against.
  const RADIUS_PREFIXES = ['scripts/ci/', '.ci/'];
  // A nested run is skipped here on purpose. The parent holds mutations in
  // `scripts/ci/**` while it supervises its battery, so a child that demanded a
  // clean radius would refuse to run every time it was called — and the battery
  // that calls it (`verify:batteries`) would report that refusal as a defect in
  // the runner. Correctness of the check is not in question; its applicability
  // is. The outermost run has already asserted the radius was clean before it
  // installed any mutation, and that assertion is the one that matters.
  const dirtyAll = NESTED ? new Set() : trackedDirty();
  const dirtyInRadius = [...dirtyAll].filter((f) => RADIUS_PREFIXES.some((p) => f.startsWith(p)));
  if (dirtyInRadius.length) {
    console.error('BATTERY RUNNER — TOOLING ERROR: files under the gate radius have tracked edits:');
    for (const f of dirtyInRadius) console.error(`  - ${f}`);
    console.error('');
    console.error('A battery swaps a gate out and back. If a gate is already modified, every');
    console.error('verdict below describes bytes that are not the committed ones — including');
    console.error('that a mutation could already be installed. Commit, stash, or restore these');
    console.error('first:  git checkout -- <paths>   (after checking they are not real work).');
    process.exit(2);
  }
  // Edits OUTSIDE the radius do not block the run, but they are printed: the
  // reader of a green run should still know the tree was not pristine, because
  // "the batteries passed" is a claim about the gates, not about the worktree.
  if (dirtyAll.size) {
    console.log(`  note: ${dirtyAll.size} tracked edit(s) outside the gate radius (ignored):`);
    for (const f of dirtyAll) console.log(`        ${f}`);
    console.log('');
  }

  // Sweep fixture debris an earlier (killed) run left behind, BEFORE measuring
  // anything. Without this the run inherits a dirty tree, `sweepLeaks()` cannot
  // see it (every file is "pre-existing"), and the batteries measure each
  // other's corpses — see the header of `fixturePrefixes()` for the measurement.
  //
  // Nested runs skip this for the same reason they skip `sweepScratch()`: the
  // parent's fixtures are the parent's, and removing them pulls the rug from
  // under a battery that is mid-measurement one level up.
  const staleFixtures = NESTED ? [] : sweepFixtures();
  if (staleFixtures.length) {
    console.log(`  swept ${staleFixtures.length} fixture file(s) left by an earlier run:`);
    for (const f of staleFixtures) console.log(`        ${f}`);
    console.log('  (this run therefore did NOT start pristine; the sweep is the reason it can proceed)');
    console.log('');
  }

  const failures = [];
  const passed = [];
  const leaks = [];
  const scratched = [];
  const startedAt = Date.now();

  for (const g of selected) {
    const script = g.provenBy;
    // Clear scratch state and snapshot untracked files BEFORE the battery runs,
    // so the run starts from a known state and anything new afterwards is its
    // leak. Both are required: scratch answers "what did a previous run leave",
    // untracked answers "what did THIS one leave".
    //
    // ── A NESTED RUN MUST NOT SWEEP. THIS IS NOT AN OPTIMISATION. ─────────────
    // `.tmp-runbat/` is `run-batteries.mutations.sh`'s backup store, and that
    // battery drives THIS runner. So when the parent runner supervises
    // `verify:batteries`, the child runner used to sweep the parent's scratch on
    // its way in — deleting the very backups the parent needed to restore. The
    // damage was direct and self-inflicted, measured:
    //
    //     cp: cannot stat '.tmp-runbat/probe.sh': No such file or directory
    //     RESTORE FAILED — scripts/ci/check-md-tables.mutations.sh is not byte-identical
    //     killed: 1   survived: 5
    //
    // Five SURVIVED lines — i.e. "the runner cannot detect a bad battery" — from
    // a runner whose only problem was deleting its tester's fixtures. A nested
    // run is a pure observer: it measures, and it removes only what IT leaks.
    // The outermost run owns every piece of tree state.
    // ── Sweep BEFORE as well as after. This is the fix for the cascade. ──────
    // `sweepLeaks()` runs after the battery, and only ever removes files that
    // appeared DURING it. That is the right rule for ATTRIBUTION and the wrong
    // rule for ISOLATION: a fixture that reached the tree by any other route —
    // a battery killed mid-flight, an `npm run` that died, a previous run's
    // abort, a developer's stray probe — is "pre-existing" and therefore
    // invisible, and it silently becomes the next battery's input.
    //
    // Measured 2026-09-15, and this single hole produced the whole cascade:
    // `verify:io`'s fixture `netlify/functions/__iomut-clean.ts` sat in the tree
    // and `tsconfig.json` (`include: ["src/**/*","netlify/functions/**/*"]`) saw
    // it, so app `tsc --noEmit` reported a real TS2307 against a symbol
    // (`kernelFetch`) that `netlify/functions/_lib/kernel/http.ts` never
    // exported. Verified directly, both directions:
    //
    //     pristine tree   -> npx tsc --noEmit   exit 0, 0 errors
    //     + that one file -> netlify/functions/__iomut-clean.ts(1,29):
    //                        error TS2307: Cannot find module '../_lib/kernel/http.js'
    //
    // From there `typecheck:ratchet` printed the decisive line
    // `setup: planted 1 type error, tsc now reports 2` (it must report 1),
    // failed `NOT GREEN AFTER RESTORE`, and eleven gates went red on a tree
    // whose gates were all fine. The gate was never broken; the tree was.
    //
    // So the recognised fixture shape is swept before every battery, exactly as
    // `sweepLeaks()` sweeps it after. Sweeping is idempotent and touches only
    // UNTRACKED paths whose basename matches `FIXTURE_BASENAME`, so a real file
    // can never be removed, and a battery that legitimately creates one during
    // its own run is unaffected. A nested run still sweeps nothing: the parent's
    // fixtures belong to the parent.
    const preSwept = NESTED ? [] : sweepFixtures();
    if (preSwept.length) {
      console.log(`  swept ${preSwept.length} pre-existing fixture(s) before ${g.script}:`);
      for (const f of preSwept) console.log(`        ${f}`);
    }
    const scratch = NESTED ? [] : sweepScratch();
    const untrackedBefore = untrackedSet();
    // Tracked edits are a different question again, and the one that decides
    // whether this battery's verdict can be interpreted at all. Anything dirty
    // here was left by an EARLIER battery: it is not a leak, it is a live
    // mutation in a gate, and it must stop the run rather than be measured past.
    const dirtyBefore = trackedDirty();
    const t0 = Date.now();
    // `bash` explicitly: the shebang alone is not enough on all runners, and CI
    // invokes these through bash anyway.
    const res = spawnSync('bash', [script], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
      // `CI=true` mirrors the workflow. `BATTERY_RUN_NESTED` tells any runner a
      // battery starts that it is a CHILD of this run and must not take the lock
      // — see the ownership note in main(). Without it, the battery that proves
      // this runner can fail (`verify:batteries`) is refused by its own guard.
      env: { ...process.env, CI: 'true', BATTERY_RUN_NESTED: '1', RM_RETRY_LOG },
    });
    const ms = Date.now() - t0;

    // Sweep BEFORE judging. A battery's own leaked fixtures can be the reason
    // its verification failed, and cleaning lets the NEXT battery start clean.
    const leaked = sweepLeaks(untrackedBefore);
    if (scratch.length) scratched.push({ gate: g.script, dirs: scratch });

    const out = `${res.stdout || ''}${res.stderr || ''}`;
    const survived = /^SURVIVED/m.test(out);
    const unexpected = /^UNEXPECTED/m.test(out);

    // Judged by exit code first (the repo's own rule), with the SURVIVED /
    // UNEXPECTED lines surfaced as the reason rather than the verdict.
    let ok = res.status === 0 && !survived && !unexpected;

    // ── Did the battery leave a tracked file mutated? ───────────────────────
    // The most dangerous outcome, and the one that caused the 2026-09-15
    // cascade: `verify:projections` left its own gate holding mutation S2
    // (`return src;` in place of `stripBlockComments`), and the runner reported
    // eleven unrelated gates as broken instead. A mutant in a gate is not a
    // finding about the gate — it is a broken harness, and it may not be
    // silently restored and forgotten: the mutation is reported with its path so
    // the restore bug can be fixed.
    //
    // Scoped to the same radius as the pre-flight. A tracked file outside it was
    // dirty before this battery ran (the pre-flight proved that for
    // `scripts/ci/**`, and `dirtyBefore` proves it for anything else), so it
    // cannot be attributed here and is not this battery's doing.
    const dirtyAfter = trackedDirty();
    const leftDirty = [...dirtyAfter].filter((f) => !dirtyBefore.has(f));
    if (leftDirty.length) {
      ok = false;
      failures.push({
        script: g.provenBy,
        gate: g.script,
        why: `left ${leftDirty.length} tracked file(s) MUTATED (restore is broken): ${leftDirty.join(', ')}`,
      });
    }

    // Always print the battery's own summary lines — a gate should say WHAT it
    // measured, and a runner that swallows that hides the hole it just found.
    // The summary keeps every line that can EXPLAIN a verdict, not only the
    // verdict tally. The first version filtered for `killed|survived|ok-green|
    // unexpected|baseline|restore|post-battery`, which dropped the line that
    // actually names why an otherwise-perfect battery exited non-zero:
    //
    //     killed:     5
    //     survived:   0          <- a spotless battery ...
    //     [NOT GREEN AFTER RESTORE — the real baseline no longer matches]  <- DROPPED
    //
    // so the runner printed "battery exited 1" next to a perfect score and gave
    // the reader nothing to act on. A gate must say WHAT it measured, and a
    // runner quoting a gate must not drop the gate's own diagnosis.
    const summary = out
      .split(/\r?\n/)
      .filter(
        (l) =>
          /^(killed|survived|ok-green|unexpected|baseline|restore|post-battery)/i.test(l) ||
          // Diagnostic lines that are the REASON for a non-zero exit.
          /(NOT GREEN|RESTORE FAILED|LEFTOVER|ABORT|SURVIVED\s|UNEXPECTED\s|FAILED)/i.test(l)
      )
      .map((l) => `      ${l.trim()}`)
      .join('\n');

    if (ok) {
      console.log(`  PASS  ${g.script.padEnd(24)} ${String(Math.round(ms / 1000)).padStart(4)}s`);
      passed.push(g.script);
    } else {
      const why = leftDirty.length
        ? 'left a tracked file MUTATED — see the LEFTOVER MUTATION block below'
        : res.status === null
          ? `timed out after ${Math.round(ms / 1000)}s (signal ${res.signal})`
          : survived
            ? 'a mutation SURVIVED — the gate cannot see that defect'
            : unexpected
              ? 'a control mutation did not stay green — the gate fails on valid input'
              : `battery exited ${res.status}`;
      console.log(`  FAIL  ${g.script.padEnd(24)} ${String(Math.round(ms / 1000)).padStart(4)}s  ${why}`);
      const existing = failures.find((f) => f.gate === g.script && f.script === g.provenBy);
      if (existing) existing.why = `${why}; ${existing.why}`;
      else failures.push({ script: g.provenBy, gate: g.script, why });
    }
    if (leftDirty.length) {
      console.log(`      LEFTOVER MUTATION in tracked file(s): ${leftDirty.join(', ')}`);
      console.log('      This is a HARNESS defect: the battery restored from a stale or absent backup.');
      console.log('      The next battery would have measured a mutated gate. Tree left as-is for inspection.');
      // Restore from git so the RUN can continue and report the real state of
      // the remaining batteries. `git checkout --` on a tracked path is safe:
      // these files are committed, and the runner is a read-only observer of
      // everything else. The corruption is already recorded in `failures`.
      try {
        execFileSync('git', ['checkout', '--', ...leftDirty], { cwd: ROOT, stdio: 'ignore' });
      } catch {
        console.log('      (could not auto-restore; the tree is dirty for the rest of this run)');
      }
    }
    if (summary) console.log(summary);
    // A leak is its own finding, separate from the verdict: it does not fail the
    // gate under test, it corrupts the NEXT battery. Reported always, because a
    // silent leak is what made this run report ten failures where there was one.
    if (leaked.length) {
      console.log(`      LEAKED ${leaked.length} fixture(s), swept: ${leaked.join(', ')}`);
      leaks.push({ gate: g.script, files: leaked });
    }
  }

  const total = Math.round((Date.now() - startedAt) / 1000);
  console.log('');
  console.log('-'.repeat(64));
  console.log(`batteries run : ${selected.length}`);
  console.log(`passed        : ${passed.length}`);
  console.log(`failed        : ${failures.length}`);
  console.log(`leaked fixture(s) from : ${leaks.length} battery/batteries`);

  // Scratch left by an INTERRUPTED earlier run. Reported because it explains a
  // class of "it failed and then passed" that is otherwise indistinguishable
  // from flakiness — and flakiness is how a gate gets distrusted and removed.
  if (scratched.length) {
    console.log('');
    console.log('SWEPT STALE SCRATCH from an interrupted earlier run (would have corrupted restore):');
    for (const s of scratched) console.log(`  - ${s.gate}: ${s.dirs.join(', ')}`);
  }

  // ── Sweeps that could not delete ──────────────────────────────────────────
  // The runner's one job that makes its verdicts attributable is leaving the
  // tree as it found it. When it cannot, the NEXT battery measures this one's
  // debris -- so it is reported next to the leaks, with the error, and it is
  // fatal: a run that could not clean up cannot certify what it measured.
  if (sweepFailures.length) {
    console.log('');
    console.log('SWEEP FAILED — a path could not be removed after retrying:');
    for (const f of sweepFailures) {
      console.log(`  - ${f.path}  (${f.attempts} attempt(s)): ${f.err}`);
    }
    console.log('  The next battery measured a tree that still held this. Any verdict it');
    console.log('  produced is suspect, and this is a HARNESS finding, not a gate finding.');
    failures.push({
      script: 'run-batteries.mjs',
      gate: '(sweep)',
      why: `could not remove ${sweepFailures.length} path(s); the run's tree state is not attributable`,
    });
  }

  // A leak is REPORTED, not fatal. It does not mean the leaking gate cannot
  // fail — it means that battery does not clean up after itself, which is a
  // defect in the battery and is repaired here rather than hidden. It is called
  // out because a silent leak is exactly what produced ten false failures on the
  // first run of this runner: each leak was attributed to the NEXT battery.
  if (leaks.length) {
    console.log('');
    console.log('BATTERIES THAT LEAKED FIXTURES (swept, but the battery should clean up):');
    for (const l of leaks) console.log(`  - ${l.gate}: ${l.files.join(', ')}`);
  }

  // ── Transient deletes the batteries had to retry ──────────────────────────
  // The retry is what stops one OS hiccup from becoming a leaked fixture and a
  // dozen false failures. But a retry nobody reports hides a machine-specific
  // fragility behind a green line, and this repo's whole position is that a gate
  // must print what it MEASURED. So the count is printed every run, including
  // the zero -- a zero here is the evidence that the 18 green lines above did
  // not depend on a retry.
  let retryLines = [];
  try {
    retryLines = fs
      .readFileSync(RM_RETRY_LOG, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim());
  } catch {
    /* no file at all: no battery had to retry anything */
  }
  // ── Is a SANDBOX guarding this shell's deletes? ───────────────────────────
  // Measured 2026-09-16, in the shell this agent runs in: \`rm\` is a FUNCTION
  // wrapping \`.../cli/vendor/shim/safe-bin/rm\`, sourced through \`BASH_ENV\` into
  // every bash subprocess. It allows ~50 deletions per turn and then refuses:
  //
  //   [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]
  //   {"count":72,"threshold":50,"scope":"turn","targets":[".../src/__tsmut.ts"]}
  //
  // A battery run deletes hundreds of times. Past the fiftieth, every clean-up
  // in every battery is refused, the fixture survives, the battery reports
  // LEFTOVER -- and eleven gates that were never broken go red. Four full runs
  // (945 s, 1166 s, 1118 s, ~1285 s) were spent on that, and every explanation
  // written for them (cwd, a Windows handle, elapsed time) was wrong.
  //
  // It is a fact about the ENVIRONMENT. GitHub Actions does not wrap \`rm\`, so
  // the \`batteries\` job is unaffected. A runner that reported the same red wall
  // in both places would be lying by omission, so this says which one it saw.
  const guarded = retryLines.some((l) => /safe-delete|SAFE_DELETE_BULK/i.test(l));
  if (guarded) {
    console.log('');
    console.log('!! THE SHELL GUARDS DELETES — the verdicts above are NOT about this repository.');
    console.log('   `rm` is wrapped by a sandbox that allows ~50 deletions per turn and then');
    console.log('   refuses, so a battery cannot clean up its own fixtures and reports LEFTOVER');
    console.log('   for files it was never allowed to remove. A battery run deletes hundreds of');
    console.log('   times. Measure the acceptance test in CI, where `rm` is `rm`, or in a shell');
    console.log('   that does not wrap it. See docs/CI_BATTERY_RUNNER_STATUS.md.');
  }

  const gaveUp = retryLines.filter((l) => l.includes('GIVING UP')).length;
  console.log(
    `delete retries: ${retryLines.length} transient unlink failure(s)` +
      (gaveUp ? `, ${gaveUp} of which NEVER SUCCEEDED` : '')
  );
  if (retryLines.length) {
    console.log('');
    console.log('TRANSIENT DELETE FAILURES (the batteries retried and carried on):');
    for (const l of retryLines) console.log(`  ${l}`);
    console.log('');
    console.log('  A retry that SUCCEEDED means the verdicts above are still valid. It does not');
    console.log('  mean the machine is fine, and it must not be rounded to zero: the errno above');
    console.log('  is the diagnosis docs/CI_BATTERY_RUNNER_STATUS.md asked for.');
    console.log(`  log: ${RM_RETRY_LOG}`);
  }

  console.log(`wall time     : ${total}s`);

  // Say what was NOT proven, so a green run is not read as "everything is
  // proven". The unproven set is the honest remainder.
  const stillUnproven = [...infra.map((g) => g.script), ...none.map((g) => g.script)];
  if (stillUnproven.length) {
    console.log('');
    console.log(`NOT proven by this run (${stillUnproven.length}): ${stillUnproven.join(', ')}`);
    console.log('  These gates have a battery that needs live infrastructure, or none at all.');
  }

  if (failures.length) {
    console.error('');
    console.error('BATTERY RUNNER FAILED — a gate is no longer proven able to fail:');
    for (const f of failures) console.error(`  - ${f.gate} (${f.script}): ${f.why}`);
    console.error('');
    console.error('This is a finding about a GATE, not about your change. Investigate before');
    console.error('widening the gate or deleting the mutation — see the battery\'s own header.');
    process.exit(1);
  }

  console.log('');
  console.log('BATTERY RUNNER PASSED — every hermetic battery still discriminates: each one');
  console.log('re-introduces a defect class and its gate still exits non-zero for it.');
}

main();
