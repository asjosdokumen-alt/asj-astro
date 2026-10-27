/**
 * _lib/matematika/bank.ts — bank soal "Simulasi Tes Matematika & Psikotes" untuk
 * halaman `/matematika`.
 *
 * ASAL
 * ----
 * Ditulis ulang dari simulator mandiri milik pemilik
 * (`lpk_japan_math_selection_simulator.html`, satu berkas HTML dengan Tailwind
 * CDN + `<script>` inline). Yang dipertahankan: empat modul aslinya (kraepelin,
 * kabataku, deret, soal cerita), dua format (ujian berwaktu / latihan dengan
 * pembahasan), suara, konfeti, dan rekor.
 *
 * Yang DITAMBAH (permintaan pemilik 2026-10-27: "bank soalnya lebih banyak biar
 * gak bosen"):
 *   • bank cerita 8 → 69 soal, 9 tema pabrik;
 *   • dua modul baru — `satuan` (konversi satuan) dan `logika` (perbandingan,
 *     rasio, waktu);
 *   • durasi ujian PER MODUL, bukan 120 detik untuk semuanya. Soal cerita 15
 *     soal dalam 2 menit bukan ujian ketelitian, itu ujian menebak.
 *
 * KENAPA DI SINI, BUKAN DI KLIEN
 * ------------------------------
 * Gerbang "khusus siswa ASJ" harus NYATA. Kalau bank cerita ikut masuk bundel JS,
 * siapa pun bisa membacanya tanpa sesi, dan label "khusus siswa" di dasbor jadi
 * klaim kosong. `getBankMatematika` memakai penjaga yang SAMA dengan bank soal
 * wawancara dan bank kosakata (`tolakKecualiSiswa` di `surfaces/ai.ts`), jadi
 * non-siswa tidak menerima satu soal pun.
 *
 * Yang tetap di klien hanyalah GENERATOR angka (kraepelin, kabataku, deret,
 * satuan, logika) — soal aritmetika acak tak terbatas, yang nilainya justru ada
 * pada pengulangan, bukan pada kerahasiaan.
 *
 * CARA MEMERIKSA SOAL BARU (jangan tambah tanpa ini)
 * -------------------------------------------------
 * Setiap `ans` di bawah dihitung tangan dan ditulis di `exp`. Menambah soal
 * berarti menulis pembahasannya juga — `e2e/matematika-soal.test.ts` menolak
 * baris tanpa `exp`, `ans` non-finite, `kode` dobel, atau `unit` kosong, tapi ia
 * TIDAK bisa memeriksa aritmetika. Angka salah akan lolos gate; yang menangkapnya
 * hanya pembahasan yang ditulis eksplisit.
 */

/** Tingkat kesulitan. `mixed` hanya ada di sisi klien (pemilihan acak). */
export type Kesulitan = 'easy' | 'medium' | 'hard';

export interface SoalCerita {
  /** Kode stabil — dipakai pesan galat dan (kalau nanti perlu) analitik. */
  kode: string;
  /** Tema pabrik, tampil sebagai label kecil di atas soal. */
  tag: string;
  diff: Kesulitan;
  /** Pertanyaan, bahasa Indonesia. */
  q: string;
  ans: number;
  unit: string;
  /** Pembahasan + cara cepat. Wajib: ini yang membuat mode latihan berguna. */
  exp: string;
}

export interface Kategori {
  id:
    | 'kraepelin'
    | 'kabataku'
    | 'deret'
    | 'satuan'
    | 'logika'
    | 'cerita'
    | 'gyakusan'
    | 'sansu'
    | 'suiri'
    | 'baai';
  /** Nama Jepang, tampil sebagai aksen di kartu modul. */
  jp: string;
  /** Jumlah soal satu ronde ujian. */
  soal: number;
  /** Batas waktu ronde ujian, detik. */
  detik: number;
}

/**
 * Enam modul. `soal`/`detik` per modul SENGAJA berbeda: 20 soal kraepelin dalam
 * 90 detik adalah tes kecepatan yang benar, sementara 15 soal cerita butuh
 * membaca — 2 menit di sana hanya mengukur keberanian menebak.
 */
