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
  { id: 'kiiroi', jp: 'きいろい', romaji: 'kiiroi', id_: 'Kuning', kelas: 'bg-amber-500 border-amber-300' },
  { id: 'shiroi', jp: 'しろい', romaji: 'shiroi', id_: 'Putih', kelas: 'bg-slate-200 border-white' },
];

export interface BarangGenba {
  id: string;
  jp: string;
  romaji: string;
  id_: string;
  ikon: string;
}

export const GENBA_BARANG: readonly BarangGenba[] = [
  { id: 'hako', jp: 'はこ', romaji: 'hako', id_: 'Kotak', ikon: '📦' },
  { id: 'kagi', jp: 'かぎ', romaji: 'kagi', id_: 'Kunci', ikon: '🔑' },
  { id: 'hasami', jp: 'はさみ', romaji: 'hasami', id_: 'Gunting', ikon: '✂️' },
  { id: 'kutsu', jp: 'くつ', romaji: 'kutsu', id_: 'Sepatu', ikon: '👟' },
];

export interface ZonaGenba {
  id: string;
  jp: string;
  romaji: string;
  id_: string;
}

export const GENBA_ZONA: readonly ZonaGenba[] = [
  { id: 'ue', jp: 'うえ の たな', romaji: 'ue no tana', id_: 'Rak Atas' },
  { id: 'shita', jp: 'した の たな', romaji: 'shita no tana', id_: 'Rak Bawah' },
  { id: 'hidari', jp: 'ひだり の はこ', romaji: 'hidari no hako', id_: 'Kotak Kiri' },
  { id: 'migi', jp: 'みぎ の はこ', romaji: 'migi no hako', id_: 'Kotak Kanan' },
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
