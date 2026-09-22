# LANDING_PAGE_ROADMAP — Landing Page Profil Perusahaan (desktop modern, mobile menyesuaikan)

**Dibuat:** 2026-09-19 · **Basis ukur:** HEAD `41e64cc`, pohon kerja **bersih** (0 berkas kotor)
**Referensi desain:** `F:\desain\ChatGPT Image Sep 18, 2026, 02_28_29 PM.png` (desktop penuh + 7 panel mobile),
`F:\desain\ChatGPT Image Sep 18, 2026, 02_33_36 PM.png` (desktop 2/3 + mobile + rail kanan)
**Sumber angka:** `docs/AI_CV_FULL_FLOW.md`, `docs/TODO.md`, dan kode di HEAD — setiap angka di bawah
disebut perintah pengukurnya.

> **Aturan baca.** Dokumen ini **rencana**, bukan laporan selesai. Fase yang belum dikerjakan ditulis
> sebagai tugas dengan **kriteria terima yang bisa diukur**; fase yang sudah selesai ditandai tanggal
> dan commitnya. Kalau dokumen lain bertentangan, **hasil ukur yang menang**.
>
> **Konteks pemilik yang mengikat keputusan di sini:** *"UI nya masih jelek juga gapapa yg penting
> bener dulu untuk urusan ui belakangan next progress karena saya niat rombak total bentuk ui/ux nya
> baik destop dan mobile"* (2026-09-19). Rombak total itu **dimulai dari halaman ini**.

---

## 0. Ringkasan keputusan

**Halaman ini adalah rombak UI/UX pertama, bukan tempelan.** Karena itu urutannya dibalik dari
kebiasaan: kerangka halaman dulu (yang menentukan ritme & breakpoint), lalu bagian demi bagian.

| Blok | Isi | Risiko | Bisa jalan sendiri? |
|---|---|---|---|
| **L0** | Bekukan paritas: pindahkan JS tab yang tertanam di `index.astro` ke modul bertest | sedang | ya |
| **L1** | Fondasi desain: token, kontainer, tipografi, komponen kartu | rendah | ya |
| **L2** | Section Kerangka: hero, strip statistik, tab sebagai anchor | **tinggi** — menyentuh `App.tsx` | ya |
| **L3** | 8 section profil perusahaan (Tentang, Visi&Misi, Legalitas, Fasilitas, Galeri, Testimoni, Kontak, Lokasi) | rendah | ya, satu per satu |
| **L4** | Nav desktop yang diminta desain (Lowongan/Program/Layanan/Tentang) | rendah | ya |
| **L5** | Data nyata: legalitas, galeri, kontak, koordinat — **butuh isi dari pemilik** | rendah | sebagian |
| **L6** | Rail kanan desktop (Galeri, Testimoni, Kontak, Lokasi, Job Terbaru) | rendah | ya |
| **L7** | Mobile: bottom nav 3 tombol, rail jadi kartu bertumpuk | rendah | ya |
| **L8** | Gate & bukti: setiap bagian baru wajib punya penjaga yang bisa GAGAL | — | ya |

**Tiga hal yang menentukan seluruh rencana, dan sudah diukur:**

1. **`/` adalah `index.astro` + `App` + `LokerTable` + `LayananSection`.** Belum ada satu pun section
   profil perusahaan. Hero yang ada **bukan hero** — ia `<header>` di dalam `App.tsx:182`, tingginya
   `min-h-[14rem] md:h-56`, dan isinya hanya logo + tagline + nama perusahaan.
2. **Nav desktop harus masuk ke `<nav>` yang sudah ada, bukan `<nav>` baru.** `e2e/test-drawer.mjs`
   memilih drawer lewat **satu selektor bername**: `const NAV = 'nav[aria-label="Primary navigation"]'`
   (baris 71), dan seluruh pengukurannya (`drawerOpen`, `drawerState`, `focusInfo`, klik tombol Close,
   klik tombol Login) memakai `document.querySelector(NAV)` — **yang mengambil elemen PERTAMA**.
   Jadi `<nav>` kedua dengan `aria-label` yang sama akan membuat gate mengukur elemen yang salah,
   dan sebagian asersinya **lolos secara diam-diam**. Gate ini mengukur di **390×844** (baris 90),
   jadi pada viewport itu nav desktop `hidden md:flex` memang tidak mengambil fokus — tetapi
   `querySelector` tetap bisa menemukan elemen yang keliru. Detail + bukti di §2.3.
3. **Data untuk section yang diminta desain sebagian belum ada.** Yang **sudah ada**: loker (judul,
   kategori, lokasi, gender, status, kuota, gaji, pamflet, `createdAt`), pengumuman, program/layanan
   (3 kartu), nama+tagline perusahaan, WA/IG/TikTok/Maps. Yang **belum ada**: legalitas (5 nomor izin),
   galeri foto, testimoni, alamat surel, jam operasional, koordinat peta, klikable lihat semua.

---

## 1. Peta halaman hari ini — terukur di `41e64cc`

### 1.1 Yang benar-benar dirender `/`

