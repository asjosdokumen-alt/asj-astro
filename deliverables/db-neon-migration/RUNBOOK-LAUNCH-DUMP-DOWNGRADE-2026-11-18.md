# Runbook: Launch → dump ASTRO → restore DB NO 2 → verifikasi → downgrade
Tanggal: 2026-11-18 · Host lama `ep-bold-sunset-b3zy6wb1…` · Host baru `ep-nameless-voice-b3ppwjyl…`
Semua perintah dijalankan dari **Git Bash** di repo (`F:/astro` di rumah, `E:/astro` di kantor —
huruf drive berubah mesin). Jangan jalankan `git add -A`, jangan push.

> **Progres 2026-11-18 17:39 WIB:** ASTRO sudah di-Launch, Data API balas `206` + baris.
> `pg_dump` **18.7** Berhasil membuat `/f/tmp/db2/astro-2026-11-18.dump` (879 KB, exit 0,
> 46 tabel · 74 ACL · 67 sequence · 52 index · 3 policy · 3 trigger).
> **Langkah 3–6 masih menunggu connection string pooler DB NO 2** — password project baru
> berbeda dari ASTRO (sudah diuji, login ditolak). Simpan string itu ke `F:/tmp/db2-connection.txt`
> (di luar repo) lalu jalankan `F:/tmp/db2/restore.sh`.

> **Selesai 2026-11-18 17:55 WIB.** Restore exit 0 · parity **35/35 identik** · `verify:schema`
> dan `verify:rls` hijau · Data API DB2 balas **200** + baris.
> Cutover tinggal mengubah `SUPABASE_URL` di Netlify (belum dilakukan; butuh akses owner).

---

## 0. Siapkan `pg_dump` 18 (sudah terpasang di mesin ini)

Server Neon memakai **PostgreSQL 18.7**. `pg_dump` 17 menolak dengan
`aborting because of server version mismatch` — jangan pakai 17.

```bash
export PATH="/c/Program Files/PostgreSQL/18/bin:$PATH"
pg_dump --version     # harus menampilkan pg_dump (PostgreSQL) 18.x
```

PostgreSQL 18 sudah terinstal di `C:/Program Files/PostgreSQL/18/bin`. Kalau di mesin lain
belum ada: `winget install --id PostgreSQL.PostgreSQL.18 -e --accept-package-agreements
--accept-source-agreements` (butuh izin admin).

Kalau installer meminta password superuser lokal, isi sembarang yang Anda ingat — koneksi ke Neon
memakai password dari connection string, bukan password lokal ini.

---

## 1. Klik Launch di UI (tidak bisa di-script)

Neon Console → pilih **organization** yang memuat ASTRO → **Billing → Change plan → Launch**.
Tunggu sampai compute ASTRO hidup lagi. Cek dengan JWT lama:

```bash
export OLD_API_BASE='https://ep-bold-sunset-b3zy6wb1.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb'
export SUPABASE_SERVICE_ROLE_KEY=$(awk -F= '$1=="SUPABASE_SERVICE_ROLE_KEY"{print substr($0,index($0,"=")+1)}' /f/astro/.env.local | tr -d '\r')

curl -sS -o /tmp/astro-probe.json -w 'HTTP %{http_code}\n' \
  "$OLD_API_BASE/rest/v1/sys_config?select=config_type&limit=3" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
head -c 300 /tmp/astro-probe.json
```

- `HTTP 200` + baris → compute sudah hidup, lanjut.
- `HTTP 402` / `53000` → tunggu ~30 detik lalu ulangi. Upgrade perlu restart compute.

Jangan pernah mengetik atau menampilkan `$SUPABASE_SERVICE_ROLE_KEY` di terminal.

---

## 2. Set variabel sekali di shell ini

```bash
export OLD_URL='<PASTE pooler ASTRO: host ep-bold-sunset-b3zy6wb1…-pooler…>'
export NEW_URL='<PASTE pooler DB NO 2: host ep-nameless-voice-b3ppwjyl-pooler…>'
export NEW_API_BASE='https://ep-nameless-voice-b3ppwjyl.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb'

mkdir -p /f/tmp/db2
```

⚠ Jangan pakai connection string lama yang Anda tempel sebelumnya untuk `$OLD_URL` — itu punya
`ep-nameless-voice…`, yaitu project **baru**.

---

## 3. Buat role di DB NO 2

`pg_dump` tidak membawa role. Jalankan (aman diulang):

```bash
psql "$NEW_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asj_service') THEN
    CREATE ROLE asj_service LOGIN BYPASSRLS NOINHERIT;
  END IF;
END $$;

GRANT asj_service TO neondb_owner;
SQL
```

Role `anonymous` dan `authenticated` sudah ada otomatis dari Data API — jangan dibuat ulang.

---

## 4. Dump dari ASTRO

```bash
pg_dump --format=custom --no-owner \
  --dbname="$OLD_URL" \
  --file=/f/tmp/db2/astro-2026-11-18.dump

ls -lh /f/tmp/db2/astro-2026-11-18.dump
```

- Jangan tambahkan `--no-privileges`: itu membuang semua `GRANT`.
- Kalau keluar `SQLSTATE 53000`, compute belum benar-benar hidup → ulangi langkah 1.

---

## 5. Restore ke DB NO 2

