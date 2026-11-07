/**
 * iq-bank.ts — bank soal Asesmen Penalaran (`/tes-iq`) + pemilih soal per siswa.
 *
 * KENAPA HIDUP DI SISI FUNGSI, BUKAN DI `src/`
 * --------------------------------------------
 * Berkas ini memuat KUNCI JAWABAN (`kunci`). Kalau ia diimpor dari kode klien,
 * Vite memasukkannya ke bundel dan kuncinya terbaca siapa pun lewat DevTools —
 * tesnya lalu mengukur kemampuan membuka tab Network, bukan penalaran. Klien
 * hanya menerima `SoalKlienIq` (tanpa `kunci`) lewat action `getSoalIq`.
 *
 * KENAPA URUTANNYA DITENTUKAN NOMOR WA, BUKAN `Math.random()`
 * ----------------------------------------------------------
 * Dua hal harus benar sekaligus:
 *   1. siswa yang duduk bersebelahan tidak boleh dapat paket yang sama;
 *   2. siswa yang me-refresh di tengah ujian harus melihat soal yang SAMA —
 *      kalau tidak, jawaban yang sudah diisi menunjuk nomor soal yang berbeda.
 * Karena itu pengacakannya deterministik dari nomor WA (seed), bukan acak
 * bebas. Server memakai fungsi yang sama saat menilai, jadi soal yang dinilai
 * selalu soal yang memang dikirim ke siswa itu.
 *
 * KENAPA KOMPOSISINYA TETAP
 * -------------------------
 * 12 verbal · 12 numerik · 8 spasial · 8 logika. Kalau jumlahnya diacak bebas,
 * satu siswa bisa kebagian 12 soal mudah dan siswa lain 12 soal sulit; skornya
 * lalu tidak bisa dibandingkan sama sekali.
 */

export type KategoriIq = 'verbal' | 'numerik' | 'spasial' | 'logika';

export interface SoalIq {
  id: string;
  kategori: KategoriIq;
  tanya: string;
  /** Gambar inline untuk soal spasial. Dirender dengan `dangerouslySetInnerHTML`. */
  svg?: string;
  pilihan: [string, string, string, string];
  /** RAHASIA SERVER — tidak pernah ikut ke klien. */
  kunci: 0 | 1 | 2 | 3;
}

/** Bentuk yang boleh dilihat browser siswa. */
export type SoalKlienIq = Omit<SoalIq, 'kunci'>;

export const KUOTA_IQ: Record<KategoriIq, number> = {
  verbal: 12,
  numerik: 12,
  spasial: 8,
  logika: 8,
};

export const DURASI_IQ_MENIT = 25;

/** Versi bank. Dinaikkan bila soal berubah, supaya hasil lama tetap terbaca. */
export const VERSI_BANK_IQ = 'asj-penalaran-v1';

