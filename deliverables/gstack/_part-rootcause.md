# Root-cause report — 4 owner-reported UI defects

Investigator (read-only on tracked files). Repo `F:\astro`, branch `main`, HEAD `7422bcee37e9474a3f1e53b2f323c71dcd49a3df` (`test(dialog): the sakura layer is aria-hidden, so it is not a dialog`, 2026-09-25 19:44 +0700).

`git status --porcelain` — **6 modified files** (all worktree, none committed):

```
 M src/components/App.tsx
 M src/CvMiniModal.test.tsx
 M src/layouts/BaseLayout.sakura.test.ts
 M src/store/i18n-jp.ts
 M src/store/i18n.ts
 M src/styles/theme.css
```

No `npm run`/`npx`/build/mutation battery was run (sandbox delete quota + unreliable `npm`). Every fact below is from `Read`/`Grep` on the working tree, plus the **stale `dist/` build** (Sep 25 19:44, i.e. HEAD) as a second, independent witness of what Tailwind actually emits.

Toolchain measured: `tailwindcss@4.3.3`, `@tailwindcss/vite@^4.3.3`, `astro@5.12.0`. `src/styles/global.css:1-4` is the compiler entry (`@import "tailwindcss"` then `./theme.css`), so `@theme` tokens are visible to the gate compiler and to the build.

---

## D1 — "kok gini kayak rusak kalo buka menu hamburger" (sticky bar stays bright over the scrim)

**Symptom.** Drawer open, page dimmed, EXCEPT a bright white sticky section bar that stays un-dimmed on top of the scrim.

**Exact sites.**
- Scrim (HEAD): `src/components/App.tsx:15` `const Z_INDEX = { OVERLAY: 35, NAV: 40, HAMBURGER: 30 } as const;` and the scrim element applied it inline via `style={{ zIndex: Z_INDEX.OVERLAY }}` (HEAD `App.tsx:588`).
- Sticky bar: `src/components/public/SiteNav.astro:75` → `class="hidden lg:block sticky top-0 z-sticky w-full bg-canvas border-b border-line"`.
- Token: `src/styles/theme.css:92` `--z-index-sticky: 50;`.

**Mechanism (measured, not inferred).**
1. `z-sticky` → `50` (theme.css:92). The scrim's inline `zIndex` was `35`.
2. `50 > 35` ⇒ the sticky bar paints **above** the scrim. The drawer was `40`, also `< 50`, so the same bar could paint over the drawer too.
3. The bar is `bg-canvas`; in light mode `--color-canvas: #ffffff` (theme.css:294) — that is the "bright white bar" in the screenshot.

The lead's hypothesis is **CONFIRMED**. Root cause = a **second, private z-index scale in `App.tsx` that contradicted the theme scale** (state corruption / configuration drift class, not a race).

**Is `z-scrim`/`z-drawer` a REAL generated utility in this Tailwind 4 setup? — YES, proven two ways.**
- Namespace proof from the built artifact: `dist/_astro/admin.BUTG7Brn.css` contains `.z-sticky{z-index:var(--z-index-sticky)}`. That is exactly the shape Tailwind v4 emits for an `@theme --z-index-*` token, so the `--z-index-<name>` → `z-<name>` mapping is real **in this build**.
- `.z-scrim` / `.z-drawer` are **absent** from that `dist/` because HEAD did not reference them (HEAD used the inline `Z_INDEX` map). In the worktree they appear as **literal strings** in `class` attributes — `App.tsx:591` (`... js-scrim z-scrim`) and `App.tsx:606` (`"u-viewport-fixed--right z-drawer w-72 md:w-96 ..."`) — so Tailwind's source scan will pick them up on the next build.
- Gate check: `scripts/ci/verify-classes.mjs` compiles `src/styles/global.css` with the **real** compiler (lines 71, 745-751) and resolves `@theme static` overrides exactly as a build would (its own header, lines 24-30). `z-scrim`/`z-drawer` will therefore be credited as **defined** — no `verify:classes` failure.

**Worktree fix (partial or complete?).** `src/styles/theme.css:100` adds `--z-index-scrim: 95;`; `App.tsx:591` switches the scrim to `z-scrim` and `App.tsx:606` switches the drawer to `z-drawer`. The private `Z_INDEX` map is gone; grep confirms **no remaining `Z_INDEX.OVERLAY` / `Z_INDEX.HAMBURGER` reference** anywhere (only prose in comments/docs). So removing the const does not leave a dangling reference.

