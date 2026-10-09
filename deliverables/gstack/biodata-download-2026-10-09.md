# Download Biodata — dirapikan & dilengkapi (2026-10-09)

Permintaan pemilik: *"fitur download biodata tolong rapikan dan semua datanya
masuk"*.

## Apa yang salah pada versi sebelumnya

`src/lib/biodataExport.ts` menyalin string legacy **apa adanya**. Dua cacat yang
langsung terlihat:

**1. Kunci proyeksi mentah ikut tercetak.** `berkas` dan `bio` berkunci kode
pendek (bukan label), jadi berkas yang diunduh berbunyi:

```
  kk: https://…
  ayah: BUDI
  pt: PT. SAKURA
  kotapasport: PONOROGO
```

Tidak terbaca oleh siapa pun kecuali kode. Inilah bagian "rapikan".

**2. Blok "Job Yang Dilamar" HILANG.** Blok itu tampil di modal admin **dan** di
kartu kandidat — tepat di ATAS tombol unduhnya — tapi berkasnya tidak memuatnya
sama sekali. `kelas` dan flag **Siswa ASJ** juga tidak ikut. Inilah bagian
"semua datanya masuk".

## Perubahan

| berkas | apa |
|---|---|
| `src/lib/biodataExport.ts` | format ditulis ulang: berbab (Identitas · Fisik & Pendidikan · JFT/SSW · Status · **Job Yang Dilamar** · Berkas · Biodata Detail), label manusia untuk `berkas`/`bio`, nilai kosong tetap ditampilkan `-` |
| `src/components/admin/CandidateProfileModal.tsx` | `kelas` ditambahkan ke `CandidateData` + `mapApiToCandidate` (sebelumnya tidak pernah ikut) |
| `src/components/candidate/CandidateDash.tsx` | unduhan kandidat kini mengirim `kelas`, `isSiswaASJ`, `applications` (+ `dossierJobs` sebagai jaring pengaman) |
| `e2e/biodata-export.test.ts` | **tes baru** (10 tes) — lihat di bawah |

Tiga hal yang membuat ini bukan sekadar ganti label:

- **Label manusia.** `kk` → "Kartu Keluarga", `ayah` → "Nama Ayah", `pt` →
  "Nama Perusahaan", `kotapasport` → "Kota Terbit Paspor", dst. Kunci yang belum
  punya label **tetap muncul** (fallback ke kunci mentah) — kolom dokumen baru
  tidak boleh hilang diam-diam hanya karena belum didaftarkan.
- **Identitas jatuh ke salinan master.** Kalau kolom baris kandidat kosong tapi
  `bio` (master) punya nilainya, nilainya tetap masuk — dan karena itu empat
  kunci `bio` yang menduplikasi baris identitas (`email`, `tmplahir`,
  `tgllahir`, `alamat`) **tidak** dicetak dua kali.
- **Bagian kosong menyatakan dirinya kosong** (`(belum ada lamaran)`), bukan
  menghilang — supaya "tidak ada dokumen" tidak bisa tertukar dengan "eksportir
  lupa dokumen".

## Bukti

- **Tes baru dibuktikan bisa merah.** Mutasi gabungan (label dikembalikan ke
  kunci mentah + blok lamaran dimatikan) ⇒ **4 tes gagal**, termasuk
  `expected … to contain '1. 🍱 P. MAKANAN (TG658ASJ) — LULUS'` dan
  `to contain 'Kartu Keluarga'`.
- `tsc --noEmit` **exit 0** · `lint-ratchet` **PASSED** (1 diagnostik baru saya
  betulkan di sumber, bukan di baseline).
- vitest penuh: **186 berkas · 2275 tes**; 3 merah = artefak sandbox
  `spawnSync … EBUSY` (`indexer/discover`, `boundary`, `_lib/fcm-server`) yang
  sudah terdokumentasi, tidak terkait perubahan ini.
- Berkas baru ada di `e2e/`, yang **tidak** dihitung counter beku `indexer`
  (tier `e2e/` hanya memuat `mjs`/`cjs`/`js`) — jadi tidak ada counter yang
  bergeser.

## ⚠ Batas yang SENGAJA dipertahankan — dan satu pertanyaan untuk pemilik

`biodataExport.ts` menyatakan aturan eksplisit: formatter ini **tidak boleh**
mendapat kolom dari sisi admin-only dossier — password kandidat, catatan internal
(`catatanInternal`), tombol pratinjau dokumen (CV/JFT/SSW/foto/**KTP**), dan
folder pemberkasan. Alasannya: satu berkas yang sama dipakai kandidat DAN admin,
jadi kolom admin-only akan ikut ke berkas yang kandidat teruskan ke sana-sini.
Tes baru ikut mengunci aturan ini (objek sumber yang membawa `nik`,
`catatanInternal`, `catatanExternal`, `folderUrl`, `passwordKandidat` → tak satu
pun muncul di berkas).

**Konsekuensinya, satu hal belum masuk:** tautan dokumen **CV / JFT / SSW / foto
utama** tidak punya bagiannya sendiri. Bagian `BERKAS` memang sudah memuat
tautan dokumen lain (KK, KTP, ijazah, …), jadi pertanyaannya nyata: apakah
tautan CV/JFT/SSW/foto juga harus ikut? Saya **tidak** menambahkannya karena
aturan di atas menyebutnya, dan saya tidak mau membatalkan batas privasi yang
sudah ditulis hanya atas pertimbangan sendiri. **Beri tahu kalau memang mau
ditambahkan** — perubahannya kecil.
