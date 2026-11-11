// Probe band #alur setelah coda ditambahkan. Bukan gate — alat ukur.
// Jalankan: node deliverables/alur-loop/probe.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'deliverables/alur-loop/shots';
mkdirSync(OUT, { recursive: true });

const URL = 'http://127.0.0.1:4321/';
const browser = await chromium.launch();

async function desktop() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/.netlify/functions/**', (r) => r.abort());
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const box = await page.evaluate(() => {
    const band = document.querySelector('[data-film]');
    const track = band.querySelector('[data-film-track]');
    const r = track.getBoundingClientRect();
    return { top: r.top + scrollY, span: track.offsetHeight - innerHeight };
  });

  const read = async (p) => {
    await page.evaluate((y) => window.scrollTo(0, y), box.top + p * box.span);
    await page.waitForTimeout(420);
    return page.evaluate(() => {
      const band = document.querySelector('[data-film]');
      const chs = [...band.querySelectorAll('[data-film-ch]')];
      const bar = band.querySelector('[data-film-progress]');
      const coord = band.querySelector('[data-film-coord]');
      const dots = [...band.querySelectorAll('[data-film-dot]')];
      return {
        bar: bar.style.width,
        coord: coord.textContent,
        on: chs.findIndex((c) => c.classList.contains('is-on')),
        opacities: chs.map((c) => Number(c.style.opacity || 1).toFixed(2)),
        dot: dots.findIndex((d) => d.classList.contains('is-on')),
        transforms: chs.map((c) => {
          const p = c.querySelector('.film-plate');
          const m = p.style.transform.match(/scale\(([\d.]+)\)/);
          return m ? m[1] : '-';
        }),
      };
    });
  };

  const rows = [];
  for (let i = 0; i <= 28; i++) rows.push(await read(i / 28));
  console.log('--- desktop, p 0..1 (29 sampel) ---');
  rows.forEach((r, i) => {
    if (i % 4 === 0 || i === 28) {
      console.log(
        `p=${(i / 28).toFixed(2)} bar=${r.bar} dot=${r.dot} on=${r.on} coord="${r.coord}" op=[${r.opacities.join(',')}]`,
      );
    }
  });

  for (let i = 0; i < 7; i++) {
    const p = (i + 0.55) / 7;
    await page.evaluate((y) => window.scrollTo(0, y), box.top + p * box.span);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/d-${i}.png` });
  }
  await page.close();
  return box;
}

async function mobile() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/.netlify/functions/**', (r) => r.abort());
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const m = await page.evaluate(() => {
    const band = document.querySelector('[data-film]');
    const chs = [...band.querySelectorAll('[data-film-ch]')];
    const hud = band.querySelector('.film-hud');
    const rail = band.querySelector('.film-rail');
    const foot = band.querySelector('.film-foot');
    const coda = band.querySelector('.film-coda');
    const copy = coda.querySelector('.film-copy');
    return {
      chapters: chs.length,
      trackH: band.querySelector('[data-film-track]').offsetHeight,
      stagePos: getComputedStyle(band.querySelector('.film-stage')).position,
      hud: getComputedStyle(hud).display,
      rail: getComputedStyle(rail).display,
      foot: getComputedStyle(foot).display,
      codaTransform: getComputedStyle(copy).transform,
      codaLeft: copy.getBoundingClientRect().left,
      codaRight: copy.getBoundingClientRect().right,
      codaOpacity: getComputedStyle(coda).opacity,
      docW: document.documentElement.clientWidth,
    };
  });
  console.log('--- mobile 390 ---');
  console.log(JSON.stringify(m, null, 1));
  await page.evaluate(() => {
    const coda = document.querySelector('.film-coda');
    coda.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/m-coda.png` });
  await page.close();
}

const box = await desktop();
console.log('--- track ---', JSON.stringify(box));
await mobile();
await browser.close();
