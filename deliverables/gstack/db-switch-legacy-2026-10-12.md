# Ganti DB repo ke proyek legacy (2026-10-12)

Perintah pemilik: *"tolong db repo ini ganti ke db yg live legacy."*
Sumber kredensial: `F:/env legacy.txt` (diberikan pemilik) + `C:/Users/k89/Desktop/.env`.

## 1. Yang berubah

`.env` dan `.env.local` (keduanya **gitignored** — `.gitignore:14` dan `:96`) sekarang
menunjuk proyek **`gdwvffmevwtwnzrapjwy`**, sebelumnya **`bimqyugdhiuxcqltjjnt`**.

| Variabel | Sebelum | Sesudah |
|---|---|---|
| `PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | `bimq…supabase.co` | `gdwvffmevwtwnzrapjwy.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` | kunci bimq | kunci gdw (ref & role diverifikasi dari payload JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | kunci bimq | kunci gdw (ref & role diverifikasi) |
| `SUPABASE_JWT_SECRET` | kunci bimq | ⚠ **`CHANGE_ME__gdw_jwt_secret_from_supabase_dashboard`** |

Cadangan kedua berkas: `F:/tmp/env-bak/.env.bimq-2026-10-12` dan
`F:/tmp/env-bak/.env.local.bimq-2026-10-12`. Kembalikan dengan menyalinnya kembali.

Dibuktikan loader repo sendiri (`scripts/lib/load-env.mjs` → `applyEnvFiles()`):

```
SUPABASE_URL         = https://gdwvffmevwtwnzrapjwy.supabase.co
PUBLIC_SUPABASE_URL  = https://gdwvffmevwtwnzrapjwy.supabase.co
service key ref      = gdwvffmevwtwnzrapjwy
```

## 2. Isi DB legacy — terukur 2026-10-12

Lewat REST dengan service-role key gdw (`Prefer: count=exact`):

| Tabel | gdw (legacy) | bimq (cadangan, 2026-10-09) |
|---|---|---|
| `database_candidate` | **226** | 226 |
| `database_asj_form` | **51** | 21 |
| `job_database` | **159** | 158 |
| `ai_form_submissions` | **43** | — |

`database_asj_form` 51 vs 21 ⇒ pengajuan pelamar memang **lebih lengkap di gdw**.
Ini konsisten dengan `deliverables/gstack/db-rapikan-2026-10-09.md:7`
("Yang live (`gdwvffmevwtwnzrapjwy`) tidak disentuh sama sekali").

anon key → `count=*/0` di `database_candidate` dan `job_database` ⇒ **RLS aktif**,
jadi service-role key wajib (sudah ada).

## 3. ⚠ Tiga hal yang BELUM selesai

### a. JWT secret gdw belum ada — aksi admin tertentu akan 401

`SUPABASE_JWT_SECRET` dipakai `createSupabaseJwt()` (`_lib/kernel/db.ts:51`) untuk
membuat JWT yang dievaluasi RLS. Tidak ada di `F:/env legacy.txt`, tidak di
`C:/Users/k89/Desktop/.env`, tidak di `.env.example`, tidak di riwayat git, tidak di
env Netlify akun ini, dan token Netlify legacy sudah mati (`Unauthorized`).

Diukur ke gdw dengan JWT bertanda-tangan salah:

```
anon key as bearer                            HTTP 200 count=*/0
JWT bertanda-tangan salah (role=authenticated) HTTP 401 PGRST301
  "None of the keys was able to decode the JWT"
