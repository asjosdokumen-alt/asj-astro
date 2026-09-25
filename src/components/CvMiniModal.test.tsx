// ==========================================
// TESTS: CvMiniModal (A09 parity, 2026-09-05)
//
// Legacy ground truth: partials/modals-shared.html #modal-cv-mini +
// js/03_candidate.ts bukaModalCvMini()/prosesSimpanCvMini(). Root bugs covered:
//   - raw fetch never sent the session token → api.secure now used
//   - modal opened EMPTY → legacy prefills from the candidate row (gender
//     normalized PRIA/L→LAKI-LAKI & WANITA/P→PEREMPUAN, usia/tb/bb digit-only,
//     pendidikan level, jft/ssw text)
//   - pendidikan free text → legacy fixed select SMA/SMK/MA/D3/S1
//   - photo key `photo` silently dropped by the handler → now `photoFile`
//     (MASTER_FILE_COLUMNS photoFile → pas_photo)
//   - success dispatches candidates-changed (refresh) + legacy toast copy
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CvMiniModal, { PENDIDIKAN_OPTIONS } from './CvMiniModal';
import { showToast } from './Toast';

const { mockSecure, mockUpload } = vi.hoisted(() => ({
  mockSecure: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock('./Toast', () => ({ showToast: vi.fn() }));

vi.mock('../lib/apiClient', () => ({
  api: { secure: (...args: unknown[]) => mockSecure(...args) },
}));

vi.mock('../lib/cloudinary', () => ({
  uploadToCloudinary: (...args: unknown[]) => mockUpload(...args),
}));

vi.mock('../store/authReactive', () => {
  const listeners = new Set<() => void>();
  const state = {
    role: 'kandidat', name: 'KANDIDAT A', wa: '6281234567890',
    sessionToken: 'tok-1', refreshToken: '', isLoggedIn: true, lastChecked: 0,
  };
  return {
    authStore: {
      get: () => state,
      set: () => {},
      listen: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    },
    logout: vi.fn(),
  };
});

const selects = () => document.querySelectorAll('select');
const genderSelect = () => selects()[0] as HTMLSelectElement;
const pendidikanSelect = () => selects()[1] as HTMLSelectElement;

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Simpan CV Mini' }));
}

describe('CvMiniModal (A09)', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSecure.mockReset();
    mockSecure.mockResolvedValue({ success: true });
    mockUpload.mockReset();
    mockUpload.mockResolvedValue('https://res.cloudinary.com/asj/pas-foto.jpg');
    vi.mocked(showToast).mockReset();
    dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
  });

  afterEach(() => {
    cleanup();
    dispatchSpy.mockRestore();
  });

  it('renders legacy copy via t(): header, hint, save button, pendidikan options', () => {
    render(<CvMiniModal onClose={() => {}} />);
    expect(screen.getByText('Update Profil')).toBeTruthy();
    expect(screen.getByText(/Perbarui data Anda di bawah ini agar perusahaan tertarik/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Simpan CV Mini' })).toBeTruthy();
    expect(screen.getByText('PAS PHOTO TERBARU (JPG/PNG)')).toBeTruthy();
    const pend = pendidikanSelect();
    expect(Array.from(pend.options).map(o => o.value)).toEqual(['-', ...PENDIDIKAN_OPTIONS]);
  });

  it('prefill dari row kandidat: gender dinormalisasi, angka dibersihkan, level terpilih', () => {
    render(
      <CvMiniModal
        onClose={() => {}}
        prefill={{
          nama: 'KANDIDAT A', gender: 'PRIA', usia: '22 thn', tb: '170 cm', bb: '55kg',
          pendidikan: 'SMK', jftText: 'A2', sswText: 'Perawat',
        }}
      />,
    );
    expect(genderSelect().value).toBe('LAKI-LAKI');
    expect(pendidikanSelect().value).toBe('SMK');
    expect(screen.getByDisplayValue('22')).toBeTruthy();
    expect(screen.getByDisplayValue('170')).toBeTruthy();
    expect(screen.getByDisplayValue('55')).toBeTruthy();
    expect(screen.getByDisplayValue('A2')).toBeTruthy();
    expect(screen.getByDisplayValue('Perawat')).toBeTruthy();
  });

  it('gender WANITA/P → PEREMPUAN; nilai pendidikan tak dikenal → placeholder -', () => {
    render(<CvMiniModal onClose={() => {}} prefill={{ gender: 'WANITA', pendidikan: 'S2' }} />);
    expect(genderSelect().value).toBe('PEREMPUAN');
    expect(pendidikanSelect().value).toBe('-');
  });

  it('simpan → api.secure(simpanUpdateMaster) tanpa key photo/photoFile & tanpa pendidikan "-"', async () => {
    const onClose = vi.fn();
    render(<CvMiniModal onClose={onClose} prefill={{ nama: 'KANDIDAT A' }} />);
    fireEvent.input(document.querySelector('input[placeholder="22"]')!, { target: { value: '25' } });
    submit();
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    const [action, args] = mockSecure.mock.calls[0];
    expect(action).toBe('simpanUpdateMaster');
    const payload = args[0] as Record<string, string>;
    expect(payload.wa).toBe('6281234567890');
    expect(payload.nama).toBe('KANDIDAT A');
    expect(payload.gender).toBe('LAKI-LAKI');
    expect(payload.usia).toBe('25');
    expect(payload.pendidikan).toBeUndefined();
    expect(payload.photo).toBeUndefined();
    expect(payload.photoFile).toBeUndefined();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(vi.mocked(showToast)).toHaveBeenCalledWith('CV Mini Berhasil Diperbarui!', 'success');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'candidates-changed' }));
  });

  it('pilih pendidikan SMA → payload.pendidikan "SMA"', async () => {
    render(<CvMiniModal onClose={() => {}} prefill={{ pendidikan: '-' }} />);
    fireEvent.change(pendidikanSelect(), { target: { value: 'SMA' } });
    submit();
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    expect((mockSecure.mock.calls[0][1] as [Record<string, string>])[0].pendidikan).toBe('SMA');
  });

  it('pilih foto → payload.photoFile (Cloudinary URL), bukan key photo legacy', async () => {
    render(<CvMiniModal onClose={() => {}} />);
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    submit();
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledWith(file);
    const payload = (mockSecure.mock.calls[0][1] as [Record<string, string>])[0];
    expect(payload.photoFile).toBe('https://res.cloudinary.com/asj/pas-foto.jpg');
    expect(payload.photo).toBeUndefined();
  });

  it('server menolak → pesan asli server tampil (data.message)', async () => {
    mockSecure.mockResolvedValue({ success: false, message: 'Gagal simpan Master: X' });
    render(<CvMiniModal onClose={() => {}} />);
    submit();
    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalledWith('Gagal simpan Master: X', 'error'));
  });
});

