# HANDOFF — Sesi 2026-11-11 (company profile: aset, tema, arah desain)

**Status:** repo bersih, tiga commit lokal, **belum di-push**. Sesi berikutnya tinggal
melanjutkan dari §4 — satu seksi sudah disiapkan lengkap di `deliverables/profil-audit/penempatan-next.txt`.

---

## 0. Kondisi repo saat ditinggal

| Hal | Nilai |
|---|---|
| HEAD | `9194e29` tema: profil kembali terang, panggung film tetap gelap |
| Dua commit sebelumnya | `bf17011` (dossier syarat/berkas) · `ebbec75` (paspor RI) |
| Working tree | **bersih** (hanya PNG tangkapan layar yang untracked) |
| Push | **TIDAK** — `main` git-linked, push = deploy berbayar |
| Drive | dikerjakan di `E:\astro`; di rumah biasanya `F:\astro` — **cek `pwd` dulu**, jangan salin path |

---

## 1. Tiga commit sesi ini

### `ebbec75` — frame 04: booklet kosong → paspor RI

Keluhan owner: *"paspor atau visa gambarnya kok kosong warna coklat doang"*.

Bukan cache. Plate 3:2 `04-dokumen.webp` hasil outpaint memang keluar sebagai **booklet
burgundy tanpa lambang dan tanpa huruf**; plate potretnya masih punya buku kecil di pojok,
tapi desktop memakai yang kosong. Dua plate digenerate ulang (wide dulu, potret
di-outpaint dari wide — kebalikan urutan sesi sebelumnya, hasilnya lebih setia):
paspor RI sampul hijau tua, Garuda emas, `REPUBLIK INDONESIA` / `PASPOR`.
80 KB + 64 KB, watermark dipotong 120/72 px.

Nama berkas ikut berganti `04-dokumen` → `04-paspor` (kedua plate) karena `/assets/*`
disajikan `immutable` setahun: ganti isi di nama lama = pengunjung lama tetap melihat
booklet kosong.

**Lubang gate yang ikut ditutup:** `StoryFilm.tsx` tidak ada di `DIRECT_REF_SOURCES`
`scripts/ci/verify-assets.mjs`, jadi kedua belas plate band selalu dilaporkan
"listed but not rendered" — peringatan yang terbaca seperti pembukuan basi, padahal
artinya gate tidak melihat band sama sekali. Dibuktikan MEMBUNUH: path `04-pasporx.webp`
→ `PUBLISHED BUT MISSING` + `GATE FAILED`.

### `bf17011` — blok syarat & berkas jadi plat penutup film

Blok "Persyaratan & Dokumen" adalah satu-satunya bagian **di dalam** `#alur` yang masih
bahasa editorial: dua daftar telanjang, tanpa gambar. Yang dipinjam dari skill
`scroll-cinema` bukan panggung kedua (hukum 1: satu seam), melainkan tata bahasanya di
skala seksi — judul kapital 700 / `line-height .98` / tracking −0,02em, garis rambut,
angka tabular, satu still sebagai prop.

Aset baru `story/04-paspor-detail.webp` (480×640, 40 KB) = `extract()` dari master PNG
yang sama ⇒ **nol kredit**. Dipakai 1:1 di layar 2x.

Tiga susunan dibuang karena terukur gagal: still di baris judul (lubang 320 px), still di
atas kolom kanan (dua daftar tidak sejajar), still di tengah pada 900 px (28% kolom,
bobotnya hilang). Solusi akhir: kolom ke-3 15rem di ≥1024 px · rata kiri 18rem di
768–1023 px · tengah hanya di ponsel.

Kunci i18n baru: `profile.req_general_title` (id "Syarat umum" / jp 応募資格).

### `9194e29` — tema terang dikembalikan, panggung film tetap gelap

Pertanyaan owner: *"theme nya yg asli light sama dark kalau di bikin gini company profil
auto dark theme donk"*. **Benar.** `themeLock="dark"` membuat beranda satu-satunya halaman
tanpa versi terang, padahal `src/store/theme.ts` mencatat keputusan owner 2026-09-20:
beranda **terang** (palet sakura), mode gelap tetap ada.

Dilepas: `themeLock` + blok yang menimpa seluruh token warna di `body`.
Dipertahankan: tata bahasanya (judul kapital, garis rambut, sudut 3 px) — selektornya
pindah ke `main`, jadi jalan di dua tema. Grade gambar `saturate .72 / brightness .86`
sekarang hanya `[data-theme='dark']`.

Dua cacat yang muncul begitu tema terang hidup lagi:
1. kelopak `#sakura-particles` (fixed, hanya tema terang) terbang **di atas** plat paspor.
   Sekarang padam selama panggung film in-view (opacity, bukan display — 30 kelopak tidak
   dibuat ulang);
