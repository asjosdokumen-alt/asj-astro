#!/usr/bin/env bash
# Mutation battery for the indexer typecheck gate.
#
#   package.json:  typecheck:indexer = tsc -p tsconfig.indexer.json --noEmit
#
# WHY A BATTERY
# -------------
# This is the thinnest gate in the manifest: `tsc` does the checking and
# package.json supplies no logic of its own. The interesting question is
# therefore not "can tsc report a type error" — it obviously can — but "is the
# set of files it reports on actually pinned?"
#
# That distinction matters because a tsconfig `include` is the ONLY thing
# deciding scope, and tsc treats a narrowed include as entirely successful. This
# battery measured it: with `indexer/src/**/*.ts` removed from `include`, 37 of
# the 38 files in scope silently stop being checked and the gate exits **0**.
# Nothing in a normal day's work would surface that. It is the same vacuous-pass
# defect class found twice elsewhere in this session (verify-projections on an
# empty directory, bundle-size with a missing baseline), and it is what the
# scope cases below exist to pin.
#
# NOTE ON HONESTY
# ---------------
# The vacuous pass is NOT asserted as a KILL. tsc's behaviour is correct — a
# project that includes one clean file genuinely has no type errors, and there is
# no way for `tsc -p` to know how many files the author *meant* to include. The
# gate has no defect to fix. What is asserted is that the SCOPE is what the
# battery expects, so that any future narrowing trips a test rather than passing
# quietly. That is a scope assertion, and it is labelled as one.
#
# DEFECT CLASSES
# --------------
#   T1  a real type error in an in-scope file              -> KILL (exit 2)
#   T2  the same file with the error removed                -> OK-GREEN (control)
#   T3  a type error in the App tsconfig's scope must NOT
#       be caught here (the two typechecks are separate)    -> OK-GREEN
#   T4  the file-count scope matches a measured baseline    -> asserted, with the
#       number derived rather than hardcoded where possible
#   T5  a narrowing of `include` trips T4                   -> demonstrated, so T4
#       is known to be able to fail
#
# T3 is not padding. `tsconfig.indexer.json` deliberately does NOT extend the app
# tsconfig ("indexer code must never leak into `npm run typecheck`"), so the
# separation is a documented invariant and is worth pinning in the direction that
# can regress: an over-broad include in tsconfig.indexer.json.
#
# TRAPS, ALL REAL
# ---------------
#  1. **The planted file must be removed on every exit path.** A type error left
#     behind in indexer/src/ breaks `typecheck:indexer`, `idx:build` and every
#     gate downstream of them. `trap cleanup EXIT` handles it, and the file is
#     also swept up front in case a previous run was killed mid-flight.
#  2. **tsconfig.indexer.json is TRACKED and must come back byte-identical.**
#     Fixture configs are therefore written to a SEPARATE path passed via
#     `-p <file>`, never over the real one. An earlier hand-probe for this
#     analysis overwrote the real file and needed `git checkout` to recover —
#     one reason the battery takes the same care the others do.
#  3. **tsc resolves `include` relative to the tsconfig's own directory.** A
#     fixture config written into .tmp-*/ would therefore resolve
#     `indexer/src/**` against the wrong root and silently match nothing, which
#     looks identical to a working narrow-scope fixture. Fixture configs are
#     written at the repo root, where the relative paths still mean what they
#     mean in the real file. They are `.tmp-*`-prefixed so .gitignore:81 keeps
#     them out of the index.
#  4. **`tsc` exit codes are not 0/1.** A type error exits 2, as measured. Cases
#     assert "non-zero" rather than a specific value, but the measured value is
#     printed so a change in tsc's contract is visible.
#  5. **`$?` INSIDE AN `if ! cmd; then` BRANCH IS ALWAYS 0.** Measured
#     2026-09-15: `if ! false; then RC=$?; …` reports `RC=0`, because `!`
#     negates the status before the branch body runs. The first draft of T1 used
#     that form and printed "KILLED exit=0" — the verdict happened to be right
#     and the number beside it was meaningless, which is the worst kind of
#     instrument. Capture the code bare, then compare. Same defect family as
#     `OUT=$(cmd 2>&1 || true); RC=$?` in boundary.mutations.sh.
#  6. **A substring regex is the wrong tool for an include allow-list.** The
#     first T3 matched `src/**` inside the LEGITIMATE entry
#     `indexer/src/**/*.ts` and reported the correct config as broken. Parse the
#     array and compare entries; do not pattern-match over the whole file.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/typecheck-indexer.mutations.sh
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

