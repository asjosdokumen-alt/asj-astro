# Keluar dari Lambda compatibility mode — penjelasan & rencana

**Tanggal:** 2026-09-12
**Untuk:** pemilik proyek (penjelasan non-teknis + langkah teknis)
**Status:** ✅ **SUDAH DIKERJAKAN** (Opsi A + C) — 2026-09-12, sesi kantor. Kode ada di
working tree, **belum di-commit dan belum di-deploy**. Rincian di §11.
**Terkait:** `HANDOFF.md`, `docs/HANDOFF_4KB_ENV_LIMIT.md`

---

## 1. Ringkasan singkat

| Pertanyaan | Jawaban |
|---|---|
| Kenapa deploy gagal? | Batas **4 KB** untuk environment variable, khas **mode lama** (Lambda compatibility). Kita kelebihan 179 byte. |
| Apakah ini bug kode kita? | **Bukan.** Build sukses 100%. Yang gagal adalah tahap penyerahan "kunci" ke fungsi. |
| Apakah FCM perlu diubah? | **Tidak.** Setelah migrasi, kunci Firebase tetap jadi env var biasa — persis seperti sekarang. |
| Rekomendasi? | **Opsi A: migrasi ke format fungsi baru.** Satu-satunya jalan bersih di paket gratis. |
| Apakah paket gratis cukup? | **Ya.** Yang butuh Pro hanyalah fitur "scopes", dan kita tidak memerlukannya. |
| Apakah frontend tersentuh? | **Tidak.** Astro, Preact islands, Zod, Nano store tidak diubah sama sekali. |

Bukti resmi Netlify (changelog 12 Juni 2026):

> "The 4KB total size limit on environment variables **no longer applies** to functions
> running on the current Netlify Functions runtime. … The limit **still applies** to
> functions running in Lambda compatibility mode."

Jadi: batas itu memang hanya milik mode lama, dan Netlify sendiri menyuruh pindah.

---

## 2. Kenapa deploy gagal — pakai analogi

Bayangkan setiap fungsi adalah **kantor kecil**. Setiap kali Netlify membuat kantor baru,
seluruh daftar kunci perusahaan **difotokopi dan dimasukkan ke amplop kantor itu**. Amplopnya
punya batas keras: **4 KB**.

Kita punya 25 kunci dengan total **4.275 byte** — lebih 179 byte dari kapasitas amplop.
Satu kunci saja (surat izin Firebase) beratnya **2.402 byte = 59% dari seluruh amplop**.

Karena amplopnya tidak muat, **kantornya tidak pernah jadi**. Bukan karena isinya salah,
tapi karena amplopnya kelebihan berat. Itu sebabnya pesan errornya muncul **setelah** build
selesai dan menyebut "AWS Lambda" — bukan menyebut kode kita.

Di format fungsi baru, amplop ini **tidak ada lagi**. Netlify menyerahkan kunci langsung ke
fungsi saat dibutuhkan, bukan ditempel di badan kantor.

---

## 3. Bagaimana FCM bekerja — dan kenapa tetap jalan

### 3.1 Alur pengiriman notifikasi

1. **Perangkat mendaftar.** HP pengguna membuka aplikasi web kita dan mendaftar ke Firebase.
   Firebase memberi sebuah "alamat" unik (token perangkat). Alamat ini kita simpan di database.
2. **Ada kejadian.** Misalnya ada lamaran baru. Fungsi backend kita ingin memberi tahu.
3. **Google tidak menerima sembarang orang.** Fungsi kita harus menunjukkan **surat izin**
   berupa *service account* — sebuah JSON berisi kunci privat. Inilah isi
   `FIREBASE_SERVICE_ACCOUNT` yang beratnya 2.402 byte itu.
4. **Tukar tiket.** Fungsi menandatangani "tiket" singkat (JWT) memakai kunci privat tadi,
   lalu menukarnya ke Google. Google membalas dengan **token akses** yang berlaku 1 jam
   (dan kita simpan di cache supaya tidak menukar terus).
