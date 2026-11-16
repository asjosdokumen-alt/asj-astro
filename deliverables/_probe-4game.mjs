/**
 * _probe-4game.mjs — uji keempat game di browser sungguhan.
 *
 * KENAPA ADA
 *   Tes unit membuktikan rumus; tes ini membuktikan HALAMANNYA. Yang diperiksa:
 *   Genba (DOM) bisa dimainkan, Combo bisa diketuk, Kotoba menjawab, Matematika
 *   menjawab, keempat papan peringkat terbuka, dan keempat pintu Godot berakhir
 *   `data-status="siap"`.
 *
 * KENAPA API DIPALSUKAN DI BROWSER
 *   Bank soal Kotoba/Matematika datang dari server dan butuh sesi siswa asli.
 *   Memakai sesi produksi untuk menguji halaman berarti menulis ke DB nyata.
 *   `page.route` mengganti jawaban API dengan fixture — halaman tetap menjalankan
 *   kode aslinya, tetapi tidak ada satu pun permintaan yang keluar.
 *
 * Jalankan: node deliverables/_probe-4game.mjs
 * Keluaran: deliverables/game-test-2026-11-16/ (screenshot + laporan.json)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = 'E:/astro';
const OUT = `${ROOT}/deliverables/game-test-2026-11-16`;
mkdirSync(OUT, { recursive: true });

/* Ikuti sakelar aplikasi. Kalau pintu Godot ditutup (`GODOT_AKTIF = false`),
   probe tidak boleh menuntut tombol yang memang tidak dirender — kalau tidak,
   gerbangnya merah hanya karena fitur disembunyikan dengan sengaja. */
const godotAktif =
  /GODOT_AKTIF\s*=\s*(true|false)/.exec(
    readFileSync(`${ROOT}/src/lib/fiturGodot.ts`, 'utf8'),
  )?.[1] === 'true';

const BANK_KOTOBA = {
  success: true,
  isVip: true,
  jumlah: 5,
  bab: [1],
  kosakata: [
    { b: 1, pos: 'noun', k: '私', h: 'わたし', r: 'watashi', id: 'Saya' },
    { b: 1, pos: 'noun', k: '学生', h: 'がくせい', r: 'gakusei', id: 'Pelajar' },
    { b: 1, pos: 'noun', k: '先生', h: 'せんせい', r: 'sensei', id: 'Guru' },
    { b: 1, pos: 'noun', k: '医者', h: 'いしゃ', r: 'isha', id: 'Dokter' },
    { b: 1, pos: 'noun', k: '病院', h: 'びょういん', r: 'byouin', id: 'Rumah sakit' },
  ],
};

const BANK_MATEMATIKA = {
  success: true,
  isVip: true,
  jumlah: 1,
  kategori: [
    { id: 'kraepelin', jp: '計算テスト', soal: 3, detik: 90 },
    { id: 'kabataku', jp: '基礎数学', soal: 3, detik: 240 },
    { id: 'deret', jp: '数列', soal: 3, detik: 300 },
    { id: 'satuan', jp: '単位換算', soal: 3, detik: 240 },
    { id: 'logika', jp: '判断推理', soal: 3, detik: 300 },
    { id: 'cerita', jp: '現場応用', soal: 3, detik: 420 },
  ],
  cerita: [
    {
      kode: 'C001',
      tag: 'TARGET PRODUKSI',
      diff: 'easy',
      q: 'Dua belas baut per menit selama 15 menit. Berapa baut?',
      ans: 180,
      unit: 'baut',
      exp: '12 × 15 = 180 baut.',
    },
  ],
};

const PAPAN = {
  success: true,
  peringkat: [
    { no_wa: '628111', nama: 'Sari', kelas: 'A', skor: 750, skorTampil: '750,0000' },
    { no_wa: '6281234567890', nama: 'Budi', kelas: 'A', skor: 700, skorTampil: '700,0000' },
  ],
};

