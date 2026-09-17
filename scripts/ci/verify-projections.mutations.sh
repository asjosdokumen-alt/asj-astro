#!/usr/bin/env bash
# Mutation battery for scripts/ci/verify-projections.mjs.
#
# WHY A BATTERY
# -------------
# This gate enforces "zero `select=*` in the codebase", and it was written to
# replace a signal that could not be trusted: the runtime already rewrites a
# wildcard projection into an explicit column list, so a call site ASKING for
# `*` is invisible at runtime and only visible in source. The gate is the only
# place that signal exists. If it cannot fail, the signal is gone.
#
# WHAT IT ALREADY CAUGHT (why this battery was worth writing)
# ----------------------------------------------------------
# The gate passed VACUOUSLY. With netlify/functions/ empty it printed
#     NO WILDCARD PROJECTIONS  0 files scanned under netlify/functions/
# and exited 0 — a green verdict on zero evidence, in exactly the build where
# nobody is looking. verify-aliases.mjs already guarded this; the omission here
# was an inconsistency, not a decision. Fixed, and case V1 below pins it so it
# cannot come back.
#
# DEFECT CLASSES, AND WHY EACH IS A SEPARATE CASE
# ----------------------------------------------
#   D1  `select: '*'` in a real call site                    -> the core rule
#   D2  `select: "*"` (double quotes)                        -> the quote class
#   D3  a wildcard on a `select:` inside a BLOCK comment     -> must NOT flag
#   D4  a wildcard on a `select:` inside a LINE comment      -> must NOT flag
#
# D3/D4 are checked as OK-GREEN, not KILLED: the gate deliberately strips
# comments, because a docblock that explains "never write select: '*' here"
# must not itself trip the check. Getting that backwards would make the gate
# punish documentation.
#
# THE SUBTLE CASE
# ---------------
#  T1  `select: CAND_MAP_COLS` (a named constant) and `select: 'id,no_wa'`
#      (an explicit list) must both stay green. The rule is "is the VALUE a
#      bare wildcard", not "does the line contain an asterisk" — a gate that
#      flagged any `*` would be unusable and would be turned off.
#
# TRAPS, ALL THREE REAL, ALL GUARDED
# ----------------------------------
#  1. **The mutation silently fails to apply.** `plant` refuses to overwrite an
#     existing file, and the gate mutation goes through a helper FILE rather
#     than `node -e '...'` (backslash patterns collapsed silently once already).
#  2. **Judging by scraped output instead of the exit code.** `check` reads `$?`
#     only. This matters more than usual here: the gate's success message and
#     its vacuous-pass message were once the SAME message with a different
#     count, so text is a particularly bad witness for this gate.
#  3. **An aborted run poisoning the next one.** Guarded two ways: `trap cleanup
#     EXIT` restores the gate on every path, and a `zz-battery-` prefix sweep
#     clears files a previous PROCESS left behind. Backups come from `git show
#     HEAD:<path>`, never from the live file — copying a poisoned live file
#     would launder it back into place.
#
# EOL TRAP, SPECIFIC TO THIS DIRECTORY
# ------------------------------------
# netlify/functions/*.ts is NOT pinned by .gitattributes (only *.mjs/*.cjs are),
# so with core.autocrlf=true the working copy is CRLF while the git blob is LF.
# Restore therefore uses `git checkout HEAD --` for anything under that tree,
# and the final check asserts GIT sees no modification — comparing against a
# local backup cannot detect an EOL rewrite.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/verify-projections.mutations.sh
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

GATE=scripts/ci/verify-projections.mjs
FNDIR=netlify/functions
BAK=.tmp-projmfut
fail=0
results=()
CREATED=()

# ── 1 · Capture the gate from git before anything can touch it ──────────────
mkdir -p "$BAK"
if ! git show "HEAD:$GATE" > "$BAK/gate.orig" 2>/dev/null; then
  echo "ABORT: cannot read $GATE from git HEAD — is the file tracked?"
  exit 1
fi
# `.mjs` is pinned eol=lf, so the blob's bytes are the working tree's bytes and
# `cp` from this backup is exactly right.
cleanup() {
  for f in "${CREATED[@]:-}"; do [ -n "$f" ] && rm_retry "$f"; done
  [ -f "$BAK/gate.orig" ] && cp "$BAK/gate.orig" "$GATE"
}
trap cleanup EXIT

