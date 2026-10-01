# Skeleton rollout — `/public` + tujuh tab `/admin`

**Tanggal:** 2026-10-01
**Workflow:** 2 (System Design) dengan review kode dilipat masuk
**Commit:** `2543971` — **belum di-push** (R19)
**Anggota:** Archi (arsitek) · Tessa (testing)

---

## 📌 TL;DR

- **TODO.md selesai.** *"Loading skeleton di semua halaman yang memuat data"* —
  `/candidate` + modal Rirekisho sudah lebih dulu; **delapan permukaan terakhir
  kini ikut**: `/public` dan tujuh tab `/admin`.
- **Satu primitif, bukan delapan salinan.** `src/components/ui/Skeleton.tsx`
  (`Bar` / `Status` / `TableRows`). Delapan salinan berarti delapan tempat yang
  harus diubah bersama, dan tujuh di antaranya tidak akan ikut berubah.
- **`rirekishoSkeleton` SENGAJA tidak memakainya** — lembar CV selalu putih di
  kedua tema (dokumen cetak), jadi ia butuh palet tetap. Dua kasus, dua jawaban.
- **Severity:** 🔴 0 · 🟠 0 · 🟡 1 (terbuka) · 🟢 2
- Semua gate hijau; **241/241** tes public+admin.

---

## 🎯 Core conclusion card

| Item | Isi |
|---|---|
| Rating | 🟢 **Lolos** |
| Pemblokir | **0** |
| Tindakan kunci | 3 |
| Berikutnya | `TabAgenda` masih spinner-saja (lihat §3) |

---

## 1. Desain

### Satu primitif — dan satu pengecualian yang disengaja

`src/components/ui/Skeleton.tsx` mengekspor tiga hal:

| Ekspor | Untuk | Catatan |
|---|---|---|
| `Bar` | satu balok | token tema `bg-line-strong` |
| `Status` | kontrak a11y | `role="status"` + satu label `sr-only`; `labelKey` bisa ditimpa |
| `TableRows` | baris tabel | mengembalikan `<tr>`, **bukan** pembungkus |

**`TableRows` mengembalikan `<tr>`, bukan `<div>`** — `<tbody>` hanya menerima
`<tr>`/`<td>`. `<div>` di sana membuat browser **memindahkan simpulnya keluar dari
tabel**, dan kerangkanya muncul di tempat yang salah **tanpa error apa pun**.
Konsekuensinya: label `role="status"` diletakkan **di luar** tabel, karena
`role="status"` pada `<tr>` akan menimpa peran `row` dan merusak semantik tabelnya.

**`rirekishoSkeleton` tetap terpisah** dan itu keputusan, bukan kelalaian: lembar
CV `bg-white` di **kedua** tema karena ia dokumen cetak, jadi ia butuh palet tetap
(`slate-200`). Memaksanya memakai token tema akan melukis balok gelap di atas
kertas putih pada mode gelap.

### Bentuk tiap permukaan — dicerminkan, bukan dikira-kira

| Permukaan | Bentuk nyata | Kerangka |
|---|---|---|
| `/public` `LokerTable` | tabel 5 kolom | 6 baris × 5 sel, lebar mengikuti kolom asli |
| `TabDbJob` | tabel 6 kolom `min-w-[900px]` | 6 baris × 6 sel |
| `TabKelola` | tabel 5 kolom `min-w-[800px]` | 6 baris × 5 sel |
| `TabPelamar` | tabel 6 kolom (tampilan DEFAULT) | 6 baris × 6 sel |
| `TabJadwal` | header + tabel | header bar + 5 baris |
| `TabConfig` | judul + deskripsi + 4 pengaturan | 4 baris label+input |
| `TabWA` | judul + kartu undangan + formulir | 3 baris label+input |
| `TabTambah` | seluruhnya formulir | 5 baris label+input |

**Empat tab tabel mencerminkan jumlah kolom DAN `min-w`** supaya `thead` di
atasnya tidak bergeser saat isinya tiba.

---

## 2. Dua jebakan yang ditemukan saat mengerjakan

### 🪤 `lint/a11y/noAriaHiddenOnFocusable` pada `<tr>` — positif palsu

`TableRows` memasang `aria-hidden` pada barisnya, dan biome menandainya. Itu
**positif palsu**: baris itu tidak bisa menerima fokus, dan satu-satunya isinya
adalah `Bar` yang juga `aria-hidden` dan bukan kontrol. Disupresi dengan alasan
tertulis (repo sudah punya presedennya).

