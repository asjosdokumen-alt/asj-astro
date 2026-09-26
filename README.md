# ASJ Portal v2

**Astro + Preact + Supabase** — portal rekrutmen kerja ke Jepang (PT Amanah Sakura Japan).

Situs statis (Astro SSG) dengan pulau Preact, backend di Netlify Functions, data di Supabase.

---

## 🔗 Links

| Resource | URL |
|----------|-----|
| **GitHub** | https://github.com/asjosdokumen-alt/asj-astro |
| **Live Site** | https://asjastro.netlify.app |
| **Netlify project** | https://app.netlify.com/projects/asjastro |
| **Supabase** | https://supabase.com/dashboard/project/gdwvffmevwtwnzrapjwy |

> ⚠️ **Status deploy (26 Sep 2026):** Netlify **menolak build** — setiap push ke
> `main` muncul sebagai `error: Skipped due to account credit usage exceeded`.
> Deploy sukses terakhir **24 Sep 2026 10:41**. Jadi `main` di GitHub **lebih baru
> daripada** situs live. Cek riwayatnya dengan:
>
> ```bash
> netlify api listSiteDeploys --data '{"site_id":"be40978f-aeab-42b7-a549-d9556e4f15de","per_page":6}'
> ```

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
                          # proxy /.netlify/functions/* → https://asjastro.netlify.app

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
│   ├── admin/             # Panel admin (25 komponen: 9 tab + 13 modal + copilot)
│   ├── candidate/         # Dasbor kandidat (5)
│   ├── forms/             # Wizard form: Apply, AI CV, Master (6)
│   ├── public/            # Halaman publik: loker, layanan, profil (17)
│   └── ui/                # Primitif bersama (Icon, Toast, dll — 5)
├── store/                 # Nanostores
│   ├── authReactive.ts    # Sesi (persistent, localStorage 'asj_auth')
│   ├── adminStore.ts      # Data admin reaktif
│   ├── adminTasks.ts      # Papan Tugas Tim (scratchpad sesi, tanpa DB)
│   ├── theme.ts           # Mode terang/gelap
│   └── i18n.ts, i18n-jp.ts # Kamus ID + JP
├── lib/                   # 34 modul utilitas (apiClient, schemas, supabase, helpers_cv, …)
├── pages/                 # 11 rute Astro
├── layouts/               # BaseLayout.astro
├── styles/                # global.css, theme.css, layout.css, motion.css
└── icons/                 # sprite-map.ts (hasil generate)

netlify/functions/
├── *.js, *.ts             # ~25 entry point (auth, candidates, jobs, mail, schedule, …)
├── surfaces/              # 17 entry per-surface (public, auth, admin, kandidat)
├── contexts/              # 15 domain logika bisnis
├── _lib/                  # Kernel bersama (db, session, rate-limit, …)
├── shared/                # Dipakai bareng frontend & function
└── secrets/               # gitignored — hanya README + .example yang ter-commit

migrations/                # 15 migrasi SQL (di ROOT repo, bukan di dalam netlify/)
indexer/                   # Code-indexer + boundary checker (alat, punya suite sendiri)
scripts/ci/                # Gate CI
e2e/                       # Gate Playwright
```

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
npm test                      # suite penuh (167 berkas, 1970 tes)
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

`docs/` berisi 38 dokumen. Titik masuk yang paling berguna:

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
