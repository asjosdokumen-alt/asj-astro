# LANDING_PAGE_SPEC — Company Profile Landing Page ASJ

**Status:** spesifikasi siap implementasi · **Dibuat:** 2026-09-19 · **Revisi 2** (data resmi)
**Basis ukur:** HEAD `41e64cc`, pohon kerja **bersih**
**Fondasi visual:** `DESIGN.md` (token, komponen, aturan bento, aksesibilitas)
**Sumber data:** `docs/COMPANY_PROFILE_DATA.md` (company profile resmi, 15 halaman)
**Urutan fase:** `docs/LANDING_PAGE_ROADMAP.md` §3 (L0..L8)

> **Kontrak baca.** Dokumen ini **spesifikasi**, bukan laporan. Setiap section punya
> kriteria terima yang bisa diukur. Kalau bertentangan dengan kode, **kode menang**
> sampai ada ukur ulang. Kalau bertentangan dengan `DESIGN.md`, **`DESIGN.md` menang**
> untuk urusan visual dan **dokumen ini menang** untuk urusan isi halaman.
>
> **Revisi 2.** Setelah company profile resmi masuk, dokumen ini berubah dari
> “rancangan dengan 10 lubang data” menjadi **spesifikasi berisi**. Sebelas section
> sekarang punya isi nyata; tinggal 7 item yang menunggu pemilik (§9).

---

## 0. Ringkasan & keputusan

Sepuluh keputusan, masing-masing dengan alasan tertulis. Yang paling mahal bukan yang
paling rumit, tapi yang **tidak bisa dibatalkan murah** setelah dikerjakan.

| # | Keputusan | Alasan singkat | Biaya kalau salah |
|---|---|---|---|
| **D1** | **Satu halaman panjang dengan anchor**, bukan enam tab dan bukan rute `/profil` terpisah | Tab menyembunyikan isi dari mesin pencari dan butuh JS; enam rute berarti enam `h1`, enam nav, enam gate. Anchor memberi URL langsung ke setiap bagian dengan satu permukaan | Rendah — section adalah komponen, jadi rute `/profil` bisa diturunkan kapan saja |
| **D2** | **`h1` pindah ke hero**; nama perusahaan di header turun jadi `div` | `e2e/test-headings.mjs` mewajibkan satu `h1`; `h1` yang berbunyi nama perusahaan tidak menjelaskan halaman apa ini (WCAG 2.4.2) | Sedang — menyentuh `App.tsx:197` |
| **D3** | **Nav desktop masuk ke `<nav>` yang sudah ada**, bukan `<nav>` kedua | `test-drawer.mjs:71` memakai `querySelector` satu selektor bername; nav kedua membuat gate mengukur elemen salah dan sebagian asersi **lolos diam-diam** | Tinggi — gate tetap hijau sementara jaminannya hilang |
| **D4** | **Arah visual “Sakura Editorial”**: dark-first, bento modular, rail kanan lengket, glass tertahan | Tren 2026 dan sifat repo sepakat; lihat `DESIGN.md` §1 | Rendah |
| **D5** | **Angka “SINCE 2023” menggantikan “2015” dan “5+ tahun” dari mockup** | Akta pendirian 15 Agustus 2023, SK Kemenkumham 28 Agustus 2023. Umur lembaga per 2026 = **3 tahun** | Tinggi kalau dibiarkan — itu klaim publik, bukan hiasan |
| **D6** | **Rail kanan desktop** memuat Kontak, Lowongan ringkas, Galeri, **Penempatan**, Lokasi | Sudah jadi keputusan proyek (roadmap L6); satu DOM, dua bentuk | Rendah |
| **D7** | **Tab lama dibuang, diganti anchor** + logika pindah ke `src/lib/publicSections.ts` | `index.astro:58-99` adalah 42 baris `classList` tanpa test; menambah tab ketiga berarti menyunting 6 kelas yang tidak dijaga apa pun | Sedang — menyentuh `index.astro` |
| **D8** | **Kartu loker ditambahkan, tabel dipertahankan** | `LokerTable` sudah punya modal, pamflet, badge gender, dan pensortiran yang diuji; `e2e:loker-layout` mengukur tabel | Rendah — dua tampilan, satu data |
| **D9** | **Testimoni karangan diganti “Penempatan Kami”** — 4 prefektur nyata + foto mensetsu | Dokumen resmi punya **Miyazaki, Okayama, Nagano, Kagoshima**. Itu bukti yang bisa diperiksa, dan tidak mengarang apa pun | Rendah |
| **D10** | **JLPT N1 ditampilkan sebagai kredensial**, bukan disembunyikan | Manager sekaligus Education Training Manager memegang N1 (sertifikat N1A225127J) — sinyal kepercayaan terkuat yang dimiliki perusahaan, dan mockup desain melewatkannya sama sekali | Rendah |

**Yang diminta pemilik dan dihormati di sini:** *“UI nya masih jelek juga gapapa yg
penting bener dulu… saya niat rombak total bentuk ui/ux nya baik destop dan mobile”*
(2026-09-19). Karena itu **bentuk halaman ditentukan lebih dulu**, dan tiap langkah
membawa gate yang bisa gagal.

---

## 1. Peta halaman

### 1.1 Urutan, anchor, dan tingkat heading

| # | Section | Anchor | Heading | Kolom desktop |
|---|---|---|---|---|
| **S1** | Hero | `#atas` | **`h1`** | penuh (12) |
| **S2** | Kenapa Jepang? | `#kenapa-jepang` | `h2` | penuh (12) |
| — | *grid dua kolom mulai di sini* | | | |
| **S3** | Lowongan Terbaru | **rute `/loker`** (bukan anchor di `/`) | `h2` di `/loker` | — |
| **S4** | Program ASJ | `#program` | `h2` | utama (8) |
| **S5** | Layanan ASJ | `#layanan` | `h2` | utama (8) |
| **S6** | Alur & Persyaratan | `#alur` | `h2` | utama (8) |
| **S7** | Tentang Kami | `#tentang` | `h2` | utama (8) |
| **S8** | Visi & Misi | `#visi-misi` | `h2` | utama (8) |
| **S9** | Legalitas & Izin Resmi | `#legalitas` | `h2` | utama (8) |
| **S10** | Tim & Kredensial | `#tim` | `h2` | utama (8) |
| **S11** | Fasilitas & Dukungan | `#fasilitas` | `h2` | utama (8) |
| **R1** | Informasi Kontak | `#kontak` | `h2` | rail (4) |
| **R2** | Lowongan Ringkas | `#loker-ringkas` | `h2` | rail (4) |
| **R3** | Galeri Perusahaan | `#galeri` | `h2` | rail (4) |
| **R4** | Penempatan Kami | `#penempatan` | `h2` | rail (4) |
| **R5** | Lokasi Kami | `#lokasi` | `h2` | rail (4) |
| — | *grid dua kolom selesai di sini* | | | |
| **S12** | Pita CTA penutup | `#daftar` | `h2` | penuh (12) |
| — | Footer | — | `h2` | penuh (12) |

**Urutan DOM = urutan baca = urutan tampil di mobile.** Rail ada **setelah** `main`
dalam DOM; di desktop ia dipindahkan ke kolom kedua oleh CSS grid. Karena kolom kedua
dibaca setelah kolom pertama, **urutan baca tidak berubah** — inilah cara menghindari
jebakan WCAG 2.4.3 yang diperingatkan riset bento 2026.

### 1.2 Yang berubah dari Revisi 1

| Perubahan | Alasan |
|---|---|
| **S2 “Kenapa Jepang?” ditambahkan** | Dokumen resmi punya tiga alasan matang (h. 2). Ini blok motivasi terkuat untuk kandidat, dan posisinya tepat setelah hero |
| **S6 “Alur & Persyaratan” ditambahkan** | Alur 6 langkah + 8 persyaratan + 7 berkas (h. 3–4). Tanpa ini, kandidat harus menghubungi WA hanya untuk tahu syaratnya |
| **S10 “Tim & Kredensial” ditambahkan** | Struktur organisasi 6 orang (h. 8) + JLPT N1 (h. 10). Bukti kompetensi yang bisa diperiksa |
| **R4 “Testimoni” diganti “Penempatan”** | Tidak ada testimoni di dokumen resmi, tapi ada **4 prefektur penempatan** yang bisa dibuktikan |
| **Pita statistik terpisah dihapus** | Statistik masuk ke hero sebagai bento 2×2 — bukti di atas fold, satu sumber angka |
| **Angka 2015 → 2023** | Akta pendirian. Rinci: `docs/COMPANY_PROFILE_DATA.md` §12 K-1 |