| Lapis | Berkas | Baris | Peran |
|---|---|---|---|
| Layout | `src/layouts/BaseLayout.astro` | 80 | `<head>`, PWA, sprite 154 ikon, Inter, slot |
| Header + drawer | `src/components/App.tsx` | 279 | `<header id="asj-header">`, drawer, modal login |
| Konten loker | `src/components/public/LokerTable.tsx` | 255 | tabel + filter status + modal detail/pamflet |
| Konten layanan | `src/components/public/LayananSection.astro` | 174 | 3 kartu program + biaya + asrama + peta |
| Halaman | `src/pages/index.astro` | 100 | marquee, 2 tab, **100 baris `switchTab` inline** |
| Footer | `src/components/Footer.astro` | 79 | sosial + copyright |
| Bottom nav | `src/components/BottomNav.tsx` | — | hanya 2 peran login (admin 6 tombol / kandidat 3) |

### 1.2 Yang ada di desain tapi **tidak ada** di halaman

> **⚠ TABEL INI ADALAH SURVEI PRA-KERJA, BUKAN STATUS.** Ia direkam **sebelum
> L0–L8 dikerjakan**, dan setiap ❌/🟡 di bawah **benar pada saat itu** — itulah
> sebabnya fase-fase ini ada. **Jangan membacanya sebagai keadaan sekarang.**
> Terukur di HEAD `238748c` (2026-09-21): `e2e:landing` **exit 0** dengan
> *"15 spec sections × 2 widths, order + visibility + placeholders + anchors"*,
> dan `Tentang Kami` / `Visi & Misi` / `Galeri` **semuanya ada**.
>
> Dibiarkan utuh karena ia berguna sebagai catatan titik-berangkat, tapi
> **untuk status, ukur** — `BASE_URL=… npm run e2e:landing`. Angka statistiknya
> pun sudah digantikan: yang dipakai produk adalah **`2023` / `5` / `4`** dari
> `COMPANY_PROFILE_DATA.md` (L8.4), **bukan** `500+`/`200+`/`50+`/`5+` di baris
> bawah — angka mockup itu memang sengaja tidak dipakai.

`grep -c` terhadap `src/components/**` dan `src/pages/index.astro` untuk kata kunci tiap section:

| Section di desain | Ada? | Bukti |
|---|---|---|
| Hero besar + headline + 2 CTA + chip program | ❌ | `header` hanya logo/tagline/nama; tidak ada `h1` headline |
| Strip 4 statistik (2015 / 500+ / 200+ / 50+ / 5+) | ❌ | tidak ada string `500+`, `200+`, `50+` di `src/` |
| Nav desktop Lowongan/Program/Layanan/Tentang | ❌ | nav hanya drawer (`App.tsx:236`), tidak ada bar horizontal |
| Tentang Kami + kartu “Kantor Pusat” | ❌ | tidak ada string `Tentang Kami` |
| Visi & Misi (2 kartu) | ❌ | — |
| Legalitas & Izin Resmi (5 baris: SIUP/SIP3M/Akta/TDP/NIB) | ❌ | tidak ada string `SIUP`, `SIP3M`, `NIB` |
| Fasilitas & Dukungan (6 ikon) | 🟡 | hanya 4 item *asrama* di `LayananSection.astro:64`; sisanya belum |
| Galeri Perusahaan | ❌ | — |
| Testimoni Kandidat | ❌ | tidak ada string `Testimoni` |
| Informasi Kontak (alamat/tel/WA/email/jam) | 🟡 | WA/IG/TikTok/Maps ada di `Footer.astro`; **alamat, surel, jam operasional belum** |
| Lokasi Kami + peta | 🟡 | peta ada di `LayananSection.astro:168` berjudul *"Kunjungi LPK Amanah Sakura Japan"* |
| Lowongan Terbaru (kartu bergambar + filter Bidang/Lokasi/Program/Gender) | 🟡 | `LokerTable` adalah **tabel**, bukan kartu; filter hanya status |
| Program ASJ (SSW / Magang / Bahasa, 3 kartu) | 🟡 | 3 kartu ada di `LayananSection.astro` (Visa / Ujian / + asrama) — **isi berbeda** |
| Bagaimana Prosesnya? (6 langkah) | ❌ | — |
| CTA penutup (“Siap memulai perjalanan ke Jepang?”) | ❌ | — |
| Bottom nav 3 tombol Beranda/Lowongan/Program untuk tamu | ❌ | `BottomNav.tsx:19` → `if (!show \|\| !auth.isLoggedIn) return null` |

**Bacaan jujur:** dari **16** section yang diminta desain, **11 sama sekali belum ada** dan **5 punya
padanan yang bentuknya berbeda** (tabel vs kartu, drawer vs nav bar, peta perusahaan vs peta
pendaftaran). **Tidak ada satu pun yang sudah sesuai.** Ini **bukan** pekerjaan menggeser CSS.

---

## 2. Jebakan terukur — baca sebelum menyentuh halaman ini

Empat hal di bawah ini pernah menggigit, atau akan menggigit pada langkah pertama. Semuanya punya
berkas dan barisnya.

### 2.1 Satu `h1` untuk seluruh halaman