PKG=typecheck:indexer
SRC=indexer/src
PLANT="$SRC/zz-battery-typecheck.ts"
TSCONFIG=tsconfig.indexer.json
FIXCFG=.tmp-tsc-indexer-narrow.json
fail=0
results=()

cleanup() {
  rm_retry "$PLANT" "$FIXCFG"
}
trap cleanup EXIT

# ── 1 · Sweep litter a previous aborted run may have left (trap 1) ──────────
if [ -e "$PLANT" ]; then
  echo "NOTE: $PLANT survived a previous run (killed before cleanup). Sweeping."
fi
if [ -e "$FIXCFG" ]; then
  echo "NOTE: $FIXCFG survived a previous run. Sweeping."
fi
rm_retry "$PLANT" "$FIXCFG"

# ── 2 · Baseline ────────────────────────────────────────────────────────────
if ! npm run --silent "$PKG" >/dev/null 2>&1; then
  echo "BASELINE RED — $PKG fails on a tree the harness has already cleaned."
  echo "  Fix the type errors before trusting any verdict here."
  npm run --silent "$PKG" 2>&1 | tail -10
  exit 1
fi
echo "baseline green ($PKG)"

# ── 3 · Scope measurement (T4) ──────────────────────────────────────────────
# Count the files tsc actually reports on. This is the number that silently
# collapses when `include` is narrowed, so it is the number worth asserting.
# `--listFilesOnly` is used rather than a glob so the count reflects tsc's own
# resolution (imports pulled in, excludes applied), not our guess at it.
count_scope() {
  npx tsc -p "$1" --noEmit --listFilesOnly 2>/dev/null | grep -v node_modules | wc -l | tr -d ' '
}
SCOPE_NOW=$(count_scope "$TSCONFIG")
echo "scope: $SCOPE_NOW file(s) checked by $TSCONFIG"

# The expected count is committed here deliberately. It is the ONE number this
# battery pins, and T5 below demonstrates it can fail — without that pairing a
# hardcoded count is just a comment that never runs. If the indexer legitimately
# gains or loses files, update this number in the same commit; that is the
# intended friction, because a silent change here is exactly what is being
# guarded against.
#
# Measured as 37 (indexer/src/**/*.ts, minus excluded, plus the one docs/ file
# tsconfig.indexer.json pulls in). An earlier hand-count of 38 included the
# temporary probe file the count was taken alongside — the same off-by-one an
# instrument-inside-the-measured-tree produces, which this repo's memory already
# records for the indexer inventory ratchet.
SCOPE_EXPECTED=37
if [ "$SCOPE_NOW" -eq "$SCOPE_EXPECTED" ]; then
  echo "OK-GREEN   -      T4  scope is $SCOPE_EXPECTED file(s), as expected"
  results+=("OK-GREEN T4 scope count $SCOPE_EXPECTED")
else
  echo "UNEXPECTED        T4  scope is $SCOPE_NOW file(s), expected $SCOPE_EXPECTED"
  echo "                      If the indexer gained/lost files legitimately, update"
  echo "                      SCOPE_EXPECTED in this file in the same commit."
  echo "                      If it DROPPED, check $TSCONFIG's include list — a"
  echo "                      narrowed include makes $PKG pass over fewer files."
  results+=("UNEXPECTED T4 scope drift $SCOPE_NOW != $SCOPE_EXPECTED")
  fail=1