### 1.3 Kenapa tab dari gambar acuan tidak dipakai

Desain acuan menaruh enam tab (Tentang Kami, Visi & Misi, Legalitas, Fasilitas,
Galeri, Testimoni). Enam tab itu **diganti menjadi section berurutan**, dan itu
disengaja:

| Alasan | Akibatnya |
|---|---|
| Isi di dalam tab `display:none` tidak diindeks mesin pencari | Profil perusahaan adalah halaman yang justru dicari lewat nama perusahaan |
| Tab butuh JS; halaman ini sudah punya satu island | Kalau island gagal dimuat, isi tab hilang sama sekali |
| Tab tidak bisa ditautkan | `#legalitas` bisa dikirim ke calon mitra lewat WhatsApp; tab tidak bisa |
| Tab menyembunyikan panjang halaman | Halaman panjang **lebih baik** untuk tawaran kompleks (riset: CTA berulang menang 23% pada halaman panjang) |

---

## 2. Matriks section, komponen, data, dan berkas

| # | Komponen | Data (semua dari `COMPANY_PROFILE_DATA.md`) | Berkas | Fase |
|---|---|---|---|---|
| S1 ✅ | varian `hero` di `App.tsx` + `HERO_STATS` | nama, tagline, sejak 2023, 5 bidang, 4 prefektur | `src/components/App.tsx` | L2 |
| S2 ✅ | `IconTileGrid` (3 ubin) + baris tips | 3 alasan + tips | `index.astro` | L3 |
| S3 | `JobGrid.tsx` + `JobCard.tsx` + `FilterBar.tsx` | `jobs` dari `getPublicData()` | `src/components/public/JobGrid.tsx` | L5.5 |
| S4 ✅ | `IconTileGrid` (3) + 2 `Card` (harga, cakupan) | Magang, Tokutei Ginou, Bahasa; 5 bidang; 6 juta; 4 cakupan | `index.astro` | L3 |
| S5 | `LayananSection.astro` (**sudah ada**) | 3 kartu statis | `src/components/public/LayananSection.astro` | — |
| S6 ✅ | `StepList` (6) + 2 daftar (7 syarat, 7 berkas) | 6 langkah, 7 syarat, 7 berkas | `index.astro` | L3 |
| S7 ⏸ | `Card` (editorial 2 kolom) | sambutan + prosa + foto gedung — **butuh pemilik** | — | L3 |
| S8 ✅ | 2 `Card` (editorial) | visi 1 kalimat + 4 misi | `index.astro` | L3 |
| S9 ✅ | `FactList` (6 baris) | 2 dokumen, 6 nomor | `index.astro` | L3 |
| S10 ⏸ | `IconTileGrid` / grid potret | 6 jabatan + JLPT N1 — **butuh izin tayang** | — | L3 |
| S11 ✅ | `IconTileGrid` (6 ubin) | 6 ubin, gabungan data resmi + asrama | `index.astro` | L3 |
| R1 ✅ | `Card` ×2 + `ContactForm` (bukan `FactList`) | alamat, 2 telepon, surel, formulir kontak — **baris jam operasional dihilangkan (P-4)**; WA ada di `Footer.astro`, bukan di section ini | `index.astro` | L3 |
| R2 | `JobMiniList.tsx` | `jobs` (5 teratas) | `src/components/public/JobMiniList.tsx` | L6 |
| R3 ⏸ | `GalleryGrid` | 6 foto terpilih (§8) — **butuh izin tayang** | — | L3 |
| R4 ⏸ | `FactList` + 3 foto | 4 prefektur + foto mensetsu — **butuh izin tayang** | — | L3 |
| R5 ⏸ | `MapCard.astro` | koordinat; peta pindahan dari `LayananSection.astro:168` | — | L3 |
| S12 ✅ | `ClosingBand.astro` | — | `src/components/public/ClosingBand.astro` | L2 |

Berkas pendukung yang **sudah ada**:

| Berkas | Isi |
|---|---|
| `src/lib/publicSections.ts` ✅ | saklar section: resolver keadaan + pengikat DOM, **tanpa nama kelas** |
| `src/lib/companyProfile.ts` ✅ | seluruh isi statis perusahaan: visi, misi, alasan, program, cakupan, alur, syarat, berkas, legalitas, fasilitas, penempatan, kontak |
| `src/lib/accentClass.ts` ✅ | peta tunggal peran aksen → utilitas; dipakai `SectionTitle` dan ketiga primitif |
| `src/components/public/Section.astro` ✅ | kontainer + ritme vertikal |
| `src/components/public/SectionTitle.astro` ✅ | eyebrow + heading + deskripsi + slot aksi |
| `src/components/public/Card.astro` ✅ | permukaan + radius + padding, dari skala bernama |
| `src/components/public/IconTileGrid.astro` ✅ | ikon + judul + satu baris, sebagai grid bento |
| `src/components/public/FactList.astro` ✅ | baris label–nilai; nilainya **literal**, tidak diterjemahkan |
| `src/components/public/StepList.astro` ✅ | alur bernomor; urutannya nyata di tiga lapis (ol, angka, garis) |

Berkas pendukung:

| Berkas | Isi | Fase |
|---|---|---|
| `src/lib/publicSections.ts` ✅ | daftar section + resolver keadaan + pengikat DOM; **tanpa nama kelas** | L0 |
| `src/components/public/Section.astro` ✅ | kontainer + padding vertikal + ritme | L1 |
| `src/components/public/SectionTitle.astro` ✅ | eyebrow + heading + deskripsi + slot aksi | L1 |
| `src/components/public/Card.astro` ✅ | permukaan + radius + padding, dari skala bernama | L1 |
| `src/lib/companyProfile.ts` | isi statis perusahaan (visi, misi, syarat, alur, tim, legalitas, penempatan) + kunci i18n | L3 |

`src/lib/companyProfile.ts` adalah pasangan `src/lib/jobDisplay.ts`: satu modul, satu
sumber, sehingga **tidak ada string perusahaan yang diketik di markah**.

**Satu penyimpangan sadar dari rencana L0.** Dokumen ini semula mendeskripsikan
`publicSections.ts` sebagai daftar section saja. Modul yang dikerjakan juga memuat
**pengikat DOM**-nya, dan itu perlu: kriteria terima L0.1 berbunyi “`index.astro` tidak
lagi memuat `classList.add/remove` untuk tab”. Kalau modulnya hanya mengembalikan
keadaan, penerjemahan keadaan → DOM tetap harus tinggal di suatu tempat, dan
tempat yang tersedia adalah skrip halaman — persis yang sedang dihapus. Jadi modulnya
menulis **dua atribut** (`hidden` pada panel, `aria-pressed` pada tab) dan **nol nama
kelas**; gaya aktif dipindahkan ke markup sebagai varian Tailwind
(`aria-pressed:bg-sky-700`). Konsekuensinya: `index.astro` dan `public.astro` masing-masing
tinggal berisi satu baris pemanggilan.

---

## 3. Spesifikasi per section

### S1 · Hero — `#atas`

| Aspek | Nilai |
|---|---|
| Latar | artwork banner aktif (SAKURA / TOKYO / INTER_VIP) + overlay gradien |
| Tinggi | `min-h-[28rem] md:min-h-[32rem]` — sekarang `min-h-[14rem] md:h-56` (`App.tsx:182`), yaitu **bukan hero** |
| Grid dalam | 12 kolom ≥1024 px: teks di kolom 1–7, bento statistik 2×2 di kolom 8–12 |
| `h1` | `text-display`, maksimum 8 kata |
| CTA | primer `primary` (pink-600 + teks putih, 4,60:1 — lolos apa adanya), sekunder `on-artwork` |
| Chip | tiga: SSW · Magang · Penempatan |
| Bento statistik | 2×2 `StatTile`: Sejak 2023 · Kandidat · Berangkat · Mitra Jepang |
| Strip lowongan | satu baris penuh: `N lowongan aktif` + tautan `#loker`; **N dihitung dari `jobs`** |

