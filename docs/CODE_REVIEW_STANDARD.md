# Code Review Standard

**Scope:** every change to this repository. **Owner:** the single maintainer.
**Status:** in force from 2026-09-15. **Evidence:** [`CODE_REVIEW_AUDIT.md`](./CODE_REVIEW_AUDIT.md).

This standard is grounded in what this repository measurably is, not in what a
team of five would do. Read the audit first if you want to know why any rule here
is shaped the way it is; every rule below exists because something specific got
through without it.

---

## 1 · The one rule

> **A defect that is not converted into an automated gate will happen again.**

The history here is not a story of missing standards. It is a story of excellent
periodic audits — 41 findings on 2026-09-01, a security audit on 2026-09-03 —
followed by a burst of fixes, followed by new defects of the same class. Both
audits were good. Neither was fully converted into something that runs.

So every finding, from any source, closes by exactly one of:

1. a code fix, **or**
2. a test that would have caught it, **or**
3. a gate that runs without being asked.

"Noted, we'll be careful" is not a closure. Neither is a checkbox in a document —
which is precisely how `lint` survived as a Tier-0 gate with no linter in the
repository (A-03).

---

## 2 · Severity

Grade a finding before you write the comment. The grade decides whether it blocks,
and it stops a formatting preference from arriving in the same voice as a
data-loss bug.

| Grade | Meaning | Response |
|---|---|---|
| **P0** | Security, data loss, or production availability. Something is exposed, corrupted, or down. | Fix before merge. No exceptions, no "next PR". Rotate any credential first. |
| **P1** | Correctness in a shipped path: a wrong result, a lost update, a broken authorization check, a defect that only appears under concurrency. | Fix before merge. |
| **P2** | Real but not urgent: a missing edge case, a duplicated concept, a size-ceiling breach, a maintainability problem with a cost you can name. | Fix before merge, **or** defer with a named owner and a date. |
| **P3** | Preference. Naming, ordering, a comment that could be clearer. | Never blocks. Label it `nit:`. |

Worked examples from this repository's own defect history:

| Grade | Example |
|---|---|
| P0 | `S1` — stored XSS via `dangerouslySetInnerHTML` on untrusted CV data |
| P0 | `B8` — a credential minted from an unverified token |
| P1 | `B5` — job claim implemented as `SELECT` then `PATCH`, so two workers can claim the same job |
| P1 | `B6` — rate limiter as read-modify-write, so concurrent requests lose updates |
| P1 | `B4` — per-request state on `globalThis`, so a warm instance serves the wrong request |
| P1 | `P15` — retryability parsed out of `error.message` with a regex instead of reading `HttpError.status` |
| P2 | `P13` — two independent breaker/bulkhead implementations stacking to double the documented concurrency |
| P2 | `P2` — `storage.ts` bypassing the resilience layer by calling `fetch` directly |
| P3 | Import ordering, comment wording, a variable name that needs one extra second to read |

**P0 and P1 ship with a test that fails before the fix.** Not because a test is
always the best use of an hour, but because both grades describe a defect that was
invisible until someone looked — and the next one will be too.

---

## 3 · What machines check, and what humans check

Reviewers must not re-check what a machine already checks. That is not politeness;
it is the only way human attention survives contact with a large diff.

**Machines own:** whether it parses, whether it typechecks, whether a class has a
CSS rule, whether an entry point exports a handler, whether a wildcard projection
was introduced, whether the bundle grew, whether a gate's own subject is intact.

**Humans own:** whether the code does what the description says, whether the
design is right, whether the failure mode is acceptable, whether this duplicates
something that already exists, and whether the change is worth its complexity.

The authoritative list of machine gates is
[`scripts/ci/review-manifest.json`](../scripts/ci/review-manifest.json) — not this
document, and not the checklist. Each entry records the script name, its tier,
whether it blocks, the mutation battery that proves it can fail, and where it is
invoked. `npm run verify:review-manifest` fails if any named gate does not exist,
if a blocking gate is invoked nowhere, or if a review document names a gate that
is not real.