export const BANK_IQ: SoalIq[] = [
  /* ── VERBAL (24) ─────────────────────────────────────────────────────── */
  { id: 'v-001', kategori: 'verbal', tanya: 'MESIN : BENSIN = MANUSIA : ...', pilihan: ['Oksigen', 'Makanan', 'Pakaian', 'Istirahat'], kunci: 1 },
  { id: 'v-002', kategori: 'verbal', tanya: 'PRESISI : AKURAT = KONSISTEN : ...', pilihan: ['Berubah', 'Tetap', 'Cepat', 'Rapi'], kunci: 1 },
  { id: 'v-003', kategori: 'verbal', tanya: 'HELM : KEPALA = SARUNG TANGAN : ...', pilihan: ['Siku', 'Bahu', 'Tangan', 'Kaki'], kunci: 2 },
  { id: 'v-004', kategori: 'verbal', tanya: 'CETAKAN : PLASTIK = LOYANG : ...', pilihan: ['Roti', 'Tepung', 'Oven', 'Koki'], kunci: 0 },
  { id: 'v-005', kategori: 'verbal', tanya: 'INSPEKSI : CACAT = AUDIT : ...', pilihan: ['Keuntungan', 'Pajak', 'Karyawan', 'Penyimpangan'], kunci: 3 },
  { id: 'v-006', kategori: 'verbal', tanya: 'AUS : GESEKAN = KARAT : ...', pilihan: ['Panas', 'Tekanan', 'Oksidasi', 'Getaran'], kunci: 2 },
  { id: 'v-007', kategori: 'verbal', tanya: 'MANDOR : PEKERJA = NAKHODA : ...', pilihan: ['Awak Kapal', 'Penumpang', 'Pelabuhan', 'Kemudi'], kunci: 0 },
  { id: 'v-008', kategori: 'verbal', tanya: 'BAHAN BAKU : PRODUK JADI = TEPUNG : ...', pilihan: ['Gandum', 'Kue', 'Air', 'Gula'], kunci: 1 },
  { id: 'v-009', kategori: 'verbal', tanya: 'GERGAJI : KAYU = GUNTING : ...', pilihan: ['Batu', 'Besi', 'Meja', 'Kain'], kunci: 3 },
  { id: 'v-010', kategori: 'verbal', tanya: 'STERIL : BAKTERI = KEDAP : ...', pilihan: ['Cahaya', 'Ruangan', 'Udara', 'Dinding'], kunci: 2 },
  { id: 'v-011', kategori: 'verbal', tanya: 'Lawan kata (antonim) paling tepat dari "DARURAT" adalah ...', pilihan: ['Normal', 'Genting', 'Segera', 'Penting'], kunci: 0 },
  { id: 'v-012', kategori: 'verbal', tanya: 'Lawan kata (antonim) paling tepat dari "EFISIEN" adalah ...', pilihan: ['Hemat', 'Tepat', 'Boros', 'Cermat'], kunci: 2 },
  { id: 'v-013', kategori: 'verbal', tanya: 'Persamaan kata (sinonim) paling tepat untuk "KALIBRASI" adalah ...', pilihan: ['Pembersihan', 'Peneraan / penyesuaian', 'Pembongkaran', 'Pengemasan'], kunci: 1 },
  { id: 'v-014', kategori: 'verbal', tanya: 'Manakah yang TIDAK termasuk kelompok alat ukur?', pilihan: ['Jangka sorong', 'Mikrometer', 'Penggaris baja', 'Obeng plus'], kunci: 3 },
  { id: 'v-015', kategori: 'verbal', tanya: 'Manakah yang TIDAK termasuk logam penghantar listrik?', pilihan: ['Besi', 'Tembaga', 'Aluminium', 'Kaca'], kunci: 3 },
  { id: 'v-016', kategori: 'verbal', tanya: 'KOMPONEN : RAKIT = HURUF : ...', pilihan: ['Kata', 'Suara', 'Pensil', 'Kertas'], kunci: 0 },
  { id: 'v-017', kategori: 'verbal', tanya: 'REM : KECEPATAN = TERMOSTAT : ...', pilihan: ['Listrik', 'Suhu', 'Jarak', 'Waktu'], kunci: 1 },
  { id: 'v-018', kategori: 'verbal', tanya: 'GUDANG : PENYIMPANAN = LABORATORIUM : ...', pilihan: ['Penjualan', 'Pengiriman', 'Pengujian', 'Pembelian'], kunci: 2 },
  { id: 'v-019', kategori: 'verbal', tanya: 'PELUMAS : AUS = VAKSIN : ...', pilihan: ['Infeksi', 'Rumah sakit', 'Dokter', 'Obat'], kunci: 0 },
  { id: 'v-020', kategori: 'verbal', tanya: 'CETAK BIRU : BANGUNAN = RESEP : ...', pilihan: ['Piring', 'Dapur', 'Bahan', 'Masakan'], kunci: 3 },
  { id: 'v-021', kategori: 'verbal', tanya: 'Manakah yang TIDAK termasuk aktivitas kerja?', pilihan: ['Merakit', 'Memotong', 'Mengelas', 'Gudang'], kunci: 3 },
  { id: 'v-022', kategori: 'verbal', tanya: 'MUDAH PECAH : KACA = ELASTIS : ...', pilihan: ['Kayu', 'Karet', 'Batu', 'Keramik'], kunci: 1 },
  { id: 'v-023', kategori: 'verbal', tanya: 'SENSOR : DETEKSI = FILTER : ...', pilihan: ['Pendinginan', 'Pemanasan', 'Penyaringan', 'Pemotongan'], kunci: 2 },
  { id: 'v-024', kategori: 'verbal', tanya: 'CACAT PRODUK : TOLAK = SESUAI STANDAR : ...', pilihan: ['Terima', 'Buang', 'Bongkar', 'Tunda'], kunci: 0 },

  /* ── NUMERIK (24) ────────────────────────────────────────────────────── */
  { id: 'n-001', kategori: 'numerik', tanya: 'Lanjutkan deret: 3, 7, 15, 31, 63, ...', pilihan: ['95', '125', '127', '129'], kunci: 2 },
  { id: 'n-002', kategori: 'numerik', tanya: 'Satu mesin membuat 15 komponen dalam 5 menit. Berapa komponen yang dibuat 4 mesin serupa dalam 20 menit?', pilihan: ['120', '180', '240', '300'], kunci: 2 },
  { id: 'n-003', kategori: 'numerik', tanya: 'Lanjutkan deret: 2, 6, 12, 20, 30, ...', pilihan: ['40', '42', '44', '48'], kunci: 1 },
  { id: 'n-004', kategori: 'numerik', tanya: 'Lanjutkan deret: 100, 95, 85, 70, 50, ...', pilihan: ['25', '20', '30', '15'], kunci: 0 },
  { id: 'n-005', kategori: 'numerik', tanya: 'Dari 400 unit yang diperiksa, 2,5% dinyatakan cacat. Berapa unit yang LULUS standar?', pilihan: ['375', '380', '385', '390'], kunci: 3 },
  { id: 'n-006', kategori: 'numerik', tanya: 'Shift dimulai 08.15 dan berakhir 17.00, dengan istirahat total 45 menit. Berapa jam kerja efektifnya?', pilihan: ['7,5 jam', '8 jam', '8,5 jam', '9 jam'], kunci: 1 },
  { id: 'n-007', kategori: 'numerik', tanya: 'Lanjutkan deret: 4, 5, 8, 13, 20, 29, ...', pilihan: ['36', '38', '40', '42'], kunci: 2 },
  { id: 'n-008', kategori: 'numerik', tanya: 'Berat kotor satu kotak baut 12,5 kg. Berat kotak kosong 750 gram. Berapa berat bersih bautnya?', pilihan: ['11,75 kg', '11,25 kg', '11,50 kg', '12,25 kg'], kunci: 0 },
  { id: 'n-009', kategori: 'numerik', tanya: 'Lanjutkan deret: 2, 4, 3, 6, 5, 10, 9, ...', pilihan: ['8', '12', '16', '18'], kunci: 3 },
  { id: 'n-010', kategori: 'numerik', tanya: 'Rasio konsentrat : air = 1 : 4. Untuk 25 liter cairan siap pakai, berapa liter konsentrat murni?', pilihan: ['4 liter', '5 liter', '6,25 liter', '20 liter'], kunci: 1 },
  { id: 'n-011', kategori: 'numerik', tanya: 'Pipa 240 cm dipotong menjadi ukuran 30 cm. Satu kali potong butuh 15 detik. Berapa total waktu sampai selesai?', pilihan: ['90 detik', '105 detik', '120 detik', '135 detik'], kunci: 1 },
  { id: 'n-012', kategori: 'numerik', tanya: 'Lanjutkan deret: 81, 27, 9, 3, 1, ...', pilihan: ['0', '1/2', '1/3', '1/9'], kunci: 2 },
  { id: 'n-013', kategori: 'numerik', tanya: 'Target harian 1.200 kotak. Hingga siang sudah selesai 45%. Berapa kotak lagi untuk sesi sore?', pilihan: ['540 kotak', '600 kotak', '660 kotak', '720 kotak'], kunci: 2 },
  { id: 'n-014', kategori: 'numerik', tanya: 'Pekerja A merakit 12 unit/jam, B 18 unit/jam. Jika bekerja bersama, berapa jam untuk 90 unit?', pilihan: ['3 jam', '3,5 jam', '4 jam', '4,5 jam'], kunci: 0 },
  { id: 'n-015', kategori: 'numerik', tanya: 'Lanjutkan deret: 1, 2, 3, 5, 8, 13, 21, ...', pilihan: ['29', '31', '32', '34'], kunci: 3 },
  { id: 'n-016', kategori: 'numerik', tanya: 'Suhu ruang pendingin -4°C. Saat bongkar muat naik 7°C, lalu turun 5°C. Berapa suhunya sekarang?', pilihan: ['-4°C', '-2°C', '0°C', '2°C'], kunci: 1 },
  { id: 'n-017', kategori: 'numerik', tanya: 'Pelat baja tebal 3,5 mm. Jika 20 lembar ditumpuk rapat, berapa tinggi tumpukan dalam cm?', pilihan: ['7 cm', '7,5 cm', '35 cm', '70 cm'], kunci: 0 },
  { id: 'n-018', kategori: 'numerik', tanya: 'Lanjutkan deret: 10, 20, 13, 18, 16, 16, 19, ...', pilihan: ['12', '13', '14', '22'], kunci: 2 },
  { id: 'n-019', kategori: 'numerik', tanya: 'Konveyor bergerak 0,5 meter per detik. Berapa jarak yang ditempuh komponen selama 2 menit?', pilihan: ['30 meter', '60 meter', '100 meter', '120 meter'], kunci: 1 },
  { id: 'n-020', kategori: 'numerik', tanya: 'Harga suku cadang naik dari Rp80.000 menjadi Rp92.000. Berapa persen kenaikannya?', pilihan: ['10%', '12%', '15%', '20%'], kunci: 2 },
  { id: 'n-021', kategori: 'numerik', tanya: 'Lanjutkan deret: 1, 4, 9, 16, 25, 36, ...', pilihan: ['42', '45', '48', '49'], kunci: 3 },
  { id: 'n-022', kategori: 'numerik', tanya: 'Satu palet memuat 6 tumpuk. Tiap tumpuk 4 kardus, tiap kardus 15 botol. Berapa botol dalam satu palet?', pilihan: ['360 botol', '320 botol', '240 botol', '420 botol'], kunci: 0 },
  { id: 'n-023', kategori: 'numerik', tanya: '6 pekerja menyelesaikan gudang dalam 4 jam. Berapa pekerja agar selesai dalam 1,5 jam?', pilihan: ['10 pekerja', '12 pekerja', '14 pekerja', '16 pekerja'], kunci: 3 },
  { id: 'n-024', kategori: 'numerik', tanya: 'Lanjutkan deret: 5, 11, 23, 47, 95, ...', pilihan: ['189', '191', '193', '195'], kunci: 1 },

  /* ── SPASIAL (16) ────────────────────────────────────────────────────── */
  {
    id: 's-001',
    kategori: 'spasial',
    tanya: 'Panah menunjuk UTARA. Jika diputar 135° searah jarum jam lalu dicerminkan kiri-kanan, ke arah mana panah menunjuk?',
    svg: '<svg viewBox="0 0 240 90"><rect width="240" height="90" rx="8" fill="#f8fafc" stroke="#cbd5e1"/><circle cx="70" cy="45" r="32" fill="none" stroke="#94a3b8" stroke-dasharray="4 2"/><line x1="70" y1="68" x2="70" y2="20" stroke="#0f172a" stroke-width="3"/><polygon points="70,14 64,24 76,24" fill="#0f172a"/><text x="122" y="40" font-size="11" fill="#334155">1. Putar 135° searah</text><text x="122" y="56" font-size="11" fill="#334155">2. Cermin kiri-kanan</text></svg>',
    pilihan: ['Tenggara (kanan-bawah)', 'Barat daya (kiri-bawah)', 'Barat laut (kiri-atas)', 'Timur laut (kanan-atas)'],
    kunci: 1,
  },
  {
    id: 's-002',
    kategori: 'spasial',
    tanya: 'Perhatikan posisi titik hitam dari kotak ke kotak. Di mana posisinya pada kotak keempat?',
    svg: '<svg viewBox="0 0 240 80"><rect x="12" y="15" width="44" height="44" fill="#fff" stroke="#334155" stroke-width="2"/><circle cx="22" cy="25" r="5" fill="#0f172a"/><rect x="70" y="15" width="44" height="44" fill="#fff" stroke="#334155" stroke-width="2"/><circle cx="104" cy="25" r="5" fill="#0f172a"/><rect x="128" y="15" width="44" height="44" fill="#fff" stroke="#334155" stroke-width="2"/><circle cx="162" cy="49" r="5" fill="#0f172a"/><rect x="186" y="15" width="44" height="44" fill="#f1f5f9" stroke="#334155" stroke-width="2" stroke-dasharray="4 2"/><text x="208" y="43" text-anchor="middle" font-size="18" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: ['Sudut kiri-atas', 'Sudut kanan-atas', 'Sudut kiri-bawah', 'Tengah kotak'],
    kunci: 2,
  },
  {
    id: 's-003',
    kategori: 'spasial',
    tanya: 'Perhatikan pola penambahan garis. Bagaimana isi kotak keempat?',
    svg: '<svg viewBox="0 0 240 80"><rect x="12" y="15" width="44" height="44" fill="#fff" stroke="#334155" stroke-width="2"/><line x1="22" y1="20" x2="22" y2="54" stroke="#0f172a" stroke-width="2"/><rect x="70" y="15" width="44" height="44" fill="#fff" stroke="#334155" stroke-width="2"/><line x1="80" y1="20" x2="80" y2="54" stroke="#0f172a" stroke-width="2"/><line x1="88" y1="20" x2="88" y2="54" stroke="#0f172a" stroke-width="2"/><rect x="128" y="15" width="44" height="44" fill="#fff" stroke="#334155" stroke-width="2"/><line x1="138" y1="20" x2="138" y2="54" stroke="#0f172a" stroke-width="2"/><line x1="146" y1="20" x2="146" y2="54" stroke="#0f172a" stroke-width="2"/><line x1="154" y1="20" x2="154" y2="54" stroke="#0f172a" stroke-width="2"/><rect x="186" y="15" width="44" height="44" fill="#f1f5f9" stroke="#334155" stroke-width="2" stroke-dasharray="4 2"/><text x="208" y="43" text-anchor="middle" font-size="18" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: ['2 garis mendatar', '3 garis miring', '1 garis silang', '4 garis vertikal sejajar'],
    kunci: 3,
  },
  {
    id: 's-004',
    kategori: 'spasial',
    tanya: 'Perhatikan pola bentuk dan warna (hitam/putih). Bentuk apa yang mengisi tanda tanya?',
    svg: '<svg viewBox="0 0 240 80"><circle cx="26" cy="40" r="14" fill="#0f172a"/><polygon points="70,26 56,54 84,54" fill="#fff" stroke="#0f172a" stroke-width="2"/><circle cx="114" cy="40" r="14" fill="#fff" stroke="#0f172a" stroke-width="2"/><polygon points="158,26 144,54 172,54" fill="#0f172a"/><circle cx="196" cy="40" r="14" fill="#0f172a"/><text x="226" y="46" text-anchor="middle" font-size="20" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: ['Segitiga putih', 'Segitiga hitam', 'Lingkaran putih', 'Persegi hitam'],
    kunci: 0,
  },
  {
    id: 's-005',
    kategori: 'spasial',
    tanya: 'Bangun huruf "L" diputar 90° searah jarum jam. Bagaimana posisi akhirnya?',
    svg: '<svg viewBox="0 0 240 90"><rect width="240" height="90" rx="8" fill="#f8fafc" stroke="#cbd5e1"/><path d="M 65 20 L 65 68 L 100 68" fill="none" stroke="#0f172a" stroke-width="8" stroke-linecap="square"/><text x="160" y="48" text-anchor="middle" font-size="12" fill="#334155">Putar 90° searah</text></svg>',
    pilihan: [
      'Garis panjang vertikal di kanan, kaki pendek di bawah',
      'Garis panjang mendatar di atas, kaki pendek menunjuk ke bawah di sisi kiri',
      'Garis panjang mendatar di bawah, kaki pendek menunjuk ke atas di sisi kanan',
      'Garis panjang vertikal di kiri, kaki pendek di atas',
    ],
    kunci: 1,
  },
  {
    id: 's-006',
    kategori: 'spasial',
    tanya: 'Segitiga siku-siku dicerminkan terhadap garis putus-putus vertikal. Di mana letak sudut siku-sikunya sekarang?',
    svg: '<svg viewBox="0 0 240 90"><polygon points="50,20 50,70 100,70" fill="#cbd5e1" stroke="#0f172a" stroke-width="2"/><rect x="50" y="60" width="10" height="10" fill="none" stroke="#0f172a"/><line x1="120" y1="10" x2="120" y2="80" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 3"/><text x="175" y="50" text-anchor="middle" font-size="22" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: ['Sudut kanan-bawah', 'Sudut kiri-bawah', 'Sudut kanan-atas', 'Sudut kiri-atas'],
    kunci: 0,
  },
  {
    id: 's-007',
    kategori: 'spasial',
    tanya: 'Trapesium dengan titik hitam di atas dicerminkan melewati garis merah. Bagaimana hasil bayangannya?',
    svg: '<svg viewBox="0 0 240 95"><polygon points="95,12 145,12 165,40 75,40" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/><circle cx="120" cy="22" r="4" fill="#0f172a"/><line x1="40" y1="50" x2="200" y2="50" stroke="#ef4444" stroke-width="2" stroke-dasharray="5 3"/><text x="120" y="80" text-anchor="middle" font-size="18" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: [
      'Sisi atas tetap pendek dan titik hitam tetap di atas',
      'Sisi atas menjadi panjang dan titik hitam tetap di atas',
      'Sisi atas menjadi panjang dan titik hitam berada di bawah',
      'Bentuk berubah menjadi persegi panjang sempurna',
    ],
    kunci: 2,
  },
  {
    id: 's-008',
    kategori: 'spasial',
    tanya: 'Jaring-jaring kubus bernomor 1–6 dilipat menjadi kubus. Sisi mana yang BERHADAPAN dengan sisi nomor 1?',
    svg: '<svg viewBox="0 0 240 95"><g stroke="#0f172a" stroke-width="1.5" fill="#fff"><rect x="45" y="34" width="26" height="26"/><rect x="71" y="34" width="26" height="26"/><rect x="97" y="34" width="26" height="26"/><rect x="123" y="34" width="26" height="26"/><rect x="71" y="8" width="26" height="26"/><rect x="71" y="60" width="26" height="26"/></g><g font-size="12" font-weight="bold" text-anchor="middle" fill="#0f172a"><text x="58" y="51">1</text><text x="84" y="51">2</text><text x="110" y="51">3</text><text x="136" y="51">4</text><text x="84" y="25">5</text><text x="84" y="77">6</text></g></svg>',
    pilihan: ['Sisi nomor 2', 'Sisi nomor 3', 'Sisi nomor 4', 'Sisi nomor 6'],
    kunci: 1,
  },
  {
    id: 's-009',
    kategori: 'spasial',
    tanya: 'Jika isi gambar A dan B ditumpuk pada satu lingkaran, gambar mana yang terbentuk?',
    svg: '<svg viewBox="0 0 240 85"><circle cx="45" cy="42" r="24" fill="#fff" stroke="#0f172a" stroke-width="2"/><line x1="28" y1="25" x2="62" y2="59" stroke="#0f172a" stroke-width="2.5"/><text x="82" y="48" font-size="18" font-weight="bold">+</text><circle cx="120" cy="42" r="24" fill="#fff" stroke="#0f172a" stroke-width="2"/><line x1="103" y1="59" x2="137" y2="25" stroke="#0f172a" stroke-width="2.5"/><text x="158" y="48" font-size="18" font-weight="bold">=</text><circle cx="195" cy="42" r="24" fill="#f1f5f9" stroke="#334155" stroke-width="2" stroke-dasharray="4 2"/><text x="195" y="48" text-anchor="middle" font-size="18" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: ['Lingkaran dengan tanda tambah (+)', 'Lingkaran kosong', 'Lingkaran dengan tanda silang (X)', 'Lingkaran dengan dua garis sejajar'],
    kunci: 2,
  },
  {
    id: 's-010',
    kategori: 'spasial',
    tanya: 'Perhatikan urutan jumlah sisi bangun datar. Bangun apa yang mengisi urutan keempat?',
    svg: '<svg viewBox="0 0 240 80"><polygon points="32,20 14,56 50,56" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/><rect x="72" y="20" width="36" height="36" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/><polygon points="150,18 170,33 162,56 138,56 130,33" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/><text x="208" y="46" text-anchor="middle" font-size="22" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: ['Lingkaran', 'Trapesium (4 sisi)', 'Segidelapan (8 sisi)', 'Segienam (6 sisi)'],
    kunci: 3,
  },
  {
    id: 's-011',
    kategori: 'spasial',
    tanya: 'Perhatikan arah garis di dalam lingkaran. Ke arah mana garis menunjuk pada lingkaran keempat?',
    svg: '<svg viewBox="0 0 240 80"><circle cx="32" cy="40" r="20" fill="#fff" stroke="#0f172a" stroke-width="2"/><line x1="32" y1="40" x2="32" y2="22" stroke="#0f172a" stroke-width="3"/><circle cx="88" cy="40" r="20" fill="#fff" stroke="#0f172a" stroke-width="2"/><line x1="88" y1="40" x2="106" y2="40" stroke="#0f172a" stroke-width="3"/><circle cx="144" cy="40" r="20" fill="#fff" stroke="#0f172a" stroke-width="2"/><line x1="144" y1="40" x2="144" y2="58" stroke="#0f172a" stroke-width="3"/><circle cx="200" cy="40" r="20" fill="#f1f5f9" stroke="#334155" stroke-width="2" stroke-dasharray="4 2"/><text x="200" y="46" text-anchor="middle" font-size="16" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: ['Ke kiri (jam 09.00)', 'Ke atas (jam 12.00)', 'Ke kanan (jam 03.00)', 'Ke bawah (jam 06.00)'],
    kunci: 0,
  },
  {
    id: 's-012',
    kategori: 'spasial',
    tanya: 'Susunan balok: lapisan bawah 2 × 2 kubus penuh, ditambah 1 kubus di atas pojok kiri-belakang. Berapa total kubus satuan?',
    svg: '<svg viewBox="0 0 240 90"><rect width="240" height="90" rx="8" fill="#f8fafc" stroke="#cbd5e1"/><g stroke="#0f172a" stroke-width="1.5"><rect x="45" y="20" width="28" height="28" fill="#94a3b8"/><rect x="73" y="20" width="28" height="28" fill="#e2e8f0"/><rect x="45" y="48" width="28" height="28" fill="#e2e8f0"/><rect x="73" y="48" width="28" height="28" fill="#e2e8f0"/></g><g font-size="12" text-anchor="middle"><text x="59" y="39" fill="#fff" font-weight="bold">2</text><text x="87" y="39">1</text><text x="59" y="67">1</text><text x="87" y="67">1</text></g><text x="168" y="44" text-anchor="middle" font-size="11" fill="#334155">Tampak atas</text><text x="168" y="60" text-anchor="middle" font-size="10" fill="#64748b">(angka = tinggi tumpukan)</text></svg>',
    pilihan: ['4 kubus', '5 kubus', '6 kubus', '8 kubus'],
    kunci: 1,
  },
  {
    id: 's-013',
    kategori: 'spasial',
    tanya: 'Perhatikan pola pengurangan jumlah titik. Berapa titik pada kotak keempat?',
    svg: '<svg viewBox="0 0 240 80"><rect x="12" y="15" width="44" height="44" fill="#fff" stroke="#0f172a" stroke-width="2"/><g fill="#0f172a"><circle cx="24" cy="25" r="3.5"/><circle cx="24" cy="37" r="3.5"/><circle cx="24" cy="49" r="3.5"/><circle cx="44" cy="25" r="3.5"/><circle cx="44" cy="37" r="3.5"/><circle cx="44" cy="49" r="3.5"/></g><rect x="70" y="15" width="44" height="44" fill="#fff" stroke="#0f172a" stroke-width="2"/><g fill="#0f172a"><circle cx="82" cy="25" r="3.5"/><circle cx="82" cy="49" r="3.5"/><circle cx="92" cy="37" r="3.5"/><circle cx="102" cy="25" r="3.5"/><circle cx="102" cy="49" r="3.5"/></g><rect x="128" y="15" width="44" height="44" fill="#fff" stroke="#0f172a" stroke-width="2"/><g fill="#0f172a"><circle cx="140" cy="25" r="3.5"/><circle cx="140" cy="49" r="3.5"/><circle cx="160" cy="25" r="3.5"/><circle cx="160" cy="49" r="3.5"/></g><rect x="186" y="15" width="44" height="44" fill="#f1f5f9" stroke="#334155" stroke-width="2" stroke-dasharray="4 2"/><text x="208" y="43" text-anchor="middle" font-size="18" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: ['1 titik', '2 titik', '3 titik', '4 titik'],
    kunci: 2,
  },
  {
    id: 's-014',
    kategori: 'spasial',
    tanya: 'Tiga roda gigi saling bersinggungan. Jika roda A diputar searah jarum jam, ke arah mana roda C berputar?',
    svg: '<svg viewBox="0 0 240 85"><circle cx="55" cy="42" r="24" fill="#e2e8f0" stroke="#0f172a" stroke-width="3" stroke-dasharray="6 3"/><text x="55" y="47" text-anchor="middle" font-weight="bold" font-size="13">A</text><circle cx="115" cy="42" r="24" fill="#cbd5e1" stroke="#0f172a" stroke-width="3" stroke-dasharray="6 3"/><text x="115" y="47" text-anchor="middle" font-weight="bold" font-size="13">B</text><circle cx="175" cy="42" r="24" fill="#e2e8f0" stroke="#0f172a" stroke-width="3" stroke-dasharray="6 3"/><text x="175" y="47" text-anchor="middle" font-weight="bold" font-size="13">C</text></svg>',
    pilihan: ['Searah jarum jam (sama dengan A)', 'Berlawanan arah jarum jam', 'Diam / terkunci', 'Bergantian bolak-balik'],
    kunci: 0,
  },
  {
    id: 's-015',
    kategori: 'spasial',
    tanya: 'Perhatikan pola pengisian bagian lingkaran. Bagaimana bentuk lingkaran keempat?',
    svg: '<svg viewBox="0 0 240 80"><circle cx="32" cy="40" r="20" fill="#fff" stroke="#0f172a" stroke-width="2"/><path d="M32,40 L32,20 A20,20 0 0,1 52,40 Z" fill="#0f172a"/><circle cx="88" cy="40" r="20" fill="#fff" stroke="#0f172a" stroke-width="2"/><path d="M88,40 L88,20 A20,20 0 0,1 88,60 Z" fill="#0f172a"/><circle cx="144" cy="40" r="20" fill="#fff" stroke="#0f172a" stroke-width="2"/><path d="M144,40 L144,20 A20,20 0 1,1 124,40 Z" fill="#0f172a"/><circle cx="200" cy="40" r="20" fill="#f1f5f9" stroke="#334155" stroke-width="2" stroke-dasharray="4 2"/><text x="200" y="46" text-anchor="middle" font-size="16" font-weight="bold" fill="#64748b">?</text></svg>',
    pilihan: ['Lingkaran kosong', 'Terisi seperempat kiri-atas', 'Terisi setengah atas', 'Terisi penuh (4/4)'],
    kunci: 3,
  },
  {
    id: 's-016',
    kategori: 'spasial',
    tanya: 'Bangun mana yang TIDAK memiliki simetri lipat sama sekali?',
    svg: '<svg viewBox="0 0 240 85"><polygon points="30,18 12,56 48,56" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/><text x="30" y="74" text-anchor="middle" font-size="12" font-weight="bold">A</text><polygon points="75,22 115,22 103,56 63,56" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/><text x="89" y="74" text-anchor="middle" font-size="12" font-weight="bold">B</text><rect x="130" y="24" width="40" height="30" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/><text x="150" y="74" text-anchor="middle" font-size="12" font-weight="bold">C</text><polygon points="205,18 225,38 205,58 185,38" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/><text x="205" y="74" text-anchor="middle" font-size="12" font-weight="bold">D</text></svg>',
    pilihan: ['A (segitiga sama kaki)', 'B (jajargenjang)', 'C (persegi panjang)', 'D (belah ketupat)'],
    kunci: 1,
  },

  /* ── LOGIKA (16) ─────────────────────────────────────────────────────── */
  {
    id: 'l-001',
    kategori: 'logika',
    tanya: 'Semua pekerja pabrik wajib memakai sepatu safety. Sebagian orang di ruangan memakai sepatu safety. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Semua orang di ruangan adalah pekerja pabrik.',
      'Sebagian orang di ruangan pasti pekerja pabrik.',
      'Orang di ruangan yang tidak memakai sepatu safety pasti bukan pekerja pabrik.',
      'Tidak ada pekerja pabrik di ruangan.',
    ],
    kunci: 2,
  },
  {
    id: 'l-002',
    kategori: 'logika',
    tanya: 'SOP: "Jika lampu indikator MERAH menyala, matikan sakelar utama sebelum memanggil teknisi." Lampu MERAH menyala. Tindakan pertama yang wajib:',
    pilihan: ['Segera memanggil teknisi', 'Mematikan sakelar utama', 'Membongkar penutup mesin', 'Melanjutkan kerja sampai mesin berhenti'],
    kunci: 1,
  },
  {
    id: 'l-003',
    kategori: 'logika',
    tanya: 'Haruto tiba lebih awal daripada Kenji. Sora lebih lambat daripada Kenji, tetapi lebih awal daripada Riku. Siapa yang tiba PALING AWAL?',
    pilihan: ['Haruto', 'Kenji', 'Sora', 'Riku'],
    kunci: 0,
  },
  {
    id: 'l-004',
    kategori: 'logika',
    tanya: 'Semua produk yang lulus inspeksi akhir ditempeli stiker HIJAU. Komponen di Kotak X tidak berstiker HIJAU. Kesimpulan yang tepat:',
    pilihan: [
      'Komponen itu siap dikirim ke pelanggan.',
      'Semua produk di pabrik tidak berstiker hijau.',
      'Komponen di Kotak X belum atau tidak lulus inspeksi akhir.',
      'Stiker hijau hanya untuk barang rusak.',
    ],
    kunci: 2,
  },
  {
    id: 'l-005',
    kategori: 'logika',
    tanya: 'Tahapan: (1) pengemasan, (2) pemotongan bahan, (3) QC akhir, (4) perakitan, (5) kirim ke gudang. Urutan yang paling logis:',
    pilihan: ['2 - 1 - 4 - 3 - 5', '2 - 4 - 3 - 1 - 5', '4 - 2 - 3 - 1 - 5', '2 - 4 - 1 - 5 - 3'],
    kunci: 1,
  },
  {
    id: 'l-006',
    kategori: 'logika',
    tanya: 'Aturan: "Cairan A tidak boleh satu rak dengan B. Cairan C harus satu rak dengan A." Rak 1 sudah berisi B. Penempatan yang aman:',
    pilihan: [
      'A di rak 1, C di rak 2',
      'A, B, C bersama di rak 1',
      'C di rak 1, A di rak 2',
      'A dan C bersama di rak 2',
    ],
    kunci: 3,
  },
  {
    id: 'l-007',
    kategori: 'logika',
    tanya: 'Hari Minggu seluruh lini produksi libur, kecuali tim Maintenance. Hari ini Minggu dan Anton bertugas di pabrik. Kesimpulan yang pasti benar:',
    pilihan: [
      'Anton bertugas di tim Maintenance.',
      'Hari ini bukan hari Minggu.',
      'Seluruh lini produksi beroperasi normal.',
      'Anton datang pada hari Sabtu.',
    ],
    kunci: 0,
  },
  {
    id: 'l-008',
    kategori: 'logika',
    tanya: 'Saat merakit, Anda menemukan baut yang ulirnya aus dan tidak ada instruksinya. Sesuai Ho-Ren-So, tindakan paling tepat:',
    pilihan: [
      'Memaksa memasang dengan palu agar target tercapai',
      'Membuang komponen diam-diam',
      'Menghentikan bagian itu dan segera melapor ke Leader',
      'Membiarkan lubang tanpa baut',
    ],
    kunci: 2,
  },
  {
    id: 'l-009',
    kategori: 'logika',
    tanya: 'Prosedur: M2 dipanaskan sebelum M1 dinyalakan. M3 hanya setelah M1 beroperasi. M4 paling akhir. Urutan yang benar:',
    pilihan: ['M1 - M2 - M3 - M4', 'M2 - M1 - M3 - M4', 'M2 - M3 - M1 - M4', 'M4 - M3 - M1 - M2'],
    kunci: 1,
  },
  {
    id: 'l-010',
    kategori: 'logika',
    tanya: 'Tidak ada pekerja di area pengelasan yang boleh melepas kacamata pelindung. Riko berada di area pengelasan. Kesimpulan yang benar:',
    pilihan: [
      'Riko wajib mengenakan kacamata pelindung.',
      'Riko boleh melepasnya jika tidak mengelas.',
      'Hanya pekerja baru yang wajib memakainya.',
      'Riko bukan pekerja bagian pengelasan.',
    ],
    kunci: 0,
  },
  {
    id: 'l-011',
    kategori: 'logika',
    tanya: 'Rak A di kiri Rak B. Rak C di kanan Rak B. Rak D tepat di antara A dan B. Urutan dari kiri ke kanan:',
    pilihan: ['A - B - D - C', 'D - A - B - C', 'A - D - B - C', 'C - B - D - A'],
    kunci: 2,
  },
  {
    id: 'l-012',
    kategori: 'logika',
    tanya: 'Mesin berhenti darurat HANYA JIKA sensor mendeteksi tangan ATAU listrik terputus. Mesin berhenti darurat, listrik normal. Kesimpulan yang pasti:',
    pilihan: [
      'Listrik pabrik sedang padam.',
      'Mesin dimatikan untuk istirahat.',
      'Sensor rusak total.',
      'Sensor mendeteksi objek di area sensor.',
    ],
    kunci: 3,
  },
  {
    id: 'l-013',
    kategori: 'logika',
    tanya: 'Prinsip FIFO. Kloter P masuk Senin, Q Kamis, R Selasa, S Rabu. Urutan pengeluaran yang benar:',
    pilihan: ['P - R - S - Q', 'P - Q - R - S', 'Q - S - R - P', 'R - P - S - Q'],
    kunci: 0,
  },
  {
    id: 'l-014',
    kategori: 'logika',
    tanya: 'Aturan lembur: diizinkan jika target harian tercapai DAN disetujui Supervisor. Dedi sudah mencapai target, tetapi belum disetujui. Apakah boleh lembur?',
    pilihan: [
      'Boleh, karena target sudah tercapai.',
      'Tidak boleh, karena syarat persetujuan belum terpenuhi.',
      'Boleh, maksimal 2 jam.',
      'Boleh jika mengajak rekan lain.',
    ],
    kunci: 1,
  },
  {
    id: 'l-015',
    kategori: 'logika',
    tanya: 'Goresan > 2,0 mm masuk REJECT; ≤ 2,0 mm masuk REWORK. Ditemukan goresan 1,8 mm. Ke mana pelat itu?',
    pilihan: ['Dikirim langsung ke pelanggan', 'Kotak REJECT', 'Kotak REWORK', 'Dibuang ke sampah logam'],
    kunci: 2,
  },
  {
    id: 'l-016',
    kategori: 'logika',
    tanya: 'Lulus jika kehadiran 100% DAN nilai praktik minimal 80. Bima TIDAK lulus. Kesimpulan paling tepat:',
    pilihan: [
      'Kehadiran 100%, tetapi praktik di bawah 80.',
      'Praktik di atas 80, tetapi kehadiran kurang.',
      'Bima tidak pernah hadir.',
      'Kehadiran kurang dari 100%, atau praktik di bawah 80, atau keduanya.',
    ],
    kunci: 3,
  },
];

