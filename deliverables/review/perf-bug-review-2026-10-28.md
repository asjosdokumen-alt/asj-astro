# Performance & Bug Review — asj-astro

**Date:** 2026-10-28 · **Revision:** `0220438` (working tree clean apart from one untracked file)
**Scope:** `src/**`, `netlify/functions/**`, built artifacts in `dist/_astro/**`
**Method:** static reading of the call graph + measurement of the committed build output. No code changed.

## What this review did *not* do

- No live database probing (no credentials used). Findings that depend on the live
  schema are marked **[verify]** with the one command that would settle them.
- No test run. Per the repo's own rule (R13a) a `vitest` run is only trustworthy
  *before* the first build of a session; this session started with `dist/` already
  present, so a red suite here would be unattributable. Every claim below is
  therefore sourced from code or from the built artifact, not from a test verdict.

---

## Summary

| # | Finding | Kind | Severity |
|---|---|---|---|
| B1 | Circuit breaker records **success *and* failure** for every non-2xx, and counts local bulkhead rejections as upstream failures | bug | **Critical** |
| B2 | Cross-tab `storage` listener → `refreshSession()` → write → event → **infinite ping-pong** | bug | **Critical** |
| B3 | `cachedToken` never cleared on logout/login → up to 60 s of requests **as the previous user** | bug | **High** |
| B4 | Old document is deleted **before** the new upload exists → data loss on a failed upload | bug | **High** |
| B5 | `rpc/nextval` does not exist → "atomic" id allocation silently falls back to `MAX+1` (the race it claims to fix) | bug | **High** |
| P1 | Admin panel statically bundles **488 KB** of `xlsx` for a template that is deliberately not offered | perf | **High** |
| P2 | Landing island = **453 KB** raw / ~103 KB gz; 213 KB of it is the Supabase auth client | perf | **High** |
| B6 | Folder-name sanitizer differs between writers and the share reader → documents vanish for names with punctuation | bug | Medium (latent) |
| B7 | `cacheClear()` runs **before** auth/validation on public actions → unauthenticated cache flush | bug | Medium |
| B8 | Refresh tokens are never issued and never used → hard logout at 24 h, dead code | bug | Medium |
| B9 | Silent truncation at 300/500 rows on forms, jobs, schedules, templates (keyset helper exists but is unused there) | bug | Medium (latent) |
| P3 | Upload flow: 3 sequential storage round-trips **per file**, serialized across files | perf | Medium |
| B10 | `getPublicData()` has no timeout and no `res.ok` check → one hung request wedges the page's public data | bug | Medium |
| B11 | Demo dataset can be served as real jobs with `success: true` | bug | Medium |
| P4 | Every admin action pays a DB round-trip for rate limiting | perf | Low-Medium |
| P5 | Admin candidate list reads the whole table and sorts in JS on every page load | perf | Low (scales badly) |
| B12 | VIP gate asymmetry: reads gated, `simpanHasilWawancara` is not | bug | Low |

---

## Status — same day, later: 14 of 18 findings fixed and committed

Baseline before any change: **266 files / 3183 tests green**, tree clean at `0220438`.
Every fix below carries a test that was **observed red against the old code**
(`git checkout -- <file>`, run, restore) before the fix was applied.

**Final verification:** `npm test` → **269 files / 3219 tests passed**;
`tsc --noEmit` clean; `npm run build` → 16 pages, and the two bundle claims
re-measured on the rebuilt artifact (see P1/P2 below).

