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
| Status | selesai, ter-commit | jalan, tinggal diisi klip video |

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

1. **3 klip video** (hero, latihan, tiba) untuk menghidupkan wajah: kedip, napas,
   rambut. Biaya 50–100 kredit/klip 5 s. Owner memilih ini sebelum kredit habis.
   Sumber: `assets/00-hero.png`, `02-latihan.png`, `06-tiba.png` (master PNG,
   ada di disk, **tidak** di-track git).
   Setelah jadi: ganti `.photo img` jadi `<video muted loop playsinline>` dan
   putar hanya babak yang terlihat.
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
