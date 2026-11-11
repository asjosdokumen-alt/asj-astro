import { chromium } from 'playwright';
import { ensureServer, stopServer } from '../../e2e/lib/server.mjs';
const BASE = await ensureServer();
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.$eval('button[aria-label="Toggle language"]', (el) => el.click());
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const d = document.querySelector('.dossier');
    window.scrollTo(0, d.getBoundingClientRect().top + window.scrollY - 80);
  });
  await page.waitForTimeout(900);
  const txt = await page.evaluate(() => ({
    title: document.querySelector('.dossier-title')?.textContent?.trim(),
    labels: [...document.querySelectorAll('.dossier-label')].map((n) => n.textContent?.trim()),
    firstLi: document.querySelector('.dossier-col li')?.textContent?.trim(),
  }));
  console.log(JSON.stringify(txt));
  await page.screenshot({ path: 'deliverables/profil-audit/dossier-jp-real.png' });
} finally { await browser.close(); await stopServer(); }
