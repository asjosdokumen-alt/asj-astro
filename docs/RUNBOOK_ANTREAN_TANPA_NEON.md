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
| Region Upstash | **`us-east-1`** (sama dengan region Netlify Functions) | RTT > 100 ms membuat setiap panggilan Redis menulis satu baris `dependency_calls` ke Neon — biaya yang justru ingin dihapus |
| Host Redis | harus berakhiran **`*.upstash.io`** | `detectDependency()` mengenali lewat substring itu; host lain jatuh ke label `other` dan memakai bulkhead bersama (insiden 2026-10-21) |
| Env | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | server-only, jangan pernah `PUBLIC_*` |
| Env | `JOB_SIGNAL_MODE=off` | kill switch; `off`/kosong/tak dikenal = perilaku hari ini |

Tidak ada kunci Redis yang dibuat manual — semuanya dibuat kode saat pertama
dibutuhkan.

## 1. Terapkan migrasi 061 (sendirian, sebelum kode apa pun dipakai)

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

## 6. Rollback

```
JOB_SIGNAL_MODE=off  →  redeploy  →  selesai (±2 menit)
```

Tidak ada data yang perlu dibatalkan: tidak ada DDL yang di-undo, tidak ada baris
yang dipindah, `job_queue` tidak pernah berhenti menjadi ledger. Sisa satu kunci
Redis yang tidak dibaca siapa pun. Batas jujurnya: env Netlify tertanam saat
deploy, jadi "matikan" = ubah env + redeploy, bukan satu klik.

---

## Yang BELUM diperbaiki (jangan dikira sudah)

| Temuan | Efek | Status |
|---|---|---|
| `claim_next_job()` tidak pernah menulis `status='dead'` (031 memfilter, bukan mempromosikan) | job habis percobaan berhenti di `'failed'`; `idx_job_queue_dead` mencocokkan 0 baris | bug lama, di luar lingkup |
| `reclaim_stuck_jobs()` tidak pernah dipanggil | job yang melewati `locked_until` tetap `'running'` selamanya | bug lama, prasyarat sebelum cron `*/5` |
| `completeJob()` berada di `try` yang sama dengan `processJob()` | `completeJob` gagal ⇒ `failJob()` pada kerja yang sudah sukses ⇒ `attempts++` ⇒ klaim ulang segera ⇒ **WA terkirim dua kali** | bug lama, dipertahankan demi paritas `off`; perbaiki sebelum cron dipersempit |
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