5. **Kirim.** Fungsi memanggil `fcm.googleapis.com` dengan token akses itu, dan Google
   mengantarkan notifikasi ke HP pengguna.

### 3.2 Poin pentingnya

Yang menentukan FCM jalan atau tidak adalah:

> **Apakah fungsi bisa MEMBACA surat izin itu** — bukan **di mana surat izin disimpan.**

| Cara penyimpanan | Bagaimana fungsi membacanya | Berat di "amplop" |
|---|---|---|
| Environment variable (sekarang) | Lambda menyelipkannya ke fungsi | 2.402 byte ❌ |
| File di dalam bundel fungsi | Fungsi membacanya dari disk | 0 byte ✅ |

Sesampainya di dalam fungsi, **langkah 3–5 identik**. Kunci privat tetap ada di memori, tukar
token tetap sama, panggilan ke Google tetap sama. Notifikasi tetap sampai ke pengguna.

### 3.3 Jadi kalau pindah ke fungsi modern, FCM berubah di mana?

**Tidak berubah sama sekali.** Justru itu keunggulannya: karena batas 4 KB hilang, kunci
Firebase **boleh tetap jadi env var** seperti sekarang. Tidak perlu file rahasia di dalam
artefak deploy, tidak perlu ubah `fcm-server.ts`.

---

## 4. ⚠️ Temuan penting: opsi B yang sudah setengah dikerjakan belum bisa bekerja

Di working tree sekarang ada pekerjaan yang **belum di-commit** (opsi B):

- `_lib/fcm-server.ts` sudah diubah jadi "**file dulu, env kedua**".
- `netlify.toml` sudah memasukkan `netlify/functions/secrets/firebase-service-account.json`
  ke `included_files`.
- File itu **di-gitignore** (dan memang seharusnya — itu kunci privat).

Masalahnya ada di situ:

> **Netlify membangun dari salinan repo Git.** File yang di-gitignore **tidak ada** di salinan
> itu. Jadi saat build di Netlify, file tersebut tidak ada → `included_files` tidak membundel
> apa pun → saat runtime, `loadServiceAccount()` **jatuh ke env var** → env var tetap 2.402 byte
> → **deploy tetap gagal.**

Konsekuensinya:

1. Opsi B seperti sekarang hanya menolong kalau Anda deploy **dari komputer sendiri**
   (`netlify deploy`), bukan dari push Git — dan deploy produksi kita dari Git.
2. **Lebih berbahaya:** kalau Anda menghapus `FIREBASE_SERVICE_ACCOUNT` dari dashboard sambil
   percaya file sudah ikut terbundel, FCM akan **gagal diam-diam**. Di
   `_lib/fcm-server.ts`, kalau service account tidak ketemu, `sendPushNotification()`
   langsung `return false` **tanpa mencetak error apa pun**. Notifikasi berhenti, log bersih,
   tidak ada yang tahu.

### Kenapa tidak dibersihkan saja?

Cara yang benar untuk opsi B adalah: simpan JSON itu sebagai env var dengan cakupan
**hanya Builds** (jadi tidak ikut masuk ke env fungsi), lalu tulis ke file saat build.

**Tapi cakupan (scopes) hanya tersedia di paket Pro ke atas** — di paket gratis tidak bisa.
Alternatif lain: commit file-nya (kunci privat masuk riwayat Git selamanya — tidak disarankan),
atau mengambil dari penyimpanan rahasia eksternal saat build (butuh alat tambahan).

**Kesimpulan: opsi B bukan pilihan yang bagus untuk paket gratis.** Ini bukan berarti
pekerjaan itu sia-sia — lihat §6 tahap 5 soal apa yang harus dilakukan dengannya.

---

## 5. Rekomendasi: Opsi A — migrasi ke format fungsi baru

Alasan, urut dari yang paling penting:

1. **Batas 4 KB hilang permanen.** Pernyataan resmi Netlify, bukan tafsiran saya.
2. **FCM tidak perlu diubah** dan **tidak ada kunci privat di artefak deploy** — postur
   keamanan tetap seperti sekarang.
