/**
 * Probe sekali pakai: potret /arcade setelah re-skin 2026-11-10.
 *
 * Kenapa di `deliverables/`: `includePath()` indexer hanya mengallowlist
 * `src/`, `netlify/functions/`, `shared/`, `scripts/`, `e2e/`, dan root — jadi
 * berkas di sini tidak menggeser satu pun counter beku (R13f).
 *
 * Import playwright lewat URL absolut: probe di luar repo tidak bisa
 * me-resolve `'playwright'` sebagai bare specifier (R13n).
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:4321';
const OUT = 'F:/astro/deliverables/arcade-review';

const SESI = {
  role: 'kandidat',
  name: 'Budi',
  wa: '081234567890',
  sessionToken: 'probe-lokal',
  refreshToken: '',
  isLoggedIn: true,
  lastChecked: Date.now(),
};

const browser = await chromium.launch();

async function potret(nama, lebar, tinggi) {
  const ctx = await browser.newContext({
    viewport: { width: lebar, height: tinggi },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/arcade`, { waitUntil: 'networkidle' });
  await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), SESI);
  await page.reload({ waitUntil: 'networkidle' });

  await page.waitForSelector('button:has-text("Mulai Shift")', { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/_arcade-hub-${nama}.png`, fullPage: false });

  await page.click('button:has-text("Mulai Shift")');
  await page.waitForSelector('[data-testid="arcade-perintah"]', { timeout: 15000 });
  await page.waitForTimeout(700);

  /* Barang pertama diketuk supaya keadaan "terpilih" ikut terpotret — itu
     keadaan yang paling sering dilihat pemain, dan yang paling mudah salah
     warna di tema terang. */
  const barang = page.locator('.arc-crate').first();
  await barang.click();
  await page.waitForTimeout(250);

  await page.screenshot({ path: `${OUT}/_arcade-main-${nama}.png`, fullPage: false });

  const ukur = await page.evaluate(() => {
    const de = document.documentElement;
    const arena = document.querySelector('.arc');
    const jp = document.querySelector('.arc-order-jp');
    const skor = document.querySelector('.arc-skor');
    const kaca = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return { warna: s.color, latar: s.backgroundColor, ukuran: s.fontSize };
    };
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      arenaLebar: arena ? Math.round(arena.getBoundingClientRect().width) : null,
      arenaTinggi: arena ? Math.round(arena.getBoundingClientRect().height) : null,
      perintah: kaca(jp),
      skor: kaca(skor),
      jumlahRak: document.querySelectorAll('[data-zona]').length,
      jumlahPartikel: document.querySelectorAll('.arc-partikel').length,
      teksPerintah: document.querySelector('[data-testid="arcade-perintah"]')?.textContent?.trim(),
    };
  });
  console.log(nama, JSON.stringify(ukur, null, 1));
  await ctx.close();
}

await potret('390', 390, 844);
await potret('1280', 1280, 900);

await browser.close();
