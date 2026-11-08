# Sisa utang teknis — 2026-11-07

## Tambahan 2026-11-08 — butir ke-4 (verify:assets × srcset) DITUTUP

Butir yang di `TODO.md` disebut "verify:assets buta terhadap srcset" **bukan lagi
utang**. Yang dikerjakan:

| | |
|---|---|
| Temuan terukur | probe `deliverables/probe-srcset-2026-11-08.mjs`: **32 kandidat `srcset`**, **18 tidak terlihat** gerbang — bukan 6 seperti catatan awal |
| Sebab | `REF_RE` menuntut path langsung diikuti tanda kutip; di `srcset="A 700w, B 900w"` itu hanya benar untuk kandidat TERAKHIR |
| Perbaikan | (1) `srcset` diurai sebagai atribut (split koma → token URL); (2) `LayananSection.astro` + `ApplyFullForm.tsx` masuk `DIRECT_REF_SOURCES`; (3) `srcSet` di `gallery.ts` ikut diurai |
| Varian | `-700` / `@2x` / `-96` **mewarisi dasar dari induknya** — foto yang sama diperkecil, bukan pertanyaan consent baru. Dua penjaga: induk harus ADA di disk dan punya dasar sendiri ⇒ `fasilitas-ruang-tamu-3` tidak bisa menumpang `-1` |
| Dua berkas baru | `banner-momiji.webp` (artwork musim gugur, tanpa wajah yang terbaca) + `logo-apply.webp` (lambang ASJ = merek) dicatat lewat **pengamatan bertanggal**, standar yang sama dengan `banner-sakura`/`banner-tokyo` 2026-10-19 |
| Bukti bisa merah | mutasi **M8** (kandidat srcset pertama diarahkan ke berkas yang tidak ada): **exit 0 di gerbang lama**, **exit 1 + "PUBLISHED BUT MISSING" di gerbang baru**. M9 mengunci bahwa entri momiji benar-benar ditegakkan |
| Baterai | **9/9 KILLED · 1 EXPECTED-PASS · restored=true** |

⚠ **Temuan yang bukan urusan gerbang:** `banner-momiji.webp` membawa watermark
"Elysium" di sudut kiri bawah. Itu pertanyaan **lisensi** (karya siapa ini), bukan
§11.2, dan gerbang tidak bisa menjawabnya. Dilaporkan ke pemilik, tidak
"disetujui" diam-diam.

---

Daftar ini disusun dari **pengukuran**, bukan dari ingatan. Setiap baris punya
bukti yang bisa dicek ulang. Diurutkan menurut (dampak ÷ usaha).

## Status per 2026-11-07 (sesi kedua) — 5 dari 10 butir ditutup

| # | Butir | Status | Bukti |
|---|---|---|---|
| 4 | `legacyD.*` fallback mati | **LUNAS** (`531fcab`, sebelum sesi ini — dokumen ini yang belum ikut) | 0 rujukan tersisa; hanya komentar penjelas di `CandidateDash.tsx` |
| 5 | `status_biodata` kolom mati | **LUNAS** — migrasi `050` | kolom + trigger + fungsi di-drop; `select status_biodata` → **400/42703** |
| 6 | `job_database.tahapan='CANCEL'` | **LUNAS** — migrasi `050` | `CANCEL` 0 baris; `TG502ASJ` → `status=CLOSE, tahapan=NULL` |
| 8 | Router `_lib/handlers` ~90 KB/entry | **LUNAS** | total bundle **4246,1 → 3771,8 KB (−474,3 KB)**; `notify.js` 96,8 → **65,3 KB** |
| 10 | `ai_form_submissions` >1 baris/WA | **LUNAS** | satu fungsi `pilihSubmissionTerbaru`; 2 pemanggil `.find()` di `chat.ts` diperbaiki + 7 tes |

Sisa 3 butir di bawah (3, 7, 9) — semuanya **keputusan desain atau ukur-ulang**,
bukan pekerjaan kode yang tertinggal.

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

