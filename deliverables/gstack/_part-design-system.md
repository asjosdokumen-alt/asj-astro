# ASJ Portal — Design System & ASJ DOSSIER Card Spec

**Author:** designer (GStack team) · **Date:** 2026-09-25
**Scope:** the owner's two rulings — (1) rebuild the candidate profile as the legacy
**ASJ DOSSIER / VERIFIED CANDIDATE** card; (2) "Pilih Template CV" is an **admin**
feature and must not appear to candidates.
**Basis:** read-only survey of `src/styles/theme.css`, `src/styles/global.css`,
`src/styles/layout.css`, `src/styles/motion.css`, `DESIGN.md`, `docs/UI_DESIGN_REVIEW.md`,
`src/components/ui/*`, `src/components/candidate/CandidateDash.tsx`,
`src/components/CvMiniModal.tsx`, `src/components/admin/TabPelamar.tsx`,
`src/components/admin/CandidateProfileModal.tsx`, `src/store/userStore.ts`,
`src/store/adminStore.ts`, `netlify/functions/_lib/db/candidates.ts` (mapCandidate),
`netlify/functions/_lib/db/berkas.ts` (attachBerkasBio / BIO_COLUMNS),
`netlify/functions/contexts/catalog/service.ts`, `src/icons/sprite-map.ts`.

> **Read contract.** Every token name below is copied from `theme.css`. Every contrast
> ratio is **computed with the WCAG 2.1 relative-luminance formula**, not estimated —
> arithmetic is shown in §4 so it can be re-checked. Where a ratio fails, it says so.
> Nothing here is a "future vision": §3 lists what can be built **today** and §3.3 lists
> what cannot be built **at all**.

---

## 0. The two rulings, resolved

| Ruling | What changes | Where |
|---|---|---|
| Candidate profile = legacy ASJ DOSSIER card | New shared presentational card (§2), rendered inline in the candidate dashboard; the `CandidateData` adapter must carry 8 more fields it already receives but drops (§3.2) | `src/components/candidate/CandidateDash.tsx` |
| "Pilih Template CV" is admin-only | Remove the **candidate** call site only. The i18n key and the component stay (admin uses them) | `CandidateDash.tsx:534` (button), `:654` (render), `:15` (import), `:166` (state) |

**Do not delete `button.pilih_template_cv`** (`i18n.ts:1743`) — `TabPelamar.tsx:233`
renders it for admins. Removing the key would break the admin table and
`i18n.keys.test.ts`.

`CvTemplateSelector` already takes `isAdmin: boolean` (`CvTemplateSelector.tsx:10`), so
the candidate path is `isAdmin={false}` — that single call site is the whole defect.

---

## 1. Token inventory actually available

`@theme static` in `src/styles/theme.css:44-219` is the **only** source of Tailwind
utilities. Anything not in this table does **not** exist and must not be invented.

### 1.1 Colour tokens → utilities

| Token | Dark | Light | Utility | Use for |
|---|---|---|---|---|
| `--color-canvas` | `#020617` | `#ffffff` | `bg-canvas` | page background |
| `--color-surface` | `#0f172a` | `#ffffff` | `bg-surface` | panels, header, flat cards |
| `--color-surface-raised` | `#1e293b` | `#fff7fa` | `bg-surface-raised` | modals, raised cards, **the dossier card** |
| `--color-surface-sunken` | `#000000` | `#fdf2f6` | `bg-surface-sunken` | inputs, wells, **dossier field boxes** |
| `--color-fg` | `#f1f5f9` | `#16121c` | `text-fg` | primary text |
| `--color-fg-muted` | `#94a3b8` | `#514a5c` | `text-fg-muted` | secondary text |
| `--color-fg-subtle` | `#8595aa` | `#726a80` | `text-fg-subtle` | **eyebrow labels**, meta |
| `--color-line` | `#334155` | `#f0dfe7` | `border-line` | hairline dividers |
| `--color-line-strong` | `#475569` | `#dfc4d1` | `border-line-strong` | card / field-box edges |
| `--color-accent` (pink) | `#f9a8d4` | `#be185d` | `text-accent` | identity accent |
| `--color-accent-emerald` | `#34d399` | `#047857` | `text-accent-emerald` | verified / LULUS |
| `--color-accent-sky` | `#38bdf8` | `#0369a1` | `text-accent-sky` | job / info |
| `--color-accent-red` | `#f87171` | `#b91c1c` | `text-accent-red` | critical |
| `--color-accent-amber` | `#fbbf24` | `#b45309` | `text-accent-amber` | warning / schedule |
| `--color-accent-violet` | `#a78bfa` | `#6d28d9` | `text-accent-violet` | legal / formal |
| `--color-brand` | `#10b981` | `#10b981` | `bg-brand` | brand fill (WhatsApp) |
| `--color-brand-fg` | `#04211a` | `#04211a` | `text-brand-fg` | **text ON `bg-brand`** |

**Rule carried from DESIGN.md §3.2:** the `accent-*` tokens are **light** values —
correct as **text and icon colour on a dark surface**, wrong as a solid fill behind
white text. Solid fills use the palette `-600`/`-700` rungs (§1.3).