| Finding | Commit | What changed |
|---|---|---|
| B1 breaker accounting | `bb5daa4` | success recorded after the status check; 5xx/429 = failure, 4xx = neutral; local bulkhead refusal (`admitted === false`) never touches the breaker |
| B2 cross-tab ping-pong | `962269b` | `adoptAuthFromStorage()` adopts identity changes and writes back the **same bytes**, so no echo; `lastChecked` from another tab is not copied |
| B3 token cache | `5011ed2` | cache keyed by the session that filled it (`cachedFor`) |
| B4 delete-before-upload | `6c7ae77` | `hapusJenisVarian(folder, stem, keep)`; write first, clean after; cleanup moved to the confirmation handlers |
| B5 missing `rpc/nextval` | `33c9a0e` | `migrations/024` creates `public.nextval(text)` (SECURITY DEFINER, only `candidate_id_seq`); the MAX+1 fallback now logs `candidate-id.sequence-unavailable` |
| B6 folder sanitizer | `349103d` | `masterFolder()` — one rule for 3 readers + 4 writers; anti-regression source scan |
| B7 `cacheClear()` before auth | `861d155` | moved to the first write in 6 handlers |
| B12 VIP write gate | `2839287` | `simpanHasilWawancara` runs the same `statusVip` gate as the reads, before any write |
| P1 xlsx in AdminPanel | `e618fd1` | `renderers/excel.ts` loads SheetJS inside `render()`; bundle gate scans the whole CV factory. **Verified in the rebuilt artifact: `AdminPanel.*.js` no longer contains a static `from "./xlsx.*.js"`** |
| P2 landing bundle | `c8e6a3d`, `71537a0` | `supabase` and `AdminAiCopilot` are dynamic imports — the remaining static edge was `App → userStore → supabase`, so `userStore` now loads it on demand too. **Measured on the built island graph: 453.4 → 229.5 KB raw, 131.0 → 74.7 KB gzip, 19 → 16 files** |
| B10 `getPublicData` | `c1f2df2` | 8 s abort, `res.ok` + content-type checks, never rejects, `inflight` always released |
| B11 demo jobs as real | `6fcf1bd` | `notFoundPayload()` empties `jobs` and marks `demo: true` |
| P3 upload signing | `4037de9` | 4 signatures at a time (below the storage bulkhead of 8) |
| B9 silent truncation | `c019823` | `log.warn` when a capped read comes back full (forms, catalog lists, `findTable`) |

### Deferred — needs a decision, not a patch

| Finding | Why it was not changed |
|---|---|
| **B8 refresh tokens** | The server never signs `kind: 'refresh'` and the client never calls `refresh*Session`. Either half is a behaviour change in the session path: issue + auto-renew (extends sessions silently) or delete the field (removes the capability). That is the owner's call, not a review's. |
| **P4** rate limit on every admin action | Restricting the bucket to mutating actions needs a trustworthy list of "read-only" actions; guessing wrong silently removes protection from a write. |
| **P5** admin list reads the whole table | Filter/sort/paginate in SQL — the filter semantics are documented at length in `saringKandidat()` and must move with it. |
| **P6** monthly report over 5 000 rows | Needs a `GROUP BY` RPC (new migration) or the L3 aggregate. Admin-only and on demand. |

### Two things worth reading before the next session

1. **A red-proof run wrote to the production database.** `e2e/` tests run with
   `.env.local` present, which points at the production Neon instance. Running
   the *unfixed* `simpanHasilWawancara` inserted row 97 into
   `ai_form_submissions` (WA `628111222333`, `nama_lengkap: "Biasa"`). The row was
   deleted and verified gone; the suite now mocks `supabaseJson`. **Any test that
   can reach a write path must stub the database, not merely be expected not to
   write.**
2. **The symbol ceiling was raised, and that needs team-lead sign-off.** The
   ratchet had 39 symbols of headroom (measured 29 661 against a ceiling of
   29 700) and this session's fixes add 147 across 23 **existing** files
   (fileCount unchanged at 603; 92 of the 147 are the new tests). Following the
   block's own convention the ceiling is now 29 900 with the measurement and the
   per-file attribution recorded inline. Measured after the last commit:
   **29 820 / 29 900**.

---

# Part 1 — Bugs

## B1. The circuit breaker counts every non-2xx as *both* a success and a failure — and counts its own shedding as an upstream outage

