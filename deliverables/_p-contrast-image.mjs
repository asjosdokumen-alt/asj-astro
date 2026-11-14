/**
 * Probe: kontras SEBENARNYA teks di atas artwork — yang tidak diukur
 * `e2e/test-contrast.mjs` karena latarnya gambar/gradien (4.368 elemen
 * "unmeasurable").
 *
 * Metode: sembunyikan teks, potret persis kotak teksnya, ambil piksel
 * TERANG (kasus terburuk untuk teks putih), lalu hitung rasio WCAG.
 *
 * Usage: BASE=http://127.0.0.1:4321 node deliverables/_p-contrast-image.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1200);

/** Luminance relatif WCAG dari [r,g,b] 0-255. */
const lum = (r, g, b) => {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function measure(selector, label) {
  // Gulir elemen ke tengah viewport dulu:  hanya
  // memotret di dalam viewport, bukan di koordinat dokumen.
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      window.scrollTo(0, r.top + window.scrollY - (window.innerHeight - r.height) / 2);
    }
  }, selector);
  await page.waitForTimeout(400);
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, selector);
  if (!box || box.w < 8 || box.h < 8) {
    console.log(label, 'SKIP (tidak ada / terlalu kecil)');
    return;
  }
  // Sembunyikan teks di dalam kotak itu saja, supaya latarnya terbaca.
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.style.visibility = 'hidden';
  }, selector);
  await page.waitForTimeout(150);
  const b64 = (
    await page.screenshot({
      clip: { x: box.x, y: box.y, width: box.w, height: box.h },
    })
  ).toString('base64');
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.style.visibility = '';
  }, selector);

  const stats = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let best = -1;
    let bestPx = null;
    const lums = [];
    for (let i = 0; i < d.length; i += 4) {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const L = 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]);
      lums.push(L);
      if (L > best) {
        best = L;
        bestPx = [d[i], d[i + 1], d[i + 2]];
      }
    }
    lums.sort((a, b) => a - b);
    const pct = (p) => lums[Math.min(lums.length - 1, Math.floor(lums.length * p))];
    return {
      max: +best.toFixed(4),
      p95: +pct(0.95).toFixed(4),
      median: +pct(0.5).toFixed(4),
      px: bestPx,
    };
  }, b64);

  const white = lum(255, 255, 255);
  const rMax = ratio(white, stats.max);
  const r95 = ratio(white, stats.p95);
  console.log(
    `${label}  ${box.w}x${box.h}  piksel-terang L=${stats.max} (rgb ${stats.px})  ` +
      `rasio terburuk ${rMax.toFixed(2)}:1 · p95 ${r95.toFixed(2)}:1 · median ${ratio(white, stats.median).toFixed(2)}:1`,
  );
  return rMax;
}

console.log('Teks putih di atas artwork — rasio terhadap piksel TERANG di belakangnya');
console.log('(WCAG AA teks besar = 3:1, teks normal = 4.5:1)\n');

await measure('header.hero-band h1', 'HERO  h1  ');
await measure('header.hero-band p.text-body', 'HERO  sub ');
await measure('.film-copy h3', 'FILM  h3  ');
await measure('.film-body', 'FILM  body');

await browser.close();
