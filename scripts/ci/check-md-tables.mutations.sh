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
# Must be run with cwd = repo root.
set -u

fail=0
declare -a results=()

run() {
  local desc="$1"
  node scripts/ci/check-md-tables.mjs >/tmp/mdout.txt 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "KILLED   exit=$rc  $desc"
    results+=("KILLED   $desc")
  else
    echo "SURVIVED exit=0   $desc   <-- HOLE"
    results+=("SURVIVED $desc")
    fail=1
  fi
}

# --- baseline gate: refuse to interpret mutations if the tree is already red ---
if ! node scripts/ci/check-md-tables.mjs >/tmp/mdbase.txt 2>&1; then
  echo "BASELINE RED — aborting, mutations would be meaningless:"
  cat /tmp/mdbase.txt
  exit 1
fi
echo "baseline green ($(wc -l </tmp/mdbase.txt) line)"

mkdir -p /tmp/mdbak
cp docs/BACKEND_TODO.md docs/PARITY_CHECKLIST.md docs/CODE_INDEX_DESIGN.md /tmp/mdbak/

restore() {
  cp /tmp/mdbak/BACKEND_TODO.md   docs/BACKEND_TODO.md
  cp /tmp/mdbak/PARITY_CHECKLIST.md docs/PARITY_CHECKLIST.md
  cp /tmp/mdbak/CODE_INDEX_DESIGN.md docs/CODE_INDEX_DESIGN.md
}

# --- A: a stray closing backtick ends a code span early ---------------
python - <<'PY'
p = 'docs/BACKEND_TODO.md'
ls = open(p, encoding='utf-8').read().split('\n')
for i, l in enumerate(ls):
    if l.startswith('| **7** |'):
        ls[i] = l.replace(
            '§7.2–7.3, `docs/PHASE_C_SINK_SETUP.md` §2b',
            '§7.2–7.3`, `docs/PHASE_C_SINK_SETUP.md` §2b', 1)
        break
open(p, 'w', encoding='utf-8', newline='').write('\n'.join(ls))
PY
run "A  stray backtick closes a code span early"
restore

# --- B: raw || inside a code span (no escape) -------------------------
python - <<'PY'
p = 'docs/PARITY_CHECKLIST.md'
ls = open(p, encoding='utf-8').read().split('\n')
for i, l in enumerate(ls):
    if l.startswith('| A08 |') and 'data.message' in l:
        ls[i] = l.replace(r'data.message \|\| data.error',
                          'data.message || data.error', 1)
        break
open(p, 'w', encoding='utf-8', newline='').write('\n'.join(ls))
PY
run "B  raw || inside a code span"
restore

# --- C: extra cell appended to one row --------------------------------
python - <<'PY'
p = 'docs/PARITY_CHECKLIST.md'
ls = open(p, encoding='utf-8').read().split('\n')
for i, l in enumerate(ls):
    if l.startswith('| B05 |'):
        ls[i] = l.rstrip() + ' extra |'
        break
open(p, 'w', encoding='utf-8', newline='').write('\n'.join(ls))
PY
run "C  extra trailing cell on one row"
restore

# --- D: one row short a trailing pipe ---------------------------------
python - <<'PY'
p = 'docs/PARITY_CHECKLIST.md'
ls = open(p, encoding='utf-8').read().split('\n')
for i, l in enumerate(ls):
    if l.startswith('| A09 |'):
        ls[i] = l.rstrip()[:-1].rstrip()
        break
open(p, 'w', encoding='utf-8', newline='').write('\n'.join(ls))
PY
run "D  missing trailing pipe (one cell short)"
restore

# --- E: raw pipe inside a code span in a different file ---------------
python - <<'PY'
p = 'docs/CODE_INDEX_DESIGN.md'
ls = open(p, encoding='utf-8').read().split('\n')
for i, l in enumerate(ls):
    if l.startswith('| 5 | Query API'):
        ls[i] = l.replace(r'dump\|export', 'dump|export', 1)
        break
open(p, 'w', encoding='utf-8', newline='').write('\n'.join(ls))
PY
run "E  raw pipe in a code span (CODE_INDEX_DESIGN)"
restore

# --- integrity: restored files must be byte-identical -----------------
echo
if diff -q /tmp/mdbak/BACKEND_TODO.md    docs/BACKEND_TODO.md    >/dev/null \
&& diff -q /tmp/mdbak/PARITY_CHECKLIST.md docs/PARITY_CHECKLIST.md >/dev/null \
&& diff -q /tmp/mdbak/CODE_INDEX_DESIGN.md docs/CODE_INDEX_DESIGN.md >/dev/null; then
  echo "restore: byte-identical"
else
  echo "restore: DIFFERS — investigate"
  fail=1
fi

if ! node scripts/ci/check-md-tables.mjs >/dev/null 2>&1; then
  echo "post-battery baseline: RED — investigate"
  fail=1
else
  echo "post-battery baseline: green"
fi

echo
echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
exit "$fail"
