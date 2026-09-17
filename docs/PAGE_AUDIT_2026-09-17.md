# Audit Halaman — perbandingan kode & fungsi (9 rute)

**Tanggal:** 2026-09-17 · **Metode:** baca kode penuh 9 `src/pages/*.astro`, lalu **ukur** tiap klaim di artefak hasil build (`astro preview` :4321, Chromium 390×844 dan 1280×900).
**Aturan:** tidak ada yang di-commit. Tidak ada kode produksi yang diubah oleh audit ini.

> **Koreksi 2026-09-17 (audit ulang).** Kalimat di atas berlaku untuk **lintasan audit
> itu sendiri** — saat mengukur, tidak ada kode yang disentuh. Tetapi §9.1 di bawah
> mencatat prioritas 1–5 **SELESAI**, dan itu berarti kode produksi **memang** berubah
> setelahnya. Header ini tidak ikut diperbarui, jadi keduanya sempat bertentangan di
> berkas yang sama. Yang benar: audit = baca-saja; §9.1 = pekerjaan lanjutan, dan
> pekerjaan itulah yang sekarang di-commit.

---

## 0. Ringkasan — 7 temuan, diurutkan menurut berat

| # | Temuan | Jenis | Terukur? |
| - | ------ | ----- | -------- |
| 1 | `verify-classes` **BUTA**: `.u-modal-shell` tetap "defined" walau **kedua** aturan CSS-nya dihapus | gate | **ya — mutasi LOLOS (dijalankan)** |
| 2 | `DocumentPreviewModal` punya Escape tangan-sendiri (deps `[]`) di samping `useOverlay` | kode | ya (grep 1 hit) |
| 3 | `public.astro` menduplikasi `fetch` alih-alih `getPublicData()` (cache single-flight dilewati) | kode | ya |
| 4 | `AdminPanel` punya **daftar rute yang sama ditulis 3×** → menambah tab = 3 suntingan | kode | ya |
| 5 | `openMatchmaking` & `asj-toggle-sidebar`: listener tanpa dispatcher | kode | ya (sensus 362 berkas) |
| 6 | `/master` tidak pernah menerima `App`; `#main-content` tak ada di 5 halaman | kode | ya (harness 9 halaman) |
| 7 | `/share` merender `.u-modal-shell` **terlihat, tanpa role, tanpa aria-hidden** | kontrak §25 | ya (sweep dijalankan) |

**Kabar baik yang perlu dinyatakan supaya tidak jadi noise:** pelacakan gate yang saya khawatirkan **ternyata sehat**. Saya menduga `GATE_MARKERS` di `e2e:headings` (`'Login Pelamar'`) cocok dengan tombol drawer global `App` di **setiap** halaman sehingga `assertReachedBody()` tidak pernah menyala. Saya uji dengan menyuntikkan sesi `authFor()` seperti yang suite itu lakukan: **ke-7 rute membaca `gate=null`**, dan `/ai-cv` benar terdeteksi gate lewat `'Verifikasi Akun Kandidat'`. Kekhawatiran itu **gugur**. (Pembacaan `innerText` awal saya yang menyesatkan: tombol drawer global memang ada di DOM, tetapi prosa saya menyimpulkan terlalu cepat — pelajaran yang sama seperti catatan lama: *ukur, jangan percaya prosa*.)

---

## 1. `verify-classes` tidak bisa melihat kelas CSS proyek dihapus — **mutasi LOLOS**

Ini temuan terpenting dan satu-satunya yang saya buktikan dengan **mutasi yang dijalankan**, bukan dibaca.

### Yang dilakukan

1. Hapus `.u-modal-shell { overscroll-behavior: contain; }` dari `src/styles/layout.css` → jalankan gate → **`[classes] every checked class has a rule.` exit 0** (LOLOS).
2. Hapus juga `.u-modal-shell` dari `src/styles/motion.css:281` → jalankan gate → **masih LOLOS**, dan jumlah selektor justru **naik** `1585 → 1586`.
3. Kedua berkas dipulihkan; `git diff --stat` bersih.

