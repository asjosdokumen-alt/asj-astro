#!/usr/bin/env bash
# Mutation battery for scripts/ci/check-md-tables.mjs.
#
# Why a battery: a checker that cannot fail is worse than no checker. Each
# mutation below re-introduces a defect class this gate claims to catch; the
# gate must exit non-zero for every one of them. A "SURVIVED" line is a hole.
#
# Two lessons are baked in, both learned the hard way in this repo:
#   1. Baseline must be green first — otherwise "0 failures" may just mean the
#      gate never ran.
#   2. Judge by EXIT CODE, not by scraping output text.
#
# A third trap is why this script must be run from the repo ROOT and uses
# relative paths: an earlier draft passed `/f/astro/...` to Windows Python, which
# cannot open it, so every mutation silently failed to apply and the battery
# reported 5/5 SURVIVED against a perfectly good gate. Asserting a byte-identical
# restore at the end is what makes that failure mode visible if it recurs.
#
# ── SYNC 2026-09-15 · TWO DEFECTS FIXED IN THIS FILE ───────────────────────
#
# (1) MUTATION A WAS DEAD — it reported SURVIVED against a healthy gate.
#     A pinned its anchor to prose inside `docs/BACKEND_TODO.md` row `| **7** |`:
#       '§7.2–7.3, `docs/PHASE_C_SINK_SETUP.md` §2b'
#     That row was later rewritten wholesale (it is now a single long cell about
#     the Grafana prerequisites) and the exact string disappeared. Measured:
#     `grep -c '§7.2–7.3, \`docs/PHASE_C_SINK_SETUP.md\` §2b' docs/BACKEND_TODO.md`
#     returned 0. Python's `str.replace()` then matched nothing, wrote the file
#     back UNCHANGED, and `run` — which judges only the exit code — saw the gate
#     stay green and printed SURVIVED. A mutation that never applied is
#     indistinguishable from a mutation the gate cannot catch, and the battery
#     had no guard against it. A now targets a row it first verifies exists, and
#     every mutation asserts EXACTLY ONE match before writing.
#
#     THE LESSON, which is the reason this file is a gate at all: prose is a
#     volatile anchor. A battery that pins an English sentence breaks silently
#     the next time a human edits that sentence, and the breakage looks like a
#     finding. Anchors here are structural (a row label) or the assertion fails.
#
# (2) THE BATTERY CALLED `python`, WHICH CI DOES NOT HAVE.
#     `ubuntu-latest` ships `python3`, not `python`, and a bare Windows box has
#     neither. This battery could therefore never have run in CI — which is
#     consistent with the fact that it never did. Rewritten to `node -e`, the
#     idiom `verify-classes.mutations.sh` already uses; Node is guaranteed by
#     the checkout that runs this. The old form also had to be run from the repo
#     root while the runner may cd, so paths are now explicit.
#
# Must be run with cwd = repo root:  bash scripts/ci/check-md-tables.mutations.sh
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

fail=0
results=()

GATE=scripts/ci/check-md-tables.mjs
BAK=.tmp-mdmut
FILES=(
  docs/BACKEND_TODO.md
  docs/PARITY_CHECKLIST.md
  docs/CODE_INDEX_DESIGN.md
)

key() { printf '%s' "$1" | tr '/.' '__'; }

backup_all() {
  mkdir -p "$BAK"
  for f in "${FILES[@]}"; do cp "$f" "$BAK/$(key "$f")"; done
}

restore_all() { for f in "${FILES[@]}"; do cp "$BAK/$(key "$f")" "$f"; done; }
trap restore_all EXIT

run() {
  local desc="$1"
  node "$GATE" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "KILLED   exit=$rc  $desc"
    results+=("KILLED   $desc")
  else
    echo "SURVIVED exit=0   $desc   <-- HOLE: the gate cannot see this defect"
    results+=("SURVIVED $desc")
    fail=1
  fi
}