`e2e/test-headings.mjs` menegakkan **tepat satu `h1`** per rute. Saat ini yang menjadi `h1` di `/`
adalah `App.tsx:197` (`<h1>{t("header.company_name")}</h1>`), **bukan** headline hero.

**Konsekuensinya:** hero baru **tidak boleh** menambahkan `h1` kedua. Pilihannya cuma dua, dan
harus dipilih sadar:

| Opsi | Cara | Catatan |
|---|---|---|
| **A (disarankan)** | Turunkan nama perusahaan di header jadi `<div>`, hero memegang `h1` | `h1` jadi headline yang benar-benar menjelaskan halaman (§ SEO + WCAG 2.4.2) |
| B | Hero pakai `<h2>`, header tetap `h1` | Lebih murah, tapi `h1` tetap nama perusahaan — outline terbalik |

Kalau memilih A, `App.tsx:197` **wajib** ikut berubah; itu sebabnya L2 menyentuh `App.tsx`.

### 2.2 `switchTab` yang tertanam di `index.astro`

`src/pages/index.astro:58-99` memuat 42 baris skrip `is:inline` yang:
mengambil 4 elemen lewat `getElementById`, menyalakan/mematikan `hidden`+`block`, **mengganti 6 kelas
Tailwind satu per satu**, dan menyinkronkan `location.hash`.

Dua masalah nyata, bukan estetika:

1. **Menambah tab ketiga berarti menyunting 12 baris `classList`.** Tidak ada test yang menjaga
   daftar kelas itu; kalau satu kelas salah ketik, tab tetap "jalan" tapi warnanya diam — kelas yang
   salah ketik juga **tidak terdeteksi** `verify:classes` kalau bentuknya masih menyerupai utilitas.
2. **Tab adalah satu-satunya cara ke konten layanan.** Tidak ada anchor, tidak ada URL langsung ke
   section. Desain meminta **anchor**, jadi perilaku ini harus diganti, bukan ditambahi.

**Wajib:** pindahkan logika ini ke modul (mis. `src/lib/publicTabs.ts`) + test yang bisa GAGAL.
Kalau tidak, setiap tab baru menambah 6 kelas yang hanya ada di string.

### 2.3 `e2e/test-drawer.mjs` memilih drawer lewat **satu selektor bername**

Dibaca dari berkasnya (baris 71): `const NAV = 'nav[aria-label="Primary navigation"]'`. Setiap
pengukuran memakai `document.querySelector(NAV)` — **bukan** `querySelectorAll`, dan **tanpa**
penghitungan jumlah. Artinya yang diukur selalu **elemen pertama** yang cocok.

**Konsekuensi untuk nav desktop baris desain:**

| Pendekatan | Akibat |
|---|---|
| Tambah `<nav aria-label="Primary navigation">` kedua | ❌ `querySelector` bisa mengenai elemen yang salah. Sebagian asersi (mis. `inert`, `focusables`) lalu membaca nav yang keliru dan **lolos tanpa membuktikan apa pun** — gate tetap hijau sementara jaminan yang dijanjikannya hilang |
| Tambah `<nav>` dengan `aria-label` **berbeda** | 🟡 Gate aman, tapi halaman punya dua landmark navigasi tanpa hubungan — pembaca layar mengumumkan dua menu dan pengguna tak tahu bedanya |
| **Perluas `<nav>` yang ada** (label desktop `hidden md:flex`, tombol drawer `md:hidden`) | ✅ Satu landmark, satu elemen, gate tidak berubah. Selaras dengan keputusan lama di `App.tsx:200-203` (*"One menu surface for both viewports"*) |

**Catatan penting yang menghemat waktu Anda:** gate ini berjalan di **viewport 390×844**
(`test-drawer.mjs:90`), jadi nav desktop yang `hidden md:flex` memang tidak akan mengambil Tab stop
maupun merusak elektrodi fokus. Yang tetap berisiko hanyalah **selektor**, bukan tata letaknya —
dan itulah alasan baris pertama tabel di atas ditandai ❌ sementara orang biasanya menduga masalahnya
di CSS.

Kalau drawer tamu dilepas (agar halaman tamu hanya punya nav baris atas), gate ini **wajib ikut
diubah dalam commit yang sama** — dan sesudah diubah ia harus **dibuktikan masih bisa gagal**, kalau
tidak yang tersisa hanyalah gate yang selalu hijau.

### 2.4 Kelas yang diketik di dalam komentar tetap "terpakai"

`verify-classes.mjs:118-160` memuat temuan ini dua kali (`hamburger-btn`, `rt-full`): regex lama
mengambil token dari mana saja, termasuk dari komentar. Kalau sebuah kelas baru dihapus dari markah
tetapi namanya ditulis di komentar penjelasan, gate **tetap menganggapnya terpakai**.

**Aturan kerja:** kalau menghapus pemakaian kelas, **jangan tulis namanya lagi di komentar.**

---

## 3. Fase

Setiap fase: **satu fitur seluruh tumpukan**, hijau sebelum lanjut, commit per berkas, dan setiap
perbaikan membawa test yang **bisa gagal** (R3/R6 — skill `asj-session-rules`).

