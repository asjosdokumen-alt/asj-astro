# AI Inference — Batch 6 (2026-10-02)

**Scope:** "Optimize AI model inference performance — lanjut fix upgrade polish".
**Theme:** the previous batches made the *transport* correct. This batch fixes what the
model was actually *told* — and one silent-failure class underneath it.

Four commits, **all local, not pushed** (R19): `ccc20df`, `688ecb9`, `e6baf19`, `b298c40`.

---

## 1. The model was asked to analyse data it never received

Both AI chat handlers promised something in their system prompt that they never provided.

### `handleProcessAdminAIChat` — the admin copilot

The prompt reads *"Bantu analisis data kandidat"*. The **only** thing sent to the model was
the candidate **ID**. The client (`AdminAiCopilot.tsx:151`) genuinely sends just
`{adminName, message, history, candidateId}` — so the model was asked to analyse data that
never reached it. Every reply was generic, while the provider call was paid for anyway.

Fixed by wiring in the machinery that already existed for the CV flow:
`findAdminAiCandidateContext` + `buildRingkasData`. `handleGetAdminAiContext` now uses the
**same single retrieval path**, so the copilot and the `getAdminAiContext` action can no
longer drift apart.

Two deliberate properties:

- **best-effort** — a failed lookup does *not* fail the chat (degradation, not outage);
- the context block is **absent, not empty**, when the candidate cannot be read. An empty
  block would make the model conclude the candidate genuinely has no data, which is a
  different claim from "we could not read it".

### `handleProcessSiswaAIChat` — Dede Jeklin

The client **already sends** `currentData` (`SiswaBaruForm.tsx:196`, snake_case) and the
handler **threw it away** — so Dede asked students to re-enter data they had just filled in.
Needs its own formatter (`buildSiswaRingkas`) because the student payload is flat
snake_case, not the nested shape `buildRingkasData` expects. Empty fields are skipped, not
emitted as dangling labels.

## 2. Prompt hardening — the one public AI surface

`processSiswaAIChat` is the **only public AI flow**: no session, deliberately so
(`SiswaBaruForm.test.tsx:104`). `currentData` arrives as-is from the client, and once that
value is pasted into a system prompt, anyone can type instruction lines into the "nama"
field and make them look like system instructions.

`sanitizePromptField` guarantees the **structure** — one value is one line, capped at 300
chars. It does **not** claim to clean the content, and the code says so explicitly: that is
inherent to putting user text in a prompt, and pretending otherwise would be more dangerous
than admitting it. `buildRingkasData` (CV flow, values from form + AI) uses the same cleaner.

### The coverage hole this exposed

Mutation **M3** (strip only LF/CR from the strip set) **SURVIVED** — because
`.replace(/\s{2,}/g)` already collapses two newlines, so nothing changed. The existing test
used a `\n\n` payload and was therefore passing **vacuously** for the exact case the strip
exists to defend. Only a **single** `\n` (collapsed by no other step) proves the strip works.
Two tests added (single `\n`, and `\r`); **M3b** (strip removed entirely) is now **KILLED**.

## 3. `findCandidates()` — a silent failure that 14 callers swallowed

The backlog item said "7–14 `findCandidates()` callers outside the AI layer". Measured, the
premise was wrong: `findCandidates()` is a **stub** returning `{ rows: [] }` with **zero
I/O** (`db/candidates.ts:114`). So this was never a performance issue.

It is a **silent-failure** issue. Fourteen call sites use it as the last-resort fallback for
"targeted lookup returned `undefined`" (= the WA/ID column is not in the schema). Because the
result is always empty, every one of them reports **"candidate not found"** for a state that
is actually **"lookup cannot run"**. The two are indistinguishable on the surface, so nothing
could ever alarm on it.

The AI layer had already decided this question (`_lib/ai/cv.ts`: log + degrade, never guess).
One `log.warn` in the shared stub now propagates that same decision to all 14 callers:

- behaviour **unchanged** — still `{ table, rows: [] }`, never a throw (turning it into a
  throw would convert a degradation into an outage);
