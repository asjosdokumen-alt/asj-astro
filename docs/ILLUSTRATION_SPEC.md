# Spec Ilustrasi Anime + Arah Gamefeel

Status: **SEBAGIAN TERPENUHI (2026-09-20).** **5 ilustrasi sudah masuk dan sudah
dipasang** — hero, banner lokasi, dan 3 kartu program. Galeri 11 slot (§3 lama)
**belum** dikerjakan dan kini diarsipkan. Lihat §3 di bawah untuk keadaan sebenarnya.

> **Catatan pembaca:** daftar 11 slot yang dulu ada di §3 **sudah tidak berlaku**
> dan disimpan di `docs/archive/ILLUSTRATION_SPEC_11-slot_2026-09-20.md`. Dokumen
> ini dulu menyebut 11 berkas bernama `hero-berangkat`, `kelas-bahasa`, dst.; yang
> benar-benar dikirim adalah **5 berkas dengan nama berbeda** (`hero-sakura`,
> `lokasi-banner`, `program-bahasa`, `program-magang`, `program-ssw`). Dokumen
> yang menyebut nama berkas yang tidak ada lebih buruk daripada tidak ada
> dokumen, jadi §3 ditulis ulang dari berkas di disk — bukan dari rencana.

Rujukan tema: `DESIGN.md` §1 “Sakura Editorial” (dark-first, bento, tipografi
editorial, glass tertahan) dan §3 (token). Rujukan aturan aset: `docs/COMPANY_PROFILE_DATA.md` §11.2.

---

## 0. Kenapa dokumen ini ada (dan apa yang TIDAK bisa dilakukan)

Permintaan owner 2026-09-20: *“semua photo ilustrasikan jadi anime saja, kita
gamefikasikan web app kita, sesuai tema Jepang dan usia user.”*

**Sesi ini TIDAK punya kemampuan menghasilkan gambar.** Tidak ada image generation
maupun image-to-image. Jadi tidak ada “sesi ini mengubah foto jadi anime” — itu
tidak akan terjadi, dan mengakuinya lebih berguna daripada mengerjakan sesuatu yang
tidak mungkin. Yang bisa dikerjakan adalah **segala hal di sekitar gambar**:

| | Dikerjakan di sini? |
|---|---|
| Menentukan daftar gambar, ukuran, isi, gaya | **Ya** — dokumen ini |
| Menyiapkan slot aset + komponen agar gambar drop-in | **Ya** — tanpa ubah komponen |
| **Memasang gambar yang sudah dibuat di luar** | **Ya** — sudah dilakukan, 5 slot |
| Layer gamefeel (XP, badge, kartu level, animasi) | **Ya** — kode |
| **Menghasilkan gambar anime-nya** | **Tidak.** Di luar kemampuan sesi ini |

Konsekuensi jujur: gambar yang **sudah** dibuat di luar dipasang oleh sesi ini;
gambar yang **belum** ada tetap membuat slotnya memakai foto/ikon sekarang.
Layar gamefeel bisa dikerjakan lebih dulu karena tidak bergantung gambar.

---

## 1. Temuan yang mengubah bentuk pekerjaan: aset sudah siap tukar

Diukur dari kode, bukan diasumsikan:

- `GalleryItem` (`src/lib/gallery.ts`) = `{ src, alt, captionKey, caption, width, height }`.
- Konsumennya **dua**: `GalleryGrid.tsx` (iterasi `GALLERY`) dan satu `<img>` langsung di `index.astro:484`.
- **Tidak ada komponen yang peduli isi gambarnya** — hanya path dan dimensi.

**Artinya: mengganti ilustrasi anime TIDAK butuh perubahan komponen sama sekali.**
Yang berubah hanya `src`/`width`/`height` dan berkasnya. Itu leverage terbesar di
sini, dan alasan kenapa pekerjaan kode bisa dimulai tanpa menunggu satu gambar pun.

Pola berkas yang sudah terbukti di repo ini (maskot Aa-chan, `public/mascot/`):
**AVIF + WebP, dua kepadatan (`1x` dan `@2x`)**. Ilustrasi baru mengikuti pola itu.

