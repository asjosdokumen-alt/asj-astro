/**
 * measure-hero-parallax.mjs — evidence probe for the full-screen landing hero.
 *
 * WHAT IT MEASURES, AND WHY EACH ONE IS HERE
 * ------------------------------------------
 * The 2026-09-27 change has three parts, and each one has a failure mode that
 * LOOKS like success from the source:
 *
 *   1. the band is one full screen (`100svh`), edge to edge;
 *   2. its headline uses a display serif;
 *   3. two artwork planes drift at different speeds as the page scrolls
 *      (motion.css §9e).
 *
 * (1) can be wrong in a way nothing reports: `100vh` on a phone is measured
 * against the LARGEST viewport, so the band is taller than the screen and the
 * CTA sits under the browser chrome. So the probe reports the band's height
 * AND the viewport height at a phone width, and the `overflow` it actually
 * computed to — `clip` and not `hidden`, because `hidden` would create a
 * scroll container and pin the parallax timeline to it.
 *
 * (2) cannot be judged from the stylesheet either: a family that failed to
 * load falls back silently. So the probe reads the RESOLVED family of the h1
 * and asks `document.fonts` whether the face is actually available.
 *
 * (3) IS THE ONE THAT WOULD HAVE FAILED SILENTLY. `animation-timeline: view()`
 * against an element inside an `overflow: hidden` ancestor produces a
 * completely correct-looking stylesheet and a transform frozen at one value.
 * A probe that reads the transform ONCE cannot tell a frozen value from a
 * working one, so this one sweeps the scroll and reports the DISTINCT values
 * it saw. One distinct value = frozen = failure, whatever the CSS says.
 *
 * ⚠ SAMPLE WHILE SCROLLING, AND WAIT TWO FRAMES AFTER EACH STEP. A
 * scroll-linked animation is a function of scroll position, but the value is
 * committed on the compositor, so a read in the same task as the scroll can
 * return the PREVIOUS frame's transform. Two `requestAnimationFrame`s is what
 * makes the sample describe the position it was taken at.
 *
 * THE REDUCED-MOTION PATH IS MEASURED, NOT ASSUMED. A second context is opened
 * with `reducedMotion: 'reduce'` and the same sweep is run. Every plane must
 * report `none` at EVERY offset — not "a smaller value", because a shortened
 * scroll animation leaves the plane parked at a fraction of its travel.
 *
 * NON-HERO ROUTES ARE MEASURED TOO. The landing hero and the chrome header are
 * the same `<header>` in `App.tsx`, so the probe reads the OTHER five routes
 * and asserts the box is the chrome box (`min-h-[14rem] md:h-56`, full
 * `max-w-7xl` inset card) and that none of the hero classes are present.
 *
 * USAGE
 *   BASE_URL=http://localhost:4321 node e2e/measure-hero-parallax.mjs
 *   BASE_URL=http://localhost:4321 node e2e/measure-hero-parallax.mjs --json
 *
 * EXIT CODES
 *   0  every assertion held
 *   1  at least one assertion failed (each is printed with its numbers)
 *   2  the server did not answer
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const JSON_OUT = process.argv.includes('--json');

/** 1280x820 is the size the repo measures the landing hero at; 390x844 is a phone. */
const VIEWPORTS = [
  { width: 1280, height: 820 },
  { width: 390, height: 844 },
];

/**
 * The routes that actually mount the CHROME header.
 *
 * Measured, not assumed: `grep -n "<App" src/pages/*.astro` shows only `/loker`
 * and `/public` render `<App />` with `showHeader` at its `true` default.
 * `/admin`, `/candidate`, `/share`, `/ai-cv`, `/apply` and `/siswa-baru` all
 * pass `showHeader={false}`, so they never render this header at all — they are
 * listed separately below, where the claim checked is the weaker one (no hero
 * class anywhere on them).
 */
const NON_HERO_ROUTES = ['/loker', '/public'];
const NO_HEADER_ROUTES = ['/admin', '/candidate', '/share'];

/** Scroll offsets as a share of the viewport height. */
const SWEEP = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05];

const failures = [];
const lines = [];
const data = { hero: {}, parallax: {}, reduced: {}, nonHero: {} };

