# Dua tes mandiri siswa — MBTI & Tes Mata Pra-MCU (2026-11-06)

Permintaan pemilik: dua tes baru di dasbor kandidat, **hanya sekali per siswa**,
dibuka/ditutup lewat **sakelar di panel admin**, dan hasilnya **tersambung ke
kolom CV AI** (`mbti`, `mata_kanan`, `mata_kiri`) tanpa mengunci isian manual.

## 1. Yang dibangun

| Bagian | Isi |
|---|---|
| Halaman siswa | `/tes-mbti` (40 soal) dan `/tes-mata` (Ishihara + Landolt C) |
| Dasbor kandidat | dua tombol baru, gerbang VIP yang sama dengan `/kotoba` |
| Panel admin | tab **Tes Siswa**: dua sakelar + daftar hasil |
| Backend | 4 action baru di surface `tes.ts`, ditumpangkan ke entry `kotoba.js` |
| Database | tabel `candidate_assessments` (migrasi 048) + `sys_config` untuk sakelar |

## 2. Aturan yang ditegakkan

1. **Sekali per siswa per jenis tes** — `UNIQUE (no_wa, jenis)` di database.
   Kiriman kedua dijawab `{ sudah: true }`, bukan menimpa hasil pertama.
2. **Sakelar admin** — `sys_config` tipe `tes_mbti` / `tes_mata`, nilai `on`.
   Tidak ada baris = **tertutup**. Gagal membaca = **tertutup** (fail-closed):
   satu gangguan database tidak boleh membuka tes yang sedang ditutup, karena
   tes ini tidak bisa diulang.
3. **Hanya siswa ASJ** — `tolakKecualiSiswa` (VIP / kelas LPK) untuk siswa,
   `requireAdmin` untuk sakelar dan daftar hasil. Sakelar saja TIDAK cukup:
   tanpa gerbang siswa, tes bisa diambil akun mana pun yang tahu nama action.
4. **Hasil disalin ke CV** — hanya ke kolom yang **masih kosong**. Isian manual
   yang sudah ada tidak ditimpa; UI memberi tahu kalau itu terjadi.

## 3. Tes MBTI

- 40 soal, 10 per dimensi (`EI`, `SN`, `TF`, `JP`), **5 positif + 5 terbalik**
  per dimensi. Skala bipolar 5 titik (−2…+2).
- Skor per dimensi ∈ [−20, +20] → persentase 0–100%; tipe = kutub dengan
  persentase ≥ 50.
- 16 profil berisi bidang kerja Jepang (kaigo, pengolahan makanan, manufaktur,
  konstruksi, pertanian, perhotelan) + saran mensetsu.
- **Bukti keseimbangan**: menjawab +2 pada SEMUA soal menghasilkan tepat 50% di
  keempat dimensi — diuji di `src/lib/tesSeleksi.test.ts`. Kalau soal tidak
  seimbang, satu tipe akan muncul untuk semua siswa dan hasilnya tetap terlihat
  sah.

## 4. Tes Mata

**Tahap 1 — Ishihara (12 plate, 5 detik/plate).** Plate 1 (`12`) adalah
kontrol: salah di plate ini membatalkan seluruh hasil. 4 plate transformasi
(8/3, 29/70, 5/2, 74/21), 4 plate hilang (45, 16, 73, 97), 3 plate diagnostik
(26 → protan 6 / deutan 2; 42 → 2/4; 35 → 5/3).

Plate digambar **prosedural di canvas** (`src/lib/ishiharaCanvas.ts`): titik
diletakkan dengan circle-packing, digit dipetakan lewat kanal merah/biru, warna
diambil dari palet sRGB. Alasannya: plate Ishihara asli berhak cipta, gambar
statis bisa diintip lewat Inspect Element, dan kompresi menggeser spektrum
jingga-hijau.

> **Batas yang jujur:** 12 plate, bukan 24. Hanya plate yang bacaannya tidak
> berbeda antar edisi yang dimasukkan — satu kunci yang salah akan menyatakan
> mata normal sebagai buta warna. Ini **saringan mandiri**, bukan diagnosis.

