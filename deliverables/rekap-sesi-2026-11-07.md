# Rekap sesi 2026-11-07 — utang & TODO yang selesai, beserta +/−

Tujuh commit lokal (`dc840f7` · `c075593` · `a5caba3` · `7f83202` · `af94398` ·
`e740d21` · `0965075`), **belum di-push**. Semua angka di bawah terukur, bukan
perkiraan; yang tidak terukur disebut apa adanya.

## 1. Butir yang ditutup

| # | Butir | Status | **+ dampak** | **− biaya / batas** |
|---|---|---|---|---|
| §10 | `ai_form_submissions` bisa >1 baris per WA | Lunas | 2 jalur `.find()` (satu di antaranya **menulis**) kini memilih baris TERBARU lewat satu fungsi; 7 tes | Tidak ada regresi; `cv.ts` yang sudah benar ikut memakai fungsi yang sama (satu implementasi, bukan dua) |
| §8 | Router `_lib/handlers` ~90 KB/entry | Lunas | **Bundle 4.246,1 → 3.771,8 KB (−474,3 KB · −11,2 %)**; `notify.js` 96,8 → 65,3 · `config.js` 87,7 → 54,2 · `register.js` 87,8 → 54,3 · `kontak.js` 92,8 → 59,0 | `share-data.js` sekarang mengimpor `contexts/catalog` langsung — satu entry tetap membayar catalog (dan memang perlu) |
| §5 | `status_biodata` kolom mati | Lunas | Skema jujur: 261 baris `BELUM` yang tidak pernah dibaca hilang; trigger + fungsi penjaga ikut pergi | Migrasi **tidak bisa dibatalkan**; guard menolak kalau ada isi, tapi kalau dulu ada rencana memakainya, jalan itu tertutup |
| §6 | `job_database.tahapan='CANCEL'` | Lunas | 1 baris `TG502ASJ` → `tahapan=NULL`, konsisten dengan 64 baris lain | Tidak ada; `updated_at` sengaja tidak disentuh |
| §4 | `legacyD.*` | Lunas (dokumen) | Daftar utang tidak lagi menyebut butir yang sudah ditutup `531fcab` | — |
| (a) | `uses-responsive-images` 249 KiB | Lunas | **Beranda HP: 1.178 → 918 KB (−260 KB · −22 %)**; 11 varian; 10/10 varian benar-benar dipakai | Berkas asli tetap disimpan (kandidat 2x) → jumlah berkas di repo bertambah 11 |
| (b) | `admin.*.css` "185 KB render-blocking" | Lunas (**tidak dipecah**) | Terbukti angka lama **7x terlalu besar**: 28,7 KB brotli di produksi. Keputusan tidak memecah = tidak ada risiko regresi gaya di 19 halaman | Potensi ~10 KB brotli di beranda tidak diambil |
| — | Loading skeleton | Lunas | Tab Papan Skor: 3 keadaan dipisah (memuat / gagal / kosong) + tombol coba lagi | — |

## 2. Temuan audit — "hijau tapi melenceng"

Empat hal ditemukan saat memeriksa ulang kode, bukan saat menulisnya:

1. **Keadaan GAGAL tampil sebagai "belum ada skor"** (sudah diperbaiki `0965075`).
   Perbaikan skeleton pertama saya hanya menangani keadaan memuat; jalur gagal
   masih jatuh ke cabang yang sama dengan jalur kosong, jadi layar menampilkan
   "gagal memuat" DAN empat kartu "belum ada skor" sekaligus. Tes lama hijau
   karena tidak ada yang menguji jalur gagal.

2. **Komentar `CandidateDash.statusText` menunjuk kolom yang sudah di-drop**
   (sudah diperbaiki). Ia menyebut `status_biodata` sebagai "sumber yang benar …
   sampai kolom itu diproyeksikan ke sini" — padahal migrasi 050 menghapusnya.
   Komentar yang menunjuk kolom yang tidak ada lebih berbahaya daripada tidak ada
   komentar: ia mengirim pembaca berikutnya mencari sesuatu yang mustahil.

