/**
 * fiturGodot.ts — SAKELAR pintu Godot.
 *
 * KENAPA ADA (2026-11-16)
 *   Pemilik menilai keempat mode Godot belum layak dibanding versi DOM:
 *   "hide saja dulu, fokus yg lain". Menghapus tombolnya dari tiga halaman akan
 *   membuang pekerjaan yang sudah jalan (proyek `godot/`, ekspor web, font
 *   subset, panggung Combo). Jadi pintunya DITUTUP, bukan dibongkar:
 *
 *     GODOT_AKTIF = false  → kartu CTA + skrip Godot tidak dirender sama sekali
 *     GODOT_AKTIF = true   → kembali seperti semula, tanpa mengubah satu baris
 *                            markup pun
 *
 * YANG TETAP HIDUP SAAT SAKELAR MATI
 *   • `public/godot/**` dan `godot/**` tetap ada di repo (aset + proyek).
 *   • Rute `/godot/demo.html` tetap bisa dibuka langsung untuk uji internal.
 *   • Empat game DOM tidak terpengaruh — mereka jalur utama.
 *
 * CARA MENYALAKAN LAGI
 *   1. ubah nilai di bawah menjadi `true`
 *   2. `npm run build`
 *   3. bersihkan Cache Storage sekali (paket engine di-cache-first):
 *      `caches.keys().then(k=>Promise.all(k.map(x=>caches.delete(x))))`
 */
export const GODOT_AKTIF = false;
