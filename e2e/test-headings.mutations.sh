#!/usr/bin/env bash
# Mutation battery for e2e/test-headings.mjs (§23).
#
# WHY A BATTERY
# -------------
# The heading guard asserts that the page h1 comes from FormToolbar, that there
# is exactly one of it, and that /master's section titles are real headings. A
# guard that has never been seen to fail is a hypothesis, not evidence — and this
# one nearly shipped with a check that COULD NOT FAIL (comparing the h1's right
# edge to the toggles' left edge, which is equal by construction because the h1
# is `flex-1`). That check was replaced; M6 below proves the replacement bites.
#
# A second near-miss is M7's reason to exist: /master is a wizard that renders
# ONE step at a time, so a single page load exposes 2 of the 12 section titles.
# A guard that inspects one load is therefore green for a div left in step 3 —
# the §20 trap again. The guard now walks all five steps, and M7 puts a div in
# step 3 precisely where a one-load check could not see it.
#
# Each mutation restores the exact defect the guard claims to catch. There are
# eleven: M1-M6 for the §23 heading rules, M7 for the wizard walk, M8/M9 for the
# §24 outline rules (a heading at the wrong LEVEL, which no count can see), and
# M10 for the §26 skip-link rule (a link whose FRAGMENT does not resolve).
#
# FOUR TRAPS THIS SCRIPT GUARDS AGAINST
# -------------------------------------
#  1. **The mutation never reaches dist/.** The guard tests a BUILT artifact, so
#     a mutation that was not rebuilt looks exactly like a SURVIVED — a hole
#     reported where there is none. Every step rebuilds and aborts if the source
#     did not change.
#  2. **A no-op mutation.** If the search string is not found the edit silently
#     does nothing, the guard stays green, and you record a SURVIVED that is
#     really a harness bug. `mut` asserts EXACTLY ONE match per pair and aborts.
#     Note the byte-identical restore check does NOT catch this.
#  3. **`astro build`'s exit code is not a signal here.** On this machine it exits
#     1 when the safe-delete shim refuses the cleanup, AFTER emitting the pages.
#     Only the guard's exit code is judged.
#  4. **`curl -o /dev/null` exits 23 in this Git-Bash even when the request
#     SUCCEEDS.** So a readiness check written `if curl -f -o /dev/null ...` is
#     never true: it burns its whole timeout and then aborts "no server came up",
#     which is exactly what the first run of this script did (10 minutes, zero
#     mutations tested). Use `curl -fsS URL > /dev/null` — that exits 0.
#
# `astro build` alone is enough: the guard does not look at the service worker.
# The manifest is regenerated at the end so dist/ is not left on the dev
# placeholder, which would strand an unrelated src/lib/swOffline.test.ts failure.
#
# Must be run with cwd = repo root:  bash e2e/test-headings.mutations.sh
set -u

GUARD=e2e/test-headings.mjs
TOOLBAR=src/components/forms/FormToolbar.tsx
SHARE=src/components/forms/ShareView.tsx
SISWA=src/components/forms/SiswaBaruForm.tsx
MASTER=src/components/forms/MasterFullForm.tsx
ADMIN=src/components/admin/AdminPanel.tsx
CANDIDATE=src/components/candidate/CandidateDash.tsx
PAGE_MASTER=src/pages/master.astro
BAK=.tmp-headings-bak

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
  node node_modules/astro/astro.js build >/dev/null 2>&1
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  check "$label" $?
  restore_one "$file"
}

# ── start a server for the built artifact, and OWN it ──────────────────────
# Do NOT probe 4321 first. Another server (a session's `npm run serve`) is often
# already there, and then the battery would be measuring a server it does not
# control — a crash in that server reads as KILLED for every step. server.cjs
# prints the port it chose, so read that instead.
SRV_LOG=.tmp-headings-serve.log
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

# Wait for readiness.
# NOTE: `curl -o /dev/null` exits 23 in this Git-Bash EVEN WHEN THE REQUEST
# SUCCEEDS, so `if curl -f -o /dev/null ...` is never true and a readiness loop
# written that way silently never fires — it just burns its full timeout and then
# aborts with "no server came up", which is exactly what happened on the first
# run of this script. Redirect stdout instead of using -o /dev/null.
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
if ! BASE_URL="$BASE" node "$GUARD" >/tmp/headings-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations would be meaningless"
  tail -20 /tmp/headings-base.txt
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
echo "baseline: green"
echo

for f in "$TOOLBAR" "$SHARE" "$SISWA" "$MASTER" "$ADMIN" "$CANDIDATE" "$PAGE_MASTER"; do backup "$f"; done

# ── one mutation per rule the guard claims to enforce ──────────────────────
step "M1  the toolbar title never renders (the page loses its h1)" \
  "$TOOLBAR" \
  '[["{(titleKey ? t(titleKey) : title) && (","{false && ("]]'

