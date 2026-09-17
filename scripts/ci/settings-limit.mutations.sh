#!/usr/bin/env bash
# Mutation battery for netlify/functions/_lib/db/settings-limit.test.ts.
#
# A guard never observed failing is a hypothesis. Each case below installs one
# realistic regression into production source, runs the guard, and requires the
# guard to die. Then it restores and proves the tree is clean again.
#
# WHY THE BASELINE COMES FROM THE LIVE TREE, NOT FROM git HEAD
# -----------------------------------------------------------
# The fix under test is UNCOMMITTED, so HEAD holds the PRE-FIX bytes. Restoring
# from git show HEAD would revert the very fix being proven, and the run would
# report BASELINE RED on a correct tree. Measured: an earlier revision of this
# battery did exactly that and silently deleted the fix from the working tree.
# So the baseline is snapshotted from the live file once, before any mutation,
# and this script ABORTS unless that snapshot provably contains the fix.
#
# Run with cwd = repo root:  bash scripts/ci/settings-limit.mutations.sh
set -u

MISC=netlify/functions/_lib/db/misc.ts
CONFIG=netlify/functions/contexts/configuration/repository.ts
CLIENT=netlify/functions/_lib/db/client.ts
GUARD=netlify/functions/_lib/db/settings-limit.test.ts

# The snapshot lives in the OS temp dir, NOT in the repo tree.
#
# This repo's batteries learned the hard way that a backup left inside the
# working tree reads as LEFTOVER when the cleanup delete is refused, and the
# sandbox's delete shim refuses `rm -rf` once a turn has deleted ~50 files. The
# shim also intercepts node's fs.rmSync, so it cannot be side-stepped. Keeping
# the snapshot outside the tree means a refused delete leaves nothing behind.
#
# The path is resolved by NODE, not by `${TMPDIR:-/tmp}`. Measured: under this
# shell ${TMPDIR:-/tmp} expanded to F:\tmp even though the variable holds
# C:\Users\k89\AppData\Local\Temp, and F:\tmp is inside the shim's reach — the
# client.orig snapshot vanished between two cases and every later comparison
# then read a missing file. os.tmpdir() reports what the platform actually uses.
BAKDIR="$(node -e 'process.stdout.write(require("os").tmpdir())')/asj-settings-battery.$$"
mkdir -p "$BAKDIR" || { echo "ABORT: cannot create snapshot dir $BAKDIR"; exit 1; }
fail=0
results=()

cp "$MISC"   "$BAKDIR/misc.orig"   || { echo "ABORT: cannot snapshot $MISC"; exit 1; }
cp "$CONFIG" "$BAKDIR/config.orig" || { echo "ABORT: cannot snapshot $CONFIG"; exit 1; }
cp "$CLIENT" "$BAKDIR/client.orig" || { echo "ABORT: cannot snapshot $CLIENT"; exit 1; }

grep -q "SETTINGS_ROW_LIMIT" "$BAKDIR/misc.orig" || {
  echo "ABORT: the baseline does not contain the fix (SETTINGS_ROW_LIMIT absent)."
  echo "       Re-apply the fix before running this battery."
  rm -rf "$BAKDIR" 2>/dev/null
  exit 1
}

restore() {
  cp "$BAKDIR/misc.orig"   "$MISC"
  cp "$BAKDIR/config.orig" "$CONFIG"
  cp "$BAKDIR/client.orig" "$CLIENT"
}
cleanup() { restore; rm -rf "$BAKDIR" 2>/dev/null; true; }
trap cleanup EXIT

# Does this file differ from its snapshot in CONTENT (EOL differences ignored)?
#
# The comparison must ignore EOL, and that is not a nicety: `cp` writes the bytes
# it is given, and the files under netlify/functions are CRLF in the working tree
# while git stores LF. A plain `git status` therefore reports a borrowed file as
# modified when its only change is that it came back with LF — a false alarm that
# trains a reader to ignore the real one. Measured: repository.ts came back with
# zero content diff and was still reported as " M".
content_differs() {
  local cur="$1" snap="$2"
  [ -f "$cur" ] || return 0
  [ -f "$snap" ] || return 0
  # NOTE the argv indices. Under `node -e`, process.argv is
  #     [node_path, first_arg, second_arg, ...]
  # — there is NO script path, so the arguments start at index 1. Reading
  # argv[2] here would compare a path against `undefined`, and the very first
  # run of this helper did that: it reported all three borrowed files as
  # changed, a false alarm that hides the real one it exists to catch.
  ! node -e '
    const fs=require("fs");
    const norm=(p)=>fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n");
    process.exit(norm(process.argv[1])===norm(process.argv[2])?0:1);
  ' "$cur" "$snap"
}

run_guard() { npx vitest run "$GUARD" >/dev/null 2>&1; }

if ! run_guard; then
  echo "BASELINE RED — the guard fails on the fixed tree. Fix it before trusting any verdict here."
  npx vitest run "$GUARD" 2>&1 | tail -20
  exit 1
fi
echo "baseline green"

check() {
  local label="$1" rc
  run_guard
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "KILLED     exit=$rc  $label"
    results+=("KILLED $label")
  else
    echo "SURVIVED   exit=0   $label   <-- HOLE: this regression is not covered"
    results+=("SURVIVED $label")
    fail=1
  fi
}

info() {
  local label="$1"
  if run_guard; then
    echo "OK-GREEN   exit=0   $label   (green is the correct answer)"
    results+=("OK-GREEN $label")
  else
    echo "UNEXPECTED exit!=0  $label   <-- this case should stay green"
    results+=("UNEXPECTED $label")
    fail=1
  fi
}

