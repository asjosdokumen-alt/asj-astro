# Loading skeleton `/candidate` — desain, implementasi, dan verifikasi

**Tanggal:** 2026-10-01
**Workflow:** 2 (System Design) — dengan review kode (workflow 1) dilipat masuk
**Rute:** `/candidate` (portal ASJ, `F:/astro`)
**Commit:** `1fe00c0` (fitur skeleton) · `a456c9a` (F12) · `069b2dd` + `1fafbbc` (normalisasi EOL) — **belum di-push** (R19)
**Anggota yang terlibat:** Archi (arsitek) · Tessa (testing) · Cody (review kode) · Rex (SRE)

---

## 📌 TL;DR

- **Kerangka halaman menggantikan spinner.** Keadaan `loading` `/candidate` yang
  dulu satu ikon berputar di bidang kosong kini merender bentuk halaman —
  dossier, sapaan, Kelengkapan, Jadwalmu, Status Lamaran, Berkas, rail kanan.
- **Tinggi bloknya diukur, bukan dikarang.** Kerangka 1.995 px vs halaman 2.467 px
  (desktop, −19,1 %); 2.761 vs 3.347 (ponsel, −17,5 %). 256 px dari selisih itu
  adalah kartu VIP yang **sengaja** tidak dimirror karena data-kondisional.
- **Severity:** 🔴 0 · 🟠 0 · 🟡 2 · 🟢 4
- **Tidak ada yang memblokir.** Semua gate hijau; 3/3 mutasi mati.
- **Tiga temuan sampingan, dua sudah ditutup di sesi yang sama:** blob
  `CandidateDash.tsx` tersimpan CRLF **dengan 48 CR ganda** (`069b2dd`), dan
  halaman ini masih punya **dua tepi kontainer** (`a456c9a`). Sisa satu: kelas
  cacat EOL yang sama di `UndanganKelasModal.test.tsx` (`1fafbbc` — **selesai**;
  audit repo sekarang **0 berkas**).

---

## 🎯 Core conclusion card

| Item | Isi |
|---|---|
| Rating keseluruhan | 🟢 **Lolos** — semua temuan 🟠 sudah ditutup |
| Item pemblokir | **0** |
| Tindakan kunci | 3 (semua opsional) |
| Langkah berikutnya | Pakai ulang komponen ini untuk `/public` dan `/admin` yang masih spinner-saja |

---

## 1. Kebutuhan & tujuan

`TODO.md` → *"Candidate experience"* → **"Loading skeleton di semua halaman yang
memuat data"**. Pemilik mempersempit: **`/candidate` dulu**.

Masalah yang diukur: keadaan `loading` hanya satu baris
(`CandidateDash.tsx:369` sebelum perubahan) — ikon `spinner` + "Memuat..." di
tengah bidang kosong. Fungsional, tapi secara persepsi salah: halaman terlihat
**kosong** sampai data tiba, lalu **seluruh** tata letak muncul sekaligus.
Skeleton memberi tahu bentuk halaman sebelum isinya ada.

---

## 2. High-level design

Blok diambil dari pengukuran `getBoundingClientRect()` atas halaman yang **sudah
dimuat** (fixture sesi penuh: VIP, `catatanExt`, 3 entri riwayat, 1 jadwal,
biodata lengkap), bukan dari membaca CSS.

| Blok | Nyata desktop | Nyata ponsel | Di skeleton |
|---|---|---|---|
| dossier (`section`) | 582 | 873 | 553 / 821 |
| sapaan (`h2`) | 48 | 48 | ~60 |
| **kartu siswa VIP** | 256 | 224 | **sengaja tidak ada** |
| Kelengkapan (`LevelCard`) | 263 | 293 | ~200 |
| Jadwalmu | 192 | 184 | ~150 |
| Status Lamaran | 526 | 584 | ~450 |
| Berkas | 224 | 212 | ~230 |
| tautan "Lihat Loker" | 46 | 46 | 44 |
| rail: pesan admin | 94 | 86 | ~110 |
| rail: 7 aksi | 394 | 394 | ~380 |
| **total** | **2.467** | **3.347** | **1.995 / 2.761** |

Grid dan kelas `mb-6 md:mb-8` **disalin** dari `CandidateDash.tsx:521` supaya
titik pindah kolom (`xl`, 1280 px) terjadi pada lebar yang sama.

---

## 3. ADR — keputusan yang diambil, dan yang ditolak

