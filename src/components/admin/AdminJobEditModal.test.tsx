// ==========================================
// TESTS: AdminJobEditModal (A17 parity, 2026-09-05)
//
// Legacy ground truth: js/api/jobs.ts (bukaEditFullLoker /
// submitEditFullLoker) + partials/modals-shared.html #modal-edit-full-loker
// (ef-code/pekerjaan/kategori/lokasi/gender/syarat/keterangan/tsk/kuota/
// template/pamflet/total-biaya/rincian-biaya) + editLokerFull backend
// (repository.ts JOB_COLUMNS maps camelCase `syarat`, `tsk`, ...).
//
// Root bugs covered:
//  1. The form field + shared Job type named the field `syRat` while the
//     backend maps & persists `syarat` — the Syarat box always opened empty
//     and edits were silently dropped on save.
//  2. ef-tsk (TSK pengurus select) missing — pengurus was not editable.
//  3. ef-template / ef-pamflet uploads missing.
//  4. The modal's added "Status" select did not exist in ef-* — status
//     values in job_database are raw ("✅ OPEN", "❌ CLOSE") so a plain
//     OPEN/URGENT/CLOSE select blanked on emoji rows and a save rewrote the
//     raw value. Status has its own toggles; the select is gone.
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminJobEditModal from './AdminJobEditModal';
import { showToast } from '../Toast';

