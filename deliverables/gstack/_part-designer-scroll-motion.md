# Bagian `designer` — lapisan motion yang TERIKAT ke scroll (scroll-linked)

Halaman company profile `F:/astro/src/pages/index.astro`. HEAD saat mulai: `ab34661`.
Yang dikerjakan: menambah **lapisan motion yang nilainya fungsi dari posisi scroll** —
bukan entrance sekali-jalan seperti `[data-reveal]` (§9) dan `[data-enter]` (§9b) yang
sudah ada, tapi gerak kontinu yang bisa dibalik (`scroll` naik → nilainya kembali).

**Hasil akhir: dua commit lokal.**
`e72b481` — `feat(motion): add a scroll-LINKED layer, on the two decorative banners only`,
3 berkas, `+154 −4` (`src/styles/motion.css`, `src/pages/index.astro`,
`scripts/ci/check-keyframes.mjs`).
`0943d8d` — `fix(motion): restore the overflow fallback the minifier was eating`, 1 berkas
(`src/styles/motion.css`, `+53 −4`), menutup cacat LOW dari QA (§2.4).
**Tidak di-push**: `git rev-list --left-right --count origin/main...HEAD` → `0  5`, dan
`origin/main` tetap di `4251b09`.

---

## 1. Keputusan desain

### 1.1 Yang DAPAT scroll-linked motion — dua foto, bukan dua puluh empat

| Elemen | Kenapa dia |
|---|---|
| Foto banner `#penempatan` (`aspect-[3/2]`, 1215×810 px @1280) | Dekoratif (`alt=""` + `aria-hidden="true"`), lebar penuh, tanpa hover |
| Foto banner `#lokasi` (`aspect-[2/1]`, 1215×608 px @1280) | Idem |

Keduanya memenuhi **tiga** syarat sekaligus:

1. **Cukup besar** supaya drift terbaca sebagai kedalaman. Tile 200px yang bergeser 30px
   itu kejang, bukan parallax.
2. **Murni dekoratif** — `alt="" aria-hidden="true"`, jadi over-size vertikal yang
   dibutuhkan drift tidak mungkin memotong orang dari frame.
3. **Tanpa pointer affordance** — ini syarat kerasnya, lihat §1.2.

### 1.2 Yang TIDAK dapat scroll-linked motion — dan alasannya satu, bukan selera

Kendala tabrakan `transform` yang kamu sebut di brief itu nyata dan saya hindari
**secara konstruksi**, bukan dengan wrapper:

- `.u-zoom` (§9c) menganimasikan `transform` lewat **transition**.
- CSS **animation** pada `transform` di elemen yang **sama** akan **menimpa transition**
  itu seluruhnya — hover zoom mati diam-diam, tidak ada error, tidak ada gate yang tahu.
- Karena itu **tidak ada satu pun elemen `.u-zoom` yang saya sentuh.** Terukur, jumlah
  gambar ber-`.u-zoom` di halaman ini **14**, bukan "~20": galeri **8**, `#program` **3**,
  banner layanan **3** (`GalleryGrid.tsx:55`, `IconTileGrid.tsx:107`,
  `LayananSection.astro:31/114/150`) — semuanya keluar dari cakupan.
  **Dua koreksi atas angka pertama saya** (dari QA, saya verifikasi ulang ke sumber):
  galeri itu **8**, bukan 9 — `GALLERY` punya 8 entri (`src/lib/gallery.ts:98–212`), dan
  komentar berkas itu sendiri menulis "Nine", yang **stale** (lihat §5 butir 7); dan
  **`#fasilitas` tidak punya gambar sama sekali** — 6 tile-nya murni ikon, tidak ada
  `image:` di `companyProfile.ts:327–367`, jadi yang ber-`.u-zoom` adalah **`#program`**
  (3), bukan fasilitas. Kesimpulannya tidak berubah: semuanya tetap di luar cakupan.

Konsekuensinya: **tidak perlu wrapper di atas `.u-zoom`**, karena saya memilih elemen yang
memang tidak punya `.u-zoom`. Jadi klaim "hover zoom masih jalan" itu bukan harapan — ia
konsekuensi dari tidak menyentuhnya, dan tetap saya ukur (§3.3).

Sisanya yang sengaja **tidak** disentuh:

| Kelompok | Jumlah | Alasan |
|---|---|---|
| `.u-zoom` (galeri 8, `#program` 3, banner layanan 3) | **14** | Tabrakan `transform` di atas |
| Tile QR kontak | 3 | Kecil + `.u-lift` (pointer-driven) |
| 14 band `<Section>` | 14 | Sudah dimiliki `[data-enter]` (§9b) — dua animasi `transform` di satu elemen akan saling menimpa |
| Kartu, `Card`, `FactList`, `CheckList`, `StepList` | ~60 | Sudah dimiliki `[data-reveal]` (§9); dan restraint |
| Foto `#tentang` (grup staf) | 1 | Over-size 14% akan memotong kepala/kaki dari foto orang — syarat (2) gagal |
| Hero `#atas` (island Preact) | 1 | Elemen LCP, di dalam island; `view()` di scroll 0 sudah melewati separuh range-nya. Risiko tanpa imbalan |
| `.accent-line` | 1 | Tinggi 3px → `view()` range-nya 3px scroll. Butuh `cover` range, dan efeknya cuma garis tumbuh |

Dasar "sedikit": **MotionKit, Web Animation Trends 2026** — *"autoplaying entrance
animations on everything reads as dated"*. Restraint, bukan kuantitas. Halaman ini sudah
punya 14 entrance + ~60 reveal; yang kurang cuma **gerak kontinu**. Jadi lapisan ini
sengaja **dua elemen, satu resep**.

### 1.3 Resepnya

```
frame  (aspect-ratio + overflow: clip)   ← tidak pernah bergerak, dia yang meng-clip
  img  (absolute, 114% tinggi, top -7%)  ← ini yang bergerak, translateY ±3.5% dari
                                            tinggi dirinya sendiri
```

- **±3.5% dari tinggi gambar**, bukan px → skalanya ikut ukuran frame.
- Desktop: **64.5px** total travel (`#penempatan`), **48.3px** (`#lokasi`) — di dalam
  band 40–80px yang Framer sebut batas terbaca.
- Mobile 390px: **18px** — kalau absolut, 64px di layar 390px akan terlihat brutal.
- Arah: gambar **tertinggal** (slide ke bawah di dalam frame saat frame naik) = terbaca
  sebagai lebih jauh. Satu arah untuk keduanya, supaya konsisten.

---

## 2. Implementasi

Tiga berkas berubah:

```
src/styles/motion.css             +145 baris  §9d SCROLL-LINKED DRIFT
src/pages/index.astro             ±8 baris    dua frame banner
scripts/ci/check-keyframes.mjs    +5 baris    prefix "drift-"
```

### 2.1 Dua aturan yang "menggigit" — keduanya saya patuhi dan saya buktikan

```css
@supports (animation-timeline: view()) {
  .u-drift {
    --drift: 3.5%;
    animation: drift-lag linear both;   /* shorthand DULU */
    animation-duration: auto;           /* waktu tidak berarti di scroll timeline */
    animation-timeline: view();         /* shorthand mereset ini ke `auto` → harus SESUDAH */
    animation-range: entry 25% cover 50%;
  }
}
```

