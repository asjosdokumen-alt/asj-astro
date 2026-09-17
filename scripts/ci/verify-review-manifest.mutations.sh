#!/usr/bin/env bash
# Mutation battery for scripts/ci/verify-review-manifest.mjs.
#
# WHY A BATTERY
# -------------
# A checker that cannot fail is worse than no checker: it buys confidence and
# pays nothing. This gate exists to stop the review standard drifting away from
# the repo — it is the gate that would have caught the phantom `lint` checkbox.
# So it, of all gates, must be shown to fail.
#
# Each mutation re-introduces one drift class the gate claims to catch:
#
#   S1  a manifest entry naming a script that does not exist   -> C1
#   S2  a provenBy battery that is not on disk                 -> C2
#   S3  a blocking gate that nothing invokes                   -> C3
#   S4  the checklist naming a gate that does not exist        -> C4
#   S5  a review document referencing a non-existent script    -> C5
#   S6  a `runs` entry naming a job that does not exist        -> C6
#   S7  a `runs` entry naming a workflow that does not exist   -> C6
#   S8  a `runs` entry naming a REAL job that does not invoke
#       the gate ("it is in the file somewhere" is not enough)  -> C6
#   S9  a `runs` entry naming a real job in ANOTHER workflow   -> C6
#
# S4 is the one that matters most: it is a literal replay of the real defect this
# gate was written for. The checklist opened with `` `lint` ``, no `lint` script
# existed, and nothing noticed for as long as the file was there.
#
# S6–S9 exist because the first version of C6 searched the WHOLE workflow file
# for `npm run <gate>`. S8 SURVIVED that version — claiming a gate ran in
# `ci.yml#classes` passed, because the string appeared elsewhere in ci.yml. The
# check was verifying "runs somewhere in this file", which is not the claim being
# made. Scoping it to the named job's block killed S8. These four mutations keep
# it scoped: if the file-wide search ever comes back, S8 goes red immediately.
#
# TRAPS, BOTH REAL, BOTH GUARDED
# ------------------------------
#  1. **The mutation silently fails to apply.** `mut` asserts exactly ONE match
#     before writing and aborts the run if not, so a battery can never report a
#     verdict on a mutation that never landed.
#  2. **Judging by scraped output instead of the exit code.** `check` only ever
#     looks at `$?`.
#
# The battery backs up and byte-verifies every file it touches, including the
# gate itself. A battery that forgets to restore its own subject produces results
# that look like kills and are actually leftovers — which happened while this
# gate was being built, in the sibling review-gate battery.
#
# TWO OUTCOMES THAT ARE NOT FAILURES
# ----------------------------------
# **E2 — adding a gate must be allowed.** A valid new manifest entry goes green.
# If E2 ever fails, the gate has started rejecting legitimate growth.
#
# Must be run with cwd = repo root:  bash scripts/ci/verify-review-manifest.mutations.sh
set -u

# ── Transient-delete hardening ──────────────────────────────────────────────
# `rm` returns 1 inside a long run for a reason that is gone a moment later:
# measured at this file's clean-up site, in-run, `rc=1` with the path correct
# and the file still present. An un-deleted fixture then becomes the NEXT
# battery's input -- one leftover file once turned into twelve red gates.
# Every delete below therefore goes through `rm_retry`, which retries and
# records the errno. See scripts/ci/lib/rm-retry.sh for the measurement.
RM_RETRY_LIB="$(dirname "${BASH_SOURCE[0]}")/lib/rm-retry.sh"
[ -f "$RM_RETRY_LIB" ] || { echo "FATAL — missing $RM_RETRY_LIB; the batteries are not runnable without it"; exit 2; }
. "$RM_RETRY_LIB"

GATE=scripts/ci/verify-review-manifest.mjs
MANIFEST=scripts/ci/review-manifest.json
CHECKLIST=docs/CODE_REVIEW_CHECKLIST.md
TEMPLATE=.github/PULL_REQUEST_TEMPLATE.md
BAK=.tmp-manifestmut
fail=0
results=()

FILES=("$MANIFEST" "$CHECKLIST" "$TEMPLATE" "$GATE")

key() { printf '%s' "$1" | tr '/.' '__'; }

backup_all() {
  mkdir -p "$BAK"
  for f in "${FILES[@]}"; do cp "$f" "$BAK/$(key "$f")"; done
}

restore_one() {
  local b="$BAK/$(key "$1")"
  [ -f "$b" ] && cp "$b" "$1"
}

cleanup() { for f in "${FILES[@]}"; do restore_one "$f"; done; }

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

