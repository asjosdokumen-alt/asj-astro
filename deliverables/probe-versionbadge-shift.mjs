/**
 * probe-versionbadge-shift.mjs — siapa yang MENGHILANGKAN baris versi?
 *
 * KENAPA ADA
 * ----------
 * `probe-cls-sources.mjs` pada /apply dan /siswa-baru menunjuk SATU elemen:
 *   div.border-t.border-line/20   y=427 h=69  ->  y=0 h=0
 * yaitu `VersionBadge.astro` — 69 px yang lenyap ~1,8-2,1 s setelah paint,
 * dan CLS-nya PERSIS 69/844 = 0,0817. Jadi seluruh CLS halaman-halaman form
 * berasal dari satu baris kaki halaman ini.
 *
 * Probe ini menjawab PERTANYAAN YANG BERBEDA dari probe CLS: bukan "berapa",
 * melainkan "atribut/elemen mana yang berubah". Ia mencatat:
 *   - rect + display + visibility baris itu pada beberapa waktu,
 *   - setiap mutasi DOM di <body> (atribut class/style, penambahan, penghapusan)
 *     beserta ringkasan node-nya.
 *
 * Pakai:
 *   ROUTE=apply BASE_URL=http://localhost:4400 node deliverables/probe-versionbadge-shift.mjs
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTE = `/${(process.env.ROUTE || '/apply').replace(/^\/+/, '')}`;

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

await page.addInitScript(() => {
  window.__log = [];
  const t0 = performance.now();
  const stamp = () => Math.round(performance.now() - t0);

  // Baris versi = induk dari #asj-version
  const describe = (n) => {
    if (!n) return '(null)';
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (!el) return `${n.nodeName}`;
    const cls = typeof el.className === 'string' ? el.className.slice(0, 60) : '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${cls}`;
  };

  new MutationObserver((records) => {
    for (const r of records) {
      const target = describe(r.target);
      if (r.type === 'attributes') {
        window.__log.push(`${stamp()}ms attr ${r.attributeName} on ${target} -> ${String(
          r.target.getAttribute?.(r.attributeName) ?? '',
        ).slice(0, 80)}`);
      } else if (r.type === 'childList') {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1) window.__log.push(`${stamp()}ms ADD ${describe(n)} into ${target}`);
        }
        for (const n of r.removedNodes) {
          if (n.nodeType === 1) window.__log.push(`${stamp()}ms DEL ${describe(n)} from ${target}`);
        }
      }
    }
  // `document`, BUKAN `document.documentElement`: skrip init berjalan SEBELUM
  // <html> ada, dan `observe(null)` melempar TypeError yang membunuh seluruh
  // skrip init — gejalanya "log kosong", bukan error yang terlihat.
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'data-js', 'data-loker-failed'],
  });

  const sample = (why) => {
    const v = document.getElementById('asj-version');
    const row = v?.closest('div.border-t') || v?.parentElement?.parentElement;
    if (!row) {
      window.__log.push(`${stamp()}ms SAMPLE(${why}) row TIDAK ADA`);
      return;
    }
    const r = row.getBoundingClientRect();
    const cs = getComputedStyle(row);
    const parent = row.parentElement;
    const pcs = parent ? getComputedStyle(parent) : null;
    window.__log.push(
      `${stamp()}ms SAMPLE(${why}) y=${Math.round(r.y)} h=${Math.round(r.height)} display=${cs.display} vis=${cs.visibility} parent=${describe(parent)} pdisplay=${pcs?.display} ph=${parent ? Math.round(parent.getBoundingClientRect().height) : '?'}`,
    );
  };
  sample('init-script');
  document.addEventListener('DOMContentLoaded', () => sample('DOMContentLoaded'), { once: true });
  window.addEventListener('load', () => sample('load'), { once: true });
  setTimeout(() => sample('1500ms'), 1500);
  setTimeout(() => sample('2500ms'), 2500);
  setTimeout(() => sample('4000ms'), 4000);
});

await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
await page.waitForTimeout(5000);

const log = await page.evaluate(() => window.__log);
console.log(`${ROUTE}\n`);
for (const line of log) console.log(`  ${line}`);

await browser.close();
