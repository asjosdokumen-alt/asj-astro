/**
 * Probe sekali pakai — 2026-11-11.
 *
 * Kenapa ada: plate 04 di band `#alur` diganti dari `04-dokumen` (booklet coklat
 * kosong) ke `04-paspor`. Gate tidak bisa menilai "apakah sampulnya terbaca
 * sebagai paspor RI", jadi satu-satunya bukti adalah piksel pada posisi scroll
 * yang tepat. Probe ini memarkir band di babak 04 (desktop 1440x900) dan di
 * kartu 04 (ponsel 390, tata letak bertumpuk), lalu menyimpan tangkapan layar.
 *
 * Jalankan: node deliverables/alur-loop/probe-paspor.mjs
 * Keluaran: deliverables/alur-loop/gen/paspor-*.png
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { ensureServer, stopServer } from '../../e2e/lib/server.mjs';

const OUT = 'deliverables/alur-loop/gen';
mkdirSync(OUT, { recursive: true });

const BASE = await ensureServer();
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });

try {
  // ── desktop: park the band on chapter 04 (index 3 of 7)
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(600);
    const box = await page.evaluate(() => {
      const track = document.querySelector('[data-film-track]');
      const r = track.getBoundingClientRect();
      return { top: r.top + window.scrollY, h: track.offsetHeight };
    });
    const span = box.h - 900;
    // p = 3.5/7 → tengah babak keempat
    await page.evaluate((y) => window.scrollTo(0, y), box.top + 0.5 * span);
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => {
      const on = document.querySelector('[data-film-ch].is-on');
      const img = on?.querySelector('.film-plate img');
      return {
        coord: document.querySelector('[data-film-coord]')?.textContent,
        src: img?.currentSrc || img?.src,
        complete: img?.complete,
        natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null,
      };
    });
    console.log('desktop babak aktif:', JSON.stringify(state));
    await page.screenshot({ path: `${OUT}/paspor-desktop-1440.png` });
    await page.close();
  }

  // ── ponsel: kartu 04 di tata letak bertumpuk
  {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(600);
    const card = await page.evaluate(() => {
      const chs = [...document.querySelectorAll('[data-film-ch]')];
      const el = chs[3];
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, h: r.height };
    });
    await page.evaluate((y) => window.scrollTo(0, y), card.top - 40);
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const chs = [...document.querySelectorAll('[data-film-ch]')];
      const img = chs[3]?.querySelector('.film-plate img');
      return { src: img?.currentSrc || img?.src, natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null };
    });
    console.log('ponsel kartu 04:', JSON.stringify(state));
    await page.screenshot({ path: `${OUT}/paspor-ponsel-390.png` });
    await page.close();
  }
} finally {
  await browser.close();
  await stopServer();
}
