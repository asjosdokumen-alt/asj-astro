# Sisir anomali nilai — 2026-10-12

Permintaan pemilik (verbatim):

> `:00:00.000Z` tolong hapus ini kesalahan data itu harus nya murni tgl saja.
> golongan darah sekarang tolong perbanyak kategorinya jgn a b ab o tambahin +
> nya juga. check lagi yg lain bila masih ada yg aneh apa saja sekalian di
> benerin juga

Tiga bagian. Bagian 1 & 2 **selesai dan ter-commit**. Bagian 3 menemukan satu
cacat **kode** (sudah diperbaiki) dan satu kelompok cacat **data** yang butuh
keputusan pemilik sebelum dijalankan.

| # | Permintaan | Status | Commit |
|---|-----------|--------|--------|
| 1 | Hapus `:00:00.000Z`, tanggal murni | ✅ selesai | `9eb81c8` |
| 2 | Golongan darah: tambah varian `+` | ✅ selesai | `c383929` |
| 3a | "yg lain yg aneh" — cacat KODE | ✅ selesai | `2dbcb44` + `c383929` |
| 3b | "sekalian di benerin" — 132 nilai DATA | ⏸ butuh keputusan | — |

**Tidak ada yang di-push** (R19: satu push = satu deploy berbayar).

---

## 1. Tanggal — cap waktu ISO dihapus

`timestamptz` menyimpan tengah malam WIB sebagai UTC, jadi `2008-04-05` tersimpan
`2008-04-04T17:00:00.000Z` — cap waktu itu **salah dua kali**: tidak terbaca, dan
harinya mundur satu. Bentuk `dd-mm-yyyy` juga salah untuk `<input type="date">`
(yang hanya menerima `yyyy-mm-dd`), sebab itu tanggal lahir tampil KOSONG di
modal Edit kandidat.

Diukur atas DB live (`gdwvffmevwtwnzrapjwy`) — satu kolom, tiga bentuk sekaligus:

| kolom | ISO | `yyyy-mm-dd` | `dd-mm-yyyy` |
|---|---|---|---|
| `master_database_candidate.tgl_lahir` | 65 | 26 | 1 |
| `database_candidate.tgl_lahir` | 53 | 34 | 5 |
| `database_asj_form.tgl_lahir` | 4 | 7 | — |

Satu implementasi di dua batas: `toDateOnly()` (`_lib/db/client.ts`) dipakai di
`mapCandidate`, `buildMasterNested`, `handleGetMasterDataByWa` dan
`attachBerkasBio` (sisi baca); `writeBodyFor()` menutup sisi tulis — ada ENAM
titik tulis `tgl_lahir` saja, jadi menjaganya satu per satu = enam kesempatan
untuk lupa. Cap waktu MESIN (`created_at`, `updated_at`, `tanggal_daftar`)
sengaja TIDAK dikoersi: jamnya nyata di sana.

**Hasil**: probe atas kode yang benar-benar dikirim → cap waktu ISO tersisa **0**
di keempat permukaan.

---

## 2. Golongan darah — kategori diperbanyak

Daftar form hanya `A/B/AB/O`, datanya sudah memuat varian ber-Rh:

| nilai | jumlah |
|---|---|
| null | 210 |
| `O` | 10 |
| `B` | 4 |
| `-` | 4 |
| `A` | 2 |
| `O+` / `A+` / `B+` | 1 / 1 / 1 |
| **`AB +`** | **1** (ASJ00171 — ada SPASI) |

Dua akibat: `+`/`-` tidak bisa dipilih sama sekali, dan `AB +` tidak cocok dengan
opsi mana pun. Daftar kini **13 entri** (12 varian ABO×Rh + `-`). Empat nilai
polos DIPERTAHANKAN — 16 baris nyata menyimpannya.

`golonganDarahDisplay()` menggantikan `gd + " 型"` di rirekisho, yang dulu
mencetak `O+ 型` (terbaca "golongan O+") dan `' 型'` menggantung saat nilainya `-`.

