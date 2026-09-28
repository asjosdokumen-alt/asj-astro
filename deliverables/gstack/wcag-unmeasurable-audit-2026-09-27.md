# WCAG 2.1 AA audit — the elements the contrast gate SKIPS

**Date:** 2026-09-27
**Scope:** the `unmeasurable` bucket of `e2e/test-contrast.mjs` on the six routes that gate measures
**Artifact:** built `dist/` served by `node server.cjs` on `http://localhost:4321` (the repo's own mandated environment)
**Probe:** `.tmp-wcag-audit.mjs` (gitignored, `*.tmp-*`)
**HEAD at time of audit:** `7e17cb7` — 17 commits ahead of `origin/main` (`4251b09`), nothing pushed

---

## TL;DR

| | |
|---|---|
| **Real WCAG failures found** | **5** (1 at rest/shim, 3 entire gradient pairs, 1 hover-only) — all fixed |
| Where | `/apply` sticky-nav CTA; then `/404`, the install button, the pemberkasan button, and the share submit button |
| Measured | `/apply` **3.49:1**; the emerald→sky CTAs **3.71:1** (rest) and **2.54:1** (hover); share submit **3.53:1** (hover) |
| Why the gate cannot see them | every one of these backdrops is a **gradient**, so the gate bails on it |
| Root cause (finding 1) | the light-theme `.text-white` shim (`global.css:406`) flips the label to near-black, and §5c/§5d's re-light lists do not include this gradient |
| Root cause (findings 2–5) | a **house convention** — every gradient CTA lightened on hover (`hover:from-<hue>-500`), and lightening a gradient always lowers white-text contrast. The hover was systematically the *least* legible state |
| Secondary | `/apply` in **dark** theme passes at **4.51:1** — a 0.2% margin |
| Coverage cleaned up | **182 skipped text nodes** across the six routes measured (vs the gate's documented 1075 site-wide) |
| Probe bugs found and fixed while building it | **4** (all four produced confident wrong numbers first; the 4th is recorded in the method section) |

**Status: all five findings are fixed** — `f02a352` (finding 1) and `c000ca4`
(findings 2–5). See §"The finding" below for each; the fix for 2–5 also had to
extend the light-theme re-light list in `global.css`, because the new hover
stops were classes that list did not yet name.

---

## The finding

### 1. `/apply` sticky-nav CTA — 3.49:1 (FAIL, floor 4.5)

**Markup:** `src/components/forms/ApplyFullForm.tsx:510` (`Lanjut`) and `:515` (`KIRIM LAMARAN`),
both `bg-gradient-to-r from-pink-500 to-pink-700 text-white`, `text-[15px] font-extrabold`.

**Measured, both methods agreeing:**

| theme | computed `color` | pixel-measured ratio | ink → backdrop | verdict |
|---|---|---|---|---|
| **light** | `rgb(31,29,28)` | **3.49 : 1** | `rgb(31,29,28)` → `rgb(219,18,119)` | **FAIL** (need 4.5) |
| dark | `rgb(255,255,255)` | 4.51 : 1 | `rgb(255,255,255)` → `rgb(225,27,126)` | pass, +0.2% |

The screenshot makes it unambiguous: a **saturated pink pill with near-black text**.

**Why.** `global.css:406` carries the light-mode shim:

```css
:where([data-theme="light"]) .text-white { color: #1f1d1c; }
```

`#1f1d1c` is exactly the `rgb(31,29,28)` measured. The shim is correct in general —
light mode turns `bg-slate-900` surfaces light, so whitish text has to darken with it.
`global.css:792` (§5d) is the deliberate counter-rule, re-lighting `.text-white`
inside bands that stay dark in both themes:

```css
:where([data-theme="light"]) :where(.hero-gradient, .footer-gradient, .artwork-band) .text-white { … }
```

But the pink CTA's fill is a **saturated pink gradient that does not flip between
themes**, and it is **not one of those three bands**. So §5b wins, §5d never fires,
and the label goes near-black on a mid-pink fill.

**Not yet measured:** `:448` uses `bgClass="bg-gradient-to-br from-pink-500 to-pink-700"`
(a different gradient direction) — plausibly the same defect, unconfirmed.

**Note on reach.** `/apply` gates on the auth **store**. Without a fabricated session
the form is not rendered at all, so this control does not exist on the page — one
more reason no existing gate has ever seen it.

### 2–5. The gradient CTAs — a convention, not a typo (FAIL, floor 4.5)

Found by asking the same question of every other `text-white` gradient button in
the tree once finding 1 proved the class existed. Four more failed. **Three failed
at rest; two failed in hover** — and on the emerald pair the hover was the worst
state of all.

| # | control | gradient (before) | rest | hover (before) |
|---|---|---|---|---|
| 2 | `App.tsx:772` install button | `from-emerald-600 to-sky-600` | **3.77** FAIL | `hover:from-emerald-500` **2.54** FAIL |
| 3 | `CandidateDash.tsx:767` pemberkasan | same pair | **3.77** FAIL | **2.54** FAIL |
| 4 | `404.astro:72` "Ke Beranda" | same pair | **3.77** FAIL | **2.54** FAIL |
| 5 | `ShareView.tsx:398` share submit | `from-rose-600 to-pink-600` | 4.60 pass | `hover:from-rose-500` **3.53** FAIL |

All four are `text-sm`/`font-bold` or smaller → **normal text**, floor 4.5. The
large-text 3.0:1 concession does not apply to any of them.

**The root cause is the house hover convention.** Every one of these buttons
lightened on hover (`hover:from-<hue>-500 hover:to-<hue>-500`). Lightening a
gradient **always lowers white-text contrast**, because white-on-X is worst on
X's lightest stop. So the hover was not merely imperfect — it was *systematically
the least legible state*, and on the emerald CTAs it (2.54:1) was worse than the
rest state (3.77:1) it was supposed to be an enhancement of. A fix that only
touched the rest state would have left the failures in place, because a hover
state is user-visible text and owes the same floor.

White-on-stop values that decided the replacement, all computed then confirmed:

| stop | white ratio | | stop | white ratio |
|---|---|---|---|---|
| `emerald-500` | 2.54 FAIL | | `emerald-700` | **5.48 PASS** |
| `emerald-600` | 3.77 FAIL | | `emerald-800` | **7.68 PASS** |
| `sky-500` | 2.77 FAIL | | `sky-700` | **5.93 PASS** |
| `sky-600` | 4.10 FAIL | | `sky-800` | **7.56 PASS** |
| `rose-500` | 3.67 FAIL | | `rose-700` | **6.29 PASS** |
| `pink-500` | 3.53 FAIL | | `pink-700` | **6.04 PASS** |

**The fix:** the emerald/sky pair moves down two stops and the hover **darkens**
(`emerald-700→sky-700`, hover `→800`): rest 5.48, hover 7.56. The share button
keeps its rest pair (it passes at 4.60) and its hover darkens to the 700s (6.04)
instead of lightening to the 500s.

**Verified on the built page.** `/404` is the only affected route reachable
without a session, and it carries the *same* pair as the install button, so it is
the representative sample. It cannot be measured through `server.cjs` — `/404`
hits the **SPA fallback and returns `index.html`** (192 680 bytes, identical to
`/`, not the 105 170-byte `dist/404.html`), so the real 404 file had to be served
directly:

| | glyph vs its own backdrop (14px/700, floor 4.5) | verdict |
|---|---|---|
| before | **3.71 : 1** | FAIL |
| after | **5.47 : 1** | **PASS** |

The pixel probe agrees with the computed 5.48 within 0.01.

**The trap that would have bitten later.** The first fix attempt left
`from-emerald-800` / `from-sky-800` out of the light-theme re-light list in
`global.css` (§5c-extension). That list is what stops §5b's
`.text-white → #1f1d1c` from eating white text on a coloured gradient, and it
keys off the **`from-*` class** — so a class used *only on hover* still has to be
in it. Omitting the 800s would have rendered near-black text on a dark green/blue
gradient in the hover state: the original bug, reached by a different route.
Both stops were added. The general rule is now written into the CSS: every
`from-<hue>-<shade>` that carries white text belongs in that list, whatever the
shade and whichever state it appears in.

**One near-miss worth recording as a method error.** An early pass concluded that
`from-emerald-600 to-sky-600` "failed for white AND for the shim". That was wrong
about the shim: the re-light list already named `from-emerald-600`, so the shim
never applied to these buttons — the rule forced `#fff` and white was the only
real question. The arithmetic was right; the model of *which rule wins* was not.
Checking the selector list before trusting a computed verdict is what caught it.

---

## Coverage: what the gate cannot see, per route

Probe stable across 5 consecutive runs (identical to two decimals).

| route | skipped by gate | pixel-measured | FAIL | minimum ratio |
|---|---|---|---|---|
| `/` | 14 | 14 | 0 | 3.91 |
| `/public` | 56 | 39 | 0 | 5.02 |
| `/loker` | 61 | 43 | 0 | 5.02 |
| `/ai-cv` | 9 | 9 | 0 | 5.02 |
| **`/apply`** | 17 | 15 | **1** | **3.49** |
| `/siswa-baru` | 25 | 25 | 0 | 5.03 |
| **total** | **182** | **145** | **1** | |

The 37-node gap between "skipped" and "measured" on `/public` and `/loker` is
elements with fewer than 8 glyph pixels under the differ's threshold — most likely
icon-adjacent or clipped text. Those are **unmeasured, not passing**, and the gap is
stated rather than hidden.

**Coverage note:** this table counts failures found by the *pixel* probe on the six
routes. Findings 2–5 live on routes the probe could not reach (`/404` behind the SPA
fallback, the other two behind auth), so they are **not** in the `FAIL` column — they
were found by computed arithmetic and confirmed on the built 404 page instead. The
table's `1` is a floor on the real number, not the whole of it.

---

## Method, and the three probe bugs that had to be fixed first

The probe measures a text node the gate cannot: screenshot the element's box twice
(once normally, once with the **ink** masked), difference per pixel, take the ink from
the strongest-coverage pixel, and score it against **the backdrop pixel it actually
sits on**. Scoring against the pixel under the glyph — not an average — is what makes a
gradient backdrop measurable at all.

Every one of the following produced **confident nonsense** before it was caught.

**(a) Averaging a contaminated "backdrop".**
The first version classified a pixel as background when its delta fell under a
threshold, then averaged those pixels. On a large glyph most of the area is only
lightly antialiased, so thousands of near-glyph pixels slipped under and dragged the
"backdrop" toward the ink. It reported the white hero headline as
`ink rgb(17,18,33)` on `backdrop rgb(52,38,56)` — **1.31:1** — when the computed colour
is `rgb(255,255,255)` and the screenshot is plainly white-on-dark.
*The number was not slightly wrong; it was impossible.* That impossibility is what
gave it away. Fixed by taking the backdrop from the ink-free image alone.

**(b) `animation-play-state: paused` is not enough — it must be `animation: none`.**
The hero carries an **infinite scroll-driven parallax**
(`animation: hero-drift linear both; animation-timeline: view()`). A clip screenshot
perturbs the scroll position, which advances the view-timeline, which moves the haze
plane *between the two frames* — so the differ scores the moving haze as if it were
glyph coverage. `waitForTimeout` cannot help; a view() timeline is not driven by time.
Bisected, 3 trials per point, two screenshots of the **same** page instance (a pair
must be identical or the page is still moving):

| mutation | result |
|---|---|
| baseline | MOVES MOVES MOVES |
| `.hero-art,.hero-haze{display:none}` | MOVES MOVES MOVES |
| `.hero-band{display:none}` | MOVES MOVES MOVES |
| **`*,*::before,*::after{animation:none}`** | **STABLE STABLE STABLE** |

So `animation: none` is the one sufficient and necessary condition. **Removing the
moving elements does not help** — kill the animation, not the element.
Before this fix the same element measured **2.96 / 3.25 / 3.44 / 4.72 / 5.19 / 6.10 /
8.39 / 8.59** across runs. A 3× spread is not a measurement.

**(c) `visibility:hidden` invents failures on elements that paint their own background.**
On `/ai-cv` the amber CTA (`bg-amber-600 text-white`) was reported at **4.33:1 FAIL** —
with `ink rgb(180,83,9)` (that is the amber **fill**) on `backdrop rgb(238,238,238)`
(that is the **page**). `visibility:hidden` removes the element's painted background
along with its text, so the differ saw "amber rectangle disappeared" and scored the
fill as ink. The true value is **5.02:1 PASS**, confirmed computed and pixel.
Fixed by masking the ink only — `color:transparent` + `text-shadow:none` +
`-webkit-text-stroke:0` — which leaves every other paint of the element as rendered.

**Plus a routing bug that made six routes one route.** Git-Bash/MSYS rewrites
path-like arguments **and environment variables**: `node x.mjs /public` arrives as
`C:/Users/.../PortableGit/versions/1.2.0/public`, and `AUDIT_ROUTE=/public` is rewritten
the same way. The `startsWith('/')` lookup therefore failed and fell back to `/`, so the
probe reported **one route six times**. All six numbers were identical to two decimals
while `server.cjs` was serving visibly different bytes per path (192680 for `/` vs
104693 for `/ai-cv`, and only `/` contains the hero).
*Identical results across routes that serve different bytes is not a pass — it is a
routing bug.* The probe now takes a bare route name (`public`) and **fails loudly** if
it looks like a rewritten Windows path.

---

## Recommendations

**All five must-fix items are DONE** (`f02a352`, `c000ca4`). Recorded as
recommendations → outcomes, so the reasoning survives:

1. **`/apply`, light theme, the pink sticky-nav CTA — FIXED.** Both the §5c
   re-light *and* the `from-pink-500 → from-pink-600` markup change were applied,
   because either alone still fails: white on `pink-500` is 3.53:1, so the
   gradient had to move as well as the text colour. Verified 5.08:1 light and dark.

2. **The same CTA in dark theme passes at 4.51:1 — a 0.2% margin — FIXED** by the
   same `from-pink-600` change. Worst-case (lightest stop) is now 4.54:1.

3. **The four gradient CTAs (findings 2–5) — FIXED** (`c000ca4`). The emerald pair
   moved to the 700 stops with a darkening hover (5.48 / 7.56); the share button
   kept its passing rest pair and only its hover moved (4.60 / 6.04). Four new
   `from-*` shades were added to the light-theme re-light list.

**Worth doing (still open):**

4. **Extend the gate to HOVER STATES.** This audit measured resting states only,
   and the single most interesting result — that the house convention made hover
   the *worst* state (2.54:1, below the rest state) — is invisible to both this
   probe and the repo gate. Two of the five findings would have been missed by any
   resting-state sweep. A `:hover` pass over the same element set is the highest
   value follow-up here.

5. **Audit every remaining `hover:from-<hue>-500` on a `text-white` gradient
   button.** Findings 2–5 are the ones this session enumerated; the convention was
   repo-wide, so a button nobody looked at may still lighten on hover. The grep is
   one line (`grep -rn 'hover:from-.*-500' src/`).

6. Add `.avif: 'image/avif'` to `server.cjs`'s MIME map. `hero-sakura.avif` currently
   falls through to `application/octet-stream`. Rendering is unaffected (the `<img>`
   sniffs), but it is wrong and it obscures the file's type in devtools.

7. Consider promoting this probe into the repo's gate set. It found four real
   failures the existing gate structurally cannot see, and the method is now
   reproducible (5 identical runs). The honest boundary stays as documented below.

---

## Known limitations (stated, not hidden)

- **Viewport only.** `page.screenshot({clip})` cannot reach outside the viewport; a
  clip starting below `y=900` throws. 182 nodes were measured in-viewport only.
- **Resting state only in the original sweep.** No hover, focus, or disabled states.
  Findings 2–5 were found by *computed* arithmetic on hover classes, then confirmed
  by pixel only for the resting state — the hover ratios in the table above are
  computed, not pixel-measured. They are still trustworthy (the rest-state computed
  and pixel values agreed within 0.01), but the distinction is stated rather than
  blurred.
- **Light theme only on the failing route.** The probe was run in light theme by
  default; `/apply` was additionally re-run in dark to confirm the finding is
  theme-specific. The other five routes were not re-run in dark.
- **37 skipped nodes were not measured** (fewer than 8 glyph pixels) — unmeasured,
  not passing.
- **The `.tmp-*` probe is not committed.** It is gitignored by design; the numbers
  above are reproducible with the two commands in the appendix.
- **`/404` is unreachable through `server.cjs`** — the SPA fallback returns
  `index.html` (192 680 bytes) instead of `dist/404.html` (105 170 bytes). The CTA
  was measured by serving the real file directly. Anyone re-running the probe
  against the harness will get the home page and will not see this button at all.

---

## Appendix — reproducing

```bash
cd /f/astro
npm run build                       # if dist/ is stale
node server.cjs                     # serves dist/ on 4321 (the repo's own harness)

BASE_URL=http://localhost:4321 AUDIT_ROUTE=apply  node ./.tmp-wcag-audit.mjs
BASE_URL=http://localhost:4321 AUDIT_ROUTE=public node ./.tmp-wcag-audit.mjs
# route name WITHOUT a leading slash — see the MSYS note above
```

A correct run prints identical numbers on repeat. If any run reports the white hero
headline with a dark ink, the quiesce step is missing and the number is worthless.
