#!/usr/bin/env bash
# Mutation battery for scripts/ci/surface-binding.mjs (npm run verify:binding).
#
# WHY THIS GATE
# -------------
# The gate's own header lists three failure modes that are INVISIBLE at runtime:
# an allow-listed action no entry can resolve (caller sees a generic
# NOT_IMPLEMENTED that reads like a business error), a declared map nobody uses
# (bundle weight Phase A exists to remove), and a routed action with no narrow
# home — which still WORKS, because apiClient retries its 404 onto the
# bridge-links catch-all, which is exactly why nobody notices.
#
# A gate that makes silent wiring bugs loud is worth nothing if it cannot go red.
# This battery drives all FOUR of its violation paths, not just the obvious one.
#
# WHAT EACH MUTATION RE-INTRODUCES
# --------------------------------
#   S1  allow-list an action owned by another surface   -> path 3 (unresolvable)
#   S2  drop an action from its only home               -> path 4 (orphaned)
#   S3  declare a map that is never imported            -> path 2 (unresolved map)
#   S4  break the makeSurfaceHandler(...) shape         -> path 1 (parse failure)
#
# S1 uses getJobStatus, which is owned by surfaces/ai, in config.js — so the
# failure message must name the real owner. That is the difference between a gate
# that tells you what is wrong and one that only tells you something is.
#
# OUTCOMES THAT ARE NOT FAILURES
# ------------------------------
# **E1 — reformatting an allow-list must not fail.** The same four actions, one
# per line, is a pure formatting change. If E1 ever fails the gate is matching
# text rather than membership, and it will fight every reformat of every entry.
#
# **E2 — a note must never be a failure.** E2 declares surfaces/diagnostics but
# uses none of its actions, which is the gate's own failure mode #2 (dead weight).
# It is reported as a note and the build stays green. If E2 ever fails, the gate
# has started blocking on style, and the first thing an author does with a gate
# that blocks on style is disable it.
#
# Must be run with cwd = repo root:  bash scripts/ci/surface-binding.mutations.sh
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

GATE=scripts/ci/surface-binding.mjs
ENTRY=netlify/functions/config.js        # smallest narrow entry: 4 actions, all listed
BAK=.tmp-bindmut
fail=0
results=()

cleanup() { rm_retry "$BAK"; }

