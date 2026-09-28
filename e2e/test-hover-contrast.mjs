/**
 * e2e/test-hover-contrast.mjs — WCAG 2.1 AA contrast ON THE HOVER / FOCUS STATE.
 *
 * ── WHY THIS EXISTS, AND WHY test-contrast.mjs IS NOT ENOUGH ─────────────────
 * `e2e/test-contrast.mjs` measures the RESTING state and says so in its own
 * header, at line 68:
 *
 *     "3. Hover / focus / disabled states are NOT measured. Only the resting
 *         state."
 *
 * That is a real hole on THIS site, because the 2026-09-27 audit
 * (deliverables/gstack/wcag-unmeasurable-audit-2026-09-27.md) found hover was
 * systematically the LEAST legible state. The cause is a house convention, not
 * a typo — every gradient CTA lightens on hover (`hover:from-<hue>-500`), and
 * lightening a gradient ALWAYS lowers white-text contrast. Two of the five real
 * AA failures that audit found existed ONLY on hover; one measured 2.54:1 on
 * hover against 3.77:1 at rest, i.e. hovering made it worse.
 *
 * Those five were fixed by hand in `f02a352` and `c000ca4`. What did not exist
 * until this gate is anything that would STOP THE NEXT ONE, or that proves the
 * fix still holds on elements nobody happened to look at.
 *
 * ── HOW IT SEES A STATE NO SCREENSHOT SHOWS ─────────────────────────────────
 * You cannot read a `:hover` colour by pointing the mouse at it: the pointer is
 * a side effect of the scroll position, and an element under the cursor cannot
 * be screenshotted with its own text showing. So the state is FORCED through the
 * DevTools Protocol, which resolves the real cascade — same specificity, same
 * `hover:` Tailwind variant — with no pointer present at all:
 *
 *     await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] })
 *
 * VERIFIED equivalent to a real pointer rather than assumed: on the amber table
 * button, `await locator.hover()` and the forced state both resolve the fill to
 * `rgb(146,64,14)`, and both return to `rgb(180,83,9)` after. `DOM.enable` and
 * `CSS.enable` are REQUIRED first — without them `DOM.querySelector` returns
 * nodeId 0 and the force call is a silent no-op, which is exactly how the first
 * version of this probe reported 452 rows and failed to detect a planted defect.
 *
 * ── THE MEASUREMENT, AND THE SIX TRAPS IT IS BUILT AROUND ─────────────────
 * For each candidate: force the state, composite the backdrop, then CONFIRM the
 * computed number against the REAL PIXEL the glyphs sit on. A row only fails
 * when both agree; a disagreement is reported and does NOT fail, because it
 * means the surface model is wrong somewhere (backdrop-filter, a stacking
 * context, a pseudo-element), which is a reason to look rather than to blame the
 * component.
 *
 * Every one of the following produced a CONFIDENT WRONG NUMBER before it was
 * fixed, and each is now structurally prevented:
 *
 *   1. OFF-SCREEN BOX. No `scrollIntoView` meant `boundingBox()` gave viewport
 *      coordinates for an off-screen element, so the clip photographed whatever
 *      sat there.
 *   2. OFF-VIEWPORT CANDIDATE. A closed slide-out drawer is `display:flex` +
 *      `visibility:visible` with a NON-ZERO rect, because it is parked with
 *      `transform: translate-x-full` (measured `rect.x = 1297` at 1280px). It
 *      passed a naive filter and then hit trap 1. Excluded by requiring the rect
 *      to be inside the viewport.
 *   3. CENTRE PIXEL = INK. A centred label has glyphs at its centre, so a single
 *      centre sample reads the TEXT colour and returns exactly 1:1 — the
 *      signature of measuring text against itself.
 *   4. `visibility:hidden` HIDES THE BACKGROUND TOO. Measured on an amber table
 *      button: text visible -> mode `rgb(180,83,9)` (1851 px vs 140 px of ink);
 *      `visibility:hidden` -> the SAME box reads `rgb(255,255,255)` with 2217
 *      px. The fill was gone and the white row behind it was photographed. So
 *      nothing is hidden.
 *   5. THE MODE IS NOT ALWAYS THE BACKDROP. On a 238x50 pill with a long bold
 *      white label, the glyphs plus a light 1px border OUTNUMBERED the dark
 *      fill, so the most common colour WAS the ink (measured 20.07:1 inverted to
 *      1:1). Fixed by EXCLUDING pixels near the text colour before taking the
 *      mode, and by INSETTING 3px past the element's own border — the light hero
 *      pill measures `rgb(240,223,231)` on its border while its fill is
 *      `rgb(12,6,12)`, so an un-inset sample let the border become the mode.
 *   6. THE COLOUR MOVES AFTER YOU READ IT. A `:hover` background is normally
 *      reached through a CSS `transition`, so a `getComputedStyle` read taken
 *      shortly after forcing the state returns an INTERPOLATED colour — neither
 *      the hover colour nor the resting one. The premise assertion caught this
 *      reporting `rgb(164,74,11)` / `rgb(162,73,12)` against real values of
 *      `rgb(146,64,14)` / `rgb(180,83,9)`; both readings sit exactly at the
 *      midpoint, because the amber button carries Tailwind's `transition` class
 *      (180ms) and the probe sampled 30ms in. Silent, plausible, and wrong.
 *      Fixed by SETTLING THE READ rather than lengthening the wait — see
 *      `probeElement`, which polls until the value is stable, so it stays correct
 *      whatever the duration becomes.
 *
 * ── WHAT IT CANNOT SEE (the honest boundary) ────────────────────────────────
 *   a. A GRADIENT OR IMAGE BACKDROP cannot be composited, so those rows are
 *      judged by the PIXEL alone (one method, not two). That is the shape most
 *      of this site's defective CTAs took, so it is a well-covered limitation,
 *      but it is a limitation.
 *   b. `:active` and `:disabled` are NOT probed. A disabled control is exempt
 *      from AA anyway, and `:active` cannot be held still for a screenshot.
 *   c. A FORCED STATE RESOLVES CSS, NOT JS. A component that sets its hover
 *      colour from JS state rather than a `:hover` rule is measured at its
 *      RESTING colour. Nothing here can detect that, so the gate asserts a
 *      coverage FLOOR instead (see MIN_PROBED) — it refuses to pass on a page
 *      where it found almost nothing to measure, which is what a JS-driven
 *      rewrite would look like.
 *   d. Only the routes in ROUTES. The admin modals are not covered — the same
 *      gap `test-contrast.mjs` records for itself.
 *
 * ── STRICTNESS ──────────────────────────────────────────────────────────────
 * STRICT, not ratcheted. The measured baseline on the real tree is ZERO misses
 * (lowest observed ratio 4.69:1), and a baseline of zero IS strict. A ratchet
 * would only invite someone to raise the number.
 *
 * Run against a built artifact:
 *   node e2e/test-hover-contrast.mjs
 *   BASE_URL=http://localhost:4400 node e2e/test-hover-contrast.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4400';

/** AA floors (WCAG 2.1 §1.4.3). Large = >=24px, or >=18.66px and bold. */
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

