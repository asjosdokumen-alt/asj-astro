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
  (dikonfirmasi di dialognya).
- `applyFieldMap` menulis satu nilai per sel; riwayat multi-baris ditangani
  `applyRiwayatBlock`, tapi riwayat dengan **lebih banyak baris daripada contoh**
  tidak menambah baris baru — hanya mengisi sampai `block.rows`.
