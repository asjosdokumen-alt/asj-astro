/**
 * measure-hero-contrast.mjs — is the hero headline actually readable?
 *
 * EVIDENCE tool, not a gate. It samples the RENDERED pixels behind the hero
 * copy (not the CSS we intended) and reports the worst contrast ratio, because
 * "the overlay is 40% black there" is a claim about CSS while "the photo behind
 * the word 'Karier' is 1.4:1" is a claim about what a visitor sees.
 *
 * WHY PIXELS AND NOT THE STYLESHEET. The overlay in global.css darkens the
 * banner `to top`, i.e. strongest at the BOTTOM of the band. On desktop the
 * headline sits mid-band on the LEFT, where that gradient is only partway
 * through — so the CSS reads as "there is an overlay" while the text still sits
 * on a bright lantern. Sampling the rendered result is the only way to tell the
 * two apart, and it is why the earlier "hero looks washed out" impression could
 * not be settled by reading class names.
 *
 * WCAG floors used: large text (>= 24px, or >= 18.66px bold) needs 3:1, normal
 * text 4.5:1. The h1 is measured, not assumed, since `--text-display` is a
 * clamp() that resolves differently per viewport.
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

for (const width of [390, 1280]) {
  const height = width < 700 ? 844 : 900;
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#atas h1', { timeout: 20_000 });
  await page.waitForTimeout(900);

  const h1box = await page.locator('#atas h1').first().boundingBox();
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  const px = await page.evaluate(async (b64) => {
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

  // Sampling INSIDE the h1 box catches glyph pixels, which are white by design
  // and score exactly 1.00:1 against white — a number that looks like a
  // catastrophic failure while measuring the opposite of what we want. The first
  // version of this file did exactly that. So: sample the band to the LEFT of
  // the text box and BETWEEN its lines, i.e. background by construction, and
  // take the BRIGHTEST sample there. Bright background under white text is the
  // real worst case, and it cannot be contaminated by the text itself.
  const samples = [];
  const padLeft = Math.max(0, Math.round(h1box.x) - 60);
  const xFrom = Math.min(padLeft, Math.round(h1box.x) - 1);
  for (let x = xFrom; x < Math.round(h1box.x); x += 4) {
    for (let y = Math.round(h1box.y); y < Math.round(h1box.y + h1box.height); y += 4) {
      if (y < 0 || y >= px.h || x < 0 || x >= px.w) continue;
      const i = (y * px.w + x) * 4;
      samples.push([px.data[i], px.data[i + 1], px.data[i + 2]]);
    }
  }
  const white = [255, 255, 255];
  // A sample that is essentially pure white is a glyph edge that bled into the
  // strip; excluding those keeps the reading honest instead of clamping it to 1.
  const background = samples.filter((s) => !(s[0] > 250 && s[1] > 250 && s[2] > 250));
  const ratios = background.map((s) => ratio(s, white)).sort((a, b) => a - b);
  const worst = ratios[0];
  const h1size = await page
    .locator('#atas h1')
    .first()
    .evaluate((el) => parseInt(getComputedStyle(el).fontSize, 10));
  const isLarge = h1size >= 24;
  const floor = isLarge ? 3.0 : 4.5;
  const verdict = worst >= floor ? 'PASS' : 'FAIL';

  console.log(
    `${width}px  h1 ${h1size}px (${isLarge ? 'large' : 'normal'} text, floor ${floor.toFixed(1)}:1)  ` +
      `worst-background ${worst.toFixed(2)}:1  -> ${verdict}  ` +
      `(${background.length} background samples, ${samples.length - background.length} glyph pixels excluded)`,
  );
  if (verdict === 'FAIL') {
    console.log(
      `        the photo behind the headline is too light at this width; ` +
        `the CSS overlay is "to top", which darkens the bottom of the band, not the left where the text sits.`,
    );
  }
  await page.close();
}
await browser.close();
