/**
 * retensi-notif.ts — Netlify scheduled function: buang notifikasi > 30 hari.
 *
 * KEPUTUSAN PEMILIK 2026-11-08: *"notif di db ya 1 bulan 1x saja"* — simpan
 * sebulan, bersihkan sebulan sekali.
 *
 * KENAPA CRON DAN BUKAN TOMBOL ADMIN
 * ----------------------------------
 * Tidak ada yang perlu diputuskan admin di sini: ini kebijakan retensi, bukan
 * tindakan. Tombol "bersihkan" akan berjalan hanya ketika seseorang ingat, dan
 * yang paling sering lupa adalah orang yang tidak pernah membuka kotak masuk
 * kandidat. Cron juga membuat hasilnya BISA DIAUDIT: satu baris log per bulan.
 *
 * KENAPA TANGGAL 1, 03:00 UTC
 * ---------------------------
 * Satu kali sebulan, di luar jam kerja Indonesia (10:00 WIB) supaya tidak
 * bersaing dengan pemakaian normal, dan pada tanggal yang tidak ambigu
 * ("sebulan sekali" tidak sama dengan "30 hari sekali" — yang bergeser sepanjang
 * tahun).
 *
 * ⚠ JANGAN menganggap fungsi ini "jalan" hanya karena ia ter-deploy. Netlify
 * membaca `export const config` di bawah; kalau jadwalnya hilang, fungsi ini
 * tidak pernah dipanggil dan tidak ada yang error. Gejalanya adalah tabel yang
 * tumbuh pelan-pelan — bukan kegagalan yang terlihat.
 */
import { adapt } from './_lib/netlify-adapter.js';
import { log } from './_lib/kernel/log';
import { hapusNotifikasiKedaluwarsa } from './_lib/notifikasi/kotak-masuk';

/** Umur simpan. Satu bulan, sesuai keputusan pemilik. */
const HARI_SIMPAN = 30;

async function handler() {
  const mulai = Date.now();
  const hasil = await hapusNotifikasiKedaluwarsa(HARI_SIMPAN);
  const durasi = Date.now() - mulai;

  if (hasil.error) {
    log.error('retensi-notif.failed', { err: hasil.error, durasi });
  } else {
    log.info('retensi-notif.complete', { dihapus: hasil.dihapus, batas: hasil.batas, durasi });
  }

  return {
    statusCode: hasil.error ? 500 : 200,
    body: JSON.stringify({ dihapus: hasil.dihapus, batas: hasil.batas, durasi }),
  };
}

// Tanggal 1 setiap bulan, 03:00 UTC. Lihat header: mengubah baris ini adalah
// cara paling mudah menghentikan retensi tanpa ada yang error.
export const config = { schedule: '0 3 1 * *' };

export default adapt(handler);
