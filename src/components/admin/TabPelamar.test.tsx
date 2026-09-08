import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import TabPelamar from './TabPelamar';

vi.mock('../../store/adminStore', () => {
  function mockStore(value: unknown) {
    const listeners = new Set<(v: unknown) => void>();
    return {
      get: () => value,
      set: (v: unknown) => { value = v; listeners.forEach(fn => fn(v)); },
      listen: (fn: (v: unknown) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
      subscribe: (fn: (v: unknown) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
      setKey: vi.fn(),
    };
  }
  return {
    kandidatList: mockStore([{ id: 'KD001', nama: 'Budi', wa: '628123', idLoker: 'TG658', tahapan: 'LIST', status: 'OPEN', catatan: '', gender: 'L', usia: '25', jft: 'A2' }]),
    allKandidatList: mockStore([]),
    kandidatTotal: mockStore(1),
    kandidatLoading: mockStore(false),
    adminSearch: mockStore(''),
    adminFilterGender: mockStore('all'),
    adminFilterAge: mockStore('all'),
    adminFilterJft: mockStore('all'),
    adminPage: mockStore(0),
    adminSimpleView: mockStore(false),
    PAGE_SIZE: 20,
    setAdminSearch: vi.fn(),
    setAdminFilterGender: vi.fn(),
    setAdminFilterAge: vi.fn(),
    setAdminFilterJft: vi.fn(),
    nextPage: vi.fn(),
    toggleSimpleView: vi.fn(),
    resetPage: vi.fn(),
    openInputModal: vi.fn(),
    openReportModal: vi.fn(),
    fetchKandidatFromAPI: vi.fn(),
  };
});

vi.mock('./InputManualModal', () => ({ default: () => null }));
vi.mock('./LaporanBulananModal', () => ({ default: () => null }));
vi.mock('./RirekishoBuilder', () => ({ default: () => null }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn() };
});

describe('TabPelamar clock button', () => {
  it('dispatches showCandidateHistory event when clock button clicked', () => {
    const handler = vi.fn();
    window.addEventListener('showCandidateHistory', handler);

    const { container } = render(<TabPelamar />);

    // The clock button is a small round button (w-8 h-8) in the action cell
    // It's the first button in each row's action div
    const actionDivs = container.querySelectorAll('.flex.justify-center');
    expect(actionDivs.length).toBeGreaterThan(0);

    // First button in the action div is the clock button
    const clockButton = actionDivs[0].querySelector('button') as HTMLButtonElement;
    expect(clockButton).toBeTruthy();

    fireEvent.click(clockButton);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        // Full decorated row ikut dikirim → CandidateProfileModal bisa render
        // tanpa fetch (fix A02: getAppData mode 'kandidat' menolak sesi admin).
        detail: expect.objectContaining({
          wa: '628123',
          nama: 'Budi',
          candidate: expect.objectContaining({ wa: '628123' }),
        }),
      })
    );

    window.removeEventListener('showCandidateHistory', handler);
  });
});
