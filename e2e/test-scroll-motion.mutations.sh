#!/usr/bin/env bash
# Mutation battery for e2e/test-scroll-motion.mjs.
#
# WHY A BATTERY
# -------------
# The guard asserts something that became TRUE only after this round's change:
# that motion.css §9f's scroll-linked drift actually RUNS in a browser, moves
# continuously, and reverses. A guard written against the fixed tree passes on
# the fixed tree by construction, so "the guard is green" is not evidence that
# the guard can see the defect it claims to pin.
#
# That matters more than usual here, because §9f fails SILENTLY and in SEVERAL
# independent ways, and each of them leaves a stylesheet that a reader — and
# every static gate in this repo (`verify:keyframes`, `verify:classes`) —
# would call correct:
#
#   * the `@supports (animation-timeline: view())` wrapper is dropped, so the
#     rules never apply at all;
#   * the `prefers-reduced-motion: no-preference` media query is dropped or
#     inverted, so the drift is inert;
#   * the declaration ORDER is wrong — the `animation` shorthand RESETS
#     `animation-timeline`, so placing it after `animation-timeline: view()`
#     silently reverts to a TIME-based animation (which still moves!);
#   * `animation-timeline` is removed outright, which is the same time-based
#     behaviour;
#   * `animation-range` is narrowed, so the drift covers only a sliver of the
#     band and reads as constant at most offsets;
#   * §9f's selector loses the specificity war against §9b's one-shot entrance
#     — the `html.js-reveal [data-scroll][data-enter]` shape is what wins it,
#     and a plain `[data-scroll]` loses on 2 of the 4 bands;
#   * the drift is moved onto the hoverable surface, which eats the §9c
#     hover recipe (a CSS animation on `transform` overrides a transition on
#     the same property of the SAME element — §9d's measured rule);
#   * the amount is scaled up, which is the opposite of the request (SLOW it
#     down).
#
# Each mutation below re-introduces ONE of those, and the guard must exit
# non-zero for every one of them.
#
# THE MUTATION IS APPLIED TO A FILE THE BATTERY THE HARNESS TESTS A BUILT ARTIFACT
# --------------------------------------------------------------------------------
# §9f lives in `src/styles/motion.css`, which the build inlines into a
# content-hashed CSS bundle. Two traps follow, and both are handled below:
#
#  1. **The mutation must reach dist/.** A mutation that was never rebuilt looks
#     exactly like a SURVIVED — a hole reported where there is none. Every step
#     rebuilds and compares the built bundle's content against the baseline,
#     aborting if it is unchanged.
#  2. **The guard needs a server.** Unlike the source-level gates, this one
#     drives a browser, so the battery starts its own preview server and aborts
#     if it does not come up. That check redirects stdout rather than using
#     `curl -o /dev/null`, because `curl -o /dev/null` exits 23 even on a 200
#     and a readiness loop written that way never breaks.
#
# WHY THE BACKUP IS OUTSIDE THE REPO AND THE CLEANUP IS IN A try/catch
# -------------------------------------------------------------------
# Same lesson as e2e/test-labels.mutations.sh: a refused delete during cleanup
# must not mask the verdict, and a fixture must not be left in the tree. The
# backup goes to the OS temp dir and the removal cannot throw.
#
# Must be run with cwd = repo root:  bash e2e/test-scroll-motion.mutations.sh
set -u

CSS=src/styles/motion.css
SECTION=src/components/public/Section.astro
GUARD=e2e/test-scroll-motion.mjs
BAK="${TMPDIR:-/tmp}/asj-scrollmotion-bak.$$"
PORT=4367
BASE="http://127.0.0.1:${PORT}"

fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
restore_all() {
  for f in "$CSS" "$SECTION"; do
    local b="$BAK/$(key "$f")"
    [ -f "$b" ] && cp "$b" "$f"
  done
}

# THE BUILT BUNDLE THIS MUTATION MUST LAND IN. Astro inlines the styles into a
# content-hashed file, so an unchanged hash means the mutation never reached the
# artifact the guard is served — which reads as SURVIVED and is a lie.
sig() { grep -o "_astro/[A-Za-z0-9_.-]*\.css" dist/index.html 2>/dev/null | sort | tr '\n' ' '; }

