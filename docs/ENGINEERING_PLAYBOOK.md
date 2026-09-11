# Engineering Playbook — ASJ Portal v2

**Owner:** Engineering team · **Status:** Proposed · **Last reviewed:** 2026-09-05

This playbook is grounded in the actual state of this repository, not in generic
best practice. Every weakness listed below cites evidence from the codebase or
from the team's own audit documents (`docs/archive/CODE_REVIEW_2026-09-01.md`,
`docs/archive/SECURITY_AUDIT_2026-09-03.md`, `docs/archive/HANDOVER.md`).

---

## Part 1 · Diagnosis

### The one thing that matters most

> **An audit finding that is not converted into an automated gate will happen
> again.**

The team's pattern is visible in the repository history: sophisticated
periodic audits (41 findings on 2026-09-01, a security audit on 2026-09-03),
followed by a burst of fixes, followed by new defects of the same *class*.
Both audits were excellent. Neither was fully converted into a permanent,
always-on check.

The good news is that the team already does this better than most: the review's
`C1` finding (backend excluded from typecheck) became a `tsconfig.json` change;
the missing CI pipeline became seven workflow files. That instinct — *fix the
gap that let the bug through* — is correct and should be made explicit policy.

**Policy (proposed):** every finding from any audit or postmortem must be closed
by one of:

1. a code fix, **or**
2. a test that would have caught it, **or**
3. an automated gate in CI.

"Noted, we'll be careful" is not a valid closure.

---

### What the team already does well

Preserve these. Any process change must not regress them.

| Strength | Evidence |
|---|---|
| Deploy-once artifact discipline | `ci.yml` builds once; staging and production promote the same bytes, integrity-checked by SHA-256 |
| Debt-aware typecheck gate | `scripts/ci/typecheck-ratchet.mjs` blocks new errors without demanding a big-bang cleanup |
| Architecture boundaries as CI gate | `dependency-cruiser` wired into `boundary` job |
| Layered backend design | `surfaces/` → `contexts/` → `_lib/kernel/` separation is genuinely good |
| Resilience kernel | Timeouts, circuit breakers, bulkheads, structured logging with PII hashing, `AsyncLocalStorage` correlation |
| Validation at the trust edge | Zod schemas at the handler boundary |
| Sharded, parallel CI | Backend suite split 3 ways with `fail-fast: false` |
| Hard-won operational knowledge documented | `vitest.config.ts` explains the Windows `pool: 'threads'` hang; comments warn against re-narrowing test `include` |
| Conventional commits | `feat(...)` / `fix(...)` / `docs(...)` prefixes used consistently |

---

### Weaknesses, ranked by leverage

#### W1 — Testing effort follows convenience, not risk 🔴

**Evidence.** Test files exist for 4 of 12 kernel modules:

```
cache.ts        TESTED      http.ts             NO TEST
resilience.ts   TESTED      job-queue.ts        NO TEST
events.ts       TESTED      rate-limit.ts       NO TEST
optimistic.ts   TESTED      validate.ts         NO TEST
                            db.ts               NO TEST
                            log.ts              NO TEST
                            metrics.ts          NO TEST
                            request-helpers.ts  NO TEST
```

Cross-reference this against *where the blockers actually were*:

| Blocker | Module | Tests |
|---|---|---|
| B1 — temporal dead zone, every DB call throws | `kernel/http.ts` | 0 |
| B5 — non-atomic job claim | `kernel/job-queue.ts` | 0 |
| B6 — non-atomic rate-limit increment | `kernel/rate-limit.ts` | 0 |
| B7 — unbounded recursion in failure logging | `kernel/http.ts` | 0 |
| B8 — credential minted from unverified token | `kernel/db.ts` | 0 |

The four modules that *are* tested were not implicated in any blocker. This is
not coincidence: `cache`, `events`, and `optimistic` are pure, deterministic,
and easy to test. `http`, `job-queue`, and `rate-limit` need I/O fakes and
concurrency harnesses. **The team is testing what is easy rather than what is
dangerous.**

**Fix.** Adopt risk-weighted testing (Part 2, Testing). Start with the eight
untested kernel modules.

---

