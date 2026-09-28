# Review UI + Optimasi Modal — Dashboard Kandidat (2026-09-28)

**Cakupan:** `/candidate` → `src/components/candidate/CandidateDash.tsx` (50.696 B) dan
**enam** overlay yang dibukanya. **Metode:** baca sumber + ukur dengan `grep`/`wc` di
`HEAD` (`main`, tree bersih). **Nol perubahan kode** — dokumen ini usulan.

Mockup: `_mockup-modal-kandidat-2026.html` (satu berkas, tanpa CDN, token asli dari
`src/styles/theme.css`, ada toggle tema).

---

## 0. Ringkasan satu paragraf

Fondasi modal di repo ini **sudah benar dan jarang**: `useOverlay` menangani focus
trap, restore focus, Escape fase-capture, `role`/`aria-modal`/`aria-labelledby`, dan
`u-modal-shell` + `prefers-reduced-transparency` menangani biaya blur. Yang belum ada
adalah **lapisan di atasnya**: enam modal menyalin shell masing-masing, sehingga
scrim, z-index, radius, target sentuh, dan penanganan form **menyimpang satu sama
lain** — dan penyimpangannya justru pada hal-hal yang `DESIGN.md` sudah tetapkan
angkanya. Tidak ada satu pun dari enam modal yang punya *sticky footer*, padahal
empat di antaranya membuat panelnya sendiri jadi area scroll, sehingga tombol
simpannya **ikut tergulir keluar layar**. Itu cacat yang paling terasa bagi kandidat
dan paling murah diperbaiki.

---

## 1. Enam modal yang ada (terukur)

| # | Komponen | Baris | Scrim | z | Radius panel | Akses area scroll |
|---|---|---|---|---|---|---|
| 1 | `ChangePasswordModal.tsx` | 90 | `bg-black/70` | `z-[200]` | `rounded-[2rem]` | **tidak ada `max-h`** |
| 2 | `CvMiniModal.tsx` | 188 | `bg-black/70` | `z-[200]` | `rounded-[2rem]` | **panel** (`max-h-[85vh]`) |
| 3 | `candidate/InterviewSimulatorModal.tsx` | 385 | `bg-black/90` | `z-[300]` | `rounded-t-[2rem]` | body (benar) |
| 4 | `EsignNaiteiModal.tsx` | 356 | `bg-black/80` | `z-[300]` (+`z-[999]`) | `rounded-[2rem]` | **panel** (`max-h-[90vh]`) |
| 5 | `admin/PemberkasanModal.tsx` | 641 | `bg-black/80` | `z-[260]` | `rounded-[2.5rem]` | **panel** (`max-h-[90vh]`) |
| 6 | `DocumentPreviewModal.tsx` | 337 | `bg-black/80` | `z-[300]` | `rounded-2xl` | konten |

Tidak ada `src/components/ui/Modal.tsx`. Enam shell ditulis tangan, satu per modal.

---

## 2. Temuan terukur

Setiap baris punya **angka + perintah yang bisa diulang**, bukan kesan.

### 2.1 Shell & token

| ID | Temuan | Terukur | Kenapa penting |
|---|---|---|---|
| **M-01** | 6 modal, 6 shell salinan, 0 primitif bersama | `ls src/components/ui/` → tidak ada `Modal.tsx` | Setiap perbaikan harus dikerjakan 6×, dan drift-nya tidak terdeteksi gate mana pun |
| **M-02** | Opasitas scrim punya **3 nilai** | `/70` ×2, `/80` ×3, `/90` ×1 | Riset 2026 menyarankan **40–70 %**. Tiga modal lebih gelap dari yang perlu — kedalaman spasial hilang, dan blur lebih mahal dari yang diperlukan |
| **M-03** | z-index angka ajaib, token diabaikan | `z-[200]`×2, `z-[260]`×1, `z-[300]`×3, `z-[999]`×1 | `--z-index-modal` (200) & `--z-index-popover` (300) **ada**. `260` dan `999` **tidak punya token** — lapisan tumpukan yang tak terbaca dari satu tempat |
| **M-04** | Radius arbitrer masih hidup di modal | `rounded-[2rem]` ×4, `rounded-[2.5rem]` ×1 | `DESIGN.md` **T-04** menandai migrasi 39 nilai radius → 5 token sebagai **"✅ selesai"**. Lima nilai ini lolos. `--radius-band` (2rem) sudah persis nilainya |
| **M-16** | Kelas slate mentah, bukan token semantik | `bg-slate-900`, `border-slate-700`, `text-slate-400` di 6/6 berkas | `theme.css` ditulis untuk menggantikan shim `!important`. Modal masih bergantung pada shim itu — jadi kelas baru apa pun di dalamnya menambah permukaan shim |

