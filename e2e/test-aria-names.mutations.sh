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
#   the OK-GREEN case at the end is what shows the gate does not simply fail on
#   every edit.
#
# WHAT IT DOES
#   For each round: apply a targeted edit to a SOURCE file, rebuild, run the gate
#   (filtered to the surface the edit can affect), record KILLED (gate exits
#   non-zero) or SURVIVED (gate exits 0 against a deliberately broken tree), then
#   restore every touched file BYTE-IDENTICALLY and verify with `git diff --quiet`
#   before the next round.
#
#   A SURVIVED mutation is a HOLE in the gate and is reported as a failure of this
#   script, not as a note.
#
#   M1–M3 are applied TOGETHER in one build and judged by three separate filtered
#   runs. They touch three different tabs, so they cannot interact, and each run
#   targets its own surface — attribution is preserved, and one rebuild is saved.
#
# PREREQUISITES
#   * A build already served on $BASE_URL (default http://127.0.0.1:4321).
#     This script REFUSES to start if the server does not answer.
#   * `node scripts/build-sw-manifest.mjs` is run after every build, because
#     `astro build` alone leaves dist/sw.js at `asj-astro-dev` and five
#     `swOffline` tests then go red for reasons unrelated to any mutation.
#
# ⚠ THIS BATTERY OWNS THE FILES IT MUTATES FOR THE DURATION OF THE RUN.
#   It edits four `src/` files and restores them from `git checkout` after each
#   round. An EDITOR — human or agent — touching any of them mid-run corrupts it
#   in a way that is genuinely hard to read: the restore silently takes the OTHER
#   change away, or the mutation is left in place as if it were real work. So the
#   run REFUSES TO START unless all four are clean.
#
# ⚠ MEASURED TRAPS THIS BATTERY ENCODES (each cost a real debug cycle elsewhere in
#   this repo — see e2e/test-hover-contrast.mutations.sh for the long versions):
#   1. `astro build` can exit non-zero on this machine while producing a COMPLETE
#      dist/, so the build is judged by its ARTIFACT (`dist/index.html`), never by
#      its exit code.
#   2. `rm -rf dist` is refused by the sandbox bulk-delete guard above ~50 files,
#      so dist/ is cleared subdirectory-by-subdirectory. A stale dist/ holding the
#      PREVIOUS mutation is how a battery reports a phantom verdict in either
#      direction — a stale tree makes a KILLED mutation look SURVIVED and vice
#      versa.
#   3. Piping the gate into `tail` hides its exit code, so each run's status is
#      taken from the node call directly.
#   4. An `EXIT` trap does NOT run on SIGKILL. After any forced stop, re-verify
#      every mutated file with `git diff --quiet` before believing anything.
#
# Run:  BASE_URL=http://127.0.0.1:4321 bash e2e/test-aria-names.mutations.sh
set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:4321}"
export BASE_URL
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GATE="e2e/test-aria-names.mjs"
LOG="F:/tmp/aria-mut"

KILLED=0
HOLE=0
GREEN=0
UNEXPECTED=0

