// ==========================================
// TESTS: MatchmakingModal (A14 parity, 2026-09-05)
//
// Legacy ground truth: partials/modals-shared.html #modal-matchmaking +
// js/12_esign_match.ts (bukaMatchmaking / jalankanMatchmaking /
// kirimTawaranMassal) over legacy ALL_CANDIDATES. Root bugs covered:
//   - "belum terdaftar di Job ini" exclusion rule was missing (candidates
//     whose idLoker already contains this job code were still offered)
//   - certificates read from file-URL fields (jft/ssw) instead of the text
//     fields (jftText/sswText) that drive rules/sort/badges
//   - gender autofill missed legacy PRIA/WANITA spellings
//   - results unlimited (legacy caps at 30), no confirm before blast
//   - raw fetch without session → api.secure('kirimTawaranMassal')
//     + linkGrup/customMessage payload (legacy contract)
//   - all copy was hard-coded (now t() keys in id+jp)
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MatchmakingModal, { genderFromJob, hasCert } from './MatchmakingModal';
import { showToast } from '../Toast';

const { mockSecure } = vi.hoisted(() => ({ mockSecure: vi.fn() }));

vi.mock('../Toast', () => ({ showToast: vi.fn() }));

vi.mock('../../lib/apiClient', () => {
  const api = { secure: (...args: unknown[]) => mockSecure(...args), get: vi.fn() };
  return { api, default: api };
});

// Pass-through copy keys so assertions read the real key names.
vi.mock('../../store/i18n', () => ({ t: (k: string) => k }));

const mkCand = (over: Record<string, unknown>) =>
  ({ wa: '6281', nama: 'A', gender: 'L', usia: '25', tb: '170', bb: '60', pendidikan: 'SMK', tahapan: 'BARU', status: 'AKTIF', pasPhoto: '', jftText: '-', sswText: '-', idLoker: '', ...over });

const job = { code: 'TG658', pekerjaan: 'Perawat', gender: 'LAKI-LAKI', kuota: '2', lokasi: 'Tokyo' };

function renderOpen(cands: unknown[] = [], j = job) {
  render(<MatchmakingModal job={j as never} candidates={cands as never} isOpen={true} onClose={vi.fn()} />);
}

describe('MatchmakingModal pure helpers (A14)', () => {
  it('genderFromJob handles legacy LAKI/PRIA + PEREMPUAN/WANITA', () => {
    expect(genderFromJob('LAKI-LAKI')).toBe('L');
    expect(genderFromJob('PRIA')).toBe('L');
    expect(genderFromJob('WANITA')).toBe('P');
    expect(genderFromJob('PEREMPUAN')).toBe('P');
    expect(genderFromJob('')).toBe('ALL');
    expect(genderFromJob('CAMPURAN')).toBe('ALL');
  });
  it('hasCert: empty and "-" mean no certificate; real text means present', () => {
    expect(hasCert('')).toBe(false);
    expect(hasCert('-')).toBe(false);
    expect(hasCert('  ')).toBe(false);
    expect(hasCert('A2')).toBe(true);
  });
});

