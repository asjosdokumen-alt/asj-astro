/**
 * measure-hero-stats.mjs — are the three hero stat tiles one strip or a stack?
 *
 * EVIDENCE tool, not a gate. Motivated by a screenshot in which 2023 / 5 / 4
 * appeared to be three separate rows running down the right-hand side at
 * 1280px. The markup carries BOTH `sm:grid-cols-3` and `lg:grid-cols-1`, and the
 * second wins at lg — so the suspected defect is real by construction, but
 * "the tiles are stacked" is only worth reporting once it is measured, because
 * the same screenshot could equally have been reading a deliberate narrow rail.
 */
import { chromium } from 'playwright';

const BASE = process.env.LANDING_URL || 'http://127.0.0.1:4321/';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

for (const width of [390, 700, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#atas h1', { timeout: 20_000 });
  await page.waitForTimeout(700);

  const boxes = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('#atas .rounded-card')];
    return tiles.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
  });

  const rows = new Set(boxes.map((b) => b.y));
  const oneRow = rows.size === 1;
  const stacked = boxes.length > 1 && rows.size === boxes.length;
  const cols = await page.evaluate(() => {
    const grid = document.querySelector('#atas .lg\\:col-span-5');
    return grid ? getComputedStyle(grid).gridTemplateColumns : null;
  });
  const layout = oneRow ? 'ONE ROW' : stacked ? 'STACKED (one per row)' : 'MIXED';

  console.log(`${width}px  tiles=${boxes.length}  grid-template-columns: ${cols}  -> ${layout}`);
  for (const b of boxes) console.log(`        y=${b.y}  x=${b.x}  ${b.w}x${b.h}  "${b.text}"`);
  await page.close();
}
await browser.close();
