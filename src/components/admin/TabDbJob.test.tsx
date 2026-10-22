// ==========================================
// TESTS: TabDbJob helpers (A18 parity, 2026-09-05)
//
// Legacy ground truth: js/render/admin.ts filterDbJob() +
// js/admin_modal/dbfilter.ts (renderDbFilters). Root bugs pinned here:
//   - TERBANYAK sort was a no-op (return 0) — now sorts DESC by real
//     per-job candidate count
//   - chip filter rows were never rendered (state existed, UI not)
//   - count per row used substring includes() per render — now a tokenized
//     count map (multi-job idLoker counted for every code)
//   - all copy via t() keys in both dicts
// ==========================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import {
  buildCandidateCountMap,
  filterDbJobs,
  sortDbJobs,
  type DbJob,
} from './TabDbJob';
import TabDbJob from './TabDbJob';

// ==========================================
// Harness render — hanya dipakai blok "kontrak tata letak" di bawah. Uji
// helper di atas tidak menyentuhnya (vi.mock diangkat ke atas berkas, dan
// helper-nya murni).
//
// ⚠ Fixture ditulis DI DALAM factory, bukan di const modul: `vi.mock` diangkat
// ke atas blok import, jadi const tingkat-modul belum terinisialisasi saat
// factory pertama kali dipanggil (TDZ). Pola `vi.hoisted` di
// `TabPelamar.test.tsx` dipakai di sana karena store-nya perlu dipegang tes.
// ==========================================
vi.mock('../../store/adminData', () => {
  const row = {
    code: 'TG591ASJ', tsk: 'TSK-A', pekerjaan: 'Kaigo', kategori: 'PERTANIAN',
    lokasi: 'Ibaraki', tahapan: 'OPEN', statusInt: 'OPEN', createdAt: '',
  };
  const payload = { dbJobs: [row], dropdowns: { kategori: ['PERTANIAN'], tahapan: ['OPEN'] } };
  return { adminDataPeek: () => payload, loadAdminData: async () => ({ success: true, ...payload }) };
});
vi.mock('../../store/adminStore', async () => {
  const { atom } = await import('nanostores');
  return { allKandidatList: atom([{ idLoker: 'TG591ASJ' }]), fetchAllKandidat: () => {} };
});
vi.mock('./AdminJobEditModal', () => ({ default: () => null }));
vi.mock('./AdminShareModal', () => ({ default: () => null }));
vi.mock('./MatchmakingModal', () => ({ default: () => null }));
vi.mock('./ListKandidatModal', () => ({ default: () => null }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn() };
});

const job = (p: Partial<DbJob>): DbJob => ({
  code: 'J1',
  tsk: 'TSK-A',
  pekerjaan: 'Kaigo',
  kategori: 'KAIGO',
  lokasi: 'Tokyo',
  tahapan: 'BERKAS',
  statusInt: 'OPEN',
  createdAt: '2026-08-01T00:00:00Z',
  ...p,
});

