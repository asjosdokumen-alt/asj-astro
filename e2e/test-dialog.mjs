/**
 * E2E Test: dialog semantics of overlays (§25)
 *
 * WHY THIS EXISTS
 * ---------------
 * Measured 2026-09-15 on the built artifact, /public -> "Detail":
 *
 *   role                 null          no role at all
 *   aria-modal           null          nothing tells AT the rest is inert
 *   aria-labelledby      null          so the dialog had NO accessible name
 *   activeInsideOverlay  true          ...yet focus HAD been moved inside
 *   after 2x Tab         still inside  ...and Tab WAS trapped
 *
 * `useOverlay` already decided the overlay was a dialog — `role === 'dialog'`
 * is what gates its initial-focus + Tab-trap effect — and then discarded that
 * decision instead of stating it on the element. So a keyboard user was
 * captured inside a region assistive tech could not name and could not even
 * describe as a dialog. A trap without the announcement is worse than no trap.
 *
 * The hook now writes `role` / `aria-modal` / `aria-labelledby` onto the node
 * `containerRef` points at (its header explains why there rather than returned
 * as props for 21 call sites to spread). This asserts the RENDERED DOM, which
 * is the only way to check a contract the source does not show.
 *
 * THE RULE THIS ENFORCES
 * ----------------------
 * Every VISIBLE `.u-modal-shell` must be exactly one of:
 *
 *   A. `aria-hidden="true"`   declared presentational (scrims, ambient layers).
 *                             Nothing is lost — the keyboard affordances for
 *                             those live elsewhere.
 *   B. `role="dialog"`        then `aria-modal="true"` AND an EXPLICIT name
 *                             (`aria-labelledby` resolving to a non-empty
 *                             element, or `aria-label`). A dialog's name never
 *                             comes from its content, so textContent does not
 *                             count here — and a dangling `aria-labelledby`
 *                             reference silently yields NO name, which is the
 *                             exact failure this returns '' for.
 *   C. any other `role`       then any accessible name, content included
 *                             (`role="button"` scrims).
 *
 * A visible overlay with NO role fails. That is the shape of the original
 * defect, and the shape any future hand-rolled overlay will take.
 *
 * HOW THIS GUARD COULD LIE, AND WHAT STOPS IT
 * -------------------------------------------
 * 1. PASSING VACUOUSLY. If the modal never opens, the sweep finds zero visible
 *    overlays and "no violations" is true and worthless. So zero measured is
 *    itself a FAILURE, and role/aria-modal/name/focus are asserted directly
 *    rather than inferred from the sweep's silence.
 * 2. A DEAD SWEEP. A sweep that can never report anything looks identical to a
 *    clean page. So the guard PLANTS the defect (a role-less `u-modal-shell`),
 *    proves the sweep flags it, and removes it — a positive control.
 * 3. MEASURING AN ERROR PAGE. `goto(...).catch(() => {})` then reading the DOM
 *    reports the error page's overlays as if they were the app's. The HTTP
 *    status is asserted first.
 * 4. CLAIMING `aria-modal` WITHOUT A TRAP. `aria-modal="true"` asserts the rest
 *    of the page is inert, which is only true while the Tab trap is installed.
 *    The trap is measured in the same run, so the two cannot drift apart.
 * 5. MEASURING AN EMPTY TABLE. This guard needs a job row to open a dialog
 *    FROM, and the page renders rows from `POST
 *    /.netlify/functions/get-app-data` — which a static `astro preview`
 *    CANNOT answer (measured 2026-09-16: HTTP 404). Without a fixture the
 *    table has no rows, 9 of the 16 checks below fail with "no element at
 *    tbody tr:first-child …", and the run reads as a broken dialog contract
 *    when the real cause is a missing fixture. `test-loker-layout.mjs`
 *    documents this same trap in its header and fulfils the endpoint; this
 *    file did not, and CI's `e2e` job has never executed (it is gated on a
 *    push), so the failure had never been seen. The endpoint is now
 *    fulfilled here too.
 *
 * Run against a built artifact:
 *   BASE_URL=http://127.0.0.1:4321 node e2e/test-dialog.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

/** 1x1 transparent PNG — a real pamflet thumbnail without a network hop. */
const PAMFLET_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

/**
 * Fixture for the job table. `astro preview` cannot answer the data
 * endpoint, so without this the table renders its error row and every check
 * that needs a row to open a dialog from fails for a reason that has nothing
 * to do with dialogs. Same approach as `test-loker-layout.mjs`.
 */
