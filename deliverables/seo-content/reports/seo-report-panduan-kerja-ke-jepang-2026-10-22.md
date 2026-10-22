# LAPORAN AUDIT SEO TEKNIS
## Panduan Kerja ke Jepang 2026 (Pillar)

| | |
|---|---|
| **File diaudit** | `drafts/panduan-kerja-ke-jepang-2026-10-22.md` |
| **Brief acuan** | `research/brief-kerja-ke-jepang-2026-10-22.md` |
| **Klien** | PT Amanah Sakura Japan (ASJ Portal) — LPK, Ponorogo |
| **Kata kunci utama** | `kerja ke Jepang` |
| **Tanggal audit** | 22 Oktober 2026 |
| **Auditor** | 欧化成 (SEO Optimizer) |
| **Status** | **Needs Minor Fixes** — 5 blocker mekanis, estimasi 90–120 menit |

> **Catatan integritas data.** Saya **tidak** mengarang angka volume pencarian, data SERP, atau statistik kompetitor. Semua klaim yang saya nilai "TERVERIFIKASI" di bawah ini saya cek langsung ke sumber primer pada 22 Oktober 2026, dan URL-nya saya cantumkan. Yang tidak bisa saya verifikasi, saya tandai **[ESTIMASI]** atau **[TIDAK TERVERIFIKASI]**.

---

# 0. RINGKASAN EKSEKUTIF

## Skor SEO: 68/100

| # | Dimensi | Bobot | Skor | Alasan utama |
|---|---|---|---|---|
| 1 | Keyword optimization | 20 | **13** | Kepadatan frasa utama hanya **0,48%** (target 0,8–1,5%). 8 dari 14 H2 nol varian di badan. Varian wajib `program kerja Jepang` = **0 kemunculan** |
| 2 | Struktur heading & konten | 15 | **12** | Hierarki bersih 1/14/48/0 ✓. 9/14 judul H2 memuat varian ✓. Dikurangi: duplikasi TL;DR vs H2-1, 2 judul H2 berisiko kanibalisasi, 4 H2 tipis |
| 3 | Kedalaman vs kompetitor | 15 | **14** | **3.733 kata** vs baseline kompetitor est. 600–1.500 = **2,5–6,2×**. 4 tabel, simulasi 3 skenario, timeline 6 tahap, 7 red flag. Benar-benar unggul |
| 4 | E-E-A-T / sitasi & angka berisiko | 20 | **8** | **Titik terlemah.** Akurasi fakta sangat tinggi (9/9 klaim ISA benar ✓) tapi **nol hyperlink ke ssw.go.jp** dan **nol ke MHLW**. Tidak ada byline penulis. Satu angka salah digit |
| 5 | On-page teknis | 15 | **11** | Meta title 50 char ✓, slug 34 char sempurna ✓. Dikurangi: description 122 char tanpa CTA, schema array tanpa BreadcrumbList, **0 gambar** di 3.733 kata, tanpa `datePublished`/`author` |
| 6 | Internal linking | 10 | **7** | 9 tautan, semua anchor deskriptif ✓ (nol "klik di sini"). Dikurangi: `/siswa-baru` hanya 1× (brief minta 2×), H2 Bidang & H2 Legalitas tanpa tautan yang diminta brief |
| 7 | Kesiapan featured snippet | 5 | **3** | Bahan mentah bagus (tabel, list, 7/13 H2 dibuka jawaban langsung) tapi H2 Syarat **tidak punya list terkonsolidasi**, H2 Proses dibuka dengan jawaban **negatif** |
| | **TOTAL** | **100** | **68** | |

**Aritmetika:** 13 + 12 + 14 + 8 + 11 + 7 + 3 = **68**

## Tiga temuan yang mengubah prioritas

**1. Angka upah minimum di draf SALAH satu yen — dan saya punya angka resminya.**
Draf menulis **¥1.176**. Daftar resmi MHLW untuk tahun fiskal 2026 (令和8年度) yang saya unduh dan ekstrak menyebut **¥1.177** — kenaikan ¥56 (+5,0%) dari ¥1.121. Ini bukan opini; ini PDF resmi. Lihat §7 dan Lampiran A.

**2. Artikel ini menggantungkan seluruh diferensiasinya pada "kami sebut angka" — tapi tidak menautkan satu pun angka itu.**
Klaim ISA disebut 6× dalam teks miring, dan **nol** di antaranya hyperlink. Ini kegagalan yang ironis: artikel yang menjual transparansi tidak transparan soal sumbernya. Perbaikannya mekanis dan murah.

**3. Akurasi fakta ISA draf ini sangat baik — jangan sentuh.**
Saya verifikasi 9 klaim ISA satu per satu (19 bidang, 11 bidang, 5 tahun, tanpa keluarga, COE 1–3 bulan, N3 untuk transportasi, uji tambahan kaigo, Food Service ditutup, 3 bidang "under construction"). **Semuanya benar.** Ini modal kredibilitas yang sayang — cukup diberi tautan, dan artikel langsung naik kelas.

---

# 1. PETA KEPADATAN KATA KUNCI

## 1.1 Metrik dasar

| Metrik | Nilai terukur | Target | Status |
|---|---|---|---|
| Panjang artikel (termasuk tabel) | **3.733 kata** | 3.000–3.500 | ✅ di atas target |
| Panjang artikel (tanpa tabel) | **3.410 kata** | — | ✅ |
| Klaim "4.160 kata" di blok meta bawah | **TIDAK AKURAT** | — | ⚠️ selisih ~430–750 kata |
| Kemunculan `kerja ke Jepang` (persis) | **18** | — | — |
| Kepadatan frasa utama | **0,48%** | 0,8–1,5% | ❌ **under-use** |
| Kemunculan semua 5 varian | **27** | — | — |
| Kepadatan agregat semua varian | **0,72%** | 1,0–2,0% | ⚠️ di bawah |
| Kata `Jepang` (semua konteks) | 63 | — | ✅ cukup |
| Kata `kerja` | 88 | — | ✅ cukup |
| Rata-rata panjang kalimat | **12,3 kata** | <25 | ✅ sangat baik |

**Diagnosis:** ini **bukan** keyword stuffing. Ini kebalikannya — **under-optimization yang disengaja**. Penulis menaruh kata kunci di judul heading lalu menghindarinya di badan paragraf. Secara keterbacaan itu bagus; secara sinyal relevansi itu lemah.

## 1.2 Peta per H2 — tabel lengkap

Kolom "Badan" = hanya teks paragraf/list di bawah H2 (judul H2 tidak dihitung).

| # | H2 | Kata | `kerja ke Jepang` | `kerja di Jepang` | `bekerja di Jepang` | `lowongan kerja Jepang` | `program kerja Jepang` | Total | Kepadatan | Diagnosis |
|---|---|---|---|---|---|---|---|---|---|---|
| — | *Intro + H1 + TL;DR* | 255 | 3 | 0 | 0 | 0 | 0 | **3** | 1,18% | ✅ ideal |
| 1 | Ringkasan Cepat: Kerja ke Jepang dalam 5 Poin | 110 | 0 | 0 | 0 | 0 | 0 | **0** | 0,00% | ❌ **ZONA KOSONG** |
| 2 | Apa yang Berubah di 2026 | 116 | 0 | 0 | 0 | 0 | 0 | **0** | 0,00% | ❌ ZONA KOSONG |
| 3 | Kenapa Banyak Orang Indonesia Memilih Kerja di Jepang | 154 | 0 | 0 | 0 | 0 | 0 | **0** | 0,00% | ❌ ZONA KOSONG (varian hanya di judul) |
| 4 | Tiga Jalur Resmi Kerja ke Jepang | 271 | 0 | 1 | 1 | 1 | 0 | **3** | 1,11% | ✅ terbaik — pola yang harus ditiru |
| 5 | Syarat Kerja ke Jepang 2026 | 321 | 0 | 0 | 0 | 0 | 0 | **0** | 0,00% | ❌ ZONA KOSONG — **H2 terbesar ke-3, nol varian** |
| 6 | Berapa Biaya Kerja ke Jepang? | 310 | 2 | 0 | 0 | 0 | 0 | **2** | 0,65% | ⚠️ cukup |
| 7 | Berapa Gaji Kerja di Jepang? | 392 | 0 | 1 | 0 | 0 | 0 | **1** | 0,26% | ⚠️ **H2 terbesar, kepadatan terendah** |
| 8 | Berapa Lama Proses Kerja ke Jepang? | 237 | 0 | 0 | 0 | 0 | 0 | **0** | 0,00% | ❌ ZONA KOSONG |
| 9 | Apakah Kerja ke Jepang Aman dan Legal? | 447 | 1 | 0 | 0 | 0 | 0 | **1** | 0,22% | ⚠️ H2 terbesar, hampir nol |
| 10 | Bidang Pekerjaan yang Paling Banyak Dibuka | 238 | 0 | 0 | 0 | 0 | 0 | **0** | 0,00% | ❌ ZONA KOSONG — **ini tempat `lowongan kerja Jepang` seharusnya** |
| 11 | Kerja ke Jepang untuk Lulusan SMA/SMK | 253 | 0 | 0 | 0 | 0 | 0 | **0** | 0,00% | ❌ ZONA KOSONG |
| 12 | Langkah Mulai dari Nol — Checklist 30 Hari | 204 | 0 | 0 | 0 | 0 | 0 | **0** | 0,00% | ❌ ZONA KOSONG |
| 13 | FAQ | 402 | 4 | 2 | 0 | 0 | 0 | **6** | 1,49% | ✅ terbaik (tapi terlalu menumpuk di sini) |
| 14 | Kesimpulan | 180 | 1 | 0 | 0 | 1 | 0 | **2** | 1,11% | ✅ ideal |

**Ringkasan distribusi:**
- **8 dari 14 H2 = zona kosong** (nol varian apa pun di badan)
- **2 H2 menampung 9 dari 27 varian** (FAQ 6 + Intro 3) = **33% terkonsentrasi di 8% panjang artikel**
- **6 dari 14 H2 punya ≥1 varian** → lolos ambang minimum brief (2–3 H2) tapi dengan konsentrasi yang tidak sehat

## 1.3 Pemeriksaan posisi wajib

| Posisi | Status | Bukti |
|---|---|---|
| H1 | ✅ | "Panduan **Kerja ke Jepang** 2026: Syarat, Biaya, Gaji, dan Prosesnya" (64 char) |
| 100 kata pertama | ✅ | Kalimat pertama badan: "**Kerja ke Jepang** pada 2026 punya tiga jalur resmi..." — posisi kata ke-5 |
| Judul H2 | ✅ **9/14** | Jauh di atas ambang. Hanya 5 H2 tanpa varian: *Apa yang Berubah*, *Bidang Pekerjaan*, *Langkah Mulai*, *FAQ*, *Kesimpulan* |
| Paragraf penutup | ✅ | "**Kerja ke Jepang** bukan lotre, tapi juga bukan jalan pintas." |
| Meta title | ✅ | "Panduan **Kerja ke Jepang** 2026..." |
| Meta description | ✅ | "...dan proses **kerja ke Jepang** 2026..." |

**Kesimpulan §1:** semua posisi wajib sudah terisi. Masalahnya murni **kepadatan badan** dan **kesenjangan varian**, bukan penempatan strategis.

## 1.4 Varian yang hilang

| Varian | Kemunculan | Status |
|---|---|---|
| `kerja di Jepang` | 6 | ✅ |
| `lowongan kerja Jepang` | 2 | ⚠️ minimal — padahal ini jembatan semantik ke `/loker`, halaman konversi utama |
| `bekerja di Jepang` | 1 | ⚠️ brief minta dipakai di pembuka & kesimpulan — saat ini hanya 1× |
| **`program kerja Jepang`** | **0** | ❌ **varian wajib brief §1.2, nol kemunculan** |