---

## 3a. "Yg lain yg aneh" — cacat KODE (sudah diperbaiki)

Diukur: **132 nilai tersimpan ada di luar daftar opsi form mana pun**. Akarnya
bukan datanya, melainkan **kosakata yang sama disalin ke dua tempat** — dan kedua
salinan itu sudah berbeda:

| | form Master (lama) | daftar CV AI |
|---|---|---|
| agama | `ISLAM, KRISTEN, HINDU, **BUDHA**, **KATHOLIK**` | `… **BUDDHA**, **KATOLIK**, KONGHUCU, LAINNYA` |

> ⚠️ **KOREKSI — angka yang salah, dan tidak akan saya ulangi.**
> Draf pertama laporan ini (dan komit `2dbcb44`) menulis *"⇒ yang tersimpan:
> `BUDHA`×3, `KATHOLIK`×1"*. **Itu tidak pernah diukur dan SALAH.** Diukur ulang
> langsung ke DB live (`master_database_candidate`, 2026-10-12):
>
> | kolom | nilai nyata |
> |---|---|
> | `agama` | `"ISLAM"`×20 · `"Islam"`×3 · `"ISLAM "`×1 |
> | `religion` | `"ISLAM"`×1 |
> | `agama_jp` | `"イスラム教"`×9 · `"イスラーム"`×1 · `"イスラム"`×1 |
>
> **0 baris** ber-ejaan `BUDHA` maupun `KATHOLIK`. Jadi drift-nya nyata **di
> sumber** (masih terlihat di `git show 2dbcb44^`), tetapi **belum pernah
> tertulis ke tabel**.
>
> Bukti bahwa bahayanya sudah diketahui adalah tambalan yang sudah ada di repo:
> `AGAMA_JP` di `cv-template-factory/renderers/rirekisho-xlsx.ts:112-122`
> memuat **kedua** ejaan (`BUDHA: '仏教', BUDDHA: '仏教'`), dan `agamaLabel()`
> di sana melakukan `.toUpperCase().trim()`. Seseorang pernah menemui salah
> ejaan itu dan menambal **renderer**-nya, bukan form-nya.
>
> Angka "119 nilai / 12 kolom" yang juga muncul di draf pertama berasal dari
> pengukuran sesi sebelumnya, bukan pengukuran saya; angka yang benar adalah
> **132 nilai / 17 kolom** (bagian 3b).

Drift yang **memang** ada di datanya adalah beda huruf besar/kecil dan spasi
(`"Islam"`, `"ISLAM "`) — dan itulah yang `.toUpperCase().trim()` di renderer
serap diam-diam, sebab itu tidak ada yang pernah melihatnya.

**Perbaikan** (`2dbcb44`): tujuh daftar pindah ke `opsi-form.ts` sebagai pemilik
tunggal. Form Master memakai `valuesOf(...)` — **NILAI saja**, tanpa label kanji,
karena form itu diisi staf dan berlabel Indonesia (menyerahkan `GENDER_PAIRS`
mentah akan mencetak `男性` sebagai teks opsi di sana).

Satu cacat kode lain, kelas yang sama dengan `AB +` (`c383929`): **spasi di tepi**.

| kolom | nilai nyata |
|---|---|
| `agama` | `"ISLAM "` ×1 |
| `status_pernikahan` | `"BELUM MENIKAH "` ×1 |
| `status_eks_jepang` | `"BELUM "` ×2 |
| `minum_alkohol` | `"TIDAK "` ×1 |

`"ISLAM "` bukan `"ISLAM"` — tidak cocok dengan `<option>` mana pun. Diperbaiki
di `writeBodyFor` yang sama (`MASTER_ENUM_COERCERS`), dengan doktrin lama: koersi
HANYA kolom yang terbukti perlu, jadi teks bebas (`promosi_diri`) tidak pernah
dipangkas diam-diam.

---

