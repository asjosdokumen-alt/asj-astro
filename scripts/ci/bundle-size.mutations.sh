#!/usr/bin/env bash
# Mutation battery for scripts/ci/bundle-size.mjs.
#
# WHY A BATTERY
# -------------
# This gate is the ratchet that stops the refactor from silently regressing. Its
# predecessor problem was structural: 11 entry points shipped the full action
# router as ~1.5 MB monoliths and nothing measured it. So the gate that replaced
# that blindness must itself be shown to fail.
#
# It has THREE independent failure paths, and a battery that only exercises one
# of them would leave the other two unproven — so each gets its own case:
#
#   1. the per-entry ceiling  (MAX_ENTRY_KB, 600 KB, non-catch-all only)
#   2. the total ceiling      (MAX_TOTAL_KB, 10 MB)
#   3. the ratchet            (baseline growth, needs BOTH % AND an absolute floor)
#
# DEFECT CLASSES
# --------------
#   P1  an entry over the per-entry ceiling                -> KILL (ceiling)
#   P2  the catch-all EXEMPTION applies                     -> OK-GREEN (by design)
#   P3  total over the total ceiling                        -> KILL (total)
#   P4  a ratchet breach beyond BOTH thresholds             -> KILL (ratchet)
#   P5  growth real but UNDER the absolute floor             -> OK-GREEN (by design)
#   P5b the SAME growth with the floor removed               -> KILL (proves which
#       of the two conditions decides — a lone OK-GREEN on P5 would also be
#       satisfied by a gate that simply ignores the ratchet)
#   P6  the ratchet baseline is missing                      -> KILL (found by this battery)
#
# P2/P5 are the ones most likely to be "fixed" by a future reader who sees only
# the failure cases. They are deliberate: a declared catch-all is SUPPOSED to be
# big, and the 8 KB floor exists because a pure 5% tolerance tripped on ~3 KB of
# intended additions and trained people to re-baseline without reading the diff.
# Marking them as "holes" would be the actual regression.
#
# WHAT THIS BATTERY ALREADY CAUGHT
# --------------------------------
# P6. With the baseline absent the gate printed a bare "bundle size gate: pass"
# and never ran the ratchet — a green verdict that had silently shed half its
# job. The ceilings still ran, so the output was not empty, which is precisely
# what made it hard to notice. The ratchet's own comment calls it the thing that
# "actually holds the line", so losing it silently left the weakest check
# reported as the strongest. Fixed: exit 2, distinct from exit 1 (a real
# regression), because a missing file is a configuration problem and conflating
# the two is how a broken setup gets read as a finding.
#
# HOW THE MUTATIONS WORK
# ----------------------
# The gate's INPUT is the bundle size of each entry point, which is derived from
# the source on disk. Rather than fake the measurement, the battery makes a real
# entry genuinely bigger by appending code to it, and restores it afterwards.
# That is slower than stubbing a number but it exercises the same path the gate
# will walk in production, including the bundler.
#
# Thresholds are passed as CLI flags instead of being patched in the source.
# The gate already exposes --max-entry / --max-total / --tolerance /
# --tolerance-floor, so the cases below set them rather than mutating the gate —
# fewer mutation targets, and it proves the flags are actually wired.
#
# TRAPS, ALL REAL
# ---------------
#  1. **A stale baseline makes the ratchet cases meaningless.** P4/P5 assert
#     against scripts/ci/bundle-size-baseline.json. If it is absent the ratchet
#     block is skipped entirely, and `check` would read exit 0 as "green" for a
#     case that never ran. Asserted present up front.
#
#     Staleness is the harder half of the same trap, and it HAS A SIGNATURE:
#     **P5 reports UNEXPECTED.** P5 subtracts a fixed 2 KB from each entry, which
#     is "over 5% but under the 8 KB floor" only for SMALL entries — exactly what
#     the case means to demonstrate. Real growth accumulates under the floor over
#     time, and once an entry's real growth approaches 8 KB, the fixture's extra
#     2 KB tips it over. Measured 2026-09-18: the committed baseline was 79
#     commits old and every entry had grown ~6.1 KB, so ingest.js, mail.js and
#     master-data.js all reported "+8.1 KB" and the gate exited 1. The gate was
#     right and the case was right; the BASELINE was stale. Remedy:
#     `npm run bundle:baseline`, the documented routine step
#     (docs/PHASE_A_LEGACY_ENDPOINT_RETIREMENT.md shows the pattern).
#
#     Do NOT "fix" this by weakening the fixture's 2 KB, and do not read the
#     UNEXPECTED as a hole in the gate. The 2 KB is what makes P5b able to prove
#     the floor — not the percentage — is what lets P5 through.
#  2. **Restoring a borrowed file by `cp` rewrites its EOL.** netlify/functions
#     is not pinned by .gitattributes (only *.mjs/*.cjs are), so with
#     core.autocrlf=true a working-tree CRLF file restored from a git-sourced
#     LF blob becomes a phantom modification. Restore therefore uses
#     `git checkout HEAD --`, and the final check asserts GIT sees no change —
#     a backup-to-backup diff cannot detect an EOL rewrite.
#  3. **An aborted run poisoning the next one.** `trap cleanup EXIT` restores on
#     every path; a `zz-battery-` prefix sweep clears litter from a previous
#     PROCESS (a trap cannot see it); and the gate backup comes from
#     `git show HEAD:<path>`, never from the live file, so an already-mutated
#     gate cannot be laundered back into place.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/bundle-size.mutations.sh
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

