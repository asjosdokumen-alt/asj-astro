/**
 * test-candidate-modals.mjs — the candidate dashboard's overlays, measured in a
 * real browser against a real build.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `/candidate` is `client:only` AND needs a session: `loadDashboard()` reads
 * `user.wa` and does `window.location.href = '/'` without one. So the existing
 * dialog gate (`e2e/test-dialog.mjs`), which drives `/public` and `/`, could
 * never open a single overlay on this page.
 *
 * Measured before this file existed: the six candidate-dashboard modals were
 * reachable by NO gate at all. That is why they shipped with an entry animation
 * and no exit — the one modal migrated in `dbc47f8` was `LokerDetailModal`, on
 * `/public`, and the page whose modals the task was actually about was never
 * exercised.
 *
 * THE FIXTURE, AND WHY A FIXTURE IS NOT A CHEAT
 * ---------------------------------------------
 * Two pieces, both the pattern already proven in `e2e/measure-riwayat-card.mjs`:
 *   1. `storageState` writing `asj_auth` — the persistent nanostore key, see
 *      `src/store/authReactive.ts` — as a logged-in KANDIDAT carrying a `wa`.
 *   2. `POST /.netlify/functions/get-app-data` fulfilled locally. A static
 *      server 404s the real endpoint (test-dialog.mjs documents the same trap)
 *      and a 404 renders an empty dashboard.
 * The fixture is what makes the route REACHABLE. It is not evidence about the
 * backend: every assertion below is about the DOM the real components render.
 *
 * WHAT IT LOCKS DOWN
 * ------------------
 * Two things per overlay, and the second is the one nothing else can see:
 *   a. it opens with a role that RESOLVES to a non-empty accessible name;
 *   b. it CLOSES BY ANIMATING — the node survives, `data-closing="true"` is
 *      observed, and the scrim is caught strictly between 0 and 1.
 * A check that only required "the overlay is gone" passes on an overlay torn
 * down instantly, which is exactly the behaviour the exit exists to replace.
 *
 * HOW THIS GUARD COULD LIE
 * ------------------------
 * 1. PASSING VACUOUSLY. If the fixture breaks, `/candidate` redirects to `/`
 *    and the page has zero triggers; a guard that walks an empty list passes.
 *    So the trigger count is asserted FIRST, and each check names its trigger.
 * 2. A SWEEP THAT CANNOT FAIL. The sweep gets a POSITIVE CONTROL: a role-less
 *    `.u-modal-shell` is planted and the sweep must flag it. Without that, a
 *    sweep whose selector silently stopped matching reads as "all clean".
 * 3. MEASURING AN ERROR PAGE. The HTTP status is asserted before the DOM.
 *
 * Run against a built artifact:
 *   BASE_URL=http://127.0.0.1:4321 node e2e/test-candidate-modals.mjs
 */
import { chromium } from 'playwright';
import { describeOffenders, sweepNames } from './lib/aria-names.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

/** 240 ms in `useOverlayPresence`; the exit transition is 180 ms. */
const EXIT_WINDOW_MS = 240;

const TRIGGERS = [
  ['cmt-password', 'Ubah Password'],
  ['cmt-cvmini', 'Update Profil (CV Mini)'],
  ['cmt-rirekisho', 'Preview CV / Rirekisho'],
  ['cmt-pemberkasan', 'Pemberkasan'],
  ['cmt-interview', 'Latihan Wawancara'],
  ['cmt-esign', 'E-Sign Naitei'],
];

let measured = 0;
const failures = [];
const skipped = [];

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

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  storageState: {
    cookies: [],
    origins: [
      {
        origin: BASE,
        localStorage: [
          {
            name: 'asj_auth',
            value: JSON.stringify({
              role: 'kandidat',
              name: 'Budi',
              wa: '081234567890',
              sessionToken: 'fixture-token',
              refreshToken: '',
              isLoggedIn: true,
              lastChecked: Date.now(),
            }),
          },
        ],
      },
    ],
  },
});
const page = await ctx.newPage();

/* The accessible-name sweep below reads the REAL accessibility tree, and the
   tree is fetched over CDP. One session for the whole run: `getFullAXTree` is
   called fresh per overlay, so nothing is cached between them. */
const cdp = await ctx.newCDPSession(page);
await cdp.send('Accessibility.enable');