---

## 2. Sistem visual ilustrasi

Diturunkan dari gaya maskot yang **sudah ada** — bukan gaya baru, supaya halaman
tidak terbelah dua bahasa visual.

| Aspek | Ketentuan |
|---|---|
| Gaya | Anime 2D *cel-shaded*, garis tegas, warna flat + satu lapis bayangan. Bukan 3D, bukan semi-realistis |
| Rasio tampilan | Lanskap, sekitar **4:3** atau **3:2** (ubin galeri). Tegak 4:5 hanya untuk potret |
| Ukuran kerja | **1280×960** (atau 1600×1200) untuk lanskap; **828×1035** untuk potret |
| Format keluar | WebP kualitas ~82 + AVIF; **tanpa teks di dalam gambar** |
| Langit-langit | ≤350 KB per berkas `@2x` — galeri 9 ubin harus tetap ringan di ponsel kelas menengah (`DESIGN.md` §1.3, target LCP <1,5 s) |
| Palet | Token repo: `--pink-600` (aksen, sakura), `--surface-raised`, `--line-strong`. Langit **senja Jepang** (indigo→magenta), bukan siang terang — halaman dark-first |
| Latar | Setiap ilustrasi harus **terbaca di atas latar gelap**; hindari latar putih penuh |
| Karakter | Konsisten dengan Aa-chan: kepala besar, mata ekspresif, seragam sederhana. **Usia karakter 18–22** |

### 2.1 Aturan yang tidak boleh dilanggar

1. **TIDAK ADA teks di dalam gambar.** Semua teks hidup sebagai teks halaman —
   translatable, dan itu sudah jadi aturan repo (`GALLERY_EXCLUDED` menolak
   `poster-rekrutmen.webp` justru karena teks & harga terbakar di piksel).
2. **Tidak ada wajah orang nyata yang bisa dikenali.** Ini yang menyelesaikan
   §11.2: ilustrasi menghapus kebutuhan consent. Kalau ilustrasi dibuat “berdasarkan”
   orang tertentu, aturannya kembali berlaku.
3. **Tidak ada logo/kop surat pihak ketiga** di dalam ilustrasi.
4. **Tanpa bendera**, dan tidak menggambarkan adegan yang bisa dibaca sebagai
   klaim kerja/penempatan yang belum terjadi.

---

## 3. Daftar gambar

**Lima slot, dan semuanya sudah dipasang.** Tabel ini ditulis dari berkas yang ada
di disk dan dari markup yang benar-benar dirender — bukan dari rencana lama. Kolom
“Dipakai di” menyebut lokasi kode yang merender berkas itu, supaya klaim “sudah
dipasang” bisa diperiksa, bukan dipercaya.

| # | Berkas (basename) | Peran | Ukuran 1x / @2x | Dipakai di | `loading` | `alt` |
|---|---|---|---|---|---|---|
| 1 | `hero-sakura` | Latar band hero: Fuji, pagoda, skyline, sakura senja | 1600×900 / 3200×1800 | `src/components/App.tsx` (varian `hero`) | `eager` | `""` (dekoratif) |
| 2 | `lokasi-banner` | Pita skyline senja di atas kartu peta | 1200×600 / 2400×1200 | `src/pages/index.astro` §`#lokasi` | `lazy` | `""` (dekoratif) |
| 3 | `program-magang` | Kartu Program: jalur Magang | 1200×900 / 2400×1800 | `src/lib/companyProfile.ts` → `PROGRAMS[0].image` | `lazy` | deskriptif |
| 4 | `program-ssw` | Kartu Program: Tokutei Ginou (kawasan industri) | 1200×900 / 2400×1800 | `PROGRAMS[1].image` | `lazy` | deskriptif |
| 5 | `program-bahasa` | Kartu Program: Bahasa Jepang (buku + gelombang suara) | 1200×900 / 2400×1800 | `PROGRAMS[2].image` | `lazy` | deskriptif |

Setiap slot dikirim dalam **4 berkas**: `.webp` + `.avif`, masing-masing 1x dan
`@2x`. Total 20 berkas, 904 KB.

