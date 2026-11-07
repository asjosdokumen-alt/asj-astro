# Sisa utang teknis — 2026-11-07

Daftar ini disusun dari **pengukuran**, bukan dari ingatan. Setiap baris punya
bukti yang bisa dicek ulang. Diurutkan menurut (dampak ÷ usaha).

## Sudah lunas

Tahap pipeline kanonik · normalisasi `status_kandidat` & `tahapan_seleksi` ·
banner revisi hidup · teks penolakan per jenis baris · entry ZIP terpisah ·
tree-shaking impor dinamis · kotak masuk kandidat bisa diklik & dihapus ·
pagar yang memerahkan suite bila menulis ke DB non-lokal · `job_database.status`
dirapikan · URL push admin diperbaiki · batas 3 perangkat per identitas ·
tab Mail diberi angka per keranjang + satu kalimat penjelas.

---

## 0. PRODUKSI TERTINGGAL 2 HARI (temuan 2026-11-07)

| | |
|---|---|
| Produksi | `asj-astro-d62ea0838a8b` · dibangun **2026-11-05 17:30** · 17 halaman · 69 aset |
| Lokal | `asj-astro-fa4cdb0c65cc` · dibangun **2026-11-07 00:17** · 19 halaman · 73 aset |

Konsekuensinya: apa pun yang dikerjakan sejak 5 November **belum terlihat** di
situs. Itu juga jawaban untuk tangkapan layar "Integrasi Database (Otomatis)"
yang berisi input URL `script.google.com`: kartu itu **tidak ada lagi di kode**
(diganti instruksi `npm run migrate:status/up`), dan string
`script.google.com` tidak ditemukan di seluruh repo maupun riwayat git-nya.
Yang tampil di layar adalah build lama.

**Tindakan:** perlu push + deploy. Belum dilakukan karena aturan repo melarang
push tanpa permintaan eksplisit pemilik.

---
## 1. KOREKSI: push admin HIDUP, bukan mati

| | |
|---|---|
| Klaim awal saya | "0 token admin" — **SALAH** |
| Fakta | Admin mendaftar dengan handle `KHOCI`, bukan `ADMIN`. Query saya memakai `wa='ADMIN'`, jadi hasilnya 0. |
| Terukur | 3 token `KHOCI` (salah satunya dipakai 2026-11-06) ⇒ `getAdminTokens()` mengembalikan 3 |
| Yang benar-benar rusak | URL tujuan push: `/admin.html` — berkas legacy yang tidak ada di build Astro. **Sudah diperbaiki** ke `/admin` dan `/admin#mail`. |

Pelajaran: handle admin bukan konstanta. `getAdminTokens()` mendefinisikannya
sebagai "WA yang BUKAN format kandidat", jadi query manual harus memakai
predikat yang sama — bukan menebak string `ADMIN`.

## 1b. Batas 3 perangkat per identitas (permintaan pemilik)

| | |
|---|---|
| Masalah | Setiap login bisa menerbitkan token FCM baru; yang lama tidak selalu dinyatakan mati oleh FCM, jadi baris menumpuk. Pernah 25 baris untuk satu nama. |
| Perbaikan | `registerFcmToken` membatasi **3 perangkat** per identitas, urut `last_used_at desc nullslast` — yang tidak pernah dipakai dibuang lebih dulu. |
| Bukti | 2 tes: 4 baris → hapus 1 (`id=in.(…)`); 2 baris → tidak menghapus apa pun. |
| Data sekarang | `KHOCI` tepat 3 (di batas), kandidat lain 1–2. Tidak ada yang perlu dibersihkan. |

## 2. Tab Mail: dua daftar terpisah — SELESAI

| | |
|---|---|
| Bukti | `database_asj_form` 16 baris, **semua biodata** (`code_job` kosong), nol lamaran — sementara 221 kandidat punya `id_loker_pilihan` |
| Dampak | Keluhan asli pemilik: *"binggung banyak tap nya pipeline nya gimana"*. Filter `MENUNGGU`/`REVIEW`/`DISETUJUI`/`GAGAL` hanya berarti untuk baris **lamaran**; untuk baris **biodata** semuanya berakhir di `INFO`/`DIBACA`. |
| **Dikerjakan** | Dua daftar dengan pemilih sendiri: **Lamaran** (MENUNGGU · UPDATE · REVIEW · DISETUJUI · GAGAL · SEMUA) dan **Biodata** (INFO · GAGAL · SEMUA). Tiap daftar membawa angkanya sendiri, kolom loker disembunyikan di Biodata, dan badge status biodata memakai nilai MENTAH supaya `INFO` vs `DIBACA` terlihat. |