**Teks — semuanya terverifikasi atau ditandai usulan:**

| Slot | Isi | Sumber |
|---|---|---|
| Eyebrow | PT AMANAH SAKURA JAPAN | h. 5, 8, 9 |
| `h1` | Karier ke Jepang, dimulai dari sini. | usulan, 6 kata |
| Tagline | **LET'S BUILD OUR FUTURE** | h. 1, 9 |
| Motto | **BERJUANGLAH SAMPAI AKHIR!** | h. 8, 9 |
| Subjudul | Lowongan, program, dan layanan perjalanan kerja ke Jepang dalam satu portal ASJ. | usulan, 13 kata |
| CTA primer | Lihat Lowongan | usulan |
| CTA sekunder | Daftar sebagai Pelamar | usulan |
| Stat 1 | **2023** — Berdiri sejak | h. 1, 6 |
| Stat 2–4 | Kandidat · Berangkat · Mitra Jepang | **menunggu pemilik** (§9 P-1..P-3) |

**Aturan angka.** Stat 1 boleh langsung dipasang. Stat 2–4 **tidak boleh** memakai angka
mockup (500+ / 200+ / 50+) sampai pemilik menunjuk sumbernya. Selama belum ada, hero
memakai **tiga** ubin yang seluruhnya terverifikasi: Sejak 2023 · 5 bidang penempatan ·
4 prefektur. Bento 2×2 tetap dipakai untuk empat ubin kalau angkanya nanti sudah ada.

**Kriteria terima**

- `h1` di hero adalah **satu-satunya** `h1` di `/`; `npm run e2e:headings` hijau.
- Nama perusahaan di `App.tsx:197` sudah jadi `div`, bukan `h1`.
- Tinggi hero ≥ 28 rem di 390 px dan ≥ 32 rem di 1280 px (diukur).
- Tidak ada satu pun angka statistik yang diketik di markah.
- Strip lowongan menampilkan angka yang sama dengan jumlah baris di `#loker`.
- Terbaca di **ketiga** tema banner dan di kedua mode warna.

#### ⚠ Temuan L2: hero tidak ada di HTML yang dikirim

`dist/index.html` memuat **0 `h1`** dan 0 elemen hero. Sebabnya: `index.astro`
me-mount `<App client:only="preact" />`, dan `client:only` berarti **tidak ada yang
dirender di server**. Jadi `h1`, headline, CTA, dan kartu statistik baru ada setelah
hidrasi; yang benar-benar dikirim server hanya marquee, strip lowongan, nav tab,
pita CTA, dan footer.

Ini **bukan regresi L2** — sebelum L2 pun `h1`-nya berasal dari header di dalam
island yang sama, jadi jumlah `h1` di HTML statis memang 0. Tapi konsekuensinya nyata
dan justru paling mahal untuk halaman ini: halaman profil perusahaan dibangun supaya
**ditemukan** lewat nama perusahaan, dan headline-nya tidak ada di HTML.

`e2e:headings` tetap hijau karena Playwright mengukur DOM **setelah** hidrasi — jadi
hijau di gate itu tidak berarti HTML-nya berisi. Dua jalur keluar, keduanya di luar
L2 dan keduanya perlu keputusan:

| Jalan | Konsekuensi |
|---|---|
| `client:load` pada App, dengan kode yang aman-SSR | Perlu meninjau pemakaian `localStorage` di `theme.ts`/`authReactive.ts` saat inisialisasi; island jadi lebih berat dirender server |
| Hero jadi `.astro` statis, tanpa artwork tema | Menyelesaikan SEO, tapi menghidupkan kembali masalah salinan peta tema yang justru alasan hero ditempatkan di `App.tsx` |

Sampai salah satunya diambil, klaim “`h1` tunggal untuk `/`” hanya berlaku **di DOM
hidrasi**, dan itu harus disebut apa adanya.

### S2 · Kenapa Jepang? — `#kenapa-jepang`

Pita penuh lebar, tiga ubin bento, tepat setelah hero. Ini blok motivasi: kandidat datang
karena ingin tahu “apa untungnya”, dan dokumen resmi sudah menjawabnya dengan matang.

| # | Judul (≤5 kata) | Isi (≤30 kata) | Ikon |
|---|---|---|---|
| 1 | Gaji | Upah minimum 15–25 juta per bulan, berbanding lurus dengan biaya hidup dibanding Indonesia | `wallet` |
| 2 | Pengalaman dan tantangan baru | Gaya hidup, budaya, dan kedisiplinan yang berbeda dari Indonesia | `user-check` |
| 3 | Kehidupan empat musim | Musim semi, panas, gugur, dan dingin — Indonesia hanya punya dua | `sun` |

| Aspek | Nilai |
|---|---|
| Layout | bento 3 ubin ≥1024 px, 2 ≥640 px, 1 di bawahnya |
| Aksen | ubin 1 sky, ubin 2 emerald, ubin 3 amber |
| Slot tambahan | satu baris “Tips bekerja di Jepang” di bawah grid, `fg-muted`, ≤40 kata |

**Kriteria terima**

- Angka “15–25 juta” muncul **tepat satu kali** di halaman — jangan ulangi di S4.
- Ketiga ubin ≤30 kata. Kalau lebih, potong isinya, jangan perkecil fontnya.

### S3 · Lowongan Terbaru — **pindah ke rute `/loker`** (2026-09-20)

> **KOREKSI 2026-09-21.** Spesifikasi ini semula menaruh S3 sebagai section `#loker` di
> `/`. Itu **tidak lagi benar**: commit `e9317cf` memindahkan `LokerTable` ke rutenya
> sendiri, `/loker`. Terukur pada 2026-09-21 di 1280 px: `/` memuat **15** dari 16
> section, tidak punya elemen ber-`#loker`, dan `#layanan` kini `<SECTION>` biasa
> setinggi 1623 px (bukan panel tab tersembunyi). `[data-public-tab]` cocok **0** elemen.
>
> **Akibat yang harus dibaca sebelum mengubah apa pun.** Rencana di bawah
> (tab→anchor, `JobGrid`, filter, “Lihat semua”) menggambarkan `/` **sebelum**
> pemindahan itu. Sebagian sudah tidak berlaku, dan **gate `e2e:test-landing` sempat
> merah 10 cek selama sehari karena tabel harapannya masih memakai bentuk lama** —
> merah yang menyesatkan, bukan regresi. Kalau Anda hendak mengerjakan S3, ukur dulu
> `/loker`, jangan percaya tabel di bawah tanpa memeriksanya.

| Aspek | Nilai |
|---|---|
| **Lokasi** | rute `/loker` (`src/pages/loker.astro`), **bukan** section di `/` |
| Gate yang menjaganya | `e2e:loker-layout` (mengukur tabel) — **bukan** `e2e:test-landing` |
| Yang dijaga `e2e:test-landing` | hanya **keterjangkauan**: hero dan nav `/` wajib menautkan ke `/loker` |
| Judul section | “Lowongan Terbaru” + deskripsi satu baris |
| Filter status | Semua · Urgent · Open · Tutup — `rounded-pill`, dari `j.status` |
| Filter atribut | Bidang · Lokasi · Program · Gender — memakai `jobCategoryLabel`, `jobLocationLabel`, `jobGenderLabel` |
| Pencarian | satu input teks, di dalam layar pertama section |
| Kartu | `JobCard`, grid 2 kolom ≥768 px, 1 kolom di bawahnya |
| Jumlah tampil | 4–6 kartu; sisanya lewat “Lihat semua” |
| Aksi “Lihat semua” | **hanya dipasang kalau halaman tujuan ada** (roadmap L5.6) |
| Cadangan | `LokerTable` tetap dirender sebagai tampilan kedua sampai e2e kartu ada |

**Catatan yang menghubungkan ke data resmi.** Lima bidang yang muncul di lowongan —
Kaigo, Pengolahan Makanan, Restoran, Pertanian, Peternakan — **sama** dengan lima bidang
di halaman 3 dokumen resmi. Jadi isi penyaring “Bidang” bisa berasal dari daftar yang
nyata, bukan karangan.

