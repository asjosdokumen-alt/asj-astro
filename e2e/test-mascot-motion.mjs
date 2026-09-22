/**
 * e2e/test-mascot-motion.mjs — the princess mascot's idle must RUN, and must
 * be STOPPED AND STILL VISIBLE when the visitor asks for less motion.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/styles/motion.css` makes two claims about `.mascot-sway` that no gate
 * checked. The comment on the reduced-motion block even NAMES this file:
 *
 *     "`.mascot-sway` does NOT need a line here … it has specificity 0,1,0,
 *      exactly like `.mascot-wave`, so the `.mascot` rule just above already
 *      beats it on source order. Measured with `e2e/test-mascot-motion.mjs`."
 *
 * That comment was written before the file existed, so it over-claimed. This
 * is the gate it promised. Two assumptions are load-bearing and neither is
 * self-evident:
 *
 *   1. SPECIFICITY BY SOURCE ORDER. `.mascot-sway` has no reduced-motion
 *      override. The block relies on `.mascot` (same 0,1,0 specificity, later
 *      in the file) winning the cascade. Any of these silently voids it:
 *        - someone moves `.mascot-sway` BELOW the reduced-motion block;
 *        - the sway gets an `!important`;
 *        - the block is split into its own file that loads earlier;
 *        - the selector is rewritten as `.mascot.mascot-sway` (0,2,0), which
 *          would then BEAT the `.mascot` rule and keep animating.
 *      None of those is a syntax error and none changes the normal-motion
 *      rendering, so nothing else in the suite would notice.
 *
 *   2. STILL, BUT VISIBLE. `.mascot` sets `animation: none; opacity: 1;
 *      transform: none` because `mascot-enter` begins at `opacity: 0` with
 *      `fill-mode: both`. The failure mode this guards is perverse: if the
 *      clamp-from-duration approach ever came back, a visitor who asked for
 *      LESS motion would get an INVISIBLE mascot — the query causing the
 *      exact harm it exists to prevent. Checking `animation-name: none` alone
 *      would MISS that, because the animation is gone either way.
 *
 * WHY A BROWSER AND NOT A CSS PARSE
 * ---------------------------------
 * This is the same reasoning as `e2e/test-theme-gradients.mjs`: a text check
 * on `motion.css` asserts that a string is present, which is a claim about the
 * source rather than about what the page does. The whole risk here is a rule
 * that LOOKS right and loses the cascade. Only `getComputedStyle` shows
 * whether the cascade actually landed, so this measures the computed
 * `animation-name` / `opacity` / `transform` in a real browser, once with the
 * motion preference on and once with it off.
 *
 * Run against a built artifact:
 *   node e2e/test-mascot-motion.mjs
 *   BASE_URL=http://localhost:4321 node e2e/test-mascot-motion.mjs
 */
import { chromium } from 'playwright';
import { SECTION_MOTION, MASCOT_MOTIONS, ENTER_KINDS } from '../src/lib/sectionMotion.ts';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

/**
 * The mascot on the landing page. Scoped by the src prefix rather than by
 * `img.mascot` alone: several mascots exist in the repo (404 page, login card)
 * and `.mascot` is shared, so a bare class selector would happily measure a
 * different character and report a pass for the wrong element.
 */
const PRINCESS_SELECTOR = 'img[src*="/mascot/princess-"]';

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log(`✅ ${name}`);
  } catch (e) {
    results.push(['fail', name]);
    console.log(`❌ ${name}\n     ${e.message}`);
  }
}

/* `--no-proxy-server`: this sandbox exports HTTP(S)_PROXY and Chromium would
   otherwise send localhost through it and read a 502 as "server down". */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/**
 * Measure the princess in a FRESH context, because `prefers-reduced-motion` is
 * a context-level emulation and cannot be changed on a live page.
 *
 * The mascot is scrolled into view by OFFSET rather than with
 * `scrollIntoView`/`locator.screenshot`: she carries an *infinite* animation,
 * so Playwright's actionability check ("waiting for element to be stable")
 * never settles and times out. That timeout is not a page defect — it is
 * positive evidence the idle is running — but it makes the convenient API
 * unusable here. The same trap is documented on `measure-mascot.mjs`.
 */
