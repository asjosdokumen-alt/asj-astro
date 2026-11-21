# Audit pemicu limit — Supabase egress vs Neon compute
Tanggal: 2026-11-18 · Repo: `E:/astro` · HEAD lokal `2ca2729` (`main`, **3 commit ahead of origin/main**, belum di-push).
Bersifat **baca saja**: tidak ada kode yang diubah, tidak ada push, tidak ada query ke produksi.

## 1. Ringkasan: dua limit, dua layanan, dua sebab

| Gejala | Layanan | Angka terukur | Akar |
|---|---|---|---|
| Baca data HTTP 402, portal data plane down | **Neon compute** | 110,13 CU-jam / plafon 100 CU-jam per **project per bulan** → project `ASTRO` di-PAUSE. Storage 0,04 GB & network 0,46 GB → **bukan** egress | Cron `sweep-queue` `*/2` + `agenda-reminders` `*/10` menyalakan compute terus-menerus (Neon suspend hanya setelah idle 5 menit) |
| Egress Supabase | **Supabase Storage (lama)** | Terukur 2026-10-19: satu kunjungan desktop + 5× "Muat Lebih Banyak" = **0,56 MB dari Supabase Storage**, objek dikirim dengan `Cache-Control: no-cache` | URL lama `/storage/v1/object/public/...` masih ada di DB & masih dipakai; server masih menandatangani/upload/menghapus objek di bucket Supabase |

`.env.local` & `env-kunci/PRODUCTION.env` (host saja, tanpa kunci):
- `SUPABASE_URL` → `ep-bold-sunset-b3zy6wb1.apirest.c-4.ap-southeast-1.aws.neon.tech` (**DB = Neon**)
- `STORAGE_SUPABASE_URL` → `gdwvffmevwtwnzrapjwy.supabase.co` (**Storage = Supabase lama**)

Jadi: **pindah DB ke Neon tidak mematikan egress Storage Supabase.** Itu sebabnya masalahnya terasa "pindah-pindah".

## 2. Apa yang dikatakan git terakhir

`2ca2729 fix(cron): widen sweep to */15 and agenda to */30 — stop burning Neon compute quota` (2026-11-18 07:21 WIB).
Isi commit: `sweep-queue.ts` `*/2` → `*/15`, `agenda-reminders.ts` `*/10` → `*/30`, komentar di kedua fungsi + `netlify.toml` + literal tes `service-reminder-cron.test.ts:123`.

Penjelasan di message commit (dan log harian 2026-11-18): 720 run/hari vs idle-suspend 5 menit ⇒ compute tidak pernah scale to zero ⇒ 0,25 CU × 24 jam ≈ 6 CU-jam/hari ⇒ ≈110 CU-jam dalam 17 hari. **Yang menghabiskan kuota ialah duty cycle, bukan interval**: pada jendela suspend 5 menit, `*/7` masih ≈71 % aktif (≈130 CU-jam/bulan), jadi "diperpanjang sedikit" tidak menyelesaikan masalah. `*/15` ≈33 % (≈60 CU-jam/bulan).

⚠ `2ca2729` dan 2 commit sebelumnya (`e8f87fe`, `55b081e`) **masih lokal, belum di origin/main**. Sesuai aturan repo tidak push tanpa izin — perbaikan ini belum bisa menolong produksi sebelum di-deploy.

## 3. Semua pemicu limit di kode (urutan prioritas)

### Neon compute

| Prioritas | Lokasi | Pola | Dampak |
|---|---|---|---|
| **P0 — sudah diperbaiki di lokal, belum deploy** | `netlify/functions/sweep-queue.ts:161` | `config.schedule '*/15'` (dulu `*/2`); tiap run 5× `claimJob` + `completeJob`/`failJob` + cleanup | 96 run/hari × ~8–17 panggilan PostgREST; dulunya 100 % duty cycle |
| **P0 — sudah diperbaiki di lokal, belum deploy** | `netlify/functions/agenda-reminders.ts:146` | `'*/30'` (dulu `*/10`) + notif FCM/Fonnte | 48 run/hari; dulunya duty cycle 50 % |
| P3 | `netlify/functions/retensi-notif.ts:52` | `'0 3 1 * *'`, sekali sebulan hapus notif >30 hari | Minor, tapi tetap menyalakan compute sebentar |
| **P1 — belum diperbaiki** | `netlify/functions/_lib/handlers.ts:291-307` → `_lib/kernel/rate-limit.ts:47,76` | **Setiap aksi non-read menjalankan RPC `rate_limit_check`, dan login gagal menambah `rate_limit_fail`** — keduanya transaksi **write** di Neon | Penyumbang terbesar setelah cron; dapat dipindah ke memori/edge untuk aksi non-kritis |
| **P1** | `contexts/catalog/service.ts:55-87` → `_lib/db/berkas.ts` | `getAppData(admin)` memuat kandidat + berkas + jadwal + tugas + semua form + template WA dalam 8–10 round-trip, tanpa cache (cache CDN hanya untuk panggilan anonim di `surfaces/public.ts:47-49`) | Tiap buka/refresh tab admin = beban penuh |
| **P1** | `contexts/catalog/service.ts:139` → `_lib/db/candidates.ts:292` | Laporan bulanan `pageSize=5000` → `id=in.(5000 id)` | Satu permintaan = full-table read |
| P2 | `contexts/applications/service.ts:445-463,561-586` | N+1: `getFormByIndex` + `deleteForm`/`patchForm` per baris pada aksi massal | Puluhan round-trip serial |
| P2 | `contexts/configuration/repository.ts:75-82` | Loop N `POST rincian_presets` saat simpan konfigurasi | N write serial (jarang) |
| P2 | `migrations/053:151-230`, `060:58-68`, `013:176`, `017:63` | Trigger mirror master→candidate memakai `asj_norm_wa(no_wa)` (non-sargable) | Extra UPDATE tiap tulis kandidat |
| P2 | `_lib/db/client.ts:452-465` | Retry otomatis saat `jwk not found` (1 request tambahan) | Sering saat kunci/token berubah |
| P3 | `kernel/http.ts:169`, `client.ts:452` | `fetch()` baru per panggilan, tanpa pool/keep-alive bersama | Memperpanjang waktu aktif, kecil per call |

