#!/usr/bin/env bash
# Fast battery for the two-defect fix in e2e/test-headings.mjs (commit 7a11954).
#
# These mutations touch ONLY the gate file, so no rebuild is needed: they run
# against an already-serving build whose URL is passed in via BASE_URL.
#
# Usage: BASE_URL=http://127.0.0.1:4321 bash scripts/ci/headings-fast-battery.sh
#
# WHY THE OBVIOUS MUTATIONS ARE NOT HERE. The first draft of this battery mutated
# only GATE_MARKERS, on the assumption that the marker heuristic was the
# load-bearing check. Measured: BOTH SURVIVED, and neither was a hole.
#
#   * emptying GATE_MARKERS can only REMOVE red-making power — nothing can ever
#     throw again, so "survived" is guaranteed and says nothing.
#   * re-adding 'Login Pelamar' makes the gate read the landing page as a gate
#     ONLY IF the inspection actually lands on the landing page. After the fix
#     it does not: `session` carries the real role, so /admin loads its own body
#     (no marker present). The marker is no longer what keeps that route honest.
#
# The defect had TWO halves and the original red required BOTH: the wrong role
# (which caused the wrong-page read) *and* the wrong marker (which made the
# wrong-page read fail instead of passing silently). Mutating either half alone
# is now undetectable — a correct and expected consequence of fixing both. So
# M-E and M-F below mutate the halves that the fix actually holds together.
set -u

GUARD=e2e/test-headings.mjs

# `dirname "$0"` yields a Git-Bash path (/f/astro/...). Passing that to node
# makes it resolve against the current DRIVE, producing F:\f\astro\... and a
# spurious ENOENT. `cygpath -m` converts to a Windows path node understands.
HERE="$(cd "$(dirname "$0")" && pwd)"
HERE_WIN="$(cygpath -m "$HERE" 2>/dev/null || echo "$HERE")"
PAIRS_E="$HERE_WIN/headings-pairs-E.json"
PAIRS_F="$HERE_WIN/headings-pairs-F.json"

# The backup lives INSIDE the repo. `mktemp -t` puts it under C:\Users\...,
# which the sandbox file shim rewrites into a bogus F:\astro\C:\Users\... path.
# It is also taken from the guard itself, never from a stale /tmp copy: a killed
# battery once left the guard mutated and the fix was silently lost.
BAK=".tmp-headings-guard.bak"
cp "$GUARD" "$BAK"
BASE="${BASE_URL:?BASE_URL is required}"

trap 'rm -f "$BAK"' EXIT

fail=0
results=()

restore() { cp "$BAK" "$GUARD"; }

# Apply a pair list from a FILE (JSON with apostrophes + newlines cannot be
# written inline — measured: "Bad escaped character in JSON").
apply() {
  MUT_FILE="$1" MUT_PAIRS_FILE="$2" node -e '
const fs = require("fs");
const p = process.env.MUT_FILE;
const pairs = JSON.parse(fs.readFileSync(process.env.MUT_PAIRS_FILE, "utf8"));
let s = fs.readFileSync(p, "utf8");
for (const [oldStr, newStr] of pairs) {
  const hits = s.split(oldStr).length - 1;
  if (hits !== 1) {
    console.error("MUTATION DID NOT APPLY (hits=" + hits + "): " + JSON.stringify(oldStr.slice(0, 70)));
    process.exit(3);
  }
  s = s.split(oldStr).join(newStr);
}
fs.writeFileSync(p, s);
'
}

# expect: "kill" = must fail, "survive" = surviving is the CORRECT outcome.
#
# A mutation may legitimately be expected to survive when it removes only HALF
# of a two-part defect. Such a mutation is still worth running: it documents
# which half is load-bearing, and it would be a real finding if it started
# killing (the fix's structure changed).
step() {
  local label="$1" pairs="$2" expect="$3"
  restore
  if ! apply "$GUARD" "$pairs"; then
    echo "ABORT: mutation for '$label' did not apply."; exit 1
  fi
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  local rc=$?
  if [ "$expect" = "kill" ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    else
      echo "SURVIVED   exit=0   $label   <-- HOLE: this defect is not caught"
      results+=("SURVIVED $label")
      fail=1
    fi
  else
    if [ "$rc" -eq 0 ]; then
      echo "SURVIVED*  exit=0   $label   (expected: half of a two-part defect)"
      results+=("SURVIVED* $label")
    else
      echo "KILLED     exit=$rc  $label   (unexpected — this half is not inert)"
      results+=("KILLED $label")
      fail=1
    fi
  fi
  restore
}

# Control: the unmutated gate must be green, or a KILLED below means nothing.
BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "BASELINE RED — aborting; mutations would be meaningless"
  exit 1
fi
echo "baseline: green"

step "M-E role reverted to the boolean 'true' (correct markers kept)" "$PAIRS_E" survive
step "M-F both defects restored: role 'true' AND 'Login Pelamar' as a marker" "$PAIRS_F" kill

restore
if ! diff -q "$BAK" "$GUARD" >/dev/null; then
  echo "RESTORE FAILED — $GUARD is not byte-identical to its backup"; fail=1
fi
BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1 \
  && echo "OK-GREEN    the restored gate passes again (control)" \
  || { echo "NOT GREEN AFTER RESTORE"; fail=1; }

echo
echo "killed:      $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived*:   $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED\*')   (expected — half of a two-part defect)"
echo "holes:       $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED ')"
exit "$fail"
