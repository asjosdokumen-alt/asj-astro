// ==========================================
// navigate.ts — SATU-SATUNYA tempat yang menulis `window.location.href`.
//
// Kenapa modul ini ada (terukur 2026-10-20, jsdom 30.0.1 + vitest 4.1.11):
//
//   Object.getOwnPropertyDescriptor(window, 'location')
//     → { configurable: false, get: [Function], set: undefined }
//
// `location` ditandai `[LegacyUnforgeable]` di spesifikasi HTML, dan jsdom
// modern menegakkannya: `Object.defineProperty(window, 'location', …)` DAN
// `delete window.location` keduanya melempar. Bahkan properti `href` di
// instance Location ikut terkunci ("Cannot redefine property: href"), dan
// `globalThis.window` sendiri non-configurable — jadi TIDAK ADA cara menukar
// `window.location` dari dalam tes.
//
// Akibatnya, setiap tes yang ingin MEMBUKTIKAN sebuah redirect (bukan hanya
// menebaknya) harus punya satu jahitan yang bisa di-mock, dan itulah modul
// ini. Sebelumnya dua berkas tes mencoba menipu `window.location` langsung
// dan gagal dengan `TypeError: Cannot redefine property: location` — 38 tes
// merah, padahal produknya benar.
//
// ATURAN PAKAI: komponen TIDAK BOLEH menulis `window.location.href` lagi.
// Panggil `navigateTo(...)`. Dengan begitu redirect bisa diuji dengan
// `vi.mock('../../lib/navigate')` + `expect(navigateTo).toHaveBeenCalledWith(...)`,
// dan satu-satunya penulisan sungguhan tetap di sini.
// ==========================================

/**
 * Pindah halaman ke `href`.
 *
 * Sengaja TIDAK pakai `location.assign` / `location.replace`: keduanya tidak
 * bisa di-interceptor oleh tes mana pun (juga unforgeable), sehingga tidak
 * menambah apa pun dibanding penulisan `.href` biasa.
 */
export function navigateTo(href: string): void {
  window.location.href = href;
}
