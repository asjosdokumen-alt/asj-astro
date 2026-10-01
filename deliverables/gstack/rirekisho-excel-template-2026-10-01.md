# Template CV Excel — form rirekisho asli (2026-10-01)

**Ringkasan.** Pilihan "Excel" di `CvTemplateSelector` dulu menghasilkan dump dua kolom
`Field | Value` — bukan form yang dipakai cabang. Berkas
`1.ANGGUN ARIANI__CV MAGANG COOP.xlsx` yang dikirim pemilik **adalah** form itu. Sekarang
form tersebut menjadi template `rirekisho-xlsx`: berkas asli di-unzip, `sheet1.xml`-nya
ditulis nilai, lalu di-zip ulang — sehingga **seluruh geometri lolos tanpa disentuh**.

Keadaan yang diwarisi: renderernya sudah ditulis sesi sebelumnya, tetapi **tidak pernah
didaftarkan** — `templates.ts` hanya mendaftarkan 4 template, jadi `cvFactory.list()` tidak
pernah memuatnya dan `CvTemplateSelector` tidak pernah menampilkannya. Tidak ada satu pun
test. Sesi itu berhenti (dibatalkan) tepat sebelum verifikasi.

---

## 1. Yang diminta

> *"bikin ukuran sama seperti file aslinya jaddi foto dan lain lain tidak memanjang dan
> biarin tiap cell walau kosong jgn perpendek"*

Tiga syarat, **ketiganya geometri**:

1. ukuran **sama** seperti berkas asli;
2. foto (dan lain-lain) **tidak memanjang** — tidak diregangkan;
3. **tiap sel tetap ada walau kosong** — jangan diperpendek.

Ketiganya jadi angka di §4 dan invarian di §7.

---

## 2. Berkas sumber

`E:\1.ANGGUN ARIANI__CV MAGANG COOP.xlsx` — **2.403.557 B**.

| Bagian | Ukuran | Isi |
|---|---|---|
| `xl/worksheets/sheet1.xml` | 546.289 B | form-nya |
| `xl/worksheets/sheet2.xml` | 546.288 B | salinan + 1,95 MB gambar contoh |
| `xl/media/image1.png` | 101.951 B | pas foto |
| `xl/media/image2.png` | 253.909 B | **scan KTP** (NIK, alamat, tanda tangan) |
| `xl/media/image3.png` | 1.791.549 B | gambar contoh sheet2 |
| `xl/media/image4.jpg` | 162.027 B | gambar contoh sheet2 |

Geometri `sheet1` (terukur):

- **9 `<col>`** yang mencakup **26 kolom** (3+1+1+1+1+1+1+11+6);
- **1.000 baris**;
- **83 merge**;
- **25.934 sel**.

Drawing `sheet1` memuat **dua** gambar:

| Gambar | Ukuran (EMU) | Posisi | Rel |
|---|---|---|---|
| pas foto | 2.743.200 × 3.533.775 (3,00in × 3,86in) | kolom 0 / baris 3 | `image1.png` |
| scan KTP | 5.000.625 × 3.324.225 | baris 49 | `image2.png` |

Dua format angka buatan yang penting:

- numFmt **164** = `yyyy"年"m"月"d"日"` → dipakai `D10` (生年月日);
- numFmt **165** = `yyyy"年"m"月"` → dipakai kolom periode `A`/`C` (学歴・職歴).

---

## 3. Template yang disematkan

**2,4 MB → 60.720 B (59 KB).** Yang 2,3 MB itu gambar milik kandidat. Yang dibuang: pas foto,
scan KTP, dan `sheet2` seluruhnya. Yang disimpan: form-nya — lebar kolom, tinggi baris,
seluruh 83 merge, indeks gaya tiap sel, dan anchor pas foto pada ukuran persisnya. Setiap sel
nilai dikosongkan (label dan satuan tetap).

**Kenapa menyematkan biner, bukan menyusun ulang sheet:** SheetJS tidak bisa **menulis** gaya
sel (itu SheetJS Pro). Menyusun ulang dari deskripsi layout akan menghilangkan seluruh border,
fill, font, dan format angka — dan lapisan drawing ikut hilang, jadi pas foto lenyap. Menambal
XML berkas asli mempertahankan 100% -nya.