**Where:** `netlify/functions/_lib/kernel/http.ts:151-193`

```ts
const res = await fetch(url, { ...fetchInit, headers, signal });
if (shouldProtect) breaker.success(dep);        // :160  ← runs for 400/404/409 too
...
if (!res.ok) { ... throw new HttpError(...); }  // :169
} catch (e) {
  if (shouldProtect) breaker.failure(dep);      // :182  ← same call, now a failure
```

Two independent defects in one block:

1. **Double accounting.** `success()` is called as soon as the socket answered,
   then the non-2xx branch throws into the same `catch`, which calls `failure()`.
   PostgREST answers 4xx for ordinary, expected conditions — `PGRST204` (unknown
   column), `409` (duplicate key), `404` (unknown RPC). Five of those inside the
   30 s window (`DEPENDENCY_CONFIGS.postgrest.threshold = 5`) open the breaker for
   **15 s**, during which every database call on that instance returns
   `503 SERVICE_UNAVAILABLE`. The trigger is not an outage; it is normal traffic.

2. **Local shedding is recorded as an upstream failure.** `bulkhead.acquire()`
   sits *inside* the `try` (`:153`), so when the local concurrency cap is hit the
   thrown `AppError('SERVICE_UNAVAILABLE')` reaches `:182` and increments the
   dependency's failure count. A burst of legitimate traffic therefore looks
   exactly like a dead database, and the breaker then refuses traffic that the
   bulkhead only meant to *queue*.

**Why this matters here specifically:** `nextCandidateId()` issues a request to
`rpc/nextval`, which does not exist (see B5). Every new candidate therefore
contributes one 4xx to `postgrest`. A handful of applications in a burst is
enough to open the breaker, and the symptom is the one already recorded in this
repo's own comments: *"Gagal memuat data"* plus a bulkhead toast on a warm
function.

**Fix:** move `breaker.success()` below the `!res.ok` check; treat 4xx as
neutral (`breaker.ignore(dep)` / no-op) and only 5xx/timeouts as failures; move
`bulkhead.acquire()` outside the protected region (or set a flag so the `catch`
skips `breaker.failure` when the error came from `acquire`).

---

## B2. Two open tabs put the browser in an infinite write/render loop

**Where:** `src/store/authReactive.ts:169-186`

```ts
window.addEventListener('storage', (e) => {
  if (e.key === 'asj_auth') refreshSession();          // :171-175
});
```

`refreshSession()` unconditionally writes a new object with a fresh timestamp:

```ts
authStore.set({ ...state, lastChecked: Date.now() });  // :181
```

`authStore` is a `persistentAtom`, whose `set()` writes `localStorage`
synchronously on every call (`node_modules/@nanostores/persistent/index.js`,
`store.set = newValue => { storageEngine[name] = prevValue; set(newValue) }`).

So with two tabs logged in:

```
tab A writes lastChecked=T1  →  storage event in tab B
tab B refreshSession() writes T2  →  storage event in tab A
tab A writes T3  →  …            (forever; every value differs by ≥1 ms)
```

Each round trip also notifies `authStore` subscribers — `App.tsx` reads it with
`useStore(authStore)` — so both tabs re-render continuously. The result is pegged
main-thread CPU and battery drain for as long as two tabs are open, which for an
admin panel is the normal way of working.

**Fix:** do not write from the `storage` handler. Either (a) only refresh the
in-memory timestamp and write at most once per interval, or (b) guard on
`e.newValue`: parse it and skip the write when the incoming `lastChecked` is
already ≥ the local one.

---

## B3. Session token cache survives logout — up to 60 s of acting as the previous user

**Where:** `src/lib/apiClient.ts:98-171`, `src/store/authReactive.ts:141-143`

```ts
let cachedToken: string | null = null;
let tokenCachedAt = 0;
const TOKEN_CACHE_TTL_MS = 60_000;
...
if (cachedToken && now - tokenCachedAt < TOKEN_CACHE_TTL_MS) return cachedToken;  // :158
```

