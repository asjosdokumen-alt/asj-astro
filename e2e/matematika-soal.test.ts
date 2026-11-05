/**
 * TESTS: kesehatan bank soal & generator `lib/matematika.ts`.
 *
 * KENAPA ADA
 * ----------
 * Dua kelas kerusakan yang tidak bisa dilihat dari layar sampai terlambat:
 *
 *   1. BANK CERITA — kode dobel, `ans` bukan angka, `exp` kosong, atau seluruh
 *      soal menumpuk di satu tingkat. Semuanya tetap "jalan" (ronde terbentuk,
 *      soal tampil), dan baru ketahuan saat siswa mendapat soal tanpa
 *      pembahasan atau dua soal identik dalam satu ronde.
 *   2. GENERATOR — jawaban yang tidak bisa diketik di numpad (pecahan panjang),
 *      pilihan ganda dengan dua jawaban benar, atau pilihan bernilai negatif.
 *      Karena semuanya acak, bug seperti ini hanya muncul sesekali; karena itu
 *      di sini diulang 200 kali per kombinasi, bukan sekali.
 *
 * YANG TIDAK BISA DIPERIKSA DI SINI: apakah aritmetika tiap soal cerita BENAR.
 * Angka salah akan lolos — yang menangkapnya hanya pembahasan yang ditulis
 * eksplisit di `exp` (lihat catatan di `_lib/matematika/bank.ts`).
 *
 * KENAPA DI `e2e/`: `.ts` di tier ini tidak dihitung counter beku `indexer`
 * (R13f-bis), dan tes ini menyentuh DUA dunia sekaligus — bank backend
 * (`netlify/functions/_lib/…`) dan generator frontend (`src/lib/…`).
 */
import { describe, it, expect } from 'vitest';
import { BANK_CERITA, KATEGORI } from '../netlify/functions/_lib/matematika/bank';
import {
  buatRonde,
  buatRondeCampur,
  cerminGambar,
  DIMENSI_KATEGORI,
  jawabanBenar,
  kunciGambar,
  labelJawaban,
  putarGambar,
  rekapPerDimensi,
  rekapPerKategori,
  tampilAngka,
  type Gambar,
  type KategoriId,
  type Kesulitan,
  type Soal,
} from '../src/lib/matematika';

const TINGKAT: Kesulitan[] = ['easy', 'medium', 'hard'];
const KATEGORI_ANGKA: KategoriId[] = [
  'kraepelin',
  'kabataku',
  'deret',
  'satuan',
  'logika',
  'gyakusan',
  'sansu',
  'suiri',
  'baai',
  /* Tiga dimensi psikotes yang ditambahkan 2026-11-05. */
  'ketelitian',
  'verbal',
  'silogisme',
  'figural',
];