# `mut()` asserts EXACTLY ONE match, so a stale anchor fails loudly instead of
# silently becoming a no-op that then reads as SURVIVED. The values travel via
# the environment, never a heredoc: this repo has been bitten by Git-Bash
# eating backticks inside heredocs, and a multi-line anchor written literally
# inside the shell would not match a CRLF file.
mut() {
  MUT_FILE="$1" MUT_OLD="$2" MUT_NEW="$3" node -e '
const fs = require("fs");
const p = process.env.MUT_FILE;
const s = fs.readFileSync(p, "utf8");
const o = process.env.MUT_OLD;
const hits = s.split(o).length - 1;
if (hits !== 1) {
  console.error("MUTATION DID NOT APPLY (hits=" + hits + "): " + JSON.stringify(o.slice(0, 90)));
  process.exit(3);
}
fs.writeFileSync(p, s.replace(o, process.env.MUT_NEW));
'
}

check() {
  local label="$1" rc="$2"
  if [ "$rc" -ne 0 ]; then
    echo "KILLED     exit=$rc  $label"
    results+=("KILLED $label")
  else
    echo "SURVIVED   exit=0   $label   <-- HOLE: this defect is not pinned"
    results+=("SURVIVED $label")
    fail=1
  fi
}

# The OK-GREEN verdict: a mutation that changes NOTHING the guard should care
# about must leave the guard GREEN. A red here means the guard over-constrains,
# which is its own defect — so it is judged, and it fails the battery too.
check_green() {
  local label="$1" rc="$2"
  if [ "$rc" -eq 0 ]; then
    echo "OK-GREEN   exit=0   $label"
    results+=("OK-GREEN $label")
  else
    echo "UNEXPECTED exit=$rc  $label   <-- the guard rejects a valid tree"
    results+=("UNEXPECTED $label")
    fail=1
  fi
}

# rebuild -> prove the mutation reached dist/ -> run the guard -> restore.
# `verdict` selects the judging function: `check` for a defect that must be
# KILLED, `check_green` for a control that must stay GREEN.
judge() {
  local label="$1" base="$2" verdict="${3:-check}"
  node node_modules/astro/astro.js build >/dev/null 2>&1
  local now
  now=$(sig)
  if [ "$now" = "$base" ]; then
    echo "ABORT: the mutation for '$label' never reached dist/ (css bundle still ${now:-<none>})."
    exit 1
  fi
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  local rc=$?
  "$verdict" "$label" "$rc"
  restore_all
}

step() {
  local label="$1" base="$2" file="$3" old="$4" new="$5"
  restore_all
  if ! mut "$file" "$old" "$new"; then
    echo "ABORT: the mutation for '$label' did not apply."
    exit 1
  fi
  judge "$label" "$base"
}

# Same as step, but installs TWO mutations first. Used by M9, which has to move
# BOTH the band rule and the card rule onto the hoverable surface — moving only
# one leaves the other drift element clean and the collision check can still pass.
step2() {
  local label="$1" base="$2" file="$3" o1="$4" n1="$5" o2="$6" n2="$7"
  restore_all
  if ! mut "$file" "$o1" "$n1"; then echo "ABORT: first mutation for '$label' did not apply."; exit 1; fi
  if ! mut "$file" "$o2" "$n2"; then echo "ABORT: second mutation for '$label' did not apply."; exit 1; fi
  judge "$label" "$base"
}

mkdir -p "$BAK"
restore_all || true
cp "$CSS" "$BAK/$(key "$CSS")"
cp "$SECTION" "$BAK/$(key "$SECTION")"

# ── server ──────────────────────────────────────────────────────────────────
node node_modules/astro/astro.js preview --host 127.0.0.1 --port "$PORT" >/dev/null 2>&1 &
PREVIEW_PID=$!
trap 'kill "$PREVIEW_PID" 2>/dev/null; restore_all' EXIT
UP=0
for _ in $(seq 1 40); do
  # stdout to /dev/null, NOT `-o /dev/null`: the latter exits 23 even on a 200.
  curl -fsS "$BASE/" >/dev/null 2>&1 && { UP=1; break; }
  sleep 1
done
if [ "$UP" -ne 1 ]; then
  echo "ABORT: the preview server never came up on $BASE."
  exit 1
fi

# ── baseline must be green before any mutation is interpreted ───────────────
node node_modules/astro/astro.js build >/dev/null 2>&1
BASE_CSS=$(sig)
if [ -z "$BASE_CSS" ]; then
  echo "ABORT: could not read the built css bundle name from dist/index.html."
  exit 1
fi
if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "BASELINE RED — the guard fails on an unmutated tree. Aborting."
  BASE_URL="$BASE" node "$GUARD" || true
  exit 1
fi
echo "baseline green (bundle: $BASE_CSS)"

