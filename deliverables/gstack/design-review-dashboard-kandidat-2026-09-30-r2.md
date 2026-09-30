# Design review **r2** — Dashboard Kandidat `/candidate`

**Tanggal:** 2026-09-30 (sesi kedua) · **Rute:** `/candidate` · **Deliverable visual:**
`_review-dashboard-kandidat-2026-09-30-r2.html` (buka di browser, ada toggle tema)

**Ini review KEDUA hari ini.** Review pertama (`design-review-dashboard-kandidat-2026-09-30.md`,
02:07) menutup 6 langkah lewat commit `04a204b` … `58efe33`. Dokumen ini **tidak**
mengulang temuannya — ia mengukur **keadaan sesudahnya** dan mengusulkan apa yang
masih tersisa.

**Cara mengukur.** Halaman dijalankan sungguhan di `chromium` headless terhadap
`astro dev` (bukan `dist/` — `dist/` masih dari 10:10 dan akan berbohong), viewport
**1280×900** dan **390×844**, tema **terang dan gelap**, fixture sesi kandidat
(`asj_auth`) + `/.netlify/functions/**` di-`fulfill` lokal. Fixture sengaja penuh
(VIP, `catatanExt`, 3 entri riwayat, 1 jadwal, biodata lengkap) supaya yang terukur
adalah **kasus terburuk**. Semua angka dari `getBoundingClientRect()`,
`getComputedStyle()`, dan warna yang dinormalkan lewat `canvas` — bukan dari membaca
CSS.

> ⚠ **Satu jebakan pengukuran yang hampir menghasilkan temuan palsu.**
> `getComputedStyle().color` di Chromium ini mengembalikan `oklch(...)`/`oklab(...)`
> ketika sumbernya memakai ruang warna itu. Parser `/rgba?\(/` mengembalikan `null`
> untuk bentuk itu, dan node-nya **dilewati diam-diam** — audit kontras pertama saya
> melaporkan "0 gagal di tema gelap" sambil melewati persis elemen yang gagal.
> Angka kontras di bawah memakai normalisasi `canvas` (`fillStyle` → `getImageData`).

---

## 1. Apa yang benar-benar berubah pagi ini (terukur)

Angka "sebelum" diambil dari dokumen review 02:07, bukan diukur ulang oleh saya.

| Metrik | Sebelum (02:07) | Sekarang | Δ |
|---|---|---|---|
| String persen di DOM | 7 | **4** | −3 |
| Bar progres | 12 | **4** | −8 |
| Tinggi halaman desktop | 3481 px | **3094 px** | **−387 px (−11%)** |
| Tinggi halaman ponsel | 4127 px | **3725 px** | **−402 px (−10%)** |
| Hex literal di `src/components/candidate/` | 1 (`#0f172a`) | **0** | −1 |
| Gradien gelap-bocor-di-terang | 2 kartu | **0** | −2 |
| Outline heading | 0 `h1`, 0 `h2` | **1 `h1`, 6 `h2`, 2 `h3`** | ✅ |
| Checklist 18 dokumen | terbuka (442 px) | **`<details>` (176 px)** | −266 px |
| Tombol berteriak | 7 bobot setara | **1 CTA gradien + 7 sekunder seragam** | ✅ |
| `role="progressbar"` | 1 | **4** (semua bernama) | ✅ |

**Kontras tema terang bersih.** Tiga kebocoran yang dilaporkan pagi ini sudah tidak
ada. Saya sempat mengira menemukan yang keempat — di tema terang teks kartu siswa
terhitung `rgb(31, 29, 28)` (hampir hitam) di atas kartu yang terlihat gelap.
**Itu salah saya, dan pengukuran membuktikannya:** shim tema terang tidak hanya
membalik `.text-white`, ia juga **memetakan ulang gradien kartunya**
(`from-slate-900 via-slate-800` → `rgba(243,239,243,0.95) … rgb(236,231,236)`).
Kartunya memang jadi kartu terang. Kontrasnya lolos di kedua tema. Jangan "perbaiki"
apa pun di sana.

