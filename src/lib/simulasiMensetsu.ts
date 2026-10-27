/**
 * lib/simulasiMensetsu.ts — mesin penilaian Mode Simulasi wawancara.
 *
 * KENAPA DETERMINISTIK, BUKAN "AI MENCocokkan"
 * --------------------------------------------
 * Jawaban mensetsu itu PRIBADI ("nama saya Budi", "saya dari Malang"). Tidak ada
 * kunci jawaban yang bisa dibandingkan persis, jadi "apakah jawabannya sama
 * dengan DB" tidak punya jawaban benar/salah — yang bisa diukur adalah:
 *
 *   1. seberapa banyak kalimat yang SUDAH DISIAPKAN siswa benar-benar terucap
 *      (kecocokan dengan acuan: jawaban Jepang miliknya sendiri, atau contoh
 *      bank kalau ia belum mengisi);
 *   2. apakah bicaranya tersendat oleh pengisi suara (えーと / あのー);
 *   3. apakah ia menjawab dalam batas waktu;
 *   4. apakah bentuk sopannya (です／ます) dan salamnya muncul.
 *
 * Semuanya bisa dihitung di perangkat tanpa API, tanpa biaya, dan tanpa
 * mengirim suara siapa pun ke mana-mana — penting karena penggunanya siswa.
 * Penilaian AI (kalau nanti diminta) adalah LAPISAN TAMBAHAN di atas angka ini,
 * bukan pengganti: angka yang bisa dijelaskan lebih berguna untuk latihan
 * daripada nilai yang datang dari kotak hitam.
 *
 * KENAPA BIGRAM, BUKAN KATA
 * -------------------------
 * Bahasa Jepang ditulis tanpa spasi, jadi memecah "kata" butuh analisis
 * morfologi (MeCab dan sejenisnya) — pustaka berat yang tidak sepadan untuk
 * satu mode latihan. Bigram karakter (pasangan dua huruf) tidak butuh kamus,
 * tahan terhadap salah dengar STT sebagian, dan tetap mengukur hal yang benar:
 * berapa persen rangkaian huruf dari acuan yang benar-benar muncul.
 *
 * Batas yang diterima: kalimat yang MAKNANYA sama tapi disusun dengan kata
 * berbeda akan dinilai rendah. Karena itu acuan utamanya adalah jawaban yang
 * ditulis siswa sendiri — bukan teks asing yang tidak pernah ia lihat.
 */

/** Bagian soal yang dibutuhkan mode simulasi. */
export interface SoalSimulasi {
  kode: string;
  tahap: string;
  jp: string;
  romaji: string;
  arti: string;
  jawaban_jp: string | null;
  jawaban_arti: string | null;
}

/** Kode catatan — komponen yang menerjemahkan, bukan modul ini. */
export type CatatanKode =
  | 'kosong'
  | 'tanpa_acuan'
  | 'ada_filler'
  | 'terlalu_singkat'
  | 'lewat_waktu'
  | 'kurang_sopan'
  | 'bagus';

export interface Catatan {
  kode: CatatanKode;
  angka?: number;
}

export interface AspekNilai {
  /** 0–50. `null` = tidak ada acuan, jadi aspek ini dilewati (bukan dinolkan). */
  kecocokan: number | null;
  /** 0–25. */
  kelancaran: number;
  /** 0–15. */
  waktu: number;
  /** 0–10. */
  sopan: number;
}

export interface HasilNilai {
  /** 0–100, sudah dinormalkan kalau ada aspek yang dilewati. */
  total: number;
  grade: 'A' | 'B' | 'C' | 'D';
  aspek: AspekNilai;
  catatan: Catatan[];
  /** Dari mana teks acuan diambil — ditampilkan supaya siswa tahu dasarnya. */
  acuan: 'siswa' | 'bank' | 'tidak-ada';
}

export const BOBOT = { kecocokan: 50, kelancaran: 25, waktu: 15, sopan: 10 } as const;

