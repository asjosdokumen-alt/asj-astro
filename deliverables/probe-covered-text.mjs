/**
 * probe-covered-text.mjs — teks yang TERTIMPA elemen opaque lain.
 *
 * KENAPA ADA
 * ----------
 * `responsive-sweep.mjs` punya tiga pemeriksaan: luberan horizontal, sasaran
 * sentuh, dan teks TERPOTONG (clipping oleh overflow milik sendiri). Tidak satu
 * pun bisa melihat bentuk yang ditemukan 2026-11-09 di /apply: judul di band
 * hero TIDAK terpotong oleh overflow mana pun — ia TERTIMPA kartu putih yang
 * datang belakangan dengan `mt-[-40px]` dan `z-20`. Diukur: judul berakhir di
 * y=636 sementara kartu mulai di y=625, jadi 11 px nama perusahaan ("JAPAN")
 * tidak terlihat, di 320/360/390 px.
 *
 * Probe ini adalah PROTOTIPE untuk pemeriksaan keempat di gate itu, dan ia
 * sengaja dijalankan di BANYAK rute lebih dulu: pemeriksaan baru yang memerahkan
 * halaman sehat akan "diperbaiki" dengan melonggarkan pemeriksaannya, dan itu
 * lebih buruk daripada tidak ada pemeriksaan.
 *
 * Aturan yang dipakai:
 *   · hanya elemen yang punya TEKS LANGSUNG (bukan wadah),
 *   · sampel 3 titik: tengah, 2 px dari atas, 2 px dari bawah,
 *   · `elementFromPoint` harus mengembalikan elemen LAIN yang bukan leluhur,
 *     bukan turunan, dan bukan bagian dari lapisan `fixed`/`sticky`
 *     (BottomNav, modal, toast — tumpang tindihnya disengaja),
 *   · latar elemen penimpa harus cukup opaque (alpha > 0.5) atau punya
 *     background-image.
 *
 * Pakai:
 *   BASE_URL=http://localhost:4400 ROUTES=/,/apply node deliverables/probe-covered-text.mjs
 */
import { chromium } from '../node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTES = (process.env.ROUTES || '/,/loker,/public,/apply,/siswa-baru,/ai-cv,/kotoba,/matematika,/tes-iq,/tes-mbti,/tes-mata,/arcade,/wawancara,/blog/cara-daftar-kerja-ke-jepang-2026')
  .split(',')
  .map((r) => `/${r.trim().replace(/^[A-Za-z]:[\\/].*?[\\/]astro[\\/]/, '/').replace(/^\/+/, '')}`);
const WIDTHS = (process.env.WIDTHS || '320,360,390,768,1280').split(',').map(Number);

const DETECT = () => {
  const out = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
    return true;
  };
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `${el.tagName.toLowerCase()}${id}${cls} "${txt}"`;
  };
  const inFixedLayer = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.position === 'fixed' || cs.position === 'sticky') return true;
    }
    return false;
  };
  /* Ditumpuk SECARA SENGAJA: ada leluhur ber-`z-index` eksplisit >= 1 yang BUKAN
     leluhur elemen teksnya. Ini yang membedakan "kartu memang di atas band"
     (z-20 di atas z-10, /apply) dari tumpang tindih tak sengaja karena aliran
     dokumen (gerbang login /matematika, z-index auto). */
  const stackedAbove = (hit, textEl) => {
    for (let p = hit; p && p !== document.body; p = p.parentElement) {
      if (p === textEl || p.contains(textEl)) return false;
      const z = getComputedStyle(p).zIndex;
      if (z !== 'auto' && Number(z) >= 1) return true;
    }
    return false;
  };
  const opaque = (el) => {
    const cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    const m = /^rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
    if (!m) return false;
    const parts = m[1].split(',').map((s) => parseFloat(s));
    const a = parts.length > 3 ? parts[3] : 1;
    return a > 0.5;
  };

  for (const el of document.querySelectorAll('body *')) {
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!ownText) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 4 || r.width < 4) continue;
    const cx = Math.round(r.left + r.width / 2);
    const points = [
      [cx, Math.round(r.top + r.height / 2)],
      [cx, Math.round(r.bottom - 2)],
      [cx, Math.round(r.top + 2)],
    ];
    for (const [x, y] of points) {
      if (y < 1 || y > vh - 1 || x < 1 || x > vw - 1) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      if (inFixedLayer(hit)) continue;
      if (!opaque(hit)) continue;
      if (!stackedAbove(hit, el)) continue;
      out.push({
        el: describe(el),
        rect: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
        by: describe(hit),
        at: `${x},${y}`,
      });
      break;
    }
  }
  return out;
};

const browser = await chromium.launch();
for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    const found = await page.evaluate(DETECT);
    if (found.length === 0) {
      console.log(`${route.padEnd(46)} ${String(width).padStart(4)}px  bersih`);
    } else {
      console.log(`${route.padEnd(46)} ${String(width).padStart(4)}px  ${found.length} temuan`);
      for (const f of found.slice(0, 4)) {
        console.log(`    ${f.el}\n      rect ${f.rect.top}..${f.rect.bottom}  tertimpa oleh ${f.by}  @${f.at}`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
