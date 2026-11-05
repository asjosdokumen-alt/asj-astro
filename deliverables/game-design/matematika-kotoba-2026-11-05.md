# Matematika & Kotoba — sistem yang ditambahkan (2026-11-05, lanjutan)

Dokumen ini menjawab dua pertanyaan pemilik setelah arcade diperbaiki:
"untuk kotoba dan matematika gimana?" dan "matematika terlalu membosankan,
psikotesnya rendah, semua repetitif cuma beda angka".

Perubahan arcade sendiri ada di `arcade-systems-2026-11-05.md`.

---

## 1. Matematika — tiga keluhan, tiga perbaikan

| Keluhan | Penyebab yang ditemukan di kode | Perbaikan |
|---|---|---|
| "Semua repetitif, cuma beda angka" | `buatRonde` membuat **20 soal SATU kategori**. Pilih kraepelin → 20 penjumlahan berturut-turut | **Simulasi Seleksi**: satu ronde 20 soal **campuran** 13 jenis (14 dengan soal cerita), tidak ada jenis yang sama dua kali berturut-turut |
| "Psikotesnya rendah, tidak sesuai ekspektasi" | Tidak ada kesulitan yang menanjak: `easy`/`medium`/`hard` dipilih rata, dan `deret` easy **selalu** pola +n (`acak(1,1)`) | Kurva di dalam ronde: sepertiga awal easy, tengah medium, akhir hard. `deret` easy kini 2 pola (tambah tetap / dikali tetap) |
| "Membosankan" | Hasil hanya satu angka akurasi; tidak ada laporan APA yang lemah | **Rekap per jenis** di layar hasil: bar benar/total per kategori (hijau ≥80%, kuning ≥50%, merah di bawah) |

### 1.1 Simulasi Seleksi (ronde campuran)

- 20 soal / 300 detik, format ujian atau latihan seperti modul lain.
- Kategori yang ikut: kraepelin, kabataku, deret, gyakusan, logika, satuan,
  sansu, suiri, baai — plus `cerita` bila bank server tersedia.
- **Tidak ada kategori yang sama dua kali berturut-turut.** Tas kategori
  dikocok lalu dipakai sampai habis; di batas tas, kategori pertama ditukar
  bila sama dengan soal sebelumnya.
- **Kesulitan menanjak**: soal 1–6 easy, 7–13 medium, 14–20 hard. Pemilih
  kesulitan disembunyikan untuk mode ini — menampilkannya berarti menawarkan
  tombol yang tidak mengubah apa pun.
- Kalau bank cerita habis di tengah ronde, kategori lain menggantikan; ronde
  tidak berhenti setengah jadi (bug yang sama dengan versi HTML aslinya).

### 1.2 Angka yang dipakai

| Hal | Nilai |
|---|---|
| Panjang ronde campuran | 20 soal |
| Batas waktu | 300 detik (15 detik/soal) |
| Komposisi kesulitan | 6 easy · 7 medium · 7 hard |
| Skor | 50 per jawaban benar (tidak berubah) |
| Ambang nilai | S ≥ 90% · A ≥ 75% · B ≥ 60% (tidak berubah) |

Skor tidak diubah: yang diperbaiki adalah **isi ronde**, bukan ekonominya.
Menambah pengali di sini akan membuat perbandingan dengan rekor lama tidak
lagi bermakna.

### 1.3 Rekap per jenis

`rekapPerKategori()` di `src/lib/matematika.ts` menghitung benar/total per
kategori dari riwayat ronde, diurutkan dari yang paling banyak muncul. Kartu
rekap hanya dirender bila ada **lebih dari satu** jenis (jadi modul tunggal
tidak menampilkan satu baris 3/3 yang tidak berguna).

### 1.4 Yang belum dikerjakan

- **Kesulitan adaptif antar-ronde**: sekarang kurva ditentukan di dalam ronde.
  Berikutnya: ronde baru mulai dari tingkat keberhasilan 3 soal terakhir.
- **Penguasaan per kategori** yang disimpan (seperti Leitner di Kotoba), supaya
  "deret 2/3" hari ini bisa dibandingkan dengan minggu lalu.

