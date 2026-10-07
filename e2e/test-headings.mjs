/**
 * E2E Test: heading outline of the form routes (§23)
 *
 * WHY THIS EXISTS
 * ---------------
 * Measured 2026-09-14 at 390px, four routes had no usable page heading:
 *
 *   /apply      0 h1 — the page's only headings were two transient <h2>s
 *                      ("loading", "success"), so the idle page had none
 *   /master     0 h1 — and its 12 visual "section titles" were
 *                      <div class="section-title">, which LOOK like headings
 *                      (uppercase, 800 weight, accent colour, rule underneath)
 *                      but are invisible to assistive tech
 *   /ai-cv      0 h1
 *   /siswa-baru the only h1 was inside a tab panel that is `display:none` on
 *               mobile, so the top-most VISIBLE heading was the chat widget's
 *               <h2> — an inverted outline
 *
 * A heading that only looks like a heading is the same defect class as a class
 * that only looks like a class (§21): nothing errors, and a human reading the
 * source sees a heading. Only measurement distinguishes them, which is why this
 * asserts the DOM rather than the source.
 *
 * The page h1 now comes from FormToolbar (see its comment). That fix immediately
 * created a DUPLICATE h1 on /share, whose ShareView carried its own brand <h1> —
 * caught by this same check before it was committed. So the single-h1 assertion
 * is not theoretical.
 *
 * TWO WAYS THIS GUARD COULD LIE, AND WHAT STOPS IT
 * -----------------------------------------------
 * 1. Measuring a LOGIN GATE and reporting green. Without a session /master shows
 *    "Verifikasi Akun Kandidat" with 1 input and NO section titles in the DOM —
 *    so a naive run reports numbers for a page it never reached (§20).
 *    `assertReachedBody` fails loudly instead.
 * 2. Injecting a session where it makes things WORSE. /ai-cv declares
 *    `gate: 'server'`: it re-verifies against the backend, so a fabricated token
 *    is judged invalid and `apiClient` logs out and REDIRECTS TO `/`. It renders
 *    in place only with NO session. Hence the per-route `session` flag.
 *
 * Run against a built artifact:
 *   BASE_URL=http://127.0.0.1:4321 node e2e/test-headings.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

/**
 * A fabricated session, so the routes whose gate only reads the store render
 * their real body. Same shape the UI audit uses.
 *
 * `role` matters: /admin gates on `requiredRole="admin"`, so a kandidat blob
 * bounces off it. Both are still "fabricated" — the point is that these gates
 * read the STORE, not the backend.
 */
