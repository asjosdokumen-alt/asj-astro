# Egress — cara mengukur, dan angka 2026-10-19

Dua skrip di folder ini menjawab satu pertanyaan: **berapa byte yang benar-benar
keluar dari Supabase Cloudinary dalam satu kunjungan?** Bukan perkiraan dari
ukuran berkas di disk, bukan `du -sh dist`.

## Menjalankan

```bash
# layar pertama saja (10 baris tabel)
node deliverables/egress/measure-egress.mjs https://asjastro.netlify.app/loker

# pengunjung yang benar-benar menelusuri: klik "Muat Lebih Banyak" 5x
node deliverables/egress/measure-egress-browse.mjs https://asjastro.netlify.app/loker 5

# sesudah perubahan, bandingkan pada build lokal
node server.cjs                                  # baca port dari stdout-nya
node deliverables/egress/measure-egress.mjs http://localhost:4321/loker
```

⚠️ `VW=1280` (default 390) **mengubah hasil secara besar**: thumbnail pamflet
memakai `hidden sm:block`, jadi di 390 px poster TIDAK diunduh sama sekali.
Mengukur di mobile lalu menyimpulkan "poster bukan masalah" adalah kesalahan
yang mudah terjadi.

## Angka sebelum perbaikan (produksi, 2026-10-19)

`/loker`, 1280 px, cache kosong, klik "Muat Lebih Banyak" 5x:

| host | byte |
|---|---|
| res.cloudinary.com | 3.985,3 KB |
| gdwvffmevwtwnzrapjwy.supabase.co | 561,2 KB |
| asjastro.netlify.app | 369,4 KB |

Penyebabnya: thumbnail 48×64 CSS px meminta unggahan asli (~148 KB), dan objek
Supabase Storage dilayani `Cache-Control: no-cache`.

## Angka sesudah perbaikan (build lokal, data produksi)

Layar pertama: poster **1.478,2 KB → 95,2 KB**.
Sesi 5 klik (60 baris): poster **4.545 KB → 445 KB**.

Per berkas: Cloudinary 163.100 → 9.838 B · Supabase 157.100 → 5.841 B.

## Koreksi penting: JSON publik itu 13 KB, bukan 113 KB

Angka 112.927 B yang terlihat di `curl` adalah ukuran **tanpa** `Accept-Encoding`.
PostgREST mengirim gzip, dan `fetch()` Node/undici memintanya sendiri — diukur
langsung ke proyek live 2026-10-19 pada query yang sama:

| cara | byte |
|---|---|
| `curl` tanpa `Accept-Encoding` | 97.968 B (identitas) |
| `curl --compressed` | **13.391 B** |
| `fetch()` Node (yang dipakai fungsi) | `content-encoding: gzip` |

Jadi satu pembacaan publik = ~13 KB egress Supabase, bukan ~113 KB. Konsekuensinya
penting untuk prioritas: **Storage, bukan JSON, adalah byte yang dominan**, dan
itulah sebabnya perbaikan thumbnail poster (bukan pemangkasan payload) yang
dikerjakan lebih dulu.

## Migrasi aset job ke Cloudinary — SELESAI 2026-10-19

`job_database` menyimpan 66 sel yang masih menunjuk Supabase Storage: 52
`link_pamflet` + 14 `format_cv`. Semuanya dipindah dengan
`scripts/egress/migrate-to-cloudinary.mjs`.

| | sebelum | sesudah |
|---|---|---|
| sel `job_database` → Storage | 66 | **0** |
| `pamflet` di payload publik | 52 Storage / 27 Cloudinary | **0 Storage / 79 Cloudinary** |
| `templateCv` di payload | 14 Storage | **0 Storage / 30 Cloudinary** |
| Storage request di `/loker` | banner + poster | **banner saja** (110,9 KB) |

**Kualitas tidak berubah** — diperiksa, bukan diasumsikan: satu pamflet
(`TG633ASJ`, 800×1000) dibandingkan byte-per-byte setelah migrasi — 169.063 B
di kedua sisi, dan **0 dari 2.400.000 piksel** berbeda. Jadi Cloudinary
menyimpan aslinya, tidak me-re-encode.

Yang didapat: Cloudinary mengirim `public, no-transform, immutable,
max-age=2592000` (30 hari), sedangkan objek Storage yang sama dikirim
`no-cache`. Tampilan kedua dan seterusnya tidak lagi membayar byte-nya —
termasuk klik "Format" yang mengunduh template xlsx sampai 614 KB.

Log perubahan (jalan pulang, satu baris per sel):
`deliverables/egress/migration-log-2026-10-19.json` — hanya baris
`job_database`. Baris kandidat sengaja **tidak** di-commit (berisi id baris +
kolom dokumen); simpan salinannya di luar repo kalau migrasi kandidat dijalankan,
lalu `node scripts/egress/migrate-to-cloudinary.mjs --revert <log> [--apply]`.

## Sisa yang benar-benar terbuka: dokumen kandidat

Bucket `asj-files` diukur 2026-10-19 (read-only, lewat Storage list API):

| prefix | objek | byte |
|---|---|---|
| `master/` (CV, foto, JFT kandidat) | 600 | **453.042 KB** |
| `jobs/` (pamflet) | 143 | 32.063 KB |
| `cv-templates/` | 1 | 2.697 KB |
| `assets/` (brand, sudah tak dipakai HTML) | 11 | 2.358 KB |
| **total** | **756** | **490 MB** |

775 sel di tiga tabel masih menunjuk objek `master/` — 420 objek unik,
**294,6 MB**:

| tabel | sel |
|---|---|
| `database_candidate` (pas_photo, file_cv, jft, ssw) | 365 |
| `master_database_candidate` (+ ktp/kk/ijazah) | 409 |
| `pemberkasan_checklist` | 12 |

Ini yang benar-benar besar: satu dossier bisa menarik 11,9 MB — dan satu CV
tersimpan **tiga kali** dengan nama berbeda di `master/ALFIAN_ARTIN_SAPUTRA/`.
Semua objek ini `no-cache`, jadi setiap kali admin membuka dossier, byte-nya
dibayar penuh lagi. Tidak bisa diperbaiki dengan resize (isinya PDF/xlsx).

Tapi isinya **PII** (KTP, KK, ijazah, CV, pas foto), jadi perpindahannya
keputusan pemilik — hari ini objek itu sudah publik di Supabase (URL tak-terka),
yang berubah adalah pemrosesnya. Perintahnya sudah siap:
`node scripts/egress/migrate-to-cloudinary.mjs --apply --scope candidates`.
⚠ Log untuk jalankan itu **jangan di-commit** (berisi id baris + kolom dokumen);
simpan lokal saja.

