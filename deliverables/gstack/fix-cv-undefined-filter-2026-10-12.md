# Dua keluhan pemilik, 2026-10-12 (sore)

Laporan pemilik, apa adanya: **"filter gak mencari semua. banyak rekhisou yg undefine."**

Keduanya terukur, keduanya punya sebab yang berbeda, dan keduanya sudah diperbaiki.
Semua angka di bawah diukur atas DB yang repo pakai sekarang
(`gdwvffmevwtwnzrapjwy`, 226 kandidat) — bukan atas fixture.

---

## 1. "banyak rirekisho yg undefined" — 40 dari 40 CV

### Yang diukur

Seluruh pipeline asli dijalankan di luar browser: `handleGetDrafCvMaster()` →
`makeV()` → `buildCvIdentitas()` → `buildKertasA4()` untuk 40 kandidat nyata
(diambil dari `master_database_candidate`), lalu keluaran HTML-nya dihitung.

```
rirekisho rendered for 40 real candidates
candidates whose rendered CV contains the literal "undefined": 40
```

**Setiap CV.** Bukan "beberapa", bukan "kalau datanya kosong".

### Sebabnya

`buildCvIdentitas()` mengembalikan `{gStr,nStr,jStr,pStr,tStr,gd,nr}`, dan
pemanggilnya menyebarkannya apa adanya (`...id`) ke `buildKertasA4()`. Lembar CV
di sisi lain membaca `{gS,nS,jS,pS,tS,…}` — **lima nama yang tidak pernah
dihasilkan produsennya**. Kelimanya `undefined`, dan `escVal(undefined)` menulis
kata `undefined` ke dalam sel:

| Sel di CV | Sumber |
|---|---|
| 性別 JENIS KELAMIN | `gS` |
| 配偶者 STATUS PERNIKAHAN | `nS` |
| 来日経験 PERNAH KE JEPANG | `jS` |
| パスポート番号 PERNAH MEMILIKI PASPOR | `pS` |
| 利き手 TANGAN AHLI | `tS` |

Nama bergaya `gS` hanya ada di lima tempat itu; nama bergaya `gStr` hanya ada di
produsennya. Keduanya tidak pernah terhubung. `rirekishoEscape.test.ts` tidak
bisa melihatnya: suite itu memang menyebar `...id`, tetapi hanya memeriksa bahwa
muatan XSS keluar ter-escape.

Catatan: `docs/archive/HANDOVER.md:179` sudah mencatat keluhan yang sama
("JENIS_KELAMIN, STATUS_PERNIKAHAN muncul undefined") dan menutupnya dengan
"tambah fallback '-'". Fallback itu ada, tapi tidak pernah dipakai — karena
nilainya `undefined`, bukan `"-"`.

### Perbaikan

`buildKertasA4()` membaca nama yang benar-benar dikembalikan produsennya
(`gStr,nStr,jStr,pStr,tStr`). Tidak ada fallback yang ditambahkan: selnya kini
memuat **datanya**.

### Bukti

- Tes baru di `RirekishoBuilder.test.tsx`: merah dulu (`not to contain
  'undefined'` gagal), hijau setelah perbaikan. Asersinya per-sel dan positif
  (`PEREMPUAN (女)`, `BELUM MENIKAH （未婚）`, `ADA （有）`, `KANAN  (右)`) supaya
  "mengosongkan sel" tidak bisa lulus.
- Pipeline asli dijalankan ulang atas 40 kandidat nyata:

```
candidates whose rendered CV contains the literal "undefined": 0
gender cell filled with a real value: 29 / 40      (11 sisanya memang belum ada gender di master)
gender present in the source but BLANK in the sheet: 0
```

---

## 2. "filter gak mencari semua" — dua dari empat kriteria selalu nol baris

Penyaringan pindah ke server pagi ini (`d48e858`). Itu belum cukup: dua kriteria
membandingkan nilai dengan bentuk yang **tidak pernah ada di database**.

Diukur atas 226 baris nyata:

| Kriteria | Nilai yang dikirim UI | Yang ada di DB | Hasil sebelum perbaikan |
|---|---|---|---|
| Gender | `l` / `p` | `LAKI-LAKI` 82 · `PEREMPUAN` 79 · `-`/kosong/null 65 | **0** untuk keduanya |
| JFT | `a2` / `b1` | `jft` = URL DOKUMEN (85 baris); teks sertifikat ada di `nilai_jft_text` (4 baris) | **0** untuk keduanya |
| Usia | `under20`/`20to25`/`over25` | angka | 26 / 74 / 28 (benar) |
| Cari (q) | teks | nama/WA | benar |

