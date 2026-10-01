/**
 * CandidateSkeleton.tsx — bentuk halaman `/candidate` selama datanya dimuat.
 *
 * ── APA YANG DIGANTIKAN, DAN KENAPA ──────────────────────────────────────────
 * Sampai 2026-10-01 keadaan `loading` hanyalah satu ikon `spinner` yang berputar
 * plus kata "Memuat...". Itu benar secara fungsional dan salah secara persepsi:
 * halaman terlihat KOSONG sampai data tiba, lalu SELURUH tata letak muncul
 * sekaligus. Skeleton memberi tahu bentuk halaman sebelum isinya ada, sehingga
 * peralihannya tidak terasa seperti berpindah halaman.
 *
 * ── BENTUKNYA DIUKUR, BUKAN DIKARANG ─────────────────────────────────────────
 * Setiap blok di bawah memetakan satu blok NYATA di `CandidateDash.tsx`, dan
 * urutannya sama supaya peralihan tidak menggeser apa pun yang sudah terbaca.
 * Tinggi targetnya diambil dari pengukuran `getBoundingClientRect()` atas halaman
 * yang sudah dimuat (fixture sesi penuh, 1280 px / 390 px):
 *
 *   blok                desktop   ponsel
 *   dossier (section)     582       873
 *   sapaan (h2)            48        48
 *   kartu siswa VIP       256       224   ← DATA-KONDISIONAL, sengaja dilewati
 *   Kelengkapan           263       293
 *   Jadwalmu              192       184
 *   Status Lamaran        526       584
 *   Berkas                224       212
 *   tautan "Lihat Loker"   46        46
 *   rail: pesan admin      94        86
 *   rail: 7 aksi          394       394
 *
 * ⚠ KARTU SISWA VIP SENGAJA TIDAK DIMIRROR. Ia hanya ada bila `isVIP`, dan
 * skeleton TIDAK BISA tahu itu — datanya justru yang sedang ditunggu. Menaruh
 * placeholder di sana akan berbohong kepada mayoritas kandidat non-VIP; tidak
 * menaruhnya berarti kandidat VIP melihat satu blok muncul. Keduanya pilihan
 * sadar, dan yang kedua dipilih karena lebih sedikit orang yang terkena.
 * Konsekuensinya: skeleton ~250 px lebih pendek dari halaman VIP.
 *
 * ── KENAPA TIDAK BERGERAK ───────────────────────────────────────────────────
 * Itu keputusan, bukan kelalaian. `DESIGN.md` P7 membatasi gerak ke
 * `opacity` + `transform`; ronde review r2 (temuan F5) SENGAJA mencabut ketiga
 * `animate-pulse` dari berkas tetangga karena §1.2 menolak kinetic typography
 * dan §6.5 melarang gerak pada apa pun yang MENGANDUNG MAKNA. Skeleton tidak
 * mengandung makna apa pun — ia justru ketiadaan isi — jadi denyut `opacity`
 * sebenarnya sah di sini. Tetapi statis menghapus seluruh pertanyaan itu.
 *   Kalau pemilik ingin denyut: tambahkan `animate-pulse` pada `Bar` di bawah.
 *   Satu kata, dan `motion.css:1719-1723` SUDAH mematikannya sendiri saat
 *   `prefers-reduced-motion: reduce` — jadi tidak ada pekerjaan a11y tambahan.
 *
 * ── A11Y, DAN DUA HAL YANG TIDAK BOLEH DILANGGAR ────────────────────────────
 * Wadahnya `role="status"` dengan SATU teks `sr-only`, dan seluruh blok
 * dekoratif `aria-hidden="true"` supaya pembaca layar tidak dibacakan puluhan
 * `div` kosong.
 *
 * `aria-busy="true"` SENGAJA TIDAK DIPAKAI, dan itu hasil review. Alasannya dua:
 * simpul ini DIGANTI, bukan diperbarui, jadi `aria-busy` tidak pernah kembali ke
 * `false` — ia berakhir sebagai pernyataan yang tidak pernah selesai; dan
 * `aria-busy` justru MEMERINTAHKAN pembaca layar MENAHAN pengumuman, sehingga
 * satu-satunya teks di sini tidak akan pernah dibacakan. Batas yang jujur:
 * `role="status"` yang lahir sudah berisi teks juga umumnya tidak diumumkan,
 * jadi pengumuman "Memuat…" TIDAK DIJAMIN. Yang dijamin adalah kebalikannya —
 * tidak ada heading, tidak ada progressbar, dan tidak ada puluhan div kosong
 * yang bocor ke accessibility tree.
 *
 *   1. TIDAK ADA HEADING DI SINI — tidak satu pun, bahkan tersembunyi.
 *      `e2e/test-headings.mjs` menuntut TEPAT satu `h1` per halaman, dan `h1`
 *      rute ini dipegang `FormToolbar`. `Bar` adalah `div` biasa.
 *   2. TIDAK ADA `role="progressbar"` DI SINI. `CandidateDash.test.tsx` membaca
 *      `document.querySelector('[role="progressbar"]')` — elemen PERTAMA — dan
 *      menuntut `aria-valuenow` = kelengkapan profil, yaitu milik `LevelCard`.
 *      Skeleton yang ikut memasang progressbar akan membuat asersi itu membaca
 *      angka yang salah: LULUS dengan makna berbeda, yang lebih buruk daripada
 *      gagal.
 */
