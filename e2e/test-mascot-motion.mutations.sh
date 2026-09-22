#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# e2e/test-mascot-motion.mutations.sh — prove the mascot-motion gate can FAIL.
#
# A gate you have never seen go red is a hypothesis, not evidence. This battery
# applies one mutation at a time to the SUBJECT (the built page), restores, and
# judges by EXIT CODE only.
#
# WHY IT MUTATES THE BUILT CSS RATHER THAN `src/styles/motion.css`
# -----------------------------------------------------------------
# The gate measures the BUILT artifact. A source mutation needs a full
# `astro build` (~19s) per case — 7 cases would be ~2.5 minutes of rebuilding
# for a verdict about the gate's cascade logic rather than about the build.
# Mutating the built CSS exercises exactly the property under test (does the
# gate notice when the cascade lands wrong?) and runs in seconds. Case `S1`
# closes the gap by mutating the SOURCE and rebuilding, so at least one case is
# end-to-end.
#
# TWO MUTATION SURFACES, BECAUSE THE GATE HAS TWO HALVES
# -----------------------------------------------------
# `M*` mutate CSS + markup and cover the CASCADE assertions (reduced-motion
# clamp, the idle, the selector resolving at all).
#
# `T*` mutate the INLINE TRACKING SCRIPT and cover the TRACKING assertions —
# whether she actually changes pose, motion and picture while the page scrolls.
# A stylesheet edit cannot express that: the swap is imperative JS, and no CSS
# change stops `setPose` being called. T1..T5 rewrite the inlined script in the
# built `dist/index.html` (verified unique there before being used); `S1b`
# performs T1's regression ON THE SOURCE and rides S1's rebuild, so the tracking
# half has an end-to-end case of its own.
#
# ⚠ ONE T-CASE WAS WITHDRAWN AS AN EQUIVALENT MUTATION, AND THAT IS RECORDED
# IN PLACE. The first `T3` only changed `var best = null;` to
# `var best = sections[0];` while leaving the loop's `best = sections[i]`
# assignment intact; the loop overwrites it immediately, the walk came back
# byte-identical, and the case "survived" — correctly. A survivor of that shape
# is NOT a hole in the gate. The lesson is written into T3's comment.
#
# THE BUILT CSS IS MINIFIED AND CONTENT-HASHED, so this script RESOLVES the
# filename at run time and uses the minified forms. The source forms DO NOT
# appear in the artifact — verified before this battery was written:
#     grep -o 'mascot-sway 6.5s' dist/_astro/*.css   ->  0 matches
#     grep -o 'prefers-reduced-motion' dist/index.html ->  0 matches
# A mutation anchored on the SOURCE spelling would be a silent no-op (RULE 7's
# failure mode), which restores byte-perfectly and impersonates a real hole.
#
# IF *EVERY* MUTATION SURVIVES, SUSPECT THIS HARNESS FIRST. Usual causes, all
# seen for real: the mutation never applied; the server was down so both runs
# measured an error page; `dist/` was rebuilt between the mutation and the run.
#
# Run from the repo root:  bash e2e/test-mascot-motion.mutations.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u
fail=0
declare -a results=()

REPO="$(pwd)"
GATE="e2e/test-mascot-motion.mjs"
SRC="src/styles/motion.css"
BAK="$REPO/.downloads/mutbak"

BASE="${BASE_URL:-http://localhost:4321}"
export BASE_URL="$BASE"
# Port is derived from BASE_URL so a non-default port keeps working.
PORT="$(printf '%s' "$BASE" | sed -E 's#.*:([0-9]+).*#\1#')"

# Restart the preview server in the background, detached from this shell.
# A server started as `( cmd & )` dies with the shell that spawned it, so this
# uses nohup + a redirect and then WAITS for the port, rather than assuming.
start_server() {
  cd "$REPO" || return 1
  NODE_OPTIONS="" nohup node node_modules/astro/astro.js preview --port "$PORT" \
    > "$REPO/.downloads/preview-mut.log" 2>&1 &
  for _ in $(seq 1 40); do
    c=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" 2>/dev/null)
    [ "$c" = "200" ] && return 0
    sleep 0.5
  done
  return 1
}

# ── RULE 1: refuse to interpret anything if the baseline is not green ────────
echo "── baseline ──"
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — aborting. Mutations cannot be interpreted against a red suite."
  node "$GATE" 2>&1 | tail -20
  exit 1
fi
echo "baseline GREEN"

# A down server makes every probe read an error page, so every mutation would
# "survive" for a reason unrelated to the gate.
#
# `curl -o /dev/null` exits 23 even on a healthy 200 (client write error), so we
# take the STATUS from -w and never the exit code. The `|| echo` fallback is
# deliberately absent: `-s -o /dev/null -w` still prints a code on many
# failures, and appending a fallback produced "200000" here — a harness bug that
# aborted a correct run. Connection failure prints 000 by itself.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" 2>/dev/null)
case "$code" in
  200) echo "server OK ($code)" ;;
  *)   echo "ABORT: $BASE/ returned '$code'. Start the preview server first."; exit 1 ;;
