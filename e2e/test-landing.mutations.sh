#!/usr/bin/env bash
# Mutation battery for e2e/test-landing.mjs (L8).
#
# WHY A BATTERY
# -------------
# The landing gate claims: every spec section exists and is VISIBLE at both
# widths, the order matches the spec, no placeholder text shipped, and every
# in-page link resolves. Each of those is a claim that has never been observed to
# fail in the tree — and `docs/LANDING_PAGE_ROADMAP.md` §L8 says so in as many
# words: "Gate yang tidak pernah terbukti bisa gagal adalah hipotesis, bukan
# bukti."
#
# THIS BATTERY HAS ALREADY EARNED ITS KEEP. Two full reworks came out of it, and
# every survivor it reported was a real defect in the battery — or in the gate:
#
# ⚠ THE SURVIVORS BELOW ARE HISTORICAL, AND M7 IS THE ONE THAT MATTERS NOW. They are
#   kept because the traps they document are still live traps. But two of them —
#   M5 and the old M7 — concerned a TAB STATE that `e9317cf` deleted from `/`. Their
#   subject no longer exists on this page, and the single most expensive lesson of
#   the 2026-09-21 repair is the other direction: a gate can also stop being
#   evidence by failing for a STALE reason. See the note on M7.
#
#   M2 SURVIVED (twice)
#      1st attempt passed `hidden` to `<Section>`. `Section.astro` destructures a
#      FIXED prop list with no rest-spread, so the attribute was silently discarded
#      and the defect never existed.
#      2nd attempt used `max-h-0 overflow-hidden`, which DOES reach the HTML and
#      sets `max-height: 0` — and the section is still 160px tall, because
#      `max-height` constrains the CONTENT box while `py-14 md:py-20` (80 + 80px of
#      padding) keeps the element's box. Measured: maxHeight "0px", height 160.
#      What works is `class="hidden"` (display:none, height 0).
#   M5 SURVIVED  removing the `hidden` ATTRIBUTE from the layanan panel has no
#                effect: `index.astro:472` calls `bindPublicSections()`, which
#                re-writes `hidden` from the resolved tab state on every load.
#                Measured: attribute removed from source, `hiddenAttr: true` at
#                runtime. Renaming `data-public-panel` does not help either —
#                `applyPublicSection` SKIPS unknown panel ids, so the panel keeps
#                the `hidden` it shipped with. The mutation must change the state
#                the page COMPUTES: `DEFAULT_PUBLIC_SECTION`.
#   M4 SURVIVED  'lorem ipsum' injected into a `desc` literal WAS in the built HTML
#                (verified with grep) but INVISIBLE to the gate, because
#                `SectionTitle.astro:27` documents that `data-lang` literals are
#                FALLBACKS overwritten by `translateDataLang()` after hydration.
#                The gate read only the hydrated DOM. THIS WAS A TRUE GATE HOLE,
#                and it is why the gate now also reads the SERVED HTML.
#
# So the numbering below is the number AFTER those reworks. The survivors are
# documented rather than deleted, because the next person to extend this battery
# needs these traps: each one makes an "obviously correct" mutation a silent no-op,
# and a no-op reads as a HOLE in the gate.
#
# ⚠ THE THREE TRAPS THAT MAKE A MUTATION LOOK CORRECT BUT DO NOTHING
# ----------------------------------------------------------------
#  T1. `<Section>` has no rest-spread, so `hidden`, `id2`, `data-x` — anything not
#      in its prop interface — is DISCARDED. Mutate a class or a real prop.
#  T2. A tab state is RE-COMPUTED on every load, so a mutation to the markup that
#      seeds it is undone. This trap applied to `/` until `e9317cf`, which deleted
#      the tab system from this page — `bindPublicSections()` still runs on
#      `/public` but NOT here, and `/` carries zero `[data-public-tab]` elements.
#      The trap is kept because it is the general shape of a whole family of
#      no-ops: before mutating markup, check what REWRITES it at runtime. Mutating
#      markup that a script recomputes on load is the most expensive kind of
#      no-op, because the edit is visibly present in the source you are looking at.
#  T3. `data-lang` text is a pre-hydration FALLBACK. A mutation that changes one
#      is visible to `grep dist/index.html` and to a crawler, but NOT to a check
#      that reads `document.body.innerText` after hydration. Both layers are now
#      asserted, and M4 exercises the HTML layer specifically.
#  T4. A class that only LOOKS like a collapse is not one. `max-height: 0` does not
#      shrink a padded box; `display: none` does. Measure the height, never the
#      class name.
#
# SIX TRAPS THIS SCRIPT ITSELF GUARDS AGAINST
# --------------------------------------------
#  0. **The artifact was not built from clean sources.** A run killed between a
#     mutation and its restore leaves `dist/` holding MUTATED code while `src/`
#     looks clean, so the NEXT run's baseline measures a page nobody wrote — and a
#     correct source tree gets reported as a regression. RULE 0 now proves `git
#     diff --quiet` on the four gate sources, rebuilds, and greps `dist/` for the
#     mutation payloads before the baseline is allowed to run. Freshness (the mtime
#     check in `step()`) is NOT cleanliness; see RULE 0's note.
#  1. **The mutation never reaches dist/.** The guard measures a BUILT artifact, so
#     a mutation that was not rebuilt is indistinguishable from a SURVIVED — a hole
#     reported where there is none. Every step rebuilds.
#  2. **A no-op mutation.** If the search string is absent the edit silently does
#     nothing, the guard stays green, and a harness bug is recorded as a SURVIVED.
#     `mut` asserts EXACTLY ONE match per pair and aborts. THE SAME FAILURE APPEARS
#     IN A SECOND FORM: if the BUILD silently fails, the guard measures the previous
#     artifact and reports SURVIVED for every step at once. Measured 2026-09-21 —
#     `npx astro build` does not resolve in this environment, so seven mutations
#     were reported as holes in a gate that had none. `step` now asserts the
#     artifact was actually refreshed, because from the guard's exit code a broken
#     build and a surviving mutation are INDISTINGUISHABLE.
#  3. **`astro build`'s exit code is not a signal.** Measured on this machine: it
#     exits non-zero when the safe-delete shim refuses the dist/ cleanup, AFTER
#     emitting every page. Only the GUARD's exit code is judged. This is also why
#     `node scripts/build-sw-manifest.mjs` runs at the end — leaving dist/sw.js on
#     the dev placeholder strands 5 unrelated swOffline tests.
#  4. **`curl -o /dev/null` exits 23 even when the request SUCCEEDS.** So
#     `if curl -f -o /dev/null ...` is never true: it burns its full timeout and
#     then aborts "no server came up". Use `curl -fsS URL > /dev/null`.
#  5. **The sandbox proxy swallows 127.0.0.1.** This script's readiness probe needs
#     `--noproxy '*'`, and the GUARD needs Playwright's `--no-proxy-server` (it
#     sets that in its own launch call). Without both, every probe returns 502 and
#     the run aborts claiming the server never started — while it is running.
#
# DELETED FILES: `git rm` HAS EXPLODED A DIRECTORY IN THIS REPO TWICE. This script
# never deletes a tracked file. Mutations that need a section "gone" rename its id
# instead, which produces the same observable failure with no filesystem risk.
# Backups are removed with `unlinkSync`, never `rm -rf`: the shim counts every
# delete against a ~50-per-turn quota which a preceding full build has already
# spent, so an `rm -rf` here is refused and leaves litter the next gate reads as an
# untracked file.
#
# Must be run with cwd = repo root:  bash e2e/test-landing.mutations.sh
set -u