2. `e2e:contrast` menolak chip angka "04": 1,08:1, karena gate mengukur terhadap latar
   **halaman**, bukan foto. Angka itu sekarang chip gelap.

---

## 2. Keadaan halaman sekarang

```
/  ── hero (foto, serif H1)
   └─ #alur  ── BAND FILM 7 frame (sticky, 7×72svh+100svh)
   │            · 6 babak + coda · klip 01/02/05/06 · wide 1536×904 / potret 1024×1464
   │            · chrome: braket, rel, koordinat, progres 2 px
   └─ dossier ── syarat & berkas (plat penutup film, still paspor 04)
   └─ 16 seksi profil lain — masih bahasa editorial (kartu, ikon, grid)
```

| Tema | Keadaan |
|---|---|
| `/` | **terang secara default**, ikut `asjTheme`; tidak ada tombol tema di beranda |
| `/loker` | terang, tanpa tombol |
| `/apply`, `/siswa-baru` | terang, **punya** tombol tema |
| Panggung film | selalu gelap di tema apa pun (ia gambar; semua teks di atasnya pakai nilai tak bertema) |

---

## 3. Keputusan owner sesi ini: arah **B**

Owner memilih **B — perluas film ke 3–4 seksi**: Program, Penempatan, Fasilitas,
Testimoni jadi babak film; seksi teks (harga, FAQ, kontak) tinggal sebagai *intertitle*.

