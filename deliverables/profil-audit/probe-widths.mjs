import { chromium } from 'playwright';
import { ensureServer, stopServer } from '../../e2e/lib/server.mjs';
const BASE = await ensureServer();
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
try {
  for (const w of [900, 1024, 1180]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => {
      const d = document.querySelector('.dossier');
      window.scrollTo(0, d.getBoundingClientRect().top + window.scrollY - 60);
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `deliverables/profil-audit/dossier-${w}.png` });
    await page.close();
  }
  console.log('ok');
} finally { await browser.close(); await stopServer(); }
