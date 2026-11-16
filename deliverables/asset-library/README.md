# Asset Library — turunan aset landing page ASJ

**Dibuat:** 2026-11-15 · **Status:** lengkap, 116 aset / 31,4 MiB / verifikasi 0 masalah.

Pustaka ini dibuat untuk satu permintaan pemilik:

> *"dari asset yg kita punya generated more asset, baik gambar dan video yang
> sekiranya perlu untuk ke depannya dipakai … intinya generated semua landing
> page asset baru yang bisa untuk ke depannya digunakan untuk story telling atau
> video."*

**Semua aset diturunkan dari plate yang sudah ada di repo**, bukan render model
baru: `public/assets/story/**` dan `deliverables/story-3d/assets/**` di-crop,
di-grade, diberi gerak kamera, lalu di-encode ulang. Wajah model utama (cewek
di landing page) karena itu tetap sama di semua rasio dan klip.

Pekerjaan dimulai opencode pukul 16:13 WIB dan **terputus pukul 16:59** karena
`Free usage limit reached` (log `~/.local/share/opencode/log/opencode.log`).
Saat putus, still/OG/overlay/20 klip motion sudah jadi dan ia sedang QC; yang
belum sempat dikerjakan adalah cards, transisi, recap, contact sheet, manifest
dan README. Sesi ini menyelesaikannya.

---

## Ringkasan

| Kategori | Jumlah | Ukuran | Isi |
|---|---:|---:|---|
| `stills/**` | 44 | 2,51 MiB | 8 babak × 5 rasio + 4 varian suasana hero |
| `og/**` | 8 | 0,44 MiB | kartu Open Graph 1200×630 JPG |
| `overlays/**` | 9 | 9,72 MiB | partikel + grain (5 MP4, 4 WebM lama) |
| `motion/**` | 20 | 11,32 MiB | klip 10 dtk (16:9 + 9:16) + 4 klip situs 5 dtk |
| `cards/**` | 16 | 0,77 MiB | 8 desain × 2 rasio (WebP) |
| `transitions/**` | 10 | 0,58 MiB | 5 transisi × 2 orientasi, 2 dtk |
| `recap/**` | 1 | 5,56 MiB | montase 9:16, 44,5 dtk |
| `contact/**` | 8 | 0,50 MiB | lembar kontak untuk melihat semua aset sekilas |
| **Total** | **116** | **31,4 MiB** | durasi video terjumlah 352,5 dtk |

Inventori mesin lengkap (path, dimensi, durasi, fps, codec, byte) ada di
`manifest.json`.

---

## Daftar aset baru

### 1. Stills — `stills/<rasio>/<babak>.webp` (44)

Lima rasio: `2x3` 1024×1536, `3x2` 1536×1024, `9x16` 1080×1920,
`4x5` 1080×1350, `1x1` 1080×1080. Delapan babak, tiap rasio:

`00-hero` (potret model / berangkat) · `01-daftar` (formulir) · `02-latihan`
(kelas bahasa) · `03-wawancara` (interview) · `04-paspor` (dokumen) ·
`05-mcu` (tanda tangan kontrak) · `05-terbang` (bandara) · `06-tiba` (tiba di
Jepang, kimono + Fuji).

Crop memakai titik fokus per babak (`fx`/`fy` di `build/lib.mjs`), bukan
tengah frame, supaya wajah tidak terpotong. Grade: `warm` / `cool` / `dusk`.

Empat varian tambahan untuk A/B dan closing frame:

- `stills/3x2/00-hero--night.webp`, `stills/9x16/00-hero--night.webp`
- `stills/3x2/00-hero--mono.webp`, `stills/9x16/00-hero--mono.webp`

Peta ukuran + daftar plate: `stills/index.json`.

### 2. OG — `og/<babak>.jpg` (8)

`00-hero.jpg` … `06-tiba.jpg`, masing-masing 1200×630. Sengaja JPG (bukan
WebP) untuk crawler lama.

### 3. Overlay partikel — `overlays/*.mp4` / `*.webm` (9)

- `petals-1920x1080.mp4`, `petals-1080x1920.mp4` — kelopak sakura, 12 dtk
- `dust-1920x1080.mp4`, `dust-1080x1920.mp4` — debu cahaya, 12 dtk
- `grain-1920x1080.mp4` — grain 12 dtk, **9,5 MiB, berkas terbesar di pustaka**
- 4 berkas `.webm` dengan nama sama — encode awal pukul 16:37–16:38 yang
  kemudian digantikan MP4 pukul 16:44. **Pakai MP4**; WebM disimpan sebagai
  alternatif untuk editor yang tidak mau H.264. Keduanya `yuv420p` (tanpa
  alpha): dasarnya hitam, jadi dipakai dengan blend `screen`/`add`.

Frame partikel mentah ada di `overlays/_petals*/`, `overlays/_dust*/`
(bahan antara, tidak masuk manifest).

### 4. Motion — `motion/**` (20)

- `motion/16x9/<babak>.mp4` — 8 klip, 1920×1080, 10 dtk, 30 fps
- `motion/9x16/<babak>.mp4` — 8 klip, 1080×1920, 10 dtk, 30 fps
- `motion/site/03-wawancara.mp4`, `site/04-paspor.mp4` — 800×1076, 5 dtk, 24 fps
- `motion/site/wide-03-wawancara.mp4`, `site/wide-04-paspor.mp4` — 1248×664, 5 dtk, 24 fps

