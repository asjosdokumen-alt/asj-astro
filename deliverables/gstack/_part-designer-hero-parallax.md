# Review Desain — Hero Parallax (`/` landing) — 2026-09-27

**Reviewer:** gstack-designer · **Scope:** uncommitted working tree @ `832a305`, 5 files
(`App.tsx`, `global.css`, `motion.css`, `BaseLayout.astro`, `theme.css`) + `DESIGN.md`.
**Metode:** baca diff + baca file nyata + baca `dist/` (build nyata dari source ini) +
grep konsumen token/kelas. Tidak ada server yang dijalankan; klaim yang butuh render
ditandai **[needs QA]**.

> **UPDATE 2026-09-27 (setelah ukuran QA gstack-qa-lead masuk):**
> - **H1 (hero-haze tak terlihat) DIBATALKAN.** QA mengukur 47% piksel berubah saat
>   `.hero-haze` di-hide (noise floor 0.7%); dengan `::after` di-`display:none` justru
>   52%. Jadi haze **memang terlihat**, bukan "salinan yang tertutup". Analisis saya
>   dari source benar soal *adanya* duplikasi `--hero-glow` di `::after`, tetapi
>   kesimpulan "praktis tak terlihat" **salah** — turun ke INFO (catatan arsitektur).
> - **L1 kini punya angka.** 390×844 light adalah satu-satunya config dengan headroom
>   tipis: **min 3.45:1 vs lantai AA-large 3.0:1 = hanya 15%**. Lolos AA (h1 36px =
>   large text), tetapi ini yang paling rapuh.

---

## Verdict: **GO — dengan 2 perbaikan MEDIUM & 1 LOW (non-blocking)**

Arah desainnya benar dan jujur. Keputusan-keputusan yang berisiko sudah diambil dengan
alasan yang bisa diverifikasi, bukan rasionalisasi. Yang tersisa layak diselamatkan
sebelum commit; tidak ada satupun yang membuat parallax-nya salah secara fungsional.

---

## Apa yang benar (diverifikasi dari kode, bukan komentar)

- **[VERIFIED] Fallback `100vh` + `100svh` benar-benar selamat dari minifier.** Ini klaim
  terkuat di batch dan klaim itu **benar**. `dist/_astro/admin.DdZObPBx.css` (build dari
  source ini) berisi **tiga rule `.hero-band` terpisah**:
  `.hero-band{min-height:100vh;overflow:clip}`, `@supports (height:100svh){.hero-band{min-height:100svh}}`,
  dan `@supports not (overflow:clip){.hero-band{overflow:hidden}}`. Jadi assertion probe
  `measure-hero-parallax.mjs:248-252` ("the `100vh` fallback ALSO survived") **dapat
  dicapai** — bentuk `@supports` blok memang yang bertahan, bukan idiom dua-deklarasi.
- **[VERIFIED] `text-display` tepat satu konsumen nyata.** `grep -rn text-display src/`
  → hanya `App.tsx:583` (h1 hero); sisanya komentar (`global.css:801`, `theme.css:210`).
  Retune token tidak bisa menggeser heading lain.
- **[VERIFIED] Split dua class string benar-benar melindungi lima rute lain.** `App.tsx:328`
  kini dua string literal terpisah; cabang non-hero mempertahankan
  `max-w-7xl mx-auto px-4 mt-6 … rounded-band overflow-hidden min-h-[14rem] md:h-56`.
  `grep hero-band src/` → hanya cabang hero. Kelas `.hero-band/.hero-art/.hero-haze/
  .hero-layer` tidak bisa bocor ke `/loker` `/public` `/admin` `/candidate` `/share`.
- **[VERIFIED] `font-normal` wajib & benar.** Keluarga Instrument Serif hanya punya 400
  (`BaseLayout.astro` impor `latin-400.css`; `dist` memuat `instrument-serif-latin-400-normal.woff2`),
  jadi `font-black` akan memaksa sintesis 900. Menanggalkannya adalah keputusan tepat.