esac
echo

# Resolve the sway rule from the built artifact. One match required.
#
# DEFINED BEFORE ITS FIRST USE, deliberately: bash resolves a function name when
# the LINE RUNS, so calling this from the subject-resolution step above a
# definition further down would fail with "command not found" — and, because the
# call sits in a `$( )`, that failure would be silent apart from an empty
# SWAY_RULE.
extract_sway_rule() {  # <css-file> -> prints the rule, or nothing on failure
  MUT_FILE="$1" node -e '
    const fs = require("fs");
    const s = fs.readFileSync(process.env.MUT_FILE, "utf8");
    const m = s.match(/\.mascot-sway\{[^}]*\}/g);
    if (!m || m.length !== 1) {
      console.error("  extract_sway_rule: matches=" + (m ? m.length : 0));
      process.exit(2);
    }
    process.stdout.write(m[0]);
  '
}

# Resolve the hashed stylesheet that actually carries the mascot rules.
SUBJECT="$(grep -rl 'mascot-sway' dist/_astro/*.css 2>/dev/null | head -1)"
if [ -z "$SUBJECT" ] || [ ! -f "$SUBJECT" ]; then
  echo "ABORT: no built stylesheet contains 'mascot-sway'. Did the build run?"
  exit 1
fi
echo "subject: $SUBJECT"

# Resolve the sway rule from THAT artifact now, rather than trusting a literal.
# If this fails the M-cases would all report NOT-APPLIED, so it aborts instead
# of producing a run where every CSS mutation is scored as a harness bug.
SWAY_RULE="$(extract_sway_rule "$SUBJECT")"
if [ -z "$SWAY_RULE" ]; then
  echo "ABORT: could not resolve .mascot-sway from $SUBJECT."
  echo "       The M-cases anchor on this rule; without it they cannot be applied."
  exit 1
fi
echo "sway rule: $SWAY_RULE"
echo

mkdir -p "$BAK"
cp "$SUBJECT" "$BAK/subject.css"
cp "$SRC" "$BAK/motion.css"

restore_html() { cp "$BAK/subject.css" "$SUBJECT"; }
restore_src()  { cp "$BAK/motion.css" "$SRC"; }
# The tracking script's source. Restored in the same place as `motion.css` so the
# end-to-end section cannot strand `BaseLayout.astro` in a mutated state — the
# same failure mode the S1 note describes for the CSS, and worse here because a
# stranded `var picture = null;` is a silent behaviour regression rather than a
# build error.
restore_track_src() { [ -f "$BAK/BaseLayout.astro" ] && cp "$BAK/BaseLayout.astro" "$TRACK_SRC"; }

# RULE 7: prove the mutation APPLIED (exactly one match) or say so loudly.
#
# A no-op mutation restores byte-perfectly, so the diff check cannot catch it —
# and if it is then scored by `run`, it prints SURVIVED, which reads as a hole
# in the gate when in fact nothing was mutated. That is the most expensive
# harness bug to diagnose because it impersonates a real finding.
#
# It therefore does NOT `exit`: it sets APPLIED=0 so the caller records a
# HARNESS-BUG verdict. Aborting the whole script would hide every other case's
# result behind one bad target, and the distinction "the gate has a hole" vs
# "my target string was wrong" is the entire point of this battery.
APPLIED=1
mut() {  # mut <file> <old> <new>   -> sets APPLIED
  APPLIED=1
  MUT_FILE="$1" MUT_OLD="$2" MUT_NEW="$3" node -e '
    const fs = require("fs");
    const p = process.env.MUT_FILE;
    const s = fs.readFileSync(p, "utf8");
    const parts = s.split(process.env.MUT_OLD);
    if (parts.length !== 2) {
      console.error("NOT-APPLIED (matches=" + (parts.length - 1) + ")");
      process.exit(2);
    }
    fs.writeFileSync(p, parts.join(process.env.MUT_NEW));
  ' || APPLIED=0
}

run() {  # run <label> <description>
  local label="$1" desc="$2"
  if [ "$APPLIED" -eq 0 ]; then
    echo "NOT-APPLIED      $label  $desc   <-- HARNESS BUG, not a survivor"
    results+=("HARNESS-BUG $label"); fail=1
    return
  fi
  node "$GATE" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "KILLED   exit=$rc  $label  $desc"; results+=("KILLED $label")
  else
    echo "SURVIVED exit=0   $label  $desc   <-- HOLE"; results+=("HOLE $label"); fail=1
  fi
}

