/**
 * measure-bottomnav-tap.mjs — membuktikan tombol "Keluar" di BottomNav
 * TIDAK BISA DITEKAN pada sebagian area karena tertutup elemen lain.
 *
 * Metode: `document.elementFromPoint()` pada titik tengah tombol. Kalau yang
 * kembali bukan tombol itu (atau keturunannya), maka tap-nya dibajak.
 *
 * Jalankan: BASE_URL=http://localhost:4323 node e2e/measure-bottomnav-tap.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4323';

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
  await page.goto(`${BASE}/candidate`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);

  // Bisakah tombol Keluar diklik seperti manusia mengetuknya?
  const logout = page.locator('#bottom-nav-kandidat button[aria-label]').last();
  let clickOk = false, err = null;
  try {
    await logout.click({ timeout: 2500 });
    clickOk = true;
  } catch (e) { err = String(e).split('\n')[0]; }

  const probe = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#bottom-nav-kandidat a, #bottom-nav-kandidat button')];
    return btns.map((b) => {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const owned = hit && (b === hit || b.contains(hit));
      return {
        label: b.getAttribute('aria-label') || b.tagName,
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        hitTag: hit ? `${hit.tagName}${hit.className ? `.${String(hit.className).split(' ')[0]}` : ''}` : null,
        owned,
      };
    });
  });

  console.log(JSON.stringify({ clickOk, err, probe }, null, 2));
  const stolen = probe.filter((p) => !p.owned);
  if (stolen.length) {
    console.log(`\nDEFECT: ${stolen.length} tombol nav dibajak elemen lain:`);
    for (const s of stolen) console.log(`  - ${s.label} → hit-test mengembalikan ${s.hitTag}`);
  } else {
    console.log('\nOK: semua tombol nav menerima hit-test-nya sendiri.');
  }
  console.log(`\nKlik tombol Keluar: ${clickOk ? 'BERHASIL' : `GAGAL — ${err}`}`);
} finally {
  await browser.close();
}
