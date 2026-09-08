// ==========================================
// TESTS: TabWA (B02 parity, 2026-09-05)
//
// Legacy ground truth: js/08_wa_pintar.js submitWaTemplate/editWaTemplate/
// prosesHapusWa + callAPI("simpanWaTemplate", [id, nama, isi]) /
// callAPI("hapusWaTemplate", [id]) + showToast + refreshDataDinamis.
//
// Root bugs pinned here:
//   - old save/delete POSTed raw {nama, isi}/{id} bodies to
//     /.netlify/functions/config — a DEAD contract (template CRUD never worked).
//     Real actions: simpanWaTemplate [id?, nama, isi] / hapusWaTemplate [id]
//     via api.secure (session auto-inject + surface routing).
//   - alert()/confirm()/location.reload() → showToast + in-place refetch.
//   - hard-coded copy → t() keys.
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabWA from './TabWA';
import { showToast } from '../Toast';

vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return {
    t: (k: string) => {
      if (k === 'admin.wa_template_ph_nama') return 'Contoh: Jadwal Interview';
      if (k === 'admin.wa_template_ph_isi') return 'Konnichiwa <<NAMA>>, interview <<JOB>> dijadwalkan pada...';
      return k;
    },
    langStore: atom<'id' | 'jp'>('id'),
    toggleLang: vi.fn(),
  };
});
vi.mock('../../lib/apiClient', () => ({
  default: { secure: vi.fn(), get: vi.fn(), call: vi.fn() },
}));

import api from '../../lib/apiClient';

const apiSecure = vi.mocked(api.secure);

const TEMPLATES = [
  { id: 'WA1', nama: 'Jadwal Interview', isi: 'Konnichiwa <<NAMA>>, interview <<JOB>>' },
  { id: 'WA2', nama: 'Lolos', isi: 'Selamat <<NAMA>>!' },
];

describe('TabWA (B02)', () => {
  beforeEach(() => {
    apiSecure.mockReset();
    apiSecure.mockResolvedValue({ success: true, waTemplates: TEMPLATES });
    vi.mocked(showToast).mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });
  afterEach(() => cleanup());

  it('load template via api.secure("getAppData", ["admin"]) — bukan raw fetch', async () => {
    render(<TabWA />);
    await waitFor(() => expect(apiSecure).toHaveBeenCalledWith('getAppData', ['admin']));
    await waitFor(() => expect(screen.getByText('Jadwal Interview')).toBeTruthy());
  });

  it('simpan baru → api.secure("simpanWaTemplate", ["", nama, isi]) + toast + reload list', async () => {
    render(<TabWA />);
    await waitFor(() => expect(screen.getByText('Jadwal Interview')).toBeTruthy());
    fireEvent.input(screen.getByPlaceholderText('Contoh: Jadwal Interview'), { target: { value: 'Tes TPL' } });
    const tas = screen.getByPlaceholderText(/Konnichiwa/) as HTMLTextAreaElement;
    fireEvent.input(tas, { target: { value: 'Halo <<NAMA>>' } });
    fireEvent.submit(tas.closest('form')!);
    await waitFor(() =>
      expect(apiSecure).toHaveBeenCalledWith('simpanWaTemplate', ['', 'Tes TPL', 'Halo <<NAMA>>']),
    );
    expect(vi.mocked(showToast)).toHaveBeenCalledWith('ui.toast_wa_template_saved', 'success');
    // refetch setelah simpan (parity refreshDataDinamis — bukan location.reload)
    expect(apiSecure.mock.calls.filter((c) => c[0] === 'getAppData').length).toBeGreaterThanOrEqual(2);
  });

  it('edit → form terisi + simpan mengirim id template (parity editWaTemplate/submitWaTemplate)', async () => {
    render(<TabWA />);
    await waitFor(() => expect(screen.getByText('Jadwal Interview')).toBeTruthy());
    fireEvent.click(screen.getAllByText('ui.template_edit')[0]);
    await waitFor(() => expect(screen.getByText('ui.template_edit_title')).toBeTruthy());
    const namaInput = screen.getByPlaceholderText('Contoh: Jadwal Interview') as HTMLInputElement;
    expect(namaInput.value).toBe('Jadwal Interview');
    fireEvent.submit(namaInput.closest('form')!);
    await waitFor(() =>
      expect(apiSecure).toHaveBeenCalledWith('simpanWaTemplate', ['WA1', 'Jadwal Interview', 'Konnichiwa <<NAMA>>, interview <<JOB>>']),
    );
  });

  it('hapus → confirm lalu api.secure("hapusWaTemplate", [id]) + toast', async () => {
    render(<TabWA />);
    await waitFor(() => expect(screen.getByText('Jadwal Interview')).toBeTruthy());
    // Buttons order: [undangan kelas, submit, edit WA1, delete WA1, edit WA2, delete WA2]
    const btns = screen.getAllByRole('button');
    fireEvent.click(btns[3] as HTMLButtonElement);
    await waitFor(() => expect(apiSecure).toHaveBeenCalledWith('hapusWaTemplate', ['WA1']));
    expect(vi.mocked(showToast)).toHaveBeenCalledWith('ui.template_deleted', 'success');
  });

  it('chrome via t() keys (regresi hard-coded copy)', async () => {
    render(<TabWA />);
    await waitFor(() => expect(screen.getByText('ui.manage_wa_templates')).toBeTruthy());
    expect(screen.getByText('ui.new_template')).toBeTruthy();
    expect(screen.getByText('ui.template_name')).toBeTruthy();
    expect(screen.getByText('ui.template_message')).toBeTruthy();
    expect(screen.getByText('ui.save_template')).toBeTruthy();
  });
});