3. **Paket gratis tidak terhalang.** Yang butuh Pro adalah fitur *scopes*; kita justru jadi
   tidak memerlukannya setelah migrasi.
4. **Frontend sama sekali tidak tersentuh.** Astro, Preact islands, Zod, Nano store tetap.
   Ini murni perubahan "pintu masuk" fungsi backend.
5. **Repo sudah setengah jalan.** `package.json` sudah `"type": "module"`, dan Netlify sudah
   memperlakukan file fungsi kita sebagai ESM — itu sumber 9 peringatan
   `commonjs-variable-in-esm` di log build. Yang menahan kita keluar cuma lapisan mode lama.
6. **Menghindari kejutan nanti.** Dokumentasi Netlify menyebut mode lama mulai di-deprecate.
7. **Bonus:** menghapus 9 peringatan itu, dan membuka fitur baru (routing di kode, streaming,
   rate limit per fungsi) yang bisa berguna nanti.

### Tambahan opsional — bersihkan variabel mati (dulu disebut opsi C)

Saya sudah periksa langsung mana yang benar-benar dibaca kode:

| Variabel | Byte | Dibaca fungsi? | Tindakan |
|---|---|---|---|
| `NETLIFY_AUTH_TOKEN` | 93 | ❌ **tidak ada** | **Hapus dari dashboard.** Ini kredensial deploy — tidak pantas bisa dibaca runtime fungsi. |
| `CLOUDINARY_UPLOAD_URL` | 142 | ❌ tidak (hanya disebut di gate) | Boleh dihapus. |
| `PIN_MASTER` | 15 | ❌ tidak | Boleh dihapus. |
| `ALLOWED_DOCUMENT_HOSTS` | 83 | ✅ ya — `_lib/storage.ts` | **Jangan dihapus.** |
| `NODE_ENV` | 19 | ✅ ya — `_lib/session.ts` | **Jangan dihapus.** |
| `HEALTH_TOKEN` | 77 | ✅ ya — `health.js` | **Jangan dihapus.** |

Ini tidak wajib setelah Opsi A (batasnya sudah tidak berlaku), tapi tetap kebersihan yang
berguna — terutama `NETLIFY_AUTH_TOKEN`.

---

## 6. Rencana migrasi — bertahap, tidak sekali jadi

Kabar baiknya: dari 20 entry point, **14 di antaranya hanya satu baris**. Seluruh logika berat
sudah terpusat di dua file wrapper. Jadi ini jauh lebih kecil dari kesan awalnya.

### Perubahan bentuk yang perlu dilakukan

| Sekarang (mode lama) | Menjadi (format baru) |
|---|---|
| `exports.handler = async (event)` | `export default async (request)` |
| `event.body` | `await request.text()` |
| `event.headers['x']` | `request.headers.get('x')` |
| `event.queryStringParameters` | `new URL(request.url).searchParams` |
| `return { statusCode, headers, body }` | `return new Response(body, { status, headers })` |
| `require('./x')` | `import x from './x.js'` (ekstensi wajib) |
| `schedule('@daily', fn)` | `export const config = { schedule: '@daily' }` |

### Tahap pengerjaan

| Tahap | Isi | Risiko |
|---|---|---|
| **0** | Bikin **adaptor** di wrapper: satu handler bisa menerima **dua bentuk** (Request baru atau event lama). | Rendah |
| **1** | Ubah `_lib/netlify-wrapper.ts` + `_lib/netlify-wrapper-surface.ts` (terpusat di sini). | Sedang — di sini semua lewat |
| **2** | 14 entry point satu baris: `require` → `import`, `exports.handler =` → `export default`. Mekanis. | Rendah |
| **3** | 4 handler mandiri: `ping.js`, `health.js`, `ingest.js`, `share-data.js`. | Rendah |
| **4** | `sweep-queue.ts`: jadwal dipindah dari `netlify.toml` ke dalam kode. | **Tinggi** — paling mudah rusak diam-diam |
| **5** | Sesuaikan gate (lihat di bawah). | Sedang |
| **6** | Uji di **Deploy Preview**, jangan langsung produksi. | — |
| **7** | Merge ke `main`. | — |

