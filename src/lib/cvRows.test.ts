import { describe, expect, it } from 'vitest';
import { getTingkatVal } from './helpers_cv';
import { TINGKAT_OPTIONS, levelOptions, rankTingkat, sortEduRows } from './cvRows';

/**
 * These tests exist because a wrong school order is not a cosmetic bug: the
 * printed CV is read by an employer, and an SMA listed above an SMP reads as a
 * fabricated history. Two separate mechanisms have to hold for the order to be
 * safe, and they are tested separately:
 *
 *   - the *form* must present SD → SMP → SMA/SMK, and
 *   - the *rows* must sort by that same ranking, including for stored values
 *     that are not spelled the way `TINGKAT_OPTIONS` spells them.
 */

describe('TINGKAT_OPTIONS', () => {
  it('is in canonical order SD → SMP → SMA/SMK → D3 → S1 → S2', () => {
    expect([...TINGKAT_OPTIONS]).toEqual(['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2']);
  });

  it('ascends under the ranker the printed CV uses', () => {
    // Guards the pair, not the list: a reordering of TINGKAT_OPTIONS that
    // `getTingkatVal` does not agree with would put the form and the printed CV
    // in different orders, which no test of either one alone would catch.
    const ranks = TINGKAT_OPTIONS.map(getTingkatVal);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe('levelOptions', () => {
  it('leads with the blank option and keeps the canonical order', () => {
    expect(levelOptions('')).toEqual(['', 'SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2']);
  });

  it('keeps an off-list stored value selectable instead of dropping it', () => {
    // Legacy rows carry bare "SMK". Without this the <select> would snap to its
    // first option and saving an old CV would rewrite the level.
    expect(levelOptions('SMK')).toEqual(['', 'SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2', 'SMK']);
    expect(levelOptions('SMA NEGERI 1')).toContain('SMA NEGERI 1');
  });

  it('does not duplicate a value that is already in the list', () => {
    const opts = levelOptions('SMP');
    expect(opts.filter(o => o === 'SMP')).toHaveLength(1);
  });
});

describe('sortEduRows', () => {
  const order = (rows: { tingkat: string }[]) => sortEduRows(rows).map(r => r.tingkat);

  it('sorts an out-of-order list into SD → SMP → SMA/SMK', () => {
    expect(order([{ tingkat: 'SMA/SMK' }, { tingkat: 'SD' }, { tingkat: 'SMP' }]))
      .toEqual(['SD', 'SMP', 'SMA/SMK']);
  });

  it('ranks the spellings that are not in the dropdown', () => {
    // "SMK dulu" is the reported complaint: a student types SMK before SMP
    // because that is the last school they attended. Both have to land in the
    // right place regardless of the spelling used.
    expect(order([{ tingkat: 'SMK' }, { tingkat: 'SMP' }, { tingkat: 'SD' }]))
      .toEqual(['SD', 'SMP', 'SMK']);
    expect(order([{ tingkat: 'S1' }, { tingkat: 'MI' }, { tingkat: 'MTS' }]))
      .toEqual(['MI', 'MTS', 'S1']);
  });

  it('keeps unrankable rows in relative order, below the ranked ones', () => {
    expect(order([{ tingkat: 'KURSUS' }, { tingkat: 'SMP' }, { tingkat: '' }, { tingkat: 'SD' }]))
      .toEqual(['SD', 'SMP', 'KURSUS', '']);
  });

  it('is stable, so two rows of the same level keep their entered order', () => {
    const rows = [
      { tingkat: 'SMA/SMK', sekolah: 'A' },
      { tingkat: 'SMA/SMK', sekolah: 'B' },
      { tingkat: 'SD', sekolah: 'C' },
    ];
    expect(sortEduRows(rows).map(r => r.sekolah)).toEqual(['C', 'A', 'B']);
  });

  it('does not mutate its input', () => {
    const rows = [{ tingkat: 'SMA/SMK' }, { tingkat: 'SD' }];
    const copy = [...rows];
    sortEduRows(rows);
    expect(rows).toEqual(copy);
  });

  it('tolerates a missing tingkat, as an empty new row has', () => {
    expect(() => sortEduRows([{}, { tingkat: 'SD' }])).not.toThrow();
  });
});

describe('rankTingkat', () => {
  it('is the same ranker that orders the printed CV', () => {
    expect(rankTingkat).toBe(getTingkatVal);
  });
});
