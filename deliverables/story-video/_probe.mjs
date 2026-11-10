// Probe sekali pakai — buktikan animatic bergerak & tidak ada elemen terpotong.
// Jalankan: node deliverables/story-video/_probe.mjs
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const URL = 'file:///F:/astro/deliverables/story-video/index.html';
const OUT = 'F:/astro/deliverables/story-video/shots';
const STOPS = [3, 9, 18, 27, 35, 43, 52, 60, 68, 76];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(800);

const fonts = await page.evaluate(async () => {
  await document.fonts.ready;
  return { serif: document.fonts.check('40px "Instrument Serif"'), inter: document.fonts.check('16px "Inter"') };
});
const imgs = await page.evaluate(() =>
  [...document.images].map(i => ({ src: i.currentSrc.split('/').pop(), w: i.naturalWidth, ok: i.complete && i.naturalWidth > 0 }))
);

for (const s of STOPS) {
  await page.evaluate(v => window.__seek(v), s);
  await page.waitForTimeout(160);
  await page.screenshot({ path: `${OUT}/s${String(s).padStart(2, '0')}.png` });
}

// gerak: objek harus berubah transform antar waktu dalam shot yang sama
await page.evaluate(() => window.__seek(16));
await page.waitForTimeout(120);
const a = await page.evaluate(() => {
  const o = document.querySelectorAll('.shot')[2].querySelector('.obj');
  return { tr: getComputedStyle(o).transform, op: getComputedStyle(document.querySelectorAll('.shot')[2]).opacity };
});
await page.evaluate(() => window.__seek(22));
await page.waitForTimeout(120);
const b = await page.evaluate(() => {
  const o = document.querySelectorAll('.shot')[2].querySelector('.obj');
  return { tr: getComputedStyle(o).transform, op: getComputedStyle(document.querySelectorAll('.shot')[2]).opacity };
});

// teks berganti di dalam shot yang sama?
await page.evaluate(() => window.__seek(17));
const beatA = await page.evaluate(() => [...document.querySelectorAll('.shot')[2].querySelectorAll('.beat')].map(e => +getComputedStyle(e).opacity.slice(0, 4)));
await page.evaluate(() => window.__seek(22));
const beatB = await page.evaluate(() => [...document.querySelectorAll('.shot')[2].querySelectorAll('.beat')].map(e => +getComputedStyle(e).opacity.slice(0, 4)));

console.log(JSON.stringify({
  fonts, imgsOk: imgs.every(i => i.ok), imgs: imgs.length,
  drift: { changed: a.tr !== b.tr, at16: a.tr.slice(0, 42), at22: b.tr.slice(0, 42) },
  beatSwap: { at17: beatA, at22: beatB },
  errs,
}, null, 2));
await browser.close();
