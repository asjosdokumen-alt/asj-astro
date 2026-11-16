# Security Audit & Hardening — ASJ Portal

**Date:** 2026-11-15 · **Revision:** `27c7ea1` (branch `main`, 5 commits ahead of origin)
**Scope:** `src/`, `netlify/functions/` (~215 TS + 22 JS), `migrations/`, `.github/workflows/`, `netlify.toml`, CI gates
**Method:** static source review + three parallel read-only audits + targeted test runs. **No live DB connection, no production HTTP probe, no dependency install, no deploy, no push.**

---

## 1. Executive summary

The data layer is materially better protected than expected: RLS lockdown migration `012` is real and complete, no browser-side table access exists, the service-role key never reaches `src/`, and no credential file is tracked in the (public) repository. The serious problems are **server-side authorization logic**, not the database.

| Severity | Confirmed | Status |
|---|---|---|
| Critical | 0 | — |
| High | 4 | **2 fixed**, 2 require owner decision |
| Medium | 9 | **1 fixed**, 8 reported / decision |
| Low | 6 | reported |
| False positives | 3 | disproved, see §6 |

**Three fixes shipped**, each with a test observed failing *before* the fix and passing after:

1. **VIP / AI-CV-Master entitlement bypass** (`flow` from client payload) — demonstrated bypass, now closed.
2. **Authenticated candidate sessions had zero rate limiting** — now bucketed.
3. **Admin master PIN compared with short-circuiting `Array.includes`** — now constant-time.

Verification: `tsc --noEmit` clean; **202 tests across 13 suites green**; lint ratchet and frozen indexer counters **unchanged from baseline** (both already red before this work — see §7).

> **Nothing was pushed.** `main` is git-linked and every push spends a deploy.

---

## 2. Baseline, measured before any edit (R1/R1a)

