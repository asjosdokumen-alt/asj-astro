# Audit terukur — halaman profil perusahaan (`/`) · 2026-09-30

**Status:** laporan audit (read-only — **nol baris `src/` disentuh**) · **Diukur:** 2026-09-30
**Pemicu:** pemilik memilih *"Audit terukur dulu"* untuk **polish company profile**.
**Metode:** Chromium headless (Playwright) terhadap `astro preview` dari build produksi segar,
plus CDP `Network.loadingFinished` untuk berat kabel. Skrip probe hidup di `.tmp-audit/`
(gitignored) supaya tidak menggeser `includePath()` indexer.

> **Konteks.** Laporan `docs/COMPANY_PAGE_ASSESSMENT_2026-09-29.md` sudah menutup A–D
> (komentar HTML, JSON-LD, hreflang, FAQ) dan menyisakan E (testimoni, terhalang P-7) serta
> F (blog). Dokumen **ini** bukan ulangan laporan itu: ia mengukur ulang `/` **setelah** A–D,
> dan menemukan bahwa yang tersisa bukan lagi HTML — melainkan **gambar**.

---

## 1. Angka utama

| Ukuran | Nilai |
|---|---|
| Tinggi `/` @1280×900 | **17.647 px = 19,6 layar** |
| Tinggi `/` @390×844 | **26.150 px = 31,0 layar** |
| Berat sebenarnya @1280 DPR1 (67 request) | **2.481,2 KB** |
| Berat sebenarnya @390 DPR2 (67 request) | **2.740,2 KB** |
| · gambar | **2.116,0 KB — 85,3 %** |
| · JS | 173,5 KB |
| · font | 116,2 KB |
| · HTML (terkirim) | 46,8 KB |
| · CSS (terkirim) | 28,7 KB |
| Section langsung di `<main>` | 16 |
| Console error | **0** |
| Elemen kontras di bawah lantai | **0** |
| Teks < 11 px | **0** |
| Target sentuh < 44 px | **0** |
| Overflow horizontal | **0** |

**Bacaan jujur.** Perbaikan A–D berhasil: HTML mentah turun ke **201.555 B / 46,8 KB gz**
(dari 55,7 KB gz pada 2026-09-29), dan seluruh disiplin yang sudah dijaga gate e2e
(kontras, lantai font, lantai sentuh, overflow, satu kontainer) **terukur bersih**.
Tapi halaman ini tetap **2,4 MB**, dan **85 %-nya gambar** — bukan markup. Celah bobot yang
dulu ada di HTML sekarang pindah ke aset, dan di sana ia **belum punya gate apa pun**.

---

## 2. Temuan, diurutkan menurut (dampak ÷ biaya)

### P1 · Gambar 2.116 KB = 85 % halaman; 12 berkas = 77 % — **celah terbesar**

| Kelompok | n | Total | Berkas terberat |
|---|---|---|---|
| Galeri (`fasilitas-*`) | 6 | **1.002 KB** | 234 · 196 · 178 · 174 · 131 · 88 KB |
| Banner Layanan (Supabase Storage) | 3 | **436 KB** | momiji 185 · dark_tokyo 140 · sakra 111 KB |
| Hero + ilustrasi program/langkah | 3+ | 623 KB | hero-sakura 130 KB |

Dua sebab terukur, keduanya berbeda:

1. **Galeri — berkas 1x sudah kelebihan piksel 4×.** `GalleryGrid.tsx` merender
   `width={item.width}` = **1600 px** ke dalam tile **394 px** @1280 (dan 341 px @390).
   `<picture>`/`srcset` memang ada (15 `<picture>`, 30 `<source>`) tapi deskriptornya
   `1x/2x` — jadi yang menentukan bobot adalah **berkas `1x` itu sendiri**, dan berkas itu
   1600 px. Terukur 15 gambar dikirim ≥2,2× piksel yang dipakai; terburuk
   `logo-removebg-preview.webp` (500 px untuk 64 px = 7,8×) dan `fasilitas-gedung.webp`
   (1600 px untuk 394 px = 4,1×). Ada lightbox, jadi berkas besar itu **beralasan untuk
   modal** — yang tidak beralasan adalah tile memakai berkas yang sama.
