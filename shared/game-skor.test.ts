/**
 * game-skor.test.ts — paritas & semantik replay Matematika.
 *
 * Sama seperti `genba-skor.test.ts`: rumusnya hidup dua kali (klien di
 * `src/lib/matematika.ts`, server di `netlify/functions/shared/game-skor.ts`)
 * karena bundler Netlify tidak menjangkau `src/`. Yang diuji:
 *
 *   1. konstanta poin identik di kedua sisi;
 *   2. replay menghitung dari HASIL SOAL, bukan dari angka kiriman;
 *   3. payload rusak ditolak, bukan menghasilkan skor 0 yang tampak sah.
 */
import { describe, expect, it } from 'vitest';
import { SKOR_PER_BENAR as KLIEN } from '../src/lib/matematika';
import {
  SKOR_PER_BENAR as SERVER,
  RONDE_MAKS_MATEMATIKA,
  hitungMatematika,
  hitungKotoba as kotobaServer,
  hitungCombo as comboServer,
  KOMBO_MAKS as KOMBO_SERVER,
} from '../netlify/functions/shared/game-skor';
import { hitungKotoba as kotobaKlien } from '../src/lib/kotoba-skor';
import { hitungCombo as comboKlien, KOMBO_MAKS as KOMBO_KLIEN } from '../src/lib/arcade';

describe('paritas konstanta', () => {
  it('poin per jawaban benar sama di klien dan server', () => {
    expect(SERVER).toBe(KLIEN);
    expect(SERVER).toBe(50);
  });
});

describe('hitungMatematika — replay dari hasil soal', () => {
  it('15 benar dari 20 soal = 750, bukan angka kiriman', () => {
    const ronde = [...Array(15).fill(1), ...Array(5).fill(0)];
    const h = hitungMatematika(ronde, 20);
    expect(h).toEqual({ skor: 750, benar: 15, total: 20 });
  });

  it('semua salah tetap sah dan bernilai 0', () => {
    expect(hitungMatematika([0, 0, 0], 3)).toEqual({ skor: 0, benar: 0, total: 3 });
  });

  it('`total` yang tidak cocok dengan panjang ronde ditolak', () => {
    expect(hitungMatematika([1, 1, 1], 20)).toBeNull();
  });

  it('nilai selain 0/1 ditolak — tidak ada "benar = 2"', () => {
    expect(hitungMatematika([1, 2], 2)).toBeNull();
    expect(hitungMatematika([1, '1'], 2)).toBeNull();
    expect(hitungMatematika([1, true], 2)).toBeNull();
  });

  it('ronde kosong, bukan array, atau kepanjangan ditolak', () => {
    expect(hitungMatematika([], 0)).toBeNull();
    expect(hitungMatematika('bukan array', 3)).toBeNull();
    expect(hitungMatematika(Array(RONDE_MAKS_MATEMATIKA + 1).fill(1))).toBeNull();
  });

  it('`total` yang tidak dikirim tetap boleh (opsional)', () => {
    expect(hitungMatematika([1, 0])).toEqual({ skor: 50, benar: 1, total: 2 });
  });
});

/* ── KOTOBA & COMBO: paritas dua salinan ─────────────────────────────────── */

describe('paritas konstanta Combo', () => {
  it('KOMBO_MAKS sama di klien dan server', () => {
    expect(KOMBO_SERVER).toBe(KOMBO_KLIEN);
    expect(KOMBO_SERVER).toBe(10);
  });
});

describe('paritas replay Kotoba', () => {
  const kasus: Array<[string, number[][]]> = [
    ['kuis normal sempurna', [[1, 100, 0, 0], [1, 100, 0, 0], [1, 100, 0, 0]]],
    ['ketik + ketat', [[1, 80, 1, 1], [1, 40, 1, 1], [0, 0, 1, 1], [1, 100, 1, 1]]],
    ['mode campur dalam satu ronde', [[1, 100, 0, 0], [1, 50, 1, 1], [1, 90, 0, 1]]],
    ['semua salah', [[0, 0, 0, 0], [0, 100, 1, 1]]],
  ];

  for (const [nama, ronde] of kasus) {
    it(nama, () => {
      expect(kotobaServer(ronde)).toEqual(kotobaKlien(ronde));
    });
  }

  it('payload rusak ditolak kedua sisi', () => {
    const rusak: unknown[] = [
      [],
      'bukan array',
      [[1, 100, 0]], // kurang satu bit
      [[2, 100, 0, 0]],
      [[1, Number.NaN, 0, 0]],
      [[1, 100, 2, 0]],
      [[1, 100, 0, 5]],
      Array.from({ length: 4001 }, () => [1, 100, 0, 0]),
    ];
    for (const r of rusak) {
      expect(kotobaServer(r)).toBeNull();
      expect(kotobaKlien(r)).toBeNull();
    }
  });
});

describe('paritas replay Combo', () => {
  const kasus: Array<[string, number[][]]> = [
    ['satu kalimat normal', [[1, 0], [1, 0], [2, 100, 0]]],
    ['kalimat hell + salah', [[1, 0], [0, 0], [1, 0], [1, 0], [1, 0], [2, 60, 2]]],
    ['dua kalimat beda level', [[1, 0], [2, 80, 0], [1, 0], [1, 0], [2, 50, 1]]],
  ];

  for (const [nama, ronde] of kasus) {
    it(nama, () => {
      expect(comboServer(ronde)).toEqual(comboKlien(ronde));
    });
  }

  it('payload rusak ditolak kedua sisi', () => {
    const rusak: unknown[] = [
      [],
      'bukan array',
      [[1]],
      [[9, 0]],
      [[2, 50, 0]], // selesai tanpa kartu benar
      [[1, 5]],
      [[2, 50, 7]],
      Array.from({ length: 4001 }, () => [1, 0]),
    ];
    for (const r of rusak) {
      expect(comboServer(r)).toBeNull();
      expect(comboKlien(r)).toBeNull();
    }
  });
});
