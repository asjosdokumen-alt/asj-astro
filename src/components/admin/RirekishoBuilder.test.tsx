// ==========================================
// TESTS: RirekishoBuilder (A10 parity, 2026-09-05)
//
// Astro padanan legacy renderCVAjaib (js/10_cv_rirekisho.ts + 10b_cv_builders)
// yang membuka preview CV Rirekisho dari tombol "Preview Desain CV" kandidat
// (bukaPreviewCV) dan tombol CV admin. Root bugs A10 yang dikunci di sini:
//   - tombol kandidat lama membuka DocumentPreviewModal dengan URL KOSONG
//     (tidak ada yang ditampilkan) — kini membuka RirekishoBuilder
//   - foto: legacy pakai uploads.photo master, fallback pasPhoto baris
//     kandidat (ALL_CANDIDATES); builder lama cuma uploads.photo → fallback
//     baru via prop fotoFallback (TabPelamar / CandidateDash meneruskan row)
//   - loading copy hard-coded "Loading..." → t('ui.loading')
// Tanggal rirekisho diformat via helpers_cv (di-test terpisah di helpers_cv.test).
// ==========================================
import { render, screen, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RirekishoBuilder from './RirekishoBuilder';
import * as auth from '../../store/authReactive';

const { mockDraft } = vi.hoisted(() => ({ mockDraft: vi.fn() }));

vi.mock('../../lib/apiClient', () => {
  const fn: any = (...args: unknown[]) => mockDraft(...args);
  fn.call = fn;
  return { default: fn };
});

vi.mock('../../store/authReactive', () => {
  let role = 'kandidat';
  return {
    __setRole: (r: string) => { role = r; },
    authStore: {
      get: () => ({
        role, name: role === 'admin' ? 'AGUS' : 'KANDIDAT A',
        wa: '6281234567890', sessionToken: 'tok-1', refreshToken: '',
        isLoggedIn: true, lastChecked: 0,
      }),
      set: () => {},
      listen: () => () => {},
    },
    logout: vi.fn(),
  };
});

const draft = {
  id_kandidat: 'ASJ00123',
  AIDATAJSON: '',
  uploads: { photo: '' },
  identitas: {
    nama_lengkap: 'KANDIDAT A',
    gender: 'LAKI-LAKI',
    tgl_lahir: '1995-08-14',
  },
  pendidikan: [{ tingkat: 'SMA', tahun_masuk: '2010-04', tahun_lulus: '2013-03' }],
  pekerjaan: [],
  keluarga: [],
};

const setRole = (r: string) => (auth as any).__setRole(r);

describe('RirekishoBuilder (A10)', () => {
  beforeEach(() => {
    mockDraft.mockReset();
    mockDraft.mockResolvedValue(draft);
    setRole('kandidat');
  });

  afterEach(() => cleanup());

  it('kandidat: preview CV (bukaPreviewCV) — MODE PREVIEW tanpa tombol cetak, data & tanggal Jepang dirender', async () => {
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />,
    );
    expect(screen.getByText('Memuat...')).toBeTruthy();
    await waitFor(() => expect(mockDraft).toHaveBeenCalledWith('getDrafCvMaster', ['6281234567890']));
    await waitFor(() => expect(container.innerHTML).toContain('実習生経歴書'));
    expect(container.innerHTML).toContain('DAFTAR RIWAYAT HIDUP');
    expect(container.innerHTML).toContain('KANDIDAT A');
    // Tanggal lahir diformat YYYY年MM月DD日 (parity legacy renderCVAjaib).
    expect(container.innerHTML).toContain('1995年08月14日');
    // Bulan masuk pendidikan → 2010年4月
    expect(container.innerHTML).toContain('2010年4月');
    expect(container.innerHTML).toContain('MODE PREVIEW');
    expect(container.innerHTML).not.toContain('Cetak Rirekisho');
  });

  it('admin: tombol Cetak Rirekisho / Simpan PDF dirender (tombol hanya utk admin)', async () => {
    setRole('admin');
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />,
    );
    await waitFor(() => expect(container.innerHTML).toContain('実習生経歴書'));
    expect(container.innerHTML).toContain('Cetak Rirekisho');
    expect(container.innerHTML).toContain('Simpan PDF');
    expect(container.innerHTML).not.toContain('MODE PREVIEW');
  });

  it('error dari getDrafCvMaster → pesan asli server tampil', async () => {
    mockDraft.mockResolvedValue({ error: 'Data Master belum ada untuk KANDIDAT A (6281234567890). Isi Form Master dulu.' });
    render(<RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/Data Master belum ada untuk KANDIDAT A/)).toBeTruthy(),
    );
  });

  it('foto: uploads.photo master kosong + fotoFallback row → img pakai fallback', async () => {
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} fotoFallback="https://cdn.example/asj/pas-photo.jpg" />,
    );
    await waitFor(() => expect(container.innerHTML).toContain('実習生経歴書'));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/asj/pas-photo.jpg');
  });

  it('foto: uploads.photo master ada → dipakai (fallback tidak mengalahkan master)', async () => {
    mockDraft.mockResolvedValue({ ...draft, uploads: { photo: 'https://cdn.example/master/foto.jpg' } });
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} fotoFallback="https://cdn.example/asj/pas-photo.jpg" />,
    );
    await waitFor(() => expect(container.innerHTML).toContain('実習生経歴書'));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/master/foto.jpg');
  });

  it('AI: entri pendidikan berbentuk sekolah_id tetap tampil NAMA SEKOLAHnya', async () => {
    // Bentuk kunci dari form AI (arrayFields) memakai sekolah_id, sedangkan
    // builder membaca bentuk kanonikal `sekolah`. Tanpa normalizer di titik
    // gabung, baris ini dirender dengan nama sekolah KOSONG sementara tanggalnya
    // tetap tampil — gejala yang tampak kosmetik padahal data hilang.
    mockDraft.mockResolvedValue({
      ...draft,
      pendidikan: [],
      AIDATAJSON: JSON.stringify({
        pendidikan: [{ tingkat: 'SMP', sekolah_id: 'SMPN 3 CERDAS', tahun_masuk: '2007-07' }],
      }),
    });
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />,
    );
    await waitFor(() => expect(container.innerHTML).toContain('実習生経歴書'));
    expect(container.innerHTML).toContain('SMPN 3 CERDAS');
    expect(container.innerHTML).toContain('2007年7月');
  });

  it('pendidikan di kertas A4 terurut baku SD → SMP → SMA walau data terbalik', async () => {
    mockDraft.mockResolvedValue({
      ...draft,
      pendidikan: [
        { tingkat: 'SMA', sekolah: 'SMAN SATU', masuk: '2010-04' },
        { tingkat: 'SD', sekolah: 'SDN LIMA', masuk: '2001-07' },
        { tingkat: 'SMP', sekolah: 'SMPN TIGA', masuk: '2007-07' },
      ],
    });
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />,
    );
    await waitFor(() => expect(container.innerHTML).toContain('実習生経歴書'));
    const html = container.innerHTML;
    // Urutan posisi menandai urutan render: SD sebelum SMP sebelum SMA.
    expect(html.indexOf('SDN LIMA')).toBeGreaterThan(-1);
    expect(html.indexOf('SDN LIMA')).toBeLessThan(html.indexOf('SMPN TIGA'));
    expect(html.indexOf('SMPN TIGA')).toBeLessThan(html.indexOf('SMAN SATU'));
  });

  it('AI: pekerjaan berbentuk perusahaan_id/jabatan_id tampil namanya di kertas A4', async () => {
    mockDraft.mockResolvedValue({
      ...draft,
      pekerjaan: [],
      AIDATAJSON: JSON.stringify({
        pekerjaan: [{ perusahaan_id: 'PT SEJAHTERA', jabatan_id: 'OPERATOR', tahun_masuk: '2015-03' }],
      }),
    });
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />,
    );
    await waitFor(() => expect(container.innerHTML).toContain('実習生経歴書'));
    expect(container.innerHTML).toContain('PT SEJAHTERA');
    expect(container.innerHTML).toContain('OPERATOR');
  });

  it('AI: keluarga berbentuk hubungan_id/pekerjaan_id tampil namanya di kertas A4', async () => {
    mockDraft.mockResolvedValue({
      ...draft,
      keluarga: [],
      AIDATAJSON: JSON.stringify({
        keluarga: [{ nama: 'BUDI SANTOSO', hubungan_id: 'AYAH', pekerjaan_id: 'PETANI', usia: '55' }],
      }),
    });
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />,
    );
    await waitFor(() => expect(container.innerHTML).toContain('実習生経歴書'));
    expect(container.innerHTML).toContain('AYAH');
    expect(container.innerHTML).toContain('BUDI SANTOSO');
    expect(container.innerHTML).toContain('PETANI');
  });

  /**
   * REGRESSION (measured 2026-10-12): the identity cells printed the literal
   * string "undefined" on EVERY CV.
   *
   * `buildCvIdentitas()` returns `{gStr,nStr,jStr,pStr,tStr,gd,nr}`, and the
   * caller spreads it (`...id`) into `buildKertasA4()`. The sheet destructured
   * `{gS,nS,jS,pS,tS,…}` — five names the producer never emitted — so five
   * `escVal(undefined)` calls wrote "undefined" into JENIS KELAMIN, STATUS
   * PERNIKAHAN, PERNAH KE JEPANG, PASPOR and TANGAN.
   *
   * Measured against the live DB before the fix: 40 of 40 real candidates
   * rendered a CV containing "undefined". `rirekishoEscape.test.ts` could not
   * see it — that suite spreads `...id` too, but only asserts that XSS payloads
   * come out escaped.
   *
   * The assertions are per-CELL and positive on purpose: "no undefined" alone
   * would also pass if the cells were blanked to `-`, which is the same bug in
   * a quieter costume.
   */
  it('identitas: lima kolom identitas terisi datanya — tidak pernah "undefined"', async () => {
    mockDraft.mockResolvedValue({
      ...draft,
      identitas: {
        nama_lengkap: 'KANDIDAT A',
        gender: 'PEREMPUAN',
        status_nikah: 'BELUM MENIKAH',
        paspor: 'YA',
        tgl_lahir: '1995-08-14',
      },
      wawancara: { riwayat_jepang: 'BELUM' },
      fisik: { tangan_dominan: 'KANAN' },
    });
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />,
    );
    await waitFor(() => expect(container.innerHTML).toContain('実習生経歴書'));
    const html = container.innerHTML;
    expect(html).not.toContain('undefined');
    expect(html).toContain('PEREMPUAN (女)');
    expect(html).toContain('BELUM MENIKAH （未婚）');
    expect(html).toContain('ADA （有）');
    expect(html).toContain('KANAN  (右)');
  });

  /**
   * 血液型 — sel golongan darah.
   *
   * Keluhan pemilik 2026-10-12: "golongan darah sekarang tolong perbanyak
   * kategorinya jgn a b ab o tambahin + nya juga". Begitu varian Rh bisa
   * dipilih, sel ini harus ikut benar: `gd + " 型"` mencetak `O+ 型`, yang
   * terbaca sebagai golongan "O+" padahal `型` menempel pada ABO. Nilai nyata
   * di DB: `O+`, `A+`, `B+`, dan satu baris `"AB +"` (ASJ00171, berspasi).
   *
   * Nilai kosong juga diperiksa: versi lama selalu menempelkan sufiks, jadi
   * selnya berisi ` 型` saja ketika golongan darah tidak diisi.
   */
  it('血液型: `O+` dirender "O 型 Rh+", dan kosong TIDAK menyisakan " 型"', async () => {
    mockDraft.mockResolvedValue({ ...draft, identitas: { ...draft.identitas, golongan_darah: 'O+' } });
    const a = render(<RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(a.container.innerHTML).toContain('実習生経歴書'));
    expect(a.container.innerHTML).toContain('O 型 Rh+');
    expect(a.container.innerHTML).not.toContain('O+ 型');
    a.unmount();

    mockDraft.mockResolvedValue({ ...draft, identitas: { ...draft.identitas, golongan_darah: '-' } });
    const b = render(<RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(b.container.innerHTML).toContain('実習生経歴書'));
    expect(b.container.innerHTML).not.toContain(' 型</td>');
  });

  /**
   * 配偶者 — sel status pernikahan.
   *
   * Pemilik 2026-10-12: "belum menikah, menikah, cerai, cerai meninggal?" —
   * kategori keempat memang belum ada. Yang lebih parah, sel ini MENGARANG
   * jawaban: ternary lamanya
   *
   *   (nik.includes('MENIKAH') && !nik.includes('BELUM')) ? 'MENIKAH （已婚）'
   *     : nik === '-' ? '' : 'BELUM MENIKAH （未婚）'
   *
   * menjatuhkan SETIAP nilai yang bukan "MENIKAH" polos ke `BELUM MENIKAH
   * （未婚）` — termasuk `CERAI`, `CERAI MENINGGAL`, dan yang KOSONG. Jadi CV
   * kandidat yang bercerai atau menjanda menyatakan ia belum pernah menikah,
   * dan kandidat yang belum menjawab diberi jawaban atas namanya. Nilai
   * `CERAI`-family terukur ada di DB live, jadi ini bukan kasus teoretis.
   *
   * Tiga hal yang dikunci di sini: (1) tiap nilai dapat selnya sendiri;
   * (2) `CERAI MENINGGAL` tidak terbaca sebagai `CERAI` polos; (3) kosong
   * menghasilkan sel KOSONG, bukan jawaban karangan.
   */
  it('status pernikahan: CERAI / CERAI MENINGGAL / kosong TIDAK pernah dicap "BELUM MENIKAH"', async () => {
    const cases: Array<[string, string]> = [
      ['BELUM MENIKAH', 'BELUM MENIKAH （未婚）'],
      ['MENIKAH', 'MENIKAH （既婚）'],
      ['CERAI', 'CERAI （離婚）'],
      ['CERAI MENINGGAL', 'CERAI MENINGGAL （死別）'],
    ];
    for (const [stored, expected] of cases) {
      mockDraft.mockResolvedValue({ ...draft, identitas: { ...draft.identitas, status_nikah: stored } });
      const r = render(<RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />);
      await waitFor(() => expect(r.container.innerHTML).toContain('実習生経歴書'));
      expect(r.container.innerHTML, `status ${stored}`).toContain(expected);
      r.unmount();
    }

    // Belum diisi → sel kosong. Versi lama mengarang "BELUM MENIKAH （未婚）".
    mockDraft.mockResolvedValue({ ...draft, identitas: { ...draft.identitas, status_nikah: '' } });
    const e = render(<RirekishoBuilder waTarget="6281234567890" isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(e.container.innerHTML).toContain('実習生経歴書'));
    expect(e.container.innerHTML).not.toContain('BELUM MENIKAH');
  });

  it('isOpen=false → tidak render apa pun', () => {
    const { container } = render(
      <RirekishoBuilder waTarget="6281234567890" isOpen={false} onClose={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
    expect(mockDraft).not.toHaveBeenCalled();
  });
});
