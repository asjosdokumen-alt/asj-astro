# Playbook kuota Neon — inventaris key, cutover, dan pindah DB sebelum kena limit

**Tanggal:** 2026-11-18 · **Status:** DB2 sudah ter-restore dan terverifikasi; cutover env sudah
diubah owner di Netlify; **deploy belum terlihat** (lihat §1).

> ⚠️ **Dokumen ini sengaja tidak berisi satu pun nilai rahasia.** Hanya nama variabel dan lokasi
> file. Repo ini **publik** — menempelkan connection string atau JWT ke sini = insiden.

---

## 1. Status saat ini (terukur 18:02 WIB)

| Item | Nilai |
|---|---|
| `origin/main` | `031acf9` (2026-11-16) |
| HEAD lokal | `29b6116` — **6 commit ahead, belum push** |
| `/version.json` produksi | `asj-astro-8200fdbbe878`, built **2026-11-16T16:41Z** (cache-buster sudah dicoba) |
| Artinya | **Deploy dengan kode baru belum jalan.** Env `SUPABASE_URL` sudah diganti owner, tapi build lama masih aktif |
| DB1 (ASTRO) | Launch, data utuh, dipakai sebagai rollback |
| DB2 (DB NO 2) | 35 tabel, parity 35/35 identik, Data API `200` + baris |

**Konsekuensi penting:** kode yang masih ter-deploy memakai cron `sweep-queue` `*/2`.
Itu yang membuat compute db1 kehabisan 100 CU-jam dalam ~17 hari. Perbaikan `*/15`/`*/30`
ada di commit `2ca2729` + `50cd8b8`, **masih lokal**. Kalau db2 dipakai dengan kode lama,
pola kehabisan yang sama akan terulang.

---

## 2. Inventaris key — apa yang berubah saat pindah DB, apa yang tidak

### 2.1 Satu-satunya value yang berubah saat cutover DB

| Variable | Dulu (ASTRO) | Sekarang (DB NO 2) |
|---|---|---|
| `SUPABASE_URL` | `https://ep-bold-sunset-b3zy6wb1.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb` | `https://ep-nameless-voice-b3ppwjyl.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb` |

**Tanpa `/rest/v1`.** `_lib/db/client.ts` menambahkannya sendiri. Semua env lain tetap.

### 2.2 JANGAN diganti / jangan dibuat ulang

