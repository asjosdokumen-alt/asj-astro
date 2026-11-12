# Review pipeline data master kandidat → semua lini

**Tanggal:** 2026-11-12 · **Sifat:** review saja (tidak ada kode produksi yang diubah)
**Sumber angka:** query baca-saja ke PostgREST produksi (Neon) + pembacaan kode di `HEAD`.
**Cakupan:** skema & migrasi, jalur tulis, trigger cermin, generator template, modal A/B.

---

## 0. Ringkasan — satu kalimat

Sistem ini punya **dua tabel untuk orang yang sama** (`master_database_candidate` dan
`database_candidate`) yang disalin oleh **tiga mekanisme berbeda yang tidak sepakat**
(trigger DB, patch aplikasi, backfill migrasi), dan **sepuluh daftar field yang ditulis
tangan di sepuluh tempat**. Semua gejala yang dilaporkan — modal A ≠ modal B, template
tidak sesuai DB — adalah akibat langsung dari itu, bukan bug terpisah-pisah.

**Terukur di produksi (Neon, `env-kunci/PRODUCTION.env`):**

| Ukuran | Nilai |
|---|---|
| `master_database_candidate` | 265 baris · **282 kolom** |
| `database_candidate` | 264 baris · 34 kolom |
| Kolom CV yang **diduplikasi** di kedua tabel | 16 |
| **Sel yang menyimpang** — sesudah migrasi `053` | **0** (dari 16 kolom) |
| Baris master tanpa baris kandidat | **1** (ASJ00222, WA rusak) |
| Baris kandidat tanpa master | 0 |
| Template CV tersimpan | **1**, dan template itu **tidak bisa** menghasilkan CV yang benar |

> ### ⚠️ Koreksi 2026-11-12 20:30 — angka pertama di dokumen ini salah DB
>
> Draf pertama dokumen ini melaporkan **311 sel menyimpang** dan beberapa contoh
> per kandidat. Semua angka itu diukur lewat `.env` di root repo, yang menunjuk
> proyek **Supabase lama** (`gdwvffmevwtwnzrapjwy.supabase.co`) — bukan database
> yang dipakai aplikasi. Ledger di sana berhenti di migrasi `016`; produksi ada
> di **Neon** (`ep-bold-sunset-…`, lihat `env-kunci/PRODUCTION.env` dan
> `.env.local`), dengan 53 migrasi terpasang.
>
> Konsekuensinya: angka 311 **tidak berlaku** untuk produksi, dan contoh
> per-kandidat yang semula dipakai sudah diganti dengan yang diukur ulang di
> Neon. Temuan tingkat kode (trigger, pemetaan field, generator template,
> proyeksi sync) tidak berubah — semuanya diverifikasi ulang di Neon.
>
> Jebakan ini nyata dan berulang: `scripts/lib/load-env.mjs` membaca
> `.env.local` **lebih dulu** daripada `.env`, jadi perkakas repo aman, tetapi
> probe/audit yang membaca `.env` langsung akan mengukur database yang salah
> tanpa satu pun peringatan. Lihat §10.

---

## 1. Arsitektur yang sebenarnya (bukan yang tertulis di komentar)

```
                    ┌──────────────────────────────┐
   Form Master ────►│ master_database_candidate    │  ← sumber kebenaran (282 kolom)
   CV AI       ────►│                              │
   Pemberkasan ────►│                              │
                    └───────────┬──────────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
    trigger 041 (DB)     patch aplikasi      backfill migrasi
    AFTER INSERT/UPDATE  best-effort        040 / 045 / 046
              │                 │                  │
              ▼                 ▼                  ▼
                    ┌──────────────────────────────┐
                    │ database_candidate           │  ← dibaca panel admin
                    │ (16 kolom CV + 18 kolom      │     (modal A & modal B)
                    │  operasional)                │
                    └──────────────────────────────┘
```

Pembacaannya:

