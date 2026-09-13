import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import EsignNaiteiModal, { allowedTahapanEsign } from './EsignNaiteiModal';
import { showToast } from './Toast';
import { t } from '../store/i18n';

vi.mock('../store/authReactive', () => ({
  authStore: { get: () => ({ sessionToken: 'test-token' }) },
}));

vi.mock('../lib/apiEndpoint', () => ({
  getEndpoint: (key: string) => `/.netlify/functions/${key}`,
}));

vi.mock('./Toast', () => ({
  showToast: vi.fn(),
}));

// Resolve the real dictionary. An identity stub (`t: k => k`) makes every
// assertion depend on the ABSENCE of a translation, so moving a string from a
// literal to t() breaks the query even when the rendered text is unchanged —
// that is what happened to alt="Pratinjau" → alt={t("ui.alt_pratinjau")}.
vi.mock('../store/i18n', async () => {
  const actual = await vi.importActual<typeof import('../store/i18n')>('../store/i18n');
  return { ...actual, t: actual.t };
});

/** Stub minimal 2d ctx + capture API (jsdom tak punya canvas nyata). */
function stubCanvas() {
  const ctx2d = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  // jsdom belum punya method ini di prototype — definisikan dulu baru spy.
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  for (const [name, impl] of [
    ['setPointerCapture', () => {}],
    ['toDataURL', () => 'data:image/png;base64,QUFB'],
  ] as const) {
    if (typeof proto[name] !== 'function') {
      Object.defineProperty(proto, name, { value: impl, writable: true, configurable: true });
    }
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx2d);
  vi.spyOn(HTMLCanvasElement.prototype, 'setPointerCapture').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QUFB');
}

const base = {
  isOpen: true,
  onClose: vi.fn(),
  wa: '6281111111111',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ success: true }) }),
  );
});

describe('allowedTahapanEsign — A07 parity (regex legacy bukaModalTtd)', () => {
  it('allows tahapan from Lolos onward (LOLOS/PEMBERKASAN/NAITEI/…)', () => {
    for (const ok of ['LOLOS', 'PEMBERKASAN', 'MCU', 'PARPOR', 'MATCHING', 'NAITEI', 'SIAP BERANGKAT']) {
      expect(allowedTahapanEsign(ok)).toBe(true);
    }
  });

  it('blocks early tahapan (BARU/LIST/PROSES/REGISTER)', () => {
    for (const no of ['BARU', 'LIST', 'PROSES', 'REGISTER', 'DOKUMEN']) {
      expect(allowedTahapanEsign(no)).toBe(false);
    }
  });

  it('is null/undefined-safe', () => {
    expect(allowedTahapanEsign(undefined)).toBe(false);
    expect(allowedTahapanEsign(null)).toBe(false);
    expect(allowedTahapanEsign('')).toBe(false);
  });
});

describe('EsignNaiteiModal — A07 parity (modal-ttd legacy)', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<EsignNaiteiModal {...base} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the 4 signature areas (2 pihak × TTD + Nama) + submit', () => {
    render(<EsignNaiteiModal {...base} />);
    expect(screen.getByText(t('ui.esign_docs'))).toBeTruthy();
    expect(screen.getByText(t('ui.party1'))).toBeTruthy();
    expect(screen.getByText(t('ui.party2'))).toBeTruthy();
    for (const key of [t('ui.sign1'), t('ui.name1'), t('ui.sign2'), t('ui.name2')]) {
      expect(screen.getByText(t(key))).toBeTruthy();
    }
    // 4 tombol "gambar" + 1 simpan semua.
    expect(screen.getAllByText(t('ui.start_draw'))).toHaveLength(4);
    expect(screen.getByText(t('ui.save_all_docs'))).toBeTruthy();
  });

  it('blocks submit when no area was drawn (toast, no fetch)', () => {
    render(<EsignNaiteiModal {...base} />);
    fireEvent.click(screen.getByText(t('ui.save_all_docs')));
    expect(showToast).toHaveBeenCalledWith(t('ui.toast_sign_area_required'), 'error');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('draw flow: open full-screen canvas → save empty blocked → save stroke → submit sends simpanDataTtdNaitei payload', async () => {
    stubCanvas();
    const onClose = vi.fn();
    render(<EsignNaiteiModal {...base} onClose={onClose} />);

    // Buka area TTD Pihak 1 → layar gambar penuh (canvas + eraser + save).
    fireEvent.click(screen.getAllByText(t('ui.start_draw'))[0]);
    const canvas = document.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(screen.getByText(t('ui.draw_hint'))).toBeTruthy();

    // Save tanpa coretan → error area kosong.
    fireEvent.click(screen.getByText(t('esign.save')));
    expect(showToast).toHaveBeenCalledWith(t('ui.toast_area_empty'), 'error');

    // Simulasikan coretan (pointerdown/move/up) lalu save → kembali ke list dgn pratinjau.
    fireEvent.pointerDown(canvas!, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(canvas!, { clientX: 80, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(canvas!, { pointerId: 1 });
    fireEvent.click(screen.getByText(t('esign.save')));
    await waitFor(() => expect(document.querySelector(`img[alt="${t('ui.alt_pratinjau')}"]`)).not.toBeNull());

    // Submit → payload kontrak legacy.
    fireEvent.click(screen.getByText(t('ui.save_all_docs')));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/.netlify/functions/simpanDataTtdNaitei');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe('simpanDataTtdNaitei');
    expect(body.sessionToken).toBe('test-token');
    expect(body.args[0].wa).toBe('6281111111111');
    expect(body.args[0].ttd1).toContain('data:image/png;base64');
    expect(body.args[0].nama1).toBe('');
    expect(showToast).toHaveBeenCalledWith(t('ui.toast_saved_server'), 'success');
    expect(onClose).toHaveBeenCalled();
  });

  it('submit without wa target is blocked (toast, no fetch)', () => {
    render(<EsignNaiteiModal {...base} wa="" />);
    fireEvent.click(screen.getByText(t('ui.save_all_docs')));
    expect(showToast).toHaveBeenCalledWith(t('ui.toast_target_invalid'), 'error');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
