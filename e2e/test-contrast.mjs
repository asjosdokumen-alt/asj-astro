/**
 * test-contrast.mjs — WCAG 2.1 AA text-contrast GATE (not an evidence tool).
 *
 * WHAT IT ASSERTS
 *   Every visible text element on six routes, in BOTH themes, meets the WCAG AA
 *   floor: 4.5:1 for normal text, 3.0:1 for large text (>= 24px, or >= 18.66px
 *   and bold). It exits non-zero when a MEASURED element misses, and prints the
 *   route, theme, ratio, floor, selector and text so a red is actionable rather
 *   than a number.
 *
 * WHY IT EXISTS
 *   The audit that preceded this gate found real misses (a rose marquee at
 *   2.78:1, an amber action button at 4.01:1) that no other gate could see:
 *   `verify-classes.mjs` proves a class produces a rule, the lint ratchet counts
 *   source diagnostics, and the headings/labels gates check semantics. None of
 *   them looks at the COLOUR a rule finally resolves to. Contrast is a property
 *   of the RENDERED result, so it has to be measured on the rendered page.
 *
 * ── THE TRAP THIS GATE IS BUILT AROUND (read before changing the method) ─────
 *   This tree emits `oklch()` / `oklab()` colours (Tailwind v4). A regex `rgb()`
 *   parser reads `oklch(0.129 0.042 264.695)` as `rgb(0.129, 0.042, 264.695)` and
 *   reports garbage — an early attempt produced 73 phantom dark-mode failures
 *   and ratios of exactly 1. So colours are resolved through the BROWSER's own
 *   engine: set `canvas.fillStyle`, paint 1x1, read `getImageData`. That path
 *   understands every colour syntax the browser does, and always hands back sRGB.
 *
 * ── THE SECOND TRAP: TRANSLUCENT SURFACES (the one that matters most) ────────
 *   A first version accepted only a background that resolved to a SOLID opaque
 *   colour and SKIPPED anything translucent. On `/apply` that is catastrophic:
 *   the form card is `bg-slate-900/88`, i.e. `rgba(255,255,255,0.92)` in light
 *   mode, so the walk skipped the card and measured the label against the opaque
 *   page `#020617` behind it — reporting 2.16:1 for a label that renders at
 *   7.85:1. A method that skips translucent layers does not merely under-report;
 *   it can INVENT a failure, because `white@0.92 over near-black` is near-white,
 *   not near-black.
 *
 *   So this gate COMPOSITES. It walks the ancestor chain, collects every
 *   background layer (including alpha<1 ones), stops at the first opaque layer,
 *   and alpha-composites the stack in paint order. `/apply`'s card therefore
 *   resolves to `rgb(235,235,236)` — which is what the pixel behind the label
 *   actually is (verified by screenshot).
 *
 * ── AND A THIRD: NEVER FAIL ON A COMPUTED NUMBER ALONE ──────────────────────
 *   Because the failure mode above is a FALSE POSITIVE, every computed miss is
 *   CONFIRMED against the real rendered pixel: the element's text is hidden
 *   (`visibility:hidden`, layout kept), its box is screenshotted, and the pixel
 *   behind the glyphs is read. An element is only counted as a FAILURE when the
 *   pixel agrees with the computation. When they disagree the element is printed
 *   as UNCONFIRMED and does NOT fail the gate — a disagreement means the model of
 *   the surface is wrong somewhere (backdrop-filter over a photo, a stacking
 *   context, a pseudo-element), which is a reason to look, not a reason to blame
 *   the component.
 *
 * ── WHAT THIS METHOD CANNOT SEE (the honest boundary) ───────────────────────
 *   1. TEXT OVER A GRADIENT OR AN IMAGE is SKIPPED, not passed. The walk bails
 *      the moment an ancestor carries `background-image` (a gradient or a url),
 *      or when an ancestor has `opacity < 1`, `mix-blend-mode`, or the element's
 *      own text fill is transparent (gradient text). Those elements are counted
 *      and named as UNMEASURABLE. This UNDER-reports: it should not invent
 *      failures, but it can miss them. The hero headline over its artwork band is
 *      the known example — `e2e/measure-hero-contrast.mjs` covers that one, by
 *      sampling pixels.
 *   2. `backdrop-filter` is NOT modelled. It is only wrong when the backdrop is
 *      non-uniform, and a non-uniform backdrop is usually a gradient/image, which
 *      rule 1 already bails on. It IS the reason the `/apply` card is measured
 *      from its composite rather than from its blurred backdrop, and the pixel
 *      confirmation is what keeps that honest.
 *   3. Hover / focus / disabled states are NOT measured. Only the resting state.
 *   4. Only these six routes. The admin modals are not covered.
 *
 * ── STRICTNESS: STRICT, NOT A RATCHET ───────────────────────────────────────
 *   This gate fails on ANY measured miss. It is not ratcheted against a recorded
 *   baseline, because the measured baseline is ZERO and a baseline of zero is the
 *   same thing as strict — with the added risk that a ratchet invites someone to
 *   raise the number. `--report-only` prints the same report and exits 0; it is
 *   for triage, never for CI.
 *
 * Run against a built artifact served by `node server.cjs`:
 *   node e2e/test-contrast.mjs
 *   BASE_URL=http://localhost:4321 node e2e/test-contrast.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const REPORT_ONLY = process.argv.includes('--report-only');

/**
 * The routes the audit measured. `/ai-cv`, `/apply` and `/siswa-baru` gate on the
 * auth STORE, so they need a fabricated session or they render a login gate with
 * none of the form's colours (the same reason `test-labels.mjs` fabricates one).
 */