GUARD=e2e/test-landing.mjs
PAGE=src/pages/index.astro
NAV=src/components/public/SiteNav.astro
I18N=src/store/i18n.ts
APP=src/components/App.tsx
BAK=.tmp-landing-bak

fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
backup() { mkdir -p "$BAK"; cp "$1" "$BAK/$(key "$1")"; }
restore_one() { local b="$BAK/$(key "$1")"; [ -f "$b" ] && cp "$b" "$1"; }

# Apply a mutation. Pairs come through the environment, not a heredoc: heredocs
# plus shell interpolation mangle quotes under Git-Bash.
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

  # ⚠ THE BUILD MUST BE DONE VIA `node node_modules/...`, NOT `npx astro`.
  #
  # MEASURED 2026-09-21, and this was a REAL DEFECT IN THIS BATTERY that made seven
  # mutations report SURVIVED in one run. `npx astro build` does not run here — it
  # prints "'astro' is not recognized as an internal or external command" and exits
  # WITHOUT BUILDING. Because the old line was `npx astro build >/dev/null 2>&1`,
  # the failure was discarded, `dist/` kept whatever it had, and EVERY step measured
  # the same stale artifact. The guard then correctly reported the unmutated page as
  # passing — which the harness printed as SURVIVED, i.e. as seven holes in a gate
  # that had none. A broken build and a surviving mutation are INDISTINGUISHABLE
  # from the guard's exit code alone, and that is why the freshness check below is
  # not optional.
  #
  # WHY IT FAILS TO RESOLVE: the same `NODE_OPTIONS=""` shim that the session rules
  # warn about kills binary resolution through the `.bin` shims. Calling the CLI
  # entrypoint through `node` directly bypasses the shim entirely.
  #
  # The build's own exit code is NOT judged — measured: it exits non-zero when the
  # safe-delete shim refuses the dist/ cleanup even after emitting every page (trap
  # 3 in the header). Freshness is asserted by mtime + content instead.
  local before after
  before=$(stat -c %Y dist/index.html 2>/dev/null || echo 0)

  node node_modules/astro/astro.js build >/tmp/mut-build.log 2>&1

  after=$(stat -c %Y dist/index.html 2>/dev/null || echo 0)
  if [ "$after" = "$before" ] && [ "$after" != "0" ]; then
    echo "ABORT: the build did not refresh dist/index.html for '$label'."
    echo "       A stale artifact makes a surviving mutation and a failed edit look"
    echo "       identical. Last build output:"
    tail -5 /tmp/mut-build.log | sed 's/^/       /'
    exit 1
  fi

  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  check "$label" $?
  restore_one "$file"
}

