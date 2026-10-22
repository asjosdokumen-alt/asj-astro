# LAPORAN RE-SKOR SEO (AUDIT KEDUA)
## Panduan Kerja ke Jepang 2026 — Pillar

| | |
|---|---|
| **File diaudit** | `deliverables/seo-content/final/panduan-kerja-ke-jepang-2026.md` |
| **Snapshot** | md5 `c4897c94682d3935785c68c46c9b9e54`, mtime **2026-10-22 23:31:40**, 538 baris |
| **Pembanding delta** | `drafts/panduan-kerja-ke-jepang-2026-10-22.md` (asli) + `…-edited.md` |
| **Skema** | `final/schema-panduan-kerja-ke-jepang-2026.jsonld` |
| **Rubrik** | Sama persis dengan audit pertama — bobot tidak diubah |
| **Auditor** | 欧化成 (SEO Optimizer) |
| **Status** | **Ready to Publish** (konten) — skor **87,75/100** setelah v3. Satu-satunya blocker tersisa: **U13, wire ke build** (keputusan team-lead, bukan pekerjaan penulis) |

> **⚠️ Dokumen ini punya tiga lapis.**
> §0–§7 = audit **v1** (skor 75,5) · §0.5 = verifikasi **v2** (84,5) · **§0.5.1 = skor **v3**, 87,75 — INI YANG BERLAKU.**
> Riwayat: v1 `c4897c94` → v2 `65c278f5` → **v3 `94941c15`**.

> **Catatan integritas & metode.** Tidak ada angka SERP, volume pencarian, atau metrik otoritas yang saya karang. Yang bertanda **[ESTIMASI]** murni dugaan profesional dan tidak boleh dipakai sebagai target.
>
> **Peringatan penting soal snapshot:** file ini **sedang diedit** saat saya mengaudit (mtime berubah 10 detik sebelum saya membaca). Saya membekukan salinan ke `%TEMP%/seosnap/final-snapshot.md` dan **semua angka di laporan ini dihitung dari snapshot itu**, bukan dari file yang terus berubah. Kalau file berubah lagi setelah 23:31:40, angka di sini perlu diverifikasi ulang.
>
> **Perbedaan metode dengan laporan pertama.** Laporan pertama menghitung 3.733 kata dan 18 kemunculan frasa utama; saya tidak bisa mereproduksi angka itu dengan metode apa pun. Karena itu **saya mengukur ulang draf lama dengan metode saya sendiri**, supaya delta lama→baru apples-to-apples. Metode saya: buang frontmatter + komentar HTML, hitung kata hanya token huruf (`[A-Za-zÀ-ÿ]+`), pisahkan heading dari badan. Kolom "lama" di bawah **adalah hasil ukur ulang saya atas draf**, bukan kutipan laporan pertama.

---

# 0.5 VERIFIKASI PASCA-UPGRADE (v2 + v3) — SKOR BERLAKU

**Snapshot v2:** md5 `65c278f59400803ba5dd75b0e70fd76e`, mtime **2026-10-22 23:37:13**, 551 baris.
**Snapshot v1 (pembanding):** md5 `c4897c94682d3935785c68c46c9b9e54`, 538 baris.
**S1 v2:** md5 `ee5d5645edb517899753a1aa561a7522`.
Semua angka di bawah saya ukur sendiri dari snapshot itu. Klaim team-lead saya cek satu per satu — hasilnya di §0.5.4, termasuk **satu klaim yang tidak akurat** dan **satu kesalahan saya sendiri**.

## 0.5.1 Skor final v3: **87,75 / 100** (dari 84,5 — naik +3,25)

**Snapshot v3:** md5 `94941c151e2dc352a7b316d9ba04fa13`, mtime **2026-10-22 23:40:24**, 15 H2, 4.484 kata.
**S1 v3:** md5 `8a7987230d2ee0ea8811de4bc97282b4`, 10 H2.

| # | Dimensi | Maks | v1 | v2 | **v3** | Δ v2→v3 | Bukti perubahan |
|---|---|---|---|---|---|---|---|
| 1 | Keyword optimization | 20 | 11 | 16 | **16** | **0** | Kemunculan **identik** dengan v2 (badan: 10 utama / 20 varian). Kata bertambah 3.932→4.048, jadi kepadatan utama 0,25%→0,25%, varian 0,51%→0,49%. Tidak ada yang naik, tidak ada yang turun |
| 2 | Struktur heading | 15 | 12 | 13 | **13** | **0** | +1 H2 metodologi (15 H2 total) tapi **3 cacat lama utuh**: duplikasi TL;DR↔H2-1, tumpang tindih H3-Bidang↔H2-SMA/SMK, FAQ H3 kembar H2-9 |
| 3 | Kedalaman vs kompetitor | 15 | 15 | 15 | **15** | **0** | Plafon; 4.362 → **4.484 kata** |
| 4 | E-E-A-T / sitasi | 20 | 13 | 14 | **16** | **+2** | H2 "Sumber dan cara artikel ini disusun": sumber primer bernama + domain + tanggal akses; **4 asumsi dilabeli eksplisit** (173 jam, 15%, ¥25.000, Rp 113); changelog bertanggal + komitmen koreksi. Plus derivasi 173 jam |
| 5 | On-page teknis | 15 | 13 | 13 | **13,5** | **+0,5** | `headline` schema kini **persis = H1** ✓. Deduksi sisa: belum ter-wire ke build |
| 6 | Internal linking | 10 | 8 | 9 | **9,5** | **+0,5** | Anchor `/siswa-baru` → "kelas bahasa Jepang untuk pemula" ✓. Sisa: 9 tautan, **6 halaman unik**, 3 mengarah ke `/` |
| 7 | Kesiapan featured snippet | 5 | 3,5 | 4,5 | **4,75** | **+0,25** | Pembuka H2 Biaya **73 → 44 kata** → masuk jendela. Kini **2 dari 15** H2 di jendela (Biaya 44, Gaji 52). Sisa: pembuka H2 Proses masih penyangkalan |
| | **TOTAL** | **100** | **75,5** | **84,5** | **87,75** | **+3,25** | |

**Aritmetika terbuka:** 16 + 13 + 15 + 16 + 13,5 + 9,5 + 4,75 = **87,75**
(v2: 16 + 13 + 15 + 14 + 13 + 9 + 4,5 = 84,5 · v1: 11 + 12 + 15 + 13 + 13 + 8 + 3,5 = 75,5)

**Dekomposisi E-E-A-T 16/20** (agar kenaikannya bisa diaudit): sumber & sitasi 7/7 · akurasi fakta 6/6 · kepengarangan **0/4** (sengaja nol — tidak ada nama nyata, dan itu keputusan yang benar) · metodologi 2/2 · transparansi & koreksi 1/1.

## 0.5.1b Verifikasi 6 perubahan v3

| # | Klaim | Verdict | Bukti terukur |
|---|---|---|---|
| 1 | Pembuka Biaya 43 kata | ✅ **Benar** (saya ukur **44**) | L174 = 44 kata, di jendela; L176 paragraf kedua 18 kata. Total 62 kata, tapi **paragraf pertama** yang menentukan snippet |
| 2 | Derivasi 173 jam | ✅ **Benar & aritmetika tepat** | L243 "(40 jam × 52 minggu ÷ 12 bulan)". Cek: 40×52÷12 = **173,33** → 173 ✓ |
| 3 | Anchor `/siswa-baru` | ✅ **Benar** | L146 "kelas bahasa Jepang untuk pemula"; "kelas dasar" ganda hilang ✓ |
| 4 | `headline` = H1 | ✅ **Benar** | Schema: "Panduan Kerja ke Jepang 2026: Syarat, Biaya, Gaji, dan Prosesnya" = H1 identik ✓ |
| 5 | S1: H2 "Berapa Lama…" dihapus | ✅ **Benar** | S1 11 → **10 H2**. `3–6 bulan` = **0**, `1–2 minggu` = **0**, `1–2 bulan` = **0** |
| 6 | U11-B + U11-C tanpa byline | ✅ **Benar & berkualitas** | Sumber primer + domain + tanggal; 4 asumsi dilabeli; changelog + komitmen koreksi. `author` tetap `Organization`, `reviewedBy` tidak ada ✓ |

**Satu catatan kecil, bukan deduksi:** S1 masih memuat `1–3 bulan` **3×** — semuanya merujuk COE saja, dan L111 secara eksplisit menyerahkan estimasi durasi ke pillar ("Artikel ini membahas apa yang harus kamu lakukan di tiap tahap, bukan berapa lama"). Itu pembagian kerja yang sehat, bukan duplikasi.

## 0.5.1c Kanibalisasi S1: **RENDAH** ✓

| Kriteria | v1 | v2 | **v3** |
|---|---|---|---|
| Tabel 6 tahap duplikat | 🔴 | ✅ | ✅ |
| H2 "Berapa Lama…" di S1 | 🔴 | 🔴 | ✅ **dihapus** |
| 5 dari 6 nilai durasi di S1 | 🔴 | 🟡 | ✅ **0 semua** |
| Kalimat "pasti berangkat" verbatim | 🔴 | ✅ | ✅ |
| "Rp 0" di dua halaman | 🟡 | ✅ | ✅ |
| Tautan dua arah | 🟡 | ✅ | ✅ |

**Alasan RENDAH, bukan SEDANG:** tidak ada lagi halaman kedua yang menjawab "berapa lama total prosesnya". S1 menyisakan satu fakta regulasi (COE 1–3 bulan) yang memang sub-fakta dari tesisnya sendiri ("daftar ≠ berangkat"), diatribusikan ke ISA, dan dibarengi pernyataan eksplisit bahwa durasi adalah wilayah pillar. Tidak ada query yang diperebutkan dua halaman.

## 0.5.1d Yang sebaiknya **dibiarkan** — jangan dikerjakan

Anda minta saya menyebut ini, dan saya setuju dengan instingnya: skor jujur lebih berguna daripada angka yang dipaksakan.

| Item | Poin teoretis | Verdict | Alasan |
|---|---|---|---|
| **Byline penulis / peninjau** (U11-A, U11-D) | +2 | ❌ **Biarkan.** | Tanpa nama nyata, ini murni kosmetik. `author: Organization` sudah benar. Menambah "Tim Redaksi" akan **menurunkan** kredibilitas |
| **Menaikkan kepadatan kata kunci ke 0,8%** | +2 (ilusi) | ❌ **Biarkan.** | Perlu ~32 kemunculan frasa utama di 4.048 kata. Dalam bahasa Indonesia itu terbaca sebagai *stuffing*. 10 kemunculan + 9/14 judul H2 + 4.484 kata kedalaman sudah tepat |
| **U12** rekonsiliasi H3-Bidang ↔ H2-SMA/SMK | +1 | ❌ **Biarkan.** | Tumpang tindihnya hanya ±40 kata dari 4.484, dan bagian itu **terbaca wajar**. Risiko menyunting lebih besar daripada manfaatnya |
| **U9** hapus TL;DR atau H2-1 | +1 | ⚠️ **Opsional, prioritas rendah.** | Redundansi ~90 kata = 2% halaman. TL;DR punya nilai CTR di atas lipatan. Kalau waktu terbatas, lewati |
| **Pembuka H2 Proses** | +0,25 | ⚠️ **Opsional.** | Masih dibuka penyangkalan. Satu kalimat, tapi dampaknya kecil karena H2 Gaji & Biaya sudah menangkap snippet bernilai tinggi |
| **U13 wire artikel + skema ke build** | +1,5 | 🚨 **JANGAN dibiarkan.** | Satu-satunya item yang menentukan apakah 87,75 ini terlihat di SERP. Tanpa route + injeksi skema, Article/FAQPage/BreadcrumbList **tidak pernah dirender** |

**Plafon realistis jika semua opsional dikerjakan: ±89,25.** Saya tidak menyarankan mengejarnya — selisih 1,5 poin dari 87,75 tidak sepadan dengan risiko menyunting bagian yang sudah terbaca baik.

## 0.5.2 Delta dari v1, dengan alasan satu baris

| Dimensi | v1 | v2 | Alasan |
|---|---|---|---|
| Keyword | 11 | **16** | U1 (6 sisipan) + U2 + U3 + U4 berhasil: frasa utama badan 4 → 10, zona kosong 11 → 3, varian wajib `program kerja Jepang` kini ada 2× |
| Struktur | 12 | **13** | Blok lead-in + 7 item di H2 Syarat mengubah bagian dari 5 H3 prosa tanpa ringkasan menjadi list yang bisa dipindai |
| Kedalaman | 15 | 15 | Sudah plafon; kata bertambah 4.016 → 4.362 |
| E-E-A-T | 13 | **14** | Rata-rata tertimbang dijelaskan (L242) — pembaca yang melihat prefektur ¥1.085 vs nasional ¥1.177 tidak lagi menyimpulkan artikel salah hitung |
| On-page | 13 | 13 | Nol perubahan pada frontmatter, schema, OG, slug |
| Internal | 8 | **9** | Tautan ke `/cara-daftar-kerja-ke-jepang-2026` (L315) menutup tautan satu arah dengan S1 |
| Snippet | 3,5 | **4,5** | 2 dari 3 kegagalan yang saya namai berhasil ditutup (Gaji → jendela, Syarat → list) |

