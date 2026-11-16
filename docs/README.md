# docs/ — peta dokumentasi ASJ Portal v2

**Ini pintu masuknya.** Setiap dokumen di folder ini punya satu pekerjaan; kalau kamu
tidak tahu harus baca yang mana, mulai dari tabel di bawah.

> **Aturan emas repo ini:** *angka di dokumen datang dari perintah yang dijalankan,
> bukan dari ingatan penulisnya.* Kalau sebuah klaim di bawah tidak menyebut cara
> mengukurnya, perlakukan sebagai pendapat, bukan fakta.

---

## Kalau kamu baru masuk (baca 4 ini dulu)

| # | Dokumen | Untuk apa |
|---|---|---|
| 0 | `../PROJECT_CONTEXT.md` | **Baca paling awal.** Konteks bisnis + teknis untuk AI, disegarkan 2026-11-15 dari kode: stack, env, rute, status rilis, aturan kerja. |
| 1 | `../README.md` §Status | **Kondisi terkini**, diukur dan bertanggal. |
| 2 | `../TODO.md` | Log keputusan non-backend (arsip bertanggal; baca penanda "CARA BACA" di atasnya). |
| 3 | [[BACKEND_TODO]] | Daftar pekerjaan backend; juga **snapshot** dengan basis ukur sendiri. |

> 🔴 **Jangan mulai dari [[DEVELOPMENT_ROADMAP]] atau [[REMAINING_BY_DISCIPLINE]] untuk
> mengetahui keadaan sekarang.** Keduanya berbasis ukur **September 2026**
> (`3804576` / `7e3a86d`), jauh sebelum cutover Neon, 60 migrasi, dan rute
> asesmen. Dokumen-dokumen itu sengaja dipertahankan sebagai catatan keputusan
> (R7), dan masing-masing sudah diberi penanda SNAPSHOT di bagian atas. Untuk
> urutan kerja hari ini, ukur ulang dari `README.md` §Status + kode.

## Landing page (pekerjaan besar yang berjalan)

| Dokumen | Isi |
|---|---|
| [[LANDING_PAGE_ROADMAP]] | Fase **L0..L8** — urutan pembangunan landing page. |
| [[LANDING_PAGE_SPEC]] | Spesifikasi 17 section (S1–S12, R1–R5): tiap section, kontennya, sumbernya. |
| [[COMPANY_PROFILE_DATA]] | **Sumber kebenaran data perusahaan.** Setiap baris punya nomor halaman PDF asalnya. |

Alur baca yang benar: `LANDING_PAGE_ROADMAP` → `LANDING_PAGE_SPEC` → `COMPANY_PROFILE_DATA`.
Spec tidak boleh mengarang data; semua angka perusahaan harus bisa dilacak ke
`COMPANY_PROFILE_DATA`, dan dari sana ke halaman PDF.

## Arsitektur & data

| Dokumen | Isi | Status |
|---|---|---|
| [[ARCHITECTURE]] | Arsitektur frontend (Astro + Preact). | ✅ terimplementasi; **cek tanggal basis ukurnya** |
| [[BACKEND_ARCHITECTURE_2026-09-01]] | Arsitektur backend target. | ✅ terimplementasi |
| [[SCALABILITY_RELIABILITY_ARCHITECTURE]] | Bagaimana backend menahan beban. **Induk** dari Phase A–E. | rencana + sebagian dibangun |
| [[DB_PERFORMANCE_AUDIT]] | Angka performa DB (terukur ke produksi). | terukur 2026-09-01 |
| [[CODE_INDEX_DESIGN]] | Desain indexer semantik (pencarian simbol lintas berkas). | sebagian dibangun |

## Fase backend (anak dari SCALABILITY_RELIABILITY_ARCHITECTURE)

`PHASE_A` → `PHASE_B` → `PHASE_C` → `PHASE_C_SINK_SETUP` → `PHASE_D` → `PHASE_E`.
Urutannya nyata: tiap fase menyebut fase sebelumnya sebagai *predecessor*. Baca
berurutan, atau langsung ke [[PHASE_E_DEGRADATION_MATRIX]] kalau kamu hanya ingin
tahu mana klaim yang sudah benar-benar diuji.

## Mutu & proses

| Dokumen | Isi |
|---|---|
| [[CODE_REVIEW_STANDARD]] | Apa arti "sudah di-review" + cara memberi peringkat temuan. |
| [[CODE_REVIEW_PROCESS]] | Bagaimana perubahan mengalir, dan di mana gate benar-benar menggigit. |
| [[CODE_REVIEW_CHECKLIST]] | Daftar centang praktis. |
| [[CODE_REVIEW_AUDIT]] | Bukti: apa mekanisme review repo ini **sebenarnya**, diukur. |
| [[ENGINEERING_PLAYBOOK]] | Cara kerja engineering. |
| [[CICD]] | Build, test, deploy. |
| [[CI_BATTERY_RUNNER_STATUS]] | Kenapa 4 kali run baterai melaporkan hasil salah. Wajib dibaca sebelum mempercayai output baterai. |

