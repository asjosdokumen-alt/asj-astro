#!/usr/bin/env bash
# Mutation battery for scripts/ci/lint-ratchet.mjs.
#
# WHY A BATTERY
# -------------
# A checker that cannot fail is worse than no checker: it buys confidence and
# pays nothing. Every mutation below re-introduces a defect class this gate
# claims to catch. The gate must exit non-zero for each one. A "SURVIVED" line is
# a hole in the gate, not a curiosity.
#
# The mutations are spread across the ratchet's *different* code paths, because
# each path can rot independently:
#
#   S1  a violation added to a file that was CLEAN      -> condition 2 (new debt surface)
#   S2  a violation added to a file that was ALREADY DIRTY -> condition 3 (per-file rise)
#   S3  a violation in a BRAND-NEW file                 -> the realistic PR case
#
# S1 and S2 are deliberately separate. A gate that only compares totals would
# pass S1 (because S1 also raises the total) while silently permitting a file to
# go from clean to dirty whenever an equal number of diagnostics is fixed
# elsewhere in the same change. Splitting them is what proves both conditions are
# live rather than one masking the other.
#
# S2 IS THE REASON CONDITION 3 EXISTS. S2 was originally expected to trip
# condition 1 ("total rose"), and it did for as long as the tree sat exactly ON
# the baseline. As soon as debt was fixed without re-baselining, the tree fell
# below the baseline and that gap became slack: S2's single new diagnostic then
# landed exactly ON the baseline, which is not "greater than" it, so condition 1
# said nothing and S2 reported SURVIVED against a gate that really was letting
# the `any` through. Measured 2026-09-18: baseline 2499, tree 2498, mutation
# applied cleanly (program.ts 1 -> 2, noExplicitAny 446 -> 447, total 2498 ->
# 2499), gate exit 0. Condition 3 closes it. Do NOT "fix" a future S2 SURVIVED by
# re-baselining the battery: that hides the slack instead of measuring it.
#
# TWO TRAPS, BOTH REAL, BOTH GUARDED BELOW
# ----------------------------------------
#  1. **The mutation silently fails to apply.** An earlier battery in this repo
#     passed `/f/astro/...` to Windows Python, which cannot open that path, so
#     every mutation was a no-op and the battery reported 5/5 SURVIVED against a
#     perfectly good gate. Here `mut` asserts exactly ONE match before writing,
#     aborts the run if not, and the battery uses relative paths from repo ROOT.
#     This matters more than usual here: `indexer/src/program.ts` is CRLF, so
#     every anchor below is a SINGLE LINE and contains no line endings at all.
#  2. **Judging by scraped output instead of the exit code.** `check` only ever
#     looks at `$?`, never at the gate's text.
#
# The battery also proves a byte-identical restore of every mutated file AND of
# the baseline itself, so "the gate was green at the end" cannot be confused with
# "a mutation is still in the tree".
#
# TWO OUTCOMES THAT ARE NOT FAILURES
# ----------------------------------
# **E1 — a mutation that must stay green.** Fixing an existing diagnostic lowers
# the total. The gate must PASS and say so. If E1 ever starts failing, the
# ratchet has become a "must equal the baseline exactly" check, which would
# punish the exact behaviour it exists to encourage.
#
# **B1 — the documented escape hatch.** `--update-baseline` re-records the tree
# as the new floor, so a change that adds debt goes green again. That is by
# design: the baseline is a tracked file, so re-baselining is visible in the
# diff and reviewable. B1 pins that boundary. If it ever starts failing, the
# ratchet grew a capability (e.g. refusing to re-baseline upwards) and this file
# needs updating — hence it is reported as UNEXPECTED, not as a pass.
#
# Must be run with cwd = repo root:  bash scripts/ci/lint-ratchet.mutations.sh
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

GATE=scripts/ci/lint-ratchet.mjs
BASELINE=.ci/biome-baseline.json
NEWFILE=src/lib/__lintmut.ts
BAK=.tmp-lintmut
fail=0
results=()

FILES=(
  netlify/functions/contexts/ingestion/index.ts
  indexer/src/program.ts
  "$GATE"
)

key() { printf '%s' "$1" | tr '/.' '__'; }

backup_all() {
  mkdir -p "$BAK"
  for f in "${FILES[@]}"; do cp "$f" "$BAK/$(key "$f")"; done
  cp "$BASELINE" "$BAK/$(key "$BASELINE")"
}

restore_one() {
  local b="$BAK/$(key "$1")"
  [ -f "$b" ] && cp "$b" "$1"
}