### 3.1 Kenapa `alt` berbeda: dekoratif vs deskriptif

Ini bukan kelalaian, dan bukan pilihan per-berkas yang bisa dibalik tanpa alasan.

- **Hero dan banner lokasi** memakai `alt=""` + `aria-hidden="true"`. Keduanya
  mengulang makna yang **sudah** dinyatakan teks: hero punya `h1` (“Karier ke
  Jepang, dimulai dari sini.”) dan seksi lokasi sudah menyebut nama serta alamat.
  Membacakannya lagi membuat pembaca layar mengucapkan gagasan yang sama dua kali.
- **Tiga kartu program** memakai `alt` deskriptif, karena di sana gambar memang
  membawa isi: pabrik untuk penempatan SSW, buku untuk pelatihan bahasa.

### 3.2 Cara memasang berikutnya (kontrak yang sudah terbukti)

Menukar artwork **tidak butuh perubahan komponen** — itu klaim lama dan sudah
terbukti benar di 5 slot ini. Yang dibutuhkan hanya:

1. Buat 4 berkas dengan basename sama di `public/assets/ilustrasi/`.
2. Untuk kartu program: isi `image: { name, alt, w, h }` pada `Tile` di
   `src/lib/companyProfile.ts`. `name` adalah **basename saja**, bukan path.
3. Untuk slot hero/banner: `<picture>` sudah ada; cukup ganti `srcset` dan
   `width`/`height` di `App.tsx` / `index.astro`.

`w`/`h` harus **diukur dari berkas**, bukan disalin dari spesifikasi — itu langkah
pertama §4 dan alasannya masih berlaku.

### 3.3 Galeri 11 slot: DITUNDA, bukan dibatalkan

Daftar 11 slot lama (galeri fasilitas + potret pengajar) **belum dikerjakan** dan
diarsipkan di `docs/archive/ILLUSTRATION_SPEC_11-slot_2026-09-20.md`. Alasan
penundaannya masih sah: empat slot berwajah (§11.2) butuh ilustrasi untuk
menggantikan foto yang tidak punya basis consent. Ketika galeri itu dikerjakan,
nama berkasnya kemungkinan tetap seperti di arsip — tetapi **jangan** anggap tabel
arsip itu sebagai keadaan sekarang.

---

## 4. Setelah gambar ada: yang harus dilakukan

§4.1–§4.4 **sudah dilakukan** untuk 5 slot di §3; sisanya berlaku untuk slot baru.
Urutan ini penting; melompat ke “ganti path” tanpa langkah 1 akan memerahkan gate.

1. **Ukur tiap berkas** (`width`/`height` sebenarnya) — jangan percaya angka spesifikasi.
   `GalleryItem` mensyaratkan dimensi intrinsik; salah di sini = layout shift.
2. Turunkan AVIF + WebP (1x & @2x) mengikuti pola `public/mascot/`.
3. Perbarui `GALLERY` (atau tambahkan `GALLERY_ILLUSTRATED`) di `src/lib/gallery.ts`.
4. Perbarui `<img>` di `index.astro:484`.
5. **Perbarui `scripts/ci/verify-assets.mjs`**: ilustrasi **tidak boleh** masuk
   daftar blokir `.gitignore`, dan tidak boleh ada di `CONSENT_OPEN` — ilustrasi
   tidak punya basis consent karena tidak ada orang nyata. Gate akan menuntun ini.
6. `npm run verify:assets && npm run lint-ratchet && node node_modules/vitest/vitest.mjs run`

---

## 5. Batas: ini bukan penghapusan foto

Foto asli tetap di disk. Setelah ilustrasi menggantikan wajah di halaman, daftar
blokir `.gitignore` **masih berlaku** untuk foto asli, dan `CONSENT_OPEN` di
`src/lib/gallery.ts` menjadi **tidak relevan untuk tayang** (karena yang tayang
ilustrasi) — tapi jangan dihapus sebelum diperiksa: gate check (f) akan meminta
annotasi selama entri itu masih tayang. Urutan aman: ganti entri dulu, baru
bersihkan `CONSENT_OPEN` di commit terpisah.

