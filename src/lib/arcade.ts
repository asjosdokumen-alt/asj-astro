/**
 * arcade.ts — data + logika murni untuk dua game arcade `/arcade`.
 *
 * KENAPA DIPISAH DARI KOMPONEN
 * ---------------------------
 * Kedua game ini punya bagian yang paling mudah salah dan paling mudah diuji
 * tanpa render: PENYUSUN PERINTAH (game 1) dan PEMERIKSA URUTAN (game 2).
 * Menaruhnya di dalam komponen berarti satu-satunya cara mengujinya adalah
 * merender layar dan menebak dari DOM.
 *
 * ASAL DATA
 * ---------
 * Kosakata warna, barang, dan posisi diambil dari rancangan yang dikirim pemilik
 * (2026-11-04). Bahasanya diperiksa satu per satu: `あかい はこ を うえ の たな に
 * おいてください` memang "tolong taruh kotak merah di rak atas". Tidak ada
 * kalimat yang saya karang sendiri.
 *
 * BATAS YANG JUJUR
 * ----------------
 * Hanya 4 warna × 4 barang × 4 lokasi × 2 kata kerja = 128 variasi perintah yang
 * benar secara tata bahasa. Itu CUKUP untuk latihan refleks, tetapi bukan
 * pengganti soal JFT: tidak ada distraktor tata bahasa di sini, hanya salah
 * pilih barang/lokasi.
 */

/** Warna dasar. `jp` sengaja tanpa partikel — perakit kalimat yang menambahkannya. */
export interface WarnaGenba {
  id: string;
  jp: string;
  romaji: string;
  id_: string;
  /** Kelas Tailwind untuk kotak barangnya. */
  kelas: string;
}

export const GENBA_WARNA: readonly WarnaGenba[] = [
  { id: 'akai', jp: 'あかい', romaji: 'akai', id_: 'Merah', kelas: 'bg-red-600 border-red-400' },
  { id: 'aoi', jp: 'あおい', romaji: 'aoi', id_: 'Biru', kelas: 'bg-blue-600 border-blue-400' },
  /* `text-slate-900` WAJIB pada dua warna terang ini. Teks di dalam kotak
     mewarisi `text-fg`, yang berwarna TERANG di tema gelap — di atas latar
     kuning/putih hasilnya nyaris tak terbaca. Ditemukan saat review UI
     2026-11-04 (kelas cacat yang sama dengan yang dijaga `shim-coverage`). */
  /* きいろい memakai teks PUTIH, bukan gelap: latar amber-nya dipetakan tema
     menjadi rgb(180, 83, 9) — cukup gelap sehingga teks gelap hanya mencapai
     3,55:1 (di bawah AA 4,5:1). Teks putih memberi ~5,0:1. Diukur di browser
     pada kedua tema, 2026-11-04. */
  { id: 'kiiroi', jp: 'きいろい', romaji: 'kiiroi', id_: 'Kuning', kelas: 'bg-amber-500 border-amber-300 text-white' },
  { id: 'shiroi', jp: 'しろい', romaji: 'shiroi', id_: 'Putih', kelas: 'bg-slate-200 border-white text-slate-900' },
  { id: 'kuroi', jp: 'くろい', romaji: 'kuroi', id_: 'Hitam', kelas: 'bg-slate-900 border-slate-600 text-white' },
  { id: 'midori', jp: 'みどり', romaji: 'midori', id_: 'Hijau', kelas: 'bg-emerald-600 border-emerald-400 text-white' },
];

export interface BarangGenba {
  id: string;
  jp: string;
  romaji: string;
  id_: string;
  ikon: string;
}

/**
 * Barang yang bisa "ditaruh" — semuanya BENDA FISIK, karena kalimatnya
 * `… を … に おいてください` (tolong letakkan). Kata seperti 元気 atau 予定 tidak
 * bisa masuk daftar ini tanpa membuat kalimatnya salah.
 *
 * Kosakatanya dari N5/Minna, bukan karangan: 16 barang × 6 warna × 8 lokasi
 * = 768 variasi perintah.
 */
