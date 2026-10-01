# Tinjauan & Optimasi Inferensi AI — ASJ Portal v2

**Tanggal:** 2026-10-01
**Lingkup:** seluruh jalur AI di `netlify/functions/_lib/ai/**` + `surfaces/ai.ts`
**Dasar:** kode `main` @ `5c6f93b` (setiap klaim di bawah diverifikasi ke kode, bukan dari dokumen)
**Status tes saat mulai:** 781 lulus / 1 gagal (`_lib/fcm-server.test.ts` — pemeriksaan aturan `.gitignore`, **bukan** jalur AI, sudah merah sebelum perubahan apa pun)

---

## 1. Ringkasan

Ada **tujuh** cacat nyata di lapisan inferensi AI. Empat di antaranya adalah cacat
**stabilitas produksi** — bukan sekadar "kurang cepat":

| # | Temuan | Kelas | Dampak |
|---|---|---|---|
| T1 | Satu giliran chat yang gagal mencatat **3 kegagalan breaker**; ambang breaker `gemini` = **3** | Stabilitas | **Satu** pengguna yang apes membuka breaker → **seluruh** fitur AI mati 30 dtk untuk semua orang |
| T2 | `Promise.any` menembak **3 model sekaligus** di setiap giliran | Biaya + stabilitas | 3× kuota provider & 3 socket per permintaan; cap tier `ai` = 4 → satu instance bisa memegang 12 koneksi keluar |
| T3 | Timeout AI dipakai apa adanya (`AbortSignal.timeout`), **tanpa `clampBudget()`** | Stabilitas | Panggilan AI bisa hidup lebih lama daripada permintaan yang menunggunya → slot fungsi tertahan untuk klien yang sudah pergi |
| T4 | Timeout parse dokumen **4 dtk**, dipakai bersama chat | Fungsional | Setiap parse PDF/Excel sungguhan hampir pasti timeout sebelum model selesai membaca → fitur tampak "AI tidak bisa ekstrak" padahal anggarannya yang salah |
| T5 | Penjaga fallback Grok **tidak pernah bisa benar** (`4000 < 4000`), dan timeout Grok (10 dtk) **melebihi** anggaran yang dipakai membandingkannya (9 dtk) | Fungsional | Fallback provider kedua praktis mati di kasus yang paling membutuhkannya — **sebagian** diperbaiki, sisa batasnya dijelaskan di §3 T5 dan §4c P8 |
| T6 | Riwayat percakapan **tanpa batas di server** (3 handler) | Biaya + latensi | Prompt membengkak tiap giliran; akhirnya ditolak karena melewati jendela konteks |
| T7 | Auto-terjemahan `_jp` dijalankan **berurutan setelah** balasan chat | Latensi | p100 = 4 dtk + 4 dtk = 8 dtk dari deadline 12 dtk, padahal keduanya tidak saling bergantung |

**T1–T3 diperbaiki di `providers.ts`; T6–T7 di `chat.ts`; T4 ikut diperbaiki di
`providers.ts` (anggaran parse dipisah).** T5 ikut diperbaiki. Sisa temuan lain
(bagian 5) sengaja **tidak** diubah, dengan alasan yang ditulis eksplisit.

**Batch kedua (§4b)** menutup empat dari lima item yang ditahan itu, dan
menemukan **satu cacat kritis tambahan**: penjaga ukuran unggah parse dokumen
(8 MiB) berada **di atas** batas body 6 MB platform, sehingga tidak pernah bisa
diekeskusi. Termasuk juga: transkrip wawancara dibatasi, degradasi lookup
kandidat dibuat berisik, `grok` masuk `/health`, observabilitas hedge, dan
kontrak balasan chat diseragamkan.

**Verifikasi:** 43 tes di folder AI (**31 di antaranya baru di sesi ini**) plus
2 tes frontend baru di `AdminAiCopilot.test.tsx`; **enam mutasi** dijalankan
untuk membuktikan tesnya bisa merah (1, 5, 2, 2, 1, 1 tes merah). Suite penuh:
**1861 lulus / 1 gagal** — gagal itu (`fcm-server.test.ts`, aturan `.gitignore`)
sama persis dengan baseline. Typecheck bersih, lint ratchet lulus.

---

## 2. Inventaris permukaan AI

Semua masuk lewat **satu** entry point `netlify/functions/ai-chat.js` → `surfaces/ai.ts`,
dan semuanya berbagi satu lapisan provider (`_lib/ai/providers.ts`).

| Permukaan | Handler | Jenis panggilan |
|---|---|---|
| **CV AI** (Qween Jeklin, kandidat VIP/admin) | `handleProcessAIChat` | chat + **terjemahan `_jp` kedua** |
| **HRD AI / copilot admin** (Jeklin) | `handleProcessAdminAIChat` | chat |
| **AI siswa baru** (Dede Jeklin) | `handleProcessSiswaAIChat` | chat |
| **Simulator wawancara** (mensetsu) | `handleProcessAiInterview` | chat (sudah pakai `lastHistory`) |
| **Rangkuman hasil wawancara** | `handleSelesaikanWawancara` | chat (transkrip penuh di system prompt) |
| **Model wawancara admin** | `handleGenerateWawancaraModel` | generasi dokumen |
| **Parse dokumen biodata** | `handleParseDokumenBiodata` (`classify.ts`) | **file → Gemini** (PDF/Excel/Word/gambar, ≤ 8 MB) |
| Simpan CV AI / tanda tangan | `handleSubmitDataAsj`, `handleSimpanDataTtdNaitei` | **tanpa AI** (murni tulis DB) |

Kendali yang **sudah** ada dan bekerja (tidak diubah): rate limit AI 10/menit per
identitas + 60/menit per IP (`handlers.ts:112`), admission tier `ai` cap 4
(`admission.ts:225`), breaker per-dependency (`resilience.ts:301`), deadline
permintaan 12 dtk (`deadline.ts:49`), gate VIP/KELAS di server (`chat.ts:211`),
dan sesi wajib untuk semua alur (`chat.ts:198`).

