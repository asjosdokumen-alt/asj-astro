# QA Gate — Pre-Launch Verification

**Repo:** `F:/astro` ("asj-astro")
**Date of measurement:** 2026-11-18, 02:07–02:25 (+0700)
**Commit measured:** `55b081e` — `feat(env): env:bootstrap — provisioning lokal sekali jalan, tanpa overwrite` (Wed Nov 18 02:07:48 2026 +0700), branch `main`
**Author:** qa-lead (Workstream 3 of 3)

---

## 1. Verdict

### **CONDITIONAL — do not ship on the strength of the automated gates alone.**

> **ADDENDUM (see §10):** two **real code defects** in the Combo leaderboard path were
> subsequently confirmed at runtime (`CR-01`, `CR-02`), plus a third by reading (`CR-04`).
> The statement below that "no code defect was proven" applied to the *gate run only* — it is
> now superseded. `CR-01` should be treated as a **blocking** launch defect.

The gate suite is **not** a rubber stamp: several gates are genuinely strong and would
catch real regressions (server-side game-score replay, frontend→backend action registry
contract, i18n key coverage, lint/tsc ratchets). No **code defect** was proven.

But three things block an unconditional PASS:

1. **No gate command exited 0 end-to-end.** `vitest` exited **1** (2 red tests) and
   `npm run build` exited **1**. I attribute both reds to the environment rather than to
   the code (§4), but I cannot present a green run, and a pre-launch gate that has never
   been observed green in this environment is not evidence of health.
2. **The red tests revealed a live production-database quota failure** — the Neon project
   refused a Postgres session with *"Your account or project has exceeded the quota."*
   That is not a test bug. It is a production-infrastructure signal that needs a human to
   confirm against the Neon dashboard before launch (§4.1).
3. **Coverage holes sit on the highest-value flows** — candidate registration → admin
   approval, session expiry, the reject path, and the AI-CV load/auth path have no test
   that would fail if they broke (§5). These are launch-critical paths.

Full reasoning and per-item evidence follow. Everything below was executed; nothing is
inferred from a failure message alone.

---

## 2. Baseline — what exactly was measured

| Fact | Measured value |
|---|---|
| `git log -1 --format='%h %ad %s'` | `55b081e Wed Nov 18 02:07:48 2026 +0700 feat(env): env:bootstrap — provisioning lokal sekali jalan, tanpa overwrite` |
| `git status --porcelain \| wc -l` | **323** |
| Untracked entries (`??`) | **323**, **all** under `deliverables/` |
| **Modified / deleted tracked files** | **0** |
| Tree dirty? | Dirty in the untracked sense only |

**Therefore: every number in this report describes commit `55b081e` itself, not a
work-in-progress working tree.** No source, test, config or fixture file differs from the
commit. The 323 untracked entries are pre-existing report/screenshot scratch files in
`deliverables/`, not code.

After the run I re-checked: `git status --porcelain | grep -v '^??' | wc -l` = **0**.
One tracked file *was* transiently rewritten by the test run —
`indexer/validate-report.json` (it embeds a machine-specific `rootDir`). I restored it with
`git checkout -- indexer/validate-report.json` and did not commit it.

I made **no** commits, `git add`, or pushes. The only writable output is this file; scratch
logs are in `F:/tmp/qa/`.

---

## 3. Gate-by-gate results

Run serially in the prescribed order (tests → typecheck → lint ratchet → build) so that the
build's sandbox delete-quota consumption could not forge earlier failures.

| # | Gate | Command | Exit | Measured result |
|---|---|---|---|---|
| 1 | Unit/integration tests | `node node_modules/vitest/vitest.mjs run` | **1** | **279 test files: 278 passed, 1 failed. 3935 tests: 3933 passed, 2 failed, 0 skipped.** Duration 619.26 s |
| 2a | Typecheck (app) | `tsc --noEmit -p tsconfig.json` | **0** | 0 diagnostics, 0 output lines |
| 2b | Typecheck (indexer) | `tsc -p tsconfig.indexer.json --noEmit` | **0** | 0 diagnostics, 0 output lines |
| 3 | Lint ratchet | `node scripts/ci/lint-ratchet.mjs` | **0** | baseline **1968** (frozen 2026-11-13) → current **1957**. Debt **−11**. 1 file improved: `src/components/DocumentPreviewModal.tsx` 5→2 |
| 4 | Production build | `npm run build` | **1** | Compilation completed; failed in Astro's **post-build cleanup** on the sandbox bulk-delete guard (§4.2) |
| 4b | SW-manifest repair | `node scripts/build-sw-manifest.mjs` | **0** | version `asj-astro-a2dffda4d818`, **175 precache URLs** (21 pages / 36 routes / 116 assets), `dist/sw.js` 21662 B |
| 4c | Dist-dependent gates re-verified against HEAD build | `vitest run src/lib/swOffline.test.ts src/lib/serverMime.test.ts e2e/sitemap-robots-agreement.test.ts` | **0** | **3 files, 44 tests, all passed** |