**Rule carried from DESIGN.md §3.2c / T-02:** `--color-brand` is `#10b981` in **both**
themes. `text-white` on it is **2.54:1 — fails AA**. Pair `bg-brand` with
`text-brand-fg` only (6.69:1), or use `bg-emerald-700` + white (5.48:1, §4).

### 1.2 Non-colour tokens → utilities

| Token | Value | Utility |
|---|---|---|
| `--radius-control` | `0.75rem` | `rounded-control` — buttons, inputs, small chips |
| `--radius-card` | `1rem` | `rounded-card` — cards, **field boxes** |
| `--radius-panel` | `1.5rem` | `rounded-panel` — **the dossier card** |
| `--radius-band` | `2rem` | `rounded-band` — hero, CTA band, footer |
| `--radius-pill` | `9999px` | `rounded-pill` — status chips, round buttons |
| `--text-display` | `clamp(2rem,5vw,3.5rem)` | `text-display` |
| `--text-section` | `clamp(1.5rem,3vw,1.875rem)` | `text-section` |
| `--text-card-title` | `1.25rem` | `text-card-title` |
| `--text-body` | `1rem` | `text-body` |
| `--text-body-sm` | `0.875rem` | `text-body-sm` |
| `--text-eyebrow` | `0.6875rem`, tracking `0.18em` | `text-eyebrow` |
| `--text-caption` | `0.75rem`, tracking `0.02em` | `text-caption` |
| `--z-index-sticky` | `50` | `z-sticky` |
| `--z-index-header` | `90` | `z-header` |
| `--z-index-scrim` | `95` | `z-scrim` — drawer backdrop |
| `--z-index-drawer` | `100` | `z-drawer` — above its scrim |
| `--z-index-modal` | `200` | `z-modal` |
| `--z-index-popover` | `300` | `z-popover` |
| `--z-index-toast` | `400` | `z-toast` |
| `--z-index-loader` | `9999` | `z-loader` |
| `--font-sans` | Inter | `font-sans` (already the preflight default) |
| `--ease-out-expo` | `cubic-bezier(0.16,1,0.3,1)` | **no utility** — CSS var only (see §1.4) |
| `--default-transition-duration` | `180ms` | retunes the bare `transition` utility |

**Note on the eyebrow token:** `--text-eyebrow` sets **size, leading and tracking only —
not weight and not `text-transform`.** Every call site must add `font-bold uppercase`
itself. A dossier eyebrow is therefore
`class="text-eyebrow font-bold uppercase text-fg-subtle"`.

**Note on `--text-*` weight:** DESIGN.md §3.3 deliberately omits
`--text-*--font-weight`, so weight stays a call-site decision (`font-bold` / `font-black`).
`font-extrabold` (800) is **banned** — the face is not loaded (T-03).

### 1.3 Palette rungs that are shim-safe (use these, not new tokens)

The light-mode shim in `global.css` §5b–5d is keyed on **literal class names**. Two
families matter for the dossier:

- **Tinted chip trios are shimmed.** `bg-emerald-900/40` → `#ecfdf5`,
  `text-emerald-400` → `#047857`, `border-emerald-500/30` → `#6ee7b7`
  (`global.css:914-917`). The identical trio exists for sky/amber/rose/red/pink/violet
  etc. So the **existing** `statusBadgeClass()` recipe in `CandidateDash.tsx:63-74` is
  already theme-correct — reuse it rather than inventing a chip.
- **Solid `-700` fills are NOT shimmed**, so they stay dark in both themes. That is
  exactly what the WhatsApp row and the green CTA need: `bg-emerald-700 text-white`
  = **5.48:1 in both themes**, no shim, no new token.

### 1.4 Things that must NOT be used as utilities

| Not a utility | Why |
|---|---|
| `ease-out-expo`, `ease-in-out-soft`, `ease-spring` | These are CSS **variables**, not Tailwind namespaces. `theme.css:189-191` says so; `Button.astro:58-64` records that spelling one as a class fails the class verifier. Use the bare `transition` utility (retuned to 180 ms + expo) or `transition-colors` / `transition-transform`. |
| `--hero-gradient`, `--hero-glow`, `--footer-gradient`, `--bg-dot-*`, `--section-alt-bg`, `--glow-*`, `--accent-line` | Plain `:root` variables consumed by hand-written CSS (`theme.css:236-274`), not `@theme` tokens. |
| `--u-grid-min`, `--u-nav-h`, `--u-cv-h`, `--u-scrollbar-gutter`, `--reveal-*`, `--enter-*`, `--marquee-duration` | Layout/motion primitives, read by the `u-*` classes — never written in markup. |
| `rounded-[2rem]`, `rounded-[2.5rem]`, `rounded-[14px]` | T-04: 39 arbitrary radius values were replaced by the 5 tokens. Do not re-introduce them. |
| `slate-750` | Not a Tailwind rung; emits nothing. (Already fixed — 0 occurrences in `src/` as of this reading.) |
| `.u-truncate`, `.u-clamp-2`, `.u-flex-center` | Deliberately **removed** from `layout.css` — use `truncate`, `line-clamp-2`, `flex items-center justify-center`. |

### 1.5 Non-Tailwind helper classes that DO exist

