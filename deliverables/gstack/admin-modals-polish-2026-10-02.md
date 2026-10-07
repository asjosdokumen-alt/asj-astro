# Polish modal admin `/admin` — 13 → 17 modal, diukur

**Tanggal:** 2026-10-02
**Permintaan owner:** *"fix tiap page upgrade polish — kemarin candidate sama admin page sudah, cuma modal admin belum semua, lanjutin itu saja dulu"*
**Lingkup (pilihan owner):** **semua** modal yang bisa dibuka dari `/admin`
**Commit sebelumnya yang jadi acuan:** `11e25f8` (dashboard admin) · `6a92f39` (12 modal admin)
**Status:** belum di-commit, belum di-push (R19)

---

## 📌 TL;DR

- **Probe lama menyatakan "12/12 modal bersih" — dan itu benar sekaligus tidak lengkap.** `6a92f39`
  memperbaiki **12** modal; probe yang mengukurnya juga memuat **12** modal yang sama. Keduanya
  berbagi satu titik buta, jadi kesepakatannya tidak membuktikan apa pun.
- **`ListKandidatModal` tidak ada di daftar mana pun** — padahal ia bisa dibuka dari `/admin#dbjob`
  (`TabDbJob.tsx:286`). Ia masih membawa **cacat pra-`6a92f39` yang persis**: tombol tutup 16×24 px.
- **Set yang bisa dibuka ternyata 17, bukan 12.** Ditambah: `CekSiswaModal`, `DocumentPreviewModal`,
  `LoginModal`, `WAPintarModal`.
- **9 cacat nyata diperbaiki, 0 regresi.** Setelah perbaikan: **11 dari 17 modal terukur bersih**;
  sisanya artefak yang sudah dibuktikan atau keputusan pemilik yang sudah tercatat.
- **Ditemukan juga 14 celah shim tema terang** (satu kelas cacat, bukan satu kejadian) — 2 di
  antaranya **terukur gagal** dan diperbaiki; 12 sisanya dilaporkan belum terukur.

---

## 🎯 Kartu kesimpulan

| Item | Isi |
|---|---|
| Modal diukur | **17** (bukan 12) × 2 viewport × 2 tema = 68 pengukuran |
| Cacat nyata diperbaiki | **9** (8 target sentuh + 2 kontras → lihat §2) |
| Artefak yang dibuktikan & **tidak** disentuh | **16** |
| Celah shim ditemukan | **14** · 2 diperbaiki · 12 dilaporkan |
| Regresi | **0** |
| Gerbang | tsc 0/0 · lint-ratchet PASSED (−21) · verify-classes 0 · 269/269 unit · e2e contrast 0 · dialog 20/0 · aria-names 40/0 |

---

## 1. Temuan terpenting: probe dan perbaikan berbagi titik buta

`admin-modals.mjs` (2026-10-01) memuat **tepat dua belas** modal. `6a92f39` lalu memperbaiki
**tepat dua belas** modal. Angka "12/12 bersih" karena itu **tautologis**.

`ListKandidatModal` tidak ada di salah satu daftar:

```
$ git show --stat 6a92f39 | grep -c ListKandidatModal
0
$ grep -c ListKandidatModal /tmp/ui-probe/admin-modals.mjs
0
```

Ia bisa dibuka dari `/admin#dbjob` — sel **count** adalah `<td onClick>` polos
(`TabDbJob.tsx:286`), bukan `<button>`, jadi tak ada selektor teks/role yang menemukannya.

> **Pelajaran yang berlaku umum:** probe yang **mendefinisikan lingkuрnya sendiri** tidak bisa
> mendeteksi modal yang hilang dari daftar. Yang bisa adalah **enumerasi himpunan yang benar-benar
> bisa dicapai** — di sini: apa saja yang di-mount `/admin`. `admin.astro` merender `<App>`
> (→ `LoginModal`, `CekSiswaModal`) + `<AdminPanel>` (→ 12 + `ListKandidatModal`) +
> `DocumentPreviewModal` bersarang di dalam `PemberkasanModal`.

---

## 2. Yang diperbaiki (semua terukur)

Ambang: **44×44 px** (`DESIGN.md:794,852`); di dalam formulir mobile 48 px (`:853`).

