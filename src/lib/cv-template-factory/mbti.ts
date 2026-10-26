/**
 * mbti.ts — menyimpulkan tipe MBTI dari KALIMAT kandidat sendiri.
 *
 * KENAPA DI SINI, BUKAN DI DATABASE
 * --------------------------------
 * `master_database_candidate` tidak punya kolom MBTI (203 kolom, diperiksa
 * 2026-10-26), dan form KINKI tetap mencetak 性格診断テスト. Pemilik mengisi
 * bagian itu dengan menerka dari 長所 / 短所 / 自己PR ("data dari kelebihan
 * kekurangan impian dll maka ai akan bisa menerka mbti nya"), jadi terkaan itu
 * dijadikan fungsi yang DETERMINISTIK dan bisa diuji — bukan panggilan model
 * bahasa, yang hasilnya berubah tiap kali CV dibuat.
 *
 * ATURANNYA
 * ---------
 * Lima sumbu, masing-masing dengan dua kubu kata kunci. Setiap kecocokan
 * menambah 1 (frasa) atau 2 (frasa panjang yang lebih spesifik). Sumbu yang
 * menang adalah yang skornya lebih tinggi.
 *
 * ⚠️ Imbang BUKAN "pilih yang pertama". Selisih di bawah `MBTI_MARGIN` (2)
 * dianggap imbang — satu kata tidak boleh membalik tipe — dan pada keadaan itu
 * urutan bawaannya I, S, T, J, A yang dipakai: tipe yang paling sering muncul
 * pada kandidat magang teknis di berkas pemilik. Pilihan itu tercatat di
 * `details[].tied` supaya terlihat bahwa hasilnya berasal dari imbang, bukan
 * dari bukti. Kalau tidak ada satu pun teks, fungsinya mengembalikan `null`:
 * lebih baik sel kosong daripada tipe karangan.
 *
 * Keterbatasan yang disengaja: ini penilai kata kunci, bukan psikolog. Kandidat
 * yang menulis "saya orangnya santai" tidak akan terbaca P. Karena itu hasilnya
 * ditulis ke sel yang bisa diedit admin sebelum CV dikirim.
 */

/** Teks yang boleh dipakai sebagai bukti, berurutan dari yang paling kuat. */
export const MBTI_SOURCES = [
  'promosi_diri_jp',
  'kekurangan_jp',
  'kelebihan_jp',
  'tujuan_ke_jepang_jp',
  'rencana_setelah_pulang_jp',
  'motivasi_ke_jepang_jp',
  'hobi_jp',
  'keahlian_khusus_jp',
] as const;

/** Nama tipe seperti yang tercetak di tabel `AF111:AF126` form KINKI. */
export const TYPE_NAMES: Record<string, string> = {
  ISTJ: '管理者型（ISTJ）',
  ISFJ: '擁護者型（ISFJ）',
  INFJ: '提唱者型（INFJ）',
  INTJ: '建築家型（INTJ）',
  ISTP: '巨匠型（ISTP）',
  ISFP: '冒険家型（ISFP）',
  INFP: '仲介者型（INFP）',
  INTP: '論理学者型（INTP）',
  ESTP: '起業家型（ESTP）',
  ESFP: 'エンターテイナー型（ESFP）',
  ENFP: '広報運動家型（ENFP）',
  ENTP: '討論者型（ENTP）',
  ESTJ: '幹部型（ESTJ）',
  ESFJ: '領事官型（ESFJ）',
  ENFJ: '主人公型（ENFJ）',
  ENTJ: '指揮官型（ENTJ）',
};

/** Lima dropdown form, dalam urutan sel `U48`..`U52`. */
export const AXIS_LABELS = {
  EI: { a: '【E】外向型', b: '【I】内向型' },
  SN: { a: '【S】現実型', b: '【N】直感型' },
  TF: { a: '【T】論理型', b: '【F】感覚型' },
  JP: { a: '【J】計画型', b: '【P】柔軟型' },
  AT: { a: '【A】自信型', b: '【T】慎重型' },
} as const;