fi

# ── 4 · T5 · prove the scope assertion can fail ─────────────────────────────
# Write a fixture config at the REPO ROOT (trap 3) with indexer/src/** removed,
# and confirm the count collapses. Without this, T4 above is an assertion whose
# failure mode has never been observed.
node -e "
  const fs = require('node:fs');
  const src = fs.readFileSync('$TSCONFIG', 'utf8');
  const needle = '\"include\": [\"indexer/src/**/*.ts\", \"docs/code-index-schema.ts\"]';
  if (!src.includes(needle)) {
    console.error('ABORT: include list in $TSCONFIG is not the shape this battery expects:');
    console.error('        ' + needle);
    process.exit(1);
  }
  fs.writeFileSync('$FIXCFG', src.replace(needle, '\"include\": [\"docs/code-index-schema.ts\"]'));
" || { echo "ABORT: could not build the narrowed fixture config."; exit 1; }

SCOPE_NARROW=$(count_scope "$FIXCFG")
if [ "$SCOPE_NARROW" -lt "$SCOPE_NOW" ]; then
  echo "OK-GREEN   -      T5  narrowing \`include\` collapses scope to $SCOPE_NARROW (T4 can fail)"
  results+=("OK-GREEN T5 narrowing trips the scope assertion")
else
  echo "UNEXPECTED        T5  narrowing \`include\` did NOT reduce the scope ($SCOPE_NARROW)"
  echo "                      T4 is therefore not measuring what it claims to."
  results+=("UNEXPECTED T5 narrowing invisible")
  fail=1
fi
rm_retry "$FIXCFG"

# ── 5 · T1/T2 · a real type error, then its absence ─────────────────────────
# The gate's primary purpose. The planted file is inside indexer/src/, so it is
# in scope by construction.
#
# The exit code is captured BARE, then tested. Reading `$?` inside an
# `if ! cmd; then` branch always yields 0 — measured 2026-09-15 as
# `after-bang RC=0` against a command that really exited 1 — because `!`
# negates the status before the branch runs. The first draft of this case used
# that form, so it printed "KILLED exit=0": the case was correct but the number
# beside it was meaningless. Same defect family as
# `OUT=$(cmd 2>&1 || true); RC=$?` in boundary.mutations.sh.
printf 'const x: number = "deliberate-type-error";\nexport default x;\n' > "$PLANT"
npm run --silent "$PKG" >/dev/null 2>&1
RC_KILL=$?
if [ "$RC_KILL" -ne 0 ]; then
  echo "KILLED     exit=$RC_KILL  T1  a type error in an in-scope file is caught"
  results+=("KILLED T1 type error caught")
else
  echo "SURVIVED   exit=0   T1  a deliberate type error did NOT fail the gate"
  echo "                      This is the vacuous-pass case: check that $PLANT is"
  echo "                      still matched by the include list in $TSCONFIG."
  results+=("SURVIVED T1 type error not caught")
  fail=1
fi
rm_retry "$PLANT"

# T2 · the control. Removing the error must restore green, which also proves T1
# did not fail for a side effect of the file merely existing.
if npm run --silent "$PKG" >/dev/null 2>&1; then
  echo "OK-GREEN   exit=0   T2  removing the error restores green (control)"
  results+=("OK-GREEN T2 control")
else
  echo "UNEXPECTED        T2  the gate is still red after the planted file was removed"
  results+=("UNEXPECTED T2 control red")
  fail=1
fi

