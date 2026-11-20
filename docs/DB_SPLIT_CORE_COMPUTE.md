# Keputusan Arsitektur: Memisahkan Database menjadi CORE + COMPUTE

Status: **desain, belum diimplementasi.** Tidak ada perubahan kode di dokumen ini.
Cakupan: satu database Postgres (Neon, diakses 100% lewat HTTP Data API) dipecah
menjadi dua **project** Neon, sehingga kehabisan kuota compute tidak pernah
berarti `pg_dump` data bisnis.

Basis pengukuran: repo `F:/astro` pada 2026-11. Angka call site diambil dari
brief (jumlah *call site*); `grep` jumlah kemunculan string sedikit lebih tinggi
dan urutannya sama.

---

## 0. Ringkasan keputusan

1. **Dua database dalam SATU project Neon tidak membeli satu CU-jam pun.** Satu
   project = satu compute = satu allowance. Itu hanya pengelompokan skema.
2. **Dua PROJECT Neon = 200 CU-jam**, tapi hanya sebesar beban yang benar-benar
   dipindahkan. Kalau COMPUTE menganggur, 100 CU-jam-nya menganggur.
3. **Penghematan terbesar bukan dari split.** Cron `*/15` menghabiskan
   **~61 CU-jam/bulan (61%)** untuk antrean kosong. Memindahkan cron keluar dari
   Neon lebih besar dari apa pun yang bisa diberikan split, dengan risiko ~0.
4. **Yang benar-benar dibeli split:** (a) project COMPUTE bisa **dibuang dan
   dibuat ulang tanpa `pg_dump`**, (b) COMPUTE yang suspend **tidak** mematikan
   login, revocation, atau baca data bisnis.
5. **(b) hanya benar kalau tabel non-disposable ada di CORE.** Itu keputusan
   *routing* (`DB_TARGETS`), bukan keputusan *project*.
6. **Yang benar-benar boleh hilang cuma 5 tabel.** Kalau 5 tabel itu cukup
   dipindah ke Cloudflare D1 / Upstash, sifat "tanpa `pg_dump`" didapat tanpa
   project Neon kedua sama sekali. Split tetap masuk akal, tapi sebagai
   **Fase 3**, setelah menara penghematan di §5.

---

## 1. Verdict: apakah split membeli kuota?

### 1.1 Aritmetika baseline cron

`netlify.toml` mencatat `sweep-queue.ts` = `*/15 * * * *` dan
`agenda-reminders.ts` = `*/30 * * * *`. Neon Free mematikan compute setelah
**5 menit** tidak ada aktivitas, dan itu tidak bisa dimatikan.

| Besaran | Hitungan | Hasil |
|---|---|---|
| Wake per hari (`*/15`) | 24 x 4 | 96 |
| Compute hidup per wake | idle timeout | 5 menit |
| Hidup per hari | 96 x 5 menit | 480 menit = **8,0 jam** |
| Hidup per bulan | 8,0 x 30,4 | **243 jam** |
| Compute size | asumsi minimum Free | 0,25 CU |
| **CU-jam per bulan** | 243 x 0,25 | **60,8 CU-jam** |
| Porsi allowance | 60,8 / 100 | **61%** |

`*/30` tidak menambah apa pun **selama** menitnya berimpit (`:00`, `:30` sudah
tercakup `*/15`). Kalau kedua cron bergeser beberapa menit, gabungannya jadi
~9,6 jam/hari = **73 CU-jam (73%)**. Jadi baseline-nya **61–73 CU-jam sebelum
satu manusia membuka aplikasi.**

**Sensitivitas:** 0,25 CU adalah ukuran minimum, dan audit 2026-11-18 memakainya
karena cocok dengan meter. Tapi Free mengizinkan autoscale sampai **2 CU**. Kalau
compute pernah naik ke 0,5 CU selama jam kerja, angka di tabel ini berlipat, dan
yang perlu dijelaskan bukan lagi cron melainkan trafik. Ini pertanyaan terukur,
bukan asumsi — §7.

**Angka ini bukan turunan — sudah terukur.** `deliverables/audit-limit-egress-compute-2026-11-18.md`
mencatat **110,13 CU-jam** terpakai dalam 17 hari pada jadwal lama
(`sweep-queue` `*/2` + `agenda-reminders` `*/10` = 720 run/hari), dan project
`ASTRO` **di-pause**. Audit yang sama menghitung `*/15` ≈ 33% duty cycle ≈
**60 CU-jam/bulan** — berimpit dengan 60,8 di tabel atas. Jadi jadwal sekarang
memang sudah memotong ~45%, tapi **masih menghabiskan ~61% allowance untuk
antrean yang sebagian besar kosong.**

Cron ketiga, `retensi-notif.ts` (`0 3 1 * *`, sekali sebulan), tidak relevan
secara kuota tapi harus ada di daftar — kalau tidak, ia akan muncul sebagai wake
yang tidak dijelaskan saat orang membandingkan grafik dengan dokumen ini.

### 1.2 Tiga konfigurasi, tiga hasil berbeda

| Konfigurasi | Compute | Allowance | Kuota diperoleh | Yang sebenarnya didapat |
|---|---|---|---|---|
| Hari ini: 1 project | 1 | 100 CU-jam | — | — |
| 2 database, **1 project** | 1 (dipakai bersama) | 100 CU-jam | **0** | Isolasi skema/role saja |
| 2 database, **2 project** | 2 | **200 CU-jam** | +100 CU-jam | Isolasi blast radius + rotasi |
| Cron keluar dari Neon | 1 | 100 CU-jam | **+61 CU-jam** | Tidak ada project baru |

### 1.3 Apa yang benar-benar dibeli split

Bukan kuota. Kuota adalah efek samping. Yang dibeli:

1. **Rotasi tanpa dump.** COMPUTE suspend → **koneksi Postgres** (termasuk
   `pg_dump` dan `pg` di `scripts/migrate.mjs`) gagal `SQLSTATE 53000`, dan
   **Data API** yang dipakai runtime menjawab **HTTP 402**. Runtime selamat hanya
   dalam arti tidak ada connection pool yang macet — tapi lihat §3.4a: 402 tidak
   diklasifikasikan sebagai outage oleh taksonomi error yang ada, jadi tanpa
   perbaikan kecil itu aplikasi akan terus menembak project yang mati tanpa
   backoff. Yang membuat rotasi murah tetap sama: project baru = `migrate up` dari
   `migrations/` (60 file, 452 KB) dan selesai — **skema adalah fungsi dari repo,
   bukan dari project.** Itulah alasan teknis kenapa `pg_dump` tidak dibutuhkan:
   yang perlu diselamatkan cuma *data*, dan data COMPUTE memang dirancang untuk
   dibuang.
2. **Isolasi kegagalan.** COMPUTE suspend/hang/breaker terbuka tidak boleh
   menyentuh CORE. Ini **tidak gratis**: lihat §3.4, label dependency bersama akan
   mengembalikan kegagalan persis seperti yang ingin dicegah.
3. **Anggaran terpisah.** Cron 61 CU-jam pindah ke project yang seluruh gunanya
   adalah menyerapnya. CORE menyimpan 100 CU-jam untuk manusia.

### 1.4 Yang lebih murah daripada split

| Langkah | Risiko | Hemat | Butuh project baru |
|---|---|---|---|
| Uptime monitor keluar dari `/health` | sangat rendah | mencegah wake liar | tidak |
| `sweep-queue` keluar dari Neon | rendah | 61 → 30 CU-jam | tidak |
| `agenda-reminders` `*/30` → `*/60` | rendah | 30 → 15 CU-jam | tidak |
| `rate_limit_check` → in-memory | sedang | write terpanas per aksi | tidak |
| TTL cache 60 dtk → 10–15 mnt | rendah | request baca config | tidak |
| Bank soal statis → JSON build-time | rendah | 1 tabel, payload | tidak |
| Progres game ditulis 1x per sesi | rendah | 3 call site | tidak |
| **Upgrade ke Launch** | rendah (biaya) | kuota tak terbatas | tidak |
| **Split CORE/COMPUTE** | **tinggi** | +100 CU-jam, rotasi | **ya** |

Baris "Upgrade ke Launch" bukan pelarian dari desain ini, melainkan pembanding
harga yang wajib disebut: pada $0,106/CU-jam (audit 2026-11-18), 60 CU-jam/bulan =
**≈ $6,4/bulan**, dan tanpa perbaikan cron 110 CU-jam = ≈ $11,7/bulan. Kalau
tujuannya hanya "jangan pernah kehabisan kuota", **$6,4/bulan lebih murah daripada
biaya membangun dan merawat split.** Split dibenarkan oleh hal lain: rotasi tanpa
dump dan isolasi kegagalan.

Split ada di baris terakhir karena alasan yang benar: **hematan per unit risiko
paling buruk di tabel ini.**

**Rekonsiliasi dengan audit 2026-11-18.** Audit itu menyimpulkan project Neon
kedua "layak hanya untuk memisahkan dev/prod, bukan untuk menambah kapasitas situs
yang sama". Dokumen ini **setuju pada kesimpulan itu** dan tidak mengulanginya:
split di sini tidak dijual sebagai penambah kapasitas, melainkan sebagai (a) hak
untuk membuang project COMPUTE tanpa `pg_dump`, dan (b) pagar supaya cron yang
kehabisan kuota tidak menjatuhkan login. Yang ditambahkan dokumen ini terhadap
audit: peta tabel yang eksplisit, desain routing `DB_TARGETS`, jebakan label
breaker (§3.4), dan jebakan 402 (§3.4a).

---

## 2. Pemetaan tabel: CORE vs COMPUTE

### 2.0 Kenapa dua, bukan tiga

Referensi industri (TrinityCore/AzerothCore) memecah tiga: `auth`,
`characters`, `world`. Padanan kita:

- `world` = konten statis (`job_database`, `wawancara_soal`, `wa_templates`,
  `rincian_presets`, `sys_config`). Semuanya kecil, sudah di-cache LRU, dan
  **tidak bisa dibuang** karena itu konten bisnis. Project ketiga tidak membeli
  apa pun.
- `auth` = `admin_credentials`, `user_sessions`, `session_revocations`.
  **Tidak boleh dipisah dari `characters`**, karena `sessionGateEpoch()` dipanggil
  di setiap aksi ber-sesi dan **fail-closed**: baca gagal ⇒
  `"Sesi tidak dapat diverifikasi"` untuk semua orang. Satu project auth yang
  suspend = seluruh aplikasi terkunci, termasuk halaman publik yang butuh sesi.

Jadi: **dua.** Pembagiannya menurut *umur data*, bukan menurut domain.

### 2.1 Prinsip

- **CORE** = apa pun yang hilangnya tidak bisa dipulihkan tanpa manusia, uang,
  atau kehilangan kepercayaan.
- **COMPUTE** = apa pun yang bisa dibuat ulang oleh aplikasi sendiri, atau yang
  hilangnya paling mahal adalah satu pengulangan aksi pengguna.
- Ragu → **CORE**. Default `targetOf()` juga CORE, jadi kesalahan default-nya
  adalah "tidak ada yang berubah", bukan "data hilang".

### 2.2 CORE — 30 tabel (dari 35 di kontrak)