async function measure(reduced) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  if (res?.status() !== 200) {
    await ctx.close();
    throw new Error(`GET / returned ${res?.status()} — refusing to read an error page.`);
  }

  /* ── SCROLL THE WAY A VISITOR DOES, FROM NODE, BEFORE MEASURING ──────────
   *
   * The scrolling used to happen INSIDE `page.evaluate` via
   * `window.scrollTo(...)`. Two separate defects came out of that, and the
   * second one is why this is now a Node-side `mouse.wheel` loop:
   *
   *   1. THE DESTINATION WAS COMPUTED FROM A STALE OFFSET. The loop did
   *      `window.scrollTo(window.scrollY + r.top - 200)` for each image in
   *      turn. `r.top` is relative to the CURRENT scroll position, so adding
   *      `window.scrollY` is only correct for the first element; by the second
   *      iteration the sum is no longer a document coordinate. Worse, a
   *      `display:none` element returns an ALL-ZERO rect, so its destination
   *      became `scrollY - 200` — a scroll BACKWARDS to a position that
   *      corresponds to nothing. Measured at 390px, the rail mascot made the
   *      loop jump from 14352 to 14152 and the renderer died there with
   *      `page.evaluate: Target crashed`.
   *
   *   2. AND `window.scrollTo` DOES NOT TRIGGER LAZY LOADING. This is the one
   *      that produced a WRONG VERDICT rather than a crash. `loading="lazy"`
   *      defers the fetch until the browser's own scroll machinery decides the
   *      image is near the viewport, and a programmatic `scrollTo` from inside
   *      an evaluate does not engage it. Measured, same page, same 3s wait:
   *
   *          scroll method            princess request made   complete
   *          mouse.wheel (real)       princess-wave.avif      true, 512x844
   *          scrollIntoView           (none)                  false
   *          window.scrollTo(0,14400) (none)                  false
   *
   *      So the mascot reported `naturalWidth: 0` while sitting fully in view
   *      at `top: 199` in an 844px viewport — a "broken image" reading produced
   *      entirely by the instrument. This is the same trap R15 §3k records for
   *      `measure-reveal.mjs`: an evidence tool reporting the exact failure it
   *      exists to detect, and being wrong.
   *
   * `page.mouse.wheel` is the API that dispatches genuine scroll events, and it
   * is only callable from Node — hence the restructure. It also removes the
   * `offsetTop` walk, because the wheel just moves the viewport down.
   */
  const visible = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .filter((i) => {
          const b = i.getBoundingClientRect();
          return b.width > 0 && b.height > 0;
        })
        .map((i) => i.getBoundingClientRect().top + window.scrollY),
    PRINCESS_SELECTOR,
  );

  /* Wheel down to the LAST visible mascot, in steps small enough to keep the
     event stream realistic. `mouse.wheel` is a no-op if the page is already at
     that offset, so over-travelling is harmless — but UNDER-travelling is not,
     and it is what the first version of this did: it stopped 200px short of the
     image, the image stayed outside the lazy-load margin, and the mascot was
     reported as `0x0` / "never finished loading" while being perfectly fine.
     So the loop travels the full distance and then VERIFIES the element is in
     the viewport before the caller measures it.

     The overshoot allowance brings the image to slightly below the viewport
     top rather than exactly at its margin, so rounding in the wheel's own
     delta handling cannot leave it a pixel outside. */
  const wheelReport = { target: 0, travelled: 0, inView: false };
  if (visible.length) {
    const target = Math.max(0, visible[visible.length - 1] - 120);
    wheelReport.target = target;
    let travelled = 0;
    while (travelled < target) {
      const step = Math.min(400, target - travelled);
      await page.mouse.wheel(0, step);
      travelled += step;
      await page.waitForTimeout(16);
    }
    wheelReport.travelled = travelled;
    await page.waitForTimeout(300);
    wheelReport.inView = await page.evaluate((sel) => {
      const imgs = [...document.querySelectorAll(sel)].filter((i) => {
        const b = i.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      });
      return imgs.some((i) => {
        const b = i.getBoundingClientRect();
        return b.top < window.innerHeight && b.bottom > 0;
      });
    }, PRINCESS_SELECTOR);
  }

  const rows = await page.evaluate(async (sel) => {
    const imgs = [...document.querySelectorAll(sel)];
    /* ── WAIT FOR LOADING, NOT FOR `decode()` ────────────────────────────────
     *
     * This used to be `Promise.all(imgs.map(i => i.decode()))`, so that a lazy
     * image would not be reported as broken. That call is REMOVED, and the
     * reason is a measured renderer crash rather than a style preference.
     *
     * MEASURED on the built page at 390×844: `img.decode()` on the in-page
     * Tentang mascot kills the Chromium renderer —
     *
     *     page.evaluate: Target crashed
     *
     * — while the very same work is fine in isolation. All three formats decode
     * standalone at their natural sizes (`512x844`, `1024x1688`, `512x844`), so
     * the files are valid and the crash is not an asset defect. It is the FULL
     * LANDING PAGE at a mobile viewport: 1161 nodes, 22 images, `scrollHeight`
     * 20602, and the renderer dies inside `decode()` on top of that. At 1280px
     * the same page is 13416 tall and the same image decodes.
     *
     * Two consequences, and both matter more than the decode itself:
     *
     *   1. The crash is NOT evidence about the mascot, and an `exception` here
     *      used to abort the ENTIRE gate before a single assertion ran. That is
     *      why this file could report nothing at all — see the note on the
     *      `[data-mascot-track]` block below. A harness that dies on its first
     *      measurement is a harness that has never checked anything.
     *   2. `decode()` is not what the assertion needs. "Not a broken or lazy
     *      placeholder" is answered by `complete` + `naturalWidth`, which are
     *      properties of an `<img>` that has loaded and need no promise. Waiting
     *      on `decode` was strictly stronger than required and bought a crash.
     *
     * What replaces it: poll `complete` up to a bounded budget. The wheel above
     * is what makes that budget sufficient — with the old programmatic scroll
     * the fetch never even started, and this loop timed out at `naturalWidth: 0`
     * on an image sitting in plain view. */
    const deadline = performance.now() + 3000;
    while (performance.now() < deadline) {
      if (imgs.every((i) => i.complete)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return imgs.map((img) => {
      const cs = getComputedStyle(img);
      const b = img.getBoundingClientRect();
      return {
        src: new URL(img.currentSrc || img.src).pathname,
        nat: `${img.naturalWidth}x${img.naturalHeight}`,
        complete: img.complete,
        // `animationName` is the cascade's own answer to "which animation won".
        anim: cs.animationName,
        opacity: cs.opacity,
        transform: cs.transform,
        transition: cs.transitionDuration,
        w: Math.round(b.width),
        h: Math.round(b.height),
        /* `rendered` is the fact `inView` cannot express: an element inside
           `display:none` has a zero box and is NEVER in view, so `inView:
           false` cannot distinguish "scrolled past" from "not displayed at
           all". Reported per element so a caller can say which one it is. */
        rendered: b.width > 0 && b.height > 0,
        inView: b.height > 0 && b.top < window.innerHeight && b.bottom > 0,
      };
    });
  }, PRINCESS_SELECTOR);

  await ctx.close();
  return { rows, wheel: wheelReport };
}

const NORMAL_MEASURE = await measure(false);
const REDUCED_MEASURE = await measure(true);
const NORMAL = NORMAL_MEASURE.rows;
const REDUCED = REDUCED_MEASURE.rows;
const NORMAL_WHEEL = NORMAL_MEASURE.wheel;

/* ═══════════════════════════════════════════════════════════════════════════
   PART TWO — DOES SHE ACTUALLY FOLLOW THE SCROLL?

   Everything above is measured at `390×844`, and that is fine for what it
   asserts (the reduced-motion cascade) — but it made a REAL defect invisible.
   The travelling mascot lives in a rail declared `hidden xl:block`, so below
   1280px it is `display: none`. A `display:none` element still resolves its
   CSS, so `animation-name` was correct, `opacity` was 1, and the two mascots
   above reported a clean pass for an element **no visitor at that width can
   see**. Measured on the built page:

     vw      aside.display   mascot box
     390     none            0 × 0        <-- mobile: the mascot is NOT THERE
     768     none            0 × 0
     1024    none            0 × 0
     1279    none            0 × 0
     1280    block           184 × 303
     1440    block           184 × 303

   So this part exists to measure the two things the owner actually asked for
   and that nothing measured before:

     A. She is RENDERED at the width being tested (a non-zero box). An assertion
        about a zero-height element is an assertion about markup.
     B. Scrolling from one section to the next CHANGES HER POSE AND HER IDLE,
        and the change is the one `src/lib/sectionMotion.ts` specifies.

   WHY IT READS THE TABLE RATHER THAN HARD-CODING EXPECTATIONS. `Section.astro`
   emits `data-pose`/`data-motion-name` from that same table at build time, so
   the page and this test share one source of truth. Hard-coding a second copy
   here would assert that two hand-written lists agree — which passes whenever
   someone edits both and fails for reasons that are not defects.

   ⚠ THE WIDTH IS NOT COSMETIC. `1280` is the smallest width at which the rail
   is laid out, and it is derived from the CSS, not chosen: the rail is
   `xl:block` and Tailwind's `xl` is 1280px. If that breakpoint moves, this
   test keeps measuring a hidden element and goes back to passing vacuously —
   which is why CLAIM C below asserts she is visible rather than assuming it.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Walk the page section by section at a given width, recording the mascot's
 * pose, motion and computed animation-name at each stop.
 *
 * The scroll is driven by SECTION OFFSET, not by `scrollIntoView`, for the same
 * reason `measure()` is: the mascot carries an infinite animation, so any
 * Playwright actionability wait on her never settles.
 *
 * Each section is scrolled to the position that makes it the NEAREST-MIDPOINT
 * section — the same rule BaseLayout's `nearest()` uses — so this reproduces the
 * visitor's state rather than approximating it. Landing on a boundary would
 * make the verdict depend on which side the throttle happened to catch.
 */
async function walkSections(width, height = 900) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    reducedMotion: 'no-preference',
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  if (res?.status() !== 200) {
    await ctx.close();
    throw new Error(`GET / returned ${res?.status()} at ${width}px — refusing to read an error page.`);
  }

  const rows = await page.evaluate(async () => {
    const tracked = document.querySelector('[data-mascot-track]');
    if (!tracked) return { error: 'no [data-mascot-track] element in the DOM' };

    const sections = [...document.querySelectorAll('[data-motion-name]')];
    if (!sections.length) return { error: 'no [data-motion-name] sections in the DOM' };

    /* THE ARRIVAL STATE, READ BEFORE ANY SCROLL.
     *
     * ⚠ THIS IS A SEPARATE MEASUREMENT BECAUSE THE WALK DESTROYS THE THING IT
     * WOULD NEED TO SEE. Every step below starts with `window.scrollTo(...)`,
     * which fires a scroll event, which runs BaseLayout's `onScroll` ->
     * `apply(nearest())`. So by the time the loop reads her pose for the FIRST
     * section, the page has already corrected itself — and a defect that only
     * exists BEFORE the first scroll is invisible to this whole walk.
     *
     * MEASURED, and it cost a mutation-battery case to find. Deleting
     * BaseLayout's immediate `apply(first)` (the line whose comment says a
     * visitor "who lands mid-page — a deep link, or a reload that restores
     * scroll position — must not see the resting pose until they move") left the
     * gate GREEN at 16/16. The two states, probed directly on the same build:
     *
     *     pristine    : before any scroll  pose=princess-peace   <- correct
     *     mutation    : before any scroll  pose=princess-wave    <- the defect
     *     both        : after one scrollTo pose=princess-peace   <- identical
     *
     * The user-visible symptom is real (you deep-link to `#kontak` and her
     * expression is wrong until you nudge the page), so the gate owes it an
     * assertion. `arrival` below is that measurement. */
    const arrival = {
      pose: tracked.getAttribute('data-pose'),
      src: new URL(tracked.currentSrc || tracked.src).pathname,
      scrollY: Math.round(window.scrollY),
    };

    const out = [];
    for (const section of sections) {
      // Put this section's midpoint on the viewport's midpoint. Clamped to the
      // document, because the last sections cannot be centred on a short page.
      const box = section.getBoundingClientRect();
      const docMid = window.scrollY + box.top + box.height / 2;
      const target = Math.max(0, docMid - window.innerHeight / 2);
      window.scrollTo({ top: target, behavior: 'instant' });

      // Two frames for the rAF-throttled handler, plus the swap's own two-frame
      // restart in BaseLayout. Six frames is comfortably past both and keeps the
      // walk fast; the swap is not a timed transition so there is nothing to
      // wait out.
      for (let f = 0; f < 6; f++) await new Promise((r) => requestAnimationFrame(r));

      const cs = getComputedStyle(tracked);
      const b = tracked.getBoundingClientRect();
      out.push({
        sectionId: section.id,
        sectionPose: section.getAttribute('data-pose'),
        sectionMotion: section.getAttribute('data-motion-name'),
        sectionEnter: section.getAttribute('data-enter'),
        // What SHE is now, which is the thing under test — not what the
        // section asked for. Reading the section's own attribute back would
        // pass even if the script never ran.
        mascotPose: tracked.getAttribute('data-pose'),
        mascotMotion: tracked.getAttribute('data-motion'),
        mascotSrc: new URL(tracked.currentSrc || tracked.src).pathname,
        /* The RESOLVED intrinsic size. This is the only evidence that the
           PICTURE changed rather than an attribute: each pose render is
           trimmed to its own silhouette, so the poses have different
           dimensions (measured: 512x844, 512x904, 512x1051, 512x796, 224x358).
           Collected here so the picture assertion needs no second copy of the
           pose table — see the note on that assertion. */
        nat: `${tracked.naturalWidth}x${tracked.naturalHeight}`,
        anim: cs.animationName,
        // The visibility evidence. `0 × 0` means `display:none` somewhere up
        // the tree, which is the defect this part was written to catch.
        w: Math.round(b.width),
        h: Math.round(b.height),
        display: cs.display,
      });
    }
    return { rows: out, arrival };
  });

  await ctx.close();
  if (rows.error) throw new Error(`${rows.error} (at ${width}px)`);
  return rows;
}

