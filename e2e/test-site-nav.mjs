/**
 * E2E Test: the desktop section nav — anchors, the current-section marker, and
 * the two controls it owns.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/components/public/SiteNav.astro` shipped with L4 as ~170 lines of
 * load-bearing behaviour and NO gate at all. Measured before this file existed:
 * `grep -rn 'data-nav-link\|aria-current\|site-nav' e2e/*.mjs` returned ZERO
 * hits. The component's own comment asserts three things that nothing checked:
 *
 *   - "every item resolves to a section that exists"
 *   - "the marker is driven by scroll POSITION, not `:hover`" (the L4.2
 *     acceptance criterion says exactly this: diukur dengan menggulir)
 *   - "the language toggle reuses the SAME store as the header"
 *
 * A nav item pointing at a fragment that does not resolve is a control that
 * looks live and does nothing — the same defect `docs/LANDING_PAGE_SPEC.md` §5.1
 * was written about, and the same one `e2e/test-landing.mjs` already checks for
 * in-page links. This file checks it for the NAV specifically, because the nav
 * is the one place a dangling anchor is most likely to be added and least likely
 * to be noticed: the item is a name, not a destination.
 *
 * WHY THE VIEWPORT PAIR MATTERS TO A DIFFERENT GATE
 * -------------------------------------------------
 * `hidden lg:block` is the only reason the sticky section bar does not disturb
 * `e2e/test-drawer.mjs`, which measures `nav[aria-label="Primary navigation"]`
 * on a 390x844 viewport. If this bar ever loses that class it becomes a second
 * nav in the drawer's measurement frame. So "is it really hidden at 390" is a
 * question about the drawer's proof, not about cosmetics.
 *
 * HOW THIS GUARD COULD LIE, AND WHAT STOPS IT
 * -------------------------------------------
 * 1. PASSING VACUOUSLY ON THE MARKER. "Exactly one link is marked" is also true
 *    if the observer never runs and one link was hard-coded current. So the same
 *    reading is taken after scrolling to EACH of the five sections and each time
 *    the marked id must be the section we scrolled to — a marker stuck on one
 *    link fails on four of five.
 * 2. PASSING VACUOUSLY ON THE ANCHORS. "No dangling anchors" is also true of an
 *    empty list. The link count is asserted non-zero first, and the ids are
 *    asserted to be the SET the spec's §5.2 anchor map expects, so deleting an
 *    item to make this file green is not possible.
 *    — APPENDED 2026-09-20: this only works if the list is RIGHT, and it was not
 *    (it omitted `layanan`, which exists). Note which way the failure ran: a
 *    stale list reports a healthy nav item as `unexpected`, and the cheap way to
 *    silence it is to delete the nav item. The set comparison protects against
 *    that only because it prints BOTH sides and names the remedy.
 * 3. MEASURING AN ERROR PAGE. HTTP status is asserted before anything is read.
 * 4. TRUSTING THE CLASS STRING FOR "HIDDEN". Visibility is read from computed
 *    style AND the measured width, not from `hidden lg:block` being present.
 * 5. A DEAD LANGUAGE CHECK. If the button were inert, `before === after` would
 *    be reported as a change only if the fixture itself was broken, so the label
 *    is asserted to actually flip ID -> JP and then back.
 *
 * Run against a built artifact:
 *   node e2e/test-site-nav.mjs            (defaults to localhost:4321)
 *   BASE_URL=http://localhost:4321 node e2e/test-site-nav.mjs
 */
import { chromium } from 'playwright';

/*
 * DEFAULT HOST IS `localhost`, NOT `127.0.0.1` — a measured fix, 2026-09-20.
 *
 * This gate defaulted to `http://127.0.0.1:4321` and could NOT connect to an
 * `astro preview` server, because preview v5.12.0 binds IPv6-only
 * (`netstat` shows `[::1]:4321 LISTENING`). Measured with the server definitely
 * up: 127.0.0.1 -> curl exit 7 (refused), localhost -> exit 0.
 *
 * The failure mode was ugly: the gate failed with ERR_CONNECTION_REFUSED, which
 * reads as "no server is running" and sends you to restart a server that is
 * already healthy. Worse, it looks identical to an environment problem, so the
 * gate could sit broken without anyone suspecting the DEFAULT was wrong.
 *
 * `localhost` resolves to whichever family the server bound, so it is correct
 * for both. Override with BASE_URL when pointing elsewhere.
 */
