/**
 * cards.mjs — 8 kartu cerita × 2 rasio = 16 kartu siap pakai.
 *
 * Jalankan: node deliverables/asset-library/build/cards.mjs
 *
 * Latar = still yang SUDAH digenerate `stills.mjs` (bukan plate baru), jadi
 * wajah model konsisten dengan situs. Teksnya HANYA salinan verbatim dari
 * `src/lib/companyProfile.ts` (FLOW_STEPS) dan `src/store/i18n.ts`
 * (`profile.hero_*`): tidak ada testimoni karangan, tidak ada angka mitra/
 * kandidat/keberangkatan. Lihat aturan repo tentang klaim yang dilarang.
 *
 * Render memakai Playwright + Chromium yang sudah terpasang di repo, lalu
 * setiap screenshot dikonversi ke WebP oleh sharp. `cards/source.html`
 * disimpan supaya kartu bisa diedit tanpa menjalankan ulang seluruh pipeline.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const LIB = 'F:/astro/deliverables/asset-library';
const STILLS = join(LIB, 'stills');
const CARDS = join(LIB, 'cards');

/** Urutan babak = FLOW_STEPS; plate dipetakan ke isi frame, bukan ke nomor. */
const CHAPTERS = [
  {
    id: '01-daftar', no: '01', title: 'Registration',
    body: 'Pemeriksaan kesehatan, dokumen, dan mengisi form pendaftaran.',
  },
  {
    id: '02-latihan', no: '02', title: 'Training & Education',
    body: 'Pelatihan bahasa Jepang, keterampilan, dan pengenalan budaya Jepang.',
  },
  {
    id: '03-wawancara', no: '03', title: 'Interview',
    body: 'Wawancara kerja dengan perusahaan Jepang.',
  },
  {
    id: '04-paspor', no: '04', title: 'Employment Document',
    body: 'Kepengurusan berkas di Indonesia.',
  },
  {
    id: '05-mcu', no: '05', title: 'Document Preparing',
    body: 'Pemeriksaan kesehatan (MCU) dan tanda tangan kontrak kerja, lalu kepengurusan berkas imigrasi Jepang (COE).',
  },
  {
    id: '05-terbang', no: '06', title: 'GO TO JAPAN',
    body: 'Pengurusan paspor, visa, dan EKTLN di Indonesia.',
  },
];

const SPECIAL = [
  {
    id: '00-hero', kind: 'manifesto',
    kicker: 'PT AMANAH SAKURA JAPAN',
    title: 'Karier ke Jepang, dimulai dari sini.',
    body: "LET'S BUILD OUR FUTURE",
    foot: 'LPK pelatihan bahasa & budaya kerja Jepang di Ponorogo.',
  },
  {
    id: '06-tiba', kind: 'cta',
    kicker: 'PT AMANAH SAKURA JAPAN',
    title: 'Daftar sebagai Pelamar',
    body: 'Ajukan Kerja Sama',
    foot: "LET'S BUILD OUR FUTURE",
  },
];

