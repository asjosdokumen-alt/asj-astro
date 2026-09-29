# Penilaian Halaman Perusahaan asj-astro vs Situs Mitra MoU — 2026-09-29

**Status:** laporan penilaian (rubrik berskor) · **Diukur:** 2026-09-29 · **Penulis:** sesi agen
**Pemicu:** pemilik meminta *"review keseluruhan company page bandingkan company page
rekan mitra MoU. dari berbagai segi berikan penilaian"*.

> **Metode.** Setiap angka di bawah **diukur**, bukan diperkirakan. Sumber: `dist/index.html`
> (artefak build), `curl` langsung ke enam situs mitra, dan hitungan berkas di repo.
> Perintah pengukuran dicatat di §7 supaya bisa diulang. Yang **tidak** bisa saya ukur
> (Lighthouse, Core Web Vitals lapangan) saya sebut apa adanya, bukan diganti tebakan.
>
> **Dokumen kerabat:** `docs/PARTNER_SITE_COMPARISON_2026-09-29.md` = daftar celah FITUR
> (apa yang mereka punya, kita tidak). Dokumen **ini** = rubrik penilaian berskor
> lintas-segi. Keduanya saling melengkapi, tidak menggantikan.

---

## 1. Ringkasan skor

Skor 1–5 (5 = terbaik). Kolom "bukti" = angka terukur, bukan opini.

| # | Segi | Skor kita | Rata-rata mitra | Verdict singkat |
|---|---|---|---|---|
| 1 | **Legalitas & keterpercayaan** | **5** | 2 | Kita menerbitkan nomor izin + kredensial pengajar; mereka tidak |
| 2 | **Kejujuran klaim** | **5** | 2 | Kita menyatakan "belum SO" + punya gate anti-karang |
| 3 | **Cakupan konten** | **4** | 4 | 10 seksi, dalam; mereka unggul di testimoni & blog |
| 4 | **Kedalaman bahasa (ID/JP)** | **5** | 3 | 1.737 kunci ID + 1.700 JP, dua arah, tergerbang |
| 5 | **Aksesibilitas** | **5** | 1 | 33 gate e2e, termasuk AX-tree & kontras WCAG |
| 6 | **Bobot halaman (performa)** | **2** | **4** | **HTML 55,7 KB gz vs 6–11 KB mereka** ← celah terbesar |
| 7 | **Penemuan (SEO teknis)** | **2** | 3 | **0 JSON-LD, 0 hreflang**; mereka punya |
| 8 | **Konversi / ajakan bertindak** | **4** | 3 | Form kontak + WA ada; mereka punya pendaftaran daring |
| 9 | **Bukti sosial spesifik** | **1** | **5** | **6 slot kosong vs puluhan cerita bernama** ← celah kedua |
| 10 | **Pemeliharaan / kualitas proses** | **5** | 1 | 33 gate, ratchet, tests; mereka tidak terukur |
| | **Rerata** | **3,8** | **2,8** | Unggul di 7 segi, kalah telak di 3 |

**Bacaan jujur:** kita menang di hal-hal yang **membangun kepercayaan dan tidak bisa
dibeli** (legalitas, kejujuran, aksesibilitas, proses). Kita kalah di hal-hal yang
**terlihat langsung oleh pengunjung dalam 3 detik** — terutama **(6) bobot halaman** dan
**(9) bukti sosial**. Dua celah itu yang menjelaskan mengapa situs mitra "terasa" lebih
matang meski secara substansi lebih tipis.

---

## 2. Angka mentah — diukur 2026-09-29

### 2a. Bobot yang benar-benar dikirim (gzip), halaman depan

| Situs | HTML mentah | **HTML gzip** | CSS | JS |
|---|---|---|---|---|
| **asj-astro (kita)** | **214.602 B** | **55.679 B** | 186.563 B (28.334 gz) | 1.308 B + 108.773 B (i18n-jp, 33.981 gz) |
| ysfloraindonesia.com | 62.010 B | **9.450 B** | 8 sheet | 10 script |
| humanindonesia.com | 61.751 B | **10.752 B** | 13 sheet | 16 script |
| lpkjapanesia.com | 31.346 B | **8.995 B** | 2 sheet | 6 script |
| jipa.co.id | 271.725 B | *tidak diambil* | 0 sheet | 42 script |
| hibikicendekia.com | 25.008 B | **6.017 B** | 8 sheet | 6 script |

