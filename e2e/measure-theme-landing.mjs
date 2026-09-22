/**
 * measure-theme-landing.mjs — prove the light "sakura" default is REAL in the
 * rendered page, not merely declared in a CSS file.
 *
 * WHY THIS TOOL EXISTS. The theme default lives in four places (a store, its
 * `decode`, BaseLayout's inline restore script, and the banner follow-along).
 * Three of them can be correct while the page still paints dark, because the
 * inline script wins the race to first paint. Reading theme.css proves nothing
 * about which of them actually ran.
 *
 * ── THE FALSE READING THIS TOOL ALREADY PRODUCED, KEPT HERE ON PURPOSE ───────
 * The first version reported:
 *     body background : rgba(0, 0, 0, 0)
 *     first heading   : "MEMUAT ASJ OS V7..."
 *     contrast        : 1.25:1 FAIL
 *     images          : 15 total, 6 not decoded
 * Every one of those is the LOADING SHELL, not the landing page. It measured
 * before hydration finished, so it read the splash element's transparent
 * background and its placeholder heading. It looked exactly like a page whose
 * theme was broken, and it was not — `h1` on `/` is rendered by a
 * `client:only="preact"` island, so it does not exist until the island mounts
 * (the same reason `grep '<h1' dist/index.html` finds 0 on a healthy build).
 *
 * The fix, and the rule it encodes: WAIT FOR A NON-SPLASH SUBJECT before reading
 * any computed value. A measurement taken before the thing exists is not a
 * measurement. This is the second time in this repo that a checking tool
 * reported the exact bug it was written to catch and was wrong (see
 * measure-reveal.mjs and R14 §3k) — so the mistake is written down, not hidden.
 *
 * WHAT IT MEASURES, and why each one is worth taking:
 *   - the resolved `data-theme` attribute, i.e. what the inline script chose
 *   - the COMPUTED background colour of the body, i.e. what a visitor sees
 *   - the COMPUTED colour of the real h1, and its contrast against the background
 *   - the hero band, which must stay DARK in light mode (white text sits on it)
 *   - every <img>, by naturalWidth: a wrong srcset path renders a broken box that
 *     no build step and no type-checker notices
 *
 * BEFORE BELIEVING A SUSPICIOUS VALUE: check the status code, check --noproxy
 * (a proxy 502 on 127.0.0.1 looks like a dead server), and confirm the harness
 * reached the state. Print raw values, not just a verdict.
 *
 * A THIRD way this file gave a false reading, added 2026-09-20: the default host.
 * `astro preview` binds IPv6-only, so 127.0.0.1 is refused while `localhost`
 * works. The first version defaulted to 127.0.0.1 and could not have connected
 * at all.
 *
 * SEPARATE TRAP, same day, and it cost two wrong guesses to pin down: an
 * `astro preview` process and an `astro build` CANNOT run at the same time.
 * With preview up, the build hangs forever after "Collecting build info";
 * with preview stopped, the same build finishes in ~16s.
 *
 * Measured three ways: build with preview running -> stall (killed at the
 * timeout, twice, foreground both times); build with preview stopped -> exit 0.
 * The FIRST explanation ("a stale server holds the port") and the SECOND
 * ("background tasks stall, foreground is fine") were both WRONG — the second
 * was disproved by stalling a foreground build with preview up. The rule is
 * simply: STOP PREVIEW BEFORE BUILDING.
 *
 * Also: killing a build mid-flight can leave `dist/index.html` missing, because
 * Astro empties dist/ before rewriting. Check it exists afterwards.
 *
 * The stale server is a separate, narrower trap: one held port 4321 for ~5h45m
 * while serving an OLD dist/, which made every MEASUREMENT read the wrong build
 * and stopped a fresh preview from binding. Check
 * `netstat -ano | grep :4321` before trusting a NUMBER.
 */
import { chromium } from 'playwright';

/*
 * DEFAULT HOST IS `localhost`, NOT `127.0.0.1` — and that is a measured fix,
 * not a style choice.
 *
 * `astro preview` v5.12.0 binds IPv6-only (`netstat` shows `[::1]:4321
 * LISTENING`), so a probe against 127.0.0.1 is REFUSED:
 *   127.0.0.1:4321 -> curl exit 7 (connect refused)
 *   localhost:4321 -> curl exit 0
 *        [::1]:4321 -> curl exit 0
 * The first version of this file defaulted to 127.0.0.1 and would have failed
 * to connect to a perfectly healthy server. `localhost` resolves to whichever
 * family the server actually bound, so it is the correct default.
 *
 * Override with BASE=... when pointing at a different server.
 */
