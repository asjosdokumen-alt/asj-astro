# Pre-Launch Quality Gate — ASJ Portal (all modules)

**Date**: 2026-11-18
**Scene**: 上线前检查 — code review + security audit + QA testing, consolidated Go/No-Go
**Members**: 产品评审员 (`code-reviewer`) · 安全官 (`security-officer`) · QA与发布 (`qa-lead`)
**Baseline measured**: `55b081e` (2026-11-18 02:07:48), tracked files modified = **0**, untracked = 323 (all under `deliverables/`, invisible to frozen counters). `origin/main` is **2 commits behind** — `55b081e` and `e8f87fe` are local only, **not pushed** (R19).

---

## 📌 TL;DR

- **Verdict: 🔴 NO-GO.** Three confirmed Critical findings, two of them already-live exposures. Do not launch.
- **Plus one user-facing data-loss bug, confirmed at runtime** (H-7): the Combo mini-game silently discards a player's leaderboard entry whenever they miss a card after scoring — and burns the submission key so it can never be retried. This survived a green suite because the tests exercise the server in isolation while the defect is in the client's payload construction.
- **The code is largely not the problem.** `tsc` 0/0, lint debt improved 1968 → 1957, **3 933 / 3 935 tests pass**, and the scoring parity risk named in the brief is *clean* — four copies of the game rules are byte-identical after comment stripping. Code review's own spread is 1 High / 4 Medium / 8 Low / 3 Info, and that one High (CR-08) is the **same defect** as the security officer's F-05, counted once as **H-3**. Code craft adds no High beyond the security axis.
- **The deployment is the problem.** Production is **already partially down**: an authenticated read against the Neon Data API returns **HTTP 402 "exceeded the quota"** (measured by the lead, twice, on the same host that `env-kunci/PRODUCTION.env` resolves to). The static shell still serves `200`.
- **Two irreversible exposures are live now**: real candidate biodata is committed to a **public** GitHub repo, and identity documents are addressed through `/object/public/` at predictable paths.
- Fix order is forced: **contain the leaks → restore the database → close the authz holes → then talk about shipping code.**

---

## 🟢 Status terbaru — 2026-11-19 00:15 WIB

Verdict **masih NO-GO**, tetapi seluruh blocker kode yang bisa ditutup tanpa keputusan
owner sudah ditutup secara lokal. **Lima belas commit lokal belum di-push**
(`origin/main...HEAD` = **0 / 15**) sesuai R19.

| Temuan | Status | Bukti |
|---|---|---|
| C-1 kuota compute | ✅ Tutup | cron `*/15`/`*/30` sudah deploy sejak 18:06 WIB; alarm harian 09:00 aktif |
| C-2 PII di repo publik | 🟡 Sebagian | 3 berkas dihapus dari HEAD (`dbbe6dfc`). **History/fork masih publik** — butuh keputusan owner untuk `filter-repo` + force-push |
| C-3 bucket dokumen publik | 🔴 Buka | Butuh bucket privat + signed URL; tidak diubah tanpa keputusan owner |
| H-1 IDOR tulis dokumen | ✅ Tutup | `8545ef4d` + `02db7888`: folder & nama dari baris DB, label divalidasi sebelum upload; 2 tes regresi |
| H-2 PIN 4 digit | 🔴 Buka | Butuh rotate nilai env production — bukan keputusan kode |
| H-3 revokasi sesi | ✅ Tutup | `4c66f4f5` (refresh fail-closed, `changePassword` menulis epoch dulu) + `97ffa1cc`: gerbang terpusat di `handleAction` menolak refresh-token, menolak `iat < revoked_at`, **fail-closed** bila tabel tak terbaca; cache 15 dtk + invalidasi saat logout. 11 tes baru |
| H-4 tulis anonim tanpa throttle | ✅ Tutup | `576d68b`: bucket `publicWrite:*` + global untuk `submitApply`/`submitDaftarSiswa` |
| H-5 tes menulis produksi | ✅ Tutup | `1a15be5`: butuh `ALLOW_DB_WRITING_TESTS=1`; 2 tes kini diskip |
| H-6 prefill PII per WA | 🟡 Dimiter | Sudah ada allowlist + bucket `prefill:*` 20/menit; masih mengembalikan nama/TL/pendidikan |
| H-7 Combo silent loss | ✅ Tutup | `c711ee5` + `67f6acd9`: kombo/kalimat dari ref, kunci dilepas saat gagal, kunci diklaim hanya saat kirim |
| M-2 plafon Combo | ✅ Tutup | `c711ee5`: `batasSkor` menerima `kalimat` hasil replay sebagai penanda sesi panjang |
| M-4 push ganda per upload | ✅ Tutup | `a5977ed`: satu notifikasi untuk N baris |
| M-5 `null` vs `''` | ✅ Tutup | `a5977ed`: canonical empty value `''` |
| M-3 bulk-delete 2N | ✅ Tutup | `df7e4fbd`: satu `DELETE id=in.(…)`; gagal ⇒ semua baris dilaporkan gagal, bukan partial tanpa laporan. 2 tes baru |
| M-6 CORS share-data | ✅ Tutup | `a7416d59`: origin situs sendiri + `Vary: Origin`, bukan `*`; 1 tes baru |
| M-7 CSP | 🟡 Observasi | `a7416d59`: `Content-Security-Policy-Report-Only` aktif. **Belum enforcement** sampai violation build nyata diamati |