| # | Modal | Kontrol | Sebelum | Sesudah | Bukti |
|---|---|---|---|---|---|
| 1 | `ListKandidatModal` | tombol tutup | **16×24** | 44×44 | `hitIsSelf:true`, tanpa label, tanpa ancestor ≥44 |
| 2 | `ListKandidatModal` | `Copy WA` | 187×32 | min-h 44 | idem |
| 3 | `ListKandidatModal` | `Undang Grup` | 187×32 / 150×32 (ponsel) | min-h 44 | idem |
| 4 | `ListKandidatModal` | tombol ikon baris (mata) | **28×28** | 44×44 | idem |
| 5 | `ListKandidatModal` | tautan ikon WA baris | **28×28** | 44×44 | idem |
| 6 | `ListKandidatModal` | `Hapus` | 64×25 | min-h 44 | idem |
| 7 | `CekSiswaModal` | tombol tutup | **16×24** | 44×44 | satu-satunya kontrol <44 di modal itu |
| 8 | `PemberkasanModal` | `✓ Lihat` (pratinjau berkas) | **52×17** | min-h 44 | ×4 (satu per berkas terunggah) |
| 9 | `DocumentPreviewModal` | tombol tutup | **24×32** | 44×44 | idem |
| 10 | `DocumentPreviewModal` | tautan unduh | 36×28 | 44×44 | idem |
| 11 | `AdminShareModal` | kontras label chip | **2,84:1** | ≈14,9:1 | piksel tercat: teks `rgb(31,29,28)` di atas `rgb(97,100,110)` |
| 12 | `CandidateProfileModal` | kontras pil `ASJ-001` | **3,65:1** | ≈5,3:1 | piksel tercat di dalam padding pil: `rgb(170,208,233)` |

