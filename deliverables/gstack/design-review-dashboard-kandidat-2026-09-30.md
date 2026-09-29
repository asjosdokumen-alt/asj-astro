# Design review — Dashboard Kandidat `/candidate`

**Tanggal:** 2026-09-30 · **Rute:** `/candidate` · **Deliverable visual:**
`_review-dashboard-kandidat-2026-09-30.html` (buka di browser, ada toggle tema)

**Cara mengukur.** Halaman dijalankan sungguhan di `chromium` headless terhadap
`astro dev`, viewport **1280×900** dan **390×844**, tema **terang dan gelap**,
dengan fixture sesi kandidat (`asj_auth`) + `POST /.netlify/functions/get-app-data`
di-fulfill lokal. Fixture sengaja diisi penuh (VIP, `catatanExt`, 3 entri riwayat,
1 jadwal, biodata lengkap) supaya yang terukur adalah **kasus terburuk**, bukan
dashboard kosong. Semua angka di bawah berasal dari `getBoundingClientRect()` dan
`getComputedStyle()` — bukan dari membaca CSS.

---

## Diagnosis

Keluhan pemilik: *"kartunya kek redundant"* dan *"masih kurang sreg"*. Keduanya
benar, dan keduanya punya sebab terukur yang berbeda.

### Sebab 1 — lima blok menjawab satu pertanyaan

"Seberapa lengkap saya?" dijawab oleh **5 blok**:

| Blok | Yang dicetak |
|---|---|
| CrownBadge (di dalam dossier) | 50% |
| CV Progress | "Profil (Data Dasar) 100%" + "Profil (Data Lengkap) 0%" (dua bar) |
| StepGuide | "Lengkapi berkas yang kurang" |
| LevelCard | "Setengah Jalan **50%**" + bar + "CV Mini: 100% · Master Profil: 0%" + "Kurang 50% lagi" |
| Progres Pemberkasan | "0%" + "0/18 dokumen" + checklist 18 baris |

Terukur di DOM: **7 string persen** (`100%, 0%, 50%, 100%, 0%, 50%, 0%`) dan
**12 bar progres**. `100%` dan `0%` masing-masing tampil **dua kali**; `50%` dua
kali. Baris `CV Mini: 100% · Master Profil: 0%` di LevelCard mencetak **angka yang
sama persis** yang sudah ditampilkan CV Progress sebagai bar, dua kartu di atasnya.

### Sebab 2 — tepi kolom berzig-zag

Empat tepi kiri berbeda dalam satu kolom: `185 · 226 · 345 · 441`. Empat lebar:
`896 / 814 / 576 / 384`. Penyebabnya `<div class="glass-panel … max-w-4xl">` yang
di dalamnya bersarang `max-w-sm` (1×) dan `max-w-xl` (5×).

Ini melanggar aturan repo sendiri:

- `DESIGN.md §4.1` — "Kontainer **satu**: `max-w-7xl mx-auto px-4 md:px-6`".
- `DESIGN.md §3.5` — "Padding dalam kartu **wajib sama** untuk semua kartu".
  Yang dipakai: `p-3`, `p-4`, `p-5`, `p-6`, `p-7`, `p-8`.

### Sebab 3 — sisa mode gelap bocor ke tema terang (default)

`CandidateDash.tsx:601` memakai latar **literal**:

```jsx
<div class="bg-[#0f172a] rounded-[1.3rem] p-5 md:p-7">
```

Diukur pada **tema terang**: latar efektif label `PILIH LOKER:` =
`rgb(15, 23, 42)` — yaitu `#0f172a` itu sendiri. Rasio kontras **2,54** (gelap:
**2,10**). Ambang AA teks 11 px = 4,5.

Ini satu-satunya hex literal di seluruh `src/components/candidate/` — jadi
perbaikannya satu baris.

Kontras gagal lain (kedua tema):

| Elemen | Terang | Gelap | Ukuran |
|---|---|---|---|
| `PILIH LOKER:` | **2,54** | **2,10** | 11 px |
| "Klinik Sehat Ponorogo" (kartu Jadwalmu) | **2,99** | **2,47** | 12 px |
| "Pilih data dasar untuk profil singkat…" (di atas gradien) | tak terukur | tak terukur | 13 px |
| `JOB / BIDANG YANG DILAMAR:` | 4,70 | 4,79 | 11 px |
| `VERIFIED CANDIDATE` | 5,73 | 8,07 | 11 px |

Dua kartu juga memakai gradien gelap-only (`from-amber-950 to-rose-950`,
`from-sky-950 to-indigo-950`) yang di tema terang jadi balok cokelat/navy.

### Sebab 4 — sisanya

| Temuan | Terukur | Aturan |
|---|---|---|
| Outline heading | **0 h1, 0 h2**; outline mulai dari `h3` | `§6.1` |
| Bar progres | 12 bar, **1** ber-`role="progressbar"` | `§6.6` |
| Kotak bergaya kartu | **26** elemen; **39** dengan radius ≥24 px | `§4.2` (maks 8–10) |
| Kedalaman bersarang | **4** tingkat border+radius | — |
| Skala radius | 4 dari 5 token dipakai **plus** 2 literal (`rounded-[2rem]`, `rounded-2xl`) | `§3.4` |
| Anatomi header kartu | **4 pola berbeda** + 1 kartu tanpa judul | — |
| Tombol aksi | **7** tombol, bobot setara, tanpa CTA utama | — |
| Tinggi halaman | 3481 px (3,9 layar) desktop · 4127 px (4,9 layar) ponsel | — |