- `animation-timeline` **bukan** bagian dari shorthand `animation`, dan shorthand
  meresetnya ke `auto` (= timeline dokumen). Urutannya adalah inti blok ini.
- `animation-duration: auto` wajib.
- Semua yang membuat banner **bergerak** ada di dalam `@supports`. Yang membuatnya
  **terlihat benar** ada di luar. Jadi browser tanpa dukungan dapat layout statis, bukan
  setengah-terpasang.

### 2.2 Temuan yang gagal SENYAP kalau tidak diukur: `overflow: hidden` mematikan timeline

`animation-timeline: view()` diselesaikan terhadap **scroll container terdekat dari
SUBJECT**. `overflow: hidden` **membuat** scroll container (itu satu-satunya bedanya
dengan `clip`). Jadi dengan `hidden`, scrollport foto adalah frame-nya sendiri — kotak
yang tidak pernah ia bergerak relatif terhadapnya — dan timeline-nya **beku**. Stylesheet
tetap terlihat benar.

`overflow: clip` meng-clip piksel yang persis sama dan **tidak** membuat scroll container,
jadi scroll container subject tetap dokumen.

Ini diukur **dua arah** (§3.4): dengan `clip` nilai `translateY` berubah; dengan `hidden`
disuntikkan, bacaan yang sama **konstan**.

### 2.3 `check-keyframes.mjs` — kenapa gate-nya ikut diubah

Gate itu punya pemeriksaan `unreachable`: **setiap** `@keyframes` yang namanya tidak
cocok dengan `OUR_PREFIXES` adalah **error**, karena referensinya tak terlihat oleh
pemeriksaan utama. Pesan errornya sendiri menyuruh menambah prefix. Jadi
`drift-lag` + `"drift-"` masuk ke daftar, dengan komentar. Tanpa ini
`verify:keyframes` merah.

### 2.4 Fallback `overflow: hidden` — dan kenapa bentuk yang diminta TIDAK BISA dipakai apa adanya

QA menemukan cacat LOW yang nyata: `overflow: clip` tidak dikenal Safari ≤15, dan sebuah
**value** yang tidak dikenal dibuang saat parse — jadi di sana frame jatuh ke
`overflow: visible`, dan `<img>` yang `height: 114%; top: -7%; position: absolute`
meluber ~7% keluar frame, melewati sudut `rounded-panel`. Diagnosis QA benar.

Perbaikan yang diminta — dan yang intuitif — adalah dua deklarasi dalam satu blok:

```css
.u-drift-frame { position: relative; overflow: hidden; overflow: clip; }
```

**Bentuk itu tidak boleh dipakai, karena tidak sampai ke produksi.** `lightningcss` —
minifier CSS di toolchain ini — **membuang deklarasi pertama** dan menyisakan
`overflow: clip`. Terukur, dua cara:

1. langsung pada minifier-nya:

   ```
   input : .u-drift-frame{position:relative;overflow:hidden;overflow:clip}
   output: .u-drift-frame{position:relative;overflow:clip}      <-- fallback HILANG
   ```

   Dan ia melakukannya **bahkan dengan `targets: { safari: 15 }`** — yaitu saat diberi
   tahu eksplisit bahwa target-nya tidak bisa mem-parse `clip`. Dua rule terpisah
   (`.u-drift-frame{overflow:hidden}` lalu `.u-drift-frame{overflow:clip}`) **digabung
   dan di-strip dengan cara yang sama**.

2. pada build yang sesungguhnya. Setelah saya menulis bentuk dua-deklarasi itu dan
   menjalankan `npm run build`, **hash aset CSS-nya tidak berubah**: `sw-manifest` tetap
   melaporkan `asj-astro-d5b6b6d9f8ad`, byte CSS **identik** dengan sebelum perbaikan.
   Build sukses, exit 0, dan perbaikannya tidak ada di sana. Itu definisi cacat yang
   gagal senyap — persis kelas yang sama dengan `overflow: hidden` di §2.2, tapi kali ini
   yang menyembunyikannya adalah toolchain-nya sendiri, bukan engine-nya.

Bentuk yang **lolos** minifier adalah blok `@supports` terpisah, dan itu yang dipakai:

```css
.u-drift-frame { position: relative; overflow: clip; }
@supports not (overflow: clip) { .u-drift-frame { overflow: hidden; } }
```

Terukur lolos byte-identik untuk kedua target. Setelah bentuk ini hash SW berubah
(`d5b6b6d9f8ad` → `a27225947a82`) — jadi kali ini perbaikannya **memang** ada di `dist/`.

Kenapa fallback-nya aman dan tidak mengembalikan timeline ke keadaan beku: di browser
yang tepat itu `animation-timeline: view()` juga tidak didukung, jadi tidak ada scroll
timeline yang bisa dikunci oleh scroll container milik `hidden`. Keduanya hanya berlaku
terpisah. Itu pula sebabnya `@supports not (…)` lebih aman daripada
`@supports (…)`-sebagai-enhancement: kalau toolchain suatu saat membuang bloknya, kita
kembali ke keadaan sebelum perbaikan (spill di Safari lama), **bukan** ke timeline yang
beku di browser modern. Hasil verifikasinya di §3.7.

---

## 3. Bukti terukur (bukan klaim)

Server: `http://127.0.0.1:4321` (`node server.cjs`, menyajikan `dist/` yang baru dibangun).
Mesin: Playwright Chromium, `--no-proxy-server`. Skrip pengukurnya ada di Lampiran A.

### 3.1 Apa animasinya terikat ke (computed, 1280px, motion ON)

```
#penempatan .u-drift                        #lokasi .u-drift
  animationName          drift-lag            animationName          drift-lag
  animationTimeline      view()               animationTimeline      view()
  animationRange         entry 25% cover 50%  animationRange         entry 25% cover 50%
  animationDuration      auto                 animationDuration      auto
  animationTimingFunction linear              animationTimingFunction linear
  animationFillMode      both                 animationFillMode      both
  driftVar               3.5%                 driftVar               3.5%
  frameOverflow          clip                 frameOverflow          clip
  framePosition          relative             framePosition          relative
  frameAspect            3 / 2                frameAspect            2 / 1
  imgPosition            absolute             imgPosition            absolute
  imgHeight              921.109px            imgHeight              690.156px
  imgTop                 -56.5469px           imgTop                 -36.3281px
  imgObjectFit           cover                imgObjectFit           cover
```

`imgTop = -7% dari padding box` dan `imgHeight = 114%` → persentasenya benar-benar
diresolusi (bukan `auto`), jadi over-size bekerja seperti yang dihitung.

### 3.2 Sampel di TENGAH scroll — inilah inti scroll-LINKED

`#penempatan` — frame 1215×810, img 921px (1.137×), viewport 900px:

```
 scrollY   translateY   topSlack  botSlack  frameTop
    6872      -32.24      87.79     23.32       837     ← sebelum range (clamp)
    7039      -26.51      82.05     29.06       670
    7207      -10.71      66.25     44.86       502
    7374           5      50.55     60.56       335     ← tengah range
    7542        20.8      34.75     76.36       167
    7709       32.24      23.31      87.8         0     ← akhir range (cover 50%)
    7876       32.24      23.31      87.8      -167     ← setelah range (clamp)
  => 6 nilai translateY berbeda di 7 offset; slack minimum 23.31px => TERTUTUP penuh
  => scroll balik ke atas: 32.24 → 32.24 → 20.8 → 5 → -10.71 → -26.51 → -32.24
     — REVERSIBLE (nilai identik, offset identik)
```

`#lokasi` — frame 1215×608, img 690px (1.135×):

```
 scrollY   translateY   topSlack  botSlack  frameTop
   11248      -24.16      65.53     17.23       909
   11430      -20.95      62.33     20.44       727
   11611       -6.91      48.28     34.49       546
   11793        7.22      34.15     48.61       364
   11975       21.35      20.03     62.74       182
   12157       24.16      17.22     65.55         0
   12339       24.16      17.22     65.55      -182
  => 6 nilai berbeda; slack minimum 17.22px => TERTUTUP penuh
  => REVERSIBLE
```

`topSlack`/`botSlack` **positif** = foto masih melewati tepi clip itu (tertutup).
Negatif = ada celah yang terlihat. Minimum 23.31px / 17.22px / 5.78px (390px) — tidak ada
celah di offset mana pun.

Reversibilitas penting: animasi **sekali-jalan** akan lulus sapuan maju dan gagal sapuan
mundur. Ini yang membedakan *scroll-linked* dari *scroll-fired*.

### 3.3 Kontrol: hover zoom `.u-zoom` masih hidup

```
rest  : transform none
        transition transform 0.56s cubic-bezier(0.16, 1, 0.3, 1)
hover : transform matrix(1.05, 0, 0, 1.05, 0, 0)  scale(1.05, 1.05)
=> hover zoom MENCAPAI scale(1.05) — utuh
```

### 3.4 Kontrol: `overflow: hidden` membekukan timeline (klaim §2.2)

```
 scrollY   translateY          (dengan .u-drift-frame{overflow:hidden !important})
    6872       32.24
    7039       32.24
    7207       32.24
    7374       32.24
    7542       32.24
    7709       32.24
    7876       32.24
=> 1 nilai berbeda — KLAIM TERKONFIRMASI (beku)
```

Offset `32.24` yang sama persis dengan **ujung** range: timeline-nya tidak di
progress 0, ia di-clamp, karena subject-nya selalu "sudah lewat" scrollport-nya sendiri.

### 3.5 `prefers-reduced-motion: reduce` — lapisan ini INERT, tidak ada yang tergeser

`matchMedia('(prefers-reduced-motion: reduce)').matches = true`

```
D1  lapisan inert
  #penempatan .u-drift   animationName none   transform none   opacity 1   visibility visible   filter none
  #lokasi     .u-drift   animationName none   transform none   opacity 1   visibility visible   filter none
  (animationTimeline jadi `auto` — shorthand `animation: none` juga melepas timeline-nya)

D2  tidak ada yang tertinggal
  #penempatan frame 1215x810  img 1213x921  topSlack 55.55  bottomSlack 55.56  imgOpacity 1  frameOverflow clip
  #lokasi     frame 1215x608  img 1213x690  topSlack 41.38  bottomSlack 41.39  imgOpacity 1  frameOverflow clip
  section #penempatan 1265x1314  opacity 1  clipPath none  transform none
  section #lokasi     1265x1010  opacity 1  clipPath none  transform none
  => PASS — tertutup penuh, opak, tidak ter-clip, tidak ter-transform, tinggi nyata

D3  halaman masih bisa scroll ke banner
  scrollY 7664  imgVisible true  topSlack 55.55  bottomSlack 55.56  transform none

overflow horizontal — motion ON: -15px · reduced motion: -15px   (negatif = tidak ada overflow)
```

Catatan penting: `animationDuration` **tetap** `1e-05s` di bawah reduce — clamp global
`*` di `global.css` memang menimpanya. Yang menyelamatkan adalah `animation: none`
(nama animasi kosong), **bukan** durasi. Kalau saya mengandalkan clamp itu saja, foto akan
terparkir di offset pecahan — persis jebakan yang §9/§9b catat.

### 3.6 390px — drift mengecil bersama frame, tidak tetap absolut

```
frame 341x227, img 257px (1.132x), viewport 844px
 scrollY   translateY   topSlack  botSlack
   11996       -8.99      23.76      5.78
   12191       -8.45      23.22      6.31
   12386       -1.24      16.01     13.52
   12581        5.97        8.8     20.74
   12776        8.99       5.78     23.76
   12971        8.99       5.78     23.76
   13166        8.99       5.78     23.76
=> travel 18.0px (vs 64.5px @1280), slack minimum 5.78px => TERTUTUP
390px horizontal overflow: -15px
```

Over-size awal saya 6% dan di 390px slack-nya tinggal **3.68px** — positif dan
deterministik, tapi terlalu tipis untuk saya tinggalkan tanpa alasan. Saya naikkan ke 7%
(slack ≈3% dari tinggi frame, minimum terukur 5.78px) dengan biaya crop 2% lebih banyak di
banner yang `alt=""`. Angka di atas adalah hasil sesudah perubahan itu.

### 3.7 Verifikasi fallback `@supports not (overflow: clip)` (§2.4)

Tiga hal yang kamu minta, semuanya terhadap `dist/` yang benar-benar dibangun.

**V1 — browser modern tetap menghitung `overflow: clip` (bukan `hidden`).**

```
#penempatan .u-drift-frame                  #lokasi .u-drift-frame
  class="overflow-clip" present  true         class="overflow-clip" present  true
  computed overflow              clip         computed overflow              clip
  computed overflow, .u-drift-   clip         computed overflow, .u-drift-   clip
    frame alone                                 frame alone
=> V1 PASS
```

Baris ketiga sengaja: saya melepas utility `overflow-clip` dari elemen dan membacanya
lagi — tetap `clip`. Jadi yang memasok nilainya adalah `.u-drift-frame` (unlayered, jadi
menang atas utility Tailwind yang ber-layer), dan karena itu **fallback-nya ada di tempat
yang benar** terlepas dari utility di markup.

**V3a — kedua rule ada di `document.styleSheets`, dengan kondisinya.**

```
CSS.supports('overflow','clip') di engine ini: true
condition : (none — applies unconditionally)
cssText   : .u-drift-frame { position: relative; overflow: clip; }
condition : not (overflow:clip)
cssText   : .u-drift-frame { overflow: hidden; }
=> base "clip" rule present     : true
=> "hidden" under @supports not : true
```

`CSS.supports('overflow','clip')` = `true` di Chromium, jadi blok `not (…)` **inert** di
sini — persis yang diinginkan. Yang membuktikan fallback-nya hidup bukan itu, tapi dua
baris `condition`/`cssText` di atas: rule-nya ada, terparse, dengan kondisi yang benar.

**V3b — byte yang dikirim, di disk.**

