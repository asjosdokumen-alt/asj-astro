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
     kehilangan separuh poinnya.

     ⚠ `よろしくお願いします` DITAMBAHKAN 2026-10-31, dan itu bukan sinonim
     hiasan: daftar ini dulu hanya punya bentuk hiragana `よろしくおねがい`,
     sehingga sapaan yang paling sering ditulis siswa — dengan kanji 願 — tidak
     dikenali sama sekali. Salam pembuka yang benar-benar diucapkan di wawancara
     justru satu-satunya yang tidak dapat poin. */
  const sopanSalam =
    /よろしくおねがい|よろしくお願い|おねがいします|お願いします|ありがとうございました|しつれいします|いたします|もうします|申します|伺います|おります/.test(t);
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

/* ═══════════════════════════════════════════════════════════════════════════
   MODE WAWANCARA PENUH — ritual, susulan, dan susunan ronde
   ═══════════════════════════════════════════════════════════════════════════

   KENAPA DATA INI DI SINI, BUKAN DI DALAM JSX
   -------------------------------------------
   Ritual 入室/退室 dan pertanyaan susulan adalah ISI wawancara, bukan tampilan.
   Kalau ia hidup di dalam komponen, satu-satunya cara mengujinya adalah
   merender lalu membaca DOM — dan tes seperti itu tidak bisa membedakan
   "kalimatnya benar" dari "elemennya muncul".

   KENAPA TIDAK DARI DATABASE
   --------------------------
   `wawancara_soal` berisi 177 pertanyaan milik LPK dan memang harus bisa
   diperbaiki admin tanpa deploy. Ritual dan susulan BUKAN materi LPK: ia tata
   cara wawancara Jepang yang sama di semua perusahaan, dan tidak berubah per
   kandidat. Menambah tabel untuk ~30 baris yang tidak pernah disunting admin
   adalah biaya tanpa manfaat. Kalau nanti pemilik ingin menyuntingnya,
   pindahkan — tapi jangan pindahkan hanya karena "semua teks harus di DB".
*/

/** Satu kalimat yang DIUCAPKAN siswa, bukan pertanyaan untuknya. */
export interface KalimatRitual {
  jp: string;
  romaji: string;
  arti: string;
  /** Kapan diucapkan — bagian dari tata caranya, bukan hiasan. */
  kapan: string;
}

/**
 * 入室 — dari mengetuk pintu sampai duduk.
 *
 * Dua kalimat, bukan empat: `ノック` dan `お辞儀` adalah tindakan, bukan ucapan,
 * dan mode ini menilai UCAPAN. Menambahkan baris yang tidak bisa diucapkan akan
 * membuat centangnya bohong.
 */
export const RITUAL_MASUK: readonly KalimatRitual[] = [
  {
    jp: '失礼します。',
    romaji: 'shitsurei shimasu.',
    arti: 'Permisi.',
    kapan: 'Setelah mengetuk tiga kali dan dipersilakan masuk — diucapkan sambil membuka pintu dan membungkuk.',
  },
  {
    jp: 'よろしくお願いいたします。',
    romaji: 'yoroshiku onegai itashimasu.',
    arti: 'Mohon bimbingannya.',
    kapan: 'Berdiri di samping kursi, membungkuk, lalu duduk. Bukan sambil berjalan.',
  },
];

/**
 * 退室 — dari berdiri sampai keluar.
 *
 * KENAPA DUA KALIMAT INI SERING TERLEWATKAN
 * -----------------------------------------
 * Kandidat yang gugup menganggap wawancara selesai saat pertanyaan terakhir
 * dijawab, lalu berjalan keluar tanpa suara. Pewawancara menilai sampai pintu
 * tertutup — dan "tidak bisa keluar dengan sopan" adalah kesan yang bertahan
 * lebih lama daripada jawaban yang bagus.
 */
export const RITUAL_KELUAR: readonly KalimatRitual[] = [
  {
    jp: '本日はありがとうございました。',
    romaji: 'honjitsu wa arigatou gozaimashita.',
    arti: 'Terima kasih atas waktu Anda hari ini.',
    kapan: 'Berdiri dari kursi, lalu membungkuk.',
  },
  {
    jp: '失礼いたします。',
    romaji: 'shitsurei itashimasu.',
    arti: 'Permisi, saya permisi.',
    kapan: 'Di depan pintu sebelum keluar — membungkuk sekali lagi, baru menutup pintu.',
  },
];

