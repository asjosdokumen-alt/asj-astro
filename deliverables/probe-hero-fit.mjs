/**
 * probe-hero-fit.mjs — apakah judul di band hero MASIH tertutup kartu?
 *
 * KENAPA ADA
 * ----------
 * Komentar di `ApplyFullForm.tsx` mencatat bahwa judul dua baris dulu tertutup
 * kartu (`mt-[-40px]`) dan sudah diperbaiki dengan mengecilkan ukuran huruf di
 * ponsel. Tangkapan layar 390px pada 2026-11-09 menunjukkan "JAPAN" masih
 * terpotong di tepi kartu — dan tangkapan layar bisa menipu (bayangan, gradient,
 * tepi yang kebetulan berdekatan). Ini pertanyaan PERSEGI PANJANG: bandingkan
 * rect judul dengan rect kartu, pada beberapa lebar.
 *
 * Pakai:
 *   BASE_URL=http://localhost:4400 node deliverables/probe-hero-fit.mjs
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTE = `/${(process.env.ROUTE || 'apply').replace(/^\/+/, '')}`;
const WIDTHS = (process.env.WIDTHS || '320,360,390,414,768,1280').split(',').map(Number);

const browser = await chromium.launch();

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: width < 768,
    hasTouch: width < 768,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const band = document.querySelector('.artwork-band');
    if (!band) return null;
    // Judul = elemen ber-`data-lang="header.company_name"` (span/div) di dalam band.
    const title = band.querySelector('[data-lang="header.company_name"]');
    const eyebrow = band.querySelector('[data-lang="header.tagline"]');
    // Kartu = elemen ber-`mt-[-40px]`, yaitu yang menutupi tepi bawah band.
    // BUKAN `band.nextElementSibling`: sejak 2026-11-10 band pindah ke HTML
    // statis dan kartunya ada di island berikutnya, bukan di saudara langsung.
    const card = document.querySelector('[class*="mt-[-40px]"]');
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
    };
    const b = rect(band);
    return {
      band: b,
      bandScrollH: band.scrollHeight,
      eyebrow: rect(eyebrow),
      title: rect(title),
      titleText: title ? (title.textContent || '').trim() : '(tidak ada)',
      card: rect(card),
      cardClass: card ? String(card.className).slice(0, 70) : '(tidak ada)',
      // overflow:hidden pada band berarti apa pun di luar `bottom` TIDAK terlihat.
      titleClippedByBand: title ? rect(title).bottom > b.bottom : null,
      titleUnderCard: title && card ? rect(title).bottom > rect(card).top : null,
    };
  });

  if (!info) {
    console.log(`${width}px  BAND TIDAK ADA`);
  } else {
    console.log(
      `${String(width).padStart(4)}px  band ${info.band.top}..${info.band.bottom} (h=${info.band.h}, scrollH=${info.bandScrollH})\n` +
        `        eyebrow ${JSON.stringify(info.eyebrow)}\n` +
        `        title   ${JSON.stringify(info.title)}  "${info.titleText}"\n` +
        `        card    ${JSON.stringify(info.card)}  ${info.cardClass}\n` +
        `        -> judul lewat bawah band : ${info.titleClippedByBand}\n` +
        `        -> judul di bawah kartu   : ${info.titleUnderCard}`,
    );
  }
  await ctx.close();
}

await browser.close();
