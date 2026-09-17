#!/usr/bin/env bash
# Mutation battery for e2e/test-drawer.mjs.
#
# WHY A BATTERY
# -------------
# The guard asserts things that were TRUE ONLY AFTER this round's fix (an inert
# closed drawer, an Escape handler, a focus hand-off, a login modal with a
# role). None of those can be trusted on the strength of "the guard is green" —
# a guard that was written against the fixed tree passes on the fixed tree by
# construction. Each mutation below re-introduces one defect the guard claims to
# pin; the guard must exit non-zero for every one of them. A SURVIVED line is a
# hole.
#
# FOUR TRAPS THIS SCRIPT GUARDS AGAINST
# -------------------------------------
#  1. **The mutation never reaches dist/.** The guard tests a BUILT artifact, so
#     a mutation that was never rebuilt looks exactly like a SURVIVED — a hole
#     reported where there is none. Every step therefore compares the JS chunk
#     the page actually loads against the baseline, and aborts if unchanged.
#  2. **`astro build`'s exit code is not a signal here.** On this machine it
#     exits non-zero when the safe-delete shim refuses `cleanServerOutput`,
#     AFTER the pages are emitted. Only the guard's exit code is judged.
#  3. **A mutation that does not apply.** `mut()` asserts EXACTLY ONE match, so
#     a stale anchor fails loudly instead of silently becoming a no-op that
#     then reads as SURVIVED.
#  4. **A readiness loop that cannot succeed.** `curl -o /dev/null` exits 23
#     even on a 200, so `curl -fsS -o /dev/null "$URL" && break` never breaks
#     and burns the whole timeout. This script redirects stdout instead.
#
# M7 exists to prove the guard's OWN positive control is not vacuous: it makes
# the drawer permanently inert, so the control ("the Tab-walk CAN see inside an
# OPEN drawer") must fail. Without M7 the control would only ever have been
# observed passing.
#
# Must be run with cwd = repo root:  bash e2e/test-drawer.mutations.sh
set -u

APP=src/components/App.tsx
LOGIN=src/components/LoginModal.tsx
GUARD=e2e/test-drawer.mjs
# The backup lives in the OS temp dir, NOT in the repo. Observed on the first
# run of e2e/test-labels.mutations.sh: the safe-delete shim refused the cleanup
# AFTER the verdict was printed, so the script died with exit 1 no matter how
# many mutations survived — a battery whose exit code cannot separate "all
# killed" from "all survived". Keeping the backup out of the tree also means a
# refused delete cannot leave a fixture behind for the next runner to trip on.
BAK="${TMPDIR:-/tmp}/asj-drawer-bak.$$"
PORT=4362
BASE="http://127.0.0.1:${PORT}"

fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
restore_one() { local b="$BAK/$(key "$1")"; [ -f "$b" ] && cp "$b" "$1"; }
restore_all() { restore_one "$APP"; restore_one "$LOGIN"; }

# The JS chunk the page actually loads — not whatever sorts first on disk. The
# App chunk carries LoginModal too (verified: it contains "login.pass_label"),
# so one filename covers mutations in either file.
served_js() { grep -o '_astro/App\.[A-Za-z0-9_-]*\.js' dist/index.html 2>/dev/null | head -1; }

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
    echo "SURVIVED   exit=0   $label   <-- HOLE: this defect is not pinned"
    results+=("SURVIVED $label")
    fail=1
  fi
}

step() {
  local label="$1" file="$2" old="$3" new="$4"
  restore_all
  if ! mut "$file" "$old" "$new"; then
    echo "ABORT: the mutation for '$label' did not apply."
    exit 1
  fi
  npx astro build >/dev/null 2>&1
  local now
  now=$(served_js)
  if [ "$now" = "$BASE_JS" ]; then
    echo "ABORT: the mutation for '$label' never reached dist/ (page still loads $now)."
    exit 1
  fi
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  local rc=$?
  check "$label" "$rc"
  restore_all
}

mkdir -p "$BAK"
restore_all || true
cp "$APP" "$BAK/$(key "$APP")"
cp "$LOGIN" "$BAK/$(key "$LOGIN")"

# ── server ──────────────────────────────────────────────────────────────────
npx astro preview --host 127.0.0.1 --port "$PORT" >/dev/null 2>&1 &
PREVIEW_PID=$!
trap 'kill "$PREVIEW_PID" 2>/dev/null; restore_all' EXIT
for _ in $(seq 1 30); do
  curl -fsS "$BASE/" >/dev/null 2>&1 && break
  sleep 1
done

# ── baseline must be green before any mutation is interpreted ───────────────
npx astro build >/dev/null 2>&1
BASE_JS=$(served_js)
if [ -z "$BASE_JS" ]; then
  echo "ABORT: could not read the App chunk filename from dist/index.html."
  exit 1
fi
if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "BASELINE RED — the guard fails on an unmutated tree. Aborting."
  BASE_URL="$BASE" node "$GUARD" || true
  exit 1
fi
echo "baseline green (${BASE_JS##*/})"

# ── one mutation per defect the guard claims to pin ─────────────────────────
step "M1  closed drawer is never made inert (its 6 Tab stops come back)" \
     "$APP" \
     'if (el) el.inert = !menuOpen;' \
     'if (el) el.inert = false;'

step "M2  Escape handler neutered" \
     "$APP" \
     "      if (e.key !== 'Escape') return;" \
     '      if (true) return;'

step "M3  focus is no longer moved into the drawer on open" \
     "$APP" \
     "    el?.querySelector<HTMLElement>('button, a[href]')?.focus();" \
     '    void el;'

step "M4  focus is no longer restored to the hamburger on close" \
     "$APP" \
     'if (lost && trigger && document.contains(trigger)) trigger.focus();' \
     'void lost; void trigger;'

step "M5  LoginModal detaches containerRef (role/name/trap all vanish)" \
     "$LOGIN" \
     '<div ref={containerRef} class="fixed inset-0 u-modal-shell bg-black/80' \
     '<div class="fixed inset-0 u-modal-shell bg-black/80'

step "M6  login field loses data-autofocus (focus falls to the close button)" \
     "$LOGIN" \
     '<input type="tel" value={logWa} data-autofocus' \
     '<input type="tel" value={logWa}'

step "M7  drawer permanently inert (must break the guard's OWN control)" \
     "$APP" \
     'if (el) el.inert = !menuOpen;' \
     'if (el) el.inert = true;'

# ── byte-identical restore, and green again ────────────────────────────────
echo
for f in "$APP" "$LOGIN"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done
npx astro build >/dev/null 2>&1
# The battery builds with `astro build` alone, which skips `build-sw-manifest.mjs`
# — the step `npm run build` chains on. Leaving that out leaves dist/'s service
# worker on its dev placeholder and reddens unrelated tests, so it is repaired
# here rather than left for whoever runs `npm test` next.
node scripts/build-sw-manifest.mjs >/dev/null 2>&1
if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
# Wrapped, because this cleanup must never be able to mask the verdict above.
# NOTE: node's fs IS subject to the shim — it hooks `rmSync`, not just the
# shell's `rm`. A previous note in this repo claimed otherwise; the crash at
# the end of the first e2e/test-labels battery run is the counter-example.
node -e 'try{require("fs").rmSync(process.argv[1],{recursive:true,force:true})}catch(e){console.error("[cleanup] could not remove "+process.argv[1]+": "+String(e.message).split("\n")[0])}' "$BAK" || true
exit "$fail"
