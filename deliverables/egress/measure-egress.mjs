/**
 * egress-probe.mjs — measure what ONE cold visit actually downloads, by host.
 *
 * Why: "egress exceeded" is a claim about BYTES LEAVING Supabase. Anything else
 * (bundle size, image count) is a proxy. This counts real responses.
 *
 * Usage:  node F:/tmp/egress-probe.mjs <url> [<url> ...]
 * Output: per-host totals + top 15 largest responses.
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error('usage: node egress-probe.mjs <url> [...]');
  process.exit(2);
}

function hostOf(u) {
  try { return new URL(u).host; } catch { return '(inline)'; }
}

const browser = await chromium.launch();
for (const url of urls) {
  // A fresh context = cold cache = what a first-time visitor costs.
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.VW||390), height: Number(process.env.VH||900) } });
  const page = await ctx.newPage();
  const rows = [];

  page.on('response', async (res) => {
    try {
      const req = res.request();
      const sizes = await req.sizes();
      rows.push({
        url: res.url(),
        status: res.status(),
        type: req.resourceType(),
        bytes: (sizes.responseBodySize || 0) + (sizes.responseHeadersSize || 0),
        body: sizes.responseBodySize || 0,
      });
    } catch { /* response gone */ }
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  } catch (e) {
    console.log('  goto warn:', String(e.message).slice(0, 120));
  }
  // Lazy images only fetch once they are near the viewport; walk the page so the
  // number is "what a visitor who scrolls sees", not "what a bot sees".
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);

  const byHost = new Map();
  for (const r of rows) {
    const h = hostOf(r.url);
    byHost.set(h, (byHost.get(h) || 0) + r.bytes);
  }
  const total = rows.reduce((a, r) => a + r.bytes, 0);

  const storage = rows.filter((r) => /\/storage\/v1\/object\//.test(r.url));
  const rest = rows.filter((r) => /\/rest\/v1\//.test(r.url));
  const cloud = rows.filter((r) => r.url.includes('cloudinary.com'));

  console.log('\n=== ' + url + ' ===');
  console.log('requests: ' + rows.length + '   total: ' + (total / 1024).toFixed(1) + ' KB');
  for (const [h, b] of [...byHost.entries()].sort((a, b) => b[1] - a[1])) {
    console.log('  ' + (b / 1024).toFixed(1).padStart(9) + ' KB  ' + h);
  }
  console.log('  --- split ---');
  console.log('  storage/object : ' + storage.length + ' req, ' + (storage.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(1) + ' KB');
  console.log('  rest/v1        : ' + rest.length + ' req, ' + (rest.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(1) + ' KB');
  console.log('  cloudinary     : ' + cloud.length + ' req, ' + (cloud.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(1) + ' KB');

  console.log('  --- top 15 ---');
  for (const r of [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 15)) {
    console.log('  ' + (r.bytes / 1024).toFixed(1).padStart(8) + ' KB  ' + r.type.padEnd(9) + ' ' + r.url.slice(0, 110));
  }
  await ctx.close();
}
await browser.close();
