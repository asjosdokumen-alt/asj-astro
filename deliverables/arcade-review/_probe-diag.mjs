import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4321/arcade', { waitUntil: 'networkidle' });
await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), {
  role: 'kandidat', name: 'Budi', wa: '0812', sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('button:has-text("Mulai Shift")');
await page.waitForSelector('[data-testid="arcade-perintah"]');
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const arena = document.querySelector('.arc');
  const r = arena.getBoundingClientRect();
  const titik = { x: r.left + r.width * 0.7, y: r.top + 120 };
  const diAtas = document.elementsFromPoint(titik.x, titik.y).slice(0, 6).map((el) => {
    const s = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 60),
      id: el.id || '',
      pos: s.position,
      z: s.zIndex,
    };
  });
  const badge = document.querySelector('.arc-order-badge');
  const bs = badge ? getComputedStyle(badge) : null;
  const ar = arena.getBoundingClientRect();
  const s = getComputedStyle(arena);
  return {
    titik,
    diAtas,
    arena: { pos: s.position, z: s.zIndex, w: Math.round(ar.width) },
    badge: bs ? { display: bs.display, ws: bs.whiteSpace, w: Math.round(badge.getBoundingClientRect().width) } : null,
    badgeTeks: badge?.textContent,
    sakura: (() => {
      const el = document.getElementById('sakura-particles');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { display: cs.display, pos: cs.position, z: cs.zIndex, children: el.children.length };
    })(),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
