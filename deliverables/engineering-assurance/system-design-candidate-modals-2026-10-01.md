# Enam modal dashboard kandidat — audit terukur + perbaikan

**Tanggal:** 2026-10-01
**Workflow:** 2 (System Design) dengan review kode (workflow 1) dilipat masuk
**Lingkup:** enam modal yang dibuka `/candidate`
**Commit:** `5e19908` (skeleton Rirekisho) · `a01bf60` (E-Sign + i18n) · `b5ea1f4` (gate yatim) — **belum di-push** (R19)
**Anggota:** Archi (arsitek) · Tessa (testing) · — Cody & Rex tidak dikerahkan (lihat §6)

---

## 📌 TL;DR

- **Enam modal diaudit dengan pengukuran, bukan tinjauan mata.** Hasilnya: lima
  dari enam sudah sehat; **yang rusak bukan yang paling terlihat**.
- **Temuan terbesar bukan di modal mana pun** — `e2e/test-candidate-modals.mjs`,
  satu-satunya gate yang membuka keenam modal, **yatim**: tidak punya script npm,
  tidak ada di `test:e2e`, tidak dijalankan job `e2e`. Ia berjalan 8/8 saat
  dipanggil manual dan **tidak melindungi apa pun** di CI.
- **Dua cacat bersembunyi di sub-layar E-Sign** yang tidak pernah dibuka audit
  sebelumnya: tombol tutup 86×32 px, dan judul tugas yang **tidak pernah bisa
  diterjemahkan** (literal Indonesia).
- **Severity:** 🔴 0 terbuka · 🟠 0 · 🟡 2 (dicatat, tidak dikerjakan) · 🟢 4
- **Tiga klaim audit sumber TERBANTAHKAN saat diverifikasi** (§5) — dilaporkan,
  bukan dikerjakan.

---

## 🎯 Core conclusion card

| Item | Isi |
|---|---|
| Rating keseluruhan | 🟢 **Lolos** — semua temuan yang terukur sudah ditutup |
| Item pemblokir | **0** |
| Tindakan kunci | 4 (2 opsional, 2 keputusan pemilik) |
| Langkah berikutnya | Putuskan apakah `/public` + `/admin` ikut diskeletonkan |

---

## 1. Hasil pengukuran — keadaan awal

Diukur dari DOM yang dirender, 1280×900 dan 390×844, tema gelap (default),
fixture sesi kandidat penuh. Skrip di luar repo (`F:/tmp/ui-probe/modals-probe.cjs`).

| Modal | Panel (desktop / ponsel) | Heading | Kedalaman permukaan | Kontrol <44 px | Overflow |
|---|---|---|---|---|---|
| Ubah Password | 384×441 / — | `h3` | 2 | **0** | tidak ada |
| CV Mini | 448×637 / 358×637 | `h3` | 2 | **0** | tidak ada |
| **Rirekisho** | 794×855 / 343×802 | **tidak ada** | 1 | **0** | A4 bisa di-scroll → §4 |
| Pemberkasan | 896×810 / 358×760 | `h3`+4×`h4` | **3** | **0** | tidak ada |
| Wawancara | 672×720 / 390×760 | `h3` | 2 | **0** | tidak ada |
| E-Sign | 512×699 / 358×683 | `h3`+2×`h4` | **3** | **0** | tidak ada |

**0 console error di keenamnya. Semua muat viewport. Nol kontrol di bawah lantai
sentuh.** Perbaikan F11 (`39f5757`) bertahan di keadaan default setiap modal.

⚠ **Batas pengukuran ini, dan ia penting:** probe membuka setiap modal di keadaan
**DEFAULT** saja. Cacat yang hidup di **sub-layar** tidak terlihat. Itu bukan
kecurigaan teoretis — dua cacat nyata bersembunyi persis di sana (§2).

---

## 2. Yang diperbaiki

### F17 · Sub-layar gambar E-Sign: tombol 86×32 dan judul yang tak bisa diterjemahkan 🔴 → ✅ `a01bf60`

Layar gambar (`EsignNaiteiModal.tsx:307`, `z-[999]`) adalah overlay **kedua**
yang hanya muncul setelah menekan "Mulai Gambar". Dua cacat di dalamnya:

