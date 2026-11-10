import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const OUT = 'F:/astro/deliverables/arcade-review';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4321/arcade', { waitUntil: 'networkidle' });
await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), {
  role: 'kandidat', name: 'Budi', wa: '0812', sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('button:has-text("Mulai Shift")');
await page.waitForSelector('[data-testid="arcade-perintah"]');
await page.waitForTimeout(400);

/* Petakan perintah → rak yang benar, lewat label Jepang di rak (sama seperti
   yang dilakukan `e2e/arcade.test.tsx`, bukan menebak). */
const rencana = await page.evaluate(() => {
  const teks = document.querySelector('[data-testid="arcade-perintah"]')?.textContent?.trim() ?? '';
  const zona = teks.match(/を (.+?) に おいてください$/)?.[1] ?? '';
  const rak = [...document.querySelectorAll('[data-zona]')];
  const benar = rak.find((b) => b.querySelector('.arc-shelf-jp')?.textContent?.trim() === zona);
  const salah = rak.find((b) => b !== benar);
  return { teks, zona, benar: benar?.getAttribute('data-zona'), salah: salah?.getAttribute('data-zona') };
});
console.log('rencana', JSON.stringify(rencana));

await page.locator('.arc-crate').first().click();
await page.waitForTimeout(150);

/* Salah dulu: rak yang salah → sorotan merah + getaran. */
await page.click(`[data-zona="${rencana.salah}"]`);
await page.waitForTimeout(90);
await page.screenshot({ path: `${OUT}/_arcade-salah-390.png` });

const keadaanSalah = await page.evaluate(() => {
  const salah = document.querySelector('.arc-shelf--wrong');
  const target = document.querySelector('[data-target="true"]');
  const akar = document.querySelector('.arc');
  return {
    rakSalah: !!salah,
    rakTarget: !!target,
    akarGetar: akar?.className,
    pesan: document.querySelector('[role="status"]')?.textContent?.trim(),
  };
});
console.log('salah', JSON.stringify(keadaanSalah));

/* Tunggu perintah berikutnya, lalu jawab BENAR dan potret ledakan. */
await page.waitForTimeout(1400);
await page.waitForSelector('[data-testid="arcade-perintah"]');
await page.locator('.arc-crate').first().click();
await page.waitForTimeout(150);
const benar = await page.evaluate(() => {
  const teks = document.querySelector('[data-testid="arcade-perintah"]')?.textContent?.trim() ?? '';
  const zona = teks.match(/を (.+?) に おいてください$/)?.[1] ?? '';
  const rak = [...document.querySelectorAll('[data-zona]')];
  return rak.find((b) => b.querySelector('.arc-shelf-jp')?.textContent?.trim() === zona)?.getAttribute('data-zona');
});
await page.click(`[data-zona="${benar}"]`);
await page.waitForTimeout(60);
await page.screenshot({ path: `${OUT}/_arcade-benar-390.png` });

const keadaanBenar = await page.evaluate(() => {
  const p = document.querySelector('.arc-partikel');
  const s = p ? getComputedStyle(p) : null;
  return {
    jumlah: document.querySelectorAll('.arc-partikel').length,
    lebar: s?.width,
    tinggi: s?.height,
    animasi: s?.animationName,
    durasi: s?.animationDuration,
    skor: document.querySelector('[data-testid="arcade-skor"]')?.textContent?.trim(),
  };
});
console.log('benar', JSON.stringify(keadaanBenar));

await browser.close();
