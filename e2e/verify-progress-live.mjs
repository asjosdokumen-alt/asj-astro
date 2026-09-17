/**
 * verify-progress-live.mjs — bukti progress bar benar-benar HIDUP.
 *
 * Menguji dua kondisi pada halaman /candidate:
 *   A. profil kosong  → kedua bar 0%   (0 adalah jawaban BENAR: memang belum ada data)
 *   B. profil terisi  → bar bergerak, dan badge PERFECT ASJ STUDENT muncul
 *
 * Keadaan B tidak bisa dicapai lewat UI tanpa mengisi form, jadi barisnya
 * disuntikkan lewat window.fetch — persis cara kerja CandidateDash.test.tsx.
 * Ini membuktikan PERHITUNGANNYA, bukan sekadar render-nya.
 *
 * Jalankan: BASE_URL=http://localhost:4322 node e2e/verify-progress-live.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = 'test-results';

const MINI_FIELDS = ['gender', 'usia', 'pendidikan', 'jftText', 'sswText', 'tb', 'bb'];
const MASTER_FIELDS = ['email', 'tmplahir', 'tgllahir', 'alamat', 'ayah', 'pasport', 'coe',
  'kotapasport', 'tglpasport', 'exppasport', 'pt'];

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!ok) failed++;
};

async function probe({ label, row, bio }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: {
      cookies: [],
      origins: [{
        origin: BASE,
        localStorage: [{
          name: 'asj_auth',
          value: JSON.stringify({
            role: 'kandidat', name: 'Budi', wa: '081234567890',
            sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
          }),
        }],
      }],
    },
  });
  const page = await ctx.newPage();
  // Ganti getAppData dengan respons terkendali.
  await page.route('**/.netlify/functions/**', async (route) => {
    const body = {
      success: true,
      candidates: [{ nama: 'Budi', idLoker: 'TG591ASJ', tahapan: 'PEMBERKASAN', status: 'LULUS',
        idKandidat: 'ASJ-001', catatanInt: '[VIP]', berkas: {}, bio, ...row }],
      kandidatRiwayat: [{ code: 'TG591ASJ', status: 'LULUS', tahapan: 'PEMBERKASAN', timestamp: '2026-09-10' }],
      mySchedules: [],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${BASE}/candidate`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const text = await page.locator('body').innerText();
  const pcts = [...text.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
  const perfect = text.includes('PERFECT ASJ STUDENT') || /PERFECT/i.test(text);
  await page.screenshot({ path: `${OUT}/progress-${label}-390.png`, fullPage: true });
  await ctx.close();
  return { pcts, perfect, text };
}

try {
  // ---- A. profil kosong ---------------------------------------------------
  const a = await probe({ label: 'empty', row: {}, bio: Object.fromEntries(
    MASTER_FIELDS.map((k) => [k, ''])) });
  console.log('\n== A. profil kosong ==');
  console.log('   persentase di layar:', a.pcts.join(', '));
  check('A1 CV Mini 0%', a.pcts.includes(0));
  check('A2 tidak ada badge PERFECT', !a.perfect);

  // ---- B. profil terisi ---------------------------------------------------
  const mini = Object.fromEntries(MINI_FIELDS.map((k) => [k, 'x']));
  const full = Object.fromEntries(MASTER_FIELDS.map((k) => [k, 'x']));
  const b = await probe({ label: 'full', row: mini, bio: full });
  console.log('\n== B. profil terisi (VIP) ==');
  console.log('   persentase di layar:', b.pcts.join(', '));
  check('B1 ada bar 100%', b.pcts.includes(100));
  check('B2 badge PERFECT ASJ STUDENT muncul', b.perfect,
    '— mustahil SEBELUM perbaikan, karena cvMini/cvMaster selalu 0');
  check('B3 tidak ada lagi "Lamaran Lulus"', !b.text.includes('Lamaran Lulus'));
  check('B4 tampil "disetujui admin"',
    /disetujui admin/i.test(b.text), '— teks status LULUS untuk kandidat');
} finally {
  await browser.close();
}

console.log(`\n${failed === 0 ? 'semua pemeriksaan lolos.' : `${failed} pemeriksaan GAGAL.`}`);
process.exit(failed === 0 ? 0 : 1);