export const GENBA_BARANG: readonly BarangGenba[] = [
  { id: 'hako', jp: 'はこ', romaji: 'hako', id_: 'Kotak', ikon: '📦' },
  { id: 'kagi', jp: 'かぎ', romaji: 'kagi', id_: 'Kunci', ikon: '🔑' },
  { id: 'hasami', jp: 'はさみ', romaji: 'hasami', id_: 'Gunting', ikon: '✂️' },
  { id: 'kutsu', jp: 'くつ', romaji: 'kutsu', id_: 'Sepatu', ikon: '👟' },
  { id: 'kaban', jp: 'かばん', romaji: 'kaban', id_: 'Tas', ikon: '🎒' },
  { id: 'kasa', jp: 'かさ', romaji: 'kasa', id_: 'Payung', ikon: '☂️' },
  { id: 'tokei', jp: 'とけい', romaji: 'tokei', id_: 'Jam', ikon: '⌚' },
  { id: 'hon', jp: 'ほん', romaji: 'hon', id_: 'Buku', ikon: '📕' },
  { id: 'nooto', jp: 'ノート', romaji: 'nooto', id_: 'Buku catatan', ikon: '📓' },
  { id: 'pen', jp: 'ペン', romaji: 'pen', id_: 'Pulpen', ikon: '🖊️' },
  { id: 'koppu', jp: 'コップ', romaji: 'koppu', id_: 'Gelas', ikon: '🥤' },
  { id: 'sara', jp: 'さら', romaji: 'sara', id_: 'Piring', ikon: '🍽️' },
  { id: 'taoru', jp: 'タオル', romaji: 'taoru', id_: 'Handuk', ikon: '🧺' },
  { id: 'boushi', jp: 'ぼうし', romaji: 'boushi', id_: 'Topi', ikon: '🧢' },
  { id: 'saifu', jp: 'さいふ', romaji: 'saifu', id_: 'Dompet', ikon: '👛' },
  { id: 'megane', jp: 'めがね', romaji: 'megane', id_: 'Kacamata', ikon: '👓' },
];

export interface ZonaGenba {
  id: string;
  jp: string;
  romaji: string;
  id_: string;
  /** Ikon arah/lokasi — ditampilkan di tombol rak. */
  ikon: string;
}

export const GENBA_ZONA: readonly ZonaGenba[] = [
  { id: 'ue', jp: 'うえ の たな', romaji: 'ue no tana', id_: 'Rak Atas', ikon: '⬆️' },
  { id: 'shita', jp: 'した の たな', romaji: 'shita no tana', id_: 'Rak Bawah', ikon: '⬇️' },
  { id: 'hidari', jp: 'ひだり の はこ', romaji: 'hidari no hako', id_: 'Kotak Kiri', ikon: '⬅️' },
  { id: 'migi', jp: 'みぎ の はこ', romaji: 'migi no hako', id_: 'Kotak Kanan', ikon: '➡️' },
  { id: 'tsukue', jp: 'つくえ の うえ', romaji: 'tsukue no ue', id_: 'Atas Meja', ikon: '🪑' },
  { id: 'isu', jp: 'いす の した', romaji: 'isu no shita', id_: 'Bawah Kursi', ikon: '🪑' },
  { id: 'doa', jp: 'ドア の ちかく', romaji: 'doa no chikaku', id_: 'Dekat Pintu', ikon: '🚪' },
  { id: 'mado', jp: 'まど の そば', romaji: 'mado no soba', id_: 'Dekat Jendela', ikon: '🪟' },
  { id: 'kaban', jp: 'かばん の なか', romaji: 'kaban no naka', id_: 'Dalam Tas', ikon: '🎒' },
  { id: 'hiki', jp: 'ひきだし の なか', romaji: 'hikidashi no naka', id_: 'Dalam Laci', ikon: '🗄️' },
  { id: 'yuka', jp: 'ゆか の うえ', romaji: 'yuka no ue', id_: 'Di Lantai', ikon: '⬜' },
];

