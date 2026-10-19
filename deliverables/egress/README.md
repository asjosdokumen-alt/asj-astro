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

## Yang tidak diukur di sini

Berkas kandidat (KTP/KK/ijazah) di Storage — butuh sesi admin, dan tidak bisa
di-resize karena berupa PDF. Itu jalur egress terpisah yang masih terbuka.
