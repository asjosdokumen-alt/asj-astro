#!/usr/bin/env bash
# Mutation battery for scripts/ci/verify-aliases.mjs.
#
# WHY A BATTERY
# -------------
# A checker that cannot fail is worse than no checker. This gate exists because
# its PREDECESSOR was a checker that could not fail: it POSTed to the legacy
# catch-all paths and treated HTTP 200 as proof the path was still needed. A
# catch-all answers 200 to everything, so the check was a tautology — and 11
# unrestricted ~1.5 MB monoliths stayed deployed behind it.
#
# So this gate, of all gates, must be shown to fail. It is the second-generation
# fix for a fail-open checker; a fail-open second generation would be worse.
#
# DEFECT CLASSES, AND WHY EACH IS A SEPARATE CASE
# ----------------------------------------------
#   S1  a NON-allow-listed entry point calls makeHandler()   -> the core rule
#   S2  bridge-links.js itself is deleted                    -> the fallback check
#   S3  a .ts entry point is scanned (not just .js)          -> the glob
#   S4  a file in a SUBDIRECTORY is not mistaken for an entry -> scope
#   S5  an entry with BOTH markers is treated as surface-wrapped -> the `!` guard
#
# S5 is the subtle one. The rule is:
#     usesFullRouter = /\bmakeHandler\s*\(/ && !/\bmakeSurfaceHandler\b/
# Drop the `!` and a file that legitimately uses the surface wrapper but also
# mentions makeHandler() (a comment, a re-export) becomes a false positive. Keep
# it and the gate must NOT flag such a file — so S5 is checked as an OK-GREEN on
# the deliberate case and G1 proves the `!` is load-bearing.
#
# HOW THIS DIFFERS FROM THE OTHER BATTERIES
# -----------------------------------------
# Most batteries mutate an existing file. This gate's input is the SET of files
# under netlify/functions/, so the mutations CREATE AND DELETE entry points. A
# created file is removed on restore; `restore_one` cannot do that, so this
# battery tracks created files explicitly and deletes them in `cleanup`, then
# re-verifies the directory listing is byte-for-byte what it was.
#
# TRAPS, ALL THREE REAL, ALL GUARDED
# ----------------------------------
#  1. **The mutation silently fails to apply.** `plant` asserts the file did NOT
#     already exist (a leftover would make the "create" a no-op and the verdict
#     meaningless) and refuses to continue if it did. Gate patches go through a
#     helper FILE, never `node -e '...'`: the patterns contain backslashes
#     (`\s`, `\b`), and the inline form's escaping collapsed silently once
#     already — the mutation appeared to apply and did not.
#  2. **Judging by scraped output instead of the exit code.** `check` only reads
#     `$?`.
#  3. **An aborted run poisoning the next one.** This was not theoretical: an
#     abort during development left both a planted entry point AND a mutated
#     gate in the tree, and the next run reported BASELINE RED against a healthy
#     gate — the most confusing failure mode this battery can produce, because
#     it looks like the gate is broken rather than the harness. Guarded by
#     `trap cleanup EXIT` (restores the gate on every path) plus a name-prefix
#     `sweep()` that clears residue a PREVIOUS process left behind (`CREATED`
#     lives in-process, so a trap alone cannot see it).
#  4. **The backup laundering a poisoned file.** The corollary of 3, and the one
#     that actually bit: if the ORIGINAL is copied from the live tree, and the
#     live tree is already mutated, `cleanup` restores the poison for the whole
#     run. Backups are read from `git show HEAD:<path>`, which a working-tree
#     mutation cannot reach. See the comment at step 1.
#
# ORDERING, AND WHY IT IS LOAD-BEARING
# ------------------------------------
#   1. mkdir/cp        capture the gate from git HEAD before anything touches it
#   2. self-heal       restore a dirty gate; sweep zz-battery-* residue — LOUDLY
#   3. baseline check  only now is "red" meaningful
#   4. mutations
#   5. restore proof   byte-identical gate, listing diff, green again
#
# Steps 1–2 are the harness cleaning up after ITSELF. Step 3 comes last on
# purpose: a red baseline after the harness has swept its own litter is a real
# gate failure, not a harness artifact, and the battery stops instead of
# printing verdicts it cannot interpret.
#
# Must be run with cwd = repo root:  bash scripts/ci/verify-aliases.mutations.sh
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

GATE=scripts/ci/verify-aliases.mjs
FNDIR=netlify/functions
BAK=.tmp-aliasmut
fail=0
results=()
CREATED=()

# Snapshot the directory listing so the restore can be proven, not assumed.
LISTING_BEFORE=$BAK/listing.before

