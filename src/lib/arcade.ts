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
 * (2026-11-04) lalu diperluas dengan kosakata benda kerja & keseharian N5.
 * Bahasanya diperiksa satu per satu: `あかい はこ を うえ の たな に
 * おいてください` memang "tolong taruh kotak merah di rak atas". Tidak ada
 * kalimat yang dikarang sembarangan.
 *
 * BATAS YANG JUJUR
 * ----------------
 * 6 warna × 24 barang × 12 lokasi = 1.728 variasi perintah yang
 * benar secara tata bahasa. Itu CUKUP untuk latihan refleks dan pendengaran,
 * sedangkan latihan susunan partikel dan klausa ditangani oleh Combo Kalimat.
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
}

/**
 * Barang yang bisa "ditaruh" — semuanya BENDA FISIK, karena kalimatnya
 * `… を … に おいてください` (tolong letakkan). Kata seperti 元気 atau 予定 tidak
 * bisa masuk daftar ini tanpa membuat kalimatnya salah.
 *
 * Kosakatanya dari N5/Minna & benda kerja pabrik: 24 barang × 6 warna × 12 lokasi
 * = 1.728 variasi perintah.
 */
export const GENBA_BARANG: readonly BarangGenba[] = [
  { id: 'hako', jp: 'はこ', romaji: 'hako', id_: 'Kotak' },
  { id: 'kagi', jp: 'かぎ', romaji: 'kagi', id_: 'Kunci' },
  { id: 'hasami', jp: 'はさみ', romaji: 'hasami', id_: 'Gunting' },
  { id: 'kutsu', jp: 'くつ', romaji: 'kutsu', id_: 'Sepatu' },
  { id: 'kaban', jp: 'かばん', romaji: 'kaban', id_: 'Tas' },
  { id: 'kasa', jp: 'かさ', romaji: 'kasa', id_: 'Payung' },
  { id: 'tokei', jp: 'とけい', romaji: 'tokei', id_: 'Jam' },
  { id: 'hon', jp: 'ほん', romaji: 'hon', id_: 'Buku' },
  { id: 'nooto', jp: 'ノート', romaji: 'nooto', id_: 'Buku catatan' },
  { id: 'pen', jp: 'ペン', romaji: 'pen', id_: 'Pulpen' },
  { id: 'koppu', jp: 'コップ', romaji: 'koppu', id_: 'Gelas' },
  { id: 'sara', jp: 'さら', romaji: 'sara', id_: 'Piring' },
  { id: 'taoru', jp: 'タオル', romaji: 'taoru', id_: 'Handuk' },
  { id: 'boushi', jp: 'ぼうし', romaji: 'boushi', id_: 'Topi' },
  { id: 'saifu', jp: 'さいふ', romaji: 'saifu', id_: 'Dompet' },
  { id: 'megane', jp: 'めがね', romaji: 'megane', id_: 'Kacamata' },
  { id: 'tebukuro', jp: 'てぶくろ', romaji: 'tebukuro', id_: 'Sarung tangan' },
  { id: 'herumetto', jp: 'ヘルメット', romaji: 'herumetto', id_: 'Helm kerja' },
  { id: 'bento', jp: 'おべんとう', romaji: 'obentou', id_: 'Kotak bekal' },
  { id: 'jisho', jp: 'じしょ', romaji: 'jisho', id_: 'Kamus' },
  { id: 'kamera', jp: 'カメラ', romaji: 'kamera', id_: 'Kamera' },
  { id: 'denchi', jp: 'でんち', romaji: 'denchi', id_: 'Baterai' },
  { id: 'fukuro', jp: 'ふくろ', romaji: 'fukuro', id_: 'Kantong' },
  { id: 'chizu', jp: 'ちず', romaji: 'chizu', id_: 'Peta' },
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
  { id: 'tsukue', jp: 'つくえ の うえ', romaji: 'tsukue no ue', id_: 'Atas Meja' },
  { id: 'isu', jp: 'いす の した', romaji: 'isu no shita', id_: 'Bawah Kursi' },
  { id: 'doa', jp: 'ドア の ちかく', romaji: 'doa no chikaku', id_: 'Dekat Pintu' },
  { id: 'mado', jp: 'まど の そば', romaji: 'mado no soba', id_: 'Dekat Jendela' },
  { id: 'kaban', jp: 'かばん の なか', romaji: 'kaban no naka', id_: 'Dalam Tas' },
  { id: 'hiki', jp: 'ひきだし の なか', romaji: 'hikidashi no naka', id_: 'Dalam Laci' },
  { id: 'yuka', jp: 'ゆか の うえ', romaji: 'yuka no ue', id_: 'Di Lantai' },
  { id: 'reizouko', jp: 'れいぞうこ の なか', romaji: 'reizouko no naka', id_: 'Dalam Kulkas' },
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
 * Enam pilihan untuk meja kerja: SATU yang benar + lima pengecoh unik, lalu diacak.
 *
 * `kunci` sengaja `warna_barang` — bukan indeks — supaya pilihan yang benar
 * tetap bisa dikenali setelah daftarnya diacak.
 *
 * PERBAIKAN BUG: versi lama menaruh barang yang benar di `hasil[0]` lalu hanya
 * melakukan `.push()` untuk 5 pengecoh tanpa mengacak `hasil`, sehingga barang
 * yang benar SELALU berada di pojok kiri atas meja kerja. Sekarang `hasil`
 * dikocok memakai Fisher–Yates dengan `rng` yang sama.
 */
export function buatPilihan(perintah: Perintah, rng: () => number = Math.random): PilihanGenba[] {
  const kunciBenar = `${perintah.warna.id}_${perintah.barang.id}`;
  const hasil: PilihanGenba[] = [{ kunci: kunciBenar, warna: perintah.warna, barang: perintah.barang }];
  const dipakai = new Set([kunciBenar]);

  /* Batas percobaan: dengan 6×24 = 144 kombinasi, enam pilihan selalu bisa
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
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
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
  /** Kalimat panjang (dua klausa, て形 / から / ながら / まえに) — hanya untuk level Hell. */
  hell?: boolean;
}

export const COMBO_SOAL: readonly SoalCombo[] = [
  /* ── NORMAL & SULIT (30 Kalimat: Bab 4–35 & Tempat Kerja) ──────────────── */
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
    bab: 'Bab 5 — へ (arah lampau)',
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
  {
    bab: 'Bab 6 — Membeli di tempat (で & を)',
    indo: 'Membeli sayur dan daging di supermarket',
    urutan: [
      { jp: 'スーパー', jenis: 'noun', ket: 'Supermarket (tempat)' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat kegiatan membeli memakai で' },
      { jp: 'やさい', jenis: 'noun', ket: 'Sayur' },
      { jp: 'と', jenis: 'particle', ket: 'Kata hubung "dan" antar benda memakai と' },
      { jp: 'にく', jenis: 'noun', ket: 'Daging' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang dibeli memakai を' },
      { jp: 'かいます', jenis: 'verb', ket: 'Membeli' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Membeli di suatu tempat memakai で, bukan に' },
      { jp: 'うります', jenis: 'verb', ket: 'うります = menjual, bukan membeli' },
    ],
  },
  {
    bab: 'Bab 7 — Menulis dengan alat (で & を)',
    indo: 'Menulis laporan dengan bahasa Jepang',
    urutan: [
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang (alat/bahasa)' },
      { jp: 'で', jenis: 'particle', ket: 'Bahasa yang digunakan memakai で' },
      { jp: 'レポート', jenis: 'noun', ket: 'Laporan (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'かきます', jenis: 'verb', ket: 'Menulis' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Bahasa pengantar memakai で, bukan に' },
      { jp: 'よみます', jenis: 'verb', ket: 'よみます = membaca, bukan menulis' },
    ],
  },
  {
    bab: 'Bab 7 — Memberi (に & を あげます)',
    indo: 'Memberikan oleh-oleh kepada Senpai',
    urutan: [
      { jp: 'せんぱい', jenis: 'noun', ket: 'Senpai (penerima)' },
      { jp: 'に', jenis: 'particle', ket: 'Penerima pemberian memakai に' },
      { jp: 'おみやげ', jenis: 'noun', ket: 'Oleh-oleh (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Benda yang diberikan memakai を' },
      { jp: 'あげます', jenis: 'verb', ket: 'Memberikan' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Penerima orang memakai に, bukan で' },
      { jp: 'かります', jenis: 'verb', ket: 'かります = meminjam, bukan memberi' },
    ],
  },
  {
    bab: 'Bab 7 — Menerima (に & を もらいます)',
    indo: 'Menerima kamus dari guru bahasa Jepang',
    urutan: [
      { jp: 'せんせい', jenis: 'noun', ket: 'Guru (pemberi)' },
      { jp: 'に', jenis: 'particle', ket: 'Sumber pemberian memakai に' },
      { jp: 'じしょ', jenis: 'noun', ket: 'Kamus (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang diterima memakai を' },
      { jp: 'もらいました', jenis: 'verb', ket: 'Menerima (lampau)' },
    ],
    jebakan: [
      { jp: 'へ', jenis: 'particle', ket: 'へ untuk arah tempat, bukan sumber pemberian' },
      { jp: 'おしえました', jenis: 'verb', ket: 'おしえました = mengajarkan, bukan menerima' },
    ],
  },
  {
    bab: 'Bab 4 — Waktu bangun (に)',
    indo: 'Setiap pagi saya bangun pada jam 5',
    urutan: [
      { jp: 'まいあさ', jenis: 'noun', ket: 'Setiap pagi' },
      { jp: 'ごじ', jenis: 'noun', ket: 'Jam 5' },
      { jp: 'に', jenis: 'particle', ket: 'Titik waktu berangka memakai に' },
      { jp: 'おきます', jenis: 'verb', ket: 'Bangun tidur' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Titik waktu memakai に, bukan で' },
      { jp: 'を', jenis: 'particle', ket: 'おきます adalah kata kerja intransitif (tanpa を)' },
      { jp: 'ねます', jenis: 'verb', ket: 'ねます = tidur, bukan bangun' },
    ],
  },
  {
    bab: 'Bab 5 — Pulang ke asrama (へ かえります)',
    indo: 'Pulang ke asrama bersama teman kerja',
    urutan: [
      { jp: 'かいしゃ', jenis: 'noun', ket: 'Perusahaan' },
      { jp: 'の', jenis: 'particle', ket: 'Kepemilikan/afiliasi memakai の' },
      { jp: 'ひと', jenis: 'noun', ket: 'Orang / rekan' },
      { jp: 'と', jenis: 'particle', ket: 'Bersama seseorang memakai と' },
      { jp: 'りょう', jenis: 'noun', ket: 'Asrama (tujuan)' },
      { jp: 'へ', jenis: 'particle', ket: 'Arah pulang memakai へ' },
      { jp: 'かえります', jenis: 'verb', ket: 'Pulang' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'かえります tidak memakai を untuk tujuan' },
      { jp: 'きます', jenis: 'verb', ket: 'きます = datang, bukan pulang' },
    ],
  },
  {
    bab: 'Bab 6 — Mengambil foto (で & を とります)',
    indo: 'Mengambil foto di depan taman',
    urutan: [
      { jp: 'こうえん', jenis: 'noun', ket: 'Taman' },
      { jp: 'の', jenis: 'particle', ket: 'Penghubung posisi memakai の' },
      { jp: 'まえ', jenis: 'noun', ket: 'Depan' },
      { jp: 'で', jenis: 'particle', ket: 'Lokasi aksi mengambil foto memakai で' },
      { jp: 'しゃしん', jenis: 'noun', ket: 'Foto (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'とります', jenis: 'verb', ket: 'Mengambil (foto)' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Aksi memotret di suatu tempat memakai で' },
      { jp: 'おくります', jenis: 'verb', ket: 'おくります = mengirim, bukan memotret' },
    ],
  },
  {
    bab: 'Bab 6 — Ajakan (いっしょに 〜ませんか)',
    indo: 'Maukah makan siang bersama di kantin?',
    urutan: [
      { jp: 'いっしょに', jenis: 'noun', ket: 'Bersama-sama' },
      { jp: 'しょくどう', jenis: 'noun', ket: 'Kantin (tempat)' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat makan memakai で' },
      { jp: 'ひるごはん', jenis: 'noun', ket: 'Makan siang (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'たべませんか', jenis: 'verb', ket: 'Maukah makan? (ajakan sopan)' },
    ],
    jebakan: [
      { jp: 'へ', jenis: 'particle', ket: 'Tempat berlangsungnya makan memakai で, bukan へ' },
      { jp: 'ねませんか', jenis: 'verb', ket: 'ねませんか = maukah tidur, bukan makan' },
    ],
  },
  {
    bab: 'Bab 9 — Suka & Kemampuan (が すきです / わかります)',
    indo: 'Saya sedikit mengerti bahasa Jepang',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya (topik)' },
      { jp: 'は', jenis: 'particle', ket: 'Penanda topik kalimat memakai は' },
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' },
      { jp: 'が', jenis: 'particle', ket: 'Objek dari わかります memakai が, bukan を' },
      { jp: 'すこし', jenis: 'noun', ket: 'Sedikit (keterangan derajat)' },
      { jp: 'わかります', jenis: 'verb', ket: 'Mengerti / paham' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'わかります selalu berpasangan dengan が, bukan を!' },
      { jp: 'で', jenis: 'particle', ket: 'で untuk alat/tempat, bukan objek わかります' },
    ],
  },
  {
    bab: 'Bab 10 — Keberadaan benda (に 〜が あります)',
    indo: 'Di atas meja ada buku catatan dan pulpen',
    urutan: [
      { jp: 'つくえ', jenis: 'noun', ket: 'Meja' },
      { jp: 'の', jenis: 'particle', ket: 'Penghubung posisi memakai の' },
      { jp: 'うえ', jenis: 'noun', ket: 'Atas' },
      { jp: 'に', jenis: 'particle', ket: 'Letak keberadaan (あります) memakai に' },
      { jp: 'ノート', jenis: 'noun', ket: 'Buku catatan' },
      { jp: 'と', jenis: 'particle', ket: 'Dan (menghubungkan dua benda)' },
      { jp: 'ペン', jenis: 'noun', ket: 'Pulpen' },
      { jp: 'が', jenis: 'particle', ket: 'Subjek keberadaan memakai が' },
      { jp: 'あります', jenis: 'verb', ket: 'Ada (benda mati)' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Keberadaan (あります) memakai に, bukan で' },
      { jp: 'います', jenis: 'verb', ket: 'います untuk makhluk hidup; benda mati memakai あります' },
    ],
  },
  {
    bab: 'Bab 13 — Keinginan pergi (へ 〜に いきます)',
    indo: 'Pergi ke toko buku untuk membeli kamus',
    urutan: [
      { jp: 'ほんや', jenis: 'noun', ket: 'Toko buku (tempat tujuan)' },
      { jp: 'へ', jenis: 'particle', ket: 'Tempat tujuan memakai へ' },
      { jp: 'じしょ', jenis: 'noun', ket: 'Kamus (objek yang dibeli)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'かいに', jenis: 'noun', ket: 'Untuk membeli (bentuk ます + に)' },
      { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Tujuan pergi memakai へ, bukan で' },
      { jp: 'かえります', jenis: 'verb', ket: 'かえります = pulang, bukan pergi' },
    ],
  },
  {
    bab: 'Bab 14 — Perintah sopan (て形 + ください)',
    indo: 'Tolong tulis nama di kertas ini dengan pulpen hitam',
    urutan: [
      { jp: 'くろい', jenis: 'noun', ket: 'Hitam' },
      { jp: 'ペン', jenis: 'noun', ket: 'Pulpen (alat)' },
      { jp: 'で', jenis: 'particle', ket: 'Alat menulis memakai で' },
      { jp: 'このかみ', jenis: 'noun', ket: 'Kertas ini (tempat tulisan)' },
      { jp: 'に', jenis: 'particle', ket: 'Tempat menempelnya tulisan memakai に' },
      { jp: 'なまえ', jenis: 'noun', ket: 'Nama (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'かいてください', jenis: 'verb', ket: 'Tolong tulis' },
    ],
    jebakan: [
      { jp: 'へ', jenis: 'particle', ket: 'Menulis di kertas memakai に, bukan へ' },
      { jp: 'よんでください', jenis: 'verb', ket: 'よんでください = tolong baca, bukan tulis' },
    ],
  },
  {
    bab: 'Bab 14 — Sedang berlangsung (て形 + います)',
    indo: 'Sekarang Senpai sedang memeriksa mesin di pabrik',
    urutan: [
      { jp: 'いま', jenis: 'noun', ket: 'Sekarang' },
      { jp: 'せんぱい', jenis: 'noun', ket: 'Senpai (topik)' },
      { jp: 'は', jenis: 'particle', ket: 'Topik memakai は' },
      { jp: 'こうじょう', jenis: 'noun', ket: 'Pabrik (tempat)' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat aksi berlangsung memakai で' },
      { jp: 'きかい', jenis: 'noun', ket: 'Mesin (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek pemeriksaan memakai を' },
      { jp: 'てんけんしています', jenis: 'verb', ket: 'Sedang memeriksa' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Aksi memeriksa di pabrik memakai で, bukan に' },
      { jp: 'やすんでいます', jenis: 'verb', ket: 'やすんでいます = sedang istirahat' },
    ],
  },
  {
    bab: 'Bab 15 — Izin (ても いいですか)',
    indo: 'Bolehkah saya meminjam gunting ini?',
    urutan: [
      { jp: 'この', jenis: 'noun', ket: 'Ini (kata tunjuk benda)' },
      { jp: 'はさみ', jenis: 'noun', ket: 'Gunting (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang dipinjam memakai を' },
      { jp: 'かりても', jenis: 'noun', ket: 'Meminjam pun (て形 + も)' },
      { jp: 'いいですか', jenis: 'verb', ket: 'Bolehkah?' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Objek yang dipinjam memakai を, bukan で' },
      { jp: 'いけませんか', jenis: 'verb', ket: 'いけませんか bukan bentuk meminta izin' },
    ],
  },
  {
    bab: 'Bab 17 — Larangan (ないで ください)',
    indo: 'Tolong jangan mengambil foto di dalam pabrik',
    urutan: [
      { jp: 'こうじょう', jenis: 'noun', ket: 'Pabrik' },
      { jp: 'の', jenis: 'particle', ket: 'Penghubung bagian memakai の' },
      { jp: 'なか', jenis: 'noun', ket: 'Dalam' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat aksi memakai で' },
      { jp: 'しゃしん', jenis: 'noun', ket: 'Foto (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'とらないでください', jenis: 'verb', ket: 'Tolong jangan mengambil (ない形 + でください)' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Tempat memotret memakai で, bukan に' },
      { jp: 'とってください', jenis: 'verb', ket: 'とってください = tolong ambil (kebalikan dari jangan!)' },
    ],
  },
  {
    bab: 'Bab 17 — Kewajiban Genba (なければ なりません)',
    indo: 'Di tempat kerja wajib memakai helm kerja',
    urutan: [
      { jp: 'げんば', jenis: 'noun', ket: 'Tempat kerja / lapangan' },
      { jp: 'で', jenis: 'particle', ket: 'Di tempat kerja memakai で' },
      { jp: 'ヘルメット', jenis: 'noun', ket: 'Helm kerja (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang dipakai memakai を' },
      { jp: 'かぶらなければなりません', jenis: 'verb', ket: 'Wajib memakai (kepala)' },
    ],
    jebakan: [
      { jp: 'へ', jenis: 'particle', ket: 'Lokasi memakai で, bukan へ' },
      { jp: 'ぬがなければなりません', jenis: 'verb', ket: 'ぬぐ = melepas, bukan memakai' },
    ],
  },
  {
    bab: 'Bab 18 — Sebelum kegiatan (まえに)',
    indo: 'Mencuci tangan dengan sabun sebelum makan',
    urutan: [
      { jp: 'しょくじ', jenis: 'noun', ket: 'Makan (kata benda)' },
      { jp: 'の', jenis: 'particle', ket: 'Kata benda sebelum まえに memakai の' },
      { jp: 'まえに', jenis: 'noun', ket: 'Sebelum' },
      { jp: 'せっけん', jenis: 'noun', ket: 'Sabun (alat)' },
      { jp: 'で', jenis: 'particle', ket: 'Mencuci dengan sabun memakai で' },
      { jp: 'て', jenis: 'noun', ket: 'Tangan (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang dicuci memakai を' },
      { jp: 'あらいます', jenis: 'verb', ket: 'Mencuci' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Alat/bahan pencuci memakai で, bukan に' },
      { jp: 'きります', jenis: 'verb', ket: 'きります = memotong, bukan mencuci' },
    ],
  },
  {
    bab: 'Bab 19 — Pernah melakukan (た形 + ことが あります)',
    indo: 'Saya pernah naik kereta cepat Shinkansen',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya (topik)' },
      { jp: 'は', jenis: 'particle', ket: 'Penanda topik memakai は' },
      { jp: 'しんかんせん', jenis: 'noun', ket: 'Shinkansen (kendaraan)' },
      { jp: 'に', jenis: 'particle', ket: 'Naik kendaraan (のります) selalu memakai に!' },
      { jp: 'のった', jenis: 'noun', ket: 'Naik (bentuk lampau た)' },
      { jp: 'ことが', jenis: 'particle', ket: 'Pengalaman memakai ことがあります' },
      { jp: 'あります', jenis: 'verb', ket: 'Pernah (ada pengalaman)' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'Naik kendaraan memakai に のります, bukan を!' },
      { jp: 'で', jenis: 'particle', ket: 'で dipakai saat kendaraan menjadi alat menuju tempat (で いきます)' },
    ],
  },
  {
    bab: 'Bab 21 — Pendapat (と おもいます)',
    indo: 'Menurut saya ujian besok itu sulit',
    urutan: [
      { jp: 'あした', jenis: 'noun', ket: 'Besok' },
      { jp: 'の', jenis: 'particle', ket: 'Menerangkan kata benda memakai の' },
      { jp: 'しけん', jenis: 'noun', ket: 'Ujian' },
      { jp: 'は', jenis: 'particle', ket: 'Topik memakai は' },
      { jp: 'むずかしい', jenis: 'noun', ket: 'Sulit (bentuk biasa)' },
      { jp: 'と', jenis: 'particle', ket: 'Kutipan pikiran memakai と' },
      { jp: 'おもいます', jenis: 'verb', ket: 'Saya rasa / berpikir' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'おもいます selalu didahului と, bukan を' },
      { jp: 'に', jenis: 'particle', ket: 'Kutipan pendapat memakai と, bukan に' },
    ],
  },
  {
    bab: 'Bab 22 — Modifikasi kata benda (Anak kalimat)',
    indo: 'Ini adalah kotak bekal yang saya buat tadi pagi',
    urutan: [
      { jp: 'これ', jenis: 'noun', ket: 'Ini (topik)' },
      { jp: 'は', jenis: 'particle', ket: 'Penanda topik memakai は' },
      { jp: 'けさ', jenis: 'noun', ket: 'Tadi pagi' },
      { jp: 'わたしが', jenis: 'noun', ket: 'Subjek dalam anak kalimat memakai が' },
      { jp: 'つくった', jenis: 'noun', ket: 'Yang dibuat (bentuk lampau biasa)' },
      { jp: 'おべんとう', jenis: 'noun', ket: 'Kotak bekal' },
      { jp: 'です', jenis: 'verb', ket: 'Adalah (kopula sopan)' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'Kata benda yang diterangkan langsung mengikuti つくった tanpa を' },
      { jp: 'つくります', jenis: 'verb', ket: 'Sebelum kata benda harus bentuk biasa (つくった), bukan ます' },
    ],
  },
  {
    bab: 'Bab 23 — Saat / Ketika (とき)',
    indo: 'Saat keluar dari kamar, tolong matikan lampu',
    urutan: [
      { jp: 'へや', jenis: 'noun', ket: 'Kamar' },
      { jp: 'を', jenis: 'particle', ket: 'Keluar dari ruangan (でます) memakai を!' },
      { jp: 'でるとき', jenis: 'noun', ket: 'Saat keluar' },
      { jp: 'でんき', jenis: 'noun', ket: 'Lampu / listrik' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang dimatikan memakai を' },
      { jp: 'けしてください', jenis: 'verb', ket: 'Tolong matikan' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Keluar dari kamar memakai へや を でます, bukan で' },
      { jp: 'つけてください', jenis: 'verb', ket: 'つけてください = tolong nyalakan, bukan matikan' },
    ],
  },
  {
    bab: 'Bab 24 — Memberi bantuan (て形 + あげます)',
    indo: 'Membacakan buku kepada anak',
    urutan: [
      { jp: 'こども', jenis: 'noun', ket: 'Anak (penerima)' },
      { jp: 'に', jenis: 'particle', ket: 'Penerima manfaat memakai に' },
      { jp: 'ほん', jenis: 'noun', ket: 'Buku (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang dibaca memakai を' },
      { jp: 'よんで', jenis: 'noun', ket: 'Membaca (て形)' },
      { jp: 'あげます', jenis: 'verb', ket: 'Memberikan tindakan untuk orang lain' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Penerima manfaat memakai に, bukan で' },
      { jp: 'もらいます', jenis: 'verb', ket: 'もらいます = menerima bantuan, bukan memberi' },
    ],
  },
  {
    bab: 'Bab 27 — Kata kerja potensial (が できます)',
    indo: 'Saya bisa berbicara bahasa Jepang sedikit',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya (topik)' },
      { jp: 'は', jenis: 'particle', ket: 'Penanda topik memakai は' },
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' },
      { jp: 'が', jenis: 'particle', ket: 'Kata kerja potensial (はなせます) memakai が!' },
      { jp: 'すこし', jenis: 'noun', ket: 'Sedikit' },
      { jp: 'はなせます', jenis: 'verb', ket: 'Bisa berbicara' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'Bentuk potensial memakai が, bukan を' },
      { jp: 'で', jenis: 'particle', ket: 'で untuk alat, bukan objek kemampuan' },
    ],
  },
  {
    bab: 'Bab 30 — Keadaan hasil (に 〜が てあります)',
    indo: 'Jadwal bulan ini sudah ditempel di dinding',
    urutan: [
      { jp: 'かべ', jenis: 'noun', ket: 'Dinding (lokasi)' },
      { jp: 'に', jenis: 'particle', ket: 'Tempat hasil penempelan memakai に' },
      { jp: 'こんげつ', jenis: 'noun', ket: 'Bulan ini' },
      { jp: 'の', jenis: 'particle', ket: 'Kepemilikan/keterangan memakai の' },
      { jp: 'よていひょう', jenis: 'noun', ket: 'Tabel jadwal' },
      { jp: 'が', jenis: 'particle', ket: 'Subjek pada pola 〜てあります memakai が!' },
      { jp: 'はってあります', jenis: 'verb', ket: 'Terpasang / sudah ditempel' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'Pola 〜てあります mengubah objek を menjadi subjek が!' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat menempel memakai に, bukan で' },
    ],
  },
  {
    bab: 'Bab 31 — Niat / Rencana (つもりです)',
    indo: 'Hari Minggu saya berencana istirahat di asrama',
    urutan: [
      { jp: 'にちようび', jenis: 'noun', ket: 'Hari Minggu' },
      { jp: 'は', jenis: 'particle', ket: 'Penanda topik memakai は' },
      { jp: 'りょう', jenis: 'noun', ket: 'Asrama (tempat)' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat beristirahat memakai で' },
      { jp: 'やすむ', jenis: 'noun', ket: 'Istirahat (bentuk kamus sebelum つもり)' },
      { jp: 'つもりです', jenis: 'verb', ket: 'Berencana / berniat' },
    ],
    jebakan: [
      { jp: 'へ', jenis: 'particle', ket: 'Istirahat di asrama memakai で, bukan へ' },
      { jp: 'やすみます', jenis: 'verb', ket: 'Sebelum つもりです harus bentuk kamus (やすむ), bukan ます' },
    ],
  },
  {
    bab: 'Bab 34 — Sesuai petunjuk (とおりに)',
    indo: 'Tolong rapikan barang sesuai petunjuk Senpai',
    urutan: [
      { jp: 'せんぱい', jenis: 'noun', ket: 'Senpai' },
      { jp: 'の', jenis: 'particle', ket: 'Penghubung kata benda memakai の' },
      { jp: 'しじ', jenis: 'noun', ket: 'Instruksi / petunjuk' },
      { jp: 'どおりに', jenis: 'particle', ket: 'Sesuai dengan (〜どおりに)' },
      { jp: 'にもつ', jenis: 'noun', ket: 'Barang (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'かたづけてください', jenis: 'verb', ket: 'Tolong rapikan / bereskan' },
    ],
    jebakan: [
      { jp: 'へ', jenis: 'particle', ket: 'Tidak memakai へ pada objek にもつ' },
      { jp: 'すててください', jenis: 'verb', ket: 'すててください = tolong buang, bukan rapikan' },
    ],
  },
  {
    bab: 'Bab 35 — Kondisi / Syarat (たら)',
    indo: 'Kalau ada masalah pada mesin, segera lapor ke Senpai',
    urutan: [
      { jp: 'きかい', jenis: 'noun', ket: 'Mesin' },
      { jp: 'に', jenis: 'particle', ket: 'Tempat terdapatnya masalah memakai に' },
      { jp: 'もんだい', jenis: 'noun', ket: 'Masalah' },
      { jp: 'が', jenis: 'particle', ket: 'Subjek あります memakai が' },
      { jp: 'あったら', jenis: 'noun', ket: 'Kalau ada (bentuk 조건 たら)' },
      { jp: 'せんぱい', jenis: 'noun', ket: 'Senpai (tujuan laporan)' },
      { jp: 'に', jenis: 'particle', ket: 'Melapor kepada seseorang memakai に' },
      { jp: 'ほうこくします', jenis: 'verb', ket: 'Melaporkan (Houkoku)' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'Subjek あったら memakai が, dan tujuan ほうこく memakai に' },
      { jp: 'で', jenis: 'particle', ket: 'Kepada Senpai memakai に, bukan で' },
    ],
  },

  /* ── HELL: dua klausa, て形 / から / ながら / まえに (15 Kalimat Panjang) ──
     Kalimat panjang memaksa siswa menyimpan SUSUNAN di kepala sambil memilih
     partikel — bukan mengenali satu pola pendek. Semua kalimat di bawah tata
     bahasanya diperiksa satu per satu. */
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
      { jp: 'で', jenis: 'particle', ket: 'Hujan turun memakai が, bukan で' },
      { jp: 'まで', jenis: 'particle', ket: 'まで = sampai, bukan sebab' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — てから (setelah selesai)',
    indo: 'Setelah pekerjaan selesai, saya membersihkan meja kerja lalu pulang ke asrama',
    urutan: [
      { jp: 'しごと', jenis: 'noun', ket: 'Pekerjaan' },
      { jp: 'が', jenis: 'particle', ket: 'Subjek dari おわります memakai が' },
      { jp: 'おわってから', jenis: 'verb', ket: 'Setelah selesai (てから)' },
      { jp: 'さぎょうだい', jenis: 'noun', ket: 'Meja kerja (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang dibersihkan memakai を' },
      { jp: 'そうじして', jenis: 'verb', ket: 'Membersihkan (て形)' },
      { jp: 'りょう', jenis: 'noun', ket: 'Asrama (tujuan)' },
      { jp: 'へ', jenis: 'particle', ket: 'Arah pulang memakai へ' },
      { jp: 'かえります', jenis: 'verb', ket: 'Pulang' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Subjek おわります memakai が, bukan に' },
      { jp: 'いきます', jenis: 'verb', ket: 'いきます = pergi; kembali ke asrama memakai かえります' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — SOP Keselamatan Genba (て形 3 langkah)',
    indo: 'Sebelum masuk pabrik, pakai sarung tangan, kenakan helm, lalu cuci tangan',
    urutan: [
      { jp: 'こうじょう', jenis: 'noun', ket: 'Pabrik' },
      { jp: 'に', jenis: 'particle', ket: 'Masuk ke ruangan (はいります) memakai に' },
      { jp: 'はいるまえに', jenis: 'verb', ket: 'Sebelum masuk' },
      { jp: 'てぶくろ', jenis: 'noun', ket: 'Sarung tangan' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'はめて', jenis: 'verb', ket: 'Memakai sarung tangan (て形)' },
      { jp: 'ヘルメット', jenis: 'noun', ket: 'Helm kerja' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'かぶって', jenis: 'verb', ket: 'Memakai helm di kepala (て形)' },
      { jp: 'て', jenis: 'noun', ket: 'Tangan' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'あらいます', jenis: 'verb', ket: 'Mencuci' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Masuk ke dalam pabrik memakai に はいります, bukan で' },
      { jp: 'ぬぎます', jenis: 'verb', ket: 'ぬぎます = melepas, bukan mencuci' },
    ],
  },
  {
    hell: true,
    bab: 'Hell —から (alasan kerja)',
    indo: 'Karena besok ada ujian bahasa Jepang, malam ini saya belajar di kamar',
    urutan: [
      { jp: 'あした', jenis: 'noun', ket: 'Besok' },
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' },
      { jp: 'の', jenis: 'particle', ket: 'Penghubung kata benda memakai の' },
      { jp: 'しけん', jenis: 'noun', ket: 'Ujian' },
      { jp: 'が', jenis: 'particle', ket: 'Subjek あります memakai が' },
      { jp: 'ありますから', jenis: 'verb', ket: 'Karena ada (あります + から)' },
      { jp: 'こんばん', jenis: 'noun', ket: 'Malam ini' },
      { jp: 'へや', jenis: 'noun', ket: 'Kamar (tempat)' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat belajar memakai で' },
      { jp: 'べんきょうします', jenis: 'verb', ket: 'Belajar' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Tempat aksi belajar memakai で, bukan に' },
      { jp: 'あそびます', jenis: 'verb', ket: 'あそびます = bermain, bukan belajar' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — ながら (dua aksi bersamaan)',
    indo: 'Sambil melihat buku catatan, saya mendengarkan penjelasan Senpai',
    urutan: [
      { jp: 'ノート', jenis: 'noun', ket: 'Buku catatan' },
      { jp: 'を', jenis: 'particle', ket: 'Objek dari みます memakai を' },
      { jp: 'みながら', jenis: 'verb', ket: 'Sambil melihat (bentuk ます + ながら)' },
      { jp: 'せんぱい', jenis: 'noun', ket: 'Senpai' },
      { jp: 'の', jenis: 'particle', ket: 'Kepemilikan/keterangan memakai の' },
      { jp: 'せつめい', jenis: 'noun', ket: 'Penjelasan (objek utama)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek dari ききます memakai を' },
      { jp: 'ききます', jenis: 'verb', ket: 'Mendengarkan' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Objek yang dilihat/didengar memakai を, bukan で' },
      { jp: 'はなします', jenis: 'verb', ket: 'はなします = berbicara, bukan mendengarkan' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — たり〜たりします (contoh kegiatan libur)',
    indo: 'Pada hari libur saya mencuci pakaian, berbelanja di supermarket, dan sebagainya',
    urutan: [
      { jp: 'やすみ', jenis: 'noun', ket: 'Libur' },
      { jp: 'の', jenis: 'particle', ket: 'Penghubung kata benda memakai の' },
      { jp: 'ひ', jenis: 'noun', ket: 'Hari' },
      { jp: 'は', jenis: 'particle', ket: 'Topik memakai は' },
      { jp: 'ふく', jenis: 'noun', ket: 'Pakaian' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang dicuci memakai を' },
      { jp: 'あらったり', jenis: 'verb', ket: 'Mencuci dsb. (たり pertama)' },
      { jp: 'スーパー', jenis: 'noun', ket: 'Supermarket' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat belanja memakai で' },
      { jp: 'かいものしたり', jenis: 'verb', ket: 'Berbelanja dsb. (たり kedua)' },
      { jp: 'します', jenis: 'verb', ket: 'Melakukan (penutup wajib pola たり)' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'Berbelanja di supermarket memakai で, bukan に' },
      { jp: 'いきます', jenis: 'verb', ket: 'Pola たり〜たり selalu ditutup dengan します!' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — て形 + もらいます (menerima bantuan)',
    indo: 'Karena tidak mengerti cara pakai mesin, saya minta diajarkan oleh Senpai',
    urutan: [
      { jp: 'きかい', jenis: 'noun', ket: 'Mesin' },
      { jp: 'の', jenis: 'particle', ket: 'Penghubung kata benda memakai の' },
      { jp: 'つかいかた', jenis: 'noun', ket: 'Cara pakai' },
      { jp: 'が', jenis: 'particle', ket: 'Objek わかりません memakai が' },
      { jp: 'わかりませんから', jenis: 'verb', ket: 'Karena tidak mengerti' },
      { jp: 'せんぱい', jenis: 'noun', ket: 'Senpai (pemberi bantuan)' },
      { jp: 'に', jenis: 'particle', ket: 'Orang yang dimintai bantuan memakai に' },
      { jp: 'おしえて', jenis: 'verb', ket: 'Mengajarkan (て形)' },
      { jp: 'もらいました', jenis: 'verb', ket: 'Menerima bantuan (lampau)' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'わかりません memakai が, bukan を' },
      { jp: 'あげました', jenis: 'verb', ket: 'あげました = saya yang mengajari Senpai (terbalik!)' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — で (alat & tempat dalam satu kalimat)',
    indo: 'Setiap malam saya menelepon keluarga di Indonesia menggunakan HP di kamar',
    urutan: [
      { jp: 'まいばん', jenis: 'noun', ket: 'Setiap malam' },
      { jp: 'へや', jenis: 'noun', ket: 'Kamar (tempat)' },
      { jp: 'で', jenis: 'particle', ket: 'Tempat bertelepon memakai で' },
      { jp: 'スマホ', jenis: 'noun', ket: 'HP / Smartphone (alat)' },
      { jp: 'で', jenis: 'particle', ket: 'Alat komunikasi juga memakai で' },
      { jp: 'インドネシア', jenis: 'noun', ket: 'Indonesia' },
      { jp: 'の', jenis: 'particle', ket: 'Keterangan asal memakai の' },
      { jp: 'かぞく', jenis: 'noun', ket: 'Keluarga (tujuan telepon)' },
      { jp: 'に', jenis: 'particle', ket: 'Penerima telepon memakai に' },
      { jp: 'でんわします', jenis: 'verb', ket: 'Menelepon' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'でんわします memakai に untuk orang yang ditelepon' },
      { jp: 'へ', jenis: 'particle', ket: 'Penerima telepon memakai に, bukan へ' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — まえに & て形 (persiapan berangkat kerja)',
    indo: 'Sebelum berangkat ke perusahaan, saya makan pagi dan memeriksa barang bawaan',
    urutan: [
      { jp: 'かいしゃ', jenis: 'noun', ket: 'Perusahaan (tujuan)' },
      { jp: 'へ', jenis: 'particle', ket: 'Arah tujuan memakai へ' },
      { jp: 'いくまえに', jenis: 'verb', ket: 'Sebelum pergi (bentuk kamus + まえに)' },
      { jp: 'あさごはん', jenis: 'noun', ket: 'Sarapan' },
      { jp: 'を', jenis: 'particle', ket: 'Objek langsung memakai を' },
      { jp: 'たべて', jenis: 'verb', ket: 'Makan (て形, menyambung)' },
      { jp: 'もちもの', jenis: 'noun', ket: 'Barang bawaan' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang diperiksa memakai を' },
      { jp: 'かくにんします', jenis: 'verb', ket: 'Memeriksa / memastikan' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'Pergi ke perusahaan memakai へ, bukan で' },
      { jp: 'わすれます', jenis: 'verb', ket: 'わすれます = melupakan, bukan memeriksa' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — たら (pengandaian & tindakan)',
    indo: 'Kalau sampai di stasiun, tolong beli tiket lalu telepon saya',
    urutan: [
      { jp: 'えき', jenis: 'noun', ket: 'Stasiun (titik tiba)' },
      { jp: 'に', jenis: 'particle', ket: 'Sampai di suatu tempat (つきます) memakai に!' },
      { jp: 'ついたら', jenis: 'verb', ket: 'Kalau sudah sampai (たら)' },
      { jp: 'きっぷ', jenis: 'noun', ket: 'Tiket (objek)' },
      { jp: 'を', jenis: 'particle', ket: 'Objek yang dibeli memakai を' },
      { jp: 'かって', jenis: 'verb', ket: 'Membeli (て形, menyambung)' },
      { jp: 'わたし', jenis: 'noun', ket: 'Saya (tujuan telepon)' },
      { jp: 'に', jenis: 'particle', ket: 'Menelepon kepada seseorang memakai に' },
      { jp: 'でんわしてください', jenis: 'verb', ket: 'Tolong telepon' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'つきます (sampai) selalu memakai に, bukan で!' },
      { jp: 'うってください', jenis: 'verb', ket: 'うってください = tolong jual, bukan telepon' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — ために (tujuan tabungan)',
    indo: 'Demi keluarga di Indonesia, setiap hari saya bekerja dengan giat di Jepang',
    urutan: [
      { jp: 'インドネシア', jenis: 'noun', ket: 'Indonesia' },
      { jp: 'の', jenis: 'particle', ket: 'Penghubung kata benda memakai の' },
      { jp: 'かぞく', jenis: 'noun', ket: 'Keluarga' },
      { jp: 'の', jenis: 'particle', ket: 'Kata benda sebelum ために memakai の' },
      { jp: 'ために', jenis: 'particle', ket: 'Demi / untuk' },
      { jp: 'まいにち', jenis: 'noun', ket: 'Setiap hari' },
      { jp: 'にほん', jenis: 'noun', ket: 'Jepang (tempat kerja)' },
      { jp: 'で', jenis: 'particle', ket: 'Bekerja di suatu tempat memakai で' },
      { jp: 'いっしょうけんめい', jenis: 'noun', ket: 'Dengan sungguh-sungguh / giat' },
      { jp: 'はたらきます', jenis: 'verb', ket: 'Bekerja' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'はたらきます adalah intransitif (tidak memakai を)' },
      { jp: 'あそびます', jenis: 'verb', ket: 'あそびます = bermain, bukan bekerja' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — てはいけません (larangan keras di pabrik)',
    indo: 'Karena berbahaya, selama mesin bergerak tidak boleh menyentuh dengan tangan',
    urutan: [
      { jp: 'あぶないですから', jenis: 'noun', ket: 'Karena berbahaya' },
      { jp: 'きかい', jenis: 'noun', ket: 'Mesin' },
      { jp: 'が', jenis: 'particle', ket: 'Subjek anak kalimat memakai が' },
      { jp: 'うごいている', jenis: 'verb', ket: 'Sedang bergerak' },
      { jp: 'あいだは', jenis: 'particle', ket: 'Selama berlangsungnya (あいだは)' },
      { jp: 'て', jenis: 'noun', ket: 'Tangan (alat)' },
      { jp: 'で', jenis: 'particle', ket: 'Menyentuh dengan tangan memakai で' },
      { jp: 'さわっては', jenis: 'verb', ket: 'Menyentuh (ては)' },
      { jp: 'いけません', jenis: 'verb', ket: 'Tidak boleh (larangan)' },
    ],
    jebakan: [
      { jp: 'へ', jenis: 'particle', ket: 'Tidak memakai へ pada mesin atau tangan' },
      { jp: 'いいです', jenis: 'verb', ket: 'いいです = boleh (kebalikan dari larangan!)' },
    ],
  },
  {
    hell: true,
    bab: 'Hell — ように しています (kebiasaan baik)',
    indo: 'Supaya tidak masuk angin, setiap malam saya berusaha makan sayur dan tidur cepat',
    urutan: [
      { jp: 'かぜ', jenis: 'noun', ket: 'Masuk angin / flu' },
      { jp: 'を', jenis: 'particle', ket: 'かぜ を ひきます (terkena flu) memakai を' },
      { jp: 'ひかないように', jenis: 'verb', ket: 'Supaya tidak terkena' },
      { jp: 'まいばん', jenis: 'noun', ket: 'Setiap malam' },
      { jp: 'やさい', jenis: 'noun', ket: 'Sayur' },
      { jp: 'を', jenis: 'particle', ket: 'Objek makan memakai を' },
      { jp: 'たべて', jenis: 'verb', ket: 'Makan (て形)' },
      { jp: 'はやく', jenis: 'noun', ket: 'Cepat / lebih awal' },
      { jp: 'ねるように', jenis: 'verb', ket: 'Untuk tidur (bentuk kamus + ように)' },
      { jp: 'しています', jenis: 'verb', ket: 'Berusaha membiasakan diri' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'はやく (kata sifat い → く) tidak memakai に' },
      { jp: 'おきます', jenis: 'verb', ket: 'おきます = bangun; kebiasaan malam adalah ねるように しています' },
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