### ADR-1 · Statis, bukan berdenyut 🔵 DITERIMA

`DESIGN.md` P7 membatasi gerak ke `opacity`+`transform`. `§1.2` menolak kinetic
typography. `§6.5` melarang gerak pada apa pun yang **mengandung makna**.
Ronde review r2 (temuan F5) **mencabut ketiga `animate-pulse`** dari berkas
tetangga.

Skeleton tidak mengandung makna — ia justru ketiadaan isi — jadi denyut
`opacity` sebenarnya **sah**. Tetapi statis menghapus seluruh pertanyaan itu,
dan sinyal "sedang bekerja" tetap dipegang splash boot.

**Cody menyetujui**, dengan alasan tambahan yang lebih kuat dari punya saya:
*"a skeleton that animates during a sub-second load reintroduces the visual
activity r2 just removed, and buys nothing for a window this short."*

Kalau pemilik ingin denyut: tambahkan `animate-pulse` pada `Bar` —
**satu kata**, dan `motion.css:1719-1723` sudah mematikannya sendiri saat
`prefers-reduced-motion: reduce`.

### ADR-2 · `aria-busy` TIDAK dipakai 🟡 DIPERBAIKI SETELAH REVIEW

Versi pertama memakai `role="status" aria-busy="true"`. Cody menemukan cacatnya:
simpul ini **diganti**, bukan diperbarui, jadi `aria-busy` tidak pernah kembali
`false` — dan ia **memerintahkan pembaca layar MENAHAN pengumuman**, sehingga
satu-satunya teks di dalamnya tidak akan pernah dibacakan. `aria-busy` dihapus;
`role="status"` + teks `sr-only` dipertahankan.

**Batas yang jujur:** `role="status"` yang lahir sudah berisi teks juga umumnya
tidak diumumkan, jadi pengumuman "Memuat…" **tidak dijamin**. Yang dijamin
adalah kebalikannya — nol heading, nol progressbar, dan tidak ada puluhan `div`
kosong yang bocor ke accessibility tree. Asersi `toBeNull()` mengunci keputusan
ini supaya tidak ada yang "melengkapinya" kembali.

### ADR-3 · Berkas komponen tersendiri, meski menggeser 3 angka beku 🔵 DITERIMA

Archi menilai dapat dipakai ulang (`TODO.md` meminta *semua* halaman); Tessa
menghitung biayanya: **+1 tsx** → `count('tsx')` 110→111, `files.length`
527→528, `fileCount` 527→528. Digeser **satu per satu** (R15) dengan uji ulang
di antara tiap geseran, diukur dengan `count-indexed.test.ts`.

Catatan proses: uji `discover.test.ts:110` membandingkan inventaris terhadap
`git ls-files`, jadi berkas baru harus **di-stage** agar terlihat — berkas
untracked membuat gate itu merah dengan cara yang terlihat seperti drift.

### ADR-4 · Kartu VIP sengaja TIDAK dimirror 🔵 DITERIMA

Ia hanya ada bila `isVIP`, dan skeleton **tidak bisa tahu** itu — datanya justru
yang sedang ditunggu. Menaruh placeholder di sana akan berbohong kepada
mayoritas kandidat non-VIP; tidak menaruhnya berarti kandidat VIP melihat satu
blok muncul. Dipilih yang kedua karena lebih sedikit orang yang terkena.
**Konsekuensi:** skeleton ~250 px lebih pendek dari halaman VIP.

---

## 4. Temuan (di luar lingkup skeleton, terukur)

### F12 · Halaman ini masih punya DUA tepi kontainer 🟠 → ✅ **SELESAI `a456c9a`**

Diukur pada 1280 px, sebelum perbaikan:

| Blok | x | lebar |
|---|---|---|
| Kartu dossier | **185** | **896** |
| Grid di bawahnya | **16** | **1233** |
| Kolom utama | 16 | 857 |
| Rail | 897 | 352 |

Beda tepi kiri **169 px**. Penyebabnya `AsjDossierCard.tsx:145` masih memakai
`max-w-4xl mx-auto` sementara seluruh grid memakai lebar `main`. Ini **cacat yang
sama** yang dikeluhkan pemilik di review pertama (*"tepi kolom berzig-zag"*) dan
yang diklaim sudah diselesaikan U1/`a992dd0` — ia bertahan di blok teratas,
yaitu blok yang paling dulu dilihat mata.

