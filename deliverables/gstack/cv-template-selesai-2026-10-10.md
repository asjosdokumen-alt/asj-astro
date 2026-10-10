# Template CV — SELESAI (2026-10-10)

Fitur yang diminta pemilik: admin meng-upload template (kosongan atau sudah
berisi contoh terisi penuh), sistem mengisinya dari database kandidat, keluar CV
hasil regenerasi. **Admin-only.**

## Alur yang sekarang jalan

1. **Tab Config → bagian "Template CV"** (`TabConfig.tsx`)
2. Isi **nama template** + **WA kandidat contoh**, pilih berkas `.xlsx`
3. **Analisa** — di browser: `analyzeFromExample` (peta sel→field) +
   `detectRiwayatBlock` (tabel pendidikan/pekerjaan/keluarga). Ringkasannya
   ditampilkan: *N sel terpetakan · M perlu Anda pilih · K tabel riwayat ·
   J field belum tertampung*
4. **Sel `ambiguous` ditampilkan satu per satu** dengan dropdown. Yang dibiarkan
   kosong **tidak diisi** — kalau ikut, satu nilai bisa ditulis ke sel yang salah
5. **Simpan** → berkas ke Storage (`cv-templates/`), record ke `sys_config`
   (`config_type='cv_template'`)
6. **Modal kandidat → "Buat CV dari template"** → pilih template → berkas diambil
   dari `fileUrl` → `applyFieldMap` + `applyRiwayatBlock` mengisi data kandidat
   **ini** → unduh `.xlsx`

## Commit

| Commit | Isi |
|---|---|
| `38ee235` | `analyzeFromExample` — belajar peta sel→field dari contoh |
| `ec38c0f` | `detectRiwayatBlock` + `applyRiwayatBlock` (+ pembersihan baris sisa) |
| `b22876e` | kontrak record `sys_config` + decode defensif |
| `ea658e9` | 3 aksi backend tersambung (7 titik wiring) |
| `abbd225` | UI admin: upload, tinjau peta, pilih sel ambiguous, simpan |
| `539a027` | tombol "Buat CV dari template" di modal kandidat |
| `a5f…` | `applyRiwayatBlock` menambah baris saat riwayat lebih panjang dari contoh |

## Keputusan arsitektur (dan alasannya)

- **Penyimpanan `sys_config` + Storage**, bukan tabel baru — tanpa DDL, sesuai
  pilihan pemilik.
- **Pengisian berkas terjadi di BROWSER**, bukan di server: `xlsx` adalah pustaka
  klien, dan `src/` tidak bisa di-import dari `netlify/functions/`. Konsekuensinya
  server hanya CRUD `sys_config` (tanpa berkas baru ⇒ ratchet `indexer` tidak
  bergeser) dan tidak perlu men-decode record.
- **Identitas baris riwayat = NAMA**, bukan `tingkat+sekolah` — dua sumber
  menulis tingkat dengan ejaan berbeda untuk sekolah yang sama, dan itu yang
  membuat baris kembar (`f71d5b7`).

## Gate terakhir

`tsc` 0 · `lint-ratchet` PASSED · `verify:binding` pass · `verify:entries` OK ·
`bundle:size` pass · `action-registry` 16 tes · `i18n.keys` 7 tes · vitest
frontend+backend **179 berkas** (1 merah = artefak sandbox `spawnSync git EBUSY`
di `_lib/fcm-server.test.ts`, tidak terkait).

## Belum tercakup (bukan bug)

- **docx/pdf** belum bisa diregenerasi — loader-nya mengembalikan HTML, bukan
  berkas. xlsx dulu, sesuai keputusan pemilik.
- Template **tidak** menghapus berkasnya dari Storage saat record dihapus
  (dikonfirmasi di dialognya). Menutup ini butuh aksi backend baru (signed
  delete URL) ⇒ 7 titik wiring lagi, jadi sengaja belum.

## ✅ Ditutup 2026-10-10: riwayat lebih panjang daripada contoh

Dulu `applyRiwayatBlock` hanya mengisi sampai `block.rows` (jumlah baris di
CONTOH). Kandidat dengan 5 sekolah pada template contoh 3 baris **kehilangan 2
entri terakhirnya tanpa jejak** — berkasnya tetap terlihat wajar.

Sekarang barisnya **ditambah**: `shiftRowsDown()` menggeser seluruh isi sheet di
bawah tabel turun sebanyak baris yang dibutuhkan, beserta `!ref`, `!merges`,
`!rows`, dan `!autofilter`. (SheetJS komunitas tidak punya `insert_row`, jadi
penggeseran dilakukan manual — dan kunci lama dihapus SELURUHNYA sebelum kunci
baru ditulis, supaya sel yang sudah pindah tidak menimpa sel yang belum pindah.)

Tes: `e2e/cv-template-riwayat.test.ts` — 3 tes baru (baris bertambah, isi di
bawah tabel ikut turun, sel gabungan ikut turun). Dibuktikan bisa merah: dengan
penyisipan dimatikan, ketiganya gagal.

## ⚠️ Temuan 2026-10-10: tampilan & fitur template HILANG saat regenerasi

Ini yang paling perlu diketahui sebelum fitur dipakai serius, dan **bukan** salah
satu dari tiga batas di atas — saya temukan saat memeriksa jalur tulis.

### Sebabnya: `.xlsx` memisahkan "isi" dari "tampilan"

