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
# §24 outline rules (a heading at the wrong LEVEL, which no count can see), M10
# for the §26 skip-link rule (a link whose FRAGMENT does not resolve), and M11
# for the main-landmark rule added with the 2026-09-28 ARIA sweep.
#
# SIX TRAPS THIS SCRIPT GUARDS AGAINST
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
#  5. **The mutation reaches dist/ but never reaches the DOM.** A SURVIVED is only
#     evidence about the ASSERTION if the mutated markup was on the page the guard
#     loaded. Point a mutation at a heading behind a non-default tab, or behind a
#     data fetch the fabricated session cannot satisfy, and the guard cannot see
#     it — so it survives for a reason that has nothing to do with the assertion.
#     Measured 2026-09-28: M8 and M9 both survived this way (see their block
#     below); both are now aimed at headings the route load actually renders, and
#     both are KILLED. Before recording a SURVIVED as a hole, confirm the mutation
#     is visible in the built artifact's DOM — inspect the route, do not infer.
#  6. **A stale dist/ read as a red baseline.** (Numbered separately because it is
#     the trap that cost the most time.) The baseline check BUILD first; reading
#     a `dist/` left over from an interrupted run reports a defect the tree does
#     not have. See the note on the baseline block below.
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
TABAGENDA=src/components/admin/TabAgenda.tsx
TABKELOLA=src/components/admin/TabKelola.tsx
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
# BUILD FIRST. The guard tests a BUILT artifact, so a baseline read against a
# `dist/` that predates the tree is evidence about that artifact, not about the
# tree — and the two are not the same thing. Measured 2026-09-28: an interrupted
# run left `dist/_astro/MasterFullForm.*.js` holding M7's mutation (a `div"`,
# `class:"section-title"`), so the baseline went RED on /master with "1 of 12
# .section-title elements are not headings (found DIV)" while `src/` was clean —
# and the battery aborted before testing a single mutation. That reads as "the
# tree has a defect" when the truth is "dist/ is stale", which is the exact
# confusion trap #1 in the header describes. The build makes the baseline
# describe the current sources, which is the only thing it can usefully assert.
node node_modules/astro/astro.js build >/dev/null 2>&1
if ! BASE_URL="$BASE" node "$GUARD" >/tmp/headings-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations would be meaningless"
  tail -20 /tmp/headings-base.txt
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
echo "baseline: green"
echo

for f in "$TOOLBAR" "$SHARE" "$SISWA" "$MASTER" "$ADMIN" "$TABAGENDA" "$TABKELOLA" "$CANDIDATE" "$PAGE_MASTER"; do backup "$f"; done

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
#
# ⚠ RE-AIMED 2026-09-28, and this is the important part of this file's history.
# Both mutations previously targeted headings in components that the guard's
# route load NEVER RENDERS, so both SURVIVED — and a SURVIVED is supposed to mean
# "the assertion has a hole". It did not. It meant the MUTATION never reached the
# DOM, which is trap #1 in the header ("the mutation never reaches dist/") with a
# second face: it can reach dist/ and still never be on the page.
#
#   M8's old target — `<h2 class="text-amber-400 font-bold text-lg">` in
#   `TabAgenda.tsx:120` — sits in the admin `agenda` TAB. `AdminPanel` renders
#   ONLY the active tab (`<TabContent tab={activeTab} />`), and the default tab is
#   `kelola`. Measured on the built artifact: `/admin`'s visible outline is
#   `H1 "Panel Admin" -> H2 "Lowongan Publik"`, i.e. the agenda card is not in the
#   DOM at all. Demoting a heading the page never renders cannot change the page.
#
#   M9's old target — the `app_list_title` h4 in `CandidateDash.tsx:588` — sits
#   inside a block that only renders with REAL candidate data. The guard fabricates
#   a session (`headings-fake-kandidat`), which the API rejects, so `/candidate`
#   renders "Data tidak ditemukan!" and its only visible heading is the shell's
#   `H1 "Dashboard Kandidat"`. Measured the same way.
#
# Both are now aimed at headings the guard's route load DOES render:
#   M8 → `TabKelola.tsx:92`, the `kelola` tab's own H2, which IS the `H2 "Lowongan
#        Publik"` in that outline. Demoted to H3 it makes `H1 -> H3` — a skipped
#        level on the default view.
#   M9 → `MasterFullForm.tsx:691`. `/master` step 1's outline is
#        `H1 -> H2 "Identitas Dasar" -> H2 "Kontak & Fisik"`, two ADJACENT H2s.
#        Pointing the second at the first's key (both `master.section_identitas`)
#        makes two adjacent H2s with the SAME text — the exact "a nested heading is
#        sitting at its parent's level" defect the second assertion names.
# Both anchors are SINGLE-LINE, so the `.tsx`-is-not-pinned-to-LF caveat noted
# under M11 does not apply here.
#
# Measured after re-aiming (each applied to a clean tree, rebuilt, then run):
#   M8 → KILLED exit=1, exactly /admin at 390 and 1280, message names H1 -> H3
#   M9 → KILLED exit=1, exactly /master at 390 and 1280, message names the repeat
# Precision is the point: only the mutated route goes red, so the kill is
# evidence about THAT assertion rather than about the harness.
step "M8  /admin's default tab skips a level (H1 -> H3, no H2 between)" \
  "$TABKELOLA" \
  '[["<h2 class=\"text-red-400 font-bold text-lg\">","<h3 class=\"text-red-400 font-bold text-lg\">"],["{t('"'"'admin.tab_public_job'"'"')}</h2>","{t('"'"'admin.tab_public_job'"'"')}</h3>"]]'

