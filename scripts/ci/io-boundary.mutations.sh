#!/usr/bin/env bash
# Mutation battery for scripts/ci/io-boundary.mjs (npm run verify:io).
#
# WHY THIS GATE
# -------------
# io-boundary.mjs enforces the architectural invariant stated in two documents:
# "no raw `fetch()` outside kernel/http.ts". A bypass costs four things at once —
# deadline clamping, the circuit breaker, the bulkhead, and traceparent/metrics
# visibility. The gate's own header records that the worst offender (a sequential
# download loop of up to 200 files at 10 s each, against a 60 s platform ceiling)
# was found and fixed by hand.
#
# The gate has three distinct failure paths, and a battery that exercises only the
# obvious one would overstate its coverage. This file drives all three.
#
# WHAT EACH MUTATION RE-INTRODUCES
# --------------------------------
#   S1  a NEW function file with a raw fetch()      -> "not in allow-list"
#   S2  one extra fetch() in an allow-listed file   -> "exceeds its max bound"
#   S3  the real wrapper call renamed               -> "wrapper no longer calls fetch"
#
# S2 targets an allow-listed file ON PURPOSE. Every entry in ALLOWED currently sits
# exactly at its `max`, so the bound is the only thing standing between today's tree
# and a seventh tolerated bypass. A battery that never pushes past a bound does not
# test the bound.
#
# S3 IS A REAL HOLE THAT THIS BATTERY FOUND — see the header of the check it
# exercises. The wrapper guard used to be `includes('fetch(')`, which the file's own
# comments satisfied (lines 6, 19, 77 all mention `fetch()`). Renaming the real call
# left the gate GREEN, so "the implementation moved and this gate now guards the
# wrong file" was undetectable. The check was changed to count real call sites, and
# S3 is kept as the regression test for it.
#
# OUTCOMES THAT ARE NOT FAILURES
# ------------------------------
# **E1 — a new function that routes through the kernel must be accepted.** The
# directory exists to grow. If E1 ever fails, the gate has started rejecting valid
# code and every new function will fight it.
#
# Must be run with cwd = repo root:  bash scripts/ci/io-boundary.mutations.sh
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

GATE=scripts/ci/io-boundary.mjs
FN=netlify/functions
SINK="$FN/_lib/metrics-sink.ts"          # allow-listed, max 1 — the bound test
WRAPPER="$FN/_lib/kernel/http.ts"        # the sanctioned wrapper
BAK=.tmp-iomut
fail=0
results=()

F_RAW="$FN/__iomut-rawfetch.ts"
F_CLEAN="$FN/__iomut-clean.ts"

ALL_MUTANTS=("$F_RAW" "$F_CLEAN")

cleanup() {
  rm_retry "${ALL_MUTANTS[@]}"
  rm_retry "$BAK"
}

