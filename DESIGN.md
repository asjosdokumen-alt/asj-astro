# DESIGN.md — Design System ASJ Portal v2

**Status:** rancangan arah & token · **Dibuat:** 2026-09-19
**Basis ukur:** HEAD `41e64cc`, pohon kerja **bersih**
**Sasaran dokumen:** siapa pun yang menyentuh tampilan — rombak UI/UX dimulai dari
halaman ini (`docs/LANDING_PAGE_ROADMAP.md` §0).
**Spesifikasi halaman jadi:** `docs/LANDING_PAGE_SPEC.md`.

> **Kontrak baca.** Dokumen ini **keputusan**, bukan laporan. Setiap angka di sini
> **diukur**; perintah pengukurnya disebut supaya bisa diulang. Kalau dokumen ini
> bertentangan dengan kode, **kode menang** sampai ada ukur ulang. Kalau bertentangan
> dengan `docs/UI_DESIGN_REVIEW.md`, **hasil ukur menang**.
>
> **Dokumen ini tidak mengubah satu baris kode pun.** Yang berubah hanya dua berkas
> markdown, jadi seluruh ratchet (`lint-ratchet`, `typecheck:ratchet`, indexer) tetap
> di baseline. Nilai token di §3 adalah **usulan yang siap dipindahkan** ke
> `src/styles/theme.css`, lengkap dengan baris tujuannya.

---

## 0. Tujuh prinsip

Prinsip tanpa konsekuensi yang bisa diukur hanyalah selera. Kolom ketiga adalah cara
membuktikan pelanggarannya.

| # | Prinsip | Artinya di kode | Cara membuktikan |
|---|---|---|---|
| **P1** | **Dark-first, terang turunan** | Nilai dark di `@theme` adalah default; blok `html[data-theme="light"]` hanya menimpa nilai | `theme.css:44-136` (default) vs `148-172` (turunan); boot script `BaseLayout.astro:84-91` menulis `dark` |
| **P2** | **Bento untuk yang paralel, editorial untuk yang berurutan** | Grid bento hanya di section yang isinya sejajar; prosa & langkah pakai kolom editorial | §4.2 daftar putih section bento; section di luar daftar itu **wajib** layout editorial |
| **P3** | **Satu aksen per section, dari daftar tertutup** | Hanya 6 token aksen di §3.2 yang boleh muncul di komponen section | `grep` menemukan 0 warna aksen di luar daftar 6 |
| **P4** | **Angka hanya dari data** | Statistik, jumlah lowongan, tahun berdiri dihitung dari payload, tidak pernah diketik | Mutasi: hardcode satu angka → gate merah |
| **P5** | **Section disembunyikan, bukan dikarang** | Legalitas/galeri/testimoni/kontak hanya dirender kalau datanya ada | Hapus data → section hilang, **bukan** menampilkan placeholder |
| **P6** | **Satu landmark nav, satu `h1`** | Nav desktop masuk ke `<nav>` yang **sudah ada**; `h1` dipegang hero | `nav[aria-label="Primary navigation"]` berjumlah **1**; `e2e:headings` hijau |
| **P7** | **Gerak hanya `opacity` + `transform`, 180 ms** | Semua transisi memakai tiga kurva di §3.7 | Tidak ada `transition-all`; tidak ada animasi `width`/`height`/`top` |

**P6 adalah prinsip yang paling mudah dilanggar tanpa sadar.** `e2e/test-drawer.mjs:71`
memilih drawer lewat **satu** selektor bername dan seluruh pengukurannya memakai
`document.querySelector(NAV)` — yaitu **elemen pertama**. Menambah `<nav>` kedua dengan
label sama membuat gate mengukur elemen yang salah, dan sebagian asersinya lolos
**tanpa membuktikan apa pun**.

Ada **dua** tempat yang rusak bersamaan, dan keduanya tanpa asersi jumlah:
`e2e/test-drawer.mjs:71` **dan** `src/components/App.header.test.tsx:106`. Bahayanya
**tidak simetris** — `<nav>` kedua yang ditaruh **sebelum** drawer membuat unit test itu
gagal keras, tetapi yang ditaruh **sesudah** drawer membuat semuanya tetap hijau
sementara jaminannya sudah hilang. Rinci: `docs/LANDING_PAGE_ROADMAP.md` §2.3 dan
`docs/LANDING_PAGE_SPEC.md` §12.

---

## 1. Arah visual yang dipilih

**Nama arah: “Sakura Editorial”.** Dark-first · bento modular · tipografi editorial ·
glass tertahan.

### 1.1 Kenapa arah ini

Empat alasan, tiga di antaranya berasal dari repo sendiri — bukan dari tren.

| Alasan | Dasarnya |
|---|---|
| **Tren dan kode sepakat, bukan bertabrakan** | Riset 2026 menyebut *dark mode maturity*: tim profesional mendesain dark lebih dulu, terang menyesuaikan. Repo ini **sudah** begitu — `theme.css:45` menyatakan nilai dark sebagai default historis, dan `BaseLayout.astro:87` memulihkan `dark` saat storage kosong. Jadi arah tren ini **gratis** di sini, bukan migrasi |
| **Bento adalah bentuk yang sudah diisyaratkan desain acuan** | Panel acuan sudah memuat strip 4 statistik, 4 kartu angka, 6 ubin fasilitas, dan grid galeri — semuanya **paralel dan sejajar**. Bento hanya memberi aturan pada bentuk yang sudah ada, bukan memaksakan bentuk baru |
| **Rail kanan sudah jadi keputusan proyek** | `docs/LANDING_PAGE_ROADMAP.md` L6 meminta rail kanan desktop yang menjadi kartu bertumpuk di mobile. Itu persis pola *sticky rail* yang dipakai halaman profil perusahaan arus utama |
| **Halaman ini punya masalah kepercayaan, bukan masalah estetika** | Riset 30 situs rekrutmen 2026 menemukan **hanya 3 dari 30** mencantumkan jumlah lowongan aktif di halaman depan, dan **hanya 6 dari 30** menaruh pencarian di layar pertama. Dua hal termurah dan paling bernilai itu justru yang paling sering dilewat. ⚠ **KOREKSI 2026-09-25:** baris ini dulu dipakai sebagai *dasar* menaruh `N lowongan aktif` di beranda. Owner menghapus strip itu (beserta bar nav seksi dan marquee) — jadi risetnya tetap benar sebagai temuan, tapi **bukan lagi alasan** untuk menampilkan angka itu di `/`. Jangan mengutip baris ini untuk mengembalikannya |

### 1.2 Tren 2026 — apa yang dipakai, apa yang ditolak

Rujukan: *Bento Grid Web Design: The 2026 Trend Explained* (Hawd Design, 2 Apr 2026);
*UI Design Trends for 2026* (Midrocket, 12 Mar 2026); *30 Best Recruitment Websites
2026* (Colorlib, 10 Sep 2026); *Landing Page Best Practices: The Complete 2026 Guide*
(LanderLab, 30 Apr 2026).

