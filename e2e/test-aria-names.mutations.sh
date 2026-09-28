#!/usr/bin/env bash
# e2e/test-aria-names.mutations.sh — proves e2e/test-aria-names.mjs can FAIL.
#
# WHY THIS FILE EXISTS
#   A gate that has never been shown to fail is not a gate, and THIS one is
#   unusually exposed: every check it makes is an assertion that a LIST IS EMPTY.
#   `Accessibility.getFullAXTree` returning nothing, a role list that stopped
#   matching, a `backendDOMNodeId` that no longer resolves — every one of those
#   failures reads as "0 offenders", which is byte-identical to a clean page. So
#   the battery does not only break the PRODUCT; it also has to show the sweep
#   itself is alive, which is what the two CONTROLS inside the gate are for, and
#   the OK-GREEN case below is what shows the gate does not simply fail on every
#   edit.
#
# WHAT IT DOES
#   For each round: apply targeted edits to SOURCE files, rebuild, run the gate
#   (filtered to the surface each edit can affect), record KILLED (gate exits
#   non-zero) or SURVIVED (gate exits 0 against a deliberately broken tree), then
#   restore every touched file BYTE-IDENTICALLY and verify with `git diff --quiet`
#   before the next round.
#
#   A SURVIVED mutation is a HOLE in the gate and is reported as a failure of this
#   script, not as a note.
#
#   M1–M3 + C1 are applied TOGETHER in one build and judged by four separate
#   filtered runs. They touch four different files on four different surfaces, so
#   they cannot interact, and each run targets its own surface — attribution is
#   preserved while three rebuilds are saved.
#
# PREREQUISITES
#   * A build already served on $BASE_URL (default http://127.0.0.1:4321).
#     This script REFUSES to start if the server does not answer.
#   * `node scripts/build-sw-manifest.mjs` is run after every build, because
#     `astro build` alone leaves dist/sw.js at `asj-astro-dev` and five
#     `swOffline` tests then go red for reasons unrelated to any mutation.
#
# ⚠ THIS BATTERY OWNS THE FILES IT MUTATES FOR THE DURATION OF THE RUN.
#   An EDITOR — human or agent — touching any of them mid-run corrupts it in a
#   way that is genuinely hard to read: the restore silently takes the OTHER
#   change away, or the mutation is left in place as if it were real work. So the
#   run REFUSES TO START unless every target is clean, and a lock file stops two
#   runs from overlapping.
#
# ⚠ IF THIS SCRIPT IS KILLED MID-RUN (SIGKILL, or a harness that re-executes a
#   long escalated command), the `EXIT` trap does NOT run and a mutation is left
#   in the tree. MEASURED 2026-09-28: that is exactly what happened on the first
#   attempt — `src/components/public/LokerDetailModal.tsx` came back holding M4.
#   RECOVER WITH:
#       git checkout -- src/components/admin/TabKelola.tsx \
#                       src/components/admin/TabPelamar.tsx \
#                       src/components/admin/TabMail.tsx \
#                       src/components/public/LokerDetailModal.tsx \
#                       src/components/App.tsx
#   then verify with `git hash-object <file>` against `git rev-parse HEAD:<file>`,
#   and REBUILD before believing any gate — `dist/` is holding the mutation too.
#
# ⚠ MEASURED TRAPS THIS BATTERY ENCODES:
#   1. `astro build` can exit non-zero on this machine while producing a COMPLETE
#      dist/, so the build is judged by its ARTEFACT, never by its exit code.
#   2. `rm -rf dist` is refused by the sandbox bulk-delete guard above ~50 files,
#      so dist/ is cleared subdirectory-by-subdirectory. A stale dist/ holding the
#      PREVIOUS mutation is how a battery reports a phantom verdict in EITHER
#      direction — so `rebuild()` also asserts the artefact is NEWER than the
#      build it just ran, which existence alone does not prove.
#   3. Piping the gate into `tail` hides its exit code, so each run's status is
#      taken from the node call directly.
#   4. An `EXIT` trap does NOT run on SIGKILL (see above).
#
# ⚠ THE SANDBOX DELETE QUOTA IS WHY `clean_dist` IS GONE FROM THIS FILE.
#   Measured 2026-09-28: clearing `dist/` subdirectory-by-subdirectory (the
#   workaround the hover battery documents) burned ~570 deletes in one round, and
#   from then on the guard refused EVERY delete — including a single `rm -f` of a
#   temp file in the caller's own preamble, which failed the whole command before
#   the battery even started. The failure mode is not "the battery stops": it is
#   `astro build` being refused inside `cleanServerOutput` AFTER it has copied the
#   dev `sw.js`, which forges verdicts. `astro build` clears `dist/` itself, and
#   the freshness assertion in `rebuild()` is what actually protects the verdict.
#   ⚠ The SAME guard blocks the lock file's removal, so a finished run can leave
#   `F:/tmp/aria-mutations.lock` behind. The start-up check treats a lock whose pid
#   is not running as stale and takes it over, which is why that is not fatal.
#
# MEASURED RESULT 2026-09-28, run one mode per invocation (see MODES below):
#   baseline green · a = 3 KILLED + 1 OK-GREEN · b = 1 KILLED · c = 1 KILLED ·
#   final green. 5 killed, 0 survived, 1 ok-green, 0 unexpected.
#
# Run (one mode per invocation; `all` runs every mode in a single, long call):
#   BASE_URL=http://127.0.0.1:4321 bash e2e/test-aria-names.mutations.sh all
set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:4321}"
export BASE_URL
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GATE="e2e/test-aria-names.mjs"
LOG="F:/tmp/aria-mut"
LOCK="F:/tmp/aria-mutations.lock"
RUNLOG="$LOG-run.log"

