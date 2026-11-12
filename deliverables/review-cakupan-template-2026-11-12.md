# Review — cakupan "pertanyaan template" di CV AI & Form Master

**Tanggal:** 2026-11-12 · **Pertanyaan pemilik:** *"sudah kah pipeline sync semua dan
daftar semua pertanyaan dari ke 5 template ada di cv ai dan form master?"* ·
*"Alasan Berhenti emang belum ada tapi bakal kepake."*

**Jawaban singkat: ya, dengan SATU lubang — dan lubang itu `Alasan Berhenti`.**
Sesudah migrasi 057 tidak ada lagi field yang dicetak template tetapi tidak bisa
diisi dari kedua form.

---

## 1. Metode (apa yang diukur, bukan dikira)

| Langkah | Cara | Hasil terukur |
|---|---|---|
| Field yang dibaca tiap template | analisis teks 5 renderer (`data.<section>.<key>` + alias) | **98 field skalar unik** + **47 ejaan kunci riwayat** |
| Field yang dihasilkan lapisan data | `normalizeMasterData` (`data.ts`) | **107 kunci** di 7 seksi |
| Field → kolom | `buildMasterNested` (`service.ts`) | **100 dari 107** punya kolom; 7 sisanya identitas/alias |
| Form Master bisa menulis? | `MASTER_COLUMN_MAP` + `JP_TRANSLATE_MAP` + slot | ya, untuk semua kolom yang dipakai template |
| CV AI bisa menulis? | `AI_TO_MASTER_COLUMNS` + slot | ya (gerbang `form-column-parity` 5/5) |
| Slot riwayat | `buildRiwayatSlots` | **30 slot** (`pendidikan_1..6`, `pekerjaan_1..3`, `keluarga_1..5`) |

## 2. Template yang diperiksa

`rirekisho-xlsx` · `rirekisho-firma` · `kinki` · `jipa` · `rirekisho-detail`
(lima yang ditawarkan di pemilih template; `templates.test.ts` mengunci daftarnya).

Field skalar yang dibaca per template: **kinki 63 · rirekisho-xlsx 44 · jipa 42 ·
rirekisho-detail 33 · rirekisho-firma 31** (satu field bisa dipakai beberapa
template; total unik 98).

## 3. Temuan

### 3.1 Lubang yang ditutup hari ini

| Temuan | Bukti | Tindakan |
|---|---|---|
| **`Alasan Berhenti` tidak punya kolom** dan tidak pernah dikirim, padahal Form Master sudah merender inputnya sejak lama | `master.kerja_alasan` dirender di `MasterFullForm.tsx`; payload pekerjaan tidak memuat `alasan`; `cari kolom alasan` di kontrak = 0 | **migrasi 057** `pekerjaan_1..3_alasan` + slot + prefill + payload dua form + peta draf |
| CV AI **tidak punya** isian alasan sama sekali | `JobRow` tidak punya `alasan` | isian ditambahkan (dalam blok "Detail opsional") |

### 3.2 Sudah beres dari sesi sebelumnya

- **`kota` (地域)** — migrasi 056, `K20/K27` KINKI, isian di dua form, prefill.
- **"Alamat Sekolah" Form Master** — dirender tetapi tidak pernah terkirim; kini
  menjadi `kota`.

### 3.3 Yang TIDAK dianggap lubang (dan alasannya)

| Hal | Alasan |
|---|---|
| `identitas.hp` → kolom `no_wa` | nomor WA adalah identitas baris, bukan pertanyaan CV. Tidak diedit di form mana pun. |
| `identitas.id_kandidat` (jipa `H5`) | dibaca dari `data.raw`, bukan dari form. |
| 3 fallback mati di renderer: `kinki id.jft`, `jipa id.id_kandidat`, `rirekisho-xlsx data.sertifikasi.sim` | nilainya selalu `undefined`, jadi yang dipakai adalah sisi kanan `??` yang SUDAH ada kolomnya. Tidak berbahaya, tapi menyesatkan pembaca. **Belum dihapus** — dicatat di sini. |
| `candidate_pekerjaan` tidak punya `kota`/`alasan` | nilainya hidup di kolom slot dan dibaca balik lewat pencocokan `pekerjaan_N_nama_perusahaan` (bukan posisi, karena RPC menomori ulang `urutan`). |

## 4. Cakupan riwayat

47 ejaan kunci riwayat yang dibaca renderer (`sekolah`/`sekolah_id`/`nama_sekolah`,
`perusahaan`/`nama_perusahaan`/`perusahaan_id`, `masuk`/`tahun_masuk`, …) semuanya
menunjuk ke salah satu dari 30 slot yang ditulis `buildRiwayatSlots`. **Tidak ada
kunci riwayat yang dibaca template tanpa slot.**

## 5. Yang belum dikerjakan (sengaja)

1. **Tidak ada renderer yang mencetak `alasan`.** Pemilik: *"bakal kepake, dulu ada
   CV model gitu"*. Kolomnya disiapkan; template yang membutuhkannya tinggal
   membaca `data.pekerjaan[].alasan`.
2. **Belum ada gerbang otomatis** "field yang dibaca template ⊆ field yang bisa
   ditulis form". Yang ada sekarang: `form-column-parity` (Master ↔ AI) dan
   `ai-cv-column-coverage` (AI → kolom). Arah template → form masih diukur manual
   di dokumen ini.
3. Tiga fallback mati di §3.3 belum dibersihkan.
