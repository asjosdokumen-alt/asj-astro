#!/usr/bin/env bash
# Mutation battery for e2e/test-labels.mjs.
#
# WHY A BATTERY
# -------------
# The guard asserts something that became TRUE only after this round's fix: that
# every rendered <label> on /master (all five wizard steps), /apply and
# /siswa-baru is tied to a control. A guard written against the fixed tree
# passes on the fixed tree by construction, so "the guard is green" is not
# evidence that the guard can see the defect it claims to pin. Each mutation
# below re-introduces one way the label wiring can rot; the guard must exit
# non-zero for every one of them.
#
# The four forms build their labels inside helper components and inside
# `.map()` loops, so a single mutated source line removes or corrupts MANY
# rendered labels:
#
#   MasterFullForm.tsx  <F /> renders 55 labels from 3 branches; SswField 2;
#                       ManualSelect 4; the step-3/step-4 rows 21 more
#   ApplyFullForm.tsx   InputField 7, SelectField 1, one inline WA label
#   SiswaBaruForm.tsx   9 biodata + 3 documents, from two .map() loops
#   AiCvForm.tsx        <Field /> renders most of /ai-cv's 68 labels from ONE
#                       line; TextAreaPair renders a pair per call site
#
# WHICH FAILURE PATH EACH MUTATION EXERCISES
# ------------------------------------------
# The guard has six distinct rejection paths. A battery that only ever trips one
# of them proves only that one branch works:
#
#   M1, M3, M4, M6, M8, M9, M17 -> "label has no for= at all"
#   M2, M5, M11             -> "for= points at an id that does not exist"
#   M7, M12, M14            -> "duplicate id, so for= resolves to the WRONG control"
#   M10                     -> "route rendered ZERO labels, so this check would
#                              pass vacuously"
#   M13                     -> "the wizard did not advance", i.e. the sweep's
#                              step-count assertion
#   M15, M16                -> "clicking Tambah did not add a row", i.e. the
#                              row-expansion assertion (M15 is button #0, M16 is
#                              button #1 — a per-button walk must catch both)
#   M18                     -> "a group has no accessible name", the assertion that
#                              exists only because /ai-cv's medical blocks needed
#                              role="group" instead of for=
#
# M14, M15 AND M16 ARE THE MULTI-ROW TRIO
# ---------------------------------------
# M14 drops the loop index from a row-derived id. With the DEFAULT one row per loop
# that is undetectable — one id, no collision, every `for=` still resolves — so the
# sweep now reads each screen a second time after clicking every "Tambah" once
# (measured: step 3 goes 12 -> 24 labels, step 4 goes 12 -> 16). M14 is killed only
# by that second reading. M15 and M16 are M14's controls: they make one "Tambah" a
# no-op, so the expansion assertion ("a clicked + must grow the label count") must
# fire. Without them that assertion would only ever have been observed passing —
# and without the growth assertion, a dead "+" would instead make the sweep count the
# same screen twice and report double the coverage.
#
# M15 AND M16 ARE WHY THE GROWTH CHECK IS PER BUTTON
# --------------------------------------------------
# M15 killed only the education "+" and SURVIVED. Step 3 has a SECOND loop, so an
# aggregate "did the screen grow?" check was satisfied by the job "+": measured,
# education delta 0, job delta 6, screen total 12 -> 18, guard green. The dead button
# belonged to the loop whose index-derived ids the reading exists to check, so the
# hole was exactly where coverage was claimed. The check now clicks one button at a
# time and requires EACH click to grow the count. M15 (index 0) and M16 (index 1)
# are the pair that pins it: M15 alone cannot distinguish a walk over all buttons
# from a walk that only ever looks at the first one.
#
# M3 AND M4 ARE WHY THIS GUARD WALKS THE WIZARD
# ---------------------------------------------
# On the first run of this battery, M3 (<SswField />) and M4 (<ManualSelect />)
# SURVIVED. The guard was not blind — it was SCOPE-LIMITED: those labels render
# on wizard steps 3 and 4, and the sweep only ever read the page once, after
# load, which sees step 1. Two survivors exposed a guard that reported "23 labels,
# every one associated" for a page that renders 90. The sweep now advances the
# wizard and ASSERTS the step count, and M3/M4 are the regression test for that.
#
# M10 and M13 are this battery's control-breakers. The guard's inline positive
# control (plant an unassociated label, prove the predicate flags it) is written
# INTO the guard and so cannot be broken by a source mutation — it is proven a
# different way: M1 and M2 show both branches of that predicate firing on real
# form content, M10 proves the anti-vacuity guard is not itself vacuous, and M13
# proves the step-count assertion is not vacuous.
#
# WHAT THIS BATTERY DOES NOT CLAIM
# --------------------------------
# * Turning a `<label>` into a `<span>` is NOT caught by the guard, and M10
#   relies on exactly that to zero the label count. The guard measures "of the
#   labels that exist, all are associated" — not "every control has a label".
#   The second question is the source-level `a11y/noLabelWithoutControl` rule's job.
# * The row expansion adds exactly ONE row to each loop. A defect that only appears
#   at three rows or more (or one that appears only on the FIRST row) is not covered.
# * The admin modals are not measured at all — see the guard's BOUNDARY. The
#   remaining 95 source locations are mapped by class in docs/UI_DESIGN_REVIEW.md
#   §27.9, and 18 of them are NOT fixable with for= (group labels, a label above a
#   <button>, and a <label> used as a section heading).
#
# FOUR TRAPS THIS SCRIPT GUARDS AGAINST
# -------------------------------------
#  1. **The mutation never reaches dist/.** The guard tests a BUILT artifact, so
#     a mutation that was never rebuilt looks exactly like a SURVIVED — a hole
#     reported where there is none. Each route loads its own content-hashed
#     chunk (MasterFullForm.<hash>.js etc.), so every step compares the chunk the
#     route actually loads against the baseline and aborts if unchanged.
#  2. **`astro build`'s exit code is not a signal here.** On this machine it
#     exits non-zero when the safe-delete shim refuses `cleanServerOutput`,
#     AFTER the pages are emitted. Only the guard's exit code is judged.
#  3. **A mutation that does not apply.** `mut()` asserts EXACTLY ONE match, so
#     a stale anchor fails loudly instead of silently becoming a no-op that then
#     reads as SURVIVED. This matters more than usual here: two of the helper
#     label lines in ApplyFullForm.tsx are byte-identical, and <F />'s three
#     branches differ only in indentation, so an anchor that is merely "the label
#     line" can hit two or three times.
#  4. **A readiness loop that cannot succeed.** `curl -o /dev/null` exits 23
#     even on a 200, so `curl -fsS -o /dev/null "$URL" && break` never breaks
#     and burns the whole timeout. This script redirects stdout instead.
#
# WHY THE BACKUP LIVES OUTSIDE THE REPO, AND THE CLEANUP IS IN A try/catch
# -----------------------------------------------------------------------
# The first run of this battery ended like this:
#
#   killed:   8
#   survived: 2
#   Error: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":52,...}
#
# The verdict had already been printed, and then the cleanup THREW — so the
# script's exit code was 1 regardless of how many mutations survived. A battery
# whose exit code cannot distinguish "all killed" from "all survived" is worse
# than no battery. Two changes fix it: the backup goes to the OS temp dir (so a
# refused delete cannot leave a fixture in the tree, which is the other half of
# this trap), and the cleanup is wrapped so it can never mask the verdict.
#
# Note this also corrects a belief recorded in this repo: node's `fs` IS subject
# to the shim. It hooks `rmSync`, not just the shell's `rm`.
#
# Must be run with cwd = repo root:  bash e2e/test-labels.mutations.sh
set -u