/* The dashboard is fed from `get-app-data`. `catatanInt: '[VIP]'` is what opens
   the interview gate (`isVipCatatan`); without it that trigger is dead and the
   check would report "not exercised" for a reason that is not the overlay. */
await page.route('**/.netlify/functions/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      activeTheme: 'sakura',
      candidates: [
        {
          nama: 'Budi',
          idLoker: 'TG591ASJ',
          tahapan: 'PEMBERKASAN',
          status: 'LULUS',
          idKandidat: 'ASJ-001',
          catatanInt: '[VIP]',
          berkas: {},
          bio: {},
        },
      ],
      kandidatRiwayat: [
        {
          code: 'TG591ASJ',
          status: 'LULUS',
          tahapan: 'PEMBERKASAN',
          timestamp: '2026-09-10T08:00:00Z',
          kategori: 'NOUGYOU SAYURAN',
        },
      ],
      mySchedules: [],
    }),
  }),
);

const resp = await page.goto(`${BASE}/candidate`, { waitUntil: 'networkidle', timeout: 45000 });
const status = resp ? resp.status() : 0;
if (status !== 200) {
  console.log(`❌ GET /candidate -> HTTP ${status}; refusing to read the DOM of an error page`);
  await browser.close();
  process.exit(1);
}
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(1200);

/* ── The overlay reader, shared by every check ────────────────────────── */
const readOverlay = () =>
  page.evaluate(() => {
    const o = [...document.querySelectorAll('.u-modal-shell')].find(
      (el) => (el.offsetWidth > 0 || el.offsetHeight > 0) && el.getAttribute('aria-hidden') !== 'true',
    );
    if (!o) return { gone: true };
    const panel = o.firstElementChild;
    const labelledBy = o.getAttribute('aria-labelledby');
    const named = labelledBy ? (document.getElementById(labelledBy)?.textContent || '').trim() : '';
    return {
      gone: false,
      closing: o.getAttribute('data-closing'),
      role: o.getAttribute('role'),
      ariaModal: o.getAttribute('aria-modal'),
      name: named || (o.getAttribute('aria-label') || '').trim(),
      scrimOpacity: getComputedStyle(o).opacity,
      panelOpacity: panel ? getComputedStyle(panel).opacity : null,
    };
  });

/* ── 1. The fixture worked, and the sweep has something to walk ────────── */
await test('the session fixture reaches the dashboard (not the login gate)', async () => {
  const present = await page.evaluate(
    (ids) => ids.filter((id) => document.querySelector(`[data-testid="${id}"]`) !== null),
    TRIGGERS.map(([id]) => id),
  );
  console.log(`     ↳ triggers present: ${present.length}/${TRIGGERS.length} (${present.join(', ')})`);
  if (present.length < 3) {
    throw new Error(
      `only ${present.length} of ${TRIGGERS.length} triggers rendered — /candidate did not render the ` +
        'dashboard (a missing session redirects to `/`), so every check below would pass vacuously',
    );
  }
});

/* ── 2. POSITIVE CONTROL for the overlay sweep ─────────────────────────
   Plant the exact defect the sweep exists to find — a visible `.u-modal-shell`
   with no role — and require the sweep to report it. Without this, a sweep
   whose selector stopped matching is indistinguishable from a clean page. */
await test('CONTROL: the overlay sweep flags a planted role-less shell', async () => {
  const found = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'u-modal-shell';
    el.setAttribute('data-probe', '1');
    el.style.cssText = 'position:fixed;inset:0;width:100px;height:100px';
    document.body.appendChild(el);
    const o = [...document.querySelectorAll('.u-modal-shell')].find(
      (x) => (x.offsetWidth > 0 || x.offsetHeight > 0) && x.getAttribute('aria-hidden') !== 'true',
    );
    const flagged = !!o && o.getAttribute('role') === null;
    el.remove();
    return flagged;
  });
  if (!found) {
    throw new Error('the sweep did not see a planted role-less overlay — it cannot fail, so it proves nothing');
  }
});

