/**
 * iq-bank.ts — bank soal Asesmen Penalaran (`/tes-iq`) + pemilih soal per siswa.
 *
 * KENAPA HIDUP DI SISI FUNGSI, BUKAN DI `src/`
 * --------------------------------------------
 * Berkas ini memuat KUNCI JAWABAN (`kunci`). Kalau ia diimpor dari kode klien,
 * Vite memasukkannya ke bundel dan kuncinya terbaca siapa pun lewat DevTools —
 * tesnya lalu mengukur kemampuan membuka tab Network, bukan penalaran.
 *
 * KENAPA 40 "SLOT" × 2 VARIAN, BUKAN 80 SOAL BEBAS
 * ------------------------------------------------
 * Dua hal harus benar sekaligus:
 *   1. setiap siswa mendapat komposisi kesulitan yang SAMA (kalau tidak, siswa A
 *      kebagian 12 soal mudah dan siswa B 12 soal sulit — skornya tidak bisa
 *      dibandingkan);
 *   2. dua siswa bersebelahan tidak mendapat paket yang identik.
 * Karena itu bank disusun sebagai 40 slot (12 verbal, 12 numerik, 8 spasial,
 * 8 logika), tiap slot punya DUA varian setara, dan pemilih mengambil satu
 * varian per slot. Komposisi tetap, isinya berbeda.
 *
 * Pemilihan deterministik dari nomor WA: refresh di tengah ujian tidak
 * mengacak ulang, tetapi siswa lain mendapat kombinasi varian yang lain.
 *
 * STANDAR SOAL (2026-11-07, permintaan pemilik)
 * ---------------------------------------------
 * Verbal  : analogi relasi (TPA), klasifikasi konsep, pemahaman instruksi (SPI Gengo).
 * Numerik : deret ICAR (termasuk alfanumerik), aritmetika presisi, rasio & kerja
 *           bersama (SPI Hi-Gengo).
 * Spasial : matriks progresif, operasi XOR, jaring kubus, rotasi/pencerminan
 *           (Sandia Matrices, ICAR).
 * Logika  : silogisme kuantor, modus tollens, penalaran analitis urutan,
 *           pohon keputusan SOP.
 * Distribusi: 11 mudah · 20 sedang · 9 sulit (≈ 27/50/23) — cukup landai untuk
 * menyaring, cukup curam untuk membedakan di ujung atas.
 */

export type KategoriIq = 'verbal' | 'numerik' | 'spasial' | 'logika';
export type TingkatIq = 'mudah' | 'sedang' | 'sulit';

export interface SoalIq {
  id: string;
  /** Slot konsep. Satu siswa hanya menerima SATU varian per slot. */
  slot: string;
  kategori: KategoriIq;
  tingkat: TingkatIq;
  tanya: string;
  /** Gambar inline untuk soal spasial. Dirender dengan `dangerouslySetInnerHTML`. */
  svg?: string;
  pilihan: [string, string, string, string];
  /** RAHASIA SERVER — tidak pernah ikut ke klien. */
  kunci: 0 | 1 | 2 | 3;
}

export type SoalKlienIq = Omit<SoalIq, 'kunci'>;

export const KUOTA_IQ: Record<KategoriIq, number> = {
  verbal: 12,
  numerik: 12,
  spasial: 8,
  logika: 8,
};

export const DURASI_IQ_MENIT = 25;
export const VERSI_BANK_IQ = 'asj-penalaran-v2';

/* ── Gambar yang dipakai bersama beberapa varian ─────────────────────────── */

const SVG_F =
  '<svg viewBox="0 0 240 100"><rect width="240" height="100" rx="8" fill="#f8fafc" stroke="#cbd5e1"/><path d="M80 18 L80 82 L96 82 L96 56 L132 56 L132 42 L96 42 L96 32 L136 32 L136 18 Z" fill="#0f172a"/></svg>';

const SVG_P =
  '<svg viewBox="0 0 240 100"><rect width="240" height="100" rx="8" fill="#f8fafc" stroke="#cbd5e1"/><path d="M92 18 L92 82 L108 82 L108 58 L132 58 A20 20 0 0 0 132 18 Z" fill="#0f172a"/></svg>';

const SVG_JARUM4 =
  '<svg viewBox="0 0 240 80"><g stroke="#334155" stroke-width="1.5" fill="#fff"><rect x="12" y="18" width="40" height="40"/><rect x="66" y="18" width="40" height="40"/><rect x="120" y="18" width="40" height="40"/><rect x="174" y="18" width="40" height="40"/></g><g stroke="#0f172a" stroke-width="3" stroke-linecap="round"><line x1="32" y1="48" x2="32" y2="28"/><line x1="86" y1="48" x2="99" y2="35"/><line x1="140" y1="38" x2="160" y2="38"/><line x1="194" y1="28" x2="207" y2="41"/></g><g fill="#0f172a"><polygon points="32,22 26,32 38,32"/><polygon points="103,31 93,29 95,39"/><polygon points="166,38 156,33 156,43"/><polygon points="211,45 209,35 199,37"/></g><text x="194" y="72" text-anchor="middle" font-size="11" fill="#64748b">kotak 1 – 4</text></svg>';

const SVG_MATRIKS =
  '<svg viewBox="0 0 240 80"><g fill="#fff" stroke="#334155" stroke-width="1.5"><rect x="10" y="15" width="46" height="46"/><rect x="70" y="15" width="46" height="46"/><rect x="130" y="15" width="46" height="46"/><rect x="190" y="15" width="46" height="46" stroke-dasharray="4 2" fill="#f1f5f9"/></g><g stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"><line x1="33" y1="52" x2="33" y2="28"/><line x1="93" y1="38" x2="117" y2="38"/><line x1="153" y1="24" x2="153" y2="48"/></g><g fill="#0f172a"><circle cx="17" cy="22" r="3.5"/><circle cx="77" cy="52" r="3.5"/><circle cx="163" cy="52" r="3.5"/></g><text x="213" y="43" text-anchor="middle" font-size="18" font-weight="bold" fill="#64748b">?</text></svg>';

