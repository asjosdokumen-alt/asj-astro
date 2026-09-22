/**
 * Measure the hero band's actual geometry, so the fix is based on numbers
 * rather than on how the screenshot looks.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

for (const width of [390, 1280, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://127.0.0.1:4321/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#atas h1', { timeout: 30_000 });
  await page.waitForTimeout(800);

  const m = await page.evaluate(() => {
    const hero = document.getElementById('atas');
    const res = {};
    const gutter =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u-scrollbar-gutter')) || 0;
    res.innerWidth = window.innerWidth;
    res.clientWidth = document.documentElement.clientWidth;
    res.gutterVar = gutter;
    const r = hero.getBoundingClientRect();
    res.heroLeft = Math.round(r.left);
    res.heroRight = Math.round(r.right);
    res.heroWidth = Math.round(r.width);
    res.gapLeft = Math.round(r.left);
    res.gapRight = Math.round(document.documentElement.clientWidth - r.right);
    const cs = getComputedStyle(hero);
    res.paddingLeft = cs.paddingLeft;
    res.paddingRight = cs.paddingRight;
    res.maxWidth = cs.maxWidth;
    // The eyebrow is the furthest-left text; the chips the furthest-right block.
    const chips = hero.querySelectorAll('span');
    let maxRight = 0;
    for (const c of chips) {
      const cr = c.getBoundingClientRect();
      if (cr.width && cr.right > maxRight) maxRight = cr.right;
    }
    res.contentRight = Math.round(maxRight);
    return res;
  });

  console.log(`\n── ${width}px ──`);
  for (const [k, v] of Object.entries(m)) console.log(`  ${k.padEnd(14)} ${v}`);
  await page.close();
}

await browser.close();
