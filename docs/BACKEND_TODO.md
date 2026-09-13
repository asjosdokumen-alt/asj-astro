# BACKEND_TODO — satu daftar, semua pekerjaan backend yang belum selesai

**Dibuat:** 2026-09-13 · **Sumber:** kode di `main` (`8593e10`) + `docs/` + `HANDOFF.md`
**Diaudit ulang:** 2026-09-13 (sore) terhadap `main` `cb7c3ad` — **setiap klaim diverifikasi ke kode, bukan
dipercaya dari dokumen.** Beberapa item ternyata sudah selesai dan dikoreksi (#14, #19, #20–#25);
lihat catatan ✅ di tabel masing-masing.
**Pengganti:** `TODO.md` (terakhir 2026-09-03) dan `docs/archive/PARITY_QA_2026-09-04.md` — keduanya sudah
kedaluwarsa; lihat §5.

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
belum dibangun (#10–#18), dan **dokumen yang sekarang bertentangan dengan kode** (#20–#26, *sudah
dibereskan kecuali #26*).

Legenda blokir: 🔴 butuh keputusan/izin owner · 🟠 butuh infrastruktur baru · 🟡 belum dibangun ·
🔵 dibangun tapi tidak ter-trigger · ⚪ klaim belum diukur

---

## 1. Blocker — tidak bisa maju tanpa owner

| # | Item | Bukti | Blokir |
|---|---|---|---|
| **2** | 🔴 **Push `main`.** Remote tetap `47c4440`; lokal **ahead 16** per 2026-09-13 (`cb7c3ad`). Commit lokal yang belum naik antara lain: `cb7c3ad` (bug job board 1-baris), `da4b72d` (i18n job values + proxy), `c36d6aa` (preview + Tema/Filter), `e52b38b` · `d28b5e0` (item owner), `75dd3cd` · `a4b5f13` · `5909398`. **Akibatnya: semua perbaikan ini BELUM tayang di `asjastro.netlify.app`** — live masih menyajikan bundle lama | `git rev-list --count newrepo/main..main` (angkanya naik tiap commit lokal — jalankan, jangan hafal) | Aturan owner: **jangan push tanpa izin**. Push ke `main` = auto-build + deploy produksi |

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
| **8** | ✅ **SELESAI 2026-09-13 — reminder agenda sekarang menyala.** Pemicunya adalah cron baru `netlify/functions/agenda-reminders.ts` (`export const config = { schedule: '*/10 * * * *' }`), yang memanggil konteks `handleCheckAndSendAgendaReminders(undefined, { internal: true })` — langsung, bukan lewat surface, karena fungsi terjadwal tidak punya sesi dan surface-nya admin-guarded (`requireRole` akan membalas `{ sessionInvalid:true }`: cron terlihat hijau sambil mengirim nol). Pola `internal: true` sama dengan `wa.send`/`wa.broadcast` di `sweep-queue`. Interval 10 menit dipilih karena harus **lebih sempit dari window terlebar** (h0 = 60 menit) atau sebuah jadwal bisa masuk dan keluar window di antara dua run. Surface HTTP tidak berubah ⇒ bypass tetap tidak terjangkau dari luar. Diverifikasi: zisi melaporkan `schedule: */10 * * * *`, `runtimeAPIVersion: 2`, 0 fungsi mode kompat | `netlify/functions/agenda-reminders.ts`, `contexts/scheduling/service.ts:176`, test `contexts/scheduling/service-reminder-cron.test.ts` (8 tes) | **Tidak ada.** Catatan asal-usul: entri legacy yang dihapus 2026-09-11 bernama `schedule-reminders` — jadi fiturnya memang tidak pernah punya rumah |
| **9** | ✅ **SELESAI 2026-09-13 — defer P3 alih-alih shed, tapi HANYA yang punya worker.** `deferralJobTypeFor()` di `kernel/admission.ts`; jalur shed di `_lib/handlers.ts` kini meng-enqueue (202 + jobId) alih-alih 503. **Perangkap yang ditemukan:** job tanpa worker duduk `pending` **selamanya** — pemanggil diberi tahu "accepted", kerjaannya tidak pernah jalan, tidak ada error. `sweep-queue.ts` hanya punya **3** tipe job (`wa.broadcast`, `wa.send`, `ai.interview`), jadi hanya aksi yang punya salah satunya yang boleh di-defer. `kirimSatuPesanFonnte`→`wa.send` ✅; `kirimTawaranMassal` sudah enqueue di surface (tak pernah sampai jalur shed); `generateWawancaraModel` punya worker tapi **interaktif** (admin menunggu dokumen) ⇒ sengaja **tidak** di-defer; 9 aksi P3 lain **tanpa worker** ⇒ 503 tetap jawaban jujur. Gagal enqueue ⇒ jatuh ke 503 (jangan pernah bilang "accepted" kalau tidak masuk antrean). Test 7 (+ guard anti-parse-kosong); **diverifikasi mutasi** | `kernel/admission.ts` (`DEFERRABLE`), `_lib/handlers.ts:136-165`, `admission.test.ts`, `docs/PHASE_B_LOAD_BOUNDING.md` §5.1 | **Tidak ada.** Yang tersisa = menambah worker bagi 9 aksi P3 (pekerjaan terpisah, bukan penghalang) |

---

## 4. Paritas legacy / fitur yang belum dibangun

| # | Item | Bukti | Blokir |
|---|---|---|---|
| **10** | ✅ **SELESAI 2026-09-13 — C05 diaudit 1:1 vs legacy.** **Bug nyata ditemukan & diperbaiki:** guard ekstensi (`cekEkstensiFile`) legacy **tidak pernah diport** — modal hanya cek ukuran, sehingga file bertipe salah ter-upload, ter-persist, dan ber-toast sukses (dokumen kandidat tak terpakai di ujung lain). Kini `rejectExtension()` dipanggil per-input sebelum cek ukuran, dengan `ui.toast_file_ext_bad`/`ui.toast_file_too_big` (keduanya sebelumnya **tidak ada** di dict — pesan ukuran lama di-hardcode Indonesia). Ditambah `berkasCatalog.test.ts` (20 test) yang **mengimpor dua sisi secara live** dan mengunci kontrak `jenis` ↔ `FILE_LABEL_COLUMNS`. Sisa paritas sudah benar (18 dokumen, regex T1/T2, prefill bio, konfirmasi timpa) | `e37647c`, `src/lib/berkasCatalog.test.ts`, `docs/PARITY_CHECKLIST.md` (C05 ✅) | **Tidak ada.** Baris paritas C05 kini ✅ — tak ada lagi yang 🔄 |
| **11** | 🟡 **Export Excel.** Yang ada hanya CSV (`exportKandidatCsv`). `xlsx` **sudah terpasang** di `node_modules` (dipakai *parser* ingestion di `contexts/documents/service.ts:537,740`), bukan untuk export. **Bisa 100% lokal** | `docs/LEGACY_PARITY_REFERENCE.md:61`, `src/lib/apiEndpoint.ts:90-94` | Belum dibangun. Bahan sudah lengkap — tinggal sisi export + tombol |
| **12** | 🟡 **Reject mail composer.** Legacy punya; di repo baru tidak ada jejaknya (`grep -rln "rejectMail\|MailComposer\|composer" src netlify` → kosong). Catatan: **tombol reject-nya sudah ada** (`TabMail` → `rejectForm`) — yang belum adalah *composer* suratnya, jadi jangan dikira reject-nya tidak jalan | `docs/LEGACY_PARITY_REFERENCE.md:64` | Belum dibangun |
| **13** | 🟡 **Modal Migrasi Drive.** Tidak ada komponennya di `src/components/admin/` (31 komponen, tidak ada yang cocok). Sisa jejaknya hanya **2 key i18n** — `admin.db_migration_auto`, `admin.run_migration` (`src/store/i18n.ts:944-945`) — **tanpa UI**. **Bisa 100% lokal** | `docs/LEGACY_PARITY_REFERENCE.md:65` | Belum dibangun |
| **14** | ✅ **SELESAI — TabConfig bukan read-only lagi.** Ia sudah memanggil `api.secure('updateSysConfig', …)` **dua kali** (`TabConfig.tsx:44` untuk options per-config-id, `:51` untuk pengumuman) dengan tombol simpan (`:80`, `:100`) + toast `toast_config_saved`/`toast_announcement_saved`. Ia juga **sudah** memakai `api.secure`, bukan `fetch` mentah. Klaim lama ("105 baris, hanya `getAppData`, tidak ada aksi simpan") **tidak lagi benar** | `src/components/admin/TabConfig.tsx:34,44,51,80,100` | **Tidak ada.** Yang mungkin masih kurang hanyalah kelengkapan *field* settings (Fonnte token, AI model) — tapi mekanisme simpannya sudah ada; jangan bangun ulang |
| **15** | 🟡 **Bulk operations.** Tidak ada multi-select delete/ubah-status di admin mana pun — **dan tidak ada action backend-nya juga**: `grep -rn "bulkDelete\|bulkUpdate\|deleteSelected\|simpanTugas" netlify/functions/` → kosong | `grep -rn "selectedIds\|bulkDelete" src/components/admin/` → kosong | Belum dibangun. Perlu **action backend baru + UI**, bukan sekadar UI. **Bisa 100% lokal** (verifikasi: vitest + `tsc` + zisi) |
| **16** | 🟡 **Realtime.** Tidak ada subscription Supabase realtime di `src/` sama sekali | `grep -rn "realtime\|channel(" src/` → kosong | Belum dibangun |
| **17** | 🟡 **Email notification.** Tidak ada modul email apa pun (tidak ada nodemailer/sendgrid/resend/smtp) | `grep -rln "nodemailer\|sendgrid\|resend\|smtp" netlify src` → kosong | Belum dibangun. Catatan: WA sudah jadi kanal utama; apakah email masih dibutuhkan itu keputusan produk |
| **18** | 🟡 **PWA offline audit.** Manifest ada; perilaku offline belum diaudit | `docs/LEGACY_PARITY_REFERENCE.md:77`, `public/*.webmanifest` | Belum diaudit |
| **19** | ✅ **SELESAI — TabJadwal & TabMail sudah memakai `api.secure`.** Klaim lama ("`getEndpoint(...)` + `sessionToken` manual, melewati penanganan sesi-invalid") **tidak lagi benar**: `grep -c getEndpoint` = **0** di kedua file. `TabJadwal` → `api.secure('getAppData'/'simpanJadwalBaru'/'hapusJadwal')`; `TabMail` → `api.secure(action, [id])` lewat helper `act()`. Pola B02 sudah tersebar | `src/components/admin/TabJadwal.tsx:6,27,37`, `src/components/admin/TabMail.tsx:15,53` | **Tidak ada** |

---

## 5. Doc hygiene — dokumen yang sekarang bertentangan dengan kode

Bukan kosmetik: repo ini sudah dua kali kena kelas bug "dokumen menjanjikan perilaku yang tidak ada"
(`ai_unavailable`, dan sebelum itu 4 dari 7 baris matriks degradasi). Menjaga daftar ini bersih adalah
bagian dari pekerjaan, bukan hiasan.

| # | Status & masalah |
|---|---|
| **20** | ✅ **SELESAI 2026-09-13.** `docs/PARITY_CHECKLIST.md` B06 + C06 — B06 mencatat "gate token DIBATALKAN"; C06 kini bertanda `♻️ 2026-09-13 (gate token dibatalkan)`, tidak lagi mengklaim token per-job aktif |
| **21** | ✅ **SELESAI.** `PARITY_QA_2026-09-04.md` sudah dipindah ke **`docs/archive/`** (terverifikasi ada di `ls docs/archive/`); checklist menandainya historis, bukan daftar kerja |
| **22** | ✅ **SELESAI.** `docs/LEGACY_PARITY_REFERENCE.md` baris Mail (`:37`) & Jadwal (`:38`) **sudah ✅** dengan catatan koreksi bertanggal 2026-09-13 ("Wiring sudah ada — lihat #22 di `BACKEND_TODO.md`") |
| **23** | ✅ **SELESAI.** `TODO.md` **sudah dirapikan 2026-09-13** — dibuka dengan "Pekerjaan BACKEND ada di satu tempat: `docs/BACKEND_TODO.md`"; klaim "~80 % fitur / ~15 fitur hilang" sudah dihapus |
| **24** | ✅ **SELESAI 2026-09-13.** `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §11 butir 5 **dan** tabel S5 (`:38`) dikoreksi. Baris S5 bertahan berhari-hari sebagai "Remaining — gated on deploy verification" **setelah** pekerjaannya selesai — langkah *verifikasi deploy* dikira sama dengan *pekerjaannya*. Bukti: `node scripts/ci/verify-function-entries.mjs --list` → 22 entri, semua mengekspor handler, **"no Lambda-compat entries"** |
| **25** | ✅ **SELESAI 2026-09-13.** Header `docs/HANDOFF_4KB_ENV_LIMIT.md` diubah dari "terdiagnosis, belum diperbaiki" → **"SELESAI — keluar dari Lambda compatibility mode"** (deploy `6aa57207` ready, 0 fungsi mode kompat) |
| **26** | ⚠️ **MASIH TERBUKA — sisanya cuma di `HANDOFF.md`.** (a) **revoke token `ghp_qzq70Qy…`** — masih aktif, kebocoran token ke-3 di proyek ini; (b) `origin` masih menunjuk repo lama `khoci280-arch/asj-astro` (yang aktif = remote **`newrepo`** = `asjosdokumen-alt/asj-astro`); (c) branch `dev` tertinggal 14 commit. **(a) di GitHub & (b) `git remote set-url` — keduanya tanpa build Netlify** |

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
- **#8 (2026-09-13)** — reminder agenda punya pemicu: cron `agenda-reminders.ts` tiap 10 menit,
  memanggil konteks dengan `{ internal: true }`. Sebelumnya fitur ini mati dua kali: `getActiveSchedules()`
  selalu `[]` (bug `{ rows }`, diperbaiki 2026-09-13) **dan** tidak ada yang memanggilnya.
- **Item owner 1–5 (2026-09-13)** — 1 Fonnte `wa.send` · 2 `AI_UNAVAILABLE` → 503 + banner ·
  3 DB-down → 503 + `Retry-After` · 5 login admin personal tiga tingkat. **Item 4 = #1 di atas.**
- **Paritas A01–A19, B01–B07, C01–C04, C06** — lihat `docs/PARITY_CHECKLIST.md`.
- **#14 & #19 (audit 2026-09-13)** — ternyata **sudah selesai**: `TabConfig` punya `updateSysConfig`
  + tombol simpan; `TabJadwal`/`TabMail` sudah `api.secure` (`getEndpoint` = 0 kemunculan).
  Jangan bangun ulang.
- **Doc hygiene #20–#25 (2026-09-13)** — enam dokumen yang bertentangan dengan kode sudah dikoreksi.
- **Matriks degradasi §6.5** — 4/7 baris bertahan (dari 2/7); sisa divergensi: Fonnte (enqueue jalan,
  status bukan 202), Storage (retry client-side), Pooler (shed tanpa antre).

---

## 8. Urutan yang saya sarankan

> **Ditinjau 2026-09-13 (setelah audit ulang).** Urutan lama membuka dengan "putuskan migrasi 013" —
> **basi**, #1 sudah ditutup (gate-nya dihapus, bukan dimigrasi). Dan #20–#23 sudah dikerjakan.

1. ~~**#1** — putuskan migrasi 013.~~ **✅ ditutup** — tidak ada blocker migrasi.
2. ~~**#20–#23** — koreksi empat dokumen yang berbohong.~~ **✅ selesai 2026-09-13**, bersama #24 dan #25.
   Sisa doc-hygiene hanya **#26** (revoke token + rapikan `origin`/`dev`) — bisa tanpa build Netlify.
3. **#8 — ✅ selesai 2026-09-13.** Cron `agenda-reminders` (10 menit) + bypass `internal: true` pada
   konteks. Pemicunya sudah ada; yang tersisa hanya data (`database_schedule` masih 0 baris, jadi
   cron-nya benar-benar mengirim nol sampai ada jadwal dibuat — itu perilaku yang diharapkan).
4. **#2 — push `main`.** Sebelum ini, **semua perbaikan (i18n job values, bug 1-baris job board, proxy
   preview) tidak tayang di produksi**. Push = auto-build + deploy. **Butuh izin owner.**
5. **#11 Export Excel → #15 Bulk operations → #12/#13/#18** — paritas yang belum dibangun.
   **Semuanya bisa 100% dikerjakan & diverifikasi lokal** (vitest + `tsc` + zisi), nol token Netlify.
6. **#3 + #27** — jalankan gate Phase C. Butuh `HEALTH_TOKEN` dari owner (tidak bisa lokal).
7. **#4–#6** — staging. Ini yang membuka tiga item sekaligus (20, 22, kalibrasi cap). Infrastruktur.
8. **#9** — defer P3 ke `job_queue`. Perbaikan arsitektur; bisa lokal.
9. **#16/#17** — realtime & email. **#17 email = keputusan produk dulu** (WA sudah kanal utama).
10. **#28–#30** — owner-side: rotasi `SESSION_SECRET`, ukur cold start, revoke token.