// ==========================================
// Label/control wiring (a11y, 2026-09-16)
//
// The 8 `a11y/noLabelWithoutControl` diagnostics here were all ONE class —
// ordinary control labels — so all 8 took the same fix: `for=` + `id=` (prefix
// `cm-`). No group label and no element misuse in this file.
//
// The tests above drive the modal through its BEHAVIOUR (prefill, save payload,
// photo key, error copy). None of them would notice a label whose `for=` points
// nowhere: the modal still prefills, still saves, still toasts. These assertions
// pin the association itself.
// ==========================================
describe('CvMiniModal — label/control wiring', () => {
  afterEach(() => cleanup());

  it('every <label for=...> resolves to an element that exists', () => {
    render(<CvMiniModal onClose={() => {}} />);

    const dangling: string[] = [];
    for (const label of document.querySelectorAll('label')) {
      const target = label.getAttribute('for');
      if (!target) continue;
      if (!document.getElementById(target)) dangling.push(target);
    }

    expect(dangling).toEqual([]);
  });

  it('no label is left with neither for= nor a wrapped control', () => {
    render(<CvMiniModal onClose={() => {}} />);

    const orphans = [...document.querySelectorAll('label')]
      .filter((l) => !l.getAttribute('for') && !l.querySelector('input, select, textarea'))
      .map((l) => (l.textContent || '').trim().slice(0, 40));

    expect(orphans).toEqual([]);
  });

  it('the controls the labels name are the ones the modal actually binds', () => {
    render(<CvMiniModal onClose={() => {}} />);

    for (const [id, tag] of [
      ['cm-gender', 'SELECT'],
      ['cm-usia', 'INPUT'],
      ['cm-tb', 'INPUT'],
      ['cm-bb', 'INPUT'],
      ['cm-pendidikan', 'SELECT'],
      ['cm-jft', 'INPUT'],
      ['cm-ssw', 'INPUT'],
      ['cm-photo', 'INPUT'],
    ] as const) {
      const el = document.getElementById(id);
      expect(el, `#${id} does not exist`).toBeTruthy();
      expect(el?.tagName).toBe(tag);
    }

    // The photo field must stay a file input — a label pointing at a text input
    // would still "resolve".
    expect((document.getElementById('cm-photo') as HTMLInputElement).type).toBe('file');
  });

  it('the two selects the behaviour tests index BY POSITION are the labelled ones', () => {
    render(<CvMiniModal onClose={() => {}} />);

    // The tests above locate selects positionally (`selects()[0]` / `selects()[1]`).
    // If a select is inserted before them those helpers silently target the wrong
    // control and the assertions keep passing. This gives that coupling a name.
    expect(document.getElementById('cm-gender')?.tagName).toBe('SELECT');
    expect(document.getElementById('cm-pendidikan')?.tagName).toBe('SELECT');
    expect(selects().length).toBe(2);
  });
});