Tampilan tidak menempel di sel. Ia ada di **tabel gaya bersama**
(`xl/styles.xml`: fonts/fills/borders), dan tiap sel hanya menyimpan **nomor
indeks** ke tabel itu. Dropdown ada di tempat lain lagi (`<dataValidation>` di XML
sheet), gambar di folder terpisah (`xl/drawings/` + `xl/media/`), pengaturan cetak
di `<pageSetup>`/`<printOptions>`.

`xlsx` di repo ini adalah **SheetJS 0.20.3 build komunitas**
(`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). **Membaca DAN menulis
gaya adalah fitur build Pro (berbayar)** — writer komunitas membangun ulang berkas
hanya dari nilai sel + merges, jadi bagian-bagian lain tidak pernah ditulis. Bukan
bug kode kita; batas build gratisnya.

Bukti struktural: berkas asli **17 bagian** → hasil regenerasi **11 bagian**.
`xl/styles.xml` masih ada tapi isinya hanya elemen root (fonts/fills/borders
kosong), `xl/drawings/` dan `xl/media/image1.png` hilang total.

### DUA jenis kehilangan — dan yang pertama TIDAK butuh ganti library

Diukur pada template rirekisho nyata
(`deliverables/gstack/_rirekisho-excel-sample-2026-10-01.xlsx`, 61.873 byte):

| | asli, baca **default** (= jalur app sekarang) | asli, baca `cellStyles:true` | sesudah `write` |
|---|---|---|---|
| lebar kolom | 0 | 26 | **26 ✓** |
| tinggi baris | 0 | 1000 | **1000 ✓** |
| format angka non-General | 0 | 31 | **31 ✓** |
| sel bergaya (font/warna/border/perataan) | 0 | 62 | **0 ✗** |
| sel gabungan | 83 | 83 | 83 ✓ |

Baris pertama itu intinya: `openWorkbookFromUrl` membaca **tanpa** `cellStyles`,
jadi lebar kolom, tinggi baris, dan format angka **bahkan tidak pernah dimuat**.
Ketiganya **selamat kalau opsi bacanya diperbaiki** — tanpa ganti library.

Yang benar-benar butuh library lain hanya **tampilan** (font, ukuran, tebal, warna
isi, warna huruf, border, perataan).

Efek samping `cellStyles:true`: sheet jadi 25.934 sel (dari 154) dan berkas
27.848 → **482.123 byte** (~17×). Bisa diterima untuk berkas unduhan, tapi harus
disadari.

### Fitur juga hilang, bukan cuma tampilan

Diperiksa langsung dari isi berkas (regex atas tiap part XML):

| | asli | regenerasi |
|---|---|---|
| `<dataValidation>` (**dropdown**) | **8** | **0** |
| gambar tertanam (`xl/media/image1.png`, `drawing1.xml`) | ada | **hilang** |
| `pageSetup` / `printOptions` | ada | **hilang** |
| `sharedStrings` | ada | tidak ada (ditulis inline — setara, bukan masalah) |
| `<mergeCell>` | 83 | 83 ✓ |
| `<f>` (rumus) | 0 | 0 — SheetJS menulis rumus, template ini kebetulan tidak punya |

Dropdown hilang karena SheetJS **tidak meng-*baca* data validation sama sekali**:
saat dibaca, kunci `!dataValidations` tidak ada. Informasinya tidak pernah masuk
ke memori, jadi mustahil ikut tertulis. Hal yang sama untuk gambar (tidak ada
`!images`), freeze pane, autofilter, dan conditional formatting.

### Artinya

CV hasil regenerasi menaruh data di sel yang benar, tapi tampilannya **bukan**
tampilan template. Untuk rirekisho — yang identitas visualnya justru grid bergaris
— ini terlihat jelas. Hasilnya lebih tepat disebut "data dipindah ke sheet"
daripada "CV sesuai template".

### Pilihan (belum dipilih — keputusan dependensi + berat bundel klien)

| opsi | cakupan | catatan |
|---|---|---|
| **A. Perbaiki opsi baca saja** (`cellStyles:true`, `cellNF:true`) | lebar kolom, tinggi baris, format angka | **tanpa dependensi baru**; font/border/dropdown/gambar TETAP hilang |
| **B. `exceljs` 4.4.0** (MIT, aktif, tersedia di registry) | semuanya: gaya, dropdown, gambar, page setup | punya `spliceRows()` ⇒ menggantikan `shiftRowsDown()` manual **dan** mewarisi gaya baris template untuk baris tambahan; paket besar (~1 MB) di browser |
| **C. `xlsx-js-style` 1.2.0** | font/warna/border/perataan | perubahan paling kecil (ganti import), tapi tidak dirawat aktif, berbasis 0.18, dan **tidak** menyelesaikan dropdown/gambar |
| **D. SheetJS Pro** | semuanya | berbayar |
| **E. Terima apa adanya** | — | berkas dipakai sebagai sumber data, bukan dicetak apa adanya |

Rekomendasi: **B**. A bisa dikerjakan lebih dulu sebagai jaring pengaman kalau
ingin hasil lebih baik tanpa menunggu keputusan dependensi, tapi ia setengah jalan
— dan kalau B dipilih, A jadi pekerjaan terbuang.

Catatan penempatan: pengisian berkas terjadi di **browser** (lihat "Keputusan
arsitektur"), jadi B/C menambah berat halaman admin. Kalau itu mengganggu, logika
`exceljs` bisa dipindah ke server — tapi `netlify/functions/**` dihitung counter
beku `indexer`, jadi berkas baru di sana menggeser gate.