### L0 — Bekukan paritas tab *(prasyarat, tidak kelihatan, tapi murah)*

| # | Tugas | Kriteria terima |
|---|---|---|
| L0.1 | Pindahkan `switchTab` dari `index.astro` ke `src/lib/publicTabs.ts` | `index.astro` tidak lagi memuat `classList.add/remove` untuk tab |
| L0.2 | Modul mengembalikan **keadaan**, bukan kelas: `{active, panels}` | Tidak ada nama kelas Tailwind di dalam modul |
| L0.3 | Test: tab awal `loker`, `#layanan` membuka layanan, `hashchange` sinkron | Test **dibuktikan bisa gagal** (mutasi: paksa `active='loker'`) |

**Kenapa lebih dulu:** L2 mengganti tab jadi anchor. Kalau logikanya masih 12 baris `classList` di
dalam `.astro`, penggantian itu akan ditulis dua kali dan salah satunya tanpa test.

### L1 — Fondasi desain

| # | Tugas | Kriteria terima |
|---|---|---|
| L1.1 | Section wrapper tunggal (`Section`, `SectionTitle`, `Card`) di `src/components/public/` | Ketiga section pertama memakainya; tidak ada lagi `max-w-7xl px-4` berulang di markah |
| L1.2 | Skala tipografi section (eyebrow → judul → deskripsi) sebagai satu komponen judul | Judul di 3 section berbeda punya tinggi & warna identik |
| L1.3 | Ritme vertikal satu nilai (mis. `py-14 md:py-20`) dipakai semua section | Diukur: jarak antar-section sama di 390px dan 1280px |
| L1.4 | Warna aksen per section **hanya** dari daftar tertutup (pink=identitas, sky=lowongan, emerald=magang, amber=ujian) | `grep` menemukan 0 warna aksen di luar daftar di komponen section |

> **Catatan tema.** Halaman ini punya **tiga tema banner** (SAKURA / TOKYO / INTER_VIP) yang mengubah
> gambar header **dan** footer (`App.tsx:61`, `Footer.astro:58`). Section baru harus terbaca di
> ketiganya. Tema terang punya aturan khusus di `global.css:351-354` yang mengecualikan
> `.hamburger-btn` dan `.inset-0` — jangan menambah pengecualian baru tanpa alasan terukur.

### L2 — Kerangka: hero, strip statistik, tab→anchor

| # | Tugas | Kriteria terima |
|---|---|---|
| L2.1 | Hero baru: headline, subjudul, 2 CTA (Lihat Lowongan / Daftar Pelamar), chip program (SSW/Magang/Penempatan) | `h1` tunggal tetap; tes heading hijau untuk `/` |
| L2.2 | Putuskan nasib `h1` header (§2.1) dan jalankan | Pilihan tertulis di commit message; `test-headings` hijau |
| L2.3 | Strip statistik dari data **nyata** (§4) | Tidak ada satu pun angka yang di-hardcode di markah |
| L2.4 | Tab jadi **anchor** (`#loker`, `#layanan`, `#tentang`, …) yang bisa dibuka langsung | `curl /#tentang` menggulir ke section yang benar; tes L0.3 tetap hijau |
| L2.5 | Nav desktop **di dalam `<nav>` yang sudah ada** (§2.3) | Di 390×844 drawer tetap terukur & inert saat tertutup; jumlah `nav[aria-label="Primary navigation"]` tetap **1** |
| L2.6 | Perbarui `e2e/test-drawer.mjs` bila drawer tamu menjadi `md:hidden` | Gate hijau, dan gate itu **dibuktikan masih bisa gagal** |

> **Ini fase paling berisiko.** Ia menyentuh `App.tsx` (satu-satunya `<header>` di seluruh situs,
> disalin ke semua rute lewat `BaseLayout`). Kerjakan L2 di akhir sesi, bukan sebelum
> pekerjaan lain, supaya kalau `App.tsx` perlu di-revert, tidak ada yang setengah jalan.

### L3 — Delapan section profil perusahaan

Urut sesuai desain. Satu section = satu commit.

| # | Section | Data | Catatan |
|---|---|---|---|
| L3.1 | **Tentang Kami** | prosa 3 paragraf (data belum ada) | + kartu “Kantor Pusat” + tombol “Tentang Program Kami” |
| L3.2 | **Visi & Misi** | visi 1 kalimat + 4 poin misi | 2 kartu bersebelahan |
| L3.3 | **Legalitas & Izin Resmi** | **butuh pemilik** — 5 nomor izin | Tampilkan nomor **hanya kalau ada**; jangan tulis nomor contoh di produksi |
| L3.4 | **Fasilitas & Dukungan** | 6 item (sebagian dari asrama yang sudah ada) | Gabungkan dengan 4 item di `LayananSection.astro:64` — jangan duplikasi |
| L3.5 | **Galeri Perusahaan** | **butuh pemilik** — foto | Lazy + `width`/`height` eksplisit (CLS) |
| L3.6 | **Testimoni Kandidat** | **butuh pemilik** — nama/kota/teks/rating | Nama & kota harus yang **disetujui** kandidat |
| L3.7 | **Informasi Kontak** | alamat, telp, WA, surel, jam | Alamat muncul di desain (`Jl. Raya Kalimalang`); **verifikasi ke pemilik dulu** |
| L3.8 | **Lokasi Kami** | koordinat | Peta sudah ada di `LayananSection.astro:168` — **pindahkan**, jangan buat kedua |