| Cacat | Sebelum | Sesudah |
|---|---|---|
| Tombol tutup | **86×32 px** | **86×44 px** |

`39f5757` membawa setiap tombol tutup modal ke lantai 44 px, tetapi **tidak bisa
melihat yang ini** — ia bukan tombol tutup modal, ia kontrol keluar-dari-menggambar,
dan ia duduk di header layar gambar dengan `px-3 py-1`.

Yang kedua lebih buruk dari ukuran: `<h3>` di layar itu mencetak `drawTitle`,
**literal Indonesia hardcoded** ("Tanda Tangan Kandidat", "Tulisan Nama Wali", …).
Ia **tidak akan pernah bisa diterjemahkan**: `i18n.keys.test.ts` hanya melihat
kunci, dan ini bukan kunci. Kandidat Jepang membaca bahasa Indonesia untuk judul
tugas yang sedang ia kerjakan.

Sekarang `drawTitleKey` + `t()`, dengan empat kunci baru di **kedua** kamus.
`ui.sign1`/`ui.name1` **tidak** dipakai ulang — itu label chip ("TANDA TANGAN 1"),
bukan judul tugas, dan menukarnya akan mengubah teks pengguna Indonesia juga.

### F18 · `'AI sibuk'` tidak pernah diterjemahkan 🟡 → ✅ `a01bf60`

`InterviewSimulatorModal.tsx:234,243` jatuh ke literal `'AI sibuk'` saat server
tidak mengirim pesan galat. Kini `ui.iv_ai_busy` di kedua kamus.

### F19 · Skeleton A4 untuk Rirekisho 🔴 → ✅ `5e19908`

`RirekishoBuilder.tsx:299` merender **satu kalimat di tengah panel putih 794×855**:
`text-center py-20` + "Memuat...". Modal terbuka sebagai **halaman KOSONG**, lalu
seluruh lembar muncul sekaligus — pola yang persis sama dengan spinner dashboard
yang baru diganti, dan alasan yang sama.

Kerangka mencerminkan blok nyata lembar itu: baris tombol cetak, kotak foto
(`w-32 h-48`, mencocokkan kotak 195 px yang disediakan lembar), kolom identitas,
delapan baris tabel, kotak catatan.

**⚠ Sengaja BUKAN token tema.** Lembar CV selalu putih di KEDUA tema karena ia
dokumen cetak; `bg-line-strong` akan melukis balok gelap di atas kertas putih
pada mode gelap. Palet tetap `slate-200` yang dipakai — alasan yang sama yang
sudah dicatat banner `<noscript>` di `src/pages/candidate.astro`.

**Terukur dengan permintaan ditahan:** 15 balok, warna
`oklch(0.929 0.013 255.508)` (= slate-200), `role=status`, teks `sr-only`
"Memuat...", **0 heading**, 0 kontrol <44 px, panel 794×612 vs 794×855 saat jadi.

### F20 · Gate yatim: keenam modal tidak dijaga apa pun di CI 🟠 → ✅ `b5ea1f4`

Ini temuan terpenting sesi ini, dan Tessa yang menemukannya.

`e2e/test-candidate-modals.mjs` adalah **satu-satunya** gate yang membuka keenam
overlay dashboard. Ia **yatim di tiga tempat sekaligus**:

| Tempat | Sebelum |
|---|---|
| Script npm | **tidak ada** |
| `test:e2e` (`package.json:23`) | **tidak disebut** |
| Job `e2e` (`.github/workflows/ci.yml:261-272`) | **tidak dijalankan** |

Setiap gate e2e lain terpasang. Yang ini **tercakup di atas kertas dan tak
terjaga dalam praktik** — persis kegagalan yang job `quality-gates` di berkas
yang sama dibuat untuk menutup (komentarnya mencatat enam gate yang pernah
"advisory only").

Sekarang terpasang di ketiganya. **Diverifikasi dengan menjalankannya LEWAT
script baru**, bukan dengan memanggil `.mjs` langsung: 8/8 check, 6/6 pemicu ada.
`verify:review-manifest` dan `verify:workflows` hijau sesudahnya.