describe('bank soal cerita (server)', () => {
  it('kodenya unik', () => {
    const kode = BANK_CERITA.map((s) => s.kode);
    expect(new Set(kode).size).toBe(kode.length);
  });

  it('setiap soal punya tag, pertanyaan, satuan, dan pembahasan', () => {
    const rusak = BANK_CERITA.filter(
      (s) => !s.tag.trim() || !s.q.trim() || !s.unit.trim() || s.exp.trim().length < 15,
    ).map((s) => s.kode);
    expect(rusak, 'soal tanpa tag/pertanyaan/satuan/pembahasan yang memadai').toEqual([]);
  });

  it('setiap jawaban adalah angka positif yang berhingga', () => {
    const rusak = BANK_CERITA.filter((s) => !Number.isFinite(s.ans) || s.ans <= 0).map((s) => s.kode);
    expect(rusak).toEqual([]);
  });

  it('tidak ada jawaban berdesimal panjang yang mustahil diketik di numpad', () => {
    const rusak = BANK_CERITA.filter((s) => Math.round(s.ans * 100) / 100 !== s.ans).map((s) => s.kode);
    expect(rusak, 'jawaban dengan lebih dari 2 angka desimal').toEqual([]);
  });

  it('setiap tingkat terisi, dan ada cukup tema pabrik', () => {
    for (const d of TINGKAT) {
      const n = BANK_CERITA.filter((s) => s.diff === d).length;
      /* Ambang rendah dengan sengaja: yang dijaga adalah "tidak kosong", bukan
         keseimbangan sempurna — menambah soal sulit tidak boleh memerahkan gate. */
      expect(n, `tingkat ${d} kosong`).toBeGreaterThanOrEqual(5);
    }
    const tag = new Set(BANK_CERITA.map((s) => s.tag));
    expect(tag.size).toBeGreaterThanOrEqual(8);
  });

  it('banknya jauh lebih besar dari versi HTML aslinya (8 soal)', () => {
    expect(BANK_CERITA.length).toBeGreaterThanOrEqual(60);
  });

  it('sepuluh modul, dan tiap modul punya durasi yang masuk akal', () => {
    expect(KATEGORI.length).toBe(10);
    for (const k of KATEGORI) {
      expect(k.soal).toBeGreaterThan(0);
      /* Batas bawah 60 detik: modul 20 soal dalam 30 detik bukan ujian. */
      expect(k.detik).toBeGreaterThanOrEqual(60);
      expect(k.detik / k.soal).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('generator soal (klien)', () => {
  it('setiap soal yang dihasilkan bisa dijawab dengan jawabannya sendiri', () => {
    for (const kategori of KATEGORI_ANGKA) {
      for (const diff of TINGKAT) {
        for (let i = 0; i < 200; i++) {
          const [soal] = buatRonde(kategori, diff, 1);
          expect(soal, `${kategori}/${diff} tidak menghasilkan soal`).toBeTruthy();
          if (!soal) continue;
          expect(Number.isFinite(soal.jawab), `${kategori}/${diff}: jawab bukan angka`).toBe(true);
          expect(soal.pembahasan.length, `${kategori}/${diff}: pembahasan kosong`).toBeGreaterThan(5);
          expect(jawabanBenar(String(soal.jawab), soal.jawab), `${kategori}/${diff}: ${soal.tanya}`).toBe(true);
        }
      }
    }
  });

  it('pilihan ganda selalu berisi 4 angka berbeda dan memuat jawabannya', () => {
    for (const kategori of ['logika', 'sansu', 'suiri', 'baai'] as KategoriId[]) {
    for (const diff of TINGKAT) {
      for (let i = 0; i < 200; i++) {
        const [soal] = buatRonde(kategori, diff, 1);
        if (soal?.input !== 'pilihan') continue;
        const opsi = soal.pilihan ?? [];
        expect(opsi.length, `opsi bukan 4: ${soal.tanya}`).toBe(4);
        expect(new Set(opsi).size).toBe(4);
        expect(opsi).toContain(soal.jawab);
        for (const o of opsi) expect(o).toBeGreaterThanOrEqual(0);
      }
    }
    }
  });

  it('kraepelin selalu menjawab satu digit', () => {
    for (const diff of TINGKAT) {
      for (let i = 0; i < 200; i++) {
        const [soal] = buatRonde('kraepelin', diff, 1);
        if (!soal) continue;
        expect(soal.jawab).toBeGreaterThanOrEqual(0);
        expect(soal.jawab).toBeLessThanOrEqual(9);
        expect(soal.kraepelin).toBe(true);
      }
    }
  });

  it('ronde cerita memakai bank server, tidak mengulang soal yang sama', () => {
    const ronde = buatRonde('cerita', 'mixed', 15, BANK_CERITA);
    expect(ronde.length).toBe(15);
    const kode = ronde.map((s) => s.tanya);
    expect(new Set(kode).size).toBe(kode.length);
    for (const s of ronde) {
      expect(s.input).toBe('pilihan');
      expect(s.pilihan?.length).toBe(4);
    }
  });

  it('bank cerita kosong tidak menghasilkan ronde palsu', () => {
    /* Halaman harus menampilkan galat, bukan ronde setengah jadi. Kalau
       generator diam-diam mengembalikan soal angka untuk kategori cerita,
       gerbang server jadi tidak berarti apa-apa. */
    expect(buatRonde('cerita', 'easy', 15, [])).toEqual([]);
  });

  it('jawabanBenar menerima koma sebagai desimal dan menolak yang salah', () => {
    expect(jawabanBenar('2,5', 2.5)).toBe(true);
    expect(jawabanBenar('2.5', 2.5)).toBe(true);
    expect(jawabanBenar(' 7 ', 7)).toBe(true);
    expect(jawabanBenar('2,6', 2.5)).toBe(false);
    expect(jawabanBenar('', 0)).toBe(false);
    expect(jawabanBenar('abc', 1)).toBe(false);
  });

  it('tampilAngka memakai koma untuk desimal dan titik untuk ribuan tetap polos', () => {
    expect(tampilAngka(7)).toBe('7');
    expect(tampilAngka(2.5)).toBe('2,5');
    expect(tampilAngka(1455)).toBe('1455');
  });
});

describe('simulasi seleksi (ronde campuran)', () => {
  it('berisi banyak JENIS soal, bukan satu jenis dengan angka berbeda', () => {
    const ronde = buatRondeCampur(20, BANK_CERITA);
    expect(ronde).toHaveLength(20);
    /* Inti keluhan "repetitif": 20 soal satu kategori. Di sini minimal enam
       kategori berbeda harus muncul dalam satu ronde. */
    const jenis = new Set(ronde.map((s) => s.kategori));
    expect(jenis.size, `hanya ${jenis.size} jenis: ${[...jenis].join(', ')}`).toBeGreaterThanOrEqual(6);
  });

  it('tidak pernah dua soal kategori sama berturut-turut', () => {
    for (let n = 0; n < 30; n++) {
      const ronde = buatRondeCampur(20, BANK_CERITA);
      for (let i = 1; i < ronde.length; i++) {
        expect(ronde[i]?.kategori, `ronde ${n}, soal ${i}`).not.toBe(ronde[i - 1]?.kategori);
      }
    }
  });

  it('kesulitannya menanjak: easy di awal, hard di akhir', () => {
    for (let n = 0; n < 20; n++) {
      const ronde = buatRondeCampur(20, BANK_CERITA);
      expect(ronde[0]?.diff).toBe('easy');
      expect(ronde[19]?.diff).toBe('hard');
      /* Tidak boleh ada soal hard di sepertiga pertama, atau easy di akhir. */
      for (let i = 0; i < 6; i++) expect(ronde[i]?.diff, `soal ${i}`).toBe('easy');
      for (let i = 14; i < 20; i++) expect(ronde[i]?.diff, `soal ${i}`).toBe('hard');
    }
  });

  it('setiap soal tetap bisa dijawab dengan jawabannya sendiri', () => {
    for (let n = 0; n < 20; n++) {
      for (const soal of buatRondeCampur(20, BANK_CERITA)) {
        expect(Number.isFinite(soal.jawab), `${soal.kategori}: jawab bukan angka`).toBe(true);
        expect(soal.pembahasan.length).toBeGreaterThan(5);
        expect(jawabanBenar(String(soal.jawab), soal.jawab)).toBe(true);
        if (soal.input === 'pilihan') {
          expect(soal.pilihan?.length).toBe(4);
          expect(new Set(soal.pilihan).size).toBe(4);
          expect(soal.pilihan).toContain(soal.jawab);
        }
      }
    }
  });

  it('bank kosong tetap menghasilkan simulasi (tanpa soal cerita)', () => {
    const ronde = buatRondeCampur(12, []);
    expect(ronde).toHaveLength(12);
    expect(ronde.some((s) => s.kategori === 'cerita')).toBe(false);
  });

  it('deret easy memakai lebih dari satu pola — bukan hanya "tambah tetap"', () => {
    /* Regresi: `easy` dulu `acak(1,1)`, jadi 20 soal pertama selalu berpola
       +n. Yang diuji adalah VARIASI pembahasan, bukan angka. */
    const awal = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const [soal] = buatRonde('deret', 'easy', 1);
      if (soal) awal.add(soal.pembahasan.slice(0, 10));
    }
    expect(awal.size, `pola easy: ${[...awal].join(' | ')}`).toBeGreaterThanOrEqual(2);
  });
});

describe('rekap per kategori', () => {
  it('menghitung benar/total per jenis, terbanyak lebih dulu', () => {
    const r = rekapPerKategori([
      { kategori: 'deret', benar: true },
      { kategori: 'deret', benar: false },
      { kategori: 'kraepelin', benar: true },
      { kategori: 'kraepelin', benar: true },
      { kategori: 'kraepelin', benar: true },
    ]);
    expect(r).toEqual([
      { kategori: 'kraepelin', benar: 3, total: 3 },
      { kategori: 'deret', benar: 1, total: 2 },
    ]);
  });

  it('daftar kosong menghasilkan rekap kosong, bukan satu baris nol', () => {
    /* Kalau kosong menghasilkan baris "0/0", kartu rekap muncul di hasil modul
       tunggal yang tidak dijawab sama sekali — dan itu terbaca seperti bug. */
    expect(rekapPerKategori([])).toEqual([]);
  });
});

describe('psikotes — ketelitian, verbal, silogisme', () => {
  it('ketelitian: jawaban = jumlah posisi yang benar-benar berbeda', () => {
    for (const diff of TINGKAT) {
      for (let i = 0; i < 80; i++) {
        const [s] = buatRonde('ketelitian', diff, 1);
        if (!s) continue;
        const [barisA, barisB] = s.tanya.split('\n');
        const a = (barisA ?? '').replace('A: ', '').trim().split(' ').map(Number);
        const b = (barisB ?? '').replace('B: ', '').trim().split(' ').map(Number);
        expect(a.length).toBe(b.length);
        const beda = a.filter((n, j) => n !== b[j]).length;
        expect(s.jawab, `soal: ${s.tanya}`).toBe(beda);
        expect(beda).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('verbal & silogisme: 4 opsi teks unik, indeks jawaban menunjuk teks yang benar', () => {
    for (const kategori of ['verbal', 'silogisme'] as KategoriId[]) {
      for (const diff of TINGKAT) {
        for (let i = 0; i < 60; i++) {
          const [s] = buatRonde(kategori, diff, 1);
          expect(s, `${kategori}/${diff} kosong`).toBeTruthy();
          if (!s) continue;
          expect(s.input).toBe('pilihan');
          expect(s.opsiTeks?.length).toBe(4);
          expect(new Set(s.opsiTeks).size).toBe(4);
          expect(s.pilihan).toEqual([1, 2, 3, 4]);
          expect(s.jawab).toBeGreaterThanOrEqual(1);
          expect(s.jawab).toBeLessThanOrEqual(4);
          expect(s.opsiTeks?.[s.jawab - 1]).toBeTruthy();
        }
      }
    }
  });

  it('labelJawaban memetakan indeks ke teks, dan angka tetap angka', () => {
    const soalTeks = { opsiTeks: ['A', 'B', 'C', 'D'] } as unknown as Soal;
    expect(labelJawaban(soalTeks, 3)).toBe('C');
    expect(labelJawaban(soalTeks, '1')).toBe('A');
    const soalAngka = {} as unknown as Soal;
    expect(labelJawaban(soalAngka, 2.5)).toBe('2,5');
  });

  it('setiap kategori punya dimensi, dan rekap dimensi urut tetap', () => {
    const semua: KategoriId[] = [
      'kraepelin', 'kabataku', 'ketelitian', 'satuan', 'deret', 'logika',
      'gyakusan', 'sansu', 'suiri', 'baai', 'verbal', 'silogisme', 'cerita',
    ];
    for (const k of semua) expect(DIMENSI_KATEGORI[k], `${k} tanpa dimensi`).toBeTruthy();
    const r = rekapPerDimensi([
      { kategori: 'verbal', benar: true },
      { kategori: 'kraepelin', benar: true },
      { kategori: 'kraepelin', benar: false },
    ]);
    expect(r).toEqual([
      { dimensi: 'kecepatan', benar: 1, total: 2 },
      { dimensi: 'verbal', benar: 1, total: 1 },
    ]);
  });

  it('simulasi campuran mencakup minimal 4 dimensi dan selalu memuat verbal + ketelitian', () => {
    for (let n = 0; n < 10; n++) {
      const ronde = buatRondeCampur(20, BANK_CERITA);
      const dim = new Set(ronde.map((s) => DIMENSI_KATEGORI[s.kategori]));
      expect(dim.size, [...dim].join(',')).toBeGreaterThanOrEqual(4);
      expect(ronde.some((s) => s.kategori === 'verbal' || s.kategori === 'silogisme')).toBe(true);
      expect(ronde.some((s) => s.kategori === 'ketelitian')).toBe(true);
    }
  });
});

describe('figural — rotasi, cermin, deret', () => {
  it('selalu ada 4 opsi gambar yang BERBEDA', () => {
    for (const diff of TINGKAT) {
      for (let i = 0; i < 120; i++) {
        const [s] = buatRonde('figural', diff, 1);
        expect(s, `${diff} tidak menghasilkan soal`).toBeTruthy();
        if (!s) continue;
        expect(s.gambar?.length, 'gambar soal kosong').toBeGreaterThan(0);
        expect(s.opsiGambar?.length, 'opsi gambar bukan 4').toBe(4);
        /* Inti soal figural: dua opsi kembar = dua jawaban benar. */
        const kunci = new Set((s.opsiGambar ?? []).map((g) => kunciGambar(g)));
        expect(kunci.size, `opsi kembar: ${s.tanya}`).toBe(4);
        expect(s.pilihan).toEqual([1, 2, 3, 4]);
        expect(s.jawab).toBeGreaterThanOrEqual(1);
        expect(s.jawab).toBeLessThanOrEqual(4);
      }
    }
  });

  it('opsi "benar" memang hasil transformasi yang diminta', () => {
    for (const diff of TINGKAT) {
      for (let i = 0; i < 80; i++) {
        const [s] = buatRonde('figural', diff, 1);
        if (!s?.gambar || !s.opsiGambar || !s.figurMeta) continue;
        const benar = s.opsiGambar[s.jawab - 1];
        expect(benar, 'indeks jawaban menunjuk opsi kosong').toBeTruthy();
        if (!benar) continue;
        if (s.figurMeta.mode === 'putar') {
          expect(kunciGambar(benar)).toBe(kunciGambar(putarGambar(s.gambar, s.figurMeta.derajat)));
        } else if (s.figurMeta.mode === 'cermin') {
          expect(kunciGambar(benar)).toBe(kunciGambar(cerminGambar(s.gambar)));
        } else {
          /* Deret: tiga sel 0° → 90° → 180°, jawabannya 270°. */
          expect(s.gambarSel).toBe(3);
          expect(s.gambar).toHaveLength(3);
          expect(s.gambar[2]?.putar).toBe(180);
          expect(kunciGambar(benar)).toBe(kunciGambar(putarGambar([s.gambar[0]], 270)));
        }
      }
    }
  });

  it('rotasi 4×90° dan cermin 2× kembali ke asal', () => {
    const g: Gambar = [{ bentuk: 'L', putar: 0, isi: true }];
    expect(kunciGambar(putarGambar(g, 360))).toBe(kunciGambar(g));
    expect(kunciGambar(putarGambar(putarGambar(g, 90), 270))).toBe(kunciGambar(g));
    expect(kunciGambar(cerminGambar(cerminGambar(g)))).toBe(kunciGambar(g));
    expect(kunciGambar(putarGambar(g, 450))).toBe(kunciGambar(putarGambar(g, 90)));
  });
});
