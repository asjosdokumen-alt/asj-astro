#!/usr/bin/env bash
# Mutation battery for the Row Level Security / least-privilege gate.
#
#   package.json:  verify:rls = node scripts/ci/verify-rls.mjs
#
# WHY A BATTERY
# -------------
# This gate guards the only thing standing between the public anon key — which is
# shipped to every browser — and the data. Its value is entirely in what it
# REFUSES, and until now nothing had ever demonstrated any refusal. Worse, one of
# its four checks could not fire at all (see D5 below), which is exactly the kind
# of thing a battery exists to surface.
#
# WHY THIS BATTERY IS OFFLINE-PROVABLE AFTER ALL
# ----------------------------------------------
# `verify-db.mutations.sh` states, as a deliberate contrast, that this gate CANNOT
# be proven offline:
#
#   "verify:rls speaks raw Postgres over a TCP socket (pg). There is no URL shape
#    that lets a local server substitute without stubbing the driver, and stubbing
#    pg would exercise the verdict logic while leaving the SQL — the actual check
#    — untouched."
#
# That reasoning is sound but its premise is false, and this battery is the
# measurement that corrects it:
#
#   * The gate takes its connection string from SUPABASE_DB_URL, and `initDbEnv()`
#     HONOURS a non-empty value already present in the environment (measured: it
#     only refills undefined-or-empty names from .env.local). So the transport IS
#     redirectable — it is a connection string, just like verify:db's base URL.
#
#   * A real PostgreSQL is available locally without a container or an external
#     server: the devDependency `embedded-postgres` ships genuine `initdb` and
#     `postgres` binaries (measured: PostgreSQL 18.4, 107 MB under
#     node_modules/@embedded-postgres). So the SQL is NOT stubbed — it runs
#     against a real catalog. This battery therefore proves MORE than verify:db's,
#     which only swaps the HTTP layer while its SQL stays unexercised.
#
#   * The one thing that needed changing is SSL. The gate hard-coded
#     `ssl: { rejectUnauthorized: false }`, which a local server without TLS
#     refuses ("The server does not support SSL connections"). Honouring libpq's
#     own PGSSLMODE lets the transport move without touching the check. That
#     change is part of this commit.
#
# The rule survives intact, and gets sharper: a gate is offline-provable when its
# TRANSPORT can be replaced without replacing its CHECK. Here the transport is a
# connection string and the check is the catalog SQL, and both are exercised.
#
# DEFECT CLASSES
# --------------
#   R1  SUPABASE_URL absent                                -> KILL (exit 2)
#   R2  a table with RLS switched OFF                       -> KILL (exit 1)
#       The four tables the 2026-09-12 audit found open were this shape.
#   R3  anon holds a privilege (SELECT) on a non-candidate   -> KILL (exit 1)
#       The candidate-facing tables are the documented exception; R3b proves the
#       exception is real rather than a gate that fails on any grant at all.
#   R3b anon holds SELECT on a CANDIDATE-facing table        -> OK-GREEN (exit 0)
#       Paired with R3. Without it, a gate that flagged every grant would pass.
#   R4  anon/authenticated hold TRUNCATE                     -> KILL (exit 1)
#   R5  a FOR ALL policy TO PUBLIC with USING (true)         -> KILL (exit 1)
#       THE REGRESSION CASE. This is the exact shape of the incident that
#       motivated the gate (migrations/012_rls_lockdown.sql:76-79: `USING (true)`
#       on a FOR ALL policy, granted to PUBLIC). Before this commit the check
#       used `polqual is null`, and Postgres stores a written `USING (true)` as
#       the expression 'true' — never NULL — so the query returned ZERO rows for
#       precisely the thing it was written to catch. Measured on PostgreSQL 18.4.
#       R5 is what proves the fix; it FAILED (the mutation survived) before it.
#   R5b the same table with a RESTRICTIVE predicate              -> OK-GREEN
#       The paired control: a `*_own_wa`-style policy granted to PUBLIC whose
#       qualifier actually filters is legitimate and must not be flagged. This is
#       the shape all three real policies have today.
#   R6  nothing verifiable (no tables)                       -> KILL (exit 2)
#       The vacuous-pass guard: an empty catalog must not read as a clean one.
#   R7  a check that cannot see anything never reports OK     -> KILL (exit 2)
#       The gate's own header calls this out ("A check that reports success when
#       it could not see anything is worse than no check"); R7 pins it.
#
# Must be run with cwd = repo root:
#   bash scripts/ci/verify-rls.mutations.sh
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

