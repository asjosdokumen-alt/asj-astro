/**
 * probe-admin-contrast-2026-11-10.mjs — MEASUREMENT, not a gate.
 *
 * The a11y item in TODO.md carries one honest hole: "Panel admin juga belum
 * tercakup" — `e2e/test-contrast.mjs` measures six public/candidate routes and
 * says so. This probe answers the question that hole leaves open: *is the admin
 * panel actually failing, or is it merely unmeasured?*
 *
 * The method is COPIED from `e2e/test-contrast.mjs` on purpose, traps included:
 *   - colours resolved through the browser (oklch/oklab), never a regex
 *   - the ancestor background stack is COMPOSITED (alpha layers included)
 *   - every computed miss is CONFIRMED against a rendered pixel; a disagreement
 *     is reported UNCONFIRMED and is not a finding
 *
 * Tabs are read by HASH (`/admin#wa`) with every `/.netlify/functions/**` call
 * fulfilled locally, which is the recipe R25a in the session rules records as
 * deterministic. Fixture shape is copied from `e2e/test-aria-names.mjs` so the
 * tables render rows instead of reading as "clean".
 *
 * Run:  node deliverables/probe-admin-contrast-2026-11-10.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ensureServer, stopServer } from '../e2e/lib/server.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice('--only='.length);

const TABS = [
  'kelola', 'dbjob', 'tambah', 'pelamar', 'jadwal', 'mail',
  'wa', 'agenda', 'tugas', 'skor', 'tes', 'config',
];
const THEMES = ['light', 'dark'];
const WIDTHS = [1280, 390];

const ADMIN_CANDIDATE = {
  nama: 'Aria Uji',
  wa: '081234567890',
  idLoker: 'TG591ASJ',
  idKandidat: 'ASJ-001',
  tahapan: 'PEMBERKASAN',
  status: 'LULUS',
  kategori: 'NOUGYOU SAYURAN',
  berkas: {},
  bio: {},
};

function authFor(role) {
  return JSON.stringify({
    sessionToken: `probe-fake-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    role,
    wa: '081234567890',
    name: 'Probe Check',
    lastChecked: Date.now(),
  });
}

function installScanner() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const SENTINEL = '#010203';

  function toRgba(str) {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = SENTINEL;
    cx.fillStyle = str;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  const isSentinel = (c) => c[0] === 1 && c[1] === 2 && c[2] === 3;
  const chan = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (p) => 0.2126 * chan(p[0]) + 0.7152 * chan(p[1]) + 0.0722 * chan(p[2]);
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const over = (fg, bg) => {
    const a = fg[3];
    return [
      fg[0] * a + bg[0] * (1 - a),
      fg[1] * a + bg[1] * (1 - a),
      fg[2] * a + bg[2] * (1 - a),
      1,
    ];
  };
  const rgbStr = (p) => `rgb(${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])})`;

  function cssPath(el) {
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2);
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + cls.map((c) => `.${c}`).join('');
  }

  window.__scan = () => {
    const out = { elements: 0, unmeasurable: [], failures: [] };
    let probe = 0;
    for (const el of document.querySelectorAll('*')) {
      const tag = el.tagName;
      if (
        tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TITLE' ||
        tag === 'META' || tag === 'LINK' || tag === 'HEAD' || tag === 'BR' || tag === 'HR'
      ) {
        continue;
      }
      let text = '';
      for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent;
      text = text.replace(/\s+/g, ' ').trim();
      if (!text) continue;

      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') continue;
      if (parseFloat(cs.opacity) === 0) continue;
      if (el.getClientRects().length === 0) continue;

      const info = { text: text.slice(0, 40), tag: tag.toLowerCase(), selector: cssPath(el) };

      if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') {
        out.unmeasurable.push({ ...info, reason: 'background-clip:text (gradient text)' });
        continue;
      }

      const layers = [];
      let base = null;
      let problem = null;
      for (let n = el; n; n = n.parentElement) {
        const ncs = getComputedStyle(n);
        if (ncs.backgroundImage && ncs.backgroundImage !== 'none') {
          problem = `text over background-image (${ncs.backgroundImage.slice(0, 32)}…)`;
          break;
        }
        if (ncs.mixBlendMode && ncs.mixBlendMode !== 'normal') {
          problem = `ancestor mix-blend-mode:${ncs.mixBlendMode}`;
          break;
        }
        if (parseFloat(ncs.opacity) < 1) {
          problem = `ancestor opacity:${ncs.opacity}`;
          break;
        }
        const c = toRgba(ncs.backgroundColor);
        if (isSentinel(c)) {
          problem = `unparseable background-color: ${ncs.backgroundColor}`;
          break;
        }
        if (c[3] >= 0.999) {
          base = c;
          break;
        }
        if (c[3] > 0) layers.push(c);
      }
      if (problem || !base) {
        out.unmeasurable.push({ ...info, reason: problem || 'no opaque background found' });
        continue;
      }
      let bg = base;
      for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);

      const fill = toRgba(cs.webkitTextFillColor || cs.color);
      if (!isSentinel(fill) && fill[3] === 0) {
        out.unmeasurable.push({ ...info, reason: 'transparent text fill (gradient text)' });
        continue;
      }
      let fg = toRgba(cs.color);
      if (isSentinel(fg)) {
        out.unmeasurable.push({ ...info, reason: `unparseable color: ${cs.color}` });
        continue;
      }
      if (fg[3] < 0.999) fg = over(fg, bg);

      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3.0 : 4.5;
      const r = ratio(fg, bg);

      out.elements++;
      if (r + 1e-9 < need) {
        el.setAttribute('data-contrast-probe', String(probe));
        out.failures.push({
          ...info, probe: probe++, size, weight, large, need,
          ratio: +r.toFixed(2), fg: rgbStr(fg), bg: rgbStr(bg),
        });
      }
    }
    return out;
  };
}

try {
  await ensureServer();
} catch (err) {
  console.error(`\n  FATAL  ${err.message}\n`);
  process.exit(2);
}

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const findings = [];
const rows = [];
const unmeasurableByReason = {};
const allUnmeasurable = [];

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 700 ? 844 : 900 },
      deviceScaleFactor: 1,
    });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('asjTheme', t);
      } catch {}
    }, theme);
    await ctx.addInitScript((v) => {
      try {
        localStorage.setItem('asj_auth', v);
      } catch {}
    }, authFor('admin'));
    const page = await ctx.newPage();
    await page.addInitScript(installScanner);

    await page.route('**/.netlify/functions/**', (r) => {
      const url = r.request().url();
      let body = { success: true, sessionInvalid: false };
      if (url.includes('/candidates')) {
        body = { success: true, total: 1, candidates: [ADMIN_CANDIDATE] };
      } else if (url.includes('get-app-data')) {
        body = {
          success: true,
          sessionInvalid: false,
          activeTheme: 'dark',
          candidates: [ADMIN_CANDIDATE],
          schedules: [],
          messages: [],
          waTemplates: [{ id: 'tpl-1', nama: 'Template Uji', isi: 'Halo {nama}, ini pesan uji.' }],
        };
      }
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    for (const tab of TABS) {
      if (ONLY && !tab.includes(ONLY)) continue;
      const where = `/admin#${tab} ${theme} ${width}px`;
      let res;
      try {
        res = await page.goto(`${BASE}/admin#${tab}`, { waitUntil: 'networkidle', timeout: 45_000 });
      } catch (e) {
        rows.push({ where, error: e.message });
        continue;
      }
      if (res && res.status() !== 200) {
        rows.push({ where, error: `HTTP ${res.status()}` });
        continue;
      }
      await page.waitForTimeout(700);
      // A hash change alone does not re-navigate; force the tab by clicking the
      // sidebar entry when the hash was already the one we want.
      const hash = await page.evaluate(() => location.hash.replace('#', ''));
      if (hash !== tab) {
        await page.evaluate((t) => {
          location.hash = t;
        }, tab);
        await page.waitForTimeout(600);
      }

      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
      if (/Verifikasi Akun|Akses ditolak|Mengalihkan ke halaman login/.test(bodyText)) {
        rows.push({ where, error: 'rendered the login gate' });
        continue;
      }

      await page
        .evaluate(() =>
          Promise.race([
            document.fonts ? document.fonts.ready : Promise.resolve(),
            new Promise((r) => setTimeout(r, 1200)),
          ]),
        )
        .catch(() => {});
      await page.waitForTimeout(400);

      const scan = await page.evaluate(() => window.__scan());
      for (const u of scan.unmeasurable) {
        allUnmeasurable.push({ where, ...u });
        const key = u.reason
          .replace(/^text over background-image.*/, 'text over background-image (gradient / image)')
          .replace(/^ancestor opacity:.*/, 'ancestor opacity < 1')
          .replace(/^ancestor mix-blend-mode.*/, 'ancestor mix-blend-mode')
          .replace(/^unparseable .*/, 'unparseable colour string')
          .trim();
        unmeasurableByReason[key] = (unmeasurableByReason[key] || 0) + 1;
      }

      const viewport = page.viewportSize();
      let confirmed = 0;
      for (const f of scan.failures) {
        const row = { where, theme, width, tab, ...f };
        try {
          const handle = page.locator(`[data-contrast-probe="${f.probe}"]`).first();
          await handle.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
          const box = await handle.boundingBox();
          const x = box ? Math.max(0, Math.floor(box.x)) : 0;
          const y = box ? Math.max(0, Math.floor(box.y)) : 0;
          const w = box ? Math.min(Math.ceil(box.width), (viewport?.width ?? 1280) - x, 400) : 0;
          const h = box ? Math.min(Math.ceil(box.height), (viewport?.height ?? 900) - y, 80) : 0;
          if (w >= 1 && h >= 1) {
            await handle.evaluate((el) => {
              el.style.visibility = 'hidden';
            });
            await page.waitForTimeout(40);
            const shot = await page.screenshot({ clip: { x, y, width: w, height: h } });
            await handle.evaluate((el) => {
              el.style.visibility = '';
            });
            const px = await page.evaluate(async (b64) => {
              const img = new Image();
              img.src = `data:image/png;base64,${b64}`;
              await img.decode();
              const c = document.createElement('canvas');
              c.width = img.width;
              c.height = img.height;
              const x2 = c.getContext('2d');
              x2.drawImage(img, 0, 0);
              const d = x2.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data;
              return [d[0], d[1], d[2]];
            }, shot.toString('base64'));
            const chan = (v) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            const lum = (p) => 0.2126 * chan(p[0]) + 0.7152 * chan(p[1]) + 0.0722 * chan(p[2]);
            const fgPx = f.fg.match(/\d+/g).map(Number);
            const a = lum(fgPx);
            const b = lum(px);
            row.pixel = +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
            row.pixelBg = `rgb(${px.join(',')})`;
            row.confirmed = row.pixel + 1e-9 < f.need;
          } else {
            row.confirmed = false;
            row.pixel = null;
            row.note = 'no on-screen box';
          }
        } catch (e) {
          row.confirmed = false;
          row.pixel = null;
          row.note = `pixel probe failed: ${e.message.slice(0, 60)}`;
        }
        if (row.confirmed) {
          confirmed++;
          findings.push(row);
        } else {
          rows.push({ ...row, unconfirmed: true });
        }
      }

      rows.push({
        where,
        elements: scan.elements,
        computed: scan.failures.length,
        confirmed,
        unmeasurable: scan.unmeasurable.length,
      });
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('[data-contrast-probe]')) {
          el.removeAttribute('data-contrast-probe');
        }
      });
    }
    await ctx.close();
  }
}

