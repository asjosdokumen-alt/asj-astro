# Code Review — asj-astro (all modules), pre-launch gate

Date: 2026-11-18
Reviewer: code-reviewer (workstream 1 of 3: code quality / correctness / maintainability)
Scope: `src/**`, `netlify/functions/**`, `shared/**`, `scripts/**`, `e2e/**`, `indexer/**`
Mode: read-only. No source file was modified. No `git add` / commit / push.

---

## 1. Summary verdict

**CONDITIONAL PASS — and the condition is now a single named item: CR-08 / F-05 must be fixed or
explicitly accepted before launch.** If this gate requires zero HIGH findings, then the honest
verdict is FAIL, because CR-08 is HIGH and it is open. I am not going to soften that: the portal
holds candidate PII (the repo's own note: 775 cells, ~295 MB of documents), and "change your
password" is the one action a victim of credential theft takes. Today it returns success and evicts
nobody.

The codebase is in materially better shape than its size suggests (330 files in `src`, ~200 in
`netlify/functions`, several files over 2 000 lines). `tsc --noEmit` is **clean** (0 errors), the
typecheck ratchet baseline is genuinely 0, and the deliberate client↔server formula duplication —
the single biggest launch risk named in the brief — is **currently in parity**. I verified this
mechanically rather than by trusting the comments (§3.1). The scoring-parity test suites are real
tests that can fail, not decorative.

Below that blocking item, the rest of the picture is four **MEDIUM** defects in the game-scoring
submission path and in the admin bulk operations, plus a set of stale comments that actively
misdescribe the code. The MEDIUMs do not block a deploy of the public site; two of them mean
**scores and admin actions silently do not land** in specific, reproducible situations, which is
exactly the class of bug that survives to production because nothing errors.

| Severity | Count |
|----------|-------|
| HIGH     | 1 |
| MEDIUM   | 4 |
| LOW      | 8 |
| INFO     | 3 |

**Severity revision (2026-11-18, after cross-review).** CR-08 was filed LOW in my first pass and is
now HIGH. security-officer derived the same defect independently as F-05 (High, CWE-613) and their
framing is the correct one: the severity is not the 24-hour window, it is that `changePassword`
returns `{success:true}` while the attacker's existing session token survives — a control that
reports success while doing nothing. See CR-08 for the reconciliation. Treat F-05 as authoritative
in the consolidated gate.

Verification performed:
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → exit 0, no output.
- `node scripts/ci/typecheck-ratchet.mjs` → PASSED, baseline 0.
- `node node_modules/vitest/vitest.mjs run shared/ netlify/functions/_lib/game/ netlify/functions/contexts/applications/service-bulk-delete.test.ts` → 96 tests, 5 files, all pass.
- `node node_modules/vitest/vitest.mjs run src/store/i18n.keys.test.ts` → 7 tests pass.
- Mechanical function-body diff of the four duplicated scoring implementations (§3.1).
- Read of `dist/_astro/` chunk sizes from the existing build output (no build was run).
- **CR-01 / CR-02 executed, not just reasoned:** `node --experimental-strip-types deliverables/gstack/verify-cr01-cr02.mjs` → exit 0, both CONFIRMED. The script reproduces the production effect shape under jsdom + Preact and feeds the resulting payload to the real `hitungCombo` imported from `netlify/functions/shared/game-skor.ts`. Output is quoted under CR-01/CR-02 and in §3.5.

---

## 2. Findings

ID scheme: `CR-<n>`. Severity reflects product impact, not effort to fix.

### 2.1 HIGH

| ID | file:line | What | Why it matters | Suggested fix |
|----|-----------|------|----------------|---------------|
| **CR-08** | `netlify/functions/_lib/session.ts:55-60` vs `netlify/functions/contexts/identity/service.ts:406-412`, `:427-445` | The session comment says `iat` "is what makes revocation possible: `session_revocations` stores a per-subject epoch and a token is **refused** when `iat < revoked_at`". It is not. `isRevoked()` is reached only through `revokedRefreshError` (`:111-121`), called at exactly two places, `:292` and `:318` — **both refresh handlers**. `:411` is the *bump* (`revokeSessionSubject`), not a check, and its boolean return is discarded. `requireRole` (`:427-433`) and `isOwnerOrAdmin` (`:439-445`) call `verifyToken` and nothing else, and `verifyToken` (`_lib/session.ts:77-98`) checks only the HMAC and `exp`. | `logout` and `changePassword` write an epoch that **nothing on the request path reads**, so a stolen session token keeps full access for the rest of its 24 h while the UI reports success. The intent is explicit in the code's own comment at `:406-408` — "A password change MUST kill the tokens issued under the old password — otherwise a stolen refresh token survives the one action a victim takes" — and the implementation does not achieve it for the live session token. A control that reports success while doing nothing is the reason this is HIGH, not the window length. **Reconciliation:** security-officer derived this independently and rates it High (F-05, CWE-613) in `security-audit-prelaunch-2026-11-18.md`; I had it as LOW because I scoped severity to the comment/code mismatch. I accept their framing — treat **F-05 as authoritative** for the gate. | Enforce it where it matters: consult `isRevoked` in `requireRole` / `isOwnerOrAdmin` (one cached DB read per request), or shorten the session token's life and rely on refresh. A comment-only fix is not sufficient: it would leave "changing your password does not end your other sessions" undocumented anywhere the user can see it, while the password-change modal tells them it succeeded. |

Two supporting facts, both verified by reading the code:

- **The one enforcement point fails open.** `getSessionRevokedAt` (`contexts/identity/repository.ts:122-134`) catches every error and returns `null`, and `isRevoked(iat, null) === false` (`service.ts:105-108`). Its own doc comment (`repository.ts:112-121`) says this is deliberate — "the failure mode we can survive is 'revocation does not work yet'; the one we cannot is 'every refresh on the site 500s during a DB blip'". I agree with the intent, but it means even the refresh-time check is best-effort: during a DB blip nothing is revoked at all.
- **The failure is swallowed only on the password path.** `revokeSession` refuses to lie — `return ok ? {success:true} : {success:false,'Gagal mengakhiri sesi.'}` (`service.ts:135-138`) — while `changePassword` ignores the same boolean and returns `{success:true}` unconditionally (`:411-412`, with the reasoning recorded at `:408-410`). Defensible for the password write itself; it is the second half of why the user cannot tell that their other sessions survived.

### 2.2 MEDIUM

| ID | file:line | What | Why it matters | Suggested fix |
|----|-----------|------|----------------|---------------|
| **CR-01** | `src/components/candidate/ArcadeGame.tsx:1079-1084` (payload) vs `netlify/functions/_lib/game/leaderboard.ts:299-302` (check) | Combo submission mixes **live ref** with **stale closure state**. `ronde: rondeComboRef.current` is read at fire time (5 s after the last score change), but `kombo` and `kalimat` are captured from the render that armed the timer. A wrong tap pushes `[0,0]` into the ronde (`:1169`) and sets `kombo` to 1 (`:1168`) **without changing `skorCombo`**, so the pending timer is never re-armed. Result: the payload carries the pre-mistake `kombo`, the replay ends on `kombo = 1`, and `simpanSkor` returns `{success:false, message:'Ronde tidak cocok dengan kombo terakhir.'}`. | The whole Combo submission is rejected, silently — `kirimSkor` swallows it (`src/lib/skorGame.ts:93-97`) and the caller only reloads the board. Trigger: a wrong tap (or a timeout, `:1035`) is the last ronde event inside the 5 s window after the last correct tap. Player sees a local record, leaderboard never updates. **Confirmed by execution, not only by reading — see §3.6.** | Read `kombo` from a ref (`komboRef.current`) alongside `rondeComboRef`, or derive it from the ronde, so payload and ref are sampled at the same instant. Cheapest alternative: also re-arm the submit timer on ronde mutation, not only on `skorCombo`. |
| **CR-02** | `src/components/candidate/ArcadeGame.tsx:379`, `:1084` | `rondeComboRef` is **never reset** (grep: only `:379` init, `:1133`/`:1146`/`:1169` push) and neither is the score. Every 5 s submission re-sends the entire history since page load. **Two independent ceilings reject it, and the score ceiling is reached first:** (a) `RONDE_MAKS_COMBO = 4000` events (`netlify/functions/shared/game-skor.ts:123`, enforced `:132`) → `hitungCombo` returns `null`; (b) `batasSkor` applies `SKOR_MAKS = 1_000_000` to any payload without `detail.loop >= 1` (`_lib/game/leaderboard.ts:49`, `:78-81`, `:323-325`) and the Combo payload never sets `loop` — **measured: 191 completed 10-card sentences (2 101 events) replay to 1 002 860**, so the submission is refused with `'Skor tidak masuk akal.'` long before the event cap. | A long Combo session silently stops recording scores, permanently, until reload — and the effective threshold is ~190 sentences, not ~400. Both refusals are swallowed (`src/lib/skorGame.ts:93-97`), so the player sees a local record and no error. Contrast with Genba (`:606`) and Kotoba (`:937`), which reset their ronde per shift. | Reset `rondeComboRef.current = []` **and** submit a per-session delta, or have the server derive its ceiling from the replay instead of a fixed constant (the replay already knows the tap count, so it can bound the score by `500 × events`). A client-only trim would not fix (b). |
| **CR-03** | `netlify/functions/contexts/applications/service.ts:445-468` | `handleHapusFormTerpilih` resolves every index with `getFormByIndex` → `findFormByIndexFiltered` (`_lib/db/forms.ts:180-191`, one `GET … limit=1&offset=i` per index) and then deletes one row per `DELETE`. That is **2N sequential PostgREST round-trips** for N selected rows, with `MAX_BULK_DELETE = 100` (`:407`). At the ~40 ms RTT the repo's own audit notes, 200 round-trips ≈ 8 s against `DEFAULT_DEADLINE_MS = 12_000` (`_lib/kernel/deadline.ts:49`) and Netlify's 10 s synchronous ceiling. | The header comment says the legacy problem was "N round-trip untuk N baris (10 baris = 10 round-trip)" — but the replacement still does N reads **plus** N deletes; only the index-shift bug was fixed. A large selection will 504 partway through with rows already deleted and no report of which, and the admin will re-run it. | Resolve all indices in one query (the form list is already ordered by `timestamp.desc`, so `offset` can be replaced with a single `id` fetch and a positional map), then delete with one `id=in.(…)` request. Both are single round-trips. |
| **CR-04** | `netlify/functions/contexts/applications/service.ts:692-697` | `notifyAdmins('Dokumen Baru Diupload', …)` is called **inside** `for (const existing of targets)` (`:633`), guarded only by `targets.length > 0`, which is trivially true inside the loop. | One upload produces one admin push **per form row** belonging to that WA. A candidate with three applications (three `database_asj_form` rows, one per `code_job`) produces three identical pushes for a single file. The sibling function `syncBiodataKeMail` puts its `notifyAdmins` **outside** the loop (`:598-606`), which shows the intent; this one diverged. | Move the notify block below the loop, or hoist a `sent` flag. |

### 2.3 LOW

| ID | file:line | What | Why it matters | Suggested fix |
|----|-----------|------|----------------|---------------|
| **CR-05** | `netlify/functions/contexts/applications/service.ts:147`; `netlify/functions/contexts/jobs/service.ts:173` | Rejecting an application writes `id_loker_pilihan = null`. The canonical "no job" value in this schema is the **empty string**: `migrations/059_buang_sentinel_umum_dari_kode_job.sql:40` rewrites the sentinel with `SET id_loker_pilihan = ''`, and `documents/service.ts:779` writes `String(d.loker \|\| "")`. | This is precisely the "delete a field must be `''`, not null" defect class. Readers survive it today because they all use `\|\| ''` (`catalog/service.ts:197`, `jobs/service.ts:100`, `documents/repository.ts:60`), so the damage is a second, undocumented representation of "no job" in a column that already had one — and it bypasses `unique_candidate_loker (id_kandidat, id_loker_pilihan)` because NULLs are distinct in Postgres. | Write `''` in both places. |
| **CR-06** | `src/lib/arcade.ts:2777` vs `netlify/functions/shared/game-skor.ts:159` | The client's live Combo bonus uses `bonusKalimat(soal, sisaKalimatRef.current, level)` — **unrounded float** sisa and `soal.urutan.length / 5`. The replay (both twins) uses the **rounded** sisa sent on the wire and `benarSejak / 5`. For sentences whose card count is not a multiple of 5 (hell = 10–13 cards) the two can differ by 1 point: sisa 42.7, 10 cards → client 85, server 86. | Not a score-integrity problem (the server's number is authoritative) but the result card and the leaderboard entry disagree by 1, and `detail.skorKlien` — the field that exists to flag tampering — records the difference, so every hell sentence adds noise to the audit signal. | Round the sisa once, client-side, before calling `bonusKalimat` (`Math.round(sisaKalimatRef.current)`), i.e. score from the same value that goes on the wire. |
| **CR-07** | `netlify/functions/_lib/db/candidates.ts:320-323` | Comment: "probe 3 kolom WA (no_wa / wa / whatsapp) dijalankan PARALEL … Prioritas hasil tetap no_wa → wa → whatsapp (urutan CAND_WA_COLS)". Code: `const cols = [CANDIDATE_WA_COL];` — a **single** column (`schema.generated.ts:135`: `CANDIDATE_WA_COL = "no_wa"`). `CAND_WA_COLS` does not exist. | Stale comment that describes a three-way probe and a priority order that the code does not implement. A future reader will "restore" the other two columns, which the schema does not have (`database_candidate` has no `wa`/`whatsapp` column — the same fact recorded at `_lib/db/forms.ts:121-125`). Also leaves a pointless `Promise.allSettled` over a one-element array. | Rewrite the comment to match, or drop the `allSettled` wrapper. |
| **CR-09** | `src/store/i18n.ts:2` | Header: `i18n.ts - Language toggle store (123 keys)`. Actual `id` dictionary: **2 196 keys** (`src/store/i18n.ts` is 3 285 lines / 189 KB; counted as `"dotted.key": "value"` entries inside the `id: {` block). | A 20× understatement in the file that everything imports. It also hides the real bundle cost (see CR-10). | Update the header, or drop the count (it will drift again). |
| **CR-10** | `src/store/i18n.ts:19-20` | Comment: "jp translations lazy-loaded from separate chunk (~670 lines, ~20KB)". Actual: `src/store/i18n-jp.ts` = **2 676 lines / 172 KB**, built chunk `dist/_astro/i18n-jp.BVYPFrlB.js` = **142 767 B**. The ID dictionary itself builds to `i18n.Dxvuig_9.js` = 131 381 B and is loaded by every island that calls `t()`. | Not a correctness bug — the lazy-load design is right and is implemented — but the comment understates the JP payload 7×. Anyone sizing a slow-connection budget from this comment will be wrong. | Update the figures, or reference the gate (`bundle:size`) instead of hard-coding sizes. |
| **CR-11** | `netlify/functions/_lib/netlify-wrapper.ts:118-131` vs `netlify/functions/_lib/netlify-wrapper-surface.ts:33-42`, `:59-76` | The legacy catch-all wrapper maps outcomes with an inline ternary chain that knows only `rateLimited` / `OVERLOADED` / `DEADLINE_EXCEEDED` / `success===false → 400`. It has **no** `codeToStatus` and **no** `applyDbOutage`, both of which the surface wrapper uses. So on `bridge-links`, a `FORBIDDEN` becomes 400 and a database outage becomes 400 (not 503 + `Retry-After`). | Deliberate per the comment ("Legacy status mapping, preserved as-is for the retiring alias path"), so this is not a defect — but the comment four lines below (`:139-140`) says the two wrappers "must behave identically", which is only true of the metrics export. A client that falls back to `bridge-links` after a 404 (`src/lib/apiClient.ts:530-532`) silently gets a different error contract. | Either apply `applyDbOutage` to the legacy path too (it is one call, and the outage is not a legacy-client concern), or narrow the comment to "the metrics export must behave identically". |
| **CR-12** | `netlify/functions/_lib/handlers.ts:338-352`, `:382-417` | The idempotency mechanism is **inert**: no producer exists. `grep -r "Idempotency-Key"` matches only `_lib/netlify-wrapper.ts`, `_lib/netlify-wrapper-surface.ts`, `_lib/kernel/request-helpers.ts`, `docs/`, `migrations/006` — never `src/`. `isMutatingAction`'s hand-maintained set (`:383-415`) is therefore also unexercised, and it is not a complete list of the write actions the router exposes — `simpanSkorGame` (`surfaces/ai.ts:184`) writes to `game_scores` and is absent. | Dead infrastructure with a drift-prone list: the day a client starts sending the header, an unlisted mutating action is silently not deduped. The store side (`:368-376`) also writes a row for every mutating success once the header exists. | Either wire the client (`apiClient` is the one choke point — it already has a per-call identity) or delete the path and the list. |
| **CR-13** | `src/components/forms/AiCvForm.tsx` (3 542 lines, 35 `useState`, 11 `useRef`, 9 `useEffect`); `src/pages/index.astro` (3 212 lines); `src/components/App.tsx` (1 660 lines, 15 `useEffect`) | Three god-modules. `AiCvForm` alone is 2.1× the size of the next-largest component and holds 35 independent pieces of state. | Not a launch blocker, but this is where the next defect of CR-01's shape will come from: state that must be sampled atomically is spread across 35 hooks, and the submission payload is assembled by hand at the end. Also makes review of any single change unreliable. | No rewrite before launch. Post-launch, extract the form's state into one reducer (or one nanostore) so the submit payload is derived from a single snapshot instead of 35 closures. |

