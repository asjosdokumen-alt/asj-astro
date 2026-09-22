/**
 * Measure the tap target of each mini job row, at phone width.
 *
 * "It looks big enough" is not evidence, and a 44px floor is a real
 * requirement — not for taste, but because a row that is 36px tall produces
 * mis-taps, and the whole row is a link precisely so the target is generous.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:4321/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loker-ringkas li a', { timeout: 30_000 });
await page.waitForTimeout(1500);

const rows = await page.evaluate(() => {
  const list = document.querySelectorAll('#loker-ringkas li a');
  return [...list].map((a) => {
    const r = a.getBoundingClientRect();
    return {
      label: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      h: Math.round(r.height),
      w: Math.round(r.width),
    };
  });
});

const all = await page.evaluate(() => {
  // The trailing "see all" link is NOT an <li> child — the previous selector
  // used `:last-of-type` on `a`, which matched the last ROW link instead. The
  // summary then reported a job row's height under the label "see all", which
  // is worse than reporting nothing: it looked like a working measurement.
  const links = [...document.querySelectorAll('#loker-ringkas a')];
  const tail = links.find((a) => !a.closest('li'));
  if (!tail) return null;
  const r = tail.getBoundingClientRect();
  return { h: Math.round(r.height), text: (tail.textContent || '').trim() };
});

console.log('mini job rows at 390px:');
for (const r of rows) {
  console.log(`  ${String(r.h).padStart(4)}px tall × ${r.w}px  ${r.h >= 44 ? 'OK ' : 'SMALL'}  ${r.label}`);
}
const smallest = Math.min(...rows.map((r) => r.h));
console.log(`\nsmallest row: ${smallest}px  (44px floor → ${smallest >= 44 ? 'PASS' : 'FAIL'})`);
if (all) console.log(`"see all" link: ${all.h}px tall — ${all.text}`);

await browser.close();