# ── 1 · Capture the gate first, so `cleanup` always has something to restore ─
#
# The backup comes from GIT (HEAD), never from the live file.
#
# Copying the live file looks equivalent and is not. If a previous run aborted
# with a mutation still applied, `cp "$GATE" "$BAK/gate.orig"` faithfully copies
# the POISON, and `cleanup` then spends the rest of the run restoring it — the
# harness launders a broken gate into looking intentional. Encountered for real
# on 2026-09-15: an aborted run left line 85 as
#     const usesFullRouter = /\bmakeHandler\s*\(/.test(src);
# (the `&& !makeSurfaceHandler` half gone). The next run reported BASELINE RED
# naming four files when only two were actually violating — because the mutated
# gate flagged every file that merely MENTIONED makeHandler() in a comment.
#
# `git show HEAD:` cannot be poisoned by a working-tree mutation.
#
# WHY `cp` IS CORRECT FOR THE GATE AND WRONG FOR bridge-links.js
# -------------------------------------------------------------
# .gitattributes pins `*.mjs`/`*.cjs` to `eol=lf`, so the gate's working-tree
# bytes ARE the git blob's bytes and `cp` from this backup is exactly right.
# netlify/functions/*.js is NOT pinned, so with core.autocrlf=true its working
# copy is CRLF while the blob is LF — there `cp` would rewrite the line endings
# and leave a phantom modification. That file is restored with
# `git checkout HEAD --`, which honours the attributes. Both restore a pristine
# copy; each does it the way its file's attributes require.
mkdir -p "$BAK"
if ! git show "HEAD:$GATE" > "$BAK/gate.orig" 2>/dev/null; then
  echo "ABORT: cannot read $GATE from git HEAD — is the file tracked?"
  exit 1
fi

cleanup() {
  for f in "${CREATED[@]:-}"; do [ -n "$f" ] && rm_retry "$f"; done
  # Restore the gate on EVERY exit path, including aborts. Without this a mid-run
  # abort leaves a mutated gate behind and the next run reports BASELINE RED.
  [ -f "$BAK/gate.orig" ] && cp "$BAK/gate.orig" "$GATE"
}
trap cleanup EXIT

# ── 2 · Self-heal the harness's OWN litter, and SAY SO ───────────────────────
#
# Both of these are the battery's responsibility, not the gate's, so both are
# repaired rather than treated as a finding — but each is reported loudly,
# because a silent repair is how "the baseline was never actually clean"
# gets laundered into a green run.
#
#   (a) The GATE SOURCE is dirty — a previous aborted run left a mutation in it.
#       Pristine copy comes from git, which a working-tree mutation cannot reach.
#   (b) The FUNCTIONS DIRECTORY holds leftover zz-battery-* entry points. The
#       prefix is reserved for this battery, so a sweep cannot touch real files.
#
# Only after both is the baseline meaningful. A red baseline from here means
# something the harness did NOT cause, and that is worth stopping for.
if ! diff -q "$BAK/gate.orig" "$GATE" >/dev/null 2>&1; then
  echo "NOTE: $GATE was dirty on entry (a previous run left it mutated)."
  echo "      Restoring the pristine copy from git HEAD before measuring."
  cp "$BAK/gate.orig" "$GATE"
fi

sweep() {
  rm_retry "$FNDIR"/zz-battery-*.js "$FNDIR"/zz-battery-*.ts 2>/dev/null
  rm_retry "$FNDIR"/zz-battery-sub 2>/dev/null
}
if ls -1 "$FNDIR" 2>/dev/null | grep -q '^zz-battery-'; then
  echo "NOTE: leftover zz-battery-* entry points from a previous aborted run. Sweeping."
fi
sweep

# ── 3 · RULE: never interpret mutations against an already-red baseline ─────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on a tree the harness has already cleaned."
  echo "  This is NOT residue (both classes were just swept) and not a stale"
  echo "  mutation (the gate was re-read from HEAD). It is a real gate failure."
  echo "  Fix the gate before trusting any verdict from this battery."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"

# ── 4 · The mutation primitives ─────────────────────────────────────────────
plant() {
  local path="$1" body="$2"
  if [ -e "$path" ]; then
    echo "ABORT: '$path' already exists — planting would be a no-op."
    exit 1
  fi
  printf '%s' "$body" > "$path"
  CREATED+=("$path")
}