| Tren | Dipakai? | Alasan / batas |
|---|---|---|
| **Bento / modular grid** | **Ya** | Grid 4 kolom desktop, 2 tablet, 1 mobile; gap 24 px (16 px mobile); `minmax(200px, auto)` tinggi baris; kartu hero 2×2, lebar 2×1, detail 1×1; **maksimum 8–10 kartu** dan **≤30 kata/kartu** |
| **Glassmorphism yang diperhalus** | **Ya, terbatas** | Hanya di atas artwork banner (hero, footer, CTA penutup). Translucency tipis + border gradien + bayangan lembut — **bukan** blur tebal. Di luar tiga permukaan itu, kartu memakai `surface` solid |
| **Dark-mode maturity** | **Ya** | Sudah jadi sifat repo (§1.1) |
| **Variable / kinetic typography** | **Sebagian** | Variable font: ya (§3.3, dengan syarat ukur `bundle:size`). Kinetic/morphing type: **tidak** — halaman ini dibuka lewat ponsel kelas menengah, dan teks yang bergerak menambah biaya tanpa menambah pemahaman |
| **3D / spatial** | **Tidak** | Riset sendiri menyimpulkan 3D hanya layak kalau memecahkan masalah pemahaman. Tidak ada masalah seperti itu di sini |
| **AI-driven adaptive layout** | **Tidak** | `AdminAiCopilot` sudah ada dan tidak diusik. Halaman publik tidak boleh menata ulang dirinya sendiri di depan kandidat yang baru pertama datang |
| **Scroll-jacking / animasi masuk per elemen** | **Tidak** | Bertabrakan dengan P7 dan dengan `prefers-reduced-motion` (`global.css:891-898`) |

### 1.3 Satu tegangan yang diselesaikan sadar

Riset landing page 2026 menempatkan **“hapus navigasi”** di urutan kedua prioritas,
di atas kecepatan. **Di sini aturan itu ditolak**, dan penolakannya ditulis supaya
tidak terlihat seperti kelalaian:

| Konteks riset | Konteks halaman ini |
|---|---|
| Halaman iklan berbayar, satu tawaran, pengunjung datang dari iklan | **Beranda portal** — pengunjung datang dari pencarian, punya banyak alasan berbeda, dan navigasi adalah produknya |
| Satu CTA | Dua peran nyata: pencari kerja **dan** kandidat yang sudah punya akun |
| Keluar dari halaman = kehilangan lead | Keluar dari halaman = menemukan lowongan yang cocok, yang **memang** tujuannya |

Tiga aturan riset lain **tetap dipakai**, dan itu yang mengubah desain:

1. **Pesan selaras** — `h1` harus menjawab “apa ini untuk saya”, bukan nama perusahaan.
2. **Bukti di atas fold** — angka kepercayaan harus terlihat sebelum menggulir.
3. **Kecepatan** — target LCP mobile di bawah 1,5 s; 53% pengunjung mobile meninggalkan halaman yang butuh lebih dari 3 s.

---

## 2. Perubahan token yang wajib (temuan terukur)

Empat temuan. Tiga di antaranya cacat yang **sudah ada di HEAD sekarang** dan tidak
terlihat sampai diukur.

### Status implementasi (2026-09-19)

Fase **L1** sudah dikerjakan di pohon kerja; angka di bawah adalah hasil sesudahnya.

| # | Temuan | Status | Bukti |
|---|---|---|---|
| **T-01** | `fg-subtle` gagal kontras AA | ✅ **selesai** | `theme.css` — nilai dark jadi `#8595aa` |
| **T-02** | `brand` tidak boleh dengan teks putih | 📄 aturan saja | tidak ada nilai token yang berubah; ini aturan pakai |
| **T-03** | `font-black` tanpa bobot 900 | ✅ **selesai** (900) / ⏸ **ditunda** (800) | `BaseLayout.astro` — impor `latin-900.css` |
| **T-04** | 39 nilai radius arbitrer | ✅ **selesai** | `theme.css` — 5 token `--radius-*` |

Ratchet sesudah L1: `lint-ratchet` **2476 = baseline** (0 diagnosis baru), `verify:classes`
**hijau** (1097 token / 186 berkas, semuanya punya rule), `tsc --noEmit` bersih, dan
inventaris indexer naik **+2 ts +3 astro** (437 → 442, terukur lewat
`indexer/src/count-indexed.test.ts`, bukan dihitung).

### T-01 · `fg-subtle` gagal kontras AA di dark

`--color-fg-subtle` = `#64748b`. Diukur dengan rumus WCAG 2.1 (luminance relatif):

| Pasangan | Rasio | Verdict |
|---|---|---|
| `#64748b` di `--color-surface` `#0f172a` | **3,75:1** | gagal AA teks normal |
| `#64748b` di `--color-surface-raised` `#1e293b` | **3,07:1** | gagal juga sebagai komponen UI (min 3:1) |
| `#64748b` di `--color-canvas` `#020617` | 4,24:1 | masih gagal |

Ini bukan warna hiasan. `fg-subtle` dipakai untuk label kolom tabel, meta kartu
lokasi, dan keterangan kecil — **teks yang harus dibaca**. Desain acuan memakai gaya
ini sangat banyak (`Lokasi: Osaka`, `10.00001`, meta kartu).

**Keputusan:** naikkan nilai dark-nya. Kandidat diukur, ambil yang lolos di **kedua**
permukaan:

| Kandidat | di `surface` | di `surface-raised` | Putusan |
|---|---|---|---|
| `#7c8ba1` | 5,16 | 4,22 | ditolak — gagal di `raised` |
| **`#8595aa`** | **5,85** | **4,79** | **dipakai** |
| `#8b9cb3` | 6,38 | 5,23 | cadangan kalau nanti butuh lebih terang |

Light theme tidak berubah: `#6b6661` di `#fbfafc` = **5,46:1**, sudah lolos.

### T-02 · `--color-brand` tidak boleh dipasangkan dengan teks putih

| Pasangan | Rasio | Verdict |
|---|---|---|
| putih di `--color-brand` `#10b981` | **2,54:1** | gagal telak |
| `--color-brand-fg` `#04211a` di `#10b981` | **6,69:1** | lolos |

**Aturan:** permukaan `brand` **selalu** berpasangan dengan `brand-fg`. Kalau teks
putih wajib, pakai `#047857` (5,48:1). Ini sudah sejalan dengan perbaikan lama di
`global.css:967-996` yang mendongkrak `-600` → `-700` untuk amber/emerald/sky — aturan
ini hanya menutup keluarga `brand` yang luput.

### T-03 · `font-black` dipakai 64×, tapi bobot 900 tidak pernah dimuat — ✅ selesai

Diukur 2026-09-19: satu-satunya muka font yang dideklarasikan adalah
`font-weight: 400 / 600 / 700` (dibaca dari
`@fontsource/inter/latin-{400,600,700}.css`). Sementara `font-black` (=900) muncul
**64 kali** dan `font-extrabold` (=800) **21 kali** di `src/`. Tidak ada muka 900,
jadi tidak ada yang bisa dicocokkan: setiap judul “hitam” jatuh ke bobot terdekat yang
ada (700), dan hierarki 700-vs-900 yang dimaksud **tidak ada di mana pun** di aplikasi.

**Koreksi atas rencana awal.** Dokumen ini semula menyarankan pindah ke variable font
(`@fontsource-variable/inter`). Itu tidak perlu: paket statis `@fontsource/inter` yang
**sudah terpasang** memuat `latin-800.css` dan `latin-900.css`. Jadi perbaikannya satu
baris impor, tanpa dependensi baru.

**Yang dikerjakan:** `@fontsource/inter/latin-900.css` ditambahkan di
`BaseLayout.astro`. Biayanya diukur dari berkasnya, bukan dikira:

| Bobot | Ukuran woff2 (latin) |
|---|---|
| 400 | 23,1 KB |
| 600 | 23,9 KB |
| 700 | 23,8 KB |
| **900 (ditambahkan)** | **23,3 KB** |
| 800 (ditunda) | 23,8 KB |

