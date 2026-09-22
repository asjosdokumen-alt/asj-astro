/**
 * measure-bottomnav-clearance.mjs — apakah konten halaman tertutup BottomNav?
 *
 * KOREKSI PENTING: versi pertama skrip ini salah. Ia memilih "elemen
 * interaktif terakhir di SELURUH halaman" sebagai pembanding — dan itu adalah
 * tombol "Keluar" milik BottomNav sendiri, yang memang berada DI DALAM nav.
 * Jadi skrip melaporkan `blocked: true` bahkan sesudah perbaikan diterapkan,
 * karena ia membandingkan nav dengan dirinya sendiri.
 *
 * Ukuran yang benar: elemen terakhir DI DALAM <main> (konten halaman), bukan
 * seluruh dokumen. Itulah yang bisa tertutup nav.
 *
 * Yang harus terlihat SESUDAH perbaikan:
 *   mainPaddingBottom > 0
 *   overlapKonten = 0  (konten berhenti sebelum nav)
 *
 * Jalankan: BASE_URL=http://localhost:4323 node e2e/measure-bottomnav-clearance.mjs
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
  await page.waitForTimeout(1200);

  // Gulir sampai paling bawah supaya konten terakhir berada di posisi final.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const nav = document.querySelector('#bottom-nav-kandidat');
    const main = document.querySelector('#main-content');
    if (!nav) return { error: 'BottomNav tidak ditemukan' };
    if (!main) return { error: '#main-content tidak ditemukan' };

    const navBox = nav.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    const mainCs = getComputedStyle(main);

    // Konten = keturunan TERAKHIR yang terlihat DI DALAM <main>. Ini kandidat
    // sebenarnya untuk "tertutup nav"; elemen nav sendiri tidak dihitung.
    const inMain = [...main.querySelectorAll('a[href], button, [role="button"]')]
      .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
    const last = inMain[inMain.length - 1];
    const lastBox = last ? last.getBoundingClientRect() : null;

    // Berapa px konten terakhir masuk ke area nav?
    const overlap = lastBox
      ? Math.max(0, Math.min(lastBox.bottom, navBox.bottom) - Math.max(lastBox.top, navBox.top))
      : 0;

    return {
      navHeight: Math.round(navBox.height),
      navTop: Math.round(navBox.top),
      navPosition: cs.position,
      mainPaddingBottom: mainCs.paddingBottom,
      contentControls: inMain.length,
      lastControl: last ? (last.getAttribute('aria-label') || last.textContent.trim().slice(0, 30) || last.tagName) : null,
      lastControlBottom: lastBox ? Math.round(lastBox.bottom) : null,
      navTopRounded: Math.round(navBox.top),
      overlapPx: Math.round(overlap),
      // Konten aman bila ia berakhir DI ATAS garis atas nav.
      contentClear: lastBox ? lastBox.bottom <= navBox.top + 0.5 : true,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });

  console.log(JSON.stringify(r, null, 2));
  if (r.error) {
    console.log('TIDAK BISA DIUKUR:', r.error);
  } else if (r.contentClear) {
    console.log(`\nOK: konten terakhir ("${r.lastControl}") berakhir di ${r.lastControlBottom}px,`);
    console.log(`    di atas garis nav (${r.navTopRounded}px). padding-bottom main = ${r.mainPaddingBottom}.`);
  } else {
    console.log(`\nDEFECT: konten terakhir ("${r.lastControl}") tertutup ${r.overlapPx}px oleh BottomNav.`);
  }
} finally {
  await browser.close();
}