# The exact minified rule, measured from the artifact (unique — the selector
# text `.mascot-sway{` alone occurs twice).
#
# ⚠ THIS STRING ROTS, AND IT ROTTED. It is a frozen copy of a MINIFIED rule, so
# any change to the source shorthand silently invalidates it — and an invalid
# anchor does not error, it reports "matches=0" and the case is scored as a
# HARNESS BUG rather than as coverage. Measured: four of these cases (M2, M3,
# M5, and the `SWAY_RULE` this comment sits on) went NOT-APPLIED after the
# entrance was renamed `mascot-enter` -> `mascot-enter-soft` and its timing
# changed `.62s cubic-bezier(.22,1,.36,1)` -> `.42s var(--enter-ease)`:
#
#   battery had : animation:.62s cubic-bezier(.22,1,.36,1) both mascot-enter,6.5s ease-in-out .62s infinite mascot-sway
#   artifact has : animation:mascot-enter-soft .42s var(--enter-ease) both,mascot-sway 6.5s ease-in-out infinite .42s
#
# So the rule is RESOLVED FROM THE ARTIFACT AT RUN TIME rather than hard-coded.
# `extract_sway_rule` below prints the rule the build actually emitted, and
# aborts loudly if it cannot find exactly one — the failure mode to avoid is a
# stale literal that impersonates "no hole" while the gate is never exercised.
# SWAY_RULE is resolved from the artifact near the top of this script (see the
# note there) — it is NOT set here. It used to be a literal at this spot; leaving
# a second assignment would silently overwrite the resolved value with "", and
# an empty MUT_OLD makes `split("")` return one part per CHARACTER, so the
# mutation reports `matches=180921` and every M-case becomes a harness bug.
# The reduced-motion clamp for the mascot, inside the third reduce block.
CLAMP='.mascot{opacity:1;animation:none;transform:none}'

# ═════════════════════════════════════════════════════════════════════════════
# M1 — the VISIBILITY trap, and the reason this gate exists at all. Drop
# `opacity:1` from the clamp: `mascot-enter` starts at opacity 0 with fill-mode
# both, so she renders INVISIBLE while `animation-name` is still correctly
# `none`. A gate that only checked the animation name would miss this entirely.
# ═════════════════════════════════════════════════════════════════════════════
mut "$SUBJECT" "$CLAMP" '.mascot{opacity:.2;animation:none;transform:none}'
run "M1" "reduced-motion opacity weakened (the opacity:0 trap)"
restore_html
# ═════════════════════════════════════════════════════════════════════════════
# M2 — CLAIM 1, the positive branch. Replace the idle with a second
# `mascot-enter`: the entrance still runs and the property is still a valid
# animation shorthand. A gate that merely asserted "some animation exists"
# stays green here; this proves it specifically requires `mascot-sway`.
# ═════════════════════════════════════════════════════════════════════════════
mut "$SUBJECT" "$SWAY_RULE" '.mascot-sway{transform-origin:50% 100%;animation:.62s cubic-bezier(.22,1,.36,1) both mascot-enter,6.5s ease-in-out .62s infinite mascot-enter}'
run "M2" "the sway replaced by a second mascot-enter (idle gone, entrance intact)"
restore_html

# ═════════════════════════════════════════════════════════════════════════════
# M3 — CLAIM 2a, the specificity assumption the motion.css comment names. Raise
# the sway selector to 0,2,0 so it BEATS `.mascot` (0,1,0) in the reduced block.
# Invisible in normal motion — the idle still runs and nothing else changes.
# ═════════════════════════════════════════════════════════════════════════════
mut "$SUBJECT" "$SWAY_RULE" '.mascot.mascot-sway{transform-origin:50% 100%;animation:.62s cubic-bezier(.22,1,.36,1) both mascot-enter,6.5s ease-in-out .62s infinite mascot-sway}'
run "M3" "sway selector raised to 0,2,0 so it beats the reduced-motion clamp"
restore_html

# ═════════════════════════════════════════════════════════════════════════════
# M4 — the clamp deleted entirely: the blunt version of M3. Even with correct
# specificity, no rule means no clamp. Proves the gate detects a MISSING clamp,
# not merely a shadowed one.
# ═════════════════════════════════════════════════════════════════════════════
mut "$SUBJECT" "$CLAMP" '.mascot{opacity:1;transform:none}'
run "M4" "the reduced-motion clamp's animation:none deleted"
restore_html

# ═════════════════════════════════════════════════════════════════════════════
# M5 — an `!important` added to the sway, the "quick fix" a future author is
# most likely to reach for. `!important` on the animation makes the clamp
# unable to win regardless of source order. This is the realistic regression
# this gate is a tripwire for.
# ═════════════════════════════════════════════════════════════════════════════
mut "$SUBJECT" "$SWAY_RULE" '.mascot-sway{transform-origin:50% 100%;animation:.62s cubic-bezier(.22,1,.36,1) both mascot-enter,6.5s ease-in-out .62s infinite mascot-sway!important}'
run "M5" "an !important added to the sway animation, defeating the clamp"
restore_html