GATE=scripts/ci/verify-rls.mjs
SCRATCH=.tmp-rls-pg
PGPORT=54377
PGURL="postgresql://postgres:postgres@127.0.0.1:$PGPORT/postgres"
# This script's own path as a NATIVE Windows path, for handing to `node`.
#
# Three shapes are in play and only ONE of them works:
#   - passed as `bash scripts/ci/x.sh`  -> `$0` = `scripts/ci/x.sh` (relative;
#     fine for bash, but the extraction node process is run from `$PWD`, and a
#     bare relative path is fragile)
#   - entered as `bash /f/astro/scripts/ci/x.sh` -> `$0` = `/f/astro/...`;
#     `readlink -f` keeps the POSIX form, and the WINDOWS node binary then reads
#     the leading `/f` as a drive-less root and opens `F:\f\astro\scripts\...`.
#     Measured 2026-09-18: `node -e readFileSync("/f/astro/scripts/ci/
#     verify-rls.mutations.sh")` -> `ENOENT ... F:\\f\\astro\\scripts\\...`.
#   - `cygpath -m` -> `F:/astro/scripts/ci/x.sh` (native, forward slashes): this
#     is the only form that survives being passed to node.
SELF="$(cygpath -m "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
if [ ! -f "$SELF" ]; then
  # Do not fall back silently. A wrong here degrades the self-test into a
  # permanent "T1/T2 FAILED", which reads as a CODE regression and would send
  # the next reader hunting for a bug in the restore guard that is not there.
  echo "ABORT: cannot locate this script (SELF=$SELF)."
  echo "       The self-test extracts the shipped restore block and check() by"
  echo "       path, so without a usable path it cannot run — and an unrunnable"
  echo "       check must not masquerade as a failing one."
  exit 2
fi
fail=0
results=()

# Files already modified before this run started. The restore proof must
# attribute damage to THIS battery; a pending edit from another uncommitted
# change (most often scripts/ci/review-manifest.json, which records the proof
# this battery produces) is not damage, but presence alone cannot tell the two
# apart. Snapshot the dirty set up front and flag only newly-dirtied paths.
PRE_DIRTY=$(git status --porcelain -- "$GATE" scripts/ci 2>/dev/null | grep -v '^??' | awk '{print $NF}' | sort)

log() { echo "  $1"; }

# ── Scratch area and prerequisites ──────────────────────────────────────────
# This MUST happen before any fixture or helper is written. An earlier revision
# wrote the helper with `cat > $SCRATCH/run-case.mjs` ABOVE the `mkdir`, so the
# redirect failed, every case ran against a missing module, and each one was
# reported SURVIVED — a harness that never ran, wearing the costume of a gate
# that failed to fail. Create the directory first, and refuse to continue if the
# prerequisites are absent: "the battery could not run" and "the gate did not
# fail" are different answers.
rm_retry "$SCRATCH"
mkdir -p "$SCRATCH"
export RLS_BATTERY_SCRATCH="$PWD/$SCRATCH"

cleanup() {
  # Parked env files must come back even on abort, or the next run starts with
  # no credentials and every case fails for the wrong reason.
  for f in .env.local .env.lokal .env; do
    [ -f "$f.rlsbak" ] && mv "$f.rlsbak" "$f"
  done
  rm_retry "$SCRATCH"
}
trap cleanup EXIT

if [ ! -f "$GATE" ]; then
  echo "ABORT: $GATE is missing."
  exit 1
fi

if ! node -e "import('embedded-postgres').then(()=>process.exit(0),()=>process.exit(1))" 2>/dev/null; then
  echo "ABORT: embedded-postgres is not installed."
  echo "       npm install   (it is a devDependency; this battery needs it)"
  exit 1
fi