| Tabel | Call site | Alasan satu baris |
|---|---|---|
| `master_database_candidate` | 25 | Induk data kandidat, 169 kolom, ~1,14 KB/baris, 234 baris. Sumber kebenaran PII. |
| `database_candidate` | 24 | Status lamaran dan tahapan seleksi; riwayat seleksi tidak bisa direkonstruksi. |
| `database_asj_form` | 14 | Lamaran masuk dari form publik; satu-satunya salinan. |
| `database_schedule` | 12 | Agenda wawancara; masukan cron pengingat, bukan turunannya. |
| `fcm_tokens` | 9 | Bisa dibuat ulang, tapi **hanya oleh aksi pengguna** (app daftar ulang saat dibuka). |
| `candidate_assessments` | 8 | Nilai tes siswa. |
| `ai_form_submissions` | 8 | CV yang dikirim kandidat. |
| `notifikasi_kandidat` | 7 | Kotak masuk kandidat; hilang = notifikasi terbaca hilang senyap. |
| `job_database` | 6 | Konten lowongan. |
| `database_tugas` | 6 | Papan tugas tim. |
| `wa_templates` | 5 | Konfigurasi pesan. |
| `sys_config` | 5 | Konfigurasi aplikasi. |
| `pemberkasan_checklist` | 4 | Kelengkapan berkas; bisa direkonstruksi dari Storage, tapi mahal dan manual. |
| `session_revocations` | 3 | Kontrol keamanan. Hilang = token yang sudah logout hidup lagi. Fail-closed. |
| `rincian_presets` | 3 | Konfigurasi. |
| `esignatures` | 3 | Tanda tangan dokumen; nilai legal. |
| `game_scores` | 3 | Progres siswa. Terlihat seperti telemetri, bukan. |
| `wawancara_jawaban` | 2 | Jawaban mensetsu yang dinilai. |
| `respon_siswa_baru` | 2 | Pendaftaran siswa baru. |
| `database_asj_kontak` | 2 | Pesan masuk publik (lead). |
| `admin_credentials` | 2 | Kredensial admin. |
| `wawancara_soal` | 1 | Bank soal; setelah §5 P2 dibaca dari JSON build-time, tapi barisnya tetap CORE. |
| `candidate_pekerjaan` | 1 | Riwayat pekerjaan per kandidat. |
| `user_sessions` | 1 | Sesi. |
| `schedule_reminders` | 0 | Audit "sudah diingatkan"; hilang = satu pengingat terkirim dua kali ke siswa. |
| `meta_rev` | 0 | Revisi domain untuk cache buster. |
| `schema_migrations` | 0 | Ledger migrasi. Tidak dipanggil runtime, tapi harus ada di **setiap** project (termasuk COMPUTE) — itu yang membuat bootstrap satu perintah. |
| `data_archive`, `siswa_baru_docs`, `_backup_alamat_20261029`, `_backup_hubungan_20261029` | 0 | Arsip. Tidak dipanggil runtime; tetap CORE supaya tidak ada yang perlu diputuskan. |

### 2.3 COMPUTE — 5 tabel

| Tabel | Call site | Alasan satu baris | Hilang artinya |
|---|---|---|---|
| `job_queue` | 2 | Antrean; produsen meng-enqueue ulang. | Job yang sedang diklaim hilang; pengguna mengulang aksi. |
| `idempotency_keys` | 3 | Cache hasil ber-TTL. | Satu duplikat mungkin diproses sekali; constraint unik di CORE tetap mencegah baris ganda. |
| `dependency_calls` | 1 | Telemetri fire-and-forget. | Lubang di grafik; sink eksternal sudah ada. |
| `netlify_logs` | 0 | Sink log. | Lubang log. |
| `rate_counters` (+ RPC `rate_limit_check`, `rate_limit_fail`) | 1 | Penghitung jendela. | Satu jendela tanpa pembatasan, lalu hitung dari nol. |

`rate_counters` adalah anggota paling lemah dari himpunan ini, dan alasannya
terukur: audit 2026-11-18 menemukan bahwa **setiap aksi non-read** menjalankan RPC
`rate_limit_check` (sebuah *write*) dan login gagal menambah `rate_limit_fail` —
"penyumbang terbesar setelah cron". Memindahkannya ke COMPUTE memindahkan beban,
tapi **tidak menghapusnya**, dan menambah satu round trip ke host kedua di jalur
aksi. Menghapusnya (rate-limit in-memory untuk aksi non-login, §5 P1) lebih baik
daripada memindahkannya. Kalau P1 itu dikerjakan lebih dulu, `rate_counters` boleh
tetap di CORE — keputusan itu tidak mempengaruhi sisa desain.

### 2.4 Tabel yang terlihat sekali pakai tapi bukan

| Tabel | Kenapa tidak boleh di COMPUTE |
|---|---|
| `session_revocations` | Bukan cache. Ini satu-satunya catatan bahwa sebuah token dicabut. Kosong = **semua token yang sudah logout berlaku lagi**, tanpa error, tanpa log. Dan karena gate-nya fail-closed, project-nya yang mati berarti semua orang terkunci. |
| `game_scores` | Data siswa. Papan skor kelas adalah nilai, bukan telemetri. |
| `candidate_assessments` | Nilai tes. Tidak ada sumber lain. |
| `wawancara_jawaban` | Jawaban yang dinilai; hilang = penilaian ulang manual. |
| `notifikasi_kandidat` | Kotak masuk. Hilang = riwayat hilang tanpa jejak. |
| `fcm_tokens` | Regenerable, tapi hanya setelah siswa membuka app. Rotasi = push mati untuk semua siswa sampai mereka membuka app. |
| `schedule_reminders` | Audit "sudah diingatkan". Hilang = satu pengingat terkirim dua kali (WA nyata ke siswa). |
| `pemberkasan_checklist` | Bisa direkonstruksi dari Storage, tapi biayanya jam kerja admin, bukan nol. |

### 2.5 Konsekuensi yang harus diterima

`agenda-reminders` butuh `database_schedule` + `fcm_tokens` + `notifikasi_kandidat`
+ `schedule_reminders` — **empat-empatnya CORE.** Jadi cron ini **tidak bisa
pindah ke COMPUTE** tanpa replikasi. Yang bisa pindah hanya `sweep-queue`
(`job_queue` + `idempotency_keys`).

Artinya split saja menyisakan CORE bangun 48x/hari = **30 CU-jam**. Untuk
mencapai 0, `agenda-reminders` harus keluar dari Neon atau jadi work-conditional.
Itu §5 P1, dan itu sebabnya urutannya begitu.

