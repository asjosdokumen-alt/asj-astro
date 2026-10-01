# Design review — Dashboard Admin `/admin`

**Tanggal:** 2026-10-01 · **Rute:** `/admin` (10 tab) · **Deliverable visual:**
`_review-dashboard-admin-2026-10-01.html` (buka di browser, ada toggle tema)

**Kenapa rute ini.** Dashboard kandidat `/candidate` sudah selesai (review r1 + r2,
9 langkah, `04a204b` … `6327fda`, ditutup `39f5757`). `/admin` adalah permukaan
aplikasi yang **belum pernah** diukur dengan cara yang sama — ia adalah satu-satunya
rute ber-`client:only` yang punya 10 sub-halaman, sidebar tetap, dan tabel data.

**Cara mengukur.** Halaman dijalankan sungguhan di `chromium` headless terhadap
`astro dev` (bukan `dist/`), viewport **1280×900** dan **390×844**, tema **terang dan
gelap**, fixture sesi admin (`asj_auth` `role: 'admin'`) + `/.netlify/functions/**`
di-`fulfill` lokal. Fixture sengaja **penuh** (2 loker, 2 kandidat VIP, 2 jadwal, 2
tugas, 2 form mail, template WA, presets, 6 grup dropdown) supaya yang terukur adalah
kasus terburuk. Semua angka dari `getBoundingClientRect()`, `getComputedStyle()`,
`elementFromPoint()`, dan warna yang dinormalisasi lewat `canvas`.

> **Skrip pengukuran ada di luar repo** (`E:/tmp/ui-probe/admin-*.mjs`) supaya tidak
> menggeser counter beku indexer (`includePath()` menerima `src/`, `netlify/functions/`,
> `shared/`, `scripts/`, `e2e/`, dan root).
>
> **Pohon kerja TIDAK bersih saat review ini dibuat:** 9 berkas termodifikasi + 4
> untracked dari sesi lain (`netlify/functions/_lib/ai/*`, `AdminAiCopilot.*`,
> `deliverables/ai-inference/`). Tidak satu pun disentuh review ini.

---

## 0. Dua koreksi alat ukur (mahal untuk ditemukan ulang)

### 0.1 `canvas.fillStyle` **menerima** `oklch()` — dan itu jalan pintas yang benar

Catatan lama repo menyebut `canvas.fillStyle` **menolak** `oklch()` sehingga jatuh ke
hitam dan menghasilkan rasio palsu **1:1**. Itu **tidak berlaku** di Chromium sesi ini,
dan yang menolak sebenarnya adalah **parsernya**, bukan canvas-nya:

```js
ctx.fillStyle = 'oklch(0.5 0.134 242.749)';
ctx.fillRect(0,0,1,1);
ctx.getImageData(0,0,1,1).data;   // → [0, 105, 168, 255]   ← sRGB sungguhan
ctx.fillStyle;                    // → 'oklch(0.5 0.134 242.749)'  (dikembalikan apa adanya)
```

`fillStyle` **mengembalikan string apa adanya**, jadi kode yang membaca balik
`ctx.fillStyle` lalu mencocokkannya dengan `/rgba?\(/` mendapat `null` — dan `null`
diperlakukan sebagai hitam. **Yang salah adalah pembacaannya, bukan konversinya.**

Diuji dan bekerja untuk `oklch()`, `oklab()`, `color-mix()`, dan bentuk `oklch(… / α)`.
Akibatnya audit kontras bisa dilakukan **seluruhnya di dalam peramban**, tanpa
tangkapan layar + `sharp`. Semua angka §6 di bawah memakai jalur ini.

> ⚠ **`clearRect` sebelum `fillRect` WAJIB.** `fillRect` **menimpa-komposit** piksel
> yang sudah ada di kanvas, jadi nilai tembus-cahaya (`rgba(0,0,0,0)`,
> `oklab(… / 0.5)`) bercampur dengan piksel panggilan SEBELUMNYA alih-alih
> menggantinya — dan panggilan sebelumnya hampir selalu warna teks. Gejalanya
> khas: **setiap elemen kembali sebagai "warnanya sendiri di atas warnanya
> sendiri"** → `ratio: 1` seragam di seluruh halaman, dan rantai latar berhenti di
> lapisan tembus-cahaya pertama sehingga gradien di belakangnya tak pernah
> terlihat. Satu `clearRect` yang hilang menghasilkan **22 kegagalan kontras palsu**
> pada halaman yang sebenarnya nol.

### 0.2 Dua pembacaan palsu yang hampir menjadi temuan

Sapuan pertama melaporkan **10 kegagalan kontras** dan **70 overflow horizontal**.
Keduanya **artefak**, dan keduanya dari satu sebab: `/admin` memarkir drawer
off-canvas di `x=1280…1664` (`u-viewport-fixed--right`, `translate-x-full`). Elemen itu
`display:block`, berukuran, dan **tidak** `aria-hidden` — jadi uji visibilitas yang
hanya membaca CSS menganggapnya terlihat.

