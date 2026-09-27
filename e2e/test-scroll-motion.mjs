/**
 * e2e/test-scroll-motion.mjs — the §9f scroll drift must RUN, MOVE, and REVERSE.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The owner asked for two things about motion (2026-09-27):
 *
 *   "animasi css apakah bisa di perlambaat dan di pakai terus menerus? jadi
 *    interactifnya gak sekali pakai tapi selama user masih di scroll atas bawah
 *    animasi cssnya jalan terus."
 *
 * i.e. the section motion must be SLOWER and CONTINUOUS — a function of scroll
 * position, so scrolling back up runs it backwards — rather than a one-shot
 * entrance. `motion.css` §9f implements that with `animation-timeline: view()`.
 *
 * ── THE DEFECT CLASS THIS PINS ──────────────────────────────────────────────
 * §9f is gated on TWO conditions a stylesheet reader cannot evaluate:
 *
 *     @supports (animation-timeline: view())
 *     @media (prefers-reduced-motion: no-preference)
 *
 * If either is false in the browser under test, the drift simply never applies.
 * The CSS still reads correctly, every static gate (`verify:keyframes`,
 * `verify:classes`) still passes, and the page is silently missing the feature
 * the owner asked for. That is the failure mode this file exists to catch — and
 * it is not hypothetical here: §9d already records the sibling trap where
 * `overflow: hidden` on the frame makes it a scroll container, pins the
 * timeline, and freezes the transform at one value while the CSS looks fine.
 *
 * ── WHAT EACH ASSERTION IS, AND WHY IT IS NOT THE OTHER ONE ────────────────
 *   A. CONTINUOUS   — sample the computed transform at five scroll offsets
 *                     across the band and require MORE THAN ONE DISTINCT VALUE.
 *                     A one-shot entrance yields the SAME value at every offset
 *                     once it has fired, which is exactly the "sekali pakai"
 *                     behaviour being replaced. This is the assertion that
 *                     catches a pinned timeline.
 *   B. REVERSIBLE   — scroll past a sample point, then come back UP to it, and
 *                     require the two reads to MATCH. A time-based animation
 *                     gives a different value the second time (more time has
 *                     elapsed). Only a position-derived animation gives the
 *                     same one — so this is what separates "an animation is
 *                     running" from "`animation-timeline` is actually in force".
 *   C. SLOWED       — the travel across the band must be SMALL. The request was
 *                     to slow it down, and a drift that flings a whole band
 *                     across the viewport is the opposite of that. §9f is
 *                     designed to move ~10px, so the ceiling is generous
 *                     (60px) and only catches an order-of-magnitude regression.
 *   D. NO COLLISION — §9d's measured rule: a CSS animation on `transform`
 *                     OVERRIDES a `transition` on the same property of the
 *                     SAME element, so a drift sitting on a `u-lift`/`u-zoom`
 *                     element kills the hover recipe SILENTLY. Asserted
 *                     structurally over the live DOM: no element carrying
 *                     `data-scroll` / `data-scroll-item > *` may also carry a
 *                     §9c hover class. A future edit that moves the drift onto
 *                     the hoverable card is what this reports.
 *
 * ── THE CONTROL (why a green run is not vacuous) ───────────────────────────
 * "All four bands moved" could also be observed if the reading itself were
 * broken — e.g. if `getComputedStyle().transform` returned a different string at
 * every offset for an unrelated reason. So a POSITIVE CONTROL is measured in the
 * same page: an element with §9f's declarations deliberately NOT applied must
 * read a CONSTANT transform across the same offsets. If the control also moves,
 * the sampler is measuring the scroll, not the animation, and the verdict above
 * is worthless. This mirrors the OK-GREEN CONTROL in test-theme-gradients.mjs.
 *
 * ── WHY A REAL HTTP SERVER ──────────────────────────────────────────────────
 * `file://` does not resolve the site's absolute paths and does not run the
 * inline module graph the same way, so it reports "no js-reveal class",
 * `animationName: none` and a constant transform for a page that is fine —
 * harness failures that look exactly like page failures. Run against a built
 * artifact served over HTTP:
 *
 *   node .tmp-serve-dist.mjs                                   # serves dist/ :4400
 *   BASE_URL=http://127.0.0.1:4400 node e2e/test-scroll-motion.mjs
 *
 * `--no-proxy-server`: this sandbox exports HTTP(S)_PROXY and Chromium would
 * otherwise send 127.0.0.1 through it and read a 502 as "server down".
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4400';
const ROUTE = '/';
const VIEWPORT = { width: 1280, height: 800 };

/** The four sections §9f is expected to move, by anchor id. */
const BANDS = ['layanan', 'penempatan', 'galeri', 'tim'];