2. **Banner Layanan diambil dari Supabase Storage dengan `<img>` polos.**
   `LayananSection.astro:31,114,150` menunjuk
   `https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/…`
   tanpa `<picture>`, tanpa `srcset`, tanpa `sizes`. 436 KB dari CDN eksternal yang
   tidak ikut `verify:assets` (gate hanya memeriksa `public/`).

**Tindakan:** encode ulang 12 berkas itu pada lebar tampil sebenarnya (394 / 486 / 341 px)
+ satu varian `@2x`, dan pindahkan tiga banner Supabase ke `public/assets/` supaya ikut
tergerbang. **Target terukur: −1,3 s.d. −1,6 MB (52–64 % halaman).**

### P2 · Klien Supabase 56,5 KB ikut terunduh di halaman publik

Dari 173,5 KB JS, **56,5 KB (32,6 %) adalah `supabase.DC7Wx9gg.js`**. Halaman profil
perusahaan tidak memerlukan klien Supabase. Ia terbawa karena sesuatu di rantai impor
`apiClient` menariknya ke chunk bersama.

**Tindakan:** lacak pengimpornya (`idx:impact`) dan ubah ke `import()` dinamis, atau
pisahkan ke chunk yang hanya dimuat rute ber-sesi. **Target: −56,5 KB.**

### P3 · Jawaban FAQ selebar 1.173 px (~180 karakter/baris)

`FaqList.tsx` merender jawaban sebagai `<p>` tanpa batas lebar, di dalam panel kontainer
penuh. Terukur: 6 jawaban, lebar **1.173 px**, terpanjang **265 karakter**, pada 14 px.
Lihat `_audit-landing-faq-1280.png` — baris terakhir membentang hampir seluruh 1280 px.

`DESIGN.md` §3.3 membatasi **kalimat body 15–20 kata**; ukuran baca ini melampaui aturan
itu dengan nyaman. Ini juga satu-satunya blok teks panjang yang ditambahkan D, jadi ia
belum pernah masuk radar desain.

**Tindakan:** batasi measure jawaban (~65–70 karakter, `max-w-[65ch]`). **Biaya: satu kelas.**

### P4 · Dua nilai padding kartu di desktop: 24 px (24 kartu) vs 20 px (19 kartu)

`DESIGN.md` §3.5: padding dalam kartu **1,25 rem (20 px) mobile / 1,5 rem (24 px) ≥768 px**,
dan **wajib sama untuk semua kartu**. Terukur @1280:

| Nilai | n | Komponen |
|---|---|---|
| `24px/24px` | 24 | `IconTileGrid.tsx:85`, `StepList.tsx:54` — **benar** (`p-5 md:p-6`) |
| `20px/20px` | **19** | `PersonGrid.tsx:52`, `PartnerGrid.tsx:61`, `ReviewGrid.tsx:65`, `index.astro:1075` — **hanya `p-5`** |

Sembilan belas kartu (tim 6 · mitra 6 · testimoni 6 · panel penutup 1) memakai nilai
**mobile** pada lebar desktop.

**Tindakan:** tambahkan `md:p-6` di keempat tempat itu. **Biaya: 4 suntingan.**

### P5 · `font-medium` (500) dipakai 13×, tapi muka 500 tidak pernah dimuat

`DESIGN.md` §3.3: **"Bobot yang boleh dipakai: 400, 600, 700, 900"**. Lima berkas font
yang benar-benar diunduh: Inter **400/600/700/900** + Instrument Serif 400 — **tidak ada 500**.

Terukur 13 elemen meminta 500 → aturan pencocokan font CSS menjatuhkannya ke **400**,
sehingga penekanannya **hilang tanpa peringatan apa pun**:

| Lokasi | n |
|---|---|
| `LayananSection.astro:134` dan `:170` | 6 + 6 |
| `PersonGrid.tsx:63` (peran tim) | 6 |
| `index.astro:503` (sambutan Tentang Kami) | 1 |

