#!/usr/bin/env bash
# Mutation battery for scripts/ci/verify-function-entries.mjs (npm run verify:entries).
#
# WHY THIS GATE, AND WHY FIRST
# ---------------------------
# Of the 17 blocking gates that had never been observed failing, this one has the
# highest blast radius. Its own header records the damage: a single root `.test.ts`
# importing `vitest` killed **three deploys**, and one stray `surfaces/index.ts`
# kept Lambda compatibility mode — and the 4 KB environment ceiling — alive for the
# entire site even after all 21 real entries had migrated. Both were invisible to
# `verify:io`, `bundle:size`, `verify:binding` and 960 green tests.
#
# A gate that guards a deploy-killer and has never been seen to fail is a
# hypothesis about the one thing that already broke production twice.
#
# WHAT EACH MUTATION RE-INTRODUCES
# --------------------------------
#   S1  a .test.* at the functions root              -> check 1 (and check 3)
#   S2  a root entry importing a devDependency       -> check 2
#   S3  <dir>/<dir>.ts in a direct subdirectory      -> check 3b (Lambda compat)
#   S4  a root entry with no handler export          -> check 4
#
# S2 and S4 deliberately include a valid handler / omit the test file so that only
# the check under test can fire. Without that, a kill would be indistinguishable
# from "some other check caught it", which is how a battery reports coverage it
# does not have.
#
# All mutations are NEW files under netlify/functions/, never edits to existing
# ones, so the trap can remove them and the tree is verifiably clean afterwards.
#
# OUTCOMES THAT ARE NOT FAILURES
# ------------------------------
# **E1 — a legitimate new entry point must be accepted.** A root file that exports
# a handler is exactly what this directory is for. If E1 ever fails, the gate has
# started rejecting valid growth and every future function will fight it.
#
# Must be run with cwd = repo root:  bash scripts/ci/verify-function-entries.mutations.sh
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

GATE=scripts/ci/verify-function-entries.mjs
FN=netlify/functions
MUTDIR="$FN/__lintmutdir"
BAK=.tmp-entriesmut
fail=0
results=()

F_TEST="$FN/__lintmut.test.ts"
F_DEVDEP="$FN/__lintmut-devdep.ts"
F_SUBDIR="$MUTDIR/__lintmutdir.ts"
F_NOHANDLER="$FN/__lintmut-nohandler.ts"
F_VALID="$FN/__lintmut-valid.ts"

ALL_MUTANTS=("$F_TEST" "$F_DEVDEP" "$F_SUBDIR" "$F_NOHANDLER" "$F_VALID")

cleanup() {
  rm_retry "${ALL_MUTANTS[@]}"
  rm_retry "$MUTDIR"
  rm_retry "$BAK"
}

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

check() {
  local label="$1" expect="$2" rc
  node "$GATE" >/dev/null 2>&1
  rc=$?
  if [ "$expect" = kill ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    else
      echo "SURVIVED   exit=0   $label   <-- HOLE: this deploy-killer class is not covered"
      results+=("SURVIVED $label")
      fail=1
    fi
  else
    if [ "$rc" -eq 0 ]; then
      echo "OK-GREEN   exit=0   $label   ($expect: green is the correct answer)"
      results+=("OK-GREEN $label")
    else
      echo "UNEXPECTED exit=$rc  $label   <-- this $expect case should stay green"
      results+=("UNEXPECTED $label")
      fail=1
    fi
  fi
}

trap cleanup EXIT

# ── RULE 0: start from a known-clean tree ───────────────────────────────────
# This battery creates NEW files in a live deploy directory, so an interrupted
# run — a Ctrl-C, a killed shell, or the same command being executed twice in one
# session — leaves mutants behind. They then make the next run's BASELINE red,
# which is the right call but a confusing one: the gate looks broken when it is
# the harness that is dirty. Remove them before measuring anything.
#
# This is not hypothetical. The first run of this file reported BASELINE RED with
# four mutants on disk simultaneously, which no single run of the script below can
# produce — proof that a previous execution had been interrupted mid-flight.
cleanup
mkdir -p "$BAK"
cp "$GATE" "$BAK/gate"

# ── RULE 1: never interpret mutations against an already-red baseline ────────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on an unmutated tree. Aborting: mutations cannot be interpreted."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"

# ── S1 · a test file at the functions root ──────────────────────────────────
printf '// a test file at the functions root — the mistake that killed three deploys\n' > "$F_TEST"
check "S1  .test.ts at the functions root" kill
rm_retry "$F_TEST"

# ── S2 · a root entry importing a devDependency ─────────────────────────────
# Carries a valid handler on purpose, so check 4 cannot be the reason it fails.
printf "import { describe } from 'vitest';\n\nexport default async function handler() {\n  return new Response('ok');\n}\n" > "$F_DEVDEP"
check "S2  root entry imports a devDependency" kill
rm_retry "$F_DEVDEP"

# ── S3 · a direct subdirectory deploying as a function ──────────────────────
# <dir>/<dir>.ts is the exact shape of the old surfaces/index.ts, which kept
# Lambda compatibility mode (4 KB env ceiling) alive for the whole site.
mkdir -p "$MUTDIR"
printf "export default async function handler() {\n  return new Response('ok');\n}\n" > "$F_SUBDIR"
check "S3  <dir>/<dir>.ts deploys as a Lambda-compat function" kill
rm_retry "$F_SUBDIR"
rm_retry "$MUTDIR"

# ── S4 · a root entry with no handler export ────────────────────────────────
printf '// no handler export on purpose — every invocation would answer 502\nexport const notAHandler = 1;\n' > "$F_NOHANDLER"
check "S4  root entry with no handler export" kill
rm_retry "$F_NOHANDLER"

# ── E1 · a legitimate new entry point must be accepted ──────────────────────
printf "export default async function handler() {\n  return new Response('ok');\n}\n" > "$F_VALID"
check "E1  a valid new root entry point is accepted" equivalent
rm_retry "$F_VALID"

# ── G: the gate's own machinery ─────────────────────────────────────────────
# Forcing check 1 to fire proves the failure path actually reaches exit 1.
mut "$GATE" 'if (rootTests.length) {' 'if (true) {'
check "G1  check 1 forced (proves exit 1 is reachable)" kill
cp "$BAK/gate" "$GATE"

# Inverting check 4 must flag every real entry — proving the direction matters and
# that the check is not a tautology over a directory that always passes.
mut "$GATE" 'if (!hasHandler) noHandler.push(name);' 'if (hasHandler) noHandler.push(name);'
check "G2  check 4 inverted (proves it can distinguish)" kill
cp "$BAK/gate" "$GATE"

# ── RULE 3: nothing left behind, byte-identical restore, green again ────────
echo
for f in "${ALL_MUTANTS[@]}"; do
  if [ -e "$f" ]; then
    echo "LEFTOVER — $f survived the run"
    fail=1
  fi
done
if [ -d "$MUTDIR" ]; then
  echo "LEFTOVER — $MUTDIR survived the run"
  fail=1
fi
if ! diff -q "$BAK/gate" "$GATE" >/dev/null; then
  echo "RESTORE FAILED — $GATE is not byte-identical to its backup"
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