### Kenapa

`scripts/ci/verify-classes.mjs` membangun himpunan "kelas yang punya aturan" lewat:

```js
const SELECTOR = /\.((?:\\[0-9a-fA-F]{1,6} ?|\\.|[\w-])+)/g;
```

Regex itu **tanpa kesadaran batas selektor dan tanpa kesadaran `:not()`**. Bukti langsung:

```
$ node -e '...matchAll(SELECTOR) pada:
  [class*="fixed inset-0"]:not(.u-modal-shell) { … }'
["u-modal-shell"]
```

`src/styles/global.css:835` berisi persis selektor itu — **sebuah aturan yang MENGECUALIKAN `.u-modal-shell` justru dihitung sebagai bukti bahwa kelas itu punya aturan.** Jadi `.u-modal-shell` punya **tiga** sumber kredit palsu (dua aturan asli + satu `:not()`), dan gate butuh **ketiganya** hilang untuk menyala. Dua di antaranya sudah saya buktikan tidak cukup.

### Kenapa ini penting lebih dari satu kelas

Mekanismenya umum, bukan khusus kelas ini:

- **`--list` menyembunyikan masalahnya, bukan menunjukkannya.** Output `credited by inline CSS` hanya berisi 5 entri (`border-l-none`, `border-lr-none`, `border-r-none`, `val-center`, `val-right`). `.u-modal-shell` **tidak muncul di sana** — ia lolos lewat jalur "Tailwind emitted" karena `SELECTOR` memanennya dari CSS yang diteruskan mentah. Jadi siapa pun yang memeriksa gate ini lewat `--list` akan menyimpulkan kelas proyek terlacak, padahal tidak.
- **Kelas yang kena:** setiap kelas proyek yang namanya muncul di selektor pembatas mana pun — `:not(.x)`, `:is(.x)`, `[class*=".x"]` — otomatis "defined" selamanya.
- **Ini persis bentuk yang sudah pernah menggigit repo ini** (header gate menyebut §2, §11.4, §14.2, §20: empat kali kelas yang menata nol). Gate ini dibuat untuk menutup kelas bug itu; ia tidak menutup versi di mana rule-nya **dihapus belakangan**.

### Bentuk hijau-yang-menyesatkan ini juga ada di `e2e:drawer`

`GATE_MARKERS` tadi saya salah tuduh; tetapi cacat ini nyata dan saya buktikan:

| Klaim | Hasil ukur |
| ----- | ---------- |
| `rootZ = 90` → `triggerZ = 91` ok | 92 < 1000 **LOLOS** |
| `#asj-overlay-root` **dilepas** dari DOM → `triggerZ = 95` | **95 < 1000 → masih LOLOS** |

Artinya asersi `z` suite itu menegakkan *"tombol di bawah 1000"*, bukan *"tombol di bawah semua overlay"* — perisai `#asj-overlay-root` **tidak diuji**. (Saya belum menambahkannya ke suite; ini laporan, bukan perubahan.)

---

## 2. `DocumentPreviewModal` — Escape ganda, handler basi

`src/components/DocumentPreviewModal.tsx` memakai `useOverlay` (baris 283, benar) **dan** memasang Escape tangan-sendiri:

```tsx
useEffect(() => {
  const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, []);            // baris 145-149 — deps kosong
```

Dua masalah, dan yang kedua tidak terlihat dari diff:

1. **Cacat disiplin tumpukan.** `useOverlay` sengaja memasang Escape di **fase capture** dan memanggil `e.stopImmediatePropagation()` supaya hanya overlay teratas yang menutup. Handler ini di `window` **fase bubble** → jalur kedua yang tidak menghormati tumpukan.
2. **`deps: []` → closure beku.** Listener memegang `onClose` dari render **mount pertama** selamanya. Kalau induk mengoper `onClose` baru (mis. karena state ikut berubah), Escape akan memanggil versi lama.

