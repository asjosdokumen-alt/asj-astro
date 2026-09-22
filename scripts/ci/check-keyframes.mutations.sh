#!/usr/bin/env bash
# Mutation battery for scripts/ci/check-keyframes.mjs (`npm run verify:keyframes`).
#
# WHY A BATTERY
# -------------
# The gate exists because the per-section motion plan (`src/lib/sectionMotion.ts`
# -> `data-motion` attribute -> an `animation:` declaration in motion.css) joins
# three files by STRING. A typo anywhere in that chain produces a name CSS cannot
# resolve, and CSS is silent about it: an unknown `animation-name` is dropped, the
# element simply does not animate, no error is logged and no build step notices —
# and every existing assertion still passes, because all the mascot rules declare
# TWO names and only one of them has to resolve for "an animation is running" to
# stay true.
#
# That is the same invisible-incompleteness shape the icon sprite has, and the
# same shape that cost this repository real time twice before. So the gate gets a
# battery, and the battery gets cases for both the ways the gate could be wrong:
# it could MISS a dangling name (under-strict), or it could reject a name that is
# legitimately defined (over-strict) — the second is what the OK-GREEN controls
# are for.
#
# HOW THIS BATTERY WORKS
# ----------------------
# It mutates ONE file, `src/styles/motion.css`, and restores it from a copy taken
# at the start. The gate reads no other input and needs no build, so every case is
# a few milliseconds.
#
# ⚠ THE RESTORE IS THE DANGEROUS PART, AND IT IS NOT ASSUMED.
# `motion.css` is a tracked source file carrying this session's work. A battery
# that fails to restore it would leave the tree holding a deliberate typo, and the
# next thing measured would be about the wrong bytes — the exact defect recorded
# for `verify:projections` (a stale backup made every "restore" reinstall the
# mutant). So the backup is taken OUTSIDE the repository (in the OS temp
# directory) where no sweep can reach it, and the restore is verified with `cmp`
# against the backup rather than trusted. The trap restores on every exit path.
#
# THE CASES
# ---------
#   M1  rename the @keyframes for `look`            -> exit 1, names motion.css
#   M2  rename ONE character of the `lean` idle     -> exit 1
#   M3  delete an entire idle rule mid-file         -> exit 1
#   M4  rename the @keyframes for `sway` (the
#       SLOW path, 0,1,0, no attribute)             -> exit 1
#   G1  OK-GREEN — the file as committed            -> exit 0  (proves the gate is
#       not "any edit fails"; without this a gate that always failed would score
#       4/4 above)
#   G2  OK-GREEN — a rename of a DEFINED-BY-ANOTHER-FILE name must still resolve.
#   G3  OK-GREEN — adding a redundant, correctly-spelled reference passes.
#       This is the false-positive guard for the over-inclusive parser: the gate
#       deliberately reads every `animation:`/`animation-name:` token that starts
#       with one of our prefixes, so it must not fail on a legitimate one.
#   G4  OK-GREEN — a defined-but-UNREFERENCED keyframe must NOT be an error.
#       `mascot-enter` is kept on purpose (the documented JS-gamefeel step adds it
#       back); a gate that failed on it would be demanding the deletion of code a
#       documented next step depends on. Renaming it here proves the gate ignores
#       the "unused" direction.
#
# Run from anywhere:  bash scripts/ci/check-keyframes.mutations.sh
# Exit 0 only when every case behaves as declared.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 2

GATE="scripts/ci/check-keyframes.mjs"
TARGET="src/styles/motion.css"

if [ ! -f "$GATE" ]; then
  echo "FATAL: $GATE not found (run from the repository root)"
  exit 2
fi
if [ ! -f "$TARGET" ]; then
  echo "FATAL: $TARGET not found — nothing to mutate"
  exit 2
fi

# ── The backup, OUTSIDE the repository ─────────────────────────────────────
# `mktemp` again, and for the same two reasons as the workflows battery: MSYS
# returns a path node cannot open, and a backup INSIDE the repo is either an
# untracked leak (seen by sweepLeaks) or `.tmp-*` scratch (deleted mid-run by
# sweepScratch). Outside the tree it is neither.
#
# It is only ever used by bash here, so the MSYS/native split that broke the
# workflows battery does not apply — but the reachability of the DIRECTORY is
# still asserted, because a backup that silently went nowhere turns every
# restore below into "cp failed, carry on", i.e. a tree left holding mutation M1.
BAK_DIR="$(mktemp -d 2>/dev/null)" || { echo "FATAL: mktemp -d failed"; exit 2; }
if [ ! -d "$BAK_DIR" ]; then
  echo "FATAL: backup directory '$BAK_DIR' is not a directory — refusing to mutate"; exit 2