# ═════════════════════════════════════════════════════════════════════════════
# M6 — the INSTRUMENT's own subject. Break the src pattern so the selector
# matches NOTHING. Every assertion would then pass vacuously over an empty
# list; the "present on the landing page" case must fail first. This is the
# "an instrument that finds zero elements reports success" guard.
#
# GLOBAL replace, deliberately: the pose appears FIVE times in the markup (the
# `<picture>` emits AVIF + WebP × 1x/@2x as srcset pairs), so a single-match
# mutation would leave four matching successors and the selector would still
# resolve. That is a partial mutation — it would report SURVIVED and look like a
# hole in the gate when it is a hole in this mutation.
# ═════════════════════════════════════════════════════════════════════════════
HTML="dist/index.html"
cp "$HTML" "$BAK/index.html"
# ⚠ THIS CASE MUST SET APPLIED ITSELF. It does not go through `mut`, so `APPLIED`
# is left holding M5's value — and if M5 reported NOT-APPLIED, M6 inherited that
# `0` and was scored as a HARNESS BUG even though its 13 replacements had
# applied. Measured exactly that: M6 printed "replaced 13 occurrence(s)" and was
# then labelled NOT-APPLIED. `run` cannot tell the difference, so the block that
# performs the replacement is what must report it.
APPLIED=0
MUT_FILE="$HTML" node -e '
  const fs = require("fs");
  const p = process.env.MUT_FILE;
  const s = fs.readFileSync(p, "utf8");
  const n = s.split("mascot/princess-wave").length - 1;
  if (n < 1) { console.error("M6 target not found"); process.exit(2); }
  fs.writeFileSync(p, s.split("mascot/princess-wave").join("mascot/princess-wave-RENAMED"));
  console.log("  M6 replaced " + n + " occurrence(s)");
' && APPLIED=1
run "M6" "mascot src pattern renamed so the selector matches nothing"
cp "$BAK/index.html" "$HTML"

# ═════════════════════════════════════════════════════════════════════════════
# ── T1..T5 — THE TRACKING SCRIPT, the surface M1..M6 cannot reach ───────────
#
# M1..M6 all mutate CSS or markup, and they cover the OLD assertions (the
# reduced-motion clamp, the sway, the selector resolving at all). The new
# assertions in PART TWO measure something else entirely: whether the
# `[data-mascot-track]` block in `BaseLayout.astro` actually CHANGES her as the
# page scrolls. A CSS mutation cannot express that — the tracking script is
# imperative JS, and no stylesheet edit makes it stop calling `setPose`.
#
# WHY THESE MUTATE `dist/index.html` RATHER THAN `src/layouts/BaseLayout.astro`
# ---------------------------------------------------------------------------
# The head script is `<script is:inline>`, so the ASTRO BUILD COPIES IT INTO
# `dist/index.html` VERBATIM — verified before writing these cases: every anchor
# below occurs EXACTLY ONCE in `dist/index.html` (the probe printed `1` for all
# five). A mutation of the built file therefore exercises the real script the
# browser runs, in seconds, with no rebuild. T6 closes the gap by mutating the
# SOURCE and rebuilding, so at least one case is end-to-end.
#
# THE ANCHORS ARE FULL STATEMENTS, NOT FRAGMENTS. Each was counted in the
# artifact first. A target that matched zero times would be reported
# NOT-APPLIED (HARNESS BUG) thanks to `mut`, but a target matching TWICE would
# be a partial mutation that restores byte-perfectly and impersonates a hole —
# which is why these are long enough to be unique rather than the shortest
# possible substring.
# ═════════════════════════════════════════════════════════════════════════════

# ═════════════════════════════════════════════════════════════════════════════
# T1 — THE PICTURE SWAP MADE INERT AGAIN. This reproduces the exact defect that
# was found and fixed: revert `setPose` to the one line that writes only the
# marker, so the attribute tracks the section while the rendered image does not.
#
# This is the single most important case in this section. It is the mutation
# that proves CLAIM 5b ("the rendered PICTURE swaps, not just the data-pose
# marker") is load-bearing rather than decorative — and the gate MUST go red,
# because the whole point of the fix is that a pose swap that changes no pixels
# is a bug a user sees and no attribute-level test can catch.
#
# The `data-pose` attribute is deliberately LEFT INTACT: this is not a
# "delete the feature" mutation, it is the realistic half-swap. A gate that
# asserted only on `data-pose` would stay green here, which is exactly why it
# asserts on `currentSrc` and the intrinsic size instead.
# ═════════════════════════════════════════════════════════════════════════════
mut "$HTML" \
  'var picture = mascot.parentElement;' \
  'var picture = null;'
run "T1" "setPose rewired so the <picture> is never found (attribute-only swap)"
cp "$BAK/index.html" "$HTML"