- **[VERIFIED] Utility & token benar-benar ter-build.** `dist` punya
  `.font-display{font-family:var(--font-display)}`, `--font-display:"Instrument Serif", ui-serif,
  Georgia, "Times New Roman", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif`,
  dan `.text-display{font-size:clamp(2.25rem,5.5vw,4.5rem);line-height:1.02;letter-spacing:-.01em}`.
  Rantai fallback CJK Mincho memang terpasang.
- **[VERIFIED] Reduced-motion MENANG secara cascade (benar, tanpa `!important`).** Rule
  `.hero-layer{animation:none;transform:none}` (`motion.css:1173`) dan rule animasi
  (`motion.css:1145`) berada di `@media` yang **saling eksklusif** (`reduce` vs
  `no-preference`) — keduanya `(0,1,0)`, jadi tidak pernah bersaing; source order tak
  relevan. Tidak ada rule lain di `src/` yang menyetel `transform` pada `.hero-art`/
  `.hero-haze` (grep bersih), dan tidak ada utility `transform` di markup. **Reset-nya
  aman.** [needs QA] konfirmasi nilai render tiap offset.
- **[VERIFIED] Anchor mutasi M-D di-re-anchor dengan benar.** `e2e/test-headings-public.mutations.sh`
  memperbarui literal `font-black … leading-tight` → `font-display font-normal`, bukan
  melemahkan mutasi jadi partial-match. Disiplin bagus.

---

## Temuan

### HIGH → DIBATALKAN (dulu H1), kini INFO

**I4 — `.hero-haze` menduplikasi glow `::after`, tetapi TETAP terlihat. [DIBATALKAN oleh QA]**
`global.css:96-102` sudah punya `.hero-gradient::after{position:absolute; inset:0;
background: var(--hero-glow)}` — satu lapisan `--hero-glow` penuh di seluruh band. Lapisan
baru `.hero-haze` (`motion.css:1120-1133`) memakai **token yang sama**, hanya digeser
(`background-size:150% 150%; background-position:80% 30%`). Analisis arsitektur ini benar:
ada dua salinan token yang sama. **Tetapi** QA membuktikan hasilnya bukan "salinan
tertutup": menghide `.hero-haze` mengubah **47% piksel** (noise floor 0.7%); dengan
`::after` di-`display:none` malah 52%. Artinya pergeseran posisi + ukuran cukup membuat
haze menyumbang piksel yang berbeda, dan `::after` tidak "menelan"-nya. Desainnya berdiri.
→ **Tidak ada aksi.** Dicatat hanya supaya pembaca berikutnya tahu ada dua pemakai
`--hero-glow` di band yang sama (redundansi yang sengaja, bukan bug).

### HIGH (tidak ada tersisa)

_(Semua yang semula HIGH sudah diselesaikan: H1 dibatalkan oleh pengukuran QA.)_

### MEDIUM

**M1 — Prinsip "arah berlawanan = kedalaman, searah beda-kecepatan = kerusakan" adalah
rasionalisasi, bukan hukum.** Secara persepsi, depth cue yang sah adalah **beda laju
(parallax factor)**, bukan beda **arah**. Dua bidang searah dengan laju berbeda adalah
representasi parallax yang paling standar (dunia nyata: objek jauh & dekat sama-sama
bergerak searah kamera, hanya besarannya berbeda). Yang membuat searah terlihat seperti
"fault" adalah bila **magnitude-nya hampir sama** (→ terlihat seperti ghosting). Arah
berlawanan justru **tidak fisis** untuk sebuah parallax scroll (bidang dekat tidak
menempuh arah kebalikan dari yang jauh). Jadi aturan di `motion.css:1048-1051` dan
`App.tsx:398-401` memutarbalikkan prinsip yang sebenarnya.
→ **Rekomendasi:** ubah justifikasinya jadi berbasis **beda magnitudo** (mis.
`--parallax: 4%` vs `-11%` menghasilkan perbedaan yang jelas), bukan "arah berlawanan".
Secara visual keputusan `-11%` tetap boleh; yang salah adalah **alasan** yang ditulis,
karena ia akan dipakai untuk membenarkan keputusan berikutnya.