# ── 2 · Self-heal the harness's own litter, and SAY SO ──────────────────────
if ! diff -q "$BAK/gate.orig" "$GATE" >/dev/null 2>&1; then
  echo "NOTE: $GATE was dirty on entry (a previous run left it mutated)."
  echo "      Restoring the pristine copy from git HEAD before measuring."
  cp "$BAK/gate.orig" "$GATE"
fi

sweep() {
  rm_retry "$FNDIR"/zz-battery-*.ts "$FNDIR"/zz-battery-*.tsx "$FNDIR"/zz-battery-*.js 2>/dev/null
  rm_retry "$FNDIR"/zz-battery-sub 2>/dev/null
}
if ls -1 "$FNDIR" 2>/dev/null | grep -q '^zz-battery-'; then
  echo "NOTE: leftover zz-battery-* sources from a previous aborted run. Sweeping."
fi
sweep

# ── 3 · RULE: never interpret mutations against an already-red baseline ─────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on a tree the harness has already cleaned."
  echo "  Not residue (swept) and not a stale mutation (re-read from HEAD)."
  echo "  This is a real gate failure. Fix it before trusting any verdict here."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"

# ── 4 · Mutation primitives ─────────────────────────────────────────────────
plant() {
  local path="$1" body="$2"
  if [ -e "$path" ]; then
    echo "ABORT: '$path' already exists — planting would be a no-op."
    exit 1
  fi
  printf '%s' "$body" > "$path"
  CREATED+=("$path")
}

drop() { rm_retry "$1"; }