restore() {
  [ -f "$BAK/gate" ] && cp "$BAK/gate" "$GATE"
  [ -f "$BAK/entry" ] && cp "$BAK/entry" "$ENTRY"
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

# Never pipe the gate into another command: `node "$GATE" | tail` makes `$?`
# report tail's exit code, so every mutation would read as KILLED.
check() {
  local label="$1" expect="$2" rc
  node "$GATE" >/dev/null 2>&1
  rc=$?
  if [ "$expect" = kill ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    else
      echo "SURVIVED   exit=0   $label   <-- HOLE: this wiring-bug class is not covered"
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

# Asserts an EXACT exit code, for the one case where the code itself carries
# meaning: exit 2 means "this gate is stale", exit 1 means "your binding is
# wrong". "Non-zero" is not good enough — collapsing the two is the defect this
# battery found, and only an exact-code assertion can catch a regression to it.
check_exit() {
  local label="$1" want="$2" rc
  node "$GATE" >/dev/null 2>&1
  rc=$?
  if [ "$rc" -eq "$want" ]; then
    echo "KILLED     exit=$rc  $label   (exact code $want)"
    results+=("KILLED $label")
  else
    echo "UNEXPECTED exit=$rc  $label   <-- expected exactly $want, not merely non-zero"
    results+=("UNEXPECTED $label")
    fail=1
  fi
}

trap 'restore; cleanup' EXIT

# ── RULE 0: start from a known-clean tree ───────────────────────────────────
cleanup
restore
mkdir -p "$BAK"
cp "$GATE" "$BAK/gate"
cp "$ENTRY" "$BAK/entry"

# ── RULE 1: never interpret mutations against an already-red baseline ────────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on an unmutated tree. Aborting: mutations cannot be interpreted."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"

# ── S1 · an action owned by a different surface ─────────────────────────────
# getJobStatus belongs to surfaces/ai. config.js declaring it is the exact drift
# that produced the two real breakages this gate was written for.
mut "$ENTRY" "'deleteRincianPreset'," "'deleteRincianPreset', 'getJobStatus',"
check "S1  allow-list an action owned by another surface" kill
cp "$BAK/entry" "$ENTRY"

# ── S2 · an action left with no narrow home ─────────────────────────────────
# getRincianPresets is allow-listed by config.js and nothing else, so removing it
# orphans the router entry. At runtime this still works via the catch-all 404
# retry — which is why the gate, not a user, has to catch it.
mut "$ENTRY" "'getRincianPresets', " ""
check "S2  drop an action from its only home (orphans the router entry)" kill
cp "$BAK/entry" "$ENTRY"

# ── S3 · a declared map that is never imported ──────────────────────────────
mut "$ENTRY" 'makeSurfaceHandler(CONFIG_ACTIONS, [' 'makeSurfaceHandler([CONFIG_ACTIONS, JOBS_ACTIONS], ['
check "S3  declare a map that is never imported" kill
cp "$BAK/entry" "$ENTRY"

# ── S4 · the call shape changed under the parser ────────────────────────────
# The gate cannot verify what it cannot parse, so this must be a hard failure —
# silently skipping an unparsed entry is how a gate becomes a no-op. It must also
# be exit 2 specifically: a parse failure means the GATE is stale, and reporting
# it as exit 1 sends the author looking for a binding bug that does not exist.
mut "$ENTRY" 'makeSurfaceHandler(CONFIG_ACTIONS, [' 'makeSurfaceHandler(CONFIG_ACTIONS, {'
check_exit "S4  unparseable shape -> exit 2 (gate is stale, not your code)" 2
cp "$BAK/entry" "$ENTRY"

# ── E1 · reformatting the allow-list must stay green ────────────────────────
mut "$ENTRY" "  'updateSysConfig', 'getRincianPresets', 'saveRincianPreset', 'deleteRincianPreset'," \
              "  'updateSysConfig',
  'getRincianPresets',
  'saveRincianPreset',
  'deleteRincianPreset',"
check "E1  allow-list reformatted to one action per line (same membership)" equivalent
cp "$BAK/entry" "$ENTRY"

# ── E2 · a dead map is a note, never a failure ──────────────────────────────
# Declared AND imported, but contributes no allow-listed action -> dead weight.
mut "$ENTRY" "import { CONFIG_ACTIONS } from './surfaces/config.js';" \
              "import { CONFIG_ACTIONS } from './surfaces/config.js';
import { DIAGNOSTICS_ACTIONS } from './surfaces/diagnostics.js';"
mut "$ENTRY" 'makeSurfaceHandler(CONFIG_ACTIONS, [' 'makeSurfaceHandler([CONFIG_ACTIONS, DIAGNOSTICS_ACTIONS], ['
check "E2  declared-but-unused map is a note, not a violation" equivalent
cp "$BAK/entry" "$ENTRY"

# ── G: the gate's own machinery ─────────────────────────────────────────────
# Forcing the orphan predicate proves that path reaches exit 1 at all.
mut "$GATE" '  (a) => !narrowAllowed.has(a) && !REACHABILITY_EXEMPT.has(a),' '  (a) => true,'
check "G1  orphan predicate forced true (proves exit 1 is reachable)" kill
cp "$BAK/gate" "$GATE"

# Inverting the ownership filter flags every correctly-bound action. That proves
# the check is not a tautology over a tree that always passes.
mut "$GATE" 'const unresolvable = allowed.filter((a) => !owned.has(a));' \
            'const unresolvable = allowed.filter((a) => owned.has(a));'
check "G2  ownership filter inverted (proves it can distinguish)" kill
cp "$BAK/gate" "$GATE"

# Forcing the parse-error branch on a CLEAN tree proves exit 2 is actually
# reachable and is really 2. Without this, S4 would only show that the mutated
# entry fails somehow — it could still be falling through to exit 1, which is the
# exact regression S4 exists to prevent.
mut "$GATE" 'if (parseErrors.length) {' 'if (true) {'
check_exit "G3  parse-error branch forced (proves exit 2 is reachable and is 2)" 2
cp "$BAK/gate" "$GATE"

# ── RULE 3: nothing left behind, byte-identical restore, green again ────────
echo
for pair in "gate:$GATE" "entry:$ENTRY"; do
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