| Permukaan | Sumber | Kode |
|---|---|---|
| Daftar kandidat admin | `database_candidate` | `catalog/repository.ts:250` `loadCandidatesUnik` |
| **Modal A** — dossier/rincian | `database_candidate` (+ `getDrafCvMaster` untuk unduhan) | `CandidateProfileModal.tsx:180-256, 350` |
| **Modal B** — edit kandidat | `database_candidate` | `EditCandidateModal.tsx:218` → `registry/service.ts:119` |
| CV / rirekisho / template | **`master_database_candidate`** | `CvTemplateSelector.tsx:98,130`, `RirekishoBuilder.tsx:373` |
| Form Master / CV AI | `master_database_candidate` | `master-data/service.ts:1251,1294` |

Jadi **modal A dan modal B membaca tabel yang sama** — keduanya seharusnya identik. Yang
berbeda adalah **modal vs CV**: modal membaca salinan, CV membaca master. Itulah "modal A
beda dengan modal B" yang terlihat: salah satu dari yang dibuka sebenarnya permukaan CV.

---

## 2. Bukti: contoh nyata yang tidak sinkron

### 2.1 ASJ00179 — alergi udang tercetak "tidak ada alergi"

| | Nilai |
|---|---|
| `master.alergi` | `Alergi udang` |
| `master.alergi_jp` | `エビアレルギー` |
| Yang dicetak JIPA `H16`/`I16` | **`無い(TIDAK)`** |

Sebabnya satu baris di `src/lib/cv-template-factory/data.ts`:

```ts
alergi: v('ALERGI', 'medis.alergi'),
```

sedangkan `buildMasterNested` (`master-data/service.ts:437`) mengeluarkan kunci
**`medis.alergi_id`**, bukan `medis.alergi`. `v()` tidak menemukan `medis.alergi`, lalu
mengembalikan sentinel `'-'`, dan `negatif('-')` bernilai `true` → kolom alergi dicetak
"tidak ada" untuk **semua** kandidat.

**Terukur di produksi: 43 baris punya alergi terisi.** Enam di antaranya alergi nyata
(`ASJ00179` udang, `ASJ00152` ayam & telur, `ASJ00095` kripik usus, …); sisanya "TIDAK ADA"
yang kebetulan benar. Untuk enam orang itu, form Jepang menyatakan mereka tidak punya
alergi.

> Catatan: `riwayat_medis` dan `riwayat_kecelakaan` **tidak** kena, karena keduanya sudah
> memakai akhiran `_id`. Hanya `alergi` yang tertinggal.

### 2.2 ASJ00188 / ASJ00133 / ASJ00194 — nilai ujian dipakai sebagai tautan

`jft` dan `jft_url` adalah **dua kolom berbeda**: yang pertama nilai ujian (isi CV), yang
kedua tautan berkas (pratinjau). Di `database_candidate` hanya ada satu kolom (`jft`), dan
`mapCandidate` mengambil `jftUrl` darinya:

| Baris | `database_candidate.jft` | Akibat di dossier |
|---|---|---|
| ASJ00188 | `233` | tombol SERTIF JFT membuka alamat `233` |
| ASJ00133 | `A1` | idem |
| ASJ00194 | `A2/205` | idem |

Terukur atas 264 baris: `jft` berisi URL **89**, nilai ujian **6**, kosong **169**. Jadi
kolom itu memang dipakai untuk dua arti sekaligus — dan kode harus memisahkannya menurut
bentuk nilai, bukan menurut nama kolom.

### 2.3 ASJ00222 — baris master yang tidak bisa dijangkau aplikasi

| | `no_wa` |
|---|---|
| `master_database_candidate` | `622342782945` |
| `database_candidate` | **tidak ada barisnya** |

Satu digit `8` hilang di master. `findMasterByWa()` (`db/master.ts:47`) menormalkan WA lewat
`normalizeWa`, dan `normalizeWa('622342782945')` mengembalikan `''` (hanya typo `6208…`
yang diperbaiki, bukan `62` + digit hilang). Karena itu:

- baris ini **tidak pernah muncul** di daftar admin (daftar membaca `database_candidate`);
- `getDrafCvMaster` tidak bisa menemukannya, jadi CV-nya tidak bisa dibuat;
- trigger cermin tidak punya pasangan untuk digabung.

