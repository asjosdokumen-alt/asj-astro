#!/usr/bin/env bash
# Mutation battery for the generated-schema drift gate.
#
#   package.json:  verify:schema = node scripts/ci/gen-schema.mjs --check
#                  db:schema     = node scripts/ci/gen-schema.mjs   (regenerates)
#
# WHY A BATTERY
# -------------
# `schema.generated.ts` is the typed view of the live database, and it is the
# ONLY source of the column names this codebase is allowed to put in a
# `select=` projection. When it goes stale, every query keeps compiling against
# a schema that no longer exists — and the failure is silent, because PostgREST
# answers 400 for an unknown column and the surrounding code falls back to a
# full-table read, quietly undoing the projection it was asked to use.
#
# So `--check` exists to make that drift a build failure. Its whole value is the
# REFUSAL: exit 1 when the committed file no longer matches the live database.
# Nothing previously demonstrated that it can produce that exit 1 — a gate that
# has only ever been observed green is a hypothesis.
#
# WHY THIS BATTERY CAN BE FULLY OFFLINE
# -------------------------------------
# Same transport as verify:db, and the same rule applies: a gate is
# offline-provable when its TRANSPORT can be replaced without replacing its
# CHECK.
#
#   * The transport is `fetch(`${SUPABASE_URL}/rest/v1/`)` with an OpenAPI
#     Accept header — a base URL, so a local HTTP server can answer it.
#   * The check is a byte comparison of the committed target against the file
#     RE-RENDERED from whatever that server reports.
#
# Both halves therefore run for real against a stand-in. Nothing is stubbed, no
# module is mocked, and no source file is edited: the gate is invoked exactly as
# `npm run verify:schema` invokes it.
#
# TRAP 1 — THE GATE READS production UNLESS YOU STOP IT, AND CAN WRITE
# -------------------------------------------------------------------
# gen-schema.mjs calls applyEnvFiles() internally, which loads SUPABASE_URL and
# SUPABASE_SERVICE_ROLE_KEY out of .env.local. Consequences, all measured:
#
#   * `env SUPABASE_URL=http://127.0.0.1:9 node gate` does NOT point the gate at
#     a dead port — applyEnvFiles() refills from .env.local only for keys that
#     are undefined or empty, so a NON-empty export does win. Exporting an
#     empty string does not: it counts as unset and is refilled.
#   * The env files must be moved aside for the WHOLE run, exactly as
#     verify-db.mutations.sh does, or the "misconfigured" cases reach production.
#
# The measured operational facts, recorded here because they are not obvious
# from the script:
#
#   * `npm run verify:schema` from a developer machine CONNECTS TO PRODUCTION.
#   * `npm run db:schema` (NO --check) REGENERATES THE TRACKED FILE from
#     production. It is not read-only. Running it by accident rewrites
#     netlify/functions/_lib/db/schema.generated.ts in the working tree.
#   * The module has NO import.meta.main guard, so merely IMPORTING it runs
#     main() with no arguments — which regenerates the file. Measured: an
#     `import('./scripts/ci/gen-schema.mjs')` probe printed
#     `SCHEMA WRITTEN  ... · 25 tables` and touched the tracked file (identical
#     bytes, so the tree stayed clean, but that was luck, not design). Do not
#     import this module to inspect it.
#
# TRAP 2 — THE TARGET PATH IS NOT OVERRIDABLE
# -------------------------------------------
# TARGET = <repo>/netlify/functions/_lib/db/schema.generated.ts is a module
# constant with no flag to redirect it. So the drift cases cannot point the gate
# at a scratch file; they PLANT content at the real path and restore it. The
# restore is verified at the end of the run, and a failed restore fails the
# battery — never `git checkout` mid-run and never leave the tree dirty.
#
# TRAP 3 — /tmp IS NOT SHARED BETWEEN THE SHELL AND NODE ON THIS MACHINE
# ----------------------------------------------------------------------
# Node resolves `/tmp` to `E:\tmp`, while the shell's `ls /tmp/...` does not see
# that directory. Writing fixture output to `/tmp` therefore produces files that
# appear to be missing, and an empty-looking read is easy to misdiagnose as a
# gate defect. Every path in this battery is INSIDE the tree, under $FIX.
#
# TRAP 4 — THE GATE'S RETRY POLICY COSTS ~19s PER UNREACHABLE CASE
# -----------------------------------------------------------------
# parseArgs defaults are `timeout: 20000, retries: 3` — note gen-schema has NO
# `--backoff` flag, and its sleep is `500 * 2^(attempt-1)` (500 + 1000 = 1.5s
# total). The S3 case therefore takes ~19s rather than the ~63s verify:db needs.
# Every invocation still passes `--retries 1 --timeout 2000` when the point is
# the verdict rather than the retry policy.
#
# DEFECT CLASSES
# --------------
#   S1  committed file matches the live render                   -> OK-GREEN (exit 0)
#       The control. A byte-for-byte match must pass; without it every KILL
#       below would be satisfied by a gate that always fails.
#   S2  committed file drifted (one column added upstream)       -> KILL (exit 1)
#       The gate's entire purpose, and the only path that exits 1.
#   S3  SUPABASE_URL absent                                      -> KILL (exit 2)
#   S4  no service-role credential                               -> KILL (exit 2)
#       OpenAPI is service-role only, so a missing key is a config error, not a
#       reason to guess. Asserted separately from S3 so the two refusals cannot
#       hide behind one another.
#   S5  the stand-in exposes zero tables                         -> KILL (exit 2)
#       fetchSchema refuses to write an empty contract rather than emitting a
#       schema with no tables, which would otherwise look like a valid file.
#   S6  an unreachable host                                      -> KILL (exit 2)
#       Distinct from S5: nothing answered at all.
#   S7  ordered columns are part of the contract                 -> KILL (exit 1)
#       S2 adds a column; this case REORDERS an existing one without changing
#       the set. A gate comparing only table/column NAMES would stay green and
#       would let a projection-relevant change ship unnoticed.
#   S8  drift is reported with both digests                      -> KILL (exit 1)
#       Asserted on the message, not just the code: the operator must be told
#       the live digest, the committed digest, and what to run. Exit 1 alone
#       cannot distinguish a useful refusal from a crash.
#
# S1 is the equivalent case that rules out a gate stuck at exit 1 — which for
# this gate would block every deploy. S5 rules out the vacuous pass. S1/S2/S7
# are deliberately built so that the ONLY difference between them is the content
# of one tracked file.
#
# WHAT THIS BATTERY DOES NOT COVER
# --------------------------------
# The `--json` and `--stdout` output modes, and the non-`--check` write path.
# Those are not on any shipping path: `verify:schema` is always `--check`. The
# write path is the one that mutates a tracked file against production, and it
# is exercised by hand rather than by CI. Stated here so a reader does not
# overrate this file's coverage.
#
# RESTORE CONTRACT (copy this idiom)
# ----------------------------------
#   * Every mutation of a tracked path goes through one backup taken at start.
#   * The restore runs from `cleanup`, and is asserted at the END of the file so
#     a clean run can prove it rather than assume it.
#   * The battery must exit 0 on a correct gate AND leave the tree exactly as it
#     found it; `git status --porcelain` is checked, not trusted.
#
# Run with cwd = repo root:
#   bash scripts/ci/verify-schema.mutations.sh

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

