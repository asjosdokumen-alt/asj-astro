# Rencana migrasi: Neon + akun Netlify baru

Dokumen ini menjawab tiga hal yang Anda minta, terverifikasi langsung ke kedua
basis data pada 2026-10-20:

1. **Data di Neon sudah identik dengan Supabase** — lihat `LAPORAN-CHECK-DATA.md`.
2. **Env var apa saja yang harus diganti** — bagian 3, plus berkas siap-pakai
   `ENV-BARU-NEON.env`.
3. **Detail lengkap pindah akun Netlify** (kuota build habis) — bagian 5.

## 0. Ringkasan keputusan

| Pertanyaan | Jawaban |
|---|---|
| Data Neon = Supabase? | **Ya, 100 %.** 26 tabel cocok kolom+tipe+jumlah+isi baris. Bukti: `verify-db-parity.mjs` (exit 0). |
| Cukup ganti env saja? | **Hampir.** Backend bicara PostgREST lewat HTTP, bukan Postgres langsung. Neon punya Data API yang kompatibel PostgREST (bagian 2) — jadi cukup ganti nilai env. |
| Ukuran DB | 11 MB. Batas Supabase Free 500 MB — ukuran bukan penyebab limit. |
| Penyebab limit | Egress. Anda benar: jawaban PostgREST ikut dihitung, dan `master_database_candidate` 176 kolom membuat jawabannya besar. |
| Kuota build Netlify | Masalah **terpisah** dari DB. Selesaikan di bagian 5. |
| Effort | Jalur A: ±1 hari + 1 gate uji 15 menit. |

### Kenapa pindah ke Neon masuk akal walau DB hanya 11 MB

Ukuran DB bukan masalah. Yang paling besar mengalir keluar adalah **jawaban
PostgREST**, bukan ukuran basis datanya:

- `master_database_candidate` = 176 kolom. Satu baris ≈ 1,14 KB, dan riwayat
  pendidikan + pekerjaan + keluarga terkumpul di satu baris itu.
- Setiap kali admin membuka tab kandidat, seluruh 176 kolom keluar sebagai JSON.
- Supabase Free menghitung itu sebagai egress, kuotanya 5 GB/bulan.

Jadi intinya: **Neon lebih lega bukan karena Postgres-nya lebih besar, tapi
karena kuota egress free tier-nya lebih longgar daripada 5 GB Supabase.**
Justifikasi Anda benar; mekanismenya beda dari "DB 11 MB".

## 1. Dua pekerjaan yang harus dipisahkan

| # | Pekerjaan | Penyebab | Menyentuh kode? |
|---|---|---|---|
| 1 | Kuota build Netlify habis | Free = 300 menit/bulan. Banyak karena tiap push = 1 build. | Tidak |
| 2 | Pindah DB Supabase → Neon | Egress/bandwidth | Ya, kecil |

#1 tidak ada hubungannya dengan #2. Pindah basis data tidak menambah/mengurangi
build minutes. Akun Netlify baru tidak membuat migrasi DB lebih mudah atau
lebih sulit. Kerjakan berurutan sesuai bagian 5 dan 6.

## 2. Apa yang sebenarnya terhubung ke Supabase

Hasil pembacaan kode, bukan tebakan. Supabase dipakai di **tiga lapis**, dan
hanya satu yang Anda pindahkan.

| Lapis | Dipakai? | Di mana | Kalau pindah ke Neon |
|---|---|---|---|
| **PostgREST (HTTP)** | **YA — inti backend** | `netlify/functions/_lib/db/client.ts` (592 baris). 45 berkas backend memanggil `supabaseJson()` / `supabaseUpsert()`. | Neon punya **Data API** kompatibel PostgREST → ganti nilai `SUPABASE_URL` |
| **Storage (HTTP)** | **YA, 3 jalur** | `netlify/functions/_lib/storage.ts` (282 baris): `uploadBase64()` dipanggil dari `documents/service.ts` (3 tempat) untuk upload CV/berkas sisi admin. | **Neon tidak punya Storage.** Pilih salah satu: biarkan Storage di Supabase, atau alihkan ke Cloudinary (2.4) |
| **Auth (GoTrue)** | **TIDAK** | `src/store/userStore.ts` memanggil `supabase.auth.signInWithPassword()` — tapi tidak ada satu pun pemanggilnya di UI. Login kandidat lewat aksi `loginKandidat` → tabel `user_sessions`. | Bisa dimatikan. 0 dampak. |
| **SQL langsung** | TIDAK | Tidak ada `pg` di kode produksi; `SUPABASE_DB_URL`/`Direct_Connection_DB` tidak pernah dibaca berkas `.ts`/`.js`/`.mjs` mana pun. | — |

