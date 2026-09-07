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
