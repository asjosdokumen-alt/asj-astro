/**
 * probe-image-weight.mjs — gambar mana yang BENAR-BENAR mahal, dan kenapa.
 *
 * KENAPA ADA
 * ----------
 * "Halaman mengunduh 530 KB gambar" adalah angka tanpa alamat. Yang menentukan
 * apakah angka itu cacat atau bukan:
 *   · posisinya — di atas fold (harus segera) atau jauh di bawah (boleh ditunda);
 *   · `loading` dan `fetchpriority` — apakah browser memang disuruh menunda;
 *   · ukuran TAMPIL vs ukuran intrinsik — `object-cover` bisa membuat gambar
 *     kecil terpakai penuh, dan sebaliknya.
 *
 * Tanpa tiga kolom itu, "172 KB untuk slot 390px" terlihat seperti pemborosan
 * padahal bisa jadi justru ukuran yang dibutuhkan (cover-crop mengunci ke
 * TINGGI kotak, bukan lebarnya).
 *
 * Pakai:
 *   node deliverables/probe-image-weight.mjs
 *   BASE_URL=http://localhost:4400 node deliverables/probe-image-weight.mjs
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTE = `/${(process.env.ROUTE || '').replace(/^\/+/, '')}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const data = await page.evaluate(() => {
  const timing = new Map();
  for (const r of performance.getEntriesByType('resource')) {
    if (r.initiatorType === 'img' || /\.(avif|webp|png|jpe?g)$/i.test(r.name)) {
      timing.set(r.name, { start: Math.round(r.startTime), size: r.transferSize });
    }
  }
  return [...document.images].map((img) => {
    const r = img.getBoundingClientRect();
    const t = timing.get(img.currentSrc) || timing.get(img.src) || {};
    return {
      src: (img.currentSrc || img.src).replace(location.origin, ''),
      loading: img.loading,
      priority: img.getAttribute('fetchpriority') || '(auto)',
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      displayed: `${Math.round(r.width)}x${Math.round(r.height)}`,
      top: Math.round(r.top + window.scrollY),
      aboveFold: r.top + window.scrollY < window.innerHeight,
      kb: t.size ? Math.round(t.size / 1024) : null,
      startMs: t.start ?? null,
    };
  });
});

data.sort((a, b) => (b.kb || 0) - (a.kb || 0));
console.log(`\n${ROUTE || '/'}  — gambar pada 390px, DPR 2 (CPU 4x, Slow 4G)\n`);
let total = 0;
for (const i of data) {
  total += i.kb || 0;
  console.log(
    `${String(i.kb ?? '?').padStart(4)}KB  ${String(i.startMs ?? '?').padStart(5)}ms  ` +
      `${i.aboveFold ? 'ATAS ' : 'bawah'}  load=${i.loading.padEnd(5)} prio=${i.priority.padEnd(7)} ` +
      `tampil=${i.displayed.padEnd(10)} asli=${i.natural.padEnd(11)} y=${String(i.top).padStart(5)}  ${i.src.slice(0, 150)}`,
  );
}
console.log(`\nTOTAL ${total} KB`);

await browser.close();
