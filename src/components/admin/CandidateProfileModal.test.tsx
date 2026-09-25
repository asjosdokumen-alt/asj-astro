import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import CandidateProfileModal from './CandidateProfileModal';
import { authStore, logout } from '../../store/authReactive';
import { showToast } from '../Toast';

const mockFetch = vi.fn();
global.fetch = mockFetch;

// `apiClient` memakai `showToast` pada jalur non-silent. Mock ini membuat
// "fallback senyap" bisa dibuktikan, bukan diasumsikan.
vi.mock('../Toast', () => ({ showToast: vi.fn() }));

vi.mock('../../store/authReactive', () => ({
  // `isLoggedIn` is required now that handleSaveCatatan goes through
  // api.secure(): the client refuses — and with onSessionInvalid:'throw' it
  // throws — BEFORE it fetches when the store reports no live session. The old
  // mock returned only sessionToken, which was enough while the component built
  // its own fetch.
  //
  // `get` is a `vi.fn` so a test can report a DEAD session and prove that the
  // silent fallback read still goes out (it is `requireAuth: false`).
  authStore: { get: vi.fn(() => ({ isLoggedIn: true, sessionToken: 'test-token' })) },
  logout: vi.fn(),
}));

const liveSession = () => ({ isLoggedIn: true, sessionToken: 'test-token' });

vi.mock('../../lib/apiEndpoint', () => ({
  getEndpoint: (key: string) => `/.netlify/functions/${key}`,
}));

// Real API shape (getCandidatesPage / mapCandidate): decorated row with flat
// legacy fields + berkas/bio/applications, exactly like the row TabPelamar
// passes into the modal through the showCandidateHistory event.
const mockCandidate = {
  nama: 'REVIN ANTHONIO NOVRI ANDHI',
  wa: '6285854256720',
  idKandidat: 'ASJ00159',
  gender: 'LAKI-LAKI',
  usia: '19',
  tb: '175',
  bb: '70',
  tahapan: 'Baru (LULUS)',
  status: 'LULUS',
  catatanInt: '[KELAS G] Kekuatan/Catatan khusus admin',
  catatanExt: 'Feedback untuk kandidat',
  isSiswaASJ: true,
  jftText: 'A2',
  sswText: 'SSW',
  applications: [{ code: 'UMUM', kategori: 'UMUM', status: 'LULUS' }],
  berkas: { ktp: 'https://x.supabase.co/ktp.pdf' },
  bio: { tmplahir: 'Ponorogo', tgllahir: '2007-01-01', email: 'revin@test.com', alamat: 'Jl. Test 1' },
};

function expectExists(text: string | RegExp) {
  const els = screen.getAllByText(text);
  expect(els.length).toBeGreaterThanOrEqual(1);
}

