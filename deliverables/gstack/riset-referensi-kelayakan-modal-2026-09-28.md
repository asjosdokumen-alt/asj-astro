# Referensi 2026 + Kelayakan di Base Code Sekarang — 2026-09-28

**Pertanyaan owner:** cari referensi lagi (internet + GitHub), lalu — kalau sudah
mentok maksimal — **bisa dijalankan dengan struktur base code kita sekarang?**

**Jawaban singkat:** **Ya, untuk animasi MASUK — tanpa satu baris JS pun diubah.**
Untuk animasi **KELUAR: tidak**, dan itu bukan soal CSS-nya, tapi soal
arsitektur render. Angkanya ada di bawah; tiga uji dijalankan terhadap toolchain
repo ini sendiri, bukan disimpulkan dari artikel.

---

## 1. Yang ditemukan di internet

### 1.1 Mekanisme native yang sekarang jadi standar

Sumber utama: *Now in Baseline: animating entry effects* (web.dev, 8 Agu 2024) dan
*Four new CSS features for smooth entry and exit animations* (Chrome for Developers).

| Fitur | Status | Untuk apa |
|---|---|---|
| `@starting-style` | **Baseline** sejak 6 Agu 2024 (Chrome 117 · Firefox 129 · Safari 17.5) | Menentukan keadaan **sebelum** elemen dirender — inilah yang memberi animasi masuk pada elemen yang baru muncul |
| `transition-behavior: allow-discrete` | **Baseline** sejak 6 Agu 2024 (Safari 17.4) | Mengizinkan `display` ikut ditransisikan, bukan hanya properti yang bisa diinterpolasi |
| `overlay` | **belum Baseline** (Safari 18.2) | Menahan elemen tetap di *top layer* selama animasi keluar |
| `<dialog>` | Safari 15.4 | Elemen dialog native |
| Popover API | Safari 17 | Overlay non-modal native |
| View Transitions | Safari 18 · Firefox 133 | Animasi morph antar-DOM-state |

### 1.2 Tiga jebakan yang disebut eksplisit di sumbernya

Semuanya akan menggigit kalau ditulis tanpa membacanya:

1. **`transition-behavior: allow-discrete` HARUS ditulis SETELAH shorthand
   `transition`.** Kalau sebelum, shorthand menimpanya kembali ke `normal` dan
   transisinya diam-diam tidak jalan.
2. **Aturan di dalam `@starting-style` mengikuti cascade biasa** — ia tidak
   otomatis menang. Harus diletakkan **setelah** deklarasi non-starting-style.
3. **`display` dan `content-visibility` berganti nilai di AWAL transisi (saat
   masuk) atau di AKHIR (saat keluar)** — bukan di titik 50 % seperti properti
   diskret lain. Ini yang membuat exit bisa "hilang sebelum terlihat".
4. **`overlay` hanya perlu untuk elemen di top layer** (`<dialog>`, popover).
   Tanpa `overlay`, elemen langsung ter-clip lagi dan animasi keluarnya tidak
   terlihat.

### 1.3 GitHub — dan kenapa tidak ada yang cocok

| Repo | Isi | Kenapa tidak dipakai di sini |
|---|---|---|
| **chakra-ui/ark** (di atas Zag.js) | 30+ komponen headless, banyak framework | Menambah lapisan dependensi + mesin state machine untuk 6 modal yang **sudah bekerja**. Repo ini punya `preact/compat` alias, jadi secara teknis bisa — tapi biayanya tidak sepadan |
| **Radix UI** | Primitif headless React, a11y kelas satu | Sama: React-first. Sudah diselesaikan `useOverlay` (28 berkas memakainya) |
| **Reka UI / Radix Vue** | Varian Vue | Tidak relevan (repo ini Preact) |
| **Vaul / react-modal-sheet** | Bottom sheet dengan gestur | Khusus React; sheet-nya bisa dibuat dengan `@container` + `translateY(100%)` tanpa dependensi |

**Kesimpulan dari GitHub:** tidak ada satu pun yang layak ditambahkan. Bukan
karena kualitasnya, tapi karena repo ini **sudah punya** bagian tersulitnya
(focus trap, restore focus, Escape, penamaan `aria-labelledby`) di `useOverlay`,
dan yang kurang cuma CSS. Menarik dependensi untuk menggantinya = membuang 28
call site yang sudah lolos gate.

---

## 2. Tiga uji terhadap base code repo ini

Bukan pembacaan dokumen. Tiga uji dijalankan dengan toolchain repo sendiri.

### Uji 1 — Apakah `lightningcss` @ `targets: { safari: 15 }` membuang fitur ini?

Ini risiko terbesar, karena `global.css:134` mencatat bahwa toolchain ini
**sudah pernah** membuang deklarasi duplikat (`min-height: 100vh; 100svh;`
hanya menyisakan yang terakhir).

```
lightningcss 1.x · minify:true · targets:{safari:15<<16}
→ @starting-style : DIPERTAHANKAN (byte-identik)
→ allow-discrete  : DIPERTAHANKAN
→ overlay         : DIPERTAHANKAN
```