**Bug yang ikut tertutup:** aksi per baris dulu dipilih lewat `isInfoRow(status)`.
Baris **dokumen yang ditolak** berstatus `GAGAL`, jadi ia menampilkan tombol
Setujui/Review/Tolak — dan server menjawab *"Baris biodata/dokumen tidak perlu
disetujui"*. Sekarang jenis baris ditentukan oleh `code_job`, bukan status.

## 3. Admin tidak punya feed notifikasi terpadu

| | |
|---|---|
| Bukti | Tidak ada tabel/komponen notifikasi admin. `notifyAdmins()` hanya push. |
| Dampak | Kalau push gagal (izin dicabut, iOS, token mati), info-nya **hilang**, bukan tertunda — persis masalah yang sudah diperbaiki untuk kandidat. |
| Usaha | Besar: tabel `notifikasi_admin` + migrasi + surface + UI. |
| Catatan | Sebagian besar kejadian **sudah** punya permukaan persisten: lamaran/dokumen/biodata semuanya menulis baris Mail. Yang benar-benar hanya-push: pesan kontak. Jadi ini keputusan desain, bukan bug. |

## 4. `legacyD.*` — fallback ke objek yang tidak pernah dikirim

| | |
|---|---|
| Bukti | `result.kandidatData` tidak pernah dikirim backend (komentar `profileProgress` sudah mencatatnya). Tetap dipakai di 10 tempat: `legacyD.berkas`, `.riwayat`, `.job`, `.tahapan`, `.status`, `.isVIP`, `.kelas`, `.idKandidat`, `.cv*Progress`, `.jadwal`. |
| Dampak | Membaca `CandidateDash` jadi lebih lambat dari yang perlu; orang bisa mengira jalur itu hidup. |
| Usaha | Kecil, tapi menyentuh satu berkas besar — kerjakan bersama perubahan lain di berkas itu. |

## 5. `status_biodata` — kolom mati

| | |
|---|---|
| Bukti | 261 baris, **semua** `BELUM`. Satu-satunya rujukan di kode adalah sebuah komentar. |
| Dampak | Skema menyesatkan: kolom yang namanya menjanjikan status berkas tapi tidak pernah diisi. |
| Usaha | Kecil: hapus kolom (migrasi) atau isi. **Butuh keputusan pemilik** — kalau dulu ada rencana memakainya, menghapusnya menutup jalan itu. |

## 6. `job_database.tahapan` berisi `CANCEL` (1 baris)

| | |
|---|---|
| Bukti | `tahapan`: LIST 89 · kosong 64 · CHECK KAIWA 2 · **CANCEL 1** · LOLOS USER 1 · MENSETSU 1 · MENDAN 1 |
| Dampak | Pola yang sama dengan `LIST`/`MCU PARPOR` di kolom status kandidat: nilai status nyasar ke kolom tahap. Satu baris, jadi tidak mendesak. |
| Usaha | Kecil — tapi **artinya ambigu**: lowongan yang dibatalkan tidak punya tahap. Saya tidak menebak; butuh keputusan. |

## 7. 85 kandidat tanpa tahap

| | |
|---|---|
| Bukti | `tahapan_seleksi` kosong: 85 |
| Dampak | UI memperlakukannya sebagai awal pipeline (`LIST`). Tidak ada yang salah. |
| Catatan | Sengaja **tidak** diisi: menulis `LIST` ke 85 baris berarti menciptakan data yang tidak pernah dicatat siapa pun. |

## 8. Router ikut ke setiap entry (~90 KB)

| | |
|---|---|
| Bukti | `netlify-wrapper-surface.ts` mengimpor `./handlers`, yang menarik `contexts/catalog` → `identity` → `bcryptjs` (20 KB) + `demo` (7 KB) ke **setiap** entry. `notify.js` 97 KB untuk 8 action. |
| Dampak | Cold start dan ukuran deploy. Bukan bug, tapi biaya tetap. |
| Usaha | Besar: memisahkan dispatcher inti dari router, atau memindahkan `catalog` keluar dari `handlers.ts`. |

## 9. Retensi notifikasi

| | |
|---|---|
| Bukti | `notifikasi_kandidat` = **0 baris** (setelah 35 baris artefak tes dihapus) |
| Dampak | Tidak ada. |
| Usaha | Kecil (cron), tapi **belum layak**: belum ada satu pun pemberitahuan nyata yang tercatat. Ukur ulang setelah sebulan pemakaian. |

## 10. `ai_form_submissions` bisa >1 baris per WA

| | |
|---|---|
| Bukti | Aturan yang sudah tercatat: satu WA bisa punya beberapa baris `ai_form`; penulisan harus ke yang TERBARU (`updated_at`, lalu `id`). |
| Dampak | Kode yang memakai `.find()` pertama akan menulis ke baris yang salah. |
| Usaha | Sedang: audit semua pembaca tabel itu. |