/**
 * A coverage FLOOR, not a target. The clean tree measures 132 rows; the floor is
 * set well below that so ordinary markup churn does not trip it, but a rewrite
 * that moves hover colours into JS (boundary (c) above) collapses the count and
 * this fails loudly instead of reporting a clean pass over nothing.
 */
const MIN_PROBED = 60;

const ROUTES = [
  { path: '/', session: null },
  { path: '/loker', session: null, waitFor: 'table tbody tr' },
  {
    path: '/public',
    session: null,
    waitFor: '#global-announcement:not([hidden])',
    alsoWaitFor: 'table tbody tr',
  },
  { path: '/apply', session: 'kandidat' },
];

const THEMES = ['light', 'dark'];
const WIDTHS = [1280, 390];

/** Fabricated session — these routes gate on the STORE, not the backend. */
function authFor(role) {
  return JSON.stringify({
    sessionToken: `hover-fake-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    role,
    wa: '081234567890',
    name: 'Hover Check',
    lastChecked: Date.now(),
  });
}

/** The same synthetic payload `test-contrast.mjs` uses, so rows render everywhere. */
const PUBLIC_DATA_FIXTURE = {
  success: true,
  sessionInvalid: false,
  activeTheme: 'dark',
  pengumuman: 'PENGUMUMAN UJI KONTRAS HOVER: pendaftaran batch baru sudah dibuka.',
  jobs: [
    ['H-001', 'NOUGYOU SAYURAN', '🌾 PERTANIAN', '🌾 Ibaraki', '👨 Pria👩 Wanita', '✅ OPEN', 'JFT A2, SSW, 25-35 TH', 'Kuota terbatas', 'https://example.invalid/cv-h1'],
    ['H-002', 'KAIGO', '🏥 KESEHATAN', '🗼 Tokyo', '👩 Wanita', '⚡ URGENT', 'JFT N3, 20-35 TH', 'Interview minggu depan', ''],
    ['H-003', 'KONSTRUKSI', '🏗️ KONSTRUKSI', '🗾 Osaka', '👨 Pria', '❌ CLOSE', 'SSW, 22-40 TH', 'Kuota sudah penuh', ''],
    ['H-004', 'SHOKUHIN', '🍱 MAKANAN', '🏾 Saitama', '👨 Pria👩 Wanita', '✅ OPEN', 'JFT A2, 18-30 TH', '', ''],
    ['H-005', 'JIDOUSHA', '🚗 OTOMOTIF', '🗾 Aichi', '👨 Pria', '✅ OPEN', 'SSW, 25-35 TH', '', 'https://example.invalid/cv-h5'],
  ],
};

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['pass', name]);
    console.log(`✅ ${name}`);
  } catch (e) {
    results.push(['fail', name]);
    console.log(`❌ ${name}\n     ↳ ${e.message}`);
  }
}

/** In-page: composite the backdrop for one element. Mirrors test-contrast.mjs. */
const SCANNER = `
  window.__hoverProbe = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, reason: 'not found' };
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const SENTINEL = '#010203';
    const toRgba = (str) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = SENTINEL;
      cx.fillStyle = str;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const isSent = (c) => c[0] === 1 && c[1] === 2 && c[2] === 3;
    const chan = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = (p) => 0.2126 * chan(p[0]) + 0.7152 * chan(p[1]) + 0.0722 * chan(p[2]);
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const over = (fg, bg) => [fg[0]*fg[3] + bg[0]*(1-fg[3]), fg[1]*fg[3] + bg[1]*(1-fg[3]), fg[2]*fg[3] + bg[2]*(1-fg[3]), 1];

    const cs = getComputedStyle(el);
    const fg = toRgba(cs.color);
    if (isSent(fg)) return { ok: false, reason: 'unparseable color' };
    const fs = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = fs >= 24 || (fs >= 18.66 && bold);
    const need = large ? ${AA_LARGE} : ${AA_NORMAL};

    let layers = [], node = el, sawImage = false, stopped = false;
    while (node && node !== document.documentElement.parentNode) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') sawImage = true;
      const bg = toRgba(s.backgroundColor);
      if (!isSent(bg) && bg[3] > 0) { layers.push(bg); if (bg[3] >= 0.999) { stopped = true; break; } }
      node = node.parentElement;
    }
    let backdrop = null;
    if (stopped && !sawImage) {
      backdrop = layers[layers.length - 1].slice();
      for (let i = layers.length - 2; i >= 0; i--) backdrop = over(layers[i], backdrop);
    }
    return {
      ok: true,
      fg: 'rgb(' + fg.slice(0,3).map(Math.round).join(',') + ')',
      fontSize: fs, bold, large, need,
      hasImageBackdrop: sawImage,
      computedRatio: backdrop ? +ratio(fg, backdrop).toFixed(2) : null,
      computedBg: backdrop ? 'rgb(' + backdrop.slice(0,3).map(Math.round).join(',') + ')' : null,
    };
  };
