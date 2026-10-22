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
    kandidatExhausted: mockStore(false),
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
    reloadKandidatList: vi.fn(async () => {}),
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

    // MEASURED 2026-10-11: `TabPelamar` kini punya DUA tata letak responsif —
    // tabel (≥md) dan kartu (<md) — yang keduanya ada di DOM saat jsdom tidak
    // menerapkan CSS. Selektor lama `.flex.justify-center` menangkap apa saja
    // yang punya kelas itu, TERMASUK tombolnya sendiri (`... flex items-center
    // justify-center ...`), lalu `[0]` bergantung pada urutan DOM: begitu kartu
    // diletakkan sebelum tabel, `[0]` jadi sebuah BUTTON dan
    // `querySelector('button')` mengembalikan null. Cacat itu milik selektornya,
    // bukan komponennya. Ambil wadah aksi (DIV) yang benar-benar membungkus
    // tombol, dan buktikan tombol pertama di dalamnya benar-benar tombol.
    const actionDivs = [...container.querySelectorAll('div.flex.justify-center')];
    expect(actionDivs.length).toBeGreaterThan(0);

    // First button in the action div is the clock button
    const clockButton = actionDivs[0].querySelector('button') as HTMLButtonElement;
    expect(clockButton).toBeTruthy();
    expect(clockButton.tagName).toBe('BUTTON');

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
//
// MEASURED 2026-10-11: komponen kini merender DUA tata letak (tabel ≥md + kartu
// <md) dan jsdom tidak menerapkan CSS, jadi satu baris menghasilkan satu lencana
// PER TATA LETAK. Assertion karena itu memakai `getAllBy…` dan memeriksa SETIAP
// lencana — bukan `getBy…` yang gagal begitu jumlahnya 2. Yang dijaga tetap
// sama: tiap nama ber-lencana memakai logo ASJ, dan emoji tidak pernah muncul.
// Sisi "tidak ada lencana" tetap eksak (`queryAllBy…` panjang 0), karena itu
// memang harus tetap benar di kedua tata letak.
// ==========================================
describe('TabPelamar — lencana siswa ASJ (bukan emoji)', () => {
  beforeEach(() => { h.kandidatStore.set([BASE]); });
  afterEach(() => cleanup());

  it('baris VIP → logo ASJ dengan title ui.badge_official, TANPA emoji', () => {
    h.kandidatStore.set([{ ...BASE, isVIP: true }]);
    render(<TabPelamar />);
    const badges = screen.getAllByTitle('ui.badge_official');
    expect(badges.length).toBeGreaterThan(0);
    for (const b of badges) expect(b.tagName).toBe('IMG');
    expect(document.body.textContent).not.toContain('🏆');
    expect(document.body.textContent).not.toContain('🎓');
  });

  it('baris siswa ASJ (KELAS) → logo ASJ juga (keduanya = siswa ASJ)', () => {
    h.kandidatStore.set([{ ...BASE, isSiswaASJ: true }]);
    render(<TabPelamar />);
    expect(screen.getAllByTitle('ui.badge_official').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('🎓');
  });

  it('baris biasa → TIDAK ada lencana (tidak semua kandidat ditandai siswa)', () => {
    render(<TabPelamar />);
    expect(screen.queryAllByTitle('ui.badge_official')).toHaveLength(0);
  });
});

// ==========================================
// TESTS: kontrak tata letak kotak cari (DIUKUR di browser, 2026-10-22)
//
// jsdom tidak menerapkan CSS, jadi yang dijaga adalah MEKANISME-nya; angkanya
// diukur probe Playwright di 390px: input cari tinggal 100px sementara
// placeholder butuh 189px ⇒ terpotong 89px, hampir separuh teks hilang.
// Sebabnya `flex-1` (= flex: 1 1 0%) yang membuat kotak ikut satu baris dengan
// lima tombol. `w-full` membuatnya mengambil satu baris penuh di mobile.
// ==========================================
describe('TabPelamar — kotak cari tidak diremas di mobile', () => {
  beforeEach(() => { h.kandidatStore.set([BASE]); });
  afterEach(() => cleanup());

  it('wadah input selebar baris di mobile, bukan flex-1', () => {
    const { container } = render(<TabPelamar />);
    const input = container.querySelector('input[placeholder="pelamar.placeholder_search"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const wrap = input.parentElement as HTMLElement;
    expect(wrap.className).not.toContain('flex-1');
    expect(wrap.className).toContain('w-full');
    // Desktop tidak boleh ikut berubah: 256px + tidak bisa diremas.
    expect(wrap.className).toContain('md:w-64');
    expect(wrap.className).toContain('md:shrink-0');
  });
});