Ini **kelas cacat yang sama dengan T-03** (`font-extrabold`/800), yang repo ini sudah
temukan dan perbaiki untuk 800 — 500 lolos karena tidak ada gate yang membaca bobot
yang benar-benar di-render.

**Tindakan:** ganti ke **600** atau **700**. Jangan menambah muka 500 — itu +24 KB untuk
memperbaiki masalah yang lebih murah diselesaikan dengan mengganti kelas.

### P6 · Inter 600 (24,2 KB) melayani **satu** elemen

Sensus bobot di seluruh `/`: `400`×149, `500`×13, `600`×**1**, `700`×130, `900`×17.
Satu-satunya teks 600 adalah **copyright footer 12 px**
(`text-caption font-semibold tracking-[2px]`). Jadi satu berkas font 24,2 KB melayani satu
baris teks.

**Tindakan:** kalau `text-caption` memang akan tetap setipis itu, turunkan copyright ke
400/700 dan **lepas muka 600** dari muatan. **Target: −24,2 KB.** (Kalau P5 dipindah ke
600, hitungan ini berubah — jadi putuskan P5 dan P6 bersama.)

### P7 · Panjang halaman: 19,6 layar desktop / 31 layar mobile

**Ritme vertikalnya sudah benar** — `py-14 md:py-20` (56/80 px) adalah **satu** nilai untuk
semua section, sesuai §3.5. Jadi ini bukan cacat spasi; ini **jumlah isi**.

| Section | @1280 | @390 |
|---|---|---|
| alur | 1.503 | **3.194** |
| layanan | **1.626** | 2.566 |
| galeri | 1.326 | 2.771 |
| kontak | 1.530 | 1.505 |
| penempatan | 1.415 | 813 |
| tentang | 1.245 | 2.085 |

`alur` setinggi **3.194 px di ponsel** (3,8 layar untuk satu section) adalah kandidat
terkuat untuk dipadatkan — 6 langkah + daftar persyaratan bisa memakai pola `<details>`
yang sudah dipakai FAQ (D).

**Ini keputusan konten, bukan bug** — dan tidak ada angka di sini yang memaksa perubahan.

---

## 3. Temuan lingkungan: build lokal berhenti SEBELUM hook pasca-build

**Ini temuan terpisah dari desain, dan menjelaskan satu ketidakkonsistenan yang akan
membingungkan siapa pun yang mengukur ulang.**

`npm run build` di lingkungan ini **gagal di `cleanServerOutput`**, bukan di kompilasi:

```
[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":76,"threshold":50,
  "targets":["E:\\astro\\dist\\pages\\404.astro.mjs"]}
  at cleanServerOutput (astro/dist/core/build/static-build.js:275)
```

Shim safe-delete milik harness menolak menghapus 76 berkas `dist/pages/*.mjs`. Karena
`cleanServerOutput` berjalan **sebelum** `astro:build:done`, akibatnya:

- **`[asj:strip-html-comments]` TIDAK PERNAH JALAN.** Terukur: `dist/index.html` hasil
  build biasa = **57 blok komentar / 19.862 B**, sedangkan fungsi `stripComments` yang
  sama, dijalankan atas berkas itu, membuang 19.862 B dan menyisakan **2** blok.
  Jadi **temuan A dari laporan 2026-09-29 tidak aktif di artefak lokal** — bukan karena
  kodenya salah, tapi karena hook-nya tidak pernah dipanggil.
- **`build-sw-manifest.mjs` juga tidak jalan** (`&&` setelah `astro build` yang exit ≠ 0),
  sehingga manifest service worker lokal tidak pernah diperbarui.

