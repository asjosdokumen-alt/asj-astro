# HANDOFF — “Satu Jalan” (sesi 2026-11-10 → 11-11)

**Status:** dua desain jadi dan bisa dibuka. **Generate berbayar berhenti** — kredit
owner habis, pindah email. Sisa pekerjaan yang butuh kredit dicatat di §5.

---

## 1. Dua hasil, dua bahasa

| | `deliverables/story-video/` | `deliverables/story-3d/` |
|---|---|---|
| Bentuk | **video** 80 detik (16:9) | **website scroll** 7 babak |
| Berkas | `index.html` (animatic), `out/*.mp4`, `out/loop-hero.gif` | `index.html`, `assets/*.webp` |
| Aset | ilustrasi lama situs | **render baru**, wajah diambil dari hero ASJ |
| Status | selesai, ter-commit | jalan, **seragam + 3 klip sudah masuk** (2026-11-11) |

Buka `deliverables/story-3d/index.html` di browser — scroll dari atas.
`#3` di URL untuk lompat ke babak 4. `space` tidak dipakai di sini.

---

## 2. Temuan dari video referensi (file lokal owner)

`F:\YTDown.com_YouTube_Media_yi7Gjy0JIns_Pioneer-corn-revolutionized_004_720p.mp4`
— 1280×720, 60 fps, 58,05 s, 18,3 MB.

Diukur, bukan dikira:

| Ukuran | Hasil | Artinya |
|---|---|---|
| Potongan (`scene>0.06`) | **9 dalam 58 s** | rata-rata ~6,4 s per shot |
| Audio | **−91 dB (senyap)** | tidak ada musik, tidak ada VO |
| Gerak dalam shot | kamera **terus** bergerak | ini yang membuat terasa video, bukan foto |

Konsekuensi desain: **tanpa suara**, **potongan sedikit**, **kamera tidak pernah diam**.
Versi scroll-3d sudah mengikuti tiga hal itu.

---

## 3. Yang sudah jalan di `story-3d`

- 7 babak × 100vh, kamera dolly di `perspective:1200px`.
- Plate potret 2:3 dengan mask radial radius **50%** → tepi larut ke hitam.
- Latar = thumbnail blur 48 px (`assets/blur/`, 11 KB total) — **bukan** `filter:blur()`
  runtime. Ini bukan optimasi kosmetik: lihat §4.
- Grain hidup (canvas 160×90, diganti tiap 3 frame), debu + bokeh, sapuan cahaya.
- Teks bergerak di Z berbeda; dissolve tanpa lubang di batas babak.
- Rail navigasi 7 titik, label koordinat, penghitung babak.

---

## 4. Empat jebakan yang sudah dibayar — jangan diulang

1. **`.types` wajib `position` + `z-index`.** Tanpa itu `.scene{z-index:1}` melukis
   **di atas** teks; seluruh narasi jadi nyaris tak terlihat dan sulit didiagnosis.
2. **Mask radial: radius harus `50%`.** Dengan `64%`, tepi elemen ada di 78% radius
   (masih ~35% opaque) → muncul **garis vertikal keras** di sisi gambar.
3. **`maxScroll` diukur sekali di awal itu salah.** Tinggi dokumen berubah setelah
   font/gambar masuk; target scroll tidak pernah sampai, dan semua teks tertangkap
   di tengah fade-in (tampak abu-abu). Ukur ulang + hitung tiap frame.
4. **`filter: blur(46px)` full-screen bikin render loop ~10 fps**, sehingga lerp
   scroll tidak pernah konvergen (p=0.285 padahal scroll 0.350). Ganti dengan
   thumbnail blur. Lerp juga harus **berbasis waktu** (`1 - exp(-dt*k)`), bukan
   per-frame (`*0.10`).

Cara memeriksa: `node deliverables/story-3d/_probe.mjs` lalu
`node F:/tmp/diag3.mjs` (membandingkan `p` scroll nyata vs `window.__p()` internal;
keduanya harus sama).

