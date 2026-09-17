/**
 * E2E Test: the drawer's keyboard contract, and the login modal it opens.
 *
 * WHY THIS EXISTS
 * ---------------
 * MEASURED 2026-09-16 on the built artifact, viewport 390x844.
 *
 * (a) The App.tsx drawer, BEFORE this round:
 *
 *       CLOSED       nav rect.x = 390 = viewport width (fully off-screen)
 *                    aria-hidden null, inert false
 *                    Tab-walk from the hamburger: 7 of 22 stops landed
 *                    INSIDE the closed drawer — Close, Install App, Bahasa,
 *                    Login, Daftar, Admin Login. The focus ring is painted
 *                    off-screen, so the user sees nothing happen and has to
 *                    Tab through six invisible controls to reach the page.
 *       Escape open  no effect at all (nav still at rect.x = 102)
 *       close        focus not returned to the trigger
 *
 * (b) `LoginModal.tsx` called `useOverlay` and never attached `containerRef`
 *     to any element, so `containerRef.current` was null for the modal's whole
 *     life and every effect that reads it returned early. Measured with the
 *     modal VISIBLE on screen:
 *
 *       [role="dialog"] count   0        no role at all
 *       aria-modal              absent   nothing tells AT the rest is inert
 *       accessible name         none     so it could not be announced
 *       initial focus           outside  focus stayed on the page behind
 *       after 12x Tab           escaped  no trap was installed
 *
 *     Escape and focus-restore still worked, because those two effects do not
 *     read the ref — which is exactly why the loss was invisible. Of the 27
 *     `useOverlay` call sites in `src/components`, this was the only one
 *     missing the ref.
 *
 * `e2e/test-dialog.mjs` cannot see (b): its sweep only covers overlays it can
 * open for itself, and it never opens the login modal. Both defects live on
 * routes that need NO backend session, which is why this guard can measure
 * them against a plain `astro preview`.
 *
 * HOW THIS GUARD COULD LIE, AND WHAT STOPS IT
 * -------------------------------------------
 * 1. PASSING VACUOUSLY. "Zero Tab stops landed inside the closed drawer" is
 *    also true of a broken selector, a page that never loaded, or a drawer
 *    that does not exist. So the SAME walk is run a second time with the
 *    drawer OPEN and must find stops inside. One instrument, two opposite
 *    readings: that is the positive control, and it is why the closed-drawer
 *    assertion is worth anything.
 * 2. MEASURING AN ERROR PAGE. The HTTP status is asserted before anything else,
 *    so a 404/500 body is never read as the app's DOM.
 * 3. MEASURING A DRAWER THAT NEVER OPENED. Every open/closed reading is taken
 *    from the nav's measured geometry (`rect.x`), not from the class string —
 *    the class is what the source says, the rect is what the user gets.
 * 4. A DEAD MODAL CHECK. If the login modal never opened, "no violations" would
 *    be true and worthless. The modal is asserted to be VISIBLE, and its input
 *    count asserted non-zero, before its semantics are read.
 * 5. TRUSTING `document.activeElement` AFTER A PROGRAMMATIC CLICK. A synthetic
 *    `el.click()` does not move focus, so a focus reading taken after one
 *    describes whatever had focus before. The close paths below therefore use
 *    real pointer clicks.
 * 6. CLICKING THE HAMBURGER TO CLOSE THE DRAWER. It cannot be done: the drawer
 *    is right-anchored and covers the button, so Playwright reports
 *    "intercepts pointer events". The drawer's own Close button is used.
 *
 * Run against a built artifact:
 *   BASE_URL=http://127.0.0.1:4321 node e2e/test-drawer.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const NAV = 'nav[aria-label="Primary navigation"]';

const results = [];
const skipped = [];

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
   otherwise send 127.0.0.1 requests through it and get a 502. */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const res = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
const status = res?.status();
if (status !== 200) {
  console.error(`ABORT: GET / returned ${status} — refusing to read an error page as the app.`);
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1200);

/** Geometry, not class names: what the user actually gets. */
const drawerOpen = () =>
  page.evaluate((sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return r.x < window.innerWidth - 1;
  }, NAV);

