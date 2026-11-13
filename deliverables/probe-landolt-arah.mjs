// Bukti visual arah celah Landolt: 8 cincin, satu per arah, dengan label arah.
// Dipakai untuk menjawab "arahnya bener gak" dengan MATA, bukan dengan argumen.
import { chromium } from 'playwright';

const bundle = 'F:/tmp/landolt-bundle.js';
const OUT = process.argv[2] || 'F:/tmp/landolt-arah.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 2 });
await page.setContent(`<!doctype html><meta charset="utf-8">
<style>
  body{margin:0;background:#0b1220;color:#e2e8f0;font:700 12px system-ui}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:12px}
  figure{margin:0;background:#fff;border-radius:10px;padding:8px;text-align:center;color:#0f172a}
  figcaption{margin-top:6px;font:800 12px system-ui;letter-spacing:.02em}
</style>
<div class="grid" id="g"></div>`);
await page.addScriptTag({ path: bundle });

const info = await page.evaluate(() => {
  const { geometriCincin, SUDUT_ARAH } = window.__landolt;
  const g = document.getElementById('g');
  const d = 120;
  const tebal = 24;
  const celah = 24;
  const out = [];
  for (const [arah, sudut] of Object.entries(SUDUT_ARAH)) {
    const geo = geometriCincin(d, tebal, celah, arah);
    const fig = document.createElement('figure');
    fig.innerHTML = `<svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">
      <circle cx="${d / 2}" cy="${d / 2}" r="${geo.r}" fill="none" stroke="#0f172a"
        stroke-width="${geo.tebal}" stroke-dasharray="${geo.dasharray}" stroke-dashoffset="${geo.dashoffset}"
        transform="rotate(${geo.rotasi} ${d / 2} ${d / 2})" />
    </svg><figcaption>${arah} · ${sudut}°</figcaption>`;
    g.appendChild(fig);
    out.push({ arah, sudut });
  }
  return out;
});
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log('cincin:', info.length, '→', OUT);