# ── ANCHORING ───────────────────────────────────────────────────────────────
# §9d and §9e carry the SAME `@supports (animation-timeline: view())` wrapper
# and the same `animation-range: cover 0% cover 100%;` declaration as §9f, so a
# bare one-line anchor matches three or four times and `mut()` aborts. Every
# anchor below is therefore a MULTI-LINE slice that starts at §9f's own
# marker comment — the shortest prefix that is unique to this section.
#
# The `$'…'` form is load-bearing: these files are CRLF, so `\r\n` is written
# explicitly. A literal newline inside a single-quoted shell string would never
# match, and the mutation would silently become a no-op that reads as SURVIVED.
#
# §9f's block, verbatim, as it must appear in the source for each anchor to hit.
M2_OLD=$'@supports (animation-timeline: view()) {\r\n  @media (prefers-reduced-motion: no-preference) {\r\n    /* ── WHY THESE SELECTORS ARE SO LONG, AND WHY IT IS NOT AN ACCIDENT ────'

# §9f's declaration block for the band rule, used as the anchor by M3/M4/M5 —
# each of which changes ONE declaration inside it, so all three must anchor on
# the same slice and can therefore share it.
BAND_BLOCK=$'      animation: scroll-drift-y linear both;\r\n      animation-duration: auto;\r\n      animation-timeline: view();\r\n      animation-range: cover 0% cover 100%;\r\n    }\r\n\r\n    /* A band that somehow carries'

# ── M1: the feature is switched off entirely ────────────────────────────────
# The support check is what a browser without scroll-driven animations falls
# back to. This makes §9f's first rule match NOTHING, so the drift is dead while
# the stylesheet still reads as if it were implemented.
#
# ── WHY NOT `and (min-width: 0px)` ──────────────────────────────────────────
# The first version of this mutation appended a viewport condition to the
# `@supports`, and it SURVIVED — correctly, because the mutation was invalid.
# `@supports` evaluates whether a DECLARATION PARSES, not whether a media
# feature is currently true, so `@supports (…) and (min-width: 0px) and
# (max-width: 0px)` still matched and the drift ran. A battery's mutation must
# itself be sound, or a SURVIVED reports a hole that does not exist.
step "M1  §9f's selectors neutralised (the whole drift is dead code)" \
     "$BASE_CSS" "$CSS" \
     '    html.js-reveal [data-scroll][data-enter] {' \
     '    html.js-reveal .no-such-scroll-hook[data-enter] {'

# ── M2: inert under reduce-motion (inverted media query) ────────────────────
# A gate nested in a media query that never matches is invisible to a reader
# and to every static check.
step "M2  no-preference media query inverted (drift never applies)" \
     "$BASE_CSS" "$CSS" \
     "$M2_OLD" \
     $'@supports (animation-timeline: view()) {\r\n  @media (prefers-reduced-motion: reduce) {\r\n    /* ── WHY THESE SELECTORS ARE SO LONG, AND WHY IT IS NOT AN ACCIDENT ────'

# ── M3: ORDER — the shorthand resets the timeline ───────────────────────────
# This is the subtle one, and the reason the guard checks REVERSIBILITY and not
# just "does it move". Re-emitting the shorthand after `animation-timeline`
# resets the timeline to `auto`, so the animation becomes TIME-based: it still
# moves, and a naive "distinct transforms > 1" check would still pass. Only the
# "same offset from below reads the same value" assertion kills it.
step "M3  declaration order broken (animation shorthand resets the timeline)" \
     "$BASE_CSS" "$CSS" \
     "$BAND_BLOCK" \
     $'      animation: scroll-drift-y linear both;\r\n      animation-duration: auto;\r\n      animation-timeline: view();\r\n      animation-range: cover 0% cover 100%;\r\n      animation: scroll-drift-y 4s linear infinite;\r\n    }\r\n\r\n    /* A band that somehow carries'

# ── M4: the timeline is never bound ────────────────────────────────────────
# A plain time-based animation. Moves from load, ignores scroll position.
step "M4  animation-timeline not bound (time-based, ignores scroll)" \
     "$BASE_CSS" "$CSS" \
     "$BAND_BLOCK" \
     $'      animation: scroll-drift-y linear both;\r\n      animation-duration: auto;\r\n      animation-timeline: auto;\r\n      animation-range: cover 0% cover 100%;\r\n    }\r\n\r\n    /* A band that somehow carries'

