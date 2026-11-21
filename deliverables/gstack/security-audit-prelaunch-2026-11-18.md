# Security Audit — asj-astro pre-launch gate

**Mode:** comprehensive (pre-launch) · **Date:** 2026-11-18 · **Scope:** tracked source tree + `netlify/functions/**` + `netlify.toml` + `.github/workflows/**` + git history + dependency tree
**Method:** read-only code/configuration review. No production requests, no writes, no exploitation beyond static proof.
**Constraint note:** no secret value appears anywhere in this document — locations and types only.

---

## 0. Verdict

# FAIL — 3 launch blockers

The application's *request-path* access control is, on the whole, well built: every admin action I opened checks `requireAdmin`/`requireRole` server-side, IDOR guards exist on the paths that carry a WA number, PostgREST filter strings are parameterised, and the two public write endpoints that *are* metered (`kirimPesanKontak`, `getExistingCandidateJsonByWa`) are metered deliberately. That work is real and it shows.

What fails the gate is **data**, not routes:

1. **A real production candidate's full biodata is committed to a public GitHub repository** (`deliverables/biodata-ASJ00040.docx` / `.txt`, 138 non-empty fields incl. passport status, medical history, family data). It is at `HEAD`, not only in history.
2. **Candidate identity documents sit in a public storage bucket under predictable paths** (`master/<NAME>/KTP.jpg`, `kandidat/<WA>/…`). Names come from a public, enumerable endpoint; phone numbers are phone numbers. No authentication is needed to fetch a KTP/KK/passport scan.
3. **The document-upload write path derives its storage folder from a client-supplied *name*, not from the session's WA**, so any logged-in candidate can overwrite (and delete variants of) another candidate's documents.

None of the three needs a novel exploit. All three are code-confirmed (blockers 1 and 3 by reading only; blocker 2 by reading plus the repo's own comments and the public share viewer's behaviour — the live bucket was **not** probed).

Severity counts (confirmed, confidence ≥ 8): **Critical 2 · High 5 · Medium 5 · Low 8**.

---

## 1. Findings

### 1.0 Premise correction — there is no per-candidate token on `/ai-cv`

The audit brief stated that `/ai-cv` accepts a per-candidate token. **That is false and I re-derived the path from the code.** No token exists anywhere on this flow: `src/components/forms/AiCvForm.tsx:370` reads `?wa=` from the query string, and `:498` builds the draft key as `waTarget || sessionWa || waFromUrl()` — the URL value is the *last* resort, used only to pre-fill the login gate before a session exists.

What actually authorizes the three AI-CV calls:

| Call | Handler | Authorization |
|---|---|---|
| Draft **load** (`getDrafCvMaster`) | `contexts/master-data/service.ts:1302-1343` | `verifyToken` → admin **or** kandidat (`:1308-1311`), then `isOwnerOrAdmin(sessionToken, wa)` → mismatch returns `Akses ditolak: nomor WA tidak sesuai sesi.` (`:1312-1314`) |
| Draft **save** (`submitDataAsj`) | `_lib/ai/cv.ts:300-320` | `requireRole` admin + kandidat (`:310-316`), then `if (isKandidat && !isOwnerOrAdmin(sessionToken, wa))` → reject (`:318-320`) |
| AI **chat** (`processAIChat`) | `_lib/ai/chat.ts:673-697` | session + VIP gate; the handler never reads a `wa` from the payload |

`isOwnerOrAdmin` (`contexts/identity/service.ts:439-445`) rejects `kind === 'refresh'`, so F-06 does not widen this path either.

**Conclusion: there is no IDOR on the AI-CV read or write path.** A client-supplied `?wa=` is not trusted: the server compares it against the session claim and refuses the mismatch, and the client additionally prefers the session's own WA over the URL. This is *better* than the token the brief assumed, because there is no long-lived bearer URL to leak through a referrer or a shared link.

**No finding in this report depended on the token premise.** I grepped the document: the only AI-CV reference is F-10, which concerns the VIP entitlement gate and is independent of how the candidate is identified. Nothing was deleted; this section records the correction so the next reader does not inherit the wrong model.

**What this does expose is a test blind spot** — see §7 item 9. The save path's ownership check is the one guard in this flow that no executing test actually measures.


Every row's `path:line` was opened and read. `C` = confirmed by reading the code. `R` = confirmed by reading + needs a runtime check before it is treated as fully proven.

### Critical