### 2.1 Neon Data API — kunci yang membuat migrasi ini kecil

Sudah diuji langsung dari mesin ini:

```
$ curl https://ep-bold-sunset-b3zy6wb1.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1/wa_templates?select=nama
{"message":"missing authentication credentials: required authorization bearer token in JWT format",
 "code":null,"detail":null,"hint":null}
```

Itu **format error PostgREST**. Artinya Neon memang menjalankan PostgREST dan
hanya perlu base URL + bearer token. Tidak ada `pg_driver`, tidak ada rewrite
SQL, tidak ada arsitektur baru. Pattern:

```
https://<endpoint-id>.apirest.<region>.aws.neon.tech/<nama-db>
```

Untuk proyek Anda: `https://ep-bold-sunset-b3zy6wb1.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb`

⚠ Perhatikan: **tanpa** `/rest/v1` di belakang. Kode
`_lib/db/client.ts` yang menambahkan `/rest/v1/` sendiri, sama seperti yang
dilakukannya untuk Supabase sekarang.

### 2.2 GATE yang harus diuji lebih dulu (penentu apakah jalur ini bisa jalan)

Backend Anda memakai **service role**, yang sifatnya **melewati RLS**. Ini bukan
detail kecil: RLS aktif di **26 dari 26 tabel**, tapi hanya ada **3 policy**.
Akibatnya, 23 tabel hanya bisa dibaca kalau peran yang masuk melewati RLS.

Neon Data API mengautentikasi dengan **JWT**, dan dokumentasinya menyebut ada
dua peran: `authenticated` (user login) dan `anonymous` (publik). Keduanya
**terikat RLS**. Kalau ternyata tidak ada cara mendapat JWT berperan pemilik
(BYPASSRLS), backend akan membaca **0 baris dari 23 tabel** saat cutover.
Itu kegagalan sunyi — bukan error, hanya data kosong.

**Uji 15 menit ini menentukan segalanya. Lakukan sebelum menyentuh Netlify:**

1. Neon Console → project Anda → **Data API** → Enable (pilih branch & database `neondb`).
2. Salin **API endpoint**-nya, cocokkan dengan pola di 2.1.
3. Buat JWT / key (di console biasanya dipilih peran databasenya).
4. Uji langsung, tanpa menyentuh kode:
   ```bash
   curl -sS 'https://ep-bold-sunset-b3zy6wb1.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1/sys_config?select=config_type&limit=3' \
     -H "Authorization: Bearer <TOKEN>"
   ```
   - **Baris keluar** → gate lolos. Lanjut Jalur A.
   - **`[]` (kosong) atau 401 / permission denied** → RLS memblokir. Jangan
     paksa. Naik ke Jalur B (2.3).
   - Uji juga satu tabel baca-tulis kecil (`wa_templates`), satu `rpc`
     (`claim_next_job`), dan satu `upsert` — karena `Prefer: return=representation`
     dan `on_conflict` dipakai 8 kali masing-masing di kode Anda.

### 2.3 Kalau gate gagal: dua jalur cadangan

**Jalur B — jalankan PostgREST sendiri, tunjuk ke Neon.** Paling aman secara
kode: **nol perubahan kode**, termasuk perilaku service role tetap identik
dengan sekarang, karena PostgREST-nya memang asli dan Anda pegang konfigurasinya.

- Render / Fly.io / Railway, image resmi `postgrest/postgrest`.
- Koneksi ke **pooler** Neon (bukan direct), karena PostgREST memegang koneksi
  terlalu lama untuk direct connection Neon.