```
dist/_astro/admin.1c5jZSyz.css
    base     : .u-drift-frame{position:relative;overflow:clip}
    fallback : @supports not (overflow:clip){.u-drift-frame{overflow:hidden}}
    naive two-declaration form present? no (lightningcss collapsed it)
=> shipped base=true fallback=true
```

Baris terakhir itu bukti langsung bahwa bentuk dua-deklarasi yang diminta memang **tidak
ada** di output — bukan karena saya lupa menulisnya, tapi karena minifier membuangnya.

**V3c — kontrol mekanisme (kenapa fallback-nya bisa berlaku di Safari ≤15).**

```
"hidden; <invalid value>"  -> hidden    (value yang dibuang meninggalkan deklarasi SEBELUMNYA)
"hidden; clip"             -> clip      (engine modern mengambil yang terakhir yang valid)
(no overflow declaration)  -> visible   (keadaan akhir di Safari <=15 TANPA fallback: spill)
=> mechanism CONFIRMED
```

Probe pertama adalah analog langsung dari kasus Safari: value tak dikenal dibuang, dan
deklarasi sebelumnya tetap berdiri. Probe ketiga menunjukkan keadaan akhir yang cacat itu
— `visible` — kalau fallback-nya tidak ada.

**V2 — drift TETAP bervariasi (perbaikan ini tidak mengembalikan timeline ke beku).**

Sapuan halus ~20px melintasi seluruh rentang visibilitas (bukan lagi 7 titik, yang
sebelumnya kebanyakan jatuh di luar window animasi dan ter-clamp ke endpoint):

```
#penempatan .u-drift-frame — frame 810px, img 921px (1.137x)
    sampled 116 scroll positions
    translateY range           : -32.24 .. 32.24  (travel 64.48px)
    distinct translateY values : 36  (MOVING)
    INTERIOR samples (strictly between the endpoints): 34
      scrollY   translateY   topSlack  botSlack  overflow
       6988      -31.30     86.85     24.26   clip
       7008      -29.42     84.97     26.14   clip
       7028      -27.54     83.09     28.02   clip
       7048      -25.66     81.21     29.90   clip
       7068      -23.78     79.33     31.78   clip
       7088      -21.90     77.45     33.66   clip
       7108      -20.02     75.56     35.54   clip
       7128      -18.14     73.68     37.43   clip
       7148      -16.26     71.80     39.31   clip
       7168      -14.37     69.92     41.19   clip
       7188      -12.49     68.04     43.07   clip
       7208      -10.61     66.16     44.95   clip
    min slack top/bottom       : 23.31px / 23.32px (covered)
    reversible on the way back : YES

#lokasi .u-drift-frame — frame 608px, img 690px (1.135x)
    sampled 106 scroll positions
    translateY range           : -24.16 .. 24.16  (travel 48.32px)
    distinct translateY values : 33  (MOVING)
    INTERIOR samples           : 31
    min slack top/bottom       : 17.22px / 17.23px (covered)
    reversible on the way back : YES

regression sanity: horizontal overflow -15px (none)
```

**36 nilai berbeda**, 34 di antaranya benar-benar di dalam window animasi, naik linier
≈1.88px per 20px scroll — dan **reversible**. Timeline-nya hidup, dan `overflow` di
setiap baris tetap `clip`.

**Catatan koreksi angka saya sendiri:** pada versi pertama skrip ini, sampel V2 saya
hanya menghasilkan **3** nilai berbeda, karena titik sampelnya (fraksi dari rentang
visibilitas penuh) hampir semuanya jatuh di luar window `entry 25% cover 50%` dan
ter-clamp ke endpoint. Itu **bukan** bukti yang cukup untuk klaim "bergerak" — 3 nilai
bisa saja berarti dua endpoint plus satu kebetulan. Sapuan halus di atas menggantikannya.
Saya juga sempat salah menulis label pada satu probe kontrol (mengira
`overflow: clip; overflow: <invalid>` menghasilkan `visible`; di Chromium ia `clip`,
karena Chromium *memang* mendukung `clip` — itu justru bukan analog Safari). Labelnya
sudah dibetulkan, dan analog yang benar adalah probe `hidden; <invalid>`.

---

## 4. Hasil gate (masing-masing dengan exit code)

| Gate | Exit | Catatan |
|---|---|---|
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | **0** | |
| `node scripts/ci/verify-classes.mjs` | **0** | 1205 token class / 219 berkas / 1539 selector. `u-drift-frame`, `u-drift`, `overflow-clip`, `aspect-[3/2]`, `aspect-[2/1]` semuanya punya rule — termasuk rule baru di dalam `@supports not (overflow: clip)` |
| `node scripts/ci/lint-ratchet.mjs` | **0** | 2461 vs baseline 2475 — **debt turun 14**. `motion.css` 13 → 12; `check-keyframes.mjs` tidak muncul sebagai berkas ber-diagnostik baru |
| `node scripts/ci/check-keyframes.mjs` (`verify:keyframes`) | **0** | 14 keyframes, 12 referensi, semua resolve |
| `npm run build` (astro build + `build-sw-manifest`) | **0** | 11 halaman, 13.91s. sw `asj-astro-a27225947a82`, 84 URL. Lihat catatan shim di §5.1 |
| `node node_modules/vitest/vitest.mjs run` | _lihat §4.1_ | 167 berkas / 1970 tes — jumlahnya persis seperti yang kamu sebut |
| `npm run e2e:landing` | _lihat §4.2_ | |
| `npm run e2e:headings` / `:public` / `:loker-layout` / `:dialog` / `:drawer` / `:labels` / `:theme-gradients` | _lihat §4.2_ | |

### 4.1 vitest

`CODEBUDDY_SAFE_DELETE_ENABLED=0 node node_modules/vitest/vitest.mjs run`, dijalankan
setelah `npm run build` **lengkap** (astro build + `scripts/build-sw-manifest.mjs`):

```
 Test Files  3 failed | 164 passed (167)
      Tests  3 failed | 1967 passed (1970)
   Duration  160.59s
vitest EXIT=1
```

**167 berkas / 1970 tes — persis jumlah yang kamu sebut.** Ketiga merah itu **satu akar
yang sama**: di sandbox ini `node` **tidak bisa spawn `node`, `git`, maupun `cmd.exe`** —
`EBUSY`. Bukan beban, bukan konkurensi: saya buktikan langsung, di luar vitest.

Probe telanjang (tanpa git, tanpa depcruise):

```
$ node -e "const {spawnSync,execSync}=require('node:child_process');
           const t=(n,f)=>{try{console.log(n,'OK',f())}catch(e){console.log(n,'THREW',e.code)}};
           t('spawnSync(node -e 1)',()=>{const r=spawnSync(process.execPath,['-e','console.log(1)'],{encoding:'utf8'});if(r.error)throw r.error;return r.stdout.trim()});
           t('execSync(git ls-files --deleted)',()=>execSync('git ls-files --deleted',{encoding:'utf8',cwd:process.cwd()}).length);
           t('spawnSync(git --version)',()=>{const r=spawnSync('git',['--version'],{encoding:'utf8'});if(r.error)throw r.error;return r.stdout.trim()});"
spawnSync(node -e 1)               THREW EBUSY
execSync(git ls-files --deleted)   THREW EBUSY
spawnSync(git --version)           THREW EBUSY
```

