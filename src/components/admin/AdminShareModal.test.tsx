// ==========================================
// TESTS: AdminShareModal (A15 parity, 2026-09-05; B06 revised 2026-09-13)
//
// Legacy ground truth: partials/modals-shared.html #modal-share-loker +
// js/render/share.ts (renderShareCheckboxes / simpanDokumenShare /
// templateShareWa / copyShareLink / copasShareWa). Root bugs covered:
//   - doc selection never loaded the job's saved `dokumenShare` nor saved it
//     (4 hard-coded checkboxes, no api.secure('updateDokumenShare') call)
//   - share link pointed at /share?job= while ShareView read ?code
//   - WA copy used a throwaway message instead of the legacy template
//   - hard-coded copy / non-existent toast.* keys
//
// 2026-09-13: the per-job share token gate was removed. The viewer is public by
// job code, exactly as legacy, so the link is `share?job=CODE` with no `&tk=`
// and the modal no longer calls getShareTokenForJob on open.
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminShareModal, { parseDocsShare, shareDocLabelKey, shareWaTemplate, SHARE_DOC_CHIPS } from './AdminShareModal';
import { showToast } from '../Toast';

const { mockSecure } = vi.hoisted(() => ({ mockSecure: vi.fn() }));

vi.mock('../Toast', () => ({ showToast: vi.fn() }));

vi.mock('../../lib/apiClient', () => {
  const api = { secure: (...args: unknown[]) => mockSecure(...args), get: vi.fn() };
  return { api, default: api };
});

vi.mock('../../store/i18n', () => ({ t: (k: string) => k }));

const JOB = {
  code: 'TG658', pekerjaan: 'Perawat', tsk: 'TSK-A',
  dokumenShare: 'CV,JFT,SSW,KTP,ALL',
};

describe('AdminShareModal pure helpers (A15)', () => {
  it('parseDocsShare splits on comma/semicolon, uppercase, keeps SIM A whole', () => {
    const s = parseDocsShare('cv, jft ; sim A, ALL');
    expect([...s]).toEqual(['CV', 'JFT', 'SIM A', 'ALL']);
    expect([...parseDocsShare(undefined)]).toEqual(['CV', 'JFT', 'SSW']);
    expect([...parseDocsShare('')]).toEqual(['CV', 'JFT', 'SSW']);
  });
  it('shareDocLabelKey maps chips; unknown → null (renders raw)', () => {
    expect(shareDocLabelKey('CV')).toBe('ui.share_doc_cv');
    expect(shareDocLabelKey('IJAZAH SMA')).toBe('admin.doc_ijazah_sma');
    expect(shareDocLabelKey('SIM A')).toBe('ui.share_doc_sim_a');
    expect(shareDocLabelKey('NOSUCH')).toBeNull();
  });
  it('SHARE_DOC_CHIPS matches legacy list incl. ALL last', () => {
    expect(SHARE_DOC_CHIPS).toEqual([
      'CV', 'JFT', 'SSW', 'SIM A', 'KTP', 'KK', 'AKTE', 'IJAZAH',
      'IJAZAH SD', 'IJAZAH SMP', 'IJAZAH SMA', 'UNIVERSITAS', 'ALL',
    ]);
  });
  it('shareWaTemplate builds the legacy お疲れ様です message with job + link', () => {
    const tpl = shareWaTemplate('TG658', 'Perawat', 'https://x/share?job=TG658');
    expect(tpl).toContain('お疲れ様です');
    expect(tpl).toContain('TG658 - PERAWAT');
    expect(tpl).toContain('https://x/share?job=TG658');
    expect(tpl).toContain('KAMI APLOD /UPDATE DI SINI');
  });
});