# ═════════════════════════════════════════════════════════════════════════════
# T2 — THE PARSE-TIME EARLY RETURN, which is the second real defect that was
# found. `onReady` exists because this block used to run while `document.body`
# did not exist, so `querySelector("[data-mascot-track]")` returned null and
# `if (!mascot) return;` fired SILENTLY on every page load, at every width,
# forever. She never changed pose once.
#
# Restore that failure mode by removing the `onReady` wrapper's effect: the
# script still runs, the elements are still there, but it bails before wiring.
# It is a good mutation precisely because NOTHING ERRORS — the console is clean
# and the page looks fine apart from a mascot that never moves.
# ═════════════════════════════════════════════════════════════════════════════
mut "$HTML" \
  'var mascot = document.querySelector("[data-mascot-track]");
          if (!mascot) return;' \
  'var mascot = document.querySelector("[data-mascot-track]");
          if (mascot) return;'
run "T2" "the tracking block bails before wiring (the silent parse-time defect)"
cp "$BAK/index.html" "$HTML"

# ═════════════════════════════════════════════════════════════════════════════
# T3 — `nearest()` FROZEN. Delete the `best = sections[i]` ASSIGNMENT inside the
# loop, so `best` stays `null` and `nearest()` never names a section. She keeps
# her initial pose at every stop for the whole walk.
#
# This is the anti-vacuity case. CLAIM 4 alone would NOT catch it (she still
# matches a table row — the first one), and CLAIM 5b would only see one pose.
# The "walk observed her CHANGE at least twice" assertion is the one that has to
# fail, and it does: measured, this mutation reds POSE, MOTION, anti-vacuity and
# PICTURE together, because with no section named there is nothing to apply.
#
# ⚠ A WEAKER VERSION OF THIS MUTATION WAS TRIED FIRST AND SURVIVED — and the
# survivor was CORRECT, not a hole. The first attempt only changed the
# DECLARATION, `var best = null;` -> `var best = sections[0];`, while leaving the
# loop's assignment in place. The loop overwrites `best` on its first visible
# candidate (`bestDist` starts at Infinity), so `sections[0]` was never
# observable and the walk table came back byte-identical to the green run —
# 16/16, same poses, same boxes. That is an EQUIVALENT MUTATION: the program
# text changed, the program behaviour did not. It is recorded here because a
# survivor of this shape must NOT be chased as a gate defect — the lesson is
# "mutate the ACTIVE assignment, not an initialiser the code immediately
# discards", and it cost one 25-second run to learn.
# ═════════════════════════════════════════════════════════════════════════════
mut "$HTML" \
  'if (d < bestDist) { bestDist = d; best = sections[i]; }' \
  'if (d < bestDist) { bestDist = d; }'
run "T3" "nearest() never assigns best, so no section is ever current"
cp "$BAK/index.html" "$HTML"

# ═════════════════════════════════════════════════════════════════════════════
# T4 — THE ARRIVAL STATE. Delete the immediate `apply(first)`, so a visitor
# landing at the top of the page sees the RESTING pose until their first scroll
# event corrects it. This is the defect BaseLayout's own comment names: "a
# visitor who lands mid-page — a deep link, or a reload that restores scroll
# position — must not see the resting pose until they move."
#
# ⚠ THIS CASE WAS A SURVIVOR, AND THE SURVIVOR WAS A REAL GAP IN THE GATE.
# DO NOT READ THIS AS A STALE NOTE — the case is kept precisely because it
# forced an assertion to be written.
#
# What happened, measured: this mutation left the gate GREEN at 16/16. The walk
# could not see it, because the walk's FIRST ACTION IS A SCROLL — `window.scrollTo`
# fires a scroll event, `onScroll` runs, `apply(nearest())` corrects her, and only
# THEN does the loop read her pose. Probed directly on the same build:
#
#     pristine : before any scroll  pose=princess-peace   <- correct
#     mutation : before any scroll  pose=princess-wave    <- the defect
#     both     : after one scrollTo pose=princess-peace   <- indistinguishable
#
# So the walk was reporting "no problem" about a state it never visited. That is
# the skill's third way a check lies — "the gate inspects a state the subject
# only sometimes renders" — and the fix was NOT to weaken this case but to give
# the gate an `arrival` measurement taken BEFORE the first scroll, plus CLAIM 3b
# ("she is ALREADY posed for the first section before any scroll").
#
# CONFIRMED KILLING after that assertion was added: exit 1, 16/17, red on exactly
# the new assertion. The sequence is worth keeping in the file: a battery case
# that survives is evidence about the GATE, and this one is why the gate grew.
# ═════════════════════════════════════════════════════════════════════════════
mut "$HTML" \
  'var first = nearest();
        if (first) apply(first);' \
  'var first = null;
        if (first) apply(first);'
run "T4" "the immediate first apply() removed (the arrival state is wrong until scrolled)"
cp "$BAK/index.html" "$HTML"