### 2.4 INFO

| ID | file:line | Note |
|----|-----------|------|
| **CR-14** | `src/store/i18n.ts` / `src/store/i18n-jp.ts` | The two dictionaries have drifted in both directions: 2 196 `id` entries vs 2 439 `jp` entries, of which **90 keys exist only in `id`** (e.g. `admin.ai_btn_model`, `ai.konflik_judul`) and **333 only in `jp`** (e.g. `landing.class_fac_kasur`, `job.job_title`). All 423 are **dead entries**, not missing translations: `src/store/i18n.keys.test.ts:162-167` asserts every *used* key is present in both dictionaries and passes (I ran it: 7/7). So the fallback-to-Indonesian risk is covered; the cost is bundle weight in a dictionary that is loaded by every island calling `t()`. |
| **CR-15** | `dist/_astro/admin.BK48ztvb.css` (236 217 B) | The admin stylesheet is linked from `dist/index.html` — the public landing page — because Tailwind v4 emits one CSS bundle per build rather than per page. ~236 KB uncompressed for a page that uses a fraction of it. Worth a measurement pass post-launch; not a defect. |
| **CR-16** | `netlify/functions/_lib/kernel/rate-limit.ts`, `_lib/kernel/admission.ts` | Reviewed for correctness only: the fail-open/fail-closed direction is documented at the call sites and the admission gate runs before the DB-backed limiter (`handlers.ts:235-241`), which is the right order. No finding. |

