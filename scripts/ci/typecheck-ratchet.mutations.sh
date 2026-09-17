#!/usr/bin/env bash
# Mutation battery for scripts/ci/typecheck-ratchet.mjs (npm run typecheck:ratchet).
#
# WHY THIS GATE
# -------------
# This is the ORIGINAL ratchet, and the idiom every other debt-aware gate in the
# repo now copies (lint-ratchet.mjs mirrors it). Its premise is stated in its own
# header: a permanently red pipeline is a pipeline the team learns to ignore and
# then deletes, so instead of failing on all pre-existing debt it enforces the one
# rule that matters — **no new debt may be introduced**.
#
# That premise only holds if the ratchet can actually tell new debt from old. A
# ratchet that cannot fail is a green light on every commit.
#
# HOW THIS BATTERY DRIVES IT WITHOUT TOUCHING THE REAL BASELINE
# ------------------------------------------------------------
# The gate takes `--baseline <path>`, so every scenario below is a CRAFTED JSON
# file under a temp directory. The real `.ci/tsc-baseline.json` is backed up and
# verified byte-identical at the end but is never written to. The only thing
# created in the source tree is one temp file with one deliberate type error,
# which is what makes the "count increased" path reachable at all — the tree
# currently carries ZERO type errors, so nothing real can exercise it.
#
# WHAT EACH MUTATION RE-INTRODUCES
# --------------------------------
#   S1  baseline claims 0 errors, tree has 1        -> failure condition 1
#   S2  baseline omits the now-dirty file           -> failure condition 2
#   S3  baseline file does not exist                -> exit 2 (tooling error)
#
# S2 is built with a total that MATCHES the current total, so failure condition 1
# cannot fire. That isolates condition 2 — otherwise a kill would be
# indistinguishable from "the first check caught it", which is how a battery
# reports coverage it does not have.
#
# OUTCOMES THAT ARE NOT FAILURES
# ------------------------------
# **E1 — a baseline that matches the tree must pass.** This is the normal state of
# the repo. If E1 fails, the ratchet is red on a clean tree and every commit
# fights it.
#
# **E2 — a baseline ABOVE the tree must pass.** Debt going down is the whole point
# of a ratchet; if a reduction failed the build, nobody would ever fix a type
# error.
#
# COST
# ----
# Each step runs a full `tsc --noEmit`, so this file takes roughly 80-90 s.
#
# Must be run with cwd = repo root:  bash scripts/ci/typecheck-ratchet.mutations.sh
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

GATE=scripts/ci/typecheck-ratchet.mjs
REAL_BASELINE=.ci/tsc-baseline.json
MUTSRC=src/__tsmut.ts
TMP=.tmp-tsmut
BAK=.tmp-tsmut-bak        # deliberately OUTSIDE $TMP: see RULE 0 below
fail=0
results=()
GATE_ARGS=()

cleanup() {
  rm_retry "$MUTSRC"
  rm_retry "$TMP"
}

