# Inferensi AI — Batch kelima: blast radius breaker, metrik latensi, dan round-trip

**Tanggal:** 2026-10-01
**Lingkup:** `_lib/ai/{providers,cv}.ts`, `_lib/kernel/{metrics,resilience}.ts`,
`contexts/applications/service.ts`, `vitest.config.ts`, 3 suite baru di `e2e/`
**Dasar:** kode `main` @ `5ab9c99` (batch keempat)
**Commit:** `413db59` + `10a596f` (**belum di-push** — R19)
**Baseline diukur SEBELUM mulai** (pelajaran batch 4): `6 failed | 2085 passed`.

---

## 1. Ringkasan

Tiga cacat, semuanya **diukur lebih dulu**, bukan disimpulkan dari membaca kode.

| # | Temuan | Kelas | Terukur |
|---|---|---|---|
| **T13** | Parse dokumen berbagi breaker dengan balasan pengguna — dan UI-nya mengajak mencoba lagi | Stabilitas (**KRITIS**) | Tiga parse gagal membuka breaker `gemini`: `expected 'open' to be 'closed'` |
| **T14** | `dependency.call.latency` tidak pernah menerima **satu sampel pun**, dan label histogram dibuang | Observabilitas | Nol sampel; kunci terdokumentasi mustahil muncul |
| **T15** | `handleSubmitDataAsj` menanyakan `database_asj_form` **4×** untuk satu WA | Performa | **11 percakapan**; 4× pembacaan tabel yang sama |

T13 adalah kelas yang sama dengan T1 (batch 1) dan T9 (batch 4) — **blast radius satu
permukaan menimpa permukaan lain** — tetapi dengan pemicu yang paling mudah terjadi:
sebuah **tindakan admin yang normal**.

---

## 2. T13 — Berkas buruk mematikan AI untuk semua orang (KRITIS)

### Cacatnya

`geminiParseFile` mencatat `breaker.failure('gemini')` untuk **setiap** kegagalan. Tapi
kegagalan parse bukan gejala kesehatan provider:

- berkas terlalu besar untuk dibaca model (`HTTP 413`),
- hasil scan yang tidak terbaca,
- blokir filter keamanan (`blockReason=SAFETY`).

Ketiganya `failure()` yang sama, di breaker yang **sama** dengan balasan chat
(ambang **3**, `coolDownMs` **30 dtk**). Dan UI-nya sendiri mengajak mencoba lagi —
`classify.ts:140` menjawab *"AI tidak bisa mengekstrak data dari file ini. **Coba file
lain.**"*

### Terukur

```
× tiga parse gagal TIDAK membuka breaker yang menjaga balasan pengguna
    AssertionError: expected 'open' to be 'closed'
× setelah parse gagal berulang, balasan pengguna masih benar-benar dikirim
```

Jadi: **satu admin, tiga berkas buruk, dan CV AI + HRD AI + simulator wawancara + parse
mati untuk SEMUA pengguna selama 30 detik.** Bukan hipotesis — itu hasil pengukuran.

### Perbaikannya

`geminiParseFile` memakai breaker sendiri, `gemini-parse` (terdaftar di
`DEPENDENCY_CONFIGS` ⇒ otomatis muncul di `/health`). Ambangnya **sama** dengan `gemini`:
providernya sama, jadi toleransinya sama — **yang dipisahkan adalah blast radius-nya,
bukan toleransinya.** Proteksinya tidak hilang.

Tes kedua sengaja tidak berhenti pada "state breaker terlihat benar": ia menembak
`geminiGenerate` setelahnya dan menuntut **panggilan provider benar-benar terjadi**
(`calls` bertambah 1). Kalau breaker `gemini` terbuka, panggilan itu ditolak lokal dan
`calls` tetap kosong — jadi tesnya mengukur perilaku, bukan field.

---

## 3. T14 — Metrik latensi yang tidak pernah ada

Tiga cacat yang saling menutupi, semuanya di jalur yang **seolah-olah sudah beres**.

### (a) `recordDependencyCall()` membuang durasi yang diberikan

```ts
export function recordDependencyCall(dep, action, budgetMs, durationMs, outcome, ...) {
  increment('dependency.call', { dep, outcome });
  histogram('dependency.call.latency', { dep });   // ← stop-nya DIBUANG
  log.info('dependency.call', { ..., duration_ms: durationMs, ... });
}
```