---

## 3. Per-module notes

### 3.1 Duplicated scoring logic (the launch risk named in the brief) — IN PARITY

There are **four** copies of the scoring rules, not two, and they are load-bearing:

| Rule | Client | Server | Parity guard |
|------|--------|--------|--------------|
| Genba shift + Ultimate Loop | `src/lib/arcade.ts:289-732` | `netlify/functions/shared/genba-skor.ts:32-252` | `shared/genba-skor.test.ts` |
| Kotoba | `src/lib/kotoba-skor.ts` | `netlify/functions/shared/game-skor.ts:76-110` | `shared/game-skor.test.ts` |
| Combo | `src/lib/arcade.ts:2755-2862` | `netlify/functions/shared/game-skor.ts:131-168` | `shared/game-skor.test.ts` |
| Matematika | constant only (`src/lib/matematika.ts:34`, `SKOR_PER_BENAR = 50`) | `netlify/functions/shared/game-skor.ts:44-58` | `shared/game-skor.test.ts` |

I stripped comments from both sides and diffed the function bodies mechanically rather than
eyeballing them:

- `hitungGenba` — **IDENTICAL** (client `arcade.ts` vs `genba-skor.ts`).
- `hitungCombo` — **IDENTICAL**.
- `hitungKotoba` — **IDENTICAL**.
- `SHIFT_GENBA`, `PRESISI_MOD`, `gelombangShift`, `durasiShift`, `poinGenba`, `nilaiShift`,
  `aturanUltimate`, `bonusUltimate`, `digitPresisi`, `RONDE_MAKS` — **IDENTICAL**.