fi
BAK="$BAK_DIR/motion.css.orig"
cp -- "$TARGET" "$BAK" || { echo "FATAL: could not back up $TARGET"; exit 2; }
if ! cmp -s -- "$TARGET" "$BAK"; then
  echo "FATAL: the backup is not byte-identical to the file it copied. Aborting."
  exit 2
fi

# ── THE RESTORE, AND THE TWO BUGS THAT MADE IT SILENTLY USELESS ────────────
#
# BUG 1 — `printf` ATE THE BODY.
# The message below used to be built with `printf 'gem verbatim ...'`, and a
# stray `%s` inside that string made printf consume the FOLLOWING ARGUMENTS as
# substitutions. The visible symptom was a restore message printed with its
# words missing; the real damage was that the trap ran the malformed call and
# returned WITHOUT restoring. Nothing failed, nothing was logged as an error,
# and the next case then measured the previous case's mutation. `echo` is used
# here for exactly that reason: it does not interpret its argument.
#
# BUG 2 — THE CALLER'S `|| { ...; exit 2; }` SKIPPED THE RESTORE.
# The first version of `mutate` aborted with `exit 2`, which DOES run this trap.
# But the shipped version used `return 1`, and a `return` inside the case body
# does not run the trap at all, so the abort left the mutation installed. That is
# how this battery reported:
#
#     mutate FAILED
#     M2 SURVIVED  want exit 1, got 0        <- measured M1's damage
#     M3 FAIL: mascot-lean (motion.css:886)  <- M2's damage, blamed on M3
#
# None of those three lines was about the gate. The caller now calls `reset`
# explicitly on the abort path and this trap covers signals and the final exit.
restore() {
  cp -- "$BAK" "$TARGET" 2>/dev/null || true
  if cmp -s -- "$TARGET" "$BAK"; then
    rm -rf -- "$BAK_DIR" 2>/dev/null || true
  else
    echo ""
    echo "!! RESTORE FAILED - $TARGET does NOT match its backup."
    echo "   The backup is still at: $BAK"
    echo "   Copy it back by hand BEFORE doing anything else:"
    echo "     cp  $BAK  $TARGET"
    echo "   Anything measured after this point is about the wrong bytes."
  fi
}
trap restore EXIT

pass=0
fail=0

# The gate's output from the last run, for the `expect` needle check.
#
# DECLARED HERE, AND THAT IS NOT COSMETIC. `set -u` is on, and a variable first
# ASSIGNED inside `run_gate()` — which `expect` calls in a COMMAND SUBSTITUTION
# — is assigned in a SUBSHELL and therefore never reaches the parent. The needle
# check then hit `LAST_OUT: unbound variable`, the message it should have printed
# was replaced by that shell error, and both cases reported SURVIVED while the
# gate was in fact exiting 1 correctly. A battery reporting SURVIVED is
# indistinguishable from a hole in the gate, so this bug would have been
# investigated as a gate defect.
LAST_OUT=""

# run_gate -> echoes the gate's exit code. It also assigns LAST_OUT, which is why
# the caller must use it as `got="$(run_gate)"` and read LAST_OUT afterwards — the
# assignment happens in the subshell and travels back through the echo, not
# through the variable. The needle check therefore relies on the DECLARATION
# above being a variable `expect` already owns; the value is set here for the
# `expect` form that does not capture. Command substitution with an explicit `$?`
# capture: `npm run $g | tail` would report TAIL's status, which is this repo's
# recorded trap and would make every case look killed.
run_gate() {
  local out code
  out="$(node "$GATE" 2>&1)"
  code=$?
  printf '%s' "$out" > "$BAK_DIR/last-out.txt"
  echo "$code"
}