function ok(msg) {
  lines.push(`  ok   ${msg}`);
}
function bad(msg) {
  lines.push(`  FAIL ${msg}`);
  failures.push(msg);
}

/** Scroll to `y`, wait two frames, then read. See the header note. */
async function sampleAt(page, y, selectors) {
  return page.evaluate(
    ([target, sel]) => {
      window.scrollTo(0, target);
      return new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const out = { scrollY: window.scrollY };
            for (const s of sel) {
              const el = document.querySelector(s);
              out[s] = el ? getComputedStyle(el).transform : null;
            }
            resolve(out);
          }),
        );
      });
    },
    [y, selectors],
  );
}

const PLANES = ['.hero-art', '.hero-haze'];

async function main() {
  let browser;
  try {
    // ⚠ `--no-proxy-server` IS REQUIRED IN THIS SANDBOX, exactly as
    // `test-landing.mjs` and `test-contrast.mjs` record: the sandbox exports
    // HTTP_PROXY, and Chromium would otherwise send 127.0.0.1 through the proxy
    // and get `ERR_CONNECTION_REFUSED` (or a 502) for a server that is
    // demonstrably up.
    browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  } catch (err) {
    console.error(`\n  ✗ could not launch chromium: ${err.message}\n`);
    process.exit(2);
  }

  // ── 1. The hero band itself ───────────────────────────────────────────────
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const res = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    if (!res?.ok()) {
      console.error(`\n  ✗ ${BASE}/ answered ${res ? res.status() : 'nothing'}\n`);
      process.exit(2);
    }
    await page.waitForSelector('#atas h1', { timeout: 15000 });

    const box = await page.evaluate(() => {
      const el = document.getElementById('atas');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const body = document.body.getBoundingClientRect();
      const h1 = el.querySelector('h1');
      const h1cs = getComputedStyle(h1);
      // ── The SPECIFIED min-height, read off the CSSOM ──────────────────
      // `getComputedStyle().minHeight` returns the USED value in px, so it
      // cannot tell `100svh` from `100vh` — they both resolve to the viewport
      // height in a context where the two agree. The CSSOM keeps the specified
      // token, and a browser that cannot PARSE `svh` drops the declaration
      // entirely, so finding it here is a real check of both the build and the
      // engine.
      const specified = [];
      const walk = (rules) => {
        for (const rule of rules) {
          // ⚠ READ `selectorText` BEFORE `cssRules`. In Chrome ≥112 a
          // `CSSStyleRule` implements `CSSGroupingRule`, so `rule.cssRules`
          // exists — as an EMPTY list — and a walk written as
          // `if (rule.cssRules) recurse(); else if (rule.selectorText) …`
          // recurses into nothing and never sees a single declaration.
          // Measured: that form reported `found []` on a stylesheet whose
          // `.hero-band` rules were demonstrably present.
          if (rule.selectorText && rule.style && rule.selectorText.includes('.hero-band')) {
            specified.push(rule.style.minHeight);
          }
          if (rule.cssRules?.length) walk(rule.cssRules);
        }
      };
      for (const sheet of document.styleSheets) {
        try {
          walk(sheet.cssRules);
        } catch {
          /* a cross-origin sheet is not ours */
        }
      }
      return {
        width: Math.round(r.width),
        height: Math.round(r.height),
        left: Math.round(r.left),
        top: Math.round(r.top + window.scrollY),
        minHeightUsed: cs.minHeight,
        specifiedMinHeights: specified,
        overflow: cs.overflow,
        marginTop: cs.marginTop,
        borderRadius: cs.borderTopLeftRadius,
        bodyLeft: Math.round(body.left),
        bodyWidth: Math.round(body.width),
        docWidth: document.documentElement.clientWidth,
        viewportHeight: window.innerHeight,
        h1FontFamily: h1cs.fontFamily,
        h1FontSize: h1cs.fontSize,
        h1FontWeight: h1cs.fontWeight,
        h1LineHeight: h1cs.lineHeight,
        displayFaceLoaded: document.fonts.check('400 72px "Instrument Serif"'),
        planes: {
          art: !!document.querySelector('.hero-art'),
          haze: !!document.querySelector('.hero-haze'),
        },
      };
    });
    data.hero[`${vp.width}x${vp.height}`] = box;

    const tag = `${vp.width}x${vp.height}`;
    // Edge to edge: the band matches the BODY box exactly. Comparing against
    // `clientWidth` would fail on this repo by design — `scrollbar-gutter:
    // stable` reserves a ~15px strip on <html>, so the content viewport is
    // narrower than the window and the body is the right reference.
    if (box.left === box.bodyLeft && Math.abs(box.width - box.bodyWidth) <= 1) {
      ok(`${tag} hero is edge-to-edge (${box.width}px = body width, left ${box.left})`);
    } else {
      bad(
        `${tag} hero box ${box.left}/${box.width} does not match the body box ` +
          `${box.bodyLeft}/${box.bodyWidth}`,
      );
    }
    if (box.top === 0) ok(`${tag} hero starts at the document top (top=0)`);
    else bad(`${tag} hero top is ${box.top}, not 0 — it is still an inset card`);
    if (box.marginTop === '0px') ok(`${tag} hero margin-top is 0`);
    else bad(`${tag} hero margin-top is ${box.marginTop}`);
    if (box.borderRadius === '0px') ok(`${tag} hero has no rounded corners`);
    else bad(`${tag} hero border-radius is ${box.borderRadius}`);
    // One screen: the band is at least the viewport tall.
    if (box.height >= box.viewportHeight) {
      ok(`${tag} hero fills the screen (${box.height} >= viewport ${box.viewportHeight})`);
    } else {
      bad(`${tag} hero is SHORTER than the viewport (${box.height} < ${box.viewportHeight})`);
    }
    if (box.specifiedMinHeights.includes('100svh')) {
      ok(
        `${tag} the stylesheet specifies min-height: 100svh (parsed by this engine; ` +
          `used value ${box.minHeightUsed})`,
      );
    } else {
      bad(
        `${tag} no '.hero-band' rule specifies 100svh — found ${JSON.stringify(box.specifiedMinHeights)}. ` +
          `A duplicate-property fallback may have been eaten by the minifier.`,
      );
    }
    if (box.specifiedMinHeights.includes('100vh')) {
      ok(`${tag} the 100vh fallback ALSO survived the minifier (${JSON.stringify(box.specifiedMinHeights)})`);
    } else {
      bad(`${tag} the 100vh fallback is MISSING from the built CSS — the minifier collapsed it`);
    }
    if (box.overflow === 'clip') {
      ok(`${tag} overflow is clip (NOT hidden — a scroll container would freeze the timeline)`);
    } else {
      bad(`${tag} overflow resolved to "${box.overflow}", expected clip`);
    }
    if (box.h1FontFamily.includes('Instrument Serif')) {
      ok(`${tag} h1 resolves to the display serif — ${box.h1FontFamily.split(',')[0]}`);
    } else {
      bad(`${tag} h1 font-family is "${box.h1FontFamily}"`);
    }
    if (box.displayFaceLoaded) ok(`${tag} document.fonts.check confirms Instrument Serif is available`);
    else bad(`${tag} Instrument Serif is NOT loaded — the h1 is falling back silently`);
    if (box.h1FontWeight === '400') ok(`${tag} h1 weight is 400 (the family's only weight; no synthetic bold)`);
    else bad(`${tag} h1 weight is ${box.h1FontWeight} — a single-weight face will synthesise this`);
    if (box.planes.art && box.planes.haze) ok(`${tag} both parallax planes are in the DOM`);
    else bad(`${tag} a parallax plane is missing (art=${box.planes.art} haze=${box.planes.haze})`);

    // ── 2. The scroll sweep (motion on) ─────────────────────────────────────
    const samples = [];
    for (const frac of SWEEP) {
      const y = Math.round(vp.height * frac);
      samples.push(await sampleAt(page, y, PLANES));
    }
    const distinct = {};
    for (const s of PLANES) {
      distinct[s] = [...new Set(samples.map((x) => x[s]))];
    }
    data.parallax[tag] = { samples, distinct: Object.fromEntries(Object.entries(distinct).map(([k, v]) => [k, v.length])) };

    for (const s of PLANES) {
      const d = distinct[s];
      if (d.length >= 2) {
        ok(`${tag} ${s} drifts: ${d.length} distinct transforms across ${SWEEP.length} scroll offsets`);
      } else {
        bad(
          `${tag} ${s} is FROZEN at a single transform (${d[0]}) across the whole sweep — ` +
            `the timeline is pinned, most likely by a scroll container`,
        );
      }
      if (d.includes('none')) {
        bad(`${tag} ${s} reports "none" at some offset while motion is allowed — it is not animating there`);
      }
    }
    // The two planes must differ from each other, or there is no depth.
    const artSet = new Set(distinct['.hero-art']);
    const hazeSet = new Set(distinct['.hero-haze']);
    const shared = [...artSet].filter((v) => hazeSet.has(v));
    if (shared.length < artSet.size) {
      ok(`${tag} the two planes travel different paths (only ${shared.length} shared value(s))`);
    } else {
      bad(`${tag} the two planes report IDENTICAL transforms — that is one plane, not two`);
    }
    // Nothing may be left offset at rest.
    const atRest = samples[0];
    if (atRest['.hero-art'] === 'none' || atRest['.hero-art'] === 'matrix(1, 0, 0, 1, 0, 0)') {
      ok(`${tag} at scroll 0 the artwork plane is at its neutral position (${atRest['.hero-art']})`);
    } else {
      lines.push(`  note ${tag} at scroll 0 the artwork plane sits at ${atRest['.hero-art']} (a small rest offset is expected when the band is taller than the viewport)`);
    }

    // ── 3. The reduced-motion path ──────────────────────────────────────────
    const rmCtx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const rmPage = await rmCtx.newPage();
    await rmPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await rmPage.waitForSelector('#atas h1', { timeout: 15000 });
    const rmSamples = [];
    for (const frac of SWEEP) {
      rmSamples.push(await sampleAt(rmPage, Math.round(vp.height * frac), PLANES));
    }
    const rmValues = [...new Set(rmSamples.flatMap((s) => PLANES.map((p) => s[p])))];
    data.reduced[tag] = { values: rmValues };
    if (rmValues.length === 1 && rmValues[0] === 'none') {
      ok(`${tag} reduced motion: both planes are inert at EVERY offset (transform: none)`);
    } else {
      bad(`${tag} reduced motion is NOT inert — observed ${JSON.stringify(rmValues)}`);
    }
    // And the planes must still be visible/covered (no clipped or hidden layer).
    const rmVisible = await rmPage.evaluate(() => {
      const out = {};
      for (const s of ['.hero-art', '.hero-haze']) {
        const el = document.querySelector(s);
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        out[s] = {
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          height: Math.round(r.height),
          top: Math.round(r.top),
        };
      }
      const band = document.getElementById('atas').getBoundingClientRect();
      out.bandHeight = Math.round(band.height);
      return out;
    });
    data.reduced[`${tag}-geometry`] = rmVisible;
    for (const s of PLANES) {
      const g = rmVisible[s];
      const covered = g.height > rmVisible.bandHeight && g.top <= 0;
      if (g.display !== 'none' && g.visibility !== 'hidden' && Number(g.opacity) > 0 && covered) {
        ok(`${tag} reduced motion: ${s} is still painted and still over-covers the band (${g.height} > ${rmVisible.bandHeight})`);
      } else {
        bad(`${tag} reduced motion leaves ${s} not fully covering the band: ${JSON.stringify(g)}`);
      }
    }
    await rmCtx.close();
    await ctx.close();
  }

  // ── 4. The non-hero header must be untouched ──────────────────────────────
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
  });
  for (const route of NON_HERO_ROUTES) {
    const page = await ctx.newPage();
    const res = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    if (!res?.ok()) {
      bad(`${route} answered ${res ? res.status() : 'nothing'}`);
      await page.close();
      continue;
    }
    await page.waitForSelector('#asj-header', { timeout: 15000 });
    const box = await page.evaluate(() => {
      const el = document.getElementById('asj-header');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const body = document.body.getBoundingClientRect();
      return {
        height: Math.round(r.height),
        width: Math.round(r.width),
        left: Math.round(r.left),
        marginTop: cs.marginTop,
        borderRadius: cs.borderTopLeftRadius,
        overflow: cs.overflow,
        maxWidth: cs.maxWidth,
        bodyWidth: Math.round(body.width),
        clientWidth: document.documentElement.clientWidth,
        heroClasses: ['.hero-band', '.hero-art', '.hero-haze', '.hero-layer'].filter((c) =>
          document.querySelector(c),
        ),
      };
    });
    data.nonHero[route] = box;
    if (box.height === 224) ok(`${route} non-hero header is still the chrome box (224px = md:h-56)`);
    else bad(`${route} non-hero header height is ${box.height}px, expected 224`);
    if (box.marginTop === '24px') ok(`${route} non-hero header keeps mt-6 (24px)`);
    else bad(`${route} non-hero header margin-top is ${box.marginTop}, expected 24px`);
    if (box.borderRadius !== '0px') ok(`${route} non-hero header is still the inset rounded card (${box.borderRadius})`);
    else bad(`${route} non-hero header lost its rounded corners`);
    if (box.overflow === 'hidden') ok(`${route} non-hero header still carries overflow: hidden`);
    else bad(`${route} non-hero header overflow is ${box.overflow}, expected hidden`);
    if (box.width < box.clientWidth) {
      ok(`${route} non-hero header is still the max-w-7xl inset card (${box.width} < ${box.clientWidth})`);
    } else {
      bad(`${route} non-hero header spans the full width (${box.width}) — the hero geometry leaked`);
    }
    if (box.heroClasses.length === 0) ok(`${route} carries none of the hero classes`);
    else bad(`${route} carries hero classes: ${box.heroClasses.join(', ')}`);
    await page.close();
  }
  await ctx.close();

  // ── 5. Routes that never render the header must carry no hero class ───────
  // A weaker claim, and stated as such: these mount `<App showHeader={false} />`,
  // so there is no box to compare. What is checked is that nothing from the
  // hero leaked into the shared stylesheet in a way that reaches them.
  const ctx2 = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
  });
  for (const route of NO_HEADER_ROUTES) {
    const page = await ctx2.newPage();
    const res = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    if (!res?.ok()) {
      bad(`${route} answered ${res ? res.status() : 'nothing'}`);
      await page.close();
      continue;
    }
    await page.waitForTimeout(600);
    const found = await page.evaluate(() => ({
      heroClasses: ['.hero-band', '.hero-art', '.hero-haze', '.hero-layer'].filter((c) =>
        document.querySelector(c),
      ),
      header: !!document.querySelector('#asj-header'),
      path: window.location.pathname,
    }));
    data.nonHero[route] = found;
    if (found.path !== route) {
      // `/admin`, `/candidate` and `/share` gate on the auth store and
      // `AuthGuard` redirects an unauthenticated visitor to `/`. Measuring
      // them would measure the LANDING page, which is exactly the false
      // positive that would make this section report the hero it is meant to
      // prove is absent. So a redirect is reported, not asserted on.
      lines.push(
        `  note ${route} redirected to ${found.path} without a session — not measurable here ` +
          `(the landing page it lands on legitimately carries the hero classes)`,
      );
      await page.close();
      continue;
    }
    if (!found.header) ok(`${route} renders no header at all (showHeader={false}), and no hero class`);
    else bad(`${route} unexpectedly rendered #asj-header`);
    if (found.heroClasses.length) bad(`${route} carries hero classes: ${found.heroClasses.join(', ')}`);
    await page.close();
  }
  await ctx2.close();

  await browser.close();

  if (JSON_OUT) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log('\n── hero-parallax measurements ─────────────────────────────────────');
    for (const l of lines) console.log(l);
    console.log(
      `\n   ${lines.length - failures.length} ok · ${failures.length} failed\n`,
    );
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  // Print whatever was already measured before dying. A probe that throws
  // half-way and prints only the stack loses the evidence it had already
  // gathered, which is the most expensive way to fail.
  console.log('\n── hero-parallax measurements (INCOMPLETE) ──────────────────────');
  for (const l of lines) console.log(l);
  console.error(`\n  ✗ probe aborted: ${err.message}\n`);
  process.exit(2);
});
