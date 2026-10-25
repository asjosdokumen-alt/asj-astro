/**
 * test-print-mensetsu.mjs — what "Cetak / PDF" actually puts on paper.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `MensetsuForm` is rendered on TWO routes: the public `/wawancara` page and an
 * admin overlay inside `TabPelamar`. Its print rules lived in
 * `wawancara.astro`'s `<style is:global>` — i.e. on ONE of the two. So pressing
 * "Cetak / PDF" from the admin panel printed the ENTIRE admin shell: sidebar,
 * candidate table and the chat panel, with the question sheet at the bottom
 * (reported by the owner 2026-10-25, with a print preview showing exactly
 * that).
 *
 * No gate in the repo could see it. Every other one reads the SCREEN, and this
 * defect only exists in print media — a page can be perfect on screen and
 * still print the wrong document.
 *
 * WHAT IT MEASURES (in print media, in a real browser, on a real build)
 * --------------------------------------------------------------------
 *   1. no visible box survives outside the sheet's subtree;
 *   2. no ANCESTOR of the sheet is `position: fixed` — Chrome prints a fixed
 *      box on the first page only and clips it there, so a three-page sheet
 *      would silently lose pages 2-3;
 *   3. the answers themselves are on the sheet. `<textarea rows={2}>` is
 *      clipped when printed (Chrome does not scroll a form control onto
 *      paper), which is why the sheet carries a text copy of the three lines.
 *
 * HOW THIS GUARD COULD LIE
 * ------------------------
 * 1. PASSING VACUOUSLY. Without the session fixture both routes render a login
 *    gate, the sheet never mounts, and a sweep over an empty page reports a
 *    clean sheet. So the fixture is asserted FIRST (a row, then the sheet).
 * 2. A SWEEP THAT CANNOT FAIL. A visible box is planted OUTSIDE the sheet and
 *    the sweep must report it before any verdict is read. Without that, a
 *    sweep whose selector silently stopped matching reads as "all clean".
 *
 * THE FIXTURE IS NOT A CHEAT
 * --------------------------
 * Both routes gate on the CLIENT store (`AuthGuard` reads `asj_auth`;
 * `MensetsuForm` reads the same store), and both need a `/.netlify/functions/*`
 * payload that a static preview server cannot answer. Every assertion below is
 * about the DOM the real component renders; nothing here claims anything about
 * the backend.
 *
 * Run against a built artifact:
 *   BASE_URL=http://127.0.0.1:4321 node e2e/test-print-mensetsu.mjs
 */
import { chromium } from 'playwright';
import { ensureServer, stopServer } from './lib/server.mjs';

const BASE = await ensureServer().catch((err) => {
  console.error(`ABORT: ${err.message}`);
  process.exit(2);
});

/** Answers the sheet must reproduce verbatim — see check 3. */
const ANSWER_JP = 'ジョンです。';
const ANSWER_ARTI = 'Saya John.';

/**
 * `getBankWawancara` answers with the shape the component reads: `tahap` is the
 * ordered list of stages, `soal` the flat bank, and `jawabanku` what the
 * candidate already saved (that is what the print copy must show).
 */
const BANK = {
  success: true,
  wa: '081234567890',
  jumlah: 3,
  tahap: ['Pertanyaan & Pemahaman Diri', 'Keinginan & Life Sebabnya'],
  soal: [
    {
      kode: 'W01',
      tahap: 'Pertanyaan & Pemahaman Diri',
      urutan: 1,
      jp: 'お名前は何ですか。',
      romaji: 'onamae wa nan desu ka.',
      arti: 'Siapa nama Anda?',
      jawaban_jp: '私はジョンです。',
      jawaban_romaji: 'watashi wa jon desu.',
      jawaban_arti: 'Saya John.',
      kolom_cv: null,
      sinkron_cv: false,
      jawabanku: { jp: ANSWER_JP, romaji: 'jon desu.', arti: ANSWER_ARTI },
    },
    {
      kode: 'W02',
      tahap: 'Pertanyaan & Pemahaman Diri',
      urutan: 2,
      jp: 'お国はどちらですか。',
      romaji: 'okuni wa dochira desu ka.',
      arti: 'Dari negara mana Anda?',
      jawaban_jp: null,
      jawaban_romaji: null,
      jawaban_arti: null,
      kolom_cv: null,
      sinkron_cv: false,
      jawabanku: { jp: '', romaji: '', arti: '' },
    },
    {
      kode: 'W03',
      tahap: 'Keinginan & Life Sebabnya',
      urutan: 1,
      jp: 'どうして日本へ行きたいですか。',
      romaji: 'doushite nihon e ikitai desu ka.',
      arti: 'Kenapa Anda ingin ke Jepang?',
      jawaban_jp: null,
      jawaban_romaji: null,
      jawaban_arti: null,
      kolom_cv: null,
      sinkron_cv: false,
      jawabanku: { jp: '', romaji: '', arti: '' },
    },
  ],
};

