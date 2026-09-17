#!/usr/bin/env bash
# Mutation battery for scripts/ci/review-gate.mjs.
#
# WHY A BATTERY
# -------------
# A checker that cannot fail is worse than no checker: it buys confidence and
# pays nothing. Each mutation below re-introduces a defect class this gate claims
# to catch. The gate must exit non-zero for each one. A "SURVIVED" line is a hole
# in the gate, not a curiosity.
#
# HOW THE BASELINE IS MADE DETERMINISTIC
# --------------------------------------
# The gate reviews a diff, so the battery pins one with `--base=HEAD` (working
# tree vs HEAD) rather than the real remote, which is 25 commits behind and would
# make every result depend on unrelated history.
#
# That alone is not enough, and the first draft got this wrong: the working tree
# routinely carries someone's in-progress edits (a large docs rewrite, a PR
# template being edited). Those show up in the diff, and the moment one of them
# touches a high-risk path the baseline goes red and every verdict becomes
# meaningless. So the battery computes, at startup, the set of files the working
# tree has already modified, subtracts the files it is about to mutate, and
# excludes the rest with --ignore-path.
#
# Those excluded files are NEVER written to. They belong to whoever is editing
# them, and a test harness has no business rewriting a colleague's work. The
# battery also records which files were dirty at startup and fails if any of them
# is no longer dirty afterwards — proving it left them exactly as it found them.
#
# TWO TRAPS, BOTH REAL, BOTH GUARDED BELOW
# ----------------------------------------
#  1. **The mutation silently fails to apply.** An earlier battery in this repo
#     passed `/f/astro/...` to Windows Python, which cannot open that path, so
#     every mutation was a no-op and the battery reported 5/5 SURVIVED against a
#     perfectly good gate. `mut` asserts exactly ONE match before writing; `app`
#     is idempotent and refuses to double-append.
#  2. **Judging by scraped output instead of the exit code.** `check` only ever
#     looks at `$?`, never at the gate's text.
#
# A THIRD TRAP, WHICH THIS BATTERY HIT
# ------------------------------------
#  3. **Forgetting to back up the gate itself.** `$GATE` must be in FILES or
#     `restore_one "$GATE"` is a silent no-op. In the first draft it was missing,
#     so both G mutations stayed in the tree, the two "KILLED" verdicts were
#     caused by each other's leftovers rather than by the mutation under test, and
#     the run ended with "NOT GREEN AFTER RESTORE". The sibling batteries in this
#     repo include their own subject for the same reason.
#
# OUTCOMES THAT ARE NOT FAILURES
# ------------------------------
# **E3 — the documented boundary.** R6 blocks on a hard-rule violation in a file
# that was CLEAN, or in a new file. It deliberately does NOT block the same
# violation in a file that already carried diagnostics, because this repo has
# 2,716 pre-existing diagnostics and a gate that demands them all be fixed before
# a legitimate push is a gate that gets switched off. E3 pins that boundary: if it
# ever starts failing, R6 grew a capability and this file needs updating — so it is
# reported as UNEXPECTED, not as a pass.
#
# **E4 — the documented escape hatch.** `--allow-large` lets a genuinely large
# change through. It must go green, and the reason must be recorded in the output.
#
# Must be run with cwd = repo root:  bash scripts/ci/review-gate.mutations.sh
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

GATE=scripts/ci/review-gate.mjs
BAK=.tmp-reviewmut
fail=0
results=()

# Tracked files, so `git diff --base=HEAD` can see them.
T_CLEAN=netlify/functions/contexts/ingestion/index.ts   # no diagnostics in the lint baseline
T_DIRTY=src/lib/vip.ts                                  # already carries diagnostics
T_KERNEL=netlify/functions/_lib/kernel/deadline.ts      # a high-risk path
T_TSX=src/components/Toast.tsx                          # for the verify:classes path
T_NEWMIG=migrations/999_review_gate_lintmut.sql         # new migration, added via `git add -N`

# $GATE must be in FILES or `restore_one "$GATE"` is a silent no-op — see trap 3.
FILES=("$T_CLEAN" "$T_DIRTY" "$T_KERNEL" "$T_TSX" "$GATE")

