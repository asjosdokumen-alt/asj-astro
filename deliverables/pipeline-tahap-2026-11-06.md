# Tahap pipeline: tiga kosakata menjadi satu — 2026-11-06

## Masalah

Dasbor kandidat menampilkan tahap seleksi yang **salah** untuk sebagian kandidat,
dan dropdown admin bisa **menghapus** data saat disimpan.

### 1. Ada tiga daftar tahap yang berbeda, tidak ada yang jadi acuan

| Sumber | Isi |
|---|---|
| `sys_config.list_tahapan` (resmi, dikelola dari tab Pengaturan) | `LIST` · `CHECK KAIWA` · `MENDAN` · `MENSETSU` · `LOLOS USER` · `MCU PARPOR` · `PROSES COE` · `TTD KONTRAK` · `VISA` · `FLIGHT` |
| `TAHAPAN_STEPS` di `CandidateDash.tsx` | `PENDAFTARAN` · `CHECK KAIWA` · `MENDAN` · `LOLOS USER` · `MCU` · `PEMBERKASAN` · `NAITEI` · `COE` · `VISA` · `FLIGHT` |
| Nilai warisan di `database_candidate.tahapan_seleksi` | `LIST` (92) · kosong (85) · `Pendaftaran` (51) · `Baru` (30) · `Seleksi Berkas` (2) · `MCU PARPOR` (1) |
| `TAHAPAN_OPTIONS` di `EditCandidateModal.tsx` | `Baru` · `Pendaftaran` · `LIST` · `MCU PARPOR` · `Wawancara` · `LULUS` |

Akibatnya:

- **`MENSETSU` dan `TTD KONTRAK` tidak dikenali** kode dasbor → jatuh ke indeks 0
  → kandidat yang sedang diwawancara melihat **"PENDAFTARAN"** dan bilah
  kemajuan **mundur ke 10%**.
- `MCU PARPOR` dikenali sebagai `MCU` (indeks 4 dari daftar lama, seharusnya 5).
- `PROSES COE` dikenali sebagai `COE` (indeks 7, seharusnya 6).
- Daftar di modal admin hanya **2 dari 7** nilainya cocok dengan daftar resmi.
  Itu sebabnya `Baru` (30 baris) dan `Pendaftaran` (51 baris) masuk ke database:
  admin memilihnya dari dropdown yang salah.

### 2. Menyimpan modal edit bisa mengosongkan status kandidat

`<select value="Gagal">` yang daftar opsinya tidak memuat `Gagal` akan tampil
sebagai opsi pertama (`- Pilih -`). Admin membuka modal untuk mengubah nomor HP,
menekan Simpan, dan **status kandidat ikut terhapus** — tanpa pernah diminta.

Nilai yang kena (terukur 2026-11-06): `Gagal` 7 · `Pending` 45 · `BARU` 1 ·
`LIST` 1 · `MCU PARPOR` 1. Tidak satu pun ada di `STATUS_OPTIONS`.

## Yang diperbaiki

### `src/lib/tahapanPipeline.ts` (baru)

Satu pemilik urutan tahap:

- `TAHAPAN_STEPS` = isi `sys_config.list_tahapan`, urut sesuai pipeline.
- `ALIAS` memetakan nilai lama ke indeks kanonik, dengan alasan per baris
  (`Pendaftaran`/`Baru`/`Seleksi Berkas` → 0, `MCU`/`Medical`/`Pemberkasan` → 5,
  `COE`/`Naitei` → 6, `Kontrak` → 7, `Berangkat` → 9).
- `tahapanStepIndex()` mengembalikan **-1** untuk nilai tak dikenal — bukan 0.
  Pencocokan sebagian memilih tahap **terpanjang**, supaya `MCU PARPOR` tidak
  kalah oleh `MCU`.
- `tahapanLabel()` menampilkan `LIST` sebagai **"PENDAFTARAN"** untuk kandidat.
  Nilainya tetap `LIST` di database dan di panel admin.
- `tahapanProgress()` memberi 0 untuk tahap tak dikenal: bilah yang bergerak
  tanpa dasar sama menyesatkannya dengan bilah yang mundur.
- `opsiDenganNilaiSaatIni()` menyisipkan nilai tersimpan yang tidak ada di daftar
  opsi, sehingga dropdown tidak pernah menghapus data diam-diam.

### Dasbor kandidat

- Tahap diambil dari `r.tahapan` **saja**. Dulu ada `|| r.status`, dan `r.status`
  adalah status **mail** (`MENUNGGU`/`GAGAL`), bukan tahap seleksi — untuk 85
  baris yang tahapnya kosong, nilai mail itulah yang dipakai sebagai "tahap".
- Label tahap di kartu pipeline, `aria-label` bilah, strip 10 tahap, subjudul
  sambutan, dan kartu dossier semuanya memakai label kanonik yang sama.

### Modal edit admin

