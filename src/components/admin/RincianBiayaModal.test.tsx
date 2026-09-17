// ==========================================
// TESTS: RincianBiayaModal (A12 parity, 2026-09-05)
//
// Legacy ground truth: partials/modals-shared.html #modal-rincian-builder +
// js/13_rincian_builder.ts (openRincianBuilder/rbSerialize/rbSeedFromText/
// rbSavePreset/rbUnsavePreset). The Astro add-job tab rendered "Buka Editor
// Rincian" as a DEAD button and never sent rincian_biaya; the edit-job modal
// had no total/rincian fields. Root bugs pinned here:
//   - serialize/parse are round-trip stable in the exact text format the
//     public job-detail popup (LokerDetailModal.parseRincianBiaya) reads
//   - modal seeds from existing text + default tahapan rows
//   - preset collection loaded via api.secure(getRincianPresets), favorites
//     saved/removed via save/deleteRincianPreset
//   - apply returns total + serialized rincian text
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RincianBiayaModal, {
  rincianSerialize,
  parseRincianState,
  rincianSummary,
  fmtNominal,
  DEFAULT_TAHAPAN_ROWS,
  RB_SECS,
  type RincianState,
} from './RincianBiayaModal';
import { showToast } from '../Toast';

const { mockSecure } = vi.hoisted(() => ({ mockSecure: vi.fn() }));

vi.mock('../Toast', () => ({ showToast: vi.fn() }));

vi.mock('../../lib/apiClient', () => ({
  api: { secure: (...args: unknown[]) => mockSecure(...args) },
}));

const st = (): RincianState => ({
  total: '25 JT',
  rows: [
    { nama: 'TTD KONTRAK', nominal: '6 jt' },
    { nama: 'COE (CERTIFICATE OF ELIGIBILITY) TERBIT', nominal: '' },
  ],
  sel: { include: ['TIKET PESAWAT', 'VISA (SUBSIDI 1JT)'], exclude: [], benefit: [], persyaratan: [] },
  catatan: 'REFUND BILA KAISHA BATAL.',
});

describe('RincianBiayaModal pure helpers (A12)', () => {
  it('rincianSerialize outputs the legacy text format', () => {
    const text = rincianSerialize(st());
    expect(text).toContain('TOTAL BIAYA: 25 JT');
    expect(text).toContain('TAHAPAN PEMBAYARAN');
    expect(text).toContain('1. TTD KONTRAK : 6 jt');
    expect(text).toContain('2. COE (CERTIFICATE OF ELIGIBILITY) TERBIT');
    expect(text).toContain('INCLUDE');
    expect(text).toContain('• TIKET PESAWAT');
    expect(text).toContain('CATATAN');
    expect(text).toContain('REFUND BILA KAISHA BATAL.');
    expect(text).not.toContain('\n\n\n');
  });

  it('parse → serialize round-trip keeps total/rows/sel/catatan', () => {
    const orig = st();
    const parsed = parseRincianState(rincianSerialize(orig));
    expect(parsed.total).toBe('25 JT');
    expect(parsed.rows).toEqual(orig.rows);
    expect(parsed.sel.include).toEqual(['TIKET PESAWAT', 'VISA (SUBSIDI 1JT)']);
    expect(parsed.catatan).toBe('REFUND BILA KAISHA BATAL.');
    expect(rincianSerialize(parsed)).toBe(rincianSerialize(orig));
  });

  it('fmtNominal strips non-digits and formats thousands', () => {
    expect(fmtNominal('6000000')).toBe('6.000.000');
    expect(fmtNominal('abc123')).toBe('123');
    expect(fmtNominal('0')).toBe('');
  });

  it('rincianSummary counts sections (legacy rbSummaryHtml parity)', () => {
    const s = rincianSummary(st());
    expect(s).toContain('✅');
    expect(s).toContain('Total 25 JT');
    expect(s).toContain('2 tahapan');
    expect(s).toContain('Include 2');
    expect(rincianSummary(parseRincianState(''))).toContain('Klik untuk isi rincian biaya');
  });
});

