# Code Review Process

How a change flows through this repository, and where the gate actually bites.

Companion documents: [`CODE_REVIEW_STANDARD.md`](./CODE_REVIEW_STANDARD.md) (what
"reviewed" means) · [`CODE_REVIEW_CHECKLIST.md`](./CODE_REVIEW_CHECKLIST.md) (the
items) · [`CODE_REVIEW_AUDIT.md`](./CODE_REVIEW_AUDIT.md) (the evidence).

---

## 1 · Why the gate is local

The single most important fact about this repository's delivery pipeline is this
(measured, A-02):

> **Pushing `main` publishes production.** The Netlify site is git-linked —
> `netlify.toml` has a `[build]` block and `.netlify/state.json` holds the site id.
>
> **The gated deploy workflow does not run on a push.** `deploy-production.yml`
> triggers on a tag (`v*`), a published release, or a manual dispatch. Nothing in
> this repository creates such a tag.

So the gates that look like the last line of defence — `verify:env --strict`,
`verify:db` (the database contract check), SHA-256 artifact integrity,
rollback-target capture, post-deploy smoke — all live on a path that only runs if
someone cuts a tag. The path that runs passes through none of them.

There is therefore exactly one place a review gate can bite:

```bash
npm run review:gate        # run this BEFORE `git push`
```

`ci.yml` still runs on push and is still worth having — it is a backstop and it
catches things locally-run gates do not. But it runs **concurrently with the
deploy**, not before it. CI green is not a precondition for production; your
pre-push gate is.

---

## 2 · The lifecycle

| # | Step | What happens | Enforced by |
|---|---|---|---|
| 1 | **Change** | Edit. Commit locally as often as you like. | — |
| 2 | **Self-review** | Read `git diff`, not the file. Work the checklist tiers. | discipline |
| 3 | **Gate** | `npm run review:gate` (fast) or `review:gate:full` (adds typecheck, boundary, idx:gate, tests) | the gate |
| 4 | **Resolve** | Fix what it reports, or acknowledge a high-risk area with `--ack=<area>` | the gate |
| 5 | **Push** | `git push` — this is the deploy | — |
| 6 | **CI** | `ci.yml` runs in parallel: typecheck ratchet, boundaries, classes, functions tree, bundle ratchet, tests, build, smoke | CI |
| 7 | **Verify live** | Confirm the deployed site, and that the DB contract matches | manual |

Steps 3 and 4 are the ones that did not exist before. Everything else was already
here.

### What step 3 checks

| Check | Catches |
|---|---|
| `R1` secret scan | a credential in an added line — `nfp_`, `ghp_`, `github_pat_`, `AKIA`, private keys, JWTs, and assigned secrets |
| `R2` size budget | a diff too large to have been reviewed, however green everything else is |
| `R3` risk attestation | a change to `kernel`, `auth`, `migrations`, `ci`, `deploy` or `data` without a stated answer to that area's question |
| `R4` env declaration | a new env var that never reached `.env.example`, so the next person cannot run the app |
| `R5` migration rollback | a new migration with no rollback marker and no irreversibility note |
| `R6` lint on added lines | a hard-rule violation on a line **you** added (no `any`, no `!`, no `console`, no `debugger`) |
| `R7` Tier-0 gates | the fast gates CI runs, plus the ones only this gate runs |

Run it against anything: `--base=<ref>`, `--range=A..B`, `--no-gates` for the
diff checks alone. Every exclusion (`--ignore-path`, `--allow-large`, `--ack`) is
echoed into the output, so a bypass is recorded rather than silent.

---

## 3 · Entry and exit criteria

**Review starts when** a change is committed locally and `npm run review:gate`
runs. It does not start on a push, because by then it is already deployed.

**A change is done when:**

- [ ] `npm run review:gate` is green (or `review:gate:full` before anything risky)
- [ ] Every P0/P1 was fixed, and shipped with a test that failed before the fix
- [ ] Every P2 was fixed, or deferred with a **named owner and a date**
- [ ] New or changed logic has a test, and the test fails without the fix
- [ ] Shared-state mutations are single atomic statements
- [ ] Untrusted output is escaped before rendering
- [ ] New env vars are in `.env.example` and `verify:env`
- [ ] Migrations are reversible, or the rollback plan is written down
- [ ] The closing question was answered: *what gate would have caught this?* If
      "none", one was added
- [ ] `docs/` updated, or the change is genuinely self-evident

---

## 4 · Evidence