# expect <label> <want-exit> [<substring-that-must-appear>]
expect() {
  local label="$1" want="$2" needle="${3:-}" got
  got="$(run_gate)"
  # Read back from the file `run_gate` wrote, not from a variable — the
  # command-substitution subshell above cannot assign one. See the note on
  # LAST_OUT.
  LAST_OUT="$(cat "$BAK_DIR/last-out.txt" 2>/dev/null || true)"
  if [ "$got" != "$want" ]; then
    printf '  SURVIVED %-52s want exit %s, got %s\n' "$label" "$want" "$got"
    printf '           last output: %s\n' "$(printf '%s' "$LAST_OUT" | head -3 | tr '\n' '|')"
    fail=$((fail + 1))
    return
  fi
  if [ -n "$needle" ] && ! printf '%s' "$LAST_OUT" | grep -qF -- "$needle"; then
    printf '  SURVIVED %-52s exit %s but output never mentions %s\n' "$label" "$got" "$needle"
    printf '           last output: %s\n' "$(printf '%s' "$LAST_OUT" | head -3 | tr '\n' '|')"
    fail=$((fail + 1))
    return
  fi
  printf '  KILLED   %-52s exit %s\n' "$label" "$got"
  pass=$((pass + 1))
}

# ── THE RESTORE IS A FUNCTION, AND EVERY CASE MUST CALL IT ─────────────────
#
# ── WHY THIS IS NOT `restore; cp -- "$BAK" "$TARGET"` ANY MORE ─────────────
# It was, and that is how this battery lied. An early version of `mutate` did
# `|| { echo FATAL; exit 2; }` — and `exit` runs the EXIT trap, which restores.
# But `cd`-driven experiments aside, the version that shipped used `return 1`,
# which does NOT run the trap. So when one case's mutation failed to apply, that
# case carried on with the PREVIOUS case's mutation still installed, and the
# next `expect` measured the wrong bytes and printed a failure naming a name the
# case had not touched:
#
#     mutate FAILED                                    <- M2's mutation never applied
#     M2 ... SURVIVED  want exit 1, got 0              <- measured M1's damage
#     M3 ... FAIL: mascot-lean (motion.css:886)        <- M2's damage, attributed to M3
#
# Every line of that is a false finding, and a false finding is worse than a
# missing one: `mascot-lean` was reported as dangling while pointing at M3, which
# renames `mascot-bounce`. `reset` puts the file back on the success AND the
# failure path of every case, and the caller checks its status.
reset() {
  cp -- "$BAK" "$TARGET" || { echo "FATAL: reset failed"; exit 2; }
  cmp -s -- "$TARGET" "$BAK" || { echo "FATAL: reset did not restore $TARGET"; exit 2; }
}

# mutate <old> <new> — replace EXACTLY ONE occurrence, or ABORT THE WHOLE BATTERY.
#
# ── WHY IT ABORTS RATHER THAN REPORTING A SURVIVED CASE ────────────────────
# A mutation that matches nothing writes the file back unchanged and the gate
# correctly stays green, so the case reports SURVIVED — and a dead mutation is
# indistinguishable from a hole in the gate. The wrong one of those two gets
# investigated, so this is a TOOLING ERROR (exit 2) and not a case verdict. And
# it is fatal for the whole run, because once the anchor is dead every later case
# measures a file the earlier cases did not restore.
#
# ── `\n` IN AN ANCHOR MEANS "THIS FILE'S OWN LINE ENDING" ──────────────────
# `src/styles/motion.css` is CRLF on Windows and LF in CI, so an anchor that
# spans two lines must not bake in either one. A literal backslash-n in the
# anchor means "one line ending", decoded against the file's real bytes by
# `scripts/ci/kf-mutate.cjs`. Measured: this file is CRLF on the authoring
# machine (1014 LF, 1014 CR), and the first version of case M4 anchored on a real
# newline and matched nothing —
#
#     node saw OLD="  animation: mascot-sway ...infinite;\n}"
#     hits=0
#
# — which is the repository's recorded CRLF trap.
#
# The substitution itself lives in `kf-mutate.cjs` rather than in `node -e` here.
# That is not tidiness: three separate quoting failures came out of the inline
# version, the last of them an apostrophe in a printed message that terminated
# the shell string and produced `syntax error near unexpected token '('` from
# otherwise valid JavaScript. The file takes a path and two env vars and the
# shell interprets nothing — and it can be run by hand to diagnose a case.
mutate() {
  KF_OLD="$1" KF_NEW="$2" KF_FILE="$TARGET" node scripts/ci/kf-mutate.cjs
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo ""
    echo "FATAL: the next case's mutation could not be applied (exit $rc)."
    echo "       Aborting before any case is judged: a case with no mutation"
    echo "       installed measures the PREVIOUS case's damage and reports a"
    echo "       failure against the wrong rule."
    reset
    exit 2
  fi
}