#### W2 — Concurrency correctness is a recurring blind spot 🔴

**Evidence.** Five independent findings share one root cause:

- **B4** — per-request state stashed on `globalThis` (warm instances serve concurrent requests)
- **B5** — job claim is `SELECT` then `PATCH`, no `SKIP LOCKED`
- **B6** — rate limiter is read-modify-write, lost updates under concurrency
- **P6** — stale cache re-cached after concurrent invalidation
- **P13** — two independent breaker/bulkhead implementations stack to double the documented concurrency

All five assume a read-modify-write sequence is safe. In a serverless handler it
never is. This is a **knowledge gap across the team**, not a set of typos — which
means a code fix alone will not stop it recurring.

**Fix.** Three things together: a mandatory atomic-mutation rule (Part 2,
Backend), a dedicated review-checklist item (Part 3, Tier 1), and one internal
training session with live reproduction.

---

#### W3 — Zero automated style enforcement 🟠

**Evidence.** No ESLint, Prettier, Biome, Oxlint, EditorConfig, husky,
lint-staged, or commitlint anywhere in the repository. Every other category —
types, boundaries, tests, build integrity, smoke — has a gate. Style has none.

Consequences are predictable and already partly visible: review time spent on
formatting, inconsistent quoting and import ordering between files, and
non-obvious bugs (`P15`, parsing retryability out of error message strings)
that a lint rule with `no-restricted-syntax` could flag.

**Fix.** Add Biome or ESLint + Prettier. Start in warnings-only mode on the
existing tree, block new violations only.

---

#### W4 — Two gates are built but silently not running 🟠

**Evidence.**

- `npm run ci:quality` (which includes `idx:gate`, the impact gate) is defined in
  `package.json`. **No workflow references it.** The impact gate never runs in CI.
- `npm run test:coverage` exists. No workflow references it. Coverage is
  unmeasured and untracked.
- The `audit` job is `continue-on-error: true` with the comment *"Flip to false
  once the production dependency tree is clean."* No owner, no date.

A gate that exists but does not run is worse than no gate: it produces false
confidence. This is the exact failure mode of the original tsconfig gap.

**Fix.** Wire both in (Phase 0). Give the `audit` flip a named owner and date.

---

#### W5 — No review scaffolding; review happens as events, not continuously 🟠

**Evidence.** No `CODEOWNERS`, no PR template, no issue templates, no
dependabot config, no branch-protection-as-code.

Combined with the audit cadence, the operating model is *periodic deep audit*
rather than *continuous per-change review*. Audits are valuable but they batch
feedback: a defect found on Sept 1 was written weeks earlier. The goal is to
move detection left, into the pull request.

**Fix.** `CODEOWNERS` + PR template + branch protection (Phase 0), and the
tiered checklist in Part 3.

---

#### W6 — Size drift in the highest-traffic modules 🟡

**Evidence.** Largest non-test source files:

| File | LOC | Note |
|---|---|---|
| `src/store/i18n.ts` | 1,179 | Both locales bundled eagerly (review finding P9, 56 KB) |
| `src/store/i18n-jp.ts` | 1,064 | Parallel duplicate structure |
| `netlify/functions/_lib/ai/chat.ts` | 740 | |
| `src/components/admin/RincianBiayaModal.tsx` | 666 | |
| `netlify/functions/contexts/master-data/service.ts` | 652 | |
| `src/components/forms/AiCvForm.tsx` | 612 | Site of finding S1 (stored XSS) |
| `src/components/admin/AdminAiCopilot.tsx` | 607 | |
| `netlify/functions/_lib/ai/cv.ts` | 607 | |
| `src/components/admin/PemberkasanModal.tsx` | 593 | |
| `src/components/forms/MasterFullForm.tsx` | 584 | |

Two structural issues here. First, `i18n.ts` and `i18n-jp.ts` are parallel
1,000+ line dictionaries — the highest-risk duplication in the codebase, because
a key added to one and not the other fails silently at runtime. The team already
built a coverage guard for this; good instinct, keep it. Second, several
components exceed 600 lines, which correlates with the defect density seen in
the audits.