describe('RincianBiayaModal (A12)', () => {
  beforeEach(() => {
    mockSecure.mockReset();
    mockSecure.mockResolvedValue({ success: true });
    vi.mocked(showToast).mockReset();
  });

  afterEach(() => cleanup());

  it('renders null when closed', () => {
    const { container } = render(
      <RincianBiayaModal open={false} onApply={() => {}} onClose={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('loads DB presets via getRincianPresets + seeds default tahapan rows', async () => {
    mockSecure.mockResolvedValueOnce({
      success: true,
      presets: { include: [{ id: '1', item: 'TIKET PESAWAT' }], exclude: [], benefit: [], persyaratan: [] },
    });
    render(<RincianBiayaModal open initialTotal="25 JT" initialRincian="" onApply={() => {}} onClose={() => {}} />);
    await waitFor(() =>
      expect(mockSecure).toHaveBeenCalledWith('getRincianPresets', []),
    );
    await waitFor(() => expect(screen.getByText('TIKET PESAWAT')).toBeTruthy());
    // Default permanent tahapan rows (TTD KONTRAK + COE) auto-seeded.
    const nameInputs = Array.from(
      document.querySelectorAll('input'),
    ).filter((i) => (i as HTMLInputElement).value === 'TTD KONTRAK');
    expect(nameInputs.length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('25 JT')).toBeTruthy();
  });

  it('seed dari rincian teks: rows + selected chips + catatan dipulihkan', async () => {
    const seed =
      'TOTAL BIAYA: 30 JT\n\nTAHAPAN PEMBAYARAN\n1. TTD KONTRAK : 10 jt\n\nINCLUDE\n• TIKET PESAWAT\n\nCATATAN\nBEBAS DICICIL';
    mockSecure.mockResolvedValueOnce({ success: true, presets: {} });
    render(
      <RincianBiayaModal open initialTotal="" initialRincian={seed} onApply={() => {}} onClose={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText('TIKET PESAWAT')).toBeTruthy());
    // TTD KONTRAK tahapan restored with its nominal.
    const rowInput = Array.from(document.querySelectorAll('input')).find(
      (i) => (i as HTMLInputElement).value === 'TTD KONTRAK',
    );
    expect(rowInput).toBeTruthy();
    expect(screen.getByDisplayValue('BEBAS DICICIL')).toBeTruthy();
  });

  it('favorite save/delete memanggil save/deleteRincianPreset + update star', async () => {
    mockSecure
      .mockResolvedValueOnce({
        success: true,
        presets: { include: [], exclude: [], benefit: [], persyaratan: [] },
      })
      .mockResolvedValueOnce({ success: true, id: 9 })
      .mockResolvedValueOnce({ success: true });
    render(<RincianBiayaModal open initialRincian="" onApply={() => {}} onClose={() => {}} />);
    // Fallback default presets shown after empty collection.
    await waitFor(() => expect(screen.getByText('TIKET PESAWAT')).toBeTruthy());
    const chip = screen.getByText('TIKET PESAWAT').closest('button') as HTMLButtonElement;
    expect(chip.textContent).toContain('☆');
    const star = chip.querySelector('span') as HTMLSpanElement;
    fireEvent.click(star);
    await waitFor(() =>
      expect(mockSecure).toHaveBeenCalledWith('saveRincianPreset', [
        { kategori: 'include', item: 'TIKET PESAWAT' },
      ]),
    );
    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('TIKET PESAWAT').closest('button')?.textContent).toContain('★'));
    // Remove favorite → deleteRincianPreset with the id.
    const star2 = (screen.getByText('TIKET PESAWAT').closest('button') as HTMLButtonElement).querySelector('span') as HTMLSpanElement;
    fireEvent.click(star2);
    await waitFor(() =>
      expect(mockSecure).toHaveBeenCalledWith('deleteRincianPreset', [{ id: '9' }]),
    );
  });

  it('custom item + chip on → preview & apply serialize termasuk item', async () => {
    const apply = vi.fn();
    mockSecure.mockResolvedValueOnce({
      success: true,
      presets: { include: [{ id: '1', item: 'TIKET PESAWAT' }], exclude: [], benefit: [], persyaratan: [] },
    });
    render(<RincianBiayaModal open initialRincian="" onApply={apply} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('TIKET PESAWAT')).toBeTruthy());
    // Turn the preset chip on.
    fireEvent.click(screen.getByText('TIKET PESAWAT').closest('button') as HTMLButtonElement);
    // Add custom include item.
    const custom = screen.getAllByPlaceholderText('Item custom…')[0];
    fireEvent.input(custom, { target: { value: 'ASURANSI' } });
    const plus = (custom.parentElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    fireEvent.click(plus);
    await waitFor(() => expect(screen.getByText('ASURANSI')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /SIMPAN RINCIAN/ }));
    expect(apply).toHaveBeenCalledTimes(1);
    const [total, rincian] = apply.mock.calls[0] as [string, string];
    expect(rincian).toContain('INCLUDE');
    expect(rincian).toContain('• TIKET PESAWAT');
    expect(rincian).toContain('• ASURANSI');
    expect(typeof total).toBe('string');
  });

  it('initialTotal alone (tanpa rincian) tersimpan sebagai TOTAL BIAYA', async () => {
    const apply = vi.fn();
    mockSecure.mockResolvedValueOnce({ success: true, presets: {} });
    render(<RincianBiayaModal open initialTotal="25 JT" initialRincian="" onApply={apply} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByDisplayValue('25 JT')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /SIMPAN RINCIAN/ }));
    const [, rincian] = apply.mock.calls[0] as [string, string];
    expect(rincian).toContain('TOTAL BIAYA: 25 JT');
    expect(DEFAULT_TAHAPAN_ROWS.length).toBe(2);
  });
});