**Kriteria terima**

- Filter memakai pemetaan yang sudah ada; **tidak ada** pemetaan kedua.
- `e2e:loker-layout` tetap hijau (tabel tidak berubah perilaku).
- Pencarian menemukan kode job dan nama pekerjaan.
- Kartu membawa **seluruh** informasi baris tabel (kode, judul, bidang, lokasi, gender, status, aksi).

### S4 · Program ASJ — `#program`

Tiga kartu bento: **Magang** · **Tokutei Ginou** · **Bahasa**.

| Aspek | Nilai |
|---|---|
| Layout | bento 3 kartu ≥1024 px, 2 ≥640 px, 1 di bawahnya |
| Isi kartu | gambar + judul `h3` (≤6 kata) + satu baris (≤15 kata) + CTA |
| Aksen | kartu 1 emerald, kartu 2 sky, kartu 3 amber |

**Isi kartu (terverifikasi, h. 3 dan 4):**

| Kartu | Judul | Isi |
|---|---|---|
| 1 | Magang | Program magang ke Jepang dengan pendampingan dari pendaftaran sampai keberangkatan |
| 2 | Tokutei Ginou | Perawat Lansia (Kaigo) · Pengolahan Makanan · Restoran (Food Service) · Pertanian · Peternakan |
| 3 | Bahasa | Pelatihan bahasa Jepang, skill, dan pengenalan budaya Jepang |

**Dua blok yang wajib ada di dalam section ini**, karena keduanya menjawab pertanyaan
pertama setiap kandidat:

| Blok | Isi | Sumber |
|---|---|---|
| **Biaya** | **6 JUTA** · bisa dicicil · ada dana talang untuk biaya keberangkatan | h. 3, 4 |
| **Yang didapat peserta** | Modul Pembelajaran & Kamus · Seragam Lembaga · Asrama · Ujian JFT & SSW masing-masing 1 kali | h. 3 |

**Aturan.** “6 juta” adalah harga yang **sudah termasuk** empat item di atas. Jangan
menampilkan harga tanpa cakupannya — itulah yang membuat kandidat menduga ada biaya
tersembunyi.

**Catatan yang menutup ambiguitas roadmap §4.** Tiga kartu di `LayananSection.astro`
isinya berbeda (Visa / Ujian / Asrama). Ini **satu keputusan, bukan dua**: Program ASJ
memuat Magang · Tokutei Ginou · Bahasa; Layanan ASJ tetap memuat Visa · Ujian ·
Konsultasi. Kartu asrama **tidak berdiri sendiri** — ia menjadi bagian dari S11 Fasilitas
dan cakupan biaya di atas.

### S5 · Layanan ASJ — `#layanan`

Memakai `LayananSection.astro` yang sudah ada, dengan tiga penyesuaian:

| Perubahan | Alasan |
|---|---|
| Radius `rounded-[2rem]` → `rounded-band` | T-04 di `DESIGN.md` |
| Peta di baris 162–173 **dipindahkan** ke R5 `#lokasi` | Roadmap L3.8: jangan punya dua peta |
| Nomor kontak disamakan dengan §1 data resmi | `Footer.astro` dan `LayananSection.astro` harus memakai satu sumber |

### S6 · Alur & Persyaratan — `#alur`

Section dua bagian. Ini yang paling sering ditanyakan kandidat, dan dokumen resmi sudah
memuatnya lengkap.

#### 6a · Alur penerimaan — 6 langkah berurutan

| # | Langkah | Isi |
|---|---|---|
| 1 | Registration | Pemeriksaan kesehatan, dokumen, dan mengisi form pendaftaran |
| 2 | Training & Education | Pelatihan bahasa Jepang, skill, dan pengenalan budaya Jepang |
| 3 | Interview | Wawancara kerja dengan perusahaan Jepang |
| 4 | Employment Document | Kepengurusan berkas di Indonesia |
| 5 | Document Preparing | MCU & tanda tangan kontrak kerja · kepengurusan berkas imigrasi Jepang (COE) |
| 6 | GO TO JAPAN | Pengurusan paspor, visa, dan EKTLN di Indonesia |

| Aspek | Nilai |
|---|---|
| Desktop | 6 kolom, garis horizontal, panah antar-langkah |
| Mobile | 1 kolom, garis vertikal, tanpa panah |
| Nomor | tegas 1..6, `text-section`, aksen peran |
| Langkah 5 | **dua baris di dalam satu langkah** — jangan dipecah jadi tujuh, itu mengubah alur resmi |

#### 6b · Persyaratan & dokumen

| Aspek | Nilai |
|---|---|
| Layout | **daftar**, bukan kartu sejajar — 8 syarat dan 7 berkas punya hierarki |
| Isi | 8 butir persyaratan + 7 berkas, memakai daftar halaman 4 (yang lebih lengkap) |
| Peringatan | **tinggi badan wanita berbeda antar halaman** (145 vs 150 cm) — lihat §9 P-5 |

**Kriteria terima**

- Alur identik di kedua bentuk (satu DOM).
- Nomor adalah teks, bukan `list-style` yang hilang di `display:grid`.
- Daftar berkas memakai versi halaman 4 (paling lengkap: menambah surat izin orangtua
  dan akta lahir), bukan halaman 3.
- Tidak ada syarat yang dihaluskan atau dibulatkan tanpa persetujuan pemilik.

### S7 · Tentang Kami — `#tentang`

| Aspek | Nilai |
|---|---|
| Layout | **editorial** 2 kolom ≥1024 px: prosa di kiri (1–7), gambar + caption di kanan (8–12) |
| Prosa | sambutan (h. 2) + 2 paragraf identitas: bidang, cakupan program, jaminan pendampingan |
| Gambar | **`fasilitas-gedung.webp`** (1600×1066), `width`/`height` eksplisit, `loading="lazy"` |
| Caption | Kantor LPK Amanah Sakura Japan — Ponorogo, Jawa Timur |
| CTA | “Tentang Program Kami →” menuju `#program` |

**Sambutan (verbatim, h. 2).** “Kami berkomitmen meningkatkan kemampuan sumber daya
manusia untuk memperdayakan diri sendiri dan mampu menghadapi dunia kerja dan untuk
meningkatkan keahlian.”

**Kenapa bukan bento.** Riset 2026 menempatkan teks panjang (>50 kata per blok) sebagai
kasus di mana bento **kalah**. Prosa tiga paragraf tidak sejajar dengan apa pun, dan
memaksakan grid akan memotongnya menjadi kartu yang tidak bisa dibaca berurutan.

**Kriteria terima**

- Ejaan asli dokumen dipertahankan di sambutan; perbaikan ejaan butuh persetujuan pemilik.
- Gambar punya `alt` yang menjelaskan, bukan “gambar”.
- Caption memakai alamat yang cocok dengan `LayananSection.astro:169`.

### S8 · Visi & Misi — `#visi-misi`

| Aspek | Nilai |
|---|---|
| Layout | dua panel ≥768 px, bertumpuk di bawahnya |
| Visi | satu kalimat panjang — panel tinggi mengikuti isi |
| Misi | 4 butir berbutir, ikon `check-circle`, aksen violet |
| Entitas | **PT AMANAH SAKURA JAPAN** (h. 5), bukan LPK (h. 2) — lihat §12 K-6 |

**Kenapa bukan dua kartu sejajar yang identik.** Visi dan misi bukan dua hal setara —
visi satu kalimat panjang, misi empat butir pendek. Kartu dengan tinggi identik memaksa
salah satunya menggembung.

### S9 · Legalitas & Izin Resmi — `#legalitas`

| Aspek | Nilai |
|---|---|
| Layout | daftar label–nilai, aksen violet (peran “Formal & Legal”) |
| Isi | 6 baris, semuanya terverifikasi dari dokumen resmi |
| Dokumen | dua pratinjau: `legal-ahu-0063921-2023.webp`, `legal-akta-09-2023.webp` |
| CTA | “Lihat Dokumen Lengkap →” menuju berkas pindaian |

**Isi — tidak ada nomor contoh, tidak ada placeholder:**