Gate setelah perbaikan: **vitest 280/280 file · 3 956 lulus + 2 skip · exit 0** (8m29s,
`eb6c09d2`), tsc main/indexer 0/0, lint-ratchet PASS (debt −13 vs baseline),
memory:check dry-run PASS. Indexer: 666 berkas · 36 625 simbol (plafon 37 000) ·
39 unresolved refs (tidak berubah). Tidak ada push dan tidak ada build produksi baru
dari sesi ini.

Masih terbuka sebelum status GO: **C-2 history/fork, C-3 signed URL + bucket privat, H-2 rotasi PIN,
H-6 keputusan eksposur prefill, M-7 CSP enforcement, M-8 dependency**. Rincian langkah owner:
`deliverables/gstack/owner-decisions-no-go-2026-11-18.md`.

---

## 🎯 核心结论卡片

| Item | Value |
|------|-------|
| Go / No-Go | 🔴 **No-Go** |
| Severity spread | 🔴 3 · 🟠 7 · 🟡 7 · 🟢 8 low + 3 info |
| Launch blockers | **3 Critical** + 4 High (H-1, H-2, H-3, H-7) |
| Code craft | 🟡 Green apart from one High (CR-08 = H-3, counted once); gates honest |
| Deployment posture | 🔴 Red — quota outage, unpushed work, no CSP, prod-writing test |
| Stricter axis | **Data plane + data exposure**, not code quality |
| Deployed vs local | Live = `asj-astro-8200fdbbe878` (built 2026-11-16T16:41Z). Local HEAD `55b081e` is **2 commits newer and unverified against this outage**. |

---

## 1. 各成员核心结论

### 🔍 产品评审员（代码质量）
- **核心判断**: 🟡 **Conditional pass** — final spread **1 High / 4 Medium / 8 Low / 3 Info**. That one High is CR-08, the same defect security filed as F-05 and consolidated here as **H-3**. The module structure is sound and the riskiest duplicated logic is genuinely safe: there are **four** copies of the scoring rules, not two, and `hitungGenba`/`hitungCombo`/`hitungKotoba` plus every shared helper are byte-identical after mechanical comment stripping (ULTIMATE differs by a type annotation only; `skorShift` inlines `bonusShift` numerically). Parity tests are real — 6×8×6 grids, 41 waves, a seeded 60-event replay.
- **Why H-3 carries High weight**: the *asymmetry*, not the 24 h window. `revokeSession` (`identity/service.ts:135-138`) **refuses to report success for a write that did not land** — its own comment says so — while `changePassword` (`:411-412`) discards the boolean and returns `{success:true}` unconditionally. The codebase already knows the correct pattern and applies it in one of two places.
- **关键建议**: The remaining Mediums cluster in the admin bulk paths — `applications/service.ts:443-468` does 2N round-trips against a 12 s deadline, `:692-697` fires one admin push per form row, and `:147` writes `id_loker_pilihan = null` where `migrations/059:40` establishes `''` as canonical. The Combo game's client state, originally filed Medium, is now **H-7** after an executed reproduction with a control case.

