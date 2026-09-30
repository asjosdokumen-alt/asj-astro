# Pemisahan company profile dari portal — `E:/asj-company-profile`

**Tanggal:** 2026-09-30 · **Pemilik:** *"ini mau pisahin dulu company profil dengan portal.
tolong buat kan repo baru kusus untuk company profil page saja"*

**Keputusan yang diambil lebih dulu** (ditanyakan, bukan diasumsikan): salin setia dulu ·
`E:/asj-company-profile` · `/` di portal **dibiarkan** · riwayat git **baru bersih**.

**Repo baru:** `E:/asj-company-profile` · 2 commit · **161 berkas tracked** · working tree bersih ·
**belum di-push ke mana pun**.

---

## 1. Kenapa ini bukan "salin satu halaman"

Halaman `/` **tidak berdiri sendiri**. Closure impornya diukur: **52 berkas**, dan di dalamnya ada
seluruh shell portal plus lapisan auth/data:

- `App.tsx` — header dengan tautan ke `/loker`, `/admin`, `/candidate`, `/public`, drawer, BottomNav, hero
- `LoginModal.tsx`, `CekSiswaModal.tsx`, `components/admin/AdminAiCopilot.tsx`
- `userStore.ts` → `supabase.ts` → `@supabase/supabase-js` (terukur 56,5 KB di rute publik)
- `apiClient.ts`, `schemas.ts`, `fcm.ts`

Jadi "repo khusus company profile" bisa berarti dua hal yang biayanya beda jauh. Pemilik memilih
**salin setia dulu** — perilaku identik, risiko nol, bisa dibandingkan berdampingan — dengan
perampingan sebagai tahap berikutnya.

---

## 2. Isi repo baru (161 berkas)

| Bagian | Jumlah | Catatan |
|---|---|---|
| `src/` | **60** | closure 58 + `env.d.ts` + `fcm-modules.d.ts` (lihat §4) |
| `public/` | **86** | **seluruh** direktori, termasuk sprite, favicon, ikon PWA, manifest, sw.js |
| `docs/` | 2 | `COMPANY_PROFILE_DATA.md`, `ILLUSTRATION_SPEC.md` |
| `scripts/` | 3 | `build/strip-html-comments.mjs`, `build-sw-manifest.mjs`, `ci/verify-assets.mjs` |
| root | 10 | astro.config, package.json, package-lock, tsconfig, biome, .gitignore, .gitattributes, .nvmrc, .env.example, README |

**Yang sengaja TIDAK dibawa:** `netlify/` (backend), sembilan rute lain, pohon komponen
`admin`/`candidate`/`forms`, `lib/cv-template-factory/`, `indexer/`, `e2e/`, `migrations/`,
sebagian besar `docs/`, `deliverables/`.

### Kenapa `public/` disalin UTUH, bukan disaring

Percobaan pertama menyaring aset dengan regex atas kode sumber, dan gagal **tiga kali** — masing-masing
akan mengirim halaman rusak:

1. `/assets/ilustrasi/${tile.image.name}.webp` (`IconTileGrid`, `StepList`) — dibangun dari data, tidak
   ada path literal untuk dicocokkan
2. `/assets/mitra/${partner.logo}.webp` (`PartnerGrid`) — sama
3. varian `@2x` di dalam `srcset` — didahului spasi, bukan kutip, jadi pola ber-anchor melewatkannya

Yang lebih buruk: penyaringan itu **memasukkan `fasilitas-ruang-kantor-1.webp`**, yang disebut
`GALLERY_EXCLUDED` sebagai sengaja tidak diterbitkan. Itu footgun §11.2, dicapai justru dengan
mencoba pintar.

Terukur sebelum menyalin: `public/` berisi **86 berkas, semuanya tracked, dan nol yang gitignored di
mesin ini** — 18 foto berwajah yang disebut `.gitignore` memang tidak ada di sini. Jadi menyalin
direktori itu aman, dan menghapus seluruh kelas kesalahan itu.

---

## 3. Yang diubah dari portal (dan mengapa)

