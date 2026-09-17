/**
 * verify-stage1.mjs — bukti visual Stage 1 (perbaikan teks dashboard kandidat).
 *
 * Bukan gate CI: skrip ini hanya mengambil dua tangkapan layar + mencetak teks
 * header yang benar-benar dirender, supaya klaim "sudah diganti" bisa dilihat,
 * bukan dipercaya. Dijalankan manual:
 *   BASE_URL=http://localhost:4322 node e2e/verify-stage1.mjs
 *
 * Catatan sandbox: WAJIB --no-proxy-server, karena lingkungan ini mengekspor
 * HTTP_PROXY sehingga navigasi browser ikut lewat proxy dan gagal.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = 'test-results';

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
          value: JSON.stringify({
            role: 'kandidat', name: 'Budi Santoso', wa: '081234567890',
            sessionToken: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoia2FuZGlkYXQiLCJ3YSI6IjA4MTIzNDU2Nzg5MCIsImV4cCI6NDEwMjQ0NDgwMH0.fake',
            refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
          }),
        }],
      }],
    },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));

  await page.goto(`${BASE}/candidate`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Teks header (h2) apa adanya.
  const h2 = await page.locator('h2').first().textContent().catch(() => null);
  console.log('H2 header     :', JSON.stringify(h2));

  // Semua heading berurutan pada halaman ini.
  const headings = await page.$$eval('h1,h2,h3,h4,h5,h6', (els) =>
    els.map((e) => `${e.tagName}: ${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)}`),
  );
  console.log('Heading outline:');
  for (const h of headings) console.log(`   ${h}`);

  // Kalimat lama yang seharusnya sudah tidak ada.
  const body = await page.locator('body').innerText();
  for (const bad of ['Belum Lamar (Umum)', 'Lamaran Lulus']) {
    console.log(`Sisa "${bad}" :`, body.includes(bad) ? 'MASIH ADA ❌' : 'hilang ✅');
  }

  await page.screenshot({ path: `${OUT}/stage1-candidate-390.png`, fullPage: true });
  console.log('screenshot    :', `${OUT}/stage1-candidate-390.png`);
  console.log('pageerrors    :', errors.length ? errors : 'none');
} finally {
  await browser.close();
}