---

## 2. Kotoba — yang sudah baik, dan satu yang hilang

Kotoba **tidak** ditulis ulang. Isinya sudah punya hal yang diminta di tempat
lain: Leitner 5 kotak, bobot kemunculan (kata yang sering salah lebih sering
muncul), `kataDikuasai` (benar 3× tanpa salah), gelar, streak harian, dan
"ulangi yang salah" di akhir ronde.

Yang hilang adalah **alasan untuk mulai hari ini**: streak menghitung "sudah
berapa hari", tetapi tidak ada angka "hari ini sudah berapa". Skor bisa
dinaikkan kapan saja, jadi tidak ada target yang habis dalam satu duduk.

### 2.1 Misi harian

- Target **20 kata benar per hari** (≈ 2–3 menit — satu jeda kelas).
- Disimpan per tanggal di progres kandidat: `harian: { tanggal, benar }`.
  Membuka-tutup halaman tidak mereset; berganti hari mereset ke 0.
- Hanya jawaban **benar** yang menambah. Salah tidak mengurangi — hukumannya
  sudah ada di Leitner (kotak turun ke 1), dan misi ini mengukur latihan yang
  dilakukan, bukan menghukum kesalahan.
- Tampil sebagai bar tipis di atas tab mode, dengan `✓` saat selesai.

---

## 3. Psikotes — empat dimensi baru dan profil

Keluhan lanjutan pemilik: "untuk test psikologinya gimana, tidak ada upgrade
kah? mengikuti test psikologi online kan sudah banyak." Lalu, setelah tiga
dimensi pertama: "spasial/figural ya tolong, karena ini yang paling sering
muncul saat tes magang."

Auditnya: dari 10 kategori, **semuanya** numerik atau logika angka. Tidak ada
satu pun yang mengukur **ketelitian**, **kemampuan verbal**, **penalaran
silogistik**, atau **spasial** — padahal keempatnya bagian tetap psikotes kerja.
Dan hasilnya hanya satu angka, bukan profil.

### 3.1 Empat kategori baru

| Kategori | Bentuk | Yang diukur | Tingkat |
|---|---|---|---|
| **Ketelitian** | Dua baris angka (8/10/12 digit); hitung posisi yang berbeda | Membandingkan deret tanpa kehilangan posisi — kerja periksa label/nomor part | 1 · 2 · 2–4 beda |
| **Verbal (analogi)** | `PANAS : API = ? : ?` dengan 4 opsi teks | Hubungan kata (alat:sasaran, sebab:akibat, lawan kata) | bank 22 pasangan |
| **Silogisme** | Dua premis; pilih kesimpulan yang PASTI benar | Validitas penalaran, bukan kesan benar | bank 10 bentuk |
| **Figural (spasial)** | Rotasi 90/180/270°, pencerminan vertikal, deret 3 gambar | Rotasi mental dan pencerminan — inti tes figural magang | 3 bentuk dasar |

