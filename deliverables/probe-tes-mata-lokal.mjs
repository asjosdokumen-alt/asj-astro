// Lihat /tes-mata di server lokal (dist/ terbaru) — memastikan halamannya hidup
// dan plate barunya benar-benar tergambar.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const err = [];
page.on('pageerror', (e) => err.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') err.push(m.text()); });

await page.goto('http://localhost:4321/tes-mata', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: 'F:/tmp/tes-mata-lokal.png', fullPage: true });
const judul = await page.title();
const teks = (await page.locator('body').innerText()).slice(0, 400).replace(/\n+/g, ' | ');
const kanvas = await page.locator('canvas').count();
console.log('title:', judul);
console.log('canvas:', kanvas);
console.log('teks:', teks);
console.log('error:', err.length ? err.slice(0, 3).join(' || ') : 'tidak ada');
await browser.close();
