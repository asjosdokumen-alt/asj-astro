/**
 * probe-cls-sources.mjs — atribusikan pergeseran tata letak ke ELEMEN-nya.
 *
 * KENAPA ADA
 * ----------
 * `probe-mobile-perf.mjs` menjawab "berapa CLS". Angka itu tidak memberi tahu
 * APA yang bergeser, dan menebak dari kode sudah terbukti salah di repo ini
 * (CLS /loker ternyata bukan font, bukan gambar, melainkan tabel statis yang
 * disembunyikan setelah island-nya dapat data). `LayoutShiftAttribution`
 * memberi rect SEBELUM dan SESUDAH per elemen — itu satu-satunya bukti.
 *
 * Pakai:
 *   ROUTE=/public node deliverables/probe-cls-sources.mjs
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const ROUTE = `/${(process.env.ROUTE || '/loker').replace(/^\/+/, '')}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

/* Throttling HARUS sama dengan `probe-mobile-perf.mjs`. Diukur 2026-11-09:
   /public melaporkan CLS 0,000 tanpa throttling dan 0,190 dengan CPU 4× +
   Slow 4G — pergeseran yang muncul hanya ketika gambar datang setelah tata
   letak pertama. Probe yang tidak meniru kondisi itu akan melaporkan "bersih"
   untuk halaman yang rusak. */
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({
        value: +e.value.toFixed(4),
        at: Math.round(e.startTime),
        sources: (e.sources || []).map((s) => {
          const n = s.node;
          if (!n) return { tag: '(node dilepas)' };
          const cls = typeof n.className === 'string' ? n.className : '';
          return {
            tag: n.tagName?.toLowerCase() + (n.id ? `#${n.id}` : ''),
            class: cls.slice(0, 70),
            before: s.previousRect ? `y=${Math.round(s.previousRect.y)} h=${Math.round(s.previousRect.height)}` : '(tidak ada)',
            after: s.currentRect ? `y=${Math.round(s.currentRect.y)} h=${Math.round(s.currentRect.height)}` : '(tidak ada)',
          };
        }),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
});

await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
await page.waitForTimeout(5000);

const shifts = await page.evaluate(() => window.__shifts);
const total = shifts.reduce((a, s) => a + s.value, 0);
console.log(`${ROUTE}  total CLS ${total.toFixed(3)}  (${shifts.length} entri)\n`);
for (const s of shifts) {
  console.log(`  ${s.value.toFixed(4)} @ ${s.at}ms`);
  for (const src of s.sources) {
    console.log(`     ${src.tag}.${src.class}`);
    console.log(`        ${src.before}  ->  ${src.after}`);
  }
}

await browser.close();
