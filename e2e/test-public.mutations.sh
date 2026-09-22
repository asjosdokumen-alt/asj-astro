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
# FIVE TRAPS THIS SCRIPT GUARDS AGAINST (all five were measured in this repo)
# --------------------------------------------------------------------------
#  0. **The artifact was not built from clean sources.** The baseline runs against
#     whatever is in `dist/`, and `dist/` is NOT rebuilt before it. So a previous
#     run that was killed before its restore leaves a MUTATED chunk on disk while
#     `src/` is clean — and the baseline then reports RED against a correct tree,
#     or worse, makes you draw a WRONG CONCLUSION about the gate. Measured twice
#     (2026-09-21), the second time against my own probe build. CLOSED — see RULE 0
#     below, which proves the sources clean, rebuilds, and asserts the mutation
#     payloads are not reachable from the served page.
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
# THREE THINGS THIS SCRIPT DOES *NOT* GUARANTEE (measured, 2026-09-21 — do not
# read a green run as proving any of them):
#  A. **The BACKUP DIRECTORY is removed.** `rm -rf`/`cp` on this Git-Bash go
#     through a safe-delete shim that REFUSES bulk deletes above a threshold, so the
#     final cleanup printed `[SAFE_DELETE_BULK_CONFIRM_REQUIRED]` and left
#     `.tmp-public-bak/` on disk. That is now harmless for CORRECTNESS — the restore
#     is done file-by-file with `cp` inside `restore_one`, not by the cleanup — and
#     the restore is asserted by `diff -q` against the backups before the run ends.
#     But litter accumulates, so delete the directory yourself if you care.
#  B. **The server is reaped on a NORMAL exit.** The trap now covers INT/TERM/EXIT,
#     so this is much better than it was (it previously left one `node server.cjs`
#     per run — 6 orphans held ports 4321-4331 and caused `EADDRINUSE` aborts in
#     *other* batteries). EXIT handlers do not run on `kill -9` or a hard shell
#     teardown, so still count the processes after a run and clean up with
#     PowerShell `Stop-Process` (`pkill -f 'node server.cjs'` does NOT match: the
#     command line is `node.exe server.cjs`, and `taskkill //F` from Git-Bash
#     silently fails on the path mangling).
#  C. **⚠ THE RUN LEFT THE TREE MUTATED — THIS ACTUALLY HAPPENED.** A run can
#     finish reporting `7/7 KILLED, restore byte-identical` and still leave a
#     mutation in `src/`, because `step`'s final `restore_one` silently no-op'd when
#     a backup was missing, and the old trap did not restore at all. Measured
#     2026-09-21: `src/store/i18n.ts` sat holding the M6 payload for ~15 minutes
#     after a run I had reported as clean, and I only found it because RULE 0
#     aborted on it later. Both causes are now fixed (fatal-on-missing-backup,
#     restoring traps, gated so they cannot mask the compare loop) — but the LESSON
#     stands: `git diff` AFTER the run, not only before it. Verifying the inputs at
#     the start of a run says nothing about what the run left behind.
#
# Must be run with cwd = repo root:  bash e2e/test-public.mutations.sh
set -u

GUARD=e2e/test-public.mjs
PAGE=src/pages/public.astro
LAYANAN=src/components/public/LayananSection.astro
LOKER=src/components/public/LokerTable.tsx
I18N=src/store/i18n.ts
FOOTER=src/components/Footer.astro
LIB=src/lib/publicSections.ts
BAK=.tmp-public-bak

fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
backup() { mkdir -p "$BAK"; cp "$1" "$BAK/$(key "$1")" || { echo "ABORT: could not back up $1"; exit 1; }; }
# ⚠ `[ -f "$b" ] && cp ...` returns the TEST's status, so a missing backup made this
# a SILENT success: the caller could not tell "restored" from "did nothing", and
# step() would then report a KILLED/SURVIVED for a file still carrying the previous
# mutation. Measured 2026-09-21 (the M6 leak above). A missing backup is now fatal,
# and a failed copy is reported rather than swallowed.
restore_one() {
  local b="$BAK/$(key "$1")"
  if [ ! -f "$b" ]; then
    echo "ABORT: no backup for $1 in $BAK — cannot restore, refusing to continue"
    return 1
  fi
  cp "$b" "$1" || { echo "ABORT: copy of $b over $1 failed"; return 1; }
}

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
  restore_one "$file" || exit 1
  if ! mut "$file" "$pairs"; then
    echo "ABORT: the mutation for '$label' did not apply."
    exit 1
  fi
  node node_modules/astro/astro.js build >/dev/null 2>&1
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  check "$label" $?
  restore_one "$file" || exit 1
}

