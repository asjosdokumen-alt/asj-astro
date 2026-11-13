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
| 3 fallback mati di renderer: `kinki id.jft`, `jipa id.id_kandidat`, `rirekisho-xlsx data.sertifikasi.sim` | nilainya selalu `undefined`, jadi yang dipakai adalah sisi kanan `??` yang SUDAH ada kolomnya. Tidak berbahaya, tapi menyesatkan pembaca. **Dihapus 2026-11-13** (§6.2) — bersama tiga lain yang tidak terlihat oleh analisis teks waktu itu. |
| `candidate_pekerjaan` tidak punya `kota`/`alasan` | nilainya hidup di kolom slot dan dibaca balik lewat pencocokan `pekerjaan_N_nama_perusahaan` (bukan posisi, karena RPC menomori ulang `urutan`). |

## 4. Cakupan riwayat

47 ejaan kunci riwayat yang dibaca renderer (`sekolah`/`sekolah_id`/`nama_sekolah`,
`perusahaan`/`nama_perusahaan`/`perusahaan_id`, `masuk`/`tahun_masuk`, …) semuanya
menunjuk ke salah satu dari 30 slot yang ditulis `buildRiwayatSlots`. **Tidak ada
kunci riwayat yang dibaca template tanpa slot.**

## 5. Yang belum dikerjakan (sengaja)

1. ~~Tidak ada renderer yang mencetak `alasan`~~ — **DIPUTUSKAN 2026-11-13**, lihat
   §7: memang TIDAK dicetak, karena kelima aset template tidak punya selnya.
2. ~~Belum ada gerbang otomatis~~ — **DITUTUP 2026-11-13**, lihat §6.
3. ~~Tiga fallback mati di §3.3 belum dibersihkan~~ — **DITUTUP 2026-11-13**, dan
   ternyata ada ENAM, bukan tiga (§6.2).

---

## 6. Tindak lanjut 2026-11-13 — gerbang arah template → form

Pertanyaan §5.2 dijawab dengan tes, bukan dengan dokumen: blok ketiga
`e2e/form-column-parity.test.ts` (`paritas template → form`).

### 6.1 Cara mengukurnya

| Lapis | Yang diukur | Cara |
|---|---|---|
| 1. Bacaan mati | path yang dibaca `buildValues`/`buildNumbers` harus ada di kontrak `normalizeMasterData` | Proxy merekam setiap `get` pada `data`, termasuk elemen array; tiga dataset (kosong · penuh · **tanpa kunci**) |
| 2. Ada pengisi | path itu harus punya kolom yang mengisinya | perturbasi satu kolom: `buildMasterNested` → `normalizeMasterData`, bandingkan dengan baseline |
| 3. Form bisa menulis | kolom pengisi harus ada di peta Form Master, peta CV AI, atau slot `buildRiwayatSlots` | himpunan diminta dari penulisnya (`buildRiwayatSlots(…, true)`), bukan diketik |

Dataset ketiga (**tanpa kunci**) wajib: `normalizeMasterData` tidak pernah
mengembalikan `undefined` — field kosong menjadi `'-'` — sehingga `a ?? b` TIDAK
PERNAH mengevaluasi `b`. Terbukti lewat uji mutasi: mengembalikan
`data.sertifikasi.jft ?? id.jft` ke `kinki.ts` tetap HIJAU pada dua dataset
pertama, dan baru MERAH setelah dataset ketiga ada.

### 6.2 Temuan (semuanya diperbaiki di sesi yang sama)

| Temuan | Bukti | Tindakan |
|---|---|---|
| 6 bacaan mati, bukan 3: `identitas.jft` (kinki, firma), `identitas.id_kandidat` (jipa), `sertifikasi.sim` (rirekisho-xlsx), `raw.idKandidat` + `raw.nomorPeserta` (rirekisho-xlsx), `raw.jft` (firma) | gerbang lapis 1 | rantai `??`/`\|\|` dipendekkan ke kunci yang benar-benar ada |
| **`wawancara.motivasi_ke_jepang_jp` selalu `'-'`** — alias di `data.ts` hanya menyebut `wawancara.motivasi_jp`, yang tidak pernah dibuat `buildMasterNested`. Kolom `motivasi_ke_jepang_jp` ADA dan terisi, tetapi tidak pernah sampai ke KINKI | gerbang lapis 2 | alias `wawancara.motivasi_ke_jepang_jp` ditambahkan |
| **`keluarga_2..5_pekerjaan_jp` tidak ada** — CV AI mengumpulkan `keluarga[i].pekerjaan_jp`, `buildRiwayatSlots` tidak punya tujuan, KINKI mencetak 5 baris 家族の職業 | gerbang lapis 3 | migrasi **058** (4 kolom) + slot `['_pekerjaan_jp', 'pekerjaan_jp']` |
| Fixture `rirekisho-xlsx.test.ts` memakai `raw.idKandidat` — ejaan yang tidak pernah ada di produksi | tes hijau karena fallback mati | fixture memakai `raw.id_kandidat` |

