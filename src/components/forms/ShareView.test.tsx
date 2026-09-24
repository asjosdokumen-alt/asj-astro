// ==========================================
// TESTS: ShareView (B06 parity, 2026-09-05)
//
// Legacy ground truth: share.html + js/pages/share.ts (renderGrid /
// submitSelection) against '/api/share-data?job=CODE'. Root bugs pinned:
//  1. The view read invented fields (id/nama/wa/photo/cvUrl…) while the API
//     returns id_kandidat/nama_lengkap/no_wa/pas_photo/file_cv/jft/ssw/
//     nilai_jft_text/bidang_ssw_text/extraDocs + job {code,name,tsk} — every
//     card rendered empty. Now adapted to the real contract (legacy shape).
//  2. "Kirim Pilihan" opened wa.me with NO number + a throwaway message;
//     legacy sends the admin number a greet + numbered (ID: …) list.
//  3. The viewer is public by job code, as legacy was. The per-job token gate
//     added 2026-09-05 was retired by the owner on 2026-09-13: ?job=CODE alone
//     opens the list, and a stale ?tk= from an old link is ignored.
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ShareView from './ShareView';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), useLang: () => 'id' };
});

const API_JOB = { code: 'TG658', name: 'Perawat Jepang', tsk: 'TSK-A' };
const API_CANDIDATES = [
  {
    id_kandidat: 'C1', no_wa: '628123456789', nama_lengkap: 'Budi Santoso',
    gender: 'LAKI-LAKI', usia: '24', tb: '170', bb: '65',
    pas_photo: 'https://cdn/p1.jpg', file_cv: 'https://cdn/cv1.xlsx',
    jft: '', ssw: 'https://cdn/ssw1.pdf',
    nilai_jft_text: 'A2', bidang_ssw_text: 'Perawatan',
    extraDocs: [{ name: 'KTP_1786683312223.pdf', url: 'https://cdn/ktp1.pdf' }],
  },
  {
    id_kandidat: 'C2', no_wa: '628987654321', nama_lengkap: 'Siti Aminah',
    gender: 'PEREMPUAN', usia: '21', tb: '158', bb: '50',
    pas_photo: '', file_cv: '', jft: '', ssw: '',
    nilai_jft_text: '', bidang_ssw_text: '', extraDocs: [],
  },
];

let mockFetch = vi.fn();

function setUrl(qs: string) {
  window.history.replaceState({}, '', '/share' + qs);
}

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  setUrl('?job=TG658');
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ job: API_JOB, candidates: API_CANDIDATES }),
  });
  vi.stubGlobal('open', vi.fn());
});

describe('ShareView (B06)', () => {
  it('fetches by job code alone (no token) and renders the REAL API contract', async () => {
    render(<ShareView />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeTruthy());
    expect(screen.getByText('Siti Aminah')).toBeTruthy();
    expect(screen.getByText('TG658')).toBeTruthy();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/.netlify/functions/share-data?job=TG658');
    expect(url).not.toContain('tk=');
    // header job name comes from job.name (the API key), not job.title
    expect(screen.getByText('Perawat Jepang')).toBeTruthy();
  });

  it('ignores a stale ?tk= left over from an old link', async () => {
    setUrl('?job=TG658&tk=TOK123');
    render(<ShareView />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeTruthy());
    expect(mockFetch.mock.calls[0][0] as string).not.toContain('tk=');
  });

  it('never fetches when ?job is missing', async () => {
    setUrl('');
    render(<ShareView />);
    await waitFor(() => expect(screen.getByText('share.err_title')).toBeTruthy());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('renders per-doc buttons from the contract (file_cv/jft/ssw + extraDocs)', async () => {
    render(<ShareView />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeTruthy());
    expect(screen.getAllByText('CV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SSW').length).toBeGreaterThan(0);
    // extra folder doc classified as KTP (legacy docTypeOf)
    expect(screen.getAllByText('KTP').length).toBeGreaterThan(0);
    // JFT chip text from nilai_jft_text
    expect(screen.getByText('A2')).toBeTruthy();
    expect(screen.getByText('Perawatan')).toBeTruthy();
  });

  it('falls back to an initials avatar when pas_photo is empty', async () => {
    render(<ShareView />);
    await waitFor(() => expect(screen.getByAltText('Siti Aminah')).toBeTruthy());
    const img = screen.getByAltText('Siti Aminah') as HTMLImageElement;
    expect(img.src).toContain('ui-avatars.com');
  });

  it('Kirim Pilihan builds the legacy WA message to the admin number', async () => {
    render(<ShareView />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeTruthy());
    const selectBtn = document.querySelector('button[aria-pressed="false"]') as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => expect(screen.getByText('share.sel_btn')).toBeTruthy());
    fireEvent.click(screen.getByText('share.sel_btn'));
    const open = vi.mocked(window.open);
    expect(open).toHaveBeenCalledTimes(1);
    const url = open.mock.calls[0][0] as string;
    expect(url.startsWith('https://wa.me/6287889502004?text=')).toBe(true);
    const text = decodeURIComponent(url.split('?text=')[1]);
    expect(text).toContain('TG658 - Perawat Jepang');
    expect(text).toContain('1. Budi Santoso (ID: C1)');
    expect(text).toContain('share.wa_closing');
  });

  it('shows the localized error view when the job code is unknown', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Kode job tidak ditemukan: TG999' }),
    });
    render(<ShareView />);
    await waitFor(() => expect(screen.getByText('share.err_title')).toBeTruthy());
    expect(screen.getByText('Kode job tidak ditemukan: TG999')).toBeTruthy();
  });

  it('shows the empty state when a valid job has no candidates yet', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ job: API_JOB, candidates: [] }),
    });
    render(<ShareView />);
    await waitFor(() => expect(screen.getByText('share.empty_title')).toBeTruthy());
  });
});
