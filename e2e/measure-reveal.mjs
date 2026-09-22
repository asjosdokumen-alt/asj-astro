/**
 * measure-reveal.mjs — EVIDENCE tool, not a gate. Asserts nothing about the repo;
 * it reports what the browser actually does with the entrance animation so a
 * claim about it can be checked instead of believed.
 *
 * WHAT IT ANSWERS, AND WHY EACH ONE IS A REAL FAILURE MODE
 *  1. Is the animation actually RUNNING on an element that scrolled into view?
 *     `motion.css` §9 gates the whole effect behind `html.js-reveal`, which is
 *     set by an inline script in BaseLayout. If that script throws, or the
 *     observer never fires, the class is absent and nothing animates — while
 *     every card still renders. That failure is invisible to a screenshot and
 *     to every unit test, so it has to be measured here.
 *
 *  2. Does the element SETTLE at opacity 1? A `both`-fill animation that never
 *     completes leaves the card at the `from` frame — fully transparent. This
 *     is the failure the reduced-motion block exists to prevent, and the only
 *     way to know it works is to read the computed opacity after the animation
 *     has had time to finish.
 *
 *  3. THE ONE THAT MATTERS MOST: with `prefers-reduced-motion: reduce`, is the
 *     content still VISIBLE? The broad `*` clamp in global.css sets every
 *     animation-duration to 0.01ms. Combined with `both` fill that pins some
 *     elements at `opacity: 0` — so a visitor who asked for less motion would
 *     get MISSING CARDS, not merely still ones. The §9 block removes the hidden
 *     state outright; this measures that rather than trusting the comment.
 *
 *  4. With JS disabled, is the content still visible? The hidden state is
 *     scoped to `html.js-reveal`, so scripting off must leave every card
 *     plainly rendered. Same trap, different cause.
 *
 * WHY IT NEEDS A REAL SERVER (start `.tmp-static.cjs` on dist/)
 *   `file://` does not resolve the site's absolute paths and does not run the
 *   inline module graph the same way, so it would report "no js-reveal class",
 *   "animationName: none" and "opacity: 0" for a page that is perfectly fine —
 *   harness failures that look exactly like page failures. The route and the
 *   root-relative assets both have to be real for any of this to mean anything.
 *
 * Run: node .tmp-static.cjs   (in one shell)
 *      node e2e/measure-reveal.mjs
 *
 * ⚠ WHY THIS TOOL SCROLLS, AND WHAT IT GOT WRONG BEFORE IT DID
 * ----------------------------------------------------------
 * The first version loaded the page, waited, and read the state — and reported
 * `0 revealed / opacity 0` for the landing page, which reads exactly like the
 * missing-cards bug this file exists to catch. It was not. On a 390px viewport
 * every tile sits far below the fold (measured: first tile `top` = 922 against
 * an 844px viewport), and an element that was never scrolled to SHOULD still be
 * waiting. The tool was measuring a page nobody had looked at.
 *
 * So the pass below scrolls the whole document in viewport steps and only then
 * reads. That turns the question from "did anything reveal" into the two that
 * actually matter: does every element reveal once it has been scrolled past,
 * and is NOTHING left transparent afterwards.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4399';

const browser = await chromium.launch({
  // The sandbox exports HTTP_PROXY, which would send even 127.0.0.1 through the
  // proxy and answer 502 — a "no server came up" that is really a proxy.
  args: ['--no-proxy-server'],
});

/** Scroll the document in viewport steps so below-fold elements pass through. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.7;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
  });
  // Let the last observer callbacks and the 480ms animation settle.
  await page.waitForTimeout(1500);
}

/**
 * Scroll without running page script — for the scripting-off probe.
 *
 * `page.evaluate` cannot be used with `javaScriptEnabled: false`: the injected
 * function never runs, so its promise is garbage-collected and the tool dies
 * with "Resulting promise was garbage collected" — a harness crash that looks
 * like a page failure. `mouse.wheel` drives the scroll from the browser side
 * instead, which works in both modes. This is also the honest way to test the
 * no-JS path: nothing of the page's own code is involved.
 */
async function scrollThroughNoJs(page) {
  await page.mouse.move(195, 400);
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(600);
}

/**
 * Read the reveal state of the first few `[data-reveal]` elements on a page.
 *
 * @param path      route to load
 * @param label     what the row means
 * @param opts      reduced → emulate prefers-reduced-motion; js → scripting on
 */