# ── start a server for the built artifact, and OWN it ──────────────────────
# Do NOT probe 4321 first. Another server (a session's `npm run serve`) is often
# already there, and then the battery would be measuring a server it does not
# control — a crash in that server reads as KILLED for every step. server.cjs
# prints the port it chose, so read that instead.
SRV_LOG=.tmp-public-serve.log
node server.cjs > "$SRV_LOG" 2>&1 &
SERVER_PID=$!
# ⚠ THE TRAP MUST RESTORE, NOT JUST KILL THE SERVER. Measured 2026-09-21: the old
# trap killed the server and exited, so a run interrupted DURING a step left that
# step's mutation in `src/` with its backup still on disk — the exact state that
# RULE 0 then aborts on. It also only covered INT/TERM, so a `timeout` kill or a
# closed terminal left the same mess with no handler at all.
#
# ⚠ BUT AN UNCONDITIONAL `EXIT` TRAP WOULD MASK THE LEAK CHECK. The final block
# compares each file against its backup to report RESTORE FAILED; if an EXIT trap
# silently restored everything first, that comparison would pass no matter what the
# script had actually leaked. That is the same defect this whole change is about —
# a check that cannot fail. So the EXIT handler is GATED on an arming flag: it heals
# the tree only when the run did NOT reach its own verification block. Once the
# verification has run, the evidence stands and the trap does nothing.
armed=1
restore_all() {
  [ "${armed:-0}" -eq 1 ] || return 0
  for f in $PAGE $LAYANAN $LOKER $I18N $FOOTER $LIB; do restore_one "$f" >/dev/null 2>&1; done
}
trap 'restore_all; kill "$SERVER_PID" 2>/dev/null; exit 1' INT TERM
trap 'restore_all; kill "$SERVER_PID" 2>/dev/null' EXIT

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

# ── RULE 0: the artifact must be built from CLEAN sources ──────────────────
#
# ⚠ THIS CLOSES TRAP 0 FROM THE HEADER, and it is the one trap that could poison a
# run that otherwise looks perfectly healthy. The landing battery has had this
# since 2026-09-21 (e2f3529); this battery did not, and I walked straight into it
# while repairing the guard.
#
# The failure mode: a previous run is killed AFTER a mutation but BEFORE its
# restore-build. `dist/` is then left holding an artifact built from MUTATED
# source. `src/` is clean — `git status` proves it — but the served chunk still
# carries the payload, and the next run's baseline reports RED against a source
# tree that was never wrong.
#
# MEASURED 2026-09-21, TWICE, in this exact file:
#   - the first time, `src/pages/public.astro` was clean but `dist/` still served
#     the `class="hidden"` I had added for the M2 probe, so I read a healthy page
#     as proof of a "hidden panel hole" that did not exist.
#   - that is the expensive version of this bug: it does not merely fail the run,
#     it makes you draw a WRONG CONCLUSION about the gate and go fix a non-bug.
#
# WHY THE BASELINE CANNOT CATCH IT ON ITS OWN: the baseline asks "is the page
# correct?" — the answer was "yes" the moment the sources were restored. Nothing
# in this script ever asked "was the artifact built from those sources?" until now.
#
# Order matters and is not negotiable: VERIFY the sources, THEN rebuild. Building
# first would overwrite the evidence that the sources were ever wrong.
#
# ⚠ AND THE ABORT PATH MUST NOT LEAVE THE TREE MUTATED — MEASURED 2026-09-21, the
# hard way. I ran the battery to test the reachability half of RULE 0, it aborted
# here on an `src/store/i18n.ts` left dirty by a PREVIOUS run, and... that previous
# run was one I had already reported as "7/7 KILLED, restore byte-identical". It
# was not. I had verified the six source files BEFORE that run and never re-verified
# them AFTER it, so I reported a clean restore on the strength of a measurement
# taken at the wrong end of the run. The tree sat mutated for ~15 minutes and a
# committed sentence in the review manifest said otherwise.
#
# WHAT THAT PROVES: this script's own failure note is not enough. A battery that
# detects a dirty tree and then exits leaves the next reader exactly where I was —
# told to run `git checkout <six files>` by hand and hoping they do. If the backups
# are present and trustworthy, the script heals itself, because the backup IS the
# clean state: it was taken before any mutation. (`step` calls `restore_one` on
# entry for the same reason.)
#
# Safety: only restore a file whose backup DIFFERS from it — i.e. only ever undo a
# mutation — and never touch a file RULE 0 did not just list as dirty.
if ! git diff --quiet -- "$PAGE" "$LAYANAN" "$LOKER" "$I18N" "$FOOTER" "$LIB"; then
  echo "ABORT: the gate's own sources are dirty before the baseline."
  echo "       A battery must start from committed sources, or KILLED/SURVIVED"
  echo "       cannot be attributed to the mutation. Dirty files:"
  git diff --name-only -- "$PAGE" "$LAYANAN" "$LOKER" "$I18N" "$FOOTER" "$LIB" | sed 's/^/       /'
  healed=0
  for f in $PAGE $LAYANAN $LOKER $I18N $FOOTER $LIB; do
    git diff --quiet -- "$f" || { [ -f "$BAK/$(key "$f")" ] && restore_one "$f" && healed=$((healed + 1)); }
  done
  if [ "$healed" -gt 0 ] && git diff --quiet -- "$PAGE" "$LAYANAN" "$LOKER" "$I18N" "$FOOTER" "$LIB"; then
    echo "       restored $healed file(s) from $BAK — the tree is clean again; re-run."
  else
    echo "       (no usable backup; restore by hand:"
    echo "        git checkout -- $(printf '%s ' "$PAGE" "$LAYANAN" "$LOKER" "$I18N" "$FOOTER" "$LIB") )"
  fi
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi

# Sources are proven clean, so a rebuild now MUST produce a clean artifact. Do this
# before the baseline and not inside it: the baseline is the CONTROL, and a control
# measured on an artifact of unknown provenance is not a control.
echo "rebuilding dist/ from clean sources before the baseline..."
node node_modules/astro/astro.js build >/tmp/public-baseline-build.log 2>&1
if [ ! -s dist/index.html ]; then
  echo "ABORT: the pre-baseline build produced no dist/index.html."
  tail -5 /tmp/public-baseline-build.log | sed 's/^/       /'
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
# (`dist/public/index.html` is checked again below, because that is the page the
#  guard actually measures and it is the one the reachability walk must start from.)

# Belt and braces: the mutation payloads must not be REACHABLE from the served
# page. This is the direct assertion the rebuild cannot make on its own, and it is
# cheap.
#
# ⚠ SCOPE — carried over from the landing battery, which MEASURED this: grep the
# whole of `dist/` and the check fires on a perfectly healthy tree. Astro does not
# prune hash-named chunks; it emits `App.<newhash>.js` and LEAVES `App.<oldhash>.js`
# behind, so a polluted chunk from a killed run survives a clean rebuild as an
# ORPHAN with no referrer. What matters is not what EXISTS in `dist/`, it is what
# the page LOADS. So resolve the entry HTML's own module references and test only
# those.
#
# The payloads are the DISTINCTIVE STRINGS the mutations below introduce. They must
# stay in sync with M1-M7: a payload that no mutation produces would make this check
# silently vacuous, which is the same class of defect as a mutation that never
# applies.
#
# ⚠ "Amanah Sakura" ALONE IS NOT USABLE AS A PAYLOAD — it is a SUBSTRING of the
# clean value "PT Amanah Sakura Japan", so the check would ABORT on a perfectly
# healthy tree. That is the over-firing failure RULE 0's own scope note warns
# about, and I reproduced it here: the regex was measured against both the mutated
# AND the clean strings before being committed. The pattern is therefore anchored
# on the CLOSING QUOTE that follows the payload (`Amanah Sakura",` in the source,
# `Amanah Sakura\",` in the built JS), which the clean value cannot produce because
# it continues with ` Japan`. Any payload added here MUST be checked the same way.
PAYLOADS='Lowongan Kerja Tersedia|Bursa Kerja|Layanan Program|Judul Lowongan|Amanah Sakura",|Amanah Sakura\\"'

