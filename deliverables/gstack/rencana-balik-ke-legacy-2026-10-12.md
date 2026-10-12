# Rencana balik ke DB legacy — apa yang perlu, dan apa yang TIDAK perlu

Tanggal pengukuran: **2026-10-12**. Semua angka di bawah **diukur**, bukan diperkirakan.  
Cara ukur tertulis di tiap bagian supaya bisa diulang.

---

## TL;DR — jawaban tiga pertanyaan pemilik

| Pertanyaan                                    | Jawaban                                                                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "apa perlu SQL dll?"                          | **PERLU — dan sudah dijalankan.** gdw sudah dimigrasi `001`–`016`: **16/16 applied · 0 pending · 0 drifted**, kontrak `missing 0 required`, RLS **26/26 tabel**. Rincian + bukti di **bagian 0**. |
| "mana-mana key yang butuh?"                   | Dua kunci: **`SUPABASE_DB_URL`** dan **`SUPABASE_JWT_SECRET`** — **keduanya sudah diisi** (bagian 0). Yang belum: kunci yang sama harus diisi di **env Netlify produksi**. |
| "hasil upgradean di cadangan masuk ke legacy" | **Nol baris perlu dipindah.** Data kandidat tidak perlu pindah (gdw justru lebih lengkap); `Magang` masuk sendiri lewat migrasi `015`; `cv_template` sengaja tidak disalin (bagian 2). |
| "netlify env juga sudah bener kan?"           | **BELUM.** Server yang tayang sekarang masih menunjuk **cadangan (bimq)** — terukur dari sistem yang berjalan.                                                                    |

Catatan penting soal "jadi gak perlu sql kan okey": itu **benar untuk perbaikan kode** sesi ini  
(golongan darah, status pernikahan, label cuaca dingin) — tidak ada SQL untuk itu.  
Yang butuh SQL adalah **perpindahan DB-nya**, dan itu masalah terpisah — dan SQL itu **sudah dijalankan**.

---

## 0. STATUS — apa yang sudah selesai

Diperbarui **2026-10-12** setelah langkah-langkahnya benar-benar dijalankan dan diukur ulang.

| # | Langkah                                        | Status                                                                                                                                            |
| - | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `SUPABASE_DB_URL` untuk gdw                    | ✅ **selesai** — `Direct_Connection_DB` di `.env.local`; `migrate.mjs status` tidak lagi `CONFIG ERROR`                                            |
| 2 | `SUPABASE_JWT_SECRET` = `Legacy JWT Secret` gdw | ✅ **selesai** — diverifikasi HMAC **dan** end-to-end (`service_role` → 200, `anon` → 401, key palsu → `PGRST301`)                                  |
| 3 | Migrasi `001`–`016` ke gdw                     | ✅ **selesai** — `16/16 applied · 0 pending · 0 drifted`; ledger `schema_migrations` terbentuk; RLS **26/26**                                       |
| 4 | Data `sys_config` (`Magang`)                   | ✅ **selesai** — migrasi `015` menyisipkannya sendiri; terukur gdw `sys_config` **158 → 159**                                                       |
| 5 | Env Netlify produksi → gdw                     | ⏳ **BELUM** — butuh akses dashboard; `PUBLIC_*` di-bake saat build ⇒ wajib **redeploy**, bukan sekadar ganti env                                   |
| 6 | Verifikasi setelah deploy                      | ⏳ menunggu langkah 5                                                                                                                              |

Bukti mentah langkah 3–4, dijalankan berurutan, semuanya hijau:

```
$ node scripts/migrate.mjs status
  16 migrations · 16 applied · 0 pending · 0 drifted

$ npm run verify:db
  tables 14 · rpc 4 · column contracts 2 · missing 0 required / 0 optional
  DATABASE CONTRACT OK

$ npm run verify:schema
  SCHEMA IN SYNC  netlify/functions/_lib/db/schema.generated.ts · 26 tables · sha256:f9f3139f6a91

$ npm run verify:projections
  NO WILDCARD PROJECTIONS  205 files scanned under netlify/functions/

$ node /f/tmp/verify-gdw.mjs
  tabel=26  RLS aktif=26  selisih=0
  GRANT ke anon: 12 baris — hanya di 3 tabel kandidat (sesuai desain 012)
```

**Dua cacat tambahan yang ketemu saat langkah 3 dan sudah ditutup** (commit `fea4537`):

