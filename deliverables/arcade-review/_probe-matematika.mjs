/**
 * Potret /matematika setelah re-skin 2026-11-10 (lobi + soal + hasil).
 * Sama seperti probe lain: di `deliverables/` supaya tidak menggeser counter
 * beku (R13f), playwright lewat URL absolut (R13n).
 *
 * ⚠ DI MESIN INI PROBE INI BERHENTI DI "Session expired". Halaman /matematika
 * memvalidasi sesi ke server (beda dengan /arcade yang hanya membaca store),
 * dan server lokal tidak punya kredensial DB. Jalankan di mesin yang punya sesi
 * siswa sungguhan. Tangkapan layar yang di-commit di berkas ini karena itu
 * dibuat dari MOCKUP statis (`_mat-*-mockup-*.png`), bukan dari halaman asli.
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const OUT = 'F:/astro/deliverables/arcade-review';
const browser = await chromium.launch();

async function potret(nama, lebar, tinggi) {
  const ctx = await browser.newContext({ viewport: { width: lebar, height: tinggi }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4321/matematika', { waitUntil: 'networkidle' });
  await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), {
    role: 'kandidat', name: 'Budi', wa: '0812', sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
  });
  await page.reload({ waitUntil: 'networkidle' });

  const ada = await page
    .waitForSelector('button:has-text("Mulai tes")', { timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  if (!ada) {
    console.log('LOBI TIDAK MUNCUL', nama);
    await page.screenshot({ path: `${OUT}/_mat-gagal-${nama}.png` });
    await ctx.close();
    return;
  }

  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/_mat-lobi-${nama}.png` });

  await page.click('button:has-text("Mulai tes")');
  await page.waitForSelector('[data-opsi]', { timeout: 12000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/_mat-soal-${nama}.png` });

  const ukur = await page.evaluate(() => {
    const de = document.documentElement;
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      arenaLebar: Math.round(document.querySelector('.arc')?.getBoundingClientRect().width ?? 0),
      opsi: document.querySelectorAll('[data-opsi]').length,
      kelasOpsi: document.querySelector('[data-opsi]')?.className,
      soal: document.querySelector('.arc-soal')?.textContent?.slice(0, 40),
    };
  });
  console.log(nama, JSON.stringify(ukur));
  await ctx.close();
}

await potret('390', 390, 844);
await potret('1280', 1280, 900);
await browser.close();