---

## 3. Yang DICATAT tapi TIDAK dikerjakan

### F21 · Kedalaman permukaan 3 di Pemberkasan dan E-Sign 🟡

Pemberkasan: 22 elemen ber-border+radius, kedalaman **3**. E-Sign: 7 elemen,
kedalaman **3**. Dashboard sendiri pernah punya masalah ini (F1: lima permukaan
bersarang) dan diperbaiki menjadi dua. Di modal, kedalaman 3 masih dalam batas
wajar — modal memang butuh memisahkan diri dari halaman, lalu dari dirinya
sendiri. **Tidak diperbaiki karena tidak ada aturan yang dilanggar** dan
memperbaikinya adalah desain ulang, bukan pembersihan.

### F22 · `RirekishoBuilder` tidak punya heading sama sekali 🟡

Satu-satunya dari enam yang tidak punya heading. Panelnya tetap bernama
(`useOverlay({ label })` → `admin.rirekisho_title`), jadi `role="dialog"`-nya
sah dan gate aria-names hijau. Tapi secara visual tidak ada judul di panel
794×855. **Menambah `<h3>` mengubah outline halaman**, dan
`e2e/test-headings.mjs` menuntut tepat satu `h1` — jadi ini keputusan pemilik,
bukan pembersihan.

---

## 4. Pembacaan PALSU yang nyaris menjadi "perbaikan"

**"A4 meluber di ponsel" — TIDAK.** Probe melaporkan `div.bg-white 460>328` dan
`div.rirek-a4 436>280` pada 390 px, yang terbaca seperti konten terpotong.
Ternyata `.u-scroll-area` = `overflow-y: auto` **saja**, sehingga `overflow-x`
menghitung ke `auto` — lembar A4 memang **bisa di-scroll horizontal**, dan itu
memang pola yang benar untuk pratinjau dokumen cetak: A4 tidak bisa direflow.
Tidak ada yang diperbaiki. **Kalau saya mempercayai angkanya tanpa memeriksa
CSS-nya, saya akan "memperbaiki" perilaku yang sudah benar.**

---

## 5. Tiga klaim audit sumber yang TERBANTAHKAN

Verifikasi sebelum bertindak menyelamatkan tiga perubahan yang tidak perlu.
Ini bagian terpenting dari laporan ini:

| Klaim | Verdict | Bukti |
|---|---|---|
| `animate-bounce` di indikator "mengetik" melanggar P7 | ❌ **SALAH** | `animate-bounce` menganimasikan **`transform: translateY`** — dan P7 justru mengizinkan `transform`. `motion.css:1719-1723` juga sudah mematikannya saat `prefers-reduced-motion`. Tidak ada pelanggaran. |
| Pemberkasan punya tombol "lihat" 16–20 px | ❌ **SALAH** | Tidak ada tombol seperti itu. Pemberkasan memakai `DocumentPreviewModal` (`PemberkasanModal.tsx:640`). |
| Tombol tutup layar gambar E-Sign ~28 px | ✅ **BENAR** | Terukur **86×32** — di bawah lantai 44. Diperbaiki. |

Pelajaran yang berlaku umum: **audit sumber menghasilkan klaim; hanya pengukuran
yang menghasilkan fakta.** Ketiganya terdengar sama meyakinkannya.

---

## 6. Cakupan uji (Tessa) — apa yang benar-benar menjaga

| Modal | Unit | Kontrak dialog / animasi keluar |
|---|---|---|
| Ubah Password | 18 `it()` | ❌ tidak dijaga |
| CV Mini | 19 | ❌ tidak dijaga |
| Wawancara | 10 | ❌ tidak dijaga |
| Rirekisho | 10 | ❌ tidak dijaga |
| E-Sign | 5 | ❌ tidak dijaga |
| Pemberkasan | 4 | ❌ tidak dijaga |

`e2e/test-candidate-modals.mjs` = **satu-satunya** yang menguji peran `dialog`,
`aria-modal`, animasi keluar, dan nama aksesibel — untuk **keenamnya sekaligus**.
Itulah kenapa F20 (gate yatim) jauh lebih berat dari kelihatannya: sebelum
sesi ini, **nol** pengujian otomatis menjaga kontrak dialog keenam modal.