### 2.2 Aksesibilitas (semua terukur)

| ID | Temuan | Terukur | Dampak |
|---|---|---|---|
| **M-05** | **3 tombol tutup tanpa nama aksesibel** | `grep -c aria-label` → `ChangePasswordModal` **0**, `CvMiniModal` **0**, `DocumentPreviewModal` **0** | Tombol ikon `times` tanpa teks → pembaca layar mengumumkan "tombol". `useOverlay` menamai *dialog*-nya, bukan *kontrol tutupnya*. Ironis: 3 modal lain (Interview, Esign, Pemberkasan) **sudah** punya `aria-label` — jadi ini inkonsistensi, bukan ketidaktahuan |
| **M-06** | Target sentuh di bawah lantai terdokumentasi | Tombol tutup = `<button class="text-slate-400 hover:text-white"><Icon class="text-xl"/></button>` → ~20–24 px; `DocumentPreviewModal` `p-1` | `DESIGN.md` §6.4: **44×44 px** umum, **48×48 px** di form mobile. Ini pelanggaran lantai, dan tombol tutup adalah kontrol yang paling sering ditekan di modal |
| **M-15** | Latar tidak pernah di-`inert`/`aria-hidden`, tidak ada `aria-describedby`/`aria-busy` | `useOverlay.ts` menulis `role`+`aria-modal`+`aria-labelledby` saja | `aria-modal="true"` *mengklaim* latar inert tanpa membuatnya inert; browser lama + screen reader tertentu tetap bisa mencapai konten belakang. Riset 2026 minta `aria-hidden`/`inert` eksplisit, `aria-describedby` untuk subjudul, dan `aria-busy` saat submit |

### 2.3 UX form & alur

| ID | Temuan | Terukur | Dampak |
|---|---|---|---|
| **M-07** | **Judul + tombol simpan ikut tergulir** | `u-scroll-area` dipasang di **panel** pada 4 modal (`CvMini`, `Esign`, `Pemberkasan`; `ChangePassword` bahkan tanpa `max-h`) | Di layar pendek / body panjang, kandidat kehilangan judul (tidak tahu sedang di mana) **dan** CTA (tidak tahu cara menyimpan). Panduan 2026: header + footer **lengket**, hanya body yang bergulir |
| **M-09** | Validasi lewat `showToast`, bukan inline | `ChangePasswordModal` (3× `showToast`), `CvMiniModal` | Error muncul jauh dari field dan hilang sendiri. Tidak ada `aria-invalid`/`aria-describedby` → kandidat memperbaiki sambil menebak |
| **M-10** | Tidak ada `<form>`, jadi **Enter tidak mengirim** | 0 elemen `<form>` di 6 modal; semua `<button onClick>` | Di modal kata sandi, menekan Enter setelah field terakhir — refleks universal — tidak melakukan apa pun |
| **M-11** | Tanpa show/hide password, tanpa checklist syarat | `ChangePasswordModal` hanya punya `<p class="text-[11px]">` statis | Mengetik kata sandi 6–20 karakter tanpa bisa melihatnya, di ponsel, adalah sumber gagal-ulang. Checklist syarat hidup = perbaikan termurah di halaman ini |
| **M-12** | Upload foto = `<input type="file">` polos dalam kotak putus-putus | `CvMiniModal:176-180` | Tanpa drag & drop, tanpa pratinjau, tanpa `capture` (kamera ponsel), tanpa progres. Foto adalah berkas yang paling sering gagal diunggah |
| **M-13** | Tanpa penjaga perubahan belum tersimpan | 3 modal (CvMini, ChangePassword, Pemberkasan) | Escape / klik backdrop membuang ketikan tanpa satu pun peringatan. Panduan 2026: backdrop-dismiss boleh ditekan **hanya bila data tidak akan hilang** |
| **M-14** | Mobile: hanya 1 dari 6 yang bottom sheet | 5 modal `flex items-center justify-center p-4` | Riset 2026: sheet bawah terasa lebih native **dan menghindari keyboard yang menutupi field** — masalah persis yang dihadapi `CvMiniModal` (7 field) dan `ChangePasswordModal` (3 field) |
| **M-08** | Tanpa animasi masuk/keluar | 0 transisi pada panel; `motion.css` punya kurvanya tapi tidak dipakai modal | Modal "nongol". Panduan 2026: **150–250 ms**, fade backdrop + translasi/scale kecil. Repo sudah punya `--ease-out-expo` dan default **180 ms** — tinggal dipakai |

