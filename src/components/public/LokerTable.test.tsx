/**
 * LokerTable.test.tsx — the static table must outlive a failed island,
 * and must not cost a layout shift when the island works.
 *
 * WHY THIS EXISTS (measured 2026-10-23)
 * -------------------------------------
 * `/loker` and `/public` ship the job table TWICE: `LokerStaticList.astro`
 * renders it at build time (crawlers, no-JS), and `LokerTable` renders it
 * again in the browser with filters. To avoid showing both, an inline script
 * hid the static copy — and it ran during HTML parsing, immediately, under a
 * comment that claimed it ran "once the client island hydrates".
 *
 * The consequence is the failure mode nobody looks at: when the island's fetch
 * fails (offline, API down, a JS error), the server-rendered rows are already
 * `display:none`. The page keeps its heading, its hint, and a gap. The fallback
 * that exists precisely for that situation was the first thing switched off.
 *
 * WHY THE SIGNAL INVERTED (measured 2026-11-09)
 * ---------------------------------------------
 * The first fix was a signal, not a timer: the island set `data-loker-live` on
 * `<html>` only when it HAD rows, and the static copy stayed visible until
 * then. That kept the fallback alive — and cost a layout shift on every normal
 * visit: the static copy occupies ~3,300px at 390px wide, so hiding it moved
 * everything below it up by 3,185px. Measured on /loker at 390px, CPU 4×,
 * Slow 4G: **CLS 0.562** (Google's "good" ceiling is 0.1); /public **0.478**.
 *
 * So the hiding moved EARLIER, not later: `BaseLayout` sets `data-js` on
 * `<html>` in its pre-paint inline script, and `LokerStaticList`'s CSS hides
 * the static copy whenever that attribute exists. Nothing paints the static
 * table when JS is available, so nothing can shift. The island then reports
 * FAILURE (`data-loker-failed`) — the exact case the fallback exists for — and
 * the static copy comes back.
 *
 * These tests pin the guarantee, not the mechanism: with JS running, the static
 * table is hidden for a successful fetch, and visible for an empty or failed
 * one. "Sets the attribute on mount" would still pass a naive version of the
 * first test, which is why the failure cases are asserted separately.
 */
import { render, cleanup, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LokerTable from './LokerTable';
import { getPublicData } from '../../lib/publicData';

vi.mock('../../lib/publicData', () => ({ getPublicData: vi.fn() }));

const mocked = vi.mocked(getPublicData);

/** One row is enough: the component only needs a non-empty list. */
const JOB = {
  code: 'J-001',
  pekerjaan: 'Kaigo',
  kategori: 'Perawatan',
  lokasi: 'Tokyo',
  gender: 'P',
  kuota: '5',
  status: 'OPEN',
  syarat: 'Sehat',
};

const fallbackShown = () => document.documentElement.hasAttribute('data-loker-failed');

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-loker-failed');
  vi.clearAllMocks();
});

describe('LokerTable — kapan tabel statis boleh disembunyikan', () => {
  it('TIDAK memunculkan tabel statis setelah datanya ADA', async () => {
    mocked.mockResolvedValue({ success: true, jobs: [JOB] } as never);
    render(<LokerTable />);

    await waitFor(() => expect(mocked).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    // Tabel statis sudah disembunyikan CSS sejak paint pertama (html[data-js]);
    // island yang sukses tidak boleh memunculkannya kembali.
    expect(fallbackShown()).toBe(false);
  });

  it('MEMUNCULKAN tabel statis kalau datanya kosong', async () => {
    mocked.mockResolvedValue({ success: true, jobs: [] } as never);
    render(<LokerTable />);

    await waitFor(() => expect(fallbackShown()).toBe(true));
  });

  it('MEMUNCULKAN tabel statis kalau fetch-nya GAGAL', async () => {
    mocked.mockRejectedValue(new Error('offline'));
    render(<LokerTable />);

    await waitFor(() => expect(fallbackShown()).toBe(true));
  });

  it('TIDAK menyentuh tabel statis selama masih memuat', async () => {
    // Fetch yang tidak pernah selesai: "nol baris" berarti "belum tahu".
    // Menandai gagal di sini akan memunculkan tabel statis lalu
    // menyembunyikannya lagi — pergeseran yang mau dihindari.
    mocked.mockReturnValue(new Promise(() => {}) as never);
    render(<LokerTable />);

    await new Promise((r) => setTimeout(r, 20));
    expect(fallbackShown()).toBe(false);
  });

  it('melepas penandaan saat unmount, supaya tabel statis kembali', async () => {
    mocked.mockRejectedValue(new Error('offline'));
    const { unmount } = render(<LokerTable />);
    await waitFor(() => expect(fallbackShown()).toBe(true));

    unmount();
    expect(fallbackShown()).toBe(false);
  });
});
