# Review halaman publik — `F:\astro` (2026-10-07)

**Cakupan:** 4 rute publik tanpa sesi — `/` · `/public` · `/loker` · `/404`.
Dimensi: kode, UI, UX, responsif, aksesibilitas, degradasi tanpa JS, performa terasa.
Semua angka **diukur**, bukan dibaca dari CSS.

---

## 1. Cara mengukur (supaya angkanya bisa dipercaya)

| Instrumen | Yang diukur |
|---|---|
| 8 gate e2e milik repo | `e2e:public`, `e2e:loker-layout`, `e2e:headings`, `e2e:landing`, `e2e:theme-gradients`, `e2e:labels`, `e2e:drawer`, `e2e:aria-names` |
| `e2e:contrast` | kontras teks (gate kontras milik repo) |
| `.tmp-audit/public-review/probe.mjs` (baru) | 4 halaman × 2 lebar × 2 tema: status, error konsol, id ganda, landmark, gambar rusak, overflow, teks <11px, target <44px, kontras, konten ter-render |
| pass `no-JS` & `reduced-motion` | konten tanpa JavaScript; elemen yang tersangkut `opacity: 0` |
| `.tmp-audit/public-review/ttfr.mjs` | waktu sampai baris lowongan pertama muncul |
| `.tmp-audit/public-review/cmp-table.mjs` | perbandingan tata letak tabel `/public` vs `/loker` |

Server: `astro dev` di `127.0.0.1:4399` (satu invokasi: nyala → probe → mati).
`/404` diverifikasi mengembalikan **HTTP 404 sungguhan**, bukan fallback 200.

**Tiga batas kejujuran yang harus dibaca sebelum angka apa pun:**

1. **2.199 elemen tidak terukur oleh gate kontras** (1.192 karena `opacity < 1`, 1.007 karena
   teks di atas `background-image`). Angka "0 di bawah lantai" berlaku untuk elemen yang
   **terukur**, bukan untuk seluruh halaman.
2. **Di `/`, 159 elemen teks duduk di atas gradien** dan probe saya menandainya
   `[on gradient]` — **tidak dinilai**, sesuai aturan: resolver "opaque ancestor" tidak bisa
   melihat gradien, jadi menilai akan mengarang angka.
3. Backend `astro dev` di-proxy ke **REMOTE produksi** ⇒ data lowongan adalah data produksi
   nyata, tetapi tidak ada isolasi.

---

## 2. Hasil gate repo — 8/8 PASS

| Gate | Hasil |
|---|---|
| `e2e:public` | 9/9 ✅ |
| `e2e:loker-layout` | 8/8 ✅ (390 kartu · 768 pin kolom · aksi ≥44px · tanpa overflow) |
| `e2e:headings` | ✅ termasuk **no-JS h1 di `/`, `/public`, `/loker`** |
| `e2e:landing` | ✅ 17 seksi × 2 lebar (urutan, visibilitas, nama, anchor, entrance) |
| `e2e:theme-gradients` | 3/3 ✅ (+ kontrol positif: detektornya memang bisa gagal) |
| `e2e:labels` | 4/4 ✅ · 0 id ganda · 0 label menggantung |
| `e2e:drawer` | 7/7 ✅ (drawer tertutup 0 Tab stop, Escape, focus kembali) |
| `e2e:aria-names` | 40 pemeriksaan, **0 gagal** ✅ |
| `e2e:contrast` | **0 elemen di bawah lantai** (2.199 tak terukur — lihat §1) |

---

## 3. Matriks terukur (probe, 2 lebar × 2 tema)

| Halaman | chars | seksi | baris | kontras gagal | id ganda | teks <11px | target <44px | gambar rusak | overflow halaman | tersangkut |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 10.092 | 17 | – | **0**/129 | 0 | 0 | 0 | 0 | 0 px | 0 |
| `/public` | 1.361 | – | 10 | **0**/101 | 0 | 0 | 0 | 0 | 0 px | 0 |
| `/loker` | 1.289 | – | 10 | **0**/99 | 0 | 0 | 0 | 0 | 0 px | 0 |
| `/404` | 170 | – | – | **0**/1 | 0 | 0 | 0 | 0 | 0 px | 0 |

`chars` = panjang teks di `<main>`; `tersangkut` = elemen besar yang masih `opacity: 0`
setelah settle (animasi reveal gagal) — **0 di semua halaman**.