---

## 3. Dashboard kandidat itu sendiri (4 temuan)

Kandidat membuka dashboard, bukan modal. Modal hanya 6 dari masalahnya.

| ID | Temuan | Terukur | Usul |
|---|---|---|---|
| **D-01** | **Bukan bento, padahal `DESIGN.md` §1.2 mewajibkannya** | Isi = tumpukan vertikal `glass-panel ... max-w-4xl mx-auto` berisi `max-w-xl` berulang | Pakai `u-grid-auto--panels` (min 20rem) → 2 kolom di ≥768 px. Tinggi halaman turun ~35–40 %, dan mata tidak perlu menyapu satu kolom sempit di monitor lebar |
| **D-02** | **Lebar tidak konsisten sepanjang halaman** | `max-w-4xl` (896 px) untuk panel induk, `max-w-xl` (576 px) untuk CV progress, jadwal, catatan | Satu skala: konten penuh di dalam kolom bento. Tepi kiri-kanan yang bergoyang adalah penyebab halaman terasa "belum selesai" |
| **D-03** | 4 gradien latar bersaing | `from-sky-950 to-indigo-950`, `from-amber-950 to-rose-950`, `from-slate-900 via-slate-800`, `from-amber-400 to-yellow-600` | Satu permukaan (`surface-raised`) + aksen hanya pada **satu** elemen per kartu. Gradien besar = biaya paint dan hirarki yang rata |
| **D-04** | Grid aksi 7 tombol → baris terakhir pincang | `u-grid-auto--cards` (min 15rem) + 7 tombol → 3+3+1 | Jadikan 6 aksi utama + 1 aksi sekunder terpisah, atau 2×4. Baris yang tidak penuh terbaca sebagai kesalahan |

---

## 4. Usulan: satu primitif, enam pemakaian

### 4.1 `src/components/ui/ModalShell.tsx` (baru)

Kontrak delapan slot, semua opsional kecuali `open`/`onClose`/`title`:

```
<ModalShell
  open onClose
  title titleIcon tone        → header lengket, ikon + judul
  subtitle                    → aria-describedby (M-15)
  size="sm|md|lg|xl|full"     → 24rem / 28rem / 32rem / 56rem / 100%
  variant="center|sheet"      → sheet otomatis di ≤640px (M-14)
  footer={…}                  → footer lengket (M-07)
  dirty={boolean}             → konfirmasi tutup (M-13)
  busy={boolean}              → aria-busy + kunci tombol (M-15)
>
```

Yang dikerjakan primitif ini, sekali, untuk selamanya:

1. Scrim **`bg-black/60`** — satu nilai, di dalam rentang 40–70 % (M-02).
2. `z-modal` / `z-popover` dari token; **tidak ada** `z-[260]` (M-03).
3. `rounded-panel` (24 px) + `max-h-[min(90dvh,…)]` — `dvh`, bukan `vh` (M-04).
4. **Header lengket** (`sticky top-0`, `surface-raised`, border bawah) dan
   **footer lengket** (`sticky bottom-0`, border atas) — hanya `.u-scroll-area` di
   body yang bergulir (M-07).
5. Tombol tutup **44×44 px** dengan `aria-label` wajib — kalau kosong, TypeScript
   menolak kompilasi (M-05, M-06).
6. Animasi masuk/keluar **180 ms** `--ease-out-expo`: opacity + `translateY(8px)` /
   `scale(.98)`; dinetralkan oleh blok `prefers-reduced-motion` yang sudah ada (M-08).