`logout()` only resets the store:

```ts
export function logout() { authStore.set(DEFAULT_STATE); }
```

Nothing clears `cachedToken`. The sequence that breaks:

1. Admin A performs any request → `cachedToken = A.token`.
2. A logs out; user B logs in **in the same tab** within 60 s (client-side
   navigation, no reload).
3. `requireAuth` passes (`isLoggedIn` is true for B) and `getFreshToken()`
   returns **A's** token.
4. Every request is authorized as A — both in the `Authorization` header and in
   the `sessionToken` field of the body.

`invalidateOnIdentityFlip()` (`:84-93`) already exists for exactly this class of
problem, but it only clears the *read* cache, never the token. `store/adminData.ts`
documents the same hazard for its payload cache and solves it with `tokenTag()` —
the token cache is the one that was missed.

**Fix:** export a `resetTokenCache()` from `apiClient` and call it from
`logout()` / `loginAs*()`, or key the cache by `tokenTag()` and drop it when the
tag changes (the mechanism already exists two lines above).

---

## B4. The previous document is deleted before the new one is uploaded

**Where:** `netlify/functions/_lib/storage.ts:191-211`,
`netlify/functions/contexts/documents/service.ts:237`

```ts
// uploadBase64
await hapusJenisVarian(folder, stem);      // :201  list + DELETE the old file(s)
await storageRequest('POST', 'object/…');  // :203  now upload the new one
```

and in the signed-URL path:

```ts
await hapusJenisVarian(folder, prefix);    // :237  old file gone
const res = await storageRequest('POST', 'object/upload/sign/…');  // :238
// …the client PUTs the bytes afterwards, in a separate request
```

The comment says this ordering exists so a new upload always replaces the old
one. The cost is that the destructive step happens **before** the replacement
exists. In the signed-URL path the window is wide: the delete succeeds, the
client's `PUT` then fails (offline, tab closed, bucket size limit, expired
120 s signature), and the candidate's document is gone while the database still
points at the old URL — a 404 for a PII document that cannot be recovered.

**Fix:** upload first, delete second. In the signed-URL path that means moving
the cleanup into a post-upload confirmation (the client already calls
`simpanBerkasTahapan` with the resulting URL — that is the natural place to
retire the superseded variant).

---

## B5. `rpc/nextval` does not exist — the id-allocation race it claims to fix is still live

**Where:** `netlify/functions/_lib/candidate-helpers.ts:16-34`,
`migrations/006_phase5_async_scale.sql:14`

```ts
// "Atomic: nextval is safe under concurrent access — no race."
const rows = await supabaseJson('GET', 'rpc/nextval', {
  query: { seqname: 'candidate_id_seq' },
}).catch(() => null);
```

`migrations/` creates the **sequence** (`CREATE SEQUENCE … candidate_id_seq`) but
no SQL function named `nextval`. PostgREST exposes functions from the exposed
schema only — `pg_catalog.nextval` is not reachable as `rpc/nextval` — so this
call answers `404 PGRST202` **[verify: `curl -s -o /dev/null -w '%{http_code}'
"$SUPABASE_URL/rest/v1/rpc/nextval?seqname=candidate_id_seq" -H "apikey: $KEY"`]**.

The `.catch(() => null)` then routes every allocation to:

```ts
const fastMax = await maxCandidateIdNumber();   // MAX(id_kandidat) + 1, two tables
return 'ASJ' + String(fastMax + 1).padStart(5, '0');
```

That is the TOCTOU pattern the comment says was replaced. Two concurrent
submissions read the same MAX and both compute the same id; the second one loses
on the unique index. The code already records that this happened in production
("ASJ00226 di master vs max 225 … simpan biodata kandidat baru gagal permanen").

