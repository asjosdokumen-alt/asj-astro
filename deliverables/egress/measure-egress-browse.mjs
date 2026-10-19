/**
 * egress-probe-more.mjs — cost of a visitor who actually browses the job board.
 *
 * The first screen only shows 10 rows. A job seeker clicks "Muat Lebih Banyak"
 * several times; every click mounts 10 more rows, and each row with a poster
 * fetches it from wherever it is stored. This measures THAT, by host.
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const url = process.argv[2] || 'https://asjastro.netlify.app/loker';
const clicks = Number(process.argv[3] || 5);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const rows = [];
page.on('response', async (res) => {
  try {
    const req = res.request();
    const s = await req.sizes();
    rows.push({ url: res.url(), type: req.resourceType(), bytes: (s.responseBodySize || 0) + (s.responseHeadersSize || 0) });
  } catch {}
});

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1500);

for (let i = 0; i < clicks; i++) {
  const btn = page.locator('button:has-text("Muat Lebih Banyak")').last();
  if (!(await btn.count())) { console.log('no more button at click ' + i); break; }
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click().catch((e) => console.log('click failed:', String(e.message).slice(0, 80)));
  await page.waitForTimeout(1200);
  for (let k = 0; k < 8; k++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(250);
  }
  const n = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  console.log('after click ' + (i + 1) + ': rows=' + n);
}

await page.waitForTimeout(2500);
const by = new Map();
for (const r of rows) {
  const h = (() => { try { return new URL(r.url).host; } catch { return '(inline)'; } })();
  by.set(h, (by.get(h) || 0) + r.bytes);
}
const total = rows.reduce((a, r) => a + r.bytes, 0);
console.log('\n=== ' + url + ' after ' + clicks + ' "more" clicks ===');
console.log('requests ' + rows.length + '  total ' + (total / 1024).toFixed(1) + ' KB');
for (const [h, b] of [...by.entries()].sort((a, b) => b[1] - a[1])) {
  console.log('  ' + (b / 1024).toFixed(1).padStart(9) + ' KB  ' + h);
}
const st = rows.filter((r) => r.url.includes('/storage/v1/object/'));
console.log('  supabase storage: ' + st.length + ' req, ' + (st.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(1) + ' KB');
console.log('  supabase storage sample:');
for (const r of st.slice(0, 8)) console.log('    ' + (r.bytes / 1024).toFixed(1).padStart(7) + ' KB  ' + r.url.slice(-70));
await browser.close();
