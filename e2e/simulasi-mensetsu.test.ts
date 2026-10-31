/**
 * TESTS: mesin penilaian Mode Simulasi (`src/lib/simulasiMensetsu.ts`).
 *
 * KENAPA ADA
 * ----------
 * Angka yang keluar dari sini dipakai untuk memberi tahu siswa "seberapa siap
 * kamu". Salah sedikit, dan yang rusak bukan tampilan — tapi kepercayaan pada
 * penilaiannya. Tiga kelas kesalahan yang dijaga di sini:
 *
 *   1. aspek yang dilewati (tidak ada acuan) DINOLKAN, sehingga siswa yang belum
 *      mengisi bank soal selalu gagal karena sebab yang bukan salahnya;
 *   2. nilai terlalu murah — tanpa acuan, jawaban asal-cepat bisa dapat 90;
 *   3. pemilihan soal acak yang mengulang soal yang sama dalam satu ronde.
 *
 * KENAPA DI `e2e/`: `.ts` di tier ini tidak dihitung counter beku `indexer`
 * (R13f-bis). Berkas ini didaftarkan di `exclude` proyek `frontend` supaya
 * tidak jalan dua kali.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BOBOT,
  BATAS_TANPA_ACUAN,
  normalisasi,
  bigram,
  rasioKecocokan,
  hitungFiller,
  nilaiJawaban,
  pilihSoalAcak,
  ringkasTahap,
  pilihSusulan,
  susunRonde,
  skorTanpaIsi,
  nilaiSusulan,
  SUSULAN_PER_TAHAP,
  SUSULAN_UMUM,
  RITUAL_MASUK,
  RITUAL_KELUAR,
  type SoalSimulasi,
} from '../src/lib/simulasiMensetsu';

describe('normalisasi & bigram', () => {
  it('membuang tanda baca dan spasi, menyatukan huruf lebar', () => {
    expect(normalisasi('お名前は 何ですか。')).toBe('お名前は何ですか');
    expect(normalisasi('ＡＢＣ')).toBe('abc');
  });

  it('mempertahankan ー karena itu bunyi panjang, bukan hiasan', () => {
    expect(normalisasi('コーヒー')).toBe('コーヒー');
  });

  it('bigram teks satu huruf tetap menghasilkan satu anggota', () => {
    expect([...bigram('あ')]).toEqual(['あ']);
    expect(bigram('').size).toBe(0);
    expect(bigram('あい').size).toBe(1);
    expect(bigram('あいう').size).toBe(2);
  });
});

describe('rasioKecocokan', () => {
  it('1 untuk kalimat yang sama persis (tanda baca diabaikan)', () => {
    expect(rasioKecocokan('私の名前はブディです。', '私の名前はブディです')).toBe(1);
  });

  it('0 kalau transkrip kosong', () => {
    expect(rasioKecocokan('', '私の名前はブディです')).toBe(0);
  });

  it('0 kalau acuan kosong', () => {
    expect(rasioKecocokan('何か', '')).toBe(0);
  });

  it('setengah kalau hanya separuh acuan yang terucap', () => {
    const r = rasioKecocokan('私の名前は', '私の名前はブディです');
    expect(r).toBeGreaterThan(0.2);
    expect(r).toBeLessThan(0.9);
  });

  it('tidak dihukum karena menambah kalimat sopan ekstra', () => {
    /* Arah pembagiannya satu arah: yang dihitung adalah bagian ACUAN yang
       muncul, bukan bagian transkrip. Menambah "よろしくお願いします" tidak
       boleh menurunkan nilai. */
    const dasar = rasioKecocokan('私の名前はブディです', '私の名前はブディです');
    const lebih = rasioKecocokan('私の名前はブディです。よろしくお願いします。', '私の名前はブディです');
    expect(lebih).toBe(dasar);
  });
});

describe('hitungFiller', () => {
  it('menghitung pengisi suara yang umum', () => {
    expect(hitungFiller('えーと、あのー、私の名前は')).toBe(2);
    expect(hitungFiller('私の名前はブディです')).toBe(0);
  });
});