## 1.5 Rekomendasi penambahan (dosis tepat, bukan stuff)

Target: frasa utama 18 → **26** (0,70%), semua varian 27 → **38** (1,02%). Tambah **8 frasa utama + 11 varian total**, tersebar di 8 zona kosong. Jangan lebih — di atas 1,5% untuk frasa 3 kata dalam bahasa Indonesia mulai terasa dipaksakan.

| Lokasi | Sisipkan | Contoh rumusan (1 kalimat, jangan tambah paragraf baru) |
|---|---|---|
| H2-1 Ringkasan Cepat | `kerja ke Jepang` ×1 | "Lima poin soal **kerja ke Jepang** yang paling sering ditanyakan, dijawab singkat." |
| H2-2 Apa yang Berubah | `kerja ke Jepang` ×1 | "Empat perubahan ini membuat cara menghitung **kerja ke Jepang** berbeda dari tahun lalu." |
| H2-3 Kenapa Memilih | `bekerja di Jepang` ×1 | "Alasan orang Indonesia memilih **bekerja di Jepang** nyata dan berlapis, tapi tidak semuanya soal uang." |
| H2-5 Syarat | `kerja ke Jepang` ×1 + `program kerja Jepang` ×1 | "Syarat **kerja ke Jepang** terbagi tiga: administratif, bahasa, dan fisik." / "Ketentuan ini berlaku untuk **program kerja Jepang** ASJ, bukan untuk semua jalur SSW di semua lembaga." |
| H2-6 Biaya | `program kerja Jepang` ×1 | "Biaya **program kerja Jepang** selalu berkomponen — dan yang wajar bisa dijelaskan baris per baris." |
| H2-7 Gaji | `kerja di Jepang` ×1 | "Gaji **kerja di Jepang** dihitung dari upah per jam, bukan dari angka bulanan yang beredar di internet." *(ganti kalimat pembuka yang sekarang — lihat §6)* |
| H2-8 Proses | `kerja ke Jepang` ×1 | "Proses **kerja ke Jepang** terbagi enam tahap, dan totalnya bergantung pada kesiapan bahasamu." *(ganti pembuka negatif — lihat §6)* |
| H2-10 Bidang | `lowongan kerja Jepang` ×1 + `kerja ke Jepang` ×1 | "Bidang yang dibuka untuk **kerja ke Jepang** berubah tiap tahun, jadi cek **lowongan kerja Jepang** yang masih aktif sebelum memilih." |
| H2-11 SMA/SMK | `kerja ke Jepang` ×1 | "Lulusan SMA/SMK tanpa pengalaman tetap punya jalur **kerja ke Jepang**, asalkan..." |
| H2-12 Checklist | `kerja ke Jepang` ×1 | "Dalam 30 hari pertama, kamu belum perlu menyelesaikan seluruh proses **kerja ke Jepang**." |

---

# 2. AUDIT HEADING

## 2.1 Hierarki — bersih

```
H1  : 1   ✓ tunggal, memuat frasa utama, 64 karakter
H2  : 14  ✓ semua deskriptif
H3  : 48  ✓ semua di bawah H2 yang tepat
H4+ : 0   ✓ nol
Lompatan level: 0 ✓
```

**Verdict: lolos.** Tidak ada H2→H4, tidak ada H3 yatim, tidak ada H1 ganda. Ini lebih rapi dari rata-rata draf agensi.

**Catatan:** 14 H2 memang di atas rentang ideal 4–7, tapi untuk pillar 3.733 kata ini **wajar dan justru disarankan** — tiap H2 memetakan satu sub-intent. Jangan digabung.

## 2.2 Aturan snippet: apakah tiap H2 dibuka dengan jawaban langsung?

Brief §1.5 menetapkan: *"jawab langsung di kalimat pertama setelah heading, baru elaborasi. Jangan buka dengan 'Sebelum kita membahas…'"*

| H2 | Kalimat pembuka sekarang | Nilai |
|---|---|---|
| 1 Ringkasan | "Kalau kamu hanya punya dua menit, lima poin ini cukup untuk memutuskan lanjut membaca atau tidak." | ❌ meta-statement, bukan jawaban |
| 2 Apa Berubah | "Empat perubahan membuat informasi lama di internet jadi menyesatkan." | ⚠️ meta (tapi H2-nya bukan query-shaped, jadi aman) |
| 3 Kenapa Memilih | "Alasannya nyata dan berlapis, tapi tidak semuanya soal uang." | ⚠️ meta |
| 4 Tiga Jalur | "Ada tiga jalur dan semuanya legal." | ✅ jawaban langsung |
| 5 Syarat | "Syaratnya terbagi tiga: administratif, bahasa, dan fisik." | ⚠️ menjawab, **tapi tidak menyebut isinya** — snippet butuh list |
| 6 Biaya | "Biaya kerja ke Jepang bukan satu angka, melainkan kumpulan komponen." | ⚠️ framing bagus, **tapi tanpa angka** — snippet butuh nominal |
| 7 Gaji | "Gaji kerja di Jepang dihitung dari upah per jam, bukan dari angka bulanan..." | ⚠️ framing bagus, **tanpa angka** |
| 8 Proses | "Tidak ada satu angka tunggal. Siapa pun yang menyebut 'pasti berangkat dalam 3 bulan' sedang menyederhanakan..." | ❌ **jawaban NEGATIF** — Google tidak suka snippet yang dibuka dengan penyangkalan |
| 9 Aman & Legal | "Ya, kerja ke Jepang legal dan diatur ketat — asalkan kamu berangkat lewat jalur resmi." | ✅ **terbaik di artikel** — pola "Ya + syarat" persis yang dipanen snippet |
| 10 Bidang | "Bidang yang paling banyak menyerap pekerja Indonesia terkonsentrasi di sektor yang kekurangan tenaga kerja." | ⚠️ generik, tanpa nama bidang |
| 11 SMA/SMK | "Bisa. Lulusan SMA/SMK tanpa pengalaman kerja formal tetap punya jalur, asalkan..." | ✅ **pola "Bisa. + syarat"** — sangat baik |
| 12 Checklist | "Dalam 30 hari pertama, kamu tidak perlu menyelesaikan semuanya." | ⚠️ meta (aman, ini checklist) |
| 13 FAQ | — | n/a |
| 14 Kesimpulan | "Kerja ke Jepang bukan lotre, tapi juga bukan jalan pintas." | ✅ memuat frasa utama |

**Skor: 5 langsung ✅ / 8 sebagian ⚠️ / 2 gagal ❌.**

Perbaikan H2-8 (Proses) adalah yang paling mendesak karena itu long-tail #4 brief ("berapa lama proses kerja ke Jepang") dengan prioritas ⭐⭐⭐.

## 2.3 H2/H3 tumpang tindih

| Temuan | Tingkat | Detail |
|---|---|---|
| **TL;DR box (baris 22–27) ≈ H2-1 "Ringkasan Cepat"** | **P1** | Keduanya berisi 5 poin yang sama. TL;DR 6 baris di intro + H2-1 110 kata = **±165 kata redundan** di artikel yang justru ingin "padat". Efek samping: keduanya zona kosong kata kunci, jadi duplikasi ini murni kerugian |
| H3 "Berapa gaji kerja di Jepang per bulan...?" (FAQ) vs H2 "Berapa Gaji Kerja di Jepang?" | P2 | Wajar untuk FAQ (rekap disengaja), tidak berbahaya |
| H3 "Apakah kerja ke Jepang aman dan legal?" (FAQ) vs H2-9 "Apakah Kerja ke Jepang Aman dan Legal?" | P2 | **Judul hampir identik kata per kata.** Di FAQ ini masih wajar, tapi pertimbangkan mempersempit H3 jadi "Bagaimana cara cek agensi resmi?" agar tidak kembar |

**Rekomendasi TL;DR:** pilih **satu**. Saya sarankan **pertahankan kotak TL;DR di intro** (posisinya di atas lipatan = CTR + engagement) dan **hapus H2-1**, lalu pindahkan fungsi snippet-list-nya ke H2-5 Syarat. Ini memangkas 110 kata, menghapus satu zona kosong, dan menghapus satu H2 tipis sekaligus.

## 2.4 Risiko kanibalisasi dengan halaman lain

Brief §1.3 secara eksplisit menyatakan kata kunci **"syarat kerja ke Jepang"** dan **"gaji kerja di Jepang"** *disimpan sebagai artikel pendukung* agar tidak kanibalisasi. Tapi outline §3 sendiri memberi judul H2 yang menabrak aturan itu:

| H2 di draf | Kata kunci yang direbut | Konflik |
|---|---|---|
| **"Syarat Kerja ke Jepang 2026"** | `syarat kerja ke Jepang 2026` | ❌ **Menabrak brief §1.3.** Brief menyebut ini kandidat artikel pendukung #2 |
| **"Berapa Gaji Kerja di Jepang? Angka dan Simulasinya"** | `gaji kerja di Jepang` | ❌ Menabrak brief §1.3 — kandidat artikel pendukung #3 |

**Ini kontradiksi internal brief, bukan kesalahan penulis.** Brief §1.3 melarang, outline §3 menyuruh. Perlu keputusan team-lead sebelum artikel pendukung ditulis.

**Rekomendasi saya (defensif):** pertahankan kedua H2 di pillar — pillar *memang* harus menampung sub-topik — tapi saat menulis artikel pendukung nanti, beri sudut yang **berbeda tajam**:
- Pillar: "Syarat Kerja ke Jepang 2026" = ringkasan lintas-jalur (tabel)
- Pendukung: "Syarat Kerja ke Jepang untuk Lulusan SMA/SMK 2026" = satu segmen, sangat dalam

Kalau tidak, dua halaman akan saling makan dan keduanya kalah. **Flag ke team-lead.**

## 2.5 H2 tipis

| H2 | Kata | Catatan |
|---|---|---|
| Apa yang Berubah di 2026 | 116 | ⚠️ tipis, tapi bernilai tinggi untuk sinyal kesegaran — **pertahankan** |
| Kenapa Banyak Orang Indonesia Memilih... | 154 | ⚠️ tipis + nol kata kunci + ROI konversi terendah. Kandidat **dipangkas atau digabung** ke intro |
| Langkah Mulai dari Nol | 204 | ✅ wajar untuk checklist |
| Bidang Pekerjaan | 238 | ⚠️ tipis untuk topik sebesar ini — lihat §6 Target 3 (tabel prefektur akan menggemukkannya secara bernilai) |

---

# 3. META FINAL

## 3.1 Meta Title — 5 opsi

