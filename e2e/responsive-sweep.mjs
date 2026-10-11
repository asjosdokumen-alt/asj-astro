/**
 * responsive-sweep.mjs — menemukan cacat TATA LETAK responsif di SETIAP page,
 * pada lebar telepon DAN desktop.
 *
 * KENAPA GATE INI ADA
 * -------------------
 * Repo ini punya banyak gate, tetapi semuanya mengukur HAL LAIN: `test-contrast`
 * mengukur rasio warna, `test-aria-names` mengukur nama aksesibel, `test-headings`
 * mengukur struktur judul, `test-loker-layout` mengukur SATU komponen. Tidak ada
 * satu pun yang menjawab pertanyaan yang paling mudah dilihat manusia:
 *
 *     "apakah ada elemen yang MELUBER keluar layar, saling MENUMPUK, atau
 *      terlalu kecil untuk disentuh — di halaman mana pun, lebar mana pun?"
 *
 * Empat cacat itu semua SENYAP: tidak ada error, tidak ada tes merah, hanya
 * halaman yang tampak rusak bagi pengguna.
 *
 * ATURAN YANG DIPAKAI (dan kenapa)
 * --------------------------------
 * R23 — tumpang tindih adalah pertanyaan PERSEGI PANJANG. Perbandingan x-saja
 *       (seperti komentar lama `max-w-[210px]`) menghasilkan vonis palsu; harus
 *       x DAN y. Gate ini memakai kedua sumbu.
 *
 * R25 — vonis "daftar ini kosong" tidak bisa dibedakan dari sapuan yang MATI.
 *       Karena itu ada KONTROL POSITIF: cacat ditanam di halaman hidup dan
 *       sapuan WAJIB melaporkannya. Tanpa itu, "0 cacat" tidak berarti apa-apa.
 *
 * R25a — tab admin dibaca lewat HASH (`/admin#wa`), bukan klik, dan SETIAP
 *       panggilan `/.netlify/functions/**` dipenuhi lokal per-endpoint supaya
 *       tidak ada penolakan yang memicu logout.
 *
 * R1 — alat ini menemukan cacat; ia tidak memperbaikinya. Jalankan dulu, baca
 *      keluarannya, baru putuskan.
 *
 * Jalankan:
 *   node e2e/responsive-sweep.mjs              (gate menyalakan server sendiri)
 *   BASE_URL=http://localhost:4321 node e2e/responsive-sweep.mjs --only=loker
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import net from 'node:net';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

/* ── SERVER YANG DIJALANKAN OLEH GATE INI SENDIRI ──────────────────────────
   Kenapa gate ini yang menyalakan servernya, bukan `npm run serve` di shell
   lain: server yang dinyalakan lewat `&` di sesi ini MATI setelah 30-80 detik
   tanpa satu pun jejak di JS-nya — tidak ada `uncaughtException`, tidak ada
   `EXIT code`, listener tetap kosong. Diukur 2026-10-11 dengan pembungkus
   `process.on('exit')`: penanda EXIT TIDAK PERNAH tertulis, jadi prosesnya
   dibunuh dari LUAR, bukan runtuh sendiri. Gejalanya menipu total:
   `page.goto` menjawab `ERR_CONNECTION_REFUSED`, yang terbaca persis seperti
   "server tidak pernah dinyalakan".

   Karena itu gate ini memiliki prosesnya: `spawn` sebagai proses ANAK, dan
   `unref()` supaya hidupnya tidak bergantung pada job-shell. Kalau BASE_URL
   diberikan, pemanggil bertanggung jawab atas servernya. */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
let ownedServer = null;

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 1_000);
  });
}