Tiga bobot lama = **70,8 KB**; sesudah ditambah 900 = **94,1 KB**. Anggaran
`npm run bundle:size` tetap harus dijalankan sebelum dan sesudah.

**Yang ditunda, dengan alasannya.** Bobot 800 **tidak** ditambahkan: biayanya 23,8 KB
untuk tingkat yang secara visual hampir tidak bisa dibedakan dari 900. Dua jalan keluar
— tambahkan mukanya, atau pindahkan 21 pemakaian `font-extrabold` ke `font-black` —
diputuskan bersama pekerjaan tipografi di L2/L3, **bukan** di fase fondasi, karena 21
call site itu tersebar di layar admin dan kandidat dan mengubahnya semua adalah
perubahan visual yang lebih luas daripada yang boleh dibawa fase ini.

### T-04 · Tidak ada skala radius — 39 nilai arbitrer, 8 nilai berbeda — ✅ selesai

| Nilai arbitrer | Jumlah | Seharusnya |
|---|---|---|
| `rounded-[2rem]` | 25 | `rounded-band` |
| `rounded-[14px]` | 5 | `rounded-control` |
| `rounded-[20px]` | 2 | `rounded-card` |
| `rounded-[2.5rem]` | 2 | `rounded-band` |
| `rounded-[1.5rem]` | 2 | `rounded-panel` |
| `rounded-[28px]` | 1 | `rounded-panel` |
| `rounded-[24px]` | 1 | `rounded-panel` |
| `rounded-[1.3rem]` | 1 | `rounded-card` |

Nilai arbitrer **tidak bisa di-ratchet**: tidak ada token yang bisa dinaikkan atau
diturunkan, dan tidak ada cara melihat dari markah mana sudut yang lebih “resmi”.
Ganti dengan lima token di §3.4.

---

## 3. Token

Semua ditulis dalam bentuk yang **siap dipindahkan** ke `src/styles/theme.css`.
Blok dark masuk ke `@theme static { … }` (baris 44–136); nilai terang masuk ke
`html[data-theme="light"] { … }` (baris 148–172).

### 3.1 Warna — peran semantik

Angka kontras di kolom terakhir **diukur**, bukan diperkirakan.

| Token | Peran | Dark | Light | Kontras terukur (dark / light) |
|---|---|---|---|---|
| `--color-canvas` | latar halaman | `#020617` | `#fbfafc` | fg di atasnya 18,41 / 16,14 |
| `--color-surface` | panel, header, kartu | `#0f172a` | `#ffffffeb` | fg 16,30 / — |
| `--color-surface-raised` | modal, kartu menonjol | `#1e293b` | `#f3eff3f2` | fg 13,45 / — |
| `--color-surface-sunken` | input, sumur | `#000000` | `#ffffff` | — |
| `--color-fg` | teks utama | `#f1f5f9` | `#1f1d1c` | 16,30 / 16,14 |
| `--color-fg-muted` | teks sekunder | `#94a3b8` | `#4a4642` | 6,96 / 8,99 |
| `--color-fg-subtle` | label kecil, meta | **`#8595aa`** | `#6b6661` | 5,85 / 5,46 |
| `--color-line` | garis pemisah | `#334155` | `#d6d1d3` | — |
| `--color-line-strong` | garis tegas | `#475569` | `#b9b1b4` | — |

`fg-subtle` yang dicetak tebal adalah **perubahan T-01**. Sisanya tidak diusik.

### 3.2 Aksen — daftar tertutup, 6 peran

Enam peran ini **satu-satunya** warna aksen yang boleh muncul di komponen section.
Semuanya sudah ada sebagai token; **tidak ada warna baru**.

| Peran | Token | Dipakai untuk | Kontras dark / light |
|---|---|---|---|
| **Identitas** | `--color-accent` (pink) | Hero, footer, badge perusahaan, CTA utama pemilik | 9,84 / 5,80 |
| **Lowongan** | `--color-accent-sky` | Section Lowongan, kartu loker, tombol Lamar | 8,33 / 5,70 |
| **Magang & pendaftaran** | `--color-accent-emerald` | Program Magang, fasilitas, tombol WhatsApp | 9,29 / 5,27 |
| **Ujian** | `--color-accent-amber` | Pendaftaran Ujian, catatan biaya | 10,69 / 4,83 |
| **Kritis** | `--color-accent-red` | Status URGENT/CLOSE, aksi admin, hapus | 6,45 / 6,22 |
| **Formal & legal** | `--color-accent-violet` | Legalitas, dokumen resmi, e-sign | 6,56 / 6,83 |

**Aturan pakai.** Judul section memakai aksen **peran section**; kartu di dalamnya
boleh memakai aksen **peran kartu**. Dua-duanya dari tabel di atas. Tombol padat
memakai tier `-600`/`-700` (§3.2b), bukan tier aksen terang — aksen terang hanya untuk
teks dan ikon di atas permukaan gelap.

### 3.2b Tombol padat — tier yang lolos AA

Resep lama `bg-<warna>-600 + text-white` hanya lolos untuk sebagian keluarga.
Diukur ulang dengan rumus yang sama seperti `global.css:916-966`:

| Pasangan | Rasio | Verdict |
|---|---|---|
| putih di pink-600 `#db2777` | **4,60:1** | lolos — aman dipakai apa adanya |
| putih di rose-600 `#e11d48` | **4,70:1** | lolos — aman dipakai apa adanya |
| putih di red-600 `#dc2626` | 4,83:1 | lolos |
| putih di emerald-600 `#047857` | 5,48:1 | lolos (sudah didongkrak `global.css:972`) |
| putih di sky-600 `#0369a1` | 5,93:1 | lolos (sudah didongkrak `global.css:977`) |
| putih di amber-600 `#b45309` | 5,02:1 | lolos (sudah didongkrak `global.css:967`) |

**Konsekuensi untuk desain baru:** CTA utama boleh memakai **pink-600/rose-600 dengan
teks putih** tanpa pengecualian baru — dua keluarga itu sudah lolos mentah. Jangan
menambah keluarga baru ke blok koreksi `global.css`; pakai salah satu dari enam peran
di §3.2.

### 3.2c Warna brand tercetak: merah, dan kenapa ia tidak menjadi aksen digital

Company profile resmi (`docs/COMPANY_PROFILE_DATA.md` §1) memakai **merah murni**.
Diukur dari berkasnya: logo dominan `#ff0100`, `#fe0000`, `#ff0000`; sampul dominan
`#be3434` (19,1% area). Paletnya merah–hitam–putih, dengan sedikit emas pada emblem.

Ini **tidak** bertentangan dengan `--color-accent` pink, dan alasannya bukan selera:

| Pasangan | Rasio | Verdict |
|---|---|---|
| `#ff0000` sebagai teks di canvas terang `#fbfafc` | **3,84:1** | gagal AA teks normal |
| `#ff0000` sebagai teks di surface gelap `#0f172a` | **4,46:1** | gagal tipis |
| putih di atas `#ff0000` (tombol padat) | **4,00:1** | gagal AA teks normal |
| `#be3434` sebagai teks di canvas terang | 5,41:1 | lolos, tapi 3,17:1 di dark → gagal |
| `#f87171` di surface gelap | **6,45:1** | lolos — ini `--color-accent-red` dark |
| `#b91c1c` di canvas terang | **6,22:1** | lolos — ini `--color-accent-red` light |

Tiga kesimpulan:

1. **Merah murni logo tidak bisa dipakai sebagai warna teks di mana pun.** Ia hanya boleh
   menjadi *isi* (fill) sebuah marka — logo, ikon, garis. Sebagai tombol padat pun ia
   gagal.
2. **Satu-satunya pasangan merah yang lolos AA di kedua tema adalah token yang sudah
   ada**: `--color-accent-red` (`#f87171` dark / `#b91c1c` light). Jadi kalau merah
   dijadikan aksen identitas, ia menjadi **tidak bisa dibedakan** dari peran “Kritis”
   (URGENT/CLOSE) — dan itu tabrakan makna, bukan tabrakan nilai warna.
3. **Karena itu pink tetap aksen identitas digital**, dan merah tetap peran Kritis.
   Merah tercetak adalah **palet dokumen & cetak** (kop surat, poster, SK, akta), bukan
   palet antarmuka.

**Kalau pemilik tetap ingin merah di antarmuka**, tokennya sudah siap dan terukur:
permukaan `#be3434` dengan teks putih (5,63:1) untuk tombol padat, dan `#f87171` /
`#b91c1c` untuk teks. Yang wajib ikut berubah saat itu: peran “Kritis” harus pindah ke
keluarga lain (mis. `--color-accent-amber` dipertegas atau `accent-violet`), karena
tidak boleh ada dua peran berbeda yang tampil identik.

**Catatan yang lebih penting daripada warnanya.** Mockup desain memakai angka
“Berdiri Sejak 2015” dan “5+ Tahun Pengalaman”. Dokumen resmi menyebut **SINCE 2023**,
akta 15 Agustus 2023. Umur lembaga per 2026 adalah **3 tahun**. Angka mockup itu keliru
dan tidak boleh disalin — rinci di `docs/COMPANY_PROFILE_DATA.md` §12 K-1.

### 3.3 Tipografi

**Keluarga:** Inter, self-hosted (`@fontsource`). Satu keluarga, alasan lama tetap
berlaku: `theme.css:88` menaruh `--font-sans` sekali sehingga preflight ikut.

**Bobot yang boleh dipakai:** 400, 600, 700, **900**. Bobot **800 dilarang** sampai
T-03 ditutup sepenuhnya — mukanya belum dimuat, jadi `font-extrabold` akan jatuh ke 700
tanpa memberi tahu siapa pun.

Skala pakai `clamp()` supaya satu nilai benar di 390 px dan 1536 px tanpa media query.

**Sudah diterapkan** di `src/styles/theme.css` sebagai token `--text-*` beserta
sub-kunci `--line-height` dan `--letter-spacing`-nya, jadi `text-section` datang
lengkap dengan leading dan tracking-nya dan call site tidak bisa lupa. Bobot
**sengaja tidak** dijadikan sub-kunci: `--text-*--font-weight` akan membuat setiap
`text-body` tebal secara bawaan dan bertabrakan dengan 554 pemakaian `font-bold` yang
sudah ada. Bobot tetap keputusan call site.

| Peran | Kelas | Ukuran | Berat | Tracking | Line-height |
|---|---|---|---|---|---|
| Display (hero `h1`) | `text-display` | `clamp(2rem, 5vw, 3.5rem)` | 900→700 | `-0.02em` | 1.05 |
| Judul section (`h2`) | `text-section` | `clamp(1.5rem, 3vw, 1.875rem)` | 800→700 | `-0.01em` | 1.15 |
| Judul kartu (`h3`) | `text-card-title` | `1.25rem` | 700 | `0` | 1.3 |
| Body | `text-body` | `1rem` | 400 | `0` | 1.7 |
| Body kecil | `text-body-sm` | `0.875rem` | 400 | `0` | 1.65 |
| Label / eyebrow | `text-eyebrow` | `0.6875rem` | 700 | `0.18em`, uppercase | 1.2 |
| Caption meta | `text-caption` | `0.75rem` | 600 | `0.02em` | 1.4 |

**Aturan yang lahir dari riset, bukan selera:**

| Aturan | Angka | Sumber |
|---|---|---|
| `h1` maksimum **8 kata** | judul >8 kata menurunkan pemahaman; uji judul lebih dulu daripada elemen lain | LanderLab 2026 |
| Judul kartu **5–8 kata**, berorientasi manfaat | di luar itu kartu berhenti dipindai | Hawd 2026 |
| Baris pendukung kartu **12–15 kata**, satu kalimat | sama | Hawd 2026 |
| Total teks per kartu **≤30 kata** | di atas itu bukan bento lagi | Hawd 2026 |
| Kalimat body maksimum **15–20 kata** | 5.3% → 11.1% konversi saat tingkat baca diturunkan | LanderLab 2026 |

**Yang dihentikan:** `italic` pada judul, `tracking-[4px]`/`tracking-[6px]` pada teks
yang panjang, dan `font-black` pada teks di bawah 20 px. Ketiganya ada di HEAD
(`App.tsx:196-197`, `Footer.astro:35`) dan itulah yang membuat halaman terbaca
“lama” meskipun tokennya modern.

