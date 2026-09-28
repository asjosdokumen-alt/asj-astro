# Verifikasi Adversarial — Hero Parallax Full-Bleed (`/`)

**Penulis verifikasi:** gstack-qa-lead (QA & release)
**Tanggal:** 2026-09-27
**HEAD:** `832a3051bdf5007c6bb525f487655b94e15f8085` (working tree dirty — perubahan uncommitted)
**Metode:** probe INDEPENDEN (`F:/tmp/qa-hero-independent.mjs` + 4 probe lanjutan), bukan menjalankan ulang `e2e/measure-hero-parallax.mjs` milik penulis.
**Server:** `node server.cjs` → port dibaca dari stdout-nya = **4321**. Build dijalankan lebih dulu (`astro build`, 41.4 s), server dijalankan SESUDAH build.
**Proxy:** semua request memakai `--noproxy '*'` / `--no-proxy-server`.

> Catatan artefak: build dipanggil sebagai compiler telanjang (`node node_modules/astro/astro.js build`), jadi `dist/sw.js` tetap placeholder lama (Sep 22). Ini keterbatasan pemanggilan, bukan cacat perubahan. `dist/_astro/*.css` dan `dist/index.html` adalah hasil build terkini.

---

## Ringkasan Eksekutif

**Verdict: 6 dari 6 klaim CONFIRMED.** Tidak ada klaim yang REFUTED.

Yang paling menentukan (dan tidak bisa dibuktikan hanya dari sumber): saya **mutation-test** artefak yang dikirim. Mengubah `.hero-band{overflow:clip}` → `overflow:hidden` di CSS yang disajikan **membekukan timeline** — sweep saya (121 titik) jatuh dari **109 nilai `translateY` unik** menjadi **1**. Ini mereproduksi temuan "clip 6 vs hidden 1" milik penulis, tetapi dengan resolusi jauh lebih tinggi dan sebagai bukti bahwa pengukuran saya punya gigi: `clip` dan `hidden` memang bisa dibedakan, jadi verdict CONFIRMED bukan kelulusan kosong.

Sinyal kedua yang diminta penulis **ada dan bekerja**: `element.getAnimations()[0]` mengembalikan `CSSAnimation` nyata dengan `timeline: ViewTimeline`, `playState: running`, dan `currentTime` numerik yang **monoton** (94 naik, 0 turun dari 101 sampel) dan **reversibel tepat** pada offset yang sama. Ini yang membedakan "benar-benar terikat-scroll" dari "bergerak sekali lalu berhenti".

Dua hal nyata yang tidak disebut klaim (keduanya INFO/LOW, bukan regresi): `.avif` disajikan `application/octet-stream` oleh `server.cjs`, dan `dist/sw.js` basi bila build dipanggil tanpa `build-sw-manifest.mjs`.

---

## Tabel Verdict per Klaim

