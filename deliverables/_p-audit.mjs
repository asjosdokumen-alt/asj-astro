/**
 * Audit landing page — measured, one pass.
 * Sections: weight (gzip-served), vitals (LCP/CLS/TTFB), semantics, a11y basics,
 * responsive overflow, and the section map. Output = one JSON blob.
 *
 * Usage: BASE=http://127.0.0.1:4400 node deliverables/_p-audit.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4400';
const browser = await chromium.launch();

/* ── 1. Weight + vitals at 1440, cold cache ─────────────────────────────── */
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

const bytes = new Map();
page.on('response', async (r) => {
  try {
    const h = r.headers();
    const len = Number(h['content-length'] || 0);
    if (len) bytes.set(r.url(), { len, type: (h['content-type'] || '').split(';')[0] });
  } catch {}
});

await page.addInitScript(() => {
  window.__lcp = 0;
  window.__cls = 0;
  window.__shifts = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (!e.hadRecentInput) {
        window.__cls += e.value;
        window.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime) });
      }
    }
  }).observe({ type: 'layout-shift', buffered: true });
});

const t0 = Date.now();
await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(2500);
const nav = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource');
  const sum = (f) => Math.round(res.filter(f).reduce((a, b) => a + (b.transferSize || 0), 0));
  return {
    ttfb: Math.round(n.responseStart || 0),
    domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0),
    load: Math.round(n.loadEventEnd || 0),
    lcp: Math.round(window.__lcp),
    cls: +window.__cls.toFixed(3),
    shifts: window.__shifts,
    reqCount: res.length,
    transferImg: sum((r) => r.initiatorType === 'img' || /\.(webp|avif|png|jpg)$/.test(r.name)),
    transferScript: sum((r) => r.initiatorType === 'script'),
    transferCss: sum((r) => r.initiatorType === 'link' || /\.css$/.test(r.name)),
    transferFont: sum((r) => /\.(woff2?|ttf)$/.test(r.name)),
    transferVideo: sum((r) => /\.mp4$/.test(r.name)),
  };
});
const byType = {};
for (const [, v] of bytes) byType[v.type || '?'] = (byType[v.type || '?'] || 0) + v.len;
const heavy = [...bytes.entries()]
  .sort((a, b) => b[1].len - a[1].len)
  .slice(0, 12)
  .map(([u, v]) => ({ kb: +(v.len / 1024).toFixed(1), type: v.type, url: u.replace(BASE, '') }));

/* ── 2. Semantics + a11y basics on the same page ────────────────────────── */
const sem = await page.evaluate(() => {
  const q = (s) => [...document.querySelectorAll(s)];
  const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const sections = q('main section, main > div[id], header.hero-band').map((s) => {
    const r = s.getBoundingClientRect();
    return {
      id: s.id || '(none)',
      h: Math.round(r.height),
      heading: txt(s.querySelector('h1,h2,h3') || {}).slice(0, 70),
    };
  });
  const imgs = q('img');
  const smallText = q('main p, main li, main span, main a').filter((el) => {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    return fs < 12 && (el.textContent || '').trim().length > 3;
  }).length;
  return {
    title: document.title,
    lang: document.documentElement.lang,
    metaDescription: document.querySelector('meta[name=description]')?.content || null,
    canonical: document.querySelector('link[rel=canonical]')?.href || null,
    ogImage: document.querySelector('meta[property="og:image"]')?.content || null,
    jsonLd: q('script[type="application/ld+json"]').length,
    hreflang: q('link[rel=alternate][hreflang]').map((l) => l.hreflang),
    h1: q('h1').map(txt),
    h2Count: q('h2').length,
    h3Count: q('h3').length,
    landmarks: {
      header: q('header').length,
      nav: q('nav').length,
      main: q('main').length,
      footer: q('footer').length,
    },
    imgCount: imgs.length,
    imgNoAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
    imgEmptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length,
    imgNoDims: imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length,
    sections,
    smallTextCount: smallText,
    docHeight: document.documentElement.scrollHeight,
    fontsLoaded: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`).slice(0, 8),
  };
});

/* ── 3. Tap targets at 390 ──────────────────────────────────────────────── */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mp = await mctx.newPage();
await mp.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90000 });
const mobile = await mp.evaluate(() => {
  const q = (s) => [...document.querySelectorAll(s)];
  const small = q('a, button, [role=button], input, select, summary')
    .map((el) => {
      /* offsetWidth/Height, BUKAN getBoundingClientRect: section yang sedang
         ber-drift membawa scale(0.982), jadi rect 44 px terbaca 43,2. */
      return { w: el.offsetWidth, h: el.offsetHeight, tag: el.tagName, t: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) };
    })
    .filter((x) => x.w > 0 && x.h > 0 && (x.w < 44 || x.h < 44));
  return {
    docW: document.body.clientWidth,
    scrollW: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth - document.body.clientWidth,
    smallTargets: small.length,
    worstTargets: small.sort((a, b) => a.h - b.h).slice(0, 8),
    docHeight: document.documentElement.scrollHeight,
  };
});
await mp.screenshot({ path: 'deliverables/_audit-mobile-top.png' });
await mp.close();

/* ── 4. Overflow across widths ──────────────────────────────────────────── */
const widths = {};
for (const w of [360, 390, 768, 1024, 1280, 1440, 1920, 2560]) {
  const c = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(900);
  widths[w] = await p.evaluate(() => ({
    doc: document.body.clientWidth,
    scroll: document.documentElement.scrollWidth,
    over: document.documentElement.scrollWidth - document.body.clientWidth,
  }));
  await c.close();
}

await page.screenshot({ path: 'deliverables/_audit-desktop-top.png' });

console.log(
  JSON.stringify({ nav, byType, heavy, sem, mobile, widths, wallMs: Date.now() - t0 }, null, 1),
);

await browser.close();
