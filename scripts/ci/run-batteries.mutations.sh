#!/usr/bin/env bash
# Mutation battery for scripts/ci/run-batteries.mjs.
#
# WHY THIS BATTERY IS SHAPED DIFFERENTLY FROM ITS SIBLINGS
# --------------------------------------------------------
# The 17 batteries it supervises each mutate a GATE and assert the gate exits
# non-zero. This one mutates a BATTERY and asserts the RUNNER notices. The
# subject is the supervisor, so the mutation target is a battery, not a checker.
#
# THE HARD PART IS RECURSION, AND IT IS NOT OPTIONAL
#   `verify:batteries` is itself a gate in the manifest, so it carries a
#   `provenBy` battery — this file. If this battery invoked the full runner to
#   test it, the runner would run this battery, which would run the runner, ...
#   Every case below therefore calls the runner with `--only=verify:md`, which
#   constrains it to a single battery that is NOT this one. The recursion is
#   broken by an explicit argument, not by an env var a future edit could forget.
#
# WHY `verify:md` IS THE PROBE
#   The probe must be FAST — this battery runs inside the runner's own runtime
#   budget — and its batteries must be easy to break without touching a
#   checked-in file's meaning. `check-md-tables.mutations.sh` qualifies.
#
# WHAT IS ACTUALLY PROVEN HERE
#   R3  a healthy battery lets the runner pass.                  (the CONTROL)
#   R1  a battery that reports SURVIVED makes the runner exit 1.
#   R2  a battery that exits non-zero for another reason fails too.
#   R4  a `battery:"ci"` gate whose battery file is MISSING is a TOOLING error
#       (exit 2), not a silent skip. "On disk" is not "in the checkout".
#   R5  the runner prints what it did NOT prove, so green is not read as total.
#   R6  --only actually constrains the set. Without this, R1-R3 would be
#       measuring a different program than the one CI runs.
#   R7  a battery that LEAKS a fixture file has it swept AND reported. Measured
#       2026-09-15: without this, one battery's leftover fixtures were analysed
#       by the next battery, producing TEN false failures where the real defect
#       was a handful of uncleaned files.
#
# R3 COMES FIRST ON PURPOSE
#   A runner that always exits non-zero would satisfy R1 and R2 trivially. The
#   control has to run before the mutations, or the two "kills" prove nothing.
#
# Must be run with cwd = repo root:  bash scripts/ci/run-batteries.mutations.sh
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

GATE=scripts/ci/run-batteries.mjs
PROBE=scripts/ci/check-md-tables.mutations.sh
MANIFEST=scripts/ci/review-manifest.json
BAK=.tmp-runbat
fail=0
results=()

# ── Tell every runner this battery starts that it is a NESTED child ─────────
# This battery drives the runner it tests, so each `node "$GATE"` below is a
# child of a mutation run. Without this token a child does not know it is
# nested and will sweep `.tmp-runbat/` — THIS battery's own backup — on its way
# in, deleting the fixtures this battery needs to restore itself:
#
#     + cp check-md-tables.mutations.sh .tmp-runbat/probe.sh
#     + node scripts/ci/run-batteries.mjs --only=verify:md     <- swept it
#     cp: cannot stat '.tmp-runbat/probe.sh': No such file or directory
#
# The damage was five SURVIVED lines, i.e. "the runner cannot detect a bad
# battery", produced by a runner whose only problem was deleting its tester's
# fixtures. Exported here rather than at each call site so a new call cannot
# forget it. When the runner spawns this battery it sets the same token itself;
# both paths must agree, which is why the name is spelled identically.
export BATTERY_RUN_NESTED=1

# ── RULE 1: refuse to interpret mutations against a red baseline ────────────
if ! node "$GATE" --only=verify:md >/dev/null 2>&1; then
  echo "BASELINE RED — the runner fails on an unmutated tree. Aborting: mutations cannot be interpreted."
  node "$GATE" --only=verify:md || true
  exit 1
fi
echo "baseline green (runner + the verify:md battery it supervises)"
echo

