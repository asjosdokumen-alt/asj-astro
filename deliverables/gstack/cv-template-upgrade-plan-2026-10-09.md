# Upgrade template CV: upload template → isi dari database kandidat (rencana)

## ✅ Keputusan pemilik (dikonfirmasi 2026-10-10)

1. **Penyimpanan = B** — `sys_config` + berkas di Supabase Storage. Alasan
   pemilik: *"1 template nantinya bisa dipakai berulang untuk kandidat yg lain"*
   ⇒ template memang artefak bersama, bukan milik satu kandidat.
2. **Penandaan field = C** — belajar dari contoh: admin mengisi template dengan
   data **satu kandidat**, unggah sekali, jadi baku; kandidat lain "tinggal
   copy". (A/B tetap tersedia sebagai pelarian; `{{placeholder}}` selalu menang.)
3. **Format = xlsx dulu**, sisanya menyusul.

**Sudah dikerjakan dari rencana ini:** inti opsi C —
`analyzeFromExample()` di `loaders/tEMPLATE-loader.ts` + 6 tes
(`e2e/cv-template-example.test.ts`), termasuk tes yang membuktikan
"tinggal copy": template yang sama diisi data kandidat kedua.

**Belum:** S1 (simpan ke `sys_config` + Storage), S2 (aksi backend), S3 (UI admin),
S4 (entry point unduh), dan **baris riwayat** (pendidikan/pekerjaan/keluarga) —
`applyFieldMap` hari ini menulis satu nilai per sel, jadi blok riwayat
multi-baris perlu applier tambahan.

Permintaan pemilik: admin meng-upload template (kosongan, atau sudah ada isi /
berisi contoh CV yang terisi penuh), lalu sistem mengisinya dari database
kandidat sehingga keluar CV hasil regenerasi dengan data kandidat tersebut.

## Yang SUDAH ada (dan ternyata sudah dekat)

`src/lib/cv-template-factory/` sudah punya seluruh mesinnya — tapi **tidak ada
satu pun pemanggil**: tidak ada berkas di `src/`, `netlify/`, atau `e2e/` yang
meng-import `loaders/tEMPLATE-loader`. Jadi yang kurang bukan mesin, melainkan
**penyambungannya**.

| sudah ada | berkas |
|---|---|
| Kontrak template + registry (`register/get/list/render`) | `factory.ts`, `types.ts` |
| Data kandidat ternormalisasi (identitas, fisik, medis, pendidikan[], pekerjaan[], keluarga[], sertifikasi, wawancara, kenalan_jepang, uploads, raw) | `types.ts` `CandidateData` + `data.ts` `normalizeMasterData` |
| **Deteksi field otomatis**: pola label → path data (`nama lengkap`, `tgl lahir`, `GOLONGAN DARAH`, …) | `loaders/tEMPLATE-loader.ts` `FIELD_LABELS` |
| `{{placeholder}}` di sel Excel → nilai | `PLACEHOLDER_RE`, `flattenDataForPlaceholders` |
| Analisa template Excel → peta sel→field | `analyzeExcelTemplate` |
| Isi ulang workbook dari peta itu | `applyFieldMap`, `loadExcelTemplate` |
| Riwayat (pendidikan/pekerjaan/keluarga) dengan kunci dedupe tunggal | `helpers_cv.ts` `riwayatKeyOf` |
| Renderer: rirekisho-xlsx, excel, docx, pdf | `renderers/` |

## Yang BELUM ada

1. **Tidak ada tempat menyimpan template.** Tidak ada tabel `cv_templates` di
   skema (25 tabel, tidak satu pun untuk template), dan `.env` **tidak punya
   `SUPABASE_DB_URL`** ⇒ DDL tidak bisa dijalankan dari sini.
2. **Tidak ada UI admin** untuk upload + meninjau peta field.
3. **Tidak ada aksi backend** untuk menyimpan/membaca template.
4. **Tidak ada entry point "hasil"**: pilih kandidat → pilih template → unduh.
5. **`templates.ts` praktis kosong** — hanya `rirekisho-a4` yang `render()`
   mengembalikan `html: ''`. Jadi daftar template yang bisa dipakai = kosong.
