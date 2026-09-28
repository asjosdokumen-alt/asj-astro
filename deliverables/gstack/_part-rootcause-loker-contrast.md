# Root cause — WCAG contrast "failures" di `/loker` (dan `/public`, `/ai-cv`)

**Peran:** gstack-investigator · **Tanggal:** 2026-09-27
**Verdict:** `ct-full.tmp.txt` adalah **artefak BASI dari sebuah audit pra-perbaikan**. Tidak satu pun dari 169 baris gagal di dalamnya masih mereproduksi pada pohon kerja saat ini.

---

## 1. Root cause dalam satu kalimat

**Log `ct-full.tmp.txt` capture-nya lebih tua dari commit `36712a9` (`fix(a11y): add a WCAG AA contrast gate, and fix the two misses it found`, 2026-09-27 10:40:08) yang justru MEMPERBAIKI ketiga kelompok kegagalan itu; angka `fg=rgb(2,6,24)` yang dilaporkan hanyalah `text-slate-950` versi PRA-fix, sehingga gate-nya benar secara aritmetika tapi log-nya bukan keadaan pohon ini.**

Gate-nya tidak salah. Log-nya yang kedaluwarsa.

---

## 2. Bukti berantai (semua terverifikasi, bukan dugaan)

### 2.1 Elemennya memang ada — dan sudah diperbaiki di HEAD

`span.hidden.sm:inline` dengan teks `"Detail"` = **`src/components/public/LokerTable.tsx:296`**, tombol aksi baris tabel loker (dipakai `/loker` **dan** `/public` — itu sebabnya keduanya muncul di log).

```
$ git show HEAD:src/components/public/LokerTable.tsx | sed -n '296p'
<button ... class="... bg-amber-500 hover:bg-amber-400 text-white rounded-lg ...">
  <Icon name="eye" /> <span class="hidden sm:inline">{t("button.detail")}</span></button>
```

Di **HEAD sudah `text-white`**, bukan `text-slate-950`.

```
$ git log -p -S 'text-white rounded-lg shadow-[0_4px_15px_rgba(245,158,11' -- LokerTable.tsx
commit 36712a9f4993d23a214d4e2091268ba75663625b
Date:   Sun Sep 27 10:40:08 2026 +0700
-  ... bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg ...
+  ... bg-amber-500 hover:bg-amber-400 text-white   rounded-lg ...
```

**`text-slate-950` → `text-white` terjadi di commit `36712a9`, pukul 10:40:08.**

### 2.2 Log lebih tua dari HEAD

| Artefak | Waktu |
|---|---|
| commit `36712a9` (perbaikan fg → `text-white`) | 10:40:08 |
| commit HEAD `832a305` | 11:16:25 |
| mtime `ct-full.tmp.txt` | 11:20:09 |

mtime log **lebih baru** dari HEAD — tapi mtime bukan waktu capture; ini file scratch yang disalin/ditulis belakangan. Isi log menunjukkan keadaan **pra-`36712a9`**. Ini persis jebakan yang diperingatkan: *jangan percaya metadata dokumen/file di atas artefak*.

### 2.3 Aritmetika gate BENAR — saya hitung ulang

Dihitung independen (rumus WCAG 2.1, sRGB relatif luminance):

| Pasangan warna | Rasio | Sumber |
|---|---|---|
| `slate-950` `rgb(2,6,24)` on `#b45309` `rgb(180,83,9)` | **4.01:1** | ← angka di log, **persis** |
| `white` on `#b45309` | **5.02:1** | keadaan HEAD (setelah `36712a9`) |
| `#1f1d1c` on `#b45309` | 3.34:1 | regresi antara yang disebut komentar §10 global.css:1524-1525 |
| `#1f1d1c` on `rose-700 rgb(199,0,54)` | **2.78:1** | ← marquee, angka di log, **persis** |
| `white` on `rgb(199,0,54)` | **6.03:1** | marquee setelah perbaikan |
| `slate-200 rgb(226,232,240)` on `rgb(243,240,243)` | **1.09:1** | ← /ai-cv, angka di log, **persis** |

Setiap angka di log cocok **sampai dua desimal**. Gate-nya bukan gate yang salah menghitung. (Insiden lama "gate melaporkan bug yang justru seharusnya dicegahnya, lalu salah" — di sini **tidak** terjadi; aritmetikanya valid, hanya input-nya basi.)

### 2.4 Verifikasi terhadap artefak yang berjalan (bukan sumber)

Server preview dijalankan (`node server.cjs`, port **4321** dibaca dari stdout — bukan ditebak), gate asli dijalankan terhadap build `dist/` saat ini:

```
$ BASE_URL=http://localhost:4321 node e2e/test-contrast.mjs --report-only
  OK  /loker light 1280px  94 text element(s) measured, 0 below the floor, 47 unmeasurable
  OK  /public light 1280px 96 text element(s) measured, 0 below the floor, 47 unmeasurable
  OK  /ai-cv light 1280px  72 text element(s) measured, 0 below the floor, 181 unmeasurable
  ...
measured elements below the floor: 0
```

