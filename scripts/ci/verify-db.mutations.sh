#!/usr/bin/env bash
# Mutation battery for the database-contract gate.
#
#   package.json:  verify:db = node scripts/ci/verify-migrations.mjs
#
# WHY A BATTERY
# -------------
# This gate answers one question before a deploy: does the live database actually
# have the tables and functions this commit expects? When it does not, PostgREST
# answers 200 with an empty result and the application degrades silently — the
# failure mode is a page that loads and shows nothing, which is far harder to
# notice than an error. So the gate's whole value is in its REFUSALS, and those
# are exactly what nothing tests today.
#
# It is also the gate that most nearly became decorative. `ci:predeploy` used to
# be the only caller and no workflow referenced it, so the contract was checked
# on nobody's deploy path. It now runs in both deploy workflows.
#
# WHY THIS BATTERY CAN BE FULLY OFFLINE — AND WHY verify:rls's CAN TOO
# -------------------------------------------------------------------
# This contrast was written believing only one of the two gates could be made
# offline-provable. The second half was measured on 2026-09-15 and turned out to
# be wrong; it is corrected here rather than quietly dropped, because the
# reasoning is the kind that would otherwise be trusted again.
#
#   * verify:db speaks PostgREST over HTTPS. `SUPABASE_URL` is just a base URL,
#     so a local HTTP server can answer `/rest/v1/` with an OpenAPI document and
#     the gate's ENTIRE decision path runs for real — the same code that runs
#     against production, only with a local origin. That is what this battery
#     does.
#
#   * verify:rls speaks raw Postgres over a TCP socket (`pg`). The old text here
#     claimed "there is no URL shape that lets a local server substitute" — that
#     is false. The gate takes a CONNECTION STRING, and initDbEnv() honours a
#     non-empty SUPABASE_DB_URL already in the environment; the server can be a
#     genuine local PostgreSQL (the devDependency `embedded-postgres` ships real
#     initdb/postgres binaries, measured: 18.4). So the SQL is NOT stubbed, and
#     `verify-rls.mutations.sh` now proves it — with one supporting change to the
#     gate, honouring libpq's PGSSLMODE, because a local cluster has no TLS.
#
# Read that contrast as the rule, which survives intact and is now sharper: a
# gate is offline-provable when its TRANSPORT can be replaced without replacing
# its CHECK. verify:db's check is "compare expected object names against what the
# server reports", and a local server reports names just as truthfully.
# verify:rls's transport is a connection string and its check is the catalog SQL
# — and both are exercised against a real database.
#
# DEFECT CLASSES
# --------------
#   D1  SUPABASE_URL absent                                -> KILL (exit 2)
#   D1b no credential at all                                -> KILL (exit 2)
#   D2  the contract file is unreadable                      -> KILL (exit 2)
#   D3  a REQUIRED table missing from the database           -> KILL (exit 1)
#   D3b the same fixture with severity demoted to optional   -> OK-GREEN (exit 0)
#       D3/D3b together prove the gate reads `severity`, not merely that a name
#       was absent. Without D3b, a gate that failed on ANY absence would pass.
#   D4  everything present                                   -> OK-GREEN (control)
#   D5  NOTHING verifiable (all objects unknown)             -> KILL (exit 2)
#       The gate's own comment calls this "total blindness ... the check never
#       ran". It is the vacuous-pass guard, and it must not look like a pass.
#   D6  --warn-only downgrades a real violation              -> OK-GREEN (exit 0)
#       A documented escape hatch. Asserting it as `kill` would demand a gate
#       that breaks the emergency path the deploy workflow relies on.
#   D7  total blindness is NOT downgraded by --warn-only      -> KILL
#       The pair that makes D6 safe: the escape hatch must not be able to turn
#       an unrun check into a green deploy.
#
# D4 rules out a gate that always exits non-zero, which would satisfy every KILL
# above. D3b/D6 rule out one that always fails on any deviation.
#
# HOW THE MUTATIONS WORK
# ----------------------
# A local HTTP server stands in for PostgREST, and a fixture contract file lists
# the objects it should report. The gate is invoked exactly as CI invokes it;
# nothing about the gate is patched. `--contract` is a documented flag, so using
# it also proves that flag is wired.
#
# TRAPS, ALL REAL
# ---------------
#  1. **.env.local REFILLS THE VARIABLES THIS BATTERY NEEDS TO WITHHOLD.**
#     applyEnvFiles() runs INSIDE the gate, and skips a refill only when
#     `process.env[k] !== undefined && process.env[k] !== ''`. So `SUPABASE_URL=
#     node …` does NOT produce a missing URL — the value is restored from
#     .env.local and D1 passes for the wrong reason. Measured on verify:env,
#     reproduced here. The env files are hidden for the whole run.
#
#  2. **The local server must be given time to bind, and must be killed.** A
#     fixed `sleep` is racy; the server writes a ready line and this script waits
#     for it. The PID is tracked and killed in `trap cleanup EXIT`, so a failing
#     case cannot leave a listener holding the port for the next run.
#
#  3. **A port collision silently redirects the gate at another service.** The
#     port is chosen by the OS (bind to 0 and read it back), not hardcoded.
#
#  4. **`OUT=$(cmd 2>&1 || true); RC=$?` does not capture the exit code** — the
#     `|| true` makes `$?` report the `true`. Measured 2026-09-15 as RC=0 against
#     a process that really exited 7. Capture bare.
#
#  5. **Leftover fixtures or a stray env backup from an aborted run.** Swept up
#     front with a note, and restored via `trap cleanup EXIT` on every path.
#
#  6. **THE GATE'S DEFAULT TIMING BUDGET IS 65 SECONDS PER UNREACHABLE HOST.**
#     `parseArgs` defaults to `timeout: 20000, retries: 3, backoff: 1000`, and
#     withRetry sleeps `backoff * 2^(attempt-1)` between attempts. A single case
#     pointed at a dead port therefore costs 20+21+22 ≈ 63 s. The first run of
#     this file hit that on D1/D1b/D2 and had to be killed at 8 minutes — it was
#     not hung, it was faithfully waiting out a retry policy designed for a
#     production deploy, where patience is correct and a false negative is
#     expensive. The battery passes `--retries 1 --timeout 2000` explicitly on
#     every invocation, which turns the same cases into seconds and also proves
#     those two flags are wired. Thresholds are flags here rather than patched
#     constants for the same reason as bundle-size.mutations.sh.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/verify-db.mutations.sh
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