# ── STRUCTURAL mutation for review-manifest.json ────────────────────────────
#
# WHY THIS EXISTS, AND WHY THE S3/S6-S9 MUTATIONS BELOW HAD TO BE REWRITTEN
# ------------------------------------------------------------------------
# Measured 2026-09-15, on the first run of `npm run verify:batteries`: this
# battery ABORTED. S3's anchor was the literal text
#     "runs": ["ci.yml#classes", "ci:quality", "review:gate"]
# and that string does not exist in review-manifest.json — the file has always
# stored `runs` as a MULTI-LINE array:
#     "runs": [
#       "ci.yml#classes",
#       ...
#     ],
# So the mutation matched nothing and the battery refused to continue. The guard
# did its job (it aborted rather than reporting a phantom verdict) — but S3 could
# never have passed. S6-S9 shared the same one-line assumption, and they were
# additionally anchored on verify:md's `note` PROSE, which is edited whenever
# that gate's story is updated.
#
# The lesson is the same one `check-md-tables.mutations.sh` learned the same day:
# A MUTATION ANCHORED ON FORMATTING OR PROSE IS DEAD THE NEXT TIME SOMEONE
# REFORMATS OR REPHRASES, AND A DEAD MUTATION REPORTS "SURVIVED" — so the battery
# quietly certifies a gate it never actually tested.
#
# This mutates the PARSED STRUCTURE instead, so it is immune to both. Three
# operations, addressed by gate name:
#     runs      <script> <json>      -> replace the whole `runs` array
#     suffix    <script> <text>      -> append text to `script` (make it nonexistent)
#     provenby  <script> <path>      -> replace `provenBy`
#     script    <script> <newname>   -> replace `script` outright
# The manifest is re-serialised with 2-space indent, matching how it is stored,
# and every operation asserts the gate exists AND that exactly one was changed.
#
# The `key` is the gate's CURRENT `script` value, so it is stable: renaming the
# manifest's own gate list is not something these cases are testing.
json_mut() {
  MUT_MANIFEST="$MANIFEST" MUT_OP="$1" MUT_KEY="$2" MUT_VAL="$3" node -e '
const fs = require("fs");
const p = process.env.MUT_MANIFEST;
const doc = JSON.parse(fs.readFileSync(p, "utf8"));
const op = process.env.MUT_OP;
const key = process.env.MUT_KEY;
const val = process.env.MUT_VAL;
const gates = doc.gates || [];
const targets = gates.filter((g) => g.script === key);
if (targets.length !== 1) {
  console.error(
    "MUTATION TARGET NOT UNIQUE: gate " + JSON.stringify(key) + " matched " + targets.length
  );
  process.exit(3);
}
const g = targets[0];
if (op === "runs") g.runs = JSON.parse(val);
else if (op === "provenby") g.provenBy = val;
else if (op === "script") g.script = val;
else if (op === "suffix") g.script = g.script + val;
else {
  console.error("UNKNOWN MUTATION OP: " + op);
  process.exit(3);
}
fs.writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
'
}

# `step` variant for the structural mutations above.
step_json() {
  local label="$1" expect="$2" op="$3" key="$4" val="$5"
  restore_one "$MANIFEST"
  if ! json_mut "$op" "$key" "$val"; then
    echo "ABORT: the mutation for '$label' did not apply — results would be meaningless."
    exit 1
  fi
  check "$label" "$expect"
  restore_one "$MANIFEST"
}

