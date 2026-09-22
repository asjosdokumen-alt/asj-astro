/**
 * Isolated unit test for JobMiniList's two decision rules.
 *
 * WHY A SEPARATE TEST AND NOT ONLY e2e: the landing gate proves the SECTION
 * exists and is in the right place. It cannot see which FIVE rows came out,
 * because it never feeds the component a known payload — and "shows five rows"
 * and "shows the five newest OPEN rows, newest first, undated last" are
 * different claims. The difference is exactly the bug this file exists to
 * catch: filter-after-slice produces a list shorter than five, which still
 * renders, still passes a "section is visible" check, and is wrong.
 *
 * The two rules are re-implemented here rather than imported because they are
 * module-private in the component. That duplication is deliberate and bounded:
 * if the component's rule changes, this test keeps passing on its own copy and
 * the e2e gate is what notices — so this file must never be the ONLY evidence.
 */
import { describe, expect, it } from 'vitest';
import { jobTutupUntukLamar } from '../../lib/jobPhase';

interface Job {
  code: string;
  pekerjaan: string;
  status: string;
  tahapan: string;
  lokasi: string;
  createdAt?: string;
}

/** Mirror of JobMiniList's ordering: newest first, undated last. */
function newestFirst(jobs: Job[]): Job[] {
  const stampOf = (j: Job): number | null =>
    j.createdAt && !Number.isNaN(Date.parse(j.createdAt)) ? Date.parse(j.createdAt) : null;
  return [...jobs].sort((a, b) => {
    const sa = stampOf(a);
    const sb = stampOf(b);
    if (sa === null && sb === null) return 0;
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sb - sa;
  });
}

/** Mirror of JobMiniList's selection: filter to open FIRST, then take `limit`. */
function selectMini(jobs: Job[], limit = 5): Job[] {
  return newestFirst(jobs.filter((j) => !jobTutupUntukLamar(j))).slice(0, limit);
}

function job(code: string, tahapan: string, createdAt?: string): Job {
  return {
    code,
    pekerjaan: `PEKERJAAN ${code}`,
    status: 'OPEN',
    tahapan,
    lokasi: 'Ibaraki',
    createdAt,
  };
}

describe('JobMiniList selection', () => {
  it('takes the five NEWEST OPEN rows, not the five newest rows', () => {
    // Six rows, all dated most-recent-first EXCEPT the newest two are closed.
    // Slice-then-filter would return 4; filter-then-slice must return 5.
    const rows: Job[] = [
      job('A', 'KAIWA', '2026-09-18'), // closed: selection started
      job('B', 'MENUNGGU', '2026-09-17'), // closed by tahapan? no — MENUNGGU is open
      job('C', 'LIST', '2026-09-16'),
      job('D', 'PENDAFTARAN', '2026-09-15'),
      job('E', 'OPEN', '2026-09-14'),
      job('F', 'DAFTAR', '2026-09-13'),
      job('G', 'REVIEW', '2026-09-12'),
    ];
    const got = selectMini(rows, 5);

    expect(got.map((j) => j.code)).toEqual(['B', 'C', 'D', 'E', 'F']);
    // The whole point: still FIVE, even though the newest row is closed.
    expect(got).toHaveLength(5);
    expect(got.map((j) => j.code)).not.toContain('A');
  });

  it('puts rows with no usable date LAST, not first', () => {
    const rows: Job[] = [
      job('NODATE', 'OPEN'), // no createdAt at all
      job('BAD', 'OPEN', 'not-a-date'),
      job('NEW', 'OPEN', '2026-09-18'),
      job('OLD', 'OPEN', '2020-01-01'),
    ];
    const got = selectMini(rows, 4);

    // Dated rows first (newest -> oldest), then the two undated ones.
    expect(got[0].code).toBe('NEW');
    expect(got[1].code).toBe('OLD');
    expect(['NODATE', 'BAD']).toContain(got[2].code);
    expect(['NODATE', 'BAD']).toContain(got[3].code);
  });

  it('never claims five when fewer are open', () => {
    // Both tahapan here are on `jobTutupUntukLamar`'s closed list — verified
    // against the regex in src/lib/jobPhase.ts:47, not assumed. An earlier
    // draft of this test used "KAKIN", which is NOT on that list and is
    // therefore open; the test failed and the CODE was right.
    const rows: Job[] = [
      job('A', 'KAIWA', '2026-09-18'), // closed: interview stage
      job('B', 'NAITEI', '2026-09-17'), // closed: job offer issued
      job('C', 'OPEN', '2026-09-16'), // open
    ];
    const got = selectMini(rows, 5);
    expect(got).toHaveLength(1);
    expect(got[0].code).toBe('C');
  });

  it('does not mutate the array it was given', () => {
    // `jobs` comes from a shared cache object; sorting in place would reorder
    // it for LokerTable on the same page.
    const rows: Job[] = [job('Z', 'OPEN', '2020-01-01'), job('A', 'OPEN', '2026-09-18')];
    const before = rows.map((j) => j.code);
    selectMini(rows, 5);
    expect(rows.map((j) => j.code)).toEqual(before);
  });
});
