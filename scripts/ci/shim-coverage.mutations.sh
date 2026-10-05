#!/usr/bin/env bash
# shim-coverage.mutations.sh — prove the shim-coverage gate can actually fail.
#
# A gate you have never seen go red is a hypothesis, not a check. Run from the
# repo root:  bash scripts/ci/shim-coverage.mutations.sh
#
# WHY "ALL SURVIVED" WOULD IMPLICATE THIS HARNESS, NOT THE GATE
#   Every mutation below is asserted to have APPLIED (exactly one match) before
#   its verdict counts, and every restore is proved byte-identical. A mutation
#   whose search string was not found is a silent no-op: the gate stays green,
#   the run prints SURVIVED, and you go hunting for a hole in a gate that never
#   saw the mutation. The NOT-APPLIED line exists so that cannot happen quietly.
#
# WHY THE BACKUPS ARE `cp` AND NOT `git checkout --`
#   Several files under test are ALREADY MODIFIED in the working tree (this
#   session's shim fixes), and shim-coverage.mjs itself is untracked. Restoring
#   those from HEAD would silently destroy uncommitted work — a harness must not
#   clobber the tree it is measuring. So: back up to a directory OUTSIDE the
#   repo, assert each backup is CLEAN before trusting it, and verify the
#   modified-file set is identical before and after.
set -u

GATE="scripts/ci/shim-coverage.mjs"
BAK="/f/tmp/shim-bak"
fail=0
failed_undos=0
declare -a results=()

# files the battery may write to
T_SHARE="src/components/forms/ShareView.tsx"          # unmodified in the tree
T_DASH="src/components/candidate/CandidateDash.tsx"   # unmodified in the tree
T_CSS="src/styles/global.css"                          # MODIFIED in the tree

rm -rf "$BAK" 2>/dev/null
mkdir -p "$BAK"
for f in "$T_SHARE" "$T_DASH" "$T_CSS" "$GATE"; do
  mkdir -p "$BAK/$(dirname "$f")"
  cp "$f" "$BAK/$f"
done

# The modified-file set BEFORE anything runs. If this changes, the battery
# damaged the tree and no verdict from it can be trusted.
BEFORE="$(git status --porcelain | sort)"

# A backup that already contains a mutation is not a backup.
# (Signature chosen per file; all absent from the clean tree.)
for pair in "$T_SHARE:bg-teal-700/40" "$T_CSS:bg-slate-600xx" "$T_CSS:bg-slate-900zz"; do
  f="${pair%%:*}"; sig="${pair##*:}"
  if grep -qF "$sig" "$BAK/$f"; then
    echo "ABORT: backup of $f already contains '$sig' — refusing to trust it"; exit 1
  fi
done

echo "── baseline ──"
if ! node "$GATE" >/tmp/shim-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations mean nothing on a red baseline"; cat /tmp/shim-base.txt; exit 1
fi
echo "baseline green"

# mut <file> <old> <new>   — values via ARGV, never env: on Git-Bash an env var
# can arrive as the literal string "undefined" and every mutation becomes a
# silent no-op that reads as SURVIVED.
mut() {
  node -e '
    const fs = require("fs");
    const [p, oldS, newS] = process.argv.slice(1);
    if (oldS === undefined || oldS === "undefined") { console.error("NOT-APPLIED: old string is undefined"); process.exit(2); }
    const s = fs.readFileSync(p, "utf8");
    const parts = s.split(oldS);
    if (parts.length !== 2) { console.error("NOT-APPLIED (matches=" + (parts.length - 1) + ")"); process.exit(2); }
    fs.writeFileSync(p, parts.join(newS));
  ' "$1" "$2" "$3" || { echo "   NOT-APPLIED — aborting"; return 1; }
}

undo() {  # never let a refused write decide the exit code
  if ! cp "$BAK/$1" "$1" 2>/dev/null; then
    echo "   UNDO FAILED for $1"
    failed_undos=$((failed_undos + 1))
    fail=1
  fi
}

run() {   # run "id" "what it breaks"
  local id="$1" desc="$2"
  node "$GATE" >/tmp/shim-out.txt 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    # attribution: require the failure to NAME the class the mutation targeted
    echo "KILLED   exit=$rc  $id  $desc"
    results+=("KILLED $id")
  else
    echo "SURVIVED exit=0   $id  $desc   <-- HOLE"
    results+=("SURVIVED $id"); fail=1
  fi
}

# ── M1 · a NEW class nobody has looked at ──────────────────────────────────
# The gate's core claim: an alpha'd bg-* that is neither shimmed nor allow-listed
# fails. Add one alongside an existing (allow-listed) class, keeping the file valid.
mut "$T_SHARE" 'bg-rose-500/10' 'bg-rose-500/10 bg-teal-700/40' \
  && { run M1 "a new unaccounted class (bg-teal-700/40)"; grep -q "bg-teal-700/40" /tmp/shim-out.txt || { echo "   MISATTRIBUTED: failure did not name bg-teal-700/40"; fail=1; }; }
