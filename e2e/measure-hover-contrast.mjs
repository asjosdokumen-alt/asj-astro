/**
 * measure-hover-contrast.mjs — an EVIDENCE tool, NOT a gate.
 *
 * WHY THIS EXISTS
 *   `e2e/test-contrast.mjs` measures every visible text element in BOTH themes
 *   and its own header states the boundary plainly, at line 68:
 *
 *       "3. Hover / focus / disabled states are NOT measured. Only the resting
 *           state."
 *
 *   That boundary mattered, because the 2026-09-27 audit
 *   (deliverables/gstack/wcag-unmeasurable-audit-2026-09-27.md) found that on
 *   this site the HOVER state was systematically the LEAST legible one. Its
 *   root cause is a house convention, not a typo: every gradient CTA lightens on
 *   hover (`hover:from-<hue>-500`) and lightening a gradient always lowers
 *   white-text contrast. Two of the five real AA failures that audit reported
 *   existed ONLY on hover — one of them measured 2.54:1 against a resting
 *   3.77:1, i.e. hovering made it worse.
 *
 *   Those were fixed by hand (`c000ca4`). What did NOT exist until now is a way
 *   to (a) confirm the fix holds everywhere rather than only on the five
 *   elements someone happened to look at, and (b) catch the NEXT one. This tool
 *   is step (a). The gate built from its findings is `test-hover-contrast.mjs`.
 *
 * ── HOW IT SEES A STATE NO SCREENSHOT SHOWS ─────────────────────────────────
 *   You cannot read a `:hover` colour by hovering with the mouse and taking a
 *   screenshot: the mouse position is a side effect of the scroll position, and
 *   a hovered element under the cursor cannot be screenshotted with its own
 *   text visible.
 *
 *   So this tool uses the DevTools Protocol to FORCE the state on a node
 *   without a pointer being there at all:
 *
 *       const cdp = await context.newCDPSession(page);
 *       await cdp.send('CSS.forcePseudoState', {
 *         nodeId, forcedPseudoClasses: ['hover'],   // or ['focus-visible']
 *       });
 *
 *   The styles engine then resolves `:hover` for real — the same cascade, the
 *   same specificity, the same `hover:` Tailwind variant — with no synthetic
 *   mouse, no scroll dependency, and the element exactly where it was. The
 *   forced state is cleared before the next element so states cannot leak.
 *
 * ── THE MEASUREMENT, IN THREE STEPS ─────────────────────────────────────────
 *   1. RENDER. Force the state. Read the element's computed `color`.
 *   2. COMPUTE. Walk the ancestor chain collecting background layers, including
 *      alpha<1 ones, stopping at the first opaque layer, and alpha-composite
 *      them in paint order. This mirrors test-contrast.mjs deliberately: a
 *      method that skips translucent surfaces does not under-report, it can
 *      INVENT a failure (its header documents exactly that, at line 28).
 *   3. CONFIRM. Hide the text (`visibility:hidden`, layout kept), screenshot the
 *      element's box, and read the pixel that was behind the glyphs. A computed
 *      miss is only reported as a FAIL when the REAL PIXEL agrees. When they
 *      disagree the row is printed UNCONFIRMED and does not fail — a
 *      disagreement means the model of the surface is wrong somewhere
 *      (backdrop-filter, a stacking context, a pseudo-element), which is a
 *      reason to look rather than a reason to blame the component.
 *
 * ── WHAT THIS TOOL CANNOT SEE (the honest boundary) ─────────────────────────
 *   1. TEXT OVER A GRADIENT OR IMAGE IS SAMPLED, NOT COMPUTED. The compositing
 *      walk bails on `background-image`, so for those elements the step-2 number
 *      is unavailable and the step-3 PIXEL is the only reading. That is the
 *      opposite of undetectable here — a gradient CTA is precisely the shape the
 *      audit's five findings took — but it does mean a gradient element's
 *      verdict rests on one pixel rather than on two agreeing methods.
 *   2. `:active` and `:disabled` are NOT probed. Disabled controls are a
 *      separate question (a disabled control is exempt from AA) and `:active`
 *      cannot be held still long enough to screenshot reliably.
 *   3. Only the routes listed in ROUTES. The admin modals are not covered, the
 *      same gap test-contrast.mjs records for itself.
 *   4. A FORCED STATE IS NOT A REAL POINTER. `CSS.forcePseudoState` resolves the
 *      stylesheet, but it does NOT run JS `mouseenter` handlers. A component
 *      that sets its hover colour from JS state rather than a CSS `:hover` rule
 *      would be measured in its RESTING colour and could hide a defect. The
 *      `jsDriven` counter below reports how many forced elements had no CSS
 *      `:hover` rule to apply, so that blind spot is counted rather than
 *      assumed empty.
 *
 * Run against a built artifact served by the repo's own server:
 *   node .tmp-serve-dist.mjs &            # or node server.cjs
 *   node e2e/measure-hover-contrast.mjs
 *   BASE_URL=http://localhost:4400 node e2e/measure-hover-contrast.mjs
 *
 * Flags:
 *   --report-only   print everything, exit 0 (this tool always exits 0 anyway)
 *   --json          dump the raw rows
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';

/** AA floors. Large = >=24px, or >=18.66px and bold (WCAG 2.1 §1.4.3). */
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

