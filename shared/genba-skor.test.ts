/**
 * genba-skor.test.ts — PARITAS dua salinan rumus skor Genba.
 *
 * KENAPA TES INI ADA
 *   `src/lib/arcade.ts` (dipakai klien) dan `netlify/functions/shared/genba-skor.ts`
 *   (dipakai server) memuat rumus yang sama dua kali, karena bundler Netlify
 *   tidak menjangkau `src/`. Dua salinan tanpa penjaga adalah dua rumus yang
 *   akan berbeda diam-diam — dan akibatnya bukan error, melainkan skor sah
 *   yang ditolak atau skor curang yang diterima.
 *
 *   Pola ini sudah dipakai `shared/wa-rules.test.ts`. Yang diuji di sini:
 *   tabel tingkat, rumus poin, kurva gelombang, bayaran loop, dan hasil replay
 *   penuh — bukan hanya satu fungsi.
 */
import { describe, expect, it } from 'vitest';
import * as klien from '../src/lib/arcade';
import * as server from '../netlify/functions/shared/genba-skor';

/** Ronde uji: [benar, sisaMs]. */
type Ronde = Array<[number, number]>;

const rondeSempurna = (tingkat: 'magang' | 'reguler' | 'veteran'): Ronde => {
  const aturan = klien.SHIFT_GENBA[tingkat];
  const hasil: Ronde = [];
  for (let i = 0; i < aturan.pesanan; i++) hasil.push([1, klien.durasiShift(aturan, i)]);
  return hasil;
};

describe('paritas tabel & konstanta', () => {
  it('SHIFT_GENBA identik di klien dan server', () => {
    expect(server.SHIFT_GENBA).toEqual(klien.SHIFT_GENBA);
  });

  it('ULTIMATE dan PRESISI_MOD identik', () => {
    expect(server.ULTIMATE).toEqual(klien.ULTIMATE);
    expect(server.PRESISI_MOD).toBe(klien.PRESISI_MOD);
  });

  it('batas ukuran ronde sama', () => {
    expect(server.RONDE_MAKS).toBe(klien.RONDE_MAKS);
  });
});

describe('paritas rumus', () => {
  it('poinGenba sama untuk grid milidetik × batas × kombo', () => {
    for (const batas of [0, 1, 4500, 6000, 8000, 9000]) {
      for (const ms of [-100, 0, 1, 1234, batas / 2, batas, batas + 5000, Number.NaN]) {
        for (const kombo of [1, 4, 5, 9, 10, 50]) {
          expect(server.poinGenba(ms, batas, kombo), `ms=${ms} batas=${batas} kombo=${kombo}`).toEqual(
            klien.poinGenba(ms, batas, kombo),
          );
        }
      }
    }
  });

  it('kurva gelombang dan bayaran loop sama untuk 0..40 gelombang', () => {
    for (const tingkat of ['magang', 'reguler', 'veteran'] as const) {
      for (let w = 0; w <= 40; w++) {
        expect(server.aturanUltimate(klien.SHIFT_GENBA[tingkat], w)).toEqual(
          klien.aturanUltimate(klien.SHIFT_GENBA[tingkat], w),
        );
        expect(server.bonusUltimate(w, 4)).toBe(klien.bonusUltimate(w, 4));
      }
    }
  });

  it('skorShift, nilaiShift, dan digitPresisi sama', () => {
    for (const tingkat of ['magang', 'reguler', 'veteran'] as const) {
      const a = klien.SHIFT_GENBA[tingkat];
      for (const skor of [0, 3450, 12_345]) {
        expect(server.skorShift(skor, a, true)).toBe(klien.skorShift(skor, a, true));
        expect(server.skorShift(skor, a, false)).toBe(klien.skorShift(skor, a, false));
      }
    }
    for (const s of [0, 3712, 13_712, -5]) expect(server.digitPresisi(s)).toBe(klien.digitPresisi(s));
    for (const sisa of [0, 20, 40, 60, 90]) {
      const r = { selesai: true, benar: 11, salah: 1, sisaRata: sisa };
      expect(server.nilaiShift(r)).toBe(klien.nilaiShift(r));
    }
  });
});

describe('paritas replay penuh', () => {
  const kasus: Array<[string, string, Ronde]> = [
    ['magang sempurna', 'magang', rondeSempurna('magang')],
    ['reguler sempurna', 'reguler', rondeSempurna('reguler')],
    ['veteran sempurna', 'veteran', rondeSempurna('veteran')],
    [
      'reguler dengan 2 kesalahan',
      'reguler',
      [[1, 8000], [1, 8000], [0, 0], [1, 7000], [0, 0], [1, 6000]],
    ],
    [
      'veteran nyawa habis',
      'veteran',
      [[1, 6000], [0, 0], [0, 0], [1, 6000]],
    ],
    [
      'reguler + 2 gelombang loop',
      'reguler',
      [
        ...rondeSempurna('reguler'),
        [1, 6000], [1, 6000], [1, 6000], [1, 6000],
        [1, 5750], [1, 5750], [1, 5750], [1, 5750],
        [1, 5500],
      ],
    ],
  ];

  for (const [nama, tingkat, ronde] of kasus) {
    it(nama, () => {
      expect(server.hitungGenba(tingkat, ronde)).toEqual(klien.hitungGenba(tingkat, ronde));
    });
  }

  it('urutan acak deterministik juga sama', () => {
    /* LCG sederhana: tanpa Math.random, supaya kegagalan bisa diulang. */
    let seed = 12345;
    const acak = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const ronde: Ronde = [];
    for (let i = 0; i < 60; i++) {
      const benar = acak() > 0.25 ? 1 : 0;
      ronde.push([benar, benar ? Math.floor(acak() * 8000) : 0]);
    }
    expect(server.hitungGenba('reguler', ronde)).toEqual(klien.hitungGenba('reguler', ronde));
  });

  it('payload rusak ditolak KEDUA sisi dengan cara yang sama', () => {
    const rusak: unknown[] = [
      [],
      'bukan array',
      [[1]],
      [['1', 8000]],
      [[1, Number.NaN]],
      [[2, 8000]],
      Array.from({ length: 4001 }, () => [1, 0]),
    ];
    for (const r of rusak) {
      expect(server.hitungGenba('reguler', r)).toBeNull();
      expect(klien.hitungGenba('reguler', r)).toBeNull();
    }
    for (const t of ['dewa', '', null, 7, {}]) {
      expect(server.hitungGenba(t, [[1, 1000]])).toBeNull();
      expect(klien.hitungGenba(t, [[1, 1000]])).toBeNull();
    }
  });
});
