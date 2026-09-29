# Perbandingan Situs Mitra MoU vs asj-astro — 2026-09-29

**Status:** laporan analisis · **Diukur:** 2026-09-29 · **Penulis:** sesi agen
**Pemicu:** pemilik memberikan enam situs mitra MoU dan meminta (a) mengisi slot
"Mitra Kami" di halaman profil perusahaan, dan (b) membandingkan situs mereka
dengan situs kita untuk mencari apa yang bisa ditingkatkan.

> **Sumber.** Setiap nama perusahaan, status SO/LPK/P3MI, dan angka di bawah dibaca
> dari **halaman situs masing-masing mitra** (halaman about/company mereka sendiri,
> bukan disimpulkan dari nama domain). Angka mitra **tidak** dikutip ke halaman
> publik kita — lihat §3.

---

## 1. Enam mitra, dan apa status mereka yang sebenarnya

| # | Situs | Entitas (dari situsnya) | Status yang dinyatakan | Lokasi |
|---|---|---|---|---|
| 1 | ysfloraindonesia.com | **PT Flora Talent Indonesia** (di bawah YS Talent Japan) | LPK berlisensi + penyalur | — |
| 2 | humanindonesia.com | **PT Human Mandiri Indonesia** (grup: Gunamandiri Paripurna) | LPK + P3MI | — |
| 3 | lpkjapanesia.com | **LPK Japanesia** | **SO** (認証送出し機関), Indramayu | Indramayu |
| 4 | jipa.co.id | **PT JIPA** (Japan Indonesia Program Akademik); grup punya LPK MOMIJI (SO) & JIPA P3MI | LPK + SO + P3MI + travel + kuliner | Boyolali, Bali, Surabaya |
| 5 | jsi-jinzai.com | **LPK Jinzai Servis Indonesia** | **SO** (izin 2/4276/HK.03.01/X/2023, OTIT IDN000431) | Tangerang |
| 6 | hibikicendekia.com | **PT Hibiki Cendekia Mandala** | **P3MI** | Banyuwangi |

⚙️ **Satu hal yang saya perbaiki, bukan sekadar catat.** Tautan pemilik untuk #3
tertulis `lpfjapanesia`; situs yang benar adalah **lpkjapanesia** (`f` → `k`), dan
yang dipakai di `partners.ts` adalah yang benar. #5 ditulis tanpa `www.` dan
dipakai apa adanya.

**Yang penting untuk kita:** dari enam, **tiga menyatakan diri sebagai SO**
(Japanesia, Jinzai, MOMIJI/JIPA) dan satu sebagai P3MI (Hibiki). Itu justru
jawaban langsung atas kalimat "kami belum berstatus SO" di halaman kita — jaringan
ini benar-benar memegang kewenangan keberangkatan yang tidak kita punya.

---

## 2. Apa yang mereka punya dan kita tidak

Diurutkan dari yang **paling layak ditiru**. Kolom "biaya" = seberapa besar
perubahan yang dibutuhkan, bukan seberapa bagus idenya.

| # | Fitur | Siapa yang punya | Kenapa itu kuat | Biaya untuk kita |
|---|---|---|---|---|
| **1** | **Testimoni/cerita alumni bernama** | Flora (6 nama, prefektur), Human/Gunamandiri (11+ artikel profil), JIPA (6 ulasan) | Bukti sosial yang **spesifik dan bisa diperiksa** ("Kayla — Shiga", "Kak Afriza dari Ponorogo"). Kita **tidak punya satu pun** | **Tinggi** — butuh izin tayang (P-7) + foto |
| **2** | **Blog/berita terjadwal** | Human (13+ artikel, tanggal teratur 2025–2026), Flora, JIPA | Konten yang bisa ditemukan Google, dan sinyal "lembaga ini aktif" | **Tinggi** — CMS/konten rutin |
| **3** | **Pendaftaran/konsultasi online** | Flora (form + WA), JIPA (tombol gabung), Human (webinar mingguan) | Jalur konversi langsung dari halaman | **Sedang** — form sudah ada di `#kontak` |
| **4** | **Peta situs multi-kota** | JIPA (Boyolali/Bali/Surabaya), Jinzai | Menunjukkan skala nyata | **Rendah** — kita satu lokasi; cukup di `#lokasi` |
| **5** | **Program terperinci per-jalur** | Flora (4 program + biaya "gaji 20–25 jt"), Japanesia (perbidang + angka) | Menjawab "programnya apa saja dan hasilnya apa" | **Sedang** — kita punya `#program` + `#alur` |
| **6** | **Halaman FAQ** | JIPA (6 Q&A) | Menyerap keraguan tanpa perlu dihubungi | **Rendah** — murni konten |
| **7** | **Statistik besar yang mencolok** | Japanesia (3.698 terkirim, 2.420 belajar, 1.250 perusahaan, 9 tahun, 98% lulus) | Membangun kredibilitas dalam 3 detik | ⛔ **JANGAN** — lihat §3 |
| **8** | **Switcher bahasa ID/JP/EN** | Human (id/en/jp), JIPA, Jinzai (JP) | Menjangkau perusahaan Jepang langsung | **Rendah** — kita sudah punya ID/JP |
| **9** | **Video profil perusahaan** | Japanesia ("会社紹介動画") | Lebih meyakinkan daripada teks | **Sedang** — butuh produksi |
| **10** | **Aplikasi belajar online** | JIPA (**JIPA E-College**), Human (kelas + webinar) | Produk nyata, bukan janji | **Tinggi** — di luar cakupan situs |

---

## 3. ⛔ Yang mereka lakukan tapi kita **tidak boleh** tiru