undo "$T_SHARE"

# ── M2 · the shim loses an entry the tree depends on ───────────────────────
# Rename the selector so it no longer matches, leaving the CSS valid.
mut "$T_CSS" ':where([data-theme="light"]) .bg-slate-600\/50 {' ':where([data-theme="light"]) .bg-slate-600xx {' \
  && { run M2 "a shim entry removed (bg-slate-600/50)"; grep -q "bg-slate-600/50" /tmp/shim-out.txt || { echo "   MISATTRIBUTED: failure did not name bg-slate-600/50"; fail=1; }; }
undo "$T_CSS"

# ── M2b · the shim loses an entry that NO self-test pins ──────────────────
# M2 exits 2, which means it was caught by the instrument's own selector
# self-test (bg-slate-600/50 is pinned there) — NOT by the coverage check. So M2
# does not exercise the coverage path at all. This one targets a shimmed class
# the self-test does not pin, so the only thing that can catch it is the
# comparison itself. Without this mutation the gate's central claim is unproven.
#
# REJECTED CANDIDATE, kept so nobody re-adds it: `bg-slate-800/40` was the first
# choice and it SURVIVED — correctly. It is shimmed in THREE places
# (global.css:415 plus the nav-scoped pair at :1024-1025), so renaming one
# occurrence leaves the class shimmed and the gate is right to stay green. That
# is a "not a mutation at all", not a hole. The anchor below resolves to exactly
# one selector in the file, which is why it can only be caught by the comparison.
mut "$T_CSS" ':where([data-theme="light"]) .bg-slate-900\/60,' ':where([data-theme="light"]) .bg-slate-900zz,' \
  && { run M2b "a shim entry removed that no self-test pins (bg-slate-900/60)"; grep -q "bg-slate-900/60" /tmp/shim-out.txt || { echo "   MISATTRIBUTED: failure did not name bg-slate-900/60"; fail=1; }; }
undo "$T_CSS"

# ── M3 · an allow-listed class appears in a SECOND place ───────────────────
# The bound exists so a new surface cannot ride in on an old exemption.
mut "$T_DASH" 'bg-amber-500/10 border border-amber-500/40' 'bg-amber-500/10 bg-amber-500/10 border border-amber-500/40' \
  && { run M3 "an allow-listed class exceeds its bound (bg-amber-500/10 x2)"; grep -q "tolerates 1" /tmp/shim-out.txt || { echo "   MISATTRIBUTED: did not report the bound"; fail=1; }; }
undo "$T_DASH"

# ── M4 · machinery: the ALLOWED table is dead code ────────────────────────
# If emptying it changes nothing, the 11 exemptions are not actually consulted.
# This mutation touches the GATE, so it also writes a file the gate measures
# (M1's class is absent, but the gate always scans src/ — the run is not empty).
mut "$GATE" 'const ALLOWED = {' 'const ALLOWED = {}; const _DEAD_ALLOWED = {' \
  && { run M4 "the ALLOWED table is emptied"; grep -q "NOT allow-listed" /tmp/shim-out.txt || { echo "   MISATTRIBUTED: exemptions were not reported as missing"; fail=1; }; }
undo "$GATE"

# ── M5 · anti-vacuity: a scan that finds nothing must not pass ────────────
# Point the scan at a directory with no scannable files. A gate that reported
# "0 unaccounted" for an empty scan would be worse than no gate.
mut "$GATE" "const SRC = join(ROOT, 'src');" "const SRC = join(ROOT, 'migrations');" \
  && { run M5 "the scan finds nothing (broken instrument)"; grep -q "GATE ERROR" /tmp/shim-out.txt || { echo "   MISATTRIBUTED: did not report a broken instrument"; fail=1; }; }
undo "$GATE"

# ── restore proofs ─────────────────────────────────────────────────────────
echo
for f in "$T_SHARE" "$T_DASH" "$T_CSS" "$GATE"; do
  if diff -q "$BAK/$f" "$f" >/dev/null 2>&1; then echo "restore byte-identical: $f"; else echo "RESTORE MISMATCH: $f"; fail=1; fi
done

AFTER="$(git status --porcelain | sort)"
if [ "$BEFORE" = "$AFTER" ]; then echo "modified-file set unchanged"; else echo "MODIFIED-FILE SET CHANGED — the battery damaged the tree"; diff <(echo "$BEFORE") <(echo "$AFTER"); fail=1; fi

node "$GATE" >/dev/null 2>&1 || { echo "NOT GREEN AFTER RESTORE"; fail=1; }

echo
echo "killed   : $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived : $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
echo "failed undos : $failed_undos"
exit "$fail"
