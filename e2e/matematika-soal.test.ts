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
  jawabanBenar,
  tampilAngka,
  type KategoriId,
  type Kesulitan,
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