MASTER=src/components/forms/MasterFullForm.tsx
APPLY=src/components/forms/ApplyFullForm.tsx
SISWA=src/components/forms/SiswaBaruForm.tsx
AICV=src/components/forms/AiCvForm.tsx
GUARD=e2e/test-labels.mjs
BAK="${TMPDIR:-/tmp}/asj-labels-bak.$$"
PORT=4363
BASE="http://127.0.0.1:${PORT}"

fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
restore_one() { local b="$BAK/$(key "$1")"; [ -f "$b" ] && cp "$b" "$1"; }
restore_all() { restore_one "$MASTER"; restore_one "$APPLY"; restore_one "$SISWA"; restore_one "$AICV"; }

# The chunk each route actually loads — not whatever sorts first on disk. Astro
# names these by content hash, so an unchanged name means the mutation never
# reached the artifact this route is served.
sig() { grep -o "_astro/$1\.[A-Za-z0-9_-]*\.js" "dist/$2/index.html" 2>/dev/null | head -1; }

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

# judge: rebuild, prove the mutation reached dist/, run the guard, restore.
judge() {
  local label="$1" comp="$2" route="$3" base="$4"
  npx astro build >/dev/null 2>&1
  local now
  now=$(sig "$comp" "$route")
  if [ "$now" = "$base" ]; then
    echo "ABORT: the mutation for '$label' never reached dist/ ($route still loads ${now:-<none>})."
    exit 1
  fi
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  local rc=$?
  check "$label" "$rc"
  restore_all
}