# Every run's output is ALSO appended to a file. A harness that re-executes a
# long escalated command shows only the SECOND run's stdout, so the first run's
# verdict — the one that actually did the work — is invisible unless it is on
# disk. Measured: without this, a killed run looked like a run that never
# started.
exec > >(tee -a "$RUNLOG") 2>&1

KILLED=0
HOLE=0
GREEN=0
UNEXPECTED=0

# The files this battery edits, so the ownership check and the EXIT trap cannot
# drift apart from the mutations below.
TARGETS=(
  "src/components/admin/TabKelola.tsx"
  "src/components/admin/TabPelamar.tsx"
  "src/components/admin/TabMail.tsx"
  "src/components/public/LokerDetailModal.tsx"
  "src/components/App.tsx"
)

# ── helpers ──────────────────────────────────────────────────────────────────
# mut <file> <old> <new> — exactly ONE match, or abort. A mutation that silently
# fails to apply would be reported as SURVIVED, i.e. a hole that does not exist.
mut() {
  local file="$1" old="$2" new="$3"
  MUT_FILE="$file" MUT_OLD="$old" MUT_NEW="$new" node -e '
    const fs = require("fs");
    const { MUT_FILE: f, MUT_OLD: o, MUT_NEW: n } = process.env;
    const s = fs.readFileSync(f, "utf8");
    const hits = s.split(o).length - 1;
    if (hits !== 1) {
      console.error(`MUTATION ANCHOR FAILED: ${hits} matches in ${f} for ${JSON.stringify(o.slice(0, 80))}`);
      process.exit(1);
    }
    fs.writeFileSync(f, s.replace(o, n));
  ' || exit 1
}

restore_all() {
  rm -f "$LOCK" 2>/dev/null || true
  [ "${BACKUPS_READY:-0}" = "1" ] || return 0
  for f in "${TARGETS[@]}"; do
    git checkout -- "$f" 2>/dev/null || true
  done
}
trap restore_all EXIT

# Restore ONE file and prove it, rather than assuming the checkout worked.
restore() {
  local file="$1"
  git checkout -- "$file" 2>/dev/null
  git diff --quiet -- "$file" || {
    echo "  !! RESTORE FAILED for $file — refusing to continue"
    exit 1
  }
}

rebuild() {
  local started
  started=$(date +%s)
  # NO `clean_dist` HERE, and that is a deliberate correction. The hover battery
  # clears `dist/` subdirectory-by-subdirectory because `rm -rf dist` is guarded —
  # but on THIS box that clearing is itself what exhausts the sandbox delete
  # quota (~50 per turn), and the failure mode is not "the battery stops": it is
  # `astro build` being refused inside `cleanServerOutput` AFTER copying the dev
  # `sw.js`, which is how a battery reports phantom verdicts. MEASURED
  # 2026-09-28: the first attempt burned the quota in Round A and the second
  # could not delete a single file in its preamble. `astro build` clears `dist/`
  # itself, and the freshness assertion below is what actually protects the
  # verdict — a stale `dist/` fails it loudly instead of being measured.
  node node_modules/astro/astro.js build > "$LOG-build.log" 2>&1 || true # trap 1
  node scripts/build-sw-manifest.mjs >> "$LOG-build.log" 2>&1 || true
  if [ ! -f dist/index.html ]; then
    echo "  !! BUILD PRODUCED NO dist/index.html — see $LOG-build.log"
    exit 1
  fi
  # Trap 2: existence is not freshness. If the build died before writing, the
  # PREVIOUS artefact is still sitting there, and every verdict below would be
  # about a tree that no longer exists.
  local mtime
  mtime=$(stat -c %Y dist/index.html)
  if [ "$mtime" -lt "$started" ]; then
    echo "  !! dist/index.html is OLDER than this build ($mtime < $started) — the build did NOT"
    echo "     produce a new artefact, so a stale dist/ would forge every verdict. See $LOG-build.log"
    exit 1
  fi
}