# Replace exactly ONE occurrence, or refuse to continue.
#
# `anchor` is an optional second assert: the line MUST exist and MUST contain
# it. Without that, a targeted edit on a row that has been renamed silently
# applies zero mutations — defect (1) above.
mut() {
  MUT_FILE="$1" MUT_OLD="$2" MUT_NEW="$3" MUT_ANCHOR="${4:-}" node -e '
const fs = require("fs");
const p = process.env.MUT_FILE;
const s = fs.readFileSync(p, "utf8");
const anchor = process.env.MUT_ANCHOR;
if (anchor && !s.includes(anchor)) {
  console.error("ANCHOR MISSING in " + p + ": " + JSON.stringify(anchor));
  console.error("The battery is pinned to text that no longer exists. Retarget it.");
  process.exit(3);
}
const o = process.env.MUT_OLD;
const hits = s.split(o).length - 1;
if (hits !== 1) {
  console.error("MUTATION DID NOT APPLY (hits=" + hits + "): " + JSON.stringify(o));
  process.exit(3);
}
fs.writeFileSync(p, s.replace(o, process.env.MUT_NEW));
'
}

step() {
  local label="$1" file="$2" old="$3" new="$4" anchor="${5:-}"
  restore_all
  if ! mut "$file" "$old" "$new" "$anchor"; then
    echo "ABORT: the mutation for '$label' did not apply — results would be meaningless."
    exit 1
  fi
  run "$label"
  restore_all
}

# ── RULE 1: never interpret mutations against an already-red baseline ───────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on an unmutated tree. Aborting: mutations cannot be interpreted."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"
backup_all

# ── A–D: defects in docs/PARITY_CHECKLIST.md ────────────────────────────────
# Anchor on the row LABEL (`| A08 |`), which is structural and stable, and assert
# the exact substring being replaced. If either moves, the battery aborts loudly
# instead of reporting a phantom SURVIVED.

# A — a stray closing backtick ends a code span early, so the pipes that follow
#     it become CELL SEPARATORS and the row silently gains columns. This is the
#     historical defect the gate's own header cites; it is now reproduced on a
#     row that verifiably exists rather than on a prose fragment.
step "A  stray backtick closes a code span early" \
  docs/PARITY_CHECKLIST.md \
  '`CvMiniModal.tsx` | ✅ 2026-09-05' \
  '`CvMiniModal.tsx | ✅ 2026-09-05' \
  '`CvMiniModal.tsx` | ✅ 2026-09-05'

# B — raw `||` inside a code span: two `|` chars that the cell counter cannot
#     distinguish from the escaped form, so only the second check can see it.
step "B  raw || inside a code span" \
  docs/PARITY_CHECKLIST.md \
  'data.message \|\| data.error' \
  'data.message || data.error' \
  'data.message'

# C — an extra trailing cell on one row.
step "C  extra trailing cell on one row" \
  docs/PARITY_CHECKLIST.md \
  '`PamfletModal.tsx` | ✅ 2026-09-05 |' \
  '`PamfletModal.tsx` | ✅ 2026-09-05 | extra |' \
  '`PamfletModal.tsx` | ✅ 2026-09-05 |'

# D — one row short a trailing pipe.
step "D  missing trailing pipe (one cell short)" \
  docs/PARITY_CHECKLIST.md \
  '`CvMiniModal.tsx` | ✅ 2026-09-05 |' \
  '`CvMiniModal.tsx` | ✅ 2026-09-05' \
  '`CvMiniModal.tsx` | ✅ 2026-09-05 |'

# ── E: the same defect class in a different file ────────────────────────────
step "E  raw pipe in a code span (CODE_INDEX_DESIGN)" \
  docs/CODE_INDEX_DESIGN.md \
  'dump\|export' \
  'dump|export' \
  'dump\|export'

# ── integrity: restored files must be byte-identical ────────────────────────
echo
restore_all
for f in "${FILES[@]}"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done

if ! node "$GATE" >/dev/null 2>&1; then
  echo "post-battery baseline: RED — a mutation is still in the tree"
  fail=1
else
  echo "post-battery baseline: green"
fi

echo
echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
# Disarm the trap BEFORE removing the backup: the trap restores from $BAK, so
# deleting $BAK first makes every EXIT print three `cp: cannot stat` errors.
trap - EXIT
rm_retry "$BAK"
exit "$fail"
