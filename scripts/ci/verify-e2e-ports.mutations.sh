#!/usr/bin/env bash
# verify-e2e-ports.mutations.sh — prove `scripts/ci/verify-e2e-ports.mjs` can fail.
#
# WHAT THIS GATE PROTECTS
#   A probe whose stated address and actual address disagree. The measured
#   instance (2026-09-18): `e2e/measure-riwayat-card.mjs` told the reader
#   `BASE_URL=http://localhost:4322` while the code defaulted to 4321, so copying
#   the comment ran the browser against a port nothing listens on and the failure
#   read as a broken page.
#
# WHY "ALL SURVIVED" IMPLICATES THE HARNESS, NOT THE GATE
#   Every case here is a one-line text edit to an `e2e/*.mjs` file, and the gate
#   reads those files directly. If a mutation survives, the most likely causes in
#   order are: (1) the anchor did not match, so nothing was written and the gate
#   correctly stayed green — rule 7 below makes that an abort rather than a
#   `SURVIVED`; (2) the backup/restore lost the file, so the mutation was measured
#   on the wrong content; (3) the regex does not express the rule it claims to.
#   Only (3) is a gate defect.
#
# RULES APPLIED (from the prove-a-gate-can-fail skill)
#   1  baseline must be green before any mutation is interpreted, and green again
#      after the restore — checked here, not assumed
#   3  byte-identical restore, asserted with cmp for every touched file
#   4  one mutation at a time, restored in between
#   5  relative paths, run from the repo root
#   7  each mutation asserts EXACTLY ONE match, so a silent no-op aborts loudly
#
# The backup lives in the OS temp dir, NOT the working tree: a refused delete at
# the end leaves residue behind if it lives in the repo, and that residue is then
# read by the next run as an unaccounted file.

set -uo pipefail

GATE=scripts/ci/verify-e2e-ports.mjs
TARGET=e2e/measure-riwayat-card.mjs
TARGET2=e2e/test-public.mjs
fail=0
declare -a results=()

# Resolve a native temp path for node, and prove node can write it. Under Git
# Bash `mktemp -d` returns a POSIX shape that the Windows node binary reads as
# `F:\tmp\...` — measured, and it presents as a gate failure rather than a
# harness one.
TMPBASE="$(cygpath -m "$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}")" 2>/dev/null || true)"
[ -n "$TMPBASE" ] || TMPBASE="${TEMP:-${TMPDIR:-/tmp}}"
TMPBASE="${TMPBASE%/}"
BAK="$TMPBASE/e2e-ports-bak"
if ! node -e 'const fs=require("fs");fs.mkdirSync(process.argv[1],{recursive:true});fs.writeFileSync(process.argv[1]+"/.p","x");fs.unlinkSync(process.argv[1]+"/.p")' "$BAK" 2>/dev/null; then
  echo "HARNESS ERROR — cannot use $BAK as a backup directory."
  echo "                Without a backup the restore proof cannot be made, and in"
  echo "                this battery that failure has been observed to present as a"
  echo "                gate finding rather than a harness one."
  exit 2
fi

run_gate() { node "$GATE" "$@" >"$TMPBASE/gate.out" 2>&1; }

# RULE 1 — the baseline must be green, or no verdict below means anything.
if ! run_gate; then
  echo "BASELINE RED — aborting before interpreting any mutation."
  sed 's/^/    | /' "$TMPBASE/gate.out"
  exit 1
fi
echo "baseline green: $GATE"

cp "$TARGET" "$BAK/measure-riwayat-card.mjs"
cp "$TARGET2" "$BAK/test-public.mjs"

restore() { cp "$BAK/measure-riwayat-card.mjs" "$TARGET"; cp "$BAK/test-public.mjs" "$TARGET2"; }

# RULE 7 — assert exactly one match; a mutation that misses must ABORT, not pass
# quietly as a SURVIVED (which would look like a hole in the gate).
mut() { # mut <file> <old> <new>
  MUT_FILE="$1" MUT_OLD="$2" MUT_NEW="$3" node -e '
    const fs = require("fs");
    const p = process.env.MUT_FILE;
    const s = fs.readFileSync(p, "utf8");
    const parts = s.split(process.env.MUT_OLD);
    if (parts.length !== 2) {
      console.error("MUTATION DID NOT APPLY (matches=" + (parts.length - 1) + ")");
      console.error("  file=" + p + " anchor=" + JSON.stringify(process.env.MUT_OLD).slice(0, 80));
      process.exit(2);
    }
    fs.writeFileSync(p, parts.join(process.env.MUT_NEW));
  ' || return 2
}

