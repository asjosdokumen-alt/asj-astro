/**
 * Potret /kotoba setelah pemilih tingkat (2026-11-10).
 *
 * Halaman ini bergerbang siswa DAN mengambil bank kata dari server, jadi probe
 * ini menyuntikkan sesi kandidat lalu menunggu soal pertama benar-benar muncul.
 * Kalau bank tidak datang (server lokal tidak punya kredensial DB), probe
 * berhenti dengan pesan jelas alih-alih memotret layar kosong.
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const OUT = 'F:/astro/deliverables/arcade-review';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const galat = [];
page.on('console', (m) => {
  if (m.type() === 'error') galat.push(m.text().slice(0, 120));
});

await page.goto('http://127.0.0.1:4321/kotoba', { waitUntil: 'networkidle' });
await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), {
  role: 'kandidat', name: 'Budi', wa: '0812', sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
});
await page.reload({ waitUntil: 'networkidle' });

const adaSoal = await page
  .waitForSelector('[data-testid="kotoba-soal"]', { timeout: 12000 })
  .then(() => true)
  .catch(() => false);

if (!adaSoal) {
  console.log('TIDAK ADA SOAL — bank tidak datang. Galat:', galat.slice(0, 3));
  await page.screenshot({ path: `${OUT}/_kotoba-gagal.png` });
  await browser.close();
  process.exit(0);
}

await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/_kotoba-normal-390.png` });

const santai = page.locator('button', { hasText: 'Santai' }).first();
await santai.click();
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/_kotoba-santai-390.png` });

const ukur = await page.evaluate(() => {
  const bar = document.querySelectorAll('[role="progressbar"]');
  const tk = [...document.querySelectorAll('button')].filter((b) => ['Santai', 'Normal', 'Ketat'].includes((b.textContent || '').trim()));
  return {
    tombolTingkat: tk.map((b) => `${b.textContent.trim()}:${b.getAttribute('aria-pressed')}`),
    progressbar: bar.length,
    soal: document.querySelector('[data-testid="kotoba-soal"]')?.textContent?.trim(),
  };
});
console.log(JSON.stringify(ukur));
await browser.close();