const BASE = process.env.BASE_URL || 'http://localhost:4321';

/**
 * The nav items the spec's §5.2 anchor map assigns to "nav", i.e. the items
 * carrying `data-nav-link` — the attribute that drives scroll-spy `aria-current`.
 *
 * The rule this list encodes, from the component's own comment: an item belongs
 * here ONLY when a section with that id actually exists on `/`. Otherwise the
 * link looks live and does nothing.
 *
 * TWO CORRECTIONS ON 2026-09-20, and both went the same way — the list was
 * asserting things about the page that had stopped being true.
 *
 * 1. `loker` REMOVED. No element on `/` carries `id="loker"`; the lowongan table
 *    moved to its own `/loker` route, so the nav item is now a real page link
 *    (`href="/loker"`, no `data-nav-link`) rather than an in-page anchor.
 *
 * 2. `layanan` ADDED — and this one is the more instructive of the two, because
 *    the comment that used to sit here said the OPPOSITE in confident detail:
 *    "it is still a hidden tab panel, and an anchor to a `hidden` element does
 *    not scroll. It joins with the tab→anchor conversion in L5."
 *
 *    That was true when it was written and has been false for some time.
 *    `#layanan` is a real, visible `<Section>` at `src/pages/index.astro:156`
 *    (`<Section id="layanan" labelledBy="layanan-title" class="section-alt">`),
 *    and the component's own markup has carried `data-nav-link="layanan"` this
 *    whole time. So the nav and the page agreed, and only this gate disagreed —
 *    it was the stale artifact, reporting a working nav item as `unexpected`.
 *
 *    It went unnoticed because this file could not connect to the server at all
 *    until the same day (hardcoded `127.0.0.1` vs an IPv6-only preview; see the
 *    BASE note above). A gate that cannot run does not fail — it just stops
 *    being evidence, and the drift it would have caught accumulates silently.
 *
 * The gate's own diagnostic already prescribes the correct response to case 2,
 * and it is worth quoting because the wrong response is so tempting: "If a
 * section genuinely landed, add it to EXPECTED_IDS in this file with the section
 * id; do not delete an item to make this check pass." Deleting the nav item
 * would have turned this green while DELETING A WORKING FEATURE.
 */
const EXPECTED_IDS = ['layanan', 'program', 'alur', 'fasilitas', 'tentang'];

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log(`✅ ${name}`);
  } catch (e) {
    results.push(['fail', name]);
    console.log(`❌ ${name}\n     ${e.message}`);
  }
}

/* `--no-proxy-server`: this sandbox exports HTTP(S)_PROXY, and Chromium would
   otherwise send 127.0.0.1 requests through it and get a 502 — which reads
   exactly like the server being down. */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const readNav = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector('[data-site-nav]');
    if (!nav) return { present: false };
    const cs = getComputedStyle(nav);
    const links = [...nav.querySelectorAll('[data-nav-link]')].map((el) => {
      const id = el.getAttribute('data-nav-link');
      return {
        id,
        href: el.getAttribute('href'),
        current: el.getAttribute('aria-current') === 'true',
        resolves: document.getElementById(id) !== null,
        text: (el.textContent || '').trim(),
      };
    });
    return {
      present: true,
      display: cs.display,
      width: Math.round(nav.getBoundingClientRect().width),
      links,
      marked: links.filter((l) => l.current).map((l) => l.id),
      langLabel: nav.querySelector('[data-nav-lang-label]')?.textContent?.trim() ?? null,
    };
  });

