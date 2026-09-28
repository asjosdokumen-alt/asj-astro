# Animasi Scroll-Linked pada Halaman Company Profile ASJ

**Tanggal**：2026-09-27
**Skenario**：Desain + implementasi front-end, lalu verifikasi adversarial (2 anggota)
**Partisipan**：🎨 Desainer (gstack-designer) · ✅ QA & Rilis (gstack-qa-lead)
**Repo**：`F:/astro` · HEAD `e9a961c` · **6 commit lokal, belum di-push**

---

## 📌 TL;DR

- **Kesimpulan**：🟢 **Lulus.** Lapisan scroll-linked terpasang, terverifikasi, dan satu cacat kompatibilitas yang ditemukan QA sudah diperbaiki.
- **Klaim terverifikasi**：8 dari 8 **CONFIRMED**, tidak ada yang terbantah.
- **Blocker**：**0.** Satu cacat LOW ditemukan → **sudah ditutup** (`0943d8d`).
- **Satu hal yang perlu Anda lakukan**：matikan **reduce-motion** di OS, kalau tidak, tidak ada satu pun animasi ini yang akan terlihat di layar Anda.
- **Langkah berikutnya**：putuskan kapan 6 commit ini di-push (deploy memakai kuota Netlify).

---

## 🎯 Kartu Kesimpulan

| Item | Isi |
|------|-----|
| Go / No-Go | 🟢 **Go** (lokal; push menunggu keputusan Anda) |
| Sebaran severity | 🔴 0 / 🟠 0 / 🟡 1 (ditutup) / 🟢 5 |
| Aksi kritis | 2 (1 untuk Anda, 1 untuk repo) |
| Rekomendasi pemilik | Owner memutuskan jadwal push |
| Cakupan | 2 foto dekoratif dari ~24 gambar di halaman — **sengaja** |

---

## 1. Kesimpulan Inti Tiap Anggota

### 🎨 Desainer — perancangan & implementasi

- **Penilaian inti**：lapisan scroll-linked **hanya** dipasang pada 2 banner dekoratif (`#penempatan`, `#lokasi`), bukan seluruh halaman. Dasar: referensi MotionKit 2026 menyatakan *"autoplaying entrance animations on everything reads as dated"* — jadi jawabannya adalah **memilih sedikit dengan alasan**, bukan menyapu semua.
- **Kendala `transform` dihindari secara konstruksi**：syarat "tanpa `.u-zoom`" membuat elemen pembungkus **tidak pernah dibutuhkan**. Tidak ada satu pun elemen `.u-zoom` yang disentuh.
- **Temuan paling berharga**：`animation-timeline: view()` mengukur terhadap *scroll container* terdekat, dan **`overflow: hidden` MEMBUAT scroll container** — bedanya hanya dengan `clip`. Dengan `hidden`, timeline terkunci dan foto duduk beku di satu offset **sementara stylesheet tampak benar**.
- **Temuan kedua**：`lightningcss` (minifier toolchain ini) **meruntuhkan deklarasi `overflow` duplikat** dan menyisakan yang terakhir — bahkan ketika diberi target `safari: 15` secara eksplisit. Bentuk perbaikan "dua deklarasi berturut-turut" karena itu **tidak pernah sampai ke produksi**.
- **Koreksi atas klaimnya sendiri (3×)**：baris gagal `fcm-server.test.ts` (389, bukan 383); tiga merah vitest **deterministik**, bukan artefak beban; dan "node tidak bisa spawn apa pun" **terlalu kuat** — `playwright.chromium.launch()` justru berhasil.

### ✅ QA & Rilis — verifikasi adversarial

- **Penilaian inti**：**8 dari 8 klaim CONFIRMED, nol refuted.** QA tidak menjalankan ulang skrip penulis; ia menulis skrip pengukurnya sendiri.
- **Menutup celah yang tidak bisa dicek penulis**：penulis memilih **crop 14% lebih tinggi** pada dua band dan jujur mengaku tidak membuka fotonya. QA **membuka kedua foto sumber dan kedua hasil render** — yang terpotong hanya langit, air, dan tepi hutan. **Tidak ada wajah, teks, atau logo.** Foto `#tentang` yang dikecualikan penulis atas dasar penalaran terbukti **20 orang berbatik** — pengecualiannya tepat.
- **Mengoreksi dua angka** penulis (galeri 8 bukan 9; `#fasilitas` 0 gambar, yang ber-`.u-zoom` adalah `#program`) — dan menelusuri akar angka salah itu sampai ke **komentar basi di `src/lib/gallery.ts`**.
- **Menemukan 1 cacat LOW** yang lolos penulis, dan **membuktikan gate keyframes bisa merah** dengan 3 mutasi di salinan scratch.

---

## 2. Temuan Gabungan (setelah dedup, urut severity)