**Akar masalahnya ditemukan:** `max-w-4xl` itu sisa dari `.glass-panel max-w-4xl`
yang dulu membungkus SELURUH dashboard. Waktu panelnya dibuang (`c01eaaf`),
kartu ini keluar dari panel **tetapi membawa serta lebarnya** — jadi ia tidak
pernah "kembali" ke tepi `main`.

**Sesudah** — `max-w-4xl mx-auto` dibuang dari kartu:

| Blok | Sebelum | Sesudah |
|---|---|---|
| Kartu dossier | x=185 w=896 | **x=16 w=1233** |
| Grid di bawahnya | x=16 w=1233 | x=16 w=1233 |

Tepi identik. **Tinggi tidak berubah (582 px)** — tinggi kartu ini ditentukan
kotak foto tetapnya (128×160) dan grid bidangnya, bukan pembungkusan teks, jadi
kontainer yang lebih lebar tidak berbiaya vertikal.

`CandidateSkeleton.tsx` membawa kelas yang sama dan **wajib ikut bergerak** —
kalau tidak, skeleton justru menimbulkan lompatan **lebar**, hal yang ia ada
untuk mencegah. Komentarnya sekarang menyatakan itu eksplisit supaya keduanya
tidak bisa melenceng diam-diam.

### F13 · `CandidateDash.tsx` tersimpan CRLF + 48 CR ganda 🔴 SELESAI `069b2dd`

Ini temuan terbesar sesi ini, dan **tidak ada hubungannya dengan skeleton** —
ia hanya terlihat karena saya kebetulan meng-edit berkas ini.

Blob di HEAD memuat **1085 byte CR untuk 989 LF**: 48 baris berbentuk
`CR CR LF`, 941 lainnya `CR LF`. Setiap berkas teks lain di repo ini tersimpan
LF murni — `git grep -I -l $'\r' HEAD` mengembalikan **tepat dua** jalur.

Diperkenalkan `8e775e4` (2026-09-30), yang menulis ulang berkas ini 989/957.

**Kenapa berbahaya, dan kenapa tak terlihat:** pohon kerja tetap terlihat
**bersih**, karena `core.autocrlf=true` menormalkan saat masuk ke index. Cacatnya
baru muncul saat sebuah edit di-stage — dan saat itu `git add` menghasilkan
**992/989 penulisan ulang seluruh berkas**, mengubur perubahan aslinya dan
menghancurkan `git blame` untuk 989 baris sekaligus. Tanpa sengaja, perubahan
skeleton 4 baris akan tampil sebagai perubahan 1.981 baris.

**Perbaikan** (commit tersendiri, bukan digabung): dinormalkan ke LF. Diverifikasi
sebelum commit — 934 baris berisi **identik** sebelum & sesudah, satu-satunya
delta konten adalah 48 baris kosong hantu yang memang diciptakan CR ganda itu.

**Berkas kedua, ditutup `1fafbbc`.** `src/components/admin/UndanganKelasModal.test.tsx`
menderita hal yang sama: 173 CR untuk 169 LF, 4 baris `CR CR LF`. Setelah
keduanya dinormalkan, `git grep -I -l -e "$(printf '\r')" HEAD` mengembalikan
**0 berkas** — kelas cacat ini **habis** di repo, bukan sekadar berkurang. Jadi
tidak ada lagi berkas yang, begitu ia disentuh, akan meledak menjadi penulisan
ulang seluruh isinya.

### F14 · `git ls-files --eol` MENYESATKAN di repo ini 🟢 CATATAN

Dengan `core.autocrlf=true`, perintah itu melaporkan eol **ternormalisasi**,
bukan byte yang tersimpan: ia menjawab `i/lf` untuk berkas yang blob-nya jelas
memuat 1085 byte CR. **Alat yang dipakai untuk mencari cacat ini akan
melaporkan "sehat" tepat pada cacat yang dicarinya.** Audit yang benar:
`git grep -I -l $'\r' HEAD` (lewati biner) atau hitung byte `0x0D` langsung.

### F15 · Tangkapan layar `astro dev` memuat `<astro-dev-toolbar>` 🟢 CATATAN

Sebuah pil gelap berisi empat ikon muncul di tangkapan layar desktop dan sempat
saya duga cacat UI. Ia **`<astro-dev-toolbar>`** — toolbar pengembangan Astro,
bukan bagian situs. `document.elementFromPoint()` yang menemukannya; tidak ada
satu pun elemen `position: fixed` milik aplikasi di titik itu (yang ada hanya
`#sakura-particles`, drawer tertutup di `x=1280`, dan FormToolbar di atas).
**Jangan menyimpulkan cacat dari tangkapan layar `astro dev` tanpa
mengidentifikasi elemennya.**