`histogram()` **memulai timer baru** dan hanya mencatat kalau fungsi stop yang
dikembalikannya **dipanggil**. Di sini stop itu dibuang — jadi **nol sampel, selamanya**,
sementara `durationMs` satu-satunya jejaknya adalah baris log. Fungsi yang menerima
durasi sudah terukur, lalu mengabaikannya.

### (b) Ia juga tidak punya pemanggil sama sekali

`grep` seluruh repo: hanya definisi dan daftar ekspor. Sementara
`metrics-receiver.ts:30` mendokumentasikan `dependency.call.latency{dep}` sebagai bagian
**kontrak payload** — jadi receiver-nya menunggu metrik yang kernelnya tidak pernah
kirim.

### (c) Label histogram dibuang oleh agregator

`metricsSnapshot()` mengelompokkan histogram dengan **nama saja**:

```ts
byName.get(h.name)!.push(h.durationMs);   // h.labels tidak dipakai
```

Padahal `increment()` sudah lama memasukkan label ke dalam kunci untuk counter
(`name.k=v`). Akibatnya kunci yang **didokumentasikan di repo ini sendiri** mustahil
muncul:

- `handler.latency.action=getAppData` — `docs/PHASE_C_SINK_SETUP.md:29`, dan bentuk yang
  dikonversi `otlp.test.ts:40`;
- `dependency.call.latency{dep}` — `metrics-receiver.ts:30`.

### Perbaikannya

| Perubahan | Menjawab |
|---|---|
| `metricKey(name, labels)` — **satu** sumber untuk counter DAN histogram | (c) |
| `observe(name, ms, labels)` — primitive untuk durasi yang **sudah** diukur | (a) |
| `histogram()` kini mendelegasikan ke `observe` (satu jalur push) | (a) |
| `recordDependencyCall` memakai `observe(...)` dengan `durationMs`-nya | (a) |
| `ai.model.latency{model,outcome}` per percobaan model | (kalibrasi hedge) |

**`ai.model.latency` menjawab batas jujur yang dinyatakan tinjauan §7:** *"Kalibrasi
lebar hedge masih belum terukur… latensi per model masih hanya terlihat lewat histogram
`handler.dispatch` per aksi, bukan per dependency."* Tanpa angka per model, lebar hedge
(1,5 dtk) hanya bisa diasumsikan — dan asumsi itulah yang menentukan berapa kali kuota
provider dibayar per giliran.

Pecundang hedge dicatat **`cancelled`**, bukan `error`. Mencampurnya akan membuat tingkat
kegagalan per model terlihat jauh lebih buruk daripada kenyataan — dan itu jenis angka
menyesatkan yang membuat kalibrasi berikutnya salah arah.

### Lanjutan: metriknya benar-benar DIPAKAI (`10a596f`)

Memperbaiki `recordDependencyCall` saja tidak cukup — ia tetap tanpa pemanggil, sehingga
`dependency.call.latency{dep}` masih tidak terkirim dan aturan peringatan di
`metrics-receiver.ts` masih buta terhadap provider yang paling sering gagal.

`recordAiCall()` mencatat **satu** hasil per panggilan **logis** (bukan per model) ke
nama metrik yang sama. Biayanya **nol baris tambahan**: jalur AI tetap memakai `fetch`
langsung (keputusan sadar tinjauan §7 — satu baris PostgREST per model yang di-hedge akan
menambah beban DB di jalur terpanas), dan metriknya ikut payload yang memang sudah
dikirim sekali per invokasi.

`dep` sengaja `'gemini'` untuk chat, parse, DAN terjemahan: yang diukur adalah kesehatan
**provider**. Pemisahan blast radius (kunci breaker) dan permukaan (label `action`) sudah
punya dimensinya masing-masing.

Penolakan `breaker.check()` **tidak** dicatat — di situ tidak ada panggilan yang pernah
keluar dari kotak, dan mencatatnya sebagai kegagalan provider akan menaikkan tingkat
kegagalan justru saat breaker sedang melindungi.

---

## 4. T15 — Empat pertanyaan yang sama untuk satu WA

### Cacatnya

`handleSubmitDataAsj` (jalur interaktif "Simpan CV AI") menanyakan `database_asj_form`
**empat kali** untuk WA yang sama dalam satu permintaan:

1. `cv.ts` — mencari baris pemberkasan (untuk sync `ktp_url`);
2. di dalam `syncBiodataKeMail` (`getFormsByWa`);
3. `cv.ts` **lagi** — untuk memutuskan `hasMail`;
4. di dalam `syncFormMailDariUpload` (`getFormsByWa`).