Yang **belum** berubah: rail kanan (§4.3) belum dibangun, dan langkah 7–8 review
pertama masih terbuka.

---

## 2. Yang masih salah (terukur)

### F1 · Lima permukaan bersarang — biang "kartunya kek redundant" 🔴

Ini temuan utama, dan ini **bukan** soal warna atau isi. Rantai bersarang yang
terukur, dari `main` ke elemen terdalam:

| x | lebar | radius | padding | border | shadow | kelas |
|---|---|---|---|---|---|---|
| 185 | 896 | 24 | 24 | 1 | **shadow-2xl** | `.glass-panel` — seluruh dashboard |
| 210 | 846 | 24 | 24 | 1 | **shadow-xl** | kartu seksi (`bg-sky-500/10`) |
| 235 | 796 | 24 | 4 | 1 | **shadow-lg** | bingkai gradien (`from-sky-500/30 to-emerald-500/30`) |
| 240 | 786 | 16 | 24 | 0 | — | `bg-surface` di dalamnya |
| 264 | 720 | 16 | 16 | 1 | **shadow-lg** | kartu entri riwayat |

**Lima tepi kiri berbeda** (185 · 210 · 235 · 264 · 281 di desktop). Commit
`a992dd0` berjudul *"one column edge, one padding, one radius"* — **tepi kontainer
memang sudah satu**, tapi tepi *di dalamnya* masih lima, dan itu yang dilihat mata.

Di ponsel biayanya bisa dihitung: tepi terdalam di **x=124** pada viewport 390 px.
Artinya **108 px (28% lebar layar)** habis untuk padding + border + bingkai sebelum
satu karakter isi muncul.

Tidak ada aturan repo yang melarang ini secara eksplisit — tapi §4.2 menetapkan
maksimum **8–10 kartu** per grid, dan §3.6 menetapkan permukaan dipisahkan
**border, bukan bayangan**. Di sini 4 bayangan bersarang bersaing dalam satu kolom.

### F2 · Satu blok memakan seperempat halaman 🟠

Tinggi seksi terukur (desktop 1280 / ponsel 390):

| Seksi | Desktop | Ponsel |
|---|---|---|
| (sebelum seksi pertama) | **954 px = 31%** | 1221 px |
| Kartu siswa | 256 | 224 |
| Kelengkapan Profil | 263 | 353 |
| Jadwalmu | 168 | 160 |
| Pesan admin | 94 | 126 |
| **Status Lamaran Terkini** | **749 (24%)** | **1041 (28%)** |
| Progres Pemberkasan | 204 | 192 |

`Status Lamaran Terkini` merender **pipeline 10 tahap penuh untuk SETIAP entri** —
dan 2 entri di fixture memakai 10 label yang sama persis
(`PENDAFTARAN CHECK KAIWA MENDAN LOLOS USER MCU PEMBERKASAN NAITEI COE VISA FLIGHT`).
Di dalamnya ada kotak gulir `max-h-[300px]` yang isinya **1038 px** di ponsel:
gulir di dalam halaman, di dalam panel.

**954 px (31%) sebelum kartu isi pertama** juga layak dicatat — itu header + kartu
dossier + toolbar.

### F3 · Ruang mati 369 px di desktop 🟠

Dashboard `max-w-4xl` = **896 px** di dalam `main` **1265 px**. Sisa **369 px (29%)**
kosong di kanan. §3.5 menetapkan lebar rail kanan **22rem = 352 px** — angkanya
hampir persis sama dengan ruang yang terbuang. Rail §4.3 belum dibangun (langkah 7
review pertama).

### F4 · Dua animasi `width` — melanggar P7 🟠

Terukur di DOM, 4 instance:

| Elemen | properti | durasi |
|---|---|---|
| bar tahapan lamaran ×3 | `width` | **1 s** |
| meter Kelengkapan Profil | `width` | 0,5 s |

P7 (`DESIGN.md:34`): *"Gerak hanya `opacity` + `transform`, 180 ms"* dan §3.7
melarang menganimasikan `width`. `transition-[width]` adalah animasi layout yang
memaksa reflow tiap frame; padanannya `transform: scaleX()` tidak.