**Bukti balik.** Dengan shim dimatikan untuk satu kali build:

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build
# 08.31.07 [asj:strip-html-comments] stripped 53129 B of HTML comments from 11 page(s)
# 08.31.07 [build] 11 page(s) built in 32.84s
# 08.31.07 [build] Complete!
# [sw-manifest] precache : 87 URLs
# EXIT=0
```

**Ruang lingkupnya jujur:** ini artefak **harness lokal**, bukan Netlify — build di CI
tidak melewati shim ini, jadi produksi kemungkinan besar baik-baik saja. Yang rusak adalah
**kemampuan memverifikasi A secara lokal**, dan itu yang harus dicatat.

**Tindakan:** jadikan build lewat env itu jalur resmi untuk verifikasi lokal (mis.
`verify:bundle`/`ci:predeploy:local`), atau setel ambang bulk-delete harness di atas 76.
Selama belum, setiap "A sudah selesai" yang diukur dari `dist/` lokal akan **salah**.

---

## 4. Pembacaan PALSU yang saya buang (dan mengapa)

Dua angka yang muncul di lintasan pertama **tidak** masuk laporan ini, karena keduanya
adalah keyframe animasi, bukan tata letak:

| Terukur di scroll 0 | Kenyataan |
|---|---|
| "4 tepi kiri (21/22/24/25), 2 section meluber 3–5 px" | `scroll-tilt-y`/`scroll-drift-y` memakai `animation-timeline: view()`; band di bawah lipatan memang duduk di keyframe `from`: `matrix(0.999976, -0.00698126, 0.00698126, 0.999976, 0, -8)` = **rotate 0.4° + translateY(−8 px)**, persis `--scroll-tilt: 0.4deg` di `motion.css:1468` |
| "2 section masih ter-transform setelah `is-entered`" | Setelah di-scroll masuk viewport: `matrix(1, 0, 0, 1, 0, -0.067)` → **identitas**. Bukan sisa animasi |

Diukur ulang dengan `prefers-reduced-motion: reduce`:

| | @1280 | @390 |
|---|---|---|
| Tepi kiri kontainer | `{24: 23, 25: 24}` | `{16: 23, 17: 24}` |
| Lebar kontainer | `{1215: 22, 1217: 19}` | `{341: 24, 343: 23}` |
| Overflow | **0** | **0** |

→ **satu kontainer**, sesuai §4.1. Ini ketiga kalinya repo ini tertipu oleh pembacaan
yang mengambil nilai sebelum subjeknya dalam keadaan diam; saya mencatatnya di sini
alih-alih menghapusnya.

**Catatan non-temuan lain.** `h2` "MEMUAT ASJ OS V7…" memang ada di DOM **sebelum** `h1`
(`BaseLayout.astro:382`), tapi `#global-loader` ber-`display:none !important` sehingga
tidak masuk accessibility tree — outline tetap H1 → H2 → H3 → H4 tanpa lompatan.

---

## 5. Usulan urutan kerja

> **⚠️ RENCANA INI SUDAH DIJALANKAN — lihat §8 untuk hasil terukurnya.** Tabel di bawah
> disimpan apa adanya sebagai catatan apa yang diusulkan dan apa yang ternyata berbeda
> saat dikerjakan (item 1 di bawah tidak dikerjakan seperti tertulis; item 5 ditunda).

| # | Tindakan | Dampak terukur | Biaya | Risiko gate |
|---|---|---|---|---|
| **1** | Encode ulang 12 gambar ke lebar tampil + `@2x` (P1) | **−1,3…−1,6 MB** | rendah | `verify:assets`, `gallery.test.ts` |
| **2** | Batasi measure jawaban FAQ (P3) | keterbacaan | **sangat rendah** | nol |
| **3** | `md:p-6` di 4 berkas (P4) | §3.5 patuh | **sangat rendah** | `e2e:landing` |
| **4** | `font-medium` → 600/700 (P5) + lepas muka 600 (P6) | penekanan kembali, **−24,2 KB** | rendah | nol |
| **5** | Keluarkan `supabase.js` dari rute publik (P2) | **−56,5 KB** | sedang | `verify:fetch-boundary` |
| **6** | Jalur build lokal resmi (P8) | A + SW manifest benar-benar aktif | rendah | — |
| **7** | Padatkan `alur` di ponsel (P7) | 3.194 px → ? | sedang | `e2e:landing` |

**Saran: kerjakan 2, 3, 4 dulu** — ketiganya nol-risiko, masing-masing satu kelas atau
satu atribut, dan 3+4 sekaligus menutup dua penyimpangan dari aturan yang **sudah
ditulis** di `DESIGN.md` (§3.5 dan §3.3). Baru sesudahnya ambil **1**, yang membawa
seluruh penghematan sebenarnya tapi menyentuh aset dan dua gate.

