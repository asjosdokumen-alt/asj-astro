# ASJ Astro — Architecture

> **✅ IMPLEMENTATION STATUS (2026-09-03, corrected 2026-09-26)**
> 
> Frontend architecture is **FULLY IMPLEMENTED**:
> - ✅ **11** pages (all routes) — this line said 9 until 2026-09-26; `/siswa-baru`
>   and `/share` had been added since
> - ✅ **13** admin modals + the AI HR copilot — said 12
> - ✅ Preact islands with **`client:only="preact"`** — said `client:load`; the app
>   ships `client:only` (verified across `src/pages/*.astro`)
> - ✅ Nanostores for state management
> - ⚠️ Zod validation at the API edge is **PARTIAL** — measured 2026-09-16: 9 of 33 mutating
>   actions (`npm run verify:validation`). This line used to read "✅ Zod validation at API
>   edge"; that was true of the auth surface only (7 of 81 routed actions). The rest is frozen
>   in `.ci/validation-baseline.json` and may only shrink.
> - ✅ 235 unit tests passing
> 
> **Remaining gaps:**
> - ⚠️ Error boundaries not added globally
> - ⚠️ Loading skeletons incomplete
> - ⚠️ PWA manifest needs completion

---

# ASJ Astro — Architecture Deep Dive

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Astro | SSG/SSR routing, BaseLayout, build engine |
| Islands | Preact + `client:load` | Interactive UI (forms, modals, toast) |
| State | Nanostores + persistent | Reactive global state + localStorage sync |
| Auth | Supabase Auth | Phone + password authentication |
| Validation | Zod | TypeScript schema validation |
| API | apiClient.ts (HMAC) | Centralized fetch wrapper with auth injection |
| PWA | sw.js + manifest | Anti-cache service worker |
| Build | Vite (Astro built-in) | ESM/TS compilation |
| Deploy | Netlify | CDN + static hosting |

## Directory Structure

```
asj-astro/
├── src/
│   ├── components/
│   │   ├── App.tsx              # Preact root (Header + LoginModal + Toast)
│   │   ├── LoginModal.tsx       # Auth forms (Supabase phone auth)
│   │   ├── AuthGuard.tsx        # Route protection (not yet used)
│   │   ├── Toast.tsx            # Notification system
│   │   ├── Header.tsx           # Responsive header (nav + auth buttons)
│   │   ├── BottomNav.astro      # Mobile bottom nav (admin + kandidat)
│   │   ├── Footer.astro         # Social links + copyright
│   │   ├── ChangePasswordModal.tsx # Password change dialog
│   │   ├── CvMiniModal.tsx      # Compact CV preview/edit
│   │   ├── Skeleton.tsx         # Loading skeletons
│   │   ├── admin/
│   │   │   ├── AdminPanel.tsx   # Admin root (sidebar + tabs)
│   │   │   ├── TabKelola.tsx    # Loker management table
│   │   │   ├── TabPelamar.tsx   # Candidate database + modals
│   │   │   ├── TabTambah.tsx    # Form input loker baru
│   │   │   ├── TabDbJob.tsx     # Histori job internal
│   │   │   ├── TabJadwal.tsx    # Jadwal agenda
│   │   │   ├── TabMail.tsx      # Mail inbox
│   │   │   ├── TabWA.tsx        # WA pintar + templates
│   │   │   ├── TabConfig.tsx    # Pengaturan sistem
│   │   │   ├── InputManualModal.tsx    # Manual candidate input
│   │   │   └── LaporanBulananModal.tsx # Monthly report
│   │   ├── candidate/
│   │   │   └── CandidateDash.tsx # Candidate dashboard
│   │   ├── forms/
│   │   │   ├── ApplyFullForm.tsx    # 3-step lamaran wizard
│   │   │   ├── AiCvForm.tsx         # AI CV chat + 50-field preview
│   │   │   ├── SiswaBaruForm.tsx    # AI chat + biodata preview
│   │   │   ├── MasterFullForm.tsx   # Master form
│   │   │   ├── ShareView.tsx        # Candidate viewer + doc preview
│   │   │   └── FormToolbar.tsx      # Theme/lang toggle + back
│   │   └── public/
│   │       ├── LokerTable.tsx    # Public jobs table + filters
│   │       ├── LokerDetailModal.tsx # Loker detail popup
│   │       └── LayananSection.astro # Static layanan cards
│   ├── store/
│   │   ├── authReactive.ts      # Persistent auth (nanostores)
│   │   ├── userStore.ts         # Supabase auth integration
│   │   ├── adminStore.ts        # Admin reactive state
│   │   └── i18n.ts              # Internationalization (ID + JP)
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client singleton
│   │   ├── apiClient.ts         # HMAC fetch wrapper
│   │   ├── schemas.ts           # Zod validation schemas
│   │   ├── fileUtils.ts         # File validation + compression
│   │   └── useDraft.ts          # Auto-save hook
│   ├── layouts/
│   │   └── BaseLayout.astro     # HTML shell + SW registration
│   ├── pages/                   # 11 routes
│   │   ├── index.astro          # Landing page
│   │   ├── admin.astro          # Admin panel
│   │   ├── candidate.astro      # Candidate dashboard
│   │   ├── public.astro         # Public loker + layanan
│   │   ├── apply.astro          # Apply form
│   │   ├── ai-cv.astro          # AI CV form
│   │   ├── siswa-baru.astro     # Siswa baru form
│   │   ├── master.astro         # Master form
│   │   └── share.astro          # Share view
│   └── styles/
│       └── global.css           # Tailwind + custom styles
├── e2e/                         # E2E tests
│   ├── test-admin.mjs
│   ├── test-public.mjs
│   └── test-supabase-auth.mjs
├── docs/                        # Documentation (aktif)
│   ├── ARCHITECTURE.md          # This file
│   ├── ENGINEERING_PLAYBOOK.md  # Standar + roadmap tim
│   ├── CODE_REVIEW_CHECKLIST.md # Checklist review PR
│   └── archive/                 # Dokumen historis (arsip 2026-09-05)
│       ├── FASE1..FASE6-*.md
│       ├── *-DEEP.md
│       ├── HANDOVER.md
│       └── CODE_REVIEW / SECURITY_AUDIT / overview.md
├── public/
│   ├── sw.js                    # Anti-cache service worker
│   └── manifest.webmanifest     # PWA manifest
├── .env                         # Environment variables (gitignored)
├── .env.example                 # Template for .env
├── .env.server                  # Server-side vars (gitignored)
├── netlify.toml                 # Cache-Control headers
├── tsconfig.json                # TypeScript config
└── package.json                 # Dependencies
```

