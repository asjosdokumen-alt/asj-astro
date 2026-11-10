// Probe scroll-story: potret tiap babak + buktikan kamera benar-benar bergerak.
// Jalankan: node deliverables/story-3d/_probe.mjs
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const URL = 'file:///F:/astro/deliverables/story-3d/index.html';
const OUT = 'F:/astro/deliverables/story-3d/shots';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const imgs = await page.evaluate(() =>
  [...document.images].map(i => ({ src: i.currentSrc.split('/').pop(), ok: i.complete && i.naturalWidth > 0 }))
);

async function goto(i) {
  // tengah babak (local 0.45), bukan awalnya — di awal babak teks memang
  // belum masuk, jadi potret di titik itu tidak menilai apa pun.
  await page.evaluate(n => {
    const max = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo(0, ((n + .45) / 7) * max);
  }, i);
  await page.waitForTimeout(1400);
}

for (let i = 0; i < 7; i++) {
  await goto(i);
  await page.screenshot({ path: `${OUT}/ch${i}.jpg`, type: 'jpeg', quality: 84 });
}

// kamera: transform gambar harus berbeda di dua titik dalam babak yang sama
await page.evaluate(() => {
  const max = document.documentElement.scrollHeight - innerHeight;
  window.scrollTo(0, (1 / 7) * max + 10);
});
await page.waitForTimeout(1200);
const a = await page.evaluate(() => {
  const s = document.querySelectorAll('.scene')[1];
  return { tr: getComputedStyle(s.querySelector('.photo')).transform, op: getComputedStyle(s).opacity };
});
await page.evaluate(() => {
  const max = document.documentElement.scrollHeight - innerHeight;
  window.scrollTo(0, (1 / 7) * max + 110);
});
await page.waitForTimeout(1200);
const b = await page.evaluate(() => {
  const s = document.querySelectorAll('.scene')[1];
  return { tr: getComputedStyle(s.querySelector('.photo')).transform, op: getComputedStyle(s).opacity };
});

// transisi: di batas dua babak, dua scene harus sama-sama terlihat
await page.evaluate(() => {
  const max = document.documentElement.scrollHeight - innerHeight;
  window.scrollTo(0, (1 / 7) * max);
});
await page.waitForTimeout(1400);
const cross = await page.evaluate(() =>
  [...document.querySelectorAll('.scene')].map((s, i) => ({ i, op: +getComputedStyle(s).opacity })).filter(x => x.op > 0.02)
);

console.log(JSON.stringify({
  imgsOk: imgs.every(i => i.ok), imgs: imgs.length,
  camera: { changed: a.tr !== b.tr, at10: a.tr.slice(0, 46), at110: b.tr.slice(0, 46) },
  crossfadeAtBoundary: cross,
  errs,
}, null, 2));
await browser.close();