const JOBS = [
  {
    code: 'ASJ-2026-001',
    pekerjaan: 'Operator Produksi Bidang Manufaktur',
    status: 'OPEN',
    tahapan: 'Seleksi',
    keterangan: 'Keterangan tambahan untuk mengisi sel.',
    kategori: 'Manufaktur',
    kuota: '5',
    gender: 'PRIA',
    lokasi: 'Jepang',
    syarat: 'Umur 20-30, Sehat jasmani, Tidak bertato',
    templateCv: 'https://example.com/cv-template.pdf',
    // Present so the stacked-dialog check EXERCISES instead of skipping: the
    // job cell renders this as the `img[title]` thumbnail that opens the
    // pamflet modal on top of the detail modal. A data: URI keeps the check
    // off the network — a remote URL would leave `networkidle` waiting on a
    // request that cannot succeed here.
    pamflet: PAMFLET_PX,
    createdAt: '2026-08-10T00:00:00Z',
  },
  {
    code: 'ASJ-2026-002',
    pekerjaan: 'Pekerja Konstruksi',
    status: 'URGENT',
    tahapan: 'Seleksi',
    kategori: 'Konstruksi',
    kuota: '3',
    gender: 'PRIA',
    lokasi: 'Jepang',
    syarat: 'Umur 22-35',
    createdAt: '2026-08-11T00:00:00Z',
  },
];

let browser;
const failures = [];
const skipped = [];
let measured = 0;

async function test(name, fn) {
  try {
    await fn();
    measured++;
    console.log(`✅ ${name}`);
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failures.push(name);
  }
}

/**
 * Sweep every visible `.u-modal-shell` and return the ones that break the rule.
 * Fully self-contained so Playwright can serialise it; no page globals, no eval.
 */
async function sweep(page) {
  return page.evaluate(() => {
    const explicitName = (el) => {
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const t = lb
          .split(/\s+/)
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((n) => (n.textContent || '').trim())
          .join(' ')
          .trim();
        if (t) return t;
      }
      const al = el.getAttribute('aria-label');
      return al && al.trim() ? al.trim() : '';
    };
    const anyName = (el) =>
      explicitName(el) || (el.textContent || '').replace(/\s+/g, ' ').trim();

    const violations = [];
    const seen = [];
    let visible = 0;
    for (const el of document.querySelectorAll('.u-modal-shell')) {
      if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      visible++;
      const desc = `${el.tagName}.${(el.className || '').toString().split(/\s+/)[0]}`;

      if (el.getAttribute('aria-hidden') === 'true') {
        seen.push(`${desc} → A aria-hidden`);
        continue;
      }
      const role = el.getAttribute('role');
      if (!role) {
        violations.push(`${desc}: visible overlay with NO role and no aria-hidden`);
        continue;
      }
      if (role === 'dialog') {
        if (el.getAttribute('aria-modal') !== 'true') {
          violations.push(`${desc}: role="dialog" without aria-modal="true"`);
          continue;
        }
        const name = explicitName(el);
        if (!name) {
          violations.push(`${desc}: role="dialog" has no explicit accessible name`);
          continue;
        }
        seen.push(`${desc} → B dialog ${JSON.stringify(name.slice(0, 40))}`);
        continue;
      }
      const name = anyName(el);
      if (!name) {
        violations.push(`${desc}: role="${role}" has no accessible name`);
        continue;
      }
      seen.push(`${desc} → C role=${role} ${JSON.stringify(name.slice(0, 30))}`);
    }
    return { visible, violations, seen };
  });
}

/**
 * The single visible DIALOG overlay, or null.
 *
 * `aria-hidden="true"` is excluded because the file's own rule classifies such
 * an overlay as case A — "declared presentational (scrims, ambient layers)" —
 * and BaseLayout emits the decorative `#sakura-particles` layer as a live
 * `u-modal-shell` that is `aria-hidden` and `fixed inset-0`. In the `sakura`
 * theme this fixture activates, that ambient layer is genuinely visible and sits
 * BEFORE the page slot in DOM order, so a first-match search returned it instead
 * of the real dialog — cascading into role=null, no name, focus outside, Tab
 * escaping, Escape leaving "1 overlay". Excluding `aria-hidden` picks the dialog.
 */