Tambahan yang **belum pernah bisa diukur** sebelum sesi ini: `✓ Lihat` (#8) hanya muncul kalau
kandidat punya berkas terunggah. Fixture lama memakai `berkas: {}` ⇒ tombol itu **tidak pernah
dirender**, jadi cacatnya tidak mungkin terlihat. Fixture diperbaiki lebih dulu (`berkasCatalog.ts`
`BERKAS_TAHAP1`: `kk`, `akte`, `pasport`, `ktp`).

### 2.1 Dua cacat kontras itu satu kelas: celah shim tema terang

Keduanya **Shape 1** dari doktrin repo ini: *sebuah alpha yang tidak pernah diketik*. Shim
`:where([data-theme="light"])` adalah allowlist **berbasis string kelas**, jadi apa pun yang tidak
diketik tetap memakai nilai gelap — sementara teks di dalamnya **dibalik** oleh shim.

```
global.css:428  .bg-slate-950        ✅
global.css:431  .bg-slate-950\/95    ✅
                .bg-slate-950\/60    ❌ HILANG  ← satu-satunya alpha lain yang dipakai repo
global.css:1114 :is(.bg-sky-500\/20,.bg-sky-500\/30,.bg-sky-600\/20)   ← /30 hilang
```

Setiap keluarga **saudara** (emerald, amber, rose) memuat `/30` untuk `-500`-nya sendiri. Itu
petunjuk yang dimaksud doktrin: **penyelesaian asimetris di keluarga tetangga**.

### 2.2 Dan memperbaiki satu sisi **memindahkan** kegagalannya

Perbaikan `bg-slate-950/60` membuat permukaan chip menjadi terang — dan seketika tiga aksen chip
(`text-pink-200`, `text-emerald-200`, `text-slate-200`) berhenti bekerja, karena dua yang pertama
**juga tidak pernah di-shim**:

| Aksen | Sebelum (chip gelap) | Sesudah bg saja (chip terang) | Sesudah lengkap |
|---|---|---|---|
| `text-slate-200` | 2,84 ❌ | ✓ | ✓ |
| `text-emerald-200` | ✓ (terang di atas gelap) | **1,12 ❌** | ✓ ≈4,85 |
| `text-pink-200` | ✓ | **1,22 ❌** | ✓ ≈5,33 |

> **Pelajaran:** memperbaiki permukaan **tanpa** memperbaiki tinta di atasnya tidak menghapus
> cacat kontras — ia memindahkannya ke sisi lain. Keduanya harus diperbaiki bersamaan, dan
> pengukuran ulang sesudahnya adalah satu-satunya cara mengetahuinya.

Kedua kelas ini dipakai **hanya** di `AdminShareModal` ⇒ radius ledakan nol.

### 2.3 Audit sistematis, bukan tambal dua titik

Dibandingkan **seluruh** utilitas `bg-*` beralpha yang dipakai `src/` terhadap yang di-shim,
per keluarga:

```
slate-950   used=[60,95]     shimmed=[95]      ← GAP
sky-600     used=[20,30]     shimmed=[20]      ← GAP
sky-500     used=[10,20]     shimmed=[20]      ← GAP
red-500     used=[10,20]     shimmed=[20]      ← GAP
amber-500   used=[10,20,80,90] shimmed=[20]    ← GAP
emerald-500 used=[20,25]     shimmed=[20]      ← GAP
rose-500    used=[10]        shimmed=[]        ← GAP
rose-600    used=[10]        shimmed=[]        ← GAP
rose-950    used=[30]        shimmed=[]        ← GAP
slate-600   used=[50]        shimmed=[]        ← GAP
slate-700   used=[40,50,60,80] shimmed=[50,60,80] ← GAP
violet-400  used=[80]        shimmed=[]        ← GAP
```

**14 celah total.** Dua diperbaiki (terukur gagal). **Dua belas sisanya DILAPORKAN, tidak
disentuh** — sebuah alpha yang tidak di-shim hanya cacat kalau terbukti demikian, dan
memperbaikinya tanpa mengukur adalah persis kebiasaan yang doktrin ini ada untuk mencegah.

---

## 3. Yang DIBUKTIKAN artefak — jangan "diperbaiki"

Probe melaporkan 16 kontrol <44 px yang **bukan** cacat. Masing-masing diperiksa: apakah ada
`<label>` ber-asosiasi atau ancestor yang bisa diklik dan ≥44 px (`elementFromPoint` di pusat
kontrol juga diperiksa).

| Modal | Laporan | Verdict | Bukti |
|---|---|---|---|
| `AdminShareModal` | 14× checkbox 16×16 | **artefak** | setiap `<label>` pembungkus 66–189 × **44** |
| `MatchmakingModal` | 2× radio 13×13 | **artefak** | `<label>` 105×44 dan 83×44 |

Ini temuan yang sama dengan yang sudah dicatat 2026-10-01 ("kotak centang 16x16 yang labelnya
sudah 66-108x44") — diukur ulang, bukan diasumsikan.

---

## 4. Yang TIDAK diperbaiki (dengan alasan)

| # | Temuan | Alasan |
|---|---|---|
| F23 | `LoginModal` **NOT EXERCISED** di keempat konteks | Bukan cacat: **tidak ada apa pun di `/admin` yang membukanya.** `App.tsx` me-mount-nya (`:841`) dan mendengarkan `asj-kandidat-login` (`:185`), tetapi `/admin` memakai `showHeader={false}`, jadi `SiteNav` — satu-satunya yang memancarkan event itu — tidak ada. Diukur: `visibleShells 0` sebelum **dan** sesudah dispatch; 0 `input[type=password]`; 0 tombol login/daftar di DOM. **Di luar lingkup**, bukan gagal. |
| F24 | `RirekishoBuilder` 85 node @ **10 px** | Lembar CV adalah **dokumen cetak**, bukan UI: ia putih di kedua tema dengan sengaja (`system-design-candidate-modals-2026-10-01.md` §F19). Lantai 11 px adalah lantai **antarmuka**. Mengubahnya mengubah dokumen yang dicetak & dikirim admin. |
| F22 | `RirekishoBuilder` tanpa heading | Sudah dicatat 2026-10-01 sebagai **keputusan pemilik** — menambah `<h3>` mengubah outline halaman dan `e2e:headings` menuntut tepat satu `h1`. |
| F25 | `EditCandidateModal`, `WAPintarModal`: kedalaman permukaan **4** | Dicatat. `6a92f39` sengaja tidak mengejar kedalaman 3 ("memperbaikinya adalah desain ulang, bukan pembersihan"); 4 memperkuat kasus itu, tapi tetap **desain ulang**, bukan polish. Keputusan pemilik. |
| F26 | `shadow-2xl` di panel `DocumentPreviewModal` | **Diperbaiki** sekalian — `DESIGN.md:955` menolaknya secara eksplisit dan `11e25f8` menghapus 56 bayangan kemarin dengan alasan yang sama. Dicatat di sini karena probe **tidak** bisa melihatnya (lihat §5). |

---

## 5. Tiga koreksi alat ukur (mahal ditemukan ulang)

### 5.1 `page.addStyleTag` **menetap** — pembacaan warna berikutnya terkontaminasi

Probe `shots-verify.mjs` memasker tinta (`*{color:transparent !important}`) untuk membaca piksel
latar. `addStyleTag` berlaku **selamanya untuk halaman itu**, jadi setiap `getComputedStyle(el).color`
sesudahnya mengembalikan `rgba(0,0,0,0)` — nilai dari mask-nya sendiri, bukan dari halaman.
Terlihat di keluaran sebagai `"color": "rgba(0, 0, 0, 0)"`. **Satu halaman per pengukuran**, atau
baca warna **sebelum** memasker.

### 5.2 "Sample beside the text" **salah** untuk elemen yang permukaannya miliknya sendiri

Doktrin menyarankan mengambil piksel **di samping** teks (agar tidak kena glyph). Untuk pil
`ASJ-001` itu justru **di luar** pil — dan mengembalikan latar kartu `rgb(244,240,244)`,
memberi **5,26:1 yang LULUS** untuk pil yang sebenarnya **3,65:1 gagal**. Untuk badge/pil,
sampel harus diambil **di dalam padding-nya sendiri** (`px-2` = 8 px ⇒ `x+4`).

### 5.3 Fixture yang salah **tipe** menghasilkan temuan palsu

Probe melaporkan chip hantu berlabel **`[OBJECT OBJECT]`**. Akarnya fixture, bukan kode:
`dokumenShare: {}` (objek) sementara kontraknya **string** koma-pisah (`'CV,JFT,SSW'`;
`TabTambah.tsx:141` menulis `.join(',')`). `parseDocsShare` melakukan
`String(saved || 'CV,JFT,SSW').toUpperCase().split(...)` ⇒ `String({})` = `"[OBJECT OBJECT]"` ⇒
menjadi chip.

**Dua arah kesalahan fixture, keduanya menipu:** fixture yang **tidak bisa mencapai** sebuah state
tidak bisa mengukurnya (`✓ Lihat` tak pernah dirender); fixture yang mengirim **tipe salah**
menciptakan temuan yang tidak ada di produksi. Keduanya diperbaiki di `F:/tmp/ui-probe/lib-admin.mjs`.

> Catatan jujur: `parseDocsShare` **tetap** diam-diam mengubah nilai non-string menjadi sampah
> yang bisa dirender. Itu tidak terjangkau sekarang (kontraknya string), tapi satu `typeof` guard
> akan mengubah "sampah senyap" menjadi default. **Dilaporkan, tidak diubah** — di luar lingkup polish.

### 5.4 Titik buta probe: bayangan pada panel itu sendiri

`panel.querySelectorAll('*')` **tidak** memuat panel, jadi `shadow-2xl` di elemen panel luput.
Terbukti hanya lewat pembacaan kode. Gate bayangan berbasis probe apa pun harus menyertakan
simpul akarnya.

---

## 6. Verifikasi

| Gerbang | Perintah | Hasil |
|---|---|---|
| Typecheck (main) | `tsc --noEmit -p tsconfig.json` | **0 error** |
| Typecheck (indexer) | `tsc --noEmit -p tsconfig.indexer.json` | **0 error** |
| Lint ratchet | `lint-ratchet.mjs --base=HEAD` | **PASSED** — utang −21, 0 diagnostik baru |
| Cakupan kelas | `verify-classes.mjs` | **exit 0** — setiap kelas punya aturan (1224 token / 238 berkas) |
| Surface binding | `surface-binding.mjs` | **pass** |
| Unit (komponen tersentuh) | `vitest run src/components/admin src/components/ui …` | **269/269 · 28 berkas** |
| Kontras seluruh situs | `e2e/test-contrast.mjs` | **0 di bawah lantai** (semua rute × 2 tema × 3 lebar) |
| Kontrak dialog | `e2e/test-dialog.mjs` | **20 lulus · 0 gagal** |
| Nama aksesibel | `e2e/test-aria-names.mjs` | **40 cek · 0 gagal** |
| Probe modal (sesudah) | `admin-modals-all.mjs` | **11/17 bersih**; sisanya artefak terbukti / keputusan pemilik |

`e2e:contrast` adalah gerbang terpenting di sini: perubahan `global.css` menyentuh **seluruh
situs**, bukan hanya `/admin`. Nol di bawah lantai berarti shim baru tidak meregresi apa pun.
(Gerbang itu sendiri melaporkan **2199 elemen "unmeasurable"** — dilewati, dan ia menyebutnya
**bukan** lulus.)

Pohon setelah sesi: **11 berkas termodifikasi**, tidak ada berkas nyasar di luar `deliverables/`.
`indexer/validate-report.json` tidak tersentuh (suite penuh tidak dijalankan).

---

## ✅ Action list

| # | Tindakan | Peran | Urgensi |
|---|---|---|---|
| 1 | Ukur 12 celah shim sisanya sebelum mengubahnya (`sky-500/10`, `rose-950/30`, `slate-700/40`, `amber-500/80|90`, `violet-400/80`, …) | sesi berikutnya | P2 |
| 2 | Putuskan F25 (kedalaman 4 di `EditCandidateModal`/`WAPintarModal`) — desain ulang atau biarkan | pemilik | P2 |
| 3 | Tambahkan gate kontras untuk **modal** — sekarang nol cakupan; `e2e:contrast` hanya mengukur 6 rute publik | pemilik/Tessa | P2 |
| 4 | Pertimbangkan guard `typeof` di `parseDocsShare` (sampah senyap → default) | sesi berikutnya | P3 |
| 5 | Commit 5 berkas sesi ini **bersama** 6 berkas yang belum di-commit dari sesi sebelumnya | team-lead | P0 sebelum push |

---

## 📚 Indeks bukti

**Skrip (di luar repo — `F:/tmp/ui-probe/`, supaya counter beku indexer tidak bergeser):**

- `admin-modals-all.mjs` — probe 17 modal × 2 viewport × 2 tema; melaporkan hanya cacat, dengan
  agregasi lintas konteks. **Pengganti** `admin-modals.mjs` (12 modal).
- `admin-modals-verify.mjs` — menegakkan verdict per kontrol: cacat vs artefak (`viaLabel`,
  `viaAncestor`, `hitIsSelf`).
- `final-contrast.mjs` — pembacaan warna bersih + piksel tercat; satu halaman per pengukuran (§5.1).
- `shim-audit.mjs` — 14 celah shim, per keluarga.
- `find-object.mjs` — melacak chip `[OBJECT OBJECT]` ke fixture (§5.3).
- `lib-admin.mjs` — fixture; **dua perbaikan**: `berkas` (agar `✓ Lihat` bisa dirender) dan
  `dokumenShare` (objek → string).

**Keluaran:** `out/admin-modals-all.json` (68 pengukuran), `out/badge-{light,dark}.png`,
`out/sharelabel-{light,dark}.png`.

**Berkas repo yang disentuh (5):**

```
src/components/admin/ListKandidatModal.tsx   7 kontrol → lantai 44 px; shadow → border (§3.6)
src/components/CekSiswaModal.tsx             1 kontrol → lantai 44 px
src/components/admin/PemberkasanModal.tsx    `✓ Lihat` → lantai 44 px
src/components/DocumentPreviewModal.tsx      2 kontrol → lantai 44 px; shadow-2xl dibuang (§3.6)
src/styles/global.css                        4 aturan shim baru + komentar bertanggal & terukur
```

---

> Laporan ini dihasilkan dari pengukuran di peramban sungguhan (`astro dev`, Chromium), bukan dari
> pembacaan sumber. Keputusan teknis penting tetap harus ditinjau oleh penanggung jawab engineering
> manusia.