`.glass-panel` (`bg-surface` + `border-line`, solid — no blur),
`.u-scroll-area`, `.u-scroll-x`, `.u-modal-shell`, `.u-viewport-fixed(--right)`,
`.u-grid-auto` + `--dense` / `--cards` / `--panels` / `--form` / `--wide`,
`.u-cv-auto(--card)`, `.u-has-bottomnav`, `.t-elevate`, `.hover-lift`, `.hover-grow`,
`.lift-wrap`, `.input`, `.label`, `.input-micro`, `.section-title`,
`.section-title-accent`, `.custom-scrollbar`, `.scrollbar-hide`, `.fade-in`, `.pb-safe`,
`.rt-row` / `.rt-full` (responsive table), `.mn-*` (legacy mobile nav).

### 1.6 The one component-vs-component trap for this work

`src/components/ui/Button.astro` is an **Astro** component. It **cannot** be rendered
inside a Preact island. The dossier card is Preact (`.tsx`), so it must **reuse
Button's class recipe as a string**, not the component:

```
inline-flex items-center justify-center gap-2 font-bold rounded-control transition
select-none motion-reduce:transition-none min-h-[48px] px-6 py-3 text-body-sm
```

Same for `Icon` — but `Icon.tsx` **is** Preact and is importable (`import Icon from '../ui/Icon'`).

---

## 2. The dossier card — anatomy with exact classes

Component: **`src/components/candidate/AsjDossierCard.tsx`** (Preact, presentational,
no data fetching — it takes props, per DESIGN.md P4 "numbers only from data").
Props mirror the mapping in §3.

```
<section class="rounded-panel bg-surface-raised border border-line-strong p-5 md:p-6">
│
├─ header row
│   <header class="flex items-start justify-between gap-3 pb-4 mb-5 border-b border-line">
│     <div class="min-w-0">
│       <p  class="text-card-title font-black uppercase tracking-wide text-fg">ASJ DOSSIER</p>
│       <p  class="text-eyebrow font-bold uppercase text-accent">VERIFIED CANDIDATE</p>
│     </div>
│     <span class="shrink-0 grid place-items-center w-9 h-9 rounded-pill
│                  bg-surface-sunken border border-line-strong">
│       <Icon name="check-circle" class="text-accent-emerald" />
│     </span>
│   </header>
│
├─ body grid — 1 col mobile, 2 col ≥~512px (breakpoint-free, per layout.css §1)
│   <div class="u-grid-auto u-grid-auto--wide gap-5">
│   │
│   ├─ LEFT column
│   │   <div class="flex flex-col items-center gap-3">
│   │     <!-- photo tile -->
│   │     <div class="w-28 h-32 rounded-card overflow-hidden shrink-0
│   │                 bg-surface-sunken border border-line-strong">
│   │       <img … class="w-full h-full object-cover" />   <!-- or initial-letter fallback -->
│   │     </div>
│   │     <!-- ID plate -->
│   │     <span class="rounded-control bg-surface-sunken border border-line-strong
│   │                  px-3 py-1.5 font-mono text-eyebrow font-bold text-fg-muted">
│   │       {idKandidat}
│   │     </span>
│   │     <!-- LULUS chip -->
│   │     <span class={`rounded-pill border px-3 py-1 text-caption font-bold ${statusBadgeClass(status)}`}>
│   │       {status}
│   │     </span>
│   │   </div>
│   │
│   └─ RIGHT column
│       <div class="min-w-0">
│         <h3 class="text-section font-black uppercase text-fg break-words">{nama}</h3>
│         <!-- badge icon row — see §3.3, must be DATA-DRIVEN or omitted -->
│         <div class="flex items-center gap-2 mt-1 text-fg-subtle" aria-hidden="true">…</div>
│         <!-- WhatsApp row -->
│         <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
│            class="mt-3 inline-flex items-center gap-2 w-full rounded-control
│                   bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 font-bold transition-colors">
│           <Icon name="whatsapp" />
│           <span class="font-mono">{wa}</span>
│         </a>
│         <!-- 2×2 field grid -->
│         <dl class="grid grid-cols-2 gap-3 mt-4">
│           <Field label="JENIS KELAMIN" value={gender} />
│           <Field label="USIA"         value={`${usia} Tahun`} />
│           <Field label="TB / BB"      value={tbBb} />
│           <Field label="PENDIDIKAN"   value={pendidikan} />
│         </dl>
│       </div>
│   </div>
│
├─ full-width rows
│   <dl class="mt-5 space-y-3">
│     <Row label="TEMPAT, TANGGAL LAHIR" value={ttl} />
│     <Row label="EMAIL"                 value={email} />
│     <Row label="ALAMAT DETAIL (KTP)"   value={alamat} />
│   </dl>
│
├─ two side-by-side tiles
│   <div class="grid grid-cols-2 gap-3 mt-4">
│     <Tile label="JFT / JLPT"  value={jftText} tone="sky" />
│     <Tile label="SSW / BIDANG" value={sswText} tone="emerald" />
│   </div>
│
├─ job block
│   <div class="mt-4 rounded-card bg-surface-sunken border border-line-strong p-4">
│     <p class="text-eyebrow font-bold uppercase text-fg-muted">JOB / BIDANG YANG DILAMAR:</p>
│     <div class="mt-2 flex flex-wrap gap-2">{applications.map(…)}</div>
│   </div>
│
└─ CTA
    <button type="button"
            class="mt-5 w-full inline-flex items-center justify-center gap-2 font-bold
                   rounded-control transition select-none min-h-[48px] px-6 py-3 text-body-sm
                   bg-emerald-700 hover:bg-emerald-800 text-white">
      <Icon name="download" /> DOWNLOAD FULL BIODATA
    </button>
```

