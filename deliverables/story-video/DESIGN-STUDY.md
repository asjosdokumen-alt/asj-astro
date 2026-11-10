# Studi desain — referensi & arah “Satu Jalan”

**Dibuat:** 2026-11-10 · **Status:** arah desain v2 (menggantikan v1)
**Berkas jadi:** `index.html` (animatic) · `out/ASJ-Satu-Jalan-animatic-16x9.mp4` (80 s)

---

## 0. Koreksi asumsi

Link yang diberikan bukan video *storytelling* naratif. Isinya:

| | |
|---|---|
| Judul | **Pioneer corn revolutionized** |
| Studio | **Resn** (Belanda) — dipublikasikan ulang kanal Orpetron |
| Durasi | **58 detik** |
| Jenis | **motion 3D realtime**, bukan *explainer* bersuara |
| Isi | proses & sains di balik benih jagung Pioneer, “told through the choreography of realtime 3D assets” |

Jadi yang dipinjam **bahasanya**, bukan isinya. Ini penting: kalau kita tiru
isinya, kita bikin video perusahaan tani. Yang kita tiru adalah **cara ia
memperlakukan satu objek di atas hitam**.

Saya ambil 38 frame (1 tiap 1,5 detik) lewat player, lalu membacanya sebagai
desain — bukan sebagai tontonan.

---

## 1. Sembilan aturan yang terbaca dari frame

| # | Aturan | Bukti di frame | Terjemahan ke ASJ |
|---|---|---|---|
| 1 | **Satu subjek, sisanya hitam** | tongkol jagung mengambang di kanan, 70% frame kosong | satu wajah / satu benda per shot; tidak ada kolase |
| 2 | **Palet maksimal tiga** | hitam + hijau dalam + emas; putih hanya untuk teks | hitam + plum/indigo + pink sakura (aksen tunggal) |
| 3 | **Tipografi kecil, bukan baliho** | 90% teks 14–18 px, huruf kapital, jarak lebar | 17 px, `letter-spacing .26em`; serif besar hanya 3× |
| 4 | **Teks berganti di dalam shot** | satu shot 10 s: “SOIL” → “POPULATION DENSITY” → “TESTING…” | tiap shot punya 2 *beat* teks, gambar tidak dipotong |
| 5 | **Makro dijadikan shot** | biji jagung memenuhi layar, jadi “dunia lain” | crop 1,9× pada panel kontrak → tangan menandatangani |
| 6 | **Chrome alat ukur** | crosshair di 4 sudut, garis progres, label kecil | crosshair + `01 — 06` + koordinat Ponorogo |
| 7 | **Gerak = dorong + tilt, bukan geser** | objek berputar pelan, kamera maju | `perspective + rotateY` 5°→2°, skala 1→1,055 |
| 8 | **Irama tidak metronomis** | potongan 1,5 s berselang shot 12 s | 6–9 s per shot, beat teks di tengahnya |
| 9 | **Satu grade menyatukan semua** | semua shot hijau-emas, tak ada yang “beda film” | `mix-blend-mode: color` + brightness .66–.86 per shot |

Aturan 4 adalah temuan termahal. Versi pertama saya memotong gambar setiap kali
teks berganti — itu yang membuatnya terasa seperti **slide presentasi**. Di
referensi, gambar **bertahan** dan teksnya yang datang-pergi.

---

## 2. Yang bisa dan tidak bisa kita tiru

**Bisa, dan sudah dikerjakan:** komposisi, palet, tipografi, chrome, grade,
ritme, gerak dorong, partikel.

**Tidak bisa:** aset 3D realtime. Resn membangun model 3D khusus; kita hanya
punya 6 ilustrasi 1120×800, 1 hero 2079×756, 1 peta 1200×900.

**Penggantinya, dan ini yang dipakai:**

- gambar lama **tidak** ditempel sebagai kartu — tapi diberi *mask* radial
  sehingga tepinya larut ke hitam (jadi “objek”, bukan “foto”);
- setiap shot diberi **grade warna** supaya 6 ilustrasi yang beda latar terasa
  satu film;
- **partikel** (debu + bokeh) bertahan melewati semua cut — ini yang membuat
  potongan terasa menyambung, bukan berganti halaman.

---

## 3. Shot list final — 10 shot, 80 detik

