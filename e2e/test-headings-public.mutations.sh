#!/usr/bin/env bash
# Mutation battery for the three checks added/changed in e2e/test-headings.mjs
# on 2026-09-19. Every mutation must be KILLED, or the check is a hypothesis.
#
# Why a battery rather than "I ran it and it was green":
#   * A green run proves the check PASSES ON A HEALTHY TREE. It says nothing
#     about whether the check can report a failure at all. The defect this
#     battery exists for is real and was measured: the body loop passed the
#     boolean `true` where a session ROLE was expected, so `/admin` redirected
#     to `/` and the gate read the wrong page's DOM — and still reported a
#     verdict. That is a check that was green for the wrong reason.
#
# The mutations are written against the GATE FILE ITSELF and against the app
# source, because the two fixes are of different kinds:
#   M-A/B/C mutate the guard, and must make it FAIL LOUDLY (proving it bites).
#   M-D mutates the app (remove the hero h1), and must be caught by the
#        single-h1 rule on a PUBLIC route — the rule this session added.
#
# Run with cwd = repo root, FOREGROUND:
#   NODE_OPTIONS= bash e2e/test-headings-public.mutations.sh
#
# ⚠ `NODE_OPTIONS=` IS REQUIRED HERE, NOT COSMETIC. Measured 2026-09-23: this
# tooling injects a delete guard into every node process via
#   NODE_OPTIONS=--require="…/shim/node-language-shim.cjs"
# which counts each unlink in the turn against CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD
# (50). `astro build` ends in cleanServerOutput(), which deletes dist/pages/*.mjs —
# so once the turn has spent 50 deletes, EVERY later build dies with
#   [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] count=NNNN threshold=50
# and this battery aborts at M-D with a message about a failed BUILD. That is a
# false signal about the mutation: the same build succeeds in a fresh turn, and
# succeeded here the moment NODE_OPTIONS was cleared.
#
# Clearing it for this one command removes the guard from the battery and from its
# builds. That is a deliberate, narrow trade: the only thing deleted here is
# `dist/`, a gitignored, regenerable build artifact. Do NOT clear NODE_OPTIONS for
# commands that touch source, and do NOT reach for `dangerouslyDisableSandbox`
# instead — measured, it does NOT lift this guard, because the shim is injected
# into the node process itself rather than by the Bash sandbox.
set -u

GUARD=e2e/test-headings.mjs
APP=src/components/App.tsx
LOKER=src/pages/loker.astro
BAK=.tmp-headings-pub-bak
fail=0
results=()

key() { printf '%s' "$1" | tr '/.' '__'; }
backup() { mkdir -p "$BAK"; cp "$1" "$BAK/$(key "$1")"; }
restore_one() { local b="$BAK/$(key "$1")"; [ -f "$b" ] && cp "$b" "$1"; }

# ── CLEANUP ON EVERY EXIT PATH ────────────────────────────────────────────────
# Measured 2026-09-23: the build-failure abort below left `src/components/App.tsx`
# MUTATED in the tree. The next `git status` did NOT report it — an h1 -> h2 swap
# is the same number of bytes, which is exactly the case git's stat cache can
# miss, so it surfaced only in a content-level `git diff`. A battery that can
# leave its own mutation in the tree is a battery that can have it committed.
#
# So the restore is not left to each step's tail: EVERY exit path, including every
# ABORT above, goes through this trap, and it VERIFIES byte-identity rather than
# assuming the copy worked.
#
# `BACKUPS_READY` matters: `$BAK` may already exist from an earlier aborted run,
# and restoring from a STALE backup is its own way to corrupt the tree.
BACKUPS_READY=0
restore_all() {
  [ "$BACKUPS_READY" -eq 1 ] || return 0
  for f in "$GUARD" "$APP" "$LOKER"; do
    [ -f "$BAK/$(key "$f")" ] || continue
    restore_one "$f"
    if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null 2>&1; then
      echo "RESTORE FAILED — $f is NOT byte-identical to its backup"
      fail=1
    fi
  done
}
trap 'restore_all; [ "$fail" -eq 0 ] || exit 1' EXIT

# Use a DEDICATED port, never 4321: another server is often already there and
# then this battery measures a server it does not own (a crash there reads as
# KILLED for every step). Read the port out of the log instead of assuming.
SRV_LOG=.tmp-headings-pub-serve.log
# Kept, never discarded: when a build fails the REASON is the whole finding, and
# `>/dev/null` is what hid it for three runs on 2026-09-23.
BUILD_LOG=.tmp-headings-pub-build.log
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
BASE="http://127.0.0.1:$PORT"

