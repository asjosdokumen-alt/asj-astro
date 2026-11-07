/**
 * tesSeleksi.ts — logika murni dua tes mandiri siswa.
 *
 * KENAPA DI `src/lib`, BUKAN DI KOMPONEN
 * --------------------------------------
 * Seluruh perhitungan berjalan di klien (tes ini harus tetap jalan saat sinyal
 * siswa buruk), dan satu-satunya hal yang layak diuji adalah perhitungannya —
 * bukan tata letaknya. Karena itu bank soal, penskoran MBTI, kunci plate
 * Ishihara, dan rumus Landolt hidup di sini sebagai fungsi murni; komponen
 * hanya menggambar dan memanggil.
 *
 * Yang TIDAK ada di sini: kebenaran hasil. Server menyimpan apa yang dikirim
 * klien setelah memeriksa bentuk dan rentangnya (`_lib/asesmen/tes.ts`). Untuk
 * MBTI itu memang benar — tidak ada jawaban benar. Untuk Ishihara/visus, skor
 * dihitung dari jawaban yang diberikan siswa di perangkatnya sendiri; tes ini
 * adalah SARINGAN MANDIRI, bukan pengganti MCU.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. MBTI — 40 soal, 4 dimensi, 5 positif + 5 terbalik per dimensi
// ═══════════════════════════════════════════════════════════════════════════

export type Dimensi = 'EI' | 'SN' | 'TF' | 'JP';

export interface SoalMbti {
  id: number;
  dimensi: Dimensi;
  /** 1 = mengarah ke kutub pertama (E/S/T/J), -1 = kutub kedua (I/N/F/P). */
  arah: 1 | -1;
  teks: string;
}

/**
 * Urutan soal SENGAJA berselang-seling antar dimensi, bukan 10 EI lalu 10 SN.
 * Kalau satu dimensi muncul berurutan, siswa bisa "masuk mode" menjawab satu
 * gaya dan hasilnya menjadi artefak urutan, bukan kepribadian.
 *
 * Separuh soal terbalik (`arah: -1`) supaya pola "selalu pilih paling kanan"
 * tidak menghasilkan tipe yang sama untuk semua orang.
 */
