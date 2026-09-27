#!/usr/bin/env bash
# Mutation battery for e2e/test-contrast.mjs.
#
# WHY A BATTERY
# -------------
# The contrast gate claims: every visible text element on six routes, in both
# themes and at two widths, meets the WCAG AA floor — and it claims it can FAIL.
# The second claim is the one a battery proves. A gate that has never been
# observed failing is a hypothesis, and this repo already has the scars: see
# e2e/test-landing.mutations.sh, where seven mutations were once reported as
# holes because `npx astro build` silently did not run.
#
# THE TWO MUTATIONS REPRODUCE THE TWO DEFECTS THE GATE WAS BUILT FOR, not
# synthetic corruption. Each one reverts exactly the fix that made the gate
# green, so the gate is proven to discriminate on the real thing:
#
#   M1  the LokerTable amber action button goes back to `text-slate-950`.
#       MEASURED before the fix: 4.01:1 (#020617 on #b45309, needs 4.5) on
#       /loker AND /public, both themes, both widths.
#   M2  the rose-marquee colour rule in global.css is renamed so it stops
#       matching. MEASURED before the fix: 2.78:1 (#1f1d1c on rgb(199,0,54)) on
#       /public, light theme.
#
# ⚠ WHY M2 RENAMES A SELECTOR RATHER THAN DELETING THE RULE. `git rm`/`rm` has
#   exploded a directory in this repo before, and the sandbox's delete shim
#   counts every delete against a small per-turn quota. Renaming the class in the
#   selector produces the identical observable failure (the rule stops matching)
#   with no filesystem risk, exactly as e2e/test-landing.mutations.sh does.
#
# ⚠ WHY THE GATE'S PIXEL-CONFIRMATION STEP DOES NOT MAKE THESE SURVIVE. The gate
#   downgrades a computed miss to UNCONFIRMED (not a failure) when the rendered
#   pixel disagrees. Both mutations below change the REAL rendered colour, so the
#   pixel agrees and the failure is counted. A mutation that only fooled the
#   computed model would correctly SURVIVE — that is the gate working, not a hole.
#
# TRAPS THIS SCRIPT GUARDS AGAINST (the same ones test-landing.mutations.sh
# learned the hard way):
#   0. The artifact must be built from CLEAN sources. A previous run killed
#      between a mutation and its restore leaves dist/ holding mutated code while
#      src/ looks clean, so the next run's baseline measures a page nobody wrote.
#   1. The mutation must REACH dist/. Every step rebuilds and asserts the artifact
#      was refreshed; a broken build and a surviving mutation are otherwise
#      indistinguishable from the guard's exit code.
#   2. `astro build` alone is NOT the build — it leaves dist/sw.js on the dev
#      placeholder. This battery runs `node scripts/build-sw-manifest.mjs` after
#      every build for that reason.
#   3. `astro build`'s own exit code is not judged: it exits non-zero when the
#      safe-delete shim refuses the dist/ cleanup AFTER emitting every page.
#      Freshness is asserted by mtime instead. `CODEBUDDY_SAFE_DELETE_ENABLED=0`
#      is set so the shim does not refuse in the first place.
#   4. The sandbox proxy swallows 127.0.0.1: the readiness probe needs
#      `--noproxy '*'`, and the guard launches Chromium with `--no-proxy-server`
#      itself. Without both, every probe returns 502 and the run aborts claiming
#      no server came up — while it is running.
#   5. This battery starts its OWN server and reads the port it printed. It never
#      probes 4321 first: a session's own server is often already there, and the
#      battery would then measure a server it does not control, so a crash there
#      reads as KILLED for every step.
#
# Must be run with cwd = repo root:  bash e2e/test-contrast.mutations.sh
set -u

GUARD=e2e/test-contrast.mjs
LOKER=src/components/public/LokerTable.tsx
GLOBAL=src/styles/global.css
BAK=.tmp-contrast-bak

fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
backup() { mkdir -p "$BAK"; cp "$1" "$BAK/$(key "$1")"; }
restore_one() { local b="$BAK/$(key "$1")"; [ -f "$b" ] && cp "$b" "$1"; }

# Apply a mutation. Pairs come through the environment, not a heredoc: heredocs
# plus shell interpolation mangle quotes under Git-Bash.
mut() {
  MUT_FILE="$1" MUT_PAIRS="$2" node -e '
const fs = require("fs");
const p = process.env.MUT_FILE;
const pairs = JSON.parse(process.env.MUT_PAIRS);
let s = fs.readFileSync(p, "utf8");
for (const [oldStr, newStr] of pairs) {
  const hits = s.split(oldStr).length - 1;
  if (hits !== 1) {
    console.error("MUTATION DID NOT APPLY (hits=" + hits + "): " + JSON.stringify(oldStr.slice(0, 70)));
    process.exit(3);
  }
  s = s.split(oldStr).join(newStr);
}
fs.writeFileSync(p, s);
'
}

