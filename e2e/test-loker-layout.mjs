/**
 * E2E Test: Loker table layout (§11.2)
 *
 * WHY THIS EXISTS
 * ---------------
 * §11.2 is about the job table's geometry on a phone, and it was reported fixed
 * once before (§14) while one of its own CSS comments stayed untrue: the card
 * layout claimed "KODE JOB + STATUS sit side by side at the top of the card",
 * but under `display: block` those two cells cannot pair up — the job-name cell
 * is a `display: block` sibling BETWEEN them, so they landed on separate lines
 * 120px apart. A comment is not a measurement, and neither is a screenshot
 * taken once. This asserts the geometry directly.
 *
 * The page renders rows from `POST /.netlify/functions/get-app-data`, which a
 * static `astro preview` cannot answer, so the response is fulfilled with a
 * fixture. Without it the table renders its error row and the geometry under
 * test does not exist at all — the same trap that made `/ai-cv` look measured
 * in §20 while only its login gate was on screen.
 *
 * Run against a built artifact:
 *   BASE_URL=http://127.0.0.1:4321 node e2e/test-loker-layout.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

const JOBS = Array.from({ length: 10 }, (_, i) => ({
  code: `ASJ-2026-${String(i + 1).padStart(3, '0')}`,
  pekerjaan: `Operator Produksi Bidang Manufaktur ${i + 1}`,
  status: i === 0 ? 'OPEN' : i === 1 ? 'URGENT' : 'CLOSE',
  tahapan: 'Seleksi',
  keterangan: 'Keterangan tambahan yang cukup panjang untuk menguji tinggi baris.',
  kategori: 'Manufaktur',
  kuota: '5',
  gender: 'PRIA',
  lokasi: 'Jepang',
  syarat: 'Umur 20-30, Sehat jasmani, Tidak bertato, Tinggi minimal 160 cm',
  templateCv: 'https://example.com/cv-template.pdf',
  createdAt: `2026-08-${String(10 + i).padStart(2, '0')}T00:00:00Z`,
}));

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

/**
 * The table's route. It is `/loker`, NOT `/`.
 *
 * REPAIRED 2026-09-21. This gate pointed at `${BASE}/` and had been failing ever
 * since commit e9317cf moved LokerTable to its own dedicated page. The failure
 * was not a regression in the table — measured at the repair, `/` renders ZERO
 * tables and ZERO `.u-scroll-x` (`index.astro` keeps only a 5-item JobMiniList
 * preview), while `/loker` renders the table with the same 10 fixture rows this
 * gate supplies. So the gate was waiting 20 s for a selector that could never
 * appear, and reporting the timeout as if the layout had broken.
 *
 * A gate that measures the wrong route is worse than a missing gate: it fails
 * for a reason unrelated to what it asserts, so its red carries no information
 * and its green is unreachable. The route is named here rather than inlined so
 * the next move of the table is one edit, not a hunt.
 */
const TABLE_PATH = '/loker';