| # | Klaim | Verdict | Angka kunci |
|---|-------|---------|-------------|
| 1 | Band full-bleed + satu layar via `min-height:100svh` (bukan `vh`) | **CONFIRMED** | rect band = rect body persis: 1280×820 (`left 0 = bodyLeft 0`, `width 1265 = bodyWidth 1265`); 390×844 (`width 375 = bodyWidth 375`). `margin-top 0px`, `border-radius 0px`, `max-width none`, `padding-left 40px/24px` (bukan `px-4` di band). `height 820 >= viewport 820`; `height 844 >= 844`. CSSOM: `.hero-band{min-height:100vh;overflow:clip}` **dan** `@supports (height:100svh){.hero-band{min-height:100svh}}` — keduanya selamat dari minifier. |
| 2 | Memotong dengan `overflow: clip`, BUKAN `hidden` | **CONFIRMED** | Computed `overflow: clip` (x & y) di kedua viewport. **Mutation `clip→hidden`: sweep unik 109 → 1 (beku di `translateY≈0`).** Tanpa mutation, 109 nilai unik, span `translateY` 38.05px (art) / 104.63px (haze). |
| 3 | Dua bidang melayang beda kecepatan, reversibel | **CONFIRMED** | `.hero-art` span **+38.05px turun** (108 naik / 0 turun); `.hero-haze` span **−104.63px naik** (0 naik / 108 turun) → arah BERLAWANAN, magnitudo beda ~2.75×. Di 390×844: art +39.16px, haze −107.69px. Reversibel: pada offset 0.5×vh, `midA == midB` persis (`ty art 17.6134 == 17.6134`; `ty haze −48.4368 == −48.4368`). `currentTime` juga reversibel (73.1465 → 73.1465). |
| 4 | Headline pakai serif display (Instrument Serif), weight 400, termuat | **CONFIRMED** | `getComputedStyle(h1).fontFamily` = `"Instrument Serif", ui-serif, …`. `document.fonts.check('400 72px "Instrument Serif"')` = **true**; status `loaded`; satu-satunya `FontFace` Instrument = weight **400**. Aset benar-benar di-fetch: `instrument-serif-latin-400-normal.DnYpCC2O.woff2` 200, `font/woff2`, **21032 byte (20.5 KB)** — cocok persis klaim; fallback `.woff` 18336 byte (17.9 KB). `font-weight` computed = `400`. |
| 5 | `prefers-reduced-motion: reduce` → kedua bidang inert di SETIAP offset, tetap tergambar | **CONFIRMED** | 121 offset: himpunan transform = `{"none"}`, `ty` = 0 di semua. Kedua bidang `display:block`, `visibility:visible`, `opacity:1`, `animation-name:none`. Over-cover: art `top −66, h 951 > band 820`; haze `top −66, h 951 > band 820` (390: `−68 / 979 > 844`). Non-vakum: menyembunyikan haze mengubah pixel screenshot (`1079012` vs `1052260` byte) → haze benar-benar terlukis. Menghapus bidang membuat predikat gagal (`[null] ≠ ['none']`). |
| 6 | Lima rute non-hero mempertahankan kotak chrome lama | **CONFIRMED** | `/loker` & `/public`: `height 224` (=`md:h-56`), `margin-top 24px` (=`mt-6`), `border-radius 32px` (`rounded-band`), `overflow: hidden`, `max-width 1280px` dengan `width 1265 < clientWidth 1280` (kartu inset `max-w-7xl`), `heroClasses: []`. Nol animasi `hero-drift` di subtree `/loker`. Mutation: menyuntik `.hero-band` ke `#asj-header` mengubah `224→820`, `hidden→clip` → asersi akan trip (punya gigi). `/share` in-place tanpa header & tanpa kelas hero. `/admin`, `/candidate` redirect ke `/` (dilaporkan, bukan diasersikan). |

---

## Serangan Spesifik yang Diminta

### A. Apakah `>= 2` distinct cukup membedakan "terikat-scroll" dari "bergerak sekali lalu berhenti"?
**Temuan:** threshold `>= 2` **lemah secara prinsip**, tetapi pada implementasi ini **tidak demostrabel buta**. Saya coba 4 varian rusak lewat intercept CSS:

| Varian | sweep penulis (8 titik) | sweep saya (121 titik) | maxValueShare |
|---|---|---|---|
| Terkirim (`cover` penuh) | 8 | **109** | 11% |
| `cover 0% cover 20%` | 1 | 1 | 100% |
| wrapper ber-`overflow:hidden` bersarang | 8 | 109 | 11% |
| `.hero-band` `overflow:hidden` (bug klaim) | 1 | 1 | 100% |

Setiap varian beku memberi verdict SAMA di kedua sweep (1 vs 1). Jadi `>= 2` **tidak** memberi false pass di sini. **Namun** `>= 2` tetap sinyal tipis: ia tidak bisa membedakan "meluncur mulus sepanjang halaman" dari "bergerak di 2 offset lalu plateau". Metrik diskriminator yang lebih kuat adalah **rasio plateau** (`maxValueShare`): 11% (sehat) vs 100% (beku). **Rekomendasi LOW:** naikkan threshold penulis dari `>= 2` ke minimal `>= 50% × jumlah sampel` DAN pakai `getAnimations()[0].currentTime` sebagai sinyal kedua — terbukti ada dan bekerja di sini (95 nilai unik / 101 sampel, monoton, reversibel).