3. **Komentar migrasi 050 menyebut mekanisme yang salah** — `to_regclass`,
   padahal kodenya memakai `information_schema.columns`. **TIDAK diperbaiki**:
   migrasi yang sudah diterapkan tidak boleh diubah, dan percobaan pertama
   langsung menghasilkan `DRIFT (5b4aee0c09d5 != ddfbada5e588)`. Berkas
   dipulihkan, status kembali **50 applied · 0 pending · 0 drifted**. Ini juga
   bukti bahwa ledger-nya benar-benar memeriksa isi berkas, bukan namanya.

4. **`verify:assets` tidak melihat `srcset`.** Gerbangnya hanya memindai 4 berkas
   (`index.astro`, `App.tsx`, `companyProfile.ts`, `Footer.astro`) dan hanya
   mencocokkan path yang langsung diikuti tanda kutip. Akibatnya **6 varian baru
   hari ini tidak dipolisikan siapa pun**: `banner-{sakura,tokyo,momiji}-700`,
   `logo-asj-96`, `logo-apply-200`, `fasilitas-gedung-700` (yang terakhir juga
   dipakai di `index.astro`, tapi sebagai `srcset`).
   **Tidak diperbaiki**, dan alasannya bukan malas: memperluas gerbang membuat
   `banner-momiji.webp` dan `logo-apply.webp` ikut masuk `published` untuk
   pertama kali — dan check (a) menuntut **dasar publikasi** untuk setiap foto
   yang tampil. Itu klaim tentang siapa yang ada di dalam foto, dan hanya pemilik
   yang boleh membuatnya. Varian galeri (6 berkas) tetap terjaga lewat tes baru
   di `gallery.test.ts`; enam sisanya belum.

## 3. Angka sesi (terukur)

| | |
|---|---|
| Backend | 129 berkas · **1.715 tes** |
| Frontend | 141 berkas · **1.856 tes** (+4 hari ini) |
| Typecheck | 0 error |
| Lint ratchet | tidak ada diagnostik baru (dan −13 saat perbaikan `handlers`) |
| Bundle | **3.771,8 KB / 23 entry** · `ping.js` tetap 1,5 KB (kontrol) |
| Migrasi | **50 applied · 0 pending · 0 drifted** |
| Skema | 35 tabel IN SYNC (`sha256:89291f1d…`) |
| Build | 19 halaman · 73 aset · precache SW 128 URL |
| Gambar | beranda HP 918 KB (dari 1.178) · desktop DPR 2 tidak berubah |

## 4. Yang sengaja TIDAK dikerjakan

| Hal | Alasan |
|---|---|
| Memecah bundel CSS | 62,8 % CSS dipakai bersama; memecah per permukaan ≈ 6–7 KB brotli, per halaman ≈ 10 KB, dengan risiko regresi gaya di 19 halaman. Rincian: `css-bundle-2026-11-07.md` |
| Skeleton di modal admin | Isinya formulir yang sudah punya bentuk; kerangka di sana menutupi field yang sudah bisa dibaca |
| Memperluas `verify:assets` | Butuh dasar publikasi untuk 2 foto yang belum pernah dinilai (lihat temuan #4) |
| Memperbaiki komentar migrasi 050 | Mengubah migrasi yang sudah jalan = DRIFT (terbukti) |

## 5. Sisa

- **3 utang** (`utang-teknis-2026-11-07.md`): feed notifikasi admin, 85 kandidat
  tanpa tahap, retensi notifikasi — semuanya keputusan desain / ukur-ulang.
- **TODO**: Cloudinary, error tracking/PostHog/dashboard analytics (butuh akun),
  6 slot review `quote: null` (harus teks verbatim), region Functions `sin`.
- **7 commit belum di-push** — menunggu permintaan eksplisit (R19).
- `deliverables/cv/` (2 CV kandidat) sengaja di luar git — data pribadi.
