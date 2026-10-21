/**
 * Month + year period handling for education and employment rows.
 *
 * Legacy used `<input type="month">` for exactly these fields
 * (`master_full.ts:347-348` for school, `357-358` for work), with the labels
 * "Bulan/Thn Masuk (入学)" and "Bulan/Thn Lulus (卒業)". So this is a port of a
 * control that already worked, not an invention.
 *
 * Two things about the legacy version do NOT survive a faithful copy, and both
 * are why this module exists rather than a bare `type="month"`:
 *
 *   1. **A year-only value cannot be displayed by a month input.** Legacy wrote
 *      the stored string straight back into the control (`setVal`), so a row
 *      holding `"2021"` came back BLANK — the browser ignores a value that is
 *      not a valid `YYYY-MM`. Re-saving then erased it. Most legacy rows hold a
 *      year and nothing else, so a bare `type="month"` would quietly destroy a
 *      large part of the existing data. `splitPeriod`/`joinPeriod` therefore
 *      round-trip a year-only value unchanged (the owner's decision:
 *      "pertahankan apa adanya" — preserve as-is, do not force a month).
 *   2. **"still working" is not a date.** Legacy's `job_now_N` checkbox
 *      ("Ima Made (Sekarang)") disabled the end-date control and sent the
 *      literal `'SEKARANG'` instead. That sentinel is data, not absence of
 *      data, and it has to survive a round-trip intact — so it is recognised
 *      here rather than being read as an unparseable year.
 */

/** The literal legacy writes into `tahun_keluar` for a current job. */
export const PERIODE_SEKARANG = 'SEKARANG';

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/**
 * Month NAMES → month code.
 *
 * Why this exists (measured 2026-10-21, owner report "dropdownnya gak bisa
 * dipakai"): the AI extraction writes a month name into the year column —
 * `tahun_masuk: "05 MEI"` — and `splitPeriod` used to hand that string back as
 * the YEAR half with `month: ''`. `MonthYearField` then could not attach a
 * chosen month to it (`joinPeriod` refuses to append `-05` to a non-4-digit
 * year), so every pick snapped straight back to "—". The control was not
 * broken; it was being fed a value it could not represent.
 *
 * Both Indonesian and English spellings are accepted because the extraction
 * model answers in either, and a candidate may type the month by hand in the
 * free-text year box.
 */
const MONTH_NAMES: Record<string, string> = {
  JAN: '01', JANUARI: '01', JANUARY: '01',
  FEB: '02', FEBRUARI: '02', FEBRUARY: '02',
  MAR: '03', MARET: '03', MARCH: '03',
  APR: '04', APRIL: '04',
  MEI: '05', MAY: '05',
  JUN: '06', JUNI: '06', JUNE: '06',
  JUL: '07', JULI: '07', JULY: '07',
  AGU: '08', AGT: '08', AGUSTUS: '08', AUG: '08', AUGUST: '08',
  SEP: '09', SEPT: '09', SEPTEMBER: '09',
  OKT: '10', OKTOBER: '10', OCT: '10', OCTOBER: '10',
  NOV: '11', NOVEMBER: '11',
  DES: '12', DESEMBER: '12', DEC: '12', DECEMBER: '12',
};

/**
 * `05 MEI`, `MEI 2024`, `5 Agustus 2023` — a day and/or month name, optionally
 * with a year. Anchored, so free text that merely CONTAINS a month name
 * ("2021 (perkiraan)") is not mistaken for a date.
 */
const NAMED_DATE = /^(\d{1,2})?[\s.,/-]*([A-Za-z]{3,10})[\s.,/-]*(\d{4})?$/;

/** Month choices for the picker: `''` plus `01`..`12`. */
export function monthOptions(): string[] {
  const out: string[] = [''];
  for (let m = 1; m <= 12; m++) out.push(String(m).padStart(2, '0'));
  return out;
}

/** Human label for a month code, e.g. `'02'` → `'Feb'`. Indonesian, not japon. */
export function monthLabel(code: string): string {
  const n = parseInt(code, 10);
  if (!Number.isInteger(n) || n < 1 || n > 12) return '';
  return MONTH_ABBR[n - 1];
}