**Kenapa itu aman, dan bukan sekadar "di-ignore":** `e2e:aria-names` memakai
aturan axe `aria-hidden-focus` dan membaca **accessibility tree SUNGGUHAN**. Kalau
suatu saat ada kontrol menyelinap ke dalam kerangka, **gate itulah yang
menangkapnya** — bukan komentar saya.

### 🪤 `lint-ratchet` merah karena impor tak terpakai — dan cara menemukannya

`TabPelamar.tsx` naik 23 → 24 diagnostik. `biome check` atas berkas tunggal
menunjukkan **tidak ada** diagnostik di baris yang saya tambah, dan `biome check .`
tidak bisa dipakai untuk enumerasi. Yang menyelesaikannya: **stash berkasnya,
jalankan biome dua kali, dan diff kategori diagnostiknya** — hasilnya
`noUnusedImports` +1. Saya mengimpor `Bar` di TabPelamar tanpa memakainya.

Cara itu berlaku umum untuk setiap "satu diagnostik baru" yang tidak mau
menunjukkan dirinya.

---

## 3. Terbuka

### F23 · `TabAgenda` masih spinner-saja 🟡

Tessa menemukannya: `src/components/admin/TabAgenda.tsx:131-134` punya pola
spinner yang sama tetapi **tidak masuk daftar tujuh** — daftar itu berasal dari
sensus sebelumnya, dan `TabAgenda` memakai bentuk yang sedikit berbeda sehingga
tidak tertangkap grep saya. **Belum dikerjakan.** Satu permukaan tersisa.

### F24 · `/admin` dan seluruh tabnya tidak dijaga gate kontras 🟢 catatan

Tessa memverifikasi: `e2e:contrast` `ROUTES` hanya berisi enam rute publik, dan
`/admin` **tidak ada di sana** — termasuk ketujuh tab. Jadi kontras di seluruh
panel admin **tidak dijaga gate mana pun**, sebelum maupun sesudah perubahan ini.

---

## 4. Cakupan uji (Tessa) — kenapa penggantian ini aman

| Pertanyaan | Jawaban terukur |
|---|---|
| Ada tes yang memaku spinner/teks loading di kedelapan permukaan? | **Tidak satu pun** |
| `e2e:headings` terganggu heading dari kerangka? | Tidak — kerangka tidak merender heading apa pun |
| `e2e:aria-names` terganggu kontrol dari kerangka? | Tidak — kerangka tidak merender kontrol apa pun |
| `e2e:aria-names` menyusuri tab admin? | Ya, **5 dari 7** (jadwal & tambah tidak disusuri) |
| `e2e:contrast` mencakup `/admin`? | **Tidak** — tidak satu tab pun |

**Angka beku:** `files.length` 528 → **529**, `tsx` 111 → **112**,
`fileCount` 528 → **529**. Digeser dan diverifikasi dengan
`count-indexed.test.ts`. `symbolCount` sisa ~438.

---

## ✅ Action list

| # | Tindakan | Peran | Urgensi |
|---|---|---|---|
| 1 | Beri skeleton juga `TabAgenda.tsx:131-134` — satu-satunya yang tersisa | Archi | P2 |
| 2 | Daftarkan `/admin` (dan tabnya) ke `e2e:contrast` | Tessa | P2 |
| 3 | Pertimbangkan menyatukan `CandidateSkeleton` + `rirekishoSkeleton` ke primitif bersama | Archi | P3 |

---

## ⚠️ Batas yang diketahui

- Bentuk kerangka untuk `TabJadwal`/`TabConfig`/`TabWA`/`TabTambah` adalah
  **perkiraan yang beralasan** dari struktur nyatanya (header + baris), bukan
  pengukuran tinggi per blok seperti pada `/candidate`. Keempat tab itu isinya
  variabel, jadi pencocokan persis tidak mungkin.
- Yang diukur adalah DOM dari **fixture**, bukan data produksi.
- Skrip probe di luar repo (`F:/tmp/ui-probe/`).
- **Belum di-push** (R19); situs live masih beku di `742e956`.

---

## 📚 Sumber

- **Archi (arsitek):** keputusan satu-primitif-vs-delapan, validitas markup
  `<tbody>`, dan daftar permukaan.
- **Tessa (testing):** cakupan nol pada keadaan loading, dan temuan `TabAgenda`
  + celah kontras `/admin`.
- **Dokumen pendahulu:** `system-design-candidate-skeleton-2026-10-01.md`,
  `system-design-candidate-modals-2026-10-01.md`.

---

> Laporan ini dihasilkan oleh kolaborasi AI tim Engineering Assurance. Keputusan
> teknis yang penting tetap harus ditinjau oleh penanggung jawab engineering
> manusia.