# ── 6 · T3 · the two typechecks stay separate ───────────────────────────────
# tsconfig.indexer.json's own comment states the invariant: "Deliberately does
# NOT extend the app tsconfig: indexer code must never leak into `npm run
# typecheck`". The regression direction that matters is tsconfig.indexer.json
# growing an over-broad include. Asserted structurally rather than by planting a
# file, because a planted file would need to live in both projects' scopes.
#
# The check parses `include` as an ARRAY and compares each entry against the
# allow-list, rather than regex-matching substrings. A substring check is wrong
# here and was wrong on the first run of this file: it matched `src/**` inside
# the legitimate entry `indexer/src/**/*.ts` and reported the correct config as
# broken. An allow-list over parsed entries cannot make that mistake.
node -e "
  const fs = require('node:fs');
  // Strip // comments so the explanatory prose does not match these checks.
  const src = fs.readFileSync('$TSCONFIG', 'utf8').replace(/^\s*\/\/.*\$/gm, '');
  const problems = [];
  if (/\"extends\"\s*:/.test(src)) {
    problems.push('extends the app tsconfig — indexer types would leak into npm run typecheck');
  }
  const m = src.match(/\"include\"\s*:\s*\[([^\]]*)\]/);
  if (!m) {
    problems.push('no parseable include array — this check cannot verify the scope');
  } else {
    const entries = m[1].split(',').map((s) => s.trim().replace(/^[\"']|[\"']\$/g, '')).filter(Boolean);
    const allowed = (e) => e.startsWith('indexer/') || e === 'docs/code-index-schema.ts';
    for (const e of entries) {
      if (!allowed(e)) problems.push('include entry outside the indexer project: ' + e);
    }
    if (entries.length === 0) problems.push('include array is empty — the gate would check nothing');
  }
  if (problems.length) {
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
" >/dev/null 2>&1
if [ "$?" -eq 0 ]; then
  echo "OK-GREEN   -      T3  $TSCONFIG neither extends nor reaches outside the indexer project"
  results+=("OK-GREEN T3 project separation intact")
else
  echo "UNEXPECTED        T3  $TSCONFIG breaks the documented separation:"
  node -e "
    const fs = require('node:fs');
    const src = fs.readFileSync('$TSCONFIG', 'utf8').replace(/^\s*\/\/.*\$/gm, '');
    if (/\"extends\"\s*:/.test(src)) console.error('                        extends the app tsconfig');
    const m = src.match(/\"include\"\s*:\s*\[([^\]]*)\]/);
    if (m) {
      const entries = m[1].split(',').map((s) => s.trim().replace(/^[\"']|[\"']\$/g, '')).filter(Boolean);
      const allowed = (e) => e.startsWith('indexer/') || e === 'docs/code-index-schema.ts';
      for (const e of entries) if (!allowed(e)) console.error('                        include entry outside the project: ' + e);
    }
  "
  results+=("UNEXPECTED T3 separation broken")
  fail=1
fi

# ── 7 · Restore proof ───────────────────────────────────────────────────────
cleanup
LEFTOVER=()
[ -e "$PLANT" ] && LEFTOVER+=("$PLANT")
[ -e "$FIXCFG" ] && LEFTOVER+=("$FIXCFG")
if [ "${#LEFTOVER[@]}" -gt 0 ]; then
  echo "RESTORE FAILED — the battery left litter:"
  printf '    %s\n' "${LEFTOVER[@]}"
  echo "  A stray .ts file under $SRC/ breaks every downstream gate."
  fail=1
fi
# Git is the witness: tsconfig.indexer.json is tracked and must be untouched
# (trap 2 — an earlier hand-probe overwrote it and needed `git checkout`).
TREE_DIRTY=$(git status --porcelain -- "$TSCONFIG" "$SRC" | grep -v '^??' || true)
if [ -n "$TREE_DIRTY" ]; then
  echo "RESTORE FAILED — the battery left a tracked file modified:"
  echo "$TREE_DIRTY" | sed 's/^/    /'
  fail=1
fi

echo
echo "─────────────────────────────────────────────"
for r in "${results[@]}"; do echo "  $r"; done
KILLED=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED' || true)
SURVIVED=$(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED' || true)
OKG=$(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN' || true)
echo "─────────────────────────────────────────────"
echo "  killed $KILLED · survived $SURVIVED · ok-green $OKG"
echo "  scope: tsc's error reporting + the include list that decides it"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
