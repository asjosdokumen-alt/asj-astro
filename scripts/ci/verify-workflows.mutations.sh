#!/usr/bin/env bash
# Mutation battery for scripts/ci/verify-workflows.mjs.
#
# WHY A BATTERY
# -------------
# This gate exists because the repository spent an unknown number of days with
# a completely dead pipeline and NOTHING could see it: 32 runs, 32 failures,
# zero jobs, every local gate green. A gate that guards an invisible failure
# mode must itself be provably able to fail, or it becomes the next invisible
# thing — the exact trade this repo has already made twice (`depcruise` was a
# gate nobody ran; a lint ratchet was believed green while it was red).
#
# So every rule W1–W4 is killed here, and two cases are OK-GREEN controls.
#
# HOW THIS BATTERY DIFFERS FROM THE OTHERS
# ----------------------------------------
# It mutates NOTHING. The gate takes `--dir`, so every case is a fixture written
# into a fresh `mktemp -d` outside the repository. There is no restore step and
# no backup to launder, which removes the failure mode the other batteries carry
# the most scars from (an aborted run leaving a poisoned tree behind). The one
# thing fixtures cannot fake is W3's target resolution, which is relative to the
# repository root on purpose — so the two `uses:` cases point at REAL workflows,
# one that declares `workflow_call` and one that does not.
#
# THE CASES
# ---------
#   M1  `if: ${{ secrets.X != '' }}`              -> W2   (the real incident)
#   M2  bare form, `if: secrets.X != ''`          -> W2   (no ${{ }} wrapper)
#   M3  `if: ${{ secrets['X'] != '' }}`           -> W2   (index form)
#   M4  `uses: ./.github/workflows/nope.yml`      -> W3   (dangling target)
#   M5  `uses:` a workflow with no workflow_call  -> W3   (not reusable)
#   M6  no top-level `on:`                        -> W1
#   M7  no top-level `name:`                      -> W4
#   M8  empty directory                           -> exit 2, never a pass
#   G1  OK-GREEN — a correct workflow passes      -> exit 0 (proves it is not
#       a blanket "any `if:` fails" checker)
#   G2  OK-GREEN — `secrets` and `if:` in COMMENTS must not trip W2. This is the
#       false-positive guard, and it is not hypothetical: the fixed `_notify.yml`
#       carries a comment block that discusses `secrets` and contains the word
#       `if:`. A checker that scans comments would fail the very file it was
#       written for, and the natural "fix" would be to delete the explanation.
#
# Run from anywhere:  bash scripts/ci/verify-workflows.mutations.sh
# Exit 0 only when every case behaves as declared.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 2

GATE="scripts/ci/verify-workflows.mjs"

# ── Fixture root, translated to a path BOTH bash and node can open ──────────
# The gate takes `--dir`, so the fixtures live outside the repo — but they must
# still be visible to `node`, and that is where this broke on Windows/Git-Bash.
#
# `mktemp -d` returns an MSYS path (`/tmp/tmp.XXXX`). bash resolves it through
# its own mount table; node does not know that table at all, so it hands the
# literal `/tmp/tmp.XXXX/case1` to the OS, which fails with ENOENT. The gate is
# written to exit 2 when it finds no workflows ("refusing to report a pass on an
# empty scan"), so EVERY case reported `want exit 1, got 2` — a battery that
# looks entirely broken while the gate under it is perfectly correct.
#
# Measured, this machine: bash sees /tmp/tmp.MjxcitdDpo; the real path is
# C:/Users/k89/AppData/Local/Temp/tmp.MjxcitdDpo; node saw the former and
# `readdir` returned ENOENT.
#
# So: translate the directory to a native path, then PROVE both sides can reach
# it before running a single case. Silently continuing against an unreachable
# fixture would report ten false SURVIVEDs.
TMP="$(mktemp -d 2>/dev/null)" || { echo "FATAL: mktemp -d failed"; exit 2; }

# `pwd -W` (MSYS) prints the native Windows form of the same directory —
# C:/Users/... instead of /tmp/... — which node can open. It is a builtin of the
# shell `cd`, so it needs no subprocess and no string escaping. Where `pwd -W`
# does not exist (real Linux/macOS) the `||` keeps the plain POSIX path, which is
# already correct there.
TMP="$(cd "$TMP" && { pwd -W 2>/dev/null || pwd; })"

# Prove the fixture root is reachable from BOTH sides before running any case.
# This is the whole point: a fixture node cannot open makes the gate exit 2
# ("no workflows found"), which is indistinguishable in the report from a real
# survivor — ten false SURVIVEDs and a battery that looks broken.
if [ ! -d "$TMP" ]; then
  echo "FATAL: fixture root '$TMP' is not a directory — refusing to run cases against it"; exit 2
fi
printf 'fixture root: %s\n' "$TMP" | tee "$TMP/.probe" >/dev/null
if ! node -e 'process.exit(require("fs").existsSync(process.argv[1]) ? 0 : 1)' "$TMP/.probe"; then
  echo "FATAL: fixture root '$TMP' exists for bash but NOT for node."
  echo "       Every case would report a false SURVIVED. Aborting."
  exit 2
fi
trap 'rm -f "$TMP/.probe" 2>/dev/null || true; rm -rf "$TMP" 2>/dev/null || true' EXIT

