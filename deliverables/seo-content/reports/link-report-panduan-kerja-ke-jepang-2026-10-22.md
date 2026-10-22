# LAPORAN STRATEGI TAUTAN & KESEHATAN KONTEN

**Artikel:** Panduan Kerja ke Jepang 2026: Syarat, Biaya, Gaji, dan Prosesnya
**Tipe:** Artikel pillar / hub klaster
**Klien:** PT Amanah Sakura Japan (ASJ Portal) — `https://asjastro.netlify.app`
**Slug:** `/blog/panduan-kerja-ke-jepang-2026`
**Draf yang diaudit:** `drafts/panduan-kerja-ke-jepang-2026-10-22.md` (4.160 kata)
**Disusun oleh:** 连乐桥 (Link Strategist)
**Tanggal:** 22 Oktober 2026

---

## 0. RINGKASAN EKSEKUTIF

**Skor kesehatan konten: 82/100** (audit awal 83; **−1** setelah koreksi ¥1.177 terkonfirmasi — lihat §5.3). Proyeksi setelah perbaikan: **90/100**.

Empat temuan yang mengubah prioritas. Tiga pertama dari verifikasi langsung ke situs live, keempat dari audit silang dengan SEO优化师 — bukan asumsi:

1. **`/public` ternyata halaman KOSONG.** Halaman itu hanya memuat judul "Lowongan & Layanan — ASJ Portal" dan tautan "Kembali ke Portal" — sekitar 5 kata, tanpa satu pun rincian biaya. Padahal draf menautkannya dengan anchor *"rincian biaya program dan informasi publik ASJ"* di bagian transparansi biaya, yaitu bagian dengan nilai konversi tertinggi. **Ini tautan terlemah di seluruh artikel: janji anchor tidak dipenuhi tujuan.**
2. **`/loker` tidak memuat satu baris lowongan pun.** Yang terender hanya H1 "Lowongan Terbaru", satu kalimat, dan header tabel kosong (Kode Job / Nama Pekerjaan / Status / Persyaratan / Aksi Pelamar). Dua tautan draf beranchor *"lowongan kerja Jepang yang sedang dibuka"* mengirim pembaca ke tabel kosong.
3. **Hanya beranda `/` yang benar-benar kaya teks dan statis** — dan isinya justru melampaui dugaan: ada seksi **"Legalitas & Izin Resmi"** (SK Kemenkumham AHU-0063921.AH.01.01.TAHUN 2023, Akta Notaris No. 09/2023, nomor pendaftaran 4023082735107914) dan seksi **"Penempatan Kami"** (prefektur Miyazaki, Okayama, Nagano, Kagoshima). Dua fakta ini membuka peluang tautan yang jauh lebih bernilai daripada tautan yang ada sekarang.
4. **Angka upah ¥1.176 salah; yang benar ¥1.177 — TERKONFIRMASI.** Diverifikasi langsung oleh team-lead dari PDF MHLW *令和8年度 地域別最低賃金 全国一覧* (`mhlw.go.jp/content/11200000/001753404.pdf`). Ini bukan salah ketik sepele: angka itu fondasi **seluruh tabel simulasi**, dan artikel sengaja menampilkan rumus terbuka sehingga pembaca bisa mengalikannya sendiri dan menemukan tabelnya tidak cocok. **Urutan wajib: koreksi angka → hitung ulang tabel → baru pasang tautan MHLW.** Rincian §6 GAP #2.

**Konsekuensi strategis:** arsitektur tautan artikel ini saat ini menyalurkan bobot ke 5 halaman yang tidak bisa menerima bobot (0–15 kata terindeks). Perbaikan harus mengarahkan tautan ke **satu-satunya node yang layak: `/`**, dan memindahkan sisa tautan ke fungsi konversi murni — bukan seolah-olah tautan itu bernilai SEO.

**Status 7 tautan internal:** **5 dipertahankan** (2 di antaranya dengan anchor diperbaiki), **1 diganti tujuan (retarget)**, **1 dipertahankan dengan anchor divariasikan**. Rincian di §1.

---

## 1. AUDIT 7 TAUTAN INTERNAL YANG SUDAH TERPASANG

### 1.1 Bukti teknis: kondisi nyata setiap halaman tujuan

Diverifikasi langsung 22 Oktober 2026, bukan diasumsikan dari brief.

| Halaman | Judul dokumen | Teks bermakna yang terender | Diagnosis |
|---|---|---|---|
| `/` | PT Amanah Sakura Japan — Job Portal | **±1.200+ kata**: Legalitas & Izin Resmi, Penempatan Kami, Program ASJ, Persyaratan, FAQ, Tim | **Statis & kaya teks.** Satu-satunya tujuan yang layak menerima bobot |
| `/loker` | Lowongan Kerja — PT Amanah Sakura Japan | **±12 kata**: "Lowongan Terbaru", "Daftar lowongan aktif dari mitra kami di Jepang.", header tabel kosong, **0 baris data** | CSR. Tidak ada lowongan untuk diindeks |
| `/siswa-baru` | ASJ - Pendaftaran Siswa (AI Assistant) | **±10 kata**: "MEMUAT ASJ OS V7…", "Mempersiapkan UI Modern", "Tutup Paksa Loading", "Versi —" | CSR. Bahkan berupa **layar loading**, bukan formulir |
| `/apply` | ASJ - Form Lamaran Kerja | **±4 kata**: H1 "Form Lamaran", "Portal" | CSR. Hanya judul |
| `/public` | **Lowongan & Layanan** — ASJ Portal | **±5 kata**: judul, "Kembali ke Portal" | **KOSONG.** Tidak ada konten apa pun. Judul pun tidak sesuai anchor |
| `/ai-cv` | **ASJ AI - Qween Jeklin** | **±4 kata**: H1 "AI CV Chat", "Portal" | CSR. Hanya judul |
| `/master`, `/candidate` | — | — | **Jangan ditautkan.** Tampak sebagai rute aplikasi internal (master data, dashboard kandidat), bukan halaman publik |

> **Catatan tambahan (temuan sampingan, di luar lingkup tautan):** `<title>` halaman `/ai-cv` adalah **"ASJ AI - Qween Jeklin"** — nama merek yang tidak konsisten dengan ASJ. Kemungkinan sisa proyek lama. Layak dilaporkan ke 沈略 untuk dibereskan; halaman yang ditautkan dari pillar sebaiknya tidak membawa nama merek asing.

### 1.2 Tabel audit per tautan

| # | Target | Anchor yang dipakai | H2 penempatan | Posisi kata (≈) | Relevansi | Patuh "maks 1 tautan/H2"? | Rekomendasi |
|---|---|---|---|---|---|---|---|
| 1 | `/loker` | "lowongan kerja Jepang yang sedang dibuka" | H2 Tiga Jalur Resmi Kerja ke Jepang | 27% | **Tinggi** | ✅ (1/1) | **PERTAHANKAN** |
| 2 | `/siswa-baru` | "pendaftaran siswa pelatihan bahasa Jepang" | H2 Syarat Kerja ke Jepang 2026 | 31% | Sedang–tinggi | ✅ (1/1) | **PERTAHANKAN, GANTI ANCHOR** |
| 3 | `/public` | "rincian biaya program dan informasi publik ASJ" | H2 Berapa Biaya Kerja ke Jepang? | 40% | **Rendah** (halaman kosong) | ✅ (1/1) | **GANTI TUJUAN → `/#program`** |
| 4 | `/` | "profil dan legalitas PT Amanah Sakura Japan" | H2 Apakah Kerja ke Jepang Aman dan Legal? | 73% | **Tinggi** (terverifikasi akurat) | ✅ (1/1 internal) | **PERTAHANKAN** |
| 5 | `/ai-cv` | "buat CV bahasa Jepang dengan bantuan AI" | H2 Kerja ke Jepang untuk Lulusan SMA/SMK | 83% | Sedang–tinggi | ✅ (1/1) | **PERTAHANKAN** |
| 6 | `/apply` | "form lamaran kerja" | H2 Langkah Mulai dari Nol — Checklist 30 Hari | 88% | Tinggi | ✅ (1/1) | **PERTAHANKAN, poles anchor** |
| 7 | `/loker` | "lowongan kerja Jepang yang sedang dibuka" | H2 Kesimpulan | 99% | Tinggi | ✅ (1/1) | **PERTAHANKAN, VARIASIKAN ANCHOR** |

**Kepatuhan aturan "maks 1 tautan per H2": 7 dari 7 patuh.** Tidak ada satu H2 pun yang menerima dua tautan ke halaman yang sama. Ini bagian terkuat dari arsitektur yang ada.

**Catatan kepadatan H2 Legalitas:** H2 tersebut memuat **3 tautan** (1 internal `/` + 2 eksternal `kp2mi` & `jdih`). Ini masih wajar karena H2 itu panjang (±520 kata, 5 sub-H3) dan ketiga tautan melayani tiga fungsi berbeda: bukti legalitas, regulasi, kanal pengaduan.

### 1.3 Justifikasi tiap rekomendasi

**#1 `/loker` di H2 Tiga Jalur — PERTAHANKAN.**
Kalimatnya: *"Ingin melihat bidang apa saja yang sedang dibuka? Mulai dari daftar lowongan kerja Jepang yang sedang dibuka, lalu bandingkan dengan tiga jalur di atas."* Penempatan ideal: paruh pertama artikel (pembaca paling engaged, sesuai brief §4), dan konteksnya tepat (bidang ↔ jalur). Anchor deskriptif dan membawa makna sendiri — krusial karena halaman tujuan hanya punya 12 kata.
**Peringatan:** karena `/loker` sedang kosong, tautan ini berisiko mengecewakan pembaca. Lihat §6 butir 1 — perbaikan harus di sisi situs, bukan dengan menghapus tautan.