/** One candidate row, so `/admin#pelamar` renders a row carrying the trigger. */
const ADMIN_CANDIDATE = {
  nama: 'Aria Uji',
  wa: '081234567890',
  idLoker: 'TG591ASJ',
  idKandidat: 'ASJ-001',
  tahapan: 'PEMBERKASAN',
  status: 'LULUS',
  kategori: 'NOUGYOU SAYURAN',
  berkas: {},
  bio: {},
};

/** Fabricated session — both surfaces gate on the STORE, not the backend. */
function authFor(role) {
  return JSON.stringify({
    sessionToken: `print-fake-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    role,
    wa: '081234567890',
    name: 'Aria Check',
    lastChecked: Date.now(),
  });
}

/**
 * Every visible box that is NOT the sheet, NOT inside it, and NOT an ancestor
 * of it. Ancestors are exempt because hiding one would take the sheet with it;
 * they are constrained by check 2 instead.
 */
const sweepOutsideSheet = () => {
  const sheet = document.querySelector('[data-cetak]');
  if (!sheet) return { found: false };
  const keep = (el) => el === sheet || sheet.contains(el) || el.contains(sheet);
  const offenders = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (keep(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cls = String(el.className || '').trim().split(/\s+/).slice(0, 2).join('.');
    offenders.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`);
  }
  return { found: true, count: offenders.length, sample: offenders.slice(0, 8) };
};

