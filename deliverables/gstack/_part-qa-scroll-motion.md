# Bagian `qa-lead` — verifikasi adversarial commit `e72b481` (lapisan motion scroll-linked)

Repo `F:/astro`, commit **`e72b481`** (`feat(motion): add a scroll-LINKED layer…`, 3 berkas, +154 −4).
Verifikator: `qa-lead`. Metode: **bukan** menjalankan ulang skrip penulis — skrip pengukuran ditulis
dari nol (`.tmp-qa-scroll/verify.mjs`, `.tmp-qa-scroll/verify2.mjs`), ditargetkan untuk MEMBANTAH
tiap klaim. Engine: Playwright Chromium **151.0.7922.34** (`CSS.supports('animation-timeline: view()')`
= `true`). Server: `http://127.0.0.1:4321` (menyajikan `dist/` yang dibangun ulang dari HEAD).

**Tidak ada yang di-push.** `origin/main` tetap `4251b09`; HEAD `e72b481`; `git rev-list --left-right
--count origin/main...HEAD` = `0  4`. Tiga berkas yang di-commit **tidak saya sentuh** (`git diff HEAD`
kosong untuk ketiganya). `indexer/validate-report.json` saya biarkan.

---

## 0. Ringkasan vonis

| Klaim | Vonis | Angka kunci |
|---|---|---|
| **C1** `overflow: hidden` mengunci timeline, `clip` tidak | **CONFIRMED** | clip → 6 nilai; hidden → **1 nilai** (beku di `32.239` = ujung range); scroll → 1 nilai |
| **C2** drift bervariasi dengan scroll & reversible | **CONFIRMED** | `#penempatan` travel **64.5px**, 6 nilai; `#lokasi` travel **48.3px**, 6 nilai; keduanya **reversible persis** |
| **C3** hover zoom utuh | **CONFIRMED** (dengan koreksi angka) | galeri 8 & layanan 3 & program 3 → semua `matrix(1.05,…)`; `#fasilitas` **0 gambar** |
| **C4** reduced-motion inert, tidak ada yang tertinggal | **CONFIRMED** | `animationName:none`, `transform:none`, `opacity:1`; translateY 1 nilai (0); slack 55.55/55.56 |
| **C5** tidak ada overflow horizontal di lebar apa pun | **CONFIRMED** | `overflowX=-15px` di 390/1280/1280×500/1280×2400/640; drift menyumbang **0** overflow |
| **C6** crop 14% (di semua browser) | **CONFIRMED & JINAK** | crop ~12% total/dimensi; yang terpotong hanya langit/air/siluet — **tidak ada wajah, teks, atau logo** |
| **C7** gate `check-keyframes` bisa GAGAL | **CONFIRMED** | 3 mutasi → exit 1; tapi 1 mutasi lolos (blind spot prefiks, lihat §7) |
| **C8** komposisi dengan §9b | **CONFIRMED** | transform seksi TIDAK menggeser drift (nilai identik) → independen, tidak ada snap |

Gate: `tsc` 0 · `verify:classes` 0 · `lint-ratchet` 0 · `check-keyframes` 0 · `build` 0 ·
`vitest` 3 merah (semua EBUSY, lingkungan) · **e2e 8/8 exit 0**.

---

## 1. C1 — `overflow: hidden` membekukan `view()`, `clip` tidak — **CONFIRMED**

Injeksi style ke `.u-drift-frame` (via `!important`), sampel `translateY` di 9 offset scroll yang sama:

```
[shipped (overflow:clip)]                  distinct=6/9  −32.239, −32.239, −26.508, −10.801, 5, 20.707, 32.239, 32.239, 32.239
[injected overflow:hidden]                 distinct=1/9  32.239, 32.239, 32.239, 32.239, 32.239, 32.239, 32.239, 32.239, 32.239
[injected overflow:scroll]                 distinct=1/9  32.239, ×9
[injected overflow:visible;contain:paint]  distinct=6/9  −32.239, −32.239, −26.508, −10.801, 5, 20.707, 32.239, 32.239, 32.239
```

