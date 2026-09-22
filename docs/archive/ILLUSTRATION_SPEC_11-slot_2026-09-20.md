# Spec Ilustrasi Anime + Arah Gamefeel

Status: **RENCANA.** Belum ada satu pun gambar anime yang dihasilkan. Dokumen ini
menentukan apa yang harus digambar, supaya pekerjaan kode bisa jalan paralel dan
supaya gambar yang masuk tidak ditolak gate.

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
| Layer gamefeel (XP, badge, kartu level, animasi) | **Ya** — kode |
| **Menghasilkan gambar anime-nya** | **Tidak.** Di luar kemampuan sesi ini |

Konsekuensi jujur: sampai gambar ada, halaman tetap memakai foto sekarang. Layar
gamefeel bisa dikerjakan lebih dulu karena tidak bergantung gambar.

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

Sembilan slot galeri + satu hero. Kolom “Peran” menyebut fungsi naratifnya, karena
galeri di halaman ini adalah **bukti kepercayaan**, bukan hiasan (`DESIGN.md` §1.1).

| # | Nama berkas (baru) | Peran naratif | Ukuran kerja | Menggantikan |
|---|---|---|---|---|
| 1 | `ilustrasi/hero-berangkat.webp` | Hero: kandidat berangkat, koper, stasiun, sakura | 1600×900 | `fasilitas-gedung.webp` (banner) |
| 2 | `ilustrasi/kelas-bahasa.webp` | Belajar bahasa Jepang di kelas | 1280×960 | `fasilitas-kelas-bahasa-2.webp` |
| 3 | `ilustrasi/kelas-bahasa-2.webp` | Latihan percakapan, berpasangan | 1280×960 | (slot baru) |
| 4 | `ilustrasi/latihan-fisik.webp` | Latihan fisik/persiapan | 1280×960 | `fasilitas-kelas-bahasa-1.webp` (CCTV) |
| 5 | `ilustrasi/ruang-tamu.webp` | Penyerahan dokumen ke staf | 1280×960 | `fasilitas-ruang-tamu-1.webp` |
| 6 | `ilustrasi/ruang-kantor.webp` | Kantor operasional, staf bekerja | 1280×960 | `fasilitas-ruang-kantor-1.webp` |
| 7 | `ilustrasi/uji-wawancara.webp` | Sesi wawancara (mensetsu) | 1280×960 | *(isian lubang mensetsu)* |
| 8 | `ilustrasi/grup-angkatan.webp` | Angkatan peserta, berkelompok | 1280×960 | `fasilitas-grup-siswa-1.webp` |
| 9 | `ilustrasi/pelepasan.webp` | Pelepasan keberangkatan | 1280×960 | `galeri-keberangkatan-1.webp` |
| 10 | `ilustrasi/tim-pengajar.webp` | Tim pengajar (karakter dewasa, bukan siswa) | 1280×960 | `fasilitas-grup-staf.webp` |
| 11 | `ilustrasi/pengajar-n1.webp` | Potret pengajar bersertifikat | 828×1035 | `tim-hadi-prasojo.webp` |

### 3.1 Kenapa 11, bukan 9

Empat slot berwajah (§11.2) diganti, **dan** dua slot yang selama ini dibuang justru
punya nilai: `kelas-bahasa-1` (dulu frame CCTV) dan lubang mensetsu. Sebagai
ilustrasi, keduanya kehilangan alasan penolakannya — CCTV tidak lagi jadi CCTV
kalau digambar. Itu keuntungan nyata dari arah ini.

---

## 4. Setelah gambar ada: yang harus dilakukan

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