Ini satu-satunya baris master tanpa pasangan di produksi. Tidak diperbaiki otomatis karena
tanpa baris pembanding, WA yang benar tidak bisa dipastikan — perlu keputusan pemilik.

---

## 3. Mengapa penyimpangan terbentuk lagi — lima sebab, semuanya masih hidup

### 3.1 Trigger 041 hanya menyalin nilai yang TIDAK KOSONG

`migrations/041_cermin_master_ke_database_candidate.sql:40-57`:

```sql
SET alamat_lengkap = COALESCE(NULLIF(btrim(NEW.alamat_lengkap), ''), d.alamat_lengkap),
    bb             = COALESCE(NULLIF(btrim(NEW.bb::text), ''), d.bb),
    ...
```

`COALESCE(NULLIF(baru,''), lama)` berarti: **master yang dikosongkan tidak pernah
mengosongkan salinan.** Admin menghapus TB di Form Master → master `''`, salinan tetap
`173`. Modal menampilkan 173, CV mencetak kosong. Ini persis kebalikan dari keluhan
"dihapus, kok balik lagi", dan migrasi `045` sendiri sudah mencatatnya sebagai penyebab
70 sel menyimpang — tetapi trigger-nya **tidak diperbaiki**, hanya datanya yang ditambal.

### 3.2 Trigger tidak punya cabang INSERT yang benar

Trigger adalah `AFTER INSERT OR UPDATE`, tetapi badannya hanya `UPDATE … WHERE d.no_wa = NEW.no_wa`.
Baris `database_candidate` baru dibuat saat **pendaftaran** (`identity/service.ts:339`),
dan baris master sering dibuat **sebelum** itu (Form Master / CV AI). Urutannya:

```
INSERT master  → trigger jalan → UPDATE candidate … 0 baris (belum ada) → SENYAP
INSERT candidate (nama, wa, password saja) → tidak ada trigger → 16 kolom kosong
UPDATE master berikutnya → baru terisi
```

Kalau kandidat tidak pernah menyimpan Form Master lagi, 16 kolom itu **selamanya kosong**.
Itu tepat pola ASJ00104: master terisi, salinan kosong, dan tidak ada error di mana pun.

### 3.3 Trigger menggabung dengan `no_wa` mentah

`WHERE d.no_wa = NEW.no_wa` — perbandingan teks apa adanya. Aplikasi menormalkan WA
(`628…` ↔ `0…`), trigger tidak. Satu baris dengan bentuk berbeda (ASJ00222) membuat
salinannya **beku permanen** tanpa gejala.

### 3.4 Trigger tidak menyentuh `updated_at`

`database_candidate.updated_at` hanya diisi kode aplikasi. Trigger cermin menulis 16 kolom
tanpa menaikkan `updated_at`, sehingga:

- urutan daftar admin (`loadCandidatesUnik` mengurutkan `updated_at`) tidak mencerminkan
  perubahan yang datang dari master;
- delta sync (kalau nanti dihidupkan) tidak akan pernah melihat perubahan itu.

### 3.5 Patch aplikasi bersifat best-effort dan tidak pernah membuat baris

Tiga jalur tulis, tiga perilaku berbeda:

| Jalur | Menulis master | Menulis salinan | Kalau salinan belum ada |
|---|---|---|---|
| `handleSubmitMasterForm` (`master-data/service.ts:1294`) | ya | `try{}catch{}` di `:1397` | **tidak insert** — dilewati |
| `handleUpdateKandidatSuper` (`registry/service.ts:119`) | `try{}catch{}` di `:146-154` | ya | — |
| `_lib/ai/cv.ts:637-670` | ya | `try{}catch{}` | **tidak insert** — dilewati |

Semua `catch` kosong. Kegagalan sinkronisasi tidak pernah terlihat di log, di UI, atau di
respons API. Pemilik melihat "berhasil" di ketiga permukaan.

### 3.6 Bentuk data tidak seragam

Terukur pada 16 kolom yang sama:

| Kasus | Contoh nyata |
|---|---|
| huruf besar/kecil | `MAGETAN` vs `magetan` |
| angka + satuan di kolom angka | `tb = "159 cm"`, `bb = "61 kg"` |
| email berisi nomor WA | `email = "+6282130442661"` |
| tanggal dua bentuk | `2001-06-13T17:00:00.000Z` vs `2001-06-14` |
| penanda kosong | `""`, `"-"`, `"TIDAK ADA"`, `"Tidak"`, `"なし"` |

`toDateOnly()` sudah menangani bentuk tanggal dengan benar (Jakarta, bukan UTC), jadi
tanggal **tampil** sama. Yang tidak ditangani: `"159 cm"` masuk ke sel `H6` sebagai teks
apa adanya, dan `"-"` / `"TIDAK ADA"` lolos ke sel CV sebagai isi.

---

## 4. Generator template: mengapa hasilnya bukan data kandidat

### 4.1 Yang tersimpan di DB hanya satu template, dan peta selnya salah

`sys_config` (`config_type = 'cv_template'`), terukur:

```
id: tpl-tg708 · nama: tg708 · updatedAt: 2026-10-12 · aktif: true
fieldMap: 11 sel
  D9,E9,F9,G9,H9,I9,K9,L9,M9,N9,O9  ->  identitas.tempat_lahir   (SEMUA 11)
ambiguous: {}
riwayat:  {}          <-- tidak ada blok pendidikan/pekerjaan/keluarga
```

Sebelas sel, satu field, dan tidak ada blok riwayat. Artinya CV yang dihasilkan:

- **tidak** memuat nama, tanggal lahir, gender, usia, foto, pendidikan, pekerjaan, keluarga,
  JFT, golongan darah — tidak ada satu pun yang dipetakan;
- **hanya** menimpa baris 9 dengan tempat lahir kandidat.

### 4.2 Berkas template itu sendiri adalah CV orang lain yang sudah terisi

Berkas `tpl-tg708.xlsx` (2,76 MB) diunduh dan diperiksa isinya:

```
sheet name        : "FIRMA ELGA PRATAMA"
sharedStrings     : "FIRMA ELGA PRATAMA", "フィルマ・エルガ・プラタマ", "男性",
                    "JFT A2", "PONOROGO", "O", "履 歴 書", "学 歴" …
xl/media/image1.png : 2.730.145 byte   <-- pas foto orang itu
```

`analyzeFromExample` memang **belajar dari nilai**, jadi berkas contoh wajib berisi data
contoh — itu desainnya. Masalahnya, `applyFieldMap`
(`loaders/tEMPLATE-loader.ts:835-862`) **hanya menyentuh sel yang ada di `fieldMap`**:

```ts
for (const [cellAddress, fieldPath] of Object.entries(fieldMap)) {
  const value = getValueFromPath(data, fieldPath);
  if (value) { writeCellValue(cell, value); continue; }
  if (looksLikeLabel(cellText(cell))) continue;
  writeCellValue(cell, '');          // hanya sel yang DIPETAKAN
}
```

Sel yang tidak dipetakan **tidak pernah dikosongkan**. Jadi hasil generate = CV
**FIRMA ELGA PRATAMA** (nama, gender, umur, foto, riwayat sekolah) dengan dua sel di baris 9
diganti tempat lahir kandidat baru.

Penjaga yang ada di `CandidateProfileModal.tsx:392` hanya menolak peta yang **kosong
total** — 11 sel lolos.

### 4.3 Pemetaan yang salah, bukan hanya kurang

Baris 9 template itu berisi dua label berbeda:

| Sel | Label | Nilai contoh | Dipetakan ke |
|---|---|---|---|
| `A9` (merge `A9:C9`) | **出生地** (tempat lahir) | `PONOROGO` di `D9` | `identitas.tempat_lahir` ✔ |
| `J9` | **現住所** (alamat sekarang) | `PONOROGO` di `K9` | `identitas.tempat_lahir` ✘ |

Karena nilai contoh tempat lahir **sama** dengan nilai contoh alamat, pencocokan berbasis
nilai (`analyzeFromExample:396-403`) menyimpulkan keduanya field yang sama. Akibatnya alamat
kandidat dicetak ke kolom **現住所**, dan `alamat_lengkap` yang ada di DB tidak pernah dipakai.

