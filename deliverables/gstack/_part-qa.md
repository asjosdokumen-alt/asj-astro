# QA verification — ASJ portal, 4 owner-reported defects

**Verifier:** qa-lead (independent re-run; the team-lead's brief was treated as a claim, not a fact)
**Repo:** `F:\astro` (Windows, Git Bash) · **HEAD:** `2405849` (clean; only untracked `deliverables/`)
**Date:** 2026-09-25 · **Method:** source reads + real-browser measurement against a running `astro preview` on `:4321`

> **Headline: all four claims CONFIRMED.** Two things in the team-lead's *summary* are wrong
> (see "Where the brief was wrong"), and a concurrent process mutated the shared working tree
> mid-session (see "Integrity incident"). Neither is a code defect. Final verdict at the bottom.

---

## C1 — the hamburger drawer is no longer broken — **CONFIRMED**

**Command (a) — is the utility actually generated?**
```
$ grep -o "z-scrim{z-index:[^}]*}" dist/_astro/*.css
z-scrim{z-index:var(--z-index-scrim)}
$ grep -o "\-\-z-index-[a-z-]*:[0-9]*" dist/_astro/*.css | sort -u
--z-index-drawer:100
--z-index-header:90
--z-index-loader:9999
--z-index-modal:200
--z-index-popover:300
--z-index-scrim:95
--z-index-sticky:50
--z-index-toast:400
```
`z-scrim` is emitted (not hand-written) and `--z-index-scrim: 95` sits between `z-header` (90)
and `--z-index-drawer` (100). **Confirmed.**

**(b) Can anything still paint above the scrim?** Real browser, 1280×800, drawer OPEN —
swept `document.elementsFromPoint()` across the whole viewport and collected every element whose
effective z-index lies strictly between the scrim and the drawer, excluding the scrim/drawer subtrees:
```
{"step":"C1-open","c1":{"scrimZ":"95","drawerZ":"100",
 "scrimRect":{"x":0,"y":0,"width":1280,"height":800},
 "drawerRect":{"x":896,"y":0,"width":384,"height":800},
 "scrimBg":"rgba(0, 0, 0, 0.7)","between":[],
 "headerTopmost":{"tag":"DIV","cls":"... js-scrim z-scrim","isScrim":true},
 "headerZ":"auto","sakuraZ":"1","sakuraDisplay":"block",
 "overlayRootZ":null,"overlayRootChildren":null,"loaderDisplay":"none"}}
```
- `between: []` — **nothing** paints between the scrim (95) and the drawer (100).
- At the header's centre the **topmost element is the scrim** → the header is dimmed, not bright. The bug is gone.
- `#asj-overlay-root` (`ROOT_Z_INDEX = 1000`) **does not exist in the DOM** while no modal is open → not a factor.
- `#sakura-particles`: computed `z-index: 1`, below the scrim; class list at runtime `fixed inset-0 u-modal-shell overflow-hidden` (the `hidden` class is removed by its deferred module). Not a factor.
- `.u-modal-shell` carries **no z-index** — its only declaration is `overscroll-behavior: contain` (`src/styles/layout.css:131`). Not a factor.
- `#global-loader`: `display: none`. Not a factor.

The only element above the scrim is `.skip-link` (z-index 999) — and it is `transform: translateY(-120%)`
(measured rect `top: -48`), i.e. off-screen until focused. That is a keyboard affordance by design, not a regression.

**(c) Real browser at 1280px:** scrim computed `z-index` **95**, drawer computed `z-index` **100**, and the
drawer is the topmost element at its own centre. **Confirmed — the defect is fixed in the served artifact.**

> **Where the brief overstates:** the commit/brief says the theme scale "put a sticky section bar at 50
> and **the header at 90**". The header carries **no z-index at all** (computed `auto`); `z-header` is
> *defined but unused* anywhere in `src/`. The sticky section bar (`z-sticky`, 50) was real, but it is
> deleted in C2. So the "header at 90" half is not accurate — the fix is still correct, but the stated
> mechanism is wrong. (The team's own `_part-rootcause.md` already records `z-header`/`z-modal`/`z-loader`
> as defined-and-unused.)

---

## C2 — the band below the hero is gone, and `/loker` is still reachable — **CONFIRMED**

**(a) Band markers in the served landing page** (`dist/index.html`) — all absent:
```
data-site-nav        : 0
global-announcement  : 0
live-job-count       : 0
marquee-track        : 0
Navigasi halaman     : 0
```
Browser DOM re-confirmed the same (`C2-dom` step: all `false`, `lokerLinkCount: 1`,
`primaryNavCount: 1`).

**(b) exactly one `href="/loker"`, inside the primary nav:**
```
{"lokerLinkCount":1,
 "lokerLinks":[{"text":"Lowongan","inPrimaryNav":true,
                "navLabel":"Primary navigation","visible":true}]}
```
`grep` over `src/**` finds the link only at `src/components/App.tsx:641`.

**(c) THE IMPORTANT ONE — visible to a logged-out visitor? YES.** Source: `App.tsx:641` renders the
link in the always-visible block; the auth block `{hydrated && !u.isLoggedIn && (…)}` starts at
`App.tsx:645` — i.e. the link is **above** that guard. Browser, **no session**, drawer open:
```
{"present":true,"rect":{"x":913,"y":93,"w":336,"h":46},
 "display":"flex","visibility":"visible","pointerEvents":"auto","text":"Lowongan",
 "topmostAtCenter":{"tag":"A","isSelfOrChild":true}}
```
It is laid out, visible, has pointer events, and is the topmost element at its own centre → **clickable**.

**(d) the marquee is still on `/public`** — `dist/public/index.html` contains `global-announcement`
and `marquee-track`; `e2e/measure-marquee.mjs` and the `marquee-*` rules in `motion.css` were not deleted. **Confirmed.**

**(e) the `LOKER_ROUTE` rule names the drawer and can still FAIL.** `e2e/test-landing.mjs:208-229`
declares exactly **one** region, `name: 'drawer (hamburger menu)'`, selector
`nav[aria-label="Primary navigation"] a[href="/loker"], … a[href^="/loker#"]`. The rule fails if
`regions.length === 0` **or** any region's `count === 0`. Re-ran the gate → **PASS** (`landing: all checks
passed`). Independent non-vacuity proof (DOM-level, no file mutation):
```
{"width":390, "regionBefore":1, "regionAfterRemoval":0, "regionRestored":1,
 "fasilitasResolves":true, "fakeFragmentResolves":false}
{"width":1280,"regionBefore":1, "regionAfterRemoval":0, "regionRestored":1,
 "fasilitasResolves":true, "fakeFragmentResolves":false}
```
Removing the drawer link takes the region count to 0 → the gate goes red. The anchor-resolution
predicate resolves a real fragment and rejects a fake one. **Confirmed.**

Also verified: `SiteNav.astro`, `e2e/test-site-nav.mjs`, `e2e/measure-site-nav.mjs` are deleted
(`git show --stat 73b8f97`: −225 / −436 / −126 lines); the orphan i18n keys
`profile.hero_jobs_live`, `profile.nav_aria` and the five `profile.nav_*` section items are gone from
both dictionaries; `profile.nav_loker` is kept (`i18n.ts:1356`, `i18n-jp.ts:1000`).

---

## C3 — the candidate profile opens with an ASJ DOSSIER card — **CONFIRMED (and verified in a real browser)**

**(a) unit suite:**
```
$ node node_modules/vitest/vitest.mjs run src/components/candidate/CandidateDash.test.tsx
 ✓  frontend  src/components/candidate/CandidateDash.test.tsx (25 tests) 1047ms
 Test Files  1 passed (1)      Tests  25 passed (25)      EXIT=0
```
**25/25, exit 0. Confirmed.**

**(b) are the three new guards real, with positive controls? YES — read line by line:**
1. `'merender identitas kandidat, aksi edit, dan CTA unduh di kartu'` — asserts `dossier.brand`,
   `dossier.verified`, `ASJ-001`, `getAllByRole('button', {name:'ui.update_cv_mini'})` **length 2**,
   and `ui.cv_download_biodata`. An empty/failed render fails this → it is its own positive control.
2. `'TIDAK pernah mencetak nomor KTP (nik)…'` — **positive control first** (`ui.cv_email` and
   `dossier.address_ktp` must be present), then `body.textContent` must not contain the injected
   `3512345678901234`. The fixture carries a real `bio` precisely so the guarded block renders
   (the commit message records that the first version passed vacuously without it).
3. `'baris tanpa nilai dihilangkan; baris yang punya nilai tampil'` — **positive control**
   (`ui.cv_gender`, `ui.cv_usia` present), then `ui.cv_email` / `dossier.address_ktp` / `ui.cv_ttl` absent.
All three have a positive control. **Confirmed.**

**(c) `nik` never rendered.** It is not a prop of `AsjDossierCard` (`AsjDossierCard.tsx:39-75`), and the
component body never references it. Repo-wide `\bnik\b` hits are: the two explanatory comments, the
test, `cv-template-factory/…/tEMPLATE-loader.ts` (an unrelated KTP *pattern*), and a local variable in
`RirekishoBuilder.tsx` (marital-status text, misnamed). No code path renders it. **Confirmed.**

**(d) — the brief expected this to be UNVERIFIED. It is not.** The card is not in
`dist/candidate/index.html` (the route is `client:only`; grep count 0), so it is not in server HTML —
**but I rendered it in a real Chromium** by fabricating the store session (`asj_auth`) and stubbing the
backend (the same technique `e2e/test-labels.mjs` uses to reach gated routes). Result:
```
{"hasBrand":true,"hasVerified":true,"hasId":true,"hasNama":true,"leaksNik":false,
 "hasEditBtn":true,"hasDownload":true,"hasSelamatDatang":false,"pageErrors":[]}
```
The rendered card reads **"ASJ DOSSIER" / "VERIFIED CANDIDATE"**, shows `ASJ-001`, the name, the
`Update Profil` button and `Download Biodata`; the old `"Selamat datang"` greeting is gone; the row
carries `nik` yet the string **does not appear**; zero page errors. Screenshot:
`.tmp-qa/dossier-real-browser.png`. **The visual result IS verified** — with the caveat that the
*backend* was stubbed (no real auth/data path was exercised end-to-end).

---

## C4 — CV template selection is admin-only — **CONFIRMED**

- **Candidate side clean:** `CandidateDash.tsx` has no `button.pilih_template_cv`, no
  `showCvTemplateSelector` state, no `CvTemplateSelector` import and no modal render (grep finds only
  explanatory comments).
- **Admin side intact:** `admin/TabPelamar.tsx` — import at `:21`, state at `:61`, the button
  `t('button.pilih_template_cv')` at `:233`, and the mount `<CvTemplateSelector … isAdmin={true} …>`
  at `:261`.
- **Key present in BOTH dictionaries:** `i18n.ts:1742`, `i18n-jp.ts:1596`.
- **Guard has a positive control:** `expect(getByRole('button', {name:'candidate.btn_preview_cv'}))`
  before `queryByRole(… 'button.pilih_template_cv')` is asserted null, plus a body-text assertion.
  `candidate.btn_preview_cv` is on the same action grid (`CandidateDash.tsx:608`).
- **`CvTemplateSelector.tsx` still used** by `TabPelamar.tsx` and by its own `CvTemplateSelector.test.tsx`.
**Confirmed.**

---

## Also-checked items

| Item | Command | Result |
|---|---|---|
| Full unit suite | `node node_modules/vitest/vitest.mjs run` | **164/167 files, 1961/1964 tests, exit 1** — see below |
| lint-ratchet | `node scripts/ci/lint-ratchet.mjs` | **PASS** ("debt reduced by 10"), exit 0 |
| biome baseline untouched | `git rev-parse HEAD:.ci/biome-baseline.json` vs `7422bce:` | both `393c09a58bebfb0079c330858082934f5c6d7c79`; `git diff 7422bce HEAD -- .ci/biome-baseline.json` **empty** |
| verify-classes | `node scripts/ci/verify-classes.mjs` | **PASS** (1197 tokens / 215 files / 1531 selectors), exit 0 |
| typecheck | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | **exit 0** |
| 8 e2e gates | `node e2e/test-{public,loker-layout,headings,landing,theme-gradients,dialog,drawer,labels}.mjs` | **all 8 exit 0** (landing all-checks, theme-gradients 3/3, dialog 17/17, drawer 7/7, labels 4/4) |
| frozen indexer counters | `node node_modules/vitest/vitest.mjs run indexer/src/count-indexed.test.ts` | `files.length=495`, `tsx=102`, `astro=20`, `mjs=70` (277 ts + 102 tsx + 20 astro + 70 mjs + 6 cjs + 20 js = 495) — **matches** |

**The full-suite number the brief gave is wrong.** It said "167/167 files, 1964/1964 tests, exit 0".
I measured **164/167 files, 1961/1964 tests, exit 1**. The three reds are the documented
environment forgeries, and I verified each is environmental **independently and one at a time**:

1. `indexer/src/discover.test.ts` → `Error: spawnSync cmd.exe EBUSY` (reproduces alone: 1 failed / 10 passed).
   From a shell, `git ls-files --deleted` returns **exit 0**. The subprocess simply cannot run inside the runner.
2. `indexer/src/boundary.test.ts` → `depcruise oracle … (exit null): expected null to be +0`. Exit `null`
   = the child never ran. Same class.
3. `netlify/functions/_lib/fcm-server.test.ts` → `ignored('netlify/functions/secrets/firebase-service-account.json')`
   returned `false`. Re-run alone: still 1 failed / 13 passed. **But from a shell**,
   `git check-ignore -q netlify/functions/secrets/firebase-service-account.json` → **exit 0 (ignored)**,
   and the example file → exit 1. So the `.gitignore` rule is **correct**; the in-process `git` spawn is what failed.

---

## Integrity incident (process, not code)

While I was verifying, a **concurrent process mutated the shared working tree and rebuilt `dist/` twice**:

- `src/components/Footer.astro` was changed `href="#fasilitas"` → `href="#fasilitas-tidak-ada"` (a
  mutation of the landing anchor), and `dist/` was rebuilt from it (index.html 193188 → 193198 bytes).
- This corrupted one of my gate runs: the **first** `e2e:labels` run returned `HTTP 404` on `/apply` and
  `/ai-cv` because `dist/` was being wiped/rebuilt underneath it (transient, not a real failure). Re-run
  after the build settled: **4/4 passed**.
- `indexer/validate-report.json` was also transiently modified (a generated report; the committed copy
  holds a different machine's `rootDir`).

The writer restored `Footer.astro` **byte-identically** and the tree is now clean at `2405849`
(`git status --porcelain` → only `?? deliverables/`). I did **not** make these changes, and I edited no
tracked file. **Action for the team: confirm no mutation battery / rebuild loop is running in the shared
tree at the moment the release is cut.**

---

## Where the brief was WRONG or overstated

1. **Full-suite numbers.** "167/167 files, 1964/1964 tests, exit 0" → actually **164/167 / 1961/1964 /
   exit 1**, with 3 environment-forged reds (each reproduced in isolation and shown environmental).
2. **"the header at 90"** (C1 commit + brief). The header has **no** z-index (`auto`); `z-header` is
   defined but unused. The sticky-bar (50) half was real; the header half is not.
3. **C3 visual verification was not expected to exist — but it does.** The brief predicted the card
   would be UNVERIFIED in a browser. I rendered it in real Chromium (stubbed backend) and it is correct.
4. **8/8 e2e gates are green**, but only after the concurrent rebuild finished; the first `labels` run
   was a mid-build 404 artifact, not a real failure.

---

## Verdict: **Conditional-Go**

The four defects are **fixed and independently reproduced as fixed**; every gate I can run is green on a
clean HEAD (`2405849`) build. Nothing in the code blocks a release. The two conditions are about
*accuracy and process hygiene*, not code:

- **C1 — Do not ship the release note as written.** Correct the two overstated claims: the full suite is
  **164/167 files / 1961/1964 tests** with three **environment-forged** reds (name them), not "167/167
  exit 0"; and drop "the header at 90" from the C1 description.
- **C2 — Freeze the shared tree.** Confirm no concurrent mutation/rebuild process is running when the
  release is cut (this session's `dist/` was rebuilt twice from a mutated `Footer.astro`). Cut the release
  from a build made from a verified-clean `HEAD`.

**Residual (non-blocking) risk to record:** C3's card is visually verified with a **stubbed backend**;
the real authenticated candidate → `getAppData` path was not exercised end-to-end, and `nik` is kept off
the surface by *omission* (no prop, no render), which the unit + browser checks confirm but which has no
data-layer guard preventing a future `nik` prop from being added.