### 🛡️ 安全官（OWASP + STRIDE）
- **核心判断**: 🔴 **FAIL — 3 launch blockers.** Request-path authorization is genuinely good: every admin action re-checks server-side, WA-carrying paths have IDOR guards, no PostgREST filter injection was found, no SSRF, CI hardened. **The failure is the data plane, not the routes.**
- **关键建议**: The two Criticals are *exposure*, not exploitation: PII in a public repo (`deliverables/biodata-ASJ00040.docx`, 138 non-empty fields, still at HEAD) and identity documents in a public bucket (`_lib/storage.ts:36-38` → `/object/public/`). Both survive code fixes — deletion does not un-leak a git history or a fork. Secrets themselves are **clean**: no key was ever committed, and the one env file that was committed (`47c666b`, removed `af463ce`) was verified placeholder-only.
- **Retraction on record**: my original brief asserted a per-candidate AI-CV token. **There is no token.** The officer re-derived the path and the controls **hold** — `getDrafCvMaster` (`master-data/service.ts:1308-1314`) and `handleSubmitDataAsj` (`_lib/ai/cv.ts:310-320`) both require a session plus `isOwnerOrAdmin`; `?wa=` is a prefill hint, not a credential. **Not a finding.**

### ✅ QA 与发布（测试与发布）
- **核心判断**: 🟡 **Conditional → two named blockers.** Gates are honest: vitest 278/279 files, **3 933/3 935 tests**, 0 skipped; `tsc` 0/0 on both projects; lint-ratchet exit 0 with debt **down** 11. The 2 failures are a **Neon quota refusal**, not a code defect — and that is the single most time-sensitive signal in the whole review. After re-checking the Combo path at runtime, QA **superseded** its own earlier "no code defect proven" and promoted CR-01 to blocking: driving the real `hitungCombo` with `[[1,0],[0,0]]` returns `{skor:100,kalimat:0,kombo:1}`, which is exactly what makes the client's stale `kombo=2` fail the server guard. Method was read-only — the validator is a pure function with no imports, no DB, no network (`F:/tmp/qa/probe-combo-cr01-cr02.mjs`, exit 0).
- **关键建议**: The suite's green is narrower than it looks — the other 3 933 tests mock PostgREST, so they prove **nothing** about DB reachability. **H-7 is the sharper lesson**: the mini-game suite is the strongest in the repo and still could not see a defect in the client's payload construction, because it tests the server in isolation. The biggest coverage hole is the **first flow a real user meets**: candidate registration → admin approval (`contexts/registration/` has no test file at all). Three admin tabs (`jadwal`, `tes`, `config`) have zero coverage, and no test iterates `TAB_IDS`, so a tab that throws on mount fails nothing. `e2e/master-light-rpc.test.ts:230` **writes to production** and bypasses the write guard because a raw `pg.Client` is invisible to `catatTulisDb`.

---

## 2. 综合审查发现（去重合并，按严重度）

### 🔴 Critical — launch blockers

| # | 类别 | 位置 | 问题 | 影响 | 来源 |
|---|------|------|------|------|------|
| C-1 | Availability | Neon project `ASTRO`; `netlify/functions/sweep-queue.ts:152`; host `ep-bold-sunset-b3zy6wb1…` (same in `.env.local` and `env-kunci/PRODUCTION.env`) | **Root cause identified.** Authenticated read `database_candidate?select=id&limit=1` returns **HTTP 402** `"Your account or project has exceeded the quota"`; REST root answers `401 PGRST302` (alive); static site `200`. Neon console: **110.13 CU-hrs against a 100 CU-hr free-plan ceiling**, project **paused** ("Upgrade to resume"); storage 0.04 GB and network 0.46 GB are trivial, so **compute-hours are the only exhausted dimension**. Cause: `sweep-queue.ts:152` is `schedule: '*/2 * * * *'` (720 runs/day) while Neon suspends after **5 min idle** — the cron resets the idle timer forever, so the compute never scales to zero: 24/7 at 0.25 CU ≈ **6.4 CU-hrs/day × 17.3 days ≈ 110 CU-hrs**, matching the meter. **This recurs every billing cycle** on the free plan. | **Production data operations are down now.** Every read/write through the Data API fails. Verified by the lead, twice, plus console evidence. | QA + lead |
| C-2 | Data exposure | `deliverables/biodata-ASJ00040.docx` + `.txt` (added `76d6e6e`, **still at HEAD**); `deliverables/db-siswa-fix-2026-11-06.md` (179 candidate IDs) | Real candidate PII committed to a **public** repo. `api.github.com/repos/asjosdokumen-alt/asj-astro` → `200`, `private:false` (verified anonymously). 138 non-empty fields: passport, medical, family. | Irreversible by deletion — history and forks retain it. Regulatory exposure (ID PDP Law, JP APPI). | 安全官 + lead |
| C-3 | Data exposure | `_lib/storage.ts:36-38`, `_lib/db/berkas.ts:92`, `contexts/documents/service.ts:199-202,932` | Identity documents addressed via `/storage/v1/object/public/<bucket>/master/<NAME>/KTP.jpg`. Name comes from the anonymous share-data endpoint. | Unauthenticated retrieval of KTP/KK/passport. **Runtime-unverified** — see §6. | 安全官 |