## 0.5.3 Verifikasi klaim kata kunci — **team-lead benar: 9**

Team-lead menghitung **9**; saya menghitung **10 mentah / 9 tanpa alt**. **Konfirmasi: angka 9 tepat**, dan itu justru metode yang benar (alt text tidak dibaca sebagai prosa).

| Metrik | v1 | **v2** | Catatan |
|---|---|---|---|
| Frasa utama, badan (termasuk alt) | 4 | **10** | target saya 10 → **tercapai** |
| Frasa utama, badan **tanpa alt** | 3 | **9** | angka yang dipakai team-lead ✓ |
| Semua 5 varian, badan (mentah) | 8 | **20** | — |
| Kepadatan frasa utama, badan | 0,11% | **0,25%** | 2,3× |
| Kepadatan agregat varian, badan | 0,22% | **0,51%** | 2,3× |
| Kepadatan frasa utama, seluruh dokumen | 0,42% | **0,53%** | draf lama 0,57% — praktis pulih |
| `program kerja Jepang` | 0 | **2** | L174, L192 ✓ |
| Zona kosong H2 | 11 / 14 | **3 / 15** | sisa: Aman & Legal, SMA/SMK, FAQ |
| Judul H2 memuat varian | 9 / 14 | 9 / 14 | tidak berubah |
| `magang Jepang`, `agensi kerja ke Jepang` | 0 | **0** | masih absen; keduanya hanya di blok komentar, tidak kritis |

**3 zona kosong yang tersisa** — semuanya punya kata kunci di judul H2-nya, jadi dampaknya kecil: "Apakah Kerja ke Jepang Aman dan Legal?" (364 kata), "Kerja ke Jepang untuk Lulusan SMA/SMK" (211 kata), "FAQ" (315 kata).

## 0.5.4 Verifikasi klaim lain — 6 benar, 1 tidak akurat, 1 kesalahan saya

| # | Klaim team-lead | Verdict | Bukti |
|---|---|---|---|
| 1 | U1a–U1c, U1e–U1g diterapkan; U1d dilewati | ✅ **Benar** | L35, L47, L51, L192, L390, L457 persis teks saya. U1d (L128) digantikan lead-in U2 yang tetap memuat "Syarat **kerja ke Jepang**" ✓ |
| 2 | U2 list 7 item | ✅ **Benar** | L130–136, 7 item, semua <15 kata |
| 3 | U3 pembuka Biaya | ⚠️ **Benar isinya, tapi kepanjangan** | Lihat §0.5.5 — **ini kesalahan saya**, bukan team-lead |
| 4 | U4 pembuka Gaji | ✅ **Benar — 52 kata, di jendela** | L236 |
| 5 | U10 rata-rata tertimbang | ✅ **Benar**, dengan catatan | Diterapkan di **L242** (H3 "Upah minimum"), bukan tepat sebelum paragraf prefektur (L281). Fungsional — penjelasan tetap muncul sebelum angka prefektur. Tapi kini muncul **setelah** pembuka U4 yang sudah menyebut ¥187.705–193.241 |
| 6 | "2 gambar baru (belum ada saat Anda audit)" | ❌ **Tidak akurat** | Kedua gambar **sudah ada di snapshot v1** (L265 dan L299) dan **sudah dikreditkan** dalam skor on-page 13/15. Tidak ada kredit ganda — tapi jangan dihitung sebagai perbaikan baru |
| 7 | Tautan ke S1 ditambahkan | ✅ **Benar** | L315 → `/cara-daftar-kerja-ke-jepang-2026` |
| 8 | Tabel 6 tahap dihapus dari S1; `± 1–2 minggu` hanya di pillar | ✅ **Benar, tapi tidak lengkap** | S1: `1–2 minggu` = 0 ✓, `COE: 1–3 bulan` = 0 ✓, tabel durasi hilang ✓. **Tapi** S1 masih memuat H2 "Berapa Lama Sampai Bisa Berangkat?" yang **masih menyebut 3–6 bulan, 1–2 bulan, 1–2 bulan, 1–3 bulan, 1–2 bulan** dalam prosa — 5 dari 6 nilai durasi pillar masih terduplikasi |
| 9 | Kalimat "pasti berangkat dalam 3 bulan" di S1 diganti | ✅ **Benar** | S1: 0 kemunculan. Duplikat verbatim dengan pillar L305 **hilang** ✓ |
| 10 | `Tidak ada yang benar-benar Rp 0` | ✅ **Berhasil dihapus dari S1** | S1: 0 kemunculan (tidak diklaim, tapi saya cek — bersih) |

## 0.5.5 Koreksi saya sendiri: teks U3 adalah 73 kata, bukan 52

Di laporan v1 saya menulis bahwa teks pengganti U3 berukuran **"(52 kata — di jendela 40–55)"**. Saya hitung ulang: teks itu **73 kata**. **Hitungan saya yang salah, dan team-lead menerapkan apa adanya** — jadi ini bukan kesalahan eksekusi.

Konsekuensinya: H2 Biaya **melewati jendela snippet 18 kata**. Isinya sekarang benar (9 komponen + Rp 6.000.000), hanya kepanjangan untuk diangkat utuh sebagai paragraph snippet.

**Perbaikan minimal — satu suntingan frasa.** Di **L183**, ganti:
> `…dan biaya jasa lembaga. Totalnya berbeda per lembaga dan per jalur, jadi tidak ada satu angka universal — sebagai contoh konkret, biaya program ASJ…`

menjadi:
> `…dan biaya jasa lembaga. Tidak ada angka universal. Sebagai contoh konkret, biaya program ASJ…`

**Hasil: 73 → 55 kata** (tepat di batas atas jendela), dan **seluruh sisa kalimat tidak berubah** — termasuk penutup "satu angka besar tanpa rincian adalah tanda bahaya pertama". Usaha: trivial.

## 0.5.6 Cek snippet — berapa H2 di jendela 40–55 kata?

**1 dari 14 H2** berada di jendela: **H2 Gaji, 52 kata** (v1: 15 kata, GAGAL). Sebaran sekarang: 12–73 kata.

**Status 3 H2 yang dulu GAGAL:**

| H2 | v1 | **v2** | Verdict |
|---|---|---|---|
| **Syarat Kerja ke Jepang 2026** | 14 kata, nol syarat | **17 kata + list 7 item** | ✅ **LULUS — sebagai blok list snippet.** Catatan: kriteria 40–55 kata berlaku untuk *paragraph* snippet; untuk list snippet yang benar justru lead-in pendek + list. Desainnya sekarang tepat |
| **Berapa Gaji Kerja di Jepang?** | 15 kata, nol yen | **52 kata**, ¥1.177 / ¥203.621 / ¥148.078 / ¥187.705–193.241 | ✅ **LULUS** — di jendela, 4 angka |
| **Berapa Biaya Kerja ke Jepang?** | 26 kata, nol rupiah | **73 kata**, 9 komponen + Rp 6.000.000 | ⚠️ **SEBAGIAN** — isi benar, panjang melewati jendela. Perbaiki §0.5.5 |

**Masih lemah (tidak diklaim beres, jadi tidak ada regresi):** H2 Proses masih dibuka penyangkalan ("Siapa pun yang menyebut…"), 20 kata, tanpa durasi; H2 Tiga Jalur 12 kata tanpa menyebut nama ketiga jalur; H2 Bidang 32 kata tanpa nama bidang. Rekomendasi ganti pembuka Proses di v1 §5.3 belum diterapkan.

## 0.5.7 Kanibalisasi S1 — **TINGGI → SEDANG** (turun satu tingkat, belum RENDAH)

| Bukti | v1 | **v2** |
|---|---|---|
| Tabel 6 tahap duplikat | 🔴 ada | ✅ **hilang** — S1 kini list 6 langkah tanpa durasi |
| Kalimat "pasti berangkat dalam 3 bulan" hampir verbatim | 🔴 ada | ✅ **hilang** — S1 diganti total |
| "Tidak ada yang benar-benar Rp 0" di dua halaman | 🟡 ada | ✅ **hilang dari S1** |
| Tautan satu arah | 🟡 S1 → pillar saja | ✅ **dua arah** — pillar L315 |
| **H2 "Berapa Lama…" di dua halaman** | 🔴 ada | 🔴 **masih ada** |
| **5 dari 6 nilai durasi masih di S1** | — | 🟡 **masih ada** (3–6 bln, 1–2 bln ×3, 1–3 bln) |

**Kenapa SEDANG dan bukan RENDAH:** tiga dari empat duplikasi terberat sudah dibereskan, jadi tidak lagi TINGGI. Tapi S1 **masih punya H2 "Berapa Lama Sampai Bisa Berangkat?"** yang menjawab query yang sama dengan H2 pillar, memakai angka yang sama, dalam bentuk prosa. Dua halaman masih bersaing untuk satu query.

**Satu tindakan menutupnya** (di S1, di luar cakupan saya — keputusan team-lead): hapus H2 "Berapa Lama Sampai Bisa Berangkat?" dan ganti dengan satu kalimat penutup di H2 "Enam Tahap Setelah Kamu Mendaftar": *"Estimasi durasi tiap tahap ada di [panduan kerja ke Jepang 2026](/panduan-kerja-ke-jepang-2026)."* → kanibalisasi turun ke **RENDAH**.

## 0.5.8 Apakah U11 (blok E-E-A-T) masih layak? — **Sebagian. Kerjakan 2 dari 4 bagian.**

Anda benar untuk tidak mau menambah kosmetik. Saya pecah U11 jadi empat, dan hanya dua yang layak tanpa nama nyata:

| Bagian U11 | Butuh nama nyata? | Verdict | Poin |
|---|---|---|---|
| **B. Blok metodologi** | **Tidak** | ✅ **Kerjakan.** Ini bagian paling bernilai dari seluruh U11 — dan satu-satunya yang bisa dieksekusi sekarang. Menjelaskan asal angka + apa yang **tidak** diklaim. Tidak menyebut siapa pun | **+1,5** |
| **C. Changelog** | **Tidak** | ✅ **Kerjakan.** "22 Okt 2026 — upah diperbarui ke ¥1.177; atribusi 16/19 bidang diperbaiki" adalah tindakan institusional, bukan klaim personal | **+0,5** |
| **A. Byline penulis + peninjau** | **Ya** | ❌ **Jangan.** Byline generik "Tim Redaksi ASJ" atau nama yang dikarang **lebih buruk daripada tidak ada** — saya sudah menandainya kosmetik di §4.1. Tanpa nama, nol kenaikan sinyal | 0 |
| **D. Schema `author` → `Person` + `reviewedBy`** | **Ya** | ❌ **Jangan.** `author` tetap `Organization`. Membuat `Person` tanpa orang nyata adalah structured data palsu | 0 |

**Jadi: kerjakan B + C → E-E-A-T 14 → ±16.** Kalau kelak ada nama penulis nyata, A + D menambah ±2 lagi.

**Satu hal lagi yang gratis dan belum dikerjakan:** U5 — derivasi 173 jam (L250 masih "Dengan asumsi 173 jam kerja per bulan"). Satu frasa, +0,5 E-E-A-T, dan menutup celah keterverifikasian terbesar di bagian gaji.

## 0.5.9 Sisa celah, berurut poin-per-usaha

| Rank | Item | Dimensi | Poin | Usaha | Lokasi |
|---|---|---|---|---|---|
| **1** | Trim pembuka Biaya 73 → 55 kata | Snippet | **+0,25** | **Trivial** | L183 (§0.5.5) |
| **2** | Derivasi 173 jam (U5) | E-E-A-T | **+0,5** | **Trivial** | L250 |
| **3** | Anchor `/siswa-baru` (U7) | Internal | **+0,5** | **Trivial** | L155 |
| **4** | `headline` schema = H1 (U8) | On-page | **+0,5** | **Trivial** | schema L7 |
| **5** | Blok metodologi (U11-B) | E-E-A-T | **+1,5** | **Kecil** | sebelum H2 FAQ |
| **6** | Changelog (U11-C) | E-E-A-T | **+0,5** | **Trivial** | sebelum L537 |
| **7** | Ganti pembuka H2 Proses | Snippet | **+0,25** | **Kecil** | L305 |
| **8** | Hapus TL;DR **atau** H2-1 (U9) | Struktur | **+1,0** | **Kecil** | L24–29 |
| **9** | Rekonsiliasi H3-Bidang ↔ H2-SMA/SMK (U12) | Struktur | **+1,0** | **Sedang** | L425 |
| **10** | Hapus H2 "Berapa Lama" di S1 | Kanibalisasi | **+0,5** | **Kecil** | file S1 |
| **11** | Wire artikel + skema ke build (U13) | On-page | **+1,5** | **Besar** | **keputusan team-lead** |

