# Inferensi AI — Batch keempat: anggaran rantai & isolasi breaker

**Tanggal:** 2026-10-01
**Lingkup:** `netlify/functions/_lib/ai/{providers,chat}.ts` + `_lib/kernel/resilience.ts`
**Dasar:** kode `main` @ `79a095d` (batch ketiga). Setiap angka di bawah **diukur**,
bukan dihitung dari konstanta.
**Commit:** `f0e209e` (5 berkas, **belum di-push** — R19)

---

## 1. Ringkasan

Tinjauan sebelumnya (§4c P8) menyatakan satu batas **terbuka dengan jujur**:

> Grok menangani kegagalan cepat, belum timeout penuh. Menutupnya berarti
> menaikkan `TOTAL_AI_BUDGET_MS` atau **memberi `hedgedInvoke` anggaran rantai
> sendiri** — dan keduanya tidak boleh ditebak dari sini.

Batch ini menutupnya dengan cara kedua, dan menemukan **satu cacat kedua** yang
dimasukkan oleh perbaikan T7 batch pertama.

| # | Temuan | Kelas | Terukur |
|---|---|---|---|
| **T8** | `TOTAL_AI_BUDGET_MS` (9 dtk) **tidak membatasi apa pun** — ia hanya dibaca *sesudah* rantai selesai | Stabilitas | Rantai berkasus-terburuk **7.030 ms**, lalu Grok **DITOLAK** (`7030+5000 > 9000`) |
| **T9** | Auto-terjemahan `_jp` berbagi breaker & fallback dengan balasan pengguna, dan **mencuri probe `half-open`**-nya | Stabilitas | Breaker `gemini` berpindah `open` → **`closed`** karena panggilan terjemahan |

Keduanya **tidak** bisa ditemukan dengan membaca kode saja — keduanya adalah
soal *urutan waktu* dan *urutan panggilan*. Yang pertama diukur dengan `fetch`
palsu yang tidak pernah menjawab (hanya abort yang bisa mengakhirinya); yang
kedua diukur dengan memundurkan `openedAt` breaker lalu mengamati transisinya.

---

## 2. T8 — "Total anggaran AI" yang tidak menganggarkan

### Cacatnya

`hedgedInvoke` memotong **setiap** percobaan ke sisa **deadline permintaan**
(12 dtk) saja:

```ts
const budgetMs = clampBudget(opts.modelBudgetMs);   // hanya deadline 12 dtk
```

Sementara `TOTAL_AI_BUDGET_MS = 9000` hanya muncul **satu kali**, di
`shouldTryGrok()` — yaitu **setelah** rantai selesai. Jadi rantai berjalan
1,5 (hedge) + 1,5 (hedge) + 4 (timeout model terakhir) dan konstanta 9 dtk itu
baru dibaca setelahnya. Ia bernama "total okupansi AI untuk satu permintaan" dan
tidak membatasi apa pun.

Jalur **parse** lebih buruk: `PARSE_MODEL_TIMEOUT_MS = 11000` **melebihi**
`TOTAL_AI_BUDGET_MS = 9000` yang seharusnya membatasinya, dan tidak ada fallback
yang perlu disisakan di sana — jadi satu berkas bisa memegang 11 dtk dari
12 dtk deadline.

### Terukur sebelum

```
✓ rantai Gemini ... (tes baru, MERAH)  7030ms   ← expected < chatChainMs + 1200 = NaN
× SEMUA model Gemini menghabiskan waktunya → Grok TETAP dicoba
    AppError: AI_UNAVAILABLE   ← Grok ditolak: 7030 + 5000 > 9000
```

### Perbaikannya

`hedgedInvoke` menerima `chainBudgetMs` sebagai **plafon nyata**:

```ts
const chainDeadline = Date.now() + clampBudget(opts.chainBudgetMs);
...
const chainLeft = chainDeadline - Date.now();
const budgetMs = Math.min(clampBudget(opts.modelBudgetMs), chainLeft);
```

Anggaran chat kini **turunan**, bukan angka bebas:

```ts
const CHAT_CHAIN_BUDGET_MS = TOTAL_AI_BUDGET_MS - GROK_TIMEOUT_MS - FALLBACK_HANDOFF_MS;
```

### ⚠️ `FALLBACK_HANDOFF_MS` ada karena kesetaraan tanpa jarak aman GAGAL

Ini bukan angka hiasan. Percobaan pertama memakai `TOTAL - grok` **persis**
(4000 ms) dan tesnya tetap merah:

```
× SEMUA model Gemini menghabiskan waktunya → Grok TETAP dicoba
```

Sebabnya terukur: rantai berakhir pada **4.015 ms**, bukan 4.000 — abort
terakhir dan pemeriksaan `shouldTryGrok()` tidak berjalan pada milidetik yang
sama. Jadi `4015 + 5000 > 9000` dan Grok ditolak **lagi**. Cacat aslinya
(`4000` dibanding `4000`) berpindah tempat, bukan hilang. 250 ms ≈ 16× jitter
terukur.

