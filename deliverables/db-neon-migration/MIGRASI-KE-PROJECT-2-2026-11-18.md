# Migrasi ASTRO (paused) → DB NO 2 — checklist 2026-11-18

Konteks: screenshot Anda menunjukkan project **ASTRO** ber status merah (compute di-**suspend**
karena 110,13/100 CU-jam) dengan storage **40,28 MB**, dan project baru **DB NO 2** di region
yang sama (AWS Asia Pacific 1 / Singapore), dibuat dengan **email/akun yang sama**.

Kabar baik: karena kuota Neon dihitung **per project**, project baru di akun yang sama mendapat
alokasi penuh 100 CU-jam/bulan. Kabar buruk: project lama sedang paused, jadi **`pg_dump` tidak
bisa dijalankan** sampai compute-nya hidup lagi (SQLSTATE `53000`; Data API balas HTTP 402).

> **Update 2026-11-18 17:39 WIB:** ASTRO sudah di-Launch dan Data API balas `206` + baris.
> Dump sudah diambil dengan `pg_dump` **18.7** (server 18.7 — versi 17 ditolak):
> `/f/tmp/db2/astro-2026-11-18.dump`, 879 KB, exit 0. Isi: 46 tabel, 74 ACL, 67 sequence,
> 52 index, 3 policy, 3 trigger. **Restore belum jalan** karena connection string pooler
> DB NO 2 tidak tersedia di mesin ini dan passwordnya berbeda dari ASTRO (sudah diuji).
> Lihat `RUNBOOK-LAUNCH-DUMP-DOWNGRADE-2026-11-18.md`.

## 1. Yang perlu Anda tempel / siapkan

### A. Wajib, bersifat rahasia — jangan pernah di-commit
| # | Nilai | Dari mana | Dipakai untuk |
|---|---|---|---|
| 1 | **Connection string pooler ASTRO** | Neon Console → ASTRO → *Connection Details* → pooler, branch `main`, DB `neondb` | `pg_dump` dari project yang sedang paused (setelah di-upgrade) |
| 2 | **API URL Data API DB NO 2** | DB NO 2 → *Postgres database → Data API → API tab*, bentuk `https://ep-xxxx.apirest.<region>.aws.neon.tech/neondb/rest/v1` | nilai baru `SUPABASE_URL` |
| 3 | **Connection string pooler DB NO 2** | DB NO 2 → *Connection Details* → pooler | `pg_restore`, `npm run migrate:up`, `verify-db-parity` |
| 4 | **Database & branch name DB NO 2** | Console | memastikan `neondb`/`main` atau menyesuaikan URL |

Kalau mau **saya yang menjalankan** dump/restore/verifikasi, tempel keempatnya di sini. Saya tidak
akan menampilkan nilai aslinya lagi dan tidak akan menulisnya ke repo (file env lokal saja).
Kalau lebih nyaman, Anda juga bisa menjalankan sendiri perintah di bagian 3 — hasilnya sama.

### B. Perlu Anda klik di UI Neon (tidak ada token yang perlu ditempel)
1. **ASTRO → Billing → Change plan → Launch.** Tanpa biaya minimum; invoice < $0,50 tidak
   ditagih. Ini satu-satunya cara langsung menghidupkan compute sebelum siklus berikutnya (~1 Des).
   Setelah dump selesai dan DB NO 2 terverifikasi, boleh **downgrade lagi ke Free** — tapi
   **export dulu sebelum downgrade**, karena `pg_dump` termasuk network transfer.
2. **DB NO 2 → Postgres database → Data API → Enable**, pilih branch `main`, database `neondb`,
   dan **Grant public schema access** (sama seperti ASTRO).
3. Data API → **Settings → Authentication → Other Provider**:
   - **JWKS URL**: `https://amanahsakura.netlify.app/jwks.json` (sudah saya cek: 200, EdDSA,
     `kid 8169d1a4-8817-4426-b9ad-e6dbd814ecf2`)
   - **JWT Audience**: **kosongkan** — JWT repo ini tidak punya claim `aud`.
   - Jangan pakai "Neon Auth": sistem Anda memakai JWT Ed25519 sendiri.