check() { # check <label> <expect-nonzero:0|1>
  local label="$1" want_fail="$2" rc
  run_gate
  rc=$?
  if [ "$want_fail" = "1" ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED   exit=$rc  $label"; results+=("KILLED $label")
    else
      echo "SURVIVED exit=0   $label   <-- HOLE"
      sed 's/^/    | /' "$TMPBASE/gate.out" | head -6
      results+=("SURVIVED $label"); fail=1
    fi
  else
    # OK-GREEN: green is the CORRECT answer here (a deliberate control).
    # Without these, a gate that simply always fails would pass every other case.
    if [ "$rc" -eq 0 ]; then
      echo "OK-GREEN exit=0   $label"; results+=("OK-GREEN $label")
    else
      echo "UNEXPECTED exit=$rc  $label   (expected green)"
      sed 's/^/    | /' "$TMPBASE/gate.out" | head -6
      results+=("UNEXPECTED $label"); fail=1
    fi
  fi
}

echo
echo "── mutations ──"

# A. The exact measured defect: a comment naming a different port than the code.
mut "$TARGET" 'BASE_URL=http://localhost:4321 node e2e/measure-riwayat-card.mjs' \
              'BASE_URL=http://localhost:4322 node e2e/measure-riwayat-card.mjs' \
  || { echo "could not apply mutation A — aborting"; exit 2; }
check "A  comment port disagrees with the code default (the 4322 defect)" 1
restore

# B. The code default itself moves to a port nothing binds.
mut "$TARGET" "const BASE = process.env.BASE_URL || 'http://localhost:4321';" \
              "const BASE = process.env.BASE_URL || 'http://localhost:4399';" \
  || { echo "could not apply mutation B — aborting"; exit 2; }
check "B  code default moved to an unbound port" 1
restore

# C. The default is removed entirely, so the probe can only run from a hand-typed
#    URL — the precondition that let the wrong port survive review.
mut "$TARGET2" "const BASE = process.env.BASE_URL || 'http://localhost:4321';" \
               "const BASE = process.env.BASE_URL;" \
  || { echo "could not apply mutation C — aborting"; exit 2; }
check "C  no fallback default at all" 1
restore

# D. CONTROL (OK-GREEN) — moving the default to a port the repo DOES bind is a
#    legitimate change and must stay green. This is the arm that stops case B from
#    being satisfied by "the gate rejects any edit to this line".
mut "$TARGET" "const BASE = process.env.BASE_URL || 'http://localhost:4321';" \
              "const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';" \
  || { echo "could not apply mutation D — aborting"; exit 2; }
check "D  control: default on a bound port, different host, stays green" 0
restore

# E. CONTROL (OK-GREEN) — a comment that AGREES with the code is fine.
mut "$TARGET" 'BASE_URL=http://localhost:4321 node e2e/measure-riwayat-card.mjs' \
              'BASE_URL=http://127.0.0.1:4321 node e2e/measure-riwayat-card.mjs' \
  || { echo "could not apply mutation E — aborting"; exit 2; }
check "E  control: comment matches the default on a different host, stays green" 0
restore

echo
echo "── restore proof ──"
if ! cmp -s "$BAK/measure-riwayat-card.mjs" "$TARGET"; then
  echo "RESTORE FAILED — $TARGET does not match its pre-run content:"
  git diff --stat -- "$TARGET" | sed 's/^/    /'
  fail=1
fi
if ! cmp -s "$BAK/test-public.mjs" "$TARGET2"; then
  echo "RESTORE FAILED — $TARGET2 does not match its pre-run content:"
  git diff --stat -- "$TARGET2" | sed 's/^/    /'
  fail=1
fi

# Green again after restore is part of the evidence, not a courtesy.
if run_gate; then
  echo "green again after restore: yes"
else
  echo "NOT GREEN AFTER RESTORE — the verdicts above were measured on a dirty tree:"
  sed 's/^/    | /' "$TMPBASE/gate.out" | head -8
  fail=1
fi

echo
echo "─────────────────────────────────────────────"
for r in "${results[@]}"; do echo "  $r"; done
KILLED=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED' || true)
SURVIVED=$(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED' || true)
OKG=$(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN' || true)
UNEXP=$(printf '%s\n' "${results[@]}" | grep -c '^UNEXPECTED' || true)
echo "─────────────────────────────────────────────"
echo "  killed $KILLED · survived $SURVIVED · ok-green $OKG · unexpected $UNEXP"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see SURVIVED/UNEXPECTED above"
exit 1