- `hidden` **dan** `scroll` sama-sama membekukan; nilainya `32.239` = nilai `to` dari keyframe
  (timeline ter-clamp di ujung, karena subject selalu "sudah lewat" scrollport-nya sendiri). Klaim
  penulis terkonfirmasi apa adanya.
- **Temuan independen:** `overflow: visible; contain: paint` **tetap menghidupkan timeline** (6 nilai)
  **dan tetap meng-clip** — screenshot elemen `contain:paint` = 1.118.510 byte vs `clip` = 1.119.133 byte
  (praktis identik). Jadi `clip` bukan satu-satunya nilai yang bisa dipakai; `contain: paint` setara.
  **Tapi tidak ada fix yang lebih sederhana:** `overflow: clip` sudah nilai minimal (satu kata), dan
  `contain: paint` lebih rumit. Jadi jawabannya: **tidak ada fix lebih sederhana yang tersedia.**

## 2. C2 — drift sebagai fungsi scroll, dan reversible — **CONFIRMED**

Sampel di 9 offset, settle double-rAF, lalu sapuan mundur di offset yang sama. Sinyal kedua (independen
dari transform): `getAnimations()[0].currentTime` pada timeline `view()`.

`#penempatan` (frame 1215×810, img 921px = 1.137×):

```
scrollY   translateY   animTime(currentTime)   topSlack  botSlack
  6771     −32.239     −11.37                    87.79     23.32
  7039     −26.508       3.35                    82.05     29.06
  7206     −10.801      12.52                    66.35     44.76
  7374       5.000      21.74                    50.55     60.56
  7541      20.707      30.91                    34.84     76.27
  7709      32.239      37.64                    23.31     87.80
=> 6 nilai berbeda / 9 offset; travel 64.5px; min slack 23.31px (>=0 = TERTUTUP)
=> mundur: 32.239 → 32.239 → 32.239 → 20.707 → 5 → −10.801 → −26.508 → −32.239 → −32.239
=> REVERSIBLE (nilai identik, offset identik)
```

`#lokasi` (frame 1215×608, img 690px = 1.136×): 6 nilai, `−24.159 … 24.159`, travel **48.3px**,
min slack **17.22px**, **reversible**. Persis angka penulis.

**Catatan keabsahan (peringatan brief):** penulis sebelumnya pernah salah mengukur karena membaca
setelah animasi "selesai". Di sini bahaya itu tidak berlaku, dan saya membuktikannya: nilai `translateY`
**berubah** antar offset setelah settle, dan `animation.currentTime` ikut berubah (bukan konstanta).
Animasi **sekali-jalan** akan lulus sapuan maju tetapi gagal sapuan mundur — di sini sapuan mundur
mengembalikan nilai identik. Jadi pengukuran ini sah, bukan artefak "sudah settle".

## 3. C3 — hover zoom `.u-zoom` utuh — **CONFIRMED (angka penulis perlu dikoreksi)**

`.u-zoom` dipicu `.group:hover .u-zoom` (§9c). Diukur rest vs hover pada tiap keluarga:

| Keluarga | Selector | n | rest | hover | vonis |
|---|---|---|---|---|---|
| Galeri | `#galeri img.u-zoom` | **8** | `none` | `matrix(1.05,0,0,1.05,0,0)` | OK → scale 1.05 |
| Banner layanan | `#layanan img.u-zoom` | **3** | `none` | `matrix(1.05,…)` | OK |
| Tile program | `#program img.u-zoom` | **3** | `none` | `matrix(1.05,…)` | OK |
| Tile fasilitas | `#fasilitas img.u-zoom` | **0** | — | — | tidak ada gambar |