6. **docx/pdf belum "regenerasi"**: `loadDocxTemplate` mengembalikan
   `{html, text}` dan `loadPdfTemplate` mengembalikan `html` — keduanya bukan
   berkas docx/pdf yang bisa diunduh apa adanya.

## Rencana — 4 potongan

**S1 · Penyimpanan template (blocking; butuh keputusan Anda)**
Berkas template ke Supabase Storage (bucket `asj-files`, prefix `cv-templates/`),
metadatanya + peta field ke DB. Pilihannya di "Keputusan" di bawah.

**S2 · Aksi backend** `simpanTemplateCv` / `getTemplateCv` / `hapusTemplateCv`
(surface baru atau menumpang `master`), ber-guard admin, plus
`generateCvDariTemplate(wa, templateId)` yang memanggil
`normalizeMasterData` → `loadExcelTemplate`/`applyFieldMap` → berkas.

**S3 · UI admin**: tab baru "Template CV" — upload, lihat hasil analisa
(sel mana terisi field apa), koreksi peta, simpan, tombol "Coba dengan kandidat".

**S4 · Entry point hasil**: dari modal kandidat (dan/atau dashboard kandidat)
pilih template → unduh. Rirekisho yang sudah ada tetap jadi salah satu pilihan.

## Keputusan yang menahan S1 (mohon dipilih)

1. **Template disimpan di mana?**
   - **A. Tabel baru `cv_templates`** — paling bersih (id, nama, tipe, file_url,
     field_map jsonb, aktif, created_at). **Butuh migration yang dijalankan ke
     database** — saya tidak bisa menjalankannya dari sini (tidak ada
     `SUPABASE_DB_URL`); Anda perlu menjalankan SQL-nya, atau memberi koneksi DB.
   - **B. `sys_config`** (tabel KV yang sudah ada: `config_type`,
     `config_value`, `deskripsi`, `is_active`) + berkas di Storage. Bisa jalan
     **tanpa DDL sama sekali**. Kurang rapi untuk banyak template, tapi cukup.
   - **C. Tanpa DB** — template hanya di memori sesi (hilang saat refresh).
     Cepat, tapi tidak memenuhi "database bisa buat bermacam-macam template".

2. **Bagaimana admin menandai field di template?**
   - **A. Label di sel** (otomatis, sudah didukung): sel berisi `Nama Lengkap`,
     `Tgl Lahir`, `Golongan Darah` → dikenali. Cocok untuk template yang "sudah
     ada isi" — cukup tulis labelnya.
   - **B. Placeholder `{{identitas.nama_lengkap}}`** (juga sudah didukung) —
     paling pasti, tapi admin harus mengetik token.
   - **C. Belajar dari CV contoh yang terisi penuh** (contoh di-upload bersama
     data kandidat contoh, sistem menyimpulkan sel mana milik field mana dengan
     membandingkan). Paling sesuai kalimat Anda, tapi paling rapuh: butuh satu
     kandidat contoh + nilai contoh harus unik agar bisa dibedakan.
   - Usul saya: **A sebagai utama + B sebagai pelarian**, dan C menyusul hanya
     kalau A/B ternyata tidak cukup.

3. **Format yang harus jalan lebih dulu?** `xlsx` sudah siap hari ini
   (`applyFieldMap`). `docx` dan `pdf` perlu kerja tambahan karena loader-nya
   mengembalikan HTML, bukan berkas.

## Catatan

- Riwayat pendidikan/pekerjaan/keluarga memakai kunci dedupe tunggal
  (`riwayatKeyOf`, commit `f71d5b7`) — jadi template yang menampilkan 3 baris
  pendidikan akan menerima 3 baris yang benar, bukan 11.
- Tanpa keputusan #1 dan #2, S2–S4 bisa saya tulis tapi tidak bisa diuji
  ujung-ke-ujung. Karena itu rencana ini berhenti di sini dulu, bukan karena
  mesinnya belum ada.
