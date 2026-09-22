#!/usr/bin/env bash
# Mutation battery for scripts/ci/fetch-boundary.mjs (npm run verify:fetch-boundary).
#
# WHY THIS GATE
# -------------
# fetch-boundary.mjs enforces the frontend half of an invariant the backend half
# has had since 2026-09-11: outbound calls go through the sanctioned client.
# Measured 2026-09-17, the frontend had 30 raw `fetch(getEndpoint(...))` sites in
# 18 files, and six of them carried a comment explaining why THAT one was
# exempt. One of those comments was false — CandidateProfileModal deferred its
# conversion because "apiClient has no `signal` option", an option that had
# always existed. Nothing could see that, because nothing looked. This gate
# makes the converted state hold.
#
# WHAT EACH MUTATION RE-INTRODUCES
# --------------------------------
#   S1  a NEW file with a raw fetch()            -> "not in allow-list"
#   S2  one extra fetch() in an allow-listed file -> "exceeds its max bound"
#   S3  the real apiClient call renamed           -> "client no longer calls fetch"
#   S4  an allow-listed path renamed/removed      -> "exists check" catches the
#                                                    silent coverage shrink
#
# S2 targets an allow-listed file ON PURPOSE. Every entry in ALLOWED sits exactly
# at its `max`, so the bound is the only thing between today's tree and a seventh
# tolerated bypass. A battery that never pushes past a bound does not test it.
#
# S3 IS THE REGRESSION TEST FOR A REAL HOLE, copied deliberately from
# io-boundary.mutations.sh. That gate's wrapper check used to be
# `includes('fetch(')`, which the file's OWN COMMENTS satisfied, so renaming the
# real call left it GREEN. fetch-boundary.mjs has the same exposure in principle:
# its header prose mentions `fetch(` on many lines. S3 fails only if the check
# counts real call sites, so it is the proof that this gate is not quoting
# itself.
#
# S4 covers the failure mode unique to an ALLOW-LIST: a rename makes an entry
# stop matching, and for a path that no longer exists nothing else would notice.
# Coverage would shrink with every other mutation still green.
#
# OUTCOMES THAT ARE NOT FAILURES
# ------------------------------
# **E1 — a new file routing through apiClient must be accepted.** The point is
# that src/ keeps growing; if E1 ever fails, the gate is rejecting valid code and
# every new component will fight it.
#
# Must be run with cwd = repo root:  bash scripts/ci/fetch-boundary.mutations.sh
set -u

# ── Transient-delete hardening ──────────────────────────────────────────────
# See scripts/ci/lib/rm-retry.sh for the measurement: a delete can return rc=1
# with the path correct and the file still present, and one leftover fixture
# once turned into twelve red gates.
RM_RETRY_LIB="$(dirname "${BASH_SOURCE[0]}")/lib/rm-retry.sh"
[ -f "$RM_RETRY_LIB" ] || { echo "FATAL — missing $RM_RETRY_LIB; the batteries are not runnable without it"; exit 2; }
. "$RM_RETRY_LIB"

GATE=scripts/ci/fetch-boundary.mjs
SRC=src
CLIENT="$SRC/lib/apiClient.ts"                  # the sanctioned client, allow-listed max 2
PUBLICDATA="$SRC/lib/publicData.ts"            # allow-listed max 1 — the bound test
BAK=.tmp-fbmut
fail=0
results=()

F_RAW="$SRC/__fbmut-rawfetch.ts"
F_CLEAN="$SRC/__fbmut-clean.ts"

ALL_MUTANTS=("$F_RAW" "$F_CLEAN")

cleanup() {
  rm_retry "${ALL_MUTANTS[@]}"
  rm_retry "$BAK"
}

# Restore every file this battery edits. Called at the start (RULE 0) and by the
# EXIT trap, so an interrupted run cannot leave a mutant in a live source tree.
restore() {
  [ -f "$BAK/gate" ] && cp "$BAK/gate" "$GATE"
  [ -f "$BAK/client" ] && cp "$BAK/client" "$CLIENT"
  [ -f "$BAK/publicdata" ] && cp "$BAK/publicdata" "$PUBLICDATA"
  return 0
}

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

