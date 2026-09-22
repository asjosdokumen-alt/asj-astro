# DEVELOPMENT_ROADMAP — urutan eksekusi: fondasi dulu, fitur belakangan

**Dibuat:** 2026-09-18 · **Basis ukur:** HEAD `3804576`, pohon kerja bersih (0 berkas kotor)
**Prinsip pemilik:** *"bangun fondasi 100% dulu tanpa ada tanggungan atau backlog yang tertinggal.
Setelah fondasi bersih dan stabil, baru tahap perbaikan bug, upgrade fitur, dan seterusnya."*
**Kewenangan:** keputusan teknis diambil dokumen ini, bukan dilempar balik ke pemilik.

> **Aturan baca.** Setiap angka di bawah **diukur** dengan perintahnya sendiri, hari ini. Bila sebuah
> dokumen lain (termasuk `BACKEND_TODO.md`, `REMAINING_BY_DISCIPLINE.md`, `TODO.md`) bertentangan
> dengan dokumen ini, **hasil ukur yang menang** dan koreksinya disebut. Angka commit **wajib**
> diukur ulang saat dipakai — lihat §7.

---

## 0. Ringkasan keputusan

**Fondasi itu tidak "90% selesai".** Ia punya **empat sebab** yang berbeda, dan hanya satu di antaranya
benar-benar butuh uang atau infrastruktur baru. Urutannya jadi:

| Fase | Isi | Butuh pemilik? | Butuh infra baru? |
|---|---|---|---|
| **F1** | Registry jujur: `biodata:guard` ditarik ke runner hermetik | tidak | tidak |
| **F2** | Tutup lubang "kode hidup tanpa pemanggil" (skrip yatim, gate port) | tidak | tidak |
| **F3** | Tiga tindakan pemilik yang sudah siap-dijalankan (revoke, rotasi, 1 env) | **ya** | tidak |
| **F4** | Coverage sebagai ratchet, dari run terukur | tidak | tidak |
| **F5** | Yang sengaja dilunakkan, dicatat dengan pemicu ukur ulang | tidak | tidak |
| **F6** | *(ditunda)* `verify:rls`/`verify:db` + skrip yatim sisa — butuh terminal luar sandbox | tidak | tidak |
| **P2** | Fitur, polish, realtime, email — **hanya setelah F1–F4 hijau** | ya (keputusan) | sebagian |

**Keputusan paling penting di dokumen ini:** **jangan tunggu staging — dan jangan tunggu sandbox.**
Staging membuka tiga item (`#4`/`#5`/`#6`) dan mengubah 13 gate dari `battery: "infra"` menjadi
teruji; itu pekerjaan akun/infra di sisi pemilik. Dan dua baterai PostgreSQL (`verify:rls`,
`verify:db`) **tidak bisa diverifikasi dengan andal dari dalam sandbox ini** — 8,5 menit per
percobaan, kuota hapus ~50/turn, dan kegagalannya menyamar sebagai temuan (§2.4). Keduanya
**ditunda dengan pemicu yang jelas**, bukan dihapus. Sisanya — F1, F2, F4 — **tidak butuh keduanya**
dan itulah yang dikerjakan lebih dulu.

---

## 1. Apa "fondasi" itu sebenarnya — peta terukur

### 1.1 Angka yang mengikat

| Ukuran | Nilai | Perintah |
|---|---|---|
| Gate di manifest | **35** (`blocking: 33`, advisory: 2) | `node -e "…review-manifest.json"` |
| Gate blocking dengan baterai `ci` (hermetik) | **20** | idem |
| Gate blocking dengan baterai `infra` | **13** | idem |
| Gate tanpa baterai | **1** (`depcruise`, `blocking: false`, advisory) | idem |
| Gate blocking yang **CI tidak pernah jalankan** | **0** | `npm run verify:review-manifest` |
| **Gate blocking yang dijamin jalan di SETIAP push/PR** | **19 / 33** | §1.2 |
| Gate blocking yang hanya jalan di job bersyarat/berartefak | **9** | §1.2 |
| Baterai mutasi di disk | **36** (7 di `e2e/`, 29 di `scripts/ci/`) | `ls e2e/*.mutations.sh scripts/ci/*.mutations.sh` |
| Baterai yang **tidak** dikutip siapa pun | **0** | idem vs manifest |
| Berkas terkutip CI-checkout | **431** (ts 254, mjs 53) | `indexer/src/count-indexed.test.ts` |
| Baseline lint | **2499** | `.ci/biome-baseline.json` |
| Commit belum naik ke remote | **53** | §7 |

### 1.2 Peta "punya verdict atau tidak" — dua tingkat, bukan satu

Manifest menyatakan `0 gate blocking yatim`. Itu **benar dan menyesatkan sekaligus**, karena ia
menjawab *"dikutip workflow"*, bukan *"punya verdict di setiap perubahan"*. Dua pertanyaan berbeda:

**Tingkat A — 19 gate, dijamin jalan di setiap push/PR.** Job: `typecheck`, `boundary`,
`functions-tree`, `classes`, `test-frontend`, `test-backend`, `quality-gates`, `biodata-guard`, `audit`.
Ini "bukti yang berjalan tanpa diminta".

**Tingkat B — 9 gate, blocking, tapi butuh syarat.** Ketiganya kelas yang berbeda:

| Gate | Job | Syaratnya | Sifat syarat |
|---|---|---|---|
| `biodata:guard` | `ci.yml#biodata-guard` | tidak ada — **selalu jalan** | *sudah tingkat A* |
| `verify:pwa` | `ci.yml#smoke` | `needs: build` + artefak | infrastruktur |
| `smoke` | `ci.yml#smoke` | server hidup + artefak | infrastruktur |
| `e2e:public` … `e2e:labels` (6) | `ci.yml#e2e` | `event_name == 'push'` **atau** `inputs.run-e2e` | konfigurasi |

**Yang penting dari tabel ini:** `biodata:guard` **sudah** masuk "setiap push", tapi manifest
mengklasifikasinya `battery: "infra"` dengan alasan *"needs a database engine"* — padahal baterainya
telah saya **jalankan offline hari ini** (§2.1). Jadi perbaikannya bukan menambah kemampuan; ia
memperbaiki **label**. Itu kelas pekerjaan tercepat yang tersedia: nol kode baru, nol infrastruktur,
hanya satu field yang berhenti berbohong.

### 1.3 Empat sebab fondasi belum bersih

1. **Wahana-terkunci pemilik** — push `#2`, revoke token `#26`/`#30`, rotasi `SESSION_SECRET` `#28`,
   pilihan receiver-vs-Grafana + 1 env var `#7`.
2. **Wahana-terkunci infra** — staging yang tidak ada menahan `#4`/`#5`/`#6` dan mengubah 13 gate
   dari `infra` → teruji. **Satu-satunya celah fondasi yang benar-benar butuh uang.**
3. **Realitas tanpa-peninjau-kedua (A-01)** — setiap aturan yang bergantung pada manusia kedua adalah
   dekorasi. Karena itu *setiap* temuan di dokumen ini ditutup dengan gate atau tes, bukan janji.
4. **Kejujuran registry** — selisih antara `battery` di manifest dan apa yang baterainya **benar-benar
   butuhkan**. Ini murah diperbaiki dan langsung menaikkan nilai 13 gate.

---

## 2. F1 — Registry jujur: tarik baterai yang sudah offline ke runner hermetik

