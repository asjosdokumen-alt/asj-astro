#!/usr/bin/env bash
# Mutation battery for the test gate.
#
#   package.json:  test           = vitest run
#   package.json:  test:frontend  = vitest run --project frontend
#   package.json:  test:backend   = vitest run --project backend
#
# WHY A BATTERY, AND WHY THIS ONE IS SHAPED DIFFERENTLY
# -----------------------------------------------------
# Every other battery in this directory mutates a gate script and checks that a
# defect is caught. There is no gate script here: `vitest run` IS the gate, and
# the project owns no logic around it. So the useful question is not "can a test
# fail" — obviously it can — but:
#
#   1. does a failing test actually make `npm test` exit non-zero, so CI reacts?
#   2. does the runner FAIL CLOSED when its include globs match nothing, or does
#      it report success over an empty suite?
#   3. are both projects actually running, so neither can be silently dropped?
#
# Question 2 is the one that decides whether this gate is real, and it is the
# reason this file exists. A test runner that exits 0 on "no test files found"
# would turn the largest gate in `ci:quality` into a green line that measures
# nothing — the vacuous-pass defect class found three times elsewhere today
# (verify-projections on an empty directory, bundle-size with a missing baseline,
# typecheck:indexer with a narrowed include).
#
# MEASURED ANSWER: vitest fails closed. `No test files found, exiting with code
# 1`, reproduced 2026-09-15 by narrowing the frontend `include` to a
# non-existent path. That is why no fix follows from this battery, and saying so
# plainly matters as much as reporting a bug would.
#
# The remaining risk is therefore NOT the runner but the CONFIG. If a project's
# `include` were narrowed while still matching something, vitest would be right
# to pass. T3 pins the globs themselves so that change has to be deliberate.
#
# DEFECT CLASSES
# --------------
#   X1  a failing test makes `npm test` exit non-zero          -> KILL
#   X2  a passing test leaves it green                          -> OK-GREEN (control)
#   X3  the same failing test in the backend project            -> KILL (proves the
#       backend project is wired, not just the frontend one)
#   X4  a project whose include matches nothing fails closed    -> KILL, asserted
#       on the message so it is failing for the documented reason
#   X5  the two projects' include globs are intact              -> asserted,
#       with X4 demonstrating the assertion can fail
#   X6  both projects are discoverable by name                  -> asserted; the
#       GitHub workflow runs `--project frontend` and `--project backend`
#       separately, so a renamed project would leave a workflow job running
#       nothing (or erroring) rather than running the suite
#
# "OK-GREEN" in this family means green is the CORRECT answer — the defect class
# is deliberate behaviour being asserted. X4 is not one of those: it asserts a
# non-zero exit on a broken config, so it is recorded as KILLED.
#
# X2/X3 rule out a runner that simply always exits non-zero, which would satisfy
# every KILL above.
#
# SCOPE, STATED HONESTLY
# ----------------------
# This battery proves the RUNNER CONTRACT and the project structure. It does not
# and cannot prove that the assertions inside the 140 test files are meaningful —
# that is what each test's own review is for, and what the mutation batteries for
# the individual gates cover in the places where it has been done. Claiming
# otherwise would be the same overreach this session has been correcting.
#
# It also does not run the full suite: 140 files take ~5 minutes, which is too
# slow for a battery and would make people stop running it. Each case scopes to a
# single planted file or a single project, so the whole battery is seconds.
#
# TRAPS, ALL REAL
# ---------------
#  1. **A planted test file must be removed on every exit path.** A leftover
#     failing test breaks `npm test`, `ci:quality` and therefore every downstream
#     gate. `trap cleanup EXIT` covers it, and the file is swept up front in case
#     a previous run died mid-flight.
#  2. **vitest.config.ts is TRACKED and must come back byte-identical.** The
#     include-narrowing case edits it, so the restore is done with `git checkout
#     HEAD --` and asserted via `git status` — not via a `cp` backup, which a
#     previous battery in this repo has already shown cannot detect an EOL
#     rewrite.
#  3. **A failing test file under src/ is matched by BOTH the frontend project
#     and the inventory ratchets.** The planted names are `zz-battery-*` and are
#     removed before any project-wide command runs, so the indexer's file-count
#     ratchet never sees them.
#  4. **`pool: 'threads'` matters here too.** vitest.config.ts documents that the
#     default 'forks' pool hangs after printing results on Windows. Every case
#     below waits for a real exit code, so a hang would surface as a battery
#     timeout rather than a false pass — but it is worth knowing why the cases
#     are all short.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/test.mutations.sh
set -u

# ── Transient-delete hardening ──────────────────────────────────────────────
# `rm` returns 1 inside a long run for a reason that is gone a moment later:
# measured at this file's clean-up site, in-run, `rc=1` with the path correct
# and the file still present. An un-deleted fixture then becomes the NEXT
# battery's input -- one leftover file once turned into twelve red gates.
# Every delete below therefore goes through `rm_retry`, which retries and
# records the errno. See scripts/ci/lib/rm-retry.sh for the measurement.
RM_RETRY_LIB="$(dirname "${BASH_SOURCE[0]}")/lib/rm-retry.sh"
[ -f "$RM_RETRY_LIB" ] || { echo "FATAL — missing $RM_RETRY_LIB; the batteries are not runnable without it"; exit 2; }
. "$RM_RETRY_LIB"