| # | Severity | Kategori | Lokasi | Masalah | Saran | Sumber |
|---|----------|----------|--------|---------|-------|--------|
| 1 | 🟡 LOW | Kompatibilitas | `index.astro:425,802` + `motion.css` `.u-drift-frame` | `overflow-clip` tanpa fallback. Di browser yang dukung `hidden` tapi belum `clip` (Safari ≤15) deklarasinya **dibuang** → frame jatuh ke `visible` → `<img>` 114% meluber ~7% lewat sudut `rounded-panel` | **SUDAH DIPERBAIKI** (`0943d8d`) via `@supports not (overflow: clip)`. Bentuk dua-deklarasi **tidak bisa dipakai** — lihat #2 | QA |
| 2 | 🟢 INFO | Toolchain | `npm run build` | `lightningcss` meruntuhkan `overflow: hidden; overflow: clip;` → hanya `clip`. **Build exit 0 dan sukses**, tapi perbaikannya tidak ada di `dist/` — hash aset CSS **byte-identik**. "Verified di sumber" ≠ "verified di build" | Pakai blok `@supports` terpisah. Bukti: hash SW berubah `d5b6b6d9f8ad` → `a27225947a82` | Desainer |
| 3 | 🟢 INFO | Dokumentasi | `src/lib/gallery.ts:47,74` | Komentar menulis *"Nine genuine photographs"*, padahal array `GALLERY` berisi **8**. Ini **sumber** angka salah yang sempat masuk laporan | **SUDAH DIPERBAIKI** (`e9a961c`) | QA → Desainer |
| 4 | 🟢 INFO | Toolchain | `scripts/ci/check-keyframes.mjs` | Blind spot: gate mencocokkan nama terhadap daftar prefiks hardcoded, jadi `drift-lag` → `drfit-lag` **lolos** | Butuh perbandingan dua arah (direferensikan vs didefinisikan). **Tidak** ditutup — batasan diketahui | QA |
| 5 | 🟢 INFO | Metodologi | pengukuran drift | Sampling di luar jendela `entry 25% cover 50%` ter-clamp ke endpoint → skrip pertama penulis hanya menghasilkan **3** nilai berbeda dan **tidak cukup** membuktikan "bergerak" | Sapuan halus (116 posisi, 36 nilai berbeda) | Desainer (koreksi sendiri) |
| 6 | 🟢 INFO | Proses | `deliverables/` | `deliverables/` tidak di-gitignore dan **sengaja tidak di-commit** | Menunggu keputusan Anda | Desainer |

---

## 3. Bukti Terukur

### 3.1 Drift benar-benar terikat scroll (bukan sekali jalan)

| Band | Rentang `translateY` | Travel | Nilai berbeda | Reversible | Slack minimum |
|---|---|---|---|---|---|
| `#penempatan` | −32.24 … 32.24 | **64.48px** | 36 | ✅ | 23.31px |
| `#lokasi` | −24.16 … 24.16 | **48.32px** | 33 | ✅ | 17.22px |

Diukur atas 116 posisi scroll. QA memakai **sinyal kedua** (`animation.currentTime`) selain `translateY`, untuk membuktikan ini bukan artefak "animasi sudah selesai". 64.5px berada di dalam band 40–80px yang Framer sebut terbaca.

### 3.2 Temuan `clip` vs `hidden` — bertahan di bawah percobaan pematahan

| Kondisi `overflow` | Nilai `translateY` unik |
|---|---|
| `clip` (yang dikirim) | **6** (bervariasi) |
| `hidden` (disuntikkan) | **1** (beku di 32.239 = ujung range) |
| `scroll` | **1** (beku) |
| `visible` + `contain: paint` | bervariasi — hidup, tapi **tidak lebih sederhana** dari `clip` |

### 3.3 Keselamatan

- **Hover zoom utuh**：galeri 8 + layanan 3 + program 3, semuanya `matrix(1.05, 0, 0, 1.05, 0, 0)`.
- **Reduced-motion inert**：`animation-name: none`, `transform: none`, `opacity: 1`; 9 offset → 1 nilai (0); slack 55.55/55.56.
- **Overflow horizontal −15px** di 390 / 1280 / 1280×500 / 1280×2400 / 640. Di zoom teks 200% muncul 180px, tapi terbukti **murni drawer off-canvas** (dengan drift dimatikan tetap 180px) — drift menyumbang **0**.
- **Berbaur dengan entrance §9b**：dipaksa ke keadaan awal entrance, drift **identik** (slide-right −4.875→−4.875; rise −7.526→−7.526). Independen, tanpa snap.

### 3.4 Gate (exit code)

| Gate | Exit |
|---|---|
| `tsc --noEmit -p tsconfig.json` | **0** |
| `scripts/ci/verify-classes.mjs` | **0** |
| `scripts/ci/lint-ratchet.mjs` | **0** (utang −14) |
| `scripts/ci/check-keyframes.mjs` | **0** |
| `npm run build` | **0** (11 halaman; sw `a27225947a82`) |
| `vitest run` | **3 merah / 167 berkas / 1970 tes** — lihat catatan |
| 8× gate e2e | **0** semua |