### F5 · Tiga `animate-pulse`, satu di antaranya satu kalimat utuh 🟠

`animate-pulse` ×3, `infinite 2s`:
- ikon `calendar-check` di judul Jadwalmu
- ikon `satellite-dish` di judul Daftar Lamaran
- **satu paragraf penuh** `ui.berkas_stage_hint` (`text-sm text-emerald-400 font-bold`)

§1.2 menolak kinetic typography; teks instruksi yang berdenyut 2 detik terus-menerus
adalah penghalang baca, bukan penekanan.

### F6 · ~~Dua kegagalan kontras AA~~ — **DITARIK. Tidak ada kegagalan kontras.** ⛔

> **KOREKSI 2026-09-30 (sesi yang sama, beberapa jam kemudian).**
> Klaim di bawah **salah**, dan salahnya karena alat ukur saya, bukan karena
> halaman. Angka 4,15 / 3,46 / 2,63 dihasilkan oleh *backdrop resolver* yang
> menjumlahkan `backgroundColor` leluhur dengan dua cacat: lapisan tembus cahaya
> dicampur pada opasitas penuh (`over(acc, c)` memperlakukan rgb milik `c`
> seolah opaque), dan akumulasinya berjalan dari lapisan TERDEKAT ke luar,
> bukan dari lapisan opaque pertama ke dalam. Akibatnya tint amber 10% menyeret
> latar gelap menjadi mid-tone.
>
> **Diukur ulang dengan benar** — latar disampel dari piksel yang benar-benar
> tergambar, diambil dari ruang kosong di sebelah teks (bukan dari glyph, ikon,
> atau elemen di dalam kotak gulir yang terpotong):
>
> | Teks | Gelap | Terang | Ambang |
> |---|---|---|---|
> | `2026-10-05 08:00` | **9,32** ✅ | **4,61** ✅ | 4,5 |
> | `Klinik Sehat Ponorogo` | **5,92** ✅ | **6,46** ✅ | 4,5 |
>
> Keempatnya lolos dengan lega. **Tidak ada yang perlu diperbaiki di sini** —
> dan "memperbaiki" teks yang sudah lolos hanya akan menggeser token tema tanpa
> sebab. Review pertama (02:07) melaporkan elemen yang sama pada 2,99 / 2,47;
> alatnya kemungkinan besar punya cacat yang sama.
>
> Catatan yang sama berlaku untuk audit piksel yang saya tulis untuk
> memverifikasi ini: ia melaporkan ~8 kegagalan, dan **semuanya artefak** —
> baris checklist berada di dalam kotak gulir `max-h-44` yang terpotong, jadi
> piksel di koordinatnya digambar oleh elemen lain (dalam kasus ini gradien bar
> progres). Kesimpulannya: **di halaman ini tidak ada kegagalan kontras AA**,
> diukur dari kedua sisi.

<details>
<summary>Klaim yang ditarik (disimpan supaya tidak diulang)</summary>

Diukur dengan `getComputedStyle` + penjumlahan leluhur, ambang 4,5:

| Teks | Kelas | Gelap | Terang | Ukuran |
|---|---|---|---|---|
| `2026-10-05 08:00` (jam jadwal) | `text-[11px] text-accent-amber font-mono` | ~~4,15~~ ❌ | ~~3,46~~ ❌ | 11 px |
| `Klinik Sehat Ponorogo` (lokasi) | `text-xs text-slate-400` | ~~2,63~~ ❌ | lolos | 12 px |

</details>

**Bukan temuan:** CTA `Lengkapi Pemberkasan & Biodata`. Audit generik saya
melaporkan rasio **1** (di atas gradien) — itu titik buta metode, bukan cacat.
Gradiennya **identik di kedua tema** (`oklch(0.508 0.118 165.612)` → `oklch(0.5 0.134 242.749)`
= `emerald-700` → `sky-700`), teksnya `rgb(255,255,255)`, dan
`global.css:1067-1068` memang memuat kedua kelas itu di daftar re-light. Menurut
tabel skill: **5,48 – 5,93 → LULUS**, dan hover-nya menggelap (7,68 / 7,56).

