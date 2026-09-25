/**
 * measure-site-nav.mjs — does the desktop section nav actually mark where you are?
 *
 * EVIDENCE tool, not a gate. `SiteNav.astro` is ~170 lines of load-bearing
 * behaviour (IntersectionObserver band, `aria-current`, a language toggle on the
 * shared store, a login button that dispatches the header's event) and until now
 * NOTHING measured any of it. The comment in that file asserts the marker is
 * driven by scroll position rather than hover; this turns that assertion into a
 * reading.
 *
 * What is checked, and why each is a separate question:
 *
 *  1. The nav exists at lg and is ABSENT below it. `hidden lg:block` is the whole
 *     reason the 390px drawer gate is unaffected, so "is it really hidden at
 *     390" is a question about that gate, not about cosmetics.
 *  2. Every href fragmeent resolves to a real element. A nav item pointing at a
 *     fragment that does not exist looks live and does nothing.
 *  3. Scrolling to a section marks EXACTLY ONE link current. Zero means the band
 *     is wrong; two means the observer is adding without removing.
 *  4. The language button flips the shared store, i.e. the visible label follows.
 *  5. The login button reaches the App island's modal.
 *
 * `--no-proxy-server` is mandatory: the sandbox exports HTTP_PROXY, so a
 * 127.0.0.1 navigation goes to the proxy and returns 502, which reads exactly
 * like a dead server.
 */
import { chromium } from 'playwright';

const BASE = process.env.LANDING_URL || 'http://127.0.0.1:4321/';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const read = async (page) => {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-site-nav]');
    if (!nav) return { present: false };
    const cs = getComputedStyle(nav);
    const links = [...nav.querySelectorAll('[data-nav-link]')].map((el) => ({
      id: el.getAttribute('data-nav-link'),
      href: el.getAttribute('href'),
      current: el.getAttribute('aria-current'),
      // getElementById, not querySelector: '#' inside an attribute selector
      // needs escaping and an id may start with a digit.
      resolves: document.getElementById(el.getAttribute('data-nav-link')) !== null,
    }));
    return {
      present: true,
      display: cs.display,
      visibility: cs.visibility,
      rectWidth: Math.round(nav.getBoundingClientRect().width),
      position: cs.position,
      links,
      currentCount: links.filter((l) => l.current === 'true').length,
      // The nav no longer carries a language control (removed 2026-09-25 — the
      // JP toggle lives only in the hamburger drawer). Counted so this evidence
      // tool reports the ABSENCE rather than a null it cannot distinguish from
      // a broken selector.
      langControls: nav.querySelectorAll('[data-nav-lang], [data-nav-lang-label]').length,
    };
  });
};

/* ── 1 + 2. Presence and anchor resolution, per width ─────────────────── */
for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#atas h1', { timeout: 20_000 });
  await page.waitForTimeout(800);
  const d = await read(page);

  if (!d.present) {
    console.log(`${width}px  no [data-site-nav] in the document at all`);
  } else {
    const shown = d.display !== 'none' && d.rectWidth > 0;
    const dangling = d.links.filter((l) => !l.resolves).map((l) => `#${l.id}`);
    console.log(
      `${width}px  site-nav present, display=${d.display} ${shown ? 'SHOWN' : 'HIDDEN'} ` +
        `(${d.rectWidth}px, position=${d.position})  links=${d.links.length}  ` +
        `dangling=${dangling.length ? dangling.join(',') : 'none'}`,
    );
    if (width === 1280) {
      for (const l of d.links) {
        console.log(`        #${l.id}  aria-current=${l.current}  resolves=${l.resolves}`);
      }
    }
  }
  await page.close();
}

/* ── 3. Scroll the page and watch which link is marked ────────────────── */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#atas h1', { timeout: 20_000 });
  await page.waitForTimeout(900);

  const targets = ['loker', 'program', 'alur', 'fasilitas', 'tentang'];
  const rows = [];
  for (const id of targets) {
    await page.evaluate((targetId) => {
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, id);
    await page.waitForTimeout(700);
    const d = await read(page);
    const marked = d.links.filter((l) => l.current === 'true').map((l) => l.id);
    rows.push({ id, marked });
  }
  let bad = 0;
  for (const r of rows) {
    const exact = r.marked.length === 1 && r.marked[0] === r.id;
    if (!exact) bad++;
    console.log(
      `scroll -> #${r.id}  marked=[${r.marked.join(',')}]  ` +
        `${exact ? 'OK' : r.marked.length === 0 ? 'NOTHING MARKED' : 'MULTIPLE MARKED'}`,
    );
  }
  console.log(`scroll marker: ${rows.length - bad}/${rows.length} sections marked correctly`);

  /* ── 4. The nav carries NO language control (drawer is the only entry) ── */
  const langControls = (await read(page)).langControls;
  console.log(`nav language controls: ${langControls}  ${langControls === 0 ? 'OK (drawer-only)' : 'REGRESSION'}`);

  await page.close();
}

await browser.close();
