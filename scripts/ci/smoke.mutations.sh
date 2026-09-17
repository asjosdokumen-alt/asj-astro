#!/usr/bin/env bash
# Mutation battery for the post-deploy smoke gate.
#
#   package.json:  smoke = node scripts/ci/smoke-test.mjs --url <url> [--expect …] [--health <path>]
#
# WHY A BATTERY
# -------------
# This is the gate that decides whether a release is live, and its failure triggers
# something no other gate does: deploy-production.yml feeds the result into
# netlify-rollback.mjs, so a verdict here can roll production back. Both directions
# of error are costly and asymmetric:
#
#   * Too strict — a site whose HEALTH_TOKEN is not wired answers 503, the probe
#     is read as "production is broken", and a HEALTHY release is rolled back for
#     a reason that has nothing to do with it. The file's own header calls the
#     rollback button's credibility "the only thing that makes it useful", and a
#     flaky gate spends it.
#
#   * Too lenient — a real dependency failure is downgraded to a warning, the
#     pipeline stays green, and the outage the probe exists to detect ships.
#
# WHAT IS ALREADY COVERED, AND WHAT THIS ADDS
# -------------------------------------------
# `netlify/functions/_lib/smoke-test-health.test.ts` already pins 20 tests,
# including both directions above, by importing `checkUrl` and `classifyHealth`
# and driving them against throwaway local servers. That coverage is real and
# this battery does not duplicate it.
#
# What it does NOT cover is the CLI: the exit code that `ci:quality`, the CI
# smoke job and the deploy workflow actually consume. Those live in `main()`,
# which the test file never reaches — it imports the module specifically so
# `main()` will not run. A regression in the exit-code mapping (a `return` where
# a `process.exit(1)` was, an inverted `failed.length` check) would leave all 20
# tests green and the deploy pipeline blind.
#
# So this battery drives the REAL CLI against a local server and asserts the
# EXIT CODE. It is a different layer of the same gate, and the two are
# complementary rather than redundant — worth saying plainly, because a reader
# who sees 20 tests already passing might reasonably ask why this file exists.
#
# DEFECT CLASSES
# --------------
#   S1  a healthy document with the marker present        -> OK-GREEN (exit 0)
#   S2  HTTP 200 but the marker missing                    -> KILL (exit 1)
#   S3  a non-200 status                                   -> KILL (exit 1)
#   S4  an unreachable host                                -> KILL (exit 1)
#   S5  no --url at all                                    -> KILL (exit 2)
#   S6  --health against a positive verdict                -> OK-GREEN (exit 0)
#   S7  --health 503 + marker body, no token              -> OK-GREEN, WARN only
#       The deliberate asymmetry: a credential problem must not roll back a
#       healthy release.
#   S7b --health 503 WITHOUT the marker, no token          -> KILL (exit 1)
#       Same status, same absent token; only the body differs. Stops S7 being
#       satisfied by a gate that special-cases every 503.
#   S8  --health 503 + marker body, token supplied         -> KILL (exit 1)
#       Same body as S7; only the token differs. Stops the asymmetry from
#       hiding a real outage from the rollback trigger.
#   S9  the document and health checks are BOTH evaluated   -> KILL (exit 1)
#       Guards against a `return` after the first failure, which would hide the
#       second reason for a failed deploy — the operator gets half the story.
#
# S1/S6 rule out a gate that always fails, which would satisfy every KILL above
# and would be catastrophic here (it rolls back production). S7/S8 rule out a
# gate that always passes. Each pair is asserted together on purpose.
#
# HOW THE MUTATIONS WORK
# ----------------------
# A local HTTP server serves whatever document and health response the case
# describes. The gate is invoked exactly as the workflows invoke it — `--url`,
# `--expect`, `--health` — with nothing patched, so the flags are proven wired as
# well as the logic behind them.
#
# TRAPS, ALL REAL
# ---------------
#  1. **The server must be given time to bind, and must be killed.** A fixed
#     `sleep` is racy. The server writes its port to a file and this script waits
#     for that file to be non-empty. The PID is tracked and killed in
#     `trap cleanup EXIT`, so a failing case cannot leave a listener behind.
#
#  2. **The port is chosen by the OS, not hardcoded.** Binding to 0 and reading
#     the port back removes any chance of colliding with a real service — and a
#     collision here would mean this battery silently probes something else and
#     reports a confident verdict about it.
#
#  3. **A retry policy designed for production makes a local case slow.** The
#     gate's own defaults are `retries` with exponential backoff, which is right
#     against a real CDN and wasteful against a socket on the loopback. Every
#     case passes explicit `--retries 1 --timeout 2000`, which also proves those
#     flags are wired.
#
#  4. **`OUT=$(cmd 2>&1 || true); RC=$?` does not capture the exit code** — the
#     `|| true` makes `$?` report the `true` (measured 2026-09-15: RC=0 against a
#     process that really exited 7). Capture bare, then compare.
#
#  5. **`$?` inside an `if ! cmd; then` branch is always 0.** Measured:
#     `if ! false; then RC=$?; …` reports RC=0. Both this and trap 4 are the
#     same defect family as `local x="${@:3}"` dropping flags: a shell construct
#     that changes what is measured while looking like ordinary style.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/smoke.mutations.sh
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