### F7 · Dua teks yang salah tempat 🟡

`ui.cv_type_hint` = *"Pilih data dasar untuk profil singkat, data lengkap untuk
rincian menyeluruh."* — sebuah petunjuk **form CV**. Ia dipakai untuk **dua** maksud
yang tidak ada hubungannya:

1. `CandidateDash.tsx:520` — subjudul sapaan, cadangan ketika `job`/`tahapan` kosong.
2. `CandidateDash.tsx:630` — deskripsi di bawah **"Status Lamaran Terkini"**.

Di tempat kedua ia menjelaskan pilihan CV di bawah judul status lamaran. Satu kunci
i18n, dua pekerjaan, keduanya salah. Butuh dua kunci baru (§7.1: kunci baru wajib
ada di `i18n.ts` **dan** `i18n-jp.ts`).

### F8 · Sisanya 🟡

| Temuan | Terukur | Aturan |
|---|---|---|
| `font-black` (900) pada teks < 20 px | 11–19 instance | §3.3 *"Yang dihentikan: … `font-black` pada teks di bawah 20 px"* |
| `shadow-*` bertingkat | 4 bersarang: `2xl` → `xl` → `lg` → `lg` | §3.6 *"tidak memakai skala bayangan bertingkat"* |
| Judul kartu jadi `h2` | `"ID Siswa ASJ"` | §6.1: judul di dalam kartu = `h3` |
| Sapaan mengulang nama | `h2` "Selamat datang, Budi Santoso" tepat di bawah dossier yang sudah menampilkan "BUDI SANTOSO" | §7.3 |
| Target sentuh < 44 px | pil loker `h=27` ×2, `<summary>` `h=24` | §6.4 (44×44) |
| Radius | `{12, 16, 24, pill}` | ✅ **patuh** — 4 dari 5 token, tanpa literal |
| Padding kartu | panel 24/20, kartu dalam 16, chip 4–8 | ✅ **patuh** — dua tingkat yang konsisten |

### F9 · Tujuh tombol aksi berada di dalam kartu "Status Lamaran Terkini" 🟠 → ✅ **SELESAI `8e775e4`**

> **Diperbaiki 2026-09-30.** Ketujuh tombol dipindah ke rail kanan, keluar dari
> kartu status. Tidak ada kunci i18n baru yang diperlukan — rail sudah punya
> konteksnya sendiri, dan menambahkan judul di sana justru menambah satu lapisan
> lagi. Terukur `actions in STATUS CARD: 0, in RAIL: 5`; gate
> `e2e/test-candidate-modals.mjs` **8 lulus, 0 gagal** (`triggers present: 6/6`),
> jadi keenam pemicu modal tetap bisa diklik langsung.

**Ditemukan 2026-09-30 saat memeriksa hasil `c01eaaf`, bukan dari pengukuran awal.**

Kartu `Status Lamaran Terkini` (`h2`) membungkus:

```
h2  Status Lamaran Terkini
p   deskripsi
h3  DAFTAR LAMARAN          ← daftar lamaran
    …pills, kotak gulir, entri…
    grid 7 tombol aksi      ← Update Profil, Latihan Interview, E-Sign Naitei,
                              AI CV Master, Form Master Lengkap, Preview Desain CV,
                              Ganti Password
```

Tujuh tombol itu tidak ada hubungannya dengan status lamaran, dan **tidak punya
judul sendiri** — jadi pembaca layar mendengarnya sebagai bagian dari "Status
Lamaran Terkini". Sebelumnya bingkai gradien + permukaan dalam membuat keduanya
*terlihat* seperti dua blok; setelah `c01eaaf` keduanya duduk di permukaan yang
sama, sehingga ketidaksesuaiannya jadi terlihat.

Ini juga melanggar §9 *"Kartu bersarang di dalam kartu … **Satu tingkat saja**"*.