### Terukur sesudah

```
✓ rantai Gemini berhenti di anggaran rantai   4010ms   (dari 7030ms)
✓ SEMUA model Gemini menghabiskan waktunya → Grok TETAP dicoba
```

**Pertukaran yang disengaja, dinyatakan apa adanya:** di kasus semua-model-
menggantung, latensi terburuk naik dari ~7 dtk menjadi ~9 dtk. Tapi keluarannya
berubah dari **pasti gagal** menjadi **punya peluang nyata berhasil** lewat
Grok — dan 9 dtk itu adalah angka yang sudah didokumentasikan
`TOTAL_AI_BUDGET_MS` sejak awal. Yang dibayar adalah 2 dtk tunggu; yang dibeli
adalah provider cadangan yang benar-benar menyala.

---

## 3. T9 — Terjemahan latar mencuri probe breaker milik balasan pengguna

### Cacatnya

Perbaikan T7 menjalankan auto-terjemahan `_jp` **paralel** dengan balasan chat —
itu benar untuk latensi. Tapi:

```ts
const translation = autoTranslateMissingJp(currentData).catch(() => {});
const r = await geminiGenerate(system, history);
```

`autoTranslateMissingJp` dipanggil **lebih dulu**, dan `geminiGenerate` memanggil
`breaker.check('gemini')` **secara sinkron** sebelum await pertamanya. Karena
keduanya memakai kunci breaker yang sama, urutan yang benar-benar terjadi adalah
**terjemahan → balasan**.

Akibatnya, saat breaker `gemini` sudah `open` melewati `coolDownMs` (30 dtk),
`check()` memindahkan breaker ke `half-open` dan mengizinkan **satu** probe —
untuk **terjemahan**. Panggilan kedua untuk dependency yang sama langsung ditolak
`SERVICE_UNAVAILABLE` ("Circuit breaker probing"). Jadi:

> **Balasan yang sedang ditunggu pengguna GAGAL, padahal providernya sehat** —
> karena pekerjaan latar yang bisa disusulkan giliran berikutnya mengambil
> satu-satunya slot probe.

Dan karena satu giliran menghasilkan **dua** hasil breaker, satu giliran yang
gagal menyumbang **dua** kegagalan pada ambang 3: pengguna berjaringan buruk
membuka breaker dua kali lebih cepat. Itu amplifikasi T1 yang dimasukkan kembali
oleh perbaikan T7 — kelas cacat yang sama, sepuluh baris di bawah perbaikannya.

### Terukur sebelum

```
× tidak bisa mencuri probe half-open milik balasan pengguna
    AssertionError: expected 'closed' to be 'open'
```

Breaker `gemini` **ditutup** oleh panggilan terjemahan. Probe itu memang
diambilnya.

### Perbaikannya

Panggilan latar ditandai `bestEffort`, dan `providers.ts` memutuskan ketiga
halnya sekaligus (dipisah akan salah):

| Aspek | Balasan pengguna | Terjemahan latar |
|---|---|---|
| Kunci breaker | `gemini` | **`gemini-translate`** (baru, ambang sama) |
| Fallback Grok | ya | **tidak** — kuota cadangan disisakan untuk balasan |
| Hedge | 1,5 dtk | **tidak pernah** — tidak mengejar latensi |
| Anggaran rantai | 3.750 ms | **3.000 ms** |

Yang ketiga dan keempat juga menjawab cacat latensi: karena `await translation`
membuat waktu balas ditentukan oleh yang **lebih lambat** dari dua panggilan,
terjemahan tanpa anggaran sendiri bisa memakai seluruh jendela Grok (9 dtk)
hanya untuk menerjemahkan beberapa field. Sekarang batasnya 3 dtk.

---

## 4. Berkas yang berubah

| Berkas | Perubahan |
|---|---|
| `_lib/ai/providers.ts` | `HedgeOpts.chainBudgetMs` (plafon nyata) · `hedgeAfterMs` opsional (`undefined` = jangan hedge) · `AiCallOpts.bestEffort` · `GROK_TIMEOUT_MS`/`FALLBACK_HANDOFF_MS` bernama · `CHAT_CHAIN_BUDGET_MS` **turunan** · parse dibatasi `TOTAL_AI_BUDGET_MS` |
| `_lib/ai/chat.ts` | Terjemahan memanggil `geminiGenerate(prompt, [], { bestEffort: true })` |
| `_lib/kernel/resilience.ts` | `'gemini-translate'` terdaftar (ambang 3, sama dengan `gemini`) |
| `_lib/ai/providers.hedge.test.ts` | +7 tes |
| `_lib/ai/chat.payload-contract.test.ts` | +1 tes |

