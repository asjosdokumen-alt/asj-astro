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

## ⚠️ Temuan 2026-10-10: GAYA template HILANG saat regenerasi

Ini yang paling perlu diketahui sebelum fitur dipakai serius, dan **bukan** salah
satu dari tiga batas di atas — saya temukan saat memeriksa jalur tulis.

`xlsx` di repo ini adalah **SheetJS 0.20.3 build komunitas**
(`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). Build komunitas
menulis `.xlsx` **tanpa gaya**: `XLSX.write` tidak pernah mengeluarkan atribut
`s` pada sel.

Diukur pada template rirekisho nyata
(`deliverables/gstack/_rirekisho-excel-sample-2026-10-01.xlsx`, 61.873 byte):

| | |
|---|---|
| dibaca `cellStyles: true` | **62 sel bergaya** (isi `FFF2CB`, font, dsb.) |
| setelah `write` → `read` ulang | **0 dari 62** bertahan — semua jadi `{"patternType":"none"}` |

- **Bertahan:** teks, posisi sel, `!merges` (83), `!cols`, `!rows`, `!ref`.
- **Hilang:** font, ukuran, tebal, warna isi, warna huruf, **garis/border**,
  perataan.

Catatan tambahan: pemanggil saat ini (`openWorkbookFromUrl`) membaca **tanpa**
`cellStyles`, jadi gaya bahkan tidak pernah dimuat.

**Artinya:** CV hasil regenerasi menaruh data di sel yang benar, tapi tampilannya
bukan tampilan template. Untuk rirekisho — yang identitas visualnya justru grid
bergaris — ini terlihat jelas. Hasilnya lebih tepat disebut "data dipindah ke
sheet" daripada "CV sesuai template".

**Pilihan (belum dipilih — ini keputusan dependensi + ukuran bundel klien):**

1. **`xlsx-js-style`** — fork SheetJS yang bisa MENULIS gaya. Perubahan paling
   kecil (ganti import), tapi paketnya tidak dirawat aktif dan berbasis 0.18.
2. **`exceljs`** — MIT, aktif, baca+tulis gaya penuh, dan punya `spliceRows()`
   yang menggantikan `shiftRowsDown()` manual. Lebih besar di bundel klien.
3. **SheetJS Pro** — berbayar.
4. **Terima tanpa gaya** — berkas dipakai sebagai sumber data, bukan untuk
   dicetak apa adanya; gaya diserahkan ke jalur cetak/PDF nanti.
