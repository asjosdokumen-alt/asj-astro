/**
 * Probe sekali pakai — 2026-11-11, sesi "perbaiki company profil".
 *
 * Tujuan: melihat halaman `/` apa adanya SETELAH band `#alur` jadi film, supaya
 * keputusan "bagian mana yang masih bahasa editorial" diambil dari piksel, bukan
 * dari ingatan. Menyimpan satu tangkapan per seksi ke deliverables/profil-audit/.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { ensureServer, stopServer } from '../../e2e/lib/server.mjs';

const OUT = 'deliverables/profil-audit';
mkdirSync(OUT, { recursive: true });

const IDS = [
  'kenapa-jepang',
  'layanan',
  'program',
  'visi-misi',
  'legalitas',
  'fasilitas',
  'penempatan',
  'tentang',
  'tim',
  'mitra',
  'testimoni',
  'faq',
];

const BASE = await ensureServer();
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);

  const rows = [];
  for (const id of IDS) {
    const el = await page.$(`#${id}`);
    if (!el) {
      rows.push({ id, missing: true });
      continue;
    }
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const box = await el.boundingBox();
    rows.push({ id, h: Math.round(box?.height ?? 0) });
    await page.screenshot({ path: `${OUT}/${id}.png` });
  }
  console.log(JSON.stringify(rows, null, 1));
} finally {
  await browser.close();
  await stopServer();
}
