import { chromium } from 'playwright';
import { ensureServer, stopServer } from '../../e2e/lib/server.mjs';
const BASE = await ensureServer();
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
const shots = [
  { tag: 'desktop-light', w: 1440, h: 1000, theme: 'light' },
  { tag: 'desktop-dark', w: 1440, h: 1000, theme: 'dark' },
  { tag: 'ponsel', w: 390, h: 844, theme: 'dark', dpr: 2 },
];
try {
  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr || 1, isMobile: !!s.dpr });
    await page.addInitScript((t) => {
      try { localStorage.setItem('asj-theme', t); } catch {}
      document.documentElement.dataset.theme = t;
    }, s.theme);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, s.theme);
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => {
      const d = document.querySelector('.dossier');
      const r = d.getBoundingClientRect();
      window.scrollTo(0, r.top + window.scrollY - 80);
      return { top: Math.round(r.top + window.scrollY), h: Math.round(r.height) };
    });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `deliverables/profil-audit/dossier-${s.tag}.png` });
    console.log(s.tag, JSON.stringify(box), await page.evaluate(() => document.documentElement.dataset.theme));
    await page.close();
  }
} finally { await browser.close(); await stopServer(); }