---

## 4. "Ukuran sama" — diukur, bukan diklaim

Dibangun lewat renderer sungguhan (bundle esbuild → Node), hasil **61.873 B**, lalu dibandingkan
bagian-per-bagian dengan berkas asli:

| Properti | Asli | Hasil | |
|---|---|---|---|
| elemen `<col>` | 9 | 9 | ✅ |
| **definisi kolom** (min,max,width,customWidth,style) | 9 | 9 | ✅ **identik semua** |
| elemen `<row>` | 1.000 | 1.000 | ✅ |
| **tinggi baris** (yang menyetel eksplisit) | 1.000 | 1.000 | ✅ **identik semua** |
| `mergeCell` | 83 | 83 | ✅ |
| **rentang merge** | 83 | 83 | ✅ **identik semua** |
| elemen `<c>` | 25.934 | 25.934 | ✅ |
| anchor pas foto | 2.743.200 × 3.533.775 @ kolom 0/baris 3 | **sama** | ✅ |
| anchor scan KTP | 5.000.625 × 3.324.225 @ baris 49 | **tidak ikut** (memang) | ✅ |

Jadi syarat (1) dan (3) terbukti: **tidak ada satu pun sel yang hilang** (25.934 → 25.934) dan
tidak ada satu pun tinggi baris / lebar kolom / merge yang bergeser.

Dibuka ulang dengan SheetJS: 1 sheet `CV KANDIDAT`, `!ref` = `A1:Z1000`, 83 merge, dan nilainya
terbaca di alamat yang benar (`D6` = `ANGGUN ARIANI`, `H4` = `PEREMPUAN (女)`,
`C25` = `現在に至る`, `A45` = `無し`, …).

**Syarat (2), foto tidak memanjang.** `fitPhoto()` menghitung `scale = min(boxCx/w, boxCy/h)`
lalu memusatkan hasilnya — jadi rasio selalu utuh dan kelebihannya jadi *letterbox*, bukan
regangan. Foto sumber 288×371 px pada 96 DPI **tepat** seukuran box, sehingga foto berbentuk
sama mereproduksi penempatan aslinya persis (`colOff`/`rowOff` = 0). Diuji untuk foto lebar
(1000×100) dan tinggi (100×1000).

---

## 5. Satu koreksi di lapisan nilai

`D10` (生年月日) bergaya `yyyy"年"m"月"d"日"`, tetapi nilai ditulis sebagai **teks** — jadi
format angka milik selnya tidak pernah dipakai. `s(id.tgl_lahir)` menulis `2007-06-11`, dan
Excel menampilkannya apa adanya, bukan `2007年6月11日`.

Kolom **periode tidak terkena masalah ini**: `fmtMonthYearJp()` sudah menghasilkan `2014年7月`,
yaitu bentuk yang persis sama dengan yang ditampilkan berkas asli (yang menyimpan serial
`41827` = 2014-07-07 di sel bergaya 年月). Jadi hanya satu sel yang salah.

Diperbaiki dengan `birthDate()`: `YYYY-MM-DD` / `YYYY/MM/DD` → `2007年6月11日`; jatuh ke
`new Date()` bila polanya lain; mengembalikan nilai aslinya bila tak terbaca. Serial aslinya
diverifikasi terhadap kalender: **39244 → 2007-06-11**, **41827 → 2014-07-07**,
**43983 → 2020-06-01**.

---

## 6. Satu koreksi pada alat ukur sendiri

Probe pertama melaporkan `D6` dan `D7` — nama lengkap dan katakana — sebagai `<absent>` di
berkas **asli**. Kesimpulannya akan jadi *"CV aslinya tidak memuat nama"*. **Itu salah.**

