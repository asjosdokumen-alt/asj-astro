# Batas 4 KB Environment Variable — AWS Lambda Compatibility Mode

**Tanggal:** 2026-09-12
**Deploy gagal:** `6aa4a0bf0044aa0008729bcf` (build `6aa4a0bf0044aa0008729bcd`)
**Dampak:** produksi tidak menerima build baru. Situs lama masih melayani trafik.
**Status:** ✅ **SELESAI — keluar dari Lambda compatibility mode.** Deploy `6aa57207` = ready, dan
**0 fungsi mode kompat** pada build yang tayang. Dijaga gate `verify:entries` (`npm run verify:entries`),
yang memeriksa **bentuk** direktori `netlify/functions/` — satu-satunya hal yang sebenarnya dibaca Netlify.
Per 2026-09-13 gate melaporkan: **22 root entry, semuanya mengekspor handler, "no direct subdirectory
deploys as a function (no Lambda-compat entries)"**. Dokumen di bawah adalah catatan diagnosis aslinya,
dipertahankan sebagai provenance.

---

## 1. Apa yang terjadi

Build **sukses sepenuhnya**. Yang gagal adalah tahap *function creation*:

```
7:46:16 AM: 00:46:16 [build] 9 page(s) built in 7.53s
7:46:16 AM: [sw-manifest] precache  : 62 URLs
7:46:16 AM: (build.command completed in 9.6s)
7:46:16 AM: (Functions bundling completed in 1.8s)
7:46:18 AM: 21 new function(s) to upload
7:46:19 AM: Failed to create function: invalid parameter for function creation:
            Your environment variables exceed the 4KB limit imposed by AWS Lambda.
            Please consider reducing them or upgrading from Lambda compatibility mode
            to remove this limitation: https://ntl.fyi/functions-migrate
```

Itu terjadi **21 kali** (satu per function), lalu:

```
7:46:19 AM: Failed to upload file: share-data
7:46:19 AM: Failed to upload file: candidates
... (21 nama)
7:46:19 AM: Error deploying
            Deploy did not succeed with HTTP Error 400
            [PUT /deploys/{deploy_id}/functions/{name}][400]
```

**Poin kunci:** ini bukan soal jumlah variabel (25 nama itu wajar), tapi soal **byte**.
AWS Lambda compatibility mode menanamkan seluruh set env var ke **setiap** function pada
saat pembuatan, dan anggarannya **4096 byte per function**.

---

## 2. Anggarannya

`.env.local` diukur langsung (nama + panjang saja, tidak pernah nilai). Untuk variabel yang
tidak ada di `.env.local`, nilainya diestimasi dan ditandai.

| Variabel | Byte | Sumber |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | **2402** | estimasi (proksi JSON service-account di `.env.local`) |
| `SUPABASE_SERVICE_ROLE_KEY` | 245 | terukur |
| `PUBLIC_SUPABASE_ANON_KEY` | 233 | terukur |
| `SUPABASE_ANON_KEY` | 226 | terukur |
| `CLOUDINARY_UPLOAD_URL` | 142 | estimasi |
| `SUPABASE_JWT_SECRET` | 108 | terukur |
| `XAI_API_KEY` | 96 | terukur |
| `NETLIFY_AUTH_TOKEN` | 93 | estimasi |
| `ALLOWED_DOCUMENT_HOSTS` | 83 | estimasi |
| `CLOUDINARY_URL` | 83 | terukur |
| `SESSION_SECRET` | 79 | terukur |
| `HEALTH_TOKEN` | 77 | estimasi |
| `GEMINI_API_KEY` | 68 | terukur |
| `PUBLIC_SUPABASE_URL` | 60 | terukur |
| `SUPABASE_URL` | 53 | terukur |
| `NETLIFY_SITE_URL` | 47 | estimasi |
| `FONNTE_TOKEN` | 33 | terukur |
| `SUPABASE_STORAGE_BUCKET` | 33 | terukur |
| `ADMIN_MASTER_PIN` | 23 | terukur |
| `NODE_ENV` | 19 | estimasi |
| `PIN_KHOLIS` / `PIN_MASTER` / `PIN_SACHOU` | 15 each | terukur / estimasi |
| `PIN_KHOCI` | 14 | terukur |
| `PIN_AYOK` | 13 | terukur |
| **TOTAL** | **4275** | **limit 4096 → lebih 179** |

