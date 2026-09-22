/** Evidence: is the hero eyebrow clipped at the container edge? */
import { chromium } from 'playwright';
const BASE = process.env.LANDING_URL || 'http://127.0.0.1:4321/';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#atas h1', { timeout: 20_000 });
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => {
    const hdr = document.querySelector('#atas').getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll('#atas .text-eyebrow, #atas [class*="truncate"]')) {
      const r = el.getBoundingClientRect();
      out.push({
        text: (el.textContent || '').trim().slice(0, 34),
        x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width),
        scrollW: el.scrollWidth, clientW: el.clientWidth,
        clipped: el.scrollWidth > el.clientWidth + 1,
      });
    }
    return { headerLeft: Math.round(hdr.x), headerRight: Math.round(hdr.right), items: out };
  });
  console.log(`${width}px  header ${info.headerLeft}..${info.headerRight}`);
  for (const it of info.items) {
    const verdict = it.clipped ? 'CLIPPED' : 'ok';
    console.log(
      `        x=${it.x} right=${it.right} w=${it.w} scrollW=${it.scrollW} ` +
        `clientW=${it.clientW} ${verdict}  "${it.text}"`,
    );
  }
  await page.close();
}
await browser.close();