---

## 3. Routing di dalam `client.ts`

### 3.1 File baru dan file yang berubah

| File | Aksi | Isi |
|---|---|---|
| `netlify/functions/_lib/db/targets.ts` | **baru** (~60 baris) | `DbTarget`, `DB_TARGETS`, `targetOf`, `targetUrl`, `targetKey`, `targetLabel` |
| `netlify/functions/_lib/db/client.ts` | ubah | `supabaseJson` meresolusi target dari `pathname`, meneruskan `dep` |
| `netlify/functions/_lib/kernel/http.ts` | ubah | `request()` menerima `init.dep`; guard rekursi jadi uji prefix |
| `netlify/functions/_lib/kernel/resilience.ts` | ubah | `DEPENDENCY_CONFIGS['postgrest:compute']` |
| `netlify/functions/_lib/env.ts` | ubah | `WHITELIST` += `COMPUTE_SUPABASE_URL`, `COMPUTE_SUPABASE_KEY` |
| `.env.example` | ubah | dua nama itu, mengikuti preseden `STORAGE_SUPABASE_URL` |
| `netlify/functions/_lib/health.ts` | ubah | probe eksplisit CORE; `countQueue()` tidak lagi menyusun URL sendiri |
| `scripts/ci/verify-db-routing.mjs` | **baru** | gagal kalau ada `/rest/v1/` di luar `_lib/db/client.ts` |
| `scripts/ci/gen-schema.mjs` | ubah | mode `--compare-compute` |

### 3.2 `targets.ts`

```ts
export type DbTarget = 'core' | 'compute';

/**
 * Tabel yang hidup di COMPUTE. Tidak ada di sini = CORE.
 * Kecil dan eksplisit dengan sengaja: satu baris per tabel, bisa dibaca
 * di review, dan default-nya "tidak ada yang berubah".
 */
const DB_TARGETS: Readonly<Record<string, DbTarget>> = {
  job_queue: 'compute',
  idempotency_keys: 'compute',
  dependency_calls: 'compute',
  netlify_logs: 'compute',
  rate_counters: 'compute',
  // RPC ikut dirutekan lewat namanya: fungsi SQL-nya hidup di project COMPUTE,
  // jadi memanggilnya ke CORE akan 404 walaupun tabelnya ada di sana.
  'rpc/rate_limit_check': 'compute',
  'rpc/rate_limit_fail': 'compute',
};

export function targetOf(pathname: string): DbTarget {
  const p = String(pathname || '').replace(/^\/+/, '');
  if (!p) return 'core';                 // dokumen OpenAPI — selalu CORE
  return DB_TARGETS[p] ?? 'core';
}

export function targetUrl(t: DbTarget): string {
  return t === 'compute' ? env('COMPUTE_SUPABASE_URL') || env('SUPABASE_URL') : env('SUPABASE_URL');
}

export function targetKey(t: DbTarget): string {
  const core = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY') || env('SUPABASE_KEY');
  return t === 'compute' ? env('COMPUTE_SUPABASE_KEY') || core : core;
}

/** Label breaker/bulkhead. TANPA COMPUTE_* hasilnya persis 'postgrest'. */
export function targetLabel(t: DbTarget): string {
  if (t !== 'compute') return 'postgrest';
  return env('COMPUTE_SUPABASE_URL') ? 'postgrest:compute' : 'postgrest';
}
```

Dua sifat yang wajib dipertahankan:

- **`COMPUTE_SUPABASE_*` tidak diset ⇒ perilaku byte-identik.** `targetUrl`
  mengembalikan `SUPABASE_URL`, `targetKey` mengembalikan key yang sama, dan
  `targetLabel` mengembalikan `'postgrest'` — bukan `'postgrest:core'`. Kalau
  labelnya berubah, `snapshot()` breaker berubah bentuk dan `/health` ikut
  berubah walaupun tidak ada split.
- **`overrideKey` tetap menang.** Urutannya
  `opts.overrideKey || targetKey(target)`, sama seperti `storageUrl()` /
  `storageKey()` mendahulukan `STORAGE_*`.

### 3.3 Perubahan di `supabaseJson`

```ts
const target = targetOf(pathname);
const url = targetUrl(target);
const key = opts.overrideKey || targetKey(target);
const authKey = opts.overrideAuthKey || key;
// ...
request(url.replace(/\$/, '') + '/rest/v1/' + pathname + qs, {
  method,
  headers: { apikey: key, Authorization: 'Bearer ' + authKey, ... },
  dep: targetLabel(target),          // ← satu-satunya tambahan
  budgetKey: opts.body ? 'postgrest_write' : 'postgrest_read',
});
```

`hasBackend()` tetap CORE-only. `getSchema()` (`pathname === ''`) tetap CORE: itu
dokumen OpenAPI, bukan data.

### 3.4 `detectDependency()` tidak boleh menggabungkan dua host

`detectDependency()` mencocokkan `url.includes('supabase') || url.includes('neon.tech')`
→ `'postgrest'`. Kedua project Neon punya host `*.apirest.<region>.aws.neon.tech`, jadi
**keduanya jatuh ke label yang sama** kalau tidak diubah. Empat akibat, semuanya
terukur dari kode yang ada:

1. **Breaker bersama.** `DEPENDENCY_CONFIGS.postgrest` = threshold 5 dalam 30 dtk,
   cooldown 15 dtk. Dua jalur berbeda, keduanya buruk:
   - Kalau COMPUTE menjawab **5xx/429** (gateway yang sedang suspend, atau project
     yang mati di tengah jalan), lima kegagalan dalam 30 dtk membuka breaker
     `postgrest` — dan CORE ikut ditolak. `session_revocations` ada di CORE dan
     gate-nya fail-closed ⇒ **seluruh aplikasi terkunci karena antrean kosong.**
   - Kalau COMPUTE menjawab **402** (kasus normal saat suspend), breaker justru
     **tidak** terbuka (§3.4a) — jadi setiap panggilan menunggu sampai budget
     habis. Itu memakan slot bulkhead (poin 2), bukan breaker. Dua mekanisme
     gagal yang berbeda, satu label yang sama.