Bank analogi dan silogisme **ditulis sebagai data, bukan diacak**. Satu bentuk
silogisme yang salah (mis. menyimpulkan "sebagian A adalah C" dari "semua A
adalah B, sebagian B adalah C") akan mengajari penalaran yang keliru — lebih
buruk daripada tidak ada soal.

### 3.2 Figural: gambar sebagai data, bukan berkas gambar

Soal figural disimpan sebagai **data**, bukan PNG/SVG jadi:

```ts
{ bentuk: 'L' | 'pisau' | 'bendera' | …, putar: 0|90|180|270, cermin?: boolean, x?: number, isi?: boolean }
```

Satu komponen `FigurSvg` merendernya menjadi `<path>` di dalam kotak 100×100,
dengan transform `rotate` + `translate/scale` untuk cermin. Akibatnya:

- **0 KB aset baru**, tetap jalan offline, dan warnanya ikut tema
  (`currentColor`) — persis alasan yang sama dengan ikon arcade.
- Rotasi/pencerminan dihitung sebagai fungsi murni (`putarGambar`,
  `cerminGambar`), jadi bisa diuji tanpa merender.
- Deret gambar memakai satu SVG berisi tiga sel (`x: 0,1,2`), bukan tiga
  komponen terpisah.

**Hanya tiga bentuk dasar, dan itu disengaja.** Rotasi dan cermin hanya bisa
dibedakan pada bangun **asimetris**: cermin segitiga sama sisi = segitiga itu
sendiri, dan cermin kotak = kotak. Kalau opsi kembar, soal punya dua jawaban
benar. Generator memeriksa keunikan lewat `kunciGambar` dan mencoba bentuk lain
bila perlu — kegagalan itu tidak pernah sampai ke layar.

`figurMeta` menyimpan mode dan derajat, sehingga tes bisa membuktikan opsi
"benar" memang hasil transformasi yang diminta — bukan sekadar salah satu dari
empat opsi.

### 3.3 Opsi teks tanpa mengganti jalur jawaban

Soal angka memakai `pilihan: number[]` dan `jawab: number`. Untuk soal verbal,
`pilihan` tetap angka — kali ini **indeks 1..4** — dan teksnya ada di
`opsiTeks`. Dengan begitu jalur jawaban, riwayat, dan perbandingan tidak
berubah; hanya tampilan yang membaca teks. `labelJawaban()` memetakan indeks
kembali ke teks di daftar evaluasi, supaya "jawaban Anda: 2" tidak muncul
untuk soal yang opsinya kalimat.

### 3.4 Profil, bukan satu angka

`DIMENSI_KATEGORI` memetakan 14 kategori ke **6 dimensi**:

| Dimensi | Kategori |
|---|---|
| Kecepatan hitung | kraepelin, kabataku |
| Ketelitian | ketelitian, satuan |
| Penalaran | deret, logika, gyakusan, sansu, suiri, baai |
| Verbal | verbal, silogisme |
| Spasial | figural |
| Aplikasi kerja | cerita |

Layar hasil menampilkan bar per dimensi (hijau ≥80%, kuning ≥50%, merah di
bawah), lalu rincian per kategori di dalam `<details>`. Ini yang membuat
hasilnya terbaca seperti **psikotes**, bukan sekadar skor: "verbal 2/4" adalah
kalimat yang bisa ditindaklanjuti, "akurasi 62%" bukan.

### 3.5 Yang belum ada (dan butuh lebih dari generator)

- **Jaring kubus & lipatan kertas** — bentuk figural yang lebih sulit; butuh
  model 3D sederhana atau bank gambar statis. Rotasi/cermin/deret sudah ada,
  ketiganya yang paling sering muncul di tes magang.
- **Memori kerja** (ingat deret lalu ulangi) — butuh fase tampil → sembunyi →
  jawab, yang tidak dimiliki alur satu-layar sekarang.
- **Norma** (persentil dibanding populasi) — butuh data agregat nyata dari
  papan skor, bukan ambang karangan.

---

## 4. Verifikasi

| Gerbang | Hasil |
|---|---|
| `vitest --project=frontend` | 136 berkas · **1.781 tes lulus** |
| `vitest --project=backend` | 127 berkas · **1.686 tes lulus** |
| `e2e/matematika-soal.test.ts` | 30 tes (campuran, ketelitian, verbal/silogisme, figural, dimensi) |
| `e2e/matematika-gate.test.tsx` | 10 tes (opsi teks, opsi gambar, profil sampai selesai) |
| `e2e/arcade.test.tsx` | 19 tes (termasuk rak 4→6 saat kombo, kembali 4 setelah salah) |
| `e2e/kotoba-gate.test.tsx` | 31 tes (termasuk misi harian: ganti hari, tidak menghukum salah) |
| `tsc --noEmit` | 0 error |
| `lint-ratchet` | LULUS |
| `astro build` | 17 halaman |

Catatan jujur: `scripts/ci/shim-coverage.mjs` masih merah karena
`src/components/forms/AiCvForm.tsx:2099` — berkas yang tidak disentuh, dan
ketiga berkas yang diubah sesi ini menyumbang 0 pelanggaran.