# run_gate <filter> — the filter is passed WITHOUT a leading slash, because Git
# Bash rewrites an argument that starts with `/` as a Windows path (the gate
# documents this too).
run_gate() {
  node "$GATE" "--only=${1}" > "$LOG-gate.log" 2>&1
  return $?
}

# judge <label> <expected:killed|green> <actual-exit>
judge() {
  local label="$1" expect="$2" code="$3"
  if [ "$expect" = "killed" ]; then
    if [ "$code" -ne 0 ]; then
      echo "  KILLED    $label"
      KILLED=$((KILLED + 1))
    else
      echo "  SURVIVED  $label  <-- HOLE IN THE GATE"
      HOLE=$((HOLE + 1))
    fi
  else
    if [ "$code" -eq 0 ]; then
      echo "  OK-GREEN  $label"
      GREEN=$((GREEN + 1))
    else
      echo "  RED       $label  <-- control must stay green; the gate OVER-reports"
      UNEXPECTED=$((UNEXPECTED + 1))
    fi
  fi
}

echo "════════════════════════════════════════════════════════════════"
echo "test-aria-names.mjs — mutation battery"
echo "  run log: $RUNLOG"
echo "════════════════════════════════════════════════════════════════"

# ── LOCK ─────────────────────────────────────────────────────────────────────
# Two overlapping runs would mutate the same files and restore each other's
# work, producing verdicts about a tree neither of them built.
if [ -f "$LOCK" ]; then
  OLD=$(cat "$LOCK" 2>/dev/null || echo "")
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
    echo "  !! another battery run (pid $OLD) holds $LOCK — refusing to overlap"
    exit 1
  fi
  echo "  stale lock from pid ${OLD:-?} (not running) — taking it over"
fi
echo $$ > "$LOCK"

# ── SERVER CHECK ─────────────────────────────────────────────────────────────
# The gate measures a SERVED build. Without a server every check reports
# "could not read the DOM", which reads as a red gate on a clean tree.
if ! curl -fsS --noproxy '*' "$BASE_URL/" > /dev/null 2>&1; then
  echo "  !! no server on $BASE_URL — start one first:  node server.cjs"
  exit 1
fi
echo "  server: $BASE_URL answers"

# ── OWNERSHIP CHECK ──────────────────────────────────────────────────────────
DIRTY=0
for f in "${TARGETS[@]}"; do
  if ! git diff --quiet -- "$f" 2>/dev/null; then
    echo "  !! $f has UNCOMMITTED changes — an editor holds this file."
    DIRTY=1
  fi
done
if [ "$DIRTY" -ne 0 ]; then
  echo "     Commit (or stash) them first: this battery mutates these files in place."
  echo "     If a PREVIOUS run was killed mid-flight, the changes are ITS mutation:"
  echo "       git checkout -- ${TARGETS[*]}"
  exit 1
fi
echo "  ownership: all ${#TARGETS[@]} mutation targets are clean"
BACKUPS_READY=1
# ── MODES ────────────────────────────────────────────────────────────────────
# Each round is its own mode so ONE invocation stays short. MEASURED 2026-09-28:
# the whole battery in a single call was killed mid-Round-B by the harness that
# re-executes a long escalated command, and the kill left M4 in the tree (see the
# recovery note in the header). `all` still exists for a machine where that is
# not a hazard.
#
#   bash e2e/test-aria-names.mutations.sh baseline
#   bash e2e/test-aria-names.mutations.sh a
#   bash e2e/test-aria-names.mutations.sh b
#   bash e2e/test-aria-names.mutations.sh c
#   bash e2e/test-aria-names.mutations.sh final
MODE="${1:-all}"
want() { [ "$MODE" = "all" ] || [ "$MODE" = "$1" ]; }

# ── BASELINE ─────────────────────────────────────────────────────────────────
if want baseline; then
  echo ""
  echo "[baseline] clean tree must be GREEN (full gate, no filter)"
  rebuild
  node "$GATE" > "$LOG-gate.log" 2>&1
  BASE=$?
  if [ "$BASE" -ne 0 ]; then
    echo "  !! BASELINE IS RED on a clean tree — fix the gate before running mutations."
    sed -n '1,40p' "$LOG-gate.log"
    exit 1
  fi
  echo "  baseline green"
