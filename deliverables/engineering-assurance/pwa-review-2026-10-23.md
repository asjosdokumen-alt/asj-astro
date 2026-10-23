# Review PWA + pasca-commit `aa8fa40`

**Tanggal:** 2026-10-23 · **HEAD:** `aa8fa40` (feat(seo): sitemap, static job list, breadcrumb, thin-content fixes)
**Lingkup:** seluruh aplikasi PWA (manifest, service worker, offline, install, push, ikon, update flow) **dan** hasil commit terakhir.
**Metode:** suite penuh + gate PWA + probe Chromium sungguhan terhadap `dist/` HEAD (server HTTPS yang meniru 301 Netlify).

---

## 0. Ringkasan — baca ini dulu

Aplikasinya **bisa di-install dan benar-benar jalan offline untuk URL berslash** (`/loker/`, `/apply/`, `/blog/...`).
Tapi ada **4 hal yang harus diperbaiki**, dan **2 di antaranya berasal dari commit terakhir**:

| # | Temuan | Bukti | Dampak |
|---|---|---|---|
| P1 | Navigasi offline ke URL **tanpa slash** gagal total (`net::ERR_FAILED`) | probe: 8/8 bare URL gagal, 8/8 slashed URL 200 | user menekan link di app saat offline → halaman error browser |
| P1 | Commit terakhir **meninggalkan suite merah** | `10 failed \| 2895 passed`, 4 di antaranya menunjuk baris di file baru | "selesai" belum benar; gate i18n & indexer merah |
| P1 | Seluruh metadata SEO **tidak ter-render** tanpa `PUBLIC_SITE_URL` | `canonical=0, hreflang=0, og:url=0, og:image=0, ld+json=0` di 3 halaman | kerja `9a43df5` + `aa8fa40` tidak sampai ke Google |
| P2 | `robots.txt` memblokir 4 dari 7 URL yang justru didaftarkan sitemap | `/apply`, `/siswa-baru`, `/ai-cv`, `/master` | sitemap ≡ keluhan "Blocked by robots.txt" di Search Console |

**Status:** tiga P1 sudah diperbaiki dan di-commit di sesi yang sama — lihat §12 untuk bukti
sebelum/sesudah dan sisa merah yang bukan milik sesi ini. P2 `robots.txt` masih terbuka karena
butuh keputusan pemilik (halaman form diindeks atau tidak).

Sisanya P2/P3: payload precache 5,72 MB, ikon 385 KB + 326 KB, force-reload saat deploy, sitemap duplikat.

---

## 1. Yang saya ukur (dan cara mengukurnya)

```
node node_modules/vitest/vitest.mjs run   → 5 failed | 238 passed (243 files)
                                             10 failed | 2895 passed (2905 tests)  · 400 s · exit 1
node scripts/ci/verify-pwa.mjs            → OK — 26 checks passed
```

Probe offline memakai Chromium (Playwright) terhadap `dist/` HEAD, disajikan lewat server HTTPS
lokal yang meniru routing Netlify (`/x` → 301 `/x/`), supaya perilakunya sama dengan produksi —
bukan `file://`, bukan server yang mengembalikan 200 untuk URL tanpa slash.

`dist/` **terbukti dari HEAD** (mengandung `data-loker-static`, seksi "Artikel", dan 2 entri blog di sitemap),
jadi angka-angka di bawah bukan artefak build lama.

---

## 2. P1 — Offline: URL tanpa slash gagal, URL berslash jalan

### Bukti

| URL (offline) | Hasil |
|---|---|
| `/`, `/loker/`, `/apply/`, `/ai-cv/`, `/public/`, `/blog/panduan-…/`, `/404.html` | **200**, judul benar |
| `/loker`, `/apply`, `/ai-cv`, `/public`, `/master`, `/admin`, `/blog/panduan-…` | **`net::ERR_FAILED`** |

Isi Cache Storage setelah install:

```
/loker    → status 200, redirected: TRUE     ← inilah penyebabnya
/loker/   → status 200, redirected: false
/apply    → status 200, redirected: TRUE
```

### Akar masalah