Secondary defect in the fallback: it orders by the **text** column
`id_kandidat.desc` with `limit: 5` and takes `Math.max` of those five. That is
correct only while every id is zero-padded to the same width; at `ASJ99999` →
`ASJ100000` the string order and the numeric order diverge.

**Fix:** add the SQL function (`create function nextval(seqname text) returns
bigint …` calling `pg_catalog.nextval(seqname::regclass)`), or call the sequence
through a single `insert … returning` so the database allocates the id. Then
delete the `MAX+1` branch rather than leaving it as a silent fallback.

---

## B6. Two different folder-name sanitizers — the share reader looks in the wrong folder *(latent)*

**Writers** (4 sites) use `replace(/[^A-Z0-9_-]/g, "_")`:
`contexts/master-data/service.ts:1058`, `contexts/documents/service.ts:659,855,1005`,
`src/components/admin/PemberkasanModal.tsx:397`.

**The reader** uses `replace(/\s+/g, "_")`:
`contexts/catalog/service.ts:235,240,246`.

For a name containing anything outside `[A-Z0-9_ -]` the two disagree:

| Name | Folder written | Folder read |
|---|---|---|
| `M. RIZKY` | `master/M__RIZKY` | `master/M._RIZKY` |
| `SITI NUR'AINI` | `master/SITI_NUR_AINI` | `master/SITI_NUR'AINI` |

The reader then lists a folder that does not exist, `listStorageFolder` returns
`[]`, and every document behind it disappears from the viewer — silently, because
"no files" and "wrong folder" are the same value.

**Latent, not live:** `shareData` is currently `NOT_IMPL`
(`surfaces/docs.ts:33`), so nothing reaches `handleShareData` over HTTP today.
It becomes a live data-loss-shaped bug the moment the viewer is wired up.

**Fix:** export one `masterFolder(name)` from `_lib/db/berkas.ts` and use it on
both sides.

---

## B7. `cacheClear()` runs before authentication and before validation

**Where:** `contexts/documents/service.ts:399` (`handleSubmitApply`),
`contexts/registration/service.ts:43`, `contexts/documents/service.ts:813`,
`contexts/master-data/service.ts:1048`

```ts
export async function handleSubmitApply(payload: any[], sessionToken?: string) {
  cacheClear();                                   // first statement
  const d = (payload && payload[0]) || {};
  if (!wa || !code || !d.nama) return { success: false, … };   // rejected AFTER
```

`submitApply` is public by design (`surfaces/docs.ts:6,21`). A POST with `{}` is
rejected — and still wipes the whole in-process cache (`public-base` + every
candidate page, `_lib/cache.ts`). Repeated in a loop, the public board never
serves from cache and every visitor pays the full PostgREST read the cache exists
to avoid.

**Fix:** move `cacheClear()` to immediately before the first successful write
(after the guard, after validation). One-line move per handler.

---

## B8. Refresh tokens are never issued, so the refresh path is dead and sessions end hard at 24 h

**Where:** `contexts/identity/service.ts:168-199`, `_lib/session.ts:52-65`

Every `signToken()` call in the codebase passes `kind: 'session'` — nothing ever
signs `kind: 'refresh'`. Both refresh handlers reject anything that is not
`kind === 'refresh'`:

```ts
if (t?.kind !== 'refresh' || t?.role !== 'admin') return { success: false, … };
```

On the client, `refreshToken` is stored (`authReactive.ts:20`) but
`refreshAdminSession` / `refreshKandidatSession` are never called from anywhere
in `src/`. Net effect: the refresh flow cannot succeed, the field is always `''`,
and the session expires exactly 24 h after login with no renewal — the user sees
"Sesi expired" mid-work and is redirected to `/`.

**Fix:** either issue the refresh token at login (`signToken({..., kind:'refresh'})`
and return it), wire the client to call it before `exp`, or delete the field and
the two handlers so nobody believes renewal exists.

---

## B9. Silent truncation at 300/500 rows