| Berkas | Perubahan | Alasan |
|---|---|---|
| `astro.config.mjs` | Buang adapter `@astrojs/netlify` + proxy `/.netlify/functions` | Tidak ada backend di sini. Proxy ke API situs lain lebih buruk daripada tidak ada — ia membuat lokal terlihat berfungsi. |
| `scripts/build-sw-manifest.mjs` | `SHELL` `['/', '/candidate/', '/admin/', '/public/']` → `['/']`; prefiks versi cache → `asj-company-profile-` | Tiga dari empat rute itu **tidak ada** di sini. SW akan mem-precache tiga 404 — **diam-diam**, karena kegagalan `cache.add` ditoleransi dan build tetap hijau. |
| `package.json` | 22 dependensi → **12** | Yang dibuang tidak terjangkau dari kode yang disalin: `@astrojs/netlify`, `@supabase/ssr`, `bcryptjs`, `dayjs`, `estree-walker`, `mammoth`, `pdf-parse`, `react-hook-form`, `@hookform/resolvers`, `xlsx`. Dibuktikan dengan memindai impor bare dari seluruh `src/` yang disalin. |
| `biome.json` | `tailwindDirectives: true`; includes dipangkas ke direktori yang ada | Portal mewarisi derau parser CSS Biome; repo baru tidak perlu. |
| `tsconfig.json` | `include` buang `netlify/functions/**/*` | Direktori itu tidak ada. |

**Yang sengaja DIPERTAHANKAN:** `strip-html-comments` (terukur di portal: 18.412 B komentar ikut
terkirim di `dist/index.html`) dan `verify-assets` — gate §11.2 yang memerahkan build bila daftar
`.gitignore`, isi folder, dan `gallery.ts` berhenti sepakat soal foto mana yang boleh terbit.

---

## 4. 🪤 Berkas yang closure impor TIDAK bisa lihat

Build hijau **sebelum** dua berkas ini ditemukan — yang menemukannya `tsc`, bukan build:

| Berkas | Gejala kalau hilang |
|---|---|
| `src/env.d.ts` | 4× `Property 'env' does not exist on type 'ImportMeta'` — mendeklarasikan `ImportMetaEnv`/`ImportMeta` |
| `src/lib/fcm-modules.d.ts` | 2× `Cannot find module 'https://www.gstatic.com/firebasejs/…'` — deklarasi modul remote |

**Pelajarannya:** berkas `.d.ts` tidak pernah di-`import`, jadi pemindaian impor buta terhadapnya, dan
Astro **tidak** membutuhkannya untuk build. Hanya `tsc` yang melihatnya. Satu lagi di kelas yang sama:
`astro.config.mjs` memanggil `scripts/build/strip-html-comments.mjs` — berkas itu juga tidak tertangkap
scan impor `src/`, dan tanpa itu build mati seketika.

---

## 5. Dua jebakan yang menggigit saat mengerjakan

**a. `.env.*` menelan `.env.example`.** Aturan `.env.*` di `.gitignore` juga mencocokkan
`.env.example`, jadi template env **tidak akan pernah** ter-commit — padahal peringatan build sendiri
menyuruh membukanya. Ditemukan dengan `git check-ignore -v .env.example`, bukan dengan mengasumsikan.
Diperbaiki dengan negasi **setelah** pola, karena gitignore diselesaikan oleh aturan yang **terakhir**
cocok.

**b. `npm install` mati di postinstall esbuild.** `esbuild` tidak bisa men-`spawn` binernya
(`pid: 0`, `status: null`) di lingkungan bersandbox ini. Obatnya `npm install --ignore-scripts` —
aman, karena postinstall esbuild hanya **memverifikasi** sedangkan binernya datang dari paket platform
`@esbuild/win32-x64` yang tetap terpasang. Didokumentasikan di README.

---

## 6. Verifikasi (diukur, bukan diklaim)

| Pemeriksaan | Hasil |
|---|---|
| `npm run build` | **exit 0** · 2 halaman · `stripped 22.843 B` · SW precache **33 URL / 902,2 KB** |
| `npm run typecheck` | **exit 0** |
| `npm run verify:assets` | **PASS** — 49 di disk · 30 terbit · 18 diblokir |
| `npm run lint` | **MERAH — 73 error bawaan portal**, lihat §7 |

### Paritas render vs portal (probe yang sama)