mkdir -p "$BAK"
cp "$PROBE" "$BAK/probe.sh"
cp "$MANIFEST" "$BAK/manifest.json"

restore() {
  cp "$BAK/probe.sh" "$PROBE"
  cp "$BAK/manifest.json" "$MANIFEST"
}
trap restore EXIT

# Replace exactly ONE occurrence, or refuse to continue.
mut() {
  MUT_FILE="$1" MUT_OLD="$2" MUT_NEW="$3" node -e '
const fs = require("fs");
const p = process.env.MUT_FILE;
const s = fs.readFileSync(p, "utf8");
const o = process.env.MUT_OLD;
const hits = s.split(o).length - 1;
if (hits !== 1) {
  console.error("MUTATION DID NOT APPLY (hits=" + hits + "): " + JSON.stringify(o));
  process.exit(3);
}
fs.writeFileSync(p, s.replace(o, process.env.MUT_NEW));
'
}

step_mut() {
  local label="$1" file="$2" old="$3" new="$4" want="$5"
  restore
  if ! mut "$file" "$old" "$new"; then
    echo "ABORT: the mutation for '$label' did not apply — results would be meaningless."
    exit 1
  fi
  node "$GATE" --only=verify:md >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -eq "$want" ]; then
    echo "KILLED     exit=$rc (expected $want)  $label"
    results+=("KILLED $label")
  else
    echo "SURVIVED   exit=$rc (expected $want)  $label   <-- HOLE: the runner does not notice"
    results+=("SURVIVED $label")
    fail=1
  fi
  restore
}

# ── R3 · the control, run BEFORE any mutation ───────────────────────────────
node "$GATE" --only=verify:md >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "OK-GREEN   exit=0   R3  a healthy battery lets the runner pass"
  results+=("OK-GREEN R3")
else
  echo "UNEXPECTED exit=$?  R3  the control should stay green   <-- the runner fails on valid input"
  results+=("UNEXPECTED R3")
  fail=1
fi

# ── R1 · a battery that reports SURVIVED ────────────────────────────────────
# Make the probe battery BLIND: invert the condition it judges by, so every
# mutation lands in the `else` branch and prints SURVIVED, while the battery
# still exits 0. That is precisely the state the runner exists to catch —
# a battery that runs, looks alive, and reports nothing.
#
# THE FIRST FIXTURE FOR THIS CASE WAS WRONG, AND THE FAILURE IS INSTRUCTIVE.
# It deleted the `fail=1` assignment from inside `run()`, on the theory that a
# battery which no longer records failure would exit 0. Measured: the probe
# still reported `killed: 5 / survived: 0` and exited 0 on every mutation, so the
# runner stayed green and this case reported SURVIVED. The bug was in the
# FIXTURE, not the runner — the kill path is driven by `$rc`, and removing
# `fail=1` never produced a SURVIVED line at all, so the battery remained
# honest. A mutation that does not create the defect it claims to create is not
# a hole in the gate; it is a hole in the battery. The fixture below was verified
# BY HAND to produce `survived: 5` before being wired in here.
step_mut "R1  a battery that reports SURVIVED fails the run" \
  "$PROBE" \
  '  if [ "$rc" -ne 0 ]; then
    echo "KILLED   exit=$rc  $desc"
    results+=("KILLED   $desc")
  else' \
  '  if [ "$rc" -eq 999 ]; then
    echo "KILLED   exit=$rc  $desc"
    results+=("KILLED   $desc")
  else' \
  1

# ── R2 · the battery dies without reporting a specific hole ─────────────────
# A crashed battery is not a passed battery. Invert the final exit so the
# battery fails for a reason that produces no SURVIVED line at all.
step_mut "R2  a battery that exits non-zero (no SURVIVED line) fails the run" \
  "$PROBE" \
  'exit "$fail"' \
  'exit 7' \
  1