const ROUTES = [
  { path: '/', session: null },
  // The job rows are `client:only` and arrive from the backend, so the amber
  // action button this gate exists to catch does not exist until a row renders.
  // Waiting for a row is what stops a slow backend from turning into a silent
  // "no rows, no buttons, clean pass".
  { path: '/loker', session: null, waitFor: 'table tbody tr' },
  // The rose announcement marquee ships `hidden` and is unhidden only after
  // `getPublicData()` resolves, so without this wait a slow backend would make
  // the gate measure a page with the marquee absent and report a clean pass for
  // an element it never saw. `waitFor` is asserted per route below.
  {
    path: '/public',
    session: null,
    waitFor: '#global-announcement:not([hidden])',
    alsoWaitFor: 'table tbody tr',
  },
  { path: '/ai-cv', session: 'kandidat' },
  { path: '/apply', session: 'kandidat' },
  { path: '/siswa-baru', session: 'kandidat' },
];

/**
 * 1280px is the width at which every responsive variant this gate cares about is
 * VISIBLE: the LokerTable action buttons hide their label below `sm:` (640px), so
 * the amber "Detail" miss cannot be seen on a phone. 390px is measured too, so a
 * phone-only miss is caught rather than assumed absent.
 */
const WIDTHS = [1280, 390];
const THEMES = ['light', 'dark'];