# The OS temp directory, resolved the way `node` will resolve it.
#
# `mktemp -d` / `$TMPDIR` return POSIX shapes (`/tmp/...`) that Git Bash's own
# tools understand but the WINDOWS `node` binary does not: node opens the
# literal path and lands in `F:\tmp\...`, so the write fails with ENOENT while
# bash would have been perfectly happy. Proof that this is real, not
# theoretical (measured 2026-09-18): `TMPDIR=/tmp/tmp.X`, node writeFileSync to
# `/tmp/tmp.X/t2.sh` -> `ENOENT ... open 'F:\tmp\tmp.OzhCmMkMYr\t2.sh'`.
#
# Resolve with `cygpath` (Git Bash) so the value handed to node is a native
# absolute path, and prove it round-trips before relying on it — a temp
# directory that cannot be written from node would surface later as a self-test
# failure, i.e. the harness would blame the code for its own path handling.
TMPDIR_ABS="$(cygpath -m "$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}")" 2>/dev/null || true)"
[ -n "$TMPDIR_ABS" ] || TMPDIR_ABS="${TEMP:-${TMPDIR:-/tmp}}"
TMPDIR_ABS="${TMPDIR_ABS%/}"
if ! node -e "
  const fs=require('fs'), p=require('path').join(process.argv[1],'.probe');
  fs.writeFileSync(p,'ok'); fs.unlinkSync(p);
" "$TMPDIR_ABS" 2>/dev/null; then
  echo "ABORT: the resolved temp directory is not writable by node."
  echo "       TMPDIR_ABS=$TMPDIR_ABS"
  echo "       The harness cannot prove a restore, so its verdicts would be noise."
  exit 1
fi

# The gate itself is never mutated by this battery — the fixtures are databases,
# not source edits — so the pre-run copy is the live file. (The `git show HEAD`
# rule in the sibling batteries exists because those DO rewrite their gate; here
# it would be wrong, since an uncommitted improvement to the gate is not poison.)
#
# Back up to the OS TEMP dir, NOT $SCRATCH (measured 2026-09-18). Two reasons,
# and the first is a hard abort under `set -e`:
#   1. `cp` failing would terminate the battery before ANY case ran, so the run
#      would report nothing at all instead of "the harness could not prove
#      restoration" — the silent-stop failure mode this battery exists to
#      prevent (see the `mkdir` note above).
#   2. The self-test below deliberately removes the backup from `$SCRATCH`, so a
#      single file cannot be both "safely outside the scratch area" and "inside
#      the scratch area". Parking it outside makes the delete a no-op.
GATE_BAK="$TMPDIR_ABS/gate-$$.bak"
if ! cp "$GATE" "$GATE_BAK" 2>/dev/null; then
  echo "ABORT: could not back up the gate to $GATE_BAK"
  echo "       Without a pre-run copy, the restore proof (the property that says"
  echo "       'this battery did not damage its own gate') cannot be made, so no"
  echo "       verdict from this run would be trustworthy."
  exit 1
fi

# ── Fixture control ─────────────────────────────────────────────────────────
# One throwaway cluster per case: `initdb` costs a few seconds, which is an
# acceptable price for full isolation between fixtures.
cat > "$SCRATCH/run-case.mjs" <<'EOF'
// Boot a throwaway PostgreSQL, apply the SQL given on argv[2], then run the
// REAL gate against it and print its exit code.
//
// EXIT CODE 70 MEANS "THE HARNESS COULD NOT RUN" — it is NOT a verdict.
// Measured 2026-09-18: `embedded-postgres` died mid-case with
//   `Error: read ECONNRESET  at TCP.onStreamRead`
// and, because nothing caught it, this script exited 1 from an uncaught
// exception. The shell's `check()` read that 1 as the GATE's exit code and
// reported SURVIVED/UNEXPECTED — a harness that never ran, wearing the costume
// of a gate that failed to fail. That is the exact defect this battery's own
// header warns about (lines 112-117), so every setup step below is wrapped and
// any failure exits 70, which `check()` turns into an ABORT rather than a
// verdict. "The battery could not run" and "the gate did not fail" must never
// look alike.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { spawn } from 'node:child_process';

const [sqlFile, port, repoRoot] = process.argv.slice(2);
const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

// Report a harness failure with its REAL message, then exit 70 so the shell can
// tell it apart from a gate verdict. `ECONNRESET` in particular must never be
// allowed to become an exit 1, which is a meaningful gate answer.
function harnessFail(where, err) {
  console.error(`HARNESS ERROR (${where}): ${err && err.message ? err.message : String(err)}`);
  if (err && err.code) console.error(`HARNESS ERROR code: ${err.code}`);
  console.error('HARNESS ERROR: this is NOT a gate verdict — the case never ran.');
  process.exit(70);
}

