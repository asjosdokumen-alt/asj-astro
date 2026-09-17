#!/usr/bin/env bash
# Mutation battery for e2e/test-loker-layout.mjs (§11.2).
#
# WHY A BATTERY
# -------------
# §11.2 was reported fixed once before (§14) while one of its own CSS comments
# stayed untrue, so "the guard passes" is not evidence by itself. Each mutation
# below re-introduces one geometry the guard claims to pin; the guard must exit
# non-zero for every one of them. A SURVIVED line is a hole.
#
# THREE TRAPS THIS SCRIPT GUARDS AGAINST
# --------------------------------------
#  1. **The mutation never reaches dist/.** The guard tests a BUILT artifact, so
#     a mutation that never got rebuilt would look exactly like a SURVIVED — a
#     hole reported where there is none. Every step therefore compares the CSS
#     the page actually loads against the baseline, and aborts if unchanged.
#  2. **Do NOT detect that with `ls dist/_astro/*.css | head -1`.** The first
#     version of this script did, and it aborted a perfectly good run: when
#     `cleanServerOutput` is refused by the safe-delete shim, the previous
#     stylesheet stays on disk, so the directory holds two files and `head -1`
#     returns whichever sorts first — not the one the page loads. The filename
#     is read out of `dist/index.html` instead, which is unambiguous.
#  3. **`astro build`'s own exit code is not a signal here.** On this machine it
#     exits 1 when that same shim refuses the cleanup, AFTER emitting the pages.
#     Only the guard's exit code is judged.
#
# Only `astro build` is run, not `npm run build`: the service-worker manifest is
# irrelevant to layout.
#
# Must be run with cwd = repo root:  bash e2e/test-loker-layout.mutations.sh
set -u

CSS=src/styles/layout.css
GUARD=e2e/test-loker-layout.mjs
BAK=.tmp-cssmut
PORT=4361
BASE="http://127.0.0.1:${PORT}"

fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
restore_one() { local b="$BAK/$(key "$1")"; [ -f "$b" ] && cp "$b" "$1"; }

# The stylesheet the page actually loads — not whatever sorts first on disk.
served_css() { grep -o '_astro/admin\.[A-Za-z0-9_-]*\.css' dist/index.html 2>/dev/null | head -1; }

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

check() {
  local label="$1" rc="$2"
  if [ "$rc" -ne 0 ]; then
    echo "KILLED     exit=$rc  $label"
    results+=("KILLED $label")
  else
    echo "SURVIVED   exit=0   $label   <-- HOLE: this geometry is not pinned"
    results+=("SURVIVED $label")
    fail=1
  fi
}

step() {
  local label="$1" old="$2" new="$3"
  restore_one "$CSS"
  if ! mut "$CSS" "$old" "$new"; then
    echo "ABORT: the mutation for '$label' did not apply."
    exit 1
  fi
  npx astro build >/dev/null 2>&1
  local now
  now=$(served_css)
  if [ "$now" = "$BASE_CSS" ]; then
    echo "ABORT: the mutation for '$label' never reached dist/ (page still loads $now)."
    exit 1
  fi
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  local rc=$?
  check "$label" "$rc"
  restore_one "$CSS"
}

mkdir -p "$BAK"
cp "$CSS" "$BAK/$(key "$CSS")"

# ── server ──────────────────────────────────────────────────────────────────
npx astro preview --host 127.0.0.1 --port "$PORT" >/dev/null 2>&1 &
PREVIEW_PID=$!
trap 'kill "$PREVIEW_PID" 2>/dev/null; restore_one "$CSS"' EXIT
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "$BASE/" 2>/dev/null && break
  sleep 1
done

# ── baseline must be green before any mutation is interpreted ───────────────
npx astro build >/dev/null 2>&1
BASE_CSS=$(served_css)
if [ -z "$BASE_CSS" ]; then
  echo "ABORT: could not read the stylesheet filename from dist/index.html."
  exit 1
fi
if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "BASELINE RED — the guard fails on an unmutated tree. Aborting."
  BASE_URL="$BASE" node "$GUARD" || true
  exit 1
fi
echo "baseline green (${BASE_CSS##*/})"

# ── one mutation per geometry the guard claims to pin ──────────────────────
step "M1  row back to display:block (kills the card layout)" \
     'display: flex;
    flex-wrap: wrap;
    align-items: flex-start;' \
     'display: block;'

step "M2  identity cells lose their order (code and status split again)" \
     '    order: 1;
    flex: 0 0 auto;' \
     '    order: 9;
    flex: 0 0 auto;'

step "M3  action targets below the 44px guideline" \
     '    min-height: 44px;' \
     '    min-height: 24px;'

step "M4  table regains min-width at 390px (horizontal overflow)" \
     '  table:has(.rt-row) {
    min-width: 0;
    display: block;
  }' \
     '  table:has(.rt-row) {
    min-width: 700px;
    display: block;
  }'

step "M5  full-width cells lose their data-label" \
     '  table:has(.rt-row) td.rt-full::before {
    content: attr(data-label);' \
     '  table:has(.rt-row) td.rt-full::before {
    content: none;'

step "M6  pinned identity column goes static at md+" \
     '    position: sticky;
    left: 0;
    z-index: 3;' \
     '    position: static;
    left: 0;
    z-index: 3;'

# ── byte-identical restore, and green again ────────────────────────────────
echo
if ! diff -q "$BAK/$(key "$CSS")" "$CSS" >/dev/null; then
  echo "RESTORE FAILED — $CSS is not byte-identical to its backup"
  fail=1
fi
npx astro build >/dev/null 2>&1
# The battery builds with `astro build` alone, which skips `build-sw-manifest.mjs`
# — the step `npm run build` chains on. Leaving that out leaves `dist/`'s service
# worker on its dev placeholder, and `src/lib/swOffline.test.ts` then fails with
# "asj-astro-dev" instead of a content hash. That is a side effect of the battery,
# not of the code under test, so it is repaired here rather than left for whoever
# runs `npm test` next.
node scripts/build-sw-manifest.mjs >/dev/null 2>&1
if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
rm -rf "$BAK"
exit "$fail"