const SVG_XOR =
  '<svg viewBox="0 0 240 90"><rect x="8" y="15" width="52" height="52" fill="#fff" stroke="#334155" stroke-width="1.5"/><line x1="16" y1="23" x2="52" y2="59" stroke="#0f172a" stroke-width="2.5"/><line x1="12" y1="41" x2="56" y2="41" stroke="#0f172a" stroke-width="2.5"/><text x="74" y="47" font-size="16" font-weight="bold">+</text><rect x="90" y="15" width="52" height="52" fill="#fff" stroke="#334155" stroke-width="1.5"/><line x1="98" y1="59" x2="134" y2="23" stroke="#0f172a" stroke-width="2.5"/><line x1="94" y1="41" x2="138" y2="41" stroke="#0f172a" stroke-width="2.5"/><text x="156" y="47" font-size="16" font-weight="bold">=</text><rect x="176" y="15" width="52" height="52" fill="#f1f5f9" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 2"/><text x="202" y="50" text-anchor="middle" font-size="18" font-weight="bold" fill="#64748b">?</text></svg>';

const SVG_NET =
  '<svg viewBox="0 0 240 95"><g stroke="#0f172a" stroke-width="1.5" fill="#fff"><rect x="71" y="8" width="26" height="26"/><rect x="45" y="34" width="26" height="26"/><rect x="71" y="34" width="26" height="26"/><rect x="97" y="34" width="26" height="26"/><rect x="71" y="60" width="26" height="26"/><rect x="97" y="60" width="26" height="26"/></g><g font-size="12" font-weight="bold" text-anchor="middle" fill="#0f172a"><text x="84" y="25">1</text><text x="58" y="51">2</text><text x="84" y="51">3</text><text x="110" y="51">4</text><text x="84" y="77">5</text><text x="110" y="77">6</text></g></svg>';

const SVG_DADU =
  '<svg viewBox="0 0 240 95"><rect width="240" height="95" rx="8" fill="#f8fafc" stroke="#cbd5e1"/><g stroke="#0f172a" stroke-width="2"><polygon points="95,30 145,30 165,48 115,48" fill="#e2e8f0"/><polygon points="115,48 165,48 165,76 115,76" fill="#cbd5e1"/><polygon points="95,30 115,48 115,76 95,58" fill="#94a3b8"/></g><circle cx="130" cy="39" r="5" fill="#0f172a"/><polygon points="140,60 152,68 128,68" fill="#0f172a"/><g stroke="#0f172a" stroke-width="2.5"><line x1="122" y1="52" x2="132" y2="62"/><line x1="132" y1="52" x2="122" y2="62"/></g><text x="60" y="26" font-size="10" fill="#334155">atas</text><text x="196" y="70" font-size="10" fill="#334155">depan</text><text x="52" y="76" font-size="10" fill="#334155">kanan</text></svg>';

const SVG_KUBUS3 =
  '<svg viewBox="0 0 240 100"><rect width="240" height="100" rx="8" fill="#f8fafc" stroke="#cbd5e1"/><g stroke="#0f172a" stroke-width="1.5"><rect x="40" y="20" width="30" height="30" fill="#94a3b8"/><rect x="70" y="20" width="30" height="30" fill="#94a3b8"/><rect x="100" y="20" width="30" height="30" fill="#e2e8f0"/><rect x="40" y="50" width="30" height="30" fill="#94a3b8"/><rect x="70" y="50" width="30" height="30" fill="#e2e8f0"/><rect x="100" y="50" width="30" height="30" fill="#e2e8f0"/></g><g font-size="13" font-weight="bold" text-anchor="middle"><text x="55" y="40" fill="#fff">3</text><text x="85" y="40" fill="#fff">2</text><text x="115" y="40">1</text><text x="55" y="70" fill="#fff">2</text><text x="85" y="70">1</text><text x="115" y="70">1</text></g><text x="170" y="50" font-size="11" fill="#334155">tampak atas</text><text x="170" y="66" font-size="10" fill="#64748b">(angka = tinggi)</text></svg>';

/* ── Bank soal: 40 slot × 2 varian ───────────────────────────────────────── */