await browser.close();
await stopServer();

const measured = rows.filter((r) => typeof r.elements === 'number');
console.log(`admin contrast probe — ${measured.length} surfaces, ${THEMES.length} themes x ${WIDTHS.length} widths`);
for (const r of measured) {
  console.log(
    `  ${r.where.padEnd(34)} ${String(r.elements).padStart(4)} measured  ` +
      `${String(r.computed).padStart(2)} computed  ${String(r.confirmed).padStart(2)} CONFIRMED  ` +
      `${r.unmeasurable} skipped`,
  );
}
const errored = rows.filter((r) => r.error);
if (errored.length) {
  console.log('\nNOT MEASURED:');
  for (const e of errored) console.log(`  ${e.where} — ${e.error}`);
}
console.log('\nunmeasurable (skipped, NOT a pass):');
for (const [k, v] of Object.entries(unmeasurableByReason).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}
if (findings.length) {
  console.log(`\nCONFIRMED FAILURES (${findings.length}):`);
  for (const f of findings) {
    console.log(
      `  ${f.where}  ${f.ratio}:1 (need ${f.need})  ${f.selector}  "${f.text}"  ${f.fg} on ${f.bg}  pixel=${f.pixelBg}`,
    );
  }
} else {
  console.log('\nno confirmed failures.');
}

writeFileSync(
  'deliverables/probe-admin-contrast-2026-11-10.json',
  JSON.stringify({ rows, findings, unmeasurableByReason, allUnmeasurable }, null, 2),
);
console.log('\nwrote deliverables/probe-admin-contrast-2026-11-10.json');
process.exit(0);