Grep `e.key === 'Escape'` di seluruh `.tsx` mengembalikan **tepat satu** hit — ini satu-satunya sisa salin-tempel di repo. Perbaikannya satu baris: hapus efeknya, `useOverlay` sudah menangani Escape.

---

## 3. `public.astro` vs `index.astro` — dua implementasi satu kontrak

| Aspek | `index.astro` | `public.astro` |
| ----- | ------------- | -------------- |
| Sumber data marquee | `getPublicData()` (`src/lib/publicData.ts`) | `fetch(...)` mentah inline |
| Cache single-flight | **dipakai** (berbagi dengan `LokerTable`) | **dilewati** |
| ID seksi | `public-loker-section` / `public-layanan-section` | `section-loker` / `section-layanan` |
| `switchTab` | tambah/hapus `block` **simetris** | hapus `block` **hanya** saat pindah ke layanan |
| Pil non-aktif | `bg-transparent` | `text-slate-400` tanpa `bg-transparent` |
| Tautan "Kembali ke Portal" | tidak ada | ada |

Dampak nyata hari ini kecil (URL+body identik, jadi tidak ada request ganda yang terbuang) — tetapi **kontraknya ditulis dua kali di dua tempat**. Menambah header, arg versi, atau timeout harus disunting di dua berkas dan **tidak ada apa pun yang menegakkannya**. `publicData.ts` sudah ada; `public.astro` seharusnya memakainya.

---

## 4. `AdminPanel` — daftar rute ditulis tiga kali

`src/components/admin/AdminPanel.tsx` memuat liter bahasa rute yang sama **tiga kali**:

- `TABS` (baris 45-53) — **7** entri, `config` **tidak ada**
- parser hash awal (baris 60) — **8** entri, `config` **ada**
- `onHashChange` (baris 67) — **8** entri, sama
- `TabContent` (baris 212-221) — 8 cabang `if`

`config` sengaja di luar `TABS` karena dirender sebagai tombol sidebar terpisah (baris 190). Konsekuensinya: menambah satu tab = **empat** suntingan di tiga daftar berbeda, dan **satu kelalaian = tab yang bisa dicapai lewat `#hash` tetapi tidak muncul di sidebar, atau sebaliknya** — persis divergensi yang sudah terjadi pada `config`.

---

## 5. Listener tanpa dispatcher (sensus 362 berkas `src/` + `netlify/`)

Sensus lengkap semua peristiwa `window`. Baris `<<< LISTENER WITH NO DISPATCHER (dead)` yang **milik kita** (sisanya `ResizeObserver`/DOM bawaan: `click`, `keydown`, `hashchange`, `storage`, `beforeunload`, `resize`, `load`, `message`, `abort`):

| Peristiwa | Dispatch | Listen | Verdict |
| --------- | -------- | ------ | ------- |
| `openMatchmaking` | **0** | 1 (`AdminPanel.tsx:85`) | **mati** |
| `asj-toggle-sidebar` | **0** | 1 (`AdminPanel.tsx:102`) | **mati** |
| `openAdminAiCopilot` | 1 | 1 | ok |
| `openUndanganKelas` | 1 | 1 | ok |
| `openPemberkasan` | 1 | 1 | ok |
| `openCandidateEdit` | 2 | 1 | ok |
| `showCandidateHistory` | 2 | 1 | ok |
| `asj-lang-change` | 1 | 1 | ok |
| `asj-theme-change` | 3 | 2 | ok |

- **`openMatchmaking`** — tombol "Match" yang hidup memakai state lokal (`setMatchJob(db)`, `TabDbJob.tsx:265`). Jalur bus-nya tinggal sisa legacy (docs masih menyebut nama lama `bukaMatchmaking`, PARITY_CHECKLIST A14).
- **`asj-toggle-sidebar`** — hanya didaftarkan-dilepas, tidak ada yang memicu.

Keduanya **bukan bug yang menyakiti pengguna** — hanya pipa mati yang menambah permukaan baca. Layak dihapus, atau diberi komentar bahwa ia menunggu pemanggil.