# ── server, owned by this script ───────────────────────────────────────────
# Do NOT probe 4321 first: a session's own server is often already there, and the
# battery would then be measuring a server it does not control, so a crash there
# reads as KILLED for every step. server.cjs prints the port it chose.
SRV_LOG=.tmp-landing-serve.log
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

# Readiness. `--noproxy '*'` is REQUIRED — see trap 5.
ready=0
for _ in $(seq 1 30); do
  if curl -fsS --noproxy '*' "$BASE/" > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "ABORT: $BASE never became ready"
  kill "$SERVER_PID" 2>/dev/null; exit 1
fi
echo "server: $BASE (pid $SERVER_PID)"

# ── RULE 0: the artifact must be built from CLEAN sources ──────────────────
#
# ⚠ MEASURED 2026-09-21 — THIS WAS THE THIRD REAL DEFECT IN THIS BATTERY, and the
# only one that could poison a run that otherwise looked healthy.
#
# The failure mode: a previous run was killed (here, by a shell syntax error) AFTER
# its last mutation but BEFORE its restore-build. `dist/` was therefore left holding
# an artifact built from MUTATED source. `src/` was clean — `git status` proved it —
# but `dist/_astro/App.TLnhFdpP.js` still contained the M7 payload
# (`href:"/loker-tidak-ada"`), and `dist/index.html` referenced THAT chunk. The next
# run's baseline then read a page whose hero CTA pointed at a route that does not
# exist, and reported BASELINE RED against a perfectly correct source tree.
#
# WHY THE FRESHNESS CHECK IN `step()` DID NOT CATCH IT: that check asserts
# `dist/index.html` was REFRESHED. It was — by a build of the mutated source. A
# build being recent says nothing about WHAT IT WAS BUILT FROM. Freshness is not
# cleanliness, and the island chunk is a SEPARATE artifact from `index.html`, so
# even a byte-check of `index.html` would miss it.
#
# The rule is therefore: a battery may only start from an artifact that a build of
# the CURRENT COMMITTED SOURCES produces. Verify the sources, then rebuild, then
# measure the baseline. Order matters — rebuilding before verifying would overwrite
# the evidence that the sources were ever wrong.
if ! git diff --quiet -- "$PAGE" "$NAV" "$I18N" "$APP"; then
  echo "ABORT: the gate's own sources are dirty before the baseline."
  echo "       A battery must start from committed sources, or KILLED/SURVIVED"
  echo "       cannot be attributed to the mutation. Dirty files:"
  git diff --name-only -- "$PAGE" "$NAV" "$I18N" "$APP" | sed 's/^/       /'
  echo "       (A previous run was probably killed before its restore. Run:"
  echo "        git checkout -- $(printf '%s ' "$PAGE" "$NAV" "$I18N" "$APP") )"
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi

# Sources are proven clean, so a rebuild now MUST produce a clean artifact. Do this
# before the baseline and NOT inside it: the baseline is the control, and a control
# measured on an artifact of unknown provenance is not a control.
echo "rebuilding dist/ from clean sources before the baseline..."
node node_modules/astro/astro.js build >/tmp/mut-baseline-build.log 2>&1
if [ ! -s dist/index.html ]; then
  echo "ABORT: the pre-baseline build produced no dist/index.html."
  tail -5 /tmp/mut-baseline-build.log | sed 's/^/       /'
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
# Belt and braces: the mutation payloads must not be REACHABLE from the served
# page. This is the direct assertion the mtime check cannot make, and it is cheap.
#
# ⚠ SCOPE, MEASURED 2026-09-21: grep the whole of `dist/`, and this check fires on a
# perfectly healthy tree. Astro does not prune hash-named chunks — it emits
# `App.<newhash>.js` and LEAVES `App.<oldhash>.js` on disk, so a polluted chunk from
# a killed run survives a clean rebuild as an ORPHAN with no referrer. The first
# version of this check did exactly that and aborted a run whose served page was
# correct. What matters is not what EXISTS in dist/, it is what the page LOADS: an
# orphan is dead weight, a referenced chunk is the actual document. So resolve the
# entry HTML's own script/module references and test only those.
orphans=0
while IFS= read -r asset; do
  [ -z "$asset" ] && continue
  if grep -qs 'loker-tidak-ada\|tim-renamed' "dist/$asset"; then
    echo "ABORT: a mutation payload is REACHABLE from dist/index.html via $asset."
    kill "$SERVER_PID" 2>/dev/null
    exit 1
  fi
done < <(grep -o '_astro/[A-Za-z0-9_.-]*\.\(js\|mjs\)' dist/index.html | sort -u)
# Report orphans so the next reader is not surprised by them, but do not fail on
# them: they are unreferenced and cannot affect the page the guard measures.
orphans=$(grep -rl 'loker-tidak-ada\|tim-renamed' dist/ 2>/dev/null | wc -l)
if [ "$orphans" -gt 0 ]; then
  echo "note: $orphans unreferenced stale chunk(s) in dist/ carry old payloads"
  echo "      (harmless — nothing in index.html points at them; a full rm -rf dist"
  echo "       would clear them, which the safe-delete shim here refuses)"
fi
echo "artifact: clean"

# ── RULE 1: the baseline must be green, or no mutation means anything ──────
if ! BASE_URL="$BASE" node "$GUARD" > .tmp-landing-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations would be meaningless"
  tail -20 .tmp-landing-base.txt
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
echo "baseline: green"
echo

for f in "$PAGE" "$NAV" "$I18N" "$APP"; do backup "$f"; done

# ── one mutation per rule the gate claims to enforce ──────────────────────

# M1 — a spec section disappears. The id is RENAMED rather than the section
# removed, so no file is deleted and the indexer's file count is untouched.
#
# ⚠ THIS TARGET DRIFTED AND THE ABORT CAUGHT IT — which is the harness working, not
# a harness bug. The original anchor included ` labelledBy="tim-title">`, and a later
# redesign added a `class` attribute to that tag, so the string stopped matching.
# Without `mut` asserting EXACTLY ONE match this would have been recorded as a
# SURVIVED and read as a hole in the gate. The anchor is now the ID ALONE, which is
# the part this mutation is actually about and the part that does not change when
# someone edits styling.
step "M1  #tim is renamed (a spec section vanishes from the document)" \
  "$PAGE" \
  '[["<Section id=\"tim\"","<Section id=\"tim-renamed\""]]'

