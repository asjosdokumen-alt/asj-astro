#!/usr/bin/env bash
# rm-retry.sh — sourced by every mutation battery.
#
#   rm_retry <path>...   delete, retrying a TRANSIENT failure, and record the
#                        reason for every attempt that failed.
#
# ── THE MEASUREMENT THIS FILE EXISTS FOR ────────────────────────────────────
# A full 18-battery run reported 6-7 passed / 11-12 failed on a tree whose gates
# were all fine. The reason was always the same line, from a different battery:
#
#     LEFTOVER — src/__tsmut.ts survived the run
#
# and that leftover then became the NEXT battery's input: `tsconfig.json` saw it,
# `tsc` reported one extra error, the ratchet read the extra error as new debt,
# and a dozen unrelated gates went red. One un-deleted file, twelve findings.
#
# The battery's clean-up was not the defect. Instrumented AT the clean-up site,
# inside a full run, `rm -f "$MUTSRC"` returned:
#
#     07:52:38 pwd=/f/astro mutsrc=src/__tsmut.ts \
#              realpath=/f/astro/src/__tsmut.ts rc=1 exists=YES
#
# i.e. **rc=1, with the path correct and the file still present**. The two
# candidate explanations in docs/CI_BATTERY_RUNNER_STATUS.md were "the path is
# resolved against a different cwd" and "a transient Windows handle". The
# `realpath=` in that line kills the first; and the same path deletes with rc=0
# outside a run, and all twelve leftover fixtures of that run deleted cleanly
# afterwards, so the second is what is left.
#
# ── WHY A RETRY, AND WHY IT MUST LOG ────────────────────────────────────────
# A delete that fails for a reason which disappears on its own must be retried,
# or the battery reports a defect about ITSELF that is really about the OS. But
# a retry that hides the reason is as dangerous as no retry: it turns "the gate
# is fine" and "the gate is fine on a machine where deletes work" into the same
# green line. So every failed attempt is recorded, and a delete that never
# succeeds still fails -- loudly, and with a diagnosis instead of a shrug.
#
# ── WHY THE REASON IS `rm`'s OWN MESSAGE FIRST ──────────────────────────────
# The first version of the probe asked node for the errno, and that was wrong in
# a way worth recording. node is a WINDOWS binary here: handed an MSYS path like
# `/tmp/x` it resolves `C:\tmp\x`, not the directory MSYS calls `/tmp`. So the
# probe could report on -- and delete -- a DIFFERENT path from the one `rm` was
# given, and it silently reported `code=undefined errno=undefined` because
# `fs.rmSync(..., { recursive: true })` wraps failures in an AggregateError,
# which carries no `code` at all.
#
# `rm`'s own stderr has neither problem: it names the path it actually used and
# says "Permission denied" / "Device or resource busy" / "Directory not empty".
# That message is the primary evidence now. The errno is still collected, as a
# secondary, through `cygpath` so node and `rm` agree on what the path means.
#
# ── WHY THIS IS IN A SOURCED LIBRARY AND NOT IN THE RUNNER ──────────────────
# The runner already sweeps debris after every battery, and it keeps that. But
# the battery's own `LEFTOVER` check is what turns a leaked fixture into a red
# battery, and a retry that lives only in the runner cannot make that check
# honest -- the delete itself has to be the thing that retries.
#
# Sourcing it (rather than inlining it) keeps every battery runnable BY HAND
# with exactly the behaviour the runner sees. That equivalence is what every
# measurement in this repo rests on: `docs/CI_BATTERY_RUNNER_STATUS.md` proves a
# battery works by running it standalone. A `PATH` shim would have broken it.
#
# ── TUNABLES (env) ──────────────────────────────────────────────────────────
#   RM_RETRY_MAX     attempts before giving up            (default 5)
#   RM_RETRY_SLEEP   seconds between attempts             (default 1)
#   RM_RETRY_LOG     append failures here instead of stderr
#
# The runner sets RM_RETRY_LOG to a path OUTSIDE the repository, so the log is
# neither a leaked fixture nor something `sweepScratch()` removes mid-run.

# ── Guard against double-sourcing ───────────────────────────────────────────
if [ -n "${RM_RETRY_LOADED:-}" ]; then
  return 0 2>/dev/null || true
fi
RM_RETRY_LOADED=1

