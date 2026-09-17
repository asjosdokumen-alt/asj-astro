#!/usr/bin/env bash
# Mutation battery for the architecture-boundary gate.
#
#   package.json:  boundary = npm run idx:build && node indexer/dist/indexer/src/cli.js violations
#
# WHY A BATTERY
# -------------
# This gate is the executable form of §3.2 of the design: kernel/ must never
# depend on contexts/ or surfaces/, and contexts/ must not reach into each
# other. Those rules are the entire reason the layered backend can be reasoned
# about at all — once kernel imports a context, "kernel knows nothing about
# features" stops being true and every later argument built on it is void.
#
# The gate is quiet by design. On a healthy tree it prints one line and exits 0,
# which means there is nothing in a normal day's work that distinguishes it from
# a gate that has silently stopped evaluating rules. That is what this battery
# addresses.
#
# THE ONE BEHAVIOUR WORTH THE MOST ATTENTION
# ------------------------------------------
# `violations` exits 1 when `view.errors > 0` — and NOT when warnings exist.
# `.dependency-cruiser.cjs` mixes severities on purpose (`contexts-no-raw-db` is
# `warn`). So the gate has a genuinely two-sided contract:
#
#   * an `error`-severity rule must FAIL the build
#   * a `warn`-severity rule must PRINT and NOT fail
#
# Only one of those is obvious. A gate that failed on any violation would make
# the warn rule unshippable and would train people to delete it; a gate that
# ignored severity entirely would silently demote the kernel rule. Both
# directions are asserted below (B1/B1b and B2/B2b), because either alone is
# satisfiable by a broken gate.
#
# SCOPE, STATED HONESTLY
# ----------------------
# Verdict logic is proven exhaustively on fixture roots. The rule SET the repo
# actually ships is covered by `indexer/src/boundary.test.ts`, which pins all 6
# ported rules and asserts a depcruise oracle of 0 violations on this tree — that
# is where the rules themselves belong, and duplicating it here would create a
# second place to update. What is NOT covered there is the CLI exit code, which
# is what `npm run boundary` and `ci:quality` consume. That is what this file
# owns.
#
# WHY NOT MUTATE THE GATE'S SOURCE
# --------------------------------
# `violations` honours `--root`, and loadForbidRules() reads
# `<root>/.dependency-cruiser.cjs`. So each case is a small fixture tree with its
# own config and its own offending import. No source patching is needed, the
# real tree is never indexed during a KILL case, and the fixture is fully
# described by this script.
#
# DEFECT CLASSES
# --------------
#   B1  an error-severity violation                     -> KILL (exit 1)
#   B1b the same fixture with the rule demoted to warn  -> OK-GREEN (exit 0)
#       B1/B1b together prove the exit code tracks SEVERITY, not the mere
#       presence of a violation.
#   B2  a warn-severity violation                       -> OK-GREEN (exit 0)
#   B2b the same fixture with the rule raised to error  -> KILL (exit 1)
#       B2/B2b is the same pair read the other way round.
#   B3  a clean fixture                                  -> OK-GREEN (control)
#   B4  the config file absent                           -> KILL (exit 1)
#       The rules ARE the config; with no config there is nothing to evaluate,
#       and "no violations found" would be a vacuous pass over an empty rule set.
#   B5  the cross-context rule specifically              -> KILL (exit 1)
#       Distinct from B1: a different rule, a different direction, and the one
#       whose pathNot exemption (the owner barrel) is easiest to break.
#   B6  the owner-barrel exemption still works            -> OK-GREEN (exit 0)
#       contexts/X/index.ts importing contexts/X/service.ts is ALLOWED — that is
#       the owner's public interface. Asserting it stops B5's fix from being
#       "ban all cross-context paths", which would break the pattern the rule
#       exists to encourage.
#
# B3 rules out the degenerate "always exits 1" gate, which would satisfy every
# KILL above. B1b/B2/B2b rule out the degenerate "always exits 0" one.
#
# TRAPS, ALL REAL
# ---------------
#  1. **idx:build must run first.** The gate is `node indexer/dist/…/cli.js`,
#     not indexer/src/. Running against a stale dist measures the previous build,
#     so the harness builds once up front and aborts loudly if that fails rather
#     than letting every case die with a module error that reads as a killed
#     mutation. Same trap as idx-gate.mutations.sh.
#  2. **The fixture needs its own .dependency-cruiser.cjs.** The rules come from
#     `<root>/.dependency-cruiser.cjs`, so a fixture without one tests the
#     missing-config path (B4), not the case intended. The config is copied from
#     the repo so the fixture exercises the SHIPPED rules, and edited per case;
#     the repo's own copy is never written to.
#  3. **Import paths must be relative and correctly dotted.** An import that does
#     not resolve produces no edge and therefore no violation, so a typo'd
#     fixture passes every KILL case while looking correct. B3 is the guard: a
#     clean fixture must be green, and each KILL case was confirmed red by hand
#     before being written here.
#  4. **Leftover fixture directories from an aborted run.** `trap cleanup EXIT`
#     covers every exit path and the directory is removed wholesale, so a
#     partially-written fixture cannot survive into the next run.
#  5. **The fixture must not be committable.** It is `.tmp-*`-prefixed, which
#     .gitignore:81 excludes.
#  6. **`OUT=$(cmd 2>&1 || true); RC=$?` DOES NOT CAPTURE THE EXIT CODE.** The
#     `|| true` makes `$?` report the `true`. Measured 2026-09-15:
#     `after-(|| true): RC=0` against a process that really exited 7 — so an
#     assertion reading RC was structurally incapable of failing. It is the same
#     defect family as `"${arr[@]:-}"` manufacturing a phantom argument and
#     `local x="${@:3}"` silently dropping flags: a shell construct that changes
#     what is being measured while looking like defensive style. Capture the code
#     bare; `set -u` does not abort on a non-zero exit, so nothing needs guarding.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/boundary.mutations.sh
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

