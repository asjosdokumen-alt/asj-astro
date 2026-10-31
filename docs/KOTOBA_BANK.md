# Bank kosakata `/kotoba` — buku (Bab 1–50) dan 16 bidang kerja SSW

Dokumen ini menjelaskan **apa isi bank kosakata, dari mana asalnya, dan apa yang
menjaganya**. Versi terakhir: 2026-10-31, saat bank buku diperluas ke Bab 1–50
dan modul bidang 特定技能 diperbesar menjadi lima kategori per bidang.

Alamat kode:

- `netlify/functions/_lib/kotoba/bank.ts` — 1 449 kata buku, Bab 1–50.
- `netlify/functions/_lib/kotoba/ssw.ts` — 1 061 kata kerja, 16 bidang.
- `src/components/candidate/KotobaGame.tsx` — satu mesin permainan untuk dua
  sumber (kuis, ketik, flashcard, kamus).
- `netlify/functions/surfaces/ai.ts` — `getBankKotoba` dan `getBankSsw`.
- `e2e/kotoba-bank.test.ts` — isi data (bab, duplikat, romaji, kategori).
- `e2e/kotoba-guard.test.ts` — siapa yang boleh menerima bank.
- `e2e/kotoba-ssw.test.tsx` — modul SSW benar-benar dipakai di layar.

## Dua bank, bukan satu

Bank buku dan bank bidang sengaja dipisah, dan bukan karena rapi:

1. **Umurnya berbeda.** Bank buku berubah kalau silabusnya berubah; bank bidang
   berubah kalau bidangnya berubah. Satu berkas berarti setiap penambahan satu
   bidang menggeser sebaran bab.
2. **Ukurannya berbeda.** 1 449 kata buku tidak perlu ikut terkirim ke siswa
   yang baru membuka satu bidang, dan sebaliknya. Karena itu `getBankSsw` adalah
   endpoint sendiri dan dimuat **malas** — hanya saat tab "Bidang Kerja" dibuka.
3. **Pengecohnya berbeda.** Siswa yang menghafal bab 32 tidak ingin pilihan
   jawabannya diambil dari istilah las kapal. `pool` di `KotobaGame` hanya
   berisi satu sumber pada satu waktu.

## Asal data buku — lima lapis

| Lapis | Jumlah | Sumber | Penempatan bab |
|---|---|---|---|
| 1 | 216 kata | `GAME.html` milik pemilik (2026-10-27) | perkiraan tematik |
| 2 | 216 kata | tambahan tematik hari yang sama | perkiraan tematik |
| 3 | 432 kata | daftar Bab 1–25 jp0908.com (diurai dari HTML) | mengikuti sumbernya |
| 4 | 113 kata | daftar pemilik `daftar_lengkap_kosakata_..._bab_1_25.md` | mengikuti daftar itu |
| 5 | 480 kata | silabus Minna no Nihongo II (tema tata bahasa per bab) | mengikuti tema bab |

Lapis 5 **bukan** salinan daftar kata resmi buku — tidak ada daftar itu di
tangan saat penambahan. Yang dipakai adalah pola kalimat tiap bab: 26 `んです`,
27 bentuk potensial, 30 `てあります`, 33 `命令形・禁止形`, 41 `いただきます`,
49 `尊敬語`, 50 `謙譲語`, dan seterusnya. Kalau nanti daftar resmi didapat, yang
dikoreksi lebih dulu adalah lapis 1–2 dan lapis 5.

### Kenapa Bab 26–50 "hanya" 480 kata

Banyak kata yang secara naluri milik Bab 26–50 ternyata **sudah ada** di Bab
1–25, karena lapis 2 menempatkannya secara tematik lebih awal: 病気 di bab 17,
写真 di bab 18, 電車 di bab 5, 甘い di bab 8, 電話 di bab 3. Kata itu **tidak
dipindahkan**. Alasannya bukan kemalasan: `kunciKata()` menyimpan progres
hafalan per `kanji|cara baca`, sehingga memindahkan bab tidak memindahkan
riwayat — ia hanya membuat kata yang sudah dihafal muncul lagi sebagai "baru".

Karena itu blok `TAMBAHAN bab 26–50` di akhir `RAW` berisi kata yang benar-benar
belum ada, bukan daftar buku. Hasilnya 15–22 kata per bab, cukup untuk satu
ronde (ronde berjalan sampai 3 nyawa habis, bukan 10 soal).