echo "Mutation battery — check-keyframes.mjs"
echo "--------------------------------------------------------"
echo "  target: $TARGET"
echo ""

# ── M1: rename the declaration for the `look` idle ──────────────────────────
# The class rules keep their spelling, so the gate has to notice that the name
# they now reference has no @keyframes behind it.
mutate '@keyframes mascot-look {' '@keyframes mascot-lok {'
expect "M1 @keyframes mascot-look renamed" 1 "mascot-look"
reset

# ── M2: one character inside the declaration name ───────────────────────────
# Proves the gate is not merely matching on a prefix or a fuzzy pattern.
mutate '@keyframes mascot-lean {' '@keyframes mascot-leam {'
expect "M2 @keyframes mascot-lean renamed by one char" 1 "mascot-lean"
reset

# ── M3: the SECOND name of a two-name declaration ──────────────────────────
# THIS CASE FOUND A REAL HOLE AND IS THE REASON THE GATE ITERATES ITS PARTS.
# Anchored on the reference inside `.mascot-bounce`'s `animation:` shorthand.
# With the gate taking only the FIRST token of a declaration it read
# `mascot-enter-soft` (which resolves) and never saw `mascot-bouns` — the very
# name this case breaks — so the case reported SURVIVED on a gate that was green.
# The first name is the entrance and the second is the idle, and the idle is what
# the per-section work retargets, so that hole was aimed at the gate's subject.
mutate 'mascot-bounce 3.4s ease-in-out infinite 420ms;' 'mascot-bouns 3.4s ease-in-out infinite 420ms;'
expect "M3 second name of a two-name shorthand renamed" 1 "mascot-bouns"
reset

# ── M4: the SLOW path — the attribute rule for `sway` ───────────────────────
# `[data-motion="sway"]` is the one the reduced-motion block had to be repaired
# for, so it gets its own case rather than being assumed to be covered by M1.
#
# ── CRLF: THE ANCHOR IS ONE LINE, AND THAT IS NOT LAZINESS ─────────────────
# The first version of this case anchored on the declaration PLUS the closing
# brace, written as a two-line shell string. It matched NOTHING:
#
#     node saw OLD="  animation: mascot-sway 6.5s ease-in-out infinite;\n}"
#     hits=0
#
# `motion.css` here is CRLF (measured: 1014 LF and 1014 CR, i.e. every newline is
# `\r\n`), and a shell single-quoted string contains a bare `\n`. So the anchor
# could never match this file, on this machine, and `mutate` correctly refused.
# This is the repository's recorded CRLF trap — the anchor has to be built from
# the file's real bytes, not from how the source looks in an editor.
#
# Keeping the anchor to a SINGLE line sidesteps the question entirely rather than
# papering over it: `animation: mascot-sway 6.5s ease-in-out infinite;` occurs
# exactly once in the file (measured), on line 874, inside `[data-motion="sway"]`.
# Note the leading two spaces — the same declaration appears unindented nowhere,
# and the whole line including its indent is what makes it unique.
mutate '  animation: mascot-sway 6.5s ease-in-out infinite;' '  animation: mascot-swa 6.5s ease-in-out infinite;'
expect "M4 [data-motion=sway] animation-name renamed" 1 "mascot-swa"
reset