const SIZES = [
  { key: '4x5', w: 1080, h: 1350, still: '4x5', pad: 84, title: 76, body: 34, num: 30 },
  { key: '9x16', w: 1080, h: 1920, still: '9x16', pad: 92, title: 84, body: 38, num: 34 },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fileUrl = (abs) => pathToFileURL(abs).href;

/** Rajdhani 700 dipakai untuk judul; badan teks memakai sans sistem (Arial). */
const FONT = pathToFileURL('F:/astro/deliverables/hero-3d/assets/rajdhani-700.woff2').href;

function css(s) {
  return `
@font-face{font-family:'Rajdhani';src:url('${FONT}') format('woff2');font-weight:700;font-display:block}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#020617}
.card{position:relative;width:${s.w}px;height:${s.h}px;overflow:hidden;background:#020617;
  font-family:Arial,Helvetica,sans-serif;color:#f1f5f9}
.bg{position:absolute;inset:0;background-image:var(--bg);background-size:cover;background-position:center;
  filter:saturate(.92)}
.shade{position:absolute;inset:0;background:
  linear-gradient(to top,rgba(2,6,23,.97) 0%,rgba(2,6,23,.90) 34%,rgba(2,6,23,.52) 66%,rgba(2,6,23,.24) 100%),
  linear-gradient(115deg,rgba(2,6,23,.46) 0%,rgba(2,6,23,0) 62%)}
.glow{position:absolute;left:${s.pad}px;top:${s.pad}px;width:64px;height:3px;background:#f9a8d4;border-radius:2px}
.frame{position:absolute;inset:${s.pad}px;display:flex;flex-direction:column}
.brand{font-size:${s.num * 0.72}px;font-weight:700;letter-spacing:.22em;color:#f9a8d4;text-transform:uppercase}
.brand small{display:block;margin-top:10px;font-size:${s.num * 0.6}px;letter-spacing:.16em;color:#cbd5e1;font-weight:400}
.spacer{flex:1}
.no{font-family:'Rajdhani',Arial,sans-serif;font-size:${s.num * 2.6}px;font-weight:700;
  line-height:1;color:#f9a8d4;letter-spacing:.04em}
.no em{font-style:normal;font-size:${s.num}px;color:#94a3b8;margin-left:12px;letter-spacing:.2em}
.rule{width:100%;height:1px;background:rgba(249,168,212,.5);margin:${s.num * 1.1}px 0 ${s.num * 0.9}px}
h1{font-family:'Rajdhani',Arial,sans-serif;font-weight:700;font-size:${s.title}px;line-height:1.04;
  letter-spacing:-.01em;color:#f8fafc;text-wrap:balance}
.body{font-size:${s.body}px;line-height:1.45;color:#e2e8f0;margin-top:${s.body * 0.65}px;max-width:88%}
.foot{margin-top:${s.num * 1.6}px;font-size:${s.num * 0.66}px;font-weight:700;letter-spacing:.2em;
  text-transform:uppercase;color:#fbbf24}
.card.manifesto h1,.card.cta h1{font-size:${s.title * 1.12}px}
.card.manifesto .body,.card.cta .body{font-family:'Rajdhani',Arial,sans-serif;font-weight:700;
  font-size:${s.body * 1.35}px;letter-spacing:.04em;color:#f9a8d4}
`;
}

function cardHtml(item, s, stillDir) {
  const img = fileUrl(join(STILLS, stillDir, `${item.id}.webp`));
  const isChapter = item.no !== undefined;
  const cls = isChapter ? 'chapter' : item.kind;
  const inner = isChapter
    ? `<div class="no">${item.no}<em>/ 06</em></div>
       <div class="rule"></div>
       <h1>${esc(item.title)}</h1>
       <p class="body">${esc(item.body)}</p>`
    : `<div class="no">${item.kind === 'manifesto' ? '—' : '→'}</div>
       <div class="rule"></div>
       <h1>${esc(item.title)}</h1>
       <p class="body">${esc(item.body)}</p>`;
  return `<section class="card ${cls}" data-id="${isChapter ? item.no + '-' + item.id : item.kind}" style="--bg:url('${img}')">
    <div class="bg"></div><div class="shade"></div>
    <div class="frame">
      <div class="brand">${esc(item.kicker ?? 'PT AMANAH SAKURA JAPAN')}<small>SATU JALAN · ${isChapter ? 'ALUR PENDAFTARAN' : item.kind === 'manifesto' ? 'MANIFESTO' : 'CTA'}</small></div>
      <div class="spacer"></div>
      ${inner}
      <div class="foot">${esc(item.foot ?? "LET'S BUILD OUR FUTURE")}</div>
    </div>
  </section>`;
}

const items = [
  ...CHAPTERS.map((c) => ({ ...c, kicker: 'PT AMANAH SAKURA JAPAN' })),
  ...SPECIAL,
];

let written = 0;
const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
try {
  for (const s of SIZES) {
    mkdirSync(join(CARDS, s.key), { recursive: true });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css(s)}</style></head><body>
${items.map((i) => cardHtml(i, s, s.still)).join('\n')}
</body></html>`;
    writeFileSync(join(CARDS, `source-${s.key}.html`), html);
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    await page.goto(fileUrl(join(CARDS, `source-${s.key}.html`)), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    // Verifikasi yang BISA GAGAL: tidak ada teks yang meluber keluar kartu.
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.card')].flatMap((c) => {
      const r = c.getBoundingClientRect();
      return [...c.querySelectorAll('h1,.body,.foot')]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return b.bottom > r.bottom - 40 || b.right > r.right - 20 || b.top < r.top;
        })
        .map((e) => `${c.dataset.id}: ${e.className || e.tagName}`);
    }));
    if (overflow.length) throw new Error(`teks meluber di ${s.key}: ${overflow.join(', ')}`);

    for (const item of items) {
      const id = item.no ? `${item.no}-${item.id}` : item.kind;
      const el = page.locator(`.card[data-id="${id}"]`);
      const png = await el.screenshot({ type: 'png' });
      const out = join(CARDS, s.key, `${id}.webp`);
      const info = await sharp(png).webp({ quality: 88, effort: 5 }).toFile(out);
      written += 1;
      console.log(`  ${s.key}/${id}.webp ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`\ncards: ${written} kartu dari ${items.length} desain × ${SIZES.length} rasio`);