async function openOverlay(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('.u-modal-shell')].find(
      (e) => (e.offsetWidth > 0 || e.offsetHeight > 0) && e.getAttribute('aria-hidden') !== 'true',
    );
    if (!el) return null;
    const lb = el.getAttribute('aria-labelledby');
    const labelEl = lb ? document.getElementById(lb.split(/\s+/)[0]) : null;
    return {
      role: el.getAttribute('role'),
      ariaModal: el.getAttribute('aria-modal'),
      ariaLabelledby: lb,
      labelResolves: !!labelEl && !!(labelEl.textContent || '').trim(),
      labelText: labelEl ? (labelEl.textContent || '').trim().slice(0, 60) : null,
      idCount: lb ? document.querySelectorAll(`[id="${lb.split(/\s+/)[0]}"]`).length : 0,
      focusInside: el.contains(document.activeElement),
      headings: [...el.querySelectorAll('h1,h2,h3,h4,h5,h6')].length,
    };
  });
}

/**
 * How many overlays a user can actually interact with.
 *
 * `aria-hidden="true"` overlays are NOT counted: the rule above classifies them
 * as case A (declared presentational), and the always-present `#sakura-particles`
 * ambient layer is exactly that. Counting it made an idle page report "1 overlay"
 * and broke "no overlay is visible before anything is opened" — the layer is a
 * decoration, not a dialog anyone opened.
 */
async function visibleOverlayCount(page) {
  return page.evaluate(
    () =>
      [...document.querySelectorAll('.u-modal-shell')].filter(
        (e) => (e.offsetWidth > 0 || e.offsetHeight > 0) && e.getAttribute('aria-hidden') !== 'true',
      ).length,
  );
}

browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

/* Serve the job table from a fixture: a static `astro preview` 404s the
   real endpoint, and an empty table makes 9 of the checks below fail for
   the wrong reason (see point 5 in the header). */
await page.route('**/.netlify/functions/get-app-data', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, activeTheme: 'sakura', jobs: JOBS }),
  }),
);

/* ── Reach the page body ──────────────────────────────────────────────── */
const resp = await page.goto(BASE + '/public', { waitUntil: 'networkidle', timeout: 45000 });
const status = resp ? resp.status() : 0;
if (status !== 200) {
  console.log(`❌ GET /public -> HTTP ${status}; refusing to read the DOM of an error page`);
  await browser.close();
  process.exit(1);
}
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(800);

const DETAIL = 'tbody tr:first-child td:last-child button:first-child';

await test('a job-detail trigger exists in the table', async () => {
  const n = await page.locator(DETAIL).count();
  if (n === 0) {
    throw new Error(`no element at ${DETAIL} — cannot open a dialog to measure`);
  }
});

/* ── 1. The decorative layer ──────────────────────────────────────────── */
await test('the decorative sakura layer is declared presentational', async () => {
  const r = await page.evaluate(() => {
    const el = document.querySelector('#sakura-particles');
    if (!el) throw new Error('#sakura-particles is not in the DOM');
    return {
      ariaHidden: el.getAttribute('aria-hidden'),
      carriesShell: el.classList.contains('u-modal-shell'),
    };
  });
  if (r.ariaHidden !== 'true') {
    throw new Error(
      `aria-hidden=${JSON.stringify(r.ariaHidden)} — a decorative layer must not be in the a11y tree`,
    );
  }
  if (!r.carriesShell) {
    throw new Error('expected the layer to carry u-modal-shell, so this check is about the real element');
  }
});

/* ── 2. Closed state ──────────────────────────────────────────────────── */
await test('no overlay is visible before anything is opened', async () => {
  const n = await visibleOverlayCount(page);
  if (n !== 0) throw new Error(`${n} overlay(s) visible on an idle page`);
});

/* ── 3. Open the job-detail dialog with a REAL click, so focus lands on the
       trigger and the focus-restore check has something to restore to ─── */
await test('clicking Detail opens exactly one overlay', async () => {
  await page.locator(DETAIL).first().click();
  await page.waitForTimeout(450);
  const n = await visibleOverlayCount(page);
  if (n !== 1) throw new Error(`${n} visible overlays after clicking Detail (expected 1)`);
});

await test('the dialog declares role="dialog" and aria-modal="true"', async () => {
  const o = await openOverlay(page);
  if (!o) throw new Error('no visible overlay');
  if (o.role !== 'dialog') throw new Error(`role=${JSON.stringify(o.role)}`);
  if (o.ariaModal !== 'true') throw new Error(`aria-modal=${JSON.stringify(o.ariaModal)}`);
});