```

Yang memakai user-client (`clientFor`) dan karena itu **akan gagal 401** sampai nilai
asli diisi: `applications.patchForm`, `applications.deleteForm` (aksi Mail
Lulus/Review/Gagal + hapus form) dan `jobs.patchJob`.

**Daftar job/kandidat tetap jalan** — jalur itu lewat `supabaseJson()`, yang default-nya
`SUPABASE_SERVICE_ROLE_KEY` (`_lib/db/client.ts:26`), bukan RLS.

Ambil di Supabase → Project Settings → API → JWT Settings → Legacy JWT Secret.

### b. gdw belum di-migrasi — 6 objek `required` hilang

`npm run verify:db` ke gdw:

```
MISS  tbl  job_queue          required
MISS  tbl  rate_counters      required
MISS  tbl  dependency_calls   optional
MISS  tbl  idempotency_keys   optional
MISS  fn   claim_next_job     required
MISS  fn   rate_limit_check   required
MISS  fn   rate_limit_fail    required
MISS  fn   reclaim_stuck_jobs optional
tables 13 · rpc 4 · missing 6 required / 3 optional
```

Konsekuensi yang disebut gate itu sendiri: tanpa `claim_next_job` dua worker bisa
mengerjakan job yang sama (WhatsApp terkirim ganda, biaya AI dobel); tanpa
`rate_limit_check` batas login/OTP bisa dilewati di bawah konkurensi.

Baseline pembanding, diukur dengan env lama (bimq) disuntik:

| Target | `verify:db` |
|---|---|
| bimq | 1 required hilang (`database_candidate.status_biodata`) |
| gdw | **6 required hilang** |

`npm run verify:schema` juga merah ke gdw: sidik jari
`sha256:ad1fb8a277e9` (DB) ≠ `sha256:22799ccccabc` (commit) — kontrak yang di-commit
dibuat dari bimq. **`schema.generated.ts` sengaja TIDAK saya regenerate**: kalau
di-commit, kontraknya akan menyatakan repo tidak lagi memakai `job_queue` — padahal
kodenya masih memakainya. Urutan yang benar: **migrasi gdw dulu, baru regenerate**
(`npm run db:schema`).

Untuk migrasi perlu `SUPABASE_DB_URL` (password DB gdw) yang juga belum ada.
Perlu keputusan pemilik: `npm run migrate:up` menyentuh **DB produksi legacy**.

### c. Situs yang tayang MASIH memakai bimq

Repo dan deploy adalah dua tempat berbeda. Terukur 2026-10-12:

| Sumber | Ref yang dibaca |
|---|---|
| chunk `supabase.uoKCwF1p.js` di `boisterous-taiyaki-c61202.netlify.app` | **bimq** |
| `netlify env:list --context production` (site `asjastro`) | **bimq** |

Jadi mengganti `.env` repo **tidak** mengubah produksi. Untuk itu env Netlify harus
diganti + redeploy (1 deploy berbayar, R19). Belum dikerjakan — menunggu perintah.

Catatan: `README.md:43-55` masih menyebut bimq = "data" dan gdw = "aset publik saja".
Itu **bertentangan** dengan `db-rapikan-2026-10-09.md` dan dengan data di atas
(gdw punya 226 kandidat + 51 form). Sudah dilaporkan sebagai butir #2 di
`pre-launch-fix-round6-2026-10-08.md:153`. README belum diperbaiki.

## 4. Temuan terpisah: filter pelamar memang tidak melihat seluruh data

Sebab "filter data pelamar gak muncul" **bukan** soal DB mana. Terukur di kode:

- `src/components/admin/TabPelamar.tsx:112` — `filtered` menyaring **`kandidatList`
  yang sudah dimuat**, bukan seluruh DB.
- `adminStore.ts:72` — `PAGE_SIZE = 20`; `fetchKandidatFromAPI()` mengisi 20 baris per
  halaman (`adminStore.ts:151-175`).
- Pemanggilannya hanya dua: saat mount (`TabPelamar.tsx:42`) dan tombol "muat lagi"
  (`:379`). Mengetik di kotak cari hanya `setAdminSearch()` + `resetPage()`
  (`:185`) — **tidak** memicu fetch ulang.

Akibatnya: mencari pelamar yang barisnya belum dimuat (kandidat ke-21 dst.) selalu
menghasilkan **0 baris**, dan filter gender/usia/JFT (`:118-124`) tidak pernah dikirim
ke server sama sekali. Server sebenarnya sudah mendukung pencarian (`q` →
`saringKandidatUnik` di `contexts/catalog/repository.ts:151`), hanya tidak pernah
dipakai ulang setelah mount.

## 5. Status berkas

`git status` bersih — tidak ada berkas tracked yang berubah (`schema.generated.ts`
sudah dikembalikan). Perubahan hanya di dua berkas gitignored di atas.