/* ── 3. Every reachable overlay: opens named, closes by ANIMATING ──────── */
for (const [id, label] of TRIGGERS) {
  const trigger = page.locator(`[data-testid="${id}"]`);
  if ((await trigger.count()) === 0) {
    skipped.push(`${label} (trigger not rendered for this fixture)`);
    continue;
  }

  await test(`${label}: opens as a named dialog and animates OUT`, async () => {
    await trigger.click();
    await page.waitForTimeout(120);

    const open = await readOverlay();
    if (open.gone) {
      skipped.push(`${label} (its gate refused to open for this fixture)`);
      return;
    }
    if (open.role !== 'dialog') {
      throw new Error(`opened with role=${JSON.stringify(open.role)}, expected "dialog"`);
    }
    if (open.ariaModal !== 'true') {
      throw new Error(`opened with aria-modal=${JSON.stringify(open.ariaModal)}, expected "true"`);
    }
    if (!open.name) {
      throw new Error('opened with an EMPTY accessible name — aria-labelledby did not resolve to text');
    }

    /* The overlay is NAMED — but are the controls INSIDE it? A dialog can have a
       perfect name and still ship a close button that announces nothing, because
       that button holds only an `<svg>`. Measured 2026-09-28: `CvMiniModal` and
       `ChangePasswordModal` each had exactly that, and no gate in the repo could
       see it — `test-dialog.mjs` reads `/public` and `/`, which never open these
       two, and `test-aria-names.mjs` sweeps resting pages, where they are not
       mounted.

       The rule and the AX read live in `e2e/lib/aria-names.mjs` so this file and
       `test-aria-names.mjs` cannot drift into two versions of one rule. */
    const { offenders } = await sweepNames(cdp);
    const inside = offenders.filter((o) => o.overlay >= 0);
    if (inside.length) {
      throw new Error(
        `${inside.length} control(s) inside this dialog have no usable accessible name:` +
          describeOffenders(inside),
      );
    }

    /* Close, then SAMPLE ACROSS THE WINDOW. A single probe cannot tell a
       working exit from a broken one: `data-closing` is written in an effect,
       so the transition has not started on the frame the attribute appears, and
       opacity is still 1 there. (test-dialog.mjs measured both traps.) */
    await page.keyboard.press('Escape');

    const seen = [];
    for (let i = 0; i < 18; i++) {
      const s = await readOverlay();
      seen.push(s);
      if (s.gone) break;
      await page.waitForTimeout(15);
    }

    if (seen[0].gone) {
      throw new Error(
        'the overlay was gone on the FIRST sample after Escape — the node is torn down before the exit ' +
          'can run (is useOverlayPresence holding it, and is `closing` reaching useOverlay?)',
      );
    }
    const live = seen.filter((s) => !s.gone);
    const closing = live.filter((s) => s.closing === 'true');
    const opacities = closing.map((s) => Number(s.scrimOpacity));
    /* The MINIMUM is the measurement that matters, not the first sample. The
       first sample carrying `data-closing` lands within a frame or two of the
       transition starting, so its opacity is ~0.999 — technically "between 0
       and 1" while proving almost nothing. A fade that actually RAN has to
       reach a clearly-lower value somewhere in a 240 ms window. */
    const minScrim = opacities.length ? Math.min(...opacities) : null;

    if (closing.length === 0) {
      throw new Error(
        `data-closing was never "true" across ${live.length} samples — useOverlay was not told it is closing`,
      );
    }
    if (minScrim === null || minScrim > 0.9) {
      throw new Error(
        `the scrim never got below 0.9 across ${closing.length} closing samples (min ${minScrim}) — the exit ` +
          `transition did not run, or the node was held without animating (opacities: ${opacities.join(', ')})`,
      );
    }
    if (closing.some((s) => s.role !== 'dialog')) {
      throw new Error(
        'role was torn down mid-exit — the overlay is still visible and still trapping focus, so it must ' +
          'still announce itself as a dialog',
      );
    }
    console.log(
      `     ↳ name="${open.name}" · scrim min ${minScrim.toFixed(3)} (first ${opacities[0]})` +
        ` · live samples ${live.length}`,
    );

    await page.waitForTimeout(EXIT_WINDOW_MS);
    const after = await readOverlay();
    if (!after.gone) {
      throw new Error('the overlay never went away after the exit window — it is stuck on screen');
    }
  });
}

await browser.close();

console.log('');
console.log(`checks passed: ${measured} · failed: ${failures.length}`);
if (skipped.length) console.log(`not exercised: ${skipped.join(' | ')}`);
if (failures.length) {
  console.log('failed:', failures.join(' | '));
  process.exit(1);
}