Perilaku yang **tidak** berubah: pemilihan model & urutannya, `trimTrailingModelTurn`,
`parseJsonLoose`, klasifikasi `AI_UNAVAILABLE` (kode + `retryAfter`), gate
VIP/KELAS, cap riwayat, dan bentuk balasan `{reply}` / `{reply, data}`.

`gemini-translate` otomatis muncul di `/health` karena `health.ts:253`
meng-enumerasi `DEPENDENCY_CONFIGS` — jadi terjemahan yang sakit sekarang
**terlihat**, bukan diam-diam.

---

## 5. Gate

```
tsc --noEmit                 exit 0
node scripts/ci/lint-ratchet.mjs   LINT RATCHET PASSED
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build   exit 0
  11 page(s) built · [sw-manifest] asj-astro-a8bb0c2dac27
  (bukan 'asj-astro-dev' — build benar-benar selesai)
vitest run                   2085 lulus / 6 gagal  (lihat §6)
```

### Tujuh tes baru — semuanya TERLIHAT MERAH lebih dulu

Bukan "tes ditambahkan", tapi tes yang **diamati gagal** sebelum perbaikan:

| Tes | Merah dengan |
|---|---|
| rantai Gemini berhenti di anggaran rantai | `7030ms`, `expected < NaN` |
| semua model Gemini menggantung → Grok tetap dicoba | `AppError: AI_UNAVAILABLE` |
| anggaran rantai + Grok + handoff = TOTAL | `NaN to be 9000` |
| kegagalan terjemahan dicatat di breaker sendiri | breaker bersama |
| terjemahan tidak memakai fallback Grok | `promise resolved {reply:'grok'}` |
| terjemahan tidak mencuri probe half-open | `expected 'closed' to be 'open'` |
| chat: terjemahan ditandai `bestEffort` | `expected undefined to match object` |

### Empat mutasi, semua KILLED (restore terverifikasi `cmp`)

| Mutasi | Hasil |
|---|---|
| M-A hapus potongan `chainLeft` di `launch()` | **KILLED** — 2 tes |
| M-B `FALLBACK_HANDOFF_MS = 0` | **KILLED** — 1 tes |
| M-C `breakerKey` selalu `gemini` | **KILLED** — 2 tes |
| M-D `chat.ts` membuang `{ bestEffort: true }` | **KILLED** — 1 tes |

M-B penting: ia membuktikan margin 250 ms itu **load-bearing**, bukan hiasan.
Baterai dijalankan dari `F:/tmp/ai-battery.sh` (di luar repo) supaya tidak
menggerakkan satu pun counter beku (R13e/R13f).

---

## 6. ⚠️ Baseline merah yang SUDAH ADA — enam gagal, semuanya di luar perubahan ini

`vitest run` penuh: **2085 lulus / 6 gagal**. Keenamnya **sudah merah sebelum
perubahan ini**, dan masing-masing punya verdict sendiri (R13: sinyal nyata tidak
menjadi "lingkungan" karena ada sinyal berisik di sebelahnya).

### 6a. Empat = counter beku yang BASI (bukan milik saya, dan bukan milik sesi ini)

```
discover.test.ts > inventory matches git ls-files   expected 535 to be 529
discover.test.ts > counts match the measured profile expected 293 to be 287
build.test.ts:521 > indexes the measured inventory   expected 535 to be 529
build.test.ts:753 > reports occurrences, unresolved  expected [ …(3) ] to deeply equal []
```

Dibuktikan **bukan** akibat perubahan ini, dengan pengukuran — bukan alasan:

```bash
git ls-tree -r --name-only HEAD | grep -E '\.(ts|tsx|astro|mjs|cjs|js)$' | sort > head.txt
git ls-files --cached --others --exclude-standard | grep -E '\.(ts|tsx|astro|mjs|cjs|js)$' | sort > tree.txt
comm -3 head.txt tree.txt      # KOSONG
# HEAD=577 TREE=577  — nol berkas ditambah, nol berkas dihapus
```

Counter beku menghitung **berkas**, dan inventaris berkas **identik dengan HEAD**,
sedangkan perubahan ini hanya menyentuh **isi** 5 berkas yang sudah ada. Jadi
selisih +6 berkas dan +6 `.ts` itu **sudah ada di HEAD**.

Tiga `libRefs` yang tak terpecahkan juga menunjuk berkas yang **tidak saya
sentuh**: `src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts:276/320`
(`createImageBitmap`, `BlobPart`) — dari sesi template CV Excel (`2982cf1`).