### 4.4 Peta sel tidak terikat versi skema

`decodeTemplateRecord` (`templates.ts:145-218`) hanya memeriksa bahwa `path` adalah string
tidak kosong:

```ts
if (typeof path === 'string' && path.trim()) fieldMap[cell] = path.trim();
```

Tidak ada validasi bahwa path itu benar-benar ada di `CandidateData`, dan tidak ada
`schemaFingerprint` / `fieldMapVersion` di record. Konsekuensinya:

- `medis.alergi` (yang tidak pernah ada di bentuk bersarang) **tersimpan sah** dan
  menghasilkan sel kosong selamanya;
- kalau sebuah field diganti nama di `data.ts`, semua template lama tetap "sah" dan
  diam-diam berhenti mengisi sel — tanpa error, tanpa peringatan.

### 4.5 `applyFieldMap` hanya menulis sheet pertama

`analyzeFromExample` memindai **semua** worksheet (`:384`), `applyRiwayatBlock` menghormati
`block.sheet` (`:617`), tetapi `applyFieldMap` selalu `workbook.worksheets[0]` (`:840`).
Template multi-sheet akan memetakan alamat dari sheet 2 lalu menulisnya ke sheet 1 —
nilai masuk ke sel yang salah, atau tidak masuk sama sekali.

---

## 5. Lapisan "sync" yang ada tetapi mati

### 5.1 `syncDelta` untuk master selalu gagal — terbukti 400

`contexts/sync/repository.ts:55`:

```ts
master: 'id_kandidat,nama_lengkap,no_wa,gender,tb,bb,email,status_proses,tahapan,id_loker,updated_at',
```

Tiga nama terakhir **tidak ada** di `master_database_candidate`. Dibuktikan langsung:

```
GET /rest/v1/master_database_candidate?select=…status_proses,tahapan,id_loker…
-> 400 {"code":"42703","message":"column master_database_candidate.status_proses does not exist"}
```

Jadi `syncRowsSince('master')` (`:127`) selalu melempar, `handleSyncDelta` mengembalikan
`{success:false}` (`sync/service.ts:138`), dan klien tidak pernah menerima delta master.

### 5.2 Mesin local-first tidak dipakai siapa pun

```
localFirst(  )        -> 0 pemanggil
syncTransport         -> hanya diimpor sebagai `type`
localStore            -> hanya diimpor oleh localSync
contexts/sync         -> terdaftar di surface, tidak dipanggil klien
```

Seluruh lapisan delta/probe/manifest adalah **kode mati**. Konsekuensinya hari ini:
tidak ada retry, tidak ada rekonsiliasi, tidak ada deteksi baris hilang. Satu-satunya
pertahanan terhadap data basi adalah TTL 30 detik `apiClient` dan `cacheClear()` per
instance function — dan `cacheClear()` hanya membersihkan cache **proses yang menangani
penulisan**, bukan instance lain yang mungkin melayani pembacaan berikutnya.

### 5.3 Cache di dalam modal

`CandidateProfileModal.tsx:180-206`: kalau `candidate` (seed) dioper, modal **tidak
melakukan fetch sama sekali** — ia memakai snapshot dari daftar. Setelah modal B menyimpan,
snapshot itu baru berubah kalau pemanggilnya ikut menyegarkan. Ini sumber "kadang beda,
kadang sama" yang sulit direproduksi.

---

## 6. Sepuluh daftar field untuk satu orang

Ini akar dari gejala #1 di daftar Anda ("tidak ada satu sumber kebenaran"). Semuanya hidup
berdampingan:

| # | Daftar | Lokasi | Arah |
|---|---|---|---|
| 1 | `MASTER_COLUMN_MAP` (~90 entri) | `master-data/service.ts:65` | form → master |
| 2 | `AI_TO_MASTER_COLUMNS` | `master-data/service.ts:848` | AI → master |
| 3 | `buildMasterNested` (~150 field) | `master-data/service.ts:319` | master → baca |
| 4 | `normalizeMasterData` (~110 field) | `cv-template-factory/data.ts:10` | baca → template |
| 5 | `FIELD_LABELS` (~55 pola) | `loaders/tEMPLATE-loader.ts:63` | label → path |
| 6 | `v()` inline di RirekishoBuilder | `RirekishoBuilder.tsx:214-309` | master → HTML |
| 7 | Daftar kolom trigger 041 (16) | `migrations/041:41-56` | master → salinan |
| 8 | `MASTER_TO_CANDIDATE_IDENTITY` (12+4) | `_lib/db/identity-sync.ts:58,78` | master ↔ salinan |
| 9 | `BIO_LENGKAP_MASTER_COLS` | `master-data/service.ts:1420` | pemberkasan → master |
| 10 | Peta sel 5 renderer | `renderers/*.ts` | data → sel Excel |

Daftar 3 dan 4 sudah terbukti menyimpang (`alergi`). Daftar 7 dan 8 menyimpang pada aturan
"nilai kosong": #8 tidak pernah menulis kosong (`usable()` menolak `''`), #7 menulis kosong
tetapi `COALESCE` menahannya. Keduanya "benar" menurut komentarnya sendiri, dan hasilnya
saling meniadakan.

Contoh drift yang lebih halus: `getMasterDataByWa` (`master-data/service.ts:1197`) memetakan
`LAMA_DI_JEPANG` ke `status_eks_jepang`, sedangkan `buildMasterNested` memetakannya ke
`lama_di_jepang`. Fungsi itu sekarang **tanpa pemanggil** — jadi bug-nya laten, tetapi akan
langsung terlihat begitu ada yang menyambungkannya.

---

## 7. Yang perlu diperbaiki, urut dampak

> ### Status 2026-11-12 20:30
>
> | Butir | Status | Bukti |
> |---|---|---|
> | P0-1 alergi `medis.alergi_id` | **selesai** | `e66817b`; tes regresi di `data.test.ts` |
> | P0-2 trigger cermin | **selesai** | migrasi `053` (diterapkan; `migrate:status` 53 applied) |
> | P0-3 rekonsiliasi data | **selesai** | migrasi `053` langkah 3–4; drift 16 kolom kini **0** |
> | P0-4 ASJ00222 | **belum** | butuh keputusan pemilik: WA yang benar tidak bisa ditebak |
> | P0-5 hapus baris uji | **tidak dilakukan** | baris uji hanya ada di proyek Supabase lama, bukan produksi |
> | P1-6…9 template | **sebagian** | `e66817b` (specs, clearCells, label menang, sheet); record lama ditolak `256fbfc` |
> | P2-10 `SYNC_SELECT.master` | **selesai** | `685880a`; gerbang skema terbukti gagal pada daftar lama |
> | P2-11 `localFirst` | **belum** | perlu keputusan: sambungkan atau hapus |
> | P3-13…15 | **sebagian** | `95989b7` (jft nilai vs URL) |

### P0 — salah cetak / data hilang (kerjakan dulu)

1. **`data.ts:101`** — tambahkan `medis.alergi_id`:
   `alergi: v('ALERGI', 'medis.alergi_id', 'medis.alergi')`.
   Uji yang bisa gagal: baca `master.alergi` terisi → `normalizeMasterData(buildMasterNested(row)).medis.alergi`
   harus sama dengan nilai DB, bukan `'-'`.

2. **Trigger cermin** — ganti `041` dengan versi yang:
   - menyalin nilai kosong juga (`NEW.x`, bukan `COALESCE(NULLIF(...), d.x)`), supaya
     penghapusan di master benar-benar sampai ke salinan;
   - menormalkan `no_wa` di kedua sisi sebelum menggabung (atau menggabung lewat
     `id_kandidat` yang unik di kedua tabel);
   - menaikkan `d.updated_at = now()`;
   - punya jalur untuk baris salinan yang belum ada (atau, lebih aman: aplikasi yang wajib
     membuat baris salinan saat master pertama kali ditulis).

