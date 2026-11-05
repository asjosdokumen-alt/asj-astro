#!/usr/bin/env node
/**
 * smoke.mjs — uji beban ringan untuk jalur PUBLIK.
 *
 * KENAPA ADA
 * ----------
 * Pemilik 2026-11-05: "yang saya paling takutkan banyak user nanti bug sana
 * sini, apalagi stress test banyak user lemot". Kekhawatiran itu benar, tapi
 * tidak bisa dijawab dengan perasaan — butuh angka: berapa p50/p95, berapa
 * persen gagal, pada berapa pengguna bersamaan.
 *
 * Alat ini menjawab tiga hal dan tidak lebih:
 *   1. berapa lama jalur publik menjawab saat N pengguna menembak bersamaan;
 *   2. berapa persen permintaan gagal (5xx/timeout);
 *   3. apakah ada target yang jelas lebih lambat dari yang lain.
 *
 * ⚠️ AMAN SECARA DEFAULT. Skrip ini MENOLAK menembak host selain
 * localhost/127.0.0.1 kecuali `--allow-remote` diberikan. Alasannya konkret:
 * server lokal di mesin ini memakai DATABASE PRODUKSI (lihat
 * docs/LOCAL_SERVER_8888.md), dan menembak situs produksi dengan beban sintetis
 * bisa menghabiskan kuota serta mengganggu kandidat yang sedang memakai.
 *
 * CARA PAKAI
 * ----------
 *   node scripts/load/smoke.mjs                      # 10 pengguna, 10 detik
 *   node scripts/load/smoke.mjs --concurrency=30 --duration=20
 *   node scripts/load/smoke.mjs --base=https://amanahsakura.netlify.app --allow-remote
 *
 * Ambang lulus (bisa diubah): `--max-error=2` (persen) dan `--max-p95=2500` (ms).
 * Keluar dengan kode 1 kalau salah satu terlampaui — jadi bisa dipakai di CI
 * atau sebelum deploy.
 *
 * YANG TIDAK DIUKUR: jalur ber-sesi (dashboard kandidat, admin). Itu butuh
 * token asli, dan menyimpan token di skrip adalah kebiasaan yang lebih buruk
 * daripada manfaatnya. Untuk jalur itu, ukur manual di browser.
 */

const args = process.argv.slice(2);
const arg = (nama, bawaan) => {
  const hit = args.find((a) => a.startsWith(`--${nama}=`));
  return hit ? hit.slice(nama.length + 3) : bawaan;
};
const flag = (nama) => args.includes(`--${nama}`);

const BASE = arg('base', 'http://localhost:8888').replace(/\/$/, '');
const CONCURRENCY = Math.max(1, Number(arg('concurrency', '10')));
const DURATION_S = Math.max(1, Number(arg('duration', '10')));
const MAX_ERROR = Number(arg('max-error', '2'));
const MAX_P95 = Number(arg('max-p95', '2500'));
const ALLOW_REMOTE = flag('allow-remote');
const TIMEOUT_MS = Number(arg('timeout', '10000'));

let host;
try {
  host = new URL(BASE).hostname.toLowerCase();
} catch {
  console.error(`--base bukan URL yang sah: ${BASE}`);
  process.exit(2);
}
const lokal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
if (!lokal && !ALLOW_REMOTE) {
  console.error(
    [
      `Menolak menembak ${host}: bukan localhost.`,
      'Beban sintetis ke produksi menghabiskan kuota dan mengganggu kandidat nyata.',
      'Kalau kamu memang bermaksud begitu, jalankan ulang dengan --allow-remote.',
    ].join('\n'),
  );
  process.exit(2);
}

/**
 * Target = jalur yang benar-benar dipakai pengunjung tanpa sesi.
 * `getAppData` bentuknya POST ber-envelope { action, payload, sessionToken }
 * (lihat src/lib/apiClient.ts) — bukan GET, jadi tidak bisa disamakan.
 */