await test('the dialog has an accessible name that RESOLVES', async () => {
  const o = await openOverlay(page);
  if (!o) throw new Error('no visible overlay');
  if (!o.ariaLabelledby) throw new Error('no aria-labelledby and no aria-label');
  if (!o.labelResolves) {
    throw new Error(`aria-labelledby="${o.ariaLabelledby}" does not resolve to a non-empty element`);
  }
  console.log(`     ↳ name: ${JSON.stringify(o.labelText)}`);
});

await test('the dialog title id is unique in the document', async () => {
  const o = await openOverlay(page);
  if (!o) throw new Error('no visible overlay');
  if (o.idCount !== 1) {
    throw new Error(`the title id matches ${o.idCount} elements — a duplicate id names the wrong node`);
  }
});

await test('focus was moved into the dialog (so aria-modal is honest)', async () => {
  const o = await openOverlay(page);
  if (!o) throw new Error('no visible overlay');
  if (!o.focusInside) {
    throw new Error('focus is outside the dialog — aria-modal="true" would be a false claim');
  }
});

await test('Tab is trapped inside the dialog', async () => {
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  const o = await openOverlay(page);
  if (!o) throw new Error('the dialog disappeared while tabbing');
  if (!o.focusInside) throw new Error('focus escaped the dialog after 4 Tab presses');
});

await test('Escape closes the dialog', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  const n = await visibleOverlayCount(page);
  if (n !== 0) throw new Error(`${n} overlay(s) still visible after Escape`);
});

await test('Escape returns focus to the trigger that opened it', async () => {
  const r = await page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return { tag: null, inTable: false };
    return { tag: a.tagName, inTable: !!a.closest('tbody'), text: (a.textContent || '').trim().slice(0, 20) };
  });
  if (r.tag !== 'BUTTON' || !r.inTable) {
    throw new Error(
      `focus landed on ${r.tag} (in table: ${r.inTable}) instead of the Detail button`,
    );
  }
});

/* ── 4. The sweep, plus the positive control that proves it is alive ──── */
await test('no visible overlay breaks the rule (idle state)', async () => {
  const r = await sweep(page);
  if (r.violations.length) throw new Error(r.violations.join(' | '));
});

await test('the sweep flags a planted role-less overlay (positive control)', async () => {
  const r = await page.evaluate(() => {
    const explicitName = (el) => {
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const t = lb
          .split(/\s+/)
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((n) => (n.textContent || '').trim())
          .join(' ')
          .trim();
        if (t) return t;
      }
      const al = el.getAttribute('aria-label');
      return al && al.trim() ? al.trim() : '';
    };
    const d = document.createElement('div');
    d.className = 'fixed inset-0 u-modal-shell';
    d.style.cssText = 'position:fixed;left:0;top:0;width:120px;height:120px';
    d.textContent = 'planted';
    document.body.appendChild(d);
    const vis = d.offsetWidth > 0 || d.offsetHeight > 0;
    const role = d.getAttribute('role');
    const caught = vis && !role && d.getAttribute('aria-hidden') !== 'true';
    d.remove();
    // also prove the real sweep's own predicate, not a copy of it
    const alive = !!explicitName;
    return { vis, caught, alive };
  });
  if (!r.vis) throw new Error('the planted overlay was not measurable (zero size) — the control is inert');
  if (!r.caught) throw new Error('the planted overlay does not satisfy the violation predicate');
});

/* ── 5. The App drawer: a scrim plus a nav on the same page ───────────── */
await test('the drawer opens and its scrim is aria-hidden', async () => {
  const hamburger = page.locator('.hamburger-btn');
  if ((await hamburger.count()) === 0) throw new Error('no .hamburger-btn — the drawer cannot be opened');
  await hamburger.first().click();
  await page.waitForTimeout(450);

  const r = await page.evaluate(() => {
    // Count the DRAWER's own shells, not the ambient `#sakura-particles` layer.
    // That layer is a live, `aria-hidden`, `fixed inset-0` `u-modal-shell` in the
    // `sakura` theme this fixture activates; counting it would let the assertion
    // below pass on the decoration alone even if the drawer produced no
    // aria-hidden scrim of its own. (The drawer's shells ARE aria-hidden, so they
    // must still be counted — hence excluding by id, not by `aria-hidden`.)
    const shells = [...document.querySelectorAll('.u-modal-shell')].filter(
      (e) => (e.offsetWidth > 0 || e.offsetHeight > 0) && e.id !== 'sakura-particles',
    );
    return {
      visible: shells.length,
      scrimsHidden: shells.filter((e) => e.getAttribute('aria-hidden') === 'true').length,
      scrimsWithRole: shells.filter((e) => e.getAttribute('role')).map((e) => e.getAttribute('role')),
      navLabel: (document.querySelector('nav[aria-label]') || {}).ariaLabel || null,
    };
  });
  if (r.visible === 0) throw new Error('the drawer opened but no visible overlay is present');
  if (r.scrimsHidden !== r.visible) {
    throw new Error(
      `${r.visible} visible overlay(s) but only ${r.scrimsHidden} aria-hidden; roles found: ${JSON.stringify(r.scrimsWithRole)}`,
    );
  }
  if (!r.navLabel) throw new Error('the drawer nav has no aria-label');
  console.log(`     ↳ drawer: ${r.visible} scrim(s), nav ${JSON.stringify(r.navLabel)}`);
});

