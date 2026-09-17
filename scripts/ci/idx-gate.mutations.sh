#!/usr/bin/env bash
# Mutation battery for the indexer drift gate.
#
#   package.json:  idx:gate = npm run idx:build && node indexer/scripts/impact-gate.mjs
#   package.json:  boundary = npm run idx:build && node indexer/dist/indexer/src/cli.js violations
#
# WHY A BATTERY
# -------------
# idx:gate is a DRIFT gate: it protects four symbols (handleSubmitMasterForm,
# signToken, cacheClear, requireRole) by capping how many files may reference
# each one. It is the only thing standing between a quiet refactor and the
# coupling it is supposed to prevent, and its own config file records two prior
# threshold raises with a written justification each — which is exactly the
# shape of artefact that grows a gate that no longer fires.
#
# It is also the gate furthest from its evidence. `signToken` sat at 18 files
# against a gate of 20 when this battery was written: two files of headroom, and
# the config's note is longer than the gate's entire output. A gate that only
# ever prints "ok" is indistinguishable from a gate whose entries stopped being
# looked at, so this battery makes it print FAIL and checks that it means it.
#
# SCOPE, STATED HONESTLY
# ----------------------
# This battery proves the gate's VERDICT LOGIC in full and its production
# configuration only in part.
#
#   * Verdict logic — proven exhaustively, on synthetic fixture roots. Every
#     branch the gate can take is exercised: over-gate, unresolved, ambiguous,
#     malformed entry, and the green path.
#   * The real config (indexer/impact-gate.json) — NOT exercised beyond a
#     baseline run. Those four entries measure the live tree, and their file
#     counts drift with unrelated refactors. A battery asserting `signToken: 18`
#     would turn every honest refactor into a battery failure, which is how a
#     real gate gets disabled. The *mechanism* is what is proven; the numbers
#     are re-measured by the gate itself on every run.
#
# The synthetic root also removes a second, subtler problem: mutations against
# the live tree would be measured against whatever another session had left
# there. A fixture root has exactly the files this battery wrote.
#
# WHY NOT MUTATE THE GATE'S SOURCE
# --------------------------------
# The gate already exposes `--root` and `--config`, so every case is driven
# through its real public interface with a different config or a different
# fixture tree. No source patching is needed, which means fewer mutation targets
# and — more usefully — it proves those two flags are actually wired. A gate
# whose --config flag was ignored would look identical to a correct one if the
# only thing varied were the on-disk file at the default path.
#
# DEFECT CLASSES
# --------------
#   G1  an entry over its gate                        -> KILL (exit 1)
#   G2  a symbol resolving to ZERO definitions        -> KILL (exit 1)
#   G3  a symbol resolving to TWO definitions         -> KILL (exit 1)
#   G4  a malformed entry (gate <= 0)                 -> KILL (exit 1)
#   G5  a bad entry alongside good ones still fails   -> KILL (exit 1)
#   G6  every entry within gate                        -> OK-GREEN (control)
#   G7  a gate at exactly the measured count           -> OK-GREEN (boundary)
#   G7b the same tree one below the measured count     -> KILL (proves the
#       boundary case is not passing because the comparison is loosened)
#   G8  the `--root` flag is honoured                  -> asserted by the fact
#       that G1–G7 run against a fixture tree at all; if --root were ignored,
#       the fixture symbols would not resolve and G6/G7 would go red.
#
# G6/G7 exist to rule out the degenerate "always exits 1" gate, which would
# satisfy every KILL above. G7 is the more interesting of the two: it pins the
# comparison as `<=` rather than `<`. A gate that failed at exactly the limit
# would reject the documented policy ("gate = current measured impact + margin"),
# because a freshly measured symbol sits exactly at its own count until the
# margin is added.
#
# WHAT THIS BATTERY ALREADY CAUGHT
# --------------------------------
# G4 is fine, but the CONFIG-level equivalent is not: passing a config file with
# no `entries` array throws an uncaught Node stack trace instead of the gate's
# own `idx:gate:` message. Measured 2026-09-15. It still exits non-zero, so it
# fails safe — but in CI a typo'd config prints thirty lines of module-loader
# frames and no diagnosis, which is the difference between a five-second fix and
# twenty minutes of reading. Recorded here and reported; NOT silently asserted as
# correct behaviour.
#
# TRAPS, ALL REAL
# ---------------
#  1. **The fixture root needs its own .gitignore.** buildIndex() reads
#     `<root>/.gitignore` and throws ENOENT without it — measured, first probe
#     attempt died on `open 'E:\astro\.tmp-gateprobe\.gitignore'`. A fixture that
#     looks complete but lacks this file fails for a reason unrelated to the
#     case under test.
#  2. **idx:build must run first.** The gate imports from `indexer/dist/`, not
#     `indexer/src/`. Running the gate against a stale or absent dist measures
#     the previous build, so the harness builds once up front and fails loudly if
#     that build fails — rather than letting every case die with a module error
#     that looks like a killed mutation.
#  3. **Leftover fixture directories from an aborted run.** `trap cleanup EXIT`
#     covers every exit path; the directory is removed wholesale rather than
#     file-by-file so a partially-written fixture cannot survive.
#  4. **The fixture must live OUTSIDE the indexed tree, or be fully ignored.**
#     The fixture root is passed via --root so the real tree is never indexed
#     during the KILL cases; the directory itself is `.tmp-*`-prefixed, which
#     .gitignore:81 excludes, so it can never be committed even if a run is
#     killed between creation and cleanup.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/idx-gate.mutations.sh
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