check() {
  local label="$1" expect="$2" rc
  node "$GATE" >/dev/null 2>&1
  rc=$?
  if [ "$expect" = kill ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    else
      echo "SURVIVED   exit=0   $label   <-- HOLE: this drift class is not covered"
      results+=("SURVIVED $label")
      fail=1
    fi
  else
    if [ "$rc" -eq 0 ]; then
      echo "OK-GREEN   exit=0   $label   ($expect: green is the correct answer)"
      results+=("OK-GREEN $label")
    else
      echo "UNEXPECTED exit=$rc  $label   <-- this $expect case should stay green"
      results+=("UNEXPECTED $label")
      fail=1
    fi
  fi
}

step() {
  local label="$1" expect="$2" file="$3" old="$4" new="$5"
  restore_one "$file"
  if ! mut "$file" "$old" "$new"; then
    echo "ABORT: the mutation for '$label' did not apply — results would be meaningless."
    exit 1
  fi
  check "$label" "$expect"
  restore_one "$file"
}

trap cleanup EXIT

# ── RULE 1: never interpret mutations against an already-red baseline ────────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on an unmutated tree. Aborting: mutations cannot be interpreted."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"
backup_all

# ── S1–S3 · the manifest against package.json ───────────────────────────────
# Structural (see `json_mut` above): addressed by gate name, so reformatting the
# manifest or rewording a `note` can no longer turn these into dead mutations.
step_json "S1  manifest names a script that does not exist"    kill script  verify:classes        'verify:classes-nonexistent'
step_json "S2  provenBy battery is not on disk"                kill provenby verify:classes       'scripts/ci/nonexistent.mutations.sh'
step_json "S3  blocking gate that nothing invokes"             kill runs    verify:classes       '[]'

# ── S4 · the checklist naming a gate that does not exist ────────────────────
# A literal replay of the phantom `lint` defect.
step "S4  checklist names a gate that does not exist"         kill "$CHECKLIST" '<!-- BEGIN TIER0 GATES (machine-checked by scripts/ci/verify-review-manifest.mjs) -->' '<!-- BEGIN TIER0 GATES (machine-checked by scripts/ci/verify-review-manifest.mjs) -->
phantom-gate-xyz'

# ── S5 · a review document referencing a non-existent script ────────────────
step "S5  review doc references a non-existent script"        kill "$TEMPLATE" '## What changed' '## What changed

npm run totally-not-a-script'

# ── S6–S9 · C6: workflow claims must be TRUE ────────────────────────────────
# Rewrites verify:md's `runs` array to a claim that is false in a different way
# each time, so each C6 branch is exercised independently. Structural, so the
# gate is identified by name rather than by its note text.
#
# WHY THE PROSE ANCHOR IS GONE: the previous version pinned verify:md's `note`
# verbatim and appended the `runs` array as a literal one-line string. Both
# assumptions were wrong on disk (multi-line arrays; notes get reworded), so all
# four mutations were dead. S8 in particular is the case that killed the
# file-wide C6 search — a mutation that cannot run protects nothing.
step_json "S6  runs names a job that does not exist"          kill runs verify:md '["ci.yml#no-such-job"]'
step_json "S7  runs names a workflow that does not exist"     kill runs verify:md '["ghost-workflow.yml#deploy"]'
step_json "S8  runs names a REAL job that does not invoke it" kill runs verify:md '["ci.yml#classes"]'
step_json "S9  runs names a real job in ANOTHER workflow"     kill runs verify:md '["deploy-production.yml#guard"]'

# ── E2 · growing the manifest must be allowed ──────────────────────────────
# FIXED 2026-09-18. This case had been reporting UNEXPECTED, and it was NOT the
# gate that was wrong — the fixture was stale. C7 (added after this case was
# written) requires every manifest entry to carry a `battery` classification,
# and the appended entry had none, so the gate correctly refused it and E2 read
# that as "a valid new entry was rejected".
#
# Attribution was measured, not assumed: the identical failure reproduces against
# the gate as committed at HEAD, with the same C7 message, so no later change to
# the gate caused it. The lesson is the one this file's own header states — a
# fixture that stops matching what it claims to model is indistinguishable from a
# gate that cannot see the defect, and only re-running tells them apart.
#
# `battery: "none"` is the honest classification for a synthetic entry: it is not
# a real gate, so it promises no battery, and C7's second rule (ci/infra REQUIRE a
# provenBy) is therefore not engaged.
restore_one "$MANIFEST"
if MANIFEST="$MANIFEST" node -e '
const fs = require("fs");
const p = process.env.MANIFEST;
const m = JSON.parse(fs.readFileSync(p, "utf8"));
m.gates.push({ script: "test", tier: 0, blocking: true, provenBy: null, battery: "none", runs: ["review:gate"], note: "added by the mutation battery" });
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
'; then
  check "E2  a valid new manifest entry is accepted" equivalent
else
  echo "ABORT: could not append a valid manifest entry."
  exit 1
fi
restore_one "$MANIFEST"

# ── G: the gate's own machinery ─────────────────────────────────────────────
step "G1  C1 filter inverted (proves direction matters)"       kill "$GATE" 'const missingScripts = gates.filter((g) => !(g.script in scripts)).map((g) => g.script);' 'const missingScripts = gates.filter((g) => (g.script in scripts)).map((g) => g.script);'
step "G2  package.json replaced by a stub (proves it is read)" kill "$GATE" 'const scripts = pkg.scripts || {};' 'const scripts = {};'
# G3 — C2c, added 2026-09-18 with the check itself.
#
# This is a "force the branch" case, like G1 and G2: it proves the C2c failure
# path is REACHABLE and that it fails the run, not that git-tracking detection
# works. The detection was proven separately, by hand, against the real defect
# this check exists for — untracking a gate's implementation with
# `git update-index --force-remove` (which leaves the file on disk) and watching
# the gate exit 1 with:
#
#   C2c — a gate's own implementation exists here but is NOT tracked by git
#     (a fresh checkout cannot run the gate at all):
#     verify:workflows -> scripts/ci/verify-workflows.mjs
#
# C2b stayed SILENT in that run, which is the whole point: the battery was
# tracked, so the old check was satisfied while the gate could not start.
# A battery cannot safely reproduce that mutation, because it would have to
# touch the real git INDEX — the thing that decides what ships — and a battery
# killed mid-case would leave a gate untracked. So the index mutation stays a
# documented manual procedure and this case covers reachability.
step "G3  C2c forced (proves the tracking requirement is enforced)" kill "$GATE" 'if (!isTracked(file)) untrackedImplementations.push(`${g.script} -> ${file}`);' 'if (true || !isTracked(file)) untrackedImplementations.push(`${g.script} -> ${file}`);'

# ── RULE 3: byte-identical restore, and green again ─────────────────────────
echo
for f in "${FILES[@]}"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done
if ! node "$GATE" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

echo "killed:     $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived:   $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
echo "ok-green:   $(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN')"
echo "unexpected: $(printf '%s\n' "${results[@]}" | grep -c '^UNEXPECTED')"
rm_retry "$BAK"
exit "$fail"