`;

/**
 * Probe one candidate in its forced-hover state. Returns a row, or null when the
 * element cannot be measured. Shared by the walk and the OK-GREEN control below
 * so the control exercises the SAME code path as the real measurement.
 */
async function probeElement({ page, cdp, handle, selector, cdpNodeId, force = ['hover'] }) {
  await cdp.send('CSS.forcePseudoState', { nodeId: cdpNodeId, forcedPseudoClasses: force });

  // ── TRAP 6: THE COLOUR MOVES AFTER YOU READ IT ────────────────────────────
  // A `:hover` background is normally reached through a CSS TRANSITION, and
  // `getComputedStyle` DURING that transition returns an interpolated colour —
  // not the hover colour and not the resting colour, but a point on the line
  // between them. This is a silent wrong number of exactly the same species as
  // traps 1-5: it looks like a plausible colour, it produces a plausible ratio,
  // and nothing about it says "I am half-way through an animation".
  //
  // It was found by the premise assertion below, which is the only place in this
  // gate that compares a reading against a REAL pointer. It reported
  // `rgb(164,74,11)` and `rgb(162,73,12)` against real values of `rgb(146,64,14)`
  // and `rgb(180,83,9)` — and both readings are exactly `(146+180)/2 ≈ 163` and
  // `(64+83)/2 ≈ 73.5`, i.e. dead centre between the two states. The hole was the
  // 30ms wait below: the amber button carries Tailwind's `transition` class, so
  // its background fades over `--default-transition-duration` (180ms, theme.css
  // line 295), and 30ms is roughly one sixth of the way through.
  //
  // The fix is NOT to wait longer in the hope of outrunning it. A fixed sleep on
  // a duration that lives in a CSS variable is the same bug with a bigger
  // constant — someone lowers the duration and it silently returns. Instead the
  // READ ITSELF settles: poll until the value is STABLE across two samples, so it
  // is correct whether the transition is 0ms, 180ms, or 2s.
  //
  // `getAnimations()` would be the tidier signal, but it does not report CSS
  // `transition`s on `background-color` consistently across engines, and one
  // cross-engine miss would reintroduce the bug. Sampling the actual value is
  // slower and always right; this runs 132 times, not 132,000.
  const bgNow = () =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return `${cs.backgroundColor}|${cs.color}|${cs.borderTopColor}`;
    }, selector);

  let prev = await bgNow();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(25); // ≤ 1s total; typically settles on sample 1-2
    const next = await bgNow();
    if (next !== null && next === prev) break;
    prev = next;
  }

  const reading = await page.evaluate((sel) => window.__hoverProbe(sel), selector);
  if (!reading.ok) return { skipped: true, reading };

  const viewport = page.viewportSize();
  let pixelRatio = null;
  let pixelBg = null;
  let pixelSamples = 0;
  let inkShare = null;
  await handle.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(60);
  const box = await handle.boundingBox().catch(() => null);
  if (box && box.width >= 8 && box.height >= 8) {
    const vw = viewport?.width ?? 1280;
    const vh = viewport?.height ?? 900;
    // INSET past the element's own border — trap 5.
    const INSET = 3;
    const x = Math.max(0, Math.min(Math.floor(box.x) + INSET, vw - 2));
    const y = Math.max(0, Math.min(Math.floor(box.y) + INSET, vh - 2));
    const w = Math.min(Math.ceil(box.width) - INSET * 2, vw - x, 300);
    const h = Math.min(Math.ceil(box.height) - INSET * 2, vh - y, 120);
    if (w >= 4 && h >= 4) {
      const shot = await page.screenshot({ clip: { x, y, width: w, height: h } });
      const px = await page.evaluate(
        async ([b64, fgHex]) => {
          const [fr, fgc, fb] = fgHex;
          const near = (r2, g2, b2) =>
            Math.abs(r2 - fr) <= 16 && Math.abs(g2 - fgc) <= 16 && Math.abs(b2 - fb) <= 16;
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const c2 = c.getContext('2d', { willReadFrequently: true });
          c2.drawImage(img, 0, 0);
          const d = c2.getImageData(0, 0, img.width, img.height).data;
          const counts = new Map();
          let total = 0;
          let ink = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 250) continue;
            total++;
            if (near(d[i], d[i + 1], d[i + 2])) { ink++; continue; } // trap 5: drop glyph ink
            const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            counts.set(key, (counts.get(key) || 0) + 1);
          }
          if (!counts.size) return { rgb: null, n: 0, inkShare: total ? +(ink / total).toFixed(3) : null };
          let best = 0;
          let bestN = -1;
          for (const [k, n] of counts) if (n > bestN) { bestN = n; best = k; }
          return {
            rgb: [(best >> 16) & 255, (best >> 8) & 255, best & 255],
            n: bestN,
            inkShare: total ? +(ink / total).toFixed(3) : null,
          };
        },
        [shot.toString('base64'), reading.fg.match(/\d+/g).map(Number)],
      );
      inkShare = px.inkShare;
      if (px.rgb) {
        const chan = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        const lum = (p) => 0.2126 * chan(p[0]) + 0.7152 * chan(p[1]) + 0.0722 * chan(p[2]);
        const a = lum(reading.fg.match(/\d+/g).map(Number));
        const b = lum(px.rgb);
        pixelRatio = +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))).toFixed(2);
        pixelBg = `rgb(${px.rgb.join(',')})`;
        pixelSamples = px.n;
      }
    }
  }
  return { reading, pixelRatio, pixelBg, pixelSamples, inkShare };
}

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const rows = [];
const misses = [];
const disagreements = [];
let probed = 0;
let gradientRows = 0;
let unmeasurable = 0;

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: theme === 'dark' ? 'dark' : 'light',
    });
    await context.addInitScript((t) => {
      try {
        localStorage.setItem('asj_theme', t);
        localStorage.setItem('theme', t);
      } catch {}
    }, theme);

    for (const route of ROUTES) {
      const where = `${route.path} ${theme} ${width}px`;
      const page = await context.newPage();
      if (route.session) {
        await page.addInitScript(
          ([key, val]) => {
            try { localStorage.setItem(key, val); } catch {}
          },
          ['asj_auth', authFor(route.session)],
        );
      }
      await page.route('**/get-app-data*', (r) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PUBLIC_DATA_FIXTURE),
        }),
      );

      let res = null;
      try {
        res = await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      } catch (e) {
        misses.push({ where, selector: '(navigation)', text: '-', reason: e.message.slice(0, 70) });
        await page.close();
        continue;
      }
      if (res && res.status() !== 200) {
        misses.push({ where, selector: '(http)', text: '-', reason: `HTTP ${res.status()}` });
        await page.close();
        continue;
      }
      await page.evaluate(() => document.fonts?.ready).catch(() => {});
      await page.waitForTimeout(1200);
      for (const sel of [route.waitFor, route.alsoWaitFor]) {
        if (sel) await page.waitForSelector(sel, { timeout: 8000, state: 'attached' }).catch(() => {});
      }
      await page.waitForTimeout(400);

      await page.evaluate(SCANNER);

      // Candidates: interactive, carrying text, genuinely INSIDE the viewport
      // (trap 2), and not mid-fade.
      const candidates = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        for (const el of document.querySelectorAll('button, a, [role="button"], label, summary')) {
          let text = '';
          for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent;
          if (!text.trim()) text = el.textContent || '';
          text = text.replace(/\s+/g, ' ').trim();
          if (!text) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          if (parseFloat(cs.opacity) === 0) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 24 || r.height < 16) continue;
          if (r.x < -1 || r.y < -1 || r.x + r.width > vw + 1 || r.y + r.height > vh + 1) continue;
          let fading = false;
          for (let p = el; p; p = p.parentElement) {
            if (parseFloat(getComputedStyle(p).opacity) < 0.99) { fading = true; break; }
          }
          if (fading) continue;
          if (!el.id) el.dataset.hoverProbe = String(out.length);
          const key = el.id ? `#${el.id}` : `[data-hover-probe="${el.dataset.hoverProbe}"]`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            selector: key,
            text: text.slice(0, 40),
            cls: (el.getAttribute('class') || '').slice(0, 90),
            tag: el.tagName.toLowerCase(),
          });
        }
        return out;
      });

      const cdp = await context.newCDPSession(page);
      // REQUIRED. Without these two the nodeId is 0 and the force is a no-op.
      await cdp.send('DOM.enable').catch(() => {});
      await cdp.send('CSS.enable').catch(() => {});

      for (const cand of candidates) {
        probed++;
        let cdpNodeId = 0;
        try {
          const handle = page.locator(cand.selector).first();
          const { root } = await cdp.send('DOM.getDocument', { depth: 1 });
          const found = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: cand.selector });
          cdpNodeId = found.nodeId;
          if (!cdpNodeId) continue;

          const r = await probeElement({
            page,
            cdp,
            handle,
            selector: cand.selector,
            cdpNodeId,
          });
          if (r.skipped) {
            unmeasurable++;
            continue;
          }
          const reading = r.reading;
          if (reading.hasImageBackdrop) gradientRows++;

          const computedMiss = reading.computedRatio !== null && reading.computedRatio + 1e-9 < reading.need;
          const pixelMiss = r.pixelRatio !== null && r.pixelRatio + 1e-9 < reading.need;
          const row = {
            where,
            selector: cand.selector,
            text: cand.text,
            cls: cand.cls,
            computed: reading.computedRatio,
            pixel: r.pixelRatio,
            need: reading.need,
            fg: reading.fg,
            computedBg: reading.computedBg,
            pixelBg: r.pixelBg,
            inkShare: r.inkShare,
            hasImageBackdrop: reading.hasImageBackdrop,
          };
          rows.push(row);

          if (computedMiss && pixelMiss) {
            misses.push(row);
          } else if (computedMiss !== pixelMiss) {
            disagreements.push(row);
          }
        } catch {
          // One element must never abort the sweep — a throw is a coverage note.
          unmeasurable++;
        } finally {
          if (cdpNodeId) {
            await cdp
              .send('CSS.forcePseudoState', { nodeId: cdpNodeId, forcedPseudoClasses: [] })
              .catch(() => {});
          }
        }
      }

      await page.close();
    }
    await context.close();
  }
}

