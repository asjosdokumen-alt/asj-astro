/**
 * LokerTable.test.tsx — the static table must outlive a failed island.
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
 * The fix is a signal, not a timer: the island sets `data-loker-live` on
 * `<html>` only when it HAS rows, and the CSS rule in `LokerStaticList.astro`
 * hides the static copy only then. These tests pin both directions, because
 * "sets the attribute" alone would be satisfied by setting it on mount — which
 * is the same bug with extra steps.
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

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-loker-live');
  vi.clearAllMocks();
});

describe('LokerTable — kapan tabel statis boleh disembunyikan', () => {
  it('menandai <html> setelah datanya ADA', async () => {
    mocked.mockResolvedValue({ success: true, jobs: [JOB] } as never);
    render(<LokerTable />);

    await waitFor(() =>
      expect(document.documentElement.hasAttribute('data-loker-live')).toBe(true),
    );
  });

  it('TIDAK menandai <html> kalau datanya kosong — tabel statis tetap tampil', async () => {
    mocked.mockResolvedValue({ success: true, jobs: [] } as never);
    render(<LokerTable />);

    await waitFor(() => expect(mocked).toHaveBeenCalled());
    // Beri satu tick supaya efek setelah render sempat jalan; kalau penandaan
    // dipindah ke "saat mount", assertion ini yang merah.
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.hasAttribute('data-loker-live')).toBe(false);
  });

  it('TIDAK menandai <html> kalau fetch-nya GAGAL', async () => {
    mocked.mockRejectedValue(new Error('offline'));
    render(<LokerTable />);

    await waitFor(() => expect(mocked).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.hasAttribute('data-loker-live')).toBe(false);
  });

  it('melepas penandaan saat unmount, supaya tabel statis kembali', async () => {
    mocked.mockResolvedValue({ success: true, jobs: [JOB] } as never);
    const { unmount } = render(<LokerTable />);
    await waitFor(() =>
      expect(document.documentElement.hasAttribute('data-loker-live')).toBe(true),
    );

    unmount();
    expect(document.documentElement.hasAttribute('data-loker-live')).toBe(false);
  });
});
