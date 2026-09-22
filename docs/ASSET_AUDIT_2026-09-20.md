# LAPORAN AUDIT ASET — ASJ Portal

**Tanggal:** 2026-09-20 · **Dipicu oleh:** instruksi owner "pakai aset ASLI, anime ditunda"
**Metode:** setiap berkas dirender besar lalu dibandingkan dengan maksud yang dideklarasikan
di `gallery.ts` / `index.astro` / `COMPANY_PROFILE_DATA.md` §11. Sumber kebenaran: PDF
company profile (`F:\desain\COMPANY PROFILE ... .pdf`, 15 halaman, 39 gambar tertanam).

> **Kenapa auditor ini perlu ada.** Gate `gallery.test.ts` + `verify:assets` memeriksa
> bahwa berkas **ADA** di disk dan ukurannya **cocok dengan yang dideklarasikan**. Tidak
> satu pun memeriksa bahwa isinya **BENAR**. Tiga berkas lolos semua gate sambil berisi
> foto stok wisata Jepang. **"Ada di disk" bukan "benar".**

---

## 1. Temuan: tiga berkas berisi foto stok, bukan foto perusahaan

| Berkas | Deklarasi | Isi SEBENARNYA (terukur) | Sumber salah |
|---|---|---|---|
| `tim-hadi-prasojo.webp` | Hadi Prasojo, N1 | jalan setapak maple merah, satu pejalan kaki | PDF p2 `xref 86` |
| `tim-koirul-mustakim.webp` | Khoirul Mustakim, CEO | Tokyo Skytree + sakura | PDF p2 `xref 80` |
| `galeri-keberangkatan-1.webp` | Pelepasan keberangkatan | maple merah + pagoda | PDF p1 `xref 15` |

**Akar masalah.** `F:\desain\_cp_assets.py` memetakan tiga slot ke **seni bleed desain**
di dalam PDF, bukan ke foto. Tidak ada yang pernah melihat hasilnya.

**Kenapa potret aslinya tidak terpakai.** `_cp_images.py` menyaring `w*h < 40000`:

| gambar | ukuran | piksel | nasib |
|---|---|---|---|
| `xref 93` (Khoirul Mustakim) | 181×227 | 41.087 | lolos **nyaris** (2,7 % di atas ambang) |
| `xref 788` (Hadi Prasojo) | 150×172 | 25.800 | **di bawah ambang ⇒ tidak pernah ditulis** |

---

## 2. Yang sudah diperbaiki

| Berkas | Diganti dengan | sumber | ukuran baru |
|---|---|---|---|
| `tim-koirul-mustakim.webp` | potret asli Khoirul Mustakim (CEO) | p2 `xref 93` | 181×227 |
| `tim-hadi-prasojo.webp` | potret asli Hadi Prasojo (Edu Training Mgr) | p2 `xref 788` | 150×172 |
| `galeri-keberangkatan-1.webp` | peserta di bandara memegang spanduk ASJ | p1 `xref 26` | 309×233 |

Identifikasi orang **bukan tebakan** — dicocokkan dengan lapisan teks PDF:
"Khoirul Mustakim / CEO" di (100,112) tepat di potret `xref 93`; "hadi prasojo /
Education Training Manager" di (154,188) tepat di `xref 788`.

Dimensi di `gallery.ts` diperbarui ke ukuran terukur (dulu 828×1021 / 828×1018 —
angka itu benar untuk berkas yang SALAH, itulah sebabnya gate tidak menangkapnya).

---

## 3. Temuan lanjutan: deklarasi vs isi pada berkas yang TIDAK diganti

Diperiksa, ditemukan, **belum diputuskan** — bukan bug yang bisa saya perbaiki sendiri
karena ini menyangkut apa yang hendak diklaim halaman:

| Berkas | Deklarasi sekarang | Isi terukur | Catatan |
|---|---|---|---|
| `fasilitas-gedung.webp` | "Gedung kantor ... Ponorogo" (figcaption `#tentang`) | **foto grup ~20 orang** berbaju batik di depan kantor | Dimensi cocok (1600×1066); yang salah adalah **klaimnya**. Gedungnya terlihat, tapi sebagai latar — bukan foto gedung |
| `fasilitas-grup-staf.webp` | "Tim pengajar dan pengurus" | staf berbaju seragam hitam+pink di depan logo | **Cocok** |

**Pilihan untuk `fasilitas-gedung.webp`** (perlu keputusan owner):
1. Ganti captionnya menjadi apa adanya (foto grup peserta), lalu pindahkan ke galeri — dan
   slot `#tentang` diisi foto gedung yang benar-benar gedung.