Both typechecks are clean against a **frozen baseline of `total: 0`**
(`.ci/tsc-baseline.json`) — i.e. the typecheck gate permits exactly zero errors and the tree
satisfies it.

The lint ratchet is a well-formed gate: it fails on (1) total increase, (2) diagnostics
appearing in a previously clean file, and (3) a file that already had diagnostics gaining
more even when the total is flat. Condition (3) is the one that actually prevents debt
shuffling between files. It passed legitimately — debt went **down**, not sideways.

---

## 4. Failing-test attribution

Exactly **two** tests are red, both in one file, both in the same `describe` block.

| # | File:line | Test name | Duration | Verbatim error | Attribution |
|---|---|---|---|---|---|
| 1 | `e2e/master-light-rpc.test.ts:231` | `baris dengan gender hanya di ai_data_json kini terisi lewat bio` | 308 ms | `error: Your account or project has exceeded the quota. Upgrade your plan to increase limits.` | **Infrastructure (Neon project quota)** — not a code defect |
| 2 | `e2e/master-light-rpc.test.ts:270` | `WA yang tidak ada tetap mengembalikan nol baris (bukan error)` | 220 ms | same server error (vitest prints it once for both failures) | **Infrastructure (Neon project quota)** — not a code defect |

Stack for both: `parseErrorMessage → node_modules/pg-protocol/src/parser.ts:395` →
`Parser.handlePacket` → `Parser.parse` → `TLSSocket.<anonymous>`.

**Why this is not a code defect.** `pg-protocol`'s `parseErrorMessage` only runs on an
`ErrorResponse` packet **sent by the Postgres server**. The client reached the server, the
server answered with a quota refusal. No assertion in the test was reached. The message is
Neon's plan-quota wording, not a schema or logic error.

**Why these two ran at all.** They live under `describe.skipIf(!dbUrl)`
(`e2e/master-light-rpc.test.ts:230`) — they skip when no connection string is configured.
`dbUrl` resolves because `.env.local` carries `Direct_Connection_DB`, which
`scripts/lib/load-env.mjs` (`initDbEnv`) maps case-insensitively onto `SUPABASE_DB_URL` /
`DATABASE_URL`, upgrading the direct host to the Supavisor pooler. So on this machine the
block does not skip — it connects. The run reported **0 skipped tests**, which confirms the
block executed.

### 4.1 ⚠ Launch-relevant: the production database is refusing connections

`.env.local` points at the **production** Neon project (this is stated in
`vitest.config.ts` and in `netlify/functions/_lib/db/test-guard.ts`). A session to that
project was refused with a plan-quota error at 02:12–02:13 on 2026-11-18.

What I can state as measured:

* A direct Postgres session to the project named in `.env.local` was refused by the server
  with the quota message above, twice in the same run (two tests, two `pg.Client`
  connections; vitest deduplicated the printed text).
* The other 3933 tests pass because they **mock** PostgREST (`supabaseJson`) and never open
  a network connection — so their passing says nothing about database reachability.

What I did **not** measure, and will not claim:

* I did not exercise the production **PostgREST/HTTPS** path that the app actually uses, so I
  cannot state that the live portal is currently down. The quota is project-level, which
  makes it likely to affect PostgREST too, but that is an inference, not a measurement.
* I did not confirm whether the quota is transiently exhausted or persistently over plan.

**Action required before launch:** someone with Neon dashboard access must confirm the
project's quota/compute status. This is the single most time-sensitive item in this report.

### 4.2 Build failure is the sandbox, not the compiler

`npm run build` exited **1**, but the failure is in Astro's post-build **cleanup**, not in
compilation:

```
[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":50,"threshold":50,"scope":"turn",
 "targets":["F:\\astro\\dist\\pages\\404.astro.mjs"],"targetCount":1}
  Location: node_modules/astro/dist/core/build/static-build.js:278:40
    at checkBulkDeleteGuard (.../node-safe-delete-shim.cjs:251:19)
    at cleanServerOutput (.../static-build.js:275:13)
```

Per the attribution rule for `SAFE_DELETE_BULK_CONFIRM_REQUIRED` this is the **sandbox
per-turn bulk-delete quota**, not a code defect. Independent evidence that the compile
itself succeeded:

* Build log contains **0** `[ERROR]` lines.
* `[build] ✓ Completed in 2.91s` for static entrypoints; every page was emitted
  (`/`, `/admin`, `/ai-cv`, `/apply`, `/arcade`, `/blog`, `/candidate`, `/kotoba`, `/loker`,
  `/master`, `/matematika`, `/public`, `/share`, `/siswa-baru`, `/tes-iq`, `/tes-mata`,
  `/tes-mbti`, `/wawancara`, `/404`).
* `dist/index.html` rewritten at 02:24:07; `dist/sitemap.xml` at 02:24:09.
* After repairing the SW manifest, **44 dist-dependent tests pass against that fresh output**
  (§3 row 4c).