## Review & bukti

| Dokumen | Isi |
|---|---|
| `../deliverables/review/perf-bug-review-2026-10-28.md` | **Review performa & bug yang dijaga hidup.** Satu berkas, ditulis ulang ke commit terakhir — bukan satu berkas per tanggal. Temuan terbuka vs tertutup dipisah, tiap angka diukur ulang. |
| `../deliverables/README.md` | Indeks `deliverables/` — apa yang masih hidup, apa yang snapshot bertanggal. |
| [[LOCAL_SERVER_8888]] | Server lokal `http://localhost:8888` (`dev.cmd`) — **lokal memakai DB produksi**. Baca sebelum menjalankan tes yang bisa menulis. |

## Parity dengan legacy

Repo ini adalah **rebuild** dari aplikasi legacy yang masih live. Dokumen-dokumen ini
adalah jembatan antara keduanya:

[[LEGACY_PARITY_REFERENCE]] · [[PARITY_CHECKLIST]] · [[LEGACY_MODALS_RESPONSIVENESS]]

Gunanya: memastikan v2 tidak diam-diam kehilangan perilaku yang sudah dipakai user nyata.

## Dokumen per-masalah

Bukan kategori, tapi satu dokumen satu masalah selesai:
[[HANDOFF_4KB_ENV_LIMIT]] (deploy gagal karena env > 4 KB) ·
[[db-optimization-2026-09-01]] · [[AI_CV_FULL_FLOW]] · [[AI_DATA_FLOWS]] ·
[[AI_CV_SIDE_BY_SIDE]] · [[HTML_PAGES]] · [[ASTRO_PIPELINE_REFERENCE]] ·
[[UI_DESIGN_REVIEW]] · [[BACKEND_TODO]] · `code-index-schema.ts` (skema, bukan prosa)

## Arsip

[[archive/README]] — dokumen historis. **Jangan pakai sebagai acuan kondisi kode saat
ini.** Ada karena nilainya historis: keputusan yang sudah diambil, fase migrasi yang
sudah selesai, audit yang sudah tertutup.

---

## Konvensi penamaan

- `PHASE_*` — satu fase dari `SCALABILITY_RELIABILITY_ARCHITECTURE` §11. Berurutan.
- `*_by_*` / `*BY*` — dokumen kerja berjalan (mis. `REMAINING_BY_DISCIPLINE`), bukan snapshot.
- `*_2026-09-XX.md` — snapshot bertanggal. Tidak di-update; kalau usang, pindah ke `archive/`.
- **Huruf besar semua** = dokumen aktif. `db-optimization-2026-09-01.md` sengaja
  huruf kecil karena historis.

## 🔴 NOW vs THEN — aturan anti-noise (ditambahkan 2026-11-15)

Sebagian besar isi `docs/` adalah **potret hari itu**, bukan status kini. Sebelum
memakai sebuah angka atau baris status, tentukan dulu mana dari dua ini:/n/n- **THEN** — ada penanda `Basis ukur: HEAD …`, `terukur di <hash>`, atau nama
  berkas `*_2026-…`. Jangan "diperbaiki" barisnya; cukup baca sebagai riwayat.
  Koreksi yang benar adalah menambah penanda SNAPSHOT + pointer ke sumber hidup.
- **NOW** — `README.md` §Status, `PROJECT_CONTEXT.md` §2/§8, dan kode itu sendiri.
  Dokumen NOW wajib menyebut tanggal DAN perintah pengukurnya.

Tiga jebakan yang sudah terukur di repo ini: (1) tabel usang yang sengaja
mempertahankan snapshot awal (R13l §6) — jangan dibetulkan; (2) sitasi commit yang
**tidak ada** (`git cat-file -t <hash>` = `Not a valid object name`); (3) angka
"hijau" yang sebenarnya tidak pernah diukur ulang. Bila ragu, `git log -1`, lalu
jalankan perintah pengukurnya. Ringkasan audit: 
`../deliverables/context-refresh-2026-11-15.md`.

## Konvensi isi

Setiap dokumen yang mengklaim sesuatu **wajib** menyebut:

1. **Basis ukur** — HEAD commit saat ditulis (`git rev-parse --short HEAD`).
2. **Status pohon** — bersih atau kotor, dan berapa berkas kotor.
3. **Perintah pengukur** — untuk setiap angka.

Tanpa ketiganya, dokumen itu berubah dari fakta menjadi kenangan begitu commit
berikutnya masuk.

4. **Penanda SNAPSHOT** bila dokumen tidak lagi dijaga hidup — sebut ke mana
   pembaca harus pergi untuk status NOW. Ini yang membedakan arsip yang berguna
   dari arsip yang menyesatkan.