### 3.4 Radius

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--radius-control` | `0.75rem` (12 px) | tombol, input, chip persegi |
| `--radius-card` | `1rem` (16 px) | kartu, ubin bento |
| `--radius-panel` | `1.5rem` (24 px) | panel, kartu besar, rail |
| `--radius-band` | `2rem` (32 px) | hero, pita CTA, footer |
| `--radius-pill` | `9999px` | chip status, tab, tombol bulat |

Ini menggantikan seluruh 39 nilai arbitrer di T-04.

**Sudah diterapkan** di `src/styles/theme.css` sebagai token `--radius-*`, yang
menghasilkan utilitas `rounded-control` / `rounded-card` / `rounded-panel` /
`rounded-band` / `rounded-pill`. Skala bawaan Tailwind (`rounded-sm` … `rounded-4xl`,
`rounded-full`) **sengaja dibiarkan**: menghapusnya akan mematahkan 130 komponen tanpa
keuntungan terukur. Dibuktikan `verify:classes` — kelima token menghasilkan rule.

### 3.5 Spasi & ritme vertikal

Skala 4 px. Yang penting bukan skalanya, tapi **satu nilai untuk satu peran**.

| Peran | Mobile | ≥768 px | Catatan |
|---|---|---|---|
| Padding vertikal section | `3.5rem` | `5rem` | **satu** nilai untuk semua section (roadmap L1.3) |
| Jarak antar-kartu (gap grid) | `1rem` | `1.5rem` | 24 px adalah gap bento yang direkomendasikan; 8 px terlalu rapat, 48 px memutus hubungan antar-kartu |
| Padding dalam kartu | `1.25rem` | `1.5rem` | **wajib sama** untuk semua kartu dalam satu grid |
| Lebar kontainer | `1280px` | `1280px` | `max-w-7xl`; gutter `1rem` → `2rem` |
| Tinggi baris bento minimum | `auto` | `200px` | `grid-auto-rows: minmax(200px, auto)` |
| Lebar rail kanan | — | `22rem` | `grid-template-columns: minmax(0, 1fr) 22rem` |

### 3.6 Elevasi, border, glass

Halaman ini **tidak memakai skala bayangan bertingkat**. Permukaan dipisahkan oleh
**border**, bukan bayangan — karena latar dark membuat bayangan hampir tidak terbaca,
dan karena 39 kartu dengan `shadow-2xl` bersaing satu sama lain.

| Tingkat | Aturan | Dipakai untuk |
|---|---|---|
| 0 · datar | `bg-surface` + `border-line` | kartu biasa, rail card |
| 1 · terangkat | `bg-surface-raised` + `border-line-strong` | modal, popover, kartu terpilih, **pita CTA penutup** |
| 2 · artwork | `bg-cover bg-center` + overlay gradien | hero dan footer **saja** |
| Glass | `backdrop-blur-md` + `bg-black/45` + `border-white/15` | **hanya** di atas tingkat 2 |

**Pita CTA penutup tidak memakai artwork** — keputusan L2 yang mengoreksi dokumen ini.
Alasannya bukan estetika: artwork banner dipilih saat runtime dari `asj_theme`, dan peta
tema→artwork itu **sudah** ada di dua tempat (`App.tsx` dan skrip `Footer.astro`).
Salinan ketiga untuk pita CTA adalah salinan yang akan menyimpang, dan band yang
berganti tema sementara header/footer juga berganti adalah bug yang **sudah pernah
terjadi** dan tercatat di komentar `Footer.astro`. Permukaan `surface-raised` + ring
aksen sama kuatnya, tidak menambah byte, dan tidak bisa keluar dari langkah tema.
Akibatnya halaman ini punya **satu** area glass, bukan dua.

**Glass dibatasi.** `backdrop-filter` memaksa compositor bekerja tiap frame di area
yang dicakupnya. Di ponsel kelas menengah itu biaya nyata. Karena itu glass hanya
boleh muncul di atas artwork (maksimum **satu** area glass per layar), dan **tidak
boleh** di dalam elemen yang bergulir. `motion.css §5` sudah memuat catatan biaya ini;
aturan ini hanya menegakkannya.

### 3.7 Gerak

Tiga kurva, sudah ada di `theme.css:106-108`. Tidak ada kurva keempat.

| Kurva | Nilai | Untuk |
|---|---|---|
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | UI masuk — default |
| `--ease-in-out-soft` | `cubic-bezier(0.4, 0, 0.2, 1)` | gerak bolak-balik (drawer, akordeon) |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | umpan balik sentuh langsung saja — **tidak pernah** untuk tata letak |

Durasi default 180 ms (`theme.css:113-114`). Yang boleh dianimasikan **hanya**
`opacity` dan `transform`. `width`, `height`, `top`, `left`, dan `background-color`
pada elemen seluas viewport **dilarang** — `BaseLayout.astro:139-142` sudah pernah
membayar kesalahan itu (30 repaint layar penuh per toggle tema).

Setiap animasi baru **wajib** terlihat wajar saat `prefers-reduced-motion: reduce`
(`global.css:891-898` menetralkannya jadi 0,01 ms).

### 3.8 z-index

Sudah lengkap di `theme.css:78-84`. **Tidak ada token baru yang diperlukan** untuk nav
baris atas desktop (L4): bar itu hidup **di dalam** header, yang sudah memakai
`--z-index-header` (90), jadi ia tidak butuh tingkat tumpukan sendiri. Menambah token
yang tidak dipakai hanya menambah permukaan yang harus dijaga.

| Token | Nilai | Dipakai |
|---|---|---|
| `--z-index-sticky` | 50 | header tabel lengket, bar section |
| `--z-index-header` | 90 | header situs |
| `--z-index-drawer` | 100 | drawer |
| `--z-index-modal` | 200 | modal |
| `--z-index-popover` | 300 | dropdown, tooltip |
| `--z-index-toast` | 400 | toast |
| `--z-index-loader` | 9999 | overlay boot |

`Z_INDEX` lokal di `App.tsx:15` (OVERLAY 35, NAV 40, HAMBURGER 30) **tetap** dipakai
untuk permukaan di dalam header. Jangan mencampur keduanya di satu elemen.

### 3.9 Ikon

**Satu sumber: sprite.** `src/icons/sprite.svg`, 155 glyph, dirender lewat
`<Icon name="…" />` (`src/components/ui/Icon.tsx`). Tidak ada ikon inline baru, tidak
ada webfont, tidak ada CDN.

Aturan aksesibilitas sudah dipangku komponen: ikon **dekoratif secara default**
(`aria-hidden`), dan hanya memakai `label` kalau ikon itu satu-satunya pembawa makna.

Nama ikon yang **dipakai** desain baru (semuanya sudah ada di sprite, terverifikasi):

| Keperluan | Nama |
|---|---|
| Navigasi & aksi | `bars` `times` `search` `filter` `chevron-down` `chevron-right` `arrow-right` `external-link-alt` |
| Lowongan | `briefcase` `map-marker-alt` `venus-mars` `clock` `tag` `file-alt` |
| Program & layanan | `graduation-cap` `passport` `laptop-code` `hand-holding-usd` `hotel` `bed` `wifi` `utensils` `tshirt` `motorcycle` `futbol` |
| Kepercayaan | `shield-halved` `shield-alt` `medal` `check-circle` `check-double` `star` `handshake` `building` `users` `user-check` |
| Kontak | `whatsapp` `instagram` `tiktok` `envelope` `phone` `location-arrow` `globe` `language` |
| Legal | `file-signature` `clipboard-check` `id-badge` `university` `certificate` |
| Proses | `route` `list-ol` `plane-departure` `signature` `id-card` `plane` |

---

## 4. Layout

### 4.1 Kontainer & breakpoint

| Nama | Lebar | Yang berubah |
|---|---|---|
| `sm` | 640 px | kartu bento 1 → 2 kolom |
| `md` | 768 px | drawer → nav baris atas; tabel loker → kartu |
| `lg` | 1024 px | bento 2 → 3 kolom; rail mulai tampil sebagai kolom |
| `xl` | 1280 px | rail kanan penuh; kontainer maksimum |

Kontainer **satu**: `max-w-7xl mx-auto px-4 md:px-6` — dibungkus komponen `Section`
(roadmap L1.1), bukan diulang di markah.

### 4.2 Bento — aturan keras

| Aturan | Nilai | Alasan |
|---|---|---|
| Kolom desktop / tablet / mobile | 4 / 2 / 1 | di bawah 640 px setiap kartu jadi satu kolom penuh |
| Gap | 24 px desktop, 16 px ≤640 px | 24 px terasa seimbang; 8 px terlalu rapat, 48 px memutus kekerabatan |
| Tinggi baris minimum | 200 px | mencegah baris 120 px bersebelahan dengan 280 px, yang terbaca “rusak” |
| Kartu hero | span 2×2 | hanya **satu** per grid |
| Kartu lebar | span 2×1 | 2–3 per grid |
| Kartu detail | span 1×1 | 4–6 per grid |
| Jumlah kartu maksimum | 8–10 | di atas itu berhenti jadi bento dan jadi blok teks bergaya grid |
| Teks per kartu | ≤30 kata | sama |
| Urutan DOM = urutan baca | wajib | grid boleh mengubah **tampilan**, tidak boleh mengubah **urutan baca**. Untuk penempatan, pakai `grid-area` bernama, **jangan** `order` |
| Isi kartu | visual + judul + satu baris | visual boleh ikon/foto/ilustrasi; **jangan** foto stok generik yang tidak menyampaikan apa pun |

**Daftar putih section bento** (P2). Di luar daftar ini, layout **wajib** editorial:

| Section | Layout | Alasan |
|---|---|---|
| Statistik | bento 2×2 **di dalam hero** | paralel, angka, sejajar; dan bukti harus terlihat sebelum menggulir |
| Kenapa Jepang? | bento 3 ubin | tiga alasan yang setara, tidak berurutan |
| Program ASJ | bento 3 kartu | paralel, sebanding |
| Layanan ASJ | bento 3 kartu | paralel |
| Fasilitas & Dukungan | bento 6 ubin 1×1 | paralel, ikon |
| Galeri | grid gambar | paralel |
| Penempatan Kami | grid foto + daftar prefektur | paralel, empat prefektur setara |
| Tim & Kredensial | grid potret 3 kolom | paralel; enam jabatan setara |
| Tentang Kami | **editorial** 2 kolom | prosa 3 paragraf; bento kalah untuk teks panjang |
| Visi & Misi | **editorial** 2 panel | visi vs misi bukan dua hal yang setara |
| Legalitas | **daftar label–nilai** | hierarki nomor, bukan perbandingan |
| Alur & Persyaratan | **stepper berurutan** + daftar | riset: bento **kalah** untuk alur berurutan |
| Kontak | **daftar label–nilai** | bukan kartu sejajar |

Baris terakhir daftar itu adalah bagian yang paling mudah salah: memaksakan bento ke
alur 6 langkah akan terlihat modern dan terbaca kacau.

### 4.3 Rail kanan

Pola **satu DOM, dua bentuk** (roadmap L6.2). Tidak ada markah kedua yang bisa
menyimpang.

```
<div class="page-grid">          <!-- 1 kolom; ≥1280px: minmax(0,1fr) 22rem -->
  <main id="main-content"> … </main>
  <aside class="rail"> … </aside> <!-- ≥1280px: position sticky; top 5.5rem -->