# ── R4 · a battery classified "ci" whose file is missing ────────────────────
# The runner must refuse with a TOOLING error (exit 2), not skip the gate and
# exit 0. This is the "present on the author's disk, absent from the checkout"
# trap, one level up from C2b.
step_mut "R4  a missing battery is a tooling error, not a silent skip" \
  "$MANIFEST" \
  '"provenBy": "scripts/ci/check-md-tables.mutations.sh"' \
  '"provenBy": "scripts/ci/does-not-exist.mutations.sh"' \
  2

# ── R5 / R6 / R7 · behavioural claims read from the runner's own output ─────
restore
OUT=$(node "$GATE" --only=verify:md 2>&1)

if printf '%s' "$OUT" | grep -q 'NOT proven by this run'; then
  echo "KILLED     output names the unproven remainder  R5"
  results+=("KILLED R5")
else
  echo "SURVIVED   output omits the unproven remainder   <-- a green run reads as total proof"
  results+=("SURVIVED R5")
  fail=1
fi

if printf '%s' "$OUT" | grep -q 'batteries run : 1'; then
  echo "KILLED     --only constrains the set to one  R6"
  results+=("KILLED R6")
else
  echo "SURVIVED   --only did not constrain the set   <-- R1-R3 measured a different program"
  results+=("SURVIVED R6")
  fail=1
fi

# R7 · the leak sweep. This is the behaviour that turned ten FALSE failures into
# one real finding on 2026-09-15, so it needs its own case: a battery that leaves
# a fixture file behind must have it swept, and the leak must be reported.
#
# ── WHY THE FIRST VERSION OF THIS CASE REPORTED SURVIVED (a real hole, now closed)
# It anchored the leak on the probe's toplevel `fail=0` (line 50). That line is
# executed when the probe STARTS, i.e. BEFORE the first `run()` call and before
# the gate is ever invoked, so the leaked file already existed when the runner
# took its `untrackedBefore` snapshot for that battery. `sweepLeaks()` removes
# only files that appeared DURING the battery, the file therefore counted as
# pre-existing, it was never reported, and this case saw SURVIVED.
#
# The fixture was WRONG, not the runner: it did not create the defect it claimed
# to create — a leak DURING a battery's run. That is the same class of error as
# R1's first fixture, and it is worth stating plainly because both looked like
# findings ("the runner cannot sweep a leak") when neither was.
#
# ── WHY THE SECOND VERSION OF THIS CASE ALSO REPORTED SURVIVED ───────────────
# It anchored the leak on `  results+=("SURVIVED $desc")`, the last statement of
# the probe's SURVIVE branch. That anchor is unique and the fixture applied
# cleanly — and the leak was STILL never created, because the probe's every
# mutation is KILLED, so the `if` branch is taken and the whole `else` block,
# leak included, never executes. A fixture that only runs on the branch the
# suite never takes is a fixture that does not run.
#
# Both failed anchors share one root cause, and it is the lesson worth keeping:
# an anchor must be a statement that executes REGARDLESS of which branch holds.
# Using a branch body silently couples the fixture to that branch's condition.
#
# `  local rc=$?` is such a statement: it is the first thing after the gate
# invocation, it runs on every `run()` call, and it runs after the gate has
# already executed — so the file is created strictly inside the window the
# runner diffs (between its `untrackedBefore` snapshot and its `sweepLeaks()`).
# The probe has exactly one occurrence of it, asserted by `mut()`.
#
# ── WHY THE THIRD VERSION OF THIS CASE STILL REPORTED SURVIVED ───────────────
# It passed when run by hand and FAILED as a battery inside the full run. The
# difference is the nesting token, and it took a full 18-battery run to expose:
#
#   * run by hand, this script exports BATTERY_RUN_NESTED=1 for the children it
#     starts, and the child runner swept the leak exactly as asserted;
#   * as a battery inside the full run, the PARENT runner spawns this script with
#     BATTERY_RUN_NESTED=1, so the child runner the case starts is NESTED — and a
#     nested run is a pure observer that deliberately does NOT sweep, because the
#     parent owns every piece of tree state (see the ownership note in
#     `run-batteries.mjs`). The leak therefore survived, correctly.
#
# So the assertion was wrong, not the runner. R7 was testing the sweep by asking
# the one process that is forbidden to sweep. A case that passes standalone and
# fails nested is not measuring the runner — it is measuring its own environment.
#
# ── WHY REMOVING THE TOKEN WAS STILL NOT ENOUGH (the fourth attempt) ─────────
# With `env -u BATTERY_RUN_NESTED` the child became top-level and DID sweep — and
# the case then reported "swept but never reported". That is a real interaction
# between the two mechanisms, and it is worth understanding rather than patching:
#
#   the runner now sweeps recognised fixtures BEFORE each battery (the fix for
#   the 11-gate cascade) as well as after. On a `--only=verify:md` run the probe
#   is the FIRST battery, so the pre-sweep runs, removes the leak the probe had
#   just written, and the post-battery `sweepLeaks()` — which reports — finds
#   nothing new to attribute. The file IS swept; it is simply swept by the
#   pre-sweep, which is not the code path that reports.
#
# So "swept" and "attributed" are now two different code paths, and one case
# cannot cleanly exercise both by leaking a file. The case is therefore split,
# each half asserting one thing that can only be true one way.
#
# ── R7a · the POST-battery sweep must attribute a leak it saw appear ─────────
# Leak DURING the battery, on the LAST battery of a two-battery selection, so the
# pre-sweep for the next battery cannot mask it. `verify:md` runs second here, so
# the probe leaks while `verify:md`'s own post-sweep is the code that must see it.
#
# ── R7b · the PRE-battery sweep must clear an inherited fixture ──────────────
# This is the §36 fix, and it has its own detectable signature: the runner prints
# `swept N pre-existing fixture(s)`. Plant the file BEFORE the child starts, so
# only the pre-sweep can be responsible, and assert both the note and the removal.
#
# The path IS a recognised fixture shape on purpose. `sweepFixtures()` matches a
# basename SHAPE (`zz-battery|__iomut|__lintmutdir|__lintmut|__tsmut`) rather
# than "any untracked file", precisely so it can never delete a developer's real
# work — which means a case asserting the sweep must plant something that
# actually qualifies. It also sits OUTSIDE the source tree the verify:md gate
# scans (docs/ and three root markdown files), so the leak cannot disturb the
# gate's own verdict: the case isolates the SWEEP, not the gate.
restore
LEAKPATH=zz-battery-leak-probe.tmp
rm_retry "$LEAKPATH"