Tahap 0 penting: dengan adaptor, entry point bisa dipindah **satu per satu** tanpa memecah
yang lain. Kalau ada yang salah, hanya satu fungsi yang terdampak.

### Gate yang harus disesuaikan di tahap 5

1. **`verify:entries`** — sekarang menuntut entry point mengekspor `handler`. Setelah migrasi
   bentuknya `export default`, jadi gate ini **akan gagal** kalau tidak disesuaikan. Justru
   bagus: gate-nya bekerja. Perlu diperbarui agar menerima bentuk baru (dan tetap menolak
   bentuk yang salah).
2. **`verify:env:budget`** (gate baru, belum di-commit) — menghitung anggaran 4 KB. Setelah
   migrasi batas itu **tidak berlaku lagi**, jadi gate ini harus **diturunkan jadi peringatan
   saja**. Kalau dibiarkan, ia akan memblokir deploy karena batas yang sudah dihapus.
3. **`verify:aliases`** — masih benar (memastikan hanya `bridge-links.js` yang memakai
   `makeHandler()`). Tidak perlu diubah.

---

## 7. Setelah deploy hijau — daftar verifikasi

1. Log deploy bersih — tidak ada `Failed to create function`.
2. `GET /.netlify/functions/ping` → `200`.
3. `POST /.netlify/functions/health` **tanpa** token → `401` (sebelumnya `404`).
4. `POST /.netlify/functions/health` **dengan** token + `?detail=1` → `200` + laporan lengkap.
5. **Uji FCM:** kirim satu notifikasi uji → pastikan sampai ke perangkat.
6. **Cek `sweep-queue` masih jalan** — lihat log tiap 2 menit (ini yang paling mungkin rusak
   diam-diam, karena jadwalnya berpindah tempat).
7. Baru lanjut ke gate Phase C §6: inject kegagalan DB → harap `status:"down"` + HTTP `503`.

---

## 8. Soal `HEALTH_TOKEN` yang sudah Anda buat

Sudah dibuat — bagus, itu satu hal yang tidak perlu diulang.

Yang perlu diketahui:

- **Belum bisa diuji sekarang.** Endpoint `/health` masih `404` karena deploy selalu mati di
  tahap function creation. Jadi `HEALTH_TOKEN` baru berguna **setelah** deploy berhasil.
- **Pastikan cakupannya mencakup Functions** (atau tanpa pembatasan). Kalau variabelnya
  dibatasi hanya ke Builds, `health.js` tidak akan bisa membacanya dan endpoint akan
  membalas `503` dengan alasan `HEALTH_TOKEN not configured` — itu perilaku *fail-closed*
  yang disengaja, tapi bisa membingungkan kalau tidak tahu.
- Setelah Opsi A, tambahan byte dari `HEALTH_TOKEN` dan variabel metrics **tidak lagi jadi
  masalah**.

---

## 9. Paket gratis — aman?

- **Format fungsi baru adalah produk Netlify Functions yang sama**, memakai kuota pemakaian
  yang sama. Tidak ada tingkatan baru yang harus dibeli untuk memakainya.
- **Yang butuh Pro adalah fitur *scopes*** untuk env var — dan setelah Opsi A kita justru
  tidak memerlukannya. Ini justru alasan tambahan memilih A dibanding B.
- Batas **5.000 karakter per nilai** env var tetap berlaku, tapi kunci Firebase kita
  (2.402 byte) jauh di bawah itu.
- Tidak ada fitur berbayar yang dipakai oleh rencana ini.

---

## 10. Yang menunggu keputusan Anda

1. **Setuju dengan Opsi A?** (rekomendasi saya)
2. Kalau ya, mau saya kerjakan sekarang — mulai dari tahap 0 (adaptor) supaya bisa diuji
   bertahap?