/**
 * Nilai tertinggi saat tidak ada jawaban acuan.
 *
 * Tanpa acuan, aspek terpenting (isi) tidak diukur sama sekali — jadi nilai A
 * akan menyesatkan. 70 = batas B; siswa tetap bisa lulus, tapi tidak bisa
 * mengklaim "sangat siap" dari penilaian yang melewati separuh rubrik.
 */
export const BATAS_TANPA_ACUAN = 70;

/** Ambang grade. Sama untuk semua soal; yang berbeda hanya bobot aspeknya. */
export const AMBANG_GRADE = { A: 85, B: 70, C: 55 } as const;

/**
 * Pengisi suara yang paling sering muncul saat siswa gugup. Dihitung sebagai
 * pengulangan, bukan kesalahan isi — karena itu ia menyerang aspek kelancaran.
 */
const FILLER = /(えーと|えっと|えー|あのー|あのう|あの|んー|そのー|まあ|なんか)/g;

/**
 * Normalisasi sebelum dibandingkan: NFKC (menyatukan huruf lebar/half-width),
 * huruf kecil, dan buang tanda baca serta spasi. `ー` DIPERTAHANKAN — ia bunyi
 * panjang, bukan hiasan; membuangnya menyamakan コーヒー dengan コヒ.
 */