### 🟠 High — must precede any public traffic

| # | 类别 | 位置 | 问题 | 来源 |
|---|------|------|------|------|
| H-1 | IDOR (write) | `contexts/documents/service.ts:903-932` | Folder is built from **client-supplied `d.nama`** while the guard at `:903-906` only compares `d.wa`. Send your own WA + a victim's name → `x-upsert` into their folder, and `hapusJenisVarian` deletes their variants. Upload also precedes the `fileLabelKey` allow-list check at `:991`. **Verified by lead.** | 安全官 |
| H-2 | Authentication | `contexts/identity/service.ts:147-160` (`masterPins()`) | Four **4-digit personal PINs** (`PIN_KHOCI`/`PIN_SACHOU`/`PIN_AYOK`/`PIN_KHOLIS`) are folded into the admin master-PIN set. Any of them issues `role:'admin', name:'master'`. 10⁴ keyspace, 5/min per IP. | 安全官 |
| H-3 | Session integrity | `identity/service.ts:427-433`, `:439-445`, `:411-412`; `identity/repository.ts:131-133`; `_lib/session.ts:55-60` | `requireRole`/`isOwnerOrAdmin` call `verifyToken` and **nothing else** — the revocation epoch is consulted only at `:292`/`:318` (refresh). `getSessionRevokedAt` catches everything and returns `null`, and `isRevoked(iat, null) === false` (`service.test.ts:310`) → the one enforcement point **fails open**. `changePassword` bumps the epoch at `:411` but **discards the result** and returns `{success:true}` at `:412`, while `revokeSession` at `:135-138` refuses to do exactly that. `revokeSessionSubject` itself returns `false` on failure with **no log line and no metric** (`repository.ts:156-158`), so a failed epoch write is silent and durable rather than transient. Refresh tokens are also accepted as session tokens (`session.ts:77-98` never checks `kind`), widening the window to 7 days. **The harm is the false remedy.** Verified by lead. | 安全官 + 产品 |
| H-4 | Abuse / DoS | `handlers.ts:169-225` | `submitApply` and `submitDaftarSiswa` are **anonymous writes with no rate limit**, and each calls `cacheClear()` → public cache-buster + admin push-spam amplifier. | 安全官 |
| H-5 | Test safety | `e2e/master-light-rpc.test.ts:230` | The block **writes to production** (`BEGIN` → insert `master_database_candidate` → `ROLLBACK`) and **bypasses the write guard**: `test-guard` fires only from `catatTulisDb` inside `supabaseJson` (`db/client.ts:367`), so a raw `pg.Client` is invisible. One env var away from live writes. | QA |
| H-6 | Data exposure | `documents/service.ts:698-712` (`handleGetExistingCandidateJsonByWa`) | Anonymous prefill returns name + DOB + education **keyed on a phone number**, with a field allowlist and `limited:true`. Enumerable. Distinct from draft-load (different handler, different projection). | 安全官 |
| H-7 | **Bug — silent data loss (runtime-confirmed)** | `src/components/candidate/ArcadeGame.tsx:1075-1089`, `:1163-1175`; `_lib/game/leaderboard.ts:299-302`; `skorGame.ts:93-97,129-134` | Driving the real `hitungCombo` gives `hitungCombo([[1,0],[0,0]])` → `{skor:100,kalimat:0,kombo:1}`, so the client's `kombo=2` trips the server guard → `'Ronde tidak cocok dengan kombo terakhir.'`. The 5 s submit effect has deps `[skorCombo]` but closes over `kombo`/`kalimat` while reading `ronde` from the ref; the wrong-tap branch calls `setKombo(1)` **without** `setSkorCombo`, so the timer never re-arms and a stale `kombo` ships with a fresh `ronde`. `kirimSkor` returns null on `success:false` and swallows throws (`void … .then()`), and `bolehKirim` burns the `combo:<skor>` key **before** sending and never releases it. **Any Combo run where the player misses a card after scoring loses its entry permanently, with no UI signal.** | QA + 产品 |