**#2 `/siswa-baru` — PERTAHANKAN, GANTI ANCHOR.**
Anchor sekarang: *"pendaftaran siswa pelatihan bahasa Jepang"*. Masalahnya bukan relevansi, tapi **register bahasa**: frasa itu adalah istilah administratif internal (judul formulir), bukan bahasa yang dicari pembaca. Kalimat induknya pun jadi berbelit: *"mulailah dari kelas dasar lewat pendaftaran siswa pelatihan bahasa Jepang"*.
**Anchor baru yang disarankan:** **"kelas bahasa Jepang dari dasar"** → *"…mulailah dari kelas bahasa Jepang dari dasar."*
Alasan: deskriptif, cocok dengan niat pembaca di titik itu (baru sadar belum bisa bahasa Jepang), dan tetap jujur terhadap tujuan. Halaman tujuan hampir tidak punya teks, jadi anchor inilah satu-satunya sinyal semantik yang diterima mesin pencari.

**#3 `/public` — GANTI TUJUAN. Ini temuan terpenting laporan ini.**
Draf menulis: *"Rincian resminya ada di halaman [rincian biaya program dan informasi publik ASJ](/public)."* Halaman `/public` **tidak memuat rincian biaya apa pun** — hanya judul "Lowongan & Layanan" dan tombol kembali. Tiga kerugian sekaligus:
- **Janji anchor tidak dipenuhi** → pembaca kehilangan kepercayaan tepat di bagian yang seluruh diferensiasinya adalah kepercayaan ("biaya yang wajar selalu bisa dijelaskan baris per baris").
- Anchor menyebut "informasi publik" → mengarah ke halaman kosong, ironi yang merusak klaim transparansi.
- Bobot terbuang ke halaman tanpa konten.

**Rekomendasi:** arahkan ke **`/#program`** (atau `/` bila id anchor tidak tersedia — verifikasi dulu), dengan anchor **"rincian biaya program ASJ dan apa saja yang termasuk"**.
Dasar: seksi "Program ASJ" di beranda **benar-benar memuat** angka yang dijanjikan anchor — biaya program Rp 6 juta, bisa dicicil, sudah termasuk modul & kamus, seragam, asrama, serta ujian JFT & SSW masing-masing satu kali. Persis yang diklaim draf di kalimat sebelumnya. Jadi perbaikan ini bukan sekadar memindahkan tautan; ia **membuat klaim draf bisa diverifikasi pembaca**.
*Catatan implementasi:* id anchor **`#program` terverifikasi ada** di `index.astro:231` dan **`#penempatan`** di `index.astro:406`. **`#legalitas` TIDAK ada** — team-lead sudah grep `index.astro` dan hanya dua id itu yang terpasang, jadi untuk tautan H2 Legalitas gunakan **`/` polos**, bukan `/#legalitas`.

**#4 `/` di H2 Legalitas — PERTAHANKAN, anchor sudah akurat.**
Ini satu-satunya tautan draf yang saya verifikasi **benar-benar ditepati tujuannya**. Beranda memuat seksi eksplisit **"Legalitas & Izin Resmi"** berisi badan hukum, SK Kemenkumham, akta notaris, nomor pendaftaran, dan kedudukan (Ponorogo). Bahkan status "belum berstatus SO" di draf (baris 359) juga tercantum apa adanya di beranda. Anchor *"profil dan legalitas PT Amanah Sakura Japan"* → tepat sasaran. Pertahankan tanpa perubahan.

**#5 `/ai-cv` — PERTAHANKAN.**
Anchor *"buat CV bahasa Jepang dengan bantuan AI"* relevansi tinggi dan sesuai konteks (H2 lulusan SMA/SMK membahas CV format Jepang/rirekisho). Halaman tujuan hanya punya H1 "AI CV Chat", jadi anchor ini wajib tetap deskriptif — dan sudah begitu.
*Alternatif penempatan (tidak saya rekomendasikan sebagai default):* brief §4 menyarankan H3 "Dokumen yang harus disiapkan" di H2 Syarat, karena di situ CV disebut. Saya menolak memindahkannya karena **distribusi lebih penting**: H2 Lulusan SMA/SMK adalah segmen audiens inti ASJ dan tanpa tautan ini H2 tersebut menjadi jalan buntu. Konteksnya juga sahih: CV adalah hambatan nyata bagi pelamar tanpa pengalaman.

**#6 `/apply` — PERTAHANKAN, poles anchor.**
Relevansi tinggi dan penempatan logis (langkah 12 dari checklist). Perbaikan kecil: **"form lamaran kerja" → "formulir lamaran kerja"** (baku, lebih layak dipercaya di artikel yang mengklaim transparansi). Halaman tujuan punya H1 "Form Lamaran", jadi anchor ini konsisten dengan tujuan.

**#7 `/loker` di Kesimpulan — PERTAHANKAN, VARIASIKAN ANCHOR.**
Dua tautan `/loker` memakai anchor **identik kata per kata** ("lowongan kerja Jepang yang sedang dibuka"). Untuk 4.160 kata, duplikasi persis ini terbaca sebagai templat. Ubah yang di kesimpulan menjadi **"daftar lowongan kerja Jepang terbaru"** (atau "lowongan Jepang yang sedang dibuka saat ini"). Jarak antar-tautan ±3.000 kata — aman.

---

## 2. REKOMENDASI TAUTAN TAMBAHAN

Total tautan sehat untuk artikel 4.160 kata: **7–9 internal**. Sekarang ada 7. Saya menyarankan **1 tambahan** (bukan 2) — dan itu pun dengan syarat, karena dua "celah" lain ternyata bukan celah tautan melainkan celah konten/situs.

### Tambahan #1 (DIREKOMENDASIKAN): tautan MHLW di H2 Gaji

**⚠️ Urutan wajib: koreksi angka dulu, baru pasang tautan.** Draf menulis ¥1.176; angka resmi yang diverifikasi SEO优化师 dari PDF MHLW 令和8年度地域別最低賃金全国一覧 adalah **¥1.177** (naik dari ¥1.121). Menautkan MHLW sebelum angka diperbaiki berarti tautan itu **membantah artikelnya sendiri** — lebih buruk daripada tidak ada tautan sama sekali. Lihat §6 GAP #2.

| Item | Isi |
|---|---|
| **Target** | `https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/index.html` |
| **Anchor** | "daftar upah minimum per prefektur (MHLW)" |
| **Posisi persis** | H2 "Berapa Gaji Kerja di Jepang? Angka dan Simulasinya" → H3 "Upah minimum Jepang 2026", **tepat setelah kalimat** *"Angka per prefektur berbeda, dan penerapannya bertahap."* |
| **Alasan** | (a) H2 ini **gurun tautan terbesar**: ±620 kata, nol tautan, padahal niat komersialnya tertinggi. (b) Kalimat itu menyatakan upah berbeda per prefektur lalu berhenti tanpa jalan keluar — pembaca tidak bisa berbuat apa-apa dengan informasi itu. MHLW mengubahnya dari abstrak jadi terbukti: rentang nasional ¥1.085 (Miyazaki) – ¥1.280 (Tokyo), berlaku bertahap 1 Okt – 2 Des 2026. (c) Ini **sumber primer** untuk angka yang menjadi fondasi seluruh H2 — lebih otoritatif daripada `ssw.go.jp` untuk klaim ini. (d) Menutup lubang distribusi 40%→73%. |
| **Status izin** | **✅ DISETUJUI team-lead 22 Okt 2026** — di luar daftar izin brief §5, tapi batas itu dilonggarkan khusus domain resmi Jepang (`mhlw.go.jp`, `ssw.go.jp`, `moj.go.jp`) dan Indonesia (`kp2mi.go.id`, `jdih.bp2mi.go.id`). Halaman diverifikasi langsung oleh team-lead (judul 地域別最低賃金の全国一覧, memuat 令和8年度). |

**Nilai tambahan yang belum ada di artikel:** tabel prefektur tujuan ASJ — Miyazaki ¥1.085 · Okayama ¥1.104 · Nagano ¥1.117 · Kagoshima ¥1.090 — adalah target snippet yang tidak dimiliki kompetitor mana pun (data disiapkan SEO优化师 di laporan §5 Target 3). Ini sekaligus menjawab kelemahan GAP #1 butir 1 (angka per prefektur hanya kualitatif).

### Tambahan #2 (DIREKOMENDASIKAN): `/#penempatan` — tapi di H2 Bidang, bukan H2 Gaji

**Revisi dari rekomendasi awal saya.** Semula saya usulkan `/#penempatan` di H2 Gaji untuk menutup gurun tautan. Dengan MHLW tersedia, H2 Gaji sudah mendapat sumber yang jauh lebih tepat (data, bukan daftar penempatan). Menaruh keduanya di satu H3 akan menumpuk dua tautan di titik yang sama.

| Item | Isi |
|---|---|
| **Target** | `/#penempatan` (id terverifikasi team-lead di `index.astro:406`; fallback `/`) |
| **Anchor** | "bidang dan prefektur tujuan penempatan ASJ" |
| **Posisi persis** | H2 "Bidang Pekerjaan yang Paling Banyak Dibuka untuk Pekerja Indonesia" → **akhir H3 "Bidang yang paling cocok untuk lulusan SMA/SMK tanpa pengalaman"**, setelah kalimat *"Bidang yang tidak cocok dengan kondisi fisikmu akan terasa sangat berat setelah enam bulan pertama."* |
| **Alasan** | Konteksnya lebih jujur di sini: H2 Bidang membahas **bidang**, dan beranda mencantumkan **bidang + prefektur berpasangan** (Pengolahan Makanan — Miyazaki, Okayama; Pertanian — Miyazaki, Nagano; Peternakan — Kagoshima). Menautkannya dari H2 Gaji memaksa prefektur masuk ke pembahasan upah; menautkannya dari H2 Bidang mengikuti alur pembaca ("bidang apa → di mana"). Sekaligus mengisi H2 Bidang yang kini **nol tautan internal** (330 kata). |

*Mitigasi risiko "terasa jualan":* satu tautan saja, tanpa kata ajakan ("daftar", "hubungi", "sekarang"), ditaruh di akhir H3 informasional — bukan di akhir H2.

### Tambahan #3 (TIDAK DIREKOMENDASIKAN): `/loker` ketiga di H2 Gaji