That last check exists because this standard is itself a deliverable, and a
deliverable with no test rots.

---

## 4 · Tiers

| Tier | Focus | Who | Budget |
|---|---|---|---|
| **0** | Automated gates, all green | machine | — |
| **1** | Correctness — logic, edge cases, concurrency, atomicity, budgets | author, adversarially | ~10 min |
| **2** | Security — authorization, validation, escaping, secrets, PII | author, adversarially | ~5 min |
| **3** | Architecture — layering, duplication, size, dependencies | author | ~5 min |
| **4** | Maintainability — naming, dead code, comments, docs, i18n | author | ~5 min |
| **5** | Operability — migrations, env vars, observability, rollback | author, on risky changes | ~5 min |

Tier 0 is not a judgement call and does not belong in a discussion. If a Tier 0
gate is red, the review has not started.

The per-item checklist is [`CODE_REVIEW_CHECKLIST.md`](./CODE_REVIEW_CHECKLIST.md).

---

## 5 · The solo review protocol

This repository has one author. Every line of "rotate reviewers", "no self-merge"
and "require review from Code Owners" describes a team that is not here (A-01).
A standard that pretends otherwise produces exactly one behaviour: the rule is
skipped, and skipping it becomes normal.

What replaces a second pair of eyes is a **specific written answer**. The gate
refuses to pass a change touching a high-risk path until that area is
acknowledged, and it prints the questions the area demands:

| Area | The question that must be answerable |
|---|---|
| `kernel` | Is every shared-state mutation a single atomic statement, and does the worst case still fit 12 s? |
| `auth` | Is identity read from the verified token rather than the request body? |
| `migrations` | Is this reversible, or explicitly marked irreversible with a plan? |
| `ci` | Has this gate been observed **failing**? If not, it is a hypothesis, not a gate. |
| `deploy` | Does every root entry point export a handler, and is no router named `<subdir>/index.*`? |
| `data` | Are projections explicit, and is the client cache still keyed by session identity? |

```bash
npm run review:gate -- --ack=kernel --ack=ci
```

Because the same person is author and reviewer, the protocol is adversarial on
purpose: read the diff looking for the reason it is **wrong**, not for
confirmation that it is right. The failure mode of self-review is not laziness —
it is that you already know what you meant, so you read what you meant.

Two habits that make it work:

- **Review the diff, not the memory.** Read `git diff`, not the file you just
  wrote. The file is the version in your head; the diff is what ships.
- **Explain it out loud, in the acknowledgement.** If the sentence "every
  shared-state mutation here is a single atomic statement" is hard to write, that
  is the finding.

---

## 6 · Size budgets

| Changed lines (excluding generated) | What the standard asks |
|---|---|
| < 100 | Tiers 1–2 only. |
| < 400 | All tiers. This is the target. |
| 400–800 | Reviewable, but request a synchronous walkthrough rather than an async read. |
| > 800 | Split it, or pass `--allow-large="<reason>"` and record why async review is still meaningful. |

The numbers are not arbitrary. Review quality collapses well before the diff
becomes unreadable: past a few hundred lines the reviewer stops reasoning about
the change and starts confirming it. Beyond ~800 lines, asynchronous line-by-line
review is theatre — it produces an approval, not a review.

The gate enforces the 800-line limit and warns at 400. `--allow-large` exists
because genuine bulk mechanical changes exist; it requires a stated reason, and
the reason is echoed into the gate's output so the exception is recorded rather
than assumed.

---

## 7 · How to write a finding

- **Two outcomes only: Approve, or Request changes.** "Approved with comments" is
  how defects ship — it transfers the decision to whoever is least motivated to
  reopen it.
- **Label non-blocking comments** `nit:` or `suggestion:`. In this repository an
  unlabelled comment is read as a blocker, so an unlabelled nit costs a full
  round trip.
