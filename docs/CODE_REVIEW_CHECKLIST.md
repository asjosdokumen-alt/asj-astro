# Code Review Checklist

The working checklist for a change in this repo. Tick it, or paste it into a PR.

Companion documents:
[`CODE_REVIEW_STANDARD.md`](./CODE_REVIEW_STANDARD.md) (what "reviewed" means and
how findings are graded) · [`CODE_REVIEW_PROCESS.md`](./CODE_REVIEW_PROCESS.md)
(how a change flows, and where the gate bites) ·
[`CODE_REVIEW_AUDIT.md`](./CODE_REVIEW_AUDIT.md) (the measured evidence behind
all of this).

Sizing guide: under 100 lines, Tiers 1–2 only. Under 400, all tiers. Over 800,
the gate asks you to split the change or record why a walkthrough is not needed.

---

## Tier 0 · Automated gates — must be green

Nothing here is a judgement call. If a Tier 0 gate is red, stop: the review has
not started yet. Do not spend human attention on anything a machine already
checks.

There are two kinds, and the difference matters because **only one of them runs
without you**. Pushing `main` publishes production directly through Netlify's git
integration, so the local gate is not a convenience — it is the only thing
between the diff and the deploy.

**Runs in CI** (`ci.yml`): `typecheck:ratchet`, `typecheck:indexer`, `boundary`,
`verify:classes`, `verify:entries`, `verify:binding`, `verify:io`,
`verify:fetch-boundary`, `verify:projections`, `verify:md`, `lint-ratchet`,
`verify:review-manifest`, `bundle:size`, `idx:gate`, `verify:batteries`,
`test:frontend`, `test:backend`, `smoke`.

**Runs in CI, but only on a PUSH** — `ci.yml#e2e` is gated on `push` (or an
explicit `run-e2e` input), so on a pull request these four are **not** enforced:
`e2e:public`, `e2e:loker-layout`, `e2e:headings`, `e2e:dialog`. If the diff
touches a route, a heading, or an overlay, run them yourself — they assert the
RENDERED DOM, which no source-level check can.

**Runs only when you run it** (`npm run review:gate`): `verify:aliases`, plus
`verify:schema`, `verify:rls`, `verify:env`, `verify:db` on the full profile.

`depcruise` is tier 0 but advisory (`blocking: false`), so it is deliberately
NOT in the block below — the block means "must be green", and it never blocks.

The block below is read by `scripts/ci/verify-review-manifest.mjs`, which fails if
any name in it is not a real script in `package.json`. That check exists because
this checklist used to open with `` `lint` `` — a gate that did not exist, with no
linter anywhere in the repo. A checklist that names a gate nobody can run is worse
than a short one.

<!-- BEGIN TIER0 GATES (machine-checked by scripts/ci/verify-review-manifest.mjs) -->
```text
typecheck:ratchet
typecheck:indexer
boundary
lint-ratchet
verify:classes
verify:entries
verify:binding
verify:io
verify:fetch-boundary
verify:projections
verify:md
bundle:size
idx:gate
verify:aliases
verify:review-manifest
verify:batteries
test
e2e:public
e2e:loker-layout
e2e:headings
e2e:dialog
```
<!-- END TIER0 GATES -->

Run the local half with:

```bash
npm run review:gate        # the fast set, over everything not yet pushed
npm run review:gate:full   # + typecheck, boundary, idx:gate, and the test suite
```

**Coverage — measured, not yet gating.** `npm run test:coverage` reports it, and
the target for changed code is ≥ 70%. There is no coverage threshold in
`vitest.config.ts` and no CI job for it, so this is deliberately **not** a
checkbox: ticking a box for a gate that cannot fail is the exact habit this
document exists to break. Open gap **G-03** in the audit. Until it closes, treat
coverage as a number you look at, not a gate you pass.

---

## Tier 1 · Correctness

**Logic**
- [ ] The code does what the description says it does
- [ ] Edge cases handled: empty input, null, zero, single element, max size
- [ ] Off-by-one risks checked in loops and slices
- [ ] Error paths actually reachable and actually handled

**Concurrency — the team's most common defect class**
- [ ] No per-request state stored on `globalThis` or in module scope (use `AsyncLocalStorage`)
- [ ] No read-modify-write on shared state — every mutation is a single atomic statement
- [ ] Any claim/lock uses `SKIP LOCKED` or an equivalent atomic RPC
- [ ] Any counter increment is atomic (`count = count + 1` in SQL, not compute-in-JS)
- [ ] Concurrent cache read + invalidate cannot re-cache stale data
- [ ] Timers and listeners are released on every exit path, including throws

**Types**
- [ ] No `any` added
- [ ] No `as` cast or `!` at a trust boundary (env, request body, DB row)
- [ ] Error classification reads typed fields, not regex on `error.message`
- [ ] Timestamps compared as epoch millis, not as strings