### B. Apakah asersi `100svh` DAN `100vh` menjelaskan artefak terkirim atau intensi penulis?
**Temuan:** menjelaskan **artefak terkirim**. CSS terkirim (byte nyata):
```
.hero-band{min-height:100vh;overflow:clip}
@supports (height:100svh){.hero-band{min-height:100svh}}
@supports not (overflow:clip){.hero-band{overflow:hidden}}
```
Bentuk `@supports` inilah yang menyelamatkannya dari collapse minifier (bukan dua deklarasi dalam satu blok). CSSOM memuat ketiganya. `CSS.supports('height','100svh')` = true di engine ini. Klaim penulis benar bahwa bentuk `@supports` selamat "byte-identical"; yang perlu dicatat: klaim "duplikat akan dimakan minifier" adalah benar sebagai *alasan historis*, tetapi pada build ini yang dikirim memang dua aturan terpisah, bukan duplikat — jadi CONFIRMED, dengan koreksi bahwa fallback `100vh` hidup di blok yang sama dengan `overflow:clip` (yang punya `overflow:hidden` sendiri lewat `@supports not (overflow:clip)`).

### C. Perbandingan dua-sumbu (x DAN y)
**Temuan:** semua perbandingan geometri saya dua-sumbu. Edge-to-edge dibandingkan via `left/right/width` band vs `left/right/width` **body** pada kedua sumbu. Klip diuji dengan sampel titik di luar keempat sisi band: titik di luar kanan (`x = bandRight+4`) tidak mengenai bidang mana pun; titik di bawah band (`y = bandBottom+4`) dan di dalam overhang haze kanan-atas keduanya mengenai `hero-band` → tidak ada bidang yang melukis keluar band pada sumbu x MAUPUN y. Tidak ada klaim tabrakan sumbu-tunggal.

### D. Bisakah asersi reduced-motion lolos secara vakum?
**Temuan:** TIDAK. Saya menghapus `.hero-art,.hero-haze` di halaman reduce dan menjalankan **predikat persis penulis** (`rmValues.length === 1 && rmValues[0] === 'none'`): hasil `{[null], pass: false}`. Bila bidang absen, `transform` bertipe `null` ≠ `'none'`, jadi asersi gagal — non-vakum. (Bonus: `sampleAt` penulis punya guard `el ? … : null`, aman.)

### E. Apakah probe penulis masih punya gigi? (mutation-test salinan)
Saya tidak menyentuh file tracked. Mutation dilakukan lewat **route intercept** pada CSS yang disajikan di runtime (bukan mengedit `e2e/measure-hero-parallax.mjs`). Hasil: mengubah `overflow:clip`→`hidden` mengubah verdict sweep secara dramatis (109→1), membuktikan harness dapat dibedakan; menyuntik `.hero-band` ke `#asj-header` mengubah box non-hero 224→820 (asersi klaim 6 akan trip). Harness punya gigi.

---

## Temuan yang Tidak Disebut Klaim

| Severity | Temuan | Bukti |
|---|---|---|
| **INFO** | `.avif` disajikan `application/octet-stream` oleh `server.cjs` (MIME hanya punya `.webp`). Browser tetap mendekode via magic bytes (terbukti `imgComplete: true, naturalWidth: 1600, naturalHeight: 582`), jadi tidak ada regresi visual di preview lokal. Tetapi pada CDN/proxy dengan `X-Content-Type-Options: nosniff`, hero image bisa gagal. | `curl`: `ct=application/octet-stream, size=132856`; screenshot desktop menunjukkan artwork termuat. |
| **LOW** | `dist/sw.js` tetap placeholder Sep 22 ketika build dipanggil sebagai compiler telanjang. `npm run build` = `astro build && node scripts/build-sw-manifest.mjs`, jadi manifest precache PWA tidak di-regenerasi. Ini keterbatasan pemanggilan build, bukan cacat perubahan hero. | `dist/sw.js` mtime `Sep 22 18:15`, sedangkan semua aset lain `Sep 27 12:18`. |
| **LOW** | Threshold `>= 2` pada sweep penulis secara prinsip tidak bisa membedakan gerak-mulus dari gerak-2-titik; pada implementasi ini kebetulan cukup, tetapi rapuh terhadap refactor range. | Tabel di bagian A; metrik plateau 11% vs 100%. |
| **INFO** | Hero tidak memuat CTA/link apa pun di baris copy (hanya 3 pill non-`<a>`). Ini konsisten dengan ruling owner ("`/` bukan job board"), bukan bug — tetapi perlu dicatat bahwa probe penulis tidak menguji keberadaan CTA karena memang tidak ada. | `band.querySelectorAll('a')` = `[]` di 390×844; h1 terlihat pada `top 294, bottom 367 < vh 844`. |