Dibebaskan dari tuduhan (sudah diverifikasi agent): `exportMetrics` hanya kirim ke webhook/OTLP (bukan Neon), `claim_next_job` hanya dipanggil `sweep-queue`, `getSchema()` hanya fallback 20 detik, `select=*` sudah ditulis ulang jadi kolom eksplisit di `client.ts:79-86`.

### Supabase egress / trafik keluar

| Prioritas | Lokasi | Pola | Dampak |
|---|---|---|---|
| **P1** | `src/lib/thumbUrl.ts:4-42,70-75` | URL lama `/storage/v1/object/public/asj-files/...` diubah ke endpoint `render/image` (150 KB → 5,8 KB). Namun masih banyak baris DB dengan URL lama dan Supabase mengirim `Cache-Control: no-cache` | **0,56 MB per kunjungan desktop** terukur; dibayar ulang tiap kali |
| **P1** | `_lib/storage.ts:12-38,185-230` · `contexts/documents/service.ts:263-296` · `_lib/db/berkas.ts:375` | `storageRequest()` ke `STORAGE_SUPABASE_URL`: sign upload (4 konkuren per berkas), `object/list`, `DELETE object`, `uploadBase64`, hapus varian lama | Request + egress Supabase masih nyata walau browser sudah upload ke Cloudinary |
| P2 | `src/lib/cloudinary.ts:113-169` | `uploadMany`, retry ≤3 dengan backoff 1 s/2 s | Egress Cloudinary (bukan kuota Supabase/Neon) |
| P2 | `_lib/ai/providers.ts:228,731-820` | `geminiGenerate` → `hedgedInvoke` beberapa model + fallback Groq (`570`) lalu Grok xAI (`585`) | 1–3+ request model per giliran chat saat gagal |
| P3 | `src/layouts/BaseLayout.astro:838`, `src/components/VersionBadge.astro:218-223` | `setInterval(reg.update(), 5 mnt)` + pengecekan versi tiap 15 mnt/visibility change | ~16 request/jam per tab ke **origin sendiri**, bukan Neon/Supabase — noise log, bukan penyebab kuota |

Kode yang **tidak** menyumbang: `src/lib/supabase.ts` `createClient` (guard `isSupabaseConfigured()` menolak host Neon), `userStore.ts` auth methods (tidak network saat DB Neon), URL `/object/public/` di komentar di `App.tsx`/`Footer.astro`, `_lib/demo.ts` (hanya saat `!hasBackend()`).

## 4. Google Search Console / crawler — bukan biang kerok

- `public/google14e7b4044f7cab6a.html` = file verifikasi **metode HTML file** (commit `68bf926`, 2026-11-14). Ini yang Anda maksud "kemarin": **bukan robot/crawler yang dipasang**, cuma file statis 54 byte untuk klaim kepemilikan situs. Tidak ada meta tag verifikasi.
- `public/robots.txt:25-46`: `User-agent: *` → `Allow: /`; blokir `/admin`, `/candidate`, `/share`, `/master`, `/.netlify/`. **Tidak ada baris `Sitemap:`** (sengaja, karena host sudah pindah 3×), tidak ada `Crawl-delay`. Tidak ada aturan yang mengundang bot agresif.
- `src/pages/sitemap.xml.ts:48-51,74`: dibuat **saat build**, hanya **5 URL** (3 statis + 2 artikel blog), tidak ada query param/paginasi, tidak ada baca DB saat request. `/apply`, `/siswa-baru`, `/ai-cv` sengaja dikeluarkan 2026-11-14 karena thin content (<300 karakter).
- `astro.config.mjs:23-24`: SSR tidak aktif → halaman yang diindex adalah HTML statis. `/loker` & `/public` memang punya island yang memanggil `getAppData`, tapi respons anonim di-cache CDN: `s-maxage=60, stale-while-revalidate=86400` (`surfaces/public.ts:20-25,47-49`).
- Tidak ada cloaking/prerender khusus bot, tidak ada `llms.txt`/`feed.xml`/`.well-known`; rate limiter DB-backed ada di `_lib/handlers.ts:291`.