export function normalisasi(teks: string): string {
  return String(teks ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s。、，．,.!?！？「」『』（）()【】…・~〜~"'"'`]/g, '')
    .trim();
}

/** Himpunan pasangan dua huruf. Teks 1 huruf tetap menghasilkan satu anggota. */
export function bigram(teks: string): Set<string> {
  const t = normalisasi(teks);
  const set = new Set<string>();
  if (!t) return set;
  if (t.length === 1) {
    set.add(t);
    return set;
  }
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

/**
 * Berapa persen bigram ACUAN yang muncul di transkrip (0–1).
 *
 * Arahnya sengaja satu arah: siswa tidak dihukum karena menambah kalimat sopan
 * ekstra, tapi dihukum kalau bagian dari acuannya tidak terucap. Karena itu
 * pembaginya jumlah bigram acuan, bukan gabungan keduanya.
 */
export function rasioKecocokan(transkrip: string, acuan: string): number {
  const a = bigram(acuan);
  if (!a.size) return 0;
  const t = bigram(transkrip);
  if (!t.size) return 0;
  let sama = 0;
  for (const g of a) if (t.has(g)) sama++;
  return sama / a.size;
}

export function hitungFiller(teks: string): number {
  const m = normalisasi(teks).match(FILLER);
  return m ? m.length : 0;
}

/**
 * Nilai satu jawaban.
 *
 * `detikTerpakai` dihitung dari soal tampil sampai siswa menekan kirim — termasuk
 * waktu berpikir. Karena itu aspek "waktu" mengukur KETEPATAN WAKTU, bukan
 * kecepatan bicara: menjawab dalam 60% batas dapat penuh, makin mendekati batas
 * makin kecil, lewat batas nol.
 */
export function nilaiJawaban(input: {
  transkrip: string;
  acuan: string;
  detikTerpakai: number;
  batasDetik: number;
  /** Dari mana acuan itu diambil. Tanpa ini, acuan contoh bank akan dilaporkan
   *  sebagai "jawaban siswa" — dan siswa berhak tahu kalimat mana yang dipakai
   *  menilai dia. */
  acuanDari?: 'siswa' | 'bank';
}): HasilNilai {
  const transkrip = String(input.transkrip ?? '').trim();
  const acuan = String(input.acuan ?? '').trim();
  const batas = Math.max(1, Number(input.batasDetik) || 1);
  const detik = Math.max(0, Number(input.detikTerpakai) || 0);

  if (!transkrip) {
    return {
      total: 0,
      grade: 'D',
      aspek: { kecocokan: acuan ? 0 : null, kelancaran: 0, waktu: 0, sopan: 0 },
      catatan: [{ kode: 'kosong' }],
      acuan: acuan ? (input.acuanDari ?? 'siswa') : 'tidak-ada',
    };
  }

  const catatan: Catatan[] = [];

  const rasio = acuan ? rasioKecocokan(transkrip, acuan) : null;
  const kecocokan = rasio === null ? null : Math.round(rasio * BOBOT.kecocokan);
  if (rasio === null) catatan.push({ kode: 'tanpa_acuan' });

  const filler = hitungFiller(transkrip);
  const kelancaran = Math.max(0, BOBOT.kelancaran - filler * 5);
  if (filler > 0) catatan.push({ kode: 'ada_filler', angka: filler });

  const panjang = normalisasi(transkrip).length;
  if (panjang < 8) catatan.push({ kode: 'terlalu_singkat', angka: panjang });

  const porsi = detik / batas;
  const waktu = porsi <= 0.6 ? BOBOT.waktu : porsi >= 1 ? 0 : Math.round(BOBOT.waktu * (1 - (porsi - 0.6) / 0.4));
  if (porsi >= 1) catatan.push({ kode: 'lewat_waktu' });

  const t = normalisasi(transkrip);
  const sopanBentuk = /です|ます|ました|ません|でした/.test(t);
  /* Penanda kesopanan. Bentuk KANJI ikut didaftar (申します, いたします):
     siswa menulis dengan kanji, dan tanpa ini jawaban yang paling sopan justru
     kehilangan separuh poinnya. */
  const sopanSalam =
    /よろしくおねがい|おねがいします|ありがとうございました|しつれいします|いたします|もうします|申します|伺います|おります/.test(t);
  const sopan = (sopanBentuk ? 5 : 0) + (sopanSalam ? 5 : 0);
  if (sopan < 5) catatan.push({ kode: 'kurang_sopan' });

  /* Aspek yang dilewati (tidak ada acuan) TIDAK dinolkan — kalau dinolkan,
     siswa yang belum mengisi bank soal selalu dapat nilai gagal karena sebab
     yang bukan kesalahannya. Nilainya dinormalkan ke 100 dari bobot yang ada,
     TAPI dipotong di 70: tanpa acuan isi, hal terpenting tidak diukur, jadi
     nilai tertinggi yang jujur adalah B — bukan A. */
  const total =
    kecocokan === null
      ? Math.min(
          BATAS_TANPA_ACUAN,
          Math.round(((kelancaran + waktu + sopan) / (BOBOT.kelancaran + BOBOT.waktu + BOBOT.sopan)) * 100),
        )
      : kecocokan + kelancaran + waktu + sopan;

  if (total >= AMBANG_GRADE.A && catatan.length === 0) catatan.push({ kode: 'bagus' });

  const grade: HasilNilai['grade'] =
    total >= AMBANG_GRADE.A ? 'A' : total >= AMBANG_GRADE.B ? 'B' : total >= AMBANG_GRADE.C ? 'C' : 'D';

  return {
    total,
    grade,
    aspek: { kecocokan, kelancaran, waktu, sopan },
    catatan,
    acuan: acuan ? (input.acuanDari ?? 'siswa') : 'tidak-ada',
  };
}

/**
 * Ambil `jumlah` soal acak tanpa pengulangan.
 *
 * `acak` bisa diganti di tes supaya hasilnya bisa diulang — tanpa itu, satu-
 * satunya cara menguji "tidak ada soal dobel" adalah berharap-harap.
 */
export function pilihSoalAcak<T>(daftar: readonly T[], jumlah: number, acak: () => number = Math.random): T[] {
  const out = [...daftar];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(acak() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out.slice(0, Math.max(0, Math.min(jumlah, out.length)));
}

/** Daftar tahap beserta jumlah soalnya — untuk layar persiapan. */
export function ringkasTahap(soal: readonly { tahap: string }[]): { tahap: string; jumlah: number }[] {
  const peta = new Map<string, number>();
  for (const s of soal) peta.set(s.tahap, (peta.get(s.tahap) ?? 0) + 1);
  return [...peta.entries()].map(([tahap, jumlah]) => ({ tahap, jumlah }));
}