**Batas klaim ini — saya koreksi dari ringkasan sebelumnya.** Di ringkasan pertama saya
menulis "`node` tidak bisa spawn proses anak **sama sekali**". Itu **terlalu kuat**, dan
saya sendiri yang mematahkannya: seluruh bukti browser di §3 datang dari `playwright`
`chromium.launch()`, yang **berhasil** meluncurkan browser berkali-kali. Jadi blokade-nya
**tidak universal** — ia mencakup `node`, `git` dan `cmd.exe`, tidak mencakup launcher
browser Playwright. Yang penting untuk kesimpulannya tidak berubah: ketiga tes itu merah
karena memanggil `git`/`node`, dan justru itulah yang diblokir.

Shell saya (`bash`) menjalankan `git` **normal** — `git check-ignore -v
netlify/functions/secrets/firebase-service-account.json` → exit 0, cocok dengan aturan
`.gitignore:136`. Tapi `node` **tidak bisa** menjalankan `git`. Itu yang membuat ketiganya
merah:

| # | Berkas | Baris | Panggilan yang gagal | Gejala |
|---|---|---|---|---|
| 1 | `indexer/src/boundary.test.ts` | `319:7` | `spawnSync(process.execPath, [dependency-cruise.mjs, …])` (baris 304) | `cruise.status` = `null` → `expected null to be +0` |
| 2 | `indexer/src/discover.test.ts` | `52:5` | `execSync('git ls-files --deleted')` | `Error: spawnSync cmd.exe EBUSY` |
| 3 | `netlify/functions/_lib/fcm-server.test.ts` | `389:80` | `execFileSync('git', ['check-ignore','-q', rel])` (baris 383) | spawn gagal → `catch` di helper `ignored()` mengembalikan `false` → `expected false to be true` |

Koreksi terhadap laporan pertama saya: saya sempat menulis #3 di baris **383** dan
menyebut ketiganya "EBUSY di bawah beban". **Baris 383 adalah `execFileSync`-nya; assertion
yang gagal ada di `389:80`.** Dan #3 **tidak** butuh beban — ia gagal sendirian.

Bukti determinisme (bukan artefak konkurensi): ketiga berkas itu saya jalankan
**terisolasi** setelah tree tenang, dan hasilnya tetap merah —

```
$ CODEBUDDY_SAFE_DELETE_ENABLED=0 node node_modules/vitest/vitest.mjs run \
    indexer/src/boundary.test.ts indexer/src/discover.test.ts \
    netlify/functions/_lib/fcm-server.test.ts
 Test Files  3 failed (3)
      Tests  3 failed | 36 passed (39)
   Duration  22.80s
>>> EXIT=1
```

36 tes lain di tiga berkas yang sama **hijau** — jadi yang rusak memang hanya yang butuh
subproses. Saya **tidak menyentuh `.gitignore`**, tidak menyentuh `indexer/`, dan tidak
menyentuh `netlify/functions/` sama sekali.

Jejak yang membuktikan ketiganya lingkungan dan bukan saya:

- Dengan shim delete sandbox **aktif**: **14 merah**, 11 di antaranya
  `SAFE_DELETE_BULK_CONFIRM_REQUIRED`.
- Dengan `astro build` **telanjang** (tanpa `build-sw-manifest`): 5 tes PWA/service-worker
  merah — `dist/sw.js` tidak sinkron dengan hash aset yang baru. Setelah `npm run build`
  lengkap, kelimanya hijau.
- Dengan shim mati **dan** build lengkap: tepat **3**, seperti yang kamu bilang.

### 4.2 e2e

Dijalankan terhadap `dist/` hasil `npm run build`, server `:4321` yang sama.

| Suite | Exit | Hasil |
|---|---|---|
| `npm run e2e:public` | **0** | 9/9 |
| `npm run e2e:loker-layout` | **0** | 8/8 (termasuk "table does not overflow horizontally" di 390px) |
| `npm run e2e:headings` | **0** | 16/16 — termasuk "no horizontal overflow" dan h1 ada di SERVER HTML (no-JS) |
| `npm run e2e:landing` | **0** | 16/16 — "all checks passed (14 spec sections × 2 widths, order + visibility + placeholders + anchors + entrances)". **Termasuk `/: every section entrance matches src/lib/sectionMotion.ts`** — lapisan baru saya tidak menggeser satu pun `data-enter`, dan tidak ada band yang runtuh jadi 0 tinggi |
| `npm run e2e:theme-gradients` | **0** | 3/3 |
| `npm run e2e:dialog` | **0** | 17/17 |
| `npm run e2e:drawer` | **0** | 7/7 |
| `npm run e2e:labels` | **0** | 4/4 |

Semua **8/8 exit 0**.

Satu hal yang perlu dicatat dari `e2e:landing`: gate itu punya aturan dua arah untuk
`data-enter` — "tidak ada elemen yang boleh membawa entrance yang tidak dikenal tabel".
Saya **tidak** menambah atribut apa pun ke elemen mana pun, jadi aturan itu tetap hijau
karena tidak ada yang berubah, bukan karena saya melonggarkannya. Saya juga tidak
menyentuh `src/lib/sectionMotion.ts`.

---

## 5. Yang TIDAK bisa saya verifikasi (jujur)

1. **Firefox dan Safari tidak saya ukur.** Playwright di mesin ini hanya punya Chromium.
   Dukungan `animation-timeline: view()` (Chrome 115+, Firefox 144+, Safari 26) saya
   **tidak** verifikasi di dua engine itu. Yang **bisa** saya klaim: di engine tanpa
   dukungan, blok `@supports` tidak jalan sama sekali, dan layout statisnya identik
   secara geometri — tinggi frame persis `aspect-ratio` (1215/1.5 = 810, 1215/2 = 607.5 →
   608), dan posisi/ukuran foto tidak bergantung pada animasi. Tapi itu penalaran, bukan
   pengukuran di engine tersebut.
2. **Over-size 7% memotong 14% tinggi banner di SEMUA browser**, termasuk yang tidak
   mendukung scroll-timeline. Itu perubahan visual nyata (kecil) pada dua band dekoratif.
   Saya memilihnya daripada margin 3.68px. Kalau kamu lebih suka crop 0%, alternatifnya
   adalah membuang lapisan ini untuk browser non-pendukung lewat `@supports` — tapi itu
   berarti dua tinggi band yang berbeda antar browser, yang saya nilai lebih buruk.
3. **Biaya render tidak diukur.** Yang dianimasikan hanya `transform`, tidak ada
   `will-change`, tidak ada properti layout/paint — jadi model biayanya yang murah. Tapi
   saya **tidak** mengukur FPS di Android kelas bawah. Itu klaim yang saya tidak buat.
4. **Tidak ada verifikasi mata di perangkat nyata.** Semua bukti di atas numerik dari
   Chromium headless. Saya tidak melihatnya bergerak di layar fisik.
5. **Foto `#tentang` saya keluarkan atas dasar penalaran, bukan penglihatan.** Saya tidak
   membuka fotonya untuk memeriksa apakah crop 14% akan memotong orang. Aturan "foto
   ber-`alt` bukan dekorasi" sudah cukup untuk mengeluarkannya.