/**
 * Pertanyaan susulan (深掘り).
 *
 * KENAPA INI YANG MENAikKAN KESULITAN, BUKAN SOAL YANG LEBIH SULIT
 * --------------------------------------------------------------
 * Wawancara sungguhan tidak menerima jawaban hafalan. Setelah kandidat selesai,
 * pewawancara menanyakan SATU hal lagi: "kenapa?", "contohnya?", "lalu apa?".
 * Jawaban hafalan langsung terlihat di titik itu — dan itulah yang tidak bisa
 * dilatih dengan menambah kosakata.
 */
export interface PertanyaanSusulan {
  jp: string;
  romaji: string;
  arti: string;
}

/** Dipakai kalau tahapnya tidak dikenal — jangan pernah mengembalikan kosong. */
export const SUSULAN_UMUM: readonly PertanyaanSusulan[] = [
  { jp: 'もう少し詳しく教えてください。', romaji: 'mou sukoshi kuwashiku oshiete kudasai.', arti: 'Tolong jelaskan lebih rinci.' },
  { jp: 'なぜそう思いますか。', romaji: 'naze sou omoimasu ka.', arti: 'Kenapa Anda berpikir begitu?' },
  { jp: '具体的には、どんなことですか。', romaji: 'gutaiteki ni wa, donna koto desu ka.', arti: 'Secara konkret, seperti apa?' },
];

/**
 * Susulan per tahap — kunci persis sama dengan `wawancara_soal.tahap`.
 *
 * Dua per tahap, bukan satu: satu pertanyaan tahap yang sama bisa muncul dua
 * kali dalam satu ronde (banknya 15–21 soal per tahap), dan susulan yang sama
 * dua kali beruntun terasa seperti skrip, bukan wawancara.
 */