### 🟡 Medium

*(M-1, the Combo stale-closure defect, was **promoted to H-7** after QA confirmed it at runtime against the real validator.)*

| # | 类别 | 位置 | 问题 | 来源 |
|---|------|------|------|------|
| M-2 | Bug | `ArcadeGame.tsx:379`, `:1133/:1146/:1169`; `leaderboard.ts:49,:78-81,:323-325` | `rondeComboRef` is never reset and the whole session history is re-sent every 5 s, so **two** ceilings exist — and the earlier one is **not** the one first reported. (a) **Score ceiling**: the Combo payload is `{level, kombo, kalimat, ronde}` and never sets `detail.loop`, so `batasSkor` returns `SKOR_MAKS = 1 000 000`; measured against the real `hitungCombo` with a legitimate full time-bonus replay, first crossing at **190 completed 10-card sentences / 2 090 events / 1 005 200** (5-card shape: 372 / 2 232 / 1 002 600) → `simpanSkor` answers `'Skor tidak masuk akal.'`, silently swallowed. (b) **Event cap**: `hitungCombo` returns null at **4 001** events (`RONDE_MAKS_COMBO`, `game-skor.ts:132`) — verified 3 999 and 4 000 accepted, 4 001 and 4 002 null; at that point the replay is ~2× `SKOR_MAKS`, so **the ceiling always fires first**. Both fail permanently until reload. **~190 completed sentences is a legitimate play pattern, not abuse** — a long-session player hits what was designed as an anti-abuse net and is told nothing. Genba (`:606`) and Kotoba (`:937`) do reset. **Executed reproduction with a control case.** | 产品 |
| M-3 | Reliability | `contexts/applications/service.ts:443-468` | Bulk delete does **2N sequential** PostgREST round-trips (N offset GETs + N DELETEs, max 100) ≈ 8 s at the repo's own 40 ms RTT, against a 12 s deadline / 10 s Netlify ceiling → likely **504 mid-delete with rows already gone and no report**. The header comment claims the N-round-trip problem was fixed; only the index-shift bug was. **Verified by lead.** | 产品 |
| M-4 | Noise / cost | `contexts/applications/service.ts:692-697` | `notifyAdmins('Dokumen Baru Diupload')` sits **inside** the per-row loop → one upload = one admin push per form row for that WA. Sibling `syncBiodataKeMail` correctly puts it outside (`:598`). | 产品 |
| M-5 | Data integrity | `applications/service.ts:147`, `jobs/service.ts:173` | Writes `id_loker_pilihan = null` on every application rejection, but the canonical empty value is `''` (`migrations/059:40`). **Verified by lead.** | 产品 |
| M-6 | CORS | `share-data` | `Access-Control-Allow-Origin: *` with no rate limit. | 安全官 |
| M-7 | Hardening | `astro.config.mjs` / headers | **No CSP** (deliberate: Astro inline scripts). XSS risk unmeasured against a real build. | 安全官 |
| M-8 | Dependencies | `package.json:123` + runtime set | 44 advisories, ~all build/dev tooling. Runtime-relevant: `zod` 3.25.76 (→ 4.6.6+), and `xlsx` is a **non-registry CDN tarball**, not a pinned registry package. | 安全官 |

### 🟢 Low / Info