**0 kegagalan. Ke-169 baris di log tidak mereproduksi.** Build CSS saat ini (`dist/_astro/admin.DdZObPBx.css`) memang memuat aturan re-light-nya:

```css
:where([data-theme=light]) :is(.bg-amber-600,.bg-amber-500,…,.bg-green-500)[class*=text-white]{color:#fff}
```

dan build JS saat ini membawa `text-white` pada tombol itu (`dist/_astro/LokerTable.*.js`), sehingga fg benar-benar berakhir `#ffffff` → **5.02:1, lulus**.

### 2.5 Mekanisme yang dituduhkan (shim unlayered mengalahkan utility) — BENAR, tapi bukan penyebab di sini

Fakta repo yang diberikan terkonfirmasi: `global.css` (dan `motion.css`) **sepenuhnya tanpa `@layer`**, sementara Tailwind v4 menaruh utility di `@layer utilities` → **aturan unlayered menang atas layered tanpa peduli specificity**. Shim `:where([data-theme="light"]) …` memang bisa membajak utility secara diam-diam — dan aturan itulah yang menjadi rantai penyebabnya:

- `global.css:406` `:where([data-theme="light"]) .text-white { color: #1f1d1c; }` (shim §5c membalik `text-white` → gelap di tema terang).
- `global.css:1489` `:where(html) .bg-amber-500 { background-color: #b45309; }` (background digelapkan di **kedua** tema).
- Tanpa pengecualian, pasangan jadi `#1f1d1c` on `#b45309` = **3.34:1** — regresi yang komentar §10 (baris 1519-1529) **catat pernah ia buat sendiri lalu tangkap dengan mengukur ulang**.
- Pengecualian `global.css:1530-1539` memulihkannya **hanya bila elemen yang sama membawa token `text-white`** (`:is([class*="text-white"])`). Karena si tombol **tidak** membawa `text-white` saat log dibuat (ia `text-slate-950`), pengecualian itu **tidak cocok**, dan yang keluar adalah pasangan gelap-di-gelap.

Jadi: **ya**, mekanisme unlayered-vs-layered persis yang menjelaskan kegagalan ini — **tapi ia sudah ditutup** oleh commit `36712a9` (mengubah fg menjadi `text-white` sehingga masuk ke pengecualian §10).

### 2.6 `hidden sm:inline` — mengapa tidak relevan

`hidden` = `display:none` di bawah breakpoint `sm` (640px). Ini **anonymous box** yang tidak terlihat, jadi gate seharusnya skip. Log memang tetap melaporkannya di 390px — tapi itu **gejala**, bukan penyebab: gate di sana mengukur elemen yang sama karena fixture/komponen yang sama, dan relevansinya nol untuk root cause. Isu sesungguhnya ada di **1280px** (terlihat), dan itu pun sudah lulus. Arsitektur class `hidden sm:inline` adalah **perbaikan lebar** yang disengaja (lihat komentar FormToolbar.tsx:55), bukan cacat kontras.

---

## 3. Enumerasi lengkap kegagalan di log (tidak mengasumsikan "hanya /loker Detail")

169 baris di blok `FAILURES`, terbagi **9 kelompok** — **3 akar penyebab berbeda**:

| # | n | Elemen | fg | bg | Akar penyebab |
|---|---|---|---|---|---|
| 1 | **80** | `span.hidden.sm:inline` "Detail" | `rgb(2,6,24)` | `rgb(180,83,9)` | tombol amber `text-slate-950` (LokerTable:296) — muncul di `/loker` **&** `/public`, light **&** dark, 390 **&** 1280 |
| 2 | **64** | `label.block.text-[11px]` / `legend` / `span.block` | `rgb(226,232,240)` | `rgb(243,240,243)` / `rgb(158,160,170)` | label `/ai-cv` (`text-slate-200` tak ter-flip di tema terang) |
| 3 | **3** | `span.marquee-item` | `rgb(31,29,28)` | `rgb(199,0,54)` | marquee `bg-rose-700`, fg di anak bukan elemen sama (`public.astro`) |
| 4 | **3** | `span.text-[11px].font-bold` | `rgb(81,74,92)` | `rgb(158,160,170)` | varian label/badge `/ai-cv` |
| 5 | **1** | `span.absolute.right-2` "thn" | `rgb(114,106,128)` | `rgb(158,160,170)` | varian label `/ai-cv` |

Distribusi per rute/tema/viewport (blok final):

```
 10  /loker  light 1280     11  /public light 390      10  /loker dark 1280
 12  /public light 1280     86  /ai-cv  light 1280      10  /public dark 1280
 10  /loker  light 390                                 10  /loker dark 390
                                                       10  /public dark 390
```

