/**
 * iq-scorer.test.ts — bukti bahwa skor asesmen penalaran tidak bisa dikarang.
 *
 * Yang dijaga BUKAN teks soal, melainkan tiga sifat yang membuat tes ini berarti:
 *   1. paket soal per siswa tetap (refresh tidak mengacak ulang) dan berbeda
 *      antar siswa;
 *   2. kunci jawaban tidak pernah ikut ke klien;
 *   3. angka yang dilihat siswa tidak memuat skor mentah maupun skala.
 */
import { describe, expect, it } from 'vitest';
import { BANK_IQ, KUOTA_IQ, pilihSoalIq, soalKlienIq, type KategoriIq } from './iq-bank';
import { nilaiIq, ringkasIq, skalaDariProporsi, tampilanIqSiswa } from './iq-scorer';

const KATEGORI: KategoriIq[] = ['verbal', 'numerik', 'spasial', 'logika'];

function jawabanBenar(wa: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of pilihSoalIq(wa)) out[s.id] = s.kunci;
  return out;
}

describe('bank soal penalaran', () => {
  it('setiap soal punya 4 pilihan, kunci 0–3, dan id unik', () => {
    const ids = new Set<string>();
    for (const s of BANK_IQ) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.pilihan).toHaveLength(4);
      expect([0, 1, 2, 3]).toContain(s.kunci);
      expect(s.tanya.trim().length).toBeGreaterThan(0);
    }
    expect(BANK_IQ.length).toBe(80);
  });

  it('setiap slot punya TEPAT dua varian setara', () => {
    const perSlot = new Map<string, number>();
    for (const s of BANK_IQ) perSlot.set(s.slot, (perSlot.get(s.slot) || 0) + 1);
    expect(perSlot.size).toBe(40);
    for (const [, n] of perSlot) expect(n).toBe(2);
  });

  it('setiap kategori punya soal lebih banyak daripada kuotanya', () => {
    for (const k of KATEGORI) {
      const jumlah = BANK_IQ.filter((s) => s.kategori === k).length;
      expect(jumlah).toBeGreaterThan(KUOTA_IQ[k]);
    }
  });

  /* Distribusi kesulitan adalah bagian dari desain, bukan hiasan: tanpa
     komposisi tetap, skor antar siswa tidak bisa dibandingkan. */
  it('komposisi kesulitan tiap kategori sesuai desain', () => {
    const harap: Record<KategoriIq, Record<string, number>> = {
      verbal: { mudah: 4, sedang: 6, sulit: 2 },
      numerik: { mudah: 3, sedang: 6, sulit: 3 },
      spasial: { mudah: 2, sedang: 4, sulit: 2 },
      logika: { mudah: 2, sedang: 4, sulit: 2 },
    };
    for (const k of KATEGORI) {
      const soal = pilihSoalIq('6281234567890').filter((s) => s.kategori === k);
      for (const [t, n] of Object.entries(harap[k])) {
        expect(soal.filter((s) => s.tingkat === t)).toHaveLength(n);
      }
    }
  });
});

describe('pemilih soal', () => {
  it('memberi 40 soal dengan komposisi 12/12/8/8', () => {
    const soal = pilihSoalIq('6281234567890');
    expect(soal).toHaveLength(40);
    for (const k of KATEGORI) {
      expect(soal.filter((s) => s.kategori === k)).toHaveLength(KUOTA_IQ[k]);
    }
  });

  it('deterministik: nomor WA yang sama selalu dapat paket yang sama', () => {
    const a = pilihSoalIq('628111').map((s) => s.id);
    const b = pilihSoalIq('628111').map((s) => s.id);
    expect(b).toEqual(a);
  });

  it('satu varian per slot — tidak ada konsep yang muncul dua kali', () => {
    const slot = pilihSoalIq('6281234567890').map((s) => s.slot);
    expect(new Set(slot).size).toBe(slot.length);
    expect(slot.length).toBe(40);
  });

  it('dua siswa berbeda tidak mendapat paket yang identik', () => {
    const a = pilihSoalIq('628111').map((s) => s.id);
    const b = pilihSoalIq('628222').map((s) => s.id);
    expect(b).not.toEqual(a);
  });

  it('soal yang dikirim ke klien TIDAK memuat kunci', () => {
    for (const s of soalKlienIq('6281234567890')) {
      expect(s).not.toHaveProperty('kunci');
      expect(JSON.stringify(s)).not.toContain('kunci');
    }
  });
});