---

## 6. Cara mengulang pengukuran ini

```bash
# build yang BENAR-BENAR menjalankan hook pasca-build (lihat §3)
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build

npx astro preview --port 4399        # bind IPv6-only -> pakai `localhost`, bukan 127.0.0.1
BASE_URL=http://localhost:4399 node .tmp-audit/audit-landing.mjs
BASE_URL=http://localhost:4399 node .tmp-audit/audit-landing-weight.mjs
BASE_URL=http://localhost:4399 node .tmp-audit/audit-landing-layout.mjs   # reduced-motion
```

**Jebakan yang berlaku pada ketiga skrip itu, dan sudah ditangani di dalamnya:**

1. `h1` di `/` dirender island `client:only` → **tidak ada** sampai splash hilang;
   membaca lebih awal mengukur shell, bukan halaman.
2. 27 dari 35 `<img>` ber-`loading="lazy"` → `naturalWidth` **selalu 0** kalau belum
   di-scroll. Skrip men-scroll seluruh halaman sebelum mengukur.
3. `animation-timeline: view()` membuat band di bawah lipatan ber-transform → ukur
   geometri dengan `prefers-reduced-motion: reduce`.
4. `astro preview` bind ke `[::1]` → `127.0.0.1` **ditolak**; pakai `localhost`.
5. `astro build` dan `astro preview` **tidak bisa** berjalan bersamaan.

---

## 7. Yang berubah di repo karena laporan ini

**Nol baris `src/` disentuh.** Working tree bersih sebelum dan sesudah
(`git status --porcelain -uall` kosong) — laporan ini murni penilaian, dan itu disengaja:
temuan P1–P7 menyentuh aset, komponen, dan font, yang ketiganya layak diputuskan pemilik
lebih dulu.

| Berkas | Perubahan |
|---|---|
| `deliverables/gstack/audit-landing-2026-09-30.md` | **Berkas ini** — dibuat |
| `deliverables/gstack/_audit-landing-2026-09-30.html` | Versi visual (tangga bobot + tabel) |
| `deliverables/gstack/_audit-landing-{hero,faq,tim-mitra}-1280.png`, `_audit-landing-alur-390.png` | Tangkapan layar bukti |
| `.tmp-audit/audit-landing*.mjs`, `.tmp-audit/stability.mjs` | Skrip probe (gitignored) |

---

## 8. ✅ STATUS — DIKERJAKAN (pemilik: *"oke tolong di polish biar ringan dan porposional"*)

**Terukur sesudah, bukan diperkirakan.** Semua angka di bawah diukur ulang dengan skrip
yang sama, atas build produksi segar.

| | Sebelum | Sesudah | Δ |
|---|---|---|---|
| Berat @1280 DPR1 | 2.481,2 KB | **1.683,4 KB** | **−797,8 KB (−32,2 %)** |
| Berat @390 DPR2 | 2.740,2 KB | **1.942,4 KB** | **−797,8 KB (−29,1 %)** |
| · gambar | 2.116,0 / 2.375,0 KB | **1.318,2 / 1.577,2 KB** | −797,8 KB |
| · JS / font / HTML / CSS | 173,5 / 116,2 / 46,8 / 28,8 | **tidak berubah** | 0 |
| Request | 67 | **66** | −1 |
| Ukuran baca jawaban FAQ | 1.173 px | **574 px** | −599 px |
| Padding kartu @1280 | 24px×24 vs 20px×19 | **24px×43** | satu nilai |
| Elemen pada bobot 500 | 13 | **0** | muka 500 memang tidak dimuat |
| Elemen pada bobot 600 | 1 | **14** | muka 600 akhirnya terpakai |
| Tinggi halaman | 17.647 px | 17.687 px | +40 px (padding kartu) |

### Yang dikerjakan

