import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';
import UndanganKelasModal, { parseDaftarOrtu, parseVarianPesan } from './UndanganKelasModal';
import { showToast } from '../Toast';
import apiClient from '../../lib/apiClient';

vi.mock('../../store/i18n', () => ({ t: (k: string) => k }));
vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../lib/apiClient', () => ({ default: { call: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('parseDaftarOrtu — A06 parity (legacy normalizeWaInput)', () => {
  it('accepts 08xx and bare 8xx by normalizing to 628xx', () => {
    const { list, invalid } = parseDaftarOrtu(
      ['Ibu Sari|081234567890', 'Pak Andi|812345678901', 'Budi 6281234567890'].join('\n'),
    );
    expect(invalid).toBe(0);
    expect(list).toHaveLength(3);
    expect(list[0].wa).toBe('6281234567890');
    expect(list[1].wa).toBe('62812345678901');
    expect(list[2].wa).toBe('6281234567890');
  });

  it('fixes the 6208 typo like the shared normalizeWa rule', () => {
    const { list, invalid } = parseDaftarOrtu('Dewi|6208123456789');
    expect(invalid).toBe(0);
    expect(list[0].wa).toBe('628123456789');
  });

  it('accepts tab / semicolon separators and trailing digits without separator', () => {
    const { list, invalid } = parseDaftarOrtu('Sari\t081234567890\nCitra;6281234567890\nEka 6281234567890');
    expect(invalid).toBe(0);
    expect(list).toHaveLength(3);
  });

  it('drops invalid rows (no digits / short WA) and counts them', () => {
    const { list, invalid } = parseDaftarOrtu('Orang tanpa nomor\nGagal|12345\nNana|6281234567890');
    expect(invalid).toBe(2);
    expect(list).toHaveLength(1);
    expect(list[0].wa).toBe('6281234567890');
  });

  it('ignores blank lines', () => {
    const { list, invalid } = parseDaftarOrtu('\n\nBudi|6281234567890\n\n');
    expect(invalid).toBe(0);
    expect(list).toHaveLength(1);
  });
});

describe('parseVarianPesan — A06 parity', () => {
  it('splits template variants on --- lines and trims', () => {
    const v = parseVarianPesan('Pesan A\n\n---\n\n  Pesan B  ');
    expect(v).toEqual(['Pesan A', 'Pesan B']);
  });

  it('returns empty when template is empty or only separators', () => {
    expect(parseVarianPesan('')).toEqual([]);
    expect(parseVarianPesan('---\n---')).toEqual([]);
  });
});

describe('UndanganKelasModal — A06 render', () => {
  it('renders form and live preview replacing {nama} and {link_grup}', async () => {
    render(<UndanganKelasModal isOpen={true} onClose={vi.fn()} />);
    // Dua textarea: [0] daftar orang tua, [1] template pesan.
    const textareas = document.querySelectorAll('textarea') as unknown as HTMLTextAreaElement[];
    const link = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(textareas.length).toBeGreaterThanOrEqual(2);
    fireEvent.input(textareas[0], { target: { value: 'Budi|081234567890' } });
    fireEvent.input(link, { target: { value: 'https://chat.whatsapp.com/ABC' } });
    expect(screen.getByText(/Wali dari Budi/)).toBeTruthy();
    expect(screen.getByText(/https:\/\/chat\.whatsapp\.com\/ABC/)).toBeTruthy();
    // Jumlah penerima ter-render (key i18n identity).
    expect(screen.getByText('ui.list_preview_n')).toBeTruthy();
  });
});

// ============================================================================
// pollJobStatus failure paths (playbook PR2): getJobStatus tidak lagi
// mengirim lastError — status + hasError saja. Semua respons di samping
// memakai kontrak server SEKARANG (tanpa lastError), dan copy yang tampil
// ke user harus copy tetap komponen — bukan teks apa pun dari server.
// ============================================================================
const callMock = apiClient.call as unknown as ReturnType<typeof vi.fn>;