async function probe(path, label, opts = {}) {
  const { reduced = false, js = true } = opts;

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    javaScriptEnabled: js,
  });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' }).catch(() => {});

  // Reveal is triggered by scrolling, so the page must be scrolled before the
  // state means anything. See the header note.
  if (js) await scrollThrough(page);
  else await scrollThroughNoJs(page);

  const readState = () => {
    const root = document.documentElement;
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'));
    const sample = nodes.slice(0, 6).map((el) => {
      const cs = getComputedStyle(el);
      return {
        revealed: el.classList.contains('is-revealed'),
        opacity: Number(cs.opacity),
        anim: cs.animationName,
      };
    });

    return {
      jsRevealClass: root.classList.contains('js-reveal'),
      hasObserver: 'IntersectionObserver' in window,
      total: nodes.length,
      revealed: nodes.filter((n) => n.classList.contains('is-revealed')).length,
      // The number that actually matters: element still transparent AFTER the
      // whole page has been scrolled past. Any of these is a missing card.
      stillTransparent: nodes.filter((n) => Number(getComputedStyle(n).opacity) < 0.99)
        .length,
      sample,
    };
  };

  // With scripting off, `page.evaluate` cannot run page code — but a function
  // passed to it is still evaluated by Playwright in the page's own context,
  // which is unavailable here. Reading the state therefore has to avoid the
  // page's JS entirely, so it is done with `$$eval`-free direct queries.
  const report = js
    ? await page.evaluate(readState)
    : await page
        .locator('[data-reveal]')
        .evaluateAll((els) => {
          // This callback runs in the page, but with JS disabled Playwright
          // still executes its own injected function — only the PAGE's scripts
          // are off, which is exactly the distinction that matters here.
          const nodes = els;
          return {
            jsRevealClass: document.documentElement.classList.contains('js-reveal'),
            hasObserver: 'IntersectionObserver' in window,
            total: nodes.length,
            revealed: nodes.filter((n) => n.classList.contains('is-revealed')).length,
            stillTransparent: nodes.filter(
              (n) => Number(getComputedStyle(n).opacity) < 0.99,
            ).length,
            sample: nodes.slice(0, 6).map((el) => {
              const cs = getComputedStyle(el);
              return {
                revealed: el.classList.contains('is-revealed'),
                opacity: Number(cs.opacity),
                anim: cs.animationName,
              };
            }),
          };
        })
        .catch(() => null);

  await ctx.close();

  if (!report) {
    console.log(`\n── ${label} (${path}) ──`);
    console.log('  could not read state (page script disabled) — see note in the file');
    return { report: null, errors };
  }

  const header = `${label} (${path})`;
  console.log(`\n── ${header} ──`);
  console.log(`  js-reveal class     : ${report.jsRevealClass}`);
  console.log(`  IntersectionObserver: ${report.hasObserver}`);
  console.log(`  [data-reveal] nodes : ${report.total}`);
  console.log(`  revealed (scrolled) : ${report.revealed} / ${report.total}`);
  console.log(`  still transparent   : ${report.stillTransparent}`);
  for (const s of report.sample) {
    console.log(
      `    · revealed=${String(s.revealed).padEnd(5)} opacity=${String(s.opacity).padEnd(4)} anim=${s.anim}`,
    );
  }
  if (errors.length) console.log(`  PAGE ERRORS: ${JSON.stringify(errors)}`);

  return { report, errors };
}

console.log('reveal evidence — measured in a real browser against a real server');
console.log(`base: ${BASE}`);

// The landing page is where the tiles and cards live.
const normal = await probe('/', 'normal');
const reduced = await probe('/', 'reduced motion', { reduced: true });
const noJs = await probe('/', 'scripting OFF', { js: false });

// NOTE: `/candidate` is deliberately NOT probed. It redirects to `/` when no
// session is present, and the navigation destroys the execution context in the
// middle of `scrollThrough` — Playwright then dies with "Execution context was
// destroyed, most likely because of a navigation", which reads like a page bug
// and is not one. `Card.astro` is the shared surface recipe and the landing
// page exercises it directly, so the animation is already covered by the three
// landing rows; measuring the dashboard would need a logged-in fixture, which
// is a different tool's job.

console.log('\n── VERDICT ──');
const checks = [
  {
    name: 'scripting ON: html.js-reveal is present',
    ok: normal.report.jsRevealClass === true,
    why: 'without it nothing animates, and every card still renders — invisible to a screenshot',
  },
  {
    name: 'scripting ON: every element reveals once scrolled past',
    ok: normal.report.revealed === normal.report.total && normal.report.total > 0,
    why: 'an element the observer never fires on stays at opacity 0 — a missing card',
  },
  {
    name: 'scripting ON: NOTHING left transparent after a full scroll',
    ok: normal.report.stillTransparent === 0,
    why: 'the `both` fill never completing is the exact failure mode of this effect',
  },
  {
    name: 'scripting ON: no page errors',
    ok: normal.errors.length === 0,
    why: 'a thrown inline script takes the whole reveal pass down silently',
  },
];

for (const c of checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}`);

console.log('\n── rows that must show VISIBLE content, not motion ──');
console.log(
  `  reduced motion : ${reduced.report.stillTransparent === 0 ? 'OK  ' : 'FAIL'}  ` +
    'no element transparent (the clamp would pin some at opacity 0)',
);
console.log(
  `  scripting OFF  : ${noJs.report.stillTransparent === 0 ? 'OK  ' : 'FAIL'}  ` +
    'no element transparent (no observer is ever created)',
);

await browser.close();