function authFor(role) {
  return JSON.stringify({
    sessionToken: `headings-fake-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    role,
    wa: '081234567890',
    name: role === 'admin' ? 'Headings Admin' : 'Headings Check',
    lastChecked: Date.now(),
  });
}

/**
 * Text that means we are looking at a gate, not the page body.
 *
 * ⚠ 'Login Pelamar' WAS REMOVED ON 2026-09-19, and it was a false positive by
 * construction. It is `header.login`, i.e. the label of a normal LOGIN BUTTON —
 * it is rendered by the site header, the drawer, the new desktop section nav,
 * and the login modal's own heading. So "the page contains Login Pelamar" is
 * true of any public page that offers a way to log in, which is every public
 * page. Left in, it makes the check below report "reached the GATE" for pages
 * that are not gates at all (measured: `/`, `/public` and — through a redirect
 * bug — `/admin`, all flagged while rendering their real bodies).
 *
 * The replacements are strings that ONLY a gate state can produce, because each
 * is the copy of the gate itself rather than a control on it:
 *   'Verifikasi Akun Kandidat'        → ai_cv.verify_account, /ai-cv's inline gate
 *   'Mengalihkan ke halaman login...' → ui.redirecting_login, AuthGuard's
 *                                       "no session, redirecting" state
 *   'Akses ditolak. Mengalihkan...'   → ui.access_denied_redirect, AuthGuard's
 *                                       "wrong role, redirecting" state
 * A gate that offers an escape hatch still shows one of these first, so nothing
 * is lost by dropping the button label.
 */
const GATE_MARKERS = [
  'Verifikasi Akun Kandidat',
  'Mengalihkan ke halaman login...',
  'Akses ditolak. Mengalihkan...',
];

/**
 * `session` is the ROLE to fabricate, or null to inject nothing.
 *   'kandidat' / 'admin' → inject authFor(role); the gate only reads the store
 *   null                 → inject nothing. /ai-cv needs this: it is gate:'server',
 *                          so a token it cannot verify makes apiClient log out
 *                          and redirect to `/`.
 */
const ROUTES = [
  { path: '/apply', session: 'kandidat' },
  { path: '/master', session: 'kandidat' },
  { path: '/siswa-baru', session: 'kandidat' },
  { path: '/share', session: 'kandidat' },
  { path: '/ai-cv', session: null },
  { path: '/admin', session: 'admin' },
  { path: '/candidate', session: 'kandidat' },
];

/**
 * Public routes. They get the h1 and skip-link assertions but NOT the toolbar
 * one, and the split is explicit for a reason: this gate refuses to silently
 * skip a check (see `if (!d.bar) throw` below), so pointing the toolbar loop at
 * a page that has no toolbar would report a failure that is not a defect, and
 * loosening that loop would quietly disarm it for the seven routes it exists for.
 *
 * WHY THEY WERE MISSING UNTIL 2026-09-19. The landing-page work (L2) moves the
 * page's single h1 out of the site header and into the hero, and demotes the
 * header's company name to a div — but ONLY on `/`. The gate that is supposed to
 * enforce "exactly one h1" covered none of the routes being changed, so the one
 * criterion the change had to satisfy was unenforceable. `/public` is included
 * too because it is the other route that mounts the header, and there the header
 * h1 is the ONLY h1 — the exact thing a careless global demotion would break.
 */
const PUBLIC_ROUTES = [
  { path: '/', session: null },
  { path: '/public', session: null },
];

/**
 * Routes whose h1 must survive with JavaScript DISABLED.
 *
 * WHY THIS EXISTS. Every assertion above runs with JavaScript enabled, so all of
 * them pass on a page whose h1 exists only after hydration. That was the actual
 * state until 2026-09-23: these three routes mounted `<App client:only="preact" />`,
 * which renders NO server HTML, so with JS off the landing page had **0 h1** and
 * the two others had **0 h1** and rendered 473 / 523 characters respectively —
 * measured in a browser against `server.cjs`. A gate that waits for hydration and
 * then asserts "exactly one h1" cannot see any of that.
 *
 * `/loker` is the job portal and the main public destination, which is why it is
 * here and not merely `/`.
 *
 * The three are now `client:load`, which server-renders and then hydrates.
 * Measured after the change: 1 h1 on all three with JS off, and 0 console / 0 page
 * errors with JS on. The gated routes are deliberately NOT listed — they are
 * session-dependent SPAs that cannot work without JavaScript, so server-rendering
 * them would buy no reader anything.
 */
const NO_JS_ROUTES = ['/', '/public', '/loker'];

/**
 * Routes whose CONTENT — not just their heading — must survive without
 * JavaScript. `/` is deliberately absent: it already renders its 17 sections as
 * server HTML (measured 9,776 characters with JS off), so it has no panel or
 * island-only content to assert. See the "not left with an empty page" check.
 */
const NO_JS_CONTENT_ROUTES = ['/public', '/loker'];

/** Routes asserted for h1 and skip-link correctness. */
const ALL_HEADING_ROUTES = [...ROUTES, ...PUBLIC_ROUTES];

/**
 * Routes where we additionally require that the body was actually reached.
 * /ai-cv is excluded: it cannot be reached without a real AUDIT_AI_CV_TOKEN, so
 * for it we assert only the toolbar h1 — which renders outside the gate, and is
 * therefore honest to assert.
 *
 * ⚠ THE SESSION ROLE MUST BE CARRIED, NOT THE BOOLEAN `true`. Until 2026-09-19
 * this list was a flat array of paths and the loop below called
 * `inspect(route, width, true)` — passing the literal `true` where `authFor()`
 * expects a ROLE. The fabricated blob therefore read `{ role: true }`, and
 * `/admin` is the only body route whose guard checks the role at all
 * (`AuthGuard requiredRole="admin"`, admin.astro:19). So it redirected to `/`,
 * the gate read the LANDING PAGE's DOM, and — because `/` contains a
 * "Login Pelamar" button — reported "reached the GATE" for a page it never
 * loaded. The other four routes have no `requiredRole`, so `{ role: true }`
 * slipped through and they passed, which is why exactly one route failed.
 *
 * The mis-read was harmless only while the landing page happened not to contain
 * the marker; the L2 hero/nav work added a visible "Login Pelamar" button to `/`
 * and turned a silent wrong-page read into a red gate. The redirect is now
 * caught by the `d.path !== path` guard that every other loop in this file
 * already had and this one did not.
 */
const BODY_ROUTES = [
  { path: '/apply', session: 'kandidat' },
  { path: '/master', session: 'kandidat' },
  { path: '/siswa-baru', session: 'kandidat' },
  { path: '/admin', session: 'admin' },
  { path: '/candidate', session: 'kandidat' },
];

/**
 * /master is a 5-step wizard and each step renders CONDITIONALLY, so one page
 * load only ever exposes the current step's section titles — step 1 has 2 of the
 * 12. Asserting on that single step would repeat §20's mistake: reporting a
 * number for content the page never rendered. `changeStep` does not validate
 * (it only clamps 1..5) and the "next" button exists for every step < 5, so the
 * guard walks the whole wizard and collects every title.
 */
const SECTION_TITLE_ROUTE = '/master';
const WIZARD_STEPS = 5;
const EXPECTED_SECTION_TITLES = 12;
/** The wizard's "next" button label (i18n `master.next`). */
const WIZARD_NEXT_LABEL = 'Lanjut';

/**
 * Walk /master step by step, collecting every `.section-title` tag. Returns the
 * tags in encounter order plus the per-step counts, so the caller can tell "all
 * titles are headings" apart from "the walk never reached the later steps".
 */
async function walkWizardSectionTitles(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((v) => {
    try {
      localStorage.setItem('asj_auth', v);
    } catch {
      /* storage unavailable — the gate will show and the caller will say so */
    }
  }, authFor('kandidat'));
  const page = await ctx.newPage();
  const tags = [];
  const perStep = [];
  try {
    await page.goto(BASE + SECTION_TITLE_ROUTE, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);

    for (let step = 1; step <= WIZARD_STEPS; step++) {
      const stepTags = await page.$$eval('.section-title', (els) => els.map((el) => el.tagName));
      perStep.push(stepTags.length);
      tags.push(...stepTags);
      if (step === WIZARD_STEPS) break;

      const advanced = await page.evaluate((label) => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          (b.textContent || '').trim().startsWith(label),
        );
        if (!btn) return false;
        btn.click();
        return true;
      }, WIZARD_NEXT_LABEL);
      if (!advanced) {
        throw new Error(
          `step ${step} has no "${WIZARD_NEXT_LABEL}" button — the walk cannot reach the rest of the wizard`,
        );
      }
      await page.waitForTimeout(250);
    }
  } finally {
    await ctx.close();
  }
  return { tags, perStep };
}

/**
 * ⚠ WHAT THIS GATE DOES NOT COVER — MEASURED 2026-09-28, NOT ASSUMED.
 *
 * The outline checks below read each route ONCE. For /admin that means the default
 * `kelola` tab only: `AdminPanel` renders a single tab at a time
 * (`<TabContent tab={activeTab} />`, AdminPanel.tsx:229), so the other nine tabs'
 * headings are never in the DOM. /candidate is the same shape — the fabricated
 * session is rejected by the API, so it renders "Data tidak ditemukan!" and only
 * the shell's `H1` is visible.
 *
 * This was found the honest way: mutation M8 aimed at the `agenda` tab's heading
 * and M9 at the candidate app-list heading, and BOTH SURVIVED — not because the
 * assertions are weak, but because the mutated markup was never rendered by the
 * load under test (see M8/M9 in e2e/test-headings.mutations.sh). Re-aimed at
 * headings the load DOES render, both are KILLED.
 *
 * A tab WALK was written and then REMOVED, because it could not be made
 * deterministic with a fabricated session. The tabs are hash-routable
 * (`tabFromHash()`, AdminPanel.tsx:96), so `/admin#agenda` mounts the tab
 * directly and no clicking (or responsive sidebar) is involved — but any tab that
 * mounts `api.secure(...)` gets its rejection routed through `apiClient`, which
 * logs the session out and redirects to `/`. Measured, twice, ten minutes apart:
 *
 *   run A (one page, tabs in order): #kelola stays, then #dbjob … #wa bounce
 *   run B (fresh context per tab):   #kelola #tugas stay; #dbjob #wa #config
 *                                    #agenda bounce; #mail stays
 *
 * The two runs DISAGREE — `#dbjob` and `#mail` flip — so the outcome is a race
 * between the API's rejection and the redirect, not a property of the tab id. A
 * gate built on it would be flaky, and a flaky gate is worse than an absent one:
 * it gets muted, and then it never reports anything. So no tab-walk ships.
 *
 * Asserting the LANDING page and calling it "the agenda tab's outline" was the
 * available alternative and is exactly the §20 mistake this file exists to
 * prevent — reporting a verdict for content that was never rendered. The coverage
 * gap is therefore RECORDED and left open, to be closed by a gate that can hold a
 * session the API accepts (which this one must not require — it runs in CI with
 * no credentials).
 *
 * Consequence for mutation M8: it targets `TabKelola.tsx`, the DEFAULT tab's
 * heading, precisely because that is the tab this load reaches. It proves the
 * outline rule fires; it does not claim the other nine tabs are covered.
 */

let browser;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failures.push(name);
  }
}

async function inspectUncached(route, width, useSession) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  if (useSession) {
    await ctx.addInitScript((v) => {
      try {
        localStorage.setItem('asj_auth', v);
      } catch {
        /* storage unavailable — the page shows its gate and we will say so */
      }
    }, authFor(useSession));
  }
  const page = await ctx.newPage();
  // Do NOT let a failed navigation fall through to the DOM read. `goto().catch()`
  // followed by evaluate() reads the ERROR page and reports its empty DOM as
  // data — during §24 a dead server looked like "these routes have no headings",
  // and a 502 was reported as "redirected". Fail with the reason instead.
  const resp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
  const status = resp ? resp.status() : 0;
  if (status !== 200) {
    await ctx.close();
    throw new Error(`GET ${route} -> HTTP ${status}; refusing to read the DOM of an error page`);
  }
  // The GATED islands are still `client:only="preact"`, so their heading appears
  // after hydration — not in the server HTML. The three PUBLIC routes are not:
  // measured 2026-09-23 they are `client:load`, so their h1 IS in the server HTML
  // and this wait is not what makes the assertion below pass. The no-JS check at
  // the end of this file is what pins that difference down.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);

  let data;
  try {
    data = await page.evaluate((markers) => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
      };
      const h1s = [...document.querySelectorAll('h1')];
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
      const firstVisible = headings.find(visible);
      const sectionTitles = [...document.querySelectorAll('.section-title')];
      const text = document.body.innerText;
      return {
        path: location.pathname,
        h1Count: h1s.length,
        h1Visible: h1s.filter(visible).length,
        h1Text: h1s.length ? h1s[0].textContent.trim().slice(0, 40) : '',
        h1: h1s.length
          ? (() => {
              const r = h1s[0].getBoundingClientRect();
              return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
            })()
          : null,
        firstVisibleTag: firstVisible ? firstVisible.tagName : null,
        firstVisibleText: firstVisible ? firstVisible.textContent.trim().slice(0, 40) : null,
        /**
         * The visible outline, in DOM order. Levels alone are not enough: §24
         * found /admin skipping 1 -> 3 and /candidate repeating the same h3 text
         * back to back, and neither shows up in a count of headings.
         */
        visibleHeadings: headings.filter(visible).map((h) => ({
          level: Number(h.tagName.slice(1)),
          text: (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        })),
        sectionTitleTags: sectionTitles.map((el) => el.tagName),
        /**
         * SKIP LINKS. `BaseLayout` renders `<a href="#main-content"
         * class="skip-link">`, so on any page that renders BaseLayout there is a
         * link whose whole purpose is to move focus past the nav — and it is
         * silently useless if `#main-content` does not exist on that page.
         *
         * Measured from the ARTIFACT, not a proxy: resolve each link's fragment
         * with `querySelector` and report how many skip-links were found at all.
         * A rule that shrugged when it found none would pass on a page whose
         * whole layout changed — so `count` is returned and asserted.
         */
        skipLinks: (() => {
          const links = [...document.querySelectorAll('a.skip-link, a[href^="#main-content"]')];
          return links.map((a) => {
            const frag = (a.getAttribute('href') || '').replace(/^#/, '');
            let target = null;
            try {
              target = frag ? document.querySelector(`#${CSS.escape(frag)}`) : null;
            } catch {
              target = null;
            }
            return {
              href: a.getAttribute('href'),
              fragment: frag,
              targetExists: target !== null,
              targetTag: target ? target.tagName : null,
            };
          });
        })(),
        gate: markers.find((m) => m && text.includes(m)) || null,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        /**
         * MAIN LANDMARKS. A page needs its `<main>` for the skip-link above to
         * have a destination, and it needs EXACTLY ONE. The `.astro` page shells
         * each render `<main id="main-content">` for that reason — but a hydrated
         * island that also renders a `<main>` puts a SECOND one INSIDE the first.
         *
         * Measured 2026-09-28 on the built artifact, BEFORE the fix: `/apply`,
         * `/master`, `/share` and `/siswa-baru` each had 2 `<main>` elements, with
         * the shell's own `<main>` reporting one nested `<main>` inside it. Two
         * `main` landmarks on one page is invalid HTML and, unlike a stray wrapper,
         * browsers do NOT merge them: a screen-reader user gets two "main" regions
         * and no way to tell which is the page body. The skip-link still worked,
         * so nothing else in this file noticed.
         *
         * Depth, not just the count, is what makes the collision visible — so both
         * are returned and both are asserted. Reported as `role` too, because a
         * `[role="main"]` collides with an implicit `<main>` exactly the same way.
         */
        mainLandmarks: [...document.querySelectorAll('main, [role="main"]')].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.id || '',
            tag: el.tagName,
            visible: r.width > 0 && r.height > 0,
            nestedCount: el.querySelectorAll('main, [role="main"]').length,
          };
        }),
        /**
         * Toolbar geometry. The collision check must be an invariant that CAN
         * fail: comparing `h1.right` to the toggles' left edge cannot, because
         * the h1 is `flex-1` and therefore ends exactly where the toggles begin
         * by construction. What actually breaks when the title is unbounded is
         * that the toggles get pushed out of the bar — so that is what we assert.
         */
        bar: (() => {
          const bar = document.querySelector('.fixed.top-0');
          if (!bar) return null;
          const r = bar.getBoundingClientRect();
          const kids = [...bar.children];
          const last = kids[kids.length - 1];
          const lastRect = last ? last.getBoundingClientRect() : null;
          return {
            right: Math.round(r.right),
            scrollWidth: bar.scrollWidth,
            clientWidth: bar.clientWidth,
            togglesRight: lastRect ? Math.round(lastRect.right) : null,
            togglesLeft: lastRect ? Math.round(lastRect.left) : null,
          };
        })(),
      };
    }, GATE_MARKERS);
  } catch (err) {
    await ctx.close();
    throw new Error(`could not read the DOM (navigation?): ${err.message.slice(0, 60)}`);
  }
  await ctx.close();
  return data;
}

