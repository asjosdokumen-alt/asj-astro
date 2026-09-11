## What changed

<!-- One or two sentences. What is different after this PR? -->

## Threat model

<!-- Required on every PR — [`docs/ENGINEERING-QUALITY-PLAYBOOK.md`](../docs/ENGINEERING-QUALITY-PLAYBOOK.md) §5.2. -->

- Trust: whose data does this touch? (public / own / other users' / admin)
- Identity: is it read from the verified token, or from the request body?
- Failure: what does the user see when this fails?
- New primitive: does this add an alternative to something that already exists?

## Why

<!-- The reason, not the implementation. Link the issue if there is one. -->

## How it was verified

<!-- Be specific. "Tested locally" is not verification. -->

- [ ] Unit/integration tests added or updated
- [ ] Behaviour change shipped with its test (playbook §4.1 — failing test first for CRITICAL/HIGH fixes)
- [ ] Reproduced the bug before the fix (for bug fixes)
- [ ] Checked the failure mode — what does the user see if a dependency is down?

## Blast radius

<!-- What breaks if this is wrong? Who is affected? -->

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

See [`docs/CODE_REVIEW_CHECKLIST.md`](../docs/CODE_REVIEW_CHECKLIST.md).

**Tier 0 — automated gates green**

- [ ] typecheck · lint · tests · boundary · idx:gate · build · smoke
- [ ] Diff coverage at or above threshold

**Tier 1 — Correctness**

- [ ] Logic and edge cases
- [ ] No per-request state on `globalThis` or module scope
- [ ] Shared-state mutations are single atomic statements
- [ ] No `any`; no `as` or `!` at trust boundaries
- [ ] Worst-case latency fits the 10 s function budget

**Tier 2 — Security** (playbook §3 invariants — each is test-enforced, don't fight the guard)

- [ ] Authorization checked explicitly; role derived server-side, identity from the verified token — never the request body (§P3)
- [ ] Input validated by Zod at the handler edge
- [ ] Untrusted values pass `esc()` (`src/lib/helpers_cv.ts`) before any HTML string that reaches `dangerouslySetInnerHTML` — guard: `rirekishoEscape.test.ts`
- [ ] Client-facing error strings built with `safeError()` (`kernel/errors.ts`); no `e.message` concatenated into any response — guard: `errors.test.ts` leak scan
- [ ] No `sessionToken`/PII in job payloads or client-visible responses — enqueue in `surfaces/notify.ts`, poll via `handleGetJobStatus` (`hasError`, never `lastError`) — guard: `job-queue.test.ts`
- [ ] Client cache keyed by session identity (`tokenTag()` in `src/lib/apiClient.ts`), cleared on login/logout — guard: `apiClient.test.ts`
- [ ] No secrets or PII in logs, storage, or query strings

**Tier 3 — Architecture**

- [ ] Layering respected (surfaces → contexts → kernel)
- [ ] No duplicated concept introduced
- [ ] All I/O through `kernel/http.ts`
- [ ] Under size ceiling, or justified below

**Tier 4 — Maintainability**

- [ ] Comments explain why, not what
- [ ] No dead code or debug logging
- [ ] Docs updated
- [ ] i18n keys added to both `id` and `jp`

**Tier 5 — Operability** (risky changes only)

- [ ] Migration reversible, or rollback plan written
- [ ] New env vars in `.env.example` and `verify:env`
- [ ] Failures return correct HTTP status
- [ ] Observability: logs carry correlation IDs

## Size

- [ ] Under 400 changed lines (excluding generated files)
- [ ] Over 800 → I requested a synchronous walkthrough

## Notes for the reviewer

<!-- Anything that will save the reviewer time: what to look at first, what you
     tried and rejected, what you are unsure about. -->

## One last question

**What gate would have caught this bug?** If the answer is "none", this PR
should add one.