**Usul:** pindahkan grid aksi keluar dari kartu status, jadi seksi tingkat halaman
dengan `h2` sendiri (mis. `dash.quick_actions` = "Aksi Cepat"). Butuh kunci i18n
baru di kedua kamus. ⚠ `e2e/test-candidate-modals.mjs` menuntut 6 pemicu modal ada
dan bisa diklik **tanpa satu klik tambahan** — memindahkan boleh, menyembunyikan
tidak.

---

## 3. Usulan

### U1 · Lima permukaan → dua 🔴

Akar masalahnya bukan warna, tapi **satu `.glass-panel` yang membungkus tujuh seksi**.

```
SEKARANG                                USULAN
main                                    main
└ .glass-panel  (panel raksasa)         ├ header (kartu dossier, TANPA panel)
  ├ seksi card                          ├ section — Kelengkapan
  │ └ frame gradien                     │  └ isi langsung di permukaan seksi
  │   └ card surface                    ├ section — Lamaran terkini
  │     └ entry card  ← 5 tepi           │  └ entry card  ← 2 tepi
  └ …                                   └ section — Berkas
```

- Kartu dossier **keluar** dari panel; ia sudah menjadi header halaman.
- Setiap seksi jadi `<section>` **saudara** di permukaan halaman, dipisah `gap` +
  satu garis rambut. Panel pembungkus dihapus.
- Bingkai gradien di dalam "Status Lamaran" dihapus — gradien itu satu-satunya
  alasan kedalaman ke-3 ada.
- **Satu** tingkat bingkai yang dipertahankan: kartu entri riwayat (ia memang butuh
  batas).

Hasil terukur yang diharapkan: tepi **185/210/235/264/281 → 2 tepi**, dan di ponsel
biaya horizontal **108 px → ~40 px**.

### U2 · Bangun rail §4.3 — ambil kembali 369 px 🟠

```css
/* ≥1280px */
grid-template-columns: minmax(0, 1fr) 22rem;
```

```
main (1fr)                        rail (22rem, sticky top 5.5rem)
──────────────────────────────    ──────────────────────────────
1. Kelengkapan (meter bersegmen)   Jadwalmu
2. Lamaran terkini                 Pesan admin
3. Berkas                          Aksi cepat (7 tombol sekunder)
```

Rail **tidak menggandakan** seksi apa pun (§4.3). Urutan DOM tetap sama supaya
urutan baca tidak berubah; di <1280 px `aside` mengalir setelah `main`.

### U3 · Pipeline 10 tahap jadi rail titik, bukan 10 label 🟠

Blok terbesar halaman (749 / 1041 px) merender 10 label untuk tiap entri. Usul:

```
SEKARANG (per entri)                    USULAN (per entri)
PENDAFTARAN ✓  CHECK KAIWA ✓  MENDAN ✓   ●●●●●○○○○○  PEMBERKASAN
LOLOS USER ✓  MCU ✓  PEMBERKASAN ●       tahap 6 dari 10 · diperbarui 10 Sep
NAITEI ○  COE ○  VISA ○  FLIGHT ○        ▸ lihat 10 tahap
```

10 label penuh pindah ke `<details>` (pola yang **sudah** dipakai repo ini di
`FaqList.tsx` dan sudah dipakai di kartu Berkas). Ini juga menghapus kotak gulir
`max-h-[300px]` — setelah entri memendek, tidak ada lagi 1038 px yang perlu
digulir di dalam kotak 300 px.

Perkiraan hemat: **~500 px di ponsel**, ~300 px di desktop.

### U4 · `transform: scaleX()` untuk bar 🔴 (murah, langsung)

```diff
- class="... transition-[width] duration-1000" style={`width:${pct}%`}
+ class="... origin-left transition-transform duration-200" style={`transform:scaleX(${pct/100})`}
```

4 instance (3 bar tahapan + 1 meter). Memenuhi P7 dan menghapus animasi layout.

### U5 · Hapus 3 `animate-pulse` 🟡

Terutama yang di **paragraf** — teks instruksi tidak boleh berdenyut. Kalau
penekanan perlu, pakai border atau ikon statis.

### U6 · Turunkan bayangan ke border 🟡

4 bayangan bersarang → border saja (§3.6). Pertahankan **satu** tingkat elevasi
untuk lapisan modal, yang memang butuh memisahkan diri dari halaman.