🪤 **`e2e:contrast` tidak mencakup `/candidate` maupun modal mana pun.** Tessa
memverifikasi daftar rutenya: `/`, `/loker`, `/public`, `/ai-cv`, `/apply`,
`/siswa-baru`. Jadi kontras di dalam keenam modal **tidak dijaga gate mana pun**.

**Kepala ruang `symbolCount`:** 23.427 dari langit-langit 23.900 — sisa **473**.
Semua perubahan sesi ini hanya menyunting berkas yang sudah ada, jadi **nol angka
beku indexer bergeser** (dikonfirmasi dengan menjalankan `discover.test.ts` +
`build.test.ts`).

---

## ✅ Action list

| # | Tindakan | Peran | Urgensi | Catatan |
|---|---|---|---|---|
| 1 | Putuskan F22: beri `RirekishoBuilder` heading, atau biarkan tanpa judul | pemilik | P2 | menambah `h3` mengubah outline halaman; `e2e:headings` menuntut tepat satu `h1` |
| 2 | Tambahkan gate kontras untuk modal (atau daftarkan `/candidate`) | Tessa | P2 | sekarang **nol** cakupan kontras di keenam modal |
| 3 | Beri modal kontrak dialog/animasi-keluar di tes unitnya masing-masing | Tessa | P3 | menutup celah yang sama tanpa bergantung pada satu gate e2e |
| 4 | Terapkan skeleton ke `/public` dan `/admin` yang masih spinner-saja | Archi | P2 | pola sudah ada (`CandidateSkeleton`, `rirekishoSkeleton`) |

---

## ⚠️ Batas yang diketahui

- Probe membuka setiap modal di **keadaan default**; cacat di sub-layar hanya
  ditemukan karena E-Sign diperiksa terpisah. **Modal lain mungkin masih punya
  sub-layar yang belum dibuka.** Yang diperiksa: E-Sign (layar gambar).
- Yang diukur adalah DOM dari **fixture**, bukan data produksi. Pemberkasan dengan
  dokumen terunggah, atau CV Mini dengan biodata lengkap, akan berbeda.
- Verifikasi kontras memakai **piksel tangkapan layar**, bukan `getComputedStyle()`
  — Chromium mengembalikan `oklch()` untuk palet Tailwind v4 dan perbandingan
  `rgb(...)` **tidak pernah cocok** (dua probe saya sempat melaporkan 0 karena ini).
- Skrip probe di **luar repo** (`F:/tmp/ui-probe/`) supaya inventaris beku indexer
  tidak bergeser.
- **Belum di-push** (R19), dan situs live masih beku di `742e956` karena kredit
  Netlify habis.

---

## 📚 Sumber & indeks keluaran anggota

- **Archi (arsitek):** audit sumber keenam modal. 3 temuan benar, 3 terbantahkan
  (§5). Kontribusi terbesarnya: menemukan `drawTitle` sebagai literal dan
  menunjukkan kedalaman permukaan 3.
- **Tessa (testing):** cakupan uji per modal, dan **temuan gate yatim** — temuan
  paling berdampak sesi ini.
- **Cody & Rex tidak dikerahkan.** Perubahannya kecil dan terverifikasi oleh
  probe; review kode independen akan diulang pada perubahan berikutnya yang lebih
  besar. Dicatat di sini supaya ketidakhadirannya adalah keputusan, bukan
  kelalaian.
- **Alat bukti (di luar repo):** `modals-probe.cjs` (enam modal, 2 lebar),
  `esign-draw-probe.cjs` (sub-layar E-Sign), `rirekisho-skeleton-probe.cjs`
  (keadaan memuat Rirekisho).
- **Tangkapan layar:** `_modal-<tag>-cmt-*.png`, `_modal-rirekisho-loading-1280.png`,
  `_modal-mobile-390-esign-draw.png`.

---

> Laporan ini dihasilkan oleh kolaborasi AI tim Engineering Assurance. Keputusan
> teknis yang penting tetap harus ditinjau oleh penanggung jawab engineering
> manusia.