# M1 · findSettings loses its explicit limit (the original bug exactly)
node -e '
const fs=require("fs");
const p="netlify/functions/_lib/db/misc.ts";
let s=fs.readFileSync(p,"utf8");
const before=s;
s=s.replace(/,\r?\n    SETTINGS_ROW_LIMIT,\r?\n  \);/, "\r\n  );");
if(s===before){console.error("M1 needle missed");process.exit(1);}
fs.writeFileSync(p,s);
' || { echo "ABORT: M1 did not apply"; exit 1; }
check "M1  findSettings() loses its explicit limit"
restore

# M2 · findAnnouncements loses its explicit limit
node -e '
const fs=require("fs");
const p="netlify/functions/_lib/db/misc.ts";
let s=fs.readFileSync(p,"utf8");
const before=s;
s=s.replace(/, SETTINGS_ROW_LIMIT\);/, ");");
if(s===before){console.error("M2 needle missed");process.exit(1);}
fs.writeFileSync(p,s);
' || { echo "ABORT: M2 did not apply"; exit 1; }
check "M2  findAnnouncements() loses its explicit limit"
restore

# M3 · the limit silently becomes 1 again
node -e '
const fs=require("fs");
const p="netlify/functions/_lib/db/misc.ts";
let s=fs.readFileSync(p,"utf8");
const before=s;
s=s.replace(/const SETTINGS_ROW_LIMIT = \d+;/, "const SETTINGS_ROW_LIMIT = 1;");
if(s===before){console.error("M3 needle missed");process.exit(1);}
fs.writeFileSync(p,s);
' || { echo "ABORT: M3 did not apply"; exit 1; }
check "M3  the limit regresses to 1 (fix present but inert)"
restore

# M4 · the limit shrinks below the real row count
node -e '
const fs=require("fs");
const p="netlify/functions/_lib/db/misc.ts";
let s=fs.readFileSync(p,"utf8");
const before=s;
s=s.replace(/const SETTINGS_ROW_LIMIT = \d+;/, "const SETTINGS_ROW_LIMIT = 100;");
if(s===before){console.error("M4 needle missed");process.exit(1);}
fs.writeFileSync(p,s);
' || { echo "ABORT: M4 did not apply"; exit 1; }
check "M4  the limit drops below the real table size (100 < 158 rows)"
restore

# M5 · the named constant is inlined as bare literals
node -e '
const fs=require("fs");
const p="netlify/functions/_lib/db/misc.ts";
let s=fs.readFileSync(p,"utf8");
const before=s;
s=s.replace(/(?<!const )\bSETTINGS_ROW_LIMIT\b(?! =)/g, "500");
if(s===before){console.error("M5 needle missed");process.exit(1);}
fs.writeFileSync(p,s);
' || { echo "ABORT: M5 did not apply"; exit 1; }
check "M5  the named constant is replaced by bare literals"
restore

# M6 · the delete path stops resolving rows through findSettings
node -e '
const fs=require("fs");
const p="netlify/functions/contexts/configuration/repository.ts";
let s=fs.readFileSync(p,"utf8");
const before=s;
s=s.replace(/await findSettings\(\)/, "await Promise.resolve({ rows: [] })");
if(s===before){console.error("M6 needle missed");process.exit(1);}
fs.writeFileSync(p,s);
' || { echo "ABORT: M6 did not apply"; exit 1; }
check "M6  replaceConfigItems() stops resolving its rows through findSettings()"
restore

# P1 · the premise of the whole guard: findTable's default
node -e '
const fs=require("fs");
const p="netlify/functions/_lib/db/client.ts";
let s=fs.readFileSync(p,"utf8");
const before=s;
s=s.replace(/async function findTable\(candidates: string\[\], limit = 1\)/, "async function findTable(candidates: string[], limit = 9999)");
if(s===before){console.error("P1 needle missed");process.exit(1);}
fs.writeFileSync(p,s);
' || { echo "ABORT: P1 did not apply"; exit 1; }
check "P1  findTable's default changes (proves the guard reads the real signature)"
restore

# Positive control: the guard must be green when nothing is mutated
info "C1  untouched tree stays green"

echo
# Restore the bytes, then check them — and only THEN drop the snapshots.
#
# The order is load-bearing: `cleanup` both restores AND deletes $BAKDIR, so
# calling it before the comparison (as an earlier revision did) left every
# snapshot missing, `[ -f "$snap" ] || return 0` fired for all three files, and
# the battery reported all of them as changed. A restore check that runs after
# its own baseline is gone can only ever report failure.
restore

DIRTY=0
content_differs "$MISC"   "$BAKDIR/misc.orig"   && DIRTY=$((DIRTY+1))
content_differs "$CONFIG" "$BAKDIR/config.orig" && DIRTY=$((DIRTY+1))
content_differs "$CLIENT" "$BAKDIR/client.orig" && DIRTY=$((DIRTY+1))
if [ "$DIRTY" -gt 1 ]; then
  echo "RESTORE PROBLEM — more than one borrowed file came back changed in CONTENT:"
  echo "    $MISC / $CONFIG / $CLIENT"
  fail=1
fi

if ! grep -q "SETTINGS_ROW_LIMIT" "$MISC"; then
  echo "RESTORE FAILED — the fix is gone from $MISC after the run"
  fail=1
fi
if ! grep -q "await findSettings()" "$CONFIG"; then
  echo "RESTORE FAILED — $CONFIG was not put back"
  fail=1
fi

if ! run_guard; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

rm -rf "$BAKDIR" 2>/dev/null
trap - EXIT

rm -rf "$BAKDIR" 2>/dev/null
trap - EXIT

echo "killed:     $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived:   $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
echo "ok-green:   $(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN')"
echo "unexpected: $(printf '%s\n' "${results[@]}" | grep -c '^UNEXPECTED')"
exit "$fail"