- `SUPABASE_URL` = URL servis itu, `SUPABASE_SERVICE_ROLE_KEY` = service-role JWT
  yang Anda keluarkan sendiri (klaim `role: service_role`).
- Biaya ops: satu servis lagi yang harus hidup. Kalau servis gratis sleep,
  backend ikut tidur. Ini harga untuk nol perubahan kode.

**Jalur C — `pg` di dalam Netlify Function.** Semua 45 pemanggil tetap utuh
karena permukaan API `client.ts` sama (`supabaseJson`/`supabaseUpsert`); yang
ditulis ulang hanya bagian dalamnya menerjemahkan dialek query-string PostgREST
ke SQL. Terukur dan sebenarnya tidak besar karena yang Anda pakai sedikit:

| Fitur PostgREST | Jumlah pemakaian di repo |
|---|---|
| Embedded select (`select=*,tbl(...)`) | **0** |
| `Prefer: return=representation` | 8 |
| `on_conflict=` | 8 |
| Filter (`eq.`, `in.`, `gte.`), `order`, `limit` | tersebar, polanya sederhana |

Tapi `pg` masih di `devDependencies` — harus dipindah ke `dependencies` supaya
ikut ter-bundle ke Netlify Function. Risiko regresinya paling tinggi dari tiga
jalur. **Hindari kalau A atau B bisa jalan.**

### 2.4 Storage: satu hal yang WAJIB diputuskan apa pun jalurnya

Neon tidak punya Storage. Tiga jalur `uploadBase64()` di
`netlify/functions/contexts/documents/service.ts` menulis berkas admin (CV,
dokumen kandidat) ke Supabase Storage. Kalau Supabase dimatikan total, jalur itu
mati.

Jalur perbaikannya sudah ada dan sudah teruji di repo ini untuk sisi **klien**:
`src/lib/uploadBerkas.ts` sudah upload ke Cloudinary dan menjelaskan sejarahnya
(dulu pindah ke Supabase 2026-09-08, pindah balik 2026-10-14 karena egress).

Dua pilihan:

| Opsi | Yang dikerjakan | Risiko |
|---|---|---|
| **A — biarkan Storage di Supabase** | Tidak ada. Storage Supabase bukan Postgres, tidak ikut "pindah DB". | Rendah. Supabase Storage tetap ada (dan tetap punya kuota egress-nya sendiri). |
| **B — pindahkan sisi server ke Cloudinary** | `uploadBase64()` memanggil helper Cloudinary yang sudah ada. Kontraknya sengaja dibuat stabil — 3 pemanggil tidak perlu disentuh. | Sedang. Ada 3 jalur, perlu diuji. |

**Rekomendasi: opsi A dulu.** Supabase Storage dan database Neon bisa hidup
bersama dengan tenang; keduanya hanya berbagi env var, bukan satu layanan.
Kerjakan B hanya kalau Supabase Storage nanti jadi masalah kuota juga — bukan
sebelum itu.

### 2.5 Nama variabel tidak perlu diubah

Anda meminta "db baru neon bukan db superbase lagi". Perlu diluruskan: **nama
variabel env tidak menentukan basis datanya — nilainya yang menentukan.** Kode
hanya membaca `env('SUPABASE_URL')` dan memakainya sebagai origin HTTP. Selama
nilainya menunjuk Neon, yang terjadi adalah migrasi.

Apakah namanya juga harus diganti? Saya sarankan **TIDAK**:

| Opsi | Berapa berkas + nilai tersentuh | Risiko |
|---|---|---|
| Pertahankan nama `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **0** | Nol. Nilainya yang berubah. |
| Ganti jadi `NEON_DATA_API_URL` / `NEON_DATA_API_TOKEN` | 3 berkas (`_lib/db/client.ts`, `_lib/env.ts`, `.env*`) + semua nilai di UI Netlify | Ada. Satu yang terlewat = backend mati diam-diam. |

Dan yang penting: `netlify/functions/_lib/env.ts` menyaring daftar putih nama
variabel. Menambah nama baru berarti mengedit whitelist itu juga. Kalau nanti
terasa mengganggu secara nama, kerjakan sebagai **commit terpisah setelah
cutover sukses** — satu perubahan yang selesai dulu, baru yang berikutnya.

## 3. Daftar env lengkap

Daftar lengkap dengan nilai ada di **`ENV-BARU-NEON.env`** di folder yang sama.
Ringkasannya:

| Env | Aksi | Nilai / catatan |
|---|---|---|
| `SUPABASE_URL` | **Ganti nilai** | `https://ep-bold-sunset-b3zy6wb1.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Ganti nilai** | JWT Neon Data API (dari Neon Console). |
| `SUPABASE_ANON_KEY` | **Hapus** | Backend tidak pernah memakainya; hanya fallback. |
| `SUPABASE_JWT_SECRET` | **Hapus** | Hanya dipakai `kernel/db.ts` untuk memverifikasi JWT Supabase. Setelah auth GoTrue dibuang, tidak ada JWT dari luar. |
| `SUPABASE_STORAGE_BUCKET` | **Pertahankan** | Kalau Storage Supabase dipertahankan (opsi A di 2.4). |
| `PUBLIC_SUPABASE_URL` | **Hapus** | Auth tidak dipakai. `getFreshToken()` langsung jatuh ke `authStore`. |
| `PUBLIC_SUPABASE_ANON_KEY` | **Hapus** | Idem. |
| `NEON_DATABASE_URL` | **Tambah** | Connection string pooler Neon, untuk script lokal & migrasi. **Bukan** untuk fungsi — fungsi tetap HTTP. |
| ±20 sisanya | **Pindahkan apa adanya** | Lihat `ENV-BARU-NEON.env` bagian "PINDAHKAN APA ADANYA". |

### 3.1 Cara memindahkan ±28 variabel tanpa menyalin manual

Jangan copy-paste 28 nilai satu per satu dari UI Netlify lama ke baru — itu
cara paling mungkin men-drop satu. Dari mesin ini (CLI tersedia):

```bash
netlify sites:list --json                                # catat siteId lama & baru
netlify env:list --site <ID-LAMA> --json > env-lama.json # lalu filter & kirim ke situs baru
```

⚠ **Dua jebakan Netlify CLI yang sudah pernah membakar waktu di repo ini:**

- `env:get`/`env:list` **tanpa `--site`** mencetak `No site id found…` ke
  **stdout dengan exit code 0**, jadi kelihatan seperti nilai berhasil diambil.
- **Default context-nya `dev`**, bukan produksi. Selalu sertakan
  `--context production` dan `--site`.