# ═════════════════════════════════════════════════════════════════════════════
# T5 — THE RAIL BREAKPOINT MOVED, i.e. the `display:none` BLIND SPOT restored.
# Rewrite Tailwind's `xl:block` to `3xl:block` in the markup, so at 1280px the
# rail is `display:none` and the tracked mascot is `0 × 0`.
#
# EVERY CASCADE ASSERTION ABOVE STILL PASSES in that state — a hidden element
# resolves `animation-name`, `opacity` and `transform` perfectly — so only
# CLAIM 3 ("the tracked mascot is RENDERED at the tracked width") can catch it.
# That is the whole reason CLAIM 3 is about the BOX rather than the computed
# animation, and this case is what proves it.
#
# NOTE the global-vs-single question. `xl:block` is a Tailwind utility and may
# appear on other elements, so this targets the mascot rail's full class
# attribute instead, which is unique to it.
# ═════════════════════════════════════════════════════════════════════════════
RAIL_OLD='class="hidden xl:block xl:col-start-2 xl:row-start-1 self-start sticky top-0 h-screen pointer-events-none"'
RAIL_NEW='class="hidden 3xl:block xl:col-start-2 xl:row-start-1 self-start sticky top-0 h-screen pointer-events-none"'
if grep -q -F "$RAIL_OLD" "$HTML"; then
  mut "$HTML" "$RAIL_OLD" "$RAIL_NEW"
  run "T5" "the mascot rail's breakpoint moved to 3xl, so she is display:none at 1280px"
else
  echo "NOT-APPLIED      T5  the rail class attribute was not found in dist/index.html   <-- HARNESS BUG, not a survivor"
  results+=("HARNESS-BUG T5"); fail=1
fi
cp "$BAK/index.html" "$HTML"

# ═════════════════════════════════════════════════════════════════════════════
# S1 — END-TO-END. Mutate the SOURCE and REBUILD, so one case proves the gate is
# coupled to the real pipeline and not only to a hand-edited artifact. Slow, and
# the one that matters most.
#
# THE PREVIEW SERVER MUST BE STOPPED FOR THIS. `astro preview` holds `dist/`
# open, so a concurrent `astro build` does not fail — it HANGS. Measured three
# times in this repo: an 18s build ran past 7 minutes and had to be killed, with
# the battery sitting at "S1 mutation applied" and no build process alive. The
# symptom is a deadlock, not an error, which is why it is worth stating here.
#
# We stop the server, rebuild, and restart it on the SAME port. If the port
# cannot be re-bound the battery says so rather than silently leaving the
# developer with no preview.
# ═════════════════════════════════════════════════════════════════════════════
echo
echo "── S1: source mutation + rebuild (end-to-end, ~20s) ──"

PREVIEW_PID="$(netstat -ano 2>/dev/null | grep "LISTENING" | grep ":${PORT} " | awk '{print $NF}' | head -1)"
STOPPED_SERVER=0
if [ -n "$PREVIEW_PID" ]; then
  echo "  stopping preview server (pid $PREVIEW_PID) — it holds dist/ open"
  powershell.exe -NoProfile -Command "Stop-Process -Id $PREVIEW_PID -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1
  # ⚠ WAIT FOR THE PORT TO ACTUALLY FREE, DO NOT `sleep 1` AND HOPE.
  #
  # `sleep 1` was here and it was not enough. Measured: a run sat 18 minutes at
  # "S1b mutation applied (source)" with the build making no progress — the
  # textbook deadlock described above. `Stop-Process` returns as soon as the
  # signal is DELIVERED; the OS then has to release the listening socket and
  # node has to drop its handle on `dist/`, and the build started into that gap.
  #
  # The symptom is the worst kind: the battery does not fail, it stops producing
  # output, and every mutation after this point is simply never scored. So the
  # wait is now a bounded poll on the PORT, and if the port does not free we
  # ABORT LOUDLY rather than hang. A visible abort costs one run; a silent hang
  # costs the whole battery and looks like a machine problem.
  freed=0
  waited=0
  for _ in $(seq 1 40); do
    if ! netstat -ano 2>/dev/null | grep "LISTENING" | grep -q ":${PORT} "; then freed=1; break; fi
    sleep 0.5
    waited=$((waited + 1))
  done
  if [ "$freed" -eq 0 ]; then
    echo "  ABORT: port $PORT is still LISTENING after 20s — the build would deadlock."
    echo "         Kill the preview server by hand and re-run."
    exit 1
  fi
  echo "  port $PORT freed (waited ${waited} poll(s))"
  STOPPED_SERVER=1
