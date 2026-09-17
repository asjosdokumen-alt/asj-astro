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
    // 'Lowongan Loker' adalah konten nyata hasil render (ada di HTML statis).
    await page.waitForSelector('text=Lowongan Loker', { timeout: 15000 });
  });

  await test('Tab Lowongan Loker exists', async () => {
    const tab = await page.locator('button:has-text("Lowongan Loker")');
    if (await tab.count() === 0) throw new Error('Tab not found');
  });

  await test('Tab Program & Layanan exists', async () => {
    const tab = await page.locator('button:has-text("Program & Layanan")');
    if (await tab.count() === 0) throw new Error('Tab not found');
  });

  await test('Filter buttons exist (Semua/Buka/Urgent/Tutup)', async () => {
    for (const f of ['Semua', 'Buka', 'Urgent', 'Tutup']) {
      const btn = await page.locator(`button:has-text("${f}")`);
      if (await btn.count() === 0) throw new Error(`Filter "${f}" not found`);
    }
  });

  await test('Loker table has headers', async () => {
    for (const h of ['KODE JOB', 'NAMA PEKERJAAN', 'STATUS']) {
      const th = await page.locator(`th:has-text("${h}")`);
      if (await th.count() === 0) throw new Error(`Header "${h}" not found`);
    }
  });

  await test('Switch to Layanan tab', async () => {
    await page.click('button:has-text("Program & Layanan")');
    await page.waitForSelector('text=Penerimaan Siswa', { timeout: 3000 });
  });

  await test('Layanan cards render', async () => {
    for (const card of ['Penerimaan Siswa', 'Pengurusan Visa', 'Pendaftaran Ujian']) {
      const el = await page.locator(`text=${card}`);
      if (await el.count() === 0) throw new Error(`Card "${card}" not found`);
    }
  });

  await test('Footer renders', async () => {
    const footer = await page.locator('text=PT Amanah Sakura Japan');
    if (await footer.count() === 0) throw new Error('Footer not found');
  });

  await test('Back button exists', async () => {
    const back = await page.locator('text=Kembali ke Portal');
    if (await back.count() === 0) throw new Error('Back button not found');
  });

  await teardown();
}

run();
