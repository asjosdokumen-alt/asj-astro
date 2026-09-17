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

/** Text that means we are looking at a gate, not the page body. */
const GATE_MARKERS = ['Verifikasi Akun Kandidat', 'Login Pelamar'];

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
 * Routes where we additionally require that the body was actually reached.
 * /ai-cv is excluded: it cannot be reached without a real AUDIT_AI_CV_TOKEN, so
 * for it we assert only the toolbar h1 — which renders outside the gate, and is
 * therefore honest to assert.
 */
const BODY_ROUTES = ['/apply', '/master', '/siswa-baru', '/admin', '/candidate'];

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
  // These islands are `client:only="preact"`, so the heading appears after
  // hydration — not in the server HTML.
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
        gate: markers.find((m) => text.includes(m)) || null,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
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

async function run() {
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });

  for (const { path, session } of ROUTES) {
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
          throw new Error(
            `expected exactly 1 h1, found ${d.h1Count} — a second h1 means some component carries ` +
              `its own alongside the FormToolbar title (this is exactly how /share broke)`,
          );
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
  for (const { path, session } of ROUTES) {
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
  for (const route of BODY_ROUTES) {
    for (const width of [390, 1280]) {
      await test(`${width}px ${route}: the page body was reached, not a login gate`, async () => {
        assertReachedBody(await inspect(route, width, true));
      });
    }
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