async function ensureServer() {
  if (process.env.BASE_URL) return;          // pemanggil yang menyediakan
  const port = Number(new URL(BASE).port || 4321);
  if (await portOpen(port)) return;          // sudah ada yang melayani
  if (!existsSync(join(REPO_ROOT, 'dist', 'index.html'))) {
    throw new Error('dist/index.html tidak ada — jalankan `npm run build` dulu');
  }
  ownedServer = spawn(process.execPath, [join(REPO_ROOT, 'server.cjs')], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    detached: false,
  });
  ownedServer.unref();
  for (let i = 0; i < 40; i++) {
    if (await portOpen(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server lokal tidak pernah siap di port ${port}`);
}

/* Lebar yang diuji — bukan hanya "1 telepon, 1 desktop".
   320  iPhone SE / perangkat terkecil yang masih dipakai (ini yang paling jago
        memunculkan luberan horizontal)
   360  Android umum
   390  iPhone 14/15 (acuan desain repo ini)
   768  tablet potret
   1280 desktop
   1440 desktop lebar — memunculkan masalah "konten melar" / garis terlalu panjang */
const WIDTHS = [320, 360, 390, 768, 1280, 1440];

/** Lantai sentuh repo ini: `DESIGN.md:344` menyebut > 44px untuk sasaran sentuh. */
const MIN_TAP = 44;
/* Ambang luberan: 1px mentoleransi pembulatan sub-piksel. */
const OVERFLOW_TOL = 1;
/* Ambang potong teks yang BERARTI. Diukur 2026-10-11: `letter-spacing: 0.18em`
   pada `text-eyebrow` (11px) memunculkan selisih scrollWidth-clientWidth 2px
   TANPA ada teks yang benar-benar hilang — itu pembulatan, bukan pemotongan.
   Potongan yang nyata di halaman ini mulai dari 15px (`/siswa-baru` h1 di 320px).
   4px memisahkan keduanya dengan margin di kedua sisi. */
const MIN_CUT = 4;

const GATE_MARKERS = [
  'Verifikasi Akun Kandidat',
  'Mengalihkan ke halaman login...',
  'Akses ditolak. Mengalihkan...',
];

function authFor(role) {
  return JSON.stringify({
    sessionToken: `sweep-fake-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    role,
    wa: '081234567890',
    name: 'Sweep Check',
    lastChecked: Date.now(),
  });
}

const PUBLIC_DATA_FIXTURE = {
  success: true,
  sessionInvalid: false,
  activeTheme: 'dark',
  pengumuman: 'PENGUMUMAN UJI: pendaftaran batch baru sudah dibuka.',
  jobs: [
    ['TEST-001', 'NOUGYOU SAYURAN', 'PERTANIAN', 'Ibaraki', 'Pria', 'OPEN', 'JFT A2', '', 'https://example.invalid/cv-001'],
    ['TEST-002', 'KAIGO', 'KESEHATAN', 'Tokyo', 'Wanita', 'URGENT', 'JFT N4', 'Interview minggu depan', ''],
    ['TEST-003', 'KONSTRUKSI', 'KONSTRUKSI', 'Osaka', 'Pria', 'CLOSE', 'SSW', 'Kuota sudah penuh', ''],
  ].map(([code, pekerjaan, kategori, lokasi, gender, status, tahapan, keterangan, pamflet]) => ({
    code, pekerjaan, kategori, lokasi, gender, status, tahapan, keterangan, pamflet,
    templateCv: pamflet ? 'TPL' : '',
    createdAt: new Date(0).toISOString(),
  })),
};

const ADMIN_CANDIDATE = {
  nama: 'Sweep Uji',
  wa: '081234567890',
  idLoker: 'TG591ASJ',
  idKandidat: 'ASJ-001',
  tahapan: 'PEMBERKASAN',
  status: 'LULUS',
  kategori: 'NOUGYOU SAYURAN',
  berkas: {},
  bio: {},
};