2. **Bulkhead bersama.** `maxConcurrent = 8` per label. COMPUTE yang suspend
   memakan slot CORE selama satu budget penuh per panggilan; gejalanya sudah
   pernah tercatat: `"Bulkhead limit reached"` + respons 13 dtk pada function yang
   panas.
3. **EWMA admisi bersama.** `observeDependency(dep, ...)` memberi tekanan CORE
   dari latensi COMPUTE → load shedding mulai untuk baca yang sebenarnya sehat.
4. **`/health` buta.** Kalau labelnya digabung, `snapshot()` tidak bisa
   membedakan mana yang mati, dan `reasons` akan menyalahkan "PostgREST" secara
   keseluruhan.

**Keputusan: pisahkan label, dan pisahkan lewat `init.dep`, bukan lewat sniffing
host di `kernel/http.ts`.** Alasannya: kernel tidak boleh mengimpor `env`, dan
host-nya berbeda per deployment. `detectDependency()` tetap jadi fallback untuk
pemanggil yang tidak mengirim `dep` (Storage, Gemini, Fonnte, FCM).

**Jebakan di guard rekursi.** `logDependencyCall()` berhenti lebih awal hanya
untuk `dep === 'postgrest'`, karena menulis log ke `dependency_calls` adalah
panggilan PostgREST juga. Label `postgrest:compute` **lolos** dari guard itu →
setiap query COMPUTE >100 ms mencatat dirinya ke `dependency_calls` (yang ada di
COMPUTE) → setiap tulis log >100 ms mencatat lagi → **fan-out tak terbatas**,
persis bug 2026-10-21. Guard-nya harus jadi uji prefix:

```ts
if (dep.startsWith('postgrest')) return;
```

dan `DEPENDENCY_CONFIGS` harus punya `'postgrest:compute'`, kalau tidak label itu
tidak muncul di `snapshot()` dan `/health` buta terhadapnya — bug `grok` yang
sudah pernah terjadi di file yang sama.

### 3.4a `402` bukan 5xx, jadi project yang suspend tidak pernah dianggap mati

Ini konsekuensi yang tidak terlihat dari dokumen vendor, dan bisa diverifikasi di
kode hari ini:

- Neon yang suspend menjawab Data API dengan **HTTP 402**.
- `isDatabaseUnreachable()` mengembalikan `true` hanya untuk `TimeoutError`,
  `HttpError` dengan `status >= 500`, atau `TypeError` dari `fetch`. **402 → false.**
- Maka `markDbOutage()` **tidak** dipanggil → surface wrapper tidak mengirim
  `503 + Retry-After` → klien menerima status generik hasil `outcomeStatusCode`.
- Dan di `request()`, `breaker.failure()` hanya dipanggil untuk `>= 500` atau
  `429`. **402 tidak membuka breaker.**

Akibatnya: sebuah project yang suspend menghasilkan aliran 402 tanpa batas, tanpa
backoff, tanpa breaker, dan tanpa sinyal apa pun bahwa itu *outage* dan bukan
"permintaan Anda salah". Setelah split, ini bukan lagi bencana (CORE tetap
hidup), tapi tetap salah: setiap aksi yang menyentuh COMPUTE akan gagal dengan
pesan yang menyesatkan.

Perbaikan minimum, dan harus masuk bersama split:

```ts
// di isDatabaseUnreachable(), tambah satu kasus:
if (err instanceof HttpError) return err.status >= 500 || err.status === 402;
```

`402` sengaja dipetakan ke outage, bukan ke 4xx biasa: satu-satunya sumber 402 di
sistem ini adalah kuota habis, dan itu memang "coba lagi nanti", bukan "kunci
Anda salah". Kalau dipetakan, breaker `postgrest:compute` terbuka setelah 5
kegagalan, CORE tidak terpengaruh, dan `/health` akhirnya bisa membedakan keduanya.

### 3.5 Jalur bypass yang harus ditutup

`health.ts` punya satu-satunya tempat yang menyusun URL PostgREST **sendiri**,
tanpa lewat `supabaseJson`:

```ts
const url = '/rest/v1/job_queue';
const u = supabaseUrl();
const k = supabaseKey();
```

Itu untuk membaca header `Content-Range` (HEAD + `Prefer: count=exact`). Setelah
`job_queue` pindah, jalur ini tetap menembak CORE, mendapat `PGRST205`
("table not found"), dan `/health` melaporkan `depth: null` selamanya sambil
mengirim HEAD ke tabel yang tidak ada di sana. Perbaikannya: ganti ke
`targetUrl(targetOf('job_queue'))` + `targetKey(...)` + `dep: targetLabel(...)`.

Supaya kelas bug ini tidak kembali, tambahkan gate:

```
scripts/ci/verify-db-routing.mjs
  gagal kalau '/rest/v1/' muncul di netlify/functions/** di luar _lib/db/client.ts
```

Hari ini gate itu **merah dengan 1 hit** (`health.ts:216`). Itu benar: gate yang
tidak bisa gagal tidak membuktikan apa pun.

### 3.6 `schema.generated.ts`: dua desain, dan mana yang dipilih

Gejalanya nyata. Untuk tabel yang tidak ada di kontrak:

- `resolveSelect()` mengembalikan `select` pemanggil apa adanya → `*` bisa ke wire.
- `writeBodyFor()` mengembalikan `{ body, dropped: [] }` **tanpa filter** → guard
  PGRST204 hilang. Satu kunci basi (seperti `submitted_by` pada
  `ai_form_submissions`, terukur 2026-10-08) membuat **seluruh** write ditolak 400,
  dan catch luar handler mengembalikan pesan generik → gagal senyap.
