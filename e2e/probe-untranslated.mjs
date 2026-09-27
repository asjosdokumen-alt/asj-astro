/**
 * probe-untranslated.mjs — temukan teks yang TIDAK PERNAH diterjemahkan.
 *
 * Mekanisme situs ini: teks ber-atribut `data-lang="key"` ditulis ulang oleh
 * `translateDataLang()` saat bahasa berganti. Teks TANPA atribut itu tidak
 * pernah tersentuh — jadi ia tetap berbahasa sumber selamanya, dan tidak ada
 * gate berbasis-key yang bisa melihatnya (tidak ada key untuk dicari).
 *
 * Metode: muat tiap rute DUA KALI (id lalu jp), kumpulkan tiap text node yang
 * terlihat dalam urutan dokumen, lalu laporkan yang teksnya TIDAK BERUBAH.
 * Yang tersisa adalah identifier asli atau string yang lupa diterjemahkan —
 * manusia bisa membedakannya sekilas.
 *
 * Jalankan: BASE_URL=http://127.0.0.1:4400 node e2e/probe-untranslated.mjs
 *
 * PENTING: pakai CSS hasil BUILD (dist/), bukan `npm run dev` — dev server repo
 * ini menyajikan bundle basi dari dist/, sehingga probe mengukur kode lama.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4400";

// Deliberately includes the two routes that have NO titleKey until
// e2e/probe-untranslated.mjs and i18n.keys.test.ts were written (/share and
// /master). A probe that only visits the pages someone remembered to list would
// have reported a clean sweep while two titles were still untranslated.
const ROUTES = ["/", "/loker", "/public", "/apply", "/ai-cv", "/siswa-baru", "/404", "/share", "/master"];

// Filter LONGAR di probe (output harus terbaca); keputusan ketatnya di triase.
// Angka, tanda baca, dan lambang memang sama di kedua bahasa.
const NEUTRAL =
  /^[\s\d.,:;%+\-/()·—–…'"「」【】、。！？〜～※×=<>|]*$/;

const COLLECT = `(() => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const t = n.nodeValue.replace(/\\s+/g, ' ').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el) continue;
    if (el.closest('script, style, svg, noscript')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // Simpan jalur leluhur ber-atribut data-lang supaya bisa tahu apakah teks
    // ini TERIKAT ke key atau tidak.
    const boundEl = el.closest('[data-lang], [data-lang-title], [data-lang-placeholder], [data-lang-aria]');
    out.push({
      t,
      tag: el.tagName.toLowerCase(),
      bound: !!boundEl,
      key: boundEl ? (boundEl.getAttribute('data-lang') || boundEl.getAttribute('data-lang-title') || boundEl.getAttribute('data-lang-placeholder') || boundEl.getAttribute('data-lang-aria')) : null,
      cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 70) : '',
    });
  }
  return out;
})()`;

const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
let totalUnbound = 0;
let totalRuns = 0;
const problems = [];

try {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const read = async (lang) => {
      const page = await ctx.newPage();
      // Set bahasa SEBELUM load, supaya paint pertama sudah benar.
      await page.addInitScript((l) => {
        try {
          window.localStorage.setItem("asj_lang", JSON.stringify(l));
        } catch {}
      }, lang);
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: "load" });
      // Assert status SEBELUM membaca DOM: navigasi yang gagal akan mengukur
      // halaman error dan melaporkan badan kosongnya sebagai "tak ada yang
      // perlu diterjemahkan".
      if (resp?.status() !== 200) {
        throw new Error(`${route} -> HTTP ${resp?.status()}`);
      }
      await page.waitForTimeout(700); // biarkan chunk jp termuat + translateDataLang jalan
      const nodes = await page.evaluate(COLLECT);
      const title = await page.title();
      const htmlLang = await page.evaluate(() => document.documentElement.lang);
      await page.close();
      return { nodes, title, htmlLang };
    };

    const id = await read("id");
    const jp = await read("jp");

    console.log(`\n############ ${route} ############`);
    console.log(`  id: ${id.nodes.length} text node, <html lang="${id.htmlLang}">, title="${id.title}"`);
    console.log(`  jp: ${jp.nodes.length} text node, <html lang="${jp.htmlLang}">, title="${jp.title}"`);

    // Bahasa harus benar-benar berganti — kalau tidak, seluruh probe ini
    // membandingkan halaman yang sama dan melaporkan semuanya "tak berubah".
    if (id.htmlLang === jp.htmlLang) {
      console.log(`  !!! PERINGATAN: <html lang> tidak berubah (${id.htmlLang}) — bahasa mungkin tidak berganti`);
    }
    if (id.title === jp.title) {
      console.log(`  [title] TIDAK BERUBAH: "${id.title}"`);
      problems.push({ route, kind: "title", text: id.title });
    }
    if (id.nodes.length !== jp.nodes.length) {
      console.log(`  !!! jumlah node BEDA (${id.nodes.length} vs ${jp.nodes.length}) — penyelarasan per-indeks tidak valid, lewati rute ini`);
      continue;
    }

    const unchanged = [];
    for (let i = 0; i < id.nodes.length; i++) {
      const a = id.nodes[i];
      const b = jp.nodes[i];
      if (a.t === b.t && !NEUTRAL.test(a.t) && a.t.length > 2) {
        unchanged.push(a);
      }
    }

    totalRuns += id.nodes.length;
    const unbound = unchanged.filter((u) => !u.bound);
    totalUnbound += unbound.length;

    console.log(`  teks tak berubah: ${unchanged.length}  (terikat ke key: ${unchanged.length - unbound.length}, TIDAK terikat: ${unbound.length})`);
    for (const u of unbound) {
      console.log(`    UNBOUND <${u.tag}> "${u.t}"   [${u.cls}]`);
      problems.push({ route, kind: "text", text: u.t, el: `${u.tag}.${u.cls}` });
    }
  }

  console.log(`\n================ RINGKASAN ================`);
  console.log(`text run diperiksa : ${totalRuns}`);
  console.log(`tak berubah & TIDAK terikat : ${totalUnbound}`);
  console.log(`judul halaman tak mengikuti toggle : ${problems.filter((p) => p.kind === "title").length}`);
  if (totalRuns === 0) {
    console.log(">>> GAGAL: extractor membaca 0 text run — setiap penilaian di bawah hampa");
    process.exit(1);
  }
} finally {
  await browser.close();
}
