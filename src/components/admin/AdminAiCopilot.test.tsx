// ==========================================
// TESTS: AdminAiCopilot (A11 parity, 2026-09-05)
//
// Legacy ground truth: partials/modals-shared.html #modal-admin-ai +
// js/ai_copilot/{admin,parse,results}.ts. Root bugs pinned here:
//   - chat bubbles were stored but NEVER rendered (chat looked dead)
//   - raw fetch without session token (every action now goes through
//     api.secure so the Bearer token reaches the surface guard)
//   - parse is two-step (parseDokumenBiodata → submitMasterForm) — the old
//     modal showed a success toast and discarded the parsed data.
//     ⚠ 2026-10-30: the AI parse itself was REMOVED (quota), so those five
//     tests are gone; the tab is now "Alat" and holds Model/Hasil/Update Bio.
//   - copy via t() (no hard-coded chrome labels)
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminAiCopilot, { boldHtml } from './AdminAiCopilot';
import { showToast } from '../Toast';

const { mockSecure } = vi.hoisted(() => ({ mockSecure: vi.fn() }));

vi.mock('../Toast', () => ({ showToast: vi.fn() }));

vi.mock('../../lib/apiClient', () => ({
  api: { secure: (...args: unknown[]) => mockSecure(...args) },
}));