- Daftar tahap memakai `TAHAPAN_STEPS` (bukan daftar sendiri).
- Kedua `<select>` (tahap dan status) menyisipkan nilai yang tersimpan tapi tidak
  ada di daftar, sehingga **Simpan tidak lagi mengosongkan** kolom.

### Data

- `status_kandidat` `Gagal` (7 baris) → `GAGAL`, satu-satunya varian huruf dari
  nilai yang sudah ada di dropdown admin.
- **Tidak disentuh** (butuh keputusan pemilik, bukan tebakan): `Pending` (45),
  `BARU` (1), `LIST` (1), `MCU PARPOR` (1). Tiga yang terakhir adalah **tahap**
  yang tersimpan di kolom **status** — kemungkinan salah input lama; nilai
  tahapnya sendiri tetap utuh di `tahapan_seleksi`.

## Verifikasi

| Gerbang | Hasil |
|---|---|
| `tsc --noEmit` | 0 error |
| frontend | 141 berkas / 1 839 tes |
| backend | 129 berkas / 1 706 tes |
| indexer | 649 berkas · 34 168 simbol |
| `verify:binding` | 107 action / 18 surface, 0 orphan |
| `verify:entries` | OK |
| `verify:schema` | 35 tabel IN SYNC |
| `verify:rls` | OK |
| `lint-ratchet` | PASS (utang −13) |
| `typecheck:ratchet` | PASS |
| `build` | 19 halaman |

Tes baru: 15 di `src/lib/tahapanPipeline.test.ts` (termasuk regresi `MENSETSU` →
3 dan `TTD KONTRAK` → 7) + 2 di `EditCandidateModal.test.tsx` (nilai tak dikenal
tidak hilang saat modal dirender).

## Gerbang bundle: dua yang merah sudah hijau

`npm run bundle:size` gagal sebelum pekerjaan ini karena dua hal yang berasal
dari fitur kotak masuk kandidat (`54fe1cb` / `3e3b2f4` / `5d84342`). Keduanya
selesai di sesi ini — **tanpa menaikkan plafon**.

| Entry | Sebelum | Sesudah | Batas |
|---|---|---|---|
| `files.js` | 600,1 KB **OVER** | **193,4 KB** | plafon keras 600 KB |
| `notify.js` | 127,4 KB (+39%) | **96,8 KB** (+5,6%, dalam toleransi) | ratchet +5% / +8 KB |
| `job-docs.js` | (belum ada) | 492,2 KB | plafon keras 600 KB |

### Apa yang sebenarnya terjadi

**1. Satu action ZIP membebani setiap unggahan.** `surfaces/docs.ts` mengimpor
`* as documents`, dan satu baris `documents.handleDownloadJobDocs` cukup untuk
menarik `archiver` + rantai `readable-stream` / `compress-commons` / `zip-stream`
(~70 KB) ke `files.js`. Action itu sekarang punya entry sendiri (`job-docs.js` +
`surfaces/job-docs.ts`) dengan impor SEMPIT: satu modul, satu handler.

**2. Impor dinamis membatalkan tree-shaking.** Empat action kotak masuk memanggil
`await import(...)` ke konteks identity di dalam badan handler. esbuild tidak
bisa memangkas impor dinamis, jadi **seluruh** konteks identity ikut — termasuk
`bcryptjs` (19 KB) dan repository-nya. Terukur per modul: `bcryptjs` 19 KB +
`identity/service` 5 KB + `identity/repository` 2 KB = **26 KB dari 36 KB**
pertumbuhan. Impor statis di puncak berkas memulihkan tree-shaking.

**3. Sisi baca tidak butuh tumpukan kirim.** `_lib/notifikasi/kandidat.ts` dipecah
menjadi `kotak-masuk.ts` (validasi, tulis, daftar, tandai dibaca — DB saja) dan
`kandidat.ts` (tulis LALU kirim push). `notify.js` hanya memakai yang pertama.
Aturan `isAdminWa` pindah ke `_lib/fcm-token-rules.ts` supaya
`getStatusNotifikasiAdmin` bisa menghitung perangkat tanpa menarik `fcm-server`.

### Bukti, bukan dugaan

- `node scripts/ci/bundle-size.mjs --why=<entry>` dipakai untuk melihat modul
  terberat per entry.
- Pertumbuhan `notify.js` diatribusikan dengan membangun dua versi (dengan dan
  tanpa empat action) lalu membandingkan `metafile.inputs` per berkas.
- Percobaan pertama (memindahkan `getAdminTokens`) **tidak** menurunkan ukuran;
  penyebab sebenarnya impor dinamis. Percobaan yang gagal itu dibatalkan, bukan
  ditinggalkan sebagai "perbaikan".

### Yang perlu diingat

`job-docs.js` 492 KB masih di bawah plafon, tapi ia menanggung seluruh rantai ZIP.
Kalau nanti ada action lain yang butuh `archiver`, tambahkan ke entry yang sama —
jangan dikembalikan ke `files.js`.
