# Runbook: memindahkan sweep antrean keluar dari Neon

Status: **kode selesai, mode default `off`.** Belum ada yang berubah di produksi
sampai langkah 4 dijalankan. Desain & alasannya: `docs/RENCANA_ANTREAN_TANPA_NEON.md`.

Ringkas: `job_queue` tetap ledger di Neon. Yang ditambahkan hanya **gerbang** di
Upstash Redis berisi satu angka (`asj:job:next` = kapan antrean perlu dilihat
lagi). Sweep kosong = 2–3 perintah Redis, **nol request Neon**.

---

## 0. Provisioning (tanpa deploy, tanpa kode)

| Hal | Nilai | Kenapa |
|---|---|---|
| Region Upstash | **sama dengan region Netlify Functions** — ukur dulu, jangan tebak `us-east-1` | RTT > 100 ms membuat setiap panggilan Redis menulis satu baris `dependency_calls` ke Neon — biaya yang justru ingin dihapus. **Diukur 2026-11-20: Neon ada di `ap-southeast-1`, jadi region DB bukan acuan.** Yang memanggil Redis adalah fungsi, bukan DB |
| Host Redis | harus berakhiran **`*.upstash.io`** | `detectDependency()` mengenali lewat substring itu; host lain jatuh ke label `other` dan memakai bulkhead bersama (insiden 2026-10-21) |
| Env | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | server-only, jangan pernah `PUBLIC_*` |
| Env | `JOB_SIGNAL_MODE=off` | kill switch; `off`/kosong/tak dikenal = perilaku hari ini |

Tidak ada kunci Redis yang dibuat manual — semuanya dibuat kode saat pertama
dibutuhkan.

### Baseline terukur (2026-11-20, sebelum gerbang menyala)

| Yang diukur | Nilai | Sumber |
|---|---|---|
| Target DB | `ep-bold-sunset-…-pooler.c-4.**ap-southeast-1**.aws.neon.tech` · `neondb` · role `neondb_owner` | `npm run migrate:status` |
| Ledger | 61 migrasi · 61 applied · 0 pending · 0 drifted | `npm run migrate:status` |
| `next_job_due()` | **NULL** (antrean kosong) | probe `SELECT next_job_due()` |
| Isi `job_queue` | **0 baris**, `dead` = 0 | probe `GROUP BY status` |
| Predikat `next_job_due` vs `claim_next_job` | **identik** (keduanya `true` pada uji substring ternormalisasi) | `pg_get_functiondef` |
| `verify:db` | `fn next_job_due required OK` · contract OK · 0 missing | `npm run verify:db` |
| `db:schema` | **SCHEMA UNCHANGED** · 35 tabel (RPC tidak masuk kontrak tabel) | `npm run db:schema` |

Arti baris ke-3 dan ke-4: gerbang akan langsung menulis sentinel setahun dan
setiap sweep berikutnya berhenti di `idle` — nol request Neon — sampai ada
`enqueue()` pertama. Antrean kosong bukan kasus tepi di repo ini; ia kondisi
normalnya.

## 1. Migrasi 061 — **sudah diterapkan** 2026-11-20T13:30:46Z

`npm run migrate:up` → `applied 061_next_job_due.sql (248 ms)`. Ledger kini
61/61, 0 pending, 0 drifted. Langkah di bawah disimpan untuk database lain
(staging, atau COMPUTE project di runbook split) — bukan lagi tugas yang
terbuka di produksi.

```
npm run migrate:up          # 061_next_job_due.sql
npm run db:schema           # schema.generated.ts
npm run verify:schema
npm run verify:db           # next_job_due harus PRESENT, bukan UNVERIFIED
```

`.ci/db-contract.json` menandai `next_job_due` sebagai **required**, jadi
`verify:db` akan **merah sampai migrasi ini diterapkan**. Itu memang urutannya:
migrasi dulu, kode kemudian. Risiko langkah ini nol — belum ada pemanggil.

## 2. Deploy kode dengan mode `off`

`JOB_SIGNAL_MODE` tidak diisi. Yang berubah hanya: `BUDGETS.redis`, label
`upstash`, tiga nama env, dan `sweepMetrics` yang kini punya parameter opsional.

