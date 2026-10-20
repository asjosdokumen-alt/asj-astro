# Index ketat + delta-sync lokal — laporan terukur & rencana

Tanggal: 2026-10-20 · Cabang: `main` · Fix pertama: `30cae10`
Objek: DB Neon (baru) — `job_database` (159 baris), `database_candidate` (226),
`master_database_candidate` (234), `database_asj_form` (51).

> Semua angka di bawah DIUKUR, tidak disurvey: langsung ke Neon lewat `pg`
> (schema, row count, byte JSON) dan ke REST PostgREST lama untuk membuktikan
> perilaku query. Metode lengkap ada di §2.

---

## 1. Ringkasan keputusan

| Pertanyaan | Jawaban terukur |
|---|---|
| "Admin masak selalu tarik data full sih" | **Benar, tapi bukan di tempat yang diduga.** Yang menarik full ada tiga: (a) fallback `findMasterByWa` menarik 500 baris × 169 kolom **tanpa filter**; (b) `fetchAllKandidat` menarik SEMUA kandidat lewat loop halaman; (c) `getAppData` admin menarik 500 baris form + base + 50 kandidat sekaligus. |
| Index sudah ketat? | **Sudah 90%.** Yang bolong hanya untuk delta-sync: `master_database_candidate` tidak punya index `updated_at`, dan `job_database` **tidak punya kolom waktu sama sekali**. |
| Delta-sync bisa langsung? | **Belum untuk `job_database`** — tidak ada `updated_at`, jadi "ambil yang berubah saja" mustahil tanpa migrasi kolom. Untuk kandidat/master/form: kolomnya ada, indexnya kurang satu. |
| Sudah ada cache lokal? | **Ada, tapi lemah.** sessionStorage TTL **30 detik**, dan **di-hapus total setiap ada aksi tulis**. Itulah sebabnya terasa "selalu tarik full": setiap 30 detik (dan setiap tulis) semuanya ditarik ulang. |

**Yang sudah dikerjakan di commit `30cae10`** (tanpa sentuh DB, tanpa ubah perilaku):
fallback `findMasterByWa` yang menembak 1,35 MB/permintaan → query bertarget
`in.(<628…>,<0…>)` + `limit: 10`, dilayani index unik `no_wa`. Tes memaku
"setiap permintaan wajib ber-filter".

**Yang menunggu keputusan (§6):** migrasi DB (kolom `updated_at` untuk job,
index `updated_at` untuk master/form) dan perbaikan bug `ai_data_json` (§5).

---

## 2. Angka terukur (metode: query langsung ke Neon + REST)

### 2.1 Biaya satu permintaan admin sekarang (byte JSON, belum termasuk HTTP)

| Pola baca | Baris | Byte | Keterangan |
|---|---|---|---|
| `findAllCandidatesLight` (scan penuh ringan) | 226 | **77,1 KB** | Jalan di **setiap** permintaan halaman kandidat, sebelum filter/potong halaman |
| `findCandidatesByIds` (CAND_MAP × 200) | 200 | **190,9 KB** | Baris PENUH 32 kolom untuk satu halaman |
| master ringan × 200 (`attachBerkasBio`) | 200 | **111,3 KB** | |
| form ringan × 500 (`findFormsLight`) | 500 | **29,8 KB** | |
| jobs semua (`loadPublicBase`) | 159 | **91,8 KB** | |
| **master PENUH × 500 — fallback lama** | 500 | **1.381,1 KB** | ← yang baru diperbaiki `30cae10` |
| **TOTAL satu `getCandidatesPage`** | | **± 409 KB** | 77 + 191 + 111 + 30 |

Akibatnya: `fetchAllKandidat` (226 kandidat = 2 halaman × 200) = **± 818 KB**
per tarikan penuh, dan TTL-nya 30 detik. Admin duduk 10 menit di tab kandidat
≈ 20 penyegaran ≈ **± 8 MB** — dari satu tab, satu orang, sepuluh menit.

`AdminJobEditModal` menarik `getAppData` mode admin (**± 530 KB**) hanya untuk
membaca `dropdowns`.

### 2.2 Biaya pola delta (watermark + probe)