CLI=indexer/dist/indexer/src/cli.js
CONFIG=.dependency-cruiser.cjs
FIX=.tmp-boundary-fixture
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

# ── 2 · Build (trap 1) ──────────────────────────────────────────────────────
if ! npm run --silent idx:build >/dev/null 2>&1; then
  echo "ABORT: \`npm run idx:build\` failed. The gate runs indexer/dist/, so every"
  echo "       case below would die with a module error that reads as a killed"
  echo "       mutation. Fix the build first."
  exit 1
fi
if [ ! -f "$CLI" ]; then
  echo "ABORT: $CLI is absent after a successful build."
  exit 1
fi

# ── 3 · Fixture skeleton (traps 2, 3, 5) ────────────────────────────────────
mkdir -p "$FIX/netlify/functions/_lib/kernel" \
         "$FIX/netlify/functions/_lib/db" \
         "$FIX/netlify/functions/contexts/catalog" \
         "$FIX/netlify/functions/contexts/identity"
printf 'node_modules/\ndist/\n' > "$FIX/.gitignore"

# The two leaf modules the violations point at. Written once; each case
# rewrites only the importing file.
printf 'export const ctxValue = 1;\n' > "$FIX/netlify/functions/contexts/catalog/service.ts"
printf 'export const ctxValue = 1;\n' > "$FIX/netlify/functions/contexts/identity/service.ts"
printf 'export const dbClient = 1;\n'    > "$FIX/netlify/functions/_lib/db/client.ts"
printf 'export const kernelValue = 1;\n'> "$FIX/netlify/functions/_lib/kernel/k.ts"

# Reset the importer files to a clean state before each case.
reset_importers() {
  printf 'export const kernelValue = 1;\n' > "$FIX/netlify/functions/_lib/kernel/k.ts"
  printf 'export const ctxValue = 1;\n'    > "$FIX/netlify/functions/contexts/catalog/service.ts"
  printf 'export const ctxValue = 1;\n'    > "$FIX/netlify/functions/contexts/identity/service.ts"
}

