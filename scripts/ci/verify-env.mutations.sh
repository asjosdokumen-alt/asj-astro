#!/usr/bin/env bash
# Mutation battery for scripts/ci/verify-env.mjs  (gates: verify:env, verify:env:budget)
#
# WHY A BATTERY
# -------------
# This gate sits between a completed build and a deploy. Its job is to catch a
# missing secret BEFORE Netlify is touched, because the alternative is worse than
# a failed deploy: the static site uploads, the functions break, and users get a
# half-working release. A gate with that remit must be shown to actually fail —
# "it printed PASSED" proves nothing about a script whose only customer is a
# human reading a green line.
#
# Proving it and proving the OTHER batteries were not the same job, because this
# gate's INPUT is not a file. It is the ambient process environment, plus a
# second input the file-based batteries never had: the .env files that
# applyEnvFiles() reads. That produces two new failure modes for a harness, both
# of which are real and both of which are neutralised below — see TRAPS 1 and 2.
#
# TWO GATES, ONE SCRIPT
# ---------------------
# verify:env         -> node scripts/ci/verify-env.mjs
# verify:env:budget  -> node scripts/ci/verify-env.mjs --profile production --budget
#
# They are the same file with different flags, so one battery proves both, and
# the manifest points both entries at this script. That is stated here rather
# than left implicit: a reader who assumes two independent proofs would be
# overrating coverage by one.
#
# DEFECT CLASSES
# --------------
#   E1  a missing REQUIRED variable                    -> KILL (exit 1)
#   E2  a required variable holding a placeholder      -> KILL (exit 1)
#   E3  ALLOW_PLACEHOLDER=1 accepts that placeholder   -> OK-GREEN (escape hatch)
#   E4  REQUIRED_EXTRA adds a variable to the profile  -> KILL (exit 1)
#   E5  a healthy environment                          -> OK-GREEN (control)
#   E6  --strict promotes an absent OPTIONAL var       -> KILL (exit 1)
#   E7  the same absent optional in default mode       -> OK-GREEN (by design)
#   E8  an unknown profile name                        -> KILL (exit 2)
#   B1  budget over the 4 KB ceiling, no --budget-strict -> OK-GREEN (informational)
#   B1b the same overflow WITH --budget-strict         -> KILL (exit 1)
#   B2  budget past the 85 % warn ratio, non-strict    -> OK-GREEN (by design)
#   B2b the same warning WITH --budget-strict          -> KILL (exit 1)
#   B3  a healthy budget                               -> OK-GREEN (control)
#
# E5/B3 exist to rule out the degenerate "gate that always fails", which would
# satisfy every KILL above. E3/E7/B1/B2 are deliberate behaviour, not holes —
# see the notes at each case. Asserting them as `kill` would make the battery
# demand a gate that is wrong.
#
# The budget cases prove the 2026-09-15 decision that the 4 KB Lambda ceiling is
# informational on the modern runtime and only enforced under --budget-strict.
# Without B1 vs B1b the same way round, a reader cannot tell whether the ceiling
# is unenforced by design or simply broken.
#
# HOW THE MUTATIONS WORK
# ----------------------
# The gate is driven entirely through its real CLI, with the environment varied
# per case. Nothing is stubbed and the source is not patched, so what is measured
# is the shipped verdict path. Since `verify:env:budget` already documents
# --profile/--strict/--budget/--budget-strict as public flags, using them proves
# the flags are wired as well as the logic behind them.
#
# TRAPS, ALL REAL
# ---------------
#  1. **.env.local SILENTLY REFILLS A VARIABLE YOU JUST DELETED.** The obvious
#     way to drive E1 is `PUBLIC_SUPABASE_URL= node …`, and it does not work.
#     applyEnvFiles() runs INSIDE the gate and skips a refill only when
#     `process.env[k] !== undefined && process.env[k] !== ''` — an empty string
#     counts as unset, so the value is restored from .env.local and the gate
#     correctly reports "2/2 present" and exits 0. Measured 2026-09-15: the
#     naive probe produced a green run that looks exactly like a gate which
#     cannot fail. The env files must be moved aside for the veto to hold, which
#     is what hide_env_files() does. EVERY case runs with them hidden, so the
#     environment under test is always the one this battery exports and nothing
#     else. Restoring them is asserted at the end.
#
#  2. **THE GATE RESOLVES ITS ENV FILES FROM ITS OWN LOCATION, NOT FROM cwd.**
#     load-env.mjs derives ROOT as `resolve(HERE, '..', '..')`, so copying the
#     gate into a temp directory to isolate it breaks the import outright
#     (ERR_MODULE_NOT_FOUND for ../lib/load-env.mjs — observed). Isolation has to
#     happen in place.
#
#  3. **A stale mutation or leftover litter from an aborted run.** The gate is
#     captured from `git show HEAD:` rather than the live file, so an
#     already-mutated gate cannot be laundered back into place, and `trap
#     cleanup EXIT` restores on every exit path including failure.
#
#  4. **`unset` in a subshell does not reach a child process.** Each case runs
#     via `env`, which is what actually produces the environment the gate sees;
#     `VAR= ` does not (see trap 1) and `unset VAR` before the call is invisible
#     to a command that re-reads the env files anyway.
#
#  5. **`"${arr[@]:-}"` TURNS AN EMPTY ARRAY INTO ONE EMPTY ARGUMENT.** Measured
#     2026-09-15: `env "${arr[@]:-}" node …` with `arr=()` exits **127**, not 2 —
#     `env` is handed a single empty-string argv[0] and reports "command not
#     found". The `:-` default is only correct for a SCALAR (`${x:-}`); on an
#     array it manufactures a phantom element. This is the same defect family as
#     the `local x="${@:3}"` bug in bundle-size.mutations.sh — a parameter
#     expansion quietly changing the argument list — and it is worth stating
#     because exit 127 still reads as "non-zero", so a KILL case built on an
#     empty environment would have PASSED for entirely the wrong reason. Every
#     expansion below uses the bare `"${arr[@]}"` form (safe under `set -u` for
#     a local array that is always assigned).
#
# Must be run with cwd = repo root:
#   bash scripts/ci/verify-env.mutations.sh
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