export const SUSULAN_PER_TAHAP: Record<string, readonly PertanyaanSusulan[]> = {
  'Pembuka & Perkenalan Diri': [
    { jp: '今のお仕事について、もう少し詳しく教えてください。', romaji: 'ima no oshigoto ni tsuite, mou sukoshi kuwashiku oshiete kudasai.', arti: 'Tolong ceritakan lebih rinci tentang pekerjaan Anda sekarang.' },
    { jp: '日本で働きたいと思ったきっかけは何ですか。', romaji: 'nihon de hatarakitai to omotta kikkake wa nan desu ka.', arti: 'Apa yang membuat Anda ingin bekerja di Jepang?' },
  ],
  'Keluarga & Latar Belakang': [
    { jp: 'ご家族はあなたが日本へ行くことをどう思っていますか。', romaji: 'gokazoku wa anata ga nihon e iku koto o dou omotte imasu ka.', arti: 'Keluarga Anda bagaimana menanggapi rencana Anda ke Jepang?' },
    { jp: 'ご家族の中で、日本で働いたことがある人はいますか。', romaji: 'gokazoku no naka de, nihon de hataraita koto ga aru hito wa imasu ka.', arti: 'Apakah ada anggota keluarga yang pernah bekerja di Jepang?' },
  ],
  Pendidikan: [
    { jp: '学校で一番力を入れて勉強したことは何ですか。', romaji: 'gakkou de ichiban chikara o irete benkyou shita koto wa nan desu ka.', arti: 'Di sekolah, pelajaran apa yang paling serius Anda pelajari?' },
    { jp: '学校で習ったことで、仕事に役立つと思うことは何ですか。', romaji: 'gakkou de naratta koto de, shigoto ni yakudatsu to omou koto wa nan desu ka.', arti: 'Hal apa yang Anda pelajari di sekolah dan menurut Anda berguna untuk kerja?' },
  ],
  'Pengalaman Kerja': [
    { jp: '前の仕事で、一番大変だったことは何ですか。', romaji: 'mae no shigoto de, ichiban taihen datta koto wa nan desu ka.', arti: 'Di pekerjaan sebelumnya, hal apa yang paling berat?' },
    { jp: '前の仕事で、気をつけていたことは何ですか。', romaji: 'mae no shigoto de, ki o tsukete ita koto wa nan desu ka.', arti: 'Di pekerjaan sebelumnya, hal apa yang selalu Anda perhatikan?' },
  ],
  'Bahasa Jepang & Kualifikasi': [
    { jp: '日本語で、日常会話はどのくらいできますか。', romaji: 'nihongo de, nichijou kaiwa wa dono kurai dekimasu ka.', arti: 'Dalam bahasa Jepang, percakapan sehari-hari sejauh mana?' },
    { jp: '日本語が分からないとき、どうしますか。', romaji: 'nihongo ga wakaranai toki, dou shimasu ka.', arti: 'Kalau tidak paham bahasa Jepang, apa yang Anda lakukan?' },
  ],
  'Kelebihan & Kekurangan': [
    { jp: 'その長所が分かる具体的な例を教えてください。', romaji: 'sono chousho ga wakaru gutaiteki na rei o oshiete kudasai.', arti: 'Tolong beri contoh nyata yang menunjukkan kelebihan itu.' },
    { jp: '短所を直すために、どんなことをしていますか。', romaji: 'tansho o naosu tame ni, donna koto o shite imasu ka.', arti: 'Untuk memperbaiki kekurangan itu, apa yang Anda lakukan?' },
  ],
  'Motivasi ke Jepang': [
    { jp: 'どうして他の国ではなく、日本を選んだのですか。', romaji: 'doushite hoka no kuni de wa naku, nihon o eranda no desu ka.', arti: 'Kenapa memilih Jepang, bukan negara lain?' },
    { jp: '日本で働くことで、将来どうなりたいですか。', romaji: 'nihon de hataraku koto de, shourai dou naritai desu ka.', arti: 'Dengan bekerja di Jepang, Anda ingin menjadi apa di masa depan?' },
  ],
  'Rencana & Target di Jepang': [
    { jp: '日本で何年働きたいですか。その理由も教えてください。', romaji: 'nihon de nannen hatarakitai desu ka. sono riyuu mo oshiete kudasai.', arti: 'Berapa tahun Anda ingin bekerja di Jepang? Sertakan alasannya.' },
    { jp: '日本でお金を貯めたら、何に使いたいですか。', romaji: 'nihon de okane o tametara, nani ni tsukaitai desu ka.', arti: 'Kalau sudah menabung di Jepang, ingin dipakai untuk apa?' },
  ],
  'Kehidupan Sehari-hari & Kebiasaan': [
    { jp: '休みの日は、普段何をしていますか。', romaji: 'yasumi no hi wa, fudan nani o shite imasu ka.', arti: 'Hari libur biasanya Anda lakukan apa?' },
    { jp: '日本での生活で、一番心配なことは何ですか。', romaji: 'nihon de no seikatsu de, ichiban shinpai na koto wa nan desu ka.', arti: 'Dalam kehidupan di Jepang, hal apa yang paling Anda khawatirkan?' },
  ],
  'Kesehatan & Fisik': [
    { jp: '体力に自信がありますか。どんな運動をしていますか。', romaji: 'tairyoku ni jishin ga arimasu ka. donna undou o shite imasu ka.', arti: 'Apakah Anda yakin dengan stamina Anda? Olahraga apa yang biasa Anda lakukan?' },
    { jp: '今までに大きな病気をしたことがありますか。', romaji: 'ima made ni ookina byouki o shita koto ga arimasu ka.', arti: 'Apakah Anda pernah sakit berat?' },
  ],
  'Ibadah & Makanan': [
    { jp: '食べられないものはありますか。', romaji: 'taberarenai mono wa arimasu ka.', arti: 'Apakah ada makanan yang tidak bisa Anda makan?' },
    { jp: '断食のとき、仕事に影響はありませんか。', romaji: 'danjiki no toki, shigoto ni eikyou wa arimasen ka.', arti: 'Saat berpuasa, apakah tidak mengganggu pekerjaan?' },
  ],
  'Kerja Shift & Lembur': [
    { jp: '夜勤や残業はできますか。理由も教えてください。', romaji: 'yakin ya zangyou wa dekimasu ka. riyuu mo oshiete kudasai.', arti: 'Apakah Anda bisa kerja shift malam dan lembur? Sertakan alasannya.' },
    { jp: '残業が続いて体が疲れたとき、どうしますか。', romaji: 'zangyou ga tsuzuite karada ga tsukareta toki, dou shimasu ka.', arti: 'Kalau lembur terus-menerus dan badan lelah, apa yang Anda lakukan?' },
  ],
  'Penutup & Pertanyaan Balik': [
    { jp: '何か質問はありますか。遠慮なく聞いてください。', romaji: 'nanika shitsumon wa arimasu ka. enryo naku kiite kudasai.', arti: 'Ada pertanyaan? Silakan bertanya tanpa sungkan.' },
    { jp: '最後に、一言お願いします。', romaji: 'saigo ni, hitokoto onegai shimasu.', arti: 'Terakhir, satu kalimat dari Anda.' },
  ],
};