describe('penilaian di server', () => {
  it('semua benar → 40/40, skala 130, semua subskor 5', () => {
    const wa = '6281234567890';
    const h = nilaiIq(wa, jawabanBenar(wa), 900);
    expect(h.benar).toBe(40);
    expect(h.maks).toBe(40);
    expect(h.skala).toBe(130);
    for (const k of KATEGORI) expect(h.subskor[k]).toBe(5);
  });

  it('tidak menjawab → 0/40, skala 70, semua subskor 1', () => {
    const h = nilaiIq('6281234567890', {}, 60);
    expect(h.benar).toBe(0);
    expect(h.skala).toBe(70);
    for (const k of KATEGORI) expect(h.subskor[k]).toBe(1);
  });

  it('mengabaikan klaim skor yang dikirim klien', () => {
    /* Payload yang dikirim siswa nakal lewat DevTools: skor palsu di samping
       jawaban yang sebenarnya salah semua. Yang dihitung hanya jawaban. */
    const wa = '628999';
    const palsu = { benar: 40, skala: 130, subskor: { verbal: 5, numerik: 5, spasial: 5, logika: 5 } };
    const jawaban: Record<string, number> = {};
    for (const s of pilihSoalIq(wa)) jawaban[s.id] = ((s.kunci + 1) % 4) as 0 | 1 | 2 | 3;
    const h = nilaiIq(wa, { ...palsu, ...jawaban }, 100);
    expect(h.benar).toBe(0);
    expect(h.skala).toBe(70);
  });

  it('soal milik siswa lain tidak dihitung', () => {
    const wa = '628111';
    const milikOrangLain = jawabanBenar('628222');
    const h = nilaiIq(wa, milikOrangLain, 100);
    /* Sebagian id bisa kebetulan sama (bank terbatas), tetapi TIDAK MUNGKIN
       semuanya: kalau semuanya terhitung, berarti penilai menerima id asing. */
    expect(h.benar).toBeLessThan(40);
  });

  it('durasi di luar akal dipangkas, bukan disimpan apa adanya', () => {
    expect(nilaiIq('628111', {}, 999999).durasiDetik).toBe(7200);
    expect(nilaiIq('628111', {}, -50).durasiDetik).toBe(0);
    expect(nilaiIq('628111', {}, 'abc').durasiDetik).toBe(0);
  });
});

describe('tampilan siswa', () => {
  it('tidak memuat skor mentah, skala, rincian, atau klasifikasi', () => {
    const wa = '6281234567890';
    const t = tampilanIqSiswa(nilaiIq(wa, jawabanBenar(wa), 600));
    expect(t).not.toBeNull();
    expect(t).not.toHaveProperty('benar');
    expect(t).not.toHaveProperty('maks');
    expect(t).not.toHaveProperty('skala');
    expect(t).not.toHaveProperty('rincian');
    expect(t).not.toHaveProperty('klasifikasi');
    expect(JSON.stringify(t)).not.toContain('skala');
    expect(t?.subskor.verbal).toBe(5);
  });

  it('bentuk tersimpan yang tidak dikenali → null, bukan angka nol', () => {
    expect(tampilanIqSiswa(null)).toBeNull();
    expect(tampilanIqSiswa({})).toBeNull();
    expect(tampilanIqSiswa({ subskor: { verbal: 9 } })).toBeNull();
  });

  it('ringkasan admin boleh memuat angka penuh', () => {
    const wa = '6281234567890';
    expect(ringkasIq(nilaiIq(wa, jawabanBenar(wa), 600))).toContain('40/40');
  });
});

describe('skala internal', () => {
  it('0 benar = 70, separuh = 100, penuh = 130', () => {
    expect(skalaDariProporsi(0, 40)).toBe(70);
    expect(skalaDariProporsi(20, 40)).toBe(100);
    expect(skalaDariProporsi(40, 40)).toBe(130);
  });

  it('tidak pernah keluar dari 70–130 walau masukannya mustahil', () => {
    expect(skalaDariProporsi(-5, 40)).toBe(70);
    expect(skalaDariProporsi(99, 40)).toBe(130);
  });
});
