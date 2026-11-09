/**
 * probe-title-width.mjs — berapa lebar TEKS judul hero pada tiap ukuran huruf?
 *
 * KENAPA ADA
 * ----------
 * Komentar di `ApplyFullForm.tsx` mengklaim "pada 22px ia butuh ~278px dan tetap
 * SATU baris". Diukur 2026-11-09 di 390px, judulnya JADI DUA BARIS (h=66px) dan
 * baris kedua tertutup kartu. Klaim itu salah, dan cara membuktikannya bukan
 * menebak dari jumlah karakter: ukur lebar teks yang sebenarnya.
 *
 * Probe ini memasang `white-space: nowrap` sementara pada judul, mengukur
 * `getBoundingClientRect().width`, lalu mengembalikannya. Hasilnya dipakai untuk
 * memilih ukuran huruf yang benar-benar muat — bukan yang diperkirakan muat.
 *
 * Pakai:
 *   BASE_URL=http://localhost:4400 node deliverables/probe-title-width.mjs
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTE = `/${(process.env.ROUTE || 'apply').replace(/^\/+/, '')}`;
const WIDTHS = (process.env.WIDTHS || '320,360,390,414').split(',').map(Number);
const SIZES = (process.env.SIZES || '18,19,20,21,22').split(',').map(Number);

const browser = await chromium.launch();

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  const out = await page.evaluate((sizes) => {
    const band = document.querySelector('.artwork-band');
    const title = band?.querySelector('[data-lang="header.company_name"]');
    if (!band || !title) return null;
    const wrap = title.parentElement;
    const avail = Math.round(wrap.getBoundingClientRect().width) - 0;
    const prevWhite = title.style.whiteSpace;
    title.style.whiteSpace = 'nowrap';
    // Range, BUKAN getBoundingClientRect pada div-nya: div itu `w-full`, jadi
    // lebarnya selalu selebar kotak dan tidak memberi tahu lebar TEKS. Kesalahan
    // itu sempat membuat probe ini melaporkan "22px sudah satu baris" untuk
    // semua ukuran huruf.
    const range = document.createRange();
    range.selectNodeContents(title);
    const rows = sizes.map((px) => {
      title.style.fontSize = `${px}px`;
      return { px, textWidth: Math.round(range.getBoundingClientRect().width) };
    });
    title.style.whiteSpace = prevWhite;
    title.style.fontSize = '';
    // Lebar kotak yang tersedia untuk teks = konten wrap (parent punya px-5).
    const cs = getComputedStyle(wrap);
    const inner =
      Math.round(wrap.getBoundingClientRect().width) -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight);
    return { avail: inner, wrapWidth: avail, rows };
  }, SIZES);

  if (!out) {
    console.log(`${width}px  JUDUL TIDAK ADA`);
  } else {
    const fits = out.rows.filter((r) => r.textWidth <= out.avail);
    console.log(
      `${String(width).padStart(4)}px  kotak teks ${out.avail}px  →  ` +
        out.rows.map((r) => `${r.px}px:${r.textWidth}`).join('  ') +
        `   | satu baris tercapai pada: ${fits.length ? `${Math.max(...fits.map((f) => f.px))}px` : 'TIDAK ADA'}`,
    );
  }
  await ctx.close();
}

await browser.close();