Alasan diagnosis (dari teardown `scroll-cinema`): situs Pioneer itu **satu warna (#000)**
dan **satu pengalaman vertikal** — filmnya *adalah* situsnya, skor animasi 10,00 vs
aksesibilitas 6,67. Kita punya band 7 babak + 16 seksi. Yang tercapai baru ~40% idenya.

**Aturan main yang tidak boleh dilanggar saat mengerjakan B:**
- halaman tetap punya **SATU panggung** (`#alur`). Babak baru = *still chapter*
  (plat penuh + scrim + copy + credit), **bukan** track/sticky kedua;
- jangan ulang plat yang sama di dua skala kecuali ia berperan sebagai **prop**
  (itu alasan dossier memakai crop detail, bukan plat penuh);
- angka/klaim tidak boleh dikarang; testimoni tidak boleh dibuat-buat.

---

## 4. Rencana B — urutan kerja

### 4.1 `#penempatan` — SIAP DIKERJAKAN (paling matang)

Berkas: **`deliverables/profil-audit/penempatan-next.txt`** — berisi markup lengkap,
CSS lengkap, dan 7 langkah pemasangan berurutan. Ringkasnya:

1. salin `deliverables/story-3d/assets/wide/05-terbang.webp` (1536×904, 47 KB) →
   `public/assets/story/wide/05-terbang.webp` — plat keberangkatan yang selama ini
   **menganggur** sebagai spare, dan paling pas untuk seksi "Penempatan";
2. daftarkan di `ILLUSTRATIONS` (`scripts/ci/verify-assets.mjs`) sesudah
   `story/wide/04-paspor.webp`;
3. ganti `<Section id="penempatan">…</Section>` (baris **501–609** pada `9194e29`)
   dengan markup di berkas itu;
4. tempel CSS-nya sebelum komentar *"Ponsel DAN reduced-motion …"* di `<style is:global>`;
5. gate + probe (`probe-dual.mjs`), lalu bandingkan `dual-light-*`.

Peta kartun `penempatan-banner` **tidak dibuang** — turun pangkat jadi diagram kecil
(20rem) di kolom kanan, karena bahasanya beda dari plat film. Kalau owner mau bersih:
hapus `<figure class="still-map">` + tiga berkas banner + entrinya di `ILLUSTRATIONS`.

### 4.2 `#program` — strip tiga still

Isi sekarang: `IconTileGrid` (3 kartu) + 2 `Card` (biaya, sudah termasuk).
Rencana: tiga still berjajar **edge-to-edge** tanpa kartu (contact sheet), judul kapital
di atas, lalu baris credit untuk harga & isi program (pakai pola `.still-*`).

⚠ **Batas resolusi:** `program-magang/ssw/bahasa.webp` hanya **600×400**. Pada 1440 px
tiga kolom ≈ 480 px CSS ⇒ butuh 960 px di layar 2x = upscale 1,6x. Pilihan:
(a) batasi tinggi strip (mis. 46svh) supaya kolom ≤ 420 px;
(b) regenerate 3 plate (kredit);
(c) jadikan satu plat penuh 3:2 (butuh 1 plate baru, kredit).

### 4.3 `#fasilitas` — strip foto

`fasilitas-gedung.webp` 1000×666, `fasilitas-grup-*.webp` 800×438. Aman untuk strip
dengan kolom ≤ 500 px CSS. Sama: tanpa kartu, garis rambut, judul kapital.

### 4.4 `#testimoni` — intertitle (tanpa gambar)

Tidak ada aset dan **tidak boleh** mengarang wajah/kutipan. Bentuk: tipografi besar
saja — agregat rating (4.8 · 20, satu ikon + angka, aturan lama) sebagai satu baris kecil,
lalu kartu ulasan yang ada sekarang diturunkan menjadi daftar bergaris (bukan kartu).
Ini yang paling murah dan paling cepat menutup jarak "brosur".

### 4.5 Sesudah empat seksi itu

Satukan seksi teks (visi-misi, legalitas, faq, kontak) sebagai **intertitle**: judul
kapital + garis rambut + satu paragraf pendek, tanpa kartu. Baru setelah itu halaman
terbaca sebagai satu film, bukan film + brosur.

---

## 5. Jebakan yang sudah dibayar — jangan diulang

1. **`themeLock` jangan dihidupkan lagi.** Beranda wajib punya versi terang; kalau butuh
   suasana gelap, itu urusan plat, bukan urusan tema halaman.
2. **Kelopak sakura di atas panggung.** `#sakura-particles` hanya hidup di tema terang
   dan `position: fixed`. Setiap band gelap baru harus memadamkannya (sudah ada di
   IntersectionObserver `#alur`).
3. **`e2e:contrast` mengukur terhadap latar HALAMAN.** Teks di atas gambar harus punya
   latar sendiri (chip/plate), kalau tidak ia dianggap 1,0:1 dan gate merah.
4. **`/assets/*` immutable setahun.** Ganti isi = ganti nama berkas, selalu.
5. **`verify-assets` membaca path LITERAL**; path yang dirakit dari variabel tak terlihat.
   `StoryFilm.tsx` sekarang sudah masuk `DIRECT_REF_SOURCES` — jangan dicabut.
6. **Counter indexer beku** (`indexer/src/{discover,build,parse}.test.ts`) milik team-lead.
   Berkas baru di `src/` menggeser `files.length`; berkas di `public/` tidak.
7. **vitest** harus `--project=<frontend> --pool=vmForks` dengan `NODE_OPTIONS=` kosong;
   tanpa `--project` error `sequence.groupOrder`.
8. **`server.cjs` tidak memampatkan** ⇒ angka perf ~6× terlalu besar. Ukur lewat
   `deliverables/serve-gzip.mjs`.
9. **Watermark generate**: gambar kanan-bawah (potong 72/120 px), video kiri-atas.

---

## 6. Perintah (copy-paste)

```bash
cd /e/astro            # atau F:/astro di rumah — cek pwd dulu

# gate cepat
npm run verify:assets && npm run verify:classes && npm run typecheck && npm run lint-ratchet

# suite frontend (2 menit)
NODE_OPTIONS= node node_modules/vitest/vitest.mjs run --project=frontend --pool=vmForks

# build + gate yang butuh dist
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build
npm run bundle:size && npm run e2e:landing && npm run e2e:headings && npm run e2e:contrast

# tangkapan layar dua tema (butuh build segar)
HTTP_PROXY= NO_PROXY=localhost,127.0.0.1 node deliverables/profil-audit/probe-dual.mjs
# hasil: deliverables/profil-audit/dual-{light,dark}-{atas,film,dossier,program}.png
```

---

## 7. Terbuka — butuh keputusan owner

| # | Hal | Kenapa belum dikerjakan |
|---|---|---|
| 1 | **H1 hero masih serif baliho**, sedangkan film + semua seksi kapital grotesque | aturan #3 skill menyebut "bukan baliho serif", tapi serif itu wajah merek — keputusan owner |
| 2 | **Peta kartun** di `#penempatan`: dipertahankan sebagai diagram kecil atau dibuang | bahasa gambarnya beda dari plat film |
| 3 | **Anggaran kredit** untuk plate baru (`#program`, `#fasilitas`) | tiap plate 5–10 kredit |
| 4 | Sisa pekerjaan lama: potongan 9:16 untuk Reels, VO Bahasa Indonesia, CTA band masih `<b>` (belum bisa diklik) | di luar lingkup B |

---

## 8. Kalau lanjut di rumah

1. `cd F:/astro` (atau `E:/astro`) — **cek `pwd`**, jangan salin path dari sesi ini.
2. `git log --oneline -3` → harus melihat `9194e29`, `bf17011`, `ebbec75`.
3. Baca ulang **§4.1** dan buka `deliverables/profil-audit/penempatan-next.txt`.
4. Kerjakan satu seksi, ukur, commit lokal. **Jangan push.**
5. Log sesi ditulis di `.workbuddy-ai/memory/2026-11-11.md` (gitignored, tidak ikut commit).