# ── M5: a phantom definition in a COMMENT must not resolve a real name ─────
# THE CASE THAT FOUND A SECOND REAL HOLE. `global.css` carries the sentence
# "`.animate-fade-in` and `@keyframes fadeIn` used to live here." A parser that
# greps raw lines reads that as a DEFINITION, and the consequence is not
# cosmetic: the phantom definition makes a genuinely dangling reference to that
# name resolve, so the gate reports "all resolve" for a name that exists nowhere.
# It also disarms the unreachable-name check, which is the check that keeps this
# gate's own prefix list honest.
#
# The mutation renames the DECLARATION out of the way while the words
# `@keyframes mascot-look` remain in the section header above it, so a raw-line
# parser would keep resolving the reference at line ≈890 and stay green.
#
# ⚠ SINGLE-LINE ANCHOR, for the CRLF reason M4 documents: this file is CRLF, so a
# multi-line anchor written as a shell string can never match. `@keyframes
# mascot-look {` occurs exactly once.
mutate '@keyframes mascot-look {' '@keyframes mascot-lokx {'
expect "M5 declaration gone, name survives in comments" 1 "mascot-look"
reset

# ── G1: OK-GREEN — the file exactly as committed ────────────────────────────
# Load-bearing. Without a green control, a gate that failed unconditionally
# would score 5/5 on the M cases and look like a perfect gate.
expect "G1 OK-GREEN committed motion.css" 0

# ── G2: OK-GREEN — a third, correctly-spelled name in the list ─────────────
# The control for the fix M3 forced (statement scanning instead of line scanning),
# and for the custom-property fix: it adds a third part to the wrapped shorthand
# in `.mascot-sway`, which is the exact shape that used to be invisible.
#
# ⚠ THE ANCHOR IS WRITTEN WITH A LITERAL `\n`, AND IT NAMES ITS OWN SELECTOR.
# Two separate lessons are baked into this one string:
#
#   1. The `\n` is not a real newline. This file is CRLF, so a two-line shell
#      string contains a bare `\n` that can never match — the trap M4 documents.
#      `kf-mutate.cjs` decodes it to whichever ending the file actually uses, so
#      the case is correct on CRLF (Windows) AND LF (CI) alike.
#
#   2. `  animation: mascot-enter-soft 420ms ...` is NOT unique — it occurs on
#      lines 385, 429, 823, 828 and 833, because every mascot rule opens with the
#      same entrance. The first version of this case used it and the helper
#      refused with `hits=2`, which is the refusal working: a two-hit anchor
#      would have mutated whichever rule the file happened to list first. So the
#      anchor starts at `transform-origin` to pin `.mascot-sway` specifically.
mutate '.mascot-sway {\n  transform-origin: 50% 100%;\n  animation: mascot-enter-soft 420ms var(--enter-ease) both,\n             mascot-sway 6.5s ease-in-out infinite 420ms;' '.mascot-sway {\n  transform-origin: 50% 100%;\n  animation: mascot-enter-soft 420ms var(--enter-ease) both,\n             mascot-sway 6.5s ease-in-out infinite 420ms,\n             reveal-rise 480ms var(--ease-out-expo) both;'
expect "G2 OK-GREEN third correct name in the list" 0
reset

# ── G3: OK-GREEN — an unrelated property must change nothing ───────────────
# The scanner is over-inclusive by design: it takes every token carrying one of
# our prefixes anywhere in an `animation` value, so it must not fail on a rule
# that is merely spelled differently. A gate that flagged this would be rejecting
# correct CSS, and the natural response would be to widen it until it checks
# nothing. The anchor pins `.mascot-lean` by its selector so the added property
# lands in a known rule (`hits=2` earlier proved the bare `transform-origin`
# line is not unique), and `\n` again means the file's own line ending.
mutate '.mascot-lean {\n  transform-origin: 50% 100%;' '.mascot-lean {\n  will-change: auto;\n  transform-origin: 50% 100%;'
expect "G3 OK-GREEN unrelated property added" 0
reset

# ── G4: OK-GREEN — defined but never referenced is NOT an error ────────────
# `mascot-enter` is intentionally unused. Renaming it proves the gate looks only
# in the "referenced but undefined" direction; if the gate ever started failing on
# unused declarations, this case turns SURVIVED and says so out loud.
mutate '@keyframes mascot-enter {' '@keyframes mascot-entr {'
expect "G4 OK-GREEN unused keyframe renamed is not an error" 0

echo "--------------------------------------------------------"
echo "  killed  : $pass"
echo "  survived: $fail"
if [ "$fail" -ne 0 ]; then
  echo "MUTATION BATTERY FAILED — the gate is blind to at least one declared case."
  exit 1
fi
echo "MUTATION BATTERY PASSED — every declared mutation is killed, all OK-GREEN controls stay green."
exit 0