**Consequence I had to repair.** Because the `&&` chain broke at `astro build`, the
`build-sw-manifest.mjs` step never ran, leaving `dist/sw.js` as the un-manifested copy of
`public/sw.js` (15894 B). I ran the sanctioned repair
(`node scripts/build-sw-manifest.mjs`) which produced the real manifest (21662 B, 175
precache URLs). Only generated, gitignored build output was touched.

### 4.3 Note on stale `dist/` at the start of the run

Before I ran anything, `dist/sw.js` was dated **2026-11-16 23:22:13** — **three commits
behind** `55b081e`. Because the prescribed order runs tests *before* the build, the
`swOffline` (33 tests), `sitemap-robots` (5) and `serverMime` (6) results in the main run
described a **stale artifact**, not HEAD. I therefore re-ran those three files after
rebuilding (§3 row 4c): all 44 pass at HEAD as well. Without that re-run the green would
have been unearned. See §7 finding G-3.

---

## 5. Workflow coverage matrix

Criterion applied: *"is there a test that would actually fail if this flow broke?"* — not
merely "does a test file mention it".

| # | Core flow | Handler / owner | Tested? | Would the test fail if the flow broke? |
|---|---|---|---|---|
| 1 | **Candidate registration → admin approval** | `contexts/registration/service.ts` — `handleSubmitDaftarSiswa:42`, `handleGetDaftarSiswaBaru:17` | ❌ **No test file exists** for the context | **NO.** `handleSubmitDaftarSiswa` is referenced once, at `e2e/public-cache-invalidation.test.ts:60`, with an **empty payload `{}`** — that test asserts cache behaviour only. `handleGetDaftarSiswaBaru` has **zero** test references. |
| 2 | **WhatsApp + PIN login** | `contexts/identity/service.ts` — `loginKandidat:300`, `checkAdminPersonal:244` | ✅ Yes | **YES** for the happy path: `identity/service.test.ts:257` (login → refresh → new session roundtrip); `identity/admin-personal.test.ts` (11 tests). Negative paths are thin. |
| 2b | **Session expiry** | `_lib/session.ts:91` — `if (typeof payload.exp !== 'number' \|\| now > payload.exp)` | ❌ **No** | **NO.** `session.test.ts` has **19 tests** covering sign/verify, `exp` *injection*, tamper detection, malformed input, timing-safe compare — and **not one** asserts that an **expired** token is rejected. Delete the `now > payload.exp` clause and all 19 still pass. |
| 3 | **Document upload** | `contexts/documents/service.ts` | ✅ Yes, strong | **YES.** `service-upload.test.ts`: extension allow-list (rejects `svg`), rejects active/executable content (`html, js, mjs, cjs, exe, sh`), forces `kandidat/<wa>` from the **session** (ignores client folder), batch signing under a bulkhead. `service-apply.test.ts`: public path cannot hijack an existing application; VIP gate for Magang jobs. |
| 3b | **Admin review → approve** | `applications/service.ts` — `handleReviewForm:336`, `handleApproveForm:342` | ✅ Partly | **YES** for approve (4 tests: writes `DISETUJUI` on the Mail row not `LULUS`; BIODATA rows refused; `status_kandidat` untouched) and review (1 test: writes `REVIEW`, not `REVIEW ADMIN`). |
| 3c | **Admin reject** | `applications/service.ts:348` — `handleRejectForm` | ❌ **No** | **NO.** Zero test references. This is a **previously-broken path**: its own comment records that an unchecked `reason` used to travel into PostgREST and surface as an opaque failure. The fix (`guardPayload`/`optionalTextOrEmpty`) has **no regression test**. Single-row `handleDeleteForm:371` is also untested (only the bulk variant is). |
| 3d | **Status change visible to candidate** | `master-data/service.ts:1204` — `handleGetMasterDataByWa` | ❌ **No** | **NO.** Zero test references. The *pure helpers* it calls are well covered (`repository.test.ts` — never queries without a `no_wa` filter, propagates errors instead of returning `null`), but the handler itself — including its session/role check — is untested. |
| 4 | **AI CV builder — save** | `_lib/ai/cv.ts` → `handleSubmitDataAsj` | ✅ Yes (16 tests) | **Partially.** Round-trip counts, schema-contract columns, scalar columns, `formLengkap` clear-on-delete — all asserted. **But** `requireRole` is **mocked to always return an admin token** (`e2e/ai-cv-submit.test.ts:71`), so the **authorization** aspect can never fail this suite. |
| 4b | **AI CV builder — draft load** | `master-data/service.ts:1302` — `handleGetDrafCvMaster` | ❌ **No** | **NO.** Appears only inside *comments* in two unrelated tests. The load path is unexercised. |
| 4c | AI CV mapping / merge | `src/lib/aiCvDraft.ts`, `aiCvPairs.ts` | ✅ Yes, strong | **YES.** Every flat key has a path; no orphan paths; master wins over AI; empty AI never overwrites filled master; malformed `AIDATAJSON` never throws; chronological sorting of work/education; deleted rows clear their slot. |
| 5 | **Mini-game round → server score verification → forged score rejected** | `_lib/game/leaderboard.ts` | ✅ **Yes — strongest area** | **YES, unambiguously.** `leaderboard.test.ts` (30+ tests, DB mocked, asserts on the stored POST body): claimed `999.999` ignored and the **replayed** value stored (`4.650` / `390` / `750`); submission with **no round** rejected; claimed correct-count / combo / sentence-count mismatch rejected; unknown game, unknown level, negative, `NaN`, `Infinity`, and above-cap scores rejected; replay-derived loop depth must match claim; tie-breakers deterministic. |
| 6 | **Admin panel — every tab mounts and loads** | `src/components/admin/AdminPanel.tsx` — `TAB_VIEWS:304` | ⚠️ Partly | **NO for the panel as a whole.** Reality is **12** routable tabs (`TABS` has 11 at `AdminPanel.tsx:63`, plus `PINNED_TABS = ['config']`), not the 9 in the brief. 7 have their own test (kelola, pelamar, tambah, dbjob, mail, wa, agenda). `tugas` and `skor` get incidental coverage inside `AdminPanel.test.tsx`. **`jadwal`, `tes`, `config` have zero coverage.** No test iterates `TAB_IDS`, so a tab that throws on mount fails nothing. |
| 7 | **Language switching ID / JP / EN** | `src/store/i18n.ts:8` — `export type Lang = "id" \| "jp"` | ⚠️ See note | **YES** for ID/JP: `i18n.keys.test.ts` walks the sources and asserts every used key exists in **both** dictionaries, no duplicate keys, no raw Indonesian left in `title`/`alt`/`aria-label`, no Indonesian in bare text nodes, and every `<BaseLayout titleKey>` resolves. **But EN does not exist** — see §5.1. |