---

## 5. Yang belum — urut prioritas

1. ~~**3 klip video** (hero, latihan, tiba)~~ **SELESAI 2026-11-11** — lihat §9.
   Catatan lama: biaya 50–100 kredit/klip 5 s. Sumber: `assets/00-hero.png`,
   `02-latihan.png`, `06-tiba.png`.
2. **Potongan 9:16** untuk Reels/TikTok: 60 s, buang shot 01, teks naik ke
   sepertiga atas (UI Reels menutup bawah).
3. **Suara** — referensi senyap; kalau mau VO Bahasa Indonesia, seluruh ritme
   harus diulang (bukan ditambahkan).
4. **CTA** masih `<b>`, belum `<a>`. Arahkan ke formulir `/apply` dan WhatsApp.
5. **Konfirmasi owner:** angka `47 prefektur` di babak 05 (aturan internal melarang
   angka mitra/kandidat/keberangkatan; prefektur bukan ketiganya, tapi belum
   dipastikan).

---

## 6. Aset

| Berkas | Isi | Di-track? |
|---|---|---|
| `story-3d/assets/*.webp` | 7 render, 840 KB | ya |
| `story-3d/assets/*.png` | master 1024×1464, 13 MB | **tidak** (`.gitignore`) |
| `story-3d/assets/blur/*.webp` | latar blur 48 px, 11 KB | ya |
| `story-video/out/*.mp4` | video 80 s, 12,5 MB | **tidak** (regenerable) |

Wajah: semua render dibuat dari `public/assets/ilustrasi/hero-sakura@2x.webp`
(image-to-image, `input_fidelity: high`). Wajah karangan yang sempat dibuat
sudah dihapus — jangan dipakai lagi.

---

## 7. Perintah

```bash
# potret 7 babak + uji kamera/dissolve
node deliverables/story-3d/_probe.mjs

# (story-video) rekam ulang 80 s lalu encode
node deliverables/story-video/_record.mjs
ffmpeg -ss 1.25 -i out/page@*.webm -t 80 -vf "fps=25,format=yuv420p" \
  -c:v libx264 -preset medium -crf 20 -movflags +faststart out/ASJ-Satu-Jalan-animatic-16x9.mp4
```

Offset `1.25` **diukur** dengan `signalstats` (hero mulai detik 7,25), bukan ditebak.

---

## 8. Kalau lanjut di sesi baru

Mulai dari sini: buka `deliverables/story-3d/index.html`, scroll penuh sekali,
lalu baca §5. Yang paling menentukan hasil akhir adalah **klip video 3 babak** —
tanpa itu, gambarnya tetap still yang digerakkan kamera, bukan wajah yang hidup.

---

## 9. Sesi 2026-11-11 — seragam per tahap + 3 klip

**Permintaan owner:** jaket beige yang dipakai di semua render itu "random" — model
harus pakai baju LPK Amanah, dan bajunya ikut tahap. **Tanpa hijab**, mengikuti
model hero aslinya.

| Babak | Pakaian | Alasan |
|---|---|---|
| 00 hero | polo Amanah | titik mulai = peserta baru |
| 01 daftar | polo Amanah | formulir = hari pertama |
| 02 latihan | polo Amanah | masih di kelas |
| 03 wawancara | kemeja putih + blazer hitam | "putih hitam" dari owner |
| 04 dokumen | lengan polo + manset magenta | tangan saja, seragam tetap terbaca |
| 05 terbang | jaket beige (bebas) + badge Amanah | "bebas tapi ada Amanah-nya" |
| 06 tiba | kimono ivory + obi merah | "jepang pakai kimono" |

Seragamnya: polo hitam arang, trim magenta di kerah/placket/ujung lengan, lengan
panjang hitam di dalam, celana hitam. **Badge dada = logo PWA**
(`public/icons/icon-512.png`): cincin merah, laurel emas, torii + Fuji.