### Tiga idiom wiring modal hidup berdampingan

Ini divergensi arsitektur yang **terlihat di kode** dan saya konfirmasi di ketiga tab:

| Idiom | Contoh | Bagaimana ditutup |
| ----- | ------ | ----------------- |
| Anak berkondisi prop | `pemberkasan`, `undangan`, `aiCopilot`, `profile`, `editModal`, `matchmaking` (`AdminPanel.tsx:202-207`) | induk pegang `useModal<T>()`, oper `isOpen`/`onClose` |
| Bus `CustomEvent` di `window` | `openPemberkasan`, `openUndanganKelas`, `openCandidateEdit`, `showCandidateHistory`, `openAdminAiCopilot` | anak `dispatchEvent`, induk `addEventListener` |
| Atom store global | `inputModalOpen`, `reportModalOpen` (`adminStore.ts`) | `InputManualModal`/`LaporanBulanananModal` **tanpa prop & tanpa gate** (baris 255-256 `TabPelamar`) |

Ketiganya sah; **tidak ada yang menetapkan mana yang berlaku**, jadi setiap modal baru memilih sendiri. Itu bukan utang yang harus dibayar sekarang — tetapi ia menjelaskan kenapa `openMatchmaking` bisa terlupakan: bus yang tidak diumumkan akan bertambah tanpa jejak.

---

## 6. Konsistensi tata letak 9 halaman (harness dijalankan, 9 rute)

Fakta yang seharusnya sama, kalau kesembilan halaman satu keluarga:

| Fakta | 1 idx | 2 pub | 3 adm | 4 aicv | 5 app | 6 cand | 7 mst | 8 shr | 9 sisw |
| ----- | :---: | :---: | :---: | :----: | :---: | :----: | :---: | :---: | :----: |
| `App` | Y | Y | Y | Y | Y | Y | **·** | Y | Y |
| `FormToolbar` | · | · | Y | Y | Y | Y | Y | Y | Y |
| `#main-content` | Y | Y | Y | · | · | Y | · | · | · |
| `showBottomNav` | · | · | Y | · | · | Y | · | · | · |
| `data-lang` | Y | Y | · | · | · | · | · | · | · |
| `getPublicData()` | Y | · | · | · | · | · | · | · | · |
| `fetch(...netlify)` mentah | · | Y | · | · | · | · | · | · | · |

Dua hal yang perlu keputusan, bukan tambalan:

1. **`/master` tidak memasang `App`** — satu-satunya dari sembilan halaman. Diukur di DOM 390×844:

   | | `/` (punya `App`) | `/master` (tanpa `App`) |
   | --- | --- | --- |
   | elemen `<header>` | **1** | **0** |
   | tombol `.hamburger-btn` | **1** | **0** |
   | tombol "Admin Login" | **ada** | **tidak ada** |
   | toggle tema | di dalam header | **hanya** dari `FormToolbar` |

   `/master` tetap punya tombol tema + bahasa (dari `FormToolbar`), tetapi **tidak punya header, drawer, maupun jalur login**. `/ai-cv`, `/apply`, `/siswa-baru` semuanya memasang `App`. Ini satu-satunya penyimpangan.

2. **`#main-content` hilang di 5 dari 9 halaman**, padahal `BaseLayout` merender tautan lewati (`skip-link`) yang menunjuk ke `#main-content`. Di `/ai-cv`, `/apply`, `/master`, `/share`, `/siswa-baru` tautan itu menunjuk **tidak ada** → lewati-ke-konten diam-diam tidak bekerja. (Ini kelas cacat yang sama dengan a11y: asersi bisa hijau karena tidak ada yang memeriksa **apakah target tautannya ada**.)

   *Catatan metode:* saya awalnya menyimpulkan `/master` "tanpa header" dari pembacaan kode saja dan sempat menyatakannya salah setelah probe pertama hanya memeriksa `<header class="...">` di tiga rute sekaligus. Probe kedua — membandingkan `/` melawan `/master` secara berdampingan — mengonfirmasi klaimnya. Pelajaran yang sama seperti §7: **perbandingan berpasangan mengalahkan inspeksi tunggal.**