const TARGETS = [
  { nama: 'GET /', method: 'GET', path: '/' },
  { nama: 'GET /loker', method: 'GET', path: '/loker' },
  {
    nama: 'POST getAppData(public)',
    method: 'POST',
    path: '/.netlify/functions/get-app-data',
    body: JSON.stringify({ action: 'getAppData', payload: ['public'], sessionToken: '' }),
    headers: { 'Content-Type': 'application/json' },
  },
];

const persentil = (urut, p) => {
  if (!urut.length) return 0;
  const i = Math.min(urut.length - 1, Math.max(0, Math.ceil((p / 100) * urut.length) - 1));
  return urut[i];
};

async function satu(target) {
  const mulai = performance.now();
  try {
    const res = await fetch(BASE + target.path, {
      method: target.method,
      headers: target.headers,
      body: target.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Tubuh WAJIB dibaca: tanpa itu koneksi tidak pernah dilepas dan ukuran
    // latensi jadi milik handshake, bukan milik respons.
    await res.arrayBuffer();
    return { ms: performance.now() - mulai, status: res.status };
  } catch (e) {
    return { ms: performance.now() - mulai, status: 0, err: String(e?.message || e) };
  }
}

async function uji(target) {
  const hasil = [];
  const berhenti = Date.now() + DURATION_S * 1000;

  async function pekerja() {
    while (Date.now() < berhenti) hasil.push(await satu(target));
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, pekerja));

  const ms = hasil.map((h) => h.ms).sort((a, b) => a - b);
  const gagal = hasil.filter((h) => h.status === 0 || h.status >= 500);
  const kode = {};
  for (const h of hasil) kode[h.status] = (kode[h.status] || 0) + 1;
  const rps = hasil.length / DURATION_S;

  return {
    nama: target.nama,
    total: hasil.length,
    rps: Math.round(rps * 10) / 10,
    p50: Math.round(persentil(ms, 50)),
    p95: Math.round(persentil(ms, 95)),
    p99: Math.round(persentil(ms, 99)),
    gagal: gagal.length,
    persenGagal: hasil.length ? (gagal.length / hasil.length) * 100 : 0,
    kode,
    contoh: gagal.slice(0, 3).map((g) => `${g.status} ${g.err || ''}`.trim()),
  };
}

console.log(
  `\nUji beban: ${BASE} · ${CONCURRENCY} pengguna bersamaan · ${DURATION_S} dtk per target\n`,
);

const ringkas = [];
for (const target of TARGETS) {
  const r = await uji(target);
  ringkas.push(r);
  const status = Object.entries(r.kode)
    .map(([k, v]) => `${k}×${v}`)
    .join(' ');
  console.log(
    `  ${r.nama.padEnd(26)} ${String(r.total).padStart(6)} req  ` +
      `${String(r.rps).padStart(6)} rps  p50 ${String(r.p50).padStart(5)} ms  ` +
      `p95 ${String(r.p95).padStart(5)} ms  p99 ${String(r.p99).padStart(5)} ms  ` +
      `gagal ${r.persenGagal.toFixed(1)}%  [${status}]`,
  );
  for (const c of r.contoh) console.log(`      ${c}`);
}

const pelanggaran = [];
for (const r of ringkas) {
  if (r.persenGagal > MAX_ERROR) {
    pelanggaran.push(`${r.nama}: ${r.persenGagal.toFixed(1)}% gagal (batas ${MAX_ERROR}%)`);
  }
  if (r.p95 > MAX_P95) {
    pelanggaran.push(`${r.nama}: p95 ${r.p95} ms (batas ${MAX_P95} ms)`);
  }
}

console.log('');
if (pelanggaran.length) {
  console.log('UJI BEBAN GAGAL:');
  for (const p of pelanggaran) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(`UJI BEBAN LULUS — batas: gagal ≤ ${MAX_ERROR}%, p95 ≤ ${MAX_P95} ms.`);
