# Audit ARIA — kontrol tanpa nama aksesibel (2026-09-28)

**Alat:** `e2e/measure-aria.mjs` (alat BUKTI, bukan gate)
**Gate yang dibangun dari temuan ini:** `e2e/test-aria-names.mjs`
**Build yang diukur:** `asj-astro-bc2656a5c6d7`, disajikan `node server.cjs` di `127.0.0.1:4321`

---

## TL;DR

**14 kontrol anonim** ditemukan di permukaan yang bisa diukur, tersebar di **5 kelas cacat**.
Semuanya diperbaiki. Gate baru menegakkan aturannya di 10 rute × 2 lebar, 9 tab admin ×
2 lebar, dan dialog detail loker yang dibuka dengan klik sungguhan.

**Tidak ada gate lain di repo ini yang bisa melihat satu pun dari 14 itu.** `e2e:labels`
hanya bisa berjalan pada `<label>` yang ADA; sebuah `<button>` yang isinya cuma `<svg>`
tidak punya `<label>` sama sekali, jadi loop-nya tidak punya apa pun untuk dicocokkan.

---

## 1. Kenapa diukur, bukan di-grep

`grep aria-label src/**/*.tsx` mengembalikan **~60 kemunculan** dan **tidak satu pun**
memberi tahu apakah kontrol yang DIRENDER akhirnya bernama:

- nama bisa datang dari `aria-labelledby`, teks subtree, `<label for>`, `title`, atau `alt`;
- komponen yang tidak dirender di rute yang Anda pedulikan tidak menyumbang apa pun;
- atribut yang ADA tapi isinya kunci terjemahan yang hilang tetap terbaca "ada" oleh grep.

Jadi alat ini bertanya ke Chromium lewat `Accessibility.getFullAXTree` — pohon yang
diserahkan platform ke teknologi asistif, dengan `role` dan `name` yang sudah dihitung.

---

## 2. Temuan (terukur)

| # | Permukaan | Kontrol | Kelas |
|---|---|---|---|
| 1–3 | `/admin` (tab kelola) | `<button>` ikon hapus, satu per baris | R1 nama kosong |
| 4–6 | `/admin#pelamar` | `<select>` filter gender / usia / JFT | R1 nama kosong |
| 7 | `/admin#mail` | `<input type=checkbox>` pilih-semua | R1 nama kosong |
| 8 | `/public` + Detail | tombol tutup dialog detail loker | R1 nama kosong |
| 9 | `/candidate` (Ubah Password) | tombol tutup `ChangePasswordModal` | R1 nama kosong |
| 10 | `/candidate` (CV Mini) | tombol tutup `CvMiniModal` | R1 nama kosong |
| 11 | `InputManualModal` | tombol hapus baris dokumen | R1 nama kosong |
| 12 | `CvTemplateSelector` | tombol tutup | R1 nama kosong |

⚠ **Nomor 11 dan 12 tidak ditemukan oleh sapuan ini** — keduanya berada di permukaan
yang tidak bisa dijangkau gate e2e mana pun (dibuka dari aksi baris di dalam tab, dan
`InputManualModal` digerbangi atom `inputModalOpen` yang tidak disentuh permukaan e2e).
Keduanya ditemukan oleh **tes komponennya sendiri**, yang ditulis sebagai bagian dari
perbaikan ini dan **menemukan instance ke-11 saat pertama dijalankan**.

### Yang TIDAK ditemukan, dan itu juga hasil

- **R2 (nama = kunci mentah): 0.** Semua `aria-label={t(...)}` di permukaan yang diukur
  memakai kunci yang ada di kedua kamus. Baterai mutasi membuktikan aturannya tetap hidup
  dengan menyuntikkan `ui.does_not_exist`.
- **R3 (fokusabel di dalam `aria-hidden`): 0** di 38 permukaan. Aturannya tetap
  ditegakkan, dan kontrolnya di dalam gate membuktikan detektornya menyala.

---

