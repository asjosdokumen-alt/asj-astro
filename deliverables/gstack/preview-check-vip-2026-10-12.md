# Cek preview lokal — 5 baris VIP "adelia ke atas" (2026-10-12)

Permintaan pemilik, apa adanya:

> "preview lokal check terutama vip kandidat apakah semua data masuk cv rekhisou
> dan bila donload biodata semuanya bio nya ke donload .gunakan sampel adelia ke atas"

Ringkas: **CV rirekisho bersih dan terisi; unduhan biodata lengkap — tapi ada
SATU cacat tanggal yang hanya kelihatan dengan mata, dan sudah diperbaiki.**

---

## 1. Sampel yang dipakai

"Adelia" = **ADELLIA SALMA AGHISNA PUTRI**, id **115**, kode **ASJ00181**
(ejaan sebenarnya dobel-L; `%adelia%` tidak menemukan apa pun). Ia satu dari
**90 kandidat** ber-tag `[VIP]` di `catatan_internal`.

Daftar kandidat diurut `updated_at` **DESC** (`contexts/catalog/repository.ts:246`),
jadi "adelia ke atas" = 5 baris teratas:

| # | id | kode | nama | gender | usia |
|---|---|---|---|---|---|
| 1 | 133 | ASJ00132 | MUHAMMAD NIZAR NUR HANAFI | LAKI-LAKI | 22 |
| 2 | 128 | ASJ00141 | DWI PANCA SAIFUL ARIF | — | — |
| 3 | 127 | ASJ00108 | DINA EKA YULIANA | — | — |
| 4 | 121 | ASJ00148 | ANIS AGUSTIN | PEREMPUAN | 25 |
| 5 | 115 | ASJ00181 | **ADELLIA SALMA AGHISNA PUTRI** | — | — |

**Kelima-limanya VIP.** Data: DB yang repo pakai sekarang (`gdwvffmevwtwnzrapjwy`,
226 kandidat).

## 2. Cara diperiksa

1. **Preview lokal yang nyata** — `netlify dev` → `localhost:8888`, fungsi
   dijalankan LOKAL dengan `.env` repo. Bukan `astro dev` (itu mem-proxy fungsi
   ke backend REMOTE ⇒ frontend baru + backend lama). Diverifikasi: endpoint
   lokal melaporkan **226 kandidat** dan master Adellia `tempat_lahir=""` — jadi
   memang gdw, bukan produksi.
   ⚠️ `sweep-queue` + `agenda-reminders` dinonaktifkan **selama** preview saja
   (kalau tidak, `job_queue` PRODUKSI dieksekusi). **Sudah dipulihkan** setelah
   selesai — `git status` bersih.
2. **Pipeline asli dijalankan juga di luar browser** (`findMasterByWa` →
   `buildMasterNested` → `makeV` → `buildCvIdentitas`/`buildKertasA4`,
   `buildBiodataText`) supaya seluruh **226** kandidat bisa diukur, bukan 5.

---

## 3. Jawaban 1 — CV rirekisho: bersih, dan datanya masuk

**"undefined": 0 dari 5** (diukur dari DOM yang benar-benar dirender).
Perbaikan sesi sebelumnya bertahan.

Bukti visual: `preview-vip-cv-adellia.png` — seluruh sel identitas terisi
(JENIS KELAMIN `PEREMPUAN (女)`, USIA `18 歳`, TINGGI `150 CM`, BERAT `65 KG`,
GOLONGAN DARAH `B+ 型`, TANGGAL LAHIR `2007年10月01日`, TEMPAT LAHIR `PONOROGO`,
TANGAN `KANAN (右)`, plus pendidikan/pekerjaan/keluarga).

Kelengkapan data diukur atas **seluruh 226 kandidat**:

| sel CV | CV kosong padahal `database_candidate` berisi |
|---|---|
| JENIS KELAMIN · USIA · NAMA · TEMPAT LAHIR · TGL LAHIR · ALAMAT · NO PASPOR · EMAIL | **0** |
| TINGGI | 1 |
| BERAT | 1 |
| JFT/JLPT | 1 |
| SSW/LISENSI | 3 |
| **TOTAL** | **6 sel pada 5 kandidat (2%)** |

Jadi: **224 dari 226 CV memuat setiap field yang datanya ada.** Yang tersisa
ialah kandidat yang mengisi formulir lamaran tetapi tidak menuntaskan Form
Master — nilainya ada di `database_candidate`, sedangkan CV membaca
`master_database_candidate` + draf CV-AI (`ai_data_json`). Daftar lengkapnya:
`#97 HARUN EFENDI` (JFT `222`), `#88 AHMAD FADILLAH` / `#4 CHERYLIA MELANI
USWAZANAH` / `#56 LINDI` (SSW), `#60 NATASYA NURAINI` (TB `170` / BB `55`).

## 4. Jawaban 2 — unduhan biodata: lengkap, TAPI ada cacat tanggal

**5 dari 5 unduhan berhasil** lewat tombol "Download Full Biodata" di preview
lokal. Tiap berkas memuat blok **DATA MASTER (LENGKAP)** (identitas, fisik,
medis, wawancara, sertifikasi, riwayat pendidikan/pekerjaan/keluarga, kenalan di
Jepang, dokumen), **0 kata "undefined"**.

Satu-satunya nilai yang tidak ikut adalah `catatan_external` — dan itu
**memang disengaja** (`biodataExport.ts`: memo internal admin tidak boleh ikut
ke berkas yang kandidat teruskan).

