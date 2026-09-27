// ==========================================
// TESTS: TabAgenda — the "Agenda & Jadwal Terdekat" tile
//
// WHY THIS FILE EXISTS
// --------------------
// `#dash-agenda-list` was a hard-coded empty state for the whole life of the
// component: a single `t('ui.schedule_empty')` line, and a repo-wide grep found
// no writer for the id. The TODO recorded it as "known, not a bug, simply not
// built" — but the premise was wrong. The data layer existed: the `jadwal` tab
// already read it through the same call this tile now makes. So the defect was
// a never-connected component, not a missing backend.
//
// These tests pin the connection at its boundaries, which are exactly the
// places the old empty state hid:
//
//   1. real rows render, instead of the placeholder sentence;
//   2. the heading's promise ("TERDEKAT") is honoured — sorted by `waktu`;
//   3. an unparseable `waktu` sorts LAST rather than leading the list;
//   4. the tile is capped, and the count is shown so the cap is visible;
//   5. a FAILED fetch does not render the empty sentence (the two are
//      different facts: "nothing scheduled" vs "nobody knows");
//   6. a genuinely empty list DOES render the empty sentence.
//
// (5) is the one worth stating out loud: before this change the placeholder
// rendered UNCONDITIONALLY, so it was indistinguishable from a failure. Now the
// three states — loading, failed, empty — are distinct strings, and this suite
// asserts they stay distinct.
// ==========================================
import { render, screen, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSecure = vi.fn();
vi.mock('../../lib/apiClient', () => ({
  default: { secure: (...args: unknown[]) => mockSecure(...args) },
}));

import TabAgenda from './TabAgenda';

const jadwal = (over: Partial<Record<string, string>> = {}) => ({
  id: 'x',
  nama: 'PT Contoh',
  loker: 'Loker A',
  waktu: '2026-10-01T09:00:00Z',
  lokasi: 'Tokyo',
  tsk: 'TSK-1',
  link: '',
  ...over,
});

beforeEach(() => {
  mockSecure.mockReset();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TabAgenda — wired to real schedule data', () => {
  it('renders real rows instead of the placeholder sentence', async () => {
    mockSecure.mockResolvedValue({
      success: true,
      schedules: [jadwal({ id: 'a', nama: 'PT Sakura' }), jadwal({ id: 'b', nama: 'PT Fuji' })],
    });
    render(<TabAgenda />);

    await waitFor(() => expect(screen.getByText('PT Sakura')).toBeTruthy());
    expect(screen.getByText('PT Fuji')).toBeTruthy();
    // the old hard-coded empty sentence must NOT appear when data arrived
    expect(screen.queryByText(/Jadwal akan dimuat dari backend/)).toBeNull();
  });

  it('reads the same action the jadwal tab reads', async () => {
    mockSecure.mockResolvedValue({ success: true, schedules: [] });
    render(<TabAgenda />);

    await waitFor(() => expect(mockSecure).toHaveBeenCalled());
    expect(mockSecure.mock.calls[0][0]).toBe('getAppData');
    expect(mockSecure.mock.calls[0][1]).toEqual(['admin']);
  });

  it('honours "TERDEKAT": the earliest waktu comes first, not the array order', async () => {
    mockSecure.mockResolvedValue({
      success: true,
      schedules: [
        jadwal({ id: 'late', nama: 'LATER', waktu: '2026-12-01T09:00:00Z' }),
        jadwal({ id: 'soon', nama: 'SOONER', waktu: '2026-10-01T09:00:00Z' }),
      ],
    });
    render(<TabAgenda />);

    await waitFor(() => expect(screen.getByText('SOONER')).toBeTruthy());
    const names = screen.getAllByText(/SOONER|LATER/).map((n) => n.textContent);
    expect(names).toEqual(['SOONER', 'LATER']);
  });

  it('sinks an UNPARSEABLE waktu to the bottom instead of letting it lead', async () => {
    // A malformed date is still a real schedule — it must not be dropped, and
    // it must not outrank a real one. `Date.parse` on a plain word is NaN, and
    // a naive string sort would put it wherever the lexicographic order landed.
    mockSecure.mockResolvedValue({
      success: true,
      schedules: [
        jadwal({ id: 'bad', nama: 'BAD_DATE', waktu: 'belum ditentukan' }),
        jadwal({ id: 'good', nama: 'REAL_DATE', waktu: '2026-11-01T09:00:00Z' }),
      ],
    });
    render(<TabAgenda />);

    await waitFor(() => expect(screen.getByText('REAL_DATE')).toBeTruthy());
    const names = screen.getAllByText(/REAL_DATE|BAD_DATE/).map((n) => n.textContent);
    expect(names).toEqual(['REAL_DATE', 'BAD_DATE']);
  });

  it('caps the tile and SHOWS the cap, so it is not mistaken for the full list', async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      jadwal({ id: `j${i}`, nama: `ROW${i}`, waktu: `2026-10-${String(i + 1).padStart(2, '0')}T09:00:00Z` }),
    );
    mockSecure.mockResolvedValue({ success: true, schedules: many });
    render(<TabAgenda />);

    await waitFor(() => expect(screen.getByText('ROW0')).toBeTruthy());
    // 5 of 9, and the counter says so
    expect(screen.queryByText('ROW5')).toBeNull();
    expect(screen.getByText('5/9')).toBeTruthy();
  });

  it('a FAILED fetch does NOT render the empty sentence', async () => {
    // This is the regression the old code could not have: the placeholder was
    // unconditional, so "load failed" and "nothing scheduled" looked identical.
    mockSecure.mockRejectedValue(new Error('network down'));
    render(<TabAgenda />);

    await waitFor(() => expect(screen.queryByText(/Memuat jadwal/)).toBeNull());
    expect(screen.queryByText('Belum ada jadwal terdekat.')).toBeNull();
  });

  it('a genuinely EMPTY list DOES render the empty sentence', async () => {
    mockSecure.mockResolvedValue({ success: true, schedules: [] });
    render(<TabAgenda />);

    await waitFor(() => expect(screen.getByText('Belum ada jadwal terdekat.')).toBeTruthy());
  });

  it('a failed fetch keeps the escape hatch to the full jadwal tab', async () => {
    mockSecure.mockRejectedValue(new Error('boom'));
    render(<TabAgenda />);

    await waitFor(() => expect(screen.queryByText(/Memuat jadwal/)).toBeNull());
    // the button must survive every state — it is the only way out of a failure
    expect(screen.getByText(/Buka Kelola Jadwal/)).toBeTruthy();
  });
});