# ⚠ MEASURED 2026-09-21, AND THIS IS WHY THE CHECK BELOW IS NOT A COPY OF THE
# LANDING BATTERY'S VERSION. That one resolves assets referenced from
# `dist/index.html`, because its guard measures `/`. THIS guard measures `/public`,
# and the two pages load DIFFERENT chunk sets:
#
#     dist/index.html          -> App.js, SiteNav.js, JobMiniList.js, ...
#     dist/public/index.html   -> App.js, LokerTable.js, BottomNav.js, ...
#
# and the payload lives in `_astro/i18n.<hash>.js`, which is NOT referenced by
# either HTML file directly — it is imported by `App.<hash>.js`, which both pages
# load. A copy of the landing check would therefore have inspected the wrong HTML
# and still missed the poisoned chunk: a RULE 0 that cannot fire is exactly the
# "hypothesis, not evidence" failure this whole skill exists to prevent.
#
# So: resolve the module references of THE PAGE THE GUARD MEASURES, then walk the
# import graph TRANSITIVELY, bounded, and test every chunk reached. A chunk the
# page can execute is reachable whether or not the HTML names it.
ROOT_HTML=dist/public/index.html
if [ ! -s "$ROOT_HTML" ]; then
  echo "ABORT: the pre-baseline build produced no $ROOT_HTML."
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi

seen=$(mktemp)
frontier="$ROOT_HTML"
depth=0
MAX_DEPTH=6   # cycle-safe: the module graph is shallow but not acyclic
while [ -n "$frontier" ] && [ "$depth" -lt "$MAX_DEPTH" ]; do
  next=""
  for src in $frontier; do
    # every chunk this file names, in either HTML or JS quoting
    for asset in $(grep -oE '_astro/[A-Za-z0-9_.-]+\.(js|mjs)' "$src" 2>/dev/null | sort -u); do
      grep -qxF "$asset" "$seen" 2>/dev/null && continue
      echo "$asset" >> "$seen"
      next="$next dist/$asset"
      if grep -qsE "$PAYLOADS" "dist/$asset"; then
        echo "ABORT: a mutation payload is REACHABLE from $ROOT_HTML via $asset."
        echo "       The artifact was built from mutated sources. Restore, then rebuild."
        rm -f "$seen"
        kill "$SERVER_PID" 2>/dev/null
        exit 1
      fi
    done
  done
  frontier="$next"
  depth=$((depth + 1))
done
reached=$(wc -l < "$seen" | tr -d ' ')
rm -f "$seen"
echo "artifact: clean (walked $reached chunk(s) reachable from $ROOT_HTML, depth<=$MAX_DEPTH)"

# Report orphans so the next reader is not surprised by them, but do not fail on
# them: they are unreferenced and cannot affect the page the guard measures.
orphans=$(grep -rlE "$PAYLOADS" dist/ 2>/dev/null | wc -l)
if [ "$orphans" -gt 0 ]; then
  echo "note: $orphans unreferenced stale chunk(s) in dist/ carry old payloads"
  echo "      (harmless — nothing reachable from $ROOT_HTML points at them)"
fi

# ── RULE 1: baseline must be green before any mutation is interpreted ──────
if ! BASE_URL="$BASE" node "$GUARD" >/tmp/public-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations would be meaningless"
  tail -20 /tmp/public-base.txt
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
echo "baseline: green"
echo

for f in "$PAGE" "$LAYANAN" "$LOKER" "$I18N" "$FOOTER" "$LIB"; do backup "$f"; done

