/**
 * Ukur kontras teks di dalam arena, langsung dari piksel tata letak.
 *
 * Kenapa tidak menunggu `npm run e2e:contrast`: gerbang itu menuntut `dist/`
 * yang segar dan server proxy ke DB produksi. Untuk memutuskan apakah palet
 * baru lolos ambang, yang perlu diukur hanya pasangan warna yang benar-benar
 * dipakai — dan itu bisa dibaca dari computed style di halaman yang sama.
 *
 * Latar diambil dari leluhur PERTAMA yang opaknya > 0, karena `background:
 * transparent` pada <span> bukan latar yang dilihat mata.
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4321/arcade', { waitUntil: 'networkidle' });
await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), {
  role: 'kandidat', name: 'Budi', wa: '0812', sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('button:has-text("Mulai Shift")');
await page.waitForSelector('[data-testid="arcade-perintah"]');
await page.waitForTimeout(400);

const hasil = await page.evaluate(() => {
  const rgb = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
    return { r: +r, g: +g, b: +b, a: +a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const latar = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.9) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const ukur = (sel, nama) => {
    const el = document.querySelector(sel);
    if (!el) return { nama, ada: false };
    const fg = rgb(getComputedStyle(el).color);
    const bg = latar(el);
    const l1 = lum(fg);
    const l2 = lum(bg);
    const rasio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return { nama, ada: true, px: getComputedStyle(el).fontSize, rasio: Math.round(rasio * 100) / 100 };
  };
  return [
    ukur('.arc-skor', 'skor'),
    ukur('.arc-order-count', 'pesanan'),
    ukur('.arc-order-jp', 'perintah JP'),
    ukur('.arc-order-romaji', 'romaji'),
    ukur('.arc-hint', 'petunjuk'),
    ukur('.arc-kicker', 'kicker'),
    ukur('.arc-crate-jp', 'label peti'),
    ukur('.arc-shelf-jp', 'label rak JP'),
    ukur('.arc-shelf-id', 'label rak ID'),
    ukur('.arc-order-badge', 'badge gelombang'),
  ];
});

for (const r of hasil) console.log(r.ada ? `${String(r.rasio).padStart(6)}:1  ${r.px.padStart(6)}  ${r.nama}` : `   --      ${r.nama} TIDAK ADA`);
await browser.close();