step "M2  the h1 exists but is hidden at every width" \
  "$TOOLBAR" \
  '[["text-slate-300 truncate","text-slate-300 truncate hidden"]]'

step "M3  /share regains its own h1 (duplicate h1)" \
  "$SHARE" \
  '[["<h2 class=\"text-sm sm:text-lg md:text-2xl font-black text-transparent","<h1 class=\"text-sm sm:text-lg md:text-2xl font-black text-transparent"],["leading-tight truncate\">PT AMANAH SAKURA JAPAN</h2>","leading-tight truncate\">PT AMANAH SAKURA JAPAN</h1>"]]'

step "M4  /master's section title goes back to a div (looks like a heading)" \
  "$MASTER" \
  '[["<h2 class=\"section-title\">{t(\"master.section_identitas\")}</h2>","<div class=\"section-title\">{t(\"master.section_identitas\")}</div>"]]'

step "M5  /siswa-baru's panel heading becomes an h1 again (duplicate h1)" \
  "$SISWA" \
  '[["<h2 class=\"text-sm md:text-lg font-black text-white\">{t('"'"'siswa.form_title'"'"')}</h2>","<h1 class=\"text-sm md:text-lg font-black text-white\">{t('"'"'siswa.form_title'"'"')}</h1>"]]'

step "M6  the toolbar title is unbounded (toggles pushed out of the bar)" \
  "$TOOLBAR" \
  '[["min-w-0 flex-1 px-2 text-center","w-[600px] shrink-0 px-2 text-center"]]'

# M7 exists to prove the WALK, not the assertion. The old check inspected one
# page load, i.e. step 1, which renders 2 of the 12 titles — so a div left in
# step 3 would have passed. This mutation puts one in step 3 and MUST be killed;
# if it survives, the guard is back to reporting on a page it never reached.
step "M7  a STEP-3 section title goes back to a div (proves the wizard walk)" \
  "$MASTER" \
  '[["<h2 class=\"section-title\">{t(\"form.mf_riwayat_pendidikan\")}</h2>","<div class=\"section-title\">{t(\"form.mf_riwayat_pendidikan\")}</div>"]]'

# M8/M9 prove the §24 OUTLINE checks. The §23 battery could only reach a COUNT of
# headings, so a heading sitting at the wrong LEVEL was invisible to it. Both
# mutations rewrite BOTH tags: changing only the opening tag would break the JSX,
# the build would fail, and the kill would be for the wrong reason.
step "M8  /admin's agenda card drops back to h3 (outline skips 1 -> 3)" \
  "$ADMIN" \
  '[["<h2 class=\"text-sm font-bold text-white\"><Icon name=\"calendar-check\"","<h3 class=\"text-sm font-bold text-white\"><Icon name=\"calendar-check\""],["{t('"'"'ui.agenda_recent'"'"')}</span></h2>","{t('"'"'ui.agenda_recent'"'"')}</span></h3>"]]'

step "M9  /candidate's inner heading climbs back to h3 (sibling repeats its parent)" \
  "$CANDIDATE" \
  '[["<h4 class=\"text-sm md:text-base font-black text-white mb-4 uppercase\"><Icon name=\"satellite-dish\"","<h3 class=\"text-sm md:text-base font-black text-white mb-4 uppercase\"><Icon name=\"satellite-dish\""],["{t('"'"'ui.app_status_latest'"'"')}</h4>","{t('"'"'ui.app_status_latest'"'"')}</h3>"]]'

# M10 covers the SKIP-LINK rule added with §26. `BaseLayout` emits
# `<a href="#main-content" class="skip-link">` on every page, and the guard
# resolves that fragment rather than reading the href — because a link to a
# missing id renders perfectly and does nothing. Measured before the fix:
# 5 of 9 routes (/apply /master /siswa-baru /share /ai-cv) had NO `#main-content`
# at all, so their skip link was dead. M10 removes the id from /master only, and
# exactly that route's two checks must go red while the other six stay green —
# which is what distinguishes an assertion about THIS page from one that always
# fails.
step "M10 /master loses #main-content (skip-link target disappears)" \
  "$PAGE_MASTER" \
  '[["<main id=\"main-content\"", "<main"]]'

# ── byte-identical restore, and green again ────────────────────────────────
echo
for f in "$TOOLBAR" "$SHARE" "$SISWA" "$MASTER" "$ADMIN" "$CANDIDATE" "$PAGE_MASTER"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done

node node_modules/astro/astro.js build >/dev/null 2>&1
node scripts/build-sw-manifest.mjs >/dev/null 2>&1

if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

kill "$SERVER_PID" 2>/dev/null
rm -rf "$BAK"
rm -f "$SRV_LOG"

echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
exit "$fail"