**Can anything else still paint above the scrim (95)? — I checked every candidate.**
- Header `--z-index-header: 90` — the token exists but **is used nowhere in markup** (grep: only `theme.css`/`DESIGN.md` mention it). The header element itself (`App.tsx:298`) carries `relative` and **no** z-index class → it is below the scrim. Safe.
- `u-modal-shell` (`layout.css:131-133`) sets only `overscroll-behavior: contain` — **no** z-index. The scrim reuses it harmlessly.
- `#sakura-particles` `z-index: 1` (`main.css`) → below.
- `BottomNav.tsx:44,74` `z-[90]` (mobile, `md:hidden`) → `90 < 95`, dimmed. Safe.
- `ShareView.tsx:387` `z-[90]` → not on `/`.
- `overlay-root.ts:25` `ROOT_Z_INDEX = 1000` — only hosts overlays it portals; not co-open with the drawer.
- All modals are `z-[150]`…`z-[9999]` but none is open while the drawer is. The scrim sits **under** the drawer it belongs to (95 < 100). Correct ordering.

**Verdict: the fix is COMPLETE for the reported symptom.** On `/` with the drawer open, nothing but the drawer (100) paints above the scrim (95).

**One hard caveat.** `dist/` is stale (HEAD build). Until `npm run build` runs, every e2e gate that measures the **served** artifact still sees the old inline `zIndex: 35/40`. The fix is correct in source but not yet in any servable output.

**Blast radius (docs/comments that now lie — no test asserts the z-values).**
- `DESIGN.md:439-457` §3.8: the token table **omits** `--z-index-scrim`, and `DESIGN.md:456` states the local `Z_INDEX` map (OVERLAY 35, NAV 40, HAMBURGER 30) "**tetap** dipakai" — now false.
- `DESIGN.md:693` lists `Z_INDEX` in `App.tsx:15` as a cross-check item.
- `docs/LANDING_PAGE_ROADMAP.md:320` quotes `z-index` drawer `App.tsx:15`.
- `src/styles/motion.css:164` comment says "the app's Z_INDEX scale starts at 30".
- No e2e/test asserts the scrim's numeric z-index (grep for `z-index`/`zIndex`/`Z_INDEX` in `e2e/*.mjs` → only `shot-bottomnav-occlusion.mjs`, unrelated). `e2e/test-dialog.mjs:427-458` asserts the drawer scrim is `aria-hidden` (unchanged) and `:474` closes the drawer by clicking the scrim at (80,400) — still hits the scrim, in fact more reliably now.
- Not a defect, but worth recording: `z-header` (90), `z-modal` (200), `z-loader` (9999) are defined and **unused**; components still hard-code `z-[200]`/`z-[9999]`. The "one scale" claim is only partly realised (only `z-sticky`/`z-scrim`/`z-drawer` are actually used).

---

## D2 — the band below the hero still exists (delete the WHOLE band)

**Symptom.** Owner asked yesterday for the band below the hero to be deleted; still present. Owner now confirms: delete the **entire** band — the live-vacancy count strip **and** the `SiteNav` section bar.

**Every render/feed site (file:line).**
| Role | Site |
|---|---|
| Count-strip markup | `src/pages/index.astro:119-142` — comment `:119-128`, wrapper `:129`, card `:130`, `<Icon briefcase>` `:131`, `<p>` `:132`, `#live-job-count` `:133`, `data-lang="profile.hero_jobs_live"` `:134` |
| Count-strip fill | `src/pages/index.astro:144-159` `<script>`; the count lines are **`:156-157`** (`var count=document.getElementById("live-job-count"); if(count && d.jobs){ count.textContent=String(d.jobs.length); }`). The marquee fill is `:148-155` — **separate, keep it**. |
| SiteNav import | `src/pages/index.astro:7` |
| SiteNav mount | `src/pages/index.astro:164` `<SiteNav />` |
| Component | `src/components/public/SiteNav.astro` — `<nav data-site-nav …>` `:71-155`; `/loker` link `:105`; login dispatch `:167-169`; scroll-spy `:194-224` |
| Data source | `src/lib/publicData.ts` `getPublicData()` returns `{jobs, pengumuman}`; it does **not** touch the DOM — the fill is only in `index.astro:156-157` |
| `asj-kandidat-login` | **Dispatched** by `SiteNav.astro:168`; **listened for** by `App.tsx:180` and `LoginModal.tsx:67`. Removing SiteNav removes one dispatcher, not the listener (the `ClosingBand`/header still dispatch) — no dead-listener breakage. |
| `data-nav-*` listeners | All inside SiteNav's own `<script>` (`data-nav-link` `:195`, `data-nav-login` `:167`). **No external listener** anywhere. |