| Read | Cap | Site |
|---|---|---|
| mail inbox (`findForms`, `findFormsLight`) | 500 | `_lib/db/forms.ts:67,81` |
| forms by WA list | 500 | `_lib/db/forms.ts:180,188` |
| public job board | 300 | `_lib/db/jobs.ts:73` |
| schedules / tasks / WA templates | 500 | `contexts/catalog/repository.ts:84,102,117` |
| monthly report | 5000 | `contexts/catalog/service.ts:123` |

None of these paginates; each returns "the newest N" with no marker. Past the
cap, `attachApplications` simply has no row for the missing forms, so a
candidate's applications silently vanish from the admin list and from the
candidate dashboard — the failure looks like "no applications", not "not loaded".

`_lib/db/pagination.ts` already implements a stable keyset walk and is used for
candidates only. The fix is to route these reads through `fetchAllKeyset`
(`forms`) and to raise/report the job-board cap rather than truncating silently.

---

## B10. `getPublicData()` has no timeout, no `res.ok` check, and no retry

**Where:** `src/lib/publicData.ts:44-54`

```ts
inflight = fetch(publicDataUrl(), { method: 'GET', headers: { Accept: 'application/json' } })
  .then((res) => res.json() as Promise<PublicAppData>)
  .finally(() => { inflight = null; });
```

- A non-2xx with an HTML body (CDN 502, renamed host) makes `res.json()` throw;
  the rejection propagates to callers that only `.then()` — an unhandled
  rejection and an empty table.
- There is no `AbortController`. `inflight` is cleared in `.finally()`, which runs
  on settle — so a request that never settles keeps the same promise forever and
  **every** later caller awaits it. One stalled connection wedges the public data
  for the lifetime of the page.

**Fix:** add a timeout (`AbortSignal.timeout(8_000)`), check `res.ok` and
`content-type` (the pattern `fetchPublicJobs` in the same file already uses), and
treat a failure as "no data" rather than as a cached dead promise.

---

## B11. The demo dataset can be served as if it were real

**Where:** `contexts/catalog/repository.ts:279-304`, `_lib/demo.ts:51`

`loadPublicBase()` starts from `demo.demoGetAppData(mode)` and only overwrites
`jobs` when the job table is found. When it is not found the function returns
`{ notFound: true, base }` — and `base.jobs` are `DEMO-0001…DEMO-0006`, served
with `success: true` and HTTP 200. The build-time reader already warns about this
(`publicData.ts`, "all rows are DEMO-* placeholders"), but nothing at runtime
does, and the page looks populated.

**Fix:** when `notFound` is true, drop `jobs` (or mark them
`{ demo: true }`) so a misconfigured/renamed table cannot masquerade as a live
job board.

---

## B12. VIP gate asymmetry on the interview write path

`getBankWawancara`, `simpanJawabanWawancara`, `terjemahkanJawabanWawancara`,
`getBankKotoba`, `getBankMatematika` all go through `tolakKecualiSiswa`
(`surfaces/ai.ts:141-198`). `simpanHasilWawancara` (`:148-154`) does not — the
handler only requires `role === 'kandidat'` (`_lib/ai/chat.ts:869`). A non-VIP
candidate can therefore write interview results for themselves even though they
cannot read the question bank.

Low impact (they can only corrupt their own record), but it is the same gate with
one door left open, and the file's own comment argues for "one guard, one place
to be wrong".

---

# Part 2 — Performance

## P1. 488 KB of `xlsx` is shipped to every admin session for a template that is not offered

**Chain (all static imports):**

```
AdminPanel.tsx:26,28  → TabConfig.tsx / CandidateProfileModal.tsx
                      → lib/cv-template-factory/templates.ts:4   import excelTemplate from './renderers/excel'
                      → renderers/excel.ts:2                      import * as XLSX from 'xlsx'
```

`renderers/excel.ts` is registered (`templates.ts:34`) but marked `listed: false`
(`excel.ts:91`), so it never appears in the template picker — it is a
"Field | Value" dump the owner removed from the UI on 2026-10-26.