# IMPORTANT: never pipe the gate into another command here. `node "$GATE" | tail`
# makes `$?` report tail's exit code, so every mutation would read as KILLED and
# the battery would certify coverage it does not have. Redirect to /dev/null only.
check() {
  local label="$1" expect="$2" rc
  node "$GATE" >/dev/null 2>&1
  rc=$?
  if [ "$expect" = kill ]; then
    if [ "$rc" -ne 0 ]; then
      echo "KILLED     exit=$rc  $label"
      results+=("KILLED $label")
    else
      echo "SURVIVED   exit=0   $label   <-- HOLE: this bypass class is not covered"
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

trap 'restore; cleanup' EXIT

# ── RULE 0: start from a known-clean tree ───────────────────────────────────
# This battery creates files in a live source directory AND edits real source
# files. An interrupted run leaves mutants behind, which then makes the next
# run's BASELINE red — the right verdict, but a confusing one, because the gate
# looks broken when it is the harness that is dirty.
cleanup
restore
mkdir -p "$BAK"
cp "$GATE" "$BAK/gate"
cp "$CLIENT" "$BAK/client"
cp "$PUBLICDATA" "$BAK/publicdata"

# ── RULE 1: never interpret mutations against an already-red baseline ────────
if ! node "$GATE" >/dev/null 2>&1; then
  echo "BASELINE RED — the gate fails on an unmutated tree. Aborting: mutations cannot be interpreted."
  node "$GATE" || true
  exit 1
fi
echo "baseline green"

# ── S1 · a new component calling fetch() against a function ────────────────
# The realistic shape: someone adds a component and reaches for the global fetch,
# which is exactly how the 30 sites accumulated one at a time.
cat > "$F_RAW" <<'EOF'
import { getEndpoint } from './lib/apiEndpoint';

export async function __fbmutLoad(wa: string) {
  const res = await fetch(getEndpoint('getExistingCandidateJsonByWa'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getExistingCandidateJsonByWa', args: [wa] }),
  });
  return res.json();
}
EOF
check "S1  new file with a raw fetch() (not in allow-list)" kill
rm_retry "$F_RAW"

# ── S2 · one extra fetch() in an allow-listed file ─────────────────────────
# publicData.ts is allowed exactly 1 site and currently has exactly 1, so this
# takes it to 2 and must cross the bound.
printf '\nconst __fbmutExtra = fetch("/.netlify/functions/health");\n' >> "$PUBLICDATA"
check "S2  allow-listed file pushed past its max bound" kill
cp "$BAK/publicdata" "$PUBLICDATA"

# ── S3 · the client implementation moved ───────────────────────────────────
# The comments that would satisfy an `includes('fetch(')` check are left intact
# (this gate's own header mentions fetch() many times), so this fails ONLY if the
# check counts real call sites.
mut "$CLIENT" 'let res = await fetch(endpoint, opts(controller.signal));' \
              'let res = await fetchViaClient(endpoint, opts(controller.signal));'
check "S3  real client call renamed (comments still say fetch)" kill
cp "$BAK/client" "$CLIENT"

# ── S4 · an allow-listed path no longer exists ─────────────────────────────
# An allow-list is the one place a rename is invisible: the entry stops matching
# and nothing else notices, so coverage shrinks silently.
mut "$GATE" "'src/lib/publicData.ts': {" "'src/lib/__fbmut-renamed-publicData.ts': {"
check "S4  allow-listed path renamed (silent coverage shrink)" kill
cp "$BAK/gate" "$GATE"

# ── E1 · a new file routing through apiClient ──────────────────────────────
cat > "$F_CLEAN" <<'EOF'
import { apiClient } from './lib/apiClient';

export async function __fbmutLoad(wa: string) {
  return apiClient('getExistingCandidateJsonByWa', [wa], { requireAuth: false });
}
EOF
check "E1  new file routing through apiClient is accepted" equivalent
rm_retry "$F_CLEAN"

# ── G: the gate's own machinery ─────────────────────────────────────────────
# Forcing the not-allowed branch proves the verdict path actually reaches exit 1.
mut "$GATE" 'if (!allow) {' 'if (true) {'
check "G1  not-allowed branch forced (proves exit 1 is reachable)" kill
cp "$BAK/gate" "$GATE"

# Widening the comparison to >= flags every file sitting exactly at its bound.
# That proves the bound is exact — an off-by-one here would redden the gate on a
# clean tree, and every allow-listed entry would look like a new bypass.
mut "$GATE" '} else if (hits.length > allow.max) {' '} else if (hits.length >= allow.max) {'
check "G2  bound comparison widened to >= (proves it is exact)" kill
cp "$BAK/gate" "$GATE"

# The comment-skip is what stops this gate from counting DOCUMENTATION as code.
# `src/lib/apiEndpoint.ts` line 9 is a doc comment containing the usage example
# `fetch(getEndpoint('loginKandidat'), { ... })` — a phantom call site. With the
# skip disabled the gate counts it, that file is not allow-listed, and the gate
# SHOULD fail. So `kill` is the correct expectation here, and this is the
# regression test for the class of defect io-boundary.mjs actually shipped once
# (its wrapper guard used to be satisfied by its own comments).
#
# Verified against the tree before writing the expectation: apiEndpoint.ts is the
# ONLY file whose comment mention changes its count (measured: withSkip=0,
# noSkip=1). Every other file is comment-clean, so this mutation has exactly one
# supported trigger rather than an incidental one.
mut "$GATE" '  return trimmed.startsWith('"'"'*'"'"') || trimmed.startsWith('"'"'//'"'"') || trimmed.startsWith('"'"'/*'"'"');' \
            '  return false;'
check "G3  comment-skip disabled (must fail: counts a doc-comment example as a call)" kill
cp "$BAK/gate" "$GATE"

# ── RULE 3: nothing left behind, byte-identical restore, green again ────────
echo
for f in "${ALL_MUTANTS[@]}"; do
  if [ -e "$f" ]; then
    echo "LEFTOVER — $f survived the run"
    fail=1
  fi
done
for pair in "gate:$GATE" "client:$CLIENT" "publicdata:$PUBLICDATA"; do
  if ! diff -q "$BAK/${pair%%:*}" "${pair#*:}" >/dev/null; then
    echo "RESTORE FAILED — ${pair#*:} is not byte-identical to its backup"
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
exit "$fail"