| Label | Nilai |
|---|---|
| Badan hukum | Perseroan Terbatas (PT), Swasta Nasional |
| SK Kemenkumham | AHU-0063921.AH.01.01.TAHUN 2023 |
| Akta Notaris | Nomor 09, 15 Agustus 2023, Notaris Setya Budhi, S.H. |
| Nomor pendaftaran | 4023082735107914 |
| Daftar Perseroan | AHU-0167587.AH.01.11.TAHUN 2023 |
| Kedudukan | Kabupaten Ponorogo, Jawa Timur |

**Ini pertama kalinya section ini bisa diisi.** Revisi 1 menahannya karena nomor izin
belum ada. Sekarang ada — dan aturannya tetap: **jangan pernah menulis nomor contoh.**
Salin dari `docs/COMPANY_PROFILE_DATA.md` §2, jangan dari ingatan.

### S10 · Tim & Kredensial — `#tim`

| Aspek | Nilai |
|---|---|
| Layout | grid potret 3 kolom ≥1024 px, 2 ≥640 px, 1 di bawahnya |
| Isi | 6 jabatan; **nama hanya yang sudah menyetujui tayang** (§11.2 data) |
| Kredensial | kartu khusus: **JLPT N1** atas nama Hadi Prasojo, sertifikat N1A225127J |
| Foto | `tim-koirul-mustakim.webp`, `tim-hadi-prasojo.webp`, `fasilitas-grup-staf.webp` |

**Kenapa section ini ada.** Struktur organisasi yang lengkap dan kredensial N1 adalah
bukti kompetensi yang bisa diperiksa — jauh lebih kuat daripada kata “profesional” di
prosa. Dokumen resmi sudah memuatnya; mockup desain melewatkannya.

**Kriteria terima**

- Jabatan lengkap; nama ditampilkan **hanya** dengan persetujuan.
- Kartu kredensial menautkan ke `legal-jlpt-n1-hadi-prasojo.webp`.
- Tidak ada klaim kredensial yang berkasnya tidak ada.

### S11 · Fasilitas & Dukungan — `#fasilitas`

Enam ubin bento 1×1 (3 kolom ≥1024 px, 2 ≥640 px, 1 di bawahnya): ikon + judul ≤4 kata +
satu baris ≤12 kata.

| # | Fasilitas | Ikon | Sumber |
|---|---|---|---|
| 1 | Kelas Bahasa Jepang | `laptop-code` | h. 12, 13 |
| 2 | Ruang Kantor | `building` | h. 12 |
| 3 | Ruang Tamu | `comments` | h. 15 |
| 4 | Asrama | `hotel` | h. 3 |
| 5 | Seragam & Modul | `tshirt` | h. 3 |
| 6 | Ujian JFT & SSW | `clipboard-check` | h. 3 |

**Wajib digabung, bukan ditambah.** Enam item asrama di `LayananSection.astro:64-73`
(Kasur, WiFi, Dapur, Cuci, Motor, OR) **dipindahkan** ke sini sebagai sub-daftar di dalam
ubin “Asrama”, bukan diduplikasi. Kalau tidak, halaman punya dua daftar fasilitas yang
berbeda isinya pada hari pertama ada perubahan.

**Kriteria terima**

- Setiap item fasilitas muncul **tepat satu kali** di seluruh halaman.
- Keenam ubin memakai ikon yang ada di sprite (`DESIGN.md` §3.9).

### S12 · Pita CTA penutup — `#daftar`

| Aspek | Nilai |
|---|---|
| Latar | artwork + overlay; **satu-satunya** area glass selain hero |
| Isi | `h2` satu kalimat (≤8 kata) + subjudul satu baris + 2 CTA |
| CTA | “Lihat Lowongan” (`primary`) dan “Daftar Pelamar” (`on-artwork`) |
| Posisi | setelah grid dua kolom, sebelum footer — jadi di mobile ia muncul **setelah** kontak |

---

## 4. Rail kanan — R1..R5

| # | Kartu | Isi | Data |
|---|---|---|---|
| R1 | Informasi Kontak | Alamat · Telepon 0821-3178-1435 · WhatsApp 0878-8950-2004 · Surel amanahsakurajapan@gmail.com + tombol “Hubungi Kami via WhatsApp” | terverifikasi |
| R2 | Lowongan Ringkas | 5 baris: kode + judul + lokasi + “Lihat Detail →” + “Lihat Semua Lowongan →” | `jobs` |
| R3 | Galeri Perusahaan | grid 2 kolom, 6 foto terpilih (§8) + “Lihat Semua Galeri →” | aset §8 |
| R4 | **Penempatan Kami** | 4 prefektur: **Miyazaki · Okayama · Nagano · Kagoshima** + 3 foto mensetsu | h. 13, 14 |
| R5 | Lokasi Kami | peta + kartu alamat + “Lihat di Google Maps” | koordinat; peta **pindahan** dari `LayananSection.astro:168` |

**Kenapa R4 bukan testimoni.** Dokumen resmi tidak memuat satu pun testimoni. Ia memuat
sesuatu yang lebih berguna: **empat prefektur penempatan yang bisa dibuktikan** dengan
foto mensetsu bertanggal. Mengganti testimoni karangan dengan bukti nyata adalah
pertukaran yang menguntungkan, dan mematuhi aturan P5.

**Kriteria terima**

- `aside` adalah **satu** elemen; tidak ada markah kedua untuk mobile.
- Di 390 px: `document.documentElement.scrollWidth === clientWidth` (tidak ada gulir horizontal).
- Di 1280 px: rail lengket, `top: 5.5rem`, tidak menutupi header.
- Urutan kartu **sama** di kedua bentuk.
- Nama prefektur ditulis dalam huruf Latin; jangan mengarang nama kota Jepang tambahan.

---

## 5. Nav & kontrak anchor

### 5.1 Nav baris atas (desktop) — ✅ dikerjakan L4, dengan satu koreksi rencana

**Rencananya mustahil, dan itu diukur bukan dikira.** Dokumen ini semula (mengikuti
`LANDING_PAGE_ROADMAP.md` §2.3) meminta nav desktop masuk ke `<nav>` yang sudah ada.
Elemen itu adalah **drawer**: `u-viewport-fixed--right`, yaitu `position: fixed;
right: 0; height: 100dvh`. Bar section butuh `position: sticky; top: 0; width: 100%`.
Satu elemen tidak bisa keduanya — dan geometri drawer itu **menanggung beban**:
`e2e/test-drawer.mjs` membuktikan drawer **tertutup** ada di luar layar dengan mengukur
`rect.x` elemen itu (harus sama dengan lebar viewport). Mengubah nav jadi pembungkus
membuat `rect.x` = 0 dan **menghapus bukti itu diam-diam**.

| Aspek | Nilai |
|---|---|
| Wadah | **`<nav>` kedua** di `SiteNav.astro`, `aria-label="Navigasi halaman"` |
| Kenapa label berbeda | ARIA tidak membatasi jumlah landmark `nav`; yang diwajibkan adalah **bisa dibedakan**. "Primary navigation" (aksi situs) dan "Navigasi halaman" (section halaman ini) adalah dua navigasi berbeda, bukan dua nama untuk satu |
| Posisi | `sticky top-0 z-sticky`, dirender **setelah** hero supaya tidak menutupi artwork |
| Mobile | `hidden lg:block` — drawer tetap menangani mobile |
| Permukaan | `bg-canvas` + border bawah, **bukan glass** (`DESIGN.md` §3.6 membatasi glass ke permukaan di atas artwork) |
| Item | Lowongan `#loker` · Program `#program` · Alur `#alur` · Fasilitas `#fasilitas` |
| Kanan | pemilih bahasa ID/JP (memakai `toggleLang` + `langStore` yang **sudah ada**) + “Login Pelamar” |
| Status aktif | `IntersectionObserver` pada pita di bawah bar, bukan `:hover` |

**Item sengaja hanya empat.** "Layanan" masih panel tab tersembunyi dan "Tentang" belum
punya section sama sekali; item nav yang menunjuk fragment tak terselesaikan adalah
tautan yang terlihat hidup dan tidak melakukan apa pun. Keduanya masuk saat section-nya
mendarat (L5 dan S7).