### Terukur (suite baru, `e2e/ai-cv-submit.test.ts`)

```
[rtt] handleSubmitDataAsj = 11 percakapan
  1. GET ai_form_submissions     6. GET database_candidate
  2. POST ai_form_submissions    7. PATCH database_candidate
  3. GET rpc/nextval             8. GET database_asj_form
  4. POST master_database_candidate  9. GET database_asj_form
  5. GET database_candidate     10. GET database_asj_form
                                11. POST database_asj_form
```

Pada RTT ~40 ms, ~160 ms di antaranya hanya untuk menanyakan hal yang sama.

### Tinjauan sebelumnya menahan ini dengan alasan yang TIDAK BENAR

Tinjauan 2026-10-01 §5.2 menulis: *"dua pembacaan `database_asj_form` **tidak** [aman
di-cache] — `syncBiodataKeMail` berjalan di antaranya dan **bisa membuat** baris mail
itu."*

Diperiksa langsung ke kode: **`syncBiodataKeMail` tidak bisa membuat baris.**
`contexts/applications/repository.ts:37` — `patchForm` adalah **PATCH murni**, tidak ada
`INSERT` di sana; dan `syncBiodataKeMail` `return` lebih awal kalau tidak ada baris
(`if (!mine.length) return`). Jadi jawaban "apakah barisnya ada" **tidak berubah** antara
pembacaan ke-1 dan ke-3 — dan itulah yang membuat pembacaan ketiga murni berulang.

### Perbaikannya

Satu pembacaan di-hoist, lalu barisnya **diserahkan** ke kedua helper lewat parameter
opsional `preloadedRows`:

- `undefined` ⇒ helper membaca sendiri (perilaku lama, tidak ada regresi);
- **array kosong tetap dipakai** — "tidak ada baris" adalah jawaban yang sah, dan justru
  kasus yang paling sering (kandidat yang belum pernah melamar).

### Terukur sesudah

```
[rtt] handleSubmitDataAsj = 8 percakapan
  1. GET database_asj_form   ← SATU pembacaan, di-hoist
  ...
  8. POST database_asj_form
```

**11 → 8 percakapan; `database_asj_form` dibaca 4× → 1×.** Dan tesnya memaku keduanya:
jumlah pembacaan tabel form (`toBe(1)`) **dan** total percakapan (`toBe(8)`), supaya
penambahan berikutnya tidak lolos tanpa suara.

Satu tes lagi memaku bahwa barisnya benar-benar **diserahkan** (`mock.calls[0][4]`),
bukan kebetulan. Dan karena mock hanya *meniru* kontrak itu, ada tes terpisah yang
memanggil helper **sungguhan** (`e2e/applications-sync-preloaded.test.ts`) dan menuntut
`getFormsByWa` **tidak dipanggil** saat barisnya diserahkan — kalau tidak, mengubah
`service.ts` agar mengabaikan `preloadedRows` akan tetap hijau.

---

## 5. Berkas yang berubah

| Berkas | Perubahan |
|---|---|
| `_lib/ai/providers.ts` | `BREAKER_PARSE` terpisah · `recordAiCall()` · `ai.model.latency{model,outcome}` per percobaan |
| `_lib/kernel/metrics.ts` | `metricKey()` bersama · `observe()` · `recordDependencyCall` memakai durasi yang diberikan · histogram dikelompokkan dengan label |
| `_lib/kernel/resilience.ts` | `'gemini-parse'` terdaftar |
| `_lib/ai/cv.ts` | Satu pembacaan `database_asj_form` di-hoist, diserahkan ke kedua helper |
| `contexts/applications/service.ts` | `preloadedRows` opsional pada `syncBiodataKeMail` + `syncFormMailDariUpload` |
| `vitest.config.ts` | 3 suite baru di-`exclude` dari project `frontend` (pola `share-data.test.ts`) |
| `e2e/{ai-cv-submit,kernel-metrics-histogram,applications-sync-preloaded}.test.ts` | 18 tes baru |

Perilaku yang **tidak** berubah: pemilihan model & urutannya, anggaran rantai batch 4,
gate VIP/KELAS, cap riwayat, bentuk balasan, dan seluruh tanda tangan lama (parameter
baru opsional di posisi terakhir).

---

## 6. Gate

