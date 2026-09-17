#!/usr/bin/env bash
# Mutation battery for e2e/test-public.mjs (§1.2, closing the last blocking
# gate that had no battery — measured 2026-09-18: `verify:review-manifest`
# reported exactly one blocking gate with `provenBy: null`, and it was this one).
#
# WHY A BATTERY
# -------------
# The public-page guard is the ONLY blocking gate in the manifest with no proof
# that it can fail. Everything it asserts is a string on a rendered page, and
# strings are exactly what a guard over-reports on: a check that greps for text
# which exists in a `<meta>` tag, or in a hidden section, stays green while the
# page is visibly broken. That is not hypothetical here — this same file's own
# history records it: the first version waited on 'text=ASJ Portal', a string
# that only ever appears in `<meta name="apple-mobile-web-app-title">`, so the
# assertion could never pass and the check was meaningless in the other
# direction. The current guard waits on 'Lowongan Loker' instead.
#
# So the mutations below are chosen to break VISIBILITY and BEHAVIOUR, not
# merely markup, because those are the two failure modes a text-based guard is
# blind to:
#
#   M1  the marker text is deleted          -> does the guard actually read the page?
#   M2  the loker section is hidden, but present
#   M3  the text survives only in a `<meta>` tag   (the historical defect)
#   M4  a tab button's label is renamed     -> the tab assertions must bite
#   M5  the Layanan section never un-hides  -> the tab SWITCH must be observed
#   M6  a table header is renamed           -> the table assertions must bite
#   M7  the footer / back-button text goes  -> the last two assertions must bite
#
# M3 is the important one: it reproduces the exact class of defect this guard was
# already fixed for once. If M3 SURVIVES, the guard has regressed to trusting
# markup that is not visible, and the suite would report a healthy page for a
# blank one. M5 is the second important one: it proves the guard waits for the
# tab to actually switch rather than asserting on the initial DOM.
#
# FOUR TRAPS THIS SCRIPT GUARDS AGAINST (all four were measured in this repo)
# --------------------------------------------------------------------------
#  1. **The mutation never reaches dist/.** The guard tests a BUILT artifact, so
#     a mutation that was not rebuilt looks exactly like a SURVIVED — a hole
#     reported where there is none. Every step rebuilds.
#  2. **A no-op mutation.** If the search string is not found the edit silently
#     does nothing, the guard stays green, and you record a SURVIVED that is
#     really a harness bug. `mut` asserts EXACTLY ONE match per pair and aborts.
#  3. **`astro build`'s exit code is not a signal here.** On this machine it exits
#     1 when the safe-delete shim refuses the cleanup, AFTER emitting the pages.
#     Only the guard's exit code is judged.
#  4. **`curl -o /dev/null` exits 23 in this Git-Bash even when the request
#     SUCCEEDS.** A readiness check written `if curl -f -o /dev/null ...` is never
#     true: it burns its whole timeout and then aborts "no server came up". Use
#     `curl -fsS URL > /dev/null`, which exits 0.
#
# Must be run with cwd = repo root:  bash e2e/test-public.mutations.sh
set -u

GUARD=e2e/test-public.mjs
PAGE=src/pages/public.astro
LAYANAN=src/components/public/LayananSection.astro
LOKER=src/components/public/LokerTable.tsx
I18N=src/store/i18n.ts
FOOTER=src/components/Footer.astro
BAK=.tmp-public-bak

fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
backup() { mkdir -p "$BAK"; cp "$1" "$BAK/$(key "$1")"; }
restore_one() { local b="$BAK/$(key "$1")"; [ -f "$b" ] && cp "$b" "$1"; }

# Apply a mutation. Pairs come in through the environment, not a heredoc:
# heredocs plus shell interpolation mangle quotes under Git-Bash, and `python`
# is not guaranteed to exist on the machine at all. `node -e` is.
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
    console.error("MUTATION DID NOT APPLY (hits=" + hits + "): " + JSON.stringify(oldStr.slice(0, 60)));
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
  npx astro build >/dev/null 2>&1
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  check "$label" $?
  restore_one "$file"
}

# ── start a server for the built artifact, and OWN it ──────────────────────
# Do NOT probe 4321 first. Another server (a session's `npm run serve`) is often
# already there, and then the battery would be measuring a server it does not
# control — a crash in that server reads as KILLED for every step. server.cjs
# prints the port it chose, so read that instead.
SRV_LOG=.tmp-public-serve.log
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