Terlihat menarik (mengubah "tahu gaji" → "lihat lowongan"), tapi saya tolak: `/loker` sedang **menampilkan tabel kosong**. Menambah tautan ketiga ke halaman yang tidak punya lowongan berarti memperbesar jumlah pembaca yang kecewa. Tautan konversi tidak boleh ditambah sebelum datanya ada. Bila nanti `/loker` sudah terisi dan ter-prerender, tautan ini layak ditinjau ulang.

### Tambahan #4 (TIDAK DIREKOMENDASIKAN): `/siswa-baru` kedua di Checklist langkah 9

Langkah 9 (*"Mulai kelas bahasa Jepang dengan target terukur"*) memang memetakan langsung ke `/siswa-baru`. Saya menolak karena dua alasan: (a) H2 Checklist sudah punya tautan konversi di langkah 12 (`/apply`), dan menambah satu lagi membuat H2 itu punya dua ajakan berdekatan; (b) `/siswa-baru` saat ini bahkan tidak terender sebagai formulir, melainkan layar "MEMUAT ASJ OS V7…". Menambah tautan ke sana sebelum halamannya beres adalah menambah risiko, bukan nilai.

> **Konvergensi dengan SEO优化师:** ia semula menyarankan `/siswa-baru` ditautkan 2× (mengikuti brief §4), lalu **menarik rekomendasinya sendiri** setelah melihat temuan layar-loading. Brief §4 ditulis sebelum kondisi halaman diketahui — jadi ini koreksi brief, bukan kelalaian penulis. Dua jalur audit independen sampai pada kesimpulan yang sama: **ganti anchor, jangan tambah tautan.**

**Ringkasan jumlah akhir:** 7 internal → **8 internal** (+1: `/#penempatan`), 2 eksternal → **5 eksternal** (+3: `ssw.go.jp/en/about/visa/`, `ssw.go.jp/en/about/step/`, `mhlw.go.jp`). Total 13 tautan untuk 4.160 kata (1 : 320 kata). Bila 沈略 ingin menekan ke ≤12, yang paling layak dilepas adalah `/#penempatan` — MHLW sudah menutup gurun H2 Gaji, sehingga tautan itu menjadi nilai tambah, bukan keharusan.

### Halaman yang sengaja TIDAK ditautkan

`/master` dan `/candidate` — rute aplikasi internal (master data, dashboard kandidat). Menautkannya dari artikel publik akan: membocorkan UI internal, membuat jalan buntu bagi pembaca, dan mengirim crawler ke halaman yang tak seharusnya diindeks. **Jangan.**

---

## 3. TAUTAN EKSTERNAL

### 3.1 Penilaian 2 tautan eksternal yang sudah ada

| # | Sumber | Anchor | H2 | Nilai | Penilaian |
|---|---|---|---|---|---|
| E1 | `https://www.kp2mi.go.id` | "situs resmi Kementerian Pelindungan Pekerja Migran Indonesia" | Apakah Kerja ke Jepang Aman dan Legal? | **Tinggi** | **PERTAHANKAN.** Otoritas tertinggi untuk klaim "cek izin lembaga" dan "kanal pengaduan". Anchor deskriptif, menyebut nama lembaga (bukan "klik di sini"). Tepat berada di H2 legalitas. |
| E2 | `https://jdih.bp2mi.go.id` | "situs JDIH Kementerian Pelindungan Pekerja Migran Indonesia" | Apakah Kerja ke Jepang Aman dan Legal? | **Tinggi** | **PERTAHANKAN.** Mendukung klaim dasar hukum UU No. 18/2017. Berpasangan wajar dengan E1 (regulasi ↔ kelembagaan), keduanya di kalimat yang sama. |

Keduanya sudah benar secara strategi. Yang kurang: **`rel` belum dijelaskan** dan **klaim angka lain di artikel tidak punya tautan sama sekali** (lihat §3.2).

### 3.2 Tautan eksternal tambahan

Dua yang pertama bukan penambahan konsep baru — ini **mengubah sitasi tekstual yang sudah ada di draf menjadi tautan yang bisa diklik.** Draf sudah mencantumkan "(ssw.go.jp/en/about/visa/)" dan "(ssw.go.jp/en/about/step/)" dalam huruf miring di caption tabel, tapi **tidak menautkannya**. Untuk artikel yang seluruh posisinya adalah "kami sebut sumbernya", sitasi yang tidak bisa diklik adalah kelemahan E-E-A-T yang paling mudah diperbaiki.

> **Konvergensi audit:** SEO优化师 menemukan cacat yang sama lewat jalur berbeda (audit sitasi vs audit tautan). Dua jalur independen menunjuk satu cacat → **naikkan prioritas perbaikan ini**, dan ini menjelaskan mengapa sub-skor bukti/sitasi (72) adalah yang terendah kedua.

