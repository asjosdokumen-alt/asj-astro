/**
 * test-aria-names.mjs — a control with NO accessible name, swept on every
 * surface a gate can actually reach.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT COVERED BY THE EXISTING GATES
 * ----------------------------------------------------------------
 * The repo already enforces a lot of the a11y floor, each piece in its own gate:
 *   - `test-contrast.mjs` / `test-hover-contrast.mjs`  → colour
 *   - `test-headings.mjs`  → one h1, no skipped heading level, one `<main>`,
 *                            skip-link targets
 *   - `test-labels.mjs`    → every `<label>` resolves to its control
 *   - `test-dialog.mjs`    → `role="dialog"`, `aria-modal`, an explicit name
 *
 * None of them reads the question the accessible name exists for: **does this
 * control have a name at all?** `test-labels.mjs` proves a `<label>` resolves;
 * it cannot see a `<button>` that contains only an `<svg>`, or an `<input>` with
 * no label element anywhere, because in both cases there is no `<label>` to
 * associate and the loop simply has nothing to walk.
 *
 * MEASURED 2026-09-28, before this gate existed, against a real build:
 *
 *   /admin             3 unnamed <button>      (the row delete icon, one per row)
 *   /admin#pelamar     3 unnamed <select>      (the gender / age / JFT filters)
 *   /admin#mail        1 unnamed <input>       (the select-all checkbox)
 *   /public + Detail   the dialog's own close button
 *   /candidate modals  the close button of CvMiniModal and ChangePasswordModal
 *
 * A control with no name is announced as "button" / "combobox" / "checkbox" and
 * nothing else. The page looks correct, the mouse works, and no gate in the repo
 * could see it — which is exactly the class of defect this file is for.
 *
 * ── HOW IT SEES THE NAME: THE REAL ACCESSIBILITY TREE ───────────────────────
 * It does NOT grep `src/` for `aria-label`, and it does not re-implement the
 * accessible-name algorithm. It asks Chromium via
 * `Accessibility.getFullAXTree` — the tree the platform hands to assistive tech,
 * with `role` and `name` already computed. The name can therefore come from
 * `aria-labelledby`, from subtree text, from a `<label for>`, from `title`, or
 * from `alt`, and the gate does not care which: it reads the RESULT.
 *
 * That distinction is the whole point. A grep answers "is the attribute spelled
 * somewhere?"; this answers "did the rendered control end up named?" Measured
 * 2026-09-28: `src/**\/*.tsx` contains ~60 `aria-label` occurrences and none of
 * them tells you either way.
 *
 * ── THE THREE RULES ─────────────────────────────────────────────────────────
 *  R1  a control whose name is EMPTY, for the roles where that is a defect
 *      rather than a design choice (`NAME_REQUIRED`).
 *  R2  a name that is a RAW TRANSLATION KEY. `t()` falls back to the key itself
 *      (`src/store/i18n.ts`: `... || key`), so a missing key ships the literal
 *      string `"ui.close"` as the name — announced to screen readers, invisible
 *      in the browser, and `i18n.keys.test.ts` only covers keys reached through
 *      `t('literal')` in `src/`, not one that is missing from a dictionary.
 *  R3  a FOCUSABLE element inside an `aria-hidden="true"` subtree (the axe-core
 *      `aria-hidden-focus` rule): removed from the tree but still Tab-reachable,
 *      so a keyboard user lands on a control that announces nothing.
 *
 * ── HOW THIS GATE COULD LIE, AND WHAT STOPS IT ──────────────────────────────
 *  1. A SWEEP THAT CANNOT FAIL. A selector that stopped matching, or an AX call
 *     that returned an empty tree, reads as "0 offenders" — identical to clean.
 *     So a POSITIVE CONTROL plants a nameless `<button>` in the live page and
 *     requires the sweep to report it. It runs FIRST, and it is the only check
 *     that needs no rebuild to prove the sweep works.
 *  2. MEASURING A PAGE THAT NEVER RENDERED. Every surface asserts a FLOOR on
 *     the number of controls it found (`MIN_CONTROLS`), and the session routes
 *     additionally refuse to report if they landed on a login gate. Measured
 *     floor on the real tree: 5 (`/share` @390px); the thinnest surface in this
 *     file is `/ai-cv` at 7.
 *  3. A TAB THAT CRASHED AND RENDERED NOTHING. The eight admin tabs are read by
 *     HASH (`/admin#wa`), with every function call fulfilled locally so no
 *     rejection can log the session out — see ADMIN_TABS. Each tab is asserted
 *     against the same floor, so a tab that failed to mount is a FAILURE, not a
 *     silent pass.
 *  4. AN OVERLAY THAT NEVER OPENED. The dialog surface clicks a real trigger and
 *     asserts that exactly one overlay is visible BEFORE it sweeps, so the sweep
 *     cannot read an idle page and call it "the dialog is clean".
 *
 * ── WHAT IT DOES NOT COVER (measured, not assumed) ──────────────────────────
 *  - Modals opened from a SECOND-level click (a modal opened from inside a
 *    modal), and modals whose trigger needs a row that the fixture below does
 *    not produce. The candidate dashboard's six overlays are covered by
 *    `test-candidate-modals.mjs`, which owns that fixture; this file does not
 *    duplicate it.
 *  - `CvTemplateSelector` and `InputManualModal`, which no e2e surface reaches;
 *    their close buttons are asserted by their own component tests instead.
 *  - A name that is PRESENT but WRONG ("Close" on a delete button). No automated
 *    tool can judge that, this one included: it checks for ABSENCE.
 *  - Dynamic states: an error toast, a validation message, a menu opened by a
 *    click. The resting page only.
 *
 * Run against a built artifact:
 *   BASE_URL=http://127.0.0.1:4321 node e2e/test-aria-names.mjs
 */