**Kesimpulan:** GSC/crawler bukan penyebab utama limit. Yang bisa dicek dari luar kode: GSC → Crawl Stats & Pages (heap "Blocked by robots.txt"), Netlify Functions log → jumlah invoke `sweep-queue`/`agenda-reminders`/`get-app-data`, serta CDN cache-hit ratio.

## 5. Bisa pindah ke email Neon lain / pakai 2 DB?

Fakta kebijakan Neon terkini (dokumentasi resmi, dicek 2026-11-18):
- Free = **100 CU-jam per project per bulan**, **100 project per akun**, 1 GB storage per project (total 20 GB per akun), **5 GB egress per project per bulan**.
- Scale-to-zero **5 menit, tidak bisa dimatikan** di Free. Jika kuota habis, compute di-**suspend** sampai siklus berikutnya atau upgrade; **data tidak dihapus** (koneksi Postgres gagal dengan SQLSTATE `53000`; Data API yang Anda pakai menampilkan HTTP 402).
- Launch (usage-based, tanpa biaya minimum): **$0,106/CU-jam**, 500 GB transfer/project/bulan. Scale: $0,222/CU-jam.

| Opsi | Bisakah | Catatan untuk repo ini |
|---|---|---|
| **Upgrade ke Launch** | ✅ Paling bersih | Dengan cron baru ≈60 CU-jam/bulan → ≈**$6,4/bulan**; tanpa perbaikan cron ≈110 CU-jam → ≈$11,7/bulan. Langsung aktif, project tidak perlu pindah host/DB. |
| **Project Neon kedua, akun/email yang sama** | ✅ Secara teknis didukung (100 project/akun; kuota dihitung **per project**) | Tapi ini **bukan "tambah kuota untuk DB yang sama"**. Harus memindahkan sebagian tabel/trafik atau replikasi. Butuh dual-write/routing, RLS/JWT, dan **migrasi dulu, deploy kode kemudian** (PGRST204). Risiko konsistensi besar untuk data kandidat. Layak hanya untuk memisahkan dev/prod, bukan untuk menambah kapasitas situs yang sama. |
| **Email/akun Neon lain** | ⚠ Tidak perlu & berisiko | Karena kuota sudah per-project, akun baru tidak memberi apa-apa yang tidak bisa didapat dari project kedua di akun yang sama. Membuat banyak akun untuk melipatgandakan kuota gratis berisiko melanggar acceptable use/ToS dan bisa kena suspend akun. Tidak disarankan. |
| **Otimasi dulu, baru bayar** | ✅ | Cron sudah diperbaiki di lokal. Sisanya: pindahkan rate-limit write ke in-memory/edge, batasi/paginasi `getAppData` admin, hapus N+1 aksi massal, dan selesaikan migrasi Storage Supabase → Cloudinary di sisi server. Setelah itu ≈60 CU-jam/bulan masih **melebihi batas ideal 8 jam kerja × 30 hari = 240 jam × 0,25 CU = 60 CU-jam** — jadi untuk pemakaian jam kerja penuh, Launch tetap lebih realistis. |

## 6. Urutan tindakan yang disarankan

1. **Deploy `2ca2729`** (3 commit lokal belum di `origin/main`). Cek meter Neon setelah deploy; project yang masih paused perlu upgrade atau menunggu reset siklus ~1 Desember.
2. Ukur lagi: log invoke `sweep-queue`/`agenda-reminders`, CU-harian di Neon, dan egress harian di Supabase. Jangan pakai angka lama 660/35.600 atau 110 CU-jam tanpa mengukur ulang.
3. Jika egress Supabase masih naik: ubah semua sisa URL `/storage/v1/object/public/` di DB ke Cloudinary via migrasi data, dan ganti sisa `storageRequest()` di sisi server ke Cloudinary; baru setelah itu nonaktifkan project Supabase lama.
4. Turunkan beban compute non-cron: rate-limit berbasis DB → in-memory/edge untuk aksi non-login, batch query admin, hapus N+1.
5. Putuskan Launch vs project kedua. **Jangan buat akun email baru** hanya untuk menambah kuota.

Tidak ada perubahan file kode, tidak ada push, tidak ada aksi ke produksi dalam audit ini.
