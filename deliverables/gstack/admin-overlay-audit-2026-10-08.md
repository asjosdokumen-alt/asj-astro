# Ronde 7 — panel admin diuji di browser, 4 overlay cacat (2026-10-08)

Cara kerjanya: aplikasi di-build, disajikan lokal (`node server.cjs` →
`localhost:4321`), lalu **setiap tab panel admin dibuka dan setiap pemicu di
badan tab diklik satu per satu** memakai Chromium sungguhan. Untuk tiap overlay
yang terbuka diperiksa: `role`, `aria-modal`, nama aksesibel, nama kontrol di
**dalamnya** (dibaca dari accessibility tree lewat CDP, bukan dari heuristik),
apakah Escape menutupnya, dan error konsol.

## Kenapa bug ini bisa lolos sampai sekarang

| Gate yang ada | Yang disetir | Kenapa tak melihat |
|---|---|---|
| `e2e/test-dialog.mjs` | `/public`, `/` | tidak pernah menyentuh `/admin` |
| `e2e/test-candidate-modals.mjs` | `/candidate` | bukan panel admin |
| `e2e/test-aria-names.mjs` | `/admin` (8 tab) | **membaca, tidak pernah mengklik** — jadi tidak satu pun kontrol DI DALAM overlay admin pernah diukur |

Jadi: 11 gate browser semuanya **hijau** sebelum pekerjaan ini, dan tetap hijau
sesudahnya — perbaikannya tidak menyentuh apa yang sudah dijaga. Yang dijaga
hanyalah bagian luar panel.

## Empat cacat, semuanya terukur