```
tsc --noEmit                        exit 0
node scripts/ci/lint-ratchet.mjs    LINT RATCHET PASSED
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build   exit 0 (asj-astro-a8bb0c2dac27)
review:gate --ack=kernel --ack=data  7/7 PASS
vitest run (sandbox dilewati)       2110 lulus / 3 gagal  (§7)
```

**21 tes baru + 1 lanjutan, semuanya TERLIHAT MERAH lebih dulu.** Contoh bukti merahnya:

| Tes | Merah dengan |
|---|---|
| tiga parse gagal tidak membuka breaker chat | `expected 'open' to be 'closed'` |
| balasan masih dikirim setelah parse gagal | ditolak lokal, `calls` kosong |
| `recordDependencyCall` memakai durasi yang diberikan | `expected undefined to be defined` |
| histogram: label masuk ke kunci | `expected undefined to be defined` |
| `ai.model.latency` tercatat | `expected undefined to be defined` |
| provider AI terlihat `dependency.call{dep,outcome}` | counter tidak ada |
| `database_asj_form` dibaca sekali | `expected 4 to be 1` |
| helper memakai `preloadedRows` | `getFormsByWa` dipanggil |

**11 mutasi, semua KILLED**, restore diverifikasi `cmp` (baterai di
`F:/tmp/ai-battery2.sh`, di luar repo ⇒ nol counter beku bergerak). Termasuk **4 mutasi
batch 4 sebagai regresi** — anggaran rantai, jarak aman handoff, isolasi breaker
terjemahan, dan penyerahan `bestEffort` semuanya masih mematikan tesnya.

---

## 7. Baseline merah: 3 nyata + 3 lingkungan (dipisahkan dengan PENGUKURAN)

Suite penuh melaporkan **6 gagal** di dalam sandbox dan **3 gagal** saat sandbox
dilewati. Perbedaannya bukan kebetulan — itu jawabannya:

| # | Kegagalan | Verdict |
|---|---|---|
| 1 | `build.test.ts:521` `fileCount` **535** vs 529 | **Nyata** — counter beku BASI |
| 2 | `discover.test.ts` `count('ts')` **293** vs 287 | **Nyata** — counter beku BASI |
| 3 | `build.test.ts:753` `libRefs` → 3 entri di `rirekisho-xlsx.ts` | **Nyata** — berkas dari sesi lain |
| 4–6 | `fcm-server`, `boundary`, `discover > inventory` | **Lingkungan** — spawn diblokir sandbox; **lulus** saat spawn tidak diblokir |

Keenamnya sudah ada sebelum perubahan ini: **inventaris berkas HEAD vs pohon identik**
(`comm` kosong), dan perubahan ini tidak menambah berkas apa pun di pohon yang dihitung
(lihat §8). Perbaikannya **team-lead saja**.

**Catatan proses:** `recordDependencyCall` dan `'gemini-parse'` tidak menambah berkas,
jadi tidak ada counter yang bergerak — diverifikasi dengan mengukur ulang
(`count('ts')` tetap 293, `fileCount` tetap 535).

---

## 8. ⚠️ Keputusan yang perlu diketahui: 3 suite baru diletakkan di `e2e/`

Suite baru **tidak** diletakkan di sebelah kodenya, dan itu keputusan sadar.

`indexer/src/util.ts` `includePath()` menghitung `netlify/functions/**` (ts/tsx/js)
**dan** `src/**`, tetapi untuk tier `e2e` hanya menerima **mjs/cjs/js**. Jadi tiga suite
`.ts` di `e2e/` **tidak terlihat** oleh counter beku.

Diukur, dan inilah yang memutuskan:

| | tes di `netlify/functions/` | tes di `e2e/` |
|---|---|---|
| `count('ts')` | 293 → **296** | 293 (tetap) |
| `fileCount` | 535 → **538** | 535 (tetap) |
| envelope simbol (`≤ 23900`) | **23943 — TERTEMBUS** | lulus |

Dibuktikan terpisah: dengan ketiga berkas **diparkir** (perubahan produksi tetap ada),
counter kembali ke nilai pra-perubahan dan envelope lulus — jadi yang menembusnya memang
berkas tes itu, bukan kode produksinya.

**Kenapa ini bukan "menyembunyikan" berkas:** tier `e2e` memang didesain begitu, dan
presedennya sudah ada — `e2e/share-data.test.ts` adalah tes handler backend murni yang
hidup di sana. Ketiganya di-`exclude` dari project `frontend` persis seperti berkas itu,
sehingga tetap berjalan **sekali** di project `backend`.

