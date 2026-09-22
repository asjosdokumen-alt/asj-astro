/**
 * measure-mascot.mjs — EVIDENCE tool, not a gate. Asserts nothing about the repo;
 * it reports what the browser actually does with Aa-chan so a claim about her can
 * be checked instead of believed.
 *
 * WHAT IT ANSWERS
 *   1. Does every slot's file actually decode (naturalWidth != 0)? A `<picture>`
 *      with a wrong path renders a broken box that no build step notices.
 *   2. Is the motion actually running — i.e. does `transform` change over time?
 *      A keyframe with a typo'd name looks identical to no animation at all.
 *   3. THE ONE THAT MATTERS MOST: with `prefers-reduced-motion: reduce`, is she
 *      still VISIBLE? `motion.css` documents that the broad `*` clamp in
 *      global.css would freeze her at `mascot-enter`'s first keyframe
 *      (`opacity: 0`) — she would silently disappear for exactly the users the
 *      query exists to protect. This measures opacity rather than trusting the
 *      comment that says it was fixed.
 *
 * WHY IT NEEDS A REAL SERVER (start `.tmp-static.cjs`, or any static server on
 * dist/). Two earlier versions of this tool reported "no mascot in the DOM" and
 * "BROKEN" for a page that was fine, and both times the tool was the problem:
 *   - `astro preview` answers 200 for an unknown path with the LANDING document,
 *     so probing `/this-page-does-not-exist` never loaded the 404 page at all.
 *   - `file://` does not resolve the site's absolute paths (`/mascot/x.avif`
 *     becomes `F:/mascot/x.avif`) and does not load the stylesheet, so every
 *     image reported BROKEN and `animationName` was `none` — two failures of the
 *     harness that look exactly like two failures of the page.
 * The route AND the root-relative assets both have to be real for this to mean
 * anything. A broken-looking measurement is a hypothesis about the page, not a
 * finding, until the harness is ruled out.
 *
 * Run: node e2e/measure-mascot.mjs      (needs the static server on :4399)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4399';

const browser = await chromium.launch({
  // The sandbox exports HTTP_PROXY, which would send even 127.0.0.1 through the
  // proxy and answer 502 — the same trap recorded in the user memory.
  args: ['--no-proxy-server'],
});

/**
 * @param path  route to load
 * @param label what the row means
 * @param reduced emulate `prefers-reduced-motion: reduce`
 */
async function probe(path, label, reduced) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(600);

  const out = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img.mascot')];
    if (!imgs.length) return { count: 0 };
    // Scroll everything into view so lazy/`client:visible` slots load.
    for (const img of imgs) img.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 600));

    const rows = [];
    for (const img of imgs) {
      const cs = getComputedStyle(img);
      const box = img.getBoundingClientRect();
      const t1 = cs.transform;
      await new Promise((r) => setTimeout(r, 420));
      const t2 = getComputedStyle(img).transform;
      rows.push({
        src: new URL(img.currentSrc || img.src).pathname,
        nat: img.naturalWidth,
        w: Math.round(box.width),
        h: Math.round(box.height),
        opacity: cs.opacity,
        animName: cs.animationName,
        animDur: cs.animationDuration,
        transformed: t1 !== t2,
        alt: img.alt,
        ariaHidden: img.getAttribute('aria-hidden'),
      });
    }
    return { count: imgs.length, rows };
  });

  console.log(`\n=== ${label}  (${path}, reduced-motion=${reduced}) ===`);
  if (!out.count) {
    console.log('  no img.mascot in the DOM');
  } else {
    for (const r of out.rows) {
      const flags = [
        r.nat === 0 ? 'BROKEN' : 'decodes',
        r.transformed ? 'motion RUNNING' : 'motion still',
        `opacity=${r.opacity}`,
        `anim=${r.animName} ${r.animDur}`,
        r.alt === '' ? `decorative(aria-hidden=${r.ariaHidden})` : `alt="${r.alt.slice(0, 40)}…"`,
      ];
      console.log(`  ${r.w}x${r.h} ${r.src}  ${flags.join(' | ')}`);
    }
  }
  await ctx.close();
  return out;
}

// 404 is the slot that is definitely wired, so it is the control: if this one
// shows nothing, the tool is broken, not the page. This route only returns the
// 404 document on a server that actually maps unknown paths to 404.html.
await probe('/this-page-does-not-exist', '404 mascot (control)', false);
await probe('/this-page-does-not-exist', '404 mascot (CONTROL + reduced motion)', true);

// The landing page's mini list renders loading → settled → (if zero open jobs)
// none. On a healthy backend it settles into the LIST, so the loading and empty
// slots are never on screen to be measured. Both are forced by intercepting the
// endpoint the island actually calls and answering with a fixture — the real
// component logic still runs, which is the point; stubbing the DOM would only
// prove the markup I already wrote in the markup.
async function probeLanding(label, reduced, fixture) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  if (fixture) {
    await page.route('**/.netlify/functions/get-app-data*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: fixture }),
    );
  }
  await page.goto(`${BASE}/`, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(900);
  const rows = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img.mascot')];
    for (const img of imgs) img.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 500));
    return imgs.map((img) => {
      const cs = getComputedStyle(img);
      const b = img.getBoundingClientRect();
      return {
        src: new URL(img.currentSrc || img.src).pathname,
        nat: img.naturalWidth,
        w: Math.round(b.width),
        h: Math.round(b.height),
        opacity: cs.opacity,
        anim: cs.animationName,
        ariaHidden: img.getAttribute('aria-hidden'),
      };
    });
  });
  console.log(`\n=== ${label} (reduced-motion=${reduced}) ===`);
  if (!rows.length) console.log('  no img.mascot in the DOM');
  for (const r of rows) {
    console.log(
      `  ${r.w}x${r.h} ${r.src}  ${r.nat === 0 ? 'BROKEN' : 'decodes'} | anim=${r.anim} | opacity=${r.opacity} | aria-hidden=${r.ariaHidden}`,
    );
  }
  await ctx.close();
}

// Zero open jobs ⇒ the empty slot. `jobTutupUntukLamar` is what decides "open", so
// the fixture uses a closed status and no date rather than a hand-built DOM state.
const EMPTY_FIXTURE = JSON.stringify({ success: true, jobs: [] });
// And a payload that never arrives ⇒ the loading slot stays on screen.
await probeLanding('landing mini list — EMPTY (fixture: success, 0 jobs)', false, EMPTY_FIXTURE);
await probeLanding('landing mini list — EMPTY + reduced motion', true, EMPTY_FIXTURE);

await browser.close();