| Pola | Byte |
|---|---|
| Probe: `count` + `max(updated_at)` untuk 4 tabel | **210 B** |
| Delta saat tidak ada yang berubah | ± 20 B |
| Delta setelah 1 jam kerja admin (beberapa baris) | beberapa KB |

**Steady-state refresh turun dari ± 409 KB jadi < 1 KB** kalau tidak ada yang
berubah. Tarikan pertama tetap sebesar penuh — delta hanya menghapus
PENGULANGAN, dan itulah yang membakar kuota.

### 2.3 Kenapa ini penting secara kuota

Neon Free = **5 GB egress/project/bulan**, storage 1 GB/project (dokumen resmi
`neon.com/docs/introduction/plans`). DB sekarang hanya 11 MB — masalahnya BUKAN
ukuran, tapi **laju tarik**. Pola sekarang: beberapa admin aktif menabrak
1–3 GB/bulan. Pola delta: tarikan pertama + edit nyata ≈ belasan MB/bulan.

---

## 3. Index: inventaris terukur & yang bolong

Diukur langsung (`pg_index` + `pg_stat_user_indexes`). Catatan jujur: `idx_scan`
hampir semua 0 karena statistik Neon baru (~2 jam) — **jangan pakai itu untuk
menyimpulkan "index tak terpakai"**.

**Yang sudah ada (dan pas):**

| Tabel | Index | Melayani |
|---|---|---|
| `database_candidate` | unik `no_wa` | lookup kandidat per WA |
| | `updated_at DESC` | urutan daftar admin |
| | `id_loker_pilihan`, `tahapan_seleksi` | filter dropdown |
| | unik `(id_kandidat, id_loker_pilihan)` | invariant |
| `master_database_candidate` | unik `no_wa`, unik `id_kandidat`, `nik` | lookup & upsert |
| `job_database` | PK `code_job` | lookup job |
| `database_asj_form` | unik `(no_wa, code_job)`, `code_job`, `timestamp DESC` | inbox |

**Yang bolong untuk desain baru:**

1. `master_database_candidate` **tidak punya index `updated_at`** → delta
   `WHERE updated_at > ?` jadi seq scan (masih murah di 234 baris, tapi bolong
   sebagai janji arsitektur).
2. `job_database` **tidak punya kolom waktu sama sekali** (17 kolom:
   `code_job…dokumen_share`). Terukur & tercatat 2026-10-09: urutan job
   dihitung di JS dari angka pada kode karena `order=code_job.desc` adalah
   urutan string ('TG99ASJ' > 'TG100ASJ'). Delta-sync job **mustahil** sebelum
   ada kolom + index-nya.
3. `database_asj_form` tidak punya index `updated_at` (ada `timestamp`).

Prinsip index yang dipakai (referensi §7): satu index komposit yang URUTANNYA
sama dengan urutan filter+sort query nyata jauh lebih berguna daripada tiga
index satu-kolom yang tidak pernah dipakai bersama.

---

## 4. Rencana delta-sync lokal (arsitektur)

Pola yang direkomendasikan adalah pola replikasi standar (WatermelonDB/RxDB):
**probe murah dulu, tarik delta hanya kalau probe bilang ada perubahan.**

### 4.1 Alur

```
[IndexedDB lokal]                [Netlify function]              [Neon]
     |                                |                            |
 1. render dari lokal (instan)        |                            |
     |--- probe: {n, max(updated_at)} -> |--- 4x count+max --------> |
     |                                |<- {n, mx} (210 B)          |
 2. bandingkan dgn watermark lokal    |                            |
     |-- SAMA --> selesai. 0 tarikan. |                            |
     |-- BEDA --> minta delta:        |                            |
     |    updated_at > watermark ---> |--- WHERE updated_at > ? --> |
     |                                |<- hanya baris berubah      |
 3. merge ke lokal, render ulang      |                            |
```

### 4.2 Empat keputusan desain (dan alasannya)

1. **Probe = satu angka, bukan "tarik lalu bandingkan".** `count` +
   `max(updated_at)` per tabel (± 210 B untuk 4 tabel). Kalau sama dengan
   lokal, TIDAK ada tarikan sama sekali. Ini yang membuat "hemat" benar-benar
   hemat, bukan sekadar "lebih kecil".