Bukti `off` tidak berubah: `claimJob()` dan `cleanupIdempotencyKeys()` tetap
dipanggil tiap sweep, port gerbang **tidak dibuat sama sekali**, dan payload
metrik tetap empat field lama. Yang bertambah hanya dua field log
(`sweep.start{mode}`, `sweep.complete{mode,verdict,reconcile}`).

## 3. `shadow` selama 7 hari

Isi `JOB_SIGNAL_MODE=shadow`, deploy. Sweep **tetap menjalankan jalur hari ini
sepenuhnya**, lalu membaca gerbang dan mencatat apa yang *akan* dilakukannya.

| Yang dibaca | Sumber | Ambang lulus |
|---|---|---|
| `falseIdle` | log `sweep.signal.verdict` | **harus 0 sepanjang 7 hari** |
| `sweep.gate.unknown` | metrik | ≤ 1 % |
| `job.signal.announce-failed` | log | 0 |

Satu `falseIdle` = gerbang menyatakan `idle` padahal ada job ter-claim ⇒
predikat `next_job_due()` tidak sama dengan `claim_next_job()`. **Jangan
lanjutkan.** Wajib mencakup minimal satu `wa.broadcast` (satu-satunya tipe yang
berjalan beberapa menit dan menulis `payload.result`).

## 4. Aktifkan (`on`)

`JOB_SIGNAL_MODE=on`, deploy ulang commit yang sama. Tidak ada perubahan kode.

| Gate | Ambang | Cara baca |
|---|---|---|
| G1 `falseIdle` | 0 | log drain |
| G2 `sweep.gate.unknown` | ≤ 1 % | metrik (reconcile 4/96 = 4,17 % **tidak** lagi dihitung unknown) |
| G3 sweep kosong | 0 request Neon | grafik aktivitas project Neon |
| G4 wake Neon/hari | ≤ 5 | Neon Console → Monitoring |
| G5 respons sweep | `{processed, failed, cleaned, durationMs}` | invoke manual |

## 5. Persempit cron (opsional, setelah G1–G5 lulus)

Prasyarat: **p95 durasi `wa.broadcast` < 5 menit** (`locked_until`). Kalau tidak,
dua sweep bisa memproses dua broadcast bersamaan — benar secara kebenaran,
berisiko pada kuota Fonnte. Setelah itu `*/15` → `*/5` gratis dari sisi Neon
(288 invokasi/hari = 8.640/bulan, 7 % kuota Netlify 125.000).

**Jangan sentuh `agenda-reminders`.** `*/30` → `*/60` terlihat seperti hemat
15 CU-jam, tetapi berkas itu menyatakan sendiri bahwa sweep harus **lebih
sempit** dari jendela tersempit (h0 = 0–60 menit). `*/60` sama lebar: satu
percobaan, tanpa ulangan, dan satu run yang terlewat (deploy, cold start)
menghilangkan pengingat wawancara seorang siswa untuk selamanya.

## 6. Rollback

```
JOB_SIGNAL_MODE=off  →  redeploy  →  selesai (±2 menit)
```

Tidak ada data yang perlu dibatalkan: tidak ada baris yang dipindah,
`job_queue` tidak pernah berhenti menjadi ledger. Sisa satu kunci Redis yang
tidak dibaca siapa pun. Batas jujurnya: env Netlify tertanam saat deploy, jadi
"matikan" = ubah env + redeploy, bukan satu klik.

Satu DDL memang sudah diterapkan: `061_next_job_due.sql` (2026-11-20) membuat
fungsi `next_job_due()`. Fungsi itu **tidak perlu** di-drop untuk rollback —
dengan `JOB_SIGNAL_MODE=off` tidak ada pemanggilnya, dan membiarkannya tidak
mengubah perilaku apa pun. Bila tetap ingin dibersihkan, jalankan
`migrations/rollback/061_next_job_due.sql` **sesudah** kode lama tayang, lalu
ikuti dua langkah di dalam berkas itu (kontrak `.ci/db-contract.json` +
`db:schema`). Berkas 061 sendiri tidak boleh disunting: ledger menyimpan
checksum-nya.

## 7. Deploy — satu-satunya langkah yang belum dijalankan