**M2 — Komentar usang di `global.css:801` menyatakan hal yang tidak lagi benar.**
Baris itu masih menulis hero h1 "carries its own `text-white` (`text-display font-black
text-white …`)". Setelah commit ini, kelasnya `text-display font-display font-normal …`.
Ini bukan komentar inert (aturan repo: komentar `.astro`/CSS dikirim & di-parse indexer),
dan ia menggambarkan elemen konkret. Orang berikutnya yang grep `font-black` akan
dibelokkan.
→ **Rekomendasi:** perbarui literal di komentar itu ke kelas aktual, atau ganti jadi
rujukan simbolik (":hero h1, `App.tsx` cabang hero").

### LOW

**L1 — Hierarki yang hilang dari `font-black` → serif 400 sebagian dibeli ulang; dan
kontras mobile-light adalah titik terapis.**
Klaim di `App.tsx:569-573` ("hierarchy this loses is bought back by SIZE") benar secara
mekanis (ceiling 56px → 72px), tetapi serif high-contrast ber-berat 400 + ink-white di
atas artwork gelap cenderung **membaca lebih ringan** daripada Inter 900 pada mata
yang sama. **[DIVERIFIKASI QA]** Kekhawatiran itu **bukan** kegagalan kontras terukur —
h1 36/70.4px = large text, ambang AA = 3.0:1, dan semua config lolos:
1280 dark min 11.76 / 1280 light min 7.75 / 390 dark min 5.37 / **390 light min 3.45**.
**Tetapi 390×844 light adalah satu-satunya config dengan headroom tipis** — 3.45 vs 3.0 =
**hanya 15%** (42% piksel glyph di bawah 4.5:1, 0% di bawah 3.0). Backdrop tema terang
lebih terang/pink sehingga menurunkan kontras; dark theme jauh lebih aman (+79%).
→ **Rekomendasi (opsional, tidak memblokir):** bila ingin margin lebih aman di
mobile-light, naikkan opasitas `.header-overlay` pada breakpoint mobile di tema terang,
atau gelapkan sedikit `--hero-glow` tema terang. Ini juga akan membantu L2 (lintasan
haze di area copy). Referensi visual QA: `F:/tmp/h1-mobile-light.png`.

**L2 — `DESIGN.md` §3.3 sudah setuju dengan kode (diverifikasi), tetapi §4.1 tabel
"Atas" hero tertulis `0` sementara chrome `mt-6` — benar.** Tidak ada aksi; dicatat
karena diperiksa. Satu inconsistensi kecil: §3.3 menyebut `text-display` size
`clamp(2.25rem, 5.5vw, 4.5rem)`, cocok dengan build.

### INFO (terverifikasi, bukan cacat)

- **I1 — `animation-range: cover 0% cover 100%` di-minify jadi `animation-range: cover`.**
  Semantically **ekuivalen** (bentuk telanjang `<range-name>` = `cover 0% cover 100%`).
  Aman; hanya perlu diketahui bila seseorang mengaudit keluaran build.
- **I2 — `overflow: clip` sebagai penopang timeline** konsisten dengan temuan §9d yang
  sudah tim tetapkan; tidak ada kontradiksi baru.
- **I3 — `.hero-band` tidak membawa `overflow-hidden`** (benar); hanya `@supports not
  (overflow:clip){overflow:hidden}` sebagai fallback Safari ≤15, dan di engine itu
  `view()` juga absen — jadi tak bisa mengunci timeline. Argumen ini **valid**.

---

## Catatan batas review

- ~~[needs QA] Apakah `.hero-haze` benar-benar terlihat~~ → **SELESAI, oleh QA:** ya,
  47% piksel berubah (52% dengan `::after` dimatikan). H1 dibatalkan.
- **[needs QA] masih terbuka** — nilai render `transform` per-offset pada path
  reduced-motion (sudah terbukti **secara cascade** dari source; nilai render perlu probe
  `measure-hero-parallax.mjs` §3).
- Yang **tidak** saya periksa (di luar tabel scope): `package.json`/`package-lock.json`
  (dep `@fontsource/instrument-serif`), `indexer/validate-report.json`.
