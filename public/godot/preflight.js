/**
 * preflight.js — kapan menawarkan unduhan paket game SEBELUM dibutuhkan.
 *
 * KENAPA ADA
 *   Tombol "Unduh paket game (offline)" sudah ada di tiga halaman, tetapi siswa
 *   harus tahu sendiri bahwa ia perlu menekannya SEBELUM kehilangan sinyal.
 *   Yang terjadi di lapangan sebaliknya: paket baru diunduh saat halaman gagal
 *   memuat — yaitu saat sudah terlambat. Preflight menawarkan unduhan pada
 *   momen yang tepat: halaman terbuka, sinyal masih bagus, paket belum ada.
 *
 * KENAPA DIPISAH DARI page-bridge.js
 *   Keputusannya murni (tanpa DOM, tanpa cache) supaya bisa diuji sebagai tabel
 *   kebenaran di `e2e/preflight.test.ts`. Logika yang hanya hidup di dalam
 *   handler klik tidak bisa diukur — dan itu persis jenis gerbang yang hijau
 *   tanpa mengukur apa pun.
 *
 * YANG TIDAK DILAKUKAN
 *   • Tidak mengunduh otomatis. 10 MB bukan gratis; tawaran, bukan keputusan.
 *   • Tidak menebak saat API koneksi tidak ada (Safari): `navigator.connection`
 *     absen ⇒ tidak menawarkan apa pun. Menawarkan di jaringan yang tidak
 *     diketahui berarti mengunduh 10 MB di kuota yang mungkin mahal.
 */
(function () {
  'use strict';
  if (window.ASJPreflight) return;

  /** "Nanti" menunda tawaran selama 3 hari — bukan selamanya. */
  var TUNDA_MS = 3 * 24 * 60 * 60 * 1000;

  /**
   * putuskanPreflight — tabel kebenaran tawaran unduhan.
   *
   * @param {{
   *   tersimpan?: boolean,      paket sudah lengkap di Cache Storage
   *   hematData?: boolean,      navigator.connection.saveData
   *   tipe?: string,            navigator.connection.type ('wifi', 'cellular', …)
   *   effectiveType?: string,   'slow-2g' | '2g' | '3g' | '4g'
   *   ditundaSampai?: number,   epoch ms; tawaran ditahan sampai waktu ini
   *   sekarang?: number,        epoch ms (disuntikkan supaya bisa diuji)
   * }} masukan
   * @returns {{ tawarkan: boolean, alasan: string }}
   */
  function putuskanPreflight(masukan) {
    var m = masukan || {};
    var sekarang = Number(m.sekarang) || 0;

    if (m.tersimpan) return { tawarkan: false, alasan: 'sudah-tersimpan' };
    if (m.hematData) return { tawarkan: false, alasan: 'hemat-data' };
    if ((Number(m.ditundaSampai) || 0) > sekarang) return { tawarkan: false, alasan: 'ditunda' };
    if (m.tipe === 'wifi' || m.effectiveType === '4g') {
      return { tawarkan: true, alasan: 'koneksi-bagus' };
    }
    return { tawarkan: false, alasan: 'koneksi-belum-tentu' };
  }

  window.ASJPreflight = { putuskan: putuskanPreflight, TUNDA_MS: TUNDA_MS };
})();