**Proyeksi jika #1–#10 selesai: ±91/100.** Dengan #1–#6 saja (semua trivial/kecil, ±30 menit): **±87**.

---

# 0. RINGKASAN EKSEKUTIF (v1 — dipertahankan sebagai jejak audit)

> Skor di bawah ini adalah **keadaan v1 (75,5)**. **Skor yang berlaku adalah 84,5 di §0.5.**

## Skor SEO baru: **75,5 / 100** (naik +7,5 dari 68)

| # | Dimensi | Maks | Lama | **Baru** | Δ | Alasan satu baris |
|---|---|---|---|---|---|---|
| 1 | Keyword optimization | 20 | 13 | **11** | **−2** | **Regresi.** Frasa utama di badan teks turun 11 → 4 (−64%); kepadatan badan 0,29% → 0,11%; `program kerja Jepang` masih **0** |
| 2 | Struktur heading | 15 | 12 | **12** | 0 | Hierarki tetap bersih, tapi duplikasi TL;DR vs H2-1 **tidak dihapus** dan muncul tumpang tindih baru H3-Bidang vs H2-SMA/SMK |
| 3 | Kedalaman vs kompetitor | 15 | 14 | **15** | **+1** | +283 kata, +2 diagram, +angka upah 4 prefektur yang diverifikasi — sekarang maksimal |
| 4 | E-E-A-T / sitasi | 20 | 8 | **13** | **+5** | **Lompatan terbesar.** 0 → 7 hyperlink otoritatif, ¥1.176→¥1.177 benar, atribusi "16 bidang" diperbaiki. Tapi byline/reviewer/metodologi masih **nol** |
| 5 | On-page teknis | 15 | 11 | **13** | **+2** | Title front-loaded, description 146 char + CTA, `image`+OG 1200×630, BreadcrumbList, 2 gambar beralt. **Tapi belum ter-wire ke build** |
| 6 | Internal linking | 10 | 7 | **8** | **+1** | +1 tautan internal (`/#penempatan`). Tapi hanya **7 target unik**, dan **tidak ada tautan pillar → S1** |
| 7 | Kesiapan featured snippet | 5 | 3 | **3,5** | **+0,5** | Pembuka H2 Proses diperbaiki; tapi **0 dari 14 H2** punya pembuka 40–55 kata, dan 3 H2 query terbesar masih gagal |
| | **TOTAL** | **100** | **68** | **75,5** | **+7,5** | |

**Aritmetika terbuka:**
- Lama: 13 + 12 + 14 + 8 + 11 + 7 + 3 = **68**
- Baru: 11 + 12 + 15 + 13 + 13 + 8 + 3,5 = **75,5**
- Delta: 75,5 − 68 = **+7,5**

## Kenapa hanya +7,5, padahal laporan pertama memprediksi 83–86?

Laporan pertama menulis: *"Setelah P0 + P1 diterapkan, artikel ini realistis berada di 83–86/100."* Prediksi itu **tidak tercapai**, dan alasannya bisa dilacak satu per satu:

| Item P0/P1 laporan pertama | Status di file final | Dampak |
|---|---|---|
| P0-1 ¥1.176 → ¥1.177 (7 lokasi) | ✅ **Selesai** — 7 lokasi benar | +E-E-A-T |
| P0-2 Hyperlink ke ssw.go.jp + MHLW | ✅ **Selesai** — 7 tautan eksternal | +E-E-A-T (+5) |
| P0-3 `image` + `datePublished` + `author` + gambar | ✅ **Selesai** — 2 gambar badan, OG 1200×630 | +On-page (+2) |
| P0-4 BreadcrumbList + nasib `/blog` | ✅ **Selesai** — slug root, breadcrumb 2 level konsisten | +On-page |
| P0-5 Atribusi "16 bidang" | ✅ **Selesai** — "Halaman ISA yang sama" | +E-E-A-T |
| **P1-1 List 7 syarat terkonsolidasi** | ❌ **TIDAK dikerjakan** | Snippet tetap gagal |
| **P1-3 Pembuka Biaya & Gaji memuat angka** | ❌ **TIDAK dikerjakan** | Snippet tetap gagal |
| **P1-4 8 frasa + 11 varian di zona kosong** | ❌ **TIDAK dikerjakan — dan regresi** | **−2 poin** |
| P1-6 Lembur +25% jadi fakta hukum | ✅ Selesai ("tarif minimum menurut hukum") | +E-E-A-T |
| P1-7 Meta title front-loaded | ✅ Selesai | +On-page |
| P1-8 Anchor `/siswa-baru` diganti | ❌ Tidak dikerjakan | −0,5 internal |
| P2-1 Hapus duplikasi TL;DR vs H2-1 | ❌ Tidak dikerjakan | −1 struktur |

**Kesimpulan:** tim mengeksekusi **seluruh P0 dengan sempurna** dan **melewatkan hampir seluruh P1 yang menyentuh kata kunci dan snippet**. P0 memberi +7 poin; P1 yang dilewatkan menahan +8 poin lagi. Itu menjelaskan 75,5 vs 83–86.

---

# 1. BUKTI UKUR — ANGKA MENTAH

## 1.1 Metrik dokumen

| Metrik | Draf (lama) | **Final (baru)** | Δ |
|---|---|---|---|
| Kata, seluruh dokumen | 4.175 | **4.016** | −159 |
| Kata, tanpa tabel | 3.879 | **3.720** | −159 |
| Kata, badan saja (tanpa heading) | 3.745 | **3.632** | −113 |
| H1 / H2 / H3 / H4 | 1 / 14 / 48 / 0 | **1 / 14 / 48 / 0** | 0 |
| Tabel | 4 | **4** | 0 |
| Gambar di badan | **0** | **2** | **+2** |
| Tautan internal | 7 | **8** | +1 |
| Tautan eksternal otoritatif | **2** | **7** | **+5** |

## 1.2 Sebaran frasa kunci — per lokasi (terverifikasi baris per baris)

| Lokasi | Draf | **Final** | Bukti |
|---|---|---|---|
| Di **judul heading** (H1+H2+H3) | 17 | **17** | 13× `kerja ke Jepang` + 4× `kerja di Jepang` |
| Di **badan teks** | 18 | **8** | lihat enumerasi di bawah |
| **Total** | 35 | **25** | |
| Kepadatan frasa utama — seluruh dokumen | 0,57% | **0,42%** | 24/4.175 → 17/4.016 |
| Kepadatan frasa utama — **badan saja** | 0,29% | **0,11%** | 11/3.745 → 4/3.632 |
| Kepadatan agregat 5 varian — badan saja | 0,48% | **0,22%** | 18/3.745 → 8/3.632 |

**Enumerasi lengkap 8 kemunculan di badan (bisa dicek satu per satu):**

| Baris | Frasa | Teks |
|---|---|---|
| L7 | `kerja ke Jepang` | "**Kerja ke Jepang** pada 2026 punya tiga jalur resmi: pemagangan, …" |
| L9 | `kerja ke Jepang` | "Coba ketik "**kerja ke Jepang**" di Google. Yang muncul: nomor WhatsApp, …" |
| L83 | `bekerja di Jepang` | "- Bisa **bekerja di Jepang** dengan total **maksimal 5 tahun**." |
| L113 | `lowongan kerja Jepang` | "Mulai dari [**lowongan kerja Jepang** yang sedang dibuka](/loker), …" |
| L290 | `kerja ke Jepang` | `![Diagram enam tahap proses **kerja ke Jepang**: …]` ← **alt text, bukan prosa** |
| L502 | `kerja ke Jepang` | "**Kerja ke Jepang** bukan lotre, tapi juga bukan jalan pintas." |
| L512 | `lowongan kerja Jepang` | "lihat [daftar **lowongan kerja Jepang** terbaru](/loker), …" |
| — | `program kerja Jepang` | **tidak ada sama sekali** |

**Temuan yang harus dibaca apa adanya:** dari 4 kemunculan frasa utama di badan, **satu ada di dalam alt text gambar** (L290). Artinya **prosa yang benar-benar dibaca pengunjung hanya memuat frasa utama 3 kali** di 3.632 kata. Itu bukan "under-optimized" — itu **hampir tidak ada**.

## 1.3 Peta zona kosong — 11 dari 14 H2

| # | H2 | Kata badan | Varian di badan | Status |
|---|---|---|---|---|
| — | Intro + TL;DR | 209 | 2 | ✅ |
| 1 | Ringkasan Cepat | 66 | **0** | ❌ kosong |
| 2 | Apa yang Berubah di 2026 | 111 | **0** | ❌ kosong |
| 3 | Kenapa Banyak Orang Indonesia Memilih… | 131 | **0** | ❌ kosong |
| 4 | Tiga Jalur Resmi | 309 | 3 | ✅ |
| 5 | **Syarat Kerja ke Jepang 2026** | 262 | **0** | ❌ kosong |
| 6 | **Berapa Biaya Kerja ke Jepang?** | 358 | **0** | ❌ kosong |
| 7 | **Berapa Gaji Kerja di Jepang?** | 416 | **0** | ❌ kosong — H2 terbesar |
| 8 | **Berapa Lama Proses Kerja ke Jepang?** | 262 | **0** | ❌ kosong |
| 9 | **Apakah Kerja ke Jepang Aman dan Legal?** | 364 | **0** | ❌ kosong |
| 10 | Bidang Pekerjaan… | 246 | **0** | ❌ kosong |
| 11 | Kerja ke Jepang untuk Lulusan SMA/SMK | 211 | **0** | ❌ kosong |
| 12 | Langkah Mulai dari Nol | 165 | **0** | ❌ kosong |
| 13 | FAQ | 315 | **0** | ❌ kosong (varian hanya di judul H3) |
| 14 | Kesimpulan | 161 | 2 | ✅ |

Draf lama punya **8** zona kosong; final punya **11**. Zona kosong **bertambah 3**, bukan berkurang.

## 1.4 Posisi wajib — semuanya masih terpenuhi

| Posisi | Status | Bukti |
|---|---|---|
| H1 | ✅ | "Panduan **Kerja ke Jepang** 2026: Syarat, Biaya, Gaji, dan Prosesnya" |
| 100 kata pertama | ✅ | L7, kata ke-1 |
| Judul H2 | ✅ **9/14** | di atas ambang 2–3 |
| Paragraf penutup | ✅ | L502 |
| Meta title | ✅ | karakter ke-1 |
| Meta description | ✅ | karakter ke-1 |

Jadi masalahnya **bukan penempatan strategis** — penempatan sudah benar sejak draf pertama. Masalahnya **kepadatan badan yang menyusut**.

---

# 2. TABEL DELTA PER DIMENSI

| Dimensi | Lama | **Baru** | Δ | Alasan satu baris |
|---|---|---|---|---|
| Keyword optimization | 13 | **11** | **−2** | Frasa utama badan 11→4, kepadatan badan 0,29%→0,11%, `program kerja Jepang` tetap 0, zona kosong 8→11 |
| Struktur heading | 12 | **12** | 0 | Hierarki tetap 1/14/48/0 tanpa lompatan, tapi duplikasi TL;DR↔H2-1 utuh dan muncul tumpang tindih H3-Bidang↔H2-SMA/SMK |
| Kedalaman vs kompetitor | 14 | **15** | **+1** | 4.016 kata, 4 tabel, **2 diagram baru**, angka 4 prefektur (¥1.085/1.090/1.104/1.117) yang saya verifikasi benar |
| E-E-A-T / sitasi | 8 | **13** | **+5** | 0→7 hyperlink primer (ISA×4, MHLW, JDIH, K2MI), ¥1.177 benar, atribusi 16-bidang benar, `citation` di schema |
| On-page teknis | 11 | **13** | **+2** | Title 50c front-loaded, desc 146c+CTA, `image`+OG 1200×630, BreadcrumbList konsisten, 2 gambar alt berkeyword, teks FAQ = schema |
| Internal linking | 7 | **8** | **+1** | +1 tautan (`/#penempatan`); tapi 7 target unik saja dan pillar→S1 masih **tidak ada** |
| Kesiapan featured snippet | 3 | **3,5** | **+0,5** | Pembuka H2 Proses tak lagi negatif; tapi 0/14 pembuka di jendela 40–55 kata, 3 H2 query terbesar tetap gagal |
| **TOTAL** | **68** | **75,5** | **+7,5** | |

