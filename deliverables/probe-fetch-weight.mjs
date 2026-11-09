/**
 * probe-fetch-weight.mjs — respons XHR/fetch mana yang benar-benar berat.
 *
 * KENAPA ADA
 * ----------
 * `probe-mobile-perf.mjs` merangkum "fetch:2/108KB" pada /public. Angka itu
 * tidak memberi tahu ENDPOINT mana, berapa ukuran MENTAH vs terkompresi, atau
 * apakah payload itu dipakai halaman. Tanpa itu, "108 KB JSON di halaman
 * publik" tidak bisa dibedakan dari "satu permintaan kecil yang dilaporkan
 * ganda oleh dua probe".
 *
 * Probe ini mencetak setiap respons `fetch`/`xhr`: URL, status, content-length
 * terkirim, dan ukuran BODY yang benar-benar dibaca (decodedBodySize).
 *
 * Pakai:
 *   ROUTE=public BASE_URL=http://localhost:4400 node deliverables/probe-fetch-weight.mjs
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTE = `/${(process.env.ROUTE || 'public').replace(/^\/+/, '')}`;
const WAIT = Number(process.env.WAIT || 6000);

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

const seen = [];
page.on('response', (res) => {
  const t = res.request().resourceType();
  if (t !== 'fetch' && t !== 'xhr') return;
  seen.push({ url: res.url(), type: t, status: res.status() });
});

await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
await page.waitForTimeout(WAIT);

const entries = await page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .filter((r) => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest')
    .map((r) => ({
      name: r.name.replace(location.origin, ''),
      start: Math.round(r.startTime),
      dur: Math.round(r.duration),
      transfer: r.transferSize,
      encoded: r.encodedBodySize,
      decoded: r.decodedBodySize,
    })),
);

console.log(`\n${ROUTE} — fetch/xhr (390px, CPU 4x, Slow 4G)\n`);
for (const e of entries.sort((a, b) => b.transfer - a.transfer)) {
  console.log(
    `${String(e.transfer).padStart(7)}B terkirim  ${String(e.decoded).padStart(7)}B mentah  ` +
      `${String(e.start).padStart(5)}ms +${String(e.dur).padStart(4)}ms  ${e.name.slice(0, 66)}`,
  );
}
const statuses = seen.map((s) => `${s.status} ${s.url.replace(BASE, '').slice(0, 60)}`);
console.log(`\nstatus: ${statuses.length ? statuses.join(' | ') : '(tidak ada)'}`);

await browser.close();
