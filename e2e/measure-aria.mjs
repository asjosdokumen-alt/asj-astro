/**
 * measure-aria.mjs — an EVIDENCE tool, NOT a gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * The repo already enforces a lot of the a11y floor, and each piece has its own
 * gate: `test-contrast.mjs` / `test-hover-contrast.mjs` (colour),
 * `test-headings.mjs` (h1, heading order, `<main>`, skip-links),
 * `test-labels.mjs` (`<label for>` association), `test-dialog.mjs` (dialog role,
 * `aria-modal`, an explicit accessible name). What NONE of them read is the
 * question the accessible name is actually for:
 *
 *     **does this control HAVE a name at all?**
 *
 * `test-labels.mjs` proves a `<label>` resolves to its control. It cannot see a
 * `<button>` that contains only an `<svg>`, or an `aria-label` whose translation
 * key does not exist, because neither has a `<label>` element to associate. That
 * control is announced as "button" and nothing else.
 *
 * ── WHY IT READS THE REAL ACCESSIBILITY TREE, NOT THE SOURCE ────────────────
 * Grepping `src/` for `aria-label` answers a different question ("is the
 * attribute spelled somewhere?") and it is wrong in both directions. Measured
 * 2026-09-28: a grep for `aria-label` over `src/**\/*.tsx` returns ~60 hits, and
 * NOT ONE of them tells you whether the *rendered* control ended up named —
 * because the name can come from `aria-labelledby`, from subtree text, from a
 * `<label for>`, or from `title`, and because a component that is never rendered
 * on the route you care about contributes nothing.
 *
 * So this tool asks Chromium. `Accessibility.getFullAXTree` returns the tree the
 * platform exposes to assistive tech, with the computed `role` and `name` for
 * every node. That is the artefact under test — not the JSX, not the attribute.
 *
 * ── WHAT IT LOOKS FOR (three rules, each independently falsifiable) ─────────
 *  R1  A control whose accessible NAME is empty. The role list below is the set
 *      where an empty name is a defect rather than a design choice (a `<button>`
 *      with only an icon; a `<link>` wrapping only an image; an unlabelled
 *      `<input>`).
 *  R2  A name that is a RAW TRANSLATION KEY. `t()` in `src/store/i18n.ts:2136`
 *      falls back to the key itself (`... || key`), so `aria-label={t('x.y')}`
 *      with `x.y` missing from every dictionary ships the literal string
 *      `"x.y"` as the name — visible to screen readers, invisible to every
 *      other gate, and it renders as normal-looking markup in the browser.
 *  R3  A FOCUSABLE element inside an `aria-hidden="true"` subtree. This is the
 *      axe-core `aria-hidden-focus` rule: the element is removed from the
 *      accessibility tree but still reachable by Tab, so a keyboard user lands
 *      on a control that announces nothing. Measured in-page (it is a DOM
 *      relation, not an AX-tree property).
 *
 * ── WHAT IT CANNOT SEE (the honest boundary) ────────────────────────────────
 *  1. `/admin` is read on its DEFAULT tab only, and `/candidate` against a
 *     fabricated session is rejected by the API — so those two contribute their
 *     shell and not their ten tabs. The same coverage gap `test-headings.mjs`
 *     records at length; it is not closed here either.
 *  2. Dynamic states are not swept: an error toast, a validation message, a
 *     modal that only exists after a click. Only the resting page.
 *  3. A name that is PRESENT but WRONG ("Close" on a delete button) is not
 *     detectable by any automated tool, this one included. It checks for
 *     ABSENCE, not for truth.
 *  4. `aria-labelledby` is resolved by the browser, so a dangling id yields an
 *     empty name and lands in R1 — that part is honest.
 *
 * Run against a built artifact:
 *   BASE_URL=http://127.0.0.1:4321 node e2e/measure-aria.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const ROWS = 'table tbody tr';

/**
 * Roles where an EMPTY accessible name is a defect.
 *
 * Deliberately a closed list rather than "every node with a name", because most
 * roles legitimately have none: `generic`, `paragraph`, `listitem`, `group`
 * (unnamed), `StaticText`. Including them would bury the signal in thousands of
 * rows and turn the tool into noise. These are the roles the ARIA spec marks as
 * name-required, minus the ones this repo has no instances of.
 */
const NAME_REQUIRED = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'img',
]);

/**
 * A name that is a dotted lowercase token — the shape `t()` leaves behind when a
 * key is missing. Anchored and narrow on purpose: a real name is free text, and
 * a loose pattern would flag things like "a.b" in legitimate copy.
 */