### Tiga jebakan yang sudah dibayar

1. **Watermark beda tempat per modality.** Gambar: kanan-bawah ("AI生成 WORKBUDDY").
   Video: **kiri-atas**, pil kecil. Keduanya dipotong dengan `crop` — gambar
   `1024x1536 -> 1024x1464` (buang 72 px bawah), video `800x1148 -> 800x1076`
   (buang 72 px atas). Tanpa ini, aset tidak layak tayang.
2. **Image-to-video MENULIS ULANG teks di latar.** Klip latihan pertama: hiragana
   di papan berubah tiap frame (あかかあ → あただた → …). Prompt "jangan ubah" saja
   tidak cukup; yang berhasil adalah **"foto diam dengan orang hidup di dalamnya"**
   + kamera nyaris tanpa geser. Klip pertama ditolak.
3. **Kimono indigo hilang di babak 06.** Mask radial + veil bawah memudar di bawah
   frame, jadi kain gelap jadi silhouette. Diganti kimono ivory + obi merah supaya
   terbaca. Pelajaran: warna pakaian harus lebih terang dari latar, karena tepi
   bawah plate selalu dipudarkan.

### Cara memasang klip

`.photo img` → `.photo img,.photo video` (mask/filter sama). Tiap babak yang punya
klip diberi `vid:` di `CH`; elemennya `<video muted loop playsinline preload="none"
poster="…webp">`. Di `render()`, saat `best !== active`: klip babak aktif `play()`,
sisanya `pause()`. Terukur: hanya 1 decoder jalan, dan klip yang belum disentuh
tetap `readyState 0` (tidak ikut diunduh).

| Klip | Ukuran | Durasi |
|---|---|---|
| `assets/clips/00-hero.mp4` | 440 KB | 5,04 s |
| `assets/clips/02-latihan.mp4` | 302 KB | 5,04 s |
| `assets/clips/06-tiba.mp4` | 425 KB | 5,04 s |

Semua 800×1076, 24 fps, tanpa audio, CRF 26.

**Yang belum:** babak 01/03/04/05 masih still, potongan 9:16, VO, CTA masih `<b>`.
Animatic di `story-video/` masih memakai ilustrasi lama — belum disamakan.

---

## 10. Sesi 2026-11-11 (lanjutan) — band `#alur` jadi FRAME FILM

**Permintaan owner:** "lanjut dan sempurnakan, bikin mirip dengan web video contoh
[Pioneer corn revolutionized], tapi dengan model company profil kita … jadi PWA
kita mantul."

Versi sebelumnya masih bahasa **editorial**: dua kolom, plat potret 2:3 sebagai
kartu, judul serif huruf kecil, 60% frame kosong. Yang dibaca dari referensi dan
sekarang dipakai di situs:

| # | Aturan referensi | Terjemahan di `#alur` |
|---|---|---|
| 1 | satu subjek menutup frame | plat 3:2 `object-fit:cover` selebar layar, tanpa bingkai |
| 2 | teks kecil di kiri, selalu di sisi yang sama | scrim satu arah dari kiri + copy rata kiri |
| 3 | tipografi kapital, bukan baliho serif | Inter 900 uppercase, `line-height .94`, tracking −0,025em |
| 4 | teks berganti DI DALAM shot | ketukan 1 = judul; ketukan 2 (38% babak) = badan + garis |
| 5 | kamera tidak pernah diam | dorong 6% + geser 2,4% per babak |
| 6 | chrome alat ukur | braket sudut, rel babak, garis progres 2 px, koordinat |
| 7 | potongan tidak metronomis | babak berikutnya MENUTUP yang sekarang (dissolve 12%) |

### Aset baru — 6 plat 3:2 + 1