step() {
  local label="$1" comp="$2" route="$3" base="$4" file="$5" old="$6" new="$7"
  restore_all
  if ! mut "$file" "$old" "$new"; then
    echo "ABORT: the mutation for '$label' did not apply."
    exit 1
  fi
  judge "$label" "$comp" "$route" "$base"
}

# Same as step, but installs TWO mutations before judging. Used by M10, which
# has to remove both of SiswaBaruForm's label sources to reach zero labels.
step2() {
  local label="$1" comp="$2" route="$3" base="$4" file="$5" o1="$6" n1="$7" o2="$8" n2="$9"
  restore_all
  if ! mut "$file" "$o1" "$n1"; then
    echo "ABORT: the first mutation for '$label' did not apply."
    exit 1
  fi
  if ! mut "$file" "$o2" "$n2"; then
    echo "ABORT: the second mutation for '$label' did not apply."
    exit 1
  fi
  judge "$label" "$comp" "$route" "$base"
}

mkdir -p "$BAK"
restore_all || true
cp "$MASTER" "$BAK/$(key "$MASTER")"
cp "$APPLY" "$BAK/$(key "$APPLY")"
cp "$SISWA" "$BAK/$(key "$SISWA")"
cp "$AICV" "$BAK/$(key "$AICV")"

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
BASE_M=$(sig MasterFullForm master)
BASE_A=$(sig ApplyFullForm apply)
BASE_S=$(sig SiswaBaruForm siswa-baru)
BASE_C=$(sig AiCvForm ai-cv)
if [ -z "$BASE_M" ] || [ -z "$BASE_A" ] || [ -z "$BASE_S" ] || [ -z "$BASE_C" ]; then
  echo "ABORT: could not read the per-route chunk names from dist/."
  exit 1
fi
if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "BASELINE RED — the guard fails on an unmutated tree. Aborting."
  BASE_URL="$BASE" node "$GUARD" || true
  exit 1
fi
echo "baseline green (master=${BASE_M##*/} apply=${BASE_A##*/} siswa=${BASE_S##*/} ai-cv=${BASE_C##*/})"

# ── /master: the three helpers plus the step-3/4 rows ───────────────────────
# M1 needs a TWO-LINE anchor, and this is not decoration. `<F />` renders its
# label from three branches (select / textarea / input) whose label lines differ
# ONLY in indentation — and the input branch is the SHALLOWEST, so its 8-space
# line is a substring of the 10-space lines and `mut()` would report hits=3 and
# abort. Anchoring on the following <input> line is what makes it unique.
#
# The `$'...'` form is load-bearing too: these files are CRLF, so a literal
# newline written inside the shell script would never match. `\r\n` is explicit
# on purpose — this repo has already been bitten once by a multi-line `mut()`
# anchor that silently never matched and turned an assertion-less helper into a
# SURVIVED that was not real.
step "M1   /master  <F /> input branch loses for= (every text/date/number field)" \
     MasterFullForm master "$BASE_M" "$MASTER" \
     $'        <label class="label" for={`mf-${p.k}`}>{p.label}</label>\r\n        <input id={`mf-${p.k}`} type=' \
     $'        <label class="label">{p.label}</label>\r\n        <input id={`mf-${p.k}`} type='