const BASE = process.env.BASE ?? 'http://localhost:4321';
const SPLASH = /MEMUAT ASJ OS/i;

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const resp = await page.goto(BASE, { waitUntil: 'networkidle' });
console.log(`status          : ${resp?.status()}  (a non-200 here makes the rest meaningless)`);

/* Wait until the splash is gone AND a real h1 exists. Both conditions matter:
   the splash text disappears before the island necessarily paints its heading. */
await page
  .waitForFunction(
    (splashSrc) => {
      const h1 = document.querySelector('h1');
      const splash = new RegExp(splashSrc, 'i').test(document.body.innerText || '');
      return !!h1 && !splash && h1.textContent.trim().length > 0;
    },
    SPLASH.source,
    { timeout: 20000 },
  )
  .catch(() => console.log('WARN            : splash never cleared — values below are NOT the page'));

const read = () =>
  page.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const solid = (s) => {
      const a = rgb(s);
      return a.length < 4 || a[3] > 0.5; // reject transparent / near-transparent
    };
    const lum = ([r, g, b]) => {
      const f = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };

    /* Walk UP from the h1 until a solid painted background is found. Reading
       document.body's own backgroundColor returns transparent whenever an
       ancestor paints instead, which is the false reading described above.
       GRADIENTS COUNT: the hero paints with `background-image`, not
       `background-color`, so a colour-only walk climbs straight past it and
       reports `transparent` — which is how this tool's first corrected version
       still measured the hero heading at 1.25:1. Take the FIRST ancestor that
       paints either a colour OR a gradient, and treat the gradient's first stop
       as its surface (accurate enough for a contrast check on a dark band). */
    /* The page canvas itself. `body` and `html` both report transparent — the
       canvas token is applied so that the PAINTED colour is the document
       background, which getComputedStyle on either element does not expose.
       Fall back to resolving `--color-canvas`, then to white, because a
       transparent ancestor chain is otherwise read as "black enough to fail",
       which is this tool's third false reading and the reason it is written
       down here rather than quietly patched. */
    const PAGE_CANVAS = (() => {
      const fromVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-canvas')
        .trim();
      if (fromVar) {
        const probe = document.createElement('div');
        probe.style.color = fromVar;
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      }
      return 'rgb(255, 255, 255)';
    })();

    const paintOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n);
        if (solid(c.backgroundColor)) return { src: c.backgroundColor, kind: 'color' };
        const g = c.backgroundImage;
        if (g && g !== 'none') {
          const first = g.match(/rgba?\([^)]+\)/);
          if (first && solid(first[0])) return { src: first[0], kind: 'gradient' };
        }
      }
      return { src: PAGE_CANVAS, kind: 'canvas-token' };
    };

    const h1 = document.querySelector('h1');
    const fg = getComputedStyle(h1).color;
    const painted = paintOf(h1);

    const hero = document.querySelector('header') ?? document.querySelector('[class*="hero"]');
    const heroPaint = hero ? paintOf(hero) : { src: 'none', kind: 'none' };

    /* Sample the rungs that matter, each paired with the surface it actually
       sits on, so a fix for one cannot silently break another. The page
       paragraph is the CONTROL: it must stay dark, because it sits on white. */
    const sample = (label, el) => {
      if (!el) return { label, color: '(missing)', bg: 'n/a', contrast: 0 };
      const c = getComputedStyle(el).color;
      const b = paintOf(el).src;
      return { label, color: c, bg: b, contrast: Number(ratio(rgb(c), rgb(b)).toFixed(2)) };
    };
    const surfaces = [
      sample('hero h1 (on band)', h1),
      /* The slate rung, not the pink eyebrow — `header p` alone matches
         `text-pink-300` first, whose 2.81:1 is by design (decorative eyebrow),
         so sampling it would look like a defect that is not there. */
      sample('hero sub (on band)', document.querySelector('header p.text-body')),
      sample('page para (on canvas)', document.querySelector('main p')),
      sample('page section h2', document.querySelector('main h2')),
    ];

    return {
      theme: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('asjTheme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bgBehindHeading: `${painted.src}  [via ${painted.kind}]`,
      headingSurface: painted.src,
      firstHeading: h1.textContent.trim().slice(0, 40),
      fg,
      /* The heading is INSIDE the hero band, so its contrast is against the
         band, not against the page canvas. Measuring it against `canvas`
         would report a failure for a band that is correctly dark. */
      contrast: Number(ratio(rgb(fg), rgb(painted.src)).toFixed(2)),
      heroBg: `${heroPaint.src}  [via ${heroPaint.kind}]`,
      heroSurface: heroPaint.src,
      surfaces,
      images: [...document.querySelectorAll('img')].map((i) => ({
        src: i.currentSrc.split('/').slice(-1)[0] || '(empty src)',
        w: i.naturalWidth,
        hidden: i.hidden || i.getAttribute('aria-hidden') === 'true',
      })),
    };
  });