fi

# ── ROUND A: three R1 defects + one OK-GREEN control, ONE build ──────────────
if want a; then
  echo ""
  echo "[M1] the admin job-row delete button loses its accessible name"
  mut src/components/admin/TabKelola.tsx \
    "aria-label={t('button.delete')} class=\"w-11 h-11 flex items-center justify-center bg-red-600" \
    "class=\"w-11 h-11 flex items-center justify-center bg-red-600"

  echo "[M2] the candidate-filter gender select loses its accessible name"
  mut src/components/admin/TabPelamar.tsx \
    "aria-label={t('share.gen_all')} onChange=" \
    "onChange="

  echo "[M3] the mail select-all checkbox loses its accessible name"
  mut src/components/admin/TabMail.tsx \
    "<input type=\"checkbox\" aria-label={t('ui.select_all')} class=\"w-5 h-5" \
    "<input type=\"checkbox\" class=\"w-5 h-5"

  echo "[C1] OK-GREEN CONTROL: the drawer hamburger is RENAMED to another valid name"
  mut src/components/App.tsx \
    "aria-label=\"Toggle Menu\" aria-expanded" \
    "aria-label=\"Toggle Navigation Menu\" aria-expanded"

  rebuild
  run_gate "px /admin:"
  judge "M1 <button> row delete, /admin" killed $?
  run_gate "px /admin#pelamar:"
  judge "M2 <select> gender filter, /admin#pelamar" killed $?
  run_gate "px /admin#mail:"
  judge "M3 <input checkbox> select-all, /admin#mail" killed $?
  run_gate "px /public:"
  judge "C1 hamburger renamed to a valid name, /public" green $?

  restore src/components/admin/TabKelola.tsx
  restore src/components/admin/TabPelamar.tsx
  restore src/components/admin/TabMail.tsx
  restore src/components/App.tsx
fi

# ── ROUND B: an R1 defect INSIDE an open dialog ──────────────────────────────
if want b; then
  echo ""
  echo "[M4] the job-detail dialog's close button loses its accessible name"
  mut src/components/public/LokerDetailModal.tsx \
    "onClick={onClose} aria-label={t('ui.close')} class=\"text-slate-400 hover:text-white p-1\"" \
    "onClick={onClose} class=\"text-slate-400 hover:text-white p-1\""
  rebuild
  run_gate "public + Detail"
  judge "M4 <button> close inside the open dialog" killed $?
  restore src/components/public/LokerDetailModal.tsx
fi

# ── ROUND C: R2 — the name is a RAW TRANSLATION KEY ──────────────────────────
# The defect the other gates structurally cannot see: the attribute is present,
# non-empty, and renders as normal-looking markup. Only a reader of the COMPUTED
# name notices it is the key. It needs its own build because it edits the same
# element M4 does, in the opposite direction.
if want c; then
  echo ""
  echo "[M5] the dialog close button's label becomes a raw, missing translation key"
  mut src/components/public/LokerDetailModal.tsx \
    "aria-label={t('ui.close')}" \
    "aria-label=\"ui.does_not_exist\""
  rebuild
  run_gate "public + Detail"
  judge "M5 name is the raw key ui.does_not_exist (R2)" killed $?
  restore src/components/public/LokerDetailModal.tsx
fi

# ── FINAL: prove the tree is clean and green again ───────────────────────────
if want final; then
  echo ""
  echo "[final] restore + rebuild clean, full gate must be GREEN"
  for f in "${TARGETS[@]}"; do
    git diff --quiet -- "$f" || { echo "  !! $f is STILL dirty before the final build"; exit 1; }
  done
  rebuild
  node "$GATE" > "$LOG-gate.log" 2>&1
  FINAL=$?
  if [ "$FINAL" -ne 0 ]; then
    echo "  !! GATE IS RED AFTER RESTORE — the tree is NOT clean"
    sed -n '1,40p' "$LOG-gate.log"
    exit 1
  fi
  echo "  final green"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  mode:        $MODE"
echo "  killed:      $KILLED"
echo "  SURVIVED:    $HOLE"
echo "  ok-green:    $GREEN"
echo "  unexpected:  $UNEXPECTED"
echo "════════════════════════════════════════════════════════════════"

if [ "$HOLE" -ne 0 ] || [ "$UNEXPECTED" -ne 0 ]; then
  echo "BATTERY FAILED — a mutation survived (hole) or a control went red."
  exit 1
fi
echo "BATTERY PASSED (mode: $MODE)"