| Variable / objek | Alasan |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_*` | JWT EdDSA lama valid s/d 2050, `kid 8169d1a4…` cocok dengan JWKS kita |
| `SUPABASE_JWT_ALG`, `SUPABASE_JWT_KID`, `SUPABASE_JWT_PRIVATE_KEY`, `JWT_PUBLIC_JWK` | Sumber `/jwks.json`. Mengganti private key = semua JWT lama ditolak |
| `SUPABASE_PG_ADMIN_ROLE=asj_service` | Role haris BYPASSRLS; dibuat manual di DB baru (pg_dump tidak membawa role) |
| `STORAGE_SUPABASE_URL`, `STORAGE_SUPABASE_KEY`, `SUPABASE_STORAGE_BUCKET` | Storage tetap di Supabase lama (`gdwvff…`), **tidak ikut pindah** |
| `SESSION_SECRET`, `ADMIN_MASTER_PIN`, `PIN_KHOCI/SACHOU/AYOK/KHOLIS` | Tidak terkait Neon |
| `CLOUDINARY_*`, `FONNTE_*`, `GEMINI_*`, `GROK_*`, `GROQCLOUD_*`, `OPENROUTER_*`, `XAI_*` | Penyedia eksternal, tidak terkait DB |
| `FIREBASE_SERVICE_ACCOUNT`, `PUBLIC_FIREBASE_VAPID_KEY` | Push notification |
| `GRAFANA_CLOUD_*`, `HEALTH_TOKEN`, `NETLIFY_SITE_URL`, `ALLOWED_DOCUMENT_HOSTS` | Observabilitas & konfigurasi situs |

### 2.3 Variabel yang perlu diisi **hanya saat eksekusi** dump/restore (jangan disimpan di repo)

| Variable | Dipakai untuk | Sumber |
|---|---|---|
| `OLD_URL` / `OLD_DIRECT_URL` | `pg_dump` dari DB lama; parity sisi lama | `.env.local` → `Direct_Connection_DB` |
| `NEW_URL` | `psql`, `pg_restore`, `verify-db-parity --neon` | Neon Console → project tujuan → Connection Details → pooler |
| `NEW_API` | probe Data API, `SUPABASE_URL` saat verifikasi | diturunkan: `ep-xxx-pooler…` → `ep-xxx.apirest…/neondb` |
| `SUPABASE_SERVICE_ROLE_KEY` | header `apikey` + Bearer untuk probe | `.env.local` / `F:/asj-kunci/PRODUCTION.env` |

Simpan connection string sementara di **`F:/tmp/db2-connection.txt`** (di luar repo).

### 2.4 Lokasi file kunci (nama file saja)

| File | Isi |
|---|---|
| `F:/astro/.env.local` | env kerja lokal + `Direct_Connection_DB` (ASTRO) |
| `F:/astro/env-kunci/PRODUCTION.env` | env produksi tanpa `Direct_Connection_DB` |
| `F:/asj-kunci/PRODUCTION.env`, `LOCAL.env` | cadangan kunci (di luar repo) |
| `F:/neon-storage.env` | Neon Storage S3 + AI gateway |
| `F:/astro/deliverables/db-neon-migration/ENV-BARU-NEON.env` | **placeholder lama, host sudah basi** — jangan dipakai sebagai sumber kebenaran |
| `F:/tmp/db2/astro-2026-11-18.dump` | dump ASTRO 879 KB (dari 2026-11-18) |
| `F:/tmp/db2/dump-apply3.list` | daftar TOC restore yang sudah difilter |
| `F:/tmp/db2/restore.sh` | skrip restore otomatis |

---

## 3. Cara kerja kuota — apa yang bisa dan tidak bisa diselesaikan dengan pindah DB

| Dimensi | Gejala saat habis | Pindah DB membantu? |
|---|---|---|
| **Compute (CU-jam)** | Data API balas `402`, project **paused**, tulis/baca gagal | ✅ Ya — kuota dihitung **per project**. Project baru dapat jatah penuh |
| **Egress / network (GB)** | Transfer ditolak atau ditagih | ⚠️ Sebagian — pindah DB memindahkan sumber egress Neon, tapi **tidak** menurunkan volume. Storage/Cloudinary tetap di host lama |
| **Storage (GB)** | Upload gagal | ❌ Tidak — Storage di Supabase lama, tidak ikut pindah |

Fakta penting dari insiden ini: **yang habis hanya compute** (110,13/100 CU-jam; storage 0,04 GB,
network 0,46 GB). Penyebabnya bukan traffic, melainkan cron `*/2` yang membuat compute tidak
pernah scale-to-zero (5 menit idle threshold). 0,25 CU × 24 jam = ~6 CU-jam/hari ≈ 110/17 hari.

`pg_dump` sendiri **termasuk network transfer** — lakukan sebelum project di-downgrade/di-pause.

---

## 4. Monitoring — kapan harus mulai pindah, jangan tunggu 402

Cek Neon Console → project aktif → **Usage**. Catat angka harian ke sini:

| Metrik | Aman | Waspada | **Mulai migrasi** |
|---|---|---|---|
| Compute CU-jam / bulan | < 50 | 50–70 | **> 70** |
| Network egress | < 50% kuota | 50–75% | **> 75%** |
| Hari tersisa dalam siklus | > 10 | 5–10 | **< 5** |

Alarm praktis: kalau compute naik **> 5 CU-jam/hari** tanpa lonjakan traffic, ada cron/polling
yang menjaga compute tetap hidup. Periksa dulu `netlify/functions/*` `export const config`
dan `setInterval` di `src/` sebelum menyalahkan traffic.

---

## 5. Prosedur pindah DB **sebelum** kena limit (update 2026-11-18)

### 5.1 Siapkan project tujuan

1. Neon Console → New project, **region yang sama** (Singapore), akun/email sama.
2. **Data API → Enable**, branch `main`, database `neondb`, centang **Grant public schema access**.
3. Data API → Settings → Authentication → **Other Provider** (bukan Neon Auth):
   - JWKS URL: `https://amanahsakura.netlify.app/jwks.json`
   - JWT Audience: **kosong**
   - Salinan publik: `deliverables/db-neon-migration/jwks-public.json`
4. Catat tiga URL/string: API base, pooler connection string, host. **Jangan tampilkan di chat/log.**

### 5.2 Dump + restore

```bash
export PATH="/c/Program Files/PostgreSQL/18/bin:$PATH"   # server Neon 18.7; pg_dump 17 ditolak
OLD_URL=$(grep -m1 '^Direct_Connection_DB=' /f/astro/.env.local | cut -d= -f2- | tr -d '\r"' | xargs)
NEW_URL=$(tr -d '\r\n"' < /f/tmp/db2-connection.txt | xargs)

pg_dump --format=custom --no-owner --dbname="$OLD_URL" \
  --file=/f/tmp/db2/astro-<TANGGAL>.dump
pg_restore -l /f/tmp/db2/astro-<TANGGAL>.dump > /f/tmp/db2/dump-list.txt
grep -vE 'neon_auth|SCHEMA - backup|pgrst' /f/tmp/db2/dump-list.txt \
  | grep -v 'pg_session_jwt' | grep -v 'DEFAULT ACL' > /f/tmp/db2/dump-apply.list

psql "$NEW_URL" -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles
  WHERE rolname='asj_service') THEN CREATE ROLE asj_service LOGIN BYPASSRLS NOINHERIT;
  END IF; END \$\$;"
psql "$NEW_URL" -c "CREATE ROLE anon NOLOGIN"   # kalau belum ada
pg_restore --clean --if-exists --use-list=/f/tmp/db2/dump-apply.list \
  --no-owner --exit-on-error --dbname="$NEW_URL" /f/tmp/db2/astro-<TANGGAL>.dump
psql "$NEW_URL" -c 'GRANT asj_service TO authenticator'
psql "$NEW_URL" -c 'ALTER ROLE asj_service NOLOGIN'
```

Tiga jebakan yang sudah terjadi dan harus dicek:
- `pg_dump` tidak membawa **role**, **keanggotaan role**, maupun **default privilege**.
- Tanpa `GRANT asj_service TO authenticator` → Data API `403 42501`.
- `neon_auth` / `backup` / `pgrst` / `pg_session_jwt` / `DEFAULT ACL` milik Neon → harus dibuang
  dari TOC atau `pg_restore` berhenti.

### 5.3 Refresh + verifikasi (jangan dilewat)

1. Neon Console → Data API → **Refresh schema cache**. `NOTIFY pgrst,'reload schema'` tidak
   berpengaruh pada PostgREST terkelola. Tanpa ini → `404 PGRST205`.
2. Probe dengan JWT lama:
   ```
   GET <NEW_API>/rest/v1/sys_config?select=config_type&limit=3 → 200 + baris
   GET <NEW_API>/rest/v1/database_candidate?select=id&limit=3  → 200 + baris
   ```
3. Gate:
   ```bash
   SUPABASE_URL="$OLD_API" OLD_DIRECT_URL="$OLD_DB" \
     node deliverables/db-neon-migration/verify-db-parity.mjs --neon "$NEW_DB"
   Direct_Connection_DB="$NEW_DB" node scripts/ci/gen-schema.mjs --from-db --check
   SUPABASE_URL="$NEW_API" npm run verify:schema
   SUPABASE_DB_URL="$NEW_DB" SUPABASE_URL="$NEW_API" npm run verify:rls
   ```
   Harus: parity `gagal: 0`, `SCHEMA IN SYNC`, `RLS GATE OK`.

### 5.4 Cutover & rollback

- Ubah **satu** env di Netlify: `SUPABASE_URL` → API base project baru. Deploy.
- Cek `/version.json` berubah, lalu uji login kandidat, tab admin, upload berkas, log cron.
- Rollback: kembalikan `SUPABASE_URL` ke host lama. **Jangan hapus project lama** minimal 1 siklus.

---

## 6. Bolehkah db1 di-downgrade ke Free sekarang?

**Ya, secara teknis — tapi bukan sekarang.** Urutannya:

1. ✅ Dump db1 sudah ada (`F:/tmp/db2/astro-2026-11-18.dump`) — prasyarat downgrade terpenuhi.
2. ✅ DB2 sudah terverifikasi penuh.
3. ❌ **Deploy produksi belum berubah** (`version.json` masih 2026-11-16). Sebelum deploy baru
   terlihat dan smoke test lolos, db1 adalah satu-satunya jalur produksi yang terbukti —
   jangan diturunkan dulu.
4. ❌ Commit perbaikan cron (`2ca2729`, `50cd8b8`) belum di-`push`, jadi Netlify tidak akan
   pernah membangun kode `*/15`/`*/30` selama belum ada push. Ini keputusan owner (R19: jangan push
   tanpa izin) — tapi WITHOUT itu, db2 akan menghabiskan kuota dengan pola yang sama.

Setelah poin 3 dan 4 beres dan smoke test hijau: **boleh downgrade**. Data db1 tetap utuh;
yang berubah hanya billing dan compute akan scale-to-zero saat idle. Simpan dump tetap di `F:/tmp`
dan jangan hapus project lama sampai minimal satu siklus penuh terlalui.

---

## 7. Ringkasan aksi

| # | Aksi | Siapa | Prioritas |
|---|---|---|---|
| 1 | Trigger deploy Netlify sampai `/version.json` berubah | Owner | **P0** |
| 2 | Putuskan push 6 commit lokal (terutama fix cron) | Owner | **P0** |
| 3 | Smoke test 5 poin pasca-deploy | Owner + lead | **P0** |
| 4 | Baru downgrade db1 ke Free | Owner | P1 |
| 5 | Catat angka kuota mingguan ke §4 | Owner | P1 |

---

> Dokumen ini dibuat dari pengukuran langsung, bukan asumsi. Jangan menaruh nilai koneksi atau JWT
> di sini — repo ini publik.