**Kenapa ini nomor satu.** Satu perubahan field di manifest menaikkan gate dari *"pernah dibuktikan"*
ke *"terus dibuktikan"* di setiap PR — tanpa kode baru, tanpa infra, tanpa izin pemilik. Tidak ada
pekerjaan lain yang memberi imbal-balik sebesar ini.

### 2.1 Bukti terukur (dijalankan hari ini, bukan disimpulkan dari prosa)

Saya menjalankan dua baterai yang manifest kategorikan `infra` di **checkout bersih HEAD**
(`git worktree add --detach`, bukan pohon kerja):

> **Koreksi atas subbagian ini — baca §2.4 sebelum memakai angkanya.** Hasil `verify:rls` di bawah
> **tidak** dapat dipercaya sebagai verdict baterai: `run-case.mjs` mati dengan `ECONNRESET` sebelum
> gate dijalankan, dan exit 1 dari uncaught exception itu terbaca sebagai `SURVIVED`/`UNEXPECTED`.
> Angka `biodata:guard` **tidak** terpengaruh dan tetap sah. Yang **sah** disimpulkan dari `verify:rls`
> hanya satu hal: baterainya **bisa dijalankan offline** — dan itu pun akhirnya tidak saya pakai untuk
> memutuskan apa pun, karena ongkos memverifikasinya di lingkungan ini lebih besar daripada manfaat
> labelnya (§2.4).

**`verify:rls` — baterai BERJALAN offline, tetapi verdictnya TIDAK SAH (§2.4).**

```
KILLED     R1  absent SUPABASE_URL
KILLED     R2  a table with RLS switched OFF blocks the deploy
KILLED     R3  anon holding SELECT on a non-candidate table blocks
KILLED     R4  anon holding TRUNCATE blocks the deploy
KILLED     R5  FOR ALL TO PUBLIC USING (true) blocks the deploy
SURVIVED   R6  an empty catalog is refused, not read as clean
SURVIVED   R7  a check that cannot see anything reports UNVERIFIABLE
UNEXPECTED R3b anon grant on a CANDIDATE-facing table stays green
UNEXPECTED R5b a PUBLIC policy with a real predicate stays green
scope: the full catalog verdict against a REAL PostgreSQL (embedded-postgres)
```
Durasi 8 m 34 s. Pohon kerja dipulihkan byte-identik (diverifikasi `git status`).
**Empat baris terakhir adalah artefak harness (§2.4), bukan verdict gate — jangan dikutip sebagai temuan.**

**`biodata:guard` — baterai BERJALAN offline, dan MEMBEDAKAN.** *(Angka ini sah dan dipakai.)*

```
intact  ok A2 candidate NOT self-approve DISETUJUI -> REFUSED
intact  ok A4 candidate NOT self-reject REVISI     -> REFUSED
intact  ok A6 no claims setting FAILS CLOSED       -> REFUSED
mutated ok A2 ... -> REFUSED      <- verdict BERUBAH = baterai membedakan
mutated ok A4 ... -> REFUSED      <- idem
mutated ok A6 ... -> REFUSED      <- idem
```
Durasi 36 s. Baterai ini **jujur menyebut** bahwa di Windows `embedded-postgres` tidak bisa memulai
klaster di drive non-sistem (`global/pg_control: Permission denied`) dan **memindahkan data ke temp OS
sambil melaporkan jalur mana yang dipakai** — persis aturan repo: *"'baterai tidak bisa jalan' dan
'guard tidak gagal' tidak boleh terlihat sama."*

**Kesimpulan yang sah, dan hanya satu:** **`biodata:guard` offline-provable hari ini** — 36 detik,
membedakan, dan **sudah** jalan di setiap PR. `verify:rls` **bisa** dijalankan offline, tetapi
verdictnya belum sah di lingkungan ini dan ongkos memverifikasinya lebih besar daripada manfaat
labelnya ⇒ ditunda (§2.4). `verify:db`: alasan yang sama, belum dicoba.

### 2.2 Aturan yang membuat ini benar, dinyatakan tegas

Repo sudah merumuskannya di header `verify-db.mutations.sh`, dan saya mengukuhkan sebagai aturan
pemilihan:

> **Sebuah gate offline-provable bila TRANSPORT-nya bisa diganti tanpa mengganti CHECK-nya.**

- `biodata:guard` → transport = koneksi DB, check = trigger di dalam `UPDATE` nyata. **Terbukti,
  36 s.**
- `verify:rls` → transport = connection string (`SUPABASE_DB_URL`), check = SQL katalog. Ganti server
  dengan `embedded-postgres` yang asli ⇒ SQL-nya **tidak** di-stub, tetap dieksekusi Postgres nyata.
  **Bisa, tapi belum terbukti sah di sini (§2.4).**
- `verify:db` → transport = base URL PostgREST, check = bandingkan nama objek. Server lokal menjawab
  dengan kejujuran yang sama. **Belum dicoba.**
- `biodata:guard` → transport = koneksi DB, check = trigger di dalam `UPDATE` nyata.

### 2.3 Yang dikerjakan (urutan per-berkas, commit per-berkas)

| # | Tindakan | Berkas | Bukti penutup |
|---|---|---|---|
| F1.3 | Ubah `battery: "infra"` → `"ci"` untuk **`biodata:guard`** (baterai 36 s — paling murah di seluruh repo, dan ia **sudah** jalan di setiap PR lewat `ci.yml#biodata-guard`) | `scripts/ci/review-manifest.json` | `verify:batteries` memuatnya |
| F1.5 | Perbarui `batteryNote` `biodata:guard` agar menyebut jalur temp-OS + kondisi Windows-nya, bukan alasan lama | idem | `verify:review-manifest` hijau |
| ~~F1.1~~ | ~~Ukur ulang `verify:rls`~~ **DITUNDA — lihat §2.4** | — | — |
| ~~F1.2~~ | ~~Reklasifikasi `verify:rls`~~ **DITUNDA — lihat §2.4** | — | — |
| ~~F1.4~~ | ~~Ukur ulang `verify:db`~~ **DITUNDA** (alasan sama: 2 gate tersisa butuh cluster PostgreSQL penuh per kasus) | — | — |
| F1.6 | Naikkan timeout job `batteries` **hanya bila** set bertambah (130 m = 120 m watchdog + 10 m margin) | `.github/workflows/ci.yml` | `verify:workflows` hijau |

### 2.4 Keputusan: `verify:rls` dan `verify:db` diturunkan dari jalur kritis

> **STATUS AKHIR — baca ini dulu.** Penundaan di subbab ini berlaku **hanya sampai §3.0 selesai**.
> Setelah perbaikan harness, baterai `verify:rls` berjalan **hijau** (`killed 7 · survived 0 ·
> ok-green 5`, exit 0) di lingkungan yang sama yang di bawah ini dituduh tidak andal. Verdict
> "PROBLEM" di bawah adalah **artefak harness**, bukan temuan gate — dan itu sekarang **terbukti**,
> bukan diduga. Konsekuensinya ada di §2.5 dan §9. `verify:db` **tetap** belum diuji.

**Diukur, lalu diputuskan.** Baterai `verify:rls` di **pohon HEAD bersih** melaporkan, pada **dua
percobaan berturut-turut** (8 m 34 s dan 3 m 49 s — durasi berbeda, verdict sama):

```
KILLED R1 (exit 2, benar) · KILLED R2/R3/R4/R5 (exit 1)
SURVIVED R6 · SURVIVED R7   (expected 2, dapat 1)
UNEXPECTED R3b · UNEXPECTED R5b (expected 0, dapat 1)
killed 5 · survived 2 · ok-green 0
VERDICT: PROBLEM
```