- `findTable()` melewati tabel yang tidak ada di kontrak (`if (!columnsOf(t)) continue`)
  → pencarian adaptif mengembalikan `{ table: null, rows: [] }` tanpa error.

**Desain A (dipilih): satu ledger, satu skema, satu kontrak.**

Kedua project menjalankan `migrations/` yang sama dan tidak bisa diubah
(checksum menolak edit). Jadi skema COMPUTE **identik** dengan CORE — 35 tabel,
termasuk 5 tabel compute yang kosong. Konsekuensinya:

- `schema.generated.ts` **tidak perlu diubah sama sekali.** Tidak ada tabel yang
  bisa "keluar dari kontrak", jadi degradasi PGRST204 secara struktural mustahil.
- Gate-nya lebih kuat dan lebih murah: `gen-schema.mjs --compare-compute`
  mengambil dokumen OpenAPI dari **kedua** project dan gagal kalau
  `SCHEMA_FINGERPRINT` berbeda. Beda fingerprint = ada migrasi yang diterapkan ke
  satu project dan tidak ke yang lain — persis kegagalan yang ingin dicegah, dan
  lebih terdeteksi daripada dua daftar kolom yang harus dibandingkan manual.
- Kalau `COMPUTE_SUPABASE_*` kosong: `SKIP (COMPUTE tidak dikonfigurasi)` dengan
  baris yang berisik, bukan lolos diam-diam.

Biaya Desain A: kunci COMPUTE adalah role `asj_service` (BYPASSRLS), jadi kunci
itu secara teori bisa membaca 35 tabel, bukan 5. Lihat §6 untuk mitigasinya.

**Desain B (hanya kalau COMPUTE harus skema minimum).** Perlu:

1. `migrate.mjs` dapat kolom `target` di `schema_migrations` + flag
   `--target core|compute`, dan migrasi bertanda `-- target: compute` dilewati di
   CORE (tercatat sebagai `skipped`, bukan `pending`). ~80 baris.
2. `gen-schema.mjs` menghasilkan **dua** blok: `SCHEMA_LINES` (CORE) +
   `COMPUTE_SCHEMA_LINES`, dengan `columnsOf()` melihat keduanya.
3. Gate disjoint: tidak boleh ada tabel di kedua blok (routing ambigu).
4. Dan **tetap** ada risiko: tabel compute yang lupa masuk blok kedua kehilangan
   guard PGRST204 tanpa error. Itu tepat kegagalan yang diperingatkan brief.

Desain B hanya masuk akal kalau tujuan tambahannya adalah "kunci COMPUTE yang
bocor tidak bisa menyentuh PII". Itu tujuan yang sah — tapi jalankan sebagai
**Fase 4**, terpisah, setelah split-nya terbukti jalan.

### 3.7 Env var: urutan yang salah menghasilkan bug yang hanya muncul di preview

Preseden `STORAGE_SUPABASE_*` menunjukkan dua tempat: `env.ts` `WHITELIST` dan
`.env.example`. Untuk `COMPUTE_SUPABASE_*` urutannya wajib:

1. `env.ts` `WHITELIST` **dulu**, lalu
2. `.env.example`, lalu
3. Netlify UI (konteks **production**), lalu
4. `.env.local` untuk preview.

Kalau (1) dilewat, `process.env` produksi tetap bekerja dan `.env.local` tidak —
jadi split-nya "jalan di produksi, tidak jalan di preview", dan penyebabnya tidak
terlihat dari kode.

### 3.8 `/health` dan `/ping`

- `/health` probe DB-nya harus **eksplisit CORE** (mis. `sys_config?select=key&limit=0`),
  bukan `job_queue`. Kalau tidak, memantau kesehatan CORE akan membangunkan
  COMPUTE — masalah cron dalam bentuk lain.
- Kedalaman antrean (`countQueue`) hanya dibaca di jalur **bertoken**
  (`HEALTH_TOKEN`), yang dipanggil manusia, bukan monitor uptime.
- **Monitor uptime menunjuk `/ping`**, yang memang tanpa DB. `/health` tetap ada
  untuk diagnosa, bukan untuk polling.

---

## 4. Prosedur bootstrap / rotasi (tanpa `pg_dump`)

### 4.0 Prasyarat yang tidak boleh berubah

| Hal | Nilai | Kalau berubah |
|---|---|---|
| Kunci tanda tangan JWT | `SUPABASE_JWT_PRIVATE_KEY`, `JWT_PUBLIC_JWK`, `SUPABASE_JWT_KID`, `SUPABASE_JWT_ALG=EdDSA` | Semua sesi mati. `/jwks.json` adalah milik **situs**, bukan milik database — dua project memverifikasi ke URL yang sama, jadi satu kunci melayani keduanya. |
| Role admin | `SUPABASE_PG_ADMIN_ROLE=asj_service` | RLS menolak semua. |
| Ledger migrasi | `migrations/` (60 file, 452 KB) | Skema tidak bisa direproduksi. |

`asj_service` **tidak dibuat oleh migrasi mana pun** (`grep CREATE ROLE
migrations/*.sql` = 0). Role itu dibuat manual di konsol Neon. Itu langkah
manual yang wajib ada di checklist, karena tanpanya `migrate up` akan gagal di
`GRANT` pertama.

### 4.1 Langkah berurutan

1. **Catat baseline.** Konsol Neon → project CORE → Usage: CU-jam terpakai,
   compute size, jumlah wake hari ini. Tanpa ini tidak ada gate yang bisa diukur
   (§7).
2. **Buat project Neon #2.** Region sama dengan CORE (latensi + jalur fetch JWKS
   identik). Versi Postgres sama.
3. **Buat role.** `asj_service` dengan `LOGIN` + `BYPASSRLS`, lalu
   `ALTER ROLE asj_service SET statement_timeout = '3s'` (mencerminkan
   `migrations/011_statement_timeout.sql`).