export interface Perintah {
  warna: WarnaGenba;
  barang: BarangGenba;
  zona: ZonaGenba;
  /** Kalimat Jepang lengkap, siap diucapkan TTS. */
  jp: string;
  romaji: string;
}

/** Satu pilihan di meja kerja: kombinasi warna+barang. */
export interface PilihanGenba {
  kunci: string;
  warna: WarnaGenba;
  barang: BarangGenba;
}

const pilih = <T>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length) % arr.length];

/**
 * Rakit satu perintah acak.
 *
 * Urutan kalimatnya tetap: `[warna] [barang] を [lokasi] に おいてください`.
 * Partikel `を` menandai objek, `に` menandai tujuan penempatan — keduanya
 * dipakai benar, bukan sekadar ditempel.
 */
export function buatPerintah(rng: () => number = Math.random): Perintah {
  const warna = pilih(GENBA_WARNA, rng);
  const barang = pilih(GENBA_BARANG, rng);
  const zona = pilih(GENBA_ZONA, rng);
  return {
    warna,
    barang,
    zona,
    jp: `${warna.jp} ${barang.jp} を ${zona.jp} に おいてください`,
    romaji: `${warna.romaji} ${barang.romaji} o ${zona.romaji} ni oite kudasai`,
  };
}

/**
 * Enam pilihan untuk meja kerja: SATU yang benar + lima pengecoh unik.
 *
 * `kunci` sengaja `warna_barang` — bukan indeks — supaya pilihan yang benar
 * tetap bisa dikenali setelah daftarnya diacak.
 */
export function buatPilihan(perintah: Perintah, rng: () => number = Math.random): PilihanGenba[] {
  const kunciBenar = `${perintah.warna.id}_${perintah.barang.id}`;
  const hasil: PilihanGenba[] = [{ kunci: kunciBenar, warna: perintah.warna, barang: perintah.barang }];
  const dipakai = new Set([kunciBenar]);

  /* Batas percobaan: dengan 4×4 = 16 kombinasi, enam pilihan selalu bisa
     dicapai; batas ini hanya menjaga loop tidak berputar selamanya kalau
     daftar sumbernya suatu saat dipersempit. */
  for (let n = 0; n < 200 && hasil.length < 6; n++) {
    const warna = pilih(GENBA_WARNA, rng);
    const barang = pilih(GENBA_BARANG, rng);
    const kunci = `${warna.id}_${barang.id}`;
    if (dipakai.has(kunci)) continue;
    dipakai.add(kunci);
    hasil.push({ kunci, warna, barang });
  }
  return hasil;
}

/** Benar hanya kalau barang DAN zona sama-sama tepat. */
export function cekGenba(perintah: Perintah, kunciBarang: string, zonaId: string): boolean {
  return kunciBarang === `${perintah.warna.id}_${perintah.barang.id}` && zonaId === perintah.zona.id;
}

/* ── GAME 2: rangkai kalimat ─────────────────────────────────────────────── */

export type JenisKartu = 'noun' | 'particle' | 'verb';

export interface Kartu {
  jp: string;
  jenis: JenisKartu;
  /** Kenapa kartu ini ada — dipakai untuk umpan balik saat salah. */
  ket: string;
}

export interface SoalCombo {
  bab: string;
  indo: string;
  urutan: readonly Kartu[];
  jebakan: readonly Kartu[];
  /** Kalimat panjang (dua klausa, て形 / から) — hanya untuk level Hell. */
  hell?: boolean;
}