**Blast radius.**

*e2e gates:*
- **`e2e/test-site-nav.mjs` — the ENTIRE gate is about SiteNav → 8/8 red.** `EXPECTED_IDS` `:133` = `['layanan','program','alur','fasilitas','tentang']`; presence + hidden-at-390/shown-at-1280 `:196`; every-item-resolves + exact id set `:212`; no authored `aria-current` `:239`; scroll-marker per section `:323`; nav has 0 language controls + drawer toggle works `:363`; nav login opens the modal `:398`.
- **`e2e/test-landing.mjs` — red, and cannot be made green by deleting the rule.** `LOKER_ROUTE` `:172-225` has exactly **one** region: `selector: 'nav[aria-label="Navigasi halaman"] a[href="/loker"]'` (`:221`). The assertion `:812-835` fails on `count === 0`, and the anti-vacuity guard `:817-822` fails if `regions` is emptied ("restore that region").
- `e2e/test-headings.mjs` — **NOT** in the blast radius. Its `:461-479` explicitly *removed* the `header a, nav a` link-count assertion because it was non-discriminating ("Do not 'strengthen' this to a link count"). No nav-link count to break.
- `e2e/test-drawer.mjs` — unaffected in principle, but its safety argument (`test-site-nav.mjs:30-36`) is that the bar is `hidden lg:block` so it never enters the 390×844 drawer frame; deleting the bar only removes the risk.

*Indexer frozen inventory (unit tests, run by `npm run test`):*
- `indexer/src/build.test.ts:504` `expect(r.stats.fileCount).toBe(497);` → **496**
- `indexer/src/discover.test.ts:687` `expect(count('astro')).toBe(21);` → **20**
- `indexer/src/discover.test.ts:1280` `expect(files.length).toBe(497);` → **496**
- `indexer/src/parse.test.ts:126` `expect(p.imports).toHaveLength(20);` → **19** (the `index.astro` import is removed)
- `indexer/src/parse.test.ts:139` `expect(p.symbols).toHaveLength(44);` → **43** (one fewer default ImportBinding)

*Scripts / manifest / CI wiring:*
- `package.json:31` `"e2e:site-nav": … node e2e/test-site-nav.mjs` and `:23` `test:e2e` chains it → orphaned/red.
- `scripts/ci/review-manifest.json` — **has NO `e2e:site-nav` entry** (only `e2e:public`, `loker-layout`, `landing`, `headings`, `dialog`, `drawer`, `labels`; grep `"script": "e2e:` confirms). But the `e2e:landing` note (`:505`) states in prose "the section nav must still link to /loker … M8 in the battery proves a broken nav item turns it red" → must be rewritten.
- `.github/workflows/ci.yml:261-267` runs public/loker-layout/headings/landing/dialog/drawer/labels — it does **not** run `e2e:site-nav`, so CI would catch this via **`e2e:landing`** (red), not via the site-nav gate.
- Batteries that mutate the file: `e2e/test-landing.mutations.sh:119` (`NAV=src/components/public/SiteNav.astro`) and `:425` (M8 rewrites the `profile.nav_loker` anchor) → abort/red. `e2e/test-public.mutations.sh:329` names `SiteNav.js` in its module-graph walk.
- `e2e/measure-site-nav.mjs` — evidence tool, orphaned.

*i18n keys that become orphaned (both dictionaries) — and this is a SILENT orphan.*
`src/store/i18n.keys.test.ts` only ever checks **used → present** (`:140-160`); it never checks present → used, and it skips test files and the i18n files themselves (`:97-98`). So orphans **do not go red**.
- `profile.hero_jobs_live` — `i18n.ts:1106`, `i18n-jp.ts:790`
- `profile.nav_aria` — `i18n.ts:1357`, `i18n-jp.ts:1001`
- `profile.nav_loker` — `1358` / `1002`
- `profile.nav_program` — `1359` / `1003`
- `profile.nav_alur` — `1360` / `1004`
- `profile.nav_fasilitas` — `1361` / `1005`
- `profile.nav_tentang` — `1362` / `1006`
- `profile.nav_layanan` — `1367` / `1009`
- (`header.login` at `SiteNav.astro:148` stays used by App/LoginModal/ClosingBand → **not** orphaned.)

