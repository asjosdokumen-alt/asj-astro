# Template CV — handoff penyambungan backend (langkah 1b + 2)

> ## ✅ 1b + 2 SELESAI (commit `ea658e9`)
> Tiga aksi sudah tersambung di **7 titik** dan semua gate hijau:
> `getTemplateCvList`, `simpanTemplateCv`, `hapusTemplateCv` (admin-only,
> `sys_config` config_type `cv_template`).
>
> Dua koreksi atas rencana di bawah, hasil pemeriksaan saat mengerjakan:
> 1. **Tidak perlu Storage di server.** Berkas di-upload dari browser
>    (`src/lib/uploadBerkas.ts`) dan pengisian berkas juga di browser
>    (`applyFieldMap`/`applyRiwayatBlock` pakai `xlsx`), jadi server hanya CRUD
>    `sys_config` — **tanpa berkas baru ⇒ ratchet `indexer` tidak bergeser**.
> 2. **`surfaces/registry.ts` itu per-AKSI, bukan per-surface.** Rencana
>    menganggapnya no-op; gate `verify:binding` menangkapnya
>    (`allow-lists 'simpanTemplateCv' but its maps (master) do not own it`).
>
> **Sisa: hanya UI admin + entry point unduh (langkah 3).**

Sisa pekerjaan fitur template CV. Semua mesinnya sudah ada dan **teruji**; yang
kurang hanya penyambungan ke backend + UI. Dokumen ini mencatat titik-titik
sunting yang persis, supaya sesi berikutnya mekanis.

## Yang sudah selesai (jangan diulang)

| Commit | Isi |
|---|---|
| `38ee235` | `analyzeFromExample` — belajar peta sel→field dari template terisi (opsi C) |
| `ec38c0f` | `detectRiwayatBlock` + `applyRiwayatBlock` — tabel riwayat multi-baris |
| `b22876e` | `CvTemplateRecord` + `encode`/`decodeTemplateRecord` + `decodeTemplateRows` (`sys_config`) |
| `9a47ddb` | Unduhan biodata = admin saja (tombol kandidat dihapus) |

Fungsi yang siap dipakai: `normalizeMasterData` (data kandidat), `analyzeFromExample`,
`applyFieldMap`, `detectRiwayatBlock`, `applyRiwayatBlock`, `decodeTemplateRows`.

## 1b · I/O `sys_config` + Storage

`sys_config` sudah ada di skema: `id, config_type, config_value, deskripsi,
is_active, created_at` — **tanpa DDL**, sesuai keputusan pemilik.

- **Baca**: `supabaseJson('GET', 'sys_config', { query: { select: SYS_CONFIG_COLS, config_type: 'eq.cv_template' } })`
  → `decodeTemplateRows(rows)`. `SYS_CONFIG_COLS` sudah ada di `_lib/db/projections.ts`.
- **Tulis**: satu baris per template. `config_value` = `encodeTemplateRecord(rec)`,
  `deskripsi` = nama template, `is_active` = `rec.aktif`.
- **Berkas**: bucket `asj-files`, prefix `cv-templates/`. Helper yang sudah dipakai
  repo: `storageRequest` / `resolveFileUrl` di `netlify/functions/_lib/storage.ts`
  (lihat `contexts/master-data/service.ts` yang memakainya untuk `MASTER_FILE_COLUMNS`).

⚠ `sys_config` dipakai bersama fitur lain — **selalu filter `config_type`**, dan
jangan pernah memperlakukan baris yang gagal decode sebagai template kosong.

## 2 · Rantai aksi (7 titik, dari skill `asj-backend-action-wiring`)

Aksi baru: `getTemplateCvList`, `simpanTemplateCv`, `hapusTemplateCv`,
`generateCvDariTemplate`. Semuanya **admin-only** (`requireAdmin`).

| # | Berkas | Perubahan |
|---|---|---|
| 1 | `src/lib/apiEndpoint.ts` | tambah 4 nama → `'/.netlify/functions/master-data'` |
| 2 | `netlify/functions/master-data.js` | tambah 4 nama ke **allow-list array** |
| 3 | `netlify/functions/surfaces/master.ts` | tambah 4 entri ke `MASTER_ACTIONS` |
| 4 | `netlify/functions/surfaces/registry.ts` | sudah menunjuk `./master` → tidak perlu diubah kalau surface-nya `master` |
| 5 | `netlify/functions/contexts/master-data/index.ts` | ekspor 4 handler |
| 6 | `netlify/functions/contexts/master-data/service.ts` | tulis 4 handler (di sini juga I/O 1b) |
| 7 | `netlify/functions/_lib/handlers.ts` | 3 aksi TULIS (`simpanTemplateCv`, `hapusTemplateCv`, `generateCvDariTemplate`) masuk `MUTATING` |

**Ada DUA allow-list, bukan satu** (#2 dan #7). Yang terlewat tidak error — klien
`apiClient` jatuh ke catch-all `bridge-links`, jadi fitur tetap "jalan" di fungsi
terberat repo dengan satu round-trip terbuang. Jangan simpulkan "sudah benar" dari
HTTP 200.

**Tidak ada berkas baru** ⇒ ratchet inventory `indexer` TIDAK bergeser (hanya
nama aksi berupa string di berkas yang sudah ada). Kalau ternyata menambah
berkas: tiga asersi + dua komentar breakdown harus ikut, dan **jalankan project
`indexer`** — `--project frontend/backend` tidak mencakupnya.

## Gate yang harus hijau sebelum commit

```
npm run verify:binding     # tiap aksi router butuh entry sempit + slot allow-list
npm run verify:entries     # 22 root entry, 0 Lambda-compat
npm run bundle:size        # master-data.js tidak boleh lewat 600 KB
npx vitest run --project backend netlify/functions/_lib/action-registry.test.ts
```

Jangan tambah import zod ke context bersama — terukur ~67 KB bocor ke 8 entry
point (`_lib/kernel/guard.ts` yang bebas dependensi, ~5 KB).

## 3 · UI admin + entry point (belum)

Tab admin baru "Template CV": upload → `analyzeFromExample` → layar tinjau
(tampilkan `fieldMap`, minta admin memutuskan sel di `ambiguous`, tampilkan
`unmatched`) → simpan. Lalu dari `admin/CandidateProfileModal.tsx`: pilih
template → `generateCvDariTemplate` → unduh.

## Alur yang harus terbukti ujung-ke-ujung

1. Admin isi template xlsx dengan data **satu kandidat yang ada di database**,
   unggah sekali.
2. Sistem menyimpulkan peta sel→field + blok riwayat; admin meninjau & menyimpan.
3. Kandidat lain dipilih → berkas keluar terisi datanya, termasuk tabel riwayat,
   dan **tidak ada baris milik kandidat contoh yang tertinggal**.