---

# 3. JUSTIFIKASI SKOR — PER DIMENSI, DENGAN BUKTI

## 3.1 Keyword optimization — 11/20 (turun dari 13)

**Yang naik:** tidak ada.

**Yang turun (bukti terukur):**
1. Frasa utama di badan: **11 → 4** (enumerasi §1.2).
2. Kepadatan badan: **0,29% → 0,11%**.
3. Zona kosong H2: **8 → 11**.
4. `program kerja Jepang` — varian **wajib** menurut brief §1.2 — masih **0 kemunculan**. Ini diminta di P1-4 laporan pertama dan tidak dikerjakan.
5. `magang Jepang` dan `agensi kerja ke Jepang` (dua secondary keyword yang artikel sendiri cantumkan di blok meta L534) juga **0 kemunculan di badan**.

**Yang menahan skor ini tidak lebih rendah:** 9 dari 14 judul H2 memuat varian (tidak berubah, tapi tetap di atas ambang), dan cakupan semantik justru membaik — "upah minimum prefektur", "SSW tipe (i)/(ii)", "COE", "JFT-Basic", "kaigo" tersebar wajar. Mesin pencari menilai relevansi topikal, bukan hanya exact match. Tapi arah metriknya jelas negatif.

**Kenapa 11 dan bukan 13:** dimensi ini mengukur optimasi kata kunci, dan tiga indikator utamanya (kepadatan badan, jumlah kemunculan badan, cakupan varian wajib) semuanya memburuk atau stagnan di nol. Menahan skor di 13 akan berarti menutupi regresi. **Angka 11 mencerminkan keadaan file, bukan niat tim.**

## 3.2 Struktur heading — 12/15 (tetap)

**Yang tetap baik:** H1 tunggal, 14 H2, 48 H3, 0 H4, **nol lompatan level**. Tidak ada H3 yatim. Untuk pillar 4.000 kata, 14 H2 memang wajar.

**Yang tidak berubah dan seharusnya berubah:**
1. **Duplikasi TL;DR ↔ H2-1 masih utuh.** TL;DR (L24–29, 5 poin) dan "Ringkasan Cepat" (L33–41, 5 poin) masih berisi lima poin yang sama. ±90 kata redundan, dan keduanya zona kosong kata kunci. Ini diminta dihapus di P2-1 dan tidak dikerjakan.
2. **Tumpang tindih baru:** H3 "Bidang yang paling cocok untuk lulusan SMA/SMK tanpa pengalaman" (L413–417, di bawah H2 Bidang) dan H2 "Kerja ke Jepang untuk Lulusan SMA/SMK Tanpa Pengalaman" (L421–448) menjawab pertanyaan yang sama, bersebelahan, dalam satu halaman. Pembaca lulusan SMK bertemu dua jawaban berurutan.
3. FAQ H3 "Apakah kerja ke Jepang aman dan legal? Bagaimana cek agensinya?" (L499) masih nyaris kembar dengan H2-9 "Apakah Kerja ke Jepang Aman dan Legal?" (L336). Penambahan "Bagaimana cek agensinya?" sedikit membantu, tapi judulnya masih kembar.

## 3.3 Kedalaman vs kompetitor — 15/15 (naik dari 14, maksimal)

**Bukti konkret:**
- **4.016 kata** (4 tabel + 2 diagram) vs baseline kompetitor est. 600–1.500 kata **[ESTIMASI]** = **2,7–6,7×**.
- **2 diagram baru** dengan alt deskriptif: `timeline-6-tahap.png` (1200×690) dan `gaji-kotor-ke-take-home.png` (1200×560). Keduanya file nyata di `public/img/panduan-kerja-ke-jepang-2026/`.
- **Data prefektur yang tidak dimiliki kompetitor mana pun** (L271): Miyazaki ¥1.085, Kagoshima ¥1.090, Okayama ¥1.104, Nagano ¥1.117. Saya verifikasi aritmetikanya: 1.085×173 = **187.705** ✓, 1.117×173 = **193.241** ✓, dan klaim "5–8% di bawah rata-rata nasional" juga benar (−7,8% s.d. −5,1%) ✓.
- 4 tabel: perbandingan 3 jalur, 9 komponen biaya, simulasi 3 skenario lembur, timeline 6 tahap.
- 7 tanda agensi berbahaya, dasar hukum UU 18/2017, 19 bidang SSW.

Ini dimensi terkuat dan sekarang layak maksimal.

## 3.4 E-E-A-T / sitasi — 13/20 (naik dari 8)

**Dekomposisi supaya jelas apa yang dikreditkan:**

| Sub-faktor | Maks | Lama | **Baru** | Bukti |
|---|---|---|---|---|
| Sumber & mekanisme sitasi | 7 | **0** | **6** | 7 hyperlink primer: `ssw.go.jp/en/about/visa/` ×2 (L114, L405), `ssw.go.jp/en/about/step/` ×2 (L114, L312), `mhlw.go.jp/…/minimumichiran/` (L273), `jdih.bp2mi.go.id` + `kp2mi.go.id` (L355). Plus `citation[]` di schema |
| Akurasi fakta | 6 | **5** | **6** | ¥1.177 di 7 lokasi ✓; atribusi "16 bidang" kini benar (L50, L405); lembur 25% dinaikkan jadi fakta hukum (L252) |
| Kepengarangan / akuntabilitas | 4 | **0** | **0** | Nol "Penulis", nol "Ditinjau", nol nama manusia. Schema `author` = Organization saja |
| Metodologi & keterverifikasian | 2 | **0,5** | **1** | "diakses Oktober 2026" ×3; derivasi prefektur ditampilkan. **Tapi 173 jam masih tanpa derivasi** |
| Transparansi & koreksi | 1 | **0,5** | **0** | Tidak ada changelog, tidak ada kebijakan koreksi |
| **Total** | **20** | **6→** | **13** | |

**Yang benar-benar menaikkan sinyal (bukan kosmetik) — sudah dikerjakan:**
1. **Hyperlink ke sumber primer.** Ini bukan hiasan: artikel ini menjual klaim "kami sebut angka", dan angka yang bisa diklik ke PDF MHLW adalah bukti, bukan janji. Lompatan 0→7 tautan adalah satu-satunya alasan E-E-A-T naik 5 poin.
2. **Atribusi "16 vs 19 bidang" yang jujur.** Draf lama menyiratkan dua lembaga berbeda; final menulis "Halaman ISA yang sama masih menampilkan 16 bidang" (L50). Ini bukti penulis benar-benar membuka dua halaman ISA — sinyal keahlian yang tidak bisa dipalsukan.
3. **Lembur 25% sebagai tarif minimum hukum**, bukan asumsi (L252). Mengubah asumsi menjadi fakta bersumber.
4. **`citation[]` di JSON-LD** — mesin bisa membaca sumbernya tanpa scraping.

**Yang masih kosong — ini celah 7 poin yang tersisa:**
1. **Tidak ada penulis bernama.** Untuk topik yang menyentuh uang dan legalitas, "siapa yang bertanggung jawab atas angka ini" adalah pertanyaan pertama reviewer kualitas.
2. **Tidak ada peninjau.** Tidak ada nama kedua yang memverifikasi angka ISA/MHLW.
3. **Tidak ada blok metodologi.** Artikel menyebut angka tapi tidak pernah menyatakan *bagaimana* angka itu diperoleh dan apa yang sengaja tidak diklaim.
4. **173 jam masih tanpa derivasi** (L240: "Dengan asumsi 173 jam kerja per bulan"). Semua angka gaji bergantung pada asumsi ini, dan pembaca tidak bisa memverifikasinya.
5. **Mekanisme rata-rata tertimbang masih belum dijelaskan** (lihat §4, item U6) — risiko kontradiksi yang sudah ditandai laporan pertama masih hidup.
6. **Tidak ada kebijakan koreksi / changelog.**

## 3.5 On-page teknis — 13/15 (naik dari 11)

**Bukti konkret yang berhasil:**

| Elemen | Status | Bukti |
|---|---|---|
| Meta title | ✅ **50 karakter**, frasa utama di **karakter ke-1** | "Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Proses" |
| Meta description | ✅ **146 karakter**, CTA + 2 angka konkret | "…timeline 6 tahap, dan 7 tanda agensi tidak resmi. Cek dulu sebelum bayar." |
| Slug | ✅ 34 char, root-level, konsisten dengan schema | `/panduan-kerja-ke-jepang-2026` — masalah `/blog` 404 **terselesaikan dengan benar** |
| `image` frontmatter | ✅ ada, file nyata, **1200×630** (saya cek header PNG) | `/og/panduan-kerja-ke-jepang-2026.png` |
| `image_alt` | ✅ memuat frasa utama | "Panduan Kerja ke Jepang 2026 — syarat, biaya, gaji, dan proses" |
| `schema` array | ✅ `["Article","FAQPage","BreadcrumbList"]` | + BreadcrumbList ditambahkan |
| `datePublished`/`dateModified` | ✅ ada di JSON-LD | `2026-10-22` |
| Gambar badan | ✅ **2**, keduanya 1200px, alt berkeyword | `timeline-6-tahap.png`, `gaji-kotor-ke-take-home.png` |
| Teks FAQ = `acceptedAnswer` | ✅ **identik** | Saya bandingkan Q1–Q8 schema vs L475–505: cocok, termasuk Q2 yang di laporan pertama disesuaikan ke ¥1.177 |
| Breadcrumb konsisten | ✅ 2 level, `@id` cocok dengan slug | Beranda → Panduan (tanpa crumb "Blog" yang 404) |

**Deduksi 2 poin:**
1. **−1,5 — Artikel dan skema belum ter-wire ke build.** Saya cek: **tidak ada** `src/pages/panduan-kerja-ke-jepang-2026.astro`, **tidak ada** content collection, dan string `schema-panduan-kerja-ke-jepang-2026` **tidak direferensikan di mana pun** dalam `src/`. `BaseLayout.astro` hanya menyuntik `orgJsonLd` (Organization). Artinya: semua perbaikan on-page di atas, sejauh menyangkut SERP, **belum menghasilkan apa pun** sampai ada route + injeksi skema. Lihat U13 — ini keputusan team-lead, bukan pekerjaan penulis.
2. **−0,5 — `headline` di schema ≠ H1.** JSON-LD `headline` = "Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Proses" (yaitu meta title), sedangkan H1 = "Panduan Kerja ke Jepang 2026: Syarat, Biaya, Gaji, dan Prosesnya". Google menyarankan `headline` dekat dengan H1.

## 3.6 Internal linking — 8/10 (naik dari 7)

**8 tautan internal, semua anchor deskriptif, nol "klik di sini":**

| # | Baris | Target | Anchor |
|---|---|---|---|
| 1 | L122 | `/loker` | "lowongan kerja Jepang yang sedang dibuka" |
| 2 | L145 | `/siswa-baru` | "pendaftaran siswa pelatihan bahasa Jepang" |
| 3 | L191 | `/#program` | "bagian program dan biaya di beranda ASJ" |
| 4 | L375 | `/` | "profil dan legalitas PT Amanah Sakura Japan" |
| 5 | L389 | `/#penempatan` | "penempatan ASJ per prefektur" ← **baru** |
| 6 | L433 | `/ai-cv` | "buat CV bahasa Jepang dengan bantuan AI" |
| 7 | L469 | `/apply` | "formulir lamaran kerja" |
| 8 | L521 | `/loker` | "daftar lowongan kerja Jepang terbaru" |

**Deduksi 2 poin — tiga alasan yang masih berdiri:**
1. **Hanya 7 target unik** untuk 4.000 kata (1 tautan per ±570 kata). Untuk halaman pillar yang seharusnya jadi hub klaster, ini tipis. Dua tautan menuju `/#program` dan `/#penempatan` sama-sama halaman `/`, ditambah L375 ke `/` — jadi **3 dari 8 tautan mengalir ke beranda**, bukan ke halaman klaster.
2. **Tidak ada tautan pillar → artikel S1.** S1 (`/cara-daftar-kerja-ke-jepang-2026`) sudah menautkan **ke** pillar di L18-nya, tapi pillar **tidak menautkan balik**. Ini tautan satu arah, dan ini kesempatan termurah di seluruh laporan.
3. **Anchor `/siswa-baru` tidak diperbaiki.** Laporan pertama (P1-8) meminta diganti jadi "kelas bahasa Jepang dari dasar". Masih "pendaftaran siswa pelatihan bahasa Jepang". Ironisnya, S1 **sudah** memakai "kelas bahasa Jepang dari dasar" untuk URL yang sama (S1 L234) — jadi sekarang dua halaman memakai dua anchor berbeda untuk satu target.