1. **`schema.generated.ts` ternyata digenerate dari bimq**, bukan dari DB yang dipakai kode.
   Akibatnya kolom `ai_form_submissions.submitted_by` — yang **ada di gdw** dan **43/43 barisnya
   terisi** — tidak ada di kontrak, padahal produksi menulis ke tabel itu. Digenerate ulang dari
   gdw: `SCHEMA IN SYNC`, **25 → 26 tabel**.
2. **`database_asj_kontak` tidak ada di `.ci/db-contract.json`** padahal tabel itu dibaca **dan**
   ditulis `contexts/contact/repository.ts`. Ditambahkan sebagai `required` — tanpa ini, deploy di
   atas DB yang belum dimigrasi akan menjawab **200 dan menyimpan nol pesan**, kegagalan senyap.

**Satu langkah tersisa: bagian 5 — ubah env Netlify produksi ke gdw, lalu redeploy.**

---

## 1. Keadaan yang terukur sekarang

### 1a. Server yang tayang memakai DB mana?

Diukur dengan memanggil permukaan `diagnostics` di situs yang tayang (login admin, lalu  
`getAppConfig`) — permukaan itu menanyakan PostgREST-nya sendiri, jadi jawabannya adalah  
daftar tabel **DB yang benar-benar dipakai server**, bukan tebakan:

|                     | gdw (legacy) | bimq (cadangan) | server `asjastro.netlify.app` |
| ------------------- | ------------ | --------------- | ----------------------------- |
| jumlah tabel        | **20**       | **25**          | **25**                        |
| `job_queue`         | ✗            | ✓               | ✓                             |
| `rate_counters`     | ✗            | ✓               | ✓                             |
| `schema_migrations` | ✗            | ✓               | ✓                             |
| `dependency_calls`  | ✗            | ✓               | ✓                             |
| `idempotency_keys`  | ✗            | ✓               | ✓                             |

**Daftar tabel server tayang = daftar tabel bimq, persis.** Jadi server produksi masih di cadangan.

> ⚠ Angka **20** untuk gdw di tabel ini adalah keadaan **sebelum** migrasi `001`–`016`.
> Setelah migrasi (bagian 0) gdw menjadi **26 tabel** — jadi penanda pembeda yang dipakai di
> bagian 4 sekarang `database_asj_kontak`, bukan `job_queue` (yang kini ada di KEDUA DB).

Dikonfirmasi kedua kalinya lewat endpoint **publik** `getAppData` (tanpa login), dua penanda  
yang hanya berbeda di satu DB:

|                       | `asjastro.netlify.app` | `asjportal.netlify.app` | gdw     | bimq    |
| --------------------- | ---------------------- | ----------------------- | ------- | ------- |
| jumlah job            | 158                    | 159                     | **159** | **158** |
| ada kategori `Magang` | ya                     | tidak                   | tidak   | **ya**  |
| ada job `TG666ASJ`    | tidak                  | ya                      | **ya**  | tidak   |
| ⇒ DB                  | **bimq**               | **gdw**                 | —       | —       |

Jadi: **situs lama (`asjportal`) memang di legacy seperti kata pemilik; situs baru (`asjastro`)  
masih di cadangan.** Ini yang harus dibalik.

### 1b. Apa yang tadinya kurang di gdw (potret SEBELUM migrasi)

`node scripts/ci/verify-migrations.mjs` (kontrak di `.ci/db-contract.json`), dijalankan terhadap gdw:

```
MISS  col  database_candidate(status_biodata)   ← kolom hilang (33 kolom terlihat)
MISS  tbl  job_queue                required
MISS  tbl  rate_counters            required
MISS  fn   claim_next_job           required
MISS  fn   rate_limit_check         required
MISS  fn   rate_limit_fail          required
--- opsional (fitur turun, situs tetap jalan) ---
MISS  tbl  dependency_calls · idempotency_keys · fn reclaim_stuck_jobs
DATABASE CONTRACT FAILED — deploy blocked.
```

Terhadap **bimq**, kontrak yang sama hanya kurang **satu** hal: kolom `status_biodata`.  
Artinya cadangan pun belum sepenuhnya di-migrasi — ledgernya berhenti di `012`  
(dibaca dari `schema_migrations`: 12 baris, `001`–`012`).