| ID | Severity | Category | Location | Attack path | Impact | Remediation |
|---|---|---|---|---|---|---|
| **F-01** | Critical | CWE-284 / CWE-200 · OWASP A01, A02 | `netlify/functions/_lib/storage.ts:36-38` (`publicUrl`), `_lib/db/berkas.ts:92-94` (`masterFolder`), `contexts/documents/service.ts:199-202` and `:929-932`, `contexts/catalog/service.ts:203` | Identity documents are stored in bucket `asj-files` and addressed through `/storage/v1/object/public/…`. The path is deterministic: `master/<UPPERCASED_NAME>/KTP.jpg`, `master/<NAME>/PAS_PHOTO.jpg`, `kandidat/<WA>/<FILE>.jpg`. Candidate names are published by the anonymous `share-data` endpoint (`share-data.js`, enumerable job codes) and by the anonymous prefill endpoint (F-09); WA numbers are the login identifier. So: enumerate a job code → read names → GET the predictable object URL. | Disclosure of KTP, KK, passport, ijazah, medical/signature scans for any candidate whose name or phone number is known. Irreversible: the objects are the identity documents of real people. | Serve documents through short-lived signed URLs (service-role signed download), keep the bucket private, and migrate existing objects to a non-enumerable path (`master/<uuid>/…`). Minimum interim control: make the bucket private and issue signed URLs from `downloadJobDocs`-style handlers. | C (design confirmed); R (bucket privacy not probed — see §7) |
| **F-02** | Critical | CWE-538 / CWE-200 · OWASP A05, A01 | `deliverables/biodata-ASJ00040.txt` (200 lines, 138 non-empty values), `deliverables/biodata-ASJ00040.docx` (9,885 B); added in commit `76d6e6e` ("contoh biodata Agus Khoci (ASJ00040) — .docx + .txt dari DB produksi"); also `deliverables/db-siswa-fix-2026-11-06.md` (179 candidate-ID matches) | `git ls-tree -r HEAD` shows both files still tracked. Remote is `github.com/asjosdokumen-alt/asj-astro`, described by the team lead as public. Anyone with the repo URL reads a named candidate's name, WA, email, address, birth date, passport status, blood type, medical history, allergies, family members, and emergency contact. | PII breach of a live data subject in a public repository; not remediable by deleting the file (history + forks). Also sets up F-01 (name → document URL). | `git rm` the files **and** rewrite history (filter-repo/BFG) before any further push; treat as an incident (notify owner, decide on subject notification); add a pre-commit/CI guard that rejects `deliverables/**/*.{docx,pdf,xlsx,txt}` containing `ASJ\d+`; review the remaining `deliverables/*.md` for candidate tables. | C |
| *(see note)* | — | — | `deliverables/db-neon-migration/ENV-BARU-NEON.env` was committed in `47c666b` and removed in `af463ce` | — | **Verified NOT a leak**: every key in that blob is empty or a placeholder (`SUPABASE_SERVICE_ROLE_KEY`, `NEON_DATABASE_URL`, `SESSION_SECRET`, `ADMIN_MASTER_PIN`, `GEMINI_API_KEY`, …). Only `SUPABASE_URL`, bucket name, site URL and `NODE_ENV` carried values, none secret. No action needed. | C |

### High

| ID | Severity | Category | Location | Attack path | Impact | Remediation |
|---|---|---|---|---|---|---|
| **F-03** | High | CWE-639 (IDOR) · OWASP A01 | `contexts/documents/service.ts:891-932` (gate at `:903-907`, folder at `:929-932`), `_lib/storage.ts:210-231` (`x-upsert: true`, then `hapusJenisVarian`) | The handler checks only that `d.wa` equals the session WA. The storage folder is then built from `d.nama` (`masterFolder(nama)`), which the client controls. Candidate A sends `{wa: <own>, nama: "<victim name>", jenisBerkas: "KTP", file: <base64>}`. The upload runs **before** the `fileLabelKey` allow-list check (`:991`), so the write lands in `master/<VICTIM>/KTP.jpg`, overwrites it, and `hapusJenisVarian` deletes the victim's other variants in that folder. | Silent destruction/replacement of another candidate's identity documents; the victim's DB row keeps pointing at the same public URL, so the substitution is invisible in the UI. | Derive the folder from the session (`masterFolder(session.name)` resolved server-side, or better `master/<id_kandidat>/`), never from the payload. Move the `fileLabelKey` rejection above the upload. | C |
| **F-04** | High | CWE-521 / CWE-307 · OWASP A07 | `contexts/identity/service.ts:147-160` (`masterPins()`), `:162-180` (`checkAdminMaster`), `_lib/kernel/validate.ts:68-71` | `masterPins()` folds `PIN_KHOCI`, `PIN_SACHOU`, `PIN_AYOK`, `PIN_KHOLIS`, `ADMIN_PIN` into the *master* PIN set. Any of those 4-digit values issues `{role:'admin', name:'master'}` — full privilege from a 10⁴ key space. `pinField` accepts 1–6 digits, so even `"1"` is a structurally valid PIN. Throttle is 5/min per IP with a 10-failure/5-min lockout (`_lib/handlers.ts:178-180`), which is per-instance when the DB is unavailable (F-16). | Admin takeover → all candidate PII, all document URLs, all writes (approve/reject/delete, broadcast WA). | Rotate every PIN to ≥12 random chars, remove personal PINs from `masterPins()`, require ≥8 chars in `pinField`, and add a per-account (not per-IP) failure counter. | C |
| **F-05** | High | CWE-613 · OWASP A07 | `contexts/identity/service.ts:427-433` (`requireRole`), `:439-445` (`isOwnerOrAdmin`), `_lib/session.ts:52-98`; the misleading comment is `_lib/session.ts:55-60` | `requireRole` and `isOwnerOrAdmin` validate signature + `role` + `exp` only — neither calls `isRevoked()`. That function is reached from exactly one place, `revokedRefreshError` (`:111-121`), which is called at `:292` and `:318` — **both inside the refresh handlers**. `:411` is a *bump* (`revokeSessionSubject`), not a check. So `logout()` and `changePassword()` record an epoch that nothing on the request path ever reads: a stolen session token keeps full access for the rest of its 24 h, and the victim's password change does not evict the attacker. Compounding it, `getSessionRevokedAt` (`identity/repository.ts:122-134`) swallows every error and returns `null` = "not revoked", so the kill switch is also **fail-open** on a DB blip. Third mode, and the only durable one: `changePassword` **discards** the boolean from `revokeSessionSubject` (`service.ts:411` → `return { success: true }` at `:412`), and that writer swallows its own error with no log (`repository.ts:156-158`). A DB blip during a password change therefore leaves the password genuinely changed *and* the epoch never written — so nothing is left to enforce against, permanently, with no log line, no metric and no user signal. The asymmetry inside the same file makes the intent unambiguous: `revokeSession` refuses to lie about the identical write (`:135-138`, "Never answer `{success:true}` for a write that did not land"), while `changePassword` lies about it 100 lines later. `_lib/session.ts:55-60` then claims the opposite in prose ("a token is refused when `iat < revoked_at`"), so a reader of the comment would conclude the guard exists. | Stolen session survives the victim's only available remedy; the documented invariant is false; a password change during a DB blip is permanently un-evictable and reports success. | Consult `getSessionRevokedAt(subject)` inside `requireRole` (memoise per request), or shorten sessions to ~15 min and rely on refresh. Either way: honour the bump's return value in `changePassword` (or log it), and fix the `session.ts:55-60` comment so it states what the code does. | C |
| **F-06** | High | CWE-613 / CWE-863 · OWASP A07 | `_lib/session.ts:77-98` (`verifyToken` never checks `kind`); direct callers `contexts/documents/service.ts:180`, `:310`, `:896`; `contexts/master-data/service.ts:1209`, `:1381`, `:1618`; `_lib/ai/chat.ts:553`, `:636`, `:675` | Refresh tokens are signed with the same secret and only carry `kind:'refresh'`. `requireRole` rejects that kind; the direct `verifyToken` callers do not. A 7-day refresh token is therefore accepted as a session token by `getUploadUrls`, `cekDataPelamar`, `submitMasterForm`, `getDrafCvMaster`, `simpanBiodataLengkap`, `processAIChat`, `terjemahkanKolomCv`, `transkripsikanSuara`. | Doubles the usable lifetime of any stolen token (7 d instead of 24 h) and blurs the two credential classes. | Reject `kind === 'refresh'` inside `verifyToken` for session use (add `verifySessionToken`), or have every caller go through `requireRole`. | C |
| **F-07** | High | CWE-770 · OWASP A04 | `_lib/handlers.ts:169-225` (no branch matches), `surfaces/docs.ts:21` (`submitApply` — session token deliberately not forwarded), `contexts/registration/service.ts:42-73` (`submitDaftarSiswa`) | Both are **anonymous writes** and neither appears in any rate-limit group, so `rateLimitChecks()` returns `[]`. Each call does `cacheClear()` (`documents/service.ts:572,579`; `registration/service.ts:51`) and `submitApply` additionally fires `notifyAdmins()` (`documents/service.ts:676-685`). | A single script keeps the shared cache permanently cold (every visitor pays the full PostgREST read) and can push-notify every admin device without limit; unbounded rows in `database_asj_form` / `siswa_baru`. | Add `SUBMIT_ACTIONS` buckets (IP + per-WA) mirroring `CONTACT_ACTIONS`; drop `cacheClear()` from the anonymous path (or debounce it); move `notifyAdmins` behind a per-IP budget. | C |