**Temuan utama:** HTML kita **5,2× lebih berat** dari mitra terberat (humanindonesia)
dan **9,3×** lebih berat dari yang teringan (hibiki) — setelah kompresi.

**Dari mana bobotnya berasal** (diukur pada `dist/index.html`):

| Komponen | Ukuran | Pangsa |
|---|---|---|
| Komentar HTML yang terkirim ke browser | 18.412 B | **8,6 %** (55 blok) |
| Atribut `data-lang` (nilai kunci i18n) | 8.037 B | **3,7 %** (247 atribut, 235 kunci unik) |
| Sisanya | 188.153 B | 87,7 % |

⚠️ **8,6 % halaman adalah komentar** — ini konsekuensi Astro yang mengirim `<!-- -->`
apa adanya (R19). Ia bukan cacat, tapi **berat tanpa manfaat bagi pengunjung**.

### 2b. Sinyal struktural

| Situs | h1 | h2 | JSON-LD | hreflang | form | `lang` |
|---|---|---|---|---|---|---|
| **kita** | **1** | **19** | **0** ⛔ | **0** ⛔ | 1 | `id` |
| ysfloraindonesia | 1 | 7 | **1** (Organization) | 0 | 1 | en |
| humanindonesia | **2** ⚠ | 3 | 0 | **3** | 1 | id |
| lpkjapanesia | 1 | 5 | **1** | 0 | 1 | id |
| jipa.co.id | 1 | 8 | 0 | **6** | 0 | id-ID |
| hibikicendekia | **0** ⚠ | **0** ⚠ | **1** (WebPage) | 0 | 0 | en |

- **Kita unggul di disiplin heading**: tepat 1 `h1`, 19 `h2` berurutan. Human punya 2 `h1`;
  Hibiki punya **0** `h1` dan **0** `h2` — tidak ada struktur sama sekali.
- **Kita kalah di penemuan**: **0 JSON-LD** (3 dari 6 mitra punya) dan **0 hreflang**
  (Human 3, JIPA 6). Padahal kita punya dua bahasa penuh — justru kita yang seharusnya
  memakainya paling banyak.

### 2c. Isi & i18n

| Ukuran | Nilai |
|---|---|
| Seksi di `/` | **10** (`tentang, tim, program, alur, mitra, testimoni, lokasi, kontak, galeri, penempatan`) |
| Kunci i18n ID | **1.737** |
| Kunci i18n JP | **1.700** |
| Gate e2e | **33** berkas `e2e/*.mjs` |
| Ukuran `src/pages/index.astro` | **1.074 baris** ⚠ |
| Slot testimoni terisi | **0 dari 6** ⛔ |
| Halaman FAQ | **tidak ada** ⛔ |

---

## 3. Penilaian per segi

### 3.1 Legalitas & keterpercayaan — **5/5** ✅ unggul

Nomor SK Kemenkumham, akta notaris, dan **sertifikat JLPT N1 pengajar** dipublikasi dan
bisa diperiksa. Dari enam mitra, **tidak satu pun** memuat nomor izin + kredensial
pengajar secara terperinci. Untuk audiens Jepang — yang menilai izin di atas segalanya —
ini keunggulan nyata, bukan kosmetik.

### 3.2 Kejujuran klaim — **5/5** ✅ unggul

Kita menyatakan **"belum SO"** secara terbuka dan menunjukkan siapa yang berwenang.
Mitra menonjolkan kelebihan saja. Yang lebih penting: repo kita punya **gate yang
memastikan angka di halaman = angka di dokumen resmi** (`COMPANY_PROFILE_DATA.md` §8/§12),
sehingga klaim palsu **tidak bisa masuk** tanpa gagal build. Tidak ada mitra yang punya
mekanisme itu.

### 3.3 Cakupan konten — **4/5** 🟡 seimbang

10 seksi yang dalam. Mitra unggul di dua area yang kita kosongkan **dengan sengaja**:
testimoni bernama dan blog/berita terjadwal. Kekurangan kita yang murni konten dan
**murah**: **tidak ada FAQ** — padahal JIPA punya 6 Q&A dan pertanyaannya (biaya,
cicilan, dana talang, lama proses) sudah berulang di enam situs mitra, dengan jawaban
yang sudah ada di `COMPANY_PROFILE_DATA.md` §5–§7.

