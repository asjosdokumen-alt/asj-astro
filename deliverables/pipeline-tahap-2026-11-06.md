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

## Yang masih merah (bukan dari perubahan ini)

`npm run bundle:size` gagal karena dua hal yang **sudah ada sejak fitur kotak
masuk kandidat** (commit `54fe1cb`/`3e3b2f4`/`5d84342`), terukur:

| Entry | Sekarang | Baseline | Batas |
|---|---|---|---|
| `files.js` | **600,1 KB** | 599,8 KB | plafon keras **600 KB** |
| `notify.js` | **127,4 KB** | 91,7 KB | ratchet +5% / +8 KB |

- `files.js` melewati plafon **0,1 KB** karena plumbing notifikasi (kolom
  `alasan_tolak` di proyeksi + pemetaan). Menariknya bukan dari kotak masuk itu
  sendiri: `contexts/applications/service.ts` **tidak** ada di graf `files.js`.
- `notify.js` naik karena 4 action baru + helper notifikasi. Percobaan
  memindahkan `getStatusNotifikasiAdmin` agar tidak menarik `fcm-helpers` tidak
  menurunkan ukuran (malah +1,3 KB) — jadi penyebabnya bukan itu, dan perubahan
  itu dibatalkan.

**Dua pilihan, keduanya butuh keputusan pemilik** — saya tidak menaikkan plafon
sendiri:

1. **Pecah `files.js`**: pindahkan `downloadJobDocs` (archiver/zip) ke entry
   sendiri. `archiver` + rantai `readable-stream` adalah ~70 KB dari entry ini;
   setelah dipisah, `files.js` turun jauh di bawah plafon dan `notify.js` bisa
   di-re-baseline dengan alasan tercatat.
2. **Re-baseline `notify.js`** (pertumbuhan nyata: 4 action baru) dan shave
   `files.js` 0,2 KB dari kode mati — perlu penelusuran lebih dalam.
