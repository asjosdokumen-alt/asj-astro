#!/usr/bin/env bash
# Mutation battery for scripts/ci/check-keyframes.mjs (`npm run verify:keyframes`).
#
# WHY A BATTERY
# -------------
# The gate exists because the entrance plan (`src/lib/sectionMotion.ts` ->
# `data-enter="<kind>"` on each section -> a `[data-enter="<kind>"]` rule in
# motion.css -> an `animation-name: enter-<kind>`) joins three files by STRING.
# A typo anywhere in that chain produces a name CSS cannot resolve, and CSS is
# silent about it: an unknown `animation-name` is dropped, the element simply does
# not animate, no error is logged and no build step notices — and the existing
# assertions still pass, because a declaration whose list has one resolving name
# looks healthy even when the other name is broken.
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
#   M1  rename the @keyframes for `enter-grow`         -> exit 1, names motion.css
#   M2  rename ONE character of the `reveal-rise`
#       declaration                                     -> exit 1
#   M3  rename the REFERENCE in a shorthand             -> exit 1
#   M4  rename the REFERENCE in an `animation-name:`
#       longhand (the form every [data-enter] rule uses)-> exit 1
#   M5  declare a keyframe under a name OUR_PREFIXES
#       cannot see (the unreachable-name check)         -> exit 1
#   G1  OK-GREEN — the file as committed                -> exit 0  (proves the gate
#       is not "any edit fails"; without this a gate that always failed would score
#       5/5 above)
#   G2  OK-GREEN — a SECOND, correctly-spelled name in a comma list must resolve.
#       This is the false-positive guard for the over-inclusive parser AND the
#       surviving coverage of the multi-name list the M3 hole was originally found
#       in.
#   G3  OK-GREEN — an unrelated property must change nothing.
#   G4  OK-GREEN — a defined-but-UNREFERENCED keyframe must NOT be an error.
#       Repointing a reference so a definition goes unused proves the gate ignores
#       the "unused" direction while still reporting it as a note.
#
# ── WHAT CHANGED ON 2026-09-24 (the mascot sweep) ──────────────────────────
# Every case below used to anchor on a `mascot-*` rule. The mascot's CSS was
# deleted with her, so the anchors moved to the surviving entrance / reveal /
# marquee rules. Two lessons left with the mascot, and they are RECORDED rather
# than re-run:
#
#   * the PHANTOM-DEFINITION case (a comment containing `@keyframes <name>` must
#     not resolve a real reference) — its example was the mascot section header
#     inside motion.css. The behaviour is unchanged and still needed by
#     `global.css:152`, which carries the same trap verbatim ("@keyframes fadeIn
#     used to live here"). There is simply no longer a motion.css comment to
#     anchor the case on.
#   * the TWO-NAME shorthand case (the original M3 shape) — no comma list
#     survives in motion.css, so it is now the G2 OK-GREEN control instead of a
#     mutation: adding a correct second name must pass.
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

# ── M1: rename a DEFINITION, leaving its reference spelled correctly ─────────
# The `[data-enter="grow"]` rule keeps its spelling, so the gate has to notice
# that the name it now references has no @keyframes behind it.
mutate '@keyframes enter-grow {' '@keyframes enter-gro {'
expect "M1 @keyframes enter-grow renamed" 1 "enter-grow"
reset

# ── M2: one character inside the declaration name ───────────────────────────
# Proves the gate is not merely matching on a prefix or a fuzzy pattern.
mutate '@keyframes reveal-rise {' '@keyframes reveal-ris {'
expect "M2 @keyframes reveal-rise renamed by one char" 1 "reveal-rise"
reset

# ── M3: rename the REFERENCE in a shorthand ────────────────────────────────
# The other direction: the @keyframes is intact and it is the RULE that now names
# something undefined. `.marquee-content` is the only surviving `animation:`
# shorthand that names one of our keyframes.
#
# ⚠ SINGLE-LINE ANCHOR, for the CRLF reason M4 documents below: `motion.css` is
# CRLF, so a multi-line anchor written as a shell string can never match.
# `animation: marquee-scroll var(--marquee-duration, 24s) linear infinite;`
# occurs exactly once (measured), on the `.marquee-content` rule.
mutate 'animation: marquee-scroll var(--marquee-duration, 24s) linear infinite;' 'animation: marquee-scrol var(--marquee-duration, 24s) linear infinite;'
expect "M3 reference in a shorthand renamed" 1 "marquee-scrol"
reset