export const SOAL_MBTI: SoalMbti[] = [
  { id: 1, dimensi: 'EI', arah: 1, teks: 'Saya merasa lebih bersemangat setelah bekerja atau berdiskusi bersama banyak orang.' },
  { id: 2, dimensi: 'SN', arah: 1, teks: 'Saya lebih mudah percaya pada langkah kerja yang sudah terbukti daripada ide yang belum dicoba.' },
  { id: 3, dimensi: 'TF', arah: -1, teks: 'Saat rekan kerja melakukan kesalahan, saya memikirkan perasaannya sebelum menyampaikan teguran.' },
  { id: 4, dimensi: 'JP', arah: 1, teks: 'Saya membuat rencana harian dan merasa gelisah bila rencana itu meleset.' },
  { id: 5, dimensi: 'EI', arah: -1, teks: 'Setelah seharian beraktivitas, saya butuh waktu sendiri untuk memulihkan tenaga.' },
  { id: 6, dimensi: 'SN', arah: -1, teks: 'Saya sering membayangkan cara baru menyelesaikan pekerjaan yang sudah rutin.' },
  { id: 7, dimensi: 'TF', arah: 1, teks: 'Keputusan kerja sebaiknya diambil dengan data dan aturan, bukan dengan perasaan.' },
  { id: 8, dimensi: 'JP', arah: -1, teks: 'Saya lebih nyaman menyesuaikan diri dengan situasi daripada terikat jadwal yang kaku.' },
  { id: 9, dimensi: 'EI', arah: 1, teks: 'Saya biasanya orang yang pertama menyapa saat bertemu orang baru.' },
  { id: 10, dimensi: 'SN', arah: 1, teks: 'Saya teliti pada angka, ukuran, dan detail kecil di lapangan.' },
  { id: 11, dimensi: 'TF', arah: -1, teks: 'Suasana tim yang harmonis lebih penting bagi saya daripada menang berdebat.' },
  { id: 12, dimensi: 'JP', arah: 1, teks: 'Saya menyelesaikan tugas jauh sebelum tenggat waktu.' },
  { id: 13, dimensi: 'EI', arah: -1, teks: 'Saya lebih suka mengamati dulu daripada langsung berbicara dalam kelompok baru.' },
  { id: 14, dimensi: 'SN', arah: -1, teks: 'Saya lebih tertarik pada gambaran besar dan kemungkinan ke depan daripada rincian teknis.' },
  { id: 15, dimensi: 'TF', arah: 1, teks: 'Saat dikritik atasan, saya fokus pada isi koreksinya, bukan pada cara penyampaiannya.' },
  { id: 16, dimensi: 'JP', arah: -1, teks: 'Saya justru lebih fokus saat bekerja mendekati tenggat waktu.' },
  { id: 17, dimensi: 'EI', arah: 1, teks: 'Saya cepat akrab dan mudah mengobrol dengan orang yang baru dikenal.' },
  { id: 18, dimensi: 'SN', arah: 1, teks: 'Saya lebih suka instruksi kerja yang rinci dan berurutan (SOP).' },
  { id: 19, dimensi: 'TF', arah: -1, teks: 'Saya mudah ikut merasakan kesulitan orang lain dan ingin segera membantu.' },
  { id: 20, dimensi: 'JP', arah: 1, teks: 'Meja kerja dan peralatan saya selalu kembali ke tempat yang sama.' },
  { id: 21, dimensi: 'EI', arah: -1, teks: 'Saya lebih nyaman menyampaikan pendapat setelah memikirkannya sendiri dengan tenang.' },
  { id: 22, dimensi: 'SN', arah: -1, teks: 'Saya suka mencari pola atau alasan di balik aturan, bukan sekadar menghafalnya.' },
  { id: 23, dimensi: 'TF', arah: 1, teks: 'Saya menilai keadilan dari aturan yang sama untuk semua orang.' },
  { id: 24, dimensi: 'JP', arah: -1, teks: 'Saya membiarkan beberapa pilihan tetap terbuka sampai saat terakhir.' },
  { id: 25, dimensi: 'EI', arah: 1, teks: 'Bekerja di lingkungan yang ramai membuat saya lebih produktif.' },
  { id: 26, dimensi: 'SN', arah: 1, teks: 'Saya mengingat kejadian nyata lebih baik daripada teori yang saya baca.' },
  { id: 27, dimensi: 'TF', arah: -1, teks: 'Pujian dan dukungan dari tim membuat saya jauh lebih bersemangat bekerja.' },
  { id: 28, dimensi: 'JP', arah: 1, teks: 'Saya tidak nyaman membiarkan keputusan penting menggantung tanpa kepastian.' },
  { id: 29, dimensi: 'EI', arah: -1, teks: 'Saya hanya bercerita tentang hal pribadi kepada sedikit orang yang benar-benar dekat.' },
  { id: 30, dimensi: 'SN', arah: -1, teks: 'Saya mudah bosan bila mengerjakan hal yang sama persis setiap hari.' },
  { id: 31, dimensi: 'TF', arah: 1, teks: 'Saya lebih yakin pada argumen yang didukung angka daripada cerita yang menyentuh.' },
  { id: 32, dimensi: 'JP', arah: -1, teks: 'Saya lebih suka langsung mengerjakan sesuatu sambil belajar di tengah jalan.' },
  { id: 33, dimensi: 'EI', arah: 1, teks: 'Saya menemukan solusi lebih cepat bila membicarakannya keras-keras dengan orang lain.' },
  { id: 34, dimensi: 'SN', arah: 1, teks: 'Pekerjaan yang berulang tidak membuat saya cepat bosan asalkan hasilnya jelas.' },
  { id: 35, dimensi: 'TF', arah: -1, teks: 'Saya mempertimbangkan dampak keputusan terhadap perasaan orang lain sebelum memutuskan.' },
  { id: 36, dimensi: 'JP', arah: 1, teks: 'Saya menyiapkan alat dan langkah kerja sebelum mulai, bukan sambil berjalan.' },
  { id: 37, dimensi: 'EI', arah: -1, teks: 'Saya paling fokus di tempat yang tenang dengan sedikit gangguan sosial.' },
  { id: 38, dimensi: 'SN', arah: -1, teks: 'Saya senang memikirkan kemungkinan yang belum pernah dicoba orang lain.' },
  { id: 39, dimensi: 'TF', arah: 1, teks: 'Saya menegur kesalahan teknis secara langsung agar tidak terulang.' },
  { id: 40, dimensi: 'JP', arah: -1, teks: 'Saya tidak keberatan dengan sedikit ketidakteraturan selama saya tahu letak barang saya.' },
];