/* ── Per-width presence, and the hidden-at-390 contract ──────────────── */
for (const [width, height] of [
  [390, 844],
  [1280, 900],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const res = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const status = res?.status();
  if (status !== 200) {
    console.error(`ABORT: GET / returned ${status} — refusing to read an error page as the app.`);
    await browser.close();
    process.exit(1);
  }
  await page.waitForSelector('#atas h1', { timeout: 20_000 });
  await page.waitForTimeout(800);

  await test(`${width}px /: the section nav exists and is ${width < 1024 ? 'hidden' : 'shown'}`, async () => {
    const d = await readNav(page);
    if (!d.present) throw new Error('[data-site-nav] is not in the document');
    const shown = d.display !== 'none' && d.width > 0;
    if (width < 1024 && shown) {
      throw new Error(
        `the section bar is VISIBLE at ${width}px (display=${d.display}, width=${d.width}). ` +
          `It must stay out of the mobile layout: e2e/test-drawer.mjs measures the drawer on a ` +
          `390x844 viewport, and this bar is a second nav in that frame.`,
      );
    }
    if (width >= 1024 && !shown) {
      throw new Error(`the section bar is hidden at ${width}px (display=${d.display}, width=${d.width})`);
    }
  });

  await test(`${width}px /: every nav item points at a section that exists`, async () => {
    const d = await readNav(page);
    if (!d.links.length) throw new Error('the nav has no items — a dangling check over an empty set proves nothing');
    const dangling = d.links.filter((l) => !l.resolves);
    if (dangling.length) {
      throw new Error(
        `${dangling.length} nav item(s) point at a fragment that does not resolve: ` +
          dangling.map((l) => `"${l.text}" -> ${l.href}`).join(', ') +
          `. A link with no destination looks live and does nothing.`,
      );
    }
    const ids = d.links.map((l) => l.id);
    const missing = EXPECTED_IDS.filter((id) => !ids.includes(id));
    const extra = ids.filter((id) => !EXPECTED_IDS.includes(id));
    if (missing.length || extra.length) {
      throw new Error(
        `nav items differ from the spec §5.2 set. missing=[${missing.join(',')}] unexpected=[${extra.join(',')}]. ` +
          `If a section genuinely landed, add it to EXPECTED_IDS in this file with the section id; ` +
          `do not delete an item to make this check pass.`,
      );
    }
  });

  await page.close();
}

/* ── The marker is RUNTIME state, not markup ─────────────────────────── */
await test('1280px /: no nav item is marked current in the authored markup', async () => {
  /* WHAT THIS REPLACED, AND WHY THE FIRST ATTEMPT DID NOT WORK.
     -----------------------------------------------------------------
     A mutation survived the first version of this file: hard-coding
     `aria-current="true"` on the "Alur" link in `SiteNav.astro` passed every
     check, even though a second mutation to `rootMargin` DID turn the scroll
     loop red. That contrast is the clue that solved it.

     The first fix tried to catch the stale attribute by reading the DOM on a
     fresh load "before the observer runs". That is NOT OBSERVABLE, and the
     attempt was disproved rather than argued. Measured, with the mutation
     applied to the markup:

       - bundle ALLOWED  (normal): alur=null at t=0, 400, 900 and 1800 ms
       - bundle ABORTED  (all /_astro/*.js routes blocked):
                                   alur="true" at t=0, 400, 900 and 1800 ms

     So the attribute IS in the served document and IS in the DOM at t=0 — the
     bundle is what erases it. `observer.observe(...)` fires an initial callback
     per spec, `sync()` runs, and `sync()` walks EVERY link doing
     `setAttribute`/`removeAttribute` from the observer's own `visible` set. It
     does not "update" the marker, it OVERWRITES it. By the time any wait has
     elapsed — 0 ms included, because Playwright's `goto` returns after the
     document is parsed and the module scripts have been dispatched — the
     statically-wrong value is already gone. There is no DOM reading, at any
     delay, that can distinguish the mutation. A check written that way is a
     check that can only pass.

     ITS OWN BUG, FOUND WHILE FIXING IT: the `scrollY > 50` guard would never
     have fired either. Measured at 1280x900, `#loker` starts at document y=1312
     and the viewport is 900 tall, so a fresh load cannot scroll at all — scrollY
     is 0 no matter what, and a throw-branch that cannot throw is not a guard,
     it is decoration.

     THE READING THAT WORKS IS THE AUTHORED SOURCE, in `dist/index.html`. It is
     the one state no runtime can produce, because the only writer of
     `aria-current` is `sync()`. `aria-current` must therefore appear ZERO times
     in the served document: every marker must be created at runtime. This is a
     real contract, not a trick — a hand-written `aria-current` marks a section
     the visitor has not scrolled to, and the L4.2 criterion is explicit that the
     marker follows scroll POSITION.

     Its one honest limit: it cannot tell WHICH line of the `.astro` file the
     attribute came from. It does not need to — the file is the only source of
     this markup, so it names its culprit in the diagnostic. */
  const html = await fetch(`${BASE}/`).then((r) => r.text());
  const occurrences = html.split('aria-current').length - 1;
  if (occurrences === 0) return;

  // Point at the offending link rather than just its count: the markup is
  // `data-nav-link="X" ... aria-current="Y"`, so the nearest preceding id is it.
  const at = html.indexOf('aria-current');
  const before = html.slice(0, at);
  const idAt = before.lastIndexOf('data-nav-link="');
  const id =
    idAt === -1
      ? '?'
      : before.slice(idAt + 'data-nav-link="'.length).split('"')[0];

  throw new Error(
    `"aria-current" appears ${occurrences}x in the SERVED document (near data-nav-link="${id}"). ` +
      `A nav item's current marker is RUNTIME state: the only writer may be the IntersectionObserver's ` +
      `sync(), which overwrites every link on each callback. A marker written into the markup cannot be ` +
      `observed in the DOM at any delay (measured: the bundle erases it before the first reading), so the ` +
      `attribute cannot be checked there — it is checked here instead. Remove the hand-written ` +
      `aria-current from src/components/public/SiteNav.astro; the L4.2 marker must follow scroll POSITION.`,
  );
});

await test('1280px /: scrolling to each section marks exactly that nav item current', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#atas h1', { timeout: 20_000 });
  await page.waitForTimeout(900);

  const failures = [];
  for (const id of EXPECTED_IDS) {
    await page.evaluate((targetId) => {
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, id);
    await page.waitForTimeout(600);
    const d = await readNav(page);
    const ok = d.marked.length === 1 && d.marked[0] === id;
    if (!ok) {
      failures.push(
        `#${id}: marked=[${d.marked.join(',')}] ` +
          `(${d.marked.length === 0 ? 'nothing is marked — the observer band never matched' : 'more than one is marked — the observer adds without removing'})`,
      );
    }
  }
  await page.close();
  if (failures.length) {
    throw new Error(
      `${failures.length}/${EXPECTED_IDS.length} section(s) not marked correctly by scroll position:\n     ` +
        failures.join('\n     '),
    );
  }
});

/* ── The language button drives the shared store ─────────────────────── */
await test('1280px /: the nav language button flips the shared store and back', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#atas h1', { timeout: 20_000 });
  await page.waitForTimeout(900);

  const before = (await readNav(page)).langLabel;
  if (!before) throw new Error('the nav language label is missing, so the toggle cannot be measured');

  await page.click('[data-nav-lang]');
  await page.waitForTimeout(500);
  const after = (await readNav(page)).langLabel;
  if (before === after) {
    throw new Error(
      `clicking [data-nav-lang] did not change the label ("${before}" -> "${after}"). ` +
        `The button must drive the same store the header uses — a second language state is how ` +
        `two controls end up disagreeing.`,
    );
  }

  await page.click('[data-nav-lang]');
  await page.waitForTimeout(500);
  const restored = (await readNav(page)).langLabel;
  await page.close();
  if (restored !== before) {
    throw new Error(`the toggle did not restore: expected "${before}", got "${restored}"`);
  }
});

await browser.close();

const failed = results.filter(([s]) => s === 'fail');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