import { chromium } from 'playwright';
import {
  describeHiddenFocus,
  describeOffenders,
  sweepHiddenFocus,
  sweepNames,
} from './lib/aria-names.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const ROWS = 'table tbody tr';
/** Same trigger `test-dialog.mjs` uses: the first row's first action button. */
const DETAIL = 'tbody tr:first-child td:last-child button:first-child';

/**
 * The thinnest surface this file measures found 5 controls (measured 2026-09-28,
 * `/share` @390px). The floor is deliberately BELOW that: it is not a target, it
 * is a tripwire for "the page rendered nothing".
 */
const MIN_CONTROLS = 3;

/** Strings only a gate state produces. Same set as `test-headings.mjs`. */
const GATE_MARKERS = [
  'Verifikasi Akun Kandidat',
  'Mengalihkan ke halaman login...',
  'Akses ditolak. Mengalihkan...',
];

/** Fabricated session — these routes gate on the STORE, not the backend. */
function authFor(role) {
  return JSON.stringify({
    sessionToken: `aria-fake-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    role,
    wa: '081234567890',
    name: 'Aria Check',
    lastChecked: Date.now(),
  });
}

/**
 * A synthetic `getAppData` payload, for the same reason `test-contrast.mjs`
 * carries one: the LokerTable rows exist only AFTER the call resolves, and
 * against a static preview server there is no backend at all. Without it the
 * sweep would report a clean pass for a table it never saw.
 */
const PUBLIC_DATA_FIXTURE = {
  success: true,
  sessionInvalid: false,
  activeTheme: 'dark',
  pengumuman: 'PENGUMUMAN UJI ARIA: pendaftaran batch baru sudah dibuka.',
  jobs: [
    ['TEST-001', 'NOUGYOU SAYURAN', 'PERTANIAN', 'Ibaraki', 'Pria', 'OPEN', 'JFT A2', '', 'https://example.invalid/cv-001'],
    ['TEST-002', 'KAIGO', 'KESEHATAN', 'Tokyo', 'Wanita', 'URGENT', 'JFT N4', 'Interview minggu depan', ''],
    ['TEST-003', 'KONSTRUKSI', 'KONSTRUKSI', 'Osaka', 'Pria', 'CLOSE', 'SSW', 'Kuota sudah penuh', ''],
  ].map(([code, pekerjaan, kategori, lokasi, gender, status, tahapan, keterangan, pamflet]) => ({
    code,
    pekerjaan,
    kategori,
    lokasi,
    gender,
    status,
    tahapan,
    keterangan,
    pamflet,
    templateCv: pamflet ? 'TPL' : '',
    createdAt: new Date(0).toISOString(),
  })),
};

/**
 * One candidate row, so the admin tabs that render a TABLE actually render one.
 * Without it `/admin#pelamar` and `/admin#wa` render an empty table, and every
 * row-level control — including the icon-only buttons this gate exists to
 * check — is absent from the DOM. An empty table reads as "clean".
 */
const ADMIN_CANDIDATE = {
  nama: 'Aria Uji',
  wa: '081234567890',
  idLoker: 'TG591ASJ',
  idKandidat: 'ASJ-001',
  tahapan: 'PEMBERKASAN',
  status: 'LULUS',
  kategori: 'NOUGYOU SAYURAN',
  berkas: {},
  bio: {},
};

/**
 * `session` is the ROLE to fabricate, or null to inject nothing.
 * `/ai-cv` declares `gate: 'server'` and re-verifies against the backend, so a
 * fabricated token is judged invalid and it redirects to `/` — it must be read
 * with NO session, exactly as `test-headings.mjs` documents.
 *
 * `expectGate` marks the one route whose reachable state without a token IS the
 * gate. `test-headings.mjs` drops it from its body-route list for that reason,
 * but for THIS gate the gate is a real surface with real controls (an input and
 * its buttons), and an unauthenticated visitor is exactly who meets it. So it is
 * kept — and the assertion is INVERTED rather than relaxed: the gate marker must
 * be present. If `/ai-cv` ever stops showing it, this check fails and the reader
 * is told the surface changed, instead of being handed a green verdict about a
 * page that no longer exists.
 */
const ROUTES = [
  { path: '/', session: null },
  { path: '/loker', session: null, waitFor: ROWS },
  { path: '/public', session: null, waitFor: ROWS },
  { path: '/ai-cv', session: null, expectGate: true },
  { path: '/apply', session: 'kandidat' },
  { path: '/siswa-baru', session: 'kandidat' },
  { path: '/master', session: 'kandidat' },
  { path: '/share', session: 'kandidat' },
  { path: '/admin', session: 'admin' },
  { path: '/candidate', session: 'kandidat' },
];

/**
 * The admin panel's tabs, read by HASH rather than by clicking.
 *
 * `AdminPanel` renders ONE tab at a time, and the tab is hash-routable
 * (`tabFromHash()`), so `/admin#wa` mounts that tab directly — no click, no
 * responsive sidebar. `test-headings.mjs` records that a CLICK-walk was written
 * and removed because it was not deterministic: a tab that calls
 * `api.secure(...)` had its rejection routed through `apiClient`, which logs the
 * session out and redirects to `/`, and two runs ten minutes apart disagreed
 * about which tabs bounced.
 *
 * This gate attacks that from the other side: EVERY `/.netlify/functions/**`
 * call is fulfilled locally with a benign payload, so nothing is ever rejected
 * and nothing logs out. Measured 2026-09-28: all eight tabs render their real
 * body (17–49 controls each) and the walk is deterministic.
 */
const ADMIN_TABS = ['kelola', 'tugas', 'dbjob', 'pelamar', 'wa', 'mail', 'agenda', 'config'];

const WIDTHS = [390, 1280];

/**
 * `--only=<substring>` runs just the surfaces whose label contains it.
 *
 * It exists for the mutation battery: this gate opens 39 pages, so a full run is
 * ~80 s, and a battery that rebuilds seven times would spend most of its life
 * re-measuring surfaces no mutation touched. The CONTROL is never filtered — it
 * is the proof that the sweep works, and skipping it would make every filtered
 * verdict meaningless.
 *
 * ⚠ PASS THE FILTER WITHOUT A LEADING SLASH. Git Bash rewrites an argument that
 * starts with `/` as a Windows path, so `--only='/admin#mail'` arrives as
 * `C:/Users/…/admin#mail`, matches nothing, and reports "0 failed" for a run
 * that measured only the controls. Use `--only=admin#mail`.
 */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice('--only='.length);

let browser;
const failures = [];
let checks = 0;
let skippedByFilter = 0;

async function test(name, fn) {
  if (ONLY && !name.startsWith('CONTROL') && !name.includes(ONLY)) {
    skippedByFilter++;
    return;
  }
  checks++;
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failures.push(name);
  }
}

/** Open a page with the right fixture, and refuse to report on an error page. */
async function openSurface(route, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  if (route.interceptAll) {
    // Per-endpoint, not one blob: the row-level controls only exist when the tab
    // HAS rows. See ADMIN_TABS and ADMIN_CANDIDATE.
    await page.route('**/.netlify/functions/**', (r) => {
      const url = r.request().url();
      let body = { success: true, sessionInvalid: false };
      if (url.includes('/candidates')) {
        body = { success: true, total: 1, candidates: [ADMIN_CANDIDATE] };
      } else if (url.includes('get-app-data')) {
        body = {
          success: true,
          sessionInvalid: false,
          activeTheme: 'dark',
          candidates: [ADMIN_CANDIDATE],
          schedules: [],
          messages: [],
          waTemplates: [{ id: 'tpl-1', nama: 'Template Uji', isi: 'Halo {nama}, ini pesan uji.' }],
        };
      }
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
  } else {
    await page.route('**/.netlify/functions/get-app-data*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_DATA_FIXTURE) }),
    );
  }

  if (route.session) {
    await page.addInitScript((v) => {
      try {
        localStorage.setItem('asj_auth', v);
      } catch {
        /* storage unavailable — the page shows its gate and the caller says so */
      }
    }, authFor(route.session));
  }

  const resp = await page.goto(BASE + route.path, { waitUntil: 'networkidle', timeout: 45_000 });
  const status = resp ? resp.status() : 0;
  if (status !== 200) {
    await ctx.close();
    throw new Error(`GET ${route.path} -> HTTP ${status}; refusing to read the DOM of an error page`);
  }
  if (route.waitFor) {
    await page.waitForSelector(route.waitFor, { timeout: 15_000 });
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Accessibility.enable');
  return { ctx, page, cdp };
}

/** Landed on a login gate instead of the page body → every number below is a lie. */
async function assertReachedBody(page, path) {
  const text = await page.evaluate(() => document.body.innerText);
  const gate = GATE_MARKERS.find((m) => text.includes(m));
  if (gate) {
    throw new Error(`${path} rendered the GATE (${JSON.stringify(gate)}), not the page body`);
  }
}

/**
 * The inverse, for the one route whose reachable state without a token IS the
 * gate. Requiring the marker is what keeps the check honest in both directions:
 * a green verdict here means "the gate's own controls are named", never "the
 * page body was measured" — and if the surface ever changes, this fails.
 */
async function assertReachedGate(page, path) {
  const text = await page.evaluate(() => document.body.innerText);
  const gate = GATE_MARKERS.find((m) => text.includes(m));
  if (!gate) {
    throw new Error(
      `${path} no longer renders a login gate, so this check measured a DIFFERENT surface than it ` +
        'is named for — move the route into the body-route list instead of relaxing this',
    );
  }
  return gate;
}

async function run() {
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });

  /* ── 0. POSITIVE CONTROL ────────────────────────────────────────────────
     The only check that needs no rebuild to prove the sweep works. A sweep
     whose AX call or role list silently stopped matching reports "0 offenders"
     — identical to a clean page. So a nameless button is PLANTED in the live
     page and the sweep must flag exactly it. */
  {
    const { ctx, page, cdp } = await openSurface({ path: '/', session: null }, 1280);
    try {
      await test('CONTROL: the sweep flags a planted nameless button', async () => {
        await page.evaluate(() => {
          const b = document.createElement('button');
          b.id = 'aria-probe';
          b.style.cssText = 'position:fixed;top:0;left:0;width:44px;height:44px;z-index:9999';
          document.body.appendChild(b);
        });
        const { offenders } = await sweepNames(cdp);
        const planted = offenders.filter((o) => (o.html ?? '').includes('aria-probe'));
        if (planted.length === 0) {
          throw new Error(
            'the sweep did not see a planted nameless <button> — it cannot fail, so every ' +
              '"clean" verdict below would be meaningless',
          );
        }
        if (planted.length !== 1) {
          throw new Error(`the planted button was reported ${planted.length} times, expected exactly 1`);
        }
        await page.evaluate(() => document.getElementById('aria-probe')?.remove());
      });

      /* R3's detector needs its own control. A rule that finds ZERO violations on
         the healthy tree is indistinguishable from a rule whose selector stopped
         matching — and R3 currently finds zero everywhere, which is exactly the
         situation that hides a dead check. Same shape as the axe-core rule it
         mirrors: a focusable control inside an `aria-hidden` subtree. */
      await test('CONTROL: the hidden-focus rule flags a focusable control inside aria-hidden', async () => {
        const clean = await sweepHiddenFocus(page);
        if (clean.length !== 0) {
          throw new Error(`the healthy page already has ${clean.length} hidden-focus violation(s)`);
        }
        await page.evaluate(() => {
          const holder = document.createElement('div');
          holder.setAttribute('aria-hidden', 'true');
          holder.id = 'aria-probe-hidden';
          holder.style.cssText = 'position:fixed;top:60px;left:0;z-index:9999';
          const b = document.createElement('button');
          b.textContent = 'probe';
          b.style.cssText = 'width:44px;height:44px';
          holder.appendChild(b);
          document.body.appendChild(holder);
        });
        const flagged = await sweepHiddenFocus(page);
        if (flagged.length !== 1) {
          throw new Error(
            `the hidden-focus rule reported ${flagged.length} violation(s) for a planted one — it cannot ` +
              'fail, so its "0 violations" verdict proves nothing',
          );
        }
        await page.evaluate(() => document.getElementById('aria-probe-hidden')?.remove());
      });
    } finally {
      await ctx.close();
    }
  }

  /* ── 1. Resting routes ──────────────────────────────────────────────────*/
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const label = `${width}px ${route.path}${route.expectGate ? ' (login gate, no token)' : ''}`;
      const { ctx, page, cdp } = await openSurface(route, width);
      try {
        await test(`${label}: every control has an accessible name`, async () => {
          if (route.expectGate) await assertReachedGate(page, route.path);
          else await assertReachedBody(page, route.path);
          const { offenders, controlCount } = await sweepNames(cdp);
          if (controlCount < MIN_CONTROLS) {
            throw new Error(
              `only ${controlCount} named-role control(s) found (floor ${MIN_CONTROLS}) — the page ` +
                'rendered nothing, so "0 unnamed" would be vacuous',
            );
          }
          const hidden = await sweepHiddenFocus(page);
          if (hidden.length) {
            throw new Error(
              `${hidden.length} focusable element(s) inside an aria-hidden subtree: ` +
                describeHiddenFocus(hidden),
            );
          }
          if (offenders.length) {
            throw new Error(
              `${offenders.length} control(s) with no usable accessible name:${describeOffenders(offenders)}`,
            );
          }
        });
      } finally {
        await ctx.close();
      }
    }
  }

  /* ── 2. The eight admin tabs, by hash ────────────────────────────────── */
  for (const tab of ADMIN_TABS) {
    for (const width of WIDTHS) {
      const label = `${width}px /admin#${tab}`;
      const route = { path: `/admin#${tab}`, session: 'admin', interceptAll: true };
      const { ctx, page, cdp } = await openSurface(route, width);
      try {
        await test(`${label}: every control has an accessible name`, async () => {
          await assertReachedBody(page, route.path);
          const { offenders, controlCount } = await sweepNames(cdp);
          if (controlCount < MIN_CONTROLS) {
            throw new Error(
              `only ${controlCount} named-role control(s) found (floor ${MIN_CONTROLS}) — the tab ` +
                'did not mount, which is a failure and not a clean pass',
            );
          }
          const hidden = await sweepHiddenFocus(page);
          if (hidden.length) {
            throw new Error(
              `${hidden.length} focusable element(s) inside an aria-hidden subtree: ` +
                describeHiddenFocus(hidden),
            );
          }
          if (offenders.length) {
            throw new Error(
              `${offenders.length} control(s) with no usable accessible name:${describeOffenders(offenders)}`,
            );
          }
        });
      } finally {
        await ctx.close();
      }
    }
  }

  /* ── 3. The job-detail dialog on /public ───────────────────────────────
     The resting sweep above reads `/public` with NO overlay open, so the
     dialog's own controls are not in that measurement at all. This surface
     opens it with a real click and asserts it is actually open BEFORE sweeping,
     so the sweep cannot read an idle page and call it "the dialog is clean". */
  for (const width of WIDTHS) {
    const label = `${width}px /public + Detail`;
    const { ctx, page, cdp } = await openSurface({ path: '/public', session: null, waitFor: ROWS }, width);
    try {
      await test(`${label}: the opened dialog has no unnamed control`, async () => {
        await assertReachedBody(page, '/public');
        await page.locator(DETAIL).first().click();
        await page.waitForTimeout(450);

        const visible = await page.evaluate(
          () =>
            [...document.querySelectorAll('.u-modal-shell')].filter(
              (x) => (x.offsetWidth > 0 || x.offsetHeight > 0) && x.getAttribute('aria-hidden') !== 'true',
            ).length,
        );
        if (visible !== 1) {
          throw new Error(`${visible} visible overlay(s) after clicking Detail (expected 1)`);
        }

        const { offenders } = await sweepNames(cdp);
        const inside = offenders.filter((o) => o.overlay >= 0);
        if (inside.length) {
          throw new Error(
            `${inside.length} control(s) inside the open dialog have no usable accessible name:` +
              describeOffenders(inside),
          );
        }
      });
    } finally {
      await ctx.close();
    }
  }

  await browser.close();

  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  if (ONLY) console.log(`  filter:   --only=${ONLY}  (${skippedByFilter} surface(s) skipped)`);
  console.log(`  checks:   ${checks}`);
  console.log(`  failed:   ${failures.length}`);
  console.log('════════════════════════════════════════════════════════════════');
  if (failures.length) {
    for (const f of failures) console.log(`  ❌ ${f}`);
    process.exit(1);
  }
  console.log('every control on every measured surface has an accessible name');
}

run();
