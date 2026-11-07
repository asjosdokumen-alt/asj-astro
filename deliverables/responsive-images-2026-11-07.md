# Gambar responsif — 2026-11-07

Menutup butir **(a)** dari temuan Lighthouse 2026-10-20
(`deliverables/gstack/lighthouse-2026-10-20.md` §3.5: `uses-responsive-images`
249 KiB). Angka di bawah **diukur ulang hari ini**, bukan disalin dari laporan
itu — dan hasilnya berbeda.

## Cara mengukur (bukan menebak)

Lighthouse tidak terpasang di mesin ini, jadi pengukurannya dilakukan dengan
Playwright pada harness lokal (`npm run serve`), meniru emulasi Lighthouse:
viewport 412×823 · DPR 1,75. Skrip mengelilingi halaman sampai bawah (gambar
`lazy` tidak akan terukur kalau tidak di-scroll — kesalahan pertama saya hari
ini), mencatat **byte yang benar-benar terunduh** per URL, lalu membandingkan
`naturalWidth` dengan lebar gambar × DPR.

| Sebelum | Sesudah |
|---|---|
| 22 gambar · **1.178 KB** | 22 gambar · **918 KB** |

⚠ Angka "sesudah" **diukur** (byte respons). Angka "sebelum" dihitung:
918 KB + 260,3 KB varian yang kini dipakai sebagai ganti berkas penuh — byte
tiap varian diukur dari disk, dan pilihan browser diamati lewat `currentSrc`,
bukan diasumsikan. Yang benar-benar diamati adalah **10 dari 10 varian dipakai**
pada DPR 1,75.

**−260 KB (−22 %)** pada satu kali buka beranda di HP, setelah semua gambar
`lazy` ikut termuat. Pada desktop DPR 2: **tidak berubah** (1.256 KB) — dan itu
memang tujuannya.

## Yang dibuat

| Berkas | Asli | Varian | Hemat |
|---|---|---|---|
| `logo-asj.webp` (256×256) | 28,5 KB | `logo-asj-96.webp` 5,4 KB | **23,1 KB** |
| `fasilitas-gedung` | 103,5 KB | `-700` 52,0 KB | **51,5 KB** |
| `banner-momiji` | 90,6 KB | `-700` 47,1 KB | **43,5 KB** |
| `fasilitas-grup-staf` | 71,0 KB | `-700` 48,5 KB | 22,5 KB |
| `banner-tokyo` | 68,9 KB | `-700` 35,8 KB | 33,1 KB |
| `fasilitas-ruang-tamu-1` | 62,0 KB | `-700` 41,4 KB | 20,6 KB |
| `fasilitas-ruang-tamu-3` | 60,6 KB | `-700` 40,9 KB | 19,7 KB |
| `banner-sakura` | 48,2 KB | `-700` 30,1 KB | 18,1 KB |
| `fasilitas-grup-siswa-1` | 48,2 KB | `-700` 33,1 KB | 15,1 KB |
| `fasilitas-kelas-bahasa-2` | 43,4 KB | `-700` 30,4 KB | 13,0 KB |
| `logo-apply.webp` (300×300) | 35 KB | `logo-apply-200` 16 KB | 19 KB (di `/apply`) |

Semua varian WebP kualitas 78 (logo 82), `effort: 6`, dibuat dengan `sharp`
yang sudah ada di `node_modules`. Berkas asli **tidak dihapus** — ia tetap
kandidat untuk layar 2x ke atas.

## Kenapa `sizes` diukur, bukan dikira

Tile galeri digambar **383 px** di desktop dan **331–352 px** di HP (diukur,
bukan dari kelas Tailwind). Karena itu `sizes="(min-width:1024px) 32vw,
(min-width:640px) 48vw, 88vw"`. Kartu layanan: 40vw / 50vw di desktop, **92vw**
di HP.

⚠ 92vw, bukan 100vw, dan itu bukan kosmetik: pada DPR 1,75 sebuah kartu 412 px
membutuhkan 721 px, sedangkan varian terkecil 700 px — **1 px kurang** membuat
browser membuang varian itu dan mengambil berkas penuh. Dengan 92vw ia memilih
700w. Terverifikasi: pada pengukuran akhir, **10 dari 10 varian dipakai**.

## Gerbang baru

`gallery.test.ts` → `every srcset candidate exists AND declares its real width`:
- setiap URL di `srcSet` harus ada di `public/` (kalau tidak, browser diam-diam
  jatuh ke `src` dan perubahan perf ini tidak melakukan apa pun);
- deskriptor `700w` harus **sama dengan lebar asli berkas** (kalau tidak,
  browser memilih seolah berkasnya lebih kecil dari kenyataan).

Dibuktikan bisa MERAH: mengubah `700w` → `701w` membuat tes gagal dengan
`expected 700 to be 701`, lalu dikembalikan.

## Yang TIDAK dikerjakan, dan alasannya

- **Galeri 800/1000 px tetap dipertahankan.** Sesi 2026-09-30 sengaja
  menurunkannya ke ukuran itu untuk layar 2x (1.021 → 389 KB). Varian 700
  ditambahkan sebagai kandidat tambahan; ia tidak menggantikan berkas 2x.
- **`banner-*` di header (`App.tsx`) tidak disentuh.** Gambar itu diganti saat
  tema berganti lewat `useLayoutEffect` yang menulis atribut `src`; menambah
  `srcset` di sana berarti dua atribut harus disinkronkan, dan penghematannya
  di layar 1x hanya ~18 KB. Risikonya (tema salah gambar) lebih besar dari
  untungnya. Kalau nanti dikerjakan: **`srcset` WAJIB ikut ditulis** di effect
  itu, bukan hanya `src`.
- **`admin.*.css` 207 KB** (naik dari 185 KB) tidak disentuh: satu bundel untuk
  semua permukaan, dan memecahnya berarti memilah ratusan aturan yang dipakai
  bersama — perubahan arsitektural, bukan penghematan gambar.

## Verifikasi
frontend **141 berkas / 1.853 tes** · typecheck 0 · lint-ratchet tanpa
diagnostik baru · `verify:assets` PASS (16 foto punya dasar publikasi) ·
build **19 halaman / 73 aset** · precache SW tetap **128 URL** (varian baru
tidak ikut precache — ia di `dist/assets/`, bukan `dist/_astro/`).