**Pola `exit=1` yang seragam pada SETIAP kasus yang menyentuh fixture** adalah petunjuknya, dan saya
menelusurinya sampai akar — melewati dua hipotesis yang **salah**:

1. ~~"Kosa kata kontrol-positif belum ada."~~ **Salah.** `check` sudah menerima `kill`/`ok` dan
   mencetak `KILLED`/`OK-GREEN` dengan tepat; call-site `R3b`/`R5b` memakai `ok`, `R6`/`R7` memakai
   `kill`. Tidak ada bug di situ.
2. ~~"port `54377` dipegang postmaster sisa."~~ **Salah.** Percobaan kedua berjalan dengan port bebas
   dan menghasilkan verdict yang **identik**. Log `rm_retry` juga **kosong** ⇒ penghapusan tidak
   pernah gagal, jadi kuota hapus sandbox **bukan** penyebabnya.

**Akar sebenarnya, terukur:** `run-case.mjs` mati sebelum gate dijalankan, dengan

```
Error: read ECONNRESET
    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)
```

`embedded-postgres` gagal mempertahankan koneksi TCP di lingkungan Windows-yang-di-sandbox ini.
`run-case.mjs` lalu keluar dengan **exit 1 dari uncaught exception**, dan `check` menerjemahkan exit
itu menjadi `SURVIVED`/`UNEXPECTED` — *"harness yang tidak pernah jalan, berkostum gate yang gagal
menolak"*, tepat seperti yang header baterai itu sendiri peringatkan. **Gate-nya tidak pernah
dijalankan pada kasus-kasus itu, jadi `VERDICT: PROBLEM` bukan temuan.**

**Keputusan (pemilik, 2026-09-18): turunkan `verify:rls` dan `verify:db` dari jalur kritis.**

- **Berkas baterainya TIDAK dihapus.** Menghapusnya akan membuat `battery: "infra"` menunjuk berkas
  yang tidak ada, dan `run-batteries.mjs` **menolak start** dengan exit 2.
- **Nilai yang hilang kecil dan terukur:** `verify:rls` **tetap** berjalan di kedua jalur deploy
  (`deploy-production.yml#deploy`, `deploy-staging.yml#deploy`). Yang hilang: ia tidak ikut pada
  **setiap PR**.
- **Pemicu menaikkan kembali, satu perintah, di terminal biasa (bukan sandbox ini):**

  ```bash
  npm run verify:batteries --only=verify:rls
  ```

  Bila `ECONNRESET`/exit 1 masih muncul di sana, masalahnya bukan lingkungan; bila ia lulus dengan
  `ok-green 2`, maka **dua `SURVIVED`/`UNEXPECTED` yang saya lihat memang artefak sandbox** dan
  reklasifikasi `battery: "ci"` bisa langsung dilakukan.

- **Satu temuan nyata yang tetap berdiri dari percobaan ini:** baterai melaporkan
  `RESTORE FAILED — scripts/ci/verify-rls.mjs does not match its pre-run content`, padahal
  `git diff scripts/ci/verify-rls.mjs` **kosong** (berkas identik dengan HEAD). Itu bug perbandingan
  di blok "Restore proof" (baris ~371: `cmp -s "$BAK" "$GATE"` gagal untuk alasan yang tidak
  dilaporkan), dan ia **kabur sebagai "RESTORE FAILED"** — kelas yang sama dengan seluruh §2.4 ini.

**Konsekuensi pada urutan keseluruhan: tidak ada yang bergeser.** F1.3/F1.5 (`biodata:guard`, 36 s,
**tidak** menyentuh `verify:rls`) tetap dikerjakan dan tetap murah — dan baterai itu **terbukti
membedakan** tanpa `ECONNRESET`. Langkah 3–5 (skrip yatim, gate port, baterai ad-hoc) sudah lama
tidak bergantung pada PostgreSQL sama sekali.

> **Urutan yang benar karena itu: F1.0 dulu** — rapikan kosa kata kontrol-positif di
> `verify-rls.mutations.sh`, **baru** F1.2. Membalik urutannya menghasilkan CI merah yang terlihat
> seperti temuan padahal itu artefak klasifikasi.

### 2.5 `verify:rls` dan `biodata:guard` — kenapa keduanya **TETAP** `infra`

Ini koreksi atas rencana saya sendiri, dan hasilnya lebih menarik daripada reklasifikasi yang
semula saya tuju.

Setelah §3.0 selesai, `verify:rls` **berjalan tuntas di sini tanpa kredensial Supabase dan tanpa
jaringan**, melawan PostgreSQL nyata dari `embedded-postgres`. Menurut aturan yang dipegang baterai
saudaranya (*"sebuah gate bisa dibuktikan offline bila **transpor**-nya bisa diganti tanpa mengganti
**check**-nya"*), itu berarti ia hermetik — dan `biodata:guard` sudah lama begitu (36 s, terbukti
membedakan). Rencana saya: pindahkan keduanya dari `battery: "infra"` ke `"ci"`.

**Saya melakukannya, dan gate manifest menolaknya — dengan benar.** `C7` di
`verify-review-manifest.mjs` mendefinisikan `ci` lebih ketat daripada yang saya asumsikan: ia
mencocokkan penanda `embedded-postgres|initdb` pada baris non-komentar, dan melaporkan:

```
C7 — battery/batteries classified "ci" but referencing live infrastructure:
     biodata:guard -> scripts/ci/biodata-guard.mutations.sh:103.
     The hermetic set runs with no database, server or credentials;
     reclassify as "infra" rather than deleting the battery.
```

Jadi ada **dua arti "hermetik"** di repo ini, dan saya sempat menyamakannya:

| Arti | Definisi | `verify:rls` memenuhi? |
|---|---|---|
| Yang dipakai baterai | transpor boleh diganti, check tetap sama ⇒ tidak butuh kredensial/jaringan | **ya** |
| Yang dipakai `C7` | **tidak ada mesin database sama sekali** di dalam runner | **tidak** (`embedded-postgres` = `initdb`/`postgres` sungguhan) |

`C7` tidak salah dan tidak ketinggalan zaman — ia menjaga properti yang spesifik dan berharga:
`verify:batteries` berjalan di container polos, dan baterai yang butuh Postgres akan **mematikan
seluruh job**, yang lalu memancing "perbaikan" berupa menghapus baterainya. Karena itu saya **tidak**
melonggarkan `C7`. Yang saya lakukan: mengembalikan klasifikasinya ke `infra`, dan **memperbaiki
`batteryNote`** yang menyesatkan.