export interface ProfilMbti {
  tipe: string;
  judul: string;
  ringkas: string;
  bidang: string[];
  mensetsu: string;
}

/**
 * Pemetaan bidang kerja Jepang. Sumbernya bukan tebakan: bidang-bidang ini
 * adalah yang benar-benar ada di loker LPK (kaigo, pengolahan makanan,
 * manufaktur, konstruksi, pertanian, perhotelan) — bukan daftar profesi umum.
 */
export const PROFIL_MBTI: Record<string, ProfilMbti> = {
  ISTJ: {
    tipe: 'ISTJ',
    judul: 'Pekerja Teliti yang Bisa Diandalkan',
    ringkas: 'Disiplin, konsisten, dan sangat patuh prosedur. Kuat pada pekerjaan yang menuntut ketepatan berulang.',
    bidang: ['Manufaktur & perakitan', 'Inspeksi kualitas (QC)', 'Pengolahan makanan', 'Logistik & gudang'],
    mensetsu: 'Tekankan kedisiplinan waktu, ketahanan pada pekerjaan presisi, dan kesiapan mengikuti SOP tanpa banyak alasan.',
  },
  ISFJ: {
    tipe: 'ISFJ',
    judul: 'Pendamping Sabar dan Telaten',
    ringkas: 'Tenang, perhatian pada detail kebutuhan orang lain, dan setia pada tugas jangka panjang.',
    bidang: ['Kaigo (perawatan lansia)', 'Pengolahan makanan', 'Perhotelan / akomodasi', 'Kebersihan gedung'],
    mensetsu: 'Tunjukkan kesabaran menghadapi orang dan pemahaman omotenashi — melayani tanpa menunggu diminta.',
  },
  INFJ: {
    tipe: 'INFJ',
    judul: 'Perencana yang Peka',
    ringkas: 'Empati mendalam tetapi tetap terstruktur; cocok pada pekerjaan yang menuntut kepedulian sekaligus disiplin.',
    bidang: ['Kaigo (perawatan lansia)', 'Perhotelan', 'Pertanian terpadu', 'Administrasi & penerjemahan'],
    mensetsu: 'Tekankan kemampuan mendengarkan instruksi dan komitmen tinggal lama di satu perusahaan.',
  },
  INTJ: {
    tipe: 'INTJ',
    judul: 'Analis yang Mandiri',
    ringkas: 'Cepat memahami sistem dan mesin rumit, punya standar kerja tinggi, dan tidak perlu diawasi terus-menerus.',
    bidang: ['Permesinan CNC', 'Kelistrikan & elektronik', 'Perawatan mesin', 'Konstruksi teknis'],
    mensetsu: 'Tunjukkan hormat pada senior dan kemauan mengikuti aturan dasar sebelum mengusulkan perbaikan.',
  },
  ISTP: {
    tipe: 'ISTP',
    judul: 'Teknisi Praktis yang Tenang',
    ringkas: 'Terampil dengan alat dan tangan, tetap tenang saat ada gangguan teknis mendadak.',
    bidang: ['Otomotif & perbengkelan', 'Pengelasan', 'Konstruksi & alat berat', 'Pengecoran logam'],
    mensetsu: 'Beri contoh nyata keahlian tangan, dan jawab dengan suara jelas — bukan bergumam.',
  },
  ISFP: {
    tipe: 'ISFP',
    judul: 'Pekerja Halus dan Adaptif',
    ringkas: 'Rapi, telaten, rendah hati, dan mudah menyesuaikan diri dengan lingkungan baru.',
    bidang: ['Pengolahan makanan (bento/sashimi)', 'Pengecatan', 'Pertanian & perkebunan', 'Tekstil & garmen'],
    mensetsu: 'Perbaiki postur dan kontak mata; keramahan yang tenang adalah kekuatan, bukan kekurangan.',
  },
  INFP: {
    tipe: 'INFP',
    judul: 'Pekerja Tulus yang Loyal',
    ringkas: 'Menghindari konflik, sangat loyal saat dihargai, dan tekun pada pekerjaan yang bermakna.',
    bidang: ['Kaigo (perawatan lansia)', 'Pertanian & hortikultura', 'Pengemasan produk', 'Perhotelan'],
    mensetsu: 'Yakinkan pewawancara bahwa kamu siap bekerja cepat di bawah target, bukan hanya suasana yang tenang.',
  },
  INTP: {
    tipe: 'INTP',
    judul: 'Pemecah Masalah yang Logis',
    ringkas: 'Kuat menganalisis kerusakan dan spesifikasi teknis; lebih nyaman dengan data daripada dengan orang banyak.',
    bidang: ['Inspeksi produk', 'Perakitan komponen presisi', 'Operator mesin industri', 'Kelistrikan'],
    mensetsu: 'Jawab ringkas dan langsung ke inti, lalu tunjukkan kesiapan fisik untuk kerja lapangan.',
  },
  ESTP: {
    tipe: 'ESTP',
    judul: 'Pelaksana Lapangan yang Cepat',
    ringkas: 'Enerjik, berani mengambil tindakan, dan tidak panik di bawah tekanan.',
    bidang: ['Konstruksi (scaffolding)', 'Perikanan & kelautan', 'Otomotif', 'Logistik & bongkar muat'],
    mensetsu: 'Kendalikan spontanitas; tekankan bahwa kamu selalu mengutamakan keselamatan kerja (安全第一).',
  },
  ESFP: {
    tipe: 'ESFP',
    judul: 'Penyemangat Tim',
    ringkas: 'Ramah, aktif, dan cepat membuat orang lain nyaman — kuat pada pekerjaan yang berhadapan dengan orang.',
    bidang: ['Restoran & food service', 'Kaigo (perawatan lansia)', 'Perhotelan', 'Pengolahan makanan'],
    mensetsu: 'Senyum dan salam yang bersemangat adalah kekuatanmu; jaga tetap sopan dan formal.',
  },
  ENFP: {
    tipe: 'ENFP',
    judul: 'Komunikator yang Cepat Akrab',
    ringkas: 'Mudah beradaptasi dengan budaya baru, cepat lancar percakapan, dan penuh inisiatif.',
    bidang: ['Perhotelan & resepsionis', 'Restoran & food service', 'Kaigo (perawatan lansia)', 'Pertanian kelompok'],
    mensetsu: 'Tunjukkan bahwa kamu mampu bertahan pada pekerjaan rutin sampai kontrak selesai.',
  },
  ENTP: {
    tipe: 'ENTP',
    judul: 'Inovator yang Lincah',
    ringkas: 'Cepat memahami instruksi baru dan pandai mencari jalan keluar saat ada kendala di lapangan.',
    bidang: ['Manufaktur otomotif', 'Konstruksi modern', 'Perawatan gedung', 'Logistik bandara'],
    mensetsu: 'Hindari berdebat; tunjukkan sikap rendah hati dan siap belajar dari nol dengan cara Jepang.',
  },
  ESTJ: {
    tipe: 'ESTJ',
    judul: 'Koordinator yang Tegas',
    ringkas: 'Terorganisir, berorientasi target, dan tegas menjalankan aturan — cocok memimpin regu kecil.',
    bidang: ['Manufaktur pabrik', 'Konstruksi', 'Lini pengolahan makanan', 'Logistik & pergudangan'],
    mensetsu: 'Tunjukkan kepemimpinan yang kooperatif dan kesiapan menjadi jembatan antara pekerja Indonesia dan atasan Jepang.',
  },
  ESFJ: {
    tipe: 'ESFJ',
    judul: 'Penjaga Harmoni Tim',
    ringkas: 'Sangat peduli kekompakan, sopan, dan rajin membantu rekan kerja tanpa diminta.',
    bidang: ['Kaigo (perawatan lansia)', 'Restoran & katering', 'Perhotelan', 'Pengolahan makanan'],
    mensetsu: 'Tonjolkan kerja sama tim dan kebiasaan menjaga kebersihan fasilitas bersama di asrama.',
  },
  ENFJ: {
    tipe: 'ENFJ',
    judul: 'Mentor yang Hangat',
    ringkas: 'Komunikatif, bertanggung jawab pada kelompok, dan mudah dipercaya atasan maupun rekan.',
    bidang: ['Kaigo (perawatan lansia)', 'Perhotelan', 'Food service', 'Koordinator lapangan'],
    mensetsu: 'Tunjukkan semangat belajar bahasa Jepang sampai N3/N2 dan kesiapan membimbing rekan satu angkatan.',
  },
  ENTJ: {
    tipe: 'ENTJ',
    judul: 'Komandan yang Efisien',
    ringkas: 'Bermental kuat, fokus pada hasil, dan cepat menguasai operasional lapangan.',
    bidang: ['Konstruksi berat', 'Manufaktur mesin', 'Perkapalan & pengelasan', 'Manajemen produksi'],
    mensetsu: 'Tunjukkan ketangguhan fisik dan mental, serta kesiapan mematuhi hierarki senioritas Jepang.',
  },
};

