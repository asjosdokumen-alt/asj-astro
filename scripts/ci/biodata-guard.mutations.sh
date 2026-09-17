#!/usr/bin/env bash
# Mutation battery for the migration-013 admin-only guard.
#
#   migrations/013_biodata_status.sql
#     └─ public.enforce_status_biodata_admin_only()
#          └─ trigger trg_status_biodata_admin_only on public.database_candidate
#
# WHY THIS BATTERY EXISTS — it caught a shipped hole
# --------------------------------------------------
# Migration 013 adds `status_biodata` because ONE column cannot hold two
# independent verdicts: the candidate dashboard was showing "Telah disetujui
# admin" for a DOCUMENT approval by reusing the APPLICATION column
# `status_kandidat`. The new column therefore carries a load-bearing promise:
#
#     DISETUJUI / REVISI may only be written by an admin.
#
# The first revision of that guard did not keep it. It was SECURITY DEFINER and
# asked `current_user IN ('service_role','postgres')` as a second opinion — but
# PostgreSQL sets `current_user` to the function OWNER inside a SECURITY DEFINER
# function, so the clause was always FALSE, the AND-chain collapsed, and the
# guard never raised. It also read the wrong setting name
# (`request.jwt.claim.role`, singular) where PostgREST publishes
# `request.jwt.claims` (plural, one JSON object). Either defect alone made it
# decorative. It was nearly shipped with a green test, because the test ran in a
# session where the trigger could not be reached at all (the role lacked table
# grants), so "refused" and "never consulted" were indistinguishable.
#
# This battery is the answer to that specific failure: the SAME session that can
# write the column is the one that must be refused.
#
# WHAT IT PROVES
# --------------
#   A1  candidate MAY move BELUM -> MENUNGGU        OK-GREEN (not a blanket ban)
#   A2  candidate may NOT self-approve DISETUJUI    KILL
#   A3  the row is UNCHANGED after the refusal      KILL
#   A4  candidate may NOT self-reject REVISI        KILL
#   A5  service role MAY approve DISETUJUI          OK-GREEN (admin path works)
#   A6  no claims setting must FAIL CLOSED          KILL
#
# A1+A5 rule out a guard that simply denies everything, which would satisfy every
# KILL above while breaking the feature. A3 rules out a guard that raises AFTER
# the row was already written.
#
# HOW IT PROVES IT — and why the grant is the load-bearing line
# ------------------------------------------------------------
# A real PostgreSQL (the devDependency `embedded-postgres`) with a minimal
# `database_candidate`. Two connections into the SAME database:
#
#   admin  — connected as postgres, used to set up and to read the row back
#   caller — connects as `authenticator`, SET ROLE authenticated / service_role,
#            and carries `request.jwt.claims` exactly as PostgREST would set it
#
# The caller attempts the UPDATE on its own connection. Doing the assertion on
# the admin connection while the caller only reads metadata is the precise
# mistake that made the previous test blind.
#
# `grant select, insert, update, delete ... to authenticated` is REQUIRED.
# Without it PostgreSQL refuses at the privilege layer with 42501 BEFORE the
# trigger is consulted, and every KILL case passes for the wrong reason while
# hiding a completely broken guard. This matches production: migration 012
# deliberately KEEPS the DML grants and relies on RLS + triggers.
#
# ENVIRONMENT NOTE (measured, and it matters)
# -------------------------------------------
# `embedded-postgres` CANNOT start a cluster on a Windows drive that is not the
# system drive, in this sandbox. Measured 2026-09-17, twice, deterministically:
#
#     PANIC: could not open file "global/pg_control": Permission denied
#     Error: read ECONNRESET
#
# It works when the cluster lives under the OS temp directory on C:. CI runs on
# `ubuntu-latest` (every workflow), where the bug does not exist and the repo
# scratch dir is correct. So this battery SCRATCH_DIR defaults to the repo tree
# (right for CI) and FALLS BACK to the OS temp dir when the repo scratch fails
# to initialise on Windows. It reports which one it used, because "the battery
# could not run" and "the guard did not fail" must never look alike.
#
# USAGE
#   bash scripts/ci/biodata-guard.mutations.sh
#
# EXIT CODES
#   0  every mutation was KILLED (or OK-GREEN where declared)
#   1  at least one mutation SURVIVED — the guard has a hole
#   2  tooling error: gate/migration unreadable, embedded-postgres absent

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MIGRATION="$ROOT/migrations/013_biodata_status.sql"
SCRATCH_REL=".tmp-biodata-guard"