export const BANK_IQ: SoalIq[] = [
  /* ══ VERBAL (12 slot · 4 mudah · 6 sedang · 2 sulit) ═══════════════════ */
  {
    id: 'v-01a', slot: 'v-01', kategori: 'verbal', tingkat: 'mudah',
    tanya: 'PAHAT : KAYU = GERINDA : ...',
    pilihan: ['Kertas', 'Logam', 'Kain', 'Cairan'], kunci: 1,
  },
  {
    id: 'v-01b', slot: 'v-01', kategori: 'verbal', tingkat: 'mudah',
    tanya: 'OBENG : SEKRUP = PALU : ...',
    pilihan: ['Paku', 'Kayu', 'Kaca', 'Kain'], kunci: 0,
  },
  {
    id: 'v-02a', slot: 'v-02', kategori: 'verbal', tingkat: 'mudah',
    tanya: 'GESEKAN : AUS = OKSIDASI : ...',
    pilihan: ['Karat', 'Beku', 'Retak', 'Menguap'], kunci: 0,
  },
  {
    id: 'v-02b', slot: 'v-02', kategori: 'verbal', tingkat: 'mudah',
    tanya: 'PEMANASAN : PEMUAIAN = PENDINGINAN : ...',
    pilihan: ['Penyusutan', 'Pemuaian', 'Peleburan', 'Korosi'], kunci: 0,
  },
  {
    id: 'v-03a', slot: 'v-03', kategori: 'verbal', tingkat: 'mudah',
    tanya: 'Manakah yang TIDAK termasuk kelompok bahan penghantar listrik?',
    pilihan: ['Tembaga', 'Aluminium', 'Besi', 'Karet'], kunci: 3,
  },
  {
    id: 'v-03b', slot: 'v-03', kategori: 'verbal', tingkat: 'mudah',
    tanya: 'Manakah yang TIDAK termasuk kelompok bahan isolator?',
    pilihan: ['Kayu kering', 'Kaca', 'Plastik', 'Besi'], kunci: 3,
  },
  {
    id: 'v-04a', slot: 'v-04', kategori: 'verbal', tingkat: 'mudah',
    tanya:
      'Pengiriman ke Gudang Barat hanya dijadwalkan Selasa dan Jumat. Jika jatuh pada hari libur nasional, pengiriman digeser ke satu hari kerja berikutnya. Jumat minggu ini libur nasional dan Sabtu adalah hari kerja. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Pengiriman minggu itu ditiadakan.',
      'Pengiriman digabung ke Selasa minggu depan.',
      'Pengiriman yang seharusnya Jumat dilakukan hari Sabtu.',
      'Pengiriman dimajukan ke hari Kamis.',
    ],
    kunci: 2,
  },
  {
    id: 'v-04b', slot: 'v-04', kategori: 'verbal', tingkat: 'mudah',
    tanya:
      'Inspeksi lini hanya dijadwalkan Senin dan Kamis. Jika jatuh pada hari libur nasional, inspeksi digeser ke satu hari kerja berikutnya. Kamis minggu ini libur nasional dan Jumat adalah hari kerja. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Inspeksi minggu itu ditiadakan.',
      'Inspeksi yang seharusnya Kamis dilakukan hari Jumat.',
      'Inspeksi dimajukan ke hari Rabu.',
      'Inspeksi digabung ke Senin minggu depan.',
    ],
    kunci: 1,
  },
  {
    id: 'v-05a', slot: 'v-05', kategori: 'verbal', tingkat: 'sedang',
    tanya: 'KALIBRASI : AKURASI = STERILISASI : ...',
    pilihan: ['Kuantitas', 'Higienitas', 'Kecepatan', 'Elastisitas'], kunci: 1,
  },
  {
    id: 'v-05b', slot: 'v-05', kategori: 'verbal', tingkat: 'sedang',
    tanya: 'PELUMASAN : GESEKAN = PENGECATAN : ...',
    pilihan: ['Warna', 'Karat', 'Berat', 'Harga'], kunci: 1,
  },
  {
    id: 'v-06a', slot: 'v-06', kategori: 'verbal', tingkat: 'sedang',
    tanya: 'KOMPONEN : MESIN = PASAL : ...',
    pilihan: ['Pengadilan', 'Hakim', 'Undang-undang', 'Sanksi'], kunci: 2,
  },
  {
    id: 'v-06b', slot: 'v-06', kategori: 'verbal', tingkat: 'sedang',
    tanya: 'KATA : KALIMAT = BATA : ...',
    pilihan: ['Semen', 'Dinding', 'Pasir', 'Atap'], kunci: 1,
  },
  {
    id: 'v-07a', slot: 'v-07', kategori: 'verbal', tingkat: 'sedang',
    tanya: 'Manakah yang TIDAK termasuk sifat mekanis material?',
    pilihan: ['Elastis', 'Getas', 'Lentur', 'Presisi'], kunci: 3,
  },
  {
    id: 'v-07b', slot: 'v-07', kategori: 'verbal', tingkat: 'sedang',
    tanya: 'Manakah yang TIDAK termasuk sifat tampak/permukaan material?',
    pilihan: ['Kilap', 'Warna', 'Tekstur', 'Keras'], kunci: 3,
  },
  {
    id: 'v-08a', slot: 'v-08', kategori: 'verbal', tingkat: 'sedang',
    tanya: 'Manakah yang TIDAK termasuk kegiatan pengendalian mutu (QC)?',
    pilihan: ['Inspeksi', 'Pengujian', 'Verifikasi', 'Pemasaran'], kunci: 3,
  },
  {
    id: 'v-08b', slot: 'v-08', kategori: 'verbal', tingkat: 'sedang',
    tanya: 'Manakah yang TIDAK termasuk kegiatan pemeriksaan sebelum barang dikirim?',
    pilihan: ['Kalibrasi alat ukur', 'Inspeksi visual', 'Uji petik', 'Pengiriman'], kunci: 3,
  },
  {
    id: 'v-09a', slot: 'v-09', kategori: 'verbal', tingkat: 'sedang',
    tanya:
      'Mesin seri X memakai listrik 20% lebih rendah daripada seri Y, tetapi menuntut penggantian pisau dua kali lebih sering. Harga satu pisau untuk kedua seri sama persis. Pernyataan yang PASTI benar:',
    pilihan: [
      'Biaya total operasional X lebih mahal daripada Y.',
      'Biaya pisau bulanan X lebih tinggi daripada Y.',
      'Mesin Y bekerja lebih cepat daripada X.',
      'Tagihan listrik pabrik pasti turun 20% bila memakai X.',
    ],
    kunci: 1,
  },
  {
    id: 'v-09b', slot: 'v-09', kategori: 'verbal', tingkat: 'sedang',
    tanya:
      'Mesin M 25% lebih cepat daripada mesin N, tetapi tingkat produk cacatnya dua kali lipat. Biaya perbaikan satu unit cacat sama untuk kedua mesin. Pernyataan yang PASTI benar:',
    pilihan: [
      'Biaya listrik M lebih murah daripada N.',
      'Biaya perbaikan M lebih tinggi daripada N.',
      'Mesin M lebih awet daripada N.',
      'Total biaya M pasti lebih murah daripada N.',
    ],
    kunci: 1,
  },
  {
    id: 'v-10a', slot: 'v-10', kategori: 'verbal', tingkat: 'sedang',
    tanya:
      'Setiap insiden ringan wajib dilaporkan ke Supervisor maksimal 2 jam setelah kejadian. Bila insiden membuat lini berhenti lebih dari 15 menit, laporan wajib langsung ditembuskan ke Manajer Pabrik saat itu juga. Pukul 09.00 terjadi insiden ringan yang membuat lini berhenti 10 menit. Tindakan yang sesuai aturan:',
    pilihan: [
      'Lapor Supervisor paling lambat pukul 11.00, tanpa tembusan langsung ke Manajer.',
      'Wajib langsung ditembuskan ke Manajer pukul 09.00.',
      'Tidak perlu dilaporkan karena di bawah 15 menit.',
      'Dilaporkan ke Supervisor keesokan harinya.',
    ],
    kunci: 0,
  },
  {
    id: 'v-10b', slot: 'v-10', kategori: 'verbal', tingkat: 'sedang',
    tanya:
      'Setiap insiden ringan wajib dilaporkan ke Supervisor maksimal 2 jam setelah kejadian. Bila insiden membuat lini berhenti lebih dari 15 menit, laporan wajib langsung ditembuskan ke Manajer Pabrik saat itu juga. Pukul 13.00 terjadi insiden ringan yang membuat lini berhenti 22 menit. Tindakan yang sesuai aturan:',
    pilihan: [
      'Cukup lapor Supervisor sebelum pukul 15.00.',
      'Laporan wajib langsung ditembuskan ke Manajer Pabrik saat itu juga.',
      'Tidak perlu dilaporkan karena insidennya ringan.',
      'Lapor Supervisor besok pagi.',
    ],
    kunci: 1,
  },
  {
    id: 'v-11a', slot: 'v-11', kategori: 'verbal', tingkat: 'sulit',
    tanya: 'PRESEDEN : KEPUTUSAN = HIPOTESIS : ...',
    pilihan: ['Fakta', 'Eksperimen', 'Teori', 'Kesimpulan'], kunci: 1,
  },
  {
    id: 'v-11b', slot: 'v-11', kategori: 'verbal', tingkat: 'sulit',
    tanya: 'TEORI : PENGUJIAN = DESAIN : ...',
    pilihan: ['Purwarupa', 'Produk akhir', 'Pasar', 'Biaya'], kunci: 0,
  },
  {
    id: 'v-12a', slot: 'v-12', kategori: 'verbal', tingkat: 'sulit',
    tanya:
      'Sepanjang kuartal ketiga, setiap kenaikan produksi bulanan Pabrik A selalu diikuti kenaikan jam lembur teknisi. Namun pada September, total biaya operasional justru turun 12% meski produksi September tertinggi sepanjang kuartal. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Jam lembur teknisi September turun.',
      'Tarif upah lembur dipotong pada September.',
      'Jam lembur teknisi tetap naik, dan penghematan berasal dari pos biaya lain.',
      'Produksi Agustus lebih tinggi daripada September.',
    ],
    kunci: 2,
  },
  {
    id: 'v-12b', slot: 'v-12', kategori: 'verbal', tingkat: 'sulit',
    tanya:
      'Setiap keterlambatan pasokan bahan selalu menaikkan jam lembur di lini perakitan. Pada Oktober tidak ada satu pun pasokan yang terlambat, tetapi jam lembur lini perakitan tetap naik dibanding September. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Pasokan Oktober sebenarnya terlambat tetapi tidak tercatat.',
      'Kenaikan lembur Oktober disebabkan hal lain selain keterlambatan pasokan.',
      'Produksi Oktober lebih rendah daripada September.',
      'Tarif upah lembur dipotong pada Oktober.',
    ],
    kunci: 1,
  },

  /* ══ NUMERIK (12 slot · 3 mudah · 6 sedang · 3 sulit) ══════════════════ */
  {
    id: 'n-01a', slot: 'n-01', kategori: 'numerik', tingkat: 'mudah',
    tanya: 'Lanjutkan deret: 4, 9, 19, 39, 79, ...',
    pilihan: ['139', '149', '158', '159'], kunci: 3,
  },
  {
    id: 'n-01b', slot: 'n-01', kategori: 'numerik', tingkat: 'mudah',
    tanya: 'Lanjutkan deret: 3, 7, 15, 31, 63, ...',
    pilihan: ['95', '125', '127', '129'], kunci: 2,
  },
  {
    id: 'n-02a', slot: 'n-02', kategori: 'numerik', tingkat: 'mudah',
    tanya: 'Dari 800 komponen yang diperiksa, 1,5% dinyatakan rusak. Berapa yang LULUS?',
    pilihan: ['785 unit', '788 unit', '790 unit', '792 unit'], kunci: 1,
  },
  {
    id: 'n-02b', slot: 'n-02', kategori: 'numerik', tingkat: 'mudah',
    tanya: 'Dari 600 unit yang diperiksa, 2,5% dinyatakan cacat. Berapa yang LULUS?',
    pilihan: ['570 unit', '585 unit', '590 unit', '595 unit'], kunci: 1,
  },
  {
    id: 'n-03a', slot: 'n-03', kategori: 'numerik', tingkat: 'mudah',
    tanya: 'Jeriken 18 liter dituang seluruhnya ke botol 450 ml. Berapa botol dibutuhkan?',
    pilihan: ['36 botol', '40 botol', '45 botol', '50 botol'], kunci: 1,
  },
  {
    id: 'n-03b', slot: 'n-03', kategori: 'numerik', tingkat: 'mudah',
    tanya: 'Drum 24 liter dituang seluruhnya ke kaleng 300 ml. Berapa kaleng dibutuhkan?',
    pilihan: ['60 kaleng', '72 kaleng', '80 kaleng', '90 kaleng'], kunci: 2,
  },
  {
    id: 'n-04a', slot: 'n-04', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Lanjutkan deret alfanumerik: B2, D5, G10, K17, P26, ...',
    pilihan: ['U35', 'V37', 'V36', 'W37'], kunci: 1,
  },
  {
    id: 'n-04b', slot: 'n-04', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Lanjutkan deret alfanumerik: A2, C5, F9, J14, O20, ...',
    pilihan: ['T26', 'U27', 'U28', 'V27'], kunci: 1,
  },
  {
    id: 'n-05a', slot: 'n-05', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Lanjutkan deret: 12, 5, 15, 10, 18, 20, 21, ...',
    pilihan: ['24', '30', '35', '40'], kunci: 3,
  },
  {
    id: 'n-05b', slot: 'n-05', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Lanjutkan deret: 7, 4, 10, 8, 13, 16, 16, ...',
    pilihan: ['24', '28', '32', '36'], kunci: 2,
  },
  {
    id: 'n-06a', slot: 'n-06', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Standar panjang baut 12,50 cm dengan toleransi ±0,15 cm. Ukuran mana yang TIDAK LULUS?',
    pilihan: ['12,36 cm', '12,48 cm', '12,64 cm', '12,32 cm'], kunci: 3,
  },
  {
    id: 'n-06b', slot: 'n-06', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Standar diameter poros 8,00 mm dengan toleransi ±0,10 mm. Ukuran mana yang TIDAK LULUS?',
    pilihan: ['7,92 mm', '7,95 mm', '8,08 mm', '7,85 mm'], kunci: 3,
  },
  {
    id: 'n-07a', slot: 'n-07', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Mesin A menyelesaikan satu kloter dalam 6 jam, mesin B dalam 3 jam. Jika keduanya menyala bersama sejak awal, berapa jam sampai selesai?',
    pilihan: ['1,5 jam', '2 jam', '2,5 jam', '4,5 jam'], kunci: 1,
  },
  {
    id: 'n-07b', slot: 'n-07', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Pekerja A menyelesaikan satu order dalam 4 jam, pekerja B dalam 12 jam. Jika bekerja bersama sejak awal, berapa jam sampai selesai?',
    pilihan: ['2 jam', '2,5 jam', '3 jam', '3,5 jam'], kunci: 2,
  },
  {
    id: 'n-08a', slot: 'n-08', kategori: 'numerik', tingkat: 'sedang',
    tanya: '9 teknisi menyelesaikan perombakan pipa dalam 16 hari. Agar selesai 12 hari, berapa TAMBAHAN teknisi?',
    pilihan: ['2 orang', '3 orang', '4 orang', '12 orang'], kunci: 1,
  },
  {
    id: 'n-08b', slot: 'n-08', kategori: 'numerik', tingkat: 'sedang',
    tanya: '8 teknisi menyelesaikan pemasangan instalasi dalam 15 hari. Agar selesai 10 hari, berapa TAMBAHAN teknisi?',
    pilihan: ['2 orang', '3 orang', '4 orang', '6 orang'], kunci: 2,
  },
  {
    id: 'n-09a', slot: 'n-09', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Cairan dibuat dari bahan A : B : air = 2 : 3 : 7. Untuk 60 liter, berapa selisih air dan bahan A?',
    pilihan: ['15 liter', '20 liter', '25 liter', '35 liter'], kunci: 2,
  },
  {
    id: 'n-09b', slot: 'n-09', kategori: 'numerik', tingkat: 'sedang',
    tanya: 'Campuran dibuat dari bahan A : B : air = 3 : 4 : 5. Untuk 72 liter, berapa selisih air dan bahan A?',
    pilihan: ['6 liter', '9 liter', '12 liter', '18 liter'], kunci: 2,
  },
  {
    id: 'n-10a', slot: 'n-10', kategori: 'numerik', tingkat: 'sulit',
    tanya: 'Lanjutkan deret: 3, 5, 13, 43, 177, ...',
    pilihan: ['714', '885', '891', '1.062'], kunci: 2,
  },
  {
    id: 'n-10b', slot: 'n-10', kategori: 'numerik', tingkat: 'sulit',
    tanya: 'Lanjutkan deret: 2, 5, 16, 65, 326, ...',
    pilihan: ['1.857', '1.957', '1.963', '2.057'], kunci: 1,
  },
  {
    id: 'n-11a', slot: 'n-11', kategori: 'numerik', tingkat: 'sulit',
    tanya: '1.000 unit diproses. Tahap 1 gagal 10% dan dibuang; tahap 2 gagal 5% dari yang lulus tahap 1. Berapa unit lulus akhir?',
    pilihan: ['850 unit', '855 unit', '860 unit', '900 unit'], kunci: 1,
  },
  {
    id: 'n-11b', slot: 'n-11', kategori: 'numerik', tingkat: 'sulit',
    tanya: '800 unit diproses. Tahap 1 gagal 15% dan dibuang; tahap 2 gagal 10% dari yang lulus tahap 1. Berapa unit lulus akhir?',
    pilihan: ['600 unit', '612 unit', '620 unit', '648 unit'], kunci: 1,
  },
  {
    id: 'n-12a', slot: 'n-12', kategori: 'numerik', tingkat: 'sulit',
    tanya: 'Mesin memotong 40 detik lalu wajib jeda 10 detik sebelum potongan berikutnya. Untuk memotong pipa menjadi 10 bagian, berapa total waktu dari potongan pertama hingga potongan terakhir selesai?',
    pilihan: ['440 detik', '450 detik', '490 detik', '500 detik'], kunci: 0,
  },
  {
    id: 'n-12b', slot: 'n-12', kategori: 'numerik', tingkat: 'sulit',
    tanya: 'Mesin memotong 30 detik lalu wajib jeda 6 detik sebelum potongan berikutnya. Untuk memotong pipa menjadi 8 bagian, berapa total waktu dari potongan pertama hingga potongan terakhir selesai?',
    pilihan: ['240 detik', '246 detik', '252 detik', '258 detik'], kunci: 1,
  },

  /* ══ SPASIAL (8 slot · 2 mudah · 4 sedang · 2 sulit) ═══════════════════ */
  {
    id: 's-01a', slot: 's-01', kategori: 'spasial', tingkat: 'mudah',
    tanya: 'Huruf "F" diputar 90° searah jarum jam. Bagaimana posisi akhirnya?',
    svg: SVG_F,
    pilihan: [
      'Tiang utama mendatar di atas, dua lengan menunjuk ke bawah',
      'Tiang utama mendatar di bawah, dua lengan menunjuk ke atas',
      'Tiang utama tegak di kanan, dua lengan menunjuk ke kiri',
      'Tiang utama tegak di kiri, dua lengan menunjuk ke bawah',
    ],
    kunci: 0,
  },
  {
    id: 's-01b', slot: 's-01', kategori: 'spasial', tingkat: 'mudah',
    tanya: 'Huruf "F" diputar 180°. Bagaimana posisi akhirnya?',
    svg: SVG_F,
    pilihan: [
      'Tiang utama tegak di kanan, dua lengan menunjuk ke kiri',
      'Tiang utama tegak di kiri, dua lengan menunjuk ke kanan',
      'Tiang utama mendatar di atas, dua lengan menunjuk ke bawah',
      'Tiang utama mendatar di bawah, dua lengan menunjuk ke atas',
    ],
    kunci: 0,
  },
  {
    id: 's-02a', slot: 's-02', kategori: 'spasial', tingkat: 'mudah',
    tanya: 'Jarum berputar 45° searah jarum jam setiap kotak. Ke arah mana jarum pada kotak ke-5?',
    svg: SVG_JARUM4,
    pilihan: ['Barat', 'Selatan', 'Barat daya', 'Utara'], kunci: 1,
  },
  {
    id: 's-02b', slot: 's-02', kategori: 'spasial', tingkat: 'mudah',
    tanya: 'Jarum berputar 45° searah jarum jam setiap kotak. Ke arah mana jarum pada kotak ke-3?',
    svg: SVG_JARUM4,
    pilihan: ['Utara', 'Timur', 'Selatan', 'Barat'], kunci: 1,
  },
  {
    id: 's-03a', slot: 's-03', kategori: 'spasial', tingkat: 'sedang',
    tanya:
      'Jarum berputar 90° searah jarum jam tiap kotak, sementara titik hitam berpindah sudut BERLAWANAN arah jarum jam. Bagaimana isi kotak ke-4?',
    svg: SVG_MATRIKS,
    pilihan: [
      'Jarum ke kiri, titik di sudut kanan-atas',
      'Jarum ke kiri, titik di sudut kiri-atas',
      'Jarum ke atas, titik di sudut kanan-atas',
      'Jarum ke kanan, titik di sudut kiri-bawah',
    ],
    kunci: 0,
  },
  {
    id: 's-03b', slot: 's-03', kategori: 'spasial', tingkat: 'sedang',
    tanya:
      'Jarum berputar 90° searah jarum jam tiap kotak, sementara titik hitam berpindah sudut BERLAWANAN arah jarum jam. Bagaimana isi kotak ke-2?',
    svg: SVG_MATRIKS,
    pilihan: [
      'Jarum ke kanan, titik di sudut kiri-bawah',
      'Jarum ke kanan, titik di sudut kanan-atas',
      'Jarum ke bawah, titik di sudut kiri-bawah',
      'Jarum ke kiri, titik di sudut kanan-bawah',
    ],
    kunci: 0,
  },
  {
    id: 's-04a', slot: 's-04', kategori: 'spasial', tingkat: 'sedang',
    tanya:
      'Aturan: garis yang berada di posisi SAMA saling menghilangkan (XOR), garis yang berbeda posisi tetap muncul. Apa isi kotak hasil?',
    svg: SVG_XOR,
    pilihan: ['Tanda tambah (+)', 'Tanda silang (X) tanpa garis mendatar', 'Hanya garis mendatar', 'Kotak kosong'],
    kunci: 1,
  },
  {
    id: 's-04b', slot: 's-04', kategori: 'spasial', tingkat: 'sedang',
    tanya:
      'Aturan: seluruh garis dari kedua gambar DIGABUNG (garis yang sama tetap muncul satu kali). Apa isi kotak hasil?',
    svg: SVG_XOR,
    pilihan: ['Hanya garis mendatar', 'Tanda silang (X) saja', 'Tanda silang (X) DAN garis mendatar', 'Kotak kosong'],
    kunci: 2,
  },
  {
    id: 's-05a', slot: 's-05', kategori: 'spasial', tingkat: 'sedang',
    tanya: 'Jaring-jaring dilipat menjadi kubus. Sisi mana yang BERHADAPAN dengan sisi nomor 3?',
    svg: SVG_NET,
    pilihan: ['Sisi 1', 'Sisi 4', 'Sisi 5', 'Sisi 6'], kunci: 1,
  },
  {
    id: 's-05b', slot: 's-05', kategori: 'spasial', tingkat: 'sedang',
    tanya: 'Jaring-jaring dilipat menjadi kubus. Sisi mana yang BERHADAPAN dengan sisi nomor 2?',
    svg: SVG_NET,
    pilihan: ['Sisi 1', 'Sisi 3', 'Sisi 5', 'Sisi 6'], kunci: 2,
  },
  {
    id: 's-06a', slot: 's-06', kategori: 'spasial', tingkat: 'sedang',
    tanya: 'Huruf "P" diputar 180° lalu dicerminkan kiri-kanan. Hasilnya menyerupai huruf kecil?',
    svg: SVG_P,
    pilihan: ['b', 'd', 'p', 'q'], kunci: 0,
  },
  {
    id: 's-06b', slot: 's-06', kategori: 'spasial', tingkat: 'sedang',
    tanya: 'Huruf "P" diputar 180° saja (tanpa pencerminan). Hasilnya menyerupai huruf kecil?',
    svg: SVG_P,
    pilihan: ['b', 'd', 'p', 'q'], kunci: 1,
  },
  {
    id: 's-07a', slot: 's-07', kategori: 'spasial', tingkat: 'sulit',
    tanya:
      'Kubus: sisi ATAS lingkaran, DEPAN segitiga, KANAN silang. Digulingkan sekali ke KIRI, lalu diputar 90° searah jarum jam dilihat dari atas. Apa isi sisi ATAS dan DEPAN sekarang?',
    svg: SVG_DADU,
    pilihan: [
      'Atas lingkaran, depan silang',
      'Atas silang, depan segitiga',
      'Atas silang, depan lingkaran',
      'Atas segitiga, depan lingkaran',
    ],
    kunci: 2,
  },
  {
    id: 's-07b', slot: 's-07', kategori: 'spasial', tingkat: 'sulit',
    tanya:
      'Kubus: sisi ATAS lingkaran, DEPAN segitiga, KANAN silang. Digulingkan sekali ke DEPAN (ke arah Anda), lalu diputar 90° searah jarum jam dilihat dari atas. Apa isi sisi ATAS dan DEPAN sekarang?',
    svg: SVG_DADU,
    pilihan: [
      'Atas silang, depan lingkaran',
      'Atas lingkaran, depan silang',
      'Atas segitiga, depan silang',
      'Atas silang, depan segitiga',
    ],
    kunci: 1,
  },
  {
    id: 's-08a', slot: 's-08', kategori: 'spasial', tingkat: 'sulit',
    tanya:
      'Susunan kubus: lapisan bawah penuh 3×3, lapisan tengah 2×2 di pojok, lapisan atas 1 kubus. Berapa kubus TAMBAHAN agar menjadi kubus utuh 3×3×3?',
    svg: SVG_KUBUS3,
    pilihan: ['11 kubus', '13 kubus', '14 kubus', '15 kubus'], kunci: 1,
  },
  {
    id: 's-08b', slot: 's-08', kategori: 'spasial', tingkat: 'sulit',
    tanya:
      'Susunan kubus: lapisan bawah penuh 4×4, lapisan kedua 3×3, lapisan ketiga 2×2, lapisan atas 1 kubus. Berapa kubus TAMBAHAN agar menjadi kubus utuh 4×4×4?',
    svg: SVG_KUBUS3,
    pilihan: ['30 kubus', '34 kubus', '38 kubus', '44 kubus'], kunci: 1,
  },

  /* ══ LOGIKA (8 slot · 2 mudah · 4 sedang · 2 sulit) ════════════════════ */
  {
    id: 'l-01a', slot: 'l-01', kategori: 'logika', tingkat: 'mudah',
    tanya:
      'Semua mesin di Lini A memakai sensor optik. Sebagian mesin bersensor optik butuh kalibrasi mingguan. Mesin X berada di Lini A. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Mesin X pasti butuh kalibrasi mingguan.',
      'Mesin X tidak butuh kalibrasi mingguan.',
      'Mesin X memakai sensor optik.',
      'Semua mesin bersensor optik berada di Lini A.',
    ],
    kunci: 2,
  },
  {
    id: 'l-01b', slot: 'l-01', kategori: 'logika', tingkat: 'mudah',
    tanya:
      'Semua teknisi bersertifikat wajib memakai helm putih. Sebagian pemakai helm putih bertugas shift malam. Budi adalah teknisi bersertifikat. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Budi memakai helm putih.',
      'Budi bertugas shift malam.',
      'Budi tidak bertugas shift malam.',
      'Semua pemakai helm putih adalah teknisi bersertifikat.',
    ],
    kunci: 0,
  },
  {
    id: 'l-02a', slot: 'l-02', kategori: 'logika', tingkat: 'mudah',
    tanya:
      'Pekerja wajib memakai troli hidrolik jika berat barang lebih dari 20 kg ATAU kemasannya tidak simetris. Riko memindahkan kotak 14 kg dengan kemasan tidak simetris. Kesimpulan yang benar:',
    pilihan: [
      'Tidak perlu troli karena berat di bawah 20 kg.',
      'Wajib troli karena salah satu syarat terpenuhi.',
      'Wajib troli hanya jika berat 20 kg dan tidak simetris sekaligus.',
      'Barang tidak boleh dipindahkan.',
    ],
    kunci: 1,
  },
  {
    id: 'l-02b', slot: 'l-02', kategori: 'logika', tingkat: 'mudah',
    tanya:
      'Helm wajib dipakai jika ketinggian kerja lebih dari 2 meter ATAU ada kemungkinan benda jatuh dari atas. Riko bekerja pada ketinggian 1,5 meter di area yang ada kemungkinan benda jatuh. Kesimpulan yang benar:',
    pilihan: [
      'Tidak wajib helm karena di bawah 2 meter.',
      'Wajib helm karena salah satu syarat terpenuhi.',
      'Wajib helm hanya jika ketinggian lebih dari 2 meter.',
      'Riko tidak boleh bekerja di area itu.',
    ],
    kunci: 1,
  },
  {
    id: 'l-03a', slot: 'l-03', kategori: 'logika', tingkat: 'sedang',
    tanya:
      'Jika katup pengaman bocor, indikator tekanan akan turun di bawah 4 bar. Saat diperiksa, tekanan stabil di 5,5 bar. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Katup pengaman tidak bocor.',
      'Layar indikator rusak.',
      'Katup bocor sedikit.',
      'Jika katup tidak bocor, tekanan selalu 5,5 bar.',
    ],
    kunci: 0,
  },
  {
    id: 'l-03b', slot: 'l-03', kategori: 'logika', tingkat: 'sedang',
    tanya:
      'Jika filter tersumbat, laju aliran cairan akan turun di bawah 10 liter/menit. Saat diukur, laju aliran tetap 14 liter/menit. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Filter tidak tersumbat.',
      'Alat ukur aliran rusak.',
      'Filter tersumbat sebagian.',
      'Jika filter tidak tersumbat, aliran selalu 14 liter/menit.',
    ],
    kunci: 0,
  },
  {
    id: 'l-04a', slot: 'l-04', kategori: 'logika', tingkat: 'sedang',
    tanya:
      'Lima komponen P, Q, R, S, T dipasang berurutan tahap 1–5. Aturan: R tepat satu tahap sebelum T; P tidak di tahap 1 maupun 5; Q harus di tahap 1; S di tahap 5. Urutan yang memenuhi:',
    pilihan: ['P - Q - R - T - S', 'Q - R - T - S - P', 'Q - P - R - T - S', 'R - T - Q - P - S'],
    kunci: 2,
  },
  {
    id: 'l-04b', slot: 'l-04', kategori: 'logika', tingkat: 'sedang',
    tanya:
      'Lima komponen P, Q, R, S, T dipasang berurutan tahap 1–5. Aturan: R tepat satu tahap sebelum S; P harus di tahap 5; Q dipasang sebelum R; T harus di tahap 4. Urutan yang memenuhi:',
    pilihan: ['Q - R - S - T - P', 'Q - R - T - S - P', 'R - S - Q - T - P', 'Q - T - R - S - P'],
    kunci: 0,
  },
  {
    id: 'l-05a', slot: 'l-05', kategori: 'logika', tingkat: 'sedang',
    tanya:
      'Semua kandidat yang lulus seleksi akhir wajib mengikuti pelatihan bahasa. Tidak ada peserta yang terlambat mengumpulkan berkas yang lulus seleksi akhir. Rian terlambat mengumpulkan berkas. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Rian tetap lulus dengan pengurangan nilai.',
      'Rian dinyatakan tidak lulus seleksi akhir.',
      'Sebagian peserta yang terlambat tetap lulus.',
      'Semua peserta pelatihan pernah terlambat.',
    ],
    kunci: 1,
  },
  {
    id: 'l-05b', slot: 'l-05', kategori: 'logika', tingkat: 'sedang',
    tanya:
      'Semua peserta ujian wajib memakai kartu identitas. Tidak ada pemakai kartu identitas yang boleh masuk laboratorium tanpa izin tertulis. Sari tidak memakai kartu identitas. Kesimpulan yang PASTI benar:',
    pilihan: [
      'Sari bukan peserta ujian.',
      'Sari tidak boleh masuk laboratorium tanpa izin tertulis.',
      'Sari boleh masuk laboratorium kapan saja.',
      'Semua pemakai kartu adalah peserta ujian.',
    ],
    kunci: 1,
  },
  {
    id: 'l-06a', slot: 'l-06', kategori: 'logika', tingkat: 'sedang',
    tanya:
      'Aturan: suhu >85°C dan getaran tinggi → ganti bearing; suhu >85°C dan getaran normal → tambah coolant; suhu ≤85°C dan getaran tinggi → kencangkan baut dudukan. Panel menunjukkan 83°C dengan getaran tinggi. Tindakan yang wajib:',
    pilihan: ['Ganti bearing utama', 'Tambah cairan coolant', 'Kencangkan baut dudukan', 'Matikan sensor suhu'],
    kunci: 2,
  },
  {
    id: 'l-06b', slot: 'l-06', kategori: 'logika', tingkat: 'sedang',
    tanya:
      'Aturan: suhu >85°C dan getaran tinggi → ganti bearing; suhu >85°C dan getaran normal → tambah coolant; suhu ≤85°C dan getaran tinggi → kencangkan baut dudukan. Panel menunjukkan 91°C dengan getaran normal. Tindakan yang wajib:',
    pilihan: ['Ganti bearing utama', 'Tambah cairan coolant', 'Kencangkan baut dudukan', 'Matikan mesin'],
    kunci: 1,
  },
  {
    id: 'l-07a', slot: 'l-07', kategori: 'logika', tingkat: 'sulit',
    tanya:
      'Lima teknisi piket Senin–Jumat, satu orang per hari. Aturan: Cakra piket tepat dua hari setelah Andi; Bima tidak boleh Senin maupun Selasa; Doni piket tepat satu hari sebelum Eka. Siapa yang PASTI piket hari Rabu?',
    pilihan: ['Andi', 'Bima', 'Cakra', 'Eka'], kunci: 0,
  },
  {
    id: 'l-07b', slot: 'l-07', kategori: 'logika', tingkat: 'sulit',
    tanya:
      'Lima teknisi piket Senin–Jumat, satu orang per hari. Aturan: Cakra piket tepat dua hari setelah Andi; Bima tidak boleh Kamis maupun Jumat; Doni piket tepat satu hari sebelum Eka. Siapa yang PASTI piket hari Kamis?',
    pilihan: ['Doni', 'Bima', 'Cakra', 'Eka'], kunci: 0,
  },
  {
    id: 'l-08a', slot: 'l-08', kategori: 'logika', tingkat: 'sulit',
    tanya:
      'Kesalahan pencatatan stok hanya mungkin dilakukan satu orang di antara Tono, Dani, Reza. Tono: "Bukan saya." Dani: "Reza pelakunya." Reza: "Pernyataan Dani bohong." Hanya SATU orang berkata jujur. Siapa pelakunya?',
    pilihan: ['Tono', 'Dani', 'Reza', 'Tidak dapat ditentukan'],
    kunci: 0,
  },
  {
    id: 'l-08b', slot: 'l-08', kategori: 'logika', tingkat: 'sulit',
    tanya:
      'Kerusakan mesin hanya mungkin dilakukan satu orang di antara Agus, Bayu, Cepi. Agus: "Bayu pelakunya." Bayu: "Cepi pelakunya." Cepi: "Pernyataan Bayu bohong." Hanya SATU orang berkata jujur. Siapa pelakunya?',
    pilihan: ['Agus', 'Bayu', 'Cepi', 'Tidak dapat ditentukan'],
    kunci: 0,
  },
];