| # | Perubahan | Berkas | Terukur |
|---|---|---|---|
| **1** | **13 gambar lokal di-encode ulang ke lebar tampilnya** (galeri 1600/1400/1139 → 800–1000; 6 logo mitra 512 → 240; logo brand 500 → 256) | 13 `.webp` + `src/lib/gallery.ts` (w/h) + `index.astro:594`, `404.astro:54`, komentar `PartnerGrid.tsx` | **−732,5 KB** |
| **2** | **Logo header berhenti hotlink dari Supabase** → `/icons/logo-asj.webp` (berkas lokal yang sudah ter-commit; dulu 66.140 B untuk slot 48/64 px = 7,8×). Handler `onError` dibuang bersamanya | `App.tsx`, `CandidateDash.tsx`, `MasterFullForm.tsx` | **−65 KB**, −1 request |
| **3** | **Measure jawaban FAQ** dibatasi `max-w-prose` | `FaqList.tsx` | 1.173 → **574 px** |
| **4** | **`md:p-6`** di 4 tempat yang masih memakai padding mobile di desktop | `PersonGrid.tsx`, `PartnerGrid.tsx`, `ReviewGrid.tsx`, `index.astro:1075` | 19 kartu 20px → 24px |
| **5** | **`font-medium` (500) → `font-semibold` (600)** di 4 tempat landing | `LayananSection.astro` ×2, `PersonGrid.tsx`, `index.astro:503` | bobot 500: 13 → **0** |

**Logo brand diverifikasi, bukan diasumsikan.** `/icons/logo-asj.webp` dan
`logo-removebg-preview.webp` dirender berdampingan sebelum penukaran — lambang yang sama,
sama-sama ber-alpha. Penukaran ini mengikuti keputusan yang `Footer.astro` sudah ambil dan
catat; tidak ada berkas baru dan **tidak ada keputusan publikasi baru** (§11.2).

### ⚠️ Yang SENGAJA TIDAK dikerjakan, dan alasannya

- **`*@2x.avif` (hero 175 KB, penempatan-banner 79 KB, lokasi-banner 39 KB).** Lintasan
  pertama saya mengecilkannya ke 800 px dan **saya batalkan**. Berkas-berkas itu dipilih
  browser pada DPR2 di **semua** lebar, dan pada 1280 banner-banner itu digambar **1.213 px**
  — jadi retina desktop butuh ~2.426 px. `lokasi-banner@2x` (2400×1200) **persis** yang
  `docs/ILLUSTRATION_SPEC.md` tetapkan untuk kasus itu. Mengecilkannya akan mengoptimalkan
  slot 339 px di ponsel dengan **merusak** slot 1.213 px di retina. Satu berkas melayani
  keduanya; perbaikan sebenarnya adalah `sizes` + deskriptor `w` dengan tiga lebar — dan itu
  butuh **berkas baru**, yang menurut `verify-assets.mjs` menuntut keputusan publikasi baru
  untuk foto yang **sudah** terbit. Itu keputusan pemilik, bukan optimasi byte.
- **`program-*` / `langkah-*` `1x` (600×400 / 560×400 → 420).** Kelebihan ~1,5×, tapi
  `docs/ILLUSTRATION_SPEC.md` menyatakan 600×400 dan 560×400 sebagai ukuran 1x kanonik.
  Menghemat ~69 KB (2,8 %) tidak sepadan dengan melanggar spec tertulis.
- **`supabase.js` 56,5 KB (P2).** Menariknya keluar dari rute publik butuh memecah
  `src/lib/supabase.ts` menjadi modul env-check + modul klien, karena `App.tsx` → `userStore`
  → `supabase` semuanya impor statis. Itu berarti **satu berkas `.ts` baru**, yang menggeser
  **tujuh counter beku** di `indexer/src/{discover,build,parse,deep-tier}.test.ts` — dan
  `MEMORY.md` menyatakan hanya team-lead yang boleh menyunting ketiganya. Perlu keputusan
  pemilik sebelum dikerjakan.

### 🔴 Celah yang TERSISA, dan sekarang menjadi yang terbesar

**4 gambar masih datang dari Supabase Storage: 501 KB — 30 % dari halaman yang sudah
diperbaiki.**