if [ ! -f "$GATE" ]; then
  echo "FATAL: $GATE not found (run from the repository root)"
  exit 2
fi

pass=0
fail=0

# run_gate <dir> -> echoes the gate's exit code
run_gate() {
  node "$GATE" --dir "$1" >/dev/null 2>&1
  echo $?
}

# expect <label> <want-exit> <dir>
expect() {
  local label="$1" want="$2" dir="$3" got
  got="$(run_gate "$dir")"
  if [ "$got" = "$want" ]; then
    printf '  KILLED   %-46s exit %s\n' "$label" "$got"
    pass=$((pass + 1))
  else
    printf '  SURVIVED %-46s want exit %s, got %s\n' "$label" "$want" "$got"
    fail=$((fail + 1))
  fi
}

# fixture <case> — create the directory and echo its path
fixture() {
  local d="$TMP/$1"
  mkdir -p "$d"
  echo "$d"
}

echo "Mutation battery — verify-workflows.mjs"
echo "--------------------------------------------------------"

# ── M1: the real incident ───────────────────────────────────────────────────
d="$(fixture m1)"
cat > "$d/wf.yml" <<'YAML'
name: Fixture
on:
  workflow_call:
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: post
        if: ${{ secrets.WEBHOOK != '' }}
        run: echo hi
YAML
expect "M1 secrets in if: (\${{ }} form)" 1 "$d"

# ── M2: bare expression, no ${{ }} wrapper ──────────────────────────────────
d="$(fixture m2)"
cat > "$d/wf.yml" <<'YAML'
name: Fixture
on:
  workflow_call:
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: post
        if: secrets.WEBHOOK != ''
        run: echo hi
YAML
expect "M2 secrets in if: (bare form)" 1 "$d"

# ── M3: index access ────────────────────────────────────────────────────────
d="$(fixture m3)"
cat > "$d/wf.yml" <<'YAML'
name: Fixture
on:
  workflow_call:
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: post
        if: ${{ secrets['WEBHOOK'] != '' }}
        run: echo hi
YAML
expect "M3 secrets in if: (index form)" 1 "$d"

# ── M4: dangling reusable-workflow target ───────────────────────────────────
d="$(fixture m4)"
cat > "$d/wf.yml" <<'YAML'
name: Fixture
on:
  push:
jobs:
  call:
    uses: ./.github/workflows/nope.yml
YAML
expect "M4 uses: a target that does not exist" 1 "$d"

# ── M5: target exists but is not reusable ───────────────────────────────────
# `ci.yml` is a real, tracked workflow with no `on: workflow_call`.
d="$(fixture m5)"
cat > "$d/wf.yml" <<'YAML'
name: Fixture
on:
  push:
jobs:
  call:
    uses: ./.github/workflows/ci.yml
YAML
expect "M5 uses: a target without workflow_call" 1 "$d"

# ── M6: no `on:` ────────────────────────────────────────────────────────────
d="$(fixture m6)"
cat > "$d/wf.yml" <<'YAML'
name: Fixture
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
YAML
expect "M6 no top-level on:" 1 "$d"

# ── M7: no `name:` ──────────────────────────────────────────────────────────
d="$(fixture m7)"
cat > "$d/wf.yml" <<'YAML'
on:
  push:
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
YAML
expect "M7 no top-level name:" 1 "$d"

# ── M8: empty directory is exit 2, never a pass ─────────────────────────────
d="$(fixture m8)"
expect "M8 empty directory refuses to report a pass" 2 "$d"

# ── G1: a correct workflow passes (OK-GREEN) ────────────────────────────────
d="$(fixture g1)"
cat > "$d/wf.yml" <<'YAML'
name: Fixture
on:
  workflow_call:
    inputs:
      status:
        required: true
        type: string
    secrets:
      WEBHOOK:
        required: false
jobs:
  j:
    runs-on: ubuntu-latest
    env:
      WEBHOOK: ${{ secrets.WEBHOOK }}
    steps:
      - name: post
        if: env.WEBHOOK != ''
        run: curl -fsS "$WEBHOOK"
      - name: call the real notification sink
        uses: ./.github/workflows/_notify.yml
YAML
expect "G1 OK-GREEN correct workflow" 0 "$d"

# ── G2: comments must not trip W2 (false-positive guard) ────────────────────
d="$(fixture g2)"
cat > "$d/wf.yml" <<'YAML'
name: Fixture
# This comment discusses `secrets` and even contains the word if: on purpose.
#   Unrecognized named-value: 'secrets'
# Do NOT move the test back into an if: expression.
on:
  push:
jobs:
  j:
    runs-on: ubuntu-latest
    env:
      WEBHOOK: ${{ secrets.WEBHOOK }}
    steps:
      - name: post
        if: env.WEBHOOK != ''
        run: echo hi
YAML
expect "G2 OK-GREEN comments do not trip W2" 0 "$d"

echo "--------------------------------------------------------"
echo "  killed  : $pass"
echo "  survived: $fail"
if [ "$fail" -ne 0 ]; then
  echo "MUTATION BATTERY FAILED — the gate is blind to at least one declared case."
  exit 1
fi
echo "MUTATION BATTERY PASSED — every declared case is killed, both OK-GREEN cases stay green."
exit 0