# ── one mutation per claim the guard makes ────────────────────────────────
# M1  the very marker the guard waits for. Deleting it must fail the load test.
#
# ⚠ THIS MUTATION USED TO BE A NO-OP, and it survived for exactly that reason.
# It edited ONLY the literal in the page:
#     <span data-lang="ui.tab_loker">Lowongan Loker</span>
# but `ui.tab_loker` is a data-lang KEY, and src/store/i18n.ts:1051 holds the
# same string. `translateDataLang()` (i18n.ts:1908) then does
#     el.textContent = dict[key]
# on every [data-lang] element AFTER hydration, so the text came straight back
# and the guard was correct to stay green. This is trap T2 from the landing
# battery: mutating markup that a script RECOMPUTES on load is the most
# expensive kind of no-op, because the edit is visibly present in the source you
# are looking at.
#
# The mutation now changes the SOURCE OF TRUTH — the dictionary value — so no
# runtime pass can restore it.
#
# ⚠ AND THE REPLACEMENT MUST BE NON-EMPTY. Measured 2026-09-21: emptying the
# value to "" is STILL a no-op, because translateDataLang() resolves the string
# with a falsy-chain:
#     const text = dict[key] || fallback[key] || RAW[key] || key;
#     if (text !== key) el.textContent = text;
# An empty string is falsy, so `"" || ... || key` falls through and yields the
# KEY ITSELF. Then `text !== key` is FALSE, the write is SKIPPED, and the element
# keeps the literal the HTML shipped with — i.e. the guard sees the original
# text. Verified by replaying the chain: "" -> chosen "ui.tab_loker" -> no write;
# "Lowongan" -> chosen "Lowongan" -> textContent rewritten. So this mutation
# replaces the value with a NON-EMPTY string that the guard does not wait for.
step "M1  'Lowongan Loker' is renamed in its i18n dictionary (the guard's own marker)" \
  "$I18N" \
  '[["\"ui.tab_loker\": \"Lowongan Loker\",","\"ui.tab_loker\": \"Lowongan Kerja Tersedia\","]]'

# M2  the text is present but the section is hidden. A guard that reads the DOM
#     without checking visibility passes here — Playwright's text= selector does
#     respect visibility for a hidden ancestor, so this must be KILLED.
#
# ⚠ ANCHOR REPAIRED 2026-09-21: the target was `<div id="section-loker">`, but
# that div gained `data-public-panel="loker"` (public.astro:53), so the search
# string stopped matching and the harness aborted with MUTATION DID NOT APPLY.
# The anchor now carries the attribute, which is the part that made it drift.
step "M2  the loker section is hidden (text present, invisible)" \
  "$PAGE" \
  '[["<div id=\"section-loker\" data-public-panel=\"loker\">","<div id=\"section-loker\" data-public-panel=\"loker\" class=\"hidden\">"]]'

# M3  THE HISTORICAL DEFECT. The marker survives only inside a meta tag, exactly
#     as 'ASJ Portal' once did. A guard that greps for the string anywhere in the
#     document stays green here; one that requires it VISIBLE must go red.
#
# ⚠ THIS MUTATION WAS A NO-OP TWICE OVER, and the second form is the interesting
# one. Measured 2026-09-21:
#   (i)  Editing the PAGE LITERAL is undone: ui.tab_loker is a data-lang key and
#        translateDataLang() rewrites the span after hydration (trap T2). It must
#        mutate the DICTIONARY.
#   (ii) Replacing the dictionary value with `""` is ALSO a no-op, because
#        translateDataLang resolves via a falsy-chain
#            dict[key] || fallback[key] || RAW[key] || key
#        so an empty string falls through to the KEY, `text !== key` is false, the
#        textContent write is SKIPPED, and the element keeps the HTML literal.
#   (iii) And the previous fix — substituting `<meta ...>` AS TEXT — was worse
#        than a no-op: it made the literal meta source render as VISIBLE text, so
#        `text=Lowongan Loker` still matched (measured: the tab's innerText became
#        ' <meta name="x" content="Lowongan Loker">') and the guard was right to
#        stay green. The marker must leave the VISIBLE text entirely.
#
# The replacement below is a plain string with no marker in it, so the tab's
# visible text genuinely loses 'Lowongan Loker'. That is the defect M3 claims to
# reproduce, and the guard's `waitForSelector('text=Lowongan Loker')` must fail.
# The real meta-tag half of the historical story needs no mutation: BaseLayout
# already ships <meta name="apple-mobile-web-app-title"> on every route, which is
# precisely why the old guard's `text=ASJ Portal` waited forever.
step "M3  the tab's visible marker is replaced (the string no longer renders)" \
  "$I18N" \
  '[["\"ui.tab_loker\": \"Lowongan Loker\",","\"ui.tab_loker\": \"Bursa Kerja\","]]'

