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
      /* `へや` dan `を` digabung: kalimat ini butuh を DUA kali (へやを でます,
         lalu でんきを けします), dan `kartuBenar` menilai kartu berdasarkan
         teksnya — dua kartu berteks を membuat posisi kedua menerima kartu
         yang salah. Digabung, penjelasan を tetap ada di `ket`. */
      { jp: 'へやを', jenis: 'noun', ket: 'Keluar dari ruangan (へやを でます) memakai を' },
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
      { jp: 'せんぱいに', jenis: 'noun', ket: 'Melapor kepada Senpai (に = tujuan laporan)' },
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
      { jp: 'ごはんを', jenis: 'noun', ket: 'Nasi (objek langsung を)' },
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
      { jp: 'ヘルメットを', jenis: 'noun', ket: 'Helm kerja (objek langsung)' },
      { jp: 'かぶって', jenis: 'verb', ket: 'Memakai helm di kepala (て形)' },
      { jp: 'てを', jenis: 'noun', ket: 'Tangan (objek langsung を)' },
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
      { jp: 'へやで', jenis: 'noun', ket: 'Di kamar (tempat aksi memakai で)' },
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
      { jp: 'せつめいを', jenis: 'noun', ket: 'Penjelasan (objek dari ききます)' },
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
      { jp: 'へやで', jenis: 'noun', ket: 'Di kamar (tempat bertelepon memakai で)' },
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
      { jp: 'もちものを', jenis: 'noun', ket: 'Barang bawaan (objek yang diperiksa)' },
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
      { jp: 'わたしに', jenis: 'noun', ket: 'Kepada saya (tujuan telepon memakai に)' },
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
      { jp: 'かぞくの', jenis: 'noun', ket: 'Keluarga (の sebelum ために)' },
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
      { jp: 'やさいを', jenis: 'noun', ket: 'Sayur (objek makan memakai を)' },
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
  /* ── Bank bab 1–50 (2026-11-05) ─────────────────────────────────────────
   * Pemilik: "permainan sudah mantap tapi takut kena soal yang itu-itu saja".
   * 47 soal lama hanya menyentuh bab 4–35 dan banyak bab tidak terwakili.
   * Blok ini menambah 2 soal untuk SETIAP bab 1–50 (100 soal) + 10 soal Hell,
   * memakai pola kalimat khas bab itu dan kosakata dari bank kotoba repo
   * (netlify/functions/_lib/kotoba/bank.ts — 1.440 kata bab 1–50).
   *
   * Aturan yang dipegang: predikat selalu kartu terakhir (jenis "verb"),
   * tidak ada kartu kembar di dalam satu kalimat, dan tidak ada kartu jebakan
   * yang kebetulan sah di posisi mana pun (dijaga tes arcade).
   */
  {
    bab: 'Bab 1 — N は N です',
    indo: 'Saya seorang siswa.',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'がくせい', jenis: 'noun', ket: 'Siswa' }, { jp: 'です', jenis: 'verb', ket: 'Kopula sopan (predikat)' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek baru, bukan topik' }, { jp: 'じゃありません', jenis: 'verb', ket: 'Bentuk negatif' }, { jp: 'あなた', jenis: 'noun', ket: 'Kata untuk lawan bicara' },
    ],
  },
  {
    bab: 'Bab 1 — N じゃありません',
    indo: 'Orang itu bukan guru.',
    urutan: [
      { jp: 'あの ひと', jenis: 'noun', ket: 'Orang itu' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'せんせい', jenis: 'noun', ket: 'Guru' }, { jp: 'じゃありません', jenis: 'verb', ket: 'Negatif sopan dari です' },
    ],
    jebakan: [
      { jp: 'です', jenis: 'verb', ket: 'Bentuk positif' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'がくせい', jenis: 'noun', ket: 'Siswa' },
    ],
  },
  {
    bab: 'Bab 2 — これ/それ/あれ',
    indo: 'Ini buku saya.',
    urutan: [
      { jp: 'これ', jenis: 'noun', ket: 'Ini (dekat pembicara)' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'わたしの ほん', jenis: 'noun', ket: 'Buku saya' }, { jp: 'です', jenis: 'verb', ket: 'Kopula sopan' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'その', jenis: 'noun', ket: 'Itu (dekat lawan bicara)' }, { jp: 'だれ', jenis: 'noun', ket: 'Siapa' },
    ],
  },
  {
    bab: 'Bab 2 — なんの N',
    indo: 'Itu payung apa?',
    urutan: [
      { jp: 'それ', jenis: 'noun', ket: 'Itu (dekat lawan bicara)' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'なんの かさ', jenis: 'noun', ket: 'Payung apa' }, { jp: 'ですか', jenis: 'verb', ket: 'Kopula tanya' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'これ', jenis: 'noun', ket: 'Ini, bukan itu' }, { jp: 'です', jenis: 'verb', ket: 'Tanpa か bukan pertanyaan' },
    ],
  },
  {
    bab: 'Bab 3 — ここ/あそこ',
    indo: 'Toilet ada di sebelah sana.',
    urutan: [
      { jp: 'トイレ', jenis: 'noun', ket: 'Toilet' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'あそこ', jenis: 'noun', ket: 'Di sebelah sana' }, { jp: 'です', jenis: 'verb', ket: 'Kopula sopan' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai titik keberadaan, bukan "ada di"' }, { jp: 'どこ', jenis: 'noun', ket: 'Di mana' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 3 — どこですか',
    indo: 'Kantin di mana?',
    urutan: [
      { jp: 'しょくどう', jenis: 'noun', ket: 'Kantin' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'どこ', jenis: 'noun', ket: 'Di mana' }, { jp: 'ですか', jenis: 'verb', ket: 'Kopula tanya' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'あそこ', jenis: 'noun', ket: 'Di sana, bukan pertanyaan' }, { jp: 'です', jenis: 'verb', ket: 'Tanpa か bukan pertanyaan' },
    ],
  },
  {
    bab: 'Bab 4 — あります',
    indo: 'Di kamar ada meja.',
    urutan: [
      { jp: 'へや', jenis: 'noun', ket: 'Kamar' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tempat keberadaan' }, { jp: 'つくえ', jenis: 'noun', ket: 'Meja' }, { jp: 'が', jenis: 'particle', ket: 'が menandai benda yang ada' }, { jp: 'あります', jenis: 'verb', ket: 'Ada (benda mati)' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'います', jenis: 'verb', ket: 'います untuk orang/hewan' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi' },
    ],
  },
  {
    bab: 'Bab 4 — waktu に',
    indo: 'Setiap hari bangun jam 7.',
    urutan: [
      { jp: 'まいにち', jenis: 'noun', ket: 'Setiap hari' }, { jp: 'しちじ', jenis: 'noun', ket: 'Jam tujuh' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'おきます', jenis: 'verb', ket: 'Bangun tidur' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai alat/tempat, bukan waktu' }, { jp: 'から', jenis: 'particle', ket: 'から menandai titik awal' }, { jp: 'ねます', jenis: 'verb', ket: 'Tidur, bukan bangun' },
    ],
  },
  {
    bab: 'Bab 5 — へ',
    indo: 'Besok pergi ke sekolah.',
    urutan: [
      { jp: 'あした', jenis: 'noun', ket: 'Besok' }, { jp: 'がっこう', jenis: 'noun', ket: 'Sekolah' }, { jp: 'へ', jenis: 'particle', ket: 'へ menandai arah tujuan' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'きます', jenis: 'verb', ket: 'Datang, bukan pergi' },
    ],
  },
  {
    bab: 'Bab 5 — で (kendaraan)',
    indo: 'Pergi ke stasiun naik bus.',
    urutan: [
      { jp: 'バス', jenis: 'noun', ket: 'Bus' }, { jp: 'で', jenis: 'particle', ket: 'で menandai kendaraan' }, { jp: 'えき', jenis: 'noun', ket: 'Stasiun' }, { jp: 'へ', jenis: 'particle', ket: 'へ menandai arah' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu/tujuan tetap' }, { jp: 'あるきます', jenis: 'verb', ket: 'Berjalan kaki' },
    ],
  },
  {
    bab: 'Bab 6 — で & を',
    indo: 'Membeli sayur di supermarket.',
    urutan: [
      { jp: 'スーパー', jenis: 'noun', ket: 'Supermarket' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi' }, { jp: 'やさい', jenis: 'noun', ket: 'Sayur' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'かいます', jenis: 'verb', ket: 'Membeli' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai keberadaan/waktu' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'うります', jenis: 'verb', ket: 'Menjual' },
    ],
  },
  {
    bab: 'Bab 6 — ませんか',
    indo: 'Mau makan siang bersama?',
    urutan: [
      { jp: 'いっしょに', jenis: 'noun', ket: 'Bersama-sama' }, { jp: 'ひるごはん', jenis: 'noun', ket: 'Makan siang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'たべませんか', jenis: 'verb', ket: 'Ajakan sopan' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'たべます', jenis: 'verb', ket: 'Bentuk biasa, bukan ajakan' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 7 — で (alat)',
    indo: 'Makan nasi pakai sumpit.',
    urutan: [
      { jp: 'はし', jenis: 'noun', ket: 'Sumpit' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'ごはん', jenis: 'noun', ket: 'Nasi' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'たべます', jenis: 'verb', ket: 'Makan' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai waktu/tujuan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'のみます', jenis: 'verb', ket: 'Minum' },
    ],
  },
  {
    bab: 'Bab 7 — に あげます',
    indo: 'Memberi buku kepada teman.',
    urutan: [
      { jp: 'ともだち', jenis: 'noun', ket: 'Teman' }, { jp: 'に', jenis: 'particle', ket: 'に menandai penerima' }, { jp: 'ほん', jenis: 'noun', ket: 'Buku' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'あげます', jenis: 'verb', ket: 'Memberi (dari saya)' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'から', jenis: 'particle', ket: 'から menandai asal' }, { jp: 'もらいます', jenis: 'verb', ket: 'Menerima, arahnya terbalik' },
    ],
  },
  {
    bab: 'Bab 8 — kata sifat',
    indo: 'Makan apel yang sangat manis.',
    urutan: [
      { jp: 'とても', jenis: 'noun', ket: 'Sangat' }, { jp: 'あまい りんご', jenis: 'noun', ket: 'Apel yang manis' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'たべます', jenis: 'verb', ket: 'Makan' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'あまくない', jenis: 'noun', ket: 'Bentuk negatif, bukan positif' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 8 — あまり',
    indo: 'Kamar ini tidak begitu tenang.',
    urutan: [
      { jp: 'この へや', jenis: 'noun', ket: 'Kamar ini' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'あまり', jenis: 'noun', ket: 'Tidak begitu (dengan bentuk negatif)' }, { jp: 'しずかじゃありません', jenis: 'verb', ket: 'Negatif dari しずかです' },
    ],
    jebakan: [
      { jp: 'とても', jenis: 'noun', ket: 'とても hanya untuk bentuk positif' }, { jp: 'しずかです', jenis: 'verb', ket: 'Bentuk positif' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 9 — が すき/わかります',
    indo: 'Saya sedikit mengerti bahasa Jepang.',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'が', jenis: 'particle', ket: 'が dipakai untuk わかります' }, { jp: 'すこし', jenis: 'noun', ket: 'Sedikit' }, { jp: 'わかります', jenis: 'verb', ket: 'Mengerti' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を tidak dipakai dengan わかります' }, { jp: 'とても', jenis: 'noun', ket: 'Sangat, bukan sedikit' }, { jp: 'できません', jenis: 'verb', ket: 'Bentuk negatif' },
    ],
  },
  {
    bab: 'Bab 9 — すきです',
    indo: 'Dia suka olahraga.',
    urutan: [
      { jp: 'かれ', jenis: 'noun', ket: 'Dia (laki-laki)' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'スポーツ', jenis: 'noun', ket: 'Olahraga' }, { jp: 'が', jenis: 'particle', ket: 'が dipakai dengan すき' }, { jp: 'すきです', jenis: 'verb', ket: 'Suka' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を tidak dipakai dengan すき' }, { jp: 'きらいです', jenis: 'verb', ket: 'Tidak suka' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 10 — posisi',
    indo: 'Di atas meja ada buku.',
    urutan: [
      { jp: 'つくえの うえ', jenis: 'noun', ket: 'Di atas meja' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tempat keberadaan' }, { jp: 'ほん', jenis: 'noun', ket: 'Buku' }, { jp: 'が', jenis: 'particle', ket: 'が menandai benda' }, { jp: 'あります', jenis: 'verb', ket: 'Ada (benda mati)' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi' }, { jp: 'います', jenis: 'verb', ket: 'います untuk makhluk hidup' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 10 — います',
    indo: 'Di pabrik ada robot.',
    urutan: [
      { jp: 'こうじょう', jenis: 'noun', ket: 'Pabrik' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tempat keberadaan' }, { jp: 'ロボット', jenis: 'noun', ket: 'Robot' }, { jp: 'が', jenis: 'particle', ket: 'が menandai keberadaan' }, { jp: 'います', jenis: 'verb', ket: 'Ada (makhluk hidup)' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi' }, { jp: 'あります', jenis: 'verb', ket: 'あります untuk benda mati' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 11 — periode',
    indo: 'Tinggal di Jepang selama tiga tahun.',
    urutan: [
      { jp: 'にほん', jenis: 'noun', ket: 'Jepang' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tempat tinggal' }, { jp: 'さんねん', jenis: 'noun', ket: 'Tiga tahun' }, { jp: 'います', jenis: 'verb', ket: 'Tinggal/ada' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi sesaat' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 11 — frekuensi',
    indo: 'Seminggu dua kali pergi ke kolam renang.',
    urutan: [
      { jp: 'いっしゅうかん', jenis: 'noun', ket: 'Satu minggu' }, { jp: 'に', jenis: 'particle', ket: 'に menandai periode' }, { jp: 'にかい', jenis: 'noun', ket: 'Dua kali' }, { jp: 'プール', jenis: 'noun', ket: 'Kolam renang' }, { jp: 'へ', jenis: 'particle', ket: 'へ menandai arah' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'から', jenis: 'particle', ket: 'から menandai titik awal' }, { jp: 'かえります', jenis: 'verb', ket: 'Pulang' },
    ],
  },
  {
    bab: 'Bab 12 — lampau',
    indo: 'Cuaca kemarin hujan.',
    urutan: [
      { jp: 'きのうの てんき', jenis: 'noun', ket: 'Cuaca kemarin' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'あめ', jenis: 'noun', ket: 'Hujan' }, { jp: 'でした', jenis: 'verb', ket: 'Kopula lampau' },
    ],
    jebakan: [
      { jp: 'です', jenis: 'verb', ket: 'Bentuk sekarang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 12 — より',
    indo: 'Kereta lebih cepat daripada bus.',
    urutan: [
      { jp: 'でんしゃ', jenis: 'noun', ket: 'Kereta' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'バス', jenis: 'noun', ket: 'Bus' }, { jp: 'より', jenis: 'particle', ket: 'より menandai pembanding' }, { jp: 'はやいです', jenis: 'verb', ket: 'Cepat' },
    ],
    jebakan: [
      { jp: 'ほど', jenis: 'particle', ket: 'ほど dipakai untuk bentuk negatif' }, { jp: 'おそいです', jenis: 'verb', ket: 'Lambat' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 13 — に いきます (tujuan)',
    indo: 'Tahun depan pergi ke Jepang untuk bekerja.',
    urutan: [
      { jp: 'らいねん', jenis: 'noun', ket: 'Tahun depan' }, { jp: 'にほん', jenis: 'noun', ket: 'Jepang' }, { jp: 'へ', jenis: 'particle', ket: 'へ menandai arah' }, { jp: 'はたらきに', jenis: 'noun', ket: 'Untuk bekerja' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'かえります', jenis: 'verb', ket: 'Pulang' },
    ],
  },
  {
    bab: 'Bab 13 — に いきます',
    indo: 'Sabtu minggu ini pergi menonton film.',
    urutan: [
      { jp: 'こんしゅうの どようび', jenis: 'noun', ket: 'Sabtu minggu ini' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'えいが', jenis: 'noun', ket: 'Film' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'みに', jenis: 'noun', ket: 'Untuk menonton' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' }, { jp: 'から', jenis: 'particle', ket: 'から menandai titik awal' }, { jp: 'きます', jenis: 'verb', ket: 'Datang' },
    ],
  },
  {
    bab: 'Bab 14 — てください',
    indo: 'Tolong tulis nama di sini.',
    urutan: [
      { jp: 'ここ', jenis: 'noun', ket: 'Di sini' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tempat menulis' }, { jp: 'なまえ', jenis: 'noun', ket: 'Nama' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'かいてください', jenis: 'verb', ket: 'Tolong tulis' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'よんでください', jenis: 'verb', ket: 'Tolong baca' },
    ],
  },
  {
    bab: 'Bab 14 — ています',
    indo: 'Sekarang sedang menelepon.',
    urutan: [
      { jp: 'いま', jenis: 'noun', ket: 'Sekarang' }, { jp: 'でんわ', jenis: 'noun', ket: 'Telepon' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'かけています', jenis: 'verb', ket: 'Sedang menelepon' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'かけました', jenis: 'verb', ket: 'Bentuk lampau, bukan sedang' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Bab 15 — てもいいですか',
    indo: 'Bolehkah saya mengambil foto di sini?',
    urutan: [
      { jp: 'ここ', jenis: 'noun', ket: 'Di sini' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi' }, { jp: 'しゃしん', jenis: 'noun', ket: 'Foto' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'とっても いいですか', jenis: 'verb', ket: 'Bolehkah mengambil' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai keberadaan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'とっては いけません', jenis: 'verb', ket: 'Itu larangan, bukan izin' },
    ],
  },
  {
    bab: 'Bab 15 — てはいけません',
    indo: 'Dilarang memarkir mobil di sini.',
    urutan: [
      { jp: 'ここ', jenis: 'noun', ket: 'Di sini' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tempat parkir' }, { jp: 'くるま', jenis: 'noun', ket: 'Mobil' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'とめては いけません', jenis: 'verb', ket: 'Dilarang memarkir' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'とめても いいです', jenis: 'verb', ket: 'Itu izin, bukan larangan' },
    ],
  },
  {
    bab: 'Bab 16 — てから',
    indo: 'Setelah makan, saya belajar.',
    urutan: [
      { jp: 'ごはん', jenis: 'noun', ket: 'Nasi/makan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'たべてから', jenis: 'verb', ket: 'Setelah makan' }, { jp: 'べんきょうします', jenis: 'verb', ket: 'Belajar' },
    ],
    jebakan: [
      { jp: 'まえに', jenis: 'noun', ket: 'まえに berarti sebelum, bukan sesudah' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'たべます', jenis: 'verb', ket: 'Bentuk biasa tanpa てから' },
    ],
  },
  {
    bab: 'Bab 16 — どうやって',
    indo: 'Bagaimana cara pergi ke stasiun?',
    urutan: [
      { jp: 'えき', jenis: 'noun', ket: 'Stasiun' }, { jp: 'まで', jenis: 'particle', ket: 'まで menandai tujuan' }, { jp: 'どうやって', jenis: 'noun', ket: 'Dengan cara apa' }, { jp: 'いきますか', jenis: 'verb', ket: 'Pergi (tanya)' },
    ],
    jebakan: [
      { jp: 'から', jenis: 'particle', ket: 'から menandai titik awal' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'きますか', jenis: 'verb', ket: 'Datang, bukan pergi' },
    ],
  },
  {
    bab: 'Bab 17 — ないでください',
    indo: 'Jangan merokok di sini.',
    urutan: [
      { jp: 'ここ', jenis: 'noun', ket: 'Di sini' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' }, { jp: 'たばこ', jenis: 'noun', ket: 'Rokok' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'すわないでください', jenis: 'verb', ket: 'Jangan merokok' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'すってください', jenis: 'verb', ket: 'Itu perintah, bukan larangan' },
    ],
  },
  {
    bab: 'Bab 17 — なければなりません',
    indo: 'Saya harus minum obat.',
    urutan: [
      { jp: 'まいにち', jenis: 'noun', ket: 'Setiap hari' }, { jp: 'くすり', jenis: 'noun', ket: 'Obat' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'のまなければ なりません', jenis: 'verb', ket: 'Harus minum' },
    ],
    jebakan: [
      { jp: 'のんでは いけません', jenis: 'verb', ket: 'Itu larangan' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 18 — ことができます',
    indo: 'Bisa berbicara sedikit bahasa Jepang.',
    urutan: [
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'すこし', jenis: 'noun', ket: 'Sedikit' }, { jp: 'はなすことが できます', jenis: 'verb', ket: 'Bisa berbicara' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'できません', jenis: 'verb', ket: 'Bentuk negatif' }, { jp: 'はなします', jenis: 'verb', ket: 'Bentuk biasa, bukan "bisa"' },
    ],
  },
  {
    bab: 'Bab 18 — まえに',
    indo: 'Sebelum tidur, menyikat gigi.',
    urutan: [
      { jp: 'ねる', jenis: 'verb', ket: 'Tidur (bentuk kamus)' }, { jp: 'まえに', jenis: 'noun', ket: 'Sebelum' }, { jp: 'はを', jenis: 'noun', ket: 'Gigi' }, { jp: 'みがきます', jenis: 'verb', ket: 'Menyikat' },
    ],
    jebakan: [
      { jp: 'あとで', jenis: 'noun', ket: 'あとで berarti sesudah' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'あらいます', jenis: 'verb', ket: 'Mencuci, bukan menyikat gigi' },
    ],
  },
  {
    bab: 'Bab 19 — たことがあります',
    indo: 'Saya pernah mendaki Gunung Fuji.',
    urutan: [
      { jp: 'いちど', jenis: 'noun', ket: 'Sekali' }, { jp: 'ふじさん', jenis: 'noun', ket: 'Gunung Fuji' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tujuan mendaki' }, { jp: 'のぼった ことが あります', jenis: 'verb', ket: 'Pernah mendaki' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'のぼります', jenis: 'verb', ket: 'Bentuk biasa, bukan pengalaman' },
    ],
  },
  {
    bab: 'Bab 19 — たり〜たり',
    indo: 'Hari Minggu saya membaca buku dan bersih-bersih.',
    urutan: [
      { jp: 'にちようび', jenis: 'noun', ket: 'Hari Minggu' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'ほんを よんだり', jenis: 'verb', ket: 'Membaca (dan seterusnya)' }, { jp: 'そうじを したり', jenis: 'verb', ket: 'Bersih-bersih (dan seterusnya)' }, { jp: 'します', jenis: 'verb', ket: 'Melakukan' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'よみます', jenis: 'verb', ket: 'Bentuk biasa tanpa たり' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 20 — と おもいます',
    indo: 'Saya kira besok hujan.',
    urutan: [
      { jp: 'あした', jenis: 'noun', ket: 'Besok' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'あめ', jenis: 'noun', ket: 'Hujan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'ふると おもいます', jenis: 'verb', ket: 'Saya kira akan turun' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'ふります', jenis: 'verb', ket: 'Bentuk sopan, bukan bentuk biasa' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 20 — といっていました',
    indo: 'Dia bilang akan datang.',
    urutan: [
      { jp: 'かれ', jenis: 'noun', ket: 'Dia' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'くると', jenis: 'verb', ket: 'Akan datang (kutipan)' }, { jp: 'いっていました', jenis: 'verb', ket: 'Sedang mengatakan (lampau)' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'きました', jenis: 'verb', ket: 'Sudah datang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 21 — と おもいます',
    indo: 'Saya rasa pekerjaan ini berat.',
    urutan: [
      { jp: 'この しごと', jenis: 'noun', ket: 'Pekerjaan ini' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'とても', jenis: 'noun', ket: 'Sangat' }, { jp: 'たいへんだと おもいます', jenis: 'verb', ket: 'Saya rasa berat' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'たいへんです', jenis: 'verb', ket: 'Bentuk sopan, bukan kutipan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 21 — でしょう',
    indo: 'Mungkin besok juga dingin.',
    urutan: [
      { jp: 'たぶん', jenis: 'noun', ket: 'Mungkin' }, { jp: 'あした', jenis: 'noun', ket: 'Besok' }, { jp: 'も', jenis: 'particle', ket: 'も berarti juga' }, { jp: 'さむいでしょう', jenis: 'verb', ket: 'Kemungkinan dingin' },
    ],
    jebakan: [
      { jp: 'は', jenis: 'particle', ket: 'は menandai topik, bukan "juga"' }, { jp: 'あついでしょう', jenis: 'verb', ket: 'Panas, bukan dingin' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 22 — kata benda diterangkan',
    indo: 'Ini kue yang saya buat.',
    urutan: [
      { jp: 'これ', jenis: 'noun', ket: 'Ini' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'わたしが つくった ケーキ', jenis: 'noun', ket: 'Kue yang saya buat' }, { jp: 'です', jenis: 'verb', ket: 'Kopula sopan' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'つくります', jenis: 'verb', ket: 'Bentuk sopan, bukan penerang' }, { jp: 'が', jenis: 'particle', ket: 'が sendiri menandai subjek' },
    ],
  },
  {
    bab: 'Bab 22 — だれですか',
    indo: 'Orang yang ada di sana itu siapa?',
    urutan: [
      { jp: 'あそこ', jenis: 'noun', ket: 'Di sana' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tempat keberadaan' }, { jp: 'いる ひと', jenis: 'noun', ket: 'Orang yang ada' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'だれですか', jenis: 'verb', ket: 'Siapa (tanya)' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi' }, { jp: 'います', jenis: 'verb', ket: 'Bentuk sopan, bukan penerang' }, { jp: 'どこですか', jenis: 'verb', ket: 'Di mana, bukan siapa' },
    ],
  },
  {
    bab: 'Bab 23 — とき',
    indo: 'Waktu kecil saya sering bermain di sini.',
    urutan: [
      { jp: 'こどもの とき', jenis: 'noun', ket: 'Waktu kecil' }, { jp: 'ここ', jenis: 'noun', ket: 'Di sini' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat aksi' }, { jp: 'よく', jenis: 'noun', ket: 'Sering' }, { jp: 'あそびました', jenis: 'verb', ket: 'Bermain (lampau)' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'あそびます', jenis: 'verb', ket: 'Bentuk sekarang' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 23 — と (kondisi)',
    indo: 'Kalau musim semi, sakura mekar.',
    urutan: [
      { jp: 'はる', jenis: 'noun', ket: 'Musim semi' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'なると', jenis: 'verb', ket: 'Kalau menjadi (kondisi alami)' }, { jp: 'さくら', jenis: 'noun', ket: 'Sakura' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'さきます', jenis: 'verb', ket: 'Mekar' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' }, { jp: 'なります', jenis: 'verb', ket: 'Bentuk sopan tanpa と' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 24 — てあげます',
    indo: 'Saya meminjamkan payung kepada teman.',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'ともだち', jenis: 'noun', ket: 'Teman' }, { jp: 'に', jenis: 'particle', ket: 'に menandai penerima' }, { jp: 'かさ', jenis: 'noun', ket: 'Payung' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'かして あげました', jenis: 'verb', ket: 'Meminjamkan (untuk orang lain)' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'もらいます', jenis: 'verb', ket: 'Menerima, arahnya terbalik' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 24 — てくれます',
    indo: 'Senior mengajari saya pekerjaan.',
    urutan: [
      { jp: 'せんぱい', jenis: 'noun', ket: 'Senior' }, { jp: 'が', jenis: 'particle', ket: 'が menandai pemberi' }, { jp: 'しごと', jenis: 'noun', ket: 'Pekerjaan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'おしえて くれました', jenis: 'verb', ket: 'Mengajari (untuk saya)' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai penerima' }, { jp: 'あげました', jenis: 'verb', ket: 'Memberi ke orang lain, arahnya salah' }, { jp: 'は', jenis: 'particle', ket: 'は menandai topik' },
    ],
  },
  {
    bab: 'Bab 25 — たら',
    indo: 'Kalau hujan, saya tidak pergi.',
    urutan: [
      { jp: 'あめ', jenis: 'noun', ket: 'Hujan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'ふったら', jenis: 'verb', ket: 'Kalau turun' }, { jp: 'いきません', jenis: 'verb', ket: 'Tidak pergi' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' }, { jp: 'ふっても', jenis: 'verb', ket: 'ふっても berarti "walau turun"' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi (positif)' },
    ],
  },
  {
    bab: 'Bab 25 — ても',
    indo: 'Walau dingin, saya tetap bekerja.',
    urutan: [
      { jp: 'さむくても', jenis: 'verb', ket: 'Walau dingin' }, { jp: 'しごと', jenis: 'noun', ket: 'Pekerjaan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'します', jenis: 'verb', ket: 'Melakukan' },
    ],
    jebakan: [
      { jp: 'さむかったら', jenis: 'verb', ket: 'さむかったら berarti "kalau dingin"' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'やすみます', jenis: 'verb', ket: 'Beristirahat' },
    ],
  },
  {
    bab: 'Bab 26 — んです',
    indo: 'Kenapa hari ini Anda terlambat?',
    urutan: [
      { jp: 'きょう', jenis: 'noun', ket: 'Hari ini' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'どうして', jenis: 'noun', ket: 'Mengapa' }, { jp: 'じかんに おくれたんですか', jenis: 'verb', ket: 'Terlambat (meminta penjelasan)' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'おくれました', jenis: 'verb', ket: 'Bentuk biasa tanpa んです' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 26 — ていただけませんか',
    indo: 'Maaf, bisakah Anda mengajari saya ini?',
    urutan: [
      { jp: 'すみませんが', jenis: 'noun', ket: 'Maaf, tetapi' }, { jp: 'これ', jenis: 'noun', ket: 'Ini' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'おしえて いただけませんか', jenis: 'verb', ket: 'Bisakah diajari (sangat sopan)' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'おしえます', jenis: 'verb', ket: 'Bentuk biasa, bukan permintaan' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 27 — potensial',
    indo: 'Saya bisa berbahasa Jepang.',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'が', jenis: 'particle', ket: 'が dipakai dengan bentuk potensial' }, { jp: 'はなせます', jenis: 'verb', ket: 'Bisa berbicara' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek biasa' }, { jp: 'はなします', jenis: 'verb', ket: 'Bentuk biasa, bukan "bisa"' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Bab 27 — しか〜ません',
    indo: 'Di sini hanya bisa memakai kartu.',
    urutan: [
      { jp: 'ここ', jenis: 'noun', ket: 'Di sini' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'カード', jenis: 'noun', ket: 'Kartu' }, { jp: 'しか', jenis: 'particle', ket: 'しか menuntut bentuk negatif' }, { jp: 'つかえません', jenis: 'verb', ket: 'Tidak bisa memakai' },
    ],
    jebakan: [
      { jp: 'だけ', jenis: 'particle', ket: 'だけ menuntut bentuk positif' }, { jp: 'つかえます', jenis: 'verb', ket: 'Bentuk positif' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 28 — ながら',
    indo: 'Setiap hari saya belajar sambil mendengarkan musik.',
    urutan: [
      { jp: 'まいにち', jenis: 'noun', ket: 'Setiap hari' }, { jp: 'おんがく', jenis: 'noun', ket: 'Musik' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'ききながら', jenis: 'verb', ket: 'Sambil mendengarkan' }, { jp: 'べんきょうします', jenis: 'verb', ket: 'Belajar' },
    ],
    jebakan: [
      { jp: 'きいて', jenis: 'verb', ket: 'きいて memutus kalimat, bukan "sambil"' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Bab 28 — ながら (kerja)',
    indo: 'Sambil bekerja, saya sedang belajar bahasa Jepang.',
    urutan: [
      { jp: 'はたらきながら', jenis: 'verb', ket: 'Sambil bekerja' }, { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'べんきょうしています', jenis: 'verb', ket: 'Sedang belajar' },
    ],
    jebakan: [
      { jp: 'はたらいて', jenis: 'verb', ket: 'はたらいて bukan bentuk "sambil"' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 29 — てしまいました',
    indo: 'Payung saya tertinggal di kereta.',
    urutan: [
      { jp: 'でんしゃ', jenis: 'noun', ket: 'Kereta' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tempat tertinggal' }, { jp: 'かさ', jenis: 'noun', ket: 'Payung' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'わすれて しまいました', jenis: 'verb', ket: 'Terlanjur meninggalkan' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'わすれました', jenis: 'verb', ket: 'Tanpa しまいました tidak bernuansa "terlanjur"' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 29 — てあります',
    indo: 'Jendela kamar dalam keadaan tertutup.',
    urutan: [
      { jp: 'へやの まど', jenis: 'noun', ket: 'Jendela kamar' }, { jp: 'が', jenis: 'particle', ket: 'が menandai keadaan' }, { jp: 'ずっと', jenis: 'noun', ket: 'Terus-menerus' }, { jp: 'しまって あります', jenis: 'verb', ket: 'Dalam keadaan tertutup' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek aksi' }, { jp: 'います', jenis: 'verb', ket: 'います untuk makhluk hidup' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 30 — ておきます',
    indo: 'Saya siapkan untuk besok.',
    urutan: [
      { jp: 'もう', jenis: 'noun', ket: 'Sudah' }, { jp: 'あしたの じゅんび', jenis: 'noun', ket: 'Persiapan untuk besok' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'して おきます', jenis: 'verb', ket: 'Melakukan lebih dulu (persiapan)' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'しました', jenis: 'verb', ket: 'Lampau tanpa nuansa persiapan' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 30 — ておきました',
    indo: 'Saya sudah menelepon lebih dulu.',
    urutan: [
      { jp: 'もう', jenis: 'noun', ket: 'Sudah' }, { jp: 'でんわ', jenis: 'noun', ket: 'Telepon' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'かけて おきました', jenis: 'verb', ket: 'Sudah melakukan sebagai persiapan' },
    ],
    jebakan: [
      { jp: 'まだ', jenis: 'noun', ket: 'Belum' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'かけます', jenis: 'verb', ket: 'Bentuk sekarang' },
    ],
  },
  {
    bab: 'Bab 31 — つもりです',
    indo: 'Saya berniat menikah bulan depan.',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'らいげつ', jenis: 'noun', ket: 'Bulan depan' }, { jp: 'けっこんする つもりです', jenis: 'verb', ket: 'Berniat menikah' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'けっこんしました', jenis: 'verb', ket: 'Sudah menikah' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 31 — でしょう',
    indo: 'Besok mungkin cerah.',
    urutan: [
      { jp: 'あした', jenis: 'noun', ket: 'Besok' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'たぶん', jenis: 'noun', ket: 'Mungkin' }, { jp: 'はれるでしょう', jenis: 'verb', ket: 'Kemungkinan cerah' },
    ],
    jebakan: [
      { jp: 'あめでしょう', jenis: 'verb', ket: 'Berarti hujan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 32 — やすい',
    indo: 'Buku ini sangat mudah dibaca.',
    urutan: [
      { jp: 'この ほん', jenis: 'noun', ket: 'Buku ini' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'とても', jenis: 'noun', ket: 'Sangat' }, { jp: 'よみやすいです', jenis: 'verb', ket: 'Mudah dibaca' },
    ],
    jebakan: [
      { jp: 'よみにくいです', jenis: 'verb', ket: 'Berarti sulit dibaca' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 32 — く なります',
    indo: 'Bahasa Jepang saya menjadi lancar.',
    urutan: [
      { jp: 'わたしの にほんご', jenis: 'noun', ket: 'Bahasa Jepang saya' }, { jp: 'が', jenis: 'particle', ket: 'が menandai yang berubah' }, { jp: 'だんだん', jenis: 'noun', ket: 'Semakin' }, { jp: 'じょうずに なりました', jenis: 'verb', ket: 'Menjadi lancar' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'じょうずです', jenis: 'verb', ket: 'Tetap lancar, bukan berubah' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Bab 33 — かもしれません',
    indo: 'Besok mungkin hujan.',
    urutan: [
      { jp: 'あした', jenis: 'noun', ket: 'Besok' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'あめ', jenis: 'noun', ket: 'Hujan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'ふる かもしれません', jenis: 'verb', ket: 'Mungkin turun' },
    ],
    jebakan: [
      { jp: 'ふります', jenis: 'verb', ket: 'Pernyataan pasti, bukan kemungkinan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 33 — ように',
    indo: 'Saya hati-hati agar tidak masuk angin.',
    urutan: [
      { jp: 'かぜ', jenis: 'noun', ket: 'Masuk angin' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'ひかない ように', jenis: 'verb', ket: 'Agar tidak tertular' }, { jp: 'き を つけます', jenis: 'verb', ket: 'Berhati-hati' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'ひきます', jenis: 'verb', ket: 'Bentuk positif' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 34 — とおりに',
    indo: 'Kerjakan sesuai kata senior.',
    urutan: [
      { jp: 'しごと', jenis: 'noun', ket: 'Pekerjaan' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'せんぱいの いう とおりに', jenis: 'noun', ket: 'Sesuai yang senior katakan' }, { jp: 'して ください', jenis: 'verb', ket: 'Tolong lakukan' },
    ],
    jebakan: [
      { jp: 'とおりで', jenis: 'noun', ket: 'Bentuk yang salah untuk "sesuai"' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'します', jenis: 'verb', ket: 'Bentuk biasa' },
    ],
  },
  {
    bab: 'Bab 34 — あとで',
    indo: 'Setelah kerja, saya belajar bahasa Jepang.',
    urutan: [
      { jp: 'しごとの あとで', jenis: 'noun', ket: 'Setelah kerja' }, { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'べんきょうします', jenis: 'verb', ket: 'Belajar' },
    ],
    jebakan: [
      { jp: 'まえに', jenis: 'noun', ket: 'Berarti sebelum' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Bab 35 — たら (syarat)',
    indo: 'Kalau buah ini murah, saya beli dua.',
    urutan: [
      { jp: 'この くだもの', jenis: 'noun', ket: 'Buah ini' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'やすかったら', jenis: 'verb', ket: 'Kalau murah' }, { jp: 'ふたつ', jenis: 'noun', ket: 'Dua buah' }, { jp: 'かいます', jenis: 'verb', ket: 'Membeli' },
    ],
    jebakan: [
      { jp: 'たかかったら', jenis: 'verb', ket: 'Berarti kalau mahal' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 35 — ば',
    indo: 'Kalau tombol ini ditekan, pintu terbuka.',
    urutan: [
      { jp: 'ボタン', jenis: 'noun', ket: 'Tombol' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'おせば', jenis: 'verb', ket: 'Kalau ditekan' }, { jp: 'ドア', jenis: 'noun', ket: 'Pintu' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'あきます', jenis: 'verb', ket: 'Terbuka' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'しめます', jenis: 'verb', ket: 'Menutup' }, { jp: 'おきます', jenis: 'verb', ket: 'Meletakkan' },
    ],
  },
  {
    bab: 'Bab 36 — ように (tujuan)',
    indo: 'Saya berlatih setiap hari agar bisa berbahasa Jepang.',
    urutan: [
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'が', jenis: 'particle', ket: 'が dipakai dengan bentuk potensial' }, { jp: 'はなせる ように', jenis: 'verb', ket: 'Agar bisa berbicara' }, { jp: 'まいにち', jenis: 'noun', ket: 'Setiap hari' }, { jp: 'れんしゅうします', jenis: 'verb', ket: 'Berlatih' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'ために', jenis: 'noun', ket: 'ために menuntut kata kerja bentuk kamus' }, { jp: 'れんしゅうしました', jenis: 'verb', ket: 'Lampau' },
    ],
  },
  {
    bab: 'Bab 36 — ために',
    indo: 'Saya bekerja untuk keluarga.',
    urutan: [
      { jp: 'かぞく', jenis: 'noun', ket: 'Keluarga' }, { jp: 'の', jenis: 'particle', ket: 'の menghubungkan kata benda' }, { jp: 'ために', jenis: 'noun', ket: 'Untuk (tujuan)' }, { jp: 'はたらきます', jenis: 'verb', ket: 'Bekerja' },
    ],
    jebakan: [
      { jp: 'ように', jenis: 'noun', ket: 'ように dipakai untuk kemampuan/keadaan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'やすみます', jenis: 'verb', ket: 'Beristirahat' },
    ],
  },
  {
    bab: 'Bab 37 — ために (sebab)',
    indo: 'Karena ada kecelakaan, kereta terlambat.',
    urutan: [
      { jp: 'じこ', jenis: 'noun', ket: 'Kecelakaan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai sebab' }, { jp: 'あった ために', jenis: 'verb', ket: 'Karena ada' }, { jp: 'でんしゃ', jenis: 'noun', ket: 'Kereta' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'おくれました', jenis: 'verb', ket: 'Terlambat' },
    ],
    jebakan: [
      { jp: 'から', jenis: 'particle', ket: 'から juga bisa, tetapi bentuk ために yang diminta' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'きます', jenis: 'verb', ket: 'Datang' },
    ],
  },
  {
    bab: 'Bab 37 — ようになりました',
    indo: 'Sekarang saya sudah mengerti bahasa Jepang.',
    urutan: [
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'が', jenis: 'particle', ket: 'が menandai yang berubah' }, { jp: 'すこし', jenis: 'noun', ket: 'Sedikit' }, { jp: 'わかる ように なりました', jenis: 'verb', ket: 'Menjadi mengerti' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'わかりました', jenis: 'verb', ket: '"Sudah mengerti", bukan perubahan' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Bab 38 — のは',
    indo: 'Belajar bahasa Jepang itu menyenangkan.',
    urutan: [
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'べんきょうするのは', jenis: 'verb', ket: '(Hal) belajar' }, { jp: 'たのしいです', jenis: 'verb', ket: 'Menyenangkan' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'たのしかったです', jenis: 'verb', ket: 'Lampau' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 38 — のを',
    indo: 'Saya mendengar dia bernyanyi.',
    urutan: [
      { jp: 'かれ', jenis: 'noun', ket: 'Dia' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek anak kalimat' }, { jp: 'うたうのを', jenis: 'verb', ket: '(Hal) bernyanyi' }, { jp: 'ききました', jenis: 'verb', ket: 'Mendengar' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'うたいます', jenis: 'verb', ket: 'Bentuk sopan, bukan nomina' }, { jp: 'みました', jenis: 'verb', ket: 'Melihat, bukan mendengar' },
    ],
  },
  {
    bab: 'Bab 39 — ので',
    indo: 'Karena hujan, saya tidak pergi.',
    urutan: [
      { jp: 'あめ', jenis: 'noun', ket: 'Hujan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'ふっている ので', jenis: 'verb', ket: 'Karena sedang turun' }, { jp: 'いきません', jenis: 'verb', ket: 'Tidak pergi' },
    ],
    jebakan: [
      { jp: 'から', jenis: 'particle', ket: 'から terlalu langsung untuk alasan sopan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
  },
  {
    bab: 'Bab 39 — ので (alasan)',
    indo: 'Karena tidak ada waktu, saya naik taksi.',
    urutan: [
      { jp: 'じかん', jenis: 'noun', ket: 'Waktu' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'ない ので', jenis: 'verb', ket: 'Karena tidak ada' }, { jp: 'タクシー', jenis: 'noun', ket: 'Taksi' }, { jp: 'で', jenis: 'particle', ket: 'で menandai kendaraan' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'あるので', jenis: 'verb', ket: 'Berarti "karena ada"' }, { jp: 'かえります', jenis: 'verb', ket: 'Pulang' },
    ],
  },
  {
    bab: 'Bab 40 — かどうか',
    indo: 'Tolong periksa apakah toko ini buka.',
    urutan: [
      { jp: 'この みせ', jenis: 'noun', ket: 'Toko ini' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'あいている か どうか', jenis: 'verb', ket: 'Apakah buka atau tidak' }, { jp: 'しらべて ください', jenis: 'verb', ket: 'Tolong periksa' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'しらべます', jenis: 'verb', ket: 'Bentuk biasa' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 40 — てみます',
    indo: 'Saya mencoba memakai sepatu baru.',
    urutan: [
      { jp: 'きのう', jenis: 'noun', ket: 'Kemarin' }, { jp: 'あたらしい くつ', jenis: 'noun', ket: 'Sepatu baru' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'はいて みました', jenis: 'verb', ket: 'Mencoba memakai' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'はきます', jenis: 'verb', ket: 'Tanpa みません berarti tidak mencoba' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 41 — ていただきます',
    indo: 'Saya diajari bahasa Jepang oleh guru.',
    urutan: [
      { jp: 'せんせい', jenis: 'noun', ket: 'Guru' }, { jp: 'に', jenis: 'particle', ket: 'に menandai pemberi' }, { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'おしえて いただきました', jenis: 'verb', ket: 'Menerima ajaran (sopan)' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'あげました', jenis: 'verb', ket: 'Memberi, arahnya salah' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Bab 41 — てくれます',
    indo: 'Ayah membelikan saya tas.',
    urutan: [
      { jp: 'ちち', jenis: 'noun', ket: 'Ayah' }, { jp: 'が', jenis: 'particle', ket: 'が menandai pemberi' }, { jp: 'かばん', jenis: 'noun', ket: 'Tas' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'かって くれました', jenis: 'verb', ket: 'Membelikan untuk saya' },
    ],
    jebakan: [
      { jp: 'に', jenis: 'particle', ket: 'に menandai penerima' }, { jp: 'もらいました', jenis: 'verb', ket: 'Menerima, bukan memberi' }, { jp: 'は', jenis: 'particle', ket: 'は menandai topik' },
    ],
  },
  {
    bab: 'Bab 42 — ために (tujuan kerja)',
    indo: 'Saya belajar bahasa Jepang untuk bekerja di Jepang.',
    urutan: [
      { jp: 'にほん', jenis: 'noun', ket: 'Jepang' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat kerja' }, { jp: 'はたらく ために', jenis: 'verb', ket: 'Untuk bekerja' }, { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'べんきょうしています', jenis: 'verb', ket: 'Sedang belajar' },
    ],
    jebakan: [
      { jp: 'ように', jenis: 'noun', ket: 'ように untuk kemampuan, bukan tujuan kerja' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'はたらきます', jenis: 'verb', ket: 'Bentuk sopan, bukan penerang' },
    ],
  },
  {
    bab: 'Bab 42 — のに',
    indo: 'Sudah minum obat, tetapi masih sakit.',
    urutan: [
      { jp: 'くすり', jenis: 'noun', ket: 'Obat' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'のんだ のに', jenis: 'verb', ket: 'Padahal sudah minum' }, { jp: 'まだ', jenis: 'noun', ket: 'Masih' }, { jp: 'いたいです', jenis: 'verb', ket: 'Sakit' },
    ],
    jebakan: [
      { jp: 'ので', jenis: 'particle', ket: 'ので berarti "karena"' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'いたくないです', jenis: 'verb', ket: 'Tidak sakit' },
    ],
  },
  {
    bab: 'Bab 43 — そうです (penampakan)',
    indo: 'Kue ini kelihatan sangat enak.',
    urutan: [
      { jp: 'この ケーキ', jenis: 'noun', ket: 'Kue ini' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'とても', jenis: 'noun', ket: 'Sangat' }, { jp: 'おいしそうです', jenis: 'verb', ket: 'Kelihatan enak' },
    ],
    jebakan: [
      { jp: 'おいしいです', jenis: 'verb', ket: 'Pernyataan langsung, bukan penampakan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 43 — ふりそうです',
    indo: 'Kelihatannya sebentar lagi hujan.',
    urutan: [
      { jp: 'いまにも', jenis: 'noun', ket: 'Sebentar lagi' }, { jp: 'あめ', jenis: 'noun', ket: 'Hujan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'ふりそうです', jenis: 'verb', ket: 'Kelihatan akan turun' },
    ],
    jebakan: [
      { jp: 'ふります', jenis: 'verb', ket: 'Pernyataan langsung' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 44 — すぎます',
    indo: 'Pekerjaan ini terlalu berat.',
    urutan: [
      { jp: 'この しごと', jenis: 'noun', ket: 'Pekerjaan ini' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'ほんとうに', jenis: 'noun', ket: 'Sungguh' }, { jp: 'たいへん すぎます', jenis: 'verb', ket: 'Terlalu berat' },
    ],
    jebakan: [
      { jp: 'たいへんです', jenis: 'verb', ket: 'Tanpa すぎません berarti tidak berlebihan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 44 — すぎて',
    indo: 'Tas ini terlalu besar sehingga tidak bisa dipakai.',
    urutan: [
      { jp: 'この かばん', jenis: 'noun', ket: 'Tas ini' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'おおきすぎて', jenis: 'verb', ket: 'Terlalu besar sehingga' }, { jp: 'つかえません', jenis: 'verb', ket: 'Tidak bisa dipakai' },
    ],
    jebakan: [
      { jp: 'おおきくて', jenis: 'verb', ket: 'Tanpa すぎません berarti tidak berlebihan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'つかいます', jenis: 'verb', ket: 'Memakai (positif)' },
    ],
  },
  {
    bab: 'Bab 45 — ばあいは',
    indo: 'Kalau hujan, rapat dibatalkan.',
    urutan: [
      { jp: 'あめ', jenis: 'noun', ket: 'Hujan' }, { jp: 'の', jenis: 'particle', ket: 'の menghubungkan kata benda' }, { jp: 'ばあい', jenis: 'noun', ket: 'Kasus/keadaan' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'かいぎ', jenis: 'noun', ket: 'Rapat' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'やめます', jenis: 'verb', ket: 'Membatalkan' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'やめました', jenis: 'verb', ket: 'Lampau' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 45 — ばあい (kehilangan)',
    indo: 'Kalau kehilangan paspor, pergi ke polisi.',
    urutan: [
      { jp: 'パスポート', jenis: 'noun', ket: 'Paspor' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'なくした ばあい は', jenis: 'verb', ket: 'Kalau kehilangan' }, { jp: 'けいさつ', jenis: 'noun', ket: 'Polisi' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tujuan' }, { jp: 'いきます', jenis: 'verb', ket: 'Pergi' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'なくします', jenis: 'verb', ket: 'Bentuk sopan, bukan lampau' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 46 — ところです',
    indo: 'Sekarang saya sedang makan.',
    urutan: [
      { jp: 'いま', jenis: 'noun', ket: 'Sekarang' }, { jp: 'ごはん', jenis: 'noun', ket: 'Makan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'たべて いるところです', jenis: 'verb', ket: 'Sedang dalam proses makan' },
    ],
    jebakan: [
      { jp: 'たべました', jenis: 'verb', ket: 'Sudah selesai' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 46 — たばかりです',
    indo: 'Saya baru saja sampai di Jepang.',
    urutan: [
      { jp: 'さっき', jenis: 'noun', ket: 'Baru saja' }, { jp: 'にほん', jenis: 'noun', ket: 'Jepang' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tujuan' }, { jp: 'きた ばかりです', jenis: 'verb', ket: 'Baru sampai' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'いきました', jenis: 'verb', ket: 'Pergi, bukan sampai' }, { jp: 'から', jenis: 'particle', ket: 'から menandai titik awal' },
    ],
  },
  {
    bab: 'Bab 47 — そうです (kabar)',
    indo: 'Menurut prakiraan cuaca, besok cerah.',
    urutan: [
      { jp: 'てんきよほう', jenis: 'noun', ket: 'Prakiraan cuaca' }, { jp: 'に', jenis: 'particle', ket: 'に よると menandai sumber' }, { jp: 'よると', jenis: 'particle', ket: 'よると "menurut"' }, { jp: 'あした', jenis: 'noun', ket: 'Besok' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'はれる そうです', jenis: 'verb', ket: 'Katanya cerah' },
    ],
    jebakan: [
      { jp: 'で', jenis: 'particle', ket: 'で menandai alat' }, { jp: 'はれます', jenis: 'verb', ket: 'Pernyataan langsung' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' },
    ],
  },
  {
    bab: 'Bab 47 — ようです',
    indo: 'Sepertinya dia sakit.',
    urutan: [
      { jp: 'かれ', jenis: 'noun', ket: 'Dia' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'びょうき', jenis: 'noun', ket: 'Sakit' }, { jp: 'の', jenis: 'particle', ket: 'の sebelum よう' }, { jp: 'ようです', jenis: 'verb', ket: 'Sepertinya' },
    ],
    jebakan: [
      { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'びょうきです', jenis: 'verb', ket: 'Pernyataan pasti' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 48 — 使役',
    indo: 'Guru menyuruh siswa membaca buku.',
    urutan: [
      { jp: 'せんせい', jenis: 'noun', ket: 'Guru' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'がくせい', jenis: 'noun', ket: 'Siswa' }, { jp: 'に', jenis: 'particle', ket: 'に menandai yang disuruh' }, { jp: 'ほん', jenis: 'noun', ket: 'Buku' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'よませました', jenis: 'verb', ket: 'Menyuruh membaca' },
    ],
    jebakan: [
      { jp: 'よみました', jenis: 'verb', ket: 'Membaca sendiri, bukan menyuruh' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Bab 48 — 使役 (anak)',
    indo: 'Saya membiarkan anak bermain di luar.',
    urutan: [
      { jp: 'わたし', jenis: 'noun', ket: 'Saya' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'こども', jenis: 'noun', ket: 'Anak' }, { jp: 'を', jenis: 'particle', ket: 'を menandai yang dibiarkan' }, { jp: 'そと', jenis: 'noun', ket: 'Luar' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tempat' }, { jp: 'あそばせました', jenis: 'verb', ket: 'Membiarkan bermain' },
    ],
    jebakan: [
      { jp: 'あそびました', jenis: 'verb', ket: 'Bermain sendiri' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Bab 49 — 尊敬語',
    indo: 'Direktur sudah pulang.',
    urutan: [
      { jp: 'しゃちょう', jenis: 'noun', ket: 'Direktur' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'もう', jenis: 'noun', ket: 'Sudah' }, { jp: 'かえられました', jenis: 'verb', ket: 'Pulang (bentuk hormat)' },
    ],
    jebakan: [
      { jp: 'かえりました', jenis: 'verb', ket: 'Bentuk biasa, bukan hormat' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' },
    ],
  },
  {
    bab: 'Bab 49 — 尊敬語 (tanya)',
    indo: 'Guru datang jam berapa?',
    urutan: [
      { jp: 'せんせい', jenis: 'noun', ket: 'Guru' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'なんじ', jenis: 'noun', ket: 'Jam berapa' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'こられますか', jenis: 'verb', ket: 'Datang (bentuk hormat)' },
    ],
    jebakan: [
      { jp: 'きます', jenis: 'verb', ket: 'Bentuk biasa, bukan hormat' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Bab 50 — 謙譲語',
    indo: 'Barangnya saya yang bawa.',
    urutan: [
      { jp: 'にもつ', jenis: 'noun', ket: 'Barang bawaan' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'わたし', jenis: 'noun', ket: 'Saya' }, { jp: 'が', jenis: 'particle', ket: 'が menandai pelaku' }, { jp: 'おもちします', jenis: 'verb', ket: 'Membawa (bentuk merendah)' },
    ],
    jebakan: [
      { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'もちます', jenis: 'verb', ket: 'Bentuk biasa, bukan merendah' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' },
    ],
  },
  {
    bab: 'Bab 50 — 謙譲語 (kunjungan)',
    indo: 'Besok saya akan berkunjung ke rumah Anda.',
    urutan: [
      { jp: 'あした', jenis: 'noun', ket: 'Besok' }, { jp: 'おたく', jenis: 'noun', ket: 'Rumah Anda (sopan)' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tujuan' }, { jp: 'うかがいます', jenis: 'verb', ket: 'Berkunjung (bentuk merendah)' },
    ],
    jebakan: [
      { jp: 'いきます', jenis: 'verb', ket: 'Bentuk biasa, bukan merendah' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Hell — たら + て形',
    indo: 'Kalau hujan, saya pergi membawa payung.',
    urutan: [
      { jp: 'あめ', jenis: 'noun', ket: 'Hujan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'ふったら', jenis: 'verb', ket: 'Kalau turun' }, { jp: 'かさ', jenis: 'noun', ket: 'Payung' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'もって', jenis: 'verb', ket: 'Membawa (て形)' }, { jp: 'でかけます', jenis: 'verb', ket: 'Keluar rumah' },
    ],
    jebakan: [
      { jp: 'ふっても', jenis: 'verb', ket: 'Berarti "walau turun"' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'でかけました', jenis: 'verb', ket: 'Lampau' },
    ],
  },
  {
    bab: 'Hell — たら + すぐ',
    indo: 'Kalau pekerjaan selesai, saya langsung pulang.',
    urutan: [
      { jp: 'しごと', jenis: 'noun', ket: 'Pekerjaan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'おわったら', jenis: 'verb', ket: 'Kalau selesai' }, { jp: 'すぐ', jenis: 'noun', ket: 'Langsung' }, { jp: 'かえります', jenis: 'verb', ket: 'Pulang' },
    ],
    jebakan: [
      { jp: 'おわっても', jenis: 'verb', ket: 'Berarti "walau selesai"' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'きます', jenis: 'verb', ket: 'Datang' },
    ],
  },
  {
    bab: 'Hell — ために (agar)',
    indo: 'Saya menulis setiap hari agar hafal bahasa Jepang.',
    urutan: [
      { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'おぼえる ために', jenis: 'verb', ket: 'Agar hafal' }, { jp: 'まいにち', jenis: 'noun', ket: 'Setiap hari' }, { jp: 'かきます', jenis: 'verb', ket: 'Menulis' },
    ],
    jebakan: [
      { jp: 'ように', jenis: 'noun', ket: 'ように untuk kemampuan' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'よみます', jenis: 'verb', ket: 'Membaca' },
    ],
  },
  {
    bab: 'Hell — から (sebab)',
    indo: 'Karena kereta terlambat, saya tidak sempat rapat.',
    urutan: [
      { jp: 'でんしゃ', jenis: 'noun', ket: 'Kereta' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'おくれた から', jenis: 'verb', ket: 'Karena terlambat' }, { jp: 'かいぎ', jenis: 'noun', ket: 'Rapat' }, { jp: 'に', jenis: 'particle', ket: 'に menandai tujuan' }, { jp: 'まにあいませんでした', jenis: 'verb', ket: 'Tidak sempat' },
    ],
    jebakan: [
      { jp: 'ので', jenis: 'particle', ket: 'ので lebih halus, tetapi bentuk yang diminta から' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'まにあいました', jenis: 'verb', ket: 'Sempat (positif)' },
    ],
  },
  {
    bab: 'Hell — ながら (kerja)',
    indo: 'Sambil bekerja, saya menghafal bahasa Jepang.',
    urutan: [
      { jp: 'しごとを しながら', jenis: 'verb', ket: 'Sambil bekerja' }, { jp: 'にほんご', jenis: 'noun', ket: 'Bahasa Jepang' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'おぼえました', jenis: 'verb', ket: 'Menghafal' },
    ],
    jebakan: [
      { jp: 'して', jenis: 'verb', ket: 'して bukan bentuk "sambil"' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai alat' },
    ],
  },
  {
    bab: 'Hell — て形 (ventilasi)',
    indo: 'Saya membuka jendela dan memasukkan udara.',
    urutan: [
      { jp: 'まど', jenis: 'noun', ket: 'Jendela' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'あけて', jenis: 'verb', ket: 'Membuka (て形)' }, { jp: 'くうきを いれます', jenis: 'verb', ket: 'Memasukkan udara' },
    ],
    jebakan: [
      { jp: 'しめて', jenis: 'verb', ket: 'Menutup, bukan membuka' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'で', jenis: 'particle', ket: 'で menandai tempat' },
    ],
  },
  {
    bab: 'Hell — たら (jalan)',
    indo: 'Kalau mobil lewat, seberangi jalan.',
    urutan: [
      { jp: 'くるま', jenis: 'noun', ket: 'Mobil' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'とおったら', jenis: 'verb', ket: 'Kalau lewat' }, { jp: 'みち', jenis: 'noun', ket: 'Jalan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'わたって ください', jenis: 'verb', ket: 'Tolong seberangi' },
    ],
    jebakan: [
      { jp: 'とおっても', jenis: 'verb', ket: 'Berarti "walau lewat"' }, { jp: 'に', jenis: 'particle', ket: 'に menandai waktu' }, { jp: 'わたりました', jenis: 'verb', ket: 'Lampau' },
    ],
  },
  {
    bab: 'Hell — てから (obat)',
    indo: 'Setelah makan, minum obat.',
    urutan: [
      { jp: 'ごはんを たべてから', jenis: 'verb', ket: 'Setelah makan' }, { jp: 'くすり', jenis: 'noun', ket: 'Obat' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'のみます', jenis: 'verb', ket: 'Minum' },
    ],
    jebakan: [
      { jp: 'まえに', jenis: 'noun', ket: 'Berarti sebelum' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'たべます', jenis: 'verb', ket: 'Bentuk biasa' },
    ],
  },
  {
    bab: 'Hell — てから (cuci tangan)',
    indo: 'Setelah mencuci tangan, mulai bekerja.',
    urutan: [
      { jp: 'てを あらってから', jenis: 'verb', ket: 'Setelah mencuci tangan' }, { jp: 'しごと', jenis: 'noun', ket: 'Pekerjaan' }, { jp: 'を', jenis: 'particle', ket: 'を menandai objek' }, { jp: 'します', jenis: 'verb', ket: 'Melakukan' },
    ],
    jebakan: [
      { jp: 'まえに', jenis: 'noun', ket: 'Berarti sebelum' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'あらいます', jenis: 'verb', ket: 'Mencuci (bentuk biasa)' },
    ],
  },
  {
    bab: 'Hell — なら',
    indo: 'Kalau besok hujan, rapat dilakukan online.',
    urutan: [
      { jp: 'あした', jenis: 'noun', ket: 'Besok' }, { jp: 'あめ', jenis: 'noun', ket: 'Hujan' }, { jp: 'なら', jenis: 'particle', ket: 'なら menandai syarat topik' }, { jp: 'かいぎ', jenis: 'noun', ket: 'Rapat' }, { jp: 'は', jenis: 'particle', ket: 'Penanda topik' }, { jp: 'オンラインで します', jenis: 'verb', ket: 'Melakukan secara online' },
    ],
    jebakan: [
      { jp: 'たら', jenis: 'particle', ket: 'たら menempel pada kata kerja, bukan kata benda' }, { jp: 'が', jenis: 'particle', ket: 'が menandai subjek' }, { jp: 'やめます', jenis: 'verb', ket: 'Membatalkan' },
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