// ==========================================
// Label/control wiring (2026-09-16)
//
// noLabelWithoutControl only sees a <label> that names no control. It is
// structurally blind to a control that has NO <label> at all — and this file
// had two such groups (the payment-stage row inputs, the per-section custom
// input) hidden behind <label> elements that were really headings. So these
// assertions go through the artefact: resolve for= to the real element, drive
// it, and check what lands in the serialized output.
// ==========================================
describe('RincianBiayaModal — label/control wiring', () => {
  beforeEach(() => {
    mockSecure.mockReset();
    mockSecure.mockResolvedValue({ success: true, presets: {} });
    vi.mocked(showToast).mockReset();
  });
  afterEach(() => cleanup());

  const labelFor = (text: string) => {
    const el = [...document.querySelectorAll('label')].find((l) =>
      (l.textContent || '').includes(text),
    );
    expect(el, `no <label> containing ${text}`).toBeTruthy();
    return el?.getAttribute('for');
  };

  it('the total-cost label names the input that actually feeds `total`', async () => {
    const apply = vi.fn();
    render(
      <RincianBiayaModal open initialTotal="25 JT" initialRincian="" onApply={apply} onClose={() => {}} />,
    );
    await waitFor(() => expect(screen.getByDisplayValue('25 JT')).toBeTruthy());

    const forId = labelFor('TOTAL BIAYA JOB');
    expect(forId).toBe('rb-total');
    const el = document.getElementById(forId as string) as HTMLInputElement | null;
    expect(el?.tagName).toBe('INPUT');
    // Identity, not shape: the resolved element carries the seeded total...
    expect(el?.value).toBe('25 JT');
    // ...and driving it moves the serialized TOTAL BIAYA, so it really is the
    // control behind `total` and not merely an input with a matching id.
    fireEvent.input(el as HTMLInputElement, { target: { value: '99 JT' } });
    fireEvent.click(screen.getByRole('button', { name: /SIMPAN RINCIAN/ }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][1]).toContain('TOTAL BIAYA: 99 JT');
  });

  it('the note label names the textarea that actually feeds `catatan`', async () => {
    const apply = vi.fn();
    render(<RincianBiayaModal open initialRincian="" onApply={apply} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('TIKET PESAWAT')).toBeTruthy());

    const forId = labelFor('Catatan');
    expect(forId).toBe('rb-note');
    const el = document.getElementById(forId as string) as HTMLTextAreaElement | null;
    expect(el?.tagName).toBe('TEXTAREA');
    fireEvent.input(el as HTMLTextAreaElement, { target: { value: 'CATATAN UJI' } });
    fireEvent.click(screen.getByRole('button', { name: /SIMPAN RINCIAN/ }));
    expect(apply.mock.calls[0][1]).toContain('CATATAN UJI');
  });

  it('payment-stage / preview / section titles are headings, not <label>s', async () => {
    render(<RincianBiayaModal open initialRincian="" onApply={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('TIKET PESAWAT')).toBeTruthy());

    // Anti-vacuity: the text must still be on screen, just not as a <label>.
    // Without this, deleting the heading would satisfy "is not a label".
    expect(screen.getByText('Tahap Pembayaran')).toBeTruthy();
    expect(screen.getByText(/PRATINJAU/)).toBeTruthy();
    expect(screen.getByText('Termasuk')).toBeTruthy();

    const labelTexts = [...document.querySelectorAll('label')].map((l) => l.textContent || '');
    for (const heading of ['Tahap Pembayaran', 'PRATINJAU', 'Termasuk']) {
      expect(
        labelTexts.some((x) => x.includes(heading)),
        `${heading} must not be a <label>`,
      ).toBe(false);
    }
    // Only the two genuine label/control pairs survive.
    expect(labelTexts.length).toBe(2);
  });

  it('every payment-stage row input has its own name, bound to its own field', async () => {
    const apply = vi.fn();
    render(<RincianBiayaModal open initialRincian="" onApply={apply} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('TIKET PESAWAT')).toBeTruthy());

    const rows = DEFAULT_TAHAPAN_ROWS.length;
    const named = [...document.querySelectorAll('input')]
      .map((i) => i.getAttribute('aria-label'))
      .filter((n): n is string => !!n && /tahapan \d+$/.test(n));

    // Two controls per row: name + amount.
    expect(named.length).toBe(rows * 2);
    // All distinct. Giving both controls in a row the same name collapses this
    // to `rows`, and swapping two names keeps it at `rows * 2` — which is why
    // the identity check below is the one that carries the weight.
    expect(new Set(named).size).toBe(rows * 2);

    // Identity: the element named for row 1's name is the control that feeds
    // step 1's nama, and the one named for row 1's amount feeds its nominal.
    const name1 = document.querySelector('input[aria-label="Nama tahapan 1"]') as HTMLInputElement | null;
    const amt1 = document.querySelector('input[aria-label="Nominal tahapan 1"]') as HTMLInputElement | null;
    expect(name1).toBeTruthy();
    expect(amt1).toBeTruthy();
    expect(name1).not.toBe(amt1);
    fireEvent.input(name1 as HTMLInputElement, { target: { value: 'TAHAP SATU' } });
    // The nominal input runs fmtNominal on input, so the digits are re-grouped:
    // '7000' -> '7.000'. Asserting the grouped form keeps this unambiguous.
    fireEvent.input(amt1 as HTMLInputElement, { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: /SIMPAN RINCIAN/ }));
    expect(apply.mock.calls[0][1]).toContain('1. TAHAP SATU : 7.000');
  });

  it('each section custom-item input is named after its own section', async () => {
    const apply = vi.fn();
    render(<RincianBiayaModal open initialRincian="" onApply={apply} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('TIKET PESAWAT')).toBeTruthy());

    const customs = [...document.querySelectorAll('input')]
      .map((i) => i.getAttribute('aria-label'))
      .filter((n): n is string => !!n && n.includes('Item custom'));
    expect(customs.length).toBe(RB_SECS.length);
    expect(new Set(customs).size).toBe(RB_SECS.length);
    // Prefix match, so "Tidak Termasuk:" cannot satisfy a search for "Termasuk:".
    expect(customs.filter((n) => n.startsWith('Termasuk:')).length).toBe(1);

    // Identity: the input named for the first section is the one whose "+"
    // button adds to that section.
    const inc = document.querySelector('input[aria-label^="Termasuk:"]') as HTMLInputElement | null;
    expect(inc).toBeTruthy();
    expect(inc?.placeholder).toBe('Item custom…');
    fireEvent.input(inc as HTMLInputElement, { target: { value: 'ASURANSI UJI' } });
    const plus = inc?.parentElement?.querySelector('button') as HTMLButtonElement | null;
    expect(plus).toBeTruthy();
    fireEvent.click(plus as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: /SIMPAN RINCIAN/ }));
    expect(apply.mock.calls[0][1]).toContain('• ASURANSI UJI');
  });
});
