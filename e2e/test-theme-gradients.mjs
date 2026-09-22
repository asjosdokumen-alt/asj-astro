/**
 * e2e/test-theme-gradients.mjs — the light-mode shim must reach EVERY gradient
 * stop, including the ones written with a breakpoint prefix.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/styles/global.css` §5b carries a hand-written light-mode shim over the
 * pre-tokenisation slate literals. Every rule in it matches a BARE class name:
 *
 *     :is(.to-slate-900, .to-slate-900\/95, …) { --tw-gradient-to: … }
 *
 * Tailwind compiles `lg:to-slate-900/95` to a DIFFERENT selector —
 * `.lg\:to-slate-900\/95` — which those rules cannot match. So a gradient stop
 * written with a breakpoint prefix keeps its dark value in light mode.
 *
 * This shipped as a real defect on the LayananSection cover photo (found
 * 2026-09-20 by comparing the running preview against the mockup). The overlay
 * is `lg:from-transparent lg:via-slate-900/40 lg:to-slate-900/95`: at 1440px in
 * light mode the computed value was
 *
 *     linear-gradient(to right,
 *       rgba(243,239,243,0.95)  0%,   <- shimmed
 *       rgba(255,255,255,0.45) 50%,   <- shimmed
 *       oklab(0.208 … /0.95)  100%)   <- NOT shimmed: #0f172b at 95%
 *
 * i.e. a photo washed light on one side and jammed dark on the other. It reads
 * as a broken image, not a themed one. It was INVISIBLE on mobile because the
 * `lg:` stops only apply at the desktop breakpoint where the card goes
 * side-by-side — and this repo reviews mobile first.
 *
 * WHY A BROWSER AND NOT A CSS PARSE
 * ---------------------------------
 * A text check on `global.css` would assert that a string is present, which is
 * a claim about the source, not about what the page paints. The defect WAS a
 * present-looking shim: the rules were there, they just did not match. Only a
 * computed style shows whether the cascade actually landed, so this measures
 * `getComputedStyle(overlay).backgroundImage` in a real browser.
 *
 * Run against a built artifact:
 *   node e2e/test-theme-gradients.mjs
 *   BASE_URL=http://localhost:4321 node e2e/test-theme-gradients.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

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
 * The dark stop this defect produces is `--color-slate-900` (#0f172b, or the
 * oklab equivalent). Anything near-black or near-opaque-dark in a light-mode
 * image overlay is the bug; the fix replaces it with a white wash.
 *
 * Parsing the computed string is deliberately loose: Tailwind emits `rgb()`,
 * `rgba()` and `oklab()` depending on the colour's alpha, and pinning an exact
 * form would make this gate break on a Tailwind upgrade rather than on a
 * regression. So it scans every colour token in the gradient and fails if any
 * has all channels below 60/255 while being substantially opaque.
 */
function findDarkStops(gradient) {
  const bad = [];
  // rgb()/rgba()
  for (const m of gradient.matchAll(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/g)) {
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (a > 0.35 && r < 60 && g < 60 && b < 60) bad.push(m[0]);
  }
  // oklab(L c h / a) — L is a 0..1 lightness, so ~0.2 is near-black.
  for (const m of gradient.matchAll(/oklab\(\s*([\d.]+)[^)]*?(?:\/\s*([\d.]+))?\s*\)/g)) {
    const L = Number(m[1]);
    const a = m[2] === undefined ? 1 : Number(m[2]);
    if (a > 0.35 && L < 0.45) bad.push(m[0]);
  }
  return bad;
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const res = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
if (res?.status() !== 200) {
  console.error(`ABORT: GET / returned ${res?.status()} — refusing to read an error page.`);
  await browser.close();
  process.exit(1);
}
await page.waitForSelector('#atas h1', { timeout: 30_000 });
await page.waitForTimeout(1500);

/* The theme must actually BE light for this to mean anything. Asserting it
   stops the gate passing vacuously in dark mode, where a dark stop is correct. */
await test('the page is in light mode, so a dark overlay stop would be a defect', async () => {
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (theme !== 'light') {
    throw new Error(
      `expected data-theme="light" on <html>, got ${JSON.stringify(theme)}. ` +
        `A dark gradient stop is CORRECT in dark mode, so measuring there would make this gate ` +
        `meaningless. Set the light theme (or the default) before trusting any verdict below.`,
    );
  }
});