**Tindakan:** SUDAH — pemilik meminta push pada 2026-11-07. 39 commit dipush
(`133f6a3..184b41b`), deploy terverifikasi: produksi kini
`asj-astro-7d0629d5744e` · **2026-11-07 00:44 UTC** · 19 halaman · 73 aset, dan
`/tes-mbti/`, `/tes-mata/`, `/admin/`, `/candidate/` semuanya 200.

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

## 4. `legacyD.*` — fallback ke objek yang tidak pernah dikirim — **LUNAS**

> **Ditutup `531fcab` (2026-11-07), sebelum sesi ini.** Dokumen ini yang belum
> ikut diperbarui: 18 fallback dibuang, dan 4 tes yang dulu HIJAU karena
> mengisi `kandidatData.cvMiniProgress` (jalur yang tidak ada di produksi)
> diganti data nyata. Sisa kemunculan `legacyD` hari ini cuma satu **komentar**
> di `CandidateDash.tsx` yang menjelaskan mengapa jalur itu dulu menyesatkan.
> Pelajaran: daftar utang adalah klaim tentang keadaan, dan keadaan berubah
> tanpa memberi tahu daftarnya.
>
> Bukti saat masih terbuka: `result.kandidatData` tidak pernah dikirim backend
> (komentar `profileProgress` sudah mencatatnya), tapi tetap dipakai di 10
> tempat — `legacyD.berkas`, `.riwayat`, `.job`, `.tahapan`, `.status`, `.isVIP`,
> `.kelas`, `.idKandidat`, `.cv*Progress`, `.jadwal`.

## 5. `status_biodata` — kolom mati — **LUNAS (migrasi 050)**

> **Keputusan pemilik 2026-11-07: hapus kolomnya.** Diukur sebelum menghapus:
> 261 baris, **261** `BELUM`, nol nilai lain — dan migrasi 050 memverifikasi itu
> ulang lewat `DO` block yang **BERHENTI** kalau ada satu baris saja berisi
> `MENUNGGU`/`DISETUJUI`/`REVISI`. Guard-nya bukan hiasan: ia yang membedakan
> "kolom tidak dipakai" dari "kolom dipakai lalu dilupakan".
>
> Yang ikut di-drop: trigger `trg_status_biodata_admin_only`, fungsi
> `enforce_status_biodata_admin_only()`, dan CHECK constraint-nya (otomatis).
> Membiarkan fungsi itu berarti setiap tulis ke `database_candidate` gagal
> 42703 — lebih buruk daripada kolomnya sendiri.
>
> Verifikasi: `select=status_biodata` → **400 / 42703**; `schema.generated.ts`
> ditulis ulang (35 tabel, `sha256:89291f1d…`), `verify:schema` IN SYNC.
>
> Bukti saat masih terbuka: 261 baris, semuanya `BELUM`; satu-satunya rujukan di
> kode adalah sebuah komentar.

## 6. `job_database.tahapan` berisi `CANCEL` (1 baris) — **LUNAS (migrasi 050)**

> **Keputusan pemilik 2026-11-07: kosongkan tahapnya.** Barisnya teridentifikasi
> sebelum diubah: `code_job=TG502ASJ` · TSK KANAYAMA · Kaigo · Fukuoka ·
> `status=CLOSE` · `kuota=0`. Faktanya sudah ada di `status`; `CANCEL` di
> `tahapan` hanya salinan yang salah kolom.
>
> **NULL, bukan `''`** — dan ini terukur, bukan selera: 64 baris lain sudah
> memakai NULL untuk "belum ada tahap", **nol** baris memakai string kosong.
> Menulis `''` akan menciptakan konvensi kedua untuk keadaan yang sama.
> `updated_at` sengaja tidak disentuh (perbaikan data ≠ aktivitas bisnis).
>
> Verifikasi: `tahapan=CANCEL` → 0 baris; tally NULL 64 → **65**.

## 7. 85 kandidat tanpa tahap — **LUNAS 2026-11-08 (migrasi 052)**

