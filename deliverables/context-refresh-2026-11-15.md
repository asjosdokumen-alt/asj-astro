# Pembaruan konteks repo — audit 2026-11-15

**Tujuan pemilik:** *"segarkan semua prompt konteks dan lain-lain di repo; yang usang
diperbarui dengan kondisi repo sekarang, takutnya banyak noise dan info menyesatkan."*

**Basis ukur:** `e1bfa2f` (2026-11-15, HEAD sebelum 3 commit dokumen sesi ini). Working tree punya 4 berkas modified
pra-sesi + 317 untracked (probe lama di `deliverables/`) — **keduanya tidak disentuh**.
⛔ Tidak ada push. Semua perubahan dicatat per berkas di bawah.

---

## 1. Cara kerja: ukur dulu, baru tulis

Semua koreksi berasal dari perintah yang dijalankan, bukan dari dokumen lain:

| Fakta | Perintah / sumber | Hasil |
|---|---|---|
| HEAD & posisi | `git rev-parse --short HEAD`, `git rev-list --left-right --count origin/main...HEAD` | basis `e1bfa2f`. Jumlah commit lokal berubah setiap kali ada commit ⇒ **jangan dibekukan**, ukur dengan perintah di kolom tengah |
| Berkas tracked | `git ls-files \| wc -l` | **1.755** |
| Migrasi | `ls migrations/*.sql \| wc -l` | **60** (`001` … `060_candidate_id_tidak_boleh_kosong.sql`) |
| Rute | `find src/pages -type f` | **20 berkas** (19 `.astro` + `sitemap.xml.ts`) |
| Env | `grep -E '^[A-Z][A-Z0-9_]*=' .env.example` | **45 kunci** |
| Host produksi | `server.cjs:41`, `serve.cjs:12`, `astro.config.mjs:54` | `https://amanahsakura.netlify.app` |
| DB | hostname dari `.env`, `.env.local`, `env-kunci/PRODUCTION.env` | `.env` = `gdwvff…supabase.co` (**LAMA**); dua lainnya = `ep-bold-sunset…neon.tech` |
| Inventory indexer | `git ls-files` + aturan `includePath()` (`indexer/src/util.ts:81`) | **655** = 369 ts + 135 tsx + 30 astro + 93 mjs + 6 cjs + 22 js |
| Counter beku | `indexer/src/{build,discover}.test.ts` | `fileCount`/`files.length` **655**, plafon simbol **35.600**, `unresolvedRefs` **39** ⇒ **cocok** dengan tree |
| Gate | `check-md-tables.mjs`, `lint-ratchet.mjs`, `memory-archive.mjs --check --dry-run` | 77 berkas OK · 1.960 ≤ 1.968 · memori OK (sesudah perapian) |
| Build lokal | `dist/version.json` | `asj-astro-2d42c963d4c4`, `builtAt 2026-11-14T17:07Z`, 21 HTML ⇒ **lebih tua dari HEAD** |
| Docs | `find docs -maxdepth 1 -name '*.md'`, `docs/archive` | **43** aktif · **36** arsip |

**Tidak dijalankan:** `npm test` penuh. Catatan proyek mencatat sebagian tes
service-context menembus stub dan **pernah menulis baris master ke DB produksi**;
suite tertarget saja yang dipakai sesi ini. Karena itu dokumen NOW **tidak**
membekukan angka jumlah tes lagi — ia menyebut perintah pengukurnya.

---

## 2. Klaim usang → bukti → koreksi