| # | 位置 | 问题 | 来源 |
|---|------|------|------|
| L-1 | `_lib/session.ts:55-60` | Comment asserts "a token is refused when `iat < revoked_at`" — the code does not do this. **Documentation defect independent of the code decision**: rewrite it or the next auditor re-reports H-3 as a bug. | 产品 + 安全官 |
| L-2 | `candidates.ts:320-323` | Stale comment describes a 3-column WA probe while the code probes one. | 产品 |
| L-3 | `src/store/i18n*.ts` headers | Header claims "123 keys" (actual **2 196**) and "~20 KB jp" (actual **143 KB** chunk). | 产品 |
| L-4 | 8 further Low security items | Verbose-error surface, missing `X-Frame-Options`/HSTS/referrer policy, PII in logs, sequential IDs — full text in the audit §3. | 安全官 |
| L-5 | `src/store/i18n.ts:8` | `type Lang = "id" \| "jp"` — **there is no EN locale**, and `data-lang` is an i18n *key marker* (211 uses), not a language code. Premise correction: the brief said ID/JP/EN. ID/JP coverage is genuinely strong. | QA |

---

## 3. 门禁实测（gate by gate）

| Gate | Result | Detail |
|------|--------|--------|
| `vitest run` | **exit 1** | 278/279 files · **3 933 passed / 2 failed / 0 skipped** · 619 s |
| `tsc --noEmit` (app) | exit 0 | 0 diagnostics |
| `tsc -p tsconfig.indexer.json` | exit 0 | 0 diagnostics |
| `lint-ratchet` | exit 0 | baseline 1 968 → current **1 957** (debt −11) |
| `npm run build` | exit 1 (**sandbox**) | `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":50,"threshold":50}` at `astro static-build.js:278`. 0 `[ERROR]` lines; all 19 routes emitted. Repaired with `build-sw-manifest.mjs` (175 precache URLs), then **3 files / 44 tests re-run green**. |

**The 2 reds, attributed per case** — both in `e2e/master-light-rpc.test.ts` (`describe.skipIf(!dbUrl)` at `:230`; cases at `:231`, `:270`):

```
error: Your account or project has exceeded the quota. Upgrade your plan to increase limits.
```

→ **Infrastructure, not a defect.** But it is also **not** benign: it is the same 402 the lead reproduced against the production host, and it is why C-1 is Critical rather than a footnote. The other 3 933 tests mock PostgREST, so they are silent on this.

---

## 4. 覆盖缺口（tests that cannot fail are a launch risk）

| # | Area | Finding |
|---|------|---------|
| G-1 | **Registration → approval** | `contexts/registration/` has **no test file**. `handleSubmitDaftarSiswa` appears once (`e2e/public-cache-invalidation.test.ts:60`) with an empty `{}` payload testing only cache behaviour. `handleGetDaftarSiswaBaru` has **zero** references. This is the first flow a real user meets. |
| G-2 | Session expiry | `_lib/session.ts:91` `now > payload.exp` is correct but untested — delete the clause and all 19 `session.test.ts` cases still pass. |
| G-3 | Admin forms | `handleRejectForm` (`applications/service.ts:348`) and `handleDeleteForm` (`:371`) untested; reject is a previously-broken path. |
| G-4 | Admin panel | Reality is **12 tabs, not 9** (`TABS` 11 + `PINNED`). `jadwal`, `tes`, `config` have zero coverage and no test iterates `TAB_IDS`. |
| G-5 | AI-CV authz | `e2e/ai-cv-submit.test.ts:70-74` mocks `contexts/identity` wholesale (`requireRole`→admin, `isOwnerOrAdmin`→true, `verifyToken`→admin), so 16 save tests pass regardless of whether `cv.ts:318` works. |
| G-6 | Bulk-delete notify | `service-bulk-delete.test.ts` already declares/records/resets a `notified` array (`:36/:57/:395`) but **never asserts its length** in that describe, and all three tests supply exactly **one row** — so the suite is structurally incapable of seeing M-4's N-pushes-per-upload. |

