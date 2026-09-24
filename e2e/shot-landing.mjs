/**
 * shot-landing.mjs — capture the landing page for human review.
 *
 * This is an EVIDENCE tool, not a gate. It asserts nothing and can fail no
 * test; its only job is to turn "trust my description" into "look at it".
 *
 * Two traps this file exists to avoid, both already paid for in this repo:
 *
 *  1. The sandbox exports HTTP_PROXY, so a 127.0.0.1 navigation is sent to the
 *     proxy and answered 502 — which looks exactly like "the server is down".
 *     `--no-proxy-server` is mandatory here.
 *
 *  2. The hero and every section primitive are `client:only` islands, so a
 *     screenshot taken before hydration shows an almost empty page. We wait for
 *     a selector INSIDE the hero, not for `load`, which fires long before
 *     hydration finishes.
 *
 * Full-page capture on a long landing page produces an image too tall to read,
 * so we also write per-viewport slices and a section index with y-offsets —
 * the offsets are the thing that makes a slice reviewable ("this is the hero"
 * rather than "this is some part of a very long image").
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.LANDING_URL || 'http://127.0.0.1:4321/';
const OUT = 'test-results/landing';
const WIDTHS = [390, 1280];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const index = [];

for (const width of WIDTHS) {
  const height = width < 700 ? 844 : 900;
  const page = await browser.newPage({ viewport: { width, height } });

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Hydration signal: the hero's <h1>. `load` fires before Preact mounts the
  // client:only islands, so waiting on it produces a blank-looking capture.
  await page.waitForSelector('#atas h1', { timeout: 30_000 });
  // Let lazy images and the section nav's IntersectionObserver settle.
  await page.waitForTimeout(1500);

  // Where every spec section actually landed, measured in the live DOM.
  // NOTE: `galeri` is R3 and was added after this list was first written. The list
  // is a hardcoded id array, so a new section is NOT captured until it is added
  // here — which is exactly what happened: the gallery rendered at y=4821, 1325px
  // tall, and simply did not appear in the index or the slices. Anyone comparing
  // this file's output against the spec's section table should keep that failure
  // mode in mind: an absent section and an unlisted section look identical here.
  const offsets = await page.evaluate(() => {
    const ids = [
      'atas', 'kenapa-jepang', 'loker', 'layanan', 'program', 'alur',
      'visi-misi', 'legalitas', 'fasilitas', 'galeri',
      'penempatan', 'tentang', 'tim', 'kontak', 'lokasi', 'daftar',
    ];
    const out = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) {
        out.push({ id, found: false });
        continue;
      }
      const r = el.getBoundingClientRect();
      const hidden = el.hasAttribute('hidden') || r.height === 0;
      out.push({
        id,
        found: true,
        hidden,
        y: Math.round(r.top + window.scrollY),
        h: Math.round(r.height),
      });
    }
    return out;
  });

  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  await page.screenshot({ path: `${OUT}/${width}-full.png`, fullPage: true });

  // Viewport-sized slices on a fixed stride. A full-page shot of a 16-section
  // page is unreadable at any zoom; slices are what a person can actually check.
  const STRIDE = height;
  const slices = Math.ceil(docHeight / STRIDE);
  for (let i = 0; i < slices; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * STRIDE);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${width}-s${String(i + 1).padStart(2, '0')}.png` });
  }

  // Horizontal overflow, corrected for the reserved scrollbar gutter.
  //
  // A naive `scrollWidth - clientWidth` reports -15px here and looks like a
  // defect. It is not: `global.css` sets `scrollbar-gutter: stable`, which
  // reserves ~15px for the classic scrollbar on Windows/Linux, so clientWidth
  // is 15px NARROWER than the layout viewport and the subtraction goes
  // negative. The number that means "no horizontal scroll" is therefore
  // `scrollWidth > clientWidth`, i.e. POSITIVE overflow — a negative value is
  // slack, not breakage. Reporting the raw difference once cost a round of
  // chasing a layout bug that did not exist.
  const horizontal = await page.evaluate(() => {
    const de = document.documentElement;
    const gutter =
      parseFloat(getComputedStyle(de).getPropertyValue('--u-scrollbar-gutter')) || 0;
    return {
      overflowPx: de.scrollWidth - de.clientWidth,
      gutterVar: gutter,
      scrollbarPx: window.innerWidth - de.clientWidth,
    };
  });

  index.push({ width, height, docHeight, slices, horizontal, sections: offsets });
  await page.close();
}

await browser.close();

writeFileSync(`${OUT}/index.json`, `${JSON.stringify(index, null, 2)}\n`);

// Human-readable summary — the point of the whole exercise.
for (const entry of index) {
  const h = entry.horizontal;
  console.log(`\n${entry.width}px  ·  document ${entry.docHeight}px  ·  ${entry.slices} slices`);
  console.log(
    `  horizontal: overflow ${h.overflowPx}px ` +
      `(${h.overflowPx > 0 ? 'REAL OVERFLOW' : 'no horizontal scroll'}), ` +
      `scrollbar ${h.scrollbarPx}px, --u-scrollbar-gutter ${h.gutterVar}px`,
  );
  for (const s of entry.sections) {
    if (!s.found) {
      console.log(`  MISSING   #${s.id}`);
      continue;
    }
    console.log(
      `  ${s.hidden ? 'HIDDEN ' : 'ok     '} #${s.id.padEnd(14)} y=${String(s.y).padStart(6)}  h=${s.h}px`,
    );
  }
}
console.log(`\nwritten to ${OUT}/`);