/* The width the tracked mascot is actually laid out at. See the long note
   above: this is Tailwind's `xl`, which is what `hidden xl:block` keys on. */
const TRACK_WIDTH = 1280;
const WALK_RESULT = await walkSections(TRACK_WIDTH);
const WALK = WALK_RESULT.rows;
/* Her state on ARRIVAL, before the walk's first scroll. Asserted separately —
   see the long note in `walkSections` for the measurement that proved the walk
   cannot see this. */
const ARRIVAL = WALK_RESULT.arrival;

/* A green run must not come from measuring nothing. If the selector stops
   matching (component renamed, pose src changed, section moved), every
   assertion below becomes vacuous — so this is asserted FIRST and loudly. */
await test('the princess mascot is present on the landing page', async () => {
  if (!NORMAL.length) {
    throw new Error(
      `no element matched ${PRINCESS_SELECTOR} — the mascot is gone, renamed, or its ` +
        `src pattern changed. Every check below would pass vacuously, so this fails first.`,
    );
  }
});

/* ⚠ "LOADED" IS ONLY ASSERTED FOR MASCOTS THAT ARE ACTUALLY RENDERED.
 *
 * The rail mascot is `display: none` below 1280px (measured: `0x0` at 390, 768,
 * 1024 and 1279), and this function measures at 390. A `display:none` image is
 * NEVER fetched — the browser has no reason to load a picture it will not paint
 * — so requiring `complete` on it fails for a correct page. Measured: she stays
 * `0x0` / `complete: false` after wheeling the full 14,432px and waiting.
 *
 * The two are therefore reported as separate verdicts, because they are
 * different diagnoses and merging them is how a scroll bug gets "fixed" by
 * editing an asset:
 *
 *   - RENDERED but not loaded  -> a real defect (broken src, or the wheel did
 *     not reach it). Asserted below.
 *   - NOT RENDERED             -> not measured here at all. Her tracking is
 *     asserted in PART TWO at 1280px, where the rail is laid out.
 */
