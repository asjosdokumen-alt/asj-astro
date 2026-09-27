/**
 * measure-ai-cv-labels.mjs — membuktikan label kolom isian AI-CV tak terbaca di
 * tema terang (keluhan screenshot-2: "headernya kok gak kelihatan ya yg di atas
 * kolom isian itu loh").
 *
 * Hipotesis: `Field` dan `PairSelect` memakai label
 *   class="block text-[11px] text-[#e2e8f0] mb-0.5"
 * `#e2e8f0` = slate-200 (hampir putih). Di tema terang panel-nya terang, jadi
 * label hampir-putih di atas panel terang → tak terlihat. Kelas `text-[#...]`
 * arbitrer tidak punya padanan di shim §5b, jadi nilainya bertahan apa adanya.
 *
 * Jalankan: BASE_URL=http://localhost:4321 node e2e/measure-ai-cv-labels.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

// WCAG maths lives INSIDE the two page.evaluate() calls below, not here: it has
// to run in the browser to see computed styles. Keeping an unused copy out here
// was dead weight the lint ratchet correctly flagged.
//
// Naikkan rantai elemen untuk mendapat latar EFEKTIF (panel ber-alpha di atas
// latar halaman). Tanpa ini, panel rgba(...0.95) diukur salah.

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
let failed = 0;
try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    storageState: {
      cookies: [],
      origins: [{
        origin: BASE,
        localStorage: [
          { name: 'asj_auth', value: JSON.stringify({ role: 'admin', name: 'Admin', wa: '081234567890',
            sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now() }) },
          { name: 'asj_theme', value: 'light' },
          { name: 'asj_lang', value: 'id' },
        ],
      }],
    },
  });
  const page = await ctx.newPage();
  await page.route('**/.netlify/functions/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, candidates: [], mySchedules: [], kandidatRiwayat: [], appData: {}, users: [], loker: [], soal: [] }) });
  });

  await page.goto(`${BASE}/ai-cv`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(300);

  const rows = await page.evaluate(() => {
    const parseRgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
    const composite = ([r, g, b, a], bg) => [Math.round(r * a + bg[0] * (1 - a)), Math.round(g * a + bg[1] * (1 - a)), Math.round(b * a + bg[2] * (1 - a))];
    const pageBg = parseRgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];

    const effOf = (el) => {
      const chain = []; let n = el;
      while (n && n !== document.documentElement) { chain.push(n); n = n.parentElement; }
      let acc = pageBg.slice(0, 3);
      for (const node of chain.reverse()) {
        const c = parseRgb(getComputedStyle(node).backgroundColor);
        if (!c || c[3] === 0) continue;
        acc = c[3] >= 1 ? c.slice(0, 3) : composite(c, acc);
      }
      return acc;
    };

    const out = [];
    for (const lab of document.querySelectorAll('form label, label')) {
      const txt = (lab.textContent || '').trim();
      if (!txt || txt.length > 40) continue;
      const r = lab.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(lab);
      const bg = effOf(lab);
      out.push({ text: txt, color: cs.color, fontSize: parseFloat(cs.fontSize), bg, html: lab.className });
    }
    return out;
  });

  console.log(`== label ter-render di /ai-cv: ${rows.length} ==\n`);

  const report = await page.evaluate((rows) => {
    const srgbToLin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const relLum = ([r, g, b]) => 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
    const ratio = (a, b) => { const la = relLum(a), lb = relLum(b); const hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); };
    const parseRgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
    return rows.map((r) => {
      const fg = parseRgb(r.color) || [0, 0, 0, 1];
      const solidFg = fg[3] < 1 ? [Math.round(fg[0] * fg[3] + r.bg[0] * (1 - fg[3])), Math.round(fg[1] * fg[3] + r.bg[1] * (1 - fg[3])), Math.round(fg[2] * fg[3] + r.bg[2] * (1 - fg[3]))] : fg.slice(0, 3);
      const cr = ratio(solidFg, r.bg);
      const large = r.fontSize >= 24;
      const floor = large ? 3.0 : 4.5;
      return { ...r, cr, floor, pass: cr >= floor };
    });
  }, rows);

  const fails = report.filter((r) => !r.pass);
  // Kelompokkan supaya pola-nya terlihat, bukan 60 baris acak.
  const byColor = new Map();
  for (const r of report) {
    const k = r.color;
    if (!byColor.has(k)) byColor.set(k, { count: 0, fails: 0, sample: r.text, cls: r.html });
    const g = byColor.get(k); g.count++; if (!r.pass) g.fails++;
  }

  console.log('--- dikelompokkan menurut warna teks ---');
  for (const [color, g] of [...byColor.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${color.padEnd(24)} ${String(g.count).padStart(3)} label, ${String(g.fails).padStart(3)} gagal  e.g. "${g.sample}"`);
    console.log(`      class: ${g.cls}`);
  }

  console.log(`\n--- detail kegagalan (${fails.length}) ---`);
  for (const r of fails.slice(0, 20)) {
    console.log(`  ${r.cr.toFixed(2)}:1 (floor ${r.floor})  fg=${r.color}  bg=rgb(${r.bg.join(',')})  "${r.text}"`);
  }
  if (fails.length > 20) console.log(`  ... dan ${fails.length - 20} lagi`);

  console.log(`\n>>> ${fails.length} dari ${report.length} label gagal kontras WCAG AA`);
  if (fails.length > 0) failed++;

  await page.screenshot({ path: 'test-results/ai-cv-labels-light.png', fullPage: true });
  console.log('screenshot: test-results/ai-cv-labels-light.png');
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