### 2.1 Terukur 2026-11-18 14:09 WIB — jangan tertukar endpoint
| Endpoint | Host | Hasil probe dengan JWT service repo ini |
|---|---|---|
| ASTRO (lama, source dump) | `ep-bold-sunset-b3zy6wb1.apirest.c-4…` | **HTTP 402 exceeded quota** — benar, project paused |
| DB NO 2 (tujuan) | `ep-nameless-voice-b3ppwjyl.apirest.c-4…` | **HTTP 404 `PGRST205`** setelah JWKS kita dipasang ⇒ autentikasi LOLOS, tabel belum ada (DB masih kosong) — ini keadaan yang diharapkan sebelum restore |

⚠ Connection string pooler yang Anda tempel bertanda `ep-nameless-voice-b3ppwjyl-pooler…`
= **project BARU**, bukan ASTRO. Untuk `pg_dump` sumber tetap dibutuhkan pooler ASTRO yang
host-nya `ep-bold-sunset-b3zy6wb1…-pooler…`.

JWKS Neon Auth project baru memuat `kid cd087dec-4237-40cc-81c4-48211f39c7d3`, sedangkan
JWT repo ini memakai `kid 8169d1a4-8817-4426-b9ad-e6dbd814ecf2` ⇒ kalau JWKS Neon Auth yang
dipasang, semua request balas 401. Karena itu yang diisi ke kolom **JSON Web Key Set (JWKS)
URL / Endpoint** di dialog *Add new authentication provider* adalah URL milik kita sendiri,
bukan URL `*.neonauth.*` yang muncul di halaman Data API.

Isi publik dari `https://amanahsakura.netlify.app/jwks.json` (public key saja, aman dibagikan):

```json
{"keys":[{"crv":"Ed25519","x":"czH5Bf5RUS9yhLSlmzFYCuHr46XfgnU0By_9ageCtTc","kty":"OKP","alg":"EdDSA","use":"sig","kid":"8169d1a4-8817-4426-b9ad-e6dbd814ecf2"}]}
```

Dialog meminta **URL**, jadi tempel URL-nya. JSON di atas hanya sebagai bukti `kid` yang
harus cocok; jangan pernah menempel private key (`SUPABASE_JWT_PRIVATE_KEY`) ke console.

### C. JANGAN diganti / jangan dibuat baru
- `SUPABASE_SERVICE_ROLE_KEY` & `SUPABASE_ANON_KEY` — JWT lama masih valid sampai 2050, `kid`-nya
  cocok dengan JWKS di atas. Pakai lagi apa adanya.
- `SUPABASE_JWT_ALG=EdDSA`, `SUPABASE_JWT_KID`, `SUPABASE_JWT_PRIVATE_KEY`, `JWT_PUBLIC_JWK`
  (wajib ada saat **build** supaya `/jwks.json` ikut terbit).
- `SUPABASE_PG_ADMIN_ROLE=asj_service`.
- `STORAGE_SUPABASE_URL` / `STORAGE_SUPABASE_KEY` → masih Supabase lama; **tidak ikut pindah**.
- Semua `CLOUDINARY_*`, `FONNTE_*`, `GEMINI_*`, `GROQ_*`, `XAI_*`, `SESSION_SECRET`, PIN, dll.

## 2. Role yang harus ada di DB NO 2

`pg_dump` tidak membawa role (role itu level cluster). Di DB NO 2, jalankan **sebelum** migrasi:

```sql
CREATE ROLE asj_service LOGIN BYPASSRLS NOINHERIT;
GRANT asj_service TO neondb_owner;
-- anonymous dan authenticated dibuat oleh Neon saat Data API diaktifkan;
-- jangan dibuat ulang kalau sudah ada.
```

Lalu verifikasi: `SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles
WHERE rolname IN ('asj_service','anonymous','authenticated');`

⚠ Melewati langkah ini = jalur admin membaca **0 baris tanpa error** (RLS ON, 23 tabel tanpa
policy, hanya `asj_service` yang BYPASSRLS).

## 3. Urutan eksekusi