> **Tidak saya perbaiki, dan itu keputusan sadar.** Konvensi repo ini
> (`MEMORY.md` §Gate) menyebut: *"Hanya team-lead edit
> `indexer/src/{discover,build,parse}.test.ts`"*. R1a juga melarang menaikkan
> angka beku dengan cara membaca balik angka "expected" dari kegagalan — itu
> hanya membekukan apa pun yang kebetulan ada di pohon. **Yang perlu: team-lead
> mengukur ulang dan menaikkan ketiga angka itu satu per satu** (dua di antaranya
> berbagi satu `it()`, jadi vitest hanya melaporkan yang pertama).

### 6b. Dua = spawn diblokir sandbox (dibuktikan dengan menjalankannya TANPA vitest)

```
boundary.test.ts     depcruise oracle ... (exit null): expected null to be +0
fcm-server.test.ts   the .gitignore rule ...  expected false to be true
```

`exit null` = anak dibunuh, bukan "ada pelanggaran". Dan untuk `fcm-server`,
ketiga assertion-nya **saya jalankan sendiri di shell**:

```bash
git check-ignore -q .../firebase-service-account.json          # exit 0  -> diabaikan   ✓
git check-ignore -q .../firebase-service-account.example.json  # exit 1  -> TIDAK        ✓
git check-ignore -q .../secrets/README.md                      # exit 1  -> TIDAK        ✓
```

Ketiganya **persis** seperti yang dituntut tes. Yang gagal hanya `execFileSync`
di dalam vitest (spawn diblokir sandbox) — jadi tesnya membaca "tidak
diabaikan" untuk berkas yang sebenarnya diabaikan. Lingkungan, terverifikasi,
bukan ditebak.

**Catatan jujur soal proses:** baseline suite penuh **tidak** saya ukur sebelum
mulai; saya hanya mengukur baseline `_lib/ai` + `_lib/kernel` (229 lulus, hijau).
Enam merah di atas karena itu baru terlihat di akhir, dan harus diatribusikan
**setelah** perubahan sudah dibuat — urutan yang lebih mahal daripada R1
sesungguhnya. Tidak ada satu pun dari keenamnya yang berasal dari perubahan ini,
tapi biayanya nyata.

---

## 7. Batas yang jujur

- **Tidak ada satu pun panggilan ke Gemini/Grok.** Semua angka di atas diukur
  lewat `fetch` palsu: jumlah panggilan, sinyal yang di-abort, status breaker,
  dan durasi terhadap anggaran. Efek latensi **nyata** di produksi belum
  terbukti — sama seperti batch sebelumnya, dan karena `GEMINI_API_KEY` di
  `.env.local` masih placeholder (§4c P12), itu tidak bisa diuji dari sini.
- **Kalibrasi lebar hedge masih belum terukur.** `ai.hedge.fired` sudah ada sejak
  P6, tapi belum ada data produksi. Kalau model lite melambat melewati 1,5 dtk,
  hedge mulai ditembak dan amplifikasinya naik ke 2× — masih di bawah 3× dari
  `Promise.any`, tapi bukan nol.
- **`await translation` masih membatasi waktu balas.** Perbaikannya adalah
  mengecilkan anggarannya (9 dtk → 3 dtk), **bukan** berhenti menunggu. Balasan
  karena itu masih menunggu `max(chat, terjemahan)`. Berhenti menunggu berarti
  respons bisa kehilangan `_jp` pada giliran itu — keputusan produk, bukan
  keputusan performa, jadi tidak saya ambil sendiri.
- **`dependency_calls` masih tidak mencatat panggilan Gemini** (sengaja: satu
  baris PostgREST per model yang di-hedge akan menambah beban DB di jalur
  terpanas). Jadi masih tidak ada data historis latensi per model.
- **Belum diperbaiki, dan tetap terbuka:** tujuh pemanggil `findCandidates()`
  di luar lapisan AI (§5.3), ~13 round-trip di `handleSubmitDataAsj` (§5.2), dan
  kalibrasi cap admission `ai` (4) yang butuh staging.

---

## 8. Cara memverifikasi sendiri

```bash
# Tes AI (50 tes, tanpa jaringan)
node node_modules/vitest/vitest.mjs run netlify/functions/_lib/ai --project backend

# 1. Anggaran rantai MENGIKAT, dan Grok menyala di kasus terburuk.
#    Kembalikan `Math.min(clampBudget(...), chainLeft)` menjadi `clampBudget(...)`
#    -> dua tes merah, dan rantai kembali ke ~7 dtk.
# 2. Jarak aman handoff itu load-bearing.
#    `FALLBACK_HANDOFF_MS = 0` -> satu tes merah.
# 3. Terjemahan terisolasi.
#    Buang `{ bestEffort: true }` di chat.ts -> satu tes merah.
bash /f/tmp/ai-battery.sh          # keempat mutasi di atas, restore diverifikasi cmp

# Gate
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node scripts/ci/lint-ratchet.mjs
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build && grep -o 'asj-astro-[a-f0-9]*' dist/sw.js
```