**Hasil: aman.** Toolchain tidak menyentuhnya. Target Safari 15 tidak membuatnya
dibuang — dan memang tidak seharusnya, karena CSS asing **diabaikan**, bukan
menjadi error.

### Uji 2 — Animasi MASUK pada pola mount/unmount yang repo pakai sekarang

`CandidateDash.tsx:783-789` merender `{showX && <Modal/>}` — komponen **di-mount
saat dibuka, di-unmount saat ditutup**. Diuji persis pola itu:

| Waktu | `opacity` | `transform` |
|---|---|---|
| tepat setelah mount | **0** | `matrix(0.97, 0, 0, 0.97, 0, 12)` |
| +30 ms | 0,43 | di tengah jalan |
| +330 ms | **1** | `none` |

**`@starting-style` bekerja pada elemen yang baru di-mount.** Tidak perlu
mengubah komponen, tidak perlu menambah kelas, tidak perlu JS. Cukup CSS.

### Uji 3 — Animasi KELUAR pada pola yang sama

| Perlakuan | Hasil terukur |
|---|---|
| `element.remove()` (pola sekarang) | **"TIDAK ada frame untuk animasi keluar"** — elemen hilang seketika |
| `classList.add('is-closing')` (tetap ter-mount) | +60 ms → `opacity` 0,034 — animasi keluarnya **jalan** |

**Keluar tidak bisa tanpa perubahan JS.** Bukan karena CSS-nya kurang, tapi
karena Preact membuang node-nya lebih dulu. Tidak ada elemen untuk dianimasikan.

### Uji tambahan — apakah ini akan merusak yang sudah ada?

| Kekhawatiran | Terukur |
|---|---|
| Gate `e2e/test-dialog.mjs` jadi flaky | **Tidak.** Ia menunggu 350–900 ms sebelum mengassert (`waitForTimeout(450/800/900)`); animasi 200 ms sudah mendarat jauh sebelumnya |
| `prefers-reduced-motion` terjebak di `opacity: 0` | **Tidak.** Dengan aturan repo apa adanya (`global.css:1528-1534`, `transition-duration: .01ms !important`): `reduce` → opacity **1** pada 30 ms. Terlihat langsung |
| Perlu `overlay`? | **Tidak.** Modal repo ini `position: fixed` biasa, **bukan** elemen top layer. Jadi `overlay` tidak relevan — mekanismenya lebih sederhana daripada kasus `<dialog>` |

---

## 3. Jawaban: tiga tingkat, dan mana yang boleh dikerjakan sekarang

### Tingkat 1 — BISA HARI INI · nol perubahan JS · nol risiko

Animasi **masuk** untuk seluruh modal, lewat satu blok di `motion.css`:

```css
@supports (transition-behavior: allow-discrete) {
  .u-modal-shell .panel, .u-modal-shell > * > * {
    transition: opacity var(--u-modal-in) var(--ease-out-expo),
                transform var(--u-modal-in) var(--ease-out-expo);
  }
  @starting-style {
    .u-modal-shell .panel, .u-modal-shell > * > * {
      opacity: 0;
      transform: translateY(12px) scale(.97);
    }
  }
}
```

Kenapa ini aman:

- **Di dalam `@supports`** — browser yang tidak mendukung (Safari < 17.4)
  mengabaikan seluruh blok dan mendapat **perilaku hari ini**: modal muncul
  seketika. Bukan rusak, hanya tidak beranimasi. Ini pola yang repo sudah pakai
  di `global.css:162-170`.
- **`@starting-style` diletakkan setelah** deklarasi biasa (jebakan 2 di atas).
- **Tanpa `allow-discrete`** — karena tidak ada `display` yang ditransisikan.
  Elemen baru muncul; animasi masuknya datang dari `@starting-style`.
- **Tidak menyentuh `useOverlay`** — 28 berkas tidak perlu diubah.
- **Nol risiko gate** — Uji 4 di atas.

Yang **tidak** didapat di tingkat ini: animasi keluar, stagger, dan scrim yang
memudar. Scrim sebenarnya bisa ikut di sini (ia juga elemen baru saat mount) —
jadi Tingkat 1 bisa mencakup **scrim + panel sekaligus**.

### Tingkat 2 — SATU perubahan terbatas · `useOverlay` + 5 tempat

Animasi **keluar**. Butuh overlay bertahan satu transisi. Bentuknya kecil:

```
useOverlay({ open, onClose, ... })  →  mengembalikan { closing }
```
Ketika `open` menjadi `false`, hook menahan `closing = true` selama
`transitionend` (atau timeout `--u-modal-out` + 60 ms), baru melepas. Di sisi
komponen, `{showX && <Modal/>}` menjadi `<Modal open={showX} />` yang tetap
ter-mount dan menulis kelas `.is-closing`.

**Radius ledakan:** `useOverlay.ts` + 5 tempat conditional-render di
`CandidateDash.tsx` + `e2e/test-dialog.mjs` (menambah satu assert bahwa overlay
**akhirnya** hilang, bukan seketika). Bukan 28 berkas — hook-nya bertambah, call
site-nya tidak harus ikut berubah kalau `open` dibuat opsional dengan default
`true` (perilaku lama).

