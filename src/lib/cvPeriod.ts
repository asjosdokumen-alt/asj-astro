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
 * The three shapes that can come out of the database, and what each becomes:
 *
 *   `'2018-02'`  → `{ year: '2018', month: '02' }`   month is real
 *   `'2018'`     → `{ year: '2018', month: ''   }`   year-only, preserved
 *   `'SEKARANG'` → `{ year: 'SEKARANG', month: '' }`  sentinel, passed through
 *   `''`/null    → `{ year: '',       month: ''   }`
 *
 * The sentinel is returned in `year` unchanged rather than being normalised
 * away: it is a sibling of a date, not a corrupt one, and the renderer that
 * prints the CV has to see it verbatim to write 現在.
 */
export function splitPeriod(stored: string | null | undefined): { year: string; month: string } {
  const s = String(stored ?? '').trim();
  if (!s) return { year: '', month: '' };
  if (s === PERIODE_SEKARANG) return { year: PERIODE_SEKARANG, month: '' };
  const m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    const mm = String(parseInt(m[2], 10)).padStart(2, '0');
    return { year: m[1], month: mm };
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
