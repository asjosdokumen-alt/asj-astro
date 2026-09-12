# BACKEND_TODO — satu daftar, semua pekerjaan backend yang belum selesai

**Dibuat:** 2026-09-13 · **Sumber:** kode di `main` (`75dd3cd`) + `docs/` + `HANDOFF.md`
**Pengganti:** `TODO.md` (terakhir 2026-09-03) dan `docs/PARITY_QA_2026-09-04.md` — keduanya sudah
kedaluwarsa; lihat §6.

---

## 0. Koreksi premis dulu

> "A–E bagian besar sudah jadi, sisa detail-detail yang belum ya."

**Benar untuk fase-fasenya, menyesatkan untuk backendnya.** Dua hal yang perlu dipisah:

- **Phase A–D selesai dengan sisa yang disebut namanya.** A: tuntas (11 catch-all dihapus, 2.364 KB /
  17 entri). B: tuntas, dua item "not a platform feature" diganti mekanisme lain. C: **kodenya sudah
  di-deploy, tapi gate-nya belum pernah dijalankan** — lihat #3. D: tuntas. Item B06 yang sempat
  tertahan di migrasi **selesai 2026-09-13 dengan menghapus gate-nya**, bukan memigrasinya — lihat #1.
- **Phase E bukan "detail".** 19 & 21 selesai; **20 dan 22 tidak bisa dijalankan sama sekali** karena
  butuh staging deployment + Supabase project terpisah, dan keduanya **belum ada**. Itu pekerjaan
  infrastruktur, bukan detail.