**Aturan untuk L3.1–L3.8:** setiap section wajib muncul di **ketiga tema banner** dan di **390px**
serta **1280px**. Diukur, bukan dikira.

### L4 — Nav desktop

Sudah dikerjakan bersama L2.5. Fase ini hanya memuat:

| # | Tugas | Kriteria terima |
|---|---|---|
| L4.1 | Item nav: Lowongan · Program · Layanan · Tentang ASJ | Keempat anchor nyasar ke section yang ada |
| L4.2 | Penanda section aktif saat menggulir | Diukur dengan menggulir, bukan `:hover` |
| L4.3 | Tombol “Login Pelamar” + pemilih bahasa ID/JP di kanan | `toggleLang` yang ada dipakai ulang — jangan bikin state bahasa kedua |

### L5 — Data nyata (sebagian **butuh pemilik**)

Ini yang memisahkan "halaman bagus" dari "halaman benar". Sampai fase ini, section di atas masih
memakai prosa/angka statis.

| # | Tugas | Siapa | Kriteria terima |
|---|---|---|---|
| L5.1 | Statistik: 500+ kandidat, 200+ penempatan, 50+ mitra, 5+ tahun, “sejak 2015” | **pemilik** | Angka berasal dari satu sumber yang bisa ditunjuk |
| L5.2 | Legalitas: 5 nomor izin | **pemilik** | Nomor nyata; section disembunyikan bila kosong |
| L5.3 | Galeri & testimoni | **pemilik** | Berkas + izin tayang |
| L5.4 | Kontak: alamat, surel, jam operasional | **pemilik** | Cocok dengan Google Maps yang sudah ditautkan footer |
| L5.5 | Loker sebagai **kartu** + filter Bidang/Lokasi/Program/Gender | sendiri | Filter memakai `jobCategoryLabel`/`jobLocationLabel`/`jobGenderLabel` yang sudah ada; **tabel lama dipertahankan** sampai kartu terbukti setara |
| L5.6 | “Lihat semua” → daftar penuh | sendiri | Ada rute/halaman tujuan; kalau belum, tombolnya **jangan dipasang** |

> **Kenapa L5.5 menyebut `LokerTable` dipertahankan.** Tabel itu sudah punya `LokerDetailModal`,
> pamflet, badge gender, dan pensortiran yang sudah diuji. Menggantinya dengan kartu di commit yang
> sama berarti menukar satu permukaan teruji dengan satu permukaan belum diuji — dan gate
> `e2e:loker-layout` mengukur **tabel**. Kartu ditambahkan sebagai tampilan kedua, tabel jadi
> cadangan sampai e2e kartu ada.

> **⚠ TEMUAN 2026-09-21 (DIPERBAIKI, commit `3c12e51`).** `e2e:loker-layout`
> **MERAH PERMANEN** dan bukan regresi: gate menunggu `.u-scroll-x tbody tr` di
> `/`, tetapi `/` **sudah tidak punya tabel sama sekali** — diukur dengan probe:
> **0 tabel, 0 `.u-scroll-x`**, tanpa error konsol, halaman 191 KB termuat.
> `u-scroll-x` kini hanya ada di **panel admin**.
>
> Sebabnya `e9317cf` memindahkan `LokerTable` ke rute `/loker`, dan
> `src/pages/index.astro:159` mendokumentasikan bahwa sistem tab Loker dihapus.
> **Ini bertentangan dengan paragraf di atas**, yang menyatakan tabel
> **seharusnya dipertahankan** justru karena gate ini mengukurnya.
>
> **Pilihan yang diambil: pindahkan gate ke `/loker`.** Paragraf di atas tetap
> berlaku — tabel memang harus dipertahankan — dan `/loker` **memang tempat tabel
> itu sekarang hidup**; jadi memindahkan gate justru **menegakkan** paragraf itu,
> bukan mengalah padanya. Mengembalikan tabel ke `/` akan membatalkan
> `e9317cf` (rute khusus + tab yang sengaja dihapus), dan me-retire gate-nya akan
> membuang satu-satunya pengukur geometri tabel di 390px. Route ditulis sebagai
> konstanta bernama `TABLE_PATH` supaya perpindahan berikutnya = satu edit.
>
> **Cacat kedua yang ikut ketemu saat memperbaiki: baterainya belum pernah
> menyelesaikan satu run pun**, jadi gate ini **belum pernah terbukti bisa gagal**.
> `mut` lama mencocokkan anchor dengan pencarian substring literal termasuk EOL,
> sementara anchor mewarisi LF dari skripnya dan EOL stylesheet ditentukan
> `git checkout`/`core.autocrlf` (sifat mesin, bukan repo). Begitu keduanya beda
> ⇒ abort di M1 `hits=0`, dan karena `exit 1` ia **bungkam soal M2..M6**. Kini
> cocok dengan regex `\r?\n` + pengganti memakai EOL file.
>
> **Bukti dua arah:** `baseline green` → **KILLED 6/6, survived 0** → restore
> byte-identical, `BATTERY_EXIT=0` → kontrol OK-GREEN **7/7 lulus, exit 0**.
> Sisa yang **belum**: fitur kartu L5.5 sendiri (`JobCard`/`LokerCard` belum ada);
> helper label `jobCategoryLabel`/`jobLocationLabel`/`jobGenderLabel` sudah ada.