</div>
```

| Sifat | Nilai |
|---|---|
| Lebar kolom | `22rem` |
| `position` | `sticky`, `top: 5.5rem`, `align-self: start` |
| Isi, urutan | Kontak → Lowongan ringkas → Galeri → Testimoni → Lokasi |
| Mobile | `aside` mengalir setelah `main` sebagai kartu bertumpuk; urutan sama |
| `#kontak` | id ada di kartu pertama rail, jadi nav bisa menautkannya di kedua bentuk |

Rail **tidak** menggandakan section apa pun. Kalau sesuatu ada di rail, ia **tidak
boleh** juga ada di kolom utama.

### 4.4 Tabel loker tetap ada

`LokerTable` **dipertahankan** (roadmap L5.5). Kartu loker adalah **tampilan kedua**,
bukan pengganti, sampai ada e2e yang mengukur kartu. Alasan: tabel itu sudah punya
`LokerDetailModal`, pamflet, badge gender, dan pensortiran yang sudah diuji, dan
`e2e:loker-layout` mengukur **tabel**. Menukar permukaan teruji dengan permukaan
belum diuji dalam satu commit adalah kemunduran, bukan kemajuan.

---

## 5. Katalog komponen

Setiap komponen baru hidup di `src/components/public/`. Semua memakai token §3 — tidak
ada warna, radius, atau durasi literal di dalam komponen.

### 5.1 Tombol

| Varian | Permukaan | Teks | Border | Dipakai |
|---|---|---|---|---|
| `primary` | `accent` padat tier -600 | putih | — | satu per layar: aksi utama section |
| `secondary` | `surface-raised` | `fg` | `line-strong` | aksi pendamping |
| `ghost` | transparan | `fg-muted` → `fg` saat hover | — | aksi ketiga, tautan baris |
| `on-artwork` | glass | `fg` | `white/25` | CTA di atas banner |
| `danger` | `accent-red` -600 | putih | — | hapus, tolak |

| Sifat | Nilai |
|---|---|
| Tinggi minimum | 44 px; **48 px** untuk tombol di dalam formulir mobile |
| Radius | `rounded-control` |
| Padding | `0.875rem 1.25rem` |
| Berat | 700 |
| Status | default, hover (tier -700), aktif (turun 1 px), fokus (ring §6.2), nonaktif (`opacity 0.5`, tanpa pointer), memuat (ikon `spinner` + label tetap) |

**Aturan CTA (riset).** Halaman panjang seperti ini justru untung dari CTA berulang:
satu di hero, satu setelah blok program, satu di pita penutup. Teks CTA menyebut
**hasil**, bukan tindakan — “Lihat Lowongan”, bukan “Klik di sini”. Varian orang
pertama (“Cari Lowongan **Saya**”) diukur 14% lebih baik di riset, tapi terasa janggal
dalam bahasa Indonesia; simpan sebagai varian A/B, jangan paksakan.

### 5.2 Chip & badge

| Komponen | Bentuk | Warna | Catatan |
|---|---|---|---|
| `Chip` program (SSW/Magang/Penempatan) | `rounded-pill`, ikon + teks | glass di atas artwork; `surface-raised` di luar | tinggi 32 px, teks `text-caption` |
| `StatusBadge` | `rounded-pill`, teks uppercase | `accent-emerald` OPEN · `accent-amber` URGENT · `accent-red` CLOSE | **selalu** bawa teks, tidak pernah warna saja (§6.6) |
| `CountBadge` | `rounded-pill`, angka | `accent-sky` | untuk jumlah lowongan |

### 5.3 SectionHeader

Satu komponen, tiga slot: `eyebrow` → `h2` → deskripsi. Opsional slot aksi di kanan
(“Lihat semua →”), yang **hanya** dirender kalau ada tujuan nyata (roadmap L5.6 —
kalau belum ada halaman tujuan, tombolnya **jangan dipasang**).

Ritme: eyebrow `text-eyebrow` aksen peran → `h2` `text-section` → deskripsi
`text-body-sm` `fg-muted`, lebar maksimum 60 karakter.

### 5.4 Kartu & ubin

| Komponen | Radius | Padding | Isi |
|---|---|---|---|
| `Card` | `rounded-card` | `1.25rem` / `1.5rem` | dasar, slot bebas |
| `StatTile` | `rounded-card` | `1.25rem` | angka (`text-section`, aksen) + label (`text-caption`, `fg-muted`) + ikon opsional |
| `ProgramCard` | `rounded-panel` | `0` (gambar penuh) | gambar + judul + satu baris + CTA |
| `JobCard` | `rounded-card` | `1rem` | lihat 5.5 |
| `TestimonialCard` | `rounded-panel` | `1.5rem` | kutipan + nama + kota + rating |
| `GalleryTile` | `rounded-card` | `0` | gambar, `width`/`height` eksplisit, `loading="lazy"` |
| `RailCard` | `rounded-panel` | `1.25rem` | judul + isi, dipakai lima kali di rail |

`StatTile` adalah tempat P4 ditegakkan: komponennya **menerima** nilai sebagai prop,
tidak pernah memuat angka.

### 5.5 JobCard

Kartu ini menggantikan baris tabel **hanya di kolom utama**, dan harus membawa
informasi yang sama supaya tidak ada yang hilang saat berpindah bentuk.

| Bagian | Sumber | Catatan |
|---|---|---|
| Gambar | `job.pamflet` | rasio 3:4, `width`/`height` eksplisit, `loading="lazy"`; kalau kosong → bidang aksen dengan ikon `briefcase` |
| Kode | `job.code` | `font-mono`, `text-caption`, `accent-sky` |
| Judul | `jobTitleLabel(job.pekerjaan)` | `text-card-title` |
| Bidang | `jobCategoryLabel(job.kategori)` | `text-caption`, `fg-muted` |
| Lokasi | `jobLocationLabel(job.lokasi)` | ikon `map-marker-alt` + teks |
| Gender | `jobGenderLabel(job.gender)` | badge, **teks** bukan hanya ikon |
| Status | `job.status` | `StatusBadge` |
| Aksi | — | “Lihat Detail” membuka `LokerDetailModal` yang sudah ada; “Lamar” ke `/apply?job=<code>` |

