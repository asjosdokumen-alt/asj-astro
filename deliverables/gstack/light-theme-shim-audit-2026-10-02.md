# Audit celah shim tema terang — 12 sisa, 1 cacat nyata

**Tanggal:** 2026-10-02
**Lanjutan dari:** `admin-modals-polish-2026-10-02.md` (di sana 14 celah ditemukan, 2 diperbaiki, 12 dilaporkan)
**Pertanyaan sesi ini:** dari 12 celah sisa itu, mana yang **benar-benar** gagal kontras?
**Jawaban:** **satu.** Sisanya bukan cacat — dan setiap verdict punya bukti.

---

## 📌 TL;DR

- **12 celah → 6 diukur di peramban → 1 cacat nyata.** `bg-slate-600/50` (chip status fallback
  `CandidateProfileModal`) **3,70:1** di tema terang; diperbaiki → **6,08:1**.
- **5 sisanya bukan permukaan teks sama sekali** — titik indikator mengetik (`w-2 h-2`), garis
  konektor **1 px**, lingkaran ikon, dan blob `aria-hidden`. Dibuktikan dengan membaca strukturnya,
  bukan disimpulkan dari nama kelasnya.
- **1 dikecualikan kebijakan:** `bg-slate-700/40` ada di tombol **`disabled`**, dan
  `e2e/test-contrast.mjs:68` menyatakan sendiri bahwa keadaan *disabled* **tidak diukur**
  (WCAG 1.4.3 juga mengecualikan kontrol non-aktif).
- 🔴 **Aritmetika saya salah di percobaan pertama.** `bg-rose-950/30` saya prediksi **2,87 (gagal)**;
  yang terukur **5,75 (lulus)** — paletnya ditulis dalam `oklab`, dan campuran sRGB naif membacanya
  keliru. Yang menyelamatkan: mengukur, bukan menghitung.
- 🔴 **Tiga jebakan harness baru**, semuanya menghasilkan "kegagalan" yang meyakinkan dan salah —
  termasuk **toolbar dev Astro** yang memiliki piksel di dasar viewport.
- Gerbang sesudah perbaikan: tsc **0** · lint-ratchet **PASSED** · verify-classes **0** ·
  `e2e:contrast` **0 di bawah lantai seluruh situs**.

---

## 🎯 Kartu kesimpulan

| Item | Isi |
|---|---|
| Celah diukur | **6** dari 12 (2 viewport × 2 tema) |
| Cacat nyata | **1** — diperbaiki |
| Non-cacat | **11** (5 tanpa teks · 5 lulus terukur · 1 dikecualikan kebijakan) |
| Regresi | **0** |
| Jebakan harness ditemukan | **4** |

---

## 1. Dua tahap: triase (murah, heuristik) lalu ukur (otoritatif)

### 1.1 Triase menyaring 12 → 5

Sebuah celah hanya bisa **gagal** kalau **kedua** belahannya ada:

1. permukaannya **tidak** di-shim → tetap gelap di tema terang;
2. teks di dalamnya **di-shim** → berbalik jadi gelap.

Kalau teksnya **juga** tidak di-shim, ia tetap terang di atas gelap — tidak ada cacat.
`shim-triage.mjs` membandingkan kelas teks pada elemen yang sama terhadap daftar shim dan
menyisakan **5 kandidat** dari 12.

> Triase itu **heuristik**: jendela ±2 baris bisa menangkap kelas teks milik elemen tetangga.
> Di `LokerDetailModal.tsx:66` satu baris memuat belasan elemen, dan triase sempat melaporkan
> kelas teks yang sama sekali bukan milik elemen itu. Karena itu triase hanya **menyaring**;
> yang memutuskan adalah pengukuran.

### 1.2 Yang terukur

| Kelas | Lokasi | Terang | Gelap | Verdict |
|---|---|---|---|---|
| `bg-slate-600/50` | `CandidateProfileModal.tsx:438` | **3,70** | 7,17 | 🔴 **GAGAL → diperbaiki → 6,08** |
| `bg-amber-500/10` | `CandidateDash.tsx:607` | 4,61 | 9,69 | ✅ lulus |
| `bg-sky-500/10` | `CandidateDash.tsx:641` | 5,35 | 7,72 | ✅ lulus |
| `bg-red-500/10` | `CandidateDash.tsx:772` | 5,58 | 6,27 | ✅ lulus |
| `bg-rose-950/30` | `PemberkasanModal.tsx:530` | 5,75 | 10,95 | ✅ lulus |
| `bg-slate-700/40` | `TabMail.tsx:249` | 2,69 | — | ⚪ **dikecualikan** (tombol `disabled`) |