describe('CandidateProfileModal', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(authStore.get).mockImplementation(liveSession as never);
    vi.mocked(logout).mockReset();
    vi.mocked(showToast).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders from the passed decorated candidate row without any fetch', async () => {
    render(
      <CandidateProfileModal
        wa={mockCandidate.wa}
        nama="REVIN"
        candidate={mockCandidate}
        isOpen={true}
        onClose={() => {}}
      />
    );

    expectExists('REVIN ANTHONIO NOVRI ANDHI');
    expectExists('Siswa ASJ');
    expectExists('19 Tahun');
    expectExists('LAKI-LAKI');
    expectExists('175 / 70');
    expectExists('A2');
    expectExists('LULUS');
    // A19: dossier chrome all via t() keys (legacy #modal-cv/cv.ts dossier).
    expectExists('Status');
    expectExists('Biodata');
    expectExists('JFT / JLPT');
    expectExists('SSW / Bidang');
    expectExists('Edit Cepat CV');
    expectExists('Lengkapi Pemberkasan & Biodata');
    expectExists('Download Full Biodata');
    expectExists('Evaluasi Kandidat (Admin)');
    expectExists('Catatan Internal (Private)');
    expectExists('Catatan External (Kandidat)');
    expectExists('Simpan Evaluasi Catatan');
    expectExists('WhatsApp');
    expectExists('Tutup');
    // Data comes from the row — no network call at all.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('A19: Edit Cepat mengirim ROW MENTAH ke openCandidateEdit (prefill EditCandidateModal penuh)', () => {
    const got: unknown[] = [];
    const onEdit = (e: Event) => got.push((e as CustomEvent).detail);
    window.addEventListener('openCandidateEdit', onEdit);
    render(
      <CandidateProfileModal
        wa={mockCandidate.wa}
        nama="REVIN"
        candidate={mockCandidate}
        isOpen={true}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByText('Edit Cepat CV'));
    expect(got.length).toBe(1);
    // Row mentah — bukan data ter-map (dulu prefill EditCandidateModal kosong
    // karena fisik digabung & tmplahir ≠ tempatLahir).
    expect(got[0]).toMatchObject({
      wa: mockCandidate.wa,
      tb: '175',
      bb: '70',
      jftText: 'A2',
      sswText: 'SSW',
      catatanInt: mockCandidate.catatanInt,
    });
    window.removeEventListener('openCandidateEdit', onEdit);
  });

  it('A19: status bar menampilkan tahapan DAN status (parity cv-status dossier)', () => {
    render(
      <CandidateProfileModal
        wa={mockCandidate.wa}
        nama="REVIN"
        candidate={{ ...mockCandidate, status: 'GAGAL' }}
        isOpen={true}
        onClose={() => {}}
      />
    );
    // Header card: label + tahapan chip + status chip semuanya tampil.
    expectExists('Baru (LULUS)');
    expectExists('GAGAL');
    expectExists('Status');
  });

  it('B03: baris Dokumen (BUKA FOTO/CV/JFT/SSW) dari cvUrl/jftUrl/sswUrl/pasPhoto — klik → preview inline', async () => {
    const withDocs = {
      ...mockCandidate,
      pasPhoto: 'https://res.cloudinary.com/x/image/upload/pas_photo/revin.jpg',
      cvUrl: 'https://x.supabase.co/storage/revin_cv.pdf',
      jftUrl: 'https://x.supabase.co/storage/revin_jft.pdf',
      sswUrl: 'https://x.supabase.co/storage/revin_ssw.pdf',
    };
    render(
      <CandidateProfileModal
        wa={mockCandidate.wa}
        nama="REVIN"
        candidate={withDocs}
        isOpen={true}
        onClose={() => {}}
      />
    );
    // A19 menambahkan key open_*; B03 menautkannya — tombol muncul + label via key
    expectExists('BUKA FOTO');
    expectExists('BUKA CV');
    expectExists('BUKA JFT');
    expectExists('BUKA SSW');

    // Klik BUKA CV → DocumentPreviewModal (iframe Google Docs Viewer utk PDF)
    const btnCv = screen.getAllByText('BUKA CV')[0] as HTMLButtonElement;
    fireEvent.click(btnCv);
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.src).toContain('docs.google.com/gview?url=');
    expect(frame.src).toContain(encodeURIComponent('https://x.supabase.co/storage/revin_cv.pdf'));
  });

  it('B03: tanpa dokumen ter-upload → baris Dokumen tidak dirender', async () => {
    render(
      <CandidateProfileModal
        wa={mockCandidate.wa}
        nama="REVIN"
        candidate={mockCandidate}
        isOpen={true}
        onClose={() => {}}
      />
    );
    expect(screen.queryAllByText('BUKA CV').length).toBe(0);
    expect(screen.queryAllByText('BUKA FOTO').length).toBe(0);
  });

  it('falls back to getExistingCandidateJsonByWa when no row is passed', async () => {
    // `ok: true` WAJIB: pembacaan ini juga lewat apiClient sekarang, dan klien
    // memeriksa `res.ok` — mock tanpa itu terbaca sebagai kegagalan, klien
    // melempar, dan modal jatuh ke data fallback (props) alih-alih baris server.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: mockCandidate }),
    });

    render(<CandidateProfileModal wa="6285854256720" nama="REVIN" isOpen={true} onClose={() => {}} />);

    await waitFor(() => {
      expectExists('REVIN ANTHONIO NOVRI ANDHI');
      expectExists('Siswa ASJ');
      expect(mockFetch).toHaveBeenCalledWith(
        '/.netlify/functions/getExistingCandidateJsonByWa',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'getExistingCandidateJsonByWa',
            // `payload`, bukan `args` — klien menyeragamkan ke payload dan
            // backend menerima keduanya (`body.payload || body.args`).
            payload: ['6285854256720'],
            sessionToken: 'test-token',
          }),
          // Pembatalan saat unmount DIPERTAHANKAN lewat opsi `signal` klien —
          // inilah yang dulu dijadikan alasan menunda konversi ini.
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CandidateProfileModal wa="6285854256720" nama="REVIN" isOpen={false} onClose={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('aborts fetch when modal closes mid-flight', async () => {
    let resolveFetch: (v: any) => void;
    mockFetch.mockReturnValue(new Promise(r => { resolveFetch = r; }));

    const { rerender } = render(
      <CandidateProfileModal wa="6285854256720" nama="REVIN" isOpen={true} onClose={() => {}} />
    );

    // Close modal before fetch completes
    rerender(<CandidateProfileModal wa="6285854256720" nama="REVIN" isOpen={false} onClose={() => {}} />);

    // Resolve fetch — should not crash or set state
    resolveFetch!({ json: () => Promise.resolve({ success: true, data: mockCandidate }) });

    // No crash = pass. The AbortError is caught silently.
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  it('shows fallback data on API error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<CandidateProfileModal wa="6285854256720" nama="REVIN" isOpen={true} onClose={() => {}} />);

    await waitFor(() => {
      // Fallback uses props: nama + wa
      expectExists('REVIN');
      expectExists(/6285854256720/);
    });
    // `silent: true` — pembacaan latar ini tidak pernah memunculkan toast.
    // Tanpa itu klien menambah "Network error: Network error" di layar admin.
    expect(vi.mocked(showToast)).not.toHaveBeenCalled();
  });

  it('jawaban sessionInvalid → data fallback, TANPA logout/redirect global', async () => {
    // `onSessionInvalid: 'throw'` (bukan default 'logout'): sesi basi pada satu
    // pembacaan latar tidak boleh melempar admin keluar dari aplikasi. Yang
    // lama (fetch mentah) juga hanya menghasilkan `success:false` → fallback.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: false, sessionInvalid: true }),
    });

    render(<CandidateProfileModal wa="6285854256720" nama="REVIN" isOpen={true} onClose={() => {}} />);

    await waitFor(() => expectExists('REVIN'));
    expect(screen.queryByText('REVIN ANTHONIO NOVRI ANDHI')).toBeNull();
    expect(vi.mocked(logout)).not.toHaveBeenCalled();
  });

  it('does not fetch when wa is empty and no row is passed', () => {
    render(<CandidateProfileModal wa="" nama="REVIN" isOpen={true} onClose={() => {}} />);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── REGRESI item 10: `[vip]` huruf kecil BUKAN VIP (case-sensitive) ─────────
  // Modal ini memakai tag `[VIP]` literal, sama seperti isVipCatatan (lib/vip.ts,
  // gate AI CV/simulator). Dulu prefillnya pakai /\[VIP\]/i sehingga catatan
  // `[vip]` menyalakan toggle VIP — padahal gerbang MENOLAK kandidat itu.
  it('[vip] huruf kecil → toggle TIDAK menyala (prefill case-sensitive)', () => {
    render(
      <CandidateProfileModal
        wa={mockCandidate.wa}
        nama="REVIN"
        candidate={{ ...mockCandidate, catatanInt: '[vip] catatan pribadi' }}
        isOpen={true}
        onClose={() => {}}
      />
    );
    // Toggle baca-an: off → label "☐ Tandai VIP", bukan "✅ VIP".
    expectExists('☐ Tandai VIP');
    expect(screen.queryByText('✅ VIP (Rencana Resmi)')).toBeNull();
  });

  it('[vip] huruf kecil → simpan dengan toggle off TIDAK menulis [VIP] & tidak menghapus teksnya', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) });
    render(
      <CandidateProfileModal
        wa={mockCandidate.wa}
        nama="REVIN"
        candidate={{ ...mockCandidate, catatanInt: '[vip] catatan pribadi' }}
        isOpen={true}
        onClose={() => {}}
      />
    );
    // Toggle memang off (prefill case-sensitive), jadi cukup simpan tanpa klik toggle.
    fireEvent.click(screen.getByText('Simpan Evaluasi Catatan'));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/.netlify/functions/updateCatatanKandidat',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'updateCatatanKandidat',
            payload: [
              {
                wa: mockCandidate.wa,
                // Strip bentuk kanonikal `[VIP]` case-sensitive — `[vip]` bukan
                // tag VIP, jadi teksnya UTUH. Ini yang mencegah penulisan
                // diam-diam menghapus catatan yang admin lihat.
                catatanInternal: '[vip] catatan pribadi',
                catatanExternal: mockCandidate.catatanExt,
              },
            ],
            sessionToken: 'test-token',
          }),
        })
      );
    });
  });

  it('saves catatan internal/external + VIP tag via updateCatatanKandidat', async () => {
    // `ok: true` is REQUIRED now that this call goes through apiClient: the
    // client checks `res.ok`, which the raw code never did (it only called
    // .json()). A mock without it reads as a failed response and the client
    // throws — the assertion below then sees no request body at all.
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) });

    const changed: string[] = [];
    const onChanged = (e: Event) => changed.push((e as CustomEvent).detail?.wa || '');
    window.addEventListener('candidates-changed', onChanged);

    render(
      <CandidateProfileModal
        wa={mockCandidate.wa}
        nama="REVIN"
        candidate={mockCandidate}
        isOpen={true}
        onClose={() => {}}
      />
    );

    // Seed row has no [VIP] → toggle it on, then save.
    fireEvent.click(screen.getByText('☐ Tandai VIP'));
    fireEvent.click(screen.getByText('Simpan Evaluasi Catatan'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/.netlify/functions/updateCatatanKandidat',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'updateCatatanKandidat',
            // `payload`, not `args` — the client standardises on payload and the
            // backend accepts either (`body.payload || body.args` in
            // _lib/netlify-wrapper.ts). The argument SHAPE below is what matters
            // and is unchanged.
            payload: [
              {
                wa: mockCandidate.wa,
                // VIP prefix added; raw textarea content kept as-is.
                catatanInternal: '[VIP] [KELAS G] Kekuatan/Catatan khusus admin',
                catatanExternal: mockCandidate.catatanExt,
              },
            ],
            sessionToken: 'test-token',
          }),
        })
      );
    });

    await waitFor(() => {
      // Row refresh signal dispatched so TabPelamar refetches.
      expect(changed).toContain(mockCandidate.wa);
    });
    window.removeEventListener('candidates-changed', onChanged);
  });

  // Komentar lama di komponen ini menyatakan konversinya ditunda karena
  // "`apiClient` belum punya opsi `signal`". Itu keliru (opsi itu ADA, dan doc
  // comment-nya menyebut berkas ini), dan penundaan itu tidak pernah dicabut.
  // Invarian ini menjaga supaya tidak ada `fetch` mentah yang tersisa.
  it('sumbernya tidak memanggil fetch() mentah sama sekali', () => {
    const src = readFileSync('src/components/admin/CandidateProfileModal.tsx', 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bfetch\s*\(/.test(line) && !/^(\/\/|\*|\/\*)/.test(line));
    expect(offenders).toEqual([]);
  });

  it('pembacaan fallback tetap DIKIRIM walau sesi mati (requireAuth: false — server yang memutuskan)', async () => {
    // Perilaku lama: token (walau kosong) selalu dikirim, dan penjaga
    // isOwnerOrAdmin di server yang menjawab. `requireAuth: true` akan menolak
    // di klien lebih dulu, mengganti pesan server dengan "No valid session".
    vi.mocked(authStore.get).mockReturnValue({ isLoggedIn: false, sessionToken: '' } as never);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: mockCandidate }),
    });

    render(<CandidateProfileModal wa="6285854256720" nama="REVIN" isOpen={true} onClose={() => {}} />);

    await waitFor(() => expectExists('REVIN ANTHONIO NOVRI ANDHI'));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