| # | Title | Char | Catatan |
|---|---|---|---|
| 1 | `Panduan Kerja ke Jepang 2026: Syarat, Biaya & Gaji` | **50** | ← **draf sekarang**. Kata "Panduan" (8 char) memakan ruang tanpa nilai pencarian |
| 2 | `Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Proses` | **50** | ✅ **REKOMENDASI** — frasa utama di posisi 1 (front-loaded), 3 subtopik permintaan tertinggi |
| 3 | `Kerja ke Jepang 2026: Biaya, Gaji, Syarat & Cara Daftar` | **55** | Menambah "Cara Daftar" (long-tail transaksional brief #11), tapi mendilusi 4 konsep |
| 4 | `Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Timeline` | **52** | "Timeline" bahasa Inggris di tengah judul Indonesia — kurang natural |
| 5 | `Panduan Kerja ke Jepang 2026 untuk Lulusan SMA/SMK` | **50** | Tersegmentasi tajam, tapi kehilangan "biaya" & "gaji" yang justru paling dicari |

**REKOMENDASI FINAL → Opsi 2**
`Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Proses` (50 karakter)

Alasan:
1. Frasa utama `kerja ke Jepang` berada di **posisi karakter ke-1**, bukan ke-9. Untuk kata kunci kompetitif, front-loading memberi bobot lebih dan bertahan saat Google memotong judul.
2. Mempertahankan tiga subtopik dengan volume tertinggi (syarat / biaya / gaji) + "Proses" yang menutup long-tail #4.
3. 50 char menyisakan **10 karakter** — cukup untuk sufiks merek `| ASJ` (total 56) bila tim memutuskan menambahkan.
4. Tidak memuat kata terlarang brief §6.1 ("dijamin", "pasti", "termudah", "tanpa biaya").

**Jangan** menambahkan "Lengkap" atau "Terbaru" — tidak ada bukti kata itu menaikkan CTR di segmen ini **[ESTIMASI]**, dan memakan 8–9 karakter.

## 3.2 Meta Description — 5 opsi

| # | Description | Char | CTA? | Angka? |
|---|---|---|---|---|
| 1 | `Syarat, biaya, gaji, dan proses kerja ke Jepang 2026 dijelaskan langkah demi langkah, termasuk cara mengecek agensi resmi.` | 122 | ❌ | ❌ |
| 2 | `Berapa biaya dan gaji kerja ke Jepang 2026? Rincian komponen biaya, upah per jam, simulasi take-home, timeline proses, dan cara cek agensi resmi.` | **145** | ❌ | ⚠️ implisit |
| 3 | `Panduan kerja ke Jepang 2026: bandingkan magang, SSW i, dan SSW ii, lihat rincian biaya dan simulasi gaji, lalu cek agensi sebelum membayar.` | **140** | ✅ | ❌ |
| 4 | `Kerja ke Jepang 2026: rincian biaya, upah per jam, simulasi gaji bersih, timeline 6 tahap, dan 7 tanda agensi tidak resmi. Cek dulu sebelum bayar.` | **146** | ✅ | ✅ |
| 5 | `Syarat, biaya, gaji, dan timeline kerja ke Jepang 2026 dijelaskan terbuka. Bandingkan magang vs SSW, lalu verifikasi izin agensi sebelum membayar.` | **146** | ✅ | ❌ |

**REKOMENDASI FINAL → Opsi 4**
`Kerja ke Jepang 2026: rincian biaya, upah per jam, simulasi gaji bersih, timeline 6 tahap, dan 7 tanda agensi tidak resmi. Cek dulu sebelum bayar.` (**146 karakter**)

Alasan:
1. **Frasa utama di posisi 1** — konsisten dengan title.
2. **Dua angka spesifik** ("6 tahap", "7 tanda") — angka konkret menaikkan CTR dan mencerminkan isi yang benar-benar ada di artikel (timeline 6 tahap ✓, 7 red flag ✓). Tidak ada klaim palsu.
3. **Hook rasa takut** ("agensi tidak resmi") menyentuh ketakutan #1 audiens (brief §2.3 GAP #3) tanpa melanggar kebijakan — tidak menuduh siapa pun.
4. **CTA eksplisit** ("Cek dulu sebelum bayar") — opsi 1 dan 2 tidak punya CTA sama sekali.
5. 146 char berada di dalam jendela optimal 150–160 sebelum pemotongan, dan **tidak terpotong** di 146.
6. Tidak memuat "dijamin/pasti/gratis".

**Alternatif bila ingin nada lebih lembut:** Opsi 2 (145 char) membuka dengan pertanyaan — profil CTR kuat. Tapi tanpa CTA.

## 3.3 URL Slug

```
/blog/panduan-kerja-ke-jepang-2026
```

| Kriteria | Nilai | Status |
|---|---|---|
| Panjang | 34 char | ✅ ideal |
| Memuat frasa utama | `panduan-kerja-ke-jepang-2026` | ✅ |
| Huruf kecil + hyphen | ✅ | ✅ |
| Tanpa stop-word | ✅ (hanya "panduan" yang bernilai rendah tapi memperjelas) | ✅ |
| Tahun | ✅ 2026 | ✅ |

**Verdict: pertahankan, jangan diubah.** Slug ini sudah optimal.

⚠️ **TAPI ada masalah struktural:** saya cek `https://asjastro.netlify.app` pada 22 Okt 2026 — **situs belum punya bagian `/blog`**. Navigasi hanya berisi anchor ke beranda (`#program`, `#main-content`), `/siswa-baru`, `/loker`, `/apply`, dll. Tidak ada indeks blog.

Konsekuensi:
- Route `/blog/panduan-kerja-ke-jepang-2026` tetap bisa dibuat di Astro (file di `src/pages/blog/...`), tapi **`/blog` sebagai halaman indeks akan 404**.
- **BreadcrumbList tidak boleh memuat crumb "Blog"** yang menunjuk ke 404 — itu pelanggaran schema (menandai halaman yang tidak ada).
- Pilihan: (a) buat `/blog` indeks sekarang — **disarankan**, karena klaster pillar butuh hub; atau (b) pakai `/panduan-kerja-ke-jepang-2026` di root dan sesuaikan breadcrumb.

Lihat §4 untuk kedua varian JSON-LD.

---

# 4. SCHEMA JSON-LD SIAP TEMPEL

## 4.1 Aturan yang saya patuhi

1. ✅ Hanya menandai konten yang **benar-benar tampil** di halaman.
2. ✅ **Tidak** menandai konten yang sama sebagai FAQ **dan** HowTo. Checklist 30 hari **tidak** saya tandai sebagai HowTo — itu akan menduplikasi FAQ. Saya biarkan sebagai list biasa.
3. ✅ FAQPage hanya memuat 8 pertanyaan yang **semuanya tampil** sebagai H3 di H2 FAQ.
4. ✅ BreadcrumbList hanya memuat halaman yang **ada**.

## 4.2 Yang harus ditambahkan ke frontmatter dulu

```yaml
---
title: "Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Proses"
description: "Kerja ke Jepang 2026: rincian biaya, upah per jam, simulasi gaji bersih, timeline 6 tahap, dan 7 tanda agensi tidak resmi. Cek dulu sebelum bayar."
slug: "/blog/panduan-kerja-ke-jepang-2026"
primary_keyword: "kerja ke Jepang"
datePublished: "2026-10-22"          # TAMBAH
dateModified: "2026-10-22"           # TAMBAH
author: "PT Amanah Sakura Japan"     # TAMBAH
image: "/images/panduan-kerja-ke-jepang-2026.jpg"   # TAMBAH — WAJIB, lihat catatan
imageAlt: "Ilustrasi panduan kerja ke Jepang 2026: tiga jalur resmi pemagangan dan SSW"
schema: ["Article", "FAQPage", "BreadcrumbList"]    # BreadcrumbList DITAMBAH
---
```

> ⚠️ **`image` WAJIB dan saat ini tidak ada.** Artikel 3.733 kata ini punya **nol gambar** (0 markdown `![]`, 0 `<img>`). Google mensyaratkan properti `image` untuk kelayakan rich result `Article`. Tanpa gambar, schema Article akan gagal validasi dan rich result tidak tayang. Minimal: 1 gambar hero 1200×630 untuk `og:image` + 1 gambar dalam badan (mis. diagram tiga jalur).

## 4.3 JSON-LD — `Article` + `BreadcrumbList` (varian A: `/blog` dibuat)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "@id": "https://asjastro.netlify.app/blog/panduan-kerja-ke-jepang-2026#article",
      "headline": "Panduan Kerja ke Jepang 2026: Syarat, Biaya, Gaji, dan Prosesnya",
      "description": "Kerja ke Jepang 2026: rincian biaya, upah per jam, simulasi gaji bersih, timeline 6 tahap, dan 7 tanda agensi tidak resmi. Cek dulu sebelum bayar.",
      "inLanguage": "id-ID",
      "image": [
        "https://asjastro.netlify.app/images/panduan-kerja-ke-jepang-2026.jpg"
      ],
      "datePublished": "2026-10-22",
      "dateModified": "2026-10-22",
      "author": {
        "@type": "Organization",
        "name": "PT Amanah Sakura Japan",
        "url": "https://asjastro.netlify.app/"
      },
      "publisher": {
        "@type": "Organization",
        "name": "PT Amanah Sakura Japan",
        "url": "https://asjastro.netlify.app/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://asjastro.netlify.app/images/logo-asj.png"
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "https://asjastro.netlify.app/blog/panduan-kerja-ke-jepang-2026"
      },
      "about": [
        { "@type": "Thing", "name": "Specified Skilled Worker" },
        { "@type": "Thing", "name": "Pemagangan (Technical Intern Training)" },
        { "@type": "Thing", "name": "Pekerja Migran Indonesia" }
      ],
      "keywords": "kerja ke Jepang, kerja di Jepang, biaya kerja ke Jepang, gaji kerja di Jepang, SSW tipe i, magang Jepang",
      "articleSection": "Panduan"
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://asjastro.netlify.app/blog/panduan-kerja-ke-jepang-2026#breadcrumb",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Beranda",
          "item": "https://asjastro.netlify.app/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Blog",
          "item": "https://asjastro.netlify.app/blog"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Panduan Kerja ke Jepang 2026"
        }
      ]
    }
  ]
}
```

## 4.4 JSON-LD — varian B: `/blog` **tidak** dibuat (breadcrumb 2 level)

Ganti blok `BreadcrumbList` di atas dengan ini, dan ubah slug menjadi `/panduan-kerja-ke-jepang-2026`:

```json
{
  "@type": "BreadcrumbList",
  "@id": "https://asjastro.netlify.app/panduan-kerja-ke-jepang-2026#breadcrumb",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Beranda",
      "item": "https://asjastro.netlify.app/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Panduan Kerja ke Jepang 2026"
    }
  ]
}
```

> **Aturan:** `ListItem` terakhir tidak perlu `item` (itu halaman saat ini). **Jangan** menambahkan crumb "Blog" bila `/blog` 404 — Google akan menandainya sebagai breadcrumb rusak.

## 4.5 JSON-LD — `FAQPage` (8 pertanyaan, semuanya tampil di halaman)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://asjastro.netlify.app/blog/panduan-kerja-ke-jepang-2026#faq",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Berapa biaya kerja ke Jepang lewat LPK?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Biayanya berkomponen: pelatihan bahasa, asrama, seragam dan modul, ujian, MCU, paspor, visa, tiket, dan biaya jasa lembaga. Sebagai contoh konkret, biaya program ASJ Rp 6.000.000 dan bisa dicicil. Nominal di lembaga lain berbeda, tergantung jalur dan apa yang sudah termasuk. Selalu minta rincian tertulis."
      }
    },
    {
      "@type": "Question",
      "name": "Berapa gaji kerja di Jepang per bulan untuk orang Indonesia?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Dasarnya upah per jam. Rata-rata nasional tertimbang tahun fiskal 2026 adalah 1.177 yen per jam menurut daftar resmi Kementerian Kesehatan, Tenaga Kerja dan Kesejahteraan Jepang (MHLW). Dengan asumsi 173 jam per bulan, gaji kotor dasar sekitar 203.621 yen, dan take-home lebih kecil setelah pajak, asuransi sosial, dan asrama. Angka per prefektur berbeda, dari 1.085 yen di Miyazaki sampai 1.280 yen di Tokyo."
      }
    },
    {
      "@type": "Question",
      "name": "Apakah bisa kerja ke Jepang tanpa biaya?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Tidak ada yang benar-benar Rp 0. Yang ada dua: biaya ditanggung pemberi kerja (pilihan lowongan bisa lebih sempit), atau biaya ditalangi lalu dipotong dari gaji. Keduanya sah asalkan tertulis jelas di kontrak. Yang tidak jujur adalah menyebut keduanya gratis."
      }
    },
    {
      "@type": "Question",
      "name": "Berapa umur maksimal untuk kerja ke Jepang?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Batas usia berbeda per jalur dan per lembaga, jadi tidak ada satu angka universal. Untuk program ASJ, ketentuannya 18 sampai 28 tahun. Jalur SSW di lembaga lain bisa punya rentang berbeda. Tanyakan langsung ketentuan usia untuk jalur yang kamu incar."
      }
    },
    {
      "@type": "Question",
      "name": "Apakah harus bisa bahasa Jepang? Minimal level berapa?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ya. Menurut Immigration Services Agency of Japan, SSW tipe i mewajibkan lulus uji keterampilan bidang dan JFT-Basic A2 atau JLPT N4 ke atas. Untuk transportasi (taksi dan bus) serta perkeretaapian, wajib JLPT N3. Untuk kaigo, ada tambahan Ujian Evaluasi Bahasa Jepang Perawatan Lansia."
      }
    },
    {
      "@type": "Question",
      "name": "Berapa lama proses dari daftar sampai berangkat?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Tidak ada angka tunggal. Alurnya enam tahap: pendaftaran, pelatihan 3 sampai 6 bulan, ujian, wawancara dan kontrak, dokumen dan COE, lalu visa dan keberangkatan. Menurut ISA, penerbitan Certificate of Eligibility saja butuh 1 sampai 3 bulan. Totalnya bergantung pada kecepatan bahasa dan ketersediaan lowongan."
      }
    },
    {
      "@type": "Question",
      "name": "Apakah kerja ke Jepang aman dan legal? Bagaimana cek agensinya?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Legal, asalkan lewat jalur resmi. Dasar hukumnya UU No. 18 Tahun 2017 tentang Pelindungan Pekerja Migran Indonesia, dengan kewenangan pada Kementerian Pelindungan Pekerja Migran Indonesia. Cek izin lembaga lewat kanal resmi kementerian, dan waspadai transfer ke rekening pribadi atau janji pasti lulus."
      }
    },
    {
      "@type": "Question",
      "name": "Apakah pekerja di Jepang bisa membawa keluarga?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Tergantung jalur. Menurut ISA, SSW tipe i tidak bisa membawa keluarga, dan total masa kerjanya maksimal 5 tahun. SSW tipe ii bisa membawa keluarga dan tidak memiliki batas atas masa tinggal. Pemagangan umumnya juga tidak mengizinkan. Kalau keluarga adalah prioritas, targetkan SSW tipe ii."
      }
    }
  ]
}
```