GATE=scripts/ci/gen-schema.mjs
TARGET=netlify/functions/_lib/db/schema.generated.ts
FIX=.tmp-verifyschema
BAK=.tmp-verifyschema-target.bak
FAILFAST=(--retries 1 --timeout 2000)

fail=0
results=()
HIDDEN=()
SRV_PID=""
PORT=""

# Files already modified before this run started. The restore proof must
# attribute damage to THIS battery, and a pending edit from another uncommitted
# change (most often `scripts/ci/review-manifest.json`, which records the proof
# this battery produces) is not damage — but it cannot be told apart from damage
# by presence alone. Measured 2026-09-15: with that edit pending, this battery
# reported `RESTORE FAILED — the battery left a tracked file modified` while the
# substantive verdict was 6 killed / 0 survived, so a correct run looked broken.
# Snapshot the dirty set up front and only flag paths dirty NOW and clean THEN.
PRE_DIRTY=$(git status --porcelain -- "$TARGET" scripts/ci 2>/dev/null | grep -v '^??' | awk '{print $NF}' | sort)

# ── Hermetic environment (trap 1) ───────────────────────────────────────────
# gen-schema.mjs calls applyEnvFiles() itself, so `env VAR= node gate` cannot
# withhold a credential it loads on its own. The files are moved aside for the
# whole run: refilled only when undefined-or-empty means an exported empty
# string is NOT a reliable way to make a variable "absent".
hide_env_files() {
  for f in .env.local .env.lokal .env; do
    if [ -f "$f" ]; then
      mv "$f" "$f.bakmutschema" || { echo "ABORT: could not move $f aside."; exit 1; }
      HIDDEN+=("$f")
    fi
  done
}

