/**
 * probe-fold.mjs — apa yang benar-benar terlihat di layar pertama?
 *
 * KENAPA ADA
 * ----------
 * Pertanyaan "konten ini perlu atau tidak" tidak bisa dijawab dari jumlah kata.
 * Yang bisa diukur: pada 390x844, kontrol pertama (field/select/tombol aksi) ada
 * di y berapa — dan berapa banyak teks pengantar yang harus dilewati pengguna
 * sebelum bisa MULAI mengisi.
 *
 * Dipakai 2026-11-10 untuk /apply: blok pengantar (h1 + paragraf + 4 langkah)
 * memakan seluruh layar pertama, sehingga tidak ada satu pun field yang terlihat
 * tanpa menggulir.
 *
 * Pakai:
 *   BASE_URL=http://localhost:4400 ROUTES=apply node deliverables/probe-fold.mjs
 */
import { chromium } from '../node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTES = (process.env.ROUTES || 'apply')
  .split(',')
  .map((r) => `/${r.trim().replace(/^[A-Za-z]:[\\/].*?[\\/]astro[\\/]/, '/').replace(/^\/+/, '')}`);

const browser = await chromium.launch();
for (const route of ROUTES) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const vh = innerHeight;
    const describe = (el) => {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${t}"`;
    };
    const controls = [...document.querySelectorAll('main input:not([type=hidden]), main select, main textarea, main button')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.height > 0 && r.width > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map(({ el, r }) => ({ label: describe(el), top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }));

    const first = controls[0] || null;
    return {
      vh,
      docHeight: document.documentElement.scrollHeight,
      first,
      aboveFold: controls.filter((c) => c.top < vh).length,
      totalControls: controls.length,
      firstFive: controls.slice(0, 5),
    };
  });

  console.log(`\n${route}  (390x844)`);
  console.log(`  tinggi dokumen ${info.docHeight}px · ${info.totalControls} kontrol · ${info.aboveFold} terlihat di layar pertama`);
  if (info.first) {
    console.log(
      `  kontrol PERTAMA: ${info.first.label}\n    y=${info.first.top}  ${info.first.top < info.vh ? 'TERLIHAT' : `DI BAWAH FOLD (${info.first.top - info.vh}px)`}`,
    );
  }
  for (const c of info.firstFive) console.log(`    y=${String(c.top).padStart(5)}  ${c.label}`);

  await ctx.close();
}
await browser.close();