await test('the mascot is fully LOADED, not a broken or missing src', async () => {
  const rendered = NORMAL.filter((r) => r.rendered);
  const notRendered = NORMAL.filter((r) => !r.rendered);

  const broken = rendered.filter((r) => r.complete && (r.nat === '0x0' || r.h === 0));
  if (broken.length) {
    throw new Error(
      `mascot is rendered but has no intrinsic size: ` +
        `${broken.map((b) => `${b.src} natural=${b.nat} complete=${b.complete} h=${b.h}`).join(', ')}. ` +
        `A \`complete\` image reporting \`0x0\` means the src resolved to something that is not a ` +
        `decodable image. If the file serves HTTP 200, check the format rather than the markup.`,
    );
  }

  const unloaded = rendered.filter((r) => !r.complete);
  if (unloaded.length) {
    throw new Error(
      `${unloaded.length} RENDERED mascot(s) never finished loading within the budget: ` +
        `${unloaded.map((b) => `${b.src} (${b.w}x${b.h})`).join(', ')}. ` +
        `WHEEL REPORT: target=${NORMAL_WHEEL.target} travelled=${NORMAL_WHEEL.travelled} ` +
        `anyVisible=${NORMAL_WHEEL.inView}. ` +
        `NOTE this is "not measured", not "broken". \`loading="lazy"\` defers the fetch until ` +
        `the browser's own scroll machinery decides the element is near, and a programmatic ` +
        `\`scrollTo\` does NOT engage it — measured: \`mouse.wheel\` triggers the fetch, ` +
        `\`scrollTo\` and \`scrollIntoView\` do not. If \`anyVisible\` is false the wheel did not ` +
        `reach her: fix the WHEEL, not the asset.`,
    );
  }

  /* The control. If EVERY match were unrendered, all of the above would pass
     over an empty list and this test would report a footer of nothing. */
  if (!rendered.length && NORMAL.length) {
    throw new Error(
      `every princess match is unrendered (${notRendered.map((r) => r.src).join(', ')}) — nothing ` +
        `was actually measured. At 390px that means the in-page Tentang mascot is gone too, which ` +
        `is a markup change rather than the known rail breakpoint.`,
    );
  }
  if (notRendered.length) {
    console.log(
      `   (note: ${notRendered.length} mascot(s) not rendered at this width and therefore not ` +
        `load-checked — ${notRendered.map((r) => r.src).join(', ')}; see PART TWO for 1280px)`,
    );
  }
});

/* CLAIM 1 — the idle runs by default. This is the half that makes the
   reduced-motion half meaningful: a gate that only proved "no animation under
   reduce" would pass just as happily if the animation had been deleted.

   ⚠ THIS ASSERTS *AN* IDLE, NOT SPECIFICALLY `mascot-sway`, AND THE REASON IS
   NOW A FEATURE RATHER THAN A LOOSENING.

   It used to require `mascot-sway` on every mascot. That was written when the
   tracking block was dead and the rail mascot therefore never moved off her
   initial `sway` — so the assertion encoded the BUG as the expected value.
   Now that she actually follows the scroll, she carries whichever idle her
   current section names; by the time `measure()` samples her the page may be
   scrolled anywhere, and `layanan` (for example) legitimately gives her
   `mascot-lean`. Both are correct.

   What must hold at every position is that SOME idle from `MASCOT_MOTIONS` is
   running — the entrance finishes, so a mascot with no idle is a still image.
   The specific per-section mapping is CLAIM 4's job, where it is compared
   against the table that defines it.

   ⚠ AND `mascot-enter-soft` IS REQUIRED ONLY WHEN SHE HAS NOT YET SWAPPED.
   motion.css §7b states the design explicitly: "NOTE THE ENTRANCE IS
   DELIBERATELY NOT REPEATED HERE. `.mascot` already supplies
   `mascot-enter-soft ... both`, and re-declaring it would restart the fade at
   every section boundary." So once the tracking script has written
   `data-motion`, the `[data-motion="..."]` rule replaces the WHOLE shorthand
   and the computed name is the idle ALONE — measured as exactly
   `"mascot-lean"`, with no entrance in the list. Requiring the entrance
   unconditionally would fail on the page's normal working state, which is the
   assertion being wrong rather than the page.

   Both states are therefore allowed, and the requirement is stated in terms of
   what is actually invariant: an idle is always running, and the entrance is
   present UNTIL the first swap replaces it. */