Sebabnya satu kuantor: pola `<c r="([A-Z]+\d+)"([^>]*)(?:/>|>(.*?)</c>)` memakai `[^>]*`
**greedy**. Untuk `<c r="A6" s="16"/>`, `[^>]*` menelan ` s="16"/` lebih dulu, lalu cabang `>`
cocok — sehingga sebuah sel self-closing **menelan sel-sel berikutnya sampai `</c>` pertama**.
Terukur: **24.867 vs 25.934 sel** — **1.067 sel hilang diam-diam**, termasuk `D6`.

Perbaikannya: cocokkan `<c\s+([^>]*?)` lalu baca `r=` dari atributnya.

**Catatan penting untuk renderer:** `setCell()` memakai kuantor **lazy** (`([^>]*?)`) sehingga
**tidak** punya cacat ini. Tetapi ia mengikat `r` sebagai atribut **pertama**
(`<c r="${addr}"`). Template saat ini menulis `r` lebih dulu di **25.934 dari 25.934** sel —
dan test-nya sekarang menuntut `setCell` benar-benar **mengubah** sheet untuk tiap alamat,
bukan sekadar membuktikan alamatnya ada. Perbedaan itu penting: uji "alamatnya ada" akan hijau
walaupun urutan atributnya berubah dan penulisan nilai berhenti bekerja tanpa suara.

---

## 7. Uji & gate

`src/lib/cv-template-factory/renderers/rirekisho-xlsx.test.ts` — **22 uji**:

- **geometri** (angka §4 dibekukan): 9 `<col>`, 1.000 baris, 83 merge, 25.934 sel, anchor
  2.743.200 × 3.533.775 @ kolom 0/baris 3;
- tidak ada alamat sel **duplikat** (yang akan membuat `setCell` ambigu);
- **tiap alamat yang ditulis `buildValues` benar-benar diubah `setCell`**;
- `setCell`: mempertahankan indeks gaya, menulis nilai kosong sebagai sel bergaya-saja
  (**tidak** menghapusnya — ini syarat (3)), meng-escape `& < > "`, membuang `t="s"` basi,
  tidak menyentuh alamat yang tak ada;
- `fitPhoto`: bentuk sumber → penempatan persis; foto lebar & tinggi → *letterbox*, rasio utuh;
- `patchAnchor`: menulis ulang `xdr:ext` dan kedua offset;
- `buildValues`: blok identitas di alamat yang dipakai berkas sumber, 生年月日 dengan hari,
  kolom periode 年月, `現在に至る`, `無し`, dan tidak ada baris di luar 1.000;
- **end-to-end**: `buildRirekishoWorkbook()` → geometri tidak berubah setelah pengisian penuh,
  nilainya benar-benar masuk, anchor pas foto masih ada.

| Gate | Hasil |
|---|---|
| `vitest --project=frontend` | **88 berkas / 1.072 uji lulus** |
| `tsc --noEmit` | bersih |
| `verify:classes` | lulus (1.224 token kelas / 238 berkas) |
| `lint-ratchet` | **PASSED** (utang −22) |

`lint-ratchet` sempat **merah**: 14 diagnostik baru di dua berkas baru — `useTemplate` ×5,
`noNonNullAssertion` ×8, `noGlobalIsNan` ×1. Semuanya **diperbaiki di sumber**, bukan dengan
menaikkan baseline.

---

## 8. Batas yang jujur

- Yang diukur adalah **XML** yang dihasilkan, bukan Excel sungguhan — tidak ada Excel di
  lingkungan ini. Validitasnya diperiksa dengan membuka ulang berkas memakai SheetJS.
- **Jalur foto tidak diuji otomatis.** Ia butuh `fetch` + `createImageBitmap` + `<canvas>`
  (peramban). Yang diuji otomatis adalah matematikanya (`fitPhoto`, `patchAnchor`).
- `xl/media/image1.png` di template adalah stub **67 B**. Bila kandidat tidak punya foto,
  anchor-nya tetap ada dan menunjuk stub itu.
- `sheet2` berkas asli **tidak** dibawa — memang berisi gambar contoh milik kandidat.
- **Belum di-commit.** Menyentuh `package.json` (menambah `jszip`), `templates.ts`,
  `templates.test.ts`, dan dua berkas baru.