|      | 001–012          | 013 `status_biodata` | 014 `database_asj_kontak` | 015 `Magang` (data) | 016 (7 kolom master) |
| ---- | ---------------- | -------------------- | ------------------------- | ------------------- | -------------------- |
| gdw  | ? (tanpa ledger) | ✗                    | ✗                         | ✗                   | ✓ (kolom sudah ada)  |
| bimq | ✓                | **✗**                | ✗                         | ✓                   | ✓                    |

### 1c. Kenapa `migrate:up` tadinya tidak bisa jalan

```
$ node scripts/migrate.mjs status
CONFIG ERROR  migrate: connection string Postgres tidak ditemukan.
```

`migrations/*.sql` dijalankan lewat koneksi Postgres langsung, **bukan** lewat PostgREST —  
jadi `SUPABASE_URL` + service key saja tidak cukup. Yang dibaca runner:

- `process.env.SUPABASE_DB_URL` (atau `DATABASE_URL`), atau
- `.env.local` → `Direct_Connection_DB=<url>`

**Tidak satu pun ada sekarang.** Ini kunci yang harus diambil dari  
Supabase → project **gdw** → Settings → Database → Connection string.

### 1d. Apakah `SUPABASE_JWT_SECRET` yang ada sudah benar?

**Belum — masih placeholder.** Di `.env` dan `.env.local`:

```
SUPABASE_JWT_SECRET=CHANGE_ME__gdw_jwt_secret_from_supabase_dashboard
```

Diverifikasi secara kriptografis (anon/service key Supabase adalah JWT yang ditandatangani  
HS256 dengan JWT secret project itu — kalau tanda tangannya cocok, secret-nya memang milik  
project tersebut):

| yang diuji                                                                      | hasil                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Legacy JWT Secret` (dari `F:\env legacy.txt`, 88 karakter) vs anon key **gdw** | **cocok** ✓                                                |
| `Legacy JWT Secret` vs service key **gdw**                                      | **cocok** ✓                                                |
| placeholder di `.env` vs anon key gdw                                           | tidak cocok ✗                                              |
| kontrol: secret bimq vs anon key bimq                                           | cocok ✓                                                    |
| kontrol: secret legacy vs anon key bimq                                         | tidak cocok ✓ (membuktikan metode ini bukan positif palsu) |

Jadi nilai yang benar **sudah ada** di `F:\env legacy.txt` (`Legacy JWT Secret`),  
dan sudah terbukti milik gdw.

**Akibat kalau dibiarkan placeholder** (`_lib/kernel/db.ts:52`): `createSupabaseJwt()` gagal,  
dan PostgREST menolak tulisannya — inilah **401 PGRST301** pada Mail approve/review/reject,  
hapus form, dan `patchJob`. Daftar pelamar tetap jalan karena lewat service-role.

### 1e. Apakah gdw lebih longgar dari bimq? (diperiksa, bukan diasumsikan)

Dengan **anon key** (bukan service role):

| tabel                       | gdw              | bimq             |
| --------------------------- | ---------------- | ---------------- |
| `database_candidate`        | 200, **0 baris** | 200, **0 baris** |
| `master_database_candidate` | 200, **0 baris** | 200, **0 baris** |
| `database_asj_form`         | 200, **0 baris** | 200, **0 baris** |
| `sys_config`                | 200, **0 baris** | **401 ditolak**  |
| `user_sessions`             | 200, **0 baris** | **401 ditolak**  |

**Tidak ada kebocoran data di keduanya** (0 baris = RLS aktif menahan). Yang berbeda hanya  
postur izin: bimq sudah mencabut GRANT untuk anon (401), gdw masih memberi GRANT lalu  
mengandalkan RLS. Itu kerja migrasi `012_rls_lockdown.sql` yang belum pernah masuk gdw.  
Bukan alasan panik — tapi alasan menyertakan 012 dalam rencana, bukan melewatinya.

---

## 2. Data: apa yang perlu pindah dari cadangan ke legacy

Dibandingkan baris-per-baris. **gdw adalah kumpulan data yang lebih lengkap**, jadi arah  
perpindahannya kecil sekali:

| tabel                       | gdw     | bimq | perlu pindah?                                  |
| --------------------------- | ------- | ---- | ---------------------------------------------- |
| `database_candidate`        | **226** | 225  | **tidak** — gdw lebih banyak                   |
| `master_database_candidate` | **234** | 225  | **tidak**                                      |
| `database_asj_form`         | **51**  | 19   | **tidak**                                      |
| `job_database`              | **159** | 158  | **tidak** (gdw punya 1 job ekstra: `TG666ASJ`) |
| `pemberkasan_checklist`     | **7**   | 4    | **tidak** (keempat id bimq ada semua di gdw)   |
| `fcm_tokens`                | 65      | 30   | tidak                                          |
| `job_queue`                 | —       | 0    | tidak (kosong)                                 |
| `rate_counters`             | —       | 25   | tidak (keadaan sesaat)                         |
| `dependency_calls`          | —       | 185  | tidak (telemetri)                              |
| `idempotency_keys`          | —       | 0    | tidak (kosong)                                 |
| `sys_config`                | 158     | 160  | **YA — 2 baris** (di bawah)                    |

### Yang tadinya perlu dipindah: 2 baris `sys_config` → ternyata **0**

```
list_kategori = Magang
  → kategori lowongan baru (kode loker GJ<N>ASJ). TANPA baris ini, dropdown
    kategori di form Tambah Job tidak menawarkan "Magang".