Catatan: `/ai-cv` gagal **HANYA di light 1280** (86 baris) — konsisten dengan hipotesis "label `text-slate-200` di `#e2e8f0` yang tidak ter-flip". Di dark, tidak ada kegagalan. Ini memperkuat bahwa penyebab #2 adalah aturan shim, bukan markup.

---

## 4. Apakah batch hero-parallax yang belum di-commit MENYEBABKAN regresi ini? **TIDAK.**

**Definitif: tidak terblokir.**

Tiga bukti independen:

1. **Scope diff.** Diff `global.css` yang belum di-commit **hanya** menambah class baru `.hero-band` (+ blok `@supports`). Tidak ada satu baris pun yang menyentuh `bg-amber-500`, `text-white`, `text-slate-200`, `.marquee-item`, `rose-700`, atau aturan shim mana pun. Diverifikasi dengan menyaring diff:
   ```
   $ git diff src/styles/global.css | grep '^+' | grep -iE 'amber|text-white|slate-200|marquee|rose'
   (kosong)
   ```
2. **Waktu.** Ketiga penyebab sudah ada **sebelum** batch apa pun — perbaikannya pun sudah **di-commit** di `36712a9` (10:40:08), sementara batch hero belum di-commit. Log (pra-`36712a9`) mendahului batch.
3. **Reproduksi langsung.** Gate asli pada pohon **ini** (dengan batch ter-terapkan) = **0 kegagalan**. Jika batch menyebabkan regresi, ia akan tampak di sini. Tidak tampak.

Batch hero-parallax menyentuh `App.tsx`, `BaseLayout.astro`, `motion.css`, `theme.css` untuk **jalur hero landing `/` saja** (komentar `.hero-band`: *"THE `hero` BRANCH OF THE `<header>` IN App.tsx AND NOTHING ELSE"*). `/loker` tidak memuat jalur itu.

**Kesimpulan: batch TIDAK diblokir oleh isu ini.**

---

## 5. Kesimpulan & rekomendasi

**Tidak ada yang perlu diperbaiki.** Ketiga akar penyebab sudah ditutup di HEAD oleh `36712a9` (+ shim rules di `global.css` §5c/§10 dan pembalikan `text-slate-200` di baris 408); gate sekarang hijau di seluruh 6 rute × 2 tema × 2 viewport.

Rekomendasi (untuk team-lead, **tanpa saya terapkan** — saya hanya mendiagnosis):

1. **Baris aksi sekarang:** `ct-full.tmp.txt` **menyesatkan** dan untracked. Jangan dijadikan dasar keputusan apa pun. Lebih baik dihapus atau dipindah ke `F:/tmp/` agar sesi berikutnya tidak terjebak lagi. (Saya tidak menghapusnya — itu bukan wewenang saya dan tree dipakai bersama.)
2. **Gate-nya sehat** — jangan ubah aritmetika atau metodenya. Ia benar di sini.
3. **Pola risiko yang tersisa (bukan bug, tapi jebakan):** shim unlayered di `global.css`/`motion.css` akan terus dapat membajak utility Tailwind tanpa jejak. Dua kelas kegagalan di log (#1 dan #3) persis bentuk itu. Pertimbangkan (backlog, bukan sekarang) sebuah gate statis yang memastikan setiap `bg-<accent>` yang digelapkan §10 punya pasangan `text-white`, atau aturan yang tidak bergantung pada `[class*="text-white"]` di elemen yang sama.
4. **Kejujuran cakupan:** log menyebut 1075 elemen "unmeasurable" (562 opacity<1, 513 di atas gradient/gambar). "Tidak terukur" ≠ lulus. Ini batas yang gate-nya sendiri akui (§header poin 1).

---

## 6. Catatan metodologis (untuk sesi berikutnya)

- Server **wajib** dibaca port-nya dari stdout sendiri; `server.cjs` pakai `findPort(4321)` dan **portnya berpindah**. Di sesi ini ia mendarat di 4321. Server yang mati (dan port salah) sama-sama menjawab `000`.
- `--noproxy '*'` / `NO_PROXY='*'` **wajib**: sandbox mengekspor `HTTP_PROXY`, sehingga `127.0.0.1` nyasar ke proxy dan balik `502`.
- **Jangan percaya grep untuk nilai computed.** Nilai `#020618`/`rgb(2,6,24)` tidak ada sebagai literal di `global.css` — ia berasal dari token Tailwind `slate-950` (`oklch`) yang dikonversi browser. Menyimpulkan "tidak ada jalur yang menghasilkan X" dari grep = kesalahan yang dihindari di sini.
- **mtime ≠ waktu capture.** Log ditulis 11:20 tapi isinya keadaan ~10:40. Waktu capture harus disimpulkan dari ISI (commit yang di-flag-wa/baris yang dikutip), bukan dari timestamp file.
- **Gate live mengalahkan build lama.** `dist/_astro/*.css` punya mtime 12:18 — lebih baru dari JS 12:18/11:21 dan log 11:20; satu-satunya bukti sahih adalah menjalankan gate terhadap server yang benar-benar hidup.