/**
 * The routes worth probing. Kept to the shapes that HAVE gradient/hover CTAs:
 * the landing page (its closing band), `/loker` (the row action buttons),
 * `/apply` (the sticky CTA and the submit) and `/public`.
 */
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

/** The same synthetic payload test-contrast.mjs uses, so rows render hermetically. */
const PUBLIC_DATA_FIXTURE = {
  success: true,
  sessionInvalid: false,
  activeTheme: 'dark',
  pengumuman: 'PENGUMUMAN UJI KONTRAS HOVER: pendaftaran batch baru sudah dibuka.',
  jobs: [
    ['H-001', 'NOUGYOU SAYURAN', '🌾 PERTANIAN', '🌾 Ibaraki', '👨 Pria👩 Wanita', '✅ OPEN', 'JFT A2, SSW, 25-35 TH', 'Kuota terbatas', 'https://example.invalid/cv-h1'],
    ['H-002', 'KAIGO', '🏥 KESEHATAN', '🗼 Tokyo', '👩 Wanita', '⚡ URGENT', 'JFT N3, 20-35 TH', 'Interview minggu depan', ''],
    ['H-003', 'KONSTRUKSI', '🏗️ KONSTRUKSI', '🗾 Osaka', '👨 Pria', '❌ CLOSE', 'SSW, 22-40 TH', 'Kuota sudah penuh', ''],
    ['H-004', 'SHOKUHIN', '🍱 MAKANAN', '🗾 Saitama', '👨 Pria👩 Wanita', '✅ OPEN', 'JFT A2, 18-30 TH', '', ''],
    ['H-005', 'JIDOUSHA', '🚗 OTOMOTIF', '🗾 Aichi', '👨 Pria', '✅ OPEN', 'SSW, 25-35 TH', '', 'https://example.invalid/cv-h5'],
  ],
};

/* ───────────────────────── the in-page scanner ───────────────────────── */
/**
 * Installed once per page. Given the selector of the element to probe, it
 * composites the backdrop and returns the computed reading. Kept as a string
 * function installed via `page.addInitScript` is not possible here because it
 * needs the forced state to already be applied — so it is a normal
 * `page.evaluate` body, defined once and referenced by name.
 */
function scannerSource() {
  return `
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

    // Walk ancestors, compositing backgrounds. Stop at the first OPAQUE layer.
    let layers = [];
    let node = el;
    let sawImage = false;
    let stopped = false;
    while (node && node !== document.documentElement.parentNode) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') sawImage = true;
      const bg = toRgba(s.backgroundColor);
      if (!isSent(bg) && bg[3] > 0) {
        layers.push(bg);
        if (bg[3] >= 0.999) { stopped = true; break; }
      }
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
      fontSize: fs,
      bold,
      large,
      need,
      hasImageBackdrop: sawImage,
      opaqueFound: stopped,
      computedRatio: backdrop ? +ratio(fg, backdrop).toFixed(2) : null,
      computedBg: backdrop ? 'rgb(' + backdrop.slice(0,3).map(Math.round).join(',') + ')' : null,
    };
  };
  `;
}

