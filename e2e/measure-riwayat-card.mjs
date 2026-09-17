/**
 * measure-riwayat-card.mjs — membuktikan kartu riwayat kolaps karena
 * `content-visibility: auto` + `contain-intrinsic-size: 160px`.
 *
 * Hipotesis: kartu riwayat lamaran dirender dengan tinggi terkunci ~160px
 * walaupun isinya (judul + badge + pipeline 10 langkah) butuh ~250px, sehingga
 * yang terlihat adalah kotak hitam kosong.
 *
 * Jalankan: BASE_URL=http://localhost:4322 node e2e/measure-riwayat-card.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: {
      cookies: [],
      origins: [{
        origin: BASE,
        localStorage: [{
          name: 'asj_auth',
          value: JSON.stringify({ role: 'kandidat', name: 'Budi', wa: '081234567890',
            sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now() }),
        }],
      }],
    },
  });
  const page = await ctx.newPage();
  await page.route('**/.netlify/functions/**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        candidates: [{ nama: 'Budi', idLoker: 'TG591ASJ', tahapan: 'PEMBERKASAN',
          status: 'LULUS', idKandidat: 'ASJ-001', catatanInt: '[VIP]', berkas: {}, bio: {} }],
        kandidatRiwayat: [{ code: 'TG591ASJ', status: 'LULUS', tahapan: 'PEMBERKASAN',
          timestamp: '2026-09-10T08:00:00Z', kategori: 'NOUGYOU SAYURAN' }],
        mySchedules: [],
      }),
    });
  });
  await page.goto(`${BASE}/candidate`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const card = document.querySelector('.u-cv-auto--card');
    if (!card) return { found: false };
    const cs = getComputedStyle(card);
    const r = card.getBoundingClientRect();
    // Tinggi yang dibutuhkan isinya, tanpa batas.
    const prevCv = cs.contentVisibility;
    card.style.contentVisibility = 'visible';
    const fullH = card.getBoundingClientRect().height;
    card.style.contentVisibility = prevCv;
    return {
      found: true,
      contentVisibility: cs.contentVisibility,
      containIntrinsicSize: cs.containIntrinsicSize,
      lockedHeight: Math.round(r.height),
      naturalHeight: Math.round(fullH),
      childCount: card.children.length,
      innerTextLen: (card.innerText || '').trim().length,
    };
  });

  console.log('== kartu riwayat (u-cv-auto--card) ==');
  if (!info.found) {
    console.log('   TIDAK DITEMUKAN — riwayat tidak ter-render sama sekali');
  } else {
    console.log('   content-visibility      :', info.contentVisibility);
    console.log('   contain-intrinsic-size  :', info.containIntrinsicSize);
    console.log('   tinggi terkunci         :', `${info.lockedHeight}px`);
    console.log('   tinggi natural          :', `${info.naturalHeight}px`);
    console.log('   jumlah anak elemen      :', info.childCount);
    console.log('   panjang teks di dalam   :', info.innerTextLen);
    console.log('');
    console.log(info.lockedHeight < info.naturalHeight
      ? `   >>> TERBUKTI: ${info.lockedHeight}px < ${info.naturalHeight}px — isi terpotong ${info.naturalHeight - info.lockedHeight}px`
      : '   >>> tinggi terkunci >= natural — hipotesis TIDAK terbukti');
  }

  await page.screenshot({ path: 'test-results/riwayat-card-390.png', fullPage: true });
  console.log('\nscreenshot: test-results/riwayat-card-390.png');
} finally {
  await browser.close();
}