GATE=scripts/ci/verify-migrations.mjs
FIX=.tmp-verifydb-fixture
fail=0
results=()
HIDDEN=()
SRV_PID=""
PORT=""

# Files already modified before this run started. The restore proof must
# attribute damage to THIS battery, and a pending edit from another uncommitted
# change (most often `scripts/ci/review-manifest.json`, which records the proof
# this battery produces) is not damage — but presence alone cannot tell the two
# apart. Measured 2026-09-15: with that edit pending, this battery reported
# `RESTORE FAILED — the battery left a tracked file modified` while the
# substantive verdict was 7 killed / 0 survived, so a correct run looked broken.
# Snapshot the dirty set up front and only flag paths dirty NOW and clean THEN.
PRE_DIRTY=$(git status --porcelain -- "$GATE" scripts/ci 2>/dev/null | grep -v '^??' | awk '{print $NF}' | sort)

cleanup() {
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null
  SRV_PID=""
  restore_env_files
  rm_retry "$FIX"
}
trap cleanup EXIT

# ── 1 · Hermetic environment (trap 1) ───────────────────────────────────────
hide_env_files() {
  for f in .env.local .env.lokal .env; do
    if [ -f "$f" ]; then
      mv "$f" "$f.bakmut" || { echo "ABORT: could not move $f aside."; exit 1; }
      HIDDEN+=("$f")
    fi
  done
}
restore_env_files() {
  for f in "${HIDDEN[@]:-}"; do
    [ -n "$f" ] && [ -f "$f.bakmut" ] && mv "$f.bakmut" "$f"
  done
  HIDDEN=()
}

for f in .env.local .env.lokal .env; do
  if [ ! -f "$f" ] && [ -f "$f.bakmut" ]; then
    echo "NOTE: $f was left parked by a previous aborted run. Restoring."
    mv "$f.bakmut" "$f"
  fi
done
if [ -e "$FIX" ]; then
  echo "NOTE: $FIX survived a previous run (killed before cleanup). Sweeping."
  rm_retry "$FIX"
fi
mkdir -p "$FIX"

hide_env_files
echo "env files hidden for the duration: ${HIDDEN[*]:-(none present)}"
echo

if [ ! -f "$GATE" ]; then
  echo "ABORT: $GATE is missing."
  exit 1
fi

# ── 2 · The stand-in PostgREST (traps 2, 3) ─────────────────────────────────
# Answers GET /rest/v1/ with an OpenAPI document whose `paths` are whichever
# object names the case put in $FIX/paths.json. That is the entire surface the
# gate's definitive mode reads.
cat > "$FIX/server.mjs" <<'EOF'
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';

const [pathsFile, readyFile] = process.argv.slice(2);