3. Pekerjaan opsi B yang belum di-commit: **di-commit** sebagai pondasi (adaptor + gate
   anggaran berguna), atau **ditahan** dulu sampai migrasi selesai? Rekomendasi saya:
   commit, tapi perbaiki dulu klaim di `netlify/functions/secrets/README.md` — sekarang file
   itu menyiratkan kunci dibaca dari file di produksi, padahal pada deploy dari Git tidak.
4. `HEALTH_TOKEN` — mau saya bantu siapkan perintah `curl` untuk uji setelah deploy?

---

## 11. Status pelaksanaan (2026-09-12, sesi kantor)

Opsi A dikerjakan, ditambah bagian C yang memang aman. **Belum di-commit, belum
di-deploy.**

### 11.1 Pendekatan: satu adaptor, bukan tulis ulang

Seluruh konversi dikumpulkan di **satu file baru**, `netlify/functions/_lib/netlify-adapter.ts`:

```
Request  --eventFromRequest()-->  event bentuk lama  -->  handler lama
outcome  --responseFromOutcome()-->  Response bentuk baru
```

Handler di entry point cukup dibungkus `adapt(...)`. Adaptor ini **dual-mode**:
diberi `Request` ia mengembalikan `Response`; diberi event lama ia mengembalikan
bentuk lama. Itu sebabnya seluruh logika wrapper, kernel (deadline, admission,
metrics, CORS, backpressure) dan 900+ test tidak perlu disentuh — dan migrasi
bisa dibalik satu file kalau ada yang salah di produksi.

### 11.2 Yang berubah

| Berkas | Perubahan |
|---|---|
| `_lib/netlify-adapter.ts` | **Baru.** Titik konversi tunggal (lihat §11.1). |
| 14 entry point surface | `require` → `import` (dengan ekstensi `.js`), `exports.handler = X` → `export default adapt(X)`. Logika tidak berubah. |
| `bridge-links.js` | sama, membungkus `makeHandler()`. |
| `ping.js`, `health.js`, `ingest.js`, `share-data.js` | handler jadi fungsi biasa, dibungkus `adapt()`. |
| `metrics-receiver.ts`, `sweep-queue.ts` | idem. Jadwal sweep pindah ke `export const config = { schedule: '*/2 * * * *' }`. |
| `netlify.toml` | Blok `[functions."sweep-queue"] schedule` dihapus. Entri `included_files` untuk kunci Firebase **dihapus** — lihat §11.4. |
| `verify-function-entries.mjs` | Menerima `export default` di samping `exports.handler`; bentuk lama tetap diterima supaya migrasi bisa dibalik. |
| `surface-binding.mjs` | Membaca `import { X } from './surfaces/y.js'`, dan klasifikasi narrow/catch-all mengenali `export default adapt(...)`. |
| `bundle-size.mjs` | Pengecualian catch-all mengenali bentuk baru. Tanpa ini `bridge-links` gagal gate — sudah terjadi saat gate pertama dijalankan. |
| `verify-env.mjs` | Anggaran 4 KB jadi **informasional** (batasnya tidak berlaku di runtime baru); hanya menggagalkan dengan `--budget-strict`. Ini sekaligus menyelaraskan kode dengan komentarnya sendiri, yang sejak awal menulis "warning by default". |
| `vitest.config.ts` | `testTimeout: 15000` ditambahkan **per project** — nilai di root ternyata tidak diwariskan (sama seperti `pool`), sehingga backend berjalan dengan default 5 detik. |
| `.gitattributes` | **Baru.** `*.mjs` dan `*.cjs` dipin ke LF — lihat §11.4. |

### 11.3 Test yang ikut disesuaikan