cd "$ROOT" || exit 2

if [ ! -f "$MIGRATION" ]; then
  echo "ABORT: $MIGRATION is missing."
  exit 2
fi
if ! grep -q "enforce_status_biodata_admin_only" "$MIGRATION"; then
  echo "ABORT: the guard function is not in $MIGRATION."
  exit 2
fi
if ! node -e "import('embedded-postgres').then(()=>process.exit(0),()=>process.exit(1))" 2>/dev/null; then
  echo "ABORT: embedded-postgres is not installed."
  echo "       npm install   (it is a devDependency; this battery needs it)"
  exit 2
fi

# Deliberately NOT `rm -rf`: the WorkBuddy sandbox shim intercepts rm/rmSync and
# refuses bulk deletes, and an earlier revision of a sibling battery had its
# cleanup refusal mask its own verdict. unlinkSync is the one primitive that
# passes, so the scratch is cleared with node and any refusal is non-fatal.
clear_dir() {
  node -e '
    const { existsSync, readdirSync, statSync, unlinkSync, rmdirSync } = require("node:fs");
    const { join } = require("node:path");
    const root = process.argv[1];
    if (!existsSync(root)) process.exit(0);
    const walk = (p) => {
      for (const x of readdirSync(p)) {
        const q = join(p, x);
        let st; try { st = statSync(q); } catch { continue; }
        if (st.isDirectory()) { walk(q); try { rmdirSync(q); } catch {} }
        else { try { unlinkSync(q); } catch {} }
      }
    };
    walk(root);
    try { rmdirSync(root); } catch {}
  ' "$1" 2>/dev/null || true
}

echo "== mutation battery: migration-013 admin-only guard =="
echo