# Wait for readiness. See trap 4 in the header — do NOT use `curl -o /dev/null`.
ready=0
for _ in $(seq 1 30); do
  if curl -fsS "$BASE/" > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "ABORT: $BASE never became ready"
  kill "$SERVER_PID" 2>/dev/null; exit 1
fi
echo "server: $BASE (pid $SERVER_PID)"

# ── RULE 1: baseline must be green before any mutation is interpreted ──────
if ! BASE_URL="$BASE" node "$GUARD" >/tmp/public-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations would be meaningless"
  tail -20 /tmp/public-base.txt
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
echo "baseline: green"
echo

for f in "$PAGE" "$LAYANAN" "$LOKER" "$I18N" "$FOOTER"; do backup "$f"; done

# ── one mutation per claim the guard makes ────────────────────────────────
# M1  the very marker the guard waits for. Deleting it must fail the load test.
step "M1  'Lowongan Loker' is deleted from the page" \
  "$PAGE" \
  '[["ui.tab_loker\">Lowongan Loker<","ui.tab_loker\"><"]]'

# M2  the text is present but the section is hidden. A guard that reads the DOM
#     without checking visibility passes here — Playwright's text= selector does
#     respect visibility for a hidden ancestor, so this must be KILLED.
step "M2  the loker section is hidden (text present, invisible)" \
  "$PAGE" \
  '[["<div id=\"section-loker\">","<div id=\"section-loker\" class=\"hidden\">"]]'

# M3  THE HISTORICAL DEFECT. The marker survives only inside a meta tag, exactly
#     as 'ASJ Portal' once did. A guard that greps for the string anywhere in the
#     document stays green here; one that requires it VISIBLE must go red.
step "M3  the marker survives only in a <meta> tag (the old ASJ Portal defect)" \
  "$PAGE" \
  '[["ui.tab_loker\">Lowongan Loker<","ui.tab_loker\"><meta name=\"x\" content=\"Lowongan Loker\" /><"]]'

# M4  a tab label is renamed. Breaks the two tab-existence assertions.
step "M4  the Layanan tab label is renamed" \
  "$PAGE" \
  '[["ui.tab_layanan\">Program &amp; Layanan ASJ<","ui.tab_layanan\">Layanan Program<"]]'

# M5  the tab SWITCH is broken: switchTab no longer un-hides the Layanan section.
#     The button still exists and still has its label, so M4's assertions stay
#     green — only the behavioural assertion can catch this. This is what proves
#     the guard observes the switch rather than the initial DOM.
step "M5  switchTab no longer reveals the Layanan section" \
  "$PAGE" \
  '[["secLayanan.classList.remove('"'"'hidden'"'"');","/* mutation: never revealed */"]]'

# M6  a table header is renamed. The header text comes from i18n (`table.job`),
#     and the guard asserts on the RENDERED string, so the mutation targets the
#     i18n value rather than the markup. That is also what makes this a real
#     test of the assertion: the `<th>` element still exists and is still
#     correct, only its text changes.
step "M6  the 'NAMA PEKERJAAN' table header text is changed" \
  "$I18N" \
  '[["\"table.job\": \"NAMA PEKERJAAN\",","\"table.job\": \"NAMA JOB\","]]'

# M7  the footer copy. The footer is NOT in public.astro — it is rendered by
#     BaseLayout because public.astro passes `showFooter={true}`. Targeting the
#     shared component is deliberate: it proves the guard resolves the string to
#     the page it actually loads, and the byte-identical restore is what keeps a
#     shared file safe to mutate.
step "M7  the footer copy is changed (shared BaseLayout)" \
  "$FOOTER" \
  '[["data-lang=\"footer.title\">PT Amanah Sakura Japan<","data-lang=\"footer.title\">Amanah Sakura<"]]'

# ── byte-identical restore, and green again ────────────────────────────────
echo
for f in "$PAGE" "$LAYANAN" "$LOKER" "$I18N" "$FOOTER"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done

npx astro build >/dev/null 2>&1
node scripts/build-sw-manifest.mjs >/dev/null 2>&1

if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

kill "$SERVER_PID" 2>/dev/null
# Cleanup must never be able to mask the verdict: a refused delete raises a
# non-zero exit, which would be read as "the battery failed" even when every
# mutation was killed. See the delete-quota note in the project memory.
node -e '
try {
  const fs = require("fs");
  const dir = ".tmp-public-bak";
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(dir + "/" + f);
    fs.rmdirSync(dir);
  }
  if (fs.existsSync(".tmp-public-serve.log")) fs.unlinkSync(".tmp-public-serve.log");
} catch (e) {
  console.error("cleanup refused (harmless): " + e.message);
}
' || true

echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
exit "$fail"