GATE=scripts/ci/verify-env.mjs
BAK=.tmp-envmut
fail=0
results=()
CREATED=()
HIDDEN=()

# ── 1 · Capture the gate from git before anything can touch it ──────────────
mkdir -p "$BAK"
if ! git show "HEAD:$GATE" > "$BAK/gate.orig" 2>/dev/null; then
  echo "ABORT: cannot read $GATE from git HEAD — is the file tracked?"
  exit 1
fi
cleanup() {
  restore_env_files
  for f in "${CREATED[@]:-}"; do [ -n "$f" ] && rm_retry "$f"; done
  [ -f "$BAK/gate.orig" ] && cp "$BAK/gate.orig" "$GATE"
  # Drop this battery's backup store. Without this the directory is a PERMANENT
  # resident of the working tree, and a later run that finds it restores from a
  # store describing an older tree — the failure this file's trap 1 exists to
  # prevent. `.gitignore` hides `.tmp-*` from `git status`, so the residue is also
  # invisible to anyone auditing the tree for exactly this class of debris.
  rm_retry "$BAK"
}
trap cleanup EXIT

# ── 2 · Hermetic environment helpers ────────────────────────────────────────
# The env files are the second input (trap 1). Hide them for the whole run so
# every case measures exactly what it exports.
hide_env_files() {
  for f in .env.local .env.lokal .env; do
    if [ -f "$f" ]; then
      mv "$f" "$f.bakmut" || {
        echo "ABORT: could not move $f aside — refusing to run with a polluted env."
        exit 1
      }
      HIDDEN+=("$f")
    fi
  done
}
restore_env_files() {
  for f in "${HIDDEN[@]:-}"; do
    [ -n "$f" ] && [ -f "$f.bakmut" ] && mv "$f.bakmut" "$f"
  done
  HIDDEN=()
}

# ── 3 · Self-heal the harness's own litter, and SAY SO ──────────────────────
if ! diff -q "$BAK/gate.orig" "$GATE" >/dev/null 2>&1; then
  echo "NOTE: $GATE was dirty on entry (a previous run left it mutated)."
  echo "      Restoring the pristine copy from git HEAD before measuring."
  cp "$BAK/gate.orig" "$GATE"
fi
# A previous aborted run would have died between the move and the restore,
# leaving .env.local as .env.local.bakmut. Recover it loudly rather than
# proceeding with an environment that is mysteriously empty.
for f in .env.local .env.lokal .env; do
  if [ ! -f "$f" ] && [ -f "$f.bakmut" ]; then
    echo "NOTE: $f was left parked by a previous aborted run. Restoring."
    mv "$f.bakmut" "$f"
  fi
done

hide_env_files
echo "env files hidden for the duration: ${HIDDEN[*]:-(none present)}"
echo "(so every case below measures ONLY the environment it exports)"
echo