- `ULTIMATE` — differs only by a type annotation (`Readonly<{…}>` vs `as const`); values identical.
- `skorShift` — the server inlines `100 * aturan.pesanan` where the client calls
  `bonusShift(aturan)`, which is `return 100 * aturan.pesanan` (`arcade.ts:434-436`). Numerically
  identical; noted only because it is the one place a future edit to `bonusShift` would silently
  desynchronise the two sides. **This is the highest-value refactor candidate in the repo**: a
  parity test protects the values but not the *shape* of the call.

The parity tests are genuine, not decorative: `shared/genba-skor.test.ts:45-55` sweeps a
6 × 8 × 6 grid of `(ms, batas, kombo)`, `:57-66` sweeps 41 waves × 3 tiers, `:117-130` replays a
seeded 60-event random round, and `:132-150` asserts that **both** sides return `null` for the same
malformed payloads. I ran them: 96 tests pass.

The remaining divergence is not in the functions but in how the components *call* them — CR-01 and
CR-06 above.

### 3.2 `netlify/functions/**` — general

- The dispatcher (`_lib/handlers.ts`) is well-structured: admission → rate limit → dispatch →
  idempotency → metrics-in-`finally`. The `finally` release (`:312`) is correct; a shed request
  never leaks a slot.
- Error handling is consistently `try/catch → safeError(...)` rather than leaking upstream bodies.
  `netlify-wrapper-surface.ts:252-256` correctly logs and returns a generic message.