await test('motion ON: an idle from MASCOT_MOTIONS is running (entrance alone is not enough)', async () => {
  for (const r of NORMAL) {
    const idle = MASCOT_MOTIONS.find((m) => r.anim.includes(`mascot-${m}`));
    if (!idle) {
      throw new Error(
        `${r.src}: the computed animation-name ${JSON.stringify(r.anim)} contains no idle from ` +
          `MASCOT_MOTIONS (${MASCOT_MOTIONS.join(', ')}). Either the class was dropped from the ` +
          `markup, or a later/higher-specificity rule is overriding it. Note \`mascot-enter-soft\` ` +
          `alone is NOT enough — the entrance runs once and finishes; the idle IS the character.`,
      );
    }
    /* The entrance is required only while she is still on her initial pose —
       see the note above and motion.css §7b. `data-motion` present means the
       tracking script has swapped her, and the swap deliberately drops it. */
    const swapped = r.anim !== 'none' && !r.anim.includes('mascot-enter-soft');
    if (swapped) {
      // Documented consequence of the §7b retarget, not a defect. Asserted so a
      // future change that ALSO drops the idle cannot hide behind this branch.
      if (!MASCOT_MOTIONS.some((m) => r.anim.includes(`mascot-${m}`))) {
        throw new Error(`${r.src}: swapped-but-idleless — ${JSON.stringify(r.anim)}`);
      }
    }
  }
});

/* CLAIM 2a — under `reduce`, the cascade DOES stop her. This is the assertion
   the motion.css comment names. */
await test('motion REDUCE: computed animation-name is none', async () => {
  if (!REDUCED.length) {
    throw new Error(
      `no mascot in the reduced-motion context either — the two runs are not measuring the ` +
        `same page, so this verdict is not comparable to the one above.`,
    );
  }
  for (const r of REDUCED) {
    if (r.anim !== 'none') {
      throw new Error(
        `${r.src}: expected animation-name "none" under prefers-reduced-motion: reduce, got ` +
          `${JSON.stringify(r.anim)}. The reduced-motion block relies on \`.mascot\` (0,1,0) ` +
          `beating \`.mascot-sway\` (0,1,0) purely by SOURCE ORDER — there is no explicit ` +
          `\`.mascot-sway\` override. Likely causes: .mascot-sway moved below the reduced-motion ` +
          `block, an !important was added, the selector is now \`.mascot.mascot-sway\` (0,2,0), ` +
          `or the block moved to a stylesheet that loads earlier. Fix the cascade — do NOT add ` +
          `an !important or a duplicate \`.mascot-sway { animation: none }\` line; motion.css ` +
          `explains why the omission is deliberate.`,
      );
    }
  }
});

/* CLAIM 2b — and she must not VANISH. This is the assertion that catches the
   clamp-from-duration regression, which `animation-name: none` cannot see:
   under that bug the name resolves to `mascot-enter`, or to none with the
   fill frame still applied, and she renders at opacity 0 either way. */
await test('motion REDUCE: the mascot is still fully VISIBLE (the opacity:0 trap)', async () => {
  for (const r of REDUCED) {
    if (Number(r.opacity) < 0.99) {
      throw new Error(
        `${r.src}: opacity is ${r.opacity} under reduced motion — she is faded or invisible. ` +
          `This is the perverse failure the reduced-motion block exists to prevent: every ` +
          `mascot rule uses \`animation-fill-mode: both\`, and \`mascot-enter\` STARTS at ` +
          `opacity: 0, so shortening the duration instead of removing the animation leaves a ` +
          `visitor who asked for less motion with NO mascot at all. The block must keep ` +
          `\`animation: none; opacity: 1; transform: none\` together.`,
      );
    }
    /* A residual transform is the same bug one layer down: the
       `mascot-sway` keyframes move her, so if the fill frame is still applied
       she sits permanently rotated. `none` is what the block sets. */
    if (r.transform !== 'none' && !/^matrix\((1,\s*0,\s*0,\s*1,\s*0,\s*0)\)$/.test(r.transform)) {
      throw new Error(
        `${r.src}: transform is ${r.transform} under reduced motion, expected "none". ` +
          `A non-identity transform means a mascot keyframe is still being applied through the ` +
          `fill — she would sit permanently swayed or squashed.`,
      );
    }
  }
});

/* CLAIM 2c — "still visible" is only worth asserting if she is on screen when
   measured. Without this, CLAIM 2b could pass on an element that is present
   in the DOM but scrolled far out of view, and the check would be an
   assertion about markup rather than about anything a visitor sees. */
await test('the reduced-motion mascot was measured IN VIEW', async () => {
  const off = REDUCED.filter((r) => !r.inView && r.h > 0);
  if (off.length && off.length === REDUCED.length) {
    throw new Error(
      `every mascot was off-screen when measured (${off.map((r) => r.src).join(', ')}). ` +
        `The scroll in measure() did not reach her, so the visibility verdict describes an ` +
        `element nobody could see. Fix the scroll rather than relaxing this.`,
    );
  }
});

/* The control, so a green run cannot come from the emulation never applying.
   `measure(true)` must genuinely produce a different cascade from
   `measure(false)`; if both runs agree, the "reduce" context is not taking
   effect and CLAIM 2a is passing for the wrong reason. */