describe('TabDbJob DB filter/sort (A18)', () => {
  it('buildCandidateCountMap counts per job code, splitting multi-job idLoker', () => {
    const cands = [
      { idLoker: 'J1' },
      { idLoker: 'J1' },
      { idLoker: 'J2' },
      { idLoker: 'J1, J2' }, // kandidat multi-loker dihitung utk setiap kodenya
      { idLoker: '' },
      { idLoker: undefined },
    ];
    const m = buildCandidateCountMap(cands);
    expect(m.J1).toBe(3);
    expect(m.J2).toBe(2);
  });

  it('filterDbJobs: search OR-includes code/tsk/pekerjaan/lokasi (case-insensitive)', () => {
    const jobs = [
      job({ code: 'J1', tsk: 'TSK-A', pekerjaan: 'Kaigo', lokasi: 'Tokyo' }),
      job({ code: 'J2', tsk: 'TSK-B', pekerjaan: 'Kensetsu', lokasi: 'Osaka' }),
    ];
    const byCode = filterDbJobs(jobs, { search: 'j1', bidang: 'ALL', tahapan: 'ALL' });
    expect(byCode.map((j) => j.code)).toEqual(['J1']);
    const byPekerjaan = filterDbJobs(jobs, { search: 'kensetsu', bidang: 'ALL', tahapan: 'ALL' });
    expect(byPekerjaan.map((j) => j.code)).toEqual(['J2']);
    const emptyQ = filterDbJobs(jobs, { search: '', bidang: 'ALL', tahapan: 'ALL' });
    expect(emptyQ.length).toBe(2);
  });

  it('filterDbJobs: bidang/tahapan filter eksak (parity filterDbJob)', () => {
    const jobs = [
      job({ code: 'J1', kategori: 'KAIGO', tahapan: 'BERKAS' }),
      job({ code: 'J2', kategori: 'KENSETSU', tahapan: 'BERKAS' }),
      job({ code: 'J3', kategori: 'KAIGO', tahapan: 'COE' }),
    ];
    expect(filterDbJobs(jobs, { search: '', bidang: 'KAIGO', tahapan: 'ALL' }).map((j) => j.code)).toEqual(['J1', 'J3']);
    expect(filterDbJobs(jobs, { search: '', bidang: 'ALL', tahapan: 'BERKAS' }).map((j) => j.code)).toEqual(['J1', 'J2']);
    expect(filterDbJobs(jobs, { search: '', bidang: 'KAIGO', tahapan: 'COE' }).map((j) => j.code)).toEqual(['J3']);
    expect(filterDbJobs(jobs, { search: '', bidang: 'NONE', tahapan: 'ALL' })).toEqual([]);
  });

  it('sortDbJobs TERBANYAK = jumlah kandidat DESC (no-op lama jadi sort nyata)', () => {
    const jobs = [job({ code: 'J1' }), job({ code: 'J2' }), job({ code: 'J3' })];
    const countMap = { J1: 1, J2: 9, J3: 4 };
    expect(sortDbJobs(jobs, 'TERBANYAK', countMap).map((j) => j.code)).toEqual(['J2', 'J3', 'J1']);
    // tanpa kandidat → 0 (stable sort pertahankan urutan input utk nilai sama)
    const countMap2 = { J2: 9 };
    expect(sortDbJobs(jobs, 'TERBANYAK', countMap2).map((j) => j.code)).toEqual(['J2', 'J1', 'J3']);
  });

  it('sortDbJobs TERBARU/TERLAMA by createdAt with code tie-break (parity)', () => {
    const jobs = [
      job({ code: 'A1', createdAt: '2026-08-01T00:00:00Z' }),
      job({ code: 'B2', createdAt: '2026-08-03T00:00:00Z' }),
      job({ code: 'C3', createdAt: '2026-08-02T00:00:00Z' }),
      job({ code: 'D4', createdAt: '' }),
    ];
    expect(sortDbJobs(jobs, 'TERBARU', {}).map((j) => j.code)).toEqual(['B2', 'C3', 'A1', 'D4']);
    expect(sortDbJobs(jobs, 'TERLAMA', {}).map((j) => j.code)).toEqual(['D4', 'A1', 'C3', 'B2']);
    // tie/NaN → code ascending (TERLAMA) / descending (TERBARU)
    const ties = [
      job({ code: 'X1', createdAt: '2026-08-01T00:00:00Z' }),
      job({ code: 'X2', createdAt: '2026-08-01T00:00:00Z' }),
    ];
    expect(sortDbJobs(ties, 'TERLAMA', {}).map((j) => j.code)).toEqual(['X1', 'X2']);
    expect(sortDbJobs(ties, 'TERBARU', {}).map((j) => j.code)).toEqual(['X2', 'X1']);
  });

  it('TERBARU memakai nomor kode, bukan urutan string (TG158 di atas TG9)', () => {
    // MEASURED 2026-10-09: kolom `created_at` tidak ada di tabel
    // `job_database`, jadi createdAt SELALU kosong dan tie-break inilah yang
    // selalu jalan. Dengan
    // localeCompare, 'TG9ASJ' > 'TG158ASJ' sebagai string sehingga job
    // terbaru tidak pernah muncul paling atas.
    const jobs = [
      job({ code: 'TG9ASJ', createdAt: '' }),
      job({ code: 'TG158ASJ', createdAt: '' }),
      job({ code: 'TG100ASJ', createdAt: '' }),
    ];
    expect(sortDbJobs(jobs, 'TERBARU', {}).map((j) => j.code)).toEqual(['TG158ASJ', 'TG100ASJ', 'TG9ASJ']);
    expect(sortDbJobs(jobs, 'TERLAMA', {}).map((j) => j.code)).toEqual(['TG9ASJ', 'TG100ASJ', 'TG158ASJ']);
  });


  it('sortDbJobs tidak memutasi array asli', () => {
    const jobs = [job({ code: 'J2' }), job({ code: 'J1' })];
    sortDbJobs(jobs, 'TERBARU', {});
    expect(jobs.map((j) => j.code)).toEqual(['J2', 'J1']);
  });
});

// ==========================================
// TESTS: kontrak tata letak yang DIUKUR di browser (2026-10-22)
//
// jsdom tidak menerapkan CSS, jadi lebar piksel tidak bisa diperiksa di sini.
// Yang dijaga adalah MEKANISME yang membuat lebar itu benar; angkanya diukur
// dengan probe Playwright di 390px/1280px (sweep polish, 34 permukaan):
//
//   sebelum  · input cari 182px, placeholder 163px terpotong 25px
//            · tombol jumlah pelamar 40×40 (lantai 44px)
//   sesudah  · input cari selebar baris (≥300px), placeholder utuh
//            · tombol 44×44
//
// Kalau kelas di bawah dikembalikan seperti semula, cacatnya kembali — dan
// tes ini merah lebih dulu daripada laporan pengguna.
// ==========================================
describe('TabDbJob — kontrak tata letak (diukur 2026-10-22)', () => {
  afterEach(() => cleanup());

  it('kotak cari selebar baris di mobile dan tidak bisa diremas flex', () => {
    const { container } = render(<TabDbJob />);
    const input = container.querySelector('input[placeholder="db.placeholder_search"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const wrap = input.parentElement as HTMLElement;
    // `flex-1` = flex: 1 1 0% ⇒ basis 0 + shrink 1 = kotak diremas sampai
    // 182px di 390px (dan ~93px di 1280px sebelum `md:shrink-0`).
    expect(wrap.className).not.toContain('flex-1');
    expect(wrap.className).toContain('w-full');
    // 288px hanya di ≥sm; `shrink-0` yang menahan remasan di baris judul.
    expect(wrap.className).toContain('sm:w-72');
    expect(wrap.className).toContain('sm:shrink-0');
  });

  it('tombol jumlah pelamar punya lantai sasaran sentuh 44px', () => {
    const { container } = render(<TabDbJob />);
    const btn = [...container.querySelectorAll('button')]
      .find((b) => (b.textContent || '').trim() === '1');
    // Gagal di sini = fixture-nya yang salah, bukan kelasnya. Dilempar supaya
    // pesannya jelas, dan supaya tidak perlu `!` (dilarang lint-ratchet).
    if (!btn) throw new Error('tombol jumlah pelamar (teks "1") tidak dirender');
    expect(btn.className).toContain('min-h-11');
    expect(btn.className).toContain('min-w-11');
  });
});
