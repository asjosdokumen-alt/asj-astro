import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4321/arcade', { waitUntil: 'networkidle' });
await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), {
  role: 'kandidat', name: 'Budi', wa: '0812', sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('button:has-text("Mulai Shift")');
await page.waitForSelector('[data-testid="arcade-perintah"]');
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const baris = [...document.querySelectorAll('.arc-crate')].map((el) => {
    const band = el.querySelector('.arc-crate-band');
    const bs = band ? getComputedStyle(band) : null;
    return {
      label: el.querySelector('.arc-crate-jp')?.textContent?.trim(),
      bandCls: band?.className,
      bg: bs?.backgroundColor,
      border: bs?.borderTopColor,
    };
  });
  const head = document.querySelector('.arc-order-head');
  const btn = head?.querySelector('button');
  return {
    baris,
    headW: Math.round(head?.getBoundingClientRect().width ?? 0),
    headH: Math.round(head?.getBoundingClientRect().height ?? 0),
    btnTop: Math.round(btn?.getBoundingClientRect().top ?? 0),
    kickerTop: Math.round(head?.firstElementChild?.getBoundingClientRect().top ?? 0),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
