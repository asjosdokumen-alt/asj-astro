import { describe, expect, it } from 'vitest';
import { AXIS_LABELS, MBTI_MARGIN, TYPE_NAMES, inferMbti } from './mbti';

/**
 * Teks di bawah ini disusun dari FRASA yang benar-benar dipakai kandidat di
 * kolom `*_jp` (bukan frasa karangan) — nama, nomor, dan alamat tidak dibawa.
 * Kalau aturan kata kuncinya diubah, tes ini yang memberi tahu apakah hasilnya
 * masih masuk akal untuk profil "disiplin + keluarga + teknis" seperti ini.
 */
const PROFIL_TEKNIS = {
  promosi:
    '私は規律正しく、正直で、勤勉であり、諦めない性格です。新しいことを学ぶのが早く、チームでも個人でも働くことができ、自分の仕事に責任を持っています。日本の労働倫理を学びたいため、日本で働くことに非常に興味を持っています',
  kekurangan:
    '私の短所は心配性なところです。分からない状況になると、不安を感じることがあります。そうならないように、周りの状況や残っているメモなどをよく確認し、周りの人にも確認しています。なぜかというと、リスクを減らすことができると思うからです。そして、日本人と上手に話せるように、日本語をもっと勉強して、努力していきます。',
  kelebihan:
    'プレッシャーのかかる状況でも、落ち着いて責任を持って作業に対応できます。車の運転ができます。来月、車の運転免許を取りたいです。私は仕事の経験が少しありますので、職場の環境にもすぐ慣れると思います。仕事が重くても、精一杯頑張ります。',
  tujuan:
    '私が日本へ行きたい理由は、家族の生活を支え、両親を安心させて笑顔にしたいからです。また、日本で働きながら、新しい技術や仕事のやり方を学び、自分自身も成長したいと考えています。日本の文化や時間を守る習慣も学びたいです。日本で一生懸命働いて経験を積み、将来はその経験を活かして、家族を支えながら自分の夢も実現したいです。',
  rencana:
    '実は、ずっと日本で働きたいと思っています。もし国に帰ることになったら、日本で学んだ技術や経験を活かして、建設関係の仕事をしたいです。',
  motivasi: '学生時代からの夢を実現したい、日本の文化を学びたい',
  hobi: 'ハイキング、ジョギング',
  keahlian: '牛の世話、整備士、大工',
};

describe('inferMbti — menyimpulkan tipe dari kalimat kandidat', () => {
  it('profil kandidat teknis → ISTJ, dan kelima labelnya sama dengan dropdown form', () => {
    const r = inferMbti(PROFIL_TEKNIS);
    expect(r).not.toBeNull();
    expect(r?.code).toBe('ISTJ');
    expect(r?.typeName).toBe('管理者型（ISTJ）');
    expect(r?.labels).toEqual([
      AXIS_LABELS.EI.b, // 【I】内向型
      AXIS_LABELS.SN.a, // 【S】現実型
      AXIS_LABELS.TF.a, // 【T】論理型
      AXIS_LABELS.JP.a, // 【J】計画型
      AXIS_LABELS.AT.b, // 【T】慎重型 — 短所 "心配性" menang atas "プレッシャー"
    ]);
  });

  it('sumbu yang buktiya tipis dilaporkan sebagai imbang, bukan sebagai temuan', () => {
    const r = inferMbti(PROFIL_TEKNIS);
    const tf = r?.details.find((d) => d.axis === 'TF');
    // 5 lawan 6: di bawah ambang, jadi T dipakai karena bawaan — bukan karena
    // "keluarga" kalah dari "disiplin".
    expect(tf?.scoreA).toBe(5);
    expect(tf?.scoreB).toBe(6);
    expect(tf?.tied).toBe(true);
    expect(Math.abs((tf?.scoreA ?? 0) - (tf?.scoreB ?? 0))).toBeLessThan(MBTI_MARGIN);
  });

  it('bukti yang kuat MENGALAHKAN bawaan — ESTJ keluar kalau kalimatnya ESTJ', () => {
    const r = inferMbti({
      promosi:
        '人をまとめるのが得意で、チームで働くことが好きです。マニュアル通りに工具を使って整備します。時間厳守で効率を重視し、計画を立てて準備をします。期限を守ります。自信があります。プレッシャーに強いです。',
    });
    expect(r?.code).toBe('ESTJ');
    expect(r?.typeName).toBe('幹部型（ESTJ）');
  });

  it('"チームでも個人でも" TIDAK dibaca sebagai extrovert', () => {
    const r = inferMbti({ promosi: 'チームでも個人でも働くことができます。' });
    // Sumbu EI dibatalkan kalimat itu; sisanya tanpa bukti → bawaan.
    expect(r?.axis.EI).toBe('I');
    expect(r?.details.find((d) => d.axis === 'EI')?.tied).toBe(true);
  });

  it('tanpa satu pun teks: tipe tetap diisi dari bawaan, dan ditandai bukan temuan', () => {
    // Pemilik 2026-10-26: sel kosong terbaca sebagai formulir belum selesai,
    // jadi yang dipakai adalah bawaan — TAPI `sourceChars` harus 0 supaya
    // terlihat bahwa tidak ada bukti di baliknya.
    for (const kosong of [{}, { promosi: '   ', kekurangan: '' }, { kelebihan: '-\n-' }]) {
      const r = inferMbti(kosong);
      expect(r.code).toBe('ISTJ');
      expect(r.sourceChars).toBe(0);
      expect(r.details.every((d) => d.tied)).toBe(true);
    }
  });

  it('16 nama tipe memakai tanda kurung LEBAR, sama seperti sel AF111:AF126', () => {
    const names = Object.values(TYPE_NAMES);
    expect(names).toHaveLength(16);
    for (const n of names) expect(n).toMatch(/型（[A-Z]{4}）$/);
  });
});