export const COMBO_SOAL: readonly SoalCombo[] = [
  {
    bab: 'Bab 6 — を & で',
    indo: 'Minum kopi di kantin',
    urutan: [
      { jp: 'しょくどう', jenis: 'noun', ket: 'Kantin (tempat)' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat berlangsungnya aksi memakai で' },
      { jp: 'コーヒー', jenis: 'noun', ket: 'Kopi (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'のみます', jenis: 'verb', ket: 'Minum' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Aksi aktif di suatu tempat memakai で, bukan に' },
      { jp: 'へ', jenis: 'particle', ket: 'へ menandai arah perpindahan' },
      { jp: 'たべます', jenis: 'verb', ket: 'たべます = makan; kopi diminum (のみます)' },
    ],
  },
  {
    bab: 'Bab 5 — と, で, へ',
    indo: 'Pergi ke pabrik naik sepeda bersama teman',
    urutan: [
      { jp: 'ともだち', jenis: 'noun', ket: 'Teman' },
      { jp: 'と', jenis: 'particle', ket: 'Partikel "bersama" (と)' },
      { jp: 'じてんしゃ', jenis: 'noun', ket: 'Sepeda (kendaraan)' },
      { jp: 'で', jenis: 'particle', ket: 'Alat/kendaraan memakai で' },
      { jp: 'こうじょう', jenis: 'noun', ket: 'Pabrik (tujuan)' },
      { jp: 'へ', jenis: 'particle', ket: 'Arah tujuan memakai へ' },
      { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'Kendaraan memakai で, bukan を' },
      { jp: 'かえります', jenis: 'verb', ket: 'かえります = pulang, bukan pergi' },
    ],
  },
  {
    bab: 'Bab 4 — から まで (waktu)',
    indo: 'Belajar bahasa Jepang dari jam 7 sampai jam 9',
    urutan: [
      { jp: 'しちじ', jenis: 'noun', ket: 'Jam 7' },
      { jp: 'から', jenis: 'particle', ket: 'Titik awal memakai から' },
      { jp: 'くじ', jenis: 'noun', ket: 'Jam 9' },
      { jp: 'まで', jenis: 'particle', ket: 'Titik akhir memakai まで' },
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'べんきょうします', jenis: 'verb', ket: 'Belajar' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai titik waktu, bukan rentang' },
      { jp: 'はたらきます', jenis: 'verb', ket: 'はたらきます = bekerja, bukan belajar' },
    ],
  },
  {
    bab: 'Bab 6 — へ (arah)',
    indo: 'Minggu lalu pergi ke Tokyo bersama keluarga',
    urutan: [
      { jp: 'せんしゅう', jenis: 'noun', ket: 'Minggu lalu' },
      { jp: 'かぞく', jenis: 'noun', ket: 'Keluarga' },
      { jp: 'と', jenis: 'particle', ket: 'Partikel "bersama" (と)' },
      { jp: 'とうきょう', jenis: 'noun', ket: 'Tokyo (tujuan)' },
      { jp: 'へ', jenis: 'particle', ket: 'Arah tujuan memakai へ' },
      { jp: 'いきました', jenis: 'verb', ket: 'Pergi (bentuk lampau)' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi, bukan arah' },
      { jp: 'いきます', jenis: 'verb', ket: 'いきます = pergi (sekarang), bukan lampau' },
    ],
  },
  {
    bab: 'Bab 7 — alat (で)',
    indo: 'Memotong kertas menggunakan gunting',
    urutan: [
      { jp: 'はさみ', jenis: 'noun', ket: 'Gunting (alat)' },
      { jp: 'で', jenis: 'particle', ket: 'Alat kerja memakai で' },
      { jp: 'かみ', jenis: 'noun', ket: 'Kertas (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'きります', jenis: 'verb', ket: 'Memotong' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Alat kerja memakai で, bukan に' },
      { jp: 'かきます', jenis: 'verb', ket: 'かきます = menulis, bukan memotong' },
    ],
  },

  /* ── HELL: dua klausa, て形 dan から (Minna bab 16–17) ──────────────────
     Kalimat panjang memaksa siswa menyimpan SUSUNAN di kepala sambil memilih
     partikel — bukan mengenali satu pola pendek. Semua kalimat di bawah tata
     bahasanya diperiksa satu per satu, bukan dikarang bebas. */
  {
    hell: true,
    bab: 'Hell — て形 (urutan kegiatan)',
    indo: 'Setiap pagi saya bangun jam 7, cuci muka, lalu makan',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya (topik)' },
      { jp: 'は', jenis: 'particle', ket: 'Topik memakai は' },
      { jp: 'まいにち', jenis: 'noun', ket: 'Setiap hari' },
      { jp: 'あさ', jenis: 'noun', ket: 'Pagi' },
      { jp: 'しちじ', jenis: 'noun', ket: 'Jam 7' },
      { jp: 'に', jenis: 'particle', ket: 'Titik waktu memakai に' },
      { jp: 'おきて', jenis: 'verb', ket: 'Bangun (て形, menyambung)' },
      { jp: 'かお', jenis: 'noun', ket: 'Wajah (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'あらって', jenis: 'verb', ket: 'Mencuci (て形, menyambung)' },
      { jp: 'ごはん', jenis: 'noun', ket: 'Nasi / makanan' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'たべます', jenis: 'verb', ket: 'Makan (predikat akhir)' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi, bukan titik waktu' },
      { jp: 'たべました', jenis: 'verb', ket: 'Bentuk lampau — kalimatnya kegiatan sehari-hari' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — て形 (dua kegiatan)',
    indo: 'Minggu lalu pergi ke bioskop dengan teman dan menonton film yang menarik',
    urutan: [
      { jp: 'せんしゅう', jenis: 'noun', ket: 'Minggu lalu' },
      { jp: 'ともだち', jenis: 'noun', ket: 'Teman' },
      { jp: 'と', jenis: 'particle', ket: 'Partikel "bersama" (と)' },
      { jp: 'えいがかん', jenis: 'noun', ket: 'Bioskop (tujuan)' },
      { jp: 'へ', jenis: 'particle', ket: 'Arah tujuan memakai へ' },
      { jp: 'いって', jenis: 'verb', ket: 'Pergi (て形, menyambung)' },
      { jp: 'おもしろい', jenis: 'noun', ket: 'Menarik (kata sifat い)' },
      { jp: 'えいが', jenis: 'noun', ket: 'Film (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'みました', jenis: 'verb', ket: 'Menonton (lampau)' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で bukan penanda arah tujuan' },
      { jp: 'みます', jenis: 'verb', ket: 'Bentuk sekarang — kalimatnya lampau' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — から (sebab)',
    indo: 'Besok akan turun hujan, jadi saya pergi membawa payung',
    urutan: [
      { jp: 'あした', jenis: 'noun', ket: 'Besok' },
      { jp: 'は', jenis: 'particle', ket: 'Topik memakai は' },
      { jp: 'あめ', jenis: 'noun', ket: 'Hujan' },
      { jp: 'が', jenis: 'particle', ket: 'Subjek fenomena alam memakai が' },
      { jp: 'ふる', jenis: 'verb', ket: 'Turun (hujan), bentuk kamus' },
      { jp: 'から', jenis: 'particle', ket: 'Sebab memakai から' },
      { jp: 'かさ', jenis: 'noun', ket: 'Payung (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'もって', jenis: 'verb', ket: 'Membawa (て形)' },
      { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'Hujan turun memakai が, bukan を' },
      { jp: 'まで', jenis: 'particle', ket: 'まで = sampai, bukan sebab' },
    ],
  },
];

/** Kartu yang ditampilkan: urutan benar + jebakan, diacak. */
export function kocokKartu(soal: SoalCombo, rng: () => number = Math.random): Kartu[] {
  const semua = [...soal.urutan, ...soal.jebakan];
  const a = [...semua];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Apakah kartu ini langkah berikutnya yang sah?
 *
 * Perbandingan memakai teks Jepangnya, bukan indeks kartu — dua kartu bisa
 * berbunyi sama (mis. で muncul dua kali dalam satu kalimat), dan yang dinilai
 * adalah "kata apa yang dibutuhkan sekarang", bukan "kartu nomor berapa".
 */
export function kartuBenar(soal: SoalCombo, langkah: number, kartu: Kartu): boolean {
  const harap = soal.urutan[langkah];
  return !!harap && harap.jp === kartu.jp;
}
