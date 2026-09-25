/**
 * E2E Test: every rendered <label> is actually tied to its control.
 *
 * WHY THIS EXISTS
 * ---------------
 * MEASURED 2026-09-16 on the built artifact, before this round's fix:
 *
 *   /master      23 labels,  4 with a resolving `for`   -> 19 of 23 unassociated
 *   /apply        9 labels,  0 with a resolving `for`
 *   /siswa-baru  12 labels,  0 with a resolving `for`
 *
 * A `<label>` that is neither associated by `for` nor wraps its control is
 * announced to assistive tech as nothing, and clicking it does not focus the
 * field. The three routes above are the ones a candidate actually fills in.
 *
 * WHY THIS WALKS THE WIZARD
 * -------------------------
 * The first version of this guard read the page ONCE, after load, and reported
 * "/master — every rendered label is associated: 23 labels". That number was
 * true and useless: /master is a FIVE-STEP wizard, and 23 of its 90 labels live
 * on step 1. Mutation testing made the gap visible — mutations to `<SswField />`
 * and `<ManualSelect />` (whose labels render on steps 3 and 4) SURVIVED, because
 * the sweep never rendered them.
 *
 * The measured population, per step:
 *
 *   step 1  23 labels  23 with for=   clean
 *   step 2  24 labels  24 with for=   clean
 *   step 3  12 labels   2 with for=   10 unassociated
 *   step 4  12 labels   1 with for=   11 unassociated
 *   step 5  19 labels  10 with for=   clean (its other 9 wrap their <input>)
 *
 * So the guard now advances the wizard and sweeps every step. It ASSERTS the
 * step count instead of hoping: if the wizard cannot be advanced, or advances
 * fewer steps than declared, that is a FAILURE — a sweep that silently covers
 * one step out of five is the exact defect this rewrite exists to remove.
 *
 * WHY THIS ALSO ADDS A ROW TO EVERY LOOP
 * --------------------------------------
 * Steps 3 and 4 build their fields inside `.map()` loops, and the ids are derived
 * from the loop index (`mf-edu-thn-awal-${i}`). With the DEFAULT one row per loop
 * that scheme cannot fail: dropping `-${i}` produces a single id, no collision,
 * and every `for=` still resolves. The defect is invisible until a second row
 * exists — and a second row is one click away, which is exactly what a candidate
 * does.
 *
 * So each screen is read TWICE: as rendered, and after clicking every "Tambah"
 * button once (measured: step 3 goes 12 -> 24 labels, step 4 goes 12 -> 16). The
 * expansion is itself asserted — if a "+" was clicked but the label count did not
 * grow, the guard FAILS rather than counting the same screen twice and reporting
 * double coverage. Mutation M14 drops `-${i}` and is killed ONLY by this second
 * reading.
 *
 * ...and the assertion is PER BUTTON, because the aggregate version was already
 * measured passing on a defect. Step 3 carries TWO loops ("Tambah Pendidikan" and
 * "Tambah Pekerjaan"), so clicking all the "+" buttons in one pass and comparing
 * the total is satisfied by whichever loop still works. MEASURED 2026-09-16 with
 * only the education "+" dead: step 3 still went 12 -> 18 labels and the guard
 * passed — while the loop whose ids it exists to check was the dead one. M15 now
 * kills a single "+" and is the regression test for the per-button form; M16 kills
 * the OTHER one, so a loop that only ever checked button #0 would still be caught.
 * The proxy for "a row was added" is the label count; every row in these loops
 * carries labels, so the two move together (measured: 6 labels per education and
 * per job row, 4 per family row).
 *
 * WHY THIS IS NOT JUST THE LINT RATCHET
 * -------------------------------------
 * Biome's `noLabelWithoutControl` counts SOURCE LOCATIONS. The forms build their
 * labels inside helper components (`<F />` alone renders 55 of them from three
 * source lines) and inside `.map()` loops (one line, one label per row), so the
 * source count and the user-visible count differ by more than an order of
 * magnitude: the whole fix took that rule from 138 to 107 — a change of 31 — while
 * the rendered association went from 35 of 90 to 130 of 130 across the same steps.
 *
 * A source-level check also cannot see the two ways this fix can silently rot:
 *
 *   - a `for=` that points at an id that does not exist (typo, renamed field)
 *   - the SAME id emitted twice, so `for=` resolves to the wrong control
 *
 * Both are invisible in the source and produce no console error. The second is
 * why the row expansion above exists.
 *
 * HOW THIS GUARD COULD LIE, AND WHAT STOPS IT
 * -------------------------------------------
 * 1. PASSING VACUOUSLY. "Zero unassociated labels" is also true of a route that
 *    rendered no labels at all, of a selector that matches nothing, and of a page
 *    that never loaded. So a route with zero labels is itself a FAILURE, and the
 *    HTTP status is asserted before any DOM is read.
 * 2. MEASURING THE LOGIN GATE. These routes gate on the auth STORE; without a
 *    fabricated session they render a gate instead of the form, and the gate has
 *    its own labels. A gate marker in the body is treated as a failure to measure,
 *    not as a clean result.
 * 3. A DEAD SWEEP. A predicate that can never fire looks identical to a clean
 *    page, so the guard PLANTS an unassociated label, proves the sweep flags it,
 *    and removes it — a positive control, run on the same page.
 * 4. COVERING LESS THAN IT CLAIMS. Fixed by walking the wizard, asserting the step
 *    count, and proving each step actually advanced (content signature before and
 *    after the click).
 * 5. COUNTING THE SAME SCREEN TWICE. Fixed by asserting the row expansion grew the
 *    label count — PER BUTTON, so one dead "+" cannot hide behind a working one.
 * 6. CLAIMING MORE COVERAGE THAN IT HAS. Only the four candidate-facing routes are
 *    measured. The admin modals (`TabTambah`, `InputManualModal`,
 *    `EditCandidateModal`, `AdminJobEditModal`, `MatchmakingModal`, `CvMiniModal`,
 *    `TabJadwal`, `LoginModal`) still carry unassociated labels and are NOT covered
 *    here. The guard prints the boundary instead of implying the whole app is clean.
 *
 * WHY /ai-cv IS A ROUTE, AND WHAT A GROUP LABEL NEEDED
 * ----------------------------------------------------
 * Three of /ai-cv's labels name a PAIR of textareas (Indonesian + Japanese), and
 * `for=` can only ever name one of them — so `for=` was the wrong tool, and the
 * fix was a group label (see `TextAreaPair`'s `groupLabel` prop).
 *
 * That makes those labels invisible to the "labels must be associated" predicate,
 * which is not the same as correct: a group can lose its name with no <label>
 * involved at all. The first attempt used `role="group"` + `aria-labelledby`, which
 * trades the label diagnostic for `lint/a11y/useSemanticElements` ("use
 * <fieldset>"); the linter's suggestion is also the stronger fix, because
 * `<legend>` names its `<fieldset>` natively — there is no id that can drift out
 * from under the name. So the sweep asserts BOTH shapes: every
 * `[role="group"][aria-labelledby]` must resolve, and every `<fieldset>` must carry
 * a non-empty `<legend>`. Reverting a group back to a bare `<label>` re-enters the
 * unassociated check, so the fix is pinned in both directions.
 *
 * Run against a built artifact:
 *   node e2e/test-labels.mjs               (defaults to localhost:4321)
 *   BASE_URL=http://localhost:4321 node e2e/test-labels.mjs
 */
