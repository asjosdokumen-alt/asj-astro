# CI battery runner — status, and the cause four runs got wrong

**Written 2026-09-16.** Answers §1.1(a) of `docs/REMAINING_BY_DISCIPLINE.md`.
**Do not push** — `newrepo/main` is still `a5f9549` (production deploy).

## 0. The short version

The 18 hermetic batteries report **6–7 passed / 11–12 failed when run from
inside this agent's shell**. The cause is not the batteries, not the runner, not
the gates, and not Windows file handles. It is the agent's own `rm`:

    $ type rm
    rm is a function
    rm () { "${CODEBUDDY_SAFE_DELETE_BIN_DIR}/rm" "$@"; }

`safe-delete-bash-env.sh` is sourced through `BASH_ENV` into **every** bash
subprocess and exports `rm`, `unlink` and `rmdir` wrappers. The wrapper allows
**50 deletions per turn** and then refuses:

    rm said: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]
             {"count":72,"threshold":50,"scope":"turn",
              "targets":["/e/astro/src/__tsmut.ts"],"targetCount":1}

A battery run performs hundreds of deletions. Past the fiftieth, **every**
clean-up in **every** battery is refused — so the fixture survives, the battery
reports `LEFTOVER`, and the next battery measures a dirty tree. That is the
entire cascade.

**It is an artifact of the measuring environment, not of the repository.**
GitHub Actions has no such shim, so the `batteries` job is not affected by it.