**Measured in the committed build:**

```
dist/_astro/AdminPanel.Bw1ttuue.js   raw 479.0 KB  gz 190.1 KB
  └─ import { utils as ra, write as On } from "./xlsx.QOIw0qXl.js"   ← STATIC
dist/_astro/xlsx.QOIw0qXl.js         raw 488.1 KB  gz 159.3 KB
```

The other heavy libraries in this area (`exceljs`, `mammoth`, `pdf-parse`, and
`xlsx` itself in `preview.ts:60`) are already `await import(...)` — this one
renderer is the exception, and it costs 159 KB gzip on the admin's critical path.

**Fix (smallest possible):** make `renderers/excel.ts` load `xlsx` inside
`render()` the way `preview.ts` does. That removes the static edge and the 488 KB
chunk becomes lazy (or disappears entirely if the template is also unregistered).

## P2. The landing page's island graph is 453 KB raw, and 213 KB of it is the auth client

**Measured** by walking the static `from"./x.js"` edges from the island the
landing page actually mounts (`component-url="/_astro/App.B-Cuff8Y.js"`):

```
FILES 19   TOTAL 453.4 KB raw
  212.7 KB  supabase.mwL2YdPJ.js      ← apiClient.ts:11 imports { supabase } statically
  102.0 KB  i18n.B4Szvevn.js          ← the whole Indonesian dictionary, one object literal
   53.5 KB  schemas.B0Gcbwbf.js       ← zod schemas for every action
   24.7 KB  App.B-Cuff8Y.js
   11.6 KB  AdminAiCopilot.BqgZ07R4.js ← admin-only widget, statically imported (App.tsx:58)
```

Gzip: ~56 + 34 + 13 + rest ≈ **103 KB** before the visitor can interact, for a
page whose first job is to render a hero and a nav.

Three independent causes, three independent fixes:

1. `apiClient.ts:11` → `supabase.ts` is only needed for `getFreshToken()` when
   Supabase auth is configured. Load it inside that branch (`await import`).
2. `i18n.ts` holds the Indonesian dictionary as a literal; only `i18n-jp` is
   lazy. Split the ID dictionary the same way (or ship only the keys the header
   needs) — `t()` is already a plain lookup.
3. `App.tsx:58` imports `AdminAiCopilot` for a component gated on
   `aiCopilotP.present`; a dynamic import at the render site costs nothing.

## P3. Upload: 3 sequential storage round-trips per file, serialized across files

**Where:** `contexts/documents/service.ts:208-245`, `_lib/storage.ts:167-188`

```ts
for (const f of files) {                       // :208  serial
  await hapusJenisVarian(folder, prefix);      // :237  = POST object/list + DELETE object
  const res = await storageRequest('POST', 'object/upload/sign/…');  // :238
}
```

Three network calls per file, `N × 3` in series. Six documents — the normal
pemberkasan set — is 18 sequential round-trips before the browser can start
uploading the first byte. At the measured 39 ms RTT that is ~0.7 s of pure
waiting; on a mobile connection it is several seconds.

**Fix:** the `list` is per folder and identical for every file in the request —
do it once, then compute all victims locally; the `DELETE` is a single batched
call (`prefixes: [...]`); the signing calls are independent and can go through
`Promise.all`.

## P4. Every admin action pays a database round-trip for rate limiting

**Where:** `_lib/handlers.ts:180-182` → `_lib/kernel/rate-limit.ts`

Any action carrying an admin session gets `{ key: 'adminCrud:' + adminKey }`,
which is checked through the Postgres-backed limiter (`rpc/rate_limit_check`) on
**every** call — including plain reads like `getAppData('admin')`. The module's
own header budgets "+40 ms", and a failed login additionally pays
`rpc/rate_limit_fail`.

