#!/usr/bin/env bash
# Mutation battery for scripts/ci/verify-pwa.mjs.
#
# WHY A BATTERY
# -------------
# This gate guards three things that have ALREADY silently regressed once:
#
#   1. a generator bug emitted `const VERSION = '...';\n  "/foo",` — a syntax
#      error that would have shipped a DEAD service worker
#   2. the manifest pointed at an external Supabase Storage URL, so an
#      unreachable bucket meant no icon and an un-installable PWA
#   3. BaseLayout referenced remote icon hrefs
#
# Every one of those was invisible until someone noticed. The gate exists to
# make them visible, so the gate itself is the thing that must be shown to fail.
#
# HOW THIS DIFFERS FROM THE OTHER BATTERIES
# -----------------------------------------
# **The input is BUILD OUTPUT, not source.** `dist/` is gitignored (line 2), so
# there is no HEAD copy to restore from — and no "poisoned file" concern either,
# because the gate only READS it. This battery therefore backs up and restores
# from the LIVE file, which is correct HERE and wrong in the source-tree
# batteries. The rule is not "never cp the live file"; it is "never cp a file a
# previous aborted run could have mutated".
#
# The consequence for the restore proof: `git status` cannot be the witness (the
# files are untracked), so it compares bytes against a local backup and asserts
# the gate is green again.
#
# IF dist/ IS ABSENT the battery refuses to run rather than skipping cases: the
# gate would report "missing" for everything, and a battery measuring that would
# be measuring the wrong thing. Build first — the gate's own error says so.
#
# DEFECT CLASSES
# --------------
#   W1  one KILL per independent assertion the gate makes:
#         W1a  a syntax error in sw.js (the dead-worker bug)
#         W1b  an empty PRECACHE
#         W1c  a Windows backslash path in PRECACHE
#         W1d  VERSION not rewritten at build time
#         W1e  a remote icon URL in the manifest (the Supabase bug)
#         W1f  a manifest icon missing on disk
#   W2  controls that MUST stay green — a gate that always fails is worthless:
#         W2a  the unmodified build passes (baseline control)
#         W2b  a remote canonical link is NOT mistaken for an icon
#
# All mutations live in scripts/ci/pwa-mutate.mjs, a ship-with-the-battery file.
# The first draft embedded them as `node -e "..."` and the backslash case
# produced a DOUBLE backslash — exercising an escaped backslash rather than the
# real defect. Each mutation now asserts its own replacement landed (exit 3 if
# not), so a silent no-op aborts the battery instead of yielding a verdict.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/verify-pwa.mutations.sh
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

GATE=scripts/ci/verify-pwa.mjs
MUTATOR=scripts/ci/pwa-mutate.mjs
SW=dist/sw.js
MF=public/manifest.webmanifest
LAYOUT=src/layouts/BaseLayout.astro
BAK=.tmp-pwamfut
fail=0
results=()

# ── 1 · Preconditions, asserted rather than assumed ─────────────────────────
if [ ! -f "$SW" ]; then
  echo "ABORT: $SW not found. This battery mutates BUILD OUTPUT, so it needs a"
  echo "       completed build. Run: npm run build"
  exit 1
fi
if [ ! -f "$MUTATOR" ]; then
  echo "ABORT: $MUTATOR is missing — it ships with this battery. Commit it."
  exit 1
fi

mkdir -p "$BAK"
cp "$SW" "$BAK/sw.orig"
cp "$MF" "$BAK/mf.orig"
cp "$LAYOUT" "$BAK/layout.orig"

restore_all() {
  [ -f "$BAK/sw.orig" ] && cp "$BAK/sw.orig" "$SW"
  [ -f "$BAK/mf.orig" ] && cp "$BAK/mf.orig" "$MF"
  [ -f "$BAK/layout.orig" ] && cp "$BAK/layout.orig" "$LAYOUT"
}
trap restore_all EXIT

# ── 2 · RULE: never interpret mutations against an already-red baseline ─────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on an unmutated build."
  echo "  This battery does not touch the gate source, so the cause is the"
  echo "  INPUT: dist/ was built from something the gate already rejects."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"

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

# Apply a mutation, aborting the whole battery if it did not land.
mutate_or_die() {
  local case_name="$1"
  if ! node "$MUTATOR" "$case_name"; then
    echo "ABORT: mutation '$case_name' did not apply — no verdict can be read from it."
    restore_all
    exit 1
  fi
}

# ── W2a · the control: the untouched build passes ───────────────────────────
check "W2a the unmodified build passes (baseline control)" equivalent

# ── W1a · a dead service worker ─────────────────────────────────────────────
mutate_or_die syntax
check "W1a a syntax error in sw.js is caught (the dead-worker bug)" kill
restore_all

# ── W1b · a truncated PRECACHE ─────────────────────────────────────────────
mutate_or_die empty-precache
check "W1b an empty PRECACHE is caught" kill
restore_all

# ── W1c · a Windows backslash path ─────────────────────────────────────────
mutate_or_die backslash
check "W1c a backslash path in PRECACHE is caught" kill
restore_all

# ── W1d · VERSION not rewritten ────────────────────────────────────────────
mutate_or_die dev-version
check "W1d an unrewritten dev VERSION is caught" kill
restore_all

# ── W1e · a remote icon URL ────────────────────────────────────────────────
mutate_or_die remote-icon
check "W1e a remote icon URL in the manifest is caught (the Supabase bug)" kill
restore_all

# ── W1f · a manifest icon that does not exist ──────────────────────────────
mutate_or_die missing-icon
check "W1f a manifest icon missing on disk is caught" kill
restore_all

# ── W2b · a remote-looking string must NOT trip the icon check ─────────────
mutate_or_die remote-canonical
check "W2b a remote canonical link is not mistaken for an icon" equivalent
restore_all

# ── 3 · RULE: byte-identical restore, and green again ──────────────────────
echo
restore_all

if ! diff -q "$BAK/sw.orig" "$SW" >/dev/null; then
  echo "RESTORE FAILED — $SW is not byte-identical to its backup"
  fail=1
fi
if ! diff -q "$BAK/mf.orig" "$MF" >/dev/null; then
  echo "RESTORE FAILED — $MF is not byte-identical to its backup"
  fail=1
fi
if ! diff -q "$BAK/layout.orig" "$LAYOUT" >/dev/null; then
  echo "RESTORE FAILED — $LAYOUT is not byte-identical to its backup"
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
