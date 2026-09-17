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
BAK="$SCRATCH/gate.bak"
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

# The gate itself is never mutated by this battery — the fixtures are databases,
# not source edits — so the pre-run copy is the live file. (The `git show HEAD`
# rule in the sibling batteries exists because those DO rewrite their gate; here
# it would be wrong, since an uncommitted improvement to the gate is not poison.)
cp "$GATE" "$BAK"

# ── Fixture control ─────────────────────────────────────────────────────────
# One throwaway cluster per case: `initdb` costs a few seconds, which is an
# acceptable price for full isolation between fixtures.
cat > "$SCRATCH/run-case.mjs" <<'EOF'
// Boot a throwaway PostgreSQL, apply the SQL given on argv[2], then run the
// REAL gate against it and print its exit code.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { spawn } from 'node:child_process';

const [sqlFile, port, repoRoot] = process.argv.slice(2);
const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

// One data directory per case, kept inside the scratch dir so the shell's
// `rm -rf $SCRATCH` reclaims it. Named from the fixture so a failure message
// points at the right case.
const { readFileSync, rmSync, existsSync } = await import('node:fs');
const dataDir = `${process.env.RLS_BATTERY_SCRATCH}/pgdata-${sqlFile.replace(/[^\w.-]/g, '_')}`;
rmSync(dataDir, { recursive: true, force: true });

const srv = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: Number(port),
  persistent: false,
});

await srv.initialise();
await srv.start();

const sql = readFileSync(sqlFile, 'utf8');

const c = new pg.Client({ connectionString: url, ssl: false });
await c.connect();
// Supabase roles are not Postgres built-ins; every fixture needs them.
await c.query(`create role anon nologin; create role authenticated nologin;`);
if (sql.trim()) await c.query(sql);
await c.end();

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
check() {
  local label="$1" expect="$2" mode="$3" sqlfile="$4"
  local out rc
  out=$(node "$SCRATCH/run-case.mjs" "$SCRATCH/$sqlfile" "$PGPORT" "$PWD" 2>&1)
  rc=$?
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
if ! cmp -s "$BAK" "$GATE"; then
  echo "RESTORE FAILED — $GATE does not match its pre-run content:"
  git diff --stat -- "$GATE" | sed 's/^/    /'
  fail=1
fi

rm_retry "$SCRATCH"

echo
echo "─────────────────────────────────────────────"
for r in "${results[@]}"; do echo "  $r"; done
KILLED=$(printf '%s\n' "${results[@]}" | grep -c '^KILLED' || true)
SURVIVED=$(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED' || true)
OKG=$(printf '%s\n' "${results[@]}" | grep -c '^OK-GREEN' || true)
echo "─────────────────────────────────────────────"
echo "  killed $KILLED · survived $SURVIVED · ok-green $OKG"
echo "  scope: the full catalog verdict against a REAL PostgreSQL (embedded-postgres)"
if [ "$fail" -eq 0 ]; then
  echo "  VERDICT: gate can fail, and its false-alarm surface is intact"
  exit 0
fi
echo "  VERDICT: PROBLEM — see UNEXPECTED/SURVIVED above"
exit 1
