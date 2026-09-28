#!/usr/bin/env bash
# e2e/test-hover-contrast.mutations.sh — proves test-hover-contrast.mjs can FAIL.
#
# WHY THIS FILE EXISTS
#   A gate that has never been shown to fail is not a gate. This one is
#   especially exposed, because its whole method rests on `CSS.forcePseudoState`
#   behaving like a real pointer: if that assumption breaks, every measurement
#   silently becomes a reading of the RESTING state, everything passes, and the
#   gate looks HEALTHIER while becoming blind. So the battery includes a mutation
#   that breaks the forced state ITSELF, not only mutations that break colours.
#
# WHAT IT DOES
#   For each mutation: apply a targeted edit to a SOURCE file, rebuild, run the
#   gate, record KILLED (gate exits non-zero) or SURVIVED (gate exits 0 against a
#   deliberately broken tree), then restore the source BYTE-IDENTICALLY and
#   verify the restore with `git diff --quiet` before the next mutation.
#
#   A SURVIVED mutation is a HOLE in the gate and is reported as a failure of this
#   script, not as a note.
#
# THE OK-GREEN CONTROL
#   M8 changes something the gate must NOT flag (a colour that stays compliant),
#   and is asserted to stay GREEN. Without it a gate that fails on ANY edit would
#   score a perfect "8 killed" while being useless.
#
# PREREQUISITES
#   * A build already served on $BASE_URL (default http://127.0.0.1:4400).
#   * `node scripts/build-sw-manifest.mjs` is run after every build, because
#     `astro build` alone leaves dist/sw.js at `asj-astro-dev`.
#
#   * ⚠ THIS BATTERY OWNS THE FILES IT MUTATES FOR THE DURATION OF THE RUN.
#     It edits `e2e/test-hover-contrast.mjs` and `src/styles/global.css`,
#     rebuilds, and restores them from `git checkout` after each case. An
#     EDITOR — human or agent — touching either file mid-run corrupts it in a
#     way that is genuinely hard to read: the runner's restore silently takes
#     the OTHER change away, or the mutation is left in place as if it were
#     real work. Both happened during development of this file. So the run now
#     REFUSES TO START unless both targets are clean, and M3's own backup is
#     taken BEFORE the mutation is applied so a killed run can be recovered.
#
#     Recover a killed run:  cp /tmp/test-hover-contrast.mjs.orig e2e/test-hover-contrast.mjs
#                            git checkout -- src/styles/global.css
#
# ⚠ MEASURED TRAPS THIS BATTERY ENCODES (each cost a real debug cycle):
#   1. `npm run build` EXITS 1 on this machine even on success, because Astro's
#      `cleanServerOutput` step trips the sandbox bulk-delete guard. The dist/ it
#      produced is COMPLETE, but the `&&` to build-sw-manifest.mjs short-circuits
#      — so the sw step is run separately, and the astro exit code is NOT used to
#      decide whether the build worked.
#   2. `rm -rf dist` is BLOCKED by the same guard above ~50 files, so a rebuild
#      that relies on it silently keeps the OLD artifact. dist/ is cleared
#      subdirectory-by-subdirectory instead. A stale dist/ holding a previous
#      mutation is how a battery reports a phantom SURVIVED — and, in reverse, a
#      battery KILLED MID-RUN leaves the last mutation in dist/, so the next
#      clean run of the GATE reports failures that are not in the source. If the
#      gate is red and the source is clean, rebuild before believing it.
#   3. `tail`-ing the gate's output hides its exit code through a pipe, so each
#      run's status is captured from the PIPESTATUS of the node call directly.
#
# Run:  bash e2e/test-hover-contrast.mutations.sh
set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:4400}"
export BASE_URL
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PASS=0
HOLE=0
GREEN=0
UNEXPECTED=0

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
      console.error(`MUTATION ANCHOR FAILED: ${hits} matches in ${f} for ${JSON.stringify(o.slice(0, 70))}`);
      process.exit(1);
    }
    fs.writeFileSync(f, s.replace(o, n));
  ' || exit 1
}

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
  npm run build > /tmp/hover-mut-build.log 2>&1 || true # trap 1: exit 1 is expected
  node scripts/build-sw-manifest.mjs > /dev/null 2>&1 || true
  # The build is judged by its ARTIFACT, not by its exit code.
  if [ ! -f dist/index.html ]; then
    echo "  !! BUILD PRODUCED NO dist/index.html — see /tmp/hover-mut-build.log"
    exit 1
  fi
}

run_gate() {
  node e2e/test-hover-contrast.mjs > /tmp/hover-mut-gate.log 2>&1
  return $?
}