restore_env_files() {
  for f in "${HIDDEN[@]}"; do
    [ -n "$f" ] && [ -f "$f.bakmutschema" ] && mv "$f.bakmutschema" "$f"
  done
  HIDDEN=()
}

cleanup() {
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null
  SRV_PID=""
  if [ -f "$BAK" ]; then
    mv "$BAK" "$TARGET" 2>/dev/null || cp "$BAK" "$TARGET"
    rm_retry "$BAK"
  fi
  restore_env_files
  rm_retry "$FIX"
}
trap cleanup EXIT

for f in .env.local .env.lokal .env; do
  if [ ! -f "$f" ] && [ -f "$f.bakmutschema" ]; then
    echo "NOTE: $f was left parked by a previous aborted run. Restoring."
    mv "$f.bakmutschema" "$f"
  fi
done
rm_retry "$FIX"
mkdir -p "$FIX"
hide_env_files

if [ ! -f "$TARGET" ]; then
  echo "ABORT: $TARGET does not exist, so there is nothing to drift. Restoring env files."
  restore_env_files
  exit 1
fi
cp "$TARGET" "$BAK"

# ── 1 · Stand-in PostgREST server ───────────────────────────────────────────
# Answers `/rest/v1/` with a Swagger 2.0 document whose `definitions` carry the
# table shapes — which is what PostgREST really returns, and the trap
# gen-schema's own comment calls out: `components.schemas` is empty, so reading
# the wrong key yields zero tables and looks like a valid empty schema.
#
# The server reads its table map on EVERY request, so a case can change the
# reported schema between two invocations without restarting it.
cat > "$FIX/server.mjs" <<'EOF'
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';

const [tablesFile, readyFile] = process.argv.slice(2);