6. **`deliverables/` tidak ter-commit** (memang tidak di-gitignore, jadi saya sengaja
   hanya `git add` tiga berkas sumber). Commit implementasi: **`e72b481`**, lokal saja.
7. **`indexer/validate-report.json` ada di `git status` sebagai modified dan itu BUKAN
   saya.** Itu laporan ter-*generate* (`indexer/src/validate.ts` menulisnya), dan salinan
   yang ter-commit memegang `rootDir` mesin lain (`C:/Users/AMANAH Sakura 3/dev/astro`
   vs `F:/astro`). Sesi lain sudah mencatatnya juga (`_part-qa.md` §"Integrity incident").
   Saya sengaja **tidak** meng-`git add` file itu: bukan bagian dari deliverable ini, dan
   meng-commit-nya akan mencampur kerja sesi lain ke dalam commit motion.
8. **`check-keyframes.mjs` buta terhadap typo yang merusak PREFIKS, dan itu batasan yang
   diketahui — bukan cacat yang saya tutup.** Gate itu mencocokkan nama keyframe terhadap
   daftar prefiks yang di-hardcode. Jadi `drift-lag` → `drfit-lag` akan **lolos**: nama
   rusak itu tetap tidak cocok dengan prefiks mana pun, jadi pemeriksaan `unreachable`
   tetap "puas" dengan penambahan prefiks `drift-` yang saya buat. Yang tidak akan
   tertangkap: sebuah `@keyframes` yang namanya salah tulis sehingga **tidak lagi
   direferensikan** oleh `animation:` mana pun sementara `animation:` menunjuk nama yang
   tidak ada. Itu inheren dari desain daftar-prefiks — untuk menutupnya gate perlu
   membandingkan *nama yang direferensikan* dengan *nama yang didefinisikan* dua arah,
   bukan mencocokkan pola. Saya sebutkan supaya tidak dikira sudah tertutup.
9. **Komentar `src/lib/gallery.ts` menulis "Nine genuine photographs" padahal arraynya
   berisi 8 entri** (baris 47 dan 74; `GALLERY` di baris 98–212). Itu **stale di dalam
   berkas sumbernya sendiri**, dan itulah sebabnya angka pertama saya ("9 foto galeri")
   salah — saya mempercayai komentar itu, bukan menghitung entri. Saya **tidak**
   memperbaiki berkas itu: di luar lingkup tugas motion, dan mengubahnya akan menambah
   berkas keempat yang tidak berhubungan ke dalam commit ini. Dilaporkan sebagai temuan
   untuk kamu putuskan.

### 5.1 Catatan lingkungan (bukan cacat repo)

Sandbox ini memasang shim `fs.rmSync` yang memblokir penghapusan massal. Itu membuat:

- `astro build` **gagal di langkah terakhir** (`cleanServerOutput` mencoba menghapus
  `dist/pages/*.astro.mjs`) setelah semua halaman selesai ditulis — exit 1 yang
  menyesatkan. Dengan `CODEBUDDY_SAFE_DELETE_ENABLED=0` → exit 0.
- vitest merah **14** kali (bukan 3 EBUSY yang kamu sebut) dengan
  `SAFE_DELETE_BULK_CONFIRM_REQUIRED`, semuanya di tes yang memanggil `fs.rmSync`.
  Bukan dari perubahan saya.

Keduanya artefak sandbox; di CI tidak ada shim ini.

---

## Lampiran A — skrip pengukur (reproduksi)

Saya tidak menambahkan berkas permanen ke repo untuk ini. Alasannya konkret:
`indexer/src/discover.ts` dan `indexer/src/build.test.ts` membekukan **jumlah berkas per
ekstensi**, jadi satu `.mjs` baru di `e2e/` akan memerahkan dua ratchet inventaris — dan
komentar `.gitignore` repo ini sudah mencatat aturan itu: *"an evidence tool that nothing
depends on is not worth a frozen-inventory slot"*. Jadi skripnya hidup di pola `.tmp-*`
yang di-gitignore (sehingga tidak pernah dihitung indexer), dan isinya ada di bawah ini
supaya bisa direproduksi.

Simpan sebagai `.tmp-scroll-drift-measure.mjs` di root repo, jalankan dengan server
`:4321` hidup:

```bash
node .tmp-scroll-drift-measure.mjs
```

Saat tulisan ini dibuat, berkas itu **masih ada** di root repo dengan nama yang sama —
silakan langsung dijalankan; kalau sudah dibersihkan, salin blok di bawah.