> **Keputusan pemilik 2026-11-08:** *"85 kandidat tanpa tahap emang belum kan
> masih development isi saja dengan yg paling [awal] saja biar seragam."*
>
> Catatan lama di sini bilang sengaja TIDAK diisi karena *"menulis `LIST` ke 85
> baris berarti menciptakan data yang tidak pernah dicatat siapa pun."* Alasan
> itu benar tentang ASAL-USUL data dan salah tentang GUNA: kolom kosong membuat
> dasbor memperlakukannya sebagai awal pipeline secara implisit, sehingga
> "belum diproses" dan "tidak diketahui" tampil identik. Pemilik memilih satu
> nilai eksplisit yang seragam.
>
> Terukur sebelum: 263 baris — `LIST` 177 · kosong 85 · `MCU PARPOR` 1.
> Sesudah: **`LIST` 262 · `MCU PARPOR` 1 · kosong 0**. `updated_at` tidak
> disentuh (perbaikan data ≠ aktivitas bisnis; preseden migrasi 050).

## 8. Router ikut ke setiap entry (~90 KB) — **LUNAS**

> **Akar masalahnya bukan `handlers.ts` sendiri, melainkan satu baris re-export
> di dalamnya:** `export { handleShareData, docTypeOf, … }`. Karena itu
> `contexts/catalog` menjadi dependensi modul yang diimpor SETIAP entry, dan
> catalog menarik `identity` (bcryptjs 19 KB) lewat `service` serta `_lib/demo`
> lewat `repository`.
>
> Satu-satunya pemakai `handleShareData` dari handlers adalah `share-data.js`.
> Ia sekarang mengimpor langsung dari `contexts/catalog/index.js`; `docTypeOf`
> hanya dipakai tes dan ikut pindah ke sana. `GENERIC_ERROR_MESSAGE` tetap
> di-re-export karena itu memang milik kernel.
>
> **Hasil terukur (`npm run bundle:size`, baseline diperbarui):**
>
> | Entry | Sebelum | Sesudah |
> |---|---|---|
> | `notify.js` | 96,8 KB | **65,3 KB** |
> | `config.js` | 87,7 KB | **54,2 KB** |
> | `register.js` | 87,8 KB | **54,3 KB** |
> | `kontak.js` | 92,8 KB | **59,0 KB** |
> | `ai-chat.js` | 243,3 KB | **224,6 KB** |
> | **TOTAL 23 entry** | **4246,1 KB** | **3771,8 KB (−474,3 KB · −11,2 %)** |
>
> `ping.js` tetap **1,5 KB** — kontrol yang menunjukkan penurunan ini bukan
> efek samping pengukuran. `share-data.js` praktis tidak berubah (68,5 → 68,9),
> dan itu benar: ia satu-satunya entry yang memang butuh catalog.

## 9. Retensi notifikasi

| | |
|---|---|
| Bukti | `notifikasi_kandidat` = **0 baris** (setelah 35 baris artefak tes dihapus) |
| Dampak | Tidak ada. |
| Usaha | Kecil (cron), tapi **belum layak**: belum ada satu pun pemberitahuan nyata yang tercatat. Ukur ulang setelah sebulan pemakaian. |

## 10. `ai_form_submissions` bisa >1 baris per WA — **LUNAS**

> **Audit selesai, dan hasilnya sempit:** dari seluruh `netlify/` + `src/`,
> hanya **dua** tempat yang masih memakai `.find()` pada tabel ini, keduanya di
> `_lib/ai/chat.ts` (`handleSimpanHasilWawancara` — menulis! — dan
> `handleGetHasilWawancara` — membaca). `cv.ts` sudah benar sejak 2026-10-30.
>
> Aturannya sekarang **satu implementasi**: `pilihSubmissionTerbaru(rows, wa,
> via)` di `_lib/db/projections.ts` — urut `updated_at` → `ai_updated_at` → `id`
> (id dibandingkan sebagai ANGKA; `10` harus menang atas `9`), dan nomor
> dinormalkan dengan `normalizeWa` yang sama seperti saat menulis.
>
> 7 tes baru menutup setiap cabang, termasuk yang paling mudah salah: dua baris
> dengan `updated_at` identik, baris warisan tanpa `updated_at`, dan `ai_form`
> vs `interview` pada WA yang sama. Berkas tes lama `e2e/ai-cv-submit.test.ts`
> mem-mock `projections.ts` secara TOTAL — mock-nya diubah jadi parsial supaya
> fungsi aslinya benar-benar berjalan (kalau tidak, tes itu berhenti mengukur
> apa pun).