describe('nilaiJawaban', () => {
  const acuan = '私の名前はブディと申します。';

  it('jawaban kosong: nol, grade D, dan dicatat "kosong"', () => {
    const h = nilaiJawaban({ transkrip: '', acuan, detikTerpakai: 5, batasDetik: 60 });
    expect(h.total).toBe(0);
    expect(h.grade).toBe('D');
    expect(h.catatan.map((c) => c.kode)).toContain('kosong');
  });

  it('jawaban sama persis + cepat + sopan: grade A', () => {
    const h = nilaiJawaban({ transkrip: acuan, acuan, detikTerpakai: 10, batasDetik: 60 });
    expect(h.aspek.kecocokan).toBe(BOBOT.kecocokan);
    expect(h.aspek.waktu).toBe(BOBOT.waktu);
    expect(h.aspek.sopan).toBeGreaterThan(0);
    expect(h.grade).toBe('A');
    expect(h.total).toBeGreaterThanOrEqual(85);
  });

  it('pengisi suara menurunkan kelancaran 5 poin per kemunculan', () => {
    const bersih = nilaiJawaban({ transkrip: acuan, acuan, detikTerpakai: 10, batasDetik: 60 });
    const gagap = nilaiJawaban({ transkrip: `えーと ${acuan} あのー`, acuan, detikTerpakai: 10, batasDetik: 60 });
    expect(gagap.aspek.kelancaran).toBe(bersih.aspek.kelancaran - 10);
    expect(gagap.catatan.some((c) => c.kode === 'ada_filler' && c.angka === 2)).toBe(true);
  });

  it('melewati batas waktu: aspek waktu nol dan dicatat', () => {
    const h = nilaiJawaban({ transkrip: acuan, acuan, detikTerpakai: 61, batasDetik: 60 });
    expect(h.aspek.waktu).toBe(0);
    expect(h.catatan.map((c) => c.kode)).toContain('lewat_waktu');
  });

  it('menjawab di bawah 60% batas mendapat waktu penuh', () => {
    const h = nilaiJawaban({ transkrip: acuan, acuan, detikTerpakai: 30, batasDetik: 60 });
    expect(h.aspek.waktu).toBe(BOBOT.waktu);
  });

  it('tanpa acuan: aspek isi null (bukan nol) dan nilainya dipotong di 70', () => {
    const h = nilaiJawaban({ transkrip: '私の名前はブディです', acuan: '', detikTerpakai: 5, batasDetik: 60 });
    expect(h.aspek.kecocokan).toBeNull();
    expect(h.acuan).toBe('tidak-ada');
    expect(h.total).toBeLessThanOrEqual(BATAS_TANPA_ACUAN);
    expect(h.grade).not.toBe('A');
    expect(h.catatan.map((c) => c.kode)).toContain('tanpa_acuan');
  });

  it('acuan dari bank dilaporkan sebagai bank, bukan sebagai jawaban siswa', () => {
    const h = nilaiJawaban({
      transkrip: acuan,
      acuan,
      acuanDari: 'bank',
      detikTerpakai: 10,
      batasDetik: 60,
    });
    expect(h.acuan).toBe('bank');
  });

  it('bentuk です／ます yang hilang dicatat, dan bentuk sopan diberi poin', () => {
    const sopan = nilaiJawaban({ transkrip: '私の名前はブディです', acuan: '', detikTerpakai: 5, batasDetik: 60 });
    const kasar = nilaiJawaban({ transkrip: '私の名前はブディだ', acuan: '', detikTerpakai: 5, batasDetik: 60 });
    expect(sopan.aspek.sopan).toBeGreaterThan(kasar.aspek.sopan);
    expect(kasar.catatan.map((c) => c.kode)).toContain('kurang_sopan');
  });

  it('total tidak pernah melebihi 100', () => {
    const h = nilaiJawaban({
      transkrip: '私の名前はブディと申します。よろしくお願いします。',
      acuan: '私の名前はブディと申します。よろしくお願いします。',
      detikTerpakai: 5,
      batasDetik: 60,
    });
    expect(h.total).toBeLessThanOrEqual(100);
    expect(h.grade).toBe('A');
  });
});