# Restore the two tracked files this battery could damage, if the backups exist.
restore() {
  [ -f "$BAK/gate" ] && cp "$BAK/gate" "$GATE"
  [ -f "$BAK/real-baseline" ] && cp "$BAK/real-baseline" "$REAL_BASELINE"
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
  node "$GATE" "${GATE_ARGS[@]}" >/dev/null 2>&1
  rc=$?
  if [ "$expect" = kill ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    else
      echo "SURVIVED   exit=0   $label   <-- HOLE: the ratchet does not catch this"
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

# Exit 2 means "the tooling is broken", exit 1 means "your code introduced debt".
# Only an exact-code assertion can tell a regression between them apart.
check_exit() {
  local label="$1" want="$2" rc
  node "$GATE" "${GATE_ARGS[@]}" >/dev/null 2>&1
  rc=$?
  if [ "$rc" -eq "$want" ]; then
    echo "KILLED     exit=$rc  $label   (exact code $want)"
    results+=("KILLED $label")
  else
    echo "UNEXPECTED exit=$rc  $label   <-- expected exactly $want"
    results+=("UNEXPECTED $label")
    fail=1
  fi
}

trap 'restore; cleanup' EXIT

# ── RULE 0: start from a known-clean tree ───────────────────────────────────
# `restore` runs BEFORE `cleanup` so an interrupted previous run heals itself: the
# gate is put back from the surviving backup first, and only then is the temp dir
# wiped. That is why $BAK lives outside $TMP — if it were inside, cleanup would
# delete the very backups restore needs, and a second run would back up an
# already-mutated gate and then abort on a red baseline without repairing it.
restore
cleanup
mkdir -p "$BAK"
cp "$GATE" "$BAK/gate"
cp "$REAL_BASELINE" "$BAK/real-baseline"

# ── Plant exactly one type error, and record the tree's true summary ────────
# `--update-baseline` into a TEMP path is how the battery learns the current
# numbers without guessing them, and it is the only run that writes anything.
printf "// mutation-battery temp file: one deliberate type error, removed at the end\nexport const __tsmutWrong: number = 'not a number';\n" > "$MUTSRC"
node "$GATE" --update-baseline --baseline "$TMP/current.json" >/dev/null 2>&1
if [ ! -f "$TMP/current.json" ]; then
  echo "SETUP FAILED — could not record the current summary. Aborting."
  exit 1
fi
CUR_TOTAL=$(node -e "console.log(require('./$TMP/current.json').total)")
if [ "$CUR_TOTAL" -lt 1 ]; then
  echo "SETUP FAILED — planted a type error but tsc reported $CUR_TOTAL error(s)."
  echo "  The temp file is not covered by tsconfig.json, so no scenario below is meaningful."
  exit 1
fi
echo "setup: planted 1 type error, tsc now reports $CUR_TOTAL"

# ── RULE 1: never interpret mutations against an already-red baseline ───────
# Baseline == tree is the healthy state, so this must be green.
GATE_ARGS=(--baseline "$TMP/current.json")
if ! node "$GATE" "${GATE_ARGS[@]}" >/dev/null 2>&1; then
  echo "BASELINE RED — a baseline matching the tree does not pass. Aborting."
  node "$GATE" "${GATE_ARGS[@]}" || true
  exit 1
fi
echo "baseline green"

# ── S1 · the error count went up ────────────────────────────────────────────
printf '{"total":0,"byFile":{},"byCode":{}}' > "$TMP/zero.json"
GATE_ARGS=(--baseline "$TMP/zero.json")
check "S1  baseline 0 vs tree $CUR_TOTAL (failure condition 1)" kill

# ── S2 · a previously clean file now has errors ─────────────────────────────
# total is set EQUAL to the tree's, so condition 1 cannot fire and the only thing
# that can fail is condition 2.
SRC="$TMP/current.json" DST="$TMP/newfile.json" node -e '
const fs = require("fs");
const cur = JSON.parse(fs.readFileSync(process.env.SRC, "utf8"));
fs.writeFileSync(process.env.DST, JSON.stringify({
  total: cur.total,
  byFile: { "src/__tsmut-gone.ts": cur.total },
  byCode: {},
}, null, 2));
'
GATE_ARGS=(--baseline "$TMP/newfile.json")
check "S2  same total, but the dirty file was clean in the baseline" kill

# ── S3 · the baseline is missing entirely ───────────────────────────────────
GATE_ARGS=(--baseline "$TMP/definitely-not-here.json")
check_exit "S3  missing baseline file -> exit 2 (tooling, not debt)" 2

# ── E1 · a baseline matching the tree passes ────────────────────────────────
GATE_ARGS=(--baseline "$TMP/current.json")
check "E1  baseline == tree (the normal state of the repo)" equivalent

# ── E2 · debt going DOWN must pass ──────────────────────────────────────────
SRC="$TMP/current.json" DST="$TMP/higher.json" node -e '
const fs = require("fs");
const cur = JSON.parse(fs.readFileSync(process.env.SRC, "utf8"));
cur.total += 4;
fs.writeFileSync(process.env.DST, JSON.stringify(cur, null, 2));
'
GATE_ARGS=(--baseline "$TMP/higher.json")
check "E2  baseline above the tree (debt reduced) is accepted" equivalent

# ── G: the gate's own machinery ─────────────────────────────────────────────
# Inverting the new-file filter flags every file already in the baseline. That
# proves condition 2 is a real comparison and not a tautology over a tree that
# happens to be clean.
mut "$GATE" 'const newFiles = Object.keys(current.byFile).filter((f) => !(f in baseline.byFile));' \
            'const newFiles = Object.keys(current.byFile).filter((f) => (f in baseline.byFile));'
GATE_ARGS=(--baseline "$TMP/current.json")
check "G1  new-file filter inverted (proves condition 2 can distinguish)" kill
cp "$BAK/gate" "$GATE"

# Forcing condition 1 proves that path reaches exit 1 at all.
mut "$GATE" '  if (current.total > baseline.total) {' '  if (true) {'
GATE_ARGS=(--baseline "$TMP/current.json")
check "G2  count comparison forced true (proves exit 1 is reachable)" kill
cp "$BAK/gate" "$GATE"

# ── RULE 3: nothing left behind, byte-identical restore, green again ────────
# The temp error source is removed FIRST. It is present on purpose for the whole
# run — it is what makes failure condition 1 reachable at all — so testing for
# leftovers before removing it reports the battery's own scaffolding as a
# failure. That is exactly what the first run of this file did, and it is worth
# keeping the ordering comment: a leftover check that fires on the harness itself
# is indistinguishable from a real leftover, and it cost a full 90 s run to see.
rm_retry "$MUTSRC"
echo
if [ -e "$MUTSRC" ]; then
  echo "LEFTOVER — $MUTSRC survived the run"
  fail=1
fi
for pair in "gate:$GATE" "real-baseline:$REAL_BASELINE"; do
  if ! diff -q "$BAK/${pair%%:*}" "${pair#*:}" >/dev/null; then
    echo "RESTORE FAILED — ${pair#*:} is not byte-identical to its backup"
    fail=1
  fi
done

# The real baseline must still describe the REAL tree, now that the temp error is
# gone. This is the check that the battery did not corrupt the real baseline.
GATE_ARGS=(--baseline "$REAL_BASELINE")
if ! node "$GATE" "${GATE_ARGS[@]}" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — the real baseline no longer matches the real tree"
  fail=1
fi
GATE_ARGS=()

rm_retry "$BAK"

echo "killed:     $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived:   $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
echo "ok-green:   $(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN')"
echo "unexpected: $(printf '%s\n' "${results[@]}" | grep -c '^UNEXPECTED')"
exit "$fail"