export type MbtiAxis = keyof typeof AXIS_LABELS;

interface AxisRule {
  a: string;
  b: string;
  /** Frasa panjang: bobot 2. */
  strongA: string[];
  strongB: string[];
  /** Frasa pendek: bobot 1. */
  weakA: string[];
  weakB: string[];
  /**
   * Kalimat yang MENYATAKAN KEDUANYA ("bisa kerja tim maupun sendiri")
   * membatalkan sumbu ini: tanpa ini satu kata "チーム" cukup untuk memilih E
   * pada kandidat yang sebenarnya menulis "チームでも個人でも".
   */
  neutral?: string[];
}

/**
 * Kata kunci disusun dari kalimat yang MEMANG dipakai kandidat di kolom
 * `*_jp` (lihat CV Yon / Satria), bukan dari daftar sifat umum. Frasa yang
 * terlalu umum ("頑張る", "仕事") sengaja tidak dipakai — semua kandidat
 * menulisnya, jadi tidak membedakan apa pun.
 */
const RULES: Record<MbtiAxis, AxisRule> = {
  EI: {
    a: 'E',
    b: 'I',
    strongA: ['チームで働', '人と話すのが好', 'コミュニケーションを取', '声をかける', '人をまとめ', '初対面'],
    strongB: ['一人で', '黙々と', '自分のペース', 'ひとりで', '内気', '人見知り'],
    weakA: ['チーム', '協力', '明るい', '社交', '積極的', '友達', '教える'],
    weakB: ['集中', '静か', '慎重', '見直', '孤独', 'コツコツ'],
    neutral: ['チームでも個人でも', '一人でもチームでも', '個人でもチームでも'],
  },
  SN: {
    a: 'S',
    b: 'N',
    strongA: ['体を動かす', '手先', '工具', '整備', '機械', '現場', 'マニュアル', '手順を守'],
    strongB: ['アイデアを出', '新しい考え', '発想', '理論', '工夫して改善', '想像'],
    weakA: ['技術', '経験', '作業', '正確', '作る', '修理', '運転', '実践'],
    weakB: ['将来', '夢', '目標', '成長', '学び続', '文化を学'],
  },
  TF: {
    a: 'T',
    b: 'F',
    strongA: ['時間を厳守', '時間厳守', 'ルールを守', '規律', '効率', '論理', 'プレッシャー'],
    strongB: ['家族を支', '両親を笑顔', '人の気持ち', '思いやり', '助け合'],
    weakA: ['責任', '正確', '冷静', '判断', '約束'],
    weakB: ['家族', '両親', '笑顔', '優し', '感謝', '安心', '幸せ', '仲間'],
  },
  JP: {
    a: 'J',
    b: 'P',
    strongA: ['計画を立て', 'スケジュール', '準備をし', '整理整頓', '決まった時間', '期限を守'],
    strongB: ['臨機応変', 'その場で判断', '柔軟に', '自由に'],
    weakA: ['計画的', '毎日', '続ける', 'コツコツ', '順番'],
    weakB: ['気分', '変化', 'アドリブ', 'こだわらない'],
  },
  AT: {
    a: 'A',
    b: 'T',
    strongA: ['自信があります', 'プレッシャーに強', '諦めない', '前向き', '挑戦したい'],
    strongB: ['心配性', '不安を感じ', '慎重', '気をつけ', 'まだ勉強'],
    weakA: ['自信', '大丈夫', '落ち着いて', 'できます'],
    weakB: ['確認', '注意', '努力し'],
  },
};

/** Urutan imbang. Dicatat di `evidence` supaya tidak terlihat seperti bukti. */
const PRIOR: Record<MbtiAxis, string> = { EI: 'I', SN: 'S', TF: 'T', JP: 'J', AT: 'A' };