const RAW_KEY = /^[a-z][A-Za-z0-9]*(?:\.[a-z0-9_]+)+$/;

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
 * A synthetic `getAppData` payload, so this tool is HERMETIC — the same reason
 * `test-contrast.mjs` carries one. The LokerTable rows and the announcement
 * marquee exist only AFTER `/.netlify/functions/get-app-data` resolves, and
 * against `astro preview` in CI there is no backend at all. Without the fixture
 * the audit would report a clean pass for a table it never saw.
 *
 * THREE rows, not ten: the contrast gate needed all three status badges for its
 * colour sweep, but for accessible names the population that matters is the
 * ACTION COLUMN, and the three rows below cover all three shapes it renders —
 * OPEN with a `templateCv` (Format + Lamar), URGENT (Detail + Lamar), CLOSE
 * (Detail + a disabled "closed" button). A disabled control is included
 * deliberately: it is still announced, so it still needs a name.
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
 * `session` is the ROLE to fabricate, or null to inject nothing.
 * `/ai-cv` declares `gate: 'server'` and re-verifies against the backend, so a
 * fabricated token is judged invalid and it redirects to `/` — it must be read
 * with NO session, exactly as `test-headings.mjs` documents.
 */
const ROUTES = [
  { path: '/', session: null },
  { path: '/loker', session: null, waitFor: ROWS },
  { path: '/public', session: null, waitFor: ROWS },
  { path: '/ai-cv', session: null },
  { path: '/apply', session: 'kandidat' },
  { path: '/siswa-baru', session: 'kandidat' },
  { path: '/master', session: 'kandidat' },
  { path: '/share', session: 'kandidat' },
  { path: '/admin', session: 'admin' },
  { path: '/candidate', session: 'kandidat' },
];

const WIDTHS = [390, 1280];

/**
 * The admin panel's tabs, read by HASH rather than by clicking.
 *
 * `AdminPanel` renders ONE tab at a time (`<TabContent tab={activeTab} />`), and
 * the tab is hash-routable (`tabFromHash()`), so `/admin#wa` mounts that tab
 * directly with no click and no responsive sidebar involved. `test-headings.mjs`
 * records that a click-walk was written and REMOVED because it was not
 * deterministic — any tab that calls `api.secure(...)` had its rejection routed
 * through `apiClient`, which logs the session out and redirects to `/`, and two
 * runs ten minutes apart disagreed about which tabs bounced.
 *
 * This pass attacks that differently: EVERY `/.netlify/functions/**` call is
 * fulfilled locally with a benign success payload, so nothing is ever rejected,
 * nothing logs out, and the tab stays mounted. That is the same trick the
 * candidate gate already relies on for `/candidate`.
 *
 * It is a PROBE first and a surface second: each tab is reported with the number
 * of controls it rendered, because a tab that crashed would render nothing and
 * would otherwise read as "clean". A tab with 0 controls is a GAP, not a pass.
 */
const ADMIN_TABS = ['kelola', 'tugas', 'dbjob', 'pelamar', 'wa', 'mail', 'agenda', 'config'];

/**
 * One candidate row, so the admin tabs that render a TABLE actually render one.
 * Shape from `Kandidat` (`src/store/adminStore.ts`); the fields below are the
 * ones the row templates read — `wa` for the chat/history buttons in
 * `TabPelamar`, `nama`/`idLoker`/`tahapan`/`status` for the cells.
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

let browser;

/**
 * Read one (route, width) pair.
 *
 * The AX tree is fetched through CDP rather than Playwright's `page.accessibility`
 * because the repo already talks CDP for `CSS.forcePseudoState`
 * (`measure-hover-contrast.mjs`) and because the raw tree exposes `ignored` plus
 * `backendDOMNodeId`, which is what lets an offending node be resolved back to
 * the element that produced it.
 */