## Pages

### 1. Index (`/`)
- **Component**: `App.tsx` (Header + LoginModal + Toast)
- **Content**: Landing page with hero, loker tabs, layanan tabs
- **Auth**: Guest only (redirects to admin/candidate if logged in)
- **Mobile**: BottomNav hidden (guest mode)

### 2. Admin (`/admin`)
- **Component**: `AdminPanel.tsx` (**9 sidebar tabs** + `Pengaturan` pinned to the bottom)
- **Tabs**: Kelola, DB Job, Tambah, Pelamar, Jadwal, Mail, WA, **Agenda**, **Papan Tugas**, Config
  > `Agenda` and `Papan Tugas` were added 2026-09-26. Both used to be dashboard header
  > cards mounted above EVERY tab; they are now ordinary tabs, which is why the tab
  > content starts at the top of the page. `TABS` in `AdminPanel.tsx` is the single
  > source of truth and `TAB_VIEWS` is typed against it.
- **Auth**: Admin only (redirects to `/` if not admin)
- **Mobile**: BottomNav visible (admin mode)
- **Store**: `adminStore.ts` (reactive kandidat list + modals), `adminTasks.ts` (task board)

### 3. Candidate (`/candidate`)
- **Component**: `CandidateDash.tsx`
- **Content**: CV progress, status, action buttons, ChangePasswordModal, CvMiniModal
- **Auth**: Kandidat only (redirects to `/` if not kandidat)
- **Mobile**: BottomNav visible (kandidat mode)

### 4. Public (`/public`)
- **Component**: `LokerTable.tsx` + `LokerDetailModal.tsx` + `LayananSection.astro`
- **Content**: Job listings + layanan cards
- **Auth**: Guest (no auth required)
- **Mobile**: BottomNav hidden (guest mode)

### 5. Forms (`/apply`, `/ai-cv`, `/siswa-baru`, `/master`)
- **Components**: ApplyFullForm, AiCvForm, SiswaBaruForm, MasterFullForm
- **Content**: Multi-step form wizards with AI chat
- **Auth**: Kandidat (for apply), Guest (for siswa-baru)

## State Management

### Auth Store (`authReactive.ts`)
```typescript
// Uses @nanostores/persistent for auto localStorage sync
authStore = persistentAtom<AuthState>('asj_auth', DEFAULT_STATE);

// Functions
loginAsAdmin(name, token)    // → authStore.set({...})
loginAsKandidat(name, wa, token) // → authStore.set({...})
logout()                     // → authStore.set(DEFAULT_STATE)
refreshSession()             // → checks expiry, auto-logout
```

### User Store (`userStore.ts`)
```typescript
// Computed atoms (derived from authStore)
isAdmin = computed(authStore, (s) => s.role === 'admin');
isKandidat = computed(authStore, (s) => s.role === 'kandidat');
displayName = computed(authStore, (s) => s.name || 'Guest');

// Supabase auth functions
loginKandidatSupabase(phone, password)  // → supabase.auth.signInWithPassword
registerKandidatSupabase(nama, phone, pass) // → supabase.auth.signUp
logoutSupabase()                        // → supabase.auth.signOut + authLogout

// Auth listener (call once at boot)
initializeAuthListener()  // → supabase.auth.onAuthStateChange → sync to authStore
```

### Admin Store (`adminStore.ts`)
```typescript
// Reactive state for admin panel
inputModalOpen = atom(false)
kandidatList = atom<Kandidat[]>([])
adminSearch = atom('')

// Functions
openInputModal()    // → inputModalOpen.set(true)
addKandidat(k)      // → kandidatList.set([k, ...])
fetchKandidatFromAPI() // → fetches from backend
```

## API Flow

```
Component → apiClient.ts → Backend (Netlify Functions)
              ↓
         getFreshToken() → Supabase session first, fallback to authStore
              ↓
         Injects Authorization: Bearer token
              ↓
         Handles sessionInvalid → logout()
              ↓
         Returns JSON response
```

## Build & Deploy

```bash
# Local dev
npm run dev

# Production build
npm run build

# Preview production
npx serve dist
```

## Deployment

| Resource | URL |
|----------|-----|
| **GitHub** | https://github.com/asjosdokumen-alt/asj-astro |
| **Netlify** | https://asjastro.netlify.app |
| **Supabase** | https://supabase.com/dashboard/project/gdwvffmevwtwnzrapjwy |

> Diperbarui 2026-09-26: ketiga URL di atas sebelumnya menunjuk repo/situs/proyek
> yang sudah tidak dipakai (`khoci280-arch`, `incredible-starship-054a78`,
> `bimqyugdhiuxcqltjjnt`). Sumber kebenaran selalu `git remote -v` dan
> `netlify status`, bukan dokumen ini.