`assets/wide/{01-daftar,02-latihan,03-wawancara,04-paspor,05-mcu,06-tiba}.webp`
— 48–69 KB masing-masing, total ±395 KB. Semua di-outpaint dari potret yang sudah
ada (`input_fidelity: high`), watermark dipotong `crop=1536:904:0:0` (buang 120 px
bawah). Sumber PNG 13 MB TIDAK di-track (`.gitignore` baris baru).

> **04 berganti nama 2026-11-11.** Semula `04-dokumen`; plate 3:2-nya keluar sebagai
> booklet burgundy **kosong** (tanpa lambang, tanpa huruf) sehingga terbaca sebagai
> kotak coklat di band full-bleed. Kedua plate digenerate ulang: paspor RI sampul
> hijau tua, Garuda emas, `REPUBLIK INDONESIA` / `PASPOR`. Nama ikut berganti karena
> `/assets/*` di-cache `immutable` setahun.

`00-hero.webp` dan `05-terbang.webp` disimpan di sini sebagai **spare**, tidak
dipakai situs: hero untuk closing band, keberangkatan untuk langkah yang belum ada.

### Satu koreksi konten, bukan kosmetik

Langkah 05 berjudul **"Document Preparing"** (MCU, tanda tangan kontrak, COE)
tetapi platnya adegan bandara — warisan pemetaan lama. Sekarang langkah 05 memakai
plat baru: tangan menandatangani formulir dengan stetoskop. Adegan bandara tidak
punya langkah yang cocok di daftar pemilik (langkah 06 = paspor/visa/EKTLN, masih
di Indonesia), jadi ia dikeluarkan dari band.

### Tiga jebakan yang dibayar di sesi ini

1. **§9f men-scale pembungkus 0,982 → 1,008.** Pada band full-bleed skala itu
   terbaca sebagai celah terang **13 px** di tepi kiri plat. `Section` sekarang
   punya prop `drift={false}`: `data-enter` tetap (wipe `curtain` jalan, oracle
   `sectionMotion.ts` cocok), `data-scroll` dilepas.
2. **`.map()` di template `.astro` = unresolved global.** Indexer hanya me-resolve
   identifier template terhadap scope frontmatter, jadi parameter callback
   dilaporkan sebagai `i`/`step` (13 entri) dan `build.test.ts` merah. Markupnya
   pindah ke `src/components/public/StoryFilm.tsx`; CSS-nya tetap di
   `index.astro` sebagai `<style is:global>` karena style scoped Astro memakai
   `[data-astro-cid-…]` yang tidak dimiliki elemen dari berkas lain.
3. **Mask radial harus radius 50%.** Dengan 62%/66% tepi atas plat potret masih
   ~20% opaque dan terbaca sebagai garis lurus keras di tata letak bertumpuk.

### Angka yang bergerak (terukur, bukan diturunkan)

`files.length` 662 → **663** · `tsx` 133 → **134** · `fileCount` 662 → **663** ·
`imports` 23 → **23** (22 terukur di HEAD; +1 `StoryFilm` = 23) · `symbols` 53 →
**53** (tetap: 3 konstanta media pindah ke `.tsx`) · `unresolvedRefs` 34 → **38**
(basi basi: 38 terukur di HEAD juga, histogram `cli.js unresolved` — enam bucket,
semuanya di berkas tes yang tidak disentuh sesi ini).

### Verifikasi

`vitest run` 286/286 berkas · `lint-ratchet` PASS · `e2e:landing` 17 seksi × 2
lebar PASS · `e2e:contrast` 0 di bawah lantai · `e2e:headings` PASS ·
`verify:assets` PASS · `verify:md` 77 berkas PASS.

**Yang belum:** `deliverables/story-3d/index.html` (berdiri sendiri) MASIH memakai
plat potret + judul serif — ia tidak ikut diubah, jadi sekarang ia versi lama dari
bahasa yang sama. Potongan 9:16, VO, dan klip untuk babak 01/03/04/05 juga belum.
