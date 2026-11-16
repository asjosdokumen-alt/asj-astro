/**
 * hurufBesarModal.ts — penulisan manual di dalam modal otomatis HURUF BESAR.
 *
 * KENAPA DI SINI, BUKAN DI 91 INPUT
 *   Ada 91 `<input>` di komponen admin/kandidat. Menambahkan `onInput` satu per
 *   satu berarti 91 kesempatan untuk lupa, dan input baru otomatis tidak ikut.
 *   Satu listener di dokumen menangkap SEMUA modal yang dirender di dalam App.
 *
 * KAPAN DIUBAH: SAAT BLUR, BUKAN SAAT MENGETIK
 *   Mengubah nilai di tengah ketikan memindahkan caret ke ujung setiap huruf —
 *   mustahil dipakai. `focusout` (blur) adalah momen yang benar: nilai sudah
 *   selesai diketik, dan `input` event yang dipancarkan ulang membuat state
 *   Preact ikut menyimpan versi besar.
 *
 * YANG TIDAK DISENTUH
 *   email, password, url, number, tanggal/waktu, file, checkbox/radio/range,
 *   dan `select`. Huruf besar pada email/password bukan gaya, melainkan bug:
 *   password peka huruf, dan email besar tidak lagi cocok dengan yang diketik
 *   pengguna di tempat lain. Elemen bisa memilih keluar lewat
 *   `data-tanpa-huruf-besar`.
 */

/** Tipe input yang nilainya masuk akal dijadikan huruf besar. */
const TIPE_TEKS = new Set(['text', 'search', 'tel', '']);

function bolehDibesarkan(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  if (el.hasAttribute('data-tanpa-huruf-besar')) return false;
  if (!el.closest('[role="dialog"]')) return false;

  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return TIPE_TEKS.has((el.getAttribute('type') || '').toLowerCase());
}

/**
 * Besarkan nilai satu elemen. Mengembalikan `true` bila nilainya berubah.
 * Dipisah dari listener supaya bisa diuji tanpa event.
 */
export function besarkanNilai(el: Element): boolean {
  if (!bolehDibesarkan(el)) return false;
  if (el.value === el.value.toUpperCase()) return false;
  el.value = el.value.toUpperCase();
  /* State Preact hanya ikut bila event ini dipancarkan: `el.value = …` tidak
     memberi tahu siapa pun. Tanpa baris ini, layar menampilkan huruf besar
     tetapi yang tersimpan masih huruf kecil. */
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * Pasang listener `focusout` (capture) di dokumen. Idempoten: aman dipanggil
 * berkali-kali. Mengembalikan fungsi pembersih.
 */
export function pasangHurufBesarModal(doc: Document = document): () => void {
  const onFocusOut = (e: Event) => {
    const target = e.target;
    if (target instanceof Element) besarkanNilai(target);
  };
  doc.addEventListener('focusout', onFocusOut, true);
  return () => doc.removeEventListener('focusout', onFocusOut, true);
}