export type ModeLatihan = 'latihan' | 'mensetsu' | 'penuh';

/**
 * Pilih satu susulan untuk sebuah tahap.
 *
 * `dipakai` mencegah susulan yang sama muncul dua kali dalam satu ronde; kalau
 * daftarnya sudah habis, ia mengulang — lebih baik mengulang pertanyaan yang
 * benar daripada diam.
 */
export function pilihSusulan(
  tahap: string,
  dipakai?: ReadonlySet<string>,
  acak: () => number = Math.random,
): PertanyaanSusulan {
  const semua = SUSULAN_PER_TAHAP[tahap] ?? SUSULAN_UMUM;
  const belum = semua.filter((p) => !dipakai?.has(p.jp));
  const daftar = belum.length ? belum : semua;
  const i = Math.min(daftar.length - 1, Math.max(0, Math.floor(acak() * daftar.length)));
  return daftar[i] as PertanyaanSusulan;
}

/** Satu langkah dalam ronde: pertanyaan utama, atau susulan atasnya. */
export interface ItemRonde {
  soal: SoalSimulasi;
  /** `null` = pertanyaan utama; terisi = susulan (深掘り) untuk soal yang sama. */
  susulan: PertanyaanSusulan | null;
}

/**
 * Susun ronde. Di mode `penuh`, tiap pertanyaan diikuti SATU susulan.
 *
 * Susulan menempel pada soal yang sama (`soal` tidak berubah) karena ia memang
 * bukan pertanyaan baru — ia lanjutan dari jawaban yang barusan diberikan, dan
 * layar hasil memakainya untuk menunjukkan pasangan soal→susulan.
 */
export function susunRonde(
  dipilih: readonly SoalSimulasi[],
  mode: ModeLatihan,
  acak: () => number = Math.random,
): ItemRonde[] {
  if (mode !== 'penuh') return dipilih.map((soal) => ({ soal, susulan: null }));
  const dipakai = new Set<string>();
  const out: ItemRonde[] = [];
  for (const soal of dipilih) {
    out.push({ soal, susulan: null });
    const s = pilihSusulan(soal.tahap, dipakai, acak);
    dipakai.add(s.jp);
    out.push({ soal, susulan: s });
  }
  return out;
}

/**
 * Tiga aspek (tanpa isi) dinormalkan ke 0–100.
 *
 * KENAPA TIDAK MEMAKAI `total` DARI `nilaiJawaban`
 * -----------------------------------------------
 * `nilaiJawaban` memotong nilai tanpa acuan di 70 (`BATAS_TANPA_ACUAN`) karena
 * angka itu dipakai sebagai NILAI AKHIR sebuah soal. Skor susulan bukan nilai
 * akhir — ia hanya muncul di bagian susulan — jadi memotongnya di 70 akan
 * melaporkan "78" untuk jawaban yang sebenarnya sempurna, dan siswa akan
 * mengejar selisih yang tidak ada.
 */
export function skorTanpaIsi(aspek: AspekNilai): number {
  const bobot = BOBOT.kelancaran + BOBOT.waktu + BOBOT.sopan;
  const dapat = Math.max(0, aspek.kelancaran) + Math.max(0, aspek.waktu) + Math.max(0, aspek.sopan);
  return Math.round(Math.min(1, dapat / bobot) * 100);
}

export interface HasilSusulan {
  /** 0–100 dari kelancaran + waktu + kesopanan. Isi tidak dinilai. */
  skor: number;
  aspek: AspekNilai;
  catatan: Catatan[];
}

/**
 * Nilai satu jawaban susulan.
 *
 * `catatan` tanpa `tanpa_acuan`: di susulan, "tidak ada acuan" bukan temuan —
 * memang tidak ada naskahnya. Menampilkannya sebagai catatan akan membuat tiap
 * baris susulan membawa peringatan yang tidak bisa ditindaklanjuti siswa.
 */
export function nilaiSusulan(input: {
  transkrip: string;
  detikTerpakai: number;
  batasDetik: number;
}): HasilSusulan {
  const h = nilaiJawaban({
    transkrip: input.transkrip,
    acuan: '',
    detikTerpakai: input.detikTerpakai,
    batasDetik: input.batasDetik,
  });
  return {
    skor: skorTanpaIsi(h.aspek),
    aspek: h.aspek,
    catatan: h.catatan.filter((c) => c.kode !== 'tanpa_acuan'),
  };
}