const drawerState = () =>
  page.evaluate((sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      inert: n.inert === true,
      focusables: n.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ).length,
    };
  }, NAV);

const focusInfo = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return { tag: null, label: '', inNav: false };
    return {
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
      inNav: !!document.querySelector('nav[aria-label="Primary navigation"]')?.contains(el),
    };
  });

/**
 * Walk the tab order from the hamburger and report every stop that landed
 * inside the drawer. Returns a LIST, so the caller can assert both directions.
 */
async function tabWalkInsideDrawer(presses) {
  await page.evaluate(() => document.querySelector('.hamburger-btn').focus());
  const inside = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate((sel) => {
      const el = document.activeElement;
      const nav = document.querySelector(sel);
      return {
        inNav: !!(nav && el && nav.contains(el)),
        label: el ? (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) : null,
      };
    }, NAV);
    if (s.inNav) inside.push(s.label);
  }
  return inside;
}

/* ── 1. The instrument's positive control, run FIRST ──────────────────────
   With the drawer OPEN the walk must find stops inside it. If it finds none,
   the "0 stops while closed" result below is meaningless and this guard must
   not be allowed to report a pass. */
await test('control: the Tab-walk CAN see inside an open drawer', async () => {
  await page.locator('.hamburger-btn').click();
  await page.waitForTimeout(500);
  if (!(await drawerOpen())) throw new Error('the drawer did not open — cannot run the control');
  const inside = await tabWalkInsideDrawer(8);
  if (inside.length === 0) {
    throw new Error(
      'the walk found ZERO stops inside an OPEN drawer — the instrument is blind, so every "inside" reading below would be vacuous',
    );
  }
  console.log(`     ↳ control: ${inside.length}/8 stops inside the open drawer`);
  // close again via the drawer's own button (the hamburger is covered)
  await page.locator(`${NAV} button[aria-label="Close"]`).click();
  await page.waitForTimeout(600);
});

/* ── 2. A closed drawer must not be a Tab stop ─────────────────────────── */
await test('a CLOSED drawer holds no Tab stops', async () => {
  if (await drawerOpen()) throw new Error('the drawer is open — this check needs it closed');
  const st = await drawerState();
  if (!st) throw new Error('no nav[aria-label="Primary navigation"] in the document');
  if (st.focusables === 0) throw new Error('the closed drawer has no focusable children at all — nothing to prove');
  const inside = await tabWalkInsideDrawer(22);
  if (inside.length !== 0) {
    throw new Error(
      `${inside.length} of 22 Tab stops landed inside the CLOSED drawer (off-screen at x=${st.x}): ${inside.join(', ')}`,
    );
  }
  if (!st.inert) throw new Error('the closed drawer is not inert, so it can still be reached programmatically');
  console.log(`     ↳ closed drawer: x=${st.x}, inert=${st.inert}, ${st.focusables} focusable children, 0 Tab stops`);
});