- Dua banner drift membawa **0** `.u-zoom` → pengecualiannya sah, tidak ada tabrakan `transform`.
- **Koreksi:** penulis menulis "9 foto galeri" dan "~8 tile fasilitas". Nyatanya galeri **8** yang
  dirender (`gallery.ts` punya 8 entri; prosa "Nine genuine photographs" di kepala berkas sudah basi
  sejak satu entri dihapus 2026-09-23), dan `#fasilitas` **tidak merender gambar sama sekali**
  (tile FACILITIES murni ikon). Instans `IconTileGrid` yang memang ber-`img.u-zoom` adalah `#program`
  (3). Ini ketidaktepatan prosa, bukan cacat kode.

## 4. C4 — `prefers-reduced-motion: reduce` inert — **CONFIRMED**

Konteks `reducedMotion:'reduce'`, `matchMedia(...).matches = true`.

```
#penempatan .u-drift  animationName=none  animationTimeline=auto  transform=none  opacity=1  visibility=visible  filter=none
#lokasi     .u-drift  animationName=none  animationTimeline=auto  transform=none  opacity=1  visibility=visible  filter=none
#penempatan frame 1215x810  img 1213x921  topSlack 55.55  botSlack 55.56  overflow=clip
#lokasi     frame 1215x608  img 1213x690  topSlack 41.38  botSlack 41.39  overflow=clip
section #penempatan  1265x1314  opacity=1  clipPath=none  transform=none
section #lokasi      1265x1010  opacity=1  clipPath=none  transform=none
translateY di 9 offset => distinct=1, nilai semua 0   (TIDAK bergerak saat scroll)
overflowX = −15px
```

Angka slack identik dengan penulis (55.55/55.56). Yang menyelamatkan memang `animation: none`
(nama kosong), bukan durasi — clamp global `*{animation-duration:0.01ms !important}` di `global.css:1343`
tetap menimpa durasi, tetapi tidak menyentuh `animation-name`. Terkonfirmasi.

## 5. C5 — overflow horizontal — **CONFIRMED**

```
390x844                      overflowX=−15px   frame #penempatan 17..358   #lokasi 17..358
1280x900                     overflowX=−15px   frame 25..1240
1280x500  (pendek)           overflowX=−15px   frame 25..1240
1280x2400 (sangat tinggi)    overflowX=−15px   frame 25..1240
640x900   (proksi 200% zoom) overflowX=−15px   frame 17..608
```

**Tambahan yang penulis tidak uji:** `font-size:32px` (teks 200%) → `overflowX=180px`. Tetapi
**bukan dari drift**: pelakunya elemen `<NAV class="u-viewport-fixed--right z-drawer w-72 md:w-96 …">`
(drawer off-canvas, `l=1280 r=2048`). Bukti atribusi:

```
200% teks: overflowX withDrift=180   withDriftDisabled=180   ← identik saat seluruh lapisan drift dimatikan
drift-frame descendants exceeding viewport: []             ← frame & img tidak pernah melebihi viewport
```

Jadi drift menyumbang **0** overflow; 180px itu perilaku drawer yang sudah ada sebelum commit ini.
Slack di 200% teks: top 84.27 / bot 22.35 → foto masih tertutup penuh.

## 6. C6 — crop 14% pada dua foto nyata — **CONFIRMED & JINAK (ini temuan yang penulis tak bisa cek sendiri)**

Diukur dari geometri render (`naturalWidth/Height` + kotak elemen + kotak frame + `object-fit: cover`):

```
#penempatan  natural 1200x800  coverScale 1.1514  terlihat 87.94% tiap dimensi
             crop kiri 6.03%  kanan 6.03%  atas 2.53%  bawah 9.53%   (nilai atas/bawah bergeser dgn scroll)
#lokasi      natural 1200x600  coverScale 1.1504  terlihat 88.01%
             crop kiri 6.00%  kanan 6.00%  atas 9.49%  bawah 2.50%
```

