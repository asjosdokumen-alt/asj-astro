/**
 * probe-waterfall.mjs — urutan unduhan + waktu, di jaringan yang dibatasi.
 *
 * KENAPA ADA
 * ----------
 * "Halaman mengunduh X KB" tidak memberi tahu APA YANG MENGHALANGI paint.
 * Yang menentukan FCP adalah urutan: berkas mana yang memulai unduhan lebih
 * dulu dan mana yang memblokir render. Probe ini mencetak garis waktu itu,
 * ditandai `BLOCK` untuk stylesheet (render-blocking) supaya sebabnya terlihat,
 * bukan ditebak.
 *
 * WAJIB lewat `deliverables/serve-gzip.mjs`: `server.cjs` tidak memampatkan,
 * sehingga aset teks terlihat ~6x lebih besar dan setiap kesimpulan soal
 * "lambat" jadi salah.
 *
 * Pakai:
 *   ROUTE=/ node deliverables/probe-waterfall.mjs
 */
import { chromium } from '../node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTE = `/${(process.env.ROUTE || '/').replace(/^\/+/, '')}`;

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
await page.waitForTimeout(1500);

const data = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const rows = [
    {
      name: '(dokumen)',
      type: 'document',
      start: 0,
      dur: Math.round(nav.responseEnd),
      size: nav.transferSize,
    },
  ];
  for (const r of performance.getEntriesByType('resource')) {
    rows.push({
      name: r.name.replace(location.origin, ''),
      type: r.initiatorType,
      start: Math.round(r.startTime),
      dur: Math.round(r.duration),
      size: r.transferSize,
    });
  }
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  return { rows: rows.sort((a, b) => a.start - b.start), fcp: fcp ? Math.round(fcp.startTime) : null };
});

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
console.log(`\n${ROUTE}   FCP ${data.fcp}ms   (390px, CPU 4x, Slow 4G, gzip)\n`);
let total = 0;
for (const r of data.rows) {
  total += r.size;
  const flag = r.type === 'stylesheet' ? 'BLOCK' : r.type === 'other' ? 'SPRITE?' : '';
  console.log(
    `${String(r.start).padStart(5)}ms  +${String(r.dur).padStart(4)}ms  ${kb(r.size).padStart(9)}  ${r.type.padEnd(10)} ${flag.padEnd(7)} ${r.name.slice(0, 74)}`,
  );
}
console.log(`\nTOTAL transfer ${kb(total)}  ·  ${data.rows.length} permintaan`);

await browser.close();