`data-lang` hanya di halaman 1-2 (dan di 5 komponen) memang konsisten dengan desain: halaman lain memakai `t()` dari island Preact. Bukan cacat — tapi artinya `asj-lang-change` (dispatch `i18n.ts:1527`, didengar `BaseLayout.astro:169`) **tidak diuji di mana pun** (`e2e/`, `scripts/`, `docs/` = 0 rujukan).

---

## 7. `/share` merender shell terlihat tanpa semantik

Sweep §25 (`e2e/test-dialog.mjs` baris 145-202) **dijalankan apa adanya** pada `/share` (1280×900, fixture same-origin seperti yang suite itu pasang):

```
### /share  -> sweep PASSES (green)
   total .u-modal-shell: 2   visible: 1   violations: 0
   skipped (0x0): DIV.fixed [aria-hidden=true]
   seen: DIV.fixed -> A aria-hidden
```

**Kenapa hijau:** `data-theme="dark"`, jadi tombol Tema di `LokerTable` menampilkan `"Dark"` dan elemen itu berukuran 0×0 → dilewati. Pada tema **light** ia 390×844 → terhitung **terlihat**, `aria-hidden="true"` masih menyelamatkannya (kasus **A**). Jadi kontraknya tetap terpenuhi di kedua tema; yang berubah hanya apakah kelasnya **dilihat**.

Tapi ada celah yang nyata: aturan suite *"tidak ada overlay terlihat sebelum apa pun dibuka"* menghitung `visibleOverlayCount() !== 0`. Pada `/share` dengan tema light, angka itu **1** → perintah yang sama akan **GAGAL**. Saya uji langsung:

```
$ node .tmp-negctl.mjs
SUITE CHECK "no overlay is visible before anything is opened":
{ "visibleOverlaysAtIdle": 1, "wouldFail": true, "err": "1 overlay(s) visible on an idle page" }
```

Jadi: **suite itu hanya aman di rute yang kebetulan ia kunjungi.** Kalau `/share` ditambahkan ke daftar rute `e2e:drawer`/`e2e:dialog`, ia memerah bukan karena `/share` salah, melainkan karena asersi itu **menyamakan "terlihat" dengan "aktif"**. Kelas `.u-modal-shell` dipakai untuk tiga hal berbeda: dialog, scrim, dan **lapisan dekoratif** (`ShareView.tsx:181` `pointer-events-none`, `BaseLayout.astro:124` partikel sakura). Suite yang memilih berdasarkan kelas tidak bisa membedakannya tanpa bantuan.

Sekaligus **karakterisasi yang adil**: layer dekoratif `ShareView` **bukan** cacat. Ia membawa `pointer-events-none` dan `aria-hidden="true"` — perilaku benar. Yang perlu diperbaiki adalah **asersinya**, bukan halamannya.

---

## 8. Yang saya periksa dan **tidak** menemukan masalah

Supaya laporan ini tidak hanya berisi kelemahan — ini bagian yang saya uji dan lolos:

- **`useOverlay` sebagai kontrak** — 16 pemakai, semuanya `role`/`aria-modal`/`aria-labelledby` di node `containerRef`; `open:false` sengaja mencopot semuanya (kasus `EsignNaitei`).
- **`e2e:dialog` di pohon sekarang** — **16 lolos / 0 gagal**, termasuk kontrol positif (overlay tanpa role yang ditanam memang tertangkap).
- **Penanaman overlay tanpa role tertangkap**, sedangkan layer dekoratif `/share` **tidak** tertangkap — predikatnya benar, jadi kontrol positif & negatifnya konsisten.
- **`GATE_MARKERS` `e2e:headings`** — gugur kekhawatiran saya (lihat §0).
- **`u-modal-shell` benar-benar punya aturan** di CSS hasil build (`overscroll-behavior:contain` + fallback reduced-motion) — kelasnya bukan hantu; yang buta adalah cara gate mengeceknya.
- **`AiCvForm`** — gate login pakai `useOverlay` dengan `closeOnEscape:false`/`closeOnBackdrop:false` dan `label:` eksplisit; layar tunggu pakai `role="status" aria-live="polite"`; 9 `datalist` semuanya punya pemakai `list=` (dulu ada 3 datalist yatim, sudah dihapus dan `AiCvForm.test.tsx` sekarang menolak yang yatim).
- **`ApplyFullForm`** — `SelectField` gender memakai opsi literal inline (bukan `DROPDOWN_MAP`), tetapi enumerasi nilainya **identik** dengan `list_gender` (LAKI-LAKI/PEREMPUAN). Divergensi bentuk, bukan nilai; tidak menyakiti.
- **`MasterFullForm`/`SiswaBaruForm`** — punya `beforeunload` untuk perubahan belum disimpan; `TabTambah` **tidak punya** (kandidat form punya, form admin tidak). Saya sebut sebagai **asimetri yang saya tidak tahu keputusannya**, bukan cacat yang saya pastikan.

---

## 9. Usulan urutan kerja

| Prioritas | Pekerjaan | Alasan | Status |
| --------- | --------- | ------ | ------ |
| 1 | Tutup kredit `:not()` di `SELECTOR` / `definedSelectors` + baterai mutasi `verify-classes` | gate yang tidak bisa gagal = tidak ada gate; ini satu-satunya temuan yang membatalkan jaminan | **SELESAI** |
| 2 | Hapus Escape tangan di `DocumentPreviewModal` | 1 baris, menutup cacat tumpukan + closure basi | **SELESAI** |
| 3 | `public.astro` → `getPublicData()` | menghapus duplikasi kontrak | **SELESAI** |
| 4 | Tambah asersi "setiap `skip-link` punya target" ke `e2e:headings` | menutup 5 halaman sekaligus, murah | **SELESAI** |
| 5 | Satukan daftar rute `AdminPanel` jadi satu sumber | mencegah divergensi `config` terulang | **SELESAI** |
| 6 | Putuskan: hapus atau beri komentar `openMatchmaking` + `asj-toggle-sidebar` | pipa mati | belum |
| 7 | Putuskan: `App` untuk `/master`; perbaiki asersi "terlihat" di `e2e:drawer`/`e2e:dialog` | keputusan produk, bukan tambalan | belum |

### 9.1 Yang dikerjakan, dan buktinya

**1 — kredit `:not()` ditutup.** `definedSelectors` tidak lagi memanen `.ident`
di mana saja. Sekarang ia mem-parse prelude menjadi senyawa (`compoundsOf`) dan
hanya mengkredit **subjek**: senyawa terakhir, atau senyawa yang dijangkau lewat
`>`/`+`/`~`. `:not()` adalah pengecualian, `:has()` adalah lookback, dan argumen
`:where()`/`:is()` dievaluasi sebagai daftar selektor tersendiri (itu sebabnya
`:where(.space-y-2 > :not(:last-child))` tetap mengkredit `space-y-2`).

Lima bug nyata ditemukan saat menulisnya, semuanya lewat pengukuran — bukan
penalaran: koma yang di-escape memecah identifier, spasi terminator escape heks
dianggap kombinator, `firstOfSelector` tidak ada, `:not()` tidak dikecualikan,
dan `:has()` ikut dikredit. Dua di antaranya adalah **false positive** pada pohon
nyata (`rt-full`, `transition-[background-color,transform]`) yang baru terlihat
karena gate-nya sudah benar.

**Gate-nya sekarang bisa GAGAL, dibuktikan.** `verify-classes.mutations.sh`:
**14 KILLED / 0 SURVIVED / 2 OK-GREEN / 0 UNEXPECTED**. Empat mutasi baru (G4–G7)
menyerang tepat logika subjek itu. Satu draf G5 **SURVIVED** dan itu bukan lubang
— labelnya salah (`:has()` memang sudah dikecualikan, jadi tidak ada yang
dimutasi); ia ditulis ulang agar benar-benar memperlebar pengenalan
`:where()`/`:is()`. Dua self-test di dalam gate (escape 13/13, selektor 18/18)
menjalankan sebelum pohon dinilai.