| Berkas | Alasan |
|---|---|
| `_lib/kernel/health-entrypoint.test.ts` | Loader `vm` + shim CommonJS diganti `import` biasa + `vi.mock('../health.js')`. 19 test perilakunya tidak berubah; ditambah assertion struktural bahwa entry memang ESM dan impor `_lib/health` tetap **lazy**. |
| `e2e/share-data.test.ts` | Sama: `vi.mock` menggantikan `require` yang ditulis ulang. |
| `_lib/metrics-receiver.test.ts` | Impor `{ handler }` → default export. |
| `indexer/src/parse.test.ts` | Test `auth.js` diubah dari "CommonJS require + exports.handler" menjadi "ESM + default export". |
| `indexer/src/{discover,build}.test.ts` | Sensus file: **347 → 349** (+2 ts: adaptor dan test anggaran). Populasi simbol: 14.250, envelope 14.200 → 14.750 (headroom ~500, sama seperti sebelumnya). |

### 11.4 Dua temuan tak terduga

1. **Entri `included_files` untuk kunci Firebase dihapus.** File itu di-gitignore,
   dan Netlify membangun dari clone Git — jadi glob-nya **tidak mungkin cocok** di
   build produksi. Membiarkannya hanya menambah risiko pada deploy yang sedang
   diperbaiki. `_lib/fcm-server.ts` tetap mencoba file lebih dulu lalu jatuh ke env
   var, jadi `netlify dev` lokal dan deploy CLI manual tetap jalan. **Kredensial
   Firebase tetap di env var** dan FCM tidak berubah sama sekali.
2. **CRLF pada `.mjs` mematikan test.** `scripts/ci/verify-env.mjs` dengan CRLF
   membuat vitest gagal dengan `SyntaxError: Invalid or unexpected token` tanpa
   lokasi, sementara Node sendiri mengimpor file yang sama tanpa keluhan. Sudah
   direproduksi bolak-balik pada isi yang identik. Karena repo memakai
   `core.autocrlf=true`, clone baru di Windows akan memberi CRLF — jadi `.gitattributes`
   memin `*.mjs`/`*.cjs` ke LF supaya deterministik.

### 11.5 Hasil verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `npm run ci:quality` (9 gate + test) | **LULUS** — 111 berkas test, **991 test** |
| `verify:binding` | LULUS — 13 narrow, 1 catch-all (`bridge-links`), 4 bespoke |
| `verify:aliases` | LULUS — hanya `bridge-links.js` memakai `makeHandler()` |
| `verify:entries` | LULUS — 20 entry point root |
| `bundle:size` | LULUS — total 2.384,8 KB, `bridge-links` dikecualikan sebagai catch-all |
| Bundling dengan **bundler Netlify** (`zip-it-and-ship-it`), bukan esbuild sendiri | **20/20 function keluar sebagai ESM dengan default export** (`export { x as default }` dalam `.mjs`) |
| `sweep-queue` | `export { config, … }` dengan `schedule: "*/2 * * * *"` ikut terbawa di bundel |

Catatan: probe esbuild biasa **tidak membuktikan apa pun di sini** — untuk
`--platform=node` esbuild default-nya CommonJS, jadi hasilnya `module.exports`
walaupun sumbernya ESM. Yang menentukan adalah bundler Netlify.

### 11.6 Yang belum dikerjakan

1. **Commit.** Belum ada commit; working tree bersih dari berkas sementara.
2. **Deploy** ke Deploy Preview lebih dulu, lalu `main`.
3. **Verifikasi pasca-deploy** — daftar di §7, plus cek log bahwa `sweep-queue`
   masih berjalan tiap 2 menit (satu-satunya perubahan yang bisa rusak diam-diam).
4. **Opsi C (variabel mati)** belum dijalankan; setelah Opsi A ini murni kebersihan,
   bukan lagi keharusan. Yang paling layak: `NETLIFY_AUTH_TOKEN` — kredensial
   deploy yang tidak dibaca fungsi mana pun.
5. **`surfaces/` masih ter-deploy sebagai satu function tanpa default export**
   (terlihat di bundler Netlify). Itu utang Phase A yang sudah diketahui, bukan
   akibat migrasi ini, dan bukan penyebab deploy gagal.
