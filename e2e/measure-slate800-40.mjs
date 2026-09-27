/**
 * measure-slate800-40.mjs — membuktikan perbaikan shim `/40`.
 *
 * Hipotesis: sebelum 2026-09-27, `bg-slate-800/40` TIDAK ada di keluarga shim
 * §5b, jadi di tema terang panel-nya tetap GELAP padahal teks di dalamnya sudah
 * dibalik jadi gelap → teks gelap di panel gelap → kontras < 2:1.
 *
 * Metode: ukur kontras teks-nyata-vs-latar pada elemen `bg-slate-800/40` yang
 * benar-benar ter-render, lalu BANDINGKAN dengan simulasi "sebelum perbaikan"
 * (shim /40 dimatikan dengan menyuntikkan override yang menang).
 *
 * Jalankan:
 *   BASE_URL=http://localhost:4321 node e2e/measure-slate800-40.mjs
 *
 * Catatan port: 4321 = `npm run dev` repo ini.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

// --- WCAG helpers (identik dengan e2e/measure-hero-contrast.mjs) ------------
function srgbToLin(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function relLum([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function ratio(a, b) {
  const la = relLum(a);
  const lb = relLum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
function parseRgb(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}
// Komposit warna ber-alpha di atas latar solid — supaya perbandingan adil
// ketika panel memakai #f3eff3f2 (94% opaque) di atas latar halaman.
function composite([r, g, b, a], bg) {
  return [
    Math.round(r * a + bg[0] * (1 - a)),
    Math.round(g * a + bg[1] * (1 - a)),
    Math.round(b * a + bg[2] * (1 - a)),
  ];
}

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
let failed = 0;
try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: {
      cookies: [],
      origins: [{
        origin: BASE,
        localStorage: [
          // Auth: admin, supaya bisa masuk ke editor CV.
          { name: 'asj_auth', value: JSON.stringify({ role: 'admin', name: 'Admin', wa: '081234567890',
            sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now() }) },
          // Paksa tema terang.
          { name: 'asj_theme', value: 'light' },
          // Paksa bahasa Indonesia (memastikan ini BUKAN soal bahasa).
          { name: 'asj_lang', value: 'id' },
        ],
      }],
    },
  });
  const page = await ctx.newPage();

  // Stub backend: cukup agar AiCvForm punya data (ini inti keluhan
  // "kok gak keluar datanya" — datanya ada, tapi tak terbaca).
  await page.route('**/.netlify/functions/**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true, candidates: [], mySchedules: [], kandidatRiwayat: [],
        appData: {}, users: [], loker: [], soal: [],
      }),
    });
  });

  // Cari SEMUA elemen yang benar-benar memakai bg-slate-800/40.
  const probe = async (label) => {
    const rows = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        if (!el.className || typeof el.className !== 'string') continue;
        if (!/(^|\s)bg-slate-800\/40(\s|$)/.test(el.className)) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;   // tak terlihat, lewati
        // Ambil satu teks-nyata di dalamnya untuk diukur.
        const textEl = el.querySelector('span,label,h1,h2,h3,p,div');
        const tcs = textEl ? getComputedStyle(textEl) : null;
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className.slice(0, 90),
          bg: cs.backgroundColor,
          w: Math.round(r.width), h: Math.round(r.height),
          textSample: (textEl ? textEl.textContent : '').trim().slice(0, 40),
          textColor: tcs ? tcs.color : null,
          fontSize: tcs ? parseFloat(tcs.fontSize) : null,
          fontWeight: tcs ? tcs.fontWeight : null,
        });
      }
      return out;
    });

    console.log(`\n== [${label}] elemen .bg-slate-800\\/40 yang ter-render: ${rows.length} ==`);
    if (rows.length === 0) {
      console.log('   (tidak ada yang ter-render di halaman ini)');
      return { rows, failures: 0 };
    }
    // Warna halaman sebagai latar di bawah panel ber-alpha.
    const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const bodyBg = parseRgb(pageBg) || [255, 255, 255, 1];

    let failures = 0;
    for (const r of rows) {
      const bg = parseRgb(r.bg);
      if (!bg) continue;
      const solidBg = bg[3] < 1 ? composite(bg, bodyBg.slice(0, 3)) : bg.slice(0, 3);
      const fg = parseRgb(r.textColor);
      if (!fg) continue;
      const solidFg = fg[3] < 1 ? composite(fg, solidBg) : fg.slice(0, 3);
      const cr = ratio(solidFg, solidBg);
      const large = (r.fontSize >= 24) || (r.fontSize >= 18.66 && Number(r.fontWeight) >= 700);
      const floor = large ? 3.0 : 4.5;
      const pass = cr >= floor;
      if (!pass) failures++;
      console.log(`   <${r.tag}> ${r.w}x${r.h}  bg=${r.bg}  fg=${r.textColor}  ${cr.toFixed(2)}:1 ` +
        `(floor ${floor} ${large ? 'large' : 'normal'})  ${pass ? 'PASS' : 'FAIL'}  "${r.textSample}"`);
    }
    return { rows, failures };
  };

  // Dua halaman memuat call site bg-slate-800/40:
  //   /admin  -> App.tsx:745   (header drawer)
  //   /ai-cv  -> AiCvForm.tsx:1075 (panel saran AI) + :1361 (RepeaterRow)
  let totalBefore = 0;
  let totalAfter = 0;
  let totalFailBefore = 0;
  let totalFailAfter = 0;

  for (const route of ['/admin', '/ai-cv']) {
    console.log(`\n################ ${route} ################`);
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    // Terapkan tema terang secara eksplisit apa pun yang terjadi pada boot.
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(300);

    const after = await probe('SESUDAH perbaikan');

    // Simulasi SEBELUM: matikan shim /40 dengan override specificity lebih tinggi.
    await page.addStyleTag({
      content: `[data-theme="light"] .bg-slate-800\\/40 { background-color: rgba(29,41,61,0.4) !important; }`,
    });
    await page.waitForTimeout(200);
    const before = await probe('SIMULASI SEBELUM (shim /40 dimatikan)');

    console.log(`\n  ringkas ${route}: SESUDAH ${after.failures} gagal / ${after.rows.length} elemen` +
      `  |  SEBELUM ${before.failures} gagal / ${before.rows.length} elemen`);

    totalAfter += after.rows.length;
    totalBefore += before.rows.length;
    totalFailAfter += after.failures;
    totalFailBefore += before.failures;

    await page.screenshot({
      path: `test-results/slate800-40-after${route.replace(/\//g, '-')}.png`,
      fullPage: true,
    });
    console.log(`  screenshot: test-results/slate800-40-after${route.replace(/\//g, '-')}.png`);
  }

  console.log('\n================ RINGKASAN GABUNGAN ===============');
  console.log(`SESUDAH : ${totalAfter} elemen, ${totalFailAfter} gagal kontras`);
  console.log(`SEBELUM : ${totalBefore} elemen, ${totalFailBefore} gagal kontras`);

  const improved = totalFailBefore > totalFailAfter;
  console.log(improved
    ? `\n>>> TERBUKTI: perbaikan menurunkan kegagalan kontras ${totalFailBefore} -> ${totalFailAfter}`
    : `\n>>> TIDAK terbukti membaik (before=${totalFailBefore} after=${totalFailAfter})`);
  if (!improved) failed++;
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