- `_lib/db/client.ts` is the strongest module I read: `resolveSelect` / `writeBodyFor` are pure and
  the write-side column pruning is the documented fix for PostgREST `PGRST204`. `COLUMN_COERCERS`
  is deliberately narrow, which is the right call.
- `_lib/db/identity-sync.ts` correctly implements the `''`-not-null doctrine (`:160`, `:179-180`)
  and the "only filled values produce keys" rule (`:86-91`, `:156-163`) — which is what makes
  CR-05 stand out as an exception rather than a systemic problem.
- `_lib/db/candidates.ts:324-336` correctly handles "pick newest" for multi-row submissions
  (`order: 'updated_at.desc.nullslast'` + `limit: 5` + `.find()` on the normalised WA), with the
  reasoning recorded. Phone-number uniqueness is enforced at the DB level
  (`idx_cand_no_wa_uniq`, `migrations/002_drop_redundant_indexes.sql:119`), so
  `registerKandidat`'s check-then-insert (`identity/service.ts:337-339`) is a benign race that
  degrades to a generic "Gagal mendaftar." rather than a duplicate row.
- `contexts/applications/service.ts` is otherwise careful: it refuses to approve a biodata row
  (`:226-231`), separates `alasan_tolak` from `keterangan` (`:244-253`), and dedupes index lists
  before bulk delete (`:420-427`, with the `Number(null) === 0` trap documented). CR-03/CR-04/CR-05
  are the exceptions in an otherwise disciplined file.