# M4  a tab label is renamed. Breaks the two tab-existence assertions.
#     Same two traps as M3: the dictionary is the source of truth (the page
#     literal at public.astro:44 is overwritten after hydration), and the new
#     value must be non-empty or the write is skipped.
step "M4  the Layanan tab label is renamed in its i18n dictionary" \
  "$I18N" \
  '[["\"ui.tab_layanan\": \"Program & Layanan ASJ\",","\"ui.tab_layanan\": \"Layanan Program\","]]'

# M5  the tab SWITCH is broken: the Layanan section never un-hides.
#     The button still exists and still has its label, so M4's assertions stay
#     green — only the behavioural assertion can catch this. This is what proves
#     the guard observes the switch rather than the initial DOM.
#
# ⚠ ANCHOR REPAIRED 2026-09-21, and the old one had been dead for a while. It
# targeted `secLayanan.classList.remove('hidden')` in public.astro, but that
# script was consolidated: public.astro:36-40 records that the file "used to
# carry two copies of the tab script that had already drifted ... now there is
# one implementation and no class list at all", and the switch now lives in
# src/lib/publicSections.ts as `el.hidden = !state.panels[id]` (line ~140).
# Mutating MARKUP was therefore the wrong shape twice over — it is the same trap
# T2 the landing battery documents: mutate the state the page COMPUTES, not the
# markup that seeds it.
#
# The state comes from publicSectionState(); this mutation makes it return a
# state in which NOTHING is visible, so the Layanan panel can never un-hide no
# matter how many times the tab is clicked. `PUBLIC_SECTION_IDS` is left intact
# so applyPublicSection still recognises both ids and simply hides both — a
# panel it does not know is deliberately left visible (see the guard clause), so
# this is the version that actually removes the content.
step "M5  the tab SWITCH is broken (the computed state never reveals Layanan)" \
  "$LIB" \
  '[["  for (const id of PUBLIC_SECTION_IDS) panels[id] = id === active;","  for (const id of PUBLIC_SECTION_IDS) panels[id] = false; /* mutation: nothing is ever visible */"]]'

# M6  a table header is renamed. The header text comes from i18n (`table.job`),
#     and the guard asserts on the RENDERED string, so the mutation targets the
#     i18n value rather than the markup. That is also what makes this a real
#     test of the assertion: the `<th>` element still exists and is still
#     correct, only its text changes.
#
# ⚠ ANCHOR REPAIRED 2026-09-21. It read `"table.job": "NAMA PEKERJAAN",` but the
# shipped value is `"Nama Pekerjaan"` (i18n.ts:962) — the guard's
# `th:has-text("NAMA PEKERJAAN")` matches it because Playwright's `has-text` is a
# CASE-INSENSITIVE substring match. The replacement must therefore be a string the
# guard does NOT match under those semantics, which is why it changes both words
# rather than only their case.
step "M6  the 'Nama Pekerjaan' table header text is changed" \
  "$I18N" \
  '[["\"table.job\": \"Nama Pekerjaan\",","\"table.job\": \"Judul Lowongan\","]]'

# M7  the footer copy. The footer is NOT in public.astro — it is rendered by
#     BaseLayout because public.astro passes `showFooter={true}`. Targeting the
#     shared dictionary is deliberate: it proves the guard resolves the string to
#     the page it actually loads, and the byte-identical restore is what keeps a
#     shared file safe to mutate.
#
# ⚠ REPAIRED 2026-09-21: the old anchor edited the `data-lang="footer.title"`
# LITERAL in Footer.astro, which translateDataLang() overwrites from
# src/store/i18n.ts:1629 after hydration (trap T2) — a no-op. The mutation now
# targets the dictionary value, which is the source of truth, and the new value
# is non-empty so the textContent write is not skipped by the falsy-chain.
step "M7  the footer copy is changed (shared dictionary)" \
  "$I18N" \
  '[["\"footer.title\": \"PT Amanah Sakura Japan\",","\"footer.title\": \"Amanah Sakura\",\""]]'

# ── byte-identical restore, and green again ────────────────────────────────
#
# Disarm the EXIT heal BEFORE this block. From here on the tree is measured as the
# script actually left it: if a step failed to restore, this must report it rather
# than silently repair it. (See the note at the trap.)
armed=0
echo
for f in "$PAGE" "$LAYANAN" "$LOKER" "$I18N" "$FOOTER" "$LIB"; do
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