export const KATEGORI: Kategori[] = [
  { id: 'kraepelin', jp: '計算テスト', soal: 20, detik: 90 },
  { id: 'kabataku', jp: '基礎数学', soal: 20, detik: 240 },
  { id: 'deret', jp: '数列・適性', soal: 20, detik: 300 },
  { id: 'satuan', jp: '単位換算', soal: 20, detik: 240 },
  { id: 'logika', jp: '判断推理', soal: 15, detik: 300 },
  { id: 'cerita', jp: '現場応用算数', soal: 15, detik: 420 },
  /* Empat modul bergaya SPI 非言語 — inti tes seleksi Jepang yang sesungguhnya,
     dan yang paling sering dikeluhkan pemilik 2026-10-27 ("soal psikotesnya ga
     kayak ujian"). Semua generator, jadi jumlah soalnya tak terbatas. */
  { id: 'gyakusan', jp: '四則逆算', soal: 20, detik: 180 },
  { id: 'sansu', jp: '数的推理', soal: 15, detik: 420 },
  { id: 'suiri', jp: '判断推理', soal: 15, detik: 420 },
  { id: 'baai', jp: '場合の数・確率', soal: 15, detik: 360 },
];

/**
 * Ambang lulus. Sama dengan versi HTML aslinya (90 / 75 / 60) dan sengaja tidak
 * diubah: angka itu yang dipakai pemilik saat menguji ke kandidat.
 */
export const AMBANG = { s: 90, a: 75, b: 60 } as const;

/**
 * Bank soal cerita — 69 soal, 9 tema. Urutannya per tema supaya soal baru mudah
 * ditempatkan; pemilihan acak terjadi di klien.
 */