Semua angka dari **piksel tercat** (tinta di-mask, piksel di sampel), bukan dari `backgroundColor`
yang dihitung — `backgroundColor` di sini berbentuk `oklab(… / 0.5)` dan tidak bisa dinilai parser rgba.

### 1.3 Yang tidak perlu diukur: bukan permukaan teks

| Kelas | Apa sebenarnya | Bukti |
|---|---|---|
| `bg-amber-500/80` | titik indikator "mengetik" | `w-2 h-2 rounded-full` (`AdminAiCopilot:499`, `AiCvForm:886`, `SiswaBaruForm:377`) |
| `bg-violet-400/80` | titik indikator "mengetik" | `w-2 h-2 rounded-full` (`InterviewSimulatorModal:333-339`) |
| `bg-emerald-500/25` | **garis konektor 1 px** | `w-px flex-1` (`LokerDetailModal:66`) |
| `bg-rose-500/10` | lingkaran dekoratif di belakang **ikon** | `w-24 h-24 rounded-full` + `<Icon>` (`ShareView:251`) |
| `bg-rose-600/10` | blob ambient, **`aria-hidden="true"`** | `ShareView:184` |

### 1.4 Satu pasangan yang sengaja tidak di-shim

`bg-amber-500/90` (`MasterFullForm.tsx:630`) memasangkan amber pekat dengan teks **`text-[#3b2503]`**
— sebuah hex mentah, jadi **teksnya pun tidak di-shim**. Pasangan itu konsisten dengan sendirinya di
kedua tema; celah shim di latarnya tidak berdampak. Aritmetika ≈ **7,1:1**. Dilaporkan, tidak diubah.

---

## 2. Cacat yang diperbaiki: `bg-slate-600/50`

**Bentuknya persis sama dengan dua cacat sesi lalu** — permukaan tidak di-shim sementara tinta di
atasnya berbalik:

```
CandidateProfileModal.tsx:438   (cabang fallback: status bukan LULUS, bukan Aktif)
  bg-slate-600/50 text-slate-300 border border-slate-600
                 └─ §5b memetakan text-slate-300 → #4a4642 (gelap)
  bg-slate-600/50 → tetap gelap   ⇒  teks gelap di atas permukaan gelap
```

Terukur: teks `rgb(74,70,66)` di atas tercat `rgb(157,163,176)` = **3,70:1** (lantai 4,5 untuk
11 px/700). Konsisten di desktop **dan** ponsel, dengan `elementFromPoint` membuktikan sampelnya
memang milik chip itu.

**Perbaikan** mengikuti **preseden yang sudah ada di berkas yang sama** (`global.css:531`):
> *"Status pills use `bg-slate-500/20`. It sits lighter than 600, so it maps to a tint above the
> raised surface rather than below it."* — `/20` → `#b4aeb133`, `/10` → `#b4aeb11a`

Jadi `/50` → `#b4aeb180` (alpha sama, rona sama). Hasil terukur **6,08:1**; tema gelap tidak tersentuh
(7,17).

---

## 3. 🔴 Empat jebakan harness — semuanya memproduksi "kegagalan" yang salah

### 3.1 Aritmetika tidak bisa membaca `oklab`

Saya memprediksi `bg-rose-950/30` = **2,87:1 (gagal)** dengan mencampur rose-950 secara sRGB.
Terukur **5,75:1 (lulus)** — permukaannya `oklab(0.271 …)`, jauh lebih terang dari tebakan saya.
**Satu-satunya cara tahu adalah mengukur.** Ini pengulangan Mistake 7a doktrin repo, dalam bentuk
yang lebih halus: bukan parser yang gagal, tapi **saya sendiri** yang menghitung dengan model warna
yang salah.

### 3.2 Toolbar dev Astro **memiliki piksel di dasar viewport**

Bacaan tema terang untuk chip `SELESAI` sempat `rgb(19,21,26)` — **hampir hitam di tema terang**,
yang terbaca seperti cacat parah. Ternyata:

```
elementFromPoint(sample) → ASTRO-DEV-TOOLBAR
```

Chip duduk di `y≈818` dari viewport 900, tepat di bawah toolbar `astro dev`. Piksel yang saya baca
adalah **toolbar**, bukan halaman. Angka "gagal" itu artefak; setelah `scrollIntoView({block:'center'})`
hasilnya konsisten di kedua viewport.
**Aturan: setiap elemen di ~90 px terakhir viewport harus di-scroll ke tengah sebelum di-sampel.**

