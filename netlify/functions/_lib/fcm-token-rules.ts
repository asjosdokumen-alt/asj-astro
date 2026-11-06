/**
 * fcm-token-rules.ts — satu-satunya definisi "token ini milik ADMIN".
 *
 * KENAPA BERKAS SENDIRI
 * ---------------------
 * Aturan ini dibaca dua tempat:
 *   1. `_lib/fcm-helpers.ts` → `getAdminTokens()` (untuk MENGIRIM push ke admin);
 *   2. `surfaces/notify.ts`  → `getStatusNotifikasiAdmin` (untuk MENGHITUNG
 *      perangkat admin yang terdaftar).
 *
 * Kalau (2) memanggil `getAdminTokens()`, ia ikut menarik `fcm-helpers` →
 * `fcm-server` ke entry `notify.js` — padahal menghitung baris tidak butuh
 * kemampuan mengirim.
 *
 * Dua salinan aturan yang tidak sepakat lebih buruk daripada satu berkas kecil:
 * kalau batasnya berubah, admin bisa "terdaftar" di satu layar dan tidak di
 * layar lain.
 */

/**
 * Format WA kandidat: `628` + 9–11 digit (total 12–14 digit).
 *
 * Admin memakai nomor lain (nomor kantor, nomor test, atau string `ADMIN`),
 * jadi apa pun yang TIDAK cocok pola ini dianggap admin. Termasuk WA kosong —
 * itu token uji/manual yang tidak terikat kandidat mana pun.
 */
const RE_WA_KANDIDAT = /^628\d{9,11}$/;

export function isAdminWa(wa: unknown): boolean {
  const s = String(wa ?? '').trim();
  return !s || !RE_WA_KANDIDAT.test(s);
}