const ZONA = {
  'うえ の たな': 'ue',
  'した の たな': 'shita',
  'ひだり の はこ': 'hidari',
  'みぎ の はこ': 'migi',
  'つくえ の うえ': 'tsukue',
  'いす の した': 'isu',
  'ドア の ちかく': 'doa',
  'まど の そば': 'mado',
  'かばん の なか': 'kaban',
  'ひきだし の なか': 'hiki',
  'ゆか の うえ': 'yuka',
  'れいぞうこ の なか': 'reizouko',
};

const ARTI = Object.fromEntries(BANK_KOTOBA.kosakata.map((v) => [v.k, v.id]));

const laporan = { waktu: new Date().toISOString(), langkah: [], galatKonsol: [], simpanSkor: [] };
const catat = (nama, ok, detail = '') => {
  laporan.langkah.push({ nama, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${nama}${detail ? ` — ${detail}` : ''}`);
};

/** Jalankan server lokal dan kembalikan { url, matikan }. */
function mulaiServer() {
  return new Promise((resolve, reject) => {
    const anak = spawn(process.execPath, ['server.cjs'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const batas = setTimeout(() => reject(new Error('server tidak menyala dalam 20 dtk')), 20000);
    anak.stdout.on('data', (d) => {
      buf += String(d);
      const m = buf.match(/http:\/\/localhost:(\d+)/);
      if (m) {
        clearTimeout(batas);
        resolve({ url: `http://localhost:${m[1]}`, matikan: () => anak.kill() });
      }
    });
    anak.stderr.on('data', (d) => {
      buf += String(d);
    });
    anak.on('exit', (kode) => {
      clearTimeout(batas);
      reject(new Error(`server keluar (${kode}): ${buf.slice(0, 300)}`));
    });
  });
}

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const srv = await mulaiServer();
  console.log(`server: ${srv.url}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

  /* Sesi palsu: halaman menjalankan gerbang aslinya, tetapi tidak ada token
     nyata yang dikirim karena semua API dijawab `page.route` di bawah. */
  await context.addInitScript(() => {
    localStorage.setItem(
      'asj_auth',
      JSON.stringify({
        role: 'kandidat',
        name: 'Budi',
        wa: '081234567890',
        sessionToken: 'uji-probe',
        refreshToken: '',
        isLoggedIn: true,
        lastChecked: Date.now(),
      }),
    );
    /* Chromium headless tidak punya Network Information API. Tanpa ini,
       preflight SELALU menolak menawarkan (koneksi tak diketahui) dan tesnya
       akan hijau karena tidak ada yang diuji. */
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { type: 'wifi', effectiveType: '4g', saveData: false },
    });
  });

  await context.route('**/.netlify/functions/**', async (route) => {
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || '{}');
    } catch {}
    const aksi = body.action;
    if (aksi === 'getBankKotoba') return route.fulfill({ json: BANK_KOTOBA });
    if (aksi === 'getBankMatematika') return route.fulfill({ json: BANK_MATEMATIKA });
    if (aksi === 'getPapanSkor') return route.fulfill({ json: PAPAN });
    if (aksi === 'simpanSkorGame') {
      laporan.simpanSkor.push(body.payload || []);
      return route.fulfill({ json: { success: true, terbaik: 0 } });
    }
    return route.fulfill({ json: { success: true } });
  });

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') laporan.galatKonsol.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => laporan.galatKonsol.push(`pageerror: ${String(e).slice(0, 300)}`));

  const bukaGodot = async (nama, tombol) => {
    if (!godotAktif) {
      catat(`Godot ${nama}: disembunyikan`, true, 'GODOT_AKTIF=false');
      return;
    }
    const mulai = Date.now();
    await page.click(`[data-godot-buka="${tombol}"]`);
    try {
      /* Status menempel di `#asj-godot` (kanvas), bukan di mount: loader
         menyetel `dataset.status` pada elemen yang ia temukan sebagai
         `asj-godot`. Memeriksa mount membuat probe melaporkan "gagal" padahal
         engine siap — persis yang terjadi pada percobaan pertama. */
      await page.waitForFunction(
        () => {
          const c = document.getElementById('asj-godot');
          return c?.dataset.status === 'siap' || window.ASJGodot?.status().siap === true;
        },
        null,
        { timeout: 90000 },
      );
      const durasi = Math.round((Date.now() - mulai) / 1000);
      catat(`Godot ${nama}: engine siap`, true, `${durasi} dtk`);
      /* Satu frame saja tidak cukup: `status=siap` diset sebelum frame pertama
         dengan scene tergambar. Tanpa jeda ini screenshot menangkap kanvas abu. */
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/godot-${nama}.png` });
    } catch {
      const status = await page.evaluate(() => ({
        kanvas: document.getElementById('asj-godot')?.dataset.status,
        mount: document.getElementById('asj-godot-mount')?.dataset.status,
        api: window.ASJGodot?.status(),
      }));
      catat(`Godot ${nama}: engine siap`, false, JSON.stringify(status));
      await page.screenshot({ path: `${OUT}/godot-${nama}-GAGAL.png` });
    }
    await page.click('#asj-godot-tutup').catch(() => {});
    await tidur(400);
  };

  /* ── 1. /arcade — Genba DOM ─────────────────────────────────────────── */
  try {
    await page.goto(`${srv.url}/arcade/`, { waitUntil: 'domcontentloaded' });
    /* `[data-testid="arcade-perintah"]` baru ada SETELAH shift dimulai — lobby
       menampilkan tombol, bukan perintah. Menunggunya lebih dulu (percobaan
       pertama probe ini) selalu timeout. */
    const mulai = page.getByRole('button', { name: /Mulai Shift/i }).first();
    await mulai.waitFor({ state: 'visible', timeout: 30000 });
    catat('Arcade: halaman terbuka', true);

    /* Preflight: cache kosong + Wi-Fi ⇒ tawaran muncul SEBELUM dibutuhkan.
       Kalau pintu Godot ditutup, tombol unduh (dan tawarannya) ikut hilang. */
    if (!godotAktif) {
      catat('Preflight: disembunyikan bersama kartu Godot', true, 'GODOT_AKTIF=false');
    } else
    try {
      await page.waitForSelector('#asj-godot-preflight', { timeout: 8000 });
      const teksTawaran = (await page.textContent('#asj-godot-preflight')) || '';
      catat(
        'Preflight: tawaran unduhan muncul (Wi-Fi, cache kosong)',
        /Unduh paket game/i.test(teksTawaran),
      );
      await page.screenshot({ path: `${OUT}/preflight.png` });
      await page.getByRole('button', { name: 'Nanti', exact: true }).click();
      const tunda = await page.evaluate(() => localStorage.getItem('asj_godot_preflight_nanti'));
      catat('Preflight: "Nanti" menunda 3 hari', Number(tunda) > Date.now());
    } catch (e) {
      catat('Preflight: tawaran unduhan muncul', false, String(e).slice(0, 120));
    }

    await mulai.click();
    await page.waitForSelector('[data-testid="arcade-perintah"]', { timeout: 15000 });
    await page.waitForTimeout(600);

    const perintah = (await page.textContent('[data-testid="arcade-perintah"]'))?.trim() || '';
    /* Antrian: tiga pelanggan terlihat, dan memilih yang lain mengganti
       pesanan aktif. Ini yang membedakan shift dari latihan mencocokkan kata. */
    const kartuAntrian = page.locator('.arc-antrian-kartu');
    catat('Genba: antrian 3 pelanggan tampil', (await kartuAntrian.count()) === 3);
    await page.screenshot({ path: `${OUT}/genba-antrian.png` });
    await kartuAntrian.nth(1).click();
    await page.waitForTimeout(250);
    const perintahLain = (await page.textContent('[data-testid="arcade-perintah"]'))?.trim() || '';
    catat('Genba: berpindah pelanggan mengganti pesanan', perintahLain !== perintah);
    await kartuAntrian.nth(0).click();
    await page.waitForTimeout(250);

    const perintahAktif = (await page.textContent('[data-testid="arcade-perintah"]'))?.trim() || '';
    const cocok = perintahAktif.match(/^(\S+) (\S+) を (.+?) に おいてください$/);
    if (!cocok) throw new Error(`perintah tak terbaca: ${perintahAktif}`);
    const [, warna, barang, zona] = cocok;

    await page.locator('button', { hasText: `${warna}${barang}` }).first().click();
    const idZona = ZONA[zona];
    if (!idZona) throw new Error(`zona tak dikenal: ${zona}`);
    await page.locator(`[data-zona="${idZona}"]`).click();
    await page.waitForTimeout(900);

    /* Skor Genba TIDAK tampil sebagai "¥ n" di layar main (itu di kartu hasil);
       yang terlihat adalah nomor perintah yang maju. Percobaan pertama probe
       menuntut "¥" dan gagal padahal jawabannya benar. */
    const perintahBaru = (await page.textContent('[data-testid="arcade-perintah"]'))?.trim() || '';
    const maju = perintahBaru !== perintahAktif;
    catat('Genba: satu pesanan benar memajukan ronde', maju, `#2: ${perintahBaru.slice(0, 24)}`);
    await page.screenshot({ path: `${OUT}/genba-dom.png` });

    await page.getByRole('button', { name: /Combo Kalimat/i }).first().click();
    await page.waitForSelector('[data-testid="arcade-target"]', { timeout: 15000 });
    catat('Combo: panggung kalimat tampil', true);

    const kartu = page.locator('button').filter({ hasText: /./ });
    await kartu.nth(3).click();
    await page.waitForTimeout(300);
    catat('Combo: kartu bisa diketuk', true);
    await page.screenshot({ path: `${OUT}/combo-dom.png` });
  } catch (e) {
    catat('Arcade/Genba/Combo', false, String(e).slice(0, 200));
  }

  await bukaGodot('genba', 'genba');
  await bukaGodot('combo', 'combo');

  /* ── 2. /kotoba — kuis + papan ──────────────────────────────────────── */
  try {
    await page.goto(`${srv.url}/kotoba/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="kotoba-soal"]', { timeout: 30000 });
    catat('Kotoba: soal tampil', true);

    const kana = (await page.textContent('[data-testid="kotoba-soal"]'))?.trim() || '';
    const arti = ARTI[kana];
    if (!arti) throw new Error(`soal di luar fixture: ${kana}`);
    await page.locator('button[data-opsi]', { hasText: arti }).first().click();
    await page.waitForTimeout(900);
    catat('Kotoba: jawaban benar diterima', true);
    await page.screenshot({ path: `${OUT}/kotoba-kuis.png` });

    await page.getByRole('button', { name: /Papan Skor/i }).first().click();
    await page.waitForSelector('text=Sari', { timeout: 10000 });
    catat('Kotoba: papan peringkat terbuka', true);
  } catch (e) {
    catat('Kotoba', false, String(e).slice(0, 200));
  }

  await bukaGodot('garden', 'kotoba');

  /* ── 3. /matematika — papan + satu soal ─────────────────────────────── */
  try {
    await page.goto(`${srv.url}/matematika/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Pilih modul tes', { timeout: 30000 });
    catat('Matematika: lobi tampil', true);

    await page.getByRole('button', { name: /Papan Skor/i }).first().click();
    await page.waitForSelector('text=Sari', { timeout: 10000 });
    catat('Matematika: papan peringkat terbuka', true);
    await page.screenshot({ path: `${OUT}/matematika-papan.png` });

    await page.getByRole('button', { name: /Mulai tes/i }).first().click();
    await page.waitForSelector('text=Kirim jawaban', { timeout: 15000 });
    await page.getByRole('button', { name: '7', exact: true }).first().click();
    await page.getByRole('button', { name: /Kirim jawaban/i }).first().click();
    await page.waitForTimeout(900);
    catat('Matematika: satu soal bisa dijawab', true);
    await page.screenshot({ path: `${OUT}/matematika-soal.png` });
  } catch (e) {
    catat('Matematika', false, String(e).slice(0, 200));
  }

  await bukaGodot('figural', 'matematika');

  await browser.close();
  srv.matikan();

  writeFileSync(`${OUT}/laporan.json`, JSON.stringify(laporan, null, 2));
  const gagal = laporan.langkah.filter((l) => !l.ok);
  console.log(`\n${laporan.langkah.length - gagal.length}/${laporan.langkah.length} langkah lulus`);
  if (gagal.length) {
    console.log('GAGAL:', gagal.map((g) => `${g.nama} (${g.detail})`).join(' | '));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
