# ASJ Portal — plan review, design system, and four owner-reported UI defects

**Date:** 2026-09-25
**Scenario:** Full delivery — plan review → design system → code → QA (`product-reviewer` → lead implementation → `qa-lead`)
**Members:** 产品官 `product-reviewer` · 设计师 `designer` · 排障手 `investigator` · 质量门神 `qa-lead`
**Repo:** `F:\astro` · base `7422bce` → HEAD `2405849` · 6 commits, **none pushed** (8 ahead / 0 behind `origin/main`)

---

## 📌 TL;DR

- **Overall: 🟡 Conditional Go.** All four defects are fixed, committed, and **independently confirmed** by QA — every claim re-measured, none taken on trust. Nothing is blocked for a feature branch.
- **⚠ ADDENDUM (`2e500b7`): a real leak was found and fixed.** The candidate dashboard was rendering its "Pesan dari Admin" box from **`catatan_admin`** — an admin memo — and never showed **`catatanExt`**, the note written *for* the candidate. See §0. The dossier card was also re-matched to the legacy candidate view, and the five admin-only blocks are now enumerated **and tested**.
- **Blocking item count: 2** — (1) the card is verified in a real browser in **both themes** against a **stubbed backend**, so live-data rendering is still unproven; and (2) `main` must not be pushed, so none of this is deployed until you say so.
- **The honest test number is `164/167 files`** — the reds are environment-forged (`spawnSync EBUSY`), each reproduced in isolation by QA, and the test-level count varies (3↔9) with the sandbox's budget. A fully green run exists but only with the sandbox bypassed; **do not quote it as the normal result.**
- **QA corrected the lead twice** and both corrections were right — one of them a factual error in a shipped code comment, now fixed in `398080d`.
- **Two decisions are already answered by you** (delete the whole band incl. the marquee; the `/loker` link lives in the hamburger; admin stays admin). **Two remain** — the ID-plate format, and whether the admin dossier should be rebuilt on the same card.
- **One thing the plan review found that nobody asked about:** five commit hashes cited as measurement bases in `LANDING_PAGE_ROADMAP.md` / `LANDING_PAGE_SPEC.md` **do not exist** in this repository. Every "measured at `<hash>`" number in §L8.5 is therefore unverifiable.

---

## 0. ADDENDUM — "lihat legacy saja, kira-kira samain" (commit `2e500b7`)

Your answer to *"panel yang mana?"* was: look at legacy and match it, because the
admin panel stays admin and there is private data that may only live there. That
turned into three pieces of work, and **one of them found a real leak**.

### 🔴 The leak: the candidate was reading the admin's memo

The dashboard's **"Pesan / Evaluasi dari Admin"** box rendered `data.catatan`, and
`mapCandidate` maps `catatan` from the **`catatan_admin`** column
(`_lib/db/candidates.ts:65`) — an admin table memo written by `EditCandidateModal`
(`contexts/registry/service.ts:24`). Legacy fed that box from **`catatanExt`**
(`js/engine/init.ts:449`), and `catatan_external` is a live column the admin
writes (`service.ts:39,57,112`).

So the candidate saw the **admin's internal memo**, and **never** saw the note
written *for* them. Both a leak and a missing feature. Fixed to `catatanExt` only,
with **no fallback** to `catatan_admin` — the repo's own `catatanExt || catatan`
convention is documented for the **admin export column**, not for a
candidate-facing surface. Guarded in both directions, so "no leak" cannot pass on
an empty box.

**No unit test in the repo was asking this question.** It was found by a browser
probe that put marked text in `catatan` and looked for it in the DOM.

### The card now matches the legacy dossier's candidate half

Legacy had ONE dossier — `#modal-cv` (`assets/modals-shared.html:95`) — driven by
ONE function `bukaDigitalCV(id)` (`js/admin_modal/cv.ts:18`), opened by **both**
roles. The candidate reached it via the button *"Lihat Profil Digital CV Saya"*.
The card now reproduces the candidate-facing half: logo + wordmark + subtitle +
sky check; photo tile with the ID pill and a **STATUS & TAHAPAN** box; name with
badges; WhatsApp row; the identity grid with Ttl/Email/Alamat full width; the
JFT/JLPT and SSW/BIDANG tinted tiles; the jobs block; the outline-emerald CTA.