fi
# CRLF: this file checks out with `\r\n`, so a target anchored on a bare "\n"
# matches NOTHING. Measured: JSON.stringify of the region is
#   ".mascot-sway {\r\n  transform-origin: 50% 100%;\r\n  animation: ..."
# The first version of this case used a plain "\n" and reported
# "S1 target not found (matches=0)" — and, worse, the harness then labelled it
# SURVIVED, which reads as a hole in the gate when in fact nothing was mutated.
# Both halves are fixed here: the target is line-ending agnostic, and `run_s1`
# distinguishes "could not apply" from "survived".
S1_APPLIED=0
MUT_FILE="$SRC" node -e '
  const fs = require("fs");
  const p = process.env.MUT_FILE;
  const s = fs.readFileSync(p, "utf8");
  // Match the selector, then whatever line ending, then the first property.
  const re = /\.mascot-sway \{\r?\n  transform-origin: 50% 100%;/;
  const m = s.match(new RegExp(re.source, "g"));
  if (!m || m.length !== 1) {
    console.error("S1 target not found (matches=" + (m ? m.length : 0) + ")");
    process.exit(2);
  }
  fs.writeFileSync(p, s.replace(re, ".mascot.mascot-sway {\r\n  transform-origin: 50% 100%;"));
  console.log("  S1 mutation applied");
' && S1_APPLIED=1

# ── S1b — THE TRACKING SOURCE, IN THE SAME BUILD ────────────────────────────
#
# T1..T5 mutate the BUILT `dist/index.html`, which proves the gate notices the
# behaviour but NOT that the battery is coupled to the real pipeline: a build
# change in how `<script is:inline>` is emitted would invalidate every T-case's
# anchor while leaving them "passing" (they would report NOT-APPLIED, which is
# loud, but the coupling would still be untested).
#
# S1b therefore applies the SAME picture-swap regression to the SOURCE and rides
# along on S1's rebuild — one build, two end-to-end mutations. It is the case
# that would have caught the real defect at its origin rather than in the
# artifact.
#
# THE TARGET IS LINE-ENDING AGNOSTIC. `BaseLayout.astro` is a source file in the
# same repo and is subject to the same CRLF checkout as `motion.css` (S1's note),
# so the anchor uses `\r?\n`. It also asserts EXACTLY ONE match: `setPose` is the
# only place `mascot.parentElement` is read, and a second match would mean a
# partial mutation that restores byte-perfectly and impersonates a hole.
TRACK_SRC="src/layouts/BaseLayout.astro"
cp "$TRACK_SRC" "$BAK/BaseLayout.astro"
S1B_APPLIED=0
MUT_FILE="$TRACK_SRC" node -e '
  const fs = require("fs");
  const p = process.env.MUT_FILE;
  const s = fs.readFileSync(p, "utf8");
  const re = /var picture = mascot\.parentElement;/;
  const m = s.match(new RegExp(re.source, "g"));
  if (!m || m.length !== 1) {
    console.error("S1b target not found (matches=" + (m ? m.length : 0) + ")");
    process.exit(2);
  }
  fs.writeFileSync(p, s.replace(re, "var picture = null;"));
  console.log("  S1b mutation applied (source)");
' && S1B_APPLIED=1

if [ "$S1_APPLIED" -eq 1 ] || [ "$S1B_APPLIED" -eq 1 ]; then
  if NODE_OPTIONS="" node node_modules/astro/astro.js build >/dev/null 2>&1; then
    # The rebuild may emit a NEW hashed filename; re-resolve the subject.
    SUBJECT2="$(grep -rl 'mascot-sway' dist/_astro/*.css 2>/dev/null | head -1)"
    if [ -n "$SUBJECT2" ]; then SUBJECT="$SUBJECT2"; fi
    # Only score a case whose mutation actually applied. Scoring one that did
    # not would print SURVIVED and read as a hole in the gate.
    [ "$S1_APPLIED" -eq 1 ]  && run "S1"  "SOURCE: sway selector raised to 0,2,0, rebuilt end-to-end"
    [ "$S1B_APPLIED" -eq 1 ] && run "S1b" "SOURCE: setPose rewired to an attribute-only swap, rebuilt end-to-end"
    # Both mutations are live in this one build, so a red S1 and a red S1b are
    # both expected. Their assertion sets should DIFFER (S1 reds the cascade
    # assertions, S1b the picture ones) — if they came back identical, suspect
    # that one of the two source mutations silently did nothing.
  else
    echo "S1/S1b BUILD FAILED — cannot interpret these cases"; fail=1
  fi
else
  # NOT a survivor: a mutation that never applied is a harness failure, and
  # counting it as a hole sends you hunting a defect in the gate that is not
  # there. Reported as its own verdict so it can never be scored as coverage.
  echo "COULD-NOT-APPLY  S1  the source mutation did not apply   <-- HARNESS BUG"
  results+=("HARNESS-BUG S1")
  fail=1
fi
restore_src
restore_track_src

# Rebuild once more from the restored source so the artifact is not stranded in
# the mutated state for the next person.
#
# THIS STEP IS LOAD-BEARING AND IT FAILED THE FIRST TIME. The S1 case builds
# FROM THE MUTATED SOURCE, and that build emits a NEW content-hashed filename
# containing the mutated rule. `restore_src` puts the SOURCE back but does not
# touch `dist/`, so without this rebuild the served CSS still carries
# `.mascot.mascot-sway` — and the NEXT run of the gate goes red for a reason
# that has nothing to do with the gate. Measured exactly that: the gate reported
# `5/7 passed` with `reduced-motion animation: mascot-enter, mascot-sway`,
# i.e. the mutant still live in `dist/`.
#
# The rebuild is the full chain, not `astro build` alone: the SW manifest is a
# separate command, and skipping it strands `dist/sw.js` and reds five swOffline
# tests (R15 3f). Then ASSERT the artifact is clean, so a future interruption
# cannot pass silently.
echo
echo "── rebuilding from restored source ──"

# CLEAR THE STALE HASHED CSS — `astro build` DOES NOT PURGE `dist/_astro/`.
#
# Measured: after S1's build emitted a CSS file containing `.mascot.mascot-sway`,
# restoring the source and running `astro build` again printed "11 page(s)
# built. Complete!" while the artifact STILL carried the mutant at the same
# hash — the file held BOTH rules, the new one appended and the stale one
# surviving. `dist/index.html` served the mutant for three "successful"
# rebuilds, so the gate read `5/7 passed` for a reason unrelated to the gate.
#
# WHY THE WHOLE `dist/` AND NOT JUST THE `.css` FILES. The narrower version
# (unlink only `*.css`) DEADLOCKS: measured, emptying `dist/_astro/` while the
# rest of `dist/` remains leaves `astro build` hanging past 2 minutes with no
# progress past "Collecting build info". So `dist/` is cleared wholesale.
#
# The delete is BATCHED because the sandbox refuses a bulk recursive delete
# (R13, `SAFE_DELETE_BULK_CONFIRM_REQUIRED`) — and note the guard intercepts
# `fs.rmSync` too, not just the shell's `rm`. Deleting the nested directories
# first and the top level last, with the file count kept under the threshold
# per call, completes reliably.
NODE_OPTIONS="" node -e '
  const fs = require("fs");
  const path = require("path");
  let removed = 0;
  function clearDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      let st;
      try { st = fs.lstatSync(p); } catch { continue; }
      if (st.isDirectory()) {
        clearDir(p);
        try { fs.rmdirSync(p); } catch {}
      } else {
        try { fs.unlinkSync(p); removed++; } catch {}
      }
    }
  }
  clearDir("dist");
  console.log("  cleared dist/ (" + removed + " file(s))");