## 3b. "Sekalian di benerin" — 132 nilai DATA (belum dijalankan)

**Semua dropdown AMAN.** `F` (`MasterFullForm`) dan `PairSelect` (`AiCvForm`)
keduanya mempertahankan nilai tak dikenal sebagai opsi sendiri, jadi **tidak ada
`<select>` yang tampil kosong**. Yang tersisa murni kualitas data, dan
memperbaikinya = **migrasi data**, bukan perubahan kode.

### Tabel lengkap — 132 nilai, 16 kolom (diukur 2026-10-12)

Dihasilkan langsung dari probe, bukan dihitung tangan:

| kolom | jumlah | nilai di luar daftar |
|---|---|---|
| `gender` | 22 | `-`×21 · `Laki-Laki`×1 |
| `agama` | 3 | `Islam`×3 |
| `status_pernikahan` | 11 | `SINGLE`×4 · `Belum Menikah`×2 · `BELUM KAWIN`×1 · `Belum`×1 · `Single`×1 · `未婚 Single`×1 · `SUDAH MENIKAH`×1 |
| `golongan_darah` | 1 | `AB +`×1 |
| `tangandominan` | 5 | `Kanan`×4 · `右`×1 |
| `status_eks_jepang` | 8 | `Belum`×2 · `BELUM `×2 · `5`×1 · `EKS MAGANG (元技能実習生)`×1 · `Belum pernah`×1 · `BELUM`×1 |
| `tahan_ac` | 8 | `Sanggup`×3 · `SANGGUP`×3 · `SIAP`×1 · `Ya`×1 |
| `kacamata` | 8 | `-`×5 · `Tidak`×3 |
| `buta_warna` | 8 | `-`×5 · `Tidak`×3 |
| `tato` | 8 | `-`×5 · `Tidak`×3 |
| `merokok` | 9 | `Tidak`×2 · `Iya`×2 · `-`×2 · `Ya`×1 · `無`×1 · `IYA`×1 |
| `minum_alkohol` | 7 | `-`×3 · `Tidak`×2 · `Iya`×1 · `無`×1 |
| `ukuranbaju` | 5 | `M/L`×2 · `xl`×1 · `64 CM`×1 · `L-XL`×1 |
| `ukuransepatu` | 3 | `48-49`×1 · `26,5 CM`×1 · `27.5`×1 |
| `ukuran_topi` | 13 | `-`×8 · `M`×2 · `L`×2 · `7`×1 |
| `bahasa` | 13 | `-`×12 · `JLPT N3 \| N3`×1 |
| **TOTAL** | **132** | |

### Temuan terbesar: penanda `-` tersimpan sebagai data — 61 dari 132

| kolom | `-` |
|---|---|
| `gender` | 21 |
| `bahasa` | 12 |
| `ukuran_topi` | 8 |
| `kacamata` / `buta_warna` / `tato` | 5 masing-masing |
| `minum_alkohol` | 3 |
| `merokok` | 2 |
| **total** | **61** |

### Sisanya (71) — empat kelompok

| kelompok | nilai |
|---|---|
| **Beda huruf besar/kecil** | `Laki-Laki`×1 · `Islam`×3 · `Belum Menikah`×2 · `Single`×1 · `Kanan`×4 · `Tidak`×13 · `Ya`×2 · `Iya`×3 · `IYA`×1 · `xl`×1 |
| **Sinonim** | `SINGLE`×4 · `BELUM KAWIN`×1 · `Belum`×1 · `SUDAH MENIKAH`×1 · `Sanggup`×3 · `SANGGUP`×3 · `SIAP`×1 · `Belum`×2 · `Belum pernah`×1 · `5`×1 |
| **Kanji bocor ke kolom Indonesia** | `右`×1 (tangan) · `無`×2 (merokok, alkohol) · `EKS MAGANG (元技能実習生)`×1 · `JLPT N3 \| N3`×1 · `未婚 Single`×1 |
| **Ukuran diisi bebas** | `M/L`×2 · `L-XL`×1 · `64 CM`×1 · `48-49`×1 · `26,5 CM`×1 · `27.5`×1 · `M`×2 · `L`×2 · `7`×1 |
| **`golongan_darah`** | `AB +`×1 — sudah dinormalkan di batas tulis; baris lama menunggu disimpan ulang |