**The systemic lesson from H-7**: the mini-game suite is the strongest in the repo (30+ tests asserting the *stored* value, not the client's claim), and it still could not catch a defect that lives in the client's **payload construction**. Server-side isolation is not end-to-end coverage. Any gate for this class must drive the client state machine, not just the validator.

**Strongest area, keep as the model**: mini-game score replay — 30+ tests assert the **stored** value, not the client's claim (999.999 ignored → replayed 4.650 stored; no-round / mismatch / unknown-level / NaN all rejected).

---

## ✅ 行动清单

| # | 行动 | 负责方 | 紧急度 | 为什么 |
|---|------|--------|--------|--------|
| 1 | **Code half DONE — `2ca2729`.** `sweep-queue` `*/2`→`*/15`, `agenda-reminders` `*/10`→`*/30`; union duty ≈33 % (≈60 CU-hrs/mo, leaving headroom for real traffic). Reason it is not a one-line "just past 5 min" fix: at a 5-min suspend window `*/7` is still 71 % awake (≈130 CU-hrs/mo, over budget). **Remaining — owner decision:** resume now by upgrading, or wait for the cycle reset (~Dec 1). Then re-probe `GET /rest/v1/database_candidate?select=id&limit=1` until it returns 200. | 所有者 | **P0** | The 100 CU-hr allowance at 0.25 CU is only **400 compute-hours/month** — business-hours-only (14 h × 30 = 420 h) already exceeds it, so the free tier cannot host this portal even with perfect scheduling. |
| 2 | **Treat C-2 as an incident, not a cleanup.** Purge `biodata-ASJ00040.*` and `db-siswa-fix-*.md` from the working tree **and history** (`git filter-repo`), force-push only with owner approval, rotate nothing (no keys leaked), and record who cloned/forked. Notify per ID PDP Law / JP APPI obligations. | 所有者 + lead | **P0** | Already public. Deletion alone does not remediate history or forks. |
| 3 | **Make the bucket private and serve documents through signed URLs.** Replace `publicUrl()` (`_lib/storage.ts:36-38`) with `createSignedUrl`; migrate existing objects. Then verify one unauthenticated GET now fails. | lead | **P0** | KTP/KK/passport are addressable without auth. |
| 4 | **Fix H-1: derive the storage folder from the session WA, not `d.nama`** (`documents/service.ts:929-932`). Move the `fileLabelKey` allow-list check **before** the upload (`:991`). Add a regression test: candidate A submitting `nama` of B must write only under A. | lead | **P0** | Write IDOR + destructive variant delete. |
| 5 | **Remove the four personal PINs from `masterPins()`** (`identity/service.ts:147-160`) and issue real admin credentials. Confirm the production admin PIN length from the dashboard — the repo cannot answer it. | 所有者 | **P0 (public)** | 4-digit PIN ⇒ admin, 10⁴ keyspace. |
| 6 | **Enforce revocation in `requireRole`/`isOwnerOrAdmin`**, reject `kind==='refresh'` as a session token (`session.ts:77-98`), and make `getSessionRevokedAt` **fail closed** for refresh. Then rewrite the `_lib/session.ts:55-60` comment. | lead | P1 | `changePassword` currently promises an eviction it does not perform. |
| 7 | **Rate-limit `submitApply` / `submitDaftarSiswa`** and drop `cacheClear()` from the anonymous path (`handlers.ts:169-225`). | lead | P1 | Unauthenticated write + cache-buster + push spam. |
| 8 | **Neutralise the production-writing test**: gate `e2e/master-light-rpc.test.ts:230` behind an explicit opt-in env and route it through the guarded client, or delete it. | QA | P1 | One env var from live writes, guard bypassed. |
| 9 | **Fix the Combo path (H-7 + M-2), executed reproduction with control**: read `kombo`/`kalimat` from refs instead of the closure (`ArcadeGame.tsx:1075-1089`), call `setSkorCombo` in the wrong-tap branch so the timer re-arms (`:1163-1175`), reset `rondeComboRef` per session/shift like Genba (`:606`), release the `combo:<skor>` key in `bolehKirim` when the send fails (`skorGame.ts:129-134`), and surface `success:false` instead of swallowing it (`:93-97`). **Additionally: either justify or re-derive the Combo ceiling** — a client-side trim alone will not close the 1 000 000 score ceiling, because the payload never sets `detail.loop`. Add a client-side payload test; the existing suite tests the server in isolation and cannot see this. | lead | **P0** | Silent, unrecoverable loss of a player's leaderboard entry at ~190 completed sentences. |
| 10 | **Bulk delete: one `id=in.(…)` DELETE** instead of 2N round-trips (`applications/service.ts:443-468`); move `notifyAdmins` outside the loop (`:692-697`); write `''` not `null` (`:147`). | lead | P2 | 504 mid-delete leaves unreported partial deletion. |
| 11 | **Cover registration → approval** (`contexts/registration/`) and iterate `TAB_IDS` in a mount test. | lead | P2 | First user-facing flow, zero coverage. |
| 12 | **Push only when the owner asks** (R19). `55b081e` + `e8f87fe` are local. | 所有者 | — | Push = paid deploy. |

---

## ⚠️ 待完善 / 已知局限

- **C-3 is runtime-unverified.** The audit rests on code (`/object/public/`), the repo's own comments and the public viewer's behaviour. One unauthenticated `HEAD` on a bucket object would confirm it — deliberately **not** performed, because constructing that URL requires reading a real candidate's name out of the leaked PII. Treat as Critical until disproven.
- **RLS on the live database is unverified.** Per the project's own trap, a missing policy returns **zero rows without an error**, so it must be *measured*, not inferred. Not measurable while the project is at quota.
- **Unexamined surface**: `_lib/ai/chat.ts` (~1.3 k lines) and `_lib/ai/cv.ts` (~800) were skimmed for error-handling shape only; `handleSimpanUpdateMaster` and the bodies of `applications/service.ts` were not opened. This is the most likely home of any remaining defect.
- **Premise corrections to the record**: (a) the portal is **ID/JP only** — there is no EN locale; (b) `/ai-cv` has **no per-candidate token** — `?wa=` is a prefill hint and the server-side owner check holds; (c) the admin panel has **12 tabs, not 9**.
- **Build was never fully green in this session** — the sandbox delete quota blocked `cleanServerOutput`. The 44 dist-dependent tests were re-run green after the sanctioned SW-manifest repair, but a clean full build should be re-run on a fresh session before deploy.
- **No browser was run by any workstream.** H-7 and M-2 are now *executed* reproductions of the validator and the guard (`deliverables/gstack/verify-cr01-cr02.mjs`, control case included), but the client-side closure itself was never observed in a live browser. A scripted Combo session — tap correct, tap wrong, wait 6 s, watch the response — would close that last gap.
- **The end-to-end POST hop is UNVERIFIED, and cannot be verified while C-1 stands.** `tolakKecualiSiswa` requires a `statusVip(wa)` database read, so with the project at quota even a valid VIP session is turned away with `'Gagal memeriksa status siswa.'`. The gate's own verification path is blocked by its own Critical. Re-test H-7 against a live endpoint only after C-1 is cleared.
- No secret value was printed at any point in this review; env files are referenced by name only.

---

## 📚 成员产出索引

- `code-reviewer` (gstack-product-reviewer) — `deliverables/gstack/code-review-all-modules-2026-11-18.md` · 4 Medium / 9 Low / 3 Info as filed, with CR-08 cross-filed to security and consolidated as H-3 · four-way scoring parity diff · `tsc` clean, 96 targeted tests green · reproduction artifact `deliverables/gstack/verify-cr01-cr02.mjs` (executed, control case included).
- `security-officer` (gstack-security-officer) — `deliverables/gstack/security-audit-prelaunch-2026-11-18.md` · 2 Critical / 5 High / 5 Medium / 8 Low; STRIDE + OWASP Top-10 matrix; endpoint authorization matrix; secrets clean; §1.0 premise correction + AI-CV three-row authorization table.
- `qa-lead` (gstack-qa-lead) — `deliverables/gstack/qa-gate-prelaunch-2026-11-18.md` · gate-by-gate measurements with per-case failure attribution; workflow and edge-case matrices; gate-quality findings (G-1…G-5).
- Lead verification performed independently: repo visibility (`api.github.com` → 200/public), PII tracked at HEAD, `/object/public/` path, IDOR folder derivation, 2N round-trip loop, `null` vs `''`, revocation call sites and fail-open, AI-CV guards, and the **live 402 on the production Data API**.

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
> Verdict: 🔴 **No-Go** — 3 Critical, 6 High. Code craft is green; the data plane and data exposure are not.
