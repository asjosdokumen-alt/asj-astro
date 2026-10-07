# Gate `verify:shim` — kelas celah shim kini punya penjaga

**Tanggal:** 2026-10-03
**Lanjutan dari:** `light-theme-shim-audit-2026-10-02.md` (action item #1)
**Perintah owner:** *"lanjut"* — menyetujui pembuatan gate (yang sebelumnya saya tandai sebagai keputusan owner karena menggeser counter beku)
**Status:** belum di-commit, belum di-push (R19). Dua berkas baru sudah di-**stage**.

---

## 📌 TL;DR

- **Gate dibuat, dibuktikan bisa gagal, dan disambungkan ke tiga jalur nyata.** `verify:shim` =
  `scripts/ci/shim-coverage.mjs`; battery-nya **6/6 killed, 0 survived**, semua restore
  byte-identik.
- **Yang ditegakkan: AKUNTANSI, bukan kontras.** Setiap `bg-*` beralpha di `src/` harus **ada di
  shim** atau **allow-listed dengan alasan yang memuat angka ukur**. Saat ini **64 shimmed + 11
  allow-listed**.
- **Gate ini buta terhadap tiga hal, dan header-nya menyebutkannya** (§2) — supaya tidak ada yang
  keliru membaca "shim-coverage passed" sebagai "kontrasnya benar".
- 🔴 **Satu mutasi SURVIVED lebih dulu, dan itu diagnosis yang benar.** `bg-slate-800/40` di-shim di
  **tiga** tempat, jadi mengganti nama satu kemunculan **bukan mutasi sama sekali** (§4).
- 🔴 **M2 dibunuh oleh self-test instrumen, bukan oleh perbandingan** (exit 2, bukan 1) — artinya ia
  tidak menguji klaim inti gate. Itu sebabnya **M2b** ada (§4).
- 🎯 **Gerbang repo sendiri menangkap kelalaian saya:** `verify:review-manifest` C8 menolak battery
  yang belum terdaftar, lalu C2b/C2c menolak berkas yang belum ter-track (§6).
- Counter beku di-rebaseline dengan **atribusi**, bukan tambal: `mjs` 84→85, `files.length` dan
  `fileCount` 535→536.

---

## 🎯 Kartu kesimpulan

| Item | Isi |
|---|---|
| Mutasi dijalankan | **6** · killed **6** · survived **0** |
| Mutasi yang DITOLAK sebagai bukti | **2** (bukan lubang — dijelaskan) |
| Titik sambung | `package.json` · `review-gate.mjs` (FAST_GATES) · `ci.yml#quality-gates` · `review-manifest.json` |
| Counter beku digeser | 3 assertion, diatribusi + diukur dengan alat resmi |
| Gerbang akhir | **review:gate 7/7 PASSED** · lint-ratchet PASSED (−21) · tsc 0 |
| Regresi | 0 |

---

## 1. Kenapa gate ini ada

Kelas cacatnya: shim tema terang adalah **allow-list yang ditulis tangan**, dan ia mencocokkan
**string kelas**. Apa pun yang tidak pernah diketik tetap memakai nilai gelap, sementara teks di
dalamnya dibalik §5b menjadi nyaris hitam — teks dan permukaan bertemu di rentang nilai yang sama.

**Empat belas instance, tiga cacat nyata**, semuanya tak terlihat sampai seseorang merender
halamannya di tema terang dan menyampel piksel tercat:

| Kelas | Lokasi | Terukur |
|---|---|---|
| `bg-slate-950/60` | chip dokumen AdminShareModal | **2,84:1** |
| `bg-sky-600/30` | pil ID CandidateProfileModal | **3,65:1** |
| `bg-slate-600/50` | chip status CandidateProfileModal | **3,70:1** |

Lantai 4,5 untuk teks 11px/700. Sebuah allow-list tulisan tangan **tidak bisa lengkap lewat
pemeriksaan mata** — itulah alasan gate ini ada, bukan karena ketiga kasus itu sendiri.

---

## 2. Yang ditegaskan — dan tiga hal yang **tidak bisa** dilihatnya

Gate menegaskan **akuntansi**: setiap `bg-*` beralpha di `src/` harus
(a) ada di shim, atau (b) terdaftar di `ALLOWED` dengan alasan yang memuat pengukuran.

Ia **tidak bisa** melihat, dan header-nya menyatakan ini:

1. **kelas yang DI-shim tapi nilainya masih gagal** — shim hanya soal kehadiran, bukan kebenaran;
2. **kelas yang tidak di-shim tapi justru lulus** — empat tint 10 % terukur 4,61–5,75:1 dan
   di-allow-list, **tidak** diperbaiki, karena memperbaikinya mengubah tampilan tanpa dasar;
3. **apa pun di luar `src/`** — `netlify/functions` dan `e2e` tidak dipindai; shim hanya mengatur
   bundel klien. Latar dari `style=` inline atau custom property juga tak terlihat.

> **Jangan baca "shim-coverage passed" sebagai "kontrasnya benar".** Artinya: setiap permukaan sudah
> **dipertimbangkan**. Vonis kontras tetap butuh piksel yang dirender.

Invarian yang ditegakkan gate: **daftar `ALLOWED` hanya boleh menyusut.** Alasan yang jujur untuk
tint 10 % adalah **rasio terukur**, bukan "kelihatannya baik-baik saja".

---

## 3. Instrumennya membuktikan dirinya sendiri

Mengikuti pola `verify-classes.mjs` di repo ini — gate yang tidak bisa membuktikan alat ukurnya
adalah gate yang bisa lulus karena mengukur nol hal:

- **escape self-test 4/4** — `.bg-slate-950\/60` → `bg-slate-950/60`;
- **selector self-test 8/8** — lima kelas yang **harus** terlihat di shim dan tiga yang **tidak
  boleh** (dua arah; asersi satu arah juga benar untuk parser yang mengembalikan kosong);
- **anti-vakumitas** — pemindaian yang menemukan nol kelas keluar **exit 2**, bukan lulus.

Dan ia **mencetak apa yang diukurnya**: `scanned 75 distinct class(es) · shim carries 395`. Gate yang
keluarannya hanya "ok" tak bisa dibedakan dari gate yang tidak mengukur apa pun.

---

## 4. Battery mutasi — 6/6 killed, dan dua mutasi yang **ditolak** sebagai bukti

```
baseline green
KILLED   exit=1  M1   a new unaccounted class (bg-teal-700/40)
KILLED   exit=2  M2   a shim entry removed (bg-slate-600/50)
KILLED   exit=1  M2b  a shim entry removed that no self-test pins (bg-slate-900/60)
KILLED   exit=1  M3   an allow-listed class exceeds its bound (bg-amber-500/10 x2)
KILLED   exit=1  M4   the ALLOWED table is emptied
KILLED   exit=2  M5   the scan finds nothing (broken instrument)

killed: 6 · survived: 0 · failed undos: 0 · BATTERY EXIT=0
```

### 4.1 Mutasi pertama M2b SURVIVED — dan gate-nya benar

`bg-slate-800/40` saya pilih sebagai "kelas yang tidak di-pin self-test". Ia **bertahan hidup**.
Diagnosisnya bukan "lubang di gate": kelas itu di-shim di **tiga** tempat
(`global.css:415` plus pasangan nav-scoped di `:1024-1025`), jadi mengganti nama satu kemunculan
**meninggalkannya tetap ter-shim**.

Itu **"not a mutation at all"** — framework menerima apa yang saya sangka rusak. Diganti dengan
`bg-slate-900/60`, yang resolve ke **tepat satu** selector. Kandidat yang ditolak tetap tercatat di
battery supaya tidak ada yang menambahkannya kembali.

### 4.2 M2 exit 2 — dibunuh, tapi bukan oleh klaim inti gate

M2 keluar dengan **exit 2**, bukan 1. Exit 2 = *"gate melihat pohon yang salah"* — artinya ia
dibunuh oleh **selector self-test instrumen** (`bg-slate-600/50` di-pin di sana), **bukan** oleh
perbandingan cakupan.

Sebuah kill yang benar untuk alasan yang salah tetap mencatat cakupan yang tidak dimiliki. Itu
sebabnya **M2b** ada: ia menyasar kelas yang **tidak** di-pin self-test, sehingga satu-satunya hal
yang bisa menangkapnya adalah perbandingan itu sendiri. Tanpa M2b, klaim inti gate **tidak terbukti**.

### 4.3 Atribusi diperiksa, bukan diasumsikan

Setiap `run` menuntut kegagalannya **menyebut kelas yang disasar** (`grep` pada keluaran), dan
mencetak `MISATTRIBUTED` bila tidak — lalu menggagalkan run. M4 (tabel `ALLOWED` dikosongkan)
membuktikan 11 pengecualian itu **benar-benar dikonsultasikan**, bukan kode mati.

### 4.4 Restore tidak memakai `git checkout --`, dan itu disengaja

Beberapa berkas yang diuji **sudah termodifikasi** di pohon kerja (perbaikan shim sesi ini), dan
`shim-coverage.mjs` sendiri **belum ter-track**. Mengembalikannya dari HEAD akan **menghancurkan
pekerjaan yang belum di-commit** — harness tidak boleh merusak pohon yang sedang diukurnya.

Jadi: backup `cp` ke **luar repo**, setiap backup **diverifikasi bersih** sebelum dipercaya
(aturan "backup yang sudah memuat mutasi bukan backup"), setiap undo dibungkus sehingga syscall yang
ditolak **melaporkan** pohon kotor alih-alih membunuh run tanpa vonis, dan **set berkas-termofifikasi
dibandingkan sebelum/sesudah**. Battery mencetak `failed undos : n`.

---

## 5. Disambungkan ke tiga jalur nyata

Gate yang tidak ter-wire adalah gate mati:

| Jalur | Perubahan |
|---|---|
| `package.json` | `"verify:shim": "node scripts/ci/shim-coverage.mjs"` |
| `scripts/ci/review-gate.mjs` | `'verify:shim'` masuk `FAST_GATES` ⇒ ikut R7 di setiap review |
| `.github/workflows/ci.yml` | ditambahkan ke `quality-gates` (`:372`) |
| `scripts/ci/review-manifest.json` | entri `gates[]` baru dengan `provenBy` menunjuk battery-nya |

---

## 6. 🎯 Gerbang repo menangkap kelalaian saya — dua kali, dan keduanya benar

Ini bagian yang paling menenangkan dari sesi ini: **saya tidak perlu mengingat semua aturannya.**

1. **C8 — battery yatim.** `verify:review-manifest` menolak `shim-coverage.mutations.sh`:
   *"A battery no gate cites is a proof nobody reads."* Persis kegagalan yang gate itu dibuat untuk
   menutup, dan ia menemukannya pada percobaan pertama saya.
2. **C2b/C2c — bukti yang tidak ikut terkirim.** Setelah entri manifest ditambahkan, gate menolak
   karena `shim-coverage.mjs` dan battery-nya **belum ter-track**: *"a fresh checkout cannot run the
   gate at all"*. Diperbaiki dengan `git add` **path eksplisit** (repo ini melarang `git add -A`).

Dua-duanya adalah gate yang **sudah ada**, bekerja pada perubahan yang belum pernah mereka lihat.
Itu bukti bahwa kelas gate ini hidup.

---

## 7. Re-baseline counter beku — diatribusi, bukan tambal

Menambah `.mjs` di `scripts/` menggeser tiga counter. Diukur dengan **alat resmi**
(`indexer/src/count-indexed.test.ts`), bukan diturunkan:

```
293 ts + 112 tsx + 20 astro + 85 mjs + 6 cjs + 20 js = 536
```

| Assertion | Sebelum → Sesudah |
|---|---|
| `discover.test.ts` · `count('mjs')` | 84 → **85** |
| `discover.test.ts` · `files.length` | 535 → **536** |
| `build.test.ts` · `fileCount` | 535 → **536** |

**Atribusi adalah delta per-bucket:** `mjs` bergerak tepat **+1** sementara `ts`/`tsx`/`astro`/`cjs`/
`js` **tidak bergerak**. Battery-nya `.sh` dan **tidak masuk bucket mana pun**. Ketiga counter
sepakat pada +1 yang sama — itulah yang membuatnya atribusi, bukan angka yang dinaikkan sampai hijau.

Setelah rebaseline: `counts match the measured profile` ✓ dan `indexes the measured inventory` ✓.
Satu merah tersisa di `discover.test.ts` adalah **artefak lingkungan** yang sudah terdokumentasi —
`Error: spawnSync cmd.exe EBUSY` (mesin ini tidak bisa membuat proses anak).

---

## 8. Verifikasi

| Gerbang | Hasil |
|---|---|
| `review:gate --base=HEAD --ack=ci` | **PASSED — 7/7** (termasuk `verify:shim` 1296 ms) |
| `shim-coverage.mjs` | **exit 0** — 64 shimmed, 11 allow-listed |
| `shim-coverage.mutations.sh` | **exit 0** — 6 killed / 0 survived / 0 failed undos |
| `lint-ratchet --base=HEAD` | **PASSED** — utang −21, 0 diagnostik baru |
| `tsc --noEmit` | **0 error** |
| `verify:review-manifest` | **PASSED** |
| Counter beku | 3 assertion ✓ (1 merah = `EBUSY` lingkungan) |

`--ack=ci` diberikan secara sadar: R3 menanyakan *"Has this gate been observed FAILING?"* dan
*"did the mutation battery actually apply?"* — jawabannya **ya** dan **ya**, keduanya terdokumentasi
di §4. Atestasi itu bukan formalitas yang dilewati.

---

## ✅ Action list

| # | Tindakan | Peran | Urgensi |
|---|---|---|---|
| 1 | Commit 8 berkas sesi ini (6 modifikasi + 2 staged) **bersama** 11 berkas yang belum di-commit dari sesi sebelumnya | owner | P0 sebelum push |
| 2 | Pertimbangkan gate serupa untuk `text-*` dan `border-*` beralpha — sesi ini hanya menutup `bg-*` | sesi berikutnya | P3 |

---

## 📚 Berkas

**Baru (2, sudah di-stage):**
```
scripts/ci/shim-coverage.mjs            gate — 75 kelas dipindai, 395 kelas di shim
scripts/ci/shim-coverage.mutations.sh   battery — 6 mutasi, semua terbukti terpasang
```

**Dimodifikasi (6):**
```
package.json                     +1 script (verify:shim)
scripts/ci/review-gate.mjs       +1 entri FAST_GATES
scripts/ci/review-manifest.json  +1 entri gates[] dengan provenBy
.github/workflows/ci.yml         quality-gates menyertakan verify:shim
indexer/src/discover.test.ts     count('mjs') 84→85 · files.length 535→536
indexer/src/build.test.ts        fileCount 535→536
```

---

> Gate ini menegaskan akuntansi, bukan kontras. Vonis kontras tetap butuh piksel yang dirender —
> lihat `light-theme-shim-audit-2026-10-02.md` dan probe di `F:/tmp/ui-probe/`.
