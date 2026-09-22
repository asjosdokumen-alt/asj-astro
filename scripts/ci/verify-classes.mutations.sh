#!/usr/bin/env bash
# Mutation battery for scripts/ci/verify-classes.mjs.
#
# WHY A BATTERY
# -------------
# A checker that cannot fail is worse than no checker: it buys confidence and
# pays nothing. Every mutation below re-introduces a defect class this gate
# claims to catch. The gate must exit non-zero for each one. A "SURVIVED" line is
# a hole in the gate, not a curiosity.
#
# The mutations are deliberately spread across the gate's *different* code paths,
# because each path can rot independently:
#
#   S1-S2  a plain `class="…"` literal              (the common case)
#   S3     a `.astro` file                          (a whole file type)
#   S4     a typo in a utility's colour name        (valid-looking, no rule)
#   S5     a ternary branch inside `${…}`           (template expansion)
#   S6     a `+`-assembled name                     (concatenation expansion)
#   S7     a literal beside an unknowable operand   (the wildcard path)
#   G4     `:not()` arguments credited again        (the ORIGINAL blind spot)
#   G5     `:has()` lookbacks credited
#   G6     ancestor compounds kept in the subject chain
#   G7     an escaped comma splits one identifier into two
#
# G4-G7 were added 2026-09-17 with the subject-position parser. Before it, G4
# was not expressible: `:not(.x)` credited `.x`, so no mutation could make the
# gate notice a class whose only mention was an EXCLUSION. That is the defect
# the parser exists to close, so it is now pinned here.
#
# NOTE ON LABELS (a mislabelled mutation is worse than none): the first G5 draft
# disabled the `:where()`/`:is()` recursion and SURVIVED, which read as a hole
# but was not one — `:has()` is excluded from that recursion by design, so
# nothing about `:has()` had been mutated. It was rewritten to widen the regex
# that recognises `:where()`/`:is()`, which is the change that would genuinely
# admit a lookback. It now dies.
#
# If S5/S6/S7 survive, that expansion code is dead and the gate is only checking
# the easy half of the tree. That is exactly the failure this battery exists to
# surface.
#
# TWO TRAPS, BOTH REAL, BOTH GUARDED BELOW
# ----------------------------------------
#  1. **The mutation silently fails to apply.** An earlier battery in this repo
#     passed `/f/astro/...` to Windows Python, which cannot open that path, so
#     every mutation was a no-op and the battery reported 5/5 SURVIVED against a
#     perfectly good gate. Here `mut` asserts exactly ONE match before writing,
#     aborts the run if not, and the battery uses relative paths from the repo
#     ROOT.
#  2. **Judging by scraped output instead of the exit code.** `check` only ever
#     looks at `$?`, never at the gate's text.
#
# The battery also proves a byte-identical restore, so "the gate was green at the
# end" cannot be confused with "a mutation is still in the tree".
#
# TWO OUTCOMES THAT ARE NOT FAILURES
# ----------------------------------
# **B1 — the documented boundary.** The gate checks that a rule EXISTS, not that
# it APPLIES. `mt-6` next to `.section-title` (§19.4) is a real utility with a
# real rule that loses the cascade. B1 pins that boundary: if it ever starts
# failing, the gate grew a capability and this file needs updating, so it is
# reported as UNEXPECTED.
#
# **E1 — an equivalent mutation.** The first draft of S4 changed `bg-white/20` to
# `bg-white/21` and the gate stayed green, which looked like a hole. It is not:
# Tailwind v4 accepts an arbitrary opacity modifier, so `bg-white/21` (and even
# `bg-white/101`) is a perfectly valid utility with a real rule, and staying green
# is the CORRECT answer. The mutation was replaced with a misspelled colour name
# (`bg-whit/20`), which genuinely has no rule; the original is kept as E1 so the
# next reader does not "fix" the gate over it.
#
# Must be run with cwd = repo root:  bash scripts/ci/verify-classes.mutations.sh
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

GATE=scripts/ci/verify-classes.mjs
BAK=.tmp-classmut
fail=0
results=()