# Restore every file this battery edits. Called at the start (RULE 0) and by the
# EXIT trap, so an interrupted run cannot leave a mutant in a live source tree.
restore() {
  [ -f "$BAK/gate" ] && cp "$BAK/gate" "$GATE"
  [ -f "$BAK/sink" ] && cp "$BAK/sink" "$SINK"
  [ -f "$BAK/wrapper" ] && cp "$BAK/wrapper" "$WRAPPER"
  return 0
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

# IMPORTANT: never pipe the gate into another command here. `node "$GATE" | tail`
# makes `$?` report tail's exit code, so every mutation would read as KILLED and
# the battery would certify coverage it does not have. Redirect to /dev/null only.
check() {
  local label="$1" expect="$2" rc
  node "$GATE" >/dev/null 2>&1
  rc=$?
  if [ "$expect" = kill ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    else
      echo "SURVIVED   exit=0   $label   <-- HOLE: this bypass class is not covered"
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

trap 'restore; cleanup' EXIT

# ── RULE 0: start from a known-clean tree ───────────────────────────────────
# This battery creates new files in a live deploy directory AND edits real source
# files. An interrupted run leaves mutants behind, which then makes the next run's
# BASELINE red — the right verdict, but a confusing one, because the gate looks
# broken when it is the harness that is dirty.
cleanup
restore
mkdir -p "$BAK"
cp "$GATE" "$BAK/gate"
cp "$SINK" "$BAK/sink"
cp "$WRAPPER" "$BAK/wrapper"

# ── RULE 1: never interpret mutations against an already-red baseline ────────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on an unmutated tree. Aborting: mutations cannot be interpreted."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"

# ── S1 · a new function calling fetch() directly ────────────────────────────
# The realistic shape: someone adds a function and reaches for the global fetch.
printf "export default async function handler() {\n  const r = await fetch('https://iomut.invalid/');\n  return new Response(String(r.status));\n}\n" > "$F_RAW"
check "S1  new file with a raw fetch() (not in allow-list)" kill
rm_retry "$F_RAW"

# ── S2 · one extra fetch() in an allow-listed file ──────────────────────────
# metrics-sink.ts is allowed exactly 1 site and currently has exactly 1, so this
# takes it to 2 and must cross the bound. Leading newline guards a file that does
# not end in one.
printf "\nconst __iomutExtra = await fetch('https://iomut.invalid/');\n" >> "$SINK"
check "S2  allow-listed file pushed past its max bound" kill
cp "$BAK/sink" "$SINK"

# ── S3 · the wrapper implementation moved ───────────────────────────────────
# The comments that used to satisfy the old `includes('fetch(')` check are left
# intact, so this fails ONLY if the check counts real call sites. This is the
# regression test for the hole the first run of this battery exposed.
mut "$WRAPPER" 'const res = await fetch(url, { ...fetchInit, headers, signal });' \
               'const res = await httpFetchViaKernel(url, { ...fetchInit, headers, signal });'
check "S3  real wrapper call renamed (comments still say fetch)" kill
cp "$BAK/wrapper" "$WRAPPER"

# ── E1 · a new function that routes through the kernel ──────────────────────
printf "import { kernelFetch } from '../_lib/kernel/http.js';\n\nexport default async function handler() {\n  const r = await kernelFetch('https://iomut.invalid/');\n  return new Response(String(r.status));\n}\n" > "$F_CLEAN"
check "E1  new function routing through kernel/http.ts is accepted" equivalent
rm_retry "$F_CLEAN"

# ── G: the gate's own machinery ─────────────────────────────────────────────
# Forcing the not-allowed branch proves the verdict path actually reaches exit 1.
mut "$GATE" 'if (!allow) {' 'if (true) {'
check "G1  not-allowed branch forced (proves exit 1 is reachable)" kill
cp "$BAK/gate" "$GATE"

# Widening the comparison to >= flags every file sitting exactly at its bound.
# That proves the bound is exact — an off-by-one here would redden the gate on a
# clean tree, and every allow-listed entry would look like a new bypass.
mut "$GATE" '} else if (hits.length > allow.max) {' '} else if (hits.length >= allow.max) {'
check "G2  bound comparison widened to >= (proves it is exact)" kill
cp "$BAK/gate" "$GATE"

# ── RULE 3: nothing left behind, byte-identical restore, green again ────────
echo
for f in "${ALL_MUTANTS[@]}"; do
  if [ -e "$f" ]; then
    echo "LEFTOVER — $f survived the run"
    fail=1
  fi
done
for pair in "gate:$GATE" "sink:$SINK" "wrapper:$WRAPPER"; do
  if ! diff -q "$BAK/${pair%%:*}" "${pair#*:}" >/dev/null; then
    echo "RESTORE FAILED — ${pair#*:} is not byte-identical to its backup"
    fail=1
  fi
done
if ! node "$GATE" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

echo "killed:     $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived:   $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
echo "ok-green:   $(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN')"
echo "unexpected: $(printf '%s\n' "${results[@]}" | grep -c '^UNEXPECTED')"
exit "$fail"
