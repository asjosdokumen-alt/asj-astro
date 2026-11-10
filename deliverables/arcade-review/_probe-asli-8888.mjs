/**
 * Potret /kotoba dan /matematika di server lokal BERISI ENV (:8888), bukan mockup.
 *
 * Kenapa bisa: `netlify dev` memuat `.env.local`, termasuk `SESSION_SECRET`, jadi
 * token sesi yang ditandatangani di sini diverifikasi oleh fungsi yang sama.
 * Token hanya hidup di memori proses ini dan tidak pernah ditulis ke disk.
 *
 * Kalau gerbangnya menolak, probe BERHENTI dan menyimpan potret kegagalan —
 * bukan diam-diam memotret layar kosong.
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const OUT = 'F:/astro/deliverables/arcade-review';
const BASE = 'http://localhost:8888';

const env = readFileSync('F:/astro/.env.local', 'utf8');
const secret = (env.match(/^SESSION_SECRET=(.+)$/m)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
if (!secret) throw new Error('SESSION_SECRET tidak ditemukan di .env.local');

const now = Math.floor(Date.now() / 1000);
const body = Buffer.from(
  JSON.stringify({ role: 'admin', wa: '', name: 'probe-lokal', kind: 'access', iat: now, exp: now + 3600 }),
).toString('base64url');
const token = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;

const SESI = {
  role: 'admin', name: 'probe-lokal', wa: '', sessionToken: token, refreshToken: '',
  isLoggedIn: true, lastChecked: Date.now(),
};

const browser = await chromium.launch();

async function buka(jalur, siap, nama, aksi) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const galat = [];
  page.on('console', (m) => {
    if (m.type() === 'error') galat.push(m.text().slice(0, 140));
  });
  page.on('response', (r) => {
    if (r.status() >= 400 || r.url().includes('/.netlify/functions/')) {
      galat.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`);
    }
  });
  await page.goto(`${BASE}${jalur}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), SESI);
  await page.reload({ waitUntil: 'networkidle' });

  const ok = await page
    .waitForSelector(siap, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  if (!ok) {
    console.log(`${nama}: GAGAL menunggu ${siap}`);
    console.log('  galat:', galat.slice(0, 3));
    await page.screenshot({ path: `${OUT}/_gagal-${nama}.png`, fullPage: true });
    await ctx.close();
    return false;
  }

  await page.waitForTimeout(500);
  if (aksi) await aksi(page);
  /* Potret VIEWPORT, bukan fullPage: elemen sticky (toolbar) digambar di posisi
     gulirnya pada tangkapan fullPage, sehingga terlihat menimpa arena di tengah
     halaman — artefak alat potret, bukan cacat halaman. */
  await page.evaluate(() => document.querySelector('.arc')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/_asli-${nama}.png` });

  const m = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    arcW: Math.round(document.querySelector('.arc')?.getBoundingClientRect().width ?? 0),
    soal: document.querySelector('[data-testid="kotoba-soal"]')?.textContent?.trim(),
  }));
  console.log(`${nama}: OK`, JSON.stringify(m));
  await ctx.close();
  return true;
}

/* `?wa=` WAJIB: komponen tidak memanggil bank bila WA kosong (penjaga di
   dalamnya). Nilainya tidak dipakai server — token admin lolos `requireAdmin`
   sebelum `statusVip(wa)` diperiksa. */
await buka('/kotoba?wa=081234567890', '[data-testid="kotoba-soal"]', 'kotoba', async (page) => {
  const opsi = page.locator('[data-opsi]').first();
  if (await opsi.count()) {
    await opsi.click();
    await page.waitForTimeout(500);
  }
});

await buka('/matematika', 'button:has-text("Mulai tes")', 'matematika-lobi', async (page) => {
  await page.click('button:has-text("Mulai tes")');
  await page.waitForSelector('[data-opsi]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
});

await browser.close();