/* ───────────────────────────── the runner ───────────────────────────── */
const rows = [];
const failures = [];
const unconfirmed = [];
const stats = { probed: 0, unmeasurable: 0, gradients: 0 };

function log(s) {
  process.stdout.write(`${s}\n`);
}

const browser = await chromium.launch({
  // This sandbox exports HTTP_PROXY; a loopback request would be sent to the
  // proxy and answered 502, which looks exactly like "no server is up".
  args: ['--no-proxy-server'],
});

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: theme === 'dark' ? 'dark' : 'light',
    });

    // The theme is stored, not inferred from the media query, for most pages.
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

      // Serve the data-driven parts from the fixture so rows/marquee render
      // everywhere (mirrors test-contrast.mjs).
      await page.route('**/get-app-data*', (r) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PUBLIC_DATA_FIXTURE),
        }),
      );

      try {
        const res = await page.goto(BASE + route.path, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        if (res && res.status() !== 200) {
          log(`  ERROR  ${where}  HTTP ${res.status()}`);
          await page.close();
          continue;
        }
        await page.evaluate(() => document.fonts?.ready).catch(() => {});
        await page.waitForTimeout(1200);
        for (const sel of [route.waitFor, route.alsoWaitFor]) {
          if (sel) await page.waitForSelector(sel, { timeout: 8000, state: 'attached' }).catch(() => {});
        }
        await page.waitForTimeout(400);
      } catch (e) {
        log(`  ERROR  ${where}  ${e.message.slice(0, 80)}`);
        await page.close();
        continue;
      }

      await page.evaluate(scannerSource());

      // ── Collect candidate interactive elements ──────────────────────────
      // An element is a candidate when it carries text AND is something a user
      // can point at: a button, a link, or a role=button/label/summary.
      //
      // ── THE OFF-SCREEN TRAP (this cost a full debug cycle) ──────────────
      // A closed slide-out drawer is `display:flex` + `visibility:visible` with
      // a NON-ZERO `getBoundingClientRect()`, because it is parked with
      // `transform: translate-x-full` — measured `rect.x = 1297` on a 1280px
      // viewport. A naive filter accepts it, and then the pixel probe clamps the
      // clip to `x=0` and photographs the TOP-LEFT OF THE PAGE, reporting
      // `rgb(255,255,255)` as the backdrop of a solid red button. Every one of
      // the 1:1 ratios in the first two runs was this bug.
      //
      // So a candidate must ALSO be genuinely inside the viewport, and must not
      // be mid-fade (a translucent element gives a ratio that depends on
      // animation phase, which is not a contrast property).
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
          // Inside the viewport — see the trap above.
          if (r.x < -1 || r.y < -1 || r.x + r.width > vw + 1 || r.y + r.height > vh + 1) continue;
          // Not mid-fade.
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
      // Enable the two CDP domains `CSS.forcePseudoState` needs. WITHOUT
      // `DOM.enable` + `CSS.enable` the nodeId is 0 and the force call is a
      // silent no-op — which is how the first version of this tool produced 452
      // UNCONFIRMED rows and no rows at all: every probe threw on a nodeId of 0.
      await cdp.send('DOM.enable').catch(() => {});
      await cdp.send('CSS.enable').catch(() => {});

      for (const cand of candidates) {
        stats.probed++;
        let cdpNodeId = 0;
        try {
          const handle = page.locator(cand.selector).first();
          // Get the CDP nodeId ONCE, from a backend node id resolved off the
          // element handle. `DOM.querySelector` needs the selector to still
          // match after we may have set dataset attributes, and it re-queries a
          // document that has since re-rendered — resolving from the handle is
          // the stable path.
          const elHandle = await handle.elementHandle();
          if (!elHandle) continue;
          const { root } = await cdp.send('DOM.getDocument', { depth: 1 });
          const found = await cdp.send('DOM.querySelector', {
            nodeId: root.nodeId,
            selector: cand.selector,
          });
          cdpNodeId = found.nodeId;
          if (!cdpNodeId) continue;

          await cdp.send('CSS.forcePseudoState', { nodeId: cdpNodeId, forcedPseudoClasses: ['hover'] });
          await page.waitForTimeout(30);

          const reading = await page.evaluate((sel) => window.__hoverProbe(sel), cand.selector);
          if (!reading.ok) {
            stats.unmeasurable++;
            continue;
          }
          if (reading.hasImageBackdrop) stats.gradients++;

          // ── pixel confirmation ─────────────────────────────────────────
          // FIVE BUGS LIVED HERE and each produced a confident wrong number, so
          // the method is spelled out rather than left to the reader:
          //
          //  (a) NO scrollIntoView meant `boundingBox()` returned viewport
          //      coordinates for an element that was OFF-SCREEN, so the clip
          //      grabbed whatever sat at those coordinates.
          //  (b) THE CANDIDATE FILTER accepted an off-viewport drawer button
          //      parked at `transform: translate-x-full` (`rect.x = 1297` on a
          //      1280px viewport), which then hit bug (a). Fixed by requiring the
          //      rect to be inside the viewport.
          //  (c) SAMPLING THE EXACT CENTRE lands on a glyph — a button with a
          //      centred label has ink at its centre, so the "backdrop" pixel was
          //      the TEXT colour and the ratio came back exactly 1:1.
          //  (d) `visibility:hidden` does NOT hide only the text — it hides the
          //      element's OWN BACKGROUND too. Measured on an amber table button:
          //      text visible -> mode `rgb(180,83,9)` (1851 px vs 140 px of ink);
          //      text hidden -> the SAME box reads `rgb(255,255,255)` with
          //      2217 px, i.e. the fill was gone and the white row behind it was
          //      photographed. Every solid button reported a 1:1 "failure".
          //  (e) THE MODE IS NOT ALWAYS THE BACKDROP. After (c) and (d) were
          //      fixed the hero CTA still read 1:1, and a dumped pixel grid
          //      showed why: on a 238x50 pill with the bold white label
          //      "Daftar sebagai Pelamar", the pure-white GLYPHS plus the light
          //      1px border together OUTNUMBERED the dark fill, so the most
          //      common colour WAS the ink. The "a label's glyphs are a small
          //      minority" assumption holds for a tall button and fails for a
          //      wide, short one with a long bold label.
          //
          // The fix for (e) is to EXCLUDE the ink before taking the mode: any
          // pixel within a small distance of the text colour is dropped, then
          // the most common colour of what REMAINS is the surface the text sits
          // on. That is sound because a backdrop is, by definition, not the text
          // colour — and it needs no assumption about glyph coverage at all.
          // `inkShare` is still reported so a row where the ink dominated the
          // box is visible in the output rather than hidden by the filter.
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
            // INSET BY 3px. A control's own 1px border is often a flat, uniform
            // colour — the light hero pill measures rgb(240,223,231) on its
            // border while its fill is rgb(12,6,12). Sampling the full box let
            // the border become the mode and reported 1.28:1 for a perfectly
            // legible button. Insetting past the border (and any focus ring)
            // leaves the FILL, which is the surface the text actually sits on.
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
                    if (d[i + 3] < 250) continue; // skip antialiased edges
                    total++;
                    if (near(d[i], d[i + 1], d[i + 2])) { ink++; continue; } // skip glyph ink
                    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
                    counts.set(key, (counts.get(key) || 0) + 1);
                  }
                  if (!counts.size) return { rgb: null, n: 0, inkShare: total ? +(ink / total).toFixed(3) : null, empty: true };
                  let best = 0;
                  let bestN = -1;
                  for (const [k, n] of counts) {
                    if (n > bestN) {
                      bestN = n;
                      best = k;
                    }
                  }
                  return {
                    rgb: [(best >> 16) & 255, (best >> 8) & 255, best & 255],
                    n: bestN,
                    inkShare: total ? +(ink / total).toFixed(3) : null,
                    empty: false,
                  };
                },
                [shot.toString('base64'), reading.fg.match(/\d+/g).map(Number)],
              );
              inkShare = px.inkShare;
              if (px.rgb) {
                const chan = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
                const lum = (p) => 0.2126 * chan(p[0]) + 0.7152 * chan(p[1]) + 0.0722 * chan(p[2]);
                const fgPx = reading.fg.match(/\d+/g).map(Number);
                const a = lum(fgPx);
                const b = lum(px.rgb);
                pixelRatio = +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))).toFixed(2);
                pixelBg = `rgb(${px.rgb.join(',')})`;
                pixelSamples = px.n;
              }
            }
          }

          const computedMiss = reading.computedRatio !== null && reading.computedRatio + 1e-9 < reading.need;
          const pixelMiss = pixelRatio !== null && pixelRatio + 1e-9 < reading.need;
          const row = {
            where,
            selector: cand.selector,
            text: cand.text,
            cls: cand.cls,
            computed: reading.computedRatio,
            pixel: pixelRatio,
            pixelSamples,
            inkShare,
            need: reading.need,
            fg: reading.fg,
            computedBg: reading.computedBg,
            pixelBg,
            hasImageBackdrop: reading.hasImageBackdrop,
          };
          rows.push(row);

          if (computedMiss && pixelMiss) {
            failures.push({ ...row, verdict: 'FAIL' });
            log(
              `  FAIL  ${where}  hover  ${pixelRatio}:1 (need ${reading.need})  ` +
                `${cand.selector}  "${cand.text}"  ${reading.fg} over ${pixelBg}`,
            );
          } else if (computedMiss !== pixelMiss) {
            unconfirmed.push({ ...row, verdict: 'UNCONFIRMED' });
            log(
              `  DIFF  ${where}  hover  computed=${reading.computedRatio} pixel=${pixelRatio}  ` +
                `${cand.selector}  "${cand.text}"`,
            );
          }
        } catch (e) {
          // A single element must never abort the sweep.
          unconfirmed.push({ where, selector: cand.selector, text: cand.text, note: e.message.slice(0, 80) });
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

await browser.close();

/* ───────────────────────────── the report ───────────────────────────── */
log('');
log('════════════════════════════════════════════════════════════════');
log('HOVER / FOCUS CONTRAST — measured, forced-state sweep');
log('════════════════════════════════════════════════════════════════');
log(`elements probed        : ${stats.probed}`);
log(`  over a gradient/image: ${stats.gradients}  (pixel reading only — the walk bails)`);
log(`unmeasurable           : ${stats.unmeasurable}`);
log(`CONFIRMED failures     : ${failures.length}`);
log(`unconfirmed (computed and pixel disagree): ${unconfirmed.length}`);
log('');

if (failures.length) {
  log('FAILURES — both the composite and the real pixel agree the text misses AA:');
  for (const f of failures) {
    log(`  • ${f.where}  ${f.pixel}:1 (need ${f.need})  ${f.selector}`);
    log(`      "${f.text}"`);
    log(`      ${f.cls}`);
    log(`      ${f.fg} over ${f.pixelBg}`);
  }
  log('');
}

const worst = rows
  .filter((r) => r.pixel !== null)
  .sort((a, b) => a.pixel - b.pixel)
  .slice(0, 12);
if (worst.length) {
  log('LOWEST 12 measured ratios in the forced-hover state (context, not all failures):');
  for (const r of worst) {
    log(`  ${String(r.pixel).padStart(6)}:1  need ${r.need}  ${r.selector}`);
  }
}

if (process.argv.includes('--json')) {
  writeFileSync('.tmp-hover-contrast.json', JSON.stringify({ rows, failures, unconfirmed }, null, 2));
  log('');
  log('raw rows written to .tmp-hover-contrast.json');
}

// This is an evidence tool: it reports, it does not gate.
process.exit(0);