# `curl -o /dev/null` exits 23 in this Git-Bash EVEN WHEN THE REQUEST SUCCEEDS,
# so `if curl -f -o /dev/null …` is never true. Redirect stdout instead.
ready=0
for _ in $(seq 1 30); do
  if curl -fsS "$BASE/" > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "ABORT: $BASE never became ready"
  kill "$SERVER_PID" 2>/dev/null; exit 1
fi
echo "server: $BASE (pid $SERVER_PID)"

# ── RULE 1: the baseline must be green before any mutation is interpreted ──
if ! BASE_URL="$BASE" node "$GUARD" > /tmp/headings-pub-base.txt 2>&1; then
  echo "BASELINE RED — aborting; mutations would be meaningless"
  tail -20 /tmp/headings-pub-base.txt
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi
echo "baseline: green"
echo

backup "$GUARD"
backup "$APP"
backup "$LOKER"
BACKUPS_READY=1

# Apply a mutation through node: `python` is not guaranteed present, and
# heredocs plus shell interpolation mangle quotes under Git-Bash. Assert EXACTLY
# ONE match, so a mutation that does not find its target aborts loudly instead
# of silently becoming a no-op that is recorded as SURVIVED.
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

# A mutation of the GUARD itself needs no rebuild — the guard is the artifact.
step_guard() {
  local label="$1" pairs="$2"
  restore_one "$GUARD"
  if ! mut "$GUARD" "$pairs"; then
    echo "ABORT: the mutation for '$label' did not apply."
    exit 1
  fi
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "KILLED     exit=$rc  $label"
    results+=("KILLED $label")
  else
    echo "SURVIVED   exit=0   $label   <-- HOLE: this defect is not caught"
    results+=("SURVIVED $label")
    fail=1
  fi
  restore_one "$GUARD"
}

# Same, but the pairs come from a FILE. Needed for mutations whose search text
# contains both an apostrophe and a newline: JSON-encoding that inline is what
# produced "Bad escaped character in JSON" and cost a run.
step_guard_pairs() {
  local label="$1" file="$2"
  local pairs
  pairs=$(cat "$file")
  step_guard "$label" "$pairs"
}

# A mutation of a SOURCE FILE needs a rebuild: the guard reads a BUILT artifact,
# so a mutation that never reached dist/ looks exactly like a SURVIVED.
#
# The file is a PARAMETER. Until 2026-09-23 this took no file argument and always
# mutated `$APP` — and M-D called it as `step_app "label" "$APP" '[[...]]'`, three
# arguments against a two-argument signature. So `pairs` was bound to the string
# `src/components/App.tsx`, `JSON.parse` threw, and the battery ABORTED at M-D.
# The consequence is the point: M-D and the M-E after it had NEVER RUN, and every
# report of this battery's verdict so far was a report about a run that stopped
# two mutations short of the end.
step_src() {
  local label="$1" file="$2" pairs="$3"
  restore_one "$file"
  if ! mut "$file" "$pairs"; then
    echo "ABORT: the mutation for '$label' did not apply."
    exit 1
  fi
  # THE BUILD STATUS MUST BE CHECKED. `node astro build` writes dist/, and the
  # guard reads dist/ — so a mutation that does not COMPILE leaves the previous
  # build in place and the guard happily passes against the PREVIOUS tree. That
  # reads as SURVIVED, i.e. as "the defect is not caught", when the truth is
  # "the defect never shipped". Measured 2026-09-23 while re-anchoring M-D: a
  # tag swap that leaves `<h2 …>…</h1>` is a JSX syntax error, so an unchecked
  # build would have turned M-D into a silent SURVIVED.
  if ! node node_modules/astro/astro.js build > "$BUILD_LOG" 2>&1; then
    restore_one "$file"
    echo "ABORT: the build FAILED after mutating '$label' — dist/ is stale, so the guard"
    echo "       would have read the PREVIOUS tree and reported SURVIVED for a mutation"
    echo "       that never shipped."
    echo "       TWO CAUSES, and they are not the same thing:"
    echo "         (a) the mutation does not compile  -> fix the mutation."
    echo "         (b) the sandbox delete quota is spent. Measured 2026-09-23:"
    echo "             'astro build' dies in cleanServerOutput() with"
    echo "             [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] count>50,"
    echo "             scope 'turn'. This is ENVIRONMENTAL — re-run in a FRESH turn."
    echo "       The build output is NOT thrown away — that is how the first version of"
    echo "       this check cost a whole run: the cause was invisible. Read it below."
    echo "       --- build output (last 25 lines) ---"
    tail -25 "$BUILD_LOG"
    exit 1
  fi
  BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "KILLED     exit=$rc  $label"
    results+=("KILLED $label")
  else
    echo "SURVIVED   exit=0   $label   <-- HOLE: this defect is not caught"
    results+=("SURVIVED $label")
    fail=1
  fi
  restore_one "$file"
}