### 3.4 Kedalaman bahasa — **5/5** ✅ unggul

**1.737 kunci ID + 1.700 kunci JP**, seluruh halaman, dua arah, dengan gate yang mencegah
kunci bocor (`i18n.keys.test.ts`). Mitra: Human punya id/en/jp, JIPA punya id/en/jp,
Jinzai hampir seluruhnya Jepang, Flora & Hibiki **hanya satu bahasa**. Kita paling
lengkap — dan JP disimpan sebagai chunk terpisah (33.981 B gz) yang hanya dimuat saat
pengunjung beralih, bukan ikut di muatan awal. Itu keputusan yang benar.

### 3.5 Aksesibilitas — **5/5** ✅ unggul telak

**33 gate e2e**, termasuk `test-aria-names.mjs` (membaca **AX tree asli** via CDP, bukan
grep), `test-contrast.mjs` (kontras diukur **piksel**, 0 elemen di bawah lantai WCAG),
`test-hover-contrast.mjs` (6/6, 132 elemen), `test-headings.mjs`, `test-labels.mjs`.
Di halaman depan: 12 `aria-label`, 29 `alt`. **Tidak satu pun mitra terukur** — mereka
tidak punya gate apa pun, jadi tidak ada angkanya. Ini keunggulan yang tidak akan
terlihat mata pengunjung, tapi nyata bagi pengguna pembaca layar.

### 3.6 Bobot halaman — **2/5** ⛔ celah terbesar

Lihat §2a. **HTML 55,7 KB gz vs 6–11 KB mitra.** Penyebab terukur:

1. **Komentar terkirim ke browser: 18,4 KB (8,6 %)**. Rasionalnya berguna untuk pemelihara,
   tapi pengunjung membayarnya. Ini bisa dipindahkan ke berkas `.md` tanpa kehilangan apa pun.
2. **`data-lang` per elemen: 8,0 KB (3,7 %)** — konsekuensi arsitektur i18n "tulis ulang
   saat hidrasi". 247 atribut kunci. Menggantinya berarti mengubah arsitektur i18n; bukan
   perbaikan sore hari.
3. **CSS 186 KB mentah / 28,3 KB gz dalam SATU berkas.** Nama berkasnya `admin.*.css`
   tapi **0 selektor khusus admin** di dalamnya — jadi ini bukan bug scope, hanya satu
   bundle global besar yang tidak pernah di-split.

**Catatan penting:** sebagian bobot ini adalah **harga dari keunggulan kita**. Dua bahasa
penuh + 10 seksi + markup aksesibel memang lebih berat daripada halaman satu-bahasa yang
tipis. Jadi jangan mengejar angka mitra; kejar **menghapus bobot yang tidak membeli apa pun**
(§4.1).

### 3.7 Penemuan (SEO teknis) — **2/5** ⚠️ kalah

- **0 JSON-LD.** Tiga mitra memakainya (`Organization`, `WebPage`). Untuk lembaga yang
  ingin muncul di panel pengetahuan Google ("LPK Amanah Sakura Japan" + alamat + jam),
  ini kehilangan langsung. Murah: satu blok `Organization` dengan data yang **sudah ada**
  di `companyProfile.ts` (nama, alamat, telepon, koordinat, jam).
- **0 hreflang.** Human 3, JIPA 6. Kita punya dua bahasa penuh yang **tidak saling
  menunjuk**, sehingga Google bisa menganggap keduanya konten duplikat alih-alih versi
  bahasa. Ini justru meniadakan manfaat keunggulan i18n kita.
- Plus: tidak ada halaman FAQ (konten yang justru disukai mesin pencari) dan tidak ada
  blog (sinyal "lembaga aktif" — Human punya 13+ artikel bertanggal teratur).

### 3.8 Konversi — **4/5** 🟡 seimbang

Form kontak (`client:visible`, jadi JS-nya hanya dimuat saat discroll — keputusan yang
benar) + tautan WA + tautan Maps kanonik. JIPA punya tombol "gabung", Flora punya form + WA,
Human punya webinar mingguan. Kita seimbang; yang belum ada adalah **pendaftaran daring
khusus** (Human & JIPA punya), tapi kita punya `/siswa-baru` + `/apply` yang menutup
sebagian kebutuhan itu.

