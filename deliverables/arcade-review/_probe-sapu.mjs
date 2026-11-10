/**
 * Sapuan tata letak keempat permukaan di halaman ASLI (:8888).
 *
 * Kenapa mengukur, bukan memotret saja: cacat yang paling mahal sesi ini
 * (filter /kotoba saling menimpa) LOLOS dari mockup karena mata saya memilih
 * teks pendek. Jadi tiap keadaan diperiksa dua hal yang tidak bisa "kelihatan
 * benar":
 *
 *   1. LUberan — ada elemen di dalam `.arc` yang tepinya melewati tepi arena.
 *   2. TumpANG-TINDIH — dua anak langsung `.arc` (atau dua kontrol dalam satu
 *      baris grid) yang kotaknya beririsan lebih dari 2 px.
 *
 * Keduanya dilaporkan dengan teks elemen + koordinat, supaya perbaikannya
 * menunjuk elemen, bukan tebakan.
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const OUT = 'F:/astro/deliverables/arcade-review';
const BASE = 'http://localhost:8888';

const env = readFileSync('F:/astro/.env.local', 'utf8');
const secret = (env.match(/^SESSION_SECRET=(.+)$/m)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const now = Math.floor(Date.now() / 1000);
const body = Buffer.from(
  JSON.stringify({ role: 'admin', wa: '', name: 'sweep', kind: 'access', iat: now, exp: now + 3600 }),
).toString('base64url');
const token = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;

const SESI = {
  role: 'admin', name: 'sweep', wa: '', sessionToken: token, refreshToken: '',
  isLoggedIn: true, lastChecked: Date.now(),
};

const AUDIT = () => {
  const arc = document.querySelector('.arc');
  if (!arc) return { error: 'tidak ada .arc' };
  const A = arc.getBoundingClientRect();
  const label = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28) || el.tagName.toLowerCase();
  const luber = [];
  for (const el of arc.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.position === 'absolute' || s.position === 'fixed') continue;
    const lebih = Math.round(Math.max(A.right - r.right, r.left - A.left));
    if (lebih < -1) luber.push({ el: label(el), cls: String(el.className).slice(0, 40), lebih });
  }
  const tumpuk = [];
  const anak = [...arc.children].filter((e) => e.getBoundingClientRect().height > 0);
  for (let i = 0; i < anak.length; i++) {
    for (let j = i + 1; j < anak.length; j++) {
      const a = anak[i].getBoundingClientRect();
      const b = anak[j].getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 2) {
        tumpuk.push({ a: label(anak[i]), b: label(anak[j]), w: Math.round(w), h: Math.round(h) });
      }
    }
  }
  return {
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    arcW: Math.round(A.width),
    luber: luber.slice(0, 6),
    jumlahLuber: luber.length,
    tumpuk: tumpuk.slice(0, 6),
  };
};

const browser = await chromium.launch();

async function sapu(nama, lebar, jalur, langkah) {
  const ctx = await browser.newContext({ viewport: { width: lebar, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${jalur}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), SESI);
  await page.reload({ waitUntil: 'networkidle' });

  await langkah(page);

  const hasil = await page.evaluate(AUDIT);
  const tanda = hasil.jumlahLuber > 0 || hasil.tumpuk.length > 0 ? 'MASALAH' : 'ok';
  console.log(`\n[${nama} @${lebar}] ${tanda} arcW=${hasil.arcW} docOverflow=${hasil.docOverflow}`);
  if (hasil.jumlahLuber) console.log('  luber:', JSON.stringify(hasil.luber));
  if (hasil.tumpuk.length) console.log('  tumpuk:', JSON.stringify(hasil.tumpuk));

  await page.screenshot({ path: `${OUT}/_sapu-${nama}-${lebar}.png` });
  await ctx.close();
}

const tungguSoal = async (page) => {
  await page.waitForSelector('[data-testid="kotoba-soal"]', { timeout: 20000 });
  await page.waitForTimeout(400);
};

for (const w of [390, 1280]) {
  await sapu('arcade-genba', w, '/arcade', async (page) => {
    await page.waitForSelector('button:has-text("Mulai Shift")', { timeout: 20000 });
    await page.click('button:has-text("Mulai Shift")');
    await page.waitForSelector('[data-testid="arcade-perintah"]');
    await page.waitForTimeout(400);
  });

  await sapu('arcade-kombo', w, '/arcade', async (page) => {
    await page.click('button:has-text("Combo Kalimat")');
    await page.waitForSelector('[data-testid="arcade-target"]');
    await page.waitForTimeout(400);
  });

  await sapu('kotoba-kuis', w, '/kotoba?wa=081234567890', tungguSoal);
  await sapu('kotoba-ketik', w, '/kotoba?wa=081234567890', async (page) => {
    await tungguSoal(page);
    await page.click('.arc-tab button:has-text("Ketik")');
    await page.waitForTimeout(400);
  });
  await sapu('kotoba-flashcard', w, '/kotoba?wa=081234567890', async (page) => {
    await tungguSoal(page);
    await page.click('.arc-tab button:has-text("Flashcard")');
    await page.waitForTimeout(400);
  });
  await sapu('kotoba-kamus', w, '/kotoba?wa=081234567890', async (page) => {
    await tungguSoal(page);
    await page.click('.arc-tab button:has-text("Kamus")');
    await page.waitForTimeout(600);
  });

  await sapu('mat-lobi', w, '/matematika', async (page) => {
    await page.waitForSelector('button:has-text("Mulai tes")', { timeout: 20000 });
    await page.waitForTimeout(300);
  });
  await sapu('mat-soal', w, '/matematika', async (page) => {
    await page.waitForSelector('button:has-text("Mulai tes")', { timeout: 20000 });
    await page.click('button:has-text("Mulai tes")');
    /* Soal bisa berbentuk pilihan (`[data-opsi]`) ATAU isian (numpad), jadi
       yang ditunggu adalah teks soalnya — bukan salah satu bentuk jawabannya.
       Versi pertama menunggu `[data-opsi]` dan gagal total saat undiannya
       menghasilkan soal Kraepelin. */
    await page.waitForSelector('.arc-soal', { timeout: 20000 });
    await page.waitForTimeout(400);
  });
}

await browser.close();