step "M9  /master step 1 repeats a sibling heading's text at the same level" \
  "$MASTER" \
  '[["<h2 class=\"section-title mt-6\">{t(\"form.mf_kontak\")}</h2>","<h2 class=\"section-title mt-6\">{t(\"master.section_identitas\")}</h2>"]]'

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

# M11 covers the MAIN-LANDMARK rule added with the 2026-09-28 ARIA sweep. §26's
# skip-link check only asked whether `#main-content` EXISTS; it could not see a
# second `<main>` NESTED INSIDE it. Measured before the fix: /apply, /master,
# /share and /siswa-baru each rendered 2 main landmarks, the shell's own holding
# one inside. Every other check in the guard passed on those pages.
#
# This mutation restores exactly that defect on /share only, so exactly that
# route's two checks (390/1280) must go red while the other eight stay green —
# which is what distinguishes an assertion about the page from one that always
# fails. It rewrites BOTH tags: mutating only the opening tag would leave an
# unmatched close and break the JSX (the M8/M9 note above applies here too).
#
# ⚠ WHY THE PAIRS COME FROM A NODE BLOCK (and not inline JSON).
# The pair spans TWO lines, and the target is a `.tsx` — which `.gitattributes`
# does NOT pin to LF (only `*.mjs`, `*.cjs`, `*.sh` and `scripts/ci/pairs-*.json`
# are). With `core.autocrlf=true` a Windows checkout of ShareView.tsx is CRLF, so
# an anchor written with a literal `\n` misses every time. The `mut` helper
# asserts exactly one hit and ABORTS loudly on a miss, so this would never be a
# silent SURVIVED — but it would still break the battery on this machine, which
# is where it runs. The block therefore READS the file's own EOL and builds the
# anchor with it, so the mutation applies on LF and CRLF checkouts alike.
M11_FILE="$SHARE" M11_OUT=.tmp-headings-m11-pairs.json node -e '
const fs = require("fs");
const s = fs.readFileSync(process.env.M11_FILE, "utf8");
const NL = s.includes("\r\n") ? "\r\n" : "\n";
const OPEN_OLD = "      <div class=\"max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10\">";
const OPEN_NEW = "      <main class=\"max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10\">";
const CLOSE_OLD = "      </div>" + NL + NL + "      {/* Selection Bar */}";
const CLOSE_NEW = "      </main>" + NL + NL + "      {/* Selection Bar */}";
// Fail here rather than letting `mut` abort with a less specific reason: if the
// EOL trick is ever wrong this is the message that says so.
if (s.split(OPEN_OLD).length - 1 !== 1 || s.split(CLOSE_OLD).length - 1 !== 1) {
  console.error("M11 anchors do not match the file (EOL=" + JSON.stringify(NL) + ")");
  process.exit(3);
}
fs.writeFileSync(process.env.M11_OUT, JSON.stringify([[OPEN_OLD, OPEN_NEW], [CLOSE_OLD, CLOSE_NEW]]));
'
step "M11 /share regains its own <main> (nested/duplicate main landmark)" \
  "$SHARE" \
  "$(cat .tmp-headings-m11-pairs.json)"
rm -f .tmp-headings-m11-pairs.json

# ── byte-identical restore, and green again ────────────────────────────────
echo
for f in "$TOOLBAR" "$SHARE" "$SISWA" "$MASTER" "$ADMIN" "$TABAGENDA" "$TABKELOLA" "$CANDIDATE" "$PAGE_MASTER"; do
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