**Fix.** Soft ceiling of 400 LOC for components and 300 for services. New files
over the ceiling need a justification in the PR description. Existing files get
split opportunistically when they are next touched.

---

#### W7 — Green tests that verify the wrong thing 🟡

**Evidence.** From the Sept 1 review, finding B2:

> `actions-master.test.ts` *passes* (18 tests) but imports from
> `contexts/master-data`, not from the missing `actions-master`.

And B3: fifteen `netlify.toml` redirects pointed at a handler that did not
exist. Nothing caught it, because no test asserted on the wiring — only on the
modules.

The lesson: **unit tests validate internals; nothing validates integration.**
Both incidents were wiring failures, and wiring is exactly what unit tests
cannot see.

**Fix.** Add contract/wiring tests (Part 2, Testing).

---

#### W8 — Documentation entropy 🟡

**Evidence.** Was: 31 files in `docs/` plus five root-level Markdown files.
`HANDOVER.md` alone is roughly 31,000 tokens.
`CODE_REVIEW_2026-09-01.md`, `SECURITY_AUDIT_2026-09-03.md`, and `overview.md`
were all marked *Historical Document* but still sat at the repository root —
they have since been moved to `docs/archive/`.

Documentation that is not pruned becomes unreliable, and unreliable
documentation gets ignored — which is worse than none, because people stop
checking. A 31k-token handover file is not a handover; it is an archive.

**Fix.** Three states only: `docs/` (current), `docs/archive/` (historical,
moved out of root), deleted (obsolete). Root holds `README.md` only.

**Status 2026-09-05 — first triage done.** 21 files moved to `docs/archive/`
(4 from root, 6 `FASE*`, 10 `*-DEEP.md` stubs, 1 orphan spec). Root now holds
`README.md` and `TODO.md` only. Remaining: `CODE_INDEX_DESIGN.md` (138 KB) and
`PARITY_CHECKLIST.md` (82 KB) are large but actively maintained — leave them.

---

#### W9 — Typecheck ratchet has no burn-down 🟡

**Evidence.** `scripts/ci/typecheck-ratchet.mjs` blocks *new* type errors while
tolerating the historical baseline. Correct design — but nothing ever reduces
the baseline. Without a decrement, a ratchet is a fossil record: it documents
debt rather than retiring it.

**Fix.** Baseline ratchets down on a fixed cadence (e.g. 10% per sprint, or N
errors per sprint). The baseline file is a tracked metric, reviewed like any
other.

---

#### W10 — Escape hatches used at trust boundaries 🟡

**Evidence.**

- `P15` — retryability decided by `error.message.match(/HTTP (\d{3})/)` instead of the typed `HttpError.status`
- `B4` — `(globalThis as Record<string, unknown>).__requestId = ...`
- `P19` — `body.payload = q.payload` assigns a string where an array is expected; handlers then index `payload[0]`

Each is a place where the type system was bypassed at exactly the point where it
was most needed.

**Fix.** Standards below: no `any`, no `as` casts at trust boundaries, parse
error types not error strings.

---

## Part 2 · Coding standards

These are specific to this stack — Astro + Preact + Supabase + Netlify
Functions + TypeScript. Rules marked **GATE** are mechanically checkable and
should be enforced by lint or test, not by reviewer memory.

### 2.1 TypeScript

| Rule | Rationale |
|---|---|
| No `any` in new code. Use `unknown` + narrowing. | See W10 |
| No non-null assertion `!` at trust boundaries (env, request body, DB rows) | The `!` is an unverified claim |
| No `as` casts on values crossing a trust boundary — parse with Zod instead | B8, P19 |
| No `as Record<string, unknown>` on `globalThis` or module scope | B4 |
| Retry/error classification must read typed fields (`HttpError.status`), never regex an error message | P15 |
| Exported config tables must be consumed somewhere; unused exports are dead code | `DEPENDENCY_CONFIGS` (P12) |
| Prefer `satisfies` over `:` for config object literals | Catches typos, preserves literal types |
| Discriminated-union results over throwing across module boundaries | Callers must handle failure explicitly |

### 2.2 Backend (Netlify Functions / serverless)

The single most important rule:

> **Read-modify-write on shared state is banned. Every mutation of shared state
> must be a single atomic statement.**

This one rule closes B5, B6, and most of P6.

```ts
// ✗ BANNED — lost updates under concurrency
const row = await readCounter(key);
await upsertCounter({ ...row, count: row.count + 1 });

// ✓ REQUIRED — single atomic statement
const { count } = await rpc('increment_counter', { p_key: key });
```

```sql
-- Postgres function: atomic increment, one round trip
UPDATE rate_counters SET count = count + 1
WHERE bucket = p_key AND window_start = p_window
RETURNING count;
```

The rest:

| Rule | Rationale |
|---|---|
| All outbound I/O goes through `kernel/http.ts`. No raw `fetch` in new code. **GATE** | P2 — `storage.ts` and `supabasePaged` bypass the entire resilience layer |
| No per-request state in module or global scope — use `AsyncLocalStorage` **GATE** | B4 |
| Mutations must opt **in** to retry (`idempotent: false` by default) | P26 |
| Worst-case latency must fit the **request deadline** (12 s — `kernel/deadline.ts`), not the platform ceiling. Sum the fallback chain. **GATE** | P1 — 3 models × 7 s + Grok 10 s = 31 s. The Netlify sync ceiling is 60 s, but it is not a budget you may spend: a longer request holds a function slot longer, which is how an overload starts |
| Never derive a credential from unverified input; always `verifyToken()` first **GATE** | B8 |
| Required env vars fail loudly at startup, never silently degrade | B9 |
| Correct HTTP status on errors — never `200` with `{success: false}` | P18 — breaks client fallback and monitoring |
| Zod-validate every payload at the handler edge | Already the pattern; keep it |
| Parse `timestamptz` to epoch millis before comparison | P17 |
| Timers acquired before a `try` must be cleared in `finally` | P16 |

### 2.3 Frontend (Astro + Preact)

| Rule | Rationale |
|---|---|
| Never `dangerouslySetInnerHTML` with untrusted data. Escape **first**, then transform. **GATE** | S1, S4 |
| `persistentAtom` `decode` must be `try/catch` with a default fallback **GATE** | P21 — module-scope throw = white screen, no recovery |
| No `setInterval` at module scope; every listener has a matching cleanup **GATE** | P20, and 24 `addEventListener` vs 12 `removeEventListener` |
| No tokens or PII in `localStorage` | S2 |
| No `console.log` on paths shipping to production | Review nit |
| Paginate server-side; no full-dataset fetch + client filter | P10 |
| `client:load` only for above-the-fold interactive islands; `client:visible` otherwise | Bundle budget |
| Lazy-load the inactive i18n locale | P9 — 56 KB shipped to every page |
| Validate URL values by scheme and host allow-list before rendering | S5 |

### 2.4 Testing

**Principle: risk-weighted, not coverage-weighted.** A test on a pure helper
raises the coverage number and lowers risk by nothing. A concurrency test on
the job queue raises risk-protection enormously.

Priority order for new tests:

1. **Concurrency invariants** — for any module with shared state, run N=50
   concurrent operations and assert the invariant. This is what catches B5 and B6.
2. **Contract / wiring tests** — cheap, and the only thing that catches B2 and B3:
   - every `netlify.toml` redirect target resolves to a real handler file
   - every relative import in `netlify/functions/**` resolves (**GATE**)
   - every action name dispatched by the client exists in the server registry
   - every i18n key present in `id` exists in `jp` and vice versa (already partly done)
3. **Regression tests** — every bug fix ships with a test that fails before the fix.
   Non-negotiable; this is the highest-ROI testing habit there is.
4. **Behaviour tests on the 8 untested kernel modules** — `http`, `job-queue`,
   `rate-limit`, `validate`, `db`, `log`, `metrics`, `request-helpers`.
5. **Component tests** — lowest priority per hour spent. Stop expanding these
   until items 1–4 are done.

Anti-patterns to name explicitly:

- **Mocking the thing under test.** `actions-master.test.ts` imported
  `contexts/master-data` instead of the missing `actions-master` and passed
  anyway. A test that passes while its subject is broken is worse than no test.
