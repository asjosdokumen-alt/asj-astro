# Situs `asjastro` dipindahkan ke DB legacy (gdw) — catatan perubahan

Dikerjakan **2026-10-12** atas permintaan pemilik
(*"benerin yg astro saja ya soalnya token e banyak yg di astro"*).

Status akhir: **`asjastro.netlify.app` sekarang memakai DB legacy (gdw)** — terverifikasi.

---

## 1. Apa yang diubah

Situs: `asjastro` — id `be40978f-aeab-42b7-a549-d9556e4f15de`, akun `asjosdokumen`.
Enam kunci di env-nya **semuanya masih milik cadangan (bimq)**; diganti ke gdw:

| Kunci | Sebelum | Sesudah |
| ----- | ------- | ------- |
| `SUPABASE_URL` | bimq | **gdw** |
| `SUPABASE_ANON_KEY` | bimq | **gdw** |
| `SUPABASE_SERVICE_ROLE_KEY` | bimq | **gdw** |
| `SUPABASE_JWT_SECRET` | bimq | **gdw** (88 karakter) |
| `PUBLIC_SUPABASE_URL` | bimq | **gdw** |
| `PUBLIC_SUPABASE_ANON_KEY` | bimq | **gdw** |

18 variabel lain **tidak disentuh** (PIN admin, `SESSION_SECRET`, Fonnte, Gemini, Groq,
Cloudinary, Firebase, Grafana, XAI, `HEALTH_TOKEN`, dll) — total env tetap **24**.

**Cadangan env lama** (nilai asli, apa adanya):
`F:/tmp/env-bak/asjastro-env-2026-10-12.json` — untuk memulihkan kalau perlu.

Sebelum dipasang, nilai gdw divalidasi lebih dulu (agar tidak mengulang kegagalan
"Invalid API key" seperti di situs `boisterous`): anon → `database_candidate` **200**,
service → `database_candidate` **200**, service → akar `/rest/v1/` **200**.

---

## 2. Redeploy — dan jebakannya

`PUBLIC_*` ikut **dibekukan ke bundel klien saat build**, jadi ganti env saja tidak cukup.

🪤 **`POST /sites/{id}/deploys` BUKAN cara memicu build dari repo.** Endpoint itu membuat
deploy **manual** yang menunggu unggahan berkas — hasilnya deploy menggantung di
`state=new` selamanya (terukur: 11 menit tanpa perubahan, `DELETE` pun ditolak
`405 Cannot delete a deploy in the new state`). Yang benar:

```
POST /api/v1/sites/{site_id}/builds      -> build dari repo yang tertaut
```

Build itu selesai dalam **~45 detik** (`building → uploading → ready`).

---

## 3. Verifikasi (bukan "sepertinya")

| Yang diperiksa | Hasil |
| -------------- | ----- |
| `diagnostics` → `getAppConfig` | `supabaseReachable: true` · error `null` · **26 tabel** · `database_asj_kontak` **ada** |
| endpoint publik `getAppData` | **159 job** · **`TG666ASJ` ada** · **`Magang` ada** |
| bundel klien | anon key **gdw** ada · anon key **bimq** **0** · ref bimq **0** |
| stamp build | `asj-astro-e5126f113c1a` → **`asj-astro-09f65bd97415`** |
| deploy terbit | `6accf6f9701c…` state **ready** |

🔴 **Penanda pembeda DB (berganti):** setelah gdw dimigrasi `001`–`016`,
**gdw = 26 tabel** (memuat `database_asj_kontak`), **bimq = 25**. `job_queue`
**tidak lagi** bisa dipakai sebagai penanda karena sekarang ada di keduanya.

---

## 4. Temuan sampingan dari riwayat deploy

Situs `asjastro` **bukan** situs beku. Riwayatnya:

```
2026-09-24 .. 2026-09-28   7 deploy  error  "Skipped due to account credit usage exceeded"
2026-10-07 .. sekarang      semua    ready
```

Jadi kredit akun pernah habis (24–28 Sep) — itulah asal-usul situs
`boisterous-taiyaki-c61202` sebagai pengganti — lalu **pulih sejak 2026-10-07**.
Akun saat ini bertipe **Free** (kuota menit build terbatas).

Satu deploy manual yang menggantung (`6accf423…`, `state=new`) masih terlihat di daftar
tetapi **tidak terbit**; Netlify menolak menghapusnya selama berstatus `new`.
Tidak berpengaruh pada situs.

---

## 5. Yang MASIH terbuka

1. ⚠️ **`boisterous-taiyaki-c61202.netlify.app` masih menyajikan lowongan PALSU.**
   `SUPABASE_URL`-nya sudah gdw tetapi kuncinya milik project lain ⇒
   `HTTP 401 Invalid API key` ⇒ 0 tabel ⇒ jatuh ke data DEMO yang di-hardcode
   (`_lib/demo.ts`: kode `DEMO-0001`, kategori `KAIGO`). Situs itu bisa dibuka siapa saja.
   Perlu diperbaiki kuncinya, atau diarahkan/dimatikan. (Token yang ada hanya bisa
   melihat `asjastro`, jadi ini perlu akses dashboard/akun pemilik situs itu.)
2. 🔴 **3 aksi admin tetap gagal walau JWT secret sudah benar** — `applications.patchForm`,
   `applications.deleteForm`, `jobs.patchJob`. JWT-nya membawa role `admin`/`kandidat`
   yang **bukan role Postgres** ⇒ `HTTP 401 22023 role "admin" does not exist`
   (terukur di **gdw dan bimq**). Mengisi secret hanya memindahkan gejala dari
   `PGRST301` ke `22023`. Perbaikannya menunggu keputusan pemilik — tiga opsi ada di
   `.workbuddy-ai/memory/2026-10-12.md`.
3. 🔑 **Token Netlify yang dikirim lewat chat sebaiknya dirotasi**, karena sudah
   melewati riwayat percakapan. Token itu berhak mengubah env produksi.