/* ── 3. Opening by keyboard puts focus inside ───────────────────────────── */
await test('keyboard-opening the drawer moves focus INTO it', async () => {
  await page.evaluate(() => document.querySelector('.hamburger-btn').focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  if (!(await drawerOpen())) throw new Error('the drawer did not open on Enter');
  const f = await focusInfo();
  if (!f.inNav) {
    throw new Error(`focus stayed outside the drawer (on ${f.tag} "${f.label}"), which the open drawer covers`);
  }
  console.log(`     ↳ focus moved to ${f.tag} "${f.label}"`);
});

/* ── 4. Escape closes it ────────────────────────────────────────────────── */
await test('Escape closes the drawer', async () => {
  if (!(await drawerOpen())) throw new Error('precondition: the drawer should be open here');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  if (await drawerOpen()) throw new Error('the drawer is still open after Escape');
  console.log('     ↳ Escape closed it');
});

/* ── 5. Closing returns focus to the trigger ────────────────────────────── */
await test('closing via the drawer Close button returns focus to the hamburger', async () => {
  await page.locator('.hamburger-btn').click();
  await page.waitForTimeout(600);
  if (!(await drawerOpen())) throw new Error('the drawer did not open');
  await page.locator(`${NAV} button[aria-label="Close"]`).click();
  await page.waitForTimeout(700);
  if (await drawerOpen()) throw new Error('the drawer is still open after its Close button');
  const f = await focusInfo();
  if (f.label !== 'Toggle Menu') {
    throw new Error(`focus landed on ${f.tag} "${f.label}" instead of the hamburger that opened the drawer`);
  }
  console.log('     ↳ focus restored to the hamburger');
});

/* ── 6. The login modal, opened from the drawer ─────────────────────────── */
await test('the login modal is a named dialog with focus inside and Tab trapped', async () => {
  await page.locator('.hamburger-btn').click();
  await page.waitForTimeout(500);
  const labels = await page.evaluate(
    (sel) => [...document.querySelectorAll(`${sel} button`)].map((b) => b.textContent.trim()),
    NAV,
  );
  const idx = labels.findIndex((l) => /login/i.test(l) && !/admin/i.test(l));
  if (idx < 0) throw new Error(`no Login button in the drawer; buttons were ${JSON.stringify(labels)}`);
  await page.locator(`${NAV} button`).nth(idx).click();
  await page.waitForTimeout(900);

  // Anti-vacuity: the modal must actually be on screen before it is judged.
  const modal = await page.evaluate(() => {
    const shells = [...document.querySelectorAll('.u-modal-shell')].filter(
      (e) => e.offsetWidth > 0 || e.offsetHeight > 0,
    );
    const d = shells.find((e) => e.getAttribute('role') === 'dialog') || shells[0] || null;
    if (!d) return null;
    const nameOf = (el) => {
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const t = document.getElementById(lb);
        return t ? t.textContent.trim() : '';
      }
      return (el.getAttribute('aria-label') || '').trim();
    };
    return {
      shells: shells.length,
      role: d.getAttribute('role'),
      ariaModal: d.getAttribute('aria-modal'),
      name: nameOf(d),
      inputs: d.querySelectorAll('input').length,
      focusInside: d.contains(document.activeElement),
      focusTag: document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
      focusAutofocus: !!document.activeElement?.hasAttribute('data-autofocus'),
    };
  });
  if (!modal) throw new Error('no visible overlay after clicking Login — the modal did not open');
  if (modal.inputs === 0) throw new Error('the visible overlay has no inputs — it is not the login modal');
  if (modal.role !== 'dialog') throw new Error(`the login modal has role=${JSON.stringify(modal.role)}, not "dialog"`);
  if (modal.ariaModal !== 'true') throw new Error(`aria-modal=${JSON.stringify(modal.ariaModal)}, not "true"`);
  if (!modal.name) throw new Error('the login modal has NO accessible name (dangling aria-labelledby or none at all)');
  if (!modal.focusInside) throw new Error(`initial focus stayed outside the dialog (on ${modal.focusTag})`);
  if (!modal.focusAutofocus) {
    throw new Error(`initial focus is on ${modal.focusTag}, not the first field (no data-autofocus target took it)`);
  }

  // The trap: 12 forward Tabs must all stay inside the dialog.
  const escaped = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const d = [...document.querySelectorAll('.u-modal-shell')].find(
        (e) => e.offsetWidth > 0 && e.getAttribute('role') === 'dialog',
      );
      return !!d?.contains(document.activeElement);
    });
    if (!inside) escaped.push(i);
  }
  if (escaped.length) {
    throw new Error(`focus escaped the dialog on ${escaped.length} of 12 Tab presses (at ${escaped.join(', ')})`);
  }
  console.log(
    `     ↳ dialog: role=${modal.role} aria-modal=${modal.ariaModal} name="${modal.name}" ` +
      `inputs=${modal.inputs} focus=${modal.focusTag}${modal.focusAutofocus ? ' [data-autofocus]' : ''} 12/12 trapped`,
  );
});

await browser.close();

const failed = results.filter(([s]) => s === 'fail');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (skipped.length) console.log(`skipped: ${skipped.join(' | ')}`);
process.exit(failed.length ? 1 : 0);
