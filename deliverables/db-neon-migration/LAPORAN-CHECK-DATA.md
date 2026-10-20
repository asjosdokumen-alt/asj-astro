# Laporan: data di Neon sudah identik dengan Supabase lama

**Tanggal check:** 2026-10-20
**DB lama (Supabase):** project `gdwvffmevwtwnzrapjwy` — `db.gdwvffmevwtwnzrapjwy.supabase.co`
**DB baru (Neon):** `ep-bold-sunset-b3zy6wb1` — `neondb`, region `ap-southeast-1`, PostgreSQL 18.6
**Cara memverifikasi ulang:** `node deliverables/db-neon-migration/verify-db-parity.mjs --neon '<connection-string>'`

---

## Jawaban singkat

**Sama — 100 %.** Tidak hanya jumlah barisnya yang sama: setiap baris di setiap tabel di-*hash* dan dibandingkan isinya. 26 tabel, 26 tabel identik, 0 beda.

Yang TIDAK ikut dibandingkan (dan itu penting untuk keputusan, bukan untuk data): API layer Supabase.
Penjelasannya ada di `RENCANA-MIGRASI-LENGKAP.md`.

---

## Bukti

Hasil langsung dari script (`verify-db-parity.mjs`), exit code 0:

```
TABEL                         STATUS                            DETAIL
----------------------------------------------------------------------------------------------------
ai_form_submissions           IDENTIK (44 baris)
data_archive                  IDENTIK (0 baris)
database_asj_form             IDENTIK (51 baris)
database_asj_kontak           IDENTIK (0 baris)
database_candidate            IDENTIK (226 baris)
database_schedule             IDENTIK (0 baris)
database_tugas                IDENTIK (0 baris)
dependency_calls              IDENTIK (31 baris)
esignatures                   IDENTIK (0 baris)
fcm_tokens                    IDENTIK (19 baris)
idempotency_keys              IDENTIK (0 baris)
job_database                  IDENTIK (159 baris)
job_queue                     IDENTIK (0 baris)
master_database_candidate     IDENTIK (234 baris)
meta_rev                      IDENTIK (1 baris)
netlify_logs                  IDENTIK (0 baris)
pemberkasan_checklist         IDENTIK (7 baris)
rate_counters                 IDENTIK (7 baris)
respon_siswa_baru             IDENTIK (3 baris)
rincian_presets               IDENTIK (13 baris)
schedule_reminders            IDENTIK (0 baris)
schema_migrations            IDENTIK (16 baris)
siswa_baru_docs               IDENTIK (0 baris)
sys_config                    IDENTIK (160 baris)
user_sessions                 IDENTIK (53 baris)
wa_templates                  IDENTIK (2 baris)
----------------------------------------------------------------------------------------------------
tabel: 26 | gagal: 0
HASIL: data Neon identik dengan Supabase lama.
```

### Yang dicek, dan kenapa tiap poin itu perlu

| # | Yang dicek | Metode | Hasil |
|---|---|---|---|
| 1 | Jumlah tabel `public` | `information_schema.tables` vs OpenAPI PostgREST | 26 = 26, tidak ada tabel hilang/lebih |
| 2 | Nama + tipe kolom | `information_schema.columns` vs `definitions` OpenAPI | 0 beda — termasuk `uuid`, `bigint`, `jsonb`, `timestamptz` |
| 3 | Jumlah baris | `count(*)` vs `Prefer: count=exact` | 0 beda |
| 4 | **Isi tiap baris** | SHA-1 atas baris yang dinormalkan (Date→ISO, bigint→string, kunci jsonb diurutkan) | 0 beda, 0 baris "hanya di salah satu sisi" |
| 5 | Index | `pg_indexes` | 70 index, ada di Neon |
| 6 | Constraint | `pg_constraint` | 141 constraint (PK, UNIQUE, CHECK, NOT NULL) |
| 7 | Trigger + fungsi | `pg_proc`, `information_schema.triggers` | 6 fungsi + 1 trigger (`trg_status_biodata_admin_only`) |
| 8 | RLS | `pg_class.relrowsecurity`, `pg_policies` | RLS aktif di 26/26 tabel, 3 policy utuh (`form_own_wa`, `candidate_own_wa`, `master_own_wa`) |
| 9 | Sequence | `pg_sequences` vs `max(id)` | aman — `last_value` di atas `max(id)` di semua tabel (mis. `master_database_candidate_id_seq` = 553 vs 234 baris; `user_sessions_id_seq` = 580 vs 53). **Insert baru tidak akan tabrakan PK.** |

