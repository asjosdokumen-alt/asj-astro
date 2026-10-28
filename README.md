# ASJ Portal v2

**Astro + Preact + Neon** — portal rekrutmen kerja ke Jepang (PT Amanah Sakura Japan).

Situs statis (Astro SSG) dengan pulau Preact, backend di Netlify Functions,
**database di Neon Postgres** (Data API / PostgREST, region `ap-southeast-1`),
**file di Supabase Storage**. Nama variabel env tetap `SUPABASE_*` — lihat
[Data layer](#-data-layer-neon-bukan-supabase) di bawah.

---

## 📊 Status (terukur 2026-10-28 pada `266aa9b`)

| | |
|---|---|
| **Suite uji** | **269 berkas · 3.219 tes · ~409 s** — hijau. (Angka lama di sini: 183/2.221 — basi 20 hari) |
| **`tsc --noEmit`** | bersih (exit 0, diukur ulang 2026-10-28) |
| **`verify:md`** | OK — 75 berkas tabel diperiksa |
| **`lint-ratchet`** | 🔴 **MERAH: 2.009 vs baseline 2.001 (+8)**, sisa gelombang perbaikan 2026-10-28. **Perbaiki sumbernya, jangan `--update-baseline`** — itu akan menghapus juga penurunan 4 diagnostik di dua berkas lain. Rincian: `deliverables/review/perf-bug-review-2026-10-28.md` §G1 |
| **Halaman publik** | `/` **9,9** · `/public` **10,0** · `/loker` **9,9** · `/404` **10,0** — snapshot 2026-10-07, `deliverables/gstack/public-pages-review-2026-10-07.md` |
| **Deploy produksi** | **hidup** sejak 7 Okt 2026 ⇒ push `main` = deploy berbayar yang langsung tayang |
| **Berkas tracked** | 1.170 berkas · ~31 MB (terbesar: `deliverables/` bukti audit, `public/` aset) |
| **Counter beku** | `files.length = 603` · plafon simbol **29.900** (terukur 29.808) — **hanya team-lead** yang boleh menggesernya |

> ⚠️ **Dua butir yang butuh keputusan owner** — sudah terukur, **belum** dikerjakan:
>
> 1. **Kontras eyebrow hero `/` — GAGAL HANYA DI MOBILE.** `text-pink-300 text-eyebrow` 11px/700
>    di atas artwork. Diukur ulang 2026-10-14 (piksel latar terukur): **390px → 3,08:1 (dark) dan
>    3,08:1 (light) ⇒ GAGAL** (lantai 4,5); **1440px → 9,16:1 (dark) dan 11,52:1 (light) ⇒ LULUS**.
>    Latar versi mobile berluminans tinggi, jadi **tidak ada warna teks yang bisa lolos** di sana;
>    obatnya *scrim*, dan itu menyentuh artwork hero. Bukan temuan tombol amber (§12.5 sudah 0).
> 2. **Daftar lowongan tanpa JavaScript** — build-nya statis, jadi `/loker` memberi penjelasan +
>    tautan WhatsApp, bukan daftarnya. Daftar itu di HTML server butuh **SSR** (`output: 'server'`
>    masih dikomentari di `astro.config.mjs`).

> 🔴 **Keamanan — tindakan owner diperlukan.** Satu token Netlify (`nfp_…`) pernah ter-commit
> saat repo ini **PUBLIK** (commit `8280792`, berkas `docs/FASE6-NETLIFY.md`). Sudah diredaksi di
> HEAD pada 2026-10-08, tetapi **masih ada di riwayat git** — meredaksi bukan memulihkan.
> **Revoke token itu di Netlify** (User settings → Applications → Personal access tokens).

---

## 🔗 Links

| Resource | URL |
|----------|-----|
| **GitHub** | https://github.com/asjosdokumen-alt/asj-astro |
| **Live Site** | https://amanahsakura.netlify.app |
| **Netlify project** | ⚠ host sudah berpindah tiga kali dan **diganti nama** pada 2026-10-24. Yang benar hari ini: `amanahsakura.netlify.app` (situs yang sama, nama baru). `asjastro.netlify.app` → **404**, bukan redirect; `boisterous-taiyaki-c61202` → 404 sejak 2026-10-13 |
| **Neon (database)** | endpoint `…apirest.c-4.ap-southeast-1.aws.neon.tech/neondb` — nilainya ada di env (`SUPABASE_URL`), bukan di dokumen ini |
| **Supabase (Storage saja)** | https://supabase.com/dashboard/project/gdwvffmevwtwnzrapjwy |

> ⚠️ **Database BUKAN Supabase lagi — sudah Neon sejak cutover 2026-10-25.**
> Yang masih Supabase hanyalah **Storage**.
>
> 1. **Data** — Neon Postgres, diakses lewat Neon Data API (PostgREST) di
>    `/neondb/rest/v1/`. Variabelnya tetap bernama `SUPABASE_URL` /
>    `PUBLIC_SUPABASE_URL` **dengan sengaja**, supaya tidak ada berkas kode yang
>    berubah saat migrasi (lihat `.env.example:68-93`). Tanda tangan JWT ke DB
>    memakai EdDSA: `SUPABASE_JWT_ALG=EdDSA`, `SUPABASE_JWT_PRIVATE_KEY`,
>    `SUPABASE_JWT_KID`. `SUPABASE_JWT_SECRET` (HS256) **tidak ada** di produksi
>    dan tidak diperlukan.
> 2. **Storage** — `gdwvffmevwtwnzrapjwy` (`STORAGE_SUPABASE_URL`). Bucket
>    `asj-files` menyimpan dokumen & pamflet kandidat. Neon tidak punya Storage,
>    jadi `SUPABASE_URL` **tidak boleh** dipakai untuk `/storage/v1` — akan 404.
>
> Konsekuensinya: mengganti `PUBLIC_SUPABASE_URL` memindahkan **database**, bukan
> aset. Aset brand (logo, banner) ada di `public/`, bukan di bucket.
>
> ⚠️ **Jangan tertipu oleh `src/lib/supabase.ts`.** Berkas itu masih membuat
> klien `@supabase/supabase-js` dari URL Neon, dan `isSupabaseConfigured()`
> mengembalikan `true` — padahal host Neon tidak melayani `/auth/v1`. Semua
> `supabase.auth.*` di sana mati (temuan **B13**). Auth yang benar-benar dipakai
> adalah JWT kustom di `netlify/functions/_lib/session.ts`.

> 🔴 **Status deploy — HIDUP LAGI, dan push kini benar-benar tayang.**
>
> Riwayat singkatnya: kredit akun Netlify habis, dan dari **24 Sep 2026** setiap
> push ke `main` di-skip (`Skipped due to account credit usage exceeded`) sehingga
> `main` di GitHub **lebih baru daripada** situs live selama dua minggu. Itu
> **sudah tidak berlaku** — sejak **7 Okt 2026** deploy kembali `ready`, dan 36
> commit sesi itu ter-publish ke produksi.
>
> Konsekuensinya sekarang: **setiap push ke `main` = satu deploy produksi
> berbayar yang langsung tayang.** Tidak ada langkah manual, dan tidak ada tahap
> pratinjau.
>
> ⚠️ **Jangan hardcode site id.** Ia sudah berpindah akun dan berubah sekali;
> bacalah dari `.netlify/state.json`, dan verifikasi dengan:
>
> ```bash
> netlify api listSiteDeploys --data "{\"site_id\":\"$(node -p "require('./.netlify/state.json').siteId")\",\"per_page\":6}"
> ```
>
> Liveness check (`curl` → HTTP 200) **tidak bisa** membedakan situs yang hidup
> dari situs yang beku; hanya daftar deploy yang bisa. Lihat R19 di skill
> `asj-session-rules`.

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 5.x (SSG) + Preact islands (`client:only="preact"`) |
| State | Nanostores (+ `@nanostores/persistent` untuk auth & tema) |
| Auth | Fungsi `auth` sendiri: **WA + password → JWT** (`SESSION_SECRET`), kedaluwarsa 24 jam. ⚠️ Jalur `supabase.auth.*` di `store/userStore.ts` **mati** sejak cutover Neon — host `PUBLIC_SUPABASE_URL` tidak punya `/auth/v1` (temuan B13) |
| Validation | Zod (`src/lib/schemas.ts`) |
| CSS | Tailwind CSS v4 |
| Ikon | Sprite SVG sendiri (`npm run icons` → `src/icons/sprite-map.ts`) |
| PWA | Service Worker + manifest (`scripts/build-sw-manifest.mjs`) |
| Backend | Netlify Functions (surface → context → kernel) |
| Data | **Neon Postgres** (Data API / PostgREST) + **Supabase Storage** untuk berkas |
| Node | 22 (`.nvmrc`) |

---

## 📦 Quick Start

```bash
npm install
cp .env.example .env      # lalu isi kredensialnya

# Preview lokal DENGAN backend nyata (paling berguna)
npm run serve             # = node server.cjs → http://localhost:4321
                          # proxy /.netlify/functions/* → the live site (see server.cjs:
                          # it must be the site that is DEPLOYING, not merely one that answers)

# Dev server untuk mengedit
npm run dev               # astro dev, default port 4321

# Server lokal LENGKAP (UI + fungsi Netlify) — ini yang dipakai sehari-hari
dev.cmd                   # klik dua kali di Explorer -> http://localhost:8888
npm run dev:8888          # sama, dari terminal
                          # syarat, jebakan, dan cara memeriksanya:
                          # docs/LOCAL_SERVER_8888.md

# Build produksi
npm run build             # astro build + sw-manifest
```

**Baca port-nya dari stdout server, jangan diasumsikan.** `server.cjs` memakai
`findPort(4321)`, jadi kalau 4321 sedang dipakai (mis. `npm run dev` jalan) ia
diam-diam pindah ke port berikutnya.

`npm run serve` mem-proxy API ke **produksi** secara default. Untuk mengarahkan
ke `netlify dev` lokal: `BACKEND_TARGET=http://127.0.0.1:8888 node server.cjs`.

---

## 🌐 Environment Variables

35 variabel ada di `.env.example` — pakai itu sebagai daftar otoritatif. Kelompok utamanya:

| Kelompok | Variabel |
|----------|----------|
| Data (Neon, nama lama dipertahankan) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PG_ADMIN_ROLE`, `SUPABASE_JWT_ALG`, `SUPABASE_JWT_PRIVATE_KEY`, `SUPABASE_JWT_KID` |
| Storage (Supabase) | `STORAGE_SUPABASE_URL`, `STORAGE_SUPABASE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| Data (klien, hanya untuk build) | `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` |
| Sesi | `SESSION_SECRET`, `ADMIN_MASTER_PIN`, `PIN_MASTER`, `PIN_SACHOU`, `PIN_AYOK`, `PIN_KHOLIS`, `PIN_KHOCI` |
| AI | `GEMINI_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY` |
| WhatsApp | `FONNTE_TOKEN` |
| Media | `CLOUDINARY_URL`, `CLOUDINARY_UPLOAD_URL`, `FIREBASE_SERVICE_ACCOUNT` |
| Observabilitas | `HEALTH_TOKEN`, `METRICS_SINK_URL`, `METRICS_SINK_TOKEN`, `METRICS_RECEIVER_TOKEN`, `GRAFANA_CLOUD_OTLP_ENDPOINT`, `GRAFANA_CLOUD_BASIC_AUTH_HEADER` |
| Keamanan | `ALLOWED_DOCUMENT_HOSTS`, `NETLIFY_SITE_URL`, `NETLIFY_SITE_ID` |

⚠️ `netlify/functions/secrets/` dan `.env.local` **gitignored** dan **tidak boleh**
di-commit — repo ini publik. Hanya berkas `.example` yang boleh masuk.

---

## 📁 Project Structure

```
src/
├── components/
│   ├── App.tsx            # Root (header, drawer, login, toast)
│   ├── admin/             # Panel admin (25 komponen: 9 tab + modal + copilot)
│   ├── candidate/         # Dasbor kandidat (6)
│   ├── forms/             # Wizard form: Apply, AI CV, Master (6)
│   ├── public/            # Halaman publik: loker, layanan, profil (21)
│   └── ui/                # Primitif bersama (Icon, Toast, dll — 7)
├── store/                 # Nanostores
│   ├── authReactive.ts    # Sesi (persistent, localStorage 'asj_auth')
│   ├── adminStore.ts      # Data admin reaktif
│   ├── adminTasks.ts      # Papan Tugas Tim (scratchpad sesi, tanpa DB)
│   ├── theme.ts           # Mode terang/gelap
│   └── i18n.ts, i18n-jp.ts # Kamus ID + JP
├── lib/                   # 65 modul (apiClient, schemas, supabase, helpers_cv, …)
├── pages/                 # 11 rute Astro
├── layouts/               # BaseLayout.astro
├── styles/                # global.css, theme.css, layout.css, motion.css
└── icons/                 # sprite-map.ts (hasil generate)

netlify/functions/
├── *.js, *.ts             # Entry point (auth, candidates, jobs, mail, schedule, …)
├── surfaces/              # 16 entry per-surface (public, auth, admin, kandidat)
├── contexts/              # 15 domain logika bisnis
├── _lib/                  # Kernel bersama (db, session, rate-limit, …)
├── shared/                # Dipakai bareng frontend & function
└── secrets/               # gitignored — hanya README + .example yang ter-commit

migrations/                # 15 migrasi SQL (di ROOT repo, bukan di dalam netlify/)
indexer/                   # Code-indexer + boundary checker (alat, punya suite sendiri)
scripts/ci/                # Gate CI
e2e/                       # Gate Playwright
deliverables/              # Laporan audit & review (bukti, bukan kode)
docs/archive/              # Dokumen historis — JANGAN dipakai sebagai acuan kode
```

**Root sengaja hanya berisi konfigurasi + 3 dokumen status** (`README.md`, `TODO.md`,
`DESIGN.md`). Berkas sekali-pakai tidak ditaruh di root — itu temuan #23 di
`deliverables/gstack/pre-launch-check-2026-10-04.md`, ditutup 2026-10-08 dengan
memindahkannya ke `docs/archive/`.

---

## 🗺️ Halaman (11 rute)

| Rute | Isi |
|------|-----|
| `/` | Landing page |
| `/loker` | Papan lowongan publik (satu-satunya tautan `/loker` ada di dalam drawer menu) |
| `/public` | Lowongan & layanan |
| `/apply` | Form pendaftaran |
| `/siswa-baru` | Pendaftaran siswa baru |
| `/candidate` | Dasbor kandidat (butuh sesi) |
| `/master` | Form Master lengkap (butuh sesi) |
| `/ai-cv` | AI CV Craft — asisten CV "Qween Jeklin" (butuh sesi; non-VIP dialihkan ke `/master`) |
| `/share` | Tampilan berbagi lowongan |
| `/admin` | Panel admin (butuh role admin) |
| `/404` | Halaman tidak ditemukan |

---

## 🧭 Panel Admin

**Tab** (sidebar, urut): `Lowongan Publik` · `DB Job Internal` · `Tambah Job` ·
`Data Pelamar` · `Jadwal Agenda` · `Mail` · `WA Pintar` · `Agenda` · `Papan Tugas`
— plus `Pengaturan` yang dipin di bawah sidebar.

> `Agenda` dan `Papan Tugas` dulu adalah kartu header dashboard yang ter-mount di
> **semua** tab. Sejak 26 Sep 2026 keduanya jadi tab biasa, sehingga konten tab
> mulai dari atas halaman. Daftar tab adalah **satu sumber kebenaran** di
> `AdminPanel.tsx` (`TABS`), dan `TAB_VIEWS` di-type terhadapnya sehingga tab baru
> tidak bisa dikirim tanpa renderer.

`Papan Tugas` adalah **scratchpad sesi**: tanpa network call, tanpa tabel DB, dan
sengaja **tidak** bertahan setelah reload. State-nya di `store/adminTasks.ts` —
bukan `useState` di dalam tab, karena tab di-unmount saat berpindah.

---

## 🧪 Testing & Gates

```bash
npm test                      # suite penuh: 183 berkas · 2.221 tes · ~323 s
npm run typecheck             # tsc (frontend)
npm run typecheck:indexer     # tsc (indexer)
npm run icons                 # regenerate sprite ikon
npm run depcruise             # boundary check (oracle)
npm run boundary              # boundary check versi indexer
```

Gate e2e (butuh server jalan di 4321):

```bash
npm run serve &               # di terminal terpisah
npm run e2e:public
npm run e2e:loker-layout
npm run e2e:headings
npm run e2e:dialog
npm run e2e:drawer
npm run e2e:labels
npm run e2e:landing
npm run e2e:theme-gradients
```

Gate CI lain: `scripts/ci/verify-classes.mjs`, `scripts/ci/lint-ratchet.mjs`,
`scripts/ci/verify-md-tables.mjs`, dan puluhan lainnya di `scripts/ci/`.

> ⚠️ Di sandbox tertentu, tes yang memanggil subprocess (`discover.test.ts`,
> `boundary.test.ts`, `fcm-server.test.ts`) gagal dengan `spawnSync ... EBUSY`.
> Itu batasan lingkungan, bukan kode — jalankan perintahnya manual di luar vitest
> untuk membuktikannya.

---

## 🚢 Deployment

Situs terhubung ke GitHub; **setiap push ke `main` memicu build Netlify** (production).
Tidak ada langkah manual.

```
push ke main  →  Netlify build  →  deploy production
```

Deploy production lewat GitHub Actions (`deploy-production.yml`) terpisah dan
dipicu oleh **tag `v*`** atau **release published**, dengan approver manusia di
environment `production`.

### Kalau build di-skip

Pesan `Skipped due to account credit usage exceeded` berarti kuota/kredit akun
Netlify habis — bukan masalah kode. Pilihan:

1. Tambah kredit / naikkan paket di akun Netlify yang sekarang, **atau**
2. Pindah ke akun Netlify baru, lalu sambungkan ulang repo dan **salin 24 env var**
   (daftarnya: `netlify env:list --json`, atau lihat `.env.example`).

Yang perlu dibawa saat pindah akun: seluruh env var, site id/domain, dan
integrasi GitHub-nya.

---

## 📚 Docs

`docs/` berisi 40 dokumen aktif + 33 di `docs/archive/`. Peta lengkapnya ada di
**`docs/README.md`** — mulai dari situ. Titik masuk yang paling berguna:

| Dokumen | Isi |
|---------|-----|
| `docs/ARCHITECTURE.md` | Arsitektur keseluruhan |
| `docs/BACKEND_TODO.md` | Satu-satunya daftar pekerjaan backend |
| `docs/ASTRO_PIPELINE_REFERENCE.md` | Referensi pipeline Astro |
| `docs/LEGACY_PARITY_REFERENCE.md` | Paritas dengan versi legacy |
| `docs/CICD.md` | CI/CD |
| `DESIGN.md` | Sistem desain (lantai font & target sentuh ada di sini) |
| `TODO.md` | Pekerjaan non-backend |
| `docs/archive/` | Dokumen lama (diarsipkan, bukan dihapus) |

---

## 📄 License

Private — PT Amanah Sakura Japan