### 3.3 Elemen ter-clip di dalam scroll container

Chip yang sama ada di dalam `glass-panel … max-h-[90vh]` dengan `scrollHeight 1462 > clientHeight 758`.
Doktrin 7e sudah mencatatnya; sesi ini mengalaminya sendiri. Diperbaiki dengan `scrollIntoView`.

### 3.4 Mask tinta **tidak bisa** dicabut dengan menghapus `<style>`

`page.addStyleTag()` bertahan selama masa hidup halaman. Percobaan "undo" dengan menghapus simpul
`<style>` **gagal** — kelas kedua di halaman yang sama kembali dengan `oklab(0 0 0 / 0)` sebagai
"warna teks" dan rasio tak bermakna (`1,27` dan `18,93`, keduanya palsu).
**Perbaikannya `page.reload()`, bukan mencabut gaya.** Setelah itu ketiga panel `/candidate`
konsisten.

### 3.5 Fixture: dua field yang salah tempat

- `mySchedules`, bukan `schedules` → tanpa itu panel Jadwal amber **tidak pernah dirender**
  (dilaporkan "not present" dan nyaris lolos sebagai "tidak ada masalah").
- `kandidatData.needRevision`, bukan `needRevision` di akar → banner revisi merah tidak pernah muncul.

Dua-duanya **fixture yang tidak bisa mencapai keadaan** — kelas kesalahan yang sama dengan `berkas: {}`
di sesi sebelumnya. Sebuah fixture yang tidak bisa mencapai state tidak bisa mengukurnya, dan
"not present" adalah hasil yang **menyamar sebagai aman**.

---

## 4. Verifikasi

| Gerbang | Hasil |
|---|---|
| `tsc --noEmit -p tsconfig.json` | **0 error** |
| `lint-ratchet --base=HEAD` | **PASSED** — utang −21, 0 diagnostik baru |
| `verify-classes.mjs` | **exit 0** — setiap kelas punya aturan (1224 token / 238 berkas) |
| `e2e:contrast` (seluruh situs) | **0 di bawah lantai** — 6 rute × 2 tema × 3 lebar |
| Pengukuran ulang chip | terang **3,70 → 6,08** · gelap 7,17 tidak berubah |

`e2e:contrast` adalah gerbang penentu: `global.css` menyentuh seluruh situs. Ia melaporkan
**2199 elemen "unmeasurable"** dan menyebutnya **bukan** lulus — akuntansi jujur yang patut
dipertahankan.

---

## ✅ Action list

| # | Tindakan | Peran | Urgensi |
|---|---|---|---|
| 1 | Tambahkan gate cakupan shim: gagalkan bila `bg-*-<tier>/<alpha>` dipakai di `src/` tapi tidak ada di shim **dan** tidak ada di allowlist beralasan. Ini yang mencegah kelas ini terulang ke-15 kali. | team-lead | P2 |
| 2 | Pertimbangkan `scrollIntoView` + pengecualian toolbar dev di gate kontras mana pun yang menyampel dekat dasar viewport | pemilik | P2 |
| 3 | Commit 11 berkas yang belum di-commit (5 sesi ini + 6 sesi sebelumnya) **bersama** | team-lead | P0 sebelum push |

---

## 📚 Indeks bukti (semua di luar repo — `F:/tmp/ui-probe/`)

- `shim-audit.mjs` — 14 celah, per keluarga (sesi lalu; 12 sisa berasal dari sini)
- `shim-triage.mjs` — penyaring 12 → 5 berdasarkan prasyarat dua-belah
- `measure-slate600.mjs` — chip fallback; `scrollIntoView` + `elementFromPoint` sebagai penjaga
- `measure-dash.mjs` — tiga panel `/candidate`; `page.reload()` antar kelas
- `measure-locked.mjs` — blok "upload terkunci" (`bg-rose-950/30`), reachability dibuktikan dari sumber
- `shot-chip.mjs` — potret + diagnosis clipping (yang mengungkap toolbar dev)
- `lib-admin.mjs` — fixture bersama

**Berkas repo disentuh sesi ini:** `src/styles/global.css` (+2 aturan shim, berkomentar bertanggal
dan terukur). Tidak ada berkas lain.

---

> Angka di laporan ini berasal dari piksel tercat di Chromium, bukan dari pembacaan sumber atau
> aritmetika — dan perbedaan antara keduanya adalah temuan terpenting sesi ini.
