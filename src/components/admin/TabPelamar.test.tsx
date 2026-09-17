import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabPelamar from './TabPelamar';

// Harness lama memakai daftar tetap saat modul dimuat, sehingga tidak bisa
// menguji baris VIP vs baris biasa. `vi.hoisted` membuat pegangan store ini
// terlihat oleh factory vi.mock (factory diangkat ke atas blok import).
const h = vi.hoisted(() => ({ kandidatStore: null as unknown as { set: (v: unknown) => void } }));

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
  const kandidatList = mockStore([
    { id: 'KD001', nama: 'Budi', wa: '628123', idLoker: 'TG658', tahapan: 'LIST', status: 'OPEN', catatan: '', gender: 'L', usia: '25', jft: 'A2' },
  ]);
  h.kandidatStore = kandidatList as unknown as { set: (v: unknown) => void };
  return {
    kandidatList,
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

const BASE = {
  id: 'KD001', nama: 'Budi', wa: '628123', idLoker: 'TG658', tahapan: 'LIST', status: 'OPEN',
  catatan: '', gender: 'L', usia: '25', jft: 'A2',
};

describe('TabPelamar clock button', () => {
  beforeEach(() => { h.kandidatStore.set([BASE]); });
  afterEach(() => cleanup());

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

// ==========================================
// TESTS: indikator siswa di tabel admin (§6 gap 6, 2026-09-14)
//
// Legacy render/candidate.ts:634 menempelkan <img> logo ASJ (title
// ui.badge_official) di sebelah nama kandidat VIP. Astro memakai emoji 🏆/🎓 —
// tidak bisa diterjemahkan, tidak ikut tema, dan bukan aset merek.
// ==========================================
describe('TabPelamar — lencana siswa ASJ (bukan emoji)', () => {
  beforeEach(() => { h.kandidatStore.set([BASE]); });
  afterEach(() => cleanup());

  it('baris VIP → logo ASJ dengan title ui.badge_official, TANPA emoji', () => {
    h.kandidatStore.set([{ ...BASE, isVIP: true }]);
    render(<TabPelamar />);
    expect(screen.getByTitle('ui.badge_official')).toBeTruthy();
    expect(document.body.textContent).not.toContain('🏆');
    expect(document.body.textContent).not.toContain('🎓');
  });

  it('baris siswa ASJ (KELAS) → logo ASJ juga (keduanya = siswa ASJ)', () => {
    h.kandidatStore.set([{ ...BASE, isSiswaASJ: true }]);
    render(<TabPelamar />);
    expect(screen.getByTitle('ui.badge_official')).toBeTruthy();
    expect(document.body.textContent).not.toContain('🎓');
  });

  it('baris biasa → TIDAK ada lencana (tidak semua kandidat ditandai siswa)', () => {
    render(<TabPelamar />);
    expect(screen.queryByTitle('ui.badge_official')).toBeNull();
  });
});