const { mockSecure, mockGet, mockUpload } = vi.hoisted(() => ({
  mockSecure: vi.fn(),
  mockGet: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock('../Toast', () => ({ showToast: vi.fn() }));

vi.mock('../../lib/apiClient', () => {
  const api = {
    secure: (...args: unknown[]) => mockSecure(...args),
    get: (...args: unknown[]) => mockGet(...args),
  };
  return { api, default: api };
});

vi.mock('../../lib/cloudinary', () => ({
  uploadToCloudinary: (...args: unknown[]) => mockUpload(...args),
}));

vi.mock('../../store/i18n', () => ({ t: (k: string) => k }));

const DROPDOWNS = {
  success: true,
  dropdowns: {
    tsk: ['TSK-A', 'TSK-B'],
    kategori: ['🏭 MANUFAKTUR', '🍱 FOOD'],
    gender: ['LAKI-LAKI', 'PEREMPUAN'],
    lokasi: ['Tokyo', 'Osaka'],
    tahapan: ['PENDAFTARAN'],
    syarat: ['Usia 18-30'],
  },
};

const JOB = {
  code: 'TG123ASJ',
  pekerjaan: 'Perawat Lansia',
  kategori: '🏭 MANUFAKTUR',
  gender: 'PEREMPUAN',
  lokasi: 'Tokyo',
  syarat: 'Usia 18-30, Minimal SMA',
  keterangan: 'Info tambahan',
  tsk: 'TSK-A',
  kuota: '3',
  totalBiaya: '25 jt',
  rincianBiaya: 'TOTAL BIAYA: 25 jt',
  templateCv: 'https://cdn/x/cv.pdf',
  pamflet: 'https://cdn/x/p.jpg',
  updated_at: '2026-09-01T00:00:00.000Z',
};

function renderModal(job: unknown = JOB) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(<AdminJobEditModal job={job as never} onClose={onClose} onSave={onSave} />);
  return { onClose, onSave };
}

describe('AdminJobEditModal (A17)', () => {
  beforeEach(() => {
    mockSecure.mockReset();
    mockSecure.mockResolvedValue({ success: true });
    mockGet.mockReset();
    mockGet.mockResolvedValue(DROPDOWNS);
    mockUpload.mockReset();
    mockUpload.mockResolvedValue('https://cdn/x/up.pdf');
    vi.mocked(showToast).mockReset();
  });
  afterEach(() => cleanup());

  it('prefills the SYARAT box from job.syarat (was syRat → always empty)', async () => {
    renderModal();
    const syarat = (await screen.findByDisplayValue('Usia 18-30, Minimal SMA')) as HTMLTextAreaElement;
    expect(syarat).toBeTruthy();
    expect(screen.getByDisplayValue('Perawat Lansia')).toBeTruthy();
    expect(screen.getByDisplayValue('Tokyo')).toBeTruthy();
    expect(screen.getByDisplayValue('TSK-A')).toBeTruthy();
    expect(screen.getByDisplayValue('3')).toBeTruthy();
  });

  it('kategori/gender/tsk selects are fed from config dropdowns + current value union', async () => {
    renderModal({ ...JOB, kategori: 'KATEGORI LAMA', gender: 'PRIA', tsk: 'TSK-Z' });
    // nilai lama (tidak ada di config) tetap tampil sebagai opsi
    expect(await screen.findByRole('option', { name: 'KATEGORI LAMA' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'PRIA' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'TSK-Z' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '🏭 MANUFAKTUR' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'TSK-B' })).toBeTruthy();
  });

  it('save → editLokerFull payload uses syarat/tsk (no status, no syRat) + toast/onSave/onClose', async () => {
    const { onClose, onSave } = renderModal();
    fireEvent.click(await screen.findByText('button.save_changes'));
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    const [action, args] = mockSecure.mock.calls[0] as [string, Record<string, unknown>[]];
    expect(action).toBe('editLokerFull');
    const payload = args[0] as Record<string, unknown>;
    expect(payload.code).toBe('TG123ASJ');
    expect(payload.syarat).toBe('Usia 18-30, Minimal SMA');
    expect(payload.tsk).toBe('TSK-A');
    expect(payload.pekerjaan).toBe('Perawat Lansia');
    expect(payload.kuota).toBe('3');
    expect(payload.updated_at).toBe(JOB.updated_at);
    expect('status' in payload).toBe(false);
    expect('syRat' in payload).toBe(false);
    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalledWith('ui.toast_job_updated', 'success'));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalled();
  });

  it('syarat edit actually reaches the payload (was silently dropped)', async () => {
    renderModal();
    const ta = (await screen.findByDisplayValue('Usia 18-30, Minimal SMA')) as HTMLTextAreaElement;
    fireEvent.input(ta, { target: { value: 'Usia 20-35, Wajib SSW' } });
    fireEvent.click(screen.getByText('button.save_changes'));
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    const [, args] = mockSecure.mock.calls[0] as [string, Record<string, unknown>[]];
    expect((args[0] as Record<string, unknown>).syarat).toBe('Usia 20-35, Wajib SSW');
  });

  it('tsk editable: memilih TSK lain ikut terkirim', async () => {
    renderModal();
    const sel = (await screen.findByDisplayValue('TSK-A')) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'TSK-B' } });
    fireEvent.click(screen.getByText('button.save_changes'));
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    const [, args] = mockSecure.mock.calls[0] as [string, Record<string, unknown>[]];
    expect((args[0] as Record<string, unknown>).tsk).toBe('TSK-B');
  });

  it('uploads template + pamflet to Cloudinary when chosen; payload gets URLs', async () => {
    renderModal();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type=file]'));
    expect(inputs.length).toBe(2);
    fireEvent.change(inputs[0], {
      target: { files: [new File(['cv'], 'cv.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] },
    });
    fireEvent.change(inputs[1], {
      target: { files: [new File(['p'], 'p.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(await screen.findByText('button.save_changes'));
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledTimes(2);
    const [, args] = mockSecure.mock.calls[0] as [string, Record<string, unknown>[]];
    expect((args[0] as Record<string, unknown>).templateCv).toBe('https://cdn/x/up.pdf');
    expect((args[0] as Record<string, unknown>).pamflet).toBe('https://cdn/x/up.pdf');
  });

  it('no file chosen → no upload; payload templateCv/pamflet = "-" (server keeps old value)', async () => {
    renderModal();
    fireEvent.click(await screen.findByText('button.save_changes'));
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    expect(mockUpload).not.toHaveBeenCalled();
    const [, args] = mockSecure.mock.calls[0] as [string, Record<string, unknown>[]];
    expect((args[0] as Record<string, unknown>).templateCv).toBe('-');
    expect((args[0] as Record<string, unknown>).pamflet).toBe('-');
  });

  it('save failure → error toast with real message, no close', async () => {
    mockSecure.mockResolvedValue({ success: false, error: 'Data telah diubah oleh pengguna lain.' });
    const { onClose } = renderModal();
    fireEvent.click(await screen.findByText('button.save_changes'));
    await waitFor(() =>
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Data telah diubah oleh pengguna lain.', 'error'),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('labels via t(): code readonly, gender/tsk, save_changes present', async () => {
    renderModal();
    expect(await screen.findByText('admin.form_job_code_ro:')).toBeTruthy();
    expect(screen.getByText('admin.form_gender')).toBeTruthy();
    expect(screen.getByText('admin.form_tsk')).toBeTruthy();
    expect(screen.getByText('admin.form_category')).toBeTruthy();
    expect(screen.getByText('ui.update_cv_template')).toBeTruthy();
    expect(screen.getByText('ui.update_pamflet')).toBeTruthy();
    expect(screen.getByText('TG123ASJ')).toBeTruthy();
  });
});

// ==========================================
// Label/control wiring (a11y, 2026-09-16)
//
// The 12 `a11y/noLabelWithoutControl` diagnostics in this modal were paid down in
// one pass, in two classes:
//
//   * 11 ordinary control labels -> `for=` + `id=` (prefix `ef-`)
//   *  1 `<label>` sitting above a `<button>` ("Rincian Biaya" + "Buka editor")
//      -> the ELEMENT was wrong. `for=` can never name a `<button>`, so it became
//      a `<div>`.
//
// The tests above assert that label TEXT is rendered, which is not the same thing:
// a label whose `for=` points nowhere still renders its text, still saves, still
// toasts. These assertions pin the association itself.
// ==========================================
describe('AdminJobEditModal — label/control wiring', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue(DROPDOWNS);
  });
  afterEach(() => cleanup());

  it('every <label for=...> resolves to an element that exists', async () => {
    renderModal();
    await screen.findByDisplayValue('Perawat Lansia');

    const dangling: string[] = [];
    for (const label of document.querySelectorAll('label')) {
      const target = label.getAttribute('for');
      if (!target) continue;
      if (!document.getElementById(target)) dangling.push(target);
    }

    expect(dangling).toEqual([]);
  });

  it('no label is left with neither for= nor a wrapped control', async () => {
    renderModal();
    await screen.findByDisplayValue('Perawat Lansia');

    // This is ALSO what catches the `<label>` above a `<button>`: it has no `for=`
    // and wraps no control, so it can never name anything.
    const orphans = [...document.querySelectorAll('label')]
      .filter((l) => !l.getAttribute('for') && !l.querySelector('input, select, textarea'))
      .map((l) => (l.textContent || '').trim().slice(0, 40));

    expect(orphans).toEqual([]);
  });

  it('the controls the labels name are the ones the modal actually binds', async () => {
    renderModal();
    await screen.findByDisplayValue('Perawat Lansia');

    for (const [id, tag] of [
      ['ef-pekerjaan', 'INPUT'],
      ['ef-kategori', 'SELECT'],
      ['ef-gender', 'SELECT'],
      ['ef-lokasi', 'INPUT'],
      ['ef-tsk', 'SELECT'],
      ['ef-kuota', 'INPUT'],
      ['ef-syarat', 'TEXTAREA'],
      ['ef-keterangan', 'TEXTAREA'],
      ['ef-template', 'INPUT'],
      ['ef-pamflet', 'INPUT'],
      ['ef-total-biaya', 'INPUT'],
    ] as const) {
      const el = document.getElementById(id);
      expect(el, `#${id} does not exist`).toBeTruthy();
      expect(el?.tagName).toBe(tag);
    }

    // The two uploads must stay file inputs.
    expect((document.getElementById('ef-template') as HTMLInputElement).type).toBe('file');
    expect((document.getElementById('ef-pamflet') as HTMLInputElement).type).toBe('file');
  });

  it('the location input keeps a datalist that exists', async () => {
    renderModal();
    await screen.findByDisplayValue('Perawat Lansia');

    // `list=` points at a datalist BY ID. A dangling `list=` renders fine and
    // silently drops every suggestion — the same drift class as `for=`.
    const input = document.getElementById('ef-lokasi') as HTMLInputElement;
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId as string)).toBeTruthy();
  });
});