/**
 * Memoised wrapper: several checks inspect the same (route, width, session), and
 * each inspection is a fresh browser context + page load. Without this the suite
 * loads every page four times, which is slow and needlessly flaky.
 */
const inspectionCache = new Map();
function inspect(route, width, useSession) {
  const key = `${route}|${width}|${useSession}`;
  if (!inspectionCache.has(key)) {
    inspectionCache.set(key, inspectUncached(route, width, useSession));
  }
  return inspectionCache.get(key);
}

/** Refuse to report on a page we never reached (§20). */
function assertReachedBody(d) {
  if (d.gate) {
    throw new Error(
      `reached the GATE (${JSON.stringify(d.gate)}), not the page body — any number below would be meaningless`,
    );
  }
}

/**
 * Read the heading outline with JavaScript DISABLED, i.e. from the SERVER HTML.
 *
 * `waitUntil` is 'domcontentloaded' rather than 'networkidle': with scripting off
 * there is nothing to wait for, and asking for networkidle only risks a timeout on
 * a page that is already complete. The short settle is for layout, not for
 * hydration — nothing hydrates here.
 *
 * The status is checked for the same reason every other reader in this file checks
 * it: a 404 page has no h1 either, and reporting that as "the h1 is missing" would
 * send the reader to the wrong file.
 */
