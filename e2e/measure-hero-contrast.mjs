/**
 * measure-hero-contrast.mjs — is the hero headline actually readable?
 *
 * EVIDENCE tool. It samples the RENDERED pixels behind the hero copy (not the
 * CSS we intended) and reports the worst contrast ratio, because "the overlay
 * is 40% black there" is a claim about CSS while "the photo behind the word
 * 'Karier' is 1.4:1" is a claim about what a visitor sees.
 *
 * WHY PIXELS AND NOT THE STYLESHEET. The overlay in global.css darkens the
 * banner where the copy sits. Reading class names cannot tell you whether a
 * rule exists, whether it wins the cascade, or whether it is even attached to
 * an element. Sampling the rendered result is the only way to tell those apart.
 *
 * ── SAMPLING CORRECTED 2026-09-24 ────────────────────────────────────────────
 * The false reading this tool produced is written down rather than hidden,
 * because the way it was wrong is what made it wrong at EVERY width.
 *
 * It used to sample a 60px strip to the LEFT of the h1 box, on the assumption
 * that the headline is inset from the band's left edge. On this layout it is
 * FLUSH with the band's content edge, so that strip is the band's own left
 * padding plus its 1px border — and in light mode the border resolves to the
 * light `--color-line` (#f0dfe7). A border does not change with the viewport,
 * which is why the tool reported a flat 1.28:1 at BOTH 390px and 1280px. It
 * measured the border, not the photo. Measured at the correction:
 * elementFromPoint(0, y) is the <header>; its computed border-left-color is
 * rgb(240,223,231); and the same strip with x=0 excluded reads 11.72:1 (390px)
 * / 3.32:1 (1280px).
 *
 * Its diagnostic also blamed "the CSS overlay is 'to top'", but the
 * `.header-overlay` class was attached to ZERO elements at the time — the div
 * had been removed in 84c7ed6. A tool that names a rule that does not paint is
 * a tool whose advice cannot be followed.
 *
 * WHAT IT MEASURES NOW: the background the headline is actually read against.
 * It screenshots the h1 box twice — once normally, once with the h1
 * `visibility:hidden` (layout kept) — and treats pixels that differ as glyph
 * pixels. For each, the background is the HIDDEN-frame pixel, so the ratio is
 * white-on-that-background and cannot be contaminated by the text (the
 * background frame has no text in it). WCAG's worst case is the BRIGHTEST such
 * background, and that is the number reported.
 *
 * BOTH THEMES ARE MEASURED, set via `asjTheme` in localStorage before
 * navigation (the same way scripts/ui-audit.mjs does it). The page boots into
 * light; a theme-specific regression — a white overlay behind white text — is
 * invisible if you only ever look at one theme, and that is exactly how the
 * light-mode rule shipped.
 *
 * WCAG floors used: large text (>= 24px, or >= 18.66px bold) needs 3:1, normal
 * text 4.5:1. The h1 size is measured, not assumed, since `--text-display` is a
 * clamp() that resolves differently per viewport.
 *
 * Exits non-zero when any reading FAILs, so this failure cannot be invisible
 * again. Nothing else in the repo reads this exit code (it is not a package.json
 * script), so turning it on changes no other gate.
 *
 * `--no-proxy-server` is mandatory: the sandbox exports HTTP_PROXY, so a
 * 127.0.0.1 navigation goes to the proxy and comes back 502, which looks
 * exactly like a dead server.
 */
import { chromium } from 'playwright';

const BASE = process.env.LANDING_URL || 'http://127.0.0.1:4321/';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

/** Screenshot a rectangle and hand back its pixels. */
async function pixels(page, clip) {
  const shot = await page.screenshot({ clip });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height);
    return { w: img.width, h: img.height, data: Array.from(d.data) };
  }, shot.toString('base64'));
}

const lines = [];
let failed = false;

for (const theme of ['light', 'dark']) {
  for (const width of [390, 1280]) {
    const height = width < 700 ? 844 : 900;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => {
      try { localStorage.setItem('asjTheme', t); } catch { /* storage disabled */ }
    }, theme);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('#atas h1', { timeout: 20_000 });
    await page.waitForTimeout(900);

    const box = await page.locator('#atas h1').first().boundingBox();
    // Clamp to the viewport so the clip can never run off the page.
    const clip = {
      x: Math.max(0, Math.floor(box.x)),
      y: Math.max(0, Math.floor(box.y)),
      width: Math.max(1, Math.min(Math.ceil(box.width), width - Math.max(0, Math.floor(box.x)))),
      height: Math.max(1, Math.min(Math.ceil(box.height), height - Math.max(0, Math.floor(box.y)))),
    };

    const withText = await pixels(page, clip);
    // Hide the headline but keep its layout, so the SAME pixels show the
    // background with no glyphs to contaminate the reading.
    await page.evaluate(() => { document.querySelector('#atas h1').style.visibility = 'hidden'; });
    await page.waitForTimeout(150);
    const withoutText = await pixels(page, clip);
    await page.evaluate(() => { document.querySelector('#atas h1').style.visibility = ''; });

    const white = [255, 255, 255];
    const backgrounds = [];
    for (let i = 0; i < withText.data.length; i += 4) {
      const a = [withText.data[i], withText.data[i + 1], withText.data[i + 2]];
      const b = [withoutText.data[i], withoutText.data[i + 1], withoutText.data[i + 2]];
      const changed = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      if (changed > 60) backgrounds.push(b); // a glyph pixel; b is its background
    }
    const ratios = backgrounds.map((b) => ratio(white, b)).sort((p, q) => p - q);

    const h1size = await page
      .locator('#atas h1')
      .first()
      .evaluate((el) => parseInt(getComputedStyle(el).fontSize, 10));
    const isLarge = h1size >= 24;
    const floor = isLarge ? 3.0 : 4.5;

    if (!ratios.length) {
      // No glyph pixels is a HARNESS failure, not a pass — say so instead of
      // printing 0.00:1, which would read as a catastrophic defect.
      failed = true;
      lines.push(`${theme.padEnd(5)} ${String(width).padStart(4)}px  NO GLYPH PIXELS found in the h1 box — the headline did not render, so this width is NOT measured.`);
    } else {
      const worst = ratios[0];
      const below = ratios.filter((r) => r < floor).length;
      const verdict = worst >= floor ? 'PASS' : 'FAIL';
      if (verdict === 'FAIL') failed = true;
      lines.push(
        `${theme.padEnd(5)} ${String(width).padStart(4)}px  h1 ${h1size}px ` +
          `(${isLarge ? 'large' : 'normal'} text, floor ${floor.toFixed(1)}:1)  ` +
          `worst-background ${worst.toFixed(2)}:1  -> ${verdict}  ` +
          `(${backgrounds.length} glyph-background samples, ${below} below the floor)`,
      );
      if (verdict === 'FAIL') {
        lines.push(
          `        the artwork behind the headline is too light here; the overlay must darken ` +
            `the side the copy sits on (bottom on a phone, left at lg) in BOTH themes — a white ` +
            `overlay behind white text lowers contrast, it cannot raise it.`,
        );
      }
    }
    await ctx.close();
  }
}

await browser.close();
console.log(lines.join('\n'));
if (failed) process.exit(1);