drop() {
  local path="$1"
  rm_retry "$path"
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

ls -1 "$FNDIR" | sort > "$LISTING_BEFORE"

# ── S1 · a non-allow-listed entry point reaching for the full router ─────────
plant "$FNDIR/zz-battery-fullrouter.js" 'import { makeHandler } from "./_lib/netlify-wrapper.js";
export const handler = makeHandler();
'
check "S1  non-allow-listed entry calls makeHandler()" kill
drop "$FNDIR/zz-battery-fullrouter.js"

# ── S2 · the documented fallback target disappears ──────────────────────────
#
# Backup and restore go through GIT, never through `cp` of the live file.
#
# `cp` looks harmless and is not, on this repo: core.autocrlf=true and
# .gitattributes pins only *.mjs/*.cjs to LF, so netlify/functions/*.js lives as
# CRLF in the working tree while git stores LF. `git show` therefore emits a
# backup whose LINE ENDINGS differ from the live file, and copying it back
# leaves `bridge-links.js` as a phantom modification (` M` in git status) after
# every battery run — the battery altering a file it merely borrowed.
#
# `git checkout HEAD -- <path>` respects the attributes/autocrlf settings and is
# the only restore that returns the working tree to exactly what it was. It is
# also immune to a poisoned working copy, for the same reason `git show` is.
git checkout HEAD -- "$FNDIR/bridge-links.js"
cp "$FNDIR/bridge-links.js" "$BAK/bridge-links.js.orig"
rm_retry "$FNDIR/bridge-links.js"
check "S2  bridge-links.js (the fallback) is missing" kill
git checkout HEAD -- "$FNDIR/bridge-links.js"

# ── S3 · the glob covers .ts, not only .js ──────────────────────────────────
plant "$FNDIR/zz-battery-fullrouter.ts" 'import { makeHandler } from "./_lib/netlify-wrapper";
export const handler = makeHandler();
'
check "S3  a .ts entry point is scanned by the glob" kill
drop "$FNDIR/zz-battery-fullrouter.ts"

# ── S4 · subdirectories are not mistaken for entry points ───────────────────
mkdir -p "$FNDIR/zz-battery-sub"
plant "$FNDIR/zz-battery-sub/inner.js" 'export const handler = makeHandler();
'
check "S4  a file under a subdirectory is not an entry point" equivalent
drop "$FNDIR/zz-battery-sub/inner.js"
rm_retry "$FNDIR/zz-battery-sub"

# ── S5 · an entry using the narrow wrapper is never flagged ─────────────────
plant "$FNDIR/zz-battery-narrow.js" 'import { makeSurfaceHandler } from "./_lib/netlify-wrapper-surface.js";
export const handler = makeSurfaceHandler(["getAppData"], ["public"]);
'
check "S5  narrow surface entry stays green" equivalent
drop "$FNDIR/zz-battery-narrow.js"

# ── E1 / E2 · legitimate growth and the equivalent-marker case ──────────────
plant "$FNDIR/zz-battery-new.js" 'import { makeSurfaceHandler } from "./_lib/netlify-wrapper-surface.js";
export const ACTIONS = ["getMasterData"];
export const handler = makeSurfaceHandler(ACTIONS, ["master"]);
'
check "E1  a valid new narrow entry point is accepted" equivalent
drop "$FNDIR/zz-battery-new.js"

plant "$FNDIR/zz-battery-comment.js" 'import { makeSurfaceHandler } from "./_lib/netlify-wrapper-surface.js";
// Predecessor used makeHandler() here; do not go back to it.
export const handler = makeSurfaceHandler(["getAppData"], ["public"]);
'
check "E2  surface entry that only MENTIONS makeHandler() in a comment" equivalent
drop "$FNDIR/zz-battery-comment.js"

# ── G · the gate's own machinery ────────────────────────────────────────────
# The gate source is patched by a helper SCRIPT FILE, not by `node -e '...'`.
# The inline form was tried first and failed: the patterns contain backslashes
# (`\s`, `\b`) inside a single-quoted shell argument inside a Node program, and
# the escaping collapsed silently. The mutation appeared to apply and did not —
# exactly the "mutation never landed" trap this battery guards against, this
# time in the battery's own plumbing. A file on disk has no shell in the way.
patch_gate() {
  node scripts/ci/alias-gate-patcher.mjs "$1" "$2"
}

# The patcher is part of the battery, not scratch space: it must be present in
# the repo. A missing one used to surface as a raw MODULE_NOT_FOUND stack from
# Node, which reads like a broken battery rather than a missing dependency.
PATCHER=scripts/ci/alias-gate-patcher.mjs
if [ ! -f "$PATCHER" ]; then
  echo "ABORT: $PATCHER is missing — it ships with this battery. Commit it."
  exit 1
fi

# G1 — drop the `!makeSurfaceHandler` half of the rule.
# WITH the `!`: a file that uses the surface wrapper AND mentions makeHandler()
# (in a comment, a re-export) is correctly NOT flagged. WITHOUT it: flagged.
# So planting such a file proves the guard is load-bearing.
if patch_gate 'test(src) && !/\bmakeSurfaceHandler\b/.test(src)' 'test(src)'; then
  plant "$FNDIR/zz-battery-comment.js" 'import { makeSurfaceHandler } from "./_lib/netlify-wrapper-surface.js";
// Predecessor used makeHandler() here; do not go back to it.
export const handler = makeSurfaceHandler(["getAppData"], ["public"]);
'
  check "G1  dropping the \`!\` guard flags comment-only files" kill
  drop "$FNDIR/zz-battery-comment.js"
else
  echo "ABORT: G1 gate mutation did not apply."
  cp "$BAK/gate.orig" "$GATE"
  exit 1
fi
cp "$BAK/gate.orig" "$GATE"

# G2 — prove the violation-detection path is not a no-op.
#
# The first draft of this case patched `process.exit(1)` to `process.exit(0)`
# and expected a KILL. That was wrong, and the battery's own baseline-red rule
# is why it surfaced: with the violation still detected, patching the exit code
# makes the gate exit 0 — which is the CORRECT consequence of that mutation, not
# a hole. A mutation that makes a failing gate pass is not evidence of anything
# unless the mutation is one that SHOULD make it pass.
#
# The real question is "is the detection condition load-bearing, or does the gate
# print a verdict it did not compute?". So the mutation disables the recording
# branch for the core rule, and a genuine full-router violation must then slip
# through with exit 0. That outcome is asserted as `equivalent` — green is the
# CORRECT answer for this mutation, and the three S-cases above going red for a
# real violation is what demonstrates the condition does the work.
if patch_gate 'if (usesFullRouter && !FULL_ROUTER_ALLOWED.has(name)) {' 'if (false) {'; then
  plant "$FNDIR/zz-battery-fullrouter.js" 'import { makeHandler } from "./_lib/netlify-wrapper.js";
export const handler = makeHandler();
'
  check "G2  disabling violations.push makes a real violation undetected" equivalent
  drop "$FNDIR/zz-battery-fullrouter.js"
else
  echo "ABORT: G2 gate mutation did not apply."
  cp "$BAK/gate.orig" "$GATE"
  exit 1
fi
cp "$BAK/gate.orig" "$GATE"

# ── 5 · RULE: byte-identical restore, and green again ───────────────────────
# `cleanup` removes every file this run CREATED (the planted entry points) and
# copies the git-sourced gate back. Then the listing must match the snapshot
# taken before the first mutation — that is what proves the directory is not
# merely "passing", but actually unchanged.
echo
cleanup
CREATED=()

if ! diff -q "$BAK/gate.orig" "$GATE" >/dev/null; then
  echo "RESTORE FAILED — $GATE is not byte-identical to its backup"
  fail=1
fi
if ! diff -q "$BAK/bridge-links.js.orig" "$FNDIR/bridge-links.js" >/dev/null; then
  echo "RESTORE FAILED — bridge-links.js is not byte-identical to its backup"
  fail=1
fi

# The property that actually matters: after the run, git must see NO change in
# the files this battery borrowed. Comparing against a local backup is not
# enough — the gate backup comes from `git show` (LF) and a `cp`-based restore
# leaves a phantom CRLF modification that a backup-to-backup diff cannot see.
# Found exactly that way on 2026-09-15: the battery reported a clean restore
# while `git status` showed netlify/functions/bridge-links.js as modified, every
# run. Git is the only witness that catches it.
TREE_DIRTY=$(git status --porcelain -- "$GATE" "$FNDIR/bridge-links.js" | grep -v '^??' || true)
if [ -n "$TREE_DIRTY" ]; then
  echo "RESTORE FAILED — the battery left a tracked file modified:"
  echo "$TREE_DIRTY" | sed 's/^/    /'
  echo "  A borrowed file must come back byte-identical in the WORKING TREE, not"
  echo "  merely equal to a backup. Check for an EOL change (core.autocrlf)."
  fail=1
fi

ls -1 "$FNDIR" | sort > "$BAK/listing.after"
if ! diff -q "$LISTING_BEFORE" "$BAK/listing.after" >/dev/null; then
  echo "RESTORE FAILED — the entry-point listing changed during the run:"
  diff "$LISTING_BEFORE" "$BAK/listing.after" | sed 's/^/    /'
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