**Timeouts and budgets**
- [ ] Worst-case latency fits the request deadline (**12 s** — `DEFAULT_DEADLINE_MS` in `netlify/functions/_lib/kernel/deadline.ts`). The Netlify sync ceiling is 60 s, but it is not a budget to spend
- [ ] Every outbound call has a timeout
- [ ] Retry counts and backoff are bounded; mutations opt **in** to retry
- [ ] No unbounded recursion, including via logging or error handling

---

## Tier 2 · Security

- [ ] Every new or changed endpoint has an explicit authorization check
- [ ] Authorization derives role server-side — never from user-writable metadata
- [ ] Object-level checks enforce ownership (`where wa = caller`), not just role
- [ ] All input validated by a Zod schema at the handler edge — **partial today**: `npm run verify:validation` prints the measured coverage and freezes the remainder in `.ci/validation-baseline.json`, which may only shrink
- [ ] Untrusted output is escaped **before** any HTML transform
- [ ] No `dangerouslySetInnerHTML` on untrusted data
- [ ] User-supplied URLs validated by scheme **and** host allow-list
- [ ] No secrets, tokens, or PII in logs; PII hashed if it must appear
- [ ] No new secrets in `localStorage` or in URL query strings
- [ ] Credentials are verified, never decoded-and-trusted
- [ ] Secret comparison is constant-time; no plaintext credential fallback

`npm run review:gate` scans the added lines for credential shapes before you
push. It is a backstop, not a licence: the rule is still that a secret never
enters the working tree. If a real credential does reach git history, rotate it
first — removing the commit does not un-leak it.

---

## Tier 3 · Architecture

- [ ] Layering respected: `surfaces/` → `contexts/` → `_lib/kernel/`, never upward
- [ ] No new concept duplicating an existing one (check before adding a second breaker, cache, or client)
- [ ] No raw `fetch` — all I/O through `kernel/http.ts`
- [ ] New dependency justified; no dependency for something 20 lines solves
- [ ] Files under the size ceiling (400 components / 300 services) or justified
- [ ] Exported symbols are actually consumed somewhere
- [ ] Database access uses column projections, not `SELECT *`
- [ ] No N+1 query introduced

---

## Tier 4 · Maintainability

- [ ] Names say what the thing is; no abbreviations needing a translation
- [ ] No dead code, no commented-out blocks, no `.bak` files
- [ ] Comments explain **why**, not **what** — the code already says what
- [ ] Complex logic has a comment stating the invariant it maintains
- [ ] No `console.log` on production paths
- [ ] Error messages are actionable — they say what failed and what to do
- [ ] `docs/` updated if behaviour or setup changed
- [ ] i18n: keys added to **both** `id` and `jp` dictionaries

---

## Tier 5 · Operability — required for risky changes

- [ ] Migration is reversible, or marked irreversible with a written rollback plan
- [ ] New env vars added to `.env.example` **and** `verify:env` in the same change
- [ ] Missing required env fails loudly at startup, never silently degrades
- [ ] Errors return correct HTTP status — never `200` with `{success: false}`
- [ ] Structured logs emitted with request correlation IDs
- [ ] Failure mode is explicit: what does the user see when this dependency is down?
- [ ] Rollback path is known and tested, not assumed

`npm run review:gate` enforces three of these mechanically: a new migration must
carry a rollback marker, a new env var must appear in `.env.example`, and any
change touching a high-risk path requires an explicit acknowledgement.

---

## The solo review protocol

This repo has one author and one reviewer. Every line of "rotate reviewers",
"no self-merge" and "require review from Code Owners" describes a team that is
not here, so the standard has to be honest about it instead of aspirational.

What replaces a second pair of eyes is a written answer to a specific question.
`npm run review:gate` refuses to pass a change that touches a high-risk path
until you acknowledge that area, and prints the questions that area demands:

| Area | The question you must be able to answer |
|---|---|
| `kernel` | Is every shared-state mutation a single atomic statement, and does the worst case still fit 12 s? |
| `auth` | Is identity read from the verified token rather than the request body? |
| `migrations` | Is this reversible, or explicitly marked irreversible with a plan? |
| `ci` | Has this gate been observed **failing**? If not, it is a hypothesis, not a gate. |
| `deploy` | Does every root entry point export a handler, and is no router named `<subdir>/index.*`? |
| `data` | Are projections explicit, and is the client cache still keyed by session identity? |

Because you are both author and reviewer, the protocol is adversarial on purpose.
Read the diff as if someone else wrote it and you are looking for the reason it is
wrong — not confirming that it is right.

**Review etiquette, for when there is a second person.** Prefix non-blocking
comments with `nit:` or `suggestion:`; unlabelled comments are read as blockers.
Two outcomes only: *Approve* or *Request changes* — "approved with comments" is
how defects ship. Acknowledge every comment, even with one word. Aim for a first
response within one business day; slow review is the main reason standards get
routed around.

---

## Before merging, one last question

> **What gate would have caught this bug?**

If the answer is "none", this change should add one. That is how the same class of
defect stops being found twice — and in this repo it is not a rhetorical question.
Every gate that exists today was added because something got through.
