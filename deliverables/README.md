# deliverables/ — bukti, bukan kebenaran terkini

Folder ini berisi **bukti dan snapshot**, bukan dokumentasi hidup. Aturan bacanya
satu kalimat:

> **Berkas bertanggal adalah potret hari itu. Ia tidak pernah menjadi status
> sekarang.** Kalau sebuah berkas bertanggal bertabrakan dengan kode, kode yang
> benar — ukur ulang, jangan percaya berkasnya.

Dokumentasi yang **mengejar** kondisi terkini ada di `docs/` dan `README.md`.
Yang ada di sini menjawab "apa yang pernah diukur, kapan, dan dengan angka berapa".

`deliverables/**` sengaja dipakai sebagai tempat kerja karena **tidak dihitung
oleh satu pun counter beku** (`includePath()` menolak direktori ini) — menambah
berkas di sini tidak menggeser ratchet.

## Indeks

| Folder | Isi | Status |
|---|---|---|
| `review/` | **Review performa & bug yang dijaga hidup.** Satu berkas, selalu direvisi ke commit terakhir. | ✅ hidup |
| `db-neon-migration/` | Rencana + laporan cutover Supabase → Neon (2026-10-20). | snapshot, selesai |
| `db-audit-2026-10-25.md` | Audit DB hari cutover. | snapshot |
| `gstack/` | 58 berkas review desain, mockup, screenshot per tanggal (2026-09-27 … 10-12). | snapshot |
| `engineering-assurance/` | Review PWA, audit modal, screenshot QA. | snapshot |
| `ai-inference/` | Batch review fitur AI (2026-10-01 … 10-02). | snapshot, selesai |
| `seo-content/` | Riset, draf, laporan SEO. | snapshot |
| `index-delta-sync/` | Rencana sinkronisasi index delta. | rencana |
| `egress/` | Pengukur egress + log migrasi 2026-10-19. | alat, masih relevan |
| `cv-template-sel-kosong-2026-10-26.md` | Catatan template CV "sel kosong". | snapshot |

## Aturan yang berlaku di folder ini

1. **Jangan menaruh klaim tanpa cara mengukurnya.** Angka di sini harus datang
   dari perintah yang dijalankan, bukan dari ingatan penulisnya.
2. **Jangan menghapus berkas bertanggal untuk "merapikan".** Yang menyesatkan
   bukan keberadaannya, melainkan klaim di dalamnya yang dibaca sebagai status
   sekarang. Perbaiki klaimnya, atau tandai sebagai snapshot — di tabel ini.
3. **Satu berkas hidup per topik.** Review performa punya satu berkas
   (`review/perf-bug-review-2026-10-28.md`) yang ditulis ulang tiap pass, bukan
   satu berkas baru per tanggal.