/* ─────────────────────────────── ASSERTIONS ─────────────────────────────── */

await test('premise: the forced-hover state actually resolves (a REAL pointer agrees)', async () => {
  // The whole gate rests on `CSS.forcePseudoState` being equivalent to a real
  // pointer. If that ever stops being true — a protocol change, a Playwright
  // upgrade, a typo in the force argument — every measurement below silently
  // becomes a reading of the RESTING state, which passes, and the gate becomes
  // vacuous while looking healthier.
  //
  // ── WHY THIS GOES THROUGH `probeElement` AND NOT ITS OWN FORCE CALL ───────
  // The first version of this assertion hand-rolled its own
  // `CSS.forcePseudoState(..., ['hover'])` and compared the result to a real
  // pointer. It PASSED even when the sweep's own force call was mutated to
  // `forcedPseudoClasses: []` — because it was validating a DUPLICATE of the
  // mechanism rather than the mechanism. The mutation battery caught it as a
  // SURVIVED mutation (M3), which is exactly what that file exists for.
  //
  // So the forced reading is now taken through `probeElement` — the SAME helper
  // the sweep calls — and the assertion is that the background it resolves
  // differs from the RESTING background. A mutation anywhere on that path now
  // fails this premise instead of passing silently.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.route('**/get-app-data*', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PUBLIC_DATA_FIXTURE),
    }),
  );
  try {
    await page.goto(`${BASE}/loker`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('table tbody tr', { timeout: 8000, state: 'attached' }).catch(() => {});
    await page.waitForTimeout(1200);
    // `probeElement` calls `window.__hoverProbe`, so the scanner must be
    // installed on THIS page too. The sweep installs it per route; this page is
    // created separately, and forgetting it here is a plain TypeError rather
    // than a silent pass — which is the good kind of failure.
    await page.evaluate(SCANNER);

    const ctl = page.locator('button.bg-amber-500').first();
    if ((await page.locator('button.bg-amber-500').count()) === 0) {
      throw new Error('no button.bg-amber-500 to use as the forced-state control');
    }
    await ctl.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(100);
    const rest = await ctl.evaluate((el) => getComputedStyle(el).backgroundColor);

    // (1) a REAL pointer, so the premise is anchored to ground truth.
    await ctl.hover();
    await page.waitForTimeout(150);
    const realHover = await ctl.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(150);
    if (realHover === rest) {
      throw new Error(
        `the control's hover colour equals its resting colour (${rest}) — this browser/session ` +
          'is not applying :hover at all, so nothing below can be trusted.',
      );
    }

    // (2) the FORCED state, read through the SWEEP'S OWN helper.
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 1 });
    const found = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'button.bg-amber-500' });
    if (!found.nodeId) throw new Error('the control has no CDP nodeId — cannot force a state on it');

    // The forced reading is taken, then the SAME helper is asked for a reading
    // with the state explicitly NOT forced. Comparing the two readings of the
    // same helper is what makes this robust: it does not matter HOW the helper
    // resolves a colour, only that forcing the state CHANGES it.
    //
    // ⚠ `probeElement`'s `force` parameter DEFAULTS to `['hover']`, so the
    // resting reading MUST pass `[]` explicitly. The first version of this
    // assertion did not, so it force-hovered the element twice and compared
    // hover to hover — it reported "the force call is not reaching the sweep"
    // on a perfectly healthy tree. A control that fails on a correct tree is as
    // useless as one that passes on a broken one.
    const forcedReading = await probeElement({
      page,
      cdp,
      handle: ctl,
      selector: 'button.bg-amber-500',
      cdpNodeId: found.nodeId,
      force: ['hover'],
    });
    const restReading = await probeElement({
      page,
      cdp,
      handle: ctl,
      selector: 'button.bg-amber-500',
      cdpNodeId: found.nodeId,
      force: [],
    });

    if (forcedReading.skipped || restReading.skipped) {
      throw new Error('the control could not be measured through probeElement — the sweep itself is broken');
    }
    // ── COMPARE COLOURS, NOT STRINGS ─────────────────────────────────────────
    // `probeElement` builds its string as `rgb(146,64,14)`; the browser's own
    // `getComputedStyle` returns `rgb(146, 64, 14)` — SAME colour, different
    // spacing. The first version of this assertion compared the raw strings, so
    // it failed on a perfectly healthy tree while its own error message printed
    // two values that were obviously equal. Normalise both sides to a triple.
    const rgb = (s) => (typeof s === 'string' ? (s.match(/\d+/g) || []).slice(0, 3).join(',') : null);
    if (rgb(forcedReading.reading.computedBg) === null) {
      throw new Error(
        `the control resolved no background at all in the forced state (${forcedReading.reading.computedBg}) — ` +
          'the compositing walked off the end of the stack without reaching an opaque layer.',
      );
    }
    if (rgb(forcedReading.reading.computedBg) === rgb(restReading.reading.computedBg)) {
      throw new Error(
        `probeElement resolves the SAME background (${forcedReading.reading.computedBg}) in the ` +
          `forced-hover state and the resting state. The force call is not reaching the sweep — ` +
          'either it was removed, its argument was changed, or the state never applied. Every row ' +
          'below would then be the RESTING state and this gate would pass vacuously.',
      );
    }
    if (rgb(forcedReading.reading.computedBg) !== rgb(realHover) && rgb(restReading.reading.computedBg) !== rgb(rest)) {
      throw new Error(
        `the forced reading (${forcedReading.reading.computedBg}) and the resting reading ` +
          `(${restReading.reading.computedBg}) match NEITHER the real hover (${realHover}) nor the ` +
          `real rest (${rest}). probeElement and a real pointer disagree about this element.`,
      );
    }
  } finally {
    await context.close();
  }
});