### Medium

| ID | Severity | Category | Location | Attack path | Impact | Remediation |
|---|---|---|---|---|---|---|
| **F-08** | Medium | CWE-942 / CWE-200 · OWASP A05 | `netlify/functions/share-data.js:32-51` (`Access-Control-Allow-Origin: '*'` at `:48`), `contexts/catalog/service.ts:179-323` | The endpoint bypasses `handleAction` entirely (direct import), so it has no rate limit, and it returns `candidate.nama_lengkap`, `id_kandidat`, gender, age, height/weight, photo and document URLs for a job code. Job codes are short and human-readable (`TG658`, `SSW-KAIGO`) and are printed/sent over WhatsApp. Any third-party page can read it cross-origin. | Cross-origin harvest of candidate names + photos + document URLs (feeds F-01); the previous audit's note that `no_wa` was removed is correct — phone numbers are not in this payload. | Put the endpoint behind the same IP bucket as `PREFILL_ACTIONS`; narrow `ACAO` to the viewer origin (owner sign-off needed for third-party TSK). | C |
| **F-09** | Medium | CWE-200 · OWASP A01 | `contexts/documents/service.ts:45-63` (`PUBLIC_PREFILL_FIELDS`), `:698-712` (`handleGetExistingCandidateJsonByWa`), `_lib/handlers.ts:117,208-210` | Anonymous, IP-throttled at 20/min, keyed on a phone number, returns `nama, wa, gender, usia, tb, bb, pendidikan, tempatLahir, tglLahir, status, tahapan`. Different answers for "found" vs "not found" (`Kandidat tidak ditemukan.`) make it an existence oracle. | Given a phone number: full name + birth date + education + recruitment status. Indonesian mobile ranges make enumeration cheap. | Return a boolean "exists" only (no field values) before a session exists; require the WA to be confirmed by an OTP or by the login flow. **Stays separate from the AI-CV draft path (§1.0)**: this is `handleGetExistingCandidateJsonByWa` (no session, field allowlist, `limited: true`), whereas the CV draft is `getDrafCvMaster` (session + `isOwnerOrAdmin`, full nested payload). Same *key* (a phone number), different handler, different projection, different gate — do not merge them. | C |
| **F-10** | Medium | CWE-636 · OWASP A01 | `_lib/ai/chat.ts:498-538` (`tolakKecualiAiCvMaster`), fail-open at `:526-530` | If the VIP lookup throws (schema drift, DB blip), `lookupError = true` and the entitlement check is skipped, so a non-VIP candidate reaches `geminiGenerate` with the full AI-CV-Master prompt. Contrast `_lib/siswa-gate.ts:33-35`, which fails **closed**. | Free Gemini quota for non-entitled users during any DB error window; inconsistent with the sibling gate. | Fail closed with an explicit "coba lagi" message (the student sees a retry, not a grant), or a bounded grace window with a metric. | C |
| **F-11** | Medium | CWE-639 · OWASP A01 | `_lib/ai/chat.ts:1119-1133` (`handleProcessAiInterview`), `:1236-1241` (`handleSelesaikanWawancara`) | Both require `role==='kandidat'` but read the target WA from the payload (`p.wa`) and load that candidate's profile into the system prompt. A candidate can point the interview at another candidate's WA. | Another candidate's name/bidang pulled into a prompt and echoed back; quota burned in their name. (`handleSimpanHasilWawancara:1279-1285` already does this correctly by scoping to the session claim.) | Scope WA to `guard.token.wa`, except in the explicit `adminMode` path (check `role === 'admin'` first). | C |
| **F-12** | Medium | CWE-79 / CWE-1004 · OWASP A03, A05 | `src/store/authReactive.ts:41-46` (`persistentAtom('asj_auth')` → localStorage), `netlify.toml:150-182` (CSP deliberately absent) | Session token **and** 7-day refresh token are stored as plain JSON in `localStorage`; there is no CSP. The module header claims persistentAtom solves "XSS mitigation" — it does the opposite: `localStorage` is readable by any injected script. | One XSS = 24 h session + 7 d refresh exfiltration. The 7 `innerHTML`/`dangerouslySetInnerHTML` sinks are currently escaped or static, so this is defence-in-depth — but there is zero of it. | Ship `Content-Security-Policy-Report-Only` first (the repo already lists the required third-party hosts), then enforce with nonces. Move the session token to an `HttpOnly; Secure; SameSite=Lax` cookie minted by the `auth` function; keep only the refresh token server-side. | C |