/**
 * Rute yang disapu. `session: null` berarti halaman publik (tidak ada
 * `asj_auth` di localStorage), selain itu peran yang dipasang.
 *
 * ⚠ SETIAP rute ber-sesi MEMAKAI `interceptAll` — bukan hanya /admin. Sebabnya
 * bukan kerapian: rute ber-gerbang memanggil `.netlify/functions/**` sendiri
 * (`/candidate` memanggil `get-app-data`, `/apply` memanggil cek WA), dan
 * kalau panggilan itu dibiarkan lewat, ia menuju backend PRODUKSI jarak jauh
 * (server.cjs mem-proxy ke sana). Halaman lalu bergantung pada jaringan,
 * lambat, dan kadang merender keadaan kosong/error yang bukan cacat tata letak
 * tetapi tercampur ke hasil. Diukur 2026-10-11: /candidate butuh ~60 detik
 * tanpa stub dan >4 detik dengan stub.
 */
const ROUTES = [
  { path: '/', session: null },
  { path: '/loker', session: null, waitFor: 'table' },
  { path: '/public', session: null, waitFor: 'table' },
  { path: '/ai-cv', session: null, expectGate: true },
  { path: '/apply', session: 'kandidat', interceptAll: true },
  { path: '/siswa-baru', session: 'kandidat', interceptAll: true },
  { path: '/master', session: 'kandidat', interceptAll: true },
  { path: '/share', session: 'kandidat', interceptAll: true },
  { path: '/admin', session: 'admin', interceptAll: true },
  { path: '/candidate', session: 'kandidat', interceptAll: true },
  /* /ai-cv SESI MASUK: bentuk berbeda dari gerbang di atas — rute yang sama,
     dua keadaan yang tidak saling menggantikan. Gerbangnya (belum masuk)
     sudah diuji; yang ini menguji FORM-nya. */
  { path: '/ai-cv', session: 'kandidat', interceptAll: true, label: '/ai-cv (masuk)' },
  { path: '/404', session: null },
];

const ADMIN_TABS = ['kelola', 'tugas', 'dbjob', 'pelamar', 'wa', 'mail', 'agenda', 'config'];

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice('--only='.length);

let browser;
const failures = [];
let checks = 0;
let skippedByFilter = 0;

/**
 * Apakah label ini akan benar-benar diuji? DIPERIKSA SEBELUM membuka halaman.
 *
 * Kenapa ini bukan sekadar kerapian: `--only=<x>` dulu tetap membuka SELURUH
 * 114 halaman (hanya assertion-nya yang dilewati), yaitu ~2 menit buang-buang
 * plus 114 konteks browser yang dibuka-tutup. Menjalankan satu permukaan lewat
 * `--only` seharusnya cepat. Diukur 2026-10-11.
 */
function willRun(name) {
  return !(ONLY && !name.startsWith('CONTROL') && !name.includes(ONLY));
}

async function test(name, fn) {
  if (!willRun(name)) {
    skippedByFilter++;
    return;
  }
  checks++;
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failures.push(name);
  }
}

