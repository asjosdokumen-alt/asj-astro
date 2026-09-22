#!/usr/bin/env bash
# Mutation battery for e2e/test-dialog.mjs (§25).
#
# WHY A BATTERY
# -------------
# The dialog guard asserts that every visible overlay either declares itself
# presentational (`aria-hidden`) or carries a role with a resolvable accessible
# name. None of that is visible in the source, so a reader cannot tell a wired
# overlay from an unwired one — only the rendered DOM can. A guard that has
# never been seen to fail is a hypothesis, not evidence.
#
# This one already had TWO checks that could not fail, both found while writing
# it, and both are the reason M4 and M9 exist:
#
#   * The stacked-dialog check compared `new Set(ids).size` to `ids.length`.
#     With one dialog named and one unnamed that is 1 === 1 — GREEN. The run
#     printed `2 dialogs, ids ["asj-overlay-title-4"]` and passed. It now
#     asserts that every dialog is named FIRST, and M9 removes PamfletModal's
#     label to prove the assertion bites.
#   * `aria-labelledby` was the only naming mechanism collected, so the
#     `aria-label` path was invisible to the check. M4 makes a label dangle
#     instead of vanish, which only a resolving-name check can see.
#
# M10 is the vacuity control: if the dialog never opens, the sweep finds zero
# overlays and "no violations" is true and worthless. M10 stops the modal from
# opening at all, so the guard must fail on the COUNT rather than on the rule.
#
# FOUR TRAPS THIS SCRIPT GUARDS AGAINST
# -------------------------------------
#  1. **The mutation never reaches dist/.** The guard tests a BUILT artifact, so
#     a mutation that was not rebuilt looks exactly like a SURVIVED — a hole
#     reported where there is none. Every step rebuilds.
#  2. **A no-op mutation.** If the search string is not found the edit silently
#     does nothing, the guard stays green, and you record a SURVIVED that is
#     really a harness bug. `mut` asserts EXACTLY ONE match per pair and aborts.
#  3. **`astro build`'s exit code is not a signal here.** On this machine it
#     exits 1 when the safe-delete shim refuses the cleanup, AFTER emitting the
#     pages. Only the guard's exit code is judged.
#  4. **`curl -o /dev/null` exits 23 in this Git-Bash even when the request
#     SUCCEEDS**, so `if curl -f -o /dev/null ...` is never true. Use
#     `curl -fsS URL > /dev/null`.
#
# The guard needs LIVE job data from the proxied backend, so the server must be
# `server.cjs` — `astro preview` cannot answer `/.netlify/functions/*` and the
# job table would come up empty, failing the guard for the wrong reason.
#
# Must be run with cwd = repo root:  bash e2e/test-dialog.mutations.sh
set -u

GUARD=e2e/test-dialog.mjs
HOOK=src/components/ui/useOverlay.ts
APP=src/components/App.tsx
PAMFLET=src/components/public/PamfletModal.tsx
TABLE=src/components/public/LokerTable.tsx
BAK=.tmp-dialog-bak

fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
backup() { mkdir -p "$BAK"; cp "$1" "$BAK/$(key "$1")"; }
restore_one() { local b="$BAK/$(key "$1")"; [ -f "$b" ] && cp "$b" "$1"; }

# Apply a mutation. Pairs come in through the environment, not a heredoc:
# heredocs plus shell interpolation mangle quotes under Git-Bash.
#   mut <file> '[["old","new"],...]'
mut() {
  MUT_FILE="$1" MUT_PAIRS="$2" node -e '
const fs = require("fs");
const p = process.env.MUT_FILE;
const pairs = JSON.parse(process.env.MUT_PAIRS);
let s = fs.readFileSync(p, "utf8");
for (const [oldStr, newStr] of pairs) {
  const hits = s.split(oldStr).length - 1;
  if (hits !== 1) {
    console.error("MUTATION DID NOT APPLY (hits=" + hits + "): " + JSON.stringify(oldStr.slice(0, 70)));
    process.exit(3);
  }
  s = s.split(oldStr).join(newStr);
}
fs.writeFileSync(p, s);
'
}

check() {
  local label="$1" rc="$2"
  if [ "$rc" -ne 0 ]; then
    echo "KILLED     exit=$rc  $label"
    results+=("KILLED $label")
  else
    echo "SURVIVED   exit=0   $label   <-- HOLE: this defect is not caught"
    results+=("SURVIVED $label")
    fail=1
  fi
}