- **zero** added requests — the branch stays free;
- the only effect: the state is finally visible in the log.

3 new tests, **M4 KILLED** (log call removed).

## 4. A defect I introduced, then found by measuring the full suite

I put two backend suites in `e2e/` (to avoid the frozen `indexer` counters) but **missed the
second step**: `vitest.config.ts` runs `e2e/**/*.test.{ts,tsx}` in the **frontend (jsdom)**
project with an **explicit `exclude`** list naming every suite that must run in `backend`.

The symptoms differed per suite, and **neither pointed at the cause**:

| Suite | Symptom |
|---|---|
| `candidates-lookup-stub.test.ts` | `Failed to resolve import ../../netlify/functions/...` — an import error, not a failing assertion |
| `ai-chat-context.test.ts` | **PASSED in jsdom**, and was counted **twice** (181 → 183) |

The second row is the more dangerous one: a backend suite running in the wrong environment
looks like success. Both are now registered; each runs **once**, under `backend`. This is
why the suite is measured **before and after**, not just at the end.

---

## Verification

| Check | Result |
|---|---|
| New tests | **15** (12 chat-context + 3 lookup-stub), all observed **red first** |
| Mutations | **4 KILLED** (M1, M2, M3b, M4), each with a verified restore |
| `tsc` (main + indexer) | **0** |
| `lint-ratchet` | **PASSED** — debt reduced by 20 (I also fixed the 5 diagnostics my own commit introduced, at source; the baseline was never raised) |
| Build | exit **0**, `asj-astro-a8bb0c2dac27` (not the dev placeholder) |
| `review:gate --base=HEAD~4` | **7/7 PASS** (`--ack=kernel`, `--ack=data`) |
| Dependency oracle | *no violations* (223 modules, 686 deps) |
| Full suite | **4 failed \| 177 passed (181)** — identical to the pre-change measurement |
| Tree | **0 modified, 0 untracked** |
| Pushed | **No** — 15 commits ahead of remote (R19) |

## The full-suite baseline, attributed one by one (measured before starting)

6 assertions across 4 files, **all pre-existing**, each proven rather than assumed:

- **`fcm-server`** — in-process `git check-ignore` returns `exit null` (spawn blocked). Run
  by hand via Bash it gives the correct 0 / 1. Environmental.
- **`boundary`** — `exit null` from the oracle spawn; `dependency-cruise.mjs` run by hand
  reports *no violations* and exits 0. Environmental.
- **`discover` / `build`** frozen counters (`293 vs 287`, `535 vs 529`, envelope
  `23909 > 23900`) — **reproduced identically in a worktree at HEAD**, so the drift predates
  this session. Re-baselining them is **team-lead only**, so they were left alone.

## Left open, with reasons

- **Two `database_asj_form` reads in the sync helpers.** Both helpers *already* accept
  `preloadedRows`, but their callers (`documents/service.ts:827,970`,
  `master-data/service.ts:569`) have **no form rows in scope** — `documents/service.ts` has
  zero `getFormsByWa` calls. Passing `preloadedRows` would **relocate** the read, not remove
  it. This needs a broader per-request cache; not a win today.
- **`ai` admission-cap calibration (4).** Needs production/staging PostgREST EWMA. Blocked.
- **Frozen `indexer` counters.** Team-lead only.

## Process notes worth keeping

- **`git commit --local <name> <email>` is not a valid option.** The `<` becomes a
  redirection, the commit **does not happen**, and it still exits 0. Use
  `git -c user.name=… -c user.email=… commit -F <file>`; identity is now set repo-local.
- **Measure lint diagnostics with `biome check .` directly.** Running it per-file gives a
  different project context (12 vs 15 `useTemplate` on the same file), and repeated
  `git stash`/`pop` cycling produced a **false** reading (62 vs the real 60).
- **`lint-ratchet` counts whole-file diagnostics.** Compare **HEAD vs now per file** — the
  frozen baseline can be stale, and was here (recorded 60 while HEAD already measured 62).
- Recorded as rule **R13f-bis** in the `asj-session-rules` skill.