- **Asserting on implementation, not outcome.** Assert the observable contract.
- **Global coverage %.** Use *diff coverage* — percent of changed lines covered.
  Global percentage can be gamed by adding tests to a stable file.

### 2.5 Git and CI hygiene

| Rule | Rationale |
|---|---|
| Conventional commits, enforced by commitlint | Already the habit; make it mechanical |
| PR budget: **< 400 changed lines** excluding generated files. Larger → split, or request a walkthrough review. | Review quality collapses above ~400 lines; beyond ~800 it is decorative |
| No self-merge to `main`. Branch protection required, CI green required. | W5 |
| Every PR description answers: what changed, why, how it was verified, blast radius | Part 3 |
| Every migration is reversible, or explicitly marked irreversible with a rollback plan | |
| New env vars are declared in `.env.example` **and** added to `verify:env` in the same PR | |
| A gate that is flaky gets fixed or deleted within one sprint — never `skip`ped | Flaky gates train reviewers to ignore red |

---

## Part 3 · Code review

Full checklist: **[`docs/CODE_REVIEW_CHECKLIST.md`](./CODE_REVIEW_CHECKLIST.md)**
— designed to be pasted into a PR and ticked off.

### Review tiers

Reviewers should not re-check what a machine already checks. Tiers 0 runs
automatically; humans spend their attention on Tiers 1–5.

| Tier | Focus | Who | Budget |
|---|---|---|---|
| **0** | Automated gates green: typecheck, lint, tests, boundary, build, smoke | CI | — |
| **1** | Correctness — logic, edge cases, concurrency, atomicity, error paths | Author + reviewer | ~10 min |
| **2** | Security — authz, validation, escaping, secrets, PII in logs | Reviewer | ~5 min |
| **3** | Architecture — layering, duplication, size, new dependencies | Reviewer | ~5 min |
| **4** | Maintainability — naming, dead code, comments explain *why*, docs updated | Reviewer | ~5 min |
| **5** | Operability — migrations, env vars, observability, rollback | Reviewer, on risky changes | ~5 min |

### Review culture

- **Review the diff, not the person.** Comment on code, never on the author.
- **Distinguish blocking from non-blocking.** Prefix non-blocking suggestions
  with `nit:` or `suggestion:`. Unlabelled comments get read as blockers, which
  slows everything down and causes real blockers to be ignored.
- **Two outcomes only:** *Approve* or *Request changes*. "Approved with comments"
  is how defects ship.
- **Author responds to every comment**, even just "done" or "skipping, because…".
- **Response-time target: first review within one business day.** Slow review is
  the most common reason standards erode — people merge around the process.
- **Rotate reviewers.** Prevents both bus-factor-1 knowledge and review fatigue.
- **Large PRs get a walkthrough, not a line-by-line read.** If it is over 800
  lines, ask for a 10-minute synchronous walkthrough. Asynchronous
  line-by-line review of a huge diff is theatre.

---

## Part 4 · Roadmap

Sequenced so each phase makes the next one cheaper. Phase 0 is deliberately
small: it closes gates that are already built but not running, which is the
highest-leverage work available.

### Phase 0 — Close the silent gates (week 1)

| # | Action | Owner | Effort |
|---|---|---|---|
| 1 | Wire `idx:gate` into `ci.yml` as its own job | | 30 min |
| 2 | Add a coverage job reporting diff coverage; publish as a PR comment | | 2 h |
| 3 | Add Biome (or ESLint + Prettier), warnings-only on existing tree, blocking on new violations | | 3 h |
| 4 | Add `CODEOWNERS`, PR template, issue templates, dependabot | | 1 h |
| 5 | Enable branch protection on `main` and `develop` | | 30 min |
| 6 | Assign a named owner and target date to the `npm audit` `continue-on-error` flip | | 5 min |

**Exit criterion:** a PR that introduces a lint violation, breaks a boundary,
or drops diff coverage below threshold is blocked automatically.

### Phase 1 — Test the risk, not the easy (weeks 2–4)