That is a deliberate trade (a bypassable in-memory limiter is worse), but the
granularity is wrong: an admin panel already re-reads a 107 KB payload; adding a
synchronous RPC to each tab switch is measurable. A local token bucket that syncs
with the shared counter every N calls (or only on mutating actions) keeps the
property and removes the per-read cost.

## P5. Admin candidate list reads the whole table and sorts in JS on every page

**Where:** `contexts/catalog/repository.ts:232-271`, `_lib/db/candidates.ts:213-246`

```ts
const light = await findAllCandidatesLight();   // keyset walk of the ENTIRE table
let uniq = saringKandidat(light, f);            // filter in JS
urutkan(uniq);                                  // sort in JS
const slice = uniq.slice(start, start + pageSize);
const full = await findCandidatesByIds(slice.map(r => r.id));   // second round-trip
```

Two round-trips and a full-table transfer per page view, with `LIMIT/OFFSET`
emulated in memory. At 226 rows this is invisible; the query shapes do not change
as the table grows, so page 1 of 20 000 rows will transfer 20 000 rows. The cache
(25 s) masks it for repeat views only.

Not urgent — but it is the one read path that gets monotonically worse, and the
filter predicates (`gender`, `usia`, `nilai_jft_text`) are all expressible in
PostgREST.

## P6. `getMonthlyReport` materialises 5 000 candidates to count them

`contexts/catalog/service.ts:123` loads `pageSize: 5000` and aggregates in JS.
Same class as P5, smaller blast radius (admin-only, on demand). A `GROUP BY`
in SQL — or the L3 aggregate the `kernel/cache.ts` header already anticipates —
would return a few dozen rows instead of thousands.

---

# Part 3 — Checked and found sound

Worth recording, so the next review does not re-open them:

- **Keyset pagination** (`_lib/db/pagination.ts`) is correct: stable under
  inserts, `+1` look-ahead, a cursor that cannot advance throws instead of
  spinning, and `batchSize` is capped below PostgREST's 1000-row ceiling.
- **Projection discipline**: `resolveSelect()` + `schema.generated.ts` mean a
  `select=*` cannot reach the wire; a script over all `supabaseJson('GET', …)`
  call sites found **0** reads without an explicit projection (the only three
  hits are the OpenAPI read, the keyset helper, and an RPC).
- **Token verification** (`_lib/session.ts`) is constant-time
  (`timingSafeEqual`), requires a numeric `exp`, and refuses to start in
  production without `SESSION_SECRET`.
- **`toKandidatView()`** correctly strips `catatan`, `catatanInt` and `_raw`
  before a `mode=kandidat` payload leaves the server, and the VIP/class flags are
  derived server-side rather than shipped as the raw memo.
- **`adminData.ts`** keys its cache by `tokenTag()`, so the account-switch hazard
  is solved there (B3 is the one place it was missed).
- **`KotobaGame` timer** clears its interval on every exit path and reads the
  answer callback through a ref, so it cannot fire on a stale closure.

---

# Part 4 — Suggested order of work

1. **B1** — one function, and it silently converts routine 4xx into a 15 s
   database outage. Fix + a unit test that asserts a 404 leaves the breaker
   closed and a bulkhead rejection does not increment failures.
2. **B2** — two tabs are the normal admin setup; the loop is continuous.
3. **B3** — a security boundary, and the fix is the mechanism already in the file.
4. **B4** — irreversible data loss on a path candidates use every day.
5. **B5** — either create the function or delete the branch; today it is a
   comment that claims a guarantee the system does not have.
6. **P1** — one dynamic import, 159 KB gzip off the admin's first paint.
7. **P2** — three small import changes, ~100 KB gzip off every anonymous visit.
8. **B7, B8, B10, B9** — cheap, independent, each with an obvious test.
9. **P3, P4, P5, P6** — throughput work; measure after the correctness fixes.

Per this repo's rules, each item above needs its own commit, a test that was
observed red before the fix (R5), and no push (R19).
