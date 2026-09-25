# ASJ Portal v2

**Astro + Preact + Supabase** — Portal rekrutmen kerja ke Jepang

## 🔗 Links

| Resource | URL |
|----------|-----|
| **GitHub** | https://github.com/khoci280-arch/asj-astro |
| **Live Site** | https://incredible-starship-054a78.netlify.app |
| **Supabase** | https://supabase.com/dashboard/project/bimqyugdhiuxcqltjjnt |
| **Netlify** | https://app.netlify.com/projects/incredible-starship-054a78 |

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 5.x (SSG) |
| UI | Preact + `client:load` islands |
| State | Nanostores + persistent |
| Auth | Supabase Auth (phone + password) |
| Validation | Zod schemas |
| CSS | Tailwind CSS v4 |
| PWA | Service Worker + manifest |
| Deploy | Netlify (zip upload or GitHub auto-deploy) |

## 📦 Quick Start

```bash
# Install dependencies
npm install

# Create .env from template
cp .env.example .env
# Edit .env with your Supabase credentials

# Development (with backend functions)
npx netlify dev

# Development (frontend only, no backend)
npm run dev

# Production build
npm run build

# Preview production
npx serve dist
```

## 🌐 Environment Variables

| Variable | Scope | Description |
|----------|-------|-------------|
| `PUBLIC_SUPABASE_URL` | Client | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Client | Supabase anonymous key |
| `SUPABASE_URL` | Server | Supabase project URL (same as PUBLIC) |
| `SUPABASE_ANON_KEY` | Server | Supabase anon key (same as PUBLIC) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Supabase service role key (admin) |
| `SUPABASE_DB_URL` | Server | Direct Postgres connection string |
| `SESSION_SECRET` | Server | Random hex string for JWT signing |
| `FONNTE_TOKEN` | Server | Fonnte API token for WhatsApp blast |

## 🚢 Deployment

### Option A: Manual Deploy (current)
```bash
npm run build
# Zip the dist folder
powershell -Command "Compress-Archive -Path 'dist\*' -DestinationPath 'deploy.zip'"
# Upload to Netlify via API
curl -X POST "https://api.netlify.com/api/v1/sites/SITE_ID/deploys" \
  -H "Authorization: Bearer NETLIFY_TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @deploy.zip
```

### Option B: GitHub Auto-Deploy (recommended)
1. Go to Netlify Dashboard → Site → Build & deploy
2. Click "Link site to Git" → Select GitHub
3. Choose `khoci280-arch/asj-astro`
4. Set environment variables in Netlify Dashboard
5. Every push to `main` triggers a build

## 📁 Project Structure

```
src/
├── components/          # Preact islands
│   ├── App.tsx          # Root (Header + LoginModal + Toast)
│   ├── LoginModal.tsx   # Auth forms (Supabase)
│   ├── admin/           # Admin panel (8 tabs + 12 modals)
│   │   ├── AdminPanel.tsx        # Main panel with sidebar + tab routing + PT Aamanah Sakura Japan
ようこそ
│   │   ├── TabPelamar.tsx        # Data Pelamar (candidates list)
│   │   ├── TabDbJob.tsx          # DB Job Internal
│   │   ├── TabWA.tsx             # WA Pintar (templates + invite)
│   │   ├── EditCandidateModal.tsx  # Edit: BB, catatan, VIP, upload
│   │   ├── MatchmakingModal.tsx  # AI Headhunter: filter + match
│   │   ├── ListKandidatModal.tsx # Per-job candidate list + copy WA
│   │   ├── PemberkasanModal.tsx  # Document checklist upload
│   │   ├── CandidateProfileModal.tsx  # CV profile + rirekisho
│   │   ├── RirekishoBuilder.tsx  # Japanese resume builder
│   │   └── UndanganKelasModal.tsx # WhatsApp group invite
│   ├── candidate/       # Candidate dashboard
│   ├── forms/           # Form wizards (Apply, AI CV, etc.)
│   └── public/          # Public loker + layanan
├── store/               # Nanostores
│   ├── authReactive.ts  # Persistent auth state
│   ├── userStore.ts     # Supabase auth integration
│   └── adminStore.ts    # Admin reactive state
├── lib/                 # Utilities
│   ├── supabase.ts      # Supabase client singleton
│   ├── apiClient.ts     # API wrapper with auth
│   ├── helpers_cv.ts    # CV builder helpers (getPath, makeV)
│   └── schemas.ts       # Zod validation
├── pages/               # Astro pages (9 routes)
├── layouts/             # BaseLayout.astro
└── styles/              # global.css (Tailwind)

netlify/functions/
├── surfaces/            # Entry points (public, auth, admin, kandidat)
├── contexts/            # Business logic (catalog, registry, identity, etc.)
├── _lib/                # Shared kernel (db/, session, rate-limit, etc.)
└── migrations/          # SQL migrations (numbered)
```

## 🧪 Testing

```bash
# Unit tests (235 tests)
npx vitest run

# E2E tests (Supabase integration)
BASE_URL=http://localhost:4323 node e2e/test-supabase-auth.mjs
BASE_URL=http://localhost:4323 node e2e/test-admin.mjs
BASE_URL=http://localhost:4323 node e2e/test-public.mjs
```

## 📝 Changelog

See `git log` for commit history. Recent sessions have added:
- EditCandidateModal (BB, catatan, VIP, document uploads)
- MatchmakingModal (AI Headhunter filter + match)
- ListKandidatModal (per-job candidate management)
- PemberkasanModal (document checklist upload)
- UndanganKelasModal (WhatsApp group invite)
- RirekishoBuilder (Japanese resume CV builder)
- Fix: getPath() deep traversal bug ([object Object] in CV)
- Fix: Bottom nav tab switching (hashchange listener)
- Fix: Catatan save (dual API contract + service role)
- Fix: Data loading pipeline (real Supabase DB)

## 📄 License

Private — PT Amanah Sakura Japan