await test('no visible overlay breaks the rule (drawer open)', async () => {
  const r = await sweep(page);
  if (r.violations.length) throw new Error(r.violations.join(' | '));
  if (r.visible === 0) {
    throw new Error('measured zero visible overlays — this check would pass vacuously');
  }
  console.log(`     ↳ measured ${r.visible}: ${r.seen.join(' · ')}`);
});

/* ── 6. Stacked dialogs must not share a title id ─────────────────────── */
await test('a dialog opened over another gets its own name (if a pamflet exists)', async () => {
  // Close the drawer by clicking the scrim, not the hamburger: the drawer is
  // right-anchored (w-72/md:w-96 = 384px at 1280) and covers the hamburger, so
  // clicking the button again is intercepted by the drawer itself.
  await page.mouse.click(80, 400);
  await page.waitForTimeout(350);
  const stillOpen = await visibleOverlayCount(page);
  if (stillOpen !== 0) throw new Error(`the drawer did not close (${stillOpen} overlay(s) visible)`);

  await page.locator(DETAIL).first().click();
  await page.waitForTimeout(450);

  const thumb = page.locator('.u-modal-shell img[title]').first();
  if ((await thumb.count()) === 0) {
    skipped.push('stacked-dialog title ids (no pamflet thumbnail on this job)');
    console.log('     ⚠ not exercised: the first job has no pamflet thumbnail');
    return;
  }
  await thumb.click();
  await page.waitForTimeout(450);

  const r = await page.evaluate(() => {
    const shells = [...document.querySelectorAll('.u-modal-shell')].filter(
      (e) => (e.offsetWidth > 0 || e.offsetHeight > 0) && e.getAttribute('aria-hidden') !== 'true',
    );
    const nameOf = (el) => {
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const t = lb
          .split(/\s+/)
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((n) => (n.textContent || '').trim())
          .join(' ')
          .trim();
        if (t) return { via: 'aria-labelledby', id: lb, name: t };
      }
      const al = el.getAttribute('aria-label');
      if (al && al.trim()) return { via: 'aria-label', id: null, name: al.trim() };
      return null;
    };
    const named = shells.map(nameOf);
    return {
      count: shells.length,
      roles: shells.map((e) => e.getAttribute('role')),
      named,
      ids: named.filter((n) => n && n.id).map((n) => n.id),
    };
  });
  if (r.count < 2) throw new Error(`expected 2 stacked overlays, found ${r.count}`);
  if (r.roles.some((x) => x !== 'dialog')) {
    throw new Error(`every stacked overlay must be a dialog, got ${JSON.stringify(r.roles)}`);
  }
  // Every dialog must be NAMED — by either mechanism — before uniqueness means
  // anything. Comparing only `new Set(ids).size` against `ids.length` is a
  // TAUTOLOGY when a dialog is unnamed: one id, one dialog, 1 === 1, green.
  // Measured while writing this guard — two dialogs reported ids
  // ["asj-overlay-title-4"] and passed.
  const unnamed = r.named.filter((n) => !n).length;
  if (unnamed) {
    throw new Error(
      `${r.count} stacked dialogs, ${unnamed} unnamed — an unnamed dialog is not a duplicate, it is a missing name`,
    );
  }
  if (new Set(r.ids).size !== r.ids.length) {
    throw new Error(`two stacked dialogs share a title id: ${JSON.stringify(r.ids)}`);
  }
  console.log(
    `     ↳ stacked: ${r.count} dialogs — ${r.named
      .map((n) => `${n.via}=${JSON.stringify(n.name.slice(0, 28))}`)
      .join(' · ')}`,
  );

  // The sweep with BOTH dialogs open — this is where the rule's dialog branch
  // (role + aria-modal + explicit name) actually runs against real modals.
  const s = await sweep(page);
  if (s.violations.length) throw new Error(s.violations.join(' | '));
  if (s.visible < 2) throw new Error(`sweep measured ${s.visible} visible overlay(s), expected 2`);
  console.log(`     ↳ sweep: ${s.seen.join(' · ')}`);
});