### U7 · ~~Perbaiki 2 kontras~~ — **DIBATALKAN** ⛔

Tidak ada yang diperbaiki. Lihat koreksi di **F6**: keempat angka lolos
(9,32 / 4,61 / 5,92 / 6,46). Mengubah token tema di sini akan menggeser warna
tanpa memperbaiki apa pun — dan berisiko menurunkan kontras yang sekarang lolos.

### U8 · Dua kunci i18n untuk dua maksud 🟡

`ui.cv_type_hint` dipakai dua kali untuk dua pekerjaan. Buat
`dash.greeting_subtitle` dan `dash.app_status_desc` di `i18n.ts` **dan**
`i18n-jp.ts` (§7.1, dijaga `i18n.keys.test.ts`).

### U9 · Target sentuh & heading 🟡

- Pil loker `h=27` → `min-h-11` (44 px); `<summary>` `h=24` → `min-h-11`.
- `"ID Siswa ASJ"` `h2` → `h3` (§6.1: judul di dalam kartu).
- Sapaan: buang pengulangan nama, atau ubah jadi `h1`-nya halaman dan turunkan
  `FormToolbar` — **tapi** `e2e/test-headings.mjs` menuntut tepat satu `h1`, jadi
  pilih satu, jangan dua.

---

## 4. Urutan pengerjaan

Satu langkah per commit (R3). `vitest` dulu, baru `npm run build` — **bukan**
`astro build` sendiri (§3f: `dist/sw.js` tertinggal sebagai file dev dan 5 tes
`swOffline` jadi merah).

| # | Langkah | Sentuh | Risiko | Dampak | Status |
|---|---|---|---|---|---|
| 1 | `scaleX()` untuk 4 bar (U4) | `CandidateDash`, `LevelCard` | rendah | tinggi | ✅ **selesai** `21f7361` |
| 2 | ~~2 kontras (U7)~~ | — | — | — | ⛔ **dibatalkan** (F6: tidak ada kegagalan) |
| 3 | Hapus 3 `animate-pulse` (U5) | `CandidateDash` | rendah | sedang | ✅ **selesai** `14f65bd` |
| 4 | 2 kunci i18n (U8) | `CandidateDash`, `i18n`, `i18n-jp` | rendah | sedang | ✅ **selesai** `4e0fd52` |
| 5 | Target sentuh + `h3` (U9) | `CandidateDash` | rendah | sedang | ✅ **selesai** `cc609b3` |
| 6 | Pipeline → rail titik + `<details>` (U3) | `CandidateDash` | **sedang** | tinggi | ✅ **selesai** `b1fa7f4` |
| 7 | Lima permukaan → dua (U1) | `CandidateDash`, `candidate.astro` | **tinggi** | tinggi | ✅ **selesai** `c01eaaf` + `8e775e4` |
| 8 | Rail 22rem (U2) | `candidate.astro`, `CandidateDash` | sedang | tinggi | ✅ **selesai** `8e775e4` |
| 9 | Bayangan → border (U6) | `CandidateDash` | rendah | rendah | ✅ **selesai** `6327fda` |

**F9 juga selesai** di `8e775e4`: tujuh tombol aksi keluar dari kartu "Status
Lamaran Terkini" ke rail. Terukur `actions in STATUS CARD: 0, in RAIL: 5`
(5 membawa `cmt-*`; dua lainnya memang tidak pernah punya).

### Hasil terukur sesudah langkah 1–9

| Metrik | Sebelum | Sesudah |
|---|---|---|
| `transition: width` | 4 | **0** |
| `animate-pulse` | 3 | **0** |
| Kontrol < 44 px | 3 dari 11 | **0 dari 14** |
| `shadow-*` di `CandidateDash` | 10 | **0** |
| `.glass-panel` pembungkus | 1 | **0** |
| Isi kotak gulir riwayat (ponsel) | 1038 px | **788 px** (−24%) |
| Tepi kiri entri (desktop) | x=264, w=720 | **x=235, w=778** (+58 px) |
| Ruang mati kanan (desktop) | 369 px (29%) | **0** — terisi rail 352 px |
| `grid-template-columns` ≥1280 px | — | **857 px + 352 px** |
| Tinggi halaman desktop | 3132 px | **2716 px** (−416, −13%) |
| Tinggi halaman ponsel | 3780 px | **3554 px** (−226, −6%) |

