## What changed

<!-- One or two sentences. What is different after this PR? -->

## Threat model

<!-- Required on every PR. Four questions, short answers. -->

- Trust: whose data does this touch? (public / own / other users' / admin)
- Identity: is it read from the verified token, or from the request body?
- Failure: what does the user see when this fails?
- New primitive: does this add an alternative to something that already exists?

## Why

<!-- The reason, not the implementation. Link the issue if there is one. -->

## How it was verified

<!-- Be specific. "Tested locally" is not verification. -->

- [ ] Unit/integration tests added or updated
- [ ] Behaviour change shipped with its test (for CRITICAL/HIGH fixes: a failing test first)
- [ ] Reproduced the bug before the fix (for bug fixes)
- [ ] Checked the failure mode — what does the user see if a dependency is down?

## Blast radius

- Affected surfaces/endpoints:
- Data touched (any migration?):
- Rollback plan:

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor (no behaviour change)
- [ ] Infrastructure / CI
- [ ] Documentation

## Review checklist

Do not copy the checklist into this description. Work through
[`docs/CODE_REVIEW_CHECKLIST.md`](../docs/CODE_REVIEW_CHECKLIST.md) and record the
result here, because a checklist that lives in two places drifts in both.

**Tier 0 — automated gates.** Run `npm run review:gate`. Do not list the gate
names here: [`scripts/ci/review-manifest.json`](../scripts/ci/review-manifest.json)
is the single source of truth for which gates exist and where they run, and
`npm run verify:review-manifest` fails if this document or the checklist names a
gate that does not exist.

- [ ] `npm run review:gate` is green
- [ ] For a change over 800 lines: split, or record below why async review is still meaningful

**Tier 1 — Correctness**

- [ ] Logic and edge cases
- [ ] No per-request state on `globalThis` or module scope
- [ ] Shared-state mutations are single atomic statements
- [ ] No `any`; no `as` or `!` at trust boundaries
- [ ] Worst-case latency fits the **12 s** request deadline (`kernel/deadline.ts`)

**Tier 2 — Security** — the repo invariants below are test-enforced; do not fight the guard.

- [ ] Authorization checked explicitly; role derived server-side, identity from the verified token — never the request body
- [ ] Input validated by Zod at the handler edge
- [ ] Untrusted values pass `esc()` (`src/lib/helpers_cv.ts`) before any HTML string that reaches `dangerouslySetInnerHTML` — guard: `src/components/admin/rirekishoEscape.test.ts`
- [ ] Client-facing error strings built with `safeError()` (`netlify/functions/_lib/kernel/errors.ts`); no `e.message` concatenated into any response — guard: `netlify/functions/_lib/kernel/errors.test.ts`
- [ ] No `sessionToken`/PII in job payloads or client-visible responses — guard: `netlify/functions/_lib/kernel/job-queue.test.ts`
- [ ] Client cache keyed by session identity (`tokenTag()` in `src/lib/apiClient.ts`), cleared on login/logout — guard: `src/lib/apiClient.test.ts`
- [ ] No secrets or PII in logs, storage, or query strings

**Tier 3 — Architecture**

- [ ] Layering respected (surfaces → contexts → kernel)
- [ ] No duplicated concept introduced
- [ ] All I/O through `kernel/http.ts`
- [ ] Under the size ceiling, or justified below

**Tier 4 — Maintainability**

- [ ] Comments explain why, not what
- [ ] No dead code or debug logging
- [ ] Docs updated
- [ ] i18n keys added to both `id` and `jp`

**Tier 5 — Operability** (risky changes only)

- [ ] Migration reversible, or rollback plan written
- [ ] New env vars in `.env.example` and `verify:env`
- [ ] Failures return the correct HTTP status
- [ ] Observability: logs carry correlation IDs

## Solo review — required if `npm run review:gate` asked for an acknowledgement

This repo has one author. There is no second reviewer, so "someone looked at it"
cannot be the evidence. Record the answers instead — the gate names which areas
it wants, and [`docs/CODE_REVIEW_STANDARD.md`](../docs/CODE_REVIEW_STANDARD.md)
explains why each one is asked.

<!-- e.g. kernel: every shared-state mutation is a single atomic statement; worst
     case 4.2 s against the 12 s deadline. auth: identity read from verifyToken(). -->

## Size

- [ ] Under 400 changed lines (excluding generated files)
- [ ] Over 800 → I split it, or recorded above why a walkthrough was not needed

## Notes for the reviewer

<!-- What to look at first, what you tried and rejected, what you are unsure about. -->

## One last question

**What gate would have caught this bug?** If the answer is "none", this PR should
add one.