### F16 · Kontras balok 1,54:1 (terang) / 1,93:1 (gelap) 🟡 DITERIMA SADAR

Diukur dari **piksel nyata** (`sharp().raw()` atas tangkapan layar), bukan dari
`getComputedStyle()` — Chromium mengembalikan `oklch(...)` untuk token tema ini
dan `canvas.fillStyle` **menolaknya**, jatuh ke hitam. Percobaan pertama saya
melaporkan rasio 1:1 untuk dua permukaan yang jelas berbeda; ini jebakan yang
sama yang sudah dicatat review r2.

Cody menandai ini 🟡: *"verify this doesn't render as a smudge on a dim panel"*.
Jawabannya **tidak**, dan itu diputuskan dengan mata, bukan teori: kedua
tangkapan layar (terang & gelap) menunjukkan balok yang terbaca jelas sebagai
placeholder. WCAG tidak menetapkan lantai untuk elemen **dekoratif non-teks**;
aturan 3:1 repo (`DESIGN.md:845`) mengatur komponen UI, bukan placeholder.
**Diterima sadar**, dengan jalur satu baris bila pemilik ingin lebih tegas:
ganti `bg-line-strong` dengan token khusus.

---

## 5. Operability (Rex)

**Nol risiko penerapan. Tidak perlu item checklist deploy.**

- **Jalur tanpa-JS:** tidak berubah. `/candidate` `client:only`, dan banner
  `<noscript>` dari `027bba4` tetap satu-satunya yang dirender tanpa JS.
  Skeleton tidak bisa dijangkau tanpa JS.
- **Service worker:** tidak tersentuh. Tidak ada aset, tidak ada request, tidak
  ada entri precache baru.
- **Urutan boot:** `#global-loader` (`BaseLayout.astro:380`) `display:none`, dan
  island memasang skeleton segera setelah mount — tidak ada jendela di mana
  keduanya terlihat, dan tidak ada kedipan kosong.
- **Catatan informasi (bukan temuan):** `/public` dan `/admin` masih memakai
  spinner-saja. Inkonsistensi antar-rute sekarang ada; `TODO.md` sudah
  menyebutnya sebagai pekerjaan lanjutan.

---

## 6. Test strategy (Tessa) & bukti

| Asersi | Kenapa ada |
|---|---|
| skeleton tampil saat memuat, hilang saat data tiba (+ kontrol positif tombol aksi) | tanpa kontrol positif, "hilang" juga benar di halaman yang gagal memuat |
| **nol heading** | `e2e/test-headings.mjs` menuntut tepat satu `h1`; `h1` rute ini milik `FormToolbar` |
| **nol `role="progressbar"`** | `CandidateDash.test.tsx` membaca `[role="progressbar"]` **pertama** dan menuntut `aria-valuenow` = kelengkapan profil (milik `LevelCard`). Skeleton yang memasangnya membuat asersi itu **lulus dengan angka yang salah** — lebih buruk daripada gagal |
| `role="status"` ada, `aria-busy` **tidak** | mengunci keputusan ADR-2 |
| `textContent` = `ui.loading` saja | tidak ada teks lain yang bocor ke keadaan ini |

**Baterai mutasi: 3 dibunuh, 0 lolos.**

| Mutasi | Dibunuh oleh |
|---|---|
| `<h3>` di dalam skeleton | asersi heading **dan** asersi `textContent` |
| `aria-busy="true"` ditambahkan kembali | asersi `toBeNull()` |
| `role="progressbar"` disuntikkan | asersi progressbar |

**Yang gate e2e TIDAK BISA lihat, dan ini jujur:** skeleton hanya ada selama
memuat. `e2e:contrast` bahkan **tidak mengukur `/candidate` sama sekali**
(Tessa memverifikasi). Jadi hijau-nya `e2e:headings`/`e2e:contrast`/`e2e:aria-names`
adalah bukti **regresi**, bukan bukti skeleton-nya benar. Bukti skeleton-nya
berasal dari tes unit + probe pengukuran, bukan dari gate itu.

---

## 7. Risiko & trade-off