## 16 bidang kerja (特定技能) — lima kategori per bidang

| id | Bidang (JP) | Nama Indonesia | Kata |
|---|---|---|---|
| `kaigo` | 介護 | Perawatan Lansia | 71 |
| `kuriiningu` | ビルクリーニング | Pembersihan Gedung | 67 |
| `inshokuhin` | 飲食料品製造業 | Pengolahan Makanan | 69 |
| `kensetsu` | 建設 | Konstruksi | 71 |
| `seizou` | 素形材・産業機械・電気電子情報関連製造業 | Manufaktur Mesin & Elektronik | 65 |
| `gaishoku` | 外食業 | Restoran | 63 |
| `nougyou` | 農業 | Pertanian | 68 |
| `gyogyou` | 漁業 | Perikanan | 67 |
| `shukuhaku` | 宿泊 | Perhotelan | 63 |
| `seibi` | 自動車整備 | Perawatan Otomotif | 67 |
| `koukuu` | 航空 | Aviasi (Ground Handling) | 63 |
| `unsou` | 自動車運送業 | Transportasi Barang | 66 |
| `tetsudou` | 鉄道 | Perkeretaapian | 63 |
| `ringyou` | 林業 | Kehutanan | 65 |
| `mokuzai` | 木材産業 | Industri Kayu | 66 |
| `zousen` | 造船・舶用工業 | Galangan Kapal | 67 |

Tiap bidang dipecah **lima kategori**, dan kelimanya wajib terisi (minimal 8
kata per kategori):

| Kategori | Isi | Kenapa dipisah |
|---|---|---|
| `alat` | alat, bahan, mesin, perlengkapan | ujian menanyakan nama alat dan kegunaannya |
| `kerja` | tindakan kerja, bentuk ます | instruksi praktik memakai 〜してください |
| `aman` | bahaya, APD, higiene, tanggap darurat | bagian yang paling sering menjatuhkan peserta |
| `mutu` | pengukuran, standar, catatan hasil | 学科 menanyakan urutan dan toleransi |
| `kantor` | dokumen, instruksi, laporan, serah terima | 実技 dinilai dari cara menerima instruksi |

Tanpa kategori, daftar 65 kata per bidang hanya jadi dinding teks. Dengan
kategori, siswa bisa men-drill "keselamatan" saja sehari sebelum tes — dan
kuisnya tetap satu mesin yang sama.

### Batas yang harus dibaca sebelum percaya

Kosakata bidang disusun dari istilah yang dipakai di lapangan dan dari cakupan
yang biasa diujikan (peralatan, prosedur, keselamatan, mutu, dokumen). Ia
**bukan** salinan kisi-kisi resmi 技能測定試験, dan belum diverifikasi penutur
asli. Artinya:

- modul ini melatih **mengenali** alat, instruksi, dan istilah kerja;
- ia **tidak** menjamin cakupan ujian, dan tidak menggantikan buku persiapan
  resmi bidang masing-masing;
- satu bidang bisa memakai istilah perusahaan yang berbeda (nama alat tertentu
  di pabrik tertentu).

Kalau kisi-kisi resmi per bidang didapat, `ssw.ts` adalah berkas pertama yang
disesuaikan — bukan `bank.ts`.

## Yang menjaga isinya

`e2e/kotoba-bank.test.ts` memeriksa, dan **gagal** kalau:

- jumlah kata berubah tanpa angka di tes ikut diubah (1 449 buku, 1 061 bidang);
- ada bab yang hilang dari 1–50, atau bab 26–50 punya kurang dari 15 kata;
- ada kunci `kanji|cara baca` ganda — di seluruh bank buku, atau di dalam satu
  bidang;
- satu baris saja punya romaji yang tidak cocok dengan kolom kana-nya;
- sebuah bidang punya kurang dari 50 kata, kurang dari 8 kata kerja, atau
  kurang dari 20 kata benda;
- ada kategori yang kosong (kurang dari 8 kata), atau kategori `kerja` tidak
  berisi kata kerja;
- ada `cat` di luar lima nilai yang dikenal klien;
- kata bidang tidak bertanda `b: 0`.

Pemeriksaan romaji memakai konverter kana→romaji yang ditulis mengikuti ejaan
bank ini: `ou`/`oo` dipertahankan (`ginkouin`, `toori`), `づ` = `zu`, `っ`+`ち` =
`cch` (`suicchi`), `ー` menggandakan vokal terakhir, `ん` selalu `n`. Satu
pengecualian didaftarkan eksplisit di tes (`パーティー` → `paateii`), bukan
disembunyikan di normalisasi.