# ── R7b · an inherited fixture is swept before a battery runs ───────────────
# ── THE NAME MATTERS, AND THE FIRST VERSION OF THIS CASE GOT IT WRONG ───────
# It planted `.zz-leak-probe.tmp` and asserted the pre-sweep would remove it. It
# never would: `sweepFixtures()` removes only UNTRACKED paths whose BASENAME
# matches `FIXTURE_BASENAME`
#
#     /^(zz-battery|__iomut|__lintmutdir|__lintmut|__tsmut)(?=[-.]|$)/
#
# and `.zz-leak-probe.tmp` matches nothing in that shape. Verified directly:
#
#     .zz-leak-probe.tmp -> false      zz-battery-x.ts -> true
#
# So the case was asserting a sweep that was never designed to happen for that
# name, and its SURVIVED verdict said nothing about the runner. The sweep is
# deliberately SHAPE-based rather than "any untracked file" — it must never
# delete a developer's real work — so the case has to plant something that IS a
# fixture. `zz-battery-` is the prefix every fixture in this suite uses.
#
# The removal must also be REPORTED. A silent sweep would hide a real battery
# defect behind a tidy tree, so both facts are asserted.
#
# The note asserted is the RUN-START sweep, not the per-battery one. The runner
# has two, with two different messages, and picking the wrong one is how this
# case failed a third time:
#
#   line ~673  run start   "swept N fixture file(s) left by an earlier run"
#   line ~739  per battery "swept N pre-existing fixture(s) before <gate>"
#
# A file planted before the child even starts is caught by the first, because it
# IS debris from an earlier run by the time the child looks. Asserting the second
# message here would fail forever.
printf "x" > "$LEAKPATH"
LEAKOUT=.tmp-runbat/leakout.txt
env -u BATTERY_RUN_NESTED node "$GATE" --only=verify:md >"$LEAKOUT" 2>&1
if [ -f "$LEAKPATH" ]; then
  echo "SURVIVED   an inherited fixture was NOT swept before the battery   <-- the next battery inherits a dirty tree"
  results+=("SURVIVED R7b")
  fail=1
  rm_retry "$LEAKPATH"