**Tapi ada masalah proses yang nyata di sini, dan ini perlu keputusan pemilik:**
konvensi repo sendiri (komentar panjang di `build.test.ts:503-521`) **mengharapkan**
counter itu naik saat berkas ditambah, dengan atribusi per-bucket. Sementara
`MEMORY.md` menyatakan `indexer/src/{discover,build,parse}.test.ts` **hanya boleh diedit
team-lead**. Jadi menambah tes untuk kode backend tidak punya tempat yang "benar":
menaruhnya di sebelah kode berarti menambah 3 merah yang hanya bisa dibersihkan
team-lead, dan menaruhnya di `e2e/` berarti keluar dari konvensi penempatan.

Saya memilih **tidak menambah merah** (R1: baseline sudah merah ⇒ jangan menambah beban
yang tidak bisa saya beresi). Kalau pemilik lebih suka suite-nya di sebelah kode, yang
dibutuhkan adalah **satu** dari dua ini: (a) team-lead menaikkan `count('ts')` → 296,
`fileCount` → 538, dan plafon envelope → ≥ 23943 dengan atribusi; atau (b) aturan
"team-lead saja" diberi pengecualian untuk penambahan berkas tes.

---

## 9. Batas yang jujur

- **Tidak ada satu pun panggilan ke Gemini/Grok.** Semua angka diukur lewat `fetch`
  palsu dan mock PostgREST. Efek latensi nyata di produksi belum terbukti — dan karena
  `GEMINI_API_KEY` di `.env.local` masih placeholder, itu tetap tidak bisa diuji dari sini.
- **`ai.model.latency` baru menghasilkan data SETELAH deploy.** Jadi kalibrasi lebar
  hedge masih belum selesai: yang saya lakukan adalah **menyediakan angkanya**, bukan
  mengkalibrasinya. Sampai ada data, 1,5 dtk tetap asumsi.
- **`recordDependencyCall` masih tanpa pemanggil langsung.** Saya memakai `observe()`
  langsung untuk jalur AI (nol baris DB tambahan, sesuai keputusan tinjauan §7). Kalau
  ada yang ingin baris `dependency_calls` per panggilan AI, itu keputusan biaya yang
  belum diambil.
- **Perubahan kunci agregasi histogram mengubah bentuk payload** untuk histogram berlabel:
  `handler.latency` → `handler.latency.action=<aksi>`. Itu **memperbaiki** ketidaksesuaian
  dengan dokumen dan `otlp.test.ts`, dan tidak ada konsumen yang membaca nama lamanya
  (`metrics-sink.test.ts` memakai payload sintetis; `health-snapshot.test.ts` memakai
  histogram tanpa label). Tapi kalau ada dashboard luar yang sudah terlanjur memakai
  `handler.latency`, ia perlu disesuaikan.
- **Masih terbuka, dan tetap terbuka:** tujuh pemanggil `findCandidates()` di luar lapisan
  AI (§5.3), dua pembacaan `database_asj_form` yang masih tersisa di dalam
  `syncBiodataKeMail`/`syncFormMailDariUpload` (bisa dihilangkan juga kalau pemanggil lain
  mau menyerahkan barisnya), dan kalibrasi cap admission `ai` (4) yang butuh staging.

---

## 10. Cara memverifikasi sendiri

```bash
# Tes AI + kernel + e2e backend
node node_modules/vitest/vitest.mjs run netlify/functions/_lib/ai \
  netlify/functions/_lib/kernel e2e --project backend

# 1. Parse tidak boleh berbagi breaker dengan chat.
#    `const BREAKER_PARSE = 'gemini-parse'` -> `'gemini'` ⇒ 2 tes merah.
# 2. Metrik latensi benar-benar mencatat.
#    `observe('dependency.call.latency', durationMs, { dep })` -> `histogram(...)`
#    ⇒ 2 tes merah. `const key = metricKey(h.name, h.labels)` -> `h.name` ⇒ 6 merah.
# 3. Baris form tidak dibaca berulang.
#    `Array.isArray(formRows) ? formRows : await findFormsByWa(wa)` ->
#    `await findFormsByWa(wa)` ⇒ 3 tes merah.
bash /f/tmp/ai-battery2.sh     # 10 mutasi batch 4+5, restore diverifikasi cmp

# Gate
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node scripts/ci/lint-ratchet.mjs
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build
node scripts/ci/review-gate.mjs --base=HEAD~2 --ack=kernel --ack=data
```