---

## 6. Layer gamefeel — yang bisa dikerjakan TANPA gambar

Ini bagian yang tidak menunggu apa pun. Semuanya **rasa game, bukan game**
(pilihan owner): tidak ada gameplay, tidak ada backend baru, tidak ada tabel.

### 6.0 Temuan lebih dulu: separuh gamefeel SUDAH ADA — tapi bukan di halaman publik

Diukur, bukan diasumsikan:

| Ada di mana | Isi | Status |
|---|---|---|
| `src/lib/profileProgress.ts` | `computeCvMiniProgress`, `computeCvMasterProgress`, `computeOverallProgress`, `filledPercent` | **sudah ada** |
| `src/components/candidate/CandidateDash.tsx` | `CrownBadge` — 👑 ≥100%, 🥈 ≥50%, 🥉 >0% | **sudah ada** |
| `src/pages/candidate.astro` | memasang `CandidateDash` | **di balik login** |
| `src/pages/index.astro` (landing publik) | — | **nol progress, nol badge** |

**Konsekuensi yang mengubah rencana:** “gamefikasikan web app” bukan satu pekerjaan,
tapi dua, dan risikonya jauh berbeda.

1. **Halaman kandidat (sudah login)** — memperkaya yang sudah ada. Datanya nyata
   (persentase kelengkapan profil), jadi badge di sini **berbasis fakta**, bukan
   karangan. Risiko: rendah. Yang perlu dijaga hanya §6.1 di bawah.
2. **Landing publik (belum login)** — di sini **tidak ada data apa pun** tentang
   pengunjung, karena mereka belum punya akun. Badge/XP di halaman ini **hanya bisa
   fiktif** kalau dipaksakan. Jadi gamefeel di landing harus berbentuk hal yang
   tidak butuh state pribadi: ilustrasi, animasi masuk, tipografi, maskot pemandu.

**Jangan** menaruh progress pribadi di halaman publik tanpa login — itu bukan
gamefeel, itu kebocoran rasa “halaman ini mengawasi saya”.

### 6.1 Elemen, sumber data, dan risiko

| Elemen | Di mana | Sumber data | Risiko |
|---|---|---|---|
| Kartu level + badge pencapaian | `/candidate` | `computeOverallProgress()` yang sudah ada | rendah |
| Progress per-bagian (CV mini, CV master, berkas) | `/candidate` | sudah ada (`berkasProgress`/`berkasTotal`) | rendah |
| Pemandu langkah + maskot Aa-chan | `/candidate` | `Mascot.tsx` sudah ada | rendah |
| Animasi masuk untuk ubin & kartu | keduanya | CSS saja | rendah |
| Ilustrasi anime menggantikan foto | landing | berkas statis | sedang — tunggu gambar |
| Tipografi/panel bertema Jepang (asano-ha, gelombang) | landing | CSS/SVG | rendah |

### 6.2 Dua batas etis yang harus dipegang

1. **Jangan memberi skor seleksi.** Kandidat tidak boleh melihat angka yang bisa
   dibaca sebagai peluang diterima. `computeOverallProgress` mengukur
   **kelengkapan berkas**, bukan penilaian — jangan sampai presentasinya berubah
   makna. Ini sudah dijaga di kode; jangan diubah jadi “skor profil”.
2. **Jangan membuat progres yang turun menghukum.** Bar yang mundur karena berkas
   ditolak akan terbaca sebagai kegagalan pribadi, di konteks orang yang sedang
   mencari kerja. Perubahan pada `profileProgress.ts` harus mempertahankan sifat
   “hanya naik selama berkas tetap ada”, dan penurunan tidak dirayakan.

Keduanya ditulis di sini supaya orang berikutnya tidak “meningkatkan” gamifikasi
dengan menambahkan skor kompetitif atau papan peringkat antar-kandidat.

## 7. Mascot pemandu: mekanisme tracking, dan dua cacat yang pernah membuatnya MATI