Gate yang menjaga perubahan ini: `e2e/test-candidate-modals.mjs` →
**8 lulus, 0 gagal**, `triggers present: 6/6`.

**Satu penyimpangan sadar dari usulan review.** Rail yang diusulkan adalah
*jadwal → pesan admin → aksi cepat*. Yang dipakai: **pesan admin → aksi cepat**,
dan **"Jadwalmu" tetap di kolom utama**. Alasannya di ponsel rail mengalir ke
bawah, dan jadwal MCU adalah hal paling terikat waktu di halaman ini — menurunkannya
di bawah "Progres Pemberkasan" adalah regresi. Alasan itu ada di kode, jadi mudah
dibalik kalau pemilik lebih suka urutan usulan awal.

**Prasyarat yang ternyata juga merah:** `npx vitest run` di pohon ini
**4 gagal | 2021 lulus**. Tiga di antaranya cacat sandbox (proses anak tidak
bisa di-spawn dari dalam vitest: `EBUSY` pada `spawnSync cmd.exe`, `exit null`
pada oracle depcruise, dan `execFileSync('git')` yang melempar) — ketiganya
**lulus** ketika perintahnya dijalankan langsung dari shell. Yang keempat nyata
dan sudah diperbaiki: `LokerDetailModal.test.tsx` merah **di HEAD**
(`ui.close` dan `public.close` sama-sama berbunyi "Tutup") → `6a2c45a`.

⚠ **Langkah 6–9 menyentuh penanda yang di-assert test.** `CandidateDash.test.tsx`
(714 baris) membaca `document.querySelector('[role="progressbar"]')` dan menuntut
`aria-valuenow` = kelengkapan profil — **bar pertama harus tetap milik `LevelCard`**.
`e2e/test-candidate-modals.mjs` menuntut 6 pemicu modal ada dan bisa diklik **tanpa
satu klik tambahan**: jadi 7 tombol aksi boleh diturunkan bobotnya, **tidak boleh**
disembunyikan di menu overflow. Keduanya sudah ditulis sebagai komentar di sumber —
baca sebelum mengubah.

⚠ **Menambah berkas menggeser 3 angka beku** (R15): `count('ts')`/`count('tsx')`
dan `files.length` di `discover.test.ts`, plus `fileCount` di `build.test.ts`.
Geser **satu per satu** dan jalankan ulang tiap kali — dua di antaranya tidak
muncul bersamaan. Grep seluruh keluaran untuk `AssertionError`, jangan `tail -5`.

---

## 5. Batas review ini

- Yang diukur adalah **DOM yang dirender** dari fixture, bukan data produksi.
  Kandidat tanpa riwayat/jadwal akan terlihat berbeda (beberapa blok di-`omit`).
- **Tidak ada berkas sumber yang diubah.** `CandidateDash.tsx`, `LevelCard.tsx`,
  `StepGuide.tsx`, `AsjDossierCard.tsx`, `candidate.astro` hanya dibaca.
- Skrip pengukuran ditulis **di luar repo** (`F:/tmp/ui-probe/r2*.mjs`) supaya tidak
  menggeser inventaris beku indexer — `includePath()` hanya menerima `src/`,
  `netlify/functions/`, `shared/`, `scripts/`, `e2e/`, dan root.
- `dist/` **tidak dipakai**: ia dari 10:10, lebih tua dari commit terakhir
  (`58efe33`). Semua pengukuran lewat `astro dev`.
- Pohon kerja **tidak bersih** saat review ini dibuat: 25 berkas termodifikasi +
  12 untracked (backlog lama, bukan dari sesi ini). `CandidateDash.tsx` membawa
  1 baris belum di-commit (`logo-removebg-preview.webp` → `/icons/logo-asj.webp`).