| # | Berkas | Klaim lama | Kenapa salah | Koreksi |
|---|---|---|---|---|
| 1 | `PROJECT_CONTEXT.md` | *"Source code belum saya lihat"*, stack/backend/DB/repo/deploy = **[ISI]** | Berkas disusun dari scrape landing page; repo sudah berisi 1.755 berkas | §8 ditulis ulang dari kode: Astro 5 + Preact, Netlify Functions, Neon/Supabase, 20 rute, 45 env, perintah, gate |
| 2 | `PROJECT_CONTEXT.md` | *"Tahap Development, test internal hanya siswa Amanah, belum live publik"* | Host produksi live, data kandidat nyata, panel admin + dasbor berjalan | §2: status rilis = **produksi**; **adopsi operasional internal tetap [ISI]** (tidak bisa dibuktikan dari repo) |
| 3 | `PROJECT_CONTEXT.md` | *"Dokumen company profile belum dilampirkan"* | `docs/COMPANY_PROFILE_DATA.md` (PDF 15 halaman, 25 Agu 2026) + `src/lib/companyProfile.ts` | §3 menunjuk keduanya sebagai sumber |
| 4 | `PROJECT_CONTEXT.md` | Penempatan **"6 bidang"**, 26 prefektur dibaca sebagai batas | Keputusan pemilik 2026-10-30; `PLACEMENT_COVERAGE` menulis *"Seluruh bidang"* + *"Seluruh 47 prefektur"* | §4.4: cakupan = seluruh bidang + 47 prefektur; **26 = bukti register** (`JOB MACHING.xlsx`, refresh 2026-11-10) |
| 5 | `PROJECT_CONTEXT.md` | 6 rute "yang tampak", rating tanpa tanggal | 20 berkas rute; `testimonials.ts` punya `checkedOn` | §8.3 daftar lengkap; rating **4.8 · 20, checkedOn 2026-10-31** |
| 6 | `PROJECT_CONTEXT.md` | 12 butir **[ISI]** | 8 di antaranya sudah terjawab kode | §12 menyisakan 7 butir yang benar-benar butuh pemilik |
| 7 | `README.md` | Status "terukur 2026-10-28" · suite **269/3.219 hijau** · lint **1.997** · tracked **1.170** · counter **603 / 29.900** · **11 rute** · **15 migrasi** · **35 env** · **65 modul** · root **3 dokumen** | Semua angka bertanggal 2026-10 dan tidak diukur ulang | Status disegarkan 2026-11-15; angka suji dihapus (diganti perintah ukur); 1.755 / 655 / 60 / 45 / 91 / 20 rute / 4 dokumen |
| 8 | `README.md` | `cp .env.example .env` | Mengarahkan pembaca ke **DB Supabase LAMA** | `cp .env.example .env.local` + peringatan `.env` root |
| 9 | `README.md` | "setiap push = deploy" tanpa larangan | R19: push kecil = deploy berbayar berulang | Blok ⛔ **JANGAN PUSH** di §Status dan §Deployment |
| 10 | `README.md` | Tabel "Halaman (11 rute)" | 9 rute baru (asesmen, blog, sitemap) | Tabel 20 rute + catatan `dist/` 21 HTML |
| 11 | `docs/README.md` | DEVELOPMENT_ROADMAP = **"otoritas urutan kerja"**, REMAINING_BY_DISCIPLINE = "apa yang belum selesai" | Keduanya basis ukur September 2026 | Pintu masuk diubah ke `PROJECT_CONTEXT.md` + `README.md` §Status; aturan **NOW vs THEN** ditambahkan |
| 12 | `deliverables/README.md` | `gstack/` 58 berkas; tidak ada `asset-library/` | Terukur 105 berkas; 116 aset baru (commit `e1bfa2f`) | Indeks disegarkan + penanda **aset ditolak pemilik 2026-11-15** |
| 13 | `.workbuddy-ai/memory/INDEX.md` | "Fakta kanonik terverifikasi 2026-10-07", counter 538, 949 tracked, suite 183/2.221 | Snapshot yang dibaca sebagai NOW | §3 diberi label SNAPSHOT, ditambah **§3-bis fakta kini**, §6 kontradiksi diselesaikan dengan hasil ukur |
| 14 | `.workbuddy-ai/memory/MEMORY.md` | 10.084 B, angka 650/365/603/29.900/50 migrasi | Melewati plafon 4.096 B ⇒ `memory:check` MERAH; sebagian angka basi | Dirapikan jadi **4.092 B**, rincian **dipindahkan** ke `MEMORY_DETAIL.md` (R8) |
| 15 | `TODO.md` | "Terakhir dirapikan 2026-11-10", root "3 dokumen" | Pembaca mudah mengira seluruh isinya status NOW | Penanda **CARA BACA** (log keputusan bertanggal) + koreksi jumlah dokumen root |

---

## 3. Snapshot yang SENGAJA tidak "diperbaiki"

Sesuai R13l, tabel bertanggal adalah catatan titik-berangkat. Mengubah barisnya
akan **memalsukan** dokumen itu. Yang dilakukan cuma menambah penanda di bagian
atas + pointer ke sumber hidup:

- `DESIGN.md` (basis `41e64cc`, 2026-09-19)
- `docs/DEVELOPMENT_ROADMAP.md` (basis `3804576`, 2026-09-18)
- `docs/REMAINING_BY_DISCIPLINE.md` (basis `7e3a86d`, 2026-09-15)
- `docs/BACKEND_TODO.md` (basis `8593e10` / `70a648e`, 2026-09-13)
- `TODO.md` — entri `[x] SELESAI/DIPUTUSKAN` dan angkanya dibiarkan utuh
- `docs/archive/**`, log harian `.workbuddy-ai/memory/YYYY-MM-DD.md` — **tidak disentuh**

