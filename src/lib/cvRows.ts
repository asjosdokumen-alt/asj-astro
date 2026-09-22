/**
 * Row-level primitives for the three dynamic CV sections
 * (pendidikan / pekerjaan / keluarga).
 *
 * These live here rather than inside `AiCvForm.tsx` for the same reason
 * `opsi-form.ts` and `helpers_cv.ts` do: a rendered form is hard to test
 * exhaustively, and the rules being encoded here are the ones that silently
 * corrupt a CV when they are wrong. Two of them have already done so in the
 * field:
 *
 *   1. **School order.** Students routinely type SMK before SMP, or SD after
 *      SMA, because the rows are filled in whatever order the documents happen
 *      to be in front of them. A CV that lists SMA above SMP reads as a
 *      fabrication to the employer reading it, so the order is imposed instead
 *      of trusted. `helpers_cv.ts` already ranks the *printed* CV
 *      (`sortEdu` at the single merge point in `cv-template-factory/data.ts`);
 *      this module imposes the same order on the *form*, so what the candidate
 *      sees while typing is what gets printed.
 *
 *   2. **Bare level names.** Legacy rows carry `"SMK"` while the form's list
 *      says `"SMA/SMK"`. A `<select>` whose value matches no option snaps to
 *      its first option, so opening such a CV and saving it would silently
 *      rewrite the level — the exact class of data loss `withEmpty(list,
 *      extraValue)` was written to prevent. `levelOptions` therefore injects
 *      the stored value as its own option.
 */

import { getTingkatVal } from './helpers_cv';

/** School levels, in the canonical order the printed CV uses. */
export const TINGKAT_OPTIONS = ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2'] as const;

/** A school level that is not in `TINGKAT_OPTIONS` still has to be selectable. */
export function levelOptions(current: string): string[] {
  const out: string[] = ['', ...TINGKAT_OPTIONS];
  const v = (current || '').trim();
  if (v && !out.includes(v)) out.push(v);
  return out;
}

/**
 * Sort education rows into SD → SMP → SMA/SMK → D3 → S1 → S2 order.
 *
 * The ranking itself is `getTingkatVal`'s job, so the form and the printed CV
 * cannot disagree — including on the spellings that are *not* in the list
 * above (`"MI"`, `"MTS"`, `"SMK"`, `"SMA NEGERI 1"`). Rows the ranker cannot
 * place (returning 99) keep their relative order and sink below the ranked
 * ones, which is the honest outcome: an unrankable level has no defensible
 * position, and inventing one would move a candidate's SD below their S2.
 *
 * The sort is stable, so rows that tie (two SDs, or two unrankable rows) keep
 * whatever order the candidate entered them in.
 */
export function sortEduRows<T extends { tingkat?: string }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index, rank: getTingkatVal(row.tingkat) }))
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
    .map(({ row }) => row);
}

/**
 * Rank of a school level, for tests and for any caller that needs the number
 * without the sort. Exported so the two cannot drift.
 */
export { getTingkatVal as rankTingkat };