const server = createServer((req, res) => {
  if (req.url && req.url.startsWith('/rest/v1')) {
    // Fail LOUDLY on a malformed paths file. The earlier `catch { names = [] }`
    // turned a harness bug into a legitimate-looking "this database has no
    // tables" response, which the gate then reported as total blindness.
    let names;
    try {
      names = JSON.parse(readFileSync(pathsFile, 'utf8'));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('fixture paths.json is not valid JSON: ' + err.message);
      return;
    }
    if (!Array.isArray(names)) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('fixture paths.json must be a JSON array, got ' + typeof names);
      return;
    }
    const paths = {};
    for (const n of names) {
      paths[n.startsWith('/rpc/') ? n : `/${n}`] = {};
    }
    res.writeHead(200, { 'content-type': 'application/openapi+json' });
    res.end(JSON.stringify({ openapi: '3.0.0', paths }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

// Port 0 => the OS picks a free one; no hardcoded port to collide (trap 3).
server.listen(0, '127.0.0.1', () => {
  writeFileSync(readyFile, String(server.address().port));
});
EOF

start_server() {
  rm_retry "$FIX/port"
  node "$FIX/server.mjs" "$FIX/paths.json" "$FIX/port" &
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
stop_server() {
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null
  SRV_PID=""
}

# ── 3 · Fixture helpers ─────────────────────────────────────────────────────
# The contract lists the objects the commit expects. Colours are chosen so D3
# and D4 differ in exactly one way.
write_contract() {
  local severity="$1"
  cat > "$FIX/contract.json" <<EOF
{
  "tables": {
    "candidates": { "severity": "required" },
    "jobs":       { "severity": "$severity" }
  },
  "rpc": {
    "save_master_form": { "severity": "required" }
  }
}
EOF
}

# What the stand-in database reports as present.
#
# MUST be a JSON ARRAY. The stand-in server does JSON.parse(readFileSync(...))
# and iterates the result, so a bare space-separated string parses to ONE
# string and produces ONE path key named after the whole line:
#   paths = { "/candidates jobs /rpc/save_master_form": {} }
# The gate would then see zero matching objects while the server still answered
# 200 with a non-empty `paths` map -- so it took the "not a single object could
# be confirmed" branch and exited 2. Every case that expected GREEN failed with
# `UNEXPECTED exit=2`, which looked like a gate defect and was a harness defect.
#
# Trivial edits to a fixture-data helper are exactly where this hides: the code
# below LOOKS right (it writes the argument) and only the FORMAT is wrong.
set_db_paths() {
  node -e '
    const fs = require("fs");
    const names = String(process.argv[1] || "").split(/\s+/).filter(Boolean);
    fs.writeFileSync(process.argv[2], JSON.stringify(names));
  ' "$1" "$FIX/paths.json"
}

# ── 4 · Mutation primitive ──────────────────────────────────────────────────
# `check <label> <expect> <gate args…> -- <env assignments…>`. The `--` split is
# used because both lists can be empty and a naive shift cannot tell the gate's
# own flags from `FOO=bar`.
#
# Consumed with `shift 2`, never `local x="$1" … "${@:3}"` — the latter silently
# mangles flag-shaped arguments (measured in bundle-size.mutations.sh as
# `local: '--max-entry': not a valid identifier`).
check() {
  local label="$1" expect="$2" rc
  shift 2
  local gateargs=()
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
    gateargs+=("$1")
    shift
  done
  [ "$#" -gt 0 ] && shift
  local envargs=("$@")

  env "${envargs[@]}" node "$GATE" --retries 1 --timeout 2000 "${gateargs[@]}" >/dev/null 2>&1
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

# ── D1/D1b/D2 · the config paths (no server needed) ─────────────────────────
# Fail-closed is the correct answer for all three: none of them means "the
# database is fine", they mean "nothing was checked".
write_contract required
set_db_paths "candidates jobs /rpc/save_master_form"

check "D1  an absent SUPABASE_URL fails closed" kill --contract "$FIX/contract.json"
check "D1b a URL with no credential fails closed" kill --contract "$FIX/contract.json" -- \
  SUPABASE_URL=http://127.0.0.1:9
check "D2  an unreadable contract file fails closed" kill --contract "$FIX/does-not-exist.json" -- \
  SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=dummy-key

# ── D3/D3b · a REQUIRED object missing, and the same one demoted ────────────
# The gate's central purpose. `jobs` is absent from the stand-in database.
start_server
set_db_paths "candidates /rpc/save_master_form"
write_contract required
check "D3  a missing REQUIRED table blocks the deploy" kill --contract "$FIX/contract.json" -- \
  SUPABASE_URL=http://127.0.0.1:$PORT SUPABASE_SERVICE_ROLE_KEY=dummy-key

# Same absent table, severity flipped. A gate that ignored severity and failed on
# any absence would pass D3 and fail here.
write_contract optional
check "D3b the SAME absence demoted to optional passes (proves severity decides)" equivalent \
  --contract "$FIX/contract.json" -- \
  SUPABASE_URL=http://127.0.0.1:$PORT SUPABASE_SERVICE_ROLE_KEY=dummy-key

# ── D4 · the control ────────────────────────────────────────────────────────
write_contract required
set_db_paths "candidates jobs /rpc/save_master_form"
check "D4  everything present passes (control)" equivalent --contract "$FIX/contract.json" -- \
  SUPABASE_URL=http://127.0.0.1:$PORT SUPABASE_SERVICE_ROLE_KEY=dummy-key

# ── D4b · an RPC reported missing is a violation too ────────────────────────
# Distinct from D3: functions are checked against `/rpc/<name>`, so a gate that
# only walked the tables map would pass.
set_db_paths "candidates jobs"
check "D4b a missing RPC function blocks the deploy" kill --contract "$FIX/contract.json" -- \
  SUPABASE_URL=http://127.0.0.1:$PORT SUPABASE_SERVICE_ROLE_KEY=dummy-key

# ── D6 · --warn-only downgrades a real violation ────────────────────────────
# The documented emergency path used by manual staging dispatches. Must stay
# green, or the escape hatch the deploy workflow relies on is gone.
check "D6  --warn-only downgrades a real violation to a warning" equivalent \
  --contract "$FIX/contract.json" --warn-only -- \
  SUPABASE_URL=http://127.0.0.1:$PORT SUPABASE_SERVICE_ROLE_KEY=dummy-key

stop_server

# ── D5/D7 · total blindness must never read as a pass ───────────────────────
# Point the gate at a server that reports NO paths, with no credential good
# enough to probe individual tables. The gate's own comment: "Total blindness
# means the check never ran. Never let that look like a pass."
start_server
set_db_paths ""
write_contract required
check "D5  nothing verifiable fails closed" kill --contract "$FIX/contract.json" -- \
  SUPABASE_URL=http://127.0.0.1:$PORT SUPABASE_SERVICE_ROLE_KEY=dummy-key

# D7 · and --warn-only must NOT be able to turn that into a green deploy. This is
# the case that makes D6 safe: without it, the escape hatch could be used to ship
# on an unrun check.
check "D7  --warn-only does NOT downgrade total blindness" kill \
  --contract "$FIX/contract.json" --warn-only -- \
  SUPABASE_URL=http://127.0.0.1:$PORT SUPABASE_SERVICE_ROLE_KEY=dummy-key

# ── D8 · a reachable server that is not PostgREST ───────────────────────────
# Any 200 that is not a valid OpenAPI document must degrade to probing, not be
# mistaken for a definitive empty list. Asserted on the message so it is clear
# which path was taken.
set_db_paths "candidates jobs /rpc/save_master_form"
cat > "$FIX/notopenapi.mjs" <<'EOF'
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
const ready = process.argv[2];
const s = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/plain' }); r.end('this is not JSON'); });
s.listen(0, '127.0.0.1', () => writeFileSync(ready, String(s.address().port)));
EOF
rm_retry "$FIX/port2"
node "$FIX/notopenapi.mjs" "$FIX/port2" &
SRV_PID=$!
waited=0
while [ ! -s "$FIX/port2" ]; do
  sleep 0.1; waited=$((waited + 1))
  [ "$waited" -gt 100 ] && { echo "ABORT: fallback server did not bind."; exit 1; }
done
PORT2=$(cat "$FIX/port2")
OUT=$(env SUPABASE_URL=http://127.0.0.1:$PORT2 SUPABASE_SERVICE_ROLE_KEY=dummy-key \
  node "$GATE" --contract "$FIX/contract.json" --retries 1 --timeout 2000 2>&1)
if echo "$OUT" | grep -q 'degraded'; then
  echo "OK-GREEN   -      D8  a non-OpenAPI 200 degrades to probing, not to a fake empty path set"
  results+=("OK-GREEN D8 non-OpenAPI degrades")
else
  echo "UNEXPECTED        D8  a non-OpenAPI 200 was not reported as degraded"
  results+=("UNEXPECTED D8 non-OpenAPI handling")
  fail=1
fi
stop_server

# ── 5 · Restore proof ───────────────────────────────────────────────────────
restore_env_files
MISSING_ENV=()
for f in .env.local .env.lokal .env; do
  [ -f "$f.bakmut" ] && MISSING_ENV+=("$f was NOT restored")
done
if [ "${#MISSING_ENV[@]}" -gt 0 ]; then
  echo "RESTORE FAILED — an env file was left parked:"
  printf '    %s\n' "${MISSING_ENV[@]}"
  fail=1
fi
if [ -n "$SRV_PID" ]; then
  echo "NOTE: a fixture server was still running at exit; killing it."
  kill "$SRV_PID" 2>/dev/null
  SRV_PID=""
fi
rm_retry "$FIX"
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
echo "  scope: full verdict path against a local PostgREST stand-in"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