step "M2   /master  <F /> input loses its id= (for= now dangles)" \
     MasterFullForm master "$BASE_M" "$MASTER" \
     '<input id={`mf-${p.k}`} type=' \
     '<input type='

step "M3   /master  <SswField /> loses for= (step 5 — the old sweep never saw it)" \
     MasterFullForm master "$BASE_M" "$MASTER" \
     '<label class="label" for={`mf-${k}`}>{label}</label>' \
     '<label class="label">{label}</label>'

step "M4   /master  <ManualSelect /> loses for= (steps 3/4/5 — old sweep missed it)" \
     MasterFullForm master "$BASE_M" "$MASTER" \
     '<label class="label" for={id}>{label}</label>' \
     '<label class="label">{label}</label>'

step "M11  /master  step-3 education select loses its id= (for= now dangles)" \
     MasterFullForm master "$BASE_M" "$MASTER" \
     '<select class="input" id={`mf-edu-jenjang-${i}`} value={edu.jenjang}' \
     '<select class="input" value={edu.jenjang}'

step "M12  /master  step-4 kenalan field reuses another field's id" \
     MasterFullForm master "$BASE_M" "$MASTER" \
     '<input class="input" id={`mf-kenalan-alamat`} value={kenalan.alamat}' \
     '<input class="input" id={`mf-kenalan-nama`} value={kenalan.alamat}'

step "M13  /master  the wizard CANNOT advance (Next becomes a no-op)" \
     MasterFullForm master "$BASE_M" "$MASTER" \
     'onClick={() => changeStep(1)}' \
     'onClick={() => changeStep(0)}'

# M14 is killed ONLY by the second reading of each screen. With the default one
# row per loop, dropping the index from a row-derived id produces a single id, no
# collision, and every `for=` still resolves — the defect is invisible. It becomes
# visible the moment a second row exists, which is one click away for a candidate.
step2 "M14  /master  step-3 row id loses its index (needs the +1-row reading)" \
      MasterFullForm master "$BASE_M" "$MASTER" \
      'for={`mf-edu-thn-awal-${i}`}' 'for={`mf-edu-thn-awal`}' \
      'id={`mf-edu-thn-awal-${i}`}' 'id={`mf-edu-thn-awal`}'

# M15 is M14's control. The row-expansion reading is itself an assertion ("clicking
# Tambah must grow the label count"), and without M15 that assertion would only
# ever have been observed passing.
#
# M15 SURVIVED the first run, and that survivor is why the guard's growth check is
# now PER BUTTON rather than per screen. Step 3 carries TWO loops, so clicking all
# the "+" buttons in one pass and comparing the total is satisfied by whichever loop
# still works: measured with M15 applied, education "+" -> delta 0 but job "+" ->
# delta 6, so step 3 still grew 12 -> 18 and the guard passed. The dead button was
# the one whose index-derived ids the second reading exists to exercise.
step "M15  /master  the education Tambah button adds nothing (needs a per-button check)" \
     MasterFullForm master "$BASE_M" "$MASTER" \
     "onClick={() => setEduList(l => [...l, { jenjang:'', nama:'', thnAwal:'', thnAkhir:'', jurusan:'', jurusanManual:'', alamat:'' }])}" \
     "onClick={() => {}}"

# M16 kills the OTHER "+" on the same screen — the one at index 1. M15 alone cannot
# tell a per-button loop from a loop that only ever checks button #0, because the
# education button IS #0. M16 is what makes the walk over all indices load-bearing.
step "M16  /master  the job Tambah button adds nothing (index 1, not just #0)" \
     MasterFullForm master "$BASE_M" "$MASTER" \
     "onClick={() => setJobList(l => [...l, { perusahaan:'', jabatan:'', jabatanManual:'', thnAwal:'', thnAkhir:'', gaji:'', alasan:'' }])}" \
     "onClick={() => {}}"