---

## 3. Temuan rinci

### T1 — Amplifikasi breaker: satu kegagalan menjadi outage (KRITIS)

`providers.ts:45,64,67` (HEAD) — `fetchGemini` memanggil `breaker.check/success/failure`
**per model**. Karena `geminiGenerate` menembak tiga model, satu giliran chat yang
gagal mencatat **tiga** kegagalan. `resilience.ts:303` menetapkan ambang `gemini`
= **3** dalam jendela 60 dtk.

Akibatnya: **satu** giliran gagal → breaker `open` → `check()` menolak **semua**
panggilan AI berikutnya selama `coolDownMs` = **30 dtk**. Satu pengguna dengan
jaringan buruk mematikan CV AI, HRD AI, simulator wawancara, dan parse dokumen
untuk seluruh pengguna. Semantik ambang itu dirancang untuk "satu panggilan = satu
sinyal", dan race 3 model melanggarnya.

**Diperbaiki:** hasil breaker sekarang dimiliki **panggilan logis**
(`geminiGenerate`/`geminiParseFile`), bukan model. Penolakan `check()` juga tidak
lagi dicatat sebagai kegagalan baru — mencatatnya hanya memperpanjang outage tanpa
menambah informasi.

### T2 — Race "tembak semua model": 3× kuota & 3× socket (TINGGI)

`providers.ts:156,189` (HEAD) — `Promise.any(MODELS.map(...))`. Tiga hal yang
dibayar:

1. **Kuota** — 3 permintaan provider untuk **setiap** giliran, termasuk yang model
   pertamanya sudah menjawab dalam 0,6 dtk.
2. **Socket** — cap tier `ai` adalah 4 permintaan (`admission.ts:225`), jadi satu
   instance bisa memegang **12** koneksi keluar hanya dari 4 percakapan. Itu
   kebalikan dari alasan cap tersebut ada.
3. **Pecundang tidak dibatalkan** — `AbortSignal.timeout()` tidak bisa dibatalkan,
   jadi dua model yang kalah tetap hidup sampai timeout-nya sendiri habis,
   menahan socket dan membakar kuota tanpa siapa pun menunggu jawabannya.

**Diperbaiki:** `hedgedInvoke` — model utama diberi jendela sendiri (1,5 dtk untuk
chat; model lite yang di-pin menjawab 0,6–1,3 dtk, jadi hedge **normalnya tidak
pernah ditembakkan**). Model berikutnya hanya ditembak kalau yang aktif belum
menjawab, dan **semua yang masih jalan dibatalkan** begitu ada yang menang.
Model yang gagal **cepat** tidak menunggu hedge delay — langsung lanjut.

### T3 — Panggilan AI tidak terikat deadline permintaan (TINGGI)

`providers.ts:60,110` (HEAD) memakai `AbortSignal.timeout(MODEL_TIMEOUT_MS)` apa
adanya. `kernel/deadline.ts` ada justru untuk mencegah anggaran per-dependency
saling menjumlah melewati deadline, dan `kernel/http.ts` sudah menerapkannya ke
PostgREST/Storage/Fonnte/FCM — tapi **tidak** ke jalur AI, yang justru panggilan
terpanjang di seluruh sistem.

**Diperbaiki:** setiap percobaan model memakai `clampBudget(...)`, dan percobaan
yang tidak punya sisa waktu ditolak **lokal** (`DEADLINE_EXCEEDED`) alih-alih
dikirim lalu menahan slot.

### T4 — Anggaran parse dokumen = anggaran chat (TINGGI, fungsional)

`providers.ts:13` — satu konstanta `MODEL_TIMEOUT_MS = 4000` dipakai oleh chat
**dan** `geminiParseFile`. `classify.ts:15` mengizinkan berkas sampai **8 MB**
(base64 ≈ 10,7 MB) yang harus diunggah lalu dibaca model. Membaca PDF 8 MB dalam
4 detik tidak realistis.

Gejalanya menyesatkan: `classify.ts:116` melaporkan *"AI tidak bisa mengekstrak
data dari file ini. Coba file lain."* — pesan yang menyalahkan berkasnya, padahal
anggarannya yang tidak cukup.

**Diperbaiki:** anggaran parse dipisah (`PARSE_MODEL_TIMEOUT_MS = 11000`, tetap
dipotong ke sisa deadline) dan hedge-nya diperlonggar (50% anggaran, bukan 1,5 dtk
tetap) supaya satu berkas lambat tidak otomatis menembak ketiga model.

### T5 — Fallback Grok tidak terjangkau (SEDANG, fungsional)

`providers.ts:163` (HEAD): `if (elapsed < TOTAL_AI_BUDGET_MS - 5000)` → `4000 < 4000`
= **salah**. Begitu Gemini menghabiskan timeout 4 dtk-nya (kasus paling mungkin),
Grok **tidak pernah dicoba**. Dan di kasus gagal-cepat — satu-satunya kasus yang
lolos — `GROK_TIMEOUT_MS = 10000` (`:88`) justru **melebihi** `TOTAL_AI_BUDGET_MS = 9000`
yang dipakai membandingkannya, jadi batasnya sendiri tidak koheren.

**Diperbaiki:** satu sumber angka (`AI_BUDGETS`), timeout Grok **5 dtk**, dan
penjaganya sekaligus memeriksa sisa deadline. Angka 5 dtk bukan pilihan baru:
komentar di kepala berkas yang sama (`providers.ts:14-17`, HEAD) sudah menulis
*"Gemini race (4s) + Grok fallback (5s) = 9s worst case"* — jadi konstanta 10 dtk
itu bertentangan dengan anggaran yang didokumentasikan sendiri dua baris di
atasnya.

