import { chromium } from 'playwright';
import { ensureServer, stopServer } from '../../e2e/lib/server.mjs';
const BASE = await ensureServer();
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  const out = await page.evaluate(() => {
    const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const over = (fg, bg) => {
      const a = fg[3] ?? 1;
      return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
    };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const body = parse(getComputedStyle(document.body).backgroundColor);
    const sec = document.querySelector('.dossier').closest('section');
    const secBg = over(parse(getComputedStyle(sec).backgroundColor), body);
    const dossierBg = over(parse(getComputedStyle(document.querySelector('.dossier')).backgroundColor), secBg);
    const probe = (sel) => {
      const el = document.querySelector(sel);
      const fg = parse(getComputedStyle(el).color);
      return { sel, color: getComputedStyle(el).color, size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight, ratio: +ratio(over(fg, dossierBg), dossierBg).toFixed(2) };
    };
    return {
      bg: dossierBg.map(Math.round),
      rows: [probe('.dossier-title'), probe('.dossier-lead'), probe('.dossier-label'), probe('.dossier-col li'), probe('.dossier-num')],
    };
  });
  console.log(JSON.stringify(out, null, 1));
} finally { await browser.close(); await stopServer(); }