check() {
  local label="$1" expect="$2" rc
  node "$GATE" >/dev/null 2>&1
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

# Snapshot the top level of the scanned tree so the restore can be proven, not
# assumed. Taken AFTER the sweep, so residue is not mistaken for unchanged
# state — and this battery renames the whole directory (case V1), so proving the
# listing came back is not ceremony.
ls -1 "$FNDIR" | sort > "$BAK/listing.before"

# ── D1 · the core rule ──────────────────────────────────────────────────────
plant "$FNDIR/zz-battery-wildcard.ts" 'export const q = { select: '"'"'*'"'"' };
'
check "D1  select: '*' in a call site is flagged" kill
drop "$FNDIR/zz-battery-wildcard.ts"

# ── D2 · the quote class ────────────────────────────────────────────────────
# The pattern uses a backreference (`\1`) so only a MATCHED pair trips it.
# Double quotes must therefore behave exactly like single quotes.
plant "$FNDIR/zz-battery-dquote.ts" 'export const q = { select: "*" };
'
check "D2  select: \"*\" (double quotes) is flagged" kill
drop "$FNDIR/zz-battery-dquote.ts"

# ── D3/D4 · documentation must not trip the gate ────────────────────────────
plant "$FNDIR/zz-battery-blockcomment.ts" '/*
 * Do not write select: '"'"'*'"'"' here — it is ~1.14 KB per row.
 */
export const q = { select: '"'"'id,no_wa'"'"' };
'
check "D3  a wildcard inside a BLOCK comment is not flagged" equivalent
drop "$FNDIR/zz-battery-blockcomment.ts"

plant "$FNDIR/zz-battery-linecomment.ts" '// Never use select: '"'"'*'"'"' on this table.
export const q = { select: '"'"'id,no_wa'"'"' };
'
check "D4  a wildcard inside a LINE comment is not flagged" equivalent
drop "$FNDIR/zz-battery-linecomment.ts"

# ── T1 · the named-constant and explicit-list forms ─────────────────────────
plant "$FNDIR/zz-battery-constant.ts" 'import { CAND_MAP_COLS } from "./_lib/db/projections";
export const a = { select: CAND_MAP_COLS };
export const b = { select: '"'"'id,no_wa,no_pendaftaran'"'"' };
'
check "T1  a named constant and an explicit list both pass" equivalent
drop "$FNDIR/zz-battery-constant.ts"

# ── V1 · the vacuous-pass guard (the bug this battery found) ────────────────
# An empty but PRESENT directory must NOT be reported as a pass. This is the
# one case that reproduces a defect found in the wild rather than a hypothetical
# one: the gate used to exit 0 here, printing a green line over zero evidence.
#
# The directory is renamed aside, an empty one put in its place, and the gate
# must exit 2. `kill` is the expectation because ANY non-zero code is correct
# here — the point is that it refuses to pass.
if [ -e "$FNDIR" ]; then
  mv "$FNDIR" "$BAK/functions.real"
  mkdir -p "$FNDIR"
  check "V1  an empty netlify/functions/ is refused, not passed" kill
  # `rmdir`, NOT `rm_retry`: $FNDIR is `netlify/functions`, a REAL tracked
  # directory, and what stands there right now is the empty placeholder this
  # battery put in its place. `rmdir` refuses to remove a non-empty directory,
  # which is the safety property that stops a bug here from deleting the real
  # one; `rm_retry` would happily `rm -rf` it. The other three fixture-directory
  # clean-ups in this tree ARE `rm_retry` -- this one is the exception, on
  # purpose.
  rmdir "$FNDIR"
  mv "$BAK/functions.real" "$FNDIR"
else
  echo "ABORT: $FNDIR is missing — V1 needs it to exist before the swap."
  exit 1
fi

# ── G · the gate's own machinery ────────────────────────────────────────────
# Patched by a helper FILE, not `node -e '...'`: the patterns contain
# backslashes (`\s`, `\1`) that did not survive shell + Node escaping, and the
# mutation applied to nothing while the battery reported a verdict anyway.
PATCHER=scripts/ci/projections-gate-patcher.mjs
if [ ! -f "$PATCHER" ]; then
  echo "ABORT: $PATCHER is missing — it ships with this battery. Commit it."
  exit 1
fi
patch_gate() { node "$PATCHER" "$1" "$2"; }

# G1 — drop the comment-stripping pass.
# WITH it: a documented `select: '*'` in a docblock is correctly ignored.
# WITHOUT it: the gate punishes the very documentation that explains the rule.
# So planting a block-comment-only file proves the pass is load-bearing.
if patch_gate 'return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '"'"' '"'"'));' 'return src;'; then
  plant "$FNDIR/zz-battery-blockcomment.ts" '/*
 * Do not write select: '"'"'*'"'"' here — it is ~1.14 KB per row.
 */
export const q = { select: '"'"'id,no_wa'"'"' };
'
  check "G1  dropping comment-stripping flags documentation" kill
  drop "$FNDIR/zz-battery-blockcomment.ts"
else
  echo "ABORT: G1 gate mutation did not apply."
  cp "$BAK/gate.orig" "$GATE"
  exit 1
fi
cp "$BAK/gate.orig" "$GATE"

# G2 — disable the recording of a hit.
# This is the decisive mutation for the failure mode that matters most here:
# the success path is `hits.length === 0`, so a gate that DETECTS but does not
# RECORD prints a green line over a real wildcard. With `hits.push` removed, a
# genuine `select: '*'` must exit 0 — which is the CORRECT consequence of this
# mutation, and therefore asserted as `equivalent`. What makes it decisive is
# the pairing: D1 and D2 go red for the same input WITHOUT the mutation, so the
# line is provably load-bearing.
if patch_gate 'hits.push({ file:' 'void 0 && hits.push({ file:'; then
  plant "$FNDIR/zz-battery-wildcard.ts" 'export const q = { select: '"'"'*'"'"' };
'
  check "G2  a detected-but-unrecorded hit passes (proves hits.push is load-bearing)" equivalent
  drop "$FNDIR/zz-battery-wildcard.ts"
else
  echo "ABORT: G2 gate mutation did not apply."
  cp "$BAK/gate.orig" "$GATE"
  exit 1
fi
cp "$BAK/gate.orig" "$GATE"

# ── 5 · RULE: byte-identical restore, and green again ───────────────────────
echo
cleanup
CREATED=()

if ! diff -q "$BAK/gate.orig" "$GATE" >/dev/null; then
  echo "RESTORE FAILED — $GATE is not byte-identical to its backup"
  fail=1
fi

ls -1 "$FNDIR" | sort > "$BAK/listing.after"
if [ -f "$BAK/listing.before" ] && ! diff -q "$BAK/listing.before" "$BAK/listing.after" >/dev/null; then
  echo "RESTORE FAILED — the source listing changed during the run:"
  diff "$BAK/listing.before" "$BAK/listing.after" | sed 's/^/    /'
  fail=1
fi

# The property that actually matters: git must see NO change in the files this
# battery borrowed. A backup-to-backup diff cannot detect an EOL rewrite, and
# this directory is NOT pinned by .gitattributes.
TREE_DIRTY=$(git status --porcelain -- "$GATE" "$FNDIR" | grep -v '^??' || true)
if [ -n "$TREE_DIRTY" ]; then
  echo "RESTORE FAILED — the battery left a tracked file modified:"
  echo "$TREE_DIRTY" | sed 's/^/    /'
  echo "  A borrowed file must come back identical in the WORKING TREE. Check for"
  echo "  an EOL change (core.autocrlf + no .gitattributes pin in this directory)."
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
rm_retry "$BAK"
exit "$fail"