### Degradasi tanpa JavaScript

| Halaman | status | h1 | `<header>` | chars | blok tersembunyi |
|---|---|---|---|---|---|
| `/` | 200 | 1 | ada | **9.776** | 0 |
| `/public` | 200 | 1 | ada | **39** ⚠️ | 0 |
| `/loker` | 200 | 1 | ada | **104** ⚠️ | 0 |
| `/404` | 404 | 1 | tidak ada | **170** | 0 |

### Performa terasa (waktu sampai baris lowongan pertama)

`/loker` **245–266 ms** · `/public` **264–274 ms** (4 pengukuran, dua-duanya hangat).
Tidak ada teks "memuat" yang menahan pengunjung lebih dari seperempat detik.

### Tata letak tabel: `/public` vs `/loker` — **identik**

Dikhawatirkan `/public` tertinggal di tata letak desktop, ternyata **tidak**:

| | 390px | 1280px |
|---|---|---|
| `table` min-width | **0px** | 700px |
| `table` display | **block** | table |
| `row` display | **flex** (kartu) | table-row |
| `thead` | none | table-header-group |
| `::before` label sel | **"Nama Pekerjaan"** | none |

Keduanya di `/public` **dan** `/loker`, sama persis.

---

## 4. Temuan (berurut menurut kepentingan)

### F1 · `/public` hampir kosong tanpa JavaScript — **sedang**
Terukur: **39 karakter**. Yang tersisa hanya tombol "Kembali ke Portal" + 2 tombol tab.
Sebabnya dua hal bertumpuk:
- `<LokerTable client:only="preact" />` ⇒ **nol HTML server**;
- panel `#section-layanan` memakai atribut `hidden`, dan pembukanya (`bindPublicSections()`)
  adalah `<script>` ⇒ tanpa JS panel itu **tidak bisa dibuka sama sekali**.

Jadi seluruh isi "Program & Layanan" **tidak dapat dijangkau** oleh pengunjung tanpa JS.
Gate `e2e:headings` memang lulus — tapi gate itu sengaja hanya menuntut **h1** bertahan,
bukan isinya. `/ai-cv` sudah punya `<noscript>`; `/public` dan `/loker` tidak.

### F2 · `/loker` tanpa JS = judul saja — **sedang**
Terukur: **104 karakter** (`h1` + judul seksi). Tabel lowongan `client:only` ⇒ tidak ada.
`/loker` adalah **tujuan publik utama** (kata gate-nya sendiri), jadi ini yang paling mahal.
Tidak ada `<noscript>` yang menjelaskan kenapa halamannya kosong.

### F3 · `/404` tidak punya header/navigasi — **rendah (disengaja)**
Hanya 2 jalan keluar ("Ke Beranda", "Lihat Lowongan"). Komentar di berkas menjelaskan ini
pilihan sadar (pengunjung datang dari tautan WhatsApp yang rusak). Diterima, tapi pengunjung
yang salah ketik URL `/loker` tidak punya jalan ke seksi lain.

### F4 · Logo `/404` punya `alt` deskriptif padahal dekoratif — **rendah**
`alt="Logo PT Amanah Sakura Japan"` + `<h1>` tepat di bawahnya ⇒ pembaca layar mendengar
nama perusahaan, lalu keadaannya. `Icon` sudah `aria-hidden` dengan alasan yang sama;
logo-nya belum. `alt=""` akan lebih konsisten.

### F5 · `/` menaruh 159 elemen teks di atas gradien — **risiko tak terukur, bukan cacat**
Tidak ada satu pun yang bisa saya nilai dengan jujur. Gate kontras repo juga melewatkannya
(1.007 elemen). Ini **lubang pengukuran yang diketahui**, bukan keluhan tentang halamannya —
tapi artinya "kontras `/` aman" **belum terbukti**, hanya "yang terukur aman".

### F6 · Teks "memuat" masih sempat terlihat — **catatan, bukan cacat**
`loadingTextVisibleAtStart=true` di keempat pengukuran, padahal baris pertama muncul
~250 ms. Itu benar secara desain (skeleton/loading state), bukan kedipan yang mengganggu.

---

## 5. Yang diperiksa lalu **DIBATALKAN** (penting — jangan "diperbaiki")