**Yang harus diwaspadai:** `e2e/test-dialog.mjs` mengassert overlay punya
`role` dan nama. Kalau overlay sekarang bertahan 140 ms lebih lama, assert
"tidak ada dialog tersisa" setelah tutup bisa gagal. Itu **satu** tempat yang
perlu disesuaikan — dan justru bagus, karena berarti gate-nya memang menjaga.

### Tingkat 3 — perubahan arsitektur · TIDAK disarankan sekarang

`<dialog>` native atau Popover API. Alasannya bukan "sulit", tapi:

1. **28 berkas** memakai `useOverlay`; `<dialog>` menuntut `showModal()` di
   semuanya.
2. **Top layer tidak terlihat oleh skala z-index repo.** `theme.css:78-84` ada
   persis untuk mencegah kelas bug ini — dan `DESIGN.md §3.8` menyebut skala itu
   "sudah lengkap".
3. **Focus trap jadi ganda** — `<dialog>` sudah menangkap fokus, `useOverlay`
   juga. Dua penjaga untuk satu pintu.
4. **Keuntungannya kecil.** Yang `<dialog>` beri (trap, Escape, `aria-modal`,
   inert latar) **sudah** dikerjakan `useOverlay` dan sudah diuji
   `e2e/test-dialog.mjs` (647 baris) + `overlay-contract.test.tsx` (263 baris).

**View Transitions** juga bukan jawabannya di sini: ia untuk **morph antar-DOM
state** (daftar → detail), sedangkan modal ini tidak berpindah halaman. Dan
Safari 18+ masih di atas lantai target repo.

---

## 4. Kalau sudah "mentok maksimal", ini plafonnya

| | Bisa sekarang | Butuh Tingkat 2 | Butuh Tingkat 3 |
|---|---|---|---|
| Scrim memudar masuk | ✅ | | |
| Panel masuk (dialog/sheet/layar penuh/A4) | ✅ | | |
| Sheet `translateY(100%)` di HP | ✅ | | |
| **Keluar** (semua archetype) | | ✅ | |
| Stagger header→body→footer | | ✅ | |
| Modal bawah mundur saat bersarang | | ✅ | |
| Animasi `::backdrop` native | | | ✅ |
| `inert` otomatis di latar | | | ✅ |

**Plafon nyata repo ini tanpa menyentuh arsitektur: animasi masuk penuh + scrim.**
Itu sudah mencakup 4 dari 8 baris, termasuk yang paling terasa (modal tidak lagi
"nongol"). Sisanya menuntut Tingkat 2, dan Tingkat 2 itu **kecil** — satu hook
plus lima tempat.

---

## 5. Rencana konkret

**Tingkat 1 — bisa dikerjakan tanpa risiko, satu irisan:**
1. Tambah `--u-modal-in: 200ms` + `--u-modal-out: 140ms` di `theme.css`.
2. Satu blok `@supports` di `motion.css` (di dalam blok
   `prefers-reduced-motion: no-preference`, karena animasi masuk tidak boleh
   bergantung pada animasinya).
3. Perluas `e2e/test-dialog.mjs`: assert `opacity` mencapai 1 setelah 400 ms —
   supaya "modal terlihat" tidak pernah jadi asumsi.
4. Jalankan mutation battery `e2e/test-dialog.mutations.sh` untuk membuktikan
   assert barunya bisa gagal.

**Tingkat 2 — setelah Tingkat 1 hijau:**
5. `useOverlay` mengembalikan `closing`; default `open: true` supaya 28 call
   site lama tidak berubah.
6. Migrasi **satu** modal dulu — `ChangePasswordModal` (90 baris, terkecil).
7. Sesuaikan satu assert di `test-dialog.mjs` yang mengharapkan overlay hilang
   seketika.

---

## 6. Sumber

| Sumber | Diambil |
|---|---|
| web.dev — *Now in Baseline: animating entry effects*, 8 Agu 2024 | Status Baseline `@starting-style` + `allow-discrete`; catatan bahwa animasi **keluar** dan `::backdrop` **belum** Baseline |
| Chrome for Developers — *Four new CSS features for smooth entry and exit animations* | Kode masuk+keluar; **empat jebakan** di §1.2; peran `overlay` |
| MDN — `transition-behavior`, `overlay`, `@starting-style` | Tabel dukungan per browser |
| css.properties / caniuse | Status `overlay` |
| GitHub: chakra-ui/ark, Radix UI, Reka UI, Vaul | Dinilai dan **ditolak**, alasannya di §1.3 |
| `DESIGN.md §3.7`, `§3.8` · `global.css:134,162-170,1528-1534` · `theme.css:78-84` | Kebenaran internal repo |
| Uji 1–4 di dokumen ini | `lightningcss` 1.x, Chromium, `targets: { safari: 15 }` |

**Cara mengulang pengukuran:** uji 1 ada di riwayat perintah (satu berkas
`node -e` memakai `lightningcss.transform`); uji 2–4 memakai
`F:/tmp/feas-entry-exit.html` + `F:/tmp/verify-rm.cjs`. Semuanya di luar repo.