/**
 * Memoised, for the same reason `inspect` is: the two checks below read the same
 * (route, no-JS) pair, and each read is a fresh context and page load.
 */
const noJsCache = new Map();
function inspectNoJs(route) {
  if (!noJsCache.has(route)) noJsCache.set(route, inspectNoJsUncached(route));
  return noJsCache.get(route);
}

async function inspectNoJsUncached(route) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 1,
    javaScriptEnabled: false,
  });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const status = resp ? resp.status() : 0;
    if (status !== 200) {
      throw new Error(`GET ${route} -> HTTP ${status}; refusing to read the DOM of an error page`);
    }
    await page.waitForTimeout(300);
    return await page.evaluate(() => {
      const h1s = [...document.querySelectorAll('h1')];
      return {
        path: location.pathname,
        h1Count: h1s.length,
        h1Text: h1s.length ? (h1s[0].textContent || '').replace(/\s+/g, ' ').trim() : '',
        /**
         * THE HEADER ELEMENT — not "any link inside a header or a nav".
         *
         * This was `document.querySelectorAll('header a, nav a').length`, and it
         * could not fail. The FOOTER nav (`aria-label="Footer navigation"`) is
         * rendered by the Astro layout rather than by the island, so it puts 5
         * links into the server HTML of EVERY page. Measured 2026-09-23, JS off,
         * 390px, against a tree where `/loker` mounted its App with
         * `client:only="preact"` — i.e. with no server HTML for the header:
         *
         *   route   directive      h1  <header>  'header a, nav a'  footer nav a
         *   /loker  client:only     0      0            5               5
         *   /loker  client:load     1      1            5               5
         *
         * The count is 5 either way, so the check passed while the header was
         * absent from the server HTML entirely — the exact defect it is named
         * for, and the only thing the M-E mutation revealed. `<header>` is 0 vs
         * 1 and does discriminate.
         *
         * `header a` is 0 even on the HEALTHY tree, so the links inside the
         * header are not server-rendered either; only the element can be
         * asserted. Do not "strengthen" this to a link count.
         */
        headerEls: document.querySelectorAll('header').length,
        bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
        /**
         * Text a no-JS visitor can actually READ inside the content panels, and
         * the guidance offered when the content itself cannot be rendered.
         *
         * These exist because the h1/header assertions above are satisfied by a
         * page with nothing on it — see the "not left with an empty page" check.
         */
        panelText: [...document.querySelectorAll('[data-public-panel]')]
          .filter((el) => !el.hasAttribute('hidden'))
          .reduce((s, el) => s + (el.innerText || '').replace(/\s+/g, ' ').trim().length, 0),
        noscriptText: [...document.querySelectorAll('noscript')]
          .reduce((s, el) => s + (el.textContent || '').replace(/\s+/g, ' ').trim().length, 0),
      };
    });
  } finally {
    await ctx.close();
  }
}

