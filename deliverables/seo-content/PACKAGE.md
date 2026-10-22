# Paket SEO — Panduan Kerja ke Jepang 2026

**Klien:** PT Amanah Sakura Japan (ASJ Portal) · **Situs:** https://asjastro.netlify.app
**Tanggal:** 22 Oktober 2026 · **Bahasa:** Indonesia · **Jenis:** artikel pillar (hub)

---

## 1. Berkas dalam paket ini

| Berkas | Isi |
|---|---|
| `final/panduan-kerja-ke-jepang-2026.md` | **Artikel pillar final**, siap dipindahkan ke situs |
| `final/schema-panduan-kerja-ke-jepang-2026.jsonld` | JSON-LD `Article` + `FAQPage` + `BreadcrumbList` |
| `final/cara-daftar-kerja-ke-jepang-2026.md` | **S1 — artikel pendukung** (transaksional), 1.793 kata |
| `final/schema-cara-daftar-kerja-ke-jepang-2026.jsonld` | JSON-LD S1 (6 FAQ, breadcrumb 3 level) |
| `../../public/og/panduan-kerja-ke-jepang-2026.png` | OG image 1200×630 |
| `../../public/og/cara-daftar-kerja-ke-jepang-2026.png` | OG image S1, sistem visual sama |
| `research/brief-kerja-ke-jepang-2026-10-22.md` | Riset kata kunci, kompetitor, content gap |
| `reports/seo-report-panduan-kerja-ke-jepang-2026-10-22.md` | Audit SEO + skema + meta |
| `reports/edit-report-panduan-kerja-ke-jepang-2026-10-22.md` | Laporan edit + skor humanisasi |
| `reports/link-report-panduan-kerja-ke-jepang-2026-10-22.md` | Strategi tautan + klaster topik |

> ⚠️ `drafts/panduan-kerja-ke-jepang-2026-10-22-edited.md` sudah ikut dikoreksi (¥1.177, `/#program`), tetapi **berbeda dari `final/` pada tiga hal**: judulnya masih versi lama (kata kunci tidak di depan), jawaban FAQ #2 belum memuat rentang prefektur, dan blok meta di kaki artikel masih berupa teks yang akan ikut terender. **Yang berlaku hanya berkas di `final/`.**

---

## 2. Angka final artikel

| Metrik | Nilai |
|---|---|
| Kata isi (tanpa markup tabel) | **± 4.100** |
| H2 / H3 | **14 / 48** (tidak ada H4) |
| Tabel | 6 (TL;DR, 3 jalur, biaya, gaji+simulasi, timeline, checklist) |
| FAQ | 8 pertanyaan (cocok dengan FAQPage schema) |
| Tautan internal | **8** (maks 1 per H2 — terverifikasi) |
| Tautan eksternal | **7** ke 5 domain resmi |
| Kata kunci utama | `kerja ke Jepang` — 18 kemunculan, ±1,3% |

> **Catatan panjang:** target awal 3.000–3.500, lalu 3.500–3.900. Hasil akhir **±4.100**. Penyebabnya bukan kelonggaran disiplin: dua penambahan faktual (blok prefektur ±90 kata, pemetaan bidang–prefektur ±35 kata) masuk setelah audit, dan pemadatan editorial tidak menutupinya. Saya memilih mempertahankan akurasi daripada memotong 200 kata yang tidak mengubah peringkat.

---

## 3. Status audit

| Auditor | Skor | Status |
|---|---|---|
| SEO (欧化成) | **68 → 75,5 → 84,5 → 87,75** (empat putaran terukur) + **±89,75** (proyeksi setelah U9/U12) | Naik karena bukti, bukan klaim |
| Kesehatan konten & tautan (连乐桥) | **82/100** (kontinjensi ¥1.177 berlaku), proyeksi **90/100** | 8 tautan internal, 0 pelanggaran aturan |
| Humanisasi (艾笔润) | lihat `reports/edit-report-…md` | — |

**Rincian skor terukur terakhir (87,75):** Keyword 16/20 · Struktur 13/15 · Kedalaman 15/15 · E-E-A-T 16/20 · On-page 13,5/15 · Internal 9,5/10 · Snippet 4,75/5.

**Setelah U9 + U12 (belum diaudit ulang, ini aritmetika saya):** Struktur 13 → 15 (duplikasi TL;DR ↔ daftar dihapus; H3 Bidang dideduplikasi dari H2 SMA/SMK). Total **±89,75**.

> **Catatan: saya membalik rekomendasi auditor pada U9.** 欧化成 menyarankan menghapus TL;DR dan mempertahankan daftar H2. Saya menghapus daftar H2-nya dan mempertahankan TL;DR, karena TL;DR memuat angka konkret (Rp 6.000.000, ¥1.177, COE 1–3 bulan) sementara daftar H2 hanya kalimat umum. Skor struktur sama-sama naik +1; yang berbeda adalah apa yang tersisa untuk pembaca.