## 3.7 Kesiapan featured snippet — 3,5/5 (naik dari 3)

**Pengukuran jendela 40–55 kata.** Saya ukur paragraf pertama setiap H2:

| # | H2 | Kata pembuka | Di jendela 40–55? |
|---|---|---|---|
| 1 | Ringkasan Cepat | 8 | ❌ |
| 2 | Apa yang Berubah | 8 | ❌ |
| 3 | Kenapa Memilih | 7 | ❌ |
| 4 | Tiga Jalur Resmi | 12 | ❌ |
| 5 | **Syarat** | **14** | ❌ |
| 6 | **Berapa Biaya** | **26** | ❌ |
| 7 | **Berapa Gaji** | **15** | ❌ |
| 8 | **Berapa Lama Proses** | **20** | ❌ |
| 9 | **Aman & Legal** | **20** | ❌ |
| 10 | **Bidang** | **20** | ❌ |
| 11 | **SMA/SMK** | **29** | ❌ |
| 12 | Checklist | 18 | ❌ |
| 14 | Kesimpulan | 15 | ❌ |

**0 dari 14 H2 punya pembuka di jendela 40–55 kata.** Semua pembuka 7–29 kata. Ini bukan bencana — Google sering menggabungkan dua blok pertama — tapi artinya **tidak ada satu pun paragraf yang sengaja disiapkan** untuk direbut.

**Penilaian 8 H2 berbentuk query (yang benar-benar diperebutkan di SERP):**

| H2 query | Menjawab langsung? | Penilaian |
|---|---|---|
| Apakah Kerja ke Jepang Aman dan Legal? | ✅ "Ya — asalkan lewat jalur resmi dan lembaga berizin." | **LULUS** — pola "Ya + syarat" |
| Kerja ke Jepang untuk Lulusan SMA/SMK | ✅ "Bisa. Lulusan SMA/SMK tanpa pengalaman formal tetap punya jalur, asalkan…" | **LULUS** |
| Tiga Jalur Resmi | ⚠️ sebut pembeda, **tidak sebut nama 3 jalur** | SEBAGIAN |
| Berapa Lama Proses | ⚠️ "Alurnya enam tahap" (jumlahnya ada) tapi kalimat pertama masih penyangkalan, **tanpa durasi** | SEBAGIAN — **naik dari GAGAL** |
| Bidang Pekerjaan | ⚠️ generik, **tidak sebut nama bidang** | SEBAGIAN |
| **Syarat Kerja ke Jepang 2026** | ❌ "Syarat administratif paling mudah. Syarat fisik yang paling sering menggagalkan…" — **nol syarat disebut** | **GAGAL** |
| **Berapa Biaya Kerja ke Jepang?** | ❌ "Tanya "berapa biayanya?" dan jawaban jujurnya: tergantung komponennya." — **nol rupiah** | **GAGAL** |
| **Berapa Gaji Kerja di Jepang?** | ❌ "Gaji di Jepang dihitung dari upah per jam." — **nol yen** | **GAGAL** |

**Skor 2 LULUS / 3 SEBAGIAN / 3 GAGAL** (sebelumnya 5 langsung / 8 sebagian / 2 gagal pada 13 H2 — tapi komposisi query-nya sekarang lebih jelas).

**Yang naik (+0,5):** pembuka H2 Proses tidak lagi dibuka dengan "Tidak ada satu angka tunggal" — perbaikan P1-2 berhasil sebagian. Plus data prefektur membuat bagian Gaji punya bahan tabel-snippet baru.

**Yang menahan (+1,5 hilang):** list 7 syarat terkonsolidasi **tidak pernah ditambahkan** (P1-1), padahal "syarat kerja ke Jepang" adalah query berintensi tinggi dengan jawaban berbentuk list. Tanpa blok itu, target list-snippet brief §1.5 tidak mungkin direbut. Dan tiga H2 query terbesar masih gagal menjawab.

---

# 4. DAFTAR UPGRADE BERURUTAN POIN-PER-USAHA

Diurutkan **bukan** berdasarkan poin mentah, tapi **poin ÷ usaha**. Item teratas memberi poin terbanyak untuk menit tersedikit.

| Rank | Item | Dimensi | Poin | Usaha | Poin/usaha | Blocker? |
|---|---|---|---|---|---|---|
| **U1** | 7 sisipan frasa di zona kosong | Keyword | **+2,5** | **Kecil** | ★★★★★ | Tidak |
| **U2** | Syarat: lead-in + list 7 item | Snippet + Struktur + KW | **+2,5** | **Kecil** | ★★★★★ | Tidak |
| **U3** | Pembuka Biaya → angka | Snippet + KW | **+1,5** | **Kecil** | ★★★★★ | Tidak |
| **U4** | Pembuka Gaji → angka | Snippet + KW | **+1,5** | **Kecil** | ★★★★★ | Tidak |
| **U5** | Derivasi 173 jam | E-E-A-T | **+0,5** | **Trivial** | ★★★★★ | Tidak |
| **U6** | Tautan pillar → S1 | Internal | **+1,0** | **Trivial** | ★★★★★ | Tidak |
| **U7** | Anchor `/siswa-baru` | Internal | **+0,5** | **Trivial** | ★★★★★ | Tidak |
| **U8** | `headline` = H1 di schema | On-page | **+0,5** | **Trivial** | ★★★★★ | Tidak |
| **U9** | Hapus duplikasi TL;DR ↔ H2-1 | Struktur | **+1,0** | **Kecil** | ★★★★☆ | Perlu keputusan |
| **U10** | Jelaskan rata-rata tertimbang | E-E-A-T | **+1,0** | **Kecil** | ★★★★☆ | Tidak |
| **U11** | Blok E-E-A-T: penulis + peninjau + metodologi + koreksi | E-E-A-T | **+4,0** | **Sedang** | ★★★☆☆ | Perlu data nyata |
| **U12** | Rekonsiliasi H3-Bidang ↔ H2-SMA/SMK | Struktur | **+1,0** | **Sedang** | ★★☆☆☆ | Tidak |
| **U13** | Wire artikel + skema ke build | On-page | **+1,5** | **Besar** | ★☆☆☆☆ | **Ya — keputusan team-lead** |

**Total poin tersedia dari U1–U12: ±16, dengan batas dimensi → perkiraan skor akhir ±91/100.**

---

## U1 — Isi 7 zona kosong dengan frasa kunci (dosis tepat)

**Dimensi:** Keyword (+2,5 → 11 menjadi 13,5)
**Usaha:** Kecil — 7 suntingan satu kalimat, **tanpa menambah paragraf**
**Kenapa nomor 1:** regresi terbesar di laporan ini, dan paling murah diperbaiki. Setiap sisipan juga memperbaiki pembuka H2 yang datar.

| # | Lokasi | Teks sekarang (persis) | Teks pengganti |
|---|---|---|---|
| U1a | **L35** (H2 Ringkasan Cepat) | `Dua menit cukup untuk memutuskan: lanjut atau tidak.` | `Dua menit cukup untuk memutuskan: lanjut atau tidak. Lima poin soal **kerja ke Jepang** yang paling sering ditanyakan, dijawab singkat.` |
| U1b | **L47** (H2 Apa yang Berubah) | `Empat perubahan di 2026 membuat artikel lama jadi menyesatkan.` | `Empat perubahan di 2026 membuat cara menghitung **kerja ke Jepang** berbeda dari tahun lalu — dan artikel lama jadi menyesatkan.` |
| U1c | **L60** (H2 Kenapa Memilih) | `Alasannya berlapis, dan tidak semuanya soal uang.` | `Alasan orang Indonesia memilih **bekerja di Jepang** berlapis, dan tidak semuanya soal uang.` |
| U1d | **L128** (H2 Syarat) | `Syarat administratif paling mudah. Syarat fisik yang paling sering menggagalkan — dan paling jarang dibahas.` | `Syarat **kerja ke Jepang** terbagi tiga: administratif, bahasa, dan fisik. Yang administratif paling mudah; yang fisik paling sering menggagalkan — dan paling jarang dibahas.` |
| U1e | **L191** (H3 contoh biaya) | `Contoh konkret: biaya program ASJ **Rp 6.000.000**, bisa dicicil, termasuk modul dan kamus, seragam, asrama, serta ujian JFT dan SSW masing-masing satu kali.` | `Contoh konkret **program kerja Jepang** di ASJ: **Rp 6.000.000**, bisa dicicil, termasuk modul dan kamus, seragam, asrama, serta ujian JFT dan SSW masing-masing satu kali.` ← **satu-satunya tempat `program kerja Jepang` masuk secara wajar** |
| U1f | **L387** (H2 Bidang) | `Bidang yang paling banyak menyerap pekerja Indonesia ada di sektor yang kekurangan tenaga kerja. Daftarnya berubah, jadi cek yang terbaru.` | `Bidang yang dibuka untuk **kerja ke Jepang** berubah tiap tahun. Yang paling banyak menyerap pekerja Indonesia ada di sektor yang kekurangan tenaga kerja — cek **lowongan kerja Jepang** yang masih aktif sebelum memilih.` |
| U1g | **L454** (H2 Checklist) | `Dalam 30 hari pertama, kamu tidak perlu menyelesaikan semuanya. Yang perlu: informasi benar dan lembaga terverifikasi, sebelum uang keluar.` | `Dalam 30 hari pertama, kamu belum perlu menyelesaikan seluruh proses **kerja ke Jepang**. Yang perlu: informasi benar dan lembaga terverifikasi, sebelum uang keluar.` |

**Hasil terukur setelah U1:** frasa utama badan **4 → 10** (kepadatan badan 0,11% → 0,28%), semua varian badan **8 → 17** (0,22% → 0,47%), `program kerja Jepang` **0 → 1**.

**Jangan lebih dari ini.** Menambah 10 sisipan lagi akan mendorong frasa 3 kata ke wilayah yang terasa dipaksakan dalam bahasa Indonesia. Kalau ingin `program kerja Jepang` muncul 2×, sisipkan sekali lagi di L173 pembuka H2 Biaya — lihat U3.

---

## U2 — Syarat: lead-in + list 7 item terkonsolidasi

**Dimensi:** Snippet (+1,5) + Struktur (+0,5) + Keyword (+0,5) = **+2,5**
**Usaha:** Kecil — satu blok, 9 baris
**Kenapa nomor 2:** "syarat kerja ke Jepang 2026" adalah query dengan jawaban berbentuk list. Artikel ini punya **semua** isinya, tersebar di 5 H3, dan karena itu tidak bisa diekstrak. Ini kegagalan struktural yang murni mekanis.

**Lokasi:** tepat setelah **L128**, sebelum H3 "Syarat umum" di L130.
**Teks sekarang (L128):** `Syarat administratif paling mudah. Syarat fisik yang paling sering menggagalkan — dan paling jarang dibahas.`

**Ganti L128 dengan blok berikut (lead-in + list + jembatan):**

```markdown
Syarat **kerja ke Jepang** terbagi tiga: administratif, bahasa, dan fisik. Tujuh syarat inti yang harus kamu penuhi:

1. **Usia** sesuai ketentuan jalur — program ASJ: 18–28 tahun.
2. **Pendidikan** minimal SMA/SMK sederajat.
3. **Uji keterampilan** lulus di bidang yang dilamar.
4. **Bahasa** JFT-Basic level A2 atau JLPT N4 ke atas.
5. **Kesehatan** sehat jasmani dan rohani, bebas TBC.
6. **Fisik** tidak bertato dan tidak bertindik.
7. **Dokumen** KTP, KK, akta lahir, ijazah, paspor, surat izin orang tua.

Rincian tiap syarat ada di bagian berikutnya. Yang administratif paling mudah; yang fisik paling sering menggagalkan — dan paling jarang dibahas.
```

**Kenapa ini bekerja:**
- 7 item, semuanya **<15 kata** (syarat list snippet).
- Setiap item dibuka kata kunci tebal → mudah diekstrak sebagai `<li>`.
- Tidak menduplikasi isi 5 H3 di bawahnya — hanya meringkas, lalu menjembatani.
- Kalimat penutup mempertahankan nada tegas asli artikel.

---

## U3 — Pembuka H2 Biaya: masukkan angka

**Dimensi:** Snippet (+0,75) + Keyword (+0,75) = **+1,5**
**Usaha:** Kecil — ganti 2 kalimat

**Lokasi:** **L173**
**Teks sekarang (persis):**
> `Tanya "berapa biayanya?" dan jawaban jujurnya: tergantung komponennya. **Biaya yang wajar selalu bisa dijelaskan baris per baris** — satu angka besar tanpa rincian adalah tanda bahaya pertama.`