## 1. What the gap was

    grep -c 'mutations\.sh' .github/workflows/*.yml   ->  1

and that single hit was a **comment** (`ci.yml:68`), not a `run:`. No npm script
invoked the batteries either. So the manifest line

    proven able to fail 22/22 (100%)

meant **"a battery file exists"**, never "the battery still works". A battery that
stops applying its mutation is indistinguishable from a gate that cannot see the
defect — and `check-md-tables.mutations.sh` had already rotted that way before
anything noticed.

That gap is real and is closed.

## 2. What is DONE and committed

| Piece | Where |
|---|---|
| Runner that executes the hermetic set, reading the set from the manifest | `scripts/ci/run-batteries.mjs` |
| `battery` classification on every gate | `scripts/ci/review-manifest.json` |
| `verify:batteries` + `verify:batteries:list` npm scripts | `package.json` |
| Its own battery, R1–R8 (plus R7c) | `scripts/ci/run-batteries.mutations.sh` |
| `batteries` CI job | `.github/workflows/ci.yml` |
| C7 — enforces the classification the runner reads | `scripts/ci/verify-review-manifest.mjs` |
| C8 — every battery on disk is accounted for by a gate or by `testBatteries` | `scripts/ci/verify-review-manifest.mjs` |
| `*.sh text eol=lf` — a CRLF checkout silently kills every multi-line anchor | `.gitattributes` |
| Sweeps retry, and a sweep that gives up is a FINDING with its error | `scripts/ci/run-batteries.mjs` |
| `rm_retry` — a failed delete prints `rm`'s own reason instead of a bare rc=1 | `scripts/ci/lib/rm-retry.sh` |

The gate count and the ci/infra/none split are deliberately **not** written into
this table. It used to say "all 25 gates (measured: 18 ci / 6 infra / 1 none)",
and by 2026-09-18 that was 34 gates and 20 / 13 / 1 — a prose count has nothing
checking it, so it drifts and then misleads. `npm run verify:review-manifest`
prints the live numbers under **Battery classification**, and
`npm run verify:batteries:list` prints exactly which batteries will run.

Three rotted batteries were also repaired (`check-md-tables`, `cold-start-gate`,
`verify-review-manifest`) and `verify:env`'s missing scratch cleanup added.

## 3. How the cause was finally seen

Four runs (945 s, 1166 s, 1118 s, ~1285 s) all failed the same way, and every
explanation in the previous version of this file was wrong. The instrument that
settled it was not clever: the delete helper was made to **print `rm`'s own
stderr** on every failed attempt. One run produced, verbatim:

    rm_retry: attempt 1 of 5 FAILED rc=1 (...) : src/__tsmut.ts
    rm_retry:   rm said: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]
                         {"count":72,"threshold":50,"scope":"turn",
                          "targets":["/e/astro/src/__tsmut.ts"],"targetCount":1}

`count:72`, `threshold:50`. The failure was never about a file, a path or a
handle. It was about **how many deletions had already happened in the turn**.

## 4. Why the earlier explanations were wrong

- **"The path is resolved against a different cwd."** The in-run probe printed
  `realpath=/f/astro/src/__tsmut.ts`. The path was correct.
- **"A transient Windows handle held by a subprocess."** The refusals were *not*
  transient. They recurred on all five retries, one second apart, and on every
  later attempt in the same run — while the same paths deleted cleanly the moment
  the run ended. A handle does not respect a run boundary; a counter does.
- **"Elapsed time and accumulated system state inside a ~21-minute run."** Close
  in spirit, wrong in mechanism: it is accumulated **delete count**, not time. A
  short run that deletes a lot fails; a long run that deletes little would not.
- **"The battery logic is correct — standalone it reports 5 killed / 0 survived."**
  True, and it is exactly what a per-turn quota looks like from the inside: an
  isolated battery stays under 50.
- **"Only the full 18-battery set fails."** Also exactly what a quota predicts.

None of this was findable by reasoning. It needed one instrument that printed the
reason instead of the verdict.

## 5. What is measured about the quota

- **node is not subject to it.** 60 `fs.unlinkSync` calls in one turn: **60 ok,
  0 failed**. The quota is enforced by the shell wrappers, not the filesystem.
- **the shell is.** `rm` was refused with `count` above `threshold`.

That asymmetry is why the runner's sweeps are the right place for the structural
fix: they are node, so they can always clean up, and they now say so when they
cannot. Before that change they wrapped `fs.rmSync` in
`try {} catch { /* best effort */ }` — a failed sweep was invisible, which is
precisely how one leftover file became eleven red gates.

## 6. What is NOT fixed

The batteries' own clean-up still calls `rm`, so under the agent's quota a battery
reports `LEFTOVER` for a file it was never allowed to remove.

**`rm_retry` does not defeat a quota.** Retrying a refusal is still a refusal —
measured, 5 attempts, 5 refusals. What it does is print the reason, and that is
what found this. It is a diagnostic, not a remedy, and it must not be described
as one.

## 7. How to measure the real acceptance test

Two honest options, and the choice belongs to the owner because it touches a
safety control:

1. **In CI.** The `batteries` job runs on GitHub Actions, where `rm` is `rm`.
   This is the only environment whose verdict is about the repository.
2. **Locally, outside the agent's shell** — a normal terminal has no `BASH_ENV`
   shim, so `type rm` prints a path and not a function.

The shim does have a documented pass-through (it execs the real `rm` when
`CODEBUDDY_SESSION_ID` and `CLAUDE_SESSION_ID` are both unset), but that is
disabling a bulk-delete guard on purpose, and it should be a deliberate decision
rather than a convenience.

## 8. Rules this work established

1. **Never edit anything under `scripts/ci/**` or `.ci/**` while
   `.tmp-battery-run.lock` exists.** A battery backs up and restores the files it
   mutates, and its restore will overwrite you. Verify edits with `grep -c`, not
   with `git diff`.
2. **A killed run leaves a mutated tracked gate.** Measured: a run interrupted
   mid-battery left `scripts/ci/verify-projections.mjs` holding mutation S2
   (`stripBlockComments` reduced to `return src;`), because the `trap ... EXIT`
   never fired. The backup was pristine — the interruption was the problem. The
   runner's radius pre-flight refuses to start on that, which is correct, but it
   does not repair it: `git checkout -- <path>` does.
3. **A mutation battery needs its own battery**, or "proven once" decays silently.
4. **Attribution is not isolation.** `sweepLeaks()` (after) attributes; `sweepFixtures()`
   (before) isolates. A runner needs both.
5. **A background process started with `&` inside a tool command is killed when
   that command returns.** Start the watcher and the run from ONE process.
6. **`$?` must be read immediately after the command it describes.**
7. **Print the reason, not the verdict.** Four runs and several sessions were lost
   to a line that said `rc=1`. The line that ended it said *why*. Any harness that
   collapses a failure into a boolean will hide the next one the same way.