### 3.3 `src/**` — client

- `src/lib/apiClient.ts` is the best-defended client module: per-call `AbortController` (`:494`),
  caller-abort vs timeout distinguished (`:606-614`), token cache keyed on the session identity
  (`:123`, `:282`), read cache tagged by token (`:41-54`), stale-write generation guard (`:597`).
  I found no correctness defect here.
- Preact hook hygiene is better than average: I scanned every component for `addEventListener`
  without `removeEventListener` and `setInterval` without `clearInterval`. The only hits were false
  positives (`LoginModal.tsx:65-72` removes both listeners on one line; `ListKandidatModal` /
  `UndanganKelasModal` use a state setter named `setInterval_`, not the timer API).
  `App.tsx:373` correctly returns the cleanup from `pasangHurufBesarModal()`, which does return one
  (`src/lib/hurufBesarModal.ts:54-61`).
- `src/lib/skorGame.ts` swallows all failures by design (`:93-97`) and says so. That is the right
  choice for gameplay, but it is what turns CR-01 and CR-02 from visible errors into silent ones —
  the two findings are only harmless in combination with a *correct* payload.
- `src/components/candidate/CandidateDash.tsx:241` parses `localStorage` unguarded, but inside the
  function's `try` (`:240`), so a corrupt value blanks the dashboard silently instead of crashing.
  Acceptable; noted only because the failure mode is "empty page, console only".