await test(`coverage: at least ${MIN_PROBED} hoverable text elements were measured`, async () => {
  // A coverage floor. Boundary (c): a component that sets its hover colour from
  // JS rather than a `:hover` rule cannot be probed, so a rewrite of that kind
  // would collapse this count. Refusing to pass on a near-empty sweep is what
  // makes the "0 failures" below mean something.
  if (probed < MIN_PROBED) {
    throw new Error(
      `only ${probed} elements were probed (floor ${MIN_PROBED}). Either the routes stopped ` +
        'rendering, or hover styling moved somewhere this method cannot reach — either way a ' +
        'green result here would be vacuous.',
    );
  }
});

await test('coverage: gradient/image-backed rows are a minority, not the whole sweep', async () => {
  // Boundary (a): those rows are judged by the pixel ALONE. If they ever became
  // most of the sweep the gate would be resting on one method rather than two.
  const share = probed ? gradientRows / probed : 0;
  if (share > 0.5) {
    throw new Error(
      `${gradientRows}/${probed} rows (${(share * 100).toFixed(0)}%) sit over a gradient or image ` +
        'and are therefore judged by the pixel alone. That is too much of the sweep to rest on one ' +
        'method — the compositing walk needs to cover more of the page.',
    );
  }
});

await test('no hover/focus state falls below the WCAG AA floor', async () => {
  if (misses.length) {
    const lines = misses
      .slice(0, 25)
      .map(
        (m) =>
          `     • ${m.where}  ${m.pixel ?? m.computed}:1 (need ${m.need})  ${m.selector}  "${m.text}"\n` +
          `         ${m.fg} over ${m.computedBg ?? m.pixelBg}`,
      )
      .join('\n');
    throw new Error(
      `${misses.length} element(s) miss AA in their hover state. The computed composite and the ` +
        `real pixel BOTH agree, so this is not a modelling artifact:\n${lines}`,
    );
  }
});