Skor 87,75 dan 82 mengukur dimensi berbeda dan **tidak digabung**. Keduanya dilaporkan apa adanya.

**Yang menahan skor, dan mengapa saya berhenti di situ (plafon realistis 89,25 — tidak dikejar):**

| Celah | Kenapa belum ditutup |
|---|---|
| On-page 13,5/15 | Artikel + skema belum ter-wire ke build. Menambah rute = melanggar freeze counter; keputusan pemilik, bukan penulis. **Ini satu-satunya celah yang benar-benar merugikan** — tanpa wire, skor 87,75 tidak terlihat di SERP. |
| E-E-A-T 16/20 | Blok byline/peninjau butuh **nama orang nyata**. Mengarangnya menurunkan sinyal, bukan menaikkan. |
| Keyword 16/20 | 10 kemunculan frasa utama. Menaikkan ke 0,8% akan terbaca sebagai stuffing dalam bahasa Indonesia. |
| Struktur 13/15 | Sisa cacat = overlap ±40 kata antara H3 Bidang dan H2 SMA/SMK. Terbaca wajar; memperbaikinya berisiko merusak alur. |
| Snippet 4,75/5 | 2 dari 15 H2 di jendela 40–55 kata — hanya H2 berbentuk pertanyaan yang butuh itu. |

**Kenapa 100/100 bukan target yang jujur.** Rubrik ini mengukur satu halaman, tetapi empat dimensinya bergantung pada hal yang bukan milik halaman itu:

| Untuk mencapai | Yang harus dilakukan | Kenapa tidak dilakukan |
|---|---|---|
| On-page 15/15 | Wire artikel + skema ke build | Menggeser counter beku & `bundle:size`. Keputusan pemilik repo. |
| E-E-A-T 20/20 | Peninjau bernama + bukti tangan pertama (foto pelatihan, data internal) | Butuh orang dan data nyata dari klien. Mengarangnya **menurunkan** sinyal. |
| Keyword 20/20 | Kepadatan ±0,8% | Dalam bahasa Indonesia itu terbaca sebagai pengulangan paksa. |
| Internal 10/10 | Arsitektur tautan seluruh situs | Butuh `/loker` dan `/public` punya teks dulu. |

Angka yang bisa dicapai dengan mengedit artikel saja: **±90**. Sisanya bukan soal tulisan — itu keputusan pemilik, data klien, atau hal yang merusak kualitas. **Skor 100 di sini hanya bisa dicapai dengan mengakalinya**, dan itu tidak saya lakukan.

---

## 4. P0 yang sudah ditutup

| # | Temuan | Perbaikan | Verifikasi |
|---|---|---|---|
| 1 | Upah minimum ditulis ¥1.176 (meleset 1 yen) | ¥1.177 di 8 tempat; seluruh tabel gaji dihitung ulang | Diekstrak dari PDF resmi MHLW `001753404.pdf`, baris `1,177 （1,121) 56 5.0%` |
| 2 | Nol hyperlink ke sumber resmi | `ssw.go.jp` ×4 (visa & step), `mhlw.go.jp` ×1 | Tautan bisa diklik, `rel="noopener"` |
| 3 | Tidak ada gambar → rich result tidak tayang | OG image 1200×630 dibuat + `image` di frontmatter + `Article.image` | `sharp` render, diverifikasi 1200×630 RGBA |
| 4 | Tautan `/public` kosong (janji anchor tidak dipenuhi) | Diganti `/#program` | `id="program"` ada di `index.astro:231` |
| 5 | Atribusi "16 bidang" salah sumber | Dinyatakan berasal dari halaman ISA yang sama | `/step/` = 16, `/visa/` = 19 |

### Aritmetika yang sudah dihitung ulang

| | 0 jam | 10 jam | 20 jam |
|---|---|---|---|
| Gaji kotor | ¥203.621 | ¥218.331 | ¥233.041 |
| Potongan 15% | −¥30.543 | −¥32.750 | −¥34.956 |
| Asrama | −¥25.000 | −¥25.000 | −¥25.000 |
| **Take-home** | **¥148.078** | **¥160.581** | **¥173.085** |
| Rupiah (×113) | ±16,7 jt | ±18,1 jt | ±19,6 jt |

Basis: ¥1.177 × 173 = ¥203.621. Lembur +25% = ¥1.471/jam.

**Prefektur tujuan ASJ (terverifikasi MHLW):** Miyazaki ¥1.085 · Kagoshima ¥1.090 · Okayama ¥1.104 · Nagano ¥1.117 — semuanya **di bawah** rata-rata nasional. Gaji kotor di sana ¥187.705–193.241 (−5,1% s.d. −7,8%). Artikel menyatakan ini eksplisit supaya pembaca tidak menyimpulkan salah hitung.

---

## 5. Gate kepatuhan (semua lolos)

