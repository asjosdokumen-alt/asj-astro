/**
 * probe-shot.mjs — tangkapan layar satu rute pada lebar ponsel.
 *
 * KENAPA ADA
 * ----------
 * Beberapa keputusan di repo ini adalah keputusan TAMPILAN (apakah sebuah foto
 * layak dibayar 300 KB, apakah skeleton lebih baik daripada kosong), dan
 * keputusan itu tidak bisa diambil dari angka byte. Probe ini hanya mengambil
 * bukti yang bisa dilihat: satu PNG, lebar 390, tinggi penuh.
 *
 * Pakai:
 *   ROUTE=apply OUT=deliverables/shot-apply-390.png node deliverables/probe-shot.mjs
 */
import { chromium } from '../node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4400';
const ROUTE = `/${(process.env.ROUTE || '').replace(/^\/+/, '')}`;
const OUT = process.env.OUT || `deliverables/shot-${ROUTE.replace(/\W+/g, '_') || 'root'}-390.png`;
const FULL = process.env.FULL !== '0';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.screenshot({ path: OUT, fullPage: FULL });
console.log(`saved ${OUT}`);

await browser.close();