### Di luar `master_database_candidate` (tabel `database_candidate`, 226 baris)

| kolom | temuan |
|---|---|
| `pendidikan` | 🔴 memuat **JSON mentah**: `[{"tingkat":"SMA"}]` ×3 |
| `tahapan_seleksi` | `LIST` 58 · `Pendaftaran` 51 · `Baru` 29 · `Seleksi Berkas` 1 · `MCU PARPOR` 1 |
| `status_kandidat` | `Aktif` 124 · `LULUS` 47 · `Gagal` 4 · `LIST` 1 · **`MCU PARPOR` 1** |
| `gender` | `LAKI-LAKI` 82 · `PEREMPUAN` 79 · `-` 25 |

`"MCU PARPOR"` muncul di **kedua** kolom — kemungkinan salah salin.

### Kenapa TIDAK dijalankan sekarang

1. **`SUPABASE_DB_URL` untuk gdw belum ada** ⇒ `npm run migrate:up` tidak bisa
   jalan (hambatan yang sama yang dicatat `db-switch-legacy-2026-10-12.md`).
2. Memutasi **132 baris di database LIVE** butuh persetujuan eksplisit pemilik.
3. Sinonim tidak punya jawaban tunggal yang aman tanpa keputusan pemilik —
   mis. `SUDAH MENIKAH` → `MENIKAH`? `BELUM KAWIN` → `BELUM MENIKAH`?
   `Sanggup` → `YA`? `右` → `KANAN`? Itu keputusan bisnis, bukan pemetaan teknis.

Probe pengukurnya: `F:/tmp/_probe-enums.ts` (jalankan lewat esbuild + `.env`).

---

## Bukti uji & gate

| gate | hasil |
|---|---|
| `typecheck:ratchet` | ✅ 0 error |
| `verify:shim` | ✅ semua kelas terhitung |
| `lint-ratchet` | merah **hanya** pra-sesi (`run-batteries.mjs` ×3) — tidak ada berkas sesi ini |
| suite penuh | **2564 lulus / 5 merah** (+13 dari 2551) — kelima merah pra-sesi, semuanya project `indexer` (sandbox `EBUSY` + `parse.test.ts`/`query.test.ts`) |
| `verify:schema` | merah: DB live **20 tabel** vs kontrak **25** — 5 tabel hilang (`job_queue`, `rate_counters`, `dependency_calls`, `idempotency_keys`, `schema_migrations`). Konsekuensi `.env` menunjuk gdw; **bukan** akibat sesi ini |

Setiap perbaikan diuji **merah lebih dulu** (R5):

- `normalizeBloodType` → `AB +` harus jadi `AB+`
- `RirekishoBuilder` → `O+` harus mencetak `O 型 Rh+`
- dropdown Master → mengembalikan literal `agama` lama ⇒
  `#mf-agama kehilangan opsi: KATOLIK`
- `trimText` → mengembalikan `agama` ke `toText` ⇒ `"ISLAM " tidak dirapikan`

---

## Yang perlu keputusan pemilik

1. **Migrasi 132 nilai** (terutama 61 penanda `-`) — jalankan, dan dengan
   pemetaan sinonim yang mana? Perlu `SUPABASE_DB_URL` gdw.
2. **`database_candidate.pendidikan` berisi JSON** — 3 baris. Perbaiki di
   migrasi yang sama?
3. **`tahapan_seleksi` / `status_kandidat`** — `Pendaftaran` vs `LIST` vs `Baru`
   itu sinonim atau memang tahap yang berbeda? Salah satu `MCU PARPOR` jelas
   salah kolom.