**Ganti dengan (52 kata — di jendela 40–55):**
> Biaya **program kerja Jepang** lewat LPK terdiri dari sembilan komponen: pelatihan bahasa, asrama, seragam dan modul, ujian JFT-Basic dan uji keterampilan, medical check-up, paspor, visa, tiket, dan biaya jasa lembaga. Totalnya berbeda per lembaga dan per jalur, jadi tidak ada satu angka universal — sebagai contoh konkret, biaya program ASJ **Rp 6.000.000** dan bisa dicicil. **Biaya yang wajar selalu bisa dijelaskan baris per baris** — satu angka besar tanpa rincian adalah tanda bahaya pertama.

**Kenapa:**
- "sembilan komponen" **konsisten persis** dengan tabel di bawahnya (9 baris) — konsistensi internal adalah sinyal snippet kuat.
- Menyebut Rp 6.000.000 berlabel contoh → menjawab "berapa" tanpa mengklaim universal.
- Mempertahankan kalimat penutup bernada tegas (diferensiasi artikel).
- Sekaligus menaikkan `program kerja Jepang` 1 → 2.

---

## U4 — Pembuka H2 Gaji: masukkan angka

**Dimensi:** Snippet (+0,75) + Keyword (+0,75) = **+1,5**
**Usaha:** Kecil — ganti 2 kalimat

**Lokasi:** **L226**
**Teks sekarang (persis):**
> `Gaji di Jepang dihitung dari upah per jam. Angka bulanan di internet sering tanpa sumber.`

**Ganti dengan (51 kata):**
> Gaji **kerja di Jepang** dihitung dari upah per jam, dan angka bulanan di internet sering tanpa sumber. Rata-rata nasional tertimbang 2026 adalah **¥1.177 per jam**; dengan 173 jam/bulan, gaji kotor dasar sekitar **¥203.621**, dan take-home setelah pajak, asuransi sosial, serta asrama sekitar **¥148.078**. Angka per prefektur berbeda — di prefektur tujuan ASJ, gaji kotor berkisar **¥187.705–193.241**.

**Kenapa:**
- Empat angka dalam 51 kata, semuanya sudah ada di artikel dan sudah diverifikasi — nol klaim baru.
- Menjawab "berapa gaji" langsung, bukan memberi prinsip.
- Menutup risiko pembaca yang cuma membaca 40 kata pertama lalu menyimpulkan artikelnya tidak menjawab.

---

## U5 — Derivasi 173 jam

**Dimensi:** E-E-A-T (+0,5)
**Usaha:** Trivial — satu frasa

**Lokasi:** **L240**
**Teks sekarang (persis):**
> `Dengan asumsi 173 jam kerja per bulan: **¥1.177 × 173 = ¥203.621** (gaji kotor dasar, sebelum lembur).`

**Ganti dengan:**
> Dengan asumsi **173 jam kerja per bulan — aritmetika sederhana dari 40 jam × 4,33 minggu**: **¥1.177 × 173 = ¥203.621** (gaji kotor dasar, sebelum lembur).

**Kenapa ini bukan kosmetik:** setiap angka gaji di artikel bergantung pada asumsi ini, dan pembaca bisa memverifikasi 40×4,33 sendiri. Kata "asumsi standar" sudah hilang, tapi derivasinya belum ada. Satu frasa menutup celah keterverifikasian terbesar di bagian gaji.

---

## U6 — Tautan pillar → S1 (dua arah)

**Dimensi:** Internal (+1,0)
**Usaha:** Trivial — satu kalimat

**Lokasi:** **L469**, setelah `Langkah 12 bisa dimulai lewat [formulir lamaran kerja](/apply) setelah langkah 1–5 selesai. Jangan balik urutannya.`

**Tambahkan satu kalimat:**
> Urutan pendaftaran, dokumen yang diminta, dan dua formulir yang sering tertukar dijelaskan terpisah di [cara daftar kerja ke Jepang 2026](/cara-daftar-kerja-ke-jepang-2026).

**Kenapa ini item termurah dengan hasil tertinggi:** S1 sudah menautkan ke pillar (L18 S1), tapi pillar tidak menautkan balik. Tautan satu arah melemahkan klaster dan membuat pillar tidak berfungsi sebagai hub. Satu kalimat menutup dua masalah: tautan timbal balik **dan** kanibalisasi (lihat §5.3).

---

## U7 — Perbaiki anchor `/siswa-baru`

**Dimensi:** Internal (+0,5)
**Usaha:** Trivial

**Lokasi:** **L145**
**Teks sekarang:**
> `Bagi yang belum pernah belajar bahasa Jepang, mulailah dari kelas dasar lewat [pendaftaran siswa pelatihan bahasa Jepang](/siswa-baru).`

**Ganti anchor menjadi:**
> `Bagi yang belum pernah belajar bahasa Jepang, mulailah dari kelas dasar lewat [kelas bahasa Jepang dari dasar](/siswa-baru).`

**Kenapa:** anchor sekarang mendeskripsikan *nama halaman tujuan*; anchor baru mencocokkan *niat pencarian*. Dan S1 sudah memakai bentuk ini (S1 L234) — jadi ini juga menyeragamkan sinyal untuk satu URL.

---

## U8 — `headline` di schema = H1

**Dimensi:** On-page (+0,5)
**Usaha:** Trivial — satu string

**Lokasi:** `final/schema-panduan-kerja-ke-jepang-2026.jsonld` **baris 7**
**Sekarang:** `"headline": "Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Proses"`
**Ganti dengan:** `"headline": "Panduan Kerja ke Jepang 2026: Syarat, Biaya, Gaji, dan Prosesnya"`

**Kenapa:** Google membandingkan `headline` dengan H1 yang dirender. Yang sekarang adalah meta title, bukan judul halaman. Ini bukan pelanggaran, tapi melemahkan konsistensi sinyal.

---

## U9 — Hapus duplikasi TL;DR ↔ H2-1

**Dimensi:** Struktur (+1,0)
**Usaha:** Kecil — hapus 6 baris
**Catatan:** rekomendasi ini **berbeda arah** dari laporan pertama, dan saya jelaskan alasannya.

**Laporan pertama menyarankan:** pertahankan TL;DR, hapus H2-1.
**Saya sekarang menyarankan sebaliknya:** **hapus TL;DR (L24–29), pertahankan H2-1.**

**Alasan berubah:**
1. H2-1 ("Ringkasan Cepat: Kerja ke Jepang dalam 5 Poin") **membawa frasa utama di judul heading** — aset relevansi yang hilang kalau H2-nya dihapus.
2. H2-1 adalah badan yang bisa di-crawl; TL;DR adalah blockquote yang menduplikasinya.
3. Intro sudah punya **tiga** ringkasan: "Yang akan kamu dapat" (L22), TL;DR (L24–29), lalu H2-1 (L33–41). Yang paling lemah adalah TL;DR karena ia mendahului daftar yang identik 4 baris kemudian.
4. Menghapus TL;DR menghilangkan **satu zona kosong kata kunci** (L24–29 tidak memuat varian), sementara mempertahankan H2-1 mempertahankan heading berkeyword.

**Teks yang dihapus (L24–29, persis):**
```markdown
> **TL;DR — 5 poin kalau kamu cuma punya 1 menit**
> - **Tiga jalur resmi:** pemagangan (belajar sambil kerja), SSW tipe i (maksimal 5 tahun, tanpa keluarga), SSW tipe ii (tanpa batas masa tinggal, boleh bawa keluarga).
> - **Syarat inti:** usia sesuai ketentuan lembaga (ASJ: 18–28), minimal SMA/SMK, lulus uji keterampilan bidang, dan JFT-Basic A2 atau JLPT N4.
> - **Biaya:** berkomponen, bukan satu angka. Contoh program ASJ: Rp 6.000.000, bisa dicicil.
> - **Gaji:** dasar upah per jam. Rata-rata nasional tertimbang 2026 sekitar ¥1.177/jam; take-home selalu lebih kecil dari gaji kotor.
> - **Durasi:** tidak ada angka tunggal. COE saja butuh 1–3 bulan, dan itu baru satu dari enam tahap.
```

**Trade-off yang harus team-lead sadari:** TL;DR di atas lipatan punya nilai CTR/engagement. Kalau tim memutuskan TL;DR lebih berharga, **hapus H2-1 saja** dan pindahkan fungsi list-nya ke H2 Syarat (yang memang akan menerima list di U2). Yang **tidak boleh** adalah membiarkan keduanya — itu ±90 kata yang tidak memberi apa pun.

---

## U10 — Jelaskan mekanisme rata-rata tertimbang

**Dimensi:** E-E-A-T (+1,0)
**Usaha:** Kecil — satu kalimat
**Kenapa masih perlu:** laporan pertama menandai ini sebagai **syarat**, bukan catatan pinggir: keempat prefektur tujuan ASJ (¥1.085–¥1.117) semuanya **di bawah** rata-rata nasional (¥1.177). Pembaca yang melihat keduanya akan menyimpulkan artikel salah hitung.

**Lokasi:** **L271**, sebelum kalimat `**Kalau kamu ditempatkan di prefektur tujuan ASJ, angkanya lebih rendah.**`
**Sisipkan satu kalimat:**
> Angka ¥1.177 adalah **rata-rata nasional tertimbang** — dihitung dengan bobot jumlah pekerja, sehingga prefektur berpenduduk besar seperti Tokyo (¥1.280) dan Kanagawa (¥1.279) menarik rata-rata ke atas. Konsekuensinya, **sebagian besar prefektur justru berada di bawah ¥1.177**, termasuk keempat prefektur tujuan ASJ di bawah ini. Rata-rata nasional bukan angka yang kamu terima: upah minimum yang berlaku untukmu adalah **angka prefektur tempat kamu bekerja**.

**Kenapa ini menaikkan E-E-A-T, bukan kosmetik:** artikel saat ini menyebut "sekitar 5–8% di bawah rata-rata nasional" tanpa menjelaskan mekanismenya. Menjelaskan *mengapa* selisih itu ada mengubah klaim menjadi pemahaman, dan pembaca yang paham konsep rata-rata tertimbang akan memercayai seluruh angka lain di halaman.

---

## U11 — Blok E-E-A-T: penulis, peninjau, metodologi, koreksi

**Dimensi:** E-E-A-T (+4,0 → 13 menjadi 17)
**Usaha:** Sedang — ±45 menit, **butuh data nyata dari team-lead**

> ⚠️ **Syarat mutlak:** semua nama, jabatan, dan kredensial di bawah harus **benar**. Kalau tidak ada nama yang bisa dipakai, **jangan pasang blok ini** — blok kosong atau nama generik tidak menaikkan E-E-A-T sama sekali (lihat daftar kosmetik di §4.1). Ini bukan bagian yang boleh dikarang.

**A. Blok penulis + peninjau** — sisipkan setelah L14 (`**Terakhir diperbarui: Oktober 2026**`):

```markdown
**Ditulis oleh:** [NAMA], [JABATAN] di PT Amanah Sakura Japan.
**Ditinjau oleh:** [NAMA KEDUA], [JABATAN] — memverifikasi angka ISA dan MHLW di artikel ini.
**Terakhir diperbarui:** Oktober 2026
```

**Kenapa menaikkan sinyal:** dua nama berbeda (penulis ≠ peninjau) adalah bukti adanya proses editorial. Satu nama saja sudah membantu; dua nama lebih kuat. Untuk topik yang menyentuh biaya dan legalitas, "siapa yang bertanggung jawab" adalah pertanyaan pertama.

**B. Blok metodologi** — sisipkan sebagai H2 baru **sebelum** "Pertanyaan yang Sering Ditanyakan", atau sebagai sub-bagian di akhir Kesimpulan:

```markdown
## Bagaimana Angka di Artikel Ini Diperoleh

Angka upah di artikel ini diambil dari daftar resmi Kementerian Kesehatan, Tenaga Kerja, dan Kesejahteraan Jepang (MHLW) untuk tahun fiskal 2026, diakses Oktober 2026. Ketentuan jalur, bidang, dan masa tinggal diambil dari halaman resmi Immigration Services Agency of Japan (ISA). Simulasi gaji memakai aritmetika terbuka: upah per jam × 173 jam (40 jam × 4,33 minggu), dengan potongan pajak dan asuransi 15% sebagai **ilustrasi**, bukan tarif.

**Yang tidak kami klaim:** jumlah mitra, jumlah kandidat, jumlah keberangkatan, dan hasil kelulusan. Kami juga tidak menjanjikan gaji tertentu atau keberangkatan dalam tenggat tertentu. Angka di sini bisa berubah — kalau berubah, halaman ini diperbarui dan tanggalnya diganti.
```