/** §9f's own animation names. A band reporting `enter-*` means §9b won. */
const SCROLL_ANIM = /^scroll-/;

/**
 * §9f's drift is ~10px by design. This ceiling only catches an order-of-
 * magnitude regression (a band flung across the viewport), not a taste change.
 * See the header: the request was to SLOW it down.
 */
const MAX_TRAVEL_PX = 60;

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

/** Read transform + animation-name for a selector, in-page. */
const READ = (selector) =>
  `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { t: cs.transform, name: cs.animationName };
  })()`;

/** Parse the Y translation out of a computed `matrix(...)`/`matrix3d(...)`. */
function translateY(transform) {
  if (!transform || transform === 'none') return 0;
  const m = transform.match(/matrix3?d?\(([^)]+)\)/);
  if (!m) return 0;
  const parts = m[1].split(',').map((s) => Number(s.trim()));
  // matrix(a,b,c,d,tx,ty) -> ty is index 5; matrix3d has it at index 13.
  return parts.length >= 16 ? parts[13] : parts[5];
}

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'no-preference' });
const page = await ctx.newPage();

const resp = await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
if (resp?.status() !== 200) {
  console.error(`ABORT: GET ${ROUTE} returned ${resp?.status()} — refusing to read an error page.`);
  await browser.close();
  process.exit(1);
}
await page.waitForFunction(() => window.__asjReveal !== undefined, { timeout: 30_000 });
await page.evaluate(() => window.__asjReveal());
await page.waitForTimeout(400);

/**
 * ── BRING EVERY BAND TO ITS REAL ENTRANCE STATE FIRST ───────────────────────
 * This is not tidiness. §9b's one-shot entrance declares its `animation-name`
 * ONLY on `.is-entered` (`html.js-reveal [data-enter="…"].is-entered` at
 * (0,3,1)), and `.is-entered` is added by the IntersectionObserver when a band
 * crosses into view. A band above the fold that the caller never scrolled to
 * therefore matches NO §9b rule at all — and §9f wins by DEFAULT rather than by
 * specificity.
 *
 * THAT MAKES A SPECIFICITY DEFECT INVISIBLE, which was measured, not theorised:
 * demoting §9f's selector from `html.js-reveal [data-scroll][data-enter]` (0,4,1)
 * to `[data-scroll][data-enter]` (0,2,1) made the gate still report `scroll-*`
 * on all four bands — because none of them had been marked `.is-entered` yet.
 * Once the page is scrolled through, three of the four reverted to `enter-*`.
 * So the assertion below is only meaningful AFTER this pass has run, and this
 * function is the reason it can catch the defect it was written for.
 */
