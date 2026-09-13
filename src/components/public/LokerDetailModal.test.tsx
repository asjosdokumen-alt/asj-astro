// ==========================================
// TESTS: LokerDetailModal (B04 parity, 2026-09-05)
//
// Legacy ground truth: js/01_public.ts bukaDetailLoker() + render/public.ts.
// Root bugs pinned here:
//   - jobTutupUntukLamar dropped LIST-CHECK/PENCARIAN/PENDAFTARAN/DAFTAR
//     from the still-open set → jobs in tahapan PENCARIAN/DAFTAR showed a
//     DISABLED "Lamar" button (legacy keeps them open). Canonical rule in
//     src/lib/jobPhase.ts.
//   - Pamflet was a static <img>; legacy opens bukaPamflet (zoom modal) on
//     click with a ui.click_zoom title — same as the list rows. Now wired.
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';
import LokerDetailModal from './LokerDetailModal';
import { t } from '../../store/i18n';

afterEach(cleanup);

// Real dictionary, not an identity stub. This test queries img[alt="Pamflet"],
// which only resolves while the id dictionary is actually consulted — with
// `t: k => k` the alt becomes the raw key and the query silently matches nothing.
vi.mock('../../store/i18n', async () => {
  const actual = await vi.importActual<typeof import('../../store/i18n')>('../../store/i18n');
  return { ...actual, t: actual.t };
});

function baseJob(over: Record<string, string> = {}) {
  return {
    code: 'J1',
    pekerjaan: 'Teknisi Mesin',
    status: 'OPEN',
    tahapan: 'LIST',
    keterangan: 'Keterangan uji',
    kategori: 'Manufacturing',
    kuota: '5',
    gender: 'PRIA',
    lokasi: 'Osaka',
    syarat: 'Sehat, Jujur',
    rincianBiaya:
      'TOTAL BIAYA: Rp 50.000.000\nTAHAPAN PEMBAYARAN\n1. Pendaftaran: Rp 5.000.000\nINCLUDE\nTiket\nBENEFIT\nGaji',
    totalBiaya: '',
    ...over,
  };
}

describe('LokerDetailModal (B04)', () => {
  it('renders keyed chrome + rincian biaya for an open job', () => {
    const onClose = vi.fn();
    render(<LokerDetailModal job={baseJob()} onClose={onClose} />);
    expect(screen.getAllByText('J1').length).toBeGreaterThan(0);
    expect(screen.getByText('Teknisi Mesin')).toBeTruthy();
    expect(screen.getByText(t('ui.payment_stage'))).toBeTruthy();
    expect(screen.getByText('Rp 50.000.000')).toBeTruthy();
    // The CTA copy must come from the dictionary, not a JSX literal.
    //
    // This used to be `queryByText('Lamar Sekarang') === null`, which only
    // held while t() echoed raw keys: "Lamar Sekarang" IS the id value of
    // button.apply_now, so with the real dictionary loaded the assertion fails
    // against perfectly correct code. Asserting the dictionary value instead
    // keeps the check meaningful. "Is it keyed at all?" is what
    // src/store/i18n.keys.test.ts answers, so it is not re-tested here.
    expect(screen.getByText(t('button.apply_now'))).toBeTruthy();
  });

  it('links a still-recruiting job (tahapan PENCARIAN) to the native apply page', () => {
    render(<LokerDetailModal job={baseJob({ tahapan: 'PENCARIAN' })} onClose={vi.fn()} />);
    const link = document.querySelector('a[href="/apply?job=J1"]');
    expect(link).toBeTruthy();
    expect(document.querySelector('button[disabled]')).toBeNull();
  });

  it('links an open job (tahapan DAFTAR) — the modal used to disable this phase', () => {
    render(<LokerDetailModal job={baseJob({ tahapan: 'DAFTAR' })} onClose={vi.fn()} />);
    expect(document.querySelector('a[href="/apply?job=J1"]')).toBeTruthy();
  });

  it('disables Lamar once selection/documentation runs (tahapan FLIGHT)', () => {
    render(<LokerDetailModal job={baseJob({ tahapan: 'FLIGHT' })} onClose={vi.fn()} />);
    expect(document.querySelector('a[href="/apply?job=J1"]')).toBeNull();
    const disabled = document.querySelector('button[disabled]');
    expect(disabled).toBeTruthy();
    expect((disabled as HTMLElement).textContent).toContain(t('button.closed'));
  });

  it('opens the pamflet zoom modal on click (bukaPamflet parity, ui.click_zoom)', async () => {
    const pamflet = 'https://cdn.example/pamflet.jpg';
    render(<LokerDetailModal job={baseJob({ pamflet })} onClose={vi.fn()} />);
    const thumb = screen.getByAltText('Pamflet');
    expect((thumb as HTMLElement).getAttribute('title')).toBe(t('ui.click_zoom'));
    expect(document.querySelectorAll('img[alt="Pamflet"]').length).toBe(1);
    fireEvent.click(thumb);
    await waitFor(() => {
      expect(document.querySelectorAll('img[alt="Pamflet"]').length).toBe(2);
    });
    // close the zoom overlay again (aria now keyed — B05)
    fireEvent.click(screen.getByLabelText(t('public.close')));
    await waitFor(() => {
      expect(document.querySelectorAll('img[alt="Pamflet"]').length).toBe(1);
    });
  });

  it('calls onClose via the header close button', () => {
    const onClose = vi.fn();
    render(<LokerDetailModal job={baseJob()} onClose={onClose} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
