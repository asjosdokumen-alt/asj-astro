# Kelengkapan unduhan biodata — catatan perubahan

Dikerjakan **2026-10-12** atas keluhan pemilik *"kok gini doang downloadnya, gak semua data
masuk masternya"* dan *"masukin semuanya termasuk tabel wawancara jepang jiko pr"*.

Semua angka di bawah **terukur** terhadap DB live (`gdw`, 226 kandidat / 234 baris master),
bukan perkiraan.

---

## 1. Yang diperbaiki

### 1a. Blok ringkasan mencetak `-` padahal master berisi — `4f23ebf`

Berkas unduhan punya blok ringkasan di atas (IDENTITAS / FISIK & PENDIDIKAN / JFT-SSW) dan
blok DATA MASTER (LENGKAP) di bawah. **Blok atas kosong sementara blok bawah berisi** — di
berkas yang sama.

Sebabnya: `pick()` di `src/lib/biodataExport.ts` hanya jatuh ke `bio` (peta kecil yang
kebetulan dibaca dasbor) dan **tidak pernah** ke `master` (baris penuh). Padahal docblock
modul itu sendiri sudah menjanjikan sebaliknya.

| Baris ringkasan | dicetak `-` padahal master punya nilai |
| --------------- | -------------------------------------- |
| Tinggi / Berat  | **50** |
| Usia            | **37** |
| JFT / JLPT      | **20** |
| Pendidikan      | **11** |
| Gender          | **6** |
| SSW / Bidang    | **4** |

⇒ **61 dari 226 kandidat (27%)** menerima berkas yang bagian atasnya kosong. Contoh nyata
**ASJ00189 (FITRIANA ALYA RIVALIN)** — `gender`/`usia`/`tb`/`bb`/`pendidikan` NULL semuanya di
baris kandidat.

Perbaikan: `pick()` kini berakhir di `fromMaster()`, **satu arah** (master hanya mengisi yang
kosong, tidak pernah menimpa nilai baris kandidat). Ditambah `masterPendidikan()` (jenjang
tertinggi dari `master.pendidikan[]`) dan `masterFisik()` (gabungan `tb`/`bb`).

Bentuk nilainya **diperiksa lebih dulu**: `master.jft`/`master.ssw` berisi **NILAI**
(`"A2/230"`, `"PM"`), bukan URL Storage.

### 1b. Tiga aksi admin mati — `7baba48`

Bukan soal unduhan, tapi ditemukan di sesi yang sama dan diperbaiki karena menyangkut
kebenaran data yang sama. Token sesi menulis `role: 'admin'`/`'kandidat'` — **keduanya bukan
role Postgres** ⇒ PostgREST menolak `401 22023` **sebelum RLS**. Akibatnya
`applications.patchForm`, `applications.deleteForm`, dan `jobs.patchJob` gagal. Sekarang
`admin → service_role`, lainnya → `authenticated`.

---

## 2. Yang pemilik sebut — dan statusnya

**Tabel wawancara, kolom Jepang, dan jiko PR SUDAH ikut ke unduhan.** Tidak ada yang hilang di
exporter:

- grup **`WAWANCARA & MOTIVASI`** sudah dirender (jiko PR = `promosi_id` / `promosi_jp`);
- kolom kanji (`*_jp`) sudah dirender (`Nama Katakana`, `Hobi & Keterampilan (Kanji)`, dst.);
- `getDrafCvMaster` memakai `allColumns('master_database_candidate')` — baris penuh, jadi
  bukan soal proyeksi baca yang menyempit.

Yang membuatnya **tampak** hilang adalah **isinya memang kosong** di baris master:

| Kolom wawancara | terisi |
| --------------- | ------ |
| `hobi_dan_keterampilan` | 19/234 |
| `kelebihan` | 18/234 |
| `tujuan_ke_jepang` | 18/234 |
| `kekurangan` | 17/234 |
| `motivasi_ke_jepang` | 16/234 |
| `rencana_setelah_pulang` | 16/234 |
| `alasan_memilih_bidang` | 15/234 |
| `keinginan_pribadi` | 15/234 |
| `keahlian_khusus` | 14/234 |
| **`promosi_diri` (jiko PR)** | **12/234** |
| `harapan_gaji_yen` | 11/234 |
| `harapan_tabungan` | 9/234 |

Jadi ini soal **pengisian data** (form), bukan soal unduhan. Kalau ada kandidat tertentu yang
dirasa kurang, sebutkan ID kandidatnya — bisa diperiksa baris master-nya satu per satu.

---

## 3. Sisa yang TERUKUR dan belum dikerjakan

`buildMasterNested` (`contexts/master-data/service.ts`) memproyeksikan sebagian kolom saja.
Kolom master yang **berisi data** tapi **tidak pernah masuk berkas**:

| Kolom | terisi | Catatan |
| ----- | ------ | ------- |
| `riwayatpendidikan` | 34/234 | 23 di antaranya juga punya kolom bernomor; **11 HANYA json** |
| `riwayat_keluarga_json` | 10/234 | bentuk JSON, semua juga punya `keluarga_1_nama` |
| `lamakerjadiharapkan` | 9/234 | mis. `"Jangka Panjang"`, `"5 tahun"` |
| `riwayat_pekerjaan_json` | 8/234 | bentuk JSON, semua juga punya `pekerjaan_1_nama_perusahaan` |
| `religion` | 1/234 | — |
| `pasangan` | 1/234 | — |

`ai_data_json` (56/234) **sengaja** dibuang — isinya plumbing, dan array
`pendidikan`/`pekerjaan`/`keluarga`-nya sudah di-merge lewat `mergeRiwayatArrays`.

🪤 **Jangan samakan `lamakerjadiharapkan` dengan `lama_di_jepang`.** Yang terakhir berasal dari
`ai_data_json.wawancara.lama_di_jepang` (ditulis `buildAiOverflow` dari field form
`lamaJepang`). Menyambungkan kolom itu ke label "Lama di Jepang" akan **salah label** — ia
butuh baris dan labelnya sendiri.

Menyambungkan keenam kolom di atas mengubah `buildMasterNested` (backend) **dan** peta label
(frontend), dan riwayat-JSON perlu aturan dedup sendiri. Belum dikerjakan — menunggu
keputusan pemilik, karena `deliverables` ini mencatat angkanya supaya keputusannya berbasis
ukuran, bukan dugaan.

---

## 4. Bukti

| Periksa | Hasil |
| ------- | ----- |
| tes exporter | **26/26 hijau** (4 merah sebelum perbaikan) |
| tes peran DB | **9/9 hijau** (3 merah sebelum perbaikan) |
| `tsc --noEmit` | exit **0** |
| suite frontend | **107 berkas · 1292 tes hijau** |
| suite backend | **1109/1110** — 1 merah = artefak sandbox `.gitignore` di `fcm-server.test.ts` |
| `lint-ratchet` | merah **hanya** `scripts/ci/run-batteries.mjs (3)` = baseline lama, bukan dari perubahan ini |
| counter beku `indexer` | tidak bergerak (berkas tes baru ditaruh di `e2e/`) |