> **Catatan penting:** teks `acceptedAnswer` **harus identik** dengan yang tampil di halaman. Kalau tim mengubah jawaban di artikel, JSON-LD **wajib** ikut diubah. Ketidakcocokan = pelanggaran pedoman structured data. Saya sudah menyesuaikan jawaban #2 dengan angka ¥1.177 yang benar — jadi **perbarui juga teks di artikel**, bukan hanya schema.

## 4.6 Cara memasang di halaman Astro

Artikel ini berada di `src/pages/blog/panduan-kerja-ke-jepang-2026.astro` (atau `.md`/`.mdx` lewat layout). Ada dua pola; pilih yang sesuai struktur repo.

**Pola A — komponen layout (disarankan).** Buat `src/components/SeoJsonLd.astro`:

```astro
---
interface Props {
  schema: object | object[];
}
const { schema } = Astro.props;
const blocks = Array.isArray(schema) ? schema : [schema];
---
{blocks.map((block) => (
  <script type="application/ld+json" set:html={JSON.stringify(block)} />
))}
```

Lalu di layout artikel:

```astro
---
import SeoJsonLd from '../components/SeoJsonLd.astro';
import { articleSchema, faqSchema, breadcrumbSchema } from '../data/schema/panduan-kerja-ke-jepang-2026.ts';
---
<head>
  <SeoJsonLd schema={[articleSchema, faqSchema, breadcrumbSchema]} />
</head>
```

Simpan ketiga objek di file `.ts` terpisah supaya mudah diperbarui tanpa menyentuh markup.

**Pola B — inline di halaman.** Cukup tempel di dalam `<head>`:

```astro
<script type="application/ld+json" set:html={JSON.stringify(articleSchema)} />
<script type="application/ld+json" set:html={JSON.stringify(faqSchema)} />
<script type="application/ld+json" set:html={JSON.stringify(breadcrumbSchema)} />
```

**Tiga jebakan yang harus dihindari:**