const r = await read();
console.log(`data-theme      : ${r.theme}`);
console.log(`localStorage    : ${r.stored ?? '(unset — the authored default is in use)'}`);
console.log(`body background : ${r.bodyBg}  (transparent is normal: an ancestor paints)`);
console.log(`bg behind h1    : ${r.bgBehindHeading}`);
console.log(`first heading   : "${r.firstHeading}"  colour ${r.fg}`);
console.log(`contrast        : ${r.contrast}:1  ${r.contrast >= 4.5 ? 'PASS' : 'FAIL'} (4.5 needed)`);
console.log(`hero background : ${r.heroBg}`);

/* The paragraph and heading rungs INSIDE the band, and a body paragraph
   OUTSIDE it. The band's text must be light and the page's must be dark; a
   fix that made every `.text-white` white again would pass the h1 check and
   break the light surfaces, so the page text is checked as a control. */
for (const s of r.surfaces) {
  console.log(`  ${s.label.padEnd(22)}: ${s.color} on ${s.bg}  -> ${s.contrast}:1 ${s.contrast >= 4.5 ? 'PASS' : 'FAIL'}`);
}

/* The hero band must be DARK in light mode: its markup puts text-white on it.
   Report this as a verdict rather than leaving the reader to eyeball an rgb. */
const heroLum = (() => {
  const [rr, gg, bb] = (r.heroSurface.match(/[\d.]+/g) ?? []).map(Number);
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(rr) + 0.7152 * f(gg) + 0.0722 * f(bb);
})();
console.log(`hero dark?      : ${heroLum < 0.2 ? 'PASS (dark band, white text is readable)' : 'FAIL (light band behind white text)'}`);

/* Six images report naturalWidth 0 with an EMPTY currentSrc. An empty src is not
   a broken asset — it is an <img> whose source is filled in by an island that has
   not run yet. Report that distinction instead of printing six scary BROKEN
   lines, which is how this tool misled its own author twice. */
const empty = r.images.filter((i) => i.w === 0 && i.src === '(empty src)');
const broken = r.images.filter((i) => i.w === 0 && i.src !== '(empty src)');
console.log(
  `images          : ${r.images.length} total, ${r.images.length - empty.length - broken.length} decoded, ` +
    `${empty.length} pending (src filled by an island), ${broken.length} BROKEN`,
);
for (const b of broken) console.log(`   BROKEN  ${b.src}`);

/* SECOND PASS: does the toggle still reach dark, and does storage beat the
   authored default? A default change that also broke the toggle would pass
   every check above and be a worse bug than the one being fixed. */
await page.evaluate(() => localStorage.setItem('asjTheme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const dark = await read();
console.log('');
console.log(`after storing "dark" + reload:`);
console.log(`  data-theme    : ${dark.theme}   ${dark.theme === 'dark' ? 'PASS (storage wins)' : 'FAIL (default overrode an explicit choice)'}`);
console.log(`  bg behind h1  : ${dark.bgBehindHeading}`);

/* THIRD PASS: clean storage must return to the authored default, not stay dark. */
await page.evaluate(() => localStorage.removeItem('asjTheme'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const fresh = await read();
console.log('');
console.log(`after clearing storage + reload:`);
console.log(`  data-theme    : ${fresh.theme}   ${fresh.theme === 'light' ? 'PASS (authored default)' : 'FAIL'}`);

await browser.close();