**Kenapa ini item E-E-A-T paling bernilai:** diferensiasi seluruh artikel adalah *"kami sebut angkanya"*. Blok metodologi adalah satu-satunya tempat yang menjelaskan **bagaimana** angka itu diperoleh dan **apa yang sengaja tidak diklaim**. Tanpa blok ini, klaim transparansi hanya pernyataan; dengan blok ini, klaim itu bisa diperiksa.

**C. Changelog / kebijakan koreksi** — sisipkan tepat sebelum footer `*Artikel ini diperbarui Oktober 2026…*` (L525):

```markdown
**Riwayat perubahan:** 22 Oktober 2026 — angka upah minimum diperbarui ke ¥1.177/jam (MHLW, 令和8年度); atribusi daftar bidang ISA diperbaiki; simulasi gaji dihitung ulang. Kalau kamu menemukan angka yang tidak sesuai sumbernya, laporkan lewat [formulir kontak](/apply) — koreksi dicatat di baris ini.
```

**Kenapa menaikkan sinyal:** changelog yang menyebut **apa** yang diubah (bukan hanya tanggal) adalah bukti pemeliharaan. Ini juga menutup risiko: artikel yang mengklaim "daftar bidang berubah tiap tahun" tapi tidak punya riwayat perubahan terlihat seperti konten sekali-tempel.

**D. Schema: `author` jadi `Person` + `reviewedBy`** — setelah A tersedia, ubah `schema-panduan-kerja-ke-jepang-2026.jsonld` L15–19:

```json
"author": {
  "@type": "Person",
  "name": "[NAMA PENULIS]",
  "jobTitle": "[JABATAN]",
  "worksFor": { "@type": "Organization", "name": "PT Amanah Sakura Japan" }
},
"reviewedBy": {
  "@type": "Person",
  "name": "[NAMA PENINJAU]",
  "jobTitle": "[JABATAN]"
},
```

### 4.1 Mana yang benar-benar menaikkan sinyal, mana yang kosmetik

Ini yang diminta secara eksplisit, jadi saya pisahkan tegas.

**✅ Benar-benar menaikkan sinyal (kerjakan):**

| Item | Kenapa nyata |
|---|---|
| Penulis bernama + jabatan | Menciptakan akuntabilitas yang bisa ditelusuri ke satu orang |
| Peninjau berbeda dari penulis | Membuktikan ada proses editorial, bukan satu orang menulis sendiri |
| Blok metodologi | Menjelaskan asal angka + apa yang tidak diklaim — bisa diverifikasi pembaca |
| Changelog yang menyebut apa yang diubah | Bukti pemeliharaan, bukan sekadar tanggal tempel |
| Derivasi 173 jam (U5) | Membuat aritmetika bisa dicek dengan kalkulator |
| Penjelasan rata-rata tertimbang (U10) | Menutup kontradiksi-yang-terlihat sebelum kompetitor memakainya |
| Daftar sumber bertanggal di akhir artikel | Reviewer bisa memeriksa 5–6 URL sekaligus, bukan mencari di badan teks |
| `author` sebagai `Person` + `reviewedBy` di schema | Sinyal mesin-baca untuk kepengarangan |
| Pernyataan limitasi eksplisit ("yang tidak kami klaim") | Menunjukkan kehati-hatian, bukan kelemahan |

**❌ Kosmetik — jangan buang waktu (dan beberapa berisiko):**

| Item | Kenapa kosmetik / berisiko |
|---|---|
| Byline generik "Tim Redaksi ASJ" | Tanpa nama, tidak ada akuntabilitas. Nol kenaikan sinyal |
| Foto penulis tanpa kredensial | Hiasan. Yang dinilai kredensial, bukan wajah |
| "Diperiksa oleh ahli bersertifikat" tanpa nama ahli | Klaim tanpa subjek — justru menurunkan kepercayaan kalau ketahuan |
| Rating bintang / `AggregateRating` tanpa ulasan nyata | Melanggar pedoman structured data. **Jangan** |
| `sameAs` ke media sosial yang tidak membuktikan keahlian | Menambah entitas tanpa menambah otoritas |
| Badge "waktu baca 12 menit" / jumlah kata | Tidak dinilai mesin pencari |
| `speakable` schema | Tidak relevan untuk tipe query ini **[ESTIMASI]** |
| Menambah kata "berpengalaman", "terpercaya", "profesional" | Kata sifat tanpa bukti. Nol dampak |
| Disclaimer hukum panjang tanpa isi | Menambah kata, bukan kepercayaan |

---

## U12 — Rekonsiliasi H3-Bidang ↔ H2-SMA/SMK

**Dimensi:** Struktur (+1,0)
**Usaha:** Sedang

**Lokasi:** H3 **L413–417** di bawah H2 Bidang, vs H2 **L421–448**.

**Teks sekarang (L413–417):**
> `### Bidang yang paling cocok untuk lulusan SMA/SMK tanpa pengalaman`
> `Kalau kamu lulusan SMA/SMK tanpa pengalaman, empat bidang ini paling terbuka: **kaigo** (permintaan tinggi, tapi butuh ujian bahasa tambahan), **pengolahan makanan**, **pertanian dan peternakan**, dan **restoran** — hanya jika aplikasi baru dibuka kembali.`
> `Jangan memilih bidang karena "katanya gampang". Bidang yang tidak cocok dengan kondisi fisikmu terasa sangat berat setelah enam bulan pertama.`

**Masalah:** H2 berikutnya (L421) berjudul "Kerja ke Jepang untuk Lulusan SMA/SMK Tanpa Pengalaman" dan mengulang konteks yang sama. Pembaca lulusan SMK bertemu dua jawaban berurutan yang saling menimpa.

**Tindakan:** ubah H3 L413 menjadi **daftar bidang saja**, dan hapus pengulangan konteks. Ganti judul H3 menjadi `### Empat bidang paling terbuka untuk pemula` dan hapus kalimat pertama yang mengulang "Kalau kamu lulusan SMA/SMK tanpa pengalaman" (sudah jadi judul H2 di bawahnya).

---

## U13 — Wire artikel + skema ke build **[BLOCKER RILIS — keputusan team-lead]**

**Dimensi:** On-page (+1,5)
**Usaha:** Besar / terblokir

**Temuan:** `src/pages/` **tidak punya** route untuk artikel ini. Tidak ada content collection (`src/content.config.ts` tidak ada). String `schema-panduan-kerja-ke-jepang-2026` **tidak direferensikan di mana pun** dalam `src/`. `BaseLayout.astro` hanya menyuntik `orgJsonLd` (Organization).

**Konsekuensi:** sampai ini diselesaikan, **seluruh perbaikan on-page di §3.5 tidak menghasilkan apa pun di SERP.** Article/FAQPage/BreadcrumbList tidak akan pernah dirender, `image` tidak akan jadi `og:image`, dan rich result tidak akan tayang.

**Kenapa saya tidak menuliskan langkah teknisnya:** instruksi eksplisit — jangan menyarankan menambah berkas di `src/` (counter beku). Jadi ini saya serahkan sebagai **keputusan team-lead**, dengan tiga opsi:

1. **Route + injeksi skema** (butuh 1–2 berkas di `src/` → melanggar freeze, butuh pengecualian).
2. **Pipeline ingest** `deliverables/` → halaman, dijalankan di luar `src/` (mis. langkah build yang membaca folder `deliverables/seo-content/final/`).
3. **Publikasi lewat CMS/halaman yang sudah ada**, dengan skema ditempel manual.

**Sampai salah satu dipilih, status artikel ini adalah "siap konten, belum siap rilis".**

---

# 5. TIGA CEK TEKNIS YANG BELUM PERNAH DIVERIFIKASI

## 5.1 Apakah `title` (50 char) dan `description` (146 char) sudah optimal?

### Meta Title — **pertahankan, jangan diubah**

```
Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Proses
```
**Panjang terukur: 50 karakter** ✓ (target 50–60)

| Kriteria | Status |
|---|---|
| Frasa utama di karakter ke-1 | ✅ (dulu karakter ke-9) |
| Tiga subtopik bervolume tertinggi | ✅ syarat / biaya / gaji |
| Menutup long-tail "proses" | ✅ |
| Nol kata terlarang | ✅ (tanpa "dijamin", "pasti", "termudah", "tanpa biaya") |
| Sisa ruang | 10 karakter |

**Satu-satunya peningkatan yang saya sarankan:** tambahkan sufiks merek **hanya jika** situs memang konsisten melakukannya di halaman lain. `Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Proses | ASJ` = **56 karakter**, masih aman sebelum pemotongan. Kalau halaman lain tidak memakai sufiks, **jangan** — inkonsistensi judul lebih merugikan daripada kehilangan 6 karakter.

**Varian yang layak diuji (bukan pengganti):** `Kerja ke Jepang 2026: Biaya, Gaji, Syarat & Proses` — 50 karakter, memimpin dengan dua subtopik volume tertinggi. **[ESTIMASI]** potensi CTR +0–3%; tidak ada bukti kuat. Uji hanya kalau ada kapasitas eksperimen, dan **jangan** mengubah sebelum ada data Search Console 30 hari.

### Meta Description — **pertahankan, tapi ada satu varian yang layak diuji**

```
Kerja ke Jepang 2026: rincian biaya, upah per jam, simulasi gaji bersih,
timeline 6 tahap, dan 7 tanda agensi tidak resmi. Cek dulu sebelum bayar.
```
**Panjang terukur: 146 karakter** ✓

| Kriteria | Status |
|---|---|
| Frasa utama di posisi 1 | ✅ |
| Dua angka spesifik ("6 tahap", "7 tanda") | ✅ keduanya benar-benar ada di artikel |
| CTA eksplisit | ✅ "Cek dulu sebelum bayar" |
| Nol klaim palsu | ✅ |
| Nol kata terlarang | ✅ |
| Risiko pemotongan | ✅ aman (di bawah ±155) |

**Kelemahan yang saya temukan:** `upah per jam` disebut **tanpa angkanya**. Artikel punya angka paling kuat di niche ini (¥1.177) dan tidak memakainya di description — padahal angka konkret adalah pemicu klik tertinggi di segmen ini.

**Varian yang saya sarankan diuji:**
```
Kerja ke Jepang 2026: rincian biaya, upah per jam ¥1.177, simulasi take-home,
timeline 6 tahap, dan 7 tanda agensi tidak resmi. Cek dulu sebelum bayar.
```
**Panjang: 151 karakter** ✓ — masih aman, menambah satu angka konkret, dan mengganti "gaji bersih" → "take-home" yang lebih pendek sehingga angka muat.

**Putusan:** keduanya sudah **optimal secara teknis**; tidak ada blocker. Yang tersisa adalah pilihan A/B, bukan perbaikan.

## 5.2 Apakah 8 H2 dibuka dengan jawaban langsung dalam 40–55 kata pertama?

**Jawaban singkat: TIDAK — dan lebih buruk dari yang diperkirakan.**

**Temuan struktural:** **0 dari 14 H2** punya paragraf pembuka di jendela 40–55 kata. Semua pembuka berukuran **7–29 kata** (tabel lengkap di §3.7). Tidak ada satu pun blok yang disiapkan sebagai kandidat paragraph-snippet.

**Dari 8 H2 berbentuk query — 3 GAGAL, 3 SEBAGIAN, 2 LULUS:**

**GAGAL (harus diperbaiki sebelum rilis):**
1. **`Syarat Kerja ke Jepang 2026`** (L126) — 14 kata, **nol syarat disebut**. Pembaca yang berhenti di sini tidak mendapat satu informasi pun. → **U2**
2. **`Berapa Biaya Kerja ke Jepang? Ini Rinciannya`** (L171) — 26 kata, **nol rupiah**. Hanya prinsip. → **U3**
3. **`Berapa Gaji Kerja di Jepang? Angka dan Simulasinya`** (L224) — 15 kata, **nol yen**. H2 terbesar di artikel (416 kata) dengan pembuka tanpa satu angka. → **U4**

**SEBAGIAN:**
4. **`Tiga Jalur Resmi Kerja ke Jepang`** (L78) — 12 kata; menyebut pembeda tapi **tidak menyebut nama ketiga jalur**. Snippet untuk "jalur kerja ke Jepang" butuh nama jalurnya.
5. **`Berapa Lama Proses Kerja ke Jepang?`** (L293) — 20 kata; **naik dari GAGAL**. "Alurnya enam tahap" sudah di kalimat kedua (perbaikan P1-2 berhasil sebagian), tapi kalimat pertama masih penyangkalan dan **tanpa durasi**.
6. **`Bidang Pekerjaan yang Paling Banyak Dibuka…`** (L385) — 20 kata, generik, **tidak menyebut kaigo/pengolahan makanan/pertanian** di pembuka.