/**
 * Selisih minimum sebelum bukti boleh MENGALAHKAN bawaan.
 *
 * Satu kata tidak cukup: pada teks kandidat sungguhan (CV Yon) sumbu T/F hanya
 * terpaut 5 vs 6 — "規律・責任・プレッシャー" melawan "家族・両親・笑顔". Selisih
 * satu poin seperti itu adalah derau, bukan sifat orangnya, dan tanpa ambang
 * hasilnya berubah hanya karena satu kalimat ditambah. Di bawah ambang ini
 * tipenya dianggap imbang dan bawaan yang dipakai.
 */
export const MBTI_MARGIN = 2;

export interface MbtiAxisResult {
  axis: MbtiAxis;
  letter: string;
  label: string;
  scoreA: number;
  scoreB: number;
  tied: boolean;
  hitsA: string[];
  hitsB: string[];
}

export interface MbtiResult {
  /** Empat huruf, seperti kunci `TYPE_NAMES` dan sel `AF111:AF126`. */
  code: string;
  typeName: string;
  /** Huruf kelima (A/T) — di form ia dropdown tersendiri, bukan bagian nama tipe. */
  variant: string;
  axis: Record<MbtiAxis, string>;
  labels: string[];
  details: MbtiAxisResult[];
  /** Panjang gabungan teks yang dipakai. 0 = tidak ada bukti sama sekali. */
  sourceChars: number;
}

function textOf(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === 'string' ? v : '';
}

function scoreAxis(rule: AxisRule, text: string): { a: number; b: number; hitsA: string[]; hitsB: string[] } {
  const hitsA: string[] = [];
  const hitsB: string[] = [];
  let a = 0;
  let b = 0;
  for (const w of rule.strongA) if (text.includes(w)) { a += 2; hitsA.push(w); }
  for (const w of rule.strongB) if (text.includes(w)) { b += 2; hitsB.push(w); }
  for (const w of rule.weakA) if (text.includes(w)) { a += 1; hitsA.push(w); }
  for (const w of rule.weakB) if (text.includes(w)) { b += 1; hitsB.push(w); }
  // Kalimat "keduanya" membatalkan seluruh sumbu, bukan hanya kata yang
  // bertabrakan: kandidat sudah menyatakan dirinya netral di sumbu itu.
  for (const w of rule.neutral ?? []) {
    if (text.includes(w)) return { a: 0, b: 0, hitsA: [w], hitsB: [] };
  }
  return { a, b, hitsA, hitsB };
}

/**
 * Simpulkan tipe dari kolom `*_jp`. `null` kalau tidak ada teks sama sekali —
 * pemanggil lalu mengosongkan sel MBTI, bukan menulis tipe bawaan.
 */
export function inferMbti(raw: Record<string, unknown>): MbtiResult | null {
  const text = MBTI_SOURCES.map((k) => textOf(raw, k)).join('\n');
  // `-` adalah tanda "belum ada" di database, bukan jawaban wawancara.
  const sourceChars = text.replace(/[\s\-‐–—]/g, '').length;
  if (sourceChars === 0) return null;

  const details: MbtiAxisResult[] = [];
  const axis = {} as Record<MbtiAxis, string>;
  const labels: string[] = [];

  for (const name of Object.keys(RULES) as MbtiAxis[]) {
    const rule = RULES[name];
    const { a, b, hitsA, hitsB } = scoreAxis(rule, text);
    const tied = Math.abs(a - b) < MBTI_MARGIN;
    const letter = tied ? PRIOR[name] : a > b ? rule.a : rule.b;
    axis[name] = letter;
    labels.push(letter === rule.a ? AXIS_LABELS[name].a : AXIS_LABELS[name].b);
    details.push({ axis: name, letter, label: labels[labels.length - 1], scoreA: a, scoreB: b, tied, hitsA, hitsB });
  }

  const code = `${axis.EI}${axis.SN}${axis.TF}${axis.JP}`;
  return { code, typeName: TYPE_NAMES[code] ?? code, variant: axis.AT, axis, labels, details, sourceChars };
}