/* Every element that paints a gradient AND sits over an image is a candidate
   for this defect. Scoping to `#layanan` would let the next one through.
 *
 * THE ONE DOCUMENTED EXCEPTION. `theme.css` keeps the `--hero-gradient` token
 * DARK in BOTH themes on purpose — white text sits on that band, and §5d in
 * `global.css` re-whitens it after the shim flips the text. So a dark stop on
 * `.hero-gradient` is the DESIGN, not the defect, and flagging it would make
 * this gate red forever. Measured before excluding it: the detector reported
 * `rgb(42, 18, 53)` on the hero's `scroll-mt-24 hero-gradient …` element, which
 * is the intended band colour.
 *
 * Excluding it by CLASS is deliberate and is not a hole: the defect this gate
 * exists for is a gradient stop whose value leaked from dark mode into light
 * mode against the author's intent. `.hero-gradient` has no `to-slate-*` stop to
 * leak — it paints a single token that both themes define as dark. The `lg:`
 * stops that caused the real bug carry no `hero-gradient` class, so they are
 * still measured. */
const DELIBERATELY_DARK_BANDS = ['hero-gradient', 'footer-gradient'];

await test('no light-mode gradient over an image contains a dark stop', async () => {
  const findings = await page.evaluate((skipClasses) => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const cls = (el.className || '').toString();
      if (skipClasses.some((c) => cls.includes(c))) continue;
      const cs = getComputedStyle(el);
      if (cs.backgroundImage === 'none' || !cs.backgroundImage.includes('gradient')) continue;
      // Only overlays: an element positioned over artwork, not a solid panel.
      const overImage = el.querySelector('img') !== null ||
        (el.previousElementSibling && el.previousElementSibling.tagName === 'IMG');
      if (!overImage) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) continue;
      out.push({
        cls: cls.slice(0, 120),
        bg: cs.backgroundImage,
      });
    }
    return out;
  }, DELIBERATELY_DARK_BANDS);

  if (!findings.length) {
    throw new Error(
      'found no gradient-over-an-image element at all — the selector or the page changed, ' +
        'so this gate is no longer measuring what it claims to measure',
    );
  }

  const dark = [];
  for (const f of findings) {
    const bad = findDarkStops(f.bg);
    if (bad.length) dark.push({ cls: f.cls, bad, bg: f.bg });
  }

  if (dark.length) {
    throw new Error(
      `${dark.length} light-mode overlay(s) contain a dark gradient stop. A breakpoint-prefixed ` +
        `stop (e.g. the lg: form of a slate 900 to-slate) is emitted as a DIFFERENT selector that ` +
        `the bare-class shim in src/styles/global.css cannot match, so it keeps its dark value and ` +
        `smears the artwork.\n     ` +
        dark.map((d) => `offender: ${d.cls}\n       dark stop(s): ${d.bad.join(', ')}`).join('\n     ') +
        `\n     Fix: add the prefixed form to the §5b gradient rules. Do NOT fix it by deleting the ` +
        `stop — the dark end is correct in dark mode.`,
    );
  }
});

/* A control, so a green run cannot come from the matcher never matching
   anything. This element's gradient is deliberately dark and IS over an image,
   so the detector must flag it; if it does not, the gate is blind and its
   verdict above is worthless. */
await test('OK-GREEN CONTROL: the detector does flag a known dark overlay', async () => {
  const flagged = await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.backgroundImage = 'linear-gradient(to right, rgba(15,23,43,0.95), rgba(15,23,43,0.9))';
    el.style.position = 'absolute';
    el.style.width = '100px';
    el.style.height = '100px';
    const img = document.createElement('img');
    img.src =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    el.appendChild(img);
    document.body.appendChild(el);
    const bg = getComputedStyle(el).backgroundImage;
    el.remove();
    return bg;
  });
  const bad = findDarkStops(flagged);
  if (!bad.length) {
    throw new Error(
      `the dark-stop detector did NOT flag a deliberately dark overlay (${flagged}). ` +
        `That means the check above can only pass — it would report "no dark stops" even when the ` +
        `defect is present. Fix the matcher before trusting any green run.`,
    );
  }
});

await page.close();
await browser.close();

const failed = results.filter(([s]) => s === 'fail');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