// One data directory per case, kept inside the scratch dir so the shell's
// `rm -rf $SCRATCH` reclaims it. Named from the fixture so a failure message
// points at the right case.
const { readFileSync, rmSync, existsSync } = await import('node:fs');
const dataDir = `${process.env.RLS_BATTERY_SCRATCH}/pgdata-${sqlFile.replace(/[^\w.-]/g, '_')}`;
try {
  rmSync(dataDir, { recursive: true, force: true });
} catch (err) {
  harnessFail('clearing the previous data dir', err);
}

const srv = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: Number(port),
  persistent: false,
});

// Every step that can fail for an ENVIRONMENT reason is wrapped. An unwrapped
// throw here is what produced the exit-1 masquerade described at the top.
try {
  await srv.initialise();
  await srv.start();
} catch (err) {
  harnessFail('initialise/start of embedded-postgres', err);
}

const sql = readFileSync(sqlFile, 'utf8');

const c = new pg.Client({ connectionString: url, ssl: false });
try {
  await c.connect();
  // Supabase roles are not Postgres built-ins; every fixture needs them.
  await c.query(`create role anon nologin; create role authenticated nologin;`);
  if (sql.trim()) await c.query(sql);
  await c.end();
} catch (err) {
  // `ECONNRESET` lands here. It is a transport failure, not a schema verdict.
  harnessFail('applying the fixture SQL', err);
}