## 3. Cakupan, dan lubangnya

**Disapu:** `/`, `/loker`, `/public`, `/ai-cv` (gerbang, tanpa token), `/apply`,
`/siswa-baru`, `/master`, `/share`, `/admin`, `/candidate`, **sembilan** tab admin
(`kelola`, `tugas`, `dbjob`, `pelamar`, `wa`, `mail`, `agenda`, `config`, `+` default),
dan dialog detail loker. Dua lebar: 390 dan 1280.

**Tab admin bisa disapu secara deterministik** — dan itu bukan hal yang jelas sebelumnya.
`e2e/test-headings.mjs` mencatat bahwa sebuah *click-walk* pernah ditulis lalu **DIHAPUS**
karena tidak deterministik: tab yang memanggil `api.secure(...)` penolakannya lewat
`apiClient`, yang mengeluarkan sesi dan mengalihkan ke `/`, dan dua run terpisah sepuluh
menit **tidak sepakat** soal tab mana yang memantul (`#dbjob` dan `#mail` bertukar).

Pendekatan yang berhasil di sini adalah kebalikannya: tab dibaca lewat **hash**
(`/admin#wa`, tanpa klik, tanpa sidebar responsif) dan **SETIAP** panggilan
`/.netlify/functions/**` dipenuhi lokal, sehingga tidak ada penolakan yang bisa terjadi.
Terukur: kesembilan tab merender isinya yang sebenarnya (17–49 kontrol masing-masing) dan
walk-nya stabil di kedua lebar.

**Lubang yang dicatat, bukan disembunyikan:**

1. Modal tingkat-kedua (modal yang dibuka dari dalam modal) tidak disapu.
2. `CvTemplateSelector` dan `InputManualModal` tidak di permukaan e2e mana pun → dipatok
   tes komponen.
3. Hanya keadaan DIAM. Toast galat, pesan validasi, dan menu yang dibuka klik tidak diukur.
4. **Nama yang ADA tapi SALAH** ("Tutup" pada tombol hapus) tidak bisa dideteksi alat
   otomatis mana pun, termasuk yang ini. Alat ini memeriksa KETIADAAN, bukan KEBENARAN.

---

## 4. Kenapa gate ini perlu kontrol

Setiap putusan di gate ini berbunyi **"daftar ini kosong"**. Panggilan AX yang mati, daftar
role yang basi, atau `backendDOMNodeId` yang tidak resolve — **ketiganya terbaca sebagai
"0 pelanggaran"**, identik dengan halaman bersih. Gate yang tidak bisa gagal bukan gate.

Karena itu gate membawa **dua kontrol positif** yang dijalankan PERTAMA dan tidak butuh
rebuild:

- tombol tanpa nama ditanam di halaman hidup → sapuan **harus** melaporkannya;
- kontrol fokusabel di dalam pembungkus `aria-hidden` ditanam → aturan R3 **harus**
  melaporkannya (aturan yang menemukan 0 pelanggaran di tree sehat tidak bisa dibedakan
  dari aturan yang selectornya berhenti cocok).

Plus: lantai jumlah kontrol per permukaan (terukur paling tipis: 5) supaya halaman yang
tidak merender apa pun adalah KEGAGALAN, bukan lolos diam-diam.

---

## 5. Sumber

| Sumber | Diambil |
|---|---|
| Chrome DevTools Protocol — `Accessibility.getFullAXTree`, `DOM.resolveNode`, `Runtime.callFunctionOn` | Pohon aksesibilitas asli + resolusi node pelanggar kembali ke elemen |
| axe-core — aturan `aria-hidden-focus` | Definisi R3 (fokusabel di dalam `aria-hidden`), termasuk pengecualian `tabindex="-1"` dan `disabled` |
| W3C ARIA — peran yang mensyaratkan nama | Daftar `NAME_REQUIRED` |
| `src/store/i18n.ts:2136` | Fallback `... \|\| key` yang membuat R2 mungkin |