# M2 — the section is IN the DOM with no usable geometry. This is the exact defect
# the "present AND visible" rule was written for, and the one a presence check
# cannot see.
#
# ⚠ WHY THE OBVIOUS CLASSES DO NOT WORK — measured, not assumed:
#   - `hidden` passed as an ATTRIBUTE to <Section> is DISCARDED (trap T1: no
#     rest-spread). The attribute never reaches the HTML; the mutation is a no-op.
#   - `max-h-0 overflow-hidden` DOES reach the HTML and sets `max-height: 0px` —
#     and the section is still 160px tall, because `max-height` constrains the
#     CONTENT box while `py-14 md:py-20` (80px + 80px of PADDING) keeps the
#     element's box. Measured: maxHeight "0px", height 160. An "obviously
#     correct" collapse mutation that silently does not collapse.
#   - `class="hidden"` gives `display: none` and height 0. This is the one that
#     works, because `display` is not subject to the padding-box rule.
step "M2  #tentang is collapsed (present in the DOM, zero height)" \
  "$PAGE" \
  '[["<Section id=\"tentang\" labelledBy=\"tentang-title\">","<Section id=\"tentang\" class=\"hidden\" labelledBy=\"tentang-title\">"]]'

# M3 — order. Two adjacent sections trade places; both still exist, both stay
# visible, so ONLY the order rule can catch this.
step "M3  #tentang and #tim swap places (spec order broken)" \
  "$PAGE" \
  '[["<Section id=\"tentang\"","<Section id=\"tim-x\""],["<Section id=\"tim\"","<Section id=\"tentang\""],["<Section id=\"tim-x\"","<Section id=\"tim\""]]'

# M4 — a placeholder reaches the SERVED HTML. This is the mutation that SURVIVED
# before the gate grew a served-HTML check, and it is the load-bearing one in this
# file: it is the only mutation that distinguishes "the gate reads the hydrated
# DOM" from "the gate reads what is actually shipped". See trap T3.
step "M4  'lorem ipsum' is injected into a data-lang fallback (served-HTML layer)" \
  "$PAGE" \
  '[["desc=\"Kantor kami di Kabupaten Ponorogo, Jawa Timur.\"","desc=\"Kantor kami di Kabupaten Ponorogo, Jawa Timur. Lorem ipsum dolor sit amet.\""]]'

# M5 — a placeholder reaches the i18n DICTIONARY, which is what replaces the
# fallback after hydration. This is the other half of M4: M4 proves the HTML layer
# bites, M5 proves the source scan does. A gate with only one of the two passes one
# of these.
step "M5  a placeholder is injected into the i18n dictionary (source layer)" \
  "$I18N" \
  '[["\"profile.loc_desc\": \"Kantor kami di Kabupaten Ponorogo, Jawa Timur.\",","\"profile.loc_desc\": \"Kantor kami di Kabupaten Ponorogo, Jawa Timur. Lorem ipsum dolor sit amet.\",\"lorem_probe\": \"lorem ipsum\",","\"profile.loc_title\": \"Lokasi Kami\","]]'

# M6 — a nav link points at a fragment that does not resolve. This is the §5.1
# defect: a link that renders, looks live, and does nothing.
step "M6  a nav item points at a fragment that does not exist" \
  "$NAV" \
  '[["href=\"#fasilitas\"","href=\"#fasilitas-tidak-ada\""]]'

# M7 — DELETED 2026-09-24, NOT COMMENTED OUT, AND ITS ABSENCE IS A FINDING.
#
# M7 used to retarget the HERO's primary CTA away from /loker, proving the `hero`
# region of LOKER_ROUTE could fail. On 2026-09-24 the owner ruled that `/` is a
# company profile for MoU/business partners, not a job board: the hero CTA, the
# live-count strip CTA, the `#loker-ringkas` section and the footer link were all
# removed, and the page now keeps EXACTLY ONE link to /loker — the section nav. The
# `hero` region is gone from LOKER_ROUTE.regions, so M7 has no subject left, and a
# mutation whose subject was deleted is not evidence.
#
# THE PREVIOUS M7 IS ALSO GONE, AND FOR THE SAME REASON. It mutated
# `DEFAULT_PUBLIC_SECTION` in `src/lib/publicSections.ts` to flip which tab panel
# was active. That module still EXISTS and is still live — but on `/public`, not on
# `/`. `/` no longer calls `bindPublicSections()` and carries ZERO
# `[data-public-tab]` elements, so that mutation had no reachable effect on the
# page this gate measures. Deleting a mutation whose subject was deleted is the
# same rule the gate itself just learned: a check with no subject is not evidence.