```js
/**
 * .tmp-scroll-drift-measure.mjs — EVIDENCE for motion.css §9d, run against the
 * real server on :4321 serving the built `dist/`.
 *
 * It answers four questions with numbers, because each one is a way the layer
 * could be wrong while every static check stays green:
 *
 *   A. Is the scroll-linked animation actually ATTACHED, and to what timeline?
 *   B. Does its value CHANGE as the page scrolls? (the whole point — a
 *      scroll-LINKED effect that is measured after it has finished looks
 *      identical to one that never ran)
 *   C. Does the photograph still COVER its frame at every sampled offset? A
 *      drift larger than the 6% over-size would expose an edge.
 *   D. With `prefers-reduced-motion: reduce`, is the new layer INERT and is
 *      nothing left offset, invisible or clipped?
 *
 * Plus two controls that must FAIL if the reasoning is wrong:
 *   E. the `.u-zoom` hover zoom on a gallery tile still reaches scale(1.05)
 *   F. injecting `overflow: hidden` on the frame (instead of `clip`) freezes
 *      the timeline — the claim §9d makes in prose.
 *
 * gitignored by `.tmp-*`; deleted after it runs.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const VIEWPORT = { width: 1280, height: 900 };

const out = [];
const say = (s) => {
  out.push(s);
  console.log(s);
};

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });

// ── shared page helpers ────────────────────────────────────────────────────
const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))),
  );

/** Scroll the whole document so every entrance fires, then return to the top. */
async function fireEntrances(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.7;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
}

/** Everything the assertions need about one drifting banner. */
async function geometry(page, frameSel) {
  return page.evaluate((sel) => {
    const frame = document.querySelector(sel);
    const img = frame.querySelector('img');
    const fr = frame.getBoundingClientRect();
    return {
      frameDocTop: Math.round(fr.top + window.scrollY),
      frameH: Math.round(fr.height),
      frameW: Math.round(fr.width),
      imgH: Math.round(img.getBoundingClientRect().height),
      viewportH: window.innerHeight,
    };
  }, frameSel);
}

/**
 * Sample the drift at N scroll offsets spanning the animation's own range.
 * A double rAF after each scroll is required: a scroll-driven animation is
 * updated during the frame's style phase, so reading in the same task as the
 * scroll returns the PREVIOUS frame's value.
 */
async function sample(page, frameSel, g, fractions = [-0.25, 0, 0.25, 0.5, 0.75, 1, 1.25]) {
  const start = g.frameDocTop - g.viewportH + 0.25 * g.imgH;
  const end = g.frameDocTop;
  const rows = [];
  for (const f of fractions) {
    const y = Math.round(start + (end - start) * f);
    await page.evaluate((yy) => window.scrollTo(0, yy), Math.max(0, y));
    await settle(page);
    const row = await page.evaluate(
      ({ sel, wantY }) => {
        const frame = document.querySelector(sel);
        const img = frame.querySelector('img');
        const cs = getComputedStyle(img);
        const ir = img.getBoundingClientRect();
        const fr = frame.getBoundingClientRect();
        const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
        return {
          wantY,
          actualY: Math.round(window.scrollY),
          translateY: Number(m.f.toFixed(2)),
          transform: cs.transform,
          animationName: cs.animationName,
          // Coverage: the photograph must still reach past both clip edges.
          topSlack: Number((fr.top - ir.top).toFixed(2)),
          bottomSlack: Number((ir.bottom - fr.bottom).toFixed(2)),
          frameTop: Math.round(fr.top),
        };
      },
      { sel: frameSel, wantY: y },
    );
    rows.push(row);
  }
  return rows;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 — motion ON
// ════════════════════════════════════════════════════════════════════════════
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const resp = await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
say(`GET / -> HTTP ${resp ? resp.status() : 0}`);
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(700);
await fireEntrances(page);

say('');
say('── A. what the animation is bound to (computed, 1280px, motion ON) ──');
const bindings = await page.evaluate(() => {
  const rows = [];
  for (const sel of ['#penempatan .u-drift', '#lokasi .u-drift']) {
    const img = document.querySelector(sel);
    if (!img) {
      rows.push({ sel, missing: true });
      continue;
    }
    const cs = getComputedStyle(img);
    const frame = img.closest('.u-drift-frame');
    const fcs = getComputedStyle(frame);
    rows.push({
      sel,
      animationName: cs.animationName,
      animationTimeline: cs.animationTimeline,
      animationRange: cs.animationRange,
      animationDuration: cs.animationDuration,
      animationTimingFunction: cs.animationTimingFunction,
      animationFillMode: cs.animationFillMode,
      driftVar: cs.getPropertyValue('--drift').trim(),
      frameOverflow: fcs.overflow,
      framePosition: fcs.position,
      frameAspect: fcs.aspectRatio,
      imgPosition: cs.position,
      imgHeight: cs.height,
      imgTop: cs.top,
      imgObjectFit: cs.objectFit,
    });
  }
  return rows;
});
for (const r of bindings) {
  if (r.missing) {
    say(`  ${r.sel}: NOT FOUND`);
    continue;
  }
  say(`  ${r.sel}`);
  for (const k of Object.keys(r)) if (k !== 'sel') say(`      ${k.padEnd(22)} ${r[k]}`);
}

say('');
say('── B + C. the value as a function of scroll position ──');
const banners = [
  { name: '#penempatan (aspect 3/2)', frame: '#penempatan .u-drift-frame', img: '#penempatan .u-drift' },
  { name: '#lokasi (aspect 2/1)', frame: '#lokasi .u-drift-frame', img: '#lokasi .u-drift' },
];
const samples = {};
for (const b of banners) {
  const g = await geometry(page, b.frame);
  say('');
  say(`  ${b.name} — frame ${g.frameW}x${g.frameH}px, img ${g.imgH}px tall, viewport ${g.viewportH}px`);
  say(`      (img is ${(g.imgH / g.frameH).toFixed(3)}x the frame height = the over-size)`);
  const rows = await sample(page, b.frame, g);
  samples[b.name] = rows;
  say('        scrollY   translateY   topSlack  botSlack  frameTop');
  for (const r of rows) {
    say(
      `      ${String(r.actualY).padStart(7)}   ${String(r.translateY).padStart(9)}   ` +
        `${String(r.topSlack).padStart(8)}  ${String(r.bottomSlack).padStart(8)}  ${String(r.frameTop).padStart(8)}`,
    );
  }
  const vals = rows.map((r) => r.translateY);
  const distinct = new Set(vals).size;
  // `topSlack`/`bottomSlack` are POSITIVE when the photograph still reaches
  // past that clip edge, i.e. positive is covered. Zero would be exactly flush
  // and a negative value is a visible gap.
  const covered = rows.every((r) => r.topSlack >= 0 && r.bottomSlack >= 0);
  const minSlack = Math.min(...rows.map((r) => Math.min(r.topSlack, r.bottomSlack)));
  say(
    `      => ${distinct} distinct translateY value(s) across ${rows.length} offsets; ` +
      `min slack at any edge ${minSlack.toFixed(2)}px => ` +
      `${covered ? 'COVERED at every offset' : 'AN EDGE IS EXPOSED'}`,
  );
  // Reversibility: walk the SAME offsets backwards and require the values to
  // come back in reverse. A one-shot animation passes the forward sweep and
  // fails this — which is the difference between scroll-LINKED and scroll-fired.
  const back = await sample(page, b.frame, g, [1.25, 1, 0.75, 0.5, 0.25, 0, -0.25]);
  const reverse = back.map((r) => r.translateY);
  const forwardReversed = [...vals].reverse();
  const reversible = JSON.stringify(forwardReversed) === JSON.stringify(reverse);
  say(
    `      => scrolling back up: ${reverse.join(' → ')} — ` +
      `${reversible ? 'REVERSIBLE (identical values, identical offsets)' : 'NOT reversible'}`,
  );
}

// ── E. the hover zoom on a .u-zoom tile must still work ────────────────────
say('');
say('── E. control: `.u-zoom` hover zoom on a gallery tile ──');
await page.evaluate(() => {
  const el = document.querySelector('#galeri li.group');
  if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
});
await page.waitForTimeout(700);
const before = await page.evaluate(() => {
  const img = document.querySelector('#galeri li.group img.u-zoom');
  return { transform: getComputedStyle(img).transform, transition: getComputedStyle(img).transition };
});
await page.hover('#galeri li.group');
await page.waitForTimeout(900);
const after = await page.evaluate(() => {
  const img = document.querySelector('#galeri li.group img.u-zoom');
  const cs = getComputedStyle(img);
  const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
  return { transform: cs.transform, scaleX: Number(m.a.toFixed(4)), scaleY: Number(m.d.toFixed(4)) };
});
say(`  rest  : transform ${before.transform}  transition ${before.transition}`);
say(`  hover : transform ${after.transform}  scale(${after.scaleX}, ${after.scaleY})`);
say(
  `  => hover zoom ${after.scaleX > 1.049 && after.scaleX < 1.051 ? 'REACHES scale(1.05) — intact' : 'DID NOT REACH 1.05 — BROKEN'}`,
);

// ── horizontal overflow, motion ON (the drift is translateY only) ─────────
const overflowOn = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);

// ── F. the overflow: hidden control ───────────────────────────────────────
say('');
say('── F. control: the same read with `overflow: hidden` on the frame ──');
await page.evaluate(() => {
  const s = document.createElement('style');
  s.id = 'tmp-hidden-control';
  s.textContent = '.u-drift-frame{overflow:hidden !important}';
  document.head.appendChild(s);
});
await settle(page);
const hiddenRows = await sample(page, '#penempatan .u-drift-frame', await geometry(page, '#penempatan .u-drift-frame'));
say('        scrollY   translateY');
for (const r of hiddenRows) say(`      ${String(r.actualY).padStart(7)}   ${String(r.translateY).padStart(9)}`);
say(
  `      => ${new Set(hiddenRows.map((r) => r.translateY)).size} distinct value(s) — ` +
    `the prose claim is ${new Set(hiddenRows.map((r) => r.translateY)).size === 1 ? 'CONFIRMED (frozen)' : 'REFUTED (still moving)'}`,
);
await page.evaluate(() => document.getElementById('tmp-hidden-control')?.remove());
await ctx.close();

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2 — prefers-reduced-motion: reduce
// ════════════════════════════════════════════════════════════════════════════
say('');
say('════ PHASE 2 — prefers-reduced-motion: reduce ════');
const rctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
const rpage = await rctx.newPage();
const rresp = await rpage.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
say(`GET / -> HTTP ${rresp ? rresp.status() : 0}`);
await rpage.waitForLoadState('networkidle').catch(() => {});
await rpage.waitForTimeout(700);
const reduceFlag = await rpage.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
say(`  matchMedia('(prefers-reduced-motion: reduce)').matches = ${reduceFlag}`);
await fireEntrances(rpage);

say('');
say('── D1. the layer is inert ──');
const inert = await rpage.evaluate(() => {
  const rows = [];
  for (const sel of ['#penempatan .u-drift', '#lokasi .u-drift']) {
    const img = document.querySelector(sel);
    const cs = getComputedStyle(img);
    rows.push({
      sel,
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      animationTimeline: cs.animationTimeline,
      transform: cs.transform,
      opacity: cs.opacity,
      visibility: cs.visibility,
      filter: cs.filter,
    });
  }
  return rows;
});
for (const r of inert) {
  say(`  ${r.sel}`);
  for (const k of Object.keys(r)) if (k !== 'sel') say(`      ${k.padEnd(20)} ${r[k]}`);
}

say('');
say('── D2. nothing is left offset / invisible / clipped ──');
const d2 = await rpage.evaluate(() => {
  const rows = [];
  for (const sel of ['#penempatan .u-drift-frame', '#lokasi .u-drift-frame']) {
    const frame = document.querySelector(sel);
    const img = frame.querySelector('img');
    const fr = frame.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const section = frame.closest('section');
    const sr = section.getBoundingClientRect();
    const scs = getComputedStyle(section);
    rows.push({
      sel,
      frame: `${Math.round(fr.width)}x${Math.round(fr.height)}`,
      img: `${Math.round(ir.width)}x${Math.round(ir.height)}`,
      topSlack: Number((fr.top - ir.top).toFixed(2)),
      bottomSlack: Number((ir.bottom - fr.bottom).toFixed(2)),
      imgOpacity: getComputedStyle(img).opacity,
      frameOverflow: getComputedStyle(frame).overflow,
      section: `${Math.round(sr.width)}x${Math.round(sr.height)}`,
      sectionOpacity: scs.opacity,
      sectionClipPath: scs.clipPath,
      sectionTransform: scs.transform,
    });
  }
  return rows;
});
for (const r of d2) {
  say(`  ${r.sel}`);
  for (const k of Object.keys(r)) if (k !== 'sel') say(`      ${k.padEnd(20)} ${r[k]}`);
}
const d2ok = d2.every(
  (r) =>
    r.topSlack >= 0 &&
    r.bottomSlack >= 0 &&
    r.imgOpacity === '1' &&
    r.sectionOpacity === '1' &&
    r.sectionClipPath === 'none' &&
    r.sectionTransform === 'none' &&
    Number(r.section.split('x')[1]) >= 40,
);
say(
  `  => ${d2ok ? 'PASS — fully covered (positive slack both edges), opaque, unclipped, un-transformed, real height' : 'FAIL — see the rows above'}`,
);

say('');
say('── D3. the page still scrolls to the banner and the entrance still fires ──');
const d3 = await rpage.evaluate(async () => {
  const frame = document.querySelector('#penempatan .u-drift-frame');
  frame.scrollIntoView({ block: 'center', behavior: 'instant' });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const img = frame.querySelector('img');
  const ir = img.getBoundingClientRect();
  const fr = frame.getBoundingClientRect();
  return {
    scrollY: Math.round(window.scrollY),
    imgVisible: ir.width > 0 && ir.height > 0 && ir.top < window.innerHeight && ir.bottom > 0,
    topSlack: Number((fr.top - ir.top).toFixed(2)),
    bottomSlack: Number((ir.bottom - fr.bottom).toFixed(2)),
    transform: getComputedStyle(img).transform,
  };
});
for (const k of Object.keys(d3)) say(`      ${k.padEnd(20)} ${d3[k]}`);

// ── horizontal overflow under reduce ──────────────────────────────────────
const overflowReduce = await rpage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
say('');
say(`  horizontal overflow — motion ON: ${overflowOn}px · reduced motion: ${overflowReduce}px`);

// ── G. the same layer at 390px, where the frame is short ──────────────────
say('');
say('── G. 390px — the drift must shrink with the frame, not stay absolute ──');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mpage = await mctx.newPage();
await mpage.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await mpage.waitForLoadState('networkidle').catch(() => {});
await mpage.waitForTimeout(700);
await fireEntrances(mpage);
const mg = await geometry(mpage, '#penempatan .u-drift-frame');
say(
  `  frame ${mg.frameW}x${mg.frameH}px, img ${mg.imgH}px tall (${(mg.imgH / mg.frameH).toFixed(3)}x), ` +
    `viewport ${mg.viewportH}px`,
);
const mrows = await sample(mpage, '#penempatan .u-drift-frame', mg);
say('        scrollY   translateY   topSlack  botSlack');
for (const r of mrows) {
  say(
    `      ${String(r.actualY).padStart(7)}   ${String(r.translateY).padStart(9)}   ` +
      `${String(r.topSlack).padStart(8)}  ${String(r.bottomSlack).padStart(8)}`,
  );
}
const mvals = mrows.map((r) => r.translateY);
say(
  `  => travel ${(Math.max(...mvals) - Math.min(...mvals)).toFixed(1)}px ` +
    `(vs 63.3px at 1280px), min slack ${Math.min(...mrows.map((r) => Math.min(r.topSlack, r.bottomSlack))).toFixed(2)}px ` +
    `=> ${mrows.every((r) => r.topSlack >= 0 && r.bottomSlack >= 0) ? 'COVERED' : 'EDGE EXPOSED'}`,
);
const mOverflow = await mpage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
say(`  390px horizontal overflow: ${mOverflow}px`);
await mctx.close();

await rctx.close();
await browser.close();

say('');
say('══ SUMMARY ══');
for (const [name, rows] of Object.entries(samples)) {
  const vals = rows.map((r) => r.translateY);
  say(
    `${name}: translateY ${vals[0]} → ${vals[vals.length - 1]}, ` +
      `${new Set(vals).size} distinct values, min ${Math.min(...vals)}, max ${Math.max(...vals)}, ` +
      `travel ${(Math.max(...vals) - Math.min(...vals)).toFixed(1)}px`,
  );
}
say(`reduce-motion overflow: ${overflowReduce}px   (motion-on reference: ${overflowOn}px)`);
process.exit(0);
```