### L6 / L7 — Rail kanan & mobile

| # | Tugas | Kriteria terima |
|---|---|---|
| L6.1 | Rail kanan desktop: Galeri, Testimoni, Kontak, Lokasi, Daftar Lowongan | Di 1280px rail tampil; di 390px ia jadi kartu bertumpuk |
| L6.2 | Susunan DOM **sama** untuk kedua bentuk (satu sumber) | Tidak ada dua salinan markah yang bisa berbeda |
| L7.1 | Bottom nav tamu: Beranda / Lowongan / Program | Muncul **tanpa** sesi; sekarang `BottomNav.tsx:19` menolak tamu |
| L7.2 | Ikon rail tampil sebagai kartu vertikal di mobile | Diukur di 390×844 |
| L7.3 | Sentuh ≥44px, tidak ada gulir horizontal | Diukur: `scrollWidth === clientWidth` |

> **L7.1 mengubah keputusan lama.** `BottomNav` sengaja hanya untuk pengguna login. Desain meminta
> versi tamu. Itu keputusan produk — tulis di commit message, dan pastikan tidak bentrok dengan
> `z-index` drawer (`App.tsx:15`: OVERLAY 35, NAV 40) dan `settings-limit` gate yang sudah ada.

### L8 — Gate & bukti

Section baru = jejak baru = kemungkinan baru untuk berbohong.

| # | Tugas | Kriteria terima |
|---|---|---|
| L8.1 | `e2e/test-landing.mjs`: setiap section ada & **terlihat** di 390 & 1280 | Gate **dibuktikan bisa gagal** (hapus 1 section → merah dengan nama section itu) |
| L8.2 | Urutan section sesuai desain | Mutasi: tukar 2 section → merah |
| L8.3 | Tidak ada teks `lorem`/placeholder yang lolos ke produksi | Mutasi: sisipkan `lorem ipsum` → merah |
| L8.4 | Angka statistik berasal dari satu sumber | Mutasi: hardcode satu angka → merah |
| L8.5 | Percobaan barrel: `verify:classes`, `bundle:size`, `verify:pwa`, `e2e:public`, `e2e:headings`, `e2e:drawer`, `lint-ratchet`, `typecheck:ratchet`, `test` | Semua hijau **dan** `npm run build` bersih |

**Status per 2026-09-21 (commit `1e9f6fb`):**

| # | Status | Bukti |
|---|---|---|
| L8.1 | **TUTUP** | M1 (section hilang), M2 (kolaps) — `e2e/test-landing.mutations.sh` |
| L8.2 | **TUTUP** | M3 (urutan tertukar) |
| L8.3 | **TUTUP** | M4 (fallback `data-lang`, lapisan HTML tersaji), M5 (lapisan sumber i18n) |
| L8.4 | **TUTUP** | **M9** — `'5'` → `'500'` (angka mockup yang §12 larang). Gate memasangkan NILAI ↔ HALAMAN dokumen; nilai harapan dibaca dari `COMPANY_PROFILE_DATA.md`, **bukan** dari `App.tsx` |
| L8.5 | **TUTUP** | Barrel **diulang di `1e9f6fb`** (bukan diwarisi dari `7e688be`) — lihat tabel di bawah |

Baterai `e2e:landing` terukur: **baseline hijau, 9/9 KILLED, 0 SURVIVED**, 4 sumber
byte-identik sesudahnya.

**Kenapa barrel diulang, bukan diwarisi.** Angka barrel lama disusun dari commit
berbeda (`7e688be`, `5709ea7`), lalu dua commit menyusul. Tabel campuran-revisi
**bukan barrel** — aturan R11 repo ini: *pohon kerja hijau ≠ HEAD hijau*. Jadi
yang diukur di bawah adalah **HEAD `1e9f6fb`**, bukan salinan angka lama.
Terukur juga bahwa `5709ea7..HEAD` hanya menyentuh `docs/`,
`e2e/test-loker-layout.mjs`, dan baterainya — **tidak ada `src/` maupun
`scripts/ci/`** — sehingga baris yang bergantung artefak build
(`test`, `bundle:size`, `verify:classes`, `verify:pwa`) memang tidak berubah.
Itu **dibuktikan dengan menjalankan ulang**, bukan disimpulkan dari diff.

**L8.5 — barrel, diukur ulang di HEAD `1e9f6fb` (2026-09-21):**