export interface HasilMbti {
  tipe: string;
  persentase: Record<'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P', number>;
  jumlahTerjawab: number;
  profil: ProfilMbti;
}

/** Skor maksimum satu dimensi: 10 soal × bobot 2. */
const MAKS_DIMENSI = 20;

/**
 * Hitung tipe dari jawaban. `jawaban` = id soal → -2..+2.
 *
 * Soal yang belum dijawab dianggap 0 (netral) — bukan dilewati — supaya
 * persentase tetap bisa dibandingkan antar siswa dengan jumlah jawaban sama.
 */
export function hitungMbti(jawaban: Record<number, number>): HasilMbti {
  const skor: Record<Dimensi, number> = { EI: 0, SN: 0, TF: 0, JP: 0 };
  let terjawab = 0;
  for (const soal of SOAL_MBTI) {
    const nilai = jawaban[soal.id];
    if (typeof nilai === 'number' && Number.isFinite(nilai)) terjawab += 1;
    const dipakai = Math.max(-2, Math.min(2, Number(nilai) || 0));
    skor[soal.dimensi] += dipakai * soal.arah;
  }
  const pct = (s: number) => Math.round(((s + MAKS_DIMENSI) / (MAKS_DIMENSI * 2)) * 100);
  const E = pct(skor.EI);
  const S = pct(skor.SN);
  const T = pct(skor.TF);
  const J = pct(skor.JP);
  const tipe = [E >= 50 ? 'E' : 'I', S >= 50 ? 'S' : 'N', T >= 50 ? 'T' : 'F', J >= 50 ? 'J' : 'P'].join('');
  return {
    tipe,
    persentase: { E, I: 100 - E, S, N: 100 - S, T, F: 100 - T, J, P: 100 - J },
    jumlahTerjawab: terjawab,
    profil: PROFIL_MBTI[tipe] || PROFIL_MBTI.ISTJ,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ISHIHARA — 12 plate: 1 kontrol, 4 transformasi, 4 hilang, 3 diagnostik
// ═══════════════════════════════════════════════════════════════════════════

export type KategoriPlate = 'kontrol' | 'transformasi' | 'hilang' | 'diagnostik';

export interface PlateIshihara {
  no: number;
  kategori: KategoriPlate;
  /** Jawaban mata normal. */
  normal: string;
  /** Jawaban khas defisiensi merah-hijau; `null` = tidak melihat angka. */
  defisiensi: string | null;
  /** Khusus plate diagnostik: jawaban protanopia (hanya digit kanan). */
  protan?: string;
  /** Khusus plate diagnostik: jawaban deuteranopia (hanya digit kiri). */
  deutan?: string;
  /** Palet titik latar (hijau), dipakai generator canvas. */
  latar: string[];
  /** Palet titik angka (jingga/merah), dipakai generator canvas. */
  angka: string[];
  /** Palet digit kedua pada plate diagnostik (merah-ungu). */
  angka2?: string[];
}

/**
 * Kunci plate. Nilai `normal` diambil dari plate Ishihara edisi 24 yang
 * bacanya tidak ambigu; plate yang bacaannya berbeda antar edisi sengaja
 * TIDAK dimasukkan. Salah satu kunci saja akan membuat mata normal dinyatakan
 * buta warna — kesalahan yang jauh lebih mahal daripada satu plate kurang.
 *
 * Plate 1 WAJIB pertama dan wajib benar: ia memvalidasi layar, jarak, dan
 * kesungguhan peserta sebelum hasil lain dipercaya.
 */
export const PLATE_ISHIHARA: PlateIshihara[] = [
  {
    no: 1,
    kategori: 'kontrol',
    normal: '12',
    defisiensi: '12',
    latar: ['#4a7c59', '#5b8e6a', '#3d6b4b', '#6a9a77'],
    angka: ['#e06a3b', '#ea7b4f', '#d45a2a'],
  },
  {
    no: 2,
    kategori: 'transformasi',
    normal: '8',
    defisiensi: '3',
    latar: ['#7d9d61', '#8fa96f', '#6b8b50', '#a3b882'],
    angka: ['#d96b43', '#e37c57', '#c85a32'],
  },
  {
    no: 3,
    kategori: 'transformasi',
    normal: '29',
    defisiensi: '70',
    latar: ['#75965a', '#88a66c', '#64844a', '#9ab07c'],
    angka: ['#df7048', '#e9825c', '#ce6038'],
  },
  {
    no: 4,
    kategori: 'transformasi',
    normal: '5',
    defisiensi: '2',
    latar: ['#6e9155', '#82a268', '#95b17c', '#5d7f46'],
    angka: ['#d66840', '#e27a53', '#c45730'],
  },
  {
    no: 5,
    kategori: 'transformasi',
    normal: '74',
    defisiensi: '21',
    latar: ['#789a5e', '#8cab72', '#66874c', '#9fb587'],
    angka: ['#dc6d45', '#e67f59', '#ca5c35'],
  },
  {
    no: 6,
    kategori: 'hilang',
    normal: '45',
    defisiensi: null,
    latar: ['#7f9b62', '#91ac75', '#6e8951', '#a2b986'],
    angka: ['#d87e59', '#e28e6b', '#c86e49'],
  },
  {
    no: 7,
    kategori: 'hilang',
    normal: '16',
    defisiensi: null,
    latar: ['#829e64', '#94af78', '#708b53', '#a5bb89'],
    angka: ['#d67c57', '#e08c6a', '#c66c47'],
  },
  {
    no: 8,
    kategori: 'hilang',
    normal: '73',
    defisiensi: null,
    latar: ['#7a965d', '#8ca771', '#69844c', '#9db381'],
    angka: ['#d97a54', '#e38a67', '#c96a44'],
  },
  {
    no: 9,
    kategori: 'hilang',
    normal: '97',
    defisiensi: null,
    latar: ['#849f66', '#96b07a', '#728d55', '#a7bd8b'],
    angka: ['#d57752', '#df8764', '#c56742'],
  },
  {
    no: 10,
    kategori: 'diagnostik',
    normal: '26',
    defisiensi: '6',
    protan: '6',
    deutan: '2',
    latar: ['#7a7e78', '#8b8f89', '#696d67', '#9a9e98'],
    angka: ['#d8524b', '#e2635c'],
    angka2: ['#c85a92', '#d46ba0'],
  },
  {
    no: 11,
    kategori: 'diagnostik',
    normal: '42',
    defisiensi: '2',
    protan: '2',
    deutan: '4',
    latar: ['#787c76', '#898d87', '#676b65', '#989c96'],
    angka: ['#d65049', '#e0615a'],
    angka2: ['#c65890', '#d2699e'],
  },
  {
    no: 12,
    kategori: 'diagnostik',
    normal: '35',
    defisiensi: '5',
    protan: '5',
    deutan: '3',
    latar: ['#7c807a', '#8d918b', '#6b6f69', '#9ca09a'],
    angka: ['#d44e47', '#de5f58'],
    angka2: ['#c4568e', '#d0679c'],
  },
];

export type StatusIshihara =
  | 'NORMAL'
  | 'TIDAK_VALID'
  | 'PROTAN'
  | 'DEUTAN'
  | 'DEFISIENSI_MERAH_HIJAU';

export interface HasilIshihara {
  skor: number;
  total: number;
  status: StatusIshihara;
  /** Label pendek untuk ringkasan server. */
  label: string;
  kontrolBenar: boolean;
}

export interface JawabanPlate {
  no: number;
  jawaban: string;
}

const LABEL_STATUS: Record<StatusIshihara, string> = {
  NORMAL: 'Normal',
  TIDAK_VALID: 'Tidak valid (plate kontrol salah)',
  PROTAN: 'Indikasi protan (lemah merah)',
  DEUTAN: 'Indikasi deutan (lemah hijau)',
  DEFISIENSI_MERAH_HIJAU: 'Indikasi defisiensi merah-hijau',
};

/**
 * Evaluasi jawaban.
 *
 * Ambang "normal" = 10 dari 12 (≈83%), mengikuti aturan klinis yang lazim
 * (mayoritas plate benar). Plate kontrol yang salah membuat SELURUH hasil
 * tidak valid: itu bisa berarti layar di-filter, jarak salah, atau peserta
 * menebak — tiga hal yang membuat plate lain tidak berarti.
 */
export function evaluasiIshihara(jawaban: JawabanPlate[]): HasilIshihara {
  const total = PLATE_ISHIHARA.length;
  const peta = new Map(jawaban.map((j) => [j.no, String(j.jawaban || '').trim().toUpperCase()]));
  let skor = 0;
  let protan = 0;
  let deutan = 0;
  for (const plate of PLATE_ISHIHARA) {
    const jawab = peta.get(plate.no) || '';
    if (jawab === plate.normal) skor += 1;
    if (plate.kategori === 'diagnostik') {
      if (plate.protan && jawab === plate.protan) protan += 1;
      if (plate.deutan && jawab === plate.deutan) deutan += 1;
    }
  }
  const kontrolBenar = (peta.get(1) || '') === PLATE_ISHIHARA[0].normal;
  let status: StatusIshihara;
  if (!kontrolBenar) status = 'TIDAK_VALID';
  else if (skor >= total - 2) status = 'NORMAL';
  else if (protan > deutan) status = 'PROTAN';
  else if (deutan > protan) status = 'DEUTAN';
  else status = 'DEFISIENSI_MERAH_HIJAU';
  return { skor, total, status, label: LABEL_STATUS[status], kontrolBenar };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LANDOLT C — ukuran cincin dari sudut visual 1 menit busur
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tingkat visus desimal yang diuji, dari teringan ke terberat. Sama dengan
 * tabel 視力検査 Jepang yang dipakai MCU (0,1–1,2).
 */
export const TINGKAT_VISUS = [0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.2] as const;

export type ArahLandolt = 'ATAS' | 'BAWAH' | 'KIRI' | 'KANAN';

/**
 * Ukuran celah & diameter cincin dalam piksel.
 *
 * Rumus: celah = 0,2909 × jarak(m) / visus, dalam milimeter. Konstanta itu
 * berasal dari sudut 1 menit busur (1/60 derajat): tan(1′) × 1000 mm ≈ 0,2909.
 * Diameter total = 5 × celah, tebal garis = 1 × celah — perbandingan baku
 * optotipe Landolt.
 *
 * `pxPerMm` didapat dari kalibrasi KTP (85,6 mm) di layar, jadi angka ini
 * benar di layar mana pun tanpa asumsi DPI perangkat.
 */
export function ukuranLandolt(
  visus: number,
  jarakMeter: number,
  pxPerMm: number,
): { celahPx: number; diameterPx: number; tebalPx: number; terlaluKecil: boolean } {
  const v = Math.max(0.05, Number(visus) || 0.1);
  const d = Math.max(0.2, Number(jarakMeter) || 0.5);
  const skala = Math.max(0.5, Number(pxPerMm) || 3.4);
  const celahMm = (0.2909 * d) / v;
  const diameterMm = celahMm * 5;
  const diameterPx = diameterMm * skala;
  return {
    /* TIDAK dibulatkan ke bawah ke angka "aman". Membesarkan cincin agar
       terlihat jelas justru membuat level tinggi lebih mudah daripada yang
       seharusnya — dan hasilnya menjadi angka yang tidak berarti. Kalau layar
       memang tidak mampu, UI mengatakannya (`terlaluKecil`). */
    celahPx: Math.max(0.6, celahMm * skala),
    diameterPx: Math.max(3, diameterPx),
    tebalPx: Math.max(0.6, celahMm * skala),
    terlaluKecil: diameterPx < 6,
  };
}

export interface HasilVisus {
  kanan: number;
  kiri: number;
  /** true bila kedua mata ≥ 0,7 — ambang lolos mayoritas kumiai. */
  lolos: boolean;
  catatan: string;
}

/**
 * Simpulkan hasil visus dari level terakhir yang lolos per mata.
 * `0` berarti gagal bahkan pada 0,1 — bukan "visus nol", tetapi "di bawah
 * ambang ukur", dan itu harus terbaca jelas di ringkasan.
 */
export function simpulkanVisus(kanan: number, kiri: number): HasilVisus {
  const min = Math.min(kanan, kiri);
  const lolos = kanan >= 0.7 && kiri >= 0.7;
  const catatan =
    min <= 0
      ? 'Di bawah 0,1 — perlu pemeriksaan optik sebelum MCU.'
      : lolos
        ? 'Memenuhi ambang 0,7 yang diminta mayoritas perusahaan Jepang.'
        : 'Di bawah 0,7 — disarankan periksa optik dan kacamata sebelum MCU.';
  return { kanan, kiri, lolos, catatan };
}

/* ── Kontras & astigmatisme (saringan, bukan diagnosis) ────────────────────
 *
 * DUA BATAS YANG HARUS TETAP TERTULIS DI UI
 * ------------------------------------------
 *   1. Layar HP tidak bisa mengunci luminansi. Kontras yang dirender adalah
 *      kontras RELATIF terhadap latar putih halaman, bukan angka cd/m². Jadi
 *      hasilnya hanya bisa dibaca sebagai "peka / kurang peka", tidak sebagai
 *      angka klinis.
 *   2. Kipas astigmatisme hanya menandai "perlu diperiksa". Ia tidak mengukur
 *      silinder maupun axis — itu butuh refraktometer.
 */

/** Ambang kontras yang diuji, dari paling jelas ke paling samar. */
export const TINGKAT_KONTRAS = [1, 0.5, 0.25, 0.12, 0.06] as const;

/**
 * Skor = kontras TERENDAH yang masih terbaca benar. `0` berarti gagal bahkan
 * pada 6% — ditulis sebagai 0, bukan "tidak ada", supaya tidak terbaca seperti
 * kesalahan pengisian.
 */
export function simpulkanKontras(kanan: number, kiri: number): { terendah: number; label: string } {
  const terendah = Math.min(Number(kanan) || 0, Number(kiri) || 0);
  const label =
    terendah <= 0.06
      ? 'Sangat peka (masih terbaca pada kontras 6%)'
      : terendah <= 0.12
        ? 'Peka (terbaca sampai kontras 12%)'
        : terendah <= 0.25
          ? 'Cukup (terbaca sampai kontras 25%)'
          : terendah <= 0.5
            ? 'Kurang peka (berhenti di kontras 50%)'
            : 'Perlu diperiksa (hanya terbaca pada kontras penuh)';
  return { terendah, label };
}

/** Arah garis pada kipas astigmatisme, dalam derajat jam. */
export const ARAH_ASTIG = [0, 30, 60, 90, 120, 150] as const;

export interface HasilAstig {
  /** Arah yang dipilih, atau '' bila semua garis tampak sama. */
  kanan: string;
  kiri: string;
  /** true bila ADA mata yang melaporkan garis menonjol. */
  indikasi: boolean;
  catatan: string;
}

export function simpulkanAstig(kanan: string, kiri: string): HasilAstig {
  const ada = Boolean(kanan) || Boolean(kiri);
  return {
    kanan: kanan || '',
    kiri: kiri || '',
    indikasi: ada,
    catatan: ada
      ? 'Ada arah garis yang tampak lebih tebal. Ini BUKAN diagnosis — periksa ulang saat MCU.'
      : 'Semua arah garis tampak sama.',
  };
}