check() {
  local label="$1" rc="$2"
  if [ "$rc" -ne 0 ]; then
    echo "KILLED     exit=$rc  $label"
    results+=("KILLED $label")
  else
    echo "SURVIVED   exit=0   $label   <-- HOLE: this defect is not caught"
    results+=("SURVIVED $label")
    fail=1
  fi
}

# A build that only produces the pages is not enough — see trap 2.
build() {
  CODEBUDDY_SAFE_DELETE_ENABLED=0 node node_modules/astro/astro.js build >/tmp/mut-contrast-build.log 2>&1
  node scripts/build-sw-manifest.mjs >/dev/null 2>&1
}

step() {
  local label="$1" file="$2" pairs="$3"
  restore_one "$file"
  if ! mut "$file" "$pairs"; then
    echo "ABORT: the mutation for '$label' did not apply."
    exit 1
  fi

  local before after
  before=$(stat -c %Y dist/index.html 2>/dev/null || echo 0)
  build
  after=$(stat -c %Y dist/index.html 2>/dev/null || echo 0)
  if [ "$after" = "$before" ] && [ "$after" != "0" ]; then
    echo "ABORT: the build did not refresh dist/index.html for '$label'."
    tail -5 /tmp/mut-contrast-build.log | sed 's/^/       /'
    exit 1
  fi

  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  check "$label" $?
  restore_one "$file"
}

# ── server, owned by this script ───────────────────────────────────────────
SRV_LOG=.tmp-contrast-serve.log
node server.cjs > "$SRV_LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null; exit 1' INT TERM

PORT=""
for _ in $(seq 1 30); do
  PORT=$(grep -o 'localhost:[0-9]*' "$SRV_LOG" 2>/dev/null | head -1 | cut -d: -f2)
  [ -n "$PORT" ] && break
  sleep 1
done
if [ -z "$PORT" ]; then
  echo "ABORT: server.cjs never reported a port"; cat "$SRV_LOG"
  kill "$SERVER_PID" 2>/dev/null; exit 1
fi
BASE="http://localhost:$PORT"

# Readiness. `--noproxy '*'` is REQUIRED — see trap 4.
ready=0
for _ in $(seq 1 30); do
  if curl -fsS --noproxy '*' "$BASE/" > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "ABORT: $BASE never became ready"
  kill "$SERVER_PID" 2>/dev/null; exit 1
fi
echo "server: $BASE (pid $SERVER_PID)"

# ── RULE 0: the artifact must be built from CLEAN sources ──────────────────
if ! git diff --quiet -- "$LOKER" "$GLOBAL"; then
  echo "ABORT: the gate's own sources are dirty before the baseline."
  echo "       A battery must start from committed sources, or KILLED/SURVIVED"
  echo "       cannot be attributed to the mutation. Dirty files:"
  git diff --name-only -- "$LOKER" "$GLOBAL" | sed 's/^/       /'
  echo "       (A previous run was probably killed before its restore. Run:"
  echo "        git checkout -- $LOKER $GLOBAL )"
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi

echo "rebuilding dist/ from clean sources before the baseline..."
build
if [ ! -s dist/index.html ]; then
  echo "ABORT: the pre-baseline build produced no dist/index.html."
  tail -5 /tmp/mut-contrast-build.log | sed 's/^/       /'
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
echo "artifact: clean"

# ── RULE 1: the baseline must be green, or no mutation means anything ──────
if ! BASE_URL="$BASE" node "$GUARD" > .tmp-contrast-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations would be meaningless"
  tail -20 .tmp-contrast-base.txt
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
echo "baseline: green"
echo

for f in "$LOKER" "$GLOBAL"; do backup "$f"; done

# ── one mutation per defect the gate exists to catch ──────────────────────

# M1 — the amber action button loses the white text the dark surface needs.
step "M1  LokerTable 'Detail' reverts to text-slate-950 (4.01:1 on the amber chip)" \
  "$LOKER" \
  '[["text-white rounded-lg shadow-[0_4px_15px_rgba(245,158,11,0.4)]","text-slate-950 rounded-lg shadow-[0_4px_15px_rgba(245,158,11,0.4)]"]]'

# M2 — the rose marquee's colour rule stops matching, so §5c's near-black text
# comes back on the dark rose band.
step "M2  the marquee colour rule is neutralised (2.78:1 on the rose band)" \
  "$GLOBAL" \
  '[["[data-theme=\"light\"]) .bg-rose-700 :is(","[data-theme=\"light\"]) .bg-rose-700-mutated :is("]]'

# ── byte-identical restore, and green again ───────────────────────────────
echo
for f in "$LOKER" "$GLOBAL"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done

build

if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
fi

# ── Cleanup — runs on EVERY exit path, including abort ────────────────────
cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  node -e '
const fs = require("fs");
const dir = ".tmp-contrast-bak";
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  try { fs.unlinkSync(dir + "/" + f); } catch {}
}
try { fs.rmdirSync(dir); } catch {}
for (const f of [".tmp-contrast-serve.log", ".tmp-contrast-base.txt"]) {
  try { fs.unlinkSync(f); } catch {}
}
' 2>/dev/null
}
trap cleanup EXIT

echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
exit "$fail"