await page.evaluate(async () => {
  const h = document.documentElement.scrollHeight;
  for (let y = 0; y < h; y += 400) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(400);

/* Assert the premise of the assertion above: the bands really are entered. If
   they are not, the §9b competition does not exist and every `scroll-*` reading
   below would be vacuous — the exact state that let M6 through. */
await test('premise: the §9b entrances have fired, so §9b and §9f really compete', async () => {
  const notEntered = await page.evaluate(
    (ids) =>
      ids.filter((id) => {
        const el = document.querySelector(`#${id}`);
        return el && !el.classList.contains('is-entered');
      }),
    BANDS,
  );
  if (notEntered.length) {
    throw new Error(
      `these bands never received .is-entered after scrolling the page: ${notEntered.join(', ')}. ` +
        `§9b declares its animation-name ONLY on .is-entered, so an unentered band matches no ` +
        `§9b rule and §9f would win by default — making the specificity assertion below ` +
        `vacuous. (This is measured: demoting §9f's selector to the bare [data-scroll] left the ` +
        `gate green on all four bands until this pass existed.) Fix the scroll pass before ` +
        `trusting any verdict below.`,
    );
  }
});

/**
 * ── THE PREMISE ASSERTION ───────────────────────────────────────────────────
 * Every verdict below is conditional on the browser actually supporting
 * `view()` timelines AND on the reduced-motion media query being in the
 * "no-preference" state. If the support check fails the feature is absent by
 * design, and reporting "the bands do not move" would be a false finding about
 * the page. Asserted explicitly so a green run states its premise.
 */
await test('premise: this browser supports view() timelines and is not in reduced-motion', async () => {
  const ok = await page.evaluate(
    () =>
      CSS.supports('animation-timeline: view()') &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  if (!ok) {
    throw new Error(
      'the browser either lacks `animation-timeline: view()` support or is running with ' +
        'prefers-reduced-motion: reduce. §9f is deliberately inert in both cases, so the ' +
        'assertions below cannot distinguish "correctly absent" from "broken". Re-run in a ' +
        'Chromium that supports scroll-driven animations with no reduced-motion preference.',
    );
  }
});

const seen = [];
for (const id of BANDS) {
  const sel = `#${id}`;
  const present = await page.evaluate(READ(sel));
  if (!present) {
    seen.push({ id, absent: true });
    continue;
  }
  const box = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  }, sel);

  const samples = [];
  for (const frac of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    const y = Math.round(box.top + box.height * frac - VIEWPORT.height * 0.5);
    await page.evaluate((yy) => window.scrollTo(0, Math.max(0, yy)), y);
    await page.waitForTimeout(120);
    const read = await page.evaluate(READ(sel));
    samples.push({ frac, y, t: read.t });
  }

  // Reversibility: go PAST the midpoint, then come back UP to it.
  const mid = samples[2];
  await page.evaluate((yy) => window.scrollTo(0, Math.max(0, yy) + 400), mid.y);
  await page.waitForTimeout(120);
  await page.evaluate((yy) => window.scrollTo(0, Math.max(0, yy)), mid.y);
  await page.waitForTimeout(120);
  const back = await page.evaluate(READ(sel));

  seen.push({
    id,
    sel,
    name: present.name,
    samples,
    distinct: new Set(samples.map((s) => s.t)).size,
    midT: mid.t,
    backT: back.t,
  });
}

/**
 * ── THE CONTROL, MEASURED BEFORE THE VERDICT ────────────────────────────────
 * Plant an element that is explicitly NOT §9f-driven (no `data-scroll`, its own
 * `animation-timeline: none`) and drag it through the same offsets. Its
 * transform must read IDENTICALLY every time. If it does not, the sampler is
 * picking up the scroll position itself and every "distinct" count above is an
 * artefact — so this runs first and a failure here invalidates the whole run.
 */
await test('OK-GREEN CONTROL: a non-scroll-linked element reads a CONSTANT transform', async () => {
  const readings = await page.evaluate(async () => {
    const probe = document.createElement('div');
    probe.id = '__scroll_motion_control__';
    probe.style.cssText = 'position:absolute;top:0;left:0;width:10px;height:10px;';
    // Explicitly opt OUT of any scroll timeline.
    probe.style.animationTimeline = 'none';
    document.body.appendChild(probe);
    const read = () => getComputedStyle(probe).transform;
    const out = [];
    const doc = document.documentElement;
    const prev = window.scrollY;
    for (const frac of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      window.scrollTo(0, Math.round(doc.scrollHeight * frac));
      await new Promise((r) => setTimeout(r, 120));
      out.push(read());
    }
    window.scrollTo(0, prev);
    probe.remove();
    return out;
  });
  const distinct = new Set(readings).size;
  if (distinct !== 1) {
    throw new Error(
      `the control element reported ${distinct} distinct transforms across 5 scroll offsets ` +
        `(${readings.join(' | ')}). An element with no scroll timeline MUST read a constant ` +
        `transform. Something outside §9f is moving on scroll, so the per-band "distinct" ` +
        `counts below cannot be attributed to the drift. Fix the sampler before trusting them.`,
    );
  }
});

/* ── A. CONTINUOUS + B. REVERSIBLE + C. SLOWED — per band ──────────────────── */
for (const band of seen) {
  if (band.absent) {
    await test(`#${band.id}: present in the DOM`, async () => {
      throw new Error(
        `#${band.id} was not found in the page. §9f is scoped to the four landing bands, so a ` +
          `missing one means either the anchor was renamed or the page structure changed — ` +
          `and this check would then silently stop measuring it.`,
      );
    });
    continue;
  }

  await test(`#${band.id}: the drift animation is §9f's, not a §9b entrance`, async () => {
    if (!SCROLL_ANIM.test(band.name)) {
      throw new Error(
        `#${band.id} reports animation-name "${band.name}", which is not a scroll-* animation. ` +
          `§9b's one-shot entrance has won the cascade: Section.astro emits BOTH data-enter and ` +
          `data-scroll from the same prop, so §9b's "html.js-reveal [data-enter=…].is-entered" ` +
          `(0,3,1) outranks a plain [data-scroll] (0,1,0). §9f's selector has to match that ` +
          `shape — html.js-reveal [data-scroll][data-enter] — for the drift to apply. This is ` +
          `the exact defect this check was written for; it was real on #galeri and #tim.`,
      );
    }
  });

  await test(`#${band.id}: transform changes across the scroll range (continuous)`, async () => {
    if (band.distinct <= 1) {
      throw new Error(
        `#${band.id} read ${band.distinct} distinct transform value(s) across 5 scroll offsets — ` +
          `i.e. it is CONSTANT. A one-shot entrance yields the same value at every offset after ` +
          `it fires, which is the "sekali pakai" behaviour being replaced. Check §9f's two ` +
          `conditions: \`@supports (animation-timeline: view())\` and \`prefers-reduced-motion: ` +
          `no-preference\`. Also check that no ancestor has \`overflow: hidden\` (which makes it ` +
          `a scroll container, pins the timeline, and freezes the transform while the CSS still ` +
          `looks correct — see §9d). Use \`overflow: clip\` instead.\n     ` +
          band.samples.map((s) => `frac ${s.frac}: ${s.t}`).join('\n     '),
      );
    }
  });

  /**
   * ── THE MOTION MUST BE SMOOTH, NOT A SNAP ─────────────────────────────────
   * "Distinct > 1" is satisfied by a transform that jumps and then CLAMPS — and
   * that is exactly what a narrowed `animation-range` produces: measured with
   * `animation-range: cover 49% cover 51%`, the five samples read
   * -12, -12, -5.9, +12, +12 — three distinct values, so the check above passes,
   * while the drift the visitor actually sees is a snap concentrated in 2% of
   * the band instead of a gentle sweep across all of it.
   *
   * The assertion is therefore on CONSECUTIVE PAIRS: every adjacent pair of
   * samples must differ. A correctly-ranged drift moves between each step; a
   * clamped one repeats at the ends.
   *
   * A tolerance is used rather than exact equality because the two ends may
   * legitimately round to the same number when the drift is small — 0.5px apart
   * at 4 decimal places is not the defect. The floor is deliberately far below
   * §9f's ~10px travel and far above float noise.
   */
  await test(`#${band.id}: the motion is smooth, not a snap at the range ends`, async () => {
    const ys = band.samples.map((s) => translateY(s.t));
    const EPS = 0.25;
    const stuck = [];
    for (let i = 1; i < ys.length; i++) {
      if (Math.abs(ys[i] - ys[i - 1]) < EPS) {
        stuck.push(`frac ${band.samples[i - 1].frac}->${band.samples[i].frac} (y=${ys[i - 1]} -> ${ys[i]})`);
      }
    }
    if (stuck.length) {
      throw new Error(
        `#${band.id}'s transform did not move between ${stuck.length} consecutive sample pair(s): ` +
          `${stuck.join('; ')}. The motion is CLAMPED at the range ends rather than sweeping ` +
          `across the band. The likely cause is \`animation-range\` — §9f uses ` +
          `\`cover 0% cover 100%\` so progress varies across the whole band. A narrowed range ` +
          `(e.g. \`cover 49% cover 51%\`) compresses the whole travel into a sliver, so the ` +
          `transform sits at one extreme outside it and SNAPS through — which reads as a jump, ` +
          `not as the slow continuous drift that was asked for.`,
      );
    }
  });

  await test(`#${band.id}: the same offset reads the same value from below (reversible)`, async () => {
    if (band.midT !== band.backT) {
      throw new Error(
        `#${band.id} read "${band.midT}" at the midpoint scrolling DOWN and "${band.backT}" ` +
          `returning UP to the same offset. A position-derived animation gives the same value ` +
          `both times; a TIME-based one gives a different value because more time has elapsed. ` +
          `The two differing means \`animation-timeline: view()\` is not in force — the drift ` +
          `is being driven by elapsed time, not by scroll position. Check the declaration ` +
          `order in §9f: the \`animation\` shorthand RESETS the timeline, so ` +
          `\`animation-duration: auto\` and \`animation-timeline: view()\` must come AFTER it.`,
      );
    }
  });

  await test(`#${band.id}: the travel is small, i.e. slowed down (<= ${MAX_TRAVEL_PX}px)`, async () => {
    const ys = band.samples.map((s) => translateY(s.t));
    const travel = Math.max(...ys) - Math.min(...ys);
    if (travel > MAX_TRAVEL_PX) {
      throw new Error(
        `#${band.id}'s transform travels ${travel.toFixed(2)}px across the band — over the ` +
          `${MAX_TRAVEL_PX}px ceiling. The request was to SLOW the motion down, not to fling ` +
          `the band across the viewport. §9f drives this with --scroll-drift (~10px); a much ` +
          `larger number means the custom property was changed or the wrong animation applied.`,
      );
    }
  });
}

/* ── D. NO COLLISION WITH THE §9c HOVER RECIPES ───────────────────────────── */
await test('no drift element also carries a §9c hover recipe (u-lift / u-zoom)', async () => {
  const hits = await page.evaluate(() => {
    const out = [];
    const check = (el, why) => {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (/u-lift|u-zoom/.test(cls)) {
        out.push(`${why} also carries a §9c hover recipe: "${cls.slice(0, 70)}"`);
      }
    };
    for (const el of document.querySelectorAll('[data-scroll]')) {
      check(el, `[data-scroll="${el.getAttribute('data-scroll')}"]`);
    }
    for (const el of document.querySelectorAll('[data-scroll-item] > *')) {
      check(el, '[data-scroll-item] child');
    }
    return out;
  });
  if (hits.length) {
    throw new Error(
      `a scroll-linked transform sits on the same element as a hover recipe. §9d's measured ` +
        `rule: a CSS animation on \`transform\` OVERRIDES a \`transition\` on the same property ` +
        `of the SAME element, so the hover effect dies SILENTLY — the class is still there, the ` +
        `rule still matches, and nothing happens on hover.\n     ` +
        hits.join('\n     ') +
        `\n     Fix: move the drift to a different element. Section.astro puts it on the band ` +
        `wrapper (the <section>); the grids put it on the <ul>, never on the hoverable <li>, ` +
        `card or image.`,
    );
  }
});

/* A control for the check above: the assertion must be able to see a violation. */
await test('OK-GREEN CONTROL: the collision check does flag a planted offender', async () => {
  const flagged = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.setAttribute('data-scroll', 'rise');
    probe.className = 'u-lift';
    document.body.appendChild(probe);
    let hit = false;
    for (const el of document.querySelectorAll('[data-scroll]')) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (/u-lift|u-zoom/.test(cls)) hit = true;
    }
    probe.remove();
    return hit;
  });
  if (!flagged) {
    throw new Error(
      'the collision detector did NOT flag an element carrying both [data-scroll] and .u-lift. ' +
        'That means the check above can only ever pass — it would report "no collision" even ' +
        'when the hover recipe is being eaten. Fix the detector before trusting it.',
    );
  }
});

await browser.close();

const failed = results.filter(([s]) => s === 'fail');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