# Append one diagnostic line. Falls back to stderr when no log file is
# configured OR the configured one cannot be written -- a battery's diagnosis
# must not be lost because a temp path went away.
rm_retry_log() {
  if [ -n "${RM_RETRY_LOG:-}" ]; then
    if printf '%s\n' "$1" >>"$RM_RETRY_LOG" 2>/dev/null; then
      return 0
    fi
  fi
  printf '%s\n' "$1" >&2
}

# The errno a delete returns, asked of node. SECONDARY evidence only -- see the
# header: `rm`'s own message is the primary, because it cannot disagree with
# `rm` about which path was meant.
#
# The path is translated with `cygpath` when that exists, so node resolves the
# same file `rm` does. On a POSIX CI runner there is no cygpath and no
# translation is needed, which is why the fallback is the raw path.
#
# Prints "deleted-by-probe" when node removed the path (that is also a retry by
# a different route), "probe-unavailable" when node cannot run, and otherwise a
# description that includes the message, because an AggregateError has no code.
rm_retry_errno() {
  local raw="$1" translated
  translated="$(cygpath -w "$raw" 2>/dev/null)" || translated="$raw"
  [ -n "$translated" ] || translated="$raw"

  RM_RETRY_PATH="$translated" node -e '
const fs = require("node:fs");
const p = process.env.RM_RETRY_PATH;

const describe = (e) => {
  if (!e) return "no-error";
  const parts = [];
  if (e.code) parts.push("code=" + e.code);
  if (e.errno !== undefined && e.errno !== null) parts.push("errno=" + e.errno);
  if (e.message) parts.push("msg=" + String(e.message).replace(/\s+/g, " ").slice(0, 200));
  if (Array.isArray(e.errors) && e.errors.length) {
    parts.push(
      "nested=[" +
        e.errors
          .map((n) => (n && (n.code || n.message)) || String(n))
          .join(" | ")
          .slice(0, 200) +
        "]"
    );
  }
  return parts.join(" ") || "undescribed-error";
};

if (!p) {
  process.stdout.write("probe-unavailable");
} else {
  try {
    fs.rmSync(p, { recursive: true, force: true });
    process.stdout.write("deleted-by-probe");
  } catch (e) {
    let plain = "";
    try {
      fs.unlinkSync(p);
      plain = " unlink=ok";
    } catch (e2) {
      plain = " unlink=" + describe(e2);
    }
    process.stdout.write("rm=" + describe(e) + plain);
  }
}
' 2>/dev/null || printf 'probe-unavailable'
}

# Delete paths, retrying a transient failure. Paths only -- a leading flag is
# skipped by the probe (it is not a path) but is still passed to `rm`.
rm_retry() {
  if [ "$#" -eq 0 ]; then
    return 0
  fi

  local max="${RM_RETRY_MAX:-5}"
  local nap="${RM_RETRY_SLEEP:-1}"
  local n=0 rc=0 probe="" errmsg="" target="" a

  # The first non-flag argument, for the errno probe. `rm_retry -rf x` is not the
  # intended call shape, but a probe pointed at "-rf" would delete the cwd.
  for a in "$@"; do
    case "$a" in
      -*) ;;
      *)
        target="$a"
        break
        ;;
    esac
  done

  while :; do
    # `$?` is read on the very next line: an instrumented call between a command
    # and its status check has already sent this investigation down a false path
    # once, and that lesson is recorded in the status doc's rule 6.
    errmsg="$(rm -rf -- "$@" 2>&1)"
    rc=$?
    if [ "$rc" -eq 0 ]; then
      if [ "$n" -gt 0 ]; then
        rm_retry_log "rm_retry: OK on attempt $((n + 1)) of $max, after $n transient failure(s): $*"
      fi
      return 0
    fi

    n=$((n + 1))
    if [ -n "$target" ]; then
      probe="$(rm_retry_errno "$target")"
    else
      probe="no-path-argument"
    fi
    rm_retry_log "rm_retry: attempt $n of $max FAILED rc=$rc ($probe): $*"
    if [ -n "$errmsg" ]; then
      rm_retry_log "rm_retry:   rm said: $(printf '%s' "$errmsg" | tr '\n' ' ')"
    fi

    if [ "$n" -ge "$max" ]; then
      rm_retry_log "rm_retry: GIVING UP after $max attempt(s) -- the path is still present and the reason is above."
      return "$rc"
    fi

    sleep "$nap"
  done
}