```bash
pg_restore --no-owner --exit-on-error \
  --dbname="$NEW_URL" \
  /f/tmp/db2/astro-2026-11-18.dump
```

Kalau error "role ... does not exist", buat role itu di DB NO 2 lalu ulangi `pg_restore` dari awal.

### Catatan restore aktual 2026-11-18

Dump ASTRO ikut membawa objek milik Neon (`neon_auth`, `backup`, `pgrst`,
`pg_session_jwt`, `DEFAULT ACL`) yang **sudah ada di project tujuan**. `pg_restore`
polos berhenti berurutan di `must be owner of extension pg_session_jwt`,
`schema neon_auth already exists`, `schema backup already exists`,
`role "anon" does not exist`, dan `permission denied to change default privileges`.
Urutan yang berhasil:

```bash
grep -vE 'neon_auth|SCHEMA - backup|pgrst' /f/tmp/db2/dump-list.txt \
  | grep -v 'pg_session_jwt' | grep -v 'DEFAULT ACL' > /f/tmp/db2/dump-apply3.list
psql "$NEW_URL" -c 'CREATE ROLE anon NOLOGIN'   # kalau belum ada
pg_restore --clean --if-exists --use-list=/f/tmp/db2/dump-apply3.list \
  --no-owner --exit-on-error --dbname="$NEW_URL" /f/tmp/db2/astro-2026-11-18.dump
psql "$NEW_URL" -c 'GRANT asj_service TO authenticator'
psql "$NEW_URL" -c 'ALTER ROLE asj_service NOLOGIN'
```

`GRANT asj_service TO authenticator` **wajib**: tanpa itu Data API balas
`403 42501 permission denied to set role "asj_service"`. `pg_dump` tidak membawa
keanggotaan role, jadi ini tidak ikut ter-restore.

Kalau Data API masih `404 PGRST205` padahal tabel sudah ada → **Refresh schema cache**
di Neon Console → Data API. `NOTIFY pgrst, 'reload schema'` tidak berpengaruh pada
PostgREST yang dikelola Neon.

---

## 6. Verifikasi (jangan dilewat)

### 6.1 Data identik, tabel per tabel + hash baris

```bash
cd /f/astro
SUPABASE_URL="$OLD_API_BASE" \
node deliverables/db-neon-migration/verify-db-parity.mjs --neon "$NEW_URL"
```

Harus keluar `HASIL: data Neon identik dengan Supabase lama.` dengan exit code 0.
(Skrip membaca `SUPABASE_SERVICE_ROLE_KEY` dari env yang sudah Anda set di langkah 1.)

### 6.2 Data API project baru menjawab baris, bukan `[]`

```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  "$NEW_API_BASE/rest/v1/sys_config?select=config_type&limit=3" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Harus `HTTP 200` dan ada baris. Kalau `[]` / 401 / 403 → **jangan cutover**.

### 6.3 Gate repo

```bash
npm run verify:schema
SUPABASE_DB_URL="$NEW_URL" SUPABASE_URL="$NEW_API_BASE" npm run verify:rls
npm run typecheck
```

---

## 7. Cutover — cukup satu env di Netlify

Di Netlify → Site configuration → Environment variables, ubah **hanya**:

```
SUPABASE_URL = https://ep-nameless-voice-b3ppwjyl.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb
```

⚠ **Tanpa `/rest/v1`.** Kode `_lib/db/client.ts` menambahkan `/rest/v1/` sendiri. Kalau Anda
menempel URL dari halaman Data API Neon yang berakhir `/rest/v1`, semua request jadi
`/rest/v1/rest/v1/...` dan portal mati.

Lalu deploy. Deploy otomatis membawa 4 commit lokal (`e8f87fe`, `55b081e`, `2ca2729`, `50cd8b8`)
termasuk perbaikan cron `*/15`/`*/30`. Cek hasil deploy:

```bash
curl -sS https://amanahsakura.netlify.app/version.json
```

Uji cepat setelah deploy: login kandidat, buka tab admin, kirim satu pesan kontak, upload satu
berkas (Storage masih di Supabase lama), dan lihat log `sweep-queue` tetap jalan.

---

## 8. Downgrade ke Free

Lakukan **setelah** langkah 6 dan 7 hijau — jangan sebelum verifikasi, supaya dump bisa diulang
kalau ada yang mismatch.

Neon Console → organization yang sama → **Billing → Change plan → Free**.

- Tidak ada tombol "unsubscribe" terpisah; downgrade = berhenti langganan.
- Kuota Free langsung reset. Data tidak dihapus.
- Kalau ada project/branch yang melebihi batas Free, Neon akan meminta menghapusnya dulu.
- Terakhir, buka **Billing → View/Pay invoices** dan cek. Invoice di bawah **$0,50 tidak ditagih**;
  kartu baru dipotong tanggal 1 bulan berjalan, jadi tidak ada potongan langsung hari ini.

Biarkan project ASTRO tetap ada beberapa hari sebagai rollback. Rollback = kembalikan satu nilai
`SUPABASE_URL` ke `https://ep-bold-sunset-b3zy6wb1.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb`.

---

## Ringkasan urutan

```
Launch (UI) → probe 200 → set env → buat asj_service → pg_dump → pg_restore
→ verify-db-parity → probe Data API → verify:schema/rls → ganti SUPABASE_URL
→ deploy → uji → downgrade Free → cek invoice
```