| Check | Result |
|---|---|
| `git status` | 4 modified tracked + 316 untracked (all in `deliverables/`, the repo's safe zone) |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| `lint-ratchet` | **already RED**: 1968 → 1969 (+1), `contexts/identity/service.test.ts: 8→9` |
| Target suites (3 files, 34 tests) | green |
| Indexer inventory | 655 files / 369 ts — frozen counters already stale at HEAD (documented pre-existing red) |

The lint red is **pre-existing at HEAD**: the named file has no working-tree diff, so this is a stale frozen baseline (R1a), not a regression. I did not "fix" it by re-baselining, and I did not add any diagnostic to it.

A full `vitest run` was deliberately **not** executed: project notes record that some service-context tests bypass their stubs and can **write to the production database** (one master row was inserted during a past suite run). Targeted suites only.

---

## 3. High-severity findings

### H1 — VIP / AI-CV-Master gate bypass via client-controlled `flow` ✅ FIXED
**Before:** `netlify/functions/_lib/ai/chat.ts:684-689`
```ts
const flow = String(p.flow || 'master');
if (flow === 'master') {                 // gate runs ONLY for this literal
  const tolak = await tolakKecualiAiCvMaster(sessionToken, t);
  if (tolak) return tolak;
}
```
`flow` came straight from the request payload, was interpolated verbatim into the system prompt, and **decided whether the entitlement gate ran at all**. `AiCvForm` never sends `flow` (it posts `[{ history, currentData }]`), so any logged-in non-VIP candidate could send `flow: "x"` and receive the full AI CV Master prompt (`AI_FORM_DATA_INSTRUCTION`) plus Gemini quota, with no VIP tag. Also a prompt-injection sink.

**Evidence:** added regression test with `flow: 'bukan-master'` returned `success: true` before the fix — the gate was skipped and the model was reached.

**Fix:** pin `flow = 'master'` server-side and run `tolakKecualiAiCvMaster` on **every** request. Verified no caller in `src/`, `netlify/`, `e2e/`, or `docs/` sends a non-`master` flow; the one `flow=` in `contexts/registration/service.ts:119` is an unrelated `/ai_form.html` URL query parameter. Admins are unaffected (the gate returns early for admin role) — confirmed by the 24 passing payload-contract tests.

### H2 — 4–6 digit admin PIN; personal PINs escalate to master ⚠️ PARTIAL
`netlify/functions/_lib/kernel/validate.ts:67` allows `/^\d{1,6}$/` (a **1-digit** PIN passes validation). `contexts/identity/service.ts:149` folds four 4-digit personal PINs (`PIN_KHOCI`, `PIN_SACHOU`, `PIN_AYOK`, `PIN_KHOLIS`) into `masterPins()`, so any of them issues `role:'admin', name:'master'` — a **full-privilege token from a 10,000-key space**. Login is rate-limited to 5/min per IP, but the limiter is in-process per function instance, so distributed attempts evade it.

**Fixed now:** `checkAdminMaster` uses `pinsEqual` (`timingSafeEqual`) over every configured PIN instead of `Array.includes`.
**NOT fixed (owner decision):** rotating those PIN values to ≥10 chars, and removing personal PINs from the master set — doing either silently would lock out real admins. This is a credential-rotation task, not a code task.

### H3 — VIP gate deliberately fails open on lookup error ⚠️ OWNER DECISION
`chat.ts:526-530`: on a DB/migration error `lookupError = true`, and `if (!lookupError && !isVipCatatan(catatan))` then **grants** access. Blast radius: `processAIChat`, `terjemahkanKolomCv`, `transkripsikanSuara` (Gemini quota). Contrast `_lib/siswa-gate.ts:33`, which fails **closed**.

Project notes record this fail-open as **deliberate** ("sengaja"). Flipping it without owner approval could block genuine VIP students during a DB blip. Left unchanged; recommend a decision (fail-closed, or a bounded 1-hour grace with an explicit metric).

### H4 — Logout / password change does not revoke live sessions ⚠️ OWNER DECISION
`contexts/identity/service.ts:416-419`: `requireRole` checks signature/role/expiry but never consults `session_revocations`. `getSessionRevokedAt` is used only in the refresh path (`:114`). A stolen 24-hour session token stays valid after logout or password change. Fixing this requires a revocation lookup on every protected request — an architectural/performance decision, not a safe one-line change. Recommend short-session + refresh rotation as an interim measure.

---

## 4. Medium findings

| # | Finding | Evidence | Status |
|---|---|---|---|
| M1 | **Candidate sessions had no rate limit** — `rateLimitChecks` returned `[]` for every authenticated non-admin action outside AI/prefill/contact, including `getUploadUrls` (signed Storage URLs) and all `simpan*` writes | `_lib/handlers.ts:211` | ✅ **FIXED** — per-identity `kandidat:` bucket, 120/min; `ADMIN_READ_ACTIONS` stays exempt so dashboard polling is not throttled. In-memory limiter, no DB round-trip. |
| M2 | `bridge-links` dispatches **all** registry actions (`adapt(makeHandler())`), so the per-surface allow-list is not enforced on this one entry | `bridge-links.js:4`, `_lib/netlify-wrapper.ts:90`; `netlify.toml:258` claims the hole was closed | Reported. Per-action auth still applies; the client uses it as a documented 404 fallback (`src/lib/apiEndpoint.ts:200`). Narrowing it is a compatibility decision. |
| M3 | `share-data.js` bypasses `handleAction` entirely (direct import) ⇒ **no rate limit**, and sets `Access-Control-Allow-Origin: *` | `share-data.js:30,37,48`; job codes are enumerable per `contexts/catalog/service.ts:165` | Reported. Public-by-design (TSK external viewers, token gate removed 2026-09-13). Recommend a per-IP bucket; tightening CORS needs owner sign-off or it breaks third-party viewers. |
| M4 | Session tokens are bespoke HMAC (`session.ts:71`) with no `aud`/`iss`/`jti`; `verifyToken` does not check `kind`, so 7-day **refresh tokens are accepted as session tokens** by handlers calling it directly | `chat.ts:553,636,675`; `contexts/documents/service.ts:180,310,896`; `master-data/service.ts:1209,1381,1618` | Reported. `requireRole` does reject `kind==='refresh'`; the direct callers do not. |
| M5 | Client-supplied WA trusted in two interview handlers, pulling another candidate's `nama`/`bidang` into the returned LLM prompt | `chat.ts:1120,1234`. Sibling `handleSimpanHasilWawancara:1277` already scopes WA to the session claim | Reported. Fix should mirror `:1277`, but needs care: `MensetsuForm` has an `adminMode` path that legitimately passes another WA. |
| M6 | Anonymous PII lookup keyed only by a client phone number returns `nama, wa, gender, usia, tb, bb, pendidikan, tempatLahir, tglLahir` | `contexts/documents/service.ts:702-708`, `PUBLIC_PREFILL_FIELDS:45-58`, throttled 20/min per IP | Reported — documented deliberate trade-off (`handlers.ts:105-117`). Enabling WA enumeration. |
| M7 | `verify:rls` **DEGRADED probe mode exits 0** — a gate that can pass without measuring. `?select=*&limit=1` returning `200 []` cannot distinguish "RLS denied" from "table empty"; non-200 responses are skipped | `scripts/ci/verify-rls.mjs:287-296,202-205` | Reported. Deploy workflows do set `SUPABASE_DB_URL` (definitive mode); local pre-deploy may not. Recommend exit ≥2 on DEGRADED unless `--warn-only`. |
| M8 | Drift gates may measure a **different DB than production** — root `.env` is the old Supabase project; production uses `.env.local` / Netlify env | `scripts/lib/load-env.mjs:29`; `gen-schema.mjs:124-131` records a past "green verdict about the wrong server" | Reported. **Always print the DB host before trusting any schema/RLS verdict.** Needs a CI assertion that `SUPABASE_URL` equals the Netlify function value. |
| M9 | Dependency audit gate is non-blocking (`continue-on-error: true`) and skips dev deps | `.github/workflows/ci.yml:118-128` | Reported. High-severity advisories never fail a PR. |

---

## 5. Low / defence-in-depth

- **No CSP, COOP, CORP, or `X-Permitted-Cross-Domain-Policies`.** `netlify.toml:165` deliberately omits CSP. **Verified the reason is real**: `dist/index.html` has ~8 executable inline scripts, 88 `style=` attributes, and a runtime remote module import (`https://www.gstatic.com/firebasejs/10.8.0/…`, `src/lib/fcm.ts:75`). A guessed CSP would break the site or be meaningless. **Recommended path:** deploy `Content-Security-Policy-Report-Only` first, collect real violations, then enforce with nonces/hashes. Third-party allowlist needed: `www.gstatic.com`, `fcm.googleapis.com`, `*.neon.tech`, `*.fonnte.com`, Gemini/Groq/xAI endpoints, `images.unsplash.com`, `res.cloudinary.com`, `api.qrserver.com`, `ui-avatars.com`.
- **Session + refresh tokens in `localStorage`** (`src/store/authReactive.ts:20,41`). Any XSS = full takeover. All 7 `innerHTML`/`dangerouslySetInnerHTML` sinks found are currently escaped or static; there is **zero defence-in-depth**. Two brittle blacklist patterns worth replacing with an allowlist: `AiCvForm.tsx:1577` re-injects `<b>` after sanitising, and `cv-template-factory/preview.ts:88` escapes `&<>` but not quotes.
- `getCorsOrigin` returns `ALLOWED_ORIGINS[0] || '*'` (`kernel/request-helpers.ts:20`). **The `'*'` branch is unreachable** — two origins are hardcoded. But the **live production host `amanahsakura.netlify.app` is not in the allowlist**, so if `APP_ORIGIN`/`SITE_URL` are unset, responses carry a stale `asjportal.netlify.app` ACAO. Verify those env values.
- `resolveSelect` passes a wildcard through for tables **absent** from the generated schema contract (`_lib/db/client.ts:79-85`) — a new PII column could be over-read before `db:schema` is regenerated.
- Static projection gate only matches `select: '*'`, not `?select=*` in URL form (`scripts/ci/verify-projections.mjs:57`). No live wildcard literal exists in `netlify/functions/` today.
- `public.nextval(TEXT)` is `SECURITY DEFINER` granted to anon/anonymous (`migrations/024:37,72-76`); sequence-exhaustion/enumeration only, whitelisted to one sequence. Migration `012` revokes table grants but **never `EXECUTE ON FUNCTION`** (`:99,131,145`), leaving latent anon RPC grants from `008/009/031/034`.
- `own_wa` RLS policies compare against `COALESCE(..., '')` (`migrations/007:55-66`): an anonymous caller matches any row whose `no_wa = ''`.
- One client-facing `AppError` interpolates `String(e)` into its message (`_lib/wawancara/bank.ts:466`) — may leak PostgREST fragments. **Unverified reachability**; needs triage before a fix.
- `xlsx` is a non-registry CDN tarball (`package.json:122`) — a supply-chain trust point, though 0.20.3 is the patched SheetJS fork. `exceljs`, `jszip`, `mammoth`, `pdf-parse` parse untrusted documents.

---

## 6. False positives — disproved, do **not** "fix"

1. **"Scheduled functions are unauthenticated public endpoints."** All three (`agenda-reminders`, `sweep-queue`, `retensi-notif`) declare inline `export const config = { schedule: … }`. [Netlify's official docs](https://docs.netlify.com/build/functions/scheduled-functions/) state scheduled functions **"can't be invoked directly with a URL"** on published deploys; only the Netlify UI "Run now" or local `netlify functions:invoke` can trigger them. No external HTTP path exists.
2. **"CORS reflects arbitrary Origin with credentials."** `Access-Control-Allow-Credentials` appears nowhere; `getCorsOrigin` uses an allowlist and never reflects an unknown origin. The only literal `*` is on the deliberately public `share-data` endpoint.
3. **"No `Cache-Control: no-store` on session responses."** `netlify-wrapper-surface.ts:73,272` sets `no-store` on failures and **switches caching off whenever a session token is present** — pinned by a passing test (`netlify-wrapper-surface.test.ts`). Public anonymous reads are deliberately cached with `s-maxage`, which is intended.

**Also verified as correctly handled:** `.env*`, `env-kunci/`, and `netlify/functions/secrets/*` are gitignored and untracked; only `.env.example` and `*.example.json` are tracked. `dist/` is not tracked. No `service_role` / `SERVICE_ROLE` / `SESSION_SECRET` appears in `src/` or built JS (only public Firebase web config). `SESSION_SECRET` throws in production when unset, and signature verification uses `timingSafeEqual`. `health.js` and `metrics-receiver.ts` fail closed with constant-time bearer compares. RLS lockdown `012` enables RLS, drops the `TO PUBLIC USING (true)` policy, revokes anon/authenticated grants, sets `ALTER DEFAULT PRIVILEGES`, self-verifies with a `DO` block, and ends with `NOTIFY pgrst, 'reload schema'`. No raw `or=(...)`, `.rpc(`, or string-interpolated SQL from user input; all WA filters go through digit-only normalisation (`shared/wa-rules.ts:32`) and `URLSearchParams`.

---

## 7. Changes made (exact files)

| File | Change |
|---|---|
| `netlify/functions/_lib/ai/chat.ts` | Pin `flow='master'`; run VIP gate unconditionally; remove prompt-injection sink |
| `netlify/functions/_lib/handlers.ts` | Default `kandidat:<ident>` rate-limit bucket for authenticated non-admin sessions |
| `netlify/functions/contexts/identity/service.ts` | `checkAdminMaster` uses `pinsEqual` / `timingSafeEqual`, evaluates all PINs |
| `netlify/functions/_lib/ai/chat.vip.test.ts` | +1 test (flow bypass) + offline providers stub |
| `netlify/functions/_lib/handlers.test.ts` | +3 tests (candidate bucket, read-exemption control, constant-time PIN guard) |

**No files added inside indexed directories** — the patch driver lived in `F:/tmp`, so the four frozen indexer counters did not move.

### Verification trail

| Step | Result |
|---|---|
| New tests **before** fixes | `3 failed \| 14 passed`, exit 1 — including `expected true to be false` proving the VIP bypass |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| 7 affected suites after fixes | **111 passed / 111** |
| 6 adjacent auth/handler suites | **91 passed / 91** |
| `lint-ratchet` | 1969 (identical to baseline; **0 new diagnostics** from ~100 added lines) |
| Indexer inventory | 655 / 369 ts, unchanged (no new files) |

---

## 8. Explicitly NOT verified

No live/database probe was performed (avoiding writes to the production DB). Therefore the following remain **unverified claims**, not conclusions:

- Live RLS state for 26 tables, `asj_service` BYPASSRLS, and "anon reads 0 rows" — static migration review only.
- Whether CI's `SUPABASE_URL` / `SUPABASE_DB_URL` equals the Netlify function's `SUPABASE_URL` (M8).
- Whether `NOTIFY pgrst` reloads Neon's ACL cache — `migrations/034:17` says it does **not** work on Neon.
- Whether `APP_ORIGIN` / `SITE_URL` are set in production (affects CORS, §5).
- Live response headers on `amanahsakura.netlify.app`; Netlify platform defaults may add headers.
- Actual `npm audit` output (no install/network); git history of the once-tracked `deliverables/db-neon-migration/ENV-BARU-NEON.env` (claimed placeholders-only).
- Full-suite green status — deliberately not run (§2).

---

## 9. Recommended order of work (owner decisions first)

1. **Rotate admin PINs** to ≥10 chars and remove personal PINs from `masterPins()` (H2) — coordinate so admins are not locked out. Do this before any deploy.
2. **Decide H3 and H4**: fail-closed VIP gate on DB error; session revocation enforcement.
3. **CSP rollout**: `Report-Only` → collect violations on the real build → enforce. Do not add a guessed policy.
4. **CI gates**: make `verify:rls` DEGRADED non-zero; assert CI `SUPABASE_URL` matches Netlify; flip dependency audit to blocking once the tree is clean.
5. **Add a rate limit to `share-data`** and re-evaluate its `*` CORS with the TSK viewer workflow.
6. **Fix the WA ownership** in the two interview handlers (`chat.ts:1120,1234`) mirroring `:1277`, preserving `adminMode`.
7. Add `aud`/`iss`/`jti` to session tokens and reject `kind==='refresh'` in direct `verifyToken` callers.

> ⚠️ All of the above are **decisions or multi-file changes**, intentionally not bundled into this pass. Per project rules, one vertical slice ships at a time, every fix carries a test that can fail, and **nothing is pushed to `main`** without the owner's explicit go-ahead.
