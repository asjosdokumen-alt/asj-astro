# Audit kontras panel admin (2026-11-10)

**Alat:** `e2e/test-contrast.mjs` — gate, bukan alat bukti
**Build yang diukur:** `asj-astro-78ab0fa0b6f9` (`npm run build`), disajikan `node server.cjs` di `127.0.0.1:4321`
**Cakupan baru:** 12 tab admin × 2 tema × 2 lebar = **48 permukaan**, ditambah 24 permukaan
publik/kandidat yang sudah ada ⇒ **72 permukaan**

---

## TL;DR

Panel admin adalah **lubang terakhir yang disebut namanya** di butir aksesibilitas
`TODO.md` ("Panel admin juga belum tercakup"). Lubang itu nyata, bukan formalitas:

1. Run **pertama** gerbang yang diperluas menemukan **satu kegagalan sungguhan** —
   angka keranjang AKTIF di tab Mail, **4,4:1**.
2. "Perbaikan" pertama (`text-white/80` → `text-white`) **MEMBUATNYA LEBIH BURUK**:
   terukur **2,83:1**. Gerbang yang sama menangkapnya.
3. Akarnya bukan warna tombol, melainkan **aturan CSS yang hanya memulihkan teks
   putih pada elemen yang membawa latar**, bukan pada anaknya. Diperbaiki di
   `global.css:1793`; sesudahnya **0 temuan di 72 permukaan**.

---

## 1. Kenapa cakupan, bukan aturan

Aturan gerbangnya tidak berubah: 4,5:1 untuk teks normal, 3,0:1 untuk teks besar.
Yang berubah hanya **daftar permukaan yang di-walk**. Itu pelajaran yang sudah
dibayar repo ini dua kali:

- 2026-10-20 — asersi "heading levels do not skip" hanya berjalan atas `ROUTES`,
  jadi `/` tidak pernah diukur sementara Lighthouse memberi `heading-order` **0**.
- 2026-09-27 — audit WCAG melaporkan enam rute "identik" karena argumen path
  ditulis ulang Git-Bash; setiap angka yang dicetaknya tentang `/`.

Panel admin punya bentuk kegagalan yang sama: tab dibaca lewat **hash**, dan
sebelum `AdminPanel` menandai tab yang ter-mount (`data-tab`, `display: contents`
supaya tidak mengubah tata letak), tidak ada cara membedakan "tab yang saya minta
ter-mount" dari "hash diabaikan dan tab yang sama dirender dua belas kali".
Karena itu setiap permukaan admin membawa **lantai cakupan** (`MIN_ADMIN_ELEMENTS`
= 8, di bawah permukaan tertipis yang terukur = 14) **dan** asersi penanda
`[data-tab]`. Hash yang diabaikan = gerbang MERAH, bukan dua belas baris hijau.

---

## 2. Temuan 1 — `text-white/80` pada `#0369a1` = 4,4:1

| | |
|---|---|
| Permukaan | `/admin#mail`, tema terang, 390 **dan** 1280 px |
| Elemen | `<span class="ml-1.5 tabular-nums text-white/80">` — angka keranjang AKTIF |
| Terukur | `rgb(205,225,236)` pada `rgb(3,105,161)` = **4,4:1** (lantai 4,5) |
| Sebab | `text-white/80` di atas `#0369a1`. Shim `global.css:1750` justru ada supaya teks **putih penuh** mencapai 5,86:1 di sana |
| Konteks | Tab yang dipakai admin menyaring **setiap** lamaran masuk |

Kegagalan ini tidak bisa dilihat gate mana pun yang sudah ada: `verify:classes`
membuktikan sebuah kelas menghasilkan RULE, ratchet lint menghitung diagnostik
SUMBER, dan gate headings/labels memeriksa semantik. Tidak satu pun membaca warna
yang akhirnya dipakai hasil render.

---

## 3. Temuan 2 — perbaikan pertama SALAH (2,83:1), dan itu temuan tersendiri

Mengganti `/80` menjadi `text-white` terlihat jelas benar: teks putih penuh di atas
permukaan gelap. Hasil ukurnya **2,83:1** — jauh lebih buruk.

| | |
|---|---|
| Terukur | `rgb(31,29,28)` pada `rgb(3,105,161)` = **2,83:1**, dua lebar |
| Sebab | `global.css:462` (§5b) membalik `.text-white` menjadi `#1f1d1c` di tema terang |
| Sebab kedua | Aturan pemulih `global.css:1782` menuntut latar **dan** `text-white` di elemen yang SAMA. Di sini teksnya ada di `<span>` **anak**, jadi tidak ada yang memulihkannya |

Jadi 4,4 lalu 2,83 bukan angka yang bertentangan — keduanya nyata, pada dua keadaan
kode yang berbeda. Yang salah adalah **membaca** hasilnya: `text-white` di tema
terang bukan "putih", melainkan "putih kecuali ada shim yang membaliknya".

### Perbaikannya: aturan, bukan pemanggil

`global.css:1793` memperluas aturan pemulih ke **turunannya**:

```css
:where([data-theme="light"]) :is(.bg-amber-600, … .bg-green-500) [class*="text-white"] { color: #ffffff; }
```

- `[class*="text-white"]`, **bukan** `.text-white`: span yang rusak ditulis
  `text-white/80`, dan Tailwind menerbitkannya sebagai kelas terpisah
  (`text-white\/80`), jadi selektor `.text-white` akan mengenai tombolnya dan
  melewatkan angkanya.
- Opasitas bukan pertahanan: 80 % putih pada `#0369a1` menyatu menjadi 4,4:1,
  tetap di bawah 4,5.
- Spesifisitas 0,2,0 mengalahkan §5b (0,1,0).
- Karena ditulis sebagai aturan pada **keluarga** warna, seluruh kelas bug ini
  tertutup — bukan hanya tombol Mail.

---

## 4. Hasil akhir (terukur)

```
measured elements below the floor: 0
unmeasurable (skipped, NOT a pass): 3340
  2040  text over background-image (gradient / image)
  1300  ancestor opacity < 1 (invisible, fading, or disabled)
```

72 permukaan: 6 rute publik/kandidat + 12 tab admin, × 2 tema × 2 lebar.

---

## 5. Batas yang jujur, dan ini sifat METODE

- Panel admin hanya **sebagian** terukur di tema TERANG: `body` membawa pola titik
  (`background-image`) dan kartu admin tembus pandang, sehingga penelusuran leluhur
  berhenti di `body` dan elemennya masuk hitungan "unmeasurable" — 3340 di seluruh
  run. Itu dilaporkan setiap run, bukan disembunyikan sebagai lulus.
- **Modal admin tetap belum tercakup.** Sama seperti sebelumnya.
- `:active` dan `:disabled` tidak diprobe; hanya keadaan DIAM.
- Gate ini berjalan di job `e2e` yang bergantung pada `push` — pada pull request ia
  **tidak** ditegakkan.

---

## 6. Pelajaran yang layak dibawa

1. **Memperluas cakupan menemukan cacat; memperluas aturan hanya membuat aturan
   lebih pintar.** Satu-satunya alasan temuan ini ada adalah karena daftar
   permukaan yang di-walk bertambah.
2. **"Perbaikan" yang belum diukur adalah hipotesis.** Angka 2,83 di atas datang
   dari gerbang yang sama yang menemukan 4,4 — bukan dari membaca CSS.
3. **Teks yang dipecah ke `<span>` mengubah siapa yang memegang warna.** Setiap
   kali sebuah label dipecah, periksa ulang aturan yang bergantung pada "kelas ada
   di elemen yang sama dengan latar".