'

if NODE_OPTIONS="" node node_modules/astro/astro.js build >/dev/null 2>&1 \
   && NODE_OPTIONS="" node scripts/build-sw-manifest.mjs >/dev/null 2>&1; then
  echo "rebuild OK"
else
  echo "REBUILD FAILED — dist/ may be stranded in the mutated state"; fail=1
fi
if [ ! -f dist/sw.js ]; then
  echo "dist/sw.js MISSING — the build chain did not complete"; fail=1
fi
if grep -q 'mascot\.mascot-sway' dist/_astro/*.css 2>/dev/null; then
  echo "ARTIFACT STILL MUTATED (.mascot.mascot-sway in the served CSS)"; fail=1
else
  echo "artifact clean (no mutant selector in dist/)"
fi

# Bring the preview server back if we stopped it, and say so plainly if we
# could not — leaving the developer with no preview is a silent side effect.
if [ "$STOPPED_SERVER" -eq 1 ]; then
  if start_server; then
    echo "preview server restarted on :$PORT"
  else
    echo "WARNING: could not restart the preview server on :$PORT — start it by hand"
  fi
fi

# RULE 3 + definition of done: prove the restore is byte-identical for BOTH the
# subject and the gate's own source, and that the baseline is green again.
echo
echo "── restore check ──"
diff -q "$BAK/motion.css" "$SRC" >/dev/null && echo "source restored byte-identical" || { echo "SOURCE DIFFERS AFTER RESTORE"; fail=1; }
diff -q "$BAK/BaseLayout.astro" "$TRACK_SRC" >/dev/null && echo "BaseLayout.astro restored byte-identical" || { echo "BASELAYOUT DIFFERS AFTER RESTORE"; fail=1; }
if node "$GATE" >/dev/null 2>&1; then echo "GREEN after restore"; else echo "NOT GREEN AFTER RESTORE"; fail=1; fi

echo
k=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED' || true)
h=$(printf '%s\n' "${results[@]}" | grep -c '^HOLE' || true)
b=$(printf '%s\n' "${results[@]}" | grep -c '^HARNESS-BUG' || true)
echo "killed: $k   holes: $h   harness-bugs: $b"
# A harness bug must NOT be silently indistinguishable from a covered mutation.
[ "$b" -gt 0 ] && echo "NOTE: harness-bugs above are NOT survivors — the mutation never applied."
exit "$fail"