*Docs claiming the band exists:* `docs/LANDING_PAGE_SPEC.md:190` (strip row), `:217` (acceptance criterion "Strip lowongan menampilkan angka yang sama…"), `:543-575` (§5.1 SiteNav: `:556` container, `:558` `sticky top-0 z-sticky`, `:561` items, `:562` language picker, `:583` anchor map), `DESIGN.md:65` (trust-signal rationale for the count).

**Does removing it also remove the LAST in-page path to `/loker`? — YES.** Measured: the only `href="/loker"` in `src/**` markup is `SiteNav.astro:105` (`<a href="/loker" data-lang="profile.nav_loker" …>Lowongan</a>`). Every other `/loker` hit is prose (`App.tsx:506-508`, `ClosingBand.astro:37-38`, `BaseLayout.astro:332`, `LokerTable.tsx:215`) or the route itself. **`src/components/Footer.astro:97-100`** links only `#program`/`#alur`/`#fasilitas`/`#tentang` — **no** `/loker`. The `App.tsx` drawer has **no** `/loker` link. So deleting the band leaves `/` with **zero** links to `/loker`, and `e2e:landing`'s `LOKER_ROUTE` rule encodes exactly that as a hard requirement.

**Nothing in D2 is un-buildable — but the `/loker` path is a decision the team must make explicitly** (add a replacement link, or consciously retire the `LOKER_ROUTE` rule, which the gate's own comment forbids).

---

## D3 — the candidate profile does not match the legacy "ASJ DOSSIER" card

**Symptom.** Owner wants the candidate profile to match the legacy "ASJ DOSSIER" card (dark rounded card: `ASJ DOSSIER` header + `VERIFIED CANDIDATE` subtitle + round verified badge; photo tile with an `ASJ-…` name bar and a green `LULUS` chip; name + flag/medal/star icons; green WhatsApp row; 2×2 boxed fields Laki-laki / 36 Tahun / 165/57 / SMK; a birth-date row; an email row; a 3-line address block; `JFT N3` and `MANUFACTUR` chips; a `JOB / BIDANG YANG DILAMAR` block with a `LULUS` chip; a green `DOWNLOAD FULL BIODATA` button).

**What renders the candidate profile today.**
- `src/components/candidate/CandidateDash.tsx` (666 lines) is the candidate profile. It renders a **progress / pipeline dashboard**, not a dossier identity card: welcome + `CrownBadge` (`:362`), job/tahapan strip (`:367-377`), the VIP-only "Digital Student Card" (`:380-410`), CV-mini/CV-master bars (`:413-429`), jadwal (`:432-446`), admin note (`:449-454`), a Profil button (`:458`), the "Status Lamaran Terkini" riwayat + tahapan pipeline (`:462-539`), a button grid (`:527-537`), the needRevision block (`:540-595`), `StepGuide` (`:603`), `LevelCard` (`:616`), pemberkasan (`:620-646`).
- It composes: `LevelCard`, `StepGuide`, `CvMiniModal`, `CvTemplateSelector`, `RirekishoBuilder`, `EsignNaiteiModal`, `PemberkasanModal`, `InterviewSimulatorModal`, `ChangePasswordModal` (imports `:10-26`; modals `:652-660`).
- **The legacy "ASJ DOSSIER" card is actually the ADMIN dossier**, `src/components/admin/CandidateProfileModal.tsx` (legacy ground truth `js/admin_modal/cv.ts` `#modal-cv`, per `docs/archive/HANDOVER.md:1546`). That component already renders `BIODATA KANDIDAT` (`:261`), `Tanggal Lahir` (`:269`,`:367`), `Email` (`:270`,`:371`), `Alamat` (`:271`,`:375`), and a `cv_jobs_header` jobs block (`:447`). The string `ASJ DOSSIER` itself is `master.form_brand` (`i18n.ts:1749`) rendered by `MasterFullForm.tsx:596`. **So the owner's "ASJ DOSSIER card" is the admin dossier, not the candidate dashboard** — the candidate page has no such card at all; one would have to be built.

**Data available to the candidate page** (`CandidateData`, `CandidateDash.tsx:33-54`; assembled `:224-286`):
`nama, wa, job, tahapan, status, isVIP, isSiswaASJ, kelas, idKandidat, catatanInt, cvMiniProgress, cvMasterProgress, riwayat[], jadwal[], catatan, catatanExt, berkasProgress, berkasTotal, berkasList[], berkas{}, bio{}, cvmini{gender,usia,tb,bb,pendidikan,jftText,sswText}|null, pasPhoto, needRevision, revisionNote, applications[]`.

**Correction to the brief:** the `cvmini` shape is **not** in `src/store/userStore.ts` (that file is Supabase auth only — `isAdmin/isKandidat/displayName/login…`). The shape lives in `CandidateDash.tsx:49` and, as an interface, in `CvMiniModal.tsx:39-48` (`CvMiniPrefill`). The backend row fields come from `mapCandidate` (`netlify/functions/_lib/db/candidates.ts`) and `bio` from `attachBerkasBio` (`netlify/functions/_lib/db/berkas.ts:44-56`).

**Legacy field → data source.**
| Legacy field | Source | Available? |
|---|---|---|
| `ASJ-20250930-1052` | `idKandidat` (`:241`) | ✅ |
| `AGUS KHOCI` | `nama` (`:225`) | ✅ |
| green `LULUS` chip | `status` (`:227`) | ✅ |
| photo tile | `pasPhoto` (`:283`) | ✅ (URL; often `''`) |
| WhatsApp row | `wa` (`:225`) | ✅ |
| Laki-laki | `cvmini.gender` (`:274`) | ✅ |
| 36 Tahun | `cvmini.usia` (`:275`) | ✅ |
| 165 / 57 | `cvmini.tb` / `cvmini.bb` (`:276-277`) | ✅ |
| SMK | `cvmini.pendidikan` (`:278`) | ✅ |
| birth-date row | `bio.tgllahir` (+`bio.tmplahir`) — `BIO_COLUMNS` `berkas.ts:46-47` | ✅ |
| email row | `bio.email` — `berkas.ts:45` | ✅ |
| address block | `bio.alamat` — `berkas.ts:48` | ⚠️ **single string**, no structured 3 lines |
| `JFT N3` | `cvmini.jftText` (`:279`) | ✅ |
| `MANUFACTUR` chip | — | ❌ **NO field** (closest: `cvmini.sswText` / `riwayat.kategori` / `job`) |
| `JOB / BIDANG YANG DILAMAR` | `job` = `row.idLoker` (`:226`) | ⚠️ job code only; no "bidang" category |
| `DOWNLOAD FULL BIODATA` | — (feature) | ✅ feature exists: `showRirekisho` / `RirekishoBuilder` (`:535`, `:655`) |
| `VERIFIED CANDIDATE` badge | — | ❌ **no verification record** (only `isVIP`/`isSiswaASJ` as a proxy) |

**What CANNOT be built for lack of data (report, do not invent):**
1. **`MANUFACTUR` / the "bidang" (field-of-work) label** — no column exists in the candidate row or `bio`. Closest proxy is `cvmini.sswText` or `riwayat.kategori`, neither of which is the same datum.
2. **A structured multi-line address** — only one `bio.alamat` string exists; a 3-line layout would have to re-split one blob.
3. **A "VERIFIED" verification record / verified-at / verified-by** — nothing verifies a candidate; the only related flags are `isVIP`/`isSiswaASJ`.
4. **The card itself on the candidate page** — `CandidateDash` renders no dossier card; it must be built from scratch.
5. Edge cases to honour: `cvmini` is `null` whenever `row` is falsy (`:272`), and `CandidateData.cvmini` deliberately omits `nama` (name comes from `data.nama`), unlike `CvMiniPrefill.nama`.

---

## D4 — CV template is admin-only, and the "Update Profil" copy

### D4a — "Pilih Template CV" must be ADMIN-ONLY

**Sites that must move together.**
- **Candidate side (REMOVE):** `src/components/candidate/CandidateDash.tsx:534` (the button `t('button.pilih_template_cv')`), `:654` (`{showCvTemplateSelector && <CvTemplateSelector … isAdmin={false} …>}`), and the state at `:166` (`const [showCvTemplateSelector, setShowCvTemplateSelector] = useState(false);`). Its `waTarget={user?.wa || data.wa}` is candidate-scoped.
- **Admin side (KEEP):** `src/components/admin/TabPelamar.tsx:233` (the button), `:261` (`isAdmin={true}`), `:61` (state).
- **Shared component (KEEP):** `src/components/CvTemplateSelector.tsx:22` — `function CvTemplateSelector({ waTarget, isAdmin, onClose, onOpenRirekisho })`. The `isAdmin` prop already exists, so the admin path needs no change.
- **i18n (KEEP):** `button.pilih_template_cv` — `i18n.ts:1743`, `i18n-jp.ts:1600` (admin still uses it; do **not** orphan it).
- **Tests:** `src/components/CvTemplateSelector.test.tsx:54` renders the component directly (unaffected by removing the candidate entry point). `src/components/candidate/CandidateDash.test.tsx` does **not** assert the template button or the update button (grep found no such assertions) — so removing them does not break a test, and adds no regression guard either.
- **Docs:** `docs/ASTRO_PIPELINE_REFERENCE.md:96` ("tombol `Pilih Template CV` di CandidateDash dan TabPelamar"), `docs/UI_DESIGN_REVIEW.md:281-282`, `:806`, `:828`.

### D4b — the copy change ("Update CV Mini" → "Update Profil")

**Establishing completeness.**
- Value changed in the worktree: `src/store/i18n.ts:589` `"ui.update_cv_mini": "Update Profil"`, `src/store/i18n-jp.ts:664` `"ui.update_cv_mini": "プロフィール更新"`.
- **Consumers of the key (both render the KEY, so both changed at once):** `CandidateDash.tsx:528` (the dashboard button) and `CvMiniModal.tsx:131` (the modal `<h3>`). Note this means the **modal header also now reads "Update Profil"** — intended or not, the shared-key change silently retitled the dialog too.
- Test updated: `src/CvMiniModal.test.tsx:78` now expects `'Update Profil'`.
- No literal `"Update CV Mini"` remains anywhere in `src/` (grep: only `docs/archive/*` and `docs/archive/KEPUTUSAN_DUA_ITEM_2026-09-17.md:20`).
- **Verdict: the copy change IS complete in `src/`.** Nothing else renders the literal.

**Every site that must move together if the KEY is renamed** (the key name `ui.update_cv_mini` is now semantically stale — it says `cv_mini`, the value says "Profil"):
1. `src/store/i18n.ts:589`
2. `src/store/i18n-jp.ts:664`
3. `src/components/candidate/CandidateDash.tsx:528`
4. `src/components/CvMiniModal.tsx:131`
5. `src/components/CvMiniModal.test.tsx:78`
(No e2e gate references the key; `i18n.keys.test.ts` would stay green either way, since it only checks used→present.)

**Related copy NOT touched by the diff, and inconsistent if the feature is being renamed to "Profil":** `ui.save_cv_mini` = `"Simpan CV Mini"` (`i18n.ts:717`) and `ui.toast_cvmini_updated` = `"CV Mini Berhasil Diperbarui!"` (`i18n.ts:746`), plus `ui.master_update_hint` (`:590`). `CvMiniModal.tsx:183` still renders `t('ui.save_cv_mini')` ("Simpan CV Mini"), and `CvMiniModal.test.tsx:56,80` still assert `'Simpan CV Mini'`. Flag these to the product reviewer: the header says "Update Profil" while the save button still says "Simpan CV Mini".

---

## What I could NOT determine

1. **Whether `npm run build` regenerates `dist/` cleanly** — not run (sandbox quota / unreliable `npm`). D1's fix is proven correct in source and via the `z-sticky` namespace proof, but it is **not** in any servable artifact yet; every e2e gate measures the served `dist/`.
2. **The exact runtime z-index of the header** — measured only from source: `App.tsx:298` has no z-index class and `--z-index-header` is unused. I could not confirm in a live browser (no build/server), but static reading is unambiguous.
3. **Whether the owner wants a candidate-facing dossier built from scratch, or the admin dossier (`CandidateProfileModal.tsx`) restyled** — D3's card does not exist on the candidate page at all; the legacy card's ground truth is the admin `#modal-cv`. This is a product decision, not a measurement.
4. **The authoritative source for the `MANUFACTUR`/bidang label and for a "VERIFIED" flag** — no column exists; needs an owner/DB decision (see D3 §"cannot be built").
5. `docs/LANDING_PAGE_SPEC.md` §5.1 is itself **stale** vs. the shipped `SiteNav.astro` (it still says four items, a hidden Layanan tab, and an ID/JP picker on the right, whereas the shipped nav has six items, no tab, and no language control). Recorded rather than fixed.
