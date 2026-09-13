# BACKEND_TODO — satu daftar, semua pekerjaan backend yang belum selesai

**Dibuat:** 2026-09-13 · **Sumber:** kode di `main` (`8593e10`) + `docs/` + `HANDOFF.md`
**Diaudit ulang:** 2026-09-13 (sore) terhadap `main` `cb7c3ad` — **setiap klaim diverifikasi ke kode, bukan
dipercaya dari dokumen.** Beberapa item ternyata sudah selesai dan dikoreksi (#14, #19, #20–#25);
lihat catatan ✅ di tabel masing-masing.
**Audit ketiga:** 2026-09-13 (malam) terhadap `main` `70a648e`. Paritas yang belum dibangun sudah
dikerjakan (#11 `0b46c22`, #15 `3fdaac4`, #12 `d927cce`, #10 `e37647c`, #18 `25fe9c5`, #9 `70a648e`).
Sisanya diverifikasi **terhadap produksi, bukan dokumen** — probe `/.netlify/functions/health`
mengoreksi #3 & #27 dan menemukan **#31** (gate rollback tidak memeriksa health sama sekali).
**Ditambah 2026-09-13 (malam, lanjutan):** exporter OTLP ke Grafana Cloud dibangun
(`_lib/otlp.ts`), sehingga #3/#7/#27 berubah dari "butuh keputusan receiver" menjadi
**"butuh 2 env var"**. Lihat `docs/PHASE_C_SINK_SETUP.md` §2b.
**Audit keempat:** 2026-09-13 (malam) — **#31 selesai**: gate rollback kini benar-benar memeriksa
health (`--health` dikirim oleh deploy produksi/staging/rollback), dengan klasifikasi PASS/WARN/FAIL
yang ter-test dan **termutasi** (7 mutasi, semuanya memerahkan suite), sehingga probe yang tidak bisa
mengautentikasi memberi warning, bukan rollback.
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

**Pembaruan 2026-09-13 (malam):** dari ketiga tempat itu, **dua sudah dikosongkan.** #8 punya pemicu;
#10, #11, #12, #15, #18 selesai — dan **tiga di antaranya ternyata bug nyata, bukan sekadar gap dokumen**
(guard ekstensi yang tak pernah diport, navigasi offline yang mendarat di halaman salah, bulk delete
warisan legacy yang menghapus baris bergeser). **#31 juga selesai** (gate rollback kini memeriksa
health). Yang **benar-benar masih 🟡** tinggal **#16 (realtime)** dan **#17 (email)** — keduanya
**menunggu keputusan produk**, bukan menunggu tenaga. Sisa lain butuh owner/infra (#2–#7, #26–#31):
**#31 sudah tertutup**, dan **#26 sudah menyusut jadi satu tindakan owner** (revoke token — `origin` dan
`dev` sudah tidak ada). **Jadi tidak ada lagi pekerjaan backend yang bisa saya kerjakan tanpa keputusan
Anda.**

> **Catatan kepercayaan angka.** Dua baris di dokumen ini sebelumnya tertinggal jauh dari kenyataan
> (`#2` bilang remote masih `47c4440`/ahead 23 padahal seluruh sesi sebelumnya sudah tayang; `#26`
> menyuruh membereskan `origin`/`dev` yang sudah tidak ada). **Setiap angka commit di sini harus
> diverifikasi dengan perintahnya, bukan dibaca dari prosa** — verifikasi yang benar itu **dua langkah**,
> karena `newrepo/main` **tidak punya tracking ref** di repo ini (`git show-ref` hanya memuat
> `refs/heads/main`; objek store rusak, `git fetch` gagal):
>
> 1. `git ls-remote newrepo refs/heads/main` → SHA remote yang sebenarnya (ini satu-satunya kebenaran
>    soal remote, jangan pakai ref lokal);
> 2. `git rev-list --count HEAD --not <SHA-dari-langkah-1>` → jumlah commit yang belum naik.
>
> **`git rev-list --count newrepo/main..main` akan gagal** dengan `unknown revision or path not in the
> working tree` — ref itu tidak ada. Jangan hafal angkanya juga.

Legenda blokir: 🔴 butuh keputusan/izin owner · 🟠 butuh infrastruktur baru · 🟡 belum dibangun ·
🔵 dibangun tapi tidak ter-trigger · ⚪ klaim belum diukur · 🟢 prasyarat sudah terpenuhi (sebagian
jalan; sisanya disebut namanya) · ✅ selesai

---

## 1. Blocker — tidak bisa maju tanpa owner

| # | Item | Bukti | Blokir |
|---|---|---|---|
| **2** | 🔴 **Push `main`.** (**Diukur ulang 2026-09-13 malam:** remote sudah **`1adb960`** — seluruh 26 commit dari sesi-sesi sebelumnya **sudah tayang**; yang tertinggal **hanya commit sesi ini** (#31 gate rollback + koreksi dokumen). Baris ini sebelumnya menulis "remote `47c4440`, ahead 23" dan mendaftar 10 commit sebagai belum naik — **semuanya sudah di-push sejak itu**; jangan percaya angka lama, jalankan perintahnya) | `git ls-remote newrepo refs/heads/main` (SHA remote) lalu `git rev-list --count HEAD --not <SHA>` (yang belum naik) — **bukan** `newrepo/main..main`, ref itu tidak ada | Aturan owner: **jangan push tanpa izin**. Push ke `main` = auto-build + deploy produksi |

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
| **3** | 🟢 **PRASYARAT SUDAH TERPENUHI — `HEALTH_TOKEN` sudah ada & live.** Diverifikasi ulang 2026-09-13 lewat probe produksi, **memakai jalur yang benar**. Liveness: `GET /.netlify/functions/health` → `{"status":"ok","timestamp":…,"detail":"gated"}` ⇒ `HEALTH_TOKEN` **terpasang** (kalau kosong nilainya `"unconfigured"`). Tanpa token: `?detail=1` → **401** `missing or invalid token` (bukan `HEALTH_TOKEN not configured`) ⇒ fail-closed bekerja. Dengan token asli: **200** + laporan penuh — `status:"degraded"`, `reasons:["PostgREST reachable but slow: 867ms"]`, `shared.postgrest{state:"closed",failures:0,reachable:true,latencyMs:867}`, `shared.jobQueue{depth:0,dead:0}`. Bukti kedua & independen: daftar env var site memuat `HEALTH_TOKEN`. **Dua koreksi:** (a) klaim lama "`HEALTH_TOKEN` harus ada di site" **SALAH** — sudah ada sejak lama; (b) **`/health` tanpa prefix itu 404** — `netlify.toml` tidak punya redirect untuknya, jadi §3.2 yang menulis `GET /health` menunjuk path yang tidak ada, dan 404 di situ adalah **gejala deploy rusak**, bukan alamat normal. Jalur kanoniknya `/.netlify/functions/health`; sudah dikoreksi di `PHASE_C_OBSERVABILITY.md` §3.2/§6/§8 dan `PHASE_C_SINK_SETUP.md`. | `docs/PHASE_C_OBSERVABILITY.md` §3.2, §6 | **Sisa SATU-satunya: tidak ada tujuan metrik yang dikonfigurasi.** Terverifikasi 2026-09-13: `METRICS_SINK_URL` **dan** pasangan Grafana **absen dari seluruh 22 env var site**, jadi sink = no-op by design dan langkah "sink menyala ≤2 menit" tak bisa lulus. **Kode-nya sudah siap untuk keduanya** — sink kustom (sudah lama) dan exporter OTLP Grafana (baru, `_lib/otlp.ts`, ter-test + termutasi). Artinya **#3 bukan "tak bisa lokal"** dan bukan lagi "belum ada jalan": langkah 3–4 §6 sudah terbukti hidup terhadap produksi; langkah 2 tinggal menunggu owner men-set **salah satu** tujuan (`METRICS_SINK_URL`, atau `GRAFANA_CLOUD_OTLP_ENDPOINT` + `GRAFANA_CLOUD_BASIC_AUTH_HEADER`) lalu redeploy |
| **4** | 🟠 **Phase E item 20 — load test 10× peak.** Tidak dijalankan, dan sengaja: terhadap produksi itu persis insiden yang Phase B dibangun untuk dibatasi; terhadap localhost angkanya tidak berarti (tanpa CDN, tanpa isolasi function, tanpa pooler, tanpa RTT ke `ap-southeast-1` — padahal RTT = 99,7 % latency sistem ini) | `docs/PHASE_E_DEGRADATION_MATRIX.md` §4 | **Staging deployment + Supabase project terpisah.** `deploy-staging.yml` sudah ada; project-nya belum |
| **5** | 🟠 **Phase E item 22 — pooler failover drill.** Supavisor shared pooler tidak punya failover yang bisa dipicu operator; drill terdekat = arahkan staging ke koneksi langsung `:5432` dan buktikan sistem **degradasi**, bukan rusak | `docs/PHASE_E_DEGRADATION_MATRIX.md` §4 | Staging yang sama dengan #4 |
| **6** | 🟠 **Phase B §7.2 — kalibrasi in-flight cap (24/4/3) di bawah beban nyata.** Nilainya masih tebakan; sengaja env-overridable untuk alasan ini | `docs/PHASE_B_LOAD_BOUNDING.md` §7.2 | Staging yang sama dengan #4 |
| **7** | 🔴 **Alert §7.2 + mulai melacak error budget §7.3.** Empat sinyal (latency/traffic/errors/saturation) dan tiga SLO sudah **ditulis**, belum **dikonfigurasi** di tool apa pun. `docs/PHASE_C_SINK_SETUP.md` adalah panduan dari nol. **Kemajuan 2026-09-13: jalur transportnya sudah ada** — exporter OTLP ke Grafana Cloud (`_lib/otlp.ts`, `GRAFANA_CLOUD_OTLP_ENDPOINT` + `GRAFANA_CLOUD_BASIC_AUTH_HEADER`, lihat `PHASE_C_SINK_SETUP.md` §2b) sudah diimplementasi & ter-test, jadi yang tersisa **bukan kode**: set dua env var itu, lalu tulis A1–A7 sebagai alert rule di Grafana. Sebelum ini tidak ada backend yang bisa menyimpan window, jadi A1–A7 mustahil menyala | `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §7.2–7.3, `docs/PHASE_C_SINK_SETUP.md` §2b | **Owner-side**: set 2 env var + buat rule di Grafana. Tidak ada pekerjaan kode yang tersisa di sini |

---

## 3. Backend hidup, tapi tidak ada yang memanggilnya

Kelas ini yang paling licin: handler-nya benar, ter-guard, ter-test — dan tidak pernah jalan.

| # | Item | Bukti | Blokir |
|---|---|---|---|
| **8** | ✅ **SELESAI 2026-09-13 — reminder agenda sekarang menyala.** Pemicunya adalah cron baru `netlify/functions/agenda-reminders.ts` (`export const config = { schedule: '*/10 * * * *' }`), yang memanggil konteks `handleCheckAndSendAgendaReminders(undefined, { internal: true })` — langsung, bukan lewat surface, karena fungsi terjadwal tidak punya sesi dan surface-nya admin-guarded (`requireRole` akan membalas `{ sessionInvalid:true }`: cron terlihat hijau sambil mengirim nol). Pola `internal: true` sama dengan `wa.send`/`wa.broadcast` di `sweep-queue`. Interval 10 menit dipilih karena harus **lebih sempit dari window terlebar** (h0 = 60 menit) atau sebuah jadwal bisa masuk dan keluar window di antara dua run. Surface HTTP tidak berubah ⇒ bypass tetap tidak terjangkau dari luar. Diverifikasi: zisi melaporkan `schedule: */10 * * * *`, `runtimeAPIVersion: 2`, 0 fungsi mode kompat | `netlify/functions/agenda-reminders.ts`, `contexts/scheduling/service.ts:176`, test `contexts/scheduling/service-reminder-cron.test.ts` (8 tes) | **Tidak ada.** Catatan asal-usul: entri legacy yang dihapus 2026-09-11 bernama `schedule-reminders` — jadi fiturnya memang tidak pernah punya rumah |
| **9** | ✅ **SELESAI 2026-09-13 — defer P3 alih-alih shed, tapi HANYA yang punya worker.** `deferralJobTypeFor()` di `kernel/admission.ts`; jalur shed di `_lib/handlers.ts` kini meng-enqueue (202 + jobId) alih-alih 503. **Perangkap yang ditemukan:** job tanpa worker duduk `pending` **selamanya** — pemanggil diberi tahu "accepted", kerjaannya tidak pernah jalan, tidak ada error. `sweep-queue.ts` hanya punya **3** tipe job (`wa.broadcast`, `wa.send`, `ai.interview`), jadi hanya aksi yang punya salah satunya yang boleh di-defer. `kirimSatuPesanFonnte`→`wa.send` ✅; `kirimTawaranMassal` sudah enqueue di surface (tak pernah sampai jalur shed); `generateWawancaraModel` punya worker tapi **interaktif** (admin menunggu dokumen) ⇒ sengaja **tidak** di-defer; 9 aksi P3 lain **tanpa worker** ⇒ 503 tetap jawaban jujur. Gagal enqueue ⇒ jatuh ke 503 (jangan pernah bilang "accepted" kalau tidak masuk antrean). Test 7 (+ guard anti-parse-kosong); **diverifikasi mutasi** | `kernel/admission.ts` (`DEFERRABLE`), `_lib/handlers.ts:136-165`, `admission.test.ts`, `docs/PHASE_B_LOAD_BOUNDING.md` §5.1 | **Tidak ada.** Yang tersisa = menambah worker bagi 9 aksi P3 (pekerjaan terpisah, bukan penghalang) |
| **31** | ✅ **SELESAI 2026-09-13 — gate rollback sekarang memeriksa health.** (Temuan 2026-09-13 sore, diperbaiki sore yang sama.) `scripts/ci/smoke-test.mjs` punya cabang probe health yang hanya menyala dengan flag `--health`, dan **tidak satu pun workflow pernah mengirimnya** ⇒ gate yang memutuskan rollback otomatis hanya memeriksa **satu string di landing page** — dan landing page ini **statis/prerender** (`dist/index.html` memuat string itu di markup), jadi deploy yang merusak lapisan data **tetap lolos**. Sekarang `--health "/.netlify/functions/health?detail=1"` dikirim oleh **`deploy-production.yml`**, **`deploy-staging.yml`**, dan **`rollback.yml`**. **Agar tidak memerahkan gate karena alasan yang salah** (probe tanpa token memang balas `503`/`401` di site tanpa `HEALTH_TOKEN` — fail-closed by design), keputusannya dipindah ke fungsi murni `classifyHealth()` dengan aturan eksplisit: `200/204` → **PASS**; `503 HEALTH_TOKEN not configured` → **WARN**; `401` (dengan atau tanpa token, = credential drift) → **WARN**; **non-2xx lain (`500/502/503/504/…`) → FAIL** (memicu rollback). Warn hanya menggagalkan pipeline kalau **exit code**-nya 1 — `PASSED WITH WARNINGS` tetap exit 0. Token dikirim lewat **environment** (`HEALTH_TOKEN: ${{ secrets.HEALTH_TOKEN }}`), bukan argv (argv terlihat di `ps` dan tercetak ke log workflow). `ci.yml` **sengaja tidak** diberi `--health`: ia menyajikan artifact dengan `astro preview` tanpa runtime fungsi, jadi probe-nya akan 404 terhadap build yang sehat. Diverifikasi: 20 tes (`_lib/smoke-test-health.test.ts`), **7 mutasi → semuanya memerahkan suite** (1/3/1/3/2/1/1), file byte-identical saat direstore; dan jalur asli dijalankan ke produksi — tanpa token → `PASSED WITH WARNINGS` exit 0, dengan token → `2/2 PASSED` (`status: degraded`, PostgREST 841ms) | `scripts/ci/smoke-test.mjs` (`classifyHealth`/`healthHeaders`/`checkUrl`), `netlify/functions/_lib/smoke-test-health.test.ts`, `.github/workflows/deploy-production.yml` · `deploy-staging.yml` · `rollback.yml`, `docs/CICD.md` §3.6 | **Tidak ada.** Owner: set secret `HEALTH_TOKEN` di GitHub Environment `production` (nilai **sama** dengan env site Netlify) kalau ingin verdict penuh, bukan warning |

---

## 4. Paritas legacy / fitur yang belum dibangun

| # | Item | Bukti | Blokir |
|---|---|---|---|
| **10** | ✅ **SELESAI 2026-09-13 — C05 diaudit 1:1 vs legacy.** **Bug nyata ditemukan & diperbaiki:** guard ekstensi (`cekEkstensiFile`) legacy **tidak pernah diport** — modal hanya cek ukuran, sehingga file bertipe salah ter-upload, ter-persist, dan ber-toast sukses (dokumen kandidat tak terpakai di ujung lain). Kini `rejectExtension()` dipanggil per-input sebelum cek ukuran, dengan `ui.toast_file_ext_bad`/`ui.toast_file_too_big` (keduanya sebelumnya **tidak ada** di dict — pesan ukuran lama di-hardcode Indonesia). Ditambah `berkasCatalog.test.ts` (20 test) yang **mengimpor dua sisi secara live** dan mengunci kontrak `jenis` ↔ `FILE_LABEL_COLUMNS`. Sisa paritas sudah benar (18 dokumen, regex T1/T2, prefill bio, konfirmasi timpa) | `e37647c`, `src/lib/berkasCatalog.test.ts`, `docs/PARITY_CHECKLIST.md` (C05 ✅) | **Tidak ada.** Baris paritas C05 kini ✅ — tak ada lagi yang 🔄 |
| **11** | ✅ **SELESAI 2026-09-13.** Modul baru `src/lib/candidateExport.ts` = **satu sumber kebenaran kolom**; `EXPORT_COLUMNS` dipakai CSV **dan** Excel sehingga keduanya tak bisa menyimpang. Legacy 11 kolom, CSV lama hanya 7 ⇒ ternyata **dua** celah (Excel belum ada *dan* CSV belum parity). Akar "email/`tanggalDaftar` hilang": backend **sudah** mengirim (`_lib/db/candidates.ts:57,82,83`) tapi interface `Kandidat` di `src/store/adminStore.ts` tidak mendeklarasikannya ⇒ dibuang di klien. **Tanpa perubahan backend.** `xlsx` diimpor **dinamis** ⇒ chunk terpisah `dist/_astro/xlsx.*.js` (429 KB) dan **tidak** di-precache (SW sudah mengecualikan `xlsx.*`). 30 tes baru; tes Excel **round-trip** (`XLSX.read` balik) + magic bytes PK | `0b46c22`, `src/lib/candidateExport.ts`, `src/lib/candidateExport.test.ts` | **Tidak ada** |
| **12** | ✅ **SELESAI 2026-09-13.** `src/components/admin/RejectMailModal.tsx` + 5 key i18n (dua dict, wording legacy persis). Sebelumnya tolak lamaran pakai `window.confirm` dengan alasan **hardcoded** `'Lamaran GAGAL'`, padahal backend **sudah** menerima alasan sebagai argumen ke-3 (`contexts/applications/service.ts:194-198`) dan UI legacy menjanjikan teks itu muncul di Dashboard Kandidat — jadi kandidat tak pernah melihat alasan aslinya. Argumen ke-2 legacy = **nama admin**; di repo baru posisi itu `sessionToken`, jadi identitas diambil server dari sesi (lebih benar, klien tak bisa memalsukan). **Bug di kode sendiri ketemu tes:** `try/finally` tanpa `catch` ⇒ `onConfirm` yang reject jadi *unhandled promise rejection*; ditambah `catch {}` | `d927cce`, `src/components/admin/RejectMailModal.tsx` | **Tidak ada** |
| **13** | ✅ **BUKAN GAP — sengaja tidak dibangun** (diputuskan 2026-09-13). Legacy `js/admin_ops/migration.ts` ternyata **database migration runner**, bukan "Drive": ia memanggil `callAPI('runMigration', {})` dari POST body. Action itu **dihapus dengan sengaja** di repo baru (`surfaces/config.ts:10` — *"schema changes must never be reachable from a POST body"*). Penggantinya **`scripts/migrate.mjs`** (ledger berversi + checksum, dijalankan dari CLI). Menambahkan kembali modal ini = **mengembalikan lubang keamanan**. Sisa 2 key i18n (`admin.db_migration_auto`, `admin.run_migration`) hanya teks tanpa UI | `docs/LEGACY_PARITY_REFERENCE.md:65` | **Tidak ada** — jangan dibangun |
| **14** | ✅ **SELESAI — TabConfig bukan read-only lagi.** Ia sudah memanggil `api.secure('updateSysConfig', …)` **dua kali** (`TabConfig.tsx:44` untuk options per-config-id, `:51` untuk pengumuman) dengan tombol simpan (`:80`, `:100`) + toast `toast_config_saved`/`toast_announcement_saved`. Ia juga **sudah** memakai `api.secure`, bukan `fetch` mentah. Klaim lama ("105 baris, hanya `getAppData`, tidak ada aksi simpan") **tidak lagi benar** | `src/components/admin/TabConfig.tsx:34,44,51,80,100` | **Tidak ada.** Yang mungkin masih kurang hanyalah kelengkapan *field* settings (Fonnte token, AI model) — tapi mekanisme simpannya sudah ada; jangan bangun ulang |
| **15** | ✅ **SELESAI 2026-09-13.** UI-nya **sudah ada tapi mati**: `TabMail` merender checkbox + `selected` Set, tapi **tidak ada yang memakai** `selected` ⇒ tak ada tombol (kelas "lubang tak terlihat"). Backend baru **`hapusFormTerpilih`** di `contexts/applications/service.ts:220`, ter-wire lewat `surfaces/mail.ts:11` → `registry.ts:59` → `_lib/handlers.ts:269` → `apiEndpoint.ts:37` → `TabMail.tsx:98`. Legacy memanggil `deleteForm` per baris dari klien dengan **rowIndex** ⇒ (a) N round-trip, (b) **index bergeser**: hapus [2,3] menghapus baris 2 & 4, satu pilihan lolos, **tanpa error**; handler menyelesaikan **semua index→id dulu**. Bug yang ditemukan tes sendiri: `Number(null)===0` & `Number('')===0` ⇒ `null` di daftar pilihan diam-diam = "hapus baris 0"; filter diperketat. Batas `MAX_BULK_DELETE = 100` | `3fdaac4`, `netlify/functions/contexts/applications/service.ts:220`, `src/components/admin/TabMail.tsx:98` | **Tidak ada** |
| **16** | 🟡 **Realtime.** Tidak ada subscription Supabase realtime di `src/` sama sekali | `grep -rn "realtime·channel(" src/` → kosong | Belum dibangun. **Keputusan produk** — lihat §8 |
| **17** | 🟡 **Email notification.** Tidak ada modul email apa pun (tidak ada nodemailer/sendgrid/resend/smtp) | `grep -rln "nodemailer·sendgrid·resend·smtp" netlify src` → kosong | Belum dibangun. **Keputusan produk dulu** — WA sudah kanal utama; jangan dikerjakan sebelum owner memutuskan email masih dibutuhkan |
| **18** | ✅ **SELESAI 2026-09-13 — audit PWA offline, dan menemukan bug nyata.** Fallback navigasi offline SW = `cache.match(url.pathname)`, tapi manifest hanya menyimpan `/apply/index.html` sementara app menaut ke **`/apply`** (tanpa slash) dan Netlify menyajikan `/apply/` ⇒ **keduanya MISS** ⇒ dilayani `/index.html` = **landing page**. Offline, klik "AI CV"/"Master Form" mendarat di homepage tanpa penjelasan padahal HTML-nya ada di cache. `dirRoutes` di `scripts/build-sw-manifest.mjs:96-103` ikut mem-precache **bentuk `/x/` dan `/x`** + ikut content hash; precache **63 → 76** URL. `src/lib/swOffline.test.ts` menguji **`dist/sw.js`** (artefak yang benar-benar dilayani), bukan source, dan skip sendiri kalau `dist/` tidak ada | `25fe9c5`, `scripts/build-sw-manifest.mjs:96-103`, `src/lib/swOffline.test.ts` | **Tidak ada** |
| **19** | ✅ **SELESAI — TabJadwal & TabMail sudah memakai `api.secure`.** Klaim lama ("`getEndpoint(...)` + `sessionToken` manual, melewati penanganan sesi-invalid") **tidak lagi benar**: `grep -c getEndpoint` = **0** di kedua file. `TabJadwal` → `api.secure('getAppData'/'simpanJadwalBaru'/'hapusJadwal')`; `TabMail` → `api.secure(action, [id])` lewat helper `act()`. Pola B02 sudah tersebar | `src/components/admin/TabJadwal.tsx:6,27,37`, `src/components/admin/TabMail.tsx:15,53` | **Tidak ada** |

---

## 5. Doc hygiene — dokumen yang sekarang bertentangan dengan kode

Bukan kosmetik: repo ini sudah dua kali kena kelas bug "dokumen menjanjikan perilaku yang tidak ada"
(`ai_unavailable`, dan sebelum itu 4 dari 7 baris matriks degradasi). Menjaga daftar ini bersih adalah
bagian dari pekerjaan, bukan hiasan.

**Konvensi sel (penting kalau Anda menyunting tabel di file ini):** sel tabel **tidak boleh** memuat
tanda pipe mentah — satu `|` ekstra menambah kolom secara diam-diam dan barisnya pecah tanpa error.
Untuk perintah `grep` berlatar `\|` (alternasi BRE), tulis pemisah alternasi sebagai `·`, **jangan**
`\|`: di dalam *inline code span* Markdown, backslash **tidak** di-escape, jadi `\|` tampil apa adanya
sebagai garis miring terbalik di layar. Aturan ini muncul karena baris #26 di bawah dulu ditulis
dengan sel bukti terpisah padahal tabelnya cuma 2 kolom.

| # | Status & masalah |
|---|---|
| **20** | ✅ **SELESAI 2026-09-13.** `docs/PARITY_CHECKLIST.md` B06 + C06 — B06 mencatat "gate token DIBATALKAN"; C06 kini bertanda `♻️ 2026-09-13 (gate token dibatalkan)`, tidak lagi mengklaim token per-job aktif |
| **21** | ✅ **SELESAI.** `PARITY_QA_2026-09-04.md` sudah dipindah ke **`docs/archive/`** (terverifikasi ada di `ls docs/archive/`); checklist menandainya historis, bukan daftar kerja |
| **22** | ✅ **SELESAI.** `docs/LEGACY_PARITY_REFERENCE.md` baris Mail (`:37`) & Jadwal (`:38`) **sudah ✅** dengan catatan koreksi bertanggal 2026-09-13 ("Wiring sudah ada — lihat #22 di `BACKEND_TODO.md`") |
| **23** | ✅ **SELESAI.** `TODO.md` **sudah dirapikan 2026-09-13** — dibuka dengan "Pekerjaan BACKEND ada di satu tempat: `docs/BACKEND_TODO.md`"; klaim "~80 % fitur / ~15 fitur hilang" sudah dihapus |
| **24** | ✅ **SELESAI 2026-09-13.** `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md` §11 butir 5 **dan** tabel S5 (`:38`) dikoreksi. Baris S5 bertahan berhari-hari sebagai "Remaining — gated on deploy verification" **setelah** pekerjaannya selesai — langkah *verifikasi deploy* dikira sama dengan *pekerjaannya*. Bukti: `node scripts/ci/verify-function-entries.mjs --list` → 22 entri, semua mengekspor handler, **"no Lambda-compat entries"** |
| **25** | ✅ **SELESAI 2026-09-13.** Header `docs/HANDOFF_4KB_ENV_LIMIT.md` diubah dari "terdiagnosis, belum diperbaiki" → **"SELESAI — keluar dari Lambda compatibility mode"** (deploy `6aa57207` ready, 0 fungsi mode kompat) |
| **26** | 🟡 **SEBAGIAN BESAR SUDAH SELESAI — sisanya cuma revoke token (keputusan owner).** *(Diverifikasi ulang 2026-09-13 malam.)* (a) **revoke `ghp_qzq70Qy…`** — **masih terbuka**: kebocoran token ke-3 di proyek ini, dan **saya tidak bisa mengerjakannya** (hanya Anda yang punya akses GitHub; nilainya pun tidak tersimpan utuh di repo, hanya prefiks terpotong, jadi saya juga tidak bisa mengujinya). Kerjakan di GitHub → Settings → Developer settings → Tokens. (b) ~~`origin` menunjuk repo lama~~ — **SUDAH TIDAK TERJADI**: `git remote -v` kini **hanya menampilkan `newrepo`** (`asjosdokumen-alt/asj-astro`); `origin` sudah dihapus. (c) ~~branch `dev` tertinggal 14 commit~~ — **SUDAH TIDAK ADA**: `git branch -a` hanya `main`. **Jadi sisa #26 = satu tindakan owner, nol pekerjaan kode.** *Bukti (dipindah dari kolom lama agar tabel ini tetap 2 kolom — versi sebelumnya menuliskan `git remote -v`, `git branch -a`, dan `grep -o "ghp_…"` di baris yang sama sehingga terbaca sebagai baris 5 kolom, bukan 2):* `git remote -v` → hanya `newrepo` · `git branch -a` → hanya `main` · `grep -o "ghp_[A-Za-z0-9]\{6\}" HANDOFF.md` → prefiks saja. **Owner**: revoke token di GitHub. Tidak butuh build Netlify |

---

## 6. Owner-side / infra (bukan kode)

| # | Item | Kenapa |
|---|---|---|
| **27** | ✅ **SELESAI 2026-09-13.** `HEALTH_TOKEN` terpasang; **kedua env var Grafana sudah di-set** di site astro (terverifikasi lewat API: 24 env var, scope `builds,functions,post_processing,runtime`), dan **kredensialnya diuji langsung ke gateway → HTTP 200** (nol build-minute). Exporter-nya juga sudah tayang | **Sisa dua hal kecil, keduanya owner-side:** (a) ⚠️ `GRAFANA_CLOUD_BASIC_AUTH_HEADER` tersimpan **TIDAK sebagai secret** (API mengembalikan nilainya utuh) — sebaiknya di-set ulang `--secret`; (b) tulis A1–A7 sebagai alert rule (itu #7) |
| **28** | Rotasi `SESSION_SECRET` bila sudah dipakai di produksi | Dari `TODO.md`; **belum pernah dikonfirmasi**. Kode tidak punya fallback ke password admin (S3 fix), jadi nilainya kritis |
| **29** | Ukur cold start function vs target < 3 s | Belum pernah diukur; tidak ada gate-nya |
| **30** | Revoke `ghp_qzq70Qy…` (**satu-satunya sisa**; `origin` & `dev` sudah dibereskan — lihat #26) | Kebocoran token ke-3 lewat chat di proyek ini (`HANDOFF.md`). Hanya owner yang bisa — nilainya tidak ada utuh di repo |

---

## 7. Sudah selesai — jangan dikerjakan ulang

Diringkas supaya daftar di atas tidak diragukan lagi.

- **Phase A** — 11 catch-all dihapus, 2.364,3 KB / 17 entri, `verify:aliases` jadi gate offline.
- **Phase B** — priority class P0–P3 + shedding, deadline 12 s, `migration 011` (`statement_timeout` 3 s,
  live), ratchet punya absolute floor 8 KB, `contexts/documents/download.ts` tidak lagi bisa menggantung
  2.000 s.
- **Phase C** — endpoint `/.netlify/functions/health`, `contexts/diagnostics`, sink kontrak, runbook A1–A7, SLO §7.3
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
- **Paritas #10–#15 & #18 (2026-09-13 malam)** — #10 guard ekstensi (`e37647c`), #11 Excel export
  (`0b46c22`), #12 reject composer (`d927cce`), #15 bulk delete (`3fdaac4`), #18 PWA offline
  (`25fe9c5`), #9 defer P3 (`70a648e`). **Tiga di antaranya bug nyata**, bukan gap dokumen.
- **#13 (2026-09-13)** — diputuskan **bukan gap**: legacy-nya *database migration runner* dari POST
  body, sengaja dihapus; penggantinya `scripts/migrate.mjs`. Jangan dibangun ulang.
- **#3 & #27 (probe produksi 2026-09-13)** — `HEALTH_TOKEN` terbukti sudah terpasang; `/health`
  tanpa prefix terbukti **404** (jalur kanonik `/.netlify/functions/health`).
- **Exporter OTLP ke Grafana Cloud (2026-09-13 malam)** — `netlify/functions/_lib/otlp.ts` (murni,
  tanpa I/O) + fan-out di `_lib/metrics-sink.ts`. Dua tujuan independen, keduanya opsional. 26 test;
  **diverifikasi mutasi** (5 mutasi → 1/9/1/1/1 tes gagal). Cardinality guard berupa **allow-list**
  label, bukan deny-list. Satu `fetch` call site tetap dipertahankan ⇒ `verify:io` allow-list tidak
  bertambah. **Temuan penting saat pre-flight: gateway Grafana MENOLAK `sum` DELTA dengan HTTP 400**
  ("invalid temporality and type combination") — probed keempat kombinasi temporality×monotonic, hanya
  CUMULATIVE dan gauge diterima. Karena counter kita per-invoke dan tak bisa kumulatif (instance
  efemeral), dan kumulatif-dengan-reset **under-count** saat instance berselang-seling
  (3,1,5,2,4 → 9, bukan 15), semua count dikirim sebagai **gauge** dan di-query dengan
  `sum_over_time()`, **bukan `rate()`**. Bug ini sempat lolos karena smoke test awal cuma memakai gauge
  — pelajarannya: uji **body yang benar-benar dihasilkan**, bukan yang nyaman.
- **Outage navigasi SW (2026-09-13 malam) — DIPERBAIKI.** Site live **tidak bisa dinavigasi** oleh
  siapa pun yang punya service worker: `/admin`, `/candidate`, `/public`, `/apply` semua mati dengan
  `net::ERR_FAILED`, sementara kembaran ber-trailing-slash-nya (`/admin/`) normal. Penyebabnya: Netlify
  **301** setiap rute direktori telanjang ke bentuk ber-slash, dan handler navigasi SW mengembalikan
  respons **hasil-ikut-redirect** ke request navigasi — Chromium menolaknya sebelum satu byte HTML pun
  di-parse. Dikonfirmasi dengan menyajikan handler lama untuk `/sw.js` di situs produksi: rute telanjang
  gagal, rute ber-slash jalan. Fix: bangun ulang respons agar flag `redirected` hilang. Ditambah 5 tes
  (4 di antaranya **memerahkan suite** saat handler lama dipasang kembali). Catatan: `public/sw.js`
  **tidak** diubah oleh 26 commit sebelumnya — bug ini sudah ada di handler, dan baru terasa ketika
  versi SW berganti sehingga worker mengambil alih tiap tab.
- **Matriks degradasi §6.5** — 4/7 baris bertahan (dari 2/7); sisa divergensi: Fonnte (enqueue jalan,
  status bukan 202), Storage (retry client-side), Pooler (shed tanpa antre).

---

## 8. Urutan yang saya sarankan

> **Ditinjau 2026-09-13 (setelah audit ulang).** Urutan lama membuka dengan "putuskan migrasi 013" —
> **basi**, #1 sudah ditutup (gate-nya dihapus, bukan dimigrasi). Dan #20–#23 sudah dikerjakan.

1. ~~**#1** — putuskan migrasi 013.~~ **✅ ditutup** — tidak ada blocker migrasi.
2. ~~**#20–#23** — koreksi empat dokumen yang berbohong.~~ **✅ selesai 2026-09-13**, bersama #24 dan #25.
   Sisa doc-hygiene **hanya #26**, dan **sudah menyusut jadi satu tindakan owner**: revoke token.
   `origin` **sudah tidak ada** (`git remote -v` → hanya `newrepo`) dan branch `dev` **sudah tidak ada**
   (`git branch -a` → hanya `main`) — dua klaim di baris lama itu sudah usang.
3. **#8 — ✅ selesai 2026-09-13.** Cron `agenda-reminders` (10 menit) + bypass `internal: true` pada
   konteks. Pemicunya sudah ada; yang tersisa hanya data (`database_schedule` masih 0 baris, jadi
   cron-nya benar-benar mengirim nol sampai ada jadwal dibuat — itu perilaku yang diharapkan).
4. **#2 — push `main`.** **Diukur ulang:** yang tertinggal **hanya commit sesi ini** (#31 gate rollback +
   koreksi dokumen) — seluruh perbaikan sesi sebelumnya **sudah tayang** (`1adb960`). Push = auto-build + deploy.
   **Butuh izin owner.**
5. ~~**#11 Export Excel → #15 Bulk operations → #12/#13/#18**~~ **✅ SEMUA SELESAI 2026-09-13 malam**
   (#10, #11, #12, #15, #18, #9). Dikerjakan & diverifikasi 100% lokal, **nol token Netlify**.
6. **#3 + #27 + #7** — jalankan gate Phase C. `HEALTH_TOKEN` **sudah ada** dan langkah 3–4 §6 sudah
   terbukti hidup terhadap produksi. **Transport metriknya juga sudah ada** (exporter OTLP Grafana,
   2026-09-13). Yang tersisa **hanya 2 env var + buat rule A1–A7 di Grafana** — nol pekerjaan kode.
   **#31 sudah selesai** (gate rollback kini memeriksa health); sisa owner-nya cuma set secret
   `HEALTH_TOKEN` di GitHub Environment `production`.
7. **#4–#6** — staging. Ini yang membuka tiga item sekaligus (20, 22, kalibrasi cap). Infrastruktur.
8. ~~**#9** — defer P3 ke `job_queue`.~~ **✅ selesai 2026-09-13 (`70a648e`)** — hanya aksi yang punya
   worker yang boleh di-defer; 9 aksi P3 tanpa worker tetap 503 (jawaban jujur).
9. **#16/#17** — realtime & email. **Keduanya keputusan produk dulu** (WA sudah kanal utama). Ini
   satu-satunya kelas yang masih benar-benar 🟡 dan tidak butuh infra maupun izin push.
10. **#28–#30** — owner-side: rotasi `SESSION_SECRET`, ukur cold start, revoke token.
11. ~~**#31** — putuskan apakah gate rollback harus memeriksa health.~~ **✅ selesai 2026-09-13** —
    `--health` sekarang dikirim oleh deploy produksi/staging/rollback; keputusan PASS/WARN/FAIL ada di
    `classifyHealth()` yang ter-test + termutasi, sehingga probe yang tidak bisa mengautentikasi
    **tidak** memicu rollback. Sisa satu langkah owner: set secret `HEALTH_TOKEN` di GitHub Environment
    `production` (nilainya harus sama dengan env site Netlify) supaya verdict-nya penuh, bukan warning.
