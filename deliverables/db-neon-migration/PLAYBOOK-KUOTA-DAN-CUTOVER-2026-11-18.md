# Playbook kuota Neon — inventaris key, cutover, dan pindah DB sebelum kena limit

**Tanggal:** 2026-11-18 · **Status akhir:** push sudah jalan, deploy terdeteksi, DB1 sudah
di-downgrade owner. DB2 aktif sebagai target `SUPABASE_URL`. Lihat §1 untuk angka terukur dan
§8 untuk desain alarm kuota.

> ⚠️ **Dokumen ini sengaja tidak berisi satu pun nilai rahasia.** Hanya nama variabel dan lokasi
> file. Repo ini **publik** — menempelkan connection string atau JWT ke sini = insiden.

---

## 1. Status saat ini (terukur 19:30 WIB)

| Item | Nilai terukur |
|---|---|
| `origin/main` == HEAD lokal | `2fd0e24` — **0 ahead / 0 behind**, working tree bersih untuk file terlacak |
| `/version.json` produksi | `asj-astro-5ed75aa6e432`, built **2026-11-18T11:06:36.650Z** (18:06 WIB) |
| Health tanpa token | `200 {"status":"ok","detail":"gated"}` — artinya `HEALTH_TOKEN` Terpasang, BUKAN salah konfigurasi |
| Health dengan token | `200`, `status=ok`, `reasons=["all dependencies healthy"]`, PostgREST reachable, `jobQueue depth=0` |
| `ping` | `200` |
| JWKS `kid` | `8169d1a4-8817-4426-b9ad-e6dbd814ecf2` — tidak berubah dari DB1 |
| Cron di `HEAD` | `sweep-queue` `*/15`, `agenda-reminders` `*/30`; tripwire tes 9/9 hijau |
| DB1 | Sudah di-downgrade owner ke Free; dump tetap di `F:/tmp/db2/astro-2026-11-18.dump` |
| DB2 | 35 tabel, parity 35/35, schema & RLS terverifikasi; menjadi target `SUPABASE_URL` |

**Catatan pembuktian:** scheduled functions Netlify tidak bisa dipanggil lewat URL pada deploy
published, jadi jadwal `*/15`/`*/30` tidak bisa di-read dari publik. Bukti yang tersedia adalah
commit `2ca2729` + `50cd8b8` sudah ikut ter-push dan build produksi terjadi setelah push itu.
Jangan menganggap `detail:"gated"` sebagai degradasi — itu justru menandakan token health ada.

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

## 6. Downgrade DB1 — sudah terjadi

Owner sudah men-downgrade DB1 ke Free setelah prasyarat terpenuhi:

1. ✅ Dump db1 ada (`F:/tmp/db2/astro-2026-11-18.dump`), diambil **sebelum** downgrade.
2. ✅ DB2 terverifikasi penuh (parity 35/35, schema, RLS, Data API).
3. ✅ Push dan deploy sudah terjadi; build produksi `asj-astro-5ed75aa6e432` lebih baru dari push.
4. ✅ Smoke test health/ping/JWKS hijau; tripwire cron 9/9 hijau.

**Dua caveat yang masih berlaku:**

- Jangan hapus project DB1 sampai **satu siklus billing penuh** terlewat. Rollback = kembalikan
  `SUPABASE_URL` ke host DB1 lalu deploy ulang. Karena DB1 sekarang Free, compute bisa sudah
  scale-to-zero — rollback tidak instan dan schema cache perlu diverifikasi ulang.
- Jangan hapus/menimpa dump `F:/tmp/db2/astro-2026-11-18.dump`. Itu satu-satunya salinan
  pre-downgrade yang sudah teruji.

---

## 7. Ringkasan aksi

| # | Aksi | Siapa | Status |
|---|---|---|---|
| 1 | Push commit fix cron + deploy sampai `/version.json` berubah | Owner + lead | ✅ 2026-11-18 |
| 2 | Smoke test health/ping/JWKS pasca-deploy | Lead | ✅ 2026-11-18 |
| 3 | Downgrade db1 ke Free | Owner | ✅ 2026-11-18 |
| 4 | Pasang monitoring kuota DB2 (lihat §8) | Owner + lead | 🟡 desain siap, butuh key |
| 5 | Catat angka kuota harian/mingguan ke §4 | Owner / automation | 🟡 belum berjalan |

---

## 8. Desain alarm kuota — jangan tunggu `402`