cleanup() {
  for f in "${FILES[@]}"; do restore_one "$f"; done
  restore_one "$BASELINE"
  rm_retry "$NEWFILE"
}

# Replace exactly one occurrence, or refuse to continue.
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

# Judge only by exit code.
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

step() {
  local label="$1" expect="$2" file="$3" old="$4" new="$5"
  restore_one "$file"
  if ! mut "$file" "$old" "$new"; then
    echo "ABORT: the mutation for '$label' did not apply — results would be meaningless."
    exit 1
  fi
  check "$label" "$expect"
  restore_one "$file"
}

trap cleanup EXIT

# ── RULE 1: never interpret mutations against an already-red baseline ────────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on an unmutated tree. Aborting: mutations cannot be interpreted."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"
backup_all

# ── S: the tree under test ──────────────────────────────────────────────────
# S1 — a clean file goes dirty. The anchor file has ZERO diagnostics in the
#      baseline, so this exercises condition 2 (new debt surface).
step "S1  clean file gains an 'any' (new debt surface)"          kill netlify/functions/contexts/ingestion/index.ts "export { handleProcessUploadDoc } from './service';" "export { handleProcessUploadDoc } from './service';
export const __lintmut: any = 0;"

# S2 — an already-dirty file gets one MORE diagnostic. No file goes from clean to
#      dirty and no new file appears, so only the per-file comparison can catch
#      it: this isolates condition 3.
#
#      FIRST DRAFT OF THIS MUTATION WAS WRONG, and the battery caught it. It
#      injected `const __lintmut = 'a' + 'b';` expecting a `useTemplate` hit.
#      Biome does NOT report that: with two string literals there is no
#      expression to interpolate, so the rule stays silent — measured, the file
#      still held exactly 1 diagnostic. The mutation therefore changed nothing
#      and the gate was right to stay green; the SURVIVED line was a non-mutation
#      masquerading as a hole. It is replaced with `: any`, which is
#      `noExplicitAny` at error level and verified to raise the total by exactly
#      one — which is also why the slack described at the top can swallow it.
#      Lesson kept here because "the mutation did not actually mutate" is the
#      most expensive way to misread a battery.
step "S2  dirty file gains an 'any' (per-file rise)"             kill indexer/src/program.ts "const tsconfigPath = join(rootDir, 'tsconfig.json');" "const tsconfigPath = join(rootDir, 'tsconfig.json');
  const __lintmut: any = 0;"

# S3 — the realistic PR case: a brand-new file that ships with debt.
step_new_file() {
  rm_retry "$NEWFILE"
  printf 'export const __lintmut: any = 0;\n' > "$NEWFILE"
  check "S3  brand-new file ships with an 'any'" kill
  rm_retry "$NEWFILE"
}
step_new_file

# ── E / B: mutations that must stay green, each for a different reason ──────
# E1 — fixing debt must pass, not fail.
step "E1  fixing an existing violation (debt falls)"             equivalent indexer/src/program.ts "throw new Error('tsconfig read failed: ' + JSON.stringify(cfg.error));" 'throw new Error(`tsconfig read failed: ${JSON.stringify(cfg.error)}`);'

# B1 — re-baselining absorbs the new debt; the gate goes green again.
restore_one netlify/functions/contexts/ingestion/index.ts
if mut netlify/functions/contexts/ingestion/index.ts "export { handleProcessUploadDoc } from './service';" "export { handleProcessUploadDoc } from './service';
export const __lintmut: any = 0;"; then
  node "$GATE" --update-baseline >/dev/null 2>&1
  check "B1  --update-baseline absorbs new debt (escape hatch)" boundary
else
  echo "ABORT: the mutation for 'B1' did not apply."
  exit 1
fi
restore_one netlify/functions/contexts/ingestion/index.ts
restore_one "$BASELINE"

# ── G: the gate's own machinery ─────────────────────────────────────────────
step "G1  failure branch forced (proves exit 1 is reachable)"    kill "$GATE" 'if (current.total > baseline.total) {' 'if (current.total >= 0) {'
step "G2  baseline replaced by a stub (proves it is read)"       kill "$GATE" "const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));" 'const baseline = { total: 0, byFile: {}, byRule: {} };'

# ── RULE 3: byte-identical restore, and green again ─────────────────────────
echo
for f in "${FILES[@]}"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done
if ! diff -q "$BAK/$(key "$BASELINE")" "$BASELINE" >/dev/null; then
  echo "RESTORE FAILED — $BASELINE is not byte-identical to its backup"
  fail=1
fi
if [ -f "$NEWFILE" ]; then
  echo "LEFTOVER — $NEWFILE survived the run"
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