| | Portal (setelah polish) | Repo baru |
|---|---|---|
| Tinggi `/` @1280 | 17.687 px | **17.687 px** |
| Section | 16 | **16, id & urutan sama** |
| Outline heading | `(2),1,2,3,3,3,2,2,4,…` | **identik** |
| Sensus ukuran font | `{11:3,12:49,14:159,16:6,20:14,30:5}` | **identik** |
| Tepi kiri kontainer | `{24:23, 25:24}` | **identik** |
| Console error (2 tema × 2 lebar) | 0 | **0** |
| Padding kartu @1280 | 24px ×43 | **24px ×43** |
| Berat @1280 DPR1 | 1.683,4 KB | **1.668,8 KB** |
| Berat @390 DPR2 | 1.942,4 KB | **1.927,8 KB** |
| Request | 66 | **58** |

Repo baru **14,6 KB lebih ringan** di kedua viewport — JS 173,5 → 167,9 KB dan CSS 28,8 → 19,7 KB,
karena hanya ada dua halaman sehingga lebih sedikit chunk yang ikut terkirim.

### Foto: diverifikasi tidak ada yang bocor

`git add -An` sebelum commit: **0** foto berwajah dari daftar `.gitignore` masuk daftar stage.
`git check-ignore` mengonfirmasi `legal-akta-09-2023.webp`, `galeri-mensetsu-okayama.webp`, dan
`poster-rekrutmen.webp` **masih ter-ignore** oleh `.gitignore` yang baru. 78 berkas gambar yang
ter-commit semuanya yang boleh terbit.

---

## 7. Yang BELUM selesai, dan keputusannya milik pemilik

### a. Form kontak tidak punya backend

`ContactForm.tsx` mengirim lewat `apiClient` ke `/.netlify/functions/*`, dan Functions tidak ada di
repo ini. Formulir merender dengan benar dan **gagal saat dikirim**. Tiga pilihan: **Netlify Forms**
(tambah atribut `netlify` pada `<form>`, tanpa function), **arahkan ke backend portal** (berarti
bergantung pada situs lain yang hidup), atau **ganti dengan WhatsApp** (halaman ini sudah menautkan
WA di beberapa tempat).

### b. `npm run lint` merah — 73 error bawaan

Hampir semuanya `lint/a11y/useButtonType` dan `noSvgWithoutTitle` pada komponen yang **tidak diubah
sama sekali**. Portal pun `biome check .` exit 1; di sana lint digerbangi `lint-ratchet.mjs` berbasis
baseline `.ci/biome-baseline.json`, dan baseline itu **tidak dibawa ke sini**. Dua pilihan: port
`lint-ratchet` + baseline-nya, atau beresi 73 error itu dan jadikan `npm run lint` gerbang yang
benar-benar hijau.

### c. Sisa bawaan portal yang layak dirampingkan (tahap 2)

- **Klien Supabase 56,5 KB** masih ikut terunduh di rute publik (`App.tsx` → `userStore` → `supabase`,
  semuanya impor statis).
- **`LoginModal`, `CekSiswaModal`, `AdminAiCopilot`** dirender oleh `App.tsx`.
- **Tautan header ke `/loker`, `/candidate`, `/admin`, `/public`** menuju **404** — keempat rute itu
  tidak ada di repo ini.
- **`zod`** (lewat `schemas.ts`) dan **`fcm.ts`**.
- **SW mem-precache 902 KB** — turun dari 1.915 KB portal, tapi masih mem-precache seluruh aset
  ber-hash, bukan hanya yang dibutuhkan halaman ini.

### d. Belum di-deploy, dan belum ada remote

Situs portal (`asjastro.netlify.app`) **beku sejak 2026-09-24** karena kredit Netlify habis. Repo ini
dibuat lebih dulu; alamatnya ditentukan kemudian. **Tidak di-push** — dan itu keputusan pemilik, bukan
langkah yang saya ambil sendiri.

---

## 8. Cara mengembalikan / melanjutkan

```bash
cd E:/asj-company-profile
git log --oneline          # e7b3784 feat, 10bb782 chore
npm install --ignore-scripts
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build   # shim safe-delete lokal, lihat MEMORY
npm run preview
```

Skrip penyalin ada di `E:/astro/.tmp-audit/mk-profile-repo.mjs` (gitignored) — **dry run secara
default**, dan menolak berkas yang tidak ada alih-alih melewatinya diam-diam. Kalau perlu menyalin
ulang setelah portal berubah, jalankan itu, bukan `cp -r`.