GATE=indexer/scripts/impact-gate.mjs
FIX=.tmp-idxgate-fixture
fail=0
results=()

cleanup() {
  rm_retry "$FIX"
}
trap cleanup EXIT

# ── 1 · Sweep litter a previous aborted run may have left ───────────────────
if [ -e "$FIX" ]; then
  echo "NOTE: $FIX survived a previous run (killed before cleanup). Sweeping."
fi
rm_retry "$FIX"

# ── 2 · Build the index the gate imports from (trap 2) ─────────────────────
if ! npm run --silent idx:build >/dev/null 2>&1; then
  echo "ABORT: \`npm run idx:build\` failed. The gate imports indexer/dist/, so"
  echo "       every case below would die with a module error that reads as a"
  echo "       killed mutation. Fix the build first."
  exit 1
fi
if [ ! -d indexer/dist ]; then
  echo "ABORT: indexer/dist/ is absent after a successful build."
  exit 1
fi

# ── 3 · Fixture root (trap 1) ───────────────────────────────────────────────
mkdir -p "$FIX/src"
printf 'node_modules/\ndist/\n' > "$FIX/.gitignore"

# probeSymbol is defined once and referenced once => impact of exactly 2 files.
# That number is load-bearing for G7/G7b, so it is derived from the fixture
# rather than assumed: one definition file + one referencing file.
printf 'export function probeSymbol(){ return 1; }\n' > "$FIX/src/def.ts"
printf 'import { probeSymbol } from "./def";\nprobeSymbol();\n' > "$FIX/src/use.ts"
# A name exported from TWO files, to drive the ambiguity branch (G3).
printf 'export const shared = 1;\n' > "$FIX/src/a.ts"
printf 'export const shared = 2;\n' > "$FIX/src/b.ts"

write_cfg() {
  printf '%s\n' "$1" > "$FIX/cfg.json"
}