| Laporan palsu | Kenapa |
|---|---|
| 10× "Install App" `ratio: 1` | tombol di drawer yang diparkir di luar layar; `box.x = 1297` pada viewport 1280 |
| 70 overflow | seluruh isi drawer yang sama |

Uji visibilitas sekarang **wajib** menyertakan uji geometri (`left >= innerWidth`
⇒ buang). Setelah itu: **kontras gagal 0, overflow 0** — di kedua tema.

### 0.3 Kontrol positif — sapuan yang tidak bisa gagal tidak membuktikan apa pun

Empat cacat ditanam di halaman sungguhan dan **harus** terdeteksi:

| Kontrol | Ditanam | Terdeteksi |
|---|---|---|
| kontras | `#6b7280` di atas `#6b7280` (rasio 1,0) | ✅ |
| target sentuh | `<button>` 20×20 | ✅ |
| overflow | kotak 300 px didorong ke `margin-left: 2000px` | ✅ |
| animasi | `transition: width 1s` | ✅ |

---

## 1. Yang benar (jangan "diperbaiki")

| Diukur | Hasil |
|---|---|
| `transition: width`/`height` | **0** di kesepuluh tab — P7 patuh |
| Animasi berjalan setelah muat | **0** di kesepuluh tab |
| Kegagalan kontras AA | **0** dari 10 tab × 2 tema (dengan kontrol positif) |
| Overflow horizontal yang tidak bisa di-scroll | **0** |
| Kedalaman permukaan maksimum | **2** (tidak ada sarang 5 tingkat seperti `/candidate` dulu) |
| `main` vs panel di desktop | panel mengisi `256…1265` dari `main` `0…1265` — ruang mati kanan **16–17 px**, bukan 369 px |
| Skeleton | 9 dari 10 tab memakai primitif bersama `Skeleton.tsx` (`Bar`/`Status`/`TableRows`) |
| Outline heading | `h1` tepat **1** di setiap tab (`e2e:headings` aman) |

`h1` = "Panel Admin" dipegang `FormToolbar`; setiap tab menyumbang `h2`-nya sendiri.
Struktur itu benar dan tidak diusulkan berubah.

---

## 2. Temuan

### F1 · Tombol "Menu" adalah UI mati di desktop 🔴

`AdminPanel.tsx:184` merender tombol hamburger **tanpa `lg:hidden`**:

```
rect        : x=4  y=42  w=77  h=44
position    : sticky top-2,  z-index 30
tabIndex    : 0            ← masih bisa difokus
elementFromPoint(pusat) → aside.fixed     ← tertutup sidebar
covered     : true
```

Sidebar (`aside`, `fixed left-0`, `z-index 96`) menutupi **seluruh** tombol. Tombol
saudaranya — tombol tutup di `AdminPanel.tsx:214` — **punya** `lg:hidden`. Jadi
inkonsistensinya ada di satu baris, bukan di konsepnya.

**Dampak nyata, bukan teoretis.** Pengguna papan tulis bisa `Tab` ke tombol yang tidak
terlihat dan tidak bisa diklik; pembaca layar mengumumkan kontrol "Menu" yang tidak
melakukan apa pun. Terukur di **kesepuluh tab**, desktop.

**Usul:** tambahkan `lg:hidden` pada tombol itu.

### F2 · Toolbar menutupi 19 px pertama `main` — di 10 berkas 🔴

`layout.css:303-318` menetapkan dan **mengukur** tinggi toolbar:

```
--u-toolbar-h: 61px      ← "the fixed FormToolbar's height", diukur 61 px @390 dan @1280
```

Tetapi `main` di rute aplikasi memakai angka mati yang **lebih kecil**:

```
admin.astro:18   <main … pt-[42px]>
```

Selisihnya **19 px**, dan isi pertama `main` duduk di bawah bilah. Dibuktikan dengan
hit-test di sepanjang garis tengah tombol Menu (viewport 390):

| y | pemilik piksel |
|---|---|
| 42 | `a.min-h-11` (tombol) |
| 46 | `a.min-h-11` |
| **50** | **`div.fixed`** ← toolbar |
| **54** | **`div.fixed`** |
| **58** | **`div.fixed`** |
| 62 | `button.min-h-11` |
| … | … |

Tombol setinggi 44 px hanya **25 px** yang terlihat, dan label "Menu" yang
ter-`center` vertikal **terpotong** — persis strip yang terlihat di tangkapan layar
ponsel. **Bukan cacat `sticky`-nya**: `sticky top-2` benar; yang salah adalah titik
awal `main`.

`pt-[42px]` dipakai di **10 berkas**:

```
src/pages/admin.astro:18        src/pages/apply.astro:12      src/pages/share.astro:12
src/pages/ai-cv.astro:12        src/pages/master.astro:8      src/pages/candidate.astro:17
src/components/forms/AiCvForm.tsx:836        src/components/forms/ApplyFullForm.tsx:353
src/components/forms/ShareView.tsx:180       src/components/forms/SiswaBaruForm.tsx:336
```

**Usul:** ganti dengan `pt-[var(--u-toolbar-h)]` — token yang sudah ada, sudah diukur,
dan komentar `layout.css` sudah menyuruh "change it here once".

### F3 · 94 kontrol desktop / 86 kontrol ponsel di bawah lantai 44 px 🔴

§6.4: umum **44×44**, di dalam formulir ponsel **48×48**.

| Tab | desktop | ponsel |
|---|---|---|
| tambah | **26** | **28** |
| dbjob | 23 | 12 |
| pelamar | 18 | 9 |
| config | 11 | 11 |
| mail | 8 | 10 |
| wa | 5 | 7 |
| jadwal | 3 | 3 |
| kelola / agenda / tugas | 0 | 2 |

Pola yang mendominasi (bukan 94 cacat berbeda — **44 pola**, banyak instans):

| Pola | Terukur | Di mana |
|---|---|---|
| `px-2 py-1.5` | **32 px** tinggi | tombol aksi tabel (CV, Edit, CV AI, AI HR) |
| `px-3 py-1 rounded-full` | **24 px** tinggi | pil status OPEN/CLOSE, badge tahapan |
| `w-full py-2` | **442×34** (×8) | tombol "Edit" di setiap kartu `TabConfig` |
| `w-8 h-8` | **32×32** | tombol hapus di tabel |
| `select` filter | **33 px** | 3 filter di `pelamar` |
| BottomNav `min-h-11 px-2.5` | **33×44** | lebar kurang, tinggi cukup |

### F4 · 7 dari 10 tab menyisakan 30–71 % viewport sebagai ruang kosong 🔴

Panel konten `hug content` dan tidak punya `min-h`, jadi ia mengapung di atas halaman
kosong. Desktop 900 px:

| Tab | panel bawah | ruang mati | % |
|---|---|---|---|
| **tugas** | 261 | **639** | **71 %** |
| **agenda** | 330 | **570** | **63 %** |
| **mail** | 389 | **511** | **57 %** |
| **jadwal** | 403 | **497** | **55 %** |
| **kelola** | 423 | **477** | **53 %** |
| dbjob | 594 | 306 | 34 % |
| pelamar | 628 | 272 | 30 % |
| wa | 906 | −6 | mengalir |
| tambah | 1064 | −164 | mengalir |
| config | 1470 | −570 | mengalir |

Ponsel 844 px: `tugas` 583 (69 %), `agenda` 514 (61 %), `jadwal` 441 (52 %),
`kelola` 409 (48 %), `mail` 313 (37 %), `dbjob` 238 (28 %).

**Ini temuan visual terbesar di halaman ini** — dan bukan soal "kurang isi". Yang
salah adalah **tidak ada keputusan** tentang bagaimana panel menempati tinggi: hari ini
ia kebetulan sekecil isinya. Perhatikan bahwa `#main-content` sudah punya
`min-h-[50vh]`, jadi niatnya ada, tapi `50vh` (450 px) lebih kecil dari 639 px yang
tersisa — jaminannya tidak pernah menyentuh.

### F5 · 11 warna aksen dalam satu layar 🟠

§3.2 adalah **daftar tertutup 6 peran**. Terukur pada elemen interaktif per tab:

| Tab | warna aksen berbeda |
|---|---|
| **pelamar** | **11** |
| dbjob | 9 |
| kelola | 8 |
| tambah / jadwal / mail / wa / agenda / config | 5 |
| tugas | 4 |

Tiga keluarga di antaranya **di luar daftar §3.2**:

| Warna | Terukur | Lokasi |
|---|---|---|
| `blue-600` / `blue-700` | `rgb(3,105,161)` | `TabPelamar.tsx:167` |
| `indigo-500` / `indigo-600` | `oklch(0.511 0.262 276.966)` | `TabPelamar.tsx:254` |
| `purple-500` / `purple-300/400` | `oklch(0.541 0.281 293.009)` | `TabDbJob.tsx:92,175,264,281`, `TabPelamar.tsx:211,241`, `TabMail.tsx:239` |
| `blue-400` | — | `LaporanBulananModal.tsx:99` |

