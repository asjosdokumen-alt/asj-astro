# Kontras teks hero `/` — sebab yang salah catat, dan tambalannya (2026-10-14)

**Commit:** `2ebeb61` · **Berkas yang berubah:** `src/styles/global.css` (33+/2−) ·
**Artwork TIDAK disentuh.**

## Ringkas

Temuan lama mencatat kontras hero gagal di 390px dan menyimpulkan:

> *"Obatnya scrim — warna teks apa pun tidak bisa lolos karena latar mobile berluminans
> tinggi ⇒ **menyentuh artwork pemilik** ⇒ keputusan desain, **belum ditambal**."*

Premis itu **salah**, dan salahnya penting: ia menahan perbaikan ini sebagai
"keputusan desain pemilik" padahal tidak ada artwork yang perlu diubah.
Latarnya adalah **`.header-overlay` — gradien CSS yang memang sudah ada untuk
pekerjaan ini**. `hero-sakura.avif` tetap `opacity-60`, tidak tersentuh.

## Sebab sebenarnya: dua scrim, dua arah, satu kelas bug

Kedua gradien scrim berakhir `transparent`, jadi keduanya hanya benar selama
**semua** teks kebetulan berada di sisi yang digelapkan:

| breakpoint | gradien lama | kenapa gagal |
|---|---|---|
| < 1024px | `to top, .95 0%, .4 50%, transparent 100%` | Blok konten `items-end`: di 1440px ia satu baris pendek di **dasar** band (dalam zona gelap). Di 390px blok itu **tumbuh ke atas** — eyebrow mendarat di y≈226 dari band 900px, tempat scrim tinggal **≈0,2**. |
| ≥ 1024px | `to right, .85 0%, .5 45%, transparent 82%` | Kiri digelapkan karena copy ada di kiri — tapi strip statistik ada di `lg:col-span-5` (**kanan**), tempat gradiennya sudah `transparent 82%`. |

## Angka (piksel glyph, lantai WCAG AA)

Metode: potret elemen **dua kali** — dengan tinta, lalu `color:transparent`
sebagai latar — dan **hanya piksel yang tertutup PENUH oleh tinta murni** yang
dihitung.

| kasus | sebelum | sesudah | lantai |
|---|---|---|---|
| 390 dark · eyebrow "PT AMANAH SAKURA JAPAN" 11px | 2,60 | **5,59** | 4,5 |
| 390 light · eyebrow 11px | 2,53 | **5,08** | 4,5 |
| 390 light · `profile.hero_sub` 16px | 3,93 | lulus | 4,5 |
| 768 dark / light · eyebrow 11px | 3,45 / 3,64 | **6,36 / 6,52** | 4,5 |
| 1440 dark · "2023" 30px (teks besar) | 2,71 | **4,21** | 3,0 |
| 1280 light · h1 70px (alat repo) | 2,80 | **3,36** | 3,0 |

Perubahan: `to top, rgba(0,0,0,.95) 0%, .66 45%, .46 100%` ·
`to right, .85 0%, .60 45%, .30 100%` — **ujung `transparent` dihapus**.

## ⚠️ Yang terlihat berubah

Hero jadi **lebih gelap** di sisi yang sebelumnya transparan: paling terasa di
**kanan pada desktop** dan di **atas pada mobile**. Itu harga agar teksnya lolos
di **semua** lebar, bukan hanya di satu lebar yang kebetulan diukur. Kalau ingin
lebih terang, yang disetel adalah tiga angka di `.header-overlay` — dan angkanya
harus diukur ulang di 390px, bukan dikira-kira.

## Bukti

- `hero-390-light-eyebrow-{before,after}.png`
- `hero-390-light-h1-{before,after}.png`
- `hero-1440-dark-stat-{before,after}.png`

"Before" dihasilkan dengan **menyuntikkan gradien lama**, bukan dari pohon lain —
jadi bedanya benar-benar scrim-nya.

## Dua jebakan yang layak diingat

1. 🔴 **"Piksel terburuk" memberi POSITIF PALSU.** Versi pertama probe menghitung
   minimum atas semua piksel glyph — termasuk **tepi antialias**, yang merupakan
   campuran tinta+latar dan selalu menarik minimum ke bawah. Akibatnya tombol
   `bg-white/10` yang **jelas terbaca** (potongan gambarnya diperiksa mata)
   terbaca **1,79:1**. Setelah hanya piksel tertutup penuh yang dihitung,
   positif palsunya hilang. **Angka kontras tanpa potongan gambar = angka yang
   belum dipercaya.**
2. 🪤 **Alat milik repo menemukan yang probe saya lewatkan.** `e2e/measure-hero-contrast.mjs`
   memerahkan **h1 di light 1280px (2,80:1, 4 dari 11.193 sampel)** — lebar yang
   tidak saya ukur, dengan aturan "latar TERTERANG" yang lebih ketat daripada
   pasangan per-piksel saya. Jalankan alat repo, jangan hanya probe sendiri.

## Kenapa gate biasa tidak pernah melihat ini

`e2e/test-contrast.mjs` melaporkan **0 di bawah lantai** — dan itu benar, karena
ia melewati **701 elemen** sebagai *"text over background-image (gradient/image)"*
dan menyebutnya sendiri: *"unmeasurable (skipped, **NOT a pass**)"*. Kelas itulah
yang menyembunyikan temuan ini selama ini.
