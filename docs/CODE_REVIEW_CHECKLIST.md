# Code Review Checklist

Paste into a PR and tick. Tier 0 runs automatically — do not spend review time
on it. Humans review Tiers 1–5.

Sizing guide: under 100 lines, Tiers 1–2 only. Under 400, all tiers. Over 800,
request a synchronous walkthrough instead of an async line-by-line read.

---

## Tier 0 · Automated gates — must be green

- [ ] `typecheck` — no new type errors
- [ ] `lint` — no new violations
- [ ] `test:frontend` + `test:backend` pass
- [ ] `boundary` — no architecture violations
- [ ] `idx:gate` — impact analysis clean
- [ ] `build` + `smoke` — artifact builds and serves
- [ ] Diff coverage at or above threshold

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
- [ ] Worst-case latency fits the request deadline (12 s — `kernel/deadline.ts`). The Netlify sync ceiling is 60 s, but it is not a budget to spend
- [ ] Every outbound call has a timeout
- [ ] Retry counts and backoff are bounded; mutations opt **in** to retry
- [ ] No unbounded recursion, including via logging or error handling

---

## Tier 2 · Security

- [ ] Every new or changed endpoint has an explicit authorization check
- [ ] Authorization derives role server-side — never from user-writable metadata
- [ ] Object-level checks enforce ownership (`where wa = caller`), not just role
- [ ] All input validated by a Zod schema at the handler edge
- [ ] Untrusted output is escaped **before** any HTML transform
- [ ] No `dangerouslySetInnerHTML` on untrusted data
- [ ] User-supplied URLs validated by scheme **and** host allow-list
- [ ] No secrets, tokens, or PII in logs; PII hashed if it must appear
- [ ] No new secrets in `localStorage` or in URL query strings
- [ ] Credentials are verified, never decoded-and-trusted
- [ ] Secret comparison is constant-time; no plaintext credential fallback

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
- [ ] New env vars added to `.env.example` **and** `verify:env` in the same PR
- [ ] Missing required env fails loudly at startup, never silently degrades
- [ ] Errors return correct HTTP status — never `200` with `{success: false}`
- [ ] Structured logs emitted with request correlation IDs
- [ ] Failure mode is explicit: what does the user see when this dependency is down?
- [ ] Rollback path is known and tested, not assumed

---

## Reviewer etiquette

- Prefix non-blocking comments with `nit:` or `suggestion:`
- Unlabelled comments are read as blockers — label them
- Outcomes are *Approve* or *Request changes*, never "approved with comments"
- Author acknowledges every comment, even briefly
- First review within one business day
- Rotate reviewers to spread knowledge

---

## Before merging, one last question

> **What gate would have caught this bug?**

If the answer is "none", this PR should add one. That is how the team stops
finding the same class of defect twice.