/* ── Pemilih soal ──────────────────────────────────────────────────────── */

/**
 * PRNG deterministik (Mulberry32) dari string seed.
 *
 * Dipakai HANYA untuk mengurutkan, bukan untuk keamanan. Sifat yang dibutuhkan
 * cuma satu: seed yang sama menghasilkan urutan yang sama di server dan di
 * setiap pemanggilan berikutnya.
 */
function acakDariSeed(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function kocokDenganSeed<T>(items: T[], seed: string): T[] {
  const rnd = acakDariSeed(seed);
  const salinan = [...items];
  for (let i = salinan.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [salinan[i], salinan[j]] = [salinan[j], salinan[i]];
  }
  return salinan;
}

const KATEGORI: KategoriIq[] = ['verbal', 'numerik', 'spasial', 'logika'];

/**
 * 40 soal untuk satu siswa — URUTAN DAN ISINYA TETAP untuk nomor WA yang sama.
 *
 * `wa` kosong (mode uji admin tanpa nomor) tetap menghasilkan satu paket yang
 * sah: seed-nya string kosong. Itu bukan kekurangan — admin hanya butuh satu
 * paket untuk dicoba, dan hasilnya tidak disimpan.
 */
export function pilihSoalIq(wa: string, salt = VERSI_BANK_IQ): SoalIq[] {
  const hasil: SoalIq[] = [];
  for (const kat of KATEGORI) {
    const pool = BANK_IQ.filter((s) => s.kategori === kat);
    hasil.push(...kocokDenganSeed(pool, `${wa}:${salt}:${kat}`).slice(0, KUOTA_IQ[kat]));
  }
  return hasil;
}

/** Bentuk yang dikirim ke browser: tanpa `kunci`. */
export function soalKlienIq(wa: string): SoalKlienIq[] {
  return pilihSoalIq(wa).map(({ kunci, ...sisa }) => sisa);
}

/** Peta id → kunci, untuk penilai. Hanya hidup di server. */
export function kunciIq(wa: string): Map<string, SoalIq> {
  return new Map(pilihSoalIq(wa).map((s) => [s.id, s]));
}
