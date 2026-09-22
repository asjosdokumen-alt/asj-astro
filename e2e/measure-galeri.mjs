/**
 * measure-galeri.mjs — EVIDENCE tool, asserts nothing.
 *
 * Proves the gallery and the #tentang photo are not just present in the HTML but
 * actually PAINTED: each image has decoded to a non-zero natural size, occupies a
 * real box, and is not overflowing its container. An <img> can be in the DOM,
 * have the right src, and still render as a broken 0-height box — which is the
 * exact failure the old note at index.astro:406 was written to avoid, so it is
 * worth measuring rather than assuming.
 *
 * Run: BASE_URL=http://127.0.0.1:4321 node e2e/measure-galeri.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

for (const [width, height] of [
  [390, 844],
  [1280, 900],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#galeri', { timeout: 20_000 });

  // Scroll through so lazy images are requested.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);

  const report = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img[src^="/assets/"]')];
    const gal = document.querySelector('#galeri');
    return {
      vw: window.innerWidth,
      galleryBox: gal ? Math.round(gal.getBoundingClientRect().width) : null,
      imageCount: imgs.length,
      broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
      overflow: imgs
        .filter((i) => i.getBoundingClientRect().right > window.innerWidth + 1)
        .map((i) => i.getAttribute('src')),
      rows: imgs.map((i) => {
        const r = i.getBoundingClientRect();
        return {
          src: (i.getAttribute('src') || '').replace('/assets/', ''),
          nat: `${i.naturalWidth}x${i.naturalHeight}`,
          box: `${Math.round(r.width)}x${Math.round(r.height)}`,
          loading: i.getAttribute('loading'),
        };
      }),
    };
  });

  console.log(`\n════════ ${width}x${height} ════════`);
  console.log(`gallery container width : ${report.galleryBox}px  (viewport ${report.vw})`);
  console.log(`images found            : ${report.imageCount}`);
  console.log(`BROKEN (nat=0)          : ${report.broken.length ? report.broken.join(', ') : 'none'}`);
  console.log(`OVERFLOWING viewport    : ${report.overflow.length ? report.overflow.join(', ') : 'none'}`);
  console.log('per-image:');
  for (const r of report.rows) console.log(`   ${r.src.padEnd(38)} nat=${r.nat.padEnd(11)} box=${r.box.padEnd(11)} ${r.loading}`);

  await page.close();
}

await browser.close();