### 2.1 The three sub-primitives, exactly

**`Field`** (boxed cell — the 2×2 grid):

```
<dl class="rounded-card bg-surface-sunken border border-line-strong p-3 min-w-0">
  <dt class="text-eyebrow font-bold uppercase text-fg-subtle">{label}</dt>
  <dd class="mt-1 text-body-sm font-bold text-fg break-words">{value}</dd>
</dl>
```

**`Row`** (full-width, no box — matches the screenshot's label/value stack):

```
<div class="min-w-0">
  <dt class="text-eyebrow font-bold uppercase text-fg-subtle">{label}</dt>
  <dd class="mt-1 text-body-sm font-bold text-fg break-words">{value}</dd>
</div>
```

**`Tile`** (JFT / SSW pair):

```
<div class="rounded-card bg-surface-sunken border border-line-strong p-3 text-center min-w-0">
  <dt class="text-eyebrow font-bold uppercase text-fg-subtle">{label}</dt>
  <dd class="mt-1 text-body-sm font-bold text-fg">{value}</dd>
</div>
```

### 2.2 Size / spacing scale used (all from the 4 px scale)

| Slot | Value | Class |
|---|---|---|
| Card padding | `1.25rem` → `1.5rem` ≥768px | `p-5 md:p-6` |
| Gap between the two columns | `1.25rem` | `gap-5` |
| Gap inside the 2×2 grid | `0.75rem` | `gap-3` |
| Gap between full-width rows | `0.75rem` | `space-y-3` |
| Field-box padding | `0.75rem` | `p-3` |
| Header→body separation | `1.25rem` + hairline | `pb-4 mb-5 border-b border-line` |
| Card radius | `1.5rem` | `rounded-panel` |
| Field-box radius | `1rem` | `rounded-card` |
| Chip / button radius | `0.75rem` | `rounded-control` |
| Status chip radius | pill | `rounded-pill` |
| Photo tile | `7rem × 8rem` | `w-28 h-32` |
| CTA min height | `48px` (mobile-form target, §6.4) | `min-h-[48px]` |

### 2.3 Motion

Only the CTA and the WhatsApp row transition, and only `transition-colors`
(compositor-free, 180 ms, expo curve via the retuned default). **No entrance animation
on the card itself** — it is above the fold on the dashboard, and DESIGN.md §3.7 +
motion.css §9 both warn that animating content that is already on screen costs a paint
and delivers nothing.

---

## 3. Field → data-source mapping

**Primary source:** `mapCandidate()` in `netlify/functions/_lib/db/candidates.ts:14-86`.
This is the single projection that turns a `database_candidate` row into the shape every
surface reads. Its own header comment (`candidates.ts:7-13`) lists the real columns.

**Both surfaces get the same shape:**
- Candidate: `catalog/service.ts:79` → `stripRaw([mapCandidate(row)])`, then
  `attachBerkasBio` (`berkas.ts:70`) adds `.berkas` + `.bio`, then `attachApplications`
  (`candidates.ts:292`) adds `.applications`. `CandidateDash` reads `result.candidates[0]`.
- Admin: `catalog/service.ts:55` → `stripRaw(candRows.map(mapCandidate))` + the same two
  decorators, surfaced by `getCandidatesPage` → `adminStore.Kandidat` → `TabPelamar` →
  `CandidateProfileModal`.

**So every field the legacy card shows is already on the row on BOTH sides.** The only
work on the candidate side is that `CandidateDash`'s adapter currently *drops* most of
them (§3.2).

### 3.1 Fields with a real source

| Legacy card slot | Source (exact) | Candidate side today | Notes |
|---|---|---|---|
| `ASJ DOSSIER` wordmark | **static copy** — new i18n key | — | `master.form_brand` = "ASJ DOSSIER" already exists (`i18n.ts:1749`) but is scoped to `MasterFullForm`; add a `dossier.*` key rather than reusing a master-form key |
| `VERIFIED CANDIDATE` | **static copy** — new i18n key | — | see §3.3 #1 — the *claim* needs a source |
| top-right round check | conditional — see §3.3 #1 | — | |
| photo tile | `row.pasPhoto` (mapCandidate ← `pas_photo`) | ✅ `data.pasPhoto` already mapped | fallback = first initial, as `CandidateProfileModal.tsx:315` does |
| ID plate | `row.idKandidat` (mapCandidate ← `id_kandidat`) | ✅ `data.idKandidat` | **format differs — see §3.3 #5** |
| `LULUS` chip | `row.status` (mapCandidate ← `status_kandidat`) | ✅ `data.status` | reuse `statusBadgeClass()` (`CandidateDash.tsx:63`) |
| name (large caps) | `row.nama` (mapCandidate ← `nama_lengkap`) | ✅ `data.nama` | |
| badge icon row | data-driven — see §3.3 #2 | — | |
| WhatsApp row | `row.wa` (mapCandidate ← `no_wa`, digits-only) | ✅ `data.wa` | |
| `JENIS KELAMIN` | `row.gender` (mapCandidate ← `gender`) | ⚠ via `data.cvmini.gender` only | |
| `USIA` | `row.usia` (mapCandidate ← `usia`) | ⚠ via `data.cvmini.usia` only | suffix `ui.age_years_suffix` = " Tahun" exists |
| `TB / BB` | `row.tbBb` (mapCandidate computes `"165 / 57"`) — or `row.tb` + `row.bb` | ⚠ via `data.cvmini.tb` / `.bb` | prefer `tbBb`; it already applies the `-` guard |
| `PENDIDIKAN` | `row.pendidikan` (mapCandidate ← `pendidikan`) | ⚠ via `data.cvmini.pendidikan` only | |
| `TEMPAT, TANGGAL LAHIR` | `row.ttl` (mapCandidate computes `"PONOROGO, 1989-10-05"`) — or `row.tempatLahir` + `row.tglLahir`; richer: `row.bio.tmplahir` + `row.bio.tgllahir` (`BIO_COLUMNS`, `berkas.ts:46-47`) | ❌ **dropped** | |
| `EMAIL` | `row.email` (mapCandidate ← `email`); richer: `row.bio.email` (`berkas.ts:45`) | ❌ **dropped** | |
| `ALAMAT DETAIL (KTP)` | `row.alamat` (mapCandidate ← `alamat_lengkap`); richer: `row.bio.alamat` (`berkas.ts:48`). The KTP **number** is `row.nik` | ❌ **dropped** | **do not render `nik` to candidates — see §3.3 #6** |
| `JFT / JLPT` | `row.jftText` (mapCandidate ← `nilai_jft_text`) | ⚠ via `data.cvmini.jftText` only | |
| `SSW / BIDANG` | `row.sswText` (mapCandidate ← `bidang_ssw_text`) | ⚠ via `data.cvmini.sswText` only | |
| `JOB / BIDANG YANG DILAMAR` | `row.idLoker` (mapCandidate ← `id_loker_pilihan`) + `row.applications[]` (`{code, kategori, status, tahapan}`, `candidates.ts:299-314`) | ✅ `data.job` + `data.riwayat` | |
| `DOWNLOAD FULL BIODATA` | **no new backend needed** — wire to the existing `RirekishoBuilder` (already imported `CandidateDash.tsx:14` and mounted at `:655`) or reuse `handleDownloadBiodata`'s text export (`CandidateProfileModal.tsx:258-293`) | ✅ both already present in the repo | |

### 3.2 What `CandidateDash` must add to its adapter (no backend change)

`CandidateDash.tsx:33-54` (`CandidateData`) and `:224-286` (`setData`) currently read
only 4 of the fields above into top-level properties. Add these to the type and to the
`setData` mapping — the values are already in `row`:

```ts
// type CandidateData — add
tempatLahir: string; tglLahir: string; ttl: string;
email: string; alamat: string;
tbBb: string; gender: string; usia: string; tb: string; bb: string; pendidikan: string;
// setData — add (row is the mapCandidate row, already in scope at :213)
tempatLahir: String(row?.tempatLahir || row?.bio?.tmplahir || ''),
tglLahir:    String(row?.tglLahir    || row?.bio?.tgllahir  || ''),
ttl:         String(row?.ttl || ''),          // mapCandidate already joins them
email:       String(row?.email  || row?.bio?.email   || ''),
alamat:      String(row?.alamat || row?.bio?.alamat  || ''),
tbBb:        String(row?.tbBb || ''),
gender:      String(row?.gender || ''), usia: String(row?.usia || ''),
tb:          String(row?.tb || ''),     bb:   String(row?.bb || ''),
pendidikan:  String(row?.pendidikan || ''),
```

That is the entire data-side change. **No Netlify function, no SQL, no migration.**

### 3.3 NO DATA SOURCE — cannot be built as shown

These are the rows that must be **changed, driven by real data, or omitted**. A card
that renders an empty box is worse than one that omits the row (DESIGN.md P5).

| # | Legacy slot | Why it cannot be built as shown | Options |
|---|---|---|---|
| 1 | The round "verified" badge **and** the `VERIFIED CANDIDATE` subtitle, as a *verification claim* | There is **no verification column**. `mapCandidate` has no `is_verified` / `verified_at`. "Verified" is an assertion about the candidate, i.e. a legal claim (DESIGN.md §7.2: "angka karangan … adalah klaim hukum"), not decoration. | (a) render only when a real signal exists — `row.isSiswaASJ` (class tag in `catatan_internal`, `candidates.ts:25-35`) or `row.isVIP` (`[VIP]` literal) or `row.status === 'LULUS'`; (b) change the copy to the signal you actually have (`SISWA ASJ`, `KANDIDAT LULUS`); (c) omit both. **Owner decision.** |
| 2 | The icon row (flag, medal, star, seal) | **Two of the four glyphs do not exist in the sprite.** `src/icons/sprite-map.ts` has 155 entries; there is **no `flag`, `flag-checkered`, `seal` or `certificate`**. `Icon` renders **nothing** for an unknown name (only a DEV console warning, `Icon.tsx:53-55`) — a silent empty slot. | Replace with a **data-driven** badge row using glyphs that exist: `star` ← `isVIP`, `graduation-cap` or `user-check` ← `isSiswaASJ`, `check-double` ← `status === 'LULUS'`, `medal` ← nothing (no source). Or omit the row. **Owner decision.** |
| 3 | `LULUS (LULUS)` — the chip under the photo with a *duplicated* value | There is no second status field. `row.status` and `row.tahapan` are the only two, and the screenshot shows the same word twice — a **legacy rendering artefact**, not data. | Render **one** chip from `status`; if `tahapan` and `status` differ, show `tahapan` (the stage) as a second chip — but never repeat one value twice. |
| 4 | `EMAIL` / `ALAMAT` / `TTL` when the master row is missing | `attachBerkasBio` sets `bio = {}` when no `master_database_candidate` row matches (`berkas.ts:152-154`), and `mapCandidate` returns `'-'` for absent columns. `realValue()` in `CandidateDash.tsx:350` already encodes the rule (`'-'`, `'null'`, `'undefined'` ⇒ empty). | Render the row **only** when `realValue(v)`; otherwise drop it. Do not print `-`. |
| 5 | The ID plate **format** `ASJ-20250930-1052` | The repo's `id_kandidat` is `ASJ#####` — `ASJ00159` in `CandidateProfileModal.test.tsx:40`, allocated by `maxCandidateIdNumber()` (`candidates.ts:211`). **No code path anywhere produces `ASJ-YYYYMMDD-HHMM`.** The plate *value* has a source; the *format* does not. | (a) render `row.idKandidat` as-is (honest, buildable today); (b) if the owner wants the date format, it needs a **server-side** generator writing a real column — a client-side `new Date()` would fabricate an identifier. **Owner decision.** |
| 6 | `ALAMAT DETAIL (KTP)` implying the KTP number | The address (`alamat_lengkap`) exists; the KTP **number** is `row.nik` (`candidates.ts:80`) and is **not** on the card. | Keep the label as `ALAMAT (KTP)` and the value as `alamat`. **Do not render `nik`** on a candidate-facing surface without an explicit owner ruling — it is a national ID number. |
| 7 | `flag` / `seal` icons specifically | See #2 — not in the sprite. | — |

**Summary of the honest NO-DATA-SOURCE list:** the *verified* semantics (#1), the
*flag* and *seal* glyphs (#2, #7), the *duplicated* `(LULUS)` (#3), the *date-format* ID
(#5), and *NIK* (#6). Everything else on the card has a real source — 8 of those fields
just are not read by `CandidateDash` yet (§3.2).

---

## 4. Dark / light values and expected contrast

Ratios computed with the WCAG 2.1 relative-luminance formula
(`L = 0.2126R + 0.7152G + 0.0722B`, channels linearised at the 0.03928 knee;
`contrast = (L₁+0.05)/(L₂+0.05)`). Floors: **4.5:1 body text**, **3:1 large text
(≥24px, or ≥18.66px bold) and UI components**.

The card surface is `--color-surface-raised`; the field boxes are
`--color-surface-sunken`.

| Pair | Dark | Light | Dark ratio | Light ratio | Verdict |
|---|---|---|---|---|---|
| `text-fg` on card (`surface-raised`) | `#f1f5f9` / `#1e293b` | `#16121c` / `#fff7fa` | **13.35:1** | **17.53:1** | ✅ body |
| `text-fg-muted` on card | `#94a3b8` / `#1e293b` | `#514a5c` / `#fff7fa` | **5.71:1** | **8.03:1** | ✅ body |
| `text-fg-subtle` on card (**eyebrows**) | `#8595aa` / `#1e293b` | `#726a80` / `#fff7fa` | **4.79:1** | **4.88:1** | ✅ body — *just* clears 4.5 |
| `text-fg` on field box (`surface-sunken`) | `#f1f5f9` / `#000000` | `#16121c` / `#fdf2f6` | **19.17:1** | **17.3:1** | ✅ body |
| `text-fg-subtle` on field box | `#8595aa` / `#000000` | `#726a80` / `#fdf2f6` | **6.88:1** | **5.05:1** | ✅ body |
| `text-accent-emerald` on card | `#34d399` / `#1e293b` | `#047857` / `#fff7fa` | **7.61:1** | **5.21:1** | ✅ body |
| `text-accent-sky` on card | `#38bdf8` / `#1e293b` | `#0369a1` / `#fff7fa` | **6.83:1** | **5.63:1** | ✅ body |
| `text-accent` (pink) on card | `#f9a8d4` / `#1e293b` | `#be185d` / `#fff7fa` | **8.07:1** | **5.73:1** | ✅ body |
| `text-accent-amber` on card | `#fbbf24` / `#1e293b` | `#b45309` / `#fff7fa` | **8.76:1** | ~5.0:1 | ✅ body |
| `text-white` on `bg-emerald-700` (**WhatsApp row, CTA**) | `#ffffff` / `#047857` | same | **5.48:1** | **5.48:1** | ✅ body — theme-neutral, no shim |
| `text-white` on `bg-emerald-800` (hover) | `#ffffff` / `#065f46` | same | **7.68:1** | **7.68:1** | ✅ body |
| `text-brand-fg` on `bg-brand` (alt WhatsApp/CTA) | `#04211a` / `#10b981` | same | **6.69:1** | **6.69:1** | ✅ body |
| LULUS chip via `statusBadgeClass()` | `#34d399` on `#022c22`-ish | `#047857` on `#ecfdf5` | ~10.9:1 | **5.21:1** | ✅ body (shimmed) |
| **`border-line-strong` vs card** | `#475569` / `#1e293b` | `#dfc4d1` / `#fff7fa` | **1.93:1** | **1.54:1** | ⚠️ **below the 3:1 UI floor** |
| **`border-line` vs card** | `#334155` / `#1e293b` | `#f0dfe7` / `#fff7fa` | **1.41:1** | **1.21:1** | ⚠️ **below the 3:1 UI floor** |

### 4.1 The one contrast finding that needs a ruling

**Neither border token reaches 3:1 against `surface-raised`, in either theme.**
`border-line-strong` is the best available at 1.93:1 (dark) / 1.54:1 (light).

Why this is *usually* acceptable: WCAG 1.4.11 (non-text contrast) applies to visual
information **required to identify** a control or its state. The field boxes are
**grouping decoration** — the eyebrow label and the value are both fully legible on
their own (4.79:1 and 13.35:1), so nothing is *lost* if the box edge is faint. The
`DESIGN.md §3.6` convention agrees: this design system separates surfaces by *border*,
and the border tokens were chosen for hairline dividers, not for control boundaries.

Why it still deserves a ruling: if the owner wants the boxes to read as **distinct
bordered objects** (which the legacy card clearly does), the honest options are —

1. accept the border as decorative (1.93:1) — **recommended**, zero new tokens;
2. raise the box edge to an accent tint, e.g. `border-accent-sky/40` —
   `#38bdf8` on `#1e293b` = **6.83:1**, comfortably compliant, but the card stops being
   neutral and gains a second accent (DESIGN.md P3: one accent per section);
3. add a new `--color-line-control` token at a value that clears 3:1 on
   `surface-raised` — this needs a value **not** in `@theme` today, so it is a token
   addition, not a class change.

**Do not** reach for `border-white/20` or an arbitrary hex: neither is theme-aware, and
`border-white/20` is exactly the pattern `global.css` §5d exists to fix.

---

## 5. Where the card is used

### 5.1 Candidate dashboard — `src/components/candidate/CandidateDash.tsx` (the ruling)

Render `<AsjDossierCard … />` **inline as the first card** of the dashboard, replacing the
current `glass-panel` hero block (`:360-410`). The dossier *is* the profile; burying it
behind a "Profil" button (`:458`) is what the owner is objecting to.

Keep `CvMiniModal` — but move its trigger to an **edit affordance inside the card**
(e.g. a small `Icon name="user-edit"` button in the card header), because the dossier is
now the read view and `CvMiniModal` is the write view. `CvMiniModal` already prefills
from `row` (`CandidateDash.tsx:653` passes `data.cvmini`), so nothing changes there.

**Remove** the candidate's `CvTemplateSelector`: the button at `:534`, the render at
`:654`, the import at `:15`, and the `showCvTemplateSelector` state at `:166`.
`CandidateDash.test.tsx` does **not** assert on that button, so no test breaks — but
re-run it anyway, since `:654` is inside the render tree.

### 5.2 Admin view — should the same card serve it? **Yes — with one caveat.**

`src/components/admin/TabPelamar.tsx` opens `CandidateProfileModal` (via
`AdminPanel.tsx:279`). That modal **already is** a dossier implementation — sections 1
and 2 of `CandidateProfileModal.tsx:309-388` are a hand-rolled, near-identical layout
(`cv_bio_header`, `cv_gender`, `cv_usia`, `cv_fisik`, `cv_pendidikan`, `cv_ttl`,
`cv_email`, `cv_alamat`, `jft_jlpt`, `ssw_field`, `cv_jobs_header`,
`cv_download_biodata` — all the legacy card's labels already exist as i18n keys).

**Recommendation: yes, extract the card and use it in both.** Reasons, in order of
weight:

1. **It removes a duplicate that has already drifted.** The admin modal and the legacy
   card are two hand-maintained renderings of the same 16 fields. DESIGN.md §5.5 records
   exactly this failure mode for `jobDisplay.ts` ("Jangan membuat pemetaan kedua — itu
   satu-satunya tempat … duplikatnya akan menyimpang pada hari pertama").
2. **The admin modal's field labels are already the card's labels.** `ui.cv_ttl` =
   "Tempat, Tgl Lahir", `ui.jft_jlpt` = "JFT / JLPT", `ui.ssw_field` = "SSW / Bidang",
   `ui.cv_jobs_header` = "Job / Bidang Yang Dilamar", `ui.cv_download_biodata` =
   "Download Full Biodata". Nothing has to be re-translated.
3. **The admin modal is where the owner's screenshot came from** — matching it makes the
   candidate view and the admin view agree, which is the whole point of "profil harusnya
   seperti ini kek legacy".

**The caveat — and it is a genuine decision:** the admin modal also carries
admin-only surfaces (VIP toggle `:478-487`, internal/external notes `:491-514`, quick-edit
`:391-400`, pemberkasan `:403-410`, document previews `:413-443`). So the split must be:

- `AsjDossierCard` = **presentational only** (the 16 fields + CTA). Shared verbatim.
- Admin-only controls stay in `CandidateProfileModal` **around** the card.

If instead the owner wants the admin modal left untouched, then the card is
candidate-only and the duplicate persists — that is the decision to make, not a
technical one. **Flagged for the owner (§6.2).**

### 5.3 Modal / overlay conventions to respect

- If the card's CTA opens a preview or the Rirekisho builder, use the existing overlay
  contract: backdrop `fixed inset-0 u-modal-shell z-modal`, panel `u-scroll-area`,
  `useOverlay()` for Esc + focus return (`src/components/ui/useOverlay.ts`).
  `CvMiniModal.tsx:128` currently hard-codes `z-[200]` — prefer the token `z-modal`
  going forward.
- Stacking order, from `theme.css:92-105`: `z-sticky` 50 < `z-header` 90 <
  `z-scrim` 95 < `z-drawer` 100 < `z-modal` 200 < `z-popover` 300 < `z-toast` 400.
  The card is in normal flow and needs **no** z-index.
- The dashboard sits under `BottomNav` (45 px, `md:hidden`, z 90). `<main>` must keep
  `.u-has-bottomnav` (`layout.css:301-312`) or the last control is unreachable — the
  dossier CTA is a real candidate for being the last element on the page.

---

## 6. Decisions needed from the owner

| # | Decision | Why it cannot be decided in code | Cost of getting it wrong |
|---|---|---|---|
| 6.1 | **What makes a candidate "VERIFIED"?** Which real signal (if any) drives the round check badge and the subtitle — `isSiswaASJ`, `isVIP`, `status === 'LULUS'`, or omit both? | No verification column exists. "Verified" is an assertion about a person, not a label. | Printing a verification claim the data does not support. This is the single riskiest item on the card. |
| 6.2 | **Does the admin dossier (`CandidateProfileModal`) get rebuilt onto the same card?** | It changes the admin surface, which the owner did not explicitly ask about. | Either a persistent duplicate (drift), or an unrequested admin change. |
| 6.3 | **Is the card dark in BOTH themes, or theme-aware?** The screenshot is dark; the dashboard is theme-aware. Precedent exists both ways — the hero/CTA band and the VIP student card are **deliberately dark in light mode** (`theme.css:320-331`). | It is a visual-identity call, not a token call. | A permanently dark card in a white page is exactly the "theme switch only changes the banner" defect the shim exists to fix — but an identity document that changes colour with the app also looks less official. |
| 6.4 | **ID plate format** — keep `ASJ00159`, or commission a server-side `ASJ-YYYYMMDD-HHMM` generator? | No code path produces the screenshot's format. | A client-side date would fabricate an identifier that means nothing. |
| 6.5 | **Boxed-field border contrast.** Accept the decorative 1.93:1 edge, or adopt an accent-tinted edge (6.83:1), or add a new token? | It is a taste/legibility trade-off the tokens cannot settle. | Boxes that read as "unfinished" — or a second accent that violates P3. |
| 6.6 | **Icon row.** Which real signals drive which glyphs (from the 155 that exist), or omit the row? | `flag` and `seal` do not exist in the sprite. | A silently empty icon slot — `Icon` renders nothing for an unknown name, with no error. |
| 6.7 | **Is the CTA a print/PDF (RirekishoBuilder) or a text export?** | Both are buildable today; they produce different artefacts. | Shipping a `.txt` download where the owner expects a CV PDF. |

### 6.8 Not decisions — just do these

- Remove the candidate `CvTemplateSelector` call site (§0). The owner already ruled.
- Add the 8 missing fields to `CandidateDash`'s adapter (§3.2). Pure plumbing, no
  backend.
- Use `text-eyebrow font-bold uppercase` for every card label — the token supplies
  neither weight nor `text-transform`.
- Omit any row whose value is `'-'`/empty (`realValue()` already exists at
  `CandidateDash.tsx:350`). Never render an empty box.

---

## 7. Verification plan (for whoever implements)

Because none of this can be proven by reading, the implementation must be measured:

1. `npm run verify:classes` — every class in §2 must resolve to a real rule. This is the
   gate that catches an invented token.
2. **Both themes**, at 390 / 768 / 1280 px, measure the pairs in §4 with a real browser
   against a real HTTP server (not `file://`). The `fg-subtle` eyebrows are the tightest
   pair (4.79:1 dark) — they are the first thing to break if a value is "tidied".
3. Confirm the removed `CvTemplateSelector` button is gone **for candidates** and still
   present in `TabPelamar` for admins.
4. `e2e:headings` — the card adds an `h3` (the name). Keep it inside the existing
   outline: the dashboard's `h2` stays, the card's name is `h3`. **Do not** add a second
   `h1`.
5. If `AsjDossierCard` is extracted and used by `CandidateProfileModal`, re-run
   `CandidateProfileModal.test.tsx` — it asserts on labels that must survive the
   extraction.