async function openSurface(route, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  /* ── PENANGKAP ERROR RUNTIME ──────────────────────────────────────────────
     R25: vonis "bersih" harus tidak bisa dibedakan dari sapuan MATI. Bentuk
     paling berbahaya dari sapuan mati BUKAN "nol elemen" (itu sudah dijaga
     lantai `scanned < 15`), melainkan HALAMAN YANG GAGAL MERENDER SEBAGIAN:
     satu komponen melempar, SPA jatuh ke keadaan kosong, dan sisa DOM yang
     tinggal tetap terlihat rapi. Gate tata letak tidak melihat apa pun yang
     salah — padahal halaman itu rusak bagi pengguna.

     Jadi setiap `pageerror` dan setiap log `error` konsol dikumpulkan di sini
     dan diperlakukan sebagai GAGAL, bukan sebagai derau. Diukur 2026-10-11:
     tanpa ini, /candidate yang gagal `response.json()` pada balasan kosong
     tetap dilaporkan "✅ tanpa cacat". */
  route.runtimeErrors = [];
  page.on('pageerror', (err) => {
    route.runtimeErrors.push(err.message.split('\n')[0].slice(0, 160));
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    /* Derau yang BUKAN cacat halaman: permintaan jaringan yang sengaja kita
       stub, dan keluhan favicon. Keduanya akan memerahkan setiap rute. */
    if (/favicon|net::ERR_|Failed to load resource|status of 4\d\d|status of 5\d\d/i.test(text)) return;
    route.runtimeErrors.push(`console.error: ${text.slice(0, 160)}`);
  });

  if (route.interceptAll) {
    await page.route('**/.netlify/functions/**', (r) => {
      const url = r.request().url();
      let body = { success: true, sessionInvalid: false };
      if (url.includes('/candidates')) {
        body = { success: true, total: 1, candidates: [ADMIN_CANDIDATE] };
      } else if (url.includes('get-app-data')) {
        body = {
          success: true,
          sessionInvalid: false,
          activeTheme: 'dark',
          candidates: [ADMIN_CANDIDATE],
          schedules: [],
          messages: [],
          jobs: PUBLIC_DATA_FIXTURE.jobs,
          waTemplates: [{ id: 'tpl-1', nama: 'Template Uji', isi: 'Halo {nama}, ini pesan uji.' }],
        };
      }
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
  } else {
    await page.route('**/.netlify/functions/get-app-data*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_DATA_FIXTURE) }),
    );
  }

  if (route.session) {
    await page.addInitScript((v) => {
      try { localStorage.setItem('asj_auth', v); } catch { /* gate shows instead */ }
    }, authFor(route.session));
  }

  const resp = await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const status = resp ? resp.status() : 0;
  if (status !== 200) {
    await ctx.close();
    throw new Error(`GET ${route.path} -> HTTP ${status}; refusing to read the DOM of an error page`);
  }
  if (route.waitFor) {
    await page.waitForSelector(route.waitFor, { timeout: 15_000 }).catch(() => {});
  }
  // `networkidle` can hang forever once a route handler holds a request open,
  // so it is a bounded wait, never the only signal that the page settled.
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { ctx, page };
}

async function assertReachedBody(page, path) {
  const text = await page.evaluate(() => document.body.innerText);
  const gate = GATE_MARKERS.find((m) => text.includes(m));
  if (gate) throw new Error(`${path} rendered the GATE (${JSON.stringify(gate)}), not the page body`);
}

/**
 * Sapuan utama, dijalankan DI DALAM halaman.
 *
 * Semua pengukuran memakai `getBoundingClientRect()` pada elemen yang
 * benar-benar terlihat. Elemen tersembunyi (`display:none`, `visibility:hidden`,
 * ukuran 0) DILEWATI — kalau tidak, panel modal yang belum dibuka akan
 * dilaporkan sebagai luberan di mana-mana.
 */
const SWEEP_FN = `(opts) => {
  const { MIN_TAP, OVERFLOW_TOL, MIN_CUT } = opts;
  const out = { overflow: [], tap: [], clipped: [], docWidth: 0, viewport: 0, scanned: 0, textOverlap: [] };

  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  out.viewport = vw;
  out.docWidth = document.documentElement.scrollWidth;

  const visible = (el, r) => {
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    /* Elemen di dalam panel tab yang TERTUTUP masih melaporkan rect kecil
       (bukan nol) untuk sebagian kontrol form, sehingga lolos dari cek di atas.
       Ukuran sebenarnya ada di offsetWidth/offsetHeight; kalau nol, elemennya
       tidak dirender sama sekali dan tidak boleh diukur. Kasus nyata
       2026-10-11: select#mf-gender di /master dilaporkan 141x17px padahal
       offsetHeight-nya 55 — ia berada di tab yang tidak aktif. */
    if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
    return true;
  };

  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';
    const txt = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
    return el.tagName.toLowerCase() + id + cls + (txt ? ' "' + txt + '"' : '');
  };

  /* ── 1. LUBERAN HORIZONTAL ────────────────────────────────────────────────
     Elemen yang melewati tepi kanan viewport. Ini akar dari "halaman bisa
     digeser ke kanan" di telepon — cacat yang paling sering dan paling
     merusak kesan.

     ⚠ DUA HAL YANG *BUKAN* CACAT, dan keduanya sudah menipu gate ini sekali:
     (a) elemen yang MEMANG di-scroll horizontal oleh leluhurnya (tabel
         overflow-x-auto, carousel) — di sana luberan adalah desain;
     (b) elemen yang dipotong oleh leluhur ber-overflow: hidden, seperti
         .marquee-track di /public (motion.css: overflow: hidden +
         contain: layout paint + .marquee-content { width: max-content }
         yang dianimasikan). Strip itu SELALU lebih lebar dari wadahnya —
         itu cara kerja marquee — dan ia tidak pernah membuat halaman bergeser.
     Karena itu syarat sebenarnya bukan "ada elemen yang lewat tepi", melainkan
     "halaman ini benar-benar bisa digeser ke kanan". Kalau scrollWidth dokumen
     masih muat, tidak ada yang perlu dilaporkan. */
  const docScrollsX = document.documentElement.scrollWidth > vw + OVERFLOW_TOL;
  const all = document.querySelectorAll('body *');
  out.scanned = all.length;
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    if (!docScrollsX) break; // halaman tidak bergeser → tidak ada luberan nyata

    // (a) leluhur yang MEMANG bisa di-scroll horizontal
    let scrollAncestor = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflow === 'auto') { scrollAncestor = p; break; }
    }
    if (scrollAncestor) continue;

    // (b) dipotong oleh leluhur ber-overflow hidden (marquee, track kliping)
    let clippedBy = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'hidden' || cs.overflow === 'hidden') { clippedBy = p; break; }
    }
    if (clippedBy) continue;

    if (r.right > vw + OVERFLOW_TOL) {
      out.overflow.push({
        el: describe(el),
        right: Math.round(r.right),
        over: Math.round(r.right - vw),
      });
    }
  }

  /* ── 2. SASARAN SENTUH TERLALU KECIL ─────────────────────────────────────
     Lantai repo: 44px. Hanya untuk kontrol yang MEMANG bisa ditekan. Teks
     tautan inline di tengah paragraf dikecualikan (standar WCAG 2.5.8
     mengecualikan target inline), kalau tidak setiap <a> di prosa dilaporkan.

     ⚠ UKURAN YANG BENAR ADALAH "APA YANG DIKENAI JARI", BUKAN KOTAK ELEMEN.
     Checkbox w-5 h-5 (20x20) di TabTambah.tsx:261 dilaporkan kecil oleh
     versi pertama gate ini — padahal ia dibungkus
     <label class="min-h-11 ... cursor-pointer">, dan mengetuk teks labelnya
     IKUT mencentang kotaknya. Target sebenarnya adalah baris label 44px itu.
     Jadi: untuk kontrol yang punya <label> pembungkus (atau label[for]),
     yang diukur adalah LABEL-nya.

     ⚠ TAPI LABEL TIDAK SELALU MEMPERBESAR — ambil yang TERBESAR, jangan yang
     pertama ketemu. select#ap-gender di /apply punya label[for] berisi caption
     setinggi 20px, sementara select-nya sendiri 139x55. Memakai label membuat
     gate melaporkan cacat pada kontrol yang sudah benar (diukur 2026-10-11).
     Area yang bisa dikenai jari adalah area TERBESAR di antara kontrol itu
     sendiri, label pembungkusnya, dan label[for]-nya. */
  const effectiveTarget = (el) => {
    const self = { w: el.offsetWidth, h: el.offsetHeight };
    const area = (o) => o.w * o.h;
    const candidates = [self];
    const wrapping = el.closest('label');
    if (wrapping) candidates.push({ w: wrapping.offsetWidth, h: wrapping.offsetHeight });
    if (el.id) {
      const forLabel = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (forLabel) candidates.push({ w: forLabel.offsetWidth, h: forLabel.offsetHeight });
    }
    let best = self;
    for (const c of candidates) if (area(c) > area(best)) best = c;
    return best;
  };

  const pressable = document.querySelectorAll('button, a[href], input[type="checkbox"], input[type="radio"], select, [role="button"]');
  for (const el of pressable) {
    const own = el.getBoundingClientRect();
    if (!visible(el, own)) continue;
    // Tautan inline di dalam prosa: punya saudara teks di baris yang sama.
    const inline = el.tagName === 'A' && el.parentElement &&
      el.parentElement.textContent.trim().length > el.textContent.trim().length + 20;
    if (inline) continue;
    const t = effectiveTarget(el);
    if (t.w < MIN_TAP || t.h < MIN_TAP) {
      out.tap.push({
        el: describe(el),
        w: Math.round(t.w),
        h: Math.round(t.h),
      });
    }
  }

  /* ── 3. TEKS TERPOTONG (clipped) ─────────────────────────────────────────
     Hanya elemen yang teksnya SENDIRI terpotong — bukan wadah yang memotong
     anak dekoratifnya.

     ⚠ Versi pertama gate ini melaporkan SETIAP wadah ber-overflow hidden yang
     scrollWidth-nya melebihi clientWidth, dan itu salah: CandidateDash.tsx:596
     (panel jadwal) punya p-6 + ikon absolute -right-4 -top-4 yang MEMANG
     diniatkan keluar tepi, dan overflow-hidden di sana justru yang memotongnya
     dengan benar. Gate melaporkannya sebagai cacat permanen 24px di SEMUA lebar,
     termasuk 1440px — bentuk khas vonis palsu.

     Sinyal yang benar: elemen itu punya teks langsung sendiri, DAN gaya
     komputasinya benar-benar memotong (text-overflow: ellipsis, atau
     white-space: nowrap dengan overflow tersembunyi). Anak dekoratif absolut
     tidak masuk hitungan. */
  const hasOwnText = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && (n.textContent || '').trim().length > 1) return true;
    }
    return false;
  };
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    if (!hasOwnText(el)) continue;
    const cs = getComputedStyle(el);
    const clipsX = cs.overflowX === 'hidden' || cs.overflow === 'hidden';
    const ellipsis = cs.textOverflow === 'ellipsis';
    const nowrap = cs.whiteSpace === 'nowrap' || cs.whiteSpace === 'pre';
    if (!clipsX) continue;
    if (!ellipsis && !nowrap) continue;
    /* MIN_CUT, bukan OVERFLOW_TOL: selisih 1-2px adalah pembulatan
       letter-spacing / sub-piksel, bukan teks yang hilang. Lihat definisi
       MIN_CUT dan angka yang melahirkan ambang itu. */
    if (el.scrollWidth - el.clientWidth >= MIN_CUT && el.clientWidth > 0) {
      out.clipped.push({
        el: describe(el),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        cut: el.scrollWidth - el.clientWidth,
      });
    }
  }

  return out;
}`;

async function sweep(page) {
  return page.evaluate(`(${SWEEP_FN})(${JSON.stringify({ MIN_TAP: MIN_TAP, OVERFLOW_TOL: OVERFLOW_TOL, MIN_CUT: MIN_CUT })})`);
}

/**
 * KONTROL POSITIF — R25: vonis "0 cacat" tidak bisa dibedakan dari sapuan mati.
 * Tanam satu cacat dari tiap jenis dan pastikan sapuan MELIHATNYA.
 */
async function plantAndDetect(page) {
  await page.evaluate(() => {
    const mk = (id, css, text) => {
      const d = document.createElement('div');
      d.id = id;
      d.style.cssText = css;
      d.textContent = text || '';
      document.body.appendChild(d);
      return d;
    };
    /* Luberan: elemen DALAM ALIRAN (bukan position:fixed) yang lebih lebar dari
       viewport. Harus in-flow, karena `position: fixed` TIDAK menambah
       `document.scrollWidth` — probe fixed akan membuat kontrol ini lulus
       terhadap aturan yang tidak bisa melihat luberan nyata. Dipelajari
       2026-10-11: probe fixed melaporkan "sapuan BUTA terhadap overflow". */
    mk('probe-overflow', 'width:calc(100vw + 400px);height:8px;z-index:99998', 'x');
    // Sasaran sentuh kecil: 20x20
    const b = document.createElement('button');
    b.id = 'probe-small';
    b.style.cssText = 'position:fixed;top:60px;left:0;width:20px;height:20px;z-index:99998';
    b.textContent = 'x';
    document.body.appendChild(b);
    // Teks terpotong: kontainer 60px dengan teks panjang tanpa wrap + ellipsis
    mk('probe-clipped', 'width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;z-index:99998',
      'TEKS PANJANG YANG JELAS MELEBIHI ENAM PULUH PIKSEL');
  });

  const res = await sweep(page);
  const found = {
    overflow: res.overflow.some((o) => o.el.includes('probe-overflow')),
    tap: res.tap.some((o) => o.el.includes('probe-small')),
    clipped: res.clipped.some((o) => o.el.includes('probe-clipped')),
  };
  await page.evaluate(() => {
    for (const id of ['probe-overflow', 'probe-small', 'probe-clipped']) document.getElementById(id)?.remove();
  });
  return found;
}

/** Format satu cacat jadi satu baris yang bisa dibaca manusia. */
function fmtDefect(d) {
  if (d.over !== undefined) return `${d.el} — melewati tepi kanan ${d.over}px (right=${d.right})`;
  if (d.w !== undefined) return `${d.el} — sasaran sentuh ${d.w}×${d.h}px (lantai ${MIN_TAP})`;
  if (d.cut !== undefined) return `${d.el} — teks terpotong ${d.cut}px (scroll=${d.scrollW} client=${d.clientW})`;
  return JSON.stringify(d);
}

/** Bagian dari `problems` yang sama untuk rute biasa maupun tab admin. */
function layoutProblems(res) {
  const problems = [];
  for (const o of res.overflow) problems.push(fmtDefect(o));
  for (const o of res.tap) problems.push(fmtDefect(o));
  for (const o of res.clipped) problems.push(`TEKS TERPOTONG: ${fmtDefect(o)}`);
  return problems;
}

/** Label rute untuk keluaran (mendukung dua permukaan pada path yang sama). */
function routeLabel(route, width) {
  const suffix = route.label ?? route.path;
  const gate = route.expectGate ? ' (gerbang masuk)' : '';
  return `${width}px ${suffix}${gate}`;
}

async function run() {
  await ensureServer();
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });

  /* ── 0. KONTROL POSITIF ──────────────────────────────────────────────────
     Dijalankan PERTAMA dan tidak pernah difilter `--only`. Kalau sapuan tidak
     bisa melihat cacat yang ditanam, setiap "bersih" di bawah adalah kebohongan. */
  {
    const { ctx, page } = await openSurface({ path: '/', session: null }, 390);
    try {
      await test('CONTROL: sapuan melihat cacat yang ditanam', async () => {
        const found = await plantAndDetect(page);
        const blind = Object.entries(found).filter(([, v]) => !v).map(([k]) => k);
        if (blind.length) {
          throw new Error(
            `sapuan BUTA terhadap: ${blind.join(', ')} — tidak bisa gagal, jadi setiap vonis ` +
              '"bersih" di bawah tidak berarti apa-apa',
          );
        }
      });
    } finally {
      await ctx.close();
    }
  }

  /* ── 1. Rute istirahat ───────────────────────────────────────────────────*/
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const label = routeLabel(route, width);
      // Jangan buka halaman yang tidak akan diuji (lihat willRun).
      if (!willRun(label) && !willRun(`${label}: terbuka`)) { skippedByFilter++; continue; }
      let opened;
      route.runtimeErrors = [];
      try {
        opened = await openSurface(route, width);
      } catch (err) {
        await test(`${label}: terbuka`, async () => { throw err; });
        continue;
      }
      const { ctx, page } = opened;
      try {
        await test(label, async () => {
          if (!route.expectGate) await assertReachedBody(page, route.path);
          const res = await sweep(page);

          /* Lantai: halaman yang tidak merender apa pun tidak boleh lolos
             sebagai "bersih". */
          if (res.scanned < 15) {
            throw new Error(
              `hanya ${res.scanned} elemen dipindai — halaman tampaknya tidak merender apa-apa, ` +
                'jadi "0 cacat" akan sia-sia',
            );
          }

          const problems = layoutProblems(res);

          /* Halaman yang MELEMPAR tidak boleh dinilai dari tata letaknya:
             yang dilaporkan dulu adalah errornya, karena itulah yang membuat
             sisa pengukuran tidak bisa dipercaya. */
          if (route.runtimeErrors.length) {
            throw new Error(
              `${route.runtimeErrors.length} ERROR RUNTIME (tata letak di bawah ini TIDAK dapat dipercaya):\n      - ` +
                [...new Set(route.runtimeErrors)].join('\n      - ') +
                (problems.length ? `\n      (juga ${problems.length} cacat tata letak)` : ''),
            );
          }

          if (problems.length) {
            throw new Error(`${problems.length} cacat:\n      - ${problems.join('\n      - ')}`);
          }
        });
      } finally {
        await ctx.close();
      }
    }
  }

  /* ── 2. Tab admin, lewat HASH (R25a) ─────────────────────────────────────*/
  for (const tab of ADMIN_TABS) {
    for (const width of WIDTHS) {
      const label = `${width}px /admin#${tab}`;
      const route = { path: `/admin#${tab}`, session: 'admin', interceptAll: true };
      if (!willRun(label) && !willRun(`${label}: terbuka`)) { skippedByFilter++; continue; }
      let opened;
      route.runtimeErrors = [];
      try {
        opened = await openSurface(route, width);
      } catch (err) {
        await test(`${label}: terbuka`, async () => { throw err; });
        continue;
      }
      const { ctx, page } = opened;
      try {
        await test(label, async () => {
          await assertReachedBody(page, route.path);
          const res = await sweep(page);
          if (res.scanned < 15) {
            throw new Error(`hanya ${res.scanned} elemen dipindai — tab tampaknya tidak merender isinya`);
          }
          const problems = layoutProblems(res);
          if (route.runtimeErrors.length) {
            throw new Error(
              `${route.runtimeErrors.length} ERROR RUNTIME (tata letak di bawah ini TIDAK dapat dipercaya):\n      - ` +
                [...new Set(route.runtimeErrors)].join('\n      - ') +
                (problems.length ? `\n      (juga ${problems.length} cacat tata letak)` : ''),
            );
          }
          if (problems.length) {
            throw new Error(`${problems.length} cacat:\n      - ${problems.join('\n      - ')}`);
          }
        });
      } finally {
        await ctx.close();
      }
    }
  }

  await browser.close();
  /* Server yang kita nyalakan sendiri ikut dimatikan; server milik pemanggil
     (BASE_URL diberikan) TIDAK disentuh. */
  if (ownedServer) { try { ownedServer.kill(); } catch { /* sudah mati */ } }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${checks - failures.length} lulus · ${failures.length} gagal · ${skippedByFilter} dilewati filter`);
  if (failures.length) {
    console.log('\n  GAGAL:');
    for (const f of failures) console.log(`    - ${f}`);
    process.exit(1);
  }
  console.log('  Tidak ada cacat tata letak responsif yang terdeteksi.');
  /* process.exit WAJIB, bukan sekadar membiarkan fungsi selesai. Sebuah
     `page.route` yang masih terpasang (atau sesi CDP) menahan event loop tetap
     hidup, jadi prosesnya menggantung SELAMANYA setelah cetakan terakhir —
     dan `timeout` membunuhnya dengan kode 124, bukan 0. Dalam gate CI itu
     terbaca sebagai GAGAL meski sapuannya lulus bersih. Diukur 2026-10-11. */
  process.exit(0);
}

run().catch(async (err) => {
  console.error('SWEEP ERROR:', err.message);
  try { await browser?.close(); } catch { /* already closed */ }
  process.exit(2);
});