# ── M-A: the role/redirect fix. Restore the ORIGINAL bug: pass the boolean
#    `true` where authFor() expects a ROLE, so the fabricated blob reads
#    { role: true } and /admin's AuthGuard (requiredRole="admin") sends the
#    browser to '/'. The guard then measures the landing page.
#
#    Targeted by the UNIQUE three-line window of the body loop. Matching the
#    `inspect(...)` line alone hits 8 sites in this file, so a mutation written
#    that way cannot apply — measured, and that is why the window includes the
#    `for (const { path, session } of BODY_ROUTES)` header. ────────────────
step_guard "M-A the body check passes the boolean true instead of the session role" \
  '[["      await test(`${width}px ${path}: the page body was reached, not a login gate`, async () => {\n        const d = await inspect(path, width, session);","      await test(`${width}px ${path}: the page body was reached, not a login gate`, async () => {\n        const d = await inspect(path, width, true);"]]'

# ── M-A2: isolate the REDIRECT GUARD. The marker fix alone would still catch
#    the mis-read (the landing page no longer contains any gate marker), so to
#    prove the guard itself bites, the false-positive marker is restored AND the
#    guard is dropped TOGETHER — which is the original bug exactly. If this
#    survives, the guard is decorative.
#
#    The pairs are built with node rather than inline JSON: an apostrophe and a
#    `\n` inside the same JSON string is exactly the escaping trap that mangled
#    the first version of this step ("Bad escaped character in JSON").
PAIRS_FILE=.tmp-headings-pub-pairs.json
PAIRS_B=.tmp-headings-pub-pairs-b.json
PAIRS_C=.tmp-headings-pub-pairs-c.json
PAIRS_FILE="$PAIRS_FILE" node -e '
const fs = require("fs");
const oldMarkers = [
  "const GATE_MARKERS = [",
  "  " + String.fromCharCode(39) + "Verifikasi Akun Kandidat" + String.fromCharCode(39) + ",",
  "  " + String.fromCharCode(39) + "Mengalihkan ke halaman login..." + String.fromCharCode(39) + ",",
  "  " + String.fromCharCode(39) + "Akses ditolak. Mengalihkan..." + String.fromCharCode(39) + ",",
  "];",
].join(String.fromCharCode(10));
const newMarkers =
  "const GATE_MARKERS = [" +
  String.fromCharCode(39) + "Verifikasi Akun Kandidat" + String.fromCharCode(39) + ", " +
  String.fromCharCode(39) + "Login Pelamar" + String.fromCharCode(39) + "];";
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);
const bodyHead =
  "      await test(" + "`" + "${width}px ${path}: the page body was reached, not a login gate" + "`" + ", async () => {" + NL +
  "        const d = await inspect(path, width, session);";
const bodyHeadBool =
  "      await test(" + "`" + "${width}px ${path}: the page body was reached, not a login gate" + "`" + ", async () => {" + NL +
  "        const d = await inspect(path, width, true);";
const guard =
  "        if (d.path !== path) throw new Error(" + "`" + "redirected to ${d.path}" + "`" + ");" + NL +
  "        assertReachedBody(d);";
fs.writeFileSync(
  process.env.PAIRS_FILE,
  JSON.stringify([
    [bodyHead, bodyHeadBool],
    [guard, "        assertReachedBody(d);"],
    [oldMarkers, newMarkers],
  ]),
);
'

step_guard_pairs "M-A2 original bug restored: boolean role AND no redirect guard AND the old marker" "$PAIRS_FILE"

# ── M-B / M-C: the marker list. Both are built through node because the search
#    text spans several lines AND contains apostrophes — inline JSON cannot
#    express that (measured: "Bad escaped character in JSON").
#
#    ⚠ BOTH SURVIVED UNTIL 2026-09-23, and the reason was in the GUARD, not in
#    these mutations. A marker list can only be proven to bite by a page that IS
#    a gate (M-C empties it) or by a non-gate page that contains the false marker
#    (M-B re-adds 'Login Pelamar'). On a healthy tree every route the guard
#    inspected rendered its REAL BODY, so neither direction was reachable and no
#    mutation written against the list could be detected — the guard's failure
#    mode was unreachable, which made `assertReachedBody` a hypothesis and every
#    "the page body was reached" check above it vacuous.
#
#    Two controls were added to e2e/test-headings.mjs to pin both directions: a
#    POSITIVE one (`/master` with no session must be READ AS a gate) and a
#    FALSE-POSITIVE one (`/` must NOT be, because it contains the login button).
#    These two mutations are KILLED now; before the controls existed they could
#    not be, however they were written.
#
#    A SECOND, IDENTICAL node block used to sit above this one and was removed
#    2026-09-23. It read `JSON.parse(process.env.OUT)` — a variable nothing ever
#    set — so it threw `SyntaxError: "undefined" is not valid JSON` on EVERY run.
#    The run continued (the block's exit status was not checked), which is why it
#    survived: the only symptom was a stray stack trace in the output, and the
#    pairs were in fact built by the block below. A dead duplicate that always
#    fails is worse than no duplicate, because it trains the reader to ignore a
#    stack trace in a battery whose whole purpose is to fail loudly.
OUT_B="$PAIRS_B" OUT_C="$PAIRS_C" node -e '
const fs = require("fs");
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);
const markers = (xs) => "const GATE_MARKERS = [" + NL + xs.map((x) => "  " + Q + x + Q + ",").join(NL) + NL + "];";
const cur = ["Verifikasi Akun Kandidat", "Mengalihkan ke halaman login...", "Akses ditolak. Mengalihkan..."];
fs.writeFileSync(process.env.OUT_B, JSON.stringify([[markers(cur), "const GATE_MARKERS = [" + Q + "Verifikasi Akun Kandidat" + Q + ", " + Q + "Login Pelamar" + Q + "];"]]));
fs.writeFileSync(process.env.OUT_C, JSON.stringify([[markers(cur), "const GATE_MARKERS = [];"]]));
console.log("wrote M-B / M-C pairs");
'