### 3.4 `indexer/**`, `scripts/**`, `e2e/**`

- `e2e/` contains 14 `.mutations.sh` files that deliberately break the code to prove each gate can
  fail. That is a practice most repos do not have, and it materially raises my confidence in the
  e2e gates. I did not run them (QA owns that).
- `scripts/ci/typecheck-ratchet.mjs` is a real ratchet, not a rubber stamp: it fails on a total
  increase *and* on any file that had no errors becoming an error surface. Current state 0/0.
- `scripts/ci/bundle-size.mjs` has a derived (not guessed) 600 KB per-entry ceiling with the
  measurement in the comment. It reads `scripts/ci/bundle-size-baseline.json`, which exists.
- `indexer/**` is excluded from the app tsconfig by design (`tsconfig.indexer.json` header) and has
  its own frozen-inventory tests. I did not find a reason to distrust it and did not review it
  line-by-line.

### 3.5 Test quality (my slice: can these tests fail?)

I looked specifically for vacuous assertions:

- No test file in `src/`, `netlify/`, or `shared/` contains `it(...)`/`test(...)` with zero
  `expect(` calls.
- The parity tests sweep real grids and assert `null` on both sides for malformed input — they fail
  if either copy moves (verified by inspection of the loops, and they pass today).
- `src/store/i18n.keys.test.ts:162-167` asserts every *used* key exists in the JP dictionary and
  would fail with a clear message naming the file/line. It is the reason CR-14 is INFO and not a
  product bug.
- `service-bulk-delete.test.ts` (25 tests) covers the semantics I was worried about
  (`DISETUJUI` not `LULUS`, no `status_kandidat` on approval, `id_loker_pilihan` preserved on a
  real application row). It does **not** cover the round-trip cost (CR-03) or the duplicate push
  (CR-04) — neither is observable through the `./repository` stub seam the file uses.

### 3.6 Executed reproduction — CR-01 and CR-02

`deliverables/gstack/verify-cr01-cr02.mjs`, run as
`node --experimental-strip-types deliverables/gstack/verify-cr01-cr02.mjs` from `/f/astro`, exit 0.
It reproduces the production effect shape under jsdom + Preact 10.24 (`deps: [skorCombo]` only,
`ronde` read from a ref at fire time, `kombo` closed over) and feeds the resulting payload to the
real `hitungCombo` imported from `netlify/functions/shared/game-skor.ts`. Only the 5 000 ms debounce
is shortened (to 60 ms); the mechanism is untouched.