**Tanpa `FIREBASE_SERVICE_ACCOUNT`: 1873 byte → sisa ruang 2223 byte.**

Karena kelebihannya hanya 179 byte, **tidak ada satu variabel kecil pun yang cukup** kalau
mau dibiarkan. Yang bisa menyelesaikan sendiri hanya `FIREBASE_SERVICE_ACCOUNT`.

> Angka 2402 itu **estimasi**. Untuk angka pasti jalankan blok `netlify env:list` di
> `HANDOFF.md`. Kalau ternyata `NETLIFY_AUTH_TOKEN` misalnya 200 B, kesimpulan tidak berubah —
> `FIREBASE_SERVICE_ACCOUNT` tetap penyebab dominan.

---

## 3. Mengapa ini tidak terlihat sebelumnya

Ini **batas platform, bukan batas kode**. Tidak ada gate di repo yang bisa melihatnya:

- `ci:quality` (9 gate) — semua hijau. Tidak satu pun mengevaluasi ukuran env var.
- `verify:env` / `verify:env:resolve` — memeriksa **keberadaan** nama, bukan **ukuran**.
- `verify:entries` — memeriksa bentuk entry point, bukan payload deploy.
- `bundle:size` — mengukur ukuran bundle JS, bukan env var.

Yang menambah sulit: pesan errornya muncul **setelah** bundling selesai dan menyebut
"Lambda", bukan "Netlify", sehingga mudah disalahartikan sebagai masalah konfigurasi.

**Kandidat gate baru:** `scripts/ci/verify-env-budget.mjs` — menjumlahkan panjang
key+value dari profil produksi dan gagal kalau mendekati 4096. Butuh sumber nilai; bisa
dibuat sebagai peringatan offline (memakai `.env.local` sebagai proksi) atau sebagai
penghitung yang dijalankan manual sebelum deploy.

---

## 4. Koreksi terhadap fakta lama

### 4.1 `surfaces/index.ts` IKUT ter-deploy

Deploy log mencantumkannya di blok packaging:

```
Packaging Functions from netlify/functions directory:
  - ai-chat.js
  ...
  - sweep-queue.ts
  - surfaces/index.ts      ← ter-deploy
```

**Fakta "Netlify hanya men-deploy direct children of the directory" (dicatat 2026-09-12)
adalah SALAH.** Probe produksi (`/_lib/health` → 404, `/_lib/metrics-sink` → 404, `/service`
→ 404) tetap benar, tapi sebabnya berbeda.

**Aturan sebenarnya** (dari dokumentasi Netlify `functions/get-started`): dalam subdirectory,
file entry harus bernama **`index`** atau **sama dengan nama subdirectory**.

| Path | Ter-deploy? | Alasan |
|---|---|---|
| `surfaces/index.ts` | ✅ | bernama `index` — **sudah di-rename ke `registry.ts` pada 2026-09-12** |
| `surfaces/<action>.ts` | ❌ | **SALAH sebelumnya.** Hanya `index`/`<dirname>` yang jadi entri; 14 file flat lain TIDAK ter-deploy (dibuktikan `manifest.json` dari `zipFunctions`) |
| `_lib/health.ts` | ❌ | bukan `index`, bukan `_lib` |
| `contexts/<name>/index.ts` | ❌ | dua tingkat di bawah root; zisi hanya memeriksa subdir tingkat pertama |
| `contexts/<name>/service.ts` | ❌ | bukan `index` |
| `shared/*.ts` | ❌ | bukan `index` |

**Sudah diperbarui (2026-09-12):** `KNOWN_DEBT_DIRS` di
`scripts/ci/verify-function-entries.mjs` kini **kosong**, digantikan **check 3b** yang
meng-assert aturannya alih-alih mendokumentasikannya. `MEMORY.md` juga sudah dikoreksi.

### 4.3 KOREKSI BESAR: `surfaces/index.ts` MEMANG penyebab deploy mati

Paragraf di bawah (versi lama) menyimpulkan `surfaces/` "bukan blocker". **Itu salah**, dan
kesalahan itu bertahan karena disimpulkan dari daftar `Failed to upload file` — bukan dari mode
runtime function-nya.