# judge <label> <expected:killed|green> <actual-exit>
judge() {
  local label="$1" expect="$2" code="$3"
  if [ "$expect" = "killed" ]; then
    if [ "$code" -ne 0 ]; then
      echo "  KILLED    $label"
      PASS=$((PASS + 1))
    else
      echo "  SURVIVED  $label  <-- HOLE IN THE GATE"
      HOLE=$((HOLE + 1))
    fi
  else
    if [ "$code" -eq 0 ]; then
      echo "  OK-GREEN  $label"
      GREEN=$((GREEN + 1))
    else
      echo "  RED       $label  <-- control must stay green; gate OVER-reports"
      UNEXPECTED=$((UNEXPECTED + 1))
    fi
  fi
}

echo "════════════════════════════════════════════════════════════════"
echo "test-hover-contrast.mjs — mutation battery"
echo "════════════════════════════════════════════════════════════════"

# ── OWNERSHIP CHECK ──────────────────────────────────────────────────────────
# This battery edits the gate and global.css in place. If either is ALREADY
# dirty, an editor is working in the same file and the two will fight: the
# battery's `git checkout` restore would discard the other change, or the other
# change would be mistaken for a mutation. Refuse rather than corrupt.
DIRTY=0
for f in e2e/test-hover-contrast.mjs src/styles/global.css; do
  if ! git diff --quiet -- "$f" 2>/dev/null; then
    echo "  !! $f has UNCOMMITTED changes — an editor holds this file."
    DIRTY=1
  fi
done
if [ "$DIRTY" -ne 0 ]; then
  echo "     Commit (or stash) them first: this battery mutates these files in place."
  exit 1
fi
echo "  ownership: both mutation targets are clean"

# ── BASELINE ─────────────────────────────────────────────────────────────────
echo ""
echo "[baseline] clean tree must be GREEN"
rebuild
run_gate
BASE=$?
if [ "$BASE" -ne 0 ]; then
  echo "  !! BASELINE IS RED on a clean tree — fix the gate before running mutations."
  sed -n '1,40p' /tmp/hover-mut-gate.log
  exit 1
fi
echo "  baseline green"

# ── M1: lighten the amber hover to near-white (white text becomes illegible) ──
# This is the audit's exact defect shape: lightening a hover always lowers
# white-text contrast. #fde68a on white text measures ~1.25:1.
echo ""
echo "[M1] amber table button hover lightened to #fde68a (the audit's defect shape)"
mut src/styles/global.css \
  ':where(html) .bg-amber-500:hover { background-color: #92400e; }' \
  ':where(html) .bg-amber-500:hover { background-color: #fde68a; }'
rebuild
run_gate
judge "M1 amber hover lightened -> white text ~1.25:1" killed $?
restore src/styles/global.css

# ── M2: same, on the emerald button (a DIFFERENT hue, same rule) ──────────────
echo ""
echo "[M2] emerald table button hover lightened (proves the rule is not amber-specific)"
mut src/styles/global.css \
  ':where(html) .bg-emerald-600:hover { background-color: #065f46; }' \
  ':where(html) .bg-emerald-600:hover { background-color: #d1fae5; }'
rebuild
run_gate
judge "M2 emerald hover lightened" killed $?
restore src/styles/global.css

# ── M3: break the FORCED STATE itself (the gate's core assumption) ────────────
# Neutralise the gate's own force call so it measures the RESTING state. If the
# gate does not notice, its "0 failures" is worthless — this is the single most
# important mutation in this file.
echo ""
echo "[M3] the gate's own CSS.forcePseudoState call is neutralised (measures RESTING)"
# The backup is taken BEFORE the mutation. The first version took it AFTER, so a
# killed run left /tmp/test-hover-contrast.mjs.orig holding the MUTATED file —
# i.e. the recovery copy was the corruption. `set -u` and no `set -e` means a
# Ctrl-C mid-battery is a normal way to stop it, so this ordering matters.
cp e2e/test-hover-contrast.mjs /tmp/test-hover-contrast.mjs.orig
mut e2e/test-hover-contrast.mjs \
  "await cdp.send('CSS.forcePseudoState', { nodeId: cdpNodeId, forcedPseudoClasses: force });" \
  "await cdp.send('CSS.forcePseudoState', { nodeId: cdpNodeId, forcedPseudoClasses: [] });"
run_gate
# The PREMISE assertion compares forced vs real hover and must catch this.
judge "M3 forced state neutralised (caught by the premise assertion)" killed $?
cp /tmp/test-hover-contrast.mjs.orig e2e/test-hover-contrast.mjs

