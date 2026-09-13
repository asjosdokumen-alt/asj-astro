import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ListKandidatModal from './ListKandidatModal';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../store/authReactive', () => ({
  authStore: { get: () => ({ sessionToken: 'test-token' }) },
}));

vi.mock('../../lib/apiEndpoint', () => ({
  getEndpoint: (key: string) => `/.netlify/functions/${key}`,
}));

vi.mock('../Toast', () => ({
  showToast: vi.fn(),
}));

// Resolve the real dictionary instead of echoing the key. Returning the raw key
// made the assertions below depend on the *absence* of a translation: the moment
// "Link Grup WA (…)" moved from a JSX literal to a `t("admin.ph_grup_wa")` call,
// `getByPlaceholderText('Link Grup WA (…)')` stopped matching even though the
// rendered copy was byte-identical. Going through the real `t` keeps the test
// honest about what the user sees.
vi.mock('../../store/i18n', async () => {
  const actual = await vi.importActual<typeof import('../../store/i18n')>('../../store/i18n');
  return { ...actual, t: actual.t };
});

// ── adminStore mock (hoisted supaya aman dipakai factory vi.mock) ──────────
const h = vi.hoisted(() => {
  function makeStore(initial: unknown) {
    const listeners = new Set<(v: unknown) => void>();
    let value = initial;
    return {
      get: () => value,
      set: (v: unknown) => { value = v; listeners.forEach((fn) => fn(v)); },
      listen: (fn: (v: unknown) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
      subscribe: (fn: (v: unknown) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
      setKey: vi.fn(),
    };
  }
  const candA = { id: 'KD1', nama: 'BUDI', wa: '628111', idLoker: 'TG658', tahapan: 'LIST', status: 'OPEN' };
  const candB = { id: 'KD2', nama: 'ANDI', wa: '628222', idLoker: 'TG999', tahapan: 'LIST', status: 'OPEN' };
  const store = makeStore([candA, candB]);
  return { candA, candB, store, fetchAllKandidat: vi.fn() };
});

vi.mock('../../store/adminStore', () => ({
  allKandidatList: h.store,
  fetchAllKandidat: h.fetchAllKandidat,
}));

describe('ListKandidatModal (A04)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    h.fetchAllKandidat.mockReset();
    h.fetchAllKandidat.mockImplementation(() => Promise.resolve([h.candA, h.candB]));
    h.store.set([h.candA, h.candB]);
  });

  afterEach(() => cleanup());

  it('refreshes the full candidate store on open and lists only job-scoped rows', async () => {
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);

    await waitFor(() => expect(h.fetchAllKandidat).toHaveBeenCalled());
    expect(screen.getByText('BUDI')).toBeTruthy();
    expect(screen.queryByText('ANDI')).toBeNull();
    expect(screen.getByText('1 kandidat')).toBeTruthy();
  });

  it('opens the candidate dossier via showCandidateHistory (legacy eye button)', async () => {
    const handler = vi.fn();
    window.addEventListener('showCandidateHistory', handler);

    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTitle('Lihat profil/CV kandidat')).toBeTruthy());

    fireEvent.click(screen.getByTitle('Lihat profil/CV kandidat'));

    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ detail: expect.objectContaining({ wa: '628111', nama: 'BUDI' }) })
      );
    });
    window.removeEventListener('showCandidateHistory', handler);
  });

  it('removes a candidate via tandaiGagalJob [wa, jobCode] and refreshes', async () => {
    window.confirm = vi.fn(() => true);
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ success: true }) });

    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('BUDI')).toBeTruthy());

    fireEvent.click(screen.getByText('Hapus'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/.netlify/functions/tandaiGagalJob',
        expect.objectContaining({
          body: JSON.stringify({
            action: 'tandaiGagalJob',
            args: ['628111', 'TG658'],
            sessionToken: 'test-token',
          }),
        })
      );
      expect(h.fetchAllKandidat).toHaveBeenCalled();
    });
  });

  it('sends group invites with the legacy object payload via kirimTawaranMassal', async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ success: true }) });

    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('BUDI')).toBeTruthy());

    fireEvent.click(screen.getByText('Undang Grup'));
    await waitFor(() => expect(screen.getByPlaceholderText('Link Grup WA (https://chat…)')).toBeTruthy());
    fireEvent.input(screen.getByPlaceholderText('Link Grup WA (https://chat…)'), {
      target: { value: 'https://chat.whatsapp.com/ABC' },
    });
    fireEvent.click(screen.getByText('Mulai Kirim Undangan'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toBe('/.netlify/functions/kirimTawaranMassal');
    const sent = JSON.parse(String((lastCall[1] as RequestInit).body));
    expect(sent.args[0]).toEqual({
      candidates: [{ wa: '628111', nama: 'BUDI' }],
      jobCode: 'TG658',
      linkGrup: 'https://chat.whatsapp.com/ABC',
      interval: 5,
    });
  });

  it('closes via the X button', () => {
    const onClose = vi.fn();
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