Yang sebenarnya, dibaca dari `zipFunctions` + `manifest.json` (bundler Netlify sendiri):

- `surfaces/index.ts` ter-deploy sebagai **tepat satu** fungsi bernama `surfaces`, dengan
  `"bundler":"esbuild"` dan **`buildData.runtimeAPIVersion: 1`**.
- 21 entri root semuanya `runtimeAPIVersion: 2` (`"bundler":"nft"`, `"invocationMode":"stream"`).
- `runtimeAPIVersion: 1` **adalah mode kompatibilitas Lambda** — dan menurut changelog
  2026-06-12 batas 4 KB env **masih berlaku** di mode itu.

Jadi satu fungsi tanpa handler ini menjaga batas 4 KB tetap hidup **untuk seluruh deploy**, walau
semua entri asli sudah modern. Ia dibuat dengan env penuh, dan bisa mati di tahap function creation
dengan error yang persis sama seperti yang ingin diakhiri migrasi ini. Yang keliru bukan
"surfaces ter-deploy atau tidak", melainkan **mode runtime-nya**.

**Perbaikan:** `surfaces/index.ts` → `surfaces/registry.ts` (`registry` bukan `index`, bukan
`surfaces` ⇒ tidak ter-deploy sama sekali). Probe ulang: **21 fungsi, semuanya
`runtimeAPIVersion: 2`, `surfaces` hilang, 0 mode kompat Lambda.**

**Pelajaran:** gate yang menyimpulkan perilaku deploy dari konvensi penamaan harus
memverifikasinya ke **output bundler**, bukan ke komentar. Dan "bukan penyebab kegagalan X" tidak
sama dengan "bukan blocker".


### 4.2 Kegagalan deploy menjelaskan 404 `/health`

> **Catatan jalur (2026-09-13).** Baik `/_lib/health` maupun `/health` **tidak pernah bisa
> di-rutekan** — `netlify.toml` tidak punya redirect untuk keduanya, dan `_lib/*` bukan entri fungsi
> (lihat tabel di §4.1). Jadi 404 di situ **bukan bukti apa-apa tentang deploy**; itu alamat yang
> memang tidak ada. Alamat kanoniknya **`/.netlify/functions/health`** — diverifikasi live
> 2026-09-13 (`200`, `detail:"gated"`). Yang membuktikan deploy benar-benar mati adalah
> **daftar fungsi pada output zisi**, bukan probe HTTP ke jalur tebakan.

Kesimpulan "Phase C belum di-deploy" tetap benar, tapi **alasannya berbeda**: `health.js`
sudah ikut di-build sejak `38f09ba`. Deploy-nya yang selalu mati di tahap function creation.

**Implikasi penting:** memperbaiki batas 4 KB **langsung** membuka Phase C §6. Tidak ada
pekerjaan tersembunyi lainnya.

---

## 5. Opsi perbaikan

Kelebihan 179 byte, jadi opsi bisa dipadukan.

### A. Keluar dari Lambda compatibility mode ⭐ rekomendasi teknis

Migrasi ke Netlify Functions modern. **Batas 4 KB hilang sepenuhnya.**

Perubahan yang diperlukan (dari `https://ntl.fyi/functions-migrate`):

| Aspek | Sekarang | Modern |
|---|---|---|
| Format | CommonJS `exports.handler` | ESM `export default` |
| Argumen | `(event, context)` Lambda event | `(request: Request, context)` |
| Kembalian | `{ statusCode, body, headers }` | `new Response(body, { status, headers })` |
| URL akses | `event.rawUrl` | `request.url` |
| Header | `event.headers['x']` | `request.headers.get('x')` |
| Body | `event.body` (string) | `await request.json()` |
| `require` | `require('./x')` | `import x from './x.js'` (ekstensi wajib) |
| `__dirname` | tersedia | `import.meta.url` |
| Schedule | `schedule('@daily', fn)` | `export const config = { schedule: '@daily' }` |

**Bukti repo sudah setengah jalan:** `package.json` = `"type": "module"`, dan Netlify sudah
memperlakukan file fungsi sebagai ESM — itulah sumber 9 warning
`commonjs-variable-in-esm` di log. Lambda compatibility mode hanya mendukung CommonJS, jadi
kombinasi ini memang transisi yang belum selesai.

