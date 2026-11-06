# Sisa utang teknis — 2026-11-07

Daftar ini disusun dari **pengukuran**, bukan dari ingatan. Setiap baris punya
bukti yang bisa dicek ulang. Diurutkan menurut (dampak ÷ usaha).

## Sudah lunas hari ini (konteks)

Tahap pipeline kanonik · normalisasi `status_kandidat` & `tahapan_seleksi` ·
banner revisi hidup · teks penolakan per jenis baris · entry ZIP terpisah ·
tree-shaking impor dinamis · kotak masuk kandidat bisa diklik & dihapus ·
pagar yang memerahkan suite bila menulis ke DB non-lokal · `job_database.status`
dirapikan · URL push admin diperbaiki.

---

## 1. Push admin mati: 0 perangkat terdaftar

| | |
|---|---|
| Bukti | `select count(*) filter (where wa='ADMIN') from fcm_tokens` → **0** dari 18 |
| Dampak | `notifyAdmins()` berhenti di baris pertama. Admin tidak pernah menerima push apa pun — termasuk "Lamaran Baru!". |
| Usaha | **1 klik.** Buka **Pengaturan → Notifikasi perangkat ini → Aktifkan**. |
| Catatan | Kartu + action `getStatusNotifikasiAdmin` sudah ada sejak 2026-11-06. URL tujuan sudah benar (`/admin#mail`). Yang kurang hanya pendaftaran perangkat. |

Ini bukan pekerjaan kode. Sampai dilakukan, satu-satunya cara admin tahu ada
lamaran baru adalah membuka tab Mail.

## 2. Tab Mail: 7 filter untuk 2 jenis baris

| | |
|---|---|
| Bukti | `database_asj_form` 16 baris, **semua biodata** (`code_job` kosong), nol lamaran — sementara 221 kandidat punya `id_loker_pilihan` |
| Dampak | Keluhan asli pemilik: *"binggung banyak tap nya pipeline nya gimana"*. Filter `MENUNGGU`/`REVIEW`/`DISETUJUI`/`GAGAL` hanya berarti untuk baris **lamaran**; untuk baris **biodata** semuanya berakhir di `INFO`/`DIBACA`. |
| Usaha | Sedang. Yang saya sarankan: satu baris ringkasan di atas daftar — "Perlu tindakan: N · Info: M · Sudah diputuskan: K" dengan satu klik filter, lalu 7 chip itu disembunyikan di balik "filter lain". |

## 3. Admin tidak punya feed notifikasi terpadu

| | |
|---|---|
| Bukti | Tidak ada tabel/komponen notifikasi admin. `notifyAdmins()` hanya push. |
| Dampak | Kalau push gagal (token 0, izin dicabut, iOS), info-nya **hilang**, bukan tertunda — persis masalah yang sudah diperbaiki untuk kandidat. |
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
| Usaha | — |
| Catatan | Sengaja **tidak** diisi: menulis `LIST` ke 85 baris berarti menciptakan data yang tidak pernah dicatat siapa pun. |

## 8. Router ikut ke setiap entry (~90 KB)

| | |
|---|---|
| Bukti | `netlify-wrapper-surface.ts` mengimpor `./handlers`, yang menarik `contexts/catalog` → `identity` → `bcryptjs` (20 KB) + `demo` (7 KB) ke **setiap** entry. `notify.js` 97 KB untuk 8 action. |
| Dampak | Cold start dan ukuran deploy. Bukan bug, tapi biaya tetap. |
| Usaha | Besar: memisahkan dispatcher inti dari router, atau memindahkan `catalog` keluar dari `handlers.ts`. |
| Catatan | Ini yang membuat `notify.js` 128 KB kemarin; setelah impor statis turun ke 97 KB. Sisa ~90 KB adalah lantai yang sama untuk semua entry. |

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