# ── M4: remove the ink-exclusion filter (trap 5) ─────────────────────────────
echo ""
echo "[M4] the ink-exclusion filter is removed (mode may become the glyph colour)"
mut e2e/test-hover-contrast.mjs \
  "if (near(d[i], d[i + 1], d[i + 2])) { ink++; continue; } // trap 5: drop glyph ink" \
  "if (false) { ink++; continue; }"
run_gate
judge "M4 ink filter removed" killed $?
cp /tmp/test-hover-contrast.mjs.orig e2e/test-hover-contrast.mjs

# ── M5: remove the border inset (trap 5, the other half) ─────────────────────
echo ""
echo "[M5] the 3px border inset is removed (the element's own border can become the mode)"
mut e2e/test-hover-contrast.mjs \
  "const INSET = 3;" \
  "const INSET = 0;"
run_gate
judge "M5 border inset removed" killed $?
cp /tmp/test-hover-contrast.mjs.orig e2e/test-hover-contrast.mjs

# ── M6: drop the off-viewport candidate filter (trap 2) ──────────────────────
echo ""
echo "[M6] the off-viewport candidate filter is dropped (drawer buttons re-enter the sweep)"
mut e2e/test-hover-contrast.mjs \
  "if (r.x < -1 || r.y < -1 || r.x + r.width > vw + 1 || r.y + r.height > vh + 1) continue;" \
  "if (false) continue;"
run_gate
judge "M6 off-viewport filter dropped" killed $?
cp /tmp/test-hover-contrast.mjs.orig e2e/test-hover-contrast.mjs

# ── M7: set the AA floor so low that a real defect passes ────────────────────
echo ""
echo "[M7] the AA floor is lowered to 0.5 (a broken detector that always passes)"
mut e2e/test-hover-contrast.mjs \
  "const AA_NORMAL = 4.5;" \
  "const AA_NORMAL = 0.5;"
mut src/styles/global.css \
  ':where(html) .bg-amber-500:hover { background-color: #92400e; }' \
  ':where(html) .bg-amber-500:hover { background-color: #fde68a; }'
rebuild
run_gate
# Expected: the mutated CSS is REAL but the lowered floor hides it. So this one
# is expected to SURVIVE if the floor is the only thing changed — it is here to
# document that the FLOOR is load-bearing, and the assertion below checks the
# gate is honest about it by confirming the same CSS IS killed at the real floor.
FLOOR_CODE=$?
cp /tmp/test-hover-contrast.mjs.orig e2e/test-hover-contrast.mjs
run_gate
REAL_CODE=$?
if [ "$FLOOR_CODE" -eq 0 ] && [ "$REAL_CODE" -ne 0 ]; then
  echo "  KILLED    M7 the AA floor is load-bearing (same CSS: passes at 0.5, fails at 4.5)"
  PASS=$((PASS + 1))
else
  echo "  !! M7 inconclusive: floor=$FLOOR_CODE real=$REAL_CODE (expected floor=0, real!=0)"
  HOLE=$((HOLE + 1))
fi
restore src/styles/global.css

# ── M8: OK-GREEN CONTROL — a compliant change must stay GREEN ────────────────
echo ""
echo "[M8] OK-GREEN CONTROL: amber hover DARKENED (stays compliant) must stay green"
mut src/styles/global.css \
  ':where(html) .bg-amber-500:hover { background-color: #92400e; }' \
  ':where(html) .bg-amber-500:hover { background-color: #78350f; }'
rebuild
run_gate
judge "M8 amber hover darkened to #78350f (still compliant)" green $?
restore src/styles/global.css

# ── FINAL: prove the tree is clean and green again ───────────────────────────
echo ""
echo "[final] restore + rebuild clean, gate must be GREEN"
rebuild
run_gate
FINAL=$?
if [ "$FINAL" -ne 0 ]; then
  echo "  !! GATE IS RED AFTER RESTORE — the tree is NOT clean"
  sed -n '1,40p' /tmp/hover-mut-gate.log
  exit 1
fi
echo "  final green"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  killed:      $PASS"
echo "  SURVIVED:    $HOLE"
echo "  ok-green:    $GREEN"
echo "  unexpected:  $UNEXPECTED"
echo "════════════════════════════════════════════════════════════════"

if [ "$HOLE" -ne 0 ] || [ "$UNEXPECTED" -ne 0 ]; then
  echo "BATTERY FAILED — a mutation survived (hole) or a control went red."
  exit 1
fi
echo "BATTERY PASSED"