| # | Waktu | Gambar | Teks (beat) | Gerak |
|---|---|---|---|---|
| 01 | 0–6 | hitam | `PT · PONOROGO` / **AMANAH SAKURA** / `JAPAN` | larut masuk |
| 02 | 6–15 | hero sakura | **Dua tahun dari sekarang, kamu berdiri di sini.** → *Bukan keberuntungan. Urutan langkah.* | dorong 5,5%, tilt −5°→+2° |
| 03 | 15–24 | langkah-1 | *Semua dimulai dari satu formulir.* → *Kesehatan. Dokumen. Satu keputusan.* | dorong, mask radial |
| 04 | 24–32 | langkah-2 | *Bulan pertama bukan soal Jepang.* → **Soal bangun pagi.** | dorong |
| 05 | 32–40 | langkah-3 | *Satu ruangan.* → *Bahasa yang masih patah.* | dorong |
| 06 | 40–48 | langkah-5 (crop 1,9×) | *Paspor. Kontrak.* **COE.** → *Di sini perjalanan bisa berhenti.* | makro, dorong |
| 07 | 48–57 | peta Jepang | *Satu pesawat.* → **Satu arah.** · `47 prefektur` | jalur terbang digambar, angka naik |
| 08 | 57–65 | langkah-6 | *Koper dua puluh kilo.* → *Dan satu orang yang melambai.* | dorong |
| 09 | 65–72 | hero (crop kanan) | **Gajimu datang tiap bulan. Sekarang kamu yang menjelaskan.** | dorong, grade hangat |
| 10 | 72–80 | hitam | **Mulai dari langkah 1.** + 2 tombol | larut |

Chrome yang selalu ada: 4 crosshair sudut, garis progres 2 px di bawah,
label `01 — 06` kiri-bawah, koordinat kanan-bawah.

**Suara (belum dibuat, spesifikasi):** drone rendah 55 Hz sepanjang 80 s;
satu *sub-hit* tiap teks berganti; *whoosh* halus di 6 cut; tanpa musik
bermelodi sampai shot 09.

---

## 4. Kenapa versi pertama terasa “kurang hidup”

Empat penyebab, semuanya bisa disebut:

1. **Kartu, bukan objek.** Ilustrasi ditempel sebagai kartu berbingkai di atas
   latar gelap — mata membacanya sebagai “gambar di halaman web”, bukan “adegan”.
2. **Teks ikut bergerak bersama gambar.** Di referensi, kamera bergerak dan teks
   diam; atau sebaliknya. Gerak bersamaan membuat semuanya terasa mengapung.
3. **Tidak ada grade.** Enam ilustrasi dengan enam suhu warna berbeda = enam
   film berbeda yang ditempel jadi satu.
4. **Potongan selalu bertepatan dengan teks.** Jadi ritmenya metronomis: gambar
   berganti → teks muncul → gambar berganti. Referensi memisahkan keduanya.

---

## 5. Produksi

**Sudah ada di folder ini**

- `index.html` — animatic yang berjalan sendiri (buka di browser, `space` untuk
  jeda, `←/→` geser, `#t=43` untuk lompat ke shot tertentu).
- `out/ASJ-Satu-Jalan-animatic-16x9.mp4` — 80 s, 1600×900, 25 fps, 12,5 MB.
- `out/loop-hero.gif` — 6,4 s loop 520 px, 1,6 MB (untuk WhatsApp/IG story).
- `out/poster.jpg` — frame pembuka untuk thumbnail.

**Kalau mau dibuat ulang di CapCut / Premiere** (tanpa HTML):

1. Kanvas 1920×1080, latar `#04060a`.
2. Impor 6 ilustrasi + hero + peta. Untuk tiap klip: skala 100→106%, rotasi Y
   −5°→+2° (efek 3D), durasi 6–9 s.
3. Tambah *mask* radial (feather 40%) di tiap klip supaya tepi larut ke hitam.
4. Lapisan grade: *solid color* `#2a1533`, blend **Color**, opacity 30–45%.
5. Teks: Inter 700, 17 px, kapital, tracking 26%, satu garis 34 px di atasnya.
6. Partikel: *overlay* debu, satu lapisan menerus sepanjang 80 s.
7. Garis progres 2 px pink di bawah, crosshair di 4 sudut.

**Potongan 9:16 (Reels/TikTok/Story):** 60 s, shot 01 dibuang, shot 03–08
dipotong jadi 5 s, teks dinaikkan ke sepertiga atas (jangan di bawah — ketutup
UI). Semua `letter-spacing` dikurangi 4% supaya tidak terlalu renggang di layar
sempit.

---

## 6. Yang belum diputuskan

- Apakah perlu **suara manusia** (voice-over). Referensi tidak pakai VO sama
  sekali; teksnya yang bercerita. Untuk pasar LPK, VO Bahasa Indonesia mungkin
  lebih meyakinkan — tapi itu mengubah seluruh ritme.
- Apakah **angka 47 prefektur** boleh tampil (di situs sudah tampil; aturan
  internal melarang angka mitra/kandidat/keberangkatan — prefektur bukan
  ketiganya, tapi perlu konfirmasi).
- CTA akhir: “Konsultasi via WhatsApp” vs langsung ke formulir.