Crop horizontal **tetap 6% per sisi**; crop vertikal **bergeser** antara (2.5%/9.5%) dan (9.7%/2.4%)
karena `translateY` menggeser kotak img. Total ~12% per dimensi (penulis menyebut "14%" = faktor skala
114%; deskripsi "14% lebih tinggi" kurang presisi, tetapi substansinya benar: crop ada di SEMUA browser,
termasuk tanpa dukungan scroll-timeline, karena over-size berada DI LUAR `@supports`).

**Saya membuka kedua foto sumber DAN kedua screenshot hasil render.** Yang terpotong:

- **`#penempatan`** (foto Fuji + danau): **puncak Fuji utuh**, **angsa utuh** (kepala, paruh merah, badan —
  semuanya di dalam frame), **dua bebek utuh**, rumah-rumah di kanan utuh. Yang terpotong hanya langit
  (atas), air/pantai berbatu (bawah), dan tepi hutan/lereng (kiri-kanan). **Tidak ada wajah, teks, atau
  logo.**
- **`#lokasi`** (ilustrasi flat Fuji + skyline): Fuji dan gedung-gedung utuh; yang terpotong hanya langit
  merah muda (atas), latar ungu kosong (bawah), dan tepi luar siluet gedung dekoratif. **Tidak ada wajah,
  teks, atau logo.**

**Vonis: crop ini jinak — bukan cacat.** Tidak ada objek yang hilang. (Gap jujur #4 penulis — "tidak
membuka `#tentang`" — saya tutup: `#tentang` memakai `fasilitas-gedung.webp`, foto ~20 orang berbatik;
saya buka, dan benar bahwa crop orang tidak boleh diterapkan — pengecualiannya tepat. Foto itu memang
tidak disentuh commit ini.)

## 7. C7 — gate `check-keyframes.mjs` (+5 baris) bisa GAGAL — **CONFIRMED, dengan 1 blind spot**

Diuji pada **salinan scratch** (`src/styles/*.css` disalin; gate dijalankan dari cwd scratch) — pohon
asli tidak pernah dimutasi.

| Mutasi | Perubahan | Exit | Pesan |
|---|---|---|---|
| baseline | — | **0** | `OK: 14 keyframes defined, 12 references, all resolve.` |
| A | `@keyframes drift-lag` → `drift-lagX` (referensi utuh) | **1** | `FAIL: drift-lag (motion.css:939)` — referenced but never defined |
| B | referensi `drift-lag` → `drift-typo` (definisi utuh) | **1** | `FAIL: drift-typo (motion.css:939)` |
| C | hapus `"drift-"` dari `OUR_PREFIXES` | **1** | `FAIL: @keyframes … this gate cannot scan for: drift-lag` |
| D | referensi → `drfit-lag` (tipografi merusak prefiks) | **0** | **LOLOS** |

- **A, B, C membuktikan gate bisa merah** untuk tiga mode kegagalan yang relevan. Mutasi **C** khusus
  membuktikan +5 baris itu **load-bearing**: tanpa `"drift-"` gate langsung merah.
- **D adalah blind spot:** tipografi yang sekaligus merusak prefiks (`drfit-lag`) tak terlihat oleh gate
  (nama tidak cocok prefiks apa pun, sehingga baik cek "missing" maupun "unreachable" lewat). Ini
  keterbatasan inheren desain daftar-prefiks — sudah didokumentasikan di header gate sendiri — bukan
  cacat dari +5 baris ini. Tetap layak dicatat sebagai batas proteksi.
- Pohon asli dipulihkan byte-identik: `git diff HEAD -- scripts/ci/check-keyframes.mjs` kosong.

## 8. C8 — komposisi dengan §9b — **CONFIRMED (independen, tanpa snap)**

`#penempatan` `enter="slide-right"` (translateX 48px→0), `#lokasi` `enter="rise"` (translateY 24px→0).
Keduanya menganimasikan `transform` pada SEKSI; drift menganimasikan `transform` pada img di dalamnya.