> **⚠️ KOREKSI (batch ketiga, §4c P8) — klaim di atas BENAR tapi belum tuntas.**
> Batch pertama mengganti bentuknya menjadi `elapsed + grokBudget <= TOTAL`, yang
> memang **memperbaiki titik 4000** (kini `4000 + 5000 ≤ 9000` → Grok dicoba,
> dulu `4000 < 4000` → tidak). Tapi batas atasnya tetap sama: dengan hedge, rantai
> Gemini berkasus-terburuk **~7 dtk** (1,5 + 1,5 + 4), sedangkan jendela Grok
> hanya `TOTAL_AI_BUDGET_MS - GROK_TIMEOUT_MS` = **4 dtk**. Jadi Grok menangani
> **kegagalan cepat**, belum timeout penuh. Menutup itu berarti mengubah salah
> satu dari dua angka — keputusan kalibrasi yang butuh provider sungguhan.
> Batas itu sekarang **dipin tes** supaya tidak bisa berubah tanpa suara.

### T6 — Riwayat tanpa batas di server (SEDANG)

`chat.ts:247,318,349` (HEAD) membaca riwayat mentah. Frontend memang sudah
mengirim `.slice(-20)` (`AiCvForm.tsx:463`, `AdminAiCopilot.tsx:144`,
`SiswaBaruForm.tsx:194`), tapi itu
**janji klien** — dan `handleProcessAiInterview` (`chat.ts:551`) sudah memakai
`lastHistory` sejak perbaikan A16. Jadi aturannya berbeda-beda per alur, dan satu
klien lain (atau pemanggilan langsung ke surface) bisa mengirim riwayat sepanjang
apa pun: prompt membengkak setiap giliran, latensi dan biaya token naik, dan
akhirnya permintaan ditolak karena melewati jendela konteks.

**Diperbaiki:** `lastHistory()` diterapkan di server pada ketiga handler. Untuk
`handleProcessAdminAIChat`, cap diterapkan **sebelum** giliran baru disisipkan
supaya pesan yang baru diketik admin tidak pernah ikut terpotong.

### T7 — Auto-terjemahan berurutan (SEDANG, latensi)

`chat.ts:285` (HEAD) — `await autoTranslateMissingJp(currentData)` dijalankan
**setelah** `geminiGenerate` selesai. Prompt terjemahan dibangun dari
`currentData`, **bukan** dari jawaban model: keduanya tidak saling bergantung,
tapi latensinya dijumlahkan. Di jalur terburuk 4 + 4 = 8 dtk dari deadline 12 dtk,
menyisakan ~4 dtk untuk rate limit, persistensi, dan penyusunan respons.

**Diperbaiki:** keduanya berjalan **paralel**. `autoTranslateMissingJp` sudah
menangkap error-nya sendiri dan tidak memanggil provider sama sekali kalau tidak
ada field `_jp` yang kosong, jadi tidak ada panggilan AI tambahan yang sia-sia.

---

## 4. Perubahan yang dilakukan

### `netlify/functions/_lib/ai/providers.ts` (ditulis ulang sebagian)

| Perubahan | Menjawab |
|---|---|
| `hedgedInvoke()` — model berurutan dengan hedge, pecundang dibatalkan | T2 |
| Satu hasil breaker per panggilan logis; `check()` yang menolak tidak dicatat sebagai kegagalan | T1 |
| `clampBudget()` pada setiap percobaan model | T3 |
| `PARSE_MODEL_TIMEOUT_MS = 11000` + hedge 50% untuk parse | T4 |
| Anggaran Grok 5 dtk + penjaga yang bisa benar (`elapsed < 4000` **dan** sisa deadline cukup) | T5 |
| Jawaban **kosong** dihitung gagal → model berikutnya dapat giliran | (baru) |
| `AI_BUDGETS` diekspor sebagai satu sumber angka | — |

Perilaku yang **tidak** berubah: pemilihan model & urutannya, gate VIP/KELAS,
bentuk balasan `{reply}` / `{reply, data}`, penanganan `parseJsonLoose`, dan
klasifikasi error `AI_UNAVAILABLE` (kode + `retryAfter` tetap sama, sehingga
banner `AiUnavailableBanner` dan tombol coba-lagi tetap bekerja).

### `netlify/functions/_lib/ai/chat.ts`

| Perubahan | Menjawab |
|---|---|
| `lastHistory()` di server untuk `handleProcessAIChat`, `handleProcessAdminAIChat`, `handleProcessSiswaAIChat` | T6 |
| Auto-terjemahan dijalankan paralel dengan balasan chat | T7 |

### `netlify/functions/_lib/ai/providers.hedge.test.ts` (baru — 18 tes; 10 di batch pertama, 4 di §4b, 4 di §4c)

Memakai `fetch` palsu — tidak menyentuh jaringan. Yang dipin:

- model pertama cepat → **tepat satu** panggilan provider;
- model utama menggantung → hedge menembak model kedua, **dan sinyal model pertama `aborted`**;
- jawaban kosong → model berikutnya dicoba;
- satu giliran gagal → breaker **tetap `closed`**; tiga giliran gagal → **`open`** (proteksi tidak hilang);
- breaker `open` → **nol** panggilan provider, outage tidak diperpanjang;
- deadline lewat → provider **tidak dipanggil sama sekali**;
- deadline 300 ms → hanya **satu** model dikirim, sisanya ditolak lokal, selesai < 2 dtk;
- anggaran parse > anggaran chat (regresi langsung terhadap `4000`);
- parse 2 dtk → **satu** panggilan (hedge-nya memang lebih longgar).

**Bukti tesnya bisa merah** (bukan sekadar hijau):

| Mutasi | Hasil |
|---|---|
| Kembalikan penghitungan breaker per-model (3× `failure()`) | **1 tes merah** — `satu giliran chat yang gagal TIDAK membuka breaker` |
| Kembalikan race `Promise.any` | **5 tes merah** — termasuk `TEPAT SATU panggilan provider` dan `jawaban KOSONG dihitung gagal` |

---

## 4b. Batch kedua — polish & perbaikan lanjutan