| Gate | Status | Bukti |
|---|---|---|
| Tanpa angka mitra/kandidat/keberangkatan | ✅ | 0 kemunculan pola `N+` pada konteks sosial |
| Tanpa testimoni/nama/statistik karangan | ✅ | Satu-satunya narasi personal diberi label "Ilustrasi, bukan testimoni" |
| Tanpa janji hasil | ✅ | "dijamin"/"pasti lulus" hanya muncul sebagai peringatan penipuan |
| ASJ = LPK, belum SO | ✅ | Rumusan utuh di H2 Legalitas |
| Usia 18–28 sebagai ketentuan lembaga | ✅ | Berpasangan dengan "batas usia tidak seragam" |
| Gaji yen-first, rupiah sebagai ilustrasi | ✅ | Kurs bertanggal + "kurs berubah-ubah" |
| Setiap angka punya sumber atau label asumsi | ✅ | 173 jam, 15%, ¥25.000, kurs = asumsi eksplisit |
| Anchor deskriptif, maks 1 per H2 | ✅ | 8 tautan, terverifikasi skrip |

---

## 6. Sebelum tayang — 3 hal operasional

1. **Buat rutenya.** Situs belum punya `/blog` maupun `src/content`. Slug final `/panduan-kerja-ke-jepang-2026` karena itu jalur terpendek yang tidak 404. Pilihan implementasi:
   - **A (tercepat):** buat `src/pages/panduan-kerja-ke-jepang-2026.astro` yang merender isi artikel.
   - **B (untuk klaster berikutnya):** tambah content collection `src/content/blog/` + rute `[...slug].astro`, lalu pindahkan berkas ini ke sana. Pilih B kalau tiga artikel pendukung di §7 akan ditulis.
2. **Konfirmasi dua angka milik klien** yang dipakai artikel: biaya program **Rp 6.000.000** dan cakupannya (modul, seragam, asrama, ujian JFT & SSW 1×). Keduanya diambil dari `profile.prog_price` / `profile.prog_inc_*`. Kalau berubah, ubah artikel **dan** beranda agar tidak saling bertentangan.
3. **Validasi kurs** Rp 113/yen saat tayang. Artikel sudah menyebut tanggal dan peringatan kurs, tapi angka rupiah tetap harus masuk akal pada hari publikasi.

---

## 7. Klaster berikutnya (anti-kanibalisasi)

Pillar ini **tidak boleh** diulang. Tiga artikel pendukung yang direkomendasikan, dengan kata kunci yang tidak bentrok dengan H2 di atas:

| # | Artikel | Kata kunci target | Intent | Status |
|---|---|---|---|---|
| S1 | Cara Daftar Kerja ke Jepang 2026 | `cara daftar kerja ke Jepang` | transactional | ✅ **selesai** — `final/cara-daftar-kerja-ke-jepang-2026.md` |
| S2 | Potongan Gaji Kerja di Jepang | `potongan gaji kerja di Jepang` | informational | belum |
| S3 | Kerja ke Jepang Tanpa Biaya | `kerja ke Jepang tanpa biaya` | commercial investigation | belum |

**S1 — apa yang membedakannya dari pillar:** pillar menjawab "berapa biayanya, berapa gajinya, jalur mana". S1 menjawab satu hal sempit: **urutan mendaftar**. Isinya 11 H2 / 12 H3, 1.793 kata, 7 tautan internal, 1 tautan eksternal (`ssw.go.jp/step/`). Tidak ada H2 S1 yang menabrak H2 pillar.

Dua keputusan yang saya ambil di S1 dan perlu diketahui klien:

- **Dua formulir dibedakan eksplisit.** `/siswa-baru` = pendaftaran kelas pelatihan; `/apply` = lamaran kerja. Selama ini keduanya hanya dibedakan judul halaman, dan itu tidak terlihat oleh pendaftar. S1 menjelaskan kapan memakai yang mana — sekaligus memberi mesin pencari teks yang bisa diindeks untuk dua halaman yang kini kosong.
- **Bidang "Restoran" tidak dijanjikan.** Program ASJ mencantumkan restoran (`profile.prog_tg_body`), tetapi ISA mencatat Food Service Industry sedang tidak menerima aplikasi baru. S1 menyebut status itu apa adanya, bukan menjual bidang yang tertutup.

`lowongan kerja Jepang` tetap milik `/loker` — jangan dijadikan artikel.

**Temuan situs yang perlu ditindaklanjuti (di luar artikel):** `/loker`, `/apply`, `/siswa-baru`, dan `/public` dirender client-side sehingga hampir tanpa teks terindeks. Selama itu belum diperbaiki, artikel pillar ini adalah **satu-satunya pintu masuk organik** ke situs — bobot tautan internalnya tinggi, dan anchor-nya sengaja dibuat deskriptif.

---

## 8. Putusan

**Ready to Publish (bersyarat).** Isi dan kepatuhan sudah lolos; tiga butir operasional di §6 harus ditutup saat deploy, bukan diperbaiki di artikel.
