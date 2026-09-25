/**
 * E2E Test: Public Page
 * Tests: page load, tabs, loker table, layanan section
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
let browser, page;

async function setup() {
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  page = await browser.newPage();
}

async function teardown() { await browser?.close(); }

async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { console.log(`❌ ${name}: ${err.message}`); process.exitCode = 1; }
}

async function run() {
  await setup();

  await test('Public page loads', async () => {
    await page.goto(`${BASE}/public/`);
    // Harus menunggu teks yang BENAR-BENAR terlihat di halaman.
    // Sebelumnya menunggu 'text=ASJ Portal' — string itu HANYA ada di meta
    // <apple-mobile-web-app-title>, tidak pernah sebagai teks yang terlihat,
    // jadi assertion ini pasti timeout 30 detik walau halamannya sehat.
    //
    // RE-AIMED 2026-09-25. This used to wait on `text=Lowongan Loker` — the
    // visible text of the first tab. That label was removed on the owner's
    // instruction (the tab is now icon-only with an `aria-label`), so waiting
    // on it would time out on a HEALTHY page. The anchor is now the Loker
    // PANEL's own header row, which is the content the visitor is actually
    // promised and is rendered by the LokerTable island.
    await page.waitForSelector('text=KODE JOB', { timeout: 15000 });
  });

  await test('Tab Lowongan Loker exists', async () => {
    // The tab's accessible NAME still exists (aria-label), but its visible
    // text does not — so key on the stable `data-public-tab` hook the switcher
    // itself uses, not on `:has-text`. Assert the control is present AND
    // visible (a bare `count()` would pass on a `hidden` button).
    const tab = page.locator('[data-public-tab="loker"]').filter({ visible: true });
    if (await tab.count() === 0) throw new Error('Tab [data-public-tab="loker"] not visible');
    // …and it must still carry an accessible name even though it has no text.
    const label = await tab.first().getAttribute('aria-label');
    if (!label?.trim()) throw new Error('Loker tab has no accessible name');
  });

  await test('Tab Program & Layanan exists', async () => {
    const tab = await page.locator('button:has-text("Program & Layanan")');
    if (await tab.count() === 0) throw new Error('Tab not found');
  });

  // ── VISIBILITY, NOT MERE PRESENCE ─────────────────────────────────────────
  //
  // ⚠ MEASURED 2026-09-21, and this was a REAL HOLE IN THIS GUARD. Every check
  // below used `.count()`, which counts an element whether or not the visitor can
  // see it. A mutation that added `class="hidden"` to the Loker panel made the
  // whole section invisible and this guard stayed GREEN:
  //
  //     lokerVisible: false      <- the section really was hidden
  //     thCount:      1          <- count() still counted the <th>
  //     thVisible:    0          <- nothing was on screen
  //
  // So the page could ship blank and the gate would pass. That is the same defect
  // class as the landing gate's over-broad `nav a[href="/loker"]`: an assertion
  // that cannot distinguish "present" from "perceivable". The `.filter({ visible:
  // true })` form is what these checks now use. Do NOT write `text=X:visible` —
  // that is not valid Playwright syntax and parses `:visible` as literal text, so
  // it matches nothing even on a healthy page (measured; it cost me a wrong
  // conclusion). The tab BUTTONS are matched without the filter on purpose — they
  // sit in the always-visible tab bar — but the PANEL CONTENT they reveal must be
  // visible, because that is what the visitor is promised.
  await test('Filter buttons exist (Semua/Buka/Urgent/Tutup)', async () => {
    for (const f of ['Semua', 'Buka', 'Urgent', 'Tutup']) {
      const btn = await page.locator(`button:has-text("${f}")`).filter({ visible: true });
      if (await btn.count() === 0) throw new Error(`Filter "${f}" not visible`);
    }
  });

  await test('Loker table has headers', async () => {
    for (const h of ['KODE JOB', 'NAMA PEKERJAAN', 'STATUS']) {
      const th = await page.locator(`th:has-text("${h}")`).filter({ visible: true });
      if (await th.count() === 0) throw new Error(`Header "${h}" not visible`);
    }
  });

  await test('Switch to Layanan tab', async () => {
    await page.click('button:has-text("Program & Layanan")');
    await page.waitForSelector('text=Penerimaan Siswa', { timeout: 3000 });
  });

  await test('Layanan cards render', async () => {
    for (const card of ['Penerimaan Siswa', 'Pengurusan Visa', 'Pendaftaran Ujian']) {
      const el = await page.locator(`text=${card}`).filter({ visible: true });
      if (await el.count() === 0) throw new Error(`Card "${card}" not visible`);
    }
  });

  await test('Footer renders', async () => {
    const footer = await page.locator('text=PT Amanah Sakura Japan').filter({ visible: true });
    if (await footer.count() === 0) throw new Error('Footer not visible');
  });

  await test('Back button exists', async () => {
    const back = await page.locator('text=Kembali ke Portal').filter({ visible: true });
    if (await back.count() === 0) throw new Error('Back button not visible');
  });

  await teardown();
}

run();