### 5.1 Two spec-vs-reality discrepancies the brief asserts incorrectly

These are not code defects; they are mismatches between the brief and the shipped product.
The lead should adjudicate which is wrong.

1. **There is no EN language.** `src/store/i18n.ts:8` declares `export type Lang = "id" | "jp"`,
   `langStore` is persisted with default `"id"`, and
   `document.documentElement.lang = lang === 'jp' ? 'ja' : 'id'` (i18n.ts:3147). A
   case-insensitive search for `'en'` in `i18n.ts` returns **0** hits. If English is promised
   to users, this is a launch blocker; if not, the brief is wrong.
2. **`data-lang` is not a language code.** It carries an **i18n dictionary key** (211
   occurrences, e.g. `data-lang="footer.title"`, `data-lang="header.company_name"`), used as
   a marker for the dictionary walker and the contrast tests. It is not, and never was, a
   `lang="en"`-style attribute.
3. Related: `/ai-cv` does **not** take a "per-candidate token". `src/pages/ai-cv.astro`
   renders `<AiCvForm client:only="preact" />` with no token prop; `AiCvForm` identifies the
   candidate from `?wa=` in the URL (`waFromUrl`, AiCvForm.tsx:370) plus `authStore`. A
   WhatsApp number in a query string is an identifier, not a credential — the ownership
   check (if any) lives server-side and is not covered by a negative test (§5 row 4).

---

## 6. Edge-case matrix

| Edge case | Handled in code? | Tested? | Evidence / gap |
|---|---|---|---|
| Empty / absent data | ✅ Yes | ⚠️ Partial | `String(d.x \|\| '')` coercion in `registration/service.ts:52-68`; `buildBioFromMaster` and `aiCvDraft` both return empty shapes rather than throwing (tested). |
| **Duplicate phone numbers** | ⚠️ Split | ❌ **No** | `master_database_candidate.no_wa` **is** `UNIQUE` (`master_database_candidate_no_wa_key`, per `migrations/001_index_perf.sql:63`, `018_master_light_rpc.sql:29`). But the **registration** table `respon_siswa_baru` appears in **none** of the 60 migrations, and `handleSubmitDaftarSiswa` performs **no dedupe** before `insertSiswaBaru`. Duplicate registrations are possible and untested. |
| Submission with only some fields filled | ✅ Yes | ✅ Yes | `formLengkap` flag: empty-but-present fields clear their column; absent fields are left alone. `_lib/actions-master.test.ts:77-96` covers both branches, including the partial-caller case. |
| **Deleted field must be written `''`, not `null`** | ✅ **Correct** | ✅ Yes | `master-data/service.ts:1088` — `if (!filled && present && lengkap && !(col in out)) out[col] = ''`. Tested at `actions-master.test.ts:77` (`field yang dikirim KOSONG mengosongkan kolomnya`) and `:84` (without the flag, empty fields do not touch columns). Also `ai-cv-submit.test.ts` — a deleted education row clears its slot. |
| Concurrent submissions | ✅ By design | ⚠️ Contract only | Atomic id allocation via the `rpc/nextval` RPC (migration 024); the contract is locked by static tests (`ada migrasi yang mendefinisikan public.nextval`, `fungsinya hanya melayani candidate_id_seq`, `memanggil rpc/nextval dengan POST`) — all **passed**. These assert the *pairing* of code and migration, not actual concurrency. |
| **Expired token** | ✅ Yes (`session.ts:91`) | ❌ **No** | See §5 row 2b. The branch exists and is correct; nothing tests it. |
| Network failure mid-flow | ✅ Yes | ✅ Yes | `_lib/chaos.test.ts` — 17 tests, all passed (fallback data instead of propagating failure, breaker behaviour, deadline handling). |
| Very long input | ⚠️ Global cap only | ❌ **No** | `netlify-wrapper.ts:37` rejects bodies over 10 MB with HTTP 413. **The 413 branch is untested.** No per-field length cap on registration `nama` (only `String(...).trim()`), so a 10 MB "name" is accepted into a text column. |
| Upload of the wrong type | ✅ Yes | ✅ Yes | Extension allow-list + active-content rejection + session-forced folder (`documents/service-upload.test.ts`). |