### 8.1 Prinsip

1. **Pencegahan di kode sudah menjadi baris pertama.** `sweep-queue` `*/15` dan
   `agenda-reminders` `*/30` membuat duty cycle turun dari ~100 %/50 % menjadi ~33 %/17 %.
   Tes `service-reminder-cron.test.ts` mengunci literal itu; jangan melebarkannya kembali.
2. **Kuota dihitung per project.** Downgrade DB1 tidak menambah jatah DB2. Yang harus dipantau
   adalah project DB2 yang sekarang dipakai `SUPABASE_URL`.
3. **Data Neon diperbarui ~15 menit**, jadi polling harian sudah cukup. Tidak perlu cron tiap menit
   (itu justru menambah beban).
4. **Tidak ada rahasia di repo.** Key Neon hanya boleh hidup di luar repo, misalnya
   `F:/asj-kunci/NEON.env`, dan dibaca saat eksekusi saja.

### 8.2 Sumber data (API Neon, bukan menebak dari dashboard)

Simpan tiga nilai di luar repo: `NEON_API_KEY`, `NEON_ORG_ID`, `NEON_PROJECT_ID` (DB2).

```bash
curl --request GET \
  --url "https://console.neon.tech/api/v2/consumption_history/v2/projects?from=<AWAL_BULAN>&to=<HARI_INI>&granularity=daily&org_id=$NEON_ORG_ID&project_ids=$NEON_PROJECT_ID&metrics=compute_unit_seconds,public_network_transfer_bytes,private_network_transfer_bytes,root_branch_bytes_month,child_branch_bytes_month,snapshot_storage_bytes_month" \
  --header "Accept: application/json" \
  --header "Authorization: Bearer $NEON_API_KEY"
```

Konversi: `compute_unit_seconds / 3600` = CU-jam; `*_bytes / 1e9` = GB. Jangan pakai endpoint
legacy `/consumption_history/projects` (itu untuk paket lama). Pakai yang ada `v2`-nya.

### 8.3 Ambang dan tindakan

Anggap batas nyata = **100 CU-jam/bulan** (angka yang membuat DB1 pause). Kalau paket DB2
berbeda, ganti angka di tabel ini dari Console, jangan menebak.

| Metrik | Hijau | Kuning — waspada | Merah — jalankan cutover |
|---|---|---|---|
| Compute MTD | < 50 CU-jam | 50–70 | **> 70** (2 kali berturut-turut) atau > 85 sekali |
| Delta compute harian | < 3 CU-jam/hari | 3–5 tanpa lonjakan traffic | **> 5** tanpa lonjakan traffic → cari cron/polling |
| Network/egress | < 50 % kuota | 50–75 % | **> 75 %** |
| Storage | < 50 % kuota | 50–75 % | **> 75 %** |
| Hari tersisa siklus | > 10 | 5–10 | **< 5** |

Tindakan pada merah: **dump dulu selagi project hidup** → siapkan project baru → restore + parity
(§5) → ganti satu env `SUPABASE_URL` → deploy → simpan project lama satu siklus. `402` berarti
sudah terlambat: project di-PAUSE dan dump tidak bisa diambil lagi.

### 8.4 Kadensi dan penyampaian

- **Harian 09:00 WIB** — baca API, bandingkan dengan ambang §8.3, tulis ringkasan
  `CU-jam MTD / delta harian / egress / storage / hari tersisa`. Ini yang dipasang sebagai
  reminder rutin.
- **Senin 09:00 WIB** — ringkasan tren 7 hari + pastikan angka tercatat di §4 dokumen ini.
- **Kapan saja** kalau ada deploy baru yang menyentuh `netlify/functions/**` — cek ulang
  `export const config = { schedule: ... }` dan `setInterval`; ini penyebab insiden 18 Nov.

### 8.5 Kalau API key belum ada

Reminder tetap jalan dalam **mode manual**: pengingat membuka Neon Console → project DB2 →
Usage, lalu owner mengisi tiga angka (compute, egress, hari tersisa) ke §4. Mode otomatis
baru menyala setelah `NEON_API_KEY` + `NEON_ORG_ID` + `NEON_PROJECT_ID` tersedia di luar repo.
Jangan menaruh ketiganya di `deliverables/`, `.env`, atau chat.

---

> Dokumen ini dibuat dari pengukuran langsung, bukan asumsi. Jangan menaruh nilai koneksi atau JWT
> di sini — repo ini publik.