**4 — asersi `skip-link` ditambah, dan 5 halaman diperbaiki.** Diukur lebih dulu:
**5 dari 9 rute** (`/apply`, `/master`, `/siswa-baru`, `/share`, `/ai-cv`)
merender `<a href="#main-content" class="skip-link">` sementara `#main-content`
**tidak ada** — tautan yang tampak benar dan tidak melakukan apa pun. Kelimanya
tidak punya `<main>` sama sekali; sekarang dibungkus `<main id="main-content">`
mengikuti pola `/admin`. Asersinya me-resolve fragmen (bukan membaca `href`),
menuntut targetnya `<main>`, dan **menegaskan jumlah** agar tidak hijau-diam saat
tak ada tautan. Dibuktikan bisa gagal: menghapus `id` dari `/master` saja membuat
**tepat dua** pemeriksaan rute itu merah (390px + 1280px) sementara enam rute lain
tetap hijau.

**5 — satu sumber daftar rute.** `TABS` (7 entri terjadwal) + `PINNED_TABS`
(`config`) menurunkan `Tab`, `TAB_IDS`, dan `tabFromHash()`; `TabContent` kini
`Record<Tab, FunctionComponent>` alih-alih rantai `if` dengan fallback. Dibuktikan:
menambah tab tanpa view ⇒ **error kompilasi** `TS2741 Property 'probe-tab' is
missing in type … but required in type 'Record<Tab, FunctionComponent>'` —
sebelumnya rantai `if` diam-diam merender panel "sedang dalam migrasi".

---

## 10. Batas yang tidak diklaim

- **Saya tidak menjalankan CI** — itu tetap benar dan tetap jadi batas dokumen ini:
  "hijau" di sini = hijau **lokal**.
  **Koreksi 2026-09-17 (audit ulang):** alasannya salah. Klaim "ke-73 commit belum
  pernah dilihat CI (terblokir izin push)" **tidak bertahan saat diukur** —
  `git rev-list --left-right --count newrepo/main...a5f9549` mengembalikan `0 0`,
  dan `newrepo/main` sudah memuat **322** commit. Push-nya sudah terjadi; tidak ada
  yang tertahan izin. Penghalang sebenarnya ada satu lapis lebih dalam: **berkas
  gate-nya sendiri tidak pernah di-track git** (36 dari 58 berkas `scripts/ci/`,
  termasuk `run-batteries.mjs`, `lint-ratchet.mjs`, `verify-classes.mjs`), sehingga
  tiap job CI mati di "Cannot find module" **sebelum** sempat menilai apa pun. Job
  hijau karena tidak pernah jalan, bukan karena lulus. Diperbaiki di `071743e`.
- **Perbandingan "fungsi" saya batasi pada artefak build**, bukan backend live. Keadaan **dengan backend** hanya terukur sebagian (`/apply` 10 input, `/master` 16, `/admin` 2) dan **tidak berubah** antara backend hidup vs dinonaktifkan — karena itu saya tidak menyimpulkan apa pun dari perbedaan itu.
- **Mutasi `verify-classes` saya jalankan pada dua berkas gaya saja.** Saya tidak menguji apakah kelas proyek lain punya sumber kredit yang sama; mekanismenya umum, tetapi daftar terdampaknya **belum saya ukur**.
- **Temuan `/share` adalah karakterisasi suite, bukan halaman.** Saya tidak mengubah rute mana pun di `e2e:drawer`/`e2e:dialog`.
- **`TabTambah` tanpa `beforeunload`** saya laporkan sebagai asimetri, bukan cacat — saya tidak menemukan catatan keputusan yang membenarkannya, dan juga tidak menemukan gate yang menuntutnya.
