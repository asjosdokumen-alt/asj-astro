/**
 * shot-bottomnav-occlusion.mjs — tangkapan layar bukti bahwa konten terakhir
 * halaman /candidate berada di bawah BottomNav.
 *
 * Menghasilkan:
 *   test-results/before-occlusion-390.png  — gulir paling bawah, tanpa perbaikan
 *
 * Jalankan: BASE_URL=http://localhost:4323 node e2e/shot-bottomnav-occlusion.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4323';
const OUT = 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    storageState: {
      cookies: [],
      origins: [{
        origin: BASE,
        localStorage: [{
          name: 'asj_auth',
          value: JSON.stringify({ role: 'kandidat', name: 'Budi', wa: '081234567890',
            sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now() }),
        }],
      }],
    },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/candidate`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(600);

  const tag = process.env.TAG || 'before';
  await page.screenshot({ path: `${OUT}/${tag}-occlusion-390.png` });

  // Sorot area yang tertutup supaya terlihat jelas.
  await page.evaluate(() => {
    const m = document.createElement('div');
    m.id = 'proof-overlay';
    m.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:45px;background:rgba(239,68,68,.35);border-top:2px solid #ef4444;z-index:99999;pointer-events:none';
    const lbl = document.createElement('div');
    lbl.textContent = 'AREA TERTUTUP BottomNav 45px';
    lbl.style.cssText = 'position:absolute;top:4px;left:8px;font:700 10px system-ui;color:#fff;text-shadow:0 1px 3px #000';
    m.appendChild(lbl);
    document.body.appendChild(m);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${tag}-occlusion-marked-390.png` });

  const info = await page.evaluate(() => ({
    navHeight: Math.round(document.querySelector('#bottom-nav-kandidat').getBoundingClientRect().height),
    mainPadBottom: getComputedStyle(document.querySelector('#main-content')).paddingBottom,
    scrollY: Math.round(window.scrollY),
    scrollHeight: document.documentElement.scrollHeight,
  }));
  console.log(JSON.stringify(info, null, 2));
  console.log(`\nTersimpan: ${OUT}/${tag}-occlusion-390.png dan ${OUT}/${tag}-occlusion-marked-390.png`);
} finally {
  await browser.close();
}