Dikerjakan setelah tinjauan awal, atas permintaan pemilik ("lanjut polish dan fix
apa saja yg bisa di fix di system ai"). Semua diverifikasi dengan cara yang sama:
tes baru + mutasi yang dibuktikan bisa merah.

### P1 — Penjaga ukuran unggah parse dokumen TIDAK PERNAH BISA DIEKSEKUSI (KRITIS)

`classify.ts:15` (HEAD) menetapkan `PARSE_MAX_BYTES = 8 * 1024 * 1024`, dan
memeriksanya terhadap `Buffer.from(data, 'base64').length`. Masalahnya: berkas
dikirim sebagai **base64 di dalam body JSON** (`AdminAiCopilot.handleParse` →
`file.data`), sehingga 8 MiB menjadi ~10,7 MiB — **di atas batas body 6 MB
Netlify Functions** (diwarisi dari batas payload invokasi sinkron AWS Lambda;
dikonfirmasi ke dua sumber independen, karena halaman "Functions overview"
Netlify sendiri tidak mencantumkannya).

Konsekuensinya berlapis:

1. Platform menolak permintaan **sebelum handler jalan** → penjaga ukuran, cek
   MIME, rate limit, admission, dan deadline semuanya dilewati.
2. Klien melihat kegagalan jaringan generik — **bukan** pesan
   *"File terlalu besar (maks 8 MB)"* yang ditulis khusus untuk kasus ini.
3. Batas yang diumumkan **1,8× lebih tinggi** daripada yang bisa platform
   antarkan, jadi setiap berkas 4,5–8 MB pasti gagal tanpa penjelasan.

**Diperbaiki:** `PARSE_MAX_BYTES = 4 MiB`, dengan aritmetika base64 (`n × 4/3`)
ditulis di kode. 4 MiB → 5,59 MB terpakai dari 6,29 MB (~11% ruang), dan pesan
errornya kini **diturunkan dari konstanta** sehingga tidak bisa lagi menyimpang.

Yang penting: batas ini juga **menutup lubangnya sepenuhnya** — karena penjaga
sekarang berada di bawah ambang platform, tidak ada berkas yang lolos penjaga
lalu ditolak platform. Klien tidak perlu tahu angkanya.

**Gate:** `classify.limits.test.ts` (3 tes) menegakkan **invarian**-nya, bukan
angkanya: base64 dari batas yang diumumkan harus muat di body platform *dengan*
amplop JSON dan *dengan* ruang. Mutasi (kembalikan 8 MiB) → **2 tes merah**.

### P2 — Transkrip wawancara tanpa batas (§5.1)

`handleSelesaikanWawancara` menempelkan **seluruh** transkrip ke system prompt.
Sekarang dibatasi jendela **kepala + ekor** (4.000 + 8.000 karakter) lewat
`boundTranscript()`:

- kepala dipertahankan karena berisi jikoshoukai dan biodata (nama, TTL,
  pendidikan, pengalaman) — yang justru paling sering masuk ke `biodata` di
  hasil rangkuman;
- ekor dipertahankan karena berisi jawaban terbaru;
- yang dibuang hanya bagian tengah, dan pembuangannya **ditandai di dalam
  prompt** — tanpa penanda, model akan menyangka wawancaranya memang sependek
  itu dan merangkum seolah tidak ada yang hilang.

**Gate:** 3 tes di `chat.test.ts`. Termasuk bahwa kepala dan ekor sama-sama
selamat — inilah yang membedakannya dari cap per giliran.

### P3 — Degradasi lookup kandidat dibuat BERISIK (§5.3)

`findCandidates()` mengembalikan `{ rows: [] }` tanpa syarat, jadi tujuh cabang
"fallback" di lapisan AI tidak pernah bisa menemukan apa pun. Kegagalannya
senyap: dengan skema bergeser, Jeklin kehilangan seluruh blok
`DATA KANDIDAT SAAT INI`, gate VIP/KELAS membaca catatan kosong, dan wawancara
jatuh ke `BIDANG_DEFAULT` — semuanya sambil tetap menjawab normal.

**Diperbaiki** dengan dua helper di `cv.ts`, `findCandidateByWaOrNull()` dan
`findCandidateByIdOrNull()`, yang membedakan tiga hasil lookup
(`row` / `null` = tidak ada / `undefined` = lookup tidak bisa jalan) dan
mencatat `ai.candidate-lookup-unavailable` untuk yang ketiga. Nomor WA di-hash
(`hashPii`) — nomor kandidat tidak boleh masuk log mentah. Ketujuh call site di
`chat.ts`, `cv.ts`, dan `classify.ts` sekarang memakainya.

Yang **tidak** dilakukan, dengan sengaja: mengaktifkan `findAllCandidatesLight()`
sebagai fallback nyata. Itu keyset penuh atas SELURUH kandidat, dan akan mengubah
cabang yang sekarang gratis menjadi table scan di jalur AI yang panas — keputusan
sadar, bukan efek samping. Stub-nya sekarang didokumentasikan panjang di
`candidates.ts` beserta daftar 10 pemanggil yang belum diperbaiki.

**Gate:** `cv.lookup.test.ts` (7 tes). Termasuk: `null` tidak berisik (kalau
tidak, peringatannya jadi tidak berguna), `undefined` berisik, WA di-hash, dan
error transport sungguhan **tetap naik** ke pemanggil. Mutasi (hapus peringatan)
→ **2 tes merah**.

### P4 — ~2 round-trip berurutan di jalur simpan CV AI (§5.2)

`handleSubmitDataAsj` menyelesaikan baris `database_candidate` yang **sama** dua
kali, lalu menulis **dua PATCH** ke baris itu untuk kolom yang tidak beririsan.
Sekarang: satu baca, satu tulis.

Isolasi kegagalan tidak hilang — keduanya menargetkan baris yang sama dengan
filter yang sama, jadi kegagalan PATCH hampir pasti soal baris/tabelnya, bukan
kolomnya; dan yang hilang hanyalah kemungkinan "satu kolom tersimpan, satu
tidak", yang justru lebih buruk daripada gagal utuh.

Yang **sengaja tidak** di-cache: dua pembacaan `database_asj_form`.
`syncBiodataKeMail` berjalan di antaranya dan **bisa membuat** baris itu, jadi
pembacaan kedua memang harus benar-benar membaca — cache akan mengubah keputusan
`hasMail` dan bisa memicu `syncFormMailDariUpload` untuk baris yang sudah ada.

### P5 — `grok` tidak pernah muncul di `/health` (§5.5)

`fetchGrok` sudah lama memanggil `breaker.check/failure/success('grok')`, tapi
`grok` tidak terdaftar di `DEPENDENCY_CONFIGS` — jadi ia memakai ambang default
**dan** tidak ikut ter-enumerasi `snapshot()`. Satu-satunya provider fallback di
sistem ini tidak muncul di laporan kesehatan sama sekali.

**Diperbaiki:** `grok` terdaftar dengan ambang yang sama dengan `gemini`
(keduanya melayani permintaan yang sama; kegagalannya sama-sama berarti "AI
sedang tidak bisa menjawab"). `health.ts:253` meng-enumerasi konstanta itu, jadi
`grok` otomatis ikut terlaporkan berikut ambangnya.

### P6 — Observabilitas hedge, dan sebab kegagalan yang bisa ditindaklanjuti

Ini melunasi batas jujur §7 pada tinjauan pertama ("tidak ada data untuk
mengkalibrasi lebar hedge").

- `metrics.increment('ai.hedge.fired')` — seberapa sering hedge **benar-benar**
  ditembakkan. Kalau ~0, jendelanya bisa dipendekkan; kalau tinggi, asumsi
  "model lite menjawab 0,6–1,3 dtk" sudah bergeser dan amplifikasinya naik.
  Tanpa angka ini, kalibrasinya hanya asumsi.
- `metrics.increment('ai.model.attempt', { model })` dan
  `ai.call { outcome, attempts }` — biaya provider nyata per giliran.
- `log.warn('ai.call.failed', { attempts, reasons })` — **sebab** tiap model.
  Sebelumnya "Gemini HTTP 503", "diblokir filter keamanan", dan "deadline habis"
  ketiganya muncul sebagai satu pesan yang tidak bisa ditindaklanjuti:
  *"Gemini returned empty response"*.
- `fetchGemini` kini **membedakan** jawaban kosong biasa dari blokir
  `promptFeedback.blockReason` / `finishReason: 'SAFETY'`. Biodata kandidat
  (riwayat medis, tato, tindik) cukup untuk memicu filter keamanan, dan itu
  masalah yang sangat berbeda dari "model tidak menjawab" — tapi keduanya
  sebelumnya tidak terbedakan. Melonggarkan `safetySettings` adalah keputusan
  kebijakan, jadi yang dilakukan di sini hanya membedakannya.

### P7 — Kontrak balasan chat diseragamkan

`processAIChat` dan `processSiswaAIChat` mengembalikan `{ reply, data }` tanpa
`success`, sementara `processAdminAIChat` mengembalikan `{ success: true, ... }`.
Akibatnya `handlers.ts` menulis `handler.end { action, success: undefined }`
untuk dua aksi AI yang paling ramai — satu-satunya aksi yang statusnya tidak
terbaca dari log.

Diverifikasi aman sebelum diubah: tidak ada satu pun pemanggil frontend yang
bercabang pada `.success` untuk respons chat (`.success` yang ada di
`SiswaBaruForm`, `AiCvForm`, `CvMiniModal`, `CandidateDash` semuanya milik aksi
lain — `submitDaftarSiswa`, `submitDataAsj`, `simpanUpdateMaster`, `getAppData`),
dan `outcomeStatusCode()` hanya membaca `success === false`, jadi status HTTP
tidak berubah.

### Ringkasan gate batch kedua

| Berkas tes | Tes | Mutasi terbukti merah |
|---|---|---|
| `classify.limits.test.ts` (baru) | 3 | ya — 2 tes merah saat batas dikembalikan ke 8 MiB |
| `cv.lookup.test.ts` (baru) | 7 | ya — 2 tes merah saat peringatan dihapus |
| `chat.test.ts` (+3) | 6 | — |
| `providers.hedge.test.ts` (+4) | 14 | ya — lihat §4 |

---

## 4c. Batch ketiga — menutup celah verifikasi

Pemilik: *"lanjut"*. Dua perbaikan batch pertama ternyata **belum punya tes yang
membuktikan perbaikannya bekerja**, dan satu item (§5.4) masih menggantung.

### P8 — T5 dikoreksi, dan batasnya kini dipin (bukan sekadar diperbaiki)

Batch pertama mengganti penjaga Grok ke bentuk yang menjumlah
(`elapsed + grokBudget <= TOTAL`) alih-alih mengurangi. Itu memperbaiki **titik
4000** — kasus yang paling membutuhkannya — tapi **tidak** memperbaiki batas
atasnya, dan laporan batch pertama tidak mengatakan itu. Batas atasnya sekarang
diakui terbuka dan **dipin tes**:

- `shouldTryGrok()` diekstrak sebagai **fungsi murni** dan diekspor. Alasannya
  sama dengan `outcomeStatusCode()` di `netlify-wrapper-surface.ts`: kebijakan
  batas harus bisa di-assert langsung, bukan hanya lewat satu panggilan yang
  butuh 7 detik untuk sampai ke titik batasnya.
- Tabel batasnya menguji **titik 4000 yang dulu salah** (kini `true`, dulu
  `false`), batas atasnya (`TOTAL - GROK` inklusif, `+1 ms` tidak), dan kasus
  anggaran-yang-sudah-dipotong-deadline (`6500 + 2000`) yang **tidak bisa**
  ditangani bentuk lama karena ia selalu membandingkan terhadap konstanta penuh.
- Mutasi (kembalikan bentuk lama) → **1 tes merah**.

**Batas yang masih terbuka, dinyatakan apa adanya:** Grok menangani kegagalan
cepat, belum timeout penuh. Menutupnya berarti menaikkan `TOTAL_AI_BUDGET_MS`
atau memberi `hedgedInvoke` anggaran rantai sendiri — dan keduanya **tidak boleh
ditebak dari sini**, karena tidak ada provider sungguhan yang bisa mengukurnya
(lihat P11).

### P9 — Grok benar-benar menyala (integrasi, bukan hanya aritmetika)

`shouldTryGrok` membuktikan batasnya; ia tidak membuktikan **kabelnya**
tersambung. Ditambahkan tes integrasi: Gemini gagal cepat (3 × HTTP 503) →
`grokGenerate` dipanggil tepat sekali, balasannya dikembalikan ke pemanggil, dan
**ketiga model Gemini tetap dicoba lebih dulu** (fallback melanjutkan rantai,
bukan menggantikannya).

Ditambah satu tes lagi: kegagalan Grok tercatat di **breaker-nya sendiri**
(`breaker.snapshot().grok.failures > 0`) sementara breaker Gemini tetap `closed`
setelah satu giliran gagal — memaku P5 dari sisi perilaku, bukan hanya dari sisi
konfigurasi.

`installFetch` di tes kini merutekan dua host (Gemini dan x.ai) dan menghitung
panggilan fallback secara terpisah, jadi "Grok tidak dipanggil" bisa dibedakan
dari "Grok dipanggil lalu gagal".

### P10 — Anggaran parse dibuktikan, bukan hanya di-assert

Batch kedua hanya membuktikan **konstantanya** lebih besar dari 4000. Sekarang
ada tes yang menjalankan parse **4,5 detik** dan menuntut keberhasilan — dengan
batas lama 4 dtk, panggilan itu akan di-abort dan gagal. Sekaligus memaku bahwa
hedge parse yang lebih longgar (50% anggaran) berarti satu berkas lambat tetap
**satu** panggilan.

### P11 — Penjaga ukuran juga di sisi KLIEN

Batch kedua memperbaiki batas server, tapi klien masih membaca berkas apa pun ke
memori lalu mengirimnya. Untuk berkas di atas ~4,5 MiB, platform tetap menolak —
dan admin melihat kegagalan jaringan generik, bukan pesan yang benar.

Sekarang `AdminAiCopilot` menolak berkas **sebelum** membacanya, memakai kunci
i18n yang **sudah ada** dan sudah menyebut alasan sebenarnya
(`ui.toast_file_too_big`: *"… terlalu besar (maks {mb} MB) — base64 +30% melewati
limit server"*), tersedia dalam Indonesia **dan** Jepang. Tidak ada string baru
yang ditulis, dan tidak ada helper baru yang dipanggil.

**Gate:** 2 tes di `AdminAiCopilot.test.tsx`, dengan batas **tepat** di 4 MiB
(inklusif) dan 4 MiB + 1 byte (ditolak) — plus bahwa berkas yang ditolak tidak
tersimpan sehingga menekan Parse tidak mengirim apa pun. Mutasi (matikan
penjaganya) → **1 tes merah**.

### P12 — §5.4 ditutup sebagai "terverifikasi tidak-bisa-diverifikasi"

Saya mencoba memverifikasinya ke provider sungguhan alih-alih menebak. Hasilnya
bukan jawaban, tapi **alasan yang terukur**:

- `GEMINI_API_KEY` di `.env.local` adalah **placeholder** — 24 karakter, dan
  tidak berawalan `AIza` seperti semua kunci Google asli. Provider menjawab
  `HTTP 400 "API key not valid"`.
- Karena autentikasi diperiksa **sebelum** resolusi model, probe tidak bisa
  membedakan "model tidak ada" dari "kunci ditolak". Jadi tidak ada cara
  memverifikasi nama model **maupun** dukungan `thinkingConfig` dari sini.
- Konsekuensi yang lebih luas: **fitur AI tidak bisa diuji secara lokal atau di
  preview sama sekali.** `env()` jatuh ke `.env.local` saat `process.env` kosong,
  jadi setiap percobaan lokal mendapat kunci palsu → tiga model gagal → Grok
  gagal → `AI_UNAVAILABLE`. Ini menjelaskan kenapa verifikasi AI di repo ini
  selalu dilakukan terhadap situs yang sudah tayang
  (*"dibuktikan 2026-08-16 vs Netlify lama asjportal.netlify.app"*).

**Keputusan tetap sama seperti semula — tapi sekarang beralasan, bukan hipotetis:**
`generationConfig`/`thinkingConfig` **tidak** ditambahkan. Kalau `thinkingConfig`
tidak didukung, jawabannya `400`, dan karena ketiga model berbagi badan yang
sama, satu field yang salah akan mematikan **seluruh** fitur AI — bukan
memperlambatnya. Prosedur verifikasinya ada di §5.4.

### Ringkasan gate batch ketiga

| Berkas tes | Perubahan | Mutasi terbukti merah |
|---|---|---|
| `providers.hedge.test.ts` | +2 (tabel batas `shouldTryGrok`, Grok menyala) → 18 | ya — bentuk lama penjaga → 1 tes merah |
| `AdminAiCopilot.test.tsx` | +2 (batas 4 MiB, inklusif) → 12 | ya — penjaga dimatikan → 1 tes merah |

**Total mutasi terbukti merah di sesi ini: enam** (1, 5, 2, 2, 1, 1).

---

## 5. Temuan yang SENGAJA tidak diubah

Ditulis lengkap supaya keputusannya bisa ditinjau, bukan supaya terlihat bersih.

> **Status per 2026-10-01 (setelah tiga batch):** §5.1, §5.2, §5.3 dan §5.5 sudah
> **DIKERJAKAN** (§4b). §5.4 sudah **DITUTUP** — bukan dengan menambahkan
> konfigurasinya, melainkan dengan membuktikan bahwa ia **tidak bisa diverifikasi
> dari lingkungan ini**, dan menuliskan alasannya (§4c P12) beserta prosedurnya.
> Yang masih benar-benar terbuka: tujuh pemanggil `findCandidates()` di luar
> lapisan AI.


### 5.1 `handleSelesaikanWawancara` mengirim transkrip penuh (`chat.ts:635`)

`const history = Array.isArray(d.history) ? d.history : []` lalu **seluruh**
transkrip ditempel ke system prompt. Ini satu-satunya tempat yang sengaja tidak
di-cap: memotongnya berarti membuang isi wawancara, dan bagian awal (jikoshoukai,
biodata) justru yang paling sering dirangkum.

**Rekomendasi:** batasi berdasarkan **karakter** (mis. jendela kepala + ekor),
bukan jumlah giliran — tapi ini keputusan kualitas data, bukan keputusan
performa, jadi jangan diubah tanpa memutuskan berapa banyak transkrip yang boleh
hilang.

### 5.2 `handleSubmitDataAsj` — ~13 round-trip berurutan (`cv.ts:302–510`)

Jalur simpan CV AI melakukan **berurutan**: GET+upsert `ai_form_submissions`,
GET `master_database_candidate` (**169 kolom**, `master.ts:17`), PATCH/POST master,
GET `database_candidate`, PATCH, **GET `database_candidate` lagi** (identik),
PATCH, GET `database_asj_form`, PATCH `pemberkasan_checklist`, `syncBiodataKeMail`,
GET `database_asj_form` **lagi**, lalu mungkin `syncFormMailDariUpload`. Pada RTT
~40 ms itu ≈ 500 ms serialisasi murni, di jalur interaktif kandidat.

**Kenapa tidak diubah sekarang:** dua pembacaan `database_candidate` yang
duplikat aman di-cache (hanya `.id` yang dibaca). Tapi dua pembacaan
`database_asj_form` **tidak** — `syncBiodataKeMail` berjalan di antaranya dan
**bisa membuat** baris mail itu, jadi pembacaan kedua memang harus benar-benar
membaca. Menggabungkan keduanya dengan cache akan mengubah keputusan `hasMail`
dan bisa memicu `syncFormMailDariUpload` untuk baris yang sudah ada. Perbaikan
yang benar butuh refactor, bukan penambahan cache.

### 5.3 `findCandidates()` adalah stub kosong (`candidates.ts:90`)

```ts
async function findCandidates(): Promise<{ table: string; rows: any[] }> {
  return { table: TABLE_CANDIDATE, rows: [] };
}
```

Sepuluh pemanggil memperlakukannya sebagai *"fallback scan penuh"* — termasuk
`cv.ts:178`, `chat.ts:482`, `classify.ts:88`. Karena selalu kosong, cabang
fallback itu **tidak pernah bisa menemukan apa pun**. Efeknya: kalau
`findCandidateByWaFiltered` mengembalikan `undefined` (proyeksi kolom tidak
cocok), pencarian kandidat **diam-diam** jadi "tidak ditemukan" — dan yang hilang
bukan sekadar nama: blok `DATA KANDIDAT SAAT INI`, gate VIP/KELAS, dan pemilihan
bidang wawancara semuanya bergantung padanya. Ini bukan masalah performa
(pemanggilannya gratis), tapi **lubang degradasi senyap**.

**Rekomendasi:** ganti dengan pembacaan keyset nyata, atau hapus cabangnya dan
buat `undefined` jadi kegagalan berisik.

### 5.4 `generationConfig` / `thinkingConfig` belum diset — §4c P12

Setiap permintaan Gemini tidak mengirim `generationConfig`, jadi panjang output
memakai default model. Untuk model flash generasi 2.5+ Google mengaktifkan
*thinking* secara default, dan mematikannya (`thinkingConfig.thinkingBudget: 0`)
biasanya memangkas latensi paling besar dari semua opsi di sini.

**Kenapa tidak diubah — dan ini sudah DIVERIFIKASI, bukan lagi hipotesis.**
Saya mencoba memeriksanya ke provider sungguhan. `GEMINI_API_KEY` di `.env.local`
adalah **placeholder** (24 karakter, tanpa prefiks `AIza`), dan provider menjawab
`HTTP 400 "API key not valid"`. Karena autentikasi diperiksa sebelum resolusi
model, probe tidak bisa membedakan "model tidak ada" dari "kunci ditolak" —
sehingga nama model **dan** dukungan `thinkingConfig` sama-sama tidak bisa
diverifikasi dari sini.

Kalau `thinkingConfig` tidak didukung, jawabannya **400** — dan karena ketiga
model berbagi badan yang sama, satu field yang salah akan mematikan **seluruh**
fitur AI, bukan memperlambatnya.

**Prosedur verifikasinya** (butuh kunci yang sah; satu permintaan kecil per
model sudah cukup):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST "https://generativelanguage.googleapis.com/v1beta/models/<MODEL>:generateContent" \
  -H "Content-Type: application/json" -H "x-goog-api-key: $GEMINI_API_KEY" \
  -d '{"contents":[{"role":"user","parts":[{"text":"hi"}]}],
       "generationConfig":{"thinkingConfig":{"thinkingBudget":0}}}'
```

`200` → aman ditambahkan. `400` dengan `Unknown name "thinkingConfig"` → tidak
didukung model itu, **jangan** ditambahkan untuk rantai bersama. Jalankan untuk
ketiga nama di `MODELS`, karena dukungannya bisa berbeda per model.

### 5.5 Breaker `grok` memakai konfigurasi default

`fetchGrok` memanggil `breaker.check('grok')`, tapi `grok` tidak ada di
`DEPENDENCY_CONFIGS` (`resilience.ts:301`) sehingga memakai default (ambang 5,
jendela 30 dtk) dan tidak ikut ter-enumerasi di `/health`. Menambahkannya akan
memperbaiki observabilitas — tapi juga menambah satu kunci ke payload
`breaker.snapshot()`/`bulkhead.snapshot()` yang mungkin dipin tes health. Perubahan
satu baris, tapi sebaiknya disertai pemeriksaan tes health dulu.

---

## 6. Cara memverifikasi

```bash
# Tes regresi AI (43 tes, tanpa jaringan)
node node_modules/vitest/vitest.mjs run --project backend \
  netlify/functions/_lib/ai

# Suite penuh — harapan: 1861 lulus / 1 gagal (fcm-server, sudah merah di baseline)
npm test

# Typecheck & lint
npm run typecheck
node scripts/ci/lint-ratchet.mjs      # LINT RATCHET PASSED
```

Cara memeriksa sendiri klaim yang paling penting:

```bash
# 1. Batas unggah harus muat di body platform SETELAH base64.
node node_modules/vitest/vitest.mjs run --project backend \
  netlify/functions/_lib/ai/classify.limits.test.ts
#    Dan tesnya harus BISA merah: kembalikan PARSE_MAX_BYTES ke 8 MiB,
#    jalankan lagi → dua tes gagal. Lalu kembalikan ke 4 MiB.

# 2. Batas jendela fallback Grok (termasuk titik 4000 yang dulu salah).
node node_modules/vitest/vitest.mjs run --project backend \
  netlify/functions/_lib/ai/providers.hedge.test.ts
#    Dan tesnya harus BISA merah: kembalikan shouldTryGrok ke bentuk lama
#    `elapsedMs < TOTAL - AI_BUDGETS.grokMs` → satu tes gagal.

# 3. Penjaga ukuran di klien (batas 4 MiB, inklusif).
node node_modules/vitest/vitest.mjs run --project frontend \
  src/components/admin/AdminAiCopilot.test.tsx
#    Dan tesnya harus BISA merah: ganti `f.size > PARSE_MAX_MB * 1024 * 1024`
#    menjadi `false` → satu tes gagal.

# 4. Sebab kegagalan AI bisa dibaca (bukan lagi "empty response").
#    Sudah dicakup providers.hedge.test.ts: blokir filter keamanan harus
#    menghasilkan log `ai.call.failed` yang memuat `blockReason=SAFETY`.
```

---

## 7. Batas yang jujur

- **Semua angka latensi di atas adalah aritmetika dari konstanta di kode, bukan
  hasil pengukuran.** Yang diukur di sini adalah *perilaku* (jumlah panggilan
  provider, sinyal yang dibatalkan, status breaker, waktu yang ditempuh terhadap
  deadline) lewat `fetch` palsu. Tidak ada satu pun panggilan ke Gemini/Grok.
- **Efek latensi sebenarnya belum terbukti di produksi.** Klaim "hedge tidak
  pernah ditembakkan" bersandar pada catatan di kode bahwa model lite menjawab
  0,6–1,3 dtk (dibuktikan 2026-08-16). Kalau angka itu bergeser, hedge akan mulai
  ditembakkan dan amplifikasinya naik ke 2× — masih jauh di bawah 3×, tapi bukan
  nol.
- **`dependency_calls` masih tidak mencatat panggilan Gemini.** `kernel/http.ts`
  mencatatnya untuk semua dependency lain, tapi jalur AI memakai `fetch` langsung
  (dengan sengaja: menulis satu baris PostgREST per model yang di-hedge akan
  menambah beban DB di jalur terpanas). Jadi **tidak ada** data historis
  latensi/error rate Gemini untuk membandingkan sebelum-sesudah. Batch kedua
  (§4b P6) menambahkan counter `ai.hedge.fired` / `ai.model.attempt` / `ai.call`
  dan log `ai.call.failed`, yang menjawab pertanyaan kalibrasi ("seberapa sering
  hedge ditembakkan?") — tapi latensi per model masih hanya terlihat lewat
  histogram `handler.dispatch` per aksi, bukan per dependency.
- **Kalibrasi cap admission `ai` (4) dan `ADMISSION_MAX_INFLIGHT_*` belum
  tersentuh** — keduanya masih tebakan yang memang ditandai perlu kalibrasi di
  `docs/BACKEND_TODO.md` #6, dan butuh staging.
- **Batas 6 MB body platform tidak diuji dari sini.** Angka itu datang dari
  dokumentasi/diskusi AWS Lambda (batas payload invokasi sinkron) dan dua sumber
  pihak ketiga yang independen — bukan dari pengukuran ke Netlify. Aritmetika
  `classify.limits.test.ts` menegakkan bahwa batas kami *muat* di bawah 6 MB;
  ia tidak membuktikan bahwa 6 MB itu angkanya. Kalau platform ternyata lebih
  longgar, batas 4 MiB hanya konservatif (bukan salah); kalau lebih ketat,
  angkanya perlu diturunkan — dan tesnya akan tetap hijau selama invariannya
  dipegang. Verifikasi ke staging masih perlu.
- **Tujuh pemanggil `findCandidates()` di luar lapisan AI belum diperbaiki**
  (`contexts/catalog`, `contexts/documents`, `contexts/jobs`,
  `contexts/diagnostics`). Mereka memakai stub yang sama dengan pola yang sama,
  jadi kemungkinan besar punya lubang degradasi senyap yang sama. Di luar lingkup
  "system AI", tapi jangan dianggap sudah beres.
- **Fitur AI tidak bisa diuji secara lokal maupun di preview — dan itu bukan
  sekadar ketidaknyamanan.** `GEMINI_API_KEY` di `.env.local` adalah placeholder
  (24 karakter, tanpa prefiks `AIza`); provider menjawab `HTTP 400 "API key not
  valid"`. `env()` jatuh ke `.env.local` saat `process.env` kosong, jadi setiap
  percobaan AI lokal berakhir `AI_UNAVAILABLE` setelah tiga model dan satu
  fallback gagal. Akibatnya **seluruh verifikasi AI di repo ini harus dilakukan
  terhadap situs yang sudah tayang** — dan itu berarti ia bergantung pada deploy
  yang berhasil. Kalau ingin menguji AI secara lokal, `.env.local` butuh kunci
  yang sah; saya sengaja **tidak** mengubahnya.
- **`fcm-server.test.ts` masih merah** sebelum dan sesudah perubahan ini. Itu
  pemeriksaan aturan `.gitignore` untuk berkas service account, tidak ada
  hubungannya dengan jalur AI, dan sengaja tidak saya sentuh.