---

## 7. Gate-quality findings

A gate that cannot fail is a launch risk in its own right. These are the problems with the
gates themselves, independent of whether the product works.

**G-1 — A test block writes to PRODUCTION and the safety guard cannot see it.**
`e2e/master-light-rpc.test.ts:230` runs when a DB URL is present, and its first test does
`BEGIN` → `insert into master_database_candidate …` → `ROLLBACK` against the **production**
database. The repo has a purpose-built guard for exactly this
(`_lib/db/test-guard.ts`, wired as `setupFiles` for the backend project), but it only fires
from `catatTulisDb(...)` inside `supabaseJson` (`db/client.ts:367`). A raw `pg.Client`
bypasses it entirely. *In this run the insert never executed* — the server refused the
session at connect — but the code path is live and unguarded. **Fix:** either skip the block
unless an explicit `ALLOW_PROD_DB_TESTS=1` is set, or extend the guard to `pg`.

**G-2 — Dist-dependent gates silently skip when `dist/` is absent.**
`swOffline.test.ts:52,203,265`, `sitemap-robots-agreement.test.ts:52` and
`serverMime.test.ts:155` are all `describe.skipIf(!hasBuild)`. In CI, if the build step is
skipped, fails, or runs in a different job, these gates report **pass by skipping**. A gate
whose green depends on an artifact it does not build is not a gate.

**G-3 — The gate order let a stale `dist/` be measured as if it were HEAD.**
At the start of this run `dist/sw.js` was from **2026-11-16 23:22:13**, three commits behind
`55b081e`. Running tests before the build means the 44 dist-dependent tests described an
older tree. They happened to pass at HEAD too (§3 row 4c), but nobody would have known
without the re-run. **Fix:** make the build a prerequisite of the test job, or stamp
`dist/` with the commit SHA and fail the dist-dependent suites on a mismatch.

**G-4 — An auth gate is mocked into permanent success.**
`e2e/ai-cv-submit.test.ts:71` stubs `requireRole` to always return an admin token. All 16
tests in that file therefore exercise the happy path only. If `handleSubmitDataAsj` stopped
authorizing writes, this suite stays green. Same shape in `templates.test.ts`'s use of tab
names. **Fix:** add one negative test per surface that asserts a write is refused without a
session.

**G-5 — No "every tab mounts" gate.**
`TAB_VIEWS` is a `Record<Tab, FunctionComponent>`, so TypeScript guarantees a component
exists for every tab id — but nothing guarantees any of them **renders**. `jadwal`, `tes` and
`config` are covered by no test at all, and no test iterates `TAB_IDS`. A one-line
`TAB_IDS.forEach(id => expect(() => render(<TabContent tab={id}/>)).not.toThrow())` would
close it.

**G-6 — Seven exported handlers on launch-critical paths have zero test references.**
`handleRejectForm`, `handleDeleteForm`, `handleSubmitDaftarSiswa`,
`handleGetDaftarSiswaBaru`, `handleGetDrafCvMaster`, `handleGetMasterDataByWa`,
`handleSimpanBiodataLengkap`. Their *pure helpers* are well covered, which makes the
coverage numbers look healthier than the flow coverage is.

**G-7 — Frozen counters were re-baselined, not fixed, at HEAD.**
Commit `e8f87fe` (`test: baseline hijau di HEAD — 7 gate merah diperbaiki`, 2026-11-18
01:56, i.e. 11 minutes before HEAD) states it measured **5 files / 7 red tests** at
`031acf9` and left the tree green by combining real fixes (`server.cjs` MIME for
`.wasm`/`.pck`, `TabPelamar` i18n key, `indexer/bind.ts` globals, `App.tsx` anchors) with
counter moves: `fileCount 663→664`, `count('ts') 377→378`, `files.length 663→664`, and the
symbol ceiling **`36200→37000`** (measured 36441, **+559 headroom**). The counter moves are
legitimate — files really were added — but the raised ceiling now permits 559 additional
symbols before it bites, which is slack the next regression can spend silently.