3. **Rekonsiliasi 311 sel** dengan migrasi idempoten yang arahnya eksplisit per kolom —
   untuk `tb/bb/usia/tempat_lahir/tgl_lahir` arahnya master → salinan; untuk
   `gender/nik` arahnya salinan → master (mengikuti `045`). Tanpa memperbaiki (2) lebih
   dulu, migrasi ini akan mengulang kesalahan yang sama.

4. **ASJ00222** — perbaiki `master.no_wa` menjadi bentuk kanonik, dan tambahkan penjaga di
   `upsertMaster` supaya WA non-kanonik ditolak sebelum masuk.

5. **Hapus 5 baris master sisa uji** (`E2E…` ×2, `DIAG…` ×2, `SISWA-…`) dan 1 baris
   `id_kandidat = null`. Mereka mengotori hitungan watermark dan audit berikutnya.

### P1 — template

6. **Tolak template yang berkasnya masih berisi identitas contoh.** Saat simpan, periksa
   apakah `fieldMap` menutupi sel-sel identitas (nama, tgl lahir, foto) — kalau tidak,
   tolak dengan pesan yang menyebut sel mana yang belum dipetakan. Penjaga sekarang hanya
   menolak peta kosong.

7. **Kosongkan seluruh area nilai, bukan hanya sel yang dipetakan.** Simpan daftar
   `valueCells` hasil analisa (semua sel di dalam merge nilai, bukan hanya kiri-atasnya),
   lalu sapu semuanya di `applyFieldMap`. Tanpa ini, data contoh akan selalu ikut tercetak.

8. **`applyFieldMap` harus menghormati sheet.** Simpan `sheet` per alamat (atau petakan
   alamat → sheet saat analisa), seperti `RiwayatBlock` sudah melakukannya.

9. **Ikat record template ke versi peta field.** Tambahkan `fieldMapVersion` (atau
   `schemaFingerprint`) dan tolak saat muat kalau versinya berbeda; validasi setiap path
   terhadap daftar path yang dikenal `data.ts` saat **simpan**, bukan saat pakai.

### P2 — lapisan sync

10. **`SYNC_SELECT.master`** — ganti tiga kolom yang tidak ada dengan yang benar, dan
    tambahkan gerbang yang memastikan setiap nama di `SYNC_SELECT` ada di `TABLE_COLUMNS`.
    Gerbang ini bisa gagal (dan memang akan gagal hari ini), jadi ia layak ditulis.

11. **Putuskan nasib `localFirst`**: sambungkan (maka `SYNC_SELECT` wajib benar dulu) atau
    hapus beserta `syncTransport`, `localStore`, `contexts/sync`, dan surface-nya. Kode mati
    yang terlihat seperti solusi lebih berbahaya daripada tidak ada kode.

12. **`CandidateProfileModal`** — jangan pakai `seed` sebagai kebenaran final; setelah
    `candidates-changed`, paksa satu pembacaan ulang (atau bandingkan `updated_at` seed
    dengan yang baru).

### P3 — kebersihan

13. `getMasterDataByWa` (bentuk datar) tanpa pemanggil dan punya pemetaan salah
    (`LAMA_DI_JEPANG`). Hapus atau perbaiki sebelum dipakai.
14. `loadCandidatesUnik` tidak melakukan dedupe apa pun meskipun namanya begitu. Hari ini
    aman karena `idx_cand_no_wa_uniq`, tetapi `findCandidateByWaFiltered`
    (`db/candidates.ts:262`) memakai `limit: 5` **tanpa `ORDER BY`** — kalau constraint itu
    hilang, baris mana yang diedit menjadi tidak deterministik.
15. Komentar "169 kolom" di beberapa tempat sudah basi; terukur **282**.

---

## 8. Cara mereproduksi angka di dokumen ini

Semua hanya baca. Tidak ada `PATCH`/`POST`.

```bash
# 1. drift 16 kolom (311 sel)
node -e '…'   # lihat blok probe di sesi 2026-11-12; select 16 kolom dari kedua tabel,
              # gabung pada no_wa yang dinormalkan, hitung sel yang berbeda

# 2. delta master yang gagal
curl -s "$SUPABASE_URL/rest/v1/master_database_candidate?select=id_kandidat,nama_lengkap,\
no_wa,gender,tb,bb,email,status_proses,tahapan,id_loker,updated_at&limit=1" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
# -> 400 42703 column … status_proses does not exist

# 3. template yang tersimpan
curl -s "$SUPABASE_URL/rest/v1/sys_config?select=config_value&config_type=eq.cv_template" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
# -> fieldMap 11 sel, semuanya identitas.tempat_lahir; riwayat {}
```

