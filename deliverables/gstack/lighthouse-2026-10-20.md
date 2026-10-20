# Lighthouse `/` — diukur, diperbaiki, dan yang sengaja TIDAK diperbaiki

**Tanggal:** 2026-10-20 · **Alat:** Lighthouse **12.2.1** (`npx`), Chromium Playwright
**Target:** `http://127.0.0.1:4321/` (`node server.cjs`, `dist/` hasil build
`asj-astro-dfd228b6412b`) · emulasi **mobile** bawaan Lighthouse.

Menutup item `TODO.md` → *Polish → Lighthouse audit — target 90+*.

---

## 1. Angka

| Kategori | Sebelum | Sesudah | |
|---|---|---|---|
| **Accessibility** | 98 | **100** | `heading-order` = 0 → lolos |
| **SEO** | 92 | **100** | `robots-txt` 705 error → lolos |
| **Best practices** | 100 | 100 | — |
| **Performance** | 65 | **61** | **belum 90**, lihat §4 |

Perubahan performa 65 → 61 **bukan** akibat peta (lihat §3.4): pada run audit,
**0 request pihak ketiga** tercatat — iframe-nya tidak dimuat sama sekali.
Angka ini bergerak karena harness lokal tidak mengompresi (§3.2), dan LCP
diukur 7,8 s → 9,9 s pada HTML 196 KB tanpa kompresi. Ukuran sesi ini tidak
memperbaiki performa; yang diperbaiki adalah aksesibilitas dan SEO, keduanya
sampai 100.

## 2. Cara mengulang

```bash
node server.cjs &                      # baca port dari stdout, JANGAN diasumsikan
export CHROME_PATH="…/ms-playwright/chromium-1243/chrome-win64/chrome.exe"
npx --yes lighthouse@12.2.1 http://127.0.0.1:4321/ \
  --output=json --output-path=F:/tmp/lh/home.json \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu --no-proxy-server" --quiet
```

Dua jebakan yang sudah kena dan harus diingat:

- **Server yang di-background lewat `&` di dalam satu tool call MATI** begitu
  call itu selesai. Gejalanya `ERR_CONNECTION_REFUSED` + Lighthouse
  *"Chrome prevented page load with an interstitial"* — yang terbaca seperti
  halaman rusak, padahal servernya sudah tidak ada.
- **`HTTP_PROXY`/`HTTPS_PROXY` di mesin ini membuat Chrome gagal**; karena itu
  `--no-proxy-server` wajib, sama seperti `curl --noproxy '*'` di gate lain.

## 3. Temuan, satu per satu, dengan putusannya

### 3.1 `heading-order` = 0 — **DIPERBAIKI** (a11y nyata)

Lighthouse menunjuk `h4.text-emerald-400` di dalam kartu "Penerimaan Siswa
Angkatan K". Strukturnya `H2` (judul kartu) → `H4` (tiga sub-judul), satu level
dilewati.

Yang membuat ini lebih dari satu baris CSS: **`e2e:headings` sudah punya asersi
"heading levels do not skip a level", tetapi ia hanya berjalan atas `ROUTES`
(tujuh rute form), bukan `ALL_HEADING_ROUTES`** — jadi `/` tidak pernah diukur,
sementara asersi `h1` dan skip-link di file yang sama sudah berjalan atas
keduanya. Gate melaporkan hijau untuk halaman yang Lighthouse nilai 0.

- `src/components/public/LayananSection.astro` — tiga `h4` → `h3`.
- `e2e/test-headings.mjs` — loop outline dipindah ke `ALL_HEADING_ROUTES`.
- **Dibuktikan bisa merah**: artefak `dist/index.html` dimutasi kembali ke `h4`,
  gate keluar `1` dengan dua kegagalan:
  `390px /` dan `1280px /` → *"the outline jumps from H2 \"Penerimaan Siswa
  Angkatan K\" to H4 \"Tersedia Dana Talang\" — a level was skipped"*.
  Artefak dipulihkan dan diverifikasi.

### 3.2 `uses-text-compression` — 674 KiB — **BUKAN cacat produksi** (terukur)

Diverifikasi langsung ke host live, bukan diasumsikan:

```
$ curl -s -D - -o /dev/null -H 'Accept-Encoding: gzip, br' https://asjastro.netlify.app/
Content-Encoding: br
```

Netlify sudah mengirim **brotli**. Yang tidak mengompresi adalah `server.cjs`,
harness lokal — dan itu berarti angka FCP/LCP/Speed Index di laporan ini
**pesimistis**, bukan gambaran pengunjung. Tidak ada perubahan kode untuk ini.

### 3.3 `robots-txt` 705 error — **DIPERBAIKI** (SEO nyata)

`public/robots.txt` **tidak ada**. Di produksi `/robots.txt` menjawab **404**
(diukur: `404 text/html`), dan di harness `server.cjs` ia menjawab **200 +
`index.html`** lewat SPA fallback — dua kegagalan berbeda dari satu sebab.

Ditambahkan `public/robots.txt` (allow publik, disallow tujuh permukaan
ber-sesi). **Tanpa baris `Sitemap:`** dengan sengaja: direktif itu menuntut URL
absolut pada host kanonis, dan host proyek ini sudah berpindah dua kali
(`asjportal` → `asjastro` → `boisterous-taiyaki`); robots.txt yang menunjuk
sitemap mati lebih buruk daripada yang diam.