**Wajib:** seluruh pemetaan label memakai `src/lib/jobDisplay.ts`. **Jangan** membuat
pemetaan kedua — itu satu-satunya tempat nilai data diterjemahkan, dan duplikatnya akan
menyimpang pada hari pertama ada kategori baru.

### 5.6 AnchorTabs (pengganti tab lama)

Tab lama di `index.astro:58-99` adalah 42 baris `is:inline` yang menyalakan/mematikan
`hidden`+`block` dan mengganti **6 kelas Tailwind satu per satu**, tanpa test. Desain
baru memakai **anchor**:

| Sifat | Nilai |
|---|---|
| Bentuk | deretan tautan, bukan tombol; `rounded-pill` |
| Target | `#loker` `#program` `#layanan` `#tentang` `#proses` `#kontak` |
| Status aktif | dari posisi gulir (`IntersectionObserver`), bukan `:hover` |
| Sinkron URL | `history.replaceState`, menggantikan `history.replaceState(null,'','#'+tab)` yang ada |
| Logika | pindah ke modul bertest `src/lib/publicSections.ts` (roadmap L0.1) |

Modul itu mengembalikan **keadaan**, bukan kelas: `{ active, sections }`. Tidak ada
nama kelas Tailwind di dalamnya.

### 5.7 StepList (Bagaimana Prosesnya)

Enam langkah: Daftar → Lengkapi Profil → Pilih Lowongan → Seleksi → Pemberkasan →
Berangkat. Nomor **tegas dan berurutan** (1..6), bukan grid sejajar — riset
menempatkan alur berurutan sebagai kasus di mana bento **kalah**.

Mobile: satu kolom, garis penghubung vertikal. Desktop: 6 kolom dengan garis
horizontal, **atau** 3×2 kalau labelnya panjang. Panah (`arrow-right`) hanya dipakai
di desktop; di mobile arahnya sudah jelas dari urutan.

### 5.8 ClosingBand

Pita penuh lebar di atas footer: `h2` satu kalimat + dua CTA (primary + secondary),
di atas artwork dengan overlay. Satu-satunya tempat selain hero yang boleh memakai
glass (§3.6).

### 5.9 BottomNav

`BottomNav.tsx:19` sekarang menolak tamu (`if (!show || !auth.isLoggedIn) return null`).
Desain acuan meminta versi tamu dengan empat tombol: Beranda / Lowongan / Program /
Profil.

**Ini keputusan produk, bukan keputusan CSS** (roadmap L7.1). Kalau diambil:

| Syarat | Nilai |
|---|---|
| Tinggi | 45 px — **satu** sumber, `--u-nav-h` (`layout.css:301`) |
| Clearance halaman | `.u-has-bottomnav` di `<main>` |
| Target sentuh | ≥44 px, idealnya 48 px |
| z-index | di bawah drawer (100) dan modal (200) |
| Bentrok yang wajib dicek | `settings-limit` gate, dan `Z_INDEX` di `App.tsx:15` |

---

## 6. Aksesibilitas

### 6.1 Outline heading — satu `h1`

`e2e/test-headings.mjs` menegakkan **tepat satu `h1`** per rute. Di `/` sekarang yang
memegang `h1` adalah nama perusahaan (`App.tsx:197`), bukan judul halaman.

**Keputusan (roadmap §2.1 opsi A):** nama perusahaan di header turun jadi `<div>`, dan
hero memegang `h1`. Alasannya bukan selera: `h1` yang berbunyi “PT Amanah Sakura Japan”
tidak menjelaskan halaman apa ini kepada pembaca layar maupun mesin pencari
(WCAG 2.4.2 “Page Titled” level A).

Outline hasilnya:

| Tingkat | Isi |
|---|---|
| `h1` | “Karier ke Jepang, dimulai dari sini.” — **satu**, di hero |
| `h2` | satu per section: Statistik, Lowongan Terbaru, Program ASJ, Layanan ASJ, Tentang Kami, Visi & Misi, Legalitas, Fasilitas, Proses, plus setiap judul RailCard |
| `h3` | judul di dalam kartu, judul langkah |
| `h4` | hanya label sub-bagian di dalam kartu |

**Jangan** memakai `div` bergaya judul. `test-headings.mjs` ada justru karena `/master`
pernah punya 12 “judul section” yang hanya **terlihat** seperti judul.

### 6.2 Fokus

`global.css:812` sudah punya aturan ring global. Yang wajib dipertahankan di komponen
baru:

- Ring **selalu terlihat** di atas artwork — karena itu CTA di atas banner memakai
  `on-artwork` dengan border `white/25`, bukan permukaan transparan tanpa border.
- Urutan fokus mengikuti urutan DOM (§4.2).
- Drawer menulis `inert` di **layout effect** (`App.tsx:138-141`). Jangan memindahkan
  itu ke `useEffect` — pernah terukur meninggalkan enam Tab stop di drawer tertutup.
- Fokus kembali ke pemicu saat drawer tertutup, dengan penjaga di `App.tsx:173-176`.
  Kalau menambah tombol baru di drawer, jangan menyentuh penjaga itu.

### 6.3 Kontras

Tabel lengkap di §3.1 dan §3.2 — semuanya diukur. Tiga angka yang wajib diingat:

| Aturan | Angka |
|---|---|
| Teks normal minimum | 4,5:1 |
| Teks besar (≥24 px, atau ≥18,66 px tebal) | 3:1 |
| Komponen UI & batas kontrol | 3:1 |
| `fg-subtle` **hanya** untuk teks besar/tebal, atau dinaikkan ke `#8595aa` | T-01 |

### 6.4 Target sentuh

| Konteks | Minimum |
|---|---|
| Umum | 44 × 44 px |
| Di dalam formulir mobile | **48 × 48 px** — target di bawah 44 px menaikkan salah-tekan 31% |
| Jarak antar-target | ≥8 px |

### 6.5 Gerak

`global.css:891-898` menetralkan seluruh animasi saat `prefers-reduced-motion`. Yang
wajib dijaga penulis komponen: animasi yang **membawa informasi** (mis. transisi status)
tidak boleh bergantung pada animasinya — informasi harus sudah ada di DOM sebelum
animasi berjalan.

### 6.6 Bentuk & warna bukan satu-satunya pembawa makna

`StatusBadge` selalu membawa **teks** (“OPEN”, “URGENT”, “CLOSE”), bukan hanya warna.
Badge gender memakai **teks** (“Pria / Wanita”), bukan hanya ikon `venus-mars`.
Berlaku untuk setiap penanda status baru.

---

## 7. Konten & i18n

### 7.1 Aturan kunci

Setiap teks baru **wajib** ada di `src/store/i18n.ts` **dan** `src/store/i18n-jp.ts`
— dijaga `i18n.keys.test.ts`. Mutu terjemahan Jepang boleh menyusul; **kunci yang
hilang tidak boleh**.

Namespace untuk halaman ini:

| Namespace | Isi | Sudah ada? |
|---|---|---|
| `profile.*` | section profil perusahaan yang baru | **baru** |
| `landing.*` | program, layanan, peta | sudah ada (`i18n.ts:1074-1087`) |
| `header.*` | nav, login, nama perusahaan | sudah ada |
| `ui.*` | tombol umum, status | sudah ada |
| `jobcat.*`, `option.*` | nilai data loker | sudah ada, dipakai `jobDisplay.ts` |

### 7.2 Larangan angka hardcode