7. `inert` pada sibling di luar overlay + `aria-describedby` + `aria-busy` (M-15).
8. Mobile: `variant="sheet"` → `rounded-t-panel`, `items-end`, drag handle, dan
   tombol tutup 48 px (lantai form mobile, §6.4) (M-14).

**Kenapa bukan `<dialog>` native.** Riset 2026 merekomendasikannya, dan di repo ini
`useOverlay` **sudah memberi** yang `<dialog>` berikan (focus trap, restore, Escape,
`aria-modal`). Mengganti berarti membuang 21 call site yang sudah bekerja, dan
`showModal()` menambah satu lapisan *top-layer* yang tidak terlihat oleh skala
z-index repo — persis kelas bug yang `theme.css:78-84` ada untuk mencegahnya. Jadi:
**pertahankan `useOverlay`, tambahkan `ModalShell` di atasnya.**

### 4.2 Optimasi per modal

| Modal | Perubahan | Kenapa |
|---|---|---|
| **Ganti Password** | (a) `<form onSubmit>` → Enter mengirim (M-10). (b) Ikon mata show/hide per field (M-11). (c) **Checklist syarat hidup**: ≥6, ≤20, tanpa spasi, cocok — centang berubah saat mengetik. (d) Error inline di bawah field + `aria-invalid` (M-09). (e) Meter kekuatan 3 tingkat | Modal paling sering gagal-ulang di halaman ini. Checklist memindahkan aturan dari teks 11 px yang tidak dibaca ke umpan balik yang tidak bisa dilewatkan |
| **Update CV Mini** | (a) Footer lengket (M-07). (b) Dropzone nyata: drag & drop, **pratinjau thumbnail bulat**, `capture="user"` di mobile, progres unggah (M-12). (c) Cincin progres per bagian (biodata 4/7 → 7/7) menggantikan satu grid datar. (d) Validasi numerik inline (usia 15–60, TB 120–200, BB 30–120) (M-09). (e) Penjaga `dirty` (M-13) | 7 field dalam satu grid tanpa progres membuat kandidat tidak tahu kapan selesai |
| **Simulasi Interview** | Sudah paling dekat 2026 (bottom sheet + body scroll). Polish: (a) drag handle + swipe-to-dismiss, (b) tombol kirim 48 px, (c) `aria-live="polite"` pada area chat supaya jawaban AI diumumkan | Satu-satunya modal yang polanya sudah benar — jangan dirombak, cukup disamakan |
| **E-Sign Naitei** | (a) Footer lengket; 2 blok pihak jadi **stepper** (Pihak 1 → Pihak 2 → Tinjau → Tanda tangan) dengan progres (M-07). (b) `z-[999]` → `z-popover`/`z-modal` (M-03). (c) Tombol tutup `absolute` diganti ke dalam header lengket supaya tidak menabrak judul di 360 px | 356 baris + 2 blok + permukaan gambar penuh = paling mudah tersesat |
| **Pemberkasan** | (a) Header lengket membawa **identitas + cincin progres berkas** (mis. 5/9) supaya kandidat tahu posisinya tanpa menggulir. (b) Footer lengket = CTA simpan. (c) `rounded-[2.5rem]` → `rounded-panel`. (d) Baris berkas: status + aksi sejajar, target 48 px | `max-w-4xl` + `max-h-[90vh]` pada panel = judul hilang di layar 800 px |
| **Preview Dokumen** | (a) Toolbar dengan label teks, bukan ikon telanjang (`title` saja bukan nama aksesibel) (M-05). (b) Kontrol zoom + navigasi halaman. (c) Tombol tutup 44 px. (d) `role="toolbar"` + urutan Tab eksplisit | Viewer adalah tempat orang mencari tombol "unduh" — ikon 16 px tanpa label adalah tempat terburuk untuk menebak |

---

## 5. Rujukan (diakses 2026-09-28)