**G-8 — Doc drift inside the gate itself.**
`scripts/ci/lint-ratchet.mjs:7` still says the tree carries *"2,723 pre-existing
diagnostics"*; the enforced baseline (`.ci/biome-baseline.json`) records **1968**. The
comment is not enforced, so it cannot fail — but it misleads the next reader about how much
debt exists.

**Positive gate findings worth keeping:** `_lib/action-registry.test.ts` verifies that every
action the frontend calls exists in the backend registry **and** that every client route is
accepted by its target entry point — a genuine bidirectional contract gate. The game-score
replay tests (§5 row 5) are the model the other flows should follow: they assert on the
**stored** value, not on the client's claim.

---

## 8. What I could not verify, and why

1. **The live production portal.** I cannot log in and must not POST to anything that proxies
   production (`localhost:8888`). Everything about the running system is inferred from
   handler code plus its tests, never observed. No end-to-end browser flow was executed.
2. **A green build.** `npm run build` never reached exit 0 in this environment. The compile
   completed and 44 dist-dependent tests pass against its output, but **the command exited
   1** and I will not present it as a passing build. The failure is the sandbox's
   per-turn bulk-delete quota (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`, 50/50), which the fallback
   bare compiler would hit at the same `cleanServerOutput` call — so retrying would not help
   within this session.
3. **A green test run.** 2 of 3935 tests are red. I attribute both to the Neon quota error,
   not to code, but the run's exit code is 1 and the suite has not been observed green here.
4. **Database reachability via the app's real path.** I measured a refused **direct** Postgres
   session. I did not measure **PostgREST over HTTPS**, which is what the application uses. I
   therefore cannot state whether the portal is down right now — only that the project's
   quota refused a connection at 02:12 on 2026-11-18 (§4.1).
5. **Whether the Neon quota condition is transient.** Two connection attempts in one run both
   failed. I did not retry later in the session, and deliberately did not hammer a
   quota-exhausted production database to find out.
6. **Concurrency.** The `nextval` contract is tested statically (code↔migration pairing);
   actual simultaneous submissions were not exercised.
7. **`indexer` real-tree suites.** They ran (they are part of the 279 files and the 619 s
   duration) but I did not individually enumerate their per-file pass counts beyond what the
   summary reports; their green is included in "278 files passed".
8. **The end-to-end hop for CR-01/CR-02 — a real `POST /.netlify/functions/ai-chat` returning
   HTTP 200 with `{success:false}`.** I did not prove this, and it is **unverifiable before
   launch**, for two reasons that stack:
   * **Fixture:** the endpoint is gated by `tolakKecualiSiswa`
     (`netlify/functions/_lib/siswa-gate.ts:23-44`), which admits an admin, or the owner of the
     WA **and** `statusVip(wa)` true — i.e. a candidate whose `catatan` carries `[VIP]` or
     `[KELAS xx]`. I do not have such a session.
   * **Blocker:** `statusVip(wa)` is a **database read**, and the production database is
     refusing connections under the quota failure (§4.1). So even a valid VIP session would
     currently be turned away with `'Gagal memeriksa status siswa. Coba lagi sebentar.'`
     — the gate explicitly distinguishes "check failed" from "not a student".
   Consequently I **cannot** state whether any candidate carries the VIP/`[KELAS]` tag either:
   answering that requires a query I cannot run. **Treat the end-to-end assertion as
   unverified, not as an assumed pass.** It should be re-attempted once C-1 (the quota) is
   cleared; CR-01's client-side defect is already proven without it (§10).

---

## 9. Action items, by severity

**Blocking (must clear before launch)**

0. **`CR-01` — fix the Combo payload divergence (§10).** `kombo`/`kalimat` must be read at
   fire time alongside `ronde`, or the timer must re-arm on `kombo` change; and `kirimSkor`
   must surface a `success:false` instead of swallowing it. Any Combo run with a missed card
   currently loses its leaderboard entry **silently**, and `bolehKirim` makes the loss
   permanent for that score. Confirmed at runtime.
1. **Confirm the Neon project's quota status.** A production database refused a session with
   *"Your account or project has exceeded the quota"* on 2026-11-18 02:12. If the project is
   over plan, the portal's PostgREST path is at risk. Owner: whoever holds the Neon account.
2. **Close the unguarded production-write test** (`e2e/master-light-rpc.test.ts:230`, G-1).
   It is one environment variable away from writing to live candidate data.
3. **Add a test for session expiry** (`session.ts:91`, §5 row 2b). The logic is correct today;
   nothing protects it.
4. **Add a test for the reject path** (`handleRejectForm`, §5 row 3c) — a path that has
   already been broken once and whose fix is unlocked by any test.

**High (before the next release, ideally before launch)**

4b. **`CR-02` — reset `rondeComboRef` per session/shift** like Genba (`ArcadeGame.tsx:606`)
    and Kotoba (`KotobaGame.tsx:937`) already do (§10). Note the *practical* trigger is the
    `SKOR_MAKS = 1_000_000` ceiling at ~190 completed sentences (2 090 events), not the
    4000-event cap — so either raise/justify the ceiling for Combo or reset the array well
    before either limit.
4c. **`CR-04` — move `notifyAdmins` out of the per-row loop** (`applications/service.ts:692`)
    and add the two-row assertion the harness already has the plumbing for (§10, G-9).
5. Cover **candidate registration → admin approval** end to end (§5 row 1). This is the
   biggest hole and the flow a real user meets first.
6. Add **one negative auth test per surface**; stop mocking `requireRole` into permanent
   success (G-4).
7. Add the **mount-all-tabs** gate and cover `jadwal`, `tes`, `config` (G-5).
8. Resolve the **EN language** question (§5.1): either build it or correct the promise.
9. Cover `handleGetMasterDataByWa` and `handleGetDrafCvMaster` — the two read paths behind the
   candidate dashboard and the AI-CV draft (§5 rows 3d, 4b).

**Medium**

10. Make the **build a prerequisite** of the test job, or stamp `dist/` with the commit SHA
    and fail on mismatch (G-2, G-3).
11. Add a test for the **413 body-size limit** and a per-field length cap on registration.
12. Tighten the symbol ceiling from 37000 back toward the measured 36441 (G-7).
13. Correct the "2,723 diagnostics" comment in `lint-ratchet.mjs` (G-8).
14. Put `respon_siswa_baru` under migration control and decide the duplicate-registration
    policy (§6).

---

## Appendix — raw artifacts

| File | Contents |
|---|---|
| `F:/tmp/qa/vitest-full.log` | Full, untruncated vitest output (1235+ lines) incl. summary and both failure blocks |
| `F:/tmp/qa/tsc-main.log` | Empty — 0 diagnostics |
| `F:/tmp/qa/tsc-indexer.log` | Empty — 0 diagnostics |
| `F:/tmp/qa/lint-ratchet.log` | Ratchet report: 1968 → 1957 |
| `F:/tmp/qa/build.log` | Full build log incl. the verbatim `SAFE_DELETE_BULK_CONFIRM_REQUIRED` block |
| `F:/tmp/qa/sw-manifest.log` | SW repair: 175 precache URLs |
| `F:/tmp/qa/dist-gates-rerun.log` | 3 files / 44 tests against the HEAD build |

**Nothing in this report was written from memory or inferred from a failure message. Every
number is a value read out of one of the files above.**

---

## 10. Addendum — confirmed defects from code review (2026-11-18, later)

`code-reviewer` reported three issues in the Combo leaderboard path as read-only findings and
asked me to confirm them. **All three are confirmed.** `CR-01` and `CR-02` were proven at
runtime against the **real** validator; `CR-04` is confirmed by reading.

Method and safety: the decision point for both Combo defects is the pure function
`hitungCombo` in `netlify/functions/shared/game-skor.ts` (self-contained, zero imports). I
probed it directly with `node --experimental-strip-types` against the real module —
**no database connection, no network, no writes, no server started**. Probe:
`F:/tmp/qa/probe-combo-cr01-cr02.mjs` (exit 0, all checks passed).

### CR-01 — a Combo score is silently discarded after any wrong tap (BLOCKING)

**Verdict: CONFIRMED at runtime.**

The mechanism is a closure/ref split inside the submit effect at
`src/components/candidate/ArcadeGame.tsx:1075-1089`:

```js
const id = window.setTimeout(() => {
  if (!bolehKirim(`combo:${skorCombo}`)) return;
  void kirimSkor('combo', skorCombo, {
    kombo,                        // ← closed over from the render that ARMED the timer
    kalimat: kalimatSelesai,      // ← same
    ronde: rondeComboRef.current, // ← read from the ref at FIRE time
  })
}, 5000);
}, [skorCombo]);                  // ← only re-arms when skorCombo changes
```

The wrong-tap branch (`ArcadeGame.tsx:1163-1175`) calls `setKombo(1)` and pushes `[0,0]` into
`rondeComboRef.current` — and **never calls `setSkorCombo`**. The correct-tap branch
(`:1130-1136`) sets both. Consequence: after a wrong tap the effect does not re-run, so the
armed timer keeps `kombo` = the **pre-mistake** value, while `ronde` at fire time already
contains the mistake.

Measured with the real `hitungCombo`:

| | value |
|---|---|
| player's events | `[[1,0],[0,0]]` (one correct tap, then one wrong) |
| server replay | `{ skor: 100, kalimat: 0, kombo: 1 }` |
| client sends | `kombo: 2`, `ronde: [[1,0],[0,0]]` |
| `kalimat` guard (`leaderboard.ts:296-298`) | does **not** fire |
| `kombo` guard (`leaderboard.ts:299-302`) | **fires** |

→ server answers `{ success: false, message: 'Ronde tidak cocok dengan kombo terakhir.' }` —
exactly the reviewer's prediction.

**Why the player never finds out, and cannot retry:**

1. `kirimSkor` (`src/lib/skorGame.ts:93-97`) returns `null` when `r.success === false` and
   swallows every throw — it is called as `void kirimSkor(...)` with only `.then(...)`, so the
   rejection produces no UI, no log, no retry.
2. `bolehKirim` (`src/lib/skorGame.ts:129-134`) adds the key to `sudahKirim` **before** the
   send and never removes it on failure. So `combo:100` is burned permanently — that exact
   score value can never be resubmitted for the rest of the session.

Net effect: any Combo run where the player misses a card after scoring produces a **silently
lost** leaderboard entry. This is a data-loss defect on a user-facing feature.

### CR-02 — Combo stops recording permanently; the binding limit is the SCORE ceiling, not the event cap

**Verdict: CONFIRMED at runtime — but the root cause in the original repro was wrong, and I
correct it here.** `code-reviewer` first attributed this to the 4000-event cap. The real
limiter fires at roughly **half** that.

`rondeComboRef` (`ArcadeGame.tsx:379`) is **only ever pushed to** (`:1133`, `:1146`, `:1169`) —
never cleared, never reassigned — and each 5 s submit re-sends the **entire session**. So the
array only grows for the life of the page.

**What actually stops it first: the score ceiling.** The Combo payload is
`{ level, kombo, kalimat, ronde }` (`ArcadeGame.tsx:1079-1085`) and never sets `detail.loop`,
so `batasSkor` (`leaderboard.ts:78-81`) returns `SKOR_MAKS = 1_000_000` (`:49`) rather than the
10 000 000 Ultimate-Loop ceiling. That is enforced at `leaderboard.ts:323-325`:

```js
if (skor > batasSkor(detail)) {
  return { success: false, message: 'Skor tidak masuk akal.' };
}
```

Measured against the real `hitungCombo`, on a **legitimate** (non-forged) replay of completed
10-card sentences at full time bonus:

| pattern | first sentence count over 1 000 000 | events | score |
|---|---|---|---|
| 10-card sentences | **190** | 2 090 | 1 005 200 |
| 5-card sentences | 372 | 2 232 | 1 002 600 |

(`code-reviewer` reported 191 sentences / 2 101 events / 1 002 860 for the 10-card shape — same
order, off by one sentence depending on the time-bonus `nilai` used. The conclusion is
identical; only the exact crossing moves.)

**The 4000-event cap is real, but it is never the first thing to bite.** Verified precisely:

| `ronde.length` | `hitungCombo` |
|---|---|
| 3999 | accepted, skor 1 997 700 |
| 4000 (`RONDE_MAKS_COMBO`, `shared/game-skor.ts:122`) | accepted, skor 1 998 200 |
| 4001 | `null` → `'Rincian ronde tidak sah atau tidak dikirim.'` |

At the event cap the replay score is **1 998 200 — about twice `SKOR_MAKS`** — so the score
ceiling always fires first. Both failures are silent through the same `kirimSkor` swallow
described under CR-01, and both are permanent for that page session.

**Why this matters more than a 4000-event curiosity:** ~190 completed sentences is a *legitimate*
play pattern, not an abusive one. A long-session Combo player hits a ceiling that was intended as
an anti-abuse net, and is told nothing.

**The reviewer's "not a bug" clearance is also verified:** Genba resets at
`ArcadeGame.tsx:606` (`rondeRef.current = []` in the shift-start block), and Kotoba resets at
`KotobaGame.tsx:937` (`rondeRef.current = []`). Combo is the only one that does neither.

### CR-04 — one upload produces N identical admin pushes

**Verdict: CONFIRMED by reading.** (`netlify/functions/contexts/applications/service.ts:692-697`)

`targets` is every form row for that WA (`repository.ts:27-35`, `limit: 500`), and
`notifyAdmins(...)` is called **inside** `for (const existing of targets)`. The message string
is identical on every iteration — it does not name the row — so a candidate with N form rows
yields **N byte-identical pushes** for a single upload.

**Gate-quality note (G-9):** the test harness already has everything needed to catch this and
does not use it. `service-bulk-delete.test.ts:36` declares `const notified = []`, `:57` records
every call, and `:395` resets it in the `syncFormMailDariUpload` describe — but **no test in
that describe asserts `notified.length`**, and every test there supplies **exactly one** form
row (`:398`, `:410`, `:422`). The duplicate is structurally unreachable by the suite. Adding a
two-row fixture plus `expect(notified).toHaveLength(1)` would close it.

### Effect on the verdict

`CR-01` is a **blocking** launch defect: a user-visible, silent data-loss path in a shipped
feature, on a flow the gate suite covers heavily and still misses. It also sharpens finding
G-4/§7: the Combo replay tests are the strongest in the repo, and they still did not catch this
because they test the **server** in isolation — the defect lives in the **client's payload
construction**. That is the coverage shape to add next: a test that asserts the payload the
client builds, not just the payload the server receives.