| gate | hasil |
|---|---|
| `tsc --noEmit` | exit 0 |
| `verify:classes` | exit 0 — 1197 class / 213 berkas |
| `bundle:size` | exit 0 — 2743,1 KB / 19 entry point |
| `verify:pwa` | exit 0 — 20 cek |
| `lint-ratchet` | exit 0 PASSED |
| `typecheck:ratchet` | exit 0 PASSED |
| `test` | **164 berkas / 1909 tes** (5m17s) — 1904 lulus, **5 merah karena SHIM, bukan kode** ⇒ lihat catatan |
| `npm run build` | artefak bersih; **`exit 1` di sandbox ini karena SHIM** ⇒ lihat catatan |
| `e2e:public` / `e2e:headings` / `e2e:drawer` / `e2e:landing` | exit 0 — dijalankan dengan **`npm run preview`** persis CI |
| `e2e:loker-layout` | **HIJAU** (7/7, exit 0) — diperbaiki `3c12e51`; baterai **6/6 KILLED**. Lihat §L5.5 |

> **⚠ Catatan kejujuran L8.5 — dua angka di atas TIDAK bisa direproduksi hijau di
> sandbox ini, dan sebabnya BUKAN kode.** Lingkungan ini menyalakan
> `CODEBUDDY_SAFE_DELETE_ENABLED=1` dengan ambang bulk **50** (`safe-delete`
> shim). Shim itu mem-blokir `fs.rmSync`/hapus massal:
> - `npm run build` ⇒ **`exit 1`** di `cleanServerOutput` saat menghapus
>   `dist/pages/404.astro.mjs`. **Halaman tetap ter-emit.** Karena `astro build`
>   keluar 1, rantai `&& node scripts/build-sw-manifest.mjs` **tidak jalan** ⇒
>   `dist/sw.js` tertinggal di placeholder **`asj-astro-dev`**, dan `swOffline`
>   akan merah palsu. Obatnya: jalankan `node scripts/build-sw-manifest.mjs`
>   manual ⇒ terukur **`asj-astro-da8d2d4d4e53`**.
> - `test` ⇒ **5 merah, semuanya di satu berkas** `fcm-server.test.ts`, stack-nya
>   `tryRm` → `node-safe-delete-shim.cjs`. Dijalankan **sendirian pun merah**
>   (2 lulus / 10 skip), jadi ini bukan kontensi CPU seperti kasus §13.
>   Berkas itu **tidak disentuh** commit apa pun di sesi ini.
>
> Di CI shim ini **tidak ada**, jadi `test` dan `npm run build` di sana hijau
> sepenuhnya. Angka `7e688be`/`5709ea7` yang lama (baris ini pernah menulis
> `exit 0` polos untuk keduanya) berasal dari kondisi **tanpa shim**.
> **Jangan "perbaiki" kode untuk mengejar 5 merah ini** — yang salah adalah
> lingkungan pengukurnya, dan menambal kode agar lolos di sandbox justru merusak
> CI.

> **Catatan kejujuran L8.5 (server).** Dua gate (`e2e:public`, `e2e:headings`) sempat
> terbaca **merah** karena saya menyalakan **server sendiri** yang berbeda dari
> perintah CI; dengan **`npm run preview`** (persis `.github/workflows/ci.yml:250`)
> keduanya **hijau tanpa perubahan kode**. Merah karena prasyarat hilang **bukan
> bukti**.

**L8 adalah langkah yang paling sering dilewat orang.** Gate yang tidak pernah terbukti bisa gagal
adalah **hipotesis**, bukan bukti — persis kesalahan yang sudah terekam di `review-manifest.json`
(entri `e2e:public` pernah berbunyi "NO BATTERY EXISTS" selama sehari sementara baterainya ada di
pohon, tiga baris di bawahnya).

---

## 4. Angka — apa yang nyata dan apa yang belum

Desain menampilkan banyak angka. **Tidak satu pun boleh diketik di markah.**

| Angka di desain | Sumber nyata? | Tindakan |
|---|---|---|
| Jumlah lowongan (“Lihat Semua Lowongan”) | ✅ `getPublicData().jobs` | Hitung dari data |
| Status loker (Buka/Urgent/Tutup) | ✅ `j.status` | Sudah dipakai `LokerTable` |
| Bidang / Lokasi / Gender | ✅ `jobCategoryLabel` dll. | Pakai yang sudah ada, jangan bikin pemetaan kedua |
| Program (SSW / Magang / Bahasa) | 🟡 3 kartu ada, isinya beda (Visa/Ujian/Asrama) | Putuskan: ganti isi atau tambah kartu — **satu keputusan, tidak dua** |
| 500+ Kandidat · 200+ Penempatan · 50+ Mitra · 5+ Tahun | ❌ | **Butuh pemilik** (L5.1) |
| “Berdiri sejak 2015” | ❌ | **Butuh pemilik** |
| Alamat, telp, surel, jam operasional | ❌ | **Butuh pemilik** — desain mencantumkan `Jl. Raya Kalimalang No. 12, Jakarta Timur, DKI Jakarta`; **verifikasi, jangan salin dari gambar** |
| 5 nomor izin (SIUP/SIP3M/Akta/TDP/NIB) | ❌ | **Butuh pemilik**; section tampil hanya bila terisi |