GATE=scripts/ci/bundle-size.mjs
FNDIR=netlify/functions
BASELINE=scripts/ci/bundle-size-baseline.json
BAK=.tmp-bundlemfut
fail=0
results=()
CREATED=()

# ── 1 · Capture the gate from git before anything can touch it ──────────────
mkdir -p "$BAK"
if ! git show "HEAD:$GATE" > "$BAK/gate.orig" 2>/dev/null; then
  echo "ABORT: cannot read $GATE from git HEAD — is the file tracked?"
  exit 1
fi
# `.mjs` is pinned eol=lf, so the blob's bytes are the working tree's bytes.
# The baseline is NOT pinned (.json), so it is captured here for restoration but
# compared via git at the end — see the restore section.
cp "$BASELINE" "$BAK/baseline.orig" 2>/dev/null || true
cleanup() {
  for f in "${CREATED[@]:-}"; do [ -n "$f" ] && rm_retry "$f"; done
  [ -f "$BAK/gate.orig" ] && cp "$BAK/gate.orig" "$GATE"
  [ -f "$BAK/baseline.orig" ] && cp "$BAK/baseline.orig" "$BASELINE"
}
trap cleanup EXIT

# ── 2 · Self-heal the harness's own litter, and SAY SO ──────────────────────
if ! diff -q "$BAK/gate.orig" "$GATE" >/dev/null 2>&1; then
  echo "NOTE: $GATE was dirty on entry (a previous run left it mutated)."
  echo "      Restoring the pristine copy from git HEAD before measuring."
  cp "$BAK/gate.orig" "$GATE"
fi
sweep() {
  rm_retry "$FNDIR"/zz-battery-*.js 2>/dev/null
}
if ls -1 "$FNDIR" 2>/dev/null | grep -q '^zz-battery-'; then
  echo "NOTE: leftover zz-battery-* entry points from a previous aborted run. Sweeping."
fi
sweep

# ── 3 · Preconditions, asserted rather than assumed ─────────────────────────
if [ ! -f "$BASELINE" ]; then
  echo "ABORT: $BASELINE is missing. The ratchet cases (P4/P5) would be skipped"
  echo "       entirely and read as green. Re-baseline with:"
  echo "         node $GATE --update-baseline"
  exit 1
fi

if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on a tree the harness has already cleaned."
  echo "  Not residue (swept) and not a stale mutation (re-read from HEAD)."
  echo "  Fix the gate before trusting any verdict here."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"
echo "(note: bundling 19 entry points per check — this battery is slower than the others)"