2. Biarkan, tapi jujurkan captionnya.
3. Cari/ambil foto gedung baru.

---

## 4. Aset ASLI yang ada tapi BELUM DIPAKAI sama sekali

Semua terverifikasi ada di PDF. Ini yang membuat "pakai aset asli" bisa dikerjakan
tanpa membuat gambar apa pun:

| Gambar PDF | ukuran | isi | kandidat slot |
|---|---|---|---|
| `p01_x680` | 438×297 | 3 orang di bandara memegang spanduk ASJ | galeri (keberangkatan) |
| `p01_x819` | 415×236 | 7 orang di bandara + spanduk | galeri (keberangkatan) |
| `p01_x820` | 462×360 | kelompok di ruang tunggu + spanduk | galeri (keberangkatan) |
| `p11_x760` | 1094×1600 | staf close-up seragam berdasi (potret vertikal) | `#tim`, `#fasilitas` |
| `p11_x687` | 551×322 | staf berbaju pink berfoto | `#fasilitas` |
| `p02_x93` | 181×227 | potret Khoirul Mustakim | **dipakai** |
| `p02_x788` | 150×172 | potret Hadi Prasojo | **dipakai** |
| `p01_x26` | 309×233 | keberangkatan (spanduk ASJ) | **dipakai** |

### 4.1 Empat diekstrak ke disk, tapi SENGAJA tidak dipublikasikan

Sudah ditulis ke `public/assets/` (siap dipakai begitu owner memutuskan):
`galeri-keberangkatan-2.webp` (438×297), `galeri-keberangkatan-3.webp` (415×236),
`galeri-keberangkatan-4.webp` (462×360), `fasilitas-staf-2.webp` (1094×1600).

**Kenapa tidak langsung dipasang.** Keempatnya memuat wajah yang bisa dikenali, jadi
mereka masuk `CONSENT_OPEN` — dan gate `verify:assets` menolak mempublikasikan foto
yang `.gitignore` sendiri menolak membawa:

```
✗ BLOCKED PHOTOGRAPH IS PUBLISHED — galeri-keberangkatan-2.webp
  .gitignore refuses to commit it (§11.2) and the page renders it anyway
```

Itu gate yang **bekerja benar**, bukan penghalang birokrasi: menerbitkan foto yang
repo-nya sendiri tidak mau membawa = pengunjung melihat sesuatu yang tidak bisa
ditarik kembali lewat git. **Ini keputusan owner, bukan keputusan kode.** Pilihannya:

1. **Masukkan ke `OWNER_APPROVED`** (dan `git add`) — jika pemilik mengonfirmasi
   peserta sudah memberi izin. Gate lalu hijau dan galeri bertambah 3 foto asli.
2. **Biarkan tidak dipublikasikan** — berkasnya tetap di disk, halaman tetap jujur.

---

## 5. Aset no-wajah yang sudah benar (dipakai apa adanya)

`fasilitas-ruang-kantor-1` (kantor, ada layar CCTV — masih interior ruangan),
`fasilitas-kelas-bahasa-2` (kelas), `fasilitas-ruang-tamu-1/3` (ruang tamu),
`fasilitas-grup-staf` (staf), `fasilitas-grup-siswa-1` (angkatan),
`logo-asj-mark`, `logo-asj-laurel`.

---

## 6. Yang TIDAK boleh dipakai (tetap diblokir — jangan diubah)

`legal-ahu-*`, `legal-akta-*`, `legal-jlpt-*` (tanda tangan + NIP pihak ketiga),
`fasilitas-kelas-bahasa-1` + `fasilitas-ruang-kantor-2` (frame CCTV, timestamp terbakar),
`poster-rekrutmen` (harga menyatu di piksel), `galeri-mensetsu-*` (poster berbingkai),
`fasilitas-grup-siswa-2`, `fasilitas-ruang-tamu-2`, `fasilitas-gedung-banner`.

---

## 7. Perbaikan gate — supaya ini tidak terulang senyap

Gate yang ada memeriksa keberadaan + ukuran. **Yang bisa memeriksa isi** tanpa
melihat gambar adalah **hash**: catat sha256 tiap aset yang sudah diverifikasi mata,
lalu gate gagal bila berubah tanpa pembaruan hash. Itu tidak membuktikan kebenaran
hash pertama, tapi menghentikan penggantian berkas secara senyap — kelas yang sama
dengan temuan ini.
