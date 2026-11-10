/**
 * probe-mobile-perf.mjs — ukur KINERJA mobile, bukan tata letak.
 *
 * KENAPA ADA
 * ----------
 * `e2e/responsive-sweep.mjs` menjawab "apakah ada elemen meluber / terlalu
 * kecil untuk disentuh". Ia TIDAK menjawab "berapa lama pengguna menunggu".
 * Dua halaman bisa sama rapi secara tata letak dan berbeda 3 detik dalam
 * waktu tampil — dan di telepon, detik itulah yang menentukan.
 *
 * YANG DIUKUR (dan kenapa masing-masing)
 * --------------------------------------
 * LCP  — elemen terbesar yang terlihat. Di beranda ini digerakkan oleh island
 *        `client:only`, jadi LCP hanya bisa terjadi SETELAH JS jalan. Angka
 *        LCP karena itu mengukur biaya JS, bukan biaya gambar.
 * CLS  — pergeseran tata letak. Font swap + gambar tanpa dimensi adalah
 *        penyebab khas; diukur dari `layout-shift` yang tidak dipicu input.
 * TBT  — total waktu main-thread TERBLOKIR (task > 50ms). Di Android kelas
 *        menengah, inilah yang membuat halaman "terasa macet" walau LCP bagus.
 * BYTES— dipisah per jenis (script/css/font/img), karena "bundle 3,8 MB" tidak
 *        memberi tahu apa yang benar-benar DIUNDUH halaman ini.
 *
 * THROTTLING
 * ----------
 * CPU 4× dan Slow 4G (1,6 Mbps / 750 kbps / 150ms RTT) — profil "ponsel
 * menengah di jaringan seluler", bukan desktop cepat. Tanpa throttling semua
 * halaman terlihat bagus dan probe ini tidak akan pernah menemukan apa pun.
 *
 * Jalankan (server harus hidup; probe TIDAK menyalakannya):
 *   node deliverables/probe-mobile-perf.mjs
 *   BASE_URL=http://localhost:4322 node deliverables/probe-mobile-perf.mjs
 */
import { chromium } from '../node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const ROUTES = (process.env.ROUTES || '/,/loker,/public').split(',').map((r) => {
  // Git Bash menulis ulang argumen yang DIAWALI "/" menjadi path Windows
  // (`/loker` -> `C:/Program Files/.../loker`) — jebakan yang sama dengan
  // `--only=` di R25. Normalisasi di sini supaya ROUTES=loker,public aman.
  const clean = r.trim().replace(/^[A-Za-z]:[\\/].*?[\\/]astro[\\/]/, '/').replace(/^\/+/, '');
  return `/${clean}`;
});
const REPEAT = Number(process.env.REPEAT || 2);

const COLLECT = () => {
  window.__perf = { lcp: 0, lcpEl: '', cls: 0, longTasks: 0, longTaskMs: 0, shifts: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perf.lcp = e.startTime;
        window.__perf.lcpEl = e.element
          ? `${e.element.tagName.toLowerCase()}${e.element.id ? `#${e.element.id}` : ''}.${(
              e.element.className || ''
            )
              .toString()
              .split(/\s+/)
              .slice(0, 2)
              .join('.')}`
          : e.url || '(gambar)';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__perf.cls += e.value;
        window.__perf.shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perf.longTasks++;
        window.__perf.longTaskMs += e.duration - 50;
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
};

const browser = await chromium.launch();
const results = [];

for (const route of ROUTES) {
  for (let run = 1; run <= REPEAT; run++) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
    });
    const page = await ctx.newPage();
    await page.addInitScript(COLLECT);

    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const byType = {};
    let reqs = 0;
    page.on('response', async (res) => {
      reqs++;
      const rt = res.request().resourceType();
      const h = res.headers();
      const len = Number(h['content-length'] || 0);
      byType[rt] = byType[rt] || { n: 0, bytes: 0 };
      byType[rt].n++;
      byType[rt].bytes += len;
    });

    const t0 = Date.now();
    await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 60000 });
    const loadMs = Date.now() - t0;
    // beri waktu LCP/CLS akhir + idle singkat supaya long-task terlapor
    await page.waitForTimeout(2500);

    const perf = await page.evaluate(() => window.__perf);
    const timing = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0] || {};
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return {
        fcp: fcp ? Math.round(fcp.startTime) : null,
        dcl: Math.round(n.domContentLoadedEventEnd || 0),
        load: Math.round(n.loadEventEnd || 0),
        transfer: Math.round(
          performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0),
        ),
      };
    });

    results.push({
      route,
      run,
      lcp: Math.round(perf.lcp),
      lcpEl: perf.lcpEl,
      cls: +perf.cls.toFixed(3),
      shifts: perf.shifts,
      tbt: Math.round(perf.longTaskMs),
      longTasks: perf.longTasks,
      fcp: timing.fcp,
      load: timing.load,
      loadMs,
      reqs,
      byType,
    });
    await ctx.close();
  }
}

await browser.close();

const kb = (b) => `${(b / 1024).toFixed(0)}KB`;
for (const r of results) {
  const parts = Object.entries(r.byType)
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .map(([k, v]) => `${k}:${v.n}/${kb(v.bytes)}`)
    .join(' ');
  console.log(
    `\n${r.route} (run ${r.run})  LCP ${r.lcp}ms  CLS ${r.cls}  TBT ${r.tbt}ms/${r.longTasks}task  FCP ${r.fcp}ms  load ${r.loadMs}ms`,
  );
  console.log(`  LCP elemen : ${r.lcpEl}`);
  console.log(`  request    : ${r.reqs}   ${parts}`);
  if (r.shifts.length) console.log(`  shifts     : ${JSON.stringify(r.shifts.slice(0, 8))}`);
}

// ringkasan: median per rute
const byRoute = {};
for (const r of results) (byRoute[r.route] ||= []).push(r);
const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`\n${'─'.repeat(78)}\nRINGKASAN (median dari ${REPEAT} run, 390px, CPU 4×, Slow 4G)`);
for (const [route, rs] of Object.entries(byRoute)) {
  const js = med(rs.map((r) => r.byType.script?.bytes || 0));
  const css = med(rs.map((r) => r.byType.stylesheet?.bytes || 0));
  const font = med(rs.map((r) => r.byType.font?.bytes || 0));
  const img = med(rs.map((r) => r.byType.image?.bytes || 0));
  console.log(
    `  ${route.padEnd(9)} LCP ${String(med(rs.map((r) => r.lcp))).padStart(5)}ms · CLS ${med(rs.map((r) => r.cls)).toFixed(3)} · TBT ${String(med(rs.map((r) => r.tbt))).padStart(4)}ms · js ${kb(js)} css ${kb(css)} font ${kb(font)} img ${kb(img)}`,
  );
}