**Aturan:** lebih baik **section disembunyikan** daripada menampilkan angka karangan. Angka karangan
di halaman profil perusahaan adalah klaim hukum, bukan hiasan.

---

## 5. Urutan eksekusi & definisi selesai

Urutan wajib: **L0 → L1 → L2 → L3 → L4 → L5 → L6 → L7 → L8**, satu fase hijau sebelum lanjut.

**Definisi selesai satu fase** (= R3, tidak dinegosiasikan):

1. `npx tsc --noEmit` bersih.
2. `npx vitest run` hijau (frontend + backend + indexer).
3. `npm run lint-ratchet` **PASSED** tanpa menurunkan baseline.
4. `npm run build` bersih (bukan hanya `astro build` — manifest SW ikut).
5. Gate yang tersentuh dijalankan, dan yang **baru** dibuktikan **bisa gagal**.
6. Commit **per berkas**; tidak pernah `git add -A`.
7. Angka ratchet diukur ulang di HEAD, bukan dihitung dari keyakinan.
8. **Tidak push.** push `main` = deploy. Hitung sendiri, jangan percaya angka di
   dokumen: `git rev-list --count newrepo/main..HEAD` (terukur **68** pada
   2026-09-21; baris ini pernah menulis **87**, yang sudah tidak cocok dengan
   pohon — angka seperti ini basi tanpa memberi tahu).

**Percobaan barrel** (satu kali, di akhir): `npm run verify:classes`, `npm run bundle:size`,
`npm run verify:pwa`, `BASE_URL=http://127.0.0.1:4321 npx playwright …` untuk `e2e:public`,
`e2e:headings`, `e2e:drawer`, `e2e:loker-layout`, lalu `npm run build`.

---

## 6. Yang **tidak** dikerjakan di sini (dan alasannya)

| Hal | Alasan |
|---|---|
| Checkbox “Ima Made (Sekarang)” di CV | `excel.ts:60` / `pdf.ts:30` mencetak `SEKARANG` sebagai teks dan melewatkan `fmtMonthYearJp`; hanya `RirekishoBuilder.tsx:130` yang menanganinya. Perbaiki renderer dulu. |
| Rombak halaman form (`/ai-cv`, `/master`) | Permintaan pemilik terpisah; landing page dulu. |

---

## 7. Arah baru (2026-09-20): ilustrasi anime + gamefeel — **terpisah dari L0–L8**

Permintaan pemilik: *“semua photo ilustrasikan jadi anime saja, kita gamefikasikan
web app kita, sesuai tema Jepang dan usia user.”*

**Ini BUKAN bagian dari L0–L8, dan TIDAK boleh diselipkan ke fase yang sedang
jalan.** Alasan: L0–L8 punya definisi selesai per fase (§5), dan menyuntikkan
rombakan visual ke tengahnya membuat “hijau” di L-fase tidak lagi berarti apa pun.
Arah ini dikerjakan sebagai **fase L9 setelah L8 hijau**.

**Semua detail ada di `docs/ILLUSTRATION_SPEC.md`** — daftar 11 gambar, ukuran,
gaya, aturan, dan batas etis gamefeel. Dokumen itu juga mencatat temuan penting:
`GalleryItem` hanya butuh `src`/`width`/`height`, jadi **menukar ilustrasi tidak
memerlukan perubahan komponen sama sekali**.

Dua hal yang harus dibaca sebelum menjanjikan apa pun ke pemilik:

1. **Sesi yang menulis spec ini tidak bisa menghasilkan gambar.** Tidak ada
   image generation di lingkungan ini. Gambarnya harus dibuat di luar, lalu
   dijatuhkan ke slot yang sudah disiapkan.
2. **Gamefeel separuh sudah ada, tapi di `/candidate`, bukan di landing.**
   `profileProgress.ts` + `CrownBadge` sudah menghitung kelengkapan profil. Di
   landing publik tidak ada data pengunjung sama sekali (belum login), jadi badge
   di sana hanya bisa fiktif — lihat `ILLUSTRATION_SPEC.md` §6.0.
| Migrasi framework / CMS | Halaman ini statis + satu island; tidak ada masalah yang CMS selesaikan sekarang. |
| Bahasa Jepang penuh untuk section baru | Kunci i18n **wajib** ada di `i18n.ts` **dan** `i18n-jp.ts` (dijaga `i18n.keys.test.ts`), tapi mutu terjemahan menyusul — bukan alasan menunda. |

---

## 7. Bacaan berikutnya

- `docs/AI_CV_SIDE_BY_SIDE.md` — paritas yang sudah diselesaikan (metode yang sama dipakai di sini).
- `docs/UI_DESIGN_REVIEW.md` — §21 (kelas yang hanya *kelihatan* seperti kelas) dan §23 (heading).
- `docs/DEVELOPMENT_ROADMAP.md` — disiplin fase & pemicu ukur-ulang.
- `scripts/ci/review-manifest.json` — daftar gate; **baca sebelum menambah gate baru**.