describe('AdminShareModal (A15/B06)', () => {
  beforeEach(() => {
    mockSecure.mockReset();
    mockSecure.mockImplementation(async () => ({ success: true }));
    vi.mocked(showToast).mockReset();
  });

  it('does NOT ask for a share token on open — the viewer is public by code', async () => {
    render(<AdminShareModal job={JOB as never} onClose={vi.fn()} />);
    // The link is ready immediately; nothing has to be minted first.
    const link = document.querySelector('input[readonly]') as HTMLInputElement;
    expect(link.value).toContain('/share?job=TG658');
    expect(mockSecure).not.toHaveBeenCalledWith('getShareTokenForJob', expect.anything());
  });
  afterEach(() => cleanup());

  it('pre-checks chips from job.dokumenShare (not hard-coded CV/JFT/SSW)', () => {
    render(<AdminShareModal job={JOB as never} onClose={vi.fn()} />);
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type=checkbox]'));
    const checked = boxes.filter((b) => b.checked).map((b) => (b.parentElement?.textContent || '').trim());
    // KTP + ALL are part of the saved config and must come pre-checked.
    // (Labels go through t(), mocked as identity → key text.)
    expect(checked).toContain('ui.share_doc_ktp');
    expect(checked).toContain('ui.share_doc_all');
    expect(checked.length).toBe(5); // CV, JFT, SSW, KTP, ALL
  });

  it('legacy copy via t(): title, link label, doc label, WA copas', async () => {
    render(<AdminShareModal job={JOB as never} onClose={vi.fn()} />);
    expect(screen.getByText('ui.share_modal_title')).toBeTruthy();
    expect(screen.getByText('ui.share_link_view')).toBeTruthy();
    expect(screen.getByText('ui.share_card_title')).toBeTruthy();
    expect(screen.getByText('ui.save_share')).toBeTruthy();
    expect(screen.getByText('ui.share_copas_wa')).toBeTruthy();
    expect(screen.getByText('ui.share_open_view')).toBeTruthy();
    expect(screen.getByText('ui.share_card_hint')).toBeTruthy();
    // WA preview carries the plain ?job= link — no token to wait for.
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toContain('TG658 - PERAWAT');
    expect(ta.value).toContain('/share?job=TG658');
    expect(ta.value).not.toContain('tk=');
  });

  it('toggle unchecks a chip', () => {
    render(<AdminShareModal job={{ code: 'X1', pekerjaan: 'P', dokumenShare: 'CV,JFT' } as never} onClose={vi.fn()} />);
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type=checkbox]'));
    const cv = boxes.find((b) => (b.parentElement?.textContent || '').includes('ui.share_doc_cv'))!;
    expect(cv.checked).toBe(true);
    fireEvent.click(cv);
    expect(cv.checked).toBe(false);
  });

  it('save → api.secure(updateDokumenShare) with joined saved docs + close + toast', async () => {
    const onClose = vi.fn();
    render(<AdminShareModal job={{ code: 'X2', pekerjaan: 'P', dokumenShare: 'CV,JFT,ALL' } as never} onClose={onClose} />);
    fireEvent.click(screen.getByText('ui.save_share'));
    await waitFor(() =>
      expect(mockSecure).toHaveBeenCalledWith('updateDokumenShare', ['X2', 'CV,JFT,ALL']),
    );
    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalledWith('ui.toast_share_saved', 'success'));
    expect(onClose).toHaveBeenCalled();
  });

  it('save failure → alert.failed toast with real error, no close', async () => {
    mockSecure.mockImplementation(async () => ({ success: false, error: 'X gagal' }));
    const onClose = vi.fn();
    render(<AdminShareModal job={JOB as never} onClose={onClose} />);
    fireEvent.click(screen.getByText('ui.save_share'));
    await waitFor(() =>
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('alert.failed X gagal', 'error'),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('share link input is share?job=CODE with no token (B06 removed)', () => {
    render(<AdminShareModal job={JOB as never} onClose={vi.fn()} />);
    const link = document.querySelector('input[readonly]') as HTMLInputElement;
    expect(link.value).toContain('/share?job=TG658');
    expect(link.value).not.toContain('tk=');
    // open-view anchor carries the same plain link
    const open = document.querySelector('a[href*="share?job=TG658"]') as HTMLAnchorElement | null;
    expect(open?.href).toContain('share?job=TG658');
    expect(open?.href).not.toContain('tk=');
  });

  it('custom docs not in the fixed list still render (saved legacy values)', () => {
    render(<AdminShareModal job={{ code: 'X3', pekerjaan: 'P', dokumenShare: 'CV,IJAZAH SMP,SIM A' } as never} onClose={vi.fn()} />);
    expect(screen.getByText('admin.doc_ijazah_smp')).toBeTruthy();
  });
});