Nilai yang harus pindah sudah saya daftar di `ENV-BARU-NEON.env`, termasuk yang
**tidak ada di `.env`/`.env.local`** dan pasti ada di UI Netlify:
`PUBLIC_CLOUDINARY_CLOUD_NAME`, `PUBLIC_CLOUDINARY_UPLOAD_PRESET`,
`GEMINI_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `CLOUDINARY_URL`,
`FIREBASE_SERVICE_ACCOUNT`, `SENTRY_DSN`, `LOG_DRAIN_TOKEN`,
`ALLOWED_DOCUMENT_HOSTS`, `NETLIFY_SITE_URL`, `APP_ORIGIN`, `SITE_URL`,
`ADMIN_NUMBERS`, `PIN_BU_SARI`, `GRAFANA_CLOUD_*`, `METRICS_*`, `HEALTH_TOKEN`,
`SESSION_SECRET`, `ADMIN_MASTER_PIN`/`ADMIN_PIN`/`MASTER_PIN`/`ASJ_ADMIN_PASSWORD`,
`PIN_KHOCI`/`PIN_SACHOU`/`PIN_AYOK`/`PIN_KHOLIS`, `ASJ_ADMINS`,
`FONNTE_TOKEN`/`FONNTE_API_KEY`.

## 4. Urutan eksekusi

Kerjakan **berurutan**, dan jangan mulai bagian yang belum gate-nya lolos.

**Fase 0 — Gate (tanpa menyentuh repo atau Netlify)**
1. Uji gate 2.2 (service role vs RLS). Hasilnya menentukan jalur.
2. Jalankan `node deliverables/db-neon-migration/verify-db-parity.mjs --neon '<url>'`.
   Harus `HASIL: data Neon identik dengan Supabase lama.` dengan exit 0.
3. Pastikan backup `F:/tmp/dbprobe/backup/` sudah dipindah ke tempat aman dan
   **privat** (repo ini publik — berisi PII kandidat).

**Fase 1 — Kalau gate lolos (Jalur A)**
4. Commit kecil yang mengubah `MAPS_*`/konstanta terkait bila belum.
5. Di Netlify: ubah `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` saja, tidak
   ada kode yang berubah. Deploy.
6. Uji endpoint `netlify dev` lokal dulu dengan `SUPABASE_URL` menunjuk Neon.
7. Verifikasi cutover (bagian 6). Kalau ada tabel yang membaca 0 baris → rollback
   ke Supabase dengan mengembalikan 2 nilai itu. **Rollback = 2 nilai env, 1 deploy.**

**Fase 2 — Kalau gate gagal (Jalur B atau C)**
8. Jalur B: jalankan PostgREST, lalu ulangi Fase 1 poin 5–7 dengan URL servis itu.
9. Jalur C: tulis ulang dalam `client.ts`, tambah `pg` ke `dependencies`,
   jalankan seluruh test suite, lalu baru deploy.

**Fase 3 — akun Netlify baru (bagian 5)**
10. Baru setelah DB stabil. Kalau dipindah bersamaan dan ada masalah, Anda tidak
    akan tahu penyebabnya dari mana.

## 5. Pindah akun Netlify (kuota build habis)

### 5.1 Sebelum pindah, pertimbangkan yang lebih murah

Pindah akun berarti re-set ~28 env var, custom domain, DNS, deploy, dan semua
integrasi — pekerjaan setengah hari yang rawan kehilangan satu nilai. Beberapa
hal yang mungkin menyelesaikan masalah kuota tanpa pindah:

1. **Matikan deploy preview untuk branch non-produksi.** Kalau setiap push ke
   branch memicu build penuh, itu bisa memakan separuh kuota. Di Netlify UI:
   Site settings → Build & deploy → Continuous deployment → Deploy previews →
   "None" (atau hanya untuk PR).
2. **Hentikan auto-build, deploy manual.** Kalau kuota sudah habis bulan ini,
   pindah akun baru tidak mengembalikan bulan ini — dan yang penting, kuota
   baru akan terpakai lagi dengan pola yang sama. Pola build-nya yang harus
   berubah, akunnya tidak.
3. **Periksa dulu apa yang memakan 300 menit.** Di Dashboard → Usage bisa dilihat
   berapa build dan berapa menit per build. Kalau satu build = 20 menit, itu
   angka yang layak diturunkan lebih dulu.

Kalau tetap ingin pindah (misalnya butuh kuota bersih untuk bulan ini), ini
langkahnya.

### 5.2 Langkah pindah akun

1. **Buat akun Netlify baru** dengan email baru (verifikasi email).
2. **Buat site baru** → "Add new site" → "Import an existing project" → authorize
   GitHub → pilih repo `asj-astro`.
3. **Set build settings** (harus sama persis):
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. **Pindahkan SEMUA env var.** Pakai cara bagian 3.1. Yang wajib ada:
   - Runtime: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`,
     `ADMIN_MASTER_PIN`, `ASJ_ADMINS`, `FONNTE_TOKEN`, `CLOUDINARY_URL`,
     `ALLOWED_DOCUMENT_HOSTS`, `NETLIFY_SITE_URL`, `FIREBASE_SERVICE_ACCOUNT`,
     dan seterusnya.
   - **Build-time (baked):** `PUBLIC_CLOUDINARY_CLOUD_NAME`,
     `PUBLIC_CLOUDINARY_UPLOAD_PRESET`, `PUBLIC_SUPABASE_URL`,
     `PUBLIC_SUPABASE_ANON_KEY`. ⚠ Yang `PUBLIC_*` ini dibakar saat **build** —
     kalau tidak diset, halaman yang sudah di-deploy tetap memakai nilai lama
     yang tidak ada, dan auth/fitur terkait mati diam-diam. Set **sebelum**
     deploy pertama.