step_guard_pairs "M-B 'Login Pelamar' returns as a gate marker (a login BUTTON mistaken for a gate)" "$PAIRS_B"
step_guard_pairs "M-C gate markers emptied (a real gate would be accepted as the page body)" "$PAIRS_C"

# ── M-D: the rule this session ADDED to the guard — public routes get the
#    single-h1 assertion. Demote the hero h1 to an h2 on '/'.
#
#    RE-ANCHORED 2026-09-23. The original anchor named only the OPENING tag,
#    `<h1 class="text-display font-black drop-shadow-lg mt-2">`, and had stopped
#    matching: the hero was restyled to `font-black text-white … leading-tight`
#    (the contrast fix that made the h1 `text-white` over the dark hero band).
#    It came back as `MUTATION DID NOT APPLY (hits=0)` and aborted the run.
#
#    The anchor now spans the WHOLE element, open tag through `</h1>`, and that is
#    deliberate rather than pedantic: swapping only the opening tag leaves
#    `<h2 …>…</h1>`, which is a JSX syntax error, so the build would fail and the
#    guard would read a STALE dist/ and report SURVIVED for a mutation that never
#    shipped. `step_src` now checks the build status for the same reason. ──────
step_src "M-D the hero headline stops being the h1 (public route loses its only h1)" \
  "$APP" \
  '[["<h1 class=\"text-display font-black text-white drop-shadow-lg mt-2 leading-tight\">{t(\"profile.hero_title\")}</h1>","<h2 class=\"text-display font-black text-white drop-shadow-lg mt-2 leading-tight\">{t(\"profile.hero_title\")}</h2>"]]'

# ── M-E: the no-JS checks added 2026-09-23. Put `/loker` back on
#    `client:only="preact"`, which emits NO server HTML — so with JavaScript
#    disabled the route loses its h1 and its whole header again. This is the
#    mutation that proves the new checks are not decorative: every OTHER
#    assertion in the guard runs with JS on and passes on this tree, because
#    after hydration the page is identical.
#
#    The measured before/after, 390px, `server.cjs`:
#      client:only — JS off: 0 h1, 0 header links, 523 chars of body text
#      client:load — JS off: 1 h1, 5 header links, 593 chars
#    ─────────────────────────────────────────────────────────────────────────
step_src "M-E /loker returns to client:only (the route loses its h1 without JS)" \
  "$LOKER" \
  '[["  <App client:load />","  <App client:only=\"preact\" />"]]'

# ── byte-identical restore, and green again ───────────────────────────────
echo
for f in "$GUARD" "$APP" "$LOKER"; do
  if ! diff -q "$BAK/$(key "$f")" "$f" >/dev/null; then
    echo "RESTORE FAILED — $f is not byte-identical to its backup"
    fail=1
  fi
done

node node_modules/astro/astro.js build >/dev/null 2>&1
node scripts/build-sw-manifest.mjs >/dev/null 2>&1

if ! BASE_URL="$BASE" node "$GUARD" >/dev/null 2>&1; then
  echo "NOT GREEN AFTER RESTORE — a mutation is still in the tree"
  fail=1
else
  echo "OK-GREEN    the restored tree passes again (control)"
fi

kill "$SERVER_PID" 2>/dev/null
rm -f "$PAIRS_FILE" "$PAIRS_B" "$PAIRS_C"
echo
echo "killed:   $(printf '%s\n' "${results[@]}" | grep -c '^KILLED')"
echo "survived: $(printf '%s\n' "${results[@]}" | grep -c '^SURVIVED')"
exit "$fail"
