/**
 * probe-intro-cost.mjs — berapa piksel layar pertama yang dimakan tiap blok?
 *
 * KENAPA ADA
 * ----------
 * "Blok pengantar ini perlu atau tidak" adalah pertanyaan produk, tetapi
 * BIAYANYA bisa diukur: sembunyikan satu blok, baca ulang posisi kontrol
 * pertama. Selisihnya adalah harga blok itu dalam piksel layar pertama — bukan
 * perkiraan dari jumlah kata.
 *
 * Pakai:
 *   BASE_URL=http://localhost:4400 ROUTE=apply node deliverables/probe-intro-cost.mjs
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTE = `/${(process.env.ROUTE || 'apply').replace(/^\/+/, '')}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const result = await page.evaluate(() => {
  const firstControlTop = () => {
    const el = document.querySelector('main input:not([type=hidden])');
    return el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
  };
  const intro = document.querySelector('main section');
  const blocks = intro
    ? [...intro.children].map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
        h: Math.round(el.getBoundingClientRect().height),
      }))
    : [];
  const base = firstControlTop();
  const vh = innerHeight;

  // Harga tiap blok: sembunyikan, ukur, kembalikan.
  const costs = [];
  if (intro) {
    for (const el of [...intro.children]) {
      const prev = el.style.display;
      el.style.display = 'none';
      costs.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34),
        saves: base - firstControlTop(),
      });
      el.style.display = prev;
    }
  }
  // Harga seluruh blok pengantar.
  let wholeIntroSaves = null;
  if (intro) {
    const prev = intro.style.display;
    intro.style.display = 'none';
    wholeIntroSaves = base - firstControlTop();
    intro.style.display = prev;
  }

  return { vh, base, blocks, costs, wholeIntroSaves };
});

console.log(`\n${ROUTE} — 390x844, kontrol pertama (field) di y=${result.base}`);
console.log(`  tinggi viewport ${result.vh}px → ${result.vh - result.base}px field terlihat\n`);
console.log("  blok pengantar (h = tinggi terukur):");
for (const b of result.blocks) console.log(`    ${String(b.h).padStart(4)}px  ${b.tag}  "${b.text}"`);
console.log("\n  kalau blok itu DIHILANGKAN, field pertama naik:");
for (const c of result.costs) console.log(`    ${String(c.saves).padStart(4)}px  ${c.tag}  "${c.text}"`);
console.log(`\n  seluruh blok pengantar dihilangkan → naik ${result.wholeIntroSaves}px (field di y=${result.base - result.wholeIntroSaves})`);

await browser.close();
