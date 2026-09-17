import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EditCandidateModal from './EditCandidateModal';
import { showToast } from '../Toast';

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

// Row shape = mapCandidate ter-dekorasi (getCandidatesPage): field flat
// camelCase (tempatLahir/tglLahir/tb/bb/jftText/sswText) + catatanInt (tag
// VIP/KELAS) + catatanExt — bukan nama lama (tmplahir/fisik/jft-url).
const mockCandidate = {
  wa: '6285854256720',
  nama: 'REVIN ANTHONIO NOVRI ANDHI',
  gender: 'LAKI-LAKI',
  usia: '19',
  tempatLahir: 'Jakarta',
  tglLahir: '',
  tb: '170',
  bb: '65',
  pendidikan: 'SMA',
  jftText: 'A2',
  sswText: 'Perawat',
  tahapan: 'LIST',
  status: 'Aktif',
  catatanInt: '[KELAS G] Catatan internal admin',
  catatanExt: 'Feedback untuk kandidat',
  isVIP: false,
  isSiswaASJ: true,
};

describe('EditCandidateModal', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(showToast).mockReset();
  });

  afterEach(() => cleanup());

  it('renders all editable fields from the decorated row', () => {
    render(<EditCandidateModal candidate={mockCandidate} isOpen={true} onClose={() => {}} />);

    expect(screen.getAllByText(/REVIN ANTHONIO/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue('LAKI-LAKI')).toBeTruthy();
    expect(screen.getByDisplayValue('19')).toBeTruthy();
    expect(screen.getByDisplayValue('Jakarta')).toBeTruthy();
    expect(screen.getByDisplayValue('170')).toBeTruthy();
    expect(screen.getByDisplayValue('65')).toBeTruthy();
    expect(screen.getByDisplayValue('SMA')).toBeTruthy();
    expect(screen.getByDisplayValue('LIST')).toBeTruthy();
    expect(screen.getByDisplayValue('Aktif')).toBeTruthy();
    expect(screen.getByDisplayValue('A2')).toBeTruthy();
    expect(screen.getByDisplayValue('Perawat')).toBeTruthy();
    // Catatan external terisi dari catatanExt (bukan catatan_admin).
    expect(screen.getByDisplayValue('Feedback untuk kandidat')).toBeTruthy();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <EditCandidateModal candidate={mockCandidate} isOpen={false} onClose={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('saves via updateKandidatSuper with pendidikan/catatanExt/isVip in one call', async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ success: true }) });
    const onClose = vi.fn();
    const { container } = render(
      <EditCandidateModal candidate={mockCandidate} isOpen={true} onClose={onClose} />
    );

    const saveBtn = container.querySelector('button.bg-sky-600') as HTMLButtonElement;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/.netlify/functions/updateKandidatSuper',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('updateKandidatSuper'),
        })
      );
      const bodyArg = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      const arg = bodyArg.args[0];
      expect(arg.pendidikan).toBe('SMA');
      expect(arg.catatanExt).toBe('Feedback untuk kandidat');
      expect(arg.isVip).toBe(false);
      expect(arg.tempatLahir).toBe('Jakarta');
      // Satu panggilan saja — catatan tidak disimpan lewat action terpisah.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('seeds VIP state from the [VIP] tag in catatan internal', () => {
    render(
      <EditCandidateModal
        candidate={{ ...mockCandidate, catatanInt: '[VIP] [KELAS G] note' }}
        isOpen={true}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('[VIP] Aktif')).toBeTruthy();
  });

  it('shows error toast on API failure', async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ success: false, error: 'Kandidat tidak ditemukan.' }) });
    const { container } = render(
      <EditCandidateModal candidate={mockCandidate} isOpen={true} onClose={() => {}} />
    );

    const saveBtn = container.querySelector('button.bg-sky-600') as HTMLButtonElement;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Kandidat tidak ditemukan.', 'error');
    });
  });

  it('calls onClose when Tutup is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <EditCandidateModal candidate={mockCandidate} isOpen={true} onClose={onClose} />
    );

    const closeBtn = container.querySelector('button.bg-slate-700') as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});

// ==========================================
// Label/control wiring (a11y, 2026-09-16)
//
// The 13 `a11y/noLabelWithoutControl` diagnostics in this modal were paid down in
// one pass, and they were NOT all one defect:
//
//   * 12 ordinary control labels -> `for=` + `id=` (prefix `ec-`)
//   *  1 `<label>` used as a SECTION HEADING ("Upload Dokumen", above the document
//      grid) -> the ELEMENT was wrong. It names no control, so `for=` can never be
//      right for it; it became a `<div>`.
//
// The behaviour tests above say nothing about association: a modal whose labels
// point at ids that do not exist still renders, still saves, still toasts. These
// assertions pin the two things that rot silently.
//
// Note what is deliberately NOT asserted: a label COUNT. The lint rule counts
// source LOCATIONS while the user meets rendered labels, so a count here would be
// a second, weaker copy of the ratchet.
// ==========================================
describe('EditCandidateModal — label/control wiring', () => {
  const renderModal = () =>
    render(
      <EditCandidateModal candidate={mockCandidate} isOpen={true} onClose={() => {}} />
    ).container;

  it('every <label for=...> resolves to an element that exists', () => {
    const root = renderModal();

    const dangling: string[] = [];
    for (const label of root.querySelectorAll('label')) {
      const target = label.getAttribute('for');
      if (!target) continue;
      if (!document.getElementById(target)) dangling.push(target);
    }

    expect(dangling).toEqual([]);
  });

  it('no label is left with neither for= nor a wrapped control', () => {
    const root = renderModal();

    // This is ALSO what catches the heading misuse: a <label> used as a section
    // title has no `for=` and wraps no control, so it can never name anything.
    const orphans = [...root.querySelectorAll('label')]
      .filter((l) => !l.getAttribute('for') && !l.querySelector('input, select, textarea'))
      .map((l) => (l.textContent || '').trim().slice(0, 40));

    expect(orphans).toEqual([]);
  });

  it('the controls the labels name are the ones the modal actually binds', () => {
    renderModal();

    // Spot-check both ends of the wiring, so a `for=` that resolves to the WRONG
    // element (two fields sharing an id) is caught — "resolves to something" is
    // not the same as "resolves to the right thing".
    for (const [id, tag] of [
      ['ec-gender', 'SELECT'],
      ['ec-usia', 'INPUT'],
      ['ec-tempat-lahir', 'INPUT'],
      ['ec-tgl-lahir', 'INPUT'],
      ['ec-pendidikan', 'SELECT'],
      ['ec-tahapan', 'SELECT'],
      ['ec-status', 'SELECT'],
      ['ec-catatan-ext', 'TEXTAREA'],
    ] as const) {
      const el = document.getElementById(id);
      expect(el, `#${id} does not exist`).toBeTruthy();
      expect(el?.tagName).toBe(tag);
    }

    // The one input whose TYPE matters — a date picker that silently became a text
    // field would still be associated, and still be wrong.
    expect((document.getElementById('ec-tgl-lahir') as HTMLInputElement).type).toBe('date');
  });
});