### Low / defence-in-depth

| ID | Category | Location | Note |
|---|---|---|---|
| **F-13** | CWE-209 | `contexts/identity/service.ts:413-418` (`changePassword`), `:565-567` (`registerFcmToken`) | Raw `e.message` returned to the client (`Gagal mengubah password: <…>`). Everywhere else the repo correctly uses `safeError`. PostgREST fragments can leak schema/column names. |
| **F-14** | CWE-200 | `contexts/diagnostics/service.ts:12-26` | `getAppConfig` (admin-only) returns `fileEnvStructure` — for every key in `.env.local`: masked value (first 3 + last 3 chars + length), plus `candidatePassSample` (password hash format) and the full table/column inventory. On Netlify `.env.local` does not exist so `exists:false`; on any dev/preview deploy it hands an admin the prefix of every secret. |
| **F-15** | CWE-598 | `_lib/kernel/request-helpers.ts:105-116` | `sessionTokenFrom` accepts the token from `?sessionToken=`. Tokens in URLs land in access logs, `Referer` headers and browser history. |
| **F-16** | CWE-770 | `_lib/kernel/rate-limit.ts:69-71,143-170` | On any DB error the limiter degrades to a per-instance in-memory map (256 buckets, per warm Lambda). During a DB incident the login throttle becomes ~N-instances wide. |
| **F-17** | CWE-942 | `_lib/kernel/request-helpers.ts:13-23` | `getCorsOrigin` falls back to `ALLOWED_ORIGINS[0] || '*'`. The `'*'` branch is unreachable today (two hardcoded origins), but the hardcoded production host is `asjportal.netlify.app` while the live site is `amanahsakura.netlify.app` — if `APP_ORIGIN`/`SITE_URL` are unset, every function answers with a stale `ACAO`. Verify those env values before launch. |
| **F-18** | CWE-306 (inconsistent) | `contexts/registration/service.ts:79-93` (`handleGenerateFormBridge`) | The only bridge-link minter with **no** auth check; its two siblings (`:95`, `:107`) are `requireRole('admin')`. It only assembles a URL from caller-supplied parts (no data read/write), but it lets anyone mint a pre-filled `/apply-full.html?wa=…&nama=…` link. |
| **F-19** | CWE-1104 | `package.json:100-124` | See §5. `astro` carries a *critical* advisory but the vulnerable path (`define:vars` sanitisation) is unreachable — `grep -rn "define:vars" src` returns nothing. `zod@3.25.76` is runtime-reachable through `kernel/validate.ts`. `xlsx` is a non-registry CDN tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/…`) — a supply-chain trust point with no registry provenance/integrity metadata. |

---

## 2. STRIDE

| Threat | Assessment | Evidence |
|---|---|---|
| **Spoofing** | **Weak** — 4-digit master-eligible PINs (F-04); refresh tokens accepted as session tokens (F-06); logout does not revoke (F-05). Token signing itself is sound: HMAC-SHA256, `timingSafeEqual`, `exp` mandatory, `iat` stamped, `SESSION_SECRET` throws in production when unset (`_lib/session.ts:33-39,85`). | F-04, F-05, F-06 |
| **Tampering** | **Weak** — another candidate's documents can be overwritten/deleted (F-03). DB writes are otherwise column-filtered (`writeBodyFor`, `_lib/db/client.ts:283-306`) so unknown/extra columns cannot be mass-assigned; `buildMasterBody` only copies keys in `MASTER_COLUMN_MAP` (`master-data/service.ts:1110-1113`), so `status_kandidat: 'LULUS'` from a candidate is dropped. | F-03; verified *not* mass-assignable |
| **Repudiation** | **Adequate** — `log.info('ai.cv.submit', { wa: hashPii(wa), by: … })`, `idempotency_keys` scoped to `<identity>|<action>|<key>` (`handlers.ts:338-341`), `submitted_by` recorded in the log where the table has no column. Audit trail is structured, not tamper-proof (logs go to the platform). | `_lib/ai/cv.ts:328`, `handlers.ts:333-352` |
| **Information disclosure** | **Broken** — public document bucket with predictable paths (F-01), PII in a public repo (F-02), anonymous prefill oracle (F-09), CORS `*` on a PII endpoint (F-08), masked env in `getAppConfig` (F-14). | F-01, F-02, F-08, F-09, F-14 |
| **Denial of service** | **Partial** — two unmetered anonymous writes with `cacheClear()` (F-07); limiter degrades per-instance (F-16). Mitigated by real work: admission control before the limiter (`handlers.ts:241-288`), 10 MB body cap, deadline propagation, job deferral, `MAX_FILES`/`MAX_TOTAL_BYTES` on the ZIP path (`documents/download.ts:71-75`). | F-07, F-16 |
| **Elevation of privilege** | **Weak** — 4-digit PIN → master admin (F-04); VIP gate fails open (F-10); cross-candidate document write (F-03). No privilege-escalation path was found from `kandidat` to `admin` other than the PIN tier; `requireRole` correctly rejects `role` mismatch and `kind==='refresh'`. | F-03, F-04, F-10 |

---

## 3. OWASP Top 10 (2021) checklist

| # | Control | Result | Basis |
|---|---|---|---|
| A01 | Broken Access Control | **FAIL** | F-01, F-03, F-08, F-09, F-11. Every admin action checked server-side; the failures are object-level and data-plane, not route-level. |
| A02 | Cryptographic Failures | **PASS (with F-01 caveat)** | bcrypt cost 10 for candidate passwords (`identity/service.ts:346,390`); `timingSafeEqual` for PIN and bearer comparison (`:214-219`, `health.js:54-60`); TLS-only; HSTS `max-age=31536000; includeSubDomains` (`netlify.toml:182`). No MD5/SHA1 for security purposes. Documents are unencrypted at rest in a public bucket → F-01. |
| A03 | Injection | **PASS** | All PostgREST filters are built with `URLSearchParams` and digit-normalised WA (`_lib/db/client.ts:381-384`, `shared/wa-rules.ts`); no `or=(…)` construction from user input (the only mention is a comment about a removed one, `_lib/db/forms.ts:121`); no string-interpolated SQL; `order=`/`select=`/keyset `key` are internal constants (`_lib/db/pagination.ts:80-90`); no `exec`/`spawn` with user input; `innerHTML` sinks are escaped or static (F-12). The one XSS-adjacent pattern is `AiCvForm.tsx:1577`, which re-injects `<b>` **after** `sanitizeAiHtml` — an allowlist sanitiser would be better. |
| A04 | Insecure Design | **FAIL** | F-07 (unmetered anonymous writes), F-10 (fail-open entitlement), and the accepted-but-costly `share-data` trade-off (F-08). |
| A05 | Security Misconfiguration | **FAIL** | F-01 (public bucket), F-02 (repo hygiene), F-14 (env metadata), F-17 (stale CORS host), no CSP (F-12). Positive: `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` all set (`netlify.toml:175-182`); `nosniff` + no directory listing. |
| A06 | Vulnerable & Outdated Components | **CONDITIONAL** | §5. 44 advisories (1 critical, 34 high) but almost all are build/dev-tooling transitive; only `zod` and the `xlsx` CDN tarball are runtime-relevant. |
| A07 | Identification & Authentication | **FAIL** | F-04, F-05, F-06. Positive: bcrypt, single failure message for all login outcomes (anti-enumeration, `identity/service.ts:31`), per-IP throttle + lockout, `registerKandidat` requires an explicit ≥4-char password (no phone-digit default). |
| A08 | Software & Data Integrity | **PASS (minor)** | CI builds from `npm ci` with a lockfile, `permissions: contents: read`, no `pull_request_target`, no `github.event.*` interpolation into `run:`, deploy only on tags/releases/`workflow_dispatch` (`.github/workflows/*`). Artifact hash carried CI → deploy. The `xlsx` CDN tarball (F-19) is the one unsigned input. |
| A09 | Logging & Monitoring | **PASS** | Structured `log.info/warn/error` with request IDs, metrics flush, `health.js` gated + fail-closed, `metrics-receiver.ts` bearer-gated with constant-time compare. No PII in logs on the paths I read (`hashPii` used for WA). No log-injection sink found (values are structured, not concatenated into lines). |
| A10 | SSRF | **PASS (narrow)** | Outbound fetches are fixed hosts (Gemini/Groq/xAI, `_lib/ai/providers.ts:378,511,606`). User-supplied document URLs are validated by `isAllowedDocumentUrl` — https + host allowlist with `host === h || host.endsWith('.' + h)` (`_lib/storage.ts:266-276`) — before `downloadJobDocs` fetches them. No `file://`/`gopher://`, no metadata-service reachability (the allowlist cannot match `169.254.169.254`). Residual: an operator-added `ALLOWED_DOCUMENT_HOSTS` entry widens this. |

---

## 4. Endpoint authorization matrix

`admin` = `requireAdmin`/`requireRole(…,'admin')` inside the handler (not the wrapper). `owner` = `isOwnerOrAdmin(session, wa)` — the WA is compared after `normalizeWa`. "Obj-level" asks: can caller A act on caller B's row?

| Action (entry point) | Auth required | Role check | Obj-level check | Verdict |
|---|---|---|---|---|
| `checkAdminMaster` (auth) | no (it *is* auth) | — | — | PIN space too small → F-04 |
| `checkAdminPersonal` (auth) | no | — | — | same |
| `loginKandidat` / `daftarKandidat` (auth) | no | — | — | bcrypt + uniform error + throttle |
| `refreshAdminSession` / `refreshKandidatSession` (auth) | refresh token | `kind`+`role` | revocation consulted | OK |
| `gantiPasswordKandidat` (auth) | yes | kandidat only | session WA must equal payload WA (`surfaces/auth.ts:66-71`) | OK |
| `logout` (auth) | token or refresh | — | subject from signed claim only | OK |
| `registerFcmToken` (auth) | yes | admin/kandidat | kandidat bound to own WA (`identity/service.ts:470-473`) | OK |
| `getAppData` (get-app-data) | mode-dependent | admin/kandidat | `kandidat` reads only `t.wa` | OK (cache key includes token presence) |
| `getMonthlyReport` (get-app-data) | yes | admin | n/a | OK |
| `kirimPesanKontak` (kontak) | **no, by design** | — | honeypot + 5/hour/number + 10/min/IP | OK |
| `getCandidatesPage` / `updateCatatanKandidat` / `updateKandidatSuper` (candidates) | yes | admin | n/a | OK |
| `reviewForm` / `approveForm` / `rejectForm` / `deleteForm` / `hapusFormTerpilih` / `tandaiDibacaForm` (mail) | yes | admin | n/a | OK |
| `getMasterDataByWa` / `getDrafCvMaster` / `submitMasterForm` / `simpanBiodataLengkap` (master-data) | yes | admin **or** kandidat | `isOwnerOrAdmin` on WA | OK (but F-06: refresh token accepted) |
| `simpanUpdateMaster` (master-data) | **not verified** | — | — | Not opened — see §7 |
| `updateSysConfig` / `getRincianPresets` / `saveRincianPreset` / `deleteRincianPreset` (config) | yes | admin | n/a | OK |
| `simpanJadwalBaru` / `hapusJadwal` / `tambahTugasBaru` / `setTugasStatus` / `hapusTugas` / `checkAndSendAgendaReminders` (schedule) | yes | admin | n/a | OK |
| `getDaftarSiswaBaru` (register) | yes | admin | n/a | OK |
| `submitDaftarSiswa` (register) | **no, by design** | — | — | **no rate limit** → F-07 |
| `getLinkSiswaBaru` (register) | no | — | returns a static URL only | OK |
| `generateFormBridge` (register) | **no** | — | assembles a URL only | F-18 |
| `generateLegacyMasterBridge` / `generateAiFormBridge` (register) | yes | admin | n/a | OK |
| `simpanWaTemplate` / `hapusWaTemplate` (notify) | yes | admin | n/a | OK |
| `kirimSatuPesanFonnte` / `kirimTawaranMassal` (notify) | yes | admin (before enqueue) | n/a | OK |
| `getNotifikasiKandidat` / `tandaiNotifikasiDibaca` / `tandaiSemuaNotifikasiDibaca` / `hapusNotifikasi` (notify) | yes | owner-or-admin | WA compared | OK |
| `getStatusNotifikasiAdmin` (notify) | yes | admin | n/a | OK |
| `processAIChat` / `terjemahkanKolomCv` / `transkripsikanSuara` (ai-chat) | yes | admin or VIP kandidat | VIP from session claim | F-06, F-10 |
| `processSiswaAIChat` (ai-chat) | **no, by design** | — | IP-only bucket 10/min | OK |
| `processAiInterview` / `selesaikanWawancara` (ai-chat) | yes | kandidat | **WA from payload** | F-11 |
| `simpanHasilWawancara` (ai-chat) | yes | kandidat + VIP | WA from session claim | OK |
| `getHasilWawancara` / `getJawabanWawancaraAdmin` / `getAdminAiContext` / `buildAdminAiCandidateSummary` / `ekstrakBiodataDariTeks` / `generateWawancaraModel` / `getLinkWawancara` (ai-chat) | yes | admin | n/a | OK |
| `getBankWawancara` / `simpanJawabanWawancara` / `terjemahkanJawabanWawancara` / `simpanSkorGame` (ai-chat) | yes | student-or-admin | `isOwnerOrAdmin` + `statusVip` | OK |
| `getPapanSkor` (ai-chat) | yes | admin or VIP student | other participants' WA masked | OK |
| `submitDataAsj` / `simpanDataTtdNaitei` / `saveSignature` (ai-chat) | yes | admin or kandidat | `isOwnerOrAdmin` | OK (F-06) |
| `getBankKotoba` / `getBankSsw` / `getBankMatematika` (kotoba) | yes | student-or-admin | `isOwnerOrAdmin` + VIP | OK |
| `getStatusTes` / `simpanHasilTes` / `getSoalIq` / `simpanHasilIq` (kotoba) | yes | student-or-admin | `isOwnerOrAdmin` + VIP | OK |
| `getHasilTesAdmin` / `setTesAktif` / `resetHasilIq` / `tulisMataKeCv` (kotoba) | yes | admin | n/a | OK |
| `parseDokumenBiodata` (ingest) | yes | admin | n/a | OK |
| `simpanJobBaru` … `tandaiGagalJob` (jobs) | yes | admin | n/a | OK |
| `getAppConfig` / `reportWebVital` (diagnostics) | yes / **no** | admin / — | n/a | `getAppConfig` → F-14 |
| `getUploadUrls` (files) | yes | admin or kandidat | folder forced to `kandidat/<wa>` | OK (F-06) |
| `cekDataPelamar` (files) | yes | admin or kandidat | WA forced from session for kandidat | OK |
| `getExistingCandidateJsonByWa` (files) | **no, by design** | — | field allowlist only | F-09 |
| `submitApply` (files) | **no, by design** | — | PATCH guarded by `isOwnerOrAdmin` | **no rate limit** → F-07 |
| `simpanKandidatDanUpload` (files) | yes | admin | n/a | OK |
| `simpanBerkasTahapan` (files) | yes | admin or kandidat | WA checked, **folder from payload name** | **F-03** |
| `simpanRevisiKandidat` (files) | yes | kandidat | WA scoped to session | OK |
| `downloadJobDocs` (job-docs) | yes | admin | n/a | OK (URL allowlist + 200-file/100 MB caps) |
| `shareData` / `share-data.js` | **no, by design** | — | job code only | F-08 |
| `getHealth` | not routable | admin (defence in depth) | — | OK — deliberately absent from `surfaces/registry.ts` |
| `/health` (health.js) | GET = liveness only; POST/?detail=1 = `HEALTH_TOKEN` | — | constant-time compare, fails **closed** | OK |
| `sweep-queue`, `agenda-reminders`, `retensi-notif` | scheduled-only | — | — | OK (not URL-invocable on published deploys) |

**Client-side guards are never the only guard.** `src/pages/admin.astro` gates the UI, but every admin action re-checks on the server; I found no action that relies on the client's role.

---

## 5. Dependencies

`npm audit --omit=dev --json` → **44 advisories** (1 critical, 34 high, 7 moderate, 2 low) across 1,350 packages. A raw count is not a finding; the reachable set is small:

**Runtime-reachable (bundled into a deployed function):**
- **`zod@3.25.76`** (high, GHSA-mrhx-c7xc-m3w5 — memory exhaustion on oversized constrained collections). Reachable through `_lib/kernel/validate.ts:33-48` on 9 actions. Payload body is capped at 10 MB (`netlify-wrapper-surface.ts:160-171`), and the schemas constrain short fields (`pinField.max(6)`, `passwordField`, `waField`), so a *practical* trigger was not constructed — **needs a runtime confirmation** before it is treated as exploitable. Upgrade to `zod@4.6.6+`.
- **`xlsx@0.20.3`** — not an npm-registry dependency at all: `package.json:123` pins `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. 0.20.3 is the patched SheetJS build (CVE-2023-30533 and CVE-2024-22363 fixed), but there is no registry provenance, no integrity hash in the lockfile path, and the CDN is a single point of compromise for a package that parses **untrusted candidate spreadsheets** (`_lib/ai/classify.ts`). Mitigation: vendor the tarball, or pin by `integrity`.
- `exceljs`, `mammoth`, `pdf-parse`, `jszip` — parse untrusted uploads; no advisory is reachable in the paths I read, but they are the DoS surface for `parseDokumenBiodata` (admin-only, so bounded).

**Build/dev-only (never shipped to the function runtime):** `astro` (critical advisory is `define:vars` sanitisation — `grep -rn "define:vars" src` returns **nothing**, so unreachable), `@astrojs/netlify`, `@netlify/*`, `vite`, `picomatch`, `minimatch`, `fast-glob`, `glob`, `esbuild`, `sharp`, `undici`, `node-forge`, `smol-toml`, `toml`, `devalue`, `source-map-js`, `image-size`, `ipx`, `listhen`, `unstorage`, `fdir`, `tinyglobby`, `brace-expansion`, `fast-uri`, `@typescript-eslint/typescript-estree`.

**Process gap (carried from the 2026-11-15 audit, still open):** the dependency gate is `continue-on-error: true` in `ci.yml`, so a high advisory never fails a PR.

---

## 6. Secrets — what was checked and what was found

| Check | Result |
|---|---|
| Tracked tree: private-key markers | 3 hits, all benign — `.env.example:167` (placeholder), `secrets/firebase-service-account.example.json:5` (example), `_lib/fcm-server.test.ts:410` (fixture). `public/godot/index.wasm` matches as a binary false positive. |
| Tracked tree: JWT-shaped strings (`eyJ…`) | **0** |
| Tracked tree: provider key shapes (`AKIA`, `ghp_`, `xox[baprs]-`, `sk-`, `AIza`) | 5 hits, all documentation/placeholder (`.gitignore`, `docs/CODE_REVIEW_PROCESS.md`, `scripts/ci/review-gate.mjs`, `src/lib/fcm.ts` public Firebase web config) |
| Tracked tree: `postgres://…@` connection strings | 10 hits, all placeholder or `127.0.0.1` test DSNs (credentials masked before inspection) |
| Git history: `git log --all -S'eyJ'` / `-S'BEGIN PRIVATE KEY'` | Only `2cec59c` → `public/godot/index.wasm` (compiled binary string) |
| Git history: credential paths ever added | `.env.example`, `netlify/functions/secrets/{README.md,*.example.json}`, `deliverables/db-neon-migration/ENV-BARU-NEON.env` |
| `ENV-BARU-NEON.env` history | Added `47c666b`, removed `af463ce`, **not** in `HEAD`. Every key classified: empty or placeholder. **No live secret was ever committed.** |
| `.gitignore` coverage | Covers every credential path actually used: `.env` (14), `.env.*` (15), `.env.local` (96), `*-credentials.txt` (104), `netlify/functions/secrets/*` with `!*.example.json` / `!README.md` (136-138), `env-kunci/` (203), `deliverables/db-neon-migration/ENV-BARU-NEON.env` (219). Untracked and confirmed: `.env`, `.env.local`, `.env.orig-backup`, `.env.local.orig-backup`, `env-kunci/`, `netlify/functions/secrets/` (only README + example tracked). |
| Runtime fallback | `_lib/env.ts:152-217` will read `.env.local` from the filesystem if `process.env` is empty, for a 60-key whitelist. On Netlify the file is not deployed, so this is inert — but it means an accidentally deployed `.env.local` becomes live configuration. No such file is tracked. |
| **The one real leak** | Not a key — **PII** (F-02). |

---

## 7. What I could not verify

1. **Live bucket privacy (F-01).** I did not issue any request to the production storage host. The conclusion rests on three code facts (the `/object/public/` URL form, the public `share-data` viewer returning those URLs to anonymous callers, and the repo's own comment at `contexts/catalog/service.ts:172` — "the files themselves live on a public bucket"). **Confirm with one authenticated-less `HEAD` to a known object before acting, and confirm again after any fix.**
2. **Repository visibility (F-02).** Asserted public by the team lead; `origin` is `github.com/asjosdokumen-alt/asj-astro`. I made no network call to confirm. If it is in fact private, F-02 drops from Critical to High but is still a breach of the data-handling rule.
3. **Whether migration `012_rls_lockdown.sql` is applied to the live database.** The migration is correct and idempotent on paper (enables RLS, drops the `TO PUBLIC USING(true)` policy, revokes anon grants, `ALTER DEFAULT PRIVILEGES`, self-verifying `DO` block). The known "zero rows, no error" trap means a missing policy looks like an empty table — so this must be verified against the real DB (`npm run verify:rls` in definitive mode with `SUPABASE_DB_URL`), not inferred. The 2026-11-15 audit flagged that the local probe can exit 0 while DEGRADED.
4. **`handleSimpanUpdateMaster`** (`contexts/master-data/service.ts`) — I did not open this handler; it is admin-routed through `surfaces/master.ts` but its internal guard was not read. Treat as unverified.
5. **`contexts/applications/service.ts`** — I saw the six `requireAdmin` call sites (`:337,343,349,372,410,480`) but did not read the bodies; object-level checks inside them are unverified.
6. **The remaining `deliverables/**` screenshots.** I sampled `_admin-pelamar-desktop-light.png` — it shows fixture data ("Budi Santoso", fake numbers), not real candidates. I did not open the other ~40 images; if any were captured against production they may carry PII. Same rule as F-02 applies.
7. **Runtime exploitability of the `zod` advisory** (§5) — not reproduced.
8. **No dynamic testing was performed**: no requests to the production host, no brute force, no fuzzing, no `vitest` run (the repo notes that some service tests can write to the production database — that is a real hazard and I did not take it).
9. **The AI-CV save path's ownership check is not measured by any test.** `e2e/ai-cv-submit.test.ts:70-74` mocks the whole `contexts/identity` module — `requireRole` always returns an admin token, `isOwnerOrAdmin` always returns `true`, `verifyToken` always returns admin. The save suite therefore passes identically whether or not the real `isOwnerOrAdmin` comparison works, and whether or not the guard at `_lib/ai/cv.ts:318` is reachable. I verified the guard by reading it (§1.0) and it is correct **today**; the blind spot is that a regression there — a normalisation change in `shared/wa-rules.ts`, or the guard being moved below a write — would ship green. This is the same failure mode the repo already fixed elsewhere (the `flow` gate, F-10's sibling H1 in the 2026-11-15 audit): a mocked dependency turning an authorization test into a tautology.

---

## 8. Remediation order

**Before launch (blockers)**
1. F-02 — remove the committed biodata (file **and** history), decide on subject notification, add a CI guard for `deliverables/**` binaries.
2. F-03 — derive the storage folder from the session, never from `d.nama`; move the `fileLabelKey` rejection above the upload.
3. F-01 — private bucket + signed URLs; migrate objects to non-enumerable paths.

**This sprint**
4. F-04 — rotate every admin PIN, remove personal PINs from the master set, require ≥8 chars.
5. F-06 + F-05 — reject `kind:'refresh'` in `verifyToken`; consult `session_revocations` in `requireRole`.
6. F-07 — rate-limit `submitApply` and `submitDaftarSiswa`; stop calling `cacheClear()` on the anonymous path.

**Next sprint**
7. F-08/F-09 — per-IP bucket on `share-data`; make the anonymous prefill an existence check.
8. F-10/F-11 — fail the VIP gate closed; scope interview WA to the session claim.
9. F-12 — CSP in report-only mode, then enforce; move the session token to an HttpOnly cookie.
10. F-13 … F-19 — the low items, plus make the dependency gate blocking.

---

*Audit performed read-only. No file outside `F:/astro/deliverables/gstack/` was written, no secret value was printed, no production request was made, and no exploitation beyond static proof was attempted.*