describe('pilihSoalAcak', () => {
  const daftar = Array.from({ length: 20 }, (_, i) => ({ kode: `W${i + 1}` }));

  it('tidak pernah mengulang soal dalam satu ronde', () => {
    const ronde = pilihSoalAcak(daftar, 10);
    expect(ronde).toHaveLength(10);
    expect(new Set(ronde.map((s) => s.kode)).size).toBe(10);
  });

  it('jumlah diminta melebihi isi: mengambil semua, tidak melempar', () => {
    const ronde = pilihSoalAcak(daftar.slice(0, 3), 10);
    expect(ronde).toHaveLength(3);
  });

  it('jumlah 0 / negatif menghasilkan ronde kosong', () => {
    expect(pilihSoalAcak(daftar, 0)).toEqual([]);
    expect(pilihSoalAcak(daftar, -5)).toEqual([]);
  });

  it('tidak mengubah array aslinya', () => {
    const asli = [...daftar];
    pilihSoalAcak(daftar, 5);
    expect(daftar).toEqual(asli);
  });

  it('bisa diulang hasilnya kalau sumber acaknya ditentukan (bisa diuji)', () => {
    /* Tanpa ini, satu-satunya cara menguji pemilihan adalah berharap-harap. */
    const tetap = () => 0.5;
    const a = pilihSoalAcak(daftar, 5, tetap).map((s) => s.kode);
    const b = pilihSoalAcak(daftar, 5, tetap).map((s) => s.kode);
    expect(a).toEqual(b);
  });
});