| Sumber | Dipakai untuk |
|---|---|
| *Modal & Dialog Design Best Practices (2026)* — shaheermalik.com, 19 Jun 2026 | Anatomi 6 bagian; modal hanya untuk satu tugas; hindari menumpuk modal |
| *Modal Design: Best Practices for 2026* — framerwebsites.com, 19 Mei 2026 | **Angka konkret**: scrim 40–70 %, lebar 400–600 px, animasi **150–250 ms**, bottom sheet di mobile, `role`/`aria-modal`/`aria-labelledby`/`aria-describedby`, `aria-hidden` latar, portal di akhir `body` |
| *Mastering Modal UX* — eleken.co, Sep 2026 | Label tombol berbasis hasil ("Hapus berkas", bukan "OK"); maksimum 2 tombol aksi; contoh diskonfirmasi untuk perubahan belum tersimpan (ClearPoint) |
| *UI Design Trends for 2026* — midrocket.com, 12 Mar 2026 | Bento grid, glassmorphism 2.0 (translucency tipis + border gradien, **bukan** blur tebal), kematangan dark-mode, **transparansi AI**: pengguna harus tahu kapan AI terlibat |
| *DESIGN.md* repo ini, §1.2 / §3.7 / §3.8 / §6.2 / §6.4 | Sumber kebenaran internal: tren yang **sengaja ditolak** (kinetic type, 3D, scroll-jacking), kurva & durasi gerak, skala z, lantai target sentuh 44/48 px |

**Catatan keselarasan.** `DESIGN.md` §1.2 sudah menolak kinetic typography dan 3D.
Usulan di dokumen ini **tidak** menambah keduanya. Yang ditambahkan hanya yang
`DESIGN.md` sendiri sudah minta tetapi modal belum lakukan: lantai target sentuh,
token radius, token z-index, dan gerak 180 ms.

---

## 6. Urutan pengerjaan yang disarankan

Masing-masing satu irisan vertikal, bisa di-commit sendiri.

1. **`ModalShell` + migrasi `ChangePasswordModal`** — modal terkecil, jadi bukti
   konsep termurah. Membuktikan header/footer lengket, target 44 px, Enter-submit,
   animasi 180 ms sekaligus.
2. **`CvMiniModal`** — memakai primitif yang sama + dropzone foto + validasi inline.
3. **`PemberkasanModal`** + **`EsignNaiteiModal`** — header lengket berisi progres.
4. **`DocumentPreviewModal`** — toolbar berlabel.
5. **`InterviewSimulatorModal`** — polish saja (drag handle, `aria-live`).
6. **Dashboard: `D-01`–`D-04`** — bento + satu skala lebar + grid aksi 2×4.

### Gate yang menyentuh pekerjaan ini

- `e2e/test-dialog.mjs` — **sudah** memeriksa `role`/nama tiap overlay. Setiap
  `ModalShell` baru wajib lolos tanpa pengecualian.
- `src/components/ui/overlay-contract.test.tsx` — kontrak `useOverlay`. Kalau
  `ModalShell` memakai hook itu, kontraknya ikut berlaku.
- `lint-ratchet` — berkas baru mulai dari **0 diagnostik**, jadi pola warisan
  (`bg-slate-900` mentah, `<button>` tanpa `type`) harus dibersihkan saat pindah.
- `scripts/ci/check-md-tables.mjs` — memindai `docs/**`; dokumen ini di
  `deliverables/`, di luar jangkauannya.

---

## 7. Yang **tidak** diusulkan, dan alasannya

| Ditolak | Alasan |
|---|---|
| Mengganti `useOverlay` dengan `<dialog>` native | Hook sudah memberi focus trap + Escape + penamaan. `<dialog>` menambah top-layer yang tak terlihat skala z repo (§4.1) |
| Menumpuk modal (mis. konfirmasi di atas modal) | Panduan 2026 & eleken sama-sama menolak. Konfirmasi buang-perubahan dikerjakan **di dalam** shell yang sama, sebagai lapisan kedua, bukan modal baru |
| Blur lebih tebal / glassmorphism lebih kuat | `DESIGN.md` §1.2 membatasinya pada tiga permukaan artwork. `backdrop-filter` adalah operasi paint termahal di app (`motion.css` §5) |
| Kinetic type, 3D, scroll-jacking | Sudah ditolak `DESIGN.md` §1.2 dengan alasan yang masih berlaku |
| Auto-trigger modal apa pun saat halaman dibuka | Dilarang panduan 2026 dan sudah dilanggar-ukur oleh Google untuk interstitial mobile |