# Install the shipped config, then optionally flip one rule's severity.
# `$1` = rule name to flip (empty = no flip), `$2` = new severity.
# Both are read with explicit defaults: under `set -u` a bare `$1` on a
# no-argument call aborts the whole battery with `$1: unbound variable`, which
# is what happened on the first run of this file.
install_config() {
  local rule="${1:-}" sev="${2:-}"
  if [ -z "$rule" ]; then
    cp "$CONFIG" "$FIX/$CONFIG"
    return
  fi
  RULE="$rule" SEV="$sev" node -e "
    const fs=require('fs');
    const m=require(process.cwd()+'/$CONFIG');
    const r=m.forbidden.find(x=>x.name===process.env.RULE);
    if(!r){ console.error('ABORT: no rule named '+process.env.RULE); process.exit(1); }
    r.severity=process.env.SEV;
    fs.writeFileSync('$FIX/.dependency-cruiser.cjs', 'module.exports = '+JSON.stringify(m,null,2)+';\n');
  " || { echo "ABORT: could not install fixture config for rule $rule"; exit 1; }
}

# ── 4 · Mutation primitive ──────────────────────────────────────────────────
# `check <label> <expect>` — the caller prepares the fixture immediately before
# calling, so the table reads top to bottom as "set up this shape, assert the
# verdict".
#
# Two named parameters are consumed with `shift 2` rather than `local a="$1"
# … "${@:3}"`. The `local` form silently mangles flag-shaped arguments —
# measured in bundle-size.mutations.sh as `local: '--max-entry': not a valid
# identifier` — and every case then runs against default settings.
#
# `shift 2` leaves "$@" empty for the no-flag case, and under `set -u` an empty
# "$@" is fine (it is `"$1"` that would be unbound) — but the earlier version of
# this file read `$1` anyway, which is what `$1: unbound variable` was reporting.
check() {
  local label="$1" expect="$2" rc
  shift 2
  node "$CLI" violations --root "$FIX" >/dev/null 2>&1
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

# ── B3 · the control ────────────────────────────────────────────────────────
# Run first: a gate that is red on a clean fixture makes every KILL below
# meaningless.
reset_importers
install_config ""
check "B3  a clean fixture passes (control)" equivalent

# ── B1/B1b · an ERROR-severity violation, and the same rule demoted ─────────
# kernel/ importing contexts/ — the §3.2 rule the layering rests on.
reset_importers
printf 'import { ctxValue } from "../../contexts/catalog/service";\nexport const k = ctxValue;\n' \
  > "$FIX/netlify/functions/_lib/kernel/k.ts"
install_config ""
check "B1  an error-severity boundary violation is caught" kill

# Same offending import; only the severity changes. If B1 passes and B1b fails,
# the exit code is tracking the violation's presence rather than its severity.
install_config kernel-no-context-or-surface warn
check "B1b the SAME violation demoted to warn passes (proves severity decides)" equivalent

# ── B2/B2b · a WARN-severity violation, and the same rule raised ────────────
# contexts/ service importing db/client.ts directly. Ships as `warn`.
reset_importers
printf 'import { dbClient } from "../../_lib/db/client";\nexport const svc = dbClient;\n' \
  > "$FIX/netlify/functions/contexts/catalog/service.ts"
install_config ""
check "B2  a warn-severity violation prints but does not fail" equivalent

install_config contexts-no-raw-db error
check "B2b the SAME violation raised to error fails (proves severity decides)" kill

# ── B5/B5b · the cross-context rule AND its public-interface exemption ──────
# A different rule in a different direction. Its `pathNot` exemption is the
# subtlest part of the config and it is what makes this pair worth having:
#
#   contexts/catalog/ importing contexts/identity/internal.ts   -> VIOLATION
#   contexts/catalog/ importing contexts/identity/service.ts    -> ALLOWED
#
# `service.ts` is the owner's exported interface, so reaching it is the pattern
# the rule exists to encourage. The FIRST version of this case imported
# service.ts and survived — not because the gate was broken but because the
# fixture picked the one path the rule deliberately permits. Measured
# 2026-09-15; both halves are asserted now so neither can be mistaken for the
# other, and so a future "fix" that bans all cross-context paths is caught.
reset_importers
printf 'export const helper = 1;\n' > "$FIX/netlify/functions/contexts/identity/internal.ts"
printf 'import { helper } from "../identity/internal";\nexport const c = helper;\n' \
  > "$FIX/netlify/functions/contexts/catalog/service.ts"
install_config ""
check "B5  a cross-context import of a non-public path is caught" kill

reset_importers
printf 'import { ctxValue } from "../identity/service";\nexport const c = ctxValue;\n' \
  > "$FIX/netlify/functions/contexts/catalog/service.ts"
install_config ""
check "B5b the same rule ALLOWS reaching another context's service.ts (public interface)" equivalent

# ── B6 · the owner-barrel exemption ─────────────────────────────────────────
# contexts/catalog/ importing its OWN service.ts is the documented pattern, not
# a violation — pathNot allows exactly `[^/]+/(service|repository|index|download).ts`.
# Without this case the natural "fix" for B5 would be to ban cross-context paths
# outright, which would break the owner's public interface.
reset_importers
printf 'import { ctxValue } from "./service";\nexport const c = ctxValue;\n' \
  > "$FIX/netlify/functions/contexts/catalog/index.ts"
install_config ""
check "B6  a context importing its own service is allowed (owner interface)" equivalent
rm_retry "$FIX/netlify/functions/contexts/catalog/index.ts"

# ── B4 · the config absent ──────────────────────────────────────────────────
# The config IS the rules source. With it gone the correct answer is a refusal,
# not "0 violations" — that would be a vacuous pass over an empty rule set, the
# same defect class this session found twice in other gates. Asserted on the
# message as well, because exit 1 for the wrong reason is still wrong.
#
# ONE setup, TWO assertions. The config is removed once and both assertions read
# the same state, for two reasons that were both live bugs in earlier drafts:
#
#   a) The first draft called `install_config ""` between the message check and
#      the exit-code check, which RESTORED the config and made the second
#      assertion run against a healthy fixture — so it survived, reporting a
#      hole that did not exist.
#
#   b) The exit code was read as `OUT=$(node … 2>&1 || true); RC=$?`. That `||
#      true` makes `$?` report the `true`, not the gate: measured 2026-09-15 as
#      `after-(|| true): RC=0` against a process that really exited 7. The
#      construct was copied in to guard against `set -e`, but this script uses
#      `set -u` only, so it guarded nothing and silently disabled the assertion.
#      The `|| true` is gone and the capture is bare; `set -u` does not abort on
#      a non-zero exit, so nothing needs guarding.
reset_importers
rm_retry "$FIX/$CONFIG"
OUT=$(node "$CLI" violations --root "$FIX" 2>&1)
RC=$?
if echo "$OUT" | grep -q 'the config is the rules source'; then
  echo "KILLED     -      B4  a missing config is refused, with the reason named"
  results+=("KILLED B4 missing config refused")
else
  echo "UNEXPECTED        B4  a missing config did not produce the documented refusal"
  results+=("UNEXPECTED B4 missing-config message wrong")
  fail=1
fi
if [ "$RC" -ne 0 ]; then
  echo "KILLED     exit=$RC  B4b the missing-config case exits non-zero"
  results+=("KILLED B4b missing config exit code")
else
  echo "UNEXPECTED exit=0   B4b a missing config exited 0 — a vacuous pass"
  results+=("UNEXPECTED B4b missing config passed")
  fail=1
fi
install_config ""
# ── B7 · the shipped config still evaluates a clean tree ────────────────────
# Smoke only: proves the real config loads and the rule set is non-empty after
# this battery's editing. Pinning "0 violations" is deliberately NOT done here —
# boundary.test.ts owns that assertion with a depcruise oracle, and duplicating
# it would create a second place to update when the rules legitimately change.
if node "$CLI" violations >/dev/null 2>&1; then
  echo "OK-GREEN   -      B7  the shipped tree still passes \`violations\`"
  results+=("OK-GREEN B7 shipped tree passes")
else
  echo "UNEXPECTED        B7  the shipped tree fails \`violations\` — a real regression"
  node "$CLI" violations 2>&1 | tail -5 | sed 's/^/                      /' || true
  results+=("UNEXPECTED B7 shipped tree red")
  fail=1
fi

# ── 5 · Restore proof ───────────────────────────────────────────────────────
cleanup
if [ -e "$FIX" ]; then
  echo "RESTORE FAILED — the fixture directory survived cleanup."
  fail=1
fi
# The repo's own .dependency-cruiser.cjs is copied, never edited, but assert it
# with git anyway: a future edit to install_config() could start writing to it,
# and a backup-to-backup diff would not notice.
TREE_DIRTY=$(git status --porcelain -- "$CONFIG" indexer/src/cli.ts | grep -v '^??' || true)
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
echo "  scope: CLI verdict logic + severity handling; rule set owned by boundary.test.ts"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