1. **Jangan pakai `is:inline` bersamaan dengan `set:html`.** Di Astro, `set:html` sudah mencegah escaping; menambahkan `is:inline` bisa membuat Astro melewatkan pemrosesan dan `JSON.stringify` tidak berjalan.
2. **Jangan taruh `<script type="application/ld+json">` di dalam `<body>` setelah pulau Preact.** Karena situs ini Astro SSG + pulau Preact, script yang di-hydrate bisa hilang saat Preact mengambil alih DOM. Taruh di `<head>`, di luar komponen Preact.
3. **Validasi setelah build.** Jalankan `astro build`, buka halaman hasil, lalu uji di [validator.schema.org](https://validator.schema.org) dan [Rich Results Test](https://search.google.com/test/rich-results). Tiga error yang paling sering muncul: `image` tidak ada, `datePublished` format salah (harus `YYYY-MM-DD`), dan `author` kosong.

---

# 5. PELUANG FEATURED SNIPPET — 3 TARGET

## Target 1 — Paragraph snippet: "Berapa biaya kerja ke Jepang?"

**Lokasi:** H2 "Berapa Biaya Kerja ke Jepang? Ini Rinciannya"

**Kutipan pembuka sekarang (24 kata):**
> "Biaya kerja ke Jepang bukan satu angka, melainkan kumpulan komponen. **Biaya yang wajar selalu bisa dijelaskan baris per baris** — kalau hanya ada satu angka besar tanpa rincian, itu tanda bahaya pertama."

**Penilaian: BELUM MEMENUHI SYARAT.**
Framing-nya bagus dan bernada tegas, tapi **tidak menjawab pertanyaannya**. Snippet untuk "berapa biaya kerja ke Jepang" butuh nominal atau rentang dalam 40–55 kata pertama. Kalimat di atas hanya memberi prinsip, bukan angka. Google akan memilih kompetitor yang menyebut angka, sekalipun angkanya lebih kabur.

**Kalimat pengganti yang saya sarankan** (52 kata — ganti 2 kalimat pertama H2 ini):

> Biaya kerja ke Jepang lewat LPK terdiri dari sembilan komponen: pelatihan bahasa, asrama, seragam dan modul, ujian JFT-Basic dan uji keterampilan, medical check-up, paspor, visa, tiket, dan biaya jasa lembaga. Totalnya berbeda per lembaga dan per jalur, jadi tidak ada satu angka universal — sebagai contoh konkret, biaya program ASJ Rp 6.000.000 dan bisa dicicil. Biaya yang wajar selalu bisa dijelaskan baris per baris.

Kenapa versi ini lebih baik:
- **"sembilan komponen"** konsisten persis dengan tabel komponen biaya di bawahnya (9 baris) — konsistensi internal adalah sinyal snippet yang kuat.
- Menyebut **Rp 6.000.000** sebagai contoh berlabel → menjawab "berapa" tanpa mengklaim universal.
- Mempertahankan kalimat penutup asli yang bernada tegas (bagus untuk diferensiasi).
- 52 kata, di dalam jendela optimal 40–55.

## Target 2 — List snippet: "Syarat kerja ke Jepang 2026"

**Lokasi:** H2 "Syarat Kerja ke Jepang 2026"

**Kutipan pembuka sekarang (14 kata):**
> "Syaratnya terbagi tiga: administratif, bahasa, dan fisik. Yang paling sering menggagalkan kandidat justru yang terakhir."

**Penilaian: GAGAL untuk list snippet.**
Ini kegagalan struktural, bukan kegagalan kalimat. Persyaratan **tersebar di 5 H3** (umum / bahasa / uji keterampilan / fisik / dokumen), sehingga Google tidak menemukan satu blok list 6–8 item untuk diekstrak. Brief §1.5 secara eksplisit menetapkan target ini sebagai *list snippet* — dan strukturnya tidak mendukung.

**Perbaikan: tambahkan SATU list terkonsolidasi tepat setelah kalimat pembuka, sebelum H3 pertama.** Pertahankan kalimat pembuka apa adanya (sudah bagus), lalu sisipkan:

> Ringkasnya, tujuh syarat inti yang harus kamu penuhi:
>
> 1. **Usia** sesuai ketentuan jalur — program ASJ: 18–28 tahun.
> 2. **Pendidikan** minimal SMA/SMK sederajat.
> 3. **Uji keterampilan** lulus di bidang yang dilamar.
> 4. **Bahasa** JFT-Basic level A2 atau JLPT N4 ke atas.
> 5. **Kesehatan** sehat jasmani dan rohani, bebas TBC.
> 6. **Fisik** tidak bertato dan tidak bertindik.
> 7. **Dokumen** KTP, KK, akta lahir, ijazah, paspor, surat izin orang tua.
>
> Rincian tiap syarat ada di bagian berikutnya.

Kenapa ini bekerja:
- 7 item, semuanya **<15 kata** ✓ (syarat brief §1.5)
- Setiap item dibuka kata kunci tebal → mudah diekstrak sebagai `<li>` snippet
- Tidak menduplikasi isi H3 — hanya meringkas, lalu menautkan ke rincian ("Rincian tiap syarat ada di bagian berikutnya"). Ini mencegah kanibalisasi internal dan menjaga alur baca.
- Kalimat penutup "Rincian tiap syarat..." juga berfungsi sebagai jembatan UX

## Target 3 — Table snippet: perbandingan 3 jalur (SIAP) + peluang yang jauh lebih besar

**Lokasi:** H3 "Tabel perbandingan: Magang vs SSW (i) vs SSW (ii)"

**Penilaian tabel yang ada: SIAP, dengan 3 perbaikan kecil.**
Struktur sudah benar: 4 kolom (≤5 ✓), 6 baris data, header jelas, tidak ada sel gabungan. Caption sumber sudah ada dan menyebut ISA.

Perbaikan:
1. **Jadikan caption semantik.** Saat ini caption berupa teks miring `*Sumber: ISA — ...*` di luar tabel. Ubah jadi `<caption>` di dalam `<table>` agar terbaca mesin sebagai caption tabel.
2. **Hiperlink sumbernya.** "ssw.go.jp" disebut sebagai teks tapi tidak bisa diklik — lihat §7.
3. **Tambahkan satu baris yang belum ada: "Bidang tersedia"** → Pemagangan: mengikuti bidang yang dibuka SO · SSW (i): **19 bidang** · SSW (ii): **11 bidang**. Ini pertanyaan yang sangat sering menyertai perbandingan jalur, dan tidak dimiliki kompetitor mana pun.

**Peluang snippet yang jauh lebih besar — dan tidak dimiliki satu pun kompetitor:**

Tabel upah minimum per prefektur, khusus **prefektur tujuan ASJ**. Situs ASJ menyebut penempatan di **Miyazaki, Okayama, Nagano, Kagoshima**. Saya punya angka resmi MHLW untuk keempatnya. Ini mengubah "angka per prefektur berbeda" dari klaim abstrak menjadi tabel konkret yang relevan langsung dengan pembaca:

| Prefektur tujuan ASJ | Upah minimum 2026 (¥/jam) | Berlaku mulai |
|---|---|---|
| Miyazaki | **1.085** (sebelumnya 1.023) | 24 Okt 2026 |
| Okayama | **1.104** (sebelumnya 1.047) | 2 Okt 2026 |
| Nagano | **1.117** (sebelumnya 1.061) | 2 Okt 2026 |
| Kagoshima | **1.090** (sebelumnya 1.026) | 25 Okt 2026 |
| *Pembanding: Tokyo* | *1.280 (sebelumnya 1.226)* | *1 Okt 2026* |
| *Pembanding: Osaka* | *1.231 (sebelumnya 1.177)* | *1 Okt 2026* |

Sumber: MHLW, 令和8年度地域別最低賃金の全国一覧, diakses 22 Okt 2026.

⚠️ **Detail presisi yang wajib dicatat:** per tanggal artikel (22 Oktober 2026), angka **Miyazaki dan Kagoshima belum berlaku** (efektif 24–25 Oktober). Ini justru membuktikan klaim draf "penerapannya bertahap" dengan bukti tanggal nyata — dan sekaligus menunjukkan penulis benar-benar membaca sumbernya. Rumuskan: *"Miyazaki ¥1.085 (berlaku 24 Oktober 2026; sebelumnya ¥1.023)"*.

Tabel ini sekaligus menyelesaikan H2 "Bidang Pekerjaan" yang tipis (238 kata) dan memberi alasan konkret bagi pembaca untuk percaya pada angka ASJ.

### ⚠️ RISIKO YANG HARUS DITAMBAL SEBELUM TABEL INI DIPASANG

**Temuan dari 链接策略师, dan ini valid — saya masukkan sebagai syarat, bukan catatan pinggir.**

Rata-rata nasional tertimbang **¥1.177**, tapi rentang prefektur **¥1.085–¥1.280**. Artinya **keempat prefektur tujuan ASJ semuanya berada di bawah ¥1.177**. Pembaca yang membaca "rata-rata nasional ¥1.177" lalu melihat "Miyazaki ¥1.085" akan menyimpulkan artikelnya salah hitung — padahal keduanya benar. Yang berbeda adalah **rata-rata tertimbang vs angka per prefektur**.

Ini persis jenis kontradiksi-yang-terlihat yang akan dipakai kompetitor untuk mendiskreditkan halaman. Kalau tabel prefektur dipasang tanpa penjelas, snippet-nya berubah dari aset menjadi bumerang.

**Wajib: satu kalimat penjelas SEBELUM tabel.** Rumusan yang saya sarankan:

> Angka ¥1.177 adalah **rata-rata nasional tertimbang** — dihitung dengan bobot jumlah pekerja di tiap prefektur, sehingga prefektur berpenduduk besar seperti Tokyo (¥1.280) dan Kanagawa (¥1.279) menarik rata-rata ke atas. Konsekuensinya, **sebagian besar prefektur justru berada di bawah ¥1.177**, termasuk keempat prefektur tujuan ASJ di bawah ini. Rata-rata nasional bukan angka yang kamu terima: upah minimum yang berlaku untukmu adalah **angka prefektur tempat kamu bekerja**.

Kenapa kalimat ini justru memperkuat artikel, bukan melemahkannya:
- **Menjelaskan mekanisme, bukan menyembunyikan selisih.** Pembaca yang paham konsep rata-rata tertimbang akan percaya pada seluruh angka lain di artikel.
- **Menegaskan relevansi prefektur** — yang memang sudah menjadi klaim draf di H3 "Upah minimum Jepang 2026" ("Angka per prefektur berbeda"). Kalimat ini mengubah klaim itu dari peringatan menjadi penjelasan.
- **Konsisten dengan posisi merek** "kami sebut angka, termasuk yang tidak enak didengar". Angka prefektur yang lebih rendah dari rata-rata nasional *adalah* berita yang tidak enak — dan menyebutnya lebih jujur daripada membiarkan pembaca menemukannya sendiri.

**Tanpa kalimat ini, tabel prefektur sebaiknya tidak dipasang sama sekali.**

---

# 6. AUDIT ANGKA BERISIKO

> Ini bagian terpenting dari laporan. Saya memverifikasi setiap angka ke sumber primer pada 22 Oktober 2026. Hasilnya: **akurasi draf jauh lebih baik dari yang saya duga — dengan satu kesalahan digit yang justru fatal karena menyangkut angka paling vital.**

## 6.1 Tabel putusan

| # | Item | Status di draf | Verdict | Tindakan sebelum tayang |
|---|---|---|---|---|
| 1 | **Upah minimum ¥1.176/jam** | Dikutip sebagai "keputusan Dewan Upah Minimum Pusat, Juli 2026", **tanpa URL**, 7 kemunculan | 🔴 **ANGKA SALAH.** Angka resmi MHLW = **¥1.177** (naik ¥56, +5,0% dari ¥1.121) | **P0 — WAJIB DIPERBAIKI.** Ganti ¥1.176 → **¥1.177** di 7 lokasi + hitung ulang seluruh tabel gaji (§6.3). Tautkan ke MHLW |
| 2 | **¥1.121 (tahun sebelumnya)** | "naik dari ¥1.121 setahun sebelumnya" | 🟢 **BENAR — terverifikasi** (angka pra-revisi resmi di PDF MHLW) | Pertahankan. Tambahkan tautan |
| 3 | **173 jam/bulan** | "Dengan asumsi standar sekitar 173 jam kerja per bulan" | 🟡 **Label terlalu kuat.** Kata "asumsi standar" menyiratkan standar industri; ini sebenarnya asumsi aritmetika | **P1 — cukup diberi label, JANGAN diberi tautan** (tidak ada angka resmi). Ubah jadi: *"dengan asumsi 173 jam/bulan — aritmetika sederhana dari 40 jam × 4,33 minggu"*. Dengan derivasi ditampilkan, pembaca bisa memverifikasi sendiri bahwa itu asumsi, bukan klaim |
| 4 | **Lembur +25%** | Digolongkan sebagai "asumsi ilustrasi" | 🟢 **Sebenarnya FAKTA HUKUM, bukan asumsi.** Labor Standards Act §37 menetapkan premi lembur minimum 25% | **P1 — NAIKKAN statusnya.** Ini peluang E-E-A-T gratis: *"25% adalah tarif **minimum** menurut hukum; banyak perusahaan membayar lebih"* + tautan MHLW. Mengubah kelemahan jadi sinyal keahlian |
| 5 | **Potongan pajak + asuransi ±15%** | Asumsi ilustrasi | 🟡 **Murni ilustrasi — JANGAN diberi tautan.** Tidak ada angka tunggal resmi; tarif bervariasi per penghasilan, prefektur, dan status tanggungan | **P1 — pertahankan label, perkuat.** *"15% adalah angka ilustrasi, bukan tarif. Potongan riil berbeda per prefektur dan tingkat penghasilan."* |
| 6 | **Asrama ¥25.000/bulan** | Asumsi ilustrasi | 🟡 **Ilustrasi — JANGAN diberi tautan.** Berkisar dari ¥0 (ditanggung perusahaan) sampai ¥50.000+ | **P1 — pertahankan label, tambahkan rentang.** *"Bisa ¥0 bila perusahaan menanggung penuh."* Rentang lebih jujur daripada satu angka |
| 7 | **Kurs ¥1 ≈ Rp 113 (Okt 2026)** | "Ilustrasi bertanggal" | 🟡 **Sudah dilabeli & bertanggal ✓** tapi **sumber kurs tidak disebut** | **P1.** Tambah *"kurs referensi pasar"* + tautan ke **JISDOR Bank Indonesia** + *"periksa kurs hari ini"*. Paragraf "kurs berubah-ubah" sudah ada ✓ — pertahankan |
| 8 | **COE 1–3 bulan** | Bersumber ssw.go.jp (teks miring, **tanpa hyperlink**) | 🟢 **BENAR — terverifikasi.** Halaman ISA menyatakan: *"It takes one to three months to issue a certificate of eligibility"* | **P0 — jadikan hyperlink.** Isi sudah benar; hanya mekanisme sitasi yang gagal |
| 9 | **19 bidang SSW (i)** | "kini mencatat 19 bidang" | 🟢 **BENAR — terverifikasi.** Halaman ISA menyatakan eksplisit: *"allows people to work in the following 19 fields"*. Saya hitung manual: tepat 19 ✓ | **P0 — jadikan hyperlink.** Pertahankan angka |
| 10 | **11 bidang SSW (ii)** | "hanya 11 bidang" | 🟢 **BENAR — terverifikasi.** ISA: *"the following 11 fields"* | Pertahankan + tautkan |
| 11 | **"16 bidang" vs "19 bidang"** | Draf: *"Sebagian materi resmi lain masih menyebut 16 bidang"* | 🟡 **Angkanya benar ada, tapi ATRIBUSINYA SALAH.** "16" bukan dari "materi resmi lain" — itu dari **halaman ISA yang sama**: `ssw.go.jp/en/about/step/` menulis *"Of the 16 industrial fields…"*, sedangkan `ssw.go.jp/en/about/visa/` menulis *"19 fields"* | **P0 — perbaiki atribusi.** Lihat rumusan di §6.2 |
| 12 | **"3 bidang detail masih disiapkan"** | "tiga bidang baru yang halaman detailnya masih disiapkan" | 🟢 **BENAR — terverifikasi.** Tepat 3: Resource Recycling, Linen Services, Logistics Warehouse | Pertahankan. Bonus: sebut ketiganya, bukan hanya Logistics Warehouse |
| 13 | **Food Service ditutup** | "tidak menerima aplikasi baru saat ini" | 🟢 **BENAR — terverifikasi.** ISA: *"We are not accepting new applications at this time."* | Pertahankan + tautkan |
| 14 | **Rp 6.000.000 (biaya ASJ)** | Ditautkan ke `/public` | 🟢 **Sah — angka milik klien sendiri**, konsisten dengan beranda | Pertahankan. ⚠️ Catatan: `/public` adalah halaman CSR tanpa teks terindeks |
| 15 | **UU No. 18 Tahun 2017** | Benar, disebut 2× | 🟢 **BENAR** | Pertahankan. Bisa ditautkan ke JDIH/`peraturan.go.id` |
| 16 | **"Upah minimum prefektur berlaku penuh"** | H3 Jalur 2 | 🟢 **BENAR** — konsisten dengan ISA ("same salary as Japanese workers") | Pertahankan |
| 17 | **N3 untuk transportasi & kereta; uji tambahan kaigo** | H3 Syarat bahasa | 🟢 **BENAR — terverifikasi persis** di halaman ISA | Pertahankan + tautkan |

## 6.2 Rumusan ulang untuk isu "16 vs 19 bidang" (P0)

Draf sekarang:
> "Halaman resmi Immigration Services Agency of Japan (ISA) kini mencatat **19 bidang** untuk SSW tipe i, termasuk tiga bidang baru yang halaman detailnya masih disiapkan. **Sebagian materi resmi lain masih menyebut 16 bidang.**"

Masalah: pembaca akan menyimpulkan ada dua lembaga berbeda yang tidak sinkron. Kenyataannya **satu lembaga, dua halaman, tidak sinkron** — dan itu lebih menarik sekaligus lebih jujur.

Rumusan pengganti:
> "Halaman daftar bidang resmi ISA mencatat **19 bidang** untuk SSW tipe i, termasuk tiga bidang yang halaman detailnya masih disiapkan. Menariknya, halaman lain di situs ISA yang sama — *Steps to Working in Japan* — masih menulis **16 bidang**. Keduanya resmi, keduanya dari ISA, dan selisihnya muncul karena daftar ini diperbarui bertahap. **Karena itu, periksa halaman detail bidang yang kamu incar sebelum mendaftar**, jangan berpegang pada angka totalnya."

Kenapa ini lebih baik:
- **Akurat secara faktual** (bukan salah atribusi)
- **Menunjukkan penulis benar-benar membaca sumber primer** — ini sinyal E-E-A-T yang tidak bisa dipalsukan
- **Memberi tindakan** kepada pembaca (periksa halaman bidang spesifik), bukan sekadar informasi
- Menetralkan risiko: kalau angka berubah lagi, framing ini tetap benar
- **Bisa diuji, bukan sekadar dipercaya** — ini penajaman dari 链接策略师 dan argumennya lebih kuat daripada rumusan awal saya: begitu kedua tautan ISA terpasang, pembaca bisa membuka `/visa/` dan `/step/` lalu memverifikasi kontradiksinya sendiri. Klaim yang bisa diperiksa lebih bernilai daripada klaim yang hanya minta dipercaya.

> **Akar masalahnya adalah kata "lain", bukan angkanya.** Draf menulis "sebagian materi resmi **lain** masih menyebut 16 bidang" — kata itu menyiratkan **lembaga lain**, sehingga pembaca menyimpulkan ada dua otoritas yang tidak sinkron. Faktanya satu lembaga, dua halaman. Begitu tautan terpasang, salah atribusi ini akan langsung terlihat — jadi **P0-5 dan P0-2 harus dikerjakan bersamaan**, bukan berurutan.

## 6.3 Angka turunan yang HARUS dihitung ulang

Karena basis ¥1.176 → ¥1.177, **seluruh tabel gaji berubah**. Saya sudah hitung ulang. Sampaikan ke 内容撰稿人 / 内容编辑 — jangan dikerjakan manual.

**Basis baru:** ¥1.177 × 173 jam = **¥203.621**
**Tarif lembur:** ¥1.177 × 1,25 = ¥1.471,25 → **dibulatkan ¥1.471** untuk tabel

> **Catatan pembulatan (penting — 内容编辑 bisa menerima dua versi angka).** 链接策略师 menghitung tarif lembur eksak **¥1.471,25**; saya membulatkan ke **¥1.471** agar tabel terbaca. Keduanya benar, selisihnya tidak material: dengan ¥1.471 → lembur 10 jam ¥14.710, 20 jam ¥29.420. Dengan ¥1.471,25 → ¥14.712,50 dan ¥29.425. **Pakai versi bulat (¥1.471)** — tabel simulasi gaji dengan angka desimal di setiap sel lebih sulit dibaca, dan selisihnya hanya ¥2,50–5 pada angka ratusan ribu yen. Yang **tidak boleh** berbeda adalah basis ¥1.177 × 173 = **¥203.621** — itu angka yang akan diverifikasi pembaca dengan kalkulatornya sendiri.

| Komponen | A: 0 jam lembur | B: 10 jam lembur | C: 20 jam lembur |
|---|---|---|---|
| Gaji kotor dasar (¥1.177 × 173) | ¥203.621 | ¥203.621 | ¥203.621 |
| Upah lembur (¥1.471 × jam) | ¥0 | ¥14.710 | ¥29.420 |
| **Gaji kotor total** | **¥203.621** | **¥218.331** | **¥233.041** |
| Potongan pajak + asuransi (±15%) | −¥30.543 | −¥32.750 | −¥34.956 |
| Biaya asrama | −¥25.000 | −¥25.000 | −¥25.000 |
| **Take-home** | **≈ ¥148.078** | **≈ ¥160.581** | **≈ ¥173.085** |

Verifikasi aritmetika: 203.621 − 30.543 − 25.000 = 148.078 ✓ · 218.331 − 32.750 − 25.000 = 160.581 ✓ · 233.041 − 34.956 − 25.000 = 173.085 ✓

**Konversi rupiah (kurs Rp 113):**
- A: ¥148.078 × 113 ≈ **Rp 16,7 juta** (tetap)
- B: ¥160.581 × 113 ≈ **Rp 18,1 juta** (tetap)
- C: ¥173.085 × 113 ≈ **Rp 19,6 juta** ← **berubah dari 19,5**

**Klaim "selisih lebih dari 27%":** (203.621 − 148.078) / 203.621 = **27,28%** → klaim tetap sah ✓

**Catatan positif:** aritmetika draf yang lama **sepenuhnya benar** untuk basis ¥1.176 (¥203.448, ¥30.517, ¥147.931 semuanya akurat). Kesalahannya murni di angka basis, bukan di perhitungan. Itu kabar baik — hanya perlu satu variabel diganti.

## 6.4 Putusan tegas: apa yang WAJIB, apa yang CUKUP DILABELI, apa yang SEBAIKNYA DIHAPUS

### 🔴 WAJIB diberi tautan resmi sebelum tayang

| Angka | Sumber wajib | URL |
|---|---|---|
| ¥1.177/jam + ¥1.121 + rentang prefektur | **MHLW** — 地域別最低賃金の全国一覧 (令和8年度) | `https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/index.html` |
| COE 1–3 bulan | **ISA** — Steps to Working in Japan | `https://www.ssw.go.jp/en/about/step/` |
| 19 bidang SSW (i) · 11 bidang SSW (ii) · Food Service ditutup | **ISA** — What Is the "Specified Skilled Worker" Status of Residence | `https://www.ssw.go.jp/en/about/visa/` |
| 5 tahun · tanpa keluarga · gaji setara · N3 transportasi · uji kaigo | **ISA** — halaman yang sama | `https://www.ssw.go.jp/en/about/visa/` |
| Lembur minimum 25% (bila dinaikkan statusnya) | **MHLW** — 労働基準 / 時間外労働 | `https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/index.html` |
| UU No. 18/2017 | JDIH (sudah ada ✓) / `peraturan.go.id` | `https://jdih.bp2mi.go.id` |

**Semua URL di atas saya buka dan verifikasi ada pada 22 Oktober 2026.** Tautan internal `/loker`, `/siswa-baru`, dll. sudah ada dan tidak perlu diubah.

> **⚠️ JANGAN pakai `mhlw.go.jp` root sebagai alternatif.** Saya sempat menawarkan jalan tengah ini (root + navigasi manual) bila URL dalam ditolak karena alasan kepatuhan. **Saya tarik — itu rekomendasi yang buruk, dan 链接策略师 benar menolaknya.**
>
> Alasannya: anchor-nya menjanjikan *"daftar upah minimum per prefektur"*, sedangkan halaman root MHLW **tidak menampilkan daftar itu**. Itu **cacat yang sama persis** dengan tautan `/public` yang jadi temuan utama laporan 链接策略师 — janji anchor tidak dipenuhi tujuan. Memperbaiki satu tautan rusak dengan membuat tautan rusak baru adalah kemunduran.
>
> **Putusan yang benar: kalau URL MHLW dalam ditolak, lepas tautan MHLW sepenuhnya.** H2 Gaji tanpa tautan tetap berfungsi dan artikel masih punya 4 tautan eksternal otoritatif. Tautan yang mengulang cacat lebih buruk daripada tidak ada tautan.
>
> Ini prinsip yang berlaku untuk seluruh tabel di atas: **lebih baik tidak menautkan daripada menautkan ke halaman yang tidak memuat angka yang dijanjikan.**

### ✅ Status verifikasi ¥1.177 — TERKONFIRMASI, kontinjensi ditutup

Untuk kejelasan: **¥1.177 bukan angka yang masih menggantung.** Saya mengekstraknya langsung dari PDF resmi MHLW, bukan dari artikel sekunder. Baris ringkasan di PDF (令和8年度地域別最低賃金全国一覧):

```
1,177 （ 1,121 ) 56 5.0% -
全国加重平均
※ 括弧内の数字は改定前の地域別最低賃金額
```

Angka ini adalah 全国加重平均 atas **答申された改定額** (jumlah hasil rekomendasi dewan upah minimum prefektur) untuk tahun fiskal 2026. Kualifikasi satu-satunya: ini angka **hasil rekomendasi**, dan penerapannya bergeser per prefektur antara 1 Oktober–2 Desember 2026 — bukan berarti semua prefektur sudah menerapkannya pada 22 Oktober.

Konsekuensi untuk tim: 链接策略师 **tidak perlu** mencabut kontinjensi §5.3 atau mengembalikan GAP #2 — dasarnya tidak gugur. Yang benar tetap ¥1.177.

### 🟡 CUKUP DIBERI LABEL — jangan diberi tautan

| Angka | Label yang benar |
|---|---|
| 173 jam/bulan | "asumsi aritmetika: 40 jam × 4,33 minggu" — **tampilkan derivasinya**, jangan sebut "standar" |
| Potongan ±15% | "angka ilustrasi, bukan tarif resmi. Potongan riil berbeda per prefektur dan penghasilan" |
| Asrama ¥25.000 | "ilustrasi. Bisa ¥0 bila ditanggung perusahaan, bisa lebih tinggi di kota besar" |
| Kurs Rp 113 | "kurs referensi pasar per Oktober 2026; kurs bergerak — periksa hari ini" |
| Estimasi tahap 1–4 & 6 (timeline) | sudah berlabel ✓ *"perkiraan alur umum, bukan jaminan"* — pertahankan |

**Prinsip:** angka yang tidak punya sumber tunggal resmi **tidak boleh** diberi tautan palsu. Memberi tautan ke sumber yang tidak benar-benar menyebut angka itu **lebih buruk** daripada tidak memberi tautan sama sekali — itu menciptakan kesan verifikasi yang tidak ada.

### ⚫ SEBAIKNYA DIHAPUS / DIHINDARI

| Item | Alasan |
|---|---|
| **"4.160 kata"** di blok meta bawah artikel | Hitungan sebenarnya **3.733** (dengan tabel) / **3.410** (tanpa tabel). Kalau blok ini tidak sengaja terbit, ini kesalahan faktual yang memalukan. Perbaiki atau hapus |
| **Frasa "asumsi standar"** untuk 173 jam | Kata "standar" menyiratkan norma industri yang tidak dapat dibuktikan. Ganti dengan derivasi aritmetika |
| **Klaim rupiah tunggal ala beranda** ("upah minimum 15–25 juta/bulan") | Draf **sudah benar** tidak mengulanginya ✓. Jangan pernah dimasukkan. (Beranda ASJ masih memuatnya — lihat §8 catatan untuk team-lead) |

### Yang **tidak** perlu dikhawatirkan

Draf **sudah patuh** pada seluruh batasan brief §8: nol angka mitra/kandidat/keberangkatan, nol testimoni, nol janji hasil, status LPK-bukan-SO dinyatakan eksplisit dan akurat, dan klaim "tidak ada jaminan" diulang 3×. **Tidak ada pelanggaran kebijakan.** Yang saya temukan murni soal mekanisme sitasi, bukan soal integritas.

---

# 7. DAFTAR WAJIB-PERBAIKI

## P0 — BLOCKER (jangan tayang tanpa ini)

**P0-1 · Perbaiki ¥1.176 → ¥1.177 di 7 lokasi, lalu hitung ulang tabel gaji**
Lokasi persis: baris **26** (TL;DR), **47** (Apa yang Berubah), **228** (H3 Upah minimum), **238** (Simulasi gaji kotor), **250** (asumsi tabel), **254** (baris tabel "Gaji kotor dasar"), **465** (FAQ #2). Lalu ganti seluruh angka tabel + rupiah Skenario C sesuai §6.3.
Alasan: angka resmi MHLW tahun fiskal 2026 adalah **¥1.177**, bukan ¥1.176. Ini angka yang menjadi fondasi seluruh bagian gaji.

**P0-2 · Tambahkan hyperlink ke `ssw.go.jp` dan MHLW — saat ini NOL**
Lokasi: (a) caption tabel 3 jalur (baris 112) — "ssw.go.jp" disebut tapi tidak bisa diklik; (b) catatan timeline (baris 298) — "ssw.go.jp/en/about/step/"; (c) footnote bidang (baris 389) — "ssw.go.jp/en/about/visa/"; (d) H3 Upah minimum (baris 228) — tambah tautan MHLW yang belum ada sama sekali.
Alasan: artikel menjual "kami sebut angka" tapi tidak menautkan satu pun angka. Ini kontradiksi yang merusak tesis artikel.

**P0-3 · Tambahkan `image` + `datePublished` + `author`, dan 1 gambar nyata**
Lokasi: frontmatter. Saat ini **0 gambar** di 3.733 kata. Google mensyaratkan `image` untuk rich result Article — tanpa itu schema gagal validasi.
Alasan: rich result tidak akan tayang; artikel 3.733 kata tanpa gambar juga kalah di engagement dan Discover.

**P0-4 · Tambahkan `BreadcrumbList` ke array schema, dan putuskan nasib `/blog`**
Lokasi: frontmatter `schema: ["Article", "FAQPage"]`. Situs belum punya `/blog` — pilih varian A (buat indeks) atau B (slug root) di §4.3/§4.4.
Alasan: breadcrumb adalah elemen SERP yang murah dan langsung terlihat. Menandai crumb ke halaman 404 = pelanggaran schema.

**P0-5 · Perbaiki atribusi "16 bidang" — bukan "materi resmi lain", tapi halaman ISA yang sama**
Lokasi: baris 48 dan baris 389. Gunakan rumusan §6.2.
Alasan: draf menyiratkan dua lembaga berbeda; faktanya satu lembaga, dua halaman. Rumusan baru justru menaikkan kredibilitas.

## P1 — PENTING (pengaruhi peringkat & snippet)

**P1-1 · Konsolidasi 7 syarat inti jadi satu list di bawah H2 Syarat**
Lokasi: tepat setelah baris 126 ("Syaratnya terbagi tiga..."), sebelum H3 pertama. Pakai list §5 Target 2.
Alasan: tanpa ini, target list snippet brief §1.5 tidak mungkin direbut.

**P1-2 · Tulis ulang pembuka H2 "Berapa Lama Proses Kerja ke Jepang?"**
Lokasi: baris 285. Sekarang dibuka *"Tidak ada satu angka tunggal."* — jawaban negatif, buruk untuk snippet.
Ganti dengan: *"Proses kerja ke Jepang terbagi enam tahap, dan totalnya bergantung pada kesiapan bahasamu — bukan pada tanggal pendaftaran. Tahap penerbitan COE saja butuh 1–3 bulan."*
Alasan: H2 ini menjawab long-tail #4 (prioritas ⭐⭐⭐) tapi dibuka dengan penyangkalan.

**P1-3 · Tulis ulang pembuka H2 Biaya & H2 Gaji agar memuat angka**
Lokasi: baris 171 (Biaya) dan baris 224 (Gaji). Pakai rumusan §5 Target 1.
Alasan: dua H2 terbesar (310 & 392 kata) dibuka dengan framing tanpa angka — snippet untuk "biaya" dan "gaji" butuh nominal.

**P1-4 · Tambahkan 8 frasa utama + 11 varian di 8 zona kosong**
Lokasi: sesuai tabel §1.5. Target: frasa utama 0,48% → **0,70%**; semua varian 0,72% → **1,02%**.
Alasan: 8/14 H2 nol varian; `program kerja Jepang` nol kemunculan padahal varian wajib brief.

**P1-5 · Ganti meta description 122 char → 146 char dengan CTA**
Lokasi: frontmatter `description` + blok meta bawah (baris 513).
Gunakan: `Kerja ke Jepang 2026: rincian biaya, upah per jam, simulasi gaji bersih, timeline 6 tahap, dan 7 tanda agensi tidak resmi. Cek dulu sebelum bayar.`
Alasan: description sekarang 122 char (di bawah optimal 150–160) dan tanpa CTA.

**P1-6 · Naikkan status "lembur +25%" dari asumsi → fakta bersumber**
Lokasi: baris 250 dan caption tabel (baris 261).
Alasan: 25% adalah tarif **minimum menurut hukum**, bukan asumsi. Ini peluang E-E-A-T gratis.

**P1-7 · Ganti meta title ke opsi front-loaded**
Lokasi: frontmatter `title` + baris 512. Gunakan `Kerja ke Jepang 2026: Syarat, Biaya, Gaji & Proses` (50 char).
Alasan: frasa utama pindah dari karakter ke-9 → ke-1.

**P1-8 · Ubah anchor `/siswa-baru` yang ada — JANGAN tambah tautan kedua**
Lokasi: baris 143. Anchor sekarang "pendaftaran siswa pelatihan bahasa Jepang" → ganti jadi **"kelas bahasa Jepang dari dasar"**.
~~Alasan awal saya: brief §4 meminta 2 penempatan `/siswa-baru`.~~ **REVISI — saya menarik rekomendasi penambahan tautan kedua di langkah 9.** 链接策略师 memverifikasi bahwa `/siswa-baru` saat ini **tidak terender sebagai formulir**, melainkan layar loading ("MEMUAT ASJ OS V7…", ±10 kata). Menambah tautan ke halaman yang belum berfungsi menambah risiko, bukan nilai. Brief §4 ditulis sebelum kondisi ini diketahui. **Anchor yang lebih deskriptif sudah cukup** — dan anchor baru itu memang lebih baik karena mencocokkan niat pencarian ("kelas bahasa Jepang") alih-alih mendeskripsikan halaman tujuan.

## P2 — NICE-TO-HAVE

| # | Item | Lokasi | Tindakan |
|---|---|---|---|
| P2-1 | Hapus duplikasi TL;DR vs H2-1 (hemat ±165 kata) | baris 22–27 vs 31–39 | Pertahankan kotak TL;DR di intro, hapus H2 "Ringkasan Cepat" |
| P2-2 | Tambah baris "Bidang tersedia" di tabel 3 jalur | baris 103–110 | 19 / 11 bidang — pertanyaan yang belum terjawab tabel |
| P2-3 | Tambah tabel upah minimum per prefektur tujuan ASJ | H2 Bidang atau H2 Gaji | Data terverifikasi ada di §5 Target 3 |
| P2-4 | Sebut 3 bidang "detail under construction" lengkap | baris 387 | Saat ini hanya Logistics Warehouse; tambah Resource Recycling & Linen Services |
| P2-5 | Tambah Fishery & Aquaculture ke daftar bidang | baris 379–388 | Sektor besar untuk pekerja Indonesia, saat ini terlewat |
| P2-6 | Tambahkan syarat fisik konkret ASJ (160 cm / 50 kg pria) | baris 153 | Situs ASJ sudah mempublikasikannya — lebih spesifik daripada "berbeda per bidang" |
| P2-7 | Tambahkan nomor SK Kemenkumham di H2 Legalitas | baris 355–361 | `AHU-0063921.AH.01.01.TAHUN 2023` — sinyal kepercayaan kuat, sudah ada di beranda |
| P2-8 | Tautkan "situs resmi Kementerian..." yang menggantung | baris 202 | Kalimat menyuruh merujuk situs tanpa memberi tautan |
| P2-9 | Perbaiki klaim "4.160 kata" | baris 517 | Sebenarnya 3.733 (dengan tabel) / 3.410 (tanpa tabel) |
| P2-10 | Ubah H3 FAQ "Apakah kerja ke Jepang aman dan legal?" | baris 475 | Nyaris kembar dengan judul H2-9; pertimbangkan "Bagaimana cara cek agensi resmi?" |
| P2-11 | Jadikan caption tabel semantik `<caption>` | 4 tabel | Saat ini caption berupa teks miring di luar tabel |
| P2-12 | Pertimbangkan pangkas H2 "Kenapa Banyak Orang..." | baris 48–72 | 154 kata, nol kata kunci, ROI konversi terendah |

---

# 8. CATATAN UNTUK ANGGOTA TIM LAIN

## → 内容撰稿人 (Content Writer)
Angka basis upah **¥1.176 salah, yang benar ¥1.177**. Saya sudah menghitung ulang seluruh tabel di §6.3 — pakai angka itu, jangan hitung manual. Selain itu: **akurasi fakta ISA-mu luar biasa** — saya verifikasi 9 klaim satu per satu dan semuanya benar. Jangan ubah isinya; cukup tambahkan tautan. Tiga kalimat pembuka H2 yang perlu ditulis ulang ada di §5 dan P1-2/P1-3.

## → 内容编辑 (Content Editor)
Tiga hal untuk pass penyuntingan: (1) terapkan 10 sisipan kata kunci di §1.5 — **jangan lebih**, target maksimum 0,70% frasa utama; (2) hapus duplikasi TL;DR vs H2-1 (P2-1); (3) pastikan teks FAQ di artikel **identik** dengan `acceptedAnswer` di §4.5, karena saya sudah menyesuaikan jawaban #2 ke ¥1.177.

## → 链接策略师 (Link Strategist)
Sembilan tautan sekarang, semua anchor deskriptif — bagus. Tiga catatan: (1) **`ssw.go.jp` dan MHLW belum ditautkan sama sekali** — ini prioritas tertinggi, 6 klaim bergantung padanya; (2) **saya menarik rekomendasi `/siswa-baru` 2×** — temuan Anda bahwa halaman itu masih layar loading lebih kuat daripada brief §4, jadi saya ikut rekomendasi Anda: ganti anchor, jangan tambah tautan. Brief §4 ditulis sebelum kondisi halaman diketahui; tolong catat itu sebagai koreksi brief; (3) **semua target internal kecuali `/` adalah CSR tanpa teks terindeks** — jadi bobot tautan mengalir ke halaman yang tidak bisa memeringkat. Pertimbangkan apakah `/loker` butuh fallback HTML statis agar bisa menerima otoritas dari pillar ini.

> **Catatan konvergensi:** Anda dan saya sampai pada temuan yang sama secara independen — sitasi `ssw.go.jp` di caption tabel tidak bisa diklik. Itu dua jalur audit berbeda menunjuk satu cacat yang sama, jadi naikkan prioritasnya. Satu hal yang Anda belum sentuh dan saya temukan: **angka upah di draf salah** (¥1.176 seharusnya ¥1.177 menurut PDF resmi MHLW). Saat menambahkan tautan MHLW, pakai angka yang sudah dikoreksi — kalau tidak, tautannya akan menunjuk sumber yang membantah artikelnya sendiri.

## → team-lead (3 keputusan yang butuh persetujuan)

1. **`/blog` belum ada di situs.** Slug di frontmatter mengasumsikan `/blog/...` tapi tidak ada halaman indeks. Pilih: buat `/blog` sekarang (disarankan — klaster pillar butuh hub) atau pindahkan slug ke root. Ini memblokir BreadcrumbList (P0-4).

2. **Kanibalisasi: brief saling bertentangan.** §1.3 melarang membidik `syarat kerja ke Jepang` & `gaji kerja di Jepang`; outline §3 justru memberi H2 dengan judul persis itu. Saya sarankan pertahankan H2 di pillar tapi beri sudut berbeda tajam pada artikel pendukung nanti. Butuh keputusan sebelum artikel pendukung ditulis.

3. **Beranda ASJ masih memuat "Upah minimum 15–25 juta per bulan".** Artikel **sudah benar** tidak mengulanginya (sesuai brief §8.6), tapi pembaca yang klik dari artikel ke `/` akan melihat klaim berbeda. Angka 15–25 juta itu sebenarnya **gaji kotor** (Tokyo ¥1.280 × 173 × 113 ≈ Rp 25 juta), sedangkan artikel menyajikan **take-home Rp 16,7 juta** — bukan kontradiksi, tapi berpotensi terbaca sebagai janji. Saya sarankan artikel menambahkan satu kalimat pembeda eksplisit: *"Angka rupiah di halaman lain ASJ adalah gaji kotor; take-home selalu lebih kecil."*

---

# 9. CHECKLIST SEBELUM TAYANG

- [ ] **P0-1** ¥1.176 → ¥1.177 di 7 lokasi + tabel gaji dihitung ulang
- [ ] **P0-2** Hyperlink ke `ssw.go.jp/en/about/visa/`, `ssw.go.jp/en/about/step/`, MHLW
- [ ] **P0-3** `image` + `datePublished` + `author` di frontmatter + minimal 1 gambar nyata
- [ ] **P0-4** `BreadcrumbList` ditambahkan; nasib `/blog` diputuskan
- [ ] **P0-5** Atribusi "16 bidang" diperbaiki
- [ ] Frasa utama di H1 ✓ (sudah)
- [ ] Frasa utama di 100 kata pertama ✓ (sudah)
- [ ] Frasa utama di ≥2 judul H2 ✓ (sudah — 9/14)
- [ ] Kepadatan frasa utama 0,8–1,5% → target **0,70%** (pragmatis untuk bahasa Indonesia)
- [ ] `program kerja Jepang` muncul ≥2× (sekarang 0)
- [ ] 8 zona kosong H2 diisi sesuai §1.5
- [ ] 7 syarat inti jadi list terkonsolidasi di H2 Syarat
- [ ] Pembuka H2 Proses/Biaya/Gaji ditulis ulang memuat jawaban langsung
- [ ] Meta title 50 char, frasa utama di depan
- [ ] Meta description 146 char, memuat CTA
- [ ] Slug `/blog/panduan-kerja-ke-jepang-2026` dipertahankan
- [ ] 9+ tautan internal dengan anchor deskriptif ✓ (sudah) + anchor `/siswa-baru` diganti jadi "kelas bahasa Jepang dari dasar"
- [ ] ≥2 tautan eksternal otoritatif → target **4–6** (sekarang 2, keduanya pemerintah Indonesia; nol Jepang)
- [ ] Panjang 3.000+ kata ✓ (3.733)
- [ ] Hierarki H1→H2→H3 bersih ✓ (1/14/48/0)
- [ ] Rata-rata kalimat <25 kata ✓ (12,3)
- [ ] Gambar punya alt text memuat kata kunci → **belum ada gambar sama sekali**
- [ ] Kesimpulan punya CTA jelas ✓ (sudah, ke `/loker`)
- [ ] Tidak ada tautan rusak
- [ ] Format ramah mobile (tabel bisa di-scroll horizontal)
- [ ] Nol klaim terlarang: tanpa angka mitra, testimoni, janji hasil ✓ (sudah)
- [ ] Status LPK-bukan-SO akurat ✓ (sudah)
- [ ] JSON-LD lolos [Rich Results Test](https://search.google.com/test/rich-results)
- [ ] Teks FAQ di artikel identik dengan `acceptedAnswer` di schema

---

# 10. KESIMPULAN

**Status: Needs Minor Fixes. Estimasi 90–120 menit.**

Ini draf yang **jauh di atas rata-rata** untuk niche ini. Baseline kompetitor est. 600–1.500 kata tanpa tabel biaya, tanpa simulasi gaji, tanpa panduan anti-penipuan (brief §2.2). Draf ini 3.733 kata dengan 4 tabel, simulasi 3 skenario yang **aritmetikanya benar**, timeline 6 tahap, dan 7 red flag. Sembilan klaim ISA-nya saya verifikasi satu per satu — **semuanya akurat**.

Masalahnya bukan kualitas penulisan. Masalahnya **mekanisme sitasi dan optimasi teknis**:

- Angka paling vital **salah satu digit** (¥1.176 vs ¥1.177) — dan saya sudah memberi angka benar beserta URL-nya
- **Nol hyperlink** ke sumber utama, padahal artikel menjual transparansi angka
- **Nol gambar** di 3.733 kata, sehingga schema Article tidak akan menghasilkan rich result
- Kepadatan kata kunci **0,48%** — under-optimized, bukan stuffed
- 8 dari 14 H2 adalah zona kosong kata kunci

Semua P0 bersifat **mekanis dan murah** — tidak ada yang menuntut penulisan ulang struktural. Setelah P0 + P1 diterapkan, artikel ini realistis berada di **83–86/100** dan punya posisi diferensiasi yang nyata: satu-satunya panduan berbahasa Indonesia yang menyebut angka **dan** menautkan sumbernya.

---

# LAMPIRAN A — Data MHLW terverifikasi (dasar koreksi ¥1.176 → ¥1.177)

**Sumber primer:** 厚生労働省 (MHLW), 「令和8年度 地域別最低賃金 全国一覧」
**Halaman:** `https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/index.html`
**PDF:** `https://www.mhlw.go.jp/content/11200000/001753404.pdf`
**Diakses:** 22 Oktober 2026 · **Diekstrak langsung dari PDF** (bukan dari artikel sekunder)

**Baris ringkasan resmi (persis dari PDF):**
```
1,177 （ 1,121 ) 56 5.0% -
全国加重平均
※ 括弧内の数字は改定前の地域別最低賃金額
```

Artinya: **全国加重平均 = ¥1.177**, angka pra-revisi ¥1.121 (dalam kurung), kenaikan ¥56, laju kenaikan 5,0%.

**Data prefektur relevan (diekstrak dari PDF yang sama):**

| Prefektur | 2026 (¥/jam) | Sebelumnya | Naik | % | Berlaku mulai |
|---|---|---|---|---|---|
| 北海道 Hokkaido | 1.131 | 1.075 | 56 | 5,2% | 1 Okt 2026 |
| 東京 Tokyo | **1.280** | 1.226 | 54 | 4,4% | 1 Okt 2026 |
| 神奈川 Kanagawa | 1.279 | 1.225 | 54 | 4,4% | 1 Okt 2026 |
| 大阪 Osaka | **1.231** | 1.177 | 54 | 4,6% | 1 Okt 2026 |
| 愛知 Aichi | 1.195 | 1.140 | 55 | 4,8% | 1 Okt 2026 |
| 京都 Kyoto | 1.180 | 1.122 | 58 | 5,2% | 16 Nov 2026 |
| 兵庫 Hyogo | 1.172 | 1.116 | 56 | 5,0% | 1 Okt 2026 |
| **長野 Nagano** ★ | **1.117** | 1.061 | 56 | 5,3% | 2 Okt 2026 |
| **岡山 Okayama** ★ | **1.104** | 1.047 | 57 | 5,4% | 2 Okt 2026 |
| **鹿児島 Kagoshima** ★ | **1.090** | 1.026 | 64 | 6,2% | 25 Okt 2026 |
| **宮崎 Miyazaki** ★ | **1.085** | 1.023 | 62 | 6,1% | 24 Okt 2026 |
| 沖縄 Okinawa | 1.086 | 1.023 | 63 | 6,2% | 2 Des 2026 |

★ = prefektur tujuan penempatan ASJ menurut beranda `asjastro.netlify.app` (Pengolahan Makanan: Miyazaki · Okayama; Pertanian: Miyazaki · Nagano; Peternakan: Kagoshima).

**Temuan tambahan:** rentang nasional 2026 adalah **¥1.085 (Miyazaki) – ¥1.280 (Tokyo)** — selisih ¥195/jam atau 18%. Tanggal berlaku tersebar dari **1 Oktober sampai 2 Desember 2026**, yang mengonfirmasi klaim draf *"penerapannya bertahap"* dengan bukti tanggal nyata. Per 22 Oktober 2026 (tanggal artikel), Miyazaki dan Kagoshima **belum** menerapkan angka barunya.

---

# LAMPIRAN B — Verifikasi klaim ISA

**Sumber:** `https://www.ssw.go.jp/en/about/visa/` dan `https://www.ssw.go.jp/en/about/step/`, diakses 22 Oktober 2026.

| # | Klaim di draf | Status | Kutipan sumber |
|---|---|---|---|
| 1 | SSW (i) maksimal 5 tahun | ✅ BENAR | "You can work in Japan for a total of five years." |
| 2 | SSW (i) tidak bisa bawa keluarga | ✅ BENAR | "You cannot bring your family to Japan." |
| 3 | SSW (i) gaji sama dengan pekerja Jepang | ✅ BENAR | "You receive the same salary as Japanese workers." |
| 4 | SSW (ii) tanpa batas masa tinggal | ✅ BENAR | "There is no upper limit to the length you can stay in Japan." |
| 5 | SSW (ii) bisa bawa keluarga | ✅ BENAR | "You can bring your family to Japan." |
| 6 | SSW (i) = 19 bidang | ✅ BENAR (dihitung manual: tepat 19) | "allows people to work in the following 19 fields" |
| 7 | SSW (ii) = 11 bidang | ✅ BENAR | "allows people to work in the following 11 fields" |
| 8 | Food Service tidak menerima aplikasi baru | ✅ BENAR | "We are not accepting new applications at this time." |
| 9 | 3 bidang detail masih disiapkan | ✅ BENAR | Resource Recycling, Linen Services, Logistics Warehouse — "The details page is under construction." |
| 10 | COE 1–3 bulan | ✅ BENAR | "It takes one to three months to issue a certificate of eligibility" |
| 11 | JFT-Basic A2 atau JLPT N4 | ✅ BENAR | "either the Japan Foundation Test for Basic Japanese (JFT-Basic) or the Japanese-Language Proficiency Test (JLPT) level N4 or higher" |
| 12 | N3 untuk transportasi & kereta | ✅ BENAR | "you need to pass JLPT level N3 or higher" |
| 13 | Kaigo perlu uji tambahan | ✅ BENAR | "you need to pass the Nursing Care Japanese Language Evaluation Test in addition to JLPT N4" |
| 14 | Harus perbarui status sebelum pindah kerja | ✅ BENAR | "you must change your status of residence before you begin working at a different company" |
| 15 | Tidak boleh pindah bidang | ✅ BENAR | "changing your employment to a different field is not permitted" |
| 16 | Pemagangan = izin memperoleh keterampilan | ✅ BENAR | "Technical Intern Training is a status of residence for acquiring skills, but Specified Skilled Worker is a status of residence for working." |
| 17 | ISA sarankan cek lembaga berizin & biaya wajar | ✅ BENAR | "check which ones are licensed and whether the fees they charge are reasonable" |
| — | **"Sebagian materi resmi lain menyebut 16 bidang"** | ⚠️ **ATRIBUSI SALAH** | "16" ada di `ssw.go.jp/en/about/step/` — **situs ISA yang sama**: "Of the 16 industrial fields…" |

**Skor akurasi: 17/18 klaim benar.** Satu-satunya masalah adalah atribusi, bukan fakta.

---

*Laporan ini disusun 22 Oktober 2026. Semua angka upah diverifikasi langsung dari PDF resmi MHLW; semua klaim ISA diverifikasi langsung dari ssw.go.jp. Angka volume pencarian dan data SERP tidak tersedia untuk sesi ini dan tidak dikarang — bila dibutuhkan, tandai [ESTIMASI] dan validasi di Search Console setelah 30 hari.*