elif grep -q 'left by an earlier run' "$LEAKOUT"; then
  echo "KILLED     inherited fixture swept before the battery, and reported  R7b"
  results+=("KILLED R7b")
else
  echo "SURVIVED   the inherited fixture vanished but the sweep was never reported  <-- a silent sweep hides a battery defect"
  results+=("SURVIVED R7b")
  fail=1
fi

# ── R7a · a leak produced DURING a battery is attributed to it ──────────────
# ── WHY THE FIRST TWO ATTEMPTS AT THIS CASE COULD NEVER WORK ────────────────
# Attempt 1 selected `--only=verify:batteries,verify:md`. The leak is written by
# the mutated PROBE (`check-md-tables.mutations.sh` -> `verify:md`), which that
# selection EXCLUDED, so the probe never ran and never leaked.
#
# Attempt 2 selected the right batteries and mutated the probe in place — and the
# child refused with exit 2:
#
#     TOOLING ERROR: files under the gate radius have tracked edits:
#       - scripts/ci/check-md-tables.mutations.sh
#
# That refusal is CORRECT and is the guard this suite was built around: a battery
# that starts on a dirty gate radius cannot produce interpretable verdicts.
#
# Attempt 3 runs the child NESTED — WITH the token, not without. A nested run is
# a pure observer, so it skips the radius pre-flight (its parent owns tree state)
# while still running `sweepLeaks()` unconditionally after every battery, which
# is the code path under test here. The token is therefore what makes this case
# reachable at all, and it is the opposite of what R7b needs:
#
#     R7b needs a TOP-LEVEL child   -> the pre-sweep must run
#     R7a needs a NESTED child      -> the post-battery sweep must run, and the
#                                      radius guard must not refuse the fixture
#
# Note this means R7a's verdict is about `sweepLeaks()`, and R7b's is about
# `sweepFixtures()`. They were never the same assertion.
restore
rm_retry "$LEAKPATH"
if ! mut "$PROBE" '  local rc=$?' '  local rc=$?
  printf "x" > '"$LEAKPATH"' 2>/dev/null || true'; then
  echo "ABORT: the R7 leak fixture did not apply — results would be meaningless."
  exit 1
fi
# NESTED on purpose — see above. `verify:md` is the probe's own gate and runs
# first in the manifest's hermetic order, so the leak appears during it;
# `verify:classes` follows so the probe's post-battery sweep owns the report.
BATTERY_RUN_NESTED=1 node "$GATE" --only=verify:md,verify:classes >"$LEAKOUT" 2>&1
if [ -f "$LEAKPATH" ]; then
  echo "SURVIVED   a leaked fixture file was NOT swept   <-- the next battery inherits a dirty tree"
  results+=("SURVIVED R7a")
  fail=1
  rm_retry "$LEAKPATH"
elif grep -q 'LEAKED' "$LEAKOUT"; then
  echo "KILLED     leaked fixture swept and attributed  R7a"
  results+=("KILLED R7a")
else
  echo "SURVIVED   the leak was swept but never reported  <-- a silent sweep hides a battery defect"
  results+=("SURVIVED R7a")
  fail=1
fi
restore
rm_retry "$LEAKPATH"