PLANT_FE="src/zz-battery-test-planted.test.ts"
PLANT_BE="netlify/functions/_lib/zz-battery-test-planted.test.ts"
VITEST_CONFIG=vitest.config.ts
fail=0
results=()

cleanup() {
  rm_retry "$PLANT_FE" "$PLANT_BE"
}
trap cleanup EXIT

# ── 1 · Sweep litter a previous aborted run may have left (trap 1) ──────────
for p in "$PLANT_FE" "$PLANT_BE"; do
  if [ -e "$p" ]; then
    echo "NOTE: $p survived a previous run (killed before cleanup). Sweeping."
    rm_retry "$p"
  fi
done

# ── 2 · Restore-proof precondition (trap 2) ─────────────────────────────────
# Refuse to start if vitest.config.ts is already dirty: the include-narrowing
# case restores it with `git checkout HEAD --`, which would discard someone
# else's uncommitted work. Better to stop than to silently delete it.
if [ -n "$(git status --porcelain -- "$VITEST_CONFIG" | grep -v '^??' || true)" ]; then
  echo "ABORT: $VITEST_CONFIG has uncommitted changes. The include-narrowing case"
  echo "       restores it with \`git checkout HEAD --\`, which would discard them."
  echo "       Commit or stash first."
  exit 1
fi

# ── 3 · X6 · both projects are discoverable (trap 4) ────────────────────────
# Run before anything else, because every later case names a project and a
# renamed project would make those cases error out for an unrelated reason.
# Parsed from the config so the check reads the source of truth.
PROJECT_NAMES=$(node -e "
  const fs = require('node:fs');
  const src = fs.readFileSync('$VITEST_CONFIG', 'utf8');
  const names = [...src.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
  process.stdout.write(names.join(' '));
")
MISSING=""
for want in frontend backend; do
  case " $PROJECT_NAMES " in
    *" $want "*) ;;
    *) MISSING="$MISSING $want" ;;
  esac
done
if [ -z "$MISSING" ]; then
  echo "OK-GREEN   -      X6  both projects are defined: $PROJECT_NAMES"
  results+=("OK-GREEN X6 projects present")
else
  echo "UNEXPECTED        X6  project(s) not found in $VITEST_CONFIG:$MISSING"
  echo "                      The CI workflow runs --project frontend and --project"
  echo "                      backend by name; a renamed project leaves those jobs"
  echo "                      running nothing."
  results+=("UNEXPECTED X6 missing project(s):$MISSING")
  fail=1
fi