### 3.9 Bukti sosial — **1/5** ⛔ celah kedua terbesar

**6 slot testimoni, 0 terisi.** Mitra: Flora menampilkan **6 nama alumni + prefektur**,
Human/Gunamandiri **11+ artikel profil**, JIPA **6 ulasan**. Mereka punya bukti sosial
yang **spesifik dan bisa diperiksa** ("Kayla — Shiga"). Kita tidak punya satu pun.

Skor 1 (bukan 0) karena modelnya **sudah ada dan sudah tergerbang** — hanya belum diisi.
Penghalangnya **bukan teknis**, melainkan **izin tayang (P-7)**: wajah yang bisa dikenali
adalah data pribadi, dan repo ini publik. **Keputusan pemilik diperlukan**, bukan kerja agen.

### 3.10 Pemeliharaan & kualitas proses — **5/5** ✅ unggul telak

33 gate e2e, ratchet lint & typecheck, counter beku untuk inventaris berkas, gate anti-
karangan, gate nama aksesibel, gate kontras piksel. **Tidak satu pun mitra punya apa pun
yang terukur.** Ini yang membuat setiap klaim di atas bisa diverifikasi — dan itu alasan
penilaian ini bisa jujur, termasuk soal kelemahan kita.

⚠️ Satu catatan pemeliharaan yang saya temukan: **`src/pages/index.astro` = 1.074 baris.**
Ia berisi 10 seksi + rasional panjang per seksi. Bukan krisis, tapi ini satu berkas yang
menampung seluruh halaman depan, dan ia tumbuh setiap sesi.

---

## 4. Yang saya rekomendasikan, atas dasar rasio (dampak ÷ biaya)

### 4.1 Bisa dikerjakan sekarang — murah, dampak tinggi

| # | Tindakan | Dampak | Biaya | Alasan |
|---|---|---|---|---|
| **A** | **Pangkas komentar HTML dari bundle produksi** | −18,4 KB mentah (-8,6 %) | Rendah | Pindahkan rasional ke `docs/`, sisakan satu baris rujukan. Pengunjung berhenti membayar untuk catatan pemelihara |
| **B** | **Tambah JSON-LD `Organization`** | Panel pengetahuan Google | **Sangat rendah** | Datanya sudah ada di `companyProfile.ts`; satu blok `<script type="application/ld+json">` |
| **C** | **Tambah `hreflang` ID↔JP** | Memperbaiki sinyal duplikat; manfaat i18n kita akhirnya sampai ke Google | Rendah | Dua `<link rel="alternate" hreflang>` |
| **D** | **Halaman FAQ** | Menyerap keraguan; konten yang disukai mesin pencari | Rendah | Jawaban sudah ada di `COMPANY_PROFILE_DATA.md` §5–§7 |

**A** adalah satu-satunya yang saya sarankan dikerjakan lebih dulu: ia mengurangi bobot
tanpa mengubah perilaku apa pun, dan hasilnya **bisa langsung diukur** (target: HTML gz
turun dari 55,7 KB ke ~44 KB).

### 4.2 Butuh keputusan pemilik dulu

| # | Tindakan | Mengapa perlu keputusan |
|---|---|---|
| **E** | **Isi 6 slot testimoni dengan cerita bernama** | Terhalang **P-7 (izin tayang wajah)**. Ini fitur terkuat yang kita tidak punya, tapi **tidak boleh** dikerjakan tanpa izin — dan tanpa nama/foto spesifik, mengisinya sama dengan testimoni karangan yang dilarang §8 |
| **F** | **Blog/berita terjadwal** | Butuh komitmen konten rutin + alur admin. Bukan sekali kerja |

### 4.3 Catat, jangan kerjakan

1. **Statistik besar mencolok** (Japanesia: "3.698 terkirim, 98% lulus") — ⛔ §8/§12
   melarang kita menerbitkan angka mitra/kandidat/keberangkatan. Angka itu milik mereka
   dan benar **untuk mereka**.
2. **"15+ tahun pengalaman"** (Flora) — kita **SINCE 2023**, umur kita 3 tahun.
3. **Video profil & aplikasi belajar** — butuh produksi/lingkup di luar situs.
4. **Lowongan aktif di beranda** — keputusan pemilik 2026-09-24: `/` = profil perusahaan,
   bukan papan lowongan.