Resep kamera per babak ada di `MOVE` (`build/motion.mjs`): push / pull / pan /
rise, loop-safe (zoom memakai `cos`, pan memakai `sin`, jadi frame akhir
kembali ke frame awal). **Terukur:** beda frame pertama–terakhir (MAE) hanya
1,71–3,03 pada skala 0–255, artinya sambungan loop praktis tak terlihat.

Klip `site/03` dan `site/04` dibuat untuk menutup dua babak yang di situs masih
berupa gambar diam. **Belum dipasang** ke `StoryFilm.tsx` / `public/assets/` —
lihat bagian "Yang sengaja tidak diubah".

### 5. Cards — `cards/<rasio>/<nama>.webp` (16)

Delapan desain × `4x5` (1080×1350) dan `9x16` (1080×1920):

- `01-01-daftar`, `02-02-latihan`, `03-03-wawancara`, `04-04-paspor`,
  `05-05-mcu`, `06-05-terbang` — kartu babak
- `manifesto` — "Karier ke Jepang, dimulai dari sini." + "LET'S BUILD OUR FUTURE"
- `cta` — "Daftar sebagai Pelamar" / "Ajukan Kerja Sama"

**Semua teks verbatim** dari `src/lib/companyProfile.ts` (`FLOW_STEPS`) dan
`src/store/i18n.ts` (`profile.hero_*`). Tidak ada testimoni karangan, tidak ada
angka mitra/kandidat/keberangkatan. Latar = still yang sudah ada; judul
memakai Rajdhani 700 yang sudah ada di `deliverables/hero-3d/assets/`.

Sumber HTML tetap disimpan: `cards/source-4x5.html`, `cards/source-9x16.html`
— edit di sini lalu jalankan ulang `build/cards.mjs`.

### 6. Transitions — `transitions/<orientasi>/<nama>.mp4` (10)

Lima desain × `16x9` (1920×1080) dan `9x16` (1080×1920), masing-masing 2 dtk /
30 fps, dasar hitam untuk blend `screen`:

`01-petal-sweep` · `02-dust-dissolve` · `03-sakura-flash` · `04-ink-wipe` ·
`05-light-leak`.

Dua yang pertama memakai ulang overlay partikel; tujuh sisanya memakai
gradien yang dirender ke `transitions/_src/` (bahan antara).

### 7. Recap — `recap/satu-jalan-9x16.mp4` (1)

1080×1920, **44,5 dtk**: 8 klip 9:16 diambil 6 dtk tengahnya (mulai detik 2),
disambung 7 crossfade 0,5 dtk, fade-in 0,5 dtk dan fade-out 0,6 dtk. Urutan
sesuai alur: hero → daftar → latihan → wawancara → paspor → MCU → terbang →
tiba. Tanpa audio.

### 8. Contact sheets — `contact/*.webp` (8)

`stills-3x2.webp` · `stills-9x16.webp` · `og.webp` · `motion-16x9.webp` ·
`motion-9x16.webp` · `cards-4x5.webp` · `cards-9x16.webp` ·
`transitions-16x9.webp`. Tiap lembar diberi label nama berkas. Frame video
diambil ke `contact/_frames/` (bahan antara).

---

## Cara regenerate

Urutannya penting (tiap langkah memakai hasil langkah sebelumnya):

```bash
cd F:/astro
node deliverables/asset-library/build/stills.mjs       # stills + og
node deliverables/asset-library/build/overlays.mjs     # partikel + grain
node deliverables/asset-library/build/motion.mjs       # 20 klip
node deliverables/asset-library/build/cards.mjs        # 16 kartu (Playwright)
node deliverables/asset-library/build/transitions.mjs  # 10 transisi + recap
node deliverables/asset-library/build/contact.mjs      # 8 lembar kontak
node deliverables/asset-library/build/manifest.mjs     # inventori + verifikasi
```

Butuh `sharp`, `playwright` + Chromium (sudah ada di `node_modules`), dan
`ffmpeg`/`ffprobe` di PATH. `manifest.mjs` **exit 1** bila ada berkas kosong,
gambar yang dimensinya tak terbaca, atau video yang gagal di-`ffprobe`.

Terakhir dijalankan: **116 aset, 31,4 MiB, `verification.status = OK`,
0 problems.**

---

## Yang sengaja tidak diubah

- **Tidak ada satu pun berkas di `public/`, `src/`, atau `netlify/` yang
  disentuh.** Ini pustaka aset untuk dipakai nanti, bukan perubahan situs.
  opencode sendiri sebelum putus kuota memutuskan demikian: permintaannya
  adalah *generate*, bukan integrasi. Memasang `motion/site/*` ke
  `StoryFilm.tsx` masih terbuka sebagai pekerjaan terpisah (akan menggeser
  gerbang `verify:assets` dan butuh keputusan desain).
- Seluruh pustaka ada di `deliverables/**`, zona aman repo yang tidak terhitung
  indexer — jadi **tidak menggeser counter beku mana pun**.
- Semua klip **tanpa audio**. Semua klip H.264 `yuv420p` (klip situs 24 fps,
  sisanya 30 fps).
- `build/`, `_*`, `.stills.json`, `cards/source-*.html` adalah skrip/bahan
  antara dan **tidak** ikut dihitung di `manifest.json`.
- Pratinjau video sudah dicek manual lewat contact sheet: tidak ada frame
  hitam polos, tidak ada cast magenta (jebakan `blend` pada plane chroma
  sudah dihindari dengan `format=gbrp` di `build/motion.mjs`).