Bagian ini adalah **mascot di landing publik** (`index.astro`), bukan `Mascot.tsx`
di `/candidate`. Permintaan owner:

> “mascot itu bukan model gitu maunya ikut sesuai scroll mau ke sesi terus jadi
> pindah ikutin bagian dan posenya beda beda tergantung tempat baik mimik wajah
> maupun motionnya”

Bukan model 3D: **gambar 2D yang bertukar** mengikuti section, dengan pose dan
animasi berbeda per bagian.

### 7.1 Di mana datanya (satu sumber kebenaran)

`src/lib/sectionMotion.ts` memegang **seluruh** tabel: `ENTER_KINDS` (7 jenis
transisi masuk), `MASCOT_MOTIONS` (5 idle), dan `SECTION_MOTION` (15 baris —
satu per section, berisi `pose`, `motion`, `enter`). Section membaca tabel ini
lewat `Section.astro`; `motion.css` menyediakan keyframe-nya. **Jangan** menyalin
tabel itu ke komponen, dan jangan menambah pose tanpa menambah barisnya di sini.

### 7.2 Dua cacat yang harus diketahui orang berikutnya

Keduanya **tidak error, tidak merah di test apa pun, dan tidak terlihat di
konsol**. Keduanya hanya ketahuan setelah gate-nya sendiri diperbaiki lebih dulu.

**Cacat 1 — blok tracking dijalankan saat PARSE, sebelum `<body>` ada.**
`BaseLayout.astro` menaruh skripnya di `<head is:inline>`. Skrip itu memanggil
`document.querySelector("[data-mascot-track]")` **saat parse**, dan pada saat itu
`document.body` belum ada — diukur: `readyState: "loading"`, `bodyExists: false`.
Hasilnya `null`, lalu `if (!mascot) return;` keluar **tanpa suara**. Mascot tidak
pernah berpindah pose, di scroll mana pun, di lebar berapa pun. Perbaikannya
adalah helper `onReady()`: jalankan sekarang kalau dokumen sudah siap, kalau belum
tunggu `DOMContentLoaded`.

**Cacat 2 — pertukaran pose hanya menulis atribut yang TIDAK ADA yang membaca.**
`apply()` dulu hanya memanggil `mascot.setAttribute("data-pose", pose)`.
`grep -rn 'data-pose' src/` hanya menemukan **penulis**, bukan pembaca: tidak ada
stylesheet yang menyeleksinya. Jadi atributnya berubah (`princess-peace`,
`princess-side`, …) sementara **gambarnya tetap** `/mascot/princess-wave.*` di
semua section. Perbaikannya adalah `setPose()`, dan ia **wajib** menulis ketiganya
sekaligus — dua `<source srcset>` (AVIF + WebP) **dan** `<img src>` — karena
`<picture>` memilih `<source>`, sehingga menulis `src` saja tidak mengubah apa
pun di browser modern.

### 7.3 Jebakan pengukuran yang sudah memakan korban

| Jebakan | Kenyataan yang diukur |
|---|---|
| `display:none` tetap “menyelesaikan” CSS | `animation-name`/`opacity` benar pada elemen tersembunyi. Hanya **box** (`getBoundingClientRect`) yang jujur. Rail mascot `hidden xl:block`, jadi ia **0×0 di bawah 1280px** |
| `loading="lazy"` tidak dipicu `scrollTo` | `page.mouse.wheel()` memicu fetch; `window.scrollTo()` dan `scrollIntoView()` **tidak** |
| Walk menghancurkan keadaan yang ia ukur | langkah pertama walk adalah scroll, jadi `onScroll` sudah mengoreksi pose **sebelum** pengukuran pertama. Keadaan “saat baru tiba” butuh pengukuran **terpisah sebelum scroll** |
| `img.decode()` | crash renderer di halaman 390px (1161 node, 22 gambar). Pakai poll `complete` berbatas waktu |

Bukti lengkap ada di `e2e/test-mascot-motion.mjs` (17 assertion) dan baterai
mutasinya `e2e/test-mascot-motion.mutations.sh` (`M1..M6`, `T1..T5`, `S1`, `S1b`).