GATE=scripts/ci/smoke-test.mjs
FIX=.tmp-smoke-fixture
fail=0
results=()
SRV_PID=""
PORT=""

# Files that were ALREADY modified before this run started. The restore proof
# below must attribute damage to THIS battery, and a pending edit from another
# uncommitted change (most often `scripts/ci/review-manifest.json`, which records
# the very proof this battery produces) is not damage. Measured 2026-09-15: with
# that edit pending, every battery reported `RESTORE FAILED — the battery left a
# tracked file modified` while the substantive verdict was a clean kill, so a
# correct run looked like a broken one. Snapshot the dirty set up front and only
# flag paths that are dirty NOW and were clean THEN.
PRE_DIRTY=$(git status --porcelain -- "$GATE" scripts/ci 2>/dev/null | grep -v '^??' | awk '{print $NF}' | sort)

cleanup() {
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null
  SRV_PID=""
  rm_retry "$FIX"
}
trap cleanup EXIT

if [ -e "$FIX" ]; then
  echo "NOTE: $FIX survived a previous run (killed before cleanup). Sweeping."
  rm_retry "$FIX"
fi
mkdir -p "$FIX"

if [ ! -f "$GATE" ]; then
  echo "ABORT: $GATE is missing."
  exit 1
fi

# ── 1 · The stand-in site (traps 1, 2) ──────────────────────────────────────
# `mode` selects the document response; `healthMode` selects the /health one.
# Written as a file rather than an inline heredoc per case so the server can be
# started once and the modes switched by rewriting a small JSON file.
cat > "$FIX/server.mjs" <<'EOF'
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';

const [cfgFile, readyFile] = process.argv.slice(2);

const server = createServer((req, res) => {
  let cfg;
  try { cfg = JSON.parse(readFileSync(cfgFile, 'utf8')); } catch { cfg = {}; }

  if (req.url && req.url.startsWith('/health')) {
    const h = cfg.health || { status: 200, body: '{"status":"ok","checks":[]}' };
    res.writeHead(h.status, { 'content-type': 'application/json' });
    res.end(h.body);
    return;
  }

  const doc = cfg.document || { status: 200, body: '<html>Lowongan Loker</html>' };
  res.writeHead(doc.status, { 'content-type': 'text/html' });
  res.end(doc.body);
});

server.listen(0, '127.0.0.1', () => {
  writeFileSync(readyFile, String(server.address().port));
});
EOF

start_server() {
  rm_retry "$FIX/port"
  node "$FIX/server.mjs" "$FIX/cfg.json" "$FIX/port" &
  SRV_PID=$!
  local waited=0
  while [ ! -s "$FIX/port" ]; do
    sleep 0.1
    waited=$((waited + 1))
    if [ "$waited" -gt 100 ]; then
      echo "ABORT: the fixture server did not bind within 10s."
      exit 1
    fi
  done
  PORT=$(cat "$FIX/port")
}