async function run() {
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });

  for (const { path, session } of ALL_HEADING_ROUTES) {
    for (const width of [390, 1280]) {
      const label = `${width}px ${path}`;

      await test(`${label}: the document has exactly one h1`, async () => {
        const d = await inspect(path, width, session);
        if (d.path !== path) {
          throw new Error(
            `redirected to ${d.path} — not measuring this page (this is what /ai-cv does when it ` +
              `receives a token it cannot verify; see the session flag)`,
          );
        }
        if (d.h1Count !== 1) {
          // The message is direction-aware because the two failures have opposite
          // causes, and the gate now covers routes that have no FormToolbar at all
          // (`/`, `/public`). An earlier wording blamed "a second h1 alongside the
          // FormToolbar title" for both — which is not even the shape of the
          // failure on `/`, where demoting the hero h1 yields ZERO, and there is no
          // toolbar to blame. A message that misnames the cause sends the reader to
          // the wrong file.
          const cause =
            d.h1Count === 0
              ? 'none was found — on this route the header company name is a div and something ' +
                'else was supposed to carry the h1 (on / that is the hero headline in App.tsx)'
              : 'more than one was found — a component carries its own alongside the page title ' +
                '(this is exactly how /share broke, with a brand h1 in ShareView)';
          throw new Error(`expected exactly 1 h1, found ${d.h1Count} — ${cause}`);
        }
      });

      await test(`${label}: that h1 is actually visible`, async () => {
        const d = await inspect(path, width, session);
        if (d.h1Visible !== 1) {
          throw new Error(
            `h1 is not visible (${d.h1Count} h1, ${d.h1Visible} visible, text=${JSON.stringify(d.h1Text)})`,
          );
        }
      });

      await test(`${label}: the first visible heading is the h1`, async () => {
        const d = await inspect(path, width, session);
        if (d.firstVisibleTag !== 'H1') {
          throw new Error(`outline starts at ${d.firstVisibleTag} ${JSON.stringify(d.firstVisibleText)}, not H1`);
        }
      });

      await test(`${label}: no horizontal overflow`, async () => {
        const d = await inspect(path, width, session);
        if (d.overflow > 1) throw new Error(`page overflows horizontally by ${d.overflow}px`);
      });
    }
  }

  /**
   * The OUTLINE, not just the count. §23 fixed pages that had NO usable heading.
   * §24 found two pages whose headings exist but whose STRUCTURE is wrong, and
   * neither defect is visible in a count of headings:
   *   /admin      H1 -> H3 -> H3 -> H2  (a level skipped, and the h2 came last)
   *   /candidate  H3 -> H3 with the SAME text (a child heading at its parent's level)
   * Both sat on the two routes §23 never measured, which is why they are here now.
   */
  for (const { path, session } of ROUTES) {
    for (const width of [390, 1280]) {
      const label = `${width}px ${path}`;

      await test(`${label}: heading levels do not skip a level`, async () => {
        const d = await inspect(path, width, session);
        if (d.path !== path) throw new Error(`redirected to ${d.path}`);
        const h = d.visibleHeadings;
        for (let i = 1; i < h.length; i++) {
          if (h[i].level > h[i - 1].level + 1) {
            throw new Error(
              `the outline jumps from H${h[i - 1].level} ${JSON.stringify(h[i - 1].text)} ` +
                `to H${h[i].level} ${JSON.stringify(h[i].text)} — a level was skipped`,
            );
          }
        }
      });

      await test(`${label}: no sibling heading repeats the same text`, async () => {
        const d = await inspect(path, width, session);
        if (d.path !== path) throw new Error(`redirected to ${d.path}`);
        const h = d.visibleHeadings;
        for (let i = 1; i < h.length; i++) {
          if (h[i].level === h[i - 1].level && h[i].text && h[i].text === h[i - 1].text) {
            throw new Error(
              `H${h[i].level} ${JSON.stringify(h[i].text)} appears twice in a row — ` +
                `a nested heading is sitting at its parent's level`,
            );
          }
        }
      });
    }
  }

  /**
   * SKIP LINKS. `BaseLayout.astro` renders
   *   `<a href="#main-content" class="skip-link">`
   * so every page that uses the layout ships a link whose entire purpose is to
   * jump focus past the navigation. If `#main-content` is missing from that
   * page's body the link still renders, still looks correct, and does nothing
   * when a keyboard user activates it — no error, no warning.
   *
   * This closes five pages at once, which is why it is asserted for every route
   * rather than spot-checked.
   *
   * THE ASSERTION IS ON THE RESOLVED TARGET, not on the attribute. Reading
   * `href="#main-content"` and declaring victory proves only that the string is
   * spelled right; the defect is that the target does not exist. And a rule that
   * silently passed when it found NO skip-links would go green on a page whose
   * layout was replaced — so the count is asserted too, with the routes that are
   * expected to carry one named explicitly.
   */
  for (const { path, session } of ALL_HEADING_ROUTES) {
    for (const width of [390, 1280]) {
      const label = `${width}px ${path}`;

      await test(`${label}: every skip-link target exists`, async () => {
        const d = await inspect(path, width, session);
        if (d.path !== path) throw new Error(`redirected to ${d.path}`);

        if (d.skipLinks.length === 0) {
          throw new Error(
            'no skip-link found. Every route here renders BaseLayout, which always emits ' +
              '`<a href="#main-content" class="skip-link">` — finding none means the selector ' +
              'or the layout changed, not that the page is fine.',
          );
        }

        const broken = d.skipLinks.filter((l) => !l.targetExists);
        if (broken.length) {
          throw new Error(
            `${broken.length}/${d.skipLinks.length} skip-link(s) point at a fragment that does ` +
              `not exist: ${broken.map((l) => `${l.href} (no #${l.fragment})`).join(', ')} — ` +
              `the link renders and does nothing when activated.`,
          );
        }

        // The skip link is named for a reason: assert it reaches the landmark,
        // not merely some element that happens to share the id.
        for (const l of d.skipLinks) {
          if (l.targetTag !== 'MAIN') {
            throw new Error(
              `skip-link ${l.href} resolves to <${l.targetTag}>, not <main> — the target of a ` +
                `skip link must be the main landmark, or focus lands somewhere arbitrary.`,
            );
          }
        }
      });
    }
  }

  /**
   * ONE MAIN LANDMARK, AND IT IS NOT NESTED.
   *
   * The skip-link block above proves `#main-content` EXISTS. It cannot see the
   * defect this block exists for: a second `<main>` nested inside it. Measured
   * 2026-09-28 before the fix — `/apply`, `/master`, `/share`, `/siswa-baru` each
   * rendered 2 `main` landmarks, the shell's own reporting `nestedCount=1`. Every
   * other check in this file passed on those pages, which is why the count is
   * asserted here rather than left to the skip-link check to notice.
   *
   * WHY BOTH ASSERTIONS. They fail for different reasons and the fix differs:
   *   - count > 1    → a component renders its own `<main>` alongside the shell's
   *                    (`/share` broke this way TWICE: once as a brand `<h1>` in
   *                    ShareView, now as a `<main>` in five islands)
   *   - nestedCount  → the same defect, but the island's element is INSIDE the
   *                    shell's rather than beside it. A count of 2 catches it, but
   *                    only the nesting check names the shape, and the shape is
   *                    what tells you which file to open.
   *
   * THE ROUTES ARE ASSERTED, NOT HOPED FOR. A selector that matched nothing would
   * report "0 main landmarks" and the count assertion would fail loudly — good —
   * but the ISLAND routes are `client:only`, so a page read before hydration has
   * the shell's `<main>` and not the island's. The 400ms wait in `inspect` is what
   * makes the island's element observable; if that regressed, these routes would
   * go back to a false green. So each route must find AT LEAST one visible `main`
   * and the assertion is skipped only when the route redirected or gated (both of
   * which are already failures in the blocks above).
   */
  for (const { path, session } of ALL_HEADING_ROUTES) {
    for (const width of [390, 1280]) {
      const label = `${width}px ${path}`;

      await test(`${label}: exactly one main landmark, not nested`, async () => {
        const d = await inspect(path, width, session);
        if (d.path !== path) throw new Error(`redirected to ${d.path}`);

        const total = d.mainLandmarks.length;
        if (total === 0) {
          throw new Error(
            'no main landmark found. Every route here renders BaseLayout, whose skip-link ' +
              'targets `#main-content` — finding none means the layout or the selector changed, ' +
              'not that the page is fine.',
          );
        }
        if (total > 1) {
          const shape = d.mainLandmarks
            .map((m) => `${m.tag}${m.id ? `#${m.id}` : ''}${m.nestedCount ? `(holds ${m.nestedCount})` : ''}`)
            .join(' + ');
          throw new Error(
            `${total} main landmarks (${shape}) — a page must have exactly one. A component ` +
              'renders its own `<main>` alongside or inside the shell\'s. Screen readers do NOT ' +
              'merge them, so this is two "main" regions with no way to tell them apart. The five ' +
              'islands that did this (ApplyFullForm, MasterFullForm, ShareView, SiswaBaruForm, ' +
              'AiCvForm) render a `<div>` instead — the class string is unchanged, only the role.',
          );
        }
        const nested = d.mainLandmarks.find((m) => m.nestedCount > 0);
        if (nested) {
          throw new Error(
            `the main landmark contains ${nested.nestedCount} more main landmark(s) inside it ` +
              `(${nested.tag}${nested.id ? `#${nested.id}` : ''}) — nested \`main\` is invalid and ` +
              'splits the page body into indistinguishable regions.',
          );
        }
      });
    }
  }

  // The toolbar title must stay bounded. §11.1 was this defect in the other
  // header, and the fix there is the rule here: bound the TEXT element, do not
  // pad its container. An unbounded title pushes the theme/lang toggles out of
  // the bar — which is measurable, unlike "the two boxes touch".
  for (const { path, session } of ROUTES) {
    await test(`390px ${path}: the toolbar title stays bounded (toggles not pushed out)`, async () => {
      const d = await inspect(path, 390, session);
      if (d.path !== path) throw new Error(`redirected to ${d.path}`);
      if (!d.bar) throw new Error('no toolbar to measure');
      if (d.bar.togglesRight === null) throw new Error('toolbar has no toggles');
      if (d.bar.togglesRight > d.bar.right + 1) {
        throw new Error(`the toggles are pushed out of the bar: right edge ${d.bar.togglesRight} > bar right ${d.bar.right}`);
      }
      if (d.bar.scrollWidth > d.bar.clientWidth + 1) {
        throw new Error(`the toolbar overflows: scrollWidth ${d.bar.scrollWidth} > clientWidth ${d.bar.clientWidth}`);
      }
    });
  }

  // Without this, every assertion above can pass while the page under test is a
  // login gate — see assertReachedBody.
  for (const { path, session } of BODY_ROUTES) {
    for (const width of [390, 1280]) {
      await test(`${width}px ${path}: the page body was reached, not a login gate`, async () => {
        const d = await inspect(path, width, session);
        // Same guard as every other loop here. Without it a redirect is read as
        // data about the page that was requested — which is exactly how this
        // check reported "reached the GATE" for a page it never loaded.
        if (d.path !== path) throw new Error(`redirected to ${d.path}`);
        assertReachedBody(d);
      });
    }
  }

  /**
   * CONTROLS FOR `GATE_MARKERS` (added 2026-09-23).
   *
   * `assertReachedBody` can only FAIL on a page that contains a marker, and
   * nothing above proves it can fail at all. Both mutations that target the
   * marker list SURVIVED this battery until these two checks existed — measured:
   * M-B ('Login Pelamar' re-added as a marker) and M-C (markers emptied) both
   * came back SURVIVED. The reason is structural, not a bug in the mutations: on
   * a healthy tree every inspected route renders its real body, so the marker
   * list is never consulted in the direction those mutations weaken. A guard
   * whose failure mode is unreachable is a hypothesis, so both directions are
   * pinned explicitly here.
   *
   * 1. POSITIVE — a route with NO session IS a gate, and must be read as one.
   *    `/master` is the only body route that renders its gate IN PLACE without a
   *    session. Measured 2026-09-23 at 1280px: HTTP 200 on `/master`, 189
   *    characters of body text, marker 'Verifikasi Akun Kandidat'. `/admin` and
   *    `/candidate` REDIRECT to `/` instead (9271 characters — the landing page),
   *    so neither can be used for this. Kills M-C: with the markers emptied,
   *    `d.gate` is null here and this throws.
   *
   * 2. FALSE POSITIVE — a public page that offers a login must NOT be read as a
   *    gate. `/` contains the literal 'Login Pelamar' (`header.login`, the label
   *    of an ordinary login button), which is exactly why that string was removed
   *    from the list. Kills M-B: re-adding it makes `d.gate` truthy on `/` here
   *    and this throws.
   */
  for (const width of [390, 1280]) {
    await test(`${width}px /master without a session: the gate IS detected (positive control)`, async () => {
      const d = await inspect('/master', width, null);
      if (d.path !== '/master') throw new Error(`redirected to ${d.path}`);
      if (!d.gate) {
        throw new Error(
          'the gate was NOT detected — GATE_MARKERS no longer matches the gate copy, so ' +
            'assertReachedBody cannot fail and every "the page body was reached" check above ' +
            'is vacuous',
        );
      }
    });

    await test(`${width}px /: a public page is NOT mistaken for a gate (false-positive control)`, async () => {
      const d = await inspect('/', width, null);
      if (d.path !== '/') throw new Error(`redirected to ${d.path}`);
      if (d.gate) {
        throw new Error(
          `a public page was read as a gate (${JSON.stringify(d.gate)}) — that marker matches a ` +
            'CONTROL on the page (a login button), not the copy of the gate itself',
        );
      }
    });
  }

  // /master's section titles are the reason this file exists: they were
  // <div class="section-title"> — visually headings, semantically nothing. The
  // wizard renders one step at a time, so this must walk all five steps: a
  // step-1-only check proves 2 of 12 and would happily pass while step 3 still
  // shipped a div (mutation M7 pins exactly that).
  for (const width of [390, 1280]) {
    await test(`${width}px ${SECTION_TITLE_ROUTE}: every wizard section title is a real heading`, async () => {
      assertReachedBody(await inspect(SECTION_TITLE_ROUTE, width, true));
      const { tags, perStep } = await walkWizardSectionTitles(width);
      if (tags.length !== EXPECTED_SECTION_TITLES) {
        throw new Error(
          `walked ${perStep.length} step(s) and found ${tags.length} .section-title ` +
            `(expected ${EXPECTED_SECTION_TITLES}; per step: ${perStep.join(',')}). ` +
            `Fewer means the walk did not reach every step, so any "all headings" verdict ` +
            `would be green for content that was never rendered (§20).`,
        );
      }
      const notHeadings = tags.filter((t) => !/^H[1-6]$/.test(t));
      if (notHeadings.length) {
        throw new Error(
          `${notHeadings.length} of ${tags.length} .section-title elements are not headings ` +
            `(found ${[...new Set(notHeadings)].join(', ')}) — they only look like headings`,
        );
      }
    });
  }

  /**
   * THE SERVER HTML. Every assertion above runs with JavaScript enabled, so all
   * of them pass on a page whose h1 exists only after hydration — which was the
   * real state of these three routes until 2026-09-23 (0 h1 with JS off). This is
   * the only check in the file that can see the difference, and it is asserted
   * separately from the count above on purpose: a green "exactly one h1" says
   * nothing about WHERE that h1 came from.
   */
  for (const route of NO_JS_ROUTES) {
    await test(`no-JS ${route}: the h1 is in the SERVER HTML, not only after hydration`, async () => {
      const d = await inspectNoJs(route);
      if (d.path !== route) throw new Error(`redirected to ${d.path}`);
      if (d.h1Count !== 1) {
        throw new Error(
          `expected exactly 1 h1 with JavaScript disabled, found ${d.h1Count}. This route mounts ` +
            `its header inside a Preact island, and \`client:only="preact"\` emits NO server HTML — ` +
            `so the h1 does not exist for a crawler or a no-JS reader. Use \`client:load\`. ` +
            `(for reference this render produced ${d.bodyText} characters of body text)`,
        );
      }
      if (!d.h1Text) {
        throw new Error('the h1 is present but empty — an empty heading is not a heading');
      }
    });

    await test(`no-JS ${route}: the <header> is in the SERVER HTML too`, async () => {
      const d = await inspectNoJs(route);
      if (d.path !== route) throw new Error(`redirected to ${d.path}`);
      if (d.headerEls === 0) {
        throw new Error(
          'no <header> in the server HTML — the header lives in the island, so a visitor ' +
            'without JavaScript gets the page without its header (brand, company name, nav). ' +
            'Use `client:load`.',
        );
      }
    });
  }

  /**
   * CONTENT, not just the heading.
   *
   * Every assertion above is satisfied by a page that renders almost nothing.
   * MEASURED 2026-10-07, JavaScript off: `/public` rendered **39 characters** and
   * `/loker` **104** (against 9,776 on `/`). Two causes stacked:
   *
   *   • `LokerTable` is `client:only="preact"` — it emits NO server HTML at all;
   *   • `/public`'s "Program & Layanan" panel carried the `hidden` attribute and
   *     its only opener was a bundled `<script>`, so that content was
   *     **unreachable**, not merely unrendered.
   *
   * A heading over an empty page is not a page. The floor is deliberately low and
   * accepts EITHER outcome, because for content that is a live database query
   * there are only two honest ones: server-render it, or tell the visitor what to
   * do instead. What is not acceptable is silence.
   */
  for (const route of NO_JS_CONTENT_ROUTES) {
    await test(`no-JS ${route}: the visitor is not left with an empty page`, async () => {
      const d = await inspectNoJs(route);
      if (d.path !== route) throw new Error(`redirected to ${d.path}`);
      if (d.panelText >= 400 || d.noscriptText >= 120) return;
      throw new Error(
        `with JavaScript disabled this route renders ${d.bodyText} characters of body text, ` +
          `${d.panelText} of them inside its content panels, and offers no <noscript> guidance ` +
          `(${d.noscriptText} characters). Either server-render the content — do not leave a ` +
          `panel behind a JS-only opener, and do not put content only a ` +
          '`client:only` island can produce — or ship a <noscript> that gives the visitor a way ' +
          'to reach the information.',
      );
    });
  }

  await browser.close();

  console.log('');
  if (failures.length) {
    console.log(`headings: ${failures.length} check(s) FAILED`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('headings: all checks passed.');
  }
}

run().catch((err) => {
  console.error('headings: harness error —', err.message);
  process.exitCode = 1;
});