The "Profil" button was removed — legacy has no such button, and it opened the
same modal the action grid already opens.

### The admin-only blocks are enumerated and tested, not just omitted

Legacy gated **five** blocks behind `isAdmin` / `isAdmin && isLolos`. All five are
now listed in the component header with line numbers, and a test asserts the
candidate dashboard renders none of their markers:

| Block | Gate | Legacy line |
|---|---|---|
| `cv-pass-row` — Password Kandidat | `isAdmin` | `cv.ts:145` |
| `btn-cv-edit-cepat` — EDIT DATA CEPAT | `if (!isAdmin) return` | `cv.ts:396` |
| `btn-cv-dokumen/jft/ssw` + `cv-inline-preview` | `isAdmin` | `cv.ts:252-278` |
| `cv-pemberkasan-area` — BUKA CV/JFT/SSW/FOTO/**KTP** + Drive folder | `isAdmin && isLolos` | `cv.ts:312` |
| `cv-admin-notes-area` — VIP toggle + Catatan Internal (Private) | `isAdmin` | `cv.ts:283` |

**BUKA KTP is why `nik` is not a prop on the card.** The guard was proven able to
fail by leaking `ui.note_internal` into the dashboard — red, naming the leaked
surface, other 25 tests green.

One correction to my own first attempt: `ui.complete_berkas_biodata` is **not**
admin-only. It renders on the candidate dashboard because document upload is a
**candidate** feature — legacy exports `bukaModalPemberkasan` from
`js/03_candidate.ts:473`, not from `admin_modal/`. My first assertion included it
and went red, which is the test doing its job on the test author.

### Seen in a real browser, both themes

The route is `client:only`, so none of this exists in `dist/*.html` — it can only
be seen in a browser. With a fabricated session and a stubbed backend, at 1280px:

- **Dark** and **light** both render the full card: `ASJ DOSSIER` /
  `VERIFIED CANDIDATE` / `ASJ00159` / `STATUS & TAHAPAN` / `MCU · LULUS` / 9 grid
  labels / both tiles / the jobs block / the CTA.
- `nik` **does not** leak; `catatan_admin` **does not** leak; `catatanExt`
  **does** appear; no admin markers; no "Profil" button; **0 page errors**.
- Light theme had been flagged as unverified — it is now measured, and the legacy
  tint classes are shimmed correctly.

---

## 🎯 Core conclusion card

| Item | Content |
|---|---|
| Go / No-Go | 🟡 **Conditional Go** (feature branch) · 🔴 **No-Go for `main`** until the card is seen with live data |
| Severity spread | 🔴 1 · 🟠 3 · 🟡 4 · 🟢 7 |
| Key actions | 8 |
| Suggested owner | You (3 decisions) · lead (2 follow-ups) · nobody (3 already done) |
| Net diff | 29 files, **+801 / −998** lines |

---

## 1. Member conclusions

### 🔍 产品官 (plan review)
- **Judgement:** the plan is still usable, but three of its load-bearing claims are now **false or unverifiable**: `/` no longer carries `LokerTable` (`:38-40`), the "desktop nav must live inside the existing `<nav>`" instruction (`§2.3`) was already consciously rejected on geometry, and the `§L8.5` measurement numbers cite dead hashes.
- **Key advice:** answer the `/loker` reachability question *before* touching markup — it decides whether the `LOKER_ROUTE` rule is **changed** or **deleted**, and guessing means writing it twice. It also flagged that the marquee is the admin's announcement channel, so deleting it is a **product** decision, not a cleanup — you confirmed you wanted it gone.

### 🎨 设计师 (design system + dossier spec)
- **Judgement:** the design system already exists as a **token layer** (`theme.css @theme`, 5 radius + 11 colour + 9 type tokens) — it does not need to be invented. The legacy dossier card maps onto it almost field-for-field, and **every label it needs is already translated** (`ui.cv_gender`, `ui.jtt_jlpt`, `ui.ssw_field`, `ui.cv_download_biodata`…), so the card needed only 3 new keys.
- **Key advice:** do **not** copy the legacy card literally. Four of its slots have **no data source**: the `flag`/`seal` glyphs are not in the icon sprite at all (`Icon` renders nothing for an unknown name, silently), the `ASJ-YYYYMMDD-HHMM` plate format is produced by no code path, the `LULUS (LULUS)` chip is a rendering artefact (one value printed twice), and "VERIFIED" has no column behind it.

### 🔧 排障手 (root cause)
- **Judgement:** all four defects reproduced, with exact `file:line` and measured mechanisms. Two of them were **already half-fixed in the working tree** and uncommitted — the hamburger scrim fix (`App.tsx` private `Z_INDEX` map, scrim 35 vs `z-sticky` 50) was sitting there from an earlier session with nothing built against it.
- **Key advice:** deleting the band is **not** a deletion — `SiteNav.astro:105` was the **only** `href="/loker"` in the entire site, and `e2e:landing`'s `LOKER_ROUTE` rule exists precisely to catch that. It also warned that a `for (const x of SET)` gate check goes vacuous when the set empties.

### ✅ 质量门神 (QA)
- **Judgement:** see §5. (Independent verification of the six claims, re-run rather than read.)

---

## 2. Consolidated findings, by severity

| # | Severity | Area | Location | Finding | Source |
|---|---|---|---|---|---|
| 1 | 🔴 | Delivery | `src/components/candidate/AsjDossierCard.tsx` | **The card renders, but only against a stubbed backend.** `/candidate` is a `client:only` gated SPA, so it appears in no `dist/*.html`; QA reached it by fabricating a session and stubbing the API. That proves the card *renders* (0 page errors, all fields, `nik` not leaked) — it does **not** prove it renders correctly with live data. | 质量门神 |
| 2 | 🔴 | Process | `main` | **Nothing is deployed and must not be** — 7 commits are local-only by your standing rule. | lead |
| 3 | 🟠 | Plan integrity | `LANDING_PAGE_ROADMAP.md:3,75,334-370`; `LANDING_PAGE_SPEC.md:4,270,284` | **Five cited commit hashes do not exist** (`41e64cc`, `238748c`, `1e9f6fb`, `e9317cf`, `3c12e51` — all `Not a valid object name`). Every "measured at `<hash>`" figure in §L8.5 is unverifiable. | 产品官 |
| 4 | 🟠 | Duplication | `CandidateDash.tsx` | The dossier card now sits **above** the old welcome panel. Nothing was lost, but the page has two identity headers until you decide to collapse the old one. | lead |
| 5 | 🟠 | Admin drift | `admin/CandidateProfileModal.tsx` | The admin dossier is a **second, hand-maintained rendering of the same 16 fields** — the exact duplicate DESIGN.md §5.5 warns about. Extracting the card for both was recommended and deliberately **deferred** (scope). | 设计师 |
| 6 | 🟡 | Correctness of a comment | `src/styles/theme.css` | The scrim comment claimed it must beat "the header (90)"; the header has **no** z-index and `--z-index-header` is applied by nothing. **Fixed in `398080d`** — QA caught it, the lead verified it with `grep -rn z-header src/`. | 质量门神 |
| 7 | 🟡 | Data honesty | `AsjDossierCard.tsx` | `VERIFIED CANDIDATE` and the round check are **decoration** — you said so yourself ("game fikasi… cuma buat looks"). There is no verification column. Recorded in the file so nobody later mistakes it for an audit record. | 设计师 |
| 8 | 🟡 | Data honesty | `AsjDossierCard.tsx` | The `ASJ-YYYYMMDD-HHMM` ID plate format is **not buildable**; the real `idKandidat` (`ASJ00159`) is shown as-is. A client-side date would fabricate an identifier. | 设计师 |
| 9 | 🟡 | Contrast | `theme.css` border tokens | `border-line-strong` is **1.93:1** (dark) / 1.54:1 (light) against the card — below the 3:1 UI floor. Accepted as decorative, because the eyebrow label and value are both legible on their own (4.79:1 and 13.35:1). | 设计师 |
| 10 | 🟢 | Fixed | `e2e/test-dialog.mjs` | `e2e:dialog` was red — a **30 s `page.click` timeout**, not a red assertion, because `[data-nav-login]` was a test hook living on the deleted section bar. Hook moved to the drawer's login button; gate now opens the drawer first. 17/17. | lead |
| 11 | 🟢 | Fixed | `e2e/test-landing.mjs` | `lint-ratchet` was **already red at HEAD before this session** — the diagnostic arrived in `5a87756` (2026-09-25) while the frozen baseline was last written 2026-09-22. Repaired at source, **baseline blob untouched**. | lead |
| 12 | 🟢 | Fixed | `src/pages/index.astro` | Two self-inflicted gate reds from writing the deleted thing into a comment: the indexer parses `.astro` comments as markup (unresolved `<SiteNav>` ref), and `i18n.keys.test.ts` counts a key named in a comment as *used*. Both recorded in the comments themselves. | lead |
| 13 | 🟢 | Fixed | `indexer/src/*.test.ts` | Four frozen counters moved by **measured** deltas, one at a time — they share a single `it()`, so vitest's abort-at-first-failure hides the rest. | lead |
| 14 | 🟢 | Verified | whole repo | `tsc` 0; `verify:classes` PASS; `lint-ratchet` PASS; `verify:md` PASS; `verify:review-manifest` PASS; 8/8 e2e gates. Suite: **164/167 files, 1961/1964 tests**, the 3 reds proven environmental one at a time. | 质量门神 |
| 15 | 🟢 | Verified | `e2e:landing` | The `LOKER_ROUTE` region and the re-anchored M6 were **both proven able to fail** by mutation → rebuild → red → byte-identical restore → green. | lead |
| 16 | 🟢 | Verified | `/` navigation | A **logged-out** visitor reaches `/loker`: no session, drawer closed at `x=1280`, opened at `x=896`, link visible 336×46 px, click lands on `/loker` with the table. | lead + 质量门神 |

---

## 3. Delivery checklist (full-delivery scenario)

### Code changes

| Commit | What changed |
|---|---|
| `0e25dd9` | **Drawer scrim.** One z-scale in `theme.css @theme` (`--z-index-scrim: 95`, between header 90 and drawer 100); `App.tsx` drops its private `Z_INDEX` map. Also the copy you asked for: `ui.update_cv_mini` → "Update Profil" / "プロフィール更新". |
| `73b8f97` | **The band is gone.** Marquee + live-vacancy strip + section bar deleted from `/`; `SiteNav.astro`, `e2e/test-site-nav.mjs`, `e2e/measure-site-nav.mjs` deleted with it. The site's only `/loker` link moved into the drawer's always-visible block. 7 orphaned i18n keys removed from **both** dictionaries. |
| `ef081f5` | **Template CV is admin-only.** Candidate button/state/import/modal-render removed; admin path untouched; new guard test with a positive control. |
| `3b1c069` | **Two gate repairs** — the `data-nav-login` hook moved to the drawer, and the pre-existing `lint-ratchet` red fixed at source. |
| `bbbeca2` | **The dossier card.** New `AsjDossierCard.tsx` + 8 fields read out of the row that were already there + 3 guard tests. |
| `2405849` | **Docs and comments** that still described the deleted band or named deleted keys. |

### Test coverage added

| Guard | Can it fail? | Proof |
|---|---|---|
| Candidate dashboard offers **no** `button.pilih_template_cv` (positive control: the adjacent Preview button must exist) | ✅ | Re-adding the button → `expected <button data-probe="true"></button> to be null`, other 21 tests stayed green |
| **`nik` never reaches the candidate surface** (positive control: the email/address rows must render) | ✅ | Plumbing `nik` through → `expected '…ASJ-001…' not to contain '3512345678901234'` |
| Card renders brand / verified / ID / edit / CTA | ✅ | Red under the mutation above |
| Rows without a value are **omitted**, not printed `-` | ✅ | Positive control requires rows *with* values to render |
| `/loker` reachable from the drawer region (`e2e:landing`) | ✅ | Full mutation + rebuild + restore, measured red then green |
| Login modal keeps `role`/`aria-modal`/focus on a **second** open (`e2e:dialog`) | ✅ | Pre-existing guard, now re-pointed; measured `open#1`/`open#2` both correct |

**Two guards were strengthened because their first version passed under a mutation.** The `nik` guard initially passed while `nik` *was* rendered, because the row group is guarded by `(ttl || email || alamat)` and the fixture had no `bio` — so the block never rendered. That is recorded in the test.

### Release checklist

- [x] `vitest run` — **164/167 files**; the 3 red files are environmental, each isolated and attributed (test-level count varies 3↔9 by sandbox state — quote the file count)
- [x] `tsc --noEmit` — exit 0
- [x] `verify:classes` — every checked class has a rule
- [x] `lint-ratchet` — PASS, baseline blob `393c09a5…` unchanged
- [x] `verify:md` — 71 files
- [x] `verify:review-manifest` — PASS
- [x] 8/8 e2e gates: `public`, `loker-layout`, `headings`, `landing`, `theme-gradients`, `dialog`, `drawer`, `labels`
- [x] Frozen indexer inventory consistent: 277 ts + 102 tsx + 20 astro + 70 mjs + 6 cjs + 20 js = **495**
- [x] Independent QA re-ran every claim and confirmed all four, and corrected the lead twice
- [ ] **Freeze the tree** and re-run the gates once, with no mutation in flight
- [ ] **Push to a feature branch** (not `main`)
- [ ] **See the dossier card with live data** — QA proved it renders against a stub
- [ ] Owner review of the three open decisions

### Rollback plan

Every change is **6 local commits on `main`, none pushed**, so rollback is `git reset --hard 7422bce` with no remote consequence and no deployed artifact to unwind. Per-commit revert is also clean because the commits are one concern each. The two deleted files (`SiteNav.astro`, `test-site-nav.mjs`) are recoverable from history; note that `git rm` was deliberately **not** used (it has destroyed whole directories in this repo twice) — deletion was `unlinkSync` + `git add`, and both parent directories were verified to survive.

---

## 4. Action list

| # | Action | Owner | Urgency | Expected |
|---|---|---|---|---|
| 1 | See the dossier card **with a real candidate row** — it is verified in both themes against a **stub**; live-data rendering is still unproven. | you | **P0** | before any push |
| 2 | ~~Which panel to remove?~~ **ANSWERED — nothing further to remove.** Checked against legacy `#page-kandidat` (`F:/tmp/portallegacy/index.html:408-520`): every remaining block (VIP student card, CV progress, jadwal, admin-message box, "Status Lamaran Terkini", the action grid) **is in legacy**. The two things that were NOT — the extra "Profil" button and the inline card — are now removed / replaced by the card you asked for. The one judgment call left: legacy ALSO opens with a welcome header (`fa-id-card` + "Selamat Datang" + a job/stage pill), which the card now replaces. Restoring it would duplicate the card's name + STATUS & TAHAPAN. | — | closed | — |
| 3 | Decide whether the **admin dossier** (`admin/CandidateProfileModal.tsx`) is rebuilt on the same presentational card. You ruled the admin panel stays admin, which this does **not** change — it only removes a hand-maintained duplicate of the same 16 fields. **No action needed for correctness.** | you | P2 | whenever |
| 4 | Decide the **ID-plate format**: keep the real `ASJ00159`, or commission a server-side `ASJ-YYYYMMDD-HHMM` generator. A client-side date would fabricate an identifier. | you | P1 | next session |
| 5 | **Fix the dead hash citations** in `LANDING_PAGE_ROADMAP.md` §L8.5 and `LANDING_PAGE_SPEC.md` — either re-measure at HEAD or mark the numbers unverifiable. Do not let them be quoted as fact. | lead | P1 | next session |
| 6 | **Before cutting a release: freeze the tree and re-run the gates once.** Confirm no mutation battery is running — QA's first `labels` run was corrupted by one in flight. | you / lead | **P0 at release** | at release |
| 7 | Run `e2e/test-landing.mutations.sh` in full and `verify:batteries` **outside the sandbox**. M6/M8 were proven by hand; the other ten were not. | lead | P2 | when convenient |
| 8 | Push the eight commits to a **feature branch** so CI can run them. | you | P2 | whenever |

---

## 5. Verification

### 5.1 Independent QA verdict — `质量门神` (`_part-qa.md`)

**CONDITIONAL-GO. All four claims CONFIRMED by independent re-run**, and QA went
further than the brief on C3.

| Claim | QA verdict | The measurement QA took |
|---|---|---|
| C1 drawer scrim | **CONFIRMED** | `z-scrim{z-index:var(--z-index-scrim)}` IS generated; `--z-index-scrim:95` sits between header(90)/drawer(100). Real browser, 1280px, drawer open: scrim 95, drawer 100, and an **`elementsFromPoint` sweep between them returns nothing** (`between:[]`). The header's topmost element at its centre **is** the scrim — i.e. the header really is dimmed. `#asj-overlay-root` absent; sakura `z=1`; `.u-modal-shell` carries no z-index. Only `.skip-link` (z 999) is higher, and it is translated to `top:-48px` (off-screen until focused, by design). |
| C2 band + `/loker` | **CONFIRMED** | All five markers 0 in `dist/index.html`. Exactly **1** `href="/loker"`, inside `nav[aria-label="Primary navigation"]`, visible and clickable **with no session** — it sits ABOVE the `{hydrated && !u.isLoggedIn}` guard (`App.tsx:641` vs `:645`). Marquee still on `/public`. `LOKER_ROUTE`'s region names the drawer and can fail. |
| C3 dossier card | **CONFIRMED — and stronger than briefed** | `CandidateDash.test.tsx` 25/25 exit 0; all three guards have positive controls; no code path renders `nik`. **QA rendered the card in real Chromium** (fabricated `asj_auth` session + stubbed backend): `ASJ DOSSIER` / `VERIFIED CANDIDATE`, `ASJ-001`, the name, "Update Profil" and "Download Biodata" all render, `nik` is NOT leaked, "Selamat datang" is gone, **0 page errors**. Screenshot: `.tmp-qa/dossier-real-browser.png`. **Caveat: the backend was stubbed**, so this proves the card renders, not that it renders with live data. |
| C4 admin-only | **CONFIRMED** | Candidate side clean; `TabPelamar.tsx:21,61,233,261` intact with `isAdmin`; key in **both** dictionaries; guard has a positive control; `CvTemplateSelector` still used. |

### 5.2 ⚠ Two corrections to the lead's summary — QA was right on both

1. **The full suite is NOT "167/167, exit 0".** Both QA and the lead independently
   measured **164/167 files**, and **the test-level count differs between runs**:
   QA saw **3 failed / 1961 passed**, the lead's own re-run of the identical tree
   saw **9 failed / 1955 passed**. Both are correct — the extra failures are in
   `fcm-server.test.ts`, whose whole "service-account resolution" describe spawns
   `git` and fails as a block once the sandbox budget is spent. **The invariant is
   the 3 red FILES, not a test number.**
   The three files: `discover.test.ts` → `spawnSync cmd.exe EBUSY`;
   `boundary.test.ts` → depcruise exits `null`; `fcm-server.test.ts` → spawns
   `git`. **And on the third one QA proved the code is CORRECT**: running
   `git check-ignore -q .../firebase-service-account.json` from a shell returns 0
   (ignored), so the `.gitignore` rule the test asserts really does hold — the
   test fails only because it cannot spawn `git` from Node in this sandbox.
   *The lead's earlier `167/167 exit 0` was real, but it came from a run with the
   sandbox bypassed — a privileged condition that must not be quoted as the
   normal result.*
2. **"the header (90)" was wrong.** The header has **no** z-index (`auto`), and
   `--z-index-header` is applied by nothing in `src/`. That claim had been shipped
   in the `theme.css` comment; it is now corrected in `398080d` — see §5.4.

### 5.3 What the lead measured directly (tree at HEAD, re-runnable)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit -p tsconfig.json` | exit 0 |
| Class verifier | `node scripts/ci/verify-classes.mjs` | PASS — 1197 tokens in 215 files, every checked class has a rule |
| Lint ratchet | `node scripts/ci/lint-ratchet.mjs` | PASS — "debt reduced by 10"; baseline blob `393c09a5…` **identical** to before this session |
| Markdown tables | `node scripts/ci/check-md-tables.mjs` | PASS — 71 files |
| Review manifest | `node scripts/ci/verify-review-manifest.mjs` | PASS |
| Frozen inventory | `node … vitest.mjs run indexer/src/count-indexed.test.ts` | 277 ts + 102 tsx + 20 astro + 70 mjs + 6 cjs + 20 js = **495** |
| e2e ×8 | `public loker-layout headings landing theme-gradients dialog drawer labels` | **all exit 0** |
| Logged-out `/loker` reachability | real Chromium, no session, 1280×900 | drawer closed at `x=1280`, opened at `x=896`, link **visible** 336×46 px labelled "Lowongan", click → `pathname === "/loker"` with a `<table>`. Exactly 1 link on the page. **PASS** |
| `LOKER_ROUTE` can fail | mutate drawer link → rebuild → run | red at both widths: *"the drawer (hamburger menu) no longer links to /loker"*, exit non-zero. Restored byte-identically → green |
| re-anchored M6 can fail | mutate footer `#fasilitas` → rebuild → run | red at both widths: *"1 in-page link(s) point at a fragment that does not exist: #fasilitas-tidak-ada"*. Restored → green |

### 5.4 Corrections made *because* QA pushed back

- **`398080d`** — the `theme.css` scrim comment no longer claims it must beat
  "the header (90)". It now names only the layers that exist and cites QA's
  `elementsFromPoint` measurement. A comment whose job is to make the stacking
  order legible is exactly where a wrong claim does the most damage.

### 5.5 Integrity condition QA attached

QA's first `e2e:labels` run was corrupted (404s) because **the lead's own M6
mutation was in flight at the same time** — `Footer.astro` was briefly mutated and
`dist/` was rebuilt twice mid-session. It was restored byte-identically and the
tree is clean at `2405849`, but QA is right to attach a condition: **do not run
mutation batteries concurrently with a release verification.** Before cutting a
release, confirm no mutation is in flight and re-run the gates once on a frozen
tree.



---

## ⚠️ Known limitations

- **The dossier card is verified with a STUBBED backend, not live data.** QA did render it in real Chromium (fabricated session, stubbed API): it shows `ASJ DOSSIER` / `VERIFIED CANDIDATE`, the ID plate, the name, "Update Profil" and "Download Biodata", leaks no `nik`, and throws 0 page errors. What remains unproven is that it looks right **with a real candidate row** — in particular which rows appear, since rows without values are omitted by design.
- **`/candidate` is not covered by any e2e gate.** No gate in this repo measures a gated candidate page, which is why the defect class you reported ("profil kok gini") cannot be caught by CI today. That is the structural gap behind the first limitation.
- **The suite is not fully green without a bypassed sandbox.** `164/167 files, 1961/1964 tests`; the 3 reds are `spawnSync EBUSY` environment artefacts, each reproduced in isolation, and QA proved the `fcm-server` assertion's *subject* is actually correct (`git check-ignore` returns 0 from a shell). Treat 3 red as the honest baseline.
- **The mutation batteries were not run end to end.** `e2e/test-landing.mutations.sh` M6/M8 were re-anchored (to the footer nav and the drawer) and **both were proven able to fail by hand** — mutation, rebuild, measured red, byte-identical restore, measured green. The other ten mutations in that battery, and `verify:batteries` as a whole, were not executed: each needs a full rebuild, and the sandbox delete quota forges their verdicts. Run them outside the sandbox before the next release.
- **⚠ DO NOT run a mutation battery at the same time as a release verification.** QA's first `e2e:labels` run was corrupted (404s) because the lead's M6 mutation was in flight and `dist/` was rebuilt twice underneath it. The tree was restored byte-identically, but the lesson is QA's and it is a real one: freeze the tree, then verify.
- **`e2e:landing` is in CI but not in the repo's own "definition of done"** — a gate that is red without anyone noticing is a known gap, now closed for this change only.
- **Light theme was not measured in a browser.** The card is theme-aware by construction (tokens only), and the designer computed every pair, but no pixel sample was taken on the new card.
- **`deliverables/` is untracked** — these reports are session artifacts, deliberately not committed to a public repo.

---

## 📚 Member output index

- `gstack-product-reviewer` (产品官): `deliverables/gstack/_part-product-plan-review.md` — plan inventory with `file:line`, the dead-hash audit, ranked contradictions, 6 decisions, 10-step recommended sequence.
- `gstack-designer` (设计师): `deliverables/gstack/_part-design-system.md` + `deliverables/gstack/_mockup-asj-dossier.html` — real token inventory, card anatomy with exact classes, field→source mapping incl. the NO-DATA-SOURCE list, dark/light contrast table, verification plan.
- `gstack-investigator` (排障手): `deliverables/gstack/_part-rootcause.md` — per-defect mechanism, already-fixed-in-worktree status, and the full blast radius (gates, batteries, i18n, docs, frozen counters).
- `gstack-qa-lead` (质量门神): `deliverables/gstack/_part-qa.md` — independent re-run of every claim, the two corrections to the lead's summary, the real-Chromium render of the dossier card (`.tmp-qa/dossier-real-browser.png`), and the freeze-the-tree condition.

---

> This report was produced by the Software Workshop AI team. Review the key decisions with an engineering owner before pushing to `main`.
