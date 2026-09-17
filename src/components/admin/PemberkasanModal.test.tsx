import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PemberkasanModal from './PemberkasanModal';

vi.mock('../../store/authReactive', () => ({
  authStore: { get: () => ({ sessionToken: 'test-token', role: 'kandidat' }) },
}));

vi.mock('../../lib/apiEndpoint', () => ({
  getEndpoint: (key: string) => `/.netlify/functions/${key}`,
}));

vi.mock('../Toast', () => ({
  showToast: vi.fn(),
}));

// i18n identity: assertions pakai key (ui.uploaded_view / ui.not_yet / dst).
vi.mock('../../store/i18n', () => ({ t: (k: string) => k }));

vi.mock('../../lib/uploadBerkas', () => ({
  uploadBerkasToStorage: vi.fn(),
}));

const base = {
  isOpen: true,
  onClose: vi.fn(),
  waTarget: '6281111111111',
  namaTarget: 'BUDI',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PemberkasanModal — A05 parity', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PemberkasanModal {...base} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('locks panels for a candidate whose tahapan does not allow upload yet', async () => {
    render(
      <PemberkasanModal
        {...base}
        isAdmin={false}
        candidate={{ tahapan: 'BARU', berkas: {}, bio: {} }}
      />,
    );
    // Setelah effect: panel T1/T2/bio TIDAK muncul, ganti notice terkunci.
    await waitFor(() => expect(screen.getByText('ui.upload_locked')).toBeTruthy());
    expect(screen.queryByText('ui.stage1_short')).toBeNull();
    expect(screen.queryByText('candidate.biodata_title')).toBeNull();
  });

  it('shows all panels for admin and marks saved docs as done (tombol preview inline) vs belum', async () => {
    render(
      <PemberkasanModal
        {...base}
        isAdmin={true}
        candidate={{
          tahapan: 'LIST',
          berkas: { kk: 'https://cdn.example/kk.pdf', foto2: '-' },
          bio: {},
        }}
      />,
    );
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());
    // KK sudah → tombol "ui.uploaded_view" (B03: preview INLINE via modal,
    // parity setStatusBerkas → bukaPreviewDokumen — bukan <a target=_blank>).
    expect(screen.getByText('ui.uploaded_view')).toBeTruthy();
    const notYet = screen.getAllByText('ui.not_yet');
    expect(notYet.length).toBeGreaterThan(0);
    expect(document.querySelector('a[href="https://cdn.example/kk.pdf"]')).toBeNull();
    expect(screen.queryByText('ui.upload_locked')).toBeNull();

    // Klik tombol → DocumentPreviewModal terbuka (PDF → Google Docs Viewer)
    fireEvent.click(screen.getByText('ui.uploaded_view'));
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.src).toContain('docs.google.com/gview?url=');
    expect(frame.src).toContain(encodeURIComponent('https://cdn.example/kk.pdf'));
  });

  it('prefills biodata from candidate.bio (short keys → long payload keys)', async () => {
    render(
      <PemberkasanModal
        {...base}
        isAdmin={true}
        candidate={{
          tahapan: 'LIST',
          berkas: {},
          bio: {
            email: 'budi@mail.com',
            tmplahir: 'Ponorogo',
            tgllahir: '01/05/2000', // format legacy → ISO utk input date
            ayah: 'PAK BUDI',
            pt: 'PT SAKURA',
          },
        }}
      />,
    );
    await waitFor(() => expect(screen.getByDisplayValue('budi@mail.com')).toBeTruthy());
    expect((screen.getByDisplayValue('Ponorogo') as HTMLInputElement).value).toBe('Ponorogo');
    expect((screen.getByDisplayValue('2000-05-01') as HTMLInputElement).value).toBe('2000-05-01');
    expect((screen.getByDisplayValue('PAK BUDI') as HTMLInputElement).value).toBe('PAK BUDI');
    expect((screen.getByDisplayValue('PT SAKURA') as HTMLInputElement).value).toBe('PT SAKURA');
  });
});

// ==========================================
// Label/control wiring (2026-09-16)
//
// Every berkas label and every biodata label sat above its control without
// ever naming it. The berkas id was already load-bearing — the upload handler
// does getElementById(`berkas-${key}`) — so the association was real and just
// unstated. The biodata control is chosen at render time between <input> and
// <textarea>, so both branches carry the id.
// ==========================================
describe('PemberkasanModal — label/control wiring', () => {
  const renderAdmin = () =>
    render(
      <PemberkasanModal {...base} isAdmin={true} candidate={{ tahapan: 'LIST', berkas: {}, bio: {} }} />,
    );

  const labelFor = (key: string) => {
    const el = [...document.querySelectorAll('label')].find(
      (l) => (l.textContent || '').trim() === key,
    );
    expect(el, `no <label> whose text is ${key}`).toBeTruthy();
    return el?.getAttribute('for');
  };

  it('every berkas label names a file input, and the upload handler agrees', async () => {
    renderAdmin();
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());

    const fors = [...document.querySelectorAll('label')]
      .map((l) => l.getAttribute('for'))
      .filter((f): f is string => !!f && f.startsWith('berkas-'));
    expect(fors.length).toBeGreaterThan(0);

    for (const f of fors) {
      const el = document.getElementById(f) as HTMLInputElement | null;
      expect(el, `${f} must resolve to a real element`).toBeTruthy();
      expect(el?.tagName).toBe('INPUT');
      expect(el?.type).toBe('file');
    }
    // A single static for= would satisfy the loop above while pointing every
    // label at one input, so require one distinct target per berkas label.
    expect(new Set(fors).size).toBe(fors.length);

    // The label for the KK document points at exactly the element the upload
    // handler looks up by id — the two mechanisms must not drift apart.
    expect(labelFor('candidate.form_kk')).toBe('berkas-kk');
    expect((document.getElementById('berkas-kk') as HTMLInputElement).type).toBe('file');
    // And a second document, so a label hard-wired to one id cannot pass.
    expect(labelFor('candidate.form_akte')).toBe('berkas-akte');
  });

  it('every biodata label names the control that renders for its field', async () => {
    renderAdmin();
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());

    // <input> branch.
    expect(labelFor('candidate.bio_email')).toBe('bio-email');
    const email = document.getElementById('bio-email') as HTMLInputElement | null;
    expect(email?.tagName).toBe('INPUT');
    expect(email?.type).toBe('email');

    // <textarea> branch — same field mechanism, different element.
    expect(labelFor('candidate.bio_address')).toBe('bio-alamat_lengkap');
    const addr = document.getElementById('bio-alamat_lengkap') as HTMLTextAreaElement | null;
    expect(addr?.tagName).toBe('TEXTAREA');
  });

  it('no <label> in the modal is left without a control', async () => {
    renderAdmin();
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());
    const bare = [...document.querySelectorAll('label')].filter(
      (l) => !l.getAttribute('for') && !l.querySelector('input,select,textarea'),
    );
    expect(bare.map((l) => (l.textContent || '').trim())).toEqual([]);
  });
});
