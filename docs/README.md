# docs/ — peta dokumentasi ASJ Portal v2

**Ini pintu masuknya.** Setiap dokumen di folder ini punya satu pekerjaan; kalau kamu
tidak tahu harus baca yang mana, mulai dari tabel di bawah.

> **Aturan emas repo ini:** *angka di dokumen datang dari perintah yang dijalankan,
> bukan dari ingatan penulisnya.* Kalau sebuah klaim di bawah tidak menyebut cara
> mengukurnya, perlakukan sebagai pendapat, bukan fakta.

---

## Kalau kamu baru masuk (baca 3 ini dulu)

| # | Dokumen | Untuk apa |
|---|---|---|
| 1 | [[DEVELOPMENT_ROADMAP]] | **Urutan eksekusi.** Apa yang dikerjakan sekarang, apa yang sengaja ditunda, dan kenapa. Ini otoritas urutan kerja. |
| 2 | [[REMAINING_BY_DISCIPLINE]] | Apa yang belum selesai, dikelompokkan per disiplin (frontend, backend, CI, data). |
| 3 | `../HANDOFF.md` | Kondisi terkini + apa yang sedang dikerjakan sesi terakhir. |

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
| [[ARCHITECTURE]] | Arsitektur frontend (Astro + Preact). | ✅ terimplementasi |
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

## Konvensi isi

Setiap dokumen yang mengklaim sesuatu **wajib** menyebut:

1. **Basis ukur** — HEAD commit saat ditulis (`git rev-parse --short HEAD`).
2. **Status pohon** — bersih atau kotor, dan berapa berkas kotor.
3. **Perintah pengukur** — untuk setiap angka.

Tanpa ketiganya, dokumen itu berubah dari fakta menjadi kenangan begitu commit
berikutnya masuk.