Dan yang paling mudah terlewat: **sisa backend terbesar bukan di dalam fase A–E sama sekali.** Ia ada di
tiga tempat lain — fitur yang backendnya hidup tapi **tidak punya pemanggil** (#8), paritas legacy yang
belum dibangun (#11–#18), dan **dokumen yang sekarang bertentangan dengan kode** (#20–#26).

Legenda blokir: 🔴 butuh keputusan/izin owner · 🟠 butuh infrastruktur baru · 🟡 belum dibangun ·
🔵 dibangun tapi tidak ter-trigger · ⚪ klaim belum diukur

---

## 1. Blocker — tidak bisa maju tanpa owner

| # | Item | Bukti | Blokir |
|---|---|---|---|
| **2** | 🔴 **Push `main`.** Commit lokal yang belum naik: `e52b38b` · `d28b5e0` · `75dd3cd` · `a4b5f13` · `5909398` (share-token) + 5 commit sebelum sesi ini; remote tetap `47c4440` | `git rev-list --count newrepo/main..main` (angkanya naik tiap commit lokal — jalankan, jangan hafal) | Aturan owner: **jangan push tanpa izin**. Push ke `main` = auto-build + deploy produksi |

> **#1 — B06 share token: ✅ SELESAI 2026-09-13, dengan dihapus bukan dimigrasi.** `sys_config` memang
> tidak punya kolom `config_key`, tapi gate token ternyata **bukan parity legacy** (legacy hanya membaca
> `?job=`; lihat `docs/LEGACY_PARITY_REFERENCE.md` §5 P1 yang sudah dikoreksi). Keputusan owner: share
> kembali **publik per kode job**, tanpa akun — TSK adalah pihak luar. `migrations/013_sys_config_config_key.sql`
> **dihapus** (tidak akan pernah diterapkan), bersama `_lib/db/shareTokens.ts`, action
> `getShareTokenForJob`, field `config_key` di `row-types.ts`, dan setiap `&tk=` di link/WA
> template/preview. Karena itu **tidak ada lagi blocker migrasi** di sini — dan tidak ada perubahan DB
> yang dibutuhkan untuk B06.

---

## 2. Dibangun, tapi gate-nya belum pernah dijalankan

Bagian ini yang paling sering disalahartikan sebagai "selesai". Kodenya ada; **prosedurnya** belum.

| # | Item | Bukti | Blokir |
|---|---|---|---|
| **3** | ⚪ **Gate Phase C §6 belum pernah dijalankan.** Gate-nya bukan dokumen, tapi prosedur: suntik kegagalan DB → sink harus menyala ≤2 menit → `health?detail=1` harus menjawab `status:"down"` + `reasons` + `shared.postgrest.reachable:false` + HTTP **503**. Yang sudah ada: endpoint `/health`, `contexts/diagnostics`, `sweep-queue` tiap 2 menit. Yang belum: **tidak ada catatan bahwa prosedurnya pernah dijalankan** | `docs/PHASE_C_OBSERVABILITY.md` §6, `docs/PHASE_C_SINK_SETUP.md` | `HEALTH_TOKEN` harus ada di site; `METRICS_SINK_URL` opsional (tanpa itu sink = no-op yang disengaja, jadi gate-nya tidak bisa lulus). Keduanya **owner-side** |
| **4** | 🟠 **Phase E item 20 — load test 10× peak.** Tidak dijalankan, dan sengaja: terhadap produksi itu persis insiden yang Phase B dibangun untuk dibatasi; terhadap localhost angkanya tidak berarti (tanpa CDN, tanpa isolasi function, tanpa pooler, tanpa RTT ke `ap-southeast-1` — padahal RTT = 99,7 % latency sistem ini) | `docs/PHASE_E_DEGRADATION_MATRIX.md` §4 | **Staging deployment + Supabase project terpisah.** `deploy-staging.yml` sudah ada; project-nya belum |
| **5** | 🟠 **Phase E item 22 — pooler failover drill.** Supavisor shared pooler tidak punya failover yang bisa dipicu operator; drill terdekat = arahkan staging ke koneksi langsung `:5432` dan buktikan sistem **degradasi**, bukan rusak | `docs/PHASE_E_DEGRADATION_MATRIX.md` §4 | Staging yang sama dengan #4 |
| **6** | 🟠 **Phase B §7.2 — kalibrasi in-flight cap (24/4/3) di bawah beban nyata.** Nilainya masih tebakan; sengaja env-overridable untuk alasan ini | `docs/PHASE_B_LOAD_BOUNDING.md` §7.2 | Staging yang sama dengan #4 |
| **7** | 🔴 **Alert §7.2 + mulai melacak error budget §7.3.** Empat sinyal (latency/traffic/errors/saturation) dan tiga SLO sudah **ditulis**, belum **dikonfigurasi** di tool apa pun. `docs/PHASE_C_SINK_SETUP.md` adalah panduan dari nol | `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §7.2–7.3 | Butuh pilihan receiver + akun; owner-side |

---

## 3. Backend hidup, tapi tidak ada yang memanggilnya

Kelas ini yang paling licin: handler-nya benar, ter-guard, ter-test — dan tidak pernah jalan.

| # | Item | Bukti | Blokir |
|---|---|---|---|
| **8** | 🔵 **Reminder agenda tidak pernah menyala.** `checkAndSendAgendaReminders` adalah aksi surface yang hidup dan admin-guarded (`surfaces/schedule.ts`, `registry.ts:73`), **tapi tidak ada pemanggil UI dan tidak ada cron**. Satu-satunya fungsi terjadwal adalah `sweep-queue` (`export const config = { schedule: '*/2 * * * *' }`) | `netlify/functions/surfaces/schedule.ts`, `netlify/functions/sweep-queue.ts:152`, `grep -rn "checkAndSendAgendaReminders" src/` → hanya `apiEndpoint.ts` | Perlu `export const config = { schedule }` pada fungsi terjadwal, **atau** tombol UI. Bug `getActiveSchedules()` sudah diperbaiki 2026-09-13 — tinggal pemicunya |
| **9** | 🟡 **Defer P3 ke `job_queue` alih-alih shed.** Saat ini P3 di-shed (503 + `Retry-After`); yang benar untuk sebuah *write* adalah menaruhnya di antrean. Titik integrasi sudah ditunjuk: `surfaces/notify.ts` | `docs/PHASE_B_LOAD_BOUNDING.md` §7.2, §5.1 | Belum dikerjakan; kandidat Phase C |

---

## 4. Paritas legacy / fitur yang belum dibangun

| # | Item | Bukti | Blokir |
|---|---|---|---|
| **10** | 🟡 **C05 — dokumen/berkas kandidat (upload/simpan/revisi).** Surface-nya sudah di-wire; **UI modal belum dicek 1:1**. Satu-satunya baris checklist paritas yang belum ✅ | `docs/PARITY_CHECKLIST.md:55` | QA form vs modal legacy |
| **11** | 🟡 **Export Excel.** Yang ada hanya CSV (`exportKandidatCsv`). `xlsx` sudah dibundel, tapi untuk *parser* ingestion, bukan export | `docs/LEGACY_PARITY_REFERENCE.md:61`, `src/lib/apiEndpoint.ts:90-94` | Belum dibangun |
| **12** | 🟡 **Reject mail composer.** Legacy punya; di repo baru tidak ada jejaknya | `docs/LEGACY_PARITY_REFERENCE.md:64` | Belum dibangun |
| **13** | 🟡 **Modal Migrasi Drive.** Legacy punya; tidak ada jejaknya | `docs/LEGACY_PARITY_REFERENCE.md:65` | Belum dibangun |
| **14** | 🟡 **TabConfig masih read-only.** 105 baris, hanya memanggil `getAppData`; **tidak ada satu pun aksi simpan**. "Lengkapi settings (Fonnte token, AI model, dll)" belum tersentuh. Bonus: ia memakai `fetch` mentah, bukan `getEndpoint(...)` | `src/components/admin/TabConfig.tsx:34` | Belum dibangun |
| **15** | 🟡 **Bulk operations.** Tidak ada multi-select delete/ubah-status di admin mana pun | `grep -rn "selectedIds\|bulkDelete" src/components/admin/` → kosong | Belum dibangun |
| **16** | 🟡 **Realtime.** Tidak ada subscription Supabase realtime di `src/` sama sekali | `grep -rn "realtime\|channel(" src/` → kosong | Belum dibangun |
| **17** | 🟡 **Email notification.** Tidak ada modul email apa pun (tidak ada nodemailer/sendgrid/resend/smtp) | `grep -rln "nodemailer\|sendgrid\|resend\|smtp" netlify src` → kosong | Belum dibangun. Catatan: WA sudah jadi kanal utama; apakah email masih dibutuhkan itu keputusan produk |
| **18** | 🟡 **PWA offline audit.** Manifest ada; perilaku offline belum diaudit | `docs/LEGACY_PARITY_REFERENCE.md:77`, `public/*.webmanifest` | Belum diaudit |
| **19** | 🟡 **TabJadwal & TabMail memakai `fetch` mentah** (`getEndpoint(...)` + `sessionToken` manual), bukan `api.secure`/`apiClient`. Fungsional, tapi melewati penanganan sesi-invalid + redirect bersama. B02 sudah memperbaiki pola ini untuk TabWA; dua tab ini tertinggal | `src/components/admin/TabJadwal.tsx:37,76`, `src/components/admin/TabMail.tsx:170-176` | Belum dirapikan |

---

## 5. Doc hygiene — dokumen yang sekarang bertentangan dengan kode

Bukan kosmetik: repo ini sudah dua kali kena kelas bug "dokumen menjanjikan perilaku yang tidak ada"
(`ai_unavailable`, dan sebelum itu 4 dari 7 baris matriks degradasi). Menjaga daftar ini bersih adalah
bagian dari pekerjaan, bukan hiasan.

| # | Dokumen | Masalah |
|---|---|---|
| **20** | `docs/PARITY_CHECKLIST.md` B06 + C06 | Ditandai **✅ 2026-09-05** padahal token per-job **belum pernah bisa di-mint** (#1). Viewer-nya memang ter-wire; gate token-nya tidak pernah hidup. Harus dikoreksi jadi "🔄 ter-wire, token belum aktif" |
| **21** | `docs/PARITY_QA_2026-09-04.md` | Snapshot 2026-09-04. Delta A3/A4/A5/AI3/S1/S4 yang masih tertulis 🔲 **sudah ditutup** oleh C01–C04. Dokumen ini superseded, bukan daftar kerja |
| **22** | `docs/LEGACY_PARITY_REFERENCE.md` | Baris Mail (`:37`) dan Jadwal (`:38`) masih 🟡 GAP "belum ter-wire". **Sudah ter-wire**: `TabMail` memanggil `approveForm`/`reviewForm`/`rejectForm`; `TabJadwal` memanggil `simpanJadwalBaru`/`hapusJadwal`. Sisa yang benar-benar belum hanya pemicu reminder (#8) |
| **23** | `TODO.md` | Terakhir **2026-09-03**; "~80 % fitur / ~15 fitur hilang" tidak lagi benar. RLS, error boundary, document preview, AI interview simulator, WA blast massal — semua sudah selesai. Rate limiting juga sudah dijawab desain (Postgres-backed `rpc/rate_limit_check`, jadi aman multi-instance), dan CORS ternyata hanya dipasang di `share-data.js` (memang publik) — sisanya same-origin |
| **24** | `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §11 Phase A | Butir 5 masih "**Remaining** — gated on deploy verification", padahal `PHASE_B §7.1` mencatat 11 catch-all **sudah dihapus** (2.364 KB / 17 entri). §11 tertinggal dari kenyataan |
| **25** | `docs/HANDOFF_4KB_ENV_LIMIT.md` | Header: "**Status:** terdiagnosis, belum diperbaiki. Menunggu keputusan pemilik." Sudah selesai — keluar dari Lambda compatibility mode, deploy `6aa57207` = ready, 0 fungsi mode kompat |
| **26** | `HANDOFF.md` | Berisi housekeeping yang masih terbuka: **revoke token `ghp_qzq70Qy…`** (masih aktif), `origin` masih menunjuk repo lama `khoci280-arch/asj-astro`, `dev` tertinggal 14 commit |

---

## 6. Owner-side / infra (bukan kode)

| # | Item | Kenapa |
|---|---|---|
| **27** | Set `HEALTH_TOKEN` di site; putuskan `METRICS_SINK_URL` (+ token receiver) | Prasyarat #3 dan #7. Tanpa itu sink = no-op dan gate Phase C tidak bisa lulus |
| **28** | Rotasi `SESSION_SECRET` bila sudah dipakai di produksi | Dari `TODO.md`; **belum pernah dikonfirmasi**. Kode tidak punya fallback ke password admin (S3 fix), jadi nilainya kritis |
| **29** | Ukur cold start function vs target < 3 s | Belum pernah diukur; tidak ada gate-nya |
| **30** | Revoke `ghp_qzq70Qy…`, bereskan `origin`/`dev` | Kebocoran token ke-3 lewat chat di proyek ini (`HANDOFF.md`) |

---

## 7. Sudah selesai — jangan dikerjakan ulang

Diringkas supaya daftar di atas tidak diragukan lagi.

- **Phase A** — 11 catch-all dihapus, 2.364,3 KB / 17 entri, `verify:aliases` jadi gate offline.
- **Phase B** — priority class P0–P3 + shedding, deadline 12 s, `migration 011` (`statement_timeout` 3 s,
  live), ratchet punya absolute floor 8 KB, `contexts/documents/download.ts` tidak lagi bisa menggantung
  2.000 s.
- **Phase C** — endpoint `/health`, `contexts/diagnostics`, sink kontrak, runbook A1–A7, SLO §7.3
  ditulis. *(Yang belum: prosedurnya dijalankan — #3.)*
- **Phase D** — `schema.generated.ts` + `verify:schema`, RLS lockdown `012` (live, anon 401/42501),
  keyset pagination (item 17), migrasi ber-checksum (12 berkas, 0 drift), gate `select=*` tiga lapis.
- **Phase E** — item 19 (chaos suite, 14 tes) & 21 (idempotency replay) selesai.
- **Item owner 1–5 (2026-09-13)** — 1 Fonnte `wa.send` · 2 `AI_UNAVAILABLE` → 503 + banner ·
  3 DB-down → 503 + `Retry-After` · 5 login admin personal tiga tingkat. **Item 4 = #1 di atas.**
- **Paritas A01–A19, B01–B07, C01–C04, C06** — lihat `docs/PARITY_CHECKLIST.md`.
- **Matriks degradasi §6.5** — 4/7 baris bertahan (dari 2/7); sisa divergensi: Fonnte (enqueue jalan,
  status bukan 202), Storage (retry client-side), Pooler (shed tanpa antre).

---

## 8. Urutan yang saya sarankan

1. **#1** — putuskan migrasi 013. Ini satu-satunya yang memblokir pekerjaan kode berikutnya.
2. **#20–#23** — koreksi empat dokumen yang berbohong. Murah, dan mencegah orang berikutnya
   mengerjakan hal yang sudah selesai atau mempercayai gate yang tidak pernah hidup.
3. **#8** — reminder agenda. Backendnya sudah benar; yang hilang cuma satu baris `config.schedule`.
4. **#3 + #27** — jalankan gate Phase C. Butuh satu env var dari owner.
5. **#4–#6** — staging. Ini yang membuka tiga item sekaligus (20, 22, kalibrasi cap).
6. Sisanya (#9–#19) sesuai prioritas produk.