const server = createServer((req, res) => {
  if (req.url && req.url.startsWith('/rest/v1')) {
    // Fail LOUDLY on a malformed fixture. A silent `catch { definitions: {} }`
    // would be served as a legitimate "this database has no tables" answer,
    // which is indistinguishable from a real empty database — the exact
    // confusion trap 3 describes for this repo's other batteries.
    let defs;
    try {
      defs = JSON.parse(readFileSync(tablesFile, 'utf8'));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('fixture tables.json is not valid JSON: ' + err.message);
      return;
    }
    if (typeof defs !== 'object' || defs === null || Array.isArray(defs)) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('fixture tables.json must be an object of {table: [columns]}');
      return;
    }
    const doc = { openapi: '3.0.0', definitions: {}, paths: {} };
    for (const [name, cols] of Object.entries(defs)) {
      doc.paths['/' + name] = { get: {} };
      doc.definitions[name] = { type: 'object', properties: {} };
      for (const c of cols) doc.definitions[name].properties[c] = { type: 'string' };
    }
    res.writeHead(200, { 'content-type': 'application/openapi+json' });
    res.end(JSON.stringify(doc));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

// Port 0 => the OS picks a free one, so there is no hardcoded port to collide
// with a leftover listener from an aborted run.
server.listen(0, '127.0.0.1', () => {
  writeFileSync(readyFile, String(server.address().port));
});
EOF

start_server() {
  rm_retry "$FIX/port"
  node "$FIX/server.mjs" "$FIX/tables.json" "$FIX/port" &
  SRV_PID=$!
  local waited=0
  while [ ! -s "$FIX/port" ]; do
    sleep 0.1
    waited=$((waited + 1))
    if [ "$waited" -gt 100 ]; then
      echo "ABORT: the stand-in server did not bind within 10s."
      exit 1
    fi
  done
  PORT=$(cat "$FIX/port")
}

stop_server() {
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null
  SRV_PID=""
}

# What the stand-in reports. An object of {table: [columns]} — column ORDER is
# significant, which is what S7 exercises.
set_tables() {
  node -e '
    const fs = require("fs");
    fs.writeFileSync(process.argv[1], JSON.stringify(JSON.parse(process.argv[2])));
  ' "$FIX/tables.json" "$1"
}

# ── 2 · Mutation primitive ──────────────────────────────────────────────────
# `check <label> <expect> <gate args…> -- <env assignments…>`. The `--` split is
# used because both lists can be empty and a naive shift cannot tell the gate's
# own flags from `FOO=bar`.
#
# Consumed with `shift 2` and an explicit loop — never
# `local x="$1" y="$2" rc "${@:3}"`, which is invalid bash for flag-shaped
# arguments and silently drops them (measured in bundle-size.mutations.sh as
# `local: '--max-entry': not a valid identifier`).
check() {
  local label="$1" expect="$2" rc
  shift 2
  local gateargs=()
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
    gateargs+=("$1")
    shift
  done
  [ "$#" -gt 0 ] && shift # drop the `--`
  local envargs=("$@")

  # `"${envargs[@]}"` bare, NEVER `"${envargs[@]:-}"`: on an empty array the
  # latter expands to ONE empty-string argument, so `env` tries to execute a
  # command named "" and exits 127. Measured: empty-array 127 vs plain 1.
  # A KILL case built on an empty environment would then pass for the wrong
  # reason, since 127 is non-zero.
  #
  # Captured BARE, never `OUT=$(cmd || true); rc=$?` — the `|| true` makes `$?`
  # report the `true`. Measured: a process that really exited 7 reported RC=0.
  # That form guards against `set -e`, which this script does not use.
  env "${envargs[@]}" node "$GATE" --check "${gateargs[@]}" >"$FIX/out.txt" 2>&1
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
      sed 's/^/               | /' "$FIX/out.txt" | head -4
      fail=1
    fi
  fi
}

# The error text a case produced, for message assertions.
last_output() {
  cat "$FIX/out.txt"
}

# ── 3 · Cases ───────────────────────────────────────────────────────────────

# The stand-in's schema for the drift cases. Two tables, columns in a specific
# order so S7 can change order without changing membership.
FIXTURE_TABLES='{"database_candidate":["id","nama","status"],"master_database_candidate":["id","kode"]}'

# ── S3/S4/S6 · the config refusals (no server needed) ───────────────────────
# All exit 2: "configuration error", i.e. nothing was checked. Distinct from
# exit 1, which means a check ran and found drift.
check "S3  an absent SUPABASE_URL fails closed" kill -- \
  SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY=

check "S4  a URL with no service-role credential fails closed" kill -- \
  SUPABASE_URL=http://127.0.0.1:9

check "S6  an unreachable host fails closed" kill -- \
  SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=dummy-key \
  "${FAILFAST[@]}"

# Message assertion: the missing-URL refusal must name the variable and say it
# is failing closed. Exit 2 alone cannot tell a deliberate refusal from a crash.
OUT=$(env SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= node "$GATE" --check 2>&1)
if echo "$OUT" | grep -q 'CONFIG ERROR  SUPABASE_URL is not set'; then
  echo "OK-GREEN   -      S3b the refusal names the variable and says it fails closed"
  results+=("OK-GREEN S3b refusal message")
else
  echo "UNEXPECTED        S3b the missing-URL refusal did not explain itself"
  echo "$OUT" | sed 's/^/               | /' | head -4
  results+=("UNEXPECTED S3b refusal message")
  fail=1
fi

# ── S1/S2/S7 · the drift verdict ────────────────────────────────────────────
start_server
set_tables "$FIXTURE_TABLES"

# S1 · render the stand-in's schema and plant it as the committed file, so the
# gate is looking at a target that genuinely matches its source. This is the
# only way to build a true green control: the shipped file matches PRODUCTION,
# not our stand-in.
env SUPABASE_URL="http://127.0.0.1:$PORT" SUPABASE_SERVICE_ROLE_KEY=dummy-key \
  node "$GATE" --stdout --retries 1 --timeout 2000 > "$FIX/rendered.ts" 2>"$FIX/render.err"
if [ -s "$FIX/rendered.ts" ]; then
  cp "$FIX/rendered.ts" "$TARGET"
else
  echo "ABORT: could not render a schema from the stand-in."
  sed 's/^/  /' "$FIX/render.err" | head -5
  exit 1
fi

check "S1  a committed file matching the live render passes (control)" equivalent -- \
  SUPABASE_URL="http://127.0.0.1:$PORT" SUPABASE_SERVICE_ROLE_KEY=dummy-key

# S2 · one extra column appears upstream. The classic drift: the database gained
# a column and nobody ran `npm run db:schema`.
set_tables '{"database_candidate":["id","nama","status","catatan_baru"],"master_database_candidate":["id","kode"]}'
check "S2  a column added upstream is DRIFT" kill -- \
  SUPABASE_URL="http://127.0.0.1:$PORT" SUPABASE_SERVICE_ROLE_KEY=dummy-key

# S7 · the SAME columns, reordered. Membership is unchanged, so a gate that
# compared only the set of names would stay green. Column order is part of the
# contract because projections are written as ordered strings, so this must fail.
set_tables '{"database_candidate":["status","id","nama"],"master_database_candidate":["id","kode"]}'
check "S7  reordered columns with an unchanged name set is DRIFT" kill -- \
  SUPABASE_URL="http://127.0.0.1:$PORT" SUPABASE_SERVICE_ROLE_KEY=dummy-key

# ── S8 · the drift refusal must be diagnosable ──────────────────────────────
# An operator paged by a red pipeline needs three things: that drift was found,
# which digests disagree, and the command that fixes it. Asserted on the text,
# because exit 1 alone is equally consistent with a crash.
set_tables '{"database_candidate":["id","nama","status"],"master_database_candidate":["id","kode","cabang"]}'
env SUPABASE_URL="http://127.0.0.1:$PORT" SUPABASE_SERVICE_ROLE_KEY=dummy-key \
  node "$GATE" --check --retries 1 --timeout 2000 >"$FIX/drift.txt" 2>&1
DRIFT_RC=$?
DRIFT_OUT=$(cat "$FIX/drift.txt")
DRIFT_OK=1
echo "$DRIFT_OUT" | grep -q 'SCHEMA DRIFTED' || DRIFT_OK=0
echo "$DRIFT_OUT" | grep -q 'live digest' || DRIFT_OK=0
echo "$DRIFT_OUT" | grep -q 'committed digest' || DRIFT_OK=0
echo "$DRIFT_OUT" | grep -q 'npm run db:schema' || DRIFT_OK=0
if [ "$DRIFT_RC" -eq 1 ] && [ "$DRIFT_OK" -eq 1 ]; then
  echo "OK-GREEN   exit=1   S8  drift refusal reports both digests and the fix command"
  results+=("OK-GREEN S8 drift diagnosis")
elif [ "$DRIFT_RC" -eq 1 ]; then
  echo "UNEXPECTED        S8  drift refused but did not explain which digest differs"
  echo "$DRIFT_OUT" | sed 's/^/               | /' | head -6
  results+=("UNEXPECTED S8 drift diagnosis")
  fail=1
else
  echo "SURVIVED   exit=$DRIFT_RC   S8  a drifted schema did not refuse at all"
  results+=("SURVIVED S8 drift diagnosis")
  fail=1
fi

# ── S5 · an empty contract must be refused, not written ─────────────────────
# fetchSchema's own guard: "OpenAPI document exposed zero tables — refusing to
# write an empty contract". Without it, a server that answered 200 with no
# `definitions` would silently produce a schema file declaring no tables — a
# vacuous pass that looks like a valid artefact, and would then make every
# projection in the codebase wrong at once.
stop_server
start_server
set_tables '{}'
check "S5  a stand-in exposing zero tables is refused, not written" kill -- \
  SUPABASE_URL="http://127.0.0.1:$PORT" SUPABASE_SERVICE_ROLE_KEY=dummy-key

OUT=$(last_output)
if echo "$OUT" | grep -q 'zero tables'; then
  echo "OK-GREEN   -      S5b the empty-contract refusal says why"
  results+=("OK-GREEN S5b empty-contract message")
else
  echo "UNEXPECTED        S5b the empty-contract refusal did not say why"
  echo "$OUT" | sed 's/^/               | /' | head -4
  results+=("UNEXPECTED S5b empty-contract message")
  fail=1
fi

stop_server

# ── 4 · Restore proof ───────────────────────────────────────────────────────
# Run the restore explicitly, then assert it worked. A battery that reports a
# verdict but leaves the tree dirty has moved the problem rather than found it.
#
# The pre-run content is copied to $BAK.keep BEFORE anything is restored, so the
# final comparison is against what the run started with rather than against the
# backup file it is simultaneously writing from.
[ -f "$BAK" ] && cp "$BAK" "$BAK.keep"

restore_env_files
if [ -f "$BAK" ]; then
  cp "$BAK" "$TARGET"
fi

MISSING_ENV=()
for f in .env.local .env.lokal .env; do
  [ -f "$f.bakmutschema" ] && MISSING_ENV+=("$f was NOT restored")
done
if [ "${#MISSING_ENV[@]}" -gt 0 ]; then
  echo "RESTORE FAILED — an env file was left parked:"
  printf '    %s\n' "${MISSING_ENV[@]}"
  fail=1
fi

rm_retry "$FIX/out.txt" "$FIX/rendered.ts" "$FIX/render.err" "$FIX/drift.txt"

# The target must be byte-identical to what the run started with. Compared
# against the backup rather than assumed, because a mid-run `cp` is exactly the
# kind of change that is easy to make and impossible to notice.
if [ -f "$BAK.keep" ]; then
  if ! cmp -s "$BAK.keep" "$TARGET"; then
    echo "RESTORE FAILED — the tracked target does not match its pre-run content:"
    git diff --stat -- "$TARGET" | sed 's/^/    /'
    fail=1
  fi
  rm_retry "$BAK.keep"
fi

rm_retry "$FIX"
NOW_DIRTY=$(git status --porcelain -- "$TARGET" scripts/ci | grep -v '^??' | awk '{print $NF}' | sort)
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
echo "  scope: the --check drift verdict against a local PostgREST stand-in"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