Uji langsung umpan-balik: paksa transform seksi ke keadaan-awal entrance, baca drift pada `scrollY` tetap:

```
#penempatan (slide-right): scrollY=7269  drift(seksi normal)=−4.875   drift(seksi dipaksa translate3d(48px,0,0))=−4.875   => NO feedback
#lokasi      (rise):       scrollY=11603 drift(seksi normal)=−7.526   drift(seksi dipaksa translate3d(0,24px,0))=−7.526   => NO feedback
```

Jadi range `view()` drift dihitung dari kotak **tak-ter-transform** — entrance tidak menggeser drift,
drift tidak menggeser entrance. Keduanya independen. Trace masuk-penuh (24 frame scroll): `imgTy`
kontinu (clamp → linear), tanpa lonjakan. (Flag "POSSIBLE SNAP" di harness adalah false positive:
median delta = 0 karena ada 13 frame diam, sehingga 3×0.5 ambang salah menandai lonjakan linear 2.07px.)
Tidak ada snap, tidak ada gerak ganda.

## 9. Gate — exit code masing-masing

| Gate | Exit | Bukti |
|---|---|---|
| `tsc --noEmit -p tsconfig.json` | **0** | 9s, tanpa output |
| `verify-classes.mjs` | **0** | 1205 token / 219 berkas / 1539 selector |
| `lint-ratchet.mjs` | **0** | 2461 vs baseline 2475 — **debt −14**; `motion.css 13→12` |
| `check-keyframes.mjs` | **0** | 14 keyframes / 12 referensi |
| `npm run build` (`CODEBUDDY_SAFE_DELETE_ENABLED=0`) | **0** | 11 halaman, 14.56s + sw-manifest (`asj-astro-d5b6b6d9f8ad`) |
| `vitest run` | **1** | **3 failed / 164 passed (167 berkas)**, **3 failed / 1967 passed (1970 tes)** |
| `e2e:landing` | **0** | 14 spec sections × 2 lebar, termasuk "section entrance matches sectionMotion.ts" |
| `e2e:headings` | **0** | termasuk "h1 ada di SERVER HTML (no-JS)" |
| `e2e:public` | **0** | |
| `e2e:loker-layout` | **0** | termasuk "390px tidak overflow" |
| `e2e:dialog` | **0** | 17/17 |
| `e2e:drawer` | **0** | 7/7 |
| `e2e:labels` | **0** | 4/4 |
| `e2e:theme-gradients` | **0** | 3/3 |

### 9.1 3 merah vitest = EBUSY lingkungan, BUKAN dari perubahan ini

Ketiga merah semuanya kegagalan **spawn subproses**:

```
FAIL indexer/src/boundary.test.ts:319    → cruise.status null (spawn dependency-cruiser)
FAIL indexer/src/discover.test.ts:52     → Error: spawnSync cmd.exe EBUSY   (execSync 'git ls-files --deleted')
FAIL netlify/functions/_lib/fcm-server.test.ts:389 → ignored() false karena execFileSync('git') gagal
```

Bukti bahwa ini lingkungan (probe paling telanjang, di luar vitest):

```
$ node -e "spawnSync(process.execPath,['-e','console.log(1)'])" → status=null err=EBUSY
$ node -e "execSync('git rev-parse HEAD')"                      → EXEC FAIL err=EBUSY  msg="spawnSync C:\WINDOWS\system32\cmd.exe EBUSY"
```

`node` **tidak bisa** men-spawn proses anak apa pun di sandbox ini (bahkan `node -e "console.log(1)"`),
sementara tool bash bisa menjalankan `git` normal. Ketiga berkas yang merah berada di `indexer/` dan
`netlify/functions/` — **tak satu pun** disentuh commit ini (yang menyentuh `src/styles/motion.css`,
`src/pages/index.astro`, `scripts/ci/check-keyframes.mjs`), dan tak satu pun memanggil animasi/drift.
Jumlah 167 berkas / 1970 tes persis seperti yang diharapkan. **Terkonfirmasi lingkungan.**