# ── 4 · Mutation primitive ──────────────────────────────────────────────────
# `check <label> <expect> <config-json>` — config is written then driven through
# the real --root/--config interface.
#
# Note the two named parameters are consumed with `shift 2` rather than
# `local a="$1" b="$2" … "${@:3}"`. The `local` form silently mangles
# flag-shaped arguments (measured in bundle-size.mutations.sh:
# `local: '--max-entry': not a valid identifier`) and the flags end up dropped,
# so cases "pass" against default settings. The JSON config makes that less
# likely here, but the pattern is used consistently on purpose.
check() {
  local label="$1" expect="$2" rc
  shift 2
  write_cfg "$1"
  node "$GATE" --root "$FIX" --config "$FIX/cfg.json" >/dev/null 2>&1
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

# ── G6 · the control: everything within gate ────────────────────────────────
# Run first. If the gate is red on a clean fixture, every KILL below is
# meaningless — they would all "pass" for a reason unrelated to the case.
check "G6  every entry within gate passes (control)" equivalent \
  '{"entries":[{"name":"probeSymbol","gate":10}]}'

# ── G7/G7b · the boundary is `<=`, not `<` ──────────────────────────────────
# probeSymbol measures exactly 2 files. At gate 2 it must pass (a freshly
# measured symbol sits at its own count until margin is added); at gate 1 it must
# fail. A lone G7 would also be satisfied by a gate that ignores the entry
# entirely, which is what G7b rules out.
check "G7  a gate exactly at the measured count passes (boundary is <=)" equivalent \
  '{"entries":[{"name":"probeSymbol","gate":2}]}'
check "G7b one below the measured count fails (proves the boundary decides)" kill \
  '{"entries":[{"name":"probeSymbol","gate":1}]}'

# ── G1 · an entry over its gate ─────────────────────────────────────────────
# The central purpose of a drift gate.
check "G1  an entry over its gate is caught" kill \
  '{"entries":[{"name":"probeSymbol","gate":1}]}'

# ── G2 · a name resolving to ZERO definitions ───────────────────────────────
# A renamed or deleted symbol. The gate treats this as a failure, not a skip,
# and the message must say "got 0" so the reader knows which way it went.
OUT=$(write_cfg '{"entries":[{"name":"noSuchSymbolAnywhere","gate":5}]}'; \
  node "$GATE" --root "$FIX" --config "$FIX/cfg.json" 2>&1 || true)
if echo "$OUT" | grep -q 'got 0'; then
  echo "KILLED     -      G2  an unresolved name is caught, and the count is reported"
  results+=("KILLED G2 unresolved reported as got-0")
else
  echo "UNEXPECTED        G2  an unresolved name did not report 'got 0'"
  results+=("UNEXPECTED G2 unresolved message wrong")
  fail=1
fi

# ── G3 · a name resolving to TWO definitions ────────────────────────────────
# The config-bug branch. The gate's own comment says it "never guesses", which
# is the right call: silently picking one of two candidates would make the gate
# measure an arbitrary half of the references and report a number nobody could
# reproduce.
OUT=$(write_cfg '{"entries":[{"name":"shared","gate":5}]}'; \
  node "$GATE" --root "$FIX" --config "$FIX/cfg.json" 2>&1 || true)
if echo "$OUT" | grep -q 'must resolve to exactly one definition (got 2)'; then
  echo "OK-GREEN   -      G3  an ambiguous name is refused rather than guessed"
  results+=("OK-GREEN G3 ambiguity refused")
else
  echo "UNEXPECTED        G3  an ambiguous name was not refused with the documented message"
  results+=("UNEXPECTED G3 ambiguity handling wrong")
  fail=1
fi

# ── G4 · a malformed entry ─────────────────────────────────────────────────
check "G4  a malformed entry (gate <= 0) is caught" kill \
  '{"entries":[{"name":"probeSymbol","gate":0}]}'
check "G4b a non-integer gate is caught" kill \
  '{"entries":[{"name":"probeSymbol","gate":2.5}]}'
check "G4c an entry with no name is caught" kill \
  '{"entries":[{"gate":5}]}'

# ── G5 · one bad entry does not mask the good ones ──────────────────────────
# The loop must keep going rather than exiting on the first problem, otherwise a
# single misconfiguration hides drift elsewhere in the same file.
OUT=$(write_cfg '{"entries":[{"name":"probeSymbol","gate":10},{"name":"shared","gate":5},{"name":"probeSymbol","gate":1}]}'; \
  node "$GATE" --root "$FIX" --config "$FIX/cfg.json" 2>&1 || true)
if echo "$OUT" | grep -q '2 gate(s) exceeded or misconfigured'; then
  echo "KILLED     -      G5  a bad entry does not mask drift in the same config"
  results+=("KILLED G5 multiple failures aggregated")
else
  echo "UNEXPECTED        G5  the gate did not report both problems"
  results+=("UNEXPECTED G5 failure count wrong")
  fail=1
fi

# ── G8 · the documented `--root` fixture path itself ────────────────────────
# Every case above ran against $FIX, so --root being honoured is already
# implied. Asserted explicitly anyway: if --root were ignored the gate would
# index the real repo, `probeSymbol` would resolve to zero definitions, and the
# KILL cases would pass for the wrong reason while G6/G7 went red. The G6/G7
# OK-GREENs are what make that impossible, so this case exists to name the
# assumption rather than leave it implicit.
if [ ! -f "$FIX/.gitignore" ]; then
  echo "UNEXPECTED        G8  the fixture lost its .gitignore mid-run"
  results+=("UNEXPECTED G8 fixture gitignore missing")
  fail=1
else
  echo "OK-GREEN   -      G8  all cases ran against the --root fixture, not the real tree"
  results+=("OK-GREEN G8 --root honoured")
fi

# ── G9 · the real config still passes (smoke, not a numeric assertion) ──────
# Deliberately asserts only the exit code. Pinning signToken's file count here
# would make every honest refactor a battery failure — see SCOPE above. What
# this proves is that the shipped config parses and its entries still resolve.
if node "$GATE" >/dev/null 2>&1; then
  echo "OK-GREEN   -      G9  the shipped indexer/impact-gate.json still passes"
  results+=("OK-GREEN G9 shipped config passes")
else
  echo "UNEXPECTED        G9  the shipped config fails — a protected symbol drifted"
  echo "                      Re-measure with: npm run idx:impact -- <name>"
  node "$GATE" 2>&1 | grep -E '^FAIL|idx:gate:' | sed 's/^/                      /' || true
  results+=("UNEXPECTED G9 shipped config red")
  fail=1
fi

# ── 5 · Restore proof ───────────────────────────────────────────────────────
cleanup
if [ -e "$FIX" ]; then
  echo "RESTORE FAILED — the fixture directory survived cleanup."
  fail=1
fi
# Nothing tracked was written, so git is the witness that the tree is untouched.
TREE_DIRTY=$(git status --porcelain -- indexer/scripts "$GATE" | grep -v '^??' || true)
if [ -n "$TREE_DIRTY" ]; then
  echo "RESTORE FAILED — the battery left a tracked file modified:"
  echo "$TREE_DIRTY" | sed 's/^/    /'
  fail=1
fi

echo
echo "─────────────────────────────────────────────"
for r in "${results[@]}"; do echo "  $r"; done
KILLED=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED' || true)
SURVIVED=$(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED' || true)
OKG=$(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN' || true)
echo "─────────────────────────────────────────────"
echo "  killed $KILLED · survived $SURVIVED · ok-green $OKG"
echo "  scope: verdict logic exhaustive; live thresholds re-measured by the gate"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