| # | Action | Effort |
|---|---|---|
| 1 | Contract/wiring test suite: redirects resolve, imports resolve, action registry matches client dispatch, i18n key parity | 1 day |
| 2 | Concurrency tests for `job-queue`, `rate-limit`, `cache` (N=50 concurrent, assert invariant) | 2 days |
| 3 | Behaviour tests for `validate`, `request-helpers`, `metrics` (pure, fast win) | 1 day |
| 4 | Behaviour tests for `http` with a fake fetch — timeout, breaker, recursion guard | 2 days |
| 5 | `db.ts` auth-path test: assert a tampered token is rejected | 4 h |
| 6 | Fix the atomicity defects (B5, B6) *using the tests from step 2 as the proof* | 1 day |

**Exit criterion:** every kernel module has at least one test; the four modules
that carried blockers have concurrency tests.

### Phase 2 — Retire the debt (weeks 5–8)

| # | Action | Effort |
|---|---|---|
| 1 | Internal workshop: **concurrency in serverless**, with live reproduction of B4/B5/B6. Mandatory attendance. | 0.5 day |
| 2 | Adopt the ratchet burn-down: baseline decreases every sprint, tracked as a metric | 1 h setup |
| 3 | Consolidate the duplicate breaker/bulkhead implementations (P13) | 2 days |
| 4 | Route `storage.ts` and `supabasePaged` through `kernel/http.ts` (P2) | 1 day |
| 5 | Split `i18n.ts` / `i18n-jp.ts` into per-feature modules; lazy-load inactive locale | 2 days |
| 6 | Documentation triage: `docs/` = current, `docs/archive/` = historical, root = README only | 4 h |
| 7 | Split components over the 400-line ceiling as they are next touched | ongoing |

**Exit criterion:** typecheck baseline trending to zero; no kernel module over
300 lines; docs triaged.

### Phase 3 — Make it durable (month 3 onward)

| Practice | Cadence | Why |
|---|---|---|
| **Tech-debt budget** — 20% of every sprint reserved for debt | Per sprint | Without a budget, debt always loses to features |
| **Blameless postmortem** for every production incident | Per incident | Produces gates, not blame |
| **Audit-to-gate review** — revisit open audit findings quarterly; confirm each is closed by code, test, or gate | Quarterly | Closes the loop from Part 1 |
| **Internal tech talks** — one per month, 30 min, on a recurring weak spot | Monthly | Concurrency, then XSS/escaping, then serverless cost |
| **Architecture decision records** in `docs/adr/` | Per significant decision | Prevents re-litigating settled decisions |
| **Onboarding runbook** — new engineer ships a real change on day 1 | — | The sharpest test of whether your process is legible |

---

## Part 5 · How to know it is working

Track these. Review monthly. If a metric is not moving, the process is not
being followed — not the reverse.

| Metric | Target | Reads as |
|---|---|---|
| **Diff coverage** on new code | ≥ 70% and rising | Are we testing what we change? |
| **Typecheck baseline** | Trending to 0 | Is debt being retired or just frozen? |
| **Median PR size** | < 400 lines | Is review still meaningful? |
| **Time to first review** | < 1 business day | Is the process a bottleneck? |
| **Change failure rate** | < 15% and falling | Are gates catching defects before prod? |
| **Defects escaped to production** | Trending down | Is detection moving left? |
| **Flaky test count** | 0 | Do people trust red? |
| **Review comments per PR** | Stable, not zero | Zero comments usually means rubber-stamping |

**Leading indicator to watch first:** time to first review. If that number is
bad, every other standard will decay, because people will route around the
process.

---

## Appendix · Definition of done

A change is done when:

- [ ] All Tier 0 gates are green
- [ ] New/changed logic has a test, and the test fails without the fix
- [ ] Shared-state mutations are single atomic statements
- [ ] Untrusted output is escaped before rendering
- [ ] New env vars are in `.env.example` and `verify:env`
- [ ] Migrations are reversible, or the rollback plan is written down
- [ ] No new linter suppressions without a stated reason
- [ ] Docs updated, or the change is genuinely self-evident
- [ ] PR size under 400 lines, or a walkthrough was requested
- [ ] Reviewer asked: *"what gate would have caught this?"* — and if the answer
      is "none", one was added
