# ASJ Portal v2

**Astro + Preact + Supabase** — portal rekrutmen kerja ke Jepang (PT Amanah Sakura Japan).

Situs statis (Astro SSG) dengan pulau Preact, backend di Netlify Functions, data di Supabase.

---

## 📊 Status (terukur 2026-10-08)

| | |
|---|---|
| **Suite uji** | **183 berkas · 2.221 tes · ~323 s.** 3 merah selalu = artefak sandbox (`spawnSync … EBUSY`), **hijau di CI** — jangan "diperbaiki" |
| **Gate** | `lint-ratchet` PASSED · `review:gate --base=HEAD` **7/7** · `tsc` bersih · `verify:md` OK |
| **Halaman publik** | `/` **9,9** · `/public` **10,0** · `/loker` **9,9** · `/404` **10,0** — `deliverables/gstack/public-pages-review-2026-10-07.md` |
| **Deploy produksi** | **hidup** sejak 7 Okt 2026 ⇒ push `main` = deploy berbayar yang langsung tayang |
| **Berkas tracked** | 950 berkas · ~22 MB (terbesar: `deliverables/` bukti audit, `public/` aset) |
| **Counter beku** | `files.length = 535` — **hanya team-lead** yang boleh menggesernya |

> ⚠️ **Dua butir yang butuh keputusan owner** — sudah terukur, **belum** dikerjakan:
>
> 1. **Kontras eyebrow hero `/`** — `text-pink-300` 11px di atas foto, terukur **3,20:1**
>    (lantai 4,5). Latarnya berluminans ≈0,19, jadi **tidak ada warna teks yang bisa lolos**;
>    obatnya *scrim*, dan itu menyentuh artwork hero.
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
| **Live Site** | https://boisterous-taiyaki-c61202.netlify.app |
| **Netlify project** | ⚠ moved 2026-09-28 to a different Netlify account — open it from the site's own dashboard, the old `app.netlify.com/projects/asjastro` link is the retired one |
| **Supabase (data)** | https://supabase.com/dashboard/project/bimqyugdhiuxcqltjjnt |
| **Supabase (aset publik)** | https://supabase.com/dashboard/project/gdwvffmevwtwnzrapjwy |

> ⚠️ **Aplikasi ini memakai DUA proyek Supabase**, dan itu tidak kelihatan dari
> satu tempat:
>
> 1. **Data** — `bimqyugdhiuxcqltjjnt`. Inilah yang dibaca dari env
>    (`PUBLIC_SUPABASE_URL` / `SUPABASE_URL`) oleh `src/lib/supabase.ts`, jadi
>    inilah proyek auth + database. Dibuktikan: chunk `supabase` di **kedua**
>    situs live mem-bake ref ini.
> 2. **Aset publik** — `gdwvffmevwtwnzrapjwy`. Hanya menyimpan bucket
>    `asj-files` (logo, banner, `jeklin.png`). **Di-hardcode di 17 tempat** di
>    `src/` dan `netlify/` — bukan dari env.
>
> Konsekuensinya: mengganti `PUBLIC_SUPABASE_URL` **tidak** memindahkan aset,
> dan memindahkan aset berarti menyunting 17 URL hardcoded. Catat ini sebelum
> migrasi proyek.

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
| Auth | Fungsi `auth` sendiri: **WA + password → JWT** (`SESSION_SECRET`). Supabase Auth dipakai untuk alur terpisah di `store/userStore.ts` |
| Validation | Zod (`src/lib/schemas.ts`) |
| CSS | Tailwind CSS v4 |
| Ikon | Sprite SVG sendiri (`npm run icons` → `src/icons/sprite-map.ts`) |
| PWA | Service Worker + manifest (`scripts/build-sw-manifest.mjs`) |
| Backend | Netlify Functions (surface → context → kernel) |
| Data | Supabase (Postgres + Storage) |
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
| Supabase (klien) | `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` |
| Supabase (server) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_DB_URL`, `SUPABASE_STORAGE_BUCKET` |
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
