/**
 * Potret tab Combo Kalimat setelah re-skin 2026-11-10.
 * Sama seperti `_probe-arcade-2026-11-10.mjs`: di `deliverables/` supaya tidak
 * menggeser counter beku (R13f), playwright lewat URL absolut (R13n).
 */
import { chromium } from 'file:///F:/astro/node_modules/playwright/index.mjs';

const OUT = 'F:/astro/deliverables/arcade-review';
const browser = await chromium.launch();

async function potret(nama, lebar, tinggi) {
  const ctx = await browser.newContext({ viewport: { width: lebar, height: tinggi }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4321/arcade', { waitUntil: 'networkidle' });
  await page.evaluate((s) => localStorage.setItem('asj_auth', JSON.stringify(s)), {
    role: 'kandidat', name: 'Budi', wa: '0812', sessionToken: 'x', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('button:has-text("Combo Kalimat")');
  await page.waitForSelector('[data-testid="arcade-target"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/_kombo-awal-${nama}.png` });

  /* Ketuk tiga kartu pertama supaya rel terisi dan kombo naik. */
  const kata = await page.evaluate(() => [...document.querySelectorAll('.arc-kartu')].slice(0, 3).map((b) => b.textContent.trim()));
  for (const k of kata) {
    await page.locator('.arc-kartu', { hasText: k }).first().click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/_kombo-jalan-${nama}.png` });

  const ukur = await page.evaluate(() => {
    const de = document.documentElement;
    const kartu = [...document.querySelectorAll('.arc-kartu')];
    const rel = document.querySelector('.arc-rel');
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      arenaLebar: Math.round(document.querySelector('.arc')?.getBoundingClientRect().width ?? 0),
      jumlahKartu: kartu.length,
      kelasKartu: [...new Set(kartu.map((k) => k.className))],
      relKata: document.querySelectorAll('.arc-rel-kata').length,
      tinggiRel: Math.round(rel?.getBoundingClientRect().height ?? 0),
      target: document.querySelector('[data-testid="arcade-target"]')?.textContent?.trim(),
    };
  });
  console.log(nama, JSON.stringify(ukur));
  await ctx.close();
}

await potret('390', 390, 844);
await potret('1280', 1280, 900);
await browser.close();