step() {
  local label="$1" file="$2" pairs="$3"
  restore_one "$file"
  if ! mut "$file" "$pairs"; then
    echo "ABORT: the mutation for '$label' did not apply."
    exit 1
  fi
  node node_modules/astro/astro.js build >/dev/null 2>&1
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  check "$label" $?
  restore_one "$file"
}

# ── start a server for the built artifact, and OWN it ──────────────────────
SRV_LOG=.tmp-dialog-serve.log
node server.cjs > "$SRV_LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null; exit 1' INT TERM

PORT=""
for _ in $(seq 1 30); do
  PORT=$(grep -o 'localhost:[0-9]*' "$SRV_LOG" 2>/dev/null | head -1 | cut -d: -f2)
  [ -n "$PORT" ] && break
  sleep 1
done
if [ -z "$PORT" ]; then
  echo "ABORT: server.cjs never reported a port"; cat "$SRV_LOG"
  kill "$SERVER_PID" 2>/dev/null; exit 1
fi
BASE="http://127.0.0.1:$PORT"

ready=0
for _ in $(seq 1 30); do
  if curl -fsS "$BASE/public" > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "ABORT: $BASE never became ready"
  kill "$SERVER_PID" 2>/dev/null; exit 1
fi
echo "server: $BASE (pid $SERVER_PID)"

# ── RULE 1: baseline must be green before any mutation is interpreted ──────
if ! BASE_URL="$BASE" node "$GUARD" >/tmp/dialog-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations would be meaningless"
  tail -25 /tmp/dialog-base.txt
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
echo "baseline: green"
echo

for f in "$HOOK" "$APP" "$PAMFLET" "$TABLE"; do backup "$f"; done

# ── one mutation per rule the guard claims to enforce ──────────────────────
step "M1  the dialog never gets a role" \
  "$HOOK" \
  '[["root.setAttribute('"'"'role'"'"', role);","/* role removed */"]]'

step "M2  the dialog never claims to be modal" \
  "$HOOK" \
  '[["root.setAttribute('"'"'aria-modal'"'"', '"'"'true'"'"');","/* aria-modal removed */"]]'

step "M3  the dialog is never named (no aria-labelledby)" \
  "$HOOK" \
  '[["root.setAttribute('"'"'aria-labelledby'"'"', heading.id);","/* name removed */"]]'

step "M4  the name DANGLES instead of vanishing (aria-labelledby to nowhere)" \
  "$HOOK" \
  '[["root.setAttribute('"'"'aria-labelledby'"'"', heading.id);","root.setAttribute('"'"'aria-labelledby'"'"', '"'"'no-such-element-xyz'"'"');"]]'

step "M5  the whole semantics effect is disabled" \
  "$HOOK" \
  '[["    if (!open) {","    if (!open || true) {"]]'

step "M6  the Tab trap is removed (aria-modal would become a false claim)" \
  "$HOOK" \
  '[["if (!open || role !== '"'"'dialog'"'"') return;","if (!open || role !== '"'"'dialog'"'"' || true) return;"]]'

step "M7  Escape no longer closes the dialog" \
  "$HOOK" \
  '[["if (!open || !closeOnEscape) return;","if (!open || !closeOnEscape || true) return;"]]'

step "M8  the App drawer scrim goes back to a nameless clickable div" \
  "$APP" \
  '[["aria-hidden=\"true\" class=\"u-viewport-fixed u-modal-shell bg-black/70\"","class=\"u-viewport-fixed u-modal-shell bg-black/70\""]]'

step "M9  PamfletModal loses its label (an unnamed dialog beside a named one)" \
  "$PAMFLET" \
  '[["label: t(\"ui.alt_pamflet\"),","label: undefined,"]]'

# M10 is the vacuity control, not a rule: it stops the modal opening at all, so
# every DOM assertion has nothing to look at. The guard must fail on the COUNT.
step "M10 the detail dialog never opens (vacuity control)" \
  "$TABLE" \
  '[["onClick={() => setSelectedJob(job)}","onClick={() => {}}"]]'

# ── restore + rebuild so dist/ is not left mutated ─────────────────────────
for f in "$HOOK" "$APP" "$PAMFLET" "$TABLE"; do restore_one "$f"; done
node node_modules/astro/astro.js build >/dev/null 2>&1
node scripts/build-sw-manifest.mjs >/dev/null 2>&1

kill "$SERVER_PID" 2>/dev/null

echo
echo "─────────────────────────────────────────────"
killed=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED')
survived=$(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')
echo "killed: $killed · survived: $survived"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAIL — a mutation survived"
  exit 1
fi
echo "RESULT: PASS — every mutation was caught"
