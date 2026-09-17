#!/usr/bin/env bash
#
# cold-start-gate.mutations.sh — prove scripts/ci/cold-start-gate.mjs can fail.
#
# WHY THIS FILE EXISTS
#   A latency gate's failure mode is SILENCE. When it is broken it prints
#   "PASSED", the pipeline goes green, and nobody investigates — because "fast
#   enough" is the boring answer everyone already expects. There is no signal
#   that the gate has stopped working.
#
#   So the gate is not trusted until it has been seen red for each rule it
#   claims to enforce. This battery makes exactly one minimal edit per rule,
#   runs the gate, and judges by EXIT CODE (never by scraping output).
#
# IF EVERY MUTATION "SURVIVES", SUSPECT THIS FILE, NOT THE GATE
#   Both traps that produce a false "all survived" have been hit in this repo:
#     • Python handed a Windows path in the wrong dialect (/f/astro/...), so the
#       mutation was never written and an unchanged gate passed trivially. This
#       script therefore runs from the repo root with *relative* paths.
#     • A gate that crashes before running anything returns non-zero for the
#       wrong reason, or its summary is parsed from the wrong stream. Everything
#       here redirects both streams and reads $? only.
#   A byte-identical restore is asserted at the end for the same reason: it is
#   what catches "the mutation never applied".
#
# RUN
#   bash scripts/ci/cold-start-gate.mutations.sh      # from the repo root

set -u

GATE="scripts/ci/cold-start-gate.mjs"
TESTFILE="netlify/functions/_lib/cold-start-gate.test.ts"
BAK="/tmp/coldbak"

fail=0
declare -a results=()

# ── RULE 1: the baseline must be green before any mutation is interpreted ─────
if ! npx vitest run "$TESTFILE" --project backend >/tmp/cold-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations would be meaningless."
  cat /tmp/cold-base.txt
  exit 1
fi
echo "baseline GREEN"
echo

mkdir -p "$BAK"
cp "$GATE" "$BAK/cold-start-gate.mjs"
cp "$TESTFILE" "$BAK/cold-start-gate.test.ts"

restore() {
  cp "$BAK/cold-start-gate.mjs" "$GATE"
  cp "$BAK/cold-start-gate.test.ts" "$TESTFILE"
}

# Judge by exit code only. Both streams redirected; $? is the verdict.
run() {
  local desc="$1"
  npx vitest run "$TESTFILE" --project backend >/tmp/cold-out.txt 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "KILLED   exit=$rc  $desc"
    results+=("KILLED   $desc")
  else
    echo "SURVIVED exit=0   $desc   <-- HOLE"
    results+=("SURVIVED $desc")
    fail=1
  fi
}

# Patch the gate (relative path — the rule-5 trap).
#
# WHY `node -e` AND NOT `python`
#   This used to shell out to `python`. That name does not exist on
#   `ubuntu-latest` (which ships `python3`) nor on a bare Windows box, so the
#   battery could not run in CI — and, consistently, never did. Node is
#   guaranteed by the checkout that runs this file, and the sibling battery
#   `verify-classes.mutations.sh` already uses this idiom.
#
# The assertion is strengthened from `old in s` to "exactly one occurrence":
# replacing the FIRST of several matches silently mutates a different site than
# the battery intends, and the run then reports on a code path it did not mean
# to touch.
mutate_gate() {
  MUT_OLD="$1" MUT_NEW="$2" node -e '
const fs = require("fs");
const p = "scripts/ci/cold-start-gate.mjs";
const s = fs.readFileSync(p, "utf8");
const o = process.env.MUT_OLD;
const hits = s.split(o).length - 1;
if (hits !== 1) {
  console.error("MUTATION ANCHOR NOT UNIQUE (hits=" + hits + "): " + JSON.stringify(o));
  process.exit(2);
}
fs.writeFileSync(p, s.replace(o, process.env.MUT_NEW));
'
  if [ $? -ne 0 ]; then echo "  !! mutation failed to apply — aborting"; exit 1; fi
}

# ── A. Invert the budget comparison: the classic "gate passes everything" ─────
mutate_gate "if (best <= budget) {" "if (best >= budget) {"
run "A  budget comparison inverted (pass/fail swapped)"
restore

# ── B. Ignore the budget entirely: every reading passes ───────────────────────
mutate_gate "if (best <= budget) {" "if (true) {"
run "B  budget ignored — every reading passes"
restore

# ── C. Take the WORST sample instead of the best: noise becomes failure ───────
mutate_gate "return ok.length ? Math.min(...ok) : null;" "return ok.length ? Math.max(...ok) : null;"
run "C  best-of becomes worst-of (noise manufactures failures)"
restore

# ── D. Treat an unreachable path as a pass: an outage scores as great latency ─
mutate_gate "return { verdict: 'error', reason: 'no successful sample' };" "return { verdict: 'pass', reason: 'no successful sample' };"
run "D  unreachable path reported as a pass"
restore

# ── E. Weaken the default budget far below the stated 3s target ──────────────
mutate_gate "budget: 3000," "budget: 100000,"
run "E  default budget widened to 100s (3s target abandoned)"
restore

# ── F. --enforce becomes the default: latency noise starts failing pipelines ──
mutate_gate "enforce: false," "enforce: true,"
run "F  --enforce on by default (noisy runner fails the build)"
restore

# ── G. Probe returns a constant: the gate measures nothing at all ────────────
mutate_gate "const ms = Date.now() - started;" "const ms = 1;"
run "G  probe returns a constant time (measures nothing)"
restore

# ── RULE 3: prove the restore, and that the baseline is green again ──────────
echo
diff -q "$BAK/cold-start-gate.mjs" "$GATE" || { echo "GATE NOT RESTORED"; fail=1; }
diff -q "$BAK/cold-start-gate.test.ts" "$TESTFILE" || { echo "TEST FILE NOT RESTORED"; fail=1; }

if ! npx vitest run "$TESTFILE" --project backend >/dev/null 2>&1; then
  echo "BASELINE RED AFTER RESTORE"; fail=1
else
  echo "baseline GREEN after restore (files byte-identical)"
fi

echo
killed=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED')
survived=$(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')
echo "killed: $killed"
echo "survived: $survived"
exit "$fail"