| Gejala awal | Verdict | Bukti |
|---|---|---|
| `/public` 390 dark hanya 6 baris / 191 chars (2 run) | **artefak**, bukan cacat | `repeat-public.mjs` 3/3 = 10 baris / 1.298 chars, sama dengan kontrol light |
| `/public` 390 menampilkan tabel 700px (bukan kartu) | **artefak** | `cmp-table.mjs`: min-width **0px**, display **block**, row **flex**, `::before` label ada — sama seperti `/loker` |
| `/404` melaporkan 1 error konsol di semua lebar/tema | **bukan cacat** | URL yang gagal = **dokumennya sendiri** (`404 /halaman-tidak-ada-xyz`); halaman 404 memang 404 |
| `div.sakura-petal`, `div.hero-haze`, `div.marquee-content` melebar > viewport | **disengaja** | overflow halaman **0 px** ⇒ dipotong oleh `overflow-x: clip` / kontainer scroll. Dekorasi. |

Pelajaran yang berlaku untuk sesi berikutnya: **satu pengukuran pendek bukan temuan** —
`/public` 390 dark terlihat "rusak" dua kali berturut-turut, dan tetap artefak.

---

## 6. Nilai

Bobot: Aksesibilitas 25 % · Responsif 20 % · UX 20 % · Degradasi tanpa JS 15 % ·
Performa 10 % · Kualitas kode 10 %.

| Halaman | A11y | Responsif | UX | tanpa JS | Performa | Kode | **Total** |
|---|---|---|---|---|---|---|---|
| `/` | 9,5 | 9,5 | 9,0 | 9,5 | 9,0 | 9,5 | **9,4** |
| `/404` | 9,0 | 9,5 | 8,0 | 10,0 | 10,0 | 9,5 | **9,2** |
| `/loker` | 9,5 | 9,5 | 9,0 | 3,5 | 9,5 | 9,5 | **8,5** |
| `/public` | 9,5 | 9,5 | 7,5 | 3,0 | 9,0 | 9,0 | **8,0** |

**Rata-rata 8,8 / 10.**

Yang menahan nilai bukan aksesibilitas, kontras, responsif, atau performa — keempatnya
**nyaris sempurna dan terukur**. Yang menahan hanya **satu hal: isi yang bergantung pada
JavaScript di `/public` dan `/loker`.** Menambahkan `<noscript>` yang menjelaskan + tautan
alternatif akan menaikkan keduanya ~1 poin tanpa mengubah satu baris logika.

---

## 7. Rekomendasi (berurut menurut nilai per usaha)

1. **`<noscript>` di `/public` dan `/loker`** — pola sudah ada di `/ai-cv`; ikuti. Rendah
   risiko, langsung menutup F1/F2. Bisa **dibuktikan bisa gagal** lewat gate no-JS yang sudah
   ada (`e2e:headings` sudah mengukur dengan JS mati — tambahkan asersinya di sana, jangan
   bikin berkas gate baru: satu berkas baru menggeser 4–7 counter beku).
2. **`alt=""` pada logo `/404`** (F4) — satu atribut.
3. **Perluas `e2e:loker-layout` ke `/public`** — komponennya sama dan hari ini berperilaku
   sama, tapi gate-nya hanya menjaga `/loker` (`TABLE_PATH = '/loker'`). Kalau `/public`
   suatu saat menyimpang, tidak ada yang menangkapnya.
4. **Ukur kontras elemen bergradien dengan aritmetika stop** (F5) — bukan untuk memperbaiki,
   untuk menutup lubang pengukuran yang sudah diketahui.
5. **Jangan sentuh** `/`, struktur `/404`, atau tabel loker. Semuanya lulus dengan angka.

---

## 8. Artefak sesi ini

Semua di `.tmp-audit/public-review/` (**gitignored**, sengaja: berkas `.mjs` untracked
menggeser inventaris ratchet):

- `probe.mjs` — pengukuran 4 halaman × 2 lebar × 2 tema + pass no-JS & reduced-motion
- `repeat-public.mjs` · `cmp-table.mjs` · `ttfr.mjs` — pembatal artefak
- `results.json` — data mentah
- `*.png` — tangkapan 4 halaman × 2 lebar × 2 tema

**Tidak ada berkas produksi yang diubah oleh review ini.**