export const BANK_CERITA: SoalCerita[] = [
  // ── Target produksi ───────────────────────────────────────────────────────
  {
    kode: 'C001',
    tag: 'TARGET PRODUKSI',
    diff: 'easy',
    q: 'Seorang kenshusei memasang 12 baut dalam 1 menit. Berapa baut yang terpasang dalam 15 menit?',
    ans: 180,
    unit: 'baut',
    exp: '12 baut × 15 menit = 180 baut.',
  },
  {
    kode: 'C002',
    tag: 'TARGET PRODUKSI',
    diff: 'easy',
    q: 'Satu lini menghasilkan 25 pcs per jam. Berapa pcs dihasilkan dalam 8 jam?',
    ans: 200,
    unit: 'pcs',
    exp: '25 pcs × 8 jam = 200 pcs.',
  },
  {
    kode: 'C003',
    tag: 'TARGET PRODUKSI',
    diff: 'easy',
    q: 'Target satu shift adalah 1.200 pcs dalam 8 jam. Berapa pcs per jam yang harus dicapai?',
    ans: 150,
    unit: 'pcs/jam',
    exp: '1.200 ÷ 8 = 150 pcs per jam.',
  },
  {
    kode: 'C004',
    tag: 'TARGET PRODUKSI',
    diff: 'medium',
    q: 'Satu komponen selesai dalam 9 detik. Berapa komponen selesai dalam 45 menit?',
    ans: 300,
    unit: 'komponen',
    exp: '45 menit = 2.700 detik. 2.700 ÷ 9 = 300 komponen.',
  },
  {
    kode: 'C005',
    tag: 'TARGET PRODUKSI',
    diff: 'medium',
    q: 'Dalam 5 jam sebuah mesin menyelesaikan 375 pcs. Berapa pcs per jam kecepatannya?',
    ans: 75,
    unit: 'pcs/jam',
    exp: '375 ÷ 5 = 75 pcs per jam.',
  },
  {
    kode: 'C006',
    tag: 'TARGET PRODUKSI',
    diff: 'medium',
    q: 'Tiga mesin bekerja bersamaan, masing-masing 45 pcs per menit. Berapa pcs dihasilkan dalam 20 menit?',
    ans: 2700,
    unit: 'pcs',
    exp: '3 × 45 = 135 pcs/menit. 135 × 20 = 2.700 pcs.',
  },
  {
    kode: 'C007',
    tag: 'TARGET PRODUKSI',
    diff: 'medium',
    q: 'Lini A menghasilkan 120 pcs/jam dan lini B 90 pcs/jam. Keduanya berjalan 7 jam. Berapa total pcs?',
    ans: 1470,
    unit: 'pcs',
    exp: '(120 + 90) × 7 = 210 × 7 = 1.470 pcs.',
  },
  {
    kode: 'C008',
    tag: 'TARGET PRODUKSI',
    diff: 'hard',
    q: 'Dalam shift 8 jam ditargetkan 960 pcs. Tiga jam pertama selesai 330 pcs. Berapa pcs/jam yang harus dicapai pada 5 jam sisanya?',
    ans: 126,
    unit: 'pcs/jam',
    exp: 'Sisa target = 960 − 330 = 630 pcs. 630 ÷ 5 jam = 126 pcs/jam.',
  },
  {
    kode: 'C009',
    tag: 'TARGET PRODUKSI',
    diff: 'hard',
    q: 'Target harian 4.800 pcs dibagi rata ke 2 shift, masing-masing 6 jam. Berapa pcs per jam tiap shift?',
    ans: 400,
    unit: 'pcs/jam',
    exp: '4.800 ÷ 2 shift = 2.400 pcs/shift. 2.400 ÷ 6 jam = 400 pcs/jam.',
  },
  {
    kode: 'C010',
    tag: 'TARGET PRODUKSI',
    diff: 'hard',
    q: 'Mesin A 80 pcs/menit dan mesin B 65 pcs/menit berjalan bersamaan selama 4 jam. Berapa total pcs?',
    ans: 34800,
    unit: 'pcs',
    exp: '4 jam = 240 menit. (80 + 65) × 240 = 145 × 240 = 34.800 pcs.',
  },

  // ── Packing & kardus ──────────────────────────────────────────────────────
  {
    kode: 'C011',
    tag: 'PACKING KARDUS',
    diff: 'easy',
    q: 'Satu kardus master berisi 24 kotak bento. Untuk 240 kotak dibutuhkan berapa kardus?',
    ans: 10,
    unit: 'kardus',
    exp: '240 ÷ 24 = 10 kardus.',
  },
  {
    kode: 'C012',
    tag: 'PACKING KARDUS',
    diff: 'easy',
    q: 'Satu kardus memuat 36 botol. Berapa kardus untuk 900 botol?',
    ans: 25,
    unit: 'kardus',
    exp: '900 ÷ 36 = 25 kardus.',
  },
  {
    kode: 'C013',
    tag: 'PACKING KARDUS',
    diff: 'easy',
    q: 'Berat satu kardus 12 kg. Berapa kardus untuk total 480 kg?',
    ans: 40,
    unit: 'kardus',
    exp: '480 ÷ 12 = 40 kardus.',
  },
  {
    kode: 'C014',
    tag: 'PACKING KARDUS',
    diff: 'medium',
    q: 'Satu pack berisi 15 pcs dan satu kardus memuat 8 pack. Berapa kardus untuk 1.440 pcs?',
    ans: 12,
    unit: 'kardus',
    exp: 'Satu kardus = 15 × 8 = 120 pcs. 1.440 ÷ 120 = 12 kardus.',
  },
  {
    kode: 'C015',
    tag: 'PACKING KARDUS',
    diff: 'medium',
    q: 'Batas berat satu kardus 20 kg, berat satu pcs 250 gram. Berapa pcs maksimal per kardus?',
    ans: 80,
    unit: 'pcs',
    exp: '20 kg = 20.000 gram. 20.000 ÷ 250 = 80 pcs.',
  },
  {
    kode: 'C016',
    tag: 'PACKING KARDUS',
    diff: 'hard',
    q: 'Ada 1.860 pcs dan setiap kardus memuat 24 pcs. Berapa pcs yang tersisa setelah semua kardus penuh diisi?',
    ans: 12,
    unit: 'pcs',
    exp: '1.860 ÷ 24 = 77 kardus penuh (1.848 pcs), sisa 1.860 − 1.848 = 12 pcs.',
  },
  {
    kode: 'C017',
    tag: 'PACKING KARDUS',
    diff: 'medium',
    q: 'Satu kontainer memuat 1.200 kardus. Setiap minggu dikirim 3 kontainer selama 4 minggu. Berapa kardus terkirim?',
    ans: 14400,
    unit: 'kardus',
    exp: '3 × 4 = 12 kontainer. 12 × 1.200 = 14.400 kardus.',
  },

  // ── Lembur (zangyou) ──────────────────────────────────────────────────────
  {
    kode: 'C018',
    tag: 'LEMBUR / ZANGYOU',
    diff: 'easy',
    q: 'Upah lembur 1.000 Yen per jam. Berapa total upah lembur untuk 8 jam?',
    ans: 8000,
    unit: 'Yen',
    exp: '1.000 × 8 = 8.000 Yen.',
  },
  {
    kode: 'C019',
    tag: 'LEMBUR / ZANGYOU',
    diff: 'easy',
    q: 'Upah lembur 1.250 Yen per jam selama 12 jam. Berapa totalnya?',
    ans: 15000,
    unit: 'Yen',
    exp: '1.250 × 12 = 15.000 Yen.',
  },
  {
    kode: 'C020',
    tag: 'LEMBUR / ZANGYOU',
    diff: 'medium',
    q: 'Upah normal 1.100 Yen/jam, lembur dibayar 25% lebih tinggi. Berapa upah untuk 6 jam lembur?',
    ans: 8250,
    unit: 'Yen',
    exp: '1.100 × 1,25 = 1.375 Yen/jam. 1.375 × 6 = 8.250 Yen.',
  },
  {
    kode: 'C021',
    tag: 'LEMBUR / ZANGYOU',
    diff: 'medium',
    q: 'Seorang pekerja lembur 30 jam dalam sebulan dengan upah lembur 1.400 Yen/jam. Berapa total upah lemburnya?',
    ans: 42000,
    unit: 'Yen',
    exp: '1.400 × 30 = 42.000 Yen.',
  },
  {
    kode: 'C022',
    tag: 'LEMBUR / ZANGYOU',
    diff: 'medium',
    q: 'Gaji pokok 180.000 Yen ditambah lembur 22 jam × 1.500 Yen. Berapa total pendapatan?',
    ans: 213000,
    unit: 'Yen',
    exp: 'Lembur = 22 × 1.500 = 33.000 Yen. Total = 180.000 + 33.000 = 213.000 Yen.',
  },
  {
    kode: 'C023',
    tag: 'LEMBUR / ZANGYOU',
    diff: 'hard',
    q: 'Lembur 45 menit setiap hari selama 20 hari, upah lembur 1.200 Yen/jam. Berapa total upah lembur?',
    ans: 18000,
    unit: 'Yen',
    exp: '45 × 20 = 900 menit = 15 jam. 15 × 1.200 = 18.000 Yen.',
  },
  {
    kode: 'C024',
    tag: 'LEMBUR / ZANGYOU',
    diff: 'hard',
    q: 'Lembur 2 jam per hari selama 22 hari kerja, upah lembur 1.500 Yen/jam. Berapa totalnya?',
    ans: 66000,
    unit: 'Yen',
    exp: '2 × 22 = 44 jam. 44 × 1.500 = 66.000 Yen.',
  },

  // ── Waktu & efisiensi ─────────────────────────────────────────────────────
  {
    kode: 'C025',
    tag: 'EFISIENSI WAKTU',
    diff: 'medium',
    q: 'Satu siklus perakitan butuh 45 detik. Berapa part selesai dalam 30 menit?',
    ans: 40,
    unit: 'part',
    exp: '30 menit = 1.800 detik. 1.800 ÷ 45 = 40 part.',
  },
  {
    kode: 'C026',
    tag: 'KONVERSI WAKTU',
    diff: 'medium',
    q: 'Kerja dimulai 08:30 dan selesai 17:15, dengan istirahat total 75 menit. Berapa jam kerja bersihnya?',
    ans: 7.5,
    unit: 'jam',
    exp: 'Rentang = 8 jam 45 menit = 525 menit. 525 − 75 = 450 menit. 450 ÷ 60 = 7,5 jam.',
  },
  {
    kode: 'C027',
    tag: 'KONVERSI WAKTU',
    diff: 'easy',
    q: 'Bekerja dari pukul 09:00 sampai 16:30 dengan istirahat 60 menit. Berapa jam kerja bersihnya?',
    ans: 6.5,
    unit: 'jam',
    exp: '09:00–16:30 = 7,5 jam = 450 menit. 450 − 60 = 390 menit = 6,5 jam.',
  },
  {
    kode: 'C028',
    tag: 'EFISIENSI WAKTU',
    diff: 'medium',
    q: 'Satu pcs selesai dalam 20 detik. Berapa MENIT waktu untuk 600 pcs?',
    ans: 200,
    unit: 'menit',
    exp: '20 × 600 = 12.000 detik. 12.000 ÷ 60 = 200 menit.',
  },
  {
    kode: 'C029',
    tag: 'KONVERSI WAKTU',
    diff: 'easy',
    q: 'Shift 8 jam dengan istirahat 15 menit pagi dan 45 menit siang. Berapa jam kerja bersihnya?',
    ans: 7,
    unit: 'jam',
    exp: 'Istirahat total 60 menit = 1 jam. 8 − 1 = 7 jam.',
  },
  {
    kode: 'C030',
    tag: 'EFISIENSI WAKTU',
    diff: 'medium',
    q: 'Waktu siklus turun dari 50 detik menjadi 40 detik. Berapa persen penghematan waktunya?',
    ans: 20,
    unit: '%',
    exp: 'Penghematan = 50 − 40 = 10 detik. (10 ÷ 50) × 100% = 20%.',
  },
  {
    kode: 'C031',
    tag: 'KONVERSI WAKTU',
    diff: 'easy',
    q: 'Berapa jam dalam 480 menit?',
    ans: 8,
    unit: 'jam',
    exp: '480 ÷ 60 = 8 jam.',
  },
  {
    kode: 'C032',
    tag: 'KONVERSI WAKTU',
    diff: 'hard',
    q: 'Masuk pukul 07:45 dan berada di pabrik selama 10 jam 15 menit. Berapa MENIT total waktu di pabrik?',
    ans: 615,
    unit: 'menit',
    exp: '10 jam = 600 menit. 600 + 15 = 615 menit.',
  },
  {
    kode: 'C033',
    tag: 'EFISIENSI WAKTU',
    diff: 'hard',
    q: 'Tiga shift masing-masing 7,5 jam berjalan setiap hari selama 5 hari. Berapa total jam operasi?',
    ans: 112.5,
    unit: 'jam',
    exp: '3 × 7,5 = 22,5 jam/hari. 22,5 × 5 = 112,5 jam.',
  },

  // ── Cacat produk / QC ─────────────────────────────────────────────────────
  {
    kode: 'C034',
    tag: 'CACAT PRODUK (QC)',
    diff: 'medium',
    q: 'Dari 500 barang cetakan ditemukan 15 barang cacat. Berapa persen barang yang LOLOS QC?',
    ans: 97,
    unit: '%',
    exp: 'Baik = 500 − 15 = 485. (485 ÷ 500) × 100% = 97%.',
  },
  {
    kode: 'C035',
    tag: 'CACAT PRODUK (QC)',
    diff: 'easy',
    q: 'Dari 800 pcs ditemukan 24 pcs cacat. Berapa persen tingkat cacatnya?',
    ans: 3,
    unit: '%',
    exp: '(24 ÷ 800) × 100% = 3%.',
  },
  {
    kode: 'C036',
    tag: 'CACAT PRODUK (QC)',
    diff: 'medium',
    q: 'Tingkat cacat 2,5% dari 2.000 pcs. Berapa pcs yang cacat?',
    ans: 50,
    unit: 'pcs',
    exp: '2.000 × 2,5% = 2.000 × 0,025 = 50 pcs.',
  },
  {
    kode: 'C037',
    tag: 'CACAT PRODUK (QC)',
    diff: 'easy',
    q: 'Dari 250 pcs, 10 pcs cacat. Berapa persen yang lolos?',
    ans: 96,
    unit: '%',
    exp: 'Baik = 240. (240 ÷ 250) × 100% = 96%.',
  },
  {
    kode: 'C038',
    tag: 'CACAT PRODUK (QC)',
    diff: 'hard',
    q: 'Tingkat cacat turun dari 4% menjadi 3%. Berapa persen PENURUNAN relatifnya?',
    ans: 25,
    unit: '%',
    exp: 'Selisih 4 − 3 = 1 poin. Penurunan relatif = (1 ÷ 4) × 100% = 25%.',
  },
  {
    kode: 'C039',
    tag: 'CACAT PRODUK (QC)',
    diff: 'medium',
    q: 'Dari 1.500 pcs ditemukan 45 pcs cacat. Berapa pcs yang BAIK?',
    ans: 1455,
    unit: 'pcs',
    exp: '1.500 − 45 = 1.455 pcs.',
  },
  {
    kode: 'C040',
    tag: 'CACAT PRODUK (QC)',
    diff: 'medium',
    q: 'Standar cacat maksimal 1% dari 4.000 pcs. Berapa pcs cacat maksimal yang diizinkan?',
    ans: 40,
    unit: 'pcs',
    exp: '4.000 × 1% = 40 pcs.',
  },

  // ── Material & pemotongan ─────────────────────────────────────────────────
  {
    kode: 'C041',
    tag: 'PENGHEMATAN MATERIAL',
    diff: 'hard',
    q: 'Satu batang besi 6 meter (600 cm) dipotong 45 cm. Berapa potongan PENUH yang didapat?',
    ans: 13,
    unit: 'potong',
    exp: '600 ÷ 45 = 13,33. Potongan penuh 13 (memakai 585 cm), sisa 15 cm.',
  },
  {
    kode: 'C042',
    tag: 'PENGHEMATAN MATERIAL',
    diff: 'easy',
    q: 'Pipa 4 meter dipotong menjadi 25 cm. Berapa potong yang didapat?',
    ans: 16,
    unit: 'potong',
    exp: '4 m = 400 cm. 400 ÷ 25 = 16 potong.',
  },
  {
    kode: 'C043',
    tag: 'PENGHEMATAN MATERIAL',
    diff: 'easy',
    q: 'Kabel 900 cm dipotong 60 cm per bagian. Berapa potong yang didapat?',
    ans: 15,
    unit: 'potong',
    exp: '900 ÷ 60 = 15 potong.',
  },
  {
    kode: 'C044',
    tag: 'PENGHEMATAN MATERIAL',
    diff: 'easy',
    q: 'Kain 12 meter dipakai 1,5 meter per seragam. Berapa seragam yang bisa dibuat?',
    ans: 8,
    unit: 'seragam',
    exp: '12 ÷ 1,5 = 8 seragam.',
  },
  {
    kode: 'C045',
    tag: 'PENGHEMATAN MATERIAL',
    diff: 'medium',
    q: 'Kawat 250 cm dipotong 30 cm. Berapa potongan penuh dan berapa cm sisanya? (jawab SISANYA dalam cm)',
    ans: 10,
    unit: 'cm',
    exp: '250 ÷ 30 = 8 potong (240 cm). Sisa = 250 − 240 = 10 cm.',
  },
  {
    kode: 'C046',
    tag: 'PENGHEMATAN MATERIAL',
    diff: 'hard',
    q: 'Plat 3 meter dipotong 40 cm per bagian. Berapa cm SISA yang tidak terpakai?',
    ans: 20,
    unit: 'cm',
    exp: '300 ÷ 40 = 7 potong (280 cm). Sisa = 300 − 280 = 20 cm.',
  },
  {
    kode: 'C047',
    tag: 'PENGHEMATAN MATERIAL',
    diff: 'medium',
    q: 'Satu batang 6 meter dibagi menjadi 8 potongan sama panjang. Berapa cm panjang tiap potongan?',
    ans: 75,
    unit: 'cm',
    exp: '6 m = 600 cm. 600 ÷ 8 = 75 cm.',
  },
  {
    kode: 'C048',
    tag: 'PENGHEMATAN MATERIAL',
    diff: 'medium',
    q: 'Dari 2.000 kg bahan, 5% terbuang sebagai waste. Berapa kg bahan yang terpakai?',
    ans: 1900,
    unit: 'kg',
    exp: 'Waste = 2.000 × 5% = 100 kg. Terpakai = 2.000 − 100 = 1.900 kg.',
  },
  {
    kode: 'C049',
    tag: 'PENGHEMATAN MATERIAL',
    diff: 'hard',
    q: 'Lima batang besi masing-masing 4,8 meter dipakai 1,6 meter per produk. Berapa produk yang bisa dibuat?',
    ans: 15,
    unit: 'produk',
    exp: 'Total = 5 × 4,8 = 24 meter. 24 ÷ 1,6 = 15 produk.',
  },

  // ── Stok gudang ───────────────────────────────────────────────────────────
  {
    kode: 'C050',
    tag: 'STOK GUDANG',
    diff: 'easy',
    q: 'Stok awal 450 pcs, masuk 300 pcs, keluar 520 pcs. Berapa stok akhirnya?',
    ans: 230,
    unit: 'pcs',
    exp: '450 + 300 − 520 = 230 pcs.',
  },
  {
    kode: 'C051',
    tag: 'STOK GUDANG',
    diff: 'medium',
    q: 'Stok 1.200 pcs dengan pemakaian 80 pcs per hari. Berapa hari stok itu bertahan?',
    ans: 15,
    unit: 'hari',
    exp: '1.200 ÷ 80 = 15 hari.',
  },
  {
    kode: 'C052',
    tag: 'STOK GUDANG',
    diff: 'easy',
    q: 'Stok 600 pcs, pemakaian 45 pcs per hari selama 10 hari. Berapa sisanya?',
    ans: 150,
    unit: 'pcs',
    exp: 'Pemakaian = 45 × 10 = 450. Sisa = 600 − 450 = 150 pcs.',
  },
  {
    kode: 'C053',
    tag: 'STOK GUDANG',
    diff: 'medium',
    q: 'Kebutuhan 120 pcs per hari dan pengiriman butuh 4 hari. Berapa pcs stok minimal yang harus ada?',
    ans: 480,
    unit: 'pcs',
    exp: '120 × 4 = 480 pcs.',
  },
  {
    kode: 'C054',
    tag: 'STOK GUDANG',
    diff: 'medium',
    q: 'Gudang memiliki 3 rak, tiap rak 8 kotak, tiap kotak 24 pcs. Berapa total pcs?',
    ans: 576,
    unit: 'pcs',
    exp: '3 × 8 = 24 kotak. 24 × 24 = 576 pcs.',
  },
  {
    kode: 'C055',
    tag: 'STOK GUDANG',
    diff: 'medium',
    q: 'Stok 2.400 pcs dikirim dengan 5 truk, masing-masing 380 pcs. Berapa sisa stok?',
    ans: 500,
    unit: 'pcs',
    exp: '5 × 380 = 1.900. 2.400 − 1.900 = 500 pcs.',
  },

  // ── Perbandingan & rasio ──────────────────────────────────────────────────
  {
    kode: 'C056',
    tag: 'PERBANDINGAN',
    diff: 'medium',
    q: 'Perbandingan pekerja pria dan wanita 3 : 2 dengan total 45 orang. Berapa jumlah pekerja wanita?',
    ans: 18,
    unit: 'orang',
    exp: 'Total bagian = 3 + 2 = 5. Satu bagian = 45 ÷ 5 = 9. Wanita = 2 × 9 = 18 orang.',
  },
  {
    kode: 'C057',
    tag: 'PERBANDINGAN',
    diff: 'medium',
    q: 'Dua pekerja menyelesaikan satu order dalam 6 jam. Jika dikerjakan 3 pekerja dengan kecepatan sama, berapa jam?',
    ans: 4,
    unit: 'jam',
    exp: 'Total kerja = 2 × 6 = 12 jam-orang. 12 ÷ 3 = 4 jam.',
  },
  {
    kode: 'C058',
    tag: 'PERBANDINGAN',
    diff: 'medium',
    q: 'Campuran semen dan pasir 3 : 5. Jika pasir 250 kg, berapa kg semen yang dibutuhkan?',
    ans: 150,
    unit: 'kg',
    exp: 'Semen = 250 × 3 ÷ 5 = 150 kg.',
  },
  {
    kode: 'C059',
    tag: 'PERBANDINGAN',
    diff: 'hard',
    q: 'Lima mesin menyelesaikan order dalam 8 jam. Berapa jam jika dipakai 8 mesin dengan kecepatan sama?',
    ans: 5,
    unit: 'jam',
    exp: 'Total = 5 × 8 = 40 jam-mesin. 40 ÷ 8 = 5 jam.',
  },
  {
    kode: 'C060',
    tag: 'PERBANDINGAN',
    diff: 'medium',
    q: 'Produksi lini A dan B berbanding 4 : 7 dengan total 660 pcs. Berapa pcs lini B?',
    ans: 420,
    unit: 'pcs',
    exp: 'Total bagian 11. Satu bagian = 660 ÷ 11 = 60. B = 7 × 60 = 420 pcs.',
  },
  {
    kode: 'C061',
    tag: 'PERBANDINGAN',
    diff: 'medium',
    q: 'Perjalanan 3 jam dengan kecepatan 60 km/jam. Jika ingin sampai dalam 2 jam, berapa kecepatan yang dibutuhkan?',
    ans: 90,
    unit: 'km/jam',
    exp: 'Jarak = 60 × 3 = 180 km. 180 ÷ 2 = 90 km/jam.',
  },

  // ── Upah & harga ──────────────────────────────────────────────────────────
  {
    kode: 'C062',
    tag: 'UPAH & HARGA',
    diff: 'easy',
    q: 'Upah 1.200 Yen per jam, bekerja 8 jam per hari selama 5 hari. Berapa total upahnya?',
    ans: 48000,
    unit: 'Yen',
    exp: '1.200 × 8 = 9.600 per hari. 9.600 × 5 = 48.000 Yen.',
  },
  {
    kode: 'C063',
    tag: 'UPAH & HARGA',
    diff: 'medium',
    q: 'Harga barang 2.400 Yen mendapat diskon 25%. Berapa harga yang harus dibayar?',
    ans: 1800,
    unit: 'Yen',
    exp: 'Diskon = 2.400 × 25% = 600. Bayar = 2.400 − 600 = 1.800 Yen.',
  },
  {
    kode: 'C064',
    tag: 'UPAH & HARGA',
    diff: 'easy',
    q: 'Membeli 3 barang masing-masing 850 Yen dan membayar dengan 5.000 Yen. Berapa kembaliannya?',
    ans: 2450,
    unit: 'Yen',
    exp: '3 × 850 = 2.550. 5.000 − 2.550 = 2.450 Yen.',
  },
  {
    kode: 'C065',
    tag: 'UPAH & HARGA',
    diff: 'medium',
    q: 'Upah harian 9.500 Yen selama 22 hari kerja. Berapa total upahnya?',
    ans: 209000,
    unit: 'Yen',
    exp: '9.500 × 22 = 209.000 Yen.',
  },
  {
    kode: 'C066',
    tag: 'UPAH & HARGA',
    diff: 'easy',
    q: 'Potongan iuran 15% dari upah 40.000 Yen. Berapa besar potongannya?',
    ans: 6000,
    unit: 'Yen',
    exp: '40.000 × 15% = 6.000 Yen.',
  },

  // ── Keselamatan & lingkungan kerja ────────────────────────────────────────
  {
    kode: 'C067',
    tag: 'MESIN & SUHU',
    diff: 'easy',
    q: 'Suhu mesin 28°C dan naik 4°C setiap jam operasi. Berapa suhu setelah 6 jam?',
    ans: 52,
    unit: '°C',
    exp: 'Kenaikan = 4 × 6 = 24°C. 28 + 24 = 52°C.',
  },
  {
    kode: 'C068',
    tag: 'KESELAMATAN KERJA',
    diff: 'easy',
    q: 'Tangga memiliki 12 anak tangga, masing-masing tingginya 18 cm. Berapa cm tinggi totalnya?',
    ans: 216,
    unit: 'cm',
    exp: '12 × 18 = 216 cm.',
  },
  {
    kode: 'C069',
    tag: 'KESELAMATAN KERJA',
    diff: 'medium',
    q: 'Setiap 20 pekerja wajib ada 1 kotak P3K. Untuk 260 pekerja, berapa kotak P3K yang dibutuhkan?',
    ans: 13,
    unit: 'kotak',
    exp: '260 ÷ 20 = 13 kotak.',
  },
];

/**
 * Bentuk yang dikirim ke klien. Sengaja TIDAK membawa `ambang` (itu keputusan
 * tampilan) dan tidak membawa versi internal apa pun.
 */
export function ringkasBank() {
  return {
    jumlah: BANK_CERITA.length,
    kategori: KATEGORI,
    cerita: BANK_CERITA,
  };
}