# ── 4 · Mutation primitive ──────────────────────────────────────────────────
# `check` takes the gate's CLI flags as extra arguments (see the header: the
# thresholds are already exposed as --max-entry / --max-total / --tolerance /
# --tolerance-floor, so the cases set them instead of patching the source).
#
# The extra args are read through `"$@"` AFTER the two named parameters, not via
# `local x="${@:3}"`. The `local` form was tried first and bash rejected it:
#     local: `--max-entry': not a valid identifier
# because the expanded value was then re-split and treated as further `local`
# assignments. The flags were silently dropped and every case ran with DEFAULT
# thresholds — so the KILLs that "passed" did so by accident, and P5 (which
# exists precisely to assert the overridden floor) failed for the wrong reason.
# A dropped argument is the same class of bug as a mutation that never lands.
check() {
  local label="$1" expect="$2" rc
  shift 2
  node "$GATE" "$@" >/dev/null 2>&1
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

# ── P1 · the per-entry ceiling ──────────────────────────────────────────────
# The gate's central purpose: a narrow entry that reaches the router lands near
# 690 KB. Reproduce that shape by pushing one entry past a deliberately LOW
# ceiling — the mechanism (does the ceiling fire on a non-catch-all?) is what is
# under test, not the specific 600 KB number.
check "P1a a non-catch-all entry over the ceiling is caught" kill --max-entry 1

# And the same gate must NOT fire when the ceiling is above every entry: this
# rules out a gate that simply always fails.
check "P1b the same tree passes with a realistic ceiling" equivalent --max-entry 600

# ── P2 · the catch-all exemption ────────────────────────────────────────────
# bridge-links.js is DECLARED as the full-router catch-all, so it is exempt from
# the per-entry budget — never from the total, and it is always reported.
# With --max-entry 1 every entry is over; the failures must name only the
# non-exempt ones. Exit is 1, but the ASSERTION here is about the message, so
# this is checked by capturing output rather than the bare code.
OUT=$(node "$GATE" --max-entry 1 2>&1 || true)
if echo "$OUT" | grep -q 'bridge-links.js'; then
  if echo "$OUT" | grep -q 'exempt (declared catch-all)'; then
    echo "OK-GREEN   -      P2  bridge-links.js is exempted as a declared catch-all, and reported"
    results+=("OK-GREEN P2 catch-all exemption reported")
  else
    echo "UNEXPECTED        P2  bridge-links.js appears in the failure list, not the exempt list"
    results+=("UNEXPECTED P2 exemption not applied")
    fail=1
  fi
else
  echo "UNEXPECTED        P2  bridge-links.js is not mentioned at all — the exemption is invisible"
  results+=("UNEXPECTED P2 exemption silent")
  fail=1
fi

# ── P3 · the total ceiling ──────────────────────────────────────────────────
# Independent of the per-entry rule: every entry can be under its own ceiling
# and the deployment still be too large overall.
check "P3  total deployed code over the total ceiling is caught" kill --max-total 1
check "P3b the same tree passes with a realistic total" equivalent --max-total 10240

# ── P4 · the ratchet, BOTH thresholds ───────────────────────────────────────
# The ratchet needs `overPct` AND `overFloor`. Drive it past BOTH by feeding a
# baseline far below reality, with the tolerance floor left at 0 so the only
# thing under test is the percentage comparison.
FAKE=$BAK/fake-baseline-low.json
node -e "
const fs=require('fs');
const real=JSON.parse(fs.readFileSync('$BASELINE','utf8'));
const shim={updatedAt:'battery',totalKb:1,count:real.count,entries:{}};
for(const k of Object.keys(real.entries||{})) shim.entries[k]=1;
fs.writeFileSync('$FAKE',JSON.stringify(shim));
"
# The baseline path is fixed inside the gate, so point it there temporarily and
# restore from git afterwards — `cleanup` holds the original.
cp "$FAKE" "$BASELINE"
check "P4  a ratchet breach beyond % AND the floor is caught" kill --tolerance-floor 0
cp "$BAK/baseline.orig" "$BASELINE"

# ── P5 · real growth that is UNDER the absolute floor stays green ───────────
# The deliberate tradeoff, not a hole. A normal run shows every entry growing
# ~5-8% while passing, because the floor absorbs it.
#
# The baseline has to be CLOSE to reality for this case to mean anything: a
# shim of 1 KB per entry makes the growth enormous in both percentage and
# absolute terms, so it fails — which would test the opposite of what this case
# claims. Set each entry 2 KB below its measured value, so the growth is well
# over 5% on small entries but under the 8 KB floor.
NEAR=$BAK/fake-baseline-near.json
node -e "
const fs=require('fs');
const real=JSON.parse(fs.readFileSync('$BASELINE','utf8'));
const shim={updatedAt:'battery',totalKb:real.totalKb,count:real.count,entries:{}};
for(const [k,v] of Object.entries(real.entries||{})) shim.entries[k]=Math.max(1, +(v-2).toFixed(1));
fs.writeFileSync('$NEAR',JSON.stringify(shim));
"
cp "$NEAR" "$BASELINE"
check "P5  growth under the absolute floor passes (by design, not a hole)" equivalent --tolerance-floor 8
cp "$BAK/baseline.orig" "$BASELINE"

# ...and the SAME near-baseline MUST fail once the floor is removed, which is
# what proves the floor — not the percentage — is what let P5 through.
cp "$NEAR" "$BASELINE"
check "P5b the same growth fails with the floor removed (proves the floor decides)" kill --tolerance-floor 0
cp "$BAK/baseline.orig" "$BASELINE"

# ── P6 · a missing baseline is refused, not silently skipped ────────────────
# This case pins a real hole found while writing this battery: with the baseline
# absent, the gate used to print a bare "bundle size gate: pass" without ever
# running the ratchet — a green verdict that had quietly shed half its job,
# while the ceilings kept the output from looking empty. It now exits 2.
#
# Exit 2 specifically, not 1: a missing baseline is a configuration problem, and
# conflating it with a real regression is how a broken setup gets read as a
# finding and "fixed" by re-baselining.
mv "$BASELINE" "$BAK/baseline.hidden"
check "P6  a missing ratchet baseline is refused" kill
mv "$BAK/baseline.hidden" "$BASELINE"

# ── 5 · RULE: byte-identical restore, and green again ───────────────────────
echo
cleanup
CREATED=()

if ! diff -q "$BAK/gate.orig" "$GATE" >/dev/null; then
  echo "RESTORE FAILED — $GATE is not byte-identical to its backup"
  fail=1
fi
if ! diff -q "$BAK/baseline.orig" "$BASELINE" >/dev/null; then
  echo "RESTORE FAILED — $BASELINE is not byte-identical to its backup"
  fail=1
fi

# Git is the only witness that catches an EOL rewrite in a directory that is not
# pinned by .gitattributes.
TREE_DIRTY=$(git status --porcelain -- "$GATE" "$BASELINE" "$FNDIR" | grep -v '^??' || true)
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