Gerbangnya dibuktikan bisa merah: mengganti satu romaji (`shoujou` → `shoujo`)
membuat tes gagal, dan mengembalikannya membuat tes hijau lagi.

`e2e/kotoba-guard.test.ts` menjaga hal yang berbeda: **siapa** yang menerima
bank. Kedua endpoint memakai `tolakKecualiSiswa` yang sama dengan bank soal
wawancara — tanpa sesi ditolak, bukan siswa ditolak dengan `isVip: false`
(bukan `sessionInvalid`, supaya UI bisa membedakan "belum login" dari "bukan
siswa"), siswa ASJ diterima, admin boleh untuk WA siapa pun, dan status yang
tidak terbaca berarti "gagal memeriksa", bukan tuduhan.

`e2e/kotoba-ssw.test.tsx` menjaga hal ketiga: modulnya **dipakai**. Tab SSW
harus memicu `getBankSsw` (bukan memakai bank buku), kamus harus menampilkan
kata bidang, ganti bidang harus mengganti daftar, dan filter kategori harus
menyaring — bukan sekadar mengganti label. Ketiganya dibuktikan bisa merah
dengan membuat pemilihan bidang selalu memakai bidang pertama.

## Biaya bundle — diukur, bukan disembunyikan

Bank ini ikut di-bundle ke entry `ai-chat` dan `bridge-links` (catch-all yang
menarik seluruh router). Karena itu penambahan ini **kelihatan** di gate
`bundle:size`:

| Entry | Sebelum perluasan | Sesudah | Delta |
|---|---|---|---|
| `ai-chat.js` | 375,9 KB | 446 KB | +70,1 KB |
| `bridge-links.js` | 935,6 KB | 1 005,8 KB | +70,2 KB |

Isinya dua berkas data: `_lib/kotoba/bank.ts` 121 KB dan `_lib/kotoba/ssw.ts`
106 KB (dari 36 KB). Tidak ada kode baru yang berat — 1 061 baris kata bidang,
masing-masing satu baris tuple.

Baseline diperbarui **hanya untuk dua entry itu**, bukan seluruh berkas.
`--update-baseline` menulis ulang 21 entry sekaligus, dan tujuh di antaranya
bergerak karena sebab lain (mis. `ingest.js` 92,5 → 84,3 KB di mesin ini);
menelan semuanya berarti merapikan drift yang bukan milik perubahan ini. Yang
tidak bisa dihindari: datanya memang harus ikut bundel, karena gerbang "khusus
siswa" hanya nyata kalau banknya tidak bisa diunduh tanpa sesi. Menaruhnya di
aset statis akan membatalkan gerbang itu.

## Menambah kata atau bidang

1. Tambahkan baris ke `RAW` di `bank.ts`, atau ke blok bidang di `ssw.ts`
   dengan format `[kategori, jenis, kanji, kana, romaji, arti]`.
2. Pastikan `kanji|cara baca` belum ada. Kalau sudah ada, **jangan** tambahkan —
   kata itu milik bab/bidang lain, dan duplikat membuat dua pilihan jawaban yang
   tampak sama.
3. Tulis romaji sebagai transliterasi kana, bukan terjemahan bebas.
4. Jalankan `e2e/kotoba-bank.test.ts`. Kalau jumlah kata berubah, ubah angka di
   tes — angka itu sengaja eksplisit supaya penambahan bisa dibuktikan.
5. Bidang baru: tambahkan satu entri ke `BIDANG_SSW` (id stabil, nama Indonesia,
   nama Jepang, satu kalimat `ringkas`, dan kata-katanya). Tes otomatis menuntut
   minimal 50 kata, kelima kategori terisi, dan kategori `kerja` berisi kata
   kerja.

## Batas lain yang diketahui

- **Tidak ada audio rekaman.** Suara memakai `speechSynthesis` peramban, jadi
  kualitasnya bergantung perangkat siswa.
- **Penempatan bab lapis 1–2 dan 5 adalah tematik**, bukan dari daftar resmi.
- **Progres hafalan disimpan per peramban** (`localStorage`, kunci
  `asj_kotoba_v1:<WA>`), bukan di server. Berganti perangkat berarti memulai
  dari nol.