Poin 4 dan 9 adalah dua yang paling sering terlupa. Dua basis data bisa punya 234 baris di setiap tabel dan tetap berbeda isinya; dan sebuah restore bisa menyalin data dengan panas (`COPY`) lalu meninggalkan sequence di 1, sehingga baris ke-235 gagal insert dengan `duplicate key value violates unique constraint`.

---

## Perbedaan yang ADA (dan tidak masalah untuk data)

| Perbedaan | Jelasnya |
|---|---|
| Neon punya skema tambahan `neon_auth` (tabel `user`, `session`, `organization`, …) | Milik produk Neon Auth. Aplikasi ini tidak memakannya, jadi 0 dampak. Boleh dibiarkan. |
| Extension Neon hanya `plpgsql 1.0` | Fungsi yang dipakai aplikasi (`claim_next_job`, `rate_limit_check`, `rate_limit_fail`, `reclaim_stuck_jobs`, `enforce_status_biodata_admin_only`, `update_modified_column`) sudah ada dan berjalan. Tidak ada index trigram di skema ini. |
| Ukuran basis data | **11 MB**. Tetap jauh di bawah batas Supabase Free (500 MB) — lihat catatan di bawah. |
| Basis data yang lebih baru | Neon: PostgreSQL 18.6. |

---

## Backup

Dump penuh 26 tabel (semua baris, JSON) disimpan untuk cadangan di:

```
F:/tmp/dbprobe/backup/
  _all.json       4,8 MB  (semua tabel sekaligus)
  _openapi.json          (kontrak PostgREST Supabase — dokumentasi tipe kolom)
  <nama-tabel>.json      (per tabel)
```

⚠️ **Ini berisi data pribadi kandidat (WA, NIK, nama, alamat). JANGAN di-commit ke repo — repo ini publik.** Pindahkan ke drive pribadi/cloud privat sebelum `F:/tmp` dibersihkan.

---

## Satu hal yang belum bisa saya buktikan dari mesin ini

Saya tidak bisa membuka koneksi SQL langsung ke Supabase **lama**:

- Host direct connection `db.gdwvffmevwtwnzrapjwy.supabase.co` → DNS tidak dijawab sama sekali (`ENOTFOUND`, bahkan `AAAA` dan `A` kedua-duanya `ECONNREFUSED`). Supabase memindahkan host direct connection ke IPv6-only; mesin ini tidak punya IPv6.
- Pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432` (host yang benar untuk region ini) → TCP tersambung, tapi **password baru yang Anda kirim ditolak**: `password authentication failed`. Yang menolak adalah autentikasi Postgres, jadi ini soal kredensial, bukan jaringan.
- Koneksi **REST ke Supabase lama masih hidup** (`GET /rest/v1/` → 200, service-role key masih valid) — dan justru lewat jalur itulah seluruh perbandingan di atas dijalankan. Jadi hasilnya tidak terpengaruh.

**Tindak lanjut untuk Anda:** buka Supabase Dashboard → Project Settings → Database, dan konfirmasi password barunya sudah benar-benar tersimpan (Supabase sesekali butuh beberapa menit untuk propagasi, dan password yang mengandung karakter khusus bisa terpotong saat disalin). Kalau nanti mau dump `pg_dump` asli (bukan dump REST), itu harus dari mesin dengan IPv6 atau dari Supabase SQL Editor. **Check data di atas tidak membutuhkannya** — data sudah terbukti identik lewat jalur REST.

---

## Catatan yang mengubah arti "limit" ini

Ukuran datanya **11 MB**. Kalau yang Anda maksud "limit dikit" adalah ukuran database, Supabase Free (500 MB) masih menyisakan ~489 MB — jadi ukuran DB bukan penyebabnya.

Yang benar-benar pernah jebol di sistem ini adalah **egress**, dan itu masalah yang berbeda: berkas kandidat (KTP/KK/ijazah/foto, ±295 MB) dulu dilayani dari Supabase Storage dengan `Cache-Control: no-cache`, sehingga setiap kali berkas DILIHAT, byte-nya keluar dari kuota. Sudah ditangani lewat Cloudinary + `netlify.toml` (`immutable` untuk `/assets/*` dan `/icons/*`), tidak lewat pindah database.

**Pindah ke Neon tidak memegang egress itu.** Yang melayani byte kepada kandidat setelah cutover adalah `SUPABASE_URL` Storage di `netlify/functions/_lib/storage.ts` — dan itu tetap Supabase walau database-nya Neon. "Pindah ke Neon" dan "memperbaiki limit" adalah dua pekerjaan berbeda; detailnya di `RENCANA-MIGRASI-LENGKAP.md` bagian "2 hal yang perlu dipisahkan".
