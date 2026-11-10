// Rekam animatic menjadi video sungguhan (bukan screenshot berurutan).
// Jalankan: node deliverables/story-video/_record.mjs
// Hasil: deliverables/story-video/out/animatic-raw.webm  (encode ke mp4 oleh _encode.sh)
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const URL = 'file:///F:/astro/deliverables/story-video/index.html';
const DIR = 'F:/astro/deliverables/story-video/out';
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: DIR, size: { width: 1600, height: 900 } },
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

await page.goto(URL, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(700);

// mode rekam: panggung 1:1 tanpa bingkai hitam, HUD review disembunyikan
await page.addStyleTag({ content: '#hud,#hint{display:none!important} body{background:#020617} #stage{box-shadow:none}' });
await page.evaluate(() => {
  document.getElementById('stage').style.transform = 'scale(1)';
  window.__pause();
  window.__seek(0);
});
await page.waitForTimeout(500);

const startedAt = Date.now();
await page.evaluate(() => window.__play());
await page.waitForTimeout(80000);
await page.evaluate(() => window.__pause());
await page.waitForTimeout(300);

const video = page.video();
const path = await video.path();
console.log(JSON.stringify({ video: path, wallMs: Date.now() - startedAt, errs }));

await ctx.close();
await browser.close();