/* ── Pemilih soal ──────────────────────────────────────────────────────── */

/**
 * PRNG deterministik (Mulberry32) dari string seed. Bukan untuk keamanan —
 * hanya butuh sifat "seed sama ⇒ urutan sama".
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

const KATEGORI: KategoriIq[] = ['verbal', 'numerik', 'spasial', 'logika'];

/**
 * 40 soal untuk satu siswa: satu varian per slot, deterministik dari nomor WA.
 *
 * Komposisi (12/12/8/8) DIJAMIN sama untuk semua siswa karena yang dipilih
 * adalah slotnya, bukan sekadar "12 soal acak dari 24". Variannya yang berbeda.
 */
export function pilihSoalIq(wa: string, salt = VERSI_BANK_IQ): SoalIq[] {
  const hasil: SoalIq[] = [];
  for (const kat of KATEGORI) {
    const perSlot = new Map<string, SoalIq[]>();
    for (const s of BANK_IQ) {
      if (s.kategori !== kat) continue;
      const isi = perSlot.get(s.slot);
      if (isi) isi.push(s);
      else perSlot.set(s.slot, [s]);
    }
    for (const [slot, varian] of perSlot) {
      const undian = acakDariSeed(`${wa}:${salt}:${slot}`)();
      const pilih = varian.length > 1 && undian >= 0.5 ? 1 : 0;
      hasil.push(varian[pilih] ?? varian[0]);
    }
  }
  return hasil;
}

/** Bentuk yang dikirim ke browser: tanpa `kunci`. */
export function soalKlienIq(wa: string): SoalKlienIq[] {
  return pilihSoalIq(wa).map(({ kunci, ...sisa }) => sisa);
}

/** Peta id → soal, untuk penilai. Hanya hidup di server. */
export function kunciIq(wa: string): Map<string, SoalIq> {
  return new Map(pilihSoalIq(wa).map((s) => [s.id, s]));
}