### 1. `CvTemplateSelector` — satu overlay TANPA `.u-modal-shell`
"Pilih Template CV" di `#pelamar`. Semua gate overlay memilih kelas itu, jadi
komponen ini **tak terjangkau oleh semuanya** — cacat yang sama persis dengan
`RejectMailModal`, yang sudah tercatat verbatim di
`src/components/ui/overlay-contract.test.tsx` ("invisible to the guard by CLASS,
not merely by route").

Tanpa `useOverlay` ia juga tidak punya `role`, `aria-modal`, Escape, maupun
pengelolaan fokus. **Satu-satunya jalan keluar adalah mouse** — pengguna
keyboard tetap terkurung di belakang scrim.

| | sebelum | sesudah |
|---|---|---|
| kelas | — | `.u-modal-shell` |
| role / aria-modal | — | `dialog` / `true` |
| nama | — | `PILIH TEMPLATE CV` (dari `<h3>`-nya) |
| Escape | tidak menutup | menutup |
| klik backdrop | menutup | menutup |
| klik di dalam panel | menutup | **tidak** menutup |
| fokus | di luar | dipindah ke dalam |

### 2. `EditCandidateModal` — kelasnya ada, tapi di elemen yang salah
`containerRef` dipasang di panel **dalam**, sehingga `role`/`aria-modal`/
`aria-labelledby` ditulis ke div yang tidak pernah dibaca sweep. Terukur di
browser: `.u-modal-shell` dengan `role=null`, `aria-modal=null`, nama `""` —
jadi dialog tanpa semantik apa pun, di depan sweep yang justru mencari itu.
Ref dipindah ke shell. Tombol tutupnya (glyph `aria-hidden`, tanpa label) kini
punya nama.

### 3. `UndanganKelasModal` — 3 kontrol tanpa nama
Diukur dari accessibility tree: **3 → 0**.

| kontrol | masalah | perbaikan |
|---|---|---|
| tombol tutup | glyph `aria-hidden`, tanpa `aria-label` | `aria-label={t('ui.close')}` |
| input "Jeda antar pesan" | `<label>` ada tapi **tidak terhubung** | `for` / `id` |
| textarea "Template pesan" | idem | `for` / `id` |

Dua field lain di modal yang sama hanya punya `placeholder` sebagai nama — sah
tapi lemah; keempatnya sekarang terhubung ke labelnya masing-masing.

### 4. Panel "CV AI" di `TabPelamar` — fitur yang pemilik pakai
Overlay layar penuh tanpa kelas dan tanpa semantik dialog, padahal ini panel
yang dibuka dari tombol "CV AI" di baris kandidat. Kini `.u-modal-shell` +
`role="dialog"` + `aria-modal="true"` + nama `Preview CV`.

**Escape dan backdrop SENGAJA dimatikan** di sini: ini editor, bukan dialog yang
ditutup. Escape nyasar akan membuang koreksi admin yang belum tersimpan.
Perilaku keluarnya tidak berubah — hanya semantiknya yang bertambah.

## Kontrak unit diperluas — dan dibuktikan bisa merah

`overlay-contract.test.tsx` sebelumnya hanya membaca komponen yang **disebut
namanya** (4 komponen). Dua yang cacat tidak ada di daftar itu — itulah sebabnya
mereka lolos. Sekarang keduanya masuk, 8 tes baru, dan saya buktikan tesnya tidak
hampa lewat tiga mutasi:

| mutasi | hasil |
|---|---|
| hapus `.u-modal-shell` dari `CvTemplateSelector` | **3 merah** (kelas, role/aria, nama) |
| kembalikan `containerRef` ke panel dalam | **1 merah** — "puts the semantics on the SHELL, not on the inner panel" |
| `closeOnEscape: false` | **1 merah** — "closes on Escape" |

## Verifikasi

| Gate | Hasil |
|---|---|
| 11 gate browser (`test-public` … `test-candidate-modals`) | **hijau semua** (`test-dialog` 20/20, `test-drawer` 7/7, `test-aria-names` bersih) |
| `vitest run` penuh | **183 berkas · 2240 tes**; 3 merah = artefak spawn sandbox (`EBUSY`), sudah terdokumentasi |
| `tsc --noEmit` | exit 0 |
| `lint-ratchet` | PASSED |
| `npm run build` | exit 0 |
| `overlay-contract.test.tsx` | 25 tes (dari 17) |

`lint-ratchet` sempat **merah** (`CvTemplateSelector` 5 → 7) karena saya menambah
`onClick` kedua di panel. Dibuang di sumber, bukan di baseline: `onBackdropClick`
dari hook sudah menjaga `e.target === containerRef`, jadi handler
`stopPropagation` itu memang mubazir.

Commit: **`cf3a652`**. ⛔ belum di-push.

## Catatan penting soal alat ini

Probe-nya **tidak di-commit**. `e2e/**` adalah tier terhitung (`mjs/cjs/js`
saja — `indexer/src/util.ts:81`), jadi menambah satu berkas `.mjs` di sana
memindahkan **tiga** angka beku (`files.length`, `fileCount`, `count('mjs')`)
di `indexer/src/{discover,build}.test.ts`, yang **hanya boleh diedit team-lead**.
Sesuai R13f, probe sekali-pakai hidup di `F:/tmp/admin-probe/`.

Artinya: **penjaganya sekarang ada di level unit** (kontrak overlay, 25 tes), dan
di level browser penutupnya adalah probe manual ini. Kalau pemilik mau ini jadi
gate permanen (`npm run e2e:admin-modals`), itu keputusan yang butuh
re-baseline counter oleh team-lead — saya tidak melakukannya sendiri.

## Sisa temuan yang BELUM saya perbaiki

1. **Drawer menu `App.tsx` saat tertutup masih bisa difokus.** Elemennya
   `translate-x-full` (di luar layar, x=1440 pada viewport 1440) tetapi tanpa
   `aria-hidden`/`inert`, jadi tombol-tombolnya tetap masuk urutan Tab dan
   diumumkan pembaca layar. Ini yang membuat probe saya sendiri sempat
   "gagal mengklik" tombol duplikat. Belum saya sentuh karena menyentuh
   navigasi global, di luar lingkup panel admin.
2. **Overlay lain yang belum saya klik satu per satu:** `AdminJobEditModal`,
   `CandidateProfileModal`, `AdminShareModal`, `MatchmakingModal`,
   `PemberkasanModal`, `RincianBiayaModal`, `AdminAiCopilot`, `RejectMailModal`
   (empat terakhir sudah tercakup kontrak unit). Tab `#tugas`, `#dbjob`,
   `#mail`, `#agenda`, `#config` tidak membuka overlay apa pun dengan fixture
   yang saya pakai — jadi "tidak ada temuan" di sana **belum** berarti "bersih",
   hanya berarti fixture-nya belum memunculkan pemicunya.