vi.mock('../../store/authReactive', () => {
  const listeners = new Set<() => void>();
  const state = {
    role: 'admin',
    name: 'KEPALA',
    wa: '',
    sessionToken: 'tok-admin',
    refreshToken: '',
    isLoggedIn: true,
    lastChecked: 0,
  };
  return {
    authStore: {
      get: () => state,
      set: () => {},
      listen: (cb: () => void) => {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
    },
    logout: vi.fn(),
  };
});

class FakeFileReader {
  result = 'data:application/pdf;base64,aGVsbG8=';
  onload: (() => void) | null = null;
  readAsDataURL() {
    setTimeout(() => this.onload && this.onload(), 0);
  }
}

function openParseTab() {
  fireEvent.click(screen.getByRole('button', { name: 'Alat' }));
}

function openChatTab() {
  fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
}

function fillWa(wa: string) {
  fireEvent.input(screen.getByPlaceholderText('WA kandidat'), { target: { value: wa } });
}

function sendMessage(text: string) {
  const input = screen.getByPlaceholderText('Ketik pesan untuk Jeklin...');
  fireEvent.input(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Bubbles may contain <b> children — match by textContent across elements. */
function bubbleWith(text: string) {
  return screen.getAllByText((_content: string, el: Element | null) => {
    if (!el) return false;
    const t = el.textContent || '';
    return t.length < 400 && t.includes(text);
  });
}

describe('AdminAiCopilot (A11)', () => {
  beforeEach(() => {
    mockSecure.mockReset();
    mockSecure.mockResolvedValue({ success: true });
    vi.mocked(showToast).mockReset();
  });

  afterEach(() => cleanup());

  it('boldHtml escapes HTML then converts **bold** (legacy esc + bold)', () => {
    expect(boldHtml('Halo **Admin** <script>x</script>')).toBe(
      'Halo <b>Admin</b> &lt;script&gt;x&lt;/script&gt;',
    );
  });

  it('renders header/tabs + assistant welcome bubble (messages VISIBLE)', () => {
    render(<AdminAiCopilot onClose={() => {}} />);
    expect(screen.getByText('AI HR Copilot')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chat' })).toBeTruthy();
    // Tab 'Parse' -> 'Alat' (2026-10-30): parse AI dihapus, isinya tinggal
    // Buat Model / Hasil Wawancara / Update Biodata.
    expect(screen.getByRole('button', { name: 'Alat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hasil' })).toBeTruthy();
    // Welcome bubble was the FIRST regression: state existed but never rendered.
    expect(screen.getByText(/Halo Admin! Saya Jeklin, asisten AI\./)).toBeTruthy();
  });

  it('send → api.secure(processAdminAIChat); user + assistant bubbles render', async () => {
    mockSecure.mockResolvedValueOnce({
      success: true,
      reply: 'Analisis **CV** selesai.',
    });
    render(<AdminAiCopilot candidateId="ASJ-1" candidateWa="6281234567890" onClose={() => {}} />);
    sendMessage('Analisis CV kandidat');
    await waitFor(() =>
      expect(mockSecure).toHaveBeenCalledWith('processAdminAIChat', [
        {
          adminName: 'KEPALA',
          message: 'Analisis CV kandidat',
          history: [expect.objectContaining({ role: 'assistant' })],
          candidateId: 'ASJ-1',
          wa: '6281234567890',
        },
      ]),
    );
    expect(screen.getByText('Analisis CV kandidat')).toBeTruthy();
    // Reply bubble visible with **bold** converted to <b> (rendered, not dropped).
    await waitFor(() => expect(bubbleWith('Analisis CV selesai.').length).toBeGreaterThan(0));
    const bubbles = bubbleWith('Analisis CV selesai.');
    expect(bubbles.some((b) => b.innerHTML.includes('<b>CV</b>'))).toBe(true);
  });

  // 2026-10-02: `wa` ADA di props sejak awal tapi TIDAK PERNAH dikirim ke
  // `processAdminAIChat`. Server (`chat.ts`) sudah lama siap menerimanya
  // (`if (d.candidateId || d.wa)`), jadi jalur `wa` adalah kode mati dari klien
  // ini — dan kandidat yang punya WA tanpa `candidateId` (mis. hanya ada di
  // master) kehilangan blok konteksnya. Satu baris hilang memisahkan "kandidat
  // terbaca" dari "kandidat tidak terbaca".
  it('candidateWa ikut terkirim sebagai `wa` (jalur konteks kandidat master-only)', async () => {
    render(<AdminAiCopilot candidateWa="6289999999999" onClose={() => {}} />);
    sendMessage('cek kandidat');

    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    const payload = mockSecure.mock.calls[0][1][0] as Record<string, unknown>;
    expect(payload.wa).toBe('6289999999999');
  });

  it('tanpa candidateWa, `wa` tidak dikirim sama sekali (bukan string kosong)', async () => {
    render(<AdminAiCopilot onClose={() => {}} />);
    sendMessage('halo');

    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    const payload = mockSecure.mock.calls[0][1][0] as Record<string, unknown>;
    // `undefined` membuat server mengabaikannya; `''` akan lolos `||` juga, tapi
    // kontraknya harus eksplisit: tidak ada WA = tidak ada kunci.
    expect(payload.wa).toBeUndefined();
  });

  // 2026-10-02: riwayat diambil SEBELUM bubble admin disisipkan. Dulu state
  // yang sudah memuat pesan baru dikirim, LALU `message` terpisah — sehingga
  // server menambahkan giliran terakhir untuk kedua kalinya.
  it('history yang dikirim TIDAK memuat pesan yang baru saja dikirim', async () => {
    render(<AdminAiCopilot onClose={() => {}} />);
    sendMessage('pesan pertama');

    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    const payload = mockSecure.mock.calls[0][1][0] as { history: Array<{ content: string }> };
    expect(payload.history.some((h) => h.content === 'pesan pertama')).toBe(false);
  });

  // 2026-10-02: dua klik cepat pada aksi AI = dua permintaan provider.
  it('klik ganda pada "Buat Model" hanya menembak SATU permintaan AI', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    mockSecure.mockImplementationOnce(
      () => new Promise((res) => { resolveFirst = res; }),
    );
    render(<AdminAiCopilot candidateWa="6281234567890" onClose={() => {}} />);
    openParseTab();
    const btn = screen.getByRole('button', { name: 'Model Doc' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    resolveFirst({ success: true, wa: '6281234567890', model: 'M' });
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(mockSecure).toHaveBeenCalledTimes(1);
  });

  it('klik ganda pada "Hasil Wawancara" hanya menembak SATU permintaan', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    mockSecure.mockImplementationOnce(
      () => new Promise((res) => { resolveFirst = res; }),
    );
    render(<AdminAiCopilot candidateWa="6281234567890" onClose={() => {}} />);
    openParseTab();
    const btn = screen.getByRole('button', { name: 'Hasil Wawancara' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    resolveFirst({ success: true, hasil: null, wa: '6281234567890' });
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    expect(mockSecure).toHaveBeenCalledTimes(1);
  });

  it('generate model: no WA/id → toast ai.fill_wa_first; with WA → generateWawancaraModel', async () => {
    mockSecure.mockResolvedValueOnce({
      success: true,
      wa: '6281234567890',
      nama: 'TES',
      bidang: 'Kaigo (介護)',
      model: '1. Hobi kamu apa?',
    });
    render(<AdminAiCopilot onClose={() => {}} />);
    openParseTab();
    fireEvent.click(screen.getByRole('button', { name: 'Model Doc' }));
    await waitFor(() =>
      expect(vi.mocked(showToast)).toHaveBeenCalledWith(
        'Isi nomor WA kandidat terlebih dahulu.',
        'error',
      ),
    );
    expect(mockSecure).not.toHaveBeenCalled();
    fillWa('6281234567890');
    fireEvent.click(screen.getByRole('button', { name: 'Model Doc' }));
    await waitFor(() =>
      expect(mockSecure).toHaveBeenCalledWith('generateWawancaraModel', [
        { candidateId: undefined, wa: '6281234567890', bidang: undefined },
      ]),
    );
    openChatTab();
    await waitFor(() =>
      expect(bubbleWith('Model Wawancara -').length).toBeGreaterThan(0),
    );
  });

  it('AI_UNAVAILABLE → banner shown; a later success clears it (§6.5 row 3)', async () => {
    mockSecure.mockResolvedValueOnce({
      success: false,
      error: 'Asisten AI sedang tidak tersedia. Coba lagi beberapa saat ya!',
      code: 'AI_UNAVAILABLE',
      retryAfter: 5,
    });
    render(<AdminAiCopilot onClose={() => {}} />);
    sendMessage('Analisis CV');

    // The banner names the state...
    await waitFor(() => expect(screen.getByText('Asisten AI sedang tidak tersedia')).toBeTruthy());
    // ...and carries the provider's own copy underneath.
    expect(
      screen.getByText('Asisten AI sedang tidak tersedia. Coba lagi beberapa saat ya!'),
    ).toBeTruthy();

    // Recovery clears it — the banner is a state, not a sticky scar.
    mockSecure.mockResolvedValueOnce({
      success: true,
      reply: 'Oke, sudah jalan lagi.',
      suggestedActions: [],
    });
    sendMessage('Coba lagi');
    await waitFor(() => expect(bubbleWith('Oke, sudah jalan lagi.').length).toBeGreaterThan(0));
    expect(screen.queryByText('Asisten AI sedang tidak tersedia')).toBeNull();
  });

  it('results → card + Update Biodata submits parsed biodata to master', async () => {
    mockSecure
      .mockResolvedValueOnce({
        success: true,
        wa: '6281234567890',
        nama: 'TES',
        updatedAt: '2026-09-01T10:00:00Z',
        hasil: {
          score: 7,
          nilai: 70,
          rekomendasi: 'LAYAK',
          biodata: { nama: 'TES', gender: 'PEREMPUAN', kelebihan: 'Disiplin' },
        },
      })
      .mockResolvedValueOnce({ success: true });
    render(<AdminAiCopilot onClose={() => {}} />);
    openParseTab();
    fillWa('6281234567890');
    fireEvent.click(screen.getByRole('button', { name: 'Hasil Wawancara' }));
    await waitFor(() =>
      expect(mockSecure).toHaveBeenCalledWith('getHasilWawancara', [
        { candidateId: undefined, wa: '6281234567890' },
      ]),
    );
    // Results tab shows the fetched card.
    fireEvent.click(screen.getByRole('button', { name: 'Hasil' }));
    expect(screen.getByText('TES')).toBeTruthy();
    expect(screen.getByText(/LAYAK/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update Biodata' }));
    await waitFor(() =>
      expect(mockSecure).toHaveBeenCalledWith('submitMasterForm', [
        {
          wa: '6281234567890',
          nama: 'TES',
          gender: 'PEREMPUAN',
          kelebihan: 'Disiplin',
        },
      ]),
    );
    expect(vi.mocked(showToast)).toHaveBeenCalledWith(
      'Biodata kandidat berhasil diperbarui!',
      'success',
    );
  });

  it('results: no hasil → empty card state', async () => {
    mockSecure.mockResolvedValueOnce({ success: true, hasil: null, wa: '6281234567890' });
    render(<AdminAiCopilot onClose={() => {}} />);
    openParseTab();
    fillWa('6281234567890');
    fireEvent.click(screen.getByRole('button', { name: 'Hasil Wawancara' }));
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Hasil' }));
    expect(screen.getByText('Tidak ada hasil ditemukan.')).toBeTruthy();
  });
});
