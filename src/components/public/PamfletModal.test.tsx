// ==========================================
// TESTS: PamfletModal (B05 parity, 2026-09-05)
//
// Legacy ground truth: js/08_wa_pintar.ts bukaPamflet(urlGambar) (guard
// `!url || url === '-'` → no-op) + tutupPamflet + the #pamfletModal shell
// whose close × carries aria-label localised via data-lang-aria="public.close"
// (index.html + `.modal-content-pamflet` CSS: contain, max-w 700px,
// max-h 90vh, radius 16px, shadow 0 0 40px black).
// Root bug pinned: the Astro close button hard-coded aria-label "Close"
// (English) — now t('public.close') ("Tutup"/locale).
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PamfletModal from './PamfletModal';

afterEach(cleanup);

vi.mock('../../store/i18n', () => ({
  t: (k: string) => k,
}));

const URL = 'https://cdn.example/pamflet-full.jpg';

describe('PamfletModal (B05)', () => {
  it('renders nothing when closed or without a usable url (legacy guard)', () => {
    const { container } = render(<PamfletModal isOpen={false} url={URL} onClose={vi.fn()} />);
    expect(container.querySelector('img')).toBeNull();
    const { container: c2 } = render(<PamfletModal isOpen={true} url="" onClose={vi.fn()} />);
    expect(c2.querySelector('img')).toBeNull();
    const { container: c3 } = render(<PamfletModal isOpen={true} url="-" onClose={vi.fn()} />);
    expect(c3.querySelector('img')).toBeNull();
  });

  it('shows the full image with legacy geometry and keyed close aria', () => {
    render(<PamfletModal isOpen={true} url={URL} onClose={vi.fn()} />);
    const img = screen.getByAltText('ui.alt_pamflet') as HTMLImageElement;
    expect(img.src).toBe(URL);
    expect(img.style.maxWidth).toBe('700px');
    expect(img.style.maxHeight).toBe('90vh');
    expect(img.style.objectFit).toBe('contain');
    // hard-coded English is gone — the label comes from the dict (key in tests)
    expect(screen.queryByLabelText('Close')).toBeNull();
    expect(screen.getByLabelText('public.close')).toBeTruthy();
  });

  it('names the dialog with the pamflet key (this overlay has no heading)', () => {
    // useOverlay normally names a dialog after its first heading. This overlay
    // is an image zoom with NO heading, so it is the one call site that must
    // pass `label` — otherwise the dialog renders with role + aria-modal and
    // no name at all. Pinned here because the e2e guard reaches it only when
    // the first job happens to carry a pamflet (§25).
    const { container } = render(<PamfletModal isOpen={true} url={URL} onClose={vi.fn()} />);
    const shell = container.firstChild as HTMLElement;
    expect(shell.getAttribute('role')).toBe('dialog');
    expect(shell.getAttribute('aria-modal')).toBe('true');
    expect(shell.getAttribute('aria-label')).toBe('ui.alt_pamflet');
    expect(shell.getAttribute('aria-labelledby')).toBeNull();
  });

  it('closes via the × button (tutupPamflet parity)', () => {
    const onClose = vi.fn();
    render(<PamfletModal isOpen={true} url={URL} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('public.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    const { container } = render(<PamfletModal isOpen={true} url={URL} onClose={onClose} />);
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fades the image in once loaded (no broken-opacity hang)', async () => {
    render(<PamfletModal isOpen={true} url={URL} onClose={vi.fn()} />);
    const img = screen.getByAltText('ui.alt_pamflet') as HTMLImageElement;
    expect(img.style.opacity).toBe('0');
    fireEvent.load(img);
    await waitFor(() => {
      expect((screen.getByAltText('ui.alt_pamflet') as HTMLImageElement).style.opacity).toBe('1');
    });
  });
});

describe('PamfletModal loading (no infinite spinner)', () => {
  it('stops spinning when the image errors (no dead onError path)', async () => {
    const { container } = render(<PamfletModal isOpen={true} url={URL} onClose={vi.fn()} />);
    const img = screen.getByAltText('ui.alt_pamflet') as HTMLImageElement;
    fireEvent.error(img);
    await waitFor(() => {
      expect((screen.getByAltText('ui.alt_pamflet') as HTMLImageElement).style.opacity).toBe('1');
    });
    expect(container.querySelector('[class*="animate-spin"]')).toBeNull();
  });

  it('shows a cached image without waiting for onLoad (complete reconcile)', async () => {
    const { rerender, container } = render(<PamfletModal isOpen={true} url={URL} onClose={vi.fn()} />);
    const img = screen.getByAltText('ui.alt_pamflet') as HTMLImageElement;
    // Simulate a fully-cached image that completed before Preact attached onLoad.
    Object.defineProperty(img, 'complete', { value: true, configurable: true });
    rerender(<PamfletModal isOpen={true} url={URL + '#cached'} onClose={vi.fn()} />);
    await waitFor(() => {
      expect((screen.getByAltText('ui.alt_pamflet') as HTMLImageElement).style.opacity).toBe('1');
    });
    expect(container.querySelector('[class*="animate-spin"]')).toBeNull();
  });
});
