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

## Sisa yang benar-benar terbuka: dokumen kandidat

Bucket `asj-files` diukur 2026-10-19 (read-only, lewat Storage list API):

| prefix | objek | byte |
|---|---|---|
| `master/` (CV, foto, JFT kandidat) | 600 | **453.042 KB** |
| `jobs/` (pamflet) | 143 | 32.063 KB |
| `cv-templates/` | 1 | 2.697 KB |
| `assets/` (brand, sudah tak dipakai HTML) | 11 | 2.358 KB |
| **total** | **756** | **490 MB** |

Objek terbesar 11,9 MB — dan satu CV tersimpan **tiga kali** dengan nama berbeda
di `master/ALFIAN_ARTIN_SAPUTRA/`. Semua objek ini dilayani `no-cache`, jadi
setiap kali admin membuka dossier kandidat, byte-nya dibayar penuh lagi. Inilah
jalur yang masih bisa menembus kuota, dan ia **tidak** bisa diperbaiki dengan
resize (isinya PDF/xlsx) — pilihannya migrasi ke Cloudinary (`immutable` 30 hari)
atau proxy ber-cache. Keduanya keputusan pemilik, bukan perubahan yang boleh
diam-diam.