cv_template = {"id":"tpl-tes", "nama":"tes", "tipe":"xlsx",
               "fileUrl":"https://bimqyugdhiuxcqltjjnt.supabase.co/storage/…/cv-templates/tpl-tes.xlsx",
               "contohWa":"085790618025", "aktif":true, "updatedAt":"2026-10-10…"}
  → template CV yang didaftarkan 2026-10-10. DUA hal yang harus diperhatikan:
      (1) `fileUrl`-nya menunjuk bucket storage **bimq** — akan tetap jalan selama
          project bimq hidup, tapi jadi ketergantungan lintas-project; berkasnya
          sebaiknya diunggah ulang ke bucket gdw;
      (2) `contohWa` berisi nomor WhatsApp asli — jangan disalin sembarangan.
```

`Magang` **sudah** masuk sendiri lewat migrasi `015` (idempotent lewat `WHERE NOT EXISTS`) —  
terukur: gdw `sys_config` **158 → 159**. Jadi baris itu **tidak perlu dipindah manual**.

### `cv_template` — diukur, lalu diputuskan TIDAK disalin

Tiga alasan, semuanya dari pengukuran di atas:

1. **Itu entri uji, bukan template sungguhan** — `nama` = `"tes"`, dan `fieldMap` **kosong**.
   Menyalinnya ke produksi mendaftarkan template kosong sebagai satu-satunya pilihan.
2. **`fileUrl`-nya menunjuk bucket bimq**, dan bucket `cv-templates` di gdw terukur **kosong**.
   Jadi berkasnya memang tidak ada di sana — ini ketergantungan lintas-project, bukan URL yang
   cukup diganti string-nya.
3. **`contohWa` berisi nomor WhatsApp asli** — menyalinnya menyebarkan nomor itu ke DB lain.

⇒ Cara yang benar: **buat template baru lewat UI admin di gdw**, supaya berkasnya mendarat di  
bucket gdw dan `fieldMap`-nya terisi. Kalau memang belum ada template sungguhan, lebih baik  
dropdown-nya kosong daripada berisi entri `"tes"`.

Tidak ada satu pun baris di gdw yang tidak ada di bimq — jadi tidak ada risiko tertimpa.

---

## 3. Urutannya (jangan dibalik)

Aturan yang sudah tertulis di memori proyek: **migrasi DULU, deploy kode kemudian.**  
PostgREST menolak SELURUH baris kalau satu kunci bukan kolom (**400 PGRST204**) — jadi  
kode baru di atas skema lama membuat semua field gagal, bukan hanya yang baru.

1. ✅ **Sediakan `SUPABASE_DB_URL` untuk gdw.** — *selesai*  
   Diambil dari Supabase → gdw → Settings → Database → Connection string.  
   Disimpan sebagai `Direct_Connection_DB=…` di `.env.local`.  
   → bukti: `node scripts/migrate.mjs status` tidak lagi `CONFIG ERROR`.
2. ✅ **Perbaiki `SUPABASE_JWT_SECRET`** di `.env` / `.env.local` dengan — *selesai*  
   `Legacy JWT Secret` dari `F:\env legacy.txt` (sudah terbukti milik gdw).  
   → bukti: verifikasi HMAC terhadap anon key gdw = cocok; end-to-end `service_role` → 200.
3. ✅ **Jalankan migrasi ke gdw.** `node scripts/migrate.mjs up` — *selesai*  
   gdw belum punya `schema_migrations`, jadi semua `001`–`016` dijalankan sekaligus.  
   Semua migrasi idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,  
   `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS`, `ALTER TABLE IF EXISTS`) —  
   sudah diperiksa satu per satu. Migrasi `013` bahkan memverifikasi dirinya sendiri dan  
   `RAISE EXCEPTION` kalau kolom/constraint/trigger-nya tidak sesuai.  
   → bukti: `16 migrations · 16 applied · 0 pending · 0 drifted`;  
     `npm run verify:db` → **0 required hilang**; RLS **26/26**.
4. ✅ **`sys_config`** (bagian 2) — *selesai, dan ternyata nol baris yang perlu dipindah.*  
   Migrasi `015` menyisipkan `Magang` sendiri (terukur `158 → 159`); `cv_template`  
   sengaja **tidak** disalin (alasannya di bagian 2).
5. ⏳ **Ubah env Netlify produksi ke gdw** — *satu-satunya langkah tersisa.*  
   Kunci yang harus menunjuk gdw:  
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,  
   `SUPABASE_JWT_SECRET`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.  
   Perhatikan: `PUBLIC_*` ikut **di-bake saat build**, jadi harus **redeploy**, bukan  
   sekadar ganti env.
6. ⏳ **Deploy, lalu verifikasi** (bagian 4).

Catatan: **jangan push** sebelum env Netlify diubah. Satu push = satu deploy berbayar  
(aturan pemilik), dan deploy di atas skema yang belum dimigrasi justru merusak —  
sekarang skemanya sudah siap, jadi push berikutnya memang akan mem-publish ke produksi.

---


## 4. Verifikasi setelah selesai (bukan "sepertinya sudah benar")

1. `node scripts/ci/verify-migrations.mjs` → `missing 0 required`.
2. Panggil `diagnostics`/`getAppConfig` di situs yang tayang → daftar tabel harus  
   **26 tabel** dan **memuat `database_asj_kontak`**. Pembeda dari bimq sekarang adalah  
   tabel ke-26 itu — `job_queue` tidak lagi bisa dipakai sebagai penanda, karena setelah  
   migrasi ia ada di KEDUA DB.
3. Panggil endpoint publik `getAppData` → harus menampilkan **159 job** dan **ada**  
   `TG666ASJ`; kategori `Magang` juga ada (dari migrasi 015).
4. Uji tulis yang tadinya 401: **Mail approve/review/reject**, hapus form, `patchJob` —  
   ini yang membuktikan `SUPABASE_JWT_SECRET` benar.
5. Cek satu kandidat di `/loker` dan satu CV di admin — bukti baca + tulis jalan.

---

## 5. Yang TIDAK perlu dikerjakan

- **Tidak perlu memindahkan data kandidat.** gdw sudah lebih lengkap di setiap tabel  
  kandidat/lamaran (226 vs 225 · 234 vs 225 · 51 vs 19).
- **Tidak perlu SQL untuk perbaikan kode sesi ini.** Golongan darah, status pernikahan  
  (`CERAI MENINGGAL`), dan label cuaca dingin semuanya perubahan kode + label.
- **Tidak perlu menyentuh `E:/asj-company-profile`.** Repo itu terpisah (`/` + `404`);  
  perubahan di sini tidak menyeberang ke sana.
- **Tidak perlu mengejar `dependency_calls`, `idempotency_keys`, `reclaim_stuck_jobs`** —  
  kontraknya `optional`; tanpa itu fitur turun, situs tetap jalan.

---

## 6. Sisa risiko yang harus disadari

- **`cv_template.fileUrl` menunjuk bucket bimq.** Jalan selama bimq hidup; kalau bimq  
  dihapus, template itu mati. Unggah ulang berkasnya ke bucket gdw.
- **Postur izin gdw lebih longgar** daripada bimq (anon masih diberi GRANT; RLS yang  
  menahan — terukur 0 baris, jadi bukan kebocoran). Migrasi `012` menutupnya.
- **`015` menjatuhkan CHECK constraint `kategori` di `job_database` kalau ada.** Itu  
  memang tujuannya (supaya `Magang` bisa dipakai) dan sudah defensif; di DB nyata  
  constraint itu kemungkinan besar tidak ada.
- **Situs lama (`asjportal`) dan situs baru (`asjastro`) menunjuk DB berbeda.** Selama  
  masa transisi, admin yang bekerja di situs baru tidak melihat perubahan dari situs lama  
  dan sebaliknya. Ini hilang begitu keduanya menunjuk gdw.