/** Fabricated session — these routes gate on the STORE, not the backend. */
function authFor(role) {
  return JSON.stringify({
    sessionToken: `contrast-fake-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    role,
    wa: '081234567890',
    name: 'Contrast Check',
    lastChecked: Date.now(),
  });
}

/**
 * Installed in the page. Resolves colours through the browser (see the trap
 * notes in the header) and composites the ancestor background stack.
 */
function installScanner() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  // An invalid colour string leaves fillStyle untouched, so seed it with a value
  // no real surface will be, and treat that value as "unparseable".
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

  /** A short, human-usable selector: tag + #id + up to two classes. */
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
      // Own direct text only — a wrapper is not a text element, and measuring it
      // would report the wrapper's own colour for text it does not carry.
      let text = '';
      for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent;
      text = text.replace(/\s+/g, ' ').trim();
      if (!text) continue;

      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') continue;
      if (parseFloat(cs.opacity) === 0) continue;
      if (el.getClientRects().length === 0) continue;

      const info = {
        text: text.slice(0, 40),
        tag: tag.toLowerCase(),
        selector: cssPath(el),
      };

      // Gradient text (background-clip:text) has no single colour to measure.
      if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') {
        out.unmeasurable.push({ ...info, reason: 'background-clip:text (gradient text)' });
        continue;
      }

      // ── background: composite the ancestor stack ──────────────────────────
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

      // ── foreground ────────────────────────────────────────────────────────
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
          ...info,
          probe: probe++,
          size,
          weight,
          large,
          need,
          ratio: +r.toFixed(2),
          fg: rgbStr(fg),
          bg: rgbStr(bg),
        });
      }
    }
    return out;
  };
}

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const failures = [];
const unmeasurable = [];
const lines = [];

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 700 ? 844 : 900 },
      deviceScaleFactor: 1,
    });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('asjTheme', t);
      } catch {
        /* storage disabled */
      }
    }, theme);
    const page = await ctx.newPage();
    await page.addInitScript(installScanner);

    for (const { path, session, waitFor, alsoWaitFor } of ROUTES) {
      if (session) {
        await page.addInitScript((v) => {
          try {
            localStorage.setItem('asj_auth', v);
          } catch {}
        }, authFor(session));
      }
      const where = `${path} ${theme} ${width}px`;
      let res;
      try {
        res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      } catch (e) {
        lines.push(`  ERROR  ${where}  navigation failed: ${e.message}`);
        failures.push({ route: where, text: '(navigation)', selector: '-', ratio: 0, need: 0, reason: e.message });
        continue;
      }
      if (res && res.status() !== 200) {
        lines.push(`  ERROR  ${where}  HTTP ${res.status()} — refusing to measure an error page`);
        failures.push({ route: where, text: '(http)', selector: '-', ratio: 0, need: 0, reason: `HTTP ${res.status()}` });
        continue;
      }
      // Let hydration + the async data settle.
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.waitForTimeout(1200);
      for (const sel of [waitFor, alsoWaitFor]) {
        if (!sel) continue;
        const found = await page
          .waitForSelector(sel, { timeout: 8000, state: 'attached' })
          .then(() => true)
          .catch(() => false);
        if (!found) {
          lines.push(`  NOTE  ${where}  "${sel}" never appeared — measuring what is there (coverage may be short)`);
        }
      }
      await page.waitForTimeout(600);

      const scan = await page.evaluate(() => window.__scan());
      for (const u of scan.unmeasurable) unmeasurable.push({ route: where, ...u });

      // ── pixel confirmation for every computed miss ────────────────────────
      const viewport = page.viewportSize();
      for (const f of scan.failures) {
        const row = { route: where, ...f };
        try {
          const handle = page.locator(`[data-contrast-probe="${f.probe}"]`).first();
          // An ANIMATING element (the marquee) never reaches a stable position,
          // so `scrollIntoViewIfNeeded` always times out on it. That is expected
          // and must not lose the reading: swallow it and sample where the
          // element currently is, which for a uniform band is the same pixel.
          await handle.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
          const box = await handle.boundingBox();
          // Clamp to the viewport: a marquee item mid-scroll has a NEGATIVE x,
          // and an unclamped clip either throws or captures off-screen.
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
            const pixelRatio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            row.pixel = +pixelRatio.toFixed(2);
            row.pixelBg = `rgb(${px.join(',')})`;
            row.confirmed = pixelRatio + 1e-9 < f.need;
          } else {
            row.confirmed = false;
            row.pixel = null;
            row.note = 'no on-screen box to sample';
          }
        } catch (e) {
          row.confirmed = false;
          row.pixel = null;
          row.note = `pixel probe failed: ${e.message.slice(0, 60)}`;
        }
        if (row.confirmed) {
          failures.push(row);
          lines.push(
            `  FAIL  ${where}  ${row.ratio}:1 (need ${row.need})  ${row.selector}  "${row.text}"  ` +
              `fg=${row.fg} bg=${row.bg} pixel=${row.pixelBg}`,
          );
        } else {
          lines.push(
            `  UNCONFIRMED  ${where}  computed ${row.ratio}:1 but pixel ${row.pixel ?? `n/a (${row.note || ''})`}:1 — ` +
              `${row.selector} "${row.text}" (model of the surface is wrong; NOT counted)`,
          );
        }
      }

      const fails = scan.failures.length;
      lines.push(
        `  ${fails ? '  ' : 'OK'}  ${where}  ${scan.elements} text element(s) measured, ` +
          `${fails} below the floor, ${scan.unmeasurable.length} unmeasurable`,
      );
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

console.log('WCAG 2.1 AA contrast — text over a flat, composite-resolved background');
console.log('(gradients, images, opacity<1, blend modes and gradient text are SKIPPED — see the header)');
console.log('');
console.log(lines.join('\n'));
console.log('');

const byReason = {};
for (const u of unmeasurable) {
  const key = u.reason.replace(/\(.*/, '').trim();
  byReason[key] = (byReason[key] || 0) + 1;
}
console.log(`measured elements below the floor: ${failures.length}`);
console.log(`unmeasurable (skipped, NOT a pass): ${unmeasurable.length}`);
for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

if (failures.length) {
  console.log('');
  console.log('FAILURES (each confirmed by a rendered-pixel sample, not by computation alone):');
  for (const f of failures) {
    console.log(
      `  ${f.route}  ${f.ratio}:1 (need ${f.need})  ${f.selector}  "${f.text}"  ${f.fg} on ${f.bg}`,
    );
  }
}

if (REPORT_ONLY) {
  console.log('\n--report-only: exiting 0 regardless (triage mode, NOT for CI)');
  process.exit(0);
}
process.exit(failures.length ? 1 : 0);