**Catatan tiga merah vitest**：`boundary.test.ts:319:7`, `discover.test.ts:52:5`, `fcm-server.test.ts:389:80`. Semuanya **deterministik** saat sandbox aktif, bukan intermiten. Probe telanjang: `spawnSync(process.execPath, ['-e','console.log(1)'])` → `status=null err=EBUSY`. **Akan tetapi**: sesi ini mencatat **dua run hijau penuh (167/167, 1970/1970)** yang bertanda `⚠️ Sandbox bypassed (escalation-approved)` — jadi kalimat yang akurat adalah *"hijau kalau sandbox di-bypass, 3 merah deterministik kalau tidak"*.

### 3.5 Implementasi (skenario desain + front-end)

| Berkas | Perubahan |
|---|---|
| `src/styles/motion.css` | §9d baru: `.u-drift-frame`, `@keyframes drift-lag`, `@supports not (overflow: clip)` |
| `src/pages/index.astro` | 2 frame foto (`:425`, `:802`): `overflow-hidden` → `u-drift-frame` |
| `scripts/ci/check-keyframes.mjs` | +5 baris (memperluas gate yang sudah ada) |
| `src/lib/gallery.ts` | 2 komentar: "nine" → "eight" |

---

## ✅ Daftar Aksi

| # | Aksi | Pemilik | Urgensi | Kapan |
|---|------|---------|---------|-------|
| 1 | **Matikan reduce-motion di OS** (Windows: Settings → Accessibility → Visual effects → Animation effects = ON). Tanpa ini Anda tidak akan melihat satu pun animasi ini | **Anda** | **P0** | Sekarang |
| 2 | Buka `http://localhost:4321`, scroll ke `#penempatan` dan `#lokasi`, nilai apakah drift terasa pas | **Anda** | P0 | Sekarang |
| 3 | Putuskan kapan **6 commit lokal** di-push — setiap push = 1 deploy di tiap situs Netlify yang ter-link | **Anda** | P1 | Saat siap |
| 4 | Tutup blind spot gate keyframes (bandingkan nama yang **direferensikan** vs **didefinisikan**, dua arah) | Repo | P2 | Kapan saja |
| 5 | Putuskan nasib `deliverables/` (tidak di-gitignore, belum di-commit, dan **repo publik**) | **Anda** | P2 | Kapan saja |

---

## ⚠️ Belum Diverifikasi / Batasan yang Diketahui

1. **Firefox, Safari, dan perangkat fisik belum diuji.** Semua angka berasal dari Chromium headless.
2. **Regresi `clip` di browser tua** (Safari ≤15) diperbaiki lewat `@supports`, tapi **fallback-nya tidak bisa dijalankan** di lingkungan ini — diverifikasi dari byte yang dikirim, bukan dengan menjalankan Safari.
3. **FPS di Android kelas bawah tidak diukur.** Yang dianimasikan hanya `transform` dan tanpa `will-change` — model biayanya murah, tapi itu penalaran, bukan pengukuran.
4. **Crop 14% pada dua band terjadi di SEMUA browser**, termasuk yang tidak mendukung scroll-timeline. QA menilai jinak (hanya langit/air/tepi hutan), tapi ini perubahan visual yang nyata dan keputusan menerimanya ada di tangan Anda.
5. **Blind spot gate keyframes** (#4) sengaja tidak ditutup.
6. **`indexer/validate-report.json`** muncul modified dan **bukan** dari perubahan ini — berkas ter-generate yang menyimpan `rootDir` mesin lain. Tidak di-`git add` oleh siapa pun.

---

## 📚 Indeks Produk Anggota

- 🎨 **gstack-designer** — `F:/astro/deliverables/gstack/_part-designer-scroll-motion.md` (1090 baris). §2.4 temuan lightningcss, §3.7 verifikasi V1/V2/V3, §5 butir 8–9 batasan diketahui. Skrip verifikasi: `.tmp-drift-fallback-verify.mjs` (gitignored).
- ✅ **gstack-qa-lead** — `F:/astro/deliverables/gstack/_part-qa-scroll-motion.md`. Skrip pengukur independen: `.tmp-qa-scroll/` (gitignored).

### Riwayat commit lokal (belum di-push)

| Commit | Isi |
|---|---|
| `e9a961c` | `docs(gallery)`: array berisi delapan foto, bukan sembilan |
| `0943d8d` | `fix(motion)`: memulihkan fallback `overflow` yang dimakan minifier |
| `e72b481` | `feat(motion)`: lapisan scroll-linked, hanya pada dua banner dekoratif |
| `ab34661` | `feat(motion)`: entrance scroll dibuat terbaca + akar kekakuan dinamai |
| `7638c11` | `feat(profile)`: satu resep motion untuk hover, press, dan zoom gambar |
| `fca108e` | `docs`: koreksi proyek Supabase — repo ini memakai DUA proyek |

`origin/main` tetap di **`4251b09`**. Tidak ada yang di-push.

---

> Laporan ini dihasilkan oleh kolaborasi AI Software Workshop. Keputusan rekayasa kunci harap ditinjau oleh penanggung jawab teknis.