| Risiko | Realisasi | Mitigasi |
|---|---|---|
| Skeleton lebih pendek dari halaman | **ya**, −19,1 % / −17,5 % | sisa terbesar (256 px) tidak bisa dihilangkan tanpa berbohong (ADR-4); pencocokan persis mustahil karena tinggi kartu Status bergantung jumlah lamaran |
| Menambah heading/progressbar → gate lain merah | tidak | dua asersi khusus + 2 mutasi |
| Berkas baru menggeser angka beku | tidak | digeser satu per satu, diverifikasi |
| Normalisasi EOL mengubah isi | tidak | penjaga byte: CR telanjang → ABORT; 934 baris berisi identik |
| Kontras terlalu lemah | tidak terlihat di kedua tema | diukur dari piksel + tangkapan layar |

---

## ✅ Action list

| # | Tindakan | Peran | Urgensi | Catatan |
|---|---|---|---|---|
| 1 | ~~Putuskan **F12**: buang `max-w-4xl mx-auto` dari `AsjDossierCard.tsx:145`~~ | pemilik | — | ✅ **SELESAI `a456c9a`** — dossier x=185 w=896 → x=16 w=1233 |
| 2 | ~~Normalkan `src/components/admin/UndanganKelasModal.test.tsx`~~ | Cody | — | ✅ **SELESAI `1fafbbc`** — audit EOL repo sekarang **0 berkas** |
| 3 | Terapkan skeleton ke rute lain yang memuat data (`/public`, `/admin`) | Archi | P2 | pola sudah ada; komponennya bisa dipakai ulang |
| 4 | Putuskan ADR-1: statis (sekarang) atau denyut `animate-pulse` | pemilik | P2 | satu kata |
| 5 | Bila ingin balok lebih tegas: token khusus menggantikan `bg-line-strong` | Archi | P3 | sekarang 1,54:1 terang / 1,93:1 gelap |

---

## ⚠️ Batas yang diketahui

- Yang diukur adalah DOM dari **fixture**, bukan data produksi. Kandidat tanpa
  riwayat/jadwal akan lebih pendek; beberapa blok di-`omit`.
- Tinggi kartu Status Lamaran bergantung jumlah lamaran — **pencocokan persis
  tidak mungkin**, dan tidak diusahakan.
- Pengumuman "Memuat…" ke pembaca layar **tidak dijamin** (ADR-2).
- `e2e:contrast` tidak mencakup `/candidate`, jadi kontras skeleton tidak dijaga
  gate mana pun; angkanya berasal dari probe, bukan CI.
- Skrip probe ditulis **di luar repo** (`F:/tmp/ui-probe/`) supaya inventaris
  beku indexer tidak bergeser — `includePath()` menerima `src/`,
  `netlify/functions/`, `shared/`, `scripts/`, `e2e/`, dan root.
- **Belum di-push** (R19). Dan situs live masih beku di `742e956` karena kredit
  Netlify habis — jadi commit ini belum akan terlihat siapa pun.

---

## 📚 Sumber & indeks keluaran anggota

- **Archi (arsitek):** usulan desain — mirror blok terukur, keputusan gerak,
  kontrak a11y, biaya berkas baru terhadap angka beku.
- **Tessa (testing):** rencana uji — asersi heading/progressbar/a11y, daftar gate
  yang harus dijalankan, dan **daftar gate yang tidak bisa melihat skeleton**.
- **Cody (review kode):** 3 temuan. D1 (blok dossier hilang) sudah diperbaiki
  sebelum review dibaca — ia membaca versi yang masih ter-stage. D2 (aria-busy)
  diperbaiki. D3 (kontras) diterima sadar dengan bukti piksel + tangkapan layar.
- **Rex (SRE):** penilaian operability — nol risiko, tanpa item checklist.
- **Alat bukti (di luar repo):** `F:/tmp/ui-probe/skeleton-probe.cjs` (pengukuran
  tinggi + warna piksel), `normalize-eol.cjs` (normalisasi dengan 3 penjaga),
  `fixed-probe.cjs` (identifikasi elemen mengambang).
- **Tangkapan layar:** `_skeleton-desktop-1280.png` (gelap),
  `_skeleton-mobile-390.png` (gelap), `_skeleton-desktop-1280-light.png`.
- **Dokumen pendahulu:** `deliverables/gstack/design-review-dashboard-kandidat-2026-09-30.md`
  dan `…-r2.md`.

---

> Laporan ini dihasilkan oleh kolaborasi AI tim Engineering Assurance. Keputusan
> teknis yang penting tetap harus ditinjau oleh penanggung jawab engineering
> manusia.