---

## 10. Cacat & catatan yang saya temukan

1. **[LOW — bernalar, tidak terukur] `overflow: clip` tanpa fallback untuk browser tua.**
   `src/pages/index.astro:425` dan `:802` mengganti `overflow-hidden` → `overflow-clip`. Di browser
   yang mendukung `overflow: hidden` tetapi **belum** `overflow: clip` (Safari ≤15, sebelum Sep 2022),
   frame menjadi `overflow: visible`; karena img `height:114%; top:-7%; position:absolute`, foto
   meluber ~7% ke atas & bawah frame dan melewati sudut `rounded-panel` — regresi visual vs build
   sebelumnya. **Saya tidak bisa mengukurnya** (tak ada engine Safari lama di sini); ini penalaran dari
   CSS. **Saran:** tambahkan `overflow: hidden;` **sebelum** `overflow: clip;` di aturan `.u-drift-frame`
   (`motion.css` §9d) — engine modern tetap memakai `clip` (deklarasi terakhir menang, timeline aman),
   engine lama jatuh ke `hidden`.
2. **[INFO — prosa] Angka di laporan penulis kurang tepat.** "9 foto galeri" → nyatanya **8** dirender;
   "~8 tile fasilitas" → `#fasilitas` **0 gambar**, yang ber-`.u-zoom` adalah `#program` (3);
   pesan commit menyebut "12% vertical over-size" di satu tempat padahal over-size-nya **14% (114%)**.
   Tidak memengaruhi kode yang dikirim.
3. **[INFO — batas gate] Blind spot prefiks.** Tipografi yang merusak prefiks (`drfit-lag`) lolos gate
   (mutasi D). Inheren pada desain daftar-prefiks; bukan cacat perubahan ini.

## 11. Gap jujur — yang saya TIDAK bisa verifikasi

1. **Firefox / Safari / perangkat nyata tidak diukur.** Hanya Chromium 151 di sini. Klaim dukungan
   `view()` (Firefox 144+/Safari 26) **tidak** saya verifikasi di engine itu. Yang **bisa** diklaim:
   tanpa dukungan, blok `@supports` di-skip dan layout statis geometris identik (terukur statis).
2. **Regresi `overflow: clip` di browser tua** (cacat #1) adalah penalaran, bukan pengamatan.
3. **Biaya render / FPS di Android kelas bawah tidak diukur.** Model biayanya murah (hanya `transform`,
   tanpa `will-change`, tanpa properti layout/paint), tetapi itu klaim model, bukan pengukuran.
4. **Crop di browser tanpa scroll-timeline** disimpulkan dari CSS (over-size di luar `@supports`) dan
   konsisten dengan geometri statis terukur, tetapi tidak diamati di browser semacam itu.
5. **Foto `#tentang`**: saya buka (grup staf berbatik) dan pengecualiannya tepat — tetapi foto itu tidak
   pernah menerima crop, jadi tidak ada yang perlu diukur di sana.

---

### Lampiran — berkas bukti
- `.tmp-qa-scroll/verify.mjs` (C1/C2/C3/C4/C5/C6/C8) — output dijalankan penuh di laporan ini.
- `.tmp-qa-scroll/verify2.mjs` (C8 umpan-balik, C5b atribusi overflow, C1b `contain:paint`, C3b program).
- `.tmp-qa-scroll/gate-scratch/` (baterai mutasi C7; pohon asli tak tersentuh).
- `.tmp-qa-scroll/rendered-penempatan.png`, `rendered-lokasi.png` (hasil render untuk inspeksi mata).
- Semua di bawah `.tmp-*` (gitignored) — tidak di-commit.