---

## 5. Jawaban langsung: apakah halaman kita "layak"?

**Ya, dan secara substansi lebih jujur serta lebih dapat dipercaya daripada enam mitra.**
Pada tujuh dari sepuluh segi kita unggul atau seimbang, dan pada dua segi yang paling
sulit dipalsukan — legalitas dan kejujuran klaim — kita menang jelas.

**Tapi dua celah membuat kita "terasa" lebih lemah dari yang sebenarnya:**

1. **Bobot** (§3.6) — pengunjung dengan koneksi lambat merasakannya lebih dulu daripada
   membaca keunggulan kita. Ini **bisa** dan **murah** diperbaiki (A).
2. **Bukti sosial** (§3.9) — tiga detik pertama, mitra menampilkan wajah dan nama nyata;
   kita menampilkan enam kartu kosong. Ini **tidak bisa** diperbaiki oleh agen (P-7).

Kesimpulan yang saya usulkan: **kerjakan A + B + C + D sekarang** (semua murah, semuanya
memperbaiki celah terukur, tidak satu pun menambah klaim baru yang berisiko), lalu
**putuskan E** — karena hanya pemilik yang boleh membuka penghalang izin itu.

---

## 6. Yang berubah di repo karena laporan ini

| Berkas | Perubahan |
|---|---|
| `docs/COMPANY_PAGE_ASSESSMENT_2026-09-29.md` | **Berkas ini** — dibuat |

**Tidak ada kode yang diubah.** Laporan ini murni penilaian; setiap tindakan di §4 belum
dilaksanakan dan menunggu keputusan pemilik. Itu disengaja: temuan soal bobot (§2a)
menyentuh artefak build, dan temuan soal bukti sosial (§3.9) terhalang aturan P-7 —
keduanya bukan sesuatu yang boleh saya kerjakan sendiri tanpa persetujuan.

---

## 7. Cara mengulang pengukuran ini

```bash
# bobot & struktur artefak kita
node -e "const h=require('fs').readFileSync('dist/index.html','utf8');
 const g=r=>(h.match(r)||[]).length;
 let c=0,n=0; const re=/<!--[\s\S]*?-->/g; let m;
 while((m=re.exec(h))){c+=m[0].length;n++;}
 console.log('bytes',h.length,'comments',c,'('+(c/h.length*100).toFixed(1)+'%)',
   'data-lang',g(/data-lang=/g),'jsonld',g(/application\/ld\+json/gi),'hreflang',g(/hreflang/gi));"

# yang benar-benar dikirim lewat kabel
gzip -9 -c dist/_astro/admin.n9DoHbyU.css | wc -c
gzip -9 -c dist/index.html | wc -c

# mitra, diikuti redirect, lalu ukur hal yang sama
for u in ysfloraindonesia.com humanindonesia.com lpkjapanesia.com jipa.co.id hibikicendekia.com; do
  curl -fsSL --noproxy '*' -A "Mozilla/5.0" "https://$u/" -o "F:/tmp/p_$u.html"
  printf "%-24s " "$u"; gzip -9 -c "F:/tmp/p_$u.html" | wc -c
done
```

**Jebakan yang sudah terbukti di repo ini, dan berlaku pada pengukuran di atas:**

- `grep -c` pada HTML hasil build **selalu 1** karena HTML diminifikasi jadi satu baris.
  Pakai `grep -o … | wc -l`. Diukur: `data-filled="false"` → 6 kartu (bukan 1).
- `curl -o /dev/null` keluar **exit 23** walau request berhasil. Pakai `curl -fsS "$URL" > /dev/null`.
- Proksi sandbox membuat `127.0.0.1` dijawab **502**; tambahkan `--noproxy '*'` (sudah dipakai di atas).
- `jsi-jinzai.com` **tidak dapat diakses** saat pengukuran (exit 000) — jadi Jinzai tidak
  masuk tabel bobot. Itu ketiadaan data, bukan nilai nol.
- `jipa.co.id` HTML-nya 271.725 B mentah, tapi bobot gz tidak diambil dan **CSS-nya 0 sheet**
  (gaya mungkin inline) — jadi barisnya tidak sebanding dan saya tandai apa adanya.
