/**
 * test-reveal-early.mjs — GATE: konten `[data-reveal]` tidak boleh KOSONG
 * selama menunggu `window.load`.
 *
 * KENAPA GERBANG INI ADA
 * ----------------------
 * Skrip inline di <head> (`BaseLayout.astro`) menambahkan `html.js-reveal`
 * SEKETIKA, dan `motion.css` §9 menyetel `opacity: 0` untuk setiap
 * `[data-reveal]:not(.is-revealed)`. Yang membatalkan keadaan itu adalah
 * `pass()` — pemasang IntersectionObserver.
 *
 * Sampai 2026-10-14 `pass()` HANYA dipanggil dari `window.load`, yang menunggu
 * SELURUH subresource. Jadi selama satu aset lambat, seluruh halaman di bawah
 * fold ber-`opacity: 0` TANPA observer yang bisa membatalkannya: pengunjung
 * yang menggulir melihat bagian yang BENAR-BENAR KOSONG.
 *
 * Diukur dengan menunda SATU permintaan gambar (`page.route`, 1280px):
 *
 *   tunda  load       gulir pada  elemen reveal di layar
 *     0ms  353ms      804ms       0 dari 3 tersembunyi
 *  6000ms  TIDAK     814ms       3 dari 3 TERSEMBUNYI   ← halaman kosong
 *
 * YANG DIUJI: sesudah menggulir ke elemen reveal pertama, elemen reveal yang
 * ADA DI LAYAR tidak boleh tersembunyi — dengan `load` sengaja DITAHAN.
 *
 * USAGE  BASE_URL=http://127.0.0.1:4321 node e2e/test-reveal-early.mjs
 * EXIT   0 lulus · 1 regresi · 2 masalah alat
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321/';
const DELAY_MS = Number(process.env.REVEAL_DELAY_MS || 6000);

const browser = await chromium.launch();
const failures = [];
let toolingError = null;

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(40000);

  let delayed = 0;
  await page.route('**/*.{avif,webp,png,jpg,jpeg,svg}', async (route) => {
    delayed++;
    await new Promise((r) => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  let loadFired = false;
  page.on('load', () => {
    loadFired = true;
  });

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelectorAll('[data-reveal]').length > 0, null, {
    timeout: 15000,
  });

  // Gulir SELAGI `load` masih tertahan — inilah jendela yang diperebutkan.
  const wait = 800 - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.evaluate(() => {
    const el = document.querySelector('[data-reveal]');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await page.waitForTimeout(500);

  const res = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-reveal], [data-enter]')];
    const inView = els.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    });
    // ⚠️ YANG DIUJI ADALAH PENANDA, BUKAN OPACITY SAAT INI.
    // Versi pertama gerbang ini menuntut `opacity >= 0.99` dan MEMERAHKAN build
    // yang sudah benar: reveal-nya ber-`animation-delay` berjenjang (sampai
    // 8 × 60ms) plus durasi, jadi elemen yang baru saja masuk layar memang
    // masih 0,9x. Itu animasi yang sedang berjalan, bukan konten yang hilang.
    // Keadaan yang berbahaya adalah elemen TANPA penanda: tidak ada animasi
    // yang akan menjalankannya, jadi opacity-nya tinggal 0 selamanya.
    return {
      total: els.length,
      inView: inView.length,
      unmarked: inView.filter(
        (el) => !el.classList.contains('is-revealed') && !el.classList.contains('is-entered'),
      ).length,
      minOpacity: inView.length
        ? Math.min(...inView.map((el) => Number(getComputedStyle(el).opacity)))
        : null,
    };
  });

  console.log(
    `load ditahan: requestsDelayed=${delayed} (${DELAY_MS}ms) · loadFired=${loadFired} · ` +
      `elemen reveal=${res.total} · di layar=${res.inView} · TANPA penanda=${res.unmarked} · ` +
      `opacity terendah=${res.minOpacity}`,
  );

  if (res.total === 0) {
    toolingError = 'tidak ada elemen [data-reveal] di halaman — gerbang ini tidak mengukur apa pun';
  } else if (res.inView === 0) {
    toolingError = 'tidak ada elemen reveal yang masuk layar setelah digulir — pengukuran tidak sah';
  } else if (res.unmarked > 0) {
    failures.push(
      `${res.unmarked} dari ${res.inView} elemen reveal yang ada di layar TIDAK punya penanda ` +
        `(is-revealed/is-entered) saat load ditahan ${DELAY_MS}ms — tidak ada animasi yang akan ` +
        `menjalankannya, jadi pengunjung melihat bagian KOSONG`,
    );
  }
} catch (e) {
  toolingError = e instanceof Error ? e.message : String(e);
} finally {
  await browser.close();
}

if (toolingError) {
  console.error(`REVEAL-EARLY — TOOLING ERROR: ${toolingError}`);
  process.exit(2);
}
if (failures.length) {
  console.error('REVEAL-EARLY FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('REVEAL-EARLY PASSED — konten terlihat walau `load` ditahan.');
process.exit(0);