import { t } from '../../store/i18n';

/**
 * Satu balok placeholder. `rounded-card` sebagai default, bukan `rounded-pill`,
 * karena mayoritas balok di halaman ini adalah badan kartu dan baris teks —
 * dan radius yang seragam membuat kerangkanya terbaca sebagai satu sistem,
 * bukan kumpulan kotak acak.
 */
function Bar({ class: cls }: { class?: string }) {
  return <div aria-hidden="true" class={`bg-line-strong rounded-card ${cls ?? ''}`} />;
}

export default function CandidateSkeleton() {
  return (
    <div
      data-testid="candidate-skeleton"
      role="status"
      class="text-left"
    >
      <span class="sr-only">{t('ui.loading')}</span>

      {/* ── Kartu dossier — header identitas, DI LUAR grid ──
          Lebarnya WAJIB sama dengan `AsjDossierCard.tsx:145`. Sampai
          2026-10-01 keduanya memakai `max-w-4xl mx-auto`: 896 px di tengah
          sementara grid di bawahnya 1233 px, tepi kiri berbeda 169 px — temuan
          F12. Keduanya sekarang selebar `main`. Kalau salah satu diubah tanpa
          yang lain, skeleton akan menimbulkan lompatan LEBAR yang justru ingin
          dihilangkannya, jadi dua tempat ini harus bergerak bersama. */}
      <section class="rounded-panel bg-surface-raised border border-line-strong p-5 md:p-6 mb-6 md:mb-8">
        <div aria-hidden="true">
          {/* Header: logo + dua baris brand, satu ikon di kanan. */}
          <div class="flex items-center justify-between gap-3 pb-4 mb-6 border-b border-line">
            <div class="flex items-center gap-4 min-w-0">
              <Bar class="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-control" />
              <div class="min-w-0">
                <Bar class="h-4 w-32" />
                <Bar class="h-3 w-20 mt-1.5" />
              </div>
            </div>
            <Bar class="w-7 h-7 shrink-0 rounded-pill" />
          </div>

          {/* Badan: foto 128x160 + kolom identitas. */}
          <div class="flex flex-col md:flex-row gap-6 mb-6">
            <div class="w-full md:w-1/3 flex flex-col items-center gap-3">
              <Bar class="w-32 h-40 shrink-0" />
              <Bar class="h-7 w-40 rounded-pill" />
              <Bar class="h-12 w-full rounded-control" />
            </div>
            <div class="w-full md:w-2/3 space-y-4 min-w-0">
              <Bar class="h-7 w-2/3" />
              <Bar class="h-5 w-28 rounded-pill" />
              <Bar class="h-4 w-32" />
              <div class="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-b border-line py-4">
                <Bar class="h-9 w-full" />
                <Bar class="h-9 w-full" />
                <Bar class="h-9 w-full" />
                <Bar class="h-9 w-full" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <Bar class="h-11 w-full" />
                <Bar class="h-11 w-full" />
              </div>
            </div>
          </div>

          {/* Kotak catatan di kaki kartu. */}
          <Bar class="h-24 w-full" />
        </div>
      </section>

      {/* ── Grid: kolom utama + rail kanan (§4.3) ──
          Kelas grid disalin dari `CandidateDash.tsx:521` supaya titik pindah
          kolom (xl, 1280 px) terjadi pada lebar yang sama. */}
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        {/* Kolom utama — urutan sama dengan CandidateDash */}
        <div class="min-w-0 flex flex-col" aria-hidden="true">
          {/* Sapaan (`h2` di halaman asli): judul + subjudul. */}
          <div class="mb-6 md:mb-8">
            <Bar class="h-6 md:h-7 w-2/3" />
            <Bar class="h-3 w-1/3 mt-2" />
          </div>

          {/* Kelengkapan: judul + SATU meter bersegmen + legenda + panduan. */}
          <div class="mb-6 md:mb-8 bg-surface-raised border border-line rounded-panel p-5 md:p-6">
            <Bar class="h-5 w-44" />
            <Bar class="h-2.5 w-full mt-5 rounded-pill" />
            <div class="flex flex-wrap gap-4 mt-4">
              <Bar class="h-3 w-24" />
              <Bar class="h-3 w-24" />
              <Bar class="h-3 w-24" />
            </div>
            <Bar class="h-4 w-3/4 mt-5" />
            <Bar class="h-6 w-2/3 mt-3" />
          </div>

          {/* Jadwalmu: judul + satu kartu jadwal. */}
          <div class="mb-6 md:mb-8 bg-surface-raised border border-line rounded-panel p-5 md:p-6">
            <Bar class="h-5 w-32" />
            <Bar class="h-20 w-full mt-4" />
          </div>

          {/* Status Lamaran Terkini: judul + deskripsi + pil loker + daftar
              lamaran. Dua entri, bukan satu — fixture terukur memuat lebih dari
              satu, dan menyediakan ruang untuk yang kedua berarti tidak ada
              lompatan saat entri kedua muncul. */}
          <div class="mb-6 md:mb-8 bg-surface-raised border border-line rounded-panel p-5 md:p-6">
            <Bar class="h-5 w-52" />
            <Bar class="h-3 w-3/4 mt-3" />
            <Bar class="h-8 w-40 mt-4 rounded-pill" />
            <Bar class="h-36 w-full mt-4" />
            <Bar class="h-36 w-full mt-3" />
          </div>

          {/* Berkas: judul + ringkasan + daftar dokumen + CTA utama + catatan. */}
          <div class="mb-6 md:mb-8 bg-surface-raised border border-line rounded-panel p-5 md:p-6">
            <Bar class="h-5 w-40" />
            <Bar class="h-3 w-1/2 mt-3" />
            <Bar class="h-24 w-full mt-4" />
            <Bar class="h-12 w-full mt-4 rounded-panel" />
            <Bar class="h-4 w-2/3 mt-4" />
          </div>

          {/* Tautan "Lihat Loker Publik" — selebar kolom. */}
          <Bar class="h-11 w-full rounded-control mb-6 md:mb-8" />
        </div>

        {/* Rail kanan: satu kartu kontekstual + tujuh aksi. */}
        <aside class="min-w-0 flex flex-col" aria-hidden="true">
          <div class="mb-6 md:mb-8 bg-surface-raised border border-line rounded-panel p-5 md:p-6">
            <Bar class="h-5 w-36" />
            <Bar class="h-14 w-full mt-4" />
          </div>
          <div class="u-grid-auto u-grid-auto--cards gap-3">
            {Array.from({ length: 7 }, (_, i) => (
              <Bar key={i} class="h-11 w-full rounded-control" />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