const rc = await new Promise((resolve) => {
  // `repoRoot` arrives from the shell as $PWD, which under Git Bash is a POSIX
  // path (/f/astro). Node would read that as F:\f\astro and fail to find the
  // gate — measured, and it presents as every case exiting 1 for the wrong
  // reason. Resolve it with the shell's own view instead, and fail loudly if it
  // does not actually contain the gate.
  const root = repoRoot.replace(/^\/([a-zA-Z])\//, '$1:/');
  const gatePath = `${root}/scripts/ci/verify-rls.mjs`;
  if (!existsSync(gatePath)) {
    console.error(`HARNESS ERROR: gate not found at ${gatePath} (repoRoot was ${repoRoot})`);
    process.exit(70);
  }
  const p = spawn(process.execPath, [gatePath], {
    cwd: root,
    env: {
      ...process.env,
      SUPABASE_URL: 'http://127.0.0.1:1',   // only used for messages/reporting
      SUPABASE_DB_URL: url,
      DATABASE_URL: url,
      PGSSLMODE: 'disable',
      SUPABASE_ANON_KEY: 'probe-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'probe-service-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => {
    process.stdout.write(out);
    resolve(code);
  });
});

await srv.stop();
process.exit(rc);
EOF

# Pass a fixture file and the expected exit code; print KILLED / SURVIVED / OKG.
# `expect` is the exit code, `label` is free text used in the report.
#
# RESERVED EXIT CODE 70 = THE HARNESS COULD NOT RUN. It is an ABORT, never a
# verdict. Without this branch, a transport failure inside `run-case.mjs` (a
# bare `ECONNRESET`, measured 2026-09-18) surfaced as exit 1, which this function
# then reported as SURVIVED or UNEXPECTED — i.e. the battery claimed a gate
# finding when the gate had not executed at all. A harness abort must be loud
# and must stop the battery, because every verdict after it is unearned.
HARNESS_EXIT=70
check() {
  local label="$1" expect="$2" mode="$3" sqlfile="$4"
  local out rc
  out=$(node "$SCRATCH/run-case.mjs" "$SCRATCH/$sqlfile" "$PGPORT" "$PWD" 2>&1)
  rc=$?
  if [ "$rc" = "$HARNESS_EXIT" ]; then
    printf 'ABORT      exit=%-3s %s  (harness could not run — NOT a verdict)\n' "$rc" "$label"
    echo "$out" | sed 's/^/               | /' | tail -4
    results+=("ABORT $label")
    fail=1
    return
  fi
  if [ "$mode" = "kill" ]; then
    if [ "$rc" = "$expect" ]; then
      printf 'KILLED     exit=%-3s %s\n' "$rc" "$label"
      results+=("KILLED $label")
    else
      printf 'SURVIVED   exit=%-3s %s  (expected %s)\n' "$rc" "$label" "$expect"
      echo "$out" | sed 's/^/               | /' | head -6
      results+=("SURVIVED $label")
      fail=1
    fi
  else
    if [ "$rc" = "$expect" ]; then
      printf 'OK-GREEN   exit=%-3s %s\n' "$rc" "$label"
      results+=("OK-GREEN $label")
    else
      printf 'UNEXPECTED exit=%-3s %s  (expected %s)\n' "$rc" "$label" "$expect"
      echo "$out" | sed 's/^/               | /' | head -6
      results+=("UNEXPECTED $label")
      fail=1
    fi
  fi
}

echo "─────────────────────────────────────────────"
echo "verify:rls mutation battery"
echo "─────────────────────────────────────────────"

# ── Fixtures ────────────────────────────────────────────────────────────────

cat > "$SCRATCH/empty.sql" <<'EOF'
-- no user tables at all
EOF

cat > "$SCRATCH/rls-off.sql" <<'EOF'
create table public.open_leak (id int primary key);
-- deliberately NOT enabling row level security
EOF

cat > "$SCRATCH/anon-noncandidate.sql" <<'EOF'
create table public.secret_table (id int primary key);
alter table public.secret_table enable row level security;
grant select on public.secret_table to anon;
EOF

cat > "$SCRATCH/anon-candidate.sql" <<'EOF'
-- The three documented candidate-facing tables keep their grant on purpose.
create table public.database_candidate (id int primary key, wa text);
alter table public.database_candidate enable row level security;
create policy candidate_own_wa on public.database_candidate for all
  using (wa = current_setting('request.jwt.claims', true)::json ->> 'wa');
grant select on public.database_candidate to anon;
EOF

cat > "$SCRATCH/truncate.sql" <<'EOF'
create table public.wipeable (id int primary key);
alter table public.wipeable enable row level security;
grant truncate on public.wipeable to anon;
EOF

# THE REGRESSION CASE — the exact shape migrations/012_rls_lockdown.sql describes.
cat > "$SCRATCH/public-using-true.sql" <<'EOF'
create table public.fcm_tokens (id int primary key, token text);
alter table public.fcm_tokens enable row level security;
create policy "Service role full access" on public.fcm_tokens for all using (true);
EOF

cat > "$SCRATCH/restrictive-public.sql" <<'EOF'
-- A PUBLIC policy whose qualifier actually filters: legitimate, must stay green.
create table public.safe_table (id int primary key, no_wa text);
alter table public.safe_table enable row level security;
create policy safe_own_wa on public.safe_table for all
  using (no_wa = coalesce(current_setting('request.jwt.claims', true)::json ->> 'wa', ''));
EOF

# ── Cases ───────────────────────────────────────────────────────────────────

# R1 SUPABASE_URL absent -> the gate must fail closed, not skip.
#
# `env -u SUPABASE_URL` is NOT enough, and measuring that is half the value of
# this case: initDbEnv() refills the name from .env.local, so unsetting it in the
# environment leaves the gate fully configured and it reports a normal OK
# against the REAL database (measured: "mode: definitive, 25 tables", exit 0).
# The only way to make the credential genuinely absent is to move the env files
# aside for the duration — so this case parks them, like verify:db's battery does.
for f in .env.local .env.lokal .env; do
  [ -f "$f" ] && mv "$f" "$f.rlsbak"
done
OUT=$(env -u SUPABASE_URL -u DATABASE_URL node scripts/ci/verify-rls.mjs 2>&1); RC=$?
for f in .env.local .env.lokal .env; do
  [ -f "$f.rlsbak" ] && mv "$f.rlsbak" "$f"
done
if [ "$RC" = "2" ]; then
  echo "KILLED     exit=2   R1  an absent SUPABASE_URL fails closed"
  results+=("KILLED R1 absent SUPABASE_URL")
else
  echo "SURVIVED   exit=$RC   R1  an absent SUPABASE_URL fails closed (expected 2)"
  echo "$OUT" | sed 's/^/               | /' | head -4
  results+=("SURVIVED R1")
  fail=1
fi

# R6 empty catalog -> vacuous pass must be refused.
check "R6  an empty catalog is refused, not read as clean" 2 kill empty.sql
# R7 total blindness -> must never report OK. Same fixture as R6, asserted
# separately because "no tables" and "did not look" are different failures.
check "R7  a check that cannot see anything reports UNVERIFIABLE" 2 kill empty.sql
# R2 the four open tables from the audit, in miniature.
check "R2  a table with RLS switched OFF blocks the deploy" 1 kill rls-off.sql
# R3 anon grant on a table that is not candidate-facing.
check "R3  anon holding SELECT on a non-candidate table blocks" 1 kill anon-noncandidate.sql
# R3b the documented exception must stay green.
check "R3b anon grant on a CANDIDATE-facing table stays green" 0 ok anon-candidate.sql
# R4 TRUNCATE.
check "R4  anon holding TRUNCATE blocks the deploy" 1 kill truncate.sql
# R5 the regression case this commit fixes.
check "R5  FOR ALL TO PUBLIC USING (true) blocks the deploy" 1 kill public-using-true.sql
# R5b the paired control.
check "R5b a PUBLIC policy with a real predicate stays green" 0 ok restrictive-public.sql

# ── Restore proof ───────────────────────────────────────────────────────────
# Compare against the backup taken from HEAD, then assert git itself sees no
# change — git is the only witness for an EOL change a content compare misses.
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

# The gate must be byte-identical to how this run found it. The comparison is
# against a pre-run copy, NOT against HEAD: a battery must not mutate the gate,
# but the gate may legitimately carry uncommitted work, and demanding a match
# with HEAD would fail a correct run for a reason it did not cause.
#
# WHY THE EXISTENCE GUARD IS LOAD-BEARING (measured 2026-09-18):
# `cmp -s` on a MISSING file exits 2, not 1. Any path where the backup is gone
# under the compare (a lifecycle bug, a sandbox delete that fails but is stepped
# over, a killed prior run) makes the compare fail for a reason that has NOTHING
# to do with the gate — and it printed an empty `git diff`, so the message read
# "RESTORE FAILED" with no evidence above it. That is how this battery reported
# RESTORE FAILED on a tree where `git diff -- scripts/ci/verify-rls.mjs` was
# empty: the reader is trained to ignore the one line that guards "a battery
# must not damage its gate". Distinguish "the backup is gone" (a HARNESS
# problem) from "the gate changed" (a REAL problem) instead of collapsing both
# into the same verdict.
#
# The backup now lives in the OS temp dir (see the copy site), so ordinary
# scratch churn can no longer trigger this branch. The guard is kept anyway:
# `$TMPDIR_ABS` is proven writable but not proven durable, and T1 exercises this
# branch directly so it cannot rot unnoticed.
if [ ! -f "$GATE_BAK" ]; then
  echo "HARNESS ERROR — $GATE_BAK is missing, so the restore proof cannot be made."
  echo "                This is NOT evidence that the gate changed:"
  echo "                a missing backup and a modified gate are different failures."
  git diff --stat -- "$GATE" | sed 's/^/    /'
  fail=1
elif ! cmp -s "$GATE_BAK" "$GATE"; then
  echo "RESTORE FAILED — $GATE does not match its pre-run content:"
  echo "    backup: $(wc -c < "$GATE_BAK") bytes · gate: $(wc -c < "$GATE") bytes"
  git diff --stat -- "$GATE" | sed 's/^/    /'
  fail=1
fi

rm -f "$GATE_BAK"
rm_retry "$SCRATCH"

# ── Harness self-test (T1/T2) ───────────────────────────────────────────────
# The restore proof and the ABORT classification are themselves load-bearing,
# and both were broken in a way that MASQUERADED AS A GATE FINDING
# (measured 2026-09-18, see the comments at each site). A fix that is not held
# by a check will be undone by the next edit, so these two properties are
# asserted here rather than trusted. They need no PostgreSQL and no network —
# they exercise this file's own logic — so they run on every invocation.
#
#   T1  a MISSING backup reports HARNESS ERROR, never "RESTORE FAILED"
#       (before the fix: `cmp -s` on a missing file exits 2, so the battery
#        printed RESTORE FAILED with an EMPTY git diff — an alarm with no
#        evidence, which trains its reader to ignore the line)
#   T2  a harness failure (exit 70) is recorded as ABORT, never SURVIVED
#       (before the fix: an uncaught ECONNRESET exited 1 and was scored as a
#        gate verdict — "a harness that never ran, in the costume of a gate
#        that failed to fail")

echo
echo "── harness self-test (no database needed) ──"

# T1: missing backup -> HARNESS ERROR, not RESTORE FAILED.
# The block is extracted FROM THIS FILE and run in a subshell, so T1 fails if the
# shipped code regresses — testing a re-typed copy would pass either way.
SELFTEST_DIR="$SCRATCH/selftest"
mkdir -p "$SELFTEST_DIR"
T1_SCRIPT="$SELFTEST_DIR/t1.sh"
node -e "
const fs=require('fs');
const src=process.argv[1], out=process.argv[2];
const t=fs.readFileSync(src,'utf8');
const i=t.indexOf('if [ ! -f \"\$GATE_BAK\" ]; then');
const j=t.indexOf('rm -f \"\$GATE_BAK\"', i);
if(i<0||j<0){ console.error('T1: restore block not found in ' + src); process.exit(3); }
fs.writeFileSync(out, t.slice(i, j), 'utf8');
" "$SELF" "$T1_SCRIPT" || { echo "T1 FAILED — could not extract the restore block"; fail=1; }
if [ -f "$T1_SCRIPT" ]; then
  t1_out=$(GATE_BAK="$SELFTEST_DIR/absent.bak" GATE="$GATE" bash -c ". '$T1_SCRIPT'; echo \"fail=\$fail\"" 2>&1)
  if printf '%s' "$t1_out" | grep -q 'HARNESS ERROR' && \
     ! printf '%s' "$t1_out" | grep -q 'RESTORE FAILED' && \
     printf '%s' "$t1_out" | grep -q 'fail=1'; then
    printf 'T1 OK-GREEN  a missing backup reports HARNESS ERROR, not RESTORE FAILED\n'
    results+=("OK-GREEN T1 missing-backup reports HARNESS ERROR")
  else
    printf 'T1 FAILED    a missing backup did not report HARNESS ERROR:\n'
    printf '%s\n' "$t1_out" | sed 's/^/               | /'
    results+=("SURVIVED T1 missing-backup guard")
    fail=1
  fi
fi

# T2: exit 70 is an ABORT, and a REAL exit 1 is still a verdict.
# Like T1, this extracts the SHIPPED `check()` from this file. An earlier
# version of T2 re-typed the one-line comparison and would therefore have
# passed even if the ABORT branch were deleted from `check()` — a self-test
# that cannot fail (rule: every gate must be provable to fail).
#
# The two arms assert the property that actually distinguishes a harness
# failure from a gate verdict:
#   arm 1  runner exits 70            -> ABORT, and fail=1
#   arm 2  runner exits 1 (real)      -> NOT ABORT (it is a verdict about the
#                                        gate, whichever verdict that is)
#
# Arm 2 deliberately does NOT assert `SURVIVED`. With no run-case.mjs present,
# node exits 1 and `kill` expects 1, so the correct outcome is KILLED — an
# earlier revision asserted SURVIVED and reported a false T2 FAILED, i.e. the
# test was wrong and blamed the code. What arm 2 must pin is that the ABORT
# branch did not swallow an ordinary failure.
T2_SCRIPT="$SELFTEST_DIR/t2.sh"
node -e "
const fs=require('fs');
const src=process.argv[1], out=process.argv[2];
const t=fs.readFileSync(src,'utf8');
const i=t.indexOf('HARNESS_EXIT=');
const j=t.indexOf('echo \"─────────────────────────────────────────────\"', i);
if(i<0||j<0){ console.error('T2: check() not found in ' + src); process.exit(3); }
fs.writeFileSync(out, t.slice(i, j), 'utf8');
" "$SELF" "$T2_SCRIPT" || { echo "T2 FAILED — could not extract check()"; fail=1; }
if [ -f "$T2_SCRIPT" ]; then
  # Arm 1: a harness failure must ABORT and set fail=1.
  a1=$(bash -c "
    results=(); fail=0; SCRATCH=/nonexistent-scratch; HARNESS_EXIT=70
    . '$T2_SCRIPT'
    # after sourcing, redefine the runner to exit 70 — the single point that
    # distinguishes a harness failure from a gate verdict
    node() { return 70; }
    export -f node 2>/dev/null || true
    check 'probe harness-failure' 1 kill x.sql
    echo \"verdict=\${results[0]}\"
    echo \"fail=\$fail\"
  " 2>&1)
  # Arm 2: an ordinary exit 1 must stay a verdict, not become ABORT.
  a2=$(bash -c "
    results=(); fail=0; SCRATCH=/nonexistent-scratch; HARNESS_EXIT=70
    . '$T2_SCRIPT'
    check 'probe real-failure' 1 kill x.sql
    echo \"verdict=\${results[0]}\"
  " 2>&1)
  t2ok=1
  printf '%s\n' "$a1" | grep -q 'verdict=ABORT probe harness-failure' || t2ok=0
  printf '%s\n' "$a1" | grep -q 'fail=1' || t2ok=0
  printf '%s\n' "$a2" | grep -q 'verdict=ABORT' && t2ok=0
  if [ "$t2ok" = "1" ]; then
    printf 'T2 OK-GREEN  exit %s ABORTs on a harness failure; a real failure is still a verdict\n' "$HARNESS_EXIT"
    results+=("OK-GREEN T2 exit-70 ABORTs, a real failure stays a verdict")
  else
    printf 'T2 FAILED    the ABORT classification regressed:\n'
    printf '%s\n' "--- arm 1 (exit 70) ---" "$a1" "--- arm 2 (exit 1) ---" "$a2" | sed 's/^/               | /'
    results+=("SURVIVED T2 abort classification")
    fail=1
  fi
fi

# T3: the ABORT branch must ACTUALLY BE PRESENT IN `check()`.
#
# T2 drives the classifier with a stubbed runner, so it proves the branch WORKS
# but not that the branch is still IN THE SHIPPED FUNCTION — the stub is defined
# after `check` is sourced, and an edit that deleted the branch could leave T2
# satisfied. T3 closes that hole by letting the REAL runner fail: with `$SCRATCH`
# pointing at a directory that does not exist, `node "$SCRATCH/run-case.mjs"`
# exits non-zero and `check` takes whichever branch the shipped code has.
#
# The assertion is a PAIR, because either half alone is satisfiable by the wrong
# implementation:
#   - arm A  no `$SCRATCH`, stub absent -> the case must NOT be reported ABORT
#   - arm B  no `$SCRATCH`, stub exits 70 -> the case MUST be reported ABORT
# Without arm A, a `check()` that always printed ABORT would look correct on B
# while destroying every real verdict.
if [ -f "$T2_SCRIPT" ]; then
  b1=$(bash -c "
    results=(); fail=0; SCRATCH='/nonexistent-scratch-3'
    . '$T2_SCRIPT'
    check 'probe real-error' 1 kill x.sql
    echo \"verdict=\${results[0]}\"
  " 2>&1)
  mkdir -p "$SELFTEST_DIR/stub"
  cat > "$SELFTEST_DIR/stub/run-case.mjs" <<'STUBEOF'
process.exit(70);
STUBEOF
  b2=$(bash -c "
    results=(); fail=0; SCRATCH='$SELFTEST_DIR/stub'
    . '$T2_SCRIPT'
    check 'probe harness-error' 1 kill x.sql
    echo \"verdict=\${results[0]}\"
  " 2>&1)
  t3ok=1
  printf '%s\n' "$b1" | grep -q 'verdict=ABORT' && t3ok=0
  printf '%s\n' "$b2" | grep -q 'verdict=ABORT probe harness-error' || t3ok=0
  if [ "$t3ok" = "1" ]; then
    printf 'T3 OK-GREEN  the shipped check() ABORTs on exit %s and only then\n' "$HARNESS_EXIT"
    results+=("OK-GREEN T3 abort branch is present in the shipped check()")
  else
    printf 'T3 FAILED    the shipped check() does not ABORT as its comment claims:\n'
    printf '%s\n' "--- arm A (no harness error) ---" "$b1" "--- arm B (exit 70) ---" "$b2" | sed 's/^/               | /'
    results+=("SURVIVED T3 abort branch present in shipped check()")
    fail=1
  fi
fi

echo
echo "─────────────────────────────────────────────"
for r in "${results[@]}"; do echo "  $r"; done
KILLED=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED' || true)
SURVIVED=$(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED' || true)
OKG=$(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN' || true)
ABORTED=$(printf '%s\n' "${results[@]}" | grep -c '^ABORT' || true)
echo "─────────────────────────────────────────────"
echo "  killed $KILLED · survived $SURVIVED · ok-green $OKG · abort $ABORTED"
if [ "$ABORTED" -gt 0 ]; then
  echo "  NOTE: $ABORTED case(s) ABORTED — the harness never ran them, so they"
  echo "        are neither a pass nor a finding. Fix the environment and re-run;"
  echo "        do NOT read this run as evidence about the gate."
fi
echo "  scope: the full catalog verdict against a REAL PostgreSQL (embedded-postgres)"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
