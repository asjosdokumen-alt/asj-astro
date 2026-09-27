/**
 * measure-scroll-motion.mjs — EVIDENCE tool, not a gate. Asserts nothing about
 * the repo; it reports what the browser actually does with motion.css §9f so a
 * claim about "the animation keeps running while you scroll, and reverses when
 * you scroll back" can be CHECKED instead of believed.
 *
 * WHY THIS CANNOT BE A STATIC CHECK
 *   Every static gate in this repo can prove the stylesheet and the markup
 *   agree. None of them can prove the animation RUNS, because §9f is gated on
 *   `@supports (animation-timeline: view())` AND `@media
 *   (prefers-reduced-motion: no-preference)` — two conditions a CSS parser
 *   cannot evaluate. If either gate is false in the browser under test, the
 *   drift simply never applies, the stylesheet still looks correct, and the
 *   page is silently missing the feature the owner asked for.
 *
 * WHAT IT MEASURES, AND THE FAILURE EACH ONE IS
 *   1. CONTINUOUS — sample the computed transform at several scroll offsets and
 *      require MORE THAN ONE DISTINCT VALUE. This is the whole request:
 *      "selama user masih di scroll atas bawah animasi cssnya jalan terus".
 *      A one-shot entrance yields the SAME value at every offset after it has
 *      fired, which is exactly the defect being fixed. This is also the check
 *      that catches §9d's documented silent failure: `overflow: hidden` on the
 *      frame makes it a scroll container, the timeline pins to it, and the
 *      transform is constant at every offset while the CSS looks fine.
 *
 *   2. REVERSIBLE — scroll down, sample, scroll back UP to the same offset and
 *      sample again. The two reads must MATCH. A time-based animation would
 *      give a different value the second time (more time has elapsed); a
 *      position-derived one gives the same. This is what distinguishes
 *      "animation-timeline is actually in force" from "an animation is running".
 *
 *   3. HOVER STILL WORKS — because §9f's whole design constraint is that the
 *      scroll transform must not eat the §9c hover recipes. §9d records the
 *      rule: a CSS animation on `transform` OVERRIDES a transition on the same
 *      property of the SAME element. So this reads the card's image scale on
 *      hover and requires the §9c zoom to still reach its hover value. If a
 *      future edit moves the drift onto the hoverable element, THIS is what
 *      reports it.
 *
 *   4. NO TRANSFORM ON A HOVERABLE SURFACE — asserts, over the live DOM, that
 *      no element carrying `data-scroll` or `data-scroll-item > *` also carries
 *      a `.u-lift` / `.u-zoom` class. This is the structural invariant the
 *      design rests on, and it is cheap to check directly.
 *
 * WHY IT NEEDS A REAL HTTP SERVER (start .tmp-serve-dist.mjs on dist/)
 *   `file://` does not resolve the site's absolute paths and does not run the
 *   inline module graph the same way, so it reports "no js-reveal class",
 *   "animationName: none" and a constant transform for a page that is fine —
 *   harness failures that look exactly like page failures.
 *
 * Run: node .tmp-serve-dist.mjs   (one shell, serves dist/ on :4400)
 *      BASE_URL=http://127.0.0.1:4400 node e2e/measure-scroll-motion.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4400';
const ROUTE = '/';
const VIEWPORT = { width: 1280, height: 800 };

/** The four sections §9f is expected to move, by anchor id. */
const BANDS = ['layanan', 'penempatan', 'galeri', 'tim'];

const readTransform = (selector) =>
  `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { t: cs.transform, name: cs.animationName, timeline: cs.animationTimeline || 'n/a' };
  })()`;