4. **Aktifkan Data API.** Set JWKS URL = `https://<situs>/jwks.json` (sama dengan
   CORE), db-role = `asj_service`. `/jwks.json` di-emit saat build dari
   `JWT_PUBLIC_JWK` (lihat `package.json` `build`), jadi tidak ada yang perlu
   dibuat manual di sini.
5. **Terapkan ledger.**
   `SUPABASE_DB_URL='<direct compute>' node scripts/migrate.mjs up`
   `process.env` menang atas `.env.local`, jadi tidak perlu mengedit file — tapi
   **konfirmasi host-nya** dengan `migrate.mjs status` (mencetak target) sebelum
   dan sesudah, karena salah host berarti menerapkan 60 migrasi ke CORE.
6. **Verifikasi.** `verify:db` dan `verify:rls` terhadap URL yang sama.
7. **Isi env** dalam urutan §3.7.
8. **Bandingkan kontrak.** `npm run db:schema` (dari CORE), lalu
   `gen-schema.mjs --compare-compute` → kedua fingerprint harus sama.
9. **Deploy dengan `DB_TARGETS` terisi.** Gate: satu baca + satu tulis per tabel
   COMPUTE; grafik aktivitas project COMPUTE bergerak, grafik CORE tidak.
10. **Cron.** `sweep-queue` tetap `*/15`; sekarang menulis ke COMPUTE lewat
    routing, tanpa perubahan kode di fungsinya.
11. **`/health` + `/ping`** sesuai §3.8.
12. **Gate 7 hari:** CU-jam CORE per hari harus turun ke tingkat trafik manusia.

### 4.2 Rotasi (COMPUTE suspend / mau dibuang)

1. Buat project #3 (langkah 2–6 di atas). **Tidak ada `pg_dump`.**
2. Ganti `COMPUTE_SUPABASE_URL` + `COMPUTE_SUPABASE_KEY` di Netlify UI.
3. `gen-schema.mjs --compare-compute` → fingerprint harus sama.
4. Deploy. Selesai. Total ~15 menit, semuanya otomatis kecuali dua env var.

### 4.3 Data yang benar-benar hilang, dan cara membuatnya bisa diterima

| Tabel | Hilang | Mitigasi |
|---|---|---|
| `job_queue` | Job yang sedang diklaim, dan job yang menunggu | Untuk job yang tidak boleh hilang, input aslinya sudah tersimpan di CORE (`ai_form_submissions`, `database_asj_form`) — enqueue ulang manual. Untuk sisanya, pengguna mengulang aksi. |
| `idempotency_keys` | Cache hasil | Tidak perlu apa pun: constraint unik di CORE tetap mencegah baris ganda. |
| `dependency_calls`, `netlify_logs` | Lubang telemetri | Sudah ada `METRICS_SINK_URL`; kirim ke sana, jangan andalkan tabel. |
| `rate_counters` | Satu jendela tanpa pembatasan | Terima. Setelah rotasi tabel kosong = hitung dari nol, bukan "tidak membatasi" — pastikan `rate_limit_check` memperlakukan baris tidak ada sebagai nol, bukan sebagai lolos. |

Yang **tidak** hilang dan tidak perlu diurus: tidak ada token untuk diterbitkan
ulang (token adalah JWT milik situs, bukan milik project), tidak ada nilai, tidak
ada revocation.

### 4.4 Rollback

**Murah, dan itu yang membuat split ini bisa dicoba.** Kelima tabel COMPUTE juga
ada di CORE (Desain A: skema identik). Jadi rollback = kosongkan `DB_TARGETS`
(satu commit) → semua panggilan kembali ke CORE → perilaku hari ini. Data yang
ditulis ke COMPUTE selama percobaan dibuang; isinya 5 tabel disposable.

Dua syarat supaya rollback tetap murah:

- **Jangan `DROP` tabel compute dari CORE.** Kalau di-drop, rollback butuh
  migrasi baru, dan migrasi tidak bisa diubah setelah diterapkan.
- **Tutup jalur bypass (§3.5) sebelum rollback diuji.** Kalau tidak, rollback
  yang "berhasil" bisa berarti "sebagian panggilan masih menembak project yang
  sudah dihapus".

---

## 5. Rencana bertahap, diurutkan menurut hematan per unit risiko

| Fase | Isi | Risiko | Hemat | Gate terukur |
|---|---|---|---|---|
| **P0** | Monitor uptime pindah dari `/health` ke `/ping`; probe DB `/health` hanya di jalur bertoken | sangat rendah | mencegah wake liar | 24 jam: 0 request DB dari monitor (bandingkan hit `ping` vs `health` di log function) |
| **P0** | TTL `cache.getOrSet` untuk `sys_config`, `wa_templates`, `rincian_presets` naik 60 dtk → 10–15 mnt | rendah | baca config | 7 hari: request ke 3 tabel itu turun ≥70% |
| **P1** | `sweep-queue` keluar dari Neon (D1/Upstash) **atau** ke project COMPUTE | sedang | 61 → 30 CU-jam | 7 hari: grafik aktivitas Neon CORE tidak lagi punya pulsa 15 menit |
| **P1** | `agenda-reminders` `*/30` → `*/60` (komentarnya sendiri menyatakan jendela tersempit 1 jam) | rendah | 30 → 15 CU-jam | 7 hari: tidak ada pengingat terlewat; bandingkan `schedule_reminders.sent_at` dengan `database_schedule.tanggal_waktu` |
| **P1** | `rate_limit_check` / `rate_limit_fail` → in-memory untuk aksi non-login (audit 2026-11-18 P1) | sedang | write terpanas per aksi | 7 hari: RPC rate-limit turun ≥90%; login gagal tetap tercatat |
| **P2** | Bank soal statis (`wawancara_soal`, kotoba) → JSON build-time | rendah | 1 tabel, payload | 7 hari: 0 request ke `wawancara_soal` |
| **P2** | Progres game di-buffer di klien, tulis 1x per sesi | rendah | 3 call site | `game_scores` write/hari turun ≥80% |
| **P3** | **Split**: project Neon #2 + `DB_TARGETS` + `targets.ts` + gate routing | tinggi | +100 CU-jam, rotasi 15 menit | COMPUTE dihapus dan dibuat ulang, semua surface 200 dalam ≤15 menit; CORE tidak pernah `53000` |
| **P4** (opsional) | Skema COMPUTE dikurangi (Desain B) | sedang | blast radius kunci bocor | `--compare-compute` gagal saat tabel compute hilang dari kontrak |