### 🔴 Cacat yang ditemukan justru karena diperiksa dengan mata

```
Tanggal Lahir                  : 2007-09-30T17:00:00.000Z
```

Cap waktu **ISO mentah**, dan harinya **mundur satu**: stempel itu tengah malam
WIB yang disimpan sebagai UTC, jadi tanggal yang dimaksud adalah **1 Oktober
2007**, bukan 30 September.

Rantainya:

- `master_database_candidate.tgl_lahir` bertipe `timestamptz` ⇒ PostgREST
  mengembalikan cap waktu penuh.
- Nilai itu sampai ke berkas lewat **dua** jalur: `bio.tgllahir`
  (`BIO_COLUMNS`, `_lib/db/berkas.ts:47`) untuk baris identitas, dan
  `master.identitas.tgl_lahir` untuk blok DATA MASTER. `mapApiToCandidate`
  (`CandidateProfileModal.tsx:97`) bahkan **mendahulukan** `bio.tgllahir` yang
  ISO itu di atas `tglLahir` yang sudah bersih.
- **CV rirekisho tidak pernah kena** — ia mem-`new Date()` lalu memformat sendiri
  (`2007年10月01日`). Itu sebabnya cacat ini hanya muncul di berkas unduhan.

**Terukur atas DB live: 67 dari 226 kandidat (30%)** mendapat baris seperti itu.

### Perbaikan

`src/lib/biodataExport.ts` — satu helper `asDate()` di lapisan cetak, dipakai di
KEDUA tempat tanggal dicetak (baris identitas + blok master). Hanya stempel ISO
persis yang ditulis ulang; teks tanggal biasa (`2001-05-05`) lewat apa adanya.
Zona waktu dikunci ke `Asia/Jakarta` — itu yang mengembalikan harinya.

Hasil terukur: **67/226 (30%) → 0/226.** Di preview lokal, tanggal Adellia kini
`01/10/2007`.

---

## 5. Dua kesalahan probe SAYA SENDIRI — dicatat supaya angkanya tidak dipercaya buta

Dua angka pertama yang saya ukur **salah**, dan keduanya baru ketahuan karena
diperiksa ulang dengan cara berbeda. Saya catat apa adanya:

1. **"33 nilai hilang, 30/226 kandidat"** — probe pertama saya melewatkan
   `AIDATAJSON`, padahal `handleGetDrafCvMaster` **selalu** menyertakannya
   (ditambahkan setelah `buildMasterNested`). Draf CV-AI itu yang mengisi
   `tempat_lahir` dll. Setelah diperbaiki: **6 sel / 5 kandidat (2%)**.
   Ketahuan karena preview lokal menampilkan PONOROGO sementara probe bilang
   kosong.
2. **"64 nilai DB tidak masuk berkas biodata"** — probe biodata saya memakai
   bentuk input yang salah (langsung `mapCandidate`, tanpa `mapApiToCandidate`).
   Setelah disamakan dengan jalur nyata: **0** (selain `catatan_external`).

Pelajaran yang sama dengan bug fixture filter kemarin, dari arah sebaliknya:
**probe yang bentuk inputnya tidak persis sama dengan jalur nyata akan
menghasilkan angka yang salah** — dan angka yang salah lebih berbahaya daripada
tidak ada angka.

## 6. Yang SENGAJA belum dikerjakan

- **6 sel / 5 kandidat (2%)** — perlu keputusan pemilik: CV membaca master+AI,
  bukan `database_candidate`. Menambah fallback mengubah isi CV, jadi tidak saya
  lakukan tanpa persetujuan.
- **CV memakai zona waktu browser** untuk tanggal (`new Date(...).getDate()`).
  Benar untuk admin di WIB; akan meleset sehari kalau dibuka dari zona lain.
- `lint-ratchet` merah pada `scripts/ci/run-batteries.mjs` — **sudah ada sebelum
  sesi ini**, di luar diff, baseline tidak dinaikkan.
- Satu peringatan hidrasi Preact di konsol (`Expected a DOM node of type div…`)
  saat halaman admin dimuat. Tidak memblokir; belum diselidiki.
- Produksi masih menunjuk `bimq`, repo menunjuk `gdw`.

## 7. Menjalankan preview sendiri

```bash
cd F:/astro
mv netlify/functions/sweep-queue.ts netlify/functions/sweep-queue.ts.disabled
mv netlify/functions/agenda-reminders.ts netlify/functions/agenda-reminders.ts.disabled
CODEBUDDY_SAFE_DELETE_ENABLED=0 netlify dev --port 8888 --offline
# → http://localhost:8888   (login admin, tab Data Pelamar)
# SETELAH SELESAI, WAJIB dipulihkan:
# mv netlify/functions/sweep-queue.ts.disabled netlify/functions/sweep-queue.ts
# mv netlify/functions/agenda-reminders.ts.disabled netlify/functions/agenda-reminders.ts
```

⚠️ Dua `mv` itu **wajib**: tanpa itu, `sweep-queue` mengambil job dari
`job_queue` **PRODUKSI** tiap 2 menit. Dan kalau lupa dipulihkan, tiga tes
(`admission.test.ts`, `service-reminder-cron.test.ts`) langsung merah — terukur.

⚠️ `CODEBUDDY_SAFE_DELETE_ENABLED=0` perlu karena `netlify dev` memakai `trash`
untuk `.netlify/functions-serve` dan shim sandbox memblokirnya.