# ── M4: the LONGHAND path — the [data-enter] rules ──────────────────────────
# Every section entrance is applied with `animation-name:` (a longhand) rather
# than the shorthand, and the §9b reduced-motion block exists to reset exactly
# those rules. So the longhand gets its own case rather than being assumed to be
# covered by M3's shorthand.
#
# ── CRLF: THE ANCHOR IS ONE LINE, AND THAT IS NOT LAZINESS ─────────────────
# The first version of this case (when it pinned `[data-motion="sway"]`) anchored
# on the declaration PLUS the closing brace, written as a two-line shell string.
# It matched NOTHING:
#
#     node saw OLD="  animation: mascot-sway 6.5s ease-in-out infinite;\n}"
#     hits=0
#
# `motion.css` here is CRLF (measured: every newline is `\r\n`), and a shell
# single-quoted string contains a bare `\n`. So the anchor could never match this
# file, on this machine, and `mutate` correctly refused. This is the repository's
# recorded CRLF trap — the anchor has to be built from the file's real bytes, not
# from how the source looks in an editor.
#
# Keeping the anchor to a SINGLE line sidesteps the question entirely rather than
# papering over it: `animation-name: enter-focus;` occurs exactly once in the file
# (measured), in the `[data-enter="focus"].is-entered` rule.
mutate 'animation-name: enter-focus;' 'animation-name: enter-focu;'
expect "M4 [data-enter=focus] animation-name renamed" 1 "enter-focu"
reset

# ── M5: a definition OUR_PREFIXES cannot see (the unreachable check) ────────
# The gate admits a REFERENCE only if its name matches a prefix in OUR_PREFIXES,
# so a keyframe declared under a name outside that list has references the gate
# can never see — which is the silent incompleteness the gate exists to prevent,
# reintroduced by the gate's own hand-maintained list. The check that catches it
# is the unreachable-name one at the bottom of check-keyframes.mjs, and it is an
# ERROR rather than a note because the repair is one word.
#
# The mutation plants one such declaration: it prepends an empty `@keyframes
# zz-marquee-scroll {}` block (terminated with `;` so the statement scanner sees
# it as its own unit) in front of the real `marquee-scroll` definition. Every
# REFERENCE still resolves — `marquee-scroll` is untouched — so the only finding
# is the unreachable name, which is exactly what this case must isolate. The `\n`
# in the replacement is a literal backslash-n, decoded to this file's own line
# ending by `kf-mutate.cjs` (the CRLF lesson M4 records).
mutate '@keyframes marquee-scroll {' '@keyframes zz-marquee-scroll {};\n@keyframes marquee-scroll {'
expect "M5 keyframe under an unseen name is unreachable" 1 "zz-marquee-scroll"
reset

# ── G1: OK-GREEN — the file exactly as committed ────────────────────────────
# Load-bearing. Without a green control, a gate that failed unconditionally
# would score 5/5 on the M cases and look like a perfect gate.
expect "G1 OK-GREEN committed motion.css" 0

# ── G2: OK-GREEN — a second, correctly-spelled name in a comma list ────────
# The false-positive guard for the over-inclusive parser: the gate reads EVERY
# comma-separated part of an `animation` value, so a legitimate extra name must
# not fail it. It is also the surviving coverage of the multi-name list shape —
# the original M3 hole — appending a second, defined name to `.marquee-content`.
#
# ⚠ THE ANCHOR IS A SINGLE LINE, for the CRLF reason M4 records: a multi-line
# shell string contains a bare `\n` that can never match this file. The `\n` in
# the REPLACEMENT is a literal backslash-n, decoded by `kf-mutate.cjs`.
mutate 'animation: marquee-scroll var(--marquee-duration, 24s) linear infinite;' 'animation: marquee-scroll var(--marquee-duration, 24s) linear infinite,\n             enter-rise 620ms;'
expect "G2 OK-GREEN second correct name in the list" 0
reset

# ── G3: OK-GREEN — an unrelated property must change nothing ───────────────
# The scanner is over-inclusive by design: it takes every token carrying one of
# our prefixes anywhere in an `animation` value, so it must not fail on a rule
# that is merely spelled differently. A gate that flagged this would be rejecting
# correct CSS, and the natural response would be to widen it until it checks
# nothing. The anchor pins `.sakura-petal` by its selector so the added property
# lands in a known rule, and `\n` again means the file's own line ending.
mutate '.sakura-petal {\n  position: absolute;' '.sakura-petal {\n  will-change: opacity;\n  position: absolute;'
expect "G3 OK-GREEN unrelated property added" 0
reset

# ── G4: OK-GREEN — defined but never referenced is NOT an error ────────────
# `slide-in` is defined in `theme.css` but Tailwind builds its reference at build
# time, so this gate can never see one — and that must not be an error. The case
# proves the same direction without touching `theme.css`: repointing `.sakura-petal`
# at an ALREADY-DEFINED name leaves `sakuraFall` unreferenced while every reference
# still resolves, so the gate must stay green and merely report the unused name.
mutate 'animation: sakuraFall linear infinite;' 'animation: marquee-scroll linear infinite;'
expect "G4 OK-GREEN unused keyframe is not an error" 0 "sakuraFall"
reset

echo "--------------------------------------------------------"
echo "  killed  : $pass"
echo "  survived: $fail"
if [ "$fail" -ne 0 ]; then
  echo "MUTATION BATTERY FAILED — the gate is blind to at least one declared case."
  exit 1
fi
echo "MUTATION BATTERY PASSED — every declared mutation is killed, all OK-GREEN controls stay green."
exit 0