**Lubang "gate hijau palsu" ditutup dalam perubahan yang sama.** Bahaya sebenarnya bukan
"dua nav", tapi `e2e/test-drawer.mjs` memilih drawer lewat `querySelector` pada satu
label dan **tanpa asersi jumlah** — jadi label yang dipakai ulang akan membuat seluruh
asersinya mengukur elemen yang salah dan **tetap lolos**. Gate itu kini mengasersikan
jumlahnya **tepat 1**, dan asersi itu dibuktikan bisa gagal (mutasi: `SiteNav` diberi
label yang sama → merah).

### 5.2 Peta anchor

| Anchor | Tujuan | Dipakai oleh |
|---|---|---|
| `#atas` | Hero | logo |
| `#kenapa-jepang` | Kenapa Jepang? | tautan internal |
| `#loker` | **sudah tidak ada di `/`** — Lowongan Terbaru kini rute `/loker`. Ini tautan antar-rute, bukan anchor | nav, strip hero, CTA (semuanya `href="/loker"`) |
| `#program` | Program ASJ | nav, CTA hero |
| `#layanan` | Layanan ASJ | nav |
| `#alur` | Alur & Persyaratan | tautan internal, CTA |
| `#tentang` | Tentang Kami | nav |
| `#visi-misi` | Visi & Misi | tautan internal |
| `#legalitas` | Legalitas | tautan internal, tombol “Lihat Dokumen” |
| `#tim` | Tim & Kredensial | tautan internal |
| `#fasilitas` | Fasilitas | tautan internal |
| `#kontak` | Informasi Kontak (rail) | nav (opsional), footer |
| `#galeri` | Galeri | tautan internal |
| `#penempatan` | Penempatan Kami (rail) | tautan internal |
| `#lokasi` | Lokasi Kami | footer |
| `#daftar` | Pita CTA | CTA penutup |

**Kriteria terima:** setiap anchor di atas punya elemen dengan `id` yang cocok, dan
membuka `/#legalitas` langsung menggulir ke sana — diukur, bukan dikira.

---

## 6. Kontrak heading

| Aturan | Nilai |
|---|---|
| `h1` per rute | tepat **1** |
| Pemegang `h1` | hero (S1) |
| Nama perusahaan di header | `<div>`, bukan heading |
| `h2` | satu per section (S1..S12, R1..R5) |
| `h3` | judul kartu, judul langkah, judul ubin |
| `h4` | hanya sub-bagian di dalam kartu |
| Larangan | `div` atau `span` yang hanya **terlihat** seperti judul |

`e2e/test-headings.mjs` ada karena `/master` pernah punya 12 “judul section” berbentuk
`<div class="section-title">` yang tak terlihat oleh teknologi bantu. Jangan mengulang.

---

## 7. Matriks responsif

| Section | 390 px | 768 px | 1024 px | 1280 px | 1536 px |
|---|---|---|---|---|---|
| S1 Hero | 1 kolom, bento di bawah teks | teks + bento berdampingan | 12 kolom: 7 + 5 | sama | kontainer dibatasi 1280 |
| S2 Kenapa Jepang | 1 | 2 | 3 | 3 | 3 |
| S3 Lowongan | 1 kartu/baris | 2 | 2 | 2 | 2 |
| S4 Program | 1 | 2 | 3 | 3 | 3 |
| S6 Alur | 1 kolom vertikal | 2 kolom | 6 kolom + panah | 6 kolom | 6 kolom |
| S7 Tentang | 1 kolom | 1 kolom | prosa + gambar | sama | sama |
| S8 Visi & Misi | bertumpuk | berdampingan | berdampingan | berdampingan | berdampingan |
| S10 Tim | 1 | 2 | 3 | 3 | 3 |
| S11 Fasilitas | 1 | 2 | 3 | 3 | 3 |
| Rail R1..R5 | kartu bertumpuk di bawah `main` | idem | mulai jadi kolom | kolom lengket 22 rem | sama |
| Nav | drawer | nav baris atas + drawer | nav baris atas | nav baris atas | nav baris atas |
| Bottom nav | 4 tombol (Beranda/Lowongan/Program/Profil) | — | — | — | — |

**Ambang rail.** Rail mulai jadi kolom di **1280 px**, bukan 1024 px: di 1024 px kolom
utama hanya menyisakan 1024 − 352 − 48 = 624 px, dan pada lebar itu kartu loker dua
kolom menjadi terlalu sempit untuk judul 5–8 kata.

---

## 8. Pemetaan aset

