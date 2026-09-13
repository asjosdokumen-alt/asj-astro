// ==========================================
// TESTS: RejectMailModal (#12, 2026-09-13)
//
// Legacy ground truth:
//   partials/modals-shared.html → #modal-reject-mail
//   js/api/forms.ts:110 prosesRejectForm(id)   → clear #reject-reason-text, show modal
//   js/api/forms.ts:117 submitRejectForm()     → callAPI('rejectForm', [id, adminName, reason])
//
// The defect this locks down: the Astro repo used to reject with
// `window.confirm(...)` and a HARD-CODED reason 'Lamaran GAGAL', so the admin's
// real reason never reached the candidate — even though the backend already
// accepts argument 3 as the candidate-visible reason
// (`contexts/applications/service.ts:194-198`) and the legacy UI promised the
// text "akan muncul di Dashboard Kandidat".
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RejectMailModal from './RejectMailModal';

vi.mock('../../store/i18n', () => ({ t: (k: string) => k }));

const t = (k: string) => k;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('RejectMailModal (#12)', () => {
  it('renders the legacy title, hint and confirm button', () => {
    render(<RejectMailModal onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(t('ui.reject_app'))).toBeTruthy();
    expect(screen.getByText(t('ui.reject_reason_hint'))).toBeTruthy();
    expect(screen.getByText(t('ui.set_fail'))).toBeTruthy();
    expect(screen.getByText(t('button.cancel'))).toBeTruthy();
  });

  it('shows the candidate name so the admin can verify the row', () => {
    render(<RejectMailModal candidateName="SUZUKI HANAKO" onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/SUZUKI HANAKO/)).toBeTruthy();
  });

  it('passes the TYPED reason to onConfirm — not a hard-coded string', async () => {
    const onConfirm = vi.fn();
    render(<RejectMailModal onCancel={() => {}} onConfirm={onConfirm} />);

    const box = screen.getByPlaceholderText(t('ui.reject_reason_ph')) as HTMLTextAreaElement;
    fireEvent.input(box, { target: { value: 'Dokumen KTP tidak terbaca.' } });
    fireEvent.click(screen.getByText(t('ui.set_fail')));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith('Dokumen KTP tidak terbaca.');
    // The old behaviour sent a constant; guard against a regression to it.
    expect(onConfirm).not.toHaveBeenCalledWith('Lamaran GAGAL');
  });

  it('trims surrounding whitespace only — never rewrites the text', async () => {
    const onConfirm = vi.fn();
    render(<RejectMailModal onCancel={() => {}} onConfirm={onConfirm} />);
    const box = screen.getByPlaceholderText(t('ui.reject_reason_ph'));
    fireEvent.input(box, { target: { value: '   alasan asli   ' } });
    fireEvent.click(screen.getByText(t('ui.set_fail')));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('alasan asli'));
  });

  it('sends an EMPTY string when the admin writes nothing', async () => {
    // '' is deliberate: the backend substitutes its own 'Lamaran ditolak'
    // fallback. Sending a made-up reason here would be worse than sending none.
    const onConfirm = vi.fn();
    render(<RejectMailModal onCancel={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText(t('ui.set_fail')));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(''));
  });

  it('fires onCancel from both the × and the cancel button, never onConfirm', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(<RejectMailModal onCancel={onCancel} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText(t('button.cancel')));
    expect(onCancel).toHaveBeenCalledTimes(1);

    const close = container.querySelector('button[aria-label="' + t('public.close') + '"]');
    expect(close).toBeTruthy();
    fireEvent.click(close as Element);
    expect(onCancel).toHaveBeenCalledTimes(2);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not submit twice while the first submit is still in flight', async () => {
    // A slow backend + an impatient double-click must not file two rejections.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const onConfirm = vi.fn(() => gate);
    render(<RejectMailModal onCancel={() => {}} onConfirm={onConfirm} />);

    const btn = screen.getByText(t('ui.set_fail')).closest('button') as HTMLButtonElement;
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    release();
  });

  it('re-enables the button after a failure so the admin can retry', async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error('network')));
    render(<RejectMailModal onCancel={() => {}} onConfirm={onConfirm} />);
    const btn = screen.getByText(t('ui.set_fail')).closest('button') as HTMLButtonElement;

    fireEvent.click(btn);
    await waitFor(() => expect(btn.disabled).toBe(false));
  });
});