5. **Deploy pertama.** Biarkan gagal kalau env kurang — itu lebih baik daripada
   deploy sukses dengan setengah konfigurasi.
6. **Custom domain.** Di site baru: Domain settings → Add domain →
   `asjastro.netlify.app` (bisa dipakai sekali) atau domain sendiri.
   - Kalau pakai domain sendiri: update DNS (CNAME ke `<situs>.netlify.app`),
     lalu tunggu TLS diterbitkan.
   - ⚠ **Jangan hapus site lama sampai site baru benar-benar jalan.** Site lama
     yang masih hidup adalah rollback Anda.
7. **Scheduled functions.** Keduanya WAJIB dicek, kalau tidak, queue dan
   pengingat agenda mati tanpa suara:
   - `netlify/functions/sweep-queue.ts` — `export const config = { schedule: '*/2 * * * *' }`
   - `netlify/functions/agenda-reminders.ts` — `export const config = { schedule: '*/10 * * * *' }`
8. **Verifikasi.**

### 5.3 Hal yang mudah terlupakan saat pindah akun

| Hal | Kenapa penting |
|---|---|
| Build hooks / deploy webhook (kalau ada) | Harus dibuat ulang; URL lama mati bersama situs lama. |
| Git integration & permissions | Akun baru punya repo access sendiri; periksa di GitHub → Settings → Applications. |
| Analytics/traffic split | Tidak pindah otomatis. |
| Form handling (kalau dipakai) | Konfigurasi ada per-situs. |
| `netlify.toml` | Ikut dari repo, jadi otomatis. Tidak perlu disentuh. |
| Deploy key | Netlify membuatnya per-situs. |

## 6. Checklist verifikasi setelah cutover

Ini bukan formalitas. Masing-masing poin sudah pernah menjadi kegagalan sunyi
di sistem ini.

- [ ] Jalankan `verify-db-parity.mjs` lagi → harus `IDENTIK` di semua tabel.
- [ ] `GET /rest/v1/sys_config?select=config_type&limit=3` (via `netlify dev`)
      mengembalikan **baris**, bukan `[]`. Ini gate RLS, dites sekali lagi setelah deploy.
- [ ] Login kandidat (`loginKandidat`) berhasil dan membuat baris di `user_sessions`.
- [ ] Satu insert baru (mis. kirim `database_asj_kontak`) muncul di tabel.
- [ ] Job queue jalan: `claim_next_job` mengembalikan baris, dan
      `sweep-queue` berjalan tiap 2 menit (cek log).
- [ ] Agenda reminders jalan tiap 10 menit.
- [ ] Upload berkas (admin) masih berhasil — ini yang menguji Storage di 2.4.
- [ ] `POST /rest/v1/rpc/rate_limit_check` tidak error (RLS juga berlaku di sini).
- [ ] Tidak ada error baru di Netlify function log selama 24 jam pertama.
- [ ] **Angka mitra/kandidat/keberangkatan TIDAK dipublikasikan** (§8/§12).

## 7. Yang TIDAK boleh dilakukan

- Jangan jalankan `git add -A` — path eksplisit, satu commit per berkas.
- Jangan push `main` tanpa perintah (push = deploy berbayar, dua situs).
- Jangan commit `.env`, dump JSON, atau token apa pun — repo ini **publik**.
- Jangan tengahkan RLS untuk memuaskan gate 2.2. Kalau gate gagal, pindah jalur,
  jangan pindah aturan keamanan.
- Jangan matikan Supabase sampai situs baru terbukti stabil minimal beberapa hari.
  Supabase yang masih hidup adalah satu-satunya rollback.

## 8. Aset & pemeriksaan yang bisa diulang

| Berkas | Untuk apa |
|---|---|
| `verify-db-parity.mjs` | Bukti ulang data identik, exit 0/1. Bisa dipakai di CI. |
| `LAPORAN-CHECK-DATA.md` | Hasil pengukuran 2026-10-20 + yang belum terverifikasi. |
| `ENV-BARU-NEON.env` | Template env lengkap (nilai rahasia Anda isi sendiri). |
| `F:/tmp/dbprobe/backup/` | Dump 26 tabel (PII — pindahkan, jangan commit). |