/** The first `position: fixed` ancestor, or '' when the chain is clean. */
const fixedAncestorOfSheet = () => {
  const sheet = document.querySelector('[data-cetak]');
  if (!sheet) return 'no-sheet';
  let el = sheet.parentElement;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky') {
      const cls = String(el.className || '').trim().split(/\s+/)[0];
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} (${cs.position})`;
    }
    el = el.parentElement;
  }
  return '';
};

let measured = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    measured++;
    console.log(`✅ ${name}`);
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failures.push(name);
  }
}

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/** Open a route with a fabricated session and locally-fulfilled functions. */
async function open({ role, path, ready }) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: BASE,
          localStorage: [{ name: 'asj_auth', value: authFor(role) }],
        },
      ],
    },
  });
  const page = await ctx.newPage();
  /* `window.print` diganti: dialog cetak tidak ada di headless, dan yang perlu
     diukur justru DOM PADA SAAT print dipanggil — di situlah lembar 13 tahap
     dibangun, lalu dikembalikan lagi. Tanpa stub ini tidak ada cara melihatnya. */
  await page.addInitScript(() => {
    window.__cetak = { calls: 0, tahap: 0, baris: 0, judul: '' };
    window.print = () => {
      window.__cetak.calls += 1;
      window.__cetak.tahap = document.querySelectorAll('[data-cetak] .cetak-tahap').length;
      window.__cetak.baris = document.querySelectorAll('[data-cetak] ul > li:not(.cetak-tahap)').length;
      const h = document.querySelector('[data-cetak] .cetak-saja h2');
      window.__cetak.judul = h ? h.textContent.trim() : '';
    };
  });
  await page.route('**/.netlify/functions/**', (route) => {
    let action = '';
    try {
      action = JSON.parse(route.request().postData() || '{}').action || '';
    } catch {
      /* a non-JSON body is not one of ours — answer with the benign shape */
    }
    let body = { success: true };
    if (action === 'getBankWawancara') body = BANK;
    else if (action === 'getCandidatesPage') {
      body = { success: true, total: 1, candidates: [ADMIN_CANDIDATE] };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const status = resp ? resp.status() : 0;
  if (status !== 200) {
    await ctx.close();
    throw new Error(`GET ${path} -> HTTP ${status}; refusing to read the DOM of an error page`);
  }
  await page.waitForSelector(ready, { timeout: 20000 });
  return { ctx, page };
}

/** The three checks that must hold on ANY surface hosting the sheet. */
async function assertPrintSheet(page, label) {
  /* POSITIVE CONTROL, measured in SCREEN media ON PURPOSE. Under print media
     the very CSS under test hides anything planted outside the sheet, so a
     probe there is invisible by design and would prove nothing. On screen the
     probe is plain visible content, and the sweep must report it. */
  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'probe-outside-sheet';
    probe.style.cssText = 'width:60px;height:40px';
    probe.textContent = 'probe';
    document.body.insertBefore(probe, document.body.firstChild);
  });
  const control = await page.evaluate(sweepOutsideSheet);
  await page.evaluate(() => document.getElementById('probe-outside-sheet')?.remove());

  if (!control.found) throw new Error(`${label}: the sheet is not in the DOM — every check below would be vacuous`);
  if (!control.sample.some((s) => s.includes('probe-outside-sheet'))) {
    throw new Error(
      `${label}: the sweep did not report a planted box outside the sheet — it cannot fail ` +
        `(sample: ${control.sample.join(', ')})`,
    );
  }

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(150);

  const sweep = await page.evaluate(sweepOutsideSheet);
  if (sweep.count > 0) {
    throw new Error(
      `${label}: ${sweep.count} box(es) outside the sheet are still visible in print ` +
        `(${sweep.sample.join(', ')}) — the printed page would carry them`,
    );
  }

  const fixed = await page.evaluate(fixedAncestorOfSheet);
  if (fixed) {
    throw new Error(
      `${label}: the sheet sits inside a ${fixed} ancestor — Chrome prints that on page 1 only, ` +
        'so every page after the first would be lost',
    );
  }

  const geom = await page.evaluate(() => {
    const sheet = document.querySelector('[data-cetak]');
    const r = sheet.getBoundingClientRect();
    const chat = document.querySelector('.cetak-sembunyi');
    return {
      width: Math.round(r.width),
      sheetDisplay: getComputedStyle(sheet).display,
      chatDisplay: chat ? getComputedStyle(chat).display : 'absent',
      rows: sheet.querySelectorAll('li').length,
    };
  });
  if (geom.sheetDisplay === 'none') throw new Error(`${label}: the sheet itself is display:none in print`);
  if (geom.rows === 0) throw new Error(`${label}: the sheet rendered zero questions`);
  if (geom.chatDisplay !== 'none') {
    throw new Error(`${label}: the chat panel is still ${geom.chatDisplay} in print`);
  }
  if (geom.width < 600) {
    throw new Error(`${label}: the sheet is only ${geom.width}px wide on paper — it is still inside a column`);
  }

  const answers = await page.evaluate(() =>
    [...document.querySelectorAll('[data-cetak] .cetak-nilai')].map((e) => e.textContent.trim()),
  );
  if (!answers.includes(ANSWER_JP) || !answers.includes(ANSWER_ARTI)) {
    throw new Error(
      `${label}: the printed sheet does not carry the saved answers ` +
        `(got ${JSON.stringify(answers.slice(0, 4))}) — a <textarea> would have clipped them`,
    );
  }
  console.log(
    `     ↳ sheet ${geom.width}px · ${geom.rows} soal · chat ${geom.chatDisplay} · answers ${answers.length}`,
  );
  await page.emulateMedia({ media: 'screen' });
}

/* ── 1. Halaman publik: DITUTUP (2026-10-25) ───────────────────────────────
   Pemilik memutuskan latihan wawancara dipakai internal dulu, jadi `/wawancara`
   berhenti di kartu pemberitahuan: tidak ada lembar soal, tidak ada gerbang
   login. Penjaganya yang sebenarnya `requireAdmin` di surfaces/ai.ts — test ini
   menjaga PERILAKU YANG TERLIHAT, dan kalau kartunya hilang tanpa sengaja
   (mis. guard dihapus saat fitur dibuka lagi) hasilnya ketahuan di sini. */
await test('/wawancara: ditutup untuk publik — kartu, bukan lembar soal', async () => {
  const { ctx, page } = await open({
    role: 'kandidat',
    path: '/wawancara?wa=081234567890',
    ready: '[data-testid="mensetsu-tutup"]',
  });
  try {
    const bentuk = await page.evaluate(() => ({
      kartu: !!document.querySelector('[data-testid="mensetsu-tutup"]'),
      lembar: document.querySelectorAll('[data-cetak]').length,
      gerbang: !!document.querySelector('input[type="password"]'),
    }));
    if (!bentuk.kartu) throw new Error('kartu "belum dibuka" tidak muncul');
    if (bentuk.lembar > 0) throw new Error('lembar soal masih dirender untuk publik');
    if (bentuk.gerbang) throw new Error('gerbang login masih muncul padahal fiturnya ditutup');
  } finally {
    await ctx.close();
  }
});

/* ── 2. The admin overlay — the surface the owner reported ──────────────── */
await test('/admin overlay: print media shows only the question sheet', async () => {
  const { ctx, page } = await open({ role: 'admin', path: '/admin#pelamar', ready: 'table tbody tr' });

  try {
    /* The trigger is the row button; its label comes from `admin.btn_wawancara`.
       `:visible` is load-bearing — `TabPelamar` renders the action twice (the
       mobile card and the desktop table row, commit `8b7effc`) and the first
       match in DOM order is the one hidden at this width. */
    const trigger = page.locator('button[title="Wawancara"]:visible, button[title="面接練習"]:visible').first();
    if ((await trigger.count()) === 0) {
      throw new Error('no Wawancara button on the candidate row — the fixture did not render a row');
    }
    await trigger.click();
    await page.waitForSelector('[data-cetak] li', { timeout: 20000 });

    const overlayFixed = await page.evaluate(() => {
      const sheet = document.querySelector('[data-cetak]');
      const shell = sheet.closest('.u-modal-shell');
      return shell ? getComputedStyle(shell).position : 'no-shell';
    });
    console.log(`     ↳ overlay position on screen: ${overlayFixed}`);

    await assertPrintSheet(page, '/admin');
  } finally {
    await ctx.close();
  }
});

/* ── 3. "Cetak semua tahap" — 13 tahap, satu PDF ──────────────────────────
   The owner's ask (2026-10-25): "yang tercetak cuma 1 bagian saja, gak bisa
   semua 1-13 jadi 1 PDF?" The sheet only ever rendered the ACTIVE stage, so
   the button could not print the rest of the bank no matter what it was
   labelled. This measures the DOM at the instant print is called — the state
   is reverted immediately afterwards, so nothing else can observe it. */
await test('/admin overlay: "Cetak semua tahap" menaruh SELURUH tahap di lembar', async () => {
  const { ctx, page } = await open({ role: 'admin', path: '/admin#pelamar', ready: 'table tbody tr' });

  try {
    await page.locator('button[title="Wawancara"]:visible, button[title="面接練習"]:visible').first().click();
    await page.waitForSelector('[data-cetak] li', { timeout: 20000 });

    const tombolTahap = page.locator('[data-cetak-aksi="tahap"]');
    const tombolSemua = page.locator('[data-cetak-aksi="semua"]');
    if ((await tombolTahap.count()) === 0 || (await tombolSemua.count()) === 0) {
      throw new Error('tombol cetak tidak dirender — panel tidak siap, pemeriksaan di bawah akan kosong');
    }

    await tombolTahap.click();
    await page.waitForFunction(() => window.__cetak.calls === 1, { timeout: 5000 });
    const satu = await page.evaluate(() => ({ ...window.__cetak }));

    await tombolSemua.click();
    await page.waitForFunction(() => window.__cetak.calls === 2, { timeout: 5000 });
    const semua = await page.evaluate(() => ({ ...window.__cetak }));

    /* Fixture: 3 soal dalam 2 tahap (2 di tahap 1, 1 di tahap 2). */
    if (satu.tahap !== 0 || satu.baris !== 2) {
      throw new Error(
        `"Cetak tahap ini" mencetak ${satu.baris} baris / ${satu.tahap} judul tahap, ` +
          'padahal seharusnya hanya 2 soal tahap aktif tanpa judul kelompok',
      );
    }
    if (semua.tahap !== 2 || semua.baris !== 3) {
      throw new Error(
        `"Cetak semua tahap" mencetak ${semua.baris} baris / ${semua.tahap} judul tahap, ` +
          'padahal seharusnya 3 soal dari 2 tahap — sisa bank tidak ikut ke lembar',
      );
    }
    if (!semua.judul) {
      throw new Error('kepala lembar kosong saat mencetak semua tahap');
    }
    console.log(`     ↳ tahap ini: ${satu.baris} baris · semua: ${semua.baris} baris / ${semua.tahap} tahap · "${semua.judul}"`);

    /* Kembali ke tampilan normal: kalau tidak, panel tertinggal menampilkan
       seluruh bank dan tombol tahap tidak lagi berfungsi seperti semestinya. */
    await page.waitForFunction(() => document.querySelectorAll('[data-cetak] .cetak-tahap').length === 0, {
      timeout: 5000,
    });
  } finally {
    await ctx.close();
  }
});

await browser.close();
await stopServer();

console.log('');
console.log(`checks passed: ${measured} · failed: ${failures.length}`);
if (failures.length) {
  console.log('failed:', failures.join(' | '));
  process.exit(1);
}
process.exit(0);