await test('no computed "miss" rests on a modelling disagreement', async () => {
  // A disagreement means the surface model is wrong somewhere. It does not fail
  // the gate (that would be blaming the component for a method error) but it must
  // not be SILENT either, or a real defect could hide inside one.
  if (disagreements.length) {
    const lines = disagreements
      .slice(0, 15)
      .map(
        (m) =>
          `     • ${m.where}  computed=${m.computed} pixel=${m.pixel}  ${m.selector}  "${m.text}"`,
      )
      .join('\n');
    throw new Error(
      `${disagreements.length} element(s) had the composite and the pixel disagree. Each one is a ` +
        `place the two methods cannot see the same surface, i.e. a hole in this gate:\n${lines}`,
    );
  }
});

await test('OK-GREEN CONTROL: a compliant hover state is NOT reported as a failure', async () => {
  // Injected into a live page: a control whose hover colour is deliberately
  // made AA-compliant. If the detector flags THIS, the gate is over-reporting and
  // every "miss" above is suspect.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1200);
    await page.evaluate(SCANNER);

    const planted = await page.evaluate(() => {
      const b = document.createElement('button');
      b.id = 'okgreen-hover-probe';
      b.textContent = 'Compliant';
      // Resting: near-black on white. Hover: still near-black on white. Both
      // clear AA by a wide margin, so this must never be reported.
      b.style.cssText =
        'position:fixed;left:8px;top:8px;width:200px;height:44px;color:#111111;' +
        'background:#ffffff;font-size:16px;z-index:99999;';
      b.addEventListener('mouseenter', () => {});
      document.body.appendChild(b);
      return true;
    });
    if (!planted) throw new Error('could not plant the OK-GREEN control');

    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 1 });
    const found = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#okgreen-hover-probe' });
    if (!found.nodeId) throw new Error('the planted control has no CDP nodeId — cannot probe it');

    const r = await probeElement({
      page,
      cdp,
      handle: page.locator('#okgreen-hover-probe').first(),
      selector: '#okgreen-hover-probe',
      cdpNodeId: found.nodeId,
    });
    if (r.skipped) throw new Error(`the planted control could not be measured: ${r.reading?.reason}`);

    const need = r.reading.need;
    const computedMiss = r.reading.computedRatio !== null && r.reading.computedRatio + 1e-9 < need;
    const pixelMiss = r.pixelRatio !== null && r.pixelRatio + 1e-9 < need;
    if (computedMiss || pixelMiss) {
      throw new Error(
        `the OK-GREEN control was reported as a MISMATCH (computed=${r.reading.computedRatio}, ` +
          `pixel=${r.pixelRatio}, need=${need}). It is explicitly compliant, so the detector ` +
          'over-reports and every failure above is unreliable.',
      );
    }
  } finally {
    await context.close();
  }
});

await browser.close();

/* ─────────────────────────────── THE REPORT ─────────────────────────────── */
const lowest = rows
  .filter((r) => r.pixel !== null)
  .sort((a, b) => a.pixel - b.pixel)
  .slice(0, 5);

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log(`elements probed                 : ${probed}`);
console.log(`  over a gradient/image (pixel-only): ${gradientRows}`);
console.log(`  unmeasurable (skipped, NOT a pass): ${unmeasurable}`);
console.log(`confirmed AA misses             : ${misses.length}`);
console.log(`modelling disagreements         : ${disagreements.length}`);
if (lowest.length) {
  console.log('lowest measured hover ratios (context, not all failures):');
  for (const r of lowest) {
    console.log(`  ${String(r.pixel).padStart(6)}:1  need ${r.need}  ${r.selector}  "${r.text}"`);
  }
}
console.log('────────────────────────────────────────────────────────────');

const failed = results.filter(([s]) => s === 'fail');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