**Tahap 2 — Landolt C (視力検査).** Kalibrasi lebar KTP fisik (85,6 mm) lewat
slider → `pxPerMm`; jarak 50 cm (HP) atau 100 cm (PC). Rumus:
`celah = 0,2909 × jarak / visus`, diameter = 5 × celah, tebal = 1 × celah.
Level 0,1 → 1,2; lulus bila 2 dari 3 benar.

> **Batas fisik:** pada 50 cm, cincin visus 1,0 hanya ~2,5 px di layar HP.
> Aplikasi **tidak** membesarkannya (itu akan membuat level tinggi lebih mudah
> daripada seharusnya) — ia menandai level itu "hanya indikatif" lewat
> `terlaluKecil`.

## 5. Sinkronisasi ke CV AI

`simpanHasilTes` menulis hasil ke `master_database_candidate`:

| Tes | Kolom | Nilai |
|---|---|---|
| MBTI | `mbti` | `INTJ` (16 opsi yang sama dengan dropdown CV) |
| Mata | `mata_kanan`, `mata_kiri` | `1.0`, `0.7`, atau `<0.1` |

Hanya kolom kosong yang diisi. Respons menyertakan `cv: { ditulis, dilewati }`;
bila dilewati, halaman hasil menampilkan catatan bahwa kolom sudah terisi
manual dan tetap bisa diubah di form CV. **Tidak ada penguncian** — permintaan
pemilik: *"isi manual bebas jgn di lock"*.

## 6. Berkas

```
migrations/048_asesmen_tes.sql
netlify/functions/_lib/asesmen/tes.ts        (+ tes.test.ts)
netlify/functions/surfaces/tes.ts
netlify/functions/kotoba.js                  (menampung TES_ACTIONS)
netlify/functions/surfaces/registry.ts       (4 action)
src/lib/tesSeleksi.ts                        (+ tes.test.ts)
src/lib/ishiharaCanvas.ts
src/components/candidate/tes/GerbangTes.tsx  (+ tes.test.tsx)
src/components/candidate/tes/MbtiTest.tsx
src/components/candidate/tes/MataTest.tsx
src/components/admin/TabTes.tsx
src/pages/tes-mbti.astro · src/pages/tes-mata.astro
```

Entry function **tidak** ditambah: `kotoba.js` sekarang memuat dua surface
(`[KOTOBA_ACTIONS, TES_ACTIONS]`), jadi tidak ada cold start baru dan baseline
`bundle:size` tidak berubah bentuk. kotoba.js 498,9 KB (plafon 600).

## 7. Verifikasi terukur

| Gate | Hasil |
|---|---|
| `tsc --noEmit` | 0 error |
| frontend | 138 berkas / 1 813 tes |
| backend | 128 berkas / 1 696 tes |
| indexer | 15 berkas / 199 tes |
| `verify:binding` | 103 action / 18 surface, 0 orphan |
| `verify:entries` | 25 entry, semua punya handler |
| `verify:projections` | 0 wildcard |
| `verify:schema` | IN SYNC · 34 tabel |
| `verify:rls` | OK (semua tabel RLS ON) |
| `bundle:size` | pass (kotoba.js 498,9 KB) |
| `lint-ratchet` | PASS (utang −6) |
| `typecheck:ratchet` | 0 error baru |
| build | 19 halaman, `/tes-mbti` + `/tes-mata` terbangun |
| migrasi | 48 applied · 0 pending · 0 drifted |

Uji REST langsung ke database produksi (Neon): `sys_config` (in/DELETE/POST),
`candidate_assessments` (POST 201, duplikat 409 `23505`), dan `PATCH`
`master_database_candidate.mbti` semuanya diterima. Data uji dihapus kembali.

## 8. Yang perlu diputuskan pemilik

- **12 plate vs 24** — lihat §4. Menambah plate hanya aman kalau kuncinya
  dipastikan dari buku edisi yang sama.
- **Ambang normal 10/12** — setara aturan klinis "mayoritas plate benar".
- Sakelar default **tertutup**; admin perlu membukanya saat jadwal tes dimulai.