The gate's output is the evidence. It prints, per check, what it measured — not
just pass or fail:

```
PASS  R2 · size budget
        changed lines: 12 across 1 file(s) (excluding generated)
             12  package.json
```

Two rules about evidence:

- **"Tested locally" is not verification.** Name what you ran and what it did.
- **A gate's exit code is the verdict, never its prose.** Every battery in
  `scripts/ci/` judges by exit code for this reason: a checker that prints
  "FAILED" and exits 0 is a checker that has been defeated by a refactor.

---

## 5 · The emergency path

Incidents happen. Production is down at 02:00 and the fix is two lines.

**May be relaxed, with the reason recorded:**

- `R2` size budget — `--allow-large="<reason>"`.
- The full gate profile — `--no-gates` is acceptable when the fast gates are the
  thing that is broken.

**May never be relaxed:**

- `R1` secret scan. An incident is the worst possible time to leak a credential,
  and the scan costs under a second.
- `R3` risk attestation. The acknowledgement is one flag; skipping it means the
  one moment you most needed to think about atomicity is the moment you did not.
- The deploy-shape gates (`verify:entries`). A broken entry point does not degrade
  one feature — it keeps Lambda compatibility mode alive and takes the whole site
  down. This exact failure shipped on 2026-09-12.

**Afterwards:** run `review:gate:full` on the next change, and hold a short
postmortem whose output is a gate, not a paragraph. The rule from the standard
applies hardest here: *a defect that is not converted into an automated gate will
happen again.*

---

## 6 · Roles

One person: author, reviewer, and operator. There is no reviewer rotation, no
CODEOWNERS enforcement and no self-merge prohibition, because there is no second
human (A-01). The substitute is the solo protocol in
[`CODE_REVIEW_STANDARD.md`](./CODE_REVIEW_STANDARD.md) §5 — a written answer to a
named question, required by the gate, for the areas where being wrong is
expensive.

When a second person does join, the change is small and already prepared: the PR
template and CODEOWNERS exist and are kept valid, and `verify:review-manifest`
fails if either names something that is not real. The only new step is asking for
the review.

---

## 7 · Metrics

Read monthly. If a number is not moving, the process is not being followed — not
the reverse. Two of these are printed by `npm run verify:review-manifest` on every
run, which is the cheapest way to keep them honest.

| Metric | Where | Target |
|---|---|---|
| Blocking gates with a mutation battery | `verify:review-manifest` | 4/21 → rising to 21/21 |
| Blocking gates no workflow invokes | `verify:review-manifest` | 9 → 0 |
| Lint diagnostics (frozen debt) | `lint-ratchet` | 2,716 → falling |
| Unpushed backlog | `review:gate` header | < 400 changed lines |
| Change failure rate | deploy log + rollbacks | < 15% and falling |
| Defects escaped to production | postmortems | falling |
| Gates added per P0/P1 | the change itself | ≥ 1 |

**Not yet measurable, and named rather than faked:** time to first review (one
person), and diff coverage (no gate — G-03). Both are in the gap register; neither
is asserted as a target until something can measure it.

---

## 8 · Cadence

| When | What |
|---|---|
| Every change | `npm run review:gate` before push |
| Every P0/P1 | add the gate that would have caught it |
| When debt falls | re-baseline the ratchets (`lint:baseline`, `typecheck:baseline`) so the floor moves down |
| Monthly | read the two numbers in §7 |
| Quarterly | audit-to-gate review: take every open finding and confirm it is closed by code, test, or gate — the gap register in `CODE_REVIEW_AUDIT.md` is the input |
| Per incident | blameless postmortem; output is a gate |

---

## 9 · The five things most likely to go wrong

Named because they have all happened here:

1. **A gate that exists but does not run.** Nine blocking gates are currently in
   this state (A-05). A gate nobody invokes is worse than no gate, because it
   produces confidence. `verify:review-manifest` now prints the count.
2. **A gate that has never failed.** Seventeen of twenty-one blocking gates are
   in this state (A-10). Write the mutation battery, and check that each mutation
   actually mutates.
3. **A document naming a gate that does not exist.** This is how `lint` survived
   (A-03). The machine-read Tier-0 block in the checklist and
   `verify:review-manifest` now make it fail loudly.
4. **A rule that assumes a second reviewer.** It will be skipped, and skipping it
   becomes normal (A-01).
5. **A deferral with no owner and no date.** The `npm audit` job has been parked
   on exactly this since the playbook was written (A-11).