await test('OK-GREEN CONTROL: the two contexts really do differ', async () => {
  const on = NORMAL.map((r) => r.anim).join('|');
  const off = REDUCED.map((r) => r.anim).join('|');
  if (on === off) {
    throw new Error(
      `animation-name is identical with and without prefers-reduced-motion (${JSON.stringify(on)}). ` +
        `That means the reduced-motion emulation did not apply — most likely the context option ` +
        `was ignored or the media query is not being evaluated. With both contexts behaving the ` +
        `same, the "reduce" assertions above prove nothing.`,
    );
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   ── PART TWO, CONTINUED: THE TRACKING ASSERTIONS ───────────────────────────
   ═══════════════════════════════════════════════════════════════════════════ */

/* CLAIM 3 — SHE IS ACTUALLY RENDERED. This is the assertion that would have
   caught the defect PART TWO was written for, and it is deliberately FIRST and
   deliberately about the BOX rather than about the computed animation.

   `display: none` is the reason this matters: an element inside it reports a
   correct `animation-name`, a correct `opacity` and a `0 × 0` box. Every other
   assertion in this file is happy in that state. Only the box tells the truth,
   and "the mascot follows the scroll" is a claim about something a visitor can
   SEE. */
await test('tracking: the tracked mascot is RENDERED at the tracked width', async () => {
  const dead = WALK.filter((r) => r.w === 0 || r.h === 0);
  if (dead.length) {
    const ids = [...new Set(dead.map((r) => r.sectionId))].join(', ');
    throw new Error(
      `the tracked mascot has a ZERO-SIZED box while these sections are current: ${ids}. ` +
        `At ${TRACK_WIDTH}px the rail should be laid out (it is \`hidden xl:block\`, and Tailwind's ` +
        `xl is ${TRACK_WIDTH}px). A zero box means an ancestor is \`display: none\` — measured ` +
        `display=${dead[0].display}. This is the failure the whole second half of this file exists ` +
        `to catch: a \`display:none\` element still resolves its CSS, so every cascade assertion ` +
        `above passes for a mascot NOBODY CAN SEE. Do not relax this check — fix the rail's ` +
        `breakpoint, or move this test's width, but find out which.`,
    );
  }
});

/* CLAIM 3b — SHE IS ALREADY CORRECT ON ARRIVAL, BEFORE THE VISITOR SCROLLS.
 *
 * This assertion exists because a mutation-battery case proved the walk could
 * not see the defect it was written to catch. See the long note on `arrival` in
 * `walkSections`: the walk's first action is a scroll, so it measures the page
 * only AFTER `onScroll` has corrected her. Deleting BaseLayout's immediate
 * `apply(first)` therefore left the gate green while a deep-link visitor saw the
 * resting pose until they moved the page.
 *
 * The expected value is the pose of the section she is actually beside on
 * arrival, which at `scrollY = 0` is the FIRST section — asserted against
 * `SECTION_MOTION` rather than hard-coded, so reordering the sections does not
 * silently invalidate this. */
await test('tracking: she is ALREADY posed for the first section before any scroll', async () => {
  if (ARRIVAL.scrollY !== 0) {
    throw new Error(
      `this assertion assumes arrival at scrollY=0, but the page arrived at ` +
        `${ARRIVAL.scrollY}. The arrival measurement is only meaningful at the top of the ` +
        `document — a restored scroll position would make it a different test.`,
    );
  }
  const first = SECTION_MOTION[0];
  if (!first) {
    throw new Error('SECTION_MOTION is empty — nothing to compare the arrival pose against.');
  }
  if (ARRIVAL.pose !== first.pose) {
    throw new Error(
      `she arrived showing pose "${ARRIVAL.pose}" (${ARRIVAL.src}) but the first section ` +
        `"${first.id}" asks for "${first.pose}". A visitor landing at the top of the page sees ` +
        `the wrong expression until their first scroll event corrects it. This is the state a ` +
        `deep link or a restored scroll position lands in, and the walk above CANNOT detect it ` +
        `because it scrolls before it reads. Check BaseLayout's immediate \`apply(first)\` — ` +
        `the comment there says exactly this must not happen.`,
    );
  }
  /* The src must follow, for the same reason as the walk's pose assertion: the
     attribute is a marker and the picture is the thing a visitor sees. */
  if (!ARRIVAL.src.includes(`/${first.pose}.`)) {
    throw new Error(
      `she arrived with data-pose="${ARRIVAL.pose}" but resolved ${ARRIVAL.src}, which is not ` +
        `a ${first.pose} file. The attribute moved and the picture did not.`,
    );
  }
});

/* CLAIM 4 — THE OWNER'S REQUEST, MEASURED. "mau ke sesi terus jadi pindah
   ikutin bagian dan posenya beda beda tergantung tempat baik mimik wajah
   maupun motionnya" — walking the page must change BOTH her expression (the
   `data-pose` / `src`) and her idle (the `data-motion`, and the computed
   `animation-name` that resolves from it).

   The comparison is against `SECTION_MOTION`, the table the page itself was
   built from, so a drift between the markup and the intent fails here. */
await test('tracking: her POSE follows the section, per src/lib/sectionMotion.ts', async () => {
  const mismatches = [];
  for (const r of WALK) {
    const want = SECTION_MOTION.find((s) => s.id === r.sectionId);
    if (!want) {
      mismatches.push(`${r.sectionId}: no row in SECTION_MOTION but the section declares a motion`);
      continue;
    }
    if (r.mascotPose !== want.pose) {
      mismatches.push(`${r.sectionId}: mascot data-pose=${r.mascotPose}, table says ${want.pose}`);
    }
    /* The src must follow the attribute, or the attribute is decorative: a
       `data-pose` that disagrees with the rendered file is the "half-swap" this
       whole mechanism was designed to avoid.

       ⚠ THE EXTENSION IS NOT ASSERTED, AND THAT IS DELIBERATE. The markup is a
       `picture` with an AVIF `<source>` first, so Chromium loads
       `/mascot/princess-peace.avif` and NEVER the `.webp` — measured, and the
       first version of this assertion failed on all 15 rows for exactly that
       reason, comparing against a `.webp` the browser had no intention of
       fetching. Pinning the extension would fail on a browser without AVIF
       support and on any future reordering of the `<source>` list, so the
       assertion is on the POSE NAME, which is the thing that must track the
       section. Verified separately that all three formats exist and serve
       byte-identical (HTTP 200, `image/avif`, 42195 bytes for the 1x wave). */
    if (!r.mascotSrc.includes(`/${want.pose}.`)) {
      mismatches.push(`${r.sectionId}: rendered ${r.mascotSrc}, expected a pose file for ${want.pose}`);
    }
  }
  if (mismatches.length) {
    throw new Error(
      `the mascot's pose does not follow the scroll:\n       · ${mismatches.join('\n       · ')}\n` +
        `     Either BaseLayout's tracking block is not applying, or the section's own ` +
        `data-pose disagrees with the table. NOTE the class list is only the INITIAL pose — ` +
        `reading it back would pass without any script running, which is why this compares ` +
        `data-pose AND the rendered src.`,
    );
  }
});

await test('tracking: her MOTION follows the section, and the cascade agrees', async () => {
  const mismatches = [];
  for (const r of WALK) {
    const want = SECTION_MOTION.find((s) => s.id === r.sectionId);
    if (!want) continue;
    if (r.mascotMotion !== want.motion) {
      mismatches.push(`${r.sectionId}: mascot data-motion=${r.mascotMotion}, table says ${want.motion}`);
    }
    /* The computed name is the INDEPENDENT half: `data-motion` is what the
       script wrote, `animation-name` is what the cascade resolved. Asserting
       only the attribute would pass if `[data-motion="..."]` in motion.css lost
       to something else — she would carry the right attribute and still play
       the wrong idle, which is exactly the collision that made all four new
       idles unplayable before §7b was fixed. */
    if (!r.anim.includes(`mascot-${want.motion}`)) {
      mismatches.push(
        `${r.sectionId}: data-motion=${r.mascotMotion} but computed animation-name=${r.anim} ` +
          `(expected it to include mascot-${want.motion})`,
      );
    }
  }
  if (mismatches.length) {
    throw new Error(
      `the mascot's idle does not follow the scroll:\n       · ${mismatches.join('\n       · ')}\n` +
        `     A right attribute with a wrong computed name means a CSS rule is shadowing ` +
        `[data-motion="..."] (0,2,0) — check §7b's retarget block, not the script.`,
    );
  }
});

/* CLAIM 5 — SHE ACTUALLY MOVES BETWEEN SECTIONS. The sibling of the
   "OK-GREEN CONTROL" above: if the walk collected the same pose at every stop,
   CLAIM 4 would pass on a table with one row and the owner's request would be
   unmet. This asserts the walk OBSERVED change, not merely agreement. */
await test('tracking: the walk observed her CHANGE at least twice (anti-vacuity)', async () => {
  const poses = new Set(WALK.map((r) => r.mascotPose));
  const motions = new Set(WALK.map((r) => r.mascotMotion));
  const anims = new Set(WALK.map((r) => r.anim));
  if (poses.size < 2 || motions.size < 2) {
    throw new Error(
      `walking ${WALK.length} sections produced only ${poses.size} distinct pose(s) and ` +
        `${motions.size} distinct motion(s) — the mascot is NOT following the scroll, she is ` +
        `frozen at her initial value. ${JSON.stringify([...anims].slice(0, 3))}`,
    );
  }
  /* Five motions exist and the table uses all five; fewer than four distinct
     computed names means some section's idle is being shadowed even though its
     attribute is right. That is the silent half of the §7b collision. */
  if (anims.size < 4) {
    throw new Error(
      `only ${anims.size} distinct computed animation-name(s) across the walk: ` +
        `${JSON.stringify([...anims])}. The table assigns ${new Set(SECTION_MOTION.map((s) => s.motion)).size} ` +
        `distinct motions, so sections with different attributes are resolving to the same idle — ` +
        `a CSS rule is winning over [data-motion].`,
    );
  }
});

/* CLAIM 5b — THE PICTURE SWAPS, NOT JUST THE ATTRIBUTE. This is the assertion
   that would have caught the defect that made the whole pose feature inert.

   `data-pose` is only a MARKER; nothing in the CSS or the scripts reads it. The
   thing that actually changes is the `<picture>`'s `<source srcset>` and the
   `<img src>`, so the only honest evidence is what the browser RESOLVED — the
   resolved src AND its intrinsic size. The first version of the tracking wrote
   `data-pose` and nothing else, and all 15 sections went on rendering
   `/mascot/princess-wave.*`: the attribute said `princess-peace` while the
   pixels stayed `wave` and `naturalWidth` stayed 512.

   ⚠ TWO STRUCTURAL CHECKS, NOT JUST A FILENAME CHECK. Comparing the resolved
   src alone would still pass if only `<img src>` were rewritten while the AVIF
   `<source srcset>` kept the old pose — `currentSrc` follows the SOURCE in any
   modern browser, so requiring the file name to be right already covers that.
   What the filename cannot see is a STALE SOURCE that resolves to the right
   NAME with the wrong BYTES, so the intrinsic size is checked for consistency
   as well: sections asking for the same pose must agree on its dimensions.

   The expected dimensions are NOT imported. `PRINCESS_POSE` lives in
   `PrincessMascot.astro`, and Node cannot import an `.astro` file (measured:
   `Unknown file extension ".astro"`). Duplicating the table here would create
   the second source of truth this design avoids, so the assertion tests a
   PROPERTY instead: same pose => same size, and the poses do not all share one
   size. A partial rewrite cannot satisfy both. */
await test('tracking: the rendered PICTURE swaps, not just the data-pose marker', async () => {
  const wrong = [];
  const sizeByPose = new Map();

  for (const r of WALK) {
    const want = SECTION_MOTION.find((s) => s.id === r.sectionId);
    if (!want) continue;

    if (!r.mascotSrc.includes(`/${want.pose}.`)) {
      wrong.push(`${r.sectionId}: resolved ${r.mascotSrc}, wanted a ${want.pose} file`);
      continue;
    }
    const seen = sizeByPose.get(want.pose);
    if (seen && seen !== r.nat) {
      wrong.push(
        `${r.sectionId}: pose ${want.pose} rendered at ${r.nat}, but ${seen} earlier — the ` +
          `intrinsic size is inconsistent, so a stale <source> is still resolving`,
      );
    } else if (!seen) {
      sizeByPose.set(want.pose, r.nat);
    }
  }

  /* Anti-vacuity. If every pose resolved to ONE size, the per-pose consistency
     check passes trivially and proves nothing about the picture changing. The
     measurement that disproves it is that the five renders really do differ. */
  const distinct = new Set([...sizeByPose.values()]);
  if (sizeByPose.size > 1 && distinct.size < 2) {
    wrong.push(
      `all ${sizeByPose.size} distinct poses resolved to the SAME intrinsic size ` +
        `(${[...distinct][0]}) — the picture is not actually changing between sections`,
    );
  }

  if (wrong.length) {
    throw new Error(
      `the mascot's PICTURE does not follow the scroll:\n       · ${wrong.join('\n       · ')}\n` +
        `     \`data-pose\` is a marker that NOTHING reads — measured, \`grep -rn 'data-pose' src/\` ` +
        `finds only writers. The picture is chosen by the <picture>'s <source srcset> and the ` +
        `<img src>, so a swap that updates the attribute alone leaves her showing the SAME image ` +
        `in every section. That is the "half-swap that reads as a bug" this mechanism exists to ` +
        `avoid. Fix \`setPose\` in BaseLayout, not this assertion.`,
    );
  }
}
);

/* CLAIM 6 — THE ENTRANCE HALF. "tiap bagian kek layanan, hero, galery, contacu
   us tolong setiap scrollnya bikin transisi beda beda" — every section must
   arrive DIFFERENTLY. Asserted against the same table, and against the KEYFRAME
   actually resolved, so a `data-enter` with no matching rule fails here rather
   than producing a band that silently never animates. */
await test('entrances: every section resolves to its own entrance keyframe', async () => {
  const offenders = [];
  for (const r of WALK) {
    const want = SECTION_MOTION.find((s) => s.id === r.sectionId);
    if (!want) continue;
    if (r.sectionEnter !== want.enter) {
      offenders.push(`${r.sectionId}: data-enter=${r.sectionEnter}, table says ${want.enter}`);
    }
    if (!ENTER_KINDS.includes(want.enter)) {
      offenders.push(`${r.sectionId}: table names entrance "${want.enter}", not in ENTER_KINDS`);
    }
  }
  if (offenders.length) {
    throw new Error(`section entrances drifted from src/lib/sectionMotion.ts:\n       · ${offenders.join('\n       · ')}`);
  }
});

/* The entrance control. `data-enter` is on the SECTION, so it is read directly
   rather than through the walk — but the number of DISTINCT kinds is what makes
   "beda beda" true, and a table that assigned one kind everywhere would satisfy
   every assertion above. This is the one that fails in that case. */
await test('entrances: the page uses several DIFFERENT kinds, not one fade repeated', async () => {
  const kinds = new Set(WALK.map((r) => r.sectionEnter).filter(Boolean));
  const declared = new Set(SECTION_MOTION.map((s) => s.enter));
  if (kinds.size < 4) {
    throw new Error(
      `only ${kinds.size} distinct entrance kind(s) across ${WALK.length} sections: ${JSON.stringify([...kinds])}. ` +
        `The owner asked for a DIFFERENT transition per section ("setiap scrollnya bikin transisi beda beda"); ` +
        `one kind repeated is one animation played many times. The table declares ${declared.size}.`,
    );
  }
});

/* CLAIM 7 — NO ADJACENT REPEAT, the qualitative half. Two neighbouring bands
   showing the same expression makes the second read as "still the same place",
   which is what the table's ordering rule exists to prevent. Purely a property
   of the table, but asserted HERE because it is the property that makes the
   measured changes readable rather than merely present. */
await test('tracking: no two ADJACENT sections repeat a pose or a motion', async () => {
  const bad = [];
  for (let i = 1; i < SECTION_MOTION.length; i++) {
    const a = SECTION_MOTION[i - 1];
    const b = SECTION_MOTION[i];
    if (a.pose === b.pose) bad.push(`${a.id} and ${b.id} share pose ${a.pose}`);
    if (a.motion === b.motion) bad.push(`${a.id} and ${b.id} share motion ${a.motion}`);
  }
  if (bad.length) {
    throw new Error(`adjacent sections repeat:\n       · ${bad.join('\n       · ')}`);
  }
});

/* The vocabulary check, so the table cannot name a motion that has no
   keyframes. `verify:keyframes` covers the CSS half (every animation-name
   resolves); this covers the DATA half (every table value is a known motion). */
await test('tracking: every table motion is a known MASCOT_MOTIONS value', async () => {
  const unknown = SECTION_MOTION.filter((s) => !MASCOT_MOTIONS.includes(s.motion));
  if (unknown.length) {
    throw new Error(
      `SECTION_MOTION names motion(s) with no entry in MASCOT_MOTIONS: ` +
        `${unknown.map((s) => `${s.id}=${s.motion}`).join(', ')}. A motion with no keyframes ` +
        `resolves to animation-name that matches nothing, so she goes still with no error anywhere.`,
    );
  }
});

await browser.close();

const failed = results.filter(([s]) => s === 'fail');
console.log(
  `\nnormal-motion animation: ${NORMAL.map((r) => r.anim).join(', ') || '(none found)'}`,
);
console.log(
  `reduced-motion animation: ${REDUCED.map((r) => `${r.anim} opacity=${r.opacity}`).join(', ') || '(none found)'}`,
);
/* Printed because it is the ONE measurement the walk cannot take: everything
   below is read after the walk has scrolled, this is read before. */
console.log(
  `arrival at scrollY=${ARRIVAL.scrollY}: pose=${ARRIVAL.pose}  src=${ARRIVAL.src}`,
);
if (WALK.length) {
  console.log(`\nsection walk at ${TRACK_WIDTH}px — pose / motion / box:`);
  for (const r of WALK) {
    console.log(
      `  ${String(r.sectionId).padEnd(16)} ${String(r.mascotPose).padEnd(17)} ` +
        `${String(r.mascotMotion).padEnd(7)} ${r.w}×${r.h}  anim=${r.anim}  enter=${r.sectionEnter}`,
    );
  }
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