# ── 4 · Baseline: the gate must be green on a healthy exported environment ──
# Run BEFORE the case table, because a gate that fails on a clean environment
# would make every KILL below meaningless — they would all "pass" for a reason
# that has nothing to do with the defect under test.
ENV_OK=(PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY=anon-key-value)
if ! env "${ENV_OK[@]}" node "$GATE" --profile build >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on a minimal, valid build profile."
  echo "  The env files are hidden and no case has run yet, so this is not residue."
  echo "  Fix the gate before trusting any verdict here."
  env "${ENV_OK[@]}" node "$GATE" --profile build || true
  exit 1
fi
echo "baseline green (minimal valid build profile, env files hidden)"
echo

# ── 5 · Mutation primitive ──────────────────────────────────────────────────
# `check <label> <expect> <args…> -- <env assignments…>`.
#
# The environment assignments are separated by `--` and passed through `env`,
# because the two lists can both be empty and a naive `shift`-based split cannot
# tell `--profile build` from `FOO=bar`. Getting that wrong would drop the gate's
# own flags — the exact failure this battery exists to catch, and one already
# measured in bundle-size.mutations.sh where `local x="${@:3}"` silently ate
# `--max-entry`.
check() {
  local label="$1" expect="$2" rc
  shift 2
  local gateargs=()
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
    gateargs+=("$1")
    shift
  done
  [ "$#" -gt 0 ] && shift # drop the `--`
  local envargs=("$@")

  env "${envargs[@]}" node "$GATE" "${gateargs[@]}" >/dev/null 2>&1
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

# ── E1 · a missing REQUIRED variable ────────────────────────────────────────
# The central purpose. Note the value is genuinely ABSENT, not empty — with the
# env files hidden, either would now work, but absent is what CI actually looks
# like when an Environment is misconfigured.
check "E1  a missing required variable is caught" kill --profile build -- \
  PUBLIC_SUPABASE_ANON_KEY=anon-key-value

# ── E2 · a required variable holding a placeholder ──────────────────────────
# The second most likely real failure: a template default pasted into the
# Environment and never replaced. `your-project-ref` is the shape the repo's own
# .env.example ships, so this is the value a careless copy actually produces.
check "E2  a placeholder required value is caught" kill --profile build -- \
  PUBLIC_SUPABASE_URL=your-project-ref PUBLIC_SUPABASE_ANON_KEY=anon-key-value

# ...and the unexpanded GitHub Actions expression, which is a distinct pattern
# in PLACEHOLDER_PATTERNS and the one that silently survives a misconfigured
# `${{ secrets.X }}` interpolation.
check "E2b an unexpanded \${{ }} expression is caught" kill --profile build -- \
  'PUBLIC_SUPABASE_URL=${{ secrets.SUPABASE_URL }}' PUBLIC_SUPABASE_ANON_KEY=anon-key-value

# ── E3 · the documented escape hatch ────────────────────────────────────────
# ALLOW_PLACEHOLDER=1 accepts template values on purpose, for local dev where a
# placeholder build is legitimate. Asserting this as `kill` would demand a gate
# that breaks the documented workflow.
check "E3  ALLOW_PLACEHOLDER=1 accepts a placeholder (escape hatch)" equivalent \
  --profile build -- ALLOW_PLACEHOLDER=1 \
  PUBLIC_SUPABASE_URL=your-project-ref PUBLIC_SUPABASE_ANON_KEY=anon-key-value

# ── E4 · REQUIRED_EXTRA extends the profile ─────────────────────────────────
# Documented in the script's own header. This is how a one-off deploy requires a
# variable that is not in the profile, so it must actually be enforced.
check "E4  REQUIRED_EXTRA adds an enforced variable" kill --profile build -- \
  REQUIRED_EXTRA=SOME_ONE_OFF_TOKEN \
  PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY=anon-key-value

# ── E5 · the control: a healthy environment stays green ─────────────────────
# Without this the whole table is satisfiable by `exit 1`, which is the
# degenerate gate the battery is supposed to rule out.
check "E5  a healthy environment passes (control)" equivalent --profile build -- \
  PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY=anon-key-value

# ── E6/E7 · --strict promotes absent OPTIONAL vars ──────────────────────────
# A declared behaviour with a real consequence: strict mode is what a production
# deploy uses, and it turns "absent optional" into a failure. Both directions are
# asserted, because a gate that always ignored --strict and one that always
# honoured it would each satisfy one half of this pair.
check "E6  --strict promotes an absent optional variable to required" kill \
  --profile build --strict -- \
  PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY=anon-key-value
check "E7  the same absent optional is tolerated without --strict" equivalent \
  --profile build -- \
  PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY=anon-key-value

# ── E8 · an unknown profile is a configuration error, not a finding ─────────
# Exit 2, matching the convention the other gates settled on: a bad argument is
# not the same thing as a detected problem, and conflating them is how a typo in
# a workflow gets read as a passing gate.
check "E8  an unknown profile is refused" kill --profile definitely-not-a-profile

# ── B1/B1b · the 4 KB ceiling is informational, --budget-strict enforces ────
# A ~4.2 KB value reproduces the real 2026-09-12 overflow shape (see
# docs/HANDOFF_4KB_ENV_LIMIT.md) without needing the actual Firebase JSON.
#
# The filler must NOT be a run of a single character: `xxxx…` matches the
# `^xxx+$` placeholder pattern in PLACEHOLDER_PATTERNS, so the gate correctly
# rejects it as a template value and the budget block is never reached — the
# first version of this case failed for that reason. A base64-shaped string is
# what a real key looks like and passes the placeholder screen.
BIG=$(node -e '
  const ab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let s = "";
  for (let i = 0; i < 4300; i++) s += ab[(i * 7 + (i >> 5)) % ab.length];
  process.stdout.write(s);
')
check "B1  a budget overflow is informational without --budget-strict" equivalent \
  --profile build --budget -- \
  PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY="$BIG"
check "B1b the SAME overflow fails under --budget-strict (proves the flag decides)" kill \
  --profile build --budget --budget-strict -- \
  PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY="$BIG"

# ── B2/B2b · the 85 % warn ratio, likewise ─────────────────────────────────
# A gap between the two cases is what makes B1/B1b a decision rather than an
# accident: a value between the warn ratio and the ceiling must warn, and must
# fail only in strict mode.
WARN=$(node -e '
  const ab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let s = "";
  for (let i = 0; i < 3550; i++) s += ab[(i * 7 + (i >> 5)) % ab.length];
  process.stdout.write(s);
')
check "B2  a budget past the 85% warn ratio is a warning by default" equivalent \
  --profile build --budget -- \
  PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY="$WARN"
check "B2b the same warning fails under --budget-strict" kill \
  --profile build --budget --budget-strict -- \
  PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY="$WARN"

# ── B3 · the budget control ────────────────────────────────────────────────
check "B3  a healthy budget passes (control)" equivalent \
  --profile build --budget -- \
  PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY=anon-key-value

# ── B4 · the gate SAYS whether its number is trustworthy ───────────────────
# The 4 KB check is a proxy over whatever is exported, so outside CI it is a
# LOWER BOUND. The script prints that explicitly; if the note is ever dropped the
# number reads as authoritative and a deploy can be approved on a total that
# only counted two variables. Asserted on the message, not the exit code.
OUT=$(env PUBLIC_SUPABASE_URL=https://example.supabase.co PUBLIC_SUPABASE_ANON_KEY=anon-key-value \
  node "$GATE" --profile build --budget 2>&1 || true)
if echo "$OUT" | grep -q 'LOWER BOUND, not the real payload'; then
  echo "OK-GREEN   -      B4  the under-count is disclosed, not silently trusted"
  results+=("OK-GREEN B4 lower-bound disclosure")
else
  # The 2/2 exported here IS the full build profile, so known === names and the
  # note is legitimately suppressed. Assert the count line instead of demanding a
  # message the gate is right not to print.
  if echo "$OUT" | grep -qE 'counted : [0-9]+/[0-9]+ variables visible'; then
    echo "OK-GREEN   -      B4  budget reports how many variables it counted"
    results+=("OK-GREEN B4 counted-ratio reported")
  else
    echo "UNEXPECTED        B4  the budget total is printed with no indication of coverage"
    results+=("UNEXPECTED B4 coverage undisclosed")
    fail=1
  fi
fi

# ── 6 · Restore proof ───────────────────────────────────────────────────────
restore_env_files
MISSING_FILES=()
for f in .env.local .env.lokal .env; do
  [ -f "$f.bakmut" ] && MISSING_FILES+=("$f was NOT restored")
done
if [ "${#MISSING_FILES[@]}" -gt 0 ]; then
  echo "RESTORE FAILED — the battery left an env file parked:"
  printf '    %s\n' "${MISSING_FILES[@]}"
  echo "  Every later command in this tree would have run against an empty environment."
  fail=1
fi

# The gate itself must come back byte-identical, witnessed by GIT rather than by
# a backup-to-backup diff (an EOL rewrite is invisible to the latter).
TREE_DIRTY=$(git status --porcelain -- "$GATE" | grep -v '^??' || true)
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
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
