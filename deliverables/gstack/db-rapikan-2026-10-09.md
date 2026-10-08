# Rapikan "UMUM" + scan database (2026-10-09)

Koreksi pemilik: **tidak ada kategori "UMUM"**. Kode job yang sah hanya
`TG<n>ASJ` (Tokutei Ginou) dan `GJ<n>ASJ` (Magang). Yang dirapikan: penulis
sentinel itu di kode, datanya di **DB cadangan**, bekas tes, dan data ganda.

⛔ **Yang live (`gdwvffmevwtwnzrapjwy`) tidak disentuh sama sekali.** Semua
operasi di bawah dijalankan ke DB yang `.env` tunjuk (cadangan), dengan dump
lebih dulu ke `F:/tmp/db-scan/backup-2026-10-08T23-44-12-226Z.json`.

## 1. Kode — dua penulis sentinel 'UMUM' dihapus

| tempat | sebelum | sesudah |
|---|---|---|
| `InputManualModal.tsx:118` | `loker.trim() \|\| 'UMUM'` | `loker.trim()` |
| `_lib/ai/chat.ts:869` | `job_code: 'UMUM'` | `job_code: ''` |
| i18n (2 kamus) | `admin.ph_umum_kode` = "UMUM atau Ketik Kode" | `admin.ph_kode_job` = "Contoh: TG591ASJ atau GJ12ASJ" |

Placeholder-nya ikut diganti karena yang menyebut "UMUM" justru mengajarkan
kategori yang tidak ada.

## 2. Data di DB cadangan

| tindakan | jumlah | keterangan |
|---|---|---|
| `database_asj_form.code_job` 'UMUM' → `''` | **12 baris** | dari 21 baris; semuanya kandidat nyata berstatus LULUS |
| hapus baris ganda `ai_form_submissions` | **1 baris** | wa `6282130442661` punya DUA baris `ai_form`: id=1 (2026-08-05) & id=2 (2026-08-06). Disimpan **yang terbaru** (id=2, AGUS KHOCI) |
| hapus bekas tes `ai_form_submissions` | **1 baris** | id=54 "E2E Parse Check", `submitted_via=interview` |
| **sesudah** | | `'UMUM'` = **0** di kedua tabel; baris wa itu tinggal 1 |

Kenapa "simpan yang terbaru" bukan "simpan yang pertama": kode produksi
mencari baris ini dengan `.find()` **tanpa urutan**, jadi selama ini yang
terbaca itu kebetulan urutan tabel — bukan yang terbaru.

## 3. Hasil scan — yang masih belum rapi (BELUM saya ubah)

**a. `GJ` = 0 dari 158 job.** Semua kode `TG…`; tidak ada satu pun `GJ…`.
Sebabnya `jobCodePrefix()` hanya mengembalikan `GJ` bila `kategori` **persis**
`'magang'`, dan **tidak ada satu baris pun** yang kategorinya `magang`:

```
kategori: 15 nilai unik untuk 158 baris
  "🌾 PERTANIAN":22  "🍱 P. MAKANAN":55  "🧑⚕️ Kaigo":27  "👵 KAIGO":22
  "🐄 PETERNAKAN":9  "🐷 PETERNAKAN":1  "🏭 MANUFAKTUR":2  "🛠️MANUFAKTUR":3
  "🧹 B.CLEANING":6  "🚛 DRIVER":3  "AKULTURAL":1  "👷 KONSTRUKSI":1
  "🏨 PERHOTELAN":4  "自 動 OTOMOTIF":1  "🐟 AKUAKULTUR":1
```

Kategori yang **sebetulnya sama** tapi beda tulisan: PETERNAKAN (2 varian),
KAIGO (2 varian), MANUFAKTUR (3 varian). Selama kategori ditulis bebas seperti
ini, cabang `GJ` tidak akan pernah terpakai — jadi "magang khusus VIP" tidak
bisa dibuat lewat jalur normal. **Ini keputusan Anda**: mana tulisan yang
menang, dan apakah magang ditandai lewat kategori (sekarang) atau lewat kolom
lain.

**b. Bekas tes di daftar kandidat.** `database_candidate` id=586
`"UJI E2E BUKA"` wa `6285700000999` status `BARU` — belum saya hapus (menghapus
baris kandidat paling berisiko, jadi saya tanya dulu).

**c. Yang sudah bersih:** `job_database` 158 baris — **0** kode tidak sesuai
`^(TG|GJ)\d+ASJ$`; `database_candidate` 226 baris — **0** no_wa ganda, **0**
no_wa tidak baku (semua `62…`).

## 4. Bug yang ketemu saat memeriksa pipeline (BELUM diperbaiki)

Tombol per-baris di tab Mail (**Lulus / Review / Gagal**) mengirim **`m.id`**
(`TabMail.tsx:259-266` → `act(action, m.id ?? m.wa)`), sementara backend
memperlakukannya sebagai **index posisi**:

```
findFormByIndexFiltered(idx)  →  GET database_asj_form?order=timestamp.desc&limit=1&offset=<idx>
handleFormStatus(rowIndex)    →  Number.isInteger(rowIndex) wajib true
```

Akibatnya, di DB cadangan (21 baris) tombol itu berhenti di
**"Form tidak ditemukan."** — dan di DB yang lebih besar bahayanya lebih
serius: `id` = 144 dipakai sebagai `offset=144`, jadi yang di-approve bisa
**baris kandidat yang lain**.

Jalur massal (`deleteSelected`) punya ketidakcocokan serupa: ia mengirim index
di dalam daftar **`filtered`**, sedangkan backend meng-offset daftar **penuh** —
begitu ada filter status aktif, indexnya bergeser.

Saya belum memperbaikinya karena arah perbaikannya mengubah perilaku
approve/reject/hapus, dan Anda yang tahu kontrak legacy-nya:

- **A.** Frontend mengirim index di daftar PENUH (backend tidak berubah), atau
- **B.** Backend menerima `id` (frontend tidak berubah) — lebih kokoh, tapi
  `handleFormStatus`/`deleteForm` ikut berubah.