/**
 * Split a stored period into the two halves the control edits.
 *
 * The shapes that can come out of the database, and what each becomes:
 *
 *   `'2018-02'`      → `{ year: '2018', month: '02' }`   month is real
 *   `'2018-02-17'`   → `{ year: '2018', month: '02' }`   day is dropped
 *   `'2018'`         → `{ year: '2018', month: ''   }`   year-only, preserved
 *   `'SEKARANG'`     → `{ year: 'SEKARANG', month: '' }`  sentinel, passed through
 *   `'05 MEI 2024'`  → `{ year: '2024', month: '05' }`   month name read
 *   `'05 MEI'`       → `{ year: '05 MEI', month: '05' }`  no year to attach it to
 *   `''`/null        → `{ year: '',       month: ''   }`
 *
 * The sentinel is returned in `year` unchanged rather than being normalised
 * away: it is a sibling of a date, not a corrupt one, and the renderer that
 * prints the CV has to see it verbatim to write 現在.
 *
 * ⚠ THE RULE THAT MATTERS for the month control: a month is reported whenever
 * one can be RECOGNISED, even when the year half is unparseable. Reporting
 * `month: ''` for `'05 MEI'` is what made the dropdown dead — the month select
 * showed "—" no matter what the candidate picked, because the component had no
 * month to display and `joinPeriod` will not attach one to a non-year.
 *
 * A recognised named date is NORMALISED to `YYYY-MM` (`'05 MEI 2024'` →
 * `'2024-05'`). That drops the day, which the CV never prints, and it is the
 * only shape here whose round-trip is not byte-exact — deliberate, because
 * keeping "05 MEI 2024" in a year column is what produced an unreadable
 * rirekisho and a dead picker in the first place.
 */
export function splitPeriod(stored: string | null | undefined): { year: string; month: string } {
  const s = String(stored ?? '').trim();
  if (!s) return { year: '', month: '' };
  if (s === PERIODE_SEKARANG) return { year: PERIODE_SEKARANG, month: '' };
  const m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (m) {
    const mm = String(parseInt(m[2], 10)).padStart(2, '0');
    return { year: m[1], month: mm };
  }
  const named = NAMED_DATE.exec(s);
  if (named) {
    const key = named[2].toUpperCase().replace(/\./g, '');
    const month = MONTH_NAMES[key];
    if (month) {
      // A year is only adopted when the whole string is the date; otherwise the
      // raw text stays in the year half so nothing the candidate can see is
      // lost, and `joinPeriod` keeps returning it unchanged.
      return { year: named[3] || s, month };
    }
  }
  // Anything else (a bare year, or something the candidate typed by hand) is
  // kept in the year half verbatim. Guessing a month from it, or dropping it,
  // would both be changes the owner did not ask for.
  return { year: s, month: '' };
}

/**
 * Recombine the two halves into the single string the backend stores.
 *
 * The inverse of `splitPeriod`, and the property that matters is that
 * `joinPeriod(splitPeriod(x)) === x.trim()` for every shape listed above —
 * including the year-only one. A month is written only when the candidate
 * actually chose one, so a legacy `"2021"` stays `"2021"` instead of becoming
 * `"2021-01"`, which would be an invented fact appearing on a CV.
 */
export function joinPeriod(year: string, month: string): string {
  const y = String(year ?? '').trim();
  const m = String(month ?? '').trim();
  if (!y) return '';
  if (!m) return y;
  // The year half can hold stored text the picker does not offer, so only
  // append a month when the year is actually a year — otherwise `"SEKARANG"`
  // would become `"SEKARANG-05"`.
  if (!/^\d{4}$/.test(y)) return y;
  return `${y}-${m}`;
}

/** Does a stored value mean "this is still happening"? */
export function isCurrent(value: string | null | undefined): boolean {
  return String(value ?? '').trim() === PERIODE_SEKARANG;
}

/**
 * Years offered by the picker, newest first.
 *
 * A stored year outside the window is appended rather than dropped: opening an
 * old CV and saving it must not erase a year the candidate graduated in.
 */
export function yearOptions(current: string): string[] {
  const now = new Date().getFullYear();
  const out: string[] = [''];
  for (let y = now; y >= now - 60; y--) out.push(String(y));
  const c = String(current ?? '').trim();
  if (c && !out.includes(c)) out.push(c);
  return out;
}