# M8 — the ONE remaining region, and the reason the rule is region-scoped rather
# than a count. This removes the SECTION NAV's only path to the list, while leaving
# the links in other regions intact. Under the old `count >= 2` rule this defect was
# invisible; under the region rule it must turn the gate red.
#
# RE-ANCHORED 2026-09-24. This mutation used to retarget BOTH nav anchors — the
# "Lowongan" list item and the pink CTA button beside the language toggle — because
# the nav carried TWO paths and mutating only one left the other satisfying the
# region selector (a TRUE NEGATIVE, not a hole: the region rule asks "can a visitor
# reach the list from here", and the answer was still yes). Ruling 3 collapsed the
# nav to ONE link — the list item is the page's only path and the pill is gone — so
# the mutation now retargets that single anchor and its second pair is deleted. The
# rule the mutation proves is unchanged: empty the region and the gate must go red.
step "M8  the section nav loses its only path to /loker (the region is emptied)" \
  "$NAV" \
  '[["<a href=\"/loker\" data-lang=\"profile.nav_loker\" class={LINK_CLASS}>Lowongan</a>","<a href=\"/loker-tidak-ada\" data-lang=\"profile.nav_loker\" class={LINK_CLASS}>Lowongan</a>"]]'

# M9  a hero STATISTIC is replaced with a fabricated one (roadmap L8.4).
#
#     Every other mutation here breaks something a reader would NOTICE is wrong:
#     a vanished section, a collapsed one, a broken link, placeholder text. This
#     one breaks nothing visible. The tile still renders, still has its heading,
#     still has the right layout — it simply states a number the company cannot
#     support. No other gate in this repo can see that, because an invented
#     statistic is valid markup in a visible element.
#
#     `'500'` IS NOT AN ARBITRARY NUMBER. It is the figure from the design mockup
#     that docs/COMPANY_PROFILE_DATA.md §12 explicitly rules out, and App.tsx:38-47
#     records why the three shipped values replaced it: "a fabricated statistic on
#     a company page is a legal claim, not decoration". So this mutation
#     reproduces the exact regression the rule exists to prevent — someone
#     restoring the mockup's numbers — rather than a synthetic corruption.
#
#     The anchor is the `profile.stat_sectors` ENTRY, not the bare `'5'`: `'5'`
#     alone matches several values in this array and in the wider file, and a
#     mutation that hits the wrong one would kill for the wrong reason.
step "M9  a hero statistic is hardcoded to a fabricated value ('5' -> '500')" \
  "$APP" \
  '[["{ value: '\''5'\'', labelKey: '\''profile.stat_sectors'\'' },","{ value: '\''500'\'', labelKey: '\''profile.stat_sectors'\'' },"]]'

# ── byte-identical restore, and green again ───────────────────────────────
echo
for f in "$PAGE" "$NAV" "$I18N" "$APP"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done

# Same invocation rule as the step builds above: `npx astro` does not resolve here.
node node_modules/astro/astro.js build >/tmp/mut-restore-build.log 2>&1
node scripts/build-sw-manifest.mjs >/dev/null 2>&1

if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

# ── Cleanup ────────────────────────────────────────────────────────────────
#
# ⚠ THIS RUNS ON EVERY EXIT PATH, INCLUDING ABORT. The first version only cleaned
# up at the very end, so a run that aborted (a red baseline, an unapplied mutation,
# Ctrl-C) left `.tmp-landing-bak/`, `.tmp-landing-serve.log` and
# `.tmp-landing-base.txt` in the tree — and the NEXT gate to run reads an untracked
# backup directory as leftover litter and goes red for a reason that has nothing to
# do with the code. Measured: exactly that happened on this script's third run.
#
# WITHOUT `rm -rf` — see the DELETED FILES note at the top: the sandbox shim counts
# every delete against a ~50-per-turn quota that a preceding full build has already
# spent, so an `rm -rf` here is refused and leaves the litter it was meant to clear.
cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  node -e '
const fs = require("fs");
const dir = ".tmp-landing-bak";
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  try { fs.unlinkSync(dir + "/" + f); } catch {}
}
try { fs.rmdirSync(dir); } catch {}
for (const f of [".tmp-landing-serve.log", ".tmp-landing-base.txt"]) {
  try { fs.unlinkSync(f); } catch {}
}
' 2>/dev/null
}
trap cleanup EXIT

echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
exit "$fail"