Ini bagian yang paling mudah salah, dan alasannya tertulis di repo kita sendiri.

| Klaim di situs mitra | Kenapa kita tidak boleh menyalin polanya |
|---|---|
| Japanesia: "**3.698+** terkirim", "**2.420** belajar", "**1.250+** perusahaan", "**98%** kelulusan" | `COMPANY_PROFILE_DATA.md` §12 & §8 melarang kita menerbitkan **jumlah** kandidat/keberangkatan/mitra. Angka itu milik mitra dan benar **untuk mereka**; menampilkannya di halaman kita sebagai milik kita adalah klaim palsu |
| Flora: "**15+** tahun pengalaman" | Kita **SINCE 2023** (§1 K-1). Umur lembaga kita = 3 tahun. Angka 15 adalah milik Flora |
| Testimoni bergaya "ratusan peserta sukses" tanpa nama | Testimoni karangan pernah ditolak untuk halaman ini; `docs/COMPANY_PROFILE_DATA.md` §8 menyebutnya menggantikan "testimoni karangan" dengan data prefektur nyata |
| Lowongan kerja aktif di beranda | Keputusan pemilik 2026-09-24: `/` = profil perusahaan untuk mitra, **bukan papan lowongan**. Sudah dipindahkan ke `/loker` + drawer |

> **Prinsipnya:** tiap situs mitra boleh memuat angka **tentang dirinya sendiri**.
> Yang tidak boleh adalah kita memuat angka **tentang diri kita** yang tidak ada di
> dokumen resmi kita — dan tidak boleh juga memuat angka **tentang mereka** seolah
> itu angka kita.

---

## 4. Yang sudah kita lakukan lebih baik dari mereka

Bukan untuk membanggakan diri — supaya tidak ada yang "memperbaiki" hal ini karena
melihatnya di situs mitra.

| Aspek | Kondisi kita | Yang mereka lakukan |
|---|---|---|
| **Legalitas terdokumentasi** | Nomor SK Kemenkumham, akta notaris, dan **sertifikat JLPT N1 pengajar** dipublikasi & bisa diperiksa (§2) | Tidak ada yang memuat nomor izin + kredensial pengajar secara terperinci |
| **Status SO dinyatakan jujur** | Kita menyatakan **belum SO** dan menunjukkan siapa yang berwenang — justru membangun kepercayaan | Umumnya hanya menonjolkan kelebihan |
| **Kepatuhan data** | Ada gate yang memastikan angka di halaman = angka di dokumen resmi | — |
| **Aksesibilitas** | Ada gate nama aksesibel (AX tree asli), gate kontras WCAG, gate heading | Tidak ada yang terukur |
| **Bilingual ID/JP lengkap** | Seluruh halaman, dua arah, dengan gate yang mencegah kunci bocor | Bervariasi; Jinzai hampir seluruhnya Jepang |

---

## 5. Rekomendasi, atas dasar bukti

Urutan ini **tidak** berdasarkan seberapa bagus fiturnya, tapi berdasarkan
**rasio (dampak ÷ biaya)** dan **apakah jalurnya sudah ada**.

### Bisa dikerjakan sekarang, murah
1. **Halaman FAQ** (§2 #6) — murni konten, memakai pertanyaan yang sudah berulang
   di enam situs mitra: syarat, biaya, cicilan, dana talang, lama proses.
   Legalitas jawabannya sudah ada di `COMPANY_PROFILE_DATA.md` §5–§7.
2. **Peta lokasi diperjelas** (§2 #4) — satu halaman, satu institusi: cukup
   di `#lokasi`.

### Butuh keputusan pemilik dulu
3. **Testimoni/alumni bernama** (§2 #1) — **fitur paling kuat yang kita tidak
   punya**, tapi terhalang P-7 (izin tayang foto/wajah). Tanpa izin, ini tidak
   boleh dikerjakan. **Pemilik perlu memutuskan.**
4. **Blog/berita** (§2 #2) — butuh komitmen konten rutin, bukan sekali kerja.
   Kalau dipilih, ia butuh alur admin + penskalaan, jadi fitur, bukan hiasan.

### Catat, jangan kerjakan
5. Statistik besar, video profil, aplikasi belajar — **jangan disalin** dalam
   bentuknya yang sekarang (§3, §2 #7/#9/#10).

---

## 6. Yang berubah di repo karena laporan ini

| Berkas | Perubahan |
|---|---|
| `src/lib/partners.ts` | Enam slot **diisi** dengan nama mitra nyata; ditambah field `home` (URL sumber nama, untuk ketertelusuran) |
| `src/store/i18n.ts`, `i18n-jp.ts` | Enam kunci nama mitra; klausa "masih dalam proses publikasi" **dihapus** dari catatan |
| `src/pages/index.astro` | Catatan `#mitra` tidak lagi menyatakan daftar sedang disiapkan |
| `e2e/test-landing.mjs` | Gate baru: **setiap mitra yang dinamai di data harus tampil di `#mitra`**, + lantai 6 nama + jumlah kartu = jumlah slot |

**Yang sengaja TIDAK diubah:** tidak ada logo yang dipasang (tidak ada yang
diberikan, dan logo adalah merek dagang), dan tidak ada angka mitra yang
dipublikasikan (§3).

---

## 7. Bacaan berikutnya

- `src/lib/partners.ts` — data mitra + alasan tiap keputusan.
- `docs/COMPANY_PROFILE_DATA.md` §12–§13 — klaim yang dilarang & yang masih
  menunggu pemilik.
- `docs/LANDING_PAGE_SPEC.md` §9 — P-1..P-7 (P-7 = izin tayang, penghalang
  rekomendasi #3).