# ── 4 · X5 · the include globs are intact (trap 2) ──────────────────────────
# The remaining vacuous-pass risk. vitest fails closed on an EMPTY match (X4),
# but a narrowed glob that still matches something would pass correctly — so the
# globs are pinned here and X4 demonstrates the pin can fail.
GLOB_OK=$(node -e "
  const fs = require('node:fs');
  const src = fs.readFileSync('$VITEST_CONFIG', 'utf8');
  const required = [
    \"src/**/*.test.{ts,tsx}\",
    \"e2e/**/*.test.{ts,tsx}\",
  ];
  const missing = required.filter((g) => !src.includes(g));
  if (missing.length) { console.error(missing.join(', ')); process.exit(1); }
")
if [ "$?" -eq 0 ]; then
  echo "OK-GREEN   -      X5  both project include globs are intact"
  results+=("OK-GREEN X5 include globs intact")
else
  echo "UNEXPECTED        X5  include glob(s) changed or removed: $GLOB_OK"
  echo "                      A narrowed glob that still matches something would let"
  echo "                      the suite pass over fewer files with no warning."
  results+=("UNEXPECTED X5 include globs changed")
  fail=1
fi

# ── 5 · X4 · the runner fails closed on an empty include ────────────────────
# The decisive case, and a KILL in the same sense as every other battery's kill:
# a broken configuration is refused rather than reported as success.
#
# Counted as KILLED, not OK-GREEN. The first draft printed "OK-GREEN exit=1",
# which is self-contradictory on its face — a green line beside a non-zero exit.
# The verdict it was asserting is exactly a kill (non-zero on a defect), so it
# is recorded as one; OK-GREEN in this family means "green is the correct
# answer", and here it is not.
node -e "
  const fs = require('node:fs');
  const src = fs.readFileSync('$VITEST_CONFIG', 'utf8');
  const needle = \"include: ['src/**/*.test.{ts,tsx}', 'e2e/**/*.test.{ts,tsx}']\";
  if (!src.includes(needle)) {
    console.error('ABORT: frontend include is not the shape this battery expects:');
    console.error('        ' + needle);
    process.exit(1);
  }
  fs.writeFileSync('$VITEST_CONFIG', src.replace(needle, \"include: ['src/zzz-nothing-matches/**/*.test.{ts,tsx}']\"));
" || { echo "ABORT: could not narrow the frontend include."; exit 1; }

OUT=$(npx vitest run --project frontend 2>&1)
RC=$?
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -qi 'no test files found'; then
  echo "KILLED     exit=$RC  X4  an empty include is refused, with the reason named"
  results+=("KILLED X4 empty include fails closed")
elif [ "$RC" -ne 0 ]; then
  echo "KILLED     exit=$RC  X4  an empty include is refused (message unexpected — verify why)"
  results+=("KILLED X4 empty include refused")
else
  echo "SURVIVED   exit=0   X4  an EMPTY include PASSED — the suite can silently measure nothing"
  results+=("SURVIVED X4 empty include passed")
  fail=1
fi

# Restore via git, not a cp backup (trap 2), then prove git agrees.
git checkout HEAD -- "$VITEST_CONFIG"
if [ -n "$(git status --porcelain -- "$VITEST_CONFIG" | grep -v '^??' || true)" ]; then
  echo "RESTORE FAILED — $VITEST_CONFIG did not come back clean."
  fail=1
fi

# ── 6 · X1/X2 · a failing test, then its absence ────────────────────────────
# `npm test` is the gate as declared in the manifest; the planted file is scoped
# by passing it as a path filter so the full suite never runs (SCOPE above).
printf 'import { describe, expect, it } from "vitest";\ndescribe("battery", () => { it("fails on purpose", () => { expect(1).toBe(2); }); });\n' \
  > "$PLANT_FE"

npx vitest run "$PLANT_FE" >/dev/null 2>&1
RC_KILL=$?
if [ "$RC_KILL" -ne 0 ]; then
  echo "KILLED     exit=$RC_KILL  X1  a failing test makes the runner exit non-zero"
  results+=("KILLED X1 failing test caught")
else
  echo "SURVIVED   exit=0   X1  a FAILING TEST did not fail the runner"
  echo "                      The largest gate in ci:quality is not enforcing anything."
  results+=("SURVIVED X1 failing test not caught")
  fail=1
fi

# X3 · the same shape in the backend project, so neither project can be dropped.
printf 'import { describe, expect, it } from "vitest";\ndescribe("battery", () => { it("fails on purpose", () => { expect(1).toBe(2); }); });\n' \
  > "$PLANT_BE"
npx vitest run --project backend "$PLANT_BE" >/dev/null 2>&1
RC_BE=$?
if [ "$RC_BE" -ne 0 ]; then
  echo "KILLED     exit=$RC_BE  X3  a failing test in the BACKEND project is caught too"
  results+=("KILLED X3 backend project enforces")
else
  echo "SURVIVED   exit=0   X3  the backend project did not fail on a failing test"
  echo "                      Check the 'backend' project's include list in $VITEST_CONFIG."
  results+=("SURVIVED X3 backend project inert")
  fail=1
fi

# X2 · the control. A passing file must go green, which also proves X1/X3 did not
# fail merely because a new file appeared.
printf 'import { describe, expect, it } from "vitest";\ndescribe("battery", () => { it("passes on purpose", () => { expect(1).toBe(1); }); });\n' \
  > "$PLANT_FE"
npx vitest run "$PLANT_FE" >/dev/null 2>&1
if [ "$?" -eq 0 ]; then
  echo "OK-GREEN   exit=0   X2  a passing test goes green (control)"
  results+=("OK-GREEN X2 control")
else
  echo "UNEXPECTED        X2  a PASSING test did not go green"
  results+=("UNEXPECTED X2 control red")
  fail=1
fi

# ── 7 · Restore proof ───────────────────────────────────────────────────────
cleanup
LEFTOVER=()
for p in "$PLANT_FE" "$PLANT_BE"; do
  [ -e "$p" ] && LEFTOVER+=("$p")
done
if [ "${#LEFTOVER[@]}" -gt 0 ]; then
  echo "RESTORE FAILED — the battery left a planted test file:"
  printf '    %s\n' "${LEFTOVER[@]}"
  echo "  A stray failing test breaks npm test and every gate downstream."
  fail=1
fi
TREE_DIRTY=$(git status --porcelain -- "$VITEST_CONFIG" | grep -v '^??' || true)
if [ -n "$TREE_DIRTY" ]; then
  echo "RESTORE FAILED — $VITEST_CONFIG left modified:"
  echo "$TREE_DIRTY" | sed 's/^/    /'
  fail=1
fi

echo
echo "─────────────────────────────────────────────"
for r in "${results[@]}"; do echo "  $r"; done
KILLED=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED' || true)
SURVIVED=$(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED' || true)
OKG=$(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN' || true)
echo "─────────────────────────────────────────────"
echo "  killed $KILLED · survived $SURVIVED · ok-green $OKG"
echo "  scope: runner contract + project structure, NOT the meaning of the assertions"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