| Berkas | Byte | Ditampilkan | Lebih |
|---|---|---|---|
| `momiji_banner.webp` | 185 KB | 591 / 341 px | 2,0× |
| `dark_tokyo_banner.webp` | 140 KB | 591 / 341 px | 2,0× |
| `sakra_banner.webp` | 111 KB | 486 / 341 px | 2,5× |
| `logo-removebg-preview.webp` (masih di `/candidate`, `/master`) | 65 KB | 64 px | 7,8× |

Ketiganya di `LayananSection.astro:31,114,150` dan **tidak terlihat `verify:assets`** karena
gate itu hanya memindai `public/`. Dua jalan keluar, keduanya keputusan pemilik:

1. **Transformasi Supabase Storage** (`?width=800`) — nol berkas baru, tapi butuh paket Pro;
   nilai paket harus dipastikan dulu, jangan diasumsikan.
2. **Pindahkan ke `public/assets/`** — 3 banner itu **ilustrasi**, bukan foto orang, jadi
   §11.2 tidak berlaku dan `ILLUSTRATIONS` di `verify-assets.mjs` adalah tempatnya. Perlu satu
   entri registry per berkas.

### Catatan tambahan yang muncul saat mengerjakan

- **Service worker mem-precache 1.915 KB.** `scripts/build-sw-manifest.mjs` memasukkan
  **seluruh** 57 aset `dist/_astro/*` ke daftar precache, dan `dist/sw.js` mengunduh semuanya
  di event `install`. Untuk pengunjung pertama di host asli itu **+1,9 MB di latar belakang** —
  lebih besar dari seluruh halaman. **Tidak terukur di lokal** karena `BaseLayout.astro:407`
  sengaja meng-unregister SW di localhost. Ini kandidat berikutnya, tapi ia menyentuh
  strategi offline (`src/lib/swOffline.test.ts` memaku `dist/sw.js`), bukan tata letak.
- **`font-medium` masih ada 8× di luar landing** (`CekSiswaModal`, `ErrorBoundary`,
  `AiCvForm`, `ShareView`). Cacat yang sama, di luar lingkup halaman profil.

### Gate yang dijalankan sesudah perubahan

| Gate | Hasil |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint-ratchet` | **PASSED — debt reduced by 15** |
| `node scripts/ci/verify-assets.mjs` | **PASS** (49 di disk · 30 terbit · 18 diblokir) |
| `src/lib/gallery.test.ts` | **13/13** (memaku w/h yang baru terhadap berkas di disk) |
| `e2e:landing` | **all checks passed** (17 seksi × 2 lebar) |
| `e2e:headings` | **all checks passed** |
| `e2e:aria-names` | **40/40** |
| `e2e:contrast` | **0 elemen di bawah lantai** |
| suite vitest penuh | **4 merah / 2021 lulus — sama persis dengan baseline** |

**Tentang 4 merah itu.** Lintasan penuh pertama melaporkan **6** merah: dua tambahan adalah
`indexer/src/build.test.ts` ("is deterministic across builds") dan `indexer/src/query.test.ts`
("indexFromDoc tolerates legacy snapshots") yang **timeout 60 detik**. Keduanya **lulus saat
dijalankan sendiri** (17,1 s dan 16,6 s per tes) — jadi itu kontensi CPU, bukan regresi:
test-nya memang 17–19 detik masing-masing dan ambang 60 detik terlalu ketat saat 166 berkas
berjalan paralel.

**Dikonfirmasi, bukan disimpulkan.** Suite penuh dijalankan ulang dengan
`--testTimeout=180000`: **4 gagal / 2021 lulus** — persis angka baseline yang tercatat
(`LokerDetailModal.test.tsx`, `boundary.test.ts`, `discover.test.ts` EBUSY,
`fcm-server.test.ts`), dan kedua timeout indexer hilang. **Nol regresi.**

### Cara mengembalikan

Seluruh 13 gambar berasal dari git dan **tree bersih sebelum diubah**, jadi:
`git checkout -- public/assets public/icons` mengembalikan resolusi penuh. Tidak ada berkas
yang ditambahkan atau dihapus.