# ── M5: the drift is compressed into a sliver of the band ──────────────────
# The whole travel happens across 2% of the band, so the transform sits clamped
# at one extreme for most of it and SNAPS through — a jump, not a slow drift.
#
# THIS MUTATION IS WHY THE GUARD HAS A SMOOTHNESS CHECK. It SURVIVED a guard
# that only asserted "more than one distinct transform": measured, the five
# samples read -12, -12, -5.9, +12, +12 — three distinct values, so the naive
# count passed while the motion the visitor sees is a snap. The assertion is now
# on consecutive pairs, and this is the regression test for it.
step "M5  animation-range compressed to a sliver (snaps, not drifts)" \
     "$BASE_CSS" "$CSS" \
     "$BAND_BLOCK" \
     $'      animation: scroll-drift-y linear both;\r\n      animation-duration: auto;\r\n      animation-timeline: view();\r\n      animation-range: cover 49% cover 51%;\r\n    }\r\n\r\n    /* A band that somehow carries'

# ── M6: §9f loses the specificity war against §9b ──────────────────────────
# The real defect found by measurement on 2026-09-27: Section.astro emits BOTH
# data-enter and data-scroll from the same prop, so a plain `[data-scroll]`
# (0,1,0) is outranked by §9b's `html.js-reveal [data-enter=…].is-entered`
# (0,3,1) and the band keeps its one-shot `enter-grow` animation.
step "M6  §9f selector loses specificity to §9b (band keeps enter-*)" \
     "$BASE_CSS" "$CSS" \
     '    html.js-reveal [data-scroll][data-enter] {' \
     '    [data-scroll][data-enter] {'

# ── M9: the drift is moved onto the hoverable surface ──────────────────────
# §9d's measured rule: a CSS animation on `transform` overrides a transition on
# the same property of the SAME element, so this eats the §9c hover recipe.
# Both the band rule AND the card rule are moved, because leaving either one
# clean gives the collision check a valid element to find nothing on.
step2 "M9  the drift is moved onto the hoverable surface (kills §9c hover)" \
      "$BASE_CSS" "$CSS" \
      '    [data-scroll-item] > * {' \
      '    [data-scroll-item] > .u-lift, [data-scroll-item] > .u-zoom {' \
      '    html.js-reveal [data-scroll][data-enter] {' \
      '    html.js-reveal [data-scroll][data-enter].u-lift {'

# ── M7: the amount is scaled up (the opposite of "perlambat") ──────────────
# The request was to SLOW the motion. A 20x drift flings the band across the
# viewport — a large, obvious change that the travel ceiling must still catch.
step "M7  drift amount scaled up 20x (motion flung, not slowed)" \
     "$BASE_CSS" "$CSS" \
     '  --scroll-drift: 10px;' \
     '  --scroll-drift: 200px;'

# ── OK-GREEN CONTROL: the per-kind sets are removed ────────────────────────
# Deliberately NOT expected to be KILLED — this is the battery's own
# OK-GREEN CONTROL. Removing the per-kind `--scroll-drift` OVERRIDES leaves
# every kind on the :root default, which is still a correct, continuous,
# reversible drift. If the guard failed here it would be over-constraining a
# taste detail, so this must stay GREEN. Without a case like this, "every
# mutation was killed" would be indistinguishable from a guard that fails on
# anything at all.
restore_all
if ! mut "$CSS" '    [data-scroll="slide-left"]  { --scroll-drift: -10px; }' '    [data-scroll="slide-left"]  { /* removed */ }'; then
  echo "ABORT: the control mutation did not apply."
  exit 1
fi
judge "per-kind drift sets removed (still a valid drift — must stay green)" "$BASE_CSS" check_green

# ── byte-identical restore, and green again ────────────────────────────────
echo
for f in "$CSS" "$SECTION"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done
node node_modules/astro/astro.js build >/dev/null 2>&1
# `astro build` alone skips `build-sw-manifest.mjs`, which `npm run build`
# chains on. Leaving that out leaves the service worker on its dev placeholder
# and reddens unrelated tests, so it is repaired here.
node scripts/build-sw-manifest.mjs >/dev/null 2>&1
if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
echo "ok-green: $(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN')"
echo "unexpected: $(printf '%s\n' "${results[@]}" | grep -c '^UNEXPECTED')"
# Wrapped so a refused delete can never mask the verdict above. The backup is in
# the OS temp dir, so even a refusal leaves nothing in the tree.
node -e 'try{require("fs").rmSync(process.argv[1],{recursive:true,force:true})}catch(e){console.error("[cleanup] could not remove "+process.argv[1]+": "+String(e.message).split("\n")[0])}' "$BAK" || true
exit "$fail"
