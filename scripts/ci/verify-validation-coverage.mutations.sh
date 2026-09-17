#!/usr/bin/env bash
# Mutation battery for scripts/ci/verify-validation-coverage.mjs.
#
# WHY A BATTERY
# -------------
# This gate exists because a documented claim about validation coverage drifted
# for weeks with nothing able to measure it. A gate that cannot fail would
# reproduce exactly that failure one level down: a green line asserting a
# property nobody has seen it detect. So every verdict it can return gets a case.
#
# CASES
#   D1  a write loses its edge validation               -> FAIL
#   D2  a new mutating action with no schema            -> FAIL
#   D3  the baseline lists an action that is now validated (stale)  -> FAIL
#   D4  the baseline lists an action that is not mutating (vanished) -> FAIL
#   V1  the MUTATING set parses empty                   -> exit 2, never pass
#   R1  the documented remedy resolves D3 and the gate goes green again -> OK-GREEN
#
# RESTORE, AND WHY THIS BATTERY DOES NOT USE `git show HEAD:`
# -----------------------------------------------------------
# The other batteries in this directory restore borrowed files from git HEAD.
# That is wrong HERE: the two source files this battery borrows carry the
# UNCOMMITTED work that the gate was written for, so restoring from HEAD would
# silently discard it. Backups are therefore taken from the live files at start
# and compared byte-for-byte at the end, and the final assertion is that
# `git status` for those paths is IDENTICAL to entry — not that it is clean,
# because the tree is legitimately dirty by design.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/verify-validation-coverage.mutations.sh
set -u

GATE=scripts/ci/verify-validation-coverage.mjs
PATCHER=scripts/ci/validation-coverage-patcher.mjs
BAK=.tmp-valcov
TARGETS=(netlify/functions/_lib/handlers.ts netlify/functions/contexts/jobs/service.ts .ci/validation-baseline.json)
fail=0
results=()

RM_RETRY_LIB="$(dirname "${BASH_SOURCE[0]}")/lib/rm-retry.sh"
[ -f "$RM_RETRY_LIB" ] || { echo "FATAL — missing $RM_RETRY_LIB"; exit 2; }
. "$RM_RETRY_LIB"

for f in "$GATE" "$PATCHER"; do
  [ -f "$f" ] || { echo "ABORT: $f is missing — it ships with this battery. Commit it."; exit 1; }
done

flat() { printf '%s' "$1" | tr '/' '_'; }

mkdir -p "$BAK"
for t in "${TARGETS[@]}"; do
  [ -f "$t" ] || { echo "ABORT: target $t is missing."; exit 1; }
  cp "$t" "$BAK/$(flat "$t")"
done

restore_all() {
  for t in "${TARGETS[@]}"; do
    cp "$BAK/$(flat "$t")" "$t"
  done
}

cleanup() {
  restore_all
  rm_retry "$BAK" 2>/dev/null
}
trap cleanup EXIT

# Entry state, so the end can prove nothing moved. Recorded AFTER the backups so
# a poisoned entry is not laundered into "expected".
git status --porcelain -- "${TARGETS[@]}" > "$BAK/gitstatus.entry"

# Asserts the EXACT exit code, not merely "non-zero". The distinction matters
# here more than usual: exit 1 means "the gate judged this a violation" and
# exit 2 means "the gate could not judge at all". Treating them as one signal
# would let a case that only exercises the tooling guard masquerade as coverage
# of a rule — which is what the first draft of D2 did.
check_rc() {
  local label="$1" want="$2" rc
  node "$GATE" >/dev/null 2>&1
  rc=$?
  if [ "$rc" -eq "$want" ]; then
    if [ "$want" -eq 0 ]; then
      echo "OK-GREEN   exit=0   $label"
      results+=("OK-GREEN $label")
    else
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    fi
  else
    if [ "$want" -eq 0 ]; then
      echo "UNEXPECTED exit=$rc  $label   <-- this case should stay green"
      results+=("UNEXPECTED $label")
    else
      echo "SURVIVED   exit=$rc (wanted $want)  $label   <-- HOLE: wrong branch, or no detection"
      results+=("SURVIVED $label")
    fi
    fail=1
  fi
}

# ── RULE: never interpret mutations against an already-red baseline ─────────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on the tree as checked out."
  echo "  This is a real gate failure, not harness residue. Fix it first."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"

apply() {
  node "$PATCHER" "$1" || { echo "ABORT: mutation '$1' did not apply."; exit 1; }
}

# ── D1 · a write loses its edge validation ──────────────────────────────────
apply drop-validation
check_rc "D1  a write with no edge validation is flagged as new debt" 1
restore_all

# ── D2 · a new mutating action with no schema ───────────────────────────────
apply add-unvalidated-mutating
check_rc "D2  an action newly declared mutating, with no schema, is new debt" 1
restore_all

# ── D3 · the baseline is stale in the 'we improved' direction ───────────────
# This is the case that stops the baseline from becoming a lie: coverage that
# improved must be recorded, or the file slowly stops describing reality.
apply baseline-stale
check_rc "D3  a baseline entry that is now validated is flagged" 1

# ── R1 · the documented remedy actually resolves it ─────────────────────────
# D3 is only a fair failure if the message's remedy works. Assert it here
# rather than trusting the message.
if node "$GATE" --update-baseline >/dev/null 2>&1; then
  check_rc "R1  --update-baseline resolves D3 and the gate goes green" 0
else
  echo "UNEXPECTED R1  --update-baseline failed to run"
  results+=("UNEXPECTED R1")
  fail=1
fi
restore_all

# ── D4 · the baseline names something that is not mutating ──────────────────
apply baseline-vanished
check_rc "D4  a baseline entry that is not a mutating action is flagged" 1
restore_all

# ── V1 · the vacuous-pass guard ─────────────────────────────────────────────
# An empty MUTATING set is the shape this class of gate fails silently in:
# "0 actions, 0 unvalidated, PASS". It must refuse with exit 2 instead.
apply empty-mutating
check_rc "V1  an empty MUTATING set is refused, not passed" 2
restore_all

# ── V2 · an action the gate cannot resolve ──────────────────────────────────
# Must be a tooling error, not a pass. A gate that cannot judge an action has
# no business reporting a verdict about it.
apply add-unresolvable-mutating
check_rc "V2  an unresolvable mutating action is a tooling error, not a pass" 2
restore_all

# ── restore proof ───────────────────────────────────────────────────────────
echo
restore_all

for t in "${TARGETS[@]}"; do
  if ! cmp -s "$BAK/$(flat "$t")" "$t"; then
    echo "RESTORE FAILED — $t is not byte-identical to its backup"
    fail=1
  fi
done

git status --porcelain -- "${TARGETS[@]}" > "$BAK/gitstatus.after"
if ! diff -q "$BAK/gitstatus.entry" "$BAK/gitstatus.after" >/dev/null; then
  echo "RESTORE FAILED — git status for the borrowed paths changed during the run:"
  diff "$BAK/gitstatus.entry" "$BAK/gitstatus.after" | sed 's/^/    /'
  fail=1
fi

if ! node "$GATE" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

echo "killed:     $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived:   $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
echo "ok-green:   $(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN')"
echo "unexpected: $(printf '%s\n' "${results[@]}" | grep -c '^UNEXPECTED')"
exit "$fail"