```
=== A. payload the timer actually sends (production effect shape) ===
sent: {"skorCombo":100,"kombo":2,"kalimat":0,"ronde":[[1,0],[0,0]]}

=== B. server replay + the comparison at leaderboard.ts:299-302 ===
hitungCombo(ronde) -> {"skor":100,"kalimat":0,"kombo":1}
komboKlien=2  hasil.kombo=1  ->  REJECTED

=== B2. control: same ronde, kombo taken from the replay (no stale state) ===
komboKlien=1  hasil.kombo=1  ->  accepted

=== C. CR-02: rondeComboRef is never reset, server caps at RONDE_MAKS_COMBO ===
hitungCombo(4000 events)     -> ok, skor=1998200
hitungCombo(4001 events) -> null  -> "Rincian ronde tidak sah atau tidak dikirim."

=== D. CR-02b: which ceiling is actually reached first ===
leaderboard.ts: SKOR_MAKS=1000000  SKOR_MAKS_ULTIMATE=10000000
batasSkor({}) for a Combo payload (no detail.loop) = 1000000
first tap count whose replay score exceeds the ceiling: 2004 (skor=1000200)
  -> simpanSkor answers "Skor tidak masuk akal." (leaderboard.ts:323-325)

CR-01 CONFIRMED — stale kombo causes rejection; replay-derived kombo is accepted.
CR-02 CONFIRMED — the same array is accepted at the cap and rejected one event past it.
CR-02b CONFIRMED — the score ceiling rejects a legitimate replay at 2004 taps.
```

The B2 control is what makes CR-01 falsifiable rather than a story: the identical `ronde` is
accepted once `kombo` is taken from the replay, so the rejection is attributable to the stale state
and to nothing else. A realistic mixed stream (10-card sentences) crosses the CR-02b ceiling at
**191 sentences / 2 101 events**, measured with the same module.

---

## 4. What I could not verify, and why

1. **Runtime behaviour in a live browser.** I did not start a dev/preview server (explicit
   constraint) and did not run the Playwright/e2e suites. CR-01 and CR-02 are no longer merely
   reasoned: both are executed out-of-browser by `deliverables/gstack/verify-cr01-cr02.mjs` (§3.6),
   with a control case that isolates the cause. What I still have **not** done is watch the real
   `/arcade` page POST to `/.netlify/functions/ai-chat` and see the 200-with-`success:false` come
   back — that end-to-end step is qa-lead's repro, and it also depends on a logged-in VIP candidate
   (the score route is gated by `tolakKecualiSiswa`, `_lib/siswa-gate.ts:23-44`).
2. **Database constraints and live data.** Everything I say about uniqueness (`idx_cand_no_wa_uniq`),
   nullability, and canonical empty values comes from `migrations/*.sql` and
   `schema.generated.ts`, not from a live catalog read. If a migration was applied out of band, the
   CR-05 analysis could shift.
3. **The full test suite.** I ran four test files (96 + 7 tests) chosen for the parity and bulk-delete
   paths. QA owns the full run. I did not run `npm run build` at all — the delete quota constraint
   was explicit and the existing `dist/` was sufficient for the bundle observations.
4. **`_lib/ai/*` in depth.** `chat.ts` (1 300+ lines) and `cv.ts` (800+ lines) were skimmed for
   error-handling shape, not reviewed line-by-line. They are the two largest untested-by-me surface
   areas and the most likely place for a remaining correctness defect. If the gate needs one more
   pass, that is where I would spend it.
5. **The `godot/` and `dist/` artefacts.** Out of scope; treated as build outputs.
6. **`src/lib/cv-template-factory/**` renderers** (kinki 46 KB, rirekisho-detail 30 KB, plus large
   `.b64.ts` template blobs). Reviewed only for import shape (the b64 blobs are data, not logic).
   Not verified against real candidate data.

### Environmental notes (not code defects)

- No `SAFE_DELETE_BULK_CONFIRM_REQUIRED`, `EBUSY`, or `exit status null` appeared during this
  review. Every command I ran exited 0.
- `npm run <script>` was avoided as instructed; all runs used direct module paths from `/f/astro`.