2. **Hapus TTL 30 detik, ganti dengan watermark.** sessionStorage sekarang
   memaksa tarik ulang penuh tiap 30 detik dan menghapus SEMUA cache setiap
   aksi tulis. Watermark tidak kedaluwarsa — data lokal dianggap benar sampai
   probe membuktikan sebaliknya.
3. **Penghapusan butuh probe `count`.** Watermark `updated_at > x` tidak bisa
   melihat baris yang DIHAPUS (tidak ada jejak). Karena itu probe membawa
   `count`: kalau jumlah turun padahal watermark sama, baru tarik penuh sekali.
4. **Pemisahan: "judul/data" ringan vs berat.** Kandidat hanya perlu
   `CAND_LIGHT_COLS` untuk daftar; baris penuh (`CAND_MAP_COLS`) ditarik saat
   admin membuka SATU kandidat. Ini sudah terjadi di server; tinggal dipindah
   ke lokal dengan pola yang sama.

### 4.3 Yang TIDAK akan berubah

- Semua aksi tulis tetap lewat server (tidak ada tulis langsung dari browser
  ke DB — jaga penjaga IDOR & `catatan_internal`).
- Setelah tulis, klien memanggil probe (bukan tarik penuh) supaya watermark
  naik; delta berikutnya membawa baris yang baru ditulis.
- `getAppData` publik/anonym sudah dibantu CDN (`s-maxage=60`); delta hanya
  untuk panel admin & kandidat.

---

## 5. Temuan bug: `ai_data_json` text → empat field `ai_*` SENYAP jadi null

Ini saya temukan saat mengukur, dan itu **bug nyata di jalur "biodata"**, bukan
teori.

**Fakta terukur:**
- Kolom `master_database_candidate.ai_data_json` bertipe **`text`** (dua tabel
  lain — `ai_form_submissions`, `database_asj_form` — sudah `jsonb`).
- `MASTER_LIGHT_COLS` memakai `ai_gender:ai_data_json->identitas->gender` dan
  tiga serupa. Diuji langsung ke REST: **HTTP 200, tapi nilainya `null`** —
  padahal baris itu MEMANG punya `{"identitas":{"gender":"Laki-laki","umur":"19"}}`.
  PostgREST tidak bisa meng-cast `text` di dalam `select` (diuji juga:
  `::jsonb` → 400 PGRST100).
- **55 dari 234 baris** punya `identitas.gender`/`umur` yang seharusnya terbaca.
- `berkas.ts:71` sendiri mencatat "21 kandidat punya gender HANYA di
  `ai_data_json`" — ambangnya dipasang untuk memperbaiki hal yang ternyata
  TETAP rusak sampai sekarang.
- `projections.test.ts` tidak bisa menangkapnya: tes hanya memeriksa kolom
  DASAR (`ai_data_json` memang ada), tidak memeriksa tipe/operator.

**Akibat:** `bio.usia/tb/bb/gender` kandidat tetap kosong lewat jalur AI padahal
datanya ada — di dashboard kandidat, prefill form, dan unduhan biodata.

**Tiga opsi perbaikan (butuh keputusan, §6):**

| Opsi | Cara | Risiko |
|---|---|---|
| A. RPC Postgres | satu fungsi `master_light(wa[])` dengan cast `::jsonb` di dalam SQL | kontrak tulis/read TIDAK berubah; tambah satu surface RPC |
| B. Kolom generated | `ALTER TABLE ADD COLUMN ai_identitas jsonb GENERATED Always AS (ai_data_json::jsonb->'identitas') STORED` | rewrite tabel singkat (234 baris — murah); `schema.generated.ts` harus di-regenerate |
| C. Ubah tipe kolom | `ALTER COLUMN ai_data_json TYPE jsonb USING ai_data_json::jsonb` | **paling berbahaya**: 8+ call site menulis `JSON.stringify(...)` dan membaca `typeof raw === 'string'` → data bisa tersimpan sebagai JSON-string, dan pembaca lama jadi buta |

Rekomendasi: **A** (paling tidak invasif) — dengan B sebagai cadangan kalau
nanti butuh index atas path JSON-nya.

---