Jadi memilih "Perempuan" atau "Laki-laki" **tidak pernah** menampilkan siapa pun,
dan filter JFT juga tidak. Itulah "filter gak mencari semua".

### Sebabnya

`GENDER`: kode dropdown dibandingkan huruf-per-huruf dengan kata penuh —
`'l'` ≠ `'laki-laki'`.

`JFT`: token dicocokkan ke kolom `jft`, yang isinya URL dokumen
(`…/4._KHOIRUL_RUSLAN_JFT_vguwvc.pdf`). Aturan legacy yang benar sudah ada di
repo — `docs/PARITY_CHECKLIST.md` B06 ("A2/N4 & B1/N3") dan implementasinya di
`ShareView.tsx:172-173`: baca **`nilai_jft_text`**, satu pilihan = DUA token.

### Perbaikan

`netlify/functions/contexts/catalog/repository.ts`:

- gender → `normalizeGender()` (`_lib/db/client.ts`, satu-satunya normalisasi
  gender backend) dibandingkan dengan nilai kanonik dari peta `l`/`p`;
- JFT → `nilai_jft_text` dengan pasangan token A2/N4 dan B1/N3;
- `CAND_LIGHT_COLS` memuat `nilai_jft_text` (bukan `jft`) — tanpa itu baris
  ringan kehilangan nilainya dan filternya kembali nol.

### Bukti

Fixture tes `e2e/candidate-filter-all-rows.test.ts` **ikut salah** dan itu
diperbaiki lebih dulu: ia menulis `gender: 'P'` dan `jft: 'https://cdn/A2.pdf'`,
yaitu bentuk yang sama dengan asumsi implementasinya, sehingga hijau sementara
filter sebenarnya nol. Fixture sekarang menyerupai DB (kata penuh; `jft` = URL
tanpa token; `nilai_jft_text` = teks sertifikat). Dengan fixture itu, **7 tes
merah** sebelum perbaikan (semua kriteria gender & JFT → 0 baris), hijau sesudah.

Pipeline asli dijalankan atas DB live:

| Kriteria | total sebelum | total sesudah |
|---|---|---|
| gender = l | 0 | **82** |
| gender = p | 0 | **79** |
| jft = a2 | 0 | **1** |
| jft = b1 | 0 | **1** |
| tanpa kriteria | 226 | 226 |

Angka `l`/`p` persis sama dengan hitungan mentah kolom `gender` (82 / 79) — bukti
filter membaca kolom yang benar, bukan kebetulan.

**JFT sekarang 1, dan itu jujur**: `nilai_jft_text` hanya terisi di 4 dari 226
baris (`A2/210`, `JLPT N3`, `222`, `-`). Filternya sudah benar; datanya yang
belum pernah diisi. Kalau pemilik ingin filter ini berguna, yang perlu diisi
adalah `nilai_jft_text` kandidat — bukan filternya diubah lagi.

---

## 3. Yang TIDAK dikerjakan, dan kenapa

- **`lint-ratchet` merah sebelum sesi ini** — 3 diagnostik
  `lint/complexity/useOptionalChain` di `scripts/ci/run-batteries.mjs`
  (baris 265, 768, dan satu lagi). Berkas itu **tidak disentuh** sesi ini dan
  tidak ada di diff; baseline `.ci/biome-baseline.json` tidak punya entri untuk
  berkas itu, jadi ini drift dari commit sebelumnya. Tidak saya perbaiki di sini
  supaya commit ini tetap tentang dua keluhan pemilik — perbaikannya 3 baris
  (`err?.code`) dan bisa dikerjakan terpisah.
- **`fcm-server.test.ts` merah di sandbox** — `spawnSync git EBUSY`,
  artefak sandbox yang sudah terdokumentasi (R16 §7), bukan kode.
- **Deploy produksi masih memakai bimq** dan `SUPABASE_JWT_SECRET` gdw masih
  `CHANGE_ME` — lihat `db-switch-legacy-2026-10-12.md`.

## 4. Status uji

| Gate | Hasil |
|---|---|
| `tsc --noEmit` | exit 0 |
| `vitest --project frontend --project backend` | 196 berkas · 2296 lulus · 1 merah (EBUSY sandbox) |
| `verify:projections` | PASS (205 berkas, tanpa wildcard) |
| `projections.test.ts` | 74 tes hijau (kontrak kolom) |
| `e2e/candidate-filter-all-rows.test.ts` | 14 tes hijau (7 merah sebelum perbaikan) |
| `RirekishoBuilder.test.tsx` | 11 tes hijau (1 merah sebelum perbaikan) |
| `lint-ratchet` | merah, **pra-ada**, berkas di luar diff |