**Skala:** 20 entry point di root + `_lib/netlify-wrapper{,-surface}.ts` + `_lib/handlers.ts`
+ `sweep-queue.ts` + `metrics-receiver.ts` + `health.js` + `ping.js` + `ingest.js` +
`share-data.js` (4 file terakhir punya `handler` sendiri, bukan lewat wrapper).

**Strategi bertahap (disarankan):** buat shim di `_lib/netlify-wrapper.ts` yang mendeteksi
bentuk argumen (`if (event instanceof Request)`) dan menormalkannya, sehingga entry point bisa
dimigrasi satu per satu tanpa memecah yang lain.

**Risiko:** perubahan terbesar. `schedule` untuk `sweep-queue` adalah perubahan konfigurasi
yang paling mudah membuat sweep berhenti diam-diam — perlu diverifikasi terpisah.

### B. Pindahkan kredensial Firebase keluar dari env var

Bebaskan 2402 byte → **sisa 2223 byte headroom.**

Pendekatan: simpan service-account sebagai file JSON yang ikut `included_files` di
`netlify.toml`, lalu `_lib/fcm-server.ts` membacanya dari disk alih-alih `process.env`.

**Konsekuensi jujur yang harus disampaikan ke pemilik:** kunci masuk ke artefak deploy.
Repo privat dan artefak Netlify terlindungi, jadi risikonya terkendali — tapi ini tetap
perubahan postur keamanan, dan `FIREBASE_SERVICE_ACCOUNT` saat ini sudah terbukti berfungsi
(tukar Google OAuth token → HTTP 200). Perubahan ini harus diuji ulang dengan metode yang
sama.

### C. Bersihkan variabel yang tidak dibaca kode

Cari 179+ byte dari variabel mati. Perlu diverifikasi dengan `grep` di `netlify/functions/`
sebelum dihapus:

| Variabel | Byte | Hipotesis |
|---|---|---|
| `CLOUDINARY_UPLOAD_URL` | 142 | whitelisted di `_lib/env.ts` tapi mungkin tidak ada pembacanya |
| `NETLIFY_AUTH_TOKEN` | 93 | kredensial deploy — **tidak seharusnya ada di runtime function** |
| `ALLOWED_DOCUMENT_HOSTS` | 83 | perlu dicek |
| `PIN_MASTER` | 15 | mungkin alias `ADMIN_MASTER_PIN` |
| `NODE_ENV` | 19 | perlu dicek apakah ada pembacanya di runtime |

**Cepat, tapi menambal.** Batasnya tetap ada dan akan terlanggar lagi begitu
`HEALTH_TOKEN` + `METRICS_SINK_URL` + `METRICS_SINK_TOKEN` + `METRICS_RECEIVER_TOKEN` +
`METRICS_NOTIFY_URL` masuk (potensi +300–400 byte).

### D. Padukan A + C ⭐ rekomendasi produksi

Migrasi sebagai jalur utama, sekaligus bersihkan variabel mati supaya deploy berikutnya lolos
walau migrasi tertunda. Paling aman untuk produksi yang sedang menunggu.

---

## 6. Verifikasi setelah diperbaiki

1. Deploy hijau — tidak ada `Failed to create function` di log.
2. `/ping` → `200`.
3. `POST /.netlify/functions/health` tanpa token → `401` (sebelumnya `404`).
4. Dengan token + `?detail=1` → `200` + report lengkap.
5. Lanjut ke gate Phase C §6 (inject kegagalan DB → `status:"down"` + `503`).
6. Cek `sweep-queue` masih jalan (kalau migrasi menyentuh `schedule`).

---

## 7. Referensi

- Panduan migrasi resmi: `https://ntl.fyi/functions-migrate`
- `docs/PHASE_C_OBSERVABILITY.md` §6 — prosedur gate
- `docs/PHASE_C_SINK_SETUP.md` — setup `METRICS_SINK_URL`
- `HANDOFF.md` (root) — ringkasan untuk lanjut di kantor
- `netlify.toml` — konfigurasi fungsi, header, redirect
- `.workbuddy-ai/memory/2026-09-12.md` — log harian lengkap