**Gate:** backend 122 berkas/**1679** · frontend 131 berkas/**1800** · tsc bersih ·
lint-ratchet PASSED (debt −4) · `verify:schema` IN SYNC (`sha256:3518fc776f39`).
Uji mutasi: menyuntikkan kembali `?? id.jft` ⇒ gerbang MERAH (`kinki: identitas.jft`).

### 6.3 Masih terbuka

- ~~Tidak ada renderer yang mencetak `alasan`~~ — diputuskan di §7.
- Cakupan gerbang = lapisan **pemetaan nilai** (`buildValues`/`buildNumbers`),
  bukan `render()` (yang merakit zip dan memanggil `fetch`/`createImageBitmap`).
  Sisa bacaan di `render()` hanya `uploads.photo` dan nama sheet.
- `uploads.*` dilewati dengan alasan tertulis (berkas unggahan, bukan pertanyaan
  form); `raw.*` diperiksa terhadap kunci yang benar-benar dikembalikan
  `handleGetDrafCvMaster`.

---

## 7. Keputusan 2026-11-13 — `alasan` (退職理由) TIDAK dicetak di lima form

Pemilik 2026-11-12: *"Alasan Berhenti emang belum ada tapi bakal kepake, dulu ada
CV model gitu."* Pertanyaannya: template mana yang mencetaknya?

**Diukur ulang, dan hasilnya nol.** Kelima aset template didekode (bukan dibaca
sebagai teks sumber) lalu seluruh XML-nya dicari `退職理由`, `退職`, dan `理由`:

| Aset | XML | Kemunculan |
|---|---|---|
| `rirekisho-xlsx` | 13 | **0** |
| `rirekisho-firma` | 14 | **0** |
| `kinki` | 13 | **0** |
| `jipa` | 13 | **0** |
| `rirekisho-detail` | 14 | **0** |

⚠️ Koreksi atas §3.1: `rirekisho-detail` **BISA** didekode. Audit 11-12 gagal
karena base64-nya berbentuk konkatenasi (`'…' + '…'`), bukan array string seperti
empat aset lain — bukan karena berkasnya rusak. Setelah didekode: 0 kemunculan.

**Keputusan: tidak ditambahkan ke form mana pun.** Tiga dari lima template
(KINKI, JIPA, Firma) adalah form resmi klien yang dicetak apa adanya; menaruh
nilai di sel yang tidak didefinisikan form itu bukan perbaikan, melainkan
penyimpangan dari template — persis kelas kesalahan yang audit ini kejar.
`rirekisho-xlsx` dan `rirekisho-detail` pun bertabel tetap: menambah kolom berarti
menggeser/menimpa sel yang sudah dipakai.

**Yang tetap dikerjakan supaya "disiapkan" bukan janji kosong:**

1. Jalur tulis–baca dibuktikan `netlify/functions/_lib/actions-master.test.ts`
   (`migrasi 057 — alasan berhenti`): tiga slot menulis kolomnya sendiri,
   `buildMasterNested` membacanya kembali, baris tanpa alasan tetap kosong.
2. `e2e/form-column-parity.test.ts` mencatat `pekerjaan[].alasan` di
   `PREPARED_NOT_PRINTED` dengan dua penjaga: kolomnya **harus** bisa diisi form,
   dan **tidak boleh** ada template yang membacanya. Begitu suatu saat ada
   renderer yang memakainya, tes merah dan entri itu wajib dipindah ke cakupan
   biasa — jadi keputusan ini tidak bisa membusuk diam-diam.

Template model lama yang dimaksud pemilik tidak ada di repo ini; kalau nanti
asetnya masuk, yang perlu ditambah hanya satu baris di `buildValues` renderer
tersebut (`data.pekerjaan[].alasan`) — datanya sudah mengalir sampai sana.
