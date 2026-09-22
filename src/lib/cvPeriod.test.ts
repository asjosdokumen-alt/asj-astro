import { describe, expect, it } from 'vitest';
import {
  PERIODE_SEKARANG, isCurrent, joinPeriod, monthLabel, monthOptions,
  splitPeriod, yearOptions,
} from './cvPeriod';

/**
 * The property these tests defend is one line long, and it is the whole reason
 * the module exists:
 *
 *     joinPeriod(splitPeriod(x)) === x   for every x the database can hold
 *
 * A control that breaks it does not raise an error — it silently rewrites a
 * stored value into a different, plausible-looking one. That is the failure
 * mode the owner's "pertahankan apa adanya" decision is about.
 */

describe('round-trip', () => {
  const CASES = [
    '2018-02',   // the shape the picker writes
    '2018',      // year-only: most legacy rows
    '2021',      // year-only, recent
    'SEKARANG',  // the "still working" sentinel
    '',          // never filled in
  ];

  it.each(CASES)('preserves %j exactly', (stored) => {
    const { year, month } = splitPeriod(stored);
    expect(joinPeriod(year, month)).toBe(stored);
  });

  it('does not invent a month for a year-only value', () => {
    // The tempting shortcut is to default the month to 01 so the control has
    // something to show. That would print "2021年1月" for a candidate who only
    // ever said 2021 — a fabricated start date on an employer-facing document.
    const { year, month } = splitPeriod('2021');
    expect(month).toBe('');
    expect(joinPeriod(year, month)).toBe('2021');
  });

  it('does not turn the sentinel into a fake year-month', () => {
    // "SEKARANG" is not a date. Appending a month to it would produce
    // "SEKARANG-05" and the CV would print neither 現在 nor a date.
    const { year, month } = splitPeriod(PERIODE_SEKARANG);
    expect(month).toBe('');
    expect(joinPeriod(year, '05')).toBe(PERIODE_SEKARANG);
  });
});

describe('splitPeriod', () => {
  it('reads both halves of a full period', () => {
    expect(splitPeriod('2018-02')).toEqual({ year: '2018', month: '02' });
  });

  it('pads a single-digit month so the <select> value matches its option', () => {
    // A stored "2018-2" must select the option whose value is "02". Without
    // padding the control finds no match and falls back to blank, which loses
    // the month on the next save.
    expect(splitPeriod('2018-2').month).toBe('02');
    expect(splitPeriod('2018/2').month).toBe('02');
  });

  it('treats null and undefined as empty rather than the string "null"', () => {
    expect(splitPeriod(null)).toEqual({ year: '', month: '' });
    expect(splitPeriod(undefined)).toEqual({ year: '', month: '' });
  });

  it('keeps free text in the year half instead of dropping it', () => {
    // Legacy let some of this through as plain text. It has to stay visible.
    expect(splitPeriod('2021 (perkiraan)')).toEqual({ year: '2021 (perkiraan)', month: '' });
  });

  it('ignores surrounding whitespace', () => {
    expect(splitPeriod('  2018-02  ')).toEqual({ year: '2018', month: '02' });
  });
});

describe('joinPeriod', () => {
  it('writes a month only when one was chosen', () => {
    expect(joinPeriod('2018', '02')).toBe('2018-02');
    expect(joinPeriod('2018', '')).toBe('2018');
  });

  it('returns empty when there is no year, even if a month was picked', () => {
    // A month with no year is not a period. Emitting "-05" would be worse than
    // emitting nothing: the CV would print a row with no date and no blank.
    expect(joinPeriod('', '05')).toBe('');
  });

  it('trims both halves', () => {
    expect(joinPeriod(' 2018 ', ' 02 ')).toBe('2018-02');
  });
});

describe('isCurrent', () => {
  it('recognises the legacy sentinel, and only it', () => {
    expect(isCurrent(PERIODE_SEKARANG)).toBe(true);
    expect(isCurrent('  SEKARANG ')).toBe(true);
    expect(isCurrent('sekarang')).toBe(false);
    expect(isCurrent('2021')).toBe(false);
    expect(isCurrent('')).toBe(false);
    expect(isCurrent(null)).toBe(false);
  });
});

describe('monthOptions / monthLabel', () => {
  it('offers a blank plus twelve zero-padded months', () => {
    const opts = monthOptions();
    expect(opts).toHaveLength(13);
    expect(opts[0]).toBe('');
    expect(opts[1]).toBe('01');
    expect(opts[12]).toBe('12');
  });

  it('labels every offered month, so no option can render blank', () => {
    // A missing label would print as an empty dropdown entry — selectable but
    // unnamed, which is indistinguishable from the blank option above it.
    for (const m of monthOptions().slice(1)) {
      expect(monthLabel(m), `month ${m} has no label`).not.toBe('');
    }
  });

  it('returns "" for junk rather than "undefined"', () => {
    expect(monthLabel('')).toBe('');
    expect(monthLabel('13')).toBe('');
    expect(monthLabel('abc')).toBe('');
  });
});

describe('yearOptions', () => {
  it('starts with the blank option and descends from this year', () => {
    const opts = yearOptions('');
    const now = new Date().getFullYear();
    expect(opts[0]).toBe('');
    expect(opts[1]).toBe(String(now));
  });

  it('keeps a stored year outside the window selectable', () => {
    // Otherwise opening a 1960 graduation and saving it would erase the year.
    expect(yearOptions('1960')).toContain('1960');
  });

  it('does not duplicate a year that is already in the window', () => {
    const now = String(new Date().getFullYear());
    expect(yearOptions(now).filter(y => y === now)).toHaveLength(1);
  });

  it('carries the sentinel through as its own option', () => {
    expect(yearOptions(PERIODE_SEKARANG)).toContain(PERIODE_SEKARANG);
  });
});