# ── /apply ──────────────────────────────────────────────────────────────────
step "M5   /apply   <InputField /> loses id= on the input (7 labels dangle)" \
     ApplyFullForm apply "$BASE_A" "$APPLY" \
     '<input id={id} type={type}' \
     '<input type={type}'

step "M6   /apply   the inline WA label loses for= (the one non-helper label)" \
     ApplyFullForm apply "$BASE_A" "$APPLY" \
     'mb-2 text-slate-300" for="ap-wa">' \
     'mb-2 text-slate-300">'

step "M7   /apply   ap-tb reuses ap-bb's id (for= resolves to the WRONG control)" \
     ApplyFullForm apply "$BASE_A" "$APPLY" \
     '<InputField id="ap-tb"' \
     '<InputField id="ap-bb"'

# ── /siswa-baru ─────────────────────────────────────────────────────────────
step "M8   /siswa   biodata .map() loses for= (9 labels from one line)" \
     SiswaBaruForm siswa-baru "$BASE_S" "$SISWA" \
     ' for={`sw-${f.id}`}' \
     ''

step "M9   /siswa   documents .map() loses for= (3 labels from one line)" \
     SiswaBaruForm siswa-baru "$BASE_S" "$SISWA" \
     ' for={`sw-doc-${d.type}`}' \
     ''

step2 "M10  /siswa   EVERY label becomes a <span> (must trip the zero-label guard)" \
      SiswaBaruForm siswa-baru "$BASE_S" "$SISWA" \
      '<label class="block text-[10px] font-bold text-slate-400 mb-1" for={`sw-${f.id}`}>{f.label}</label>' \
      '<span>{f.label}</span>' \
      '<label class="block text-[10px] font-bold text-sky-400 mb-1" for={`sw-doc-${d.type}`}>{d.label}</label>' \
      '<span>{d.label}</span>'

# ── /ai-cv ──────────────────────────────────────────────────────────────────
# /ai-cv became a route in this round (its three medical blocks needed
# role="group", not for=). New coverage with no mutation behind it is a
# hypothesis, so these two are what make the route's inclusion load-bearing.

# M17 is the ordinary case on the new route: <Field /> renders most of /ai-cv's
# labels from ONE source line, so this single edit un-associates ~40 of them.
step "M17  /ai-cv  <Field /> loses for= (most of the page's labels)" \
     AiCvForm ai-cv "$BASE_C" "$AICV" \
     '<label class="block text-[11px] text-[#e2e8f0] mb-0.5" for={`ai_${id}`}>{label}</label>' \
     '<label class="block text-[11px] text-[#e2e8f0] mb-0.5">{label}</label>'

# M18 is the one that justifies the group-name assertion, and it is deliberately NOT
# a reverted <label>: the group keeps its <fieldset> and its structure, and only the
# <legend>'s text is dropped. The block still renders, nothing is logged, and the
# group silently loses its accessible name — which a source-level check cannot see,
# and the unassociated-label check cannot see either, because no <label> is involved.
step "M18  /ai-cv  the group's <legend> is emptied (silent, group has no name)" \
     AiCvForm ai-cv "$BASE_C" "$AICV" \
     '<legend class="block text-[11px] text-[#e2e8f0] mb-0.5 p-0">{groupLabel}</legend>' \
     '<legend class="block text-[11px] text-[#e2e8f0] mb-0.5 p-0"></legend>'

# ── byte-identical restore, and green again ────────────────────────────────
echo
for f in "$MASTER" "$APPLY" "$SISWA" "$AICV"; do
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
# Wrapped so a refused delete can never mask the verdict above — see the header.
# The backup is in the OS temp dir, so even a refusal leaves nothing in the tree.
node -e 'try{require("fs").rmSync(process.argv[1],{recursive:true,force:true})}catch(e){console.error("[cleanup] could not remove "+process.argv[1]+": "+String(e.message).split("\n")[0])}' "$BAK" || true
exit "$fail"