Baris aksi `pelamar` merender **lima warna berbeda bersebelahan** (sky-700 "Pilih
Template CV", sky "CV", emerald "Edit", purple "CV AI", violet "AI HR") — tidak ada
satu pun yang terbaca sebagai aksi utama.

### F6 · 56 `shadow-*` di desktop 🟠

§3.6: *"Halaman ini **tidak memakai skala bayangan bertingkat**. Permukaan dipisahkan
oleh **border**, bukan bayangan."*

| Tab | `shadow-2xl` | `shadow-xl` | `shadow-lg` | `shadow-md` |
|---|---|---|---|---|
| pelamar | 1 | 1 | **6** | 1 |
| kelola / wa | 1 | 1 | 3 | 1 |
| dbjob / tambah / jadwal / tugas / config | 1 | 1 | 2 | 1 |
| mail | 1 | **2** | 2 | 1 |
| agenda | 1 | 1 | 1 | 1 |

Total **56 instans** (34 di ponsel). Belum termasuk `shadow-inner` yang dipakai
`TabConfig` di setiap kartu dan tiap editor.

### F7 · Badge URGENT: penekanan yang hilang begitu gerak dimatikan 🟡

`TabDbJob.tsx:164-170`:

```js
if (/URGENT/.test(u)) return 'bg-red-600 text-white border-red-400/60 animate-pulse';
if (/CLOSE/.test(u))  return 'bg-red-600 text-white border-red-400/60';
```

> **Koreksi terhadap draf pertama temuan ini.** Draf itu mengklaim badge URGENT dan
> CLOSE menjadi *tidak bisa dibedakan* saat reduced-motion. **Itu salah, dan
> pengukuran yang membuktikannya:** badge dirender sebagai
> `{db.tahapan || '-'}` (`TabDbJob.tsx:279`), jadi teksnya **memang** berbunyi
> "URGENT" atau "CLOSE". Status dibawa oleh **teks**, sehingga §6.6 tidak dilanggar
> dan §6.5 tidak berlaku — tidak ada informasi yang hilang.

Yang benar-benar terjadi lebih sederhana: **hanya bobot visualnya** yang hilang.
`global.css:1528-1535` menetapkan `animation-duration: 0.01ms !important` dan
`animation-iteration-count: 1 !important` saat `prefers-reduced-motion: reduce`, jadi
bagi pengguna itu denyutnya lenyap — dan yang tersisa hanyalah dua badge merah
berbentuk sama. Sementara bagi pengguna lain, denyut tak terbatas itu **melukis ulang
baris tabel selamanya tanpa membawa informasi apa pun** (§1.2 menolak animasi yang
menambah biaya tanpa menambah pemahaman).

**Usul:** ganti denyut dengan pembeda **statis** — `ring-2 ring-red-400/70` — yang
bertahan di bawah reduced-motion, tidak memakan frame, dan tetap meninggalkan teks
sebagai pembawa makna sebenarnya.

Catatan metode: sapuan animasi otomatis melaporkan **0** di sini karena fixture tidak
memuat job berstatus URGENT. Ini contoh bahwa "hijau" hanya berlaku sejauh data yang
diuji — temuan ini datang dari membaca sumber, bukan dari sapuan.

### F8 · Payload dropdown yang tidak lengkap mengosongkan seluruh tab 🟠

`TabTambah.tsx:72`:

```js
setDd(d.dropdowns);        // mengganti SELURUH objek state
```

State awal punya enam kunci (`tsk, tahapan, kategori, gender, lokasi, syarat`), tetapi
penggantian ini membuangnya. Render memanggil `dd.gender.map(...)`, `dd.lokasi.map(...)`,
`dd.syarat.map(...)`. Terukur: ketika payload hanya berisi `tsk/kategori/tahapan`,

```
[pageerror] Cannot read properties of undefined (reading 'map')
tambah → headings: H1:Panel Admin     ← h2 hilang
         inputs: 0                    ← formulir tidak ada
```

Tab **gagal total**, bukan terdegradasi: `h2` "Form Input Loker Baru" pun tidak
ter-render, sehingga pengguna melihat panel kosong tanpa pesan. Satu kunci yang hilang
di backend mematikan seluruh formulir input loker.

**Usul:** gabungkan dengan default — `setDd((prev) => ({ ...prev, ...d.dropdowns }))` —
atau `dd.gender?.map(...)` di titik render. Yang pertama lebih baik: ia memulihkan
**semua** kunci sekaligus.

### F9 · `TabAgenda` satu-satunya tab yang masih spinner 🟡

`TabAgenda.tsx:134-138` memakai `<Icon spin name="spinner" />` + satu baris teks,
sementara 9 tab lain memakai `Skeleton.tsx` (`Bar`/`Status`/`TableRows`). Ini permukaan
terakhir yang tertinggal dari pekerjaan `2543971`.

### F10 · Dua kartu konfigurasi adalah daftar yang sama 🟡

Diukur pada tab `config`:

| Kartu | "N pilihan" | Chip |
|---|---|---|
| `Pendidikan` | 6 | SD · SMP · SMA/SMK · D3 · S1 · +1 lainnya |
| `Jenjang Pendidikan` | 6 | SD · SMP · SMA/SMK · D3 · S1 · +1 lainnya |

Identik. Dua grup `sys_config` dengan isi yang sama berarti admin harus mengedit dua
tempat untuk satu perubahan, dan keduanya bisa menyimpang. **Ini keputusan produk**
(mana yang dipakai form) — bukan sesuatu yang saya ubah sendiri.

### F11 · Panel konten menempel tepi layar di ponsel 🟡

```
panel: x=0  w=375  border-radius: 12px  border: 1px
viewport clientWidth: 390
```

`rounded-xl` + `border` duduk tepat di `x=0`, jadi sudut membulatnya **terpotong tepi
viewport** dan garisnya menempel tepi layar. Sementara di desktop ia punya konteks
(`pl-64`). Butuh `mx-4` (atau setara) di bawah `lg`.

### F12 · Ruang mati horizontal ponsel di `config` 🟡

`deadSpaceRight = −19 px` di `config` ponsel: ada permukaan yang melewati tepi kanan
`main` sebesar 19 px. Tidak muncul sebagai overflow yang tidak bisa di-scroll karena
berada di dalam wadah yang bisa di-scroll — jadi gate mana pun akan hijau.

---

## 3. Usulan

| # | Usulan | Temuan | Sentuh | Risiko | Dampak | Status |
|---|---|---|---|---|---|---|
| **U1** | `lg:hidden` pada tombol Menu | F1 | `AdminPanel.tsx` | rendah | sedang | ✅ |
| **U2** | `pt-[42px]` → `pt-[var(--u-toolbar-h)]` | F2 | `admin.astro` | rendah | **tinggi** | ✅ |
| **U3** | Lantai 44 px pada pola yang terukur | F3 | 12 berkas admin | rendah | **tinggi** | ✅ |
| **U4** | Panel menempati tinggi viewport | F4 | `AdminPanel.tsx` | sedang | **tinggi** | ✅ |
| **U5** | Aksen di luar §3.2 → aksen peran yang sah | F5 | 5 berkas | rendah | sedang | ✅ |
| **U6** | Skala bayangan → border (§3.6) | F6 | 21 berkas | rendah | sedang | ✅ |
| **U7** | URGENT dibedakan oleh cincin statis | F7 | `TabDbJob.tsx` | rendah | rendah | ✅ |
| **U8** | Gabungkan payload dropdown dengan default | F8 | `TabTambah.tsx` | rendah | **tinggi** | ✅ |
| **U9** | `TabAgenda` pakai `Skeleton` bersama | F9 | `TabAgenda.tsx` | rendah | rendah | ✅ |
| **U10** | `mx-4 lg:mx-0` pada panel konten | F11 | `AdminPanel.tsx` | rendah | rendah | ✅ |
| — | Dua kartu `Pendidikan` yang sama | F10 | **keputusan pemilik** | — | — | ⏳ |
| — | `FormToolbar` pil 33×44 (global, 9 rute lain) | F3 | di luar admin | — | — | ⏳ |
| — | `pt-[42px]` di 9 rute lain | F2 | di luar admin | — | — | ⏳ |

**Yang TIDAK diusulkan:**
- Menyentuh `AdminAiCopilot.tsx` / `.test.tsx` — sedang ada perubahan sesi lain.
- Menghapus nilai arbitrer `shadow-[…]` — itu glow aksen berwarna, bukan skala elevasi.
- Menambah `h3` di kartu yang belum punya — outline saat ini sah (`h1` 1, `h2` per tab).

---

## 4. Hasil terukur

Diukur ulang dengan fixture, viewport, dan skrip yang **sama** seperti §1–2.

| Metrik | Sebelum | Sesudah | Δ |
|---|---|---|---|
| **Ruang mati vertikal** (tab terburuk — `tugas`) | **639 px (71 %)** | **16 px** | **−623 px** |
| Ruang mati `agenda` / `mail` / `jadwal` / `kelola` | 570 / 511 / 497 / 477 | **16 / 16 / 16 / 16** | −554…−461 |
| Ruang mati `dbjob` / `pelamar` | 306 / 272 | **16 / 16** | −290 / −256 |
| **`shadow-*` (desktop)** | **56** | **0** | −56 |
| **`shadow-*` (ponsel)** | 34 | **0** | −34 |
| **Kontrol < 44 px (desktop)** | **94** | **25** | −69 |
| **Kontrol < 44 px (ponsel)** | **86** | **45** | −41 |
| Keluarga aksen di luar §3.2 | 3 (blue, indigo, purple) | **0** | −3 |
| Aksen berbeda, tab `pelamar` | 11 | **9** | −2 |
| Kegagalan kontras AA (2 tema) | 0 | **0** | — |
| Overflow horizontal tak ter-scroll | 0 | **0** | — |
| Kedalaman permukaan maksimum | 2 | **2** | — |
| Tinggi halaman `config` (desktop) | 1470 px | 1489 px | +19 |
| `lint-ratchet` | — | **PASSED, utang −19** | ✅ |

### 25 sisa di desktop itu **bukan 25 cacat**

**24 di antaranya adalah `<input type=checkbox>` berukuran 20×20 yang dibungkus
`<label>`.** Sasaran sentuh yang sebenarnya adalah labelnya, dan labelnya sudah
dinaikkan ke `min-h-11`:

```
input : 20x20
label : 130x44     ← sasaran nyata, lolos §6.4
```

Probe mengukur elemen `<input>`-nya, bukan label pembungkusnya — jadi ia melaporkan
pelanggaran yang tidak ada. **Ini keterbatasan alat, bukan temuan**; §0.3 menuntut
kontrol positif untuk setiap sapuan, dan sapuan ini tidak punya kontrol untuk
"target sentuh ada di elemen pembungkus".

Sisa yang **nyata**: pil `FormToolbar` (`Gelap`/`Terang`, `ID`/`JP`) terukur
**33×44** di ponsel — 20 instans. Ia lolos WCAG 2.5.8 (minimum 24×24) tetapi **di
bawah lantai repo sendiri (44×44)**. **Tidak diubah di sini**: `FormToolbar` adalah
komponen global yang muncul di 9 rute lain, di luar lingkup "dashboard admin".

### Gate yang menjaga perubahan ini

| Gate | Hasil |
|---|---|
| `vitest run src/components/admin` | **203 lulus / 22 berkas** |
| `tsc --noEmit` | bersih |
| `verify:classes` | setiap kelas punya aturan |
| `lint-ratchet` | PASSED, utang **−19** |
| `e2e:headings` | lulus (tetap tepat satu `h1` per rute) |
| `e2e:aria-names` | **40 / 0 gagal** |
| `e2e:dialog` | **20 / 0 gagal** |
| `e2e:drawer` | **7 / 7** |
| `e2e:labels` | **4 / 4** |
| `e2e:contrast` | **0 di bawah ambang** |

⚠ **`e2e:contrast` melaporkan 2.199 elemen "unmeasurable"** (1.192 di bawah
`opacity < 1`, 1.007 di atas `background-image`). Itu titik buta gate yang sudah
tercatat: **hijau di sini tidak membuktikan apa pun tentang 2.199 elemen itu**.
Angka kontras di dokumen ini datang dari pengukuran `canvas` + kontrol positif (§0),
bukan dari gate.

---

## 5. Modal: 12 permukaan diukur, satu cacat yang tidak terlihat

**Ditambahkan 2026-10-01 (sesi kedua).** Setelah dashboard-nya selesai, kedua belas modal
admin dibuka satu per satu di peramban dan diukur. Presedennya `39f5757` (modal kandidat):
di sana tombol tutupnya terukur **16×24 px di KETUJUH-tujuhnya** — bukan dugaan, hasil ukur.

### Cara membukanya (dan dua yang butuh usaha)

Sebagian lewat event yang sudah dipakai `AdminPanel` (`openPemberkasan`, `openMatchmaking`,
…), sebagian lewat klik tombol. **Dua modal tidak terbuka sama sekali pada percobaan
pertama**, dan keduanya mengungkap hal yang berbeda:

| Modal | Kenapa gagal dibuka | Yang sebenarnya terjadi |
|---|---|---|
| `RirekishoBuilder` | pemilih `button.bg-sky-600` cocok dengan tombol "Input Manual" lebih dulu | selector diperbaiki ke `tbody` |
| `RejectMailModal` | **fixture-nya salah**, bukan selector-nya | `TabMail` membaca **`formInbox`**, bukan `forms` (`src/store/adminStore.ts:298`). Tanpa kunci itu tab Mail merender **nol baris** dan modalnya tidak akan pernah bisa dibuka |

Pelajarannya sama dengan F8: **fixture yang kurang lengkap bukan sekadar merender lebih
sedikit — ia membuat permukaan tertentu tidak terukur sama sekali.**

### Temuan

#### M1 · Judul dokumen CV tidak terlihat sama sekali 🔴 → ✅ DIPERBAIKI

**Ini temuan terpenting di sesi ini, dan satu-satunya yang butuh sampel piksel untuk
membuktikannya.**

`RirekishoBuilder` menyusun dokumen CV sebagai string HTML. Lembarnya `bg-white`, dan
stylesheet dokumennya (`const CSS`) menetapkan `color:black` — **tetapi hanya pada
`.cv-excel`, yaitu tabelnya**. Blok judul berada **di luar** tabel itu:

```js
h+=raw("<div style=\"text-align:center;font-weight:bold;font-size:22px;…\">実習生経歴書</div>");
h+=raw("<div style=\"text-align:center;font-weight:bold;font-size:18px;…\">" + t("admin.rirekisho_title") + "</div>");
h+=raw("<div style=\"text-align:right;font-size:10px;…\">Ver.2025</div>");
```

Ketiganya **mewarisi warna teks modal**. Di tema gelap — tema default repo — itu
`rgb(255,255,255)`. **Putih di atas kertas putih.**

Diukur dengan menyampel piksel di sepanjang garis dasar judul, dari tangkapan layar
sesungguhnya:

| | Piksel putih | Piksel hitam |
|---|---|---|
| **Sebelum** | **725 dari 730** | **0** |
| Sesudah | 606 | 23 (+14 nyaris-hitam, +12 gelap) |

**Nol piksel hitam** = tidak ada glyph yang tergambar. Judul, judul Indonesia, dan penanda
versi hilang dari dokumen yang dicetak dan dikirim admin — di tema yang hampir semua orang
pakai. Diperbaiki dengan `color:black` pada ketiga div itu.

Ini juga contoh kenapa "periksa warnanya" tidak cukup: `getComputedStyle` melaporkan
`rgb(255,255,255)` dan latarnya `rgb(255,255,255)`, dan itu **baru menjadi bukti** setelah
pikselnya disampel.

#### M2 · Tombol tutup di bawah lantai 44 px — di SEMBILAN modal 🟠 → ✅ DIPERBAIKI

Pola yang sama persis dengan `39f5757`, kali ini di `/admin`:

| Modal | Sebelum |
|---|---|
| `MatchmakingModal`, `InputManualModal`, `LaporanBulananModal`, `RincianBiayaModal` | **16×24** |
| `AdminJobEditModal`, `AdminShareModal` | **24×32** |
| `CandidateProfileModal`, `EditCandidateModal` | tanpa padding sama sekali |
| `UndanganKelasModal`, `RejectMailModal` | tanpa padding sama sekali |

`PemberkasanModal` sudah memakai pola yang benar (`min-w-11 min-h-11 inline-flex items-center
justify-center`) — itulah rujukannya. Sebelas berkas diseragamkan ke pola itu.

#### M3 · `useOverlay` bisa mengirim dialog TANPA NAMA 🟠 → ✅ DIPERBAIKI

Hook itu menulis sendiri di komentarnya:

> *"Resolved from the DOM rather than required of the call site, so a modal cannot ship
> unnamed by omission — the failure mode this round exists to close."*

**Klaim itu tidak benar, dan ini kasus yang mematahkannya.** Efeknya hanya berjalan ulang
saat `open`/`role`/`titleId`/`label` berubah. `CandidateProfileModal` merender **spinner**,
bukan `<h2>`-nya, selama data dimuat:

```jsx
{loading || !data ? (<spinner/>) : (<><h2>{data.nama}</h2>…</>)}
```

Jadi hook menamai dialog **sekali, terhadap pohon yang masih kosong**, lalu tidak pernah
mencoba lagi. Terukur: `role="dialog"`, `aria-modal="true"`, **`aria-labelledby` absen** —
pembaca layar mengumumkan "dialog" dan tidak apa-apa lagi, permanen.

Diperbaiki di hook: penamaan diulang lewat `MutationObserver` pada sub-pohon overlay, dan
**observer diputus begitu nama ditemukan**. Biayanya satu observer selama beberapa ratus
milidetik saat fetch — bukan biaya tetap di 28 call site.

#### M4 · Kontrol di dalam modal di bawah 44 px 🟠 → ✅ DIPERBAIKI

Terukur per modal (desktop, tema gelap):

| Modal | Sebelum | Sesudah |
|---|---|---|
| `RincianBiayaModal` | **60** | **1** |
| `AdminShareModal` | 14 | 14 (semuanya artefak — lihat bawah) |
| `EditCandidateModal` | 12 | **0** |
| `InputManualModal` | 12 | **0** |
| `MatchmakingModal` | 9 | 2 (artefak) |
| `AdminJobEditModal` | 8 | **0** |
| `CandidateProfileModal` | 5 | **0** |
| `UndanganKelasModal` | 2 | **0** |
| `RirekishoBuilder` | 2 | **0** |
| `LaporanBulananModal` | 1 | **0** |
| `PemberkasanModal` | 0 | 0 |
| `RejectMailModal` | tidak terukur | **0** |

Polanya: input/select 34–42 px, tombol ikon `w-7 h-7`/`w-8 h-8`, tombol `px-4 py-1.5` 28 px,
dan satu tombol sakelar 44×24. Sakelar VIP diperbaiki dengan **membungkus track 44×24 yang
tidak berubah di dalam tombol 44×44** — tampilannya identik, kotaknya benar-benar 44.

#### M5 · Kontrol interaktif bersarang di dalam tombol 🟠 → ✅ DIPERBAIKI

`RincianBiayaModal` merender **20** bintang favorit sebagai
`<span role="button" tabIndex={0}>` **di dalam** `<button>` chip-nya. Itu:
- HTML tidak sah (konten interaktif di dalam tombol),
- memaksa `e.stopPropagation()` di setiap klik bintang hanya agar chip-nya tidak ikut menyala,
- **tab stop kedua di dalam yang pertama**,
- dan terukur **9×17 px** — seperempat lantai 44 px.

Strukturnya diubah: pilnya kini pembungkus **non-interaktif** yang berisi **dua tombol
sungguhan** (bintang dan label). Tampilan pil tidak berubah karena border dan isiannya pindah
ke pembungkus. `aria-pressed` ditambahkan pada tombol label, karena status terpilih chip itu
sebelumnya **hanya dibawa warna** (§6.6).

Satu unit test menegaskan struktur lama (`chip.querySelector('span')`); test itu diperbarui —
DOM-nya memang sengaja berubah.

#### M6 · `FOTO` 3,95:1 pada placeholder CV 🟡 → ✅ DIPERBAIKI

Placeholder foto memakai `color:gray` = `#808080` → **3,95:1** di atas kertas putih, di bawah
ambang 4,5 untuk teks normal. Diganti `#6b7280` (4,83:1).

### Dua hal yang **bukan** temuan (pembacaan palsu)

1. **"Tiga modal tanpa `role="dialog"`".** Sapuan pertama membaca `role` dari elemen
   `.u-modal-shell`. Ternyata `useOverlay` memasang `containerRef` — dan karenanya `role`
   dan `aria-modal` — pada elemen tempat komponen meletakkan ref-nya: sebagian di shell luar,
   sebagian di panel dalam. Membaca hanya shell melaporkan tiga modal "tanpa peran" yang
   sebenarnya punya. Setelah pembacanya diperbaiki: **12 dari 12 `role=dialog`,
   `aria-modal=true`**.
2. **"`AdminShareModal` 14 pelanggaran 44 px".** Keempat belasnya `<input type=checkbox>`
   16×16 yang dibungkus `<label>`. Sasaran sentuhnya labelnya, dan labelnya **66×44 / 103×44 /
   108×44** — sudah lolos. Sama untuk 2 di `MatchmakingModal`.

### Hasil akhir kedua belas modal

| Metrik | Sebelum | Sesudah |
|---|---|---|
| Modal dengan `role="dialog"` + `aria-modal` + nama | 9 dari 12 | **12 dari 12** |
| Kontrol < 44 px (desktop, total) | 125 | **3** (semuanya artefak checkbox) |
| `shadow-*` | 0 | 0 |
| Kegagalan kontras | 2 (`RirekishoBuilder`) | **0** |
| Tombol tutup ≥ 44×44 | 1 dari 12 | **12 dari 12** |
| Judul dokumen CV terlihat | **tidak** | **ya** (0 → 49 piksel hitam) |

⚠ **Satu modal masih tanpa heading: `RirekishoBuilder`** (`h=none`). Itu keputusan pemilik
yang sudah tercatat — menambah `h3` mengubah outline halaman, dan dokumennya adalah lembar
cetak. Tidak diubah di sini.

Gate yang menjaga perubahan ini: `vitest src/components/admin src/components/ui` **252 lulus**
· `tsc` bersih · `verify:classes` · `lint-ratchet` PASSED (utang **−22**) · `e2e:dialog`
**20/0** · `e2e:aria-names` **40/0** · `e2e:drawer` **7/7** · `e2e:headings` · `e2e:labels`
**4/4** · `e2e:contrast` **0** di bawah ambang.

---

## 6. Batas review ini

- Yang diukur adalah **DOM yang dirender** dari fixture, bukan data produksi.
- `dist/` **tidak dipakai** — lebih tua dari HEAD.
- Tangkapan layar `fullPage` **membaca salah elemen `fixed`**: sidebar dan BottomNav
  muncul di posisi aneh karena `fixed` dirender pada posisi viewport sementara
  halaman dipotong penuh. Semua klaim geometri di dokumen ini dari DOM, bukan gambar.
- **Pohon kerja tidak bersih**: 9 berkas dari sesi lain (`netlify/functions/_lib/ai/*`,
  `AdminAiCopilot.*`) tetap termodifikasi dan **tidak disentuh** review ini.
- Probe mengukur `<input>` alih-alih `<label>` untuk kotak centang — lihat §4 dan §5 (M4).
- Sisa yang belum dikerjakan: F10 (keputusan pemilik), `FormToolbar` 33×44, dan
  `pt-[42px]` di 9 rute lain.
- **Skrip probe ada di luar repo** (`E:/tmp/ui-probe/`), dengan `node_modules` berupa
  junction ke `E:/astro/node_modules`. `admin-modals.mjs` membuka kedua belas modal dan
  mengukur masing-masing di 2 viewport × 2 tema.
- Dua pembacaan palsu yang ditemukan **di dalam probe sendiri**, keduanya sudah diperbaiki
  dan keduanya dicatat di atas: `role` dibaca dari shell alih-alih elemen ber-ref (M3/nomor 1
  di daftar "bukan temuan"), dan kotak centang diukur alih-alih labelnya (nomor 2).
- `RirekishoBuilder` sengaja tetap tanpa heading — keputusan pemilik, bukan kelalaian.