26 aset siap di `E:\desain\company-assets\` — manifest lengkap + alt text di
`docs/COMPANY_PROFILE_DATA.md` §11.

| Section | Aset | Butuh izin tayang? |
|---|---|---|
| S1 Hero | logo mark | tidak — logo |
| S4 Program | `poster-rekrutmen.webp` (opsional) | tidak — materi resmi |
| S7 Tentang Kami | `fasilitas-gedung.webp` | tidak — bangunan |
| S9 Legalitas | `legal-ahu-0063921-2023.webp`, `legal-akta-09-2023.webp` | tidak — dokumen perusahaan |
| S10 Tim | `tim-koirul-mustakim.webp`, `tim-hadi-prasojo.webp`, `fasilitas-grup-staf.webp` | **ya** |
| S10 Kredensial | `legal-jlpt-n1-hadi-prasojo.webp` | tidak — sertifikat |
| S11 Fasilitas | `fasilitas-ruang-kantor-1.webp`, `fasilitas-kelas-bahasa-1.webp`, `fasilitas-ruang-tamu-1.webp` | tidak — ruangan |
| R3 Galeri | 6 foto: `galeri-keberangkatan-1`, `fasilitas-grup-siswa-1`, `fasilitas-grup-siswa-2`, `fasilitas-kelas-bahasa-2`, `fasilitas-ruang-tamu-3`, `fasilitas-gedung-banner` | **ya** |
| R4 Penempatan | `galeri-mensetsu-pengolahan-makanan`, `galeri-mensetsu-pertanian-1`, `galeri-mensetsu-peternakan` | **ya** |

**Cara unggah: Supabase Storage `asj-files/assets/company/`, bukan `git add`.** Repo ini
publik dan foto-foto itu memuat wajah yang bisa dikenali. Alasan lengkap:
`docs/COMPANY_PROFILE_DATA.md` §11.2.

**Aturan tayang sampai izin ada.** Pakai hanya foto yang tidak menampilkan wajah dominan:
gedung, ruang kantor, kelas (tampak belakang), ruang tamu. Foto kandidat dan grup
ditahan sampai izin tayang ada.

---

## 9. Yang masih menunggu pemilik

Tujuh item. Selebihnya sudah terverifikasi di `docs/COMPANY_PROFILE_DATA.md`.

| # | Data | Dipakai di | Kalau belum ada |
|---|---|---|---|
| P-1 | Jumlah kandidat terlatih | S1 bento | ubin diganti “5 bidang penempatan” |
| P-2 | Jumlah keberangkatan | S1 bento | idem |
| P-3 | Jumlah perusahaan mitra Jepang | S1 bento | idem |
| P-4 | Jam operasional kantor | R1 kontak | baris jam dihilangkan |
| P-5 | **Konfirmasi tinggi badan wanita** — 145 cm (h. 3) atau 150 cm (h. 4) | S6 persyaratan | tampilkan angka h. 4 + catatan, atau tahan section-nya |
| P-6 | Akun TikTok masih aktif atau tidak | footer | tautan dilepas |
| P-7 | Izin tayang foto kandidat | galeri, penempatan, tim | hanya foto gedung/kantor/kelas |

**Dua koreksi yang harus dikerjakan di kode, bukan ditanyakan** — keduanya sudah
terverifikasi dari dokumen resmi:

| # | Yang salah sekarang | Yang benar | Berkas |
|---|---|---|---|
| K-2 | `instagram.com/amahsakurajp` | **`@amanah_sakura_japan`** | `Footer.astro:40` |
| K-10 | hanya satu nomor telepon | tambahkan **0821-3178-1435** | `Footer.astro`, R1 |

---

## 10. Urutan implementasi

Dipetakan ke `docs/LANDING_PAGE_ROADMAP.md` §3. Satu fase hijau sebelum lanjut.

| Fase | Isi | Berkas utama | Gate yang menyentuh |
|---|---|---|---|
| **L0** ✅ | Pindahkan `switchTab` ke modul bertest | `src/lib/publicSections.ts`, `index.astro`, `public.astro` | `vitest`, `e2e:public` |
| **L1** ✅ | Fondasi: `Section`, `SectionTitle`, `Card`; token `DESIGN.md` §3; T-01/T-03/T-04 | `src/styles/theme.css`, `src/components/public/`, `src/layouts/BaseLayout.astro` | `bundle:size`, `verify:classes`, `lint-ratchet` |
| **L2** ✅ | S1 Hero + S12 Pita CTA; `h1` pindah; strip lowongan hidup | `App.tsx`, `ClosingBand.astro`, `index.astro`, `e2e/test-headings.mjs` | `e2e:headings`, `e2e:drawer`, `i18n.keys` |
| **L3** 🟡 | S2, S4, S6, S8, S9, S11, R1 ✅ · S7, S10, R3, R4, R5 ⏸ (butuh pemilik) | `src/components/public/*`, `src/lib/companyProfile.ts`, `index.astro` | `e2e:public`, `verify:classes`, `i18n.keys` |
| **L4** | Nav baris atas: item, penanda aktif, bahasa, login; **koreksi K-2 & K-10** | `App.tsx`, `Footer.astro` | `e2e:drawer`, `e2e:labels` |
| **L5** | S3 kartu loker + filter + pencarian; tabel dipertahankan | `JobGrid.tsx`, `JobCard.tsx` | `e2e:loker-layout`, `vitest` |
| **L6** | Rail lengket + R2 | `index.astro`, `JobMiniList.tsx` | `e2e:public` |
| **L7** | Bottom nav tamu 4 tombol; clearance | `BottomNav.tsx`, `layout.css` | `settings-limit`, `e2e:public` |
| **L8** | Gate halaman: `e2e/test-landing.mjs` | `e2e/` | gate baru **dibuktikan bisa gagal** |

### Tiga penyimpangan sadar dari rencana L2

| Rencana | Yang dikerjakan | Alasan |
|---|---|---|
| Hero di `src/components/public/HeroProfile.astro` | **Hero jadi varian header di `App.tsx`** (`hero` prop) | Latar band itu artwork tema, dan nilainya hidup di `bannerStore` — state browser yang **sudah** diselesaikan dan didengarkan `App`. Hero `.astro` terpisah butuh salinan **ketiga** peta tema→artwork (`App.tsx` dan `Footer.astro` sudah masing-masing punya satu). Menggandakannya demi tata letak berkas adalah pertukaran yang salah |
| Pita CTA pakai artwork + overlay | **Permukaan solid + ring aksen** | Alasan yang sama, plus: band yang berganti tema sementara header/footer juga berganti adalah bug yang **sudah pernah terjadi** dan tercatat di komentar `Footer.astro` |
| L2.4 tab → anchor | **Ditunda ke L3** | Anchor `#program`, `#tentang`, `#proses` belum punya tujuan. Mengonversinya sekarang berarti anchor menggantung; konversi mendarat bersama targetnya di L3 |

**L0, L1, L2 sudah dikerjakan** (2026-09-19). Bukti L2: `e2e:headings` hijau **termasuk `/` dan `/public`** di 390 px dan 1280 px (gate itu diperluas justru karena sebelumnya tidak mencakup kedua rute yang diubah), `e2e:public` 9/9, `e2e:drawer` 6/6, `lint-ratchet` 2476 = baseline, `verify:classes` hijau, `npm run build` bersih, dan inventaris indexer **443** (terukur).

**Dua gate diperluas di L2, keduanya dibuktikan bisa gagal:**

| Gate | Yang ditutup | Cara dibuktikan |
|---|---|---|
| `e2e/test-headings.mjs` | `/` dan `/public` tidak pernah diperiksa, padahal L2 mengubah `h1` di keduanya | Mutasi: turunkan `h1` hero jadi `h2` → **6 check FAILED** di kedua lebar |
| `i18n.keys.test.ts` | namespace `profile` belum ada di daftar `NS`, jadi kuncinya tak tervalidasi | Mutasi: hapus satu kunci JP → merah dengan nama kuncinya |

### L3 — apa yang sudah jalan, apa yang menunggu pemilik

Tujuh section berisi **data yang sudah terverifikasi**, semuanya di `index.astro` sebagai
bagian dari alur halaman: **S2 Kenapa Jepang**, **S4 Program ASJ**, **S6 Alur &
Persyaratan**, **S8 Visi & Misi**, **S9 Legalitas**, **S11 Fasilitas**, dan **R1 Informasi
Kontak**. Semuanya **dirender server** — `dist/index.html` memuat 18 `h2`, 27 `h3` (diukur
2026-09-23), nomor AHU asli, harga, dan keenam langkah alur, jadi berbeda dari hero yang
bergantung hidrasi.

**Keenam blok ini sudah dirender** — keenam `id`-nya ada di `dist/index.html` — **tetapi
masing-masing masih menunggu satu bagian**, dan alasannya bukan pekerjaan yang belum sempat:

| Blok | Yang ditunggu |
|---|---|
| S7 Tentang Kami | prosa dari pemilik (P-3 data). Section tanpa prosa bukan section |
| S10 Tim & Kredensial | izin tayang nama & foto (P-7) |
| R1 Informasi Kontak | jam operasional (P-4) — blok tetap dirender, **baris jamnya** yang dihilangkan |
| R3 Galeri | izin tayang foto kandidat (P-7) |
| R4 Penempatan | izin tayang foto mensetsu (P-7) |
| R5 Lokasi | koordinat peta (P-8) |

**Satu penyimpangan lagi, dan alasannya.** Rencana menaruh tiap section di berkasnya
sendiri (`WhyJapan.astro`, `LegalSection.astro`, …). Yang dikerjakan sebaliknya: **empat
primitif** (`IconTileGrid`, `FactList`, `StepList`, `CheckList`) sebagai berkas, dan
keenam section dirangkai di `index.astro`. Alasannya: enam dari blok itu adalah tiga
elemen yang sama — `Section` + `SectionTitle` + satu primitif — dengan data berbeda. Satu
berkas per komposisi berarti enam berkas tanpa logika dan tanpa enkapsulasi, yang
masing-masing tetap menggeser inventaris indexer. **Primitifnya** yang reusable, dan
itulah yang jadi berkas; sisanya komposisi halaman.

### ⚠ Empat primitif itu `.tsx`, bukan `.astro` — dan itu bukan selera

Rencana menulisnya `.astro`. Ketiganya diubah ke `.tsx` setelah **`build.test.ts:428`
merah dengan 21 rujukan tak terselesaikan**, dan ke-21-nya adalah hal yang sama:
**parameter callback `.map()` di dalam template `.astro`.**

Sebabnya ada di parser indexer sendiri: `parse.ts` menyatakan bahwa interpolasi template
`.astro` diselesaikan terhadap **scope modul frontmatter**, bukan scope bersarang — jadi
parameter callback tidak terikat dan dilaporkan sebagai global yang tidak dikenal.
`App.tsx` sudah lama memakai `.map()` tanpa masalah karena `.tsx` mengikatnya dengan
benar.

Tiga jalan keluar, dan yang dipilih bukan yang termurah:

| Jalan | Putusan |
|---|---|
| Ajarkan indexer scope template bersarang | Perubahan besar pada tool yang kompleks; di luar lingkup fase ini |
| Tambahkan filter di asersi `build.test.ts:428` | **Ditolak.** Komentar test itu sendiri meminta asersi itu **diciutkan kembali** ke `length === 0` saat gap-nya menutup. Menambah filter menggerakkan repo ke arah yang salah |
| **Pindahkan primitif berloop ke `.tsx`** | **Dipilih** — invarian "nol unresolved di produksi" tetap utuh, tanpa filter baru |

Biayanya terukur nol: komponen `.tsx` **tanpa direktif `client:*` dirender Astro menjadi
HTML statis dan tidak mengirim JavaScript**. Dibuktikan dengan build sebelum dan sesudah
— daftar aset tetap **56 berkas / 1808,3 KB**, identik.

`index.astro` kini **tidak punya satu pun `.map()`**, dan itu dijaga bukan oleh niat tapi
oleh invarian indexer: pola itu akan langsung memerahkan `build.test.ts:428`.

**Konversi tab → anchor (L2.4) ikut ditunda ke L5**, dan alasannya terukur: panel loker
masih memuat tabel **159 baris**. Membentangkannya ke dalam satu gulir bersama sepuluh
section lain akan menghasilkan halaman yang lebih buruk daripada tab yang ada sekarang.
Konversinya mendarat bersama L5, saat tabel itu menjadi grid kartu dengan rute “lihat
semua”.

**`companyProfile.ts` dipindah dari L1 ke L3.** Rencana awal menaruhnya di fase fondasi,
dan itu keliru: modul itu memuat ~110 kunci i18n yang **hanya berguna kalau ada yang
merendernya**. Menulisnya lebih dulu berarti menulis dua kamus (ID + JP) tanpa satu pun
konsumen, sehingga `i18n.keys.test.ts` tidak bisa membuktikan apa pun tentangnya. Di L3
kunci dan pemakainya mendarat bersamaan, dan gate itu langsung bergigi. Ini juga alasan
namespace `profile` **belum** ditambahkan ke daftar `NS` di `i18n.keys.test.ts`: menambah
namespace sebelum ada kunci berarti menyalakan gate untuk himpunan kosong.

**L0 dan L1 sudah dikerjakan** (2026-09-19). Buktinya: `lint-ratchet` 2476 = baseline,
`verify:classes` hijau, `tsc --noEmit` bersih, `publicSections.test.ts` 19 lulus dan
**terbukti bisa gagal** (mutasi resolver → 6 merah), dan inventaris indexer naik
**+2 ts +3 astro** (437 → 442, terukur).

Koreksi **K-2** (Instagram) dan **K-10** (telepon kedua) dikerjakan di **L4** bersama nav,
karena keduanya menyentuh `Footer.astro` dan sumber kontak yang sama.

**L2 adalah fase paling berisiko** dan dikerjakan di akhir sesi, bukan sebelum pekerjaan
lain — `App.tsx` disalin ke semua rute lewat `BaseLayout`, jadi kalau perlu di-revert
tidak boleh ada yang setengah jalan.

---

## 11. Definisi selesai & cara mengukur

### 11.1 Per fase

1. `npx tsc --noEmit` bersih.
2. `npx vitest run` hijau (frontend + backend + indexer).
3. `npm run lint-ratchet` **PASSED** tanpa menurunkan baseline.
4. `npm run build` bersih — **bukan** hanya `astro build`; `build-sw-manifest` ikut.
5. Gate yang tersentuh dijalankan; gate yang **baru** dibuktikan **bisa gagal**.
6. Commit per berkas; tidak pernah `git add -A`.
7. Angka ratchet diukur ulang di HEAD, bukan dihitung dari keyakinan.
8. **Tidak push.** `main` lokal 90 commit di depan `newrepo/main`; push = deploy.

### 11.2 Untuk halaman ini secara keseluruhan

| Kriteria | Cara mengukur |
|---|---|
| Satu `h1`, outline benar | `npm run e2e:headings` |
| Satu landmark nav | hitung `nav[aria-label="Primary navigation"]` = 1 |
| Semua anchor punya tujuan | setiap `id` di §5.2 ada di DOM |
| Tidak ada gulir horizontal | 390 px: `scrollWidth === clientWidth` |
| Target sentuh | semua tombol ≥44 px, ≥48 px di formulir mobile |
| Tidak ada angka hardcode | mutasi: ketik satu angka di markah → gate merah |
| Tidak ada teks placeholder | mutasi: sisipkan `lorem ipsum` → gate merah |
| Urutan section benar | mutasi: tukar dua section → gate merah |
| **Angka 2015 tidak muncul sebagai klaim perusahaan** | `grep -rn "2015" src/components/public/ src/lib/companyProfile.ts` = 0 hasil. **Jangan** memakai `grep` seluruh `src/`: 18 kemunculan `2015` sudah ada di berkas uji CV/rirekisho sebagai contoh tahun, dan semuanya sah |
| **Nomor legal cocok dengan §2 data** | bandingkan tiap baris dengan `COMPANY_PROFILE_DATA.md` §2 |
| Kontras | seluruh pasangan di `DESIGN.md` §3.1/§3.2 lolos AA |
| Terbaca di 3 tema banner | screenshot 390 px & 1280 px × SAKURA/TOKYO/INTER_VIP |
| Anggaran bundel | `npm run bundle:size` sebelum & sesudah |

---

## 12. Risiko terukur

| Risiko | Kenapa nyata | Pencegahan |
|---|---|---|
| **Gate hijau palsu** | **Dua** tempat memilih nav lewat satu selektor bername, keduanya tanpa asersi jumlah: `e2e/test-drawer.mjs:71` dan `src/components/App.header.test.tsx:106`. Yang kedua **tidak punya asersi jumlah sama sekali** — ia mengukur `nav[...] button[aria-label="Close"]`. Akibatnya bahayanya **tidak simetris**: `<nav>` kedua yang ditaruh **sebelum** drawer membuat unit test itu gagal keras (Close jadi `null`), tapi yang ditaruh **sesudah** drawer membuat **semuanya tetap hijau** sementara jaminannya sudah hilang | Perluas nav yang ada; hitung `document.querySelectorAll('nav[aria-label="Primary navigation"]').length === 1` sebagai asersi baru, dan buktikan asersi itu bisa gagal |
| **`h1` kedua** | Hero yang wajar akan menambah `h1` | Pindahkan `h1` header ke `div` **dalam commit yang sama** |
| **Angka mockup lolos ke produksi** | “2015”, “5+ tahun”, “500+”, “Jl. Raya Kalimalang” ada di gambar acuan dan terlihat masuk akal | Semua angka berasal dari `companyProfile.ts`; gate `grep 2015` |
| **Nomor legal salah ketik** | Satu digit salah = klaim hukum palsu | Salin dari `COMPANY_PROFILE_DATA.md` §2, jangan dari ingatan |
| **Tinggi badan wanita** | Dua halaman menyebut angka berbeda (145 vs 150) | Tanyakan (P-5); jangan pilih sendiri |
| **Foto wajah masuk repo publik** | Repo publik, dan sebagian subjek kemungkinan di bawah umur | Unggah ke Supabase Storage; tahan foto kandidat sampai izin ada |
| **Kelas hanya “kelihatan” seperti kelas** | `verify-classes.mjs` membaca token dari komentar juga | Kalau menghapus pemakaian kelas, jangan tulis namanya di komentar |
| **`build` setengah jalan** | `astro build` gagal ⇒ `dist/sw.js` versi DEV ⇒ 5 tes `swOffline` merah palsu | Selalu `npm run build`; kalau perlu `node scripts/build-sw-manifest.mjs` |
| **Snapshot baterai salah** | Saat perbaikan belum di-commit, yang benar adalah **pohon hidup** | Jalankan baterai di pohon hidup sampai commit dibuat |
| **CRLF** | Baterai mati senyap kalau `*.sh/.mjs/.cjs` ber-CRLF | Biarkan `eol=lf` di `.gitattributes` |
| **Peta ganda** | Peta sudah ada di `LayananSection.astro:168` | Pindahkan, jangan buat kedua |
| **Fasilitas ganda** | 6 item asrama sudah ada di `LayananSection.astro:64` | Pindahkan ke S11, jangan duplikasi |
| **Rail mendorong kolom utama terlalu sempit** | Ambang 1280 px dipilih karena alasan terukur (§7) | Jangan menurunkan ambang tanpa mengukur lebar kartu loker |

---

## 13. Bacaan berikutnya

- `docs/COMPANY_PROFILE_DATA.md` — data resmi + 10 konflik terverifikasi + manifest aset.
- `DESIGN.md` — token, komponen, aturan bento, aksesibilitas, keputusan warna brand.
- `docs/LANDING_PAGE_ROADMAP.md` — fase L0..L8 dan tiga jebakan terukurnya.
- `docs/UI_DESIGN_REVIEW.md` — §21 kelas yang hanya *kelihatan* seperti kelas, §23 heading.
- `src/lib/jobDisplay.ts` — satu-satunya tempat nilai data loker diterjemahkan.
- `E:\desain\company-assets\` — 26 aset siap unggah.
- `scripts/ci/review-manifest.json` — daftar gate; baca sebelum menambah gate baru.