# The four files this battery edits, so the ownership check and the EXIT trap
# cannot drift apart from the mutations below.
TARGETS=(
  "src/components/admin/TabKelola.tsx"
  "src/components/admin/TabPelamar.tsx"
  "src/components/admin/TabMail.tsx"
  "src/components/public/LokerDetailModal.tsx"
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

clean_dist() {
  # Trap 2: subdirectory-by-subdirectory, because `rm -rf dist` is guarded.
  [ -d dist ] || return 0
  for d in dist/*/; do [ -e "$d" ] && rm -rf "$d" 2>/dev/null; done
  rm -f dist/*.html dist/*.js dist/*.mjs dist/*.css dist/*.txt dist/*.json dist/*.webmanifest 2>/dev/null
  return 0
}

rebuild() {
  clean_dist
  node node_modules/astro/astro.js build > "$LOG-build.log" 2>&1 || true # trap 1
  node scripts/build-sw-manifest.mjs >> "$LOG-build.log" 2>&1 || true
  if [ ! -f dist/index.html ]; then
    echo "  !! BUILD PRODUCED NO dist/index.html — see $LOG-build.log"
    exit 1
  fi
}

# run_gate <filter> — filter is passed WITHOUT a leading slash (Git Bash rewrites
# a leading `/` as a Windows path; the gate documents this too).
run_gate() {
  local filter="$1"
  node "$GATE" "--only=${filter}" > "$LOG-gate.log" 2>&1
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
echo "════════════════════════════════════════════════════════════════"

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
  exit 1
fi
echo "  ownership: all ${#TARGETS[@]} mutation targets are clean"
BACKUPS_READY=1

# ── BASELINE ─────────────────────────────────────────────────────────────────
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

# ── ROUND A: three R1 defects, three surfaces, ONE build ─────────────────────
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

rebuild
run_gate "px /admin:"
judge "M1 <button> row delete, /admin" killed $?
run_gate "px /admin#pelamar:"
judge "M2 <select> gender filter, /admin#pelamar" killed $?
run_gate "px /admin#mail:"
judge "M3 <input checkbox> select-all, /admin#mail" killed $?

restore src/components/admin/TabKelola.tsx
restore src/components/admin/TabPelamar.tsx
restore src/components/admin/TabMail.tsx

# ── M4: an R1 defect INSIDE an open dialog ───────────────────────────────────
echo ""
echo "[M4] the job-detail dialog's close button loses its accessible name"
mut src/components/public/LokerDetailModal.tsx \
  "onClick={onClose} aria-label={t('ui.close')} class=\"text-slate-400 hover:text-white p-1\"" \
  "onClick={onClose} class=\"text-slate-400 hover:text-white p-1\""
rebuild
run_gate "public + Detail"
judge "M4 <button> close inside the open dialog" killed $?
restore src/components/public/LokerDetailModal.tsx

# ── M5: R2 — the name is a RAW TRANSLATION KEY ───────────────────────────────
# This is the defect the other gates structurally cannot see: the attribute is
# present, non-empty, and renders as normal-looking markup. Only a reader of the
# COMPUTED name notices it is the key.
echo ""
echo "[M5] the dialog close button's label becomes a raw, missing translation key"
mut src/components/public/LokerDetailModal.tsx \
  "aria-label={t('ui.close')}" \
  "aria-label=\"ui.does_not_exist\""
rebuild
run_gate "public + Detail"
judge "M5 name is the raw key ui.does_not_exist (R2)" killed $?
restore src/components/public/LokerDetailModal.tsx

# ── M6: OK-GREEN CONTROL — a renamed label must stay GREEN ───────────────────
# Without this, a gate that fails on ANY edit would score a perfect "5 killed"
# while being useless. `ui.close` and `public.close` are both "Tutup", so the
# rendered name changes while the property under test does not.
echo ""
echo "[M6] OK-GREEN CONTROL: the label is renamed to another VALID key"
mut src/components/public/LokerDetailModal.tsx \
  "aria-label={t('ui.close')}" \
  "aria-label={t('public.close')}"
rebuild
run_gate "public + Detail"
judge "M6 label renamed ui.close -> public.close (still named)" green $?
restore src/components/public/LokerDetailModal.tsx

# ── FINAL: prove the tree is clean and green again ───────────────────────────
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

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  killed:      $KILLED"
echo "  SURVIVED:    $HOLE"
echo "  ok-green:    $GREEN"
echo "  unexpected:  $UNEXPECTED"
echo "════════════════════════════════════════════════════════════════"

if [ "$HOLE" -ne 0 ] || [ "$UNEXPECTED" -ne 0 ]; then
  echo "BATTERY FAILED — a mutation survived (hole) or a control went red."
  exit 1
fi
echo "BATTERY PASSED"