async function audit(route, width, session) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // Hermetic data: intercept ONLY the app-data call, so the markup under audit is
  // the real markup and the payload is not the variable.
  if (route.interceptAll) {
    // Every function call answered locally, so no rejection can trigger
    // `apiClient`'s logout-and-redirect. See ADMIN_TABS.
    //
    // PER-ENDPOINT, not one blob: the row-level controls this pass exists to
    // reach only exist when the tab HAS rows. `TabPelamar` reads
    // `getCandidatesPage` (`/.netlify/functions/candidates`) and `TabWA` reads
    // `waTemplates` off `get-app-data`; a single empty `{success:true}` renders
    // both tabs with an empty table, and an empty table reads as "clean".
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

  if (session) {
    await page.addInitScript((v) => {
      try {
        localStorage.setItem('asj_auth', v);
      } catch {
        /* storage unavailable — the page will show its gate and we will say so */
      }
    }, authFor(session));
  }

  try {
    const resp = await page.goto(BASE + route.path, { waitUntil: 'networkidle', timeout: 45_000 });
    const status = resp ? resp.status() : 0;
    if (status !== 200) throw new Error(`GET ${route.path} -> HTTP ${status}`);

    if (route.waitFor) {
      await page.waitForSelector(route.waitFor, { timeout: 15_000 });
    }
    await page.waitForTimeout(400);

    // R3 — in-page, because "focusable inside aria-hidden" is a DOM relation.
    const hiddenFocus = await page.evaluate(() => {
      const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]';
      const out = [];
      for (const holder of document.querySelectorAll('[aria-hidden="true"]')) {
        for (const el of holder.querySelectorAll(FOCUSABLE)) {
          // A `tabindex="-1"` element is not Tab-reachable, so it is not the
          // defect this rule names. Everything else is.
          const ti = el.getAttribute('tabindex');
          if (ti === '-1') continue;
          if (el.disabled) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue; // display:none is not reachable either
          out.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
            label: el.getAttribute('aria-label') || '',
            holder: holder.tagName.toLowerCase() + (holder.id ? `#${holder.id}` : ''),
          });
        }
      }
      return out;
    });

    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');

    const unnamed = [];
    const rawKeys = [];
    let controlCount = 0;
    for (const n of nodes) {
      if (n.ignored) continue;
      const role = n.role?.value;
      if (!role) continue;
      if (NAME_REQUIRED.has(role)) controlCount++;
      const name = (n.name?.value ?? '').trim();
      const row = { role, name, backendDOMNodeId: n.backendDOMNodeId };
      if (NAME_REQUIRED.has(role) && name === '') unnamed.push(row);
      else if (name && RAW_KEY.test(name)) rawKeys.push(row);
    }

    // Resolve each offending node back to its element, so the report names a
    // FILE-ADJACENT location rather than an opaque node id. Done lazily and only
    // for offenders — resolving the whole tree would be thousands of round-trips.
    for (const row of [...unnamed, ...rawKeys]) {
      if (!row.backendDOMNodeId) continue;
      try {
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: row.backendDOMNodeId });
        const res = await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          returnByValue: true,
          functionDeclaration: `function () {
            const el = this;
            const path = [];
            let p = el;
            while (p && p.nodeType === 1 && path.length < 3) {
              const cls = typeof p.className === 'string' ? p.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
              path.unshift(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (cls ? '.' + cls : ''));
              p = p.parentElement;
            }
            return JSON.stringify({
              tag: el.tagName.toLowerCase(),
              html: (el.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 180),
              path: path.join(' > '),
            });
          }`,
        });
        Object.assign(row, JSON.parse(res.result.value));
        await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
      } catch {
        /* the node vanished between the tree read and the resolve — leave it bare */
      }
      delete row.backendDOMNodeId;
    }

    return { path: route.path, width, unnamed, rawKeys, hiddenFocus, controlCount };
  } finally {
    await ctx.close();
  }
}

async function run() {
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  const results = [];
  const surfaces = [
    ...ROUTES.map((r) => ({ ...r, label: r.path })),
    ...ADMIN_TABS.map((tab) => ({
      path: `/admin#${tab}`,
      label: `/admin#${tab}`,
      session: 'admin',
      interceptAll: true,
      waitFor: 'main, [role="main"]',
    })),
  ];
  for (const route of surfaces) {
    for (const width of WIDTHS) {
      try {
        const r = await audit(route, width, route.session);
        r.label = route.label;
        results.push(r);
      } catch (err) {
        results.push({ path: route.path, label: route.label, width, error: err.message });
      }
    }
  }
  await browser.close();

  console.log('surface              width  controls  unnamed  raw-key  hidden-focus');
  console.log('--------------------------------------------------------------------');
  let totalUnnamed = 0;
  let totalKeys = 0;
  let totalHidden = 0;
  for (const r of results) {
    if (r.error) {
      console.log(`${r.label.padEnd(20)} ${String(r.width).padEnd(6)} ERROR: ${r.error}`);
      continue;
    }
    totalUnnamed += r.unnamed.length;
    totalKeys += r.rawKeys.length;
    totalHidden += r.hiddenFocus.length;
    console.log(
      `${r.label.padEnd(20)} ${String(r.width).padEnd(6)} ${String(r.controlCount).padEnd(9)} ` +
        `${String(r.unnamed.length).padEnd(8)} ${String(r.rawKeys.length).padEnd(8)} ${r.hiddenFocus.length}`,
    );
  }
  console.log('--------------------------------------------------------------------');
  console.log(`TOTAL ${totalUnnamed} unnamed, ${totalKeys} raw-key, ${totalHidden} focusable-in-aria-hidden`);

  for (const r of results) {
    if (r.error || (!r.unnamed.length && !r.rawKeys.length && !r.hiddenFocus.length)) continue;
    console.log(`\n── ${r.label} @ ${r.width}px  (${r.controlCount} named-role controls)`);
    for (const u of r.unnamed) console.log(`  [R1 unnamed ${u.role}] ${u.path ?? '?'}\n       ${u.html ?? ''}`);
    for (const k of r.rawKeys) console.log(`  [R2 raw-key "${k.name}"] ${k.path ?? '?'}\n       ${k.html ?? ''}`);
    for (const h of r.hiddenFocus) console.log(`  [R3 hidden-focus] <${h.tag}> inside ${h.holder}  text=${JSON.stringify(h.text)}`);
  }

  if (process.env.ARIA_JSON) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.ARIA_JSON, JSON.stringify(results, null, 2));
    console.log(`\nJSON written to ${process.env.ARIA_JSON}`);
  }
}

run();