describe('ringkasTahap', () => {
  it('menghitung jumlah soal per tahap, urut kemunculan', () => {
    const r = ringkasTahap([
      { tahap: 'Pembuka' },
      { tahap: 'Keluarga' },
      { tahap: 'Pembuka' },
    ]);
    expect(r).toEqual([
      { tahap: 'Pembuka', jumlah: 2 },
      { tahap: 'Keluarga', jumlah: 1 },
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   MODE WAWANCARA PENUH
   ═══════════════════════════════════════════════════════════════════════════ */

function soalUji(kode: string, tahap: string): SoalSimulasi {
  return {
    kode,
    tahap,
    jp: 'お名前は何ですか。',
    romaji: 'onamae wa nan desu ka.',
    arti: 'Siapa nama Anda?',
    jawaban_jp: '私の名前はブディです。',
    jawaban_arti: 'Nama saya Budi.',
  };
}

describe('susulan (深掘り)', () => {
  it('setiap tahap yang ADA DI BANK punya susulan sendiri, bukan jatuh ke daftar umum', () => {
    /* Ini gerbang yang sebenarnya: menambah tahap ke bank soal tanpa menambah
       susulan akan membuat mode penuh bertanya "もう少し詳しく" untuk tahap yang
       punya pertanyaan khusus — dan tidak ada tes lain yang bisa melihatnya,
       karena `pilihSusulan` dengan benar mengembalikan daftar umum. */
    const sql = readFileSync(new URL('../migrations/021_wawancara_bank.sql', import.meta.url), 'utf8');
    const tahap = [...new Set([...sql.matchAll(/^ {2}\('ms-\d+', '([^']+)'/gm)].map((m) => m[1]))];
    /* Kalau pembacaannya rusak, daftarnya kosong dan tes di bawah akan hijau
       tanpa mengukur apa pun — jadi panjangnya dikunci lebih dulu. */
    expect(tahap.length).toBe(13);
    expect(tahap.filter((t) => !SUSULAN_PER_TAHAP[t])).toEqual([]);
  });

  it('tahap tak dikenal memakai daftar umum, bukan kosong', () => {
    const s = pilihSusulan('Tahap Yang Tidak Ada', undefined, () => 0);
    expect(SUSULAN_UMUM).toContainEqual(s);
  });

  it('tidak memilih susulan yang sudah dipakai selama masih ada pilihan lain', () => {
    const dipakai = new Set<string>();
    const a = pilihSusulan('Ibadah & Makanan', dipakai, () => 0);
    dipakai.add(a.jp);
    const b = pilihSusulan('Ibadah & Makanan', dipakai, () => 0);
    expect(b.jp).not.toBe(a.jp);
  });

  it('daftar susulan habis: mengulang, bukan mengembalikan undefined', () => {
    const semua = SUSULAN_PER_TAHAP['Ibadah & Makanan'] ?? [];
    const dipakai = new Set(semua.map((p) => p.jp));
    const s = pilihSusulan('Ibadah & Makanan', dipakai, () => 0.99);
    expect(typeof s.jp).toBe('string');
    expect(s.jp.length).toBeGreaterThan(0);
  });
});

describe('susunRonde', () => {
  const dipilih = [soalUji('W01', 'Ibadah & Makanan'), soalUji('W02', 'Ibadah & Makanan')];

  it('latihan & mensetsu: satu langkah per soal, tanpa susulan', () => {
    for (const mode of ['latihan', 'mensetsu'] as const) {
      const r = susunRonde(dipilih, mode);
      expect(r).toHaveLength(2);
      expect(r.every((x) => x.susulan === null)).toBe(true);
    }
  });

  it('penuh: tiap soal diikuti tepat satu susulan, berurutan', () => {
    const r = susunRonde(dipilih, 'penuh', () => 0);
    expect(r).toHaveLength(4);
    expect(r.map((x) => (x.susulan ? 'S' : 'Q')).join('')).toBe('QSQS');
    /* Susulan menempel pada soal yang barusan dijawab, bukan soal berikutnya. */
    expect(r[1]?.soal.kode).toBe('W01');
    expect(r[3]?.soal.kode).toBe('W02');
  });

  it('penuh: dua soal satu tahap tidak mendapat susulan yang sama', () => {
    const r = susunRonde(dipilih, 'penuh', () => 0);
    expect(r[1]?.susulan?.jp).not.toBe(r[3]?.susulan?.jp);
  });
});

describe('nilaiSusulan', () => {
  const SEMPURNA = '私の名前はブディです。よろしくお願いします。';

  it('jawaban sempurna dapat 100 — potongan 70 milik nilai akhir TIDAK bocor ke sini', () => {
    /* Inilah alasan `skorTanpaIsi` ada. `nilaiJawaban` memotong nilai tanpa
       acuan di 70 karena angka itu dipakai sebagai nilai akhir sebuah soal;
       skor susulan bukan nilai akhir, jadi memotongnya akan melaporkan 70 untuk
       jawaban yang sebenarnya sempurna. Dua angka itu diuji berdampingan supaya
       perbedaannya terlihat, bukan diasumsikan. */
    const mentah = nilaiJawaban({ transkrip: SEMPURNA, acuan: '', detikTerpakai: 5, batasDetik: 60 });
    expect(mentah.total).toBe(BATAS_TANPA_ACUAN);
    expect(nilaiSusulan({ transkrip: SEMPURNA, detikTerpakai: 5, batasDetik: 60 }).skor).toBe(100);
  });

  it('tidak membawa catatan "tanpa acuan" — di susulan itu by design, bukan temuan', () => {
    const h = nilaiSusulan({ transkrip: SEMPURNA, detikTerpakai: 5, batasDetik: 60 });
    expect(h.catatan.map((c) => c.kode)).not.toContain('tanpa_acuan');
  });

  it('lewat batas waktu tetap kehilangan porsi waktu', () => {
    const cepat = nilaiSusulan({ transkrip: SEMPURNA, detikTerpakai: 5, batasDetik: 60 });
    const telat = nilaiSusulan({ transkrip: SEMPURNA, detikTerpakai: 61, batasDetik: 60 });
    expect(telat.skor).toBeLessThan(cepat.skor);
    expect(telat.catatan.map((c) => c.kode)).toContain('lewat_waktu');
  });

  it('skorTanpaIsi tidak pernah melewati 100 walau aspeknya di atas bobot', () => {
    expect(skorTanpaIsi({ kecocokan: null, kelancaran: 99, waktu: 99, sopan: 99 })).toBe(100);
    expect(skorTanpaIsi({ kecocokan: null, kelancaran: 0, waktu: 0, sopan: 0 })).toBe(0);
  });
});

describe('ritual 入室 / 退室', () => {
  it('empat kalimat, semuanya punya romaji, arti, dan keterangan kapan', () => {
    const semua = [...RITUAL_MASUK, ...RITUAL_KELUAR];
    expect(semua).toHaveLength(4);
    for (const k of semua) {
      expect(k.jp.trim().length).toBeGreaterThan(0);
      expect(k.romaji.trim().length).toBeGreaterThan(0);
      expect(k.arti.trim().length).toBeGreaterThan(0);
      expect(k.kapan.trim().length).toBeGreaterThan(0);
    }
  });

  it('kalimat masuk dan keluar tidak saling tertukar', () => {
    const masuk = RITUAL_MASUK.map((k) => k.jp).join('');
    const keluar = RITUAL_KELUAR.map((k) => k.jp).join('');
    expect(masuk).toContain('よろしくお願いいたします');
    expect(keluar).toContain('ありがとうございました');
  });
});
