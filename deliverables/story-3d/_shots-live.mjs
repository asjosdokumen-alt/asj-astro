// Potret band film #alur di situs hasil build (localhost:4321).
// Jalankan: node deliverables/story-3d/_shots-live.mjs
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const OUT = 'F:/astro/deliverables/story-3d/shots';
const browser = await chromium.launch();

for (const vp of [{ w: 1440, h: 900, tag: 'd' }, { w: 390, h: 844, tag: 'm' }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  await page.route('**/.netlify/functions/**', (r) => r.abort());
  await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const box = await page.evaluate(() => {
    const s = document.querySelector('[data-film]');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    const track = s.querySelector('[data-film-track]');
    return { top: r.top + scrollY, h: r.height, track: track?.getBoundingClientRect().height };
  });
  console.log(vp.tag, JSON.stringify(box));
  if (!box) { await page.close(); continue; }

  const span = (box.track || box.h) - vp.h;
  for (let i = 0; i < 6; i++) {
    for (const beat of [0.2, 0.62]) {
      const p = (i + beat) / 6;
      await page.evaluate((y) => window.scrollTo(0, y), box.top + p * span);
      await page.waitForTimeout(650);
      await page.screenshot({
        path: `${OUT}/film-${vp.tag}-${i}-${beat === 0.2 ? 'a' : 'b'}.jpg`,
        type: 'jpeg',
        quality: 78,
      });
    }
  }
  await page.close();
}
await browser.close();