```bash
# 0) Siapkan env lokal (jangan commit)
export OLD_URL='<connection string pooler ASTRO>'
export NEW_URL='<connection string pooler DB NO 2>'
export NEW_API='<API URL Data API DB NO 2, BERAKHIR /rest/v1>'

# 1) Dump dari ASTRO (hanya bisa setelah Billing → Launch)
#    Pertahankan GRANT: jangan tambahkan --no-privileges.
pg_dump --format=custom --no-owner \
  --dbname="$OLD_URL" --file=/f/tmp/db2/astro-2026-11-18.dump

# 2) Restore ke DB NO 2 (dump penuh sudah termasuk skema, trigger, policy, sequence,
#    GRANT, dan tabel schema_migrations — jangan jalankan migrate:up sebelumnya)
# ⚠ JANGAN pakai --no-privileges: itu membuang semua GRANT, sehingga RLS/akses
#    service tidak ikut. Role tujuan harus sudah dibuat (bagian 2).
pg_restore --no-owner --exit-on-error \
  --dbname="$NEW_URL" /f/tmp/db2/astro-2026-11-18.dump

# 3) Gate skema & data (dari root repo; `cd /f/astro` di rumah, `/e/astro` di kantor)
SUPABASE_URL="$NEW_API" SUPABASE_SERVICE_ROLE_KEY='<JWT lama>' \
  node deliverables/db-neon-migration/verify-db-parity.mjs --neon "$NEW_URL"
npm run db:schema          # regenerate kontrak, lalu cek git diff
npm run verify:schema
npm run verify:rls
```

Catatan: `verify-db-parity.mjs` membandingkan **API lama** (diambil dari `SUPABASE_URL` env)
dengan DB baru lewat SQL. Setelah ASTRO di-upgrade, arahkan `SUPABASE_URL` sementara ke API ASTRO;
jangan arahkan ke Supabase Storage.

## 4. Cutover (setelah gate hijau)

1. Di **Netlify → Site configuration → Environment variables**, ubah **satu nilai**:
   `SUPABASE_URL` = `NEW_API`. Nilai lain tidak berubah.
2. Deploy. Ini otomatis membawa 4 commit lokal yang belum ter-push
   (`e8f87fe`, `55b081e`, `2ca2729`, `50cd8b8`) — termasuk perbaikan cron `*/15`/`*/30`.
3. Uji cepat, **urutan ini penting** (kegagalan sunyi paling sering di sini):
   - `GET <NEW_API>/sys_config?select=config_type&limit=3` dengan header
     `apikey` + `Authorization: Bearer <JWT service lama>` → harus balas **baris**, bukan `[]`.
   - Login kandidat → muncul baris di `user_sessions`.
   - Buka tab admin → `getAppData('admin')` mengembalikan kandidat (bukan 0 baris).
   - `POST <NEW_API>/rpc/rate_limit_check` tidak 401/403.
   - `POST <NEW_API>/rpc/claim_next_job` tidak error; log `sweep-queue` menunjukkan cron jalan.
   - Upload satu berkas admin (menguji Supabase Storage yang tetap di host lama).
4. Panggil `GET https://amanahsakura.netlify.app/version.json` untuk memastikan deploy yang
   aktif benar-benar membawa hash baru.
5. Biarkan ASTRO tetap ada (jangan dihapus) minimal beberapa hari sebagai rollback. Rollback
   cukup kembalikan satu nilai `SUPABASE_URL` ke API ASTRO.

## 5. Yang sudah saya kerjakan di kode sesi ini

- Tes regresi baru di `netlify/functions/contexts/scheduling/service-reminder-cron.test.ts`
  mengunci `sweep-queue` pada `*/15` (dulu `*/2`) dan `agenda-reminders` pada `*/30`.
- Dokumen lama yang masih menyebut `*/2` / `*/10` diperbarui:
  `docs/SCALABILITY_RELIABILITY_ARCHITECTURE.md`, `docs/PHASE_C_SINK_SETUP.md`,
  `docs/PHASE_C_OBSERVABILITY.md`.
- Tidak ada perubahan skema, migrasi, RLS, env produksi, atau push.

## 6. Yang sengaja tidak diubah (dan alasannya)

| Item | Alasan |
|---|---|
| Rate-limit Postgres `rate_limit_check` | Penggantian ke in-memory melemahkan perlindungan lintas-instance; admin read sudah dikecualikan, dan volume tulis jauh lebih kecil daripada cron yang sudah diperbaiki. |
| `getAppData(admin)` 8–10 round-trip | Klien sudah punya cache SWR 30 detik + invalidasi saat write; mengubah proyeksi/skema berisiko merusak 12 tab admin. |
| Laporan `pageSize=5000` & N+1 hapus massal | Perlu RPC agregat/batch dan perubahan kontrak tes; ditunda sampai DB baru stabil. |
| Polling `/jwks.json` + SW 5/15 menit | Request ke origin sendiri, bukan ke Neon/Supabase — bukan penyebab kuota. |
| Storage Supabase → Cloudinary penuh | Butuh penulisan ulang URL di 40 MB data + jalur upload server; baru lakukan setelah egress terukur masih tinggi. |