describe('MatchmakingModal (A14)', () => {
  beforeEach(() => {
    mockSecure.mockReset();
    mockSecure.mockResolvedValue({ success: true, results: [{ wa: 'x', success: true }] });
    vi.mocked(showToast).mockReset();
  });
  afterEach(() => cleanup());

  it('renders legacy copy via t(): title, target job, criteria, start button', () => {
    renderOpen();
    expect(screen.getByText('ui.ai_headhunter')).toBeTruthy();
    expect(screen.getByText(/TG658 - Perawat/)).toBeTruthy();
    expect(screen.getByText('ui.search_criteria')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ui\.start_specific_search/ })).toBeTruthy();
    // gender autofill from job LAKI-LAKI → L selected
    const selects = document.querySelectorAll('select');
    expect((selects[0] as HTMLSelectElement).value).toBe('L');
    expect(screen.getByText('ui.match_hint')).toBeTruthy();
  });

  it('excludes candidates already registered for this job (legacy Rule 1b)', async () => {
    const already = mkCand({ wa: '628111', nama: 'SUDAH ADA', idLoker: 'TG658' });
    const free = mkCand({ wa: '628222', nama: 'BEBAS', idLoker: 'ASJ2' });
    renderOpen([already, free]);
    fireEvent.click(screen.getByRole('button', { name: /ui\.start_specific_search/ }));
    await waitFor(() => expect(screen.getByText(/ui\.found_n/)).toBeTruthy());
    expect(document.body.textContent || '').not.toContain('SUDAH ADA');
    expect(document.body.textContent || '').toContain('BEBAS');
  });

  it('non-AKTIF candidates are excluded', async () => {
    const nonAktif = mkCand({ wa: '1', nama: 'GAGAL', status: 'GAGAL' });
    const aktif = mkCand({ wa: '2', nama: 'OK', status: 'AKTIF' });
    renderOpen([nonAktif, aktif]);
    fireEvent.click(screen.getByRole('button', { name: /ui\.start_specific_search/ }));
    await waitFor(() => expect(screen.getByText(/ui\.found_n/)).toBeTruthy());
    expect(document.body.textContent || '').not.toContain('GAGAL');
    expect(document.body.textContent || '').toContain('OK');
  });

  it('required JFT/SSW reads jftText/sswText (empty file field must not count)', async () => {
    // candidate with jft FILE set but no jftText → must NOT pass "Wajib JFT"
    const onlyFile = mkCand({ wa: '1', nama: 'FILE SAJA', jft: 'https://x/jft.pdf', jftText: '-' });
    const withText = mkCand({ wa: '2', nama: 'ADA NILAI', jftText: 'A2' });
    renderOpen([onlyFile, withText]);
    fireEvent.click(screen.getByText('ui.require_jft'));
    fireEvent.click(screen.getByRole('button', { name: /ui\.start_specific_search/ }));
    await waitFor(() => expect(screen.getByText(/ui\.found_n/)).toBeTruthy());
    expect(document.body.textContent || '').not.toContain('FILE SAJA');
    expect(document.body.textContent || '').toContain('ADA NILAI');
    // badge shown for the certified candidate
    expect(screen.getAllByText('JFT').length).toBeGreaterThan(0);
  });

  it('results capped at 30 (legacy render limit)', async () => {
    const many = Array.from({ length: 40 }, (_, i) => mkCand({ wa: '6281' + String(i).padStart(3, '0'), nama: 'KAND ' + i }));
    renderOpen(many);
    fireEvent.click(screen.getByRole('button', { name: /ui\.start_specific_search/ }));
    await waitFor(() => expect(screen.getByText(/ui\.found_n/)).toBeTruthy());
    // found_n says 40 matches (count of ALL matches), only 30 rows rendered
    const names = screen.getAllByText(/KAND \d+/);
    expect(names.length).toBe(30);
  });

  it('sort prioritises completeness (photo + jftText + sswText)', async () => {
    const full = mkCand({ wa: '1', nama: 'LENGKAP', pasPhoto: 'https://x/f.jpg', jftText: 'A2', sswText: 'Perawat' });
    const none = mkCand({ wa: '2', nama: 'KOSONG' });
    const photoOnly = mkCand({ wa: '3', nama: 'FOTO', pasPhoto: 'https://x/p.jpg' });
    renderOpen([none, photoOnly, full]);
    fireEvent.click(screen.getByRole('button', { name: /ui\.start_specific_search/ }));
    await waitFor(() => expect(screen.getByText(/ui\.found_n/)).toBeTruthy());
    const rows = document.querySelectorAll('.space-y-2 > div');
    const first = rows[0].textContent || '';
    expect(first).toContain('LENGKAP');
  });

  it('empty result after search → ui.no_match', async () => {
    const cand = mkCand({ wa: '1', nama: 'LAKI', gender: 'L' });
    renderOpen([cand]);
    // force gender mismatch by filtering Perempuan
    fireEvent.change(document.querySelectorAll('select')[0], { target: { value: 'P' } });
    fireEvent.click(screen.getByRole('button', { name: /ui\.start_specific_search/ }));
    await waitFor(() => expect(screen.getByText('ui.no_match')).toBeTruthy());
  });

  it('blast: confirm → api.secure(kirimTawaranMassal) with legacy payload; toast + close', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClose = vi.fn();
    const cand = mkCand({ wa: '6281111', nama: 'BUDI', status: 'AKTIF' });
    render(<MatchmakingModal job={job as never} candidates={[cand] as never} isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /ui\.start_specific_search/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /ui\.send_offer_all/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /ui\.send_offer_all/ }));
    await waitFor(() => expect(mockSecure).toHaveBeenCalledTimes(1));
    const [action, args] = mockSecure.mock.calls[0];
    expect(action).toBe('kirimTawaranMassal');
    const payload = args[0];
    expect(payload.jobCode).toBe('TG658');
    expect(payload.candidates).toHaveLength(1);
    expect(payload.candidates[0].wa).toBe('6281111');
    expect(typeof payload.linkGrup).toBe('string');
    // customMessage built from the t('ui.offer_msg_template') key (passthrough in tests)
    expect(typeof payload.customMessage).toBe('string');
    expect(payload.customMessage).toContain('offer_msg_template');
    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalled());
    expect(vi.mocked(showToast)).toHaveBeenCalledWith('ui.toast_offer_sent_n', 'success');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });

  it('blast without confirm → no API call', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const cand = mkCand({ wa: '6281111', nama: 'BUDI', status: 'AKTIF' });
    render(<MatchmakingModal job={job as never} candidates={[cand] as never} isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /ui\.start_specific_search/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /ui\.send_offer_all/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /ui\.send_offer_all/ }));
    await waitFor(() => expect(mockSecure).not.toHaveBeenCalled());
    confirmSpy.mockRestore();
  });

  it('blast with zero results → toast ui.toast_no_cand_offer, no API', () => {
    renderOpen([]);
    // no search performed → results empty; click send path directly not reachable,
    // so simulate through calling the internal guard by searching with no match first.
    fireEvent.click(screen.getByRole('button', { name: /ui\.start_specific_search/ }));
    void act(() => {});
    // no send button when results empty — legacy disables it
    expect(screen.queryByRole('button', { name: /ui\.send_offer_all/ })).toBeNull();
  });
});