# ── R8 · the shared delete helper must be able to FAIL ──────────────────────
# ── WHY THE HARNESS NEEDS ITS OWN PROOF ─────────────────────────────────────
# `scripts/ci/lib/rm-retry.sh` is now sourced by all 24 batteries, and it is the
# reason one transient unlink failure no longer becomes a leaked fixture and a
# dozen false failures. That makes it load-bearing -- and a load-bearing helper
# that "always succeeds" is indistinguishable from a helper that works. That is
# the exact decay this suite exists to prevent, one level down: the batteries
# prove their gates can fail, and nothing proved the retry can.
#
# A retry cannot be provoked with a REAL `rm`. Forcing an unlink to fail on
# Windows turned out to be harder than the failure itself -- a path whose parent
# is a file, an empty name, and a 300-character name all returned 0 under
# `rm -f`. So the failure is INJECTED, which is also what makes it deterministic:
# a shell function shadows the real `rm` for the duration of the call and fails
# the first N attempts. Both branches are then asserted:
#
#   R8a  fail once    -> rm_retry must SUCCEED on a later attempt
#   R8b  fail always  -> rm_retry must GIVE UP, return non-zero, and say so
#
# R8b is the one that matters. Without it a `rm_retry` that quietly dropped the
# retry loop, or that returned 0 unconditionally, would pass R8a and every
# battery in this file -- and the harness would be back to reporting an OS
# hiccup as a defect in a gate.
R8LOG=.tmp-r8-retry.log
R8VICTIM=.tmp-r8-victim.txt
rm_retry "$R8LOG" "$R8VICTIM"

r8_retry_with_failures() {
  local fails="$1" target="$2" calls=0 rc=0
  # Global on purpose: `rm_retry` resolves `rm` through this shell, so the shim
  # is what it calls, and `command rm` is what escapes the shim.
  rm() {
    calls=$((calls + 1))
    if [ "$calls" -le "$fails" ]; then
      return 1
    fi
    command rm "$@"
  }
  rm_retry "$target"
  rc=$?
  unset -f rm
  return "$rc"
}

# R8a · a transient failure must be RETRIED, not reported.
touch "$R8VICTIM"
RM_RETRY_MAX=5 RM_RETRY_SLEEP=0 RM_RETRY_LOG="$R8LOG" r8_retry_with_failures 1 "$R8VICTIM"
rc=$?
if [ "$rc" -eq 0 ] && [ ! -e "$R8VICTIM" ] && grep -q 'OK on attempt 2' "$R8LOG"; then
  echo "KILLED     a transient delete failure is retried  R8a"
  results+=("KILLED R8a")
else
  echo "SURVIVED   a transient delete failure was NOT retried (rc=$rc)  <-- one OS hiccup becomes a leaked fixture"
  results+=("SURVIVED R8a")
  fail=1
fi
rm_retry "$R8VICTIM"

# R8b · a delete that never succeeds must still FAIL, loudly, with the reason.
touch "$R8VICTIM"
RM_RETRY_MAX=3 RM_RETRY_SLEEP=0 RM_RETRY_LOG="$R8LOG" r8_retry_with_failures 99 "$R8VICTIM"
rc=$?
if [ "$rc" -ne 0 ] && [ -e "$R8VICTIM" ] && grep -q 'GIVING UP' "$R8LOG"; then
  echo "KILLED     a delete that never succeeds still fails  R8b"
  results+=("KILLED R8b")
else
  echo "SURVIVED   rm_retry reported success for a path it could not remove  <-- the helper cannot fail"
  results+=("SURVIVED R8b")
  fail=1
fi
rm_retry "$R8VICTIM" "$R8LOG"

# ── RULE 3: byte-identical restore, and green again ────────────────────────
echo
if ! diff -q "$BAK/probe.sh" "$PROBE" >/dev/null; then
  echo "RESTORE FAILED — $PROBE is not byte-identical to its backup"
  fail=1
fi
if ! diff -q "$BAK/manifest.json" "$MANIFEST" >/dev/null; then
  echo "RESTORE FAILED — $MANIFEST is not byte-identical to its backup"
  fail=1
fi

if ! node "$GATE" --only=verify:md >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
else
  echo "restore: byte-identical, baseline green again"
fi

echo
echo "killed:     $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived:   $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
echo "ok-green:   $(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN')"
echo "unexpected: $(printf '%s\n' "${results[@]}" | grep -c '^UNEXPECTED')"
trap - EXIT
rm_retry "$BAK"
exit "$fail"