# Files this battery owns and will write to. Everything else that is already
# dirty gets excluded from the diff instead of touched.
CONTROLLED=" $T_CLEAN $T_DIRTY $T_KERNEL $T_TSX $T_NEWMIG $GATE "

key() { printf '%s' "$1" | tr '/.' '__'; }

backup_all() {
  mkdir -p "$BAK"
  for f in "${FILES[@]}"; do cp "$f" "$BAK/$(key "$f")"; done
}

restore_one() {
  local b="$BAK/$(key "$1")"
  [ -f "$b" ] && cp "$b" "$1"
}

remove_migration() {
  git reset -q -- "$T_NEWMIG" 2>/dev/null
  rm_retry "$T_NEWMIG"
}

cleanup() {
  for f in "${FILES[@]}"; do restore_one "$f"; done
  remove_migration
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

# Append once. Idempotent: a second run is a no-op rather than a double append.
app() {
  APP_FILE="$1" APP_TEXT="$2" node -e '
const fs = require("fs");
const p = process.env.APP_FILE;
const t = process.env.APP_TEXT;
let s = fs.readFileSync(p, "utf8");
if (s.includes(t)) process.exit(0);
if (!s.endsWith("\n")) s += "\n";
fs.writeFileSync(p, s + t + "\n");
'
}

# Append a large block of comment lines (for the size-budget mutation).
app_filler() {
  APP_FILE="$1" node -e '
const fs = require("fs");
const p = process.env.APP_FILE;
let s = fs.readFileSync(p, "utf8");
const marker = "// __reviewgate_filler";
if (s.includes(marker)) process.exit(0);
if (!s.endsWith("\n")) s += "\n";
s += marker + "\n";
for (let i = 0; i < 900; i++) s += "// filler " + i + "\n";
fs.writeFileSync(p, s);
'
}

# Judge only by exit code.
check() {
  local label="$1" expect="$2" mode="$3"; shift 3
  local rc
  if [ "$mode" = full ]; then
    node "$GATE" --base=HEAD "${IGNORE_ARGS[@]}" "$@" >/dev/null 2>&1
  else
    node "$GATE" --base=HEAD --no-gates "${IGNORE_ARGS[@]}" "$@" >/dev/null 2>&1
  fi
  rc=$?
  if [ "$expect" = kill ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    else
      echo "SURVIVED   exit=0   $label   <-- HOLE: this defect class is not covered"
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

# ── deterministic baseline ──────────────────────────────────────────────────
# Files already dirty in the working tree that this battery does not own are
# excluded from the diff. They are not modified.
PRE_DIRTY=$(git diff --name-only HEAD)
IGNORE_ARGS=(--ignore-path=__review-gate-never-matches__)
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$CONTROLLED" in *" $f "*) continue ;; esac
  IGNORE_ARGS+=(--ignore-path="$f")
done <<< "$PRE_DIRTY"

echo "baseline: excluding $((${#IGNORE_ARGS[@]} - 1)) unrelated working-tree edit(s)"

# ── RULE 1: never interpret mutations against an already-red baseline ────────
if ! node "$GATE" --base=HEAD --no-gates "${IGNORE_ARGS[@]}" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on an unmutated tree. Aborting: mutations cannot be interpreted."
  node "$GATE" --base=HEAD --no-gates "${IGNORE_ARGS[@]}" || true
  exit 1
fi
echo "baseline green"
backup_all

# ── S1 · secret scan ────────────────────────────────────────────────────────
app "$T_DIRTY" "const __lintmut_token = 'nfp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';"
check "S1  an nfp_ token in an added line" kill fast
restore_one "$T_DIRTY"

# ── S2 · size budget ────────────────────────────────────────────────────────
app_filler "$T_DIRTY"
check "S2  900 added lines (over the 800 hard limit)" kill fast
# E4 — the escape hatch must work, and the run must still be green.
check "E4  --allow-large lets a big change through" boundary fast --allow-large="mutation battery: bulk mechanical change"
restore_one "$T_DIRTY"

# ── S3 · risk attestation ───────────────────────────────────────────────────
app "$T_KERNEL" "// __reviewgate_kernel_touch"
check "S3  kernel touched, no --ack" kill fast
# E2 — the same tree with the acknowledgement must pass.
check "E2  kernel touched AND acknowledged" boundary fast --ack=kernel
restore_one "$T_KERNEL"

# ── S4 · env declaration ────────────────────────────────────────────────────
app "$T_DIRTY" "const __lintmut_env = process.env.REVIEW_GATE_LINTMUT_XYZ;"
check "S4  undeclared env var in src/" kill fast
restore_one "$T_DIRTY"

# ── S5 · migration rollback ─────────────────────────────────────────────────
# `--ack=migrations` is passed to BOTH cases so that R3 (the risk attestation,
# which a new migration also triggers) cannot be the reason either one fails.
# Without it, S5 would be "killed" for the wrong reason and E5 would look broken.
remove_migration
printf -- '-- added by the review-gate mutation battery\nCREATE INDEX IF NOT EXISTS idx_lintmut ON database_candidate (no_wa);\n' > "$T_NEWMIG"
git add -N "$T_NEWMIG"
check "S5  new migration with no rollback marker" kill fast --ack=migrations
# E5 — the same migration WITH a marker must pass.
printf -- '-- ROLLBACK: DROP INDEX IF EXISTS idx_lintmut;\nCREATE INDEX IF NOT EXISTS idx_lintmut ON database_candidate (no_wa);\n' > "$T_NEWMIG"
check "E5  new migration WITH a rollback marker" equivalent fast --ack=migrations
remove_migration

# ── S6 · lint on added lines ────────────────────────────────────────────────
app "$T_CLEAN" "export const __lintmut_any: any = 0;"
check "S6  'any' added to a previously CLEAN file" kill fast
restore_one "$T_CLEAN"

# ── E3 · the debt-aware boundary ────────────────────────────────────────────
app "$T_DIRTY" "export const __lintmut_any: any = 0;"
check "E3  'any' added to an ALREADY DIRTY file (reported, not blocked)" boundary fast
restore_one "$T_DIRTY"

# ── S7 · the gate runner itself ─────────────────────────────────────────────
# A class with no rule is silent everywhere except verify:classes, so this
# exercises R7 end to end: run the real gate list and see it fail on a real gate.
mut "$T_TSX" 'class="flex-1"' 'class="flex-1 text-slate-750"'
check "S7  a real gate fails -> R7 fails (full run)" kill full
restore_one "$T_TSX"

# ── G: the gate's own machinery ─────────────────────────────────────────────
# Each G step first puts a harmless comment into a controlled file. Without it
# the diff is empty — every unrelated working-tree edit is excluded — and the
# gate short-circuits with "Nothing to review", so the mutation under test never
# runs and the step reports SURVIVED against a gate that was never exercised.
# That is exactly how the first hardened draft of this battery lied.
app "$T_DIRTY" "// __reviewgate_g_step_anchor"
mut "$GATE" 'if (total > a.hardLines && !a.allowLarge) {' 'if (total >= 0) {'
check "G1  size failure branch forced (exit 1 reachable)" kill fast
restore_one "$GATE"

mut "$GATE" 're: /\bnfp_[A-Za-z0-9]{15,}/' 're: /./'
check "G2  secret pattern made trivial (scan reads added lines)" kill fast
restore_one "$GATE"
restore_one "$T_DIRTY"

# ── RULE 3: byte-identical restore, and green again ─────────────────────────
echo
for f in "${FILES[@]}"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done
if [ -e "$T_NEWMIG" ]; then
  echo "LEFTOVER — $T_NEWMIG survived the run"
  fail=1
fi
# Every file that was dirty before must still be dirty: proof the battery left
# other people's in-progress work exactly as it found it.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! git diff --name-only HEAD | grep -qxF "$f"; then
    echo "CLOBBERED — $f was modified before the battery and is no longer modified"
    fail=1
  fi
done <<< "$PRE_DIRTY"
if ! node "$GATE" --base=HEAD --no-gates "${IGNORE_ARGS[@]}" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

echo "killed:     $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived:   $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
echo "ok-green:   $(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN')"
echo "unexpected: $(printf '%s\n' "${results[@]}" | grep -c '^UNEXPECTED')"
rm_retry "$BAK"
exit "$fail"