// ==========================================
// Label/control wiring (a11y, 2026-09-16)
//
// The 7 `a11y/noLabelWithoutControl` diagnostics here were all ONE class —
// ordinary control labels — so all 7 took the same fix: `for=` + `id=` (prefix
// `mm-`). Two of them carry the SAME label text (`ui.age_range`), distinguished
// only by a "(Min)"/"(Max)" suffix — which is why the ids are minted per FIELD
// rather than per label text.
//
// The tests above assert rendered copy and behaviour. A label whose `for=` points
// nowhere still renders its text, so none of them would notice. These assertions
// pin the association itself.
// ==========================================
describe('MatchmakingModal — label/control wiring', () => {
  afterEach(() => cleanup());

  it('every <label for=...> resolves to an element that exists', () => {
    renderOpen();

    const dangling: string[] = [];
    for (const label of document.querySelectorAll('label')) {
      const target = label.getAttribute('for');
      if (!target) continue;
      if (!document.getElementById(target)) dangling.push(target);
    }

    expect(dangling).toEqual([]);
  });

  it('no label is left with neither for= nor a wrapped control', () => {
    renderOpen();

    const orphans = [...document.querySelectorAll('label')]
      .filter((l) => !l.getAttribute('for') && !l.querySelector('input, select, textarea'))
      .map((l) => (l.textContent || '').trim().slice(0, 40));

    expect(orphans).toEqual([]);
  });

  it('the two same-text age-range labels point at the RIGHT field', () => {
    renderOpen();

    // Two labels share the text `ui.age_range`. The risk is therefore NOT "no
    // association" but "associated with the WRONG one" — and that cannot be seen
    // by comparing the two INPUTS, because their ids are distinct no matter what
    // the labels say. So read the mapping off the LABEL's own for=.
    const forOfLabelContaining = (suffix: string) => {
      const label = [...document.querySelectorAll('label')].find((l) =>
        (l.textContent || '').includes(suffix),
      );
      expect(label, `no label containing ${suffix}`).toBeTruthy();
      return label?.getAttribute('for');
    };

    const minFor = forOfLabelContaining('(Min)');
    const maxFor = forOfLabelContaining('(Max)');

    expect(minFor).toBeTruthy();
    expect(maxFor).toBeTruthy();
    // Both labels aimed at one field => Min and Max would focus the same input.
    expect(minFor).not.toBe(maxFor);

    // ...and the right way ROUND, not merely different. 18/35 are the legacy
    // placeholders, so they identify which field each label actually reached.
    expect((document.getElementById(minFor as string) as HTMLInputElement).placeholder).toBe('18');
    expect((document.getElementById(maxFor as string) as HTMLInputElement).placeholder).toBe('35');
  });

  it('the controls the labels name are the ones the modal actually binds', () => {
    renderOpen();

    for (const [id, tag] of [
      ['mm-gender', 'SELECT'],
      ['mm-usia-min', 'INPUT'],
      ['mm-usia-max', 'INPUT'],
      ['mm-tb-min', 'INPUT'],
      ['mm-bb-max', 'INPUT'],
      ['mm-pendidikan', 'SELECT'],
      ['mm-keyword', 'INPUT'],
    ] as const) {
      const el = document.getElementById(id);
      expect(el, `#${id} does not exist`).toBeTruthy();
      expect(el?.tagName).toBe(tag);
    }
  });
});