/** Open the job-listings page with 10 real rows at a given viewport. */
async function openWithRows(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/.netlify/functions/get-app-data', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, activeTheme: 'sakura', jobs: JOBS }),
    }),
  );
  await page.goto(`${BASE}${TABLE_PATH}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.u-scroll-x tbody tr', { timeout: 20000 });
  await page.waitForTimeout(300);
  return { ctx, page };
}

/**
 * Every action control in the row must clear the repo's own touch floor:
 * `DESIGN.md:582` ("Tinggi minimum | 44 px") and `DESIGN.md:691`
 * ("Target sentuh | >=44 px, idealnya 48 px").
 *
 * WHY THIS IS A HELPER AND NOT AN INLINE BLOCK. It used to be asserted only at
 * 390px, where the `rt-row`/`rt-full` card layout (layout.css, max-width: 767px)
 * happens to make the actions compliant — so the 28-36px controls that render at
 * >=768px, a touch-tablet width, were never measured. The gate was right and its
 * VIEWPORT COVERAGE was the hole. Both widths now call the same assertion, so a
 * future third width is one line rather than a copy that can drift.
 */
async function assertRowActionsAtLeast44(page) {
  const actions = await page.evaluate(() => {
    const tr = document.querySelector('.u-scroll-x tbody tr');
    const cells = [...tr.querySelectorAll('td')];
    const cell = cells[cells.length - 1];
    return [...cell.querySelectorAll('button, a')].map((b) => ({
      text: (b.textContent || '').trim().slice(0, 18),
      h: Math.round(b.getBoundingClientRect().height),
    }));
  });
  if (actions.length < 3) throw new Error(`expected 3 row actions, found ${actions.length}`);
  const short = actions.filter((a) => a.h < 44);
  if (short.length) {
    throw new Error(`below 44px: ${short.map((a) => `${a.text}=${a.h}px`).join(', ')}`);
  }
}

async function run() {
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });

  // ── phone: the table becomes a card ───────────────────────────────────────
  const phone = await openWithRows(390, 844);

  await test('390px: the row is a wrapping flex container (card layout)', async () => {
    const got = await phone.page.evaluate(() => {
      const tr = document.querySelector('.u-scroll-x tbody tr');
      const cs = getComputedStyle(tr);
      return { display: cs.display, wrap: cs.flexWrap };
    });
    if (got.display !== 'flex') throw new Error(`tr display is "${got.display}", expected "flex"`);
    if (got.wrap !== 'wrap') throw new Error(`tr flex-wrap is "${got.wrap}", expected "wrap"`);
  });

  await test('390px: KODE JOB and STATUS share the first line of the card', async () => {
    // Two separate regressions live here, and the first draft of this test only
    // caught one of them — a mutation battery found the gap:
    //   a) under `display: block` + `inline-block` the two cells land on
    //      separate lines, which is what the CSS comment denied; and
    //   b) if `order` is lost, they still share a line but it ends up BELOW the
    //      full-width fields, so the card is no longer identifiable first.
    // (b) is why this asserts the identity line is also ABOVE every `.rt-full`
    // cell, not merely that the two cells agree with each other.
    const got = await phone.page.evaluate(() => {
      const tr = document.querySelector('.u-scroll-x tbody tr');
      const cells = [...tr.querySelectorAll('td')];
      const top = (td) => Math.round(td.getBoundingClientRect().top);
      const plain = cells.filter((td) => !td.classList.contains('rt-full'));
      const full = cells.filter((td) => td.classList.contains('rt-full'));
      return {
        plain: plain.map((td) => ({ label: td.getAttribute('data-label'), top: top(td) })),
        fullTop: full.length ? Math.min(...full.map(top)) : null,
      };
    });

    if (got.plain.length < 2) throw new Error(`expected 2 non-.rt-full cells, found ${got.plain.length}`);
    const tops = new Set(got.plain.map((c) => c.top));
    if (tops.size !== 1) {
      throw new Error(
        `identity cells are on ${tops.size} different lines: ` +
          got.plain.map((c) => `${c.label}@y=${c.top}`).join(', '),
      );
    }
    if (got.fullTop === null) throw new Error('no .rt-full cells found to compare against');
    const identityTop = got.plain[0].top;
    if (identityTop >= got.fullTop) {
      throw new Error(
        `identity line is not first: it sits at y=${identityTop} while the ` +
          `full-width fields start at y=${got.fullTop}`,
      );
    }
  });

  await test('390px: every row action is at least 44px tall', () => assertRowActionsAtLeast44(phone.page));

  await test('390px: the table does not overflow horizontally', async () => {
    const got = await phone.page.evaluate(() => {
      const w = document.querySelector('.u-scroll-x');
      return { scrollWidth: w.scrollWidth, clientWidth: w.clientWidth, overflowX: getComputedStyle(w).overflowX };
    });
    if (got.scrollWidth > got.clientWidth + 1) {
      throw new Error(`wrapper overflows: ${got.scrollWidth} > ${got.clientWidth} (overflow-x: ${got.overflowX})`);
    }
  });

  await test('390px: full-width cells carry their data-label', async () => {
    const got = await phone.page.evaluate(() => {
      const tr = document.querySelector('.u-scroll-x tbody tr');
      const full = [...tr.querySelectorAll('td.rt-full')];
      return full.map((td) => getComputedStyle(td, '::before').content);
    });
    if (!got.length) throw new Error('no .rt-full cells found');
    const missing = got.filter((c) => !c || c === 'none' || c === 'normal');
    if (missing.length) {
      throw new Error(`${missing.length} of ${got.length} .rt-full cells render no label (content: ${missing[0]})`);
    }
  });

  await phone.ctx.close();

  // ── tablet/desktop: still the real table, with pinned identity columns ────
  const wide = await openWithRows(768, 1024);

  await test('768px: the layout is still a table, not a card', async () => {
    const got = await wide.page.evaluate(() => {
      const tr = document.querySelector('.u-scroll-x tbody tr');
      const table = document.querySelector('.u-scroll-x table');
      return { display: getComputedStyle(tr).display, minWidth: getComputedStyle(table).minWidth };
    });
    if (got.display !== 'table-row') throw new Error(`tr display is "${got.display}", expected "table-row"`);
    if (got.minWidth !== '700px') throw new Error(`table min-width is "${got.minWidth}", expected "700px"`);
  });

  await test('768px: the first two columns are pinned for horizontal scrolling', async () => {
    const got = await wide.page.evaluate(() => {
      const ths = [...document.querySelectorAll('.u-scroll-x thead th')].slice(0, 2);
      return ths.map((th) => ({ position: getComputedStyle(th).position, left: getComputedStyle(th).left }));
    });
    if (got.length < 2) throw new Error('fewer than 2 header cells found');
    if (got[0].position !== 'sticky') throw new Error(`column 1 position is "${got[0].position}", expected "sticky"`);
    if (got[1].position !== 'sticky') throw new Error(`column 2 position is "${got[1].position}", expected "sticky"`);
  });

  await wide.ctx.close();

  // ── desktop: the SAME 44px floor, where nothing used to cover it ──────────
  // The 390px assertion above passes only because the mobile-only card layout
  // (layout.css `rt-row`/`rt-full`, max-width: 767px) inflates the controls.
  // At >=768px — a tablet, which is a touch device — the hand-rolled
  // `px-2 py-1.5 text-[10px]` buttons render 28-36px and no rule touched them.
  // That is exactly how five controls sat under the floor with a green gate.
  const desktop = await openWithRows(1280, 900);

  await test('1280px: every row action is at least 44px tall', () => assertRowActionsAtLeast44(desktop.page));

  await desktop.ctx.close();
  await browser.close();

  if (failures.length) {
    console.log(`\n❌ loker layout: ${failures.length} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ loker layout: all checks passed.');
  }
}

run().catch(async (err) => {
  console.error(`❌ loker layout crashed: ${err?.stack || err}`);
  await browser?.close();
  process.exitCode = 1;
});