- **Say what you want, not what is wrong.** "This is a read-modify-write; use the
  atomic RPC in `rate-limit.ts`" beats "this looks racy".
- **Grade it.** P0–P3, so the author knows what is negotiable.
- **Deferral needs an owner and a date.** The `npm audit` job is the cautionary
  example: `continue-on-error: true`, a comment saying "flip this once the tree is
  clean", no owner, no date, still parked (A-11).
- **Ask the closing question** for every P0 and P1: *what gate would have caught
  this?* If the answer is "none", the change adds one.

---

## 8 · Non-negotiables by area

Short lists, because a long list is a list nobody reads. Each item is either
already gated or explicitly registered as a gap.

**Backend.** Read-modify-write on shared state is banned; every mutation is a
single atomic statement. No per-request state in module or global scope — use
`AsyncLocalStorage`. All outbound I/O through `kernel/http.ts`, never raw `fetch`.
Mutations opt **in** to retry. Worst-case latency fits the 12 s deadline, summed
across the fallback chain. Errors return the correct HTTP status, never `200` with
`{success: false}`.

**Security.** Identity comes from the verified token, never the request body.
Role is derived server-side, never from user-writable metadata. Object-level
checks enforce ownership, not just role. Input is Zod-validated at the handler
edge. Untrusted output is escaped **before** any HTML transform. No secrets or PII
in logs, storage, or query strings.

**Frontend.** No `dangerouslySetInnerHTML` on untrusted data. `persistentAtom`
`decode` is `try/catch` with a fallback — a module-scope throw is a white screen
with no recovery. No `setInterval` at module scope, and every listener has a
matching cleanup. No tokens in `localStorage`.

**Database.** Explicit column projections, never `SELECT *` — the master table is
169 columns and a wildcard there is ~570 KB of JSON per cold read. No N+1. A new
migration is reversible or says out loud that it is not.

**Gates.** A gate must be observed failing before it is trusted; the mutation
battery is how. A mutation must be proven to actually mutate — the first draft of
the `lint-ratchet` battery injected `'a' + 'b'` expecting a `useTemplate` hit, and
Biome correctly reports nothing for a concatenation of two literals, so the
"surviving" mutation was not a hole in the gate but a hole in the test.

**Types.** No `any` added. No `as` cast or `!` at a trust boundary. Retry and
error classification read typed fields, never a regex over `error.message`.

---

## 9 · Keeping this standard true

A standard drifts. The mechanism against drift is that the standard's claims are
tested:

```bash
npm run verify:review-manifest   # every named gate exists, is run, and is real
npm run lint-ratchet             # no new lint diagnostics anywhere
npm run review:gate              # this change, reviewed
```

`verify:review-manifest` fails if the checklist's machine-read Tier-0 block names
a gate that is not a script in `package.json`, or if any review document mentions
`npm run <something>` that does not exist. It also prints, on every run:

- how many blocking gates have a mutation battery (**4 of 21** at the time of
  writing — the rest are hypotheses, not proofs), and
- how many blocking gates no CI workflow invokes (**9**).

Those two numbers are the honest state of this repository's quality mechanism.
They should trend to zero. They are printed rather than enforced because
demanding 17 batteries at once is how a standard gets abandoned — but a number
nobody prints is a number nobody fixes.

---

## 10 · Out of scope, deliberately

- **Coverage as a gate.** No threshold exists and none is asserted here. Coverage
  is measured by `npm run test:coverage` and read by humans; the checklist says so
  instead of offering a checkbox that cannot fail (G-03).
- **Two-reviewer rules.** There is one reviewer. Rules requiring a second human
  are recorded as inapplicable rather than written down and skipped.
- **A linter that fixes the existing 2,716 diagnostics.** The ratchet freezes them
  and blocks new ones. A big-bang style cleanup is not a prerequisite for
  reviewing a change, and pretending it is would stall every change.