# `set_site <documentStatus> <documentBody> [healthStatus healthBody]`
set_site() {
  local ds="$1" db="$2" hs="${3:-}" hb="${4:-{\"status\":\"ok\",\"checks\":[]}}"
  if [ -n "$hs" ]; then
    node -e "
      const fs=require('node:fs');
      fs.writeFileSync('$FIX/cfg.json', JSON.stringify({
        document: { status: Number('$ds'), body: process.argv[1] },
        health:   { status: Number('$hs'), body: process.argv[2] },
      }));
    " "$db" "$hb"
  else
    node -e "
      const fs=require('node:fs');
      fs.writeFileSync('$FIX/cfg.json', JSON.stringify({
        document: { status: Number('$ds'), body: process.argv[1] },
      }));
    " "$db"
  fi
}

# ── 2 · Mutation primitive (traps 4, 5) ─────────────────────────────────────
# `check <label> <expect> <gate args…>`. The exit code is captured BARE — see
# traps 4 and 5 for the two ways an obvious-looking capture silently yields 0.
check() {
  local label="$1" expect="$2" rc
  shift 2
  node "$GATE" "$@" >/dev/null 2>&1
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

FAST=(--retries 1 --timeout 2000)

# ── S5 · no --url (trap 3 note: this one needs no server) ───────────────────
# A missing argument is a configuration error, not a failed check, so it exits 2
# rather than 1 — the convention the other gates settled on.
check "S5  a missing --url is refused as a config error" kill

start_server

# ── S1 · the control: a healthy document ────────────────────────────────────
set_site 200 '<html>Lowongan Loker</html>'
check "S1  a healthy document with its marker passes (control)" equivalent \
  --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" "${FAST[@]}"

# ── S2 · HTTP 200, marker missing ───────────────────────────────────────────
# The reason the marker assertion exists: a maintenance page is a perfectly
# healthy 200 and proves nothing about the application.
set_site 200 '<html>maintenance</html>'
check "S2  HTTP 200 with the marker missing FAILS" kill \
  --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" "${FAST[@]}"

# ── S3 · a non-200 status ───────────────────────────────────────────────────
set_site 500 'Lowongan Loker'
check "S3  a non-200 status FAILS" kill \
  --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" "${FAST[@]}"

# ── S4 · an unreachable host ────────────────────────────────────────────────
# Port 1 is reserved and never listening.
check "S4  an unreachable host FAILS" kill \
  --url "http://127.0.0.1:1" --expect "Lowongan Loker" "${FAST[@]}"

# ── S6 · --health against a positive verdict ────────────────────────────────
set_site 200 '<html>Lowongan Loker</html>' 200 '{"status":"ok","checks":[{"name":"db","ok":true}]}'
check "S6  a positive health verdict passes" equivalent \
  --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" --health /health "${FAST[@]}"

# ── S7 · the fail-closed 503 whose BODY carries the marker ──────────────────
# The asymmetric case the file's header spends three paragraphs on: a site whose
# HEALTH_TOKEN is not wired answers 503 fail-closed, and that must be read as
# "cannot obtain a verdict", never as "production is broken". Rolling back a
# healthy release over a missing credential spends the rollback button's
# credibility, which is the only thing that makes it worth having.
#
# The body MUST contain the literal phrase the gate matches. classifyHealth()
# keys the warn branch on /HEALTH_TOKEN is not configured/i -- NOT on the bare
# status code. An earlier version of this fixture sent `{"status":"unconfigured"}`,
# which does not match, so the gate correctly classified it as a plain failure
# and S7 reported UNEXPECTED exit=1. The gate was right; the fixture was not.
#
# That also made S8 worthless: a 503 with a token supplied fails whatever the
# body says, so the pair did not actually isolate the token's effect. The three
# cases below now form a chain where each link differs in exactly ONE variable.
set_site 200 '<html>Lowongan Loker</html>' 503 '{"error":"HEALTH_TOKEN is not configured on this site"}'
check "S7  a fail-closed 503 carrying the marker, no token, is a WARNING" equivalent \
  --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" --health /health "${FAST[@]}"

# ── S7b · a 503 that is NOT the fail-closed marker must still FAIL ──────────
# Same status code as S7, same absence of a token. The ONLY difference is the
# body. This is what stops S7 from being satisfiable by a gate that simply
# special-cases every 503 -- the defect class S7 alone would happily accept.
set_site 200 '<html>Lowongan Loker</html>' 503 '{"status":"error","checks":[{"name":"db","ok":false}]}'
check "S7b the SAME 503 without the marker FAILS (proves the marker decides)" kill \
  --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" --health /health "${FAST[@]}"

# ── S8 · the marker-bearing 503 WITH a token supplied ──────────────────────
# Body identical to S7; the only change is that a token was supplied. A gate that
# stopped at the status code would warn here too, and would hide a real outage
# from the rollback trigger.
check "S8  the SAME marker 503 with a token supplied FAILS (proves the token decides)" kill \
  --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" --health /health \
  --health-token dummy-token "${FAST[@]}"

# ── S9 · both checks are evaluated, not just the first ─────────────────────
# With the document broken AND health broken, a short-circuiting `return` after
# the document failure would still exit 1 — so the exit code alone cannot tell
# the two apart. The ASSERTION is on the message: both reasons must be listed, or
# the operator debugging a rolled-back deploy sees half the story.
set_site 500 'maintenance' 503 '{"status":"error","checks":[{"name":"db","ok":false}]}'
OUT=$(node "$GATE" --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" \
  --health /health --health-token dummy-token "${FAST[@]}" 2>&1)
RC=$?
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q 'SMOKE TEST FAILED (2/2 checks)'; then
  echo "KILLED     exit=$RC  S9  both failures are reported, not just the first"
  results+=("KILLED S9 both failures reported")
else
  echo "UNEXPECTED exit=$RC  S9  expected 'SMOKE TEST FAILED (2/2 checks)'"
  echo "                      A short-circuiting failure hides the second reason from"
  echo "                      whoever has to debug the rollback."
  results+=("UNEXPECTED S9 failure reporting incomplete")
  fail=1
fi

# ── S10 · --expect is repeatable ────────────────────────────────────────────
# parseArgs documents repeated markers. Asserted at the CLI level because the
# unit test covers the parser, not the wiring into the document check.
set_site 200 '<html>Lowongan Loker and Asj</html>'
check "S10 multiple --expect markers are all required" equivalent \
  --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" --expect "Asj" "${FAST[@]}"
set_site 200 '<html>Lowongan Loker only</html>'
check "S10b a missing second marker FAILS" kill \
  --url "http://127.0.0.1:$PORT" --expect "Lowongan Loker" --expect "DefinitelyAbsent" "${FAST[@]}"

# ── 3 · Restore proof ───────────────────────────────────────────────────────
cleanup
if [ -e "$FIX" ]; then
  echo "RESTORE FAILED — the fixture directory survived cleanup."
  fail=1
fi
if [ -n "$SRV_PID" ]; then
  echo "NOTE: a fixture server was still running at exit; killing it."
  kill "$SRV_PID" 2>/dev/null
  SRV_PID=""
fi
NOW_DIRTY=$(git status --porcelain -- "$GATE" scripts/ci | grep -v '^??' | awk '{print $NF}' | sort)
NEWLY_DIRTY=$(comm -13 <(printf '%s\n' "$PRE_DIRTY") <(printf '%s\n' "$NOW_DIRTY") | sed '/^$/d')
if [ -n "$NEWLY_DIRTY" ]; then
  echo "RESTORE FAILED — the battery left a tracked file modified:"
  echo "$NEWLY_DIRTY" | sed 's/^/    /'
  fail=1
elif [ -n "$NOW_DIRTY" ]; then
  echo "NOTE: pre-existing modifications are still pending (not caused by this run):"
  echo "$NOW_DIRTY" | sed 's/^/    /'
fi

echo
echo "─────────────────────────────────────────────"
for r in "${results[@]}"; do echo "  $r"; done
KILLED=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED' || true)
SURVIVED=$(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED' || true)
OKG=$(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN' || true)
echo "─────────────────────────────────────────────"
echo "  killed $KILLED · survived $SURVIVED · ok-green $OKG"
echo "  scope: the CLI exit-code contract; checkUrl/classifyHealth are owned by"
echo "         netlify/functions/_lib/smoke-test-health.test.ts (20 tests)"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