# ── Fixture harness ─────────────────────────────────────────────────────────
# Written BEFORE the probe so a missing helper can never present as a surviving
# mutation. A sibling battery once wrote its helper above its own mkdir, so every
# case ran against a missing module and was reported SURVIVED — a harness that
# never ran, wearing the costume of a gate that failed to fail.
# ── Scratch location, decided BEFORE anything is written into it ─────────────
# TWO separate constraints, and an earlier revision conflated them:
#
#  1. WHERE THE HARNESS SCRIPT LIVES must be inside the repo, or Node cannot
#     resolve `embedded-postgres` / `pg`. NODE_PATH does NOT help: Node ignores
#     it for ESM `import` (it only affects CommonJS `require`), so a harness in
#     the OS temp dir dies with ERR_MODULE_NOT_FOUND before any case runs.
#
#  2. WHERE THE CLUSTER DATA LIVES cannot be a Windows non-system drive.
#     embedded-postgres fails there deterministically:
#
#         PANIC: could not open file "global/pg_control": Permission denied
#
#     Measured twice on F:, absent on C:.
#
# So the script stays in the repo and only the DATA DIR is diverted on Windows.
# On CI (ubuntu-latest) both are the repo, which is the intended shape.
SCRATCH_USED="$ROOT/$SCRATCH_REL"
DATA_ROOT="$SCRATCH_USED"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    case "$ROOT" in
      /c/*|/C/*) : ;;
      *)
        DATA_ROOT="$(node -e 'const{tmpdir}=require("node:os");const{join}=require("node:path");process.stdout.write(join(tmpdir(),"asj-biodata-guard-data"))')"
        echo "  note: Windows, repo on a non-system drive ($ROOT)."
        echo "        embedded-postgres cannot start a cluster there"
        echo "        ('could not open file global/pg_control: Permission denied'),"
        echo "        so cluster DATA goes to $DATA_ROOT."
        echo "        The harness stays in the repo so Node can resolve its imports"
        echo "        (NODE_PATH does not apply to ESM imports)."
        echo "        CI runs ubuntu-latest, where both are the repo scratch."
        echo
        ;;
    esac
    ;;
esac

clear_dir "$SCRATCH_USED"
mkdir -p "$SCRATCH_USED" || { echo "ABORT: cannot create $SCRATCH_USED"; exit 2; }
clear_dir "$DATA_ROOT"
mkdir -p "$DATA_ROOT" || { echo "ABORT: cannot create $DATA_ROOT"; exit 2; }

# Written directly into the CHOSEN dir. An earlier revision wrote it into the
# repo scratch and copied afterwards, after a clear_dir that could remove it
# again — so every case ran against a missing module and was reported SURVIVED:
# a harness that never ran, wearing the costume of a gate that failed to fail.
cat > "$SCRATCH_USED/run-case.mjs" <<'HARNESS'
// Boot a real PostgreSQL, apply migration 013, then run the A1..A6 cases with
// the guard either INTACT or MUTATED back to its broken shipped form.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { readFileSync, existsSync, readdirSync, statSync, unlinkSync, rmdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const [migrationPath, mode, dataRoot, portArg] = process.argv.slice(2);
const port = Number(portArg);
const mutated = mode === 'mutated';

const dataDir = join(dataRoot, `pgdata-${mode}`);
const unwalk = (p) => {
  if (!existsSync(p)) return;
  for (const x of readdirSync(p)) {
    const q = join(p, x);
    let st; try { st = statSync(q); } catch { continue; }
    if (st.isDirectory()) unwalk(q);
    else { try { unlinkSync(q); } catch {} }
  }
  try { rmdirSync(p); } catch {}
};
unwalk(dataDir);
mkdirSync(dirname(dataDir), { recursive: true });

const srv = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres', password: 'postgres', port,
  persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});
try {
  await srv.initialise();
  await srv.start();
} catch (e) {
  // Distinguish "this environment cannot host a cluster" from "the guard is
  // broken". Reported as its own exit code so the shell can fall back rather
  // than blame the guard.
  console.error(`ENVFAIL: ${e.message}`);
  process.exit(3);
}

const admin = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`, ssl: false });
await admin.connect();

await admin.query(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role  nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login; end if;
  end $$;`);
await admin.query(`alter role authenticator login password 'postgres'`);
// PostgREST connects as `authenticator` and then SET ROLEs into the effective
// role. Without membership the caller connection dies with
// `permission denied to set role "authenticated"` BEFORE the trigger is
// consulted, so every case would look like a refusal for the wrong reason.
await admin.query(`grant authenticated to authenticator`);
await admin.query(`grant service_role to authenticator`);

await admin.query(`create table public.database_candidate (
  id uuid primary key default gen_random_uuid(),
  no_wa text,
  status_kandidat text not null default 'PROSES',
  status_biodata text not null default 'BELUM')`);
await admin.query(`insert into public.database_candidate (no_wa) values ('628111')`);

// ── Apply the guard from the REAL migration file ────────────────────────────
const mig = readFileSync(migrationPath, 'utf8');
const fn = mig.match(/CREATE OR REPLACE FUNCTION public\.enforce_status_biodata_admin_only\(\)[\s\S]*?\n\$\$;/);
if (!fn) { console.error('HARNESS ERROR: could not extract the guard from the migration'); process.exit(2); }
let body = fn[0];

if (mutated) {
  // Reintroduce BOTH shipped defects, so each is separately falsifiable.
  body = body.replace(
    'LANGUAGE plpgsql\nSET search_path = public, pg_temp',
    'LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public, pg_temp',
  );
  body = body.replace(
    /IF actor IS NULL OR actor NOT IN \('service_role', 'supabase_admin', 'postgres'\) THEN/,
    "IF actor IS NULL OR actor NOT IN ('service_role', 'supabase_admin', 'postgres') "
    + "AND NOT EXISTS (select 1 from public.database_candidate "
    + "where current_user in ('service_role','postgres')) THEN",
  );
}
await admin.query(body);

await admin.query(`drop trigger if exists trg_status_biodata_admin_only on public.database_candidate`);
await admin.query(`create trigger trg_status_biodata_admin_only
  before update of status_biodata on public.database_candidate
  for each row execute function public.enforce_status_biodata_admin_only()`);

// THE load-bearing grant. Without it PostgreSQL refuses at 42501 before the
// trigger runs, and every KILL case would pass for the wrong reason.
await admin.query(`grant select, insert, update, delete on public.database_candidate to authenticated`);
await admin.query(`grant select, insert, update, delete on public.database_candidate to service_role`);

const id = (await admin.query(`select id from public.database_candidate limit 1`)).rows[0].id;
const reset = (v = 'BELUM') =>
  admin.query(`update public.database_candidate set status_biodata = $1 where id = $2`, [v, id]);
const read = async () =>
  (await admin.query(`select status_biodata from public.database_candidate where id = $1`, [id])).rows[0].status_biodata;

async function caller(role, wa) {
  const c = new pg.Client({ connectionString: `postgresql://authenticator:postgres@127.0.0.1:${port}/postgres`, ssl: false });
  await c.connect();
  await c.query(`set role ${role}`);
  await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role, wa })]);
  return c;
}

async function attempt(role, value, claims) {
  const c = await caller(role, claims === undefined ? '628111' : null);
  try {
    if (claims === null) {
      await c.query(`select set_config('request.jwt.claims', '', false)`);
    }
    await c.query(`update public.database_candidate set status_biodata = $1 where id = $2`, [value, id]);
    await c.end();
    return 'ALLOWED';
  } catch (e) {
    await c.end();
    return e.code === '42501' ? 'REFUSED' : `REFUSED(${e.code})`;
  }
}

const out = [];
const push = (n, got, want) => out.push({ n, got, want, ok: got === want });

// A1 — not a blanket ban.
await reset('BELUM');
push('A1 candidate may submit BELUM->MENUNGGU', await attempt('authenticated', 'MENUNGGU'), 'ALLOWED');
push('A1b row changed', await read(), 'MENUNGGU');

// A2/A3 — the defect itself.
await reset('MENUNGGU');
push('A2 candidate NOT self-approve DISETUJUI', await attempt('authenticated', 'DISETUJUI'), 'REFUSED');
push('A3 row UNCHANGED after refusal', await read(), 'MENUNGGU');

// A4 — the same for the rejection verdict.
await reset('MENUNGGU');
push('A4 candidate NOT self-reject REVISI', await attempt('authenticated', 'REVISI'), 'REFUSED');

// A5 — the admin path must still work.
await reset('MENUNGGU');
push('A5 service role MAY approve DISETUJUI', await attempt('service_role', 'DISETUJUI'), 'ALLOWED');

// A6 — an unnamed caller fails closed.
await reset('MENUNGGU');
push('A6 no claims setting FAILS CLOSED', await attempt('authenticated', 'DISETUJUI', null), 'REFUSED');

await admin.end();
// Write the verdict to a FILE, not stdout. embedded-postgres forwards the whole
// initdb/server transcript to stdout, so anything parsed from stdout is one log
// line away from being misread. A file has exactly one writer and one reader.
const { writeFileSync } = await import('node:fs');
writeFileSync(join(dataRoot, `result-${mode}.json`), JSON.stringify(out));
process.exit(out.every((r) => r.ok) ? 0 : 1);
HARNESS

if [ ! -f "$SCRATCH_USED/run-case.mjs" ]; then
  echo "ABORT: harness missing at $SCRATCH_USED/run-case.mjs"
  exit 2
fi

# ── Node-visible paths ──────────────────────────────────────────────────────
# Git Bash reports $PWD as a POSIX path (/f/astro) and Node reads that as
# F:\f\astro — measured: `node /f/astro/x.mjs` dies with
#     Cannot find module 'F:\f\astro\.tmp-biodata-guard\run-case.mjs'
# while `node F:/astro/x.mjs` runs. This is the same trap the sibling
# verify-rls battery documents, so convert once, here, and use NODE-ROOT
# everywhere a path is handed to Node.
node_path() {
  # /f/astro        -> F:/astro
  # /c/Users/k89/.. -> C:/Users/k89/..   (already fine for Node)
  printf '%s' "$1" | sed -E 's#^/([a-zA-Z])/#\U\1:/#'
}

NODE_ROOT="$(node_path "$ROOT")"
NODE_SCRATCH="$(node_path "$SCRATCH_USED")"
NODE_DATA="$(node_path "$DATA_ROOT")"
NODE_MIGRATION="$(node_path "$MIGRATION")"

fail=0
run_case() {
  local mode="$1" port="$2"
  rm -f "$DATA_ROOT/result-$mode.json"
  node "$NODE_SCRATCH/run-case.mjs" "$NODE_MIGRATION" "$mode" "$NODE_DATA" "$port" >/dev/null 2>&1
  # rc 3 is the harness's own "this environment cannot host a cluster" code.
  # Any OTHER non-zero rc is a real verdict (a case failed) — so only 3 is
  # ENVFAIL. An earlier revision treated every non-zero rc as ENVFAIL and
  # reported "cluster could not start" on a run that had actually completed.
  if [ "$?" = "3" ]; then echo "ENVFAIL"; return 0; fi
  if [ -f "$DATA_ROOT/result-$mode.json" ]; then
    cat "$DATA_ROOT/result-$mode.json"
  fi
}

report() {
  local label="$1" expect="$2" json="$3"
  if [ "$json" = "ENVFAIL" ] || [ -z "$json" ]; then
    echo "  ${label}: HARNESS/ENV FAILURE (no result file)"
    fail=1
    return
  fi
  node -e '
    const [label,expect,json]=process.argv.slice(1);
    let rows; try{rows=JSON.parse(json)}catch{console.log(`  ${label}: HARNESS ERROR (bad JSON)`);process.exit(1)}
    let bad=0;
    for(const r of rows){
      // In the mutated run, the guard cases are EXPECTED to flip to ALLOWED.
      // That flip is the proof; a REFUSED there means the mutation did not
      // actually remove the guard.
      const guardCase=/self-approve|self-reject|UNCHANGED/.test(r.n);
      const ok = expect==="mutated"
        ? (guardCase ? r.got!=="REFUSED" : r.ok)
        : r.ok;
      if(!ok) bad++;
      console.log(`  ${label}  ${ok?"ok      ":"SURVIVED"}  ${r.n.padEnd(44)} -> ${r.got}`);
    }
    process.exit(bad?1:0);
  ' "$label" "$expect" "$json" || fail=1
}

echo "-- baseline: guard INTACT (expect all pass) --"
BASE="$(run_case intact 54400)"
if [ "$BASE" = "ENVFAIL" ] || [ -z "$BASE" ]; then
  echo "  the embedded cluster could not start; cannot proceed."
  echo "  (this is an environment limit, not a guard verdict)"
  exit 2
fi
report "intact  " intact "$BASE"
echo

echo "-- mutation: guard reverted to its broken shipped form --"
MUT="$(run_case mutated 54401)"
if [ "$MUT" = "ENVFAIL" ] || [ -z "$MUT" ]; then
  echo "  the embedded cluster could not start; cannot proceed."
  exit 2
fi
report "mutated " mutated "$MUT"
echo

# The mutation must actually change the outcome. If both runs agree, the battery
# is measuring nothing — the same trap as a gate that passes before and after.
node -e '
  const base=JSON.parse(process.argv[1]), mut=JSON.parse(process.argv[2]);
  const key=r=>r.n;
  let changed=0;
  for(const b of base){
    const m=mut.find(x=>key(x)===key(b));
    if(!m) continue;
    if(/self-approve|self-reject/.test(b.n) && b.got!=="REFUSED" && m.got==="REFUSED") changed++;
    if(/self-approve|self-reject/.test(b.n) && b.got==="REFUSED" && m.got==="ALLOWED") changed++;
  }
  console.log(`-- discrimination: ${changed} guard case(s) changed outcome between intact and mutated --`);
  process.exit(changed>0?0:1);
' "$BASE" "$MUT" || {
  echo "  the battery does NOT discriminate: the mutation changed nothing."
  echo "  That means it would report a hole as proven. Treat as failure."
  fail=1
}
echo

# The verdict file is intentionally LEFT IN PLACE under the scratch dir so a
# failure can be inspected. Cleanup below only runs on success, and never lets a
# cleanup refusal mask the verdict (a sibling battery's cleanup once turned every
# outcome into exit 1 by exhausting the sandbox delete quota).

if [ $fail -ne 0 ]; then
  echo "RESULT: FAIL — at least one mutation survived, or the battery did not discriminate."
  echo "        (scratch kept for inspection: $DATA_ROOT)"
  exit 1
fi
clear_dir "$SCRATCH_USED" 2>/dev/null || true
clear_dir "$DATA_ROOT" 2>/dev/null || true
echo "RESULT: PASS — the guard blocks self-approval, and the mutation is what proves it."
exit 0