## 6. Yang perlu keputusan sebelum saya lanjut

Tiga bagian berikut menyentuh **DB produksi langsung**, jadi saya minta
keputusan dulu (semua migrasi lewat `migrations/` + `scripts/migrate.mjs`,
bukan ketik manual di konsol):

1. **Migrasi `017` — kesiapan delta (aman, additive):**
   - `ALTER TABLE job_database ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()` + trigger `set_updated_at()` supaya setiap PATCH/POST menyegarkan;
   - `CREATE INDEX idx_master_updated_at ON master_database_candidate(updated_at)`;
   - `CREATE INDEX idx_form_updated_at ON database_asj_form(updated_at)`.
   _Bonus_: `updated_at` pada `job_database` sekaligus menyelesaikan masalah
   urutan job yang sekarang dihitung di JS (tercatat 2026-10-09).
   ⚠ Satu hal yang PERLU diperhatikan: `updated_at` baru pada job_database
   akan membuat SEMUA 159 job tampak "baru" pada delta pertama — tidak apa-apa
   (sekali tarik), tapi jangan kaget.

2. **Bug `ai_data_json` (§5): pilih A / B / C.** Rekomendasi A (RPC).

3. **Lanjut ke implementasi delta lengkap?** (endpoint probe+delta, IndexedDB
   lokal, `fetchAllKandidat`/`fetchKandidatFromAPI`/`getAppData` dialihkan ke
   watermark). Ini bagian terbesar; estimasi: 4–5 berkas backend + 3–4 berkas
   frontend + tes. Tidak ada push ke `main` tanpa perintah.

---

## 7. Referensi (dari web, seperti diminta)

1. **Kuota Neon resmi** — `neon.com/docs/introduction/plans`: Free = 5 GB
   egress/project/bulan, 1 GB storage/project; paid = 500 GB lalu $0,10/GB.
   Ini angka yang membuat "hemat egress" layak diperjuangkan.
2. **PostgREST pagination & count** — `postgrest.org …/api/pagination_count.html`:
   `Prefer: count=exact|planned|estimated` + `Content-Range` → cara membuat
   "probe murah" (count + max) tanpa menarik baris.
3. **Pelajaran index komposit** — HackerNoon, *"How I Engineered a 1.7M Row
   Product Safety Database…"*: "single-column indexes are mostly theater" —
   yang menentukan adalah satu komposit yang URUTANNYA sama dengan
   `WHERE … ORDER BY … LIMIT` query nyata; serta jangan `count(*)` di jalur
   request. Persis prinsip §3 dan §4.
4. **Pola replikasi lokal-first** — RxDB & WatermelonDB ("pull changes since
   checkpoint" + penanganan baris terhapus). Pola probe+watermark+count di §4
   adalah versi ringkasnya; keduanya juga memperlakukan checkpoint sebagai
   sumber kebenaran sampai dibuktikan basi.
5. **Konteks repo sendiri** — `projections.ts` (proyeksi kolom),
   `kernel/cache.ts` (L1 per-proses + generation), `adminStore.ts:246`
   (TTL 30 s & paginasi 200), `catalog/repository.ts:231`
   (`loadCandidatesUnik` + cache 25 s). Semua sudah ada dan dipakai — rencana
   ini menyambung ke sana, tidak mengganti.

---

## 8. Cara memverifikasi klaim di dokumen ini

Semua angka bisa diulang:

- Byte JSON per pola baca: `pg` langsung ke Neon, `to_jsonb` atas daftar kolom
  yang SAMA dengan yang dikirim kode (probe kerja ada di `F:/tmp/dbprobe/`).
- Perilaku `ai_data_json`: satu `fetch` ke `/rest/v1/master_database_candidate`
  dengan `select=…ai_gender:ai_data_json->identitas->gender` → 200 + `null`.
- Format WA tersimpan: `select count(*) … where no_wa ~ '^628[0-9]{9,12}$'`
  → 233/234.
- Index: `pg_index` + `pg_get_indexdef`.
- Fallback yang sudah diperbaiki: `npx vitest run netlify/functions/contexts/master-data/repository.test.ts` (6 tes).

_Artefak kerja (dump PII, probe) sengaja TIDAK masuk repo._