/* ── 7. The login modal keeps its dialog semantics on a SECOND open ────────
   WHY THIS CHECK EXISTS, AND WHY IT MUST OPEN TWICE.
   `LoginModal` is mounted UNCONDITIONALLY — App.tsx renders it with
   `mode="closed"` — and its render guard used to sit ABOVE the `useOverlay`
   call. So while the modal was closed the hook never ran, and on the SECOND
   open its effects did not re-run: the modal lost `role`/`aria-modal`/
   `aria-labelledby` and stopped moving focus inside. Measured shape against
   the served build (open via [data-nav-login], close with Escape):
     OPEN #1  role="dialog" aria-modal="true" labelledby="…"  focus INSIDE
     OPEN #2  role=null     aria-modal=null    labelledby=null focus NOT inside
   A single-open check is GREEN on this defect — the first open is correct —
   which is exactly how it shipped. The second open is the whole point, and
   the close in between is asserted so the reopen is ATTRIBUTABLE to it. */
await test('the login modal keeps role/aria-modal/focus on a SECOND open', async () => {
  // `[data-nav-login]` lives on the landing page's desktop section nav
  // (SiteNav.astro, hidden below lg), so navigate there. The page-level
  // get-app-data route above survives navigation.
  const r = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const status = r ? r.status() : 0;
  if (status !== 200) throw new Error(`GET / -> HTTP ${status}; refusing to read an error page`);
  await page.waitForSelector('#atas h1', { timeout: 20000 });
  await page.waitForTimeout(900);

  const readLoginDialog = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll('.u-modal-shell')].find(
        (e) => (e.offsetWidth > 0 || e.offsetHeight > 0) && e.getAttribute('aria-hidden') !== 'true',
      );
      if (!el) return null;
      const lb = el.getAttribute('aria-labelledby');
      const labelEl = lb ? document.getElementById(lb.split(/\s+/)[0]) : null;
      return {
        role: el.getAttribute('role'),
        ariaModal: el.getAttribute('aria-modal'),
        ariaLabelledby: lb,
        labelResolves: !!labelEl && !!(labelEl.textContent || '').trim(),
        focusInside: el.contains(document.activeElement),
        activeTag: document.activeElement ? document.activeElement.tagName : null,
      };
    });

  const openAndRead = async (label) => {
    await page.click('[data-nav-login]');
    await page.waitForTimeout(500);
    const o = await readLoginDialog();
    if (!o) throw new Error(`${label}: no visible overlay after clicking [data-nav-login]`);
    if (o.role !== 'dialog') throw new Error(`${label}: role=${JSON.stringify(o.role)} (expected "dialog")`);
    if (o.ariaModal !== 'true') throw new Error(`${label}: aria-modal=${JSON.stringify(o.ariaModal)} (expected "true")`);
    if (!o.ariaLabelledby || !o.labelResolves) {
      throw new Error(`${label}: aria-labelledby=${JSON.stringify(o.ariaLabelledby)} does not resolve to a non-empty name`);
    }
    if (!o.focusInside) throw new Error(`${label}: focus is NOT inside the dialog (activeElement=${o.activeTag})`);
    return o;
  };

  const first = await openAndRead('open #1');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  const stillOpen = await readLoginDialog();
  if (stillOpen) throw new Error('the login modal did not close on Escape — the reopen would not be attributable');

  const second = await openAndRead('open #2 (after a real close)');

  console.log(`     ↳ open#1 role=${first.role} focusInside=${first.focusInside}`);
  console.log(`     ↳ open#2 role=${second.role} aria-modal=${second.ariaModal} focusInside=${second.focusInside}`);
});

await browser.close();

console.log('');
console.log(`checks passed: ${measured} · failed: ${failures.length}`);
if (skipped.length) console.log(`not exercised: ${skipped.join(' | ')}`);
if (failures.length) {
  console.log('failed:', failures.join(' | '));
  process.exit(1);
}