**Yang menyesatkan itu penting.** `batteryNote` lama untuk `verify:rls` berbunyi *"Re-measure before
moving it into the hermetic set"* — sebuah **tebakan**, padahal pengukurannya **sudah** dilakukan
2026-09-15 dan tercatat lengkap di field `note` pada entri yang **sama** (*"PROVEN 2026-09-15: 7
killed / 0 survived / 2 ok-green against a REAL PostgreSQL 18.4"*). Dua field di satu entri
**saling bertentangan**, dan yang lebih panjang serta lebih benar justru yang tidak dibaca orang.
Kelas cacat yang sama dengan seluruh dokumen ini: **prosa yang menyamar sebagai pengukuran.**

**Keputusan akhir (dan alasannya):**

- `biodata:guard` dan `verify:rls` **tetap** `battery: "infra"`. Bukan karena ragu, tetapi karena
  `ci` berarti hal lain di sini.
- `verify:rls` **tidak** dimasukkan ke `verify:batteries` walau ia bisa jalan: biayanya terukur
  **8m34s dan 3m49s**, dan job `batteries` sudah jadi job tercepat-untuk-jadi-terlambat di pipeline.
  Menambah 4–8 menit untuk satu gate bukan pertukaran yang baik; ia sudah berjalan di **kedua**
  jalur deploy.
- `batteryNote` `verify:rls` kini menyatakan apa yang **terukur**, menunjuk `note` di entri yang sama,
  dan menjelaskan kenapa labelnya `infra`.
- `biodata:guard`: 36 s, sudah jalan di **setiap PR** (`ci.yml#biodata-guard`, tanpa `if:`), jadi
  nilainya sudah didapat tanpa mengubah label apa pun. `batteryNote`-nya kini mencatat pengukuran itu.

**Pelajaran yang saya catat untuk diri sendiri:** sebelum mengubah klasifikasi demi kejujuran, baca
dulu **definisi** klasifikasi itu di kode yang menegakkannya. Rencana saya terlihat seperti
memperbaiki registri; yang sebenarnya terjadi adalah saya hampir **melonggarkan sebuah gate demi
memenuhi rencana saya sendiri** — persis kebalikan dari yang diminta.

---

## 3. F2 — Tutup lubang "kode hidup tanpa pemanggil"

Kelas paling licin di repo ini (disebut `#3` di `BACKEND_TODO.md`): handler benar, ter-guard, ter-test,
dan **tidak pernah jalan**. Setelah `#8` dan `#9` selesai 2026-09-13, yang tersisa di kelas ini
bukan lagi backend — ia ada di **aset ukur**, dan jumlahnya sudah saya hitung.

### 3.0 Dua temuan dari §2.4 yang masuk daftar kerja

Keduanya **kecil, nyata, dan tidak butuh PostgreSQL penuh** — jadi ia naik ke jalur kritis.

> **SELESAI 2026-09-18 — commit `9919dd4`.** Keduanya diperbaiki, dan keduanya **dipaku oleh
> self-test di dalam baterai itu sendiri** (T1/T2/T3), bukan hanya oleh percobaan sekali jalan.
> Baterai `verify:rls` kini keluar **0** dengan `killed 7 · survived 0 · ok-green 5 · abort 0`.
> Empat verdict buruk yang dulu dilaporkan (`SURVIVED R6`, `SURVIVED R7`, `UNEXPECTED R3b`,
> `UNEXPECTED R5b`) **hilang seluruhnya** — konfirmasi bahwa keempatnya memang artefak harness,
> dan gate-nya tidak pernah rusak. Selama ini saya menahan diri menyimpulkan itu; sekarang terukur.

| # | Temuan | Kenapa nyata | Penutup | Status |
|---|---|---|---|---|
| F2.0a | `verify-rls.mutations.sh` melaporkan `RESTORE FAILED — scripts/ci/verify-rls.mjs does not match its pre-run content`, padahal `git diff` atas berkas itu **kosong** | Baterai yang **selalu** melaporkan RESTORE FAILED melatih pembacanya mengabaikan baris itu — dan baris itu justru satu-satunya penjaga "baterai tidak boleh merusak gate". Kelas yang sama dengan "gate hijau yang tak menyebut cakupannya" | Gate `verify:rls` tetap boleh `infra`; yang diperbaiki blok restore-proof-nya, lalu dibuktikan bisa **merah** saat gate benar-benar diubah | **SELESAI** |
| F2.0b | `run-case.mjs` keluar `1` dari **uncaught `ECONNRESET`**, dan `check` membacanya sebagai `SURVIVED`/`UNEXPECTED` | *"Harness yang tidak pernah jalan, berkostum gate yang gagal menolak"* — persis yang header baterai peringatkan di baris 112–117, kini terjadi lagi | `run-case.mjs` harus menangkap error transport dan keluar dengan kode **khusus** (mis. 70, yang sudah dipakai untuk `HARNESS ERROR`); `check` memperlakukan kode itu sebagai **ABORT**, bukan verdict | **SELESAI** |

**F2.0b lebih penting daripada label yang tadi saya kejar**, karena ia menyangkut **semua** baterai
berbasis `embedded-postgres`, bukan satu gate. Sebelum ini diperbaiki, setiap verdict merah dari
baterai-baterai itu harus dicurigai dulu — dan itu biaya yang dibayar setiap kali seseorang
menjalankannya.

#### 3.0.1 Bukti bahwa self-test-nya bisa GAGAL

Self-test yang tidak bisa merah bukan penjaga, hanya hiasan. Karena itu T1/T2/T3 diuji dengan
**mutasi yang disuntikkan ke salinan bersebelahan** (kasus database di-stub supaya probe selesai
dalam detik, bukan 8 menit), dan tiap anchor **dipastikan cocok tepat satu kali** — mutasi yang
tidak menemukan targetnya harus gagal keras, bukan jadi no-op yang menyamar sebagai temuan:

| Mutasi | T1 | T2 | T3 | Terbunuh? |
|---|---|---|---|---|
| baseline (berkas apa adanya) | OK-GREEN | OK-GREEN | OK-GREEN | — |
| **A** penjaga keberadaan `$GATE_BAK` dinonaktifkan | **FAILED** | OK | OK | ya |
| **B** cabang ABORT dihapus dari `check()` | OK | **FAILED** | **FAILED** | ya |
| **C** T1 berhenti mengekstrak blok yang di-ship | **FAILED** | OK | OK | ya |

**Mutasi B menjelaskan kenapa T3 ada.** T2 menyuntikkan stub-nya *setelah* `check()` di-source, jadi
ia membuktikan **cabangnya bekerja** tetapi bukan bahwa cabangnya **masih ada di fungsi yang di-ship**.
T3 menutup lubang itu dengan membiarkan runner **asli** gagal. Tanpa T3, menghapus cabang ABORT akan
lolos dari T2 — bentuk regresi yang paling mungkin terjadi.

#### 3.0.2 Dua perangkap path yang menyamar sebagai bug kode

Keduanya memunculkan gejala "kode rusak", dan keduanya butuh waktu untuk dibedakan:

1. **`$0` POSIX vs Windows.** Di-invoke relatif, `$0` = `scripts/ci/x.sh`; di-invoke absolut, Git Bash
   menghasilkan `/f/astro/...`, dan `node` Windows membaca bentuk POSIX itu sebagai `F:\f\astro\...`.
   Terukur: `readFileSync("/f/astro/scripts/ci/verify-rls.mutations.sh")` → `ENOENT ... F:\f\astro\...`.
   Perbaikan: `SELF="$(cygpath -m "${BASH_SOURCE[0]}")"`, diuji pada **tiga** gaya pemanggilan.
   **Catatan penting:** `readlink -f` terlihat benar dan **salah** di sini — ia mempertahankan bentuk
   POSIX, sehingga lulus saat diuji dari `bash -c` (yang menormalkan) tetapi gagal saat dijalankan
   langsung. Probe yang lebih permisif dari jalur aslinya adalah probe yang berbohong.
2. **`mktemp -d` menghasilkan `/tmp/...`.** Shell Git Bash paham; `node` membukanya sebagai
   `F:\tmp\...` dan gagal ENOENT. Diselesaikan **sekali** di bagian prasyarat dengan `cygpath -m` plus
   **probe tulis** — kalau nilai itu tidak bisa ditulis node, baterai **ABORT keras** alih-alih
   muncul belakangan sebagai "T1/T2 FAILED" yang menuduh kode.

**Pelajaran yang berlaku umum:** ketika sebuah penjaga gagal, pertanyaan pertama bukan "apa yang rusak
di kode yang dijaga" melainkan **"apakah penjaganya benar-benar bisa jalan"**. Dua dari tiga cacat di
§3.0 adalah cacat harness yang tampil sebagai temuan gate.

### 3.0.3 Temuan sampingan: `cp` yang gagal akan mematikan baterai secara senyap

Saat memindahkan backup keluar dari `$SCRATCH`, terlihat bahwa `cp "$GATE" "$BAK"` berada di bawah
`set -e`. Bila `cp` gagal, **seluruh baterai berhenti sebelum satu kasus pun jalan** — dan keluaran
yang tersisa hanyalah kesalahan `cp`, bukan "harness tidak bisa membuktikan restore". Itu bentuk
kegagalan yang sama dengan yang header baterai peringatkan (baris 112–117: helper ditulis sebelum
`mkdir`, setiap kasus jadi `SURVIVED` palsu). Kini prasyaratnya eksplisit dan bersuara.

---

### 3.1 Enam skrip yatim (diukur hari ini)

> **SELESAI 2026-09-18 — commit `f3d9637`.** Dua `verify-*` dihapus; empat `measure-*`
> dipertahankan. Kriteria yang dipakai persis seperti di bawah, dan ia bertahan terhadap
> pengukuran lanjutan.
>
> **Yang tidak saya duga:** menghapus dua berkas menggeser **tiga** asersi ratchet, bukan dua.
> Saya menemukan dua lewat `grep`, lalu `vitest run` memerah pada yang ketiga
> (`discover.test.ts:730`, `files.length`). Diukur dengan `indexer/src/count-indexed.test.ts`
> (alat yang memang ditunjuk komentar ratchet): `mjs 53 -> 51`, `files.length 431 -> 429`,
> lima bucket lain **tidak berubah** — jadi ini benar-benar dua penghapusan, bukan pohon yang
> bergeser. **Pelajaran: `grep` untuk sebuah angka bukan pengukuran.** Angka yang sama muncul di
> beberapa berkas dan bentuknya berbeda (`count('mjs')`, `files.length`, `fileCount`).
>
> **Cara menghapus:** `git update-index --force-remove`, **bukan `git rm`** — repo ini sudah dua
> kali meledakkan direktori dengan `git rm`. Diverifikasi sesudahnya: `test -d e2e` lulus dan
> direktori masih berisi 18 berkas.

Dari 12 skrip `.mjs` di `e2e/`, **6 dikutip** oleh `package.json` (dan karenanya oleh CI) dan
**6 tidak**:

| Skrip | Ukuran | Sifat | Keputusan | Status |
|---|---|---|---|---|
| `e2e/verify-progress-live.mjs` | 4.126 B | bukti manual, butuh server + Chromium | **hapus** | **DIHAPUS** |
| `e2e/verify-stage1.mjs` | 2.528 B | screenshot manual Stage 1, hardcode sesi palsu | **hapus** | **DIHAPUS** |
| `e2e/measure-bottomnav-clearance.mjs` | — | alat ukur manual | **pertahankan + tandai** | dipertahankan (port `4323`, §3.2) |
| `e2e/measure-bottomnav-tap.mjs` | — | idem | **pertahankan + tandai** | dipertahankan (port `4323`, §3.2) |
| `e2e/measure-riwayat-card.mjs` | — | idem | **pertahankan + tandai** | dipertahankan; **komentar `4322`-nya diperbaiki** |
| `e2e/shot-bottomnav-occlusion.mjs` | — | penghasil screenshot | **pertahankan + tandai** | dipertahankan (port `4323`, §3.2) |

**Alasan pemisahan ini, bukan "hapus semua yang yatim":** empat skrip `measure-*` adalah **alat ukur
berulang** yang jawabannya berupa angka (`blocked: true/false`, tinggi kartu, hasil `elementFromPoint`)
— nilainya justru karena bisa dijalankan lagi di masa depan. Dua skrip `verify-*` adalah **bukti
sekali-pakai dari satu ronde perbaikan yang sudah selesai**; keduanya menyuntikkan sesi palsu
(`sessionToken: 'x'` / JWT `fake`) dan menulis ke `test-results/`, dan yang satu bahkan hardcode
`BASE_URL` default `4322` — port yang menyesatkan (§3.2).

**Preseden yang mengikat, dari repo ini sendiri:** dua skrip yatim sebelumnya (`test-admin.mjs`,
`test-supabase-auth.mjs`) **dihapus, bukan di-wire**, karena `test-supabase-auth.mjs` memanggil
`auth/v1/signup` dengan nomor telepon acak **di setiap run** — menciptakan user autentikasi asli di
project **produksi** — sambil menerima status `200` **atau** `400`, dan default ke port `4322`
sementara lima gate lain memakai `4321`. Kesimpulan yang tercatat: *"Skrip yatim yang tidak bisa
di-wire dengan aman bukan scope — ia liabilitas."*

**Ini kriteria yang saya terapkan.** Empat `measure-*` **bisa** dipertahankan dengan aman karena tidak
menulis ke luar (selain `test-results/` yang gitignored) dan tidak membuat state di server mana pun.
Dua `verify-*` tidak memenuhi syarat itu.

### 3.2 Perangkap port `4322` — kelas yang harus ditutup gate

> **SELESAI 2026-09-18 — commit `f3d9637`.** Gate `verify:ports` dibuat
> (`scripts/ci/verify-e2e-ports.mjs`), terdaftar di manifest sebagai `battery: "ci"`, masuk set
> hermetik (**22** sekarang, dari 21), dan dijalankan di `ci.yml#quality-gates` pada setiap PR.
> Dibuktikan bisa gagal oleh `verify-e2e-ports.mutations.sh`: **3 killed / 0 survived / 2 ok-green**.

Empat skrip (dua yang dihapus + dua `measure-*`) memakai default `4322`; lima gate e2e resmi memakai
`4321`. Satu skrip bahkan menulis `BASE_URL=http://localhost:4322` di header sementara kodenya
default `4321` — **dokumentasi yang menunjuk port yang tidak dipakai kodenya sendiri**. Itu kelas bug
yang sama dengan `§1.1(a)`: prosa yang berbeda dari perilaku, dan tidak ada yang menangkapnya.

**Penutup:** ~~tambahkan cek ke `verify:workflows` (atau skrip gate kecil baru)~~ **skrip gate baru**,
`verify:ports`, yang menolak `BASE_URL` default yang berbeda dari port yang dipakai gate resmi. Satu
gate, menutup seluruh kelas.

#### 3.2.1 Yang gate itu temukan, dan yang saya salah kira tentang `4322`

Dua koreksi terhadap paragraf di atas, keduanya dari mengukur alih-alih mengutip catatan lama:

1. **"Empat skrip memakai default `4322`" tidak benar lagi — dan mungkin tidak pernah persis
   begitu.** Setelah dua `verify-*` dihapus, `4322` tersisa di **satu tempat**: sebuah *komentar* di
   `measure-riwayat-card.mjs`. Kode berkas itu default ke `4321` sepanjang waktu. Jadi cacat aslinya
   bukan "empat skrip menunjuk port salah" melainkan **"satu komentar menunjuk port yang kodenya
   tidak pakai"** — lebih kecil, tetapi justru lebih berbahaya, karena yang dibaca orang adalah
   komentarnya.
2. **Port yang repo ini benar-benar BIND hanya satu: `4321`.** `server.cjs` memakai
   `PREFERRED_PORT = 4321` dengan fallback `findPort`; `serve.cjs` memakai `listen(4321)`.
   `astro.config.mjs` tidak menyetel port. Jadi gate itu menurunkan himpunan port dari repo, bukan
   mengetiknya — daftar yang diketik tangan akan menyimpang dari server yang dijelaskannya, yaitu
   cacat yang sama satu tingkat di atas.

**Temuan kedua, dan ini yang paling berguna:** tiga skrip (`measure-bottomnav-tap`,
`measure-bottomnav-clearance`, `shot-bottomnav-occlusion`) default ke **`4323`**, dan pencarian
seluruh repo menemukan `4323` **di tidak ada berkas lain** — tidak ada server yang membind-nya, tidak
ada skrip yang menyalakannya. Ia bukan "komentar bohong" (komentar dan kode sepakat, jadi P2 lulus)
dan bukan "port salah": ia pilihan **instance kedua** yang disengaja, tanpa cara memulainya yang
tercatat. Gate **tidak** menyebutnya pelanggaran — ia melaporkannya sebagai **UNBOUND**, karena
`BASE_URL` wajib bagi ketiganya dalam praktik, dan hal jujur yang bisa dilakukan sebuah gate adalah
mengatakannya lantang alih-alih melaporkan hijau yang tidak ia peroleh. `--strict` membuatnya fatal.

#### 3.2.2 Kenapa dua kontrol `OK-GREEN` itu wajib

Baterai punya 3 mutasi `KILLED` dan 2 kontrol `OK-GREEN`. Kontrolnya bukan hiasan: tanpa keduanya,
kasus **B** ("default dipindah ke port tak terikat") juga akan lulus pada gate yang **menolak setiap
suntingan pada baris port** — gate yang terlalu ketat, dan gate yang terlalu ketat sama tidak
bergunanya dengan gate yang buta. Kontrol D memindahkan default ke port yang sama di host berbeda
(`127.0.0.1` vs `localhost`); kontrol E membuat komentar **sepakat** dengan default di host berbeda.
Keduanya harus tetap hijau. **Aturan umum: setiap arah positif butuh arah negatifnya diuji dengan
instrumen yang sama**, atau angkanya tidak berarti apa-apa.

### 3.3 Baterai ad-hoc yang belum terdaftar

`UI_DESIGN_REVIEW.md` §27.12 mencatat sendiri: baterai label a11y **ad-hoc dan tidak terdaftar di
`review-manifest.json`, jadi `verify:batteries` tidak menjalankannya** — buktinya *"assertion-nya bisa
gagal hari ini, bukan bahwa ia masih bisa gagal bulan depan."*

Itu tepat definisi *hipotesis dengan dokumen bagus* (aturan §9.3). **Penutup:** daftarkan sebagai
entri `testBatteries` (bentuk yang sudah ada — ia membuktikan berkas vitest, bukan gate).

---

## 4. F3 — Tiga tindakan pemilik, semuanya sudah siap dan murah

Ini **satu-satunya** bagian fondasi yang tidak bisa saya kerjakan, dan ketiganya kecil. Saya nyatakan
apa adanya supaya tidak tersamar sebagai pekerjaan teknis.

| # | Tindakan | Di mana | Kenapa penting | Status hari ini (diukur) |
|---|---|---|---|---|
| `#28` | **Rotasi `SESSION_SECRET`** | env site Netlify | Kode **tidak punya fallback** ke password admin (S3 fix), jadi nilainya kritis dan belum pernah dikonfirmasi dirotasi | belum pernah dikonfirmasi |
| `#30(ii)` | **Revoke token `ghp_WHHjpzY…`** (40 karakter, utuh) | berkas `netlify_auth_token=nfp_vZP7qi1wVBQ1.txt` di root | Kredensial hidup dalam plaintext di disk | berkas **ADA** (1.798 B, 15 Sep), **gitignored** (`.gitignore:61 *nfp_*`), **tidak pernah di-commit** — terverifikasi `git ls-files --error-unmatch` gagal |
| `#26`/`#30(i)` | **Revoke `ghp_qzq70Qy…`** | GitHub → Settings → Developer settings → Tokens | Bocor ke-3; pernah ter-commit (tapi hanya **prefiks 10 karakter**, jadi tidak bisa dipakai) | hanya prefiks terpotong di repo — saya **tidak bisa** menguji atau mengerjakannya |

**Yang bisa saya lakukan tanpa akses pemilik:** setelah token di-revoke, **hapus barisnya dari berkas**
dan ganti dengan komentar yang menjelaskan asalnya. Hapus berkasnya sekalian juga benar — ia hanya
berguna sebagai tempat token itu tertulis. **Saya pilih: hapus berkasnya** (bukan menyunting), karena
berkas bernama `netlify_auth_token=nfp_` adalah tempat yang mengundang token berikutnya ditulis lagi.
Konfirmasikan revoke-nya, sisanya saya kerjakan.

### 4.1 `#7` — satu pilihan, satu env var

Receiver in-repo (`netlify/functions/metrics-receiver.ts`, 335 baris, 13/13 tes hijau) **sudah
ter-deploy dan fail-closed**: `POST` → **503** `{"ok":false,"error":"METRICS_RECEIVER_TOKEN not
configured"}` (bukan 404 ⇒ benar-benar tayang). Ia **dead code di produksi** karena 3 env var absen.

**Keputusan saya: pilih 100% Grafana, jangan hidupkan receiver in-repo.** Alasannya terukur, bukan
selera:
- Jalur Grafana **sudah utuh** — `GRAFANA_CLOUD_OTLP_ENDPOINT` + `GRAFANA_CLOUD_BASIC_AUTH_HEADER`
  terpasang, kredensialnya **diuji ke gateway → HTTP 200** dengan **nol build-minute**.
- Receiver in-repo menuntut 3 env var **baru** + satu layanan yang harus dijaga hidup — kerja
  tambahan untuk cakupan yang lebih sempit.
- Batasnya jujur dan sudah didokumentasikan `metrics-receiver.ts` sendiri: payload metrics **tidak**
  memuat breaker state, queue depth, atau dead-letter count. **A4/A5/A7 karena itu tidak bisa
  dievaluasi dari counter** — mereka butuh `/health` atau query DB. Artinya receiver in-repo **tidak
  cukup** untuk menutup A1–A7; Grafana pun butuh `/health` untuk sebagian. Jadi memilih receiver
  tidak menghilangkan pekerjaan, hanya menambah.

**Sisa pekerjaan setelah pilihan ini: nol kode.** Yang tersisa: (a) buktikan sink Grafana
**menerima** (env ada ≠ data masuk — ini pembedaan yang sama dengan §9.4), (b) tulis A1–A7 sebagai
alert rule, (c) isi nilai `dev` yang kosong untuk `GRAFANA_CLOUD_BASIC_AUTH_HEADER` (kode
menangkapnya lewat `otlpPlaceholderWarning()` → gagal berisik, severity rendah).

---

## 5. F4 — Coverage sebagai ratchet, dari run terukur

`vitest.config.ts` sudah memuat blok `coverage` lengkap — provider `v8`, reporter, `exclude` — dan
`@vitest/coverage-v8: ^4.1.11` **sudah dideklarasikan**, jadi klaim lama *"`test:coverage` tidak bisa
jalan sama sekali / dead script"* **sudah basi**. Yang tersisa persis satu hal, dan komentarnya
mengatakan sendiri:

> `statements: 0, branches: 0, functions: 0, lines: 0` — *"NOT YET SET, ON PURPOSE … Do not read 0 as
> 'no coverage required'."*

Sebabnya terukur: provider v8 menghapus direktori laporannya lewat `fs.rm`, dan **shim safe-delete
sandbox menolaknya** (614 penghapusan diminta vs kuota ~50/turn), sehingga `V8CoverageProvider.clean`
crash sebelum run dan `cleanAfterRun` sesudahnya.

**Keputusan saya, dan ini pilihan yang saya ambil sadar:** jalankan `npm run test:coverage` **di luar
sandbox** (terminal biasa, atau serahkan ke CI di mana guard-nya tidak ada), ambil empat angka `%`,
**bulatkan KE BAWAH**, tulis ke `vitest.config.ts`, lalu buktikan `test:coverage` bisa merah dengan
satu baterai yang menurunkan satu angka. Empat angka dari run nyata jauh lebih baik daripada ambang
yang dipilih supaya terlihat bagus — dan repo ini sudah dua kali membayar pelajaran itu.

**Ini bukan pekerjaan yang saya tunda karena sulit; ia tertunda karena sandbox saya tidak bisa
menjalankannya.** Itu perbedaan yang harus dicatat, bukan disembunyikan.

---

## 6. F5 — Yang **sengaja** saya lunakkan (dicatat, bukan dibiarkan jadi celah senyap)

Pemilik memberi izin eksplisit: *"Untuk aturan/strictness gate, jangan terlalu kaku kalau memang belum
bisa dipenuhi."* Berikut yang saya lunakkan, beserta alasannya dan **pemicu pengukurannya ulang** —
supaya kelonggaran ini punya batas, bukan jadi izin permanen.

| Aturan | Pelonggaran | Alasan terukur | Pemicu ukur ulang |
|---|---|---|---|
| 13 gate `battery: "infra"` | Tetap `infra` untuk sementara | 4 di antaranya (`verify:env`, `verify:env:budget`, `verify:schema`, `verify:schema`+`verify:rls` pada path deploy) **butuh kredensial** yang hanya ada di jalur deploy — bukan pilihan, batas nyata | Setelah staging ada, **atau** saat transport-nya terbukti bisa diganti (§2.2) |
| 6 gate `e2e:*` | Tetap di job bersyarat | Butuh artefak build + server + Chromium. `ci.yml#e2e` **sudah** memasang Chromium dan menyajikan `npm run preview`; yang menahan adalah `if:` dan biaya waktu, bukan ketidakmampuan | Setelah `run-e2e` dinyalakan default untuk `main` |
| `npm audit` | Tetap `continue-on-error: true` | 13 advisory hari ini; menyalakannya berarti **setiap PR mewarisi advisory lama**. Komentar di `ci.yml` sudah menyatakan syaratnya | Setelah pohon dependensi produksi bersih |
| Timeout job `batteries` | 130 m | Ini **langit-langit, bukan target** — 120 m watchdog + margin. Terukur ~190 s/baterai untuk 5 pertama | Setelah jumlah baterai hermetik final (§2.3 F1.6) |
| `depcruise` | Tetap advisory, tanpa baterai | **A-07 sudah RESOLVED** — `boundary` authoritative (wired di `ci.yml#boundary`, blocking, punya baterai, memiliki 6 aturan). `depcruise` **bukan** gate pesaing | tidak perlu; ini sudah benar |

**Satu pelonggaran yang saya TOLAK,** meski izinnya ada: menurunkan ambang baterai. `verify:batteries`
adalah satu-satunya mekanisme yang menjaga 20 gate dari menjadi hipotesis; melunakkannya akan
menghapus nilai seluruh §2. Kalau ia merah, itu temuan — bukan gangguan.

---

## 7. Cara mengukur ulang (jangan baca prosa)

```bash
# posisi repo — WAJIB, jangan hafal angka
git ls-remote newrepo refs/heads/main          # SHA remote yang sebenarnya
git rev-list --count HEAD --not <SHA-dari-atas> # commit yang belum naik

# registry gate
node -e "const m=require('./scripts/ci/review-manifest.json');
  const g=m.gates, b=k=>g.filter(x=>x.battery===k).length;
  console.log('total',g.length,'blocking',g.filter(x=>x.blocking).length,
              'ci',b('ci'),'infra',b('infra'),'none',b('none'));"

# gate cepat (semua harus exit 0)
npm run verify:review-manifest && npm run typecheck:ratchet && npm run verify:workflows

# baterai — JANGAN paralel dengan `vitest run` (10 merah palsu)
npm run verify:batteries:list
npm run verify:batteries --only=verify:rls
```

**Status hari ini, terukur:** `verify:review-manifest`, `typecheck:ratchet`, `verify:md`,
`lint-ratchet`, `verify:workflows` → **semua exit 0**. `lint-ratchet` melaporkan **debt turun 22**
(baseline 2499 boleh turun, tidak boleh naik). Pohon kerja **0 kotor** di `3804576`.

**Jebakan yang sudah memakan waktu di repo ini — jangan diulang:**
`rm`/`rmSync`/`unlinkSync` **semua** dicegat shim; `exit=$?` sesudah pipe = status `tail`, bukan gate
(pakai `out=$(…); code=$?`); `git add` **per-berkas**; `git rm` **= peledak direktori** (terjadi 2×);
**`( cmd & )` mati bersama shell-nya** — pakai background runner; `curl -o /dev/null` **exit 23 walau
berhasil** (pakai `curl -fsS URL > /dev/null`); sandbox mengekspor `HTTP_PROXY` ⇒ request ke
`127.0.0.1` dijawab **502** (wajib `--noproxy '*'`).

---

## 8. P2 — Fase fitur: baru dibuka setelah F1–F6 hijau

**Gerbang masuk fase ini, dan tidak bisa dinegosiasikan:** `verify:review-manifest` hijau ·
`verify:batteries` hijau tanpa `SURVIVED`/`UNEXPECTED` yang tak terjelaskan · 0 berkas kotor ·
`vitest run` bersih dengan verdict yang bisa dikutip · 0 gate blocking berlabel salah.

Setelah gerbang itu terbuka, urutannya **keputusan produk dulu, baru kode** — karena dua item terbesar
di sini bukan kekurangan tenaga, melainkan kekurangan keputusan:

1. **`#16` realtime** & **`#17` email** — sudah diputuskan pemilik 2026-09-15: **di-skip** (free tier).
   Bukan utang teknis. Jangan dikerjakan tanpa keputusan baru.
2. **Urutan prioritas produk** — *"Apakah email notification masih dibutuhkan? WA sudah jadi kanal
   utama dan **tidak ada modul email sama sekali** di repo."*
3. **Polish (dari `TODO.md`)** — dark mode (ada, belum diuji menyeluruh), audit mobile responsive,
   audit WCAG 2.1, loading skeleton, Cloudinary transforms, analisis bundle, Lighthouse 90+,
   error tracking, PostHog, dashboard analytics admin.

**Dua temuan UI yang butuh satu kalimat keputusan Anda, bukan pekerjaan:**
- **Background tidak inert saat drawer terbuka.** Terukur **19 dari 30** tekanan Tab keluar dari drawer
  ke halaman belakang, di mana focus ring mendarat **288 px** *di bawah* drawer. Scrim sudah membuat
  latar inert terhadap pointer; menjadikannya inert terhadap keyboard **mengubah perilaku**, jadi ini
  **dilaporkan, bukan diambil** — persis aturan §9.9.
- **`LoginModal`** mendestruktur `onBackdropClick` tapi **tidak pernah memakainya.**

**Satu koreksi yang saya bawa masuk agar tidak salah prioritas:** `useButtonType` (195 kemunculan —
kode terbesar ke-5 di baseline) **diturunkan dari P1 ke higiene** berdasarkan pengukuran: hanya ada
**4 `<form>`** di `src/` (`InputManualModal`, `TabJadwal`, `TabTambah`, `TabWA`) berisi **9 tombol**,
dan **0 tanpa `type`**. Klaim *"menekan tombol X men-submit form"* **berlebihan** dan atribusinya salah.
Jangan kerjakan ini sebagai bug.

---

## 9. Jadwal eksekusi (satu halaman)

| Urutan | Pekerjaan | Bisa jalan sekarang? | Selesai bila | Status |
|---|---|---|---|---|
| ~~**1**~~ | ~~F2.0a perbaiki blok restore-proof `verify-rls.mutations.sh` (selalu `RESTORE FAILED`)~~ | — | `git diff` kosong ⇒ tidak ada lagi `RESTORE FAILED` | **SELESAI** `9919dd4` |
| ~~**2**~~ | ~~F2.0b `run-case.mjs` tangkap `ECONNRESET` ⇒ keluar kode khusus; `check` memperlakukannya sebagai **ABORT**, bukan verdict~~ | — | simulasi error transport ⇒ `ABORT`, bukan `SURVIVED` | **SELESAI** `9919dd4` |
| ~~**3**~~ | ~~F1.3 + F1.5 reklasifikasi **`biodata:guard`** ke `battery: "ci"`~~ | — | — | **DIBATALKAN, sengaja — §2.5.** `C7` mendefinisikan `ci` sebagai "tanpa mesin database"; `biodata:guard` sudah jalan tiap PR, jadi nilainya sudah didapat |
| **4** | F1.6 timeout job `batteries` (hanya bila set bertambah) | **tidak perlu** | `verify:workflows` hijau | set hermetik tetap 21 ⇒ tidak ada yang berubah |
| ~~**5**~~ | ~~F2.1 hapus 2 skrip yatim `verify-*.mjs`~~ | — | `git add` per-berkas; 0 yatim | **SELESAI** `f3d9637` |
| ~~**6**~~ | ~~F2.2 gate port `BASE_URL`~~ | — | gate menolak `4322`; bisa merah | **SELESAI** `f3d9637` — `verify:ports`, 3 killed / 2 ok-green |
| **7** | F2.3 daftarkan baterai label a11y ad-hoc | ya | entri `testBatteries` ada | — |
| **8** | F4 `test:coverage` + ambang ratchet | **butuh terminal biasa** | 4 angka terukur tertulis | — |
| **9** | F3 pemilik: revoke ×2, rotasi `SESSION_SECRET`, hapus berkas token | **pemilik** | 3 tindakan konfirmasi | — |
| **10** | F3.1 Grafana 100%; buktikan sink menerima; A1–A7 alert rule | pemilik (produk) | 1 env terisi + alert rule ada | — |
| **—** | ~~**DITUNDA** `verify:rls` / `verify:db` (§2.4)~~ | — | **SELESAI untuk `verify:rls`** — lihat catatan di bawah | **SEBAGIAN** |
| — | **Gerbang P2** (§8) | — | semua di atas hijau | — |
| **11+** | Fitur / polish / realtime / email | setelah gerbang | keputusan produk | — |

**`verify:rls` sudah tidak menunggu terminal luar.** Alasan penundaannya di §2.4 adalah,
*"tidak bisa diverifikasi dengan andal di sandbox ini"* — dan setelah §3.0 selesai, itu **terukur
salah**: baterainya keluar **0** dengan `killed 7 · survived 0 · ok-green 5`, dijalankan tepat di
lingkungan yang tadi dituduh. Yang tidak bisa diandalkan bukan PostgreSQL-nya, melainkan **harness
yang salah membaca kegagalan transport-nya.** Baterai ini karena itu **tidak lagi** di jalur kritis
maupun jalur paralel: ia hanya perlu dijalankan bila seseorang mengubah `verify-rls.mjs` atau
baterainya.
`verify:db` tetap belum dicoba dan tetap di `infra` — alasan yang sama **belum** terbukti untuknya,
dan saya tidak akan mengasumsikan bahwa hasil `verify:rls` berlaku untuknya.

**Jalur paralel (bukan penghalang):** staging deployment + Supabase project terpisah. Ia membuka
`#4` (load test 10× peak), `#5` (pooler failover drill), `#6` (kalibrasi cap 24/4/3) dan mengubah 13
gate `infra` menjadi teruji. **Ia tidak menahan langkah 1–8.**

**Jalur paralel kedua (baru, 2026-09-18):** satu terminal **di luar sandbox** untuk menjalankan
`verify:rls`/`verify:db` dan `test:coverage`. Ketiganya butuh kemampuan yang lingkungan ini tidak
punya: `embedded-postgres` yang tahan koneksi TCP (`ECONNRESET`, §2.4), penghapusan massal, dan
provider v8 coverage yang menghapus direktori laporannya sendiri. **Satu sesi di terminal biasa
menutup ketiganya sekaligus** — jauh lebih murah daripada saya mengulang percobaan berdurasi
8,5 menit di sini.

---

## 10. Definisi "fondasi 100%" — supaya tidak jadi target yang bergerak

Fondasi selesai bila **semuanya** benar:

1. **0** gate blocking yang punya baterai tapi label `battery`-nya **terbukti** salah.
   *(Catatan kejujuran: `verify:rls`/`verify:db` **ditunda**, jadi butir ini ditutup untuk
   `biodata:guard` dan tetap terbuka-dengan-alasan untuk keduanya — lihat §2.4.)*
2. **0** skrip `.mjs` yatim di `e2e/` yang tidak punya alasan tertulis untuk ada.
3. **0** baterai `.mutations.sh` yang tidak dikutip manifest (C8 sudah menegakkan ini — pertahankan).
4. **0** gate blocking yang tidak punya jalur untuk punya verdict.
5. Coverage punya ambang dari **run terukur**, dan baterainya membuktikan ambang itu bisa gagal.
6. **3** tindakan pemilik (`#26`/`#28`/`#30`) selesai.
7. `#7` terputus: Grafana menerima, A1–A7 adalah alert rule.
8. **0** berkas kotor; setiap temuan ditutup dengan kode, tes, atau gate — **bukan** catatan.

**Yang secara sadar TIDAK saya masukkan ke definisi ini,** supaya daftarnya tidak tumbuh terus:
staging (jalur paralel), `#16` realtime, `#17` email (keputusan produk — di-skip), dan setiap item
polish di `TODO.md`. Keempatnya adalah **P2**, dan mencampurnya ke fondasi adalah persis kesalahan
yang `BACKEND_TODO.md` §0 peringatkan: *"sisa backend terbesar bukan di dalam fase A–E sama sekali."*

**Dan satu hal yang saya keluarkan dari definisi ini justru karena sudah diukur:** verifikasi
`verify:rls`/`verify:db`. Butir itu **bukan** pemicu "fondasi belum bersih" — nilainya kecil
(RLS tetap teruji di kedua jalur deploy, hanya tidak di setiap PR) dan ongkos memverifikasinya di
lingkungan ini besar dan menyesatkan. Ia dipindahkan ke jalur paralel dengan satu perintah pemicu,
supaya tidak menjadi alasan menahan seluruh fase berikutnya.
