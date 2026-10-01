/**
 * Skeleton.tsx — primitif kerangka-muat bersama.
 *
 * ── KENAPA ADA ───────────────────────────────────────────────────────────────
 * Sebelum ini ada tiga salinan ad-hoc: `CandidateSkeleton.tsx` (satu halaman
 * penuh), `rirekishoSkeleton()` di dalam `admin/RirekishoBuilder.tsx` (satu
 * lembar A4), dan spinner di delapan permukaan lain yang juga memuat data —
 * `/public` plus tujuh tab `/admin`. Menyalin gaya balok delapan kali berarti
 * delapan tempat yang harus diubah bersama setiap kali gayanya bergeser, dan
 * tujuh di antaranya tidak akan ikut berubah.
 *
 * ── PALET: TOKEN TEMA, DAN KENAPA `rirekishoSkeleton` TIDAK MEMAKAI INI ──────
 * `Bar` memakai token tema (`bg-line-strong`) karena semua pemakainya duduk di
 * permukaan yang ikut tema — panel admin, kartu `/public`, badan halaman.
 * `rirekishoSkeleton` SENGAJA tetap terpisah: lembar CV selalu putih di KEDUA
 * tema karena ia dokumen cetak, jadi ia butuh palet tetap (`slate-200`).
 * Memaksanya memakai token akan melukis balok gelap di atas kertas putih pada
 * mode gelap. Dua kasus, dua jawaban — bukan satu abstraksi yang dipaksakan.
 *
 * ── A11Y ─────────────────────────────────────────────────────────────────────
 * Kontrak yang sama dengan `CandidateSkeleton`: `role="status"` + SATU label
 * `sr-only`, isi dekoratif `aria-hidden`, dan **TIDAK ADA heading** —
 * `e2e/test-headings.mjs` menuntut tepat satu `h1` per halaman.
 *
 * `aria-busy` SENGAJA tidak dipakai. Simpul ini DIGANTI, bukan diperbarui, jadi
 * `aria-busy="true"` tidak akan pernah kembali `false` — dan ia justru
 * MEMERINTAHKAN pembaca layar MENAHAN pengumuman, sehingga satu-satunya teks di
 * sini tidak akan pernah dibacakan. Ditemukan di review, bukan ditebak.
 */
import type { ComponentChildren } from 'preact';
import { t } from '../../store/i18n';

/** Satu balok placeholder. */
export function Bar({ class: cls }: { class?: string }) {
  return <div aria-hidden="true" class={`bg-line-strong rounded-card ${cls ?? ''}`} />;
}

/**
 * Pembungkus kontrak a11y. `labelKey` bisa ditimpa karena beberapa permukaan
 * punya kalimat memuat sendiri (`admin.jadwal_loading`,
 * `admin.loading_candidates`, `ui.memuat_template`) — memakai satu kalimat
 * generik di sana akan menghapus informasi yang sudah ada.
 */
export function Status({ labelKey = 'ui.loading', class: cls, children }: { labelKey?: string; class?: string; children?: ComponentChildren }) {
  return (
    <div role="status" class={cls}>
      <span class="sr-only">{t(labelKey)}</span>
      {children}
    </div>
  );
}

/**
 * N baris tabel kerangka.
 *
 * Dipisah dari `Bar` karena `<tbody>` HANYA menerima `<tr>`/`<td>`: menaruh
 * `<div>` di sana membuat browser memindahkan simpulnya KELUAR dari tabel, dan
 * kerangkanya muncul di tempat yang salah tanpa error apa pun. Karena itu
 * fungsi ini mengembalikan `<tr>`, bukan pembungkus — pemanggilnya menaruhnya
 * langsung sebagai anak `<tbody>`.
 *
 * `widths` = kelas lebar per kolom, supaya kerangka mengikuti lebar kolom tabel
 * yang sebenarnya. Tabel dengan kolom sempit dan kolom lebar akan terlihat
 * salah kalau semua baloknya sama.
 */
export function TableRows({ rows = 5, widths }: { rows?: number; widths: string[] }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        /* `aria-hidden` di sini BENAR, dan `noAriaHiddenOnFocusable` diabaikan
           karena baris ini TIDAK BISA menerima fokus: satu-satunya isinya adalah
           `Bar`, yang juga `aria-hidden` dan bukan kontrol. Aturan itu
           menargetkan elemen yang bisa difokus di dalam subtree tersembunyi —
           tidak ada di sini. Diverifikasi juga dari sisi lain: `e2e:aria-names`
           memakai aturan axe `aria-hidden-focus` dan membaca accessibility tree
           SUNGGUHAN, jadi kalau suatu saat ada kontrol yang menyelinap ke sini,
           gate itulah yang menangkapnya, bukan asumsi ini. */
        // biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative skeleton row; nothing inside it is focusable (only aria-hidden Bars)
        <tr key={r} aria-hidden="true" class="border-b border-slate-800">
          {widths.map((w, c) => (
            <td key={c} class="p-2 align-top">
              <Bar class={w} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