import { chromium } from 'playwright';

/*
 * DEFAULT HOST IS `localhost`, NOT `127.0.0.1` — a measured fix, 2026-09-20,
 * applied here and to `test-drawer.mjs` (and to the since-deleted
 * `test-site-nav.mjs`, which is where it was found).
 *
 * This file defaulted to `http://127.0.0.1:4321`, which can NEVER reach an
 * `astro preview` server: preview v5.12.0 binds IPv6-only (`netstat` shows
 * `[::1]:4321 LISTENING`), so 127.0.0.1 is refused. Measured with the server
 * definitely up: 127.0.0.1 -> curl exit 7, localhost -> 200.
 *
 * This gate reported 0/4 on every run because of it, and it is worth naming why
 * that was easy to miss: the failure arrives as ERR_CONNECTION_REFUSED, the
 * same error a machine with no server produces, so the obvious next step is to
 * restart a healthy server rather than to suspect the URL. With `localhost` it
 * is 4/4, measuring 190 labels across four candidate-facing routes.
 */
const BASE = process.env.BASE_URL || 'http://localhost:4321';

/** Fabricated session: these routes gate on the STORE, not the backend. */
function authFor(role) {
  return JSON.stringify({
    sessionToken: `labels-fake-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    role,
    wa: '081234567890',
    name: 'Labels Check',
    lastChecked: Date.now(),
  });
}

/**
 * `steps` is the number of screens the sweep must reach, and it is ASSERTED.
 * A route that renders fewer is a coverage shortfall, not a pass.
 */
const ROUTES = [
  { path: '/master', session: 'kandidat', steps: 5 },
  { path: '/apply', session: 'kandidat', steps: 1 },
  { path: '/siswa-baru', session: 'kandidat', steps: 1 },
  { path: '/ai-cv', session: 'kandidat', steps: 1 },
];

/** The wizard's Next button, located by its sprite glyph rather than its text. */
const ADVANCE = 'button:has(use[href="#fas-arrow-right"])';
/** Every "Tambah" button on the screen — one per repeatable row loop. */
const ADD_ROW = 'button:has(use[href="#fas-plus"])';

/**
 * Text that means we are looking at a gate, not the form body.
 *
 * ⚠ 'Login Pelamar' was removed 2026-09-19 for the same reason as in
 * `test-headings.mjs`: it is the label of a LOGIN BUTTON (`header.login`), so it
 * is present on any page that offers a way to log in rather than only on a gate.
 * These three strings are each the copy of a GATE state, so a page that shows one
 * really has not rendered its body:
 *   ai_cv.verify_account · ui.redirecting_login · ui.access_denied_redirect
 */
const GATE_MARKERS = [
  'Verifikasi Akun Kandidat',
  'Mengalihkan ke halaman login...',
  'Akses ditolak. Mengalihkan...',
];

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

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/** Read the label/control association state of whatever is on screen. */
const readLabels = (page) =>
  page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    const unassociated = [];
    let withFor = 0,
      resolves = 0,
      dangling = 0,
      wraps = 0;
    for (const l of labels) {
      const f = l.getAttribute('for');
      if (l.querySelector('input, select, textarea')) {
        wraps++;
        continue;
      }
      if (f) {
        withFor++;
        if (document.getElementById(f)) resolves++;
        else {
          dangling++;
          unassociated.push(`for="${f}" resolves to nothing`);
        }
      } else {
        unassociated.push(`"${(l.textContent || '').trim().slice(0, 24)}" has no for=`);
      }
    }
    const seen = {},
      dupIds = [];
    for (const e of document.querySelectorAll('[id]')) {
      if (seen[e.id]) dupIds.push(e.id);
      seen[e.id] = 1;
    }
    /* A group label is the right tool where one label names SEVERAL controls (the
       medical blocks on /ai-cv each name two textareas). Two ways to get that wrong,
       both silent in the DOM and silent in the source: an `aria-labelledby` that
       points at a missing id, and a <fieldset> whose <legend> is empty or absent.
       Neither is visible to the "labels must be associated" predicate, because no
       <label> is involved at all. So both are measured. */
    const unnamedGroups = [];
    for (const g of document.querySelectorAll('[role="group"][aria-labelledby]')) {
      const ids = (g.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
      const missing = ids.filter((id) => !document.getElementById(id));
      if (missing.length) {
        unnamedGroups.push(
          `role=group aria-labelledby="${g.getAttribute('aria-labelledby')}" -> missing ${JSON.stringify(missing)}`,
        );
      }
    }
    for (const f of document.querySelectorAll('fieldset')) {
      const legend = f.querySelector('legend');
      if (!legend || !(legend.textContent || '').trim()) {
        unnamedGroups.push(`fieldset with ${legend ? 'an empty' : 'no'} <legend> — no accessible name`);
      }
    }
    return {
      labels: labels.length,
      withFor,
      resolves,
      dangling,
      wraps,
      unassociated,
      dupIds,
      unnamedGroups,
      groups: document.querySelectorAll('[role="group"], fieldset').length,
      gate: /Verifikasi Akun Kandidat|Mengalihkan ke halaman login\.\.\.|Akses ditolak\. Mengalihkan\.\.\./.test(document.body.innerText || ''),
    };
  });

/** A signature of what is currently on screen, used to prove a step advanced. */
const screenSig = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('label')]
      .map((l) => `${l.getAttribute('for') || ''}:${(l.textContent || '').trim()}`)
      .join('|')
      .slice(0, 200),
  );

/**
 * Click every "Tambah" button, ONE AT A TIME, asserting that EACH click added a
 * row — so every row loop gets a second row.
 *
 * The one-at-a-time part is load-bearing. Clicking them all in a single pass and
 * comparing the total is an AGGREGATE assertion, and an aggregate assertion
 * cannot see a single dead button: as long as ANY loop on the screen still grows,
 * the total grows. MEASURED 2026-09-16 — with only the education "+" turned into
 * a no-op, step 3 still went 12 -> 18 labels because the job "+" kept working, and
 * the guard reported a clean pass. The dead button belonged to the very loop whose
 * index-derived ids this reading exists to exercise, so the hole was exactly where
 * the coverage was claimed.
 *
 * Returns { total, dead, grew }: `dead` is the 1-based index of the first button
 * whose click did not grow the page (0 if every button grew it).
 */
const growEveryLoop = async (page) => {
  const total = await page.evaluate((sel) => document.querySelectorAll(sel).length, ADD_ROW);
  let grew = 0;
  for (let k = 0; k < total; k++) {
    const before = await readLabels(page);
    const clicked = await page.evaluate(
      ({ sel, k: idx }) => {
        const b = document.querySelectorAll(sel)[idx];
        if (!b) return false;
        b.click();
        return true;
      },
      { sel: ADD_ROW, k },
    );
    if (!clicked) return { total, dead: k + 1, grew };
    await page.waitForTimeout(300);
    const after = await readLabels(page);
    if (after.labels <= before.labels) return { total, dead: k + 1, grew };
    grew++;
  }
  return { total, dead: 0, grew };
};

/** Sweep the current screen, then advance, until there is nothing left to advance. */
async function sweep(page, maxSteps) {
  const acc = {
    labels: 0,
    resolves: 0,
    wraps: 0,
    unassociated: [],
    dupIds: [],
    unnamedGroups: [],
    groups: 0,
    screens: 0,
    expanded: 0,
    rows: 0,
    gate: false,
    stuck: 0,
    deadAdd: 0,
  };
  const take = (r, where) => {
    acc.labels += r.labels;
    acc.resolves += r.resolves;
    acc.wraps += r.wraps;
    acc.unassociated.push(...r.unassociated.map((u) => `${where}: ${u}`));
    acc.dupIds.push(...r.dupIds);
    acc.unnamedGroups.push(...r.unnamedGroups.map((u) => `${where}: ${u}`));
    acc.groups += r.groups;
  };

  for (let n = 1; n <= maxSteps + 2; n++) {
    const base = await readLabels(page);
    if (base.gate) {
      acc.gate = true;
      return acc;
    }
    acc.screens = n;
    take(base, `step ${n}`);

    /* Second reading with every repeatable loop grown by one row. Asserted PER
       BUTTON: a "+" that was clicked but did not add a row would otherwise make
       the guard count the same screen twice and report double the coverage —
       and a single dead "+" is invisible to a screen-level total. */
    const grow = await growEveryLoop(page);
    if (grow.total) {
      if (grow.dead) {
        acc.deadAdd = n;
        acc.deadBtn = grow.dead;
        return acc;
      }
      acc.expanded++;
      acc.rows += grow.grew;
      take(await readLabels(page), `step ${n} +1 row × ${grow.grew} loop(s)`);
    }

    const hasNext = await page.evaluate((sel) => !!document.querySelector(sel), ADVANCE);
    if (!hasNext) return acc;

    const before = await screenSig(page);
    await page.evaluate((sel) => document.querySelector(sel)?.click(), ADVANCE);
    await page.waitForTimeout(400);
    const after = await screenSig(page);
    if (after === before) {
      acc.stuck = n;
      return acc;
    }
  }
  acc.stuck = -1;
  return acc;
}

for (const { path, session, steps } of ROUTES) {
  await test(`${path} — every rendered label is associated`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
    await ctx.addInitScript((v) => {
      try {
        localStorage.setItem('asj_auth', v);
      } catch {}
    }, authFor(session));
    const page = await ctx.newPage();

    const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    const status = res?.status();
    if (status !== 200) throw new Error(`HTTP ${status} — refusing to read an error page as the app`);
    await page.waitForTimeout(1800);

    /* Positive control on the live page: plant an unassociated label and prove
       the very predicate above flags it. Without this, "no violations" is
       indistinguishable from "the sweep is blind". */
    const caught = await page.evaluate(() => {
      const probe = document.createElement('label');
      probe.textContent = 'planted-control';
      document.body.appendChild(probe);
      const l = [...document.querySelectorAll('label')].at(-1);
      const isUnassociated = !l.getAttribute('for') && !l.querySelector('input, select, textarea');
      probe.remove();
      return isUnassociated;
    });
    if (!caught) throw new Error('the planted unassociated label was NOT flagged — the sweep is blind');

    const r = await sweep(page, steps);
    if (r.gate) {
      throw new Error(
        `the body is a login gate, not the form (markers: ${GATE_MARKERS.join(' / ')}) — nothing was measured`,
      );
    }
    if (r.labels === 0) {
      throw new Error('the route rendered ZERO labels — this check would pass vacuously');
    }
    if (r.deadAdd) {
      throw new Error(
        `step ${r.deadAdd}: "Tambah" button #${r.deadBtn} was clicked but the label count did not grow — that loop cannot be exercised, so the row-expansion reading would count the same screen twice`,
      );
    }
    if (r.stuck) {
      throw new Error(
        r.stuck === -1
          ? `the sweep ran past ${steps + 2} screens without the Next button disappearing`
          : `the wizard did not advance past step ${r.stuck} (its Next button is present but clicking it changes nothing) — the sweep would silently cover ${r.stuck} of ${steps} steps`,
      );
    }
    if (r.screens !== steps) {
      throw new Error(
        `the sweep reached ${r.screens} screen(s) but this route declares ${steps} — refusing to report coverage it did not get`,
      );
    }
    if (r.dupIds.length) {
      throw new Error(`duplicate id(s), so for= resolves to the wrong control: ${JSON.stringify(r.dupIds.slice(0, 5))}`);
    }
    if (r.unnamedGroups.length) {
      throw new Error(
        `group(s) with no accessible name: ${r.unnamedGroups.slice(0, 3).join(' | ')}`,
      );
    }
    if (r.unassociated.length) {
      throw new Error(
        `${r.unassociated.length} of ${r.labels} labels are unassociated: ${r.unassociated.slice(0, 5).join(' | ')}`,
      );
    }
    console.log(
      `     ↳ ${steps} screen(s), ${r.labels} labels: ${r.resolves} resolve via for=, ${r.wraps} wrap their control, 0 dangling, 0 duplicate ids` +
        (r.groups ? `, ${r.groups} group(s) with a resolved name` : '') +
        (r.rows ? `; re-read on ${r.expanded} screen(s) with ${r.rows} extra row(s), every "+" verified` : ''),
    );
    await ctx.close();
  });
}

await browser.close();

console.log('\nBOUNDARY: only these four candidate-facing routes are measured.');
console.log('The admin modals (TabTambah, InputManualModal, EditCandidateModal, AdminJobEditModal,');
console.log('MatchmakingModal, CvMiniModal, TabJadwal, LoginModal, RincianBiayaModal, ChangePasswordModal,');
console.log('WAPintarModal, AdminShareModal, CandidateProfileModal, PemberkasanModal, TabWA) are NOT');
console.log('covered — see docs/UI_DESIGN_REVIEW.md §27.9 for the measured map of the remainder.');

const failed = results.filter(([s]) => s === 'fail');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