Kode gerbang **belum ada di produksi**. Build yang hidup: `2026-11-18T11:06:36Z`
(`version.json`), yaitu `2fd0e243` = `origin/main`. Semua commit sesi ini ada di
atasnya, lokal.

```
npx netlify-cli deploy --build --prod
```

Prasyarat di mesin yang menjalankan perintah itu: `NETLIFY_AUTH_TOKEN` (atau
`netlify login`), dan `.netlify/state.json` sudah menunjuk site
`8e6e8ed4-9c59-4f35-8c62-39487da3f453`. **Tidak ada token di repo ini** — itu
sebabnya langkah ini tidak bisa dijalankan dari sesi desain.

Yang ikut terkirim: **seluruh commit lokal** di atas `origin/main` (ukur dengan
`git rev-list --count origin/main..HEAD`; **27** pada 2026-11-21), bukan hanya
fitur ini. Tiga di antaranya keamanan (`security(pii)`, `security(docs)`).
Pohonnya hijau: `tsc` 0 error, `lint-ratchet` PASS, `boundary` PASS,
`review:gate` PASS. Tetap keputusan pemilik, karena sebagian besar commit itu
bukan milik sesi ini.

Sesudah deploy, dua sweep pertama harus terbaca seperti ini:

| Sweep | `sweep.signal.verdict` |
|---|---|
| Pertama | `verdict:"unknown"`, `settled:true` — kunci dibangun lewat operand `null` |
| Kedua dan seterusnya | `verdict:"idle"`, `wouldSkip:true`, `falseIdle:false`, `settled:true` |

`falseIdle:true` satu kali saja ⇒ jangan nyalakan `on`.

---

## Yang BELUM diperbaiki (jangan dikira sudah)

| Temuan | Efek | Status |
|---|---|---|
| `claim_next_job()` tidak pernah menulis `status='dead'` (031 memfilter, bukan mempromosikan) | job habis percobaan berhenti di `'failed'`; `idx_job_queue_dead` mencocokkan 0 baris | bug lama, di luar lingkup |
| `reclaim_stuck_jobs()` tidak pernah dipanggil | job yang melewati `locked_until` tetap `'running'` selamanya | bug lama, prasyarat sebelum cron `*/5` |
| `completeJob()` menelan error-nya sendiri (`try/catch` di `job-queue.ts`) | Job yang **sudah sukses** tetapi PATCH-nya gagal tetap `running`; `claim_next_job()` tidak pernah mengambil baris `running`, dan `reclaim_stuck_jobs()` tidak pernah dipanggil ⇒ job hilang senyap. **Bukan** duplikat: `completeJob` tidak pernah melempar, jadi `failJob()` tidak bisa terpanggil untuk kerja yang sudah berhasil | bug lama (T9), perbaiki sebelum cron dipersempit |
| `runAfter` tidak punya pemanggil | semua job jatuh tempo seketika | bukan bug; gerbang tetap menanganinya |

## Berkas

| Berkas | Isi |
|---|---|
| `netlify/functions/_lib/kernel/job-signal.ts` | port gerbang + klien Upstash REST + 3 skrip Lua |
| `netlify/functions/_lib/kernel/job-signal.test.ts` | 34 tes (null object, verdict, CAS, eviction) |
| `netlify/functions/sweep-queue.signal.test.ts` | 24 tes (off/shadow/on, urutan panggilan, bentuk respons) |
| `migrations/061_next_job_due.sql` | fungsi SQL, predikat salinan `claim_next_job()` |
| `netlify/functions/sweep-queue.ts` | tiga mode + lease cleanup/reconcile |
| `netlify/functions/_lib/kernel/job-queue.ts` | `announce()` setelah INSERT, `nextDueAt()` |
| `netlify/functions/_lib/kernel/http.ts` | `BUDGETS.redis`, label `upstash`, skip log |
| `netlify/functions/_lib/kernel/resilience.ts` | breaker/bulkhead `upstash` |
| `netlify/functions/_lib/metrics-sink.ts` | `sweep.gate.*` opsional |
| `netlify/functions/_lib/env.ts`, `scripts/ci/verify-env.mjs`, `.env.example` | tiga env var |
| `.ci/db-contract.json` | `next_job_due` required |