FILES=(
  src/components/Toast.tsx
  src/components/Footer.astro
  src/components/admin/AdminShareModal.tsx
  src/components/admin/TabTambah.tsx
  src/components/admin/TabWA.tsx
  src/components/forms/SiswaBaruForm.tsx
  "$GATE"
)

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

# Replace exactly one occurrence, or refuse to continue.
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

# Judge only by exit code.
check() {
  local label="$1" expect="$2" rc
  node "$GATE" >/dev/null 2>&1
  rc=$?
  if [ "$expect" = kill ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    else
      echo "SURVIVED   exit=0   $label   <-- HOLE: this defect class is not covered"
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

# ── S: the source tree under test ───────────────────────────────────────────
# S3's anchor is a class LITERAL inside Footer.astro, so it tracks that file:
# the literal was `mt-12 mb-8` until the landing rewrite removed `mb-8`, and the
# battery then aborted with `MUTATION DID NOT APPLY (hits=0)` — a correct abort
# that reads like a gate defect. If the gate ever goes red on this step, check
# the anchor still resolves before suspecting the code (see `mut` below).
step "S1  plain literal: shade that does not exist"            kill src/components/Toast.tsx 'class="flex-1"' 'class="flex-1 text-slate-750"'
step "S2  plain literal: hand-written class nobody defines"    kill src/components/Toast.tsx 'class="flex-1"' 'class="flex-1 rt-rows"'
step "S3  .astro file is scanned at all"                       kill src/components/Footer.astro 'mt-12 pt-6' 'mt-12 pt-6 text-slate-750'
step "S4  typo in a colour name (bg-whit/20)"                  kill src/components/Toast.tsx 'hover:bg-white/20' 'hover:bg-whit/20'
step "S5  ternary branch inside \${...} is expanded"           kill src/components/admin/AdminShareModal.tsx "'accent-pink-500'" "'accent-pink-999'"
step "S6  a '+' assembled name is expanded"                    kill src/components/admin/TabTambah.tsx "'-500 w-5 h-5'" "'-999 w-5 h-5'"
step "S7  literals beside an unknowable operand are checked"   kill src/components/admin/TabWA.tsx "' leading-relaxed'" "' leading-relaxed text-slate-750'"

# ── B / E: mutations that must stay green, each for a different reason ──────
step "B1  mt-6 beside .section-title (cascade, not existence)" boundary   src/components/forms/SiswaBaruForm.tsx 'class="section-title section-title--flush"' 'class="section-title section-title--flush mt-6"'
step "E1  bg-white/21 (arbitrary opacity modifier IS valid)"   equivalent src/components/Toast.tsx 'hover:bg-white/20' 'hover:bg-white/21'

# ── G: the gate's own machinery ─────────────────────────────────────────────
# G1-G3 mutate the escape reader and the final verdict. G4-G7 mutate the
# SUBJECT-POSITION logic added 2026-09-17, which is the reason this gate can now
# see the defect class it was written for; each one restores a measured hole.
step "G1  unescape loses the hex-escape terminator"            kill "$GATE" "if (raw[j] === ' ') j++;" "if (false) j++;"
step "G2  selector scan loses hex-escape support"              kill "$GATE" 'String.raw`(?:\\[0-9a-fA-F]{1,6} ?|\\.|[\w-])+`' 'String.raw`(?:[\w-])+`'
step "G3  the verdict is inverted (proves it is not a tautology)" kill "$GATE" 'const dead = tokens.filter((t) => !defined.has(t) && !inlineDefined.has(t));' 'const dead = tokens.filter((t) => defined.has(t) && !inlineDefined.has(t));'
step "G4  :not() arguments are credited again (the original bug)" kill "$GATE" "const blank = n !== null || (m !== null && sawContent);" "const blank = false;"
step "G5  :has() lookbacks are credited"                       kill "$GATE" 'const m = /^:(?:where|is)\s*\(/.exec(comp.text.slice(i));' 'const m = /^:(?:where|is|has)\s*\(/.exec(comp.text.slice(i));'
step "G6  descendant compounds stay in the subject chain"      kill "$GATE" 'if (!inChain) break;' 'if (false) break;'
step "G7  an escaped comma splits the compound again"          kill "$GATE" "    if (c === '\\\\' && i + 1 < prelude.length) {" "    if (false) {"

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
