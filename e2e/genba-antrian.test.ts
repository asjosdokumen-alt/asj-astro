/**
 * genba-antrian.test.ts — logika antrian pelanggan Genba.
 *
 * Murni: tanpa DOM, tanpa timer. Yang dijaga adalah dua hal yang menentukan
 * permainan terasa adil atau tidak:
 *
 *   1. Kesabaran tiap pelanggan berkurang BERSAMAAN, dan yang habis dilaporkan
 *      SEKALI saja — kalau `tick` melaporkan id yang sama berulang kali, satu
 *      pelanggan yang kabur akan memakan lebih dari satu nyawa.
 *   2. Pelanggan paling mendesak yang dipilih otomatis; kalau tidak, pemain
 *      berpindah ke pelanggan yang masih longgar dan membiarkan yang lain kabur.
 */
import { describe, expect, it } from 'vitest';
import { SHIFT_GENBA } from '../src/lib/arcade';
import {
  ANTRIAN_MAKS,
  SABAR_KALI,
  batasPelanggan,
  buatPelanggan,
  palingMendesak,
  tick,
  type Pelanggan,
} from '../src/lib/genba-antrian';

const aturan = SHIFT_GENBA.reguler;

const buat = (id: number, sisaMs: number): Pelanggan => ({
  id,
  perintah: buatPelanggan(id, 0, aturan, 0).perintah,
  sisaMs,
  batasMs: 16000,
});

describe('batasPelanggan', () => {
  it('kesabaran = 2× batas gelombang', () => {
    /* Reguler gelombang 1 = 8 dtk; pelanggan pertama harus diberi 16 dtk
       supaya tiga orang bisa hidup bersamaan. */
    expect(batasPelanggan(aturan, 0, 0)).toBe(8000 * SABAR_KALI);
    expect(batasPelanggan(aturan, 4, 0)).toBe(7000 * SABAR_KALI);
    expect(batasPelanggan(aturan, 8, 0)).toBe(6000 * SABAR_KALI);
  });

  it('gelombang Ultimate Loop memakai kurva loop, bukan kurva dasar', () => {
    expect(batasPelanggan(aturan, 0, 1)).toBe(6000 * SABAR_KALI);
  });
});

describe('buatPelanggan', () => {
  it('mulai dengan kesabaran penuh dan perintah yang sah', () => {
    const c = buatPelanggan(7, 0, aturan, 0);
    expect(c.id).toBe(7);
    expect(c.sisaMs).toBe(c.batasMs);
    expect(c.perintah.jp).toContain('おいてください');
  });

  it('antrian yang diisi selalu penuh', () => {
    const daftar = Array.from({ length: ANTRIAN_MAKS }, (_, i) => buatPelanggan(i + 1, 0, aturan, 0));
    expect(daftar).toHaveLength(3);
    expect(new Set(daftar.map((c) => c.id)).size).toBe(3);
  });
});

describe('tick', () => {
  it('mengurangi kesabaran SEMUA pelanggan, bukan hanya yang aktif', () => {
    const { daftar } = tick([buat(1, 5000), buat(2, 3000)], 100);
    expect(daftar.map((c) => c.sisaMs)).toEqual([4900, 2900]);
  });

  it('melaporkan pelanggan yang habis SEKALI saja', () => {
    const awal = [buat(1, 100), buat(2, 5000)];
    const pertama = tick(awal, 100);
    expect(pertama.kabur).toEqual([1]);
    expect(pertama.daftar[0].sisaMs).toBe(0);

    /* Tick berikutnya di atas daftar yang SUDAH 0 tidak boleh melaporkan id
       yang sama lagi — kalau tidak, nyawa habis dua kali untuk satu pelanggan. */
    const kedua = tick(pertama.daftar, 100);
    expect(kedua.kabur).toEqual([]);
  });

  it('dua pelanggan bisa habis pada tick yang sama', () => {
    const { kabur } = tick([buat(1, 50), buat(2, 50)], 100);
    expect(kabur).toEqual([1, 2]);
  });
});

describe('palingMendesak', () => {
  it('memilih sisa kesabaran terkecil', () => {
    expect(palingMendesak([buat(1, 9000), buat(2, 2000), buat(3, 5000)])?.id).toBe(2);
  });

  it('antrian kosong menghasilkan null, bukan error', () => {
    expect(palingMendesak([])).toBeNull();
  });
});