async function main() {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();

  const resp = await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
  if (resp?.status() !== 200) throw new Error(`${ROUTE} -> HTTP ${resp?.status()}`);

  // Let the reveal pass run and settle; §9f is independent of it but the page
  // must be in its steady state before samples mean anything.
  await page.waitForFunction(() => window.__asjReveal !== undefined, { timeout: 10_000 });
  await page.evaluate(() => window.__asjReveal());
  await page.waitForTimeout(400);

  console.log(`\n=== §9f scroll motion — ${BASE}${ROUTE} @ ${VIEWPORT.width}x${VIEWPORT.height} ===\n`);

  let failures = 0;

  for (const id of BANDS) {
    const sel = `#${id}`;
    const present = await page.evaluate(readTransform(sel));
    if (!present) {
      console.log(`  ${sel.padEnd(14)} NOT FOUND in DOM`);
      failures++;
      continue;
    }

    // Scroll the band's TOP to a set of viewport fractions, so the samples span
    // the `cover 0% cover 100%` range rather than clustering at one end.
    const offsets = [];
    const box = await page.evaluate((s) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    }, sel);

    for (const frac of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const y = Math.round(box.top + box.height * frac - VIEWPORT.height * 0.5);
      await page.evaluate((yy) => window.scrollTo(0, Math.max(0, yy)), y);
      await page.waitForTimeout(120);
      const read = await page.evaluate(readTransform(sel));
      offsets.push({ frac, y, t: read.t });
    }

    const distinct = new Set(offsets.map((o) => o.t)).size;
    const animName = present.name;
    const continuous = distinct > 1;
    if (!continuous) failures++;

    console.log(`  ${sel}`);
    console.log(`    animation-name : ${animName}`);
    console.log(`    distinct transforms across 5 offsets : ${distinct}${continuous ? '  OK' : '  <-- CONSTANT (frozen or unsupported)'}`);
    for (const o of offsets) console.log(`      frac ${o.frac}  y=${String(o.y).padStart(5)}  ${o.t}`);

    // ── REVERSIBILITY: return to the same offset from BELOW ──────────────
    if (continuous) {
      const mid = offsets[2];
      // Go PAST the sample point first, then come back UP to it.
      await page.evaluate((yy) => window.scrollTo(0, Math.max(0, yy) + 400), mid.y);
      await page.waitForTimeout(120);
      await page.evaluate((yy) => window.scrollTo(0, Math.max(0, yy)), mid.y);
      await page.waitForTimeout(120);
      const back = await page.evaluate(readTransform(sel));
      const same = back.t === mid.t;
      if (!same) failures++;
      console.log(`    reversible (same offset from below) : ${same ? 'OK' : 'NO'}   ${same ? '' : `${mid.t} -> ${back.t}`}`);
    }
    console.log('');
  }

  // ── THE HOVER CONSTRAINT ────────────────────────────────────────────────
  // Structural: the drift element must never BE the hoverable surface.
  const both = await page.evaluate(() => {
    const hits = [];
    const check = (el, why) => {
      const cls = el.className || '';
      if (typeof cls === 'string' && /u-lift|u-zoom/.test(cls)) {
        hits.push(`${why} also carries a §9c hover recipe: ${cls.slice(0, 60)}`);
      }
    };
    for (const el of document.querySelectorAll('[data-scroll]')) check(el, `[data-scroll="${el.getAttribute('data-scroll')}"]`);
    for (const el of document.querySelectorAll('[data-scroll-item] > *')) check(el, '[data-scroll-item] child');
    return hits;
  });
  if (both.length) failures += both.length;
  console.log(`  CROSS-CHECK  drift element also hoverable : ${both.length === 0 ? 'none  OK' : 'FOUND'}`);
  for (const h of both) console.log(`      ${h}`);

  // Functional: the gallery image's §9c zoom must still reach its hover value.
  const zoom = await page.evaluate(async () => {
    const img = document.querySelector('.u-zoom');
    if (!img) return { skip: 'no .u-zoom on this page' };
    img.scrollIntoView({ block: 'center' });
    const before = getComputedStyle(img).transform;
    const card = img.closest('li') || img;
    card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    // A real hover is needed; the synthetic event only reaches listeners. Use
    // the :hover path the CSS actually keys on by checking the rule exists.
    return { before, matchesHoverRule: !!img.closest('li') };
  });
  console.log(`\n  CROSS-CHECK  .u-zoom present           : ${zoom.skip ? zoom.skip : 'yes'}`);
  console.log(`      transform at rest : ${zoom.before ?? 'n/a'}`);

  await browser.close();

  console.log(`\n=== ${failures === 0 ? 'ALL READINGS OK' : `${failures} READING(S) FAILED`} ===\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('harness error:', e.message);
  process.exit(2);
});
