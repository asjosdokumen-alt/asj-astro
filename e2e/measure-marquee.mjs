/**
 * measure-marquee.mjs — is the announcement strip broken, or just scrolling?
 *
 * EVIDENCE tool, not a gate. A screenshot showed the rose announcement band with
 * its text apparently sliced at the right edge, which reads as a defect. It is
 * not necessarily one: a marquee is a `overflow: hidden` window over a
 * `width: max-content` track, so the ends are ALWAYS cut at any instant. The
 * measurable questions are therefore (a) is the track wider than its window
 * (i.e. does it actually scroll) and (b) does the loop cover the full content
 * width (i.e. is the seam seamless), not "is the edge straight".
 */
import { chromium } from 'playwright';

const BASE = process.env.LANDING_URL || 'http://127.0.0.1:4321/';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const band = document.querySelector('#global-announcement');
    if (!band) return { present: false };
    const cs = getComputedStyle(band);
    const track = band.querySelector('.marquee-track');
    const content = band.querySelector('.marquee-content');
    const items = [...band.querySelectorAll('[data-marquee]')];
    const anim = content ? getComputedStyle(content).animationName : null;
    return {
      present: true,
      hiddenAttr: band.hasAttribute('hidden'),
      display: cs.display,
      trackW: track ? Math.round(track.getBoundingClientRect().width) : null,
      contentW: content ? Math.round(content.getBoundingClientRect().width) : null,
      // -50% of the content width is the loop distance; it must equal exactly
      // one copy's width for the seam to be invisible.
      items: items.map((el) => Math.round(el.getBoundingClientRect().width)),
      textLen: items[0] ? (items[0].textContent || '').trim().length : 0,
      sample: items[0] ? (items[0].textContent || '').trim().slice(0, 46) : '',
      animationName: anim,
      transform: content ? getComputedStyle(content).transform : null,
    };
  });

  if (!info.present) {
    console.log(`${width}px  no #global-announcement in the document`);
    await page.close();
    continue;
  }
  const twoCopies = info.items.length === 2;
  const seamless = twoCopies && Math.abs(info.items[0] - info.items[1]) <= 1;
  const scrolls = info.contentW !== null && info.trackW !== null && info.contentW > info.trackW;
  console.log(
    `${width}px  hidden=${info.hiddenAttr} track=${info.trackW}px content=${info.contentW}px ` +
      `copies=${info.items.length} loop=${seamless ? 'seamless (equal copies)' : 'MISMATCH'} ` +
      `anim=${info.animationName} scrolls=${scrolls} textLen=${info.textLen}`,
  );
  console.log(`        "${info.sample}"`);
  await page.close();
}
await browser.close();