async function sendAndPoll(jobResponses: Record<string, unknown> | ((action: string) => unknown)) {
  vi.useFakeTimers();
  window.confirm = vi.fn(() => true);
  callMock.mockImplementation(async (action: string) => {
    if (action === 'kirimTawaranMassal') return { status: 'accepted', jobId: 'job-1' };
    if (action === 'getJobStatus') {
      return typeof jobResponses === 'function' ? jobResponses(action) : jobResponses;
    }
    throw new Error('unexpected apiClient action: ' + action);
  });
  render(<UndanganKelasModal isOpen={true} onClose={vi.fn()} />);
  const textareas = document.querySelectorAll('textarea') as unknown as HTMLTextAreaElement[];
  fireEvent.input(textareas[0], { target: { value: 'Budi|6281234567890' } });
  fireEvent.input(textareas[1], { target: { value: 'Pesan uji {nama}' } });
  fireEvent.input(document.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: 'https://chat.whatsapp.com/ABC' } });
  fireEvent.click(screen.getByText('ui.start_invite'));
  // Iterasi poll: tidur 6 dtk → getJobStatus → (lanjut | selesai). Microtask
  // di-flush oleh advanceTimersByTimeAsync setelah tiap timer.
  await vi.advanceTimersByTimeAsync(6000);
  await vi.advanceTimersByTimeAsync(6000);
}

describe('UndanganKelasModal — poll failure paths (PR2 redaction contract)', () => {
  it('status failed → fixed copy, not server error text', async () => {
    await sendAndPoll({ success: true, status: 'failed', hasError: true }); // kontrak server: TANPA lastError
    expect(showToast).toHaveBeenCalledWith(
      'ui.toast_invite_send_failedPengiriman gagal. Silakan coba lagi atau cek monitoring job.',
      'error',
    );
  });

  it('status dead → fixed copy, not server error text', async () => {
    await sendAndPoll({ success: true, status: 'dead', hasError: true });
    expect(showToast).toHaveBeenCalledWith(
      'ui.toast_invite_send_failedPengiriman dihentikan setelah berulang kali gagal.',
      'error',
    );
  });

  it('status not_found → server message field, error paths never read lastError', async () => {
    await sendAndPoll({ success: true, status: 'not_found', message: 'Job tidak ditemukan' });
    expect(showToast).toHaveBeenCalledWith(
      'ui.toast_invite_send_failedJob tidak ditemukan',
      'error',
    );
  });

  it('hasError=true on pending keeps polling; done delivers per-recipient results', async () => {
    // Kontrak server saat ini: pending dengan hasError (last_error ada di DB,
    // tidak pernah dikirim). Poll harus lanjut, bukan gagal.
    let pollCount = 0;
    await sendAndPoll(() => {
      pollCount++;
      return pollCount === 1
        ? { success: true, status: 'pending', attempts: 1, hasError: true }
        : { success: true, status: 'done', hasError: false, result: { results: [{ success: true, wa: '6281234567890' }, { success: false, wa: '6280000000000' }] } };
    });
    expect(pollCount).toBe(2); // pending tidak mengakhiri polling
    expect(showToast).toHaveBeenCalledWith(
      'ui.toast_invites_done_n'.replace('{n}', '1'),
      'success',
    );
    // Copy yang tampil tidak mengandung teks error server mana pun.
    const shown = String((showToast as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]);
    expect(shown).not.toContain('lastError');
    expect(shown).not.toContain('undefined');
  });

  it('all poll responses are consumed without any lastError field reaching the UI', async () => {
    // Guard kontrak: jika implementasi kembali membaca st.lastError, copy akan
    // berubah dari copy tetap → asersi exact-match di atas gagal. Tambahan:
    // respons dead/failed + copy harus sama persis, tanpa 'undefined'.
    await sendAndPoll({ success: true, status: 'dead', hasError: true });
    const calls = (showToast as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.at(-1)?.[1]).toBe('error');
    expect(String(calls.at(-1)?.[0])).not.toContain('undefined');
    expect(String(calls.at(-1)?.[0])).not.toContain('lastError');
  });
});