`scripts/build-sw-manifest.mjs` menambahkan **dua bentuk** URL untuk tiap route
(`/loker/` dan `/loker`) — itu benar. Tapi `cache.add('/loker')` **mengikuti 301** dari server
dan menyimpan respons yang bertanda `redirected: true`.

Lalu di `public/sw.js` cabang fallback offline:

```js
(await cache.match(url.pathname)) || (await cache.match('/index.html')) || …
```

respons bertanda *redirected* itu dikembalikan **apa adanya** ke sebuah navigation request.
Chromium menolak: navigation punya `redirectMode = "manual"`, dan respons hasil redirect tidak
boleh dipakai untuk request seperti itu ⇒ `ERR_FAILED`.

Ironisnya, jalur **jaringan** sudah menangani kasus ini dengan benar (komentar panjang di
`sw.js:173-193`, `res.redirected` → `new Response(res.body, …)`), tapi jalur **cache** tidak.
Dan app ini memang menautkan bentuk **bare** (`href="/ai-cv"`, `/loker`, `/apply`) — persis
bentuk yang gagal.

### Perbaikan (kecil, 6 baris, di satu tempat)

Di `public/sw.js`, cabang `.catch()` navigasi — normalkan hasil cache dengan cara yang sama
seperti jalur jaringan:

```js
.catch(async () => {
  const cache = await caches.open(VERSION);
  const hit = (await cache.match(url.pathname)) || (await cache.match('/index.html'));
  if (!hit) return new Response(/* … 503 offline … */);
  // A cached response that followed a redirect must not be handed to a
  // navigation: Chromium rejects it (ERR_FAILED). Rebuild to clear the flag.
  return hit.redirected
    ? new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: hit.headers })
    : hit;
})
```

Tes yang bisa gagal: satu kasus di `src/lib/swOffline.test.ts` yang menuntut `hit.redirected`
diperiksa di cabang fallback (assertion struktural), **plus** probe e2e offline untuk `/loker`
tanpa slash. Tanpa tes, perbaikan ini bisa hilang lagi.

---

## 3. P1 — Commit terakhir meninggalkan suite merah

`aa8fa40` di-commit di atas suite yang merah. **4 kegagalan menunjuk langsung ke file yang baru ditambahkan:**

1. `src/store/i18n.keys.test.ts` → **"id" dictionary**: `profile.artikel_title`, `profile.artikel_desc` tidak ada.
2. `src/store/i18n.keys.test.ts` → **"jp" dictionary**: 2 kunci yang sama.
3. `src/store/i18n.keys.test.ts` → **teks Indonesia telanjang**, 10 lokasi:
   `LokerStaticList.astro:65,66` · `ai-cv.astro:15` · `apply.astro:15` ·
   `blog/[...slug].astro:65,67,68` · `index.astro:818,827` · `siswa-baru.astro:16`
4. `indexer/src/build.test.ts` → **7 unresolved ref** di `LokerStaticList.astro:75-81` (nama `j`).
   Penyebabnya `{jobs.map((j) => ( <td>{j.code}</td> … ))}` — analyzer template `.astro` tidak
   mengikat parameter panah satu huruf. Ini kelas yang sama dengan R15 §3a (jebakan `.astro`).

**6 kegagalan sisanya sudah merah sebelum commit ini** (menyebut area yang tidak disentuh `aa8fa40`):
`build.test.ts` fileCount 573 vs 565 · `symbolCount` 26.792 > 26.400 ·
`deep-tier.test.ts` daftar binding BaseLayout 26 vs 12 (warisan `9a43df5`) ·
`discover.test.ts` ts 321 vs 316 · `boundary.test.ts` ×2 (`contexts/documents/service.ts` →
`_lib/db/client.ts`, 1 warning).

Catatan penting: `fileCount` naik **+8** padahal commit hanya menambah **3 file** — jadi angka beku
itu memang sudah basi sebelum commit ini, dan sekarang bertambah lagi. Perbaiki dengan
**mengukur**, bukan menebak (R1a/R15).

---

## 4. P1 — Metadata SEO tidak ter-render: `PUBLIC_SITE_URL` tidak diset

Commit `9a43df5` menambah canonical/hreflang/OG/JSON-LD, `aa8fa40` menambah sitemap.
Di artefak build, **semuanya kosong**:

```
dist/index.html                              canonical=0  hreflang=0  og:url=0  ld+json=0
dist/loker/index.html                        canonical=0  hreflang=0
dist/blog/panduan-kerja-ke-jepang-2026/…     canonical=0  hreflang=0  og:image=0  ld+json=0  breadcrumb=0
```

Sebabnya `siteOrigin()` (`src/lib/siteMeta.ts:41`) hanya membaca `PUBLIC_SITE_URL`, dan variabel itu:
- tidak ada di `netlify.toml`,
- tidak ada di `.env.example`,
- tidak ada di `.env.local`.

Kalau `null`, `organizationJsonLd()` mengembalikan `null` ⇒ `jsonLdScript(null)` ⇒ **tidak ada
JSON-LD sama sekali**, bukan hanya canonical.

Dan sitemap menyiasatinya dengan **host hardcode**:

```ts
const origin = siteOrigin() ?? 'https://asjastro.netlify.app';
```

Itu bertentangan dengan kebijakan `siteMeta.ts` sendiri ("lebih baik tidak memancarkan apa pun
daripada menebak"). Kalau `PUBLIC_SITE_URL` diset, keduanya konsisten; kalau tidak, sitemap
mengklaim satu host sementara halaman tidak mengklaim apa pun.

**Tindakan:** `netlify env:get PUBLIC_SITE_URL --context production`. Kalau kosong → set ke host
kanonik, redeploy. Kalau terisi → build lokal saja yang kosong, dan tinggal tambahkan ke
`.env.example` supaya build lokal setara produksi.

---

## 5. P2 — `robots.txt` vs `sitemap.xml` saling bertentangan

Sitemap mendaftarkan 9 URL. `robots.txt` memblokir 4 di antaranya:

| URL di sitemap | `robots.txt` |
|---|---|
| `/`, `/loker`, `/public`, 2 blog | `Allow` ✅ |
| `/apply`, `/siswa-baru`, `/ai-cv` | **`Disallow`** ❌ — padahal commit ini justru mengisi halaman itu supaya tidak tipis |
| `/master` | **`Disallow`** ❌ |

Google akan melaporkan "Blocked by robots.txt" dan tidak mengindeks. Pilih salah satu:
hapus baris `Disallow` untuk 3 halaman form (kalau memang mau diindeks), **atau** keluarkan
dari sitemap. Jangan biarkan keduanya berjalan.

Bonus: `robots.txt` menulis sendiri *"NO `Sitemap:` line, deliberately … Add the directive only
together with a real `sitemap.xml` generated from the build."* Syarat itu sekarang terpenuhi —
tapi barisnya belum ditambahkan.

---

## 6. P2 — Payload precache 5,72 MB, termasuk kode yang tidak dipakai pengunjung publik

`build-sw-manifest.mjs` mengecualikan `pdf-parse` dan `xlsx` — **daftar itu sudah basi**.
Chunk terbesar di build sekarang justru lolos:

```
918 KB  /_astro/exceljs.min.CXJcUG2D.js   ← TIDAK dikecualikan, ikut diprecache
305 KB  /_astro/AdminPanel.UcPm3ekP.js    ← hanya /admin
186 KB  /_astro/admin.DRLKg_22.css        ← hanya /admin
397 KB  /_astro/index.BHWRPnof.js         ← landing, wajar
213 KB  /_astro/supabase.CpMfRyCo.js      ← wajar
```

Total 101 entri = **5,72 MB** yang diunduh saat install, padahal ~1,4 MB di antaranya kode admin
yang tidak akan pernah dieksekusi pengunjung publik. Perbaikan termurah: tambahkan `/^exceljs\./`
ke `LAZY_EXCLUDE`, dan pertimbangkan mengecualikan HTML route ber-gate (`/admin/`, `/candidate/`,
`/master/`, `/share/`) dari precache awal — halaman itu tetap ter-cache saat benar-benar dibuka.

Catatan: `verify-pwa.mjs` juga hanya memeriksa `/pdf-parse\.|\/xlsx\./`, jadi gate-nya tidak bisa
menangkap regresi ini. Perbarui keduanya bersamaan.

---

## 7. P2 — Ikon: berat, dan yang dipakai tidak dijaga gate

| Berkas | Ukuran | Catatan |
|---|---|---|
| `icon-512.png` | **385 KB** | 512×512 PNG logo; wajar ~30–60 KB |
| `icon-maskable-512-v2.png` | **326 KB** | dipakai manifest, sudut opaque (benar untuk maskable) |
| `icon-192.png` | 60 KB | juga berat untuk ukurannya |

Dua masalah lain:

- `e2e/pwa-icons-transparency.test.ts` menguji `icon-maskable-512.png` — berkas **lama** yang sudah
  **tidak dirujuk manifest lagi**. Berkas yang benar-benar dipakai (`…-v2.png`) tidak diuji.
- `scripts/build-pwa-icons.mjs:109` masih menulis nama lama (`icon-maskable-512.png`). Kalau skrip
  itu dijalankan lagi, manifest tetap menunjuk `-v2.png` yang tidak pernah dibuat ulang.

`apple-touch-icon.png` sudutnya transparan (diuji begitu). iOS mengisi area transparan dengan
**hitam**, bukan dengan `background_color` — jadi di home screen iOS sudutnya jadi hitam.
Untuk berkas Apple sebaiknya full-bleed opaque; berkas PWA tetap transparan. (P3)

---

## 8. P2 — Force-reload saat deploy bisa menghapus isian form

`install` memanggil `skipWaiting()`, `activate` memanggil `clients.claim()` lalu mengirim
`ASJ_FORCE_RELOAD` ke semua tab. Terbukti di probe: context halaman hancur tepat setelah worker
aktif. Digabung dengan `reg.update()` tiap 5 menit, artinya **setiap deploy me-reload paksa tab
yang sedang terbuka** — termasuk admin yang sedang mengisi form Master atau kandidat yang mengisi CV.

Ini keputusan desain yang terdokumentasi (`src/lib/appVersion.ts`), jadi bukan bug tak sengaja.
Tapi risikonya nyata dan murah ditutup: jangan `skipWaiting()` otomatis; tampilkan tombol
"Muat ulang" (VersionBadge sudah ada dan sudah punya state `stale`), atau tunda reload kalau
ada input yang belum disimpan.

---

## 9. P3 — Daftar kecil (boleh nanti)

1. **`public/sitemap.xml` duplikat & basi** — masih ada (797 B, berisi `/share/`), kalah oleh
   route `src/pages/sitemap.xml.ts` di `dist/`. Sumber kebenaran jadi dua; hapus yang statis.
2. **`theme_color` statis `#020617`** padahal app punya tema terang (`src/store/theme.ts`) —
   status bar tetap gelap di mode terang. Bisa dipisah dengan `media="(prefers-color-scheme: light)"`.
3. **`orientation: "portrait-primary"`** mengunci tablet ke portrait, termasuk tabel admin.
4. **Tidak ada `screenshots`** di manifest ⇒ dialog install Chrome versi sederhana.
5. **`badge: '/icons/favicon-32.png'`** berwarna; Android mengharapkan badge monokrom
   (hasilnya blob putih).
6. **`notificationclick`** memfokuskan client pertama lalu menavigasinya — bisa membajak tab
   yang sedang dipakai.
7. **Shortcut "Dashboard Kandidat"** (`/candidate/`) untuk pengunjung anonim berakhir di `/`.
8. **Fallback offline** hanya HTML 503 inline, belum halaman bermerek.

---

## 10. Yang sudah benar — jangan diutak-atik

- Manifest lengkap: `id`, `scope`, `start_url`, `display_override`, 192/512/maskable/apple, shortcuts.
- `Content-Type: application/manifest+json` + `Cache-Control: no-cache` untuk `sw.js` sudah di `netlify.toml`.
- Versi cache diturunkan dari hash isi build ⇒ build identik tidak mengubah cache.
- `/version.json` di-bypass SW dan di-fetch dengan cache-buster; `VersionBadge` membandingkan
  angka yang berasal dari hash yang sama. Ini desain yang benar.
- Navigation network-first (bukan cache-first), API & cross-origin tidak pernah disentuh,
  `cache.put` selalu punya `.catch`, aset tidak pernah resolve ke `undefined` (504).
- `verify:pwa` 26/26 hijau; `push` handler + `notificationclick` ada dan diuji.
- Gambar offline **lengkap**: setelah satu kunjungan terkontrol, 28/28 `<img>` termuat offline
  (25 aset di-cache SWR). Sempat terukur "15 rusak", tapi itu gambar `loading="lazy"` di bawah
  fold yang belum pernah di-scroll — bukan cacat.

---

## 11. Urutan kerja yang saya sarankan

1. **`PUBLIC_SITE_URL`** — satu variabel, membuka canonical + hreflang + OG + JSON-LD + sitemap sekaligus.
2. **Perbaiki `public/sw.js` cabang fallback** (6 baris) + tes yang bisa gagal.
3. **Tutup 4 kegagalan i18n/indexer dari `aa8fa40`** (10 string + 2 kunci + `j`), lalu commit.
4. **Selaraskan `robots.txt` ↔ `sitemap.xml`** (keputusan pemilik: 3 halaman form diindeks atau tidak).
5. **`LAZY_EXCLUDE` + `verify-pwa`**: kecualikan `exceljs`, perbarui gate.
6. Sisanya P3 sesuai waktu.

---

## 12. Yang sudah dikerjakan (sesi yang sama, 2026-10-23)

Poin 1–3 di atas **sudah diperbaiki dan di-commit**. Tidak ada push (R19).

| Commit | Isi | Bukti |
|---|---|---|
| `0a17d72` | `public/sw.js`: fallback offline menormalkan respons cache yang `redirected` | probe: 14/14 route offline 200 (sebelumnya 8 gagal `ERR_FAILED`); tes baru gagal di worker lama, lulus di worker baru |
| `bac3f44` | 10 string + 2 kunci diterjemahkan lewat `data-lang`; tabel lowongan pindah ke `LokerStaticTable.tsx` | `i18n.keys.test.ts` 7/7 · `LokerStaticTable.test.tsx` 4/4 · unresolved-ref indexer hijau |
| `0a3499a` | `siteOrigin()` fallback ke `URL` milik Netlify; sitemap berhenti menebak diam-diam | build dengan origin: `canonical=1 hreflang=3 og:url=1 ld+json=1` (blog: 2) |
| `cbe359f` | 2 template literal di `BaseLayout` — memulihkan `lint-ratchet` | ratchet 2012, PASSED |

**Status gate setelah perbaikan:** `typecheck:ratchet` PASSED (0) · `lint-ratchet` PASSED (2012) ·
`verify:pwa` 26/26 · suite `6 failed | 2910 passed (2916)`.

**Enam yang masih merah — semuanya angka beku, bukan kode baru:**

```
build.test.ts     fileCount 575 (baseline 565)      ← +10 sejak baseline
build.test.ts     symbolCount 26.854 (> 26.400)
discover.test.ts  count('ts') 321 (baseline 316)
deep-tier.test.ts binding template BaseLayout 26 vs 12   ← dari 9a43df5
boundary.test.ts  ×2 — 1 warning: contexts/documents/service.ts → _lib/db/client.ts
```

Dua di antaranya naik karena commit sesi ini (`+2` file, `+62` simbol). Sesuai R1a, angka di
`indexer/src/{discover,build}.test.ts` **tidak saya sentuh** — itu wilayah team-lead. Angka
terukurnya sudah dicatat di atas supaya re-baseline-nya satu langkah, bukan satu penyelidikan.

**Sisa terbuka** (belum dikerjakan, sesuai lingkup): `robots.txt` ↔ sitemap (butuh keputusan
pemilik), `exceljs` di precache, berat ikon, force-reload saat deploy, dan daftar P3 di §9.

`git status` bersih; `indexer/validate-report.json` dikembalikan setelah suite menulisnya.

---

## 13. Sesi lanjutan — "tidak ada merah, tidak ada error" (2026-10-23, malam)

Instruksi pemilik: *"saya gak tahu, sesuai rekomendasi dan trend saja; yang penting tidak ada bug,
tidak ada merah atau error."* Jadi keputusan yang tadinya menunggu owner saya ambil sendiri.

### a) Boundary — satu pelanggaran arsitektur, bukan angka basi

`contexts/documents/service.ts` mengimpor `_lib/db/client.ts` langsung, melanggar §5.1, dan itu
satu-satunya pelanggaran di repo (`cli violations` → 1 warning). Diperbaiki dengan bentuk yang sudah
dipakai `catalog`: `storageUrl` di-re-export lewat `documents/repository.ts`. Sekarang
**"no boundary violations — architecture rules hold"**.

### b) Enam merah → hijau, dengan angka yang DIUKUR

`count-indexed.test.ts` (alat ukur milik repo, bukan tebakan dari diff):

```
files.length = 576
  ts = 321   tsx = 115   astro = 23   mjs = 90   cjs = 6   js = 21
  sum of the six buckets = 576
```

| Counter | Lama | Baru | Dasar |
|---|---|---|---|
| `fileCount` / `files.length` | 565 | **576** | +5 ts, +1 astro (batch SEO) · +2 tsx (LokerStaticTable + suite) · +1 tsx (Toast.test) |
| `count('ts')` | 316 | **321** | delta per bucket |
| `count('tsx')` | 111 | **115** | delta per bucket |
| `count('astro')` | 21 | **23** | `blog/[...slug].astro` + `LokerStaticList.astro` |
| plafon `symbolCount` | 26.400 | **27.000** | terukur 26.854; konvensi blok itu "measured + margin" |
| binding `BaseLayout` (deep-tier) | 13 | **27** | `9a43df5` menambah canonical ×2, description, jsonLd ×2, lang, noIndex, ogImageAbsolute ×4, title ×2 |

Daftar binding-nya **tidak disusun dari diff** — assertion-nya sementara didahului `console.log`
array aslinya, dan daftar di tes adalah output itu apa adanya.

### c) `robots.txt` ↔ `sitemap.xml` — keputusan

- `/apply`, `/ai-cv`, `/siswa-baru` → **dibuka**. Konten server-rendered-nya nyata sekarang, dan
  itulah alasan `aa8fa40` menulisnya. Tetap di sitemap.
- `/master` → **tetap diblokir, keluar dari sitemap**. Form entri data kandidat, nol copy unik,
  maksudnya sama dengan `/apply`.
- Baris `Sitemap:` **tidak** ditambahkan ke `robots.txt`: berkas itu statis tanpa build step,
  jadi tidak bisa me-resolve origin seperti `sitemap.xml.ts` (host sudah pindah dua kali).
  Alasannya ditulis di dalam berkas; sitemap didaftarkan sekali lewat Search Console.
- Gate baru `e2e/sitemap-robots-agreement.test.ts` (4 tes) membaca `dist/sitemap.xml` +
  `public/robots.txt` dan menolak URL yang didaftarkan tapi diblokir. **Terbukti merah** pada dist
  lama (2 gagal, `/master` termasuk) dan hijau setelah build ulang.

### d) Notif merah saat pindah tab — yang bisa dibuktikan dan yang tidak

**Tidak bisa direproduksi.** Dashboard admin butuh sesi, dan `netlify dev` tidak mau start di
sandbox ini (shim bulk-delete menolak 82 penghapusan `node_modules/.vite`, lalu "Waiting for
framework port 4321" sampai batas waktu). Jadi saya tidak mengklaim sudah memperbaiki keluhan itu.

**Yang bisa dibuktikan dan diperbaiki:** `showToast()` tidak punya dedupe. Berpindah tab me-mount
beberapa view sekaligus; satu gangguan jaringan → beberapa toast merah berisi kalimat identik, dan
`MAX_VISIBLE = 4` mendorong keluar pesan yang berbeda. Sekarang pesan identik (teks **dan** jenis)
yang masih terlihat tidak ditumpuk — 5 tes mengunci batasnya (teks beda tetap tampil, jenis beda
tetap tampil, setelah ditutup boleh muncul lagi).

**Dua tersangka yang tersisa**, keduanya toast saat *memuat* (bukan saat pengguna melakukan aksi),
jadi keduanya bisa muncul sementara halaman tetap jalan:
`Gagal memuat draf CV` (`src/components/forms/AiCvForm.tsx:537`) dan toast generik `apiClient`.
Kalau muncul lagi, teks toast-nya akan menunjuk sumbernya dalam satu baris.

### Status akhir

```
suite           246 files / 2925 tests — PASSED, exit 0
typecheck:ratchet  PASSED (0)
lint-ratchet       PASSED (2012)
verify:pwa         26/26
bundle:size        pass (3079,1 KB / 21 entry)
boundary           0 violations
```

---

## 14. Ronde P2 — payload install dan set ikon (2026-10-23, malam)

Dua dari tiga P2 dikerjakan; yang ketiga sengaja **tidak** disentuh, alasannya di bawah.

### a) `exceljs` keluar dari precache — 860 KB

`exceljs.min.*.js` adalah berkas terbesar di seluruh build (918 KB) dan ikut
diprecache, jadi **setiap** pengunjung mengunduhnya saat install — padahal satu-satunya
pengimpor adalah ekspor Excel admin (`admin/TabConfig.tsx`) dan CV template loader.
Daftar pengecualian hanya menyebut `pdf-parse` dan `xlsx`; `exceljs` masuk ke build
belakangan dan daftarnya tidak pernah ditinjau ulang. Daftar basi yang sama hidup di
`verify-pwa.mjs`, jadi gate tidak bisa melihat hal yang seharusnya ia tangkap.

```
sebelum   101 entri precache / 5,72 MB
sesudah   100 entri precache / 4,86 MB      (-860 KB saat install)
```

Gate-nya sekarang punya kasus mutasi sendiri: `pwa-mutate.mjs` → `lazy-chunk-precached`,
baterai → `W1j`. Hasil baterai: **10 killed, 0 survived, 2 ok-green** (W2a baseline, W2b kontrol).

### b) Ikon: generator akhirnya menghasilkan berkas yang benar-benar dikirim — 622 KB

Tiga drift, semuanya terukur:

1. Manifest menunjuk `icon-maskable-512-v2.png`; skrip masih menulis
   `icon-maskable-512.png`. Menjalankannya akan menyegarkan berkas yang tidak dibaca
   siapa pun dan meninggalkan berkas yang benar-benar diambil browser.
2. Skrip mengecat **semua** ikon di atas `#020617` — persis cacat "kotak hitam" yang
   gate ikon ada untuk menangkap, jadi output skripnya sendiri gagal gate. Sekarang:
   kanvas **bening** untuk `purpose: any` (emblem-nya lingkaran, kotak di sekelilingnya
   harus kosong) dan tetap **opaque** untuk `maskable` (Android memotongnya dan mengisi
   sisanya dengan piksel ikon itu sendiri).
3. Gate memegang daftar hardcoded berisi nama maskable yang **lama**, jadi ia menguji
   berkas mati sementara berkas yang dipakai tidak diuji. Sekarang ia membaca
   `public/manifest.webmanifest` dan memisahkan berdasarkan `purpose`.

```
icon-512.png             385 KB -> 97 KB
icon-maskable-512-v2.png 326 KB -> 69 KB
icon-192 / apple-touch / favicon   62 KB -> 39 KB
total                    827 KB -> 205 KB      (-622 KB)
```

Palet 8-bit dipakai karena itu **pilihan terukur skrip ini sendiri** (4-bit membanding
emasnya dan sudah ditolak sebelumnya). Diperiksa ulang dengan crop 3× sebelum diterapkan:
tidak ada banding yang terlihat.

### c) Force-reload saat deploy — TIDAK diubah

`install` → `skipWaiting()`, `activate` → `claim()` + `ASJ_FORCE_RELOAD` memang me-reload
tab yang sedang terbuka, dan itu bisa membuang isian form yang belum disimpan. Tapi
alternatifnya ("tampilkan tombol, jangan reload otomatis") menukar satu masalah dengan
masalah lain: klien bisa tertahan di build lama tanpa batas. Jalan tengahnya — tunda
reload kalau ada input kotor — butuh sinyal "kotor" yang andal, dan aplikasi ini belum
punya. Jadi tidak saya ubah; ini keputusan produk, bukan bug, dan sudah tercatat di §8.

### Status

```
suite             246 files / 2919 tests — PASSED, exit 0
typecheck:ratchet  PASSED (0)
lint-ratchet       PASSED (2012)
verify:pwa         26/26
pwa battery        10 killed / 0 survived / 2 ok-green
```