---

## Catatan Metodologi (mengapa verdict ini kredibel)

1. **Sinyal kedua independen.** Selain himpunan transform, saya ekstraksi `translateY` numerik dari matriks dan `animation.currentTime` dari `getAnimations()`. Ini memberi kurva monoton & uji reversibilitas — bukan sekadar pencacahan string.
2. **Sweep 121 titik** (setiap 1% × [0..1.20]) menggantikan sweep 8 titik `[0,0.15,…,1.05]` penulis. Di luar/tepi `animation-range` nilai memang dijepit; sweep halus + monotonisitas menangkap plateau.
3. **Mutation-test pada artefak runtime**, bukan pada probe. `clip→hidden` = 109→1 adalah bukti positif bahwa verdict CONFIRMED bermakna.
4. **Non-vakum diuji eksplisit** untuk asersi reduced-motion (hapus bidang → predikat gagal) dan untuk klaim 6 (suntik `.hero-band` → box berubah).
5. **Build lebih dulu, server sesudah**, port dibaca dari stdout server (4321). `dist/` tidak basi saat diukur.

## Keterbatasan

- `svh` dan `vh` **tidak bisa dibedakan** di headless Chromium (keduanya resolve ke tinggi viewport yang sama, tanpa chrome). Yang saya verifikasi adalah **token terspesifikasi** (`100svh` ada di CSSOM & tersintesis) dan alasan klaimnya — bukan perilaku on-device Safari/Chrome mobile, yang butuh perangkat nyata.
- `getAnimations()` mengembalikan `currentTime` sebagai `CSSNumericValue` (bukan number); probe pertama saya salah-serialisasi sebagai `{}`. Terkoreksi di probe kedua dengan membaca `.value`.
- Bundle font diukur dari ukuran file on-disk (`21032` / `18336` byte), bukan dari devtools transfer-size.

## Rekomendasi

1. **(INFO)** Tambahkan `.avif: 'image/avif'` ke `MIME` di `server.cjs` (dan idealnya plumb ke `_headers`/netlify) agar tidak bergantung pada sniffing magic bytes.
2. **(LOW)** Perkuat gate parallax penulis: ganti `>= 2` distinct dengan metrik plateau (`maxValueShare <= 0.5`) dan tambahkan asersi `currentTime` monoton + reversibel. Ini menutup blind spot "bergerak-2-titik" tanpa biaya besar.
3. **(LOW)** Jalankan `npm run build` (bukan compiler telanjang) sebelum preview agar `dist/sw.js` konsisten dengan aset lain.
4. **Tidak ada tindakan** untuk klaim 1–6: semuanya terverifikasi apa adanya.

---

### Perintah reproduksi
```
# build dulu
cd F:/astro && node node_modules/astro/astro.js build
# server (baca port dari stdout)
node server.cjs          # -> http://localhost:4321
# probe independent (di luar repo)
BASE_URL=http://127.0.0.1:4321 node F:/tmp/qa-hero-independent.mjs --json
BASE_URL=http://127.0.0.1:4321 node F:/tmp/qa-hero-ct.mjs        # sinyal currentTime
BASE_URL=http://127.0.0.1:4321 node F:/tmp/qa-hero-mutation.mjs # mutation clip->hidden
BASE_URL=http://127.0.0.1:4321 node F:/tmp/qa-hero-vacuous.mjs   # non-vakum reduce
BASE_URL=http://127.0.0.1:4321 node F:/tmp/qa-hero-teeth.mjs     # teeth klaim 6 + klip 2-sumbu
```
Probe lengkap: `F:/tmp/qa-hero-independent.mjs`, `qa-hero-probe2.mjs`, `qa-hero-ct.mjs`, `qa-hero-mutation.mjs`, `qa-hero-mut4.mjs`, `qa-hero-vacuous.mjs`, `qa-hero-teeth.mjs`. Bukti JSON mentah: `F:/tmp/qa-hero-out.json`. Screenshot: `F:/tmp/hero-desktop-fold.png`, `F:/tmp/hero-mobile-fold.png`.