Cacat **kedua** ikut ketemu di jalan: `.txt` **tidak ada di peta MIME
`server.cjs`**, jadi `/robots.txt` disajikan `application/octet-stream` —
persis kelas bug `.avif` 2026-09-28, dan terlihat pertama kali justru saat
memverifikasi perbaikan ini (curl mengembalikan `octet-stream`).

- `server.cjs` — `'.txt': 'text/plain; charset=utf-8'`.
- `src/lib/serverMime.test.ts` — dua kasus **selalu jalan** (bukan
  `skipIf(!hasBuild)`): `.txt` harus `text/*`, dan `public/robots.txt` harus ada
  dengan direktif pertama `User-agent: *`.
- **Dibuktikan bisa merah**, dua arah: menghapus entri `.txt` → 1 gagal
  (*"`.txt` is absent from the MIME map"*); memindahkan `robots.txt` → 1 gagal
  (*"public/robots.txt is missing"*). Berkas dipulihkan, md5 identik.

### 3.4 `offscreen-images` 91 KiB — **DIPERBAIKI**

Dua banner kartu di baris bawah `#layanan` dimuat meski di bawah lipatan.
`loading="lazy" decoding="async"` ditambahkan; wadahnya sudah bertinggi tetap
(`h-48 md:h-56`) sehingga tidak mungkin menggeser layout. Audit hilang dari
daftar kegagalan. Kartu pertama (`banner-sakura`) **sengaja tidak** di-lazy:
ia masih dalam ambang lipatan.

### 3.5 `uses-responsive-images` 249 KiB — **TIDAK DIPERBAIKI** (belum)

Enam gambar, semuanya menyajikan berkas lebih lebar dari yang ditampilkan.
Pola rumah untuk ini sudah ada (`/assets/ilustrasi/*` dengan `1x/@2x` AVIF+WebP),
tetapi banner `/assets/banner-*.webp` hanya punya satu ukuran (800×400, 900×600,
900×487) dan **belum punya varian**. Membuat varian = aset baru dengan nama baru
(aturan cache `immutable`), plus `srcset`/`sizes` per call site. Itu pekerjaan
tersendiri, bukan tambahan pada sesi ini.

### 3.6 `unused-javascript` 221 KiB & `admin.*.css` 185 KB — **DICATAT, belum**

Ini temuan terbesar dan bukan soal Lighthouse saja:

```
196KB  /                                    (HTML, tanpa kompresi)
185KB  /_astro/admin.DgQMtOQR.css           ← SATU stylesheet, render-blocking, di SEMUA halaman
213KB  /_astro/supabase.CpMfRyCo.js         ← klien Supabase ikut di beranda publik
 94KB  /_astro/i18n-jp.9AWTnlmG.js
```

Halaman publik memuat klien Supabase dan seluruh CSS (termasuk gaya panel
admin) meski pengunjung tidak login dan tidak pernah membuka admin. Memperbaiki
ini berarti memecah bundel per permukaan — perubahan arsitektural, dan tidak
boleh dicampur dengan sesi perbaikan gate. Dicatat sebagai item tersendiri.

### 3.7 `unminified-javascript` 7 KiB — **SENGAJA TIDAK**

Yang dilaporkan adalah **script inline** di `BaseLayout.astro` (restore tema,
gutter scrollbar, flag animasi) — 9 KiB, 7 KiB di antaranya komentar. Komentar
itu memuat **pengukuran** (mis. kenapa `clientWidth` salah dan
`getBoundingClientRect().width` benar), dan repo ini memperlakukan alasan
tertulis sebagai beban yang menahan bug yang sama agar tidak kembali (R7).
7 KiB mentah ≈ 1,5–2 KiB setelah brotli. Tidak ditukar.

### 3.8 `dom-size` 1.267 elemen & `mainthread-work-breakdown` 2,6 s — **TIDAK**

Keduanya konsekuensi dari satu halaman yang memang panjang (17 seksi). Tidak ada
perbaikan murah; memotongnya berarti memotong isi, dan itu keputusan pemilik.

---

## 4. Yang berubah di halaman, dan efeknya ke audit

Peta ilustrasi `#lokasi` diganti **embed Google Maps interaktif** (permintaan
pemilik). Konsekuensi yang perlu dicatat:

- **0 request pihak ketiga** pada run Lighthouse — `loading="lazy"` menahannya
  karena posisinya jauh di bawah lipatan. Jadi peta ini **tidak** menyebabkan
  penurunan performa di §1.
- `title` pada `<iframe>` adalah **nama aksesibel**-nya; `e2e:aria-names` hijau
  (40 cek, 0 gagal) setelah perubahan.
- `ilustrasi/lokasi-banner.webp` dicabut dari `ILLUSTRATIONS` di
  `scripts/ci/verify-assets.mjs` — kalau tidak, ia menjadi persetujuan yang
  tidak menjaga apa pun (persis yang dilaporkan cek (a1)). Keempat berkasnya
  **tetap di disk**, hanya tidak lagi dirender.

## 5. Status item `TODO.md`

- *Lighthouse audit — target 90+*: **belum tercapai untuk Performance.**
  Accessibility 100, SEO 100, Best Practices 100; Performance 61 **diukur pada
  harness tanpa kompresi**, jadi angka itu bukan angka produksi. Anotasi di
  `TODO.md` menyebut angka, sebab, dan dua pengungkit berikutnya (§3.5, §3.6)
  supaya tidak ada yang membacanya sebagai "selesai".
- *Audit aksesibilitas (WCAG 2.1)*: tetap terbuka, tetapi satu lubang cakupan
  tertutup — outline kini diukur di rute publik, bukan hanya rute form.