---

## 9. Satu hal yang perlu diputuskan pemilik

Trigger 041 dibuat dengan aturan **"master yang kosong tidak menimpa salinan"** — alasannya
waktu itu: nilai yang hanya ada di salinan (unggahan lama lewat jalur dokumen) tidak boleh
hilang. Aturan itu benar untuk **data lama**, tetapi salah untuk **penghapusan yang
disengaja**: hari ini tidak ada cara menghapus sebuah nilai dari kedua tabel sekaligus.

Pilihannya:

- **A. Master menang mutlak.** Kosong di master = kosong di salinan. Konsisten, dan
  penghapusan berfungsi. Risiko: nilai yang hanya ada di salinan hilang saat master
  berikutnya disentuh.
- **B. Master menang, kecuali field berkas.** `pas_photo`/`file_cv`/`jft_url`/`ssw_url`
  tetap "isi saja" (karena unggahan lama hanya ada di salinan), field identitas menang
  mutlak. Ini yang paling dekat dengan maksud komentar 041, dan yang saya sarankan.

**Keputusan yang diambil di migrasi `053` (2026-11-12):** bukan A, bukan B, melainkan
**"cerminkan hanya kolom yang benar-benar berubah di tulisan itu"** (`IS DISTINCT FROM OLD`).

| Kejadian | Perilaku |
|---|---|
| admin mengosongkan TB di master | kolom `tb` berubah ⇒ salinan ikut kosong |
| master menulis `ai_data_json` saja | `tb` tidak berubah ⇒ salinan TIDAK disentuh |
| unggahan lama hanya ada di salinan | tidak ada tulisan master ke kolom itu ⇒ nilai bertahan |

Jadi penghapusan berfungsi (cacat utama 041 hilang) tanpa menghapus nilai yang hanya hidup
di salinan pada setiap tulisan yang tidak ada hubungannya. `nama_lengkap` dan `id_kandidat`
tetap tidak pernah dikosongkan — keduanya identitas baris.

---

## 10. Catatan operasional: dua database, dan yang salah ada di `.env`

Ini bukan temuan kode, tetapi penyebab audit yang saling bertentangan — termasuk draf
pertama dokumen ini.

| Berkas | Menunjuk | Dipakai oleh |
|---|---|---|
| `.env` | `gdwvffmevwtwnzrapjwy.supabase.co` (Supabase lama) | **tidak ada** — ledger berhenti di migrasi `016` |
| `.env.local` | `ep-bold-sunset-…neon.tech` | perkakas repo (`load-env.mjs`: `.env.local` > `.env`) |
| `env-kunci/PRODUCTION.env` | idem (Neon) | acuan produksi |

Urutan di `scripts/lib/load-env.mjs` menyelamatkan perkakas repo: `['.env.local',
'.env.lokal', '.env']` dan `process.env` menang. Tetapi **probe/audit yang membaca `.env`
langsung** akan mengukur proyek Supabase lama tanpa peringatan apa pun — persis yang
menghasilkan angka 311 sel di draf pertama dokumen ini.

Aturan untuk probe berikutnya:

1. Selalu cetak **host** database yang diukur (satu baris) sebelum menyimpulkan apa pun.
2. Baca `.env.local` atau `env-kunci/PRODUCTION.env`, jangan `.env`.
3. Kalau ledger `schema_migrations` tidak memuat migrasi terbaru, itu bukan "belum
   dimigrasi" — kemungkinan besar itu database yang salah.

Perkakas probe yang dipakai untuk dokumen ini (baca-saja, mencetak host):

```
node deliverables/_drift-probe.mjs            # default env-kunci/PRODUCTION.env
node deliverables/_diag-053.mjs               # diagnosa trigger & join
```