| # | Sumber | Letak (H2) | Teks anchor | Alasan |
|---|---|---|---|---|
| E3 | `https://www.ssw.go.jp/en/about/visa/` | H2 "Tiga Jalur Resmi Kerja ke Jepang" → **caption tabel perbandingan** (baris *Sumber: ISA — What Is the "Specified Skilled Worker" Status of Residence…*) | **"halaman resmi ISA tentang status Specified Skilled Worker"** | Menautkan klaim inti pillar: masa tinggal 5 tahun, tanpa keluarga, gaji setara pekerja Jepang, 19 bidang. Ini juga tabel kandidat featured snippet — sumber yang bisa diklik menambah kredibilitas tepat di titik yang direbut. Anchor berbahasa Indonesia agar terbaca pembaca Indonesia; nama dokumen asli tetap ada di teks sekitarnya. |
| E4 | `https://www.ssw.go.jp/en/about/step/` | H2 "Berapa Lama Proses Kerja ke Jepang?" → **caption tabel timeline** (baris *Estimasi COE 1–3 bulan bersumber dari ISA — Steps to Working in Japan*) | **"ISA — Steps to Working in Japan"** | Menautkan satu-satunya angka durasi berotoritas di artikel (COE 1–3 bulan). Di sini nama dokumen dalam bahasa Inggris justru tepat karena pembaca yang ingin memverifikasi akan mencari dokumen itu. |
| E5 | `https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/index.html` | H2 "Berapa Gaji Kerja di Jepang?" → H3 "Upah minimum Jepang 2026" | **"daftar upah minimum per prefektur (MHLW)"** | Sumber **primer** untuk angka yang menjadi fondasi seluruh H2 Gaji, plus rentang per prefektur & tanggal berlaku bertahap. **✅ DISETUJUI team-lead 22 Okt 2026** — halaman diverifikasi (judul 地域別最低賃金の全国一覧, memuat 令和8年度). **Prasyarat: angka ¥1.176 harus sudah dikoreksi ke ¥1.177 lebih dulu** (lihat §6 GAP #2). |

> **Perluasan aturan izin URL (keputusan team-lead, 22 Okt 2026).** Batas "hanya daftar izin brief §5" dilonggarkan **khusus untuk domain resmi**: `mhlw.go.jp`, `ssw.go.jp`, `moj.go.jp` (Jepang) dan `kp2mi.go.id`, `jdih.bp2mi.go.id` (Indonesia). Di luar itu tetap dilarang — khususnya pesaing, LPK/SO lain, dan portal lowongan komersial. Aturan ini berlaku untuk seluruh artikel klaster berikutnya.

**Bila E5 ditolak karena alasan kepatuhan:** jangan gantikan dengan tautan ke `mhlw.go.jp` root. Anchor-nya menjanjikan "daftar upah minimum per prefektur", dan halaman root tidak menampilkan daftar itu — itu **jenis kesalahan yang sama dengan tautan `/public` kosong** yang justru menjadi temuan utama laporan ini. Lebih baik **lepas E5 sepenuhnya** dan biarkan H2 Gaji tanpa tautan; artikel tetap berfungsi dengan 4 tautan eksternal. Konsistensi prinsip lebih penting daripada jumlah tautan.

#### ⚠️ Kontradiksi internal `ssw.go.jp` yang harus ditangani bersamaan

Menautkan E3 **dan** E4 sekaligus akan membuat pembaca bisa menemukan kontradiksi yang draf sekarang kaburkan:

- `/en/about/visa/` (E3) menyebut **19 bidang**
- `/en/about/step/` (E4) menyebut **16 industrial fields**

Draf menulis *"Sebagian materi resmi lain masih menyebut 16 bidang"* — frasa "materi resmi lain" menyiratkan **lembaga lain**, padahal itu halaman ISA sendiri. Itu atribusi yang tumpul, dan begitu kedua tautan terpasang, pembaca bisa memeriksanya dan mendapati penjelasan artikel tidak akurat.

**Rumusan yang benar (dan justru menaikkan kredibilitas):** sebut bahwa **keduanya resmi dan keduanya ISA**, lalu jelaskan selisihnya sebagai pembaruan bertahap — halaman bidang sudah diperbarui ke 19, halaman alur masih 16. Artikel yang berani menyebut kontradiksi sumber resmi dan menjelaskannya jauh lebih dipercaya daripada artikel yang menyembunyikannya. Ini juga sejalan dengan posisi "kami sebut yang tidak enak didengar".

**Tidak disarankan:** tautan kedua ke `/en/about/visa/` di H2 "Bidang Pekerjaan" (untuk klaim 19 bidang & penutupan Food Service). URL-nya sudah dipakai di E3; duplikasi URL yang sama dua kali dalam satu artikel tidak sepadan manfaatnya. Caption di H2 itu **biarkan sebagai sitasi teks** — cukup, karena sumbernya sudah tertaut di paragraf sebelumnya.

### 3.3 Atribut `rel` yang tepat — dan kapan perlu apa

| Jenis tautan | Atribut | Alasan |
|---|---|---|
| **Internal** (`/`, `/loker`, `/apply`, `/siswa-baru`, `/ai-cv`) | **tidak perlu `rel` apa pun**, tanpa `target="_blank"` | Navigasi internal sebaiknya tetap di tab yang sama. `target="_blank"` pada tautan internal mengganggu alur dan memutus rantai "kembali". |
| **Eksternal otoritatif** (`ssw.go.jp`, `mhlw.go.jp`, `kp2mi.go.id`, `jdih.bp2mi.go.id`) | `target="_blank"` + **`rel="noopener"` saja** — **tanpa `noreferrer`** | **`noopener` wajib** setiap kali memakai `target="_blank"`: mencegah halaman tujuan mengakses `window.opener` (celah *reverse tabnabbing*) dan menghindari biaya proses tambahan. **`noreferrer` sebaiknya tidak dipakai**: ia menghapus header `Referer` pada request keluar, sehingga sumber tidak melihat rujukan masuk dari ASJ — merugikan hubungan baik tanpa manfaat apa pun. *(Klaim bahwa sebagian situs pemerintah Jepang menolak request tanpa `Referer` sempat diajukan sebagai alasan tambahan, lalu **ditarik sendiri oleh SEO优化师** karena tidak diuji. Saya tidak memasukkannya — alasan `Referer` di atas sudah cukup untuk kesimpulan yang sama.)* |
| **Eksternal otoritatif — `nofollow`?** | **JANGAN pakai `nofollow`** | `nofollow` dipakai untuk tautan yang **tidak ingin kamu dukung** (berbayar/`sponsored`, UGC, atau sumber yang tidak bisa dipertanggungjawabkan). Memberi `nofollow` pada situs pemerintah justru **membuang sinyal kepercayaan** yang menjadi alasan tautan itu dipasang. Semenjak 2019 Google juga memperlakukan `nofollow` sebagai *hint*, bukan instruksi — jadi kerugiannya nyata, manfaatnya nol. |
| **Kapan `nofollow`/`sponsored` justru wajib** | Bila kelak ada tautan berbayar, tautan afiliasi, atau tautan ke mitra komersial | Ini tidak berlaku untuk artikel ini. Catat sebagai aturan untuk artikel klaster berikutnya. |

**Kesimpulan `rel`:** cukup `rel="noopener"` pada **5** tautan eksternal. Nol `nofollow`, nol `noreferrer`. Nol `rel` pada 8 tautan internal.

---

## 4. PETA KLASTER TOPIK

### 4.1 Masalah yang harus diselesaikan lebih dulu

Brief §1.1 dan §1.3 **menyisihkan** tiga kata kunci untuk artikel pendukung: `syarat kerja ke Jepang`, `gaji kerja di Jepang`, `lowongan kerja Jepang`. Tapi draf sudah mengangkat **dua di antaranya menjadi H2 pillar**:

- `syarat kerja ke Jepang` → H2-4 **"Syarat Kerja ke Jepang 2026"**
- `gaji kerja di Jepang` → H2-6 **"Berapa Gaji Kerja di Jepang? Angka dan Simulasinya"**

Artinya, kalau artikel pendukung ditulis dengan kata kunci itu sebagai fokus, **kanibalisasi sudah pasti terjadi** — dua halaman menargetkan kueri yang sama, dan pillar (lebih kuat, lebih dalam) akan memakan pendukungnya sendiri. Karena aturan yang berlaku adalah *"kata kunci yang sudah jadi H2 di pillar tidak boleh jadi fokus artikel pendukung"*, **H2 pillar dipertahankan** (melepasnya akan merusak kelengkapan pillar) dan **artikel pendukung diformulasikan ulang ke long-tail yang lebih sempit**, dengan intent berbeda.

### 4.2 Tabel keputusan: kandidat brief → status → formulasi final

| Kandidat brief §1.3 | Status terhadap draf | Keputusan |
|---|---|---|
| `syarat kerja ke Jepang` | **BENTROK** — sudah jadi H2-4 | Jangan jadikan fokus artikel. Bila klien tetap ingin artikel "syarat", pillar H2-4 harus diringkas jadi ringkasan + tautan keluar **lebih dulu**. Opsi sempit yang aman: "syarat fisik & kesehatan kerja ke Jepang" (tato, tindik, buta warna, tinggi badan, MCU) — di pillar ini baru level **H3**, jadi boleh didalami |
| `gaji kerja di Jepang` | **BENTROK** — sudah jadi H2-6 | Diformulasikan ulang ke **"potongan gaji & take-home"** (lihat S2) |
| `lowongan kerja Jepang` | **Milik halaman `/loker`**, bukan artikel | **Jangan pernah** menulis artikel dengan fokus ini. `/loker` adalah node fungsional klaster, bukan pesaing konten |

### 4.3 Arsitektur klaster (hub + 3 pendukung)

```
                    ┌─────────────────────────────────────────────┐
                    │  HUB / PILLAR                               │
                    │  /blog/panduan-kerja-ke-jepang-2026         │
                    │  "kerja ke Jepang" · 4.160 kata             │
                    └───┬──────────┬──────────┬───────────┬──────┘
                        │          │          │           │
        ┌───────────────┘          │          │           └──────────────┐
        ▼                          ▼          ▼                          ▼
  ┌───────────┐            ┌────────────┐ ┌────────────┐        ┌──────────────┐
  │ S1        │            │ S2         │ │ S3         │        │ NODE FUNGSI  │
  │ "cara     │            │ "potongan  │ │ "kerja ke  │        │ /loker       │
  │ daftar"   │            │ gaji"      │ │ Jepang     │        │ (bukan       │
  │ Transact. │            │ Info-deep  │ │ tanpa biaya"│       │  artikel)    │
  └─────┬─────┘            └─────┬──────┘ │ Comm.inv.  │        └──────┬───────┘
        │                        │        └─────┬──────┘               │
        └────────────────────────┴──────────────┴──────────────────────┘
                     semua pendukung WAJIB menautkan balik ke HUB
```

### 4.4 Detail tiga artikel pendukung

#### S1 — "Cara Daftar Kerja ke Jepang 2026: Alur Pendaftaran, Dokumen, dan Formulir"

| Item | Isi |
|---|---|
| **Kata kunci target** | primer: `cara daftar kerja ke Jepang`; sekunder: `pendaftaran kerja ke Jepang`, `dokumen yang harus disiapkan kerja ke Jepang`, `formulir lamaran kerja Jepang` |
| **Intent** | **Transactional** (long-tail #11 brief, prioritas ⭐⭐⭐) |
| **Sudut** | Prosedur operasional langkah demi langkah: apa yang diisi, dokumen apa yang di-scan, urutan tanda tangan, apa yang terjadi setelah formulir dikirim. |
| **Arah tautan** | **Pillar → S1:** dari H2 "Langkah Mulai dari Nol — Checklist 30 Hari Pertama", anchor *"cara daftar kerja ke Jepang langkah demi langkah"*. **S1 → Pillar:** di paragraf pembuka, anchor *"panduan kerja ke Jepang 2026"*; plus satu tautan ke H2 Biaya pillar, anchor *"rincian biaya kerja ke Jepang"*. **S1 → konversi:** `/siswa-baru`, `/apply`. |
| **Anti-kanibalisasi** | Pillar H2 Checklist = **persiapan 30 hari** (informational, niat: menyiapkan diri). S1 = **prosedur pendaftaran** (transactional, niat: mengeksekusi). S1 **dilarang** menargetkan `syarat kerja ke Jepang` dan **dilarang** memuat tabel biaya lengkap — cukup tautan ke pillar. |

#### S2 — "Potongan Gaji Kerja di Jepang: Pajak, Asuransi Sosial, dan Take-Home"

| Item | Isi |
|---|---|
| **Kata kunci target** | primer: `potongan gaji kerja di Jepang`; sekunder: `gaji bersih kerja di Jepang`, `shakai hoken pekerja asing`, `cara baca slip gaji Jepang` (kyuyo meisai) |
| **Intent** | **Informational (mendalam)** |
| **Sudut** | Mekanisme tiap potongan: jenis pajak, komponen shakai hoken, cara membaca slip gaji, kesalahan hitung yang umum. Bukan simulasi — pillar sudah punya simulasinya. |
| **Arah tautan** | **Pillar → S2:** dari H3 "Potongan yang menggerus gaji: pajak, asuransi sosial, asrama", anchor *"rincian potongan pajak dan asuransi sosial"*. **S2 → Pillar:** anchor *"simulasi gaji kerja di Jepang 2026"* (menautkan balik ke tabel 3 skenario — ini tautan yang saling menguatkan, bukan duplikat). **S2 → `/loker`:** dari bagian "gaji berbeda per prefektur". |
| **Anti-kanibalisasi** | Pillar H2 Gaji = **angka + simulasi 3 skenario** (overview, 620 kata). S2 = **anatomi potongan** (deep, 1.200+ kata). S2 **dilarang** menargetkan `gaji kerja di Jepang` polos dan **dilarang** menduplikasi tabel simulasi. |

#### S3 — "Kerja ke Jepang Tanpa Biaya: Apa Maksudnya dan Siapa yang Menanggung"

| Item | Isi |
|---|---|
| **Kata kunci target** | primer: `kerja ke Jepang tanpa biaya`; sekunder: `cara kerja ke Jepang tanpa biaya`, `biaya kerja ke Jepang ditanggung pemberi kerja`, `dana talang kerja ke Jepang` |
| **Intent** | **Commercial investigation** (long-tail #5 brief, prioritas ⭐⭐⭐ — volume tinggi, sensitivitas tinggi) |
| **Sudut** | Model pembiayaan: ditanggung pemberi kerja vs ditalangi vs dicicil; mekanika dana talang **beserta risikonya**; klausul kontrak yang harus dibaca; konsekuensi bila berhenti di tengah jalan. |
| **Arah tautan** | **Pillar → S3:** dari H3 "Kenapa 'kerja ke Jepang tanpa biaya' itu menyesatkan", anchor *"kerja ke Jepang tanpa biaya: apa yang sebenarnya ditanggung"*. **S3 → Pillar:** anchor *"panduan kerja ke Jepang 2026"* + tautan ke H3 "Biaya yang TIDAK boleh kamu bayar". **S3 → `/loker`**, **S3 → `/siswa-baru`**. |
| **Anti-kanibalisasi** | Di pillar, topik ini baru level **H3** (bukan H2) → boleh didalami. Pillar menjawab "tidak ada yang benar-benar Rp 0" dalam 3 paragraf; S3 menjawab "lalu siapa yang menanggung, dan apa risikonya" dalam artikel penuh. S3 **dilarang** menargetkan `biaya kerja ke Jepang` polos (itu milik pillar H2 Biaya). |

### 4.5 Konektivitas: yang sudah ada vs yang hilang

| Koneksi | Status | Tindakan |
|---|---|---|
| Pillar → `/loker` | ✅ ada (2×) | Pertahankan; variasikan anchor |
| Pillar → `/apply`, `/siswa-baru`, `/ai-cv` | ✅ ada | Pertahankan |
| Pillar → `/` | ✅ ada (1×) | Pertahankan; +1 ke `/#penempatan` (dari H2 Bidang) |
| Pillar → `/#program` | ❌ belum | **Tambahkan** (ganti `/public`) |
| Pillar → `ssw.go.jp/visa`, `ssw.go.jp/step` | ❌ belum (hanya sitasi teks) | **Tambahkan** (E3, E4) |
| Pillar → `mhlw.go.jp` | ❌ belum | **Tambahkan** (E5) — setelah ¥1.177 dikoreksi |
| Pillar → S1/S2/S3 | ❌ belum (artikel belum ada) | **Fase 2:** sisipkan setelah tiap pendukung terbit |
| S1/S2/S3 → Pillar | ❌ belum | **Wajib** di paragraf pembuka tiap pendukung |
| S1 ↔ S3 (sama-sama soal biaya/pendaftaran) | ❌ belum | Boleh silang tautan setelah keduanya terbit |
| `/loker` → Pillar | ❌ tidak mungkin (CSR, tanpa konten) | Perbaiki di sisi situs (§6 butir 1) |

---

## 5. SKOR KESEHATAN KONTEN

### 5.1 Sub-skor dan aritmetika

| Dimensi | Bobot | Skor | Kontribusi | Dasar penilaian |
|---|---|---|---|---|
| Kedalaman topik | 25% | **94** | 23,50 | 4.160 kata vs target 3.000–3.500; seluruh H2 brief terpenuhi + 2 H2 tambahan ("Apa yang Berubah di 2026", "Bidang Pekerjaan"); 5 tabel, 3 checklist, TL;DR |
| Struktur & scannability | 20% | **92** | 18,40 | 14 H2, 40+ H3, paragraf pendek, penebalan selektif. Potongan 3 poin: beberapa H3 terlalu panjang (mis. H3 bidang kerja = 93 karakter) |
| Kekuatan bukti/sitasi | 15% | **65** | 9,75 | Angka punya sumber + tanggal secara **tekstual** ("Menurut ISA", "keputusan Dewan Upah Minimum Pusat, Juli 2026"), tapi **hanya 2 tautan eksternal** dan caption tabel menyebut domain **tanpa menautkannya**. Klaim "19 bidang", "COE 1–3 bulan", "¥1.176" semuanya tanpa tautan yang bisa diklik. **Dua cacat akurasi terkonfirmasi:** (a) ¥1.176 seharusnya ¥1.177 — angka pokok salah dan seluruh tabel turunannya tidak bisa direproduksi; (b) "materi resmi lain menyebut 16 bidang" — padahal itu halaman ISA sendiri |
| Kesiapan konversi | 15% | **78** | 11,70 | 5 tautan berorientasi konversi (`/loker` 2×, `/siswa-baru`, `/apply`, `/ai-cv`), bahasa CTA tanpa janji hasil. Potongan: 4 dari 5 tujuan adalah shell CSR yang tidak bisa menjelaskan diri; H2 Gaji (niat komersial tertinggi) tanpa jalan keluar |
| Arsitektur tautan | 15% | **68** | 10,20 | **Kuat:** 7/7 patuh maks-1-per-H2, 6 dari 7 anchor deskriptif, nol "klik di sini". **Lemah:** 1 tautan ke halaman kosong dengan janji palsu (`/public`), 2 tautan menjanjikan "lowongan yang dibuka" ke tabel kosong, anchor `/loker` duplikat persis, gurun tautan ±1.300 kata (40%→73%), 0 sitasi bertaut |
| Kesiapan snippet | 10% | **88** | 8,80 | Kotak TL;DR, jawaban langsung di kalimat pertama tiap H2, 3 tabel kandidat snippet (perbandingan jalur, komponen biaya, gaji), FAQ 8 pertanyaan + schema `FAQPage` dideklarasikan. Potongan: H2 Biaya dibuka dengan kalimat abstrak, bukan jawaban |
| **TOTAL** | **100%** | | **82,35** | **Skor: 82/100** |

Aritmetika: 94×0,25 = 23,50 · 92×0,20 = 18,40 · 65×0,15 = 9,75 · 78×0,15 = 11,70 · 68×0,15 = 10,20 · 88×0,10 = 8,80 → **82,35**

### 5.2 Proyeksi setelah perbaikan

| Dimensi | Bobot | Sekarang | Setelah | Pemicu kenaikan |
|---|---|---|---|---|
| Kedalaman topik | 25% | 94 | **94** | (tidak berubah) |
| Struktur & scannability | 20% | 92 | **92** | (tidak berubah) |
| Kekuatan bukti/sitasi | 15% | 65 | **88** | +3 tautan eksternal (`ssw.go.jp/visa`, `ssw.go.jp/step`, `mhlw.go.jp`); sitasi caption jadi bisa diklik; ¥1.177 terkoreksi & bisa direproduksi pembaca |
| Kesiapan konversi | 15% | 78 | **86** | `/#program` menggantikan `/public` kosong; `/#penempatan` di H2 Bidang |
| Arsitektur tautan | 15% | 68 | **88** | Janji-palsu dihapus, anchor divariasikan, gurun tautan ditutup, 1 : 320 kata |
| Kesiapan snippet | 10% | 88 | **90** | (dampak tidak langsung) |
| **TOTAL** | | **82,35** | **90,20** | **Proyeksi: 90/100** |

Aritmetika proyeksi: 94×0,25 = 23,50 · 92×0,20 = 18,40 · 88×0,15 = 13,20 · 86×0,15 = 12,90 · 88×0,15 = 13,20 · 90×0,10 = 9,00 → **90,20**

**Bottleneck utama skor ini adalah dimensi arsitektur tautan (68), dan penyebabnya bukan penempatan anchor — melainkan 5 dari 6 halaman tujuan yang tidak punya konten.** Tidak ada perbaikan anchor yang bisa menutupi itu. Skor 90 hanya tercapai bila situs diperbaiki (§10 butir C).

### 5.3 Rekonsiliasi skor: 83 → 82

Audit awal memberi **83** karena menilai bukti/sitasi **72** — pada saat itu koreksi ¥1.177 masih berstatus laporan pihak lain dan belum saya masukkan sebagai potongan. Setelah team-lead memverifikasinya langsung, potongan itu berlaku dan skor yang mengikat adalah **82**.

| Temuan | Status | Dampak |
|---|---|---|
| ¥1.176 → **¥1.177** | **TERVERIFIKASI** team-lead dari PDF MHLW `mhlw.go.jp/content/11200000/001753404.pdf` (baris 全国加重平均: 1.177, sebelumnya 1.121, +56 / +5,0%) | Angka pokok salah; seluruh tabel simulasi + konversi rupiah tidak bisa direproduksi pembaca → bukti/sitasi **72 → 65** |
| "materi resmi lain menyebut 16 bidang" padahal itu **halaman ISA sendiri** (`/en/about/step/`) | **TERVERIFIKASI** — kontradiksi internal `ssw.go.jp` (`/visa/` = 19, `/step/` = 16) | Atribusi menyesatkan (kata "lain" menyiratkan lembaga lain) → potongan tambahan, termasuk dalam 65 |

**Aritmetika:** bukti/sitasi 72 → 65 berarti 10,80 → 9,75 (−1,05) → **83,40 − 1,05 = 82,35 → 82/100**.
**Proyeksi setelah perbaikan tetap 90/100** — koreksi angka + E5 justru mengembalikan kemampuan pembaca memverifikasi.

> **Kualifikasi status ¥1.177 — jangan ditulis tanpa ini.** Angka itu adalah **全国加重平均 atas 答申された改定額** (rata-rata tertimbang dari jumlah hasil rekomendasi dewan upah prefektur), dengan penerapan bergeser **1 Okt – 2 Des 2026**. Jadi yang benar: *"resmi untuk tahun fiskal 2026"* ✓ — tapi *"sudah berlaku di semua prefektur per 22 Oktober 2026"* ✗. Draf sendiri sudah aman karena menulis "penerapannya bertahap"; yang perlu dijaga adalah jangan sampai kalimat penjelas baru menghapus nuansa itu. Kolom **"Berlaku"** pada tabel prefektur di atas memang sudah memuat tanggal bertahapnya (2 Okt / 24 Okt / 25 Okt), jadi nuansa itu terjaga selama tabelnya dipertahankan.

**Angka prefektur — terverifikasi, dan ini mengubah isi artikel (bukan hanya tautan).**

Team-lead mengekstrak langsung PDF *令和8年度 地域別最低賃金 全国一覧*:

| Prefektur tujuan ASJ | 2026 | Sebelumnya | Naik | Berlaku |
|---|---|---|---|---|
| 宮崎 Miyazaki | **1.085** | 1.023 | +62 (6,1%) | 24 Okt 2026 |
| 鹿児島 Kagoshima | **1.090** | 1.026 | +64 (6,2%) | 25 Okt 2026 |
| 岡山 Okayama | **1.104** | 1.047 | +57 (5,4%) | 2 Okt 2026 |
| 長野 Nagano | **1.117** | 1.061 | +56 (5,3%) | 2 Okt 2026 |
| **全国加重平均** | **1.177** | 1.121 | +56 (5,0%) | — |

**Konsekuensi untuk artikel:** gaji kotor di prefektur tujuan ASJ = **¥187.705–193.241** (1.085 × 173 s.d. 1.117 × 173), yaitu **5–8% di bawah** simulasi berbasis rata-rata nasional ¥203.621. Kedua angka benar dan keduanya harus muncul — bukan saling menggantikan:

- **¥203.621** = simulasi berbasis rata-rata nasional (tabel 3 skenario) — tetap dipakai, karena itu cara membaca upah menurut data resmi
- **¥187.705–193.241** = kenyataan di prefektur tempat ASJ menempatkan orang — ini yang lebih relevan bagi pembaca

Tanpa keduanya, pembaca yang ditempatkan di Miyazaki akan mengira artikelnya salah hitung. Ini justru penguatan posisi merek: angka prefektur yang lebih rendah adalah **berita tidak enak**, dan artikel yang menyebutkannya lebih dipercaya daripada yang hanya menyajikan rata-rata nasional yang tampak menguntungkan.

*Catatan: team-lead sudah meneruskan instruksi ini ke 内容编辑. Kalimat penjelas siap pakai ada di laporan SEO优化师 §5 Target 3.*

**Skor tidak dinaikkan maupun diturunkan secara arbitrer:** 83 adalah audit awal, 82 adalah angka yang berlaku setelah koreksi terkonfirmasi. Selisihnya −1,05 dari satu sub-skor, bukan penyesuaian diskresioner.

---

## 6. ANALISIS CELAH KOMPETITOR — VERIFIKASI TERHADAP DRAF

Ketiga celah dari brief §2.3 saya periksa satu per satu terhadap draf, bukan terhadap niat penulisnya.

### GAP #1 — Transparansi biaya → **TERTUTUP, dengan 2 catatan**

**H2 yang menutup:** "Berapa Biaya Kerja ke Jepang? Ini Rinciannya"
- H3 "Komponen biaya yang wajar" → tabel 9 baris (pelatihan, asrama, seragam/modul, ujian, MCU, paspor, visa, tiket, biaya jasa) dengan kolom "Ditanggung siapa" ✅
- H3 "Biaya yang TIDAK boleh kamu bayar" → 4 pola (rekening pribadi, biaya di luar kontrak, "jaminan kelulusan", tanpa kuitansi) ✅
- H3 "Kenapa 'kerja ke Jepang tanpa biaya' itu menyesatkan" → membedakan ditanggung vs ditalangi ✅
- H3 "Cara menyiasati biaya tanpa jebakan utang" → cicilan, dana talang, hindari pinjaman konsumtif ✅

**Yang kurang:**
1. **Tidak ada rentang rupiah per komponen.** Brief meminta "beri rentang (mis. Rp X–Y juta)"; draf hanya memberi kolom kualitatif "Kecil / Sedang / Besar". Hanya **satu** angka konkret di seluruh bagian: Rp 6.000.000 (program ASJ). Transparan secara prinsip, tapi belum sedetail yang dijanjikan posisi "kami sebut angkanya".
2. **Dasar regulasi klaim "tidak boleh dibayar" tidak disebut nomornya.** Draf hanya menulis *"rujuk situs resmi Kementerian"*. Brief sendiri menandai ini **[PERLU VERIFIKASI REGULASI]** — masih terbuka.

**Mekanisme pembayaran sudah tercakup, dan itu sudah benar.** Draf menyebut "bisa dicicil" (Rp 6.000.000) serta H3 "Cara menyiasati biaya tanpa jebakan utang" yang membahas dana talang dan risiko cicilan. Ini sesuai `profile.prog_payment` ("Bisa dicicil, dan tersedia dana talang untuk biaya keberangkatan") dan `landing.class_dana_desc`. **Tidak ada yang perlu ditambahkan di sini.**

> **Catatan situs (bukan celah artikel — untuk 沈略).** Beranda memang menampilkan blok "Rincian Biaya" berisi **"Keberangkatan: 15-25 Jt"** (TG/SSW) dan **"45-50 Jt"** (Magang) di `src/components/public/LayananSection.astro` baris 67 & 74, dirender lewat `src/pages/index.astro` baris 224. **Angka itu nyata dan bisa diverifikasi, tapi tidak boleh dipindahkan ke artikel:** keduanya string tampilan hardcoded di atribut `data-lang` (`public.layanan_tg_desc`, `public.layanan_magang_desc`), bukan tarif resmi berlandaskan regulasi, dan **tanpa tanggal maupun atribusi** — melanggar syarat brief §8.5 ("setiap angka wajib punya sumber + tanggal"). Menuliskannya di artikel akan mengubah artikel ilustratif menjadi **komitmen harga** yang cepat kedaluwarsa — persis jebakan yang brief §8.6 peringatkan pada klaim "gaji 15–25 juta" di beranda. **Rekomendasi artikel: sebut mekanismenya tanpa nominal tambahan** (sudah dilakukan draf). Rekomendasi situs: angka hardcoded ini perlu sumber & tanggal, atau diturunkan menjadi "mulai dari" agar tidak terbaca sebagai janji.

### GAP #2 — Angka gaji terverifikasi → **TERTUTUP, dengan 1 koreksi angka wajib**

**H2 yang menutup:** "Berapa Gaji Kerja di Jepang? Angka dan Simulasinya"
- H3 "Upah minimum Jepang 2026" → ¥1.176/jam, naik dari ¥1.121, sumber + tanggal (Dewan Upah Minimum Pusat, Juli 2026) ⚠️ **angka perlu koreksi — lihat di bawah**
- H3 "Simulasi gaji kotor per bulan" → rumus terbuka (¥1.176 × 173 = ¥203.448) ✅ *(struktur benar, angka ikut koreksi)*
- H3 "Potongan yang menggerus gaji" → pajak, shakai hoken, asrama ✅
- H3 "Tabel gaji + simulasi take-home: 3 skenario lembur" → tabel 3 kolom (0/10/20 jam), kotor → potongan → take-home ✅
- H3 "Konversi ke rupiah" → kurs ¥1 ≈ Rp 113 (Oktober 2026) + peringatan kurs berubah ✅
- H3 "Biaya hidup di Jepang" → tiga faktor penentu, "hitung sisa, bukan gaji" ✅

**⚠️ KOREKSI ANGKA — ¥1.176 seharusnya ¥1.177. STATUS: TERVERIFIKASI.**
Team-lead mengekstrak langsung PDF resmi MHLW *令和8年度 地域別最低賃金 全国一覧* (`mhlw.go.jp/content/11200000/001753404.pdf`): baris 全国加重平均 = **1.177** (sebelumnya 1.121, +56 / +5,0%). Brief §3 sendiri sudah menandai angka ini **[TERVERIFIKASI — perlu konfirmasi angka final]**, jadi ini konfirmasi yang diminta brief — bukan temuan baru yang menyimpang dari rencana.

**Kenapa ini bukan salah ketik sepele di artikel yang memposisikan diri "angka yang bisa diverifikasi":**
1. **Efek berantai ke seluruh tabel.** ¥1.177 × 173 = **¥203.621** (bukan ¥203.448) — selisih ¥173 pada gaji kotor. Tarif lembur +25% menjadi **¥1.471** (eksak ¥1.471,25 — lihat konvensi pembulatan di bawah). Semua angka take-home (¥147.931 / ¥160.426 / ¥172.921) dan konversi rupiah (Rp 16,7 / 18,1 / 19,5 juta) **harus dihitung ulang**.

> **Konvensi pembulatan — disepakati dengan SEO优化师, agar 内容编辑 tidak menerima dua versi.** Pakai **¥1.471** (dibulatkan), bukan ¥1.471,25. Alasannya: selisihnya hanya ¥2,50–5 pada angka ratusan ribu yen, sementara sel bertaburan desimal jauh lebih sulit dibaca. Yang **tidak boleh berbeda** antar-laporan adalah basis **¥1.177 × 173 = ¥203.621** — itu satu-satunya angka yang akan diverifikasi pembaca dengan kalkulatornya sendiri, dan justru itu inti argumen mengapa kesalahan ini bukan salah ketik sepele.
2. **Bisa direproduksi pembaca.** Artikel sengaja menampilkan rumus terbuka ("supaya kamu bisa menghitung dengan angkamu sendiri"). Pembaca yang mengalikan ¥1.177 × 173 akan mendapat angka berbeda dari tabel — pada artikel yang seluruh diferensiasinya adalah aritmetika transparan, itu kerusakan kredibilitas yang persis di titik jualnya.
3. **Menautkan MHLW sebelum koreksi = tautan membantah artikelnya sendiri.** Karena itu urutan kerja wajib: **koreksi angka → hitung ulang tabel → baru pasang E5.**

**⚠️ CELAH KEDUA DI H2 YANG SAMA — simulasi berbasis rata-rata nasional saja menyesatkan pembaca ASJ.**
Ini bukan sekadar soal koreksi ¥1: setelah prefektur diverifikasi, terlihat bahwa **tabel simulasi berbasis rata-rata nasional memberi angka yang terlalu tinggi** untuk prefektur tempat ASJ benar-benar menempatkan orang.

| Basis | Upah/jam | Gaji kotor (× 173) | Selisih vs rata-rata nasional |
|---|---|---|---|
| Rata-rata nasional tertimbang | ¥1.177 | **¥203.621** | — (acuan) |
| Nagano (tertinggi dari 4) | ¥1.117 | **¥193.241** | −5,1% |
| Okayama | ¥1.104 | **¥190.992** | −6,2% |
| Kagoshima | ¥1.090 | **¥188.570** | −7,4% |
| Miyazaki (terendah dari 4) | ¥1.085 | **¥187.705** | −7,8% |

**Konsekuensi:** H2 Gaji butuh **kedua angka**, bukan salah satu. ¥203.621 tetap dipakai sebagai simulasi resmi (itu cara membaca upah menurut data nasional), tapi harus disertai rentang kenyataan **¥187.705–193.241** untuk prefektur tujuan ASJ. Tanpa itu, pembaca yang ditempatkan di Miyazaki akan mengira artikelnya salah hitung — dan justru pembaca itulah audiens inti ASJ.

**Efek terhadap GAP #2:** klaim "angka gaji yang bisa diverifikasi" kini **lebih kuat**, bukan lebih lemah — karena artikel bisa menyajikan angka prefektur spesifik yang tidak dimiliki kompetitor mana pun. Tapi hanya jika keduanya muncul. Kalau hanya rata-rata nasional yang tampil, H2 ini justru menjadi *kurang* jujur daripada yang dijanjikan posisi merek.

*Catatan wewenang:* koreksi angka & penambahan rentang prefektur milik 内容编辑/内容撰稿人 (saya tidak mengedit draf). Team-lead sudah meneruskan instruksi ini ke 内容编辑.

**Yang kurang (kecil):** "173 jam/bulan" tidak diberi atribusi — sebaiknya ditandai sebagai asumsi standar, karena pembaca bisa menganggapnya angka resmi. Dan ¥1.176 belum bertaut (lihat E5).

### GAP #3 — Peta legalitas & anti-penipuan → **TERTUTUP PENUH (1 lubang kecil)**

**H2 yang menutup:** "Apakah Kerja ke Jepang Aman dan Legal?"
- H3 "Dasar hukumnya apa" → UU No. 18/2017, Kemen P2MI (eks BP2MI), catatan nomenklatur ganda ✅
- H3 "Cara cek agensi resmi sebelum membayar sepeser pun" → 6 langkah berurutan ✅
- H3 "7 tanda agensi yang perlu kamu curigai" → 7 butir, konkret ✅
- H3 "Peran LPK vs SO — dan di mana posisi ASJ" → **akurat dan berani**: menyatakan ASJ adalah LPK dan **belum berstatus SO**, penempatan dijalankan bersama mitra SO ✅ — dan ini **konsisten dengan beranda** yang menyatakan hal sama
- H3 "Kalau terjadi masalah, harus ke mana" → 3 jalur pengaduan ✅

**Yang kurang:** langkah verifikasi izin menyebut *"kanal resmi Kementerian Pelindungan Pekerja Migran Indonesia"* **tanpa nama portal atau URL**. Brief menandai ini **[PERLU VERIFIKASI]**. Inilah satu-satunya lubang yang tersisa — dan saya **tidak boleh mengarang URL**, jadi saya tidak mengusulkan satu pun. **Tindakan:** minta klien/team-lead menyediakan URL kanal verifikasi izin resmi; bila tidak tersedia, biarkan generik (lebih baik generik daripada salah).

### Bonus — dua celah lain dari brief

| Celah | Status | H2 yang menutup |
|---|---|---|
| GAP #4 Perbandingan jalur dalam satu halaman | ✅ **TERTUTUP** | H2 "Tiga Jalur Resmi…" + tabel 4 kolom × 6 baris |
| GAP #5 Konten ter-update 2026 | ✅ **TERTUTUP** | H2 "Apa yang Berubah di 2026" (4 perubahan konkret) + "Terakhir diperbarui: Oktober 2026" |

**Kesimpulan celah:** **3 dari 3 celah utama tertutup.** Tidak ada yang tertutup setengah jalan pada level H2. Yang tersisa hanya dua kekurangan kecil di dalam bagian yang sudah benar: (a) rentang rupiah per komponen tidak ada (masih kualitatif), (b) nomor regulasi & URL kanal verifikasi izin belum disebut. **Nominal biaya tidak perlu ditambahkan** — mekanisme cicilan & dana talang sudah tercakup, dan angka "keberangkatan" di beranda adalah string hardcoded tanpa sumber/tanggal yang tidak boleh dipindahkan ke artikel (lihat catatan di GAP #1).

---

## 7. DISTRIBUSI TAUTAN

### 7.1 Kondisi sekarang

```
Posisi artikel    0%────────33%────────66%────────100%
Tautan internal      │ 2       │ 1        │ 4 (+2 ekst) │
                     /loker    /public    / (legalitas)
                     /siswa    (KOSONG)   /ai-cv
                                │         /apply
                                │         /loker
                                ▼         │
                        gurun ±1.300 kata │
                        (H2 Gaji + H2 Timeline)
```
- Paruh pertama (0–33%): **2** tautan internal
- Paruh tengah (33–66%): **1** tautan internal — dan itu menuju halaman kosong
- Paruh akhir (66–100%): **4** tautan internal + **2** eksternal

### 7.2 Setelah perbaikan

| Zona | Tautan | Jumlah |
|---|---|---|
| 0–33% | `/loker` (27%), `/siswa-baru` (31%), `ssw/visa` (caption tabel, 27%) | 2 internal + 1 eksternal |
| 33–66% | `/#program` (40%), **MHLW** (50%), `ssw/step` (caption timeline, ~60%) | 1 internal + 2 eksternal |
| 66–100% | `/#penempatan` (~78%, H2 Bidang), `/` (73%), `kp2mi`+`jdih` (68%), `/ai-cv` (83%), `/apply` (88%), `/loker` (99%) | 5 internal + 2 eksternal |

Hasil: **2/1/5 internal + 1/2/2 eksternal** — tidak ada lagi zona tanpa tautan. Gurun ±1.300 kata (H2 Gaji + H2 Timeline) kini terisi MHLW + `ssw/step`, dan H2 Bidang yang semula nol tautan internal mendapat `/#penempatan`.

---

## 8. PETA PERJALANAN PEMBACA

```
MASUK: "kerja ke Jepang" / "biaya kerja ke Jepang lewat LPK"
   │
   ├─► "Apa pilihanku?" ............ H2 Tiga Jalur → [lowongan kerja Jepang yang sedang dibuka] → /loker
   │                                   (fungsi: melihat bidang nyata, bukan membaca teori)
   ├─► "Aku memenuhi syarat?" ...... H2 Syarat → [kelas bahasa Jepang dari dasar] → /siswa-baru
   │                                   (fungsi: hambatan terbesar = bahasa, langsung ada jalan)
   ├─► "Berapa biayanya?" .......... H2 Biaya → [rincian biaya program ASJ dan apa saja yang termasuk] → /#program
   │                                   (fungsi: MEMBUKTIKAN klaim transparansi — titik kepercayaan tertinggi)
   ├─► "Berapa yang kubawa pulang?"  H2 Gaji → [daftar upah minimum per prefektur (MHLW)] → mhlw.go.jp
   │                                   (fungsi: angka nasional jadi angka prefektur yang bisa diperiksa)
   ├─► "Di bidang apa, di mana?" .... H2 Bidang → [bidang dan prefektur tujuan penempatan ASJ] → /#penempatan
   │                                   (fungsi: menghubungkan bidang kerja dengan prefektur nyata)
   ├─► "Apakah ini aman?" .......... H2 Legalitas → [profil dan legalitas PT Amanah Sakura Japan] → /
   │                                   └──────────► [JDIH] + [Kemen P2MI] (verifikasi independen)
   │                                   (fungsi: pembaca memeriksa sendiri, bukan percaya kata kami)
   ├─► "Aku belum punya CV" ........ H2 Lulusan SMA/SMK → [buat CV bahasa Jepang dengan bantuan AI] → /ai-cv
   └─► "Aku siap mulai" ............ H2 Checklist → [formulir lamaran kerja] → /apply
                                    H2 Kesimpulan → [daftar lowongan kerja Jepang terbaru] → /loker
```

Tiga hal yang perlu dicatat dari peta ini:
1. **Urutan tautan sudah mengikuti alur psikologis artikel** (jalur → syarat → biaya → gaji → aman → mulai). Ini kekuatan nyata draf dan tidak perlu diubah.
2. **H2 Gaji dan H2 Timeline adalah satu-satunya titik tanpa jalan keluar** — pembaca yang paling siap bertindak (sudah tahu angka) justru tidak diberi langkah berikutnya. Diperbaiki lewat MHLW (H2 Gaji) dan `ssw/step` (H2 Timeline).
3. **Tautan tidak pernah muncul dua kali dalam satu H2** — konsisten di seluruh artikel.

---

## 9. PREDIKSI DAMPAK SEO

| Sasaran | Dampak | Dasar |
|---|---|---|
| **Artikel pillar** | **Sedang–tinggi** | Perbaikan terbesar bukan dari menambah tautan, tapi dari **menghapus janji palsu** (`/public`) dan **menautkan sitasi otoritatif**. Artikel yang mengklaim "kami sebut sumbernya" lalu mengirim pembaca ke halaman kosong kehilangan justru sinyal yang diperjuangkannya |
| **`/` (beranda)** | **Sedang** | Menerima 2–3 tautan beranchor kaya dari satu-satunya halaman yang berpotensi menjadi pintu masuk organik. `/` adalah node terkuat situs; memusatkan bobot ke sana adalah arsitektur yang benar ketika 5 halaman lain kosong |
| **`/loker`, `/apply`, `/siswa-baru`** | **Saat ini ≈ nol, terlepas dari berapa pun tautannya** | Tanpa teks terindeks, halaman tujuan tidak bisa menjelaskan dirinya ke mesin pencari maupun memanfaatkan anchor. **Nilai tautan internal ke halaman-halaman ini akan tetap nol sampai situs di-prerender.** Ini bukan masalah artikel |
| **Klaster (setelah S1–S3 terbit)** | **Tinggi** | Pillar 4.160 kata + 3 pendukung bersudut sempit = cakupan topik yang tidak dimiliki LPK mana pun (baseline kompetitor 600–1.500 kata, tanpa tabel). Tautan dua arah membuat pillar menjadi otoritas topik, bukan sekadar satu halaman panjang |
| **Peluang featured snippet** | **Tinggi, tidak terpengaruh tautan** | Ditentukan struktur (tabel + jawaban langsung), dan struktur draf sudah kuat |

*Semua perkiraan di atas bersifat kualitatif dan **[ESTIMASI]**. Saya tidak memiliki data volume pencarian, metrik otoritas domain, atau snapshot SERP, dan tidak akan mengarangnya.*

---

## 10. DAFTAR TINDAKAN

### A. Artikel (wewenang 内容编辑 / 内容撰稿人 — saya tidak mengedit draf)

- [ ] **Ganti tujuan tautan `/public` → `/#program`** (id terverifikasi di `index.astro:231`); anchor: "rincian biaya program ASJ dan apa saja yang termasuk" — *prioritas 1*
- [ ] Ubah anchor `/siswa-baru`: "pendaftaran siswa pelatihan bahasa Jepang" → **"kelas bahasa Jepang dari dasar"**
- [ ] Variasikan anchor `/loker` di H2 Kesimpulan → **"daftar lowongan kerja Jepang terbaru"**
- [ ] Poles anchor `/apply`: "form lamaran kerja" → **"formulir lamaran kerja"**
- [ ] **Tambah** tautan `/#penempatan` di **H2 Bidang Pekerjaan**, akhir H3 "Bidang yang paling cocok untuk lulusan SMA/SMK" (anchor: "bidang dan prefektur tujuan penempatan ASJ")
- [ ] **Tautkan** sitasi caption di H2 Tiga Jalur → `ssw.go.jp/en/about/visa/`
- [ ] **Tautkan** sitasi caption di H2 Timeline → `ssw.go.jp/en/about/step/`
- [ ] **Tambah** tautan MHLW di H3 "Upah minimum Jepang 2026" — ✅ disetujui team-lead; **tetap hanya setelah ¥1.177 dikoreksi** (anchor: "daftar upah minimum per prefektur (MHLW)")
- [ ] Tambahkan `target="_blank" rel="noopener"` pada **5** tautan eksternal; **tanpa `nofollow`**, **tanpa `noreferrer`**
- [ ] Pertahankan tanpa perubahan: `/loker` (H2 Tiga Jalur), `/` (H2 Legalitas), `/ai-cv`
- [ ] **Jangan** tautkan `/master` dan `/candidate`

### B. Konten (eskalasi ke team-lead / 内容编辑)

- [ ] **⚠️ Koreksi ¥1.176 → ¥1.177** — **status: TERVERIFIKASI** team-lead dari PDF MHLW `content/11200000/001753404.pdf` (全国加重平均: 1.177, sebelumnya 1.121, +56 / +5,0%). **Hitung ulang seluruh tabel simulasi:** gaji kotor **¥1.177 × 173 = ¥203.621**; tarif lembur +25% = **¥1.471** (dibulatkan, lihat §6 GAP #2); take-home & konversi rupiah ikut berubah — *prioritas 1, prasyarat tautan MHLW*
- [ ] **Tambahkan rentang gaji kotor berbasis prefektur tujuan ASJ: ¥187.705–193.241** (Miyazaki ¥187.705 · Kagoshima ¥188.570 · Okayama ¥190.992 · Nagano ¥193.241) — yaitu **5–8% di bawah** simulasi rata-rata nasional ¥203.621. Kedua angka harus muncul, tidak saling menggantikan. Tanpa ini, pembaca yang ditempatkan di Miyazaki akan mengira artikelnya salah hitung — dan justru dialah audiens inti ASJ
- [ ] **Tambahkan kalimat penjelas "rata-rata tertimbang vs per prefektur"** sebelum tabel prefektur. Keempat prefektur tujuan ASJ semuanya di bawah ¥1.177 karena rata-rata nasional tertimbang ditarik ke atas oleh prefektur berpenduduk besar (Tokyo 1.280). **Kalimat siap pakai ada di laporan SEO优化师 §5 Target 3** — rujuk ke sana agar 内容编辑 menerima satu instruksi, bukan dua. *Tanpa kalimat ini, tabel prefektur sebaiknya tidak dipasang sama sekali*
- [ ] **Pertajam atribusi "16 bidang".** Draf menulis "sebagian materi resmi lain masih menyebut 16 bidang" — padahal itu halaman **ISA sendiri** (`/en/about/step/`), bukan lembaga lain. Sebut bahwa keduanya resmi & keduanya ISA, selisihnya karena pembaruan bertahap. Ini menaikkan kredibilitas, bukan menurunkannya
- [ ] Pertimbangkan rentang rupiah per komponen (brief memintanya; sekarang hanya kualitatif)
- [ ] **Jangan** menambahkan nominal biaya keberangkatan ke artikel. Mekanisme "bisa dicicil + dana talang" sudah tercakup dan itu sudah benar. Angka 15-25/45-50 Jt di beranda adalah string hardcoded tanpa sumber/tanggal → komitmen harga yang cepat kedaluwarsa
- [ ] Sebutkan nomor regulasi untuk klaim "biaya yang tidak boleh dibayar"
- [ ] Tandai "173 jam/bulan" sebagai asumsi

### C. Situs (eskalasi ke 沈略 — di luar wewenang konten)

- [ ] **Prerender `/loker`, `/apply`, `/siswa-baru`** (Astro dapat merender fallback statis). Tanpa ini, seluruh nilai SEO tautan internal tetap nol
- [ ] **Isi `/loker` dengan minimal 1 lowongan nyata** sebelum artikel terbit — dua tautan beranchor "lowongan yang sedang dibuka" saat ini menuju tabel kosong
- [ ] **Perbaiki `/public`** (kosong) atau lepas dari navigasi. Judulnya "Lowongan & Layanan" tidak sesuai isi
- [ ] Ganti `<title>` `/ai-cv` ("ASJ AI - Qween Jeklin") agar konsisten merek ASJ
- [ ] **Beri sumber & tanggal pada angka biaya di `LayananSection.astro:67,74`** ("Keberangkatan: 15-25 Jt / 45-50 Jt") atau ubah menjadi bentuk "mulai dari". Saat ini berupa string hardcoded tanpa atribusi — rawan dibaca sebagai janji harga dan cepat kedaluwarsa
- [ ] Sediakan **URL resmi kanal verifikasi izin lembaga** untuk melengkapi H3 "Cara cek agensi resmi"

### D. Verifikasi sebelum publikasi

- [ ] Konfirmasi id anchor `#legalitas` ada di beranda (fallback `/`). `#program` (`index.astro:231`) & `#penempatan` (`index.astro:406`) sudah terverifikasi
- [ ] **Koreksi ¥1.177 lebih dulu**, lalu pastikan tabel simulasi sudah dihitung ulang — **sebelum** tautan MHLW dipasang. Tautan yang menunjuk sumber yang membantah artikelnya sendiri lebih buruk daripada tanpa tautan
- [ ] Pastikan rumusan "16 bidang" menyebut bahwa sumbernya **ISA sendiri** (`/en/about/step/`), bukan "materi resmi lain"
- [ ] Uji setiap tautan: pastikan tujuan memenuhi janji anchor-nya
- [ ] Periksa tidak ada H2 dengan >1 tautan ke halaman yang sama
- [ ] Pastikan nol anchor "klik di sini" / "selengkapnya" / "baca juga"

### E. Fase 2 (setelah S1–S3 terbit)

- [ ] Sisipkan tautan pillar → S1 (dari H2 Checklist), pillar → S2 (dari H3 Potongan), pillar → S3 (dari H3 "tanpa biaya")
- [ ] Wajibkan setiap pendukung menautkan balik ke pillar di paragraf pembuka
- [ ] Periksa ulang tidak ada dua halaman menargetkan kata kunci yang sama

---

## 11. CATATAN METODOLOGI

- Audit tautan dilakukan dengan **membaca draf baris per baris** dan **mengambil langsung 6 halaman tujuan situs** (22 Oktober 2026) untuk memastikan setiap anchor ditepati tujuannya. Ini yang mengungkap `/public` kosong dan `/loker` tanpa data — dua hal yang tidak terlihat dari draf.
- **Audit silang dengan SEO优化师** menghasilkan tiga penyesuaian: (a) tautan MHLW ditambahkan (E5) — URL diberikan & diverifikasi SEO优化师, di luar daftar izin brief §5, **lalu disetujui team-lead** setelah halaman itu dibuka dan dicek; (b) koreksi angka ¥1.176 → ¥1.177; (c) `/#penempatan` dipindah dari H2 Gaji ke H2 Bidang karena H2 Gaji kini mendapat sumber data yang lebih tepat.
- **Rantai verifikasi angka.** ¥1.177 pertama kali dilaporkan SEO优化师 → saya masukkan sebagai kontinjensi tanpa memverifikasi sendiri → **team-lead mengekstrak langsung PDF MHLW** (`content/11200000/001753404.pdf`) dan mengonfirmasi, termasuk keempat angka prefektur. Status di laporan ini mengikuti rantai itu: 83 (audit awal) → 82 (setelah terkonfirmasi). Saya tidak pernah menyajikan angka yang belum diverifikasi sebagai fakta.
- **Satu klaim ditarik.** Pernyataan bahwa "sebagian situs pemerintah Jepang memblokir request tanpa `Referer`" sempat diajukan sebagai alasan tambahan, lalu **ditarik sendiri oleh SEO优化师** karena tidak diuji. Sudah dihapus dari laporan ini; rekomendasi `rel="noopener"` tanpa `noreferrer` tetap berlaku atas alasan `Referer` yang sebenarnya.
- **Satu hal yang belum diuji (dicatat, bukan diasumsikan):** apakah `mhlw.go.jp` dan `ssw.go.jp` mengizinkan hotlink ke halaman dalam, atau punya kebijakan `X-Frame-Options`/`robots` yang relevan. Untuk tautan biasa `<a href>` — dan itulah satu-satunya bentuk yang direkomendasikan laporan ini — risikonya sangat rendah. **Yang perlu diuji terpisah hanya bila tim kelak ingin mengutip sebagai embed/iframe**, dan itu tidak direkomendasikan.
- **Konvergensi independen** terjadi pada dua titik: sitasi `ssw.go.jp` yang tidak bisa diklik (ditemukan dari audit sitasi *dan* audit tautan), dan penolakan menambah tautan ke `/siswa-baru`/`/loker` yang masih berupa shell. Dua jalur berbeda menunjuk cacat yang sama → prioritas dinaikkan.
- Seluruh angka volume pencarian, kesulitan kata kunci, dan otoritas domain **tidak tersedia** dalam sesi ini dan **tidak dikarang**. Yang diberi tanda **[ESTIMASI]** adalah perkiraan kualitatif.
- **Batas izin URL (diperbarui 22 Okt 2026).** Aturan awal "hanya daftar izin brief §5" dilonggarkan team-lead **khusus untuk domain resmi**: `mhlw.go.jp`, `ssw.go.jp`, `moj.go.jp`, `kp2mi.go.id`, `jdih.bp2mi.go.id`. Di luar itu tetap dilarang — khususnya pesaing, LPK/SO lain, dan portal lowongan komersial. **Nol URL diciptakan** dalam laporan ini.
- Saya **tidak mengedit** file draf. Semua usulan teks di laporan ini adalah saran untuk 内容编辑 / 内容撰稿人.

---

*Laporan disusun 22 Oktober 2026 oleh 连乐桥 (Link Strategist) untuk tim SEO Content ASJ.*