Tidak ada satu pun angka statistik yang boleh diketik di markah. Tabel sumber ada di
`docs/LANDING_PAGE_SPEC.md` §8. Aturan ini bukan soal kerapian: **angka karangan di
halaman profil perusahaan adalah klaim hukum**, bukan hiasan.

### 7.3 Panjang teks

Lihat §3.3. Yang paling sering dilanggar: judul kartu yang panjangnya satu kalimat
penuh. Kalau judul kartu tidak muat dalam 8 kata, isinya bukan judul kartu.

---

## 8. Tata kelola

### 8.1 Gate yang menjaga tampilan

| Gate | Menjaga apa | Kalau dilanggar |
|---|---|---|
| `e2e:headings` | tepat satu `h1` per rute, outline tidak terbalik | merah dengan nama rute |
| `e2e:drawer` | kontrak keyboard drawer; **jumlah nav berlabel sama** | merah, atau **hijau palsu** kalau nav kedua ditambah (§0 P6) |
| `e2e:loker-layout` | tata letak tabel loker | merah |
| `verify:classes` | kelas yang dipakai benar-benar terdefinisi | merah — **tapi lihat jebakan 8.2.3** |
| `bundle:size` | anggaran bundel (font, CSS, JS) | merah — jalankan sebelum/sesudah T-03 |
| `verify:pwa` | manifest & service worker | merah |
| `lint-ratchet` | tidak menambah temuan lint | merah |
| `typecheck:ratchet` | tidak menambah galat tipe | merah |
| `verify:md` | tabel markdown tidak rusak | merah |

### 8.2 Empat jebakan yang sudah menggigit

Ditulis di sini karena tiga di antaranya **tidak menimbulkan galat** — hanya hasil yang
salah.

1. **Satu `h1`, satu landmark nav.** Menambah `<nav aria-label="Primary navigation">`
   kedua membuat `querySelector` membaca elemen pertama dan sebagian asersi **lolos tanpa
   membuktikan apa pun** — di `e2e/test-drawer.mjs:71` **dan**
   `src/components/App.header.test.tsx:106`. Keduanya tanpa asersi jumlah, jadi tidak ada
   satu pun yang akan memberi tahu Anda. Perluas `<nav>` yang ada.
2. **Kelas yang ditulis di komentar tetap dihitung “terpakai”.** `verify-classes.mjs`
   mengambil token dari mana saja, termasuk komentar. Kalau menghapus pemakaian sebuah
   kelas, **jangan tulis namanya lagi di komentar**.
3. **Angka ratchet diukur ulang di HEAD, bukan dihitung dari keyakinan.** Dan ratchet
   berbasis total **buta pada kelonggaran**: berkas yang naik tetap GAGAL
   (`lint-ratchet` kondisi 3).
4. **`.astro` di dalam komentar tetap diparse indexer.** Menulis nama tag berhuruf
   besar di komentar HTML `src/**/*.astro` menghasilkan rujukan hantu dan
   `indexer/src/build.test.ts` gagal. Sudah terjadi sekali di `BaseLayout.astro:40-42`.

### 8.3 Urutan mengerjakan

**L0 → L1 → L2 → L3 → L4 → L5 → L6 → L7 → L8**, satu fase hijau sebelum lanjut
(`docs/LANDING_PAGE_ROADMAP.md` §5). Dokumen ini adalah isi **L1** (fondasi desain);
`docs/LANDING_PAGE_SPEC.md` memetakan setiap section ke fasenya.

**Definisi selesai satu fase** tidak dinegosiasikan: `npx tsc --noEmit` bersih,
`npx vitest run` hijau, `npm run lint-ratchet` PASSED, `npm run build` bersih
(termasuk `build-sw-manifest`), gate baru **dibuktikan bisa gagal**, commit per berkas,
dan **tidak push** (`main` lokal 90 commit di depan `newrepo/main`; push = deploy).

---

## 9. Yang sengaja tidak dipakai

| Ditolak | Alasan |
|---|---|
| Skala bayangan bertingkat (`shadow-sm/md/lg/xl/2xl`) | Di latar dark bayangan nyaris tak terbaca; hierarki dipikul border (§3.6) |
| Glass di dalam area bergulir | `backdrop-filter` membayar per frame; ponsel kelas menengah jadi korban |
| Kartu bersarang di dalam kartu | Kedalaman visual dari tumpukan kartu, bukan dari tata letak. Satu tingkat saja |
| Teks gradien pada judul | Turunkan kontras, dan tidak ada masalah yang dipecahkannya |
| Ikon sebagai satu-satunya label | Melanggar §6.6 |
| Carousel otomatis untuk testimoni | Bergerak tanpa diminta; pemakai pembaca layar kehilangan kendali. Ganti dengan daftar yang bisa digulir |
| Animasi masuk per elemen saat menggulir | Biaya tanpa pemahaman, dan bertabrakan dengan `prefers-reduced-motion` |
| CMS / migrasi framework | Halaman ini statis + satu island. Tidak ada masalah yang CMS selesaikan sekarang |
| Menyalin alamat `Jl. Raya Kalimalang` dari gambar acuan | Sudah diperiksa terhadap company profile resmi: alamat itu **tidak berasal dari dokumen resmi mana pun**. Yang terverifikasi: Ponorogo, Jawa Timur — cocok di `LayananSection.astro:169`, footer, dan PDF halaman 5/8/9 |
| Menyalin “Berdiri Sejak 2015” dan “5+ Tahun Pengalaman” dari gambar acuan | Company profile resmi menyebut **SINCE 2023** (akta 15 Agustus 2023). Angka mockup keliru; umur lembaga per 2026 = **3 tahun**. Rinci: `docs/COMPANY_PROFILE_DATA.md` §12 K-1 |

---

## 10. Bacaan berikutnya

- `docs/LANDING_PAGE_SPEC.md` — spesifikasi halaman yang siap diimplementasikan.
- `docs/COMPANY_PROFILE_DATA.md` — data resmi perusahaan (identitas, legalitas, visi &
  misi, struktur, program, persyaratan, alur, penempatan) + 10 konflik terverifikasi.
- `docs/LANDING_PAGE_ROADMAP.md` — urutan fase L0..L8 dan tiga jebakan terukurnya.
- `docs/UI_DESIGN_REVIEW.md` — §21 kelas yang hanya *kelihatan* seperti kelas, §23 heading.
- `docs/DEVELOPMENT_ROADMAP.md` — disiplin fase & pemicu ukur ulang.
- `src/styles/theme.css` — tempat seluruh §3 dipindahkan.
- `scripts/ci/review-manifest.json` — daftar gate; baca sebelum menambah gate baru.

### Sumber riset

| Sumber | Tanggal | Yang diambil |
|---|---|---|
| Bento Grid Web Design: The 2026 Trend Explained — Hawd Design | 2 Apr 2026 | Angka grid, gap, tinggi baris, batas kata, urutan DOM vs urutan baca, kapan bento kalah |
| UI Design Trends for 2026 — Midrocket | 12 Mar 2026 | Bento dominan, glass yang diperhalus, dark-first, variable font, 3D hanya kalau fungsional |
| 30 Best Recruitment Websites 2026 — Colorlib | 10 Sep 2026 | Urutan section, hero dua audiens, jumlah lowongan hanya 3/30, pencarian di fold 6/30, bukti 19/30 |
| Landing Page Best Practices: The Complete 2026 Guide — LanderLab | 30 Apr 2026 | Median 4,02% vs kuartil atas 11,45%; `h1` <8 kata; bukti di atas fold; target sentuh; LCP <1,5 s |