---

## Usulan

### Inti: 5 sumber progres → 1 bar bersegmen

Satu bar, tiga segmen berlabel — **tanpa data baru, tanpa request baru**. Semua
angka sudah ada di `computeCvMiniProgress`, `computeCvMasterProgress`,
`computeOverallProgress`, dan `berkasProgress`.

```
[■■■■■■■■■■■□□□□□□□□□□□□]  50% lengkap
● CV Mini 100%   ● Master 0%   ● Berkas 0/18
Langkah berikutnya: lengkapi berkas — 50% lagi untuk tingkat Gold.
```

Kartu `CV Progress` dan `LevelCard` berhenti jadi kartu berdiri sendiri.
`CrownBadge` jadi chip di sebelah nama.

Aturan di `LevelCard.tsx` / `StepGuide.tsx` **tetap berlaku**: ini meter
kelengkapan, bukan skor seleksi. Penggabungan justru **mengurangi** risiko salah
baca, karena konteksnya cuma muncul sekali.

### Tata letak: grid + rail, satu tepi

Ikuti `§4.3` (pola "satu DOM, dua bentuk"):

```
≥1280px:  grid-template-columns: minmax(0,1fr) 22rem
  main  : langkah berikutnya → lamaran terkini → lamaran lama (lipat) → berkas (lipat)
  rail  : jadwal → pesan admin → aksi cepat
<1280px: satu kolom, urutan DOM sama
```

Dua tepi kiri saja. Satu CTA utama ("Unggah berkas"); 6 aksi lain jadi sekunder.

### Yang ditambahkan (belum ada)

1. **`h1` sapaan + konteks** — "Halo, Budi 👋 · Lamaran TG591ASJ · PEMBERKASAN".
   Sekarang halaman dibuka oleh furnitur brand, bukan orientasi.
2. **`h2` per seksi nyata**, sesuai `§6.1`.
3. **Ringkasan riwayat** — 2 lamaran memakan 1033 px di ponsel karena tiap entri
   merender pipeline 10 tahap penuh. Terbuka hanya untuk lamaran terkini.
4. **Checklist 18 dokumen jadi `<details>`** — 442 px di ponsel untuk daftar
   rujukan yang isinya masih 0/18.
5. **`role="progressbar"`** pada bar yang tersisa.

---

## Urutan pengerjaan

Satu langkah per commit; `vitest` dulu, baru `astro build`.

| # | Langkah | Sentuh | Dampak |
|---|---|---|---|
| 1 | Ganti `bg-[#0f172a]` → token; dua gradien gelap → token tema. **Bug**, bukan selera | 1–3 baris | tinggi |
| 2 | Satukan tepi kolom; hapus `max-w-sm`/`max-w-xl` bersarang; seragamkan padding + radius | `CandidateDash.tsx` | tinggi |
| 3 | Gabung 5 progres → 1 bar bersegmen | `CandidateDash`, `LevelCard`, `StepGuide` | tinggi |
| 4 | Tambah `h1` + `h2`; turunkan nama brand dari `h3` → `div` | `CandidateDash`, `AsjDossierCard` | sedang |
| 5 | Lipat checklist 18 dokumen + lamaran lama ke `<details>` | `CandidateDash` | tinggi |
| 6 | Satu CTA utama + menu overflow | `CandidateDash` | sedang |
| 7 | Rail 22rem di ≥1280 px (`§4.3`) | `candidate.astro`, `CandidateDash` | sedang |
| 8 | Perbaiki kontras + `role="progressbar"` | `CandidateDash` | sedang |

⚠ Langkah 2–8 menyentuh `CandidateDash.tsx`, yang diuji
`CandidateDash.test.tsx` (714 baris) dan `e2e/test-candidate-modals.mjs`.
Langkah 3 berpotensi menggeser penanda yang di-assert test (`data-level`,
`data-step-guide`) — periksa keduanya sebelum mengubah.

---

## Batas review ini

- Yang diukur adalah **DOM yang dirender**, bukan data produksi. Fixture
  merepresentasikan kandidat dengan data lengkap; kandidat kosong akan terlihat
  berbeda (lebih banyak blok yang hilang, karena beberapa blok di-`omit` bila
  nilainya kosong).
- **Tidak ada berkas sumber yang diubah** dalam review ini. `CandidateDash.tsx`,
  `LevelCard.tsx`, `StepGuide.tsx`, `AsjDossierCard.tsx` hanya dibaca.
- Skrip pengukuran ditulis **di luar repo** (`F:/tmp/ui-probe/`) supaya tidak
  menggeser inventaris beku indexer (`includePath()` hanya menerima
  `src/`, `netlify/functions/`, `shared/`, `scripts/`, `e2e/`, dan root).