**LULUS:**
7. **`Apakah Kerja ke Jepang Aman dan Legal?`** (L336) — "Ya — asalkan lewat jalur resmi dan lembaga berizin." Pola "Ya + syarat" persis yang dipanen snippet. **Terbaik di artikel.**
8. **`Kerja ke Jepang untuk Lulusan SMA/SMK Tanpa Pengalaman`** (L421) — "Bisa. Lulusan SMA/SMK tanpa pengalaman formal tetap punya jalur, asalkan…" Pola "Bisa. + syarat". **Kedua terbaik.**

**Catatan penting:** 3 H2 yang gagal adalah **tiga query dengan nilai komersial tertinggi** di seluruh artikel (syarat, biaya, gaji). Kegagalan di sini lebih mahal daripada kegagalan di H2 deskriptif mana pun.

## 5.3 Apakah ada H2 yang berpotensi kanibalisasi dengan `/loker` atau artikel S1?

### Dengan `/loker` — **risiko RENDAH–SEDANG**

| H2 | Penilaian |
|---|---|
| `Bidang Pekerjaan yang Paling Banyak Dibuka untuk Pekerja Indonesia` (L385, 246 kata) | **Risiko sedang.** Isinya taksonomi bidang (19 bidang SSW), bukan daftar lowongan — intent berbeda. Tapi judulnya mengandung "Paling Banyak Dibuka" yang **terbaca seperti halaman lowongan**. `/loker` menargetkan "lowongan kerja Jepang". |

**Mitigasi:** pillar menautkan ke `/loker` **2×** (L122, L521) — ini sudah benar. Satu perbaikan kecil: pertimbangkan mempersempit judul H2 menjadi **"Bidang Pekerjaan untuk Pekerja Indonesia: 19 Bidang SSW"** supaya sinyalnya taksonomi, bukan listing. **Usaha: trivial. Poin: +0,25 struktur.**

### Dengan S1 (`/cara-daftar-kerja-ke-jepang-2026`) — **risiko TINGGI, dan sudah nyata**

Ini bukan potensi — duplikasinya sudah ada di dua file yang sama-sama berstatus final.

| # | Bukti | Tingkat |
|---|---|---|
| 1 | **Tabel timeline 6 tahap nyaris identik.** Pillar L303–310 vs S1 L113–120: enam tahap yang sama, estimasi durasi yang sama, COE 1–3 bulan yang sama. | 🔴 **Tinggi** |
| 2 | **Kalimat duplikat hampir kata per kata.** Pillar L295: *"Siapa pun yang menyebut "pasti berangkat dalam 3 bulan" menyederhanakan sesuatu yang rumit."* S1 L196: *"Siapa pun yang menyebut "pasti berangkat dalam 3 bulan" sedang menyederhanakan sesuatu yang tidak sederhana."* | 🔴 **Tinggi** |
| 3 | **H2 "Berapa Lama…" di kedua halaman.** Pillar: "Berapa Lama Proses Kerja ke Jepang? Timeline dari Daftar sampai Berangkat". S1: "Berapa Lama Sampai Bisa Berangkat?". **Intent identik.** | 🔴 **Tinggi** |
| 4 | **Bagian syarat bertumpuk.** Pillar H2 Syarat (5 H3) vs S1 H2 "Syarat yang Harus Kamu Periksa Sebelum Mendaftar" (3 H3) — keduanya memuat 18–28, SMA/SMK, tato/tindik, JFT A2/N4, N3 transportasi, uji kaigo. | 🟡 **Sedang** — masih bisa dibedakan (pillar = syarat lengkap; S1 = yang perlu dicek sebelum mendaftar) |
| 5 | **"Tidak ada yang benar-benar Rp 0"** muncul di kedua halaman (pillar L212, S1 L204). | 🟢 **Rendah** — kalimat pendek, wajar diulang |
| 6 | **Tautan satu arah.** S1 → pillar ✅ (S1 L18). Pillar → S1 ❌. | 🟡 **Sedang** |

**Putusan arah — pillar yang memiliki timeline, S1 yang mengalah:**

Pillar **harus** memenangkan "berapa lama proses kerja ke Jepang": judul H2-nya persis query itu, artikelnya 4.000 kata, dan dia halaman pillar. Karena itu:

1. **Di pillar (bisa saya sarankan, tidak bisa saya edit):** tambahkan tautan ke S1 (**U6**) — menutup tautan satu arah sekaligus memberi S1 jalur masuk.
2. **Di S1 (di luar cakupan saya — flag ke team-lead):** H2 "Berapa Lama Sampai Bisa Berangkat?" sebaiknya dipangkas jadi 2 kalimat + tautan ke pillar. Sekarang S1 mengulang tabel 6 tahap yang dimiliki pillar, dan itu membuat dua halaman bersaing untuk satu query.
3. **Kalimat duplikat L295:** ubah pembuka H2 Proses di pillar supaya tidak lagi identik dengan S1 — ini sekaligus menyelesaikan masalah snippet di §5.2. Ganti L295 dengan:
   > `Proses **kerja ke Jepang** terbagi enam tahap, dan totalnya bergantung pada kesiapan bahasamu — bukan pada tanggal pendaftaran. Tahap penerbitan COE saja butuh 1–3 jam…`
   > *(→ lengkapi: "1–3 bulan". Kalimat ini memuat frasa utama, membuka dengan jawaban positif, menyebut durasi, dan tidak lagi kembar dengan S1.)*

**Catatan tambahan:** kontradiksi brief §1.3 vs outline §3 yang diangkat laporan pertama **tidak lagi mendesak**. S1 sudah terbit dengan primary keyword `cara daftar kerja ke Jepang` — **berbeda** dari `syarat kerja ke Jepang` dan `gaji kerja di Jepang` yang disimpan brief. Jadi pillar boleh tetap memegang H2 Syarat dan Gaji. Yang perlu diputuskan hanya artikel pendukung #2 dan #3 nanti, dan itu belum ditulis.

---

# 6. CHECKLIST SEBELUM TAYANG (diperbarui)

**Sudah selesai sejak audit pertama:**
- [x] ¥1.177 di 7 lokasi + tabel gaji dihitung ulang (¥203.621 / ¥148.078 / ¥173.085 semua benar)
- [x] Hyperlink ke `ssw.go.jp/en/about/visa/`, `ssw.go.jp/en/about/step/`, MHLW — **7 tautan eksternal**
- [x] `image` + `image_alt` di frontmatter, OG 1200×630 terverifikasi
- [x] `BreadcrumbList` di array schema; slug root-level, breadcrumb 2 level konsisten
- [x] Atribusi "16 bidang" diperbaiki jadi "halaman ISA yang sama"
- [x] Meta title 50 char, frasa utama di depan
- [x] Meta description 146 char dengan CTA
- [x] Lembur +25% dinaikkan jadi fakta hukum
- [x] 2 gambar badan dengan alt berkeyword
- [x] Teks FAQ identik dengan `acceptedAnswer` schema
- [x] Frasa utama di H1 ✓ / 100 kata pertama ✓ / 9 dari 14 judul H2 ✓ / kesimpulan ✓
- [x] Hierarki H1→H2→H3 bersih (1/14/48/0), nol lompatan
- [x] Panjang 4.000+ kata
- [x] Nol klaim terlarang; status LPK-bukan-SO akurat
- [x] Nol tautan rusak

**Belum — harus dikerjakan:**
- [ ] **U1** 7 sisipan frasa di zona kosong (frasa utama badan 4 → 10)
- [ ] **U2** List 7 syarat terkonsolidasi di bawah H2 Syarat
- [ ] **U3** Pembuka H2 Biaya memuat angka + "sembilan komponen"
- [ ] **U4** Pembuka H2 Gaji memuat ¥1.177 / ¥203.621 / ¥148.078
- [ ] **U5** Derivasi 173 jam (40 × 4,33)
- [ ] **U6** Tautan pillar → `/cara-daftar-kerja-ke-jepang-2026`
- [ ] **U7** Anchor `/siswa-baru` → "kelas bahasa Jepang dari dasar"
- [ ] **U8** `headline` schema = H1
- [ ] **U9** Hapus TL;DR **atau** H2-1 (jangan keduanya)
- [ ] **U10** Penjelasan rata-rata tertimbang sebelum angka prefektur
- [ ] **U11** Blok penulis + peninjau + metodologi + changelog (**butuh nama nyata**)
- [ ] **U12** Rekonsiliasi H3-Bidang ↔ H2-SMA/SMK
- [ ] **U13** **[BLOCKER]** Route + injeksi skema — keputusan team-lead
- [ ] `program kerja Jepang` ≥ 1× (sekarang 0) — **setelah U1e dan U3: 2×**
- [ ] JSON-LD lolos [Rich Results Test](https://search.google.com/test/rich-results) — **hanya bisa diuji setelah U13**

---

# 7. KESIMPULAN

**Status: Needs Revision. Estimasi 2,5–3 jam** (U1–U12 tanpa U11; U11 butuh ±45 menit tambahan **dan** data nama nyata; U13 terpisah).

## Apa yang berhasil

Tim mengeksekusi **seluruh lima blocker P0** dari audit pertama, dan mengerjakannya dengan benar:

- Angka ¥1.177 kini konsisten di 7 lokasi, dan seluruh tabel gaji dihitung ulang dengan aritmetika yang saya verifikasi ulang satu per satu — **semuanya benar**.
- **0 → 7 hyperlink** ke sumber primer. Ini mengubah artikel dari "mengklaim transparan" menjadi "bisa diperiksa". Kenaikan E-E-A-T +5 sepenuhnya berasal dari sini.
- Atribusi "16 vs 19 bidang" diperbaiki dengan cara yang justru **menaikkan** kredibilitas: menyebut bahwa dua halaman ISA yang sama tidak sinkron adalah bukti penulis membaca sumbernya.
- 2 diagram nyata dengan alt deskriptif, OG image 1200×630, BreadcrumbList, slug root-level yang konsisten dengan schema — semuanya rapi.
- Teks FAQ identik dengan schema. Peringatan laporan pertama soal ini diikuti.

## Apa yang gagal

**Satu regresi yang harus dikatakan tanpa dibungkus:** artikel ini sekarang **lebih jarang menyebut frasa utamanya di badan teks** daripada draf yang dikritik di audit pertama.

| | Draf | Final |
|---|---|---|
| Frasa utama di badan teks | **11** | **4** |
| Kepadatan frasa utama di badan | 0,29% | **0,11%** |
| Zona kosong H2 | 8 | **11** |

Empat kemunculan yang tersisa pun, satu ada di dalam alt text gambar. **Prosa yang dibaca pengunjung memuat frasa utama 3 kali dalam 3.632 kata.**

Ini bukan bencana — 9 dari 14 judul H2 membawa varian, dan relevansi topikal tidak diukur dari exact match saja. Tapi kalau pertanyaannya "apakah optimasi kata kunci membaik", jawabannya **tidak**. Karena itu dimensi ini turun 13 → 11, bukan naik.

## Apa yang menahan skor di 75,5

Prediksi laporan pertama 83–86 tidak tercapai karena **P1 dilewatkan, bukan karena P0 gagal**. Tiga item P1 yang tidak dikerjakan — list syarat, pembuka berangka, dan sisipan frasa — bertanggung jawab atas ±6 dari 8 poin yang hilang. Itu juga tiga item termurah di seluruh laporan ini.

## Proyeksi setelah U1–U12

| Dimensi | Sekarang | Setelah U1–U12 |
|---|---|---|
| Keyword optimization | 11 | **16** |
| Struktur heading | 12 | **14** |
| Kedalaman | 15 | 15 |
| E-E-A-T | 13 | **17–18** |
| On-page teknis | 13 | **13,5** |
| Internal linking | 8 | **9,5** |
| Kesiapan snippet | 3,5 | **5** |
| **Total** | **75,5** | **±90–91** |

Tanpa U11 (blok E-E-A-T) dan tanpa U13 (wire ke build), plafon realistis adalah **±86** — dengan satu catatan yang harus diulang: **selama U13 belum selesai, skor itu tidak terlihat di SERP sama sekali.**

---

*Laporan ini disusun 22 Oktober 2026 dari snapshot md5 `c4897c94682d3935785c68c46c9b9e54` (mtime 23:31:40). Semua hitungan kata, kemunculan frasa, jumlah tautan, dan dimensi gambar diukur langsung dari file — bukan diperkirakan. Angka upah diverifikasi ulang secara aritmetika terhadap PDF MHLW; klaim prefektur (¥187.705–193.241, "5–8% di bawah rata-rata nasional") saya hitung sendiri dan benar. Data volume pencarian dan SERP tidak tersedia untuk sesi ini dan tidak dikarang; yang memerlukan dugaan ditandai **[ESTIMASI]**.*