**Yang juga sengaja tidak diubah:** prompt runtime AI di
`netlify/functions/_lib/ai/*.ts` dan `contexts/ingestion/service.ts`. Diperiksa
untuk klaim bisnis usang (`5 bidang`, `4 prefektur`, `26 prefektur`, `Supabase`,
`development/test internal`, biaya) ⇒ **0 kemunculan**. Mengubah prompt LLM untuk
urusan dokumentasi adalah perubahan perilaku produksi yang tidak diminta.

---

## 4. Efek samping yang harus diketahui pemilik

⚠ Saat mengukur baseline saya menjalankan `node scripts/memory-archive.mjs --check`
tanpa `--dry-run`. **Ternyata `--check` bersifat mutatif**: ia merotasi log harian
lebih tua dari 7 hari. Akibatnya:

- **21 log harian** (2026-10-19 … 2026-11-08) diringkas ke
  `.workbuddy-ai/memory/arsip/2026-10.md` dan `arsip/2026-11.md`, lalu berkas
  aslinya dihapus oleh skrip.
- Ringkasan **bukan salinan penuh**: hanya paragraf pertama tiap bagian `##`/`###`
  yang disimpan; sisa detail dicatat jumlah barisnya. Ini memang desain skrip
  (`scripts/memory-archive.mjs`, `summarize()`), dan gate `review:gate` justru
  menegakkannya.
- Folder `.workbuddy-ai/` **gitignored**, jadi berkas asli **tidak bisa dipulihkan
  dari git**. Tersisa 7 log harian (2026-11-09 … 15, ~197 KB) utuh.
- Tidak ada berkas lain yang terhapus; `public/`, `src/`, `netlify/`, `docs/` aman.

Pencegahan yang sudah ditambahkan: peringatan di `PROJECT_CONTEXT.md` §8.4,
`deliverables/README.md`, `.workbuddy-ai/memory/INDEX.md` §1/§7, dan
`MEMORY_DETAIL.md`. **Untuk membaca status memori selanjutnya pakai
`node scripts/memory-archive.mjs --check --dry-run`.**

---

## 5. Verifikasi

| Gate | Hasil |
|---|---|
| `node scripts/ci/check-md-tables.mjs` (`verify:md`) | hijau, 77 berkas tabel |
| `node scripts/ci/lint-ratchet.mjs` | hijau, 1.960 ≤ baseline 1.968 |
| `node scripts/memory-archive.mjs --check --dry-run` | hijau, `MEMORY.md` 4.092 B ≤ 4.096 B |
| `tsc --noEmit` | tidak dijalankan ulang sesi ini (0 perubahan kode); hijau di log sesi 2026-11-15 |
| `npm test` penuh | **sengaja tidak dijalankan** — risiko tulis ke DB produksi (lihat §1) |
| Counter beku indexer | tidak bergeser: semua berkas baru ada di `deliverables/**`, sisanya `.md` di root (di luar `includePath()`) |

---

## 6. Berkas yang diubah

**Di-commit lokal (path eksplisit, R4):**
`PROJECT_CONTEXT.md` · `README.md` · `TODO.md` · `DESIGN.md` · `docs/README.md` ·
`docs/DEVELOPMENT_ROADMAP.md` · `docs/REMAINING_BY_DISCIPLINE.md` ·
`docs/BACKEND_TODO.md` · `deliverables/README.md` ·
`deliverables/context-refresh-2026-11-15.md`.

**Hanya lokal, gitignored (tidak bisa di-commit):**
`.workbuddy-ai/memory/MEMORY.md` · `INDEX.md` · `MEMORY_DETAIL.md` ·
`2026-11-15.md` (catatan sesi) · `arsip/2026-10.md` · `arsip/2026-11.md`.

⛔ **TIDAK di-push.** Seluruh commit lokal menunggu keputusan pemilik (R19).

---

## 7. Yang masih perlu keputusan pemilik

1. Apakah operasional internal sudah penuh pindah dari WA/Drive ke PWA? (§2
   `PROJECT_CONTEXT.md` menandainya **[ISI]** dengan sengaja.)
2. Sumber kebenaran tunggal biaya: banner "6 juta" vs TG 6 jt / Magang 5,5 jt.
3. Tujuh butir keamanan yang tertunda: rotasi PIN, CSP Report-Only, revokasi sesi,
   CORS/throttle `share-data`, `verify:rls` DEGRADED, `npm audit` blocking,
   fail-open VIP.
4. Dua butir lama di `README.md` §Status (scrim hero mobile, SSR `/loker`) —
   tercatat 2026-10-28 dan perlu **diukur ulang** sebelum ditindaklanjuti.
