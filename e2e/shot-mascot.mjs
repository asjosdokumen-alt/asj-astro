/**
 * shot-mascot.mjs — EVIDENCE tool. Screenshots the three Aa-chan slots so the
 * placement can be looked at rather than inferred from a class name.
 *
 * Needs the static server on :4399 (see measure-mascot.mjs for why `astro
 * preview` and `file://` both lie about routes and root-relative paths).
 *
 * Run: node e2e/shot-mascot.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4399';
const OUT = 'dist/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

// ── 404 ──────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/this-page-does-not-exist`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/mascot-404-390.png` });
  await ctx.close();
}

// ── Login modal (candidate branch) ───────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  // The header's login button opens the modal; its label is translated, so the
  // click is by role and position rather than by text.
  const opened = await page.evaluate(async () => {
    const btns = [...document.querySelectorAll('button, a')];
    const hit = btns.find((b) => /login|masuk|ログイン/i.test(b.textContent || ''));
    if (!hit) return false;
    hit.click();
    await new Promise((r) => setTimeout(r, 700));
    return true;
  });
  console.log('login modal opened:', opened);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/mascot-login-390.png` });
  await ctx.close();
}

// ── Empty state (forced via the endpoint fixture) ────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route('**/.netlify/functions/get-app-data*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, jobs: [] }) }),
  );
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const box = await page.evaluate(() => {
    const img = document.querySelector('img.mascot');
    if (!img) return null;
    img.scrollIntoView({ block: 'center' });
    return true;
  });
  console.log('empty-state mascot scrolled to:', box);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/mascot-empty-390.png` });
  await ctx.close();
}

await browser.close();
console.log('shots written to', OUT);