P0 dan P1 sengaja mendahului split: keduanya memindahkan beban yang **tidak
butuh Postgres sama sekali**, sehingga split tidak perlu menyerap cron yang
seharusnya tidak ada di sana.

---

## 6. Risiko dan yang JANGAN dilakukan

1. **Jangan taruh dua database di satu project lalu menyebutnya split.** Satu
   compute, satu allowance, 0 CU-jam. Itu hanya pengelompokan skema.
2. **Jangan rotasi database yang memegang `session_revocations` atau nilai.**
   Revocation hilang = token yang sudah logout hidup lagi, tanpa error. Nilai
   hilang = tidak ada sumber lain. Prosedur §4 hanya untuk COMPUTE.
3. **Jangan biarkan tabel project kedua keluar dari kontrak.** Itu mematikan
   guard PGRST204 secara senyap: satu kunci basi menolak seluruh write, dan
   handler mengembalikan pesan generik. Desain A menghilangkan kemungkinannya;
   Desain B mengembalikannya.
4. **Jangan jalankan test suite terhadap COMPUTE.** `test-guard` mencatat setiap
   write non-GET saat berjalan di vitest ke DB non-lokal, dan suite pernah
   menulis 35 baris `notifikasi_kandidat` nyata (terukur 2026-11-07). Dua project
   = dua cara merusak produksi.
5. **Jangan biarkan `detectDependency()` menggabungkan dua host.** Breaker
   bersama + `session-gate` fail-closed = satu project suspend mengunci seluruh
   aplikasi.
6. **Jangan set `COMPUTE_SUPABASE_*` tanpa menambah ke `WHITELIST`.** Produksi
   jalan, preview lokal tidak — bug yang hanya muncul di tempat yang paling
   jarang diperiksa.
7. **Jangan taruh `job_queue` di CORE "supaya `/health` tetap benar".** Itu
   mengembalikan 61 CU-jam ke CORE dan membatalkan seluruh latihan.
8. **Jangan rapatkan kembali cron ke `*/2` atau `*/5`** demi latensi antrean.
   Itu sudah pernah mematikan project sekali (`netlify.toml`).
9. **Jangan jadikan `pg_dump` rencana rotasi.** Skema berasal dari
   `migrations/`; yang perlu diselamatkan hanya data, dan data COMPUTE memang
   untuk dibuang.
10. **Jangan taruh `fcm_tokens` di COMPUTE.** Regenerable hanya oleh aksi
    pengguna, jadi rotasi = push mati sampai setiap siswa membuka app.
11. **Jangan mengedit migrasi yang sudah diterapkan** (checksum menolak), termasuk
    untuk "menambahkan tabel compute". Migrasi baru, selalu.
12. **Jangan menganggap "dua project = 200 CU-jam" tanpa memindahkan beban.**
    Allowance menganggur tetap menganggur.

---

## 7. OPEN QUESTIONS

Hanya bisa dijawab dengan mengukur project yang hidup.

1. **Berapa CU-jam CORE terpakai per hari SEKARANG** (setelah `2ca2729` memperlebar
   cron)? Audit 2026-11-18 mengukur 110,13 CU-jam dalam 17 hari pada jadwal lama —
   itu angka *sebelum* perbaikan. Angka sesudahnya hanya terbaca di konsol Neon
   (Usage), dan itulah yang menentukan apakah split mendesak atau tidak.
2. **Apakah compute pernah autoscale di atas 0,25 CU?** Aritmetika di §1.1 dan di
   audit memakai 0,25 CU (dan cocok dengan meter: 0,25 x 24 jam ≈ 6 CU-jam/hari ≈
   110 CU-jam/17 hari). Tapi Free mengizinkan sampai 2 CU, jadi kalau compute
   pernah naik saat beban tinggi, CU-jam trafik manusia jauh lebih besar daripada
   perkiraan cron — dan itu mengubah urutan fase.
3. **Berapa wake per hari yang benar-benar terjadi?** Cron dan trafik manusia
   tidak bisa dipisahkan dari kode; hanya grafik aktivitas compute yang bisa
   memisahkannya.
4. **Apakah Data API project kedua menerima JWT EdDSA yang sama** (kid sama,
   JWKS sama) dan memetakannya ke `asj_service`? Kalau tidak, split berarti dua
   kunci tanda tangan dan sesi yang tidak portabel.
5. **Apakah `53000` juga berlaku untuk role `BYPASSRLS`?** Dokumentasi vendor
   menyebut "semua koneksi", tapi migrasi kita memakai `pg`, jadi ini menentukan
   apakah `migrate up` benar-benar mustahil saat suspend.
6. **Berapa request/hari ke 5 tabel COMPUTE?** Kalau kecil, D1/Upstash cukup dan
   project Neon kedua tidak perlu ada.
7. **Apakah `agenda-reminders` aman di `*/60`?** Komentarnya menyatakan jendela
   tersempit 1 jam, tapi itu harus diverifikasi terhadap query dan data nyata
   sebelum dijadwalkan ulang.
8. **Apakah project suspend benar-benar menjawab 402, bukan 503?** Angka 402
   berasal dari audit 2026-11-18 (dibaca dari portal), bukan dari probe yang
   terkontrol. Ini menentukan apakah perbaikan §3.4a wajib atau sudah tertangani
   oleh jalur `>= 500`. Uji termurah: probe satu project yang sudah suspend dan
   catat status + body-nya.

---

## Lampiran: diagram

Diagram kelas: `docs/db-split-class.mermaid`.
Diagram urutan: `docs/db-split-sequence.mermaid`.